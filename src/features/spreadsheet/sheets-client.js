// sheets-client.js - Google Sheets APIクライアント
import { sleep } from '../../utils/sleep-utils.js';

class SheetsClient {
  constructor() {
    this.baseUrl = "https://sheets.googleapis.com/v4/spreadsheets";
    this.logger = typeof logger !== "undefined" ? logger : console;
    
    // Google Sheets API制限
    this.limits = {
      maxCellCharacters: 50000,      // 単一セルの最大文字数
      maxApiRequestSize: 10485760,   // API リクエストの最大サイズ（10MB）
      maxBatchUpdates: 100           // バッチ更新の最大件数
    };
    
    // クォータ管理と監視
    this.quotaManager = {
      lastRequestTime: 0,
      requestCount: 0,
      windowStart: Date.now(),
      quotaErrors: 0,
      backoffMultiplier: 1,
      minInterval: 1000, // 最小リクエスト間隔 (1秒)
      maxInterval: 60000, // 最大リクエスト間隔 (1分)
      windowDuration: 60000 // ウィンドウ期間 (1分)
    };
    
    // エラー監視と統計
    this.errorMonitor = {
      totalErrors: 0,
      quotaErrors: 0,
      timeoutErrors: 0,
      otherErrors: 0,
      lastErrorTime: 0,
      errorHistory: [], // 最新100件のエラー履歴
      maxHistorySize: 100,
      recoveryAttempts: 0,
      successfulRecoveries: 0
    };
  }

  /**
   * エラーを監視・記録
   * @param {Error} error - エラーオブジェクト
   * @param {string} context - エラー発生コンテキスト
   */
  recordError(error, context = 'unknown') {
    const now = Date.now();
    this.errorMonitor.totalErrors++;
    this.errorMonitor.lastErrorTime = now;
    
    // エラータイプ別の統計
    if (this.isQuotaError(error)) {
      this.errorMonitor.quotaErrors++;
    } else if (error.name === 'TimeoutError' || error.message.includes('timeout')) {
      this.errorMonitor.timeoutErrors++;
    } else {
      this.errorMonitor.otherErrors++;
    }
    
    // エラー履歴に追加
    const errorRecord = {
      timestamp: now,
      context: context,
      type: this.isQuotaError(error) ? 'quota' : 
            error.name === 'TimeoutError' ? 'timeout' : 'other',
      message: error.message,
      name: error.name,
      httpStatus: error.status || null
    };
    
    this.errorMonitor.errorHistory.push(errorRecord);
    
    // 履歴サイズを制限
    if (this.errorMonitor.errorHistory.length > this.errorMonitor.maxHistorySize) {
      this.errorMonitor.errorHistory.shift();
    }
  }

  /**
   * エラー統計情報を取得
   * @returns {Object} エラー統計
   */
  getErrorStats() {
    const recentErrors = this.errorMonitor.errorHistory.filter(
      error => Date.now() - error.timestamp < 60 * 60 * 1000 // 1時間以内
    );
    
    return {
      total: this.errorMonitor.totalErrors,
      quota: this.errorMonitor.quotaErrors,
      timeout: this.errorMonitor.timeoutErrors,
      other: this.errorMonitor.otherErrors,
      lastErrorTime: this.errorMonitor.lastErrorTime,
      recentErrorCount: recentErrors.length,
      recoveryAttempts: this.errorMonitor.recoveryAttempts,
      successfulRecoveries: this.errorMonitor.successfulRecoveries,
      recoveryRate: this.errorMonitor.recoveryAttempts > 0 ? 
        (this.errorMonitor.successfulRecoveries / this.errorMonitor.recoveryAttempts * 100).toFixed(2) + '%' : 
        'N/A',
      quotaManagerStatus: {
        backoffMultiplier: this.quotaManager.backoffMultiplier,
        requestCount: this.quotaManager.requestCount,
        currentInterval: this.quotaManager.minInterval * this.quotaManager.backoffMultiplier
      }
    };
  }

  /**
   * システムの健康状態をチェック
   * @returns {Object} 健康状態情報
   */
  getHealthStatus() {
    const now = Date.now();
    const recentErrorWindow = 5 * 60 * 1000; // 5分
    const recentErrors = this.errorMonitor.errorHistory.filter(
      error => now - error.timestamp < recentErrorWindow
    );
    
    const status = {
      healthy: true,
      level: 'good', // good, warning, critical
      issues: [],
      recommendations: []
    };
    
    // 最近のエラー頻度チェック
    if (recentErrors.length > 10) {
      status.healthy = false;
      status.level = 'critical';
      status.issues.push(`直近5分で${recentErrors.length}件のエラーが発生`);
      status.recommendations.push('一時的な処理停止を推奨');
    } else if (recentErrors.length > 5) {
      status.level = 'warning';
      status.issues.push(`直近5分で${recentErrors.length}件のエラーが発生`);
      status.recommendations.push('処理頻度の調整を推奨');
    }
    
    // クォータエラーの頻度チェック
    const recentQuotaErrors = recentErrors.filter(e => e.type === 'quota');
    if (recentQuotaErrors.length > 3) {
      status.healthy = false;
      status.level = 'critical';
      status.issues.push(`クォータエラーが頻発: ${recentQuotaErrors.length}件`);
      status.recommendations.push('API使用量の大幅削減が必要');
    }
    
    // バックオフ状態チェック
    if (this.quotaManager.backoffMultiplier > 5) {
      status.level = status.level === 'critical' ? 'critical' : 'warning';
      status.issues.push(`高いバックオフ倍率: ${this.quotaManager.backoffMultiplier}x`);
      status.recommendations.push('システム負荷軽減のため処理間隔の延長');
    }
    
    return status;
  }

  /**
   * クォータエラーを検出
   * @param {Object} error - API エラーオブジェクト
   * @returns {boolean} クォータエラーかどうか
   */
  isQuotaError(error) {
    const errorMessage = error?.error?.message || error?.message || '';
    return errorMessage.includes('Quota exceeded') || 
           errorMessage.includes('quota') ||
           errorMessage.includes('rateLimitExceeded');
  }

  /**
   * APIリクエスト前の待機処理
   * クォータ制限を考慮した適切な間隔を確保
   * @returns {Promise<void>}
   */
  async waitForQuota() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.quotaManager.lastRequestTime;
    
    // ウィンドウをリセット（1分経過した場合）
    if (now - this.quotaManager.windowStart >= this.quotaManager.windowDuration) {
      this.quotaManager.requestCount = 0;
      this.quotaManager.windowStart = now;
      
      // エラーがしばらく発生していない場合のみバックオフを減少
      const timeSinceLastError = now - this.errorMonitor.lastErrorTime;
      if (timeSinceLastError > 60000) { // 1分以上エラーなし
        this.quotaManager.backoffMultiplier = Math.max(1, this.quotaManager.backoffMultiplier * 0.9);
      }
    }
    
    // クォータエラーが最近発生した場合のみ待機
    const shouldWait = this.quotaManager.backoffMultiplier > 1 || this.quotaManager.quotaErrors > 0;
    
    if (shouldWait) {
      // 必要な待機時間を計算
      const requiredInterval = Math.min(
        this.quotaManager.minInterval * this.quotaManager.backoffMultiplier,
        this.quotaManager.maxInterval
      );
      
      if (timeSinceLastRequest < requiredInterval) {
        const waitTime = requiredInterval - timeSinceLastRequest;
        this.detailedLog('info', `クォータ制限対応で待機中: ${waitTime}ms`, {
          requestCount: this.quotaManager.requestCount,
          backoffMultiplier: this.quotaManager.backoffMultiplier,
          quotaErrors: this.quotaManager.quotaErrors,
          reason: 'quota_error_detected'
        });
        await sleep(waitTime);
      }
    }
    
    this.quotaManager.lastRequestTime = Date.now();
    this.quotaManager.requestCount++;
  }

  /**
   * クォータエラー発生時の処理
   * @param {Object} error - エラーオブジェクト
   */
  handleQuotaError(error) {
    this.quotaManager.quotaErrors++;
    this.quotaManager.backoffMultiplier = Math.min(
      this.quotaManager.backoffMultiplier * 2,
      10 // 最大10倍まで
    );
    
    this.detailedLog('warn', `クォータエラーを検出: バックオフ倍率を調整`, {
      quotaErrors: this.quotaManager.quotaErrors,
      newBackoffMultiplier: this.quotaManager.backoffMultiplier,
      nextMinInterval: this.quotaManager.minInterval * this.quotaManager.backoffMultiplier
    });
  }

  /**
   * APIリクエストをクォータ管理付きで実行
   * @param {Function} requestFunc - 実行するAPIリクエスト関数
   * @param {string} requestType - リクエストタイプ（ログ用）
   * @returns {Promise} リクエスト結果
   */
  async executeWithQuotaManagement(requestFunc, requestType = 'unknown') {
    let lastError;
    const maxRetries = 3;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // 初回または成功が続いている場合は待機しない
        if (attempt === 1 && this.quotaManager.backoffMultiplier === 1) {
          // 待機なしで直接実行
        } else {
          // リトライ時またはエラー後は待機
          await this.waitForQuota();
        }
        
        const result = await requestFunc();
        
        // 成功時の処理
        if (attempt > 1) {
          this.errorMonitor.successfulRecoveries++;
          this.detailedLog('info', `リトライ成功: ${requestType}`, {
            attempt,
            recoveryAttempts: this.errorMonitor.recoveryAttempts,
            successfulRecoveries: this.errorMonitor.successfulRecoveries
          });
        }
        
        // 成功が続いた場合、バックオフを徐々にリセット
        if (this.quotaManager.backoffMultiplier > 1) {
          this.quotaManager.backoffMultiplier = Math.max(1, this.quotaManager.backoffMultiplier * 0.8);
          if (this.quotaManager.backoffMultiplier === 1) {
            this.quotaManager.quotaErrors = 0; // エラーカウンタもリセット
            this.detailedLog('info', 'クォータ制限が解除されました');
          }
        }
        
        return result;
      } catch (error) {
        lastError = error;
        
        // エラーを記録
        this.recordError(error, requestType);
        
        if (this.isQuotaError(error)) {
          this.handleQuotaError(error);
          this.errorMonitor.recoveryAttempts++;
          
          if (attempt < maxRetries) {
            // Retry-Afterヘッダーをチェック
            let retryDelay;
            const retryAfter = error.response?.headers?.['retry-after'];
            
            if (retryAfter) {
              // Retry-Afterヘッダーがある場合はそれに従う
              retryDelay = parseInt(retryAfter) * 1000; // 秒をミリ秒に変換
              this.detailedLog('info', `Retry-Afterヘッダーを検出: ${retryAfter}秒後に再試行`);
            } else {
              // エクスポネンシャル・バックオフ
              retryDelay = Math.min(
                5000 * Math.pow(2, attempt - 1),
                60000 // 最大1分
              );
            }
            
            this.detailedLog('warn', `クォータエラー - リトライ ${attempt}/${maxRetries}`, {
              requestType,
              attempt,
              retryDelay,
              hasRetryAfter: !!retryAfter,
              error: error,
              errorStats: this.getErrorStats()
            });
            
            await sleep(retryDelay);
            continue;
          }
        }
        
        // 致命的な状況のチェック
        const healthStatus = this.getHealthStatus();
        if (!healthStatus.healthy) {
          this.detailedLog('error', `システム健康状態が悪化`, {
            requestType,
            healthStatus,
            errorStats: this.getErrorStats()
          });
        }
        
        // クォータエラー以外、または最大リトライ回数に達した場合はそのまま投げる
        throw error;
      }
    }
    
    throw lastError;
  }

  /**
   * データサイズを検証
   * @param {*} value - 検証する値
   * @param {string} range - セル範囲（ログ用）
   * @returns {Object} 検証結果
   */
  validateDataSize(value, range) {
    const valueStr = String(value);
    const byteSize = new TextEncoder().encode(JSON.stringify({values: [[value]]})).length;
    
    const result = {
      isValid: true,
      warnings: [],
      errors: [],
      stats: {
        characterCount: valueStr.length,
        byteSize: byteSize,
        range: range
      }
    };

    // 文字数チェック
    if (valueStr.length > this.limits.maxCellCharacters) {
      result.isValid = false;
      result.errors.push(`文字数制限超過: ${valueStr.length}文字 (制限: ${this.limits.maxCellCharacters}文字)`);
    } else if (valueStr.length > this.limits.maxCellCharacters * 0.9) {
      result.warnings.push(`文字数が制限の90%を超過: ${valueStr.length}文字`);
    }

    // APIリクエストサイズチェック
    if (byteSize > this.limits.maxApiRequestSize) {
      result.isValid = false;
      result.errors.push(`リクエストサイズ制限超過: ${byteSize}バイト (制限: ${this.limits.maxApiRequestSize}バイト)`);
    }

    return result;
  }

  /**
   * 詳細ログを出力
   * @param {string} level - ログレベル (info, warn, error)
   * @param {string} message - メッセージ
   * @param {Object} data - 追加データ
   */
  detailedLog(level, message, data = {}) {
    const timestamp = new Date().toISOString();
    
    // データを安全にシリアライズ
    const logData = {
      timestamp,
      level,
      message,
      ...this.safeSerialize(data)
    };

    if (level === 'error') {
      console.error(`[SheetsClient] ❌ ${message}`, logData);
    } else if (level === 'warn') {
      console.warn(`[SheetsClient] ⚠️ ${message}`, logData);
    } else {
      console.log(`[SheetsClient] ✅ ${message}`, logData);
    }

    // 既存のloggerも使用
    this.logger.log?.("SheetsClient", message, logData);
  }

  /**
   * オブジェクトを安全にシリアライズ
   * [object Object] エラーを防ぐため
   * @param {*} data - シリアライズするデータ
   * @returns {Object} 安全にシリアライズされたデータ
   */
  safeSerialize(data) {
    try {
      if (!data || typeof data !== 'object') {
        return data;
      }

      const result = {};
      for (const [key, value] of Object.entries(data)) {
        if (value instanceof Error) {
          // エラーオブジェクトを適切に処理
          result[key] = {
            name: value.name,
            message: value.message,
            stack: value.stack,
            ...(value.response ? { response: this.safeSerialize(value.response) } : {})
          };
        } else if (value && typeof value === 'object') {
          try {
            // 循環参照を避けてJSONシリアライズ可能かチェック
            JSON.stringify(value);
            result[key] = value;
          } catch {
            // シリアライズ不可能な場合は文字列に変換
            result[key] = String(value);
          }
        } else {
          result[key] = value;
        }
      }
      return result;
    } catch (error) {
      // フォールバック
      return { serialized: String(data), serializationError: error.message };
    }
  }

  /**
   * 書き込み後の検証を実行
   * @param {string} spreadsheetId - スプレッドシートID
   * @param {string} range - セル範囲
   * @param {*} originalValue - 元の書き込み値
   * @param {string} gid - シートGID
   * @returns {Promise<Object>} 検証結果
   */
  async verifyWrittenData(spreadsheetId, range, originalValue, gid = null) {
    try {
      // 少し待機してからデータを取得（API遅延を考慮）
      await sleep(1000);
      
      // 実際のセル内容を取得
      const actualData = await this.getSheetData(spreadsheetId, range, gid);
      const actualValue = actualData?.[0]?.[0] || '';
      const originalStr = String(originalValue);
      
      const result = {
        isMatch: false,
        truncated: false,
        stats: {
          original: {
            length: originalStr.length,
            preview: originalStr.substring(0, 100) + (originalStr.length > 100 ? '...' : '')
          },
          actual: {
            length: actualValue.length,
            preview: actualValue.substring(0, 100) + (actualValue.length > 100 ? '...' : '')
          },
          range: range
        }
      };

      // 完全一致チェック
      result.isMatch = actualValue === originalStr;
      
      // 切り詰めチェック（実際のデータが短い場合）
      if (!result.isMatch && actualValue.length < originalStr.length) {
        result.truncated = true;
        // 部分一致チェック（先頭部分が一致するか）
        result.partialMatch = originalStr.startsWith(actualValue);
      }

      this.detailedLog(
        result.isMatch ? 'info' : 'warn',
        `書き込み検証: ${result.isMatch ? '完全一致' : result.truncated ? '切り詰め検出' : '不一致'}`,
        result.stats
      );

      return result;
    } catch (error) {
      this.detailedLog('error', `書き込み検証エラー: ${error.message}`, { 
        range, 
        error: error,
        errorType: 'verification_error'
      });
      return {
        isMatch: false,
        error: error.message,
        stats: { range }
      };
    }
  }

  /**
   * 大容量データを分割
   * @param {string} text - 分割するテキスト
   * @param {number} maxChunkSize - 1チャンクの最大サイズ（デフォルト: 45000文字）
   * @returns {Array<string>} 分割されたテキスト配列
   */
  splitLargeText(text, maxChunkSize = 45000) {
    if (text.length <= maxChunkSize) {
      return [text];
    }

    const chunks = [];
    let currentPos = 0;
    
    while (currentPos < text.length) {
      let chunkEnd = Math.min(currentPos + maxChunkSize, text.length);
      
      // 改行やスペースで自然に分割する（可能な場合）
      if (chunkEnd < text.length) {
        const nearbyNewline = text.lastIndexOf('\n', chunkEnd);
        const nearbySpace = text.lastIndexOf(' ', chunkEnd);
        const bestSplit = Math.max(nearbyNewline, nearbySpace);
        
        if (bestSplit > currentPos + maxChunkSize * 0.8) {
          chunkEnd = bestSplit + 1; // 改行/スペースの次の文字から始める
        }
      }
      
      chunks.push(text.substring(currentPos, chunkEnd));
      currentPos = chunkEnd;
    }

    this.detailedLog('info', `大容量データを${chunks.length}個のチャンクに分割`, {
      originalLength: text.length,
      chunkCount: chunks.length,
      chunkSizes: chunks.map(chunk => chunk.length)
    });

    return chunks;
  }

  /**
   * 分割データを複数セルに書き込み
   * @param {string} spreadsheetId - スプレッドシートID
   * @param {string} baseRange - 基準セル範囲（例: "V9"）
   * @param {string} text - 書き込むテキスト
   * @param {string} gid - シートGID
   * @returns {Promise<Object>} 書き込み結果
   */
  async updateCellWithSplitting(spreadsheetId, baseRange, text, gid = null) {
    const chunks = this.splitLargeText(text);
    
    if (chunks.length === 1) {
      // 分割不要な場合は通常の書き込み
      return await this.updateCell(spreadsheetId, baseRange, text, gid);
    }

    // 複数セルに分割書き込み
    const results = [];
    const cellMatch = baseRange.match(/^([A-Z]+)(\d+)$/);
    if (!cellMatch) {
      throw new Error(`無効なセル範囲形式: ${baseRange}`);
    }

    const columnLetter = cellMatch[1];
    const rowNumber = parseInt(cellMatch[2]);

    // 各チャンクを連続する行に書き込み
    for (let i = 0; i < chunks.length; i++) {
      const targetRange = `${columnLetter}${rowNumber + i}`;
      const chunkResult = await this.updateCell(spreadsheetId, targetRange, chunks[i], gid);
      results.push({
        range: targetRange,
        chunkIndex: i,
        chunkSize: chunks[i].length,
        result: chunkResult
      });

      // API レート制限を避けるため待機（クォータ管理により自動調整）
      if (i < chunks.length - 1) {
        await sleep(1000); // 200ms → 1000ms に変更
      }
    }

    this.detailedLog('info', `分割書き込み完了: ${baseRange}から${chunks.length}セル`, {
      baseRange,
      totalChunks: chunks.length,
      results: results.map(r => ({ range: r.range, size: r.chunkSize }))
    });

    return {
      success: true,
      splitMode: true,
      baseRange,
      chunks: results,
      totalChunks: chunks.length
    };
  }

  /**
   * 列名生成関数（A, B, ..., Z, AA, AB, ...）
   */
  getColumnName(index) {
    if (index < 0) return null;
    
    let columnName = '';
    let num = index;
    
    while (num >= 0) {
      columnName = String.fromCharCode(65 + (num % 26)) + columnName;
      num = Math.floor(num / 26) - 1;
      if (num < 0) break;
    }
    
    return columnName;
  }

  /**
   * スプレッドシートのメタデータを取得
   * @param {string} spreadsheetId - スプレッドシートID
   * @returns {Promise<Object>} メタデータ
   */
  async getSpreadsheetMetadata(spreadsheetId) {
    return await this.executeWithQuotaManagement(async () => {
      const token = await globalThis.authService.getAuthToken();
      const url = `${this.baseUrl}/${spreadsheetId}?fields=properties,sheets(properties)`;

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Sheets API error: ${error.error?.message || 'Unknown error'}`);
      }

      return await response.json();
    }, 'getSpreadsheetMetadata');
  }

  /**
   * gidからシート名を取得
   * @param {string} spreadsheetId - スプレッドシートID
   * @param {string} gid - シートのgid
   * @returns {Promise<string|null>} シート名
   */
  async getSheetNameFromGid(spreadsheetId, gid) {
    if (!gid) return null;

    const metadata = await this.getSpreadsheetMetadata(spreadsheetId);
    const targetGidNumber = parseInt(gid);
    const sheet = metadata.sheets?.find(
      (s) => s.properties.sheetId === targetGidNumber,
    );

    return sheet ? sheet.properties.title : null;
  }

  /**
   * スプレッドシートデータを読み込む（キャッシュ機能付き）
   * @param {string} spreadsheetId - スプレッドシートID
   * @param {string} gid - シートのgid
   * @returns {Promise<Object>} 解析されたデータ構造
   */
  async loadSheet(spreadsheetId, gid) {
    return await this.executeWithQuotaManagement(async () => {
      // キャッシュ機能削除 - 常に最新データを取得
      
      // GIDからシート名を取得
      const sheetName = await this.getSheetNameFromGid(spreadsheetId, gid);
      if (!sheetName) {
        throw new Error(`GID ${gid} に対応するシートが見つかりません`);
      }

      // Google Sheets API でデータを取得
      const accessToken = await globalThis.authService.getAuthToken();
      const range = `'${sheetName}'!A1:CZ1000`;
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueRenderOption=FORMATTED_VALUE`;
      
      this.logger.log('SheetsClient', `スプレッドシート読み込み開始: ${sheetName}`);
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      if (!response.ok) {
        const error = await response.text();
        this.detailedLog('error', 'API エラー', {
          error: error,
          errorType: 'load_sheet_error',
          httpStatus: response.status,
          sheetName: sheetName
        });
        throw new Error(`スプレッドシートの読み込みに失敗: ${error}`);
      }

      const result = await response.json();
      
      // values が空の場合は空配列を設定
      const data = result.values || [];
      
      // 無効な行（undefinedやnullを含む行）をフィルタ
      const filteredData = data.filter(row => {
        if (!Array.isArray(row)) return false;
        // 少なくとも1つの有効な値があるかチェック
        return row.some(cell => cell !== undefined && cell !== null && cell !== '');
      });

      const parsedData = this.parseSheetData(filteredData);
      
      // キャッシュ機能削除 - 保存しない

      return parsedData;
    }, 'loadSheet');
  }

  /**
   * スプレッドシートデータを解析
   * @private
   */
  parseSheetData(data) {
    // データ配列の実際のサイズを確認とパディング処理
    if (data.length > 0) {
      const maxColumns = Math.max(...data.map(row => row ? row.length : 0));
      
      // メニュー行の列数を基準にパディング処理
      let targetColumns = maxColumns;
      for (let row of data) {
        if (row && row[0] === "メニュー") {
          targetColumns = row.length;
          break;
        }
      }
      
      // 全ての行をメニュー行の列数に合わせてパディング
      for (let i = 0; i < data.length; i++) {
        if (!data[i]) {
          data[i] = [];
        }
        while (data[i].length < targetColumns) {
          data[i].push("");
        }
      }
      
      this.logger.log("SheetsClient", `データ処理完了: ${data.length}行 x ${targetColumns}列`);
    }

    // データ構造を解析
    const result = {
      menuRow: null,
      controlRow: null,
      aiRow: null,
      modelRow: null,
      taskRow: null,
      columnMapping: {},
      workRows: [],
      rawData: data,
      values: data,  // valuesも含める（互換性のため）
      aiColumns: {}     // aiColumnsも初期化
    };
    
    // SPREADSHEET_CONFIGを使用（グローバル変数またはインポート）
    const config = typeof SPREADSHEET_CONFIG !== "undefined"
        ? SPREADSHEET_CONFIG
        : null;
        
    if (!config) {
      // configがない場合は最小限の構造だけ返す
      this.logger.warn("SheetsClient", "SPREADSHEET_CONFIG が見つかりません。基本構造のみ返します。");
      return result;
    }

    // 各行を解析
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const firstCell = row[0] || "";

      // メニュー行を検索
      if (firstCell === config.rowIdentifiers.menuRow.keyword) {
        result.menuRow = {
          index: i,
          data: row,
        };
        // 列マッピングを作成
        for (let j = 0; j < row.length; j++) {
          const cellValue = row[j];
          const columnLetter = this.getColumnName(j);
          
          // プロンプト列の検出とAI列としての登録（メインのプロンプト列のみ）
          if (cellValue && cellValue === "プロンプト") {
            // AI行の値を確認（AI行が存在する場合）
            let aiType = "single"; // デフォルト
            if (result.aiRow && result.aiRow.data) {
              const aiValue = result.aiRow.data[j]; // プロンプト列自体のAI行の値
              if (aiValue && aiValue.includes("3種類")) {
                aiType = "3type";
              }
            }
            
            // aiColumnsに登録
            result.aiColumns[columnLetter] = {
              index: j,
              letter: columnLetter,
              header: cellValue,
              type: aiType,
              promptDescription: ""
            };
          }
        }
      }

      // モデル行を検索（A列が「モデル」と完全一致）
      if (firstCell === config.rowIdentifiers.modelRow.keyword) {
        result.modelRow = {
          index: i,
          data: row,
        };
        this.logger.log("SheetsClient", `モデル行検出: 行${i + 1}`);
      }

      // 機能行を検索（A列が「機能」と完全一致）
      if (firstCell === config.rowIdentifiers.taskRow.keyword) {
        result.taskRow = {
          index: i,
          data: row,
        };
        this.logger.log("SheetsClient", `機能行検出: 行${i + 1}`);
      }

      // 作業行を検索（A列が「1」から始まる数字）
      if (/^\d+$/.test(firstCell)) {
        result.workRows.push({
          index: i,
          number: i + 1,
          data: row
        });
      }
    }

    // 作業行検出結果をログ出力
    if (result.workRows.length > 0) {
      this.logger.log(
        "SheetsClient",
        `作業行検出: ${result.workRows.length}行を検出`,
      );
    }
    
    // AI列の最終処理（メニュー行とAI行の両方が揃った後）
    if (result.menuRow && result.menuRow.data) {
      const menuRowData = result.menuRow.data;
      const aiRowData = result.aiRow ? result.aiRow.data : [];
      
      for (let j = 0; j < menuRowData.length; j++) {
        const cellValue = menuRowData[j];
        const columnLetter = this.getColumnName(j);
        
        // プロンプト列の検出（メインのプロンプト列のみ）
        if (cellValue && cellValue === "プロンプト") {
          let aiType = "single"; // デフォルト
          
          // AI行の値を確認
          if (aiRowData && aiRowData[j] && aiRowData[j].includes("3種類")) {
            aiType = "3type";
          }
          // メニュー行の次の列をチェック（3種類AIレイアウト）
          else if (
            (menuRowData[j + 1] && menuRowData[j + 1].includes("ChatGPT") &&
             menuRowData[j + 2] && menuRowData[j + 2].includes("Claude") &&
             menuRowData[j + 3] && menuRowData[j + 3].includes("Gemini")) ||
            (menuRowData[j + 1] && menuRowData[j + 1].includes("回答") &&
             menuRowData[j + 2] && menuRowData[j + 2].includes("回答") &&
             menuRowData[j + 3] && menuRowData[j + 3].includes("回答"))
          ) {
            aiType = "3type";
          }
          
          // aiColumnsに登録（上書き）
          result.aiColumns[columnLetter] = {
            index: j,
            letter: columnLetter,
            header: cellValue,
            type: aiType,
            promptDescription: ""
          };
        }
      }
    }

    // AI列の検出結果を集約してログ出力
    const aiColumnCount = Object.keys(result.aiColumns).length;
    if (aiColumnCount > 0) {
      const aiColumnSummary = Object.entries(result.aiColumns)
        .map(([letter, info]) => `${letter}列(${info.type})`)
        .join(', ');
      this.logger.log("SheetsClient", `AI列検出完了: ${aiColumnCount}列 - ${aiColumnSummary}`);
    }

    this.logger.log("SheetsClient", "読み込み完了", result);
    return result;
  }

  /**
   * 複数セルのデータを一括取得（バッチ読み取り）
   * @param {string} spreadsheetId - スプレッドシートID
   * @param {Array<string>} ranges - 取得する範囲の配列（例: ["A1", "B2", "C3"]）
   * @param {string} gid - シートのgid（オプション）
   * @returns {Promise<Object>} 範囲をキーとしたデータのマップ
   */
  async batchGetSheetData(spreadsheetId, ranges, gid = null) {
    if (!ranges || ranges.length === 0) {
      return {};
    }
    
    return await this.executeWithQuotaManagement(async () => {
      // シート名を取得
      let sheetName = null;
      if (gid) {
        sheetName = await this.getSheetNameFromGid(spreadsheetId, gid);
      }
      
      // 範囲にシート名を追加
      const fullRanges = ranges.map(range => {
        if (sheetName && !range.includes("!")) {
          return `'${sheetName}'!${range}`;
        }
        return range;
      });
      
      const token = await globalThis.authService.getAuthToken();
      const rangesParam = fullRanges.map(r => `ranges=${encodeURIComponent(r)}`).join('&');
      const url = `${this.baseUrl}/${spreadsheetId}/values:batchGet?${rangesParam}&valueRenderOption=FORMATTED_VALUE`;
      
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
      
      if (!response.ok) {
        const error = await response.json();
        this.detailedLog('error', `バッチ取得APIエラー`, {
          error: error,
          errorType: 'batch_get_error',
          httpStatus: response.status
        });
        throw new Error(`Sheets API error: ${error.error?.message || 'Unknown error'}`);
      }
      
      const data = await response.json();
      const result = {};
      
      // レスポンスを元の範囲にマッピング
      if (data.valueRanges) {
        data.valueRanges.forEach((valueRange, index) => {
          const originalRange = ranges[index];
          // 行全体のデータを返す（最初のセルだけでなく）
          result[originalRange] = valueRange.values && valueRange.values[0] ? valueRange.values[0] : [];
        });
      }
      
      return result;
    }, 'batchGetSheetData');
  }

  /**
   * スプレッドシートのデータを取得
   * @param {string} spreadsheetId - スプレッドシートID
   * @param {string} range - 取得する範囲（例: "Sheet1!A1:Z100"）
   * @param {string} gid - シートのgid（オプション）
   * @returns {Promise<Array>} セルデータの2次元配列
   */
  async getSheetData(spreadsheetId, range, gid = null) {
    return await this.executeWithQuotaManagement(async () => {
      
      // デバッグログ追加
      console.log(`🔍 [SheetsClient] getSheetData呼び出し:`, {
        spreadsheetId,
        range,
        gid,
        rangeIncludesSheet: range.includes("!")
      });
      
      // gidが指定されている場合、シート名を取得して範囲を更新
      if (gid) {
        const sheetName = await this.getSheetNameFromGid(spreadsheetId, gid);
        if (sheetName) {
          // 範囲にシート名が含まれていない場合は追加
          if (!range.includes("!")) {
            const oldRange = range;
            range = `'${sheetName}'!${range}`;
            console.log(`🔍 [SheetsClient] 範囲にシート名追加: ${oldRange} → ${range}`);
          } else {
            // すでにシート名が含まれている場合は置き換え
            const oldRange = range;
            range = `'${sheetName}'!${range.split("!")[1]}`;
            console.log(`🔍 [SheetsClient] シート名置換: ${oldRange} → ${range}`);
          }
        }
      }

      const token = await globalThis.authService.getAuthToken();
      // valueRenderOptionを追加して、空セルも含めて全データを取得
      const url = `${this.baseUrl}/${spreadsheetId}/values/${encodeURIComponent(range)}?valueRenderOption=FORMATTED_VALUE`;
      
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const error = await response.json();
        this.detailedLog('error', `APIエラー`, {
          error: error,
          errorType: 'get_sheet_data_error',
          httpStatus: response.status,
          range: range
        });
        throw new Error(`Sheets API error: ${error.error?.message || 'Unknown error'}`);
      }

      const data = await response.json();
      
      const result = data.values || [];
      
      // デバッグログ追加
      console.log(`🔍 [SheetsClient] getSheetData結果:`, {
        range,
        hasData: !!data.values,
        resultLength: result.length,
        firstRowLength: result[0]?.length || 0,
        firstCellValue: result[0]?.[0] ? result[0][0].substring(0, 50) : '(空)',
        dataPreview: JSON.stringify(result).substring(0, 200)
      });
      
      return result;
    }, 'getSheetData');
  }

  /**
   * スプレッドシートからAutoAIの作業データを読み込み
   * @param {string} spreadsheetId - スプレッドシートID
   * @param {string} gid - シートのgid（オプション）
   * @returns {Promise<Object>} 解析されたデータ構造
   */
  async loadAutoAIData(spreadsheetId, gid = null) {
    // キャッシュ機能を削除 - 常に最新データを取得
    
    this.logger.log("SheetsClient", `スプレッドシート読み込み開始`);

    // シート名を取得（gidが指定されている場合）
    let sheetName = null;
    
    if (gid) {
      sheetName = await this.getSheetNameFromGid(spreadsheetId, gid);
    }
    
    // シート名が取得できなかった場合、デフォルトでSheet1を使用
    if (!sheetName) {
      sheetName = "Sheet1";  // デフォルトのシート名
    }
    
    // ===== STEP 1: A列のみを読み込んで行構造を把握 =====
    const columnAData = await this.getSheetData(spreadsheetId, "A:A", gid);
    
    // 設定を取得
    const config = typeof SPREADSHEET_CONFIG !== "undefined"
        ? SPREADSHEET_CONFIG
        : null;
        
    if (!config) {
      throw new Error("SPREADSHEET_CONFIG が見つかりません。config.js を読み込んでください。");
    }
    
    // ===== STEP 2: A列から必要な行番号を特定 =====
    let menuRowIndex = -1;
    let controlRowIndex = -1;
    let aiRowIndex = -1;
    let modelRowIndex = -1;
    let taskRowIndex = -1;
    const workRows = [];
    const controlRows = []; // 列制御の可能性がある行（1-10行目）
    
    for (let i = 0; i < columnAData.length; i++) {
      const firstCell = columnAData[i] ? columnAData[i][0] : "";
      
      // 制御行候補（1-10行目）を記録
      if (i < 10) {
        controlRows.push(i);
      }
      
      // メニュー行
      if (firstCell === config.rowIdentifiers.menuRow.keyword) {
        menuRowIndex = i;
      }
      // 制御行
      else if (firstCell === config.rowIdentifiers.controlRow.keyword) {
        controlRowIndex = i;
      }
      // AI行
      else if (firstCell === config.rowIdentifiers.aiRow.keyword) {
        aiRowIndex = i;
      }
      // モデル行
      else if (firstCell === config.rowIdentifiers.modelRow.keyword) {
        modelRowIndex = i;
      }
      // 機能行
      else if (firstCell === config.rowIdentifiers.taskRow.keyword) {
        taskRowIndex = i;
      }
      // 作業行（数字で始まる行）
      else if (/^\d+$/.test(firstCell)) {
        const lastControlRowIndex = Math.max(
          menuRowIndex, controlRowIndex, aiRowIndex, modelRowIndex, taskRowIndex
        );
        if (i > lastControlRowIndex) {
          workRows.push({
            index: i,
            number: i + 1,
            aValue: firstCell
          });
        }
      }
    }
    
    // 解析結果のサマリーログ
    const detectedRows = [
      menuRowIndex >= 0 ? 'メニュー' : null,
      controlRowIndex >= 0 ? '制御' : null,
      aiRowIndex >= 0 ? 'AI' : null,
      modelRowIndex >= 0 ? 'モデル' : null,
      taskRowIndex >= 0 ? '機能' : null
    ].filter(Boolean);
    this.logger.log("SheetsClient", `行構造解析完了: ${detectedRows.join('・')}行検出, 作業行${workRows.length}行`);
    
    // ===== STEP 3: 必要な行だけを読み込み =====
    const rowsToFetch = [];
    const rowLabels = {};
    
    // メニュー行は必須
    if (menuRowIndex >= 0) {
      rowsToFetch.push(menuRowIndex + 1); // 1ベースの行番号
      rowLabels[menuRowIndex + 1] = 'menu';
    } else {
      throw new Error("メニュー行が見つかりません");
    }
    
    // 制御行（明示的な「制御」行）
    if (controlRowIndex >= 0) {
      rowsToFetch.push(controlRowIndex + 1);
      rowLabels[controlRowIndex + 1] = 'control';
    }
    
    // 列制御の可能性がある行（1-10行目）も読み込む
    for (const rowIndex of controlRows) {
      const rowNum = rowIndex + 1;
      if (!rowsToFetch.includes(rowNum)) {
        rowsToFetch.push(rowNum);
        rowLabels[rowNum] = `control_candidate_${rowNum}`;
      }
    }
    
    // AI行（タスクグループ作成時に必要）
    if (aiRowIndex >= 0) {
      rowsToFetch.push(aiRowIndex + 1);
      rowLabels[aiRowIndex + 1] = 'ai';
    }
    
    // モデル行と機能行は実行時に動的取得するため、ここでは読み込まない
    // ただし、位置情報は保持
    
    this.logger.log("SheetsClient", `読み込む行: ${rowsToFetch.join(', ')}`);
    
    // バッチで必要な行を取得
    // 列範囲を明示的に指定して、すべての列データを確実に取得（A列からCZ列まで）
    const ranges = rowsToFetch.map(rowNum => `A${rowNum}:CZ${rowNum}`);
    const batchData = await this.batchGetSheetData(spreadsheetId, ranges, gid);
    
    
    // ===== STEP 4: データ構造を構築 =====
    // メニュー行のデータを取得（新しい範囲形式に対応）
    const menuRowData = batchData[`A${menuRowIndex + 1}:CZ${menuRowIndex + 1}`] || [];
    const maxColumns = menuRowData.length;
    this.logger.log("SheetsClient", `メニュー行の列数: ${maxColumns}列`);
    
    // 他の必要な行データを取得（新しい範囲形式に対応）
    const aiRowData = aiRowIndex >= 0 ? (batchData[`A${aiRowIndex + 1}:CZ${aiRowIndex + 1}`] || []) : [];
    const controlRowData = controlRowIndex >= 0 ? (batchData[`A${controlRowIndex + 1}:CZ${controlRowIndex + 1}`] || []) : [];
    
    // 列制御候補行を収集
    const controlCandidateRows = [];
    for (const rowIndex of controlRows) {
      const rowNum = rowIndex + 1;
      const rowData = batchData[`A${rowNum}:CZ${rowNum}`] || [];
      if (rowData.length > 0) {
        controlCandidateRows.push({
          index: rowIndex,
          data: rowData
        });
      }
    }
    
    // 全ての行データをメニュー行の列数に合わせてパディング
    const paddedRows = {};
    for (const [range, rowData] of Object.entries(batchData)) {
      const paddedRow = [...rowData];
      while (paddedRow.length < maxColumns) {
        paddedRow.push("");
      }
      paddedRows[range] = paddedRow;
    }
    
    // ダミーのrawDataを作成（互換性のため）
    // ただし、必要最小限の行のみ
    const rawData = [];
    const maxRowNum = Math.max(...rowsToFetch);
    for (let i = 0; i < maxRowNum; i++) {
      rawData[i] = new Array(maxColumns).fill("");
    }
    
    // 取得したデータをrawDataに反映
    for (const [range, rowData] of Object.entries(paddedRows)) {
      // 新しい範囲形式（A9:CZ9）から行番号を抽出
      const match = range.match(/A(\d+):CZ\d+/);
      if (match) {
        const rowNum = parseInt(match[1]) - 1; // 0ベースに変換
        if (rowNum >= 0 && rowNum < rawData.length) {
          rawData[rowNum] = rowData;
        }
      }
    }
    
    // A列のデータもrawDataに反映（作業行のため）
    for (let i = 0; i < columnAData.length && i < rawData.length; i++) {
      if (columnAData[i] && columnAData[i][0]) {
        rawData[i][0] = columnAData[i][0];
      }
    }

    // データ構造を解析
    const result = {
      menuRow: null,
      controlRow: null,
      controlCandidateRows: controlCandidateRows, // 列制御候補行を追加
      aiRow: null,
      modelRow: null,
      taskRow: null,
      columnMapping: {},
      workRows: [],
      rawData: rawData,
      values: rawData,  // valuesも含める（互換性のため）
      aiColumns: {},     // aiColumnsも初期化
      sheetName: sheetName  // シート名を追加
    };
    

    // メニュー行を設定
    if (menuRowIndex >= 0) {
      result.menuRow = {
        index: menuRowIndex,
        data: paddedRows[`${menuRowIndex + 1}:${menuRowIndex + 1}`] || menuRowData
      };
      // 列マッピングを作成
      for (let j = 0; j < menuRowData.length; j++) {
        const cellValue = menuRowData[j];
        const columnLetter = this.getColumnName(j);
        
        // プロンプト列の検出とAI列としての登録（メインのプロンプト列のみ）
        if (cellValue && cellValue === "プロンプト") {
          // AI行の値を確認（AI行が存在する場合）
          let aiType = "single"; // デフォルト
          if (aiRowData && aiRowData[j]) {
            const aiValue = aiRowData[j]; // プロンプト列自体のAI行の値
            if (aiValue && aiValue.includes("3種類")) {
              aiType = "3type";
            }
          }
          
          // aiColumnsに登録
          result.aiColumns[columnLetter] = {
            index: j,
            letter: columnLetter,
            header: cellValue,
            type: aiType,
            promptDescription: ""
          };
        }
        
        // columnTypesのマッピング
        for (const [key, columnConfig] of Object.entries(
          config.columnTypes,
        )) {
          if (cellValue === columnConfig.keyword) {
            result.columnMapping[j] = {
              type: columnConfig.type,
              aiType: columnConfig.aiType,
              keyword: columnConfig.keyword,
              columnIndex: j,
            };
          }
        }
      }
    }

    // 制御行を設定
    if (controlRowIndex >= 0) {
      result.controlRow = {
        index: controlRowIndex,
        data: paddedRows[`${controlRowIndex + 1}:${controlRowIndex + 1}`] || controlRowData
      };
    }

    // AI行を設定
    if (aiRowIndex >= 0) {
      result.aiRow = {
        index: aiRowIndex,
        data: paddedRows[`${aiRowIndex + 1}:${aiRowIndex + 1}`] || aiRowData
      };
    }

    // モデル行を設定（位置情報のみ、データは実行時に取得）
    if (modelRowIndex >= 0) {
      result.modelRow = {
        index: modelRowIndex,
        data: null // 実行時に動的取得
      };
      this.logger.log("SheetsClient", `モデル行位置: 行${modelRowIndex + 1}`);
    }

    // 機能行を設定（位置情報のみ、データは実行時に取得）
    if (taskRowIndex >= 0) {
      result.taskRow = {
        index: taskRowIndex,
        data: null // 実行時に動的取得
      };
      this.logger.log("SheetsClient", `機能行位置: 行${taskRowIndex + 1}`);
    }

    // 作業行を設定（A列から収集済み）
    for (const workRowInfo of workRows) {
      const workRow = {
        index: workRowInfo.index,
        number: workRowInfo.number,
        data: rawData[workRowInfo.index] || [], // ダミーデータ
        control: null, // B列の制御情報は実行時に取得
        prompts: {} // プロンプトも実行時に取得
      };
      result.workRows.push(workRow);
    }

    // 作業行検出結果をログ出力
    if (result.workRows.length > 0) {
      this.logger.log(
        "SheetsClient",
        `作業行検出: ${result.workRows.length}行を検出`,
      );
    }
    
    // AI列の最終処理は既に完了済み（メニュー行処理時に実施）

    this.logger.log("SheetsClient", "読み込み完了（効率化版）", {
      menuRowFound: !!result.menuRow,
      workRowsCount: result.workRows.length,
      columnTypes: Object.keys(result.columnMapping).length,
      aiColumnsCount: Object.keys(result.aiColumns).length,
      sheetName: result.sheetName
    });

    // キャッシュ機能削除 - 保存しない

    return result;
  }
  

  /**
   * 単一セルの値を取得
   * @param {string} spreadsheetId - スプレッドシートID
   * @param {string} sheetName - シート名
   * @param {string} cell - セル（例: 'AD9'）
   * @returns {Promise<any>} セルの値
   */
  async getCellValue(spreadsheetId, sheetName, cell) {
    try {
      const token = await globalThis.authService.getAuthToken();
      const range = `'${sheetName}'!${cell}`;
      const url = `${this.baseUrl}/${spreadsheetId}/values/${encodeURIComponent(range)}?valueRenderOption=FORMATTED_VALUE`;
      
      const response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Failed to get cell ${cell}: ${error.error.message}`);
      }

      const data = await response.json();
      // values配列の最初の行の最初の値を返す
      return data.values && data.values[0] && data.values[0][0] ? data.values[0][0] : '';
    } catch (error) {
      this.logger.error('SheetsClient', `セル取得エラー ${cell}:`, error);
      return '';
    }
  }

  /**
   * 複数セルの値を一括取得
   * @param {string} spreadsheetId - スプレッドシートID
   * @param {string} sheetName - シート名
   * @param {Array<string>} cells - セルの配列（例: ['AD9', 'AE9']）
   * @returns {Promise<Object>} セル名をキー、値を値とするオブジェクト
   */
  async getBatchCellValues(spreadsheetId, sheetName, cells) {
    try {
      const token = await globalThis.authService.getAuthToken();
      
      // 各セルに対してrangeを作成
      const ranges = cells.map(cell => `'${sheetName}'!${cell}`);
      const rangesParam = ranges.map(range => encodeURIComponent(range)).join('&ranges=');
      const url = `${this.baseUrl}/${spreadsheetId}/values:batchGet?ranges=${rangesParam}&valueRenderOption=FORMATTED_VALUE`;
      
      const response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Failed to get cells: ${error.error.message}`);
      }

      const data = await response.json();
      const result = {};
      
      // 各範囲の値を対応するセル名にマッピング
      data.valueRanges.forEach((valueRange, index) => {
        const cell = cells[index];
        const value = valueRange.values && valueRange.values[0] && valueRange.values[0][0] 
                      ? valueRange.values[0][0] : '';
        result[cell] = value;
      });
      
      return result;
    } catch (error) {
      this.logger.error('SheetsClient', `バッチセル取得エラー:`, error);
      return {};
    }
  }

  /**
   * セル範囲の値を取得（範囲指定版）
   * @param {string} spreadsheetId - スプレッドシートID
   * @param {string} sheetName - シート名
   * @param {string} range - セル範囲（例: 'AD9:AD20'）
   * @returns {Promise<Array>} セル値の配列
   */
  async getCellValues(spreadsheetId, sheetName, range) {
    try {
      const token = await globalThis.authService.getAuthToken();
      const fullRange = `'${sheetName}'!${range}`;
      const url = `${this.baseUrl}/${spreadsheetId}/values/${encodeURIComponent(fullRange)}?valueRenderOption=FORMATTED_VALUE`;
      
      const response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Failed to get cell range ${range}: ${error.error.message}`);
      }

      const data = await response.json();
      
      // 縦方向の範囲の場合、各行の最初の値を配列として返す
      if (data.values) {
        return data.values.map(row => row[0] || '');
      }
      
      return [];
    } catch (error) {
      this.logger.error('SheetsClient', `セル範囲取得エラー ${range}:`, error);
      return [];
    }
  }

  /**
   * バッチでセルを更新
   * @param {string} spreadsheetId - スプレッドシートID
   * @param {Array<{range: string, values: Array}>} updates - 更新データの配列
   * @returns {Promise<Object>} 更新結果
   */
  async batchUpdate(spreadsheetId, updates) {
    const token = await globalThis.authService.getAuthToken();
    const url = `${this.baseUrl}/${spreadsheetId}/values:batchUpdate`;

    const requestBody = {
      valueInputOption: "USER_ENTERED",
      data: updates,
    };

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Sheets API error: ${error.error.message}`);
    }

    return await response.json();
  }

  /**
   * 単一のセルを更新（改善版）
   * @param {string} spreadsheetId - スプレッドシートID
   * @param {string} range - 更新する範囲（例: "A1"）
   * @param {*} value - 設定する値
   * @param {string} gid - シートのgid（オプション）
   * @param {Object} options - 追加オプション
   * @param {boolean} options.enableValidation - 書き込み検証を有効にする（デフォルト: true）
   * @param {boolean} options.enableSplitting - 大容量データ分割を有効にする（デフォルト: true）
   * @returns {Promise<Object>} 更新結果
   */
  async updateCell(spreadsheetId, range, value, gid = null, options = {}) {
    const {
      enableValidation = true,
      enableSplitting = true
    } = options;

    const startTime = Date.now();

    return await this.executeWithQuotaManagement(async () => {
      try {
        // 1. データサイズ検証
        const validation = this.validateDataSize(value, range);
        
        if (validation.warnings.length > 0) {
          this.detailedLog('warn', `データサイズ警告: ${range}`, validation);
        }

        // 2. 文字数制限チェック
        if (!validation.isValid) {
          if (enableSplitting && validation.errors.some(e => e.includes('文字数制限超過'))) {
            this.detailedLog('info', `大容量データを分割書き込みに切り替え: ${range}`);
            return await this.updateCellWithSplitting(spreadsheetId, range, value, gid);
          } else {
            this.detailedLog('error', `書き込み前検証失敗: ${range}`, validation);
            throw new Error(`データ検証エラー: ${validation.errors.join(', ')}`);
          }
        }

        // 3. シート名の処理
        let processedRange = range;
        if (gid && !range.includes("!")) {
          const sheetName = await this.getSheetNameFromGid(spreadsheetId, gid);
          if (sheetName) {
            processedRange = `'${sheetName}'!${range}`;
          }
        }
        
        // 4. API実行
        const token = await globalThis.authService.getAuthToken();
        const url = `${this.baseUrl}/${spreadsheetId}/values/${encodeURIComponent(processedRange)}?valueInputOption=USER_ENTERED`;

        const requestBody = {
          values: [[value]],
        };

        // [DEBUG] Spreadsheetに書き込むデータのログ
        console.log('🔍 [DEBUG] Spreadsheetに書き込むデータ:', {
          timestamp: new Date().toISOString(),
          range: processedRange,
          valueLength: value?.length || 0,
          valueType: typeof value,
          preview: String(value).substring(0, 500),
          fullValue: value // 実際の値
        });

        this.detailedLog('info', `書き込み実行開始: ${processedRange}`, validation.stats);

        const response = await fetch(url, {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
          const error = await response.json();
          this.detailedLog('error', `API書き込みエラー: ${processedRange}`, {
            status: response.status,
            error: error,
            range: processedRange,
            ...validation.stats
          });
          throw new Error(`Sheets API error: ${error.error?.message || 'Unknown error'}`);
        }

        const result = await response.json();
        
        // 5. 書き込み結果の確認
        const duration = Date.now() - startTime;
        if (result && result.updatedCells) {
          this.detailedLog('info', `書き込み成功: ${processedRange}`, {
            updatedCells: result.updatedCells,
            duration: `${duration}ms`,
            ...validation.stats
          });
        } else {
          this.detailedLog('warn', `書き込み結果が不明: ${processedRange}`, { result, duration });
        }

        // 6. 書き込み後の検証（有効な場合）
        if (enableValidation && result && result.updatedCells) {
          try {
            const verificationResult = await this.verifyWrittenData(spreadsheetId, processedRange, value, gid);
            
            if (!verificationResult.isMatch) {
              if (verificationResult.truncated) {
                this.detailedLog('error', `データ切り詰めを検出: ${processedRange}`, verificationResult.stats);
                // 切り詰めが検出された場合、分割書き込みを試行
                if (enableSplitting) {
                  this.detailedLog('info', `切り詰め対応として分割書き込みを実行: ${processedRange}`);
                  return await this.updateCellWithSplitting(spreadsheetId, range, value, gid);
                }
              } else {
                this.detailedLog('warn', `書き込み内容の不一致を検出: ${processedRange}`, verificationResult.stats);
              }
            }

            return {
              ...result,
              validation: validation,
              verification: verificationResult,
              duration: Date.now() - startTime
            };
          } catch (verifyError) {
            this.detailedLog('warn', `書き込み検証中にエラー: ${verifyError.message}`);
            // 検証エラーでも書き込み自体が成功していれば続行
          }
        }

        return {
          ...result,
          validation: validation,
          duration: Date.now() - startTime
        };

      } catch (error) {
        const duration = Date.now() - startTime;
        this.detailedLog('error', `書き込み処理エラー: ${range}`, {
          error: error,
          duration: `${duration}ms`
        });
        throw error;
      }
    }, 'updateCell');
  }

  /**
   * リッチテキストでセルを更新（リンクを含むテキスト）
   * @param {string} spreadsheetId - スプレッドシートID
   * @param {string} range - 更新する範囲（例: "B5"）
   * @param {Array<Object>} richTextData - リッチテキストデータの配列
   *   [{text: "通常テキスト"}, {text: "リンクテキスト", url: "https://example.com"}, ...]
   * @param {string} gid - シートのgid（オプション）
   * @returns {Promise<Object>} 更新結果
   */
  async updateCellWithRichText(spreadsheetId, range, richTextData, gid = null) {
    const token = await globalThis.authService.getAuthToken();
    
    // 範囲をA1記法からインデックスに変換
    const cellMatch = range.match(/^([A-Z]+)(\d+)$/);
    if (!cellMatch) {
      throw new Error(`Invalid range format: ${range}`);
    }
    
    const columnLetters = cellMatch[1];
    const rowNumber = parseInt(cellMatch[2]);
    
    // 列文字をインデックスに変換（A=0, B=1, ..., Z=25, AA=26, AB=27, AC=28, ...）
    let columnIndex = 0;
    for (let i = 0; i < columnLetters.length; i++) {
      columnIndex = columnIndex * 26 + (columnLetters.charCodeAt(i) - 65 + 1);
    }
    columnIndex--; // 0ベースに調整
    
    // 全体のテキストを構築
    let fullText = '';
    const textFormatRuns = [];
    
    richTextData.forEach(item => {
      const startIndex = fullText.length;
      fullText += item.text || '';
      
      // URLがある場合はリンクとして追加
      if (item.url) {
        textFormatRuns.push({
          startIndex: startIndex,
          format: {
            link: { uri: item.url }
          }
        });
        // リンクの終了位置を指定
        textFormatRuns.push({
          startIndex: fullText.length
        });
      }
    });
    
    // batchUpdate用のリクエスト
    const requests = [{
      updateCells: {
        rows: [{
          values: [{
            userEnteredValue: { 
              stringValue: fullText 
            },
            textFormatRuns: textFormatRuns.length > 0 ? textFormatRuns : undefined
          }]
        }],
        range: {
          sheetId: gid ? parseInt(gid) : 0,
          startRowIndex: rowNumber - 1,  // 0-indexed
          endRowIndex: rowNumber,
          startColumnIndex: columnIndex,
          endColumnIndex: columnIndex + 1
        },
        fields: "userEnteredValue,textFormatRuns"
      }
    }];
    
    const batchUpdateUrl = `${this.baseUrl}/${spreadsheetId}:batchUpdate`;
    
    // デバッグログ追加
    console.log(`🔍 [SheetsClient] updateCellWithRichText実行:`, {
      range,
      columnLetters,
      columnIndex,
      rowNumber,
      fullTextLength: fullText.length,
      fullTextPreview: fullText.substring(0, 100),
      hasLinks: textFormatRuns.length > 0,
      gid,
      sheetId: gid ? parseInt(gid) : 0
    });
    
    const response = await fetch(batchUpdateUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ requests }),
    });
    
    if (!response.ok) {
      const error = await response.json();
      console.error(`❌ [SheetsClient] updateCellWithRichText失敗:`, error);
      throw new Error(`Sheets API batchUpdate error: ${error.error.message}`);
    }
    
    const result = await response.json();
    console.log(`✅ [SheetsClient] updateCellWithRichText成功:`, {
      range,
      updatedCells: result.replies?.[0]?.updateCells?.updatedCells
    });
    
    return result;
  }

  /**
   * スプレッドシートのログをクリア
   * 
   * 【概要】
   * スプレッドシートのメニュー行から「ログ」列を探し、その列の作業行データをクリアする機能。
   * background.jsと連携してA列のデータもクリアされる。
   * 
   * 【依存関係】
   * - loadAutoAIData: スプレッドシートの構造を読み込む
   * - batchUpdate: 複数セルを一括更新
   * - background.js: A列のクリア処理を追加実行
   * 
   * 【前提条件】
   * - メニュー行（1行目）に「ログ」という列が存在すること
   * - 「ログ」は完全一致で検索される（部分一致は不可）
   * - 作業行はメニュー行の「プロンプト」列にデータがある行
   * 
   * 【動作フロー】
   * 1. スプレッドシート全体のデータを読み込み
   * 2. メニュー行から「ログ」列を完全一致で検索
   * 3. 見つかった場合、その列の作業行のセルをクリア
   * 4. background.jsでA列（A2:A1000）も同時にクリア
   * 
   * 【注意事項】
   * - B列固定ではなく、メニュー行の「ログ」を動的に検索
   * - ログ列が見つからない場合はエラーを返す
   * 
   * @param {string} spreadsheetId - スプレッドシートID
   * @param {string} gid - シートのgid（オプション）
   * @returns {Promise<Object>} クリア結果
   */
  async clearSheetLogs(spreadsheetId, gid = null) {
    this.logger.log("SheetsClient", `ログクリア開始: ${spreadsheetId}`);
    
    try {
      // スプレッドシートのデータを読み込み
      const sheetData = await this.loadAutoAIData(spreadsheetId, gid);
      
      // メニュー行から「ログ」列を探す（完全一致）
      let logColumnIndex = -1;
      if (sheetData.menuRow && sheetData.menuRow.data) {
        for (let j = 0; j < sheetData.menuRow.data.length; j++) {
          if (sheetData.menuRow.data[j] === "ログ") {  // 完全一致
            logColumnIndex = j;
            this.logger.log("SheetsClient", `ログ列を検出: ${this.getColumnName(j)}列`);
            break;
          }
        }
      }
      
      if (logColumnIndex === -1) {
        this.logger.warn("SheetsClient", "メニュー行に'ログ'列が見つかりません");
        return { success: false, error: "ログ列が見つかりません" };
      }
      
      const updates = [];
      let clearedCount = 0;
      
      // 作業行のログ列をクリア
      for (const workRow of sheetData.workRows) {
        const rowIndex = workRow.index;
        const columnName = this.getColumnName(logColumnIndex);
        let range;
        
        if (gid) {
          const sheetName = await this.getSheetNameFromGid(spreadsheetId, gid);
          range = sheetName ? `'${sheetName}'!${columnName}${rowIndex + 1}` : `${columnName}${rowIndex + 1}`;
        } else {
          range = `${columnName}${rowIndex + 1}`;
        }
        
        updates.push({
          range: range,
          values: [[""]]
        });
        clearedCount++;
      }
      
      if (updates.length > 0) {
        await this.batchUpdate(spreadsheetId, updates);
      }
      
      this.logger.log("SheetsClient", `ログクリア完了: ${clearedCount}個のセル`);
      return { success: true, clearedCount };
      
    } catch (error) {
      this.logger.error("SheetsClient", `ログクリアエラー: ${error.message}`);
      throw error;
    }
  }

  /**
   * AI回答を削除
   * 
   * 【概要】
   * スプレッドシートのAI回答列（Claude、ChatGPT、Gemini等）とA列のデータを削除する機能。
   * メニュー行から各AI名の列を検出し、その列の作業行データをクリアする。
   * 
   * 【依存関係】
   * - loadAutoAIData: スプレッドシートの構造を読み込む
   * - batchUpdate: 複数セルを一括更新
   * - columnMapping: メニュー行の列タイプ判定情報
   * 
   * 【前提条件】
   * - メニュー行にAI名（Claude、ChatGPT、Gemini等）の列が存在
   * - A列は作業行のチェック用（1が入っている行が処理対象）
   * - 作業行はメニュー行の「プロンプト」列にデータがある行
   * 
   * 【動作フロー】
   * 1. スプレッドシート全体のデータを読み込み
   * 2. columnMappingから type="answer" の列を特定
   * 3. 各AI回答列の作業行データをクリア
   * 4. A列（A2:A1000）の全データもクリア
   * 
   * 【削除対象】
   * - 各AI列（Claude、ChatGPT、Gemini等）の回答データ
   * - A列の作業行マーカー（1の値）
   * 
   * 【削除対象外】
   * - メニュー行、制御行、AI行、モデル行、機能行
   * - プロンプト列
   * - ログ列
   * 
   * @param {string} spreadsheetId - スプレッドシートID
   * @param {string} gid - シートのgid（オプション）
   * @returns {Promise<Object>} 削除結果
   */
  async deleteAnswers(spreadsheetId, gid = null) {
    this.logger.log("SheetsClient", `AI回答削除開始: ${spreadsheetId}`);
    
    try {
      // スプレッドシートのデータを読み込み
      const sheetData = await this.loadAutoAIData(spreadsheetId, gid);
      
      // AI回答列を特定して削除
      const updates = [];
      let deletedCount = 0;
      
      // 削除対象の列を特定
      // 対象: 「回答」「ChatGPT回答」「Claude回答」「Gemini回答」の4つの列
      const answerColumns = [];
      
      // メニュー行から削除対象の列を検索
      if (sheetData.menuRow && sheetData.menuRow.data) {
        // 削除対象の列名を定義（完全一致で検索）
        const targetColumns = ["回答", "ChatGPT回答", "Claude回答", "Gemini回答"];
        
        for (let j = 0; j < sheetData.menuRow.data.length; j++) {
          const cellValue = sheetData.menuRow.data[j];
          
          // 削除対象の列名と完全一致するかチェック
          if (targetColumns.includes(cellValue)) {
            answerColumns.push(j);
            this.logger.log("SheetsClient", `削除対象列検出: ${this.getColumnName(j)}列 (${cellValue})`);
          }
        }
        
        if (answerColumns.length === 0) {
          this.logger.warn("SheetsClient", "削除対象の列（回答、ChatGPT回答、Claude回答、Gemini回答）が見つかりません");
        }
      }
      
      // 作業行のAI回答列をクリア
      for (const workRow of sheetData.workRows) {
        const rowIndex = workRow.index;
        
        for (const colIndex of answerColumns) {
          const columnLetter = this.getColumnName(colIndex);
          let range;
          
          if (gid) {
            const sheetName = await this.getSheetNameFromGid(spreadsheetId, gid);
            range = sheetName ? `'${sheetName}'!${columnLetter}${rowIndex + 1}` : `${columnLetter}${rowIndex + 1}`;
          } else {
            range = `${columnLetter}${rowIndex + 1}`;
          }
          
          updates.push({
            range: range,
            values: [[""]]
          });
          deletedCount++;
        }
      }
      
      if (updates.length > 0) {
        await this.batchUpdate(spreadsheetId, updates);
      }
      
      this.logger.log("SheetsClient", `AI回答削除完了: ${deletedCount}個のセル`);
      return { success: true, deletedCount };
      
    } catch (error) {
      this.logger.error("SheetsClient", `AI回答削除エラー: ${error.message}`);
      throw error;
    }
  }
}

// グローバルスコープに追加
self.SheetsClient = SheetsClient;

// シングルトンインスタンスを作成してグローバルに公開
if (typeof globalThis !== "undefined") {
  globalThis.sheetsClient = new SheetsClient();
}
