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
    
    // ログフォーマット（スプレッドシートエラー回避のため「=」を除去）
    const logEntry = [
      `---------- ${aiDisplayName} ----------`,
      `モデル: ${model}`,
      `URL: ${url || 'URLが取得できませんでした'}`,
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
   * @param {string} aiType - AI種別（重複チェック用）
   * @returns {string} マージ済みログ
   */
  mergeWithExistingLog(existingLog, newLog, aiType = '') {
    console.log(`🔄 [SpreadsheetLogger] マージ処理開始:`, {
      aiType,
      hasExistingLog: !!existingLog && existingLog.trim() !== '',
      existingLength: existingLog.length,
      newLogLength: newLog.length
    });
    
    if (!existingLog || existingLog.trim() === '') {
      console.log(`➕ [SpreadsheetLogger] 空のログに新規追加 (AI: ${aiType})`);
      return newLog;
    }
    
    // AIタイプから日本語表記を取得
    const aiDisplayName = this.getAIDisplayName(aiType);
    console.log(`🔍 [SpreadsheetLogger] AI名変換: ${aiType} → ${aiDisplayName}`);
    
    // 既存ログに同じAIのログが既に存在するかチェック
    const duplicateCheck = existingLog.includes(`---------- ${aiDisplayName} ----------`);
    console.log(`🔍 [SpreadsheetLogger] 重複チェック結果:`, {
      aiDisplayName,
      isDuplicate: duplicateCheck,
      searchPattern: `---------- ${aiDisplayName} ----------`
    });
    
    if (duplicateCheck) {
      console.log(`⚠️ [SpreadsheetLogger] 既存の${aiDisplayName}ログを上書き更新`);
      
      // 同じAIのログ部分を新しいログで置換
      // 正規表現のエスケープを修正
      const escapedName = aiDisplayName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const logPattern = new RegExp(`---------- ${escapedName} ----------[\\s\\S]*?(?=\\n\\n---------- |$)`, 'g');
      const updatedLog = existingLog.replace(logPattern, newLog);
      
      console.log(`🔄 [SpreadsheetLogger] 置換処理結果:`, {
        succeeded: updatedLog !== existingLog,
        originalLength: existingLog.length,
        updatedLength: updatedLog.length
      });
      
      // 置換に失敗した場合は末尾に追加
      if (updatedLog === existingLog) {
        console.log(`⚠️ [SpreadsheetLogger] 置換失敗、末尾に追加`);
        return `${existingLog}\n\n${newLog}`;
      }
      
      return updatedLog;
    }
    
    // 新しいAIのログなので末尾に追加
    console.log(`➕ [SpreadsheetLogger] 新しいAIログを末尾に追加 (AI: ${aiDisplayName})`);
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
   * @param {boolean} options.isFirstTask - 最初のタスクかどうか
   * @returns {Promise<void>}
   */
  async writeLogToSpreadsheet(task, options = {}) {
    try {
      const { url, sheetsClient, spreadsheetId, gid } = options;
      
      console.log(`🔍 [SpreadsheetLogger] ログ書き込み開始:`, {
        taskId: task.id,
        row: task.row,
        logColumns: task.logColumns,
        sheetsClient: !!sheetsClient,
        spreadsheetId: !!spreadsheetId,
        gid: gid
      });
      
      if (!sheetsClient || !spreadsheetId) {
        console.error('❌ [SpreadsheetLogger] SheetsClientまたはスプレッドシートIDが未設定');
        this.logger.error('[SpreadsheetLogger] SheetsClientまたはスプレッドシートIDが未設定');
        return;
      }
      
      // タスクからログ列を取得（ハードコーディングしない）
      const logColumn = task.logColumns?.[0] || 'B'; // デフォルトはB列
      const logCell = `${logColumn}${task.row}`;
      
      console.log(`📍 [SpreadsheetLogger] ログセル特定: ${logCell} (logColumns: ${JSON.stringify(task.logColumns)})`);
      
      // 送信時刻を取得
      const sendTimeInfo = this.getSendTime(task.id);
      console.log(`⏰ [SpreadsheetLogger] 送信時刻情報:`, {
        taskId: task.id,
        sendTimeInfo: sendTimeInfo,
        availableTaskIds: Array.from(this.sendTimestamps.keys())
      });
      
      if (!sendTimeInfo) {
        console.warn(`⚠️ [SpreadsheetLogger] タスク${task.id}の送信時刻が記録されていません`);
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
      
      // 最初のタスクの場合はログをクリア、それ以降は追加
      let mergedLog = newLog;
      
      if (options.isFirstTask) {
        // 最初のタスクの場合はログをクリアして新規作成
        console.log(`🔄 [SpreadsheetLogger] 最初のタスクのためログをクリア: ${logCell}`);
        mergedLog = newLog;
      } else {
        // 2回目以降は既存ログに追加
        let existingLog = '';
        try {
          console.log(`🔍 [SpreadsheetLogger] 既存ログ取得開始: ${logCell} (AI: ${sendTimeInfo.aiType})`);
          const response = await sheetsClient.getSheetData(
            spreadsheetId,
            logCell,
            gid
          );
          existingLog = response?.values?.[0]?.[0] || '';
          console.log(`📄 [SpreadsheetLogger] 既存ログ内容 (${existingLog.length}文字):`, {
            aiType: sendTimeInfo.aiType,
            hasContent: !!existingLog,
            preview: existingLog.substring(0, 100) + (existingLog.length > 100 ? '...' : '')
          });
        } catch (error) {
          // 既存ログの取得に失敗しても続行
          this.logger.warn('[SpreadsheetLogger] 既存ログの取得に失敗:', error.message);
        }
        
        // 既存ログに追加（上書きではなく追加）
        if (existingLog && existingLog.trim() !== '') {
          mergedLog = `${existingLog}\n\n${newLog}`;
          console.log(`➕ [SpreadsheetLogger] 既存ログに追加 (AI: ${sendTimeInfo.aiType})`);
        } else {
          mergedLog = newLog;
          console.log(`➕ [SpreadsheetLogger] 新規ログ作成 (AI: ${sendTimeInfo.aiType})`);
        }
      }
      
      // スプレッドシートに書き込み
      console.log(`💾 [SpreadsheetLogger] スプレッドシート書き込み実行:`, {
        spreadsheetId,
        logCell,
        gid,
        logLength: mergedLog.length
      });
      
      await sheetsClient.updateCell(
        spreadsheetId,
        logCell,
        mergedLog,
        gid
      );
      
      console.log(`✅ [SpreadsheetLogger] ログ書き込み完了: ${logCell}`);
      this.logger.log(`[SpreadsheetLogger] ログを書き込み: ${logCell}`);
      
      // 拡張機能のログシステムにも記録
      if (globalThis.logManager) {
        globalThis.logManager.log(`📝 スプレッドシートログ書き込み完了: ${logCell}`, {
          category: 'system',
          level: 'info',
          metadata: {
            taskId: task.id,
            logCell,
            aiType: sendTimeInfo.aiType,
            model: sendTimeInfo.model,
            elapsedSeconds: Math.round((writeTime.getTime() - sendTimeInfo.time.getTime()) / 1000)
          }
        });
      }
      
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
      `---------- ${aiDisplayName} ----------`,
      `モデル: ${model}`,
      `URL: ${url || 'URLが取得できませんでした'}`,
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