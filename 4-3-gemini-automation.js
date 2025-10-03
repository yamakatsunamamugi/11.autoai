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
      window.geminiErrorHandler =
        window.UniversalErrorHandler.createForAI("gemini");
      console.log("✅ [Step 4-0-0] [GEMINI] エラーハンドラー初期化完了");
      return true;
    }

    if (attempts < maxAttempts) {
      // 100ms後に再試行
      setTimeout(tryInitialize, 100);
    } else {
      console.error(
        "❌ [Step 4-0-0] [GEMINI] 共通エラーハンドリングモジュールが見つかりません",
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
let CURRENT_LOG_LEVEL = LOG_LEVEL.WARN; // デフォルト値（簡潔な動作確認用）

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

/**
 * @fileoverview Gemini Automation V3 - 統合版（UI通信機能追加）
 *
 * 【ステップ構成】
 * Step 4-0-0: セレクタ定義
 * Step 4-0-1: ユーティリティ関数定義
 * Step 4-0-2: 選択済み機能の解除
 * Step 4-0-3: モデルと機能の探索
 * Step 4-1: ページ準備状態チェック
 * Step 4-2: テキスト入力（Canvas/通常モード自動判定）
 * Step 4-3: モデル選択（条件付き）
 * Step 4-4: 機能選択（条件付き）
 * Step 4-5: メッセージ送信
 * Step 4-7: 応答待機（通常/Canvas/Deep Researchモード）
 * Step 4-7-DR: Deep Research待機処理
 * Step 4-8: テキスト取得
 * Step 4-9: タスク実行
 *
 * @version 3.2.1
 * @updated 2025-10-02 ステップ番号完全体系化、Step 4-0-0/4-0-1追加
 */

(async function () {
  "use strict";

  // 初期化マーカー設定
  window.GEMINI_SCRIPT_LOADED = true;
  window.GEMINI_SCRIPT_INIT_TIME = Date.now();

  // ========================================
  // AI待機設定（デフォルト値）
  // ========================================
  let AI_WAIT_CONFIG = {
    MAX_WAIT: 600000, // 10分（通常処理） - 全AI統一
    DEEP_RESEARCH_WAIT: 2400000, // 40分（Deep Research）
    AGENT_MODE_WAIT: 2400000, // 40分（エージェントモード）
    CHECK_INTERVAL: 10000, // 10秒（停止ボタン消滅継続時間）
    SHORT_WAIT: 1000,
    MEDIUM_WAIT: 2000,
  };

  // Chrome Storageから設定を読み込む
  if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(
      ["responseWaitConfig", "batchProcessingConfig"],
      (result) => {
        if (result.responseWaitConfig) {
          // 回答待機時間設定を適用
          AI_WAIT_CONFIG.MAX_WAIT =
            result.responseWaitConfig.MAX_RESPONSE_WAIT_TIME ||
            AI_WAIT_CONFIG.MAX_WAIT;
          AI_WAIT_CONFIG.DEEP_RESEARCH_WAIT =
            result.responseWaitConfig.MAX_RESPONSE_WAIT_TIME_DEEP ||
            AI_WAIT_CONFIG.DEEP_RESEARCH_WAIT;
          AI_WAIT_CONFIG.AGENT_MODE_WAIT =
            result.responseWaitConfig.MAX_RESPONSE_WAIT_TIME_AGENT ||
            AI_WAIT_CONFIG.AGENT_MODE_WAIT;
          AI_WAIT_CONFIG.CHECK_INTERVAL =
            result.responseWaitConfig.STOP_CHECK_INTERVAL ||
            AI_WAIT_CONFIG.CHECK_INTERVAL;

          log.info("⏱️ [Gemini] 回答待機時間設定を適用:", {
            通常モード: AI_WAIT_CONFIG.MAX_WAIT / 60000 + "分",
            DeepResearch: AI_WAIT_CONFIG.DEEP_RESEARCH_WAIT / 60000 + "分",
            エージェント: AI_WAIT_CONFIG.AGENT_MODE_WAIT / 60000 + "分",
            Stop確認間隔: AI_WAIT_CONFIG.CHECK_INTERVAL / 1000 + "秒",
          });
        }

        if (result.batchProcessingConfig) {
          // バッチ処理設定から回答待機時間設定も読み込み（互換性のため）
          if (!result.responseWaitConfig) {
            AI_WAIT_CONFIG.MAX_WAIT =
              result.batchProcessingConfig.MAX_RESPONSE_WAIT_TIME ||
              AI_WAIT_CONFIG.MAX_WAIT;
            AI_WAIT_CONFIG.DEEP_RESEARCH_WAIT =
              result.batchProcessingConfig.MAX_RESPONSE_WAIT_TIME_DEEP ||
              AI_WAIT_CONFIG.DEEP_RESEARCH_WAIT;
            AI_WAIT_CONFIG.AGENT_MODE_WAIT =
              result.batchProcessingConfig.MAX_RESPONSE_WAIT_TIME_AGENT ||
              AI_WAIT_CONFIG.AGENT_MODE_WAIT;
            AI_WAIT_CONFIG.CHECK_INTERVAL =
              result.batchProcessingConfig.STOP_CHECK_INTERVAL ||
              AI_WAIT_CONFIG.CHECK_INTERVAL;
          }
        }
      },
    );
  }

  // windowレベルでも公開（後方互換性）
  window.AI_WAIT_CONFIG = AI_WAIT_CONFIG;

  // ========================================
  // 統一GeminiRetryManager クラス定義
  // ChatGPT/Claudeと同様のエラー分類とリトライ戦略を統合
  // ========================================

  class GeminiRetryManager {
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

      // Gemini特有のエラー分類
      this.errorStrategies = {
        OVERLOADED_ERROR: {
          immediate_escalation: "HEAVY_RESET",
          maxRetries: 5,
        },
        RATE_LIMIT_ERROR: {
          immediate_escalation: "HEAVY_RESET",
          maxRetries: 10,
        },
        NETWORK_ERROR: { maxRetries: 8, escalation: "MODERATE" },
        DOM_ERROR: { maxRetries: 5, escalation: "LIGHTWEIGHT" },
        UI_TIMING_ERROR: { maxRetries: 10, escalation: "LIGHTWEIGHT" },
        CANVAS_ERROR: { maxRetries: 8, escalation: "MODERATE" },
        DEEP_RESEARCH_ERROR: { maxRetries: 12, escalation: "MODERATE" },
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

    // Gemini特有のエラー分類器
    classifyError(error, context = {}) {
      const errorMessage = error?.message || error?.toString() || "";
      const errorName = error?.name || "";

      let errorType = "GENERAL_ERROR";

      // Gemini Overloadedエラー（最優先）
      if (
        errorMessage.includes("Overloaded") ||
        errorMessage.includes("overloaded") ||
        errorMessage.includes("quota exceeded") ||
        errorMessage.includes("too many requests") ||
        errorMessage.includes("クォータエラー") ||
        errorMessage.includes("quota") ||
        errorMessage.includes("Quota")
      ) {
        errorType = "OVERLOADED_ERROR";
        return errorType;
      }

      if (
        errorMessage.includes("rate limit") ||
        errorMessage.includes("Rate limited") ||
        errorMessage.includes("Too many requests") ||
        errorMessage.includes("レート制限") ||
        errorMessage.includes("Rate limit")
      ) {
        errorType = "RATE_LIMIT_ERROR";
        return errorType;
      }

      if (
        errorMessage.includes("Canvas") ||
        errorMessage.includes("canvas") ||
        context.feature === "Canvas"
      ) {
        errorType = "CANVAS_ERROR";
        return errorType;
      }

      if (
        errorMessage.includes("Deep Research") ||
        errorMessage.includes("deep research") ||
        context.feature === "Deep Research"
      ) {
        errorType = "DEEP_RESEARCH_ERROR";
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
        return errorType;
      }

      if (
        errorMessage.includes("要素が見つかりません") ||
        errorMessage.includes("element not found") ||
        errorMessage.includes("selector") ||
        errorMessage.includes("querySelector")
      ) {
        errorType = "DOM_ERROR";
        return errorType;
      }

      if (
        errorMessage.includes("timing") ||
        errorMessage.includes("タイミング") ||
        errorMessage.includes("wait")
      ) {
        errorType = "UI_TIMING_ERROR";
        return errorType;
      }

      return errorType;
    }

    // エラー履歴に追加
    addErrorToHistory(errorType, errorMessage) {
      const timestamp = new Date().toISOString();
      this.errorHistory.push({ errorType, errorMessage, timestamp });

      if (this.errorHistory.length > this.maxHistorySize) {
        this.errorHistory.shift();
      }

      // 統計更新
      this.metrics.errorCounts[errorType] =
        (this.metrics.errorCounts[errorType] || 0) + 1;

      if (this.lastErrorType === errorType) {
        this.consecutiveErrorCount++;
      } else {
        this.consecutiveErrorCount = 1;
        this.lastErrorType = errorType;
      }
    }

    // 統合リトライ実行関数
    async executeWithRetry(actionFunction, actionName, context = {}) {
      const startTime = Date.now();
      let retryCount = 0;
      let lastError = null;
      let lastResult = null;

      log.debug(
        `🔄 [Gemini RetryManager] ${actionName} 開始 (最大20回リトライ)`,
      );

      for (retryCount = 1; retryCount <= 20; retryCount++) {
        try {
          this.metrics.totalAttempts++;

          log.debug(
            `🔄 [Gemini RetryManager] ${actionName} 試行 ${retryCount}/20`,
          );

          const result = await actionFunction();

          this.metrics.successfulAttempts++;
          const totalTime = Date.now() - startTime;

          log.debug(`✅ [Gemini RetryManager] ${actionName} 成功:`, {
            retryCount,
            totalTime,
            result:
              typeof result === "string"
                ? result.substring(0, 100) + "..."
                : result,
          });

          return {
            success: true,
            result,
            retryCount,
            totalTime,
          };
        } catch (error) {
          lastError = error;
          const errorType = this.classifyError(error, context);

          // エラー履歴管理
          this.addErrorToHistory(errorType, error.message);

          const elapsedTime = Date.now() - startTime;

          log.error(
            `❌ [Gemini RetryManager] ${actionName} エラー (試行 ${retryCount}/20):`,
            {
              errorType,
              errorMessage: error.message,
              retryCount,
              elapsedTime,
              consecutiveErrors: this.consecutiveErrorCount,
            },
          );

          // 最終試行の場合は終了
          if (retryCount >= 20) {
            break;
          }

          // エスカレーションレベル決定
          const escalationLevel = this.determineEscalationLevel(
            retryCount,
            errorType,
          );
          const delay = this.calculateDelay(retryCount, escalationLevel);

          log.debug(
            `⏳ [Gemini RetryManager] ${delay}ms待機後リトライ (レベル: ${escalationLevel})`,
          );

          // エスカレーション実行
          await this.executeEscalation(escalationLevel, delay);
        }
      }

      // 全リトライ失敗
      const totalTime = Date.now() - startTime;
      const finalErrorType = lastError
        ? this.classifyError(lastError, context)
        : "UNKNOWN";

      log.error(`❌ [Gemini RetryManager] ${actionName} 全リトライ失敗:`, {
        totalAttempts: retryCount,
        totalTime,
        finalErrorType,
        lastErrorMessage: lastError?.message || "Unknown error",
        errorHistory: this.errorHistory.slice(-5), // 最新5件のエラー
      });

      return {
        success: false,
        result: lastResult,
        error: lastError,
        retryCount,
        errorType: finalErrorType,
      };
    }

    // エスカレーションレベル決定
    determineEscalationLevel(retryCount, errorType) {
      // 即座にエスカレーションが必要なエラー
      const strategy = this.errorStrategies[errorType];
      if (strategy?.immediate_escalation) {
        this.metrics.escalationCounts[strategy.immediate_escalation]++;
        return strategy.immediate_escalation;
      }

      // 試行回数によるエスカレーション
      if (retryCount <= 5) {
        this.metrics.escalationCounts.LIGHTWEIGHT++;
        return "LIGHTWEIGHT";
      } else if (retryCount <= 8) {
        this.metrics.escalationCounts.MODERATE++;
        return "MODERATE";
      } else {
        this.metrics.escalationCounts.HEAVY_RESET++;
        return "HEAVY_RESET";
      }
    }

    // 待機時間計算
    calculateDelay(retryCount, escalationLevel) {
      const level = this.escalationLevels[escalationLevel];
      const index = Math.min(
        retryCount - level.range[0],
        level.delays.length - 1,
      );
      return level.delays[Math.max(0, index)];
    }

    // エスカレーション実行
    async executeEscalation(escalationLevel, delay) {
      const level = this.escalationLevels[escalationLevel];

      log.debug(
        `🔧 [Gemini RetryManager] エスカレーション実行: ${level.description}`,
      );

      // 待機実行
      await new Promise((resolve) => {
        const timeoutId = setTimeout(resolve, delay);
        this.activeTimeouts.add(timeoutId);
        setTimeout(() => this.activeTimeouts.delete(timeoutId), delay);
      });

      // エスカレーション処理
      switch (escalationLevel) {
        case "MODERATE":
          log.debug(`🔄 [Gemini RetryManager] ページリフレッシュ実行`);
          try {
            window.location.reload();
          } catch (e) {
            log.error(`❌ [Gemini RetryManager] ページリフレッシュ失敗:`, e);
          }
          break;
        case "HEAVY_RESET":
          log.debug(
            `🆕 [Gemini RetryManager] 重いリセット: 新規ウィンドウが推奨されますが、現在のウィンドウで継続`,
          );
          try {
            // sessionStorageクリア
            sessionStorage.clear();
            // ページリフレッシュ
            window.location.reload();
          } catch (e) {
            log.error(`❌ [Gemini RetryManager] 重いリセット失敗:`, e);
          }
          break;
      }
    }

    // リソースクリーンアップ
    cleanup() {
      this.activeTimeouts.forEach((timeoutId) => clearTimeout(timeoutId));
      this.activeTimeouts.clear();

      if (this.abortController) {
        this.abortController.abort();
        this.abortController = null;
      }
    }

    // 統計情報取得
    getMetrics() {
      const successRate =
        this.metrics.totalAttempts > 0
          ? (
              (this.metrics.successfulAttempts / this.metrics.totalAttempts) *
              100
            ).toFixed(2)
          : 0;

      return {
        ...this.metrics,
        successRate: `${successRate}%`,
        currentConsecutiveErrors: this.consecutiveErrorCount,
        lastErrorType: this.lastErrorType,
        recentErrors: this.errorHistory.slice(-10),
      };
    }
  }

  // GeminiRetryManagerのインスタンス作成
  const geminiRetryManager = new GeminiRetryManager();

  // windowオブジェクトに登録（デバッグ用）
  window.geminiRetryManager = geminiRetryManager;

  // ========================================
  // Step 4-0-0: セレクタ定義（冒頭に集約）
  // ========================================
  const SELECTORS = {
    // モデル選択メニュー
    menuButton: [
      ".gds-mode-switch-button.logo-pill-btn",
      'button[class*="logo-pill-btn"]',
      "button.gds-mode-switch-button",
      "button.logo-pill-btn",
    ],
    menuContainer: [
      ".cdk-overlay-pane .menu-inner-container",
      '.cdk-overlay-pane mat-action-list[data-test-id="mobile-nested-mode-menu"]',
      ".mat-mdc-menu-panel",
    ],
    modelButtons: [
      "button.bard-mode-list-button[mat-menu-item]",
      'button[role="menuitemradio"]',
      "button[mat-menu-item]",
    ],
    modelDesc: [".mode-desc", ".gds-label-m-alt", ".title-and-description"],
    modelDisplay: [
      ".logo-pill-label-container",
      ".gds-mode-switch-button .mdc-button__label div",
    ],

    // 機能ボタン（修正版 2025-10-02）
    toolboxButton: 'mat-icon[fonticon="page_info"]',
    toolboxButtonParent: ".toolbox-drawer-button",
    featureMenuItems: "toolbox-drawer-item > button",
    featureLabel: ".label, .gds-label-l",
    mainButtons: "toolbox-drawer-item > button",
    moreButton: 'button[aria-label="その他"]',
    selectedFeatures: [
      ".toolbox-drawer-item-button button.is-selected",
      ".toolbox-drawer-button.has-selected-item",
    ],

    // Canvas関連
    canvasEditor: ["immersive-editor", ".immersive-editor"],

    // 入力欄
    canvas: ".ProseMirror",
    normalInput: ".ql-editor",

    // 送信ボタン
    sendButton: "button.send-button.submit:not(.stop)",
    sendButtonAlt: [
      'button[aria-label="送信"]:not([disabled])',
      'button[aria-label*="Send"]:not([disabled])',
      ".send-button:not([disabled])",
    ],
    stopButton: [
      "button.send-button.stop",
      'button[aria-label="停止"]',
      'button[aria-label*="Stop"]',
      ".send-button.stop",
    ],

    // Deep Research
    deepResearchButton: 'button[data-test-id="confirm-button"]',

    // レスポンス
    canvasResponse: "immersive-editor .ProseMirror", // Canvas応答は immersive-editor 内
    normalResponse: ".model-response-text .markdown",
    responseAlt: [
      "[data-response-index]:last-child",
      ".model-response:last-child",
      '[role="presentation"]:last-child',
    ],

    // オーバーレイ
    overlay: ".cdk-overlay-backdrop",

    // エラーメッセージ（送信直後のエラー検出用）
    errorMessage: [
      'div[role="alert"]',
      ".error-message",
      ".gmat-error",
      "mat-error",
      '[data-test-id="error-message"]',
    ],
  };

  // ========================================
  // Step 4-0-1: ユーティリティ関数（最初に定義）
  // ========================================
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const findElement = (selectorArray, parent = document) => {
    const selectors = Array.isArray(selectorArray)
      ? selectorArray
      : [selectorArray];
    for (const selector of selectors) {
      const element = parent.querySelector(selector);
      if (element) return element;
    }
    return null;
  };

  const findElements = (selectorArray, parent = document) => {
    const selectors = Array.isArray(selectorArray)
      ? selectorArray
      : [selectorArray];
    for (const selector of selectors) {
      const elements = parent.querySelectorAll(selector);
      if (elements.length > 0) return Array.from(elements);
    }
    return [];
  };

  const getCleanText = (element) => {
    if (!element) return "";
    try {
      const clone = element.cloneNode(true);
      clone
        .querySelectorAll(
          "mat-icon, .mat-ripple, .mat-mdc-button-persistent-ripple, .mat-focus-indicator, .mat-mdc-button-touch-target, .cdk-visually-hidden",
        )
        .forEach((el) => el.remove());
      return clone.textContent.trim().replace(/\s+/g, " ");
    } catch (e) {
      return element.textContent.trim().replace(/\s+/g, " ");
    }
  };

  // ========================================
  // モデルと機能の初期化
  // ========================================
  window.availableModels = [];
  window.availableFeatures = [];

  // ========================================
  // UI通信機能
  // ========================================
  async function sendToUI(models, features) {
    try {
      if (
        typeof chrome !== "undefined" &&
        chrome.runtime &&
        chrome.runtime.sendMessage
      ) {
        const messageData = {
          type: "AI_MODEL_FUNCTION_UPDATE",
          aiType: "gemini",
          data: {
            models: models || [],
            functions: features || [],
            timestamp: new Date().toISOString(),
          },
        };

        // タイムアウト付きでsendMessageを実行
        const sendMessageWithTimeout = new Promise((resolve) => {
          const timeout = setTimeout(() => {
            log.error(
              "⏱️ [Step 4-0-3] [SendToUI] sendMessageがタイムアウト（3秒経過）",
            );
            resolve({
              error: "timeout",
              message: "sendMessage timeout after 3000ms",
            });
          }, 3000); // 3秒でタイムアウト

          try {
            chrome.runtime.sendMessage(messageData, (response) => {
              clearTimeout(timeout);

              // chrome.runtime.lastErrorをチェック
              if (chrome.runtime.lastError) {
                log.error(
                  "⚠️ [Step 4-0-3] [SendToUI] chrome.runtime.lastError:",
                  chrome.runtime.lastError.message,
                );
                resolve({
                  error: "runtime_error",
                  message: chrome.runtime.lastError.message,
                });
              } else {
                resolve(response || { success: true });
              }
            });
          } catch (error) {
            clearTimeout(timeout);
            log.warn(
              "❌ [Step 4-0-3] [Gemini] sendMessage実行エラー:",
              error.message,
            );
            resolve({
              error: "execution_error",
              message: error.message,
            });
          }
        });

        const result = await sendMessageWithTimeout;

        if (result.error) {
          log.warn("⚠️ [Gemini] UI通信失敗:", result);
        } else {
          log.info("✅ [Gemini] UI更新メッセージを送信しました");
        }

        return result;
      }
    } catch (error) {
      log.debug(
        "UI通信エラー（拡張機能コンテキスト外の可能性）:",
        error.message,
      );
    }
  }

  // ========================================
  // Step 4-0-2: 選択済み機能の解除
  // ========================================
  async function deselectAllFeatures() {
    log.debug("【Step 4-0-2】選択されている機能をすべて解除");
    try {
      const selectedButtons = findElements(SELECTORS.selectedFeatures);
      let count = 0;
      for (const btn of selectedButtons) {
        btn.click();
        await wait(2000);
        count++;
      }
      if (count > 0) {
        log.info(`【Step 4-0-2】解除した機能の数: ${count}`);
      }
      return count;
    } catch (error) {
      log.error("【Step 4-0-2】機能解除エラー:", error);
      return 0;
    }
  }

  // ========================================
  // Step 4-0-3: モデルと機能の探索
  // ========================================
  async function discoverModelsAndFeatures() {
    log.info("【Step 4-0-3-1】モデルと機能の探索");

    // 【Step 4-0-3-2】選択済み機能の解除
    await deselectAllFeatures();

    // 【Step 4-0-3-3】モデル探索
    try {
      const menuButton = findElement(SELECTORS.menuButton);

      if (menuButton) {
        menuButton.click();
        await wait(1500);

        const menuContainer = findElement(SELECTORS.menuContainer);

        if (menuContainer) {
          const modelButtons = findElements(
            SELECTORS.modelButtons,
            menuContainer,
          );

          // 安全性チェック: modelButtonsが配列であることを確認
          if (modelButtons && Array.isArray(modelButtons)) {
            window.availableModels = modelButtons
              .map((btn) => {
                const text = getCleanText(
                  findElement(SELECTORS.modelDesc, btn),
                );
                return text || getCleanText(btn);
              })
              .filter(Boolean);
          } else {
            window.availableModels = [];
            log.warn("【Step 4-0-3-3】モデルボタンが見つかりませんでした");
          }

          log.info(
            `【Step 4-0-3-3】モデル探索完了: ${window.availableModels.length}個のモデルを発見`,
          );
        }
      }
    } catch (e) {
      log.error("【Step 4-0-3-3】モデル探索エラー: " + e.message);
    } finally {
      // メニューを閉じる
      const overlay = document.querySelector(SELECTORS.overlay);
      if (overlay) overlay.click();
      await wait(500);
    }

    // 【Step 4-0-3-4】機能探索（修正版）
    try {
      const featureNames = new Set();

      // ツールボタンを見つける（リトライ機能付き）
      let toolboxButton = null;
      const maxAttempts = 10;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        toolboxButton = findElement(SELECTORS.toolboxButtonParent);
        if (toolboxButton) {
          log.info(
            `【Step 4-0-3-4】ツールボタン発見（試行${attempt}回目）、クリック実行`,
          );
          break;
        }
        log.debug(
          `【Step 4-0-3-4】ツールボタン待機中... (${attempt}/${maxAttempts})`,
        );
        await wait(500);
      }

      if (toolboxButton) {
        toolboxButton.click();
        await wait(1500);

        // メニューが開いたらアイテムを取得
        const menuItems = findElements(SELECTORS.featureMenuItems);
        log.info(`【Step 4-0-3-4】メニューアイテム数: ${menuItems.length}`);

        menuItems.forEach((item) => {
          const text = getCleanText(item);
          log.debug(`【Step 4-0-3-4】機能候補: ${text}`);
          if (text && text !== "その他") {
            featureNames.add(text);
          }
        });

        // メニューを閉じる
        const overlay = document.querySelector(SELECTORS.overlay);
        if (overlay) overlay.click();
        await wait(500);
      } else {
        log.warn(
          "【Step 4-0-3-4】ツールボタンが見つかりませんでした（10回試行後）",
        );
      }

      window.availableFeatures = Array.from(featureNames).filter(Boolean);
      log.info(
        `【Step 4-0-3-4】機能探索完了: ${window.availableFeatures.length}個の機能を発見`,
      );
      log.info(
        `【Step 4-0-3-4】発見した機能: ${window.availableFeatures.join(", ")}`,
      );
    } catch (e) {
      log.error("【Step 4-0-3-4】機能探索エラー: " + e.message);
    }

    // 【Step 4-0-3-5】UI更新
    await sendToUI(window.availableModels, window.availableFeatures);

    return {
      models: window.availableModels,
      features: window.availableFeatures,
    };
  }

  // ========================================
  // Step 4-1: ページ準備状態チェック
  // ========================================
  async function waitForPageReady() {
    log.debug("【Step 4-1】ページ準備確認");
    const maxAttempts = 30; // 最大30秒待機
    let attempts = 0;

    while (attempts < maxAttempts) {
      attempts++;
      log.debug(`【Step 4-1】準備確認 (${attempts}/${maxAttempts})`);

      // テキスト入力欄の存在をチェック（Canvas または 通常モード）
      const canvasInput = document.querySelector(SELECTORS.canvas);
      const normalInput = document.querySelector(SELECTORS.normalInput);

      if ((canvasInput && canvasInput.isContentEditable) || normalInput) {
        log.debug("✅ 【Step 4-1】ページ準備完了");
        return true;
      }

      await wait(1000);
    }

    log.error("❌ 【Step 4-1】ページ準備タイムアウト");
    throw new Error("【Step 4-1】ページが準備できませんでした");
  }

  // ========================================
  // Step 4-2: テキスト入力（Canvas/通常モード自動判定） - RetryManager統合
  // ========================================
  async function inputTextGemini(text) {
    log.debug("【Step 4-2】テキスト入力開始");
    const retryManager = new GeminiRetryManager();
    const result = await retryManager.executeWithRetry(
      async () => {
        // Canvasモードチェック
        const canvas = document.querySelector(SELECTORS.canvas);

        if (canvas && canvas.isContentEditable) {
          await inputToCanvas(text);
          return { success: true };
        }

        // 通常モード
        const editor = document.querySelector(SELECTORS.normalInput);

        if (editor) {
          await inputToNormal(text);
          return { success: true };
        }

        throw new Error("テキスト入力欄が見つかりません");
      },
      "Geminiテキスト入力",
      { textLength: text?.length || 0 },
    );

    if (!result.success) {
      throw new Error(result.error?.message || "テキスト入力失敗");
    }

    return result.result;
  }

  async function inputToCanvas(text) {
    const canvas = document.querySelector(SELECTORS.canvas);
    if (!canvas) {
      throw new Error("Canvas (.ProseMirror) が見つかりません");
    }

    canvas.focus();
    await wait(100);

    // Clear existing content
    canvas.innerHTML = "<p></p>";

    // Set new content
    const paragraph = canvas.querySelector("p");
    if (paragraph) {
      paragraph.textContent = text;
    } else {
      canvas.innerHTML = `<p>${text}</p>`;
    }

    // Dispatch events
    canvas.dispatchEvent(new Event("input", { bubbles: true }));
    canvas.dispatchEvent(new Event("change", { bubbles: true }));

    await wait(500);
    return canvas;
  }

  async function inputToNormal(text) {
    const editor = document.querySelector(SELECTORS.normalInput);
    if (!editor) {
      throw new Error("テキスト入力欄 (.ql-editor) が見つかりません");
    }

    editor.textContent = text;
    if (editor.classList.contains("ql-blank")) {
      editor.classList.remove("ql-blank");
    }
    editor.dispatchEvent(new Event("input", { bubbles: true }));
    editor.dispatchEvent(new Event("change", { bubbles: true }));
    await wait(500);

    return editor;
  }

  // ========================================
  // Step 4-3: モデル選択機能 - RetryManager統合
  // ========================================
  async function selectModel(modelName) {
    log.debug("【Step 4-3】モデル選択", modelName);

    if (!modelName || modelName === "" || modelName === "設定なし") {
      log.debug("モデル選択をスキップ");
      return { success: true, skipped: true };
    }

    const retryManager = new GeminiRetryManager();
    const result = await retryManager.executeWithRetry(
      async () => {
        // 【Step 4-3-1】メニューボタンをクリック
        const menuButton = findElement(SELECTORS.menuButton);
        if (!menuButton) {
          throw new Error("モデル選択メニューボタンが見つかりません");
        }
        menuButton.click();
        await wait(1500);

        // 【Step 4-3-2】メニュー内でモデルを探して選択
        const menuContainer = findElement(SELECTORS.menuContainer);
        if (!menuContainer) {
          throw new Error("モデル選択メニューが見つかりません");
        }

        const modelButtons = findElements(
          SELECTORS.modelButtons,
          menuContainer,
        );
        const targetButton = Array.from(modelButtons).find((btn) => {
          const text = getCleanText(btn);
          return text && text.includes(modelName);
        });

        if (!targetButton) {
          throw new Error(`モデル "${modelName}" が見つかりません`);
        }

        targetButton.click();
        await wait(2000);

        // 【Step 4-3-3】選択確認
        const displayElement = findElement(SELECTORS.modelDisplay);
        const displayText = getCleanText(displayElement);

        log.info(`📊 モデル選択後確認 - 現在表示中: "${displayText}"`);
        return { success: true, selected: displayText };
      },
      "Geminiモデル選択",
      { modelName },
    );

    return result.success ? result.result : result;
  }

  // ========================================
  // Step 4-4: 機能選択機能 - RetryManager統合
  // ========================================
  async function selectFeature(featureName) {
    log.debug("【Step 4-4】機能選択", featureName);

    if (!featureName || featureName === "" || featureName === "設定なし") {
      log.debug("機能選択をスキップ");
      return { success: true, skipped: true };
    }

    const retryManager = new GeminiRetryManager();
    const result = await retryManager.executeWithRetry(
      async () => {
        // 【Step 4-4-1】まずメインボタンから探す
        let featureButton = null;
        const allButtons = findElements(SELECTORS.mainButtons);
        featureButton = Array.from(allButtons).find(
          (btn) =>
            getCleanText(findElement(SELECTORS.featureLabel, btn)) ===
            featureName,
        );

        // 【Step 4-4-2】見つからなければ「その他」メニューを開く
        if (!featureButton) {
          const moreButton = findElement(SELECTORS.moreButton);
          if (!moreButton) {
            throw new Error("「その他」ボタンが見つかりません");
          }
          moreButton.click();
          await wait(1500);

          const menuButtons = findElements(SELECTORS.featureMenuItems);
          featureButton = Array.from(menuButtons).find(
            (btn) =>
              getCleanText(findElement(SELECTORS.featureLabel, btn)) ===
              featureName,
          );
        }

        if (!featureButton) {
          throw new Error(`機能「${featureName}」が見つかりません`);
        }

        // 【Step 4-4-3】機能をクリック
        featureButton.click();
        await wait(2000);

        // 【Step 4-4-4】選択確認

        // Canvasモードの特別処理
        if (featureName === "Canvas") {
          log.info(`📊 機能選択後確認 - Canvasモードが選択されました`);
          return { success: true, selected: featureName };
        }

        // 通常の機能ボタンの確認
        const selectedButtons = findElements(SELECTORS.selectedFeatures);
        const selectedFeatureNames = [];

        selectedButtons.forEach((button) => {
          const featureText = getCleanText(button);
          if (featureText) {
            selectedFeatureNames.push(featureText);
          }
        });

        // 機能選択後の実際の選択状態をログ出力
        if (selectedFeatureNames.length > 0) {
          log.info(
            `📊 機能選択後確認 - 現在選択中: [${selectedFeatureNames.join(", ")}]`,
          );
        } else {
          log.info(`📊 機能選択後確認 - 選択された機能なし`);
        }
        return { success: true, selected: featureName };
      },
      "Gemini機能選択",
      { featureName },
    );

    return result.success ? result.result : result;
  }

  // ========================================
  // Step 4-4-5: エラーメッセージ検出
  // ========================================
  async function checkForErrorMessage() {
    log.debug("【Step 4-4-5】エラーメッセージチェック開始");

    // エラーメッセージが表示されるまで少し待機
    await wait(1500);

    // エラーメッセージ要素を探す
    const errorElement = findElement(SELECTORS.errorMessage);

    if (errorElement) {
      const errorText = errorElement.textContent.trim();
      log.error("❌ 【Step 4-4-5】Geminiエラー検出:", errorText);

      // エラーメッセージの種類を判定
      if (
        errorText.includes("エラーが発生しました") ||
        errorText.includes("Error") ||
        errorText.includes("Something went wrong")
      ) {
        // エラーコードを抽出（例: "エラーが発生しました(8)"）
        const errorCodeMatch = errorText.match(/\((\d+)\)/);
        const errorCode = errorCodeMatch ? errorCodeMatch[1] : "不明";

        // エラーの種類に応じて処理を分岐
        if (
          errorCode === "8" ||
          errorText.includes("Overloaded") ||
          errorText.includes("quota")
        ) {
          throw new Error(
            `Geminiレート制限/クォータエラー(${errorCode}): ${errorText}`,
          );
        } else {
          throw new Error(`Gemini送信エラー(${errorCode}): ${errorText}`);
        }
      }
    }

    log.debug("【Step 4-4-5】エラーメッセージは検出されませんでした");
    return true;
  }

  // ========================================
  // Step 4-5: メッセージ送信 - RetryManager統合
  // ========================================
  async function sendMessageGemini() {
    log.debug("【Step 4-5】メッセージ送信開始");
    const retryManager = new GeminiRetryManager();
    const result = await retryManager.executeWithRetry(
      async () => {
        let sendButton = document.querySelector(SELECTORS.sendButton);

        if (!sendButton) {
          sendButton = findElement(SELECTORS.sendButtonAlt);
        }

        if (!sendButton) {
          throw new Error("送信ボタンが見つかりません");
        }

        sendButton.click();
        await wait(1000);

        // 送信後にエラーメッセージをチェック
        await checkForErrorMessage();

        return { success: true };
      },
      "Gemini送信ボタンクリック",
      {},
    );

    if (!result.success) {
      throw new Error(result.error?.message || "送信ボタンクリック失敗");
    }

    return true;
  }

  // ========================================
  // Step 4-7: 応答待機
  // ========================================
  async function waitForResponseGemini() {
    const maxWaitTime = AI_WAIT_CONFIG.MAX_WAIT; // 設定から取得

    log.debug("【Step 4-7】応答待機を開始します...");

    // 最初は通常モードとして処理を開始
    let elapsedTime = 0;
    const checkInterval = 1000;
    let hasPartialContent = false;
    let isCanvasMode = false;

    // 通常モードの監視を開始
    log.debug("【Step 4-7】停止ボタン監視を開始...");

    while (elapsedTime < maxWaitTime) {
      await wait(checkInterval);
      elapsedTime += checkInterval;

      // Canvas（immersive-editor）が出現したかチェック
      if (!isCanvasMode) {
        const canvasResponse = document.querySelector(SELECTORS.canvasResponse);
        if (canvasResponse) {
          // Canvasモードに切り替え
          isCanvasMode = true;
          log.debug(
            "【Step 4-7】🎨 Canvasモード検出！テキスト監視に切り替えます",
          );

          // Canvasモードの処理を開始
          return await waitForCanvasResponse(elapsedTime, maxWaitTime);
        }
      }

      // 通常モード: 停止ボタンの確認
      const stopButton = findElement(SELECTORS.stopButton);

      // 部分的な結果があるかチェック
      const responseElements = document.querySelectorAll(
        SELECTORS.normalResponse,
      );
      if (responseElements.length > 0) {
        const latestResponse = responseElements[responseElements.length - 1];
        if (latestResponse && latestResponse.textContent.trim()) {
          hasPartialContent = true;
        }
      }

      if (!stopButton) {
        log.debug("【Step 4-7】応答が完了しました（停止ボタンが消えました）");
        return { success: true, partial: false, timeout: false };
      }

      if (elapsedTime % 10000 === 0) {
        log.debug(`【Step 4-7】応答待機中... (${elapsedTime / 1000}秒経過)`);
      }
    }

    // タイムアウト時の処理
    if (hasPartialContent) {
      log.warn(
        `【Step 4-7】タイムアウトしましたが、部分的な結果を保存します（${maxWaitTime / 60000}分経過）`,
      );
      return { success: true, partial: true, timeout: true };
    } else {
      throw new Error(
        `【Step 4-7】Geminiの応答がタイムアウトしました（${maxWaitTime / 60000}分）`,
      );
    }
  }

  // Canvasモード専用の待機処理
  async function waitForCanvasResponse(initialElapsedTime, maxWaitTime) {
    log.debug("【Step 4-7】Canvasモード: 初期待機15秒...");
    await wait(15000); // Canvas表示を待つ

    log.debug("【Step 4-7】Canvasモード: テキスト生成の監視を開始します");

    let lastLength = -1;
    let lastChangeTime = Date.now();
    let elapsedTime = initialElapsedTime + 15000; // 既に経過した時間 + 初期待機
    let hasPartialContent = false;

    return new Promise((resolve, reject) => {
      const monitor = setInterval(() => {
        elapsedTime += 2000;

        // Canvas応答を immersive-editor 内から探す
        const currentEditor = document.querySelector(SELECTORS.canvasResponse);
        if (!currentEditor) {
          // まだテキストが生成されていない場合は続行
          log.debug("【Step 4-7】[Canvas監視] テキスト生成待機中...");

          // タイムアウトチェック
          if (elapsedTime >= maxWaitTime) {
            clearInterval(monitor);
            reject(
              new Error(
                `【Step 4-7】Geminiの応答がタイムアウトしました（${maxWaitTime / 60000}分）`,
              ),
            );
          }
          return;
        }

        const currentLength = currentEditor.textContent.length;
        log.debug(`【Step 4-7】[Canvas監視] 現在の文字数: ${currentLength}`);

        // 部分的な結果があるかチェック
        if (currentLength > 0) {
          hasPartialContent = true;
        }

        if (currentLength > lastLength) {
          lastLength = currentLength;
          lastChangeTime = Date.now();
        }

        // タイムアウトチェック
        if (elapsedTime >= maxWaitTime) {
          clearInterval(monitor);

          // 部分的な結果がある場合は成功として返す
          if (hasPartialContent) {
            log.warn(
              `【Step 4-7】タイムアウトしましたが、部分的な結果を保存します（${maxWaitTime / 60000}分経過、${currentLength}文字取得済み）`,
            );
            resolve({ success: true, partial: true, timeout: true });
          } else {
            reject(
              new Error(
                `【Step 4-7】Geminiの応答がタイムアウトしました（${maxWaitTime / 60000}分）`,
              ),
            );
          }
          return;
        }

        // UI設定秒数間変化がなければ完了とみなす
        if (Date.now() - lastChangeTime > AI_WAIT_CONFIG.CHECK_INTERVAL) {
          clearInterval(monitor);
          log.debug(
            `【Step 4-7】${AI_WAIT_CONFIG.CHECK_INTERVAL / 1000}秒間テキストの更新がなかったため、応答完了と判断`,
          );
          resolve({ success: true, partial: false, timeout: false });
        }
      }, 2000); // 2秒ごとに監視
    });
  }

  // ========================================
  // Step 4-7-DR: Deep Research待機処理
  // ========================================
  async function waitForDeepResearch(startTime) {
    log.debug("【Step 4-7-DR】Deep Research専用待機処理");

    const MAX_WAIT = AI_WAIT_CONFIG.DEEP_RESEARCH_WAIT; // 設定から取得
    const logDr = (message) => {
      const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(1);
      log.info(`[経過: ${elapsedTime}秒] ${message}`);
    };

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        cleanup();
        reject(
          new Error(
            `Deep Researchが${MAX_WAIT / 60000}分以内に完了しませんでした`,
          ),
        );
      }, MAX_WAIT);

      let loggingInterval, checkInterval;

      const cleanup = () => {
        clearTimeout(timeoutId);
        if (loggingInterval) clearInterval(loggingInterval);
        if (checkInterval) clearInterval(checkInterval);
      };

      const deepResearchFlow = async () => {
        // 【Step DR-1】初期応答の停止ボタン出現を待機
        logDr("初期応答の停止ボタン出現を待機中...");
        while (!findElement([SELECTORS.stopButton])) {
          if (Date.now() - startTime > 30000) {
            throw new Error("30秒以内に初期応答が開始されませんでした");
          }
          await wait(1000);
        }
        logDr("初期応答の停止ボタンが出現しました");

        // 【Step DR-2】初期応答完了を待ち、リサーチ開始ボタンをクリック
        logDr("初期応答の完了を待機中...");
        const initialWaitTime = AI_WAIT_CONFIG.MAX_WAIT; // 通常モードの待機時間を使用
        while (findElement([SELECTORS.stopButton])) {
          if (Date.now() - startTime > initialWaitTime) {
            throw new Error(
              `${initialWaitTime / 60000}分以内に初期応答が完了しませんでした`,
            );
          }
          await wait(1000);
        }

        const researchButton = findElement([SELECTORS.deepResearchButton]);
        if (!researchButton) {
          throw new Error("「リサーチを開始」ボタンが見つかりませんでした");
        }

        researchButton.click();
        logDr("「リサーチを開始」ボタンをクリックしました");
        await wait(2000);

        // 【Step DR-3】本応答の完了を待つ
        logDr("本応答の完了を待機中...");

        loggingInterval = setInterval(() => {
          const btn = findElement([SELECTORS.stopButton]);
          logDr(`[定期チェック] 停止ボタン: ${btn ? "存在" : "消滅"}`);
        }, 10000);

        // 本応答の停止ボタン出現を待つ
        while (!findElement([SELECTORS.stopButton])) {
          await wait(1000);
        }
        logDr("本応答の停止ボタンが出現しました");

        let lastSeenTime = Date.now();

        checkInterval = setInterval(() => {
          if (findElement([SELECTORS.stopButton])) {
            lastSeenTime = Date.now();
          } else {
            if (Date.now() - lastSeenTime > AI_WAIT_CONFIG.CHECK_INTERVAL) {
              logDr(
                `停止ボタンが${AI_WAIT_CONFIG.CHECK_INTERVAL / 1000}秒間表示されません。応答完了とみなします`,
              );
              cleanup();
              resolve({ success: true, partial: false, timeout: false });
            }
          }
        }, 2000);
      };

      deepResearchFlow().catch((err) => {
        cleanup();
        reject(err);
      });
    });
  }

  // ========================================
  // Step 4-8: テキスト取得
  // ========================================
  async function getResponseTextGemini() {
    log.debug("【Step 4-8】テキスト取得開始");
    // Canvas
    const canvasEditor = document.querySelector(SELECTORS.canvasResponse);
    if (canvasEditor && canvasEditor.textContent.trim()) {
      return canvasEditor.textContent.trim();
    }

    // 通常応答
    const responseElements = document.querySelectorAll(
      SELECTORS.normalResponse,
    );
    if (responseElements.length > 0) {
      const latestResponse = responseElements[responseElements.length - 1];
      if (latestResponse) {
        return latestResponse.textContent.trim();
      }
    }

    // フォールバック
    for (const selector of SELECTORS.responseAlt) {
      const element = document.querySelector(selector);
      if (element) {
        return element.textContent.trim();
      }
    }

    throw new Error("Geminiの回答が見つかりません");
  }

  // ========================================
  // 🔄 重複実行防止システム（Claude統一版）
  // ========================================

  // windowレベルの実行状態管理（タブ間共有）
  window.GEMINI_TASK_EXECUTING = window.GEMINI_TASK_EXECUTING || false;
  window.GEMINI_CURRENT_TASK_ID = window.GEMINI_CURRENT_TASK_ID || null;
  window.GEMINI_TASK_START_TIME = window.GEMINI_TASK_START_TIME || null;
  window.GEMINI_LAST_ACTIVITY_TIME = window.GEMINI_LAST_ACTIVITY_TIME || null;

  // ローカル変数（後方互換性のため維持）
  let isExecuting = window.GEMINI_TASK_EXECUTING;
  let currentTaskId = window.GEMINI_CURRENT_TASK_ID;
  let taskStartTime = window.GEMINI_TASK_START_TIME;
  let lastActivityTime = window.GEMINI_LAST_ACTIVITY_TIME;

  // sessionStorageとの同期（永続化とタブ間共有）
  const syncExecutionStateWithStorage = () => {
    try {
      const state = {
        isExecuting: window.GEMINI_TASK_EXECUTING,
        currentTaskId: window.GEMINI_CURRENT_TASK_ID,
        taskStartTime: window.GEMINI_TASK_START_TIME,
        lastActivityTime: window.GEMINI_LAST_ACTIVITY_TIME,
      };
      sessionStorage.setItem("GEMINI_EXECUTION_STATE", JSON.stringify(state));
    } catch (e) {
      log.debug("sessionStorage同期エラー:", e);
    }
  };

  // 実行状態を設定
  const setExecutionState = (executing, taskId = null) => {
    // windowレベルの状態を更新
    window.GEMINI_TASK_EXECUTING = executing;
    window.GEMINI_CURRENT_TASK_ID = executing ? taskId : null;
    window.GEMINI_LAST_ACTIVITY_TIME = Date.now();

    // ローカル変数も更新
    isExecuting = executing;
    currentTaskId = executing ? taskId : null;
    lastActivityTime = Date.now();

    if (executing && taskId) {
      window.GEMINI_TASK_START_TIME = Date.now();
      taskStartTime = Date.now();
      log.info(`タスク実行開始: ${taskId}`);
    } else if (!executing) {
      const duration = window.GEMINI_TASK_START_TIME
        ? Date.now() - window.GEMINI_TASK_START_TIME
        : 0;
      log.info(`タスク実行完了 (${Math.round(duration / 1000)}秒)`);
      window.GEMINI_TASK_START_TIME = null;
      taskStartTime = null;
    }

    // sessionStorageに同期
    syncExecutionStateWithStorage();
  };

  // 実行状態を取得
  const getExecutionStatus = () => {
    // 最新のwindowレベルの状態を返す
    return {
      isExecuting: window.GEMINI_TASK_EXECUTING,
      currentTaskId: window.GEMINI_CURRENT_TASK_ID,
      taskStartTime: window.GEMINI_TASK_START_TIME,
      lastActivityTime: window.GEMINI_LAST_ACTIVITY_TIME,
      executionDuration: window.GEMINI_TASK_START_TIME
        ? Date.now() - window.GEMINI_TASK_START_TIME
        : 0,
    };
  };

  // 重複実行チェック
  async function checkDuplicateExecution(taskId) {
    // 重複実行チェック（グローバル状態を使用）
    const currentStatus = getExecutionStatus();

    // windowレベルの状態を再確認（異なるコンテキストからの実行を検出）
    if (window.GEMINI_TASK_EXECUTING || currentStatus.isExecuting) {
      // タイムアウトチェック（15分間実行状態が続いていたらリセット）
      const timeSinceStart = currentStatus.taskStartTime
        ? Date.now() - currentStatus.taskStartTime
        : 0;
      if (timeSinceStart > 15 * 60 * 1000) {
        log.warn(
          `⏰ タスク ${currentStatus.currentTaskId} は15分以上実行中 - リセット`,
        );
        setExecutionState(false);
        return { canExecute: true };
      } else {
        if (currentStatus.currentTaskId === taskId) {
          log.warn(
            `⚠️ [DUPLICATE-EXECUTION] タスクID ${taskId} は既に実行中です (コンテキスト: ${typeof chrome !== "undefined" && chrome.runtime ? chrome.runtime.id : "unknown"})`,
          );
          return {
            canExecute: false,
            error: "Task already executing",
            details: {
              inProgress: true,
              taskId: taskId,
              executionStatus: currentStatus,
            },
          };
        }

        log.warn(
          `⚠️ [BUSY] 別のタスク（${currentStatus.currentTaskId}）が実行中です。新しいタスク（${taskId}）は拒否されました`,
        );
        log.debug(`実行中タスク情報:`, {
          currentTaskId: currentStatus.currentTaskId,
          duration: Math.round(timeSinceStart / 1000),
          context:
            typeof chrome !== "undefined" && chrome.runtime
              ? chrome.runtime.id
              : "unknown",
        });
        return {
          canExecute: false,
          error: "Another task is in progress",
          details: {
            busyWith: currentStatus.currentTaskId,
            requestedTaskId: taskId,
            executionStatus: currentStatus,
          },
        };
      }
    }

    // 実行状態を設定
    setExecutionState(true, taskId);
    return { canExecute: true };
  }

  // ========================================
  // Step 4-9: タスク実行（拡張版） - RetryManager統合
  // ========================================
  async function executeTask(taskData) {
    log.info("🚀 【Step 4-0】Gemini タスク実行開始", taskData);

    // 🔧 [FIX-LOGCELL] logCellが欠如している場合の復旧ロジック
    if (!taskData?.logCell && taskData?.row && taskData?.cellInfo) {
      // ログセルを推測して復旧
      const inferredLogColumn = "S"; // デフォルトログ列
      const inferredLogCell = `${inferredLogColumn}${taskData.row}`;

      log.error(`🔧 [FIX-LOGCELL] logCellを復旧します:`, {
        originalLogCell: taskData.logCell,
        inferredLogCell: inferredLogCell,
        row: taskData.row,
        taskId: taskData.taskId || taskData.id,
      });

      // taskDataにlogCellを追加
      taskData.logCell = inferredLogCell;
    }

    // taskIdを最初に定義（スコープ全体で利用可能にする）
    const taskId = taskData.taskId || taskData.id || "UNKNOWN_TASK_ID";

    // ========================================
    // Step 4-1: 重複実行チェック
    // ========================================
    log.info("【Step 4-1】重複実行チェック");
    const duplicateCheckResult = await checkDuplicateExecution(taskId);
    if (!duplicateCheckResult.canExecute) {
      return {
        success: false,
        error: duplicateCheckResult.error,
        ...duplicateCheckResult.details,
      };
    }

    try {
      // プロンプトの適切な処理 - オブジェクトの場合は文字列化
      let promptText;
      if (typeof taskData.prompt === "object" && taskData.prompt !== null) {
        // オブジェクトの場合は適切なプロパティを探す
        promptText =
          taskData.prompt.text ||
          taskData.prompt.content ||
          taskData.prompt.prompt ||
          JSON.stringify(taskData.prompt);
      } else {
        promptText = taskData.prompt || "テストメッセージです";
      }

      const modelName = taskData.model || "";
      const featureName = taskData.function || ""; // feature → function に修正

      // 🔍 [DEBUG] タスクデータの詳細確認
      log.debug("📋 [Gemini Debug] TaskData詳細:", {
        model: modelName,
        feature: featureName,
        hasModel: !!modelName,
        hasFeature: !!featureName,
        modelType: typeof modelName,
        featureType: typeof featureName,
        taskDataKeys: taskData ? Object.keys(taskData) : [],
      });

      // 🔍 [DEBUG] セル位置情報を追加（ChatGPT・Claudeと統一）
      if (
        taskData &&
        taskData.cellInfo &&
        taskData.cellInfo.column &&
        taskData.cellInfo.row
      ) {
        const cellPosition = `${taskData.cellInfo.column}${taskData.cellInfo.row}`;
        promptText = `【現在${cellPosition}セルを処理中です】\n\n${promptText}`;
        log.debug(`📍 [Gemini] セル位置情報を追加: ${cellPosition}`);
      } else {
        log.debug("📍 [Gemini] セル位置情報なし:", {
          hasCellInfo: !!(taskData && taskData.cellInfo),
          cellInfo: taskData && taskData.cellInfo,
          taskDataKeys: taskData ? Object.keys(taskData) : [],
        });
      }

      // 【Step 4-1】ページ準備状態チェック
      log.info("【Step 4-1】ページ準備状態チェック");
      await waitForPageReady();

      // 【Step 4-2】テキスト入力（RetryManager内蔵）
      log.info("【Step 4-2】テキスト入力");
      await inputTextGemini(promptText);

      // 【Step 4-3】モデル選択（必要な場合、RetryManager内蔵）
      if (modelName && modelName !== "設定なし") {
        log.info("【Step 4-3】モデル選択:", modelName);
        const modelResult = await selectModel(modelName);
        if (!modelResult.success && !modelResult.skipped) {
          throw new Error(
            `モデル選択失敗: ${modelResult.error?.message || modelResult.error}`,
          );
        }
      }

      // 【Step 4-4】機能選択（必要な場合、RetryManager内蔵）
      if (featureName && featureName !== "設定なし") {
        log.info("【Step 4-4】機能選択:", featureName);
        const featureResult = await selectFeature(featureName);
        if (!featureResult.success && !featureResult.skipped) {
          throw new Error(
            `機能選択失敗: ${featureResult.error?.message || featureResult.error}`,
          );
        }
      }

      // 送信時刻を記録（送信前に定義 - ChatGPT/Claudeと統一）
      const sendTime = new Date();

      // 【Step 4-5】メッセージ送信（RetryManager内蔵）
      log.info("【Step 4-5】メッセージ送信");
      await sendMessageGemini();

      // モデルと機能を取得
      const modelName_current = modelName || "不明";
      const featureName_var = featureName || "通常";

      // background.jsに送信時刻を記録
      if (chrome.runtime && chrome.runtime.sendMessage) {
        // シート名を追加（taskDataから取得、テストモードでは不要）
        const sheetName = taskData.sheetName;
        if (!sheetName) {
          log.warn(
            "⚠️ [Step 4-5] シート名が指定されていません（テストモードの可能性）- 送信時刻記録をスキップ",
          );
          // テストモードの場合はスキップ
          log.debug("【Step 4-5】送信時刻記録スキップ（テストモード）");
        } else {
          const fullLogCell = taskData.logCell?.includes("!")
            ? taskData.logCell
            : `'${sheetName}'!${taskData.logCell}`;

          const messageToSend = {
            type: "recordSendTime",
            taskId: taskId,
            sendTime: sendTime.toISOString(),
            taskInfo: {
              aiType: "Gemini",
              model: modelName_current,
              function: featureName_var,
              // URLは応答完了時に取得するため、ここでは記録しない（Claudeと同じ）
              cellInfo: taskData.cellInfo,
            },
            logCell: fullLogCell, // シート名付きログセル
          };

          // Promise化してタイムアウト処理を追加
          const sendMessageWithTimeout = () => {
            return new Promise((resolve) => {
              const timeout = setTimeout(() => {
                log.warn("⚠️ [Step 4-5] [Gemini] 送信時刻記録タイムアウト");
                resolve(null);
              }, 5000); // 5秒でタイムアウト

              try {
                // 拡張機能のコンテキストが有効か確認
                if (!chrome.runtime?.id) {
                  log.warn(
                    "⚠️ [Step 4-5] [Gemini] 拡張機能のコンテキストが無効です",
                  );
                  clearTimeout(timeout);
                  resolve(null);
                  return;
                }

                chrome.runtime.sendMessage(messageToSend, (response) => {
                  clearTimeout(timeout);
                  // エラーチェックを先に行う
                  if (chrome.runtime.lastError) {
                    // ポートが閉じられたエラーは警告レベルに留める
                    if (
                      chrome.runtime.lastError.message.includes("port closed")
                    ) {
                      log.warn(
                        "⚠️ [Step 4-5] [Gemini] メッセージポートが閉じられました（送信は成功している可能性があります）",
                      );
                    } else {
                      log.warn(
                        "⚠️ [Step 4-5] [Gemini] 送信時刻記録エラー:",
                        chrome.runtime.lastError.message,
                      );
                    }
                    resolve(null);
                  } else if (response) {
                    log.info(
                      "✅ [Step 4-5] [Gemini] 送信時刻記録成功",
                      response,
                    );
                    resolve(response);
                  } else {
                    // レスポンスがnullの場合
                    log.warn(
                      "⚠️ [Step 4-5] [Gemini] 送信時刻記録: レスポンスなし",
                    );
                    resolve(null);
                  }
                });
              } catch (error) {
                clearTimeout(timeout);
                log.error("❌ [Step 4-5] [Gemini] 送信時刻記録失敗:", error);
                resolve(null);
              }
            });
          };

          // 非同期で実行（ブロックしない）
          sendMessageWithTimeout();
        }
      }
      const startTime = Date.now();

      // 【Step 4-7】応答待機（Deep Research判定）
      log.info("【Step 4-7】応答待機開始");
      let responseResult;
      let isPartialResult = false;

      try {
        if (featureName === "Deep Research") {
          log.debug("【Step 4-7】Deep Researchモードで待機");
          responseResult = await waitForDeepResearch(startTime);
        } else {
          responseResult = await waitForResponseGemini();
        }

        // 結果の形式を確認
        if (responseResult && typeof responseResult === "object") {
          isPartialResult = responseResult.partial || false;
          if (responseResult.timeout && responseResult.partial) {
            log.warn(
              `【Step 4-7】⚠️ タイムアウトしましたが、部分的な結果を処理します`,
            );
          }
        }
      } catch (waitError) {
        log.error(`❌ 【Step 4-7】応答待機エラー:`, waitError);
        throw waitError;
      }

      // 【Step 4-8】テキスト取得（GeminiRetryManager統合）
      log.info("【Step 4-8】テキスト取得");
      let content;

      const textRetryManager = new GeminiRetryManager();
      const textResult = await textRetryManager.executeWithRetry(
        async () => {
          return await getResponseTextGemini();
        },
        "Gemini回答テキスト取得",
        { feature: featureName },
      );

      if (textResult.success) {
        content = textResult.result;
        log.info(`✅ 【Step 4-8】テキスト取得成功`);
      } else {
        // 部分的な結果の場合はエラーを許容
        if (isPartialResult) {
          log.warn(
            `⚠️ 【Step 4-8】20回リトライしましたが失敗。部分的な結果として処理します`,
          );
          content = "[タイムアウトによる部分的な応答]";
        } else {
          log.error(
            `❌ 【Step 4-8】20回リトライしましたが、テキスト取得に失敗しました`,
          );
          throw new Error(
            textResult.error ||
              "Geminiの回答が見つかりません（20回リトライ後）",
          );
        }
      }

      // 【Step 4-9】結果オブジェクト作成
      log.info("【Step 4-9】結果オブジェクト作成");

      // 回答取得完了時点でURLを取得（全AI統一）
      const conversationUrl = window.location.href;

      // 全AI統一形式（シンプルなフラット構造）
      const result = {
        success: true,
        response: content,
        model: modelName,
        function: featureName,
        sendTime: sendTime,
        url: conversationUrl,
        cellInfo: taskData.cellInfo,
        partial: isPartialResult,
      };

      // ✅ タスク完了時刻をスプレッドシートに記録（Claude/ChatGPTと統一）
      try {
        // Promise化してエラーハンドリングを改善
        const sendCompletionMessage = () => {
          return new Promise((resolve) => {
            // シート名付きlogCellを準備（taskDataから取得、テストモードでは不要）
            const sheetName = taskData.sheetName;
            if (!sheetName) {
              log.warn(
                "【Step 4-9】⚠️ シート名が指定されていません（テストモードの可能性）- 完了時刻記録をスキップ",
              );
              resolve(null);
              return;
            }

            const timeout = setTimeout(() => {
              log.warn("【Step 4-9】⚠️ recordCompletionTime送信タイムアウト");
              resolve(null);
            }, 5000);

            const fullLogCell = taskData.logCell?.includes("!")
              ? taskData.logCell
              : `'${sheetName}'!${taskData.logCell}`;

            chrome.runtime.sendMessage(
              {
                type: "recordCompletionTime",
                taskId: taskId,
                completionTime: new Date().toISOString(),
                taskInfo: {
                  aiType: "Gemini",
                  model: modelName,
                  function: featureName,
                  url: conversationUrl, // 取得した会話URLを使用
                },
                logCell: fullLogCell, // シート名付きログセル
              },
              (response) => {
                clearTimeout(timeout);
                if (!chrome.runtime.lastError) {
                  log.debug(
                    "【Step 4-9】✅ recordCompletionTime送信完了:",
                    taskId,
                    "URL:",
                    conversationUrl,
                  );
                }
                resolve(response);
              },
            );
          });
        };

        await sendCompletionMessage();
      } catch (error) {
        log.warn("【Step 4-9】⚠️ recordCompletionTime送信エラー:", error);
      }

      // 【修正】タスク完了時のスプレッドシート書き込み確認と通知処理を追加
      // タスク重複実行問題を修正：書き込み成功を確実に確認してから完了通知
      try {
        if (result.success && taskData.cellInfo) {
          log.debug(
            "📊 [Gemini-TaskCompletion] スプレッドシート書き込み成功確認開始",
            {
              taskId: taskData.taskId || taskData.cellInfo,
              cellInfo: taskData.cellInfo,
              hasResponse: !!result.response,
            },
          );

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

            // 完了通知用のリトライ付き送信
            const sendCompletionMessageWithRetry = async (
              message,
              maxRetries = 2,
            ) => {
              for (let attempt = 1; attempt <= maxRetries; attempt++) {
                try {
                  const result = await new Promise((resolve) => {
                    chrome.runtime.sendMessage(message, (response) => {
                      if (chrome.runtime.lastError) {
                        resolve({
                          error: "runtime_error",
                          message: chrome.runtime.lastError.message,
                        });
                      } else {
                        resolve({ success: true, response });
                      }
                    });
                  });

                  if (!result.error) {
                    if (attempt > 1) {
                      log.debug(
                        `✅ [COMPLETION-RETRY] ${attempt}回目で完了通知成功`,
                      );
                    }
                    return result;
                  }

                  if (
                    attempt < maxRetries &&
                    (result.message.includes("message port closed") ||
                      result.message.includes("runtime_error"))
                  ) {
                    log.debug(
                      `⏱️ [COMPLETION-RETRY] ${attempt}回目失敗、再試行します`,
                    );
                    await new Promise((resolve) => setTimeout(resolve, 1000));
                  } else {
                    return result;
                  }
                } catch (error) {
                  if (attempt === maxRetries) {
                    return { error: "exception", message: error.message };
                  }
                  await new Promise((resolve) => setTimeout(resolve, 1000));
                }
              }
            };

            // 非同期で実行（ブロックしない） - recordSendTimeと同じパターン
            // awaitを削除してPromiseハングを回避し、即座にreturn resultを実行
            sendCompletionMessageWithRetry(completionMessage)
              .then((completionResult) => {
                if (completionResult.error) {
                  log.debug(
                    "ℹ️ [Gemini-TaskCompletion] 完了通知エラー（継続処理）:",
                    completionResult.message,
                  );
                } else {
                  log.info(
                    "✅ [Gemini-TaskCompletion] 作業中マーカークリア通知送信完了",
                    {
                      taskId: taskData.taskId || taskData.cellInfo,
                      response: completionResult.response,
                    },
                  );
                }
              })
              .catch((error) => {
                log.warn(
                  "⚠️ [Gemini-TaskCompletion] 完了通知送信エラー:",
                  error.message || error,
                );
              });
          }
        }
      } catch (completionError) {
        log.warn(
          "⚠️ [Gemini-TaskCompletion] 完了処理エラー:",
          completionError.message,
        );
      }

      // 実行状態を解除
      setExecutionState(false);

      log.info("✅ 【Step 4-0】Gemini タスク実行完了");

      // 🔍 [DEBUG-RETURN] executeTask関数が返す結果の詳細ログ
      log.info("🔍 [DEBUG-RETURN] executeTask関数の返却値詳細:", {
        success: result.success,
        hasResponse: !!result.response,
        responseType: typeof result.response,
        responseLength: result.response ? result.response.length : 0,
        responsePreview: result.response
          ? result.response.substring(0, 100) + "..."
          : null,
        hasCellInfo: !!result.cellInfo,
        cellInfo: result.cellInfo,
        model: result.model,
        function: result.function,
        url: result.url,
        partial: result.partial,
        taskId: taskData.taskId || taskData.cellInfo,
        timestamp: new Date().toISOString(),
      });

      return result;
    } catch (error) {
      // エラー時も実行状態を解除
      setExecutionState(false);

      log.error(`❌ 【Step 4-0】Gemini タスク実行エラー:`, error);
      return {
        success: false,
        error: error.message || "タスク実行失敗",
      };
    }
  }

  // ========================================
  // グローバル公開
  // ========================================
  window.GeminiAutomation = {
    executeTask,
    discoverModelsAndFeatures,
    deselectAllFeatures,
    waitForPageReady,
    selectModel,
    selectFeature,
    waitForDeepResearch,
    inputTextGemini,
    sendMessageGemini,
    waitForResponseGemini,
    getResponseTextGemini,
    inputToCanvas,
    inputToNormal,
    utils: {
      log,
      wait,
      findElement,
      findElements,
      getCleanText,
    },
  };

  // ========================================
  // Chrome Runtime メッセージリスナー
  // ========================================
  if (
    typeof chrome !== "undefined" &&
    chrome.runtime &&
    chrome.runtime.onMessage
  ) {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      // ping/pong メッセージへの即座応答（最優先）
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
        });
        return true;
      }

      // テキスト入力欄の存在チェック
      if (request.action === "CHECK_INPUT_FIELD") {
        const selectors = request.selectors || [
          ".ProseMirror",
          ".ql-editor",
          'div[contenteditable="true"]',
          "textarea",
        ];
        let found = false;
        for (const selector of selectors) {
          const element = document.querySelector(selector);
          if (element) {
            found = true;
            break;
          }
        }
        if (!found) {
          log.warn(`⚠️ [Step 4-1] [Gemini] テキスト入力欄が見つかりません`);
        }
        sendResponse({ found: found });
        return true;
      }

      // DISCOVER_FEATURES メッセージの処理
      if (request.type === "DISCOVER_FEATURES") {
        (async () => {
          try {
            const result = await discoverModelsAndFeatures();
            sendResponse({
              success: true,
              result: result,
            });
          } catch (error) {
            log.error(
              `❌ [Step 4-0-3] [Gemini] DISCOVER_FEATURESエラー:`,
              error,
            );
            sendResponse({
              success: false,
              error: error.message,
            });
          }
        })();
        return true; // 非同期レスポンスのために必要
      }

      // executeTask タスクの処理
      if (
        request.action === "executeTask" ||
        request.type === "executeTask" ||
        request.type === "GEMINI_EXECUTE_TASK" ||
        request.type === "EXECUTE_TASK"
      ) {
        const requestId = Math.random().toString(36).substring(2, 8);

        (async () => {
          try {
            if (typeof executeTask === "function") {
              const taskToExecute = request.task || request.taskData;
              try {
                const result = await executeTask(taskToExecute);

                // 🔍 [DEBUG-SEND] sendResponseで送信する内容の詳細ログ
                log.info("🔍 [DEBUG-SEND] sendResponseで送信する内容:", {
                  resultSuccess: result.success,
                  hasResult: !!result,
                  hasResultResponse: !!result.response,
                  resultResponseType: result.response
                    ? typeof result.response
                    : null,
                  resultResponseLength: result.response
                    ? result.response.length
                    : 0,
                  resultResponsePreview: result.response
                    ? result.response.substring(0, 100) + "..."
                    : null,
                  resultCellInfo: result.cellInfo,
                  resultModel: result.model,
                  resultFunction: result.function,
                  resultUrl: result.url,
                  taskId: taskToExecute.taskId || taskToExecute.cellInfo,
                  timestamp: new Date().toISOString(),
                });

                // 全AI統一形式で返す（二重構造を解消）
                sendResponse(result);
              } catch (taskError) {
                log.error(
                  `❌ [Step 4-9] [Gemini] executeTaskエラー [ID:${requestId}]:`,
                  taskError,
                );
                sendResponse({
                  success: false,
                  error: taskError.message || "executeTask failed",
                  stack: taskError.stack,
                });
              }
            } else {
              log.error(
                `❌ [Step 4-9] [Gemini] executeTask関数が未定義 [ID:${requestId}]`,
                {
                  requestId: requestId,
                  availableFunctions: {
                    executeTask: typeof executeTask,
                    findElement: typeof findElement,
                    inputTextGemini: typeof inputTextGemini,
                  },
                  timestamp: new Date().toISOString(),
                },
              );
              sendResponse({
                success: false,
                error: "executeTask not available",
                timestamp: new Date().toISOString(),
              });
            }
          } catch (error) {
            log.error(
              `❌ [Step 4-9] [Gemini] エラー [ID:${requestId}]:`,
              error,
            );
            sendResponse({ success: false, error: error.message });
          }
        })();
        return true; // 非同期レスポンスのために必要
      }

      // その他のメッセージタイプは無視
    });

    window.GEMINI_MESSAGE_LISTENER_READY = true;
  }

  log.info("✅ Gemini Automation 準備完了");

  // ========================================
  // 🚨 Gemini グローバルエラーハンドラー
  // ========================================

  // 🚨 Gemini Overloadedエラー対応システム
  let geminiOverloadedRetryCount = 0;
  const MAX_GEMINI_OVERLOADED_RETRIES = 5;
  const GEMINI_OVERLOADED_RETRY_INTERVALS = [
    60000, 300000, 900000, 1800000, 3600000,
  ]; // 1分、5分、15分、30分、60分

  function handleGeminiOverloadedError() {
    if (geminiOverloadedRetryCount >= MAX_GEMINI_OVERLOADED_RETRIES) {
      log.error(
        "❌ [GEMINI-OVERLOADED-HANDLER] 最大リトライ回数に達しました。手動対応が必要です。",
      );
      return;
    }

    const retryInterval =
      GEMINI_OVERLOADED_RETRY_INTERVALS[geminiOverloadedRetryCount] || 3600000;
    geminiOverloadedRetryCount++;

    // 即座にウィンドウを閉じる
    setTimeout(() => {
      // background scriptにウィンドウリセットを要求
      if (chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime
          .sendMessage({
            action: "RESET_AI_WINDOW",
            aiType: "gemini",
            retryCount: geminiOverloadedRetryCount,
            nextRetryIn: retryInterval,
          })
          .catch((err) => {
            log.error(
              "❌ [GEMINI-OVERLOADED-HANDLER] background scriptへのメッセージ送信失敗:",
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
      // 新しいウィンドウで Gemini を開く
      if (chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({
          action: "OPEN_AI_WINDOW",
          aiType: "gemini",
          retryAttempt: geminiOverloadedRetryCount,
        });
      }
    }, retryInterval);
  }

  // Gemini専用ネットワークエラーハンドラーを追加
  if (
    typeof window !== "undefined" &&
    window.location &&
    window.location.href.includes("gemini.google.com")
  ) {
    // グローバルエラーハンドラー
    window.addEventListener("error", (e) => {
      const errorMessage = e.message || e.error?.message || "";
      const errorName = e.error?.name || "";

      // 🔍 Gemini Overloadedエラー検出
      const isOverloadedError =
        errorMessage.includes("Overloaded") ||
        errorMessage.includes("overloaded") ||
        errorMessage.includes("quota exceeded") ||
        errorMessage.includes("too many requests") ||
        errorMessage.includes("rate limit") ||
        (e.reason && String(e.reason).includes("Overloaded"));

      if (isOverloadedError) {
        log.error("🚨 [GEMINI-OVERLOADED-ERROR]", {
          message: errorMessage,
          name: errorName,
          type: "OVERLOADED_ERROR",
          filename: e.filename,
          lineno: e.lineno,
          timestamp: new Date().toISOString(),
          aiType: "gemini",
        });

        // 即座にウィンドウリセット・リトライを開始
        handleGeminiOverloadedError();
        return;
      }

      // 🔍 ネットワークエラー検出 (Claude・ChatGPTと同じロジック)
      const isNetworkError =
        errorMessage.includes("timeout") ||
        errorMessage.includes("network") ||
        errorMessage.includes("fetch") ||
        errorMessage.includes("Failed to fetch") ||
        errorName.includes("NetworkError");

      if (isNetworkError) {
        log.error("🌐 [Gemini-GLOBAL-NETWORK-ERROR]", {
          message: errorMessage,
          name: errorName,
          type: "NETWORK_ERROR",
          filename: e.filename,
          lineno: e.lineno,
          timestamp: new Date().toISOString(),
          aiType: "gemini",
        });

        // エラー統計記録 (将来のGeminiRetryManager用)
        try {
          if (!window.geminiErrorHistory) {
            window.geminiErrorHistory = [];
          }
          window.geminiErrorHistory.push({
            type: "NETWORK_ERROR",
            message: errorMessage,
            timestamp: Date.now(),
            level: "global_error",
          });
        } catch (retryError) {
          // エラー記録失敗は無視
        }
      } else {
        log.error("🚨 [Gemini-GLOBAL-ERROR]", e.message);
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
        log.error("🌐 [Gemini-UNHANDLED-NETWORK-ERROR]", {
          message: errorMessage,
          name: errorName,
          type: "NETWORK_ERROR",
          timestamp: new Date().toISOString(),
          aiType: "gemini",
        });

        // 🔄 エラー統計を記録
        try {
          if (!window.geminiErrorHistory) {
            window.geminiErrorHistory = [];
          }
          window.geminiErrorHistory.push({
            type: "NETWORK_ERROR",
            message: errorMessage,
            timestamp: Date.now(),
            level: "unhandledrejection",
          });

          // 🔄 アクティブなタスクがある場合のリトライ準備 (将来実装用)
          if (window.currentGeminiTask) {
            log.warn(
              "🔄 [Gemini-RETRY-TRIGGER] アクティブタスク検出 - リトライ実行準備",
            );
            // Gemini用リトライマネージャーは将来実装
            // 現在は統計記録のみ
          }
        } catch (retryError) {
          log.error(
            "❌ [Gemini-RETRY-MANAGER] エラー記録処理エラー:",
            retryError,
          );
        }
      } else {
        log.error("🚨 [Gemini-UNHANDLED-PROMISE]", e.reason);
      }
    });
  }
})();
