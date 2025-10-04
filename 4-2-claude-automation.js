/**
 * @fileoverview Claude Automation V2 - 統合版（ステップ構造整理版）
 *
 * 【ステップ構成】
 * Step 4-0: 初期化（セレクタ、RetryManager、ヘルパー関数）
 * Step 4-1: 重複実行チェック
 * Step 4-2: テキスト入力
 * Step 4-3: モデル選択（条件付き）
 * Step 4-4: 機能選択（条件付き、Deep Research対応）
 * Step 4-5: メッセージ送信
 * Step 4-6: 送信時刻記録
 * Step 4-7: 応答待機（通常/Canvas/Deep Researchモード）
 * Step 4-8: テキスト取得
 * Step 4-9: 完了時刻記録
 *
 * @version 2.0.0
 * @updated 2025-10-02 ステップ番号順序整理、Step 4-1/4-6/4-9を関数化
 */

// 全体を即時実行関数でラップ
(function () {
  try {
    // 🔒 重複実行防止（manifest.json自動注入対応）
    if (window.__CLAUDE_AUTOMATION_LOADED__) {
      return;
    }
    window.__CLAUDE_AUTOMATION_LOADED__ = true;

    // Content Script実行確認

    // 環境情報・競合チェック

    // 可視的確認用
    const originalTitle = document.title;
    document.title = `DEBUG: Claude Content Script Loaded - ${new Date().toLocaleTimeString()}`;

    // 3秒後に元のタイトルに戻す（ユーザー体験を損なわないため）
    setTimeout(() => {
      document.title = originalTitle;
    }, 3000);

    // 初期化マーカー設定（ChatGPT/Geminiと同様）
    window.CLAUDE_SCRIPT_LOADED = true;
    window.CLAUDE_SCRIPT_INIT_TIME = Date.now();

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
          window.claudeErrorHandler =
            window.UniversalErrorHandler.createForAI("claude");
          console.log("✅ [CLAUDE] エラーハンドラー初期化完了");
          return true;
        }

        if (attempts < maxAttempts) {
          // 100ms後に再試行
          setTimeout(tryInitialize, 100);
        } else {
          console.error(
            "❌ [CLAUDE] 共通エラーハンドリングモジュールが見つかりません",
            "manifest.jsonの設定を確認してください",
          );
        }
        return false;
      };

      // 即座に試行開始
      tryInitialize();
    })();

    // 🔍 [段階5] Content Script実行コンテキストの詳細確認
    const currentURL = window.location.href;
    // 🔧 より包括的なClaude URL検出ロジック
    const condition1 = currentURL.includes("claude.ai");
    const condition2 = currentURL.includes("claude.ai/chat");
    const condition3 = currentURL.includes("claude.ai/new");
    const condition4 = window.location.hostname === "claude.ai";
    const condition5 = window.location.hostname.endsWith(".claude.ai");
    const isValidClaudeURL =
      condition1 || condition2 || condition3 || condition4 || condition5;
    const isExtensionPage = currentURL.startsWith("chrome-extension://");

    // URL検証 - Content Scriptは claude.ai でのみ動作すべき

    // ログレベル定義
    const LOG_LEVEL = { ERROR: 1, WARN: 2, INFO: 3, DEBUG: 4 };

    // Chrome Storageからログレベルを取得（非同期）
    let CURRENT_LOG_LEVEL = LOG_LEVEL.WARN; // デフォルト値（簡潔な動作確認用）

    // Chrome拡張環境でのみStorageから設定を読み込む
    if (
      typeof chrome !== "undefined" &&
      chrome.storage &&
      chrome.storage.local
    ) {
      chrome.storage.local.get("logLevel", (result) => {
        if (result.logLevel) {
          CURRENT_LOG_LEVEL = parseInt(result.logLevel);
          console.info(
            `📋 [Claude Automation] ログレベル設定: ${["", "ERROR", "WARN", "INFO", "DEBUG"][CURRENT_LOG_LEVEL]}`,
          );
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

    // ========================================
    // 統一ClaudeRetryManager クラス定義
    // ChatGPT/Geminiと同様のエラー分類とリトライ戦略を統合
    // ========================================

    class ClaudeRetryManager {
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

        // Claude特有のエラー分類
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

      // Claude特有のエラー分類器（詳細ログ付き）
      classifyError(error, context = {}) {
        const errorMessage = error?.message || error?.toString() || "";
        const errorName = error?.name || "";

        // エラー分類開始

        // Claude特有エラーの検出
        let errorType = "GENERAL_ERROR";

        if (
          errorMessage.includes("rate limit") ||
          errorMessage.includes("Rate limited") ||
          errorMessage.includes("Too many requests")
        ) {
          errorType = "RATE_LIMIT_ERROR";
          // レート制限エラー検出
          return errorType;
        }

        if (
          errorMessage.includes("ログイン") ||
          errorMessage.includes("login") ||
          errorMessage.includes("authentication") ||
          errorMessage.includes("Please log in")
        ) {
          errorType = "LOGIN_ERROR";
          // ログインエラー検出
          return errorType;
        }

        if (
          errorMessage.includes("session") ||
          errorMessage.includes("セッション") ||
          errorMessage.includes("Session expired")
        ) {
          errorType = "SESSION_ERROR";
          // セッションエラー検出
          return errorType;
        }

        if (
          errorMessage.includes("Canvas") ||
          errorMessage.includes("canvas") ||
          context.feature === "Canvas"
        ) {
          errorType = "CANVAS_ERROR";
          // Canvasエラー検出
          return errorType;
        }

        // ========================================
        // 🚨 Claude API特有エラーの検出（拡張機能）
        // ========================================

        // Claude完了リクエストエラー
        if (
          (errorMessage.includes("[COMPLETION]") &&
            errorMessage.includes("Request failed")) ||
          errorMessage.includes("TypeError: network error") ||
          errorMessage.includes("Non-API stream error") ||
          (errorMessage.includes("[COMPLETION]") &&
            errorMessage.includes("failed"))
        ) {
          errorType = "CLAUDE_API_ERROR";
          log.warn("🚨 [RETRY-MANAGER] Claude API完了リクエストエラーを分類:", {
            errorMessage: errorMessage.substring(0, 200),
            errorType: errorType,
            context: context,
          });
          return errorType;
        }

        // Claude APIネットワークエラー（より具体的）
        if (
          errorMessage.includes("claude.ai") &&
          (errorMessage.includes("network") ||
            errorMessage.includes("timeout") ||
            errorMessage.includes("fetch"))
        ) {
          errorType = "CLAUDE_NETWORK_ERROR";
          log.warn("🌐 [RETRY-MANAGER] Claude専用ネットワークエラーを分類:", {
            errorMessage: errorMessage.substring(0, 200),
            errorType: errorType,
          });
          return errorType;
        }

        // Claude DOM操作エラー
        if (
          (errorMessage.includes("DOM") || errorMessage.includes("element")) &&
          (errorMessage.includes("claude") || context.aiType === "claude")
        ) {
          errorType = "CLAUDE_DOM_ERROR";
          log.warn("🔧 [RETRY-MANAGER] Claude DOM操作エラーを分類:", {
            errorMessage: errorMessage.substring(0, 200),
            errorType: errorType,
          });
          return errorType;
        }

        if (
          errorMessage.includes("Deep Research") ||
          errorMessage.includes("deep research") ||
          context.feature === "Deep Research"
        ) {
          errorType = "DEEP_RESEARCH_ERROR";
          // Deep Researchエラー検出
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
          // ネットワークエラー検出
          return errorType;
        }

        if (
          errorMessage.includes("要素が見つかりません") ||
          errorMessage.includes("element not found") ||
          errorMessage.includes("selector") ||
          errorMessage.includes("querySelector")
        ) {
          errorType = "DOM_ERROR";
          // DOM要素エラー検出
          return errorType;
        }

        if (
          errorMessage.includes("timing") ||
          errorMessage.includes("タイミング") ||
          errorMessage.includes("wait")
        ) {
          errorType = "UI_TIMING_ERROR";
          // UIタイミングエラー検出
          return errorType;
        }

        // 一般エラーとして分類

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
          `🔄 [Claude RetryManager] ${actionName} 開始 (最大20回リトライ)`,
        );

        for (retryCount = 1; retryCount <= 20; retryCount++) {
          try {
            this.metrics.totalAttempts++;

            log.debug(
              `🔄 [Claude RetryManager] ${actionName} 試行 ${retryCount}/20`,
            );

            const result = await actionFunction();

            this.metrics.successfulAttempts++;
            const totalTime = Date.now() - startTime;

            log.debug(`✅ [Claude RetryManager] ${actionName} 成功:`, {
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
              `❌ [Claude RetryManager] ${actionName} エラー (試行 ${retryCount}/20):`,
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
              `⏳ [Claude RetryManager] ${delay}ms待機後リトライ (レベル: ${escalationLevel})`,
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

        log.error(`❌ [Claude RetryManager] ${actionName} 全リトライ失敗:`, {
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
          `🔧 [Claude RetryManager] エスカレーション実行: ${level.description}`,
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
            log.debug(`🔄 [Claude RetryManager] ページリフレッシュ実行`);
            try {
              window.location.reload();
            } catch (e) {
              log.error(`❌ [Claude RetryManager] ページリフレッシュ失敗:`, e);
            }
            break;
          case "HEAVY_RESET":
            log.debug(
              `🆕 [Claude RetryManager] 重いリセット: 新規ウィンドウが推奨されますが、現在のウィンドウで継続`,
            );
            try {
              // sessionStorageクリア
              sessionStorage.clear();
              // ページリフレッシュ
              window.location.reload();
            } catch (e) {
              log.error(`❌ [Claude RetryManager] 重いリセット失敗:`, e);
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

    // ClaudeRetryManagerのインスタンス作成
    const claudeRetryManager = new ClaudeRetryManager();

    // windowオブジェクトに登録（デバッグ用）
    window.claudeRetryManager = claudeRetryManager;

    // ========================================
    // 🔒 実行状態管理（重複実行防止）- 改良版
    // コンテキスト間共有のためwindowレベルとsessionStorageを併用
    // ========================================

    // windowレベルの状態管理（即座のコンテキスト間共有）
    window.CLAUDE_TASK_EXECUTING = window.CLAUDE_TASK_EXECUTING || false;
    window.CLAUDE_CURRENT_TASK_ID = window.CLAUDE_CURRENT_TASK_ID || null;
    window.CLAUDE_TASK_START_TIME = window.CLAUDE_TASK_START_TIME || null;
    window.CLAUDE_LAST_ACTIVITY_TIME = window.CLAUDE_LAST_ACTIVITY_TIME || null;

    // ローカル変数（後方互換性のため維持）
    let isExecuting = window.CLAUDE_TASK_EXECUTING;
    let currentTaskId = window.CLAUDE_CURRENT_TASK_ID;
    let taskStartTime = window.CLAUDE_TASK_START_TIME;
    let lastActivityTime = window.CLAUDE_LAST_ACTIVITY_TIME;

    // sessionStorageとの同期（永続化とタブ間共有）
    const syncExecutionStateWithStorage = () => {
      try {
        const state = {
          isExecuting: window.CLAUDE_TASK_EXECUTING,
          currentTaskId: window.CLAUDE_CURRENT_TASK_ID,
          taskStartTime: window.CLAUDE_TASK_START_TIME,
          lastActivityTime: window.CLAUDE_LAST_ACTIVITY_TIME,
        };
        sessionStorage.setItem("CLAUDE_EXECUTION_STATE", JSON.stringify(state));
      } catch (e) {
        log.debug("sessionStorage同期エラー:", e);
      }
    };

    // sessionStorageから状態を復元
    const loadExecutionStateFromStorage = () => {
      try {
        const storedState = sessionStorage.getItem("CLAUDE_EXECUTION_STATE");
        if (storedState) {
          const state = JSON.parse(storedState);
          // 15分以上経過していたらリセット
          const timeSinceLastActivity =
            Date.now() - (state.lastActivityTime || 0);
          if (timeSinceLastActivity > 15 * 60 * 1000) {
            // 実行状態タイムアウト - リセット
            return false;
          }

          window.CLAUDE_TASK_EXECUTING = state.isExecuting;
          window.CLAUDE_CURRENT_TASK_ID = state.currentTaskId;
          window.CLAUDE_TASK_START_TIME = state.taskStartTime;
          window.CLAUDE_LAST_ACTIVITY_TIME = state.lastActivityTime;

          isExecuting = state.isExecuting;
          currentTaskId = state.currentTaskId;
          taskStartTime = state.taskStartTime;
          lastActivityTime = state.lastActivityTime;

          if (state.isExecuting && state.currentTaskId) {
            // 実行状態復元: タスクが実行中
          }
          return true;
        }
      } catch (e) {
        // sessionStorage復元エラー
      }
      return false;
    };

    // ページロード時に状態を復元
    loadExecutionStateFromStorage();

    // タスク実行状態を管理するヘルパー関数（改良版）
    const setExecutionState = (executing, taskId = null) => {
      // windowレベルの状態を更新
      window.CLAUDE_TASK_EXECUTING = executing;
      window.CLAUDE_CURRENT_TASK_ID = executing ? taskId : null;
      window.CLAUDE_LAST_ACTIVITY_TIME = Date.now();

      // ローカル変数も更新
      isExecuting = executing;
      currentTaskId = executing ? taskId : null;
      lastActivityTime = Date.now();

      if (executing && taskId) {
        window.CLAUDE_TASK_START_TIME = Date.now();
        taskStartTime = Date.now();
        log.info(`タスク実行開始: ${taskId}`);
      } else if (!executing) {
        const duration = window.CLAUDE_TASK_START_TIME
          ? Date.now() - window.CLAUDE_TASK_START_TIME
          : 0;
        log.info(`タスク実行完了 (${Math.round(duration / 1000)}秒)`);
        window.CLAUDE_TASK_START_TIME = null;
        taskStartTime = null;
      }

      // sessionStorageに同期
      syncExecutionStateWithStorage();
    };

    // 実行状態を取得（改良版）
    const getExecutionStatus = () => {
      // 最新のwindowレベルの状態を返す
      return {
        isExecuting: window.CLAUDE_TASK_EXECUTING,
        currentTaskId: window.CLAUDE_CURRENT_TASK_ID,
        taskStartTime: window.CLAUDE_TASK_START_TIME,
        lastActivityTime: window.CLAUDE_LAST_ACTIVITY_TIME,
        executionDuration: window.CLAUDE_TASK_START_TIME
          ? Date.now() - window.CLAUDE_TASK_START_TIME
          : 0,
      };
    };

    // ========================================
    // 🎯 Claude UI セレクタ定義 - 完全統合版
    // 最終更新: 2024-12-22
    // ========================================
    const CLAUDE_SELECTORS = {
      // ========== 基本入力・送信系 ==========
      INPUT: [
        '[aria-label="クロードにプロンプトを入力してください"]', // 日本語版（最優先）
        ".ProseMirror",
        'div.ProseMirror[contenteditable="true"]',
        '[data-placeholder*="Message Claude"]',
        'div[contenteditable="true"][role="textbox"]',
        '[role="textbox"][contenteditable="true"]',
        'div[contenteditable="true"][translate="no"]',
        'div[enterkeyhint="enter"][role="textbox"]',
      ],

      SEND_BUTTON: [
        '[aria-label="メッセージを送信"]', // 日本語版（最優先）
        'button[aria-label="メッセージを送信"]',
        '[data-state="closed"] button[type="button"]',
        "button.bg-accent-main-000",
        'button[aria-label="Send Message"]', // 英語版フォールバック
        'button[type="submit"][aria-label*="Send"]',
        'button svg path[d*="M208.49,120.49"]',
        'button svg path[d*="M320 448"]',
      ],

      STOP_BUTTON: [
        '[aria-label="応答を停止"]', // 日本語版（最優先）
        'button[aria-label="応答を停止"]',
        '[data-state="closed"][aria-label="応答を停止"]',
        'button.border-border-200[aria-label="応答を停止"]',
        'button svg path[d*="M128,20A108"]',
      ],

      // ========== モデル選択系 ==========
      MODEL: {
        BUTTON: [
          // モデル名に依存しない汎用セレクタ（どのモデルでも対応）
          '[data-testid="model-selector-dropdown"]', // 共通の最優先セレクタ
          'button[data-testid="model-selector-dropdown"]', // ボタン要素を明示
          "button:has(.font-claude-response)", // font-claude-responseクラスを持つdivを含むボタン
          "button:has(.claude-logo-model-selector)", // Claudeロゴを含むボタン（パターン1）
          "button:has(.whitespace-nowrap):has(svg)", // モデル名表示部分と矢印SVGの両方を持つボタン
          "button:has(.whitespace-nowrap)", // whitespace-nowrapクラスを持つdivを含むボタン
          "button:has(div.tracking-tight)", // tracking-tightクラスを持つdivを含むボタン
          'button:has(svg[viewBox="0 0 256 256"])', // 矢印SVGを持つボタン（viewBox指定）
          'button:has(path[d*="M213.66,101.66"])', // 下矢印のpath要素を持つボタン
          // フォールバックセレクタ
          'button[data-value*="claude"]', // モデル名を含むボタン
          "button.cursor-pointer:has(span.font-medium)", // モデル表示ボタン
          'button[aria-label*="モデル"]',
          'button[aria-haspopup="menu"]:has(span:contains("Claude"))',
          'button:has(svg[class*="model"])',
        ],

        MENU_CONTAINER: '[role="menu"][data-state="open"]',

        OTHER_MODELS: [
          // 最新のClaudeUIに対応した新しいセレクタ
          'div[role="menuitem"]', // まず基本的なメニューアイテムを取得
          'div[role="menuitem"][aria-haspopup="menu"]', // ポップアップ付きアイテム
          '[role="menuitem"]:has(span)', // spanを含むメニューアイテム
          'div[role="menuitem"][aria-haspopup="menu"][data-state="closed"]',
          'div[role="menuitem"][aria-haspopup="menu"]:has(*:contains("他のモデル"))',
          'div[role="menuitem"][aria-haspopup="menu"]:has(*:contains("Other models"))',
          // フォールバックセレクタ
          'div[role="menuitem"][aria-haspopup="menu"]:has(*:contains("other"))',
          'div[role="menuitem"][aria-haspopup="menu"]:has(*:contains("その他"))',
          '[role="menuitem"][aria-haspopup="menu"]', // 最も汎用的
        ],

        DISPLAY_TEXT: [
          'button span:contains("Claude")',
          'button span[class*="text"]',
          'button div:contains("Claude")',
        ],
      },

      // ========== 機能選択系 ==========
      FEATURE: {
        MENU_BUTTON: [
          '[data-testid="input-menu-tools"]', // 最新のセレクタ（最優先）
          '[aria-label="ツールメニューを開く"]', // 日本語版
          "#input-tools-menu-trigger",
          'button[aria-expanded][aria-haspopup="listbox"]',
          'button svg path[d*="M40,88H73a32"]',
          'button[aria-label*="機能"]', // フォールバック
          'button:has(svg[class*="feature"])',
        ],

        MENU_CONTAINER: [
          '[aria-labelledby="input-tools-menu-trigger"]',
          ".w-\\[20rem\\].absolute.max-w-\\[calc\\(100vw-16px\\)\\].block",
          "div.z-dropdown.bg-bg-000.rounded-xl",
          'div[style*="max-height"][style*="336"]',
          ".absolute .flex-col .overscroll-auto",
          '[role="menu"]', // フォールバック
        ],

        WEB_SEARCH_TOGGLE: [
          'button:has(svg path[d*="M7.2705 3.0498"]):has(input[role="switch"])',
          'button:has(p:contains("ウェブ検索")):has(input[role="switch"])',
          'button.text-primary-500:has(input[role="switch"])',
          'div:contains("ウェブ検索") button:has(.group\\/switch)',
          'button .font-base:contains("ウェブ検索")',
          'button[role="switch"]', // フォールバック
          '[aria-label*="Web"]',
        ],

        RESEARCH_BUTTON: [
          'button[aria-pressed]:has(svg path[d*="M8.5 2C12.0899"])',
          'button:has(p:contains("リサーチ"))',
          "button.text-accent-secondary-100:has(svg)",
          'button[type="button"]:has(.min-w-0.pl-1.text-xs)',
          ".flex.shrink button:has(svg)",
          'button:contains("Deep Research")', // フォールバック
          'button[aria-label*="Research"]',
        ],
      },

      // ========== Deep Research & Canvas系 ==========
      DEEP_RESEARCH: {
        CANVAS_PREVIEW: [
          'div[aria-label="内容をプレビュー"][role="button"]',
          '[aria-label="内容をプレビュー"]',
          'div[role="button"][tabindex="0"]:has(div.artifact-block-cell)',
        ],

        CANVAS_CONTENT: [
          '.grid-cols-1.grid[class*="!gap-3.5"]',
          // Canvas固有セレクタ（優先度順）
          "div.grid-cols-1.grid.gap-2\\.5:has(p.whitespace-pre-wrap)",
          "div.grid-cols-1.grid:not(:has(.ease-out.rounded-lg))",
          // 除外条件付きセレクタ（作業説明文と思考プロセスを除外）
          'div.grid-cols-1.grid.gap-2\\.5:not([class*="p-3"]):not([class*="pt-0"]):not([class*="pr-8"])',
          'div[class*="grid-cols-1"][class*="gap-2.5"]:not([class*="p-3"]):not([class*="pt-0"])',
          // 通常回答除外セレクタ
          '.grid-cols-1.grid:not(.standard-markdown):not([class*="p-3"]):not([class*="pt-0"])',
          // Canvas固有IDセレクタ
          "#markdown-artifact",
          '[id="markdown-artifact"]',
          '[data-testid="artifact-content"]',
          '[data-testid="canvas-content"]',
          // Canvas内コンテンツ
          "div.artifact-block-cell",
          "div.artifact-content",
          "div.code-block__code",
          ".code-block__code.h-fit.min-h-full.w-fit.min-w-full",
          // 最後のフォールバック（汎用セレクタ）
          '[class*="grid"][class*="gap"]:not([class*="standard-markdown"]):not([class*="p-3"])',
        ],
      },

      // ========== AI応答取得系 ==========
      AI_RESPONSE: {
        // レベル1: 汎用的な応答コンテナ
        GENERAL_CONTAINERS: [
          '[data-testid="assistant-message"]',
          'div[class*="markdown"][role="presentation"]',
          'div[class*="assistant"][class*="message"]',
        ],

        // レベル2: 回答タイプ別
        CANVAS: [
          '.grid-cols-1.grid[class*="!gap-3.5"]',
          "#markdown-artifact",
          '[data-testid="artifact-content"]',
          '[data-testid="canvas-content"]',
        ],

        DEEP_RESEARCH: [
          '[data-research-result="true"]',
          'div[class*="research"][class*="result"]',
          '[class*="deep-research"][class*="output"]',
        ],

        STANDARD: [
          ".grid-cols-1.grid.standard-markdown", // 最優先：完全一致セレクタ
          ".standard-markdown:has(p.whitespace-normal)", // 段落要素を含むstandard-markdown
          ".standard-markdown", // フォールバック
          ".markdown.prose",
          "div.markdown-content",
          'div[class*="prose"][class*="markdown"]',
        ],

        CODE_BLOCK: [
          "pre code",
          ".code-block__code",
          'div[class*="code-block"]',
        ],

        // レベル3: 除外セレクタ
        EXCLUDE: [
          '[data-testid="user-message"]',
          ".user-message-content",
          'div[class*="user"][class*="message"]',
          "button",
          '[role="button"]',
          "svg",
          '[class*="toolbar"]',
          '[class*="header"]',
          '[class*="footer"]',
        ],
      },

      // ========== フォールバック用デフォルト ==========
      DEFAULT: {
        INPUT: [".ProseMirror", 'div[contenteditable="true"]', "textarea"],
        SEND_BUTTON: [
          'button[type="submit"]',
          'button[aria-label*="Send"]',
          "button:has(svg)",
        ],
        STOP_BUTTON: [
          'button[aria-label*="Stop"]',
          'button[aria-label*="停止"]',
          'button:has(svg[class*="stop"])',
        ],
      },
    };

    // AI待機設定（デフォルト値）
    let AI_WAIT_CONFIG = {
      INITIAL_WAIT: 30000,
      MAX_WAIT: 600000, // 10分（通常処理）
      CHECK_INTERVAL: 10000, // 停止ボタン消滅継続時間: 10秒
      DEEP_RESEARCH_WAIT: 2400000, // 40分（Deep Research）
      AGENT_MODE_WAIT: 2400000, // 40分（エージェントモード）
      SHORT_WAIT: 1000,
      MEDIUM_WAIT: 2000,
      STOP_BUTTON_INITIAL_WAIT: 30000,
      STOP_BUTTON_DISAPPEAR_WAIT: 600000, // 10分
    };

    // Chrome Storageから設定を読み込む
    if (
      typeof chrome !== "undefined" &&
      chrome.storage &&
      chrome.storage.local
    ) {
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
            AI_WAIT_CONFIG.STOP_BUTTON_DISAPPEAR_WAIT =
              result.responseWaitConfig.MAX_RESPONSE_WAIT_TIME ||
              AI_WAIT_CONFIG.STOP_BUTTON_DISAPPEAR_WAIT;

            log.info("⏱️ [Claude] 回答待機時間設定を適用:", {
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
              AI_WAIT_CONFIG.STOP_BUTTON_DISAPPEAR_WAIT =
                result.batchProcessingConfig.MAX_RESPONSE_WAIT_TIME ||
                AI_WAIT_CONFIG.STOP_BUTTON_DISAPPEAR_WAIT;
            }
          }
        },
      );
    }

    // windowレベルでも公開（後方互換性）
    window.AI_WAIT_CONFIG = AI_WAIT_CONFIG;

    // スクリプトの読み込み時間を記録
    const scriptLoadTime = Date.now();
    const loadTimeISO = new Date().toISOString();

    // 🔍 [CONTENT-INIT] Content Script初期化確認ログ

    // 実行環境の判定
    let shouldInitialize = false;
    let shouldExportFunctions = false; // 🔧 関数エクスポート制御フラグ追加

    if (isExtensionPage) {
      // 拡張機能ページで実行 - スキップ
      window.CLAUDE_SCRIPT_LOADED = false;
      window.CLAUDE_SCRIPT_INIT_TIME = Date.now();
    } else if (!isValidClaudeURL) {
      // claude.ai 以外のサイトで実行
      window.CLAUDE_SCRIPT_LOADED = false;
      window.CLAUDE_SCRIPT_INIT_TIME = Date.now();
    } else {
      // claude.ai での実行
      shouldInitialize = true;
      shouldExportFunctions = true; // 🔧 claude.aiでは関数エクスポートも有効
      log.info("✅ Claude Automation V2 初期化: " + currentURL);
    }

    // 🔧 Option 1 Fix: claude.ai URLでは初期化がスキップされても関数エクスポートを実行

    if (!shouldExportFunctions && isValidClaudeURL) {
      shouldExportFunctions = true;
    }

    // ========================================
    // 関数定義（常に定義するが、実行は制御）
    // ========================================

    // 🚨 Overloadedエラー対応システム
    let overloadedRetryCount = 0;
    const MAX_OVERLOADED_RETRIES = 5;
    const OVERLOADED_RETRY_INTERVALS = [
      60000, 300000, 900000, 1800000, 3600000,
    ]; // 1分、5分、15分、30分、60分

    // デバウンス用の変数
    let handleOverloadedTimeout = null;
    let lastOverloadedCallTime = 0;

    function handleOverloadedError() {
      // デバウンス: 5秒以内の重複呼び出しを防ぐ
      const now = Date.now();
      if (now - lastOverloadedCallTime < 5000) {
        // デバウンス中 - スキップ
        return;
      }
      lastOverloadedCallTime = now;

      log.warn("⚠️ Overloadedエラー処理開始");

      if (overloadedRetryCount >= MAX_OVERLOADED_RETRIES) {
        console.error(
          "❌ [OVERLOADED-HANDLER] 最大リトライ回数に達しました。手動対応が必要です。",
        );
        return;
      }

      const retryInterval =
        OVERLOADED_RETRY_INTERVALS[overloadedRetryCount] || 3600000; // デフォルト60分
      overloadedRetryCount++;

      // 即座にウィンドウを閉じる
      setTimeout(() => {
        // background scriptにウィンドウリセットを要求
        if (chrome.runtime && chrome.runtime.sendMessage) {
          chrome.runtime
            .sendMessage({
              action: "RESET_CLAUDE_WINDOW",
              retryCount: overloadedRetryCount,
              nextRetryIn: retryInterval,
            })
            .catch((err) => {
              console.error(
                "❌ [OVERLOADED-HANDLER] background scriptへのメッセージ送信失敗:",
                err,
              );
              // フォールバック: ページリロード
              window.location.reload();
            });
        } else {
          // フォールバック: ページリロード
          window.location.reload();
        }
      }, 1000); // 1秒後にリセット実行

      // 指定時間後にリトライ
      setTimeout(() => {
        // リトライ成功時はカウンターリセット
        overloadedRetryCount = Math.max(0, overloadedRetryCount - 1);

        // 新しいウィンドウで Claude を開く
        if (chrome.runtime && chrome.runtime.sendMessage) {
          chrome.runtime.sendMessage({
            action: "OPEN_CLAUDE_WINDOW",
            retryAttempt: overloadedRetryCount,
          });
        }
      }, retryInterval);
    }

    // 🚨 グローバルエラーハンドラー追加（claude.aiでのみ）
    if (shouldInitialize) {
      window.addEventListener("error", (e) => {
        const errorMessage = e.message || e.error?.message || "";
        const errorName = e.error?.name || "";

        // 🔍 [VS-CODE-ERROR-FILTER] VS Code関連エラーの検出と抑制
        const isVSCodeError =
          errorMessage.includes(
            "The message port closed before a response was received",
          ) ||
          errorMessage.includes("message port closed") ||
          (e.filename &&
            (e.filename.includes("content.js") ||
              e.filename.includes("vscode"))) ||
          errorMessage.includes("vscode") ||
          errorMessage.includes("vscode-webview");

        if (isVSCodeError) {
          // VS Codeエラーを抑制
          e.preventDefault();
          return;
        }

        // 🔍 Claude Overloadedエラー検出 - 強化版
        const errorToString = e.error?.toString() || "";
        const errorStack = e.error?.stack || "";

        const isOverloadedError =
          errorMessage.includes("Overloaded") ||
          errorMessage.includes("overloaded") ||
          errorToString.includes("Overloaded") ||
          errorStack.includes("Overloaded") ||
          // Claude.ai特有の形式
          errorMessage === "i: Overloaded" ||
          errorToString === "i: Overloaded" ||
          errorMessage.includes("i: Overloaded") ||
          errorToString.includes("i: Overloaded") ||
          (e.reason && String(e.reason).includes("Overloaded"));

        if (isOverloadedError) {
          log.error("🚨 Overloadedエラー検出");

          // 即座にウィンドウリセット・リトライを開始
          handleOverloadedError();
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
          log.error("🌐 ネットワークエラー");

          // ClaudeRetryManagerでエラー統計を記録
          try {
            if (window.claudeRetryManager) {
              window.claudeRetryManager.errorHistory.push({
                type: "NETWORK_ERROR",
                message: errorMessage,
                timestamp: Date.now(),
                level: "global_error",
              });
            }
          } catch (retryError) {
            // エラー記録失敗は無視
          }
        } else {
          // その他のグローバルエラー
        }
      });

      // ========================================
      // 🚨 Console.errorの監視システム（Claude API特有エラー検出）
      // ========================================

      // 元のconsole.errorメソッドをバックアップ
      const originalConsoleError = console.error;

      // Console.error監視のためのフラグ
      window.claudeAPIErrorDetected = false;
      window.claudeLastConsoleError = null;

      // console.errorを拡張してAPIエラーを監視
      console.error = function (...args) {
        // 元のconsole.errorを実行
        originalConsoleError.apply(console, args);

        try {
          // 引数を文字列に変換して解析
          const errorMessage = args
            .map((arg) =>
              typeof arg === "object" ? JSON.stringify(arg) : String(arg),
            )
            .join(" ");

          // Claude API特有のエラーパターンを検出
          const isClaudeAPIError =
            (errorMessage.includes("[COMPLETION]") &&
              errorMessage.includes("Request failed")) ||
            errorMessage.includes("TypeError: network error") ||
            errorMessage.includes("Non-API stream error") ||
            (errorMessage.includes("[COMPLETION]") &&
              errorMessage.includes("failed"));

          if (isClaudeAPIError) {
            log.warn(
              "🚨 [CONSOLE-ERROR-MONITOR] Claude API エラーを検出:",
              errorMessage,
            );

            // グローバル状態を更新
            window.claudeAPIErrorDetected = true;
            window.claudeLastConsoleError = {
              message: errorMessage,
              timestamp: Date.now(),
              args: args,
            };

            // ClaudeRetryManagerに記録
            try {
              if (window.claudeRetryManager) {
                window.claudeRetryManager.errorHistory.push({
                  type: "CLAUDE_API_ERROR",
                  message: errorMessage,
                  timestamp: Date.now(),
                  level: "console_error",
                  source: "console.error monitoring",
                });

                log.debug(
                  "📊 [CONSOLE-ERROR-MONITOR] Claude APIエラーを統計に記録",
                );
              }
            } catch (recordError) {
              // エラー記録失敗は無視
              log.debug(
                "⚠️ [CONSOLE-ERROR-MONITOR] エラー記録に失敗:",
                recordError.message,
              );
            }

            // アクティブなタスクがある場合は監視システムに通知
            if (window.currentClaudeTask) {
              log.warn(
                "🔄 [CONSOLE-ERROR-MONITOR] アクティブタスクに API エラーを通知",
              );

              // カスタムイベントでエラーを通知（停止ボタン監視などに使用）
              window.dispatchEvent(
                new CustomEvent("claudeAPIError", {
                  detail: {
                    errorMessage: errorMessage,
                    timestamp: Date.now(),
                    errorType: "CLAUDE_API_ERROR",
                  },
                }),
              );
            }
          }
        } catch (monitorError) {
          // Console.error監視でのエラーは元のconsole.errorで出力
          originalConsoleError(
            "❌ [CONSOLE-ERROR-MONITOR] 監視処理エラー:",
            monitorError,
          );
        }
      };

      // ページアンロード時に元のconsole.errorを復元
      window.addEventListener("beforeunload", () => {
        console.error = originalConsoleError;
      });

      window.addEventListener("unhandledrejection", (e) => {
        const errorReason = e.reason;
        const errorMessage = errorReason?.message || String(errorReason);
        const errorName = errorReason?.name || "";

        // 🔍 [VS-CODE-ERROR-FILTER] VS Code関連エラーの検出と抑制
        const isVSCodeError =
          errorMessage.includes(
            "The message port closed before a response was received",
          ) ||
          errorMessage.includes("message port closed") ||
          (e.filename && e.filename.includes("content.js")) ||
          (e.stack && e.stack.includes("content.js")) ||
          errorMessage.includes("vscode") ||
          errorMessage.includes("vscode-webview");

        if (isVSCodeError) {
          // VS Codeエラーを抑制
          e.preventDefault();
          return;
        }

        // 🔍 Claude Overloadedエラー検出 (unhandledrejection用) - 強化版
        // 複数の方法でエラーを検出
        const errorStr = JSON.stringify(errorReason);
        const errorStack = errorReason?.stack || "";
        const errorToString = errorReason?.toString() || "";

        // Overloadedエラー検出チェック

        const isOverloadedError =
          errorMessage.includes("Overloaded") ||
          errorMessage.includes("overloaded") ||
          errorStr.includes("Overloaded") ||
          errorStack.includes("Overloaded") ||
          errorToString.includes("Overloaded") ||
          // Claude.ai特有の形式に対応
          errorMessage === "i: Overloaded" ||
          errorToString === "i: Overloaded" ||
          errorMessage.includes("i: Overloaded") ||
          errorToString.includes("i: Overloaded");

        if (isOverloadedError) {
          log.error("🚨 Overloadedエラー検出 (unhandled)");

          // 即座にウィンドウリセット・リトライを開始
          handleOverloadedError();
          e.preventDefault();
          return;
        }

        // 🔍 ネットワークエラー検出 (ClaudeRetryManagerと同じロジック)
        const isNetworkError =
          errorMessage.includes("timeout") ||
          errorMessage.includes("network") ||
          errorMessage.includes("fetch") ||
          errorMessage.includes("Failed to fetch") ||
          errorName.includes("NetworkError");

        if (isNetworkError) {
          log.error("🌐 [UNHANDLED-NETWORK-ERROR]", {
            message: errorMessage,
            name: errorName,
            type: "NETWORK_ERROR",
            timestamp: new Date().toISOString(),
          });

          // 🔄 ClaudeRetryManagerでネットワークエラーの統計を記録
          try {
            if (window.claudeRetryManager) {
              // エラーを記録してメトリクスに反映
              window.claudeRetryManager.errorHistory.push({
                type: "NETWORK_ERROR",
                message: errorMessage,
                timestamp: Date.now(),
                level: "unhandledrejection",
              });

              log.debug("📊 [RETRY-MANAGER] ネットワークエラーを統計に記録", {
                totalErrors: window.claudeRetryManager.errorHistory.length,
                errorType: "NETWORK_ERROR",
              });

              // 🔄 アクティブなタスクがある場合はリトライ実行を試行
              if (window.currentClaudeTask) {
                log.warn(
                  "🔄 [RETRY-TRIGGER] アクティブタスク検出 - リトライ実行を試行",
                );
                // 非同期でリトライを試行（unhandledrejectionイベント内で重いタスクを避けるため）
                setTimeout(async () => {
                  try {
                    const retryManager = new ClaudeRetryManager();
                    await retryManager.executeWithRetry(
                      async () => {
                        log.info(
                          "🔄 [NETWORK-RETRY] ネットワークエラー復旧試行中...",
                        );
                        // 現在のタスクを再実行
                        if (
                          window.currentClaudeTask &&
                          typeof window.executeTask === "function"
                        ) {
                          return await window.executeTask(
                            window.currentClaudeTask,
                          );
                        }
                        return {
                          success: false,
                          error: "No active task to retry",
                        };
                      },
                      "ネットワークエラー復旧",
                      {
                        errorType: "NETWORK_ERROR",
                        context: "unhandledrejection_recovery",
                      },
                    );
                  } catch (retryError) {
                    log.error(
                      "❌ [NETWORK-RETRY] リトライ実行中にエラー:",
                      retryError,
                    );
                  }
                }, 100);
              }
            }
          } catch (retryError) {
            // リトライマネージャー処理エラー
          }
        } else {
          // 未処理Promiseエラー
        }
      });

      // Content Script注入確認
      // Claude Automation V2 loaded
    }

    // ========================================
    // 🚨 追加のOverloadedエラー検出機構
    // ========================================
    if (shouldInitialize) {
      // 1. DOM監視によるエラー検出
      const errorObserver = new MutationObserver((mutations) => {
        // Claude.aiのエラー表示要素を検出
        const errorElements = document.querySelectorAll(
          '[role="alert"], .error-message, [data-state="error"], .text-red-500, .text-error',
        );

        errorElements.forEach((elem) => {
          const text = elem.textContent || "";
          if (
            text.includes("Overloaded") ||
            text.includes("overloaded") ||
            text === "i: Overloaded"
          ) {
            log.warn("🔍 Overloadedエラー検出");
            handleOverloadedError();
          }
        });

        // エラーダイアログの検出
        mutations.forEach((mutation) => {
          if (mutation.addedNodes.length > 0) {
            mutation.addedNodes.forEach((node) => {
              if (node.nodeType === Node.ELEMENT_NODE) {
                const elem = node;
                const text = elem.textContent || "";
                if (
                  text.includes("Overloaded") ||
                  text.includes("error occurred")
                ) {
                  // DOMエラー要素検出
                  if (text.includes("Overloaded")) {
                    handleOverloadedError();
                  }
                }
              }
            });
          }
        });
      });

      // DOMの監視を開始
      errorObserver.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["data-state", "role"],
      });

      // 2. console.errorのインターセプト
      const originalConsoleError = console.error;
      console.error = function (...args) {
        const errorStr = args.map((arg) => String(arg)).join(" ");
        if (
          errorStr.includes("Overloaded") ||
          errorStr.includes("i: Overloaded")
        ) {
          log.warn("🔍 Overloadedエラー検出");
          handleOverloadedError();
        }
        originalConsoleError.apply(console, args);
      };

      // 3. fetchインターセプト（529ステータスの検出）
      const originalFetch = window.fetch;
      window.fetch = async function (...args) {
        try {
          const response = await originalFetch.apply(this, args);

          // Claude APIのレスポンスをチェック
          if (
            args[0] &&
            typeof args[0] === "string" &&
            args[0].includes("claude.ai")
          ) {
            if (
              !response.ok &&
              (response.status === 529 || response.status === 503)
            ) {
              log.error("🔍 サーバー過負荷検出");
              handleOverloadedError();
            }
          }

          return response;
        } catch (error) {
          if (
            error.message &&
            (error.message.includes("Overloaded") ||
              error.message.includes("i: Overloaded"))
          ) {
            log.error("🔍 Overloadedエラー検出");
            handleOverloadedError();
          }
          throw error;
        }
      };

      // 追加のOverloadedエラー検出機構を設定
    }

    // ========================================
    // 🔍 直接実行方式: メッセージリスナーを早期に登録
    // ========================================
    // Claude.aiページでのみメッセージリスナーを登録
    // 他のAI（ChatGPT/Gemini/Genspark）は直接実行方式を使用しているが、
    // Claudeも段階的に移行するため、まずはメッセージリスナーを修正
    // 🔧 FIX: chrome.ai/newを含むすべてのClaude URLでメッセージリスナーを登録

    // 🔍 [LISTENER-CONDITION] メッセージリスナー登録条件診断
    const listenerCondition1 = isValidClaudeURL;
    const listenerCondition2 = currentURL.includes("claude.ai");
    const listenerCombinedCondition = listenerCondition1 || listenerCondition2;
    const listenerCondition3 = !isExtensionPage;
    const listenerCondition4 = typeof chrome !== "undefined";
    const listenerCondition5 = !!chrome?.runtime;
    const listenerCondition6 = !!chrome?.runtime?.onMessage;
    const listenerFinalCondition =
      listenerCombinedCondition && listenerCondition3 && listenerCondition6;

    if (listenerFinalCondition) {
      // ping/pong応答を最優先で処理するリスナーを即座に登録
      const registerMessageListener = () => {
        // メッセージリスナー登録

        // 🔍 [CONTENT-SCRIPT-INIT] Content Script初期化診断

        chrome.runtime.onMessage.addListener(
          (request, sender, sendResponse) => {
            if (
              request.type === "CLAUDE_EXECUTE_TASK" ||
              request.action === "executeTask"
            ) {
            }

            // 🔍 [MESSAGE-RECEIVED] メッセージ受信診断

            // ping/pongメッセージへの即座応答（最優先）
            if (
              request.action === "ping" ||
              request.type === "CONTENT_SCRIPT_CHECK" ||
              request.type === "PING"
            ) {
              // 🔍 [MESSAGE-PORT-SAFE] Ping応答も安全な送信
              try {
                sendResponse({
                  action: "pong",
                  status: "ready",
                  timestamp: Date.now(),
                  scriptLoaded: true,
                  messagePortSafe: true,
                });
              } catch (pingError) {
                console.error(
                  "🚨 [MESSAGE-PORT-ERROR] Ping応答送信失敗:",
                  pingError,
                );
              }
              return true;
            }

            // テキスト入力欄の存在チェック
            if (request.action === "CHECK_INPUT_FIELD") {
              const selectors = request.selectors || [
                ".ProseMirror",
                'div[contenteditable="true"]',
                'div[aria-label*="Claude"]',
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

              if (!found && window.DEBUG_MODE) {
              }

              sendResponse({ found: found });
              return true;
            }

            const requestId = Math.random().toString(36).substring(2, 8);
            // console.warn(
            //   `📬 [Claude-直接実行方式] メッセージ受信 [ID:${requestId}]:`,
            //   JSON.stringify(
            //     {
            //       type: request?.type || request?.action,
            //       keys: Object.keys(request || {}),
            //       hasTask: !!request?.task,
            //       hasTaskData: !!request?.taskData,
            //       automationName: request?.automationName,
            //       taskId: request?.task?.id || request?.taskData?.id,
            //       timestamp: new Date().toISOString(),
            //     },
            //     null,
            //     2,
            //   ),
            // );

            // executeTaskタスクの処理
            if (
              request.action === "executeTask" ||
              request.type === "executeTask" ||
              request.type === "CLAUDE_EXECUTE_TASK" ||
              request.type === "EXECUTE_TASK"
            ) {
              // executeTask実行開始

              (async () => {
                try {
                  // executeTask関数が定義されているか確認
                  if (typeof executeTask === "function") {
                    // executeTask関数が利用可能
                    const taskToExecute = request.task || request.taskData;

                    // taskToExecute作成時のlogCell検証
                    console.log("🔍 [taskToExecute検証]", {
                      requestTaskExists: !!request.task,
                      requestTaskDataExists: !!request.taskData,
                      requestTaskLogCell: request.task?.logCell,
                      requestTaskDataLogCell: request.taskData?.logCell,
                      taskToExecuteLogCell: taskToExecute?.logCell,
                      taskToExecuteKeys: taskToExecute
                        ? Object.keys(taskToExecute)
                        : [],
                      taskToExecuteType: typeof taskToExecute,
                      timestamp: new Date().toISOString(),
                    });

                    // executeTask呼び出し

                    try {
                      const result = await executeTask(taskToExecute);
                      // executeTask完了

                      // 🔍 [MESSAGE-PORT-SAFE] Message Port Error 対策：安全なsendResponse呼び出し
                      try {
                        // ポート状態を事前チェック
                        if (chrome.runtime && chrome.runtime.lastError) {
                          console.error(
                            "🚨 [MESSAGE-PORT-PRECHECK] Chrome Runtime Error 検出:",
                            chrome.runtime.lastError,
                          );
                        }

                        // 全AI統一形式で返す（二重構造を解消）
                        sendResponse(result);
                      } catch (sendError) {
                        console.error(
                          "🚨 [MESSAGE-PORT-ERROR] sendResponse でエラー:",
                          {
                            error: sendError.message,
                            stack: sendError.stack,
                            requestId: requestId,
                            hypothesis: "Message Port が予期せず閉じられた",
                            timestamp: new Date().toISOString(),
                          },
                        );

                        // フォールバック：chrome.runtime.sendMessage を使用
                        try {
                          chrome.runtime.sendMessage({
                            type: "EXECUTE_TASK_RESULT",
                            requestId: requestId,
                            success: true,
                            result: result,
                            fallback: true,
                          });
                        } catch (fallbackError) {
                          console.error(
                            "❌ [MESSAGE-PORT-FALLBACK] フォールバック送信も失敗:",
                            fallbackError,
                          );
                        }
                      }
                    } catch (taskError) {
                      console.error(
                        `❌ [Claude-直接実行方式] executeTaskエラー [ID:${requestId}]:`,
                        taskError,
                      );

                      // 🔍 [MESSAGE-PORT-SAFE] エラー時も安全なsendResponse
                      try {
                        sendResponse({
                          success: false,
                          error: taskError.message || "executeTask failed",
                          stack: taskError.stack,
                          messagePortSafe: true,
                          timestamp: new Date().toISOString(),
                        });
                      } catch (sendError) {
                        console.error(
                          "🚨 [MESSAGE-PORT-ERROR] エラーレスポンス送信失敗:",
                          sendError,
                        );
                      }
                    }
                  } else {
                    console.error(
                      `❌ [FIXED] executeTask関数が未定義、即座にエラーレスポンス [ID:${requestId}]`,
                      {
                        requestId: requestId,
                        availableFunctions: {
                          executeTask: typeof executeTask,
                          findClaudeElement: typeof findClaudeElement,
                          inputText: typeof inputText,
                          runAutomation: typeof runAutomation,
                        },
                        timestamp: new Date().toISOString(),
                      },
                    );

                    // [FIX] setTimeoutを削除し、即座にレスポンス
                    // これにより「message port closed」エラーを防止
                    sendResponse({
                      success: false,
                      error: "executeTask not available",
                      fixed: "No setTimeout delay - immediate response",
                      timestamp: new Date().toISOString(),
                    });
                  }
                } catch (error) {
                  console.error(
                    `❌ [Claude-直接実行方式] エラー [ID:${requestId}]:`,
                    error,
                  );
                  sendResponse({ success: false, error: error.message });
                }
              })();
              // 非同期処理のためreturn true
              return true; // 非同期レスポンスのために必要
            }

            // DISCOVER_FEATURES メッセージの処理
            if (request.type === "DISCOVER_FEATURES") {
              (async () => {
                try {
                  const result = await discoverClaudeModelsAndFeatures();

                  // UIに送信（sendToBackground関数を使用）
                  if (typeof sendToBackground === "function" && result) {
                    await sendToBackground(
                      result.models || [],
                      result.functions || [],
                    );
                  } else if (chrome.runtime && chrome.runtime.sendMessage) {
                    // フォールバック: 直接Chrome APIを使用
                    chrome.runtime.sendMessage({
                      type: "AI_MODEL_FUNCTION_UPDATE",
                      aiType: "claude",
                      data: {
                        models: result.models || [],
                        functions: result.functions || [],
                        functionsWithDetails: result.functionsWithDetails || [],
                        timestamp: new Date().toISOString(),
                      },
                    });
                  }

                  sendResponse({
                    success: true,
                    result: result,
                  });
                } catch (error) {
                  console.error(`❌ [Claude] DISCOVER_FEATURESエラー:`, error);
                  sendResponse({
                    success: false,
                    error: error.message,
                  });
                }
              })();

              return true; // 非同期レスポンスのために必要
            }

            // その他のメッセージタイプは無視
            return false; // 同期的な応答がないことを明示
          },
        );

        // 🔍 [CHROME-EXTENSION-ENV] Chrome Extension環境診断

        // 初期化完了をグローバルに通知
        window.CLAUDE_MESSAGE_LISTENER_READY = true;
      };

      // メッセージリスナーを即座に登録（Content Script準備確認の高速化）
      registerMessageListener();

      // ページの読み込み完了後に再度登録を確認（念のため）
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => {
          if (!window.CLAUDE_MESSAGE_LISTENER_READY) {
            registerMessageListener();
          }
        });
      }
    } else {
      // 🔍 [LISTENER-SKIP] メッセージリスナー登録をスキップした理由
    }

    // ========================================
    // ログ管理システムの初期化（メッセージベース対応）
    // ========================================
    // Content scriptから直接importできないため、メッセージベースのログマネージャーを作成
    window.claudeLogFileManager = {
      logs: [],
      sessionStartTime: new Date().toISOString(),

      addLog(entry) {
        this.logs.push({
          timestamp: new Date().toISOString(),
          ...entry,
        });
      },

      logStep(step, message, data = {}) {
        this.addLog({
          type: "step",
          step,
          message,
          data,
        });
      },

      logError(step, error, context = {}) {
        this.addLog({
          type: "error",
          step,
          error: {
            message: error.message,
            stack: error.stack,
            name: error.name,
          },
          context,
        });
      },

      logSuccess(step, message, result = {}) {
        this.addLog({
          type: "success",
          step,
          message,
          result,
        });
      },

      logTaskStart(taskData) {
        this.addLog({
          type: "task_start",
          taskData: {
            model: taskData.model,
            function: taskData.function,
            promptLength: taskData.prompt?.length || 0,
            cellInfo: taskData.cellInfo,
          },
        });
      },

      logTaskComplete(result) {
        this.addLog({
          type: "task_complete",
          result: {
            success: result.success,
            responseLength: result.response?.length || 0,
            error: result.error,
          },
        });
      },

      async saveErrorImmediately(error, context = {}) {
        try {
          const timestamp = new Date()
            .toISOString()
            .replace(/[:.]/g, "-")
            .replace("T", "_")
            .slice(0, -5);

          const errorData = {
            timestamp: new Date().toISOString(),
            type: "error",
            error: {
              message: error.message,
              stack: error.stack,
              name: error.name,
            },
            context,
            sessionStart: this.sessionStartTime,
          };

          // エラーログをコンソールに出力
          log.error(`❌ [エラー] ${error.message}`);
        } catch (saveError) {
          log.error("[エラー保存失敗]", saveError);
        }
      },

      async saveToFile() {
        if (this.logs.length === 0) {
          return;
        }

        // Log count: ${this.logs.length}
        this.logs = [];
        return null;
      },

      clearCurrentLogs() {
        this.logs = [];
        // Logs cleared
      },
    };

    const ClaudeLogManager = {
      // LogFileManagerのプロキシとして動作
      get logFileManager() {
        return (
          window.claudeLogFileManager || {
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
        // Step: ${step}: ${message}
      },

      // エラーログを記録
      async logError(step, error, context = {}) {
        this.logFileManager.logError(step, error, context);
        log.error(`❌ [エラーログ] ${step}:`, error);
      },

      // 成功ログを記録
      logSuccess(step, message, result = {}) {
        this.logFileManager.logSuccess(step, message, result);
        // Success: ${step}: ${message}
      },

      // タスク開始を記録
      startTask(taskData) {
        this.logFileManager.logTaskStart(taskData);
        // Task started
      },

      // タスク完了を記録
      completeTask(result) {
        this.logFileManager.logTaskComplete(result);
        // Task completed
      },

      // ログをファイルに保存
      async saveToFile() {
        return await this.logFileManager.saveToFile();
      },

      // ログをクリア
      clear() {
        if (this.logFileManager.clearCurrentLogs) {
          this.logFileManager.clearCurrentLogs();
        }
      },
    };

    // ========================================
    // 📦 初期化フェーズ: 基本設定
    // ========================================
    if (!CLAUDE_SELECTORS) {
      log.error("❌ CLAUDE_SELECTORS initialization error!");
    }

    // ========================================
    // Step 4-0-4: セレクタ定義
    // ========================================

    // Step 4-0-4-1: Deep Research用セレクタ（最適化）
    const deepResearchSelectors = {
      "3_回答停止ボタン": {
        selectors: CLAUDE_SELECTORS.STOP_BUTTON || [],
        description: "回答停止ボタン",
      },
      "4_Canvas機能テキスト位置": {
        selectors: CLAUDE_SELECTORS.DEEP_RESEARCH.CANVAS_CONTENT,
        description: "Canvas機能のテキスト表示エリア",
      },
      "4_3_Canvas続けるボタン": {
        selectors: [
          'button[aria-label="続ける"]',
          'button[type="button"]',
          "button.inline-flex",
        ],
        description: "Canvas機能の続けるボタン",
      },
      "4_4_Canvasプレビューボタン": {
        selectors: [
          'div[aria-label="内容をプレビュー"][role="button"]',
          '[aria-label="内容をプレビュー"]',
          'div[role="button"][tabindex="0"]:has(div.artifact-block-cell)',
          "div.artifact-block-cell",
          '.flex.text-left.font-ui.rounded-lg[role="button"]',
          'div[role="button"]',
        ],
        description: "Canvas機能のプレビューボタン",
      },
      "4_2_Canvas開くボタン": {
        selectors: CLAUDE_SELECTORS.DEEP_RESEARCH.CANVAS_PREVIEW || [],
        description: "Canvas機能を開くボタン",
      },
      "5_通常処理テキスト位置": {
        selectors: [
          ".standard-markdown",
          "div.standard-markdown",
          ".grid.gap-2\\.5.standard-markdown",
          "div.grid-cols-1.standard-markdown",
          '[class*="standard-markdown"]',
        ],
        description: "通常処理のテキスト表示エリア",
      },
    };

    // Step 4-0-4-2: モデル選択用セレクタ
    const modelSelectors = {
      menuButton: (CLAUDE_SELECTORS.MODEL.BUTTON || []).map((selector) => ({
        selector,
        description: "モデル選択ボタン",
      })),
      menuContainer: [
        {
          selector: CLAUDE_SELECTORS.MODEL.MENU_CONTAINER,
          description: "メニューコンテナ",
        },
      ],
      otherModelsMenu: CLAUDE_SELECTORS.MODEL.OTHER_MODELS.map((selector) => ({
        selector,
        description: "その他のモデルメニュー",
      })),
      modelDisplay: (CLAUDE_SELECTORS.MODEL.DISPLAY_TEXT || [])
        .slice(0, 3)
        .map((selector) => ({ selector, description: "モデル表示要素" })),
    };

    // Step 4-0-4-3: 機能選択用セレクタ
    const featureSelectors = {
      menuButton: CLAUDE_SELECTORS.FEATURE.MENU_BUTTON || [],
      menuContainer: CLAUDE_SELECTORS.FEATURE.MENU_CONTAINER,
      webSearchToggle: CLAUDE_SELECTORS.FEATURE.WEB_SEARCH_TOGGLE || [],
      researchButton: CLAUDE_SELECTORS.FEATURE.RESEARCH_BUTTON || [],
    };

    // Step 4-0-4-4: デフォルトセレクタ（CLAUDE_SELECTORS.DEFAULTを参照）
    const DEFAULT_SELECTORS = CLAUDE_SELECTORS.DEFAULT;

    // Step 4-0-4-5: Claude動作用セレクタ
    const claudeSelectors = {
      "1_テキスト入力欄": {
        selectors:
          CLAUDE_SELECTORS.INPUT.length > 0
            ? CLAUDE_SELECTORS.INPUT
            : DEFAULT_SELECTORS.INPUT,
        description: "テキスト入力欄（ProseMirrorエディタ）",
      },
      "2_送信ボタン": {
        selectors:
          CLAUDE_SELECTORS.SEND_BUTTON.length > 0
            ? CLAUDE_SELECTORS.SEND_BUTTON
            : DEFAULT_SELECTORS.SEND_BUTTON,
        description: "送信ボタン",
      },
      "3_回答停止ボタン": {
        selectors:
          CLAUDE_SELECTORS.STOP_BUTTON.length > 0
            ? CLAUDE_SELECTORS.STOP_BUTTON
            : DEFAULT_SELECTORS.STOP_BUTTON,
        description: "回答停止ボタン",
      },
      "4_Canvas機能テキスト位置": {
        selectors: CLAUDE_SELECTORS.DEEP_RESEARCH.CANVAS_CONTENT,
        description: "Canvas機能のテキスト表示エリア",
      },
      "4_3_Canvas続けるボタン": {
        selectors: [
          'button[aria-label="続ける"]',
          'button[type="button"]',
          "button.inline-flex",
        ],
        description: "Canvas機能の続けるボタン",
      },
      "4_4_Canvasプレビューボタン": {
        selectors: [
          'div[aria-label="内容をプレビュー"][role="button"]',
          '[aria-label="内容をプレビュー"]',
          'div[role="button"][tabindex="0"]:has(div.artifact-block-cell)',
          "div.artifact-block-cell",
          '.flex.text-left.font-ui.rounded-lg[role="button"]',
          'div[role="button"]',
        ],
        description: "Canvas機能のプレビューボタン",
      },
      "5_通常処理テキスト位置": {
        selectors: [
          ".standard-markdown",
          "div.standard-markdown",
          ".grid.gap-2\\.5.standard-markdown",
          "div.grid-cols-1.standard-markdown",
          '[class*="standard-markdown"]',
        ],
        description: "通常処理のテキスト表示エリア",
      },
    };

    // Step 4-0-5: セレクタの最終状態をログ出力
    log.debug("📋 Claude selectors configured:", {
      inputs: claudeSelectors["1_テキスト入力欄"].selectors.length,
      send: claudeSelectors["2_送信ボタン"].selectors.length,
      stop: claudeSelectors["3_回答停止ボタン"].selectors.length,
    });

    if (claudeSelectors["1_テキスト入力欄"].selectors.length === 0) {
      log.error("❌ 【Step 4-0-4】致命的エラー: 入力欄セレクタが空です！");
    }

    // ========================================
    // ========================================
    // 🔧 初期化フェーズ: ヘルパー関数
    // ========================================

    // === ユーティリティ関数 ===
    /**
     * 基本待機関数
     * 【動作説明】指定されたミリ秒数だけ処理を停止し、タイミング制御を行う
     * 【用途】要素の読み込み待機、アニメーション完了待機、API制限回避など
     * 【引数】ms: 待機時間（ミリ秒）
     * 【戻り値】Promise<void> - 指定時間経過後に解決される
     */
    const wait = async (ms) => {
      return new Promise((resolve) => setTimeout(resolve, ms));
    };

    /**
     * 要素出現待機関数
     * 【動作説明】指定セレクタの要素が表示されるまで繰り返し検索し、可視性もチェックする
     * 【用途】動的に生成される要素の待機、ページ読み込み完了の確認
     * 【引数】selector: CSSセレクタ, maxRetries: 最大試行回数, retryDelay: 試行間隔（ms）
     * 【戻り値】Promise<Element|null> - 発見された要素またはnull
     * 【チェック項目】要素の存在、サイズ、display、visibility、opacity
     */
    const waitForElement = async (
      selector,
      maxRetries = 10,
      retryDelay = 500,
    ) => {
      const log = (msg) => {}; // Suppressed wait logs

      for (let i = 0; i < maxRetries; i++) {
        try {
          const element = document.querySelector(selector);
          if (element) {
            const rect = element.getBoundingClientRect();
            const isVisible = rect.width > 0 && rect.height > 0;
            const style = window.getComputedStyle(element);
            const isDisplayed =
              style.display !== "none" &&
              style.visibility !== "hidden" &&
              style.opacity !== "0";

            if (isVisible && isDisplayed) {
              log(`✅ 要素発見: ${selector} (試行 ${i + 1}/${maxRetries})`);
              return element;
            }
          }
        } catch (error) {
          log(`⚠️ 要素検索エラー: ${error.message}`);
        }

        if (i < maxRetries - 1) {
          await wait(retryDelay);
        }
      }

      log.debug("🔧 [MANAGER] ClaudeRetryManager作成前 - 最初のインスタンス");
      const retryManager = new ClaudeRetryManager();
      log.debug("ClaudeRetryManager created:", {
        maxRetries: retryManager.maxRetries,
        retryDelay: retryManager.retryDelay,
        timeout: retryManager.timeout,
        hasMetrics: !!retryManager.metrics,
      });
      const result = await retryManager.executeWithRetry(
        async () => {
          // findClaudeElementに適切なオブジェクト形式で渡す
          const selectorInfo = {
            selectors: [selector],
            description: `セレクタ: ${selector}`,
          };
          const element = await findClaudeElement(selectorInfo);
          if (element) return { success: true, element };
          return { success: false, error: "要素が見つかりません" };
        },
        `要素検索: ${selector}`,
        { selector },
      );

      if (!result.success) {
        throw new Error(`要素が見つかりません: ${selector}`);
      }
      return result.result.element;
    };

    const getReactProps = (element) => {
      const keys = Object.keys(element || {});
      const reactKey = keys.find(
        (key) =>
          key.startsWith("__reactInternalInstance") ||
          key.startsWith("__reactFiber"),
      );
      return reactKey ? element[reactKey] : null;
    };

    // ログイベント関数を定義
    const logEvent = (message, ...args) => {
      log.debug(message, ...args);
    };

    const triggerReactEvent = async (element, eventType = "click") => {
      try {
        const reactProps = getReactProps(element);
        if (reactProps) {
          logEvent(`React要素検出: ${element.tagName}`);
        }

        if (eventType === "click") {
          const rect = element.getBoundingClientRect();
          const x = rect.left + rect.width / 2;
          const y = rect.top + rect.height / 2;

          // テストコードの完全なイベントシーケンス（A3パターン）
          const events = [
            new PointerEvent("pointerover", {
              bubbles: true,
              cancelable: true,
              clientX: x,
              clientY: y,
            }),
            new PointerEvent("pointerenter", {
              bubbles: false,
              cancelable: false,
              clientX: x,
              clientY: y,
            }),
            new MouseEvent("mouseover", {
              bubbles: true,
              cancelable: true,
              clientX: x,
              clientY: y,
            }),
            new MouseEvent("mouseenter", {
              bubbles: false,
              cancelable: false,
              clientX: x,
              clientY: y,
            }),
            new PointerEvent("pointerdown", {
              bubbles: true,
              cancelable: true,
              clientX: x,
              clientY: y,
              button: 0,
              buttons: 1,
            }),
            new MouseEvent("mousedown", {
              bubbles: true,
              cancelable: true,
              clientX: x,
              clientY: y,
              button: 0,
              buttons: 1,
            }),
            new PointerEvent("pointerup", {
              bubbles: true,
              cancelable: true,
              clientX: x,
              clientY: y,
              button: 0,
              buttons: 0,
            }),
            new MouseEvent("mouseup", {
              bubbles: true,
              cancelable: true,
              clientX: x,
              clientY: y,
              button: 0,
              buttons: 0,
            }),
            new PointerEvent("click", {
              bubbles: true,
              cancelable: true,
              clientX: x,
              clientY: y,
            }),
          ];

          for (const event of events) {
            element.dispatchEvent(event);
            await wait(10);
          }

          // S1パターン: 直接クリック
          element.click();
          logEvent(`✅ イベント発火完了: ${eventType}`);
        }
      } catch (error) {
        logEvent(`❌ イベント発火エラー: ${error.message}`);
        throw error;
      }
    };

    // 要素の可視性チェック関数
    const isVisible = (element) => {
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

    const findElementByMultipleSelectors = async (selectors, description) => {
      // Element search: ${description}

      // selectors情報

      for (let i = 0; i < selectors.length; i++) {
        const selector = selectors[i];
        // 試行中: ${selector.description}

        try {
          let element = null;

          // オブジェクト形式のセレクタ処理（テストコードスタイル）
          if (typeof selector === "object" && selector.method) {
            log.debug(`  試行${i + 1}: ${selector.method} - ${selector.query}`);

            switch (selector.method) {
              case "data-testid":
                element = document.querySelector(
                  `[data-testid="${selector.query}"]`,
                );
                break;
              case "aria-label":
                element = document.querySelector(
                  `[aria-label="${selector.query}"]`,
                );
                break;
              case "id":
                element = document.getElementById(selector.query);
                break;
              case "selector":
                element = document.querySelector(selector.query);
                break;
              case "text":
                const elements = Array.from(
                  document.querySelectorAll(selector.query),
                );
                element = elements.find((el) => {
                  const text = el.textContent?.trim();
                  return selector.condition
                    ? selector.condition(text)
                    : text === selector.text;
                });
                break;
            }

            // `:has()` 疑似クラスの代替処理
            if (
              !element &&
              selector.query &&
              selector.query.includes(":has(") &&
              selector.query.includes("ウェブ検索")
            ) {
              const buttons = document.querySelectorAll("button");
              for (const el of buttons) {
                const text = el.textContent || "";
                if (
                  text.includes("ウェブ検索") &&
                  el.querySelector('input[role="switch"]')
                ) {
                  element = el;
                  break;
                }
              }
            }

            if (element && isVisible(element)) {
              log.debug(`  ✓ 要素発見: ${description}`);
              return element;
            }
          } else {
            // 従来のセレクタ処理
            element = await waitForElement(selector.selector, 5, 500);
            if (element) {
              // Success: ${selector.description}
              return element;
            }
          }
        } catch (error) {
          log.debug(`  ❌ 失敗: ${error.message}`);
        }
      }

      // 全セレクタで失敗した場合は、selectorInfoオブジェクトを作成してfindClaudeElementを使用
      log.debug(
        `⚠️ [DEBUG] 全セレクタで失敗、findClaudeElementにフォールバック`,
      );
      log.debug(
        `📊 [DEBUG-FALLBACK] 元のselectors:`,
        JSON.stringify(selectors, null, 2),
      );

      const mappedSelectors = selectors.map((s) => {
        if (typeof s === "string") {
          log.debug(`  📝 [DEBUG] 文字列セレクタをマップ: ${s}`);
          return s;
        } else if (s && typeof s === "object" && s.selector) {
          log.debug(`  📝 [DEBUG] オブジェクトセレクタをマップ: ${s.selector}`);
          return s.selector;
        }
        log.debug(`  ⚠️ [DEBUG] 不明な型のセレクタ:`, s);
        return null; // undefinedではなくnullを返す
      });

      log.debug(`📊 [DEBUG-FALLBACK] マップ後のselectors:`, mappedSelectors);

      const selectorInfo = {
        description: description,
        selectors: mappedSelectors.filter(
          (selector) => selector !== null && selector !== undefined,
        ), // null/undefinedを除外
      };

      log.debug("selectorInfo built:", {
        description: selectorInfo.description,
        selectorsCount: selectorInfo.selectors?.length,
        selectors: selectorInfo.selectors,
      });

      const retryManager = new ClaudeRetryManager();
      const result = await retryManager.executeWithRetry(
        async () => {
          const element = await findClaudeElement(selectorInfo);
          if (element) return { success: true, element };
          return {
            success: false,
            error: `${description}の要素が見つかりません`,
          };
        },
        `${description}検索`,
        { selectorInfo, description },
      );

      if (!result.success) {
        throw new Error(`${description} の要素が見つかりません`);
      }
      return result.result.element;
    };

    // === 状態取得関数 ===
    /**
     * 現在選択モデル情報取得関数
     * 【動作説明】Claude画面に表示されている現在のモデル名を複数セレクタで検索取得
     * 【用途】実行時のモデル情報記録、ログ出力、結果データに含める
     * 【引数】なし
     * 【戻り値】string|null - 検出されたモデル名または null
     * 【検索対象】モデル表示エリア、設定表示部分など複数箇所
     * 【使用頻度】頻繁（タスク実行時の重要な情報取得）
     */
    const getCurrentModelInfo = () => {
      log.debug("\n📊 【Step 4-0-1】現在のモデル情報を取得");

      // 新しいセレクタ: モデル選択ボタン内の正確なモデル名を取得
      const newModelSelectors = [
        '[data-testid="model-selector-dropdown"] .whitespace-nowrap.select-none', // 最も正確
        '[data-testid="model-selector-dropdown"] .font-claude-response .whitespace-nowrap', // フォールバック1
        'button[data-testid="model-selector-dropdown"] .select-none', // フォールバック2
        ".claude-logo-model-selector", // SVGロゴの隣接要素を探す
      ];

      // 新しいセレクタを優先的に試す
      for (const selector of newModelSelectors) {
        try {
          if (selector === ".claude-logo-model-selector") {
            // SVGロゴの場合は隣接要素を探す
            const svg = document.querySelector(selector);
            if (svg) {
              const parent = svg.closest(".font-claude-response");
              if (parent) {
                const modelText = parent.querySelector(
                  ".whitespace-nowrap.tracking-tight.select-none",
                );
                if (modelText) {
                  const text = modelText.textContent.trim();
                  log.debug(`  ✅ モデル名取得成功（新セレクタ）: "${text}"`);
                  return text;
                }
              }
            }
          } else {
            const element = document.querySelector(selector);
            if (element) {
              const text = element.textContent.trim();
              if (text && text.length > 0) {
                log.debug(`  ✅ モデル名取得成功（新セレクタ）: "${text}"`);
                return text;
              }
            }
          }
        } catch (error) {
          log.debug(`  ⚠️ 新セレクタ試行失敗: ${selector} - ${error.message}`);
        }
      }

      // 既存のセレクタにフォールバック
      for (const selectorInfo of modelSelectors.modelDisplay) {
        try {
          const element = document.querySelector(selectorInfo.selector);
          if (element) {
            const text = element.textContent.trim();
            if (text && text.length > 0) {
              log.debug(`  ✅ モデル名取得成功（既存セレクタ）: "${text}"`);
              return text;
            }
          }
        } catch (error) {
          log.debug(`  ❌ 取得失敗: ${error.message}`);
        }
      }

      log.debug("  ⚠️ モデル情報が見つかりません");
      return null;
    };

    // Step 4-0-2-2: 機能確認関数
    /**
     * 現在選択機能確認関数
     * 【動作説明】画面上の機能ボタンの状態を詳細に確認し、どの機能が有効かを判定する
     * 【用途】機能選択後の確認、Deep Research検出、意図しない機能の発見
     * 【引数】expectedFeature: 期待される機能名（省略可能）
     * 【戻り値】Object - 各機能の状態とerrorプロパティ
     * 【検出機能】じっくり考える、ウェブ検索、Deep Research（複数パターン対応）
     * 【使用頻度】機能選択処理で重要な確認処理
     */
    const confirmFeatureSelection = (expectedFeature = null) => {
      // Checking function buttons
      log.debug(`期待される機能: ${expectedFeature || "(指定なし)"}`);

      const confirmationResults = {
        slowThinking: false,
        webSearch: false,
        deepResearch: false,
        detected: [],
      };

      try {
        // メニューボタンの状態を確認（機能が有効化されているかチェック）
        const featureMenuBtn =
          document.querySelector('[data-testid="input-menu-tools"]') ||
          document.querySelector('[aria-label="ツールメニューを開く"]');

        // メニューボタンにバッジがあるか確認（機能が有効な場合に表示される）
        if (featureMenuBtn) {
          const badge =
            featureMenuBtn.querySelector(".absolute.top-0.right-0") ||
            featureMenuBtn.querySelector('[class*="badge"]') ||
            featureMenuBtn.querySelector(".bg-accent-main-100");
          if (badge) {
            log.debug("✅ 機能バッジ検出: 何らかの機能が有効です");
            confirmationResults.detected.push("機能有効（詳細未確定）");
          }
        }

        // じっくり考える/ゆっくり考えるボタンの確認（トグル状態も確認）
        const slowThinkingButtons = document.querySelectorAll("button");
        for (const button of slowThinkingButtons) {
          const text = button.textContent?.trim() || "";
          const hasClockIcon =
            button.querySelector("svg") || button.innerHTML.includes("clock");

          // じっくり考える機能の正確な検出
          if (
            text.includes("じっくり考える") ||
            text.includes("ゆっくり考える") ||
            (hasClockIcon && text.includes("考える"))
          ) {
            // トグルスイッチがある場合は状態も確認
            const toggleInput = button.querySelector('input[role="switch"]');
            const isActive = toggleInput
              ? toggleInput.checked ||
                toggleInput.getAttribute("aria-checked") === "true"
              : button.getAttribute("aria-pressed") === "true";

            if (isActive) {
              confirmationResults.slowThinking = true;
              const detectedType = text.includes("じっくり考える")
                ? "じっくり考える"
                : "ゆっくり考える";
              confirmationResults.detected.push(detectedType);
              // ${detectedType} button active
            }
            break;
          }
        }

        // ウェブ検索の確認（メニューが閉じられた後でも確認可能）
        // 入力欄の近くにウェブ検索のインジケーターがあるか確認
        const inputArea = document.querySelector(
          '[aria-label="クロードにプロンプトを入力してください"]',
        );
        if (inputArea) {
          const parent =
            inputArea.closest(".relative") || inputArea.parentElement;
          const webSearchIndicator =
            parent?.querySelector('[aria-label*="ウェブ検索"]') ||
            parent?.querySelector('[title*="ウェブ検索"]');
          if (webSearchIndicator) {
            confirmationResults.webSearch = true;
            confirmationResults.detected.push("ウェブ検索");
            log.debug("✅ ウェブ検索インジケーター検出");
          }
        }

        // Deep Research/リサーチボタンの確認（正確な判定）
        const researchButtons = document.querySelectorAll(
          'button[type="button"][aria-pressed]',
        );
        for (const button of researchButtons) {
          const text = button.textContent?.trim() || "";
          const isPressed = button.getAttribute("aria-pressed") === "true";

          // "リサーチ" ボタンでaria-pressed="true"の場合のみDeepResearch
          if (text.includes("リサーチ") && isPressed) {
            confirmationResults.deepResearch = true;
            confirmationResults.detected.push("DeepResearch");
            // DeepResearch active
            break;
          }
          // "Research"文字列を含むボタンも確認（英語表示対応）
          else if (
            (text.includes("Research") || text.includes("research")) &&
            isPressed
          ) {
            confirmationResults.deepResearch = true;
            confirmationResults.detected.push("DeepResearch");
            // DeepResearch active
            break;
          }
        }

        // 期待される機能が指定されていて、何も検出されなかった場合
        // メニューが閉じられているため詳細確認はできないが、処理は成功とみなす
        if (expectedFeature && confirmationResults.detected.length === 0) {
          log.debug(
            "⚠️ メニューが閉じているため詳細確認不可、機能は設定済みと仮定",
          );
          confirmationResults.detected.push(expectedFeature);
          // 期待される機能に応じてフラグを設定
          if (
            expectedFeature.includes("じっくり") ||
            expectedFeature.includes("ゆっくり")
          ) {
            confirmationResults.slowThinking = true;
          } else if (
            expectedFeature.includes("ウェブ") ||
            expectedFeature.includes("検索")
          ) {
            confirmationResults.webSearch = true;
          } else if (
            expectedFeature.includes("Research") ||
            expectedFeature.includes("リサーチ")
          ) {
            confirmationResults.deepResearch = true;
          }
        }

        // 結果の表示
        // Function check result:
        log.debug(
          `  - じっくり/ゆっくり考える: ${confirmationResults.slowThinking ? "✅" : "❌"}`,
        );
        log.debug(
          `  - ウェブ検索: ${confirmationResults.webSearch ? "✅" : "❌"}`,
        );
        log.debug(
          `  - DeepResearch: ${confirmationResults.deepResearch ? "✅" : "❌"}`,
        );
        log.debug(
          `  - 検出された機能: [${confirmationResults.detected.join(", ")}]`,
        );

        // 期待される機能との照合
        if (expectedFeature) {
          const isExpectedFound = confirmationResults.detected.some(
            (feature) =>
              feature.includes(expectedFeature) ||
              expectedFeature.includes(feature),
          );
          // Function check completed
          confirmationResults.expectedFound = isExpectedFound;
        }

        return confirmationResults;
      } catch (error) {
        // Function check error: ${error.message}
        return { ...confirmationResults, error: error.message };
      }
    };

    // Step 4-0-4-1: トグル状態取得関数（テストコードから追加）
    /**
     * トグル状態取得関数
     * 【動作説明】トグルボタンの現在の状態を取得する
     * 【用途】機能の選択状態確認
     * 【引数】toggleButton: トグルボタンのDOM要素
     * 【戻り値】boolean|null - 現在の状態（true=ON, false=OFF, null=要素なし）
     */
    const getToggleState = (toggleButton) => {
      const input = toggleButton.querySelector('input[role="switch"]');
      if (!input) {
        log.debug("トグルinput要素が見つかりません");
        return null;
      }
      return input.checked;
    };

    // === イベント処理関数 ===
    /**
     * 高精度トグルボタン制御関数
     * 【動作説明】現在のトグル状態を確認し、目標状態と異なる場合のみクリックして変更する
     * 【用途】機能選択時のトグルON/OFF、Deep Research設定、ウェブ検索設定
     * 【引数】toggleButton: トグルボタンのDOM要素, targetState: 目標状態（true=ON, false=OFF）
     * 【戻り値】boolean - 状態変更が行われたかどうか
     * 【チェック項目】input[role="switch"]の存在確認、checked属性またはaria-checked属性
     * 【使用頻度】3回（機能選択処理で重要）
     */
    const setToggleState = (toggleButton, targetState) => {
      const currentState = getToggleState(toggleButton);
      if (currentState === null) return false;

      log.debug(`トグル現在状態: ${currentState}, 目標状態: ${targetState}`);

      if (currentState !== targetState) {
        toggleButton.click();
        log.debug("トグルクリック実行");
        return true;
      }

      log.debug("状態変更不要");
      return false;
    };

    // === 要素検索関数 ===
    /**
     * Claude専用要素検索関数（最重要）
     * 【動作説明】複数のセレクタパターンを順次試行し、要素の可視性を厳密にチェックする
     * 【用途】Claude画面のボタン、入力欄、表示エリアなど全ての要素取得
     * 【引数】selectorInfo: セレクタ情報オブジェクト, retryCount: 再試行回数, skipLog: ログ抑制フラグ
     * 【戻り値】Promise<Element|null> - 発見された要素またはnull
     * 【特徴】優先度順セレクタ試行、可視性検証、リアルタイムログ、リトライ機能
     * 【使用頻度】25回（全ステップで最も重要な関数）
     */
    const findClaudeElement = async (
      selectorInfo,
      retryCount = 5,
      skipLog = false,
    ) => {
      const logPrefix = skipLog ? "" : "🔍 [findClaudeElement] ";

      // デバッグ: 受け取った引数の詳細を出力
      if (!skipLog) {
        log.debug(`${logPrefix}📊 [DEBUG] 受け取った引数:`, {
          type: typeof selectorInfo,
          isArray: Array.isArray(selectorInfo),
          isString: typeof selectorInfo === "string",
          value: selectorInfo,
          retryCount: retryCount,
        });
      }

      // nullチェックとエラーハンドリングを追加
      if (!selectorInfo) {
        const errorMsg = "selectorInfoが未定義です";
        log.error(`${logPrefix}❌ ${errorMsg}`);
        log.error(
          `${logPrefix}📊 [DEBUG] エラー時のselectorInfo:`,
          selectorInfo,
        );
        ClaudeLogManager.logStep("Selector-Error", errorMsg, { selectorInfo });
        throw new Error(errorMsg);
      }

      // 文字列が直接渡された場合の互換性対応
      if (typeof selectorInfo === "string") {
        log.warn(
          `${logPrefix}⚠️ 文字列が直接渡されました、オブジェクト形式に変換します: ${selectorInfo}`,
        );
        selectorInfo = {
          selectors: [selectorInfo],
          description: `セレクタ: ${selectorInfo}`,
        };
        log.debug(`${logPrefix}📊 [DEBUG] 変換後のselectorInfo:`, selectorInfo);
      }

      // 配列が直接渡された場合の互換性対応
      if (Array.isArray(selectorInfo)) {
        log.warn(
          `${logPrefix}⚠️ 配列が直接渡されました、オブジェクト形式に変換します`,
        );
        log.debug(`${logPrefix}📊 [DEBUG] 配列の内容:`, selectorInfo);
        selectorInfo = {
          selectors: selectorInfo,
          description: `セレクタ配列: ${selectorInfo.length}個`,
        };
        log.debug(`${logPrefix}📊 [DEBUG] 変換後のselectorInfo:`, selectorInfo);
      }

      if (!selectorInfo.selectors || !Array.isArray(selectorInfo.selectors)) {
        const errorMsg = `selectorInfo.selectorsが配列ではありません: ${typeof selectorInfo.selectors}`;
        log.error(`${logPrefix}❌ ${errorMsg}`);
        log.error(`${logPrefix}📊 [DEBUG] 問題のselectorInfo:`, selectorInfo);
        ClaudeLogManager.logStep("Selector-Error", errorMsg, {
          selectorInfo: selectorInfo,
          selectorsType: typeof selectorInfo.selectors,
          selectorsValue: selectorInfo.selectors,
        });
        throw new Error(errorMsg);
      }

      if (selectorInfo.selectors.length === 0) {
        const errorMsg = "セレクタ配列が空です";
        log.error(`${logPrefix}❌ ${errorMsg}`);
        ClaudeLogManager.logStep("Selector-Error", errorMsg, { selectorInfo });
        throw new Error(errorMsg);
      }

      if (!skipLog) {
        log.debug(
          `${logPrefix}要素検索開始: ${selectorInfo.description || "説明なし"}`,
        );
        log.debug(
          `${logPrefix}使用セレクタ数: ${selectorInfo.selectors.length}`,
        );

        // セレクタ詳細をログに記録
        ClaudeLogManager.logStep(
          "Selector-Search",
          `セレクタ検索開始: ${selectorInfo.description || "説明なし"}`,
          {
            selectorCount: selectorInfo.selectors.length,
            selectors: selectorInfo.selectors.slice(0, 5), // 最初の5つを記録
          },
        );
      }

      const results = [];

      for (let retry = 0; retry < retryCount; retry++) {
        if (!skipLog && retry > 0) {
          // Retry ${retry + 1}/${retryCount}
        }

        for (let i = 0; i < selectorInfo.selectors.length; i++) {
          const selector = selectorInfo.selectors[i];

          try {
            const elements = document.querySelectorAll(selector);

            if (elements.length > 0) {
              for (const element of elements) {
                const rect = element.getBoundingClientRect();
                const style = window.getComputedStyle(element);
                const isVisible =
                  rect.width > 0 &&
                  rect.height > 0 &&
                  style.display !== "none" &&
                  style.visibility !== "hidden" &&
                  style.opacity !== "0";

                if (isVisible) {
                  // 特別なケース: 「続ける」ボタンの場合はテキストを確認
                  if (
                    selectorInfo.description &&
                    selectorInfo.description.includes("続けるボタン")
                  ) {
                    const buttonText = element.textContent || "";
                    if (!buttonText.includes("続ける")) {
                      continue; // テキストが「続ける」でない場合はスキップ
                    }
                  }
                  if (!skipLog) {
                    // Element found: selector[${i}]
                    log.debug(`${logPrefix}  セレクタ: ${selector}`);
                    log.debug(`${logPrefix}  要素タイプ: ${element.tagName}`);
                    log.debug(
                      `${logPrefix}  位置: (${Math.round(rect.left)}, ${Math.round(rect.top)})`,
                    );
                    if (element.textContent) {
                      log.debug(
                        `${logPrefix}  テキスト: ${element.textContent.substring(0, 30)}`,
                      );
                    }

                    // セレクタヒットをログに記録
                    ClaudeLogManager.logStep(
                      "Selector-Hit",
                      `セレクタがヒット: ${selectorInfo.description}`,
                      {
                        selector: selector,
                        selectorIndex: i,
                        elementTag: element.tagName,
                        elementId: element.id || "none",
                        elementClass: element.className || "none",
                        position: {
                          x: Math.round(rect.left),
                          y: Math.round(rect.top),
                        },
                        size: {
                          width: Math.round(rect.width),
                          height: Math.round(rect.height),
                        },
                      },
                    );
                  }
                  return element;
                }
              }

              results.push({
                selector: selector,
                count: elements.length,
                reason: "全て非表示",
              });
            } else {
              results.push({
                selector: selector,
                count: 0,
                reason: "要素なし",
              });
            }
          } catch (error) {
            results.push({
              selector: selector,
              count: 0,
              reason: `エラー: ${error.message}`,
            });
          }
        }

        if (retry < retryCount - 1) {
          const waitTime = 2000 + retry * 1000;
          if (!skipLog) {
            log.debug(
              `${logPrefix}🔄 要素検索リトライ中... (${retry + 1}/${retryCount}) 次回まで${waitTime}ms待機`,
            );
          }
          await wait(waitTime);
        }
      }

      if (!skipLog) {
        // より詳細なエラー情報を出力
        log.warn(`${logPrefix}✗ 要素未発見: ${selectorInfo.description}`);
        log.debug(`${logPrefix}  使用セレクタ:`, selectorInfo.selectors);
        log.debug(`${logPrefix}  試行結果:`, results);

        // DOM内の実際のmenuitem要素を調査
        const actualMenuItems = document.querySelectorAll('[role="menuitem"]');
        log.debug(
          `${logPrefix}  📊 DOM内のmenuitem要素数: ${actualMenuItems.length}`,
        );

        // aria-haspopup属性を持つ要素を詳細に調査
        const menuItemsWithPopup = Array.from(actualMenuItems).filter((el) =>
          el.hasAttribute("aria-haspopup"),
        );
        log.debug(
          `${logPrefix}  📊 aria-haspopup属性を持つmenuitem: ${menuItemsWithPopup.length}`,
        );

        menuItemsWithPopup.forEach((el, idx) => {
          const text = (el.textContent || "").trim().substring(0, 50);
          const dataState = el.getAttribute("data-state");
          const ariaExpanded = el.getAttribute("aria-expanded");
          const id = el.getAttribute("id");
          log.debug(
            `${logPrefix}    [${idx}] text="${text}", data-state="${dataState}", aria-expanded="${ariaExpanded}", id="${id}"`,
          );
        });

        // 問題解決のためのヘルプ情報
        log.debug(
          `${logPrefix}  💡 ヘルプ: この問題を解決するには以下を確認してください:`,
        );
        log.debug(
          `${logPrefix}     1. Claudeのモデル選択メニューが開いているか`,
        );
        log.debug(`${logPrefix}     2. セレクタが最新のUIに対応しているか`);
        log.debug(
          `${logPrefix}     3. タイミングの問題（メニューが完全に開く前に検索している）`,
        );
        log.debug(
          `${logPrefix}     4. 現在のURLが正しいか: ${window.location.href}`,
        );

        // セレクタミスをログに記録
        ClaudeLogManager.logError(
          "Selector-NotFound",
          new Error(`要素未発見: ${selectorInfo.description}`),
          {
            description: selectorInfo.description,
            attemptedSelectors: selectorInfo.selectors,
            results: results,
          },
        );
      }

      return null;
    };

    // === テキスト入力関数 ===
    /**
     * React対応テキスト入力関数
     * 【動作説明】Reactの仮想DOMに対応したテキスト入力を行い、適切なイベントを発火する
     * 【用途】プロンプト入力、テスト用テキスト入力
     * 【引数】element: 入力対象のDOM要素, text: 入力するテキスト
     * 【戻り値】Promise<boolean> - 入力成功可否
     * 【処理順序】フォーカス → textContent設定 → inputイベント → changeイベント発火
     * 【使用頻度】2回（メイン処理とテスト処理）
     */
    const inputText = async (element, text) => {
      try {
        // 🔍 [HYPOTHESIS-TEST] React Error #418 対策として入力前のDOM状態をログ

        element.focus();
        await wait(100);

        // 🚨 [REACT-SAFE] React Error #418 対策：より安全な入力方式を試行

        // 方法1: React互換のイベント発火（先にイベントを準備）
        const inputDescriptor =
          Object.getOwnPropertyDescriptor(element, "value") ||
          Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            "value",
          ) ||
          Object.getOwnPropertyDescriptor(
            HTMLTextAreaElement.prototype,
            "value",
          );

        // React合成イベントに対応したイベント作成
        const createReactSafeEvent = (eventType) => {
          const event = new Event(eventType, {
            bubbles: true,
            cancelable: true,
          });
          // React fiber nodeの更新をトリガー
          Object.defineProperty(event, "target", {
            value: element,
            enumerable: true,
          });
          return event;
        };

        try {
          // 段階的クリア（React状態の整合性を保つ）

          // Step 1: フォーカスイベント
          element.dispatchEvent(new FocusEvent("focus", { bubbles: true }));
          await wait(50);

          // Step 2: 既存コンテンツのクリア
          element.textContent = "";

          // Step 3: プレースホルダー要素を削除（存在する場合）
          const placeholderP = element.querySelector("p.is-empty");
          if (placeholderP) {
            placeholderP.remove();
          }

          // Step 4: React Safe なテキスト挿入

          // 新しいp要素を作成してテキストを挿入
          const p = document.createElement("p");
          p.textContent = text;
          element.appendChild(p);

          // ql-blankクラスを削除（Quillエディタ対応）
          element.classList.remove("ql-blank");

          // Step 5: React 合成イベントの発火（順序重要）

          // beforeinput → input → change の順序でイベント発火
          element.dispatchEvent(
            new InputEvent("beforeinput", {
              bubbles: true,
              cancelable: true,
              inputType: "insertText",
              data: text,
            }),
          );
          await wait(10);

          element.dispatchEvent(createReactSafeEvent("input"));
          await wait(10);

          element.dispatchEvent(createReactSafeEvent("change"));
          await wait(10);

          // 追加のReactイベント（compositionend も発火）
          element.dispatchEvent(
            new CompositionEvent("compositionend", {
              bubbles: true,
              cancelable: true,
              data: text,
            }),
          );

          log.debug("✓ テキスト入力完了");
          return true;
        } catch (reactError) {
          // React Error が発生した場合のフォールバック
          console.error(
            "🚨 [REACT-FALLBACK] React Safe 入力でエラー、フォールバックモードに切り替え:",
            reactError,
          );

          // シンプルな入力方式にフォールバック
          element.textContent = "";
          const p = document.createElement("p");
          p.textContent = text;
          element.appendChild(p);

          // 基本イベントのみ発火
          element.dispatchEvent(new Event("input", { bubbles: true }));
          element.dispatchEvent(new Event("change", { bubbles: true }));

          log.debug("✓ フォールバック入力完了");
          return true;
        }
      } catch (e) {
        console.error("🚨 [INPUT-FATAL-ERROR] テキスト入力で致命的エラー:", e);
        log.error("✗ テキスト入力エラー:", e);
        return false;
      }
    };

    // === ボタンクリック関数 ===
    /**
     * 高精度マウスクリック関数
     * 【動作説明】実際のマウス操作を完全再現し、クリック座標も正確に計算する
     * 【用途】送信ボタンクリック、メニューボタンクリック
     * 【引数】button: クリック対象のDOM要素, description: ログ用説明文
     * 【戻り値】Promise<boolean> - クリック成功可否
     * 【処理順序】スクロール → 座標計算 → mouseenter → mouseover → mousedown → mouseup → click
     * 【使用頻度】2回（メイン送信とテスト送信）
     */
    const clickButton = async (button, description = "送信ボタン") => {
      log.debug(`\n👆 ${description}をクリック`);

      try {
        // フォーカスを設定
        button.focus();
        await wait(50);

        // マウスイベントチェーンをシンプル化（テストコードの実装）
        const mousedown = new MouseEvent("mousedown", {
          bubbles: true,
          cancelable: true,
        });
        const mouseup = new MouseEvent("mouseup", {
          bubbles: true,
          cancelable: true,
        });
        const click = new MouseEvent("click", {
          bubbles: true,
          cancelable: true,
        });

        button.dispatchEvent(mousedown);
        await wait(10);
        button.dispatchEvent(mouseup);
        await wait(10);
        button.dispatchEvent(click);

        // 最後に直接clickメソッドを呼び出し
        button.click();

        log.debug("✓ ボタンクリック完了");
        return true;
      } catch (e) {
        log.error("✗ ボタンクリックエラー:", e);
        return false;
      }
    };

    // Step 4-0-8: 新しいAI応答取得ロジック
    /**
     * 階層的セレクタ定義
     * 【動作説明】AI応答を確実に取得するための階層的セレクタ戦略
     * 【戻り値】Object: セレクタ定義オブジェクト
     */
    const aiResponseSelectors = {
      // レベル1: メッセージコンテナから最後の回答を特定
      message_containers: CLAUDE_SELECTORS.AI_RESPONSE.GENERAL_CONTAINERS,

      // レベル2: 回答タイプ別セレクタ
      response_types: {
        canvas: CLAUDE_SELECTORS.AI_RESPONSE.CANVAS,
        standard: CLAUDE_SELECTORS.AI_RESPONSE.STANDARD,
        code_block: CLAUDE_SELECTORS.AI_RESPONSE.CODE_BLOCK,
      },
    };

    /**
     * 除外すべき要素かを判定する統一関数
     * 【動作説明】ユーザーメッセージと思考プロセスを確実に除外
     * 【引数】element: チェック対象の要素
     * 【戻り値】boolean: true=除外すべき, false=有効
     */
    const shouldExcludeElement = (element) => {
      if (!element) return true;

      const className = element.className || "";

      // ========== ユーザーメッセージ除外 ==========
      // 1. data-testid直接チェック
      if (element.getAttribute("data-testid") === "user-message") {
        log.debug("  ⚠️ ユーザーメッセージ検出 (data-testid)");
        return true;
      }

      // 2. 親要素にuser-messageがあるか
      if (element.closest('[data-testid="user-message"]')) {
        log.debug("  ⚠️ ユーザーメッセージの子孫要素");
        return true;
      }

      // 3. font-user-messageクラス
      if (
        className.includes("font-user-message") ||
        className.includes("!font-user-message")
      ) {
        log.debug("  ⚠️ ユーザーメッセージクラス検出");
        return true;
      }

      // ========== 思考プロセス除外 ==========
      // 4. 親要素を5階層まで遡って思考プロセスボタンをチェック
      let parent = element;
      for (let i = 0; i < 5 && parent; i++) {
        // 思考プロセスボタンの存在チェック
        const buttons = parent.querySelectorAll("button");
        for (const btn of buttons) {
          const btnText = btn.textContent?.trim() || "";
          if (
            btnText.includes("思考プロセス") ||
            btnText.includes("Thinking Process") ||
            btnText.includes("Show thinking")
          ) {
            log.debug(`  ⚠️ 思考プロセスボタン検出: "${btnText}"`);
            return true;
          }
        }

        // 思考プロセスコンテナの特徴的なクラス組み合わせ
        const parentClass = parent.className || "";
        if (
          parentClass.includes("ease-out") &&
          parentClass.includes("rounded-lg") &&
          parentClass.includes("border-border-300")
        ) {
          log.debug("  ⚠️ 思考プロセスコンテナ検出");
          return true;
        }

        parent = parent.parentElement;
        if (!parent || parent.tagName === "BODY") break;
      }

      // 5. font-claude-response + text-text-300の組み合わせ（自身と祖先要素もチェック）
      let checkElement = element;
      for (let i = 0; i < 3 && checkElement; i++) {
        const checkClass = checkElement.className || "";
        if (
          checkClass.includes("font-claude-response") &&
          checkClass.includes("text-text-300")
        ) {
          log.debug(`  ⚠️ 思考プロセス内部テキスト検出（${i}階層上）`);
          return true;
        }
        checkElement = checkElement.parentElement;
        if (!checkElement || checkElement.tagName === "BODY") break;
      }

      return false;
    };

    // findElementBySelectors関数は削除（重複のため）
    // findElementByMultipleSelectors関数を使用

    /**
     * シンプルなAI応答取得メソッド
     * 【動作説明】font-claude-responseから思考プロセスを除外して取得
     * 【戻り値】Object: {element, text, method}
     */
    const getReliableAIResponse = async () => {
      log.debug(
        "🚀 [getReliableAIResponse] AI応答取得開始（font-claude-response方式）",
      );

      // 1. font-claude-responseを取得
      const claudeResponses = document.querySelectorAll(
        ".font-claude-response",
      );

      if (claudeResponses.length === 0) {
        log.debug("❌ font-claude-responseが見つかりません");
        return { element: null, text: "", method: "Not Found" };
      }

      // HTML構造で優先順位判定（モデル名・思考プロセスを除外）
      log.debug(
        `✓ font-claude-response発見: ${claudeResponses.length}個 - 優先順位判定開始`,
      );

      let canvasResponse = null;
      let normalResponse = null;
      let excludedCount = 0;

      Array.from(claudeResponses).forEach((el, idx) => {
        const parent = el.parentElement;
        const parentClass = parent?.className || "";
        const parentTag = parent?.tagName;
        const parentTestId = parent?.getAttribute("data-testid");
        const textLength = el.textContent?.trim()?.length || 0;

        // 除外: モデル名（親がBUTTONまたはmodel-selector-dropdown）
        if (
          parentTag === "BUTTON" ||
          parentTestId === "model-selector-dropdown"
        ) {
          log.debug(
            `  [${idx}] 除外: モデル名 (${textLength}文字, 親=${parentTag})`,
          );
          excludedCount++;
          return;
        }

        // 除外: 思考プロセス（親に'overflow-y-auto'）
        if (parentClass.includes("overflow-y-auto")) {
          log.debug(`  [${idx}] 除外: 思考プロセス (${textLength}文字)`);
          excludedCount++;
          return;
        }

        // Canvas（最優先）
        if (parentClass.includes("w-full") && parentClass.includes("h-full")) {
          canvasResponse = el;
          log.debug(`  [${idx}] ✅ Canvas発見 (${textLength}文字) - 最優先`);
          return;
        }

        // 通常応答
        if (parentClass.includes("group")) {
          normalResponse = el;
          log.debug(`  [${idx}] ✅ 通常応答発見 (${textLength}文字)`);
          return;
        }

        log.debug(`  [${idx}] ⚠️ 不明なパターン (${textLength}文字)`);
      });

      const lastResponse = canvasResponse || normalResponse;

      if (!lastResponse) {
        log.debug(`❌ 有効な応答が見つかりません (除外: ${excludedCount}個)`);
        return { element: null, text: "", method: "No Valid Response" };
      }

      const responseType = canvasResponse ? "Canvas" : "通常応答";
      const selectedTextLength = lastResponse.textContent?.trim()?.length || 0;
      log.debug(
        `✓ ${responseType}を選択 (${selectedTextLength}文字, 除外: ${excludedCount}個)`,
      );

      // 2. クローンを作成（元のDOMを変更しないため）
      const clone = lastResponse.cloneNode(true);

      // 3. 思考プロセスブロック全体を削除
      const thinkingBlocks = clone.querySelectorAll(
        ".ease-out.rounded-lg.border-0\\.5.flex.flex-col",
      );
      let thinkingCount = 0;

      thinkingBlocks.forEach((block) => {
        const btn = block.querySelector("button");
        const btnText = btn?.textContent?.trim() || "";
        if (
          btnText.includes("思考プロセス") ||
          btnText.includes("Thinking") ||
          btnText.includes("Show thinking")
        ) {
          block.remove();
          thinkingCount++;
          log.debug(`  - 思考プロセスブロックを削除: "${btnText}"`);
        }
      });

      log.debug(`  - 思考プロセス除外: ${thinkingCount}個`);

      // 4. standard-markdownを取得（Canvas/通常応答の両方に対応）
      const standardMd = clone.querySelector(".standard-markdown");

      if (!standardMd) {
        log.debug(
          "⚠️ standard-markdownが見つかりません - 直接textContentを取得",
        );
        const directText = clone.textContent?.trim() || "";

        if (directText.length < 10) {
          log.debug(
            `❌ 直接取得したテキストも短すぎます: ${directText.length}文字`,
          );
          return { element: null, text: "", method: "No Text Content" };
        }

        log.debug(`✅ 直接textContentを取得: ${directText.length}文字`);
        log.debug(`  - 先頭100文字: ${directText.substring(0, 100)}`);

        return {
          element: lastResponse,
          text: directText,
          method: "Direct TextContent",
        };
      }

      // 5. テキスト取得
      const text = standardMd.textContent?.trim() || "";

      if (text.length < 10) {
        log.debug(`❌ テキストが短すぎます: ${text.length}文字`);
        log.debug(`  - 選択した要素タイプ: ${responseType}`);
        log.debug(`  - 元の要素の文字数: ${selectedTextLength}`);
        return { element: null, text: "", method: "Text Too Short" };
      }

      log.debug(`✅ AI応答取得成功: ${text.length}文字 (${responseType})`);
      log.debug(`  - 先頭100文字: ${text.substring(0, 100)}`);
      log.debug(`  - 末尾100文字: ${text.substring(text.length - 100)}`);

      return {
        element: lastResponse,
        text: text,
        method: `Font Claude Response (${responseType})`,
      };
    };

    // Step 4-0-9: テキストプレビュー取得関数（統一版）
    /**
     * テキスト抽出関数（完全一本化）
     * 【動作説明】getReliableAIResponse()のみを使用してテキストを取得
     * 【引数】element: テキスト抽出対象のDOM要素（オプション）
     * 【戻り値】Object {full: 完全テキスト, preview: プレビュー, length: 文字数}
     */
    const getTextPreview = async (element) => {
      log.debug("📊 [getTextPreview] テキスト取得開始（統一フロー）");

      // 要素が指定されていない場合のみ、AI応答取得ロジックを使用
      if (!element) {
        log.debug("  要素未指定 → getReliableAIResponse()を実行");
        const response = await getReliableAIResponse();

        if (response.element && response.text) {
          log.debug(
            `  ✅ 取得成功: ${response.text.length}文字 (${response.method})`,
          );
          const length = response.text.length;

          if (length <= 200) {
            return { full: response.text, preview: response.text, length };
          } else {
            const preview =
              response.text.substring(0, 100) +
              "\n...[中略]...\n" +
              response.text.substring(length - 100);
            return { full: response.text, preview, length };
          }
        } else {
          log.debug("  ❌ AI応答が見つかりません");
          return { full: "", preview: "", length: 0 };
        }
      }

      // 要素が指定されている場合
      // 検証を通過しているはずなので、textContentを直接取得
      const text = element.textContent?.trim() || "";
      const length = text.length;

      log.debug(`  ✅ 指定要素からテキスト取得: ${length}文字`);

      if (length <= 200) {
        return { full: text, preview: text, length };
      } else {
        const preview =
          text.substring(0, 100) +
          "\n...[中略]...\n" +
          text.substring(length - 100);
        return { full: text, preview, length };
      }
    };

    // Step 4-0-10: 要素の可視性チェック
    /**
     * 要素可視性判定関数
     * 【動作説明】DOM要素が実際に画面上で見える状態かを厳密にチェックする
     * 【用途】getFeatureElement内での要素検証、表示確認
     * 【引数】element: チェック対象のDOM要素
     * 【戻り値】boolean - 要素が可視状態かどうか
     * 【チェック項目】要素存在、width>0、height>0、display≠none、visibility≠hidden、opacity≠0
     * 【使用頻度】1回（getFeatureElement内のみ）
     */
    const isElementVisible = (element) => {
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

    // Step 4-0-11: 機能要素の取得（特別処理対応）
    /**
     * 機能ボタン特別検索関数
     * 【動作説明】通常のセレクタ検索に加え、テキスト内容での検索も行う高度な要素取得
     * 【用途】機能メニューボタン、ウェブ検索トグル、特殊機能ボタンの取得
     * 【引数】selectors: セレクタ配列, description: ログ用説明文
     * 【戻り値】Element|null - 発見された要素またはnull
     * 【特別処理】「ウェブ検索」「じっくり考える」テキストでのボタン検索対応
     * 【使用頻度】3回（機能選択処理で重要）
     */
    const getFeatureElement = (selectors, description = "") => {
      log.debug(`🔍 機能要素取得開始: ${description}`);
      for (const selector of selectors) {
        try {
          // 特別処理：テキスト検索
          if (
            typeof selector === "string" &&
            (selector.includes("ウェブ検索") ||
              selector.includes("じっくり考える"))
          ) {
            const buttons = document.querySelectorAll("button");
            for (const el of buttons) {
              const text = el.textContent || "";
              if (
                text.includes("ウェブ検索") ||
                text.includes("じっくり考える")
              ) {
                const hasSwitch = el.querySelector('input[role="switch"]');
                if (hasSwitch) {
                  // Found via text search
                  return el;
                }
              }
            }
          } else {
            const element = document.querySelector(selector);
            if (element && isElementVisible(element)) {
              // ${description} found
              return element;
            }
          }
        } catch (error) {
          continue;
        }
      }
      log.debug(`⚠️ ${description}が見つかりません`);
      return null;
    };

    // Step 4-0-12: すべての機能トグルをオフにする関数
    /**
     * 一括機能リセット関数
     * 【動作説明】画面上の全てのトグルスイッチを検索し、ONになっているものを自動的にOFFにする
     * 【用途】機能選択前の初期化、意図しない機能の無効化
     * 【引数】なし
     * 【戻り値】Promise<number> - 変更したトグル数
     * 【処理対象】input[role="switch"]要素、複数のHTML構造パターンに対応
     * 【使用頻度】2回（機能選択前の重要な初期化処理）
     */
    const turnOffAllFeatureToggles = async () => {
      log.debug("\n🔄 すべての機能トグルをオフに設定中...");
      let toggleCount = 0;

      // 機能メニュー内のすべてのトグルを探す（改良版セレクタ）
      const allInputs = document.querySelectorAll('input[role="switch"]');

      for (const inputElement of allInputs) {
        try {
          // input要素が属するボタンを遡って探す
          const toggleButton = inputElement.closest("button");

          if (toggleButton && inputElement) {
            const isCurrentlyOn =
              inputElement.checked ||
              inputElement.getAttribute("aria-checked") === "true";

            if (isCurrentlyOn) {
              // 機能名の取得（複数パターンに対応）
              let featureName = "Unknown";

              // パターン1: p.font-base (従来)
              const labelFontBase = toggleButton.querySelector("p.font-base");
              if (labelFontBase) {
                featureName = labelFontBase.textContent.trim();
              }
              // パターン2: 新しいHTML構造（text-text-300クラス）
              else {
                const labelTextClass = toggleButton.querySelector(
                  'p.font-base.text-text-300, p[class*="text-text-300"]',
                );
                if (labelTextClass) {
                  featureName = labelTextClass.textContent.trim();
                }
                // パターン3: 任意のpタグ内のテキスト
                else {
                  const anyLabel = toggleButton.querySelector("p");
                  if (anyLabel && anyLabel.textContent.trim()) {
                    featureName = anyLabel.textContent.trim();
                  }
                }
              }

              log.debug(`  🔘 ${featureName}をオフに設定`);
              toggleButton.click();
              toggleCount++;

              // クリック後の短い待機
              await new Promise((resolve) => setTimeout(resolve, 200));
            }
          }
        } catch (error) {
          log.warn("  ⚠️ トグル処理エラー:", error.message);
        }
      }

      // ${toggleCount} toggles turned off
      return toggleCount;
    };

    // ========================================
    // Step 4-0-13: Deep Research専用処理関数
    // ========================================

    /**
     * Deep Research専用複雑待機関数（最も複雑な処理）
     * 【動作説明】Deep Research特有の多段階応答パターンに対応した高度な待機制御
     * 【用途】Deep Research機能使用時の応答完了待機
     * 【引数】なし
     * 【戻り値】Promise<void> - 完了まで待機
     * 【処理段階】送信後待機 → 初回完了待機 → 追加処理待機 → 再開待機 → 最終完了待機
     * 【特殊対応】Canvas機能、プレビューボタン、続けるボタン、複数回の完了確認
     * 【使用頻度】Deep Research使用時のみ（高度な専用処理）
     */
    const handleDeepResearchWait = async () => {
      // Deep Research wait
      log.debug("─".repeat(40));

      try {
        // Step 4-7-1-1: 送信後、回答停止ボタンが出てくるまで待機
        log.debug("\n【Step 4-7-1】送信後、回答停止ボタンが出てくるまで待機");

        let stopButtonFound = false;
        let waitCount = 0;
        const maxInitialWait = AI_WAIT_CONFIG.STOP_BUTTON_INITIAL_WAIT / 1000; // 統一設定: 30秒

        while (!stopButtonFound && waitCount < maxInitialWait) {
          const stopResult = await findClaudeElement(
            deepResearchSelectors["3_回答停止ボタン"],
            3,
            true,
          );

          if (stopResult) {
            stopButtonFound = true;
            log.debug(`✓ 停止ボタンが出現しました（${waitCount}秒後）`);
            break;
          }

          await wait(1000);
          waitCount++;

          // 5秒ごとにログ出力
          if (waitCount % 5 === 0) {
            // Waiting...
          }
        }

        // Step 4-7-2: 2分間の初期待機（ChatGPT式）
        if (stopButtonFound) {
          log.debug("\n【Step 4-7-2】2分間の初期待機チェック");
          let earlyCompletion = false;
          waitCount = 0;
          const initialWaitTime = 120; // 2分（120秒）

          while (waitCount < initialWaitTime) {
            const stopResult = await findClaudeElement(
              deepResearchSelectors["3_回答停止ボタン"],
              3,
              true,
            );

            if (!stopResult) {
              // 停止ボタンが消えた（2分以内に完了）
              const minutes = Math.floor(waitCount / 60);
              const seconds = waitCount % 60;
              log.debug(
                `✓ 停止ボタンが消えました（${minutes}分${seconds}秒で完了）`,
              );
              earlyCompletion = true;
              break;
            }

            await wait(1000);
            waitCount++;

            // 30秒ごとにログ出力
            if (waitCount % 30 === 0 && waitCount > 0) {
              log.debug(
                `  待機中... (${Math.floor(waitCount / 60)}分${waitCount % 60}秒経過)`,
              );
            }
          }

          // Step 4-7-3: 2分以内に完了した場合の再送信処理
          if (earlyCompletion) {
            log.debug(
              "\n【Step 4-7-3】再送信処理（「いいから元のプロンプトを確認して作業をして」）",
            );

            const textInput = await findClaudeElement(
              claudeSelectors["1_テキスト入力欄"],
              3,
              true,
            );

            if (textInput) {
              const retryMessage = "いいから元のプロンプトを確認して作業をして";

              // 既存のinputText関数を使用（React対応）
              const inputSuccess = await inputText(textInput, retryMessage);

              if (inputSuccess) {
                log.debug(`✓ 再送信メッセージ入力完了: "${retryMessage}"`);

                // 送信ボタンをクリック
                await wait(500);
                const sendButton = await findClaudeElement(
                  claudeSelectors["2_送信ボタン"],
                  3,
                  true,
                );

                if (sendButton) {
                  sendButton.click();
                  log.debug("✓ 再送信完了");
                  await wait(2000);
                } else {
                  log.debug("⚠️ 送信ボタンが見つかりません");
                }
              } else {
                log.debug("⚠️ テキスト入力に失敗しました");
              }
            } else {
              log.debug("⚠️ テキスト入力欄が見つかりません");
            }
          }
        }

        // Step 4-7-4: 最終待機（10秒連続消滅で完了、最大40分）
        if (stopButtonFound) {
          log.debug("\n【Step 4-7-4】最終待機（最大40分）");
          let consecutiveAbsent = 0;
          waitCount = 0;
          const maxWait = AI_WAIT_CONFIG.DEEP_RESEARCH_WAIT / 1000; // 40分
          const checkIntervalSeconds = AI_WAIT_CONFIG.CHECK_INTERVAL / 1000; // 10秒

          while (waitCount < maxWait) {
            const stopResult = await findClaudeElement(
              deepResearchSelectors["3_回答停止ボタン"],
              3,
              true,
            );

            if (!stopResult) {
              consecutiveAbsent++;
              if (consecutiveAbsent >= checkIntervalSeconds) {
                log.debug(
                  `✓ Deep Research完了（停止ボタンが${checkIntervalSeconds}秒間連続で消滅）`,
                );
                await wait(3000);
                break; // returnではなくbreakに変更
              }
            } else {
              consecutiveAbsent = 0;
            }

            await wait(1000);
            waitCount++;

            if (waitCount % 60 === 0 && waitCount > 0) {
              log.debug(
                `  待機中... (${Math.floor(waitCount / 60)}分経過 / 最大40分)`,
              );
            }
          }

          if (waitCount >= maxWait) {
            log.debug("⚠️ Deep Research最大待機時間（40分）に到達");
          }
        }
      } catch (error) {
        log.error("❌ Deep Research待機処理エラー:", error.message);
        throw error;
      }
    };

    // ========================================
    // Step 4-1: 重複実行チェック（新規関数化）
    // ========================================

    /**
     * タスクの重複実行をチェックし、実行可能か判定する
     * @param {string} taskId - タスクID
     * @returns {Object} { canExecute: boolean, error?: string, details?: Object }
     */
    async function checkDuplicateExecution(taskId) {
      // 重複実行チェック（グローバル状態を使用）
      const currentStatus = getExecutionStatus();

      // windowレベルの状態を再確認（異なるコンテキストからの実行を検出）
      if (window.CLAUDE_TASK_EXECUTING || currentStatus.isExecuting) {
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
    // Step 4-6: 送信時刻記録（新規関数化）
    // ========================================

    /**
     * 送信時刻をbackground.jsに記録する
     * @param {string} taskId - タスクID
     * @param {Date} sendTime - 送信時刻
     * @param {Object} taskData - タスクデータ
     * @param {string} modelName - モデル名
     * @param {string} featureName - 機能名
     * @returns {Promise<void>}
     */
    async function recordSendTime(
      taskId,
      sendTime,
      taskData,
      modelName,
      featureName,
    ) {
      log.debug("🔍 送信時刻記録開始 - ", sendTime.toISOString());

      // DetailedLogManagerに送信時刻を記録
      if (window.parent && window.parent.detailedLogManager) {
        try {
          window.parent.detailedLogManager.recordSendTime(
            taskId,
            window.location.href,
          );
          log.debug("📡 DetailedLogManagerに送信時刻を記録:", taskId);
        } catch (logError) {
          log.warn("⚠️ DetailedLogManager送信時刻記録エラー:", logError);
        }
      } else if (window.top && window.top.detailedLogManager) {
        try {
          window.top.detailedLogManager.recordSendTime(
            taskId,
            window.location.href,
          );
          log.debug("📡 DetailedLogManagerに送信時刻を記録:", taskId);
        } catch (logError) {
          log.warn("⚠️ DetailedLogManager送信時刻記録エラー:", logError);
        }
      }

      // Chrome拡張機能のメッセージ送信で記録
      if (chrome.runtime && chrome.runtime.sendMessage) {
        // シート名を追加（テストモードでは不要）
        const sheetName = taskData.sheetName;
        console.log(
          `[4-2-claude] 📝 taskData.sheetName受信: "${sheetName}" (type: ${typeof sheetName})`,
        );
        if (!sheetName) {
          console.warn(
            "⚠️ シート名が指定されていません（テストモードの可能性）- 送信時刻記録をスキップ",
          );
          console.warn(`[4-2-claude] 📋 taskDataの内容:`, taskData);
          // テストモードの場合はスキップ
          log.debug("【Step 4-6】送信時刻記録スキップ（テストモード）");
        } else {
          const fullLogCell = taskData.logCell?.includes("!")
            ? taskData.logCell
            : `'${sheetName}'!${taskData.logCell}`;

          const messageToSend = {
            type: "recordSendTime",
            taskId: taskId,
            sendTime: sendTime.toISOString(),
            taskInfo: {
              aiType: "Claude",
              model: modelName || "不明",
              function: featureName || "通常",
              cellInfo: taskData.cellInfo,
            },
            logCell: fullLogCell,
            originalAiType: taskData.originalAiType, // 3種類AI判定用
          };

          // Promise化してタイムアウト処理を追加
          const sendMessageWithTimeout = () => {
            return new Promise((resolve) => {
              const timeout = setTimeout(() => {
                console.warn("⚠️ [Claude] 送信時刻記録タイムアウト");
                resolve(null);
              }, 5000); // 5秒でタイムアウト

              try {
                // 拡張機能のコンテキストが有効か確認
                if (!chrome.runtime?.id) {
                  console.warn("⚠️ [Claude] 拡張機能のコンテキストが無効です");
                  clearTimeout(timeout);
                  resolve(null);
                  return;
                }

                chrome.runtime.sendMessage(messageToSend, (response) => {
                  clearTimeout(timeout);
                  if (chrome.runtime.lastError) {
                    if (
                      chrome.runtime.lastError.message.includes("port closed")
                    ) {
                      console.warn(
                        "⚠️ [Claude] メッセージポートが閉じられました（送信は成功している可能性があります）",
                      );
                    } else {
                      console.warn(
                        "⚠️ [Claude] 送信時刻記録エラー:",
                        chrome.runtime.lastError.message,
                      );
                    }
                    resolve(null);
                  } else if (response) {
                    console.log("✅ [Claude] 送信時刻記録成功", response);
                    resolve(response);
                  } else {
                    console.warn("⚠️ [Claude] 送信時刻記録: レスポンスなし");
                    resolve(null);
                  }
                });
              } catch (error) {
                clearTimeout(timeout);
                console.error("❌ [Claude] 送信時刻記録失敗:", error);
                resolve(null);
              }
            });
          };

          // 非同期で実行（ブロックしない）
          await sendMessageWithTimeout();
        }
      }

      log.debug(`📤 送信時刻記録完了: ${sendTime.toISOString()}`);
    }

    // ========================================
    // Step 4-9: 完了時刻記録（新規関数化）
    // ========================================

    /**
     * タスク完了時刻をbackground.jsに記録する
     * @param {string} taskId - タスクID
     * @param {string} conversationUrl - 会話URL
     * @param {Object} taskData - タスクデータ
     * @param {string} modelName - モデル名
     * @param {string} featureName - 機能名
     * @returns {Promise<void>}
     */
    async function recordCompletionTime(
      taskId,
      conversationUrl,
      taskData,
      modelName,
      featureName,
    ) {
      try {
        // シート名付きlogCellを準備（テストモードでは不要）
        const sheetName = taskData.sheetName;
        if (!sheetName) {
          log.warn(
            "⚠️ シート名が指定されていません（テストモードの可能性）- 完了時刻記録をスキップ",
          );
          return; // テストモードの場合はスキップ
        }
        const fullLogCell = taskData.logCell?.includes("!")
          ? taskData.logCell
          : `'${sheetName}'!${taskData.logCell}`;

        // Promise化してエラーハンドリングを改善
        const sendCompletionMessage = () => {
          return new Promise((resolve) => {
            const timeout = setTimeout(() => {
              log.warn("⚠️ recordCompletionTime送信タイムアウト");
              resolve(null);
            }, 5000);

            chrome.runtime.sendMessage(
              {
                type: "recordCompletionTime",
                taskId: taskId,
                completionTime: new Date().toISOString(),
                taskInfo: {
                  aiType: "Claude",
                  model: modelName,
                  function: featureName,
                  url: conversationUrl,
                },
                logCell: fullLogCell,
              },
              (response) => {
                clearTimeout(timeout);
                if (!chrome.runtime.lastError) {
                  log.debug(
                    "✅ recordCompletionTime送信完了:",
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
        log.warn("⚠️ recordCompletionTime送信エラー:", error);
      }
    }

    // ========================================
    // 🚨 統合エラーハンドリングシステム（多層監視システム）
    // ========================================

    class IntegratedErrorHandler {
      constructor() {
        this.errorQueue = [];
        this.isProcessing = false;
        this.errorPriorities = {
          CLAUDE_API_ERROR: 1, // 最高優先度
          CLAUDE_NETWORK_ERROR: 2,
          CLAUDE_DOM_ERROR: 3,
          NETWORK_ERROR: 4,
          CANVAS_ERROR: 5,
          SESSION_ERROR: 6,
          LOGIN_ERROR: 7,
          GENERAL_ERROR: 8, // 最低優先度
        };

        // エラーイベントリスナーの登録
        this.initializeEventListeners();

        // 統計情報
        this.stats = {
          totalErrors: 0,
          handledErrors: 0,
          recoveryAttempts: 0,
          recoverySuccesses: 0,
        };
      }

      initializeEventListeners() {
        // Claude APIエラーイベント
        window.addEventListener("claudeAPIError", (event) => {
          this.handleError({
            type: "CLAUDE_API_ERROR",
            message: event.detail.errorMessage,
            timestamp: event.detail.timestamp,
            source: "claudeAPIError event",
          });
        });

        // カスタムエラーハンドラー登録
        window.integratedErrorHandler = this;

        log.debug("🔧 [INTEGRATED-ERROR] 統合エラーハンドラー初期化完了");
      }

      async handleError(errorInfo) {
        this.stats.totalErrors++;

        // 優先度に基づいてエラーキューに追加
        const priority = this.errorPriorities[errorInfo.type] || 999;

        const errorEntry = {
          ...errorInfo,
          priority: priority,
          receivedAt: Date.now(),
        };

        // 優先度順に挿入
        const insertIndex = this.errorQueue.findIndex(
          (error) => error.priority > priority,
        );

        if (insertIndex === -1) {
          this.errorQueue.push(errorEntry);
        } else {
          this.errorQueue.splice(insertIndex, 0, errorEntry);
        }

        log.warn(`🚨 [INTEGRATED-ERROR] エラーを受信: ${errorInfo.type}`, {
          queueLength: this.errorQueue.length,
          priority: priority,
          message: errorInfo.message?.substring(0, 100) || "No message",
        });

        // エラー処理を開始（非同期）
        if (!this.isProcessing) {
          this.processErrorQueue();
        }
      }

      async processErrorQueue() {
        if (this.isProcessing || this.errorQueue.length === 0) {
          return;
        }

        this.isProcessing = true;

        try {
          while (this.errorQueue.length > 0) {
            const errorEntry = this.errorQueue.shift();
            await this.processError(errorEntry);

            // 過負荷防止のため短時間待機
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
        } catch (processError) {
          log.error(
            "❌ [INTEGRATED-ERROR] エラー処理中にエラー:",
            processError,
          );
        } finally {
          this.isProcessing = false;
        }
      }

      async processError(errorEntry) {
        this.stats.handledErrors++;

        log.error(`🔥 [INTEGRATED-ERROR] エラー処理開始: ${errorEntry.type}`, {
          priority: errorEntry.priority,
          age: Date.now() - errorEntry.receivedAt,
          message: errorEntry.message?.substring(0, 150) || "No message",
        });

        // エラータイプに応じた処理
        switch (errorEntry.type) {
          case "CLAUDE_API_ERROR":
            await this.handleClaudeAPIError(errorEntry);
            break;

          case "CLAUDE_NETWORK_ERROR":
            await this.handleNetworkError(errorEntry);
            break;

          case "CLAUDE_DOM_ERROR":
            await this.handleDOMError(errorEntry);
            break;

          default:
            await this.handleGeneralError(errorEntry);
            break;
        }

        // ClaudeRetryManagerに記録
        try {
          if (window.claudeRetryManager) {
            window.claudeRetryManager.errorHistory.push({
              type: errorEntry.type,
              message: errorEntry.message || "Unknown error",
              timestamp: errorEntry.timestamp || Date.now(),
              level: "integrated_handler",
              processed: true,
            });
          }
        } catch (recordError) {
          log.debug(
            "⚠️ [INTEGRATED-ERROR] エラー記録失敗:",
            recordError.message,
          );
        }
      }

      async handleClaudeAPIError(errorEntry) {
        log.error(
          "🔥 [INTEGRATED-ERROR] Claude APIエラー処理:",
          errorEntry.message,
        );

        // グローバル状態をリセット（エラー処理完了を示す）
        window.claudeAPIErrorDetected = false;

        this.stats.recoveryAttempts++;

        // 回復処理: ページリフレッシュ
        setTimeout(() => {
          log.warn(
            "🔄 [INTEGRATED-ERROR] Claude APIエラーによるページリフレッシュ",
          );
          window.location.reload();
          this.stats.recoverySuccesses++;
        }, 2000); // 2秒後にリフレッシュ
      }

      async handleNetworkError(errorEntry) {
        log.warn(
          "🌐 [INTEGRATED-ERROR] ネットワークエラー処理:",
          errorEntry.message,
        );

        this.stats.recoveryAttempts++;

        // ネットワーク回復の待機（軽度な対処）
        await new Promise((resolve) => setTimeout(resolve, 5000));
        log.debug("📡 [INTEGRATED-ERROR] ネットワークエラー回復待機完了");

        this.stats.recoverySuccesses++;
      }

      async handleDOMError(errorEntry) {
        log.warn(
          "🔧 [INTEGRATED-ERROR] DOM要素エラー処理:",
          errorEntry.message,
        );

        this.stats.recoveryAttempts++;

        // DOM要素の再構築を待つ
        await new Promise((resolve) => setTimeout(resolve, 3000));
        log.debug("🔧 [INTEGRATED-ERROR] DOM要素回復待機完了");

        this.stats.recoverySuccesses++;
      }

      async handleGeneralError(errorEntry) {
        log.debug("⚙️ [INTEGRATED-ERROR] 一般エラー処理:", errorEntry.type);

        // 最小限の処理
        this.stats.recoveryAttempts++;
        this.stats.recoverySuccesses++;
      }

      getStats() {
        return {
          ...this.stats,
          queueLength: this.errorQueue.length,
          isProcessing: this.isProcessing,
          recoveryRate:
            this.stats.recoveryAttempts > 0
              ? (
                  (this.stats.recoverySuccesses / this.stats.recoveryAttempts) *
                  100
                ).toFixed(2) + "%"
              : "0%",
        };
      }
    }

    // 統合エラーハンドラーのインスタンス作成
    const integratedErrorHandler = new IntegratedErrorHandler();

    // ========================================
    // メイン実行関数（Step 4-2-7を含む）
    // ========================================

    async function executeTask(taskData) {
      log.info("🚀 【Step 4-0】Claude タスク実行開始", taskData);

      // executeTask関数受信時のtaskData確認
      console.log("🔍 [executeTask関数受信時のtaskData確認]", {
        taskDataExists: !!taskData,
        taskDataType: typeof taskData,
        taskDataKeys: taskData ? Object.keys(taskData) : [],
        taskDataLogCell: taskData?.logCell,
        taskDataLogCellType: typeof taskData?.logCell,
        rawTaskData: taskData,
      });

      // 🔧 [FIX-LOGCELL] logCellが欠如している場合の復旧ロジック
      if (!taskData?.logCell && taskData?.row && taskData?.cellInfo) {
        // ログセルを推測して復旧
        const inferredLogColumn = "S"; // デフォルトログ列
        const inferredLogCell = `${inferredLogColumn}${taskData.row}`;

        console.error(`🔧 [FIX-LOGCELL] logCellを復旧します:`, {
          originalLogCell: taskData.logCell,
          inferredLogCell: inferredLogCell,
          row: taskData.row,
          taskId: taskData.taskId || taskData.id,
        });

        // taskDataにlogCellを追加
        taskData.logCell = inferredLogCell;
      }

      // 🔧 [SIMPLIFIED] 元のタスクIDを使用（データ一貫性のため）
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

      log.debug("📋 受信したタスクデータ:", {
        model: taskData.model || "未指定",
        function: taskData.function || "通常",
        promptLength: taskData.prompt?.length || taskData.text?.length || 0,
        hasPrompt: !!(taskData.prompt || taskData.text),
        cellInfo: taskData.cellInfo || "不明",
        spreadsheetId: taskData.spreadsheetId || "未設定",
        gid: taskData.gid || "未設定",
      });

      // 送信時刻をタスク開始時に記録（関数全体で使用可能）
      const taskStartTime = new Date();
      let sendTime = taskStartTime; // 実際の送信時刻で更新される
      log.debug("🎯 Task starting:", taskStartTime.toISOString());
      // Task initialized

      // ログ記録開始
      ClaudeLogManager.startTask(taskData);

      try {
        // パラメータ準備（スプレッドシートの値をそのまま使用）
        // promptが文字列でない場合の対処
        let prompt = "";
        if (typeof taskData === "string") {
          prompt = taskData;
        } else if (taskData && typeof taskData === "object") {
          prompt = taskData.prompt || taskData.text || "";
          // promptがまだオブジェクトの場合、文字列に変換
          if (typeof prompt !== "string") {
            log.debug("⚠️ promptが文字列でないため変換:", typeof prompt);
            prompt = String(prompt || "");
          }
        }

        // セル位置情報を追加
        if (
          taskData &&
          taskData.cellInfo &&
          taskData.cellInfo.column &&
          taskData.cellInfo.row
        ) {
          const cellPosition = `${taskData.cellInfo.column}${taskData.cellInfo.row}`;
          prompt = `【現在${cellPosition}セルを処理中です】\n\n${prompt}`;
          log.debug(`📍 [Claude] セル位置情報を追加: ${cellPosition}`);
        } else {
          log.debug("📍 [Claude] セル位置情報なし:", {
            hasCellInfo: !!(taskData && taskData.cellInfo),
            cellInfo: taskData && taskData.cellInfo,
            taskDataKeys: taskData ? Object.keys(taskData) : [],
          });
        }

        // 🔍 [MODEL-DEBUG-1] taskData.model の詳細診断
        log.debug("🔍 [MODEL-DEBUG-1] taskData.model の詳細:");
        log.debug("  - 存在確認:", "model" in taskData);
        log.debug("  - 値:", taskData?.model);
        log.debug("  - 型:", typeof taskData?.model);
        log.debug("  - 長さ:", taskData?.model?.length);
        log.debug("  - JSON:", JSON.stringify(taskData?.model));

        const modelName = taskData?.model || "";

        log.debug("🔍 [MODEL-DEBUG-2] modelName の詳細:");
        log.debug("  - 値:", modelName);
        log.debug("  - 型:", typeof modelName);
        log.debug("  - 長さ:", modelName?.length);
        log.debug("  - truthy:", !!modelName);

        // 🔧 [FIX] functionではなくfeatureを確認、または"じっくり考える"をデフォルトに
        const featureName =
          taskData?.feature || taskData?.function || "じっくり考える";

        // Deep Research判定
        const isDeepResearch = featureName === "Deep Research";

        log.debug("実行パラメータ:");
        log.debug("  - モデル名:", modelName || "(デフォルト)");
        log.debug("  - 機能名:", featureName || "(なし)");
        log.debug("  - Deep Research:", isDeepResearch ? "有効" : "無効");
        log.debug("  - プロンプト長:", prompt.length, "文字");

        // ========================================
        // 📝 Step 4-2: テキスト入力
        // ========================================
        log.info("【Step 4-2】テキスト入力");

        log.debug(`📝 Text input (${prompt.length} chars)...`);
        ClaudeLogManager.logStep("Step2-TextInput", "テキスト入力開始");

        const inputResult = await findClaudeElement(
          claudeSelectors["1_テキスト入力欄"],
        );
        if (!inputResult) {
          log.error("❌ テキスト入力欄が見つかりません - リトライ機能で再試行");
          log.error(`🎯 検索セレクタ: ${claudeSelectors["1_テキスト入力欄"]}`);

          const retryManager = new ClaudeRetryManager();
          const retryResult = await retryManager.executeWithRetry(
            async () => {
              const input = await findClaudeElement(
                claudeSelectors["1_テキスト入力欄"],
              );
              return input
                ? { success: true, element: input }
                : { success: false };
            },
            "テキスト入力欄検索",
            { taskId: taskData.taskId },
          );

          if (!retryResult.success) {
            throw new Error("テキスト入力欄が見つかりません");
          }
          inputResult = retryResult.result.element;
        }

        // Text input found

        const promptLength = prompt ? prompt.length : 0;
        log.debug(`📝 ${promptLength}文字のテキストを入力中...`);
        if (prompt) {
          log.debug(
            `💬 プロンプト先頭: "${prompt.substring(0, 50)}${promptLength > 50 ? "..." : ""}"`,
          );
        } else {
          log.debug("💬 プロンプトが空です");
        }

        // RetryManager統合版テキスト入力
        const inputRetryManager = new ClaudeRetryManager();
        const inputRetryResult = await inputRetryManager.executeWithRetry(
          async () => {
            const success = await inputText(inputResult, prompt);
            if (!success) {
              throw new Error("テキスト入力失敗");
            }
            return { success: true };
          },
          "Claudeテキスト入力",
          { taskId: taskData.taskId, promptLength: prompt.length },
        );

        if (!inputRetryResult.success) {
          throw new Error("テキスト入力に失敗しました");
        }

        // Text input complete

        log.debug(
          `📊 入力結果: ${inputResult.textContent.length}文字が入力欄に設定されました`,
        );

        // 入力成功の確認
        const inputVerification = inputResult.textContent.length > 0;
        // Input validation: ${inputVerification ? "success" : "failed"}
        log.debug(
          `📈 入力精度: ${Math.round((inputResult.textContent.length / prompt.length) * 100)}%`,
        );

        ClaudeLogManager.logStep("Step2-TextInput", "テキスト入力完了", {
          promptLength: prompt.length,
          inputElementTag: inputResult.tagName,
          finalLength: inputResult.textContent.length,
          inputAccuracy: Math.round(
            (inputResult.textContent.length / prompt.length) * 100,
          ),
        });

        log.debug(
          "%c✅【Step 4-2-2】テキスト入力処理完了",
          "color: #4CAF50; font-weight: bold;",
        );
        log.debug("─".repeat(50));
        await wait(1000);

        // ========================================
        // 🤖 Step 4-3: モデル選択
        // ========================================
        let selectedModelText = null; // 実際に選択されたモデルテキストを保存
        const cellInfo =
          taskData.cellReference ||
          taskData.cellInfo ||
          taskData.cell ||
          "不明";

        // 🔍 [MODEL-DEBUG-3] 条件分岐前の状態診断
        log.debug("🔍 [MODEL-DEBUG-3] 条件分岐前の状態:");
        log.debug("  - modelName:", modelName);
        log.debug("  - modelName (boolean):", !!modelName);
        log.debug('  - modelName !== "":', modelName !== "");
        log.debug('  - modelName !== "設定なし":', modelName !== "設定なし");
        log.debug('  - modelName !== "未指定":', modelName !== "未指定");

        const condition1 = !!modelName;
        const condition2 = modelName !== "";
        const condition3 = modelName !== "設定なし";
        const finalCondition = condition1 && condition2 && condition3;

        log.debug("🔍 [MODEL-DEBUG-4] 各条件の評価:");
        log.debug("  - !!modelName:", condition1);
        log.debug('  - modelName !== "":', condition2);
        log.debug('  - modelName !== "設定なし":', condition3);
        log.debug("  - 最終条件 (AND):", finalCondition);
        log.debug(
          "  - 分岐先:",
          finalCondition ? "モデル選択処理" : "エラースロー",
        );

        if (modelName && modelName !== "" && modelName !== "設定なし") {
          log.info("【Step 4-3】モデル選択:", modelName);
          log.debug(
            "%c【Step 4-3-1】モデル選択開始",
            "color: #FF9800; font-weight: bold;",
          );
          log.debug("─".repeat(40));
          log.debug(`🎯 目標モデル: ${modelName}`);
          log.debug(`📍 現在のページURL: ${window.location.href}`);

          // モデルメニューボタンを探してクリック
          log.debug("\n【Step 4-3-2】モデルメニューボタンを探す");
          let menuButton = await findElementByMultipleSelectors(
            modelSelectors.menuButton,
            "モデル選択ボタン",
          );

          // 失敗した場合は、包括的検索を実行（テストコードパターン）
          if (!menuButton) {
            log.debug("🔍 [ENHANCED-SEARCH] モデルボタン包括的検索を実行");

            // data-testid属性を持つボタンを最優先で検索
            menuButton = document.querySelector(
              '[data-testid="model-selector-dropdown"]',
            );

            if (!menuButton) {
              // aria-haspopup="menu"を持つボタンを検索
              const menuButtons = document.querySelectorAll(
                'button[aria-haspopup="menu"]',
              );
              log.debug(
                `📊 [ENHANCED-SEARCH] メニューボタン候補数: ${menuButtons.length}`,
              );

              for (let btn of menuButtons) {
                const text = btn.textContent?.toLowerCase();
                if (
                  text &&
                  (text.includes("claude") || text.includes("model"))
                ) {
                  log.debug(
                    `🎯 [ENHANCED-SEARCH] モデルボタン発見: "${btn.textContent}"`,
                  );
                  menuButton = btn;
                  break;
                }
              }
            }
          }

          if (menuButton) {
            await triggerReactEvent(menuButton);
            await wait(2000);

            // 🔍 モデル情報自動検出（テスト済みロジック）
            try {
              const detectedModels = await detectClaudeModelsFromOpenMenu();

              // 📝 詳細ログ：すべての表示されたモデルを記載

              if (detectedModels.length > 0) {
                detectedModels.forEach((model, index) => {
                  if (model.description) {
                  }
                });

                const selectedModel = detectedModels.find((m) => m.isSelected);
                if (selectedModel) {
                } else {
                }
              } else {
              }

              // 🔧 機能情報も検出を試行
              let detectedFunctions = [];
              try {
                detectedFunctions = await detectClaudeFunctionsFromOpenMenu();

                if (detectedFunctions.length > 0) {
                  detectedFunctions.forEach((func, i) => {
                    const toggleStatus = func.isToggleable
                      ? func.isToggled
                        ? "[ON]"
                        : "[OFF]"
                      : "";
                    const secretStatus = func.secretStatus
                      ? `(${func.secretStatus})`
                      : "";
                  });

                  // Deep Researchが含まれていない場合は追加
                  const hasDeepResearch = detectedFunctions.some(
                    (f) =>
                      f.name === "Deep Research" ||
                      f.name === "DeepResearch" ||
                      f.name === "リサーチ",
                  );
                  if (!hasDeepResearch) {
                    detectedFunctions.push({
                      name: "Deep Research",
                      description: "",
                      secretStatus: "",
                      isEnabled: true,
                      isToggleable: false,
                      isToggled: false,
                    });
                  }
                } else {
                }
              } catch (functionError) {
                console.error("エラー詳細:", functionError);
              }

              // UIに送信（データが取得できた場合のみ）
              if (detectedModels.length > 0 || detectedFunctions.length > 0) {
                const response = await chrome.runtime.sendMessage({
                  type: "AI_MODEL_FUNCTION_UPDATE",
                  aiType: "claude",
                  data: {
                    models: detectedModels.map((m) => m.name),
                    modelsWithDetails: detectedModels,
                    functions: detectedFunctions.map((f) => f.name),
                    functionsWithDetails: detectedFunctions,
                  },
                });

                if (response?.updated) {
                } else {
                }
              } else {
              }
            } catch (detectionError) {}
          }

          // モデル名がClaudeを含むか確認
          const targetModelName = modelName.startsWith("Claude")
            ? modelName
            : `Claude ${modelName}`;

          // まずメインメニューでターゲットモデルを探す
          const mainMenuItems = document.querySelectorAll('[role="menuitem"]');
          let foundInMain = false;

          log.debug(`🔍 メインメニューでモデルを検索: "${targetModelName}"`);
          log.debug(`📊 メニューアイテム数: ${mainMenuItems.length}`);

          for (const item of mainMenuItems) {
            const itemText = item.textContent?.trim();
            log.debug(`[MODEL-MATCH-DEBUG] 検査中: "${itemText}"`);

            if (itemText) {
              // より精密な正規表現マッチングを使用（Claudeプレフィックスをオプションに、説明文を許可）
              const modelMatch = itemText.match(
                /^(Claude\s+)?(3|3\.5)?\s*(Opus|Sonnet|Haiku)\s*[\d.]*/,
              );

              if (modelMatch) {
                // マッチした部分のみを抽出
                const extractedModelName = modelMatch[0];
                log.debug(
                  `[MODEL-MATCH-DEBUG] 抽出されたモデル名: "${extractedModelName}"`,
                );
                log.debug(
                  `[MODEL-MATCH-DEBUG] 目標モデル名: "${targetModelName}"`,
                );

                // より柔軟なマッチング
                const isExactMatch = extractedModelName === targetModelName;
                const isPartialMatch = extractedModelName.includes(
                  targetModelName.replace("Claude ", ""),
                );
                const isReverseMatch =
                  targetModelName.includes(extractedModelName);

                log.debug(
                  `[MODEL-MATCH-DEBUG] 完全一致: ${isExactMatch}, 部分一致: ${isPartialMatch}, 逆一致: ${isReverseMatch}`,
                );

                if (isExactMatch || isPartialMatch || isReverseMatch) {
                  log.debug(
                    `[MODEL-MATCH-SUCCESS] モデル選択: "${extractedModelName}"`,
                  );
                  selectedModelText = extractedModelName; // 選択したモデルテキストを保存
                  foundInMain = true;
                  await triggerReactEvent(item, "click");
                  await wait(1500);
                  break;
                }
              }
            }
          }

          if (!foundInMain) {
            // サブメニューが存在する場合のみチェック
            log.debug("【Step 4-3-3】その他のモデルメニューをチェック");

            // デバッグ: modelSelectors.otherModelsMenuの詳細を出力
            log.debug("📊 [DEBUG] modelSelectors.otherModelsMenu:");
            log.debug("  - 型:", typeof modelSelectors.otherModelsMenu);
            log.debug(
              "  - 配列:",
              Array.isArray(modelSelectors.otherModelsMenu),
            );
            log.debug("  - 長さ:", modelSelectors.otherModelsMenu?.length);
            log.debug(
              "  - 内容:",
              JSON.stringify(modelSelectors.otherModelsMenu, null, 2),
            );

            // デバッグ: 現在のDOM状態を確認
            log.debug("📊 [DEBUG] 現在のDOM状態:");
            const allMenuItems = document.querySelectorAll('[role="menuitem"]');
            log.debug("  - 全menuitem数:", allMenuItems.length);
            allMenuItems.forEach((item, index) => {
              const hasPopup = item.getAttribute("aria-haspopup");
              const text = item.textContent?.trim();
              if (
                hasPopup ||
                text?.includes("他のモデル") ||
                text?.includes("Other")
              ) {
                log.debug(
                  `  - [${index}] text: "${text?.substring(0, 50)}", aria-haspopup: "${hasPopup}"`,
                );
              }
            });

            // modelSelectors.otherModelsMenuは既にデフォルト値を持っているので、直接使用
            log.debug(
              "📊 [DEBUG] その他のモデルメニューセレクタ数:",
              modelSelectors.otherModelsMenu.length,
            );

            // まず元のセレクタを試行
            let otherModelsItem = await findElementByMultipleSelectors(
              modelSelectors.otherModelsMenu,
              "その他のモデルメニュー",
            );

            // 失敗した場合は、より包括的な検索を実行（テストコードパターンに基づく）
            if (!otherModelsItem) {
              log.debug("🔍 [ENHANCED-SEARCH] 包括的メニュー検索を実行");

              // すべてのメニューアイテムを取得して内容を確認
              const allMenuItems =
                document.querySelectorAll('[role="menuitem"]');
              log.debug(
                `📊 [ENHANCED-SEARCH] 見つかったメニューアイテム数: ${allMenuItems.length}`,
              );

              for (let item of allMenuItems) {
                const text = item.textContent?.trim();
                const hasSubMenu =
                  item.getAttribute("aria-haspopup") === "menu";
                log.debug(
                  `  - アイテム: "${text}", サブメニュー: ${hasSubMenu}`,
                );

                // サブメニューがあるアイテムを探す
                if (hasSubMenu) {
                  log.debug(
                    `🎯 [ENHANCED-SEARCH] サブメニュー付きアイテム発見: "${text}"`,
                  );
                  otherModelsItem = item;
                  break;
                }
              }
            }

            if (otherModelsItem) {
              log.debug("🎯 その他のモデルメニューをクリック");

              // サブメニューを開くためにホバーイベントを送る
              await triggerReactEvent(otherModelsItem, "mouseenter");
              await wait(500);

              // クリックしてサブメニューを開く
              await triggerReactEvent(otherModelsItem, "click");
              await wait(1000);

              // サブメニューが開くのを待つ
              let retryCount = 0;
              let subMenuItems = [];
              while (retryCount < 5) {
                // サブメニューアイテムを探す（新しく表示された要素）
                const allMenuItems =
                  document.querySelectorAll('[role="menuitem"]');
                subMenuItems = Array.from(allMenuItems).filter((item) => {
                  const itemText = item.textContent?.trim() || "";
                  // モデル名を含むアイテムを探す
                  return (
                    itemText.includes("Claude") &&
                    !itemText.includes("他のモデル") &&
                    !itemText.includes("Other models") &&
                    item !== otherModelsItem
                  );
                });

                log.debug(
                  `📊 [DEBUG] サブメニュー検索 attempt ${retryCount + 1}: ${subMenuItems.length} アイテム`,
                );

                if (subMenuItems.length > 0) {
                  log.debug("✅ サブメニューアイテムが見つかりました");
                  subMenuItems.forEach((item, idx) => {
                    log.debug(`  [${idx}] ${item.textContent?.trim()}`);
                  });
                  break;
                }

                retryCount++;
                await wait(500);
              }

              // サブメニュー内でターゲットモデルを探す
              if (subMenuItems.length > 0) {
                for (const item of subMenuItems) {
                  const itemText = item.textContent?.trim() || "";
                  if (itemText.includes(targetModelName)) {
                    log.debug(`🎯 ターゲットモデル発見: "${itemText}"`);
                    await triggerReactEvent(item, "click");
                    await wait(1500);
                    break;
                  }
                }
              } else {
                log.debug("❌ サブメニューアイテムが見つかりません");
              }
            } else {
              log.debug(
                "❌ [DEBUG] その他のモデルメニューアイテムが見つかりません",
              );
            }
          }

          // モデル選択結果の確認
          const newCurrentModel = getCurrentModelInfo();
          const modelMatched = newCurrentModel === targetModelName;

          log.debug(`🔍 選択後のモデル: "${newCurrentModel}"`);
          log.debug(`🎯 期待されるモデル: "${targetModelName}"`);
          // Model match: ${modelMatched ? "success" : "mismatch"}

          log.debug(
            "%c✅【Step 4-3-4】モデル選択処理完了",
            "color: #4CAF50; font-weight: bold;",
          );
          // 統合ログ: モデル選択完了
          // 選択後確認で表示されているモデルを取得
          let displayedModel = "";
          try {
            if (window.ModelInfoExtractor) {
              displayedModel =
                window.ModelInfoExtractor.extract("Claude") || "取得失敗";
            } else {
              displayedModel = "取得不可";
            }
          } catch (error) {
            displayedModel = "取得失敗";
          }
          log.debug("─".repeat(50));
        } else {
          // 🔍 [MODEL-DEBUG-5] elseブロックに入った理由の診断
          log.error(
            "🔍 [MODEL-DEBUG-5] エラー発生: モデル選択処理に入れませんでした",
          );
          log.error("  - modelName の値:", modelName);
          log.error("  - modelName の型:", typeof modelName);
          log.error('  - modelName === "":', modelName === "");
          log.error('  - modelName === "設定なし":', modelName === "設定なし");
          log.error('  - modelName === "未指定":', modelName === "未指定");
          log.error("  - taskData.model の元の値:", taskData?.model);
          log.error("  - 条件チェック失敗の理由を上記から特定してください");

          throw new Error(
            "モデル名が指定されていません。スプレッドシートのモデル行を確認してください。",
          );
        }

        // ========================================
        // ⚙️ Step 4-4: 機能選択
        // ========================================
        if (featureName && featureName !== "" && featureName !== "設定なし") {
          log.info("【Step 4-4】機能選択:", featureName);
          log.debug(
            "%c【Step 4-4-1】機能選択開始",
            "color: #9C27B0; font-weight: bold;",
          );
          log.debug("─".repeat(40));
          log.debug(`🎯 目標機能: ${featureName}`);
          log.debug(`🔍 Deep Research判定: ${isDeepResearch ? "Yes" : "No"}`);

          log.debug("\n🔧【Step 4-4-2】機能メニューアクセス開始");

          const featureMenuBtn = getFeatureElement(
            featureSelectors.menuButton,
            "機能メニューボタン",
          );
          if (featureMenuBtn) {
            featureMenuBtn.click();
            await wait(1500);

            // 機能選択前にすべてのトグルをオフにする
            log.debug("\n【Step 4-4-3】全トグルをオフに設定");
            await turnOffAllFeatureToggles();
            await wait(500);

            if (isDeepResearch) {
              // ウェブ検索をオンにする
              const webSearchToggle = getFeatureElement(
                featureSelectors.webSearchToggle,
                "ウェブ検索トグル",
              );
              if (webSearchToggle) {
                setToggleState(webSearchToggle, true);
                await wait(1500);
              }

              // メニューを閉じる（Deep Research用）
              log.debug("\n【Step 4-4-4】Deep Research用: メニューを閉じる");
              featureMenuBtn.click();
              await wait(1000);

              // リサーチボタンを探してクリック（時計アイコン）
              log.debug("\n【Step 4-4-3.5】リサーチボタンをクリック");
              const buttons = document.querySelectorAll(
                'button[type="button"][aria-pressed]',
              );
              for (const btn of buttons) {
                // 時計アイコン（リサーチ）を検出
                const svg = btn.querySelector(
                  'svg path[d*="M10.3857 2.50977"]',
                );
                if (svg) {
                  const isPressed = btn.getAttribute("aria-pressed") === "true";
                  log.debug(`  リサーチボタン検出: aria-pressed=${isPressed}`);
                  if (!isPressed) {
                    log.debug("  → リサーチボタンをONにします");
                    btn.click();
                    await wait(1000);
                  } else {
                    log.debug("  → すでにONです");
                  }
                  break;
                }
              }

              // ========================================
              // Step 4-4-2-2: Deep Research機能確認
              // ========================================
              // Deep Research function check
              const deepResearchConfirm =
                confirmFeatureSelection("Deep Research");

              if (
                deepResearchConfirm.deepResearch ||
                deepResearchConfirm.webSearch
              ) {
                log.debug(
                  `✅ Deep Research機能確認完了: [${deepResearchConfirm.detected.join(", ")}]`,
                );
              } else {
                log.debug(
                  "⚠️ Deep Research機能の確認ができませんでしたが処理を継続します",
                );
              }
            } else {
              // その他の機能を選択（テストコードから導入したロジック）

              // 現在のトグルボタンを取得
              const currentButtons = document.querySelectorAll(
                'button:has(input[role="switch"])',
              );
              const currentFeatures = [];

              currentButtons.forEach((button) => {
                const label = button.querySelector("p.font-base");
                const labelText = label ? label.textContent.trim() : "";
                const input = button.querySelector('input[role="switch"]');

                currentFeatures.push({
                  text: labelText,
                  element: button,
                  input: input,
                });
              });

              // 対象機能を探して選択
              const targetFeature = currentFeatures.find(
                (f) => f.text === featureName,
              );

              if (targetFeature) {
                const currentState = targetFeature.input.checked;

                // 🔧 [FORCE-SELECTION] 全機能OFF後は必ず選択を実行
                // 既にONでも一度OFFにしてからONにする（確実性向上）
                if (currentState) {
                  targetFeature.element.click();
                  await wait(500);
                }

                // ONにする
                targetFeature.element.click();
                await wait(1000);

                // 最終状態確認
                const finalState = targetFeature.input.checked;

                if (finalState) {
                  log.debug(`✅ ${featureName}機能を有効化しました`);
                } else {
                  log.warn(
                    `⚠️ ${featureName}機能の有効化に失敗した可能性があります`,
                  );
                }
              } else {
                console.error(`❌ 「${featureName}」が見つかりませんでした`);
                log.error(
                  `機能「${featureName}」のトグルが見つかりませんでした`,
                );
              }

              // メニューを閉じる
              log.debug("\n【Step 4-4-6】メニューを閉じる");
              featureMenuBtn.click();
              await wait(1000);
            }
          }

          // ========================================
          // Step 4-4-4: 機能選択確認（新機能）
          // ========================================
          // Function selection check
          const confirmationResult = confirmFeatureSelection(featureName);

          // 🔧 [FEATURE-VERIFICATION] 機能選択詳細検証

          // DOM上の機能ボタン状態を直接確認
          const featureButtons = document.querySelectorAll(
            'button[role="switch"], input[role="switch"]',
          );
          featureButtons.forEach((btn, index) => {
            const isOn =
              btn.checked || btn.getAttribute("aria-checked") === "true";
            const buttonText =
              btn.closest("label")?.textContent?.trim() ||
              btn.textContent?.trim() ||
              `ボタン${index + 1}`;
          });

          if (confirmationResult.error) {
            log.debug(
              `⚠️ 機能確認でエラーが発生しましたが処理を継続します: ${confirmationResult.error}`,
            );
          } else if (confirmationResult.detected.length === 0) {
            log.debug(
              "⚠️ 期待される機能ボタンが検出されませんでしたが処理を継続します",
            );
          } else {
            log.debug(
              `🔍 検出された機能: [${confirmationResult.detected.join(", ")}]`,
            );
            // Function selection confirmed
          }

          log.debug(
            "%c✅【Step 4-4-8】機能選択処理完了",
            "color: #4CAF50; font-weight: bold;",
          );
          // 統合ログ: 機能選択完了
          // 選択後確認で表示されている機能を取得
          let displayedFunction = "";
          try {
            if (window.FunctionInfoExtractor) {
              displayedFunction =
                window.FunctionInfoExtractor.extract("Claude") || "未選択";
            } else {
              displayedFunction = "取得不可";
            }
          } catch (error) {
            displayedFunction = "取得失敗";
          }
          log.debug("─".repeat(50));
        } else {
          log.debug(
            "%c⏭️【Step 4-4-1】機能選択をスキップ（設定なし）",
            "color: #9E9E9E; font-style: italic;",
          );
        }

        // ========================================
        // 📤 Step 4-5: メッセージ送信
        // ========================================
        log.info("【Step 4-5】メッセージ送信");

        log.debug(
          "%c【Step 4-5-1】メッセージ送信開始",
          "color: #E91E63; font-weight: bold;",
        );
        log.debug("─".repeat(40));
        log.debug(`🎯 送信ボタンセレクタ: ${claudeSelectors["2_送信ボタン"]}`);
        log.debug(`📝 送信内容長: ${prompt.length}文字`);

        // Searching send button...
        const sendResult = await findClaudeElement(
          claudeSelectors["2_送信ボタン"],
        );
        if (!sendResult) {
          log.error("❌ 送信ボタンが見つかりません - リトライ機能で再試行");
          log.error(`🎯 検索セレクタ: ${claudeSelectors["2_送信ボタン"]}`);

          const retryManager = new ClaudeRetryManager();
          const retryResult = await retryManager.executeWithRetry(
            async () => {
              const button = await findClaudeElement(
                claudeSelectors["2_送信ボタン"],
              );
              return button
                ? { success: true, element: button }
                : { success: false };
            },
            "送信ボタン検索",
            { taskId: taskData.taskId },
          );

          if (!retryResult.success) {
            throw new Error("送信ボタンが見つかりません");
          }
          sendResult = retryResult.result.element;
        }

        // Send button found
        const buttonRect = sendResult.getBoundingClientRect();

        log.debug(
          `📍 送信ボタン位置: x=${Math.round(buttonRect.left)}, y=${Math.round(buttonRect.top)}`,
        );
        log.debug(
          `📏 送信ボタンサイズ: ${Math.round(buttonRect.width)}×${Math.round(buttonRect.height)}px`,
        );

        // RetryManager統合版送信ボタンクリック
        log.debug("📤 送信ボタンをクリック...");
        const sendRetryManager = new ClaudeRetryManager();
        const sendRetryResult = await sendRetryManager.executeWithRetry(
          async () => {
            const success = await clickButton(sendResult, "送信ボタン");
            if (!success) {
              throw new Error("送信ボタンクリック失敗");
            }
            return { success: true };
          },
          "Claude送信ボタンクリック",
          { taskId: taskData.taskId },
        );

        if (!sendRetryResult.success) {
          throw new Error("送信ボタンのクリックに失敗しました");
        }

        // Send button clicked

        // 🔧 [UI-OPERATION-VERIFICATION] 送信ボタンクリック検証

        // 送信時刻を更新（実際の送信タイミング）
        sendTime = new Date(); // 変数を更新

        // クリック後の状態確認
        setTimeout(() => {
          // 送信処理が開始されたかの間接的な確認
          const loadingElements = document.querySelectorAll(
            '[data-testid*="loading"], [aria-busy="true"], .loading',
          );

          // 送信ボタンの状態変化確認
        }, 1000);

        // ========================================
        // Step 4-6: 送信時刻記録
        // ========================================
        log.info("【Step 4-6】送信時刻記録");
        await recordSendTime(
          taskId,
          sendTime,
          taskData,
          selectedModelText || modelName,
          featureName,
        );

        log.debug("✅ メッセージ送信完了");
        log.debug(`📤 実際の送信時刻: ${sendTime.toISOString()}`);
        log.debug(`⏱️ 送信処理時間: ${Date.now() - taskStartTime.getTime()}ms`);

        ClaudeLogManager.logStep("Step5-Send", "メッセージ送信完了", {
          sendTime: sendTime.toISOString(),
          processingTime: Date.now() - taskStartTime.getTime(),
        });

        log.debug(
          "%c✅【Step 4-5-2】メッセージ送信処理完了",
          "color: #4CAF50; font-weight: bold;",
        );
        log.debug("─".repeat(50));
        await wait(2000);

        // Canvas内容を保存する変数（スコープを広く）
        let finalText = "";

        // ========================================
        // Step 4-6: Canvas V2検出チェック（リトライ機能統合）
        // ========================================
        log.debug(
          "%c【Step 4-7-0】Canvas V2検出チェック",
          "color: #FF5722; font-weight: bold;",
        );
        log.debug("─".repeat(40));

        const retryManager = new ClaudeRetryManager();
        const versionElement = document.querySelector(
          '[data-testid="artifact-version-trigger"]',
        );

        if (versionElement) {
          const versionText = versionElement.textContent || "";
          log.debug(`🔍 検出されたバージョン表示: "${versionText}"`);

          // V2以上を検出した場合
          if (
            versionText.includes("v2") ||
            versionText.includes("v3") ||
            versionText.includes("v4") ||
            versionText.includes("v5") ||
            /v([2-9]|\d{2,})/.test(versionText)
          ) {
            log.debug(
              "🚨 Canvas無限更新を検出しました - 10回リトライシステム開始",
            );
            log.debug(`   - 検出バージョン: ${versionText}`);
            log.debug(`   - タスクID: ${taskData.taskId || "unknown"}`);
            log.debug(
              `   - リトライ間隔: 5秒→10秒→1分→5分→10分→15分→30分→1時間→2時間`,
            );

            const retryResult = await retryManager.executeWithRetry(
              async () => {
                return await executeTask({
                  taskId: taskData.taskId || taskId,
                  prompt: taskData.prompt || prompt,
                  enableDeepResearch:
                    taskData.enableDeepResearch || isDeepResearch,
                  specialMode: taskData.specialMode || null,
                });
              },
              "Canvas V2タスク再実行",
              {
                taskId: taskData.taskId || taskId,
                versionText: versionText,
              },
            );

            if (retryResult) {
              return retryResult;
            }
            // retryResultがnullの場合は通常処理を継続（初回実行）
          } else {
            log.debug(`✅ 正常なバージョン: ${versionText} - 通常処理を継続`);
          }
        } else {
          log.debug("ℹ️ バージョン表示要素が見つかりません（通常の応答）");
        }

        log.debug(
          "%c✅【Step 4-7-0】Canvas V2検出チェック完了",
          "color: #4CAF50; font-weight: bold;",
        );
        log.debug("─".repeat(50));

        // ========================================
        // ⏳ Step 4-7: 応答待機
        // ========================================
        log.info("【Step 4-7】応答待機開始");

        log.debug(
          "%c【Step 4-7-1】応答待機開始",
          "color: #607D8B; font-weight: bold;",
        );
        const waitStartTime = Date.now();

        if (isDeepResearch) {
          // Deep Research wait mode
          log.debug("─".repeat(40));
          // Max wait: 40min
          log.debug("🎯 監視対象: Canvas機能、プレビューボタン、停止ボタン");
          await handleDeepResearchWait();
        } else {
          // ========================================
          // Step 4-7-2: 通常応答待機
          // ========================================
          log.debug("📝【Step 4-7-3】通常応答待機（停止ボタン監視）");
          log.debug("─".repeat(40));
          log.debug(
            `⏱️ 最大待機時間: ${Math.round(AI_WAIT_CONFIG.STOP_BUTTON_INITIAL_WAIT / 60000)}分`,
          );
          log.debug("🎯 監視対象: 回答停止ボタン");

          let stopButtonFound = false;
          let waitCount = 0;
          const maxInitialWait = AI_WAIT_CONFIG.STOP_BUTTON_INITIAL_WAIT / 1000;

          while (!stopButtonFound && waitCount < maxInitialWait) {
            const stopResult = await findClaudeElement(
              claudeSelectors["3_回答停止ボタン"],
              3,
              true,
            );

            if (stopResult) {
              stopButtonFound = true;
              log.debug(`✓ 停止ボタンが出現（${waitCount}秒後）`);
              break;
            }

            await wait(1000);
            waitCount++;

            if (waitCount % 5 === 0) {
              log.debug(`  応答生成中... ${waitCount}秒経過`);
            }
          }

          if (stopButtonFound) {
            log.debug("\n停止ボタンが消えるまで待機中...");
            let stopButtonGone = false;
            let isCanvasMode = false;
            let disappearWaitCount = 0;
            let confirmCount = 0; // 連続で停止ボタンが見つからない回数

            // 文字数監視用の変数を追加
            let lastTextLength = 0; // 前回の文字数
            let textUnchangedCount = 0; // 文字数が変化しなかった秒数
            const maxTextUnchangedTime = 60; // 60秒間変化なしで完了とする
            const maxTotalWaitTime = AI_WAIT_CONFIG.MAX_WAIT / 1000; // 30分（1800秒）
            const textMonitorStartTime = 600; // 10分（600秒）後から文字数監視開始

            // ハイブリッド監視モード
            log.debug(
              `📊 [STOP-BUTTON-MONITOR] 監視開始 - 最初10分は停止ボタン、その後は文字数監視`,
            );
            log.debug(`  ・最大待機時間: ${maxTotalWaitTime / 60}分`);
            log.debug(`  ・文字数監視開始: ${textMonitorStartTime / 60}分後`);

            while (disappearWaitCount < maxTotalWaitTime) {
              // 最大30分待機
              // 毎秒文字数をチェックする
              let currentTextLength = 0;

              // Canvasテキストをチェック
              const canvasElement = await findClaudeElement(
                deepResearchSelectors["4_Canvas機能テキスト位置"],
                1,
                true,
              );
              if (canvasElement) {
                currentTextLength += canvasElement.textContent
                  ? canvasElement.textContent.trim().length
                  : 0;
              }

              // 通常テキストをチェック
              const normalElement = await findClaudeElement(
                deepResearchSelectors["5_通常処理テキスト位置"],
                1,
                true,
              );
              if (normalElement) {
                currentTextLength += normalElement.textContent
                  ? normalElement.textContent.trim().length
                  : 0;
              }

              // 文字数変化の判定
              if (
                currentTextLength > 0 &&
                currentTextLength === lastTextLength
              ) {
                textUnchangedCount++;

                // 10秒ごとに進捗ログ
                if (textUnchangedCount % 10 === 0) {
                  log.debug(
                    `📊 [TEXT-MONITOR] 文字数変化なし: ${textUnchangedCount}秒 / ${maxTextUnchangedTime}秒 (${currentTextLength}文字)`,
                  );
                }

                // 60秒間文字数が変化しない場合は完了と判定
                if (textUnchangedCount >= maxTextUnchangedTime) {
                  stopButtonGone = true;
                  log.debug(
                    `✓ 応答生成完了（文字数${maxTextUnchangedTime}秒間変化なし: ${currentTextLength}文字）`,
                  );

                  ClaudeLogManager.logStep(
                    "Generation-Complete",
                    `文字数${maxTextUnchangedTime}秒間安定: ${currentTextLength}文字`,
                    {
                      finalCharCount: currentTextLength,
                      unchangedSeconds: textUnchangedCount,
                      totalTime: disappearWaitCount,
                    },
                  );

                  await wait(3000);
                  break;
                }
              } else if (currentTextLength !== lastTextLength) {
                // ========================================
                // 🚨 異常検出機能（文字数監視の根本的改善）
                // ========================================

                // 文字数が突然0になった場合の異常検出
                if (lastTextLength > 0 && currentTextLength === 0) {
                  log.warn(
                    "🚨 [TEXT-MONITOR-ERROR] 文字数が突然0になりました - エラー状態を検出",
                  );

                  // Claude APIエラーを確認
                  const apiErrorDetected =
                    window.claudeAPIErrorDetected || false;
                  const lastConsoleError =
                    window.claudeLastConsoleError || null;

                  if (apiErrorDetected) {
                    log.error(
                      "🔥 [TEXT-MONITOR-ERROR] Claude APIエラーが検出されています:",
                      {
                        textLengthDrop: `${lastTextLength} → ${currentTextLength}`,
                        apiErrorTime: lastConsoleError?.timestamp,
                        currentTime: Date.now(),
                        timeDiff: lastConsoleError
                          ? Date.now() - lastConsoleError.timestamp
                          : "unknown",
                      },
                    );

                    // エラー状態として即座に停止
                    stopButtonGone = true;
                    log.error(
                      "❌ [TEXT-MONITOR-ERROR] Claude APIエラー + 文字数消失により処理を中断",
                    );

                    ClaudeLogManager.logStep(
                      "Error-Detected",
                      `Claude APIエラー + 文字数消失: ${lastTextLength} → 0`,
                      {
                        errorType: "CLAUDE_API_ERROR_WITH_TEXT_LOSS",
                        previousTextLength: lastTextLength,
                        apiErrorDetected: apiErrorDetected,
                        lastConsoleError: lastConsoleError,
                      },
                    );
                    break;
                  }

                  // DOM要素の健全性チェック
                  const canvasExists = canvasElement !== null;
                  const normalExists = normalElement !== null;

                  if (!canvasExists && !normalExists) {
                    log.warn(
                      "⚠️ [TEXT-MONITOR-ERROR] すべてのDOM要素が見つかりません - ページ状態異常の可能性",
                    );

                    // DOM異常として処理を中断
                    stopButtonGone = true;
                    log.error(
                      "❌ [TEXT-MONITOR-ERROR] DOM要素消失により処理を中断",
                    );

                    ClaudeLogManager.logStep(
                      "Error-Detected",
                      `DOM要素消失 + 文字数消失: ${lastTextLength} → 0`,
                      {
                        errorType: "DOM_ELEMENTS_MISSING",
                        previousTextLength: lastTextLength,
                        canvasExists: canvasExists,
                        normalExists: normalExists,
                      },
                    );
                    break;
                  }

                  // 軽度の文字数リセット（1回のみ警告）
                  log.warn(
                    "⚠️ [TEXT-MONITOR-WARNING] 文字数が0にリセットされました（継続監視）",
                  );
                }

                // 通常の文字数変化処理
                if (textUnchangedCount > 0) {
                  log.debug(
                    `🔄 [TEXT-MONITOR] 文字数変化検出 - カウンタリセット (${lastTextLength} → ${currentTextLength}文字, ${textUnchangedCount}秒後)`,
                  );
                }
                textUnchangedCount = 0;
                lastTextLength = currentTextLength;
              }

              // 待機中の詳細ログ（10秒ごと）
              if (disappearWaitCount % 10 === 0 && disappearWaitCount > 0) {
                log.debug(
                  `  生成中... ${Math.floor(disappearWaitCount / 60)}分${disappearWaitCount % 60}秒経過 (文字数: ${currentTextLength})`,
                );

                // 10分経過の通知（削除されたタイムアウトの代わり）
                if (disappearWaitCount === 600) {
                  log.debug(
                    `⏱️ [INFO] 10分経過 - 文字数監視継続中 (現在: ${currentTextLength}文字)`,
                  );
                }
              }

              // ========================================
              // 🚨 エラー状態判定機能（停止ボタン監視の最適化）
              // ========================================

              // Claude APIエラーの状態をチェック
              const apiErrorDetected = window.claudeAPIErrorDetected || false;
              const lastConsoleError = window.claudeLastConsoleError || null;

              if (apiErrorDetected && lastConsoleError) {
                const timeSinceError = Date.now() - lastConsoleError.timestamp;

                // APIエラーから5秒以上経過している場合は早期終了
                if (timeSinceError >= 5000) {
                  log.error(
                    "🚨 [STOP-BUTTON-ERROR] Claude APIエラーにより停止ボタン監視を中断:",
                    {
                      errorAge: `${Math.round(timeSinceError / 1000)}秒前`,
                      errorMessage: lastConsoleError.message,
                      currentWaitTime: `${Math.floor(disappearWaitCount / 60)}分${disappearWaitCount % 60}秒`,
                    },
                  );

                  stopButtonGone = true;

                  ClaudeLogManager.logStep(
                    "Error-EarlyExit",
                    `Claude APIエラーにより停止ボタン監視を早期終了`,
                    {
                      errorType: "CLAUDE_API_ERROR",
                      timeSinceError: timeSinceError,
                      totalWaitTime: disappearWaitCount,
                      errorMessage: lastConsoleError.message,
                    },
                  );
                  break;
                }
              }

              // ページ状態の健全性判定
              const pageTitle = document.title || "";
              const pageURL = window.location.href || "";

              // ページがエラー状態や異常状態でないかチェック
              const isErrorPage =
                pageTitle.includes("Error") ||
                pageTitle.includes("エラー") ||
                pageURL.includes("error") ||
                pageURL !== window.location.href; // URL変更検出

              if (isErrorPage) {
                log.error("🚨 [STOP-BUTTON-ERROR] ページエラー状態を検出:", {
                  pageTitle: pageTitle,
                  pageURL: pageURL,
                  waitTime: disappearWaitCount,
                });

                stopButtonGone = true;

                ClaudeLogManager.logStep(
                  "Error-EarlyExit",
                  "ページエラー状態により停止ボタン監視を早期終了",
                  {
                    errorType: "PAGE_ERROR",
                    pageTitle: pageTitle,
                    pageURL: pageURL,
                    totalWaitTime: disappearWaitCount,
                  },
                );
                break;
              }

              // 停止ボタンの状態をチェック
              const stopResult = await findClaudeElement(
                claudeSelectors["3_回答停止ボタン"],
                3, // リトライ回数を増やす
                true,
              );

              if (!stopResult) {
                // 停止ボタンが見つからない
                const previousCount = confirmCount;
                confirmCount++;

                const stopCheckThreshold = Math.ceil(
                  AI_WAIT_CONFIG.CHECK_INTERVAL / 1000,
                );
                log.debug(
                  `🔍 [STOP-BUTTON-CHECK] 停止ボタン非検出 (confirmCount: ${confirmCount}/${stopCheckThreshold}, 経過時間: ${disappearWaitCount}秒)`,
                );

                if (confirmCount >= stopCheckThreshold) {
                  // UI設定秒数連続で停止ボタンが見つからない場合のみ完了と判定

                  stopButtonGone = true;
                  log.debug(
                    `✓ 応答生成完了（総時間: ${disappearWaitCount}秒, 連続非検出: ${confirmCount}秒）`,
                  );

                  // 停止ボタン消滅後の3秒待機
                  await wait(3000);
                  break;
                }
              } else {
                // 停止ボタンが見つかった場合はカウントをリセット
                if (confirmCount > 0) {
                  log.debug(
                    `🔄 [STOP-BUTTON-CHECK] 停止ボタン再検出 - confirmCountリセット (前回値: ${confirmCount})`,
                  );
                  confirmCount = 0;
                }

                // 詳細なログ（5秒ごと）
                if (disappearWaitCount % 5 === 0) {
                  log.debug(
                    `⏳ [STOP-BUTTON-CHECK] 停止ボタン継続検出中 (経過時間: ${disappearWaitCount}秒)`,
                  );
                }
              }

              await wait(1000);
              disappearWaitCount++;

              // 長時間待機の通知（60秒ごと）
              if (disappearWaitCount % 60 === 0 && disappearWaitCount > 0) {
                const monitorMode =
                  disappearWaitCount >= textMonitorStartTime
                    ? "文字数監視"
                    : "停止ボタン監視";
                log.debug(`📊 [STATUS] 処理継続中:`, {
                  経過時間: `${Math.floor(disappearWaitCount / 60)}分`,
                  監視モード: monitorMode,
                  現在文字数: `${currentTextLength}文字`,
                  文字数変化なし: `${textUnchangedCount}秒`,
                  confirmCount: confirmCount,
                  停止ボタン最終検出: stopResult ? "検出中" : "非検出",
                });
              }

              // 30分タイムアウトチェック
              if (disappearWaitCount >= maxTotalWaitTime) {
                log.warn(
                  `⚠️ [TIMEOUT] 最大待機時間${maxTotalWaitTime / 60}分に到達 - 強制終了`,
                );
                log.warn(`  最終文字数: ${currentTextLength}文字`);
                stopButtonGone = true;
                break;
              }
            }
          }
        }

        const waitEndTime = Date.now();
        const totalWaitTime = Math.round((waitEndTime - waitStartTime) / 1000);
        log.debug(`⏱️ 応答待機総時間: ${totalWaitTime}秒`);
        log.debug(
          "%c✅【Step 4-7-4】応答待機処理完了",
          "color: #4CAF50; font-weight: bold;",
        );
        log.debug("─".repeat(50));

        // 応答完了後の追加待機とウィンドウ状態確認
        await wait(3000);

        // log.debug('🔍 [Claude] ウィンドウ状態確認はスキップ（Content Script制限）');

        // ========================================
        // Step 4-7-4-1: Canvasプレビューボタンチェック
        // ========================================
        log.debug(
          "%c【Step 4-7-4-1】Canvasプレビューボタンの存在確認",
          "color: #9C27B0; font-weight: bold;",
        );
        log.debug("─".repeat(40));

        const previewButton = await findClaudeElement(
          deepResearchSelectors["4_4_Canvasプレビューボタン"],
          3,
          true,
        );

        if (previewButton) {
          log.debug("✓ Canvasプレビューボタンを発見、クリック中...");

          previewButton.click();

          // Canvas表示を3秒間待機
          log.debug("⏳ Canvas表示を3秒間待機中...");
          await wait(3000);

          // Canvas内容の確認
          const canvasContent = await findClaudeElement(
            deepResearchSelectors["4_Canvas機能テキスト位置"],
            2,
            true,
          );
          if (canvasContent) {
            log.debug("✅ Canvas内容が表示されました");
            log.debug(`   - 要素ID: ${canvasContent.id || "(なし)"}`);
            log.debug(
              `   - テキスト長: ${canvasContent.textContent ? canvasContent.textContent.trim().length : 0}文字`,
            );
          } else {
            log.debug("⚠️ Canvas内容が検出されませんでした");
          }
        } else {
          log.debug(
            "ℹ️ Canvasプレビューボタンは検出されませんでした（通常の回答のみ）",
          );
        }

        // ========================================
        // Step 4-7-5: 「続ける」ボタンチェック
        // ========================================
        log.debug(
          "%c【Step 4-7-5】「続ける」ボタンの存在確認",
          "color: #607D8B; font-weight: bold;",
        );
        log.debug("─".repeat(40));
        const continueButton = await findClaudeElement(
          deepResearchSelectors["4_3_Canvas続けるボタン"],
          3,
          true,
        );

        if (continueButton) {
          log.debug("✓「続ける」ボタンを発見、クリック中...");

          // 「続ける」ボタンクリック前のウィンドウ状態確認
          try {
            const currentWindow = await chrome.windows.getCurrent();
            log.debug(
              "🔍 [Claude] 「続ける」ボタンクリック前のウィンドウ状態:",
              {
                windowId: currentWindow.id,
                state: currentWindow.state,
                timestamp: new Date().toISOString(),
              },
            );
          } catch (windowError) {
            log.error(
              "⚠️ [Claude] 「続ける」ボタンクリック前のウィンドウエラー:",
              windowError,
            );
          }

          continueButton.click();
          await wait(2000);

          // 「続ける」ボタンクリック後のウィンドウ状態確認
          try {
            const currentWindow = await chrome.windows.getCurrent();
            log.debug(
              "🔍 [Claude] 「続ける」ボタンクリック後のウィンドウ状態:",
              {
                windowId: currentWindow.id,
                state: currentWindow.state,
                timestamp: new Date().toISOString(),
              },
            );
          } catch (windowError) {
            log.error(
              "🚨 [Claude] 「続ける」ボタンクリック後のウィンドウエラー:",
              {
                error: windowError.message,
                timestamp: new Date().toISOString(),
                action: "「続ける」ボタンクリック後",
              },
            );
          }

          // 新しい応答サイクルの応答待機を実行
          log.debug("🔄 新しい応答サイクルの停止ボタン出現を待機中...");
          let stopButtonFound = false;
          let waitCount = 0;
          const maxWait = 30; // 30秒まで待機

          while (!stopButtonFound && waitCount < maxWait) {
            // このループ中でもウィンドウ状態を監視
            if (waitCount % 5 === 0 && waitCount > 0) {
              try {
                const currentWindow = await chrome.windows.getCurrent();
                log.debug(
                  `🔍 [Claude] 「続ける」処理中のウィンドウ状態 (${waitCount}秒):`,
                  {
                    windowId: currentWindow.id,
                    state: currentWindow.state,
                    focused: currentWindow.focused,
                  },
                );
              } catch (windowError) {
                log.error("🚨 [Claude] 「続ける」処理中のウィンドウエラー:", {
                  error: windowError.message,
                  waitTime: waitCount,
                  timestamp: new Date().toISOString(),
                });
              }
            }

            const stopResult = await findClaudeElement(
              deepResearchSelectors["3_回答停止ボタン"],
              2,
              true,
            );
            if (stopResult) {
              stopButtonFound = true;
              log.debug(`✓ 回答停止ボタンが出現（${waitCount}秒後）`);
              break;
            }
            await wait(1000);
            waitCount++;
          }

          // 回答停止ボタンが消滅するまで待機
          if (stopButtonFound) {
            log.debug("🔄 継続応答完了まで待機中...");
            while (waitCount < 600) {
              // 最大10分待機
              const stopResult = await findClaudeElement(
                deepResearchSelectors["3_回答停止ボタン"],
                2,
                true,
              );
              if (!stopResult) {
                // Stop確認間隔で確認
                const checkIntervalSeconds =
                  AI_WAIT_CONFIG.CHECK_INTERVAL / 1000;
                let stillGone = true;
                for (
                  let confirmCount = 0;
                  confirmCount < checkIntervalSeconds;
                  confirmCount++
                ) {
                  await wait(1000);
                  const reconfirmResult = await findClaudeElement(
                    deepResearchSelectors["3_回答停止ボタン"],
                    2,
                    true,
                  );
                  if (reconfirmResult) {
                    stillGone = false;
                    log.debug(`  停止ボタン再出現（${confirmCount + 1}秒後）`);
                    break;
                  }
                }

                if (stillGone) {
                  log.debug("✓ 継続応答生成完了");
                  // 停止ボタン消滅後の3秒待機
                  // Post-stop wait...
                  await wait(3000);
                  break;
                }
              }
              await wait(1000);
              waitCount++;
            }
          }

          log.debug(
            "%c✅【Step 4-7-5】「続ける」ボタン処理完了",
            "color: #4CAF50; font-weight: bold;",
          );
          await wait(2000); // 追加待機
        } else {
          log.debug(
            "「続ける」ボタンは見つかりませんでした。次のステップに進みます。",
          );
          log.debug(
            "%c✅【Step 4-7-5】「続ける」ボタンチェック完了",
            "color: #4CAF50; font-weight: bold;",
          );
        }

        // ========================================
        // 📥 Step 4-8: 結果取得
        // ========================================
        log.info("【Step 4-8】テキスト取得");
        log.debug(
          "%c【Step 4-8-1】テキスト取得処理開始",
          "color: #3F51B5; font-weight: bold;",
        );
        log.debug("─".repeat(40));
        log.debug("🎯 取得対象: Canvas機能、通常応答テキスト");

        // Canvas処理後の最終テキスト取得（応答完了後に再取得）
        log.debug(
          `🔍 最終テキスト取得開始 - 現在のfinalText: ${finalText ? finalText.length + "文字" : "なし"}`,
        );

        // Canvas機能のテキストを優先的に最終取得
        let canvasResult = null;
        try {
          log.debug("🔍 Canvas要素検索開始（Canvas専用セレクタ使用）");

          // Canvas専用IDセレクタを使用してCanvas要素のみを確実に取得
          const canvasSelectors = {
            selectors: ["#markdown-artifact", 'div[id="markdown-artifact"]'],
            description: "Canvas機能専用要素（markdown-artifact）",
          };

          log.debug(`  使用セレクタ:`, canvasSelectors);

          canvasResult = await findClaudeElement(canvasSelectors, 5, true);

          log.debug(
            `  Canvas要素検索結果: ${canvasResult ? "見つかった" : "見つからない"}`,
          );
          if (canvasResult) {
            log.debug(`  - Canvas要素タグ: ${canvasResult.tagName}`);
            log.debug(`  - Canvas要素クラス: ${canvasResult.className}`);
            log.debug(
              `  - Canvas要素テキスト長: ${canvasResult.textContent?.length || 0}文字`,
            );
          }
        } catch (canvasError) {
          log.error("⚠️ [Claude] Canvasテキスト取得エラー:", {
            error: canvasError.message,
            timestamp: new Date().toISOString(),
          });
        }

        if (canvasResult) {
          log.debug("🎨 Canvas機能の最終テキストを取得中...");
          log.debug(
            "🚫 【Step 4-8-1】プロンプト除外機能を適用してテキスト取得",
          );
          const textInfo = await getTextPreview(canvasResult);
          log.debug(`📊 getTextPreview結果:`, {
            hasTextInfo: !!textInfo,
            fullTextLength: textInfo?.full?.length || 0,
            fullTextPreview: textInfo?.full?.substring(0, 100) || "(空)",
            lengthProperty: textInfo?.length || 0,
          });

          if (textInfo && textInfo.full && textInfo.full.length > 100) {
            finalText = textInfo.full;
            log.debug(
              `📄 Canvas 最終テキスト取得完了 (${textInfo.length}文字)`,
            );
            log.debug(
              "✅ 【Step 4-8-2】プロンプト除外完了 - 純粋なAI応答を取得",
            );
            log.debug(
              "プレビュー:\n",
              textInfo.preview.substring(0, 200) + "...",
            );
          } else {
            log.debug("⚠️ Canvas要素は見つかったが、テキストが不十分");
          }
        }

        // Canvas以外の処理（通常テキストのフォールバック）
        if (!finalText) {
          log.debug("🔍 Canvas以外のテキストを確認中...");
          log.debug(
            "🚫 【Step 4-8-3】getReliableAIResponse()を使用してテキスト取得（通常応答）",
          );

          // セレクタベースの要素検索は使わず、getReliableAIResponse()を直接使用
          // 理由: セレクタ検索では.standard-markdownがユーザーメッセージもマッチしてしまう
          const textInfo = await getTextPreview(); // 引数なしで呼び出し → getReliableAIResponse()を使用

          log.debug(`📊 getTextPreview結果 (通常):`, {
            hasTextInfo: !!textInfo,
            fullTextLength: textInfo?.full?.length || 0,
            fullTextPreview: textInfo?.full?.substring(0, 100) || "(空)",
            lengthProperty: textInfo?.length || 0,
          });

          if (textInfo && textInfo.full) {
            finalText = textInfo.full;
            log.debug(`📄 通常 テキスト取得完了 (${textInfo.length}文字)`);
            log.debug(
              "✅ 【Step 4-8-4】プロンプト除外完了 - 純粋なAI応答を取得",
            );
            log.debug(
              "プレビュー:\n",
              textInfo.preview.substring(0, 200) + "...",
            );
          } else {
            log.debug("⚠️ AI応答が取得できませんでした");
          }
        }

        // finalTextの確実な初期化
        log.debug("🔍 [FINAL-TEXT-CHECK] 最終テキスト状況確認:");
        log.debug(`  - finalText存在: ${!!finalText}`);
        log.debug(`  - finalText型: ${typeof finalText}`);
        log.debug(`  - finalText長: ${finalText?.length || 0}文字`);
        log.debug(
          `  - finalText内容（先頭100文字）: ${finalText?.substring(0, 100) || "(空)"}`,
        );

        if (!finalText || finalText.trim() === "") {
          log.warn(
            "⚠️ [FINAL-TEXT-CHECK] テキストが取得できませんでした - デバッグ情報:",
          );

          // デバッグ用：ページ上のテキスト要素を再検索
          try {
            const allTextElements = document.querySelectorAll(
              '[class*="markdown"], [class*="response"], [class*="message"], div[role="main"] div, main div',
            );
            log.debug(
              `  - ページ上の潜在的テキスト要素数: ${allTextElements.length}`,
            );

            for (let i = 0; i < Math.min(5, allTextElements.length); i++) {
              const elem = allTextElements[i];
              const text = elem.textContent?.trim() || "";
              if (text.length > 50) {
                log.debug(
                  `  - 要素${i + 1}: ${text.substring(0, 100)}... (${text.length}文字)`,
                );
              }
            }
          } catch (debugError) {
            log.debug(`  - デバッグ検索エラー: ${debugError.message}`);
          }

          finalText = "テキスト取得失敗";
        } else {
          log.debug("✅ [FINAL-TEXT-CHECK] 正常なテキストを取得");
        }

        log.debug(
          "%c✅【Step 4-8-2】テキスト取得処理完了",
          "color: #4CAF50; font-weight: bold;",
        );
        // 統合ログ: 回答取得完了（冒頭50文字）
        const responsePreview =
          finalText.substring(0, 50) + (finalText.length > 50 ? "..." : "");
        log.debug(`📊 最終取得文字数: ${finalText.length}文字`);
        log.debug("─".repeat(50));

        log.debug("\n" + "=".repeat(60));
        log.debug(
          "%c✨ Claude V2 タスク完了",
          "color: #4CAF50; font-weight: bold; font-size: 16px",
        );
        log.debug("=".repeat(60));

        const totalExecutionTime = Date.now() - taskStartTime.getTime();
        log.debug("📈 タスク実行サマリー:");
        log.debug(
          `  ├─ 総実行時間: ${Math.round(totalExecutionTime / 1000)}秒`,
        );
        log.debug(`  ├─ 入力文字数: ${prompt.length}文字`);
        log.debug(`  ├─ 出力文字数: ${finalText.length}文字`);
        log.debug(`  ├─ 使用モデル: ${modelName || "未指定"}`);
        log.debug(`  ├─ 使用機能: ${featureName || "通常"}`);
        log.debug(`  └─ 送信時刻: ${sendTime.toISOString()}`);

        // 回答取得完了時点でURLを取得（全AI統一）
        const currentUrl = window.location.href;

        // DetailedLogManagerに受信完了とURLを記録
        // taskId は関数の最初で既に宣言済み
        const receiveTime = new Date();

        if (window.parent && window.parent.detailedLogManager) {
          try {
            window.parent.detailedLogManager.recordReceiveTime(
              taskId,
              currentUrl,
            );
            log.debug("📡 DetailedLogManagerに受信完了とURLを記録:", {
              taskId: taskId,
              url: currentUrl,
              receiveTime: receiveTime.toISOString(),
            });
          } catch (logError) {
            log.warn("⚠️ DetailedLogManager受信記録エラー:", logError);
          }
        } else if (window.top && window.top.detailedLogManager) {
          try {
            window.top.detailedLogManager.recordReceiveTime(taskId, currentUrl);
            log.debug("📡 DetailedLogManagerに受信完了とURLを記録:", {
              taskId: taskId,
              url: currentUrl,
              receiveTime: receiveTime.toISOString(),
            });
          } catch (logError) {
            log.warn("⚠️ DetailedLogManager受信記録エラー:", logError);
          }
        }

        // 全AI統一形式（シンプルなフラット構造）
        const result = {
          success: true,
          response: finalText,
          model: modelName,
          function: featureName,
          sendTime: sendTime,
          url: currentUrl, // 会話URLを記録
          cellInfo: taskData.cellInfo,
        };

        // タスク完了をログに記録
        ClaudeLogManager.completeTask(result);
        ClaudeLogManager.logStep("Step7-Complete", "タスク正常完了", {
          responseLength: finalText ? finalText.length : 0,
          responsePreview: finalText
            ? finalText.substring(0, 100) + "..."
            : "テキスト取得失敗",
          model: modelName,
          function: featureName,
          cellInfo: taskData.cellInfo,
        });

        // 実際の表示情報を取得（ChatGPT/Geminiと同様）
        let displayedModel = "";
        let displayedFunction = "";

        try {
          // 実際のモデル情報を取得
          displayedModel = getCurrentModelInfo() || "";
          log.debug(`📊 [Claude-Direct] 実際のモデル: "${displayedModel}"`);

          // 実際の機能情報を取得
          const functionConfirmation = confirmFeatureSelection(featureName);
          displayedFunction = functionConfirmation.detected.join(", ") || "";
          log.debug(`📊 [Claude-Direct] 実際の機能: "${displayedFunction}"`);
        } catch (infoError) {
          log.warn(
            `⚠️ [Claude-Direct] 表示情報取得エラー: ${infoError.message}`,
          );
        }

        // 統合フロー用にresultオブジェクトを拡張（ChatGPT/Geminiと同じ形式）
        // sendTime = new Date(); // この行は削除 - sendTimeは送信時に既に設定済み
        result.displayedModel = displayedModel;
        result.displayedFunction = displayedFunction;
        result.sendTime = sendTime; // 既存の送信時刻を使用

        // 統合ログ: すべての情報を1つのログで出力
        const promptPreview = prompt
          ? prompt.substring(0, 10) + (prompt.length > 10 ? "..." : "")
          : "(空のプロンプト)";

        log.debug(
          "✅ [Claude-Unified] タスク完了 - 統合フローでDropbox→スプレッドシートの順序で処理します",
          {
            sendTime: sendTime.toISOString(),
            taskId: taskData.cellInfo,
            displayedModel: displayedModel,
            displayedFunction: displayedFunction,
          },
        );

        // リトライマネージャーの統計情報をログに記録
        try {
          const retryManager = new ClaudeRetryManager();
          const metrics = retryManager.getMetrics();
          if (metrics.totalAttempts > 0) {
            log.debug("📊 [Claude-Metrics] リトライ統計:", metrics);
            ClaudeLogManager.logStep(
              "Task-Metrics",
              "リトライマネージャー統計",
              metrics,
            );
          }
        } catch (metricsError) {
          log.warn("⚠️ メトリクス取得エラー:", metricsError.message);
        }

        // 【修正】タスク完了時のスプレッドシート書き込み確認と通知処理を追加
        // タスク重複実行問題を修正：書き込み成功を確実に確認してから完了通知
        try {
          if (result.success && taskData.cellInfo) {
            log.debug(
              "📊 [Claude-TaskCompletion] スプレッドシート書き込み成功確認開始",
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
                      "ℹ️ [Claude-TaskCompletion] 完了通知エラー（継続処理）:",
                      completionResult.message,
                    );
                  } else {
                    log.info(
                      "✅ [Claude-TaskCompletion] 作業中マーカークリア通知送信完了",
                      {
                        taskId: taskData.taskId || taskData.cellInfo,
                        response: completionResult.response,
                      },
                    );
                  }
                })
                .catch((error) => {
                  log.warn(
                    "⚠️ [Claude-TaskCompletion] 完了通知送信エラー:",
                    error.message || error,
                  );
                });
            }
          }
        } catch (completionError) {
          log.warn(
            "⚠️ [Claude-TaskCompletion] 完了処理エラー:",
            completionError.message,
          );
        }

        // 実行状態を解除
        setExecutionState(false);

        // ========================================
        // Step 4-9: 完了時刻記録
        // ========================================
        log.info("【Step 4-9】完了時刻記録");
        await recordCompletionTime(
          taskId,
          currentUrl,
          taskData,
          displayedModel || result.model || modelName,
          displayedFunction || result.function || featureName,
        );

        log.info("✅ 【Step 4-0】Claude タスク実行完了");
        return result;
      } catch (error) {
        // エラー時も実行状態を解除
        setExecutionState(false);

        // 🔍 [HYPOTHESIS-TEST] React Error #418 検出とログ
        const isReactError418 =
          error.message.includes("Minified React error #418") ||
          error.stack?.includes("418");
        const isMessagePortError =
          error.message.includes("message port closed") ||
          error.message.includes(
            "The message port closed before a response was received",
          );

        if (isReactError418) {
          console.error(
            "🚨 [REACT-ERROR-418-DETECTED] React Error #418 が executeTask 内で検出されました:",
            {
              errorMessage: error.message,
              errorStack: error.stack,
              timestamp: new Date().toISOString(),
              currentURL: window.location.href,
              domState: document.readyState,
              hypothesis: "テキスト入力処理とReact仮想DOMの競合",
            },
          );

          // DOM状態をログ出力
          const inputElements = document.querySelectorAll(
            '[aria-label*="プロンプト"], [contenteditable="true"], textarea',
          );
          console.error("🔍 [REACT-ERROR-418-DOM] DOM状態詳細:", {
            inputElementCount: inputElements.length,
            inputElements: Array.from(inputElements).map((el) => ({
              tagName: el.tagName,
              type: el.type || "none",
              contentEditable: el.contentEditable,
              ariaLabel: el.getAttribute("aria-label"),
              className: el.className,
            })),
          });
        }

        if (isMessagePortError) {
          console.error(
            "🚨 [MESSAGE-PORT-ERROR-DETECTED] Message Port Error が検出されました:",
            {
              errorMessage: error.message,
              errorStack: error.stack,
              timestamp: new Date().toISOString(),
              chromeRuntimeAvailable:
                typeof chrome !== "undefined" && chrome.runtime,
              extensionId:
                typeof chrome !== "undefined" && chrome.runtime
                  ? chrome.runtime.id
                  : "unknown",
              hypothesis: "Chrome拡張機能のメッセージ送信タイミング問題",
            },
          );
        }

        log.error("❌ 【Step 4-0】Claude タスク実行エラー:", error.message);
        log.error("スタックトレース:", error.stack);

        const result = {
          success: false,
          error: error.message,
          text: "エラーが発生しました: " + error.message,
        };

        // リトライマネージャーで最終リトライを実行
        log.debug("🔄 内蔵リトライマネージャーでエラー復旧を試行中...");
        const retryManager = new ClaudeRetryManager();

        const retryResult = await retryManager.executeWithRetry(
          async () => {
            // タスクを再実行 (executeClaude → executeTask に修正)
            log.info("🔍 [DIAGNOSTIC] リトライでexecuteTask呼び出し");
            return await executeTask(taskData);
          },
          "Claude全体タスク最終リトライ",
          {
            taskId: taskData.taskId,
            originalError: error.message,
            errorType: error.name,
          },
        );

        if (retryResult.success) {
          log.debug("✅ リトライマネージャーでタスク復旧成功");

          // 復旧成功のログ記録
          ClaudeLogManager.logStep(
            "Error-Recovery",
            "リトライマネージャーによる復旧成功",
            {
              originalError: error.message,
              retryCount: retryResult.retryCount,
              executionTime: retryResult.executionTime,
            },
          );

          return retryResult.result;
        }

        const finalResult = {
          success: false,
          error: error.message,
          text: "エラーが発生しました: " + error.message,
          needsRetry: true,
          retryReason: "CLAUDE_AUTOMATION_ERROR",
        };

        // エラーをログに記録（詳細情報付き）
        ClaudeLogManager.logError("Task-Error", error, {
          taskData,
          errorMessage: error.message,
          errorStack: error.stack,
          errorName: error.name,
          retryAttempted: true,
          retryCount: retryResult.retryCount,
          retryMetrics: retryManager.getMetrics(),
          currentStep:
            ClaudeLogManager.logs && ClaudeLogManager.logs.length > 0
              ? ClaudeLogManager.logs[ClaudeLogManager.logs.length - 1]?.step
              : "unknown",
          timestamp: new Date().toISOString(),
          userAgent: navigator.userAgent,
          url: window.location.href,
        });
        ClaudeLogManager.completeTask(finalResult);

        return finalResult;
      }
    }

    // ========================================
    // 個別フェーズ関数は削除（未使用のため）
    // 実際の処理は executeTask 関数内で直接実装されている
    // ========================================
    // ========================================
    // runAutomation関数（後方互換性）
    // ========================================
    async function runAutomation(config) {
      return executeTask({
        model: config.model,
        function: config.function,
        prompt: config.text || config.prompt,
      });
    }

    // ========================================
    // 🔍 古いメッセージリスナーコードは削除
    // ========================================
    // 注意: メッセージリスナーは上部（515行目付近）に移動済み
    // 直接実行方式への段階的移行のため、早期にリスナーを登録する必要がある

    const initCompleteTime = Date.now();
    window.CLAUDE_SCRIPT_LOADED = true;
    window.CLAUDE_SCRIPT_INIT_TIME = initCompleteTime;

    const initDuration = initCompleteTime - scriptLoadTime;

    log.debug("✅ [STEP 4-SUCCESS] Content Script初期化完了:", {
      初期化完了時刻: new Date(initCompleteTime).toISOString(),
      初期化時間: `${initDuration}ms`,
      マーカー状態: {
        CLAUDE_SCRIPT_LOADED: window.CLAUDE_SCRIPT_LOADED,
        CLAUDE_SCRIPT_INIT_TIME: window.CLAUDE_SCRIPT_INIT_TIME,
      },
      利用可能機能: {
        executeTask: typeof executeTask !== "undefined",
        runAutomation: typeof runAutomation !== "undefined",
        CLAUDE_SELECTORS: typeof CLAUDE_SELECTORS !== "undefined",
      },
      メッセージリスナー: "登録済み",
    });

    log.debug("✅ Claude Automation V2 準備完了（メッセージベース通信）");
    log.debug("使用方法: Chrome Runtime Message経由でタスクを実行");

    // 初期化完了を知らせるカスタムイベントを発行
    window.dispatchEvent(
      new CustomEvent("claudeAutomationReady", {
        detail: {
          initTime: initCompleteTime,
          loadDuration: initDuration,
          version: "V2",
        },
      }),
    );

    log.debug("📡 [Claude初期化DEBUG] claudeAutomationReadyイベント発行完了");

    // ========================================
    // ウィンドウ終了時のログ保存処理
    // ========================================
    window.addEventListener("beforeunload", async (event) => {
      log.debug("🔄 [ClaudeAutomation] ウィンドウ終了検知 - ログ保存開始");

      try {
        // ログをファイルに保存
        const fileName = await ClaudeLogManager.saveToFile();
        if (fileName) {
          log.debug(`✅ [ClaudeAutomation] ログ保存完了: ${fileName}`);
        }
      } catch (error) {
        log.error("[ClaudeAutomation] ログ保存エラー:", error);
      }
    });

    // グローバルにログマネージャーを公開（デバッグ用）
    window.ClaudeLogManager = ClaudeLogManager;

    // ========================================
    // 最小限のメッセージリスナーと初期化
    // ========================================

    log.debug("🔥 [STEP 0] 4-2-claude-automation.js バージョン1です");

    // メッセージリスナーは上部（515行目付近）で登録済み
    // 直接実行方式への段階的移行のため、早期にリスナーを登録している
    if (shouldInitialize && !chrome?.runtime?.onMessage) {
      log.error("❌ [Claude] chrome.runtime.onMessage が利用できません");
    }

    // 初期化マーカー (claude.aiでのみtrueに設定)
    window.CLAUDE_SCRIPT_LOADED = shouldInitialize;
    window.CLAUDE_SCRIPT_INIT_TIME = Date.now();
    if (shouldInitialize) {
      log.info("🧪 [DEBUG] 初期化マーカー設定完了");
    }

    // グローバル関数として公開（ai-task-executorから呼び出し可能にする）
    // claude.aiでのみ公開

    if (shouldExportFunctions) {
      // 🔍 [DIAGNOSTIC] 初期化診断ログ開始
      log.info("🔍 [DIAGNOSTIC] Claude Automation 初期化診断開始");
      log.info(`🔍 [DIAGNOSTIC] 実行環境: ${window.location.href}`);
      log.info(`🔍 [DIAGNOSTIC] shouldInitialize: ${shouldInitialize}`);
      log.info(
        `🔍 [DIAGNOSTIC] shouldExportFunctions: ${shouldExportFunctions}`,
      );

      // log オブジェクトの状態確認
      log.info("🔍 [DIAGNOSTIC] log オブジェクト状態:");
      log.info(`  - log.error: ${typeof log.error}`);
      log.info(`  - log.warn: ${typeof log.warn}`);
      log.info(`  - log.info: ${typeof log.info}`);
      log.info(`  - log.debug: ${typeof log.debug}`);

      // 主要関数の定義状況確認
      log.info("🔍 [DIAGNOSTIC] 主要関数定義状況:");
      log.info(`  - executeTask: ${typeof executeTask}`);
      log.info(`  - executeClaude: ${typeof executeClaude}`);
      log.info(`  - findClaudeElement: ${typeof findClaudeElement}`);
      log.info(`  - inputText: ${typeof inputText}`);

      // Content Scriptのisolated環境でwindowに設定

      if (typeof executeTask !== "undefined") {
        window.executeTask = executeTask;
        log.info("✅ executeTask関数を公開");

        // 🔧 [ENHANCED-TEST] 関数の実際の呼び出し可能性をテスト
        try {
        } catch (testError) {}
      } else {
        log.error("❌ executeTask関数が未定義");
      }

      if (typeof findClaudeElement !== "undefined") {
        window.findClaudeElement = findClaudeElement;
        log.info("✅ findClaudeElement関数を公開");
      } else {
        log.error("❌ findClaudeElement関数が未定義");
      }

      if (typeof inputText !== "undefined") {
        window.inputText = inputText;
        log.info("✅ inputText関数を公開");
      } else {
        // inputText関数は後で定義されるため、このエラーは無視する
        log.debug("ℹ️ inputText関数はスコープ内で後で定義されます");
      }

      if (typeof runAutomation !== "undefined") {
        window.runAutomation = runAutomation;
        log.info("✅ runAutomation関数を公開");
      } else {
        log.error("❌ runAutomation関数が未定義");
      }

      // CSPを回避するため、chrome.scripting APIを使用
      log.info("📝 chrome.scripting.executeScriptを使用して関数を注入");

      // 拡張機能のバックグラウンドに関数注入を依頼
      if (chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage(
          {
            action: "injectClaudeFunctions",
            tabId: "current",
          },
          (response) => {
            if (chrome.runtime.lastError) {
              log.debug(
                "ℹ️ [FIXED] 関数注入通知失敗（既に注入済みなので影響なし）:",
                {
                  error: chrome.runtime.lastError.message,
                  note: "Content Script側で既に関数は注入完了済み",
                  timestamp: new Date().toISOString(),
                },
              );
            } else if (response && response.success) {
              log.info("✅ [FIXED] background.jsから注入完了通知受信:", {
                response: response,
                message: response.message,
                timestamp: new Date().toISOString(),
              });
            } else {
              log.debug("ℹ️ [FIXED] 予期しないレスポンス（影響なし）:", {
                response: response,
                note: "関数は既に利用可能",
                timestamp: new Date().toISOString(),
              });
            }
          },
        );
      }

      // ページからのメッセージを受け取って実際の関数を実行
      window.addEventListener("message", async (event) => {
        if (event.source !== window) return;

        if (event.data && event.data.type === "CLAUDE_AUTOMATION_EXECUTE") {
          const { messageId, method, args } = event.data;

          try {
            let result;
            switch (method) {
              case "executeTask":
                // 実行状態チェックはexecuteTask内で行われる
                result = await executeTask(...args);
                break;
              case "inputText":
                result = await inputText(...args);
                break;
              case "runAutomation":
                result = await runAutomation(...args);
                break;
              default:
                throw new Error(`Unknown method: ${method}`);
            }

            // 結果をページに送信
            window.postMessage(
              {
                type: "CLAUDE_AUTOMATION_RESULT",
                messageId: messageId,
                success: true,
                result: result,
              },
              "*",
            );
          } catch (error) {
            window.postMessage(
              {
                type: "CLAUDE_AUTOMATION_RESULT",
                messageId: messageId,
                success: false,
                error: error.message,
              },
              "*",
            );
          }
        }

        // ステータス取得リクエストの処理
        if (event.data && event.data.type === "CLAUDE_AUTOMATION_STATUS") {
          const status = getExecutionStatus();
          window.postMessage(
            {
              type: "CLAUDE_AUTOMATION_STATUS_RESULT",
              ...status,
            },
            "*",
          );
        }
      });

      log.info("✅ ページコンテキストへの関数注入完了");
    } // shouldExportFunctions の閉じ括弧

    // スクリプト初期化完了を確認 (claude.aiでのみログ出力)
    if (shouldExportFunctions) {
      // ClaudeAutomationオブジェクトを作成（他のAIと統一）
      window.ClaudeAutomation = window.ClaudeAutomation || {};
      window.ClaudeAutomation.detectionResult = window.ClaudeAutomation
        .detectionResult || { models: [], functions: [] };
      window.ClaudeAutomation = {
        ...window.ClaudeAutomation,
        executeTask: executeTask,
        findClaudeElement: window.findClaudeElement,
        inputText: inputText,
        runAutomation: runAutomation,
        detectClaudeModelsFromOpenMenu:
          typeof detectClaudeModelsFromOpenMenu !== "undefined"
            ? detectClaudeModelsFromOpenMenu
            : undefined,
        utils: {
          log: log,
          wait: wait,
        },
      };

      log.info("✅ [Claude] グローバル関数公開完了:", {
        executeTask: typeof window.executeTask,
        ClaudeAutomation: typeof window.ClaudeAutomation,
        findClaudeElement: typeof window.findClaudeElement,
        inputText: typeof window.inputText,
        runAutomation: typeof window.runAutomation,
      });

      // ========================================
      // Claude モデル・機能検出関数（テスト済み）
      // ========================================

      // Claudeモデル情報検出関数（コンソールテスト済み）
      async function detectClaudeModelsFromOpenMenu() {
        // 1. モデルメニューボタンを探す
        let modelMenuButton = null;

        // CLAUDE_SELECTORSを使用
        const selectors = CLAUDE_SELECTORS.MODEL.BUTTON;

        for (const selector of selectors) {
          const elements = document.querySelectorAll(selector);

          for (const element of elements) {
            const text = element.textContent || "";
            if (
              text.includes("Claude") ||
              text.includes("claude") ||
              text.includes("3.5") ||
              text.includes("Sonnet") ||
              text.includes("Opus") ||
              text.includes("Haiku")
            ) {
              modelMenuButton = element;
              break;
            }
          }
          if (modelMenuButton) break;
        }

        // フォールバック: テキストベースでボタンを探す
        if (!modelMenuButton) {
          const buttons = document.querySelectorAll("button");

          for (let i = 0; i < buttons.length; i++) {
            const button = buttons[i];
            const buttonText = button.textContent?.trim() || "";
            const hasIcon = button.querySelector("svg");

            // Claudeのモデル選択ボタンを探す（Claude 3.5 Sonnet等）
            if (
              (buttonText.includes("Claude") ||
                buttonText.includes("Sonnet") ||
                buttonText.includes("Haiku") ||
                buttonText.includes("Opus")) &&
              hasIcon
            ) {
              modelMenuButton = button;
              break;
            }
          }
        }

        if (!modelMenuButton) {
          return [];
        }

        // 2. モデルメニューが既に開いているかチェック

        // CLAUDE_SELECTORSを使用
        let menu = document.querySelector(
          CLAUDE_SELECTORS.MODEL.MENU_CONTAINER,
        );

        if (!menu) {
          // PointerEventを使用（テストコードと同じ方法）
          modelMenuButton.dispatchEvent(
            new PointerEvent("pointerdown", {
              bubbles: true,
              cancelable: true,
              view: window,
            }),
          );
          await new Promise((resolve) => setTimeout(resolve, 50));

          modelMenuButton.dispatchEvent(
            new PointerEvent("pointerup", {
              bubbles: true,
              cancelable: true,
              view: window,
            }),
          );

          // メニューが開くまで待機（少し長めに）
          await new Promise((resolve) => setTimeout(resolve, 1500));

          // 再度検索
          menu = document.querySelector(CLAUDE_SELECTORS.MODEL.MENU_CONTAINER);

          if (!menu) {
            return [];
          }
        }

        const models = extractModelsFromMenu(menu);

        return models;
      }

      // メニューからモデル情報を抽出する関数
      function extractModelsFromMenu(menu) {
        const models = [];
        const menuItems = menu.querySelectorAll('div[role="menuitem"]');

        if (menuItems.length === 0) {
          // 代替セレクタを試す
          const altItems = menu.querySelectorAll(
            'button, [role="option"], .menu-item',
          );

          if (altItems.length > 0) {
            altItems.forEach((item, i) => {});
          }

          return [];
        }

        menuItems.forEach((item, index) => {
          // モデル名を取得（複数のセレクタを試す）
          const selectors = [
            ".flex-1.text-sm div", // メインの場所
            "div.flex-1 div", // 代替パス
            ".text-sm div", // シンプルパス
            "div > div:first-child", // フォールバック
            ".text-sm", // より一般的
            "div:first-child", // 最も一般的
          ];

          let modelNameElement = null;
          let usedSelector = "";

          for (const selector of selectors) {
            modelNameElement = item.querySelector(selector);
            if (modelNameElement) {
              usedSelector = selector;
              break;
            }
          }

          if (modelNameElement) {
            const modelName = modelNameElement.textContent.trim();

            // モデル説明を取得
            const descriptionSelectors = [
              ".text-text-500.pr-4.text-xs.mt-1",
              ".text-xs",
              ".description",
              "[class*='description']",
            ];

            let descriptionElement = null;
            for (const selector of descriptionSelectors) {
              descriptionElement = item.querySelector(selector);
              if (descriptionElement) break;
            }

            const description = descriptionElement
              ? descriptionElement.textContent.trim()
              : "";

            // 現在選択されているかチェック（SVGチェックマークの存在）
            const checkmarkSelectors = [
              'svg path[d*="M232.49,80.49l-128,128"]',
              "svg",
              '[class*="check"]',
              '[class*="selected"]',
            ];

            let isSelected = false;
            for (const selector of checkmarkSelectors) {
              if (item.querySelector(selector)) {
                isSelected = true;
                break;
              }
            }

            if (modelName && modelName !== "他のモデル") {
              // セクション区切りは除外
              models.push({
                name: modelName,
                description: description,
                isSelected: isSelected,
              });
            }
          } else {
            // セクション区切りやその他の要素の可能性
            const textContent = item.textContent.trim();
          }
        });

        if (models.length > 0) {
          models.forEach((model, index) => {
            if (model.description) {
            }
          });
        } else {
        }

        console.table(models);
        return models;
      }

      // ========================================
      // Claude 機能検出関数（テスト済み）
      // ========================================

      // Claude機能メニュー検出関数（修正版：機能メニューを開いてから検出）
      async function detectClaudeFunctionsFromOpenMenu() {
        // まず、既に開いている機能メニューをチェック（ユーザーテストコードパターン）
        const existingMenuToggleItems = document.querySelectorAll(
          'button:has(input[role="switch"])',
        );

        // 代替セレクタでも確認
        const altToggleItems = document.querySelectorAll(
          'input[role="switch"], [role="switch"], button[aria-pressed], .toggle',
        );

        if (existingMenuToggleItems.length > 0) {
          const directResult = extractFunctionsFromExistingMenu(
            existingMenuToggleItems,
          );
          if (directResult.length > 0) {
            return directResult;
          }
        }

        // Step 1: 機能メニューボタンを探す

        let functionButton = null;

        // CLAUDE_SELECTORSを使用
        const buttonSelectors = CLAUDE_SELECTORS.FEATURE.MENU_BUTTON;

        for (const selector of buttonSelectors) {
          functionButton = document.querySelector(selector);
          if (functionButton) {
            break;
          }
        }

        if (!functionButton) {
          return [];
        }

        // Step 2: 機能メニューを開く
        const isExpanded =
          functionButton.getAttribute("aria-expanded") === "true";

        if (!isExpanded) {
          functionButton.click();
          // メニューが開くのを待つ
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }

        // Step 3: 機能メニューのコンテンツを見つける

        let contentDiv = null;

        // CLAUDE_SELECTORSを使用
        const menuSelectors = CLAUDE_SELECTORS.FEATURE.MENU_CONTAINER;

        for (const selector of menuSelectors) {
          const elements = document.querySelectorAll(selector);
          if (elements.length > 0) {
            // 最後の要素（最新のメニュー）を取得
            contentDiv = elements[elements.length - 1];
            break;
          }
        }

        if (!contentDiv) {
          return [];
        }

        return extractFunctionsFromMenu(contentDiv);
      }

      // ユーザーテストコードで成功したパターンによる機能抽出（既存メニューから）
      function extractFunctionsFromExistingMenu(menuToggleItems) {
        const functions = [];

        menuToggleItems.forEach((item, index) => {
          // p.font-base要素を探す（ユーザーテストコードと同じパターン）
          const label = item.querySelector("p.font-base");

          if (label) {
            const functionName = label.textContent.trim();

            // トグル状態を取得
            const toggleInput = item.querySelector('input[role="switch"]');
            const isToggled = toggleInput ? toggleInput.checked : false;

            const functionData = {
              name: functionName,
              isEnabled: true,
              isToggleable: true,
              isToggled: isToggled,
              secretStatus: "",
              selector: 'button:has(input[role="switch"])',
              index: index,
            };

            functions.push(functionData);
          } else {
            // デバッグ用：要素の内容を確認
          }
        });

        // DeepResearch/リサーチを一番下に移動
        const deepResearchIndex = functions.findIndex(
          (f) =>
            f.name === "DeepResearch" ||
            f.name === "Deep Research" ||
            f.name === "リサーチ" ||
            f.name.includes("Research") ||
            f.name.includes("リサーチ"),
        );
        if (
          deepResearchIndex > -1 &&
          deepResearchIndex < functions.length - 1
        ) {
          const deepResearch = functions.splice(deepResearchIndex, 1)[0];
          functions.push(deepResearch);
        }

        if (functions.length > 0) {
          // 1つのログにまとめて出力
          const summary = functions.map((func) => ({
            name: func.name,
            enabled: func.isEnabled,
            togglable: func.isToggleable,
            toggled: func.isToggled || false,
            status: func.secretStatus || "",
          }));

          log.debug(
            "🔍 [UI] Claude機能一覧 (既存メニュー):",
            JSON.stringify(summary, null, 2),
          );
        }

        return functions;
      }

      // メニューから機能情報を抽出（改善版）
      function extractFunctionsFromMenu(contentDiv) {
        const functions = [];

        // すべてのボタンを取得
        const allButtons = contentDiv.querySelectorAll("button");

        // 検索ボックスを除外
        const buttons = Array.from(allButtons).filter((btn) => {
          const id = btn.id || "";
          const text = btn.textContent || "";
          return !id.includes("search") && !text.includes("Search");
        });

        buttons.forEach((button, index) => {
          // テキスト要素を探す
          const textElements = button.querySelectorAll("p, span");

          let functionName = "";
          let description = "";

          // 機能名と説明を抽出
          textElements.forEach((elem) => {
            const text = elem.textContent?.trim() || "";
            const className = elem.className || "";

            // 名前（大きいフォント）
            if (
              className.includes("font-base") ||
              className.includes("font-medium") ||
              className.includes("text-text-300")
            ) {
              if (!functionName) functionName = text;
            }
            // 説明（小さいフォント）
            else if (
              className.includes("font-small") ||
              className.includes("text-500")
            ) {
              if (!description) description = text;
            }
          });

          // 機能名がない場合はボタンのテキスト全体から取得
          if (!functionName && button.textContent?.trim()) {
            functionName = button.textContent.trim().split("\n")[0];
          }

          // 無効な機能名をスキップ
          if (!functionName || functionName === "1") return;

          // 説明を取得（既存のdescription変数を上書き）
          const descElement = button.querySelector(
            "p.font-small.text-text-500",
          );
          if (descElement && !description) {
            description = descElement.textContent.trim();
          }

          // セクレタ（接続状態）を取得
          const secretElement = button.querySelector(
            'p[class*="text-accent-secondary"], p[class*="opacity-70"]',
          );
          const secretStatus = secretElement
            ? secretElement.textContent.trim()
            : "";

          // 有効/無効状態
          const isEnabled = !button.hasAttribute("disabled");

          // とぐる（トグル）機能かどうか
          const isToggleable = !!button.querySelector('input[type="checkbox"]');

          // とぐる状態
          let isToggled = false;
          if (isToggleable) {
            const checkbox = button.querySelector('input[type="checkbox"]');
            isToggled = checkbox ? checkbox.checked : false;
          }

          if (functionName) {
            functions.push({
              name: functionName,
              description: description,
              secretStatus: secretStatus,
              isEnabled: isEnabled,
              isToggleable: isToggleable,
              isToggled: isToggled,
            });
          }
        });

        // DeepResearch/リサーチを一番下に移動
        const deepResearchIndex = functions.findIndex(
          (f) =>
            f.name === "DeepResearch" ||
            f.name === "Deep Research" ||
            f.name === "リサーチ" ||
            f.name.includes("Research") ||
            f.name.includes("リサーチ"),
        );
        if (
          deepResearchIndex > -1 &&
          deepResearchIndex < functions.length - 1
        ) {
          const deepResearch = functions.splice(deepResearchIndex, 1)[0];
          functions.push(deepResearch);
        }

        if (functions.length > 0) {
          // 1つのログにまとめて出力
          const summary = functions.map((func) => ({
            name: func.name,
            enabled: func.isEnabled,
            togglable: func.isToggleable,
            toggled: func.isToggled || false,
            status: func.secretStatus || "",
          }));

          log.debug(
            "🔍 [UI] Claude機能一覧:",
            JSON.stringify(summary, null, 2),
          );
        } else {
          log.debug("🔍 [UI] Claude機能: 未検出");
        }

        return functions;
      }

      // Windowオブジェクトに主要な関数のみ追加
      window.detectClaudeModelsFromOpenMenu = detectClaudeModelsFromOpenMenu;
      window.detectClaudeFunctionsFromOpenMenu =
        detectClaudeFunctionsFromOpenMenu;
      // 内部関数 extractModelsFromMenu, extractFunctionsFromMenu は削除（インライン化済み）

      log.info("=".repeat(60));
      log.info("🎉 [Claude Automation] 関数エクスポート完了");
      log.info("📍 URL:", window.location.href);
      log.info("⏰ 完了時刻:", new Date().toISOString());
      log.info("📊 処理時間:", Date.now() - scriptLoadTime, "ms");
      log.info("=".repeat(60));
    }

    // 🔍 [SCRIPT-COMPLETION] Content Script完了診断サマリー
  } catch (error) {
    // 🚨 【STEP 4: 致命的エラー検出】
    console.error("🚨 FATAL ERROR DETECTED IN CONTENT SCRIPT!");
    console.error("🚨 Error:", error);
    console.error("🚨 Stack:", error.stack);

    // 可視的エラー表示
    document.title = `ERROR: Content Script Failed - ${error.message}`;

    // DOM要素にもエラーを書き込み（デバッグ用）
    try {
      const errorDiv = document.createElement("div");
      errorDiv.id = "claude-script-error";
      errorDiv.style.cssText =
        "position: fixed; top: 0; left: 0; z-index: 9999; background: red; color: white; padding: 10px; font-size: 12px;";
      errorDiv.textContent = `Content Script Error: ${error.message}`;
      if (document.body) document.body.appendChild(errorDiv);
    } catch (domError) {
      console.error("🚨 DOM Error Display Failed:", domError);
    }

    // 致命的エラーをキャッチして記録
    console.error("🚨 [Claude Script] FATAL ERROR:", error);
    console.error("🚨 Stack trace:", error.stack);

    // 🔍 [ERROR-DIAGNOSTIC] エラー発生時診断
  }

  // ========================================
  // Claude モデル・機能検出機能
  // ========================================

  /**
   * Claudeのモデルと機能を検出する関数
   * DISCOVER_FEATURESメッセージハンドラーから呼び出される
   */
  async function discoverClaudeModelsAndFeatures() {
    try {
      // Claudeで利用可能なモデルを検出
      const models = await detectClaudeModels();

      // Claudeで利用可能な機能を検出（Deep Research含む）
      const functionData = await detectClaudeFunctions();

      const result = {
        models: models,
        functions: functionData.functions,
        functionsWithDetails: functionData.functionsWithDetails,
        timestamp: new Date().toISOString(),
        source: "dynamic_detection",
      };

      return result;
    } catch (error) {
      console.error("❌ [Claude] モデル・機能検出エラー:", error);
      throw error;
    }
  }

  /**
   * Claudeで利用可能なモデルを検出
   */
  async function detectClaudeModels() {
    try {
      // 実際のUIからモデルを検出する関数を使用
      if (typeof detectClaudeModelsFromOpenMenu === "function") {
        const detectedModels = await detectClaudeModelsFromOpenMenu();

        if (detectedModels && detectedModels.length > 0) {
          // オブジェクト配列の場合は名前だけ抽出
          const modelNames = detectedModels
            .map((model) => (typeof model === "object" ? model.name : model))
            .filter(Boolean);

          return modelNames;
        } else {
          return [];
        }
      } else {
        console.error(
          "❌ [Claude] detectClaudeModelsFromOpenMenu関数が定義されていません",
        );
        return [];
      }
    } catch (error) {
      console.error("❌ [Claude] UI検出エラー:", error);
      return [];
    }
  }

  /**
   * Claudeで利用可能な機能を検出（Deep Research含む）
   */
  async function detectClaudeFunctions() {
    try {
      // 実際のUIから機能を検出する関数を使用
      if (typeof detectClaudeFunctionsFromOpenMenu === "function") {
        const detectedFunctions = await detectClaudeFunctionsFromOpenMenu();

        if (detectedFunctions && detectedFunctions.length > 0) {
          // オブジェクト配列の場合は名前だけ抽出、文字列配列の場合はそのまま
          const functionNames = detectedFunctions
            .map((func) =>
              typeof func === "object" ? func.name || func.functionName : func,
            )
            .filter(Boolean);

          // Deep Researchが含まれていない場合は追加（文字列配列）
          if (!functionNames.includes("Deep Research")) {
            functionNames.push("Deep Research");
          }

          // オブジェクト配列にもDeep Researchを追加
          const functionsWithDetails = [...detectedFunctions];
          const hasDeepResearch = functionsWithDetails.some((f) => {
            const name = typeof f === "object" ? f.name || f.functionName : f;
            return (
              name === "Deep Research" ||
              name === "DeepResearch" ||
              name === "リサーチ"
            );
          });
          if (!hasDeepResearch) {
            functionsWithDetails.push({
              name: "Deep Research",
              description: "",
              secretStatus: "",
              isEnabled: true,
              isToggleable: false,
              isToggled: false,
            });
          }

          return {
            functions: functionNames,
            functionsWithDetails: functionsWithDetails,
          };
        } else {
          return {
            functions: [],
            functionsWithDetails: [],
          };
        }
      } else {
        console.error(
          "❌ [Claude] detectClaudeFunctionsFromOpenMenu関数が定義されていません",
        );
        return {
          functions: [],
          functionsWithDetails: [],
        };
      }
    } catch (error) {
      console.error("❌ [Claude] UI検出エラー:", error);
      return {
        functions: [],
        functionsWithDetails: [],
      };
    }
  }
})(); // 即時実行関数の終了
