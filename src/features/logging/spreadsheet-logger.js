/**
 * @fileoverview スプレッドシートログ記録システム
 * 
 * 【役割】
 * AI実行時の詳細ログをスプレッドシートのログ列に記録
 * 
 * 【主要機能】
 * - ログフォーマット生成
 * - タイムスタンプ管理
 * - スプレッドシートへの書き込み
 * - 既存ログとのマージ処理
 */

export class SpreadsheetLogger {
  constructor(logger = console) {
    this.logger = logger;
    this.sendTimestamps = new Map(); // key: taskId, value: { time: Date, aiType: string, model: string }
  }

  /**
   * 送信時刻を記録
   * @param {string} taskId - タスクID
   * @param {Object} info - 追加情報
   * @param {string} info.aiType - AI種別
   * @param {string} info.model - モデル名
   */
  recordSendTime(taskId, info = {}) {
    const timestamp = new Date();
    this.sendTimestamps.set(taskId, {
      time: timestamp,
      aiType: info.aiType || 'Unknown',
      model: info.model || '不明'
    });
    
    this.logger.log(`[SpreadsheetLogger] 送信時刻記録: タスク=${taskId}, 時刻=${timestamp.toLocaleString('ja-JP')}`);
  }

  /**
   * 送信時刻を取得
   * @param {string} taskId - タスクID
   * @returns {Object|null} 送信時刻情報
   */
  getSendTime(taskId) {
    return this.sendTimestamps.get(taskId) || null;
  }

  /**
   * ログエントリーをフォーマット
   * @param {Object} task - タスクオブジェクト
   * @param {string} url - 現在のURL
   * @param {Date} sendTime - 送信時刻
   * @param {Date} writeTime - 記載時刻
   * @returns {string} フォーマット済みログ
   */
  formatLogEntry(task, url, sendTime, writeTime) {
    const aiType = task.aiType || 'Unknown';
    const model = task.model || '不明';
    
    // 経過時間を計算（秒単位）
    const elapsedMs = writeTime.getTime() - sendTime.getTime();
    const elapsedSeconds = Math.round(elapsedMs / 1000);
    
    // 日本語フォーマット
    const sendTimeStr = sendTime.toLocaleString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    
    const writeTimeStr = writeTime.toLocaleString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    
    // AI名を日本語表記に
    const aiDisplayName = this.getAIDisplayName(aiType);
    
    // ログフォーマット
    const logEntry = [
      `========== ${aiDisplayName} ==========`,
      `モデル: ${model}`,
      `URL: ${url}`,
      `送信時刻: ${sendTimeStr}`,
      `記載時刻: ${writeTimeStr} (${elapsedSeconds}秒後)`
    ].join('\n');
    
    return logEntry;
  }

  /**
   * AI名を日本語表記に変換
   * @param {string} aiType - AI種別
   * @returns {string} 日本語表記のAI名
   */
  getAIDisplayName(aiType) {
    const nameMap = {
      'chatgpt': 'ChatGPT',
      'claude': 'Claude',
      'gemini': 'Gemini',
      'gpt': 'ChatGPT',
      'openai': 'ChatGPT'
    };
    
    const lowerType = (aiType || '').toLowerCase();
    return nameMap[lowerType] || aiType || '不明';
  }

  /**
   * 既存ログと新規ログをマージ
   * @param {string} existingLog - 既存のログ
   * @param {string} newLog - 新規ログ
   * @returns {string} マージ済みログ
   */
  mergeWithExistingLog(existingLog, newLog) {
    if (!existingLog || existingLog.trim() === '') {
      return newLog;
    }
    
    // 既存ログの後に改行2つと新規ログを追加
    return `${existingLog}\n\n${newLog}`;
  }

  /**
   * スプレッドシートにログを書き込み
   * @param {Object} task - タスクオブジェクト
   * @param {Object} options - オプション
   * @param {string} options.url - 現在のURL
   * @param {Object} options.sheetsClient - SheetsClientインスタンス
   * @param {string} options.spreadsheetId - スプレッドシートID
   * @param {string} options.gid - シートGID
   * @returns {Promise<void>}
   */
  async writeLogToSpreadsheet(task, options = {}) {
    try {
      const { url, sheetsClient, spreadsheetId, gid } = options;
      
      if (!sheetsClient || !spreadsheetId) {
        this.logger.error('[SpreadsheetLogger] SheetsClientまたはスプレッドシートIDが未設定');
        return;
      }
      
      // タスクからログ列を取得（ハードコーディングしない）
      const logColumn = task.logColumns?.[0] || 'B'; // デフォルトはB列
      const logCell = `${logColumn}${task.row}`;
      
      // 送信時刻を取得
      const sendTimeInfo = this.getSendTime(task.id);
      if (!sendTimeInfo) {
        this.logger.warn(`[SpreadsheetLogger] タスク${task.id}の送信時刻が記録されていません`);
        return;
      }
      
      // 記載時刻（現在時刻）
      const writeTime = new Date();
      
      // ログエントリーを生成
      const newLog = this.formatLogEntry(
        task,
        url || window.location.href,
        sendTimeInfo.time,
        writeTime
      );
      
      // 既存のログを取得
      let existingLog = '';
      try {
        const response = await sheetsClient.getSheetData(
          spreadsheetId,
          logCell,
          gid
        );
        existingLog = response?.values?.[0]?.[0] || '';
      } catch (error) {
        // 既存ログの取得に失敗しても続行
        this.logger.warn('[SpreadsheetLogger] 既存ログの取得に失敗:', error.message);
      }
      
      // ログをマージ
      const mergedLog = this.mergeWithExistingLog(existingLog, newLog);
      
      // スプレッドシートに書き込み
      await sheetsClient.updateCell(
        spreadsheetId,
        logCell,
        mergedLog,
        gid
      );
      
      this.logger.log(`[SpreadsheetLogger] ログを書き込み: ${logCell}`);
      
      // 送信時刻をクリア（メモリ節約）
      this.sendTimestamps.delete(task.id);
      
    } catch (error) {
      // エラーが発生してもメイン処理は続行
      this.logger.error('[SpreadsheetLogger] ログ書き込みエラー:', {
        message: error.message,
        stack: error.stack,
        taskId: task.id,
        row: task.row
      });
    }
  }

  /**
   * 簡易ログ生成（送信時刻なしの場合）
   * @param {Object} task - タスクオブジェクト
   * @param {string} url - 現在のURL
   * @returns {string} フォーマット済みログ
   */
  formatSimpleLogEntry(task, url) {
    const aiType = task.aiType || 'Unknown';
    const model = task.model || '不明';
    const currentTime = new Date();
    
    const timeStr = currentTime.toLocaleString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    
    const aiDisplayName = this.getAIDisplayName(aiType);
    
    const logEntry = [
      `========== ${aiDisplayName} ==========`,
      `モデル: ${model}`,
      `URL: ${url}`,
      `記載時刻: ${timeStr}`
    ].join('\n');
    
    return logEntry;
  }

  /**
   * メモリをクリア
   */
  clear() {
    this.sendTimestamps.clear();
    this.logger.log('[SpreadsheetLogger] タイムスタンプをクリアしました');
  }

  /**
   * 統計情報を取得
   * @returns {Object} 統計情報
   */
  getStatistics() {
    return {
      pendingTimestamps: this.sendTimestamps.size,
      timestamps: Array.from(this.sendTimestamps.entries()).map(([id, info]) => ({
        taskId: id,
        aiType: info.aiType,
        model: info.model,
        sendTime: info.time.toLocaleString('ja-JP')
      }))
    };
  }
}

// グローバルインスタンスを作成（必要に応じて）
if (typeof globalThis !== 'undefined') {
  globalThis.spreadsheetLogger = globalThis.spreadsheetLogger || new SpreadsheetLogger();
}

export default SpreadsheetLogger;