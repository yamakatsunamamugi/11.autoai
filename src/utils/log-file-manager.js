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

    // ハイブリッド保存用の設定
    this.intermediateInterval = 100; // 100件ごとに中間保存
    this.autoSaveTimer = null; // 5分タイマー
    this.errorCount = 0; // エラーカウント
    this.intermediateCount = 0; // 中間保存カウント
    this.sessionStartTime = new Date().toISOString();

    // 5分ごとの自動保存タイマーを開始
    this.startAutoSaveTimer();
  }

  /**
   * ログエントリを追加
   */
  addLog(entry) {
    this.logs.push({
      timestamp: new Date().toISOString(),
      ...entry
    });

    // 100件ごとに中間保存
    if (this.logs.length % this.intermediateInterval === 0) {
      this.saveIntermediate();
    }
  }

  /**
   * 5分ごとの自動保存タイマーを開始
   */
  startAutoSaveTimer() {
    // 既存のタイマーをクリア
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
    }

    // 5分ごとに中間保存
    this.autoSaveTimer = setInterval(() => {
      if (this.logs.length > 0) {
        console.log(`[自動保存] 5分経過 - 中間保存を実行`);
        this.saveIntermediate();
      }
    }, 5 * 60 * 1000); // 5分
  }

  /**
   * タイマーを停止
   */
  stopAutoSaveTimer() {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
  }

  /**
   * エラーを即座に保存
   */
  async saveErrorImmediately(error, context = {}) {
    try {
      const timestamp = new Date().toISOString()
        .replace(/[:.]/g, '-')
        .replace('T', '_')
        .slice(0, -5);

      const errorData = {
        timestamp: new Date().toISOString(),
        type: 'error',
        error: {
          message: error.message,
          stack: error.stack,
          name: error.name
        },
        context,
        sessionStart: this.sessionStartTime
      };

      const fileName = `11autoai-logs/${this.aiType}/errors/error-${timestamp}.json`;
      await this.downloadFile(fileName, JSON.stringify(errorData, null, 2));

      this.errorCount++;
      console.log(`❌ [エラー保存] ${fileName}`);
    } catch (saveError) {
      console.error('[エラー保存失敗]', saveError);
    }
  }

  /**
   * 中間保存（100件ごと/5分ごと）
   */
  async saveIntermediate() {
    if (this.logs.length === 0) return;

    try {
      const timestamp = new Date().toISOString()
        .replace(/[:.]/g, '-')
        .replace('T', '_')
        .slice(0, -5);

      const intermediateData = {
        sessionStart: this.sessionStartTime,
        savedAt: new Date().toISOString(),
        logCount: this.logs.length,
        logs: [...this.logs] // コピーを保存
      };

      const fileName = `11autoai-logs/${this.aiType}/intermediate/partial-${timestamp}.json`;
      await this.downloadFile(fileName, JSON.stringify(intermediateData, null, 2));

      this.intermediateCount++;
      console.log(`💾 [中間保存] ${fileName} (ログ数: ${this.logs.length})`);
    } catch (saveError) {
      console.error('[中間保存失敗]', saveError);
    }
  }

  /**
   * Chrome Downloads APIを使用してファイルをダウンロード
   */
  async downloadFile(fileName, content) {
    // Chrome拡張機能のコンテキストで実行される場合
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          type: 'DOWNLOAD_LOG_FILE',
          data: {
            fileName,
            content
          }
        }, response => {
          if (response?.success) {
            resolve(response.downloadId);
          } else {
            reject(new Error(response?.error || 'ダウンロードに失敗しました'));
          }
        });
      });
    } else {
      // ブラウザ環境ではBlobダウンロード
      const blob = new Blob([content], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName.split('/').pop();
      a.click();
      URL.revokeObjectURL(url);
    }
  }

  /**
   * 現在のログをファイルに保存（最終保存）
   */
  async saveToFile() {
    // タイマーを停止
    this.stopAutoSaveTimer();
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
      const filePath = `11autoai-logs/${this.aiType}/complete/${fileName}`;

      // ログデータを整形
      const logData = {
        sessionStart: this.sessionStartTime,
        sessionEnd: new Date().toISOString(),
        totalLogs: this.logs.length,
        errorCount: this.errorCount,
        intermediatesSaved: this.intermediateCount,
        logs: this.logs
      };

      // ファイルにダウンロード
      await this.downloadFile(filePath, JSON.stringify(logData, null, 2));

      console.log(`✅ [LogFileManager] 最終ログを保存しました: ${fileName}`);
      console.log(`  ・総ログ数: ${this.logs.length}`);
      console.log(`  ・エラー数: ${this.errorCount}`);
      console.log(`  ・中間保存数: ${this.intermediateCount}`);

      // ログをクリア
      this.logs = [];
      this.errorCount = 0;
      this.intermediateCount = 0;

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