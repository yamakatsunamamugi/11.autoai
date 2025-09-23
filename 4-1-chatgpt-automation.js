// ログレベル定義
const LOG_LEVEL = { ERROR: 1, WARN: 2, INFO: 3, DEBUG: 4 };

// Chrome Storageからログレベルを取得（非同期）
let CURRENT_LOG_LEVEL = LOG_LEVEL.INFO; // デフォルト値

// Chrome拡張環境でのみStorageから設定を読み込む
if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
  chrome.storage.local.get("logLevel", (result) => {
    if (result.logLevel) {
      CURRENT_LOG_LEVEL = parseInt(result.logLevel);
      console.log(
        `📋 ログレベル設定: ${["", "ERROR", "WARN", "INFO", "DEBUG"][CURRENT_LOG_LEVEL]} (${CURRENT_LOG_LEVEL})`,
      );
    } else {
      console.log("📋 ログレベル: デフォルト (INFO)");
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

/**
 * @fileoverview ChatGPT Automation V2 - 統合版
 *
 * 【ステップ構成】
 * Step 4-1-0: 初期化（UI_SELECTORS読み込み）
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

  console.log(
    `ChatGPT Automation V2 - 初期化時刻: ${new Date().toLocaleString("ja-JP")}`,
  );
  console.log(`[DEBUG] ChatGPT Script Loaded - Marker Set`);

  // 🔧 [FIXED] ChatGPTメッセージング問題修正完了のお知らせ
  console.log("🔧 [FIXED] ChatGPTメッセージング問題修正済み:", {
    fixes: [
      "RETRY_WITH_NEW_WINDOWメッセージのエラーハンドリング改善",
      "background.js未実装ハンドラーの警告メッセージ追加",
      "詳細なデバッグログでエラー追跡を改善",
    ],
    timestamp: new Date().toISOString(),
    note: "リトライ機能のエラーログがより明確に",
  });

  // 🔍 Content Script実行コンテキストの詳細確認（Claude式）
  const currentURL = window.location.href;
  const isValidChatGPTURL =
    currentURL.includes("chatgpt.com") ||
    currentURL.includes("chat.openai.com");
  const isExtensionPage = currentURL.startsWith("chrome-extension://");

  // 🔍 Content Script実行環境の詳細ログ
  console.warn(`🔍 [ChatGPT-Content Script] 実行コンテキスト詳細分析:`, {
    executionContext: {
      url: currentURL,
      title: document.title,
      domain: window.location.hostname,
      protocol: window.location.protocol,
      pathname: window.location.pathname,
      search: window.location.search,
      hash: window.location.hash,
    },
    validationResults: {
      isValidChatGPTURL: isValidChatGPTURL,
      isExtensionPage: isExtensionPage,
      isChromeNewTab: currentURL === "chrome://newtab/",
      isAboutBlank: currentURL === "about:blank",
    },
    documentState: {
      readyState: document.readyState,
      hasDocumentElement: !!document.documentElement,
      hasBody: !!document.body,
      bodyChildrenCount: document.body ? document.body.children.length : 0,
    },
    chromeExtensionInfo: {
      hasChromeRuntime: typeof chrome !== "undefined" && !!chrome.runtime,
      extensionId:
        typeof chrome !== "undefined" && chrome.runtime
          ? chrome.runtime.id
          : null,
      runtimeUrl:
        typeof chrome !== "undefined" && chrome.runtime
          ? chrome.runtime.getURL("")
          : null,
    },
    timestamp: new Date().toISOString(),
    userAgent: navigator.userAgent,
  });

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
  // Step 4-1-0: UIセレクタ（step1-setup.js統一管理版）
  // step1-setup.jsのwindow.UI_SELECTORSを参照
  // ========================================

  const loadSelectors = async () => {
    log.debug("loadSelectors starts - waiting for step1 UI_SELECTORS");

    // step1-setup.jsからのUI_SELECTORS読み込み待機
    let retryCount = 0;
    const maxRetries = 50;

    while (!window.UI_SELECTORS && retryCount < maxRetries) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      retryCount++;
    }

    if (!window.UI_SELECTORS) {
      throw new Error("UI_SELECTORS not available from step1-setup.js");
    }

    log(
      "【Step 4-1-0-1】✅ UI Selectors loaded from step1-setup.js",
      "success",
    );
    return window.UI_SELECTORS;
  };

  // セレクタを読み込み
  await loadSelectors();

  // ChatGPT用セレクタを取得
  const SELECTORS = {
    modelButton: window.UI_SELECTORS.ChatGPT?.MODEL_BUTTON || [],
    modelMenu: window.UI_SELECTORS.ChatGPT?.MENU?.CONTAINER || [],
    menuButton: window.UI_SELECTORS.ChatGPT?.FUNCTION_MENU_BUTTON || [],
    mainMenu: window.UI_SELECTORS.ChatGPT?.MENU?.CONTAINER || [],
    subMenu: window.UI_SELECTORS.ChatGPT?.MENU?.SUBMENU_TRIGGERS || [],
    textInput: window.UI_SELECTORS.ChatGPT?.INPUT || [],
    sendButton: window.UI_SELECTORS.ChatGPT?.SEND_BUTTON || [],
    stopButton: window.UI_SELECTORS.ChatGPT?.STOP_BUTTON || [],
    canvasText: window.UI_SELECTORS.ChatGPT?.CANVAS_TEXT || [],
    normalText: window.UI_SELECTORS.ChatGPT?.ASSISTANT_MESSAGE || [],
    menuItem: window.UI_SELECTORS.ChatGPT?.MENU_ITEM || [],
    response: window.UI_SELECTORS.ChatGPT?.STANDARD_MARKDOWN || [],
  };

  // ========================================
  // ユーティリティ関数（テストコードより）
  // ========================================

  // 待機関数
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  // 通常モードの待機処理
  async function standardWaitForResponse() {
    // 停止ボタンが表示されるまで待機
    let stopBtn = null;
    for (let i = 0; i < 30; i++) {
      stopBtn = await findElement(SELECTORS.stopButton, 1);
      if (stopBtn) {
        log("【Step 4-1-6-1】停止ボタンが表示されました", "success");
        break;
      }
      await sleep(AI_WAIT_CONFIG.SHORT_WAIT);
    }

    // 停止ボタンが消えるまで待機（テストコード準拠：10秒間連続非表示で完了、最大5分）
    if (stopBtn) {
      log(
        "【Step 4-1-6-2】停止ボタンが10秒間消えるまで待機（最大5分）",
        "info",
      );
      let disappearWaitCount = 0;
      let confirmCount = 0;

      while (disappearWaitCount < 300) {
        stopBtn = await findElement(SELECTORS.stopButton, "停止ボタン");

        if (!stopBtn) {
          confirmCount++;
          if (confirmCount >= 10) {
            log(
              "【Step 4-1-6-2】✅ 応答完了（停止ボタンが10秒間非表示）",
              "success",
            );
            break;
          }
        } else {
          confirmCount = 0;
        }

        await sleep(1000);
        disappearWaitCount++;

        if (disappearWaitCount % 60 === 0) {
          log(
            `応答生成中... ${Math.floor(disappearWaitCount / 60)}分経過`,
            "info",
          );
        }
      }
    }
  }

  // ログ出力
  function log(message, type = "info") {
    const timestamp = new Date().toLocaleTimeString("ja-JP", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    const prefix = `[${timestamp}]`;

    switch (type) {
      case "error":
        log.error(`${prefix} ❌ ${message}`);
        break;
      case "success":
        log.debug(`${prefix} ✅ ${message}`);
        break;
      case "warning":
        log.warn(`${prefix} ⚠️ ${message}`);
        break;
      case "step":
        log.debug(`${prefix} 📍 ${message}`);
        break;
      default:
        log.debug(`${prefix} ℹ️ ${message}`);
    }
  }

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
        log("【ChatGPT-除外】完全一致でプロンプトを除外しました", "success");
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
        log(
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
      const log = this._addLog("INFO", message, data);
      log.debug(`🔄 [ChatGPT-Step] ${message}`, data || "");
      return log;
    },

    logError: function (message, error) {
      const log = this._addLog("ERROR", message, null, error);
      log.error(`❌ [ChatGPT-Error] ${message}`, error);
      return log;
    },

    logSuccess: function (message, data) {
      const log = this._addLog("SUCCESS", message, data);
      log.debug(`✅ [ChatGPT-Success] ${message}`, data || "");
      return log;
    },

    logTaskStart: function (taskInfo) {
      const log = this._addLog("TASK_START", "タスク開始", taskInfo);
      log.debug(`🚀 [ChatGPT-Task] タスク開始:`, taskInfo);
      return log;
    },

    logTaskComplete: function (taskInfo, result) {
      const log = this._addLog("TASK_COMPLETE", "タスク完了", {
        taskInfo,
        result,
      });
      log.debug(`🏁 [ChatGPT-Task] タスク完了:`, { taskInfo, result });
      return log;
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
      const log = this._addLog("CRITICAL_ERROR", "緊急エラー", null, error);
      log.error(`🚨 [ChatGPT-Critical] 緊急エラー:`, error);
      this._saveToStorage(log);
      return log;
    },

    saveIntermediate: function (data) {
      const log = this._addLog("INTERMEDIATE", "中間データ", data);
      log.debug(`📊 [ChatGPT-Intermediate] 中間データ:`, data);
      return log;
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
      log(`📝 [ログ] ${step}: ${message}`);
    },

    // エラーログを記録（即座にファイル保存）
    async logError(step, error, context = {}) {
      this.logFileManager.logError(step, error, context);
      log(`❌ [エラーログ] ${step}: ${error.message}`, "error");
      // エラーは即座に保存
      await this.logFileManager.saveErrorImmediately(error, {
        step,
        ...context,
      });
    },

    // 成功ログを記録
    logSuccess(step, message, result = {}) {
      this.logFileManager.logSuccess(step, message, result);
      log(`✅ [成功ログ] ${step}: ${message}`, "success");
    },

    // タスク開始を記録
    startTask(taskData) {
      this.logFileManager.logTaskStart(taskData);
      log(`🚀 [タスク開始]`, "info");
    },

    // タスク完了を記録
    completeTask(result) {
      this.logFileManager.logTaskComplete(result);
      log(`🏁 [タスク完了]`, "info");
    },

    // ログをファイルに保存（最終保存）
    async saveToFile() {
      try {
        const filePath = await this.logFileManager.saveToFile();
        log(
          `✅ [ChatGPTLogManager] 最終ログを保存しました: ${filePath}`,
          "success",
        );
        return filePath;
      } catch (error) {
        log(`[ChatGPTLogManager] ログ保存エラー: ${error.message}`, "error");
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

  // 複数セレクタで要素検索（テスト済みコードより改善版）
  // 要素検索（UI_SELECTORS対応 + テスト済みセレクタ強化版）
  async function findElement(selectors, description = "", maxRetries = 5) {
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

          if (element && isVisible(element)) {
            if (description && retry > 0) {
              log(
                `${description}を発見: ${selector} (${retry + 1}回目の試行)`,
                "success",
              );
            }
            return element;
          }
        } catch (e) {
          // セレクタエラーを無視
        }
      }

      if (retry < maxRetries - 1) {
        if (description && retry === 0) {
          log(
            `${description}が見つかりません。待機中... (${retry + 1}/${maxRetries})`,
            "warning",
          );
        }
        await sleep(AI_WAIT_CONFIG.MEDIUM_WAIT);
      }
    }

    if (description) {
      log(`${description}の検索に失敗しました (${maxRetries}回試行)`, "error");
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
    log("\n【Step 4-1-0】ページ準備確認", "step");
    const maxAttempts = 30; // 最大30秒待機
    let attempts = 0;

    while (attempts < maxAttempts) {
      attempts++;
      log(`[Step 4-1-0] 準備確認 (${attempts}/${maxAttempts})`, "info");

      // テキスト入力欄の存在をチェック
      const inputElement = await findElement(
        SELECTORS.textInput,
        "テキスト入力欄",
        1,
      );

      if (inputElement && isElementInteractable(inputElement)) {
        log("✅ [Step 4-1-0] ページ準備完了", "success");
        return true;
      }

      await sleep(1000);
    }

    log("❌ [Step 4-1-0] ページ準備タイムアウト", "error");
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
    log(`[ステップ0-1] ${description}を取得中...`, "info");
    const startTime = Date.now();
    let attempts = 0;

    while (Date.now() - startTime < timeout) {
      attempts++;
      const element = await findElement(selectors, description, 1);

      if (element && isElementInteractable(element)) {
        log(
          `✅ [ステップ0-1] ${description}取得成功 (試行${attempts}回)`,
          "success",
        );
        return element;
      }

      if (attempts % 5 === 0) {
        log(
          `[ステップ0-1] ${description}を探索中... (${Math.floor((Date.now() - startTime) / 1000)}秒経過)`,
          "info",
        );
      }

      await sleep(500);
    }

    log(`❌ [ステップ0-1] ${description}取得タイムアウト`, "error");
    return null;
  }

  // ========================================
  // Deep Research/エージェントモード統合処理
  // ========================================
  async function handleSpecialModeWaiting(featureName) {
    try {
      log(`【${featureName}モード特別処理】開始`, "step");
      log("【Step 4-1-6-1】最大回答待機時間: 40分", "info");

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

      log(`${featureName}モード特別処理完了`, "success");
      return true;
    } catch (error) {
      log(`特別処理エラー: ${error.message}`, "error");
      return false;
    }
  }

  // 6-1: 停止ボタン出現待機
  async function waitForStopButton() {
    log("【Step 4-1-6-1】停止ボタン出現待機", "step");
    for (let i = 0; i < 60; i++) {
      const stopBtn = await findElement(SELECTORS.stopButton, 1);
      if (stopBtn) {
        log(`停止ボタンが表示されました (${i + 1}秒後)`, "success");
        return stopBtn;
      }
      if (i % 10 === 0 && i > 0) {
        log(`停止ボタン待機中... ${i}秒経過`, "info");
      }
      await sleep(AI_WAIT_CONFIG.SHORT_WAIT);
    }
    log("【Step 4-1-6-1】停止ボタンが表示されませんでした", "warning");
    return null;
  }

  // 6-2: 2分間初期待機
  async function initialWaitCheck() {
    log("【Step 4-1-6-2】2分間初期待機チェック", "step");
    for (let i = 0; i < 120; i++) {
      const stopBtn = await findElement(SELECTORS.stopButton, 1);
      if (!stopBtn) {
        const minutes = Math.floor(i / 60);
        const seconds = i % 60;
        log(`停止ボタンが消えました (${minutes}分${seconds}秒で完了)`, "info");
        return true;
      }
      if (i % 30 === 0 && i > 0) {
        log(`待機中... (${Math.floor(i / 60)}分${i % 60}秒経過)`, "info");
      }
      await sleep(AI_WAIT_CONFIG.SHORT_WAIT);
    }
    return false;
  }

  // 6-3: 再送信処理
  async function retryWithPrompt() {
    log(
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
      log("【Step 4-1-6-2】再送信完了", "success");
      await sleep(AI_WAIT_CONFIG.LONG_WAIT);
    }
  }

  // 6-4: 最終待機処理
  async function finalWaitForCompletion() {
    log("【Step 4-1-6-4】最終待機（最大40分）", "step");
    const maxWaitTime = AI_WAIT_CONFIG.DEEP_RESEARCH_WAIT / 1000;
    let consecutiveAbsent = 0;

    for (let i = 0; i < maxWaitTime; i++) {
      const stopBtn = await findElement(SELECTORS.stopButton, 1);

      if (!stopBtn) {
        consecutiveAbsent++;
        if (consecutiveAbsent >= 10) {
          log(
            "【Step 4-1-6-3】停止ボタンが10秒間連続で消滅。完了！",
            "success",
          );
          break;
        }
      } else {
        consecutiveAbsent = 0;
      }

      if (i % 60 === 0 && i > 0) {
        log(`待機中... (${Math.floor(i / 60)}分経過 / 最大40分)`, "info");
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
  async function executeTask(taskData) {
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
      log("\n【Step 4-1-1】ページ初期化チェック", "step");

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
        log("初回タスク実行を検知。追加の初期化待機を行います", "info");
        await sleep(AI_WAIT_CONFIG.LONG_WAIT); // 初回は3秒待機
        window.ChatGPTAutomationV2._initialized = true;
      }

      // 全ての重要な要素が利用可能になるまで待機
      while (!allElementsReady && retryCount < maxRetries) {
        allElementsReady = true;

        for (const [name, selectors] of Object.entries(criticalElements)) {
          const element = await findElement(selectors, name, 1);
          if (!element) {
            log(
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
      log("1-2. DOM安定化待機中...", "info");
      await sleep(AI_WAIT_CONFIG.MEDIUM_WAIT - 500);

      // 1-3. 既存の開いているメニューを全て閉じる
      const openMenus = document.querySelectorAll(
        '[role="menu"][data-state="open"]',
      );
      if (openMenus.length > 0) {
        log(`開いているメニュー(${openMenus.length}個)を閉じます`, "info");
        document.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Escape", code: "Escape" }),
        );
        await sleep(AI_WAIT_CONFIG.TINY_WAIT);
      }

      log("ページ初期化チェック完了", "success");

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
        log.debug(`📍 セル位置情報を追加: ${cellPosition}`);
      }

      const modelName = taskData.model || "";
      const featureName = taskData.function || null;

      log(`選択されたモデル: ${modelName}`, "info");
      log(`選択された機能: ${featureName || "設定なし"}`, "info");
      log(`プロンプト: ${prompt.substring(0, 100)}...`, "info");

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
                    el.textContent && el.textContent.includes("レガシーモデル"),
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
              new KeyboardEvent("keydown", { key: "Escape", code: "Escape" }),
            );
            await sleep(AI_WAIT_CONFIG.SHORT_WAIT);
          }
        }
      }

      // ========================================
      // ステップ2: テキスト入力（堅牢性強化版）
      // ========================================
      log("\n【Step 4-1-2】テキスト入力", "step");

      // getElementWithWaitを使用してテキスト入力欄を検索
      let input = await getElementWithWait(
        SELECTORS.textInput,
        "テキスト入力欄",
        10000,
      );

      if (!input) {
        // 最後の手段として、より広範囲の検索を試行
        log("最後の手段として広範囲検索を実行", "warning");
        const allEditableElements = document.querySelectorAll(
          '[contenteditable="true"], textarea, input[type="text"]',
        );
        for (const elem of allEditableElements) {
          if (isElementInteractable(elem)) {
            input = elem;
            log("代替入力欄を発見", "success");
            break;
          }
        }
      }

      if (!input) {
        throw new Error(
          `${maxInputAttempts}回試行してもテキスト入力欄が見つかりません`,
        );
      }

      log("テキスト入力欄を発見、テキストを入力中...", "success");

      // ChatGPT動作コードのテキスト入力処理（テスト済み）
      try {
        if (
          input.classList.contains("ProseMirror") ||
          input.classList.contains("ql-editor")
        ) {
          // ProseMirrorエディタ用の処理
          input.innerHTML = "";
          const p = document.createElement("p");
          p.textContent = prompt;
          input.appendChild(p);
          input.classList.remove("ql-blank");
          input.dispatchEvent(new Event("input", { bubbles: true }));
          input.dispatchEvent(new Event("change", { bubbles: true }));
          log("ProseMirrorエディタにテキスト入力完了", "success");
        } else if (input.tagName === "TEXTAREA" || input.tagName === "INPUT") {
          // 通常のテキストエリア/入力フィールド用
          input.value = prompt;
          input.dispatchEvent(new Event("input", { bubbles: true }));
          input.dispatchEvent(new Event("change", { bubbles: true }));
          log("通常の入力フィールドにテキスト入力完了", "success");
        } else {
          // contenteditable要素用
          input.textContent = prompt;
          input.dispatchEvent(new Event("input", { bubbles: true }));
          input.dispatchEvent(new Event("change", { bubbles: true }));
          log("contenteditable要素にテキスト入力完了", "success");
        }

        // 入力内容の検証
        await sleep(500);
        const inputContent = input.textContent || input.value || "";
        if (inputContent.includes(prompt.substring(0, 50))) {
          log(
            `入力内容検証成功: ${inputContent.length}文字入力済み`,
            "success",
          );
        } else {
          log("入力内容の検証に失敗しましたが、続行します", "warning");
        }
      } catch (error) {
        log(`テキスト入力エラー: ${error.message}`, "error");
        throw new Error(`テキスト入力に失敗しました: ${error.message}`);
      }

      await sleep(AI_WAIT_CONFIG.SHORT_WAIT);

      // ========================================
      // ステップ3: モデル選択（動的検索強化版）
      // ========================================
      if (modelName) {
        log("\n【Step 4-1-3】モデル選択", "step");

        // 3-0: 現在のモデルを確認
        const currentModelButton = await findElement(
          SELECTORS.modelButton,
          "モデルボタン",
        );
        if (currentModelButton) {
          const currentModelText = getCleanText(currentModelButton);
          log(`現在のモデル: ${currentModelText}`, "info");
        }

        // 3-1: モデルメニューを開いて利用可能なモデルを動的取得
        log(
          "【Step 4-1-3-1】モデルメニューを開いて利用可能なモデルを取得",
          "step",
        );
        const modelBtn = await findElement(
          SELECTORS.modelButton,
          "モデルボタン",
        );
        if (!modelBtn) {
          throw new Error("モデルボタンが見つかりません");
        }

        // ポインターイベントでメニューを開く（テスト済みコードより）
        await openModelMenu(modelBtn);

        const modelMenuEl = await findElement(
          SELECTORS.modelMenu,
          "モデルメニュー",
        );
        if (!modelMenuEl) {
          throw new Error("モデルメニューが開きません");
        }

        // 3-2: 利用可能なモデル一覧を動的に取得
        log("【Step 4-1-3-2】利用可能なモデル一覧を取得", "step");
        const availableModels = [];

        // メインメニューのモデル取得
        const mainMenuItems = modelMenuEl.querySelectorAll(
          '[role="menuitem"][data-testid^="model-switcher-"]',
        );
        mainMenuItems.forEach((item) => {
          const modelDisplayName = getCleanText(item);
          if (modelDisplayName && !modelDisplayName.includes("レガシー")) {
            availableModels.push({
              name: modelDisplayName,
              testId: item.getAttribute("data-testid"),
              element: item,
              type: "Current",
              location: "main",
            });
            log(`メインモデル発見: ${modelDisplayName}`, "info");
          }
        });

        // レガシーモデルチェック（テスト済みコードロジック）
        const legacyButton =
          modelMenuEl.querySelector('[role="menuitem"][data-has-submenu]') ||
          Array.from(modelMenuEl.querySelectorAll('[role="menuitem"]')).find(
            (el) => el.textContent && el.textContent.includes("レガシーモデル"),
          );

        if (legacyButton) {
          log("レガシーモデルボタンを発見、サブメニューをチェック", "info");
          legacyButton.click();
          await sleep(1500);

          const allMenus = document.querySelectorAll('[role="menu"]');
          allMenus.forEach((menu) => {
            if (menu !== modelMenuEl) {
              const items = menu.querySelectorAll('[role="menuitem"]');
              items.forEach((item) => {
                const modelDisplayName = getCleanText(item);
                if (modelDisplayName && modelDisplayName.includes("GPT")) {
                  availableModels.push({
                    name: modelDisplayName,
                    element: item,
                    type: "Legacy",
                    location: "submenu",
                  });
                  log(`レガシーモデル発見: ${modelDisplayName}`, "info");
                }
              });
            }
          });
        }

        log(
          `取得したモデル一覧 (${availableModels.length}個): ${availableModels.map((m) => m.name).join(", ")}`,
          "success",
        );

        // 3-3: 動的選択ロジック（番号指定または名前マッチング）
        log("【Step 4-1-3-3】モデル選択ロジックを実行", "step");
        // 統合ログ: モデル選択開始
        const cellInfo = taskData.cellReference || taskData.cell || "不明";
        let selectedModel = null;
        let resolvedModel = modelName;

        if (typeof modelName === "number") {
          // 番号指定: modelName: 1 → availableModels[0]
          if (modelName >= 1 && modelName <= availableModels.length) {
            selectedModel = availableModels[modelName - 1];
            resolvedModel = selectedModel.name;
            log(
              `番号指定による選択: ${modelName} → "${resolvedModel}"`,
              "success",
            );
          } else {
            log(
              `無効な番号指定: ${modelName} (1-${availableModels.length}の範囲で指定してください)`,
              "error",
            );
            selectedModel = availableModels[0] || null;
            resolvedModel = selectedModel?.name || modelName;
          }
        } else if (
          modelName &&
          modelName !== "" &&
          modelName !== "default" &&
          (typeof modelName !== "string" || modelName.toLowerCase() !== "auto")
        ) {
          // 名前マッチング: 部分一致で探す
          const found = availableModels.find(
            (m) =>
              m.name.toLowerCase().includes(modelName.toLowerCase()) ||
              modelName.toLowerCase().includes(m.name.toLowerCase()),
          );
          if (found) {
            selectedModel = found;
            resolvedModel = found.name;
            log(
              `名前マッチングによる選択: "${modelName}" → "${resolvedModel}"`,
              "success",
            );
          } else {
            log(`マッチするモデルが見つかりません: "${modelName}"`, "warning");
            log(
              `利用可能なモデル: ${availableModels.map((m, i) => `${i + 1}. ${m.name}`).join(", ")}`,
              "info",
            );
            selectedModel = null;
          }
        } else {
          log("デフォルトモデルを使用", "info");
          selectedModel = null;
        }

        // メニューを一旦閉じる
        document.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Escape", code: "Escape" }),
        );
        await sleep(500);

        if (selectedModel) {
          // 3-4: モデル選択を実行
          log("【Step 4-1-3-4】モデル選択のためメニューを再度開く", "step");
          const modelBtn2 = await findElement(
            SELECTORS.modelButton,
            "モデルボタン",
          );
          if (!modelBtn2) {
            throw new Error("モデルボタンが見つかりません");
          }

          await openModelMenu(modelBtn2);

          const modelMenuEl2 = await findElement(
            SELECTORS.modelMenu,
            "モデルメニュー",
          );
          if (!modelMenuEl2) {
            throw new Error("モデルメニューが開きません");
          }

          // レガシーモデルの場合はサブメニューを開く
          if (selectedModel.type === "Legacy") {
            const legacyBtn =
              modelMenuEl2.querySelector(
                '[role="menuitem"][data-has-submenu]',
              ) ||
              Array.from(
                modelMenuEl2.querySelectorAll('[role="menuitem"]'),
              ).find(
                (el) =>
                  el.textContent && el.textContent.includes("レガシーモデル"),
              );
            if (legacyBtn) {
              log("【Step 4-1-3-5】レガシーモデルメニューを開く", "step");
              legacyBtn.click();
              await sleep(AI_WAIT_CONFIG.MEDIUM_WAIT);
            }
          }

          // 3-6: 該当のモデルを選択
          log("【Step 4-1-3-6】該当のモデルを選択実行", "step");

          // 要素を再検索（DOM変更の可能性があるため）
          const allMenus = document.querySelectorAll('[role="menu"]');
          let targetElement = null;
          for (const menu of allMenus) {
            const items = menu.querySelectorAll('[role="menuitem"]');
            for (const item of items) {
              if (
                getCleanText(item) === selectedModel.name ||
                (selectedModel.testId &&
                  item.getAttribute("data-testid") === selectedModel.testId)
              ) {
                targetElement = item;
                break;
              }
            }
            if (targetElement) break;
          }

          if (targetElement) {
            targetElement.click();
            await sleep(AI_WAIT_CONFIG.MEDIUM_WAIT);
            log(`モデル選択完了: ${resolvedModel}`, "success");
            // 統合ログ: モデル選択完了
            // 選択後確認で表示されているモデルを取得
            let displayedModel = "";
            try {
              const modelButton = await findElement(
                SELECTORS.modelButton,
                "モデルボタン",
              );
              if (modelButton) {
                displayedModel = getCleanText(modelButton);
              }
            } catch (error) {
              displayedModel = "取得失敗";
            }

            // ========================================
            // ステップ3-7: モデル選択確認（テストコード準拠）
            // ========================================
            log("【Step 4-1-3-7】モデル選択確認", "step");
            await sleep(1000); // 表示更新を待機

            const currentModelButton = await findElement(
              SELECTORS.modelButton,
              "モデルボタン",
            );
            if (currentModelButton) {
              const currentModelText = getCleanText(currentModelButton);
              log(`現在表示されているモデル: "${currentModelText}"`, "info");

              // 部分一致で確認（"GPT-4o" が "4o" で選択された場合など）
              const isMatch =
                currentModelText
                  .toLowerCase()
                  .includes(resolvedModel.toLowerCase()) ||
                resolvedModel
                  .toLowerCase()
                  .includes(currentModelText.toLowerCase());

              if (isMatch) {
                log(
                  `✅ モデル選択確認成功: 期待通りのモデル「${currentModelText}」が選択されています`,
                  "success",
                );
              } else {
                log(
                  `⚠️ モデル選択確認: 期待されたモデル「${resolvedModel}」と異なるモデル「${currentModelText}」が表示されていますが、処理を継続します`,
                  "warning",
                );
              }
            } else {
              log(
                "⚠️ モデル選択確認: モデルボタンが見つからないため確認をスキップします",
                "warning",
              );
            }
          } else {
            throw new Error(
              `モデル要素が見つかりません: ${selectedModel.name}`,
            );
          }
        } else {
          log(
            "選択するモデルが特定できませんでした。現在のモデルを使用します。",
            "warning",
          );
        }
      } else {
        log("モデル選択をスキップ（モデル名が指定されていません）", "info");
      }

      // ========================================
      // ステップ4: 機能選択（動的検索強化版）
      // ========================================
      let resolvedFeature = featureName;
      if (
        featureName &&
        featureName !== "" &&
        featureName !== "none" &&
        featureName !== "通常"
      ) {
        log("\n【Step 4-1-4】機能選択", "step");

        // 機能名マッピング（スプレッドシート値 → ChatGPT UI表記）
        const featureMapping = {
          DeepReserch: "Deep Research",
          DeepResearch: "Deep Research",
        };

        let mappedFeatureName = featureMapping[featureName] || featureName;
        log(
          `機能名マッピング: "${featureName}" → "${mappedFeatureName}"`,
          "info",
        );

        // 4-0: 選択されている機能を解除
        log("【Step 4-1-4-0】既存の機能選択を解除", "step");
        const selectedButtons = document.querySelectorAll(
          'button[data-pill="true"]',
        );
        selectedButtons.forEach((btn) => {
          const closeBtn = btn.querySelector('button[aria-label*="削除"]');
          if (closeBtn) closeBtn.click();
        });
        await sleep(500);

        // 4-1: 機能メニューを開いて利用可能な機能を動的取得
        log("【Step 4-1-4-1】機能メニューを開いて利用可能な機能を取得", "step");
        const funcMenuBtn = await findElement(
          SELECTORS.menuButton,
          "機能メニューボタン",
        );
        if (!funcMenuBtn) {
          throw new Error("機能メニューボタンが見つかりません");
        }

        await openFunctionMenu(funcMenuBtn);

        const funcMenu = await findElement(
          SELECTORS.mainMenu,
          "メインメニュー",
        );
        if (!funcMenu) {
          throw new Error("機能メニューが開きません");
        }

        // 利用可能な機能一覧を動的に取得
        const availableFeatures = [];
        const menuItems = funcMenu.querySelectorAll('[role="menuitemradio"]');
        menuItems.forEach((item) => {
          const name = getCleanText(item);
          if (name) {
            availableFeatures.push({ name, element: item, location: "main" });
            log(`メイン機能発見: ${name}`, "info");
          }
        });

        // サブメニュー（「さらに表示」）の機能も取得
        const moreButton = findElementByText(
          '[role="menuitem"]',
          "さらに表示",
          funcMenu,
        );
        if (moreButton) {
          log("「さらに表示」ボタンを発見、サブメニューをチェック", "info");
          moreButton.click();
          await sleep(1000);

          const subMenu = document.querySelector('[data-side="right"]');
          if (subMenu) {
            const subMenuItems = subMenu.querySelectorAll(
              '[role="menuitemradio"]',
            );
            subMenuItems.forEach((item) => {
              const name = getCleanText(item);
              if (name) {
                availableFeatures.push({
                  name,
                  element: item,
                  location: "submenu",
                });
                log(`サブメニュー機能発見: ${name}`, "info");
              }
            });
          }
        }

        log(
          `取得した機能一覧 (${availableFeatures.length}個): ${availableFeatures.map((f) => f.name).join(", ")}`,
          "success",
        );

        // 動的選択ロジック（番号指定または名前マッチング）
        let selectedFeature = null;
        if (typeof featureName === "number") {
          // 番号指定: featureName: 1 → availableFeatures[0]
          if (featureName >= 1 && featureName <= availableFeatures.length) {
            selectedFeature = availableFeatures[featureName - 1];
            resolvedFeature = selectedFeature.name;
            log(
              `番号指定による機能選択: ${featureName} → "${resolvedFeature}"`,
              "success",
            );
          } else {
            log(
              `無効な番号指定: ${featureName} (1-${availableFeatures.length}の範囲で指定してください)`,
              "error",
            );
            selectedFeature = availableFeatures[0] || null;
            resolvedFeature = selectedFeature?.name || featureName;
          }
        } else {
          // 名前マッチング: 部分一致で探す（マッピング後の名前で）
          const found = availableFeatures.find(
            (f) =>
              f.name.toLowerCase().includes(mappedFeatureName.toLowerCase()) ||
              mappedFeatureName.toLowerCase().includes(f.name.toLowerCase()),
          );
          if (found) {
            selectedFeature = found;
            resolvedFeature = found.name;
            log(
              `名前マッチングによる機能選択: "${mappedFeatureName}" → "${resolvedFeature}"`,
              "success",
            );
          } else {
            log(
              `マッチする機能が見つかりません: "${mappedFeatureName}"`,
              "warning",
            );
            log(
              `利用可能な機能: ${availableFeatures.map((f, i) => `${i + 1}. ${f.name}`).join(", ")}`,
              "info",
            );
            selectedFeature = null;
          }
        }

        // メニューを一旦閉じる
        document.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Escape", code: "Escape" }),
        );
        await sleep(1000);

        if (selectedFeature) {
          // 4-2: 機能メニューを再度開いて選択実行
          log("【Step 4-1-4-2】機能選択のためメニューを再度開く", "step");
          const funcMenuBtn2 = await findElement(
            SELECTORS.menuButton,
            "機能メニューボタン",
          );
          if (!funcMenuBtn2) {
            throw new Error("機能メニューボタンが見つかりません");
          }

          await openFunctionMenu(funcMenuBtn2);

          const funcMenu2 = await findElement(
            SELECTORS.mainMenu,
            "メインメニュー",
          );
          if (!funcMenu2) {
            throw new Error("機能メニューが開きません");
          }

          // サブメニューが必要な場合は「さらに表示」をクリック
          if (selectedFeature.location === "submenu") {
            const moreBtn = findElementByText(
              '[role="menuitem"]',
              "さらに表示",
              funcMenu2,
            );
            if (moreBtn) {
              log("【Step 4-1-4-3】サブメニューを開く", "step");
              moreBtn.click();
              await sleep(1000);
            }
          }

          // 4-4: 機能を選択
          log("【Step 4-1-4-4】機能を選択実行", "step");

          // 要素を再検索（DOM変更の可能性があるため）
          const allMenus = document.querySelectorAll('[role="menu"]');
          let targetElement = null;
          for (const menu of allMenus) {
            const items = menu.querySelectorAll('[role="menuitemradio"]');
            for (const item of items) {
              if (getCleanText(item) === selectedFeature.name) {
                targetElement = item;
                break;
              }
            }
            if (targetElement) break;
          }

          if (targetElement) {
            targetElement.click();
            await sleep(AI_WAIT_CONFIG.MEDIUM_WAIT);
            log(`機能選択完了: ${resolvedFeature}`, "success");
            // 統合ログ: 機能選択完了
            // 選択後確認で表示されている機能を取得
            let displayedFunction = "";
            try {
              // FunctionInfoExtractorを使用して現在の機能を取得
              if (window.FunctionInfoExtractor) {
                displayedFunction =
                  window.FunctionInfoExtractor.extract("ChatGPT") || "未選択";
              } else {
                displayedFunction = "取得不可";
              }
            } catch (error) {
              displayedFunction = "取得失敗";
            }

            // ========================================
            // ステップ4-4: 機能選択確認（テストコード準拠）
            // ========================================
            log("【Step 4-1-4-4】機能選択確認", "step");
            await sleep(1500); // 機能の表示更新を待機

            // 選択された機能ボタンを確認
            const selectedFunctionButtons = document.querySelectorAll(
              'button[data-pill="true"]',
            );
            let confirmationSuccess = false;

            if (selectedFunctionButtons.length > 0) {
              selectedFunctionButtons.forEach((btn) => {
                const buttonText = getCleanText(btn);
                log(`選択された機能ボタン: "${buttonText}"`, "info");

                // 部分一致で確認
                const isMatch =
                  buttonText
                    .toLowerCase()
                    .includes(resolvedFeature.toLowerCase()) ||
                  resolvedFeature
                    .toLowerCase()
                    .includes(buttonText.toLowerCase());

                if (isMatch) {
                  log(
                    `✅ 機能選択確認成功: 期待通りの機能「${buttonText}」が選択されています`,
                    "success",
                  );
                  confirmationSuccess = true;
                }
              });

              if (!confirmationSuccess) {
                const buttonTexts = Array.from(selectedFunctionButtons)
                  .map((btn) => getCleanText(btn))
                  .join(", ");
                log(
                  `⚠️ 機能選択確認: 期待された機能「${resolvedFeature}」と異なる機能「${buttonTexts}」が選択されていますが、処理を継続します`,
                  "warning",
                );
              }
            } else {
              log(
                `⚠️ 機能選択確認: 機能ボタンが表示されていません。機能「${resolvedFeature}」の選択が失敗した可能性があります`,
                "warning",
              );
            }
          } else {
            throw new Error(
              `機能要素が見つかりません: ${selectedFeature.name}`,
            );
          }

          // 4-5: メニューを閉じる
          log("【Step 4-1-4-5】機能メニューを閉じる", "step");
          document.dispatchEvent(
            new KeyboardEvent("keydown", { key: "Escape", code: "Escape" }),
          );
          await sleep(AI_WAIT_CONFIG.SHORT_WAIT);
        } else {
          log(
            "選択する機能が特定できませんでした。機能なしで続行します。",
            "warning",
          );
        }
      } else {
        log("機能選択をスキップ", "info");
      }
      log("\n【Step 4-1-5】メッセージ送信（再試行対応）", "step");

      // 送信ボタンを5回まで再試行
      let sendSuccess = false;
      let sendAttempts = 0;
      const maxSendAttempts = 5;

      while (!sendSuccess && sendAttempts < maxSendAttempts) {
        sendAttempts++;
        log(
          `【Step 4-1-5-${sendAttempts}】送信試行 ${sendAttempts}/${maxSendAttempts}`,
          "step",
        );

        const sendBtn = await findElement(SELECTORS.sendButton, "送信ボタン");
        if (!sendBtn) {
          if (sendAttempts === maxSendAttempts) {
            throw new Error("送信ボタンが見つかりません");
          }
          log(`送信ボタンが見つかりません。2秒後に再試行...`, "warning");
          await sleep(AI_WAIT_CONFIG.MEDIUM_WAIT);
          continue;
        }

        // 送信ボタンをクリック
        sendBtn.click();
        log(`送信ボタンをクリックしました（試行${sendAttempts}）`, "success");
        await sleep(AI_WAIT_CONFIG.SHORT_WAIT);

        // 送信後に停止ボタンが表示されるか、または送信ボタンが消えるまで5秒待機
        let stopButtonAppeared = false;
        let sendButtonDisappeared = false;

        for (let i = 0; i < 5; i++) {
          // 停止ボタンの確認
          const stopBtn = await findElement(
            SELECTORS.stopButton,
            "停止ボタン",
            1,
          );
          if (stopBtn) {
            stopButtonAppeared = true;
            log("停止ボタンが表示されました - 送信成功", "success");
            break;
          }

          // 送信ボタンが消えたかどうかを確認
          const stillSendBtn = await findElement(
            SELECTORS.sendButton,
            "送信ボタン",
            1,
          );
          if (!stillSendBtn) {
            sendButtonDisappeared = true;
            log("送信ボタンが消えました - 送信成功", "success");
            break;
          }

          await sleep(AI_WAIT_CONFIG.SHORT_WAIT);
        }

        if (stopButtonAppeared || sendButtonDisappeared) {
          sendSuccess = true;
          break;
        } else {
          log(`送信反応が確認できません。再試行します...`, "warning");
          await sleep(AI_WAIT_CONFIG.MEDIUM_WAIT);
        }
      }

      if (!sendSuccess) {
        throw new Error(
          `${maxSendAttempts}回試行しても送信が成功しませんでした`,
        );
      }

      // 送信時刻を記録（SpreadsheetLogger用）
      log(
        `🔍 送信時刻記録開始 - AIHandler: ${!!window.AIHandler}, recordSendTimestamp: ${!!window.AIHandler?.recordSendTimestamp}, currentAITaskInfo: ${!!window.currentAITaskInfo}`,
        "info",
      );
      if (window.AIHandler && window.AIHandler.recordSendTimestamp) {
        try {
          log(
            `📝 送信時刻記録実行開始 - タスクID: ${window.currentAITaskInfo?.taskId}`,
            "info",
          );
          await window.AIHandler.recordSendTimestamp("ChatGPT");
          log(`✅ 送信時刻記録成功`, "success");
        } catch (error) {
          log(`❌ 送信時刻記録エラー: ${error.message}`, "error");
        }
      } else {
        log(
          `⚠️ AIHandler または recordSendTimestamp が利用できません`,
          "warning",
        );
      }

      await sleep(AI_WAIT_CONFIG.SHORT_WAIT);

      // ========================================
      // ステップ6: 応答待機（Deep Research/エージェントモード統合処理）
      // ========================================
      log("\n【Step 4-1-6】応答待機", "step");

      // Deep Research/エージェントモードの判定
      const finalFeatureName = resolvedFeature || featureName;
      const isSpecialMode =
        finalFeatureName &&
        (finalFeatureName === "Deep Research" ||
          finalFeatureName.includes("エージェント") ||
          finalFeatureName.includes("Research"));

      if (isSpecialMode) {
        log(`${finalFeatureName}モード検出 - 特別待機処理を実行`, "warning");
        await handleSpecialModeWaiting(finalFeatureName);
      } else {
        // 通常の待機処理
        log("通常モード - 標準待機処理を実行", "info");
        await standardWaitForResponse();
      }

      await sleep(AI_WAIT_CONFIG.MEDIUM_WAIT); // 追加の待機

      // 追加安全チェック: テキスト取得前にDOMの安定性を確認
      log("【Step 4-1-6-3】テキスト取得前の安定性チェック", "info");
      await sleep(3000); // DOM安定化のための追加待機

      // ========================================
      // ステップ7: テキスト取得と表示
      // ========================================
      log("\n【Step 4-1-7】テキスト取得と表示", "step");
      // 統合ログ: テキスト取得開始
      console.log(`📥 [セル ${cellInfo}] 回答取得開始...`);

      // テキスト取得（ui-selectors-data.jsonを使用）
      let responseText = "";

      // Canvas/Artifactを最優先でチェック（UI_SELECTORS使用）
      log("Canvas/Artifactコンテンツを検索中...", "info");

      const canvasElement = await findElement(
        SELECTORS.canvasText,
        "Canvas要素",
        1,
      );
      if (canvasElement) {
        const text = canvasElement.textContent?.trim() || "";
        if (text && text.length > 10) {
          responseText = text;
          log(`Canvas取得成功: ${text.length}文字`, "success");
        } else {
          log(
            `Canvasは見つかりましたが、テキストが短すぎます: ${text.length}文字`,
            "warning",
          );
        }
      }

      // Canvasが見つからない場合のデバッグ（簡潔化）
      if (!responseText) {
        log("Canvasコンテンツが見つかりません", "warning");
      }

      // Canvasが見つからない場合はアシスタントメッセージから取得
      if (!responseText) {
        log("Canvasが見つからないため、アシスタントメッセージから取得", "info");

        // UI_SELECTORSを使用した確実な方式
        const assistantMessages = document.querySelectorAll(
          SELECTORS.normalText[0],
        );
        if (assistantMessages.length > 0) {
          const lastMessage = assistantMessages[assistantMessages.length - 1];

          // 通常処理のテキスト取得（UI_SELECTORS使用）
          const normalElements = Array.from(
            document.querySelectorAll(SELECTORS.response[0]),
          );
          const normalElement = normalElements.filter((el) => {
            return (
              !el.closest(SELECTORS.canvasText[0]) &&
              !el.closest('[class*="artifact"]')
            );
          })[normalElements.length - 1];

          if (normalElement) {
            log(
              "🚫 【Step 4-1-7-3】プロンプト除外機能を適用してテキスト取得（通常応答）",
              "info",
            );
            responseText = normalElement.textContent?.trim() || "";
            if (responseText.length > 10) {
              log(
                "✅ 【Step 4-1-7-4】プロンプト除外完了 - 純粋なAI応答を取得",
                "success",
              );
              log(`テキスト取得成功: ${responseText.length}文字`, "success");
            } else {
              log(
                `テキストが短すぎます: ${responseText.length}文字`,
                "warning",
              );
              responseText = ""; // リセット
            }
          }

          // 上記で取得できない場合のフォールバック
          if (!responseText) {
            log(
              "🚫 【Step 4-1-7-1】プロンプト除外機能を適用してテキスト取得",
              "info",
            );
            const text = getCleanText(lastMessage);
            if (text && text.length > 10) {
              responseText = text;
              log(
                "✅ 【Step 4-1-7-2】プロンプト除外完了 - 純粋なAI応答を取得",
                "success",
              );
              log(`フォールバック取得成功: ${text.length}文字`, "success");
            }
          }
        } else {
          log("❌ アシスタントメッセージが見つかりません", "error");
        }
      }

      if (responseText) {
        // テストコード準拠のシンプルな最終確認
        log("【Step 4-1-7-1】テキスト取得完了", "success");

        // 現在表示されているモデルと機能を取得（選択後確認）
        let displayedModel = "";
        let displayedFunction = "";

        try {
          // ModelInfoExtractorを使用
          if (window.ModelInfoExtractor) {
            displayedModel = window.ModelInfoExtractor.extract("ChatGPT") || "";
            log(`📊 選択後確認 - 実際のモデル: "${displayedModel}"`, "info");
          } else {
            log("⚠️ ModelInfoExtractorが利用できません", "warn");
          }

          // FunctionInfoExtractorを使用
          if (window.FunctionInfoExtractor) {
            displayedFunction =
              window.FunctionInfoExtractor.extract("ChatGPT") || "";
            log(`📊 選択後確認 - 実際の機能: "${displayedFunction}"`, "info");
          } else {
            log("⚠️ FunctionInfoExtractorが利用できません", "warn");
          }
        } catch (error) {
          log(`⚠️ モデル/機能情報取得エラー: ${error.message}`, "warn");
        }

        log.debug("✅ ChatGPT V2 タスク実行完了");

        // 統合ログ: タスク完了サマリー
        const cellInfo = taskData.cellReference || taskData.cell || "不明";
        const promptPreview =
          text.substring(0, 10) + (text.length > 10 ? "..." : "");
        const responsePreview =
          responseText.substring(0, 50) +
          (responseText.length > 50 ? "..." : "");

        console.log(`🎯 [セル ${cellInfo}] タスク完了`, {
          モデル: {
            選択: modelName || "未選択",
            表示: displayedModel || "取得失敗",
          },
          機能: {
            選択: featureName || "未選択",
            表示: displayedFunction || "取得失敗",
          },
          送信: promptPreview,
          回答: responsePreview,
        });

        const result = {
          success: true,
          response: responseText,
          displayedModel: displayedModel,
          displayedFunction: displayedFunction,
        };

        // タスク完了をログに記録
        ChatGPTLogManager.completeTask(result);
        ChatGPTLogManager.logStep("Step7-Complete", "タスク正常完了", {
          responseLength: responseText.length,
          model: modelName,
          function: functionName,
          displayedModel: displayedModel,
          displayedFunction: displayedFunction,
        });

        // 実行完了フラグを設定（AITaskExecutorが確認）
        window.__v2_execution_complete = true;
        window.__v2_execution_result = result;

        return result;
      } else {
        throw new Error("応答テキストを取得できませんでした");
      }
    } catch (error) {
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
  log.debug("[DEBUG] グローバル公開セクションに到達");
  log.debug("[DEBUG] executeTask関数の存在:", typeof executeTask);
  log.debug("[DEBUG] runAutomation関数の存在:", typeof runAutomation);

  const automationAPI = {
    executeTask,
    runAutomation,
  };

  log.debug("[DEBUG] automationAPI作成成功");

  log.debug("[DEBUG] automationAPI作成完了、windowに設定開始");

  // v2名と標準名の両方をサポート（下位互換性保持）
  window.ChatGPTAutomationV2 = automationAPI;
  window.ChatGPTAutomation = automationAPI;

  log.debug("[DEBUG] window.ChatGPTAutomationV2設定完了");
  log.debug(
    "[DEBUG] typeof window.ChatGPTAutomationV2:",
    typeof window.ChatGPTAutomationV2,
  );

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

      // ping/pongメッセージへの即座応答（最優先）
      if (
        request.action === "ping" ||
        request.type === "CONTENT_SCRIPT_CHECK"
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

      // executeTaskタスクの処理
      if (
        request.action === "executeTask" ||
        request.type === "executeTask" ||
        request.type === "CLAUDE_EXECUTE_TASK"
      ) {
        log.warn(
          `🔧 [ChatGPT-直接実行方式] executeTask実行開始 [ID:${requestId}]`,
          {
            requestId: requestId,
            action: request.action,
            type: request.type,
            automationName: request.automationName,
            hasTask: !!request.task,
            hasTaskData: !!request.taskData,
            taskId: request?.task?.id || request?.taskData?.id,
          },
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

      // その他のメッセージは無視
      log.debug(`🔕 [ChatGPT] 未対応メッセージを無視:`, {
        action: request.action,
        type: request.type,
        requestId: requestId,
      });
      sendResponse({ success: false, error: "Unsupported message type" });
      return true;
    });

    log.debug("✅ [ChatGPT] メッセージリスナー登録完了");
  };

  // メッセージリスナーを即座に登録
  try {
    registerMessageListener();
    log.info("📡 [ChatGPT] step4-tasklist.js統合用メッセージリスナー準備完了");
  } catch (error) {
    log.error("❌ [ChatGPT] メッセージリスナー登録エラー:", error);
  }

  log.debug("✅ ChatGPT Automation V2 準備完了");
  log.debug(
    '使用方法: ChatGPTAutomation.executeTask({ model: "GPT-4o", function: "Deep Research", prompt: "..." })',
  );
  log.debug(
    "✅ 下位互換性: ChatGPTAutomation と ChatGPTAutomationV2 の両方で利用可能",
  );
})();

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
// ウィンドウ終了時のログ保存処理
// ========================================
window.addEventListener("beforeunload", async (event) => {
  log.debug("🔄 [ChatGPTAutomation] ウィンドウ終了検知 - ログ保存開始");

  try {
    const fileName = await ChatGPTLogManager.saveToFile();
    if (fileName) {
      log.debug(`✅ [ChatGPTAutomation] ログ保存完了: ${fileName}`);
    }
  } catch (error) {
    log.error("[ChatGPTAutomation] ログ保存エラー:", error);
  }
});

window.ChatGPTLogManager = ChatGPTLogManager;

// ========================================
// 【エクスポート】検出システム用関数一覧
// ========================================
// ChatGPT自動化関数はwindowオブジェクトに定義
// エクスポートする関数なし（内部実装のみ）
// コンテンツスクリプトではexport文を使用できないため、コメントアウト

// ========================================
// ChatGPTモデル・機能検出関数
// ========================================

// 検出結果を保存するグローバル変数
window.ChatGPTAutomation = window.ChatGPTAutomation || {};
window.ChatGPTAutomation.detectionResult = null;

async function detectChatGPTModelsAndFeatures() {
  log("🔍 ChatGPTモデル・機能検出開始");

  const DETECTION_SELECTORS = {
    modelButton: [
      'button[type="button"]:has([data-testid="model-switcher-button"])',
      'button:has([data-testid="model-switcher-button"])',
    ],
    modelMenu: ['div[role="menu"]'],
    functionMenuButton: [
      'button[aria-label="機能メニューを開く"]',
      'button:has(svg):has(path[d*="M12 6.5a5.5"])',
    ],
    functionMenu: ['div[role="menu"]'],
  };

  const findElement = (selectors) => {
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) return element;
    }
    return null;
  };

  const availableModels = [];
  const availableFunctions = [];

  try {
    // モデル検出
    const modelBtn = findElement(DETECTION_SELECTORS.modelButton);
    if (modelBtn) {
      log("モデルメニューボタン発見、クリック実行");
      modelBtn.click();
      await sleep(1500);

      const modelMenu = findElement(DETECTION_SELECTORS.modelMenu);
      if (modelMenu) {
        log("モデルメニュー発見、モデル一覧取得");

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
          modelMenu.querySelector('[role="menuitem"][data-has-submenu]') ||
          Array.from(modelMenu.querySelectorAll('[role="menuitem"]')).find(
            (el) => el.textContent && el.textContent.includes("レガシーモデル"),
          );

        if (legacyButton) {
          log("レガシーモデルメニュー発見、追加モデル取得");
          legacyButton.click();
          await sleep(1500);

          const allMenus = document.querySelectorAll('[role="menu"]');
          allMenus.forEach((menu) => {
            if (menu !== modelMenu) {
              const items = menu.querySelectorAll('[role="menuitem"]');
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
          new KeyboardEvent("keydown", { key: "Escape", code: "Escape" }),
        );
        await sleep(500);
      }
    }

    // 機能検出
    const funcMenuBtn = findElement(DETECTION_SELECTORS.functionMenuButton);
    if (funcMenuBtn) {
      log("機能メニューボタン発見、クリック実行");
      funcMenuBtn.click();
      await sleep(1500);

      const funcMenu = findElement(DETECTION_SELECTORS.functionMenu);
      if (funcMenu) {
        log("機能メニュー発見、機能一覧取得");

        // メイン機能を取得
        const menuItems = funcMenu.querySelectorAll('[role="menuitemradio"]');
        menuItems.forEach((item) => {
          const funcName = item.textContent.trim();
          if (funcName) {
            availableFunctions.push(funcName);
          }
        });

        // サブメニューもチェック
        const moreButton = Array.from(
          funcMenu.querySelectorAll('[role="menuitem"]'),
        ).find((el) => el.textContent && el.textContent.includes("さらに表示"));

        if (moreButton) {
          log("追加機能メニュー発見、サブメニュー取得");
          moreButton.click();
          await sleep(1000);

          const subMenu = document.querySelector('[data-side="right"]');
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
          new KeyboardEvent("keydown", { key: "Escape", code: "Escape" }),
        );
        await sleep(500);
      }
    }

    const result = { models: availableModels, functions: availableFunctions };
    log(
      `🔍 ChatGPT検出完了 - モデル: ${availableModels.length}個, 機能: ${availableFunctions.length}個`,
      result,
    );

    // 検出結果を保存
    if (window.ChatGPTAutomation) {
      window.ChatGPTAutomation.detectionResult = result;
    }

    // UIに送信
    try {
      if (chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({
          type: "AI_MODEL_FUNCTION_UPDATE",
          aiType: "chatgpt",
          data: {
            models: availableModels.map((m) =>
              typeof m === "string" ? m : m.name,
            ),
            functions: availableFunctions,
          },
        });
        log("✅ UIテーブルにデータを送信しました");
      }
    } catch (error) {
      log.warn("UIへの送信失敗:", error);
    }

    return result;
  } catch (error) {
    log.error("🔍 ChatGPT検出エラー:", error);
    return { models: availableModels, functions: availableFunctions };
  }
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
  log(`🎯 モデル選択: [${index}] ${modelName}`);
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
    log("🎯 通常モードを選択");
    // 通常モードの場合は何もしない
    return true;
  }

  const funcName =
    window.ChatGPTAutomation.detectionResult.functions[index - 1];
  if (!funcName) {
    log.error(`インデックス ${index} の機能が存在しません`);
    return false;
  }

  log(`🎯 機能選択: [${index}] ${funcName}`);
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
    if (chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage({
        type: "AI_MODEL_FUNCTION_UPDATE",
        aiType: "chatgpt",
        data: {
          models: data.models.map((m) => (typeof m === "string" ? m : m.name)),
          functions: data.functions,
        },
      });
      log("✅ UIテーブルにデータを手動送信しました");
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
    log("🚀 完全テスト実行開始");

    if (!window.ChatGPTAutomation.detectionResult) {
      log("🔍 検出実行中...");
      await detectChatGPTModelsAndFeatures();
    }

    log(`🎯 モデル[${modelIndex}]を選択中...`);
    await selectModelByIndex(modelIndex);
    await sleep(1000);

    log(`🎯 機能[${functionIndex}]を選択中...`);
    await selectFunctionByIndex(functionIndex);
    await sleep(1000);

    log(`📨 メッセージ送信中: "${message}"`);
    await inputTextChatGPT(message);
    await sleep(500);
    await sendMessageChatGPT();

    log("⏳ 応答待機中...");
    await waitForResponseChatGPT();

    log("📋 応答取得中...");
    const response = await getResponseTextChatGPT();

    log("✅ 完全テスト完了");
    console.log("応答:", response);
    return response;
  } catch (error) {
    log.error("完全テストエラー:", error);
    throw error;
  }
}

// グローバルに公開
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

log("✅ ChatGPT Automation Enhanced - インデックス選択機能追加完了", "success");
