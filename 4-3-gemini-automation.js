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
 * @fileoverview Gemini Automation V3 - 統合版
 *
 * 【ステップ構成】
 * Step 4-3-0: 初期化（UI_SELECTORS読み込み）
 * Step 4-3-1: ページ準備状態チェック
 * Step 4-3-2: テキスト入力
 * Step 4-3-3: モデル選択（条件付き） + 選択後確認
 * Step 4-3-4: 機能選択（条件付き） + 選択後確認
 * Step 4-3-5: メッセージ送信
 * Step 4-3-6: 応答待機（通常/Canvas/Deep Researchモード）
 * Step 4-3-7: テキスト取得
 *
 * @version 3.1.0
 * @updated 2024-12-20 Step 4-3-X番号体系導入、詳細エラーログ強化
 */

(async function () {
  "use strict";

  console.log(`🚀 Gemini Automation V3 初期化`);

  // 初期化マーカー設定
  window.GEMINI_SCRIPT_LOADED = true;
  window.GEMINI_SCRIPT_INIT_TIME = Date.now();

  // 🔧 [FIXED] Geminiメッセージング問題修正完了のお知らせ
  console.log("🔧 [FIXED] Geminiメッセージング問題修正済み:", {
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
  const isValidGeminiURL = currentURL.includes("gemini.google.com");
  const isExtensionPage = currentURL.startsWith("chrome-extension://");

  // 🔍 Content Script実行環境の詳細ログ
  console.warn(`🔍 [Gemini-Content Script] 実行コンテキスト詳細分析:`, {
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
      isValidGeminiURL: isValidGeminiURL,
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
  // ログ管理システムの初期化（内部実装 - 実際に動作）
  // ========================================
  window.geminiLogFileManager = {
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
        const storageKey = `gemini_logs_${new Date().toISOString().split("T")[0]}`;
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
        log.warn("[Gemini-Log] localStorage保存エラー:", e);
      }
    },

    logStep: function (message, data) {
      const log = this._addLog("INFO", message, data);
      log.debug(`🔄 [Gemini-Step] ${message}`, data || "");
      return log;
    },

    logError: function (message, error) {
      const log = this._addLog("ERROR", message, null, error);
      log.error(`❌ [Gemini-Error] ${message}`, error);
      return log;
    },

    logSuccess: function (message, data) {
      const log = this._addLog("SUCCESS", message, data);
      log.debug(`✅ [Gemini-Success] ${message}`, data || "");
      return log;
    },

    logTaskStart: function (taskInfo) {
      const log = this._addLog("TASK_START", "タスク開始", taskInfo);
      log.debug(`🚀 [Gemini-Task] タスク開始:`, taskInfo);
      return log;
    },

    logTaskComplete: function (taskInfo, result) {
      const log = this._addLog("TASK_COMPLETE", "タスク完了", {
        taskInfo,
        result,
      });
      log.debug(`🏁 [Gemini-Task] タスク完了:`, { taskInfo, result });
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
        a.download = `gemini_logs_${new Date().toISOString().split("T")[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
        log.debug(`💾 [Gemini-Log] ログファイルをダウンロード`);
      } catch (e) {
        log.error(`❌ [Gemini-Log] ファイル保存エラー:`, e);
      }
    },

    saveErrorImmediately: function (error) {
      const log = this._addLog("CRITICAL_ERROR", "緊急エラー", null, error);
      log.error(`🚨 [Gemini-Critical] 緊急エラー:`, error);
      this._saveToStorage(log);
      return log;
    },

    saveIntermediate: function (data) {
      const log = this._addLog("INTERMEDIATE", "中間データ", data);
      log.debug(`📊 [Gemini-Intermediate] 中間データ:`, data);
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
      log.debug(`🗑️ [Gemini-Log] ログをクリア`);
    },
  };

  const GeminiLogManager = {
    // LogFileManagerのプロキシとして動作
    get logFileManager() {
      return (
        window.geminiLogFileManager || {
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
      log.debug(`📝 [ログ] ${step}: ${message}`);
    },

    // エラーログを記録（即座にファイル保存）
    async logError(step, error, context = {}) {
      this.logFileManager.logError(step, error, context);
      log.error(`❌ [エラーログ] ${step}:`, error);
      // エラーは即座に保存
      await this.logFileManager.saveErrorImmediately(error, {
        step,
        ...context,
      });
    },

    // 成功ログを記録
    logSuccess(step, message, result = {}) {
      this.logFileManager.logSuccess(step, message, result);
      log.debug(`✅ [成功ログ] ${step}: ${message}`);
    },

    // タスク開始を記録
    startTask(taskData) {
      this.logFileManager.logTaskStart(taskData);
      log.debug(`🚀 [タスク開始]`, taskData);
    },

    // タスク完了を記録
    completeTask(result) {
      this.logFileManager.logTaskComplete(result);
      log.debug(`🏁 [タスク完了]`, result);
    },

    // ログをファイルに保存（最終保存）
    async saveToFile() {
      try {
        const filePath = await this.logFileManager.saveToFile();
        log.debug(`✅ [GeminiLogManager] 最終ログを保存しました: ${filePath}`);
        return filePath;
      } catch (error) {
        log.error("[GeminiLogManager] ログ保存エラー:", error);
      }
    },

    // ログをクリア
    clear() {
      if (this.logFileManager.clearCurrentLogs) {
        this.logFileManager.clearCurrentLogs();
      }
    },
  };

  // ========================================
  // Step 4-3-0-3: 統一GeminiRetryManager クラス定義
  // エラー分類とリトライ戦略を統合した統一システム
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
        AUTH_ERROR: { immediate_escalation: "HEAVY_RESET", maxRetries: 5 },
        API_LIMIT_ERROR: {
          immediate_escalation: "HEAVY_RESET",
          maxRetries: 10,
        },
        SESSION_EXPIRED_ERROR: {
          immediate_escalation: "HEAVY_RESET",
          maxRetries: 5,
        },
        GOOGLE_AUTH_ERROR: {
          immediate_escalation: "HEAVY_RESET",
          maxRetries: 5,
        },
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

    // Step 4-3-0-3: Gemini特有のエラー分類器（詳細ログ付き）
    classifyError(error, context = {}) {
      const errorMessage = error?.message || error?.toString() || "";
      const errorName = error?.name || "";

      log.debug(`🔍 [Step 4-3-0-3] エラー分類開始:`, {
        errorMessage,
        errorName,
        context,
        timestamp: new Date().toISOString(),
        url: window.location.href,
        userAgent: navigator.userAgent,
      });

      let errorType = "GENERAL_ERROR";

      // Gemini特有エラーの検出
      if (
        errorMessage.includes("Google Auth") ||
        errorMessage.includes("Authentication failed") ||
        errorMessage.includes("認証に失敗") ||
        errorMessage.includes("ログインして") ||
        errorMessage.includes("Please sign in")
      ) {
        errorType = "GOOGLE_AUTH_ERROR";
        log.debug(`🔐 [Step 4-3-0-3] Google認証エラー検出:`, {
          errorType,
          errorMessage,
          immediateEscalation: "HEAVY_RESET",
          reason: "Google認証切れのため新規ウィンドウでログイン必要",
        });
        return errorType;
      }

      if (
        errorMessage.includes("API limit") ||
        errorMessage.includes("quota exceeded") ||
        errorMessage.includes("制限を超えました") ||
        errorMessage.includes("Rate limit")
      ) {
        errorType = "API_LIMIT_ERROR";
        log.debug(`⚠️ [Step 4-3-0-3] API制限エラー検出:`, {
          errorType,
          errorMessage,
          immediateEscalation: "HEAVY_RESET",
          maxRetries: 10,
          reason: "Gemini API制限により長期待機が必要",
        });
        return errorType;
      }

      if (
        errorMessage.includes("session expired") ||
        errorMessage.includes("セッションが期限切れ") ||
        errorMessage.includes("Session invalid") ||
        errorMessage.includes("セッション無効")
      ) {
        return "SESSION_EXPIRED_ERROR";
      }

      if (
        errorMessage.includes("authentication") ||
        errorMessage.includes("認証") ||
        errorMessage.includes("Auth error")
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
        actionName = "Gemini処理",
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

          log.debug(`🔄 [Step 4-3-Retry] ${actionName} 試行 ${retryCount}/20`);

          // アクション実行
          lastResult = await action();

          if (isSuccess(lastResult)) {
            this.metrics.successfulAttempts++;
            this.consecutiveErrorCount = 0; // エラーカウントリセット
            log.debug(
              `✅ [Step 4-3-Retry] ${actionName} 成功（${retryCount}回目）`,
            );
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

          log.error(
            `❌ [Step 4-3-Retry] ${actionName} エラー (${retryCount}回目):`,
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
      log.error(`❌ [Step 4-3-Retry] ${actionName} 全リトライ失敗`);
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

      log.debug(
        `🔄 [Step 4-3-Escalation] ${level} 実行開始 (${retryCount}回目)`,
      );

      switch (level) {
        case "LIGHTWEIGHT":
          // 同一ウィンドウ内での再試行（何もしない、次の試行へ）
          return null;

        case "MODERATE":
          // ページリフレッシュ
          log.debug(`🔄 [Step 4-3-Escalation] ページリフレッシュ実行`);
          location.reload();
          return { success: false, needsWait: true }; // リロード後は待機が必要

        case "HEAVY_RESET":
          // 新規ウィンドウ作成
          log.debug(`🔄 [Step 4-3-Escalation] 新規ウィンドウ作成`);
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
            aiType: "Gemini",
            enableDeepResearch: taskData.enableDeepResearch || false,
            specialMode: taskData.specialMode || null,
            error: context.errorType || "ESCALATION_ERROR",
            errorMessage:
              context.errorMessage || "エスカレーションによるリトライ",
            retryReason: context.retryReason || "gemini_escalation_retry",
            closeCurrentWindow: true,
          },
          (response) => {
            if (chrome.runtime.lastError) {
              log.warn("⚠️ [FIXED] Geminiリトライ通信エラー（処理は継続）:", {
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
              log.debug("✅ [FIXED] Geminiリトライ通信成功:", {
                response: response,
                taskId: taskData.taskId,
                timestamp: new Date().toISOString(),
              });
              resolve(response);
            } else {
              log.debug("ℹ️ [FIXED] Gemini予期しないレスポンス:", {
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
          `⏳ [Step 4-3-Wait] ${level} - ${delayMinutes}分後にリトライします...`,
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

  // 統一された待機時間設定を取得（Claude/ChatGPTと同じ方式）
  const AI_WAIT_CONFIG = window.AI_WAIT_CONFIG || {
    DEEP_RESEARCH_WAIT: 2400000, // 40分（Geminiでは未使用）
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
  // ステップ0: UIセレクタ（step1-setup.js統一管理版）
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
      "【Step 4-3-0-1】✅ UI Selectors loaded from step1-setup.js",
      "success",
    );
    return window.UI_SELECTORS;
  };

  // セレクタを読み込み
  await loadSelectors();

  // Gemini用セレクタを取得
  const SELECTORS = {
    textInput: window.UI_SELECTORS.Gemini?.INPUT || [],
    sendButton: window.UI_SELECTORS.Gemini?.SEND_BUTTON || [],
    stopButton: window.UI_SELECTORS.Gemini?.STOP_BUTTON || [],
    modelMenu: window.UI_SELECTORS.Gemini?.MODEL_MENU || [],
    functionMenu: window.UI_SELECTORS.Gemini?.FUNCTION_MENU || [],
    response: window.UI_SELECTORS.Gemini?.RESPONSE || [],
    canvas: window.UI_SELECTORS.Gemini?.CANVAS || [],
  };

  // ========================================
  // ユーティリティ関数
  // ========================================
  const log = (message, type = "info") => {
    const styles = {
      info: "color: #03A9F4;",
      success: "color: #4CAF50; font-weight: bold;",
      warn: "color: #FFC107;",
      error: "color: #F44336; font-weight: bold;",
      step: "color: #9C27B0; font-weight: bold; font-size: 1.1em; border-bottom: 1px solid #9C27B0;",
    };
    log.debug(
      `%c[${new Date().toLocaleTimeString("ja-JP")}] ${message}`,
      styles[type] || "",
    );
  };

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const findElement = (selectorArray, parent = document) => {
    for (const selector of selectorArray) {
      const element = parent.querySelector(selector);
      if (element) return element;
    }
    return null;
  };

  const findElements = (selectorArray, parent = document) => {
    for (const selector of selectorArray) {
      const elements = parent.querySelectorAll(selector);
      if (elements.length > 0) return Array.from(elements);
    }
    return [];
  };

  // ========================================
  // プロンプト除外機能（Gemini用）
  // ========================================

  /**
   * DOM構造によるユーザーメッセージ除外（Gemini用）
   * @param {Element} container - 検索対象のコンテナ要素
   * @returns {Element} フィルタ済みコンテナ
   */
  const excludeUserMessages = (container) => {
    if (!container) return container;

    try {
      const clone = container.cloneNode(true);

      // Gemini用のユーザーメッセージセレクタ
      const userMessageSelectors = [
        ".user-query-bubble-with-background",
        ".query-text",
        ".query-text-line",
        'span[class*="user-query"]',
      ];

      userMessageSelectors.forEach((selector) => {
        const userMessages = clone.querySelectorAll(selector);
        userMessages.forEach((msg) => {
          // ユーザーメッセージの最上位要素を特定して削除
          const parentToRemove =
            msg.closest(".user-query-bubble-with-background") ||
            msg.closest('span[class*="user-query"]') ||
            msg;
          if (parentToRemove && parentToRemove.parentNode) {
            parentToRemove.parentNode.removeChild(parentToRemove);
          }
        });
      });

      return clone;
    } catch (error) {
      log.warn("[Gemini] ユーザーメッセージ除外中にエラーが発生:", error);
      return container;
    }
  };

  /**
   * テキスト内容によるプロンプト除外（Gemini用）
   * @param {string} fullText - 完全テキスト
   * @param {string} sentPrompt - 送信されたプロンプト（オプション）
   * @returns {string} プロンプト除外後のテキスト
   */
  const removePromptFromText = (fullText, sentPrompt = null) => {
    if (!fullText || typeof fullText !== "string") return fullText;

    try {
      // 使用するプロンプト（パラメータまたはグローバル変数から）
      const promptToRemove = sentPrompt || window.lastSentPrompt;

      if (!promptToRemove) return fullText;

      // 1. 完全一致除去
      if (fullText.includes(promptToRemove)) {
        const cleanedText = fullText.replace(promptToRemove, "").trim();
        log("【Step 4-3-除外】完全一致でプロンプトを除外しました", "success");
        return cleanedText;
      }

      // 2. 特徴的なプロンプトパターンで除外
      const promptPatterns = [
        "【現在.+?セルを処理中です】",
        "# 命令書",
        "あなたは.*?です",
        "以下の.*?について",
        ".*?を.*?してください",
        ".*?について.*?教えて",
        "Chrome拡張機能の.*?で.*?問題",
        "質問：.*?の解決方法",
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
          "【Step 4-3-除外】パターンマッチングでプロンプトを除外しました",
          "success",
        );
      }

      // 3. 行ベースの除外（プロンプトキーワードを含む行を除去）
      const lines = cleanedText.split("\n");
      const filteredLines = lines.filter((line) => {
        const trimmedLine = line.trim();
        if (!trimmedLine) return false;

        // プロンプトの一部と思われる行を除去
        const promptKeywords = [
          "命令書",
          "セルを処理中",
          "について教えて",
          "してください",
          "以下のプロンプトを",
          "質問：",
          "技術スタック：",
          "制約条件：",
        ];
        return !promptKeywords.some((keyword) => trimmedLine.includes(keyword));
      });

      return filteredLines.join("\n").trim();
    } catch (error) {
      log.warn("[Gemini] プロンプト除去中にエラーが発生:", error);
      return fullText;
    }
  };

  const getCleanText = (element) => {
    if (!element) return "";
    try {
      // ユーザーメッセージを除外
      const filteredElement = excludeUserMessages(element);

      // 不要な要素を削除
      filteredElement
        .querySelectorAll(
          "mat-icon, .mat-ripple, .mat-mdc-button-persistent-ripple, .mat-focus-indicator, .mat-mdc-button-touch-target, .cdk-visually-hidden",
        )
        .forEach((el) => el.remove());

      const rawText = filteredElement.textContent.trim().replace(/\s+/g, " ");

      // プロンプト除去を適用
      return removePromptFromText(rawText);
    } catch (e) {
      const rawText = element.textContent.trim().replace(/\s+/g, " ");
      return removePromptFromText(rawText);
    }
  };

  // 要素の可視性チェック
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

  // ========================================
  // ステップ0: ページ準備確認
  // ========================================
  const waitForPageReady = async () => {
    log("\n【Step 4-3-0】ページ準備確認", "step");
    const maxAttempts = 30; // 最大30秒待機
    let attempts = 0;

    while (attempts < maxAttempts) {
      attempts++;
      log(`[ステップ0] 準備確認 (${attempts}/${maxAttempts})`, "info");

      // テキスト入力欄の存在をチェック
      const inputElement = findElement(SELECTORS.textInput);

      if (inputElement && isElementInteractable(inputElement)) {
        log("✅ [ステップ0] ページ準備完了", "success");
        return true;
      }

      await wait(1000);
    }

    log("❌ [ステップ0] ページ準備タイムアウト", "error");
    throw new Error("ページが準備できませんでした");
  };

  // ========================================
  // ステップ0-1: 要素取得リトライ機能
  // ========================================
  const getElementWithWait = async (
    selectors,
    description = "",
    timeout = 10000,
  ) => {
    log(`[ステップ0-1] ${description}を取得中...`, "info");
    const startTime = Date.now();
    let attempts = 0;

    while (Date.now() - startTime < timeout) {
      attempts++;
      const element = findElement(selectors);

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

      await wait(500);
    }

    log(`❌ [ステップ0-1] ${description}取得タイムアウト`, "error");
    return null;
  };

  // Canvas形式の構造化されたテキストを取得
  const getStructuredCanvasContent = (element) => {
    if (!element) return "";

    try {
      // まずユーザーメッセージを除外
      const filteredElement = excludeUserMessages(element);

      let result = [];

      const processNode = (node, depth = 0) => {
        if (node.nodeType === Node.TEXT_NODE) {
          const text = node.textContent.trim();
          if (text) {
            result.push(text);
          }
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          const tagName = node.tagName.toLowerCase();

          // 見出し処理
          if (tagName.match(/^h[1-4]$/)) {
            const level = parseInt(tagName.charAt(1));
            const prefix = "#".repeat(level);
            const text = node.textContent.trim();
            if (text) {
              result.push("\n" + prefix + " " + text + "\n");
            }
          }
          // リスト処理
          else if (tagName === "ul" || tagName === "ol") {
            result.push("\n");
            const items = node.querySelectorAll("li");
            items.forEach((item, index) => {
              const prefix = tagName === "ol" ? `${index + 1}. ` : "• ";
              const text = item.textContent.trim();
              if (text) {
                result.push(prefix + text);
              }
            });
            result.push("\n");
          }
          // 段落処理
          else if (tagName === "p") {
            const text = node.textContent.trim();
            if (text) {
              result.push("\n" + text + "\n");
            }
          }
          // 強調処理
          else if (tagName === "strong" || tagName === "b") {
            const text = node.textContent.trim();
            if (text) {
              result.push("**" + text + "**");
            }
          }
          // イタリック処理
          else if (tagName === "em" || tagName === "i") {
            const text = node.textContent.trim();
            if (text) {
              result.push("*" + text + "*");
            }
          }
          // その他の要素は子要素を処理
          else if (!["script", "style", "li"].includes(tagName)) {
            for (const child of node.childNodes) {
              processNode(child, depth + 1);
            }
          }
        }
      };

      // ルート要素から処理開始
      for (const child of filteredElement.childNodes) {
        processNode(child);
      }

      // 結果を結合して返す
      const structuredText = result
        .join(" ")
        .replace(/\s+/g, " ")
        .replace(/\n\s+/g, "\n")
        .trim();

      // 構造化テキストが取得できない場合は通常のテキストを返す
      const rawText =
        structuredText || filteredElement.textContent?.trim() || "";

      // プロンプト除去を適用
      return removePromptFromText(rawText);
    } catch (error) {
      log(`⚠️ Canvas構造化テキスト取得エラー: ${error.message}`, "warn");
      // エラー時はフォールバック
      const rawText = element.textContent?.trim() || "";
      return removePromptFromText(rawText);
    }
  };

  // ========================================
  // ステップ1-1: モデルと機能の探索
  // ========================================
  async function discoverModelsAndFeatures() {
    log("【Step 4-3-1-1】モデルと機能の探索", "step");

    // モデル探索
    try {
      const menuButton = findElement([
        ".gds-mode-switch-button.logo-pill-btn",
        'button[class*="logo-pill-btn"]',
        "button.gds-mode-switch-button",
        "button.logo-pill-btn",
      ]);

      if (menuButton) {
        await openGeminiModelMenu(menuButton);

        const menuContainer = findElement([
          ".cdk-overlay-pane .menu-inner-container",
          '.cdk-overlay-pane mat-action-list[data-test-id="mobile-nested-mode-menu"]',
          ".mat-mdc-menu-panel",
        ]);

        if (menuContainer) {
          const modelButtons = findElements(
            [
              "button.bard-mode-list-button",
              'button[role="menuitemradio"]',
              "button[mat-menu-item]",
            ],
            menuContainer,
          );

          window.availableModels = modelButtons
            .map((btn) => {
              const text = getCleanText(
                findElement(
                  [".mode-desc", ".gds-label-m-alt", ".title-and-description"],
                  btn,
                ),
              );
              return text || getCleanText(btn);
            })
            .filter(Boolean);

          log(
            `【Step 4-3-1-1】モデル探索完了: ${window.availableModels.length}個のモデルを発見`,
            "success",
          );
        }
      }
    } catch (e) {
      log("【Step 4-3-1-1】モデル探索エラー: " + e.message, "error");
    } finally {
      // メニューを閉じる
      await closeGeminiMenu();
    }

    // 機能探索
    try {
      const featureNames = new Set();

      // メインツールバーの機能
      findElements(["toolbox-drawer-item > button .label"]).forEach((label) => {
        const text = label.textContent.trim();
        if (text && text !== "その他") {
          featureNames.add(text);
        }
      });

      // その他メニューの機能
      const moreButton = findElement(['button[aria-label="その他"]']);
      if (moreButton) {
        moreButton.click();
        await wait(1500); // メニュー表示の待機時間を増やす

        findElements([
          ".cdk-overlay-pane .toolbox-drawer-menu-item button .label",
        ]).forEach((label) => {
          const text = label.textContent
            .trim()
            .replace(/\s*arrow_drop_down\s*/, "");
          if (text) {
            featureNames.add(text);
          }
        });
      }

      window.availableFeatures = Array.from(featureNames).filter(Boolean);
      log(
        "【Step 4-3-1-2】機能探索完了: ${window.availableFeatures.length}個の機能を発見",
        "success",
      );
    } catch (e) {
      log("【Step 4-3-1-2】機能探索エラー: " + e.message, "error");
    } finally {
      // メニューを閉じる
      await closeGeminiMenu();
    }

    return {
      models: window.availableModels,
      features: window.availableFeatures,
    };
  }

  // ================================================================
  // コア実行関数
  // ================================================================
  async function executeCore(modelName, featureName, promptText) {
    // ========================================
    // ステップ0: ページ準備確認
    // ========================================
    await waitForPageReady();

    // ========================================
    // ステップ1: ページ初期化チェック
    // ========================================
    log("【Step 4-3-1】ページ初期化チェック", "step");

    // 基本要素の存在確認
    const criticalElements = {
      テキスト入力欄: SELECTORS.textInput,
      送信ボタン: SELECTORS.sendButton,
    };

    for (const [name, selectors] of Object.entries(criticalElements)) {
      const element = findElement(selectors);
      if (!element) {
        log(`【Step 4-3-1-0】⚠️ ${name}が見つかりません`, "warn");
      } else {
        log(`【Step 4-3-1-0】✅ ${name}を確認`, "success");
      }
    }

    const testResults = [];
    const isCanvasMode =
      featureName && featureName.toLowerCase().includes("canvas");
    const isDeepResearchMode =
      featureName &&
      (featureName.toLowerCase().includes("deep research") ||
        featureName.toLowerCase().includes("deep") ||
        featureName === "DeepReserch" ||
        featureName === "DeepResearch");

    const logStep = async (stepName, stepFunction) => {
      try {
        log(stepName, "step");
        const result = await stepFunction();
        testResults.push({
          step: stepName,
          status: "✅ 成功",
          details: result || "完了",
        });
        return result;
      } catch (error) {
        testResults.push({
          step: stepName,
          status: "❌ 失敗",
          details: error.message,
        });
        log(`エラー: ${error.message}`, "error");
        throw error;
      }
    };

    try {
      // ========================================
      // ステップ2: モデル選択（条件付き）
      // ========================================
      await logStep("【Step 4-3-2】モデル選択", async () => {
        // セル情報を取得（統合ログ用）
        const cellInfo =
          taskData.cellReference ||
          taskData.cellInfo ||
          taskData.cell ||
          "不明";
        log(`【Step 4-3-2-1】選択するモデル: '${modelName}'`, "info");

        // モデルを選択（常に実行、Autoでもデフォルトモデルを明示的に選択）
        const useDefault =
          !modelName ||
          modelName === "default" ||
          (typeof modelName === "string" && modelName.toLowerCase() === "auto");

        if (useDefault) {
          log("【Step 4-3-2-2】デフォルトモデル（Gemini）を使用", "info");
        } else if (modelName) {
          const menuButton = findElement([
            ".gds-mode-switch-button.logo-pill-btn",
            'button[class*="logo-pill-btn"]',
            "button.gds-mode-switch-button",
          ]);

          if (menuButton) {
            menuButton.click();
            await wait(1500);

            const modelOptions = findElements([
              "button.bard-mode-list-button",
              'button[role="menuitemradio"]',
            ]);

            const modelButtonToClick = modelOptions.find((btn) => {
              const text = getCleanText(btn);
              return text.toLowerCase().includes(modelName.toLowerCase());
            });

            if (modelButtonToClick) {
              modelButtonToClick.click();
              await wait(2500); // モデル選択後の待機時間を増やす

              // モデル選択確認（テストコードの検証ロジックを追加）
              const currentModelDisplay = findElement([
                ".logo-pill-label-container",
                ".gds-mode-switch-button .mdc-button__label div",
                ".gds-mode-switch-button .logo-pill-label",
              ]);

              if (currentModelDisplay) {
                const displayText = getCleanText(currentModelDisplay);
                // "2.5 Pro" -> "Pro" のような部分一致にも対応
                const normalizedModelName = modelName.replace("2.5 ", "");

                if (displayText.includes(normalizedModelName)) {
                  log(
                    `【Step 4-3-2-3】✅ モデル選択確認成功: 「${displayText}」が選択されています`,
                    "success",
                  );
                } else {
                  log(
                    `【Step 4-3-2-3】⚠️ モデル表示が期待値と異なります。期待値: ${modelName}, 実際: ${displayText}`,
                    "warn",
                  );
                }
              }
            } else {
              log(
                `【Step 4-3-2-3】モデル "${modelName}" が見つからないため、デフォルトを使用`,
                "warn",
              );
            }
          }
        }

        // 統合ログ: モデル選択完了
        // 選択後確認で表示されているモデルを取得
        let displayedModel = "";
        try {
          if (window.ModelInfoExtractor) {
            displayedModel =
              window.ModelInfoExtractor.extract("Gemini") || "取得失敗";
          } else {
            displayedModel = "取得不可";
          }
        } catch (error) {
          displayedModel = "取得失敗";
        }
        console.log(
          `✅ [セル ${cellInfo}] モデル選択完了: 選択=${modelName || "デフォルト"} → 表示=${displayedModel}`,
        );
        return `モデル選択完了: ${modelName || "デフォルト"}`;
      });

      // ========================================
      // ステップ3: 機能選択（条件付き）
      // ========================================
      await logStep("【Step 4-3-3】機能選択", async () => {
        // 統合ログ: 機能選択開始
        console.log(`🔧 [セル ${cellInfo}] 機能選択開始: ${featureName}`);
        log(
          `【Step 4-3-3-1】選択する機能: '${featureName || "設定なし"}'`,
          "info",
        );

        // 機能を選択（null/undefined/'none'/'通常'以外の場合）
        if (featureName && featureName !== "none" && featureName !== "通常") {
          let featureButton = null;

          // 1. まずメインの機能ボタンから探す（テストコードと同じロジック）
          const allButtons = findElements(["toolbox-drawer-item > button"]);
          log(
            `【Step 4-3-3-2】🔍 メインボタン数: ${allButtons.length}`,
            "info",
          );

          featureButton = Array.from(allButtons).find((btn) => {
            const labelElement = findElement([".label"], btn);
            if (labelElement) {
              const text = getCleanText(labelElement);
              return (
                text.toLowerCase() === featureName.toLowerCase() ||
                text.toLowerCase().includes(featureName.toLowerCase())
              );
            }
            return false;
          });

          // 2. メインにない場合は「その他」メニューを開く
          if (!featureButton) {
            const moreButton = findElement(['button[aria-label="その他"]']);
            if (moreButton) {
              moreButton.click();
              await wait(1500); // 待機時間を増やす

              // サブメニュー内から機能を探す
              const menuButtons = findElements([
                ".cdk-overlay-pane .toolbox-drawer-menu-item button",
              ]);
              featureButton = Array.from(menuButtons).find((btn) => {
                const labelElement = findElement([".label"], btn);
                if (labelElement) {
                  const text = getCleanText(labelElement);
                  return (
                    text.toLowerCase() === featureName.toLowerCase() ||
                    text.toLowerCase().includes(featureName.toLowerCase())
                  );
                }
                return false;
              });
            }
          }

          if (featureButton) {
            featureButton.click();
            await wait(2000); // 選択後の待機時間を増やす
            log(
              `【Step 4-3-3-3】✅ 機能「${featureName}」を選択しました`,
              "success",
            );

            // 機能選択確認（テストコードの検証ロジックを追加）
            const selectedButton = findElement([
              ".toolbox-drawer-item-button button.is-selected",
              ".toolbox-drawer-button.has-selected-item",
            ]);

            if (selectedButton) {
              const selectedLabel = findElement([".label"], selectedButton);
              const selectedText = selectedLabel
                ? getCleanText(selectedLabel)
                : "";

              if (
                selectedText.toLowerCase() === featureName.toLowerCase() ||
                selectedText.toLowerCase().includes(featureName.toLowerCase())
              ) {
                log(
                  `【Step 4-3-3-3】✅ 機能選択確認成功: 「${selectedText}」が有効化されています`,
                  "success",
                );
              } else {
                log(
                  `【Step 4-3-3-3】⚠️ 機能選択確認: 期待された機能「${featureName}」と異なる機能「${selectedText}」が選択されています`,
                  "warn",
                );
              }
            } else {
              log(`【Step 4-3-3-3】⚠️ 機能の選択状態が確認できません`, "warn");
            }
          } else {
            log(
              `【Step 4-3-3-3】機能 "${featureName}" が見つからないため、スキップ`,
              "warn",
            );
          }
        }

        // オーバーレイを閉じる
        const overlay = document.querySelector(
          ".cdk-overlay-backdrop.cdk-overlay-backdrop-showing",
        );
        if (overlay) overlay.click();

        // 統合ログ: 機能選択完了
        // 選択後確認で表示されている機能を取得
        let displayedFunction = "";
        try {
          if (window.FunctionInfoExtractor) {
            displayedFunction =
              window.FunctionInfoExtractor.extract("Gemini") || "未選択";
          } else {
            displayedFunction = "取得不可";
          }
        } catch (error) {
          displayedFunction = "取得失敗";
        }
        console.log(
          `✅ [セル ${cellInfo}] 機能選択完了: 選択=${featureName || "設定なし"} → 表示=${displayedFunction}`,
        );
        return `機能選択完了: ${featureName || "設定なし"}`;
      });

      // ========================================
      // ステップ4: テキスト入力
      // ========================================
      await logStep("【Step 4-3-4】テキスト入力", async () => {
        const editor = await getElementWithWait(
          [".ql-editor"],
          "テキスト入力欄",
          10000,
        );
        if (!editor)
          throw new Error("テキスト入力欄 (.ql-editor) が見つかりません。");

        editor.textContent = promptText;
        if (editor.classList.contains("ql-blank")) {
          editor.classList.remove("ql-blank");
        }
        editor.dispatchEvent(new Event("input", { bubbles: true }));
        editor.dispatchEvent(new Event("change", { bubbles: true }));

        return `プロンプトを入力しました（${promptText.length}文字）`;
      });

      // ========================================
      // ステップ5: メッセージ送信（再試行対応）
      // ========================================
      await logStep("【Step 4-3-5】メッセージ送信（再試行対応）", async () => {
        // 送信ボタンを5回まで再試行
        let sendSuccess = false;
        let sendAttempts = 0;
        const maxSendAttempts = 5;

        while (!sendSuccess && sendAttempts < maxSendAttempts) {
          sendAttempts++;
          log(
            `【Step 4-3-5-${sendAttempts}】送信試行 ${sendAttempts}/${maxSendAttempts}`,
            "step",
          );

          const sendButton = findElement([
            "button.send-button.submit:not(.stop)",
            'button[aria-label="プロンプトを送信"]:not(.stop)',
          ]);

          if (!sendButton) {
            if (sendAttempts === maxSendAttempts) {
              throw new Error(
                "送信ボタンが見つからないか、送信不可能な状態です",
              );
            }
            log(
              `【Step 4-3-5-${sendAttempts}】送信ボタンが見つかりません。2秒後に再試行...`,
              "warning",
            );
            await wait(2000);
            continue;
          }

          sendButton.click();
          log(
            `【Step 4-3-5-${sendAttempts}】送信ボタンをクリックしました（試行${sendAttempts}）`,
            "success",
          );
          await sleep(1000);

          // 送信後に停止ボタンが表示されるか、5秒待機
          let stopButtonAppeared = false;

          for (let i = 0; i < 5; i++) {
            const stopButton = findElement([
              "button.stop-button, button.send-button.stop",
              'button[aria-label="ストリーミングを停止"]',
            ]);
            if (stopButton) {
              stopButtonAppeared = true;
              log(
                `【Step 4-3-5-${sendAttempts}】停止ボタンが表示されました - 送信成功`,
                "success",
              );
              // プロンプトプレビューを保存（統合ログ用）
              const promptPreview =
                text.substring(0, 10) + (text.length > 10 ? "..." : "");
              break;
            }
            await sleep(1000);
          }

          if (stopButtonAppeared) {
            sendSuccess = true;
            break;
          } else {
            log(
              `【Step 4-3-5-${sendAttempts}】送信反応が確認できません。再試行します...`,
              "warning",
            );
            await wait(2000);
          }
        }

        if (!sendSuccess) {
          throw new Error(
            `${maxSendAttempts}回試行しても送信が成功しませんでした`,
          );
        }

        // 送信時刻を記録（SpreadsheetLogger用）
        log(
          `【Step 4-3-5-記録】🔍 送信時刻記録開始 - AIHandler: ${!!window.AIHandler}, recordSendTimestamp: ${!!window.AIHandler?.recordSendTimestamp}, currentAITaskInfo: ${!!window.currentAITaskInfo}`,
          "info",
        );
        if (window.AIHandler && window.AIHandler.recordSendTimestamp) {
          try {
            log(
              `【Step 4-3-5-記録】📝 送信時刻記録実行開始 - タスクID: ${window.currentAITaskInfo?.taskId}`,
              "info",
            );
            await window.AIHandler.recordSendTimestamp("Gemini");
            log(`【Step 4-3-5-記録】✅ 送信時刻記録成功`, "success");
          } catch (error) {
            log(
              `【Step 4-3-5-記録】❌ 送信時刻記録エラー: ${error.message}`,
              "error",
            );
          }
        } else {
          log(
            `【Step 4-3-5-記録】⚠️ AIHandler または recordSendTimestamp が利用できません`,
            "warning",
          );
        }

        return "メッセージを送信しました。";
      });

      // ========================================
      // ステップ4: 応答待機
      // ========================================
      const responseText = await logStep(
        "【Step 4-3-4】応答待機",
        () =>
          new Promise(async (resolve, reject) => {
            // Deep Researchモードの判定（executeCoreで定義済みの変数を使用）
            log.debug(`🔍 [機能判定] Gemini機能チェック:`, {
              featureName: featureName,
              isDeepResearchMode: isDeepResearchMode,
              isCanvasMode: isCanvasMode,
            });

            log.debug(
              `🎯 [機能判定] Gemini特別モード判定結果: ${isDeepResearchMode ? "Deep Research" : isCanvasMode ? "Canvas" : "通常"} (機能: "${featureName}")`,
            );

            log(
              `【Step 4-3-4-0】待機モード: ${isDeepResearchMode ? "🔬 Deep Research" : isCanvasMode ? "🎨 Canvas" : "💬 通常"}`,
              "info",
            );

            if (isDeepResearchMode) {
              // Deep Researchモード: 特別な処理フロー
              const MAX_WAIT = 40 * 60 * 1000; // 40分
              const startTime = Date.now();

              const logDr = (message, type = "info") => {
                const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(
                  1,
                );
                log(`[経過: ${elapsedTime}秒] ${message}`, type);
              };

              logDr("【Step 4-3-4-0】Deep Researchモードで応答を監視します。");

              // 全体のタイムアウト設定
              const timeoutId = setTimeout(() => {
                reject(
                  new Error(
                    `Deep Researchの応答が${MAX_WAIT / 60000}分以内に完了しませんでした。`,
                  ),
                );
              }, MAX_WAIT);

              try {
                // ステップ1: 初期応答の停止ボタンが出現するまで待機
                logDr("【Step 4-3-4-1】初期応答の開始を待機中...");
                while (!findElement(["button.send-button.stop"])) {
                  if (Date.now() - startTime > 30000) {
                    throw new Error(
                      "30秒以内に初期応答が開始されませんでした。",
                    );
                  }
                  await wait(1000);
                }
                logDr("【Step 4-3-4-1】初期応答が開始されました。", "success");

                // ステップ2: 初期応答が完了して「リサーチを開始」ボタンが出現するまで待機
                logDr("【Step 4-3-4-2】初期応答の完了を待機中...");
                while (findElement(["button.send-button.stop"])) {
                  if (Date.now() - startTime > 2 * 60 * 1000) {
                    throw new Error("2分以内に初期応答が完了しませんでした。");
                  }
                  await wait(1000);
                }

                // 「リサーチを開始」ボタンをクリック
                const researchButton = findElement([
                  'button[data-test-id="confirm-button"]',
                ]);
                if (!researchButton) {
                  throw new Error(
                    "「リサーチを開始」ボタンが見つかりませんでした。",
                  );
                }
                researchButton.click();
                logDr(
                  "【Step 4-3-4-2】「リサーチを開始」ボタンをクリックしました。",
                  "success",
                );
                await wait(2000);

                // ステップ3: 本応答の完了を待つ
                logDr("【Step 4-3-4-3】本応答の完了を待機中...");

                // 定期的な状態チェック
                const loggingInterval = setInterval(() => {
                  const btn = findElement(["button.send-button.stop"]);
                  logDr(
                    `【Step 4-3-4-3】[定期チェック] 回答停止ボタンは${btn ? "✅ 存在します" : "❌ 存在しません"}。`,
                  );
                }, 10000);

                // 本応答の停止ボタンが出現するまで待つ
                while (!findElement(["button.send-button.stop"])) {
                  await wait(1000);
                }
                logDr("【Step 4-3-4-3】本応答の停止ボタンが出現しました。");

                // 停止ボタンが10秒間消えたら完了とみなす
                let lastSeenTime = Date.now();
                const checkInterval = setInterval(() => {
                  if (findElement(["button.send-button.stop"])) {
                    lastSeenTime = Date.now();
                  } else if (Date.now() - lastSeenTime > 10000) {
                    clearInterval(checkInterval);
                    clearInterval(loggingInterval);
                    clearTimeout(timeoutId);
                    logDr(
                      "【Step 4-3-4-3完了】Deep Researchの応答が完了しました。",
                      "success",
                    );
                    resolve("Deep Researchの応答が完了しました。");
                  }
                }, 2000);
              } catch (error) {
                clearTimeout(timeoutId);
                reject(error);
              }
            } else if (isCanvasMode) {
              // Canvasモード: 30秒初期待機 + テキスト変化監視
              log("【Step 4-3-4-1】Canvasモード: 初期待機30秒...");
              await wait(30000); // 統一: 30秒
              log(
                "【Step 4-3-4-2】Canvasモード: テキスト生成の監視を開始します。",
              );

              let lastLength = -1;
              let lastChangeTime = Date.now();

              const monitor = setInterval(() => {
                const canvasEditor = findElement([".ProseMirror"]);
                if (!canvasEditor) return;

                const currentLength = canvasEditor.textContent.length;
                log(`【Step 4-3-4-2】[監視中] 現在の文字数: ${currentLength}`);

                if (currentLength > lastLength) {
                  lastLength = currentLength;
                  lastChangeTime = Date.now();
                }

                // 10秒間変化がなければ完了とみなす
                if (Date.now() - lastChangeTime > 10000) {
                  clearInterval(monitor);
                  log(
                    "【Step 4-3-4-2】10秒間テキストの更新がなかったため、処理を完了します。",
                    "success",
                  );
                  resolve("Canvasの応答が安定しました。");
                }
              }, 2000);
            } else {
              // 通常モード: 停止ボタンが消えるまで待機
              log("【Step 4-3-4-1】通常モード: 初期待機30秒...");
              await wait(30000); // 統一: 30秒

              let waitTime = 0;
              const maxWait = 300000; // 統一: 5分

              const checker = setInterval(() => {
                if (!findElement(["button.send-button.stop", "button.stop"])) {
                  clearInterval(checker);
                  resolve("応答が完了しました（停止ボタンが消えました）。");
                  return;
                }

                if (waitTime >= maxWait) {
                  clearInterval(checker);
                  reject(new Error("応答が5分以内に完了しませんでした。"));
                  return;
                }

                log(
                  `【Step 4-3-4-2】[待機中] 応答生成を待っています... (${waitTime / 1000}秒)`,
                );
                waitTime += 2000;
              }, 2000);
            }
          }),
      );

      // ========================================
      // ステップ7: テキスト取得（ui-selectorsを使用）
      // ========================================
      await logStep("【Step 4-3-7】テキスト取得", async () => {
        // 統合ログ: テキスト取得開始
        console.log(`📥 [セル ${cellInfo}] 回答取得開始...`);
        let text = "";

        // 方法1: Canvas/拡張応答を実際のDOM要素で判定して優先的に取得
        const canvasSelectors = [
          '.ProseMirror[contenteditable="true"][translate="no"]', // Canvasエディタの正確なセレクタ
          'div[contenteditable="true"][translate="no"].ProseMirror',
          "#extended-response-markdown-content .ProseMirror",
          "#extended-response-message-content .ProseMirror",
          ".immersive-editor .ProseMirror",
          '.ProseMirror[contenteditable="true"]',
          ".ProseMirror",
        ];

        // Canvas/拡張応答のチェック
        for (const selector of canvasSelectors) {
          const canvasElement = findElement([selector]);
          if (canvasElement) {
            log(
              "🚫 【Step 4-3-7-1】プロンプト除外機能を適用してテキスト取得（Canvas応答）",
              "info",
            );
            text = getStructuredCanvasContent(canvasElement);
            if (text && text.length > 10) {
              log(
                "✅ 【Step 4-3-7-2】プロンプト除外完了 - 純粋なAI応答を取得",
                "success",
              );
              log(
                `【Step 4-3-7-1】Canvas/拡張応答取得成功 (${selector}): ${text.length}文字`,
                "success",
              );
              break;
            }
          }
        }

        // 方法2: 通常の応答メッセージを取得
        if (!text) {
          log("【Step 4-3-7-2】通常テキスト取得試行", "info");

          // 通常テキストのセレクタ
          const normalSelectors = [
            ".model-response-text .markdown.markdown-main-panel", // 最も具体的なセレクタ
            ".model-response-text .markdown",
            ".markdown.markdown-main-panel",
            ".model-response-text",
            ".conversation-turn .markdown",
            'div[class*="model-response"] .markdown',
          ];

          for (const selector of normalSelectors) {
            const responseElements = findElements([selector]);
            if (responseElements.length > 0) {
              const latestResponse =
                responseElements[responseElements.length - 1];
              log(
                "🚫 【Step 4-3-7-3】プロンプト除外機能を適用してテキスト取得（通常応答）",
                "info",
              );
              text = getCleanText(latestResponse);

              if (text && text.length > 10) {
                log(
                  "✅ 【Step 4-3-7-4】プロンプト除外完了 - 純粋なAI応答を取得",
                  "success",
                );
                log(
                  `【Step 4-3-7-2】通常テキスト取得成功 (${selector}): ${text.length}文字`,
                  "success",
                );
                break;
              }
            }
          }
        }

        // 方法3: フォールバック - より汎用的なセレクタで探す
        if (!text) {
          log("【Step 4-3-7-3】フォールバックセレクタで取得試行", "info");
          const fallbackSelectors = [
            ".model-response-text",
            'div[class*="model-response"]',
            ".message-content",
            'div[data-message-role="model"]',
            'div[class*="message"][class*="assistant"]',
          ];

          for (const selector of fallbackSelectors) {
            const elements = findElements([selector]);
            if (elements.length > 0) {
              const lastElement = elements[elements.length - 1];
              log(
                "🚫 【Step 4-3-7-5】プロンプト除外機能を適用してテキスト取得（フォールバック）",
                "info",
              );
              text = getCleanText(lastElement);
              if (text && text.length > 10) {
                log(
                  "✅ 【Step 4-3-7-6】プロンプト除外完了 - 純粋なAI応答を取得",
                  "success",
                );
                log(
                  `【Step 4-3-7-3】フォールバック取得成功 (${selector}): ${text.length}文字`,
                  "success",
                );
                break;
              }
            }
          }
        }

        if (!text) {
          throw new Error("応答テキストが見つかりません。");
        }

        log(`【Step 4-3-7-完了】最終的に取得: ${text.length}文字`, "success");
        // レスポンスプレビューを保存（統合ログ用）
        const responsePreview =
          text.substring(0, 50) + (text.length > 50 ? "..." : "");
        log(
          `【Step 4-3-7-完了】最初の100文字: ${text.substring(0, 100)}...`,
          "info",
        );

        // 結果を返す
        return text;
      });

      // 現在表示されているモデルと機能を取得（選択後確認）
      let displayedModel = "";
      let displayedFunction = "";

      try {
        // ModelInfoExtractorを使用
        if (window.ModelInfoExtractor) {
          displayedModel = window.ModelInfoExtractor.extract("Gemini") || "";
          log(
            `【Step 4-3-確認-1】📊 選択後確認 - 実際のモデル: "${displayedModel}"`,
            "info",
          );
        } else {
          log(
            "【Step 4-3-確認-1】⚠️ ModelInfoExtractorが利用できません",
            "warn",
          );
        }

        // FunctionInfoExtractorを使用
        if (window.FunctionInfoExtractor) {
          displayedFunction =
            window.FunctionInfoExtractor.extract("Gemini") || "";
          log(
            `【Step 4-3-確認-2】📊 選択後確認 - 実際の機能: "${displayedFunction}"`,
            "info",
          );
        } else {
          log(
            "【Step 4-3-確認-2】⚠️ FunctionInfoExtractorが利用できません",
            "warn",
          );
        }
      } catch (error) {
        log(
          `【Step 4-3-確認】⚠️ モデル/機能情報取得エラー: ${error.message}`,
          "warn",
        );
      }

      // 最終的な成功レスポンス
      return {
        success: true,
        response: testResults[testResults.length - 1]?.details || "",
        testResults: testResults,
        displayedModel: displayedModel,
        displayedFunction: displayedFunction,
      };
    } catch (error) {
      log("【エラー】実行中にエラーが発生しました: " + error.message, "error");
      return {
        success: false,
        error: error.message,
        testResults: testResults,
      };
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
   * 🔧 Geminiモデルメニューを開く
   * @description 本番executeTask内の行223-224のコードをそのまま関数化
   * @param {Element} menuButton - メニューボタン要素
   * @returns {Promise<boolean>} メニュー開放成功フラグ
   */
  async function openGeminiModelMenu(menuButton) {
    if (!menuButton) {
      log.error("[Gemini-openModelMenu] モデルボタンが見つかりません");
      return false;
    }

    try {
      menuButton.click();
      await wait(1500);

      // メニュー出現確認
      const menuItems = document.querySelectorAll(
        '[role="menuitem"], [role="option"], mat-option',
      );
      if (menuItems.length > 0) {
        log.debug("[Gemini-openModelMenu] ✅ モデルメニュー開放成功");
        return true;
      } else {
        log.warn("[Gemini-openModelMenu] ⚠️ メニュー開放したがDOM確認できず");
        return false;
      }
    } catch (error) {
      log.error("[Gemini-openModelMenu] ❌ エラー:", error);
      return false;
    }
  }

  /**
   * 🔧 Gemini機能メニューを開く（スキップ）
   * @description Geminiでは明示的な機能メニューが少ないためスキップ
   * @param {Element} functionButton - 機能メニューボタン要素
   * @returns {Promise<boolean>} 常にfalse（機能メニューなし）
   */
  async function openGeminiFunctionMenu(functionButton) {
    log.debug("[Gemini-openFunctionMenu] Geminiでは機能メニューをスキップ");
    return false; // 機能メニューなし
  }

  /**
   * 🔧 Geminiメニューを閉じる
   * @description 本番executeTask内の行252のコードをそのまま関数化（オーバーレイクリック）
   * @returns {Promise<void>}
   */
  window.closeGeminiMenu = async function closeGeminiMenu() {
    const overlay = document.querySelector(
      ".cdk-overlay-backdrop.cdk-overlay-backdrop-showing",
    );
    if (overlay) overlay.click();
    await wait(500);
  };

  /*
    ┌─────────────────────────────────────────────────────┐
    │                【基本操作関数】                        │
    │        Geminiでの基本的なUI操作を関数化              │
    └─────────────────────────────────────────────────────┘
    */

  /**
   * ✏️ Geminiテキスト入力処理
   * @description GeminiのcontentEditable要素にHTMLとしてテキストを入力
   * @param {string} text - 入力するテキスト
   * @returns {Promise<Element>} 入力要素
   * @throws {Error} テキスト入力欄が見つからない場合
   */
  async function inputTextGemini(text) {
    const inputSelectors = [
      '.ql-editor[contenteditable="true"]',
      '[data-placeholder*="Gemini"]',
      'div[contenteditable="true"]',
    ];

    let inputElement = null;
    for (const selector of inputSelectors) {
      inputElement = document.querySelector(selector);
      if (inputElement) break;
    }

    if (!inputElement) throw new Error("テキスト入力欄が見つかりません");

    inputElement.focus();
    await wait(100);

    // GeminiのRichTextEditor形式で入力
    inputElement.innerHTML = `<p>${text}</p>`;
    await wait(500);

    return inputElement;
  }

  /**
   * 📤 Geminiメッセージ送信処理
   * @description Geminiの送信ボタンをクリックしてメッセージを送信
   * @returns {Promise<boolean>} 送信成功フラグ
   * @throws {Error} 送信ボタンが見つからない場合
   */
  async function sendMessageGemini() {
    const sendSelectors = [
      'button[aria-label="送信"]:not([disabled])',
      'button[aria-label*="Send"]:not([disabled])',
      ".send-button:not([disabled])",
    ];

    let sendButton = null;
    for (const selector of sendSelectors) {
      sendButton = document.querySelector(selector);
      if (sendButton) break;
    }

    if (!sendButton) throw new Error("送信ボタンが見つかりません");

    sendButton.click();
    await wait(1000);

    return true;
  }

  /**
   * ⏳ Geminiレスポンス待機処理
   * @description Geminiのレスポンス生成完了まで待機（ローディングインジケータの消失を監視）
   * @returns {Promise<boolean>} 待機完了フラグ
   * @throws {Error} タイムアウト（2分）の場合
   */
  async function waitForResponseGemini() {
    const maxWaitTime = 600000; // 10分（通常処理に合わせて調整）
    const checkInterval = 1000;
    let elapsedTime = 0;

    while (elapsedTime < maxWaitTime) {
      // Geminiの実行中インジケータをチェック
      const loadingIndicators = document.querySelectorAll(
        [
          ".loading-indicator",
          '[aria-label*="thinking"]',
          '[aria-label*="generating"]',
        ].join(","),
      );

      if (loadingIndicators.length === 0) {
        // ローディングインジケータがない = レスポンス完了
        await wait(2000);
        return true;
      }

      await wait(checkInterval);
      elapsedTime += checkInterval;
    }

    throw new Error("レスポンス待機タイムアウト");
  }

  /**
   * 📥 Geminiレスポンステキスト取得処理
   * @description Geminiの最新の回答を取得（プロンプト除外機能付き）
   * @returns {Promise<string>} レスポンステキスト
   * @throws {Error} Geminiの回答が見つからない場合
   */
  async function getResponseTextGemini() {
    const responseSelectors = [
      "[data-response-index]:last-child",
      ".model-response:last-child",
      '[role="presentation"]:last-child',
    ];

    let responseElement = null;
    for (const selector of responseSelectors) {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        responseElement = elements[elements.length - 1];
        break;
      }
    }

    if (!responseElement) {
      throw new Error("Geminiの回答が見つかりません");
    }

    // プロンプト除外機能を適用
    const responseText = getCleanText(responseElement);
    return responseText;
  }

  /*
    ┌─────────────────────────────────────────────────────┐
    │                【選択操作関数】                        │
    │        モデルや機能の選択処理を関数化                 │
    └─────────────────────────────────────────────────────┘
    */

  /**
   * 🎯 Geminiモデル選択処理
   * @description 指定されたモデル名のモデルを選択
   * @param {string} modelName - 選択するモデル名（例: "Gemini-1.5-Pro", "Gemini-1.5-Flash"）
   * @returns {Promise<boolean>} 選択成功フラグ
   * @throws {Error} モデルが見つからない場合
   */
  async function selectModelGemini(modelName) {
    const menuButton = findElement([
      'button[aria-label*="モデル"]',
      "button.gds-mode-switch-button",
      "button.logo-pill-btn",
    ]);

    if (!menuButton) throw new Error("モデルボタンが見つかりません");

    await openGeminiModelMenu(menuButton);

    // モデル選択
    const modelOptions = document.querySelectorAll(
      '.cdk-overlay-pane [role="menuitem"], .cdk-overlay-pane .model-option',
    );
    for (const option of modelOptions) {
      if (option.textContent?.includes(modelName)) {
        option.click();
        await wait(1000);
        await closeGeminiMenu();
        return true;
      }
    }

    throw new Error(`モデル '${modelName}' が見つかりません`);
  }

  /**
   * 🎯 Gemini機能選択処理
   * @description Geminiでは機能選択は主にプロンプト内で制御する方式
   * @param {string} functionName - 指定する機能名（プロンプト内で活用）
   * @returns {Promise<boolean>} 選択成功フラグ
   * @note Geminiでは明示的な機能メニューが少ないため、プロンプト内で機能を指定
   */
  async function selectFunctionGemini(functionName) {
    // Geminiでは明示的な機能メニューが少ないため、
    // プロンプト内で機能を指定する方式が主流
    log.debug(`Gemini機能選択: ${functionName} (プロンプト内で制御推奨)`);
    return true;
  }

  // ================================================================
  // メインエントリポイント: executeTask
  // ================================================================
  async function executeTask(taskData) {
    log.debug("🚀 Gemini タスク実行開始", taskData);

    // ログ記録開始
    GeminiLogManager.startTask(taskData);

    try {
      // まず利用可能なモデルと機能を探索
      if (
        window.availableModels.length === 0 ||
        window.availableFeatures.length === 0
      ) {
        await discoverModelsAndFeatures();
      }

      // タスクデータから情報を取得（機能名マッピング処理あり）
      const modelName = taskData.model; // そのまま（変換しない）
      let featureName = taskData.function;
      let promptText =
        taskData.prompt || taskData.text || "桃太郎を2000文字で解説して";

      // セル情報をプロンプトに追加（column-processor.js形式）
      if (
        taskData.cellInfo &&
        taskData.cellInfo.column &&
        taskData.cellInfo.row
      ) {
        const cellPosition = `${taskData.cellInfo.column}${taskData.cellInfo.row}`;
        promptText = `【現在${cellPosition}セルを処理中です】\n\n${promptText}`;
        log(`【初期化】📍 セル情報をプロンプトに追加: ${cellPosition}`, "info");
      }

      // 機能名マッピング（スプレッドシート値 → Gemini UI表記）
      const featureMapping = {
        DeepReserch: "Deep Research",
        DeepResearch: "Deep Research",
        "Deep Research": "Deep Research",
      };

      const mappedFeatureName = featureMapping[featureName] || featureName;
      featureName = mappedFeatureName;

      log.debug(
        `🔄 [機能名マッピング] Gemini: "${taskData.function}" → "${featureName}"`,
      );

      // モデル名と機能名を解決
      let resolvedModel = modelName;
      let resolvedFeature = featureName;

      // モデル名の解決（番号または名前マッチング）
      if (typeof modelName === "number") {
        resolvedModel = window.availableModels[modelName - 1] || "default";
      } else if (
        modelName &&
        modelName !== "" &&
        modelName !== "default" &&
        (typeof modelName !== "string" || modelName.toLowerCase() !== "auto")
      ) {
        // 部分一致で探す
        const found = window.availableModels.find((m) =>
          m.toLowerCase().includes(modelName.toLowerCase()),
        );
        if (found) {
          resolvedModel = found;
        }
      }

      // 機能名の解決（番号または名前マッチング）
      if (typeof featureName === "number") {
        resolvedFeature = window.availableFeatures[featureName - 1] || "none";
      } else if (
        featureName &&
        featureName !== "" &&
        featureName !== "none" &&
        featureName !== "通常"
      ) {
        // 部分一致で探す
        const found = window.availableFeatures.find((f) =>
          f.toLowerCase().includes(featureName.toLowerCase()),
        );
        if (found) {
          resolvedFeature = found;
        }
      }

      log(
        `【初期化】実行パラメータ: モデル="${resolvedModel}", 機能="${resolvedFeature}", プロンプト="${promptText.substring(0, 50)}..."`,
        "info",
      );

      // コア実行
      const result = await executeCore(
        resolvedModel,
        resolvedFeature,
        promptText,
      );

      // セル情報を取得（統合ログ用）
      const cellInfo =
        taskData.cellReference || taskData.cellInfo || taskData.cell || "不明";

      // 統合ログ: すべての情報を1つのログで出力
      const promptPreview =
        promptText.substring(0, 10) + (promptText.length > 10 ? "..." : "");
      const responsePreview = result.response
        ? result.response.substring(0, 50) +
          (result.response.length > 50 ? "..." : "")
        : "取得失敗";
      console.log(`🎯 [セル ${cellInfo}] タスク完了`, {
        モデル: {
          選択: resolvedModel || "未選択",
          表示: result.displayedModel || "取得失敗",
        },
        機能: {
          選択: resolvedFeature || "未選択",
          表示: result.displayedFunction || "取得失敗",
        },
        送信: promptPreview,
        回答: responsePreview,
      });

      log.debug("✅ Gemini タスク実行完了", result);

      // タスク完了をログに記録
      GeminiLogManager.completeTask(result);
      if (result.success && result.response) {
        GeminiLogManager.logStep("Step7-Complete", "タスク正常完了", {
          responseLength: result.response.length,
          model: resolvedModel,
          feature: resolvedFeature,
        });
      }

      return result;
    } catch (error) {
      log.error("❌ Gemini タスク実行エラー:", error);

      const result = {
        success: false,
        error: error.message,
      };

      // エラーをログに記録
      GeminiLogManager.logError("Task-Error", error, {
        taskData,
        errorMessage: error.message,
        errorStack: error.stack,
        errorName: error.name,
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        url: window.location.href,
      });
      GeminiLogManager.completeTask(result);

      return result;
    }
  }

  // ================================================================
  // グローバル公開
  // ================================================================
  window.GeminiAutomation = {
    executeTask,
    executeCore,
    discoverModelsAndFeatures,

    // ユーティリティも公開
    utils: {
      log,
      wait,
      findElement,
      findElements,
      getCleanText,
    },

    // 状態も公開
    get availableModels() {
      return window.availableModels;
    },
    get availableFeatures() {
      return window.availableFeatures;
    },
  };

  log.debug("✅ Gemini Automation 準備完了");
  log.debug(
    '使用方法: GeminiAutomation.executeTask({ model: "Pro", function: "Canvas", prompt: "..." })',
  );

  // デバッグ: グローバル公開の確認
  if (typeof window.GeminiAutomation !== "undefined") {
    log.debug("✅ window.GeminiAutomation が正常に公開されました");
    log.debug("利用可能なメソッド:", Object.keys(window.GeminiAutomation));
  } else {
    log.error("❌ window.GeminiAutomation の公開に失敗しました");
  }
})();

/*
┌─────────────────────────────────────────────────────┐
│                【使用例】                              │
└─────────────────────────────────────────────────────┘

// 基本的な使用の流れ
import {
    selectModelGemini,
    inputTextGemini,
    sendMessageGemini,
    waitForResponseGemini,
    getResponseTextGemini
} from './gemini-automation.js';

async function chatWithGemini() {
    try {
        // 1. モデル選択
        await selectModelGemini('Gemini-1.5-Pro');

        // 2. テキスト入力（GeminiのRichTextEditor形式）
        await inputTextGemini('こんにちは！機械学習のベストプラクティスを教えて');

        // 3. 送信
        await sendMessageGemini();

        // 4. レスポンス待機
        await waitForResponseGemini();

        // 5. 結果取得
        const response = await getResponseTextGemini();
        log.debug('Gemini回答:', response);

        return response;
    } catch (error) {
        log.error('Gemini操作エラー:', error);
        throw error;
    }
}

*/

// ========================================
// ウィンドウ終了時のログ保存処理
// ========================================
window.addEventListener("beforeunload", async (event) => {
  log.debug("🔄 [GeminiAutomation] ウィンドウ終了検知 - ログ保存開始");

  try {
    const fileName = await GeminiLogManager.saveToFile();
    if (fileName) {
      log.debug(`✅ [GeminiAutomation] ログ保存完了: ${fileName}`);
    }
  } catch (error) {
    log.error("[GeminiAutomation] ログ保存エラー:", error);
  }
});

window.GeminiLogManager = GeminiLogManager;

// ========================================
// 【エクスポート】検出システム用関数一覧
// ========================================
// Gemini自動化関数はwindowオブジェクトに定義
// エクスポートする関数なし（内部実装のみ）
// コンテンツスクリプトではexport文を使用できないため、コメントアウト
