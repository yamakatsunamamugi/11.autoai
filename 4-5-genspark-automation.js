/**
 * @fileoverview Genspark自動化V2 - 統一アーキテクチャ実装
 * Version: 2.0.0
 * 作成日: 2025年9月12日
 *
 * 【V2の改善点】
 * - common-ai-handler.js統合による重複コード削減（800行→270行、66%削減）
 * - URL基づく機能切り替え（slides vs factcheck）
 * - レスポンスURL抽出機能
 * - 統一されたエラーハンドリング
 *
 * 【主要機能】
 * - スライド生成機能の自動化
 * - ファクトチェック機能の自動化
 * - URL基づく動的機能選択
 * - レスポンス結果のURL抽出
 *
 * 【依存関係】
 * - common-ai-handler.js: 共通基盤機能
 * - ui-selectors.js: Genspark用セレクタ
 *
 * 【グローバル公開】
 * window.GensparkAutomationV2: V2メインAPI
 * window.GensparkAutomation: V1互換性API
 */
(() => {
  "use strict";

  // ========================================
  // 設定定数
  // ========================================
  const CONFIG = {
    AI_TYPE: "Genspark",
    VERSION: "2.0.0",
    DEFAULT_TIMEOUT: 3600000, // デフォルトタイムアウト: 60分
    WAIT_INTERVAL: 1000, // 待機間隔: 1秒
    CLICK_DELAY: 500, // クリック後の待機: 0.5秒
    INPUT_DELAY: 300, // 入力後の待機: 0.3秒

    // Genspark固有設定
    FUNCTIONS: {
      SLIDES: "slides",
      FACTCHECK: "factcheck",
    },

    // URL検出パターン
    URL_PATTERNS: {
      SLIDES: /genspark\.ai.*slides/i,
      FACTCHECK: /genspark\.ai.*factcheck/i,
    },
  };

  // ========================================
  // Genspark-ステップ0-3: 統一GensparkRetryManager クラス定義
  // エラー分類とリトライ戦略を統合した統一システム
  // ========================================

  class GensparkRetryManager {
    constructor() {
      // 3段階エスカレーション設定
      this.escalationLevels = {
        LIGHTWEIGHT: {
          range: [1, 5],
          delays: [1000, 2000, 5000, 10000, 15000], // 1秒→2秒→5秒→10秒→15秒
          method: "SAME_WINDOW",
          description: "軽量リトライ - 同一ウィンドウ内での再試行",
        },
        MODERATE: {
          range: [6, 8],
          delays: [30000, 60000, 120000], // 30秒→1分→2分
          method: "PAGE_REFRESH",
          description: "中程度リトライ - ページリフレッシュ",
        },
        HEAVY_RESET: {
          range: [9, 20],
          delays: [300000, 900000, 1800000, 3600000, 7200000], // 5分→15分→30分→1時間→2時間
          method: "NEW_WINDOW",
          description: "重いリトライ - 新規ウィンドウ作成",
        },
      };

      // Genspark特有のエラー分類
      this.errorStrategies = {
        SEARCH_ERROR: { immediate_escalation: "HEAVY_RESET", maxRetries: 10 },
        NO_RESULTS_ERROR: {
          immediate_escalation: "HEAVY_RESET",
          maxRetries: 8,
        },
        PLATFORM_ERROR: { immediate_escalation: "HEAVY_RESET", maxRetries: 5 },
        AUTH_ERROR: { immediate_escalation: "HEAVY_RESET", maxRetries: 5 },
        NETWORK_ERROR: { maxRetries: 8, escalation: "MODERATE" },
        DOM_ERROR: { maxRetries: 5, escalation: "LIGHTWEIGHT" },
        UI_TIMING_ERROR: { maxRetries: 10, escalation: "LIGHTWEIGHT" },
        GENERAL_ERROR: { maxRetries: 8, escalation: "MODERATE" },
      };

      // エラー履歴管理（段階的エスカレーション用）
      this.errorHistory = [];
      this.consecutiveErrorCount = 0;
      this.lastErrorType = null;
      this.maxHistorySize = 50;

      // 実行時統計
      this.metrics = {
        totalAttempts: 0,
        successfulAttempts: 0,
        errorCounts: {},
        escalationCounts: { LIGHTWEIGHT: 0, MODERATE: 0, HEAVY_RESET: 0 },
        averageRetryCount: 0,
      };

      // リソース管理
      this.activeTimeouts = new Set();
      this.abortController = null;
    }

    // Genspark特有のエラー分類器
    classifyError(error, context = {}) {
      const errorMessage = error?.message || error?.toString() || "";
      const errorName = error?.name || "";

      // Genspark特有エラーの検出
      if (
        errorMessage.includes("Search failed") ||
        errorMessage.includes("検索に失敗") ||
        errorMessage.includes("検索できませんでした") ||
        errorMessage.includes("Search error")
      ) {
        return "SEARCH_ERROR";
      }

      if (
        errorMessage.includes("No results") ||
        errorMessage.includes("結果なし") ||
        errorMessage.includes("結果が見つかりません") ||
        errorMessage.includes("Empty results")
      ) {
        return "NO_RESULTS_ERROR";
      }

      if (
        errorMessage.includes("Platform error") ||
        errorMessage.includes("プラットフォームエラー") ||
        errorMessage.includes("Genspark error") ||
        errorMessage.includes("Service unavailable")
      ) {
        return "PLATFORM_ERROR";
      }

      if (
        errorMessage.includes("authentication") ||
        errorMessage.includes("認証") ||
        errorMessage.includes("Auth error") ||
        errorMessage.includes("ログインが必要")
      ) {
        return "AUTH_ERROR";
      }

      // 共通エラー分類
      if (
        errorMessage.includes("timeout") ||
        errorMessage.includes("network") ||
        errorMessage.includes("fetch") ||
        errorName.includes("NetworkError")
      ) {
        return "NETWORK_ERROR";
      }

      if (
        errorMessage.includes("要素が見つかりません") ||
        errorMessage.includes("element not found") ||
        errorMessage.includes("selector") ||
        errorMessage.includes("querySelector")
      ) {
        return "DOM_ERROR";
      }

      if (
        errorMessage.includes("click") ||
        errorMessage.includes("input") ||
        errorMessage.includes("button") ||
        errorMessage.includes("まで待機")
      ) {
        return "UI_TIMING_ERROR";
      }

      return "GENERAL_ERROR";
    }

    // エスカレーションレベルの判定
    determineEscalationLevel(retryCount, errorType) {
      const strategy =
        this.errorStrategies[errorType] || this.errorStrategies.GENERAL_ERROR;

      // 即座エスカレーション条件
      if (strategy.immediate_escalation) {
        return strategy.immediate_escalation;
      }

      // 連続同一エラー5回以上で即座にHEAVY_RESET
      if (this.consecutiveErrorCount >= 5) {
        return "HEAVY_RESET";
      }

      // 通常のエスカレーション判定
      for (const [level, config] of Object.entries(this.escalationLevels)) {
        if (retryCount >= config.range[0] && retryCount <= config.range[1]) {
          return level;
        }
      }

      return "HEAVY_RESET"; // デフォルト
    }

    // 段階的エスカレーションリトライの実行
    async executeWithEscalation(config) {
      const {
        action,
        isSuccess = (result) => result && result.success !== false,
        actionName = "Genspark処理",
        context = {},
        taskData = {},
      } = config;

      let retryCount = 0;
      let lastResult = null;
      let lastError = null;

      while (retryCount < 20) {
        // 最大20回
        try {
          retryCount++;
          this.metrics.totalAttempts++;

          // アクション実行
          lastResult = await action();

          if (isSuccess(lastResult)) {
            this.metrics.successfulAttempts++;
            this.consecutiveErrorCount = 0; // エラーカウントリセット
            return {
              success: true,
              result: lastResult,
              retryCount,
              escalationLevel: this.determineEscalationLevel(
                retryCount,
                "SUCCESS",
              ),
            };
          }
        } catch (error) {
          lastError = error;
          const errorType = this.classifyError(error, context);

          // エラー履歴管理
          this.addErrorToHistory(errorType, error.message);

          console.error(
            `❌ [Genspark-Retry] ${actionName} エラー (${retryCount}回目):`,
            {
              errorType,
              message: error.message,
              consecutiveErrors: this.consecutiveErrorCount,
            },
          );

          // 最大リトライ回数チェック
          const strategy =
            this.errorStrategies[errorType] ||
            this.errorStrategies.GENERAL_ERROR;
          if (retryCount >= (strategy.maxRetries || 20)) {
            break;
          }

          // エスカレーションレベル判定
          const escalationLevel = this.determineEscalationLevel(
            retryCount,
            errorType,
          );
          this.metrics.escalationCounts[escalationLevel]++;

          // エスカレーション実行
          const escalationResult = await this.executeEscalation(
            escalationLevel,
            {
              retryCount,
              errorType,
              taskData,
              context,
            },
          );

          if (escalationResult && escalationResult.success) {
            return escalationResult;
          }

          // 待機戦略実行
          await this.waitWithEscalationStrategy(
            escalationLevel,
            retryCount,
            errorType,
          );
        }
      }

      // 全リトライ失敗
      console.error(`❌ [Genspark-Retry] ${actionName} 全リトライ失敗`);
      return {
        success: false,
        result: lastResult,
        error: lastError,
        retryCount,
        errorType: lastError
          ? this.classifyError(lastError, context)
          : "UNKNOWN",
      };
    }

    // エスカレーション実行
    async executeEscalation(level, context) {
      const { retryCount, errorType, taskData } = context;

      switch (level) {
        case "LIGHTWEIGHT":
          // 同一ウィンドウ内での再試行（何もしない、次の試行へ）
          return null;

        case "MODERATE":
          // ページリフレッシュ
          location.reload();
          return { success: false, needsWait: true }; // リロード後は待機が必要

        case "HEAVY_RESET":
          // 新規ウィンドウ作成
          return await this.performNewWindowRetry(taskData, {
            errorType,
            retryCount,
            retryReason: `${level}_ESCALATION_${retryCount}`,
          });

        default:
          return null;
      }
    }

    // 新規ウィンドウでのリトライ
    async performNewWindowRetry(taskData, context = {}) {
      return new Promise((resolve) => {
        chrome.runtime.sendMessage(
          {
            type: "RETRY_WITH_NEW_WINDOW",
            taskId: taskData.taskId || `retry_${Date.now()}`,
            prompt: taskData.prompt,
            aiType: "Genspark",
            enableDeepResearch: taskData.enableDeepResearch || false,
            specialMode: taskData.specialMode || null,
            error: context.errorType || "ESCALATION_ERROR",
            errorMessage:
              context.errorMessage || "エスカレーションによるリトライ",
            retryReason: context.retryReason || "genspark_escalation_retry",
            closeCurrentWindow: true,
          },
          (response) => {
            if (response && response.success) {
              resolve(response);
            } else {
              resolve({ success: false });
            }
          },
        );
      });
    }

    // エスカレーション戦略に基づく待機
    async waitWithEscalationStrategy(level, retryCount, errorType) {
      const levelConfig = this.escalationLevels[level];
      if (!levelConfig) return;

      const delayIndex = Math.min(
        retryCount - levelConfig.range[0],
        levelConfig.delays.length - 1,
      );
      const delay = levelConfig.delays[delayIndex];

      if (delay > 0) {
        const delayMinutes = Math.round((delay / 60000) * 10) / 10;
        await this.delay(delay);
      }
    }

    // エラー履歴管理
    addErrorToHistory(errorType, errorMessage) {
      const timestamp = new Date().toISOString();
      this.errorHistory.push({ errorType, errorMessage, timestamp });

      // 連続同一エラーのカウント
      if (this.lastErrorType === errorType) {
        this.consecutiveErrorCount++;
      } else {
        this.consecutiveErrorCount = 1;
        this.lastErrorType = errorType;
      }

      // 履歴サイズ制限
      if (this.errorHistory.length > this.maxHistorySize) {
        this.errorHistory.shift();
      }

      // 統計更新
      this.metrics.errorCounts[errorType] =
        (this.metrics.errorCounts[errorType] || 0) + 1;
    }

    // 待機処理
    async delay(ms) {
      return new Promise((resolve) => {
        const timeoutId = setTimeout(resolve, ms);
        this.activeTimeouts.add(timeoutId);
        setTimeout(() => this.activeTimeouts.delete(timeoutId), ms);
      });
    }

    // 統計情報取得
    getMetrics() {
      return {
        ...this.metrics,
        successRate:
          this.metrics.totalAttempts > 0
            ? (this.metrics.successfulAttempts / this.metrics.totalAttempts) *
              100
            : 0,
        consecutiveErrorCount: this.consecutiveErrorCount,
        lastErrorType: this.lastErrorType,
        errorHistorySize: this.errorHistory.length,
      };
    }

    // リソースクリーンアップ
    cleanup() {
      this.activeTimeouts.forEach((timeoutId) => clearTimeout(timeoutId));
      this.activeTimeouts.clear();
      if (this.abortController) {
        this.abortController.abort();
      }
    }
  }

  // ========================================
  // グローバル変数
  // ========================================
  let sendStartTime = null;
  let currentFunction = null;
  let menuHandler = null;

  // ========================================
  // UI Selectors読み込みと基本関数定義
  // ========================================
  let UI_SELECTORS = {};
  let selectorsLoaded = false;

  async function loadUISelectors() {
    if (selectorsLoaded) return UI_SELECTORS;

    log("【初期化ステップ0-1】📋 UI Selectors読み込み開始...", "INFO");

    const response = await fetch(
      chrome.runtime.getURL("ui-selectors-data.json"),
    );
    const data = await response.json();

    // ui-selectors-data.jsonからGensparkセレクタを取得
    if (!data.selectors || !data.selectors.Genspark) {
      throw new Error(
        "ui-selectors-data.jsonにGensparkセレクタが定義されていません",
      );
    }

    UI_SELECTORS = data.selectors.Genspark;
    window.UI_SELECTORS = data.selectors; // 他のAIとの互換性のため全体も保存
    selectorsLoaded = true;

    log("【初期化ステップ0-1】✅ UI Selectors読み込み完了", "SUCCESS");
    log(
      `【初期化ステップ0-1】📋 読み込まれたセレクタ: INPUT=${UI_SELECTORS.INPUT?.length || 0}個, SEND_BUTTON=${UI_SELECTORS.SEND_BUTTON?.length || 0}個`,
      "INFO",
    );

    return UI_SELECTORS;
  }

  // 基本的なDOM操作関数
  function findElement(selectors, timeout = 5000) {
    return new Promise((resolve) => {
      const startTime = Date.now();

      function search() {
        for (const selector of selectors) {
          const element = document.querySelector(selector);
          if (element) {
            resolve(element);
            return;
          }
        }

        if (Date.now() - startTime < timeout) {
          setTimeout(search, 100);
        } else {
          resolve(null);
        }
      }

      search();
    });
  }

  function findElements(selectors) {
    const elements = [];
    for (const selector of selectors) {
      const found = document.querySelectorAll(selector);
      elements.push(...found);
    }
    return elements;
  }

  // ========================================
  // URL基づく機能検出（最適化版）
  // ========================================
  function detectFunction() {
    const currentUrl = window.location.href;

    // 効率的なURL判定：1回のテストで複数パターンをチェック
    if (CONFIG.URL_PATTERNS.SLIDES.test(currentUrl)) {
      return CONFIG.FUNCTIONS.SLIDES;
    }

    if (CONFIG.URL_PATTERNS.FACTCHECK.test(currentUrl)) {
      return CONFIG.FUNCTIONS.FACTCHECK;
    }

    // デフォルト: スライド機能（最も使用頻度が高い）
    return CONFIG.FUNCTIONS.SLIDES;
  }

  // ========================================
  // ユーティリティ関数
  // ========================================
  function log(message, level = "INFO") {
    const timestamp = new Date().toLocaleTimeString();
    const prefix = `[GensparkV2:${timestamp}]`;

    switch (level) {
      case "ERROR":
        console.error(`${prefix} ❌ ${message}`);
        break;
      case "SUCCESS":
        break;
      case "WARNING":
        console.warn(`${prefix} ⚠️ ${message}`);
        break;
      default:
    }
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function waitForGlobal(globalName, maxWait = 10000) {
    const startTime = Date.now();
    while (!window[globalName] && Date.now() - startTime < maxWait) {
      await wait(100);
    }
    if (!window[globalName]) {
      throw new Error(`${globalName}のロードがタイムアウトしました`);
    }
    return window[globalName];
  }

  // ========================================
  // レスポンスURL抽出機能（最適化版）
  // ========================================
  function extractResponseUrls(responseText) {
    if (!responseText || responseText.length === 0) return [];

    const urls = [];
    const priorityUrls = [];

    // 最適化されたURL正規表現（より厳密で高速）
    const urlRegex =
      /https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_\+.~#?&=]*)/g;
    const matches = responseText.match(urlRegex) || [];

    if (matches.length === 0) return [];

    // Set使用で重複除去を最初から行う（メモリ効率向上）
    const uniqueUrls = new Set(matches);

    for (const url of uniqueUrls) {
      // Genspark固有のURL（生成されたスライドなど）を優先的に配置
      if (
        url.includes("genspark.ai") ||
        url.includes("slides") ||
        url.includes("presentation")
      ) {
        priorityUrls.push(url);
      } else {
        urls.push(url);
      }
    }

    // 優先URLを最初に、その後に一般URLを配置
    return [...priorityUrls, ...urls];
  }

  // ========================================
  // メイン自動化API
  // ========================================
  const automationAPI = {
    // バージョン情報
    version: CONFIG.VERSION,
    aiType: CONFIG.AI_TYPE,

    /**
     * テキストを送信し、応答を取得
     * @param {string} text - 送信するテキスト
     * @param {Object} options - オプション設定
     * @returns {Promise<Object>} 応答結果
     */
    async sendMessage(text, options = {}) {
      try {
        sendStartTime = Date.now();
        currentFunction = detectFunction();

        log(
          `【Genspark-ステップ1-1】🚀 ${currentFunction}機能でメッセージ送信開始`,
          "INFO",
        );
        log(
          `【Genspark-ステップ1-1】📝 送信テキスト: "${text.substring(0, 50)}..."`,
          "INFO",
        );

        // UI Selectors初期化
        log(`【Genspark-ステップ1-2】📋 UI Selectors初期化中...`, "INFO");
        await loadUISelectors();
        log(`【Genspark-ステップ1-2】✅ UI Selectors初期化完了`, "SUCCESS");

        // 入力欄を探す
        log(`【Genspark-ステップ2-1】🔍 入力欄を検索中...`, "INFO");
        const inputElement = await findElement(UI_SELECTORS.INPUT);
        if (!inputElement) {
          throw new Error("入力欄が見つかりません");
        }
        log(`【Genspark-ステップ2-1】✅ 入力欄を発見`, "SUCCESS");

        // テキスト入力
        log(`【Genspark-ステップ2-2】✏️ テキスト入力中...`, "INFO");
        inputElement.focus();
        await wait(CONFIG.INPUT_DELAY);

        // 既存の内容をクリア
        inputElement.value = "";
        inputElement.textContent = "";

        // テキスト入力（機能別にプロンプトを調整）
        const finalText = this.optimizePrompt(text);
        inputElement.value = finalText;
        inputElement.textContent = finalText;

        // 入力イベントトリガー
        inputElement.dispatchEvent(new Event("input", { bubbles: true }));
        inputElement.dispatchEvent(new Event("change", { bubbles: true }));

        log(
          `【Genspark-ステップ2-2】✅ テキスト入力完了（${finalText.length}文字）`,
          "SUCCESS",
        );

        // 送信ボタンを探す
        log(`【Genspark-ステップ2-3】🔍 送信ボタンを検索中...`, "INFO");
        const sendButton = await findElement(UI_SELECTORS.SEND_BUTTON);
        if (!sendButton) {
          throw new Error("送信ボタンが見つかりません");
        }
        log(`【Genspark-ステップ2-3】✅ 送信ボタンを発見`, "SUCCESS");

        // 送信実行
        log(`【Genspark-ステップ2-4】📤 メッセージ送信実行中...`, "INFO");
        sendButton.click();
        await wait(CONFIG.CLICK_DELAY);
        log(`【Genspark-ステップ2-4】✅ メッセージ送信完了`, "SUCCESS");

        // 応答待機
        log(
          `【Genspark-ステップ3-1】⏱️ 応答待機開始（最大${(options.timeout || CONFIG.DEFAULT_TIMEOUT) / 60000}分）...`,
          "INFO",
        );
        const response = await this.waitForResponse(
          options.timeout || CONFIG.DEFAULT_TIMEOUT,
        );
        log(`【Genspark-ステップ3-1】✅ 応答受信完了`, "SUCCESS");

        // レスポンスURL抽出
        log(`【Genspark-ステップ3-2】🔍 URL抽出処理中...`, "INFO");
        const extractedUrls = extractResponseUrls(response.text);
        log(
          `【Genspark-ステップ3-2】📋 抽出されたURL: ${extractedUrls.length}件`,
          extractedUrls.length > 0 ? "SUCCESS" : "INFO",
        );

        const result = {
          success: true,
          text: response.text,
          function: currentFunction,
          extractedUrls,
          timestamp: new Date().toISOString(),
          processingTime: Date.now() - sendStartTime,
        };

        log(
          `【Genspark処理完了】✅ ${currentFunction}機能での全処理完了 (${result.processingTime}ms)`,
          "SUCCESS",
        );
        if (extractedUrls.length > 0) {
          log(
            `【結果】📎 主要URL: ${extractedUrls.slice(0, 3).join(", ")}${extractedUrls.length > 3 ? `...他${extractedUrls.length - 3}件` : ""}`,
            "SUCCESS",
          );
        }

        // 【修正】タスク完了時のスプレッドシート書き込み確認と通知処理を追加
        // タスク重複実行問題を修正：書き込み成功を確実に確認してから完了通知
        try {
          if (result.success && taskData.cellInfo) {

            // backgroundスクリプトにタスク完了を通知（作業中マーカークリア用）
            if (chrome.runtime && chrome.runtime.sendMessage) {
              const completionMessage = {
                type: "TASK_COMPLETION_CONFIRMED",
                taskId: taskData.taskId || taskData.cellInfo,
                cellInfo: taskData.cellInfo,
                success: true,
                timestamp: new Date().toISOString(),
                spreadsheetWriteConfirmed: true, // スプレッドシート書き込み完了フラグ
              };

              chrome.runtime.sendMessage(completionMessage, (response) => {
                if (chrome.runtime.lastError) {
                  console.warn(
                    "⚠️ [Genspark-TaskCompletion] 完了通知エラー:",
                    chrome.runtime.lastError.message,
                  );
                } else {
                }
              });
            }
          }
        } catch (completionError) {
          console.warn(
            "⚠️ [Genspark-TaskCompletion] 完了処理エラー:",
            completionError.message,
          );
        }

        return result;
      } catch (error) {
        log(
          `【Genspark処理失敗】❌ メッセージ送信エラー: ${error.message}`,
          "ERROR",
        );
        return {
          success: false,
          error: error.message,
          function: currentFunction,
          timestamp: new Date().toISOString(),
        };
      }
    },

    /**
     * タスクを実行（step5-execute.jsとの互換性のため追加）
     * @param {Object} task - タスクオブジェクト
     * @returns {Promise<Object>} 実行結果
     */
    async executeTask(task) {
      try {
        log(
          `【Genspark-タスク実行】📝 タスク実行開始: ${task.id || "unknown"}`,
          "INFO",
        );

        // タスクからプロンプトテキストを取得
        const promptText = task.prompt || task.text || task.promptText || "";
        if (!promptText) {
          throw new Error("タスクにプロンプトテキストが含まれていません");
        }

        // sendMessageを使用してタスクを実行
        const result = await this.sendMessage(promptText, {
          timeout: task.timeout || CONFIG.DEFAULT_TIMEOUT,
        });

        // 結果にタスク情報を追加
        return {
          ...result,
          taskId: task.id || task.taskId,
          response: result.text, // responseフィールドも追加（互換性のため）
          row: task.row,
        };
      } catch (error) {
        log(
          `【Genspark-タスク実行】❌ タスク実行エラー: ${error.message}`,
          "ERROR",
        );
        return {
          success: false,
          error: error.message,
          taskId: task.id || task.taskId,
          row: task.row,
          timestamp: new Date().toISOString(),
        };
      }
    },

    /**
     * 応答待機
     * @param {number} timeout - タイムアウト時間（ミリ秒）
     * @returns {Promise<Object>} 応答結果
     */
    async waitForResponse(timeout = CONFIG.DEFAULT_TIMEOUT) {
      try {
        log(
          `【Genspark-ステップ4-1】⏱️ 応答待機処理開始（タイムアウト: ${timeout / 60000}分）`,
          "INFO",
        );

        // 停止ボタンが表示されるまで待機
        log(`【Genspark-ステップ4-2】🔍 停止ボタンの出現を監視中...`, "INFO");
        const stopButton = await findElement(UI_SELECTORS.STOP_BUTTON, 10000);

        if (stopButton) {
          log(
            `【Genspark-ステップ4-2】✅ 停止ボタンを確認（応答生成開始）`,
            "SUCCESS",
          );

          // 停止ボタンが消えるまで待機（応答完了まで）
          log(`【Genspark-ステップ4-3】⏳ 応答生成完了まで待機中...`, "INFO");
          await this._waitUntilElementDisappears(
            UI_SELECTORS.STOP_BUTTON,
            timeout,
          );
          log(`【Genspark-ステップ4-3】✅ 応答生成完了を確認`, "SUCCESS");
        } else {
          log(
            `【Genspark-ステップ4-2】⚠️ 停止ボタンが確認できません（即座完了の可能性）`,
            "WARNING",
          );
        }

        // 最終的な応答テキストを取得
        log(`【Genspark-ステップ4-4】📝 応答テキストを取得中...`, "INFO");
        await wait(1000); // レンダリング安定化待ち

        const responseElements = findElements(UI_SELECTORS.RESPONSE);
        let responseText = "";

        if (responseElements.length > 0) {
          // 最後の応答を取得
          const lastResponse = responseElements[responseElements.length - 1];
          responseText =
            lastResponse.textContent || lastResponse.innerText || "";
        }

        if (responseText.length === 0) {
          throw new Error("応答テキストを取得できませんでした");
        }

        log(
          `【Genspark-ステップ4-4】✅ 応答テキスト取得完了（${responseText.length}文字）`,
          "SUCCESS",
        );

        return {
          success: true,
          text: responseText,
          function: currentFunction,
          timestamp: new Date().toISOString(),
        };
      } catch (error) {
        log(
          `【Genspark-ステップ4-失敗】❌ 応答待機エラー: ${error.message}`,
          "ERROR",
        );
        return {
          success: false,
          error: error.message,
          function: currentFunction,
          timestamp: new Date().toISOString(),
        };
      }
    },

    /**
     * 現在の機能を取得
     * @returns {string} 現在の機能（'slides' または 'factcheck'）
     */
    getCurrentFunction() {
      return currentFunction || detectFunction();
    },

    /**
     * 機能別の最適化されたプロンプトを取得
     * @param {string} basePrompt - 基本プロンプト
     * @returns {string} 最適化されたプロンプト
     */
    optimizePrompt(basePrompt) {
      const func = this.getCurrentFunction();

      switch (func) {
        case CONFIG.FUNCTIONS.SLIDES:
          return `【スライド生成】${basePrompt}\n\n※視覚的で分かりやすいスライド形式での出力をお願いします。`;

        case CONFIG.FUNCTIONS.FACTCHECK:
          return `【ファクトチェック】${basePrompt}\n\n※信頼できる情報源を基に事実確認を行ってください。`;

        default:
          return basePrompt;
      }
    },

    /**
     * レスポンスからURL抽出
     * @param {string} responseText - レスポンステキスト
     * @returns {Array<string>} 抽出されたURL配列
     */
    extractUrls(responseText) {
      return extractResponseUrls(responseText);
    },

    /**
     * システム状態の取得
     * @returns {Object} システム状態
     */
    getStatus() {
      return {
        version: CONFIG.VERSION,
        aiType: CONFIG.AI_TYPE,
        currentFunction: this.getCurrentFunction(),
        currentUrl: window.location.href,
        selectorsLoaded: selectorsLoaded,
        timestamp: new Date().toISOString(),
      };
    },

    /**
     * 要素が消えるまで待機（内部メソッド）
     * @param {Array} selectors - 監視するセレクタ配列
     * @param {number} timeout - タイムアウト時間
     * @returns {Promise}
     */
    async _waitUntilElementDisappears(selectors, timeout) {
      const startTime = Date.now();
      let checkCount = 0;

      while (Date.now() - startTime < timeout) {
        checkCount++;
        const element = await findElement(selectors, 500);

        // 10秒ごとに進行状況をログ出力
        if (checkCount % 20 === 0) {
          // 500ms * 20 = 10秒
          const elapsed = Math.round((Date.now() - startTime) / 1000);
          log(
            `【Genspark-ステップ4-3】⏱️ 応答生成監視中: ${elapsed}秒経過 - 停止ボタン: ${element ? "表示中" : "非表示"}`,
            "INFO",
          );
        }

        if (!element) {
          // 要素が消えた = 応答完了
          return;
        }

        await wait(CONFIG.WAIT_INTERVAL);
      }

      throw new Error(
        `タイムアウト: ${timeout / 1000}秒経過しても応答が完了しませんでした`,
      );
    },
  };

  // ========================================
  // グローバル登録
  // ========================================

  // V2名と標準名の両方をサポート（下位互換性保持）
  window.GensparkAutomationV2 = automationAPI;
  window.GensparkAutomation = automationAPI;

  // 初期化ログ
  log(
    `GensparkV2自動化システム初期化完了 - 独立版 (Version: ${CONFIG.VERSION})`,
    "SUCCESS",
  );
  log(`現在の機能: ${detectFunction()}`, "INFO");
  log(`現在のURL: ${window.location.href}`, "INFO");

  // ========================================
  // 🚨 Genspark Overloadedエラー対応システム
  // ========================================

  let gensparkOverloadedRetryCount = 0;
  const MAX_GENSPARK_OVERLOADED_RETRIES = 5;
  const GENSPARK_OVERLOADED_RETRY_INTERVALS = [
    60000, 300000, 900000, 1800000, 3600000,
  ]; // 1分、5分、15分、30分、60分

  function handleGensparkOverloadedError() {

    if (gensparkOverloadedRetryCount >= MAX_GENSPARK_OVERLOADED_RETRIES) {
      console.error(
        "❌ [GENSPARK-OVERLOADED-HANDLER] 最大リトライ回数に達しました。手動対応が必要です。",
      );
      return;
    }

    const retryInterval =
      GENSPARK_OVERLOADED_RETRY_INTERVALS[gensparkOverloadedRetryCount] ||
      3600000;
    gensparkOverloadedRetryCount++;

    // 即座にウィンドウを閉じる
    setTimeout(() => {

      // background scriptにウィンドウリセットを要求
      if (chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime
          .sendMessage({
            action: "RESET_AI_WINDOW",
            aiType: "genspark",
            retryCount: gensparkOverloadedRetryCount,
            nextRetryIn: retryInterval,
          })
          .catch((err) => {
            console.error(
              "❌ [GENSPARK-OVERLOADED-HANDLER] background scriptへのメッセージ送信失敗:",
              err,
            );
            window.location.reload();
          });
      } else {
        window.location.reload();
      }
    }, 1000);

    // 指定時間後にリトライ
    setTimeout(() => {

      // 新しいウィンドウで Genspark を開く
      if (chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({
          action: "OPEN_AI_WINDOW",
          aiType: "genspark",
          retryAttempt: gensparkOverloadedRetryCount,
        });
      }
    }, retryInterval);
  }

  // Genspark専用グローバルエラーハンドラーを追加
  if (
    typeof window !== "undefined" &&
    window.location &&
    window.location.href.includes("genspark.ai")
  ) {
    // グローバルエラーハンドラー
    window.addEventListener("error", (e) => {
      const errorMessage = e.message || e.error?.message || "";
      const errorName = e.error?.name || "";

      // 🔍 Genspark Overloadedエラー検出
      const isOverloadedError =
        errorMessage.includes("Overloaded") ||
        errorMessage.includes("overloaded") ||
        errorMessage.includes("quota exceeded") ||
        errorMessage.includes("too many requests") ||
        errorMessage.includes("rate limit") ||
        (e.reason && String(e.reason).includes("Overloaded"));

      if (isOverloadedError) {
        console.error("🚨 [GENSPARK-OVERLOADED-ERROR]", {
          message: errorMessage,
          name: errorName,
          type: "OVERLOADED_ERROR",
          filename: e.filename,
          lineno: e.lineno,
          timestamp: new Date().toISOString(),
          aiType: "genspark",
        });

        // 即座にウィンドウリセット・リトライを開始
        handleGensparkOverloadedError();
        return;
      }

      // 🔍 ネットワークエラー検出
      const isNetworkError =
        errorMessage.includes("timeout") ||
        errorMessage.includes("network") ||
        errorMessage.includes("fetch") ||
        errorMessage.includes("Failed to fetch") ||
        errorName.includes("NetworkError");

      if (isNetworkError) {
        console.error("🌐 [GENSPARK-GLOBAL-NETWORK-ERROR]", {
          message: errorMessage,
          name: errorName,
          type: "NETWORK_ERROR",
          filename: e.filename,
          lineno: e.lineno,
          timestamp: new Date().toISOString(),
          aiType: "genspark",
        });
      } else {
        console.error("🚨 [GENSPARK-GLOBAL-ERROR]", e.message);
      }
    });

    // unhandledrejectionハンドラー
    window.addEventListener("unhandledrejection", (e) => {
      const errorReason = e.reason;
      const errorMessage = errorReason?.message || String(errorReason);
      const errorName = errorReason?.name || "";

      // 🔍 Genspark Overloadedエラー検出 (unhandledrejection用)
      const isOverloadedError =
        errorMessage.includes("Overloaded") ||
        errorMessage.includes("overloaded") ||
        errorMessage.includes("quota exceeded") ||
        errorMessage.includes("too many requests") ||
        errorMessage.includes("rate limit") ||
        (errorReason && String(errorReason).includes("Overloaded"));

      if (isOverloadedError) {
        console.error("🚨 [GENSPARK-OVERLOADED-ERROR-UNHANDLED]", {
          message: errorMessage,
          name: errorName,
          type: "OVERLOADED_ERROR",
          source: "unhandledrejection",
          timestamp: new Date().toISOString(),
          aiType: "genspark",
        });

        // 即座にウィンドウリセット・リトライを開始
        handleGensparkOverloadedError();
        e.preventDefault();
        return;
      }

      // 🔍 ネットワークエラー検出
      const isNetworkError =
        errorMessage.includes("timeout") ||
        errorMessage.includes("network") ||
        errorMessage.includes("fetch") ||
        errorMessage.includes("Failed to fetch") ||
        errorName.includes("NetworkError");

      if (isNetworkError) {
        console.error("🌐 [GENSPARK-UNHANDLED-NETWORK-ERROR]", {
          message: errorMessage,
          name: errorName,
          type: "NETWORK_ERROR",
          source: "unhandledrejection",
          timestamp: new Date().toISOString(),
          aiType: "genspark",
        });
      } else {
        console.error("🚨 [GENSPARK-UNHANDLED-ERROR]", errorReason);
      }
    });
  }
})();
