/**
 * @fileoverview ログファイル管理ユーティリティ
 *
 * Claudeの実行ログをファイルに保存し、ローテーション管理を行う
 * Dropboxアップロード機能を含む
 */

import { dropboxService } from '../services/dropbox-service.js';

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

    // Dropbox設定
    this.dropboxEnabled = false;
    this.dropboxAutoUpload = false;

    // Dropboxサービス初期化
    this.initializeDropbox();
  }

  /**
   * Dropboxサービスを初期化
   */
  async initializeDropbox() {
    try {
      await dropboxService.initialize();
      this.dropboxEnabled = await dropboxService.isAuthenticated();

      if (this.dropboxEnabled) {
        const settings = await dropboxService.config.getUploadSettings();
        this.dropboxAutoUpload = settings.autoUpload;
        console.log('[LogFileManager] Dropbox連携が有効です');
      }
    } catch (error) {
      console.log('[LogFileManager] Dropbox初期化をスキップ:', error.message);
    }
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
        .slice(0, -1); // ミリ秒まで含む

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
      console.error('❌ [エラー保存失敗]', {
        originalError: error.message,
        saveError: saveError.message,
        fileName,
        aiType: this.aiType
      });
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
        .slice(0, -1); // ミリ秒まで含む

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
      console.error('❌ [中間保存失敗]', {
        saveError: saveError.message,
        fileName,
        logCount: this.logs.length,
        aiType: this.aiType
      });
    }
  }

  /**
   * Chrome Downloads APIを使用してファイルをダウンロード
   * 自動アップロードが有効な場合はDropboxにもアップロード
   */
  async downloadFile(fileName, content) {
    console.log('🔍 [DEBUG-LogFileManager] downloadFile開始:', {
      fileName,
      contentLength: content.length,
      dropboxEnabled: this.dropboxEnabled,
      dropboxAutoUpload: this.dropboxAutoUpload,
      chromeRuntime: typeof chrome !== 'undefined' && !!chrome.runtime
    });

    // Chrome拡張機能のコンテキストで実行される場合
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      console.log('🔍 [DEBUG-LogFileManager] Chrome runtime環境、メッセージ送信');
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          type: 'DOWNLOAD_LOG_FILE',
          data: {
            fileName,
            content
          }
        }, async (response) => {
          console.log('🔍 [DEBUG-LogFileManager] Chrome runtime response:', response);

          if (response?.success) {
            console.log('🔍 [DEBUG-LogFileManager] ローカルダウンロード成功:', response.downloadId);
            // ローカルダウンロード成功
            resolve(response.downloadId);

            // Dropbox自動アップロードをチェック
            if (this.dropboxEnabled && this.dropboxAutoUpload) {
              console.log('🔍 [DEBUG-LogFileManager] Dropbox自動アップロード開始');
              try {
                await this.uploadToDropbox(fileName, content);
                console.log(`✅ [Dropbox] ${fileName} を自動アップロードしました`);
                console.log('🔍 [DEBUG-LogFileManager] Dropbox自動アップロード完了');
              } catch (uploadError) {
                console.error('🔍 [DEBUG-LogFileManager] Dropbox自動アップロードエラー:', uploadError);
                console.error(`❌ [Dropbox] ${fileName} の自動アップロードに失敗:`, uploadError);
              }
            } else {
              console.log('🔍 [DEBUG-LogFileManager] Dropbox自動アップロードスキップ:', {
                dropboxEnabled: this.dropboxEnabled,
                dropboxAutoUpload: this.dropboxAutoUpload
              });
            }
          } else {
            console.error('🔍 [DEBUG-LogFileManager] Chrome runtime response エラー:', response);
            reject(new Error(response?.error || 'ダウンロードに失敗しました'));
          }
        });
      });
    } else {
      console.log('🔍 [DEBUG-LogFileManager] ブラウザ環境、Blobダウンロード');

      // ブラウザ環境ではBlobダウンロード
      const blob = new Blob([content], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName.split('/').pop();
      a.click();
      URL.revokeObjectURL(url);

      console.log('🔍 [DEBUG-LogFileManager] Blobダウンロード完了');

      // Dropbox自動アップロード
      if (this.dropboxEnabled && this.dropboxAutoUpload) {
        console.log('🔍 [DEBUG-LogFileManager] Dropbox自動アップロード開始（ブラウザ）');
        try {
          await this.uploadToDropbox(fileName, content);
          console.log(`✅ [Dropbox] ${fileName} を自動アップロードしました`);
          console.log('🔍 [DEBUG-LogFileManager] Dropbox自動アップロード完了（ブラウザ）');
        } catch (uploadError) {
          console.error('🔍 [DEBUG-LogFileManager] Dropbox自動アップロードエラー（ブラウザ）:', uploadError);
          console.error(`❌ [Dropbox] ${fileName} の自動アップロードに失敗:`, uploadError);
        }
      } else {
        console.log('🔍 [DEBUG-LogFileManager] Dropbox自動アップロードスキップ（ブラウザ）:', {
          dropboxEnabled: this.dropboxEnabled,
          dropboxAutoUpload: this.dropboxAutoUpload
        });
      }
    }
  }

  /**
   * ファイルをDropboxにアップロード
   * @param {string} fileName - ファイル名
   * @param {string} content - ファイル内容
   * @param {Object} options - アップロードオプション
   * @returns {Promise<Object>}
   */
  async uploadToDropbox(fileName, content, options = {}) {
    try {
      if (!this.dropboxEnabled) {
        throw new Error('Dropboxが認証されていません');
      }

      // ファイルパスを生成（log-report/aiType/category構造を作成）
      const pathParts = fileName.split('/');
      const aiType = pathParts[1]; // "11autoai-logs/claude/complete/file.json" -> "claude"
      const category = pathParts[2]; // "complete", "intermediate", "errors"
      const actualFileName = pathParts[3]; // 実際のファイル名

      const dropboxPath = `/log-report/${aiType}/${category}/${actualFileName}`;

      console.log(`📁 [ファイル作成開始] ${dropboxPath}`);

      // 進捗コールバック
      const progressCallback = options.onProgress || ((progress) => {
        console.log(`[Dropbox] アップロード進捗: ${progress}%`);
      });

      // 重複ファイル処理の設定をログに記録
      const overwriteMode = options.overwrite || false;
      console.log(`🔄 [重複処理設定] 上書きモード: ${overwriteMode ? '有効' : '無効'}`);

      // ファイルをアップロード
      const result = await dropboxService.uploadFile(dropboxPath, content, {
        overwrite: overwriteMode,
        onProgress: progressCallback
      });

      console.log(`✅ [Dropbox] ファイルアップロード完了: ${result.filePath}`);
      return result;
    } catch (error) {
      console.error(`❌ [ファイル作成失敗] ${dropboxPath}`, {
        errorMessage: error.message,
        errorType: error.name,
        aiType,
        category,
        fileName: actualFileName
      });
      throw error;
    }
  }

  /**
   * Dropboxから特定のAIタイプのログファイル一覧を取得
   * @param {string} aiType - AIタイプ ('claude', 'gemini', 'chatgpt')
   * @returns {Promise<Array>}
   */
  async getDropboxLogs(aiType = null) {
    try {
      if (!this.dropboxEnabled) {
        throw new Error('Dropboxが認証されていません');
      }

      const targetAiType = aiType || this.aiType;
      const settings = await dropboxService.config.getUploadSettings();
      const rootPath = settings.uploadPath || '/log-report';
      const categories = ['complete', 'intermediate', 'errors'];
      const allFiles = [];

      for (const category of categories) {
        const categoryPath = `${rootPath}/${targetAiType}/${category}`;

        try {
          const files = await dropboxService.listFiles(categoryPath);
          const filteredFiles = files.filter(file =>
            file.type === 'file' &&
            file.name.includes(`${targetAiType}-log-`) &&
            file.name.endsWith('.json')
          );

          filteredFiles.forEach(file => {
            file.category = category;
          });

          allFiles.push(...filteredFiles);
        } catch (error) {
          if (!error.message.includes('path/not_found')) {
            console.warn(`[LogFileManager] ${categoryPath}検索エラー:`, error.message);
          }
        }
      }

      return allFiles;
    } catch (error) {
      console.error('[LogFileManager] Dropboxログ一覧取得エラー:', error);
      return [];
    }
  }

  /**
   * 特定のAIタイプの全ファイルを取得（全日付から）
   * @param {string} targetAiType - 対象のAIタイプ ('claude', 'gemini', 'chatgpt')
   * @returns {Promise<Array>} ファイル情報の配列
   */
  async getAllDropboxLogsByAIType(targetAiType) {
    try {
      if (!this.dropboxEnabled) {
        return [];
      }

      console.log(`[LogFileManager] ${targetAiType}のファイル検索を開始`);

      const allFiles = [];
      const settings = await dropboxService.config.getUploadSettings();
      const rootPath = settings.uploadPath || '/log-report';

      // log-report/{aiType}の各カテゴリフォルダをチェック
      const categories = ['complete', 'intermediate', 'errors'];

      for (const category of categories) {
        const categoryPath = `${rootPath}/${targetAiType}/${category}`;

        try {
          const files = await dropboxService.listFiles(categoryPath);
          const filteredFiles = files.filter(file =>
            file.type === 'file' &&
            file.name.includes(`${targetAiType}-log-`) &&
            file.name.endsWith('.json')
          );

          // ファイルパスを完全パスに修正
          filteredFiles.forEach(file => {
            file.fullPath = file.path;
            file.category = category;
          });

          allFiles.push(...filteredFiles);
        } catch (error) {
          // フォルダが存在しない場合はスキップ
          if (!error.message.includes('path/not_found')) {
            console.warn(`[LogFileManager] ${categoryPath}フォルダ検索エラー:`, error.message);
          }
        }
      }

      // 更新日時でソート（新しい順）
      allFiles.sort((a, b) => {
        const dateA = new Date(a.modified || a.server_modified);
        const dateB = new Date(b.modified || b.server_modified);
        return dateB.getTime() - dateA.getTime();
      });

      console.log(`[LogFileManager] ${targetAiType}のファイル検索完了: ${allFiles.length}件`);
      return allFiles;
    } catch (error) {
      console.error(`[LogFileManager] ${targetAiType}ファイル検索エラー:`, error);
      return [];
    }
  }

  /**
   * Dropboxの古いログファイルを削除（日数ベース）
   * @param {number} retentionDays - 保持日数
   * @returns {Promise<number>} 削除したファイル数
   */
  async cleanupDropboxLogs(retentionDays = 30) {
    try {
      if (!this.dropboxEnabled) {
        return 0;
      }

      const settings = await dropboxService.config.getUploadSettings();
      const actualRetentionDays = settings.retentionDays || retentionDays;
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - actualRetentionDays);

      let deletedCount = 0;

      // 各AIタイプの古いファイルをチェック
      const aiTypes = ['claude', 'gemini', 'chatgpt'];
      const categories = ['complete', 'intermediate', 'errors'];

      for (const aiType of aiTypes) {
        for (const category of categories) {
          const categoryPath = `${settings.uploadPath || '/log-report'}/${aiType}/${category}`;

          try {
            const files = await dropboxService.listFiles(categoryPath);
            for (const file of files) {
              const fileDate = new Date(file.modified || file.server_modified);
              if (fileDate < cutoffDate) {
                await dropboxService.deleteFile(file.path);
                deletedCount++;
                console.log(`🗑️ [Dropbox] 古いログを削除: ${file.path}`);
              }
            }
          } catch (error) {
            // フォルダが存在しない場合はスキップ
            if (!error.message.includes('path/not_found')) {
              console.error(`[Dropbox] ${categoryPath} の削除でエラー:`, error);
            }
          }
        }
      }

      console.log(`✅ [Dropbox] ${deletedCount}個の古いログファイルを削除しました`);
      return deletedCount;
    } catch (error) {
      console.error('[LogFileManager] Dropbox削除エラー:', error);
      return 0;
    }
  }

  /**
   * AIタイプ別にファイル数制限で削除（5件を超えた分を削除）
   * @param {number} maxFiles - AIタイプ別の最大保持ファイル数
   * @returns {Promise<number>} 削除したファイル数
   */
  async cleanupDropboxLogsByCount(maxFiles = 5) {
    try {
      if (!this.dropboxEnabled) {
        return 0;
      }

      console.log(`[LogFileManager] ファイル数制限削除開始 (最大${maxFiles}件/AIタイプ)`);

      const aiTypes = ['claude', 'gemini', 'chatgpt'];
      let totalDeletedCount = 0;

      for (const aiType of aiTypes) {
        try {
          // AIタイプ別の全ファイルを取得（更新日時順）
          const allFiles = await this.getAllDropboxLogsByAIType(aiType);

          if (allFiles.length <= maxFiles) {
            console.log(`[LogFileManager] ${aiType}: ${allFiles.length}件 (削除不要)`);
            continue;
          }

          // maxFiles件を超えた分を削除対象とする
          const filesToDelete = allFiles.slice(maxFiles);
          console.log(`[LogFileManager] ${aiType}: ${allFiles.length}件中${filesToDelete.length}件を削除対象`);

          for (const file of filesToDelete) {
            try {
              await dropboxService.deleteFile(file.fullPath || file.path);
              totalDeletedCount++;
              console.log(`🗑️ [Dropbox] ${aiType}ログを削除: ${file.name} (${file.dateFolder || ''})`);
            } catch (deleteError) {
              console.error(`[LogFileManager] ${file.name}削除エラー:`, deleteError.message);
            }
          }

          // 削除後の確認
          console.log(`✅ [LogFileManager] ${aiType}: ${filesToDelete.length}件削除完了`);

        } catch (aiTypeError) {
          console.error(`[LogFileManager] ${aiType}の削除処理でエラー:`, aiTypeError.message);
        }
      }

      console.log(`✅ [Dropbox] ファイル数制限削除完了: 合計${totalDeletedCount}件削除`);
      return totalDeletedCount;

    } catch (error) {
      console.error('[LogFileManager] ファイル数制限削除エラー:', error);
      return 0;
    }
  }

  /**
   * 設定に基づいてDropbox削除を実行
   * @returns {Promise<number>} 削除したファイル数
   */
  async performDropboxCleanup() {
    try {
      if (!this.dropboxEnabled) {
        return 0;
      }

      const settings = await dropboxService.config.getUploadSettings();

      if (settings.cleanupByFileCount) {
        // ファイル数ベースの削除
        const maxFiles = settings.maxFilesPerAI || 5;
        console.log(`[LogFileManager] ファイル数ベース削除を実行 (${maxFiles}件/AIタイプ)`);
        return await this.cleanupDropboxLogsByCount(maxFiles);
      } else if (settings.cleanupByDays) {
        // 日数ベースの削除
        const retentionDays = settings.retentionDays || 30;
        console.log(`[LogFileManager] 日数ベース削除を実行 (${retentionDays}日)`);
        return await this.cleanupDropboxLogs(retentionDays);
      } else {
        console.log('[LogFileManager] 自動削除は無効です');
        return 0;
      }
    } catch (error) {
      console.error('[LogFileManager] Dropbox削除実行エラー:', error);
      return 0;
    }
  }

  /**
   * 現在のログをファイルに保存（最終保存）
   * Dropbox自動アップロードも実行
   */
  async saveToFile() {
    console.log('🔍 [DEBUG-LogFileManager] saveToFile開始:', {
      logsCount: this.logs.length,
      dropboxEnabled: this.dropboxEnabled,
      dropboxAutoUpload: this.dropboxAutoUpload,
      aiType: this.aiType
    });

    // タイマーを停止
    this.stopAutoSaveTimer();
    if (this.logs.length === 0) {
      console.log('🔍 [DEBUG-LogFileManager] 保存するログがありません');
      console.log('[LogFileManager] 保存するログがありません');
      return;
    }

    try {
      // タイムスタンプ付きファイル名を生成（ミリ秒まで含む）
      const timestamp = new Date().toISOString()
        .replace(/[:.]/g, '-')
        .replace('T', '_')
        .slice(0, -1); // YYYY-MM-DD_HH-mm-ss-sss形式（ミリ秒まで）

      const fileName = `${this.aiType}-log-${timestamp}.json`;
      const filePath = `11autoai-logs/${this.aiType}/complete/${fileName}`;

      console.log('🔍 [DEBUG-LogFileManager] ファイル情報:', {
        fileName,
        filePath,
        timestamp
      });

      // ログデータを整形
      const logData = {
        sessionStart: this.sessionStartTime,
        sessionEnd: new Date().toISOString(),
        totalLogs: this.logs.length,
        errorCount: this.errorCount,
        intermediatesSaved: this.intermediateCount,
        dropboxEnabled: this.dropboxEnabled,
        dropboxAutoUpload: this.dropboxAutoUpload,
        logs: this.logs
      };

      console.log('🔍 [DEBUG-LogFileManager] ログデータ作成完了:', {
        totalLogs: logData.totalLogs,
        errorCount: logData.errorCount,
        dropboxEnabled: logData.dropboxEnabled
      });

      // ファイルにダウンロード（Dropbox自動アップロードも含む）
      console.log('🔍 [DEBUG-LogFileManager] downloadFile()呼び出し開始');
      await this.downloadFile(filePath, JSON.stringify(logData, null, 2));
      console.log('🔍 [DEBUG-LogFileManager] downloadFile()完了');

      console.log(`✅ [LogFileManager] 最終ログを保存しました: ${fileName}`);
      console.log(`  ・総ログ数: ${this.logs.length}`);
      console.log(`  ・エラー数: ${this.errorCount}`);
      console.log(`  ・中間保存数: ${this.intermediateCount}`);
      console.log(`  ・Dropbox連携: ${this.dropboxEnabled ? '有効' : '無効'}`);

      // Dropbox古いファイルの削除（週1回程度）
      if (this.dropboxEnabled && Math.random() < 0.1) { // 10%の確率
        console.log('🔍 [DEBUG-LogFileManager] Dropbox古いファイル削除処理開始');
        this.performDropboxCleanup().catch(error => {
          console.warn('[LogFileManager] Dropbox削除でエラー:', error);
        });
      }

      // ログをクリア
      this.logs = [];
      this.errorCount = 0;
      this.intermediateCount = 0;

      console.log('🔍 [DEBUG-LogFileManager] saveToFile完了、結果:', filePath);
      return filePath;
    } catch (error) {
      console.error('🔍 [DEBUG-LogFileManager] saveToFile エラー:', error);
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
            directory: `${this.logDirectory}/${this.reportDirectory}`
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

  /**
   * Dropbox設定を更新
   * @param {Object} settings - Dropbox設定
   * @returns {Promise<boolean>}
   */
  async updateDropboxSettings(settings) {
    try {
      await dropboxService.config.saveUploadSettings(settings);
      this.dropboxAutoUpload = settings.autoUpload;
      console.log('[LogFileManager] Dropbox設定を更新しました:', settings);
      return true;
    } catch (error) {
      console.error('[LogFileManager] Dropbox設定更新エラー:', error);
      return false;
    }
  }

  /**
   * 現在のDropbox設定を取得
   * @returns {Promise<Object>}
   */
  async getDropboxSettings() {
    try {
      const settings = await dropboxService.config.getUploadSettings();
      return {
        ...settings,
        isAuthenticated: this.dropboxEnabled,
        clientIdConfigured: !!(await dropboxService.config.loadClientId())
      };
    } catch (error) {
      console.error('[LogFileManager] Dropbox設定取得エラー:', error);
      return {
        autoUpload: false,
        uploadPath: '/log-report',
        compressionEnabled: true,
        retentionDays: 30,
        maxFilesPerAI: 5,
        cleanupByFileCount: true,
        cleanupByDays: false,
        isAuthenticated: false,
        clientIdConfigured: false
      };
    }
  }

  /**
   * Dropbox認証状態を再初期化
   * @returns {Promise<boolean>}
   */
  async refreshDropboxStatus() {
    try {
      await this.initializeDropbox();
      return this.dropboxEnabled;
    } catch (error) {
      console.error('[LogFileManager] Dropbox状態更新エラー:', error);
      return false;
    }
  }
}

// グローバルインスタンスを作成
export const logFileManager = new LogFileManager();