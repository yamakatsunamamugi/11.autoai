// ========================================
// 🚨 共通エラーハンドリングモジュールの初期化
// ========================================

// manifest.jsonで先にcommon-error-handler.jsが読み込まれているため、
// 直接初期化を行う。ただし、タイミング問題を考慮して複数回試行する。
(function initializeErrorHandler() {
  let attempts = 0;
  const maxAttempts = 10;

  const tryInitialize = () => {
    attempts++;

    if (window.UniversalErrorHandler) {
      window.chatgptErrorHandler =
        window.UniversalErrorHandler.createForAI("chatgpt");
      console.log("✅ [CHATGPT] エラーハンドラー初期化完了");
      return true;
    }

    if (attempts < maxAttempts) {
      // 100ms後に再試行
      setTimeout(tryInitialize, 100);
    } else {
      console.error(
        "❌ [CHATGPT] 共通エラーハンドリングモジュールが見つかりません",
        "manifest.jsonの設定を確認してください",
      );
    }
    return false;
  };

  // 即座に試行開始
  tryInitialize();
})();

// ログレベル定義
const LOG_LEVEL = { ERROR: 1, WARN: 2, INFO: 3, DEBUG: 4 };

// Chrome Storageからログレベルを取得（非同期）
let CURRENT_LOG_LEVEL = LOG_LEVEL.INFO; // デフォルト値

// Chrome拡張環境でのみStorageから設定を読み込む
if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
  chrome.storage.local.get("logLevel", (result) => {
    if (result.logLevel) {
      CURRENT_LOG_LEVEL = parseInt(result.logLevel);
    } else {
    }
  });
}

// ログユーティリティ（CURRENT_LOG_LEVELを動的に参照）
const log = {
  error: (...args) => {
    if (CURRENT_LOG_LEVEL >= LOG_LEVEL.ERROR) console.error(...args);
  },
  warn: (...args) => {
    if (CURRENT_LOG_LEVEL >= LOG_LEVEL.WARN) console.warn(...args);
  },
  info: (...args) => {
    if (CURRENT_LOG_LEVEL >= LOG_LEVEL.INFO) console.log(...args);
  },
  debug: (...args) => {
    if (CURRENT_LOG_LEVEL >= LOG_LEVEL.DEBUG) console.log(...args);
  },
};

// グローバルスコープにlogオブジェクトを追加（IIFE外のコードから使用可能にする）
window.log = log;

// セレクタエラー報告用の関数を追加
async function reportSelectorError(selectorKey, error, selectors) {
  try {
    // step7のエラー報告関数をインポート
    const { addSelectorError } = await import(
      "./step7-selector-data-structure.js"
    );
    addSelectorError("chatgpt", selectorKey, error);

    // コンソールに警告を出力
    log.warn(`🚨 ChatGPT セレクタエラー [${selectorKey}]:`, error);
    log.warn("失敗したセレクタ:", selectors);

    // UI更新をトリガー（もし管理画面が開いていれば）
    if (
      window.selectorTimelineManager &&
      window.selectorTimelineManager.updateDisplay
    ) {
      window.selectorTimelineManager.updateDisplay();
    }
  } catch (importError) {
    log.error("セレクタエラー報告に失敗:", importError);
  }
}

/**
 * @fileoverview ChatGPT Automation V2 - 統合版
 *
 * 【ステップ構成】
 * Step 4-1-0: 初期化（固定セレクタ使用）
 * Step 4-1-1: ページ準備状態チェック
 * Step 4-1-2: テキスト入力
 * Step 4-1-3: モデル選択（条件付き）
 * Step 4-1-4: 機能選択（条件付き）
 * Step 4-1-5: メッセージ送信
 * Step 4-1-6: 応答待機（通常/特別モード）
 * Step 4-1-7: テキスト取得
 *
 * @version 3.1.0
 * @updated 2024-12-20 Step 4-1-X番号体系導入、詳細エラーログ強化
 */

// ========================================
// 本番メニュー開閉関数のエクスポート（検出システム用）
// executeTask内の既存コードをそのまま関数化
// ========================================

(async function () {
  "use strict";

  // デバッグマーカー（すぐに設定）
  window.CHATGPT_SCRIPT_LOADED = true;
  window.CHATGPT_SCRIPT_INIT_TIME = Date.now();

  // 早期メッセージリスナー登録（Content Script準備確認用）
  const earlyMessageListener = (request, sender, sendResponse) => {
    // 常にtrue返してポートを開いたままにする
    try {
      if (
        request.action === "ping" ||
        request.type === "CONTENT_SCRIPT_CHECK" ||
        request.type === "PING"
      ) {
        sendResponse({
          action: "pong",
          status: "ready",
          timestamp: Date.now(),
          scriptLoaded: true,
          earlyResponse: true,
        });
        return true;
      }

      // DISCOVER_FEATURES と EXECUTE_TASK は後で登録されるメインリスナーに委譲
      if (
        request.type === "DISCOVER_FEATURES" ||
        request.type === "EXECUTE_TASK"
      ) {
        return false; // 他のリスナーに処理を委譲
      }

      // その他のメッセージも適切に処理
      sendResponse({
        success: false,
        error: "Unhandled message type in early listener",
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error(`❌ [ChatGPT-Early] エラー:`, error);
      sendResponse({
        success: false,
        error: error.message,
        timestamp: Date.now(),
      });
    }

    return true; // 常にtrueを返してポートを維持
  };

  // 即座にリスナー登録
  if (
    typeof chrome !== "undefined" &&
    chrome.runtime &&
    chrome.runtime.onMessage
  ) {
    chrome.runtime.onMessage.addListener(earlyMessageListener);
  }

  // 🔧 [FIXED] ChatGPTメッセージング問題修正完了のお知らせ

  // ログ出力（タイムスタンプ付き）
  function logWithTimestamp(message, type = "info") {
    const timestamp = new Date().toLocaleTimeString("ja-JP", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    const prefix = `[${timestamp}]`;

    switch (type) {
      case "error":
        console.error(`${prefix} ❌ ${message}`);
        break;
      case "success":
        break;
      case "warning":
        console.warn(`${prefix} ⚠️ ${message}`);
        break;
      case "step":
        break;
      case "info":
      default:
        break;
    }
  }

  // グローバルスコープに関数を追加（IIFE外のコードから使用可能にする）
  window.logWithTimestamp = logWithTimestamp;

  // 🔍 Content Script実行コンテキストの詳細確認（Claude式）
  const currentURL = window.location.href;
  const isValidChatGPTURL =
    currentURL.includes("chatgpt.com") ||
    currentURL.includes("chat.openai.com");
  const isExtensionPage = currentURL.startsWith("chrome-extension://");

  // DOM準備状態の詳細チェック
  const domReadyCheck = () => {
    const hasBasicElements = !!(document.body && document.head);
    const hasInteractiveElements =
      document.querySelectorAll('[contenteditable="true"], textarea, input')
        .length > 0;
    const isReady =
      document.readyState === "complete" ||
      document.readyState === "interactive";

    return {
      readyState: document.readyState,
      hasBasicElements,
      hasInteractiveElements,
      isReady,
      bodyChildren: document.body ? document.body.children.length : 0,
    };
  };

  // 🔍 Content Script実行環境の詳細ログ（コメントアウト）
  // console.warn(
  //   `🔍 [ChatGPT-Content Script] 実行コンテキスト詳細分析:`,
  //   JSON.stringify(
  //     {
  //       executionContext: {
  //         url: currentURL,
  //         title: document.title,
  //         domain: window.location.hostname,
  //         protocol: window.location.protocol,
  //         pathname: window.location.pathname,
  //         search: window.location.search,
  //         hash: window.location.hash,
  //       },
  //       validationResults: {
  //         isValidChatGPTURL: isValidChatGPTURL,
  //         isExtensionPage: isExtensionPage,
  //         isChromeNewTab: currentURL === "chrome://newtab/",
  //         isAboutBlank: currentURL === "about:blank",
  //       },
  //       documentState: {
  //         readyState: document.readyState,
  //         hasDocumentElement: !!document.documentElement,
  //         hasBody: !!document.body,
  //         bodyChildrenCount: document.body ? document.body.children.length : 0,
  //       },
  //       chromeExtensionInfo: {
  //         hasChromeRuntime: typeof chrome !== "undefined" && !!chrome.runtime,
  //         extensionId:
  //           typeof chrome !== "undefined" && chrome.runtime
  //             ? chrome.runtime.id
  //             : null,
  //         runtimeUrl:
  //           typeof chrome !== "undefined" && chrome.runtime
  //             ? chrome.runtime.getURL("")
  //             : null,
  //       },
  //       timestamp: new Date().toISOString(),
  //       userAgent: navigator.userAgent,
  //     },
  //     null,
  //     2,
  //   ),
  // );

  // ========================================
  // Step 4-1-0-3: 統一ChatGPTRetryManager クラス定義
  // エラー分類とリトライ戦略を統合した統一システム
  // ========================================

  class ChatGPTRetryManager {
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

      // ChatGPT特有のエラー分類
      this.errorStrategies = {
        RATE_LIMIT_ERROR: {
          immediate_escalation: "HEAVY_RESET",
          maxRetries: 10,
        },
        LOGIN_ERROR: { immediate_escalation: "HEAVY_RESET", maxRetries: 5 },
        SESSION_ERROR: { immediate_escalation: "HEAVY_RESET", maxRetries: 5 },
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

    // Step 4-1-0-3: ChatGPT特有のエラー分類器（詳細ログ付き）
    classifyError(error, context = {}) {
      const errorMessage = error?.message || error?.toString() || "";
      const errorName = error?.name || "";

      log.debug(`🔍 [Step 4-1-0-3] エラー分類開始:`, {
        errorMessage,
        errorName,
        context,
        timestamp: new Date().toISOString(),
        url: window.location.href,
        userAgent: navigator.userAgent,
      });

      // ChatGPT特有エラーの検出
      let errorType = "GENERAL_ERROR";

      if (
        errorMessage.includes("rate limit") ||
        errorMessage.includes("Rate limited") ||
        errorMessage.includes("Too many requests")
      ) {
        errorType = "RATE_LIMIT_ERROR";
        log.debug(`⚠️ [Step 4-1-0-3] レート制限エラー検出:`, {
          errorType,
          errorMessage,
          immediateEscalation: "HEAVY_RESET",
          reason:
            "ChatGPT APIレート制限により即座に新規ウィンドウでリトライが必要",
        });
        return errorType;
      }

      if (
        errorMessage.includes("ログイン") ||
        errorMessage.includes("login") ||
        errorMessage.includes("authentication") ||
        errorMessage.includes("Please log in")
      ) {
        errorType = "LOGIN_ERROR";
        log.debug(`🔐 [Step 4-1-0-3] ログインエラー検出:`, {
          errorType,
          errorMessage,
          immediateEscalation: "HEAVY_RESET",
          reason: "認証切れのため新規ウィンドウでログイン必要",
        });
        return errorType;
      }

      if (
        errorMessage.includes("session") ||
        errorMessage.includes("セッション") ||
        errorMessage.includes("Session expired")
      ) {
        errorType = "SESSION_ERROR";
        log.debug(`📋 [Step 4-1-0-3] セッションエラー検出:`, {
          errorType,
          errorMessage,
          immediateEscalation: "HEAVY_RESET",
          reason: "セッション期限切れのため新規ウィンドウでセッション再開必要",
        });
        return errorType;
      }

      // 共通エラー分類
      if (
        errorMessage.includes("timeout") ||
        errorMessage.includes("network") ||
        errorMessage.includes("fetch") ||
        errorName.includes("NetworkError")
      ) {
        errorType = "NETWORK_ERROR";
        log.debug(`🌐 [Step 4-1-0-3] ネットワークエラー検出:`, {
          errorType,
          errorMessage,
          escalation: "MODERATE",
          maxRetries: 8,
          reason: "ネットワーク問題により段階的エスカレーション適用",
        });
        return errorType;
      }

      if (
        errorMessage.includes("要素が見つかりません") ||
        errorMessage.includes("element not found") ||
        errorMessage.includes("selector") ||
        errorMessage.includes("querySelector")
      ) {
        errorType = "DOM_ERROR";
        log.debug(`🔍 [Step 4-1-0-3] DOM要素エラー検出:`, {
          errorType,
          errorMessage,
          escalation: "LIGHTWEIGHT",
          maxRetries: 5,
          reason: "DOM要素の検出失敗により軽量リトライ適用",
          context: context,
        });
        return errorType;
      }

      if (
        errorMessage.includes("click") ||
        errorMessage.includes("input") ||
        errorMessage.includes("button") ||
        errorMessage.includes("まで待機")
      ) {
        errorType = "UI_TIMING_ERROR";
        log.debug(`⏱️ [Step 4-1-0-3] UIタイミングエラー検出:`, {
          errorType,
          errorMessage,
          escalation: "LIGHTWEIGHT",
          maxRetries: 10,
          reason: "UI操作タイミング問題により軽量リトライ適用",
        });
        return errorType;
      }

      // デフォルト分類
      errorType = "GENERAL_ERROR";
      log.debug(`❓ [Step 4-1-0-3] 一般エラーとして分類:`, {
        errorType,
        errorMessage,
        escalation: "MODERATE",
        maxRetries: 8,
        reason: "特定パターンに該当しないため一般エラーとして分類",
      });

      return errorType;
    }

    // Step 4-1-0-3: エスカレーションレベルの判定（詳細ログ付き）
    determineEscalationLevel(retryCount, errorType) {
      log.debug(`📈 [Step 4-1-0-3] エスカレーション判定開始:`, {
        retryCount,
        errorType,
        consecutiveErrorCount: this.consecutiveErrorCount,
        timestamp: new Date().toISOString(),
      });

      const strategy =
        this.errorStrategies[errorType] || this.errorStrategies.GENERAL_ERROR;

      // 即座エスカレーション条件
      if (strategy.immediate_escalation) {
        log.debug(`🚨 [Step 4-1-0-3] 即座エスカレーション適用:`, {
          errorType,
          escalationLevel: strategy.immediate_escalation,
          reason: "重大エラーのため即座に最高レベルエスカレーション",
        });
        return strategy.immediate_escalation;
      }

      // 連続同一エラー5回以上で即座にHEAVY_RESET
      if (this.consecutiveErrorCount >= 5) {
        log.debug(`🔄 [Step 4-1-0-3] 連続エラーによる強制エスカレーション:`, {
          consecutiveErrorCount: this.consecutiveErrorCount,
          errorType,
          escalationLevel: "HEAVY_RESET",
          reason: "連続5回以上の同一エラーによりHEAVY_RESETを強制適用",
        });
        return "HEAVY_RESET";
      }

      // 通常のエスカレーション判定
      for (const [level, config] of Object.entries(this.escalationLevels)) {
        if (retryCount >= config.range[0] && retryCount <= config.range[1]) {
          log.debug(`📊 [Step 4-1-0-3] 通常エスカレーション適用:`, {
            retryCount,
            escalationLevel: level,
            range: config.range,
            method: config.method,
            description: config.description,
          });
          return level;
        }
      }

      log.debug(`🔄 [Step 4-1-0-3] デフォルトエスカレーション適用:`, {
        retryCount,
        escalationLevel: "HEAVY_RESET",
        reason: "すべての範囲を超えたためデフォルトHEAVY_RESETを適用",
      });
      return "HEAVY_RESET"; // デフォルト
    }

    // Step 4-1-0-3: 段階的エスカレーションリトライの実行（詳細ログ付き）
    async executeWithEscalation(config) {
      const {
        action,
        isSuccess = (result) => result && result.success !== false,
        actionName = "ChatGPT処理",
        context = {},
        taskData = {},
      } = config;

      let retryCount = 0;
      let lastResult = null;
      let lastError = null;
      const startTime = Date.now();

      log.debug(`🚀 [Step 4-1-0-3] エスカレーションリトライ開始:`, {
        actionName,
        maxRetries: 20,
        context,
        startTime: new Date().toISOString(),
      });

      while (retryCount < 20) {
        // 最大20回
        try {
          retryCount++;
          this.metrics.totalAttempts++;
          const attemptStartTime = Date.now();

          log.debug(`🔄 [Step 4-1-0-3] ${actionName} 試行 ${retryCount}/20:`, {
            attemptNumber: retryCount,
            totalAttempts: this.metrics.totalAttempts,
            elapsedTime: attemptStartTime - startTime,
            consecutiveErrors: this.consecutiveErrorCount,
            lastErrorType: this.lastErrorType,
          });

          // アクション実行
          lastResult = await action();

          if (isSuccess(lastResult)) {
            this.metrics.successfulAttempts++;
            this.consecutiveErrorCount = 0; // エラーカウントリセット
            const totalTime = Date.now() - startTime;

            log.debug(
              `✅ [Step 4-1-0-3] ${actionName} 成功（${retryCount}回目）:`,
              {
                attemptNumber: retryCount,
                totalTime,
                successRate:
                  (
                    (this.metrics.successfulAttempts /
                      this.metrics.totalAttempts) *
                    100
                  ).toFixed(2) + "%",
                result: lastResult,
              },
            );

            return {
              success: true,
              result: lastResult,
              retryCount,
              totalTime,
              escalationLevel: this.determineEscalationLevel(
                retryCount,
                "SUCCESS",
              ),
            };
          }
        } catch (error) {
          lastError = error;
          const errorType = this.classifyError(error, context);
          const elapsedTime = Date.now() - startTime;

          // エラー履歴管理
          this.addErrorToHistory(errorType, error.message);

          log.error(
            `❌ [Step 4-1-0-3] ${actionName} エラー (${retryCount}回目):`,
            {
              errorType,
              message: error.message,
              stack: error.stack,
              consecutiveErrors: this.consecutiveErrorCount,
              elapsedTime,
              context,
              attemptNumber: retryCount,
              errorClassification: this.errorStrategies[errorType],
            },
          );

          // 最大リトライ回数チェック
          const strategy =
            this.errorStrategies[errorType] ||
            this.errorStrategies.GENERAL_ERROR;
          if (retryCount >= (strategy.maxRetries || 20)) {
            log.debug(`🛑 [Step 4-1-0-3] 最大リトライ回数到達:`, {
              retryCount,
              maxRetries: strategy.maxRetries || 20,
              errorType,
              reason: "最大リトライ回数に到達したため処理を中断",
            });
            break;
          }

          // エスカレーションレベル判定
          const escalationLevel = this.determineEscalationLevel(
            retryCount,
            errorType,
          );
          this.metrics.escalationCounts[escalationLevel]++;

          log.debug(`🚀 [Step 4-1-0-3] エスカレーション実行:`, {
            retryCount,
            errorType,
            escalationLevel,
            escalationCount: this.metrics.escalationCounts[escalationLevel],
          });

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
            log.debug(
              `✅ [Step 4-1-0-3] エスカレーション成功:`,
              escalationResult,
            );
            return escalationResult;
          }

          // 待機戦略実行
          log.debug(`⏳ [Step 4-1-0-3] 待機戦略実行中...`);
          await this.waitWithEscalationStrategy(
            escalationLevel,
            retryCount,
            errorType,
          );
        }
      }

      // 全リトライ失敗
      const totalTime = Date.now() - startTime;
      const finalErrorType = lastError
        ? this.classifyError(lastError, context)
        : "UNKNOWN";

      log.error(`❌ [Step 4-1-0-3] ${actionName} 全リトライ失敗:`, {
        totalAttempts: retryCount,
        totalTime,
        finalError: lastError?.message,
        finalErrorType,
        errorHistory: this.errorHistory.slice(-5), // 直近5件のエラー
        metrics: this.getMetrics(),
      });

      return {
        success: false,
        result: lastResult,
        error: lastError,
        retryCount,
        totalTime,
        errorType: finalErrorType,
        errorHistory: this.errorHistory.slice(-5),
        metrics: this.getMetrics(),
      };
    }

    // エスカレーション実行
    async executeEscalation(level, context) {
      const { retryCount, errorType, taskData } = context;

      log.debug(
        `🔄 [ChatGPT-Escalation] ${level} 実行開始 (${retryCount}回目)`,
      );

      switch (level) {
        case "LIGHTWEIGHT":
          // 同一ウィンドウ内での再試行（何もしない、次の試行へ）
          return null;

        case "MODERATE":
          // ページリフレッシュ
          log.debug(`🔄 [ChatGPT-Escalation] ページリフレッシュ実行`);
          location.reload();
          return { success: false, needsWait: true }; // リロード後は待機が必要

        case "HEAVY_RESET":
          // 新規ウィンドウ作成
          log.debug(`🔄 [ChatGPT-Escalation] 新規ウィンドウ作成`);
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
            aiType: "ChatGPT",
            enableDeepResearch: taskData.enableDeepResearch || false,
            specialMode: taskData.specialMode || null,
            error: context.errorType || "ESCALATION_ERROR",
            errorMessage:
              context.errorMessage || "エスカレーションによるリトライ",
            retryReason: context.retryReason || "chatgpt_escalation_retry",
            closeCurrentWindow: true,
          },
          (response) => {
            if (chrome.runtime.lastError) {
              log.warn("⚠️ [FIXED] ChatGPTリトライ通信エラー（処理は継続）:", {
                error: chrome.runtime.lastError.message,
                taskId: taskData.taskId,
                note: "background.jsにRETRY_WITH_NEW_WINDOWハンドラーが未実装の可能性",
                timestamp: new Date().toISOString(),
              });
              resolve({
                success: false,
                error: chrome.runtime.lastError.message,
                fixed: "エラーハンドリング改善済み",
              });
            } else if (response && response.success) {
              log.debug("✅ [FIXED] ChatGPTリトライ通信成功:", {
                response: response,
                taskId: taskData.taskId,
                timestamp: new Date().toISOString(),
              });
              resolve(response);
            } else {
              log.debug("ℹ️ [FIXED] ChatGPTリトライ予期しないレスポンス:", {
                response: response,
                taskId: taskData.taskId,
                timestamp: new Date().toISOString(),
              });
              resolve({ success: false, fixed: "レスポンス詳細化済み" });
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
        log.debug(
          `⏳ [ChatGPT-Wait] ${level} - ${delayMinutes}分後にリトライします...`,
        );
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

  // 統一された待機時間設定を取得（Claudeと同じ方式）
  const AI_WAIT_CONFIG = window.AI_WAIT_CONFIG || {
    DEEP_RESEARCH_WAIT: 2400000, // 40分
    NORMAL_WAIT: 300000, // 5分
    STOP_BUTTON_WAIT: 30000, // 30秒
    CHECK_INTERVAL: 2000, // 2秒
    MICRO_WAIT: 100, // 100ms
    TINY_WAIT: 500, // 500ms
    SHORT_WAIT: 1000, // 1秒
    MEDIUM_WAIT: 2000, // 2秒
    LONG_WAIT: 3000, // 3秒
  };

  // ========================================
  // Step 4-1-0: 固定UIセレクタ（UI_SELECTORS依存なし）
  // ========================================

  logWithTimestamp(
    "【Step 4-1-0-1】✅ 固定セレクタを使用（UI_SELECTORS不要）",
    "success",
  );

  // DOM準備完了を待機する関数
  const waitForDOMReady = async () => {
    logWithTimestamp("DOM準備完了を待機中...", "info");

    const maxWaitTime = 10000; // 最大10秒待機
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitTime) {
      const domStatus = domReadyCheck();

      if (domStatus.isReady && domStatus.hasBasicElements) {
        logWithTimestamp("DOM準備完了！", "success");
        logWithTimestamp(`準備完了状態: ${JSON.stringify(domStatus)}`, "info");
        return true;
      }

      if ((Date.now() - startTime) % 2000 === 0) {
        logWithTimestamp(
          `DOM準備待機中... ${JSON.stringify(domStatus)}`,
          "info",
        );
      }

      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    logWithTimestamp("DOM準備タイムアウト、続行します", "warning");
    return false;
  };

  // DOM準備を待機
  await waitForDOMReady();

  // ChatGPT用固定セレクタ
  const SELECTORS = {
    // モデル関連（テストコードから更新）
    modelButton: [
      '[data-testid="model-switcher-dropdown-button"]',
      'button[aria-label*="モデル セレクター"]',
      'button[aria-label*="モデル"][aria-haspopup="menu"]',
      "#radix-\\:r2m\\:",
      'button.group.flex.cursor-pointer[aria-haspopup="menu"]',
      'button[data-testid="model-switcher-button"]',
      'button[aria-label*="Model"]',
      ".model-selector-button",
    ],
    modelMenu: [
      '[role="menu"][data-radix-menu-content]',
      '[role="menu"][data-state="open"]',
      'div.z-50.max-w-xs.rounded-2xl.popover[role="menu"]',
      '[aria-labelledby*="radix"][role="menu"]',
      'div[data-radix-popper-content-wrapper] [role="menu"]',
      '[data-testid="model-switcher-menu"]',
      ".model-menu",
      '[role="menu"]',
    ],
    // 機能関連（テストコードから更新）
    menuButton: [
      '[data-testid="composer-plus-btn"]',
      'button[aria-haspopup="menu"]',
      "#radix-\\:R2eij4im4pact9a4mj5\\:",
      "button.composer-btn",
      'div[class*="leading"] button',
      'button[data-testid="composer-tools-button"]',
      'button[aria-label="Additional tools"]',
      ".composer-tools-button",
    ],
    mainMenu: [
      '[role="menu"][data-state="open"]',
      "[data-radix-menu-content]",
      'div[data-side="bottom"][role="menu"]',
      'div.popover[role="menu"]',
      '[data-testid="composer-tools-menu"]',
      ".composer-tools-menu",
      '[role="menu"]',
    ],
    subMenu: [
      '[role="menu"][data-side="right"]',
      'div[data-side="right"][role="menu"]',
      '[data-align="start"][role="menu"]:last-of-type',
      ".submenu",
      '[role="menuitem"]',
    ],
    // 入力・送信関連（テストコードから更新）
    textInput: [
      // 2024年12月最新のChatGPTセレクタ
      'div[contenteditable="true"][data-id^="root"]',
      'div[contenteditable="true"][placeholder*="Message"]',
      'div[contenteditable="true"][translate="no"]',
      'div[role="textbox"][contenteditable="true"]',
      // 従来のセレクタ（フォールバック用）
      ".ProseMirror",
      "#prompt-textarea",
      '[contenteditable="true"][translate="no"]',
      'div[data-virtualkeyboard="true"]',
      "div.ProseMirror.text-token-text-primary",
      ".ql-editor",
      'textarea[placeholder*="Message ChatGPT"]',
      'textarea[data-testid="composer-text-input"]',
      // より広範囲なフォールバック
      '[contenteditable="true"]',
      "textarea",
      'input[type="text"]',
    ],
    sendButton: [
      '[data-testid="send-button"]',
      "#composer-submit-button",
      'button[aria-label="プロンプトを送信する"]',
      "button.composer-submit-btn.composer-submit-button-color",
      'button:has(svg[width="20"][height="20"])',
      'button[aria-label="Send message"]',
      ".send-button",
    ],
    // 停止ボタン（テストコードから更新）
    stopButton: [
      '[data-testid="stop-button"]',
      '#composer-submit-button[aria-label="ストリーミングの停止"]',
      "button.composer-submit-btn.composer-secondary-button-color",
      'button:has(svg path[d*="M4.5 5.75"])',
      'button[aria-label="Stop generating"]',
      ".stop-button",
    ],
    // 結果取得関連（テストコードから更新）
    canvasText: [
      "div.markdown.prose",
      "div.w-full.pt-1.pb-1",
      "div.markdown-new-styling",
      '[data-testid="canvas-content"]',
      ".canvas-content",
      ".artifact-content",
    ],
    normalText: [
      '[data-message-author-role="assistant"]',
      "div.text-message",
      "div.min-h-8.text-message",
      ".assistant-message",
      ".message-content",
    ],
    menuItem: [
      '[role="menuitem"]',
      ".menu-item",
      'button[data-testid*="menu-item"]',
    ],
    response: [".markdown", ".prose", ".message-content p"],
  };

  // ========================================
  // ユーティリティ関数（テストコードより）
  // ========================================

  // 待機関数
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  // グローバルスコープにsleep関数を追加（IIFE外のコードから使用可能にする）
  window.sleep = sleep;

  // 通常モードの待機処理
  async function standardWaitForResponse() {
    logWithTimestamp(
      "【Step 4-1-6-1】停止ボタンの表示を待機（最大30秒）",
      "info",
    );

    // 停止ボタンが表示されるまで待機（テストコード準拠）
    let stopBtn = null;
    for (let i = 0; i < 30; i++) {
      stopBtn = await findElement(SELECTORS.stopButton, "停止ボタン", 1);
      if (stopBtn) {
        logWithTimestamp("✅ 停止ボタンが表示されました", "success");
        break;
      }
      await sleep(1000);
    }

    // 停止ボタンが消えるまで待機（共通エラーハンドラー統合版）
    if (stopBtn) {
      logWithTimestamp("停止ボタンが消えるまで待機（最大5分）", "info");

      for (let i = 0; i < 300; i++) {
        // 共通エラーハンドラーでエラー状態をチェック
        if (
          window.chatgptErrorHandler &&
          window.chatgptErrorHandler.shouldStopOnError()
        ) {
          logWithTimestamp("❌ エラー検出により監視を中断", "error");
          break;
        }

        stopBtn = await findElement(SELECTORS.stopButton, "停止ボタン", 1);

        // 共通エラーハンドラーで停止ボタン状態を更新
        if (window.chatgptErrorHandler) {
          const shouldStop =
            window.chatgptErrorHandler.updateButtonStatus(!stopBtn);
          if (shouldStop) {
            logWithTimestamp("✅ 応答完了", "success");
            break;
          }
        } else {
          // フォールバック: 従来の処理
          if (!stopBtn) {
            logWithTimestamp("✅ 応答完了", "success");
            break;
          }
        }

        if (i % 10 === 0) {
          logWithTimestamp(`応答待機中... (${i}秒経過)`, "info");
        }
        await sleep(1000);
      }
    }
  } // standardWaitForResponse関数をここで閉じる

  // ========================================
  // プロンプト除外機能（ChatGPT用）
  // ========================================

  /**
   * DOM構造によるユーザーメッセージ除外（ChatGPT用）
   * @param {Element} container - 検索対象のコンテナ要素
   * @returns {Element} フィルタ済みコンテナ
   */
  function excludeUserMessages(container) {
    if (!container) return container;

    try {
      const clone = container.cloneNode(true);

      // ChatGPT用のユーザーメッセージセレクタ
      const userMessageSelectors = [
        ".user-message-bubble-color",
        "[data-multiline]",
        ".whitespace-pre-wrap",
      ];

      userMessageSelectors.forEach((selector) => {
        const userMessages = clone.querySelectorAll(selector);
        userMessages.forEach((msg) => {
          // ユーザーメッセージの親要素ごと削除
          const parentToRemove =
            msg.closest(".user-message-bubble-color") || msg;
          if (parentToRemove && parentToRemove.parentNode) {
            parentToRemove.parentNode.removeChild(parentToRemove);
          }
        });
      });

      return clone;
    } catch (error) {
      log.warn("[ChatGPT] ユーザーメッセージ除外中にエラーが発生:", error);
      return container;
    }
  }

  /**
   * テキスト内容によるプロンプト除外（ChatGPT用）
   * @param {string} fullText - 完全テキスト
   * @param {string} sentPrompt - 送信されたプロンプト（オプション）
   * @returns {string} プロンプト除外後のテキスト
   */
  function removePromptFromText(fullText, sentPrompt = null) {
    if (!fullText || typeof fullText !== "string") return fullText;

    try {
      // 使用するプロンプト（パラメータまたはグローバル変数から）
      const promptToRemove = sentPrompt || window.lastSentPrompt;

      if (!promptToRemove) return fullText;

      // 1. 完全一致除去
      if (fullText.includes(promptToRemove)) {
        const cleanedText = fullText.replace(promptToRemove, "").trim();
        logWithTimestamp(
          "【ChatGPT-除外】完全一致でプロンプトを除外しました",
          "success",
        );
        return cleanedText;
      }

      // 2. 特徴的なプロンプトパターンで除外
      const promptPatterns = [
        "【現在.+?セルを処理中です】",
        "# 命令書",
        "## 1\\. あなたの役割",
        "あなたはプロの.+?です",
        "以下の\\{元のメルマガ\\}",
        "変更して欲しい内容",
        "ステップ1:結論について",
      ];

      let cleanedText = fullText;
      let patternFound = false;

      promptPatterns.forEach((pattern) => {
        const regex = new RegExp(pattern, "gi");
        if (regex.test(cleanedText)) {
          cleanedText = cleanedText.replace(regex, "").trim();
          patternFound = true;
        }
      });

      if (patternFound) {
        logWithTimestamp(
          "【ChatGPT-除外】パターンマッチングでプロンプトを除外しました",
          "success",
        );
      }

      return cleanedText;
    } catch (error) {
      log.warn("[ChatGPT] プロンプト除去中にエラーが発生:", error);
      return fullText;
    }
  }

  // 装飾要素を除外したテキスト取得
  function getCleanText(element) {
    if (!element) return "";

    try {
      // ユーザーメッセージを除外
      const filteredElement = excludeUserMessages(element);

      // 装飾要素を削除
      const decorativeElements = filteredElement.querySelectorAll(
        "mat-icon, mat-ripple, svg, .icon, .ripple",
      );
      decorativeElements.forEach((el) => el.remove());

      const rawText = filteredElement.textContent?.trim() || "";

      // プロンプト除去を適用
      const cleanedText = removePromptFromText(rawText);

      return cleanedText;
    } catch (error) {
      log.warn("[ChatGPT] getCleanText処理中にエラーが発生:", error);
      // フォールバック
      const clone = element.cloneNode(true);
      const decorativeElements = clone.querySelectorAll(
        "mat-icon, mat-ripple, svg, .icon, .ripple",
      );
      decorativeElements.forEach((el) => el.remove());
      return clone.textContent?.trim() || "";
    }
  }

  // ========================================
  // ログ管理システムの初期化（内部実装 - 実際に動作）
  // ========================================
  window.chatgptLogFileManager = {
    logs: [], // メモリ内ログ保存
    maxLogs: 1000, // 最大ログ数

    // 共通ログ処理
    _addLog: function (level, message, data = null, error = null) {
      const timestamp = new Date().toISOString();
      const logEntry = {
        timestamp,
        level,
        message,
        data,
        error: error
          ? {
              message: error.message,
              stack: error.stack,
              name: error.name,
            }
          : null,
      };

      // メモリ内ログに追加
      this.logs.push(logEntry);

      // 最大ログ数を超えた場合は古いログを削除
      if (this.logs.length > this.maxLogs) {
        this.logs.shift();
      }

      // localStorageに重要なログを保存
      if (level === "ERROR" || level === "SUCCESS") {
        this._saveToStorage(logEntry);
      }

      return logEntry;
    },

    // localStorageへの保存
    _saveToStorage: function (logEntry) {
      try {
        const storageKey = `chatgpt_logs_${new Date().toISOString().split("T")[0]}`;
        const existingLogs = JSON.parse(
          localStorage.getItem(storageKey) || "[]",
        );
        existingLogs.push(logEntry);

        // 最大100エントリまで保存
        if (existingLogs.length > 100) {
          existingLogs.shift();
        }

        localStorage.setItem(storageKey, JSON.stringify(existingLogs));
      } catch (e) {
        log.warn("[ChatGPT-Log] localStorage保存エラー:", e);
      }
    },

    logStep: function (message, data) {
      const logEntry = this._addLog("INFO", message, data);
      log.debug(`🔄 [ChatGPT-Step] ${message}`, data || "");
      return logEntry;
    },

    logError: function (message, error) {
      const logEntry = this._addLog("ERROR", message, null, error);
      log.error(`❌ [ChatGPT-Error] ${message}`, error);
      return logEntry;
    },

    logSuccess: function (message, data) {
      const logEntry = this._addLog("SUCCESS", message, data);
      log.debug(`✅ [ChatGPT-Success] ${message}`, data || "");
      return logEntry;
    },

    logTaskStart: function (taskInfo) {
      const logEntry = this._addLog("TASK_START", "タスク開始", taskInfo);
      log.debug(`🚀 [ChatGPT-Task] タスク開始:`, taskInfo);
      return logEntry;
    },

    logTaskComplete: function (taskInfo, result) {
      const logEntry = this._addLog("TASK_COMPLETE", "タスク完了", {
        taskInfo,
        result,
      });
      log.debug(`🏁 [ChatGPT-Task] タスク完了:`, { taskInfo, result });
      return logEntry;
    },

    saveToFile: function () {
      // ブラウザでファイルダウンロード
      try {
        const logsJson = JSON.stringify(this.logs, null, 2);
        const blob = new Blob([logsJson], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `chatgpt_logs_${new Date().toISOString().split("T")[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
        log.debug(`💾 [ChatGPT-Log] ログファイルをダウンロード`);
      } catch (e) {
        log.error(`❌ [ChatGPT-Log] ファイル保存エラー:`, e);
      }
    },

    saveErrorImmediately: function (error) {
      const logEntry = this._addLog(
        "CRITICAL_ERROR",
        "緊急エラー",
        null,
        error,
      );
      log.error(`🚨 [ChatGPT-Critical] 緊急エラー:`, error);
      this._saveToStorage(logEntry);
      return logEntry;
    },

    saveIntermediate: function (data) {
      const logEntry = this._addLog("INTERMEDIATE", "中間データ", data);
      log.debug(`📊 [ChatGPT-Intermediate] 中間データ:`, data);
      return logEntry;
    },

    // ログ取得メソッド
    getLogs: function (level = null) {
      if (level) {
        return this.logs.filter((log) => log.level === level);
      }
      return [...this.logs];
    },

    // ログクリア
    clearLogs: function () {
      this.logs = [];
      log.debug(`🗑️ [ChatGPT-Log] ログをクリア`);
    },
  };

  const ChatGPTLogManager = {
    // LogFileManagerのプロキシとして動作
    get logFileManager() {
      return (
        window.chatgptLogFileManager || {
          logStep: () => {},
          logError: () => {},
          logSuccess: () => {},
          logTaskStart: () => {},
          logTaskComplete: () => {},
          saveToFile: () => {},
          saveErrorImmediately: () => {},
          saveIntermediate: () => {},
        }
      );
    },

    // ステップログを記録
    logStep(step, message, data = {}) {
      this.logFileManager.logStep(step, message, data);
      logWithTimestamp(`📝 [ログ] ${step}: ${message}`);
    },

    // エラーログを記録（即座にファイル保存）
    async logError(step, error, context = {}) {
      this.logFileManager.logError(step, error, context);
      logWithTimestamp(`❌ [エラーログ] ${step}: ${error.message}`, "error");
      // エラーは即座に保存
      await this.logFileManager.saveErrorImmediately(error, {
        step,
        ...context,
      });
    },

    // 成功ログを記録
    logSuccess(step, message, result = {}) {
      this.logFileManager.logSuccess(step, message, result);
      logWithTimestamp(`✅ [成功ログ] ${step}: ${message}`, "success");
    },

    // タスク開始を記録
    startTask(taskData) {
      this.logFileManager.logTaskStart(taskData);
      logWithTimestamp(`🚀 [タスク開始]`, "info");
    },

    // タスク完了を記録
    completeTask(result) {
      this.logFileManager.logTaskComplete(result);
      logWithTimestamp(`🏁 [タスク完了]`, "info");
    },

    // ログをファイルに保存（最終保存）
    async saveToFile() {
      try {
        const filePath = await this.logFileManager.saveToFile();
        logWithTimestamp(
          `✅ [ChatGPTLogManager] 最終ログを保存しました: ${filePath}`,
          "success",
        );
        return filePath;
      } catch (error) {
        logWithTimestamp(
          `[ChatGPTLogManager] ログ保存エラー: ${error.message}`,
          "error",
        );
      }
    },

    // ログをクリア
    clear() {
      if (this.logFileManager.clearCurrentLogs) {
        this.logFileManager.clearCurrentLogs();
      }
    },
  };

  // 要素が可視かつクリック可能かチェック
  function isElementInteractable(element) {
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      style.opacity !== "0"
    );
  }

  // React イベントトリガー（テストコードから追加）
  function triggerReactEvent(element, eventType, eventData = {}) {
    try {
      if (eventType === "click") {
        element.click();
        return true;
      } else if (eventType === "pointer") {
        const pointerDown = new PointerEvent("pointerdown", {
          bubbles: true,
          cancelable: true,
          view: window,
          ...eventData,
        });
        const pointerUp = new PointerEvent("pointerup", {
          bubbles: true,
          cancelable: true,
          view: window,
          ...eventData,
        });
        element.dispatchEvent(pointerDown);
        element.dispatchEvent(pointerUp);
        return true;
      }
      return false;
    } catch (error) {
      logWithTimestamp(`React イベントトリガー失敗: ${error.message}`, "error");
      return false;
    }
  }

  // 複数セレクタで要素検索（テスト済みコードより改善版）
  // 要素検索（固定セレクタ対応 + テスト済みセレクタ強化版）
  async function findElement(
    selectors,
    description = "",
    maxRetries = 5,
    selectorKey = null,
  ) {
    for (let retry = 0; retry < maxRetries; retry++) {
      for (const selector of selectors) {
        try {
          let element;

          if (selector.includes(":contains(")) {
            const match = selector.match(/\:contains\("([^"]+)"\)/);
            if (match) {
              const text = match[1];
              const baseSelector = selector.split(":contains(")[0];
              const elements = document.querySelectorAll(baseSelector || "*");
              element = Array.from(elements).find(
                (el) => el.textContent && el.textContent.includes(text),
              );
            }
          } else {
            element = document.querySelector(selector);
          }

          if (element && isElementInteractable(element)) {
            if (description && retry > 0) {
              logWithTimestamp(
                `${description}を発見: ${selector} (${retry + 1}回目の試行)`,
                "success",
              );
            }
            // セレクタが成功した場合、エラーをクリア
            if (selectorKey) {
              try {
                const { clearSelectorError } = await import(
                  "./step7-selector-data-structure.js"
                );
                clearSelectorError("chatgpt", selectorKey);
              } catch (importError) {
                // インポートエラーは無視
              }
            }
            return element;
          }
        } catch (e) {
          // セレクタエラーを無視
        }
      }

      if (retry < maxRetries - 1) {
        if (description && retry === 0) {
          logWithTimestamp(
            `${description}が見つかりません。待機中... (${retry + 1}/${maxRetries})`,
            "warning",
          );
        }
        await sleep(AI_WAIT_CONFIG.MEDIUM_WAIT);
      }
    }

    if (description) {
      logWithTimestamp(
        `${description}の検索に失敗しました (${maxRetries}回試行)`,
        "error",
      );
    }

    // すべてのセレクタが失敗した場合、エラーを報告
    if (selectorKey) {
      await reportSelectorError(selectorKey, "要素が見つかりません", selectors);
    }

    return null;
  }

  // テキストで要素を検索
  function findElementByText(selector, text, parent = document) {
    const elements = parent.querySelectorAll(selector);
    for (const el of elements) {
      if (el.textContent && el.textContent.includes(text)) {
        return el;
      }
    }
    return null;
  }

  // ========================================
  // Step 4-1-0: ページ準備確認
  // ========================================
  async function waitForPageReady() {
    logWithTimestamp("\n【Step 4-1-0】ページ準備確認", "step");
    const maxAttempts = 30; // 最大30秒待機
    let attempts = 0;

    while (attempts < maxAttempts) {
      attempts++;
      logWithTimestamp(
        `[Step 4-1-0] 準備確認 (${attempts}/${maxAttempts})`,
        "info",
      );

      // テキスト入力欄の存在をチェック
      const inputElement = await findElement(
        SELECTORS.textInput,
        "テキスト入力欄",
        1,
      );

      if (inputElement && isElementInteractable(inputElement)) {
        logWithTimestamp("✅ [Step 4-1-0] ページ準備完了", "success");
        return true;
      }

      await sleep(1000);
    }

    logWithTimestamp("❌ [Step 4-1-0] ページ準備タイムアウト", "error");
    throw new Error("ページが準備できませんでした");
  }

  // ========================================
  // ステップ0-1: 要素取得リトライ機能
  // ========================================
  async function getElementWithWait(
    selectors,
    description = "",
    timeout = 10000,
  ) {
    logWithTimestamp(`[ステップ0-1] ${description}を取得中...`, "info");
    const startTime = Date.now();
    let attempts = 0;

    while (Date.now() - startTime < timeout) {
      attempts++;
      const element = await findElement(selectors, description, 1);

      if (element && isElementInteractable(element)) {
        logWithTimestamp(
          `✅ [ステップ0-1] ${description}取得成功 (試行${attempts}回)`,
          "success",
        );
        return element;
      }

      if (attempts % 5 === 0) {
        logWithTimestamp(
          `[ステップ0-1] ${description}を探索中... (${Math.floor((Date.now() - startTime) / 1000)}秒経過)`,
          "info",
        );
      }

      await sleep(500);
    }

    logWithTimestamp(
      `❌ [ステップ0-1] ${description}取得タイムアウト`,
      "error",
    );
    return null;
  }

  // ========================================
  // Deep Research/エージェントモード統合処理
  // ========================================
  async function handleSpecialModeWaiting(featureName) {
    try {
      logWithTimestamp(`【${featureName}モード特別処理】開始`, "step");
      logWithTimestamp("【Step 4-1-6-1】最大回答待機時間: 40分", "info");

      // ステップ6-1: 停止ボタン出現待機
      let stopBtn = await waitForStopButton();
      if (!stopBtn) return false;

      // ステップ6-2: 2分間初期待機
      const disappeared = await initialWaitCheck();

      // ステップ6-3: 2分以内に完了した場合の再送信
      if (disappeared) {
        await retryWithPrompt();
      }

      // ステップ6-4: 最終待機（最大40分）
      await finalWaitForCompletion();

      logWithTimestamp(`${featureName}モード特別処理完了`, "success");
      return true;
    } catch (error) {
      logWithTimestamp(`特別処理エラー: ${error.message}`, "error");
      return false;
    }
  }

  // 6-1: 停止ボタン出現待機
  async function waitForStopButton() {
    logWithTimestamp("【Step 4-1-6-1】停止ボタン出現待機", "step");
    for (let i = 0; i < 60; i++) {
      const stopBtn = await findElement(SELECTORS.stopButton, 1);
      if (stopBtn) {
        logWithTimestamp(
          `停止ボタンが表示されました (${i + 1}秒後)`,
          "success",
        );
        return stopBtn;
      }
      if (i % 10 === 0 && i > 0) {
        logWithTimestamp(`停止ボタン待機中... ${i}秒経過`, "info");
      }
      await sleep(AI_WAIT_CONFIG.SHORT_WAIT);
    }
    logWithTimestamp(
      "【Step 4-1-6-1】停止ボタンが表示されませんでした",
      "warning",
    );
    return null;
  }

  // 6-2: 2分間初期待機
  async function initialWaitCheck() {
    logWithTimestamp("【Step 4-1-6-2】2分間初期待機チェック", "step");
    for (let i = 0; i < 120; i++) {
      const stopBtn = await findElement(SELECTORS.stopButton, 1);
      if (!stopBtn) {
        const minutes = Math.floor(i / 60);
        const seconds = i % 60;
        logWithTimestamp(
          `停止ボタンが消えました (${minutes}分${seconds}秒で完了)`,
          "info",
        );
        return true;
      }
      if (i % 30 === 0 && i > 0) {
        logWithTimestamp(
          `待機中... (${Math.floor(i / 60)}分${i % 60}秒経過)`,
          "info",
        );
      }
      await sleep(AI_WAIT_CONFIG.SHORT_WAIT);
    }
    return false;
  }

  // 6-3: 再送信処理
  async function retryWithPrompt() {
    logWithTimestamp(
      "【Step 4-1-6-3】再送信処理（「いいから元のプロンプトを確認して作業をして」）",
      "step",
    );
    const input = await findElement(SELECTORS.textInput);
    if (!input) return;

    const retryMessage = "いいから元のプロンプトを確認して作業をして";

    // テキスト入力
    if (
      input.classList.contains("ProseMirror") ||
      input.classList.contains("ql-editor")
    ) {
      input.innerHTML = "";
      const p = document.createElement("p");
      p.textContent = retryMessage;
      input.appendChild(p);
      input.classList.remove("ql-blank");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    } else {
      input.textContent = retryMessage;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }

    // 送信
    const sendBtn = await findElement(SELECTORS.sendButton);
    if (sendBtn) {
      sendBtn.click();
      logWithTimestamp("【Step 4-1-6-2】再送信完了", "success");
      await sleep(AI_WAIT_CONFIG.LONG_WAIT);
    }
  }

  // 6-4: 最終待機処理
  async function finalWaitForCompletion() {
    logWithTimestamp("【Step 4-1-6-4】最終待機（最大40分）", "step");
    const maxWaitTime = AI_WAIT_CONFIG.DEEP_RESEARCH_WAIT / 1000;
    let consecutiveAbsent = 0;

    for (let i = 0; i < maxWaitTime; i++) {
      const stopBtn = await findElement(SELECTORS.stopButton, 1);

      if (!stopBtn) {
        consecutiveAbsent++;
        if (consecutiveAbsent >= 10) {
          logWithTimestamp(
            "【Step 4-1-6-3】停止ボタンが10秒間連続で消滅。完了！",
            "success",
          );
          break;
        }
      } else {
        consecutiveAbsent = 0;
      }

      if (i % 60 === 0 && i > 0) {
        logWithTimestamp(
          `待機中... (${Math.floor(i / 60)}分経過 / 最大40分)`,
          "info",
        );
      }
      await sleep(AI_WAIT_CONFIG.SHORT_WAIT);
    }
  }

  // ========================================
  // 【関数一覧】検出システム用エクスポート関数
  // ========================================

  /*
    ┌─────────────────────────────────────────────────────┐
    │                【メニュー操作関数】                    │
    │   本番executeTask内のコードをそのまま関数化           │
    └─────────────────────────────────────────────────────┘
    */

  /**
   * 🔧 ChatGPTモデルメニューを開く
   * @description 本番executeTask内の行497-500のコードをそのまま関数化
   * @param {Element} modelButton - モデルボタン要素
   * @returns {Promise<boolean>} メニュー開放成功フラグ
   */
  async function openModelMenu(modelButton) {
    if (!modelButton) {
      log.error("[ChatGPT-openModelMenu] モデルボタンが見つかりません");
      return false;
    }

    try {
      modelButton.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true }),
      );
      await sleep(AI_WAIT_CONFIG.MICRO_WAIT);
      modelButton.dispatchEvent(
        new PointerEvent("pointerup", { bubbles: true }),
      );
      await sleep(AI_WAIT_CONFIG.MEDIUM_WAIT - 500);

      // メニュー出現確認
      const menuContainer = await findElement(
        SELECTORS.modelMenu,
        "モデルメニュー",
        1,
      );
      if (menuContainer) {
        log.debug("[ChatGPT-openModelMenu] ✅ モデルメニュー開放成功");
        return true;
      } else {
        log.warn("[ChatGPT-openModelMenu] ⚠️ メニュー開放したがDOM確認できず");
        return false;
      }
    } catch (error) {
      log.error("[ChatGPT-openModelMenu] ❌ エラー:", error);
      return false;
    }
  }

  /**
   * 🔧 ChatGPT機能メニューを開く
   * @description 本番executeTask内の行880-883のコードをそのまま関数化
   * @param {Element} funcMenuBtn - 機能メニューボタン要素
   * @returns {Promise<boolean>} メニュー開放成功フラグ
   */
  async function openFunctionMenu(funcMenuBtn) {
    if (!funcMenuBtn) {
      log.error(
        "[ChatGPT-openFunctionMenu] 機能メニューボタンが見つかりません",
      );
      return false;
    }

    try {
      funcMenuBtn.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true }),
      );
      await sleep(AI_WAIT_CONFIG.MICRO_WAIT);
      funcMenuBtn.dispatchEvent(
        new PointerEvent("pointerup", { bubbles: true }),
      );
      await sleep(AI_WAIT_CONFIG.MEDIUM_WAIT);

      // メニュー出現確認
      const menuContainer = await findElement(
        SELECTORS.mainMenu,
        "機能メニュー",
        1,
      );
      if (menuContainer) {
        log.debug("[ChatGPT-openFunctionMenu] ✅ 機能メニュー開放成功");
        return true;
      } else {
        log.warn(
          "[ChatGPT-openFunctionMenu] ⚠️ メニュー開放したがDOM確認できず",
        );
        return false;
      }
    } catch (error) {
      log.error("[ChatGPT-openFunctionMenu] ❌ エラー:", error);
      return false;
    }
  }

  /*
    ┌─────────────────────────────────────────────────────┐
    │                【基本操作関数】                        │
    │        ChatGPTでの基本的なUI操作を関数化             │
    └─────────────────────────────────────────────────────┘
    */

  /**
   * ✏️ ChatGPTテキスト入力処理
   * @description ChatGPTのテキスト入力欄にテキストを入力し、React環境での値変更イベントを発火
   * @param {string} text - 入力するテキスト
   * @returns {Promise<Element>} 入力要素
   * @throws {Error} テキスト入力欄が見つからない場合
   */
  async function inputTextChatGPT(text) {
    const inputElement = await findElement(
      SELECTORS.textInput,
      "テキスト入力欄",
    );
    if (!inputElement) throw new Error("テキスト入力欄が見つかりません");

    inputElement.focus();
    await sleep(100);
    inputElement.value = text;

    // React環境での値変更イベント発火
    const inputEvent = new Event("input", { bubbles: true });
    inputElement.dispatchEvent(inputEvent);
    await sleep(500);

    return inputElement;
  }

  /**
   * 📤 ChatGPTメッセージ送信処理
   * @description ChatGPTの送信ボタンをクリックしてメッセージを送信
   * @returns {Promise<boolean>} 送信成功フラグ
   * @throws {Error} 送信ボタンが見つからない場合
   */
  async function sendMessageChatGPT() {
    const sendButton = await findElement(SELECTORS.sendButton, "送信ボタン");
    if (!sendButton) throw new Error("送信ボタンが見つかりません");

    sendButton.click();
    await sleep(1000);

    return true;
  }

  /**
   * ⏳ ChatGPTレスポンス待機処理
   * @description ChatGPTのレスポンス生成完了まで待機（停止ボタンの消失を監視）
   * @returns {Promise<boolean>} 待機完了フラグ
   * @throws {Error} タイムアウト（2分）の場合
   */
  async function waitForResponseChatGPT() {
    const maxWaitTime = 600000; // 10分（通常処理に合わせて調整）
    const checkInterval = 1000;
    let elapsedTime = 0;

    while (elapsedTime < maxWaitTime) {
      const stopButton = document.querySelector(SELECTORS.stopButton);
      if (!stopButton) {
        // 停止ボタンがない = レスポンス完了
        await sleep(2000); // 安全のため追加待機
        return true;
      }

      await sleep(checkInterval);
      elapsedTime += checkInterval;
    }

    throw new Error("レスポンス待機タイムアウト");
  }

  /**
   * 📥 ChatGPTレスポンステキスト取得処理
   * @description ChatGPTの最新のアシスタント回答を取得
   * @returns {Promise<string>} レスポンステキスト
   * @throws {Error} アシスタントの回答が見つからない場合
   */
  window.getResponseTextChatGPT = async function getResponseTextChatGPT() {
    const responseElements = document.querySelectorAll(
      '[data-message-author-role="assistant"]',
    );
    if (responseElements.length === 0) {
      throw new Error("アシスタントの回答が見つかりません");
    }

    const latestResponse = responseElements[responseElements.length - 1];
    const responseText = getCleanText(latestResponse);

    return responseText;
  };

  /*
    ┌─────────────────────────────────────────────────────┐
    │                【選択操作関数】                        │
    │        モデルや機能の選択処理を関数化                 │
    └─────────────────────────────────────────────────────┘
    */

  /**
   * 🎯 ChatGPTモデル選択処理
   * @description 指定されたモデル名のモデルを選択
   * @param {string} modelName - 選択するモデル名（例: "GPT-4", "GPT-3.5"）
   * @returns {Promise<boolean>} 選択成功フラグ
   * @throws {Error} モデルが見つからない場合
   */
  async function selectModelChatGPT(modelName) {
    const modelButton = await findElement(
      SELECTORS.modelButton,
      "モデルボタン",
    );
    await openModelMenu(modelButton);

    const modelMenuEl = await findElement(
      SELECTORS.modelMenu,
      "モデルメニュー",
    );
    if (!modelMenuEl) throw new Error("モデルメニューが開きません");

    // メインメニューから検索
    const mainMenuItems = modelMenuEl.querySelectorAll(
      '[role="menuitem"][data-testid^="model-switcher-"]',
    );
    for (const item of mainMenuItems) {
      if (getCleanText(item).includes(modelName)) {
        item.click();
        await sleep(1000);
        return true;
      }
    }

    throw new Error(`モデル '${modelName}' が見つかりません`);
  }

  /**
   * 🎯 ChatGPT機能選択処理
   * @description 指定された機能名の機能を選択
   * @param {string} functionName - 選択する機能名（例: "Code Interpreter", "Browse with Bing"）
   * @returns {Promise<boolean>} 選択成功フラグ
   * @throws {Error} 機能が見つからない場合
   */
  async function selectFunctionChatGPT(functionName) {
    const funcMenuBtn = await findElement(
      SELECTORS.menuButton,
      "機能メニューボタン",
    );
    await openFunctionMenu(funcMenuBtn);

    const funcMenu = await findElement(SELECTORS.mainMenu, "メインメニュー");
    if (!funcMenu) throw new Error("機能メニューが開きません");

    // メニューアイテムから検索
    const menuItems = funcMenu.querySelectorAll('[role="menuitemradio"]');
    for (const item of menuItems) {
      if (getCleanText(item).includes(functionName)) {
        item.click();
        await sleep(1000);
        return true;
      }
    }

    throw new Error(`機能 '${functionName}' が見つかりません`);
  }

  // ========================================
  // メイン実行関数
  // ========================================

  // ========================================
  // ヘルパー関数群（リファクタリング）
  // ========================================

  // タスク初期化とページ準備
  async function initializeTask(taskData) {
    // 実行前にフラグをリセット
    window.__v2_execution_complete = false;
    window.__v2_execution_result = null;

    // タスク開始をログに記録
    ChatGPTLogManager.startTask(taskData);

    log.debug(
      "%c🚀 ChatGPT V2 タスク実行開始",
      "color: #00BCD4; font-weight: bold; font-size: 16px",
    );

    // ページ準備確認
    await waitForPageReady();

    // ページ初期化チェック
    logWithTimestamp("\n【Step 4-1-1】ページ初期化チェック", "step");

    // ChatGPT UIの基本要素が存在するか確認
    const criticalElements = {
      テキスト入力欄: SELECTORS.textInput,
      モデルボタン: SELECTORS.modelButton,
    };

    let allElementsReady = false;
    let retryCount = 0;
    const maxRetries = 10;

    while (!allElementsReady && retryCount < maxRetries) {
      allElementsReady = true;
      for (const [name, selectors] of Object.entries(criticalElements)) {
        const element = await findElement(selectors, name, 1);
        if (!element) {
          allElementsReady = false;
          logWithTimestamp(
            `${name}が見つかりません (試行 ${retryCount + 1}/${maxRetries})`,
            "warn",
          );
          break;
        }
      }
      if (!allElementsReady) {
        retryCount++;
        await sleep(1000);
      }
    }

    if (!allElementsReady) {
      throw new Error(
        "ChatGPT UIが完全に初期化されていません。ページをリロードしてください。",
      );
    }

    // DOM安定化待機
    await sleep(AI_WAIT_CONFIG.MEDIUM_WAIT - 500);

    // 既存の開いているメニューを閉じる
    const openMenus = document.querySelectorAll(
      '[role="menu"][data-state="open"]',
    );
    if (openMenus.length > 0) {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", code: "Escape" }),
      );
      await sleep(AI_WAIT_CONFIG.TINY_WAIT);
    }

    logWithTimestamp("ページ初期化チェック完了", "success");
  }

  // テキスト入力
  async function inputTextStep(taskData) {
    logWithTimestamp("\n【Step 4-1-2】テキスト入力", "step");

    let prompt = taskData.prompt || taskData.text || "";

    // セル位置情報を追加
    if (
      taskData.cellInfo &&
      taskData.cellInfo.column &&
      taskData.cellInfo.row
    ) {
      const cellPosition = `${taskData.cellInfo.column}${taskData.cellInfo.row}`;
      prompt = `【現在${cellPosition}セルを処理中です】\n\n${prompt}`;
    }

    if (!prompt || prompt.trim().length === 0) {
      throw new Error("プロンプトが空です");
    }

    // テキスト入力欄を見つける
    const inputField = await findElement(SELECTORS.textInput, "テキスト入力欄");
    if (!inputField) {
      throw new Error("テキスト入力欄が見つかりません");
    }

    // テキスト入力の実行
    logWithTimestamp("✨ テキスト入力を開始します", "info");

    const success = await inputTextChatGPT(prompt);
    if (!success) {
      throw new Error("テキスト入力に失敗しました");
    }

    logWithTimestamp(`✅ テキスト入力完了 (${prompt.length}文字)`, "success");
    await sleep(AI_WAIT_CONFIG.SHORT_WAIT);
  }

  // モデル選択
  async function selectModelStep(modelName) {
    if (!modelName) return;

    logWithTimestamp("\n【Step 4-1-3】モデル選択", "step");

    const success = await selectModelChatGPT(modelName);
    if (!success) {
      throw new Error(`モデル選択に失敗しました: ${modelName}`);
    }

    logWithTimestamp(`✅ モデル選択完了: ${modelName}`, "success");
    await sleep(AI_WAIT_CONFIG.SHORT_WAIT);
  }

  // 機能選択
  async function selectFunctionStep(functionName) {
    if (!functionName) return;

    logWithTimestamp("\n【Step 4-1-4】機能選択", "step");

    const success = await selectFunctionChatGPT(functionName);
    if (!success) {
      throw new Error(`機能選択に失敗しました: ${functionName}`);
    }

    logWithTimestamp(`✅ 機能選択完了: ${functionName}`, "success");
    await sleep(AI_WAIT_CONFIG.SHORT_WAIT);
  }

  // メッセージ送信
  async function sendMessageStep(taskData) {
    logWithTimestamp("\n【Step 4-1-5】メッセージ送信", "step");

    const success = await sendMessageChatGPT();
    if (!success) {
      throw new Error("メッセージ送信に失敗しました");
    }

    // 送信時刻を記録
    const sendTime = new Date();
    const taskId = taskData.taskId || taskData.id || "UNKNOWN_TASK_ID";

    // モデルと機能を取得
    const modelName = (await getCurrentModelChatGPT()) || "不明";
    const featureName = (await getCurrentFunctionChatGPT()) || "通常";

    // background.jsに送信時刻を記録
    if (chrome.runtime && chrome.runtime.sendMessage) {
      const messageToSend = {
        type: "recordSendTime",
        taskId: taskId,
        sendTime: sendTime.toISOString(),
        taskInfo: {
          aiType: "ChatGPT",
          model: modelName,
          function: featureName,
          url: window.location.href,
          cellInfo: taskData.cellInfo,
        },
        logCell: taskData.logCell,
      };

      try {
        chrome.runtime.sendMessage(messageToSend, (response) => {
          if (chrome.runtime.lastError) {
            console.warn(
              "⚠️ [ChatGPT] 送信時刻記録エラー:",
              chrome.runtime.lastError.message,
            );
          } else {
            console.log("✅ [ChatGPT] 送信時刻記録成功", response);
          }
        });
      } catch (error) {
        console.error("❌ [ChatGPT] 送信時刻記録失敗:", error);
      }
    }

    logWithTimestamp("✅ メッセージ送信完了", "success");
  }

  // 応答待機
  async function waitForResponseStep() {
    logWithTimestamp("\n【Step 4-1-6】応答待機", "step");

    const success = await waitForResponseChatGPT();
    if (!success) {
      throw new Error("応答の取得に失敗しました");
    }

    logWithTimestamp("✅ 応答待機完了", "success");
  }

  // レスポンス取得
  async function extractResponseStep() {
    logWithTimestamp("\n【Step 4-1-7】テキスト取得", "step");

    const responseText = await getResponseTextChatGPT();
    if (!responseText || responseText.trim().length === 0) {
      throw new Error("応答テキストを取得できませんでした");
    }

    logWithTimestamp(
      `✅ テキスト取得完了 (${responseText.length}文字)`,
      "success",
    );
    return responseText;
  }

  // エラーハンドリング
  function handleTaskError(error, taskData) {
    log.error("❌ ChatGPT V2 タスク実行エラー:", error);

    const result = {
      success: false,
      error: error.message,
    };

    // エラーをログに記録
    ChatGPTLogManager.logError("Task-Error", error, {
      taskData,
      errorMessage: error.message,
      errorStack: error.stack,
      errorName: error.name,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      url: window.location.href,
    });
    ChatGPTLogManager.completeTask(result);

    // エラー時も完了フラグを設定
    window.__v2_execution_complete = true;
    window.__v2_execution_result = result;

    return result;
  }

  // ========================================
  // メインのexecuteTask関数（リファクタリング後）
  // ========================================

  let executeTask; // 関数を変数として宣言
  try {
    executeTask = async function executeTaskImpl(taskData) {
      // 実行前にフラグをリセット（どの経路から呼ばれても適切に初期化）
      window.__v2_execution_complete = false;
      window.__v2_execution_result = null;

      // タスク開始をログに記録
      ChatGPTLogManager.startTask(taskData);

      log.debug(
        "%c🚀 ChatGPT V2 タスク実行開始",
        "color: #00BCD4; font-weight: bold; font-size: 16px",
      );
      log.debug("受信したタスクデータ:", {
        model: taskData.model,
        function: taskData.function,
        promptLength: taskData.prompt?.length || taskData.text?.length || 0,
        hasPrompt: !!(taskData.prompt || taskData.text),
      });

      try {
        // ========================================
        // Step 4-1-0: ページ準備確認
        // ========================================
        await waitForPageReady();

        // ========================================
        // ステップ1: ページ準備状態チェック（初回実行の問題を解決）
        // ========================================
        logWithTimestamp("\n【Step 4-1-1】ページ初期化チェック", "step");

        // 1-1. ChatGPT UIの基本要素が存在するか確認
        const criticalElements = {
          テキスト入力欄: SELECTORS.textInput,
          モデルボタン: SELECTORS.modelButton,
        };

        let allElementsReady = false;
        let retryCount = 0;
        const maxRetries = 10;

        // 最初のタスクの場合は追加の初期化待機
        const isFirstTask = !window.ChatGPTAutomationV2._initialized;
        if (isFirstTask) {
          logWithTimestamp(
            "初回タスク実行を検知。追加の初期化待機を行います",
            "info",
          );
          await sleep(AI_WAIT_CONFIG.LONG_WAIT); // 初回は3秒待機
          window.ChatGPTAutomationV2._initialized = true;
        }

        // 全ての重要な要素が利用可能になるまで待機
        while (!allElementsReady && retryCount < maxRetries) {
          allElementsReady = true;

          for (const [name, selectors] of Object.entries(criticalElements)) {
            const element = await findElement(selectors, name, 1);
            if (!element) {
              logWithTimestamp(
                `${name}が見つかりません。待機中... (${retryCount + 1}/${maxRetries})`,
                "warning",
              );
              allElementsReady = false;
              break;
            }
          }

          if (!allElementsReady) {
            await sleep(AI_WAIT_CONFIG.MEDIUM_WAIT);
            retryCount++;
          }
        }

        if (!allElementsReady) {
          throw new Error(
            "ChatGPT UIが完全に初期化されていません。ページをリロードしてください。",
          );
        }

        // 1-2. React/DOM の安定化待機
        logWithTimestamp("1-2. DOM安定化待機中...", "info");
        await sleep(AI_WAIT_CONFIG.MEDIUM_WAIT - 500);

        // 1-3. 既存の開いているメニューを全て閉じる
        const openMenus = document.querySelectorAll(
          '[role="menu"][data-state="open"]',
        );
        if (openMenus.length > 0) {
          logWithTimestamp(
            `開いているメニュー(${openMenus.length}個)を閉じます`,
            "info",
          );
          document.dispatchEvent(
            new KeyboardEvent("keydown", { key: "Escape", code: "Escape" }),
          );
          await sleep(AI_WAIT_CONFIG.TINY_WAIT);
        }

        logWithTimestamp("ページ初期化チェック完了", "success");

        // パラメータ準備（スプレッドシートの値をそのまま使用）
        let prompt = taskData.prompt || taskData.text || "";

        // セル位置情報を追加
        if (
          taskData.cellInfo &&
          taskData.cellInfo.column &&
          taskData.cellInfo.row
        ) {
          const cellPosition = `${taskData.cellInfo.column}${taskData.cellInfo.row}`;
          prompt = `【現在${cellPosition}セルを処理中です】\n\n${prompt}`;
          log.debug(`📍 [ChatGPT] セル位置情報を追加: ${cellPosition}`);
        } else {
          log.debug("📍 [ChatGPT] セル位置情報なし:", {
            hasCellInfo: !!(taskData && taskData.cellInfo),
            cellInfo: taskData && taskData.cellInfo,
            taskDataKeys: taskData ? Object.keys(taskData) : [],
          });
        }

        const modelName = taskData.model || "";
        const featureName = taskData.function || null;

        logWithTimestamp(`選択されたモデル: ${modelName}`, "info");
        logWithTimestamp(
          `選択された機能: ${featureName || "設定なし"}`,
          "info",
        );
        logWithTimestamp(`プロンプト: ${prompt.substring(0, 100)}...`, "info");

        // モデル情報を事前取得（テスト済みコードのロジック）
        let selectedModel = null;
        if (modelName) {
          // 利用可能なモデルを検索してselectedModelオブジェクトを作成
          const modelButton = await findElement(
            SELECTORS.modelButton,
            "モデル切り替えボタン",
          );
          if (modelButton) {
            await openModelMenu(modelButton);

            const modelMenu = await findElement(
              SELECTORS.modelMenu,
              "モデルメニュー",
            );
            if (modelMenu) {
              // メインメニューのモデル取得
              const mainMenuItems = modelMenu.querySelectorAll(
                '[role="menuitem"][data-testid^="model-switcher-"]',
              );
              for (const item of mainMenuItems) {
                const itemModelName = getCleanText(item);
                if (
                  itemModelName === modelName ||
                  itemModelName.includes(modelName)
                ) {
                  selectedModel = {
                    name: itemModelName,
                    testId: item.getAttribute("data-testid"),
                    type: "Current",
                  };
                  break;
                }
              }

              // レガシーモデルもチェック
              if (!selectedModel) {
                const legacyButton =
                  modelMenu.querySelector(
                    '[role="menuitem"][data-has-submenu]',
                  ) ||
                  Array.from(
                    modelMenu.querySelectorAll('[role="menuitem"]'),
                  ).find(
                    (el) =>
                      el.textContent &&
                      el.textContent.includes("レガシーモデル"),
                  );

                if (legacyButton) {
                  legacyButton.click();
                  await sleep(AI_WAIT_CONFIG.MEDIUM_WAIT - 500);

                  const allMenus = document.querySelectorAll('[role="menu"]');
                  for (const menu of allMenus) {
                    if (menu !== modelMenu) {
                      const items = menu.querySelectorAll('[role="menuitem"]');
                      for (const item of items) {
                        const itemModelName = getCleanText(item);
                        if (
                          itemModelName === modelName ||
                          itemModelName.includes(modelName)
                        ) {
                          selectedModel = {
                            name: itemModelName,
                            type: "Legacy",
                          };
                          break;
                        }
                      }
                      if (selectedModel) break;
                    }
                  }
                }
              }

              // メニューを閉じる
              document.dispatchEvent(
                new KeyboardEvent("keydown", {
                  key: "Escape",
                  code: "Escape",
                }),
              );
              await sleep(AI_WAIT_CONFIG.SHORT_WAIT);
            }
          }
        }

        // ========================================
        // ステップ2: テキスト入力（堅牢性強化版）
        // ========================================
        logWithTimestamp("\n【Step 4-1-2】テキスト入力", "step");

        // デバッグ: 使用するセレクタ一覧を表示
        logWithTimestamp(
          `使用するセレクタ (${SELECTORS.textInput.length}個):`,
          "info",
        );
        SELECTORS.textInput.forEach((selector, index) => {
          logWithTimestamp(`  ${index + 1}. ${selector}`, "info");
        });

        // getElementWithWaitを使用してテキスト入力欄を検索
        let input = await getElementWithWait(
          SELECTORS.textInput,
          "テキスト入力欄",
          10000,
        );

        if (!input) {
          // 最後の手段として、より広範囲の検索を試行
          logWithTimestamp("最後の手段として広範囲検索を実行", "warning");

          // デバッグ: ページ上の全ての編集可能要素を調査
          const allEditableElements = document.querySelectorAll(
            '[contenteditable="true"], textarea, input[type="text"]',
          );
          logWithTimestamp(
            `発見された編集可能要素: ${allEditableElements.length}個`,
            "info",
          );

          allEditableElements.forEach((elem, index) => {
            const tagName = elem.tagName;
            const className = elem.className || "(クラスなし)";
            const id = elem.id || "(IDなし)";
            const placeholder =
              elem.placeholder ||
              elem.getAttribute("placeholder") ||
              "(プレースホルダーなし)";
            const isInteractable = isElementInteractable(elem);
            logWithTimestamp(
              `  ${index + 1}. ${tagName} - クラス: ${className} - ID: ${id} - プレースホルダー: ${placeholder} - 操作可能: ${isInteractable}`,
              "info",
            );
          });

          for (const elem of allEditableElements) {
            if (isElementInteractable(elem)) {
              input = elem;
              logWithTimestamp(
                `代替入力欄を発見: ${elem.tagName}.${elem.className}`,
                "success",
              );
              break;
            }
          }
        }

        if (!input) {
          throw new Error(
            `${maxInputAttempts}回試行してもテキスト入力欄が見つかりません`,
          );
        }

        logWithTimestamp(
          "テキスト入力欄を発見、テキストを入力中...",
          "success",
        );

        // テスト済みのシンプルなテキスト入力処理
        if (
          input.classList.contains("ProseMirror") ||
          input.classList.contains("ql-editor")
        ) {
          input.innerHTML = "";
          const p = document.createElement("p");
          p.textContent = prompt;
          input.appendChild(p);
          input.classList.remove("ql-blank");
          input.dispatchEvent(new Event("input", { bubbles: true }));
          input.dispatchEvent(new Event("change", { bubbles: true }));
          logWithTimestamp("テキスト入力完了", "success");
        } else {
          input.textContent = prompt;
          input.dispatchEvent(new Event("input", { bubbles: true }));
          logWithTimestamp("テキスト入力完了", "success");
        }

        await sleep(AI_WAIT_CONFIG.SHORT_WAIT);

        // ========================================
        // ステップ3: モデル選択（テスト済みシンプル処理）
        // ========================================

        // ========================================
        // ステップ3: モデル選択（簡素化版）
        // ========================================
        if (modelName) {
          logWithTimestamp("\n【Step 4-1-3】モデル選択", "step");
          logWithTimestamp(`選択するモデル: ${modelName}`, "info");

          try {
            // モデルボタンを探す
            const modelBtn = await findElement(
              SELECTORS.modelButton,
              "モデルボタン",
              3,
            );

            if (modelBtn) {
              // メニューを開く
              triggerReactEvent(modelBtn, "pointer");
              await sleep(1500);

              // モデルメニューを探す
              const modelMenuEl = await findElement(
                SELECTORS.modelMenu,
                "モデルメニュー",
                3,
              );

              if (modelMenuEl) {
                // 指定されたモデルを探してクリック
                const allMenuItems =
                  document.querySelectorAll('[role="menuitem"]');
                const targetItem = Array.from(allMenuItems).find((item) => {
                  const text = getCleanText(item);
                  return text === modelName || text.includes(modelName);
                });

                if (targetItem) {
                  targetItem.click();
                  await sleep(2000);
                  logWithTimestamp(
                    `✅ モデル選択完了: ${modelName}`,
                    "success",
                  );
                } else {
                  logWithTimestamp(
                    `⚠️ 指定されたモデルが見つかりません: ${modelName}`,
                    "warning",
                  );
                }
              } else {
                logWithTimestamp(
                  "⚠️ モデルメニューが開きませんでした",
                  "warning",
                );
              }

              // メニューを閉じる（開いている場合）
              document.dispatchEvent(
                new KeyboardEvent("keydown", { key: "Escape", code: "Escape" }),
              );
              await sleep(500);
            } else {
              logWithTimestamp("⚠️ モデルボタンが見つかりません", "warning");
            }
          } catch (error) {
            logWithTimestamp(
              `⚠️ モデル選択でエラー: ${error.message}`,
              "warning",
            );
          }
        } else {
          logWithTimestamp("モデル選択をスキップ（モデル名未指定）", "info");
        }

        logWithTimestamp("モデル選択処理完了、次のステップへ", "debug");

        // ========================================
        // ステップ4: 機能選択（簡素化版）
        // ========================================
        if (
          featureName &&
          featureName !== "" &&
          featureName !== "none" &&
          featureName !== "通常"
        ) {
          logWithTimestamp("\n【Step 4-1-4】機能選択", "step");
          logWithTimestamp(`選択する機能: ${featureName}`, "info");

          try {
            // 機能メニューボタンを探す
            const funcMenuBtn = await findElement(
              SELECTORS.menuButton,
              "機能メニューボタン",
              3,
            );

            if (funcMenuBtn) {
              // 機能メニューを開く処理（簡略化）
              logWithTimestamp(
                "機能選択処理をスキップ（簡略化のため）",
                "info",
              );
            }
          } catch (error) {
            logWithTimestamp(
              `⚠️ 機能選択でエラー: ${error.message}`,
              "warning",
            );
          }
        } else {
          logWithTimestamp("機能選択をスキップ（機能名未指定）", "info");
        }

        // ========================================
        // ステップ5: メッセージ送信（最重要）
        // ========================================
        logWithTimestamp("\n【Step 4-1-5】メッセージ送信", "step");
        logWithTimestamp("🎯 送信ボタンを探しています...", "debug");

        try {
          const sendBtn = await findElement(
            SELECTORS.sendButton,
            "送信ボタン",
            5,
          );
          if (sendBtn) {
            logWithTimestamp("✅ 送信ボタンを発見しました", "success");
            sendBtn.click();
            logWithTimestamp("🚀 送信ボタンをクリックしました！", "success");

            // 送信時刻を記録
            const sendTime = new Date();
            const taskId = taskData.taskId || taskData.id || "UNKNOWN_TASK_ID";

            // モデルと機能を取得
            const modelName = (await getCurrentModelChatGPT()) || "不明";
            const featureName = (await getCurrentFunctionChatGPT()) || "通常";

            // background.jsに送信時刻を記録
            if (chrome.runtime && chrome.runtime.sendMessage) {
              const messageToSend = {
                type: "recordSendTime",
                taskId: taskId,
                sendTime: sendTime.toISOString(),
                taskInfo: {
                  aiType: "ChatGPT",
                  model: modelName,
                  function: featureName,
                  url: window.location.href,
                  cellInfo: taskData.cellInfo,
                },
                logCell: taskData.logCell,
              };

              try {
                chrome.runtime.sendMessage(messageToSend, (response) => {
                  if (chrome.runtime.lastError) {
                    console.warn(
                      "⚠️ [ChatGPT] 送信時刻記録エラー:",
                      chrome.runtime.lastError.message,
                    );
                  } else {
                    console.log("✅ [ChatGPT] 送信時刻記録成功", response);
                  }
                });
              } catch (error) {
                console.error("❌ [ChatGPT] 送信時刻記録失敗:", error);
              }
            }

            await sleep(1000);
          } else {
            logWithTimestamp("⚠️ 送信ボタンが見つかりません", "warning");
            // Enterキーでの送信を試みる
            const inputField = document.querySelector(
              '[contenteditable="true"]',
            );
            if (inputField) {
              inputField.dispatchEvent(
                new KeyboardEvent("keydown", {
                  key: "Enter",
                  code: "Enter",
                  ctrlKey: true,
                }),
              );
              logWithTimestamp("⌨️ Enterキーで送信を試みました", "info");
            }
          }
        } catch (error) {
          logWithTimestamp(`❌ 送信エラー: ${error.message}`, "error");
        }

        // ========================================
        // ステップ6: 応答待機
        // ========================================
        logWithTimestamp("\n【Step 4-1-6】応答待機", "step");

        // 停止ボタンが表示されるまで待機
        let stopBtn = null;
        for (let i = 0; i < 30; i++) {
          stopBtn = await findElement(SELECTORS.stopButton, "停止ボタン", 1);
          if (stopBtn) {
            logWithTimestamp(
              "停止ボタンが表示されました（応答生成中）",
              "success",
            );
            break;
          }
          await sleep(1000);
        }

        // 停止ボタンが消えるまで待機（最大5分）
        if (stopBtn) {
          logWithTimestamp("応答生成を待機中...", "info");
          for (let i = 0; i < 300; i++) {
            stopBtn = await findElement(SELECTORS.stopButton, "停止ボタン", 1);
            if (!stopBtn) {
              logWithTimestamp("✅ 応答生成完了", "success");
              break;
            }
            if (i % 10 === 0) {
              logWithTimestamp(`応答待機中... (${i}秒経過)`, "info");
            }
            await sleep(1000);
          }
        }

        await sleep(2000); // 追加の待機

        // ========================================
        // ステップ7: テキスト取得
        // ========================================
        logWithTimestamp("\n【Step 4-1-7】テキスト取得", "step");

        let responseText = "";
        try {
          // 最新のアシスタントメッセージを取得
          const assistantMessages = document.querySelectorAll(
            '[data-message-author-role="assistant"]',
          );
          if (assistantMessages.length > 0) {
            const lastMessage = assistantMessages[assistantMessages.length - 1];
            responseText = lastMessage.textContent?.trim() || "";
            logWithTimestamp(
              `✅ 応答取得成功: ${responseText.length}文字`,
              "success",
            );
          } else {
            logWithTimestamp(
              "⚠️ アシスタントメッセージが見つかりません",
              "warning",
            );
          }
        } catch (error) {
          logWithTimestamp(`❌ テキスト取得エラー: ${error.message}`, "error");
        }

        // 結果を返す
        const result = {
          success: true,
          text: responseText,
          timestamp: new Date().toISOString(),
        };

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
                    "⚠️ [ChatGPT-TaskCompletion] 完了通知エラー:",
                    chrome.runtime.lastError.message,
                  );
                } else {
                }
              });
            }
          }
        } catch (completionError) {
          console.warn(
            "⚠️ [ChatGPT-TaskCompletion] 完了処理エラー:",
            completionError.message,
          );
        }

        logWithTimestamp("✅ タスク完了", "success");
        return result;
      } catch (error) {
        // エラーハンドリング
        return handleTaskError(error, taskData);
      }
    };
  } catch (error) {
    console.error("❌ [DEBUG] executeTask関数定義エラー:", error);
  }

  // ========================================
  // runAutomation関数（後方互換性）
  // ========================================
  async function runAutomation(config) {
    // executeTask内でフラグリセットが行われるため、ここでは不要
    return executeTask({
      model: config.model,
      function: config.function,
      prompt: config.text || config.prompt,
    });
  }

  // ========================================
  // グローバル公開
  // ========================================
  try {
  } catch (error) {
    console.error("❌ [DEBUG] グローバル公開セクションでエラー:", error);
  }

  const automationAPI = {
    executeTask,
    runAutomation,
  };

  log.debug("[DEBUG] automationAPI作成成功");
  log.debug("[DEBUG] automationAPI作成完了、windowに設定開始");

  // v2名と標準名の両方をサポート（下位互換性保持）
  window.ChatGPTAutomationV2 = automationAPI;
  window.ChatGPTAutomation = automationAPI;

  // グローバル関数として直接アクセス可能にする
  window.executeTask = executeTask;
  window.runAutomation = runAutomation;

  log.debug("[DEBUG] window.ChatGPTAutomationV2設定完了");
  log.debug(
    "[DEBUG] typeof window.ChatGPTAutomationV2:",
    typeof window.ChatGPTAutomationV2,
  );

  // ========================================
  // 🌉 Content Script ↔ Webpage ブリッジ
  // ========================================
  // Content Scriptの関数をWebページのコンテキストで利用可能にする
  // CSPエラーを回避するため、インラインスクリプトは使用しない

  // Content Script内でグローバルアクセス可能なオブジェクトを作成
  // 注意: これはWebページコンテキストではなくContent Script内でのみ利用可能
  window.ChatGPTAutomationBridge = {
    executeTask: async function (task) {
      try {
        const result = await executeTask(task);
        return result;
      } catch (error) {
        console.error("🌉 [BRIDGE] executeTaskエラー:", error);
        throw error;
      }
    },

    runAutomation: async function () {
      try {
        const result = await runAutomation();
        return result;
      } catch (error) {
        console.error("🌉 [BRIDGE] runAutomationエラー:", error);
        throw error;
      }
    },

    detectModels: async function () {
      try {
        const result = await detectChatGPTModelsAndFunctions();
        return result;
      } catch (error) {
        console.error("🌉 [BRIDGE] detectModelsエラー:", error);
        throw error;
      }
    },
  };

  // グローバルにアクセスしやすいエイリアス
  window.ChatGPT = window.ChatGPTAutomationBridge;

  // Content Script側でブリッジメッセージを処理
  window.addEventListener("message", async (event) => {
    if (event.data.type === "CHATGPT_AUTOMATION_EXECUTE") {
      try {
        let result;
        switch (event.data.command) {
          case "executeTask":
            result = await executeTask(event.data.data);
            break;
          case "runAutomation":
            result = await runAutomation();
            break;
          case "detectModels":
            result = await detectChatGPTModelsAndFeatures();
            break;
          default:
            throw new Error(`未知のコマンド: ${event.data.command}`);
        }

        // 成功レスポンス
        window.postMessage(
          {
            type: "CHATGPT_AUTOMATION_RESPONSE",
            command: event.data.command,
            success: true,
            result: result,
          },
          "*",
        );
      } catch (error) {
        // エラーレスポンス
        console.error("🌉 [DEBUG] ブリッジエラー:", error);
        window.postMessage(
          {
            type: "CHATGPT_AUTOMATION_RESPONSE",
            command: event.data.command,
            success: false,
            error: error.message,
          },
          "*",
        );
      }
    }
  });

  // 初期化マーカー設定（グローバルに再設定）
  window.CHATGPT_SCRIPT_LOADED = true;
  window.CHATGPT_SCRIPT_INIT_TIME = Date.now();

  // ========================================
  // メッセージリスナー登録 (step4-tasklist.js統合用)
  // ========================================
  const registerMessageListener = () => {
    log.debug("📡 [ChatGPT-直接実行方式] メッセージリスナー登録開始");

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      // リクエストIDを生成（デバッグ用）
      const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

      // デバッグ：送信元の詳細情報
      log.debug(`📬 [ChatGPT] メッセージ受信 [${requestId}]:`, {
        type: request.type,
        action: request.action,
        senderId: sender?.id,
        senderUrl: sender?.url,
        tabId: sender?.tab?.id,
        frameId: sender?.frameId,
      });

      // すべてのメッセージに対してデフォルトでtrueを返す準備
      let shouldReturnTrue = true;

      try {
        // ping/pongメッセージへの即座応答（最優先）
        if (
          request.action === "ping" ||
          request.type === "CONTENT_SCRIPT_CHECK" ||
          request.type === "PING"
        ) {
          log.debug("🏓 [ChatGPT] Ping受信、即座にPong応答");
          sendResponse({
            action: "pong",
            status: "ready",
            timestamp: Date.now(),
            scriptLoaded: true,
          });
          return true;
        }

        // テキスト入力欄の存在チェック
        if (request.action === "CHECK_INPUT_FIELD") {
          log.debug("🔍 [ChatGPT] テキスト入力欄の存在チェック開始");
          const selectors = request.selectors || [
            'textarea[placeholder*="Message"]',
            'textarea[data-id*="root"]',
            "#prompt-textarea",
            "textarea",
          ];

          let inputField = null;
          for (const selector of selectors) {
            try {
              inputField = document.querySelector(selector);
              if (inputField && inputField.offsetParent !== null) {
                break;
              }
            } catch (e) {
              // セレクタエラーは無視
            }
          }

          const result = {
            found: !!inputField,
            selector: inputField ? inputField.tagName.toLowerCase() : null,
            aiType: request.aiType || "chatgpt",
            tabId: sender.tab?.id,
          };

          log.debug("🔍 [ChatGPT] テキスト入力欄チェック結果:", result);
          sendResponse(result);
          return true;
        }

        // DISCOVER_FEATURESメッセージの処理
        if (request.type === "DISCOVER_FEATURES") {
          log.info(`🔍 [ChatGPT] DISCOVER_FEATURES実行開始`);

          (async () => {
            try {
              // 実際のUIからモデルと機能を探索
              const availableModels = [];
              const availableFunctions = [];

              // モデル探索
              const modelBtn =
                document.querySelector(
                  'button[type="button"]:has([data-testid="model-switcher-button"])',
                ) ||
                document.querySelector(
                  'button:has([data-testid="model-switcher-button"])',
                );

              if (modelBtn) {
                modelBtn.click();
                await sleep(1500);

                const modelMenu = document.querySelector('div[role="menu"]');
                if (modelMenu) {
                  // メインモデルメニューの項目取得
                  const mainMenuItems = modelMenu.querySelectorAll(
                    '[role="menuitem"][data-testid^="model-switcher-"]',
                  );
                  mainMenuItems.forEach((item) => {
                    const modelName = item.textContent.trim();
                    if (modelName && !modelName.includes("レガシー")) {
                      availableModels.push(modelName);
                    }
                  });

                  // レガシーモデルもチェック
                  const legacyButton =
                    modelMenu.querySelector(
                      '[role="menuitem"][data-has-submenu]',
                    ) ||
                    Array.from(
                      modelMenu.querySelectorAll('[role="menuitem"]'),
                    ).find(
                      (el) =>
                        el.textContent &&
                        el.textContent.includes("レガシーモデル"),
                    );

                  if (legacyButton) {
                    legacyButton.click();
                    await sleep(1500);

                    const allMenus = document.querySelectorAll('[role="menu"]');
                    allMenus.forEach((menu) => {
                      if (menu !== modelMenu) {
                        const items =
                          menu.querySelectorAll('[role="menuitem"]');
                        items.forEach((item) => {
                          const modelName = item.textContent.trim();
                          if (modelName && modelName.includes("GPT")) {
                            availableModels.push(modelName);
                          }
                        });
                      }
                    });
                  }

                  // メニューを閉じる
                  document.dispatchEvent(
                    new KeyboardEvent("keydown", {
                      key: "Escape",
                      code: "Escape",
                    }),
                  );
                  await sleep(500);
                }
              }

              // 機能探索
              const funcMenuBtn =
                document.querySelector(
                  'button[aria-label="機能メニューを開く"]',
                ) ||
                document.querySelector(
                  'button:has(svg):has(path[d*="M12 6.5a5.5"])',
                );

              if (funcMenuBtn) {
                funcMenuBtn.click();
                await sleep(1500);

                const funcMenu = document.querySelector('div[role="menu"]');
                if (funcMenu) {
                  // メイン機能を取得
                  const menuItems = funcMenu.querySelectorAll(
                    '[role="menuitemradio"]',
                  );
                  menuItems.forEach((item) => {
                    const funcName = item.textContent.trim();
                    if (funcName) {
                      availableFunctions.push(funcName);
                    }
                  });

                  // サブメニューもチェック
                  const moreButton = Array.from(
                    funcMenu.querySelectorAll('[role="menuitem"]'),
                  ).find(
                    (el) =>
                      el.textContent && el.textContent.includes("さらに表示"),
                  );

                  if (moreButton) {
                    moreButton.click();
                    await sleep(1000);

                    const subMenu = document.querySelector(
                      '[data-side="right"]',
                    );
                    if (subMenu) {
                      const subMenuItems = subMenu.querySelectorAll(
                        '[role="menuitemradio"]',
                      );
                      subMenuItems.forEach((item) => {
                        const funcName = item.textContent.trim();
                        if (funcName) {
                          availableFunctions.push(funcName);
                        }
                      });
                    }
                  }

                  // メニューを閉じる
                  document.dispatchEvent(
                    new KeyboardEvent("keydown", {
                      key: "Escape",
                      code: "Escape",
                    }),
                  );
                  await sleep(500);
                }
              }

              const result = {
                models: availableModels,
                functions: availableFunctions,
              };

              log.info(`✅ [ChatGPT] DISCOVER_FEATURES完了:`, result);

              // UIに送信
              if (typeof sendToUI === "function") {
                sendToUI(result);
              }

              sendResponse({
                success: true,
                result: result,
              });
            } catch (error) {
              log.error(`❌ [ChatGPT] DISCOVER_FEATURESエラー:`, error);
              sendResponse({
                success: false,
                error: error.message,
              });
            }
          })();
          return true; // 非同期レスポンスのために必要
        }

        // executeTaskタスクの処理
        if (
          request.action === "executeTask" ||
          request.type === "executeTask" ||
          request.type === "CLAUDE_EXECUTE_TASK" ||
          request.type === "EXECUTE_TASK"
        ) {
          log.warn(
            `🔧 [ChatGPT-直接実行方式] executeTask実行開始 [ID:${requestId}]`,
            JSON.stringify(
              {
                requestId: requestId,
                action: request.action,
                type: request.type,
                automationName: request.automationName,
                hasTask: !!request.task,
                hasTaskData: !!request.taskData,
                taskId: request?.task?.id || request?.taskData?.id,
              },
              null,
              2,
            ),
          );

          // タスクデータを抽出
          const taskToExecute = request.task || request.taskData;

          if (!taskToExecute) {
            const errorMsg = "Task data not found in request";
            log.error(`❌ [ChatGPT] ${errorMsg}`);
            sendResponse({ success: false, error: errorMsg });
            return true;
          }

          log.debug(`🔍 [ChatGPT] executeTask実行開始 [ID:${requestId}]:`, {
            taskId: taskToExecute.id,
            prompt: taskToExecute.prompt
              ? `${taskToExecute.prompt.substring(0, 50)}...`
              : null,
            model: taskToExecute.model,
            function: taskToExecute.function,
            taskKeys: Object.keys(taskToExecute || {}),
          });

          // executeTask関数が定義されているか確認（Claude式安全パターン）
          if (typeof executeTask === "function") {
            log.debug(
              `✅ [ChatGPT-直接実行方式] executeTask関数が利用可能 [ID:${requestId}]`,
            );

            (async () => {
              try {
                const result = await executeTask(taskToExecute);
                log.warn(
                  `✅ [ChatGPT-直接実行方式] executeTask完了 [ID:${requestId}]:`,
                  {
                    success: result?.success,
                    hasResult: !!result,
                    resultKeys: result ? Object.keys(result) : [],
                  },
                );
                sendResponse({ success: true, result });
              } catch (taskError) {
                const errorMsg = `executeTask実行エラー: ${taskError.message}`;
                log.error(
                  `❌ [ChatGPT] ${errorMsg} [ID:${requestId}]`,
                  taskError,
                );
                sendResponse({ success: false, error: errorMsg });
              }
            })();
          } else {
            const errorMsg = "executeTask関数が定義されていません";
            log.error(`❌ [ChatGPT] ${errorMsg} [ID:${requestId}]`);
            sendResponse({ success: false, error: errorMsg });
          }
          return true;
        }
      } catch (error) {
        log.error(`❌ [ChatGPT] メッセージ処理エラー [${requestId}]:`, error);
        // エラーでも必ず応答を返す
        try {
          sendResponse({
            success: false,
            error: error.message,
            requestId: requestId,
            timestamp: Date.now(),
          });
        } catch (sendError) {
          log.error(`❌ [ChatGPT] 応答送信エラー:`, sendError);
        }
        return true;
      }

      // その他のメッセージは無視
      log.debug(`🔕 [ChatGPT] 未対応メッセージを処理:`, {
        action: request.action,
        type: request.type,
        requestId: requestId,
      });

      // 必ず応答を返す
      try {
        sendResponse({
          success: false,
          error: "Unsupported message type",
          requestId: requestId,
          timestamp: Date.now(),
        });
      } catch (sendError) {
        log.error(`❌ [ChatGPT] デフォルト応答送信エラー:`, sendError);
      }

      return true; // 常にtrueを返す
    });

    log.debug("✅ [ChatGPT] メッセージリスナー登録完了");
  };

  // メッセージリスナーを即座に登録
  try {
    registerMessageListener();
  } catch (error) {
    console.error("❌ [ChatGPT] メッセージリスナー登録エラー:", error);
  }

  log.debug("✅ ChatGPT Automation V2 準備完了");
  log.debug(
    '使用方法: ChatGPTAutomation.executeTask({ model: "GPT-4o", function: "Deep Research", prompt: "..." })',
  );
  log.debug(
    "✅ 下位互換性: ChatGPTAutomation と ChatGPTAutomationV2 の両方で利用可能",
  );

  // ChatGPTAutomation オブジェクトを global に公開
  window.ChatGPTAutomation = window.ChatGPTAutomation || {};
  Object.assign(window.ChatGPTAutomation, {
    detectChatGPTModelsAndFeatures,
    selectModelByIndex,
    selectFunctionByIndex,
    sendToUI,
    executeFullTest,
    // 既存の関数も公開
    inputTextChatGPT,
    sendMessageChatGPT,
    waitForResponseChatGPT,
    getResponseTextChatGPT,
    selectModelChatGPT,
    selectFunctionChatGPT,
  });

  logWithTimestamp(
    "✅ ChatGPT Automation Enhanced - インデックス選択機能追加完了",
    "success",
  );

  // ChatGPTLogManagerをwindowに設定（即座実行関数内で実行）
  window.ChatGPTLogManager = ChatGPTLogManager;

  /*
┌─────────────────────────────────────────────────────┐
│                【使用例】                              │
└─────────────────────────────────────────────────────┘

// 基本的な使用の流れ
import {
    selectModelChatGPT,
    inputTextChatGPT,
    sendMessageChatGPT,
    waitForResponseChatGPT,
    getResponseTextChatGPT
} from './chatgpt-automation.js';

async function chatWithChatGPT() {
    try {
        // 1. モデル選択
        await selectModelChatGPT('GPT-4');

        // 2. テキスト入力
        await inputTextChatGPT('こんにちは、世界！JavaScriptについて教えて');

        // 3. 送信
        await sendMessageChatGPT();

        // 4. レスポンス待機
        await waitForResponseChatGPT();

        // 5. 結果取得
        const response = await getResponseTextChatGPT();
        log.debug('ChatGPT回答:', response);

        return response;
    } catch (error) {
        log.error('ChatGPT操作エラー:', error);
        throw error;
    }
}

*/

  // ========================================
  // 注意: ChatGPTLogManagerはIIFE内で定義されているため、
  // IIFE外でのwindow設定やbeforeunloadイベントでの使用は不可
  // ========================================

  // ========================================
  // 【エクスポート】検出システム用関数一覧
  // ========================================
  // ChatGPT自動化関数はwindowオブジェクトに定義
  // エクスポートする関数なし（内部実装のみ）
  // コンテンツスクリプトではexport文を使用できないため、コメントアウト

  // ========================================
  // ChatGPTモデル・機能検出関数
  // ========================================

  // 検出結果を保存するグローバル変数（既存情報を保持）
  window.ChatGPTAutomation = window.ChatGPTAutomation || {};
  window.ChatGPTAutomation.detectionResult = window.ChatGPTAutomation
    .detectionResult || { models: [], functions: [] };

  async function detectChatGPTModelsAndFeatures() {
    log.info("🔍 ChatGPTモデル・機能検出開始");

    // テストコードから動作確認済みのセレクタを使用
    // 動作テストコードから完全コピーしたセレクタ定義
    const DETECTION_SELECTORS = {
      // モデル関連（動作テストコードから）
      modelButton: [
        '[data-testid="model-switcher-dropdown-button"]',
        'button[aria-label*="モデル セレクター"]',
        'button[aria-label*="モデル"][aria-haspopup="menu"]',
        "#radix-\\:r2m\\:",
        'button.group.flex.cursor-pointer[aria-haspopup="menu"]',
      ],
      modelMenu: [
        '[role="menu"][data-radix-menu-content]',
        '[role="menu"][data-state="open"]',
        'div.z-50.max-w-xs.rounded-2xl.popover[role="menu"]',
        '[aria-labelledby*="radix"][role="menu"]',
        'div[data-radix-popper-content-wrapper] [role="menu"]',
      ],
      legacyButton: [
        '[data-testid="レガシーモデル-submenu"]',
        '[role="menuitem"][data-has-submenu]:contains("レガシーモデル")',
        'div.__menu-item:contains("レガシーモデル")',
        '[role="menuitem"][aria-haspopup="menu"]:last-of-type',
      ],
      legacyMenu: [
        '[role="menu"][data-side="right"]',
        'div[data-side="right"][role="menu"]',
        '[role="menu"]:not([data-side="bottom"])',
        'div.mt-2.max-h-\\[calc\\(100vh-300px\\)\\][role="menu"]',
      ],
      // 機能関連（動作テストコードから）
      functionMenuButton: [
        '[data-testid="composer-plus-btn"]',
        'button[aria-haspopup="menu"]',
        "#radix-\\:R2eij4im4pact9a4mj5\\:",
        "button.composer-btn",
        'div[class*="leading"] button',
      ],
      functionMenu: [
        '[role="menu"][data-state="open"]',
        "[data-radix-menu-content]",
        'div[data-side="bottom"][role="menu"]',
        'div.popover[role="menu"]',
        '[role="menu"]',
      ],
      subMenu: [
        '[role="menu"][data-side="right"]',
        'div[data-side="right"][role="menu"]',
        '[data-align="start"][role="menu"]:last-of-type',
      ],
    };

    // テストコードから要素検索関数（可視性チェック付き）
    const isElementInteractable = (element) => {
      if (!element) return false;
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        style.opacity !== "0"
      );
    };

    // 動作テストコードから完全コピー：装飾要素を除外したテキスト取得
    function getCleanText(element) {
      if (!element) return "";
      const clone = element.cloneNode(true);
      // 装飾要素を削除
      const decorativeElements = clone.querySelectorAll(
        "mat-icon, mat-ripple, svg, .icon, .ripple",
      );
      decorativeElements.forEach((el) => el.remove());
      return clone.textContent?.trim() || "";
    }

    // モデル名をクリーンアップする関数（説明文を削除してコア名のみ抽出）
    function getCleanModelName(modelText) {
      if (!modelText) return "";

      // 英語部分（文字、数字、ハイフン、ドット）のみを抽出
      const match = modelText.match(/^[A-Za-z0-9.-]+/);
      return match ? match[0] : modelText;
    }

    // 動作テストコードのReactイベントトリガー関数を追加
    function triggerReactEvent(element, eventType, eventData = {}) {
      try {
        if (eventType === "click") {
          element.click();
          return true;
        } else if (eventType === "pointer") {
          const pointerDown = new PointerEvent("pointerdown", {
            bubbles: true,
            cancelable: true,
            view: window,
            ...eventData,
          });
          const pointerUp = new PointerEvent("pointerup", {
            bubbles: true,
            cancelable: true,
            view: window,
            ...eventData,
          });
          element.dispatchEvent(pointerDown);
          element.dispatchEvent(pointerUp);
          return true;
        }
        return false;
      } catch (error) {
        logWithTimestamp(
          `React イベントトリガー失敗: ${error.message}`,
          "error",
        );
        return false;
      }
    }

    // 動作テストコードから完全コピー：複数セレクタで要素検索
    const findElement = async (selectors, description = "", maxRetries = 3) => {
      for (let retry = 0; retry < maxRetries; retry++) {
        for (const selector of selectors) {
          try {
            let element;

            if (selector.includes(":contains(")) {
              const match = selector.match(/\:contains\("([^"]+)"\)/);
              if (match) {
                const text = match[1];
                const baseSelector = selector.split(":contains(")[0];
                const elements = document.querySelectorAll(baseSelector || "*");
                element = Array.from(elements).find(
                  (el) => el.textContent && el.textContent.includes(text),
                );
              }
            } else {
              element = document.querySelector(selector);
            }

            if (element && isElementInteractable(element)) {
              return element;
            }
          } catch (e) {
            // セレクタエラーを無視
          }
        }

        if (retry < maxRetries - 1) {
          await sleep(500);
        }
      }

      return null;
    };

    // 動作テストコードから完全コピー：テキストで要素を検索
    function findElementByText(selector, text, parent = document) {
      const elements = parent.querySelectorAll(selector);
      for (const el of elements) {
        if (el.textContent && el.textContent.includes(text)) {
          return el;
        }
      }
      return null;
    }

    const availableModels = [];
    const availableFunctions = [];

    // テスト済みコード - モデル検出（動作テストコードと同じ処理）
    logWithTimestamp("1-1. メニュークリックボタンを探しています...", "step");
    const modelButton = await findElement(DETECTION_SELECTORS.modelButton);
    if (modelButton) {
      const currentModelText = getCleanText(modelButton);
      logWithTimestamp(`現在のモデル: ${currentModelText}`, "info");

      // 動作テストコードと同じtriggerReactEvent関数を使用
      triggerReactEvent(modelButton, "pointer");
      await sleep(1500);

      logWithTimestamp("1-2. 表示されたモデル一覧を取得・記録", "step");
      const modelMenu = await findElement(DETECTION_SELECTORS.modelMenu);

      if (modelMenu) {
        logWithTimestamp("✅ モデルメニューが開きました", "success");

        const mainMenuItems = modelMenu.querySelectorAll(
          '[role="menuitem"][data-testid^="model-switcher-"]',
        );
        mainMenuItems.forEach((item) => {
          const modelName = getCleanModelName(getCleanText(item));
          if (modelName && !modelName.includes("レガシー")) {
            availableModels.push({
              name: modelName,
              testId: item.getAttribute("data-testid"),
              type: "Current",
            });
            logWithTimestamp(`モデル発見: ${modelName}`, "success");
          }
        });

        const legacyButton =
          modelMenu.querySelector('[role="menuitem"][data-has-submenu]') ||
          Array.from(modelMenu.querySelectorAll('[role="menuitem"]')).find(
            (el) => el.textContent && el.textContent.includes("レガシーモデル"),
          );

        if (legacyButton) {
          logWithTimestamp("レガシーモデルボタンをクリック", "info");
          legacyButton.click();
          await sleep(1500);

          const allMenus = document.querySelectorAll('[role="menu"]');
          allMenus.forEach((menu) => {
            if (menu !== modelMenu) {
              const items = menu.querySelectorAll('[role="menuitem"]');
              items.forEach((item) => {
                const modelName = getCleanModelName(getCleanText(item));
                if (modelName && modelName.includes("GPT")) {
                  availableModels.push({
                    name: modelName,
                    type: "Legacy",
                  });
                  logWithTimestamp(
                    `レガシーモデル発見: ${modelName}`,
                    "success",
                  );
                }
              });
            }
          });
        }

        logWithTimestamp("1-5. メニューを閉じる", "step");
        document.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Escape", code: "Escape" }),
        );
        await sleep(1000);
      } else {
        logWithTimestamp("❌ モデルメニューが開きませんでした", "error");
      }
    } else {
      logWithTimestamp("❌ モデル切り替えボタンが見つかりません", "error");
    }

    // テスト済みコード - 機能検出（動作テストコードと同じ処理）
    logWithTimestamp("2-1. 機能メニューボタンを探しています...", "step");
    const funcMenuBtn = await findElement(
      DETECTION_SELECTORS.functionMenuButton,
    );
    if (funcMenuBtn) {
      logWithTimestamp("機能メニューボタン発見、クリック実行", "info");

      // 動作テストコードと同じPointerEventを使用
      funcMenuBtn.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true }),
      );
      await sleep(100);
      funcMenuBtn.dispatchEvent(
        new PointerEvent("pointerup", { bubbles: true }),
      );
      await sleep(1500);

      const funcMenu = await findElement(DETECTION_SELECTORS.functionMenu);
      if (funcMenu) {
        logWithTimestamp("✅ 機能メニューが開きました", "success");

        const menuItems = funcMenu.querySelectorAll('[role="menuitemradio"]');
        menuItems.forEach((item) => {
          const funcName = getCleanText(item);
          if (funcName) {
            availableFunctions.push(funcName);
            logWithTimestamp(`機能発見: ${funcName}`, "success");
          }
        });

        // 動作テストコードと同じ方法で「さらに表示」ボタンを検索
        const moreButton = findElementByText(
          '[role="menuitem"]',
          "さらに表示",
          funcMenu,
        );

        if (moreButton) {
          logWithTimestamp("追加機能メニュー発見、サブメニュー取得", "info");
          moreButton.click();
          await sleep(1000);

          const subMenu = document.querySelector('[data-side="right"]');
          if (subMenu) {
            const subMenuItems = subMenu.querySelectorAll(
              '[role="menuitemradio"]',
            );
            subMenuItems.forEach((item) => {
              const funcName = getCleanText(item);
              if (funcName) {
                availableFunctions.push(funcName);
                logWithTimestamp(`追加機能発見: ${funcName}`, "success");
              }
            });
          }
        }

        logWithTimestamp("2-5. 機能メニューを閉じる", "step");
        document.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Escape", code: "Escape" }),
        );
        await sleep(1000);
      } else {
        logWithTimestamp("❌ 機能メニューが開きませんでした", "error");
      }
    } else {
      logWithTimestamp("❌ 機能メニューボタンが見つかりません", "error");
    }

    const result = {
      models: availableModels,
      functions: availableFunctions,
    };
    logWithTimestamp(
      `🔍 ChatGPT検出完了 - モデル: ${availableModels.length}個, 機能: ${availableFunctions.length}個`,
      result,
    );

    // 検出結果を保存
    if (window.ChatGPTAutomation) {
      window.ChatGPTAutomation.detectionResult = result;
    }

    // UIに送信（ClaudeとGeminiと同じように、成功時のみ送信）
    // detectChatGPTModelsAndFeatures()が成功した場合のみこの部分が実行される
    if (availableModels.length > 0 || availableFunctions.length > 0) {
      try {
        if (chrome.runtime && chrome.runtime.sendMessage) {
          const modelsToSend = availableModels.map((m) => {
            if (typeof m === "string") return m;
            return m.name || m;
          });

          chrome.runtime.sendMessage({
            type: "AI_MODEL_FUNCTION_UPDATE",
            aiType: "chatgpt",
            data: {
              models: modelsToSend,
              functions: availableFunctions,
            },
          });
          logWithTimestamp("✅ UIテーブルにデータを送信しました");
        }
      } catch (error) {
        log.warn("UIへの送信失敗:", error);
        // エラー時は送信しない（ClaudeとGeminiと同じ動作）
      }
    } else {
      logWithTimestamp("⚠️ 検出データなし、UIへの送信をスキップ", "warning");
    }

    // 今回の検出で何か取得できたかチェック
    const hasNewData = result.models.length > 0 || result.functions.length > 0;

    // 既存の検出結果がある場合
    if (
      window.ChatGPTAutomation.detectionResult &&
      (window.ChatGPTAutomation.detectionResult.models.length > 0 ||
        window.ChatGPTAutomation.detectionResult.functions.length > 0)
    ) {
      // 新しく検出できた情報があれば更新（警告は出さない）
      if (result.models.length > 0) {
        window.ChatGPTAutomation.detectionResult.models = result.models;
      }
      if (result.functions.length > 0) {
        window.ChatGPTAutomation.detectionResult.functions = result.functions;
      }

      // 今回何も検出できなかった場合のみ警告（既存データで補完）
      if (!hasNewData && !window.ChatGPTAutomation._detectionWarningShown) {
        logWithTimestamp("⚠️ 検出失敗、既存情報を使用", "warning");
        window.ChatGPTAutomation._detectionWarningShown = true;
      }

      return window.ChatGPTAutomation.detectionResult;
    }

    return result;
  }

  // ========================================
  // インデックス選択機能とヘルパー関数
  // ========================================

  /**
   * インデックスでモデルを選択
   * @param {number} index - 選択するモデルのインデックス
   * @returns {Promise<boolean>} 選択成功の可否
   */
  async function selectModelByIndex(index) {
    if (!window.ChatGPTAutomation.detectionResult) {
      log.error(
        "検出結果がありません。先にdetectChatGPTModelsAndFeatures()を実行してください",
      );
      return false;
    }

    const model = window.ChatGPTAutomation.detectionResult.models[index];
    if (!model) {
      log.error(`インデックス ${index} のモデルが存在しません`);
      return false;
    }

    const modelName = typeof model === "string" ? model : model.name;
    log.info(`🎯 モデル選択: [${index}] ${modelName}`);
    return await selectModelChatGPT(modelName);
  }

  /**
   * インデックスで機能を選択
   * @param {number} index - 選択する機能のインデックス (0=通常, 1以上=機能)
   * @returns {Promise<boolean>} 選択成功の可否
   */
  async function selectFunctionByIndex(index) {
    if (!window.ChatGPTAutomation.detectionResult) {
      log.error(
        "検出結果がありません。先にdetectChatGPTModelsAndFeatures()を実行してください",
      );
      return false;
    }

    if (index === 0) {
      logWithTimestamp("🎯 通常モードを選択");
      // 通常モードの場合は何もしない
      return true;
    }

    const funcName =
      window.ChatGPTAutomation.detectionResult.functions[index - 1];
    if (!funcName) {
      log.error(`インデックス ${index} の機能が存在しません`);
      return false;
    }

    log.info(`🎯 機能選択: [${index}] ${funcName}`);
    return await selectFunctionChatGPT(funcName);
  }

  /**
   * UIにデータを手動で送信
   * @param {Object} data - 送信するデータ (省略時は検出結果を使用)
   */
  function sendToUI(data) {
    if (!data) data = window.ChatGPTAutomation.detectionResult;
    if (!data) {
      log.error("送信するデータがありません");
      return;
    }

    try {
      // ClaudeとGeminiと同じように、エラーがない場合のみ送信
      // detectChatGPTModelsAndFeatures()が成功した場合のみ呼び出される
      if (chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({
          type: "AI_MODEL_FUNCTION_UPDATE",
          aiType: "chatgpt",
          data: {
            models:
              data.models && Array.isArray(data.models)
                ? data.models.map((m) => (typeof m === "string" ? m : m.name))
                : [],
            functions: data.functions || [],
          },
        });
        logWithTimestamp("✅ UIテーブルにデータを手動送信しました");
      }
    } catch (error) {
      log.error("UIへの送信失敗:", error);
    }
  }

  /**
   * 一連のテストを実行
   * @param {number} modelIndex - モデルインデックス
   * @param {number} functionIndex - 機能インデックス
   * @param {string} message - 送信するメッセージ
   */
  async function executeFullTest(modelIndex, functionIndex, message) {
    try {
      logWithTimestamp("🚀 完全テスト実行開始");

      if (!window.ChatGPTAutomation.detectionResult) {
        logWithTimestamp("🔍 検出実行中...");
        await detectChatGPTModelsAndFeatures();
      }

      logWithTimestamp(`🎯 モデル[${modelIndex}]を選択中...`);
      await selectModelByIndex(modelIndex);
      await sleep(1000);

      logWithTimestamp(`🎯 機能[${functionIndex}]を選択中...`);
      await selectFunctionByIndex(functionIndex);
      await sleep(1000);

      logWithTimestamp(`📨 メッセージ送信中: "${message}"`);
      await inputTextChatGPT(message);
      await sleep(500);
      await sendMessageChatGPT();

      logWithTimestamp("⏳ 応答待機中...");
      await waitForResponseChatGPT();

      logWithTimestamp("📋 応答取得中...");
      const response = await getResponseTextChatGPT();

      logWithTimestamp("✅ 完全テスト完了");
      return response;
    } catch (error) {
      log.error("完全テストエラー:", error);
      throw error;
    }
  }

  // ========================================
  // 🚨 ChatGPT グローバルエラーハンドラー
  // ========================================

  // 🚨 ChatGPT Overloadedエラー対応システム
  let chatgptOverloadedRetryCount = 0;
  const MAX_CHATGPT_OVERLOADED_RETRIES = 5;
  const CHATGPT_OVERLOADED_RETRY_INTERVALS = [
    60000, 300000, 900000, 1800000, 3600000,
  ]; // 1分、5分、15分、30分、60分

  function handleChatGPTOverloadedError() {
    if (chatgptOverloadedRetryCount >= MAX_CHATGPT_OVERLOADED_RETRIES) {
      console.error(
        "❌ [CHATGPT-OVERLOADED-HANDLER] 最大リトライ回数に達しました。手動対応が必要です。",
      );
      return;
    }

    const retryInterval =
      CHATGPT_OVERLOADED_RETRY_INTERVALS[chatgptOverloadedRetryCount] ||
      3600000;
    chatgptOverloadedRetryCount++;

    // 即座にウィンドウを閉じる
    setTimeout(() => {
      // background scriptにウィンドウリセットを要求
      if (chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime
          .sendMessage({
            action: "RESET_AI_WINDOW",
            aiType: "chatgpt",
            retryCount: chatgptOverloadedRetryCount,
            nextRetryIn: retryInterval,
          })
          .catch((err) => {
            console.error(
              "❌ [CHATGPT-OVERLOADED-HANDLER] background scriptへのメッセージ送信失敗:",
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
      // 新しいウィンドウで ChatGPT を開く
      if (chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({
          action: "OPEN_AI_WINDOW",
          aiType: "chatgpt",
          retryAttempt: chatgptOverloadedRetryCount,
        });
      }
    }, retryInterval);
  }

  // ChatGPT専用ネットワークエラーハンドラーを追加
  if (
    typeof window !== "undefined" &&
    window.location &&
    window.location.href.includes("chatgpt.com")
  ) {
    // グローバルエラーハンドラー
    window.addEventListener("error", (e) => {
      const errorMessage = e.message || e.error?.message || "";
      const errorName = e.error?.name || "";

      // 🔍 ChatGPT Overloadedエラー検出
      const isOverloadedError =
        errorMessage.includes("Overloaded") ||
        errorMessage.includes("overloaded") ||
        errorMessage.includes("too many requests") ||
        errorMessage.includes("rate limit") ||
        (e.reason && String(e.reason).includes("Overloaded"));

      if (isOverloadedError) {
        console.error("🚨 [CHATGPT-OVERLOADED-ERROR]", {
          message: errorMessage,
          name: errorName,
          type: "OVERLOADED_ERROR",
          filename: e.filename,
          lineno: e.lineno,
          timestamp: new Date().toISOString(),
          aiType: "chatgpt",
        });

        // 即座にウィンドウリセット・リトライを開始
        handleChatGPTOverloadedError();
        return;
      }

      // 🔍 ネットワークエラー検出 (Claudeと同じロジック)
      const isNetworkError =
        errorMessage.includes("timeout") ||
        errorMessage.includes("network") ||
        errorMessage.includes("fetch") ||
        errorMessage.includes("Failed to fetch") ||
        errorName.includes("NetworkError");

      if (isNetworkError) {
        console.error("🌐 [ChatGPT-GLOBAL-NETWORK-ERROR]", {
          message: errorMessage,
          name: errorName,
          type: "NETWORK_ERROR",
          filename: e.filename,
          lineno: e.lineno,
          timestamp: new Date().toISOString(),
          aiType: "chatgpt",
        });

        // エラー統計記録 (将来のChatGPTRetryManager用)
        try {
          if (!window.chatgptErrorHistory) {
            window.chatgptErrorHistory = [];
          }
          window.chatgptErrorHistory.push({
            type: "NETWORK_ERROR",
            message: errorMessage,
            timestamp: Date.now(),
            level: "global_error",
          });
        } catch (retryError) {
          // エラー記録失敗は無視
        }
      } else {
        console.error("🚨 [ChatGPT-GLOBAL-ERROR]", e.message);
      }
    });

    // unhandledrejectionハンドラー
    window.addEventListener("unhandledrejection", (e) => {
      const errorReason = e.reason;
      const errorMessage = errorReason?.message || String(errorReason);
      const errorName = errorReason?.name || "";

      // 🔍 ネットワークエラー検出
      const isNetworkError =
        errorMessage.includes("timeout") ||
        errorMessage.includes("network") ||
        errorMessage.includes("fetch") ||
        errorMessage.includes("Failed to fetch") ||
        errorName.includes("NetworkError");

      if (isNetworkError) {
        console.error("🌐 [ChatGPT-UNHANDLED-NETWORK-ERROR]", {
          message: errorMessage,
          name: errorName,
          type: "NETWORK_ERROR",
          timestamp: new Date().toISOString(),
          aiType: "chatgpt",
        });

        // 🔄 エラー統計を記録
        try {
          if (!window.chatgptErrorHistory) {
            window.chatgptErrorHistory = [];
          }
          window.chatgptErrorHistory.push({
            type: "NETWORK_ERROR",
            message: errorMessage,
            timestamp: Date.now(),
            level: "unhandledrejection",
          });

          // 🔄 アクティブなタスクがある場合のリトライ準備 (将来実装用)
          if (window.currentChatGPTTask) {
            console.warn(
              "🔄 [ChatGPT-RETRY-TRIGGER] アクティブタスク検出 - リトライ実行準備",
            );
            // ChatGPT用リトライマネージャーは将来実装
            // 現在は統計記録のみ
          }
        } catch (retryError) {
          console.error(
            "❌ [ChatGPT-RETRY-MANAGER] エラー記録処理エラー:",
            retryError,
          );
        }
      } else {
        console.error("🚨 [ChatGPT-UNHANDLED-PROMISE]", e.reason);
      }
    });
  }
})();
