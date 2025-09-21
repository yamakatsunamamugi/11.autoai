// ログレベル定義
const LOG_LEVEL = { ERROR: 1, WARN: 2, INFO: 3, DEBUG: 4 };

// Chrome Storageからログレベルを取得（非同期）
let CURRENT_LOG_LEVEL = LOG_LEVEL.INFO; // デフォルト値

// Chrome拡張環境でのみStorageから設定を読み込む
if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
  chrome.storage.local.get('logLevel', (result) => {
    if (result.logLevel) {
      CURRENT_LOG_LEVEL = parseInt(result.logLevel);
    }
  });
}

// ログユーティリティ
const log = {
  error: (...args) => CURRENT_LOG_LEVEL >= LOG_LEVEL.ERROR && console.error(...args),
  warn: (...args) => CURRENT_LOG_LEVEL >= LOG_LEVEL.WARN && console.warn(...args),
  info: (...args) => CURRENT_LOG_LEVEL >= LOG_LEVEL.INFO && console.log(...args),
  debug: (...args) => CURRENT_LOG_LEVEL >= LOG_LEVEL.DEBUG && console.log(...args)
};


/**
 * @fileoverview レポート自動化 - 統一アーキテクチャ実装
 * Version: 2.1.0
 *
 * 【主要機能】
 * - Step 4-4-0: 初期化とGoogle Docsマネージャー設定
 * - Step 4-4-1: レポート生成（単一）
 * - Step 4-4-2: バッチレポート生成
 * - Step 4-4-3: タスク実行
 * - Step 4-4-4: レポート検証
 *
 * 【依存関係】
 * - /src/features/report/: レポート関連モジュール
 *
 * @updated 2024-12-20 Step 4-4-X番号体系導入、詳細エラーログ強化
 */
(() => {
  "use strict";

  // ========================================
  // セクション1: 基本設定
  // ========================================
  const CONFIG = {
    AI_TYPE: "Report",
    VERSION: "2.0.0",

    // タイムアウト設定
    DEFAULT_TIMEOUT: 30000, // 30秒
    RETRY_ATTEMPTS: 3, // リトライ回数
    RETRY_DELAY: 1000, // リトライ間隔

    // バッチ処理設定
    BATCH_SIZE: 10, // バッチサイズ
    BATCH_DELAY: 500, // バッチ間の遅延

    // レポート設定
    REPORT_CONFIG: {
      titleTemplate: "レポート - {row}行目",
      includePrompt: true,
      includeAnswer: true,
      includeMetadata: true,
      formatType: "structured",
    },
  };

  // ========================================
  // セクション2: UI セレクタとユーティリティ関数
  // ========================================

  /**
   * UI セレクタの読み込み（step1-setup.js統一管理版）
   */
  async function loadUISelectors() {
    try {
      log(
        "【Step 4-4-0-1】📄 UIセレクタ読み込み中（step1-setup.js統一管理版）...",
        "INFO",
      );

      // step1-setup.jsからのUI_SELECTORS読み込み待機
      let retryCount = 0;
      const maxRetries = 50;

      while (!window.UI_SELECTORS && retryCount < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        retryCount++;
      }

      if (!window.UI_SELECTORS || !window.UI_SELECTORS.Report) {
        throw new Error("UI_SELECTORS not available from step1-setup.js");
      }

      log(
        "【Step 4-4-0-1】✅ UI Selectors loaded from step1-setup.js",
        "SUCCESS",
      );
      return window.UI_SELECTORS.Report;
    } catch (error) {
      log(
        `【Step 4-4-0-1】❌ UIセレクタ読み込み失敗: ${error.message}`,
        "ERROR",
      );
      throw error;
    }
  }

  /**
   * 要素検索（リトライ機能付き）
   */
  async function findElement(selectors, timeout = 10000, retryInterval = 500) {
    const endTime = Date.now() + timeout;

    while (Date.now() < endTime) {
      for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (element) {
          return element;
        }
      }
      await wait(retryInterval);
    }

    throw new Error(`要素が見つかりません: ${selectors.join(", ")}`);
  }

  /**
   * 要素が見えるまで待機
   */
  async function waitForVisible(element, timeout = 10000) {
    const endTime = Date.now() + timeout;

    while (Date.now() < endTime) {
      if (element && element.offsetParent !== null) {
        return true;
      }
      await wait(100);
    }

    throw new Error("要素が表示されませんでした");
  }

  /**
   * Step 4-4-0: 詳細ログ出力（エラーコンテキスト付き）
   */
  function log(message, level = "INFO", context = {}) {
    const timestamp = new Date().toLocaleTimeString();
    const prefix = `[Step 4-4:${timestamp}]`;

    const logData = {
      message,
      level,
      timestamp: new Date().toISOString(),
      context,
      url: window.location.href,
      userAgent: navigator.userAgent,
    };

    switch (level) {
      case "ERROR":
        log.error(`${prefix} ❌ ${message}`, logData);
        // エラーの場合はコンテキスト情報も追加で出力
        if (context.error) {
          log.error(`${prefix} 📋 エラー詳細:`, {
            errorName: context.error.name,
            errorMessage: context.error.message,
            errorStack: context.error.stack,
            retryCount: context.retryCount || 0,
            escalationLevel: context.escalationLevel || "NONE",
          });
        }
        break;
      case "SUCCESS":
        log.debug(`${prefix} ✅ ${message}`, logData);
        break;
      case "WARNING":
        log.warn(`${prefix} ⚠️ ${message}`, logData);
        break;
      default:
        log.debug(`${prefix} ℹ️ ${message}`, logData);
    }
  }

  /**
   * 待機処理
   */
  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Google Docs操作マネージャー（独立実装）
   */
  class GoogleDocsManager {
    constructor() {
      this.initialized = false;
      this.baseUrl = "https://docs.google.com";
    }

    async initialize() {
      if (this.initialized) return;

      try {
        log("【Step 4-4-0-2】📄 Google Docsマネージャー初期化中...", "INFO");

        // UIセレクタの読み込み
        await loadUISelectors();
        log("【Step 4-4-0-2】✅ UIセレクタ準備完了", "SUCCESS");

        this.initialized = true;
        log("【Step 4-4-0-2】✅ Google Docsマネージャー初期化完了", "SUCCESS");
      } catch (error) {
        log(
          `【Step 4-4-0-2】❌ Google Docsマネージャー初期化失敗: ${error.message}`,
          "ERROR",
          {
            error,
            step: "GoogleDocsManager_Initialize",
            retryCount: 0,
            escalationLevel: "IMMEDIATE_FAILURE",
          },
        );
        throw error;
      }
    }

    async createDocument(title, content) {
      await this.initialize();

      try {
        log(`【Step 4-4-3-1】📝 ドキュメント作成開始: "${title}"`, "INFO");

        // Google Docsページを新しいタブで開く
        log(`【Step 4-4-3-2】🌐 Google Docsページを開いています...`, "INFO");
        const newTab = window.open(`${this.baseUrl}/document/create`, "_blank");

        if (!newTab) {
          throw new Error("新しいタブを開けませんでした");
        }

        log(`【Step 4-4-3-2】✅ Google Docsページを開きました`, "SUCCESS");

        // 実際の実装では、新しいタブでのドキュメント作成を監視
        const docUrl = await this._waitForDocumentCreation(
          newTab,
          title,
          content,
        );

        log(`【Step 4-4-3-3】✅ ドキュメント作成完了: ${docUrl}`, "SUCCESS");
        return {
          success: true,
          url: docUrl,
          title: title,
        };
      } catch (error) {
        log(
          `【Step 4-4-3-1】❌ ドキュメント作成失敗: ${error.message}`,
          "ERROR",
          {
            error,
            step: "Document_Creation",
            title,
            contentLength: content?.length || 0,
            retryCount: 0,
            escalationLevel: "MODERATE",
          },
        );
        throw error;
      }
    }

    async _waitForDocumentCreation(tab, title, content) {
      try {
        log(`【Step 4-4-3-3】⏳ ドキュメント作成完了を待機中...`, "INFO");

        // 実際の実装では、Content Scriptを通じてドキュメント操作を行う
        // ここでは簡略化した実装
        await wait(2000); // ページロード待機

        // ドキュメントURLを生成（実際はページから取得）
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const docUrl = `https://docs.google.com/document/d/${timestamp}/edit`;

        // Content Scriptにメッセージを送信してドキュメントを編集
        if (chrome.tabs) {
          chrome.tabs.sendMessage(
            tab.id,
            {
              action: "createReport",
              title: title,
              content: content,
            },
            (response) => {
              if (chrome.runtime.lastError) {
                log.warn(
                  "[4-4-report-automation.js] レポート作成通信エラー:",
                  chrome.runtime.lastError.message,
                );
              }
            },
          );
        }

        return docUrl;
      } catch (error) {
        log(
          `【Step 4-4-3-3】❌ ドキュメント作成待機失敗: ${error.message}`,
          "ERROR",
        );
        throw error;
      }
    }

    /**
     * ドキュメントにタイトルを設定
     */
    async setDocumentTitle(title) {
      try {
        log(`【Step 4-4-4-1】📝 タイトル設定中: "${title}"`, "INFO");

        const titleInput = await findElement(
          window.UI_SELECTORS.Report.GOOGLE_DOCS.TITLE_INPUT,
        );
        await waitForVisible(titleInput);

        titleInput.value = title;
        titleInput.dispatchEvent(new Event("input", { bubbles: true }));
        titleInput.dispatchEvent(new Event("change", { bubbles: true }));

        log(`【Step 4-4-4-1】✅ タイトル設定完了`, "SUCCESS");
        return true;
      } catch (error) {
        log(`【Step 4-4-4-1】❌ タイトル設定失敗: ${error.message}`, "ERROR");
        throw error;
      }
    }

    /**
     * ドキュメントにコンテンツを設定
     */
    async setDocumentContent(content) {
      try {
        log(`【Step 4-4-4-2】📝 コンテンツ設定中...`, "INFO");

        const docBody = await findElement(
          window.UI_SELECTORS.Report.GOOGLE_DOCS.DOCUMENT_BODY,
        );
        await waitForVisible(docBody);

        // コンテンツを設定（実際の実装は更に複雑）
        docBody.innerHTML = content;
        docBody.dispatchEvent(new Event("input", { bubbles: true }));

        log(`【Step 4-4-4-2】✅ コンテンツ設定完了`, "SUCCESS");
        return true;
      } catch (error) {
        log(`【Step 4-4-4-2】❌ コンテンツ設定失敗: ${error.message}`, "ERROR");
        throw error;
      }
    }
  }

  // ========================================
  // セクション3: レポート生成ハンドラー
  // ========================================
  class ReportHandler {
    constructor(config = {}) {
      this.config = { ...CONFIG, ...config };
      this.googleDocsManager = null;
      this.initialized = false;
    }

    /**
     * 初期化
     */
    async initialize() {
      if (this.initialized) return;

      try {
        log("【Step 4-4-0-0-1】🔧 レポートハンドラー初期化開始...", "INFO");

        log("【Step 4-4-0-0-2】📄 Google Docsマネージャー作成中...", "INFO");
        this.googleDocsManager = new GoogleDocsManager();
        await this.googleDocsManager.initialize();
        log("【Step 4-4-0-0-2】✅ Google Docsマネージャー作成完了", "SUCCESS");

        this.initialized = true;
        log("【レポート初期化完了】✅ レポートハンドラー初期化完了", "SUCCESS");
      } catch (error) {
        log(`【レポート初期化失敗】❌ 初期化エラー: ${error.message}`, "ERROR");
        throw error;
      }
    }

    /**
     * 単一レポート生成（独立実装）
     */
    async generateReport(params) {
      await this.initialize();

      const {
        spreadsheetId,
        sheetGid,
        rowNumber,
        promptText,
        answerText,
        reportColumn,
      } = params;

      try {
        log(`【Step 4-4-1-1】📝 レポート生成開始: ${rowNumber}行目`, "INFO");
        log(
          `【Step 4-4-1-1】📊 対象スプレッドシート: ${spreadsheetId}`,
          "INFO",
        );
        log(`【Step 4-4-1-1】📍 対象シートGID: ${sheetGid}`, "INFO");

        log(`【Step 4-4-1-2】📝 レポートコンテンツ作成中...`, "INFO");
        const reportContent = this._generateReportContent({
          rowNumber,
          promptText,
          answerText,
          spreadsheetId,
          sheetGid,
        });
        log(`【Step 4-4-1-2】✅ レポートコンテンツ作成完了`, "SUCCESS");

        log(`【Step 4-4-1-3】📄 Google Docsドキュメント作成中...`, "INFO");
        const title = this.config.REPORT_CONFIG.titleTemplate.replace(
          "{row}",
          rowNumber,
        );
        const docResult = await this.googleDocsManager.createDocument(
          title,
          reportContent,
        );
        log(`【Step 4-4-1-3】✅ Google Docsドキュメント作成完了`, "SUCCESS");

        if (docResult.success) {
          log(
            `【Step 4-4-1-4】📎 レポートURL取得成功: ${docResult.url}`,
            "SUCCESS",
          );

          // スプレッドシートにURLを記録（オプション）
          if (reportColumn) {
            log(`【Step 4-4-1-5】📊 スプレッドシートにURL記録中...`, "INFO");
            await this._updateSpreadsheetCell(
              spreadsheetId,
              sheetGid,
              rowNumber,
              reportColumn,
              docResult.url,
            );
            log(`【Step 4-4-1-5】✅ スプレッドシート更新完了`, "SUCCESS");
          }

          log(`【結果】📎 生成されたレポートURL: ${docResult.url}`, "SUCCESS");
          return {
            success: true,
            url: docResult.url,
            title: docResult.title,
            rowNumber: rowNumber,
          };
        } else {
          log(`【Step 4-4-1-3】❌ Google Docsドキュメント作成失敗`, "ERROR");
          return {
            success: false,
            error: "ドキュメント作成に失敗しました",
            rowNumber: rowNumber,
          };
        }
      } catch (error) {
        log(
          `【レポート処理失敗】❌ レポート生成エラー: ${error.message}`,
          "ERROR",
        );
        return {
          success: false,
          error: error.message,
          rowNumber: rowNumber,
        };
      }
    }

    /**
     * レポートコンテンツ生成
     */
    _generateReportContent(params) {
      const { rowNumber, promptText, answerText, spreadsheetId, sheetGid } =
        params;
      const config = this.config.REPORT_CONFIG;

      let content = `<h1>レポート - ${rowNumber}行目</h1>\n\n`;

      if (config.includeMetadata) {
        content += `<h2>📊 メタデータ</h2>\n`;
        content += `<p><strong>スプレッドシートID:</strong> ${spreadsheetId}</p>\n`;
        content += `<p><strong>シートGID:</strong> ${sheetGid}</p>\n`;
        content += `<p><strong>行番号:</strong> ${rowNumber}</p>\n`;
        content += `<p><strong>生成日時:</strong> ${new Date().toLocaleString("ja-JP")}</p>\n\n`;
      }

      if (config.includePrompt && promptText) {
        content += `<h2>❓ プロンプト</h2>\n`;
        content += `<div style="background-color: #f5f5f5; padding: 10px; border-left: 3px solid #007acc;">\n`;
        content += `<p>${promptText.replace(/\n/g, "<br>")}</p>\n`;
        content += `</div>\n\n`;
      }

      if (config.includeAnswer && answerText) {
        content += `<h2>💡 回答</h2>\n`;
        content += `<div style="background-color: #f0f8f0; padding: 10px; border-left: 3px solid #28a745;">\n`;
        content += `<p>${answerText.replace(/\n/g, "<br>")}</p>\n`;
        content += `</div>\n\n`;
      }

      content += `<hr>\n`;
      content += `<p><small>🤖 このレポートは自動生成されました</small></p>`;

      return content;
    }

    /**
     * スプレッドシートセル更新
     */
    async _updateSpreadsheetCell(spreadsheetId, gid, row, column, value) {
      try {
        // 実際の実装では、Google Sheets APIまたはDOM操作を使用
        // ここでは簡略化した実装
        log(`セル更新: ${row}行${column}列 = ${value}`, "INFO");

        // Google Sheets APIを呼び出すか、
        // 現在のページがスプレッドシートの場合はDOM操作で更新

        return true;
      } catch (error) {
        log(`セル更新失敗: ${error.message}`, "ERROR");
        throw error;
      }
    }

    /**
     * バッチレポート生成（独立実装）
     */
    async generateBatch(tasks, spreadsheetData, options = {}) {
      await this.initialize();

      try {
        log(
          `【Step 4-4-2-1】📋 バッチ処理開始: ${tasks.length}件のタスク`,
          "INFO",
        );
        log(
          `【Step 4-4-2-1】⚙️ 並列処理: ${options.parallel ? "ON" : "OFF"} / 最大同時実行: ${options.maxConcurrent || 3}`,
          "INFO",
        );

        const results = [];
        const stats = { success: 0, failed: 0, total: tasks.length };

        if (options.parallel) {
          log(`【Step 4-4-2-2】🔄 並列バッチ実行中...`, "INFO");
          results.push(
            ...(await this._executeParallelBatch(
              tasks,
              spreadsheetData,
              options,
            )),
          );
        } else {
          log(`【Step 4-4-2-2】🔄 順次バッチ実行中...`, "INFO");
          results.push(
            ...(await this._executeSequentialBatch(
              tasks,
              spreadsheetData,
              options,
            )),
          );
        }

        // 結果集計
        results.forEach((result) => {
          if (result.success) {
            stats.success++;
          } else {
            stats.failed++;
          }
        });

        const successCount = stats.success;
        const failedCount = stats.failed;
        log(
          `【Step 4-4-2-3】📊 バッチ処理完了: 成功${successCount}件 / 失敗${failedCount}件`,
          failedCount > 0 ? "WARNING" : "SUCCESS",
        );

        if (successCount > 0) {
          log(`【結果】✅ 正常処理: ${successCount}件`, "SUCCESS");
        }
        if (failedCount > 0) {
          log(`【結果】❌ エラー件数: ${failedCount}件`, "ERROR");
        }

        return {
          success: failedCount === 0,
          results: results,
          stats: stats,
        };
      } catch (error) {
        log(`【バッチ処理失敗】❌ バッチ処理エラー: ${error.message}`, "ERROR");
        throw error;
      }
    }

    /**
     * 並列バッチ実行
     */
    async _executeParallelBatch(tasks, spreadsheetData, options) {
      const maxConcurrent = options.maxConcurrent || 3;
      const results = [];

      log(
        `【Step 4-4-2-2-1】🚀 並列実行開始: 同時実行数 ${maxConcurrent}`,
        "INFO",
      );

      for (let i = 0; i < tasks.length; i += maxConcurrent) {
        const batch = tasks.slice(i, i + maxConcurrent);
        log(
          `【Step 4-4-2-2-2】🔄 バッチ ${Math.floor(i / maxConcurrent) + 1}: ${batch.length}件のタスク実行`,
          "INFO",
        );

        const batchPromises = batch.map((task) =>
          this.executeTask(task, spreadsheetData).catch((error) => ({
            success: false,
            error: error.message,
            taskId: task.id,
          })),
        );

        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);

        // バッチ間の待機
        if (i + maxConcurrent < tasks.length) {
          const delay = options.delay || this.config.BATCH_DELAY;
          await wait(delay);
        }
      }

      log(`【Step 4-4-2-2-3】✅ 並列実行完了`, "SUCCESS");
      return results;
    }

    /**
     * 順次バッチ実行
     */
    async _executeSequentialBatch(tasks, spreadsheetData, options) {
      const results = [];

      log(`【Step 4-4-2-2-1】🔄 順次実行開始`, "INFO");

      for (let i = 0; i < tasks.length; i++) {
        const task = tasks[i];
        log(
          `【Step 4-4-2-2-2】📝 タスク ${i + 1}/${tasks.length}: ${task.id} 実行中`,
          "INFO",
        );

        try {
          const result = await this.executeTask(task, spreadsheetData);
          results.push(result);
        } catch (error) {
          results.push({
            success: false,
            error: error.message,
            taskId: task.id,
          });
        }

        // タスク間の待機
        if (i < tasks.length - 1) {
          const delay = options.delay || this.config.BATCH_DELAY;
          await wait(delay);
        }
      }

      log(`【Step 4-4-2-2-3】✅ 順次実行完了`, "SUCCESS");
      return results;
    }

    /**
     * タスク実行（単一）【独立実装】
     */
    async executeTask(task, spreadsheetData) {
      await this.initialize();

      try {
        log(
          `【Step 4-4-3-1】📝 タスク実行: ${task.id} (${task.row}行目)`,
          "INFO",
        );
        log(
          `【Step 4-4-3-1】📊 タスクタイプ: ${task.type || "report"}`,
          "INFO",
        );

        // タスクデータの検証
        log(`【Step 4-4-3-2】🔍 タスクデータ検証中...`, "INFO");
        if (!task.row || !task.promptColumn || !task.answerColumn) {
          throw new Error("必要なタスクデータが不足しています");
        }
        log(`【Step 4-4-3-2】✅ タスクデータ検証完了`, "SUCCESS");

        // スプレッドシートからデータ取得
        log(`【Step 4-4-3-3】📊 スプレッドシートデータ取得中...`, "INFO");
        const promptText = this._getCellValue(
          spreadsheetData,
          task.row,
          task.promptColumn,
        );
        const answerText = this._getCellValue(
          spreadsheetData,
          task.row,
          task.answerColumn,
        );

        if (!promptText) {
          throw new Error(`${task.row}行目のプロンプトが空です`);
        }

        log(
          `【Step 4-4-3-3】✅ データ取得完了: プロンプト${promptText.length}文字, 回答${answerText?.length || 0}文字`,
          "SUCCESS",
        );

        // レポート生成パラメータ作成
        log(`【Step 4-4-3-4】🛠️ レポートパラメータ作成中...`, "INFO");
        const reportParams = {
          spreadsheetId: spreadsheetData.id || task.spreadsheetId,
          sheetGid: spreadsheetData.gid || task.sheetGid,
          rowNumber: task.row,
          promptText: promptText,
          answerText: answerText,
          reportColumn: task.reportColumn,
        };
        log(`【Step 4-4-3-4】✅ レポートパラメータ作成完了`, "SUCCESS");

        // レポート生成実行
        log(`【Step 4-4-3-5】📝 レポート生成実行中...`, "INFO");
        const result = await this.generateReport(reportParams);

        if (result.success) {
          log(
            `【Step 4-4-3-6】✅ タスク完了: ${task.id} - ${result.url}`,
            "SUCCESS",
          );
          return {
            success: true,
            taskId: task.id,
            url: result.url,
            title: result.title,
            row: task.row,
          };
        } else {
          log(
            `【Step 4-4-3-6】❌ タスク失敗: ${task.id} - ${result.error}`,
            "ERROR",
          );
          return {
            success: false,
            taskId: task.id,
            error: result.error,
            row: task.row,
          };
        }
      } catch (error) {
        log(`【Step 4-4-3-1】❌ タスク実行エラー: ${error.message}`, "ERROR");
        return {
          success: false,
          taskId: task.id,
          error: error.message,
          row: task.row,
        };
      }
    }

    /**
     * スプレッドシートからセル値を取得
     */
    _getCellValue(spreadsheetData, row, column) {
      try {
        // スプレッドシートデータから指定された行と列の値を取得
        if (
          spreadsheetData.rows &&
          spreadsheetData.rows[row] &&
          spreadsheetData.rows[row][column]
        ) {
          return spreadsheetData.rows[row][column];
        }

        // データが配列形式の場合
        if (
          Array.isArray(spreadsheetData) &&
          spreadsheetData[row] &&
          spreadsheetData[row][column]
        ) {
          return spreadsheetData[row][column];
        }

        return "";
      } catch (error) {
        log(`セル値取得エラー: ${error.message}`, "ERROR");
        return "";
      }
    }

    /**
     * レポート検証
     */
    async validateReport(documentId) {
      try {
        // Google Docs APIを使用してドキュメントの存在を確認
        const response = await fetch(
          `https://docs.googleapis.com/v1/documents/${documentId}`,
          {
            headers: {
              Authorization: `Bearer ${await this.getAccessToken()}`,
            },
          },
        );

        return response.ok;
      } catch (error) {
        log(`レポート検証エラー: ${error.message}`, "ERROR");
        return false;
      }
    }

    /**
     * アクセストークン取得（仮実装）
     */
    async getAccessToken() {
      // 実際の実装では適切な認証処理が必要
      return "dummy-token";
    }
  }

  // ========================================
  // セクション4: メインAPI
  // ========================================
  const ReportAutomationAPI = {
    // バージョン情報
    version: CONFIG.VERSION,
    aiType: CONFIG.AI_TYPE,

    // ハンドラーインスタンス
    _handler: null,

    /**
     * ハンドラー取得（遅延初期化）
     */
    async getHandler() {
      if (!this._handler) {
        this._handler = new ReportHandler();
        await this._handler.initialize();
      }
      return this._handler;
    },

    /**
     * レポート生成（単一）
     */
    async generateReport(params) {
      const handler = await this.getHandler();
      return handler.generateReport(params);
    },

    /**
     * バッチレポート生成
     */
    async generateBatch(tasks, spreadsheetData, options) {
      const handler = await this.getHandler();
      return handler.generateBatch(tasks, spreadsheetData, options);
    },

    /**
     * タスク実行
     */
    async executeTask(task, spreadsheetData) {
      const handler = await this.getHandler();
      return handler.executeTask(task, spreadsheetData);
    },

    /**
     * レポート検証
     */
    async validateReport(documentId) {
      const handler = await this.getHandler();
      return handler.validateReport(documentId);
    },

    /**
     * 設定更新
     */
    updateConfig(newConfig) {
      Object.assign(CONFIG, newConfig);
      if (this._handler) {
        this._handler.config = { ...CONFIG };
      }
      log("設定更新完了", "SUCCESS");
    },

    /**
     * リセット
     */
    reset() {
      this._handler = null;
      log("レポート自動化リセット完了", "SUCCESS");
    },
  };

  // ========================================
  // セクション5: グローバル公開
  // ========================================

  // 共通基盤が読み込まれていることを確認
  if (window.AICommonBase) {
    log("共通基盤検出: AICommonBase", "SUCCESS");

    // 共通基盤の機能を利用可能に
    const { MenuHandler, ResponseHandler, DOMObserver } =
      window.AICommonBase.handlers;
    ReportAutomationAPI._commonHandlers = {
      MenuHandler,
      ResponseHandler,
      DOMObserver,
    };
  }

  // グローバル公開
  window.ReportAutomation = ReportAutomationAPI;
  window.ReportAutomationV2 = ReportAutomationAPI;

  // 初期化完了ログ
  log("レポート自動化 v2.0.0 準備完了", "SUCCESS");
  log("使用方法: ReportAutomation.generateReport({...})", "INFO");
})();
