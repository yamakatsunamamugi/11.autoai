/**
 * @fileoverview ログファイル管理ユーティリティ
 *
 * Claudeの実行ログをファイルに保存し、ローテーション管理を行う
 */

export class LogFileManager {
  constructor(aiType = 'claude') {
    this.logDirectory = 'log';
    this.aiType = aiType.toLowerCase();

    // AI種別ごとのディレクトリ設定
    const reportDirectories = {
      claude: '3.Claudereport',
      gemini: '1.Geminireport',
      chatgpt: '2.ChatGPTreport'
    };

    this.reportDirectory = reportDirectories[this.aiType] || '3.Claudereport';
    this.maxLogFiles = 10; // 保持する最大ログファイル数
    this.logs = []; // 実行中のログを蓄積
  }

  /**
   * ログエントリを追加
   */
  addLog(entry) {
    this.logs.push({
      timestamp: new Date().toISOString(),
      ...entry
    });
  }

  /**
   * 現在のログをファイルに保存
   */
  async saveToFile() {
    if (this.logs.length === 0) {
      console.log('[LogFileManager] 保存するログがありません');
      return;
    }

    try {
      // タイムスタンプ付きファイル名を生成
      const timestamp = new Date().toISOString()
        .replace(/[:.]/g, '-')
        .replace('T', '_')
        .slice(0, -5); // YYYY-MM-DD_HH-mm-ss形式

      const fileName = `${this.aiType}-log-${timestamp}.json`;
      const filePath = `${this.logDirectory}/${this.reportDirectory}/${fileName}`;

      // ログデータを整形
      const logData = {
        sessionStart: this.logs[0]?.timestamp,
        sessionEnd: new Date().toISOString(),
        totalLogs: this.logs.length,
        logs: this.logs
      };

      // ファイルに保存（Chrome拡張機能のFile APIを使用）
      await this.writeFile(filePath, JSON.stringify(logData, null, 2));

      console.log(`✅ [LogFileManager] ログを保存しました: ${fileName}`);

      // 古いログファイルをローテーション
      await this.rotateOldLogs();

      // ログをクリア
      this.logs = [];

      return filePath;
    } catch (error) {
      console.error('[LogFileManager] ログ保存エラー:', error);
      throw error;
    }
  }

  /**
   * ファイルをディスクに書き込む
   */
  async writeFile(filePath, content) {
    // Chrome拡張機能のコンテキストで実行される場合
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      // バックグラウンドスクリプトにメッセージを送信してファイル保存
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          type: 'SAVE_LOG_FILE',
          data: {
            filePath,
            content
          }
        }, response => {
          if (response?.success) {
            resolve(response.filePath);
          } else {
            reject(new Error(response?.error || 'ファイル保存に失敗しました'));
          }
        });
      });
    } else {
      // 通常のブラウザ環境の場合はLocalStorageに保存
      const key = `${this.aiType}_logs_${filePath}`;
      localStorage.setItem(key, content);
      return filePath;
    }
  }

  /**
   * 古いログファイルを削除（10個を超えた分）
   */
  async rotateOldLogs() {
    try {
      // 保存済みログファイルのリストを取得
      const logFiles = await this.getLogFiles();

      if (logFiles.length <= this.maxLogFiles) {
        return; // ローテーション不要
      }

      // タイムスタンプでソート（新しい順）
      logFiles.sort((a, b) => b.timestamp - a.timestamp);

      // 10個を超える古いファイルを削除
      const filesToDelete = logFiles.slice(this.maxLogFiles);

      for (const file of filesToDelete) {
        await this.deleteFile(file.path);
        console.log(`🗑️ [LogFileManager] 古いログを削除: ${file.name}`);
      }

      console.log(`✅ [LogFileManager] ${filesToDelete.length}個の古いログを削除しました`);
    } catch (error) {
      console.error('[LogFileManager] ローテーションエラー:', error);
    }
  }

  /**
   * 保存済みログファイルのリストを取得
   */
  async getLogFiles() {
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      // Chrome拡張機能の場合
      return new Promise((resolve) => {
        chrome.runtime.sendMessage({
          type: 'GET_LOG_FILES',
          data: {
            directory: `${this.logDirectory}/${this.claudeReportDirectory}`
          }
        }, response => {
          resolve(response?.files || []);
        });
      });
    } else {
      // LocalStorageから取得
      const files = [];
      const prefix = `${this.aiType}_logs_${this.logDirectory}/${this.reportDirectory}/`;

      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(prefix)) {
          const fileName = key.replace(prefix, '');
          // タイムスタンプを抽出
          const match = fileName.match(new RegExp(`${this.aiType}-log-(\\d{4}-\\d{2}-\\d{2}_\\d{2}-\\d{2}-\\d{2})`));
          if (match) {
            files.push({
              name: fileName,
              path: key.replace(`${this.aiType}_logs_`, ''),
              timestamp: new Date(match[1].replace('_', 'T').replace(/-/g, ':')).getTime()
            });
          }
        }
      }

      return files;
    }
  }

  /**
   * ファイルを削除
   */
  async deleteFile(filePath) {
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      // Chrome拡張機能の場合
      return new Promise((resolve) => {
        chrome.runtime.sendMessage({
          type: 'DELETE_LOG_FILE',
          data: { filePath }
        }, response => {
          resolve(response?.success || false);
        });
      });
    } else {
      // LocalStorageから削除
      const key = `${this.aiType}_logs_${filePath}`;
      localStorage.removeItem(key);
      return true;
    }
  }

  /**
   * すべてのログをクリア
   */
  clearCurrentLogs() {
    this.logs = [];
    console.log('[LogFileManager] 現在のログをクリアしました');
  }

  /**
   * 実行ステップのログを記録
   */
  logStep(step, message, data = {}) {
    this.addLog({
      type: 'step',
      step,
      message,
      data
    });
  }

  /**
   * エラーログを記録
   */
  logError(step, error, context = {}) {
    this.addLog({
      type: 'error',
      step,
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name
      },
      context
    });
  }

  /**
   * 成功ログを記録
   */
  logSuccess(step, message, result = {}) {
    this.addLog({
      type: 'success',
      step,
      message,
      result
    });
  }

  /**
   * タスク実行開始を記録
   */
  logTaskStart(taskData) {
    this.addLog({
      type: 'task_start',
      taskData: {
        model: taskData.model,
        function: taskData.function,
        promptLength: taskData.prompt?.length || 0,
        cellInfo: taskData.cellInfo
      }
    });
  }

  /**
   * タスク実行完了を記録
   */
  logTaskComplete(result) {
    this.addLog({
      type: 'task_complete',
      result: {
        success: result.success,
        responseLength: result.response?.length || 0,
        error: result.error
      }
    });
  }
}

// グローバルインスタンスを作成
export const logFileManager = new LogFileManager();