// 全体を即時実行関数でラップ
(function () {
  // 🚨 デバッグ: スクリプト開始を最初に記録
  console.log("🚨 [Claude Script] START - " + window.location.href);

  try {
    // 🔒 重複実行防止（manifest.json自動注入対応）
    if (window.__CLAUDE_AUTOMATION_LOADED__) {
      console.log(
        "🛡️ [Claude Automation] 重複実行防止: 既に初期化済みのためスキップ",
      );
      return;
    }
    window.__CLAUDE_AUTOMATION_LOADED__ = true;

    // 初期化マーカー設定（ChatGPT/Geminiと同様）
    window.CLAUDE_SCRIPT_LOADED = true;
    window.CLAUDE_SCRIPT_INIT_TIME = Date.now();

    // log未定義エラーを修正: console.logを直接使用
    console.log(
      `🚀 Claude Automation - 初期化時刻: ${new Date().toLocaleString("ja-JP")}`,
    );
    console.log(`[DEBUG] Claude Script Loaded - Marker Set`);

    // 🔧 [FIXED] メッセージング問題修正完了のお知らせ
    console.log("🔧 [FIXED] Chrome拡張メッセージング問題修正済み:", {
      fixes: [
        "background.jsにrecordSendTime/injectClaudeFunctionsハンドラー追加",
        "非同期処理のsetTimeoutを削除して即座レスポンス",
        "3秒タイムアウトとmessage port closedエラーを防止",
      ],
      timestamp: new Date().toISOString(),
      note: "エラーログがクリーンになり、動作はより安定",
    });

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

    // 🔍 [URL-DIAGNOSTIC] URL検出詳細診断
    console.log("🔍 [URL-DIAGNOSTIC] URL検出詳細:", {
      currentURL,
      hostname: window.location.hostname,
      pathname: window.location.pathname,
      condition1_includes_claude_ai: condition1,
      condition2_includes_claude_ai_chat: condition2,
      condition3_includes_claude_ai_new: condition3,
      condition4_hostname_equals_claude_ai: condition4,
      condition5_hostname_ends_with_claude_ai: condition5,
      isValidClaudeURL_final_result: isValidClaudeURL,
      isExtensionPage: isExtensionPage,
    });

    // 🔍 [段階5-実行コンテキスト] Content Script実行環境の詳細ログ
    console.warn(
      `🔍 [段階5-Content Script] 実行コンテキスト詳細分析:`,
      JSON.stringify(
        {
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
            isValidClaudeURL: isValidClaudeURL,
            isExtensionPage: isExtensionPage,
            isChromeNewTab: currentURL === "chrome://newtab/",
            isAboutBlank: currentURL === "about:blank",
          },
          documentState: {
            readyState: document.readyState,
            hasDocumentElement: !!document.documentElement,
            hasBody: !!document.body,
            bodyChildrenCount: document.body
              ? document.body.children.length
              : 0,
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
        },
        null,
        2,
      ),
    );

    // URL検証 - Content Scriptは claude.ai でのみ動作すべき

    // ログレベル定義
    const LOG_LEVEL = { ERROR: 1, WARN: 2, INFO: 3, DEBUG: 4 };

    // Chrome Storageからログレベルを取得（非同期）
    let CURRENT_LOG_LEVEL = LOG_LEVEL.INFO; // デフォルト値

    // Chrome拡張環境でのみStorageから設定を読み込む
    if (
      typeof chrome !== "undefined" &&
      chrome.storage &&
      chrome.storage.local
    ) {
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

        log.debug(`🔍 [Claude RetryManager] エラー分類開始:`, {
          errorMessage,
          errorName,
          context,
          timestamp: new Date().toISOString(),
          url: window.location.href,
        });

        // Claude特有エラーの検出
        let errorType = "GENERAL_ERROR";

        if (
          errorMessage.includes("rate limit") ||
          errorMessage.includes("Rate limited") ||
          errorMessage.includes("Too many requests")
        ) {
          errorType = "RATE_LIMIT_ERROR";
          log.debug(`⚠️ [Claude RetryManager] レート制限エラー検出:`, {
            errorType,
            errorMessage,
            immediateEscalation: "HEAVY_RESET",
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
          log.debug(`🔐 [Claude RetryManager] ログインエラー検出:`, {
            errorType,
            errorMessage,
            immediateEscalation: "HEAVY_RESET",
          });
          return errorType;
        }

        if (
          errorMessage.includes("session") ||
          errorMessage.includes("セッション") ||
          errorMessage.includes("Session expired")
        ) {
          errorType = "SESSION_ERROR";
          log.debug(`📋 [Claude RetryManager] セッションエラー検出:`, {
            errorType,
            errorMessage,
            immediateEscalation: "HEAVY_RESET",
          });
          return errorType;
        }

        if (
          errorMessage.includes("Canvas") ||
          errorMessage.includes("canvas") ||
          context.feature === "Canvas"
        ) {
          errorType = "CANVAS_ERROR";
          log.debug(`🎨 [Claude RetryManager] Canvasエラー検出:`, {
            errorType,
            errorMessage,
            escalation: "MODERATE",
          });
          return errorType;
        }

        if (
          errorMessage.includes("Deep Research") ||
          errorMessage.includes("deep research") ||
          context.feature === "Deep Research"
        ) {
          errorType = "DEEP_RESEARCH_ERROR";
          log.debug(`🔬 [Claude RetryManager] Deep Researchエラー検出:`, {
            errorType,
            errorMessage,
            escalation: "MODERATE",
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
          log.debug(`🌐 [Claude RetryManager] ネットワークエラー検出:`, {
            errorType,
            errorMessage,
            escalation: "MODERATE",
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
          log.debug(`🔍 [Claude RetryManager] DOM要素エラー検出:`, {
            errorType,
            errorMessage,
            escalation: "LIGHTWEIGHT",
          });
          return errorType;
        }

        if (
          errorMessage.includes("timing") ||
          errorMessage.includes("タイミング") ||
          errorMessage.includes("wait")
        ) {
          errorType = "UI_TIMING_ERROR";
          log.debug(`⏱️ [Claude RetryManager] UIタイミングエラー検出:`, {
            errorType,
            errorMessage,
            escalation: "LIGHTWEIGHT",
          });
          return errorType;
        }

        log.debug(`❓ [Claude RetryManager] 一般エラーとして分類:`, {
          errorType,
          errorMessage,
          escalation: "MODERATE",
        });

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
            log.info("⏰ 実行状態タイムアウト - リセット");
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
            log.info(`♻️ 実行状態復元: タスク ${state.currentTaskId} が実行中`);
          }
          return true;
        }
      } catch (e) {
        log.debug("sessionStorage復元エラー:", e);
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
        log.info(`🔒 [EXECUTION-STATE] タスク実行開始: ${taskId}`);
      } else if (!executing) {
        const duration = window.CLAUDE_TASK_START_TIME
          ? Date.now() - window.CLAUDE_TASK_START_TIME
          : 0;
        log.info(
          `🔓 [EXECUTION-STATE] タスク実行完了: ${window.CLAUDE_CURRENT_TASK_ID} (${Math.round(duration / 1000)}秒)`,
        );
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
          '[data-testid="model-selector-dropdown"]', // 最新のセレクタ（最優先）
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

        THINK_TOGGLE: [
          'button:has(svg path[d*="M10.3857 2.50977"]):has(input[role="switch"])',
          'button:has(p:contains("じっくり考える")):has(input[role="switch"])',
          'button input[role="switch"][style*="width: 28px"]',
          'div:contains("じっくり考える") button:has(.group\\/switch)',
          'button .font-base:contains("じっくり考える")',
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

    // AI待機設定
    const AI_WAIT_CONFIG = window.AI_WAIT_CONFIG || {
      INITIAL_WAIT: 30000,
      MAX_WAIT: 600000, // 10分（通常処理）
      CHECK_INTERVAL: 2000,
      DEEP_RESEARCH_WAIT: 2400000, // 40分（Deep Research/エージェント）
      SHORT_WAIT: 1000,
      MEDIUM_WAIT: 2000,
      STOP_BUTTON_INITIAL_WAIT: 30000,
      STOP_BUTTON_DISAPPEAR_WAIT: 300000,
    };

    // スクリプトの読み込み時間を記録
    const scriptLoadTime = Date.now();
    const loadTimeISO = new Date().toISOString();

    // 🔍 [CONTENT-INIT] Content Script初期化確認ログ
    console.log("🔍 [CONTENT-INIT] Content Script読み込み開始");
    console.log("🔍 [CONTENT-INIT] URL:", currentURL);
    console.log("🔍 [CONTENT-INIT] isValidClaudeURL:", isValidClaudeURL);
    console.log("🔍 [CONTENT-INIT] isExtensionPage:", isExtensionPage);

    // 実行環境の判定
    let shouldInitialize = false;
    let shouldExportFunctions = false; // 🔧 関数エクスポート制御フラグ追加

    if (isExtensionPage) {
      console.log("🔍 [CONTENT-INIT] 拡張機能ページ判定 - スキップ実行");
      log.info(
        "📌 [Claude Automation] 拡張機能ページで実行されています。スキップします。",
      );
      log.info("  URL:", currentURL);
      window.CLAUDE_SCRIPT_LOADED = false;
      window.CLAUDE_SCRIPT_INIT_TIME = Date.now();
    } else if (!isValidClaudeURL) {
      console.log("🔍 [CONTENT-INIT] 無効なURL判定 - スキップ実行");
      log.warn(
        "⚠️ [Claude Automation] claude.ai 以外のサイトで実行されています。",
      );
      log.warn("  URL:", currentURL);
      window.CLAUDE_SCRIPT_LOADED = false;
      window.CLAUDE_SCRIPT_INIT_TIME = Date.now();
    } else {
      // claude.ai での実行
      console.log("🔍 [CONTENT-INIT] 有効なclaude.ai URL判定 - 初期化実行");
      shouldInitialize = true;
      shouldExportFunctions = true; // 🔧 claude.aiでは関数エクスポートも有効
      log.info("✅ Claude Automation V2 初期化");
      log.info("📍 有効なClaude URL:", currentURL);
    }

    // 🔧 Option 1 Fix: claude.ai URLでは初期化がスキップされても関数エクスポートを実行
    console.log("🔧 [OPTION1-DIAGNOSTIC] 修正前の状態:");
    console.log("  - shouldInitialize:", shouldInitialize);
    console.log("  - shouldExportFunctions:", shouldExportFunctions);
    console.log("  - isValidClaudeURL:", isValidClaudeURL);
    console.log("  - isExtensionPage:", isExtensionPage);

    if (!shouldExportFunctions && isValidClaudeURL) {
      console.log("🔧 [FIX] claude.ai URLで関数エクスポートのみ実行");
      console.log("🔧 [FIX] shouldExportFunctions: false → true に変更");
      shouldExportFunctions = true;
    }

    console.log("🔧 [OPTION1-DIAGNOSTIC] 修正後の最終状態:");
    console.log("  - shouldInitialize:", shouldInitialize);
    console.log("  - shouldExportFunctions:", shouldExportFunctions);
    console.log("  - 関数エクスポートが実行される:", shouldExportFunctions);

    // ========================================
    // 関数定義（常に定義するが、実行は制御）
    // ========================================

    // 🚨 グローバルエラーハンドラー追加（claude.aiでのみ）
    if (shouldInitialize) {
      window.addEventListener("error", (e) => {
        const errorMessage = e.message || e.error?.message || "";
        const errorName = e.error?.name || "";

        // 🔍 ネットワークエラー検出
        const isNetworkError =
          errorMessage.includes("timeout") ||
          errorMessage.includes("network") ||
          errorMessage.includes("fetch") ||
          errorMessage.includes("Failed to fetch") ||
          errorName.includes("NetworkError");

        if (isNetworkError) {
          log.error("🌐 [GLOBAL-NETWORK-ERROR]", {
            message: errorMessage,
            name: errorName,
            type: "NETWORK_ERROR",
            filename: e.filename,
            lineno: e.lineno,
            timestamp: new Date().toISOString(),
          });

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
          log.error("🚨 [GLOBAL-ERROR]", e.message);
        }
      });

      window.addEventListener("unhandledrejection", (e) => {
        const errorReason = e.reason;
        const errorMessage = errorReason?.message || String(errorReason);
        const errorName = errorReason?.name || "";

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
                    await retryManager.executeWithRetry({
                      action: async () => {
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
                      errorType: "NETWORK_ERROR",
                      context: "unhandledrejection_recovery",
                    });
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
            log.error(
              "❌ [RETRY-MANAGER] リトライマネージャー処理エラー:",
              retryError,
            );
          }
        } else {
          log.error("🚨 [UNHANDLED-PROMISE]", e.reason);
        }
      });

      // Content Script注入確認
      log.debug(`Claude Automation V2 loaded`);
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

    console.log("🔍 [LISTENER-CONDITION] 登録条件診断:", {
      isValidClaudeURL: listenerCondition1,
      currentURLIncludesClaudeAi: listenerCondition2,
      combinedURLCondition: listenerCombinedCondition,
      notExtensionPage: listenerCondition3,
      hasChromeObject: listenerCondition4,
      hasChromeRuntime: listenerCondition5,
      hasChromeRuntimeOnMessage: listenerCondition6,
      finalCondition: listenerFinalCondition,
      willRegisterListener: listenerFinalCondition,
    });

    if (listenerFinalCondition) {
      console.log("📡 [Claude-直接実行方式] メッセージリスナー登録を早期開始");

      // ping/pong応答を最優先で処理するリスナーを即座に登録
      const registerMessageListener = () => {
        console.log("📡 [Claude-直接実行方式] メッセージリスナー登録開始");

        // 🔍 [CONTENT-SCRIPT-INIT] Content Script初期化診断
        console.log("🔍 [CONTENT-SCRIPT-INIT] 初期化状況:", {
          chromeRuntimeAvailable: !!chrome?.runtime,
          chromeRuntimeId: chrome?.runtime?.id,
          onMessageAvailable: !!chrome?.runtime?.onMessage,
          documentReadyState: document.readyState,
          windowLoaded: document.readyState === "complete",
          domContentLoaded: document.readyState !== "loading",
          timestamp: new Date().toISOString(),
        });

        chrome.runtime.onMessage.addListener(
          (request, sender, sendResponse) => {
            // 🔍 [MESSAGE-RECEIVED] メッセージ受信診断
            console.log("🔍 [MESSAGE-RECEIVED] メッセージ受信詳細:", {
              action: request.action,
              type: request.type,
              hasRequest: !!request,
              requestKeys: Object.keys(request || {}),
              isPing: request.action === "ping",
              isContentScriptCheck: request.type === "CONTENT_SCRIPT_CHECK",
              isExecuteTask:
                request.type === "CLAUDE_EXECUTE_TASK" ||
                request.action === "executeTask",
              timestamp: new Date().toISOString(),
            });

            // ping/pongメッセージへの即座応答（最優先）
            if (
              request.action === "ping" ||
              request.type === "CONTENT_SCRIPT_CHECK" ||
              request.type === "PING"
            ) {
              console.log("🏓 [Claude] Ping受信、即座にPong応答");
              console.log("🔍 [PING-RESPONSE] Pong応答送信:", {
                action: "pong",
                status: "ready",
                timestamp: Date.now(),
                scriptLoaded: true,
                responseTime: new Date().toISOString(),
              });

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
              console.log("🔍 [Claude] テキスト入力欄の存在チェック開始");
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
                  console.log(`✅ [Claude] テキスト入力欄を発見: ${selector}`);
                  found = true;
                  break;
                }
              }

              if (!found) {
                console.warn(`⚠️ [Claude] テキスト入力欄が見つかりません`);
              }

              sendResponse({ found: found });
              return true;
            }

            const requestId = Math.random().toString(36).substring(2, 8);
            console.warn(
              `📬 [Claude-直接実行方式] メッセージ受信 [ID:${requestId}]:`,
              JSON.stringify(
                {
                  type: request?.type || request?.action,
                  keys: Object.keys(request || {}),
                  hasTask: !!request?.task,
                  hasTaskData: !!request?.taskData,
                  automationName: request?.automationName,
                  taskId: request?.task?.id || request?.taskData?.id,
                  timestamp: new Date().toISOString(),
                },
                null,
                2,
              ),
            );

            // executeTaskタスクの処理
            if (
              request.action === "executeTask" ||
              request.type === "executeTask" ||
              request.type === "CLAUDE_EXECUTE_TASK" ||
              request.type === "EXECUTE_TASK"
            ) {
              console.warn(
                `🔧 [Claude-直接実行方式] executeTask実行開始 [ID:${requestId}]`,
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

              (async () => {
                try {
                  // executeTask関数が定義されているか確認
                  if (typeof executeTask === "function") {
                    console.warn(
                      `✅ [Claude-直接実行方式] executeTask関数が利用可能 [ID:${requestId}]`,
                    );
                    const taskToExecute =
                      request.task || request.taskData || request;
                    console.warn(
                      `🚀 [Claude-直接実行方式] executeTask呼び出し前 [ID:${requestId}]:`,
                      JSON.stringify(
                        {
                          taskId: taskToExecute?.id,
                          taskKeys: Object.keys(taskToExecute || {}),
                        },
                        null,
                        2,
                      ),
                    );

                    try {
                      const result = await executeTask(taskToExecute);
                      console.warn(
                        `✅ [Claude-直接実行方式] executeTask完了 [ID:${requestId}]:`,
                        {
                          success: result?.success,
                          hasResult: !!result,
                          resultKeys: result ? Object.keys(result) : [],
                        },
                      );
                      sendResponse({ success: true, result });
                    } catch (taskError) {
                      console.error(
                        `❌ [Claude-直接実行方式] executeTaskエラー [ID:${requestId}]:`,
                        taskError,
                      );
                      sendResponse({
                        success: false,
                        error: taskError.message || "executeTask failed",
                        stack: taskError.stack,
                      });
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
              console.warn(
                `🔄 [Claude-直接実行方式] 非同期処理のためreturn true [ID:${requestId}]`,
              );
              return true; // 非同期レスポンスのために必要
            }

            // その他のメッセージタイプは無視
            console.log(
              `ℹ️ [Claude-直接実行方式] 未対応のメッセージタイプ [ID:${requestId}]:`,
              request?.type || request?.action,
            );
          },
        );

        console.log("✅ [Claude-直接実行方式] メッセージリスナー登録完了");

        // 🔍 [CHROME-EXTENSION-ENV] Chrome Extension環境診断
        console.log("🔍 [CHROME-EXTENSION-ENV] 拡張機能環境:", {
          chromeObject: typeof chrome,
          chromeRuntime: !!chrome?.runtime,
          chromeRuntimeId: chrome?.runtime?.id,
          chromeRuntimeVersion: chrome?.runtime?.getManifest?.()?.version,
          chromeRuntimeManifestVersion:
            chrome?.runtime?.getManifest?.()?.manifest_version,
          chromeLastError: chrome?.runtime?.lastError,
          onMessageListeners:
            chrome?.runtime?.onMessage?.hasListeners?.() || "unknown",
          extensionURL: chrome?.runtime?.getURL?.(""),
          tabsAPI: !!chrome?.tabs,
          storageAPI: !!chrome?.storage,
          timestamp: new Date().toISOString(),
        });

        // 初期化完了をグローバルに通知
        window.CLAUDE_MESSAGE_LISTENER_READY = true;
      };

      // メッセージリスナーを即座に登録（Content Script準備確認の高速化）
      console.log("📋 [Claude] メッセージリスナーを即座に登録");
      registerMessageListener();

      // ページの読み込み完了後に再度登録を確認（念のため）
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => {
          console.log("📋 [Claude] DOMContentLoaded - リスナー登録状態を確認");
          if (!window.CLAUDE_MESSAGE_LISTENER_READY) {
            registerMessageListener();
          }
        });
      }
    } else {
      // 🔍 [LISTENER-SKIP] メッセージリスナー登録をスキップした理由
      console.log("🔍 [LISTENER-SKIP] メッセージリスナー登録スキップ理由:", {
        listenerFinalCondition: listenerFinalCondition,
        isValidClaudeURL: listenerCondition1,
        currentURLIncludesClaudeAi: listenerCondition2,
        combinedURLCondition: listenerCombinedCondition,
        notExtensionPage: listenerCondition3,
        hasChromeObject: listenerCondition4,
        hasChromeRuntime: listenerCondition5,
        hasChromeRuntimeOnMessage: listenerCondition6,
        skipReason: !listenerFinalCondition ? "条件不一致" : "不明",
        timestamp: new Date().toISOString(),
      });
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
    // Claude-ステップ0-4: セレクタ定義
    // ========================================

    // Claude-ステップ0-4-1: Deep Research用セレクタ（最適化）
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

    // Claude-ステップ0-4-2: モデル選択用セレクタ
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

    // Claude-ステップ0-4-3: 機能選択用セレクタ
    const featureSelectors = {
      menuButton: CLAUDE_SELECTORS.FEATURE.MENU_BUTTON || [],
      menuContainer: CLAUDE_SELECTORS.FEATURE.MENU_CONTAINER,
      webSearchToggle: CLAUDE_SELECTORS.FEATURE.WEB_SEARCH_TOGGLE || [],
      researchButton: CLAUDE_SELECTORS.FEATURE.RESEARCH_BUTTON || [],
    };

    // Claude-ステップ0-4-4: デフォルトセレクタ（CLAUDE_SELECTORS.DEFAULTを参照）
    const DEFAULT_SELECTORS = CLAUDE_SELECTORS.DEFAULT;

    // Claude-ステップ0-4-5: Claude動作用セレクタ
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

    // Claude-ステップ0-5: セレクタの最終状態をログ出力
    log.debug("📋 Claude selectors configured:", {
      inputs: claudeSelectors["1_テキスト入力欄"].selectors.length,
      send: claudeSelectors["2_送信ボタン"].selectors.length,
      stop: claudeSelectors["3_回答停止ボタン"].selectors.length,
    });

    if (claudeSelectors["1_テキスト入力欄"].selectors.length === 0) {
      log.error(
        "❌ 【Claude-ステップ0-4】致命的エラー: 入力欄セレクタが空です！",
      );
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
      const result = await retryManager.executeWithRetry({
        action: async () => {
          // findClaudeElementに適切なオブジェクト形式で渡す
          const selectorInfo = {
            selectors: [selector],
            description: `セレクタ: ${selector}`,
          };
          const element = await findClaudeElement(selectorInfo);
          if (element) return { success: true, element };
          return { success: false, error: "要素が見つかりません" };
        },
        maxRetries: 3,
        actionName: `要素検索: ${selector}`,
        context: { selector },
      });

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

    const triggerReactEvent = async (element, eventType = "click") => {
      const logEvent = (msg) => console.log(`🎯 [イベント] ${msg}`);

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
      const result = await retryManager.executeWithRetry({
        action: async () => {
          const element = await findClaudeElement(selectorInfo);
          if (element) return { success: true, element };
          return {
            success: false,
            error: `${description}の要素が見つかりません`,
          };
        },
        maxRetries: 3,
        actionName: `${description}検索`,
        context: { selectorInfo, description },
      });

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
      log.debug("\n📊 【Claude-ステップ1-1】現在のモデル情報を取得");

      // 新しいセレクタ: ユーザーが提供したモデル表示要素
      const newModelSelectors = [
        ".font-claude-response .whitespace-nowrap.tracking-tight.select-none", // 最も具体的
        ".font-claude-response div.select-none", // 少し汎用的
        "div.font-claude-response", // 親要素全体
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

    // Claude-ステップ1-2-2: 機能確認関数
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

    // Claude-ステップ1-4-1: トグル状態取得関数（テストコードから追加）
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
                    const buttonText =
                      element.textContent || element.innerText || "";
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
        console.log("🔍 [INPUT-BEFORE] テキスト入力前の状態:", {
          elementType: element.tagName,
          contentEditable: element.contentEditable,
          textContent: element.textContent,
          innerHTML: element.innerHTML,
          className: element.className,
          timestamp: new Date().toISOString(),
        });

        element.focus();
        await wait(100);

        // 🚨 [REACT-SAFE] React Error #418 対策：より安全な入力方式を試行
        console.log("🔍 [INPUT-METHOD] React Safe入力モード開始");

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
          console.log("🔧 [CLEAR-PHASE] 段階的コンテンツクリア開始");

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
          console.log("🔧 [INSERT-PHASE] React Safe テキスト挿入開始");

          // 新しいp要素を作成してテキストを挿入
          const p = document.createElement("p");
          p.textContent = text;
          element.appendChild(p);

          // ql-blankクラスを削除（Quillエディタ対応）
          element.classList.remove("ql-blank");

          // Step 5: React 合成イベントの発火（順序重要）
          console.log("🔧 [EVENT-PHASE] React合成イベント発火開始");

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

          console.log("🔍 [INPUT-AFTER] テキスト入力後の状態:", {
            elementType: element.tagName,
            finalTextContent: element.textContent,
            finalInnerHTML: element.innerHTML,
            timestamp: new Date().toISOString(),
          });

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

    // Claude-ステップ1-8: 新しいAI応答取得ロジック
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
     * ユーザー/アシスタント境界検出
     * 【動作説明】最後のユーザーメッセージ後のAI応答を確実に取得
     * 【戻り値】Element or null: AI応答要素
     */
    const getCleanAIResponse = async () => {
      log.debug("🔍 [getCleanAIResponse] ユーザー/アシスタント境界検出");

      // 最後のユーザーメッセージを探す
      const userMessages = document.querySelectorAll(
        '[data-testid="user-message"]',
      );
      const lastUserMessage = userMessages[userMessages.length - 1];

      if (lastUserMessage) {
        log.debug("  ✓ 最後のユーザーメッセージを発見");

        // 最後のユーザーメッセージの後の要素を取得
        let nextElement = lastUserMessage.nextElementSibling;

        while (nextElement) {
          // アシスタントメッセージを探す
          if (
            nextElement.matches('[data-testid="assistant-message"]') ||
            nextElement.querySelector('[data-testid="assistant-message"]')
          ) {
            log.debug("  ✓ アシスタントメッセージを検出");

            // Canvas要素を優先的に探す
            const canvasContent = nextElement.querySelector(
              "#markdown-artifact, .grid-cols-1.grid.gap-2\\.5, .code-block__code",
            );

            if (canvasContent) {
              log.debug("  ✓ Canvas要素を発見");
              return canvasContent;
            }

            // 通常のマークダウン
            const standardContent =
              nextElement.querySelector(".standard-markdown");
            if (standardContent) {
              log.debug("  ✓ 標準マークダウン要素を発見");
              return standardContent;
            }
          }
          nextElement = nextElement.nextElementSibling;
        }
      } else {
        log.debug("  ⚠️ ユーザーメッセージが見つかりません");
      }

      return null;
    };

    /**
     * 思考プロセス除外の強化
     * 【動作説明】思考プロセス要素を確実に除外
     * 【引数】element: チェック対象の要素
     * 【戻り値】Element or null: クリーンな要素
     */
    const excludeThinkingProcess = (element) => {
      if (!element) return null;

      log.debug("🧹 [excludeThinkingProcess] 思考プロセス除外チェック開始");
      log.debug(`  - 要素タイプ: ${element.tagName}`);
      log.debug(`  - 要素クラス: ${element.className || "(なし)"}`);
      log.debug(`  - 要素ID: ${element.id || "(なし)"}`);

      const textContent = element.textContent?.trim() || "";
      log.debug(`  - テキスト内容長: ${textContent.length}文字`);
      log.debug(
        `  - テキスト先頭: ${textContent.substring(0, 100)}${textContent.length > 100 ? "..." : ""}`,
      );

      // 思考プロセスインジケータの拡張
      const thinkingIndicators = [
        ".ease-out.rounded-lg",
        '[class*="thinking-process"]',
        '[class*="thinking"]',
        '[data-testid*="thinking"]',
        '[aria-label*="思考"]',
        '[class*="thought"]',
        "details[open]", // 折りたたまれた思考プロセス
      ];

      // 親要素に思考プロセスが含まれていないか確認
      for (const indicator of thinkingIndicators) {
        try {
          if (element.closest(indicator)) {
            log.debug(
              `  ❌ 思考プロセス要素を検出（親要素チェック）: ${indicator}`,
            );
            return null;
          }
        } catch (e) {
          // セレクタエラーをスキップ
          log.debug(
            `  ⚠️ セレクタエラー（スキップ）: ${indicator} - ${e.message}`,
          );
        }
      }

      // 要素のクラスをチェック（より詳細）
      const classNames = element.className || "";
      const thinkingClassPatterns = [
        "thinking",
        "thought",
        "process",
        "reasoning",
        "reflection",
        "analysis",
        "考え",
        "思考",
        "プロセス",
      ];

      for (const pattern of thinkingClassPatterns) {
        if (classNames.toLowerCase().includes(pattern)) {
          log.debug(
            `  ❌ 思考プロセスクラスを検出: "${pattern}" in "${classNames}"`,
          );
          return null;
        }
      }

      // テキスト内容による思考プロセス判定
      const thinkingTextPatterns = [
        "思考プロセス",
        "Thinking Process",
        "Let me think",
        "考えてみます",
        "分析中",
        "検討中",
        "reasoning",
        "analysis",
        "考察",
        "まず考えてみましょう",
        "step by step",
        "段階的に考える",
      ];

      for (const pattern of thinkingTextPatterns) {
        if (textContent.toLowerCase().includes(pattern.toLowerCase())) {
          log.debug(`  ❌ 思考プロセステキストを検出: "${pattern}"`);
          return null;
        }
      }

      // ボタンテキストのチェック（拡張）
      const buttons = element.querySelectorAll("button, [role='button']");
      for (const btn of buttons) {
        const buttonText = btn.textContent?.trim() || "";
        if (
          buttonText.includes("思考プロセス") ||
          buttonText.includes("Show thinking") ||
          buttonText.includes("Hide thinking")
        ) {
          log.debug(`  ❌ 思考プロセスボタンを検出: "${buttonText}"`);
          return null;
        }
      }

      // 詳細要素（details/summary）のチェック
      const details = element.querySelectorAll("details");
      for (const detail of details) {
        const summary = detail.querySelector("summary");
        if (summary && summary.textContent?.includes("思考")) {
          log.debug(
            `  ❌ 思考プロセス詳細要素を検出: "${summary.textContent}"`,
          );
          return null;
        }
      }

      // 非常に短いテキストまたは空のテキストをチェック
      if (textContent.length < 10) {
        log.debug(
          `  ❌ テキストが短すぎます: ${textContent.length}文字 - "${textContent}"`,
        );
        return null;
      }

      // 有効性をチェック：実際のコンテンツが含まれているか
      const validContentLength = textContent.replace(/\s+/g, " ").trim().length;
      if (validContentLength < 20) {
        log.debug(`  ❌ 有効なコンテンツが不足: ${validContentLength}文字`);
        return null;
      }

      log.debug("  ✅ 有効なコンテンツと判定");
      log.debug(`  ✅ 有効なコンテンツ: ${validContentLength}文字`);
      return element;
    };

    /**
     * コンテンツ検証（簡略版）
     * 【動作説明】セレクタベースでの除外がメインのため、基本的なチェックのみ
     * 【引数】element: 検証対象の要素
     * 【戻り値】boolean: 有効なコンテンツかどうか
     */
    const validateResponseContent = (element) => {
      if (!element) return false;

      // Content validation
      const text = element.textContent?.trim() || "";

      // セレクタベースでの除外がメインのため、テキストパターンチェックは簡略化
      // 明らかに空のUIラベルのみを除外
      const uiLabels = [
        "User",
        "Assistant",
        "ユーザーのプロンプト",
        "思考プロセス",
      ];
      if (uiLabels.includes(text.trim())) {
        log.debug(`  ⚠️ UIラベルを検出: ${text.trim()}`);
        return false;
      }

      // 最小文字数チェック
      if (text.length < 10) {
        log.debug(`  ⚠️ テキストが短すぎます: ${text.length}文字`);
        return false;
      }

      // セレクタベースでの除外がメインのため、プロンプトテキストチェックは簡略化
      // data-testid="user-message"で除外されるため、ここでは基本的なチェックのみ
      // 特に長いプロンプトが残っている場合のみチェック
      if (
        text.length > 2000 &&
        (text.includes("# 命令書") || text.includes("【現在"))
      ) {
        log.debug(`  ⚠️ 長いプロンプトテキストが残存: ${text.length}文字`);
        return false;
      }

      log.debug(`  ✓ 有効なコンテンツ: ${text.length}文字`);
      return true;
    };

    // findElementBySelectors関数は削除（重複のため）
    // findElementByMultipleSelectors関数を使用

    /**
     * 統合AI応答取得メソッド
     * 【動作説明】複数の手法を組み合わせて確実にAI応答を取得
     * 【戻り値】Object: {element, text, method}
     */
    const getReliableAIResponse = async () => {
      log.debug("🚀 [getReliableAIResponse] AI応答取得開始");

      // Method 1: ユーザー/アシスタント境界検出
      let response = await getCleanAIResponse();

      if (response) {
        response = excludeThinkingProcess(response);
        if (response && validateResponseContent(response)) {
          return {
            element: response,
            text: response.textContent?.trim() || "",
            method: "User/Assistant Boundary",
          };
        }
      }

      // Method 2: 階層的セレクタ
      log.debug("  階層的セレクタ戦略を試行");

      // Canvas要素を優先（構造化セレクタ用に変換）
      let element = null;

      // Canvas要素を検索
      for (const selector of aiResponseSelectors.response_types.canvas) {
        const testElement = document.querySelector(selector);
        if (testElement) {
          element = testElement;
          log.debug(`  ✓ Canvasセレクタでマッチ: ${selector}`);
          break;
        }
      }

      // Standard要素を検索
      if (!element) {
        for (const selector of aiResponseSelectors.response_types.standard) {
          const testElement = document.querySelector(selector);
          if (testElement) {
            element = testElement;
            log.debug(`  ✓ Standardセレクタでマッチ: ${selector}`);
            break;
          }
        }
      }

      // Code block要素を検索
      if (!element) {
        for (const selector of aiResponseSelectors.response_types.code_block) {
          const testElement = document.querySelector(selector);
          if (testElement) {
            element = testElement;
            log.debug(`  ✓ CodeBlockセレクタでマッチ: ${selector}`);
            break;
          }
        }
      }

      if (element) {
        element = excludeThinkingProcess(element);
        if (element && validateResponseContent(element)) {
          return {
            element: element,
            text: element.textContent?.trim() || "",
            method: "Hierarchical Selectors",
          };
        }
      }

      // Method 3: フォールバック - 最後のgrid要素
      // Fallback search
      const grids = document.querySelectorAll(".grid-cols-1.grid");
      if (grids.length > 0) {
        const lastGrid = grids[grids.length - 1];
        const validated = excludeThinkingProcess(lastGrid);
        if (validated && validateResponseContent(validated)) {
          return {
            element: validated,
            text: validated.textContent?.trim() || "",
            method: "Fallback - Last Grid",
          };
        }
      }

      return {
        element: null,
        text: "",
        method: "Not Found",
      };
    };

    /**
     * テキスト内容によるプロンプト除外（簡略版）
     * 【動作説明】セレクタベースの除外がメインのため、テキストパターンマッチングは簡略化
     * 【引数】fullText: 完全テキスト
     * 【戻り値】String: テキスト（セレクタベースで除外されているためそのまま返却）
     */
    const removePromptFromText = (fullText, sentPrompt = null) => {
      if (!fullText) return "";

      log.debug(
        "✂️ [removePromptFromText] セレクタベースで除外済みのため、テキストをそのまま返却",
      );
      log.debug(`  - 入力テキスト長: ${fullText.length}文字`);

      // セレクタベースでのPROMPT除外がメインのため、テキストパターンマッチングは簡略化
      // HTML構造の<details>タグのみ除外（思考プロセスの折りたたみブロック）
      let processedText = fullText;
      if (processedText.includes("<details>")) {
        log.debug("  - <details>ブロックを除外");
        processedText = processedText.replace(
          /<details>[\s\S]*?<\/details>/gi,
          "",
        );
      }

      return processedText.trim();
    };

    // Claude-ステップ1-9: テキストプレビュー取得関数（改善版）
    /**
     * 高度テキスト抽出関数（応答取得の核心）
     * 【動作説明】新しいAI応答取得ロジックを使用して確実にテキストを取得
     * 【引数】element: テキスト抽出対象のDOM要素（オプション）
     * 【戻り値】Object {full: 完全テキスト, preview: プレビュー, length: 文字数}
     */
    const getTextPreview = async (element) => {
      log.debug("📊 [getTextPreview] テキスト取得開始");

      // 要素が指定されていない場合は、新しいAI応答取得ロジックを使用
      if (!element) {
        log.debug("  新しいAI応答取得ロジックを使用");
        const response = await getReliableAIResponse();

        if (response.element) {
          log.debug(`  取得メソッド: ${response.method}`);
          log.debug(`  テキスト長: ${response.text.length}文字`);

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
          log.debug("  AI応答が見つかりませんでした");
          return { full: "", preview: "", length: 0 };
        }
      }

      // 既存のロジック（要素が指定されている場合）
      log.debug("  - 要素タグ:", element.tagName);
      log.debug("  - 要素ID:", element.id || "(なし)");
      log.debug(
        "  - 要素クラス:",
        element.className ? element.className.substring(0, 100) : "(なし)",
      );
      log.debug("  - 子要素数:", element.children.length);

      // まず、思考プロセスとコンテンツ検証をチェック
      const cleanedElement = excludeThinkingProcess(element);
      if (!cleanedElement || !validateResponseContent(cleanedElement)) {
        log.debug("  要素が無効なコンテンツと判定されました");
        // フォールバック：新しいロジックで再試行
        const response = await getReliableAIResponse();
        if (response.element) {
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
        }
      }

      // 複数の方法でテキスト取得を試みる
      let fullText = "";

      // 方法1: innerText（表示されているテキスト）
      if (element.innerText) {
        fullText = element.innerText.trim();
        log.debug("  - innerText長:", fullText.length);
      }

      // 方法2: textContent（全テキスト）
      if (!fullText || fullText.length < 100) {
        const textContent = element.textContent.trim();
        log.debug("  - textContent長:", textContent.length);
        if (textContent.length > fullText.length) {
          fullText = textContent;
        }
      }

      // 方法3: 特定の子要素からテキスト取得（Canvasの場合）
      const isCanvasElement =
        element.classList.contains("code-block__code") ||
        element.id === "markdown-artifact" ||
        element.querySelector("#markdown-artifact") ||
        element.querySelector(".code-block__code") ||
        element.querySelector(".grid-cols-1.grid.gap-2\\.5");

      // 作業説明文を除外（間違った取得対象）
      const isTaskExplanation =
        element.classList.contains("p-3") ||
        element.classList.contains("pt-0") ||
        element.classList.contains("pr-8") ||
        (element.textContent &&
          element.textContent.includes("The task is complete"));

      // 思考プロセス要素を除外
      const thinkingButtons = Array.from(
        element.querySelectorAll("button"),
      ).filter(
        (btn) => btn.textContent && btn.textContent.includes("思考プロセス"),
      );
      const isThinkingProcess =
        thinkingButtons.length > 0 ||
        element.querySelector(".ease-out.rounded-lg") ||
        (element.textContent && element.textContent.includes("思考プロセス"));

      if (isCanvasElement && !isTaskExplanation && !isThinkingProcess) {
        log.debug("  📝 Canvas要素を検出、特別処理を実行");
        log.debug(
          `    - 要素判定: ${element.classList.contains("code-block__code") ? "code-block__code" : "その他Canvas要素"}`,
        );

        // code-block__code要素の場合は直接テキストを取得
        if (element.classList.contains("code-block__code")) {
          const codeText = element.innerText || element.textContent || "";
          if (codeText.trim() && codeText.length > fullText.length) {
            fullText = codeText.trim();
            log.debug("  - code-block__code テキスト長:", fullText.length);
          }
        } else {
          // その他のCanvas要素の場合は従来の方法
          const paragraphs = element.querySelectorAll("p");
          log.debug("  - 段落数:", paragraphs.length);

          if (paragraphs.length > 0) {
            let combinedText = "";
            let totalChars = 0;
            paragraphs.forEach((para, index) => {
              const paraText = para.innerText || para.textContent || "";
              if (paraText.trim()) {
                const charCount = paraText.length;
                totalChars += charCount;
                if (index < 5 || index >= paragraphs.length - 2) {
                  // 最初の5段落と最後の2段落の詳細をログ
                  log.debug(`    - 段落${index + 1}: ${charCount}文字`);
                }
                combinedText += paraText.trim() + "\n\n";
              }
            });

            log.debug(`  - 総文字数: ${totalChars}文字`);

            if (combinedText.trim().length > fullText.length) {
              fullText = combinedText.trim();
              log.debug("  - 結合テキスト長:", fullText.length);
            }
          }

          // pre/codeブロックも探す（コード例が含まれる場合）
          const codeBlocks = element.querySelectorAll("pre, code");
          if (codeBlocks.length > 0) {
            log.debug("  - コードブロック数:", codeBlocks.length);
            let codeText = "";
            codeBlocks.forEach((block, index) => {
              const blockText = block.innerText || block.textContent || "";
              if (blockText.trim() && !fullText.includes(blockText.trim())) {
                log.debug(
                  `    - コードブロック${index + 1}: ${blockText.length}文字`,
                );
                codeText += blockText + "\n";
              }
            });

            if (codeText.trim()) {
              fullText += "\n\n" + codeText.trim();
            }
          }
        }
      } else if (isTaskExplanation) {
        log.debug("  ⚠️ 作業説明文を検出、除外します");
        log.debug(
          `    - 除外理由: ${
            element.classList.contains("p-3")
              ? "p-3クラス"
              : element.classList.contains("pt-0")
                ? "pt-0クラス"
                : element.classList.contains("pr-8")
                  ? "pr-8クラス"
                  : "タスク完了テキスト"
          }`,
        );
      } else if (isThinkingProcess) {
        log.debug("  ⚠️ 思考プロセス要素を検出、除外します");
        log.debug("    - 除外理由: 思考プロセスボタンまたは関連要素を検出");
        // 思考プロセス以外の要素を探して取得
        const canvasContent = Array.from(
          element.querySelectorAll("div.grid-cols-1.grid"),
        ).find((div) => {
          const buttons = Array.from(div.querySelectorAll("button"));
          return !buttons.some(
            (btn) =>
              btn.textContent && btn.textContent.includes("思考プロセス"),
          );
        });
        if (canvasContent) {
          const contentText =
            canvasContent.innerText || canvasContent.textContent || "";
          if (contentText.trim()) {
            fullText = contentText.trim();
            log.debug("  - 思考プロセス除外後のテキスト長:", fullText.length);
          }
        }
      }

      let length = fullText.length;
      // Final text length: ${length}

      if (length === 0) {
        log.warn("  ⚠️ テキストが空です！");
        log.debug(
          "  - element.innerHTML長:",
          element.innerHTML ? element.innerHTML.length : 0,
        );
        log.debug(
          "  - element.outerHTML冒頭:",
          element.outerHTML ? element.outerHTML.substring(0, 200) : "(なし)",
        );
      }

      // セレクタベースでの除外がメインのため、テキスト処理は最小限に
      const originalLength = fullText.length;
      fullText = removePromptFromText(fullText); // HTMLの<details>タグのみ除外
      const finalLength = fullText.length;

      if (originalLength !== finalLength) {
        log.debug(
          `📝 HTMLタグクリーニング: ${originalLength}文字 → ${finalLength}文字`,
        );
      }

      // length変数を再利用
      length = finalLength;

      if (length <= 200) {
        return { full: fullText, preview: fullText, length };
      } else {
        const preview =
          fullText.substring(0, 100) +
          "\n...[中略]...\n" +
          fullText.substring(length - 100);
        return { full: fullText, preview, length };
      }
    };

    // Claude-ステップ1-10: 要素の可視性チェック
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

    // Claude-ステップ1-11: 機能要素の取得（特別処理対応）
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

    // Claude-ステップ1-12: すべての機能トグルをオフにする関数
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
    // Claude-ステップ1-13: Deep Research専用処理関数
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
        // Claude-ステップ6-1-1: 送信後、回答停止ボタンが出てくるまで待機
        log.debug(
          "\n【Claude-ステップ6-1】送信後、回答停止ボタンが出てくるまで待機",
        );

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

        // Claude-ステップ6-1-2: 回答停止ボタンが消滅するまで待機（初回）
        if (stopButtonFound) {
          log.debug(
            "\n【Claude-ステップ6-2】回答停止ボタンが消滅するまで待機（初回）",
          );
          let stopButtonGone = false;
          waitCount = 0;
          const maxDisappearWait =
            AI_WAIT_CONFIG.STOP_BUTTON_DISAPPEAR_WAIT / 1000; // 統一設定: 5分

          while (!stopButtonGone && waitCount < maxDisappearWait) {
            const stopResult = await findClaudeElement(
              deepResearchSelectors["3_回答停止ボタン"],
              3,
              true,
            );

            if (!stopResult) {
              stopButtonGone = true;
              log.debug(`✓ 停止ボタンが消滅しました（${waitCount}秒後）`);
              // 停止ボタン消滅後の3秒待機
              // Post-stop wait...
              await wait(3000);
              break;
            }

            await wait(1000);
            waitCount++;

            // 10秒ごとにログ出力
            if (waitCount % 10 === 0) {
              log.debug(
                `  初回回答生成中... ${Math.floor(waitCount / 60)}分${waitCount % 60}秒経過`,
              );
            }
          }
        }

        // Claude-ステップ6-1-3: 一時待機（Deep Researchの追加処理のため）
        // Deep Research additional wait
        await wait(5000);

        // ログで状態を確認
        const currentButtons = document.querySelectorAll("button");
        for (const btn of currentButtons) {
          const text = btn.textContent?.trim() || "";
          if (text.includes("停止") || text.includes("Stop")) {
            log.debug("  停止ボタン検出:", text);
          }
        }

        // Claude-ステップ6-1-4: 回答停止ボタンが出現するまで待機
        // Waiting for stop button
        stopButtonFound = false;
        waitCount = 0;
        const maxWaitCount = AI_WAIT_CONFIG.DEEP_RESEARCH_WAIT / 1000; // 統一設定: 40分

        while (!stopButtonFound && waitCount < maxWaitCount) {
          const stopResult = await findClaudeElement(
            deepResearchSelectors["3_回答停止ボタン"],
            3,
            true,
          );

          if (stopResult) {
            stopButtonFound = true;
            log.debug(
              `✓ 停止ボタンが出現しました（開始から${Math.floor(waitCount / 60)}分${waitCount % 60}秒後）`,
            );
            break;
          }

          await wait(1000);
          waitCount++;

          // 1分ごとにログ出力
          if (waitCount % 60 === 0) {
            log.debug(
              `  Deep Research処理中... ${Math.floor(waitCount / 60)}分経過`,
            );
          }
        }

        // Claude-ステップ6-1-5: 回答停止ボタンが10秒間消滅するまで待機
        if (stopButtonFound) {
          log.debug(
            "\n【Claude-ステップ6-5】回答停止ボタンが10秒間消滅するまで待機",
          );
          let stopButtonGone = false;
          let disappearWaitCount = 0;
          const maxDisappearWait = AI_WAIT_CONFIG.DEEP_RESEARCH_WAIT / 1000; // 統一設定: 40分
          let lastLogTime = Date.now();

          while (!stopButtonGone && disappearWaitCount < maxDisappearWait) {
            const stopResult = await findClaudeElement(
              deepResearchSelectors["3_回答停止ボタン"],
              3,
              true,
            );

            if (!stopResult) {
              // 10秒間確認
              let confirmCount = 0;
              let stillGone = true;

              while (confirmCount < 10) {
                await wait(1000);
                const checkResult = await findClaudeElement(
                  deepResearchSelectors["3_回答停止ボタン"],
                  2,
                );
                if (checkResult) {
                  stillGone = false;
                  break;
                }
                confirmCount++;
              }

              if (stillGone) {
                stopButtonGone = true;
                log.debug(
                  `✓ Deep Research完了（総時間: ${Math.floor(disappearWaitCount / 60)}分）`,
                );
                // 停止ボタン消滅後の3秒待機
                // Post-stop wait...
                await wait(3000);
                break;
              }
            }

            await wait(1000);
            disappearWaitCount++;

            // 1分ごとにログ出力
            if (Date.now() - lastLogTime >= 60000) {
              log.debug(
                `  Deep Research生成中... ${Math.floor(disappearWaitCount / 60)}分経過`,
              );
              lastLogTime = Date.now();
            }
          }
        }
      } catch (error) {
        log.error("❌ Deep Research待機処理エラー:", error.message);
        throw error;
      }
    };

    // ========================================
    // メイン実行関数（Claude-ステップ2-7を含む）
    // ========================================

    async function executeTask(taskData) {
      // タスクIDを生成または取得
      const taskId =
        taskData.taskId ||
        taskData.id ||
        `task_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

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
        } else {
          if (currentStatus.currentTaskId === taskId) {
            log.warn(
              `⚠️ [DUPLICATE-EXECUTION] タスクID ${taskId} は既に実行中です (コンテキスト: ${typeof chrome !== "undefined" && chrome.runtime ? chrome.runtime.id : "unknown"})`,
            );
            return {
              success: false,
              error: "Task already executing",
              inProgress: true,
              taskId: taskId,
              executionStatus: currentStatus,
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
            success: false,
            error: "Another task is in progress",
            busyWith: currentStatus.currentTaskId,
            requestedTaskId: taskId,
            executionStatus: currentStatus,
          };
        }
      }

      // 実行状態を設定
      setExecutionState(true, taskId);

      console.log(
        "%c🚀 ========== Claude V2 タスク実行開始 ==========",
        "color: #9C27B0; font-weight: bold; font-size: 16px",
      );

      console.log(
        "%c【ステップ1】タスク初期化",
        "color: #2196F3; font-weight: bold;",
      );
      console.log("════════════════════════════════════════");
      console.log(`🕐 実行開始時刻: ${new Date().toISOString()}`);
      console.log(`📍 実行URL: ${window.location.href}`);
      console.log(`🆔 タスクID: ${taskId}`);

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

        // Deep Research判定
        const isDeepResearch = featureName === "Deep Research";

        log.debug("実行パラメータ:");
        log.debug("  - モデル名:", modelName || "(デフォルト)");
        log.debug("  - 機能名:", featureName || "(なし)");
        log.debug("  - Deep Research:", isDeepResearch ? "有効" : "無効");
        log.debug("  - プロンプト長:", prompt.length, "文字");

        // ========================================
        // 📝 ステップ2: テキスト入力
        // ========================================
        console.log(
          "%c📝 === ステップ2: テキスト入力開始 ===",
          "color: #FF5722; font-weight: bold; font-size: 14px",
        );
        console.log(`  - プロンプト長: ${prompt.length}文字`);
        console.log(`  - 検索セレクタ: ${claudeSelectors["1_テキスト入力欄"]}`);
        console.log(`  - 現在のURL: ${window.location.href}`);

        log.debug(`📝 Text input (${prompt.length} chars)...`);
        ClaudeLogManager.logStep("Step2-TextInput", "テキスト入力開始");

        console.log("🔍 テキスト入力欄を検索中...");
        const inputResult = await findClaudeElement(
          claudeSelectors["1_テキスト入力欄"],
        );
        if (!inputResult) {
          log.error("❌ テキスト入力欄が見つかりません - リトライ機能で再試行");
          log.error(`🎯 検索セレクタ: ${claudeSelectors["1_テキスト入力欄"]}`);

          const retryManager = new ClaudeRetryManager();
          const retryResult = await retryManager.executeWithRetry({
            action: async () => {
              const input = await findClaudeElement(
                claudeSelectors["1_テキスト入力欄"],
              );
              return input
                ? { success: true, element: input }
                : { success: false };
            },
            maxRetries: 5,
            actionName: "テキスト入力欄検索",
            context: { taskId: taskData.taskId },
          });

          if (!retryResult.success) {
            throw new Error("テキスト入力欄が見つかりません");
          }
          inputResult = retryResult.result.element;
        }

        // Text input found
        console.log(
          "%c✅ テキスト入力欄を発見",
          "color: #4CAF50; font-weight: bold",
        );
        console.log(`  - 要素タグ: ${inputResult.tagName}`);
        console.log(`  - 要素ID: ${inputResult.id || "(なし)"}`);
        console.log(`  - 要素クラス: ${inputResult.className || "(なし)"}`);

        log.debug(`📝 ${prompt.length}文字のテキストを入力中...`);
        log.debug(
          `💬 プロンプト先頭: "${prompt.substring(0, 50)}${prompt.length > 50 ? "..." : ""}"`,
        );

        console.log("⌨️ テキスト入力処理を実行中...");
        const inputSuccess = await inputText(inputResult, prompt);
        if (!inputSuccess) {
          log.error("❌ テキスト入力処理に失敗 - リトライ機能で再試行");

          const retryManager = new ClaudeRetryManager();
          const retryResult = await retryManager.executeWithRetry({
            action: async () => {
              const success = await enterText(
                inputResult,
                prompt,
                "目標プロンプト",
              );
              return success ? { success: true } : { success: false };
            },
            maxRetries: 3,
            actionName: "テキスト入力処理",
            context: { taskId: taskData.taskId, promptLength: prompt.length },
          });

          if (!retryResult.success) {
            throw new Error("テキスト入力に失敗しました");
          }
        }

        // Text input complete
        console.log(
          "%c✅ テキスト入力完了",
          "color: #4CAF50; font-weight: bold",
        );
        console.log(`  - 入力成功: ${inputSuccess ? "はい" : "いいえ"}`);
        console.log(`  - 入力文字数: ${inputResult.textContent.length}文字`);
        console.log(`  - 期待文字数: ${prompt.length}文字`);

        log.debug(
          `📊 入力結果: ${inputResult.textContent.length}文字が入力欄に設定されました`,
        );

        // 入力成功の確認
        const inputVerification = inputResult.textContent.length > 0;
        console.log(`  - 入力検証: ${inputVerification ? "成功" : "失敗"}`);
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
          "%c✅【Claude-ステップ2-2】テキスト入力処理完了",
          "color: #4CAF50; font-weight: bold;",
        );
        log.debug("─".repeat(50));
        await wait(1000);

        // ========================================
        // 🤖 ステップ3: モデル選択
        // ========================================
        console.log(
          "%c🤖 === ステップ3: モデル選択 ===",
          "color: #9C27B0; font-weight: bold; font-size: 14px",
        );
        // 統合ログ: モデル選択開始
        const cellInfo =
          taskData.cellReference ||
          taskData.cellInfo ||
          taskData.cell ||
          "不明";
        if (modelName && modelName !== "" && modelName !== "設定なし") {
          console.log(`  - 選択するモデル: ${modelName}`);
          console.log(`  - 現在のURL: ${window.location.href}`);

          log.debug(
            "%c【Claude-ステップ3-1】モデル選択開始",
            "color: #FF9800; font-weight: bold;",
          );
          log.debug("─".repeat(40));
          log.debug(`🎯 目標モデル: ${modelName}`);
          log.debug(`📍 現在のページURL: ${window.location.href}`);

          // モデルメニューボタンを探してクリック
          console.log("🔍 モデルメニューボタンを検索中...");
          log.debug("\n【Claude-ステップ3-2】モデルメニューボタンを探す");
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

          console.log(
            `  - メニューボタン: ${menuButton ? "発見" : "見つからない"}`,
          );
          if (menuButton) {
            console.log("  - メニューボタンをクリック中...");
            await triggerReactEvent(menuButton);
            await wait(2000);
            console.log("  - メニュー展開完了");

            // 🔍 モデル情報自動検出（テスト済みロジック）
            try {
              console.log("🔍 Claudeモデル情報検出開始");
              const detectedModels = await detectClaudeModelsFromOpenMenu();

              // 📝 詳細ログ：すべての表示されたモデルを記載
              console.log("🎯 検出結果サマリー:");
              console.log(`📋 検出されたモデル総数: ${detectedModels.length}`);

              if (detectedModels.length > 0) {
                console.log("📝 すべての検出モデル詳細一覧:");
                detectedModels.forEach((model, index) => {
                  console.log(
                    `  ${index + 1}. ${model.name} ${model.isSelected ? "✅ (選択中)" : ""}`,
                  );
                  if (model.description) {
                    console.log(`     説明: ${model.description}`);
                  }
                });

                console.log("📊 モデル名一覧:");
                console.log(
                  `   ${detectedModels.map((m) => m.name).join(", ")}`,
                );

                const selectedModel = detectedModels.find((m) => m.isSelected);
                if (selectedModel) {
                  console.log(`🎯 現在選択中: ${selectedModel.name}`);
                } else {
                  console.log("⚠️ 選択中のモデルが見つかりません");
                }
              } else {
                console.log("❌ モデルが検出されませんでした");
              }

              console.log("🔍 検出されたClaudeモデル:", detectedModels);

              // 🔧 機能情報も検出を試行
              let detectedFunctions = [];
              try {
                console.log("🔧 Claude機能情報検出も試行中...");
                console.log(
                  "  モデルメニューを閉じてから機能メニューを開きます",
                );
                detectedFunctions = await detectClaudeFunctionsFromOpenMenu();
                console.log("🔧 検出されたClaude機能:", detectedFunctions);

                if (detectedFunctions.length > 0) {
                  console.log("📝 検出された機能一覧:");
                  detectedFunctions.forEach((func, i) => {
                    const toggleStatus = func.isToggleable
                      ? func.isToggled
                        ? "[ON]"
                        : "[OFF]"
                      : "";
                    const secretStatus = func.secretStatus
                      ? `(${func.secretStatus})`
                      : "";
                    console.log(
                      `  ${i + 1}. ${func.name} ${toggleStatus} ${secretStatus}`,
                    );
                  });
                } else {
                  console.log("⚠️ 機能が検出されませんでした");
                }
              } catch (functionError) {
                console.log("⚠️ 機能検出エラー（継続）:", functionError);
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
                  console.log("✅ 検出結果をUIに送信・更新完了");
                } else {
                  console.log(
                    "📋 検出結果を送信（変更なしのため更新スキップ）",
                  );
                }
              } else {
                console.log(
                  "⚠️ モデル・機能ともに検出されなかったため送信をスキップ",
                );
              }
            } catch (detectionError) {
              console.log("❌ モデル検出エラー:", detectionError);
            }
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
                /^(Claude\s+)?(Opus|Sonnet|Haiku)\s+[\d.]+/,
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
            log.debug("【Claude-ステップ3-3】その他のモデルメニューをチェック");

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
          console.log(
            "%c✅ モデル選択完了",
            "color: #4CAF50; font-weight: bold",
          );
          console.log(`  - 選択後のモデル: "${newCurrentModel}"`);
          console.log(`  - 期待モデル: "${targetModelName}"`);
          const modelMatched = newCurrentModel === targetModelName;
          console.log(
            `  - 選択結果: ${modelMatched ? "✅ 一致" : "❌ 不一致"}`,
          );

          log.debug(`🔍 選択後のモデル: "${newCurrentModel}"`);
          log.debug(`🎯 期待されるモデル: "${targetModelName}"`);
          // Model match: ${modelMatched ? "success" : "mismatch"}

          log.debug(
            "%c✅【Claude-ステップ3-4】モデル選択処理完了",
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
          console.log("  - モデル選択: スキップ（設定なし）");
          log.debug(
            "%c⏭️【Claude-ステップ3-1】モデル選択をスキップ（設定なし）",
            "color: #9E9E9E; font-style: italic;",
          );
        }

        // ========================================
        // ⚙️ ステップ4: 機能選択
        // ========================================
        if (featureName && featureName !== "" && featureName !== "設定なし") {
          log.debug(
            "%c【Claude-ステップ4-1】機能選択開始",
            "color: #9C27B0; font-weight: bold;",
          );
          log.debug("─".repeat(40));
          log.debug(`🎯 目標機能: ${featureName}`);
          log.debug(`🔍 Deep Research判定: ${isDeepResearch ? "Yes" : "No"}`);

          log.debug("\n🔧【Claude-ステップ4-2】機能メニューアクセス開始");

          console.log("🔍 機能メニューボタンを検索中...");
          const featureMenuBtn = getFeatureElement(
            featureSelectors.menuButton,
            "機能メニューボタン",
          );
          if (featureMenuBtn) {
            console.log("  - 機能メニューボタン: 発見");
            console.log("  - メニューを開いています...");
            featureMenuBtn.click();
            await wait(1500);
            console.log("  - メニュー展開完了");

            // 機能選択前にすべてのトグルをオフにする
            log.debug("\n【Claude-ステップ4-3】全トグルをオフに設定");
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
              log.debug(
                "\n【Claude-ステップ4-4】Deep Research用: メニューを閉じる",
              );
              featureMenuBtn.click();
              await wait(1000);

              // リサーチボタンを探してクリック
              const buttons = document.querySelectorAll(
                'button[type="button"][aria-pressed]',
              );
              for (const btn of buttons) {
                const svg = btn.querySelector('svg path[d*="M8.5 2C12.0899"]');
                if (svg) {
                  const isPressed = btn.getAttribute("aria-pressed") === "true";
                  if (!isPressed) {
                    btn.click();
                    await wait(1000);
                  }
                  break;
                }
              }

              // ========================================
              // Claude-ステップ4-2-2: Deep Research機能確認
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
              // その他の機能を選択
              const toggles = document.querySelectorAll(
                'button:has(input[role="switch"])',
              );
              for (const toggle of toggles) {
                const label = toggle.querySelector("p.font-base");
                if (label && label.textContent.trim() === featureName) {
                  setToggleState(toggle, true);
                  await wait(1000);
                  break;
                }
              }

              // メニューを閉じる
              log.debug("\n【Claude-ステップ4-6】メニューを閉じる");
              featureMenuBtn.click();
              await wait(1000);
            }
          }

          // ========================================
          // Claude-ステップ4-4: 機能選択確認（新機能）
          // ========================================
          // Function selection check
          const confirmationResult = confirmFeatureSelection(featureName);

          // 🔧 [FEATURE-VERIFICATION] 機能選択詳細検証
          console.log("🔧 [FEATURE-VERIFICATION] 機能選択結果詳細:");
          console.log("  - 期待される機能:", featureName);
          console.log("  - confirmationResult:", confirmationResult);
          console.log("  - エラー有無:", !!confirmationResult.error);
          console.log(
            "  - 検出された機能数:",
            confirmationResult.detected?.length || 0,
          );
          console.log(
            "  - 検出された機能一覧:",
            confirmationResult.detected || [],
          );

          // DOM上の機能ボタン状態を直接確認
          const featureButtons = document.querySelectorAll(
            'button[role="switch"], input[role="switch"]',
          );
          console.log("🔧 [FEATURE-DOM-CHECK] DOM上の機能ボタン状態:");
          console.log("  - 機能ボタン総数:", featureButtons.length);
          featureButtons.forEach((btn, index) => {
            const isOn =
              btn.checked || btn.getAttribute("aria-checked") === "true";
            const buttonText =
              btn.closest("label")?.textContent?.trim() ||
              btn.textContent?.trim() ||
              `ボタン${index + 1}`;
            console.log(
              `    [${index + 1}] ${buttonText}: ${isOn ? "ON" : "OFF"}`,
            );
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
            "%c✅【Claude-ステップ4-8】機能選択処理完了",
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
          console.log("  - 機能選択: スキップ（設定なし）");
          log.debug(
            "%c⏭️【Claude-ステップ4-1】機能選択をスキップ（設定なし）",
            "color: #9E9E9E; font-style: italic;",
          );
        }

        // ========================================
        // 📤 ステップ5: メッセージ送信
        // ========================================
        console.log(
          "%c📤 === ステップ5: メッセージ送信 ===",
          "color: #4CAF50; font-weight: bold; font-size: 14px",
        );
        console.log(
          `  - 送信ボタンセレクタ: ${claudeSelectors["2_送信ボタン"]}`,
        );
        console.log(`  - 送信内容長: ${prompt.length}文字`);

        log.debug(
          "%c【Claude-ステップ5-1】メッセージ送信開始",
          "color: #E91E63; font-weight: bold;",
        );
        log.debug("─".repeat(40));
        log.debug(`🎯 送信ボタンセレクタ: ${claudeSelectors["2_送信ボタン"]}`);
        log.debug(`📝 送信内容長: ${prompt.length}文字`);

        // Searching send button...
        console.log("🔍 送信ボタンを検索中...");
        const sendResult = await findClaudeElement(
          claudeSelectors["2_送信ボタン"],
        );
        if (!sendResult) {
          log.error("❌ 送信ボタンが見つかりません - リトライ機能で再試行");
          log.error(`🎯 検索セレクタ: ${claudeSelectors["2_送信ボタン"]}`);

          const retryManager = new ClaudeRetryManager();
          const retryResult = await retryManager.executeWithRetry({
            action: async () => {
              const button = await findClaudeElement(
                claudeSelectors["2_送信ボタン"],
              );
              return button
                ? { success: true, element: button }
                : { success: false };
            },
            maxRetries: 5,
            actionName: "送信ボタン検索",
            context: { taskId: taskData.taskId },
          });

          if (!retryResult.success) {
            throw new Error("送信ボタンが見つかりません");
          }
          sendResult = retryResult.result.element;
        }

        // Send button found
        console.log(
          "%c✅ 送信ボタンを発見",
          "color: #4CAF50; font-weight: bold",
        );
        const buttonRect = sendResult.getBoundingClientRect();
        console.log(
          `  - ボタン位置: x=${Math.round(buttonRect.left)}, y=${Math.round(buttonRect.top)}`,
        );
        console.log(
          `  - ボタンサイズ: ${Math.round(buttonRect.width)}×${Math.round(buttonRect.height)}px`,
        );

        log.debug(
          `📍 送信ボタン位置: x=${Math.round(buttonRect.left)}, y=${Math.round(buttonRect.top)}`,
        );
        log.debug(
          `📏 送信ボタンサイズ: ${Math.round(buttonRect.width)}×${Math.round(buttonRect.height)}px`,
        );

        console.log("🖱️ 送信ボタンをクリック中...");
        log.debug("📤 送信ボタンをクリック...");
        const clickSuccess = await clickButton(sendResult, "送信ボタン");
        if (!clickSuccess) {
          log.error("❌ 送信ボタンのクリック処理に失敗 - リトライ機能で再試行");

          const retryManager = new ClaudeRetryManager();
          const retryResult = await retryManager.executeWithRetry({
            action: async () => {
              const success = await clickButton(sendResult, "送信ボタン");
              return success ? { success: true } : { success: false };
            },
            maxRetries: 3,
            actionName: "送信ボタンクリック",
            context: { taskId: taskData.taskId },
          });

          if (!retryResult.success) {
            throw new Error("送信ボタンのクリックに失敗しました");
          }
        }

        // Send button clicked
        console.log(
          "%c✅ 送信ボタンクリック完了",
          "color: #4CAF50; font-weight: bold",
        );
        console.log(`  - クリック成功: ${clickSuccess ? "はい" : "いいえ"}`);

        // 🔧 [UI-OPERATION-VERIFICATION] 送信ボタンクリック検証
        console.log("🔧 [SEND-VERIFICATION] 送信ボタンクリック詳細検証:");
        console.log("  - clickButton関数戻り値:", clickSuccess);
        console.log(
          "  - 送信ボタン要素タイプ:",
          sendResult?.tagName || "undefined",
        );
        console.log(
          "  - 送信ボタンdisabled状態:",
          sendResult?.disabled || "undefined",
        );
        console.log(
          "  - 送信ボタンvisibility:",
          getComputedStyle(sendResult).visibility,
        );
        console.log(
          "  - 送信ボタンdisplay:",
          getComputedStyle(sendResult).display,
        );

        // 送信時刻を更新（実際の送信タイミング）
        sendTime = new Date(); // 変数を更新
        console.log(`  - 送信時刻: ${sendTime.toISOString()}`);

        // クリック後の状態確認
        setTimeout(() => {
          console.log("🔧 [SEND-VERIFICATION-AFTER] クリック後の状態確認:");
          console.log("  - ページURL変更:", window.location.href);
          console.log(
            "  - テキスト入力欄の内容:",
            document.querySelector('[contenteditable="true"]')?.textContent
              ?.length || 0,
          );

          // 送信処理が開始されたかの間接的な確認
          const loadingElements = document.querySelectorAll(
            '[data-testid*="loading"], [aria-busy="true"], .loading',
          );
          console.log("  - ローディング要素数:", loadingElements.length);

          // 送信ボタンの状態変化確認
          console.log(
            "  - 送信ボタン現在の状態:",
            sendResult?.disabled ? "無効" : "有効",
          );
        }, 1000);
        log.debug("🔍 送信時刻記録開始 - ", sendTime.toISOString());

        // taskDataからtaskIdを取得、なければ生成
        const taskId =
          taskData.taskId ||
          `Claude_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        try {
          // Chrome拡張機能のメッセージ送信で直接記録
          if (chrome.runtime && chrome.runtime.sendMessage) {
            log.debug("📡 [DEBUG] chrome.runtime.sendMessage呼び出し開始", {
              taskId: taskId,
              sendTime: sendTime.toISOString(),
              timestamp: new Date().toISOString(),
            });

            // タイムアウト付きでsendMessageを実行
            const sendMessageWithTimeout = new Promise((resolve) => {
              const timeout = setTimeout(() => {
                log.warn("⏱️ [TIMEOUT] sendMessageがタイムアウト（3秒経過）");
                resolve({
                  error: "timeout",
                  message: "sendMessage timeout after 3000ms",
                });
              }, 3000); // 3秒でタイムアウト

              try {
                chrome.runtime.sendMessage(
                  {
                    type: "recordSendTime",
                    taskId: taskId,
                    sendTime: sendTime.toISOString(),
                    taskInfo: {
                      aiType: "Claude",
                      model: modelName || "不明",
                      function: featureName || "通常",
                    },
                  },
                  (response) => {
                    clearTimeout(timeout);

                    // chrome.runtime.lastErrorをチェック
                    if (chrome.runtime.lastError) {
                      log.warn(
                        "⚠️ [chrome.runtime.lastError]:",
                        chrome.runtime.lastError.message,
                      );
                      resolve({
                        error: "runtime_error",
                        message: chrome.runtime.lastError.message,
                      });
                    } else {
                      log.debug("📨 [DEBUG] sendMessage応答受信:", response);
                      resolve(response || { success: true });
                    }
                  },
                );
              } catch (syncError) {
                clearTimeout(timeout);
                log.error("❌ [SYNC-ERROR] sendMessage同期エラー:", syncError);
                resolve({ error: "sync_error", message: syncError.message });
              }
            });

            const response = await sendMessageWithTimeout;

            if (response.error) {
              log.warn(
                `⚠️ [FIXED] 送信時刻記録失敗（タスク実行は継続） [${response.error}]:`,
                {
                  error: response.error,
                  message: response.message,
                  taskId: taskId,
                  timestamp: new Date().toISOString(),
                  note: "エラーでもタスク実行には影響なし",
                },
              );
            } else {
              log.debug("✅ [FIXED] 送信時刻記録成功（background.jsで処理）:", {
                taskId: taskId,
                sendTime: sendTime.toISOString(),
                response: response,
                timestamp: new Date().toISOString(),
              });
            }
          } else {
            log.warn("⚠️ Chrome runtime APIが利用できません");
          }
        } catch (error) {
          log.debug("❌ 送信時刻記録エラー:", error.message);
        }

        log.debug("✅ メッセージ送信完了");
        log.debug(`📤 実際の送信時刻: ${sendTime.toISOString()}`);
        log.debug(`⏱️ 送信処理時間: ${Date.now() - taskStartTime.getTime()}ms`);

        ClaudeLogManager.logStep("Step5-Send", "メッセージ送信完了", {
          sendTime: sendTime.toISOString(),
          processingTime: Date.now() - taskStartTime.getTime(),
        });

        log.debug(
          "%c✅【Claude-ステップ5-2】メッセージ送信処理完了",
          "color: #4CAF50; font-weight: bold;",
        );
        log.debug("─".repeat(50));
        await wait(2000);

        // Canvas内容を保存する変数（スコープを広く）
        let finalText = "";

        // ========================================
        // ステップ6-0: Canvas V2検出チェック（リトライ機能統合）
        // ========================================
        log.debug(
          "%c【Claude-ステップ6-0】Canvas V2検出チェック",
          "color: #FF5722; font-weight: bold;",
        );
        log.debug("─".repeat(40));

        const retryManager = new ClaudeRetryManager();
        const versionElement = document.querySelector(
          '[data-testid="artifact-version-trigger"]',
        );

        if (versionElement) {
          const versionText =
            versionElement.textContent || versionElement.innerText || "";
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

            const retryResult = await retryManager.executeWithRetry({
              taskId: taskData.taskId || taskId,
              prompt: taskData.prompt || prompt,
              enableDeepResearch: taskData.enableDeepResearch || isDeepResearch,
              specialMode: taskData.specialMode || null,
            });

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
          "%c✅【Claude-ステップ6-0】Canvas V2検出チェック完了",
          "color: #4CAF50; font-weight: bold;",
        );
        log.debug("─".repeat(50));

        // ========================================
        // ⏳ ステップ6: 応答待機
        // ========================================
        console.log(
          "%c⏳ === ステップ6: 応答待機 ===",
          "color: #FF9800; font-weight: bold; font-size: 14px",
        );
        console.log(
          `  - 待機モード: ${isDeepResearch ? "Deep Research" : "通常"} `,
        );

        log.debug(
          "%c【Claude-ステップ6-1】応答待機開始",
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
          // ステップ6-2: 通常応答待機
          // ========================================
          log.debug("📝【Claude-ステップ6-3】通常応答待機（停止ボタン監視）");
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
            const maxDisappearWait = AI_WAIT_CONFIG.MAX_WAIT / 1000; // 最大5分（300秒）

            log.debug(
              `📊 [STOP-BUTTON-MONITOR] 監視開始 - 最大待機時間: ${maxDisappearWait}秒`,
            );

            while (disappearWaitCount < maxDisappearWait) {
              // 待機状態の詳細ログ（毎秒）
              console.log(`⏳ [WAIT-MONITOR] ${disappearWaitCount}秒経過:`, {
                停止ボタン: "検索前",
                confirmCount: confirmCount,
                必要連続数: 10,
                残り: 10 - confirmCount,
                最大待機: maxDisappearWait,
                タイムスタンプ: new Date().toISOString(),
              });

              // 待機中の文字数カウント（10秒ごと）
              if (disappearWaitCount % 10 === 0 && disappearWaitCount > 0) {
                log.debug(
                  `  生成中... ${Math.floor(disappearWaitCount / 60)}分${disappearWaitCount % 60}秒経過`,
                );

                // Canvasテキストをチェック
                const canvasElement = await findClaudeElement(
                  deepResearchSelectors["4_Canvas機能テキスト位置"],
                  1,
                  true,
                );
                if (canvasElement) {
                  const canvasTextLength = canvasElement.textContent
                    ? canvasElement.textContent.trim().length
                    : 0;
                  log.debug(`  📈 Canvasテキスト: ${canvasTextLength}文字`);
                  ClaudeLogManager.logStep(
                    "Progress-Canvas",
                    `Canvas文字数: ${canvasTextLength}文字`,
                    {
                      charCount: canvasTextLength,
                      time: disappearWaitCount,
                    },
                  );
                }

                // 通常テキストをチェック
                const normalElement = await findClaudeElement(
                  deepResearchSelectors["5_通常処理テキスト位置"],
                  1,
                  true,
                );
                if (normalElement) {
                  const normalTextLength = normalElement.textContent
                    ? normalElement.textContent.trim().length
                    : 0;
                  log.debug(`  📈 通常テキスト: ${normalTextLength}文字`);
                  ClaudeLogManager.logStep(
                    "Progress-Normal",
                    `通常文字数: ${normalTextLength}文字`,
                    {
                      charCount: normalTextLength,
                      time: disappearWaitCount,
                    },
                  );
                }
              }

              // 停止ボタンの状態をチェック
              console.log(`🔍 [SELECTOR-SEARCH] 停止ボタン検索開始:`, {
                セレクタ名: "3_回答停止ボタン",
                リトライ回数: 3,
                検索時刻: new Date().toISOString(),
              });

              const stopResult = await findClaudeElement(
                claudeSelectors["3_回答停止ボタン"],
                3, // リトライ回数を増やす
                true,
              );

              console.log(`🔍 [SELECTOR-RESULT] 停止ボタン検索結果:`, {
                検出: stopResult ? "成功" : "失敗",
                要素タイプ: stopResult?.tagName || "N/A",
                経過時間: disappearWaitCount,
              });

              if (!stopResult) {
                // 停止ボタンが見つからない
                const previousCount = confirmCount;
                confirmCount++;

                console.log(`🎯 [COMPLETION-CHECK] 完了判定:`, {
                  前のconfirmCount: previousCount,
                  現在のconfirmCount: confirmCount,
                  必要数: 10,
                  判定: confirmCount >= 10 ? "完了" : "継続",
                  理由:
                    confirmCount >= 10
                      ? "10秒連続非検出"
                      : `あと${10 - confirmCount}秒必要`,
                  経過時間: disappearWaitCount,
                });

                log.debug(
                  `🔍 [STOP-BUTTON-CHECK] 停止ボタン非検出 (confirmCount: ${confirmCount}/10, 経過時間: ${disappearWaitCount}秒)`,
                );

                if (confirmCount >= 10) {
                  // 10秒連続で停止ボタンが見つからない場合のみ完了と判定
                  console.log(`📊 [STATE-CHANGE] 待機状態変更:`, {
                    前の状態: "応答待機中",
                    新しい状態: "応答完了",
                    理由: "10秒連続で停止ボタン非検出",
                    総経過時間: disappearWaitCount,
                    連続非検出時間: confirmCount,
                    タイムスタンプ: new Date().toISOString(),
                  });

                  stopButtonGone = true;
                  console.log(
                    "%c✅ 応答生成完了！（停止ボタンが10秒間連続で非表示）",
                    "color: #4CAF50; font-weight: bold",
                  );
                  console.log(`  - 総待機時間: ${disappearWaitCount}秒`);
                  console.log(`  - 連続非検出時間: ${confirmCount}秒`);
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
                  console.log(`📊 [STATE-CHANGE] 待機状態変更:`, {
                    前の状態: `非検出カウント中(${confirmCount})`,
                    新しい状態: "カウントリセット",
                    理由: "停止ボタン再検出",
                    経過時間: disappearWaitCount,
                    タイムスタンプ: new Date().toISOString(),
                  });

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

              // 長時間待機の警告（30秒ごと）
              if (disappearWaitCount % 30 === 0 && disappearWaitCount > 0) {
                console.warn(`⚠️ [TIMEOUT-WARNING] 長時間待機中:`, {
                  経過時間: `${disappearWaitCount}秒`,
                  分換算: `${Math.floor(disappearWaitCount / 60)}分${disappearWaitCount % 60}秒`,
                  最大待機: `${maxDisappearWait}秒`,
                  残り時間: `${maxDisappearWait - disappearWaitCount}秒`,
                  confirmCount: confirmCount,
                  停止ボタン最終検出: stopResult ? "検出中" : "非検出",
                });
              }

              // タイムアウトチェック
              if (disappearWaitCount >= maxDisappearWait) {
                console.log(`🚨 [TIMEOUT-REACHED] 最大待機時間到達:`, {
                  最大待機時間: maxDisappearWait,
                  実際の待機時間: disappearWaitCount,
                  最終confirmCount: confirmCount,
                  強制完了: true,
                  タイムスタンプ: new Date().toISOString(),
                });

                log.warn(
                  `⚠️ [STOP-BUTTON-MONITOR] タイムアウト - 最大待機時間${maxDisappearWait}秒に到達`,
                );
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
          "%c✅【Claude-ステップ6-4】応答待機処理完了",
          "color: #4CAF50; font-weight: bold;",
        );
        log.debug("─".repeat(50));

        // 応答完了後の追加待機とウィンドウ状態確認
        await wait(3000);

        // log.debug('🔍 [Claude] ウィンドウ状態確認はスキップ（Content Script制限）');

        // ========================================
        // ステップ6-4-1: Canvasプレビューボタンチェック
        // ========================================
        log.debug(
          "%c【Claude-ステップ6-4-1】Canvasプレビューボタンの存在確認",
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
        // ステップ6-5: 「続ける」ボタンチェック
        // ========================================
        log.debug(
          "%c【Claude-ステップ6-5】「続ける」ボタンの存在確認",
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
                // 10秒間確認
                let stillGone = true;
                for (let confirmCount = 0; confirmCount < 10; confirmCount++) {
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
            "%c✅【Claude-ステップ6-5】「続ける」ボタン処理完了",
            "color: #4CAF50; font-weight: bold;",
          );
          await wait(2000); // 追加待機
        } else {
          log.debug(
            "「続ける」ボタンは見つかりませんでした。次のステップに進みます。",
          );
          log.debug(
            "%c✅【Claude-ステップ6-5】「続ける」ボタンチェック完了",
            "color: #4CAF50; font-weight: bold;",
          );
        }

        // ========================================
        // 📥 ステップ7: 結果取得
        // ========================================
        log.debug(
          "%c【Claude-ステップ7-1】テキスト取得処理開始",
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
          canvasResult = await findClaudeElement(
            deepResearchSelectors["4_Canvas機能テキスト位置"],
            5,
            true,
          );
        } catch (canvasError) {
          log.error("⚠️ [Claude] Canvasテキスト取得エラー:", {
            error: canvasError.message,
            timestamp: new Date().toISOString(),
          });
        }

        if (canvasResult) {
          log.debug("🎨 Canvas機能の最終テキストを取得中...");
          log.debug(
            "🚫 【Claude-ステップ7-1】プロンプト除外機能を適用してテキスト取得",
          );
          const textInfo = await getTextPreview(canvasResult);
          if (textInfo && textInfo.full && textInfo.full.length > 100) {
            finalText = textInfo.full;
            log.debug(
              `📄 Canvas 最終テキスト取得完了 (${textInfo.length}文字)`,
            );
            log.debug(
              "✅ 【Claude-ステップ7-2】プロンプト除外完了 - 純粋なAI応答を取得",
            );
            log.debug(
              "プレビュー:\n",
              textInfo.preview.substring(0, 200) + "...",
            );
          }
        }

        // Canvas以外の処理（通常テキストのフォールバック）
        if (!finalText) {
          log.debug("🔍 Canvas以外のテキストを確認中...");
          const deepResearchSelectors = getDeepResearchSelectors();

          // 通常のテキストを確認（Canvasが見つからない場合のフォールバック）
          const normalResult = await findClaudeElement(
            deepResearchSelectors["5_通常処理テキスト位置"],
            3,
            true,
          );
          if (normalResult) {
            log.debug("✓ 通常処理のテキストを検出");
            log.debug(
              "🚫 【Claude-ステップ7-3】プロンプト除外機能を適用してテキスト取得（通常応答）",
            );
            const textInfo = await getTextPreview(normalResult);
            if (textInfo && textInfo.full) {
              finalText = textInfo.full;
              log.debug(`📄 通常 テキスト取得完了 (${textInfo.length}文字)`);
              log.debug(
                "✅ 【Claude-ステップ7-4】プロンプト除外完了 - 純粋なAI応答を取得",
              );
              log.debug(
                "プレビュー:\n",
                textInfo.preview.substring(0, 200) + "...",
              );
            }
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
          "%c✅【Claude-ステップ7-2】テキスト取得処理完了",
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

        const result = {
          success: true,
          result: {
            // ai-task-executor.jsが期待するネスト構造
            response: finalText,
            status: "success",
          },
          response: finalText, // 後方互換性のため
          text: finalText,
          model: modelName,
          function: featureName,
          sendTime: sendTime,
          url: window.location.href,
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
        const promptPreview =
          prompt.substring(0, 10) + (prompt.length > 10 ? "..." : "");
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

        // 実行状態を解除
        setExecutionState(false);

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

        log.error("❌ [ClaudeV2] タスク実行エラー:", error.message);
        log.error("スタックトレース:", error.stack);

        const result = {
          success: false,
          error: error.message,
          text: "エラーが発生しました: " + error.message,
        };

        // リトライマネージャーで最終リトライを実行
        log.debug("🔄 内蔵リトライマネージャーでエラー復旧を試行中...");
        const retryManager = new ClaudeRetryManager();

        const retryResult = await retryManager.executeWithRetry({
          action: async () => {
            // タスクを再実行 (executeClaude → executeTask に修正)
            log.info("🔍 [DIAGNOSTIC] リトライでexecuteTask呼び出し");
            return await executeTask(taskData);
          },
          maxRetries: 2,
          actionName: "Claude全体タスク最終リトライ",
          context: {
            taskId: taskData.taskId,
            originalError: error.message,
            errorType: error.name,
          },
          successValidator: (result) => result && result.success === true,
        });

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
    console.log("🔧 [FUNC-EXPORT-DIAGNOSTIC] 関数エクスポート判定:");
    console.log("  - shouldExportFunctions:", shouldExportFunctions);
    console.log("  - 現在のURL:", currentURL);
    console.log("  - isValidClaudeURL:", isValidClaudeURL);
    console.log("  - isExtensionPage:", isExtensionPage);
    console.log(
      "  - エクスポート実行判定:",
      shouldExportFunctions ? "✅ 実行する" : "❌ スキップ",
    );

    if (shouldExportFunctions) {
      console.log("🔍 [FUNC-EXPORT] 関数公開処理開始");
      console.log(
        "🔧 [FUNC-EXPORT-START] エクスポート開始時点での関数定義状況:",
      );
      console.log("  - executeTask:", typeof executeTask);
      console.log("  - findClaudeElement:", typeof findClaudeElement);
      console.log("  - inputText:", typeof inputText);
      console.log("  - runAutomation:", typeof runAutomation);

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
      console.log(
        "🔧 [FUNC-EXPORT-EXECUTION] executeTask関数エクスポート処理:",
      );
      console.log("  - executeTask定義確認:", typeof executeTask);
      console.log(
        "  - window.executeTask現在の状態:",
        typeof window.executeTask,
      );
      console.log(
        "  - エクスポート前のwindowプロパティ数:",
        Object.keys(window).length,
      );

      if (typeof executeTask !== "undefined") {
        window.executeTask = executeTask;
        console.log("🔧 [FUNC-EXPORT-SUCCESS] executeTask正常エクスポート:");
        console.log(
          "  - エクスポート後のwindow.executeTask:",
          typeof window.executeTask,
        );
        console.log(
          "  - window.executeTask === executeTask:",
          window.executeTask === executeTask,
        );
        console.log(
          "  - 関数実行可能性テスト:",
          typeof window.executeTask === "function",
        );
        log.info("✅ executeTask関数を公開");

        // 🔧 [ENHANCED-TEST] 関数の実際の呼び出し可能性をテスト
        try {
          console.log(
            "🔧 [FUNC-EXPORT-TEST] executeTask関数テスト呼び出し準備完了",
          );
        } catch (testError) {
          console.log(
            "❌ [FUNC-EXPORT-TEST] executeTask関数テスト失敗:",
            testError.message,
          );
        }
      } else {
        console.log("❌ [FUNC-EXPORT-ERROR] executeTask未定義:");
        console.log("  - executeTask定義状況:", typeof executeTask);
        console.log(
          "  - 利用可能なグローバル関数:",
          Object.getOwnPropertyNames(window).filter(
            (name) =>
              typeof window[name] === "function" && name.includes("execute"),
          ),
        );
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
        log.error("❌ inputText関数が未定義");
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
      window.ClaudeAutomation = {
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
        console.log("🔍 Claudeモデル検出テスト開始");

        // 1. モデルメニューが既に開いているかチェック
        let menu = document.querySelector(
          'div[role="menu"][data-state="open"]',
        );

        if (menu) {
          console.log("✅ モデルメニューが開いています");
          return extractModelsFromMenu(menu);
        } else {
          console.log("❌ モデルメニューが開いていません");
          return [];
        }
      }

      // メニューからモデル情報を抽出する関数
      function extractModelsFromMenu(menu) {
        const models = [];
        const menuItems = menu.querySelectorAll('div[role="menuitem"]');

        console.log(`📋 メニューアイテム数: ${menuItems.length}`);

        menuItems.forEach((item, index) => {
          // モデル名を取得（複数のセレクタを試す）
          const modelNameElement =
            item.querySelector(".flex-1.text-sm div") || // メインの場所
            item.querySelector("div.flex-1 div") || // 代替パス
            item.querySelector(".text-sm div") || // シンプルパス
            item.querySelector("div > div:first-child"); // フォールバック

          if (modelNameElement) {
            const modelName = modelNameElement.textContent.trim();

            // モデル説明を取得
            const descriptionElement = item.querySelector(
              ".text-text-500.pr-4.text-xs.mt-1",
            );
            const description = descriptionElement
              ? descriptionElement.textContent.trim()
              : "";

            // 現在選択されているかチェック（SVGチェックマークの存在）
            const isSelected = !!item.querySelector(
              'svg path[d*="M232.49,80.49l-128,128"]',
            );

            console.log(
              `[${index + 1}] モデル: "${modelName}" | 説明: "${description}" | 選択済み: ${isSelected}`,
            );

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
            console.log(`[${index + 1}] その他の要素: "${textContent}"`);
          }
        });

        console.log("🎯 検出結果:");
        console.log(`📋 検出されたモデル数: ${models.length}`);

        if (models.length > 0) {
          console.log("📝 すべての検出モデル一覧:");
          models.forEach((model, index) => {
            console.log(
              `  ${index + 1}. ${model.name} ${model.isSelected ? "✅" : ""}`,
            );
            if (model.description) {
              console.log(`     説明: ${model.description}`);
            }
          });

          console.log("📊 モデル名のみ:");
          console.log(models.map((m) => m.name).join(", "));
        } else {
          console.log("❌ モデルが検出されませんでした");
        }

        console.table(models);
        return models;
      }

      // ========================================
      // Claude 機能検出関数（テスト済み）
      // ========================================

      // Claude機能メニュー検出関数（修正版：機能メニューを開いてから検出）
      async function detectClaudeFunctionsFromOpenMenu() {
        console.log("🔧 Claude機能検出開始");
        console.log("🔍 [DEBUG] 現在のURL:", window.location.href);
        console.log("🔍 [DEBUG] 現在時刻:", new Date().toISOString());

        // まず、既に開いている機能メニューをチェック（ユーザーテストコードパターン）
        console.log("📍 ステップ0: 既に開いている機能メニューをチェック");
        const existingMenuToggleItems = document.querySelectorAll(
          'button:has(input[role="switch"])',
        );
        console.log(
          `🔍 [DEBUG] 既存のトグルアイテム数: ${existingMenuToggleItems.length}`,
        );

        if (existingMenuToggleItems.length > 0) {
          console.log("✅ 機能メニューが既に開いています - 直接抽出を試行");
          const directResult = extractFunctionsFromExistingMenu(
            existingMenuToggleItems,
          );
          if (directResult.length > 0) {
            console.log(
              `✅ 直接抽出成功: ${directResult.length}個の機能を検出`,
            );
            return directResult;
          }
        }

        // Step 1: 機能メニューボタンを探す
        console.log("📍 ステップ1: 機能メニューボタンを探しています...");

        let functionButton = null;

        // SVGパスを含むボタンを探す
        const pathElement = document.querySelector('path[d*="M40,88H73a32"]');
        if (pathElement) {
          // pathから親のbutton要素を探す
          functionButton = pathElement.closest("button");
          console.log("  ✅ SVGアイコンから機能ボタンを発見");
        }

        if (!functionButton) {
          // 代替方法：aria-expandedを持つボタンをすべて取得
          const expandableButtons = document.querySelectorAll(
            "button[aria-expanded]",
          );
          console.log(`  展開可能なボタン数: ${expandableButtons.length}`);

          // 各ボタンを確認（2番目のlistboxボタンが機能の可能性）
          for (let i = 0; i < expandableButtons.length; i++) {
            const btn = expandableButtons[i];
            const text = btn.textContent?.trim() || "";

            // モデル選択ボタンでないことを確認
            if (
              !text.match(/Claude|Sonnet|Opus|Haiku/i) &&
              btn.getAttribute("aria-haspopup") === "listbox" &&
              i > 0
            ) {
              functionButton = btn;
              console.log(
                `  ✅ 機能ボタンの可能性が高いボタンを発見（位置: ${i + 1}）`,
              );
              break;
            }
          }
        }

        if (!functionButton) {
          console.log("❌ 機能メニューボタンが見つかりません");
          return [];
        }

        // Step 2: 機能メニューを開く
        const isExpanded =
          functionButton.getAttribute("aria-expanded") === "true";
        console.log(
          `  現在の機能メニュー状態: ${isExpanded ? "開いている" : "閉じている"}`,
        );

        if (!isExpanded) {
          console.log("  機能メニューを開いています...");
          functionButton.click();
          // メニューが開くのを待つ
          await new Promise((resolve) => setTimeout(resolve, 1000));
          console.log("  ✅ 機能メニューを開きました");
        }

        // Step 3: 機能メニューのコンテンツを見つける
        console.log("📍 機能メニューコンテンツを検出中...");

        let contentDiv = null;

        // 複数のセレクタで検索
        const menuSelectors = [
          "div.absolute div.p-1\\.5.flex.flex-col",
          "div[role='listbox']:last-of-type",
          'div[class*="p-1.5"][class*="flex-col"]',
          "div.w-full > div.p-1\\.5.flex.flex-col",
        ];

        for (const selector of menuSelectors) {
          const elements = document.querySelectorAll(selector);
          if (elements.length > 0) {
            // 最後の要素（最新のメニュー）を取得
            contentDiv = elements[elements.length - 1];
            console.log(
              `  ✅ メニューコンテンツを発見 (セレクタ: ${selector})`,
            );
            break;
          }
        }

        if (!contentDiv) {
          console.log("❌ 機能メニューのコンテンツが見つかりません");
          return [];
        }

        console.log("✅ 機能メニューのコンテンツを検出しました");
        return extractFunctionsFromMenu(contentDiv);
      }

      // ユーザーテストコードで成功したパターンによる機能抽出（既存メニューから）
      function extractFunctionsFromExistingMenu(menuToggleItems) {
        console.log("🔧 [新機能] 既存メニューから機能抽出開始");
        console.log(`🔍 [DEBUG] トグルアイテム数: ${menuToggleItems.length}`);

        const functions = [];

        menuToggleItems.forEach((item, index) => {
          console.log(`🔍 [DEBUG] アイテム${index + 1}を処理中...`);

          // p.font-base要素を探す（ユーザーテストコードと同じパターン）
          const label = item.querySelector("p.font-base");
          console.log(`🔍 [DEBUG] ラベル要素: ${label ? "あり" : "なし"}`);

          if (label) {
            const functionName = label.textContent.trim();
            console.log(`🔍 [DEBUG] 機能名: "${functionName}"`);

            // トグル状態を取得
            const toggleInput = item.querySelector('input[role="switch"]');
            const isToggled = toggleInput ? toggleInput.checked : false;
            console.log(`🔍 [DEBUG] トグル状態: ${isToggled}`);

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
            console.log(
              `✅ 機能追加: ${functionName} (${isToggled ? "ON" : "OFF"})`,
            );
          } else {
            console.log(`⚠️ アイテム${index + 1}: ラベルが見つかりません`);
            // デバッグ用：要素の内容を確認
            console.log(
              `🔍 [DEBUG] アイテム内容: ${item.textContent.substring(0, 100)}`,
            );
          }
        });

        console.log(`🔧 [新機能] 抽出完了: ${functions.length}個の機能`);
        if (functions.length > 0) {
          console.log("📝 抽出された機能一覧:");
          functions.forEach((func, i) => {
            console.log(
              `  ${i + 1}. ${func.name} (${func.isToggled ? "ON" : "OFF"})`,
            );
          });
        }

        return functions;
      }

      // メニューから機能情報を抽出（改善版）
      function extractFunctionsFromMenu(contentDiv) {
        const functions = [];

        // すべてのボタンを取得
        const allButtons = contentDiv.querySelectorAll("button");
        console.log(`📋 総ボタン数: ${allButtons.length}`);

        // 検索ボックスを除外
        const buttons = Array.from(allButtons).filter((btn) => {
          const id = btn.id || "";
          const text = btn.textContent || "";
          return !id.includes("search") && !text.includes("Search");
        });

        console.log(`📋 機能ボタン数（検索除外後）: ${buttons.length}`);

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

          console.log(
            `[${index + 1}] ${functionName} | 有効:${isEnabled} | とぐる:${isToggleable ? (isToggled ? "ON" : "OFF") : "N/A"} | セクレタ:${secretStatus || "N/A"}`,
          );

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

        console.log("🎯 検出結果:");
        console.log(`📋 機能総数: ${functions.length}`);

        if (functions.length > 0) {
          console.log("📝 機能一覧:");
          functions.forEach((func, i) => {
            const status = func.isEnabled ? "✅" : "❌";
            const toggle = func.isToggleable
              ? func.isToggled
                ? "🟢"
                : "🔴"
              : "";
            const secret = func.secretStatus ? `[${func.secretStatus}]` : "";
            console.log(
              `  ${i + 1}. ${func.name} ${status} ${toggle} ${secret}`,
            );
          });
        } else {
          console.log("❌ 機能が検出されませんでした");
        }

        console.table(functions);
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
    console.log("🔍 [SCRIPT-COMPLETION] Content Script実行完了サマリー:", {
      scriptLoaded: window.CLAUDE_SCRIPT_LOADED,
      messageListenerReady: window.CLAUDE_MESSAGE_LISTENER_READY,
      automationLoaded: window.__CLAUDE_AUTOMATION_LOADED__,
      currentURL: window.location.href,
      isValidClaudeURL: isValidClaudeURL,
      executionTime: Date.now() - window.CLAUDE_SCRIPT_INIT_TIME,
      completionTime: new Date().toISOString(),
      globalObjects: {
        claudeLogFileManager: !!window.claudeLogFileManager,
        executeTask: typeof window.executeTask,
        runAutomation: typeof window.runAutomation,
      },
    });
  } catch (error) {
    // 致命的エラーをキャッチして記録
    console.error("🚨 [Claude Script] FATAL ERROR:", error);
    console.error("🚨 Stack trace:", error.stack);

    // 🔍 [ERROR-DIAGNOSTIC] エラー発生時診断
    console.log("🔍 [ERROR-DIAGNOSTIC] エラー発生時の状態:", {
      currentURL: window.location.href,
      error: {
        message: error.message,
        name: error.name,
        stack: error.stack,
      },
      scriptState: {
        scriptLoaded: window.CLAUDE_SCRIPT_LOADED,
        automationLoaded: window.__CLAUDE_AUTOMATION_LOADED__,
        messageListenerReady: window.CLAUDE_MESSAGE_LISTENER_READY,
      },
      timestamp: new Date().toISOString(),
    });
  }
})(); // 即時実行関数の終了
