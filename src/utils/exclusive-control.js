/**
 * @fileoverview 排他制御ユーティリティ - スプレッドシートの排他制御機能
 * 
 * 特徴:
 * - タイムスタンプ付きマーカーの生成と解析
 * - 機能別のタイムアウト設定
 * - カスタマイズ可能なマーカーフォーマット
 * - 拡張可能な検証ロジック
 */

export class ExclusiveControl {
  /**
   * コンストラクタ
   * @param {Object} config - 設定オブジェクト
   */
  constructor(config = {}) {
    // タイムアウト設定（ミリ秒）
    this.timeoutConfig = {
      'Deep Research': 40 * 60 * 1000,    // 40分
      'ディープリサーチ': 40 * 60 * 1000, // 40分（日本語）
      'エージェント': 40 * 60 * 1000,     // 40分
      'エージェントモード': 40 * 60 * 1000, // 40分
      'Canvas': 10 * 60 * 1000,           // 10分
      'ウェブ検索': 8 * 60 * 1000,        // 8分
      'Web Search': 8 * 60 * 1000,        // 8分
      '通常': 5 * 60 * 1000,              // 5分
      'default': 5 * 60 * 1000,           // 5分（デフォルト）
      ...config.timeouts // カスタムタイムアウトで上書き可能
    };

    // マーカーフォーマット設定
    this.markerFormat = {
      prefix: '現在操作中です',
      separator: '_',
      includeTimestamp: true,
      includePCId: true,
      includeFunction: false, // 機能名を含めるかどうか
      ...config.markerFormat
    };

    // バリデーター（拡張用）
    this.validators = {};
    
    // ロガー
    this.logger = config.logger || console;
  }

  /**
   * 排他制御マーカーを作成
   * @param {string} pcId - PC識別子
   * @param {Object} additionalData - 追加データ
   * @returns {string} マーカー文字列
   */
  createMarker(pcId, additionalData = {}) {
    const parts = [];

    // プレフィックス
    parts.push(this.markerFormat.prefix);

    // タイムスタンプ（日本時間）
    if (this.markerFormat.includeTimestamp) {
      const now = new Date();
      const jstOffset = 9 * 60 * 60 * 1000; // +9時間をミリ秒に変換
      const jstDate = new Date(now.getTime() + jstOffset);
      
      // 日付部分 (YYYY-MM-DD)
      const dateStr = jstDate.toISOString().split('T')[0];
      parts.push(dateStr);
      
      // 時間部分 (HH:MM:SS)
      const timeStr = jstDate.toISOString().split('T')[1].split('.')[0];
      parts.push(timeStr);
    }

    // PC識別子
    if (this.markerFormat.includePCId) {
      parts.push(pcId);
    }

    // 機能名（オプション）
    if (this.markerFormat.includeFunction && additionalData.function) {
      parts.push(additionalData.function);
    }

    // 追加のカスタムデータ
    if (additionalData.custom) {
      parts.push(additionalData.custom);
    }

    return parts.join(this.markerFormat.separator);
  }

  /**
   * マーカーを解析
   * @param {string} marker - マーカー文字列
   * @returns {Object|null} 解析結果
   */
  parseMarker(marker) {
    if (!marker || typeof marker !== 'string') {
      return null;
    }

    // マーカーパターン: 現在操作中です_タイムスタンプ_PC識別子_機能名（オプション）
    const parts = marker.split(this.markerFormat.separator);
    
    if (parts.length >= 3) {
      const timestamp = parts[1];
      const pcId = parts[2];
      const functionName = parts.length >= 4 ? parts[3] : null;
      
        try {
          const timestampDate = new Date(timestamp);
          const age = Date.now() - timestampDate.getTime();
          
          return {
            original: marker,
            timestamp: timestampDate,
            timestampString: timestamp,
            pcId: pcId,
            functionName: functionName,
            age: age,
            ageMinutes: Math.floor(age / (60 * 1000)),
            isValid: !isNaN(timestampDate.getTime())
          };
        } catch (error) {
          this.logger.warn('[ExclusiveControl] マーカー解析エラー:', error);
          return null;
        }
      }

    // 旧形式のマーカー（タイムスタンプなし）の場合
    if (marker === this.markerFormat.prefix || marker === '現在操作中です') {
      return {
        original: marker,
        timestamp: null,
        pcId: 'unknown',
        age: Infinity, // 古いものとして扱う
        ageMinutes: Infinity,
        isValid: false,
        isLegacy: true
      };
    }

    return null;
  }

  /**
   * マーカーがタイムアウトしているか判定
   * @param {string} marker - マーカー文字列
   * @param {Object} task - タスクオブジェクト
   * @param {Object} customRules - カスタムルール
   * @returns {boolean} タイムアウトしている場合true
   */
  isTimeout(marker, task, customRules = {}) {
    const parsed = this.parseMarker(marker);
    
    if (!parsed) {
      // 解析できない場合はタイムアウトとみなす
      return true;
    }

    // 旧形式のマーカーは即座にタイムアウト
    if (parsed.isLegacy) {
      this.logger.log('[ExclusiveControl] 旧形式マーカーを検出 - タイムアウトとして処理');
      return true;
    }

    // 機能名を取得（タスクから、またはマーカーから）
    const functionName = task?.function || task?.displayedFunction || parsed.functionName || 'default';
    
    // タイムアウト時間を決定（優先順位: カスタムルール > 機能別設定 > デフォルト）
    const timeout = customRules[functionName] || 
                   this.timeoutConfig[functionName] || 
                   this.timeoutConfig.default;
    
    const isTimedOut = parsed.age > timeout;
    
    if (isTimedOut) {
      this.logger.log(`[ExclusiveControl] マーカータイムアウト検出:`, {
        cell: `${task?.column}${task?.row}`,
        function: functionName,
        ageMinutes: parsed.ageMinutes,
        timeoutMinutes: Math.floor(timeout / (60 * 1000)),
        pcId: parsed.pcId
      });
    }
    
    return isTimedOut;
  }

  /**
   * マーカーが有効かチェック
   * @param {string} marker - マーカー文字列
   * @returns {boolean} 有効な場合true
   */
  isValidMarker(marker) {
    const parsed = this.parseMarker(marker);
    return parsed && parsed.isValid && !parsed.isLegacy;
  }

  /**
   * マーカーの年齢を取得（分単位）
   * @param {string} marker - マーカー文字列
   * @returns {number} 年齢（分）
   */
  getMarkerAge(marker) {
    const parsed = this.parseMarker(marker);
    return parsed ? parsed.ageMinutes : Infinity;
  }

  /**
   * 特定のPC IDのマーカーかチェック
   * @param {string} marker - マーカー文字列
   * @param {string} pcId - チェックするPC ID
   * @returns {boolean} 一致する場合true
   */
  isMarkerFromPC(marker, pcId) {
    const parsed = this.parseMarker(marker);
    return parsed && parsed.pcId === pcId;
  }

  /**
   * バリデーターを追加（拡張用）
   * @param {string} name - バリデーター名
   * @param {Function} validatorFn - バリデーター関数
   */
  addValidator(name, validatorFn) {
    this.validators[name] = validatorFn;
  }

  /**
   * カスタムバリデーションを実行
   * @param {string} marker - マーカー文字列
   * @param {Object} context - コンテキスト
   * @returns {boolean} 有効な場合true
   */
  runValidators(marker, context = {}) {
    for (const [name, validator] of Object.entries(this.validators)) {
      if (!validator(marker, context)) {
        this.logger.log(`[ExclusiveControl] バリデーション失敗: ${name}`);
        return false;
      }
    }
    return true;
  }

  /**
   * タイムアウト設定を更新
   * @param {string} functionName - 機能名
   * @param {number} timeoutMs - タイムアウト時間（ミリ秒）
   */
  updateTimeout(functionName, timeoutMs) {
    this.timeoutConfig[functionName] = timeoutMs;
    this.logger.log(`[ExclusiveControl] タイムアウト更新: ${functionName} = ${timeoutMs}ms`);
  }

  /**
   * 推奨待機時間を取得
   * @param {string} marker - マーカー文字列
   * @param {Object} task - タスクオブジェクト
   * @returns {number} 推奨待機時間（ミリ秒）
   */
  getRecommendedWaitTime(marker, task) {
    const parsed = this.parseMarker(marker);
    
    if (!parsed || parsed.isLegacy) {
      return 0; // 即座に処理可能
    }

    const functionName = task?.function || parsed.functionName || 'default';
    const timeout = this.timeoutConfig[functionName] || this.timeoutConfig.default;
    const remaining = timeout - parsed.age;
    
    // 残り時間がある場合はその時間、ない場合は0
    return Math.max(0, remaining);
  }

  /**
   * マーカー情報をログ用に整形
   * @param {string} marker - マーカー文字列
   * @returns {Object} ログ用情報
   */
  formatMarkerForLog(marker) {
    const parsed = this.parseMarker(marker);
    
    if (!parsed) {
      return { 
        status: 'invalid',
        marker: marker 
      };
    }

    return {
      status: parsed.isLegacy ? 'legacy' : 'valid',
      pcId: parsed.pcId,
      ageMinutes: parsed.ageMinutes,
      timestamp: parsed.timestampString,
      function: parsed.functionName,
      isTimeout: parsed.age > (this.timeoutConfig.default)
    };
  }
}

// デフォルトインスタンスをエクスポート
export const exclusiveControl = new ExclusiveControl();