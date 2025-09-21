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
 * Step 4-3: AI処理の並列実行とエラーハンドリング
 */

// 初期化ログ（簡略化）
log.info("✅ [step4-tasklist.js] 初期化完了");

// グローバルエラーハンドリング
if (typeof window !== "undefined") {
  window.step4FileError = null;

  // 未処理エラーの捕捉
  window.addEventListener("error", function (event) {
    if (event.filename && event.filename.includes("step4-tasklist.js")) {
      log.error("❌ [step4-tasklist.js] エラー:", event.error);
      window.step4FileError = event.error?.message || "未知のエラー";
    }
  });
}

// ========================================
// StreamProcessorV2統合: Step内統合版ウィンドウ・タスク管理システム
// ========================================

/**
 * Step内統合版 WindowService（StreamProcessorV2の機能を内部実装）
 */
// ========================================
// 成功済みリトライロジック（unused/window-service.jsから移植）
// ========================================

/**
 * シンプルリトライ機能 - 成功実績あり
 * @param {Object} options リトライ設定
 * @param {Function} options.action 実行する関数
 * @param {Function} options.isSuccess 成功判定関数
 * @param {number} options.maxRetries 最大リトライ回数
 * @param {number} options.interval リトライ間隔(ms)
 * @param {string} options.actionName アクション名（ログ用）
 * @param {Object} options.context コンテキスト情報
 */
async function executeSimpleRetry({
  action,
  isSuccess,
  maxRetries = 20,
  interval = 500,
  actionName = "",
  context = {},
}) {
  let retryCount = 0;
  let lastResult = null;
  let lastError = null;

  while (retryCount < maxRetries) {
    try {
      if (retryCount === maxRetries - 1) {
        log.debug(`[Retry] ${actionName} 最終試行 ${retryCount}/${maxRetries}`);
      }
      lastResult = await action();
      if (isSuccess(lastResult)) {
        // 成功時は詳細ログ不要
        return { success: true, result: lastResult, retryCount };
      }
    } catch (error) {
      lastError = error;
      if (retryCount === maxRetries - 1) {
        log.error(`[Retry] ${actionName} 失敗: ${error.message}`);
      }
    }
    retryCount++;
    if (retryCount >= maxRetries) {
      return {
        success: false,
        result: lastResult,
        error: lastError,
        retryCount,
      };
    }
    if (interval > 0) {
      await new Promise((resolve) => setTimeout(resolve, interval));
    }
  }
  return { success: false, result: lastResult, error: lastError, retryCount };
}

/**
 * 統一ウィンドウ管理クラス - 複数Mapを1つに集約
 */
class UnifiedWindowManager {
  constructor() {
    // 1つのMapで全ての状態を管理
    this.windows = new Map(); // windowId -> 全情報
    this.sendMessageQueue = new Map(); // tabId -> Promise (排他制御)
  }

  /**
   * ウィンドウ追加
   */
  addWindow(windowId, tabId, aiType, position) {
    this.windows.set(windowId, {
      windowId,
      tabId,
      aiType,
      position,
      status: "loading",
      lastCheck: Date.now(),
      checkResult: null,
    });
    log.debug(`[WindowManager] ウィンドウ追加: ${windowId} (${aiType})`);
  }

  /**
   * AI種別の正規化
   */
  normalizeAiType(aiType) {
    if (!aiType) return "unknown";
    const baseType = aiType.replace(/_task.*/, "").toLowerCase();
    const typeMap = {
      chatgpt: "chatgpt",
      claude: "claude",
      gemini: "gemini",
      genspark: "genspark",
    };
    return typeMap[baseType] || baseType;
  }

  /**
   * AI種別でウィンドウ検索（改善版）
   */
  async findWindowsByAiType(aiType) {
    const normalizedType = this.normalizeAiType(aiType);
    const results = [];

    for (const [windowId, info] of this.windows.entries()) {
      if (info.aiType.startsWith(normalizedType + "_")) {
        // タブが実際に存在するかチェック
        try {
          const tab = await chrome.tabs.get(info.tabId);
          if (tab && tab.status === "complete") {
            results.push(info);
          }
        } catch (error) {
          // タブが存在しない場合はマップから削除
          log.debug(`[WindowManager] 無効タブ削除: ${info.tabId}`);
          this.windows.delete(windowId);
        }
      }
    }
    return results;
  }

  /**
   * 最初に成功したウィンドウを返す（ファーストウィン戦略）
   */
  async findFirstWorkingWindow(aiType) {
    const candidates = await this.findWindowsByAiType(aiType);
    log.debug(`[WindowManager] ${aiType}候補: ${candidates.length}個`);

    for (const window of candidates) {
      const isWorking = await this.quickCheck(window.tabId);
      if (isWorking) {
        log.debug(`[FirstWin] ${aiType}動作確認`);
        return window;
      }
    }
    log.debug(`[FirstWin] ${aiType}動作ウィンドウなし`);
    return null;
  }

  /**
   * クイックチェック（簡単なタブ存在確認）
   */
  async quickCheck(tabId) {
    try {
      const tab = await chrome.tabs.get(tabId);
      return tab && tab.status === "complete" && tab.url;
    } catch (error) {
      return false;
    }
  }

  /**
   * ウィンドウ情報取得
   */
  getWindow(windowId) {
    return this.windows.get(windowId);
  }

  /**
   * 全ウィンドウ情報取得
   */
  getAllWindows() {
    return Array.from(this.windows.values());
  }
}

/**
 * 安全なメッセージ送信クラス - sendMessage競合防止
 */
class SafeMessenger {
  static sendMessageQueue = new Map(); // tabId -> Promise (排他制御)

  /**
   * 排他制御付きメッセージ送信
   */
  static async sendSafeMessage(tabId, message, timeout = 8000) {
    log.debug(
      `[SafeMessenger] 送信開始: tabId=${tabId}, action=${message.action}`,
    );

    // 🔍 [DEBUG] SafeMessenger詳細ログ
    log.debug("🔍 [DEBUG-SAFE-MESSENGER] 送信開始詳細:", {
      tabId: tabId,
      messageAction: message.action,
      messageKeys: Object.keys(message),
      timeout: timeout,
      currentQueueSize: this.sendMessageQueue.size,
      isTabInQueue: this.sendMessageQueue.has(tabId),
      allQueuedTabs: Array.from(this.sendMessageQueue.keys()),
      timestamp: new Date().toISOString(),
    });

    // 既に同じタブに送信中の場合は待機
    if (this.sendMessageQueue.has(tabId)) {
      log.debug(`[SafeMessenger] タブ${tabId}は送信中、待機...`);
      log.debug("🔍 [DEBUG-SAFE-MESSENGER] キュー待機詳細:", {
        waitingForTab: tabId,
        currentQueueSize: this.sendMessageQueue.size,
        queuedTabs: Array.from(this.sendMessageQueue.keys()),
      });
      try {
        await this.sendMessageQueue.get(tabId);
        log.debug("🔍 [DEBUG-SAFE-MESSENGER] キュー待機完了:", {
          tabId: tabId,
        });
      } catch (error) {
        log.debug("🔍 [DEBUG-SAFE-MESSENGER] キュー待機エラー:", {
          tabId: tabId,
          error: error.message,
        });
        // 前のリクエストのエラーは無視
      }
    }

    // 新しいリクエストを開始
    log.debug("🔍 [DEBUG-SAFE-MESSENGER] 新規リクエスト開始:", {
      tabId: tabId,
    });
    const promise = this._doSendMessage(tabId, message, timeout);
    this.sendMessageQueue.set(tabId, promise);

    try {
      const result = await promise;
      log.debug(
        `[SafeMessenger] 送信完了: tabId=${tabId}, success=${result.success}`,
      );
      // 🔍 [DEBUG] SafeMessenger結果詳細ログ
      log.debug("🔍 [DEBUG-SAFE-MESSENGER] 送信完了詳細:", {
        tabId: tabId,
        success: result.success,
        resultKeys: result ? Object.keys(result) : null,
        hasData: !!result.data,
        hasError: !!result.error,
        timestamp: result.timestamp,
      });
      return result;
    } finally {
      // 完了後はキューから削除
      this.sendMessageQueue.delete(tabId);
      log.debug("🔍 [DEBUG-SAFE-MESSENGER] キューから削除:", {
        tabId: tabId,
        remainingQueueSize: this.sendMessageQueue.size,
      });
    }
  }

  /**
   * 実際のメッセージ送信処理
   */
  static async _doSendMessage(tabId, message, timeout) {
    // 🔍 [DEBUG] 実際の送信処理開始ログ
    log.debug("🔍 [DEBUG-SAFE-MESSENGER] _doSendMessage開始:", {
      tabId: tabId,
      messageAction: message.action,
      timeout: timeout,
      chromeTabsExists: !!chrome?.tabs,
      sendMessageExists: !!chrome?.tabs?.sendMessage,
    });

    try {
      // 🔍 [DEBUG] chrome.tabs.sendMessage実行前ログ
      log.debug("🔍 [DEBUG-SAFE-MESSENGER] chrome.tabs.sendMessage実行前:", {
        tabId: tabId,
        message: message,
        aboutToCall: "chrome.tabs.sendMessage",
      });

      const response = await Promise.race([
        chrome.tabs.sendMessage(tabId, message),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error(`sendMessage timeout after ${timeout}ms`)),
            timeout,
          ),
        ),
      ]);

      // 🔍 [DEBUG] レスポンス受信ログ
      log.debug("🔍 [DEBUG-SAFE-MESSENGER] レスポンス受信:", {
        tabId: tabId,
        responseReceived: !!response,
        responseType: typeof response,
        responseKeys: response ? Object.keys(response) : null,
        responseSuccess: response?.success,
        hasResponseData: !!response?.data,
        responseAction: response?.action,
      });

      return {
        success: true,
        data: response,
        tabId: tabId,
        timestamp: Date.now(),
      };
    } catch (error) {
      log.debug(`[SafeMessenger] エラー: ${error.message}`);
      // 🔍 [DEBUG] エラー詳細ログ
      log.debug("🔍 [DEBUG-SAFE-MESSENGER] エラー詳細:", {
        tabId: tabId,
        errorMessage: error.message,
        errorName: error.name,
        errorStack: error.stack?.substring(0, 200),
        isTimeout: error.message.includes("timeout"),
        isTabError: error.message.includes("tab"),
        isConnectionError: error.message.includes("connection"),
      });

      return {
        success: false,
        error: error.message,
        tabId: tabId,
        timestamp: Date.now(),
      };
    }
  }

  /**
   * 簡単なUI要素チェック（ファーストウィン戦略用）
   */
  static async quickUICheck(tabId, aiType) {
    const result = await this.sendSafeMessage(
      tabId,
      {
        action: "CHECK_UI_ELEMENTS",
        aiType: aiType,
        quickCheck: true, // クイックチェックフラグ
      },
      5000,
    ); // 短いタイムアウト

    if (result.success && result.data) {
      // 少なくとも1つのUI要素があれば成功とみなす
      const hasAnyUI =
        result.data.textInput ||
        result.data.modelDisplay ||
        result.data.functionDisplay;
      return hasAnyUI;
    }
    return false;
  }

  /**
   * キューの状態確認（デバッグ用）
   */
  static getQueueStatus() {
    return {
      activeRequests: this.sendMessageQueue.size,
      tabIds: Array.from(this.sendMessageQueue.keys()),
    };
  }
}

// ========================================
// 成功済みウィンドウ管理ロジック（unused/window-service.jsから移植）
// ========================================

/**
 * 安定したウィンドウ管理クラス - 成功実績あり
 */
class StableWindowManager {
  // アクティブなウィンドウを管理するMap
  static activeWindows = new Map();

  // ウィンドウポジション管理 (0-3の位置を管理)
  static windowPositions = new Map();

  // ポジションごとのウィンドウID管理
  static positionToWindow = new Map();

  // 予期しないウィンドウ閉鎖を監視するフラグ
  static isMonitoringEnabled = false;

  /**
   * chrome.windows.onRemovedイベントリスナーを初期化
   */
  static initializeWindowMonitoring() {
    if (this.isMonitoringEnabled) {
      return; // 既に初期化済み
    }

    if (
      typeof chrome !== "undefined" &&
      chrome.windows &&
      chrome.windows.onRemoved
    ) {
      chrome.windows.onRemoved.addListener((windowId) => {
        this.handleUnexpectedWindowClosure(windowId);
      });

      this.isMonitoringEnabled = true;
      log.debug("🔍 [StableWindowManager] ウィンドウ閉鎖監視を開始しました");
    }
  }

  /**
   * 予期しないウィンドウ閉鎖をハンドリング
   */
  static handleUnexpectedWindowClosure(windowId) {
    const windowInfo = this.activeWindows.get(windowId);

    if (windowInfo) {
      log.error(`🚨 [StableWindowManager] 予期しないウィンドウ閉鎖を検出:`, {
        windowId,
        aiType: windowInfo.aiType || "不明",
        position: this.positionToWindow.get(windowId),
        timestamp: new Date().toISOString(),
      });

      // クリーンアップ処理
      this.cleanupClosedWindow(windowId);
    }
  }

  /**
   * 閉鎖されたウィンドウのクリーンアップ
   */
  static cleanupClosedWindow(windowId) {
    // activeWindowsから削除
    this.activeWindows.delete(windowId);

    // positionToWindowから該当エントリを削除
    for (const [position, wId] of this.positionToWindow.entries()) {
      if (wId === windowId) {
        this.positionToWindow.delete(position);
        break;
      }
    }

    // windowPositionsから該当エントリを削除
    for (const [position, wId] of this.windowPositions.entries()) {
      if (wId === windowId) {
        this.windowPositions.delete(position);
        break;
      }
    }
  }

  /**
   * 安定したウィンドウ作成（リトライ機能付き）
   */
  static async createStableWindow(url, position, options = {}) {
    const windowOptions = {
      url: url,
      type: "popup",
      focused: true,
      ...options,
    };

    return await executeSimpleRetry({
      action: async () => {
        // 既存ウィンドウが存在する場合は削除
        if (this.windowPositions.has(position)) {
          const existingWindowId = this.windowPositions.get(position);
          try {
            await chrome.windows.remove(existingWindowId);
            this.cleanupClosedWindow(existingWindowId);
          } catch (error) {
            log.warn(
              `[StableWindowManager] 既存ウィンドウ削除エラー:`,
              error.message,
            );
          }
        }

        // 新しいウィンドウを作成
        const window = await chrome.windows.create(windowOptions);

        // ウィンドウ情報を登録
        const windowInfo = {
          url: url,
          aiType: options.aiType || "unknown",
          position: position,
          createdAt: Date.now(),
          tabId:
            window.tabs && window.tabs.length > 0 ? window.tabs[0].id : null,
        };

        this.activeWindows.set(window.id, windowInfo);
        this.windowPositions.set(position, window.id);
        this.positionToWindow.set(position, window.id);

        return window;
      },
      isSuccess: (result) =>
        result && result.id && result.tabs && result.tabs.length > 0,
      maxRetries: 10,
      interval: 1000,
      actionName: `ウィンドウ作成 (${url})`,
      context: { url, position, options },
    });
  }
}

class StepIntegratedWindowService {
  static windowPositions = new Map(); // position -> windowId
  static unifiedManager = new UnifiedWindowManager(); // 統一管理インスタンス
  static stableManager = StableWindowManager; // 安定管理インスタンス

  /**
   * スクリーン情報を取得
   */
  static async getScreenInfo() {
    try {
      const displays = await chrome.system.display.getInfo();
      const primaryDisplay = displays.find((d) => d.isPrimary) || displays[0];

      return {
        width: primaryDisplay.workArea.width,
        height: primaryDisplay.workArea.height,
        left: primaryDisplay.workArea.left,
        top: primaryDisplay.workArea.top,
        displays: displays,
      };
    } catch (error) {
      log.warn(
        "[StepIntegratedWindowService] スクリーン情報取得エラー、フォールバック使用:",
        error,
      );
      return {
        width: 1440,
        height: 900,
        left: 0,
        top: 0,
        displays: [],
      };
    }
  }

  /**
   * ウィンドウ位置を計算
   */
  static calculateWindowPosition(position, screenInfo) {
    const baseWidth = Math.floor(screenInfo.width * 0.35);
    const baseHeight = Math.floor(screenInfo.height * 0.8);
    const offsetLeft = screenInfo.left;
    const offsetTop = screenInfo.top;

    const positions = {
      0: {
        // 左上
        left: offsetLeft,
        top: offsetTop,
        width: baseWidth,
        height: baseHeight,
      },
      1: {
        // 右上
        left: offsetLeft + screenInfo.width - baseWidth,
        top: offsetTop,
        width: baseWidth,
        height: baseHeight,
      },
      2: {
        // 左下
        left: offsetLeft,
        top: offsetTop + screenInfo.height - baseHeight,
        width: baseWidth,
        height: baseHeight,
      },
      3: {
        // 右下
        left: offsetLeft + screenInfo.width - baseWidth,
        top: offsetTop + screenInfo.height - baseHeight,
        width: baseWidth,
        height: baseHeight,
      },
    };

    return positions[position] || positions[0];
  }

  /**
   * ポジションを指定してウィンドウを作成
   */
  static async createWindowWithPosition(url, position, options = {}) {
    try {
      log.debug(
        `🪟 [StepIntegratedWindowService] ウィンドウ作成開始: position=${position}, url=${url}`,
      );

      // 既存ウィンドウが使用中の場合は閉じる
      if (this.windowPositions.has(position)) {
        const existingWindowId = this.windowPositions.get(position);
        log.debug(
          `🔄 [StepIntegratedWindowService] position=${position}の既存ウィンドウ${existingWindowId}を閉じます`,
        );

        try {
          await chrome.windows.remove(existingWindowId);
          this.windowPositions.delete(position);
          await new Promise((resolve) => setTimeout(resolve, 500)); // 削除完了待ち
        } catch (error) {
          log.warn("既存ウィンドウ削除エラー（続行）:", error);
        }
      }

      // スクリーン情報取得と位置計算
      const screenInfo = await this.getScreenInfo();
      const windowPosition = this.calculateWindowPosition(position, screenInfo);

      // ウィンドウ作成オプション
      const createOptions = {
        url: url,
        type: options.type || "popup",
        left: windowPosition.left,
        top: windowPosition.top,
        width: windowPosition.width,
        height: windowPosition.height,
        focused: false,
      };

      log.debug(
        `📐 [StepIntegratedWindowService] ウィンドウ作成オプション:`,
        createOptions,
      );

      // ウィンドウ作成
      const window = await chrome.windows.create(createOptions);

      // 位置を記録
      this.windowPositions.set(position, window.id);

      log.debug(
        `✅ [StepIntegratedWindowService] ウィンドウ作成完了: windowId=${window.id}, position=${position}`,
      );

      return {
        id: window.id,
        tabs: window.tabs,
        ...window,
      };
    } catch (error) {
      log.error(
        `❌ [StepIntegratedWindowService] ウィンドウ作成エラー:`,
        error,
      );
      throw error;
    }
  }

  /**
   * ウィンドウを閉じる
   */
  static async closeWindow(windowId) {
    try {
      await chrome.windows.remove(windowId);

      // windowPositionsから削除
      for (const [position, id] of this.windowPositions.entries()) {
        if (id === windowId) {
          this.windowPositions.delete(position);
          break;
        }
      }

      log.debug(
        `✅ [StepIntegratedWindowService] ウィンドウ閉じる完了: windowId=${windowId}`,
      );
    } catch (error) {
      log.warn(
        `⚠️ [StepIntegratedWindowService] ウィンドウ閉じるエラー: windowId=${windowId}`,
        error,
      );
    }
  }
}

/**
 * Step内統合版 AIUrl管理（StreamProcessorV2の機能を内部実装）
 */
class StepIntegratedAiUrlManager {
  static getUrl(aiType) {
    const urls = {
      Claude: "https://claude.ai/",
      claude: "https://claude.ai/",
      ChatGPT: "https://chatgpt.com/",
      chatgpt: "https://chatgpt.com/",
      Gemini: "https://gemini.google.com/",
      gemini: "https://gemini.google.com/",
      Genspark: "https://www.genspark.ai/",
      genspark: "https://www.genspark.ai/",
    };

    const url =
      urls[aiType] || urls[aiType?.toLowerCase()] || "https://claude.ai/";
    log.debug(`🔗 [StepIntegratedAiUrlManager] URL取得: ${aiType} -> ${url}`);
    return url;
  }
}

// columnToIndex関数の定義確認・フォールバック作成
if (typeof columnToIndex === "undefined") {
  // シンプルなフォールバック関数を定義
  window.columnToIndex = function (column) {
    if (typeof column !== "string" || column.length === 0) {
      return -1;
    }
    let index = 0;
    for (let i = 0; i < column.length; i++) {
      index = index * 26 + (column.charCodeAt(i) - "A".charCodeAt(0) + 1);
    }
    return index - 1;
  };

  window.indexToColumn = function (index) {
    let column = "";
    let num = index;
    while (num >= 0) {
      column = String.fromCharCode(65 + (num % 26)) + column;
      num = Math.floor(num / 26) - 1;
      if (num < 0) break;
    }
    return column;
  };

  // グローバルスコープに関数を設定
  globalThis.columnToIndex = window.columnToIndex;
  globalThis.indexToColumn = window.indexToColumn;
}

// ========================================
// 自動列追加機能（spreadsheet-auto-setup.jsから移植）
// ========================================

/**
 * 自動列追加の実行
 * @param {string} spreadsheetId - スプレッドシートID
 * @param {string} gid - シートID
 * @param {Array} spreadsheetData - スプレッドシートデータ
 * @param {Object} specialRows - 特殊行情報
 * @returns {Object} 実行結果
 */
async function executeAutoColumnSetup(
  spreadsheetId,
  gid,
  spreadsheetData,
  specialRows,
) {
  const { menuRow, aiRow } = specialRows;
  const menuRowIndex = menuRow - 1;
  const aiRowIndex = aiRow - 1;
  const sheetId = parseInt(gid || "0");
  const addedColumns = [];

  if (!spreadsheetData[menuRowIndex] || !spreadsheetData[aiRowIndex]) {
    log.debug("[step3-tasklist] メニュー行またはAI行が見つかりません");
    return { hasAdditions: false, addedColumns: [] };
  }

  try {
    // プロンプト列グループを検索
    const promptGroups = findPromptGroups(
      spreadsheetData[menuRowIndex],
      spreadsheetData[aiRowIndex],
    );

    if (promptGroups.length === 0) {
      log.debug("[step3-tasklist] プロンプト列が見つかりません");
      return { hasAdditions: false, addedColumns: [] };
    }

    // 右から左に処理（インデックスずれ防止）
    const sortedGroups = [...promptGroups].sort(
      (a, b) => b.firstIndex - a.firstIndex,
    );

    for (const group of sortedGroups) {
      const is3TypeAI = group.aiType.includes(
        "3種類（ChatGPT・Gemini・Claude）",
      );

      if (is3TypeAI) {
        // 3種類AI用の特別処理
        const result = await setup3TypeAIColumns(
          spreadsheetId,
          sheetId,
          group,
          spreadsheetData,
          menuRowIndex,
        );
        addedColumns.push(...(result.addedColumns || []));
      } else {
        // 通常AI用の処理
        const result = await setupBasicColumns(
          spreadsheetId,
          sheetId,
          group,
          spreadsheetData,
          menuRowIndex,
        );
        addedColumns.push(...(result.addedColumns || []));
      }
    }

    return {
      hasAdditions: addedColumns.length > 0,
      addedColumns: addedColumns,
    };
  } catch (error) {
    log.error("[step3-tasklist] 自動列追加エラー:", error);
    return { hasAdditions: false, addedColumns: [], error: error.message };
  }
}

/**
 * プロンプト列グループを検索
 * @param {Array} menuRow - メニュー行
 * @param {Array} aiRow - AI行
 * @returns {Array} プロンプトグループ配列
 */
function findPromptGroups(menuRow, aiRow) {
  const promptGroups = [];
  const maxLength = Math.max(menuRow.length, aiRow.length);

  for (let colIndex = 0; colIndex < maxLength; colIndex++) {
    const cellValue = menuRow[colIndex];
    if (cellValue) {
      const trimmedValue = cellValue.toString().trim();

      // メインのプロンプト列を見つけた場合
      if (trimmedValue === "プロンプト") {
        let lastPromptIndex = colIndex;

        // 連続するプロンプト2〜5を探す
        for (let i = 2; i <= 5; i++) {
          const nextIndex = lastPromptIndex + 1;
          if (nextIndex < maxLength) {
            const nextValue = menuRow[nextIndex];
            if (nextValue && nextValue.toString().trim() === `プロンプト${i}`) {
              lastPromptIndex = nextIndex;
            } else {
              break;
            }
          }
        }

        promptGroups.push({
          firstIndex: colIndex,
          lastIndex: lastPromptIndex,
          column: indexToColumn(colIndex),
          aiType: (aiRow[colIndex] || "").toString(),
        });

        // 次の検索はグループの最後の次から
        colIndex = lastPromptIndex;
      }
    }
  }

  return promptGroups;
}

/**
 * 通常AI用の列追加
 * @param {string} spreadsheetId - スプレッドシートID
 * @param {number} sheetId - シートID
 * @param {Object} promptGroup - プロンプトグループ情報
 * @param {Array} spreadsheetData - スプレッドシートデータ
 * @param {number} menuRowIndex - メニュー行インデックス
 * @returns {Object} 追加結果
 */
async function setupBasicColumns(
  spreadsheetId,
  sheetId,
  promptGroup,
  spreadsheetData,
  menuRowIndex,
) {
  const menuRow = spreadsheetData[menuRowIndex];
  const addedColumns = [];
  const actualIndex = promptGroup.firstIndex;

  // 左にログ列がなければ追加
  const leftIndex = actualIndex - 1;
  const leftValue =
    leftIndex >= 0 ? (menuRow[leftIndex] || "").toString().trim() : "";

  if (leftValue !== "ログ") {
    const success = await insertColumnAndSetHeader(
      spreadsheetId,
      sheetId,
      actualIndex,
      "ログ",
      menuRowIndex,
    );
    if (success) {
      addedColumns.push({
        type: "basic",
        column: indexToColumn(actualIndex),
        header: "ログ",
      });
    }
  }

  // 回答列の配置位置を決定（複数プロンプトの場合は最後のプロンプトの後）
  const answerPosition = promptGroup.lastIndex + 1;
  const answerValue =
    answerPosition < menuRow.length
      ? (menuRow[answerPosition] || "").toString().trim()
      : "";

  if (answerPosition >= menuRow.length || answerValue !== "回答") {
    const success = await insertColumnAndSetHeader(
      spreadsheetId,
      sheetId,
      answerPosition,
      "回答",
      menuRowIndex,
    );
    if (success) {
      addedColumns.push({
        type: "basic",
        column: indexToColumn(answerPosition),
        header: "回答",
      });
    }
  }

  return { addedColumns };
}

/**
 * 3種類AI用の特別な列追加
 * @param {string} spreadsheetId - スプレッドシートID
 * @param {number} sheetId - シートID
 * @param {Object} promptGroup - プロンプトグループ情報
 * @param {Array} spreadsheetData - スプレッドシートデータ
 * @param {number} menuRowIndex - メニュー行インデックス
 * @returns {Object} 追加結果
 */
async function setup3TypeAIColumns(
  spreadsheetId,
  sheetId,
  promptGroup,
  spreadsheetData,
  menuRowIndex,
) {
  const menuRow = spreadsheetData[menuRowIndex];
  const addedColumns = [];
  let promptIndex = promptGroup.firstIndex;
  let lastPromptIndex = promptGroup.lastIndex;

  // 1. 左にログ列がなければ追加
  const leftIndex = promptIndex - 1;
  const leftValue =
    leftIndex >= 0 ? (menuRow[leftIndex] || "").toString().trim() : "";

  if (leftValue !== "ログ") {
    const success = await insertColumnAndSetHeader(
      spreadsheetId,
      sheetId,
      promptIndex,
      "ログ",
      menuRowIndex,
    );
    if (success) {
      addedColumns.push({
        type: "3type",
        column: indexToColumn(promptIndex),
        header: "ログ",
      });
      // インデックスを調整
      promptIndex++;
      lastPromptIndex++;
    }
  }

  // 2. 既存の3つの回答列が正しく存在するかチェック
  const answerHeaders = ["ChatGPT回答", "Claude回答", "Gemini回答"];
  let hasAllCorrectHeaders = true;

  for (let i = 0; i < answerHeaders.length; i++) {
    const checkIndex = lastPromptIndex + 1 + i;
    const currentValue =
      checkIndex < menuRow.length
        ? (menuRow[checkIndex] || "").toString().trim()
        : "";

    if (currentValue !== answerHeaders[i]) {
      hasAllCorrectHeaders = false;
      break;
    }
  }

  // 既に正しい3つの回答列が存在する場合は何もしない
  if (hasAllCorrectHeaders) {
    return { addedColumns };
  }

  // 3. 既存の「回答」列を削除（あれば）
  const rightIndex = lastPromptIndex + 1;
  const rightValue =
    rightIndex < menuRow.length
      ? (menuRow[rightIndex] || "").toString().trim()
      : "";

  if (rightValue === "回答") {
    await deleteColumn(spreadsheetId, sheetId, rightIndex);
  }

  // 4. 3つの回答列を追加
  for (let i = 0; i < answerHeaders.length; i++) {
    const insertPosition = lastPromptIndex + 1 + i;
    const success = await insertColumnAndSetHeader(
      spreadsheetId,
      sheetId,
      insertPosition,
      answerHeaders[i],
      menuRowIndex,
    );
    if (success) {
      addedColumns.push({
        type: "3type",
        column: indexToColumn(insertPosition),
        header: answerHeaders[i],
      });
    }
  }

  return { addedColumns };
}

/**
 * 列を挿入してヘッダーを設定
 * @param {string} spreadsheetId - スプレッドシートID
 * @param {number} sheetId - シートID
 * @param {number} columnIndex - 挿入位置
 * @param {string} headerText - ヘッダーテキスト
 * @param {number} headerRow - ヘッダー行インデックス
 * @returns {boolean} 成功フラグ
 */
async function insertColumnAndSetHeader(
  spreadsheetId,
  sheetId,
  columnIndex,
  headerText,
  headerRow,
) {
  try {
    // バッチ更新リクエストを準備
    const requests = [
      {
        insertDimension: {
          range: {
            sheetId: sheetId,
            dimension: "COLUMNS",
            startIndex: columnIndex,
            endIndex: columnIndex + 1,
          },
          inheritFromBefore: false,
        },
      },
      {
        updateCells: {
          range: {
            sheetId: sheetId,
            startRowIndex: headerRow,
            endRowIndex: headerRow + 1,
            startColumnIndex: columnIndex,
            endColumnIndex: columnIndex + 1,
          },
          rows: [
            {
              values: [
                {
                  userEnteredValue: { stringValue: headerText },
                },
              ],
            },
          ],
          fields: "userEnteredValue",
        },
      },
    ];

    // バッチ更新を実行
    const batchUpdateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`;
    const token = window.globalState?.authToken || "";

    const response = await window.fetchWithTokenRefresh(batchUpdateUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ requests }),
    });

    if (response.ok) {
      log.debug(
        `[step3-tasklist] 列追加成功: ${indexToColumn(columnIndex)}列 (${headerText})`,
      );
      return true;
    } else {
      log.error(
        `[step3-tasklist] 列追加失敗: ${headerText}`,
        await response.text(),
      );
      return false;
    }
  } catch (error) {
    log.error(`[step3-tasklist] 列追加エラー: ${headerText}`, error);
    return false;
  }
}

/**
 * 列を削除
 * @param {string} spreadsheetId - スプレッドシートID
 * @param {number} sheetId - シートID
 * @param {number} columnIndex - 削除する列のインデックス
 * @returns {boolean} 成功フラグ
 */
async function deleteColumn(spreadsheetId, sheetId, columnIndex) {
  try {
    const requests = [
      {
        deleteDimension: {
          range: {
            sheetId: sheetId,
            dimension: "COLUMNS",
            startIndex: columnIndex,
            endIndex: columnIndex + 1,
          },
        },
      },
    ];

    const batchUpdateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`;
    const token = window.globalState?.authToken || "";

    const response = await window.fetchWithTokenRefresh(batchUpdateUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ requests }),
    });

    if (response.ok) {
      log.debug(`[step3-tasklist] 列削除成功: ${indexToColumn(columnIndex)}列`);
      return true;
    } else {
      log.error("[step3-tasklist] 列削除失敗", await response.text());
      return false;
    }
  } catch (error) {
    log.error("[step3-tasklist] 列削除エラー", error);
    return false;
  }
}

// 【簡素化】A1記法変換は基本不要（文字列結合を使用）
// 必要最小限のユーティリティのみ保持
/**
 * 【簡素化】回答セル位置の取得（シンプル版）
 * @param {Object} taskGroup - タスクグループ
 * @param {string} aiType - AIタイプ
 * @param {number} row - 行番号
 * @returns {string} セル参照（例: "C9"）
 */
function getAnswerCell(taskGroup, aiType, row) {
  try {
    const normalizedAI = aiType.toLowerCase();
    let column;

    if (taskGroup.groupType === "3種類AI") {
      column = taskGroup.columns.answer[normalizedAI] || "C";
    } else {
      column = taskGroup.columns.answer.primary || "C";
    }

    return getSimpleCell(column, row);
  } catch (error) {
    log.error("[step3-tasklist.js] getAnswerCell エラー:", error);
    return getSimpleCell("C", row); // デフォルト
  }
}

/**
 * 【簡素化】シンプルなセル参照生成
 * @param {string} column - 列名（A, B, C...）
 * @param {number} row - 行番号
 * @returns {string} セル参照（例: "A1", "B5"）
 */
function getSimpleCell(column, row) {
  return `${column}${row}`;
}

/**
 * 【簡素化】シンプルな範囲生成
 * @param {string} startColumn - 開始列名
 * @param {number} startRow - 開始行
 * @param {string} endColumn - 終了列名
 * @param {number} endRow - 終了行
 * @returns {string} 範囲（例: "A1:C10"）
 */
function getSimpleRange(startColumn, startRow, endColumn, endRow) {
  return `${startColumn}${startRow}:${endColumn}${endRow}`;
}

/**
 * スプレッドシートURLからIDとGIDを抽出
 * @param {string} url - スプレッドシートのURL
 * @returns {{spreadsheetId: string|null, gid: string}} IDとGID
 */
function parseSpreadsheetUrl(url) {
  const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
  const gidMatch = url.match(/[#&]gid=([0-9]+)/);
  return {
    spreadsheetId: match ? match[1] : null,
    gid: gidMatch ? gidMatch[1] : "0",
  };
}

// ========================================
// タスク生成ロジック（stream-processor-v2.jsから抽出）
// ========================================

/**
 * タスクグループからタスクリストを生成（Google Services統合版）
 * @param {Object} taskGroup - タスクグループ情報
 * @param {Array} spreadsheetData - スプレッドシートの全データ
 * @param {Object} specialRows - 特殊行の情報（メニュー行、AI行、モデル行など）
 * @param {number} dataStartRow - データ開始行
 * @param {Object} options - オプション設定
 * @returns {Array} タスクリスト
 */
async function generateTaskList(
  taskGroup,
  spreadsheetData,
  specialRows,
  dataStartRow,
  options = {},
) {
  try {
    // 引数検証
    if (!taskGroup) {
      throw new Error("taskGroupが未定義です");
    }
    if (!taskGroup.columns) {
      throw new Error("taskGroup.columnsが未定義です");
    }

    // 必要に応じて自動列追加を実行
    if (options.enableAutoColumnSetup && options.spreadsheetId) {
      log.debug("[step3-tasklist] 自動列追加を実行中...");
      const setupResult = await executeAutoColumnSetup(
        options.spreadsheetId,
        options.gid,
        spreadsheetData,
        specialRows,
      );

      if (setupResult.hasAdditions) {
        log.debug(
          `[step3-tasklist] ${setupResult.addedColumns.length}列を追加しました`,
        );
        // 列追加後はスプレッドシートデータを再読み込み
        if (setupResult.addedColumns && setupResult.addedColumns.length > 0) {
          // Google Sheets APIから最新データを取得
          const token = window.globalState?.authToken || "";
          const range = "A1:ZZ1000"; // 十分な範囲を指定
          const apiUrl = `https://sheets.googleapis.com/v4/spreadsheets/${options.spreadsheetId}/values/${range}`;

          try {
            const response = await window.fetchWithTokenRefresh(apiUrl, {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            });

            if (response.ok) {
              const data = await response.json();
              if (data.values) {
                // spreadsheetDataを更新（参照渡しで更新）
                spreadsheetData.splice(
                  0,
                  spreadsheetData.length,
                  ...data.values,
                );
                log.debug(
                  "[step3-tasklist] スプレッドシートデータを再読み込みしました",
                );
              }
            }
          } catch (error) {
            log.error("[step3-tasklist] データ再読み込みエラー:", error);
          }
        }
      }
    }
    const tasks = [];
    let tasksCreated = 0; // タスク作成数を追跡
    const { menuRow, aiRow, modelRow, functionRow } = specialRows;

    // ログバッファを初期化
    const logBuffer = [];
    let answerLogCount = 0;
    const MAX_ANSWER_LOGS = 3; // 詳細表示する最大数

    const addLog = (message, data) => {
      // 「既に回答あり」ログの重複抑制
      if (message.includes("既に回答あり")) {
        answerLogCount++;
        if (answerLogCount <= MAX_ANSWER_LOGS) {
          // 最初の数個だけ詳細出力
          if (data) {
            logBuffer.push(`${message}: ${JSON.stringify(data)}`);
            log.debug(`[step3-tasklist] ${message}:`, data);
          } else {
            logBuffer.push(message);
            log.debug(`[step3-tasklist] ${message}`);
          }
        }
        return;
      }

      // 通常のログ処理
      if (data) {
        logBuffer.push(`${message}: ${JSON.stringify(data)}`);
        log.debug(`[step3-tasklist] ${message}:`, data);
      } else {
        logBuffer.push(message);
        log.debug(`[step3-tasklist] ${message}`);
      }
    };

    const promptColumns = taskGroup.columns.prompts || [];
    // 【統一修正】全てオブジェクト形式なのでObject.valuesを直接使用
    const answerColumns = taskGroup.columns.answer
      ? Object.values(taskGroup.columns.answer)
      : [];

    // プロンプトがある最終行を検索
    let lastPromptRow = dataStartRow;

    for (let row = dataStartRow; row < spreadsheetData.length; row++) {
      let hasPrompt = false;
      for (const col of promptColumns) {
        // デバッグログは削除（過剰なログ出力を防ぐ）
        // addLog(`[CRITICAL-DEBUG] columnToIndex呼び出し前 (最終行検索 row=${row})`, {
        //   col: col,
        //   colType: typeof col,
        //   colValue: col
        // });

        const colIndex = columnToIndex(col);
        if (spreadsheetData[row] && spreadsheetData[row][colIndex]) {
          hasPrompt = true;
          lastPromptRow = row + 1; // 1ベースに変換
          break;
        }
      }
    }

    // 3-2: タスク生成の除外処理
    const validTasks = [];
    const skippedRows = []; // スキップした行を記録
    const debugLogs = []; // デバッグログを収集

    for (let row = dataStartRow; row <= lastPromptRow; row++) {
      const rowData = spreadsheetData[row - 1]; // 0ベースインデックス

      if (!rowData) continue;

      // 🆕 行制御チェック（最初にチェックして不要な処理を避ける）
      if (
        options.applyRowControl &&
        options.rowControls &&
        options.rowControls.length > 0
      ) {
        if (!shouldProcessRow(row, options.rowControls)) {
          skippedRows.push(row); // スキップした行を記録
          continue;
        }
      }

      // プロンプトの取得と結合
      let prompts = [];
      for (const col of promptColumns) {
        const colIndex = columnToIndex(col);
        if (rowData && colIndex < rowData.length) {
          const prompt = rowData[colIndex];
          if (prompt) {
            prompts.push(prompt);
          }
        }
      }

      if (prompts.length === 0) continue; // プロンプトがない行はスキップ

      // 回答済みチェック（簡潔版）
      let hasAnswer = false;
      for (const col of answerColumns) {
        const colIndex = columnToIndex(col);
        if (rowData && colIndex < rowData.length && rowData[colIndex]?.trim()) {
          hasAnswer = true;
          addLog(`[TaskList] ${row}行目: 既に回答あり (${col}列)`, {
            column: col,
            value: rowData[colIndex].substring(0, 50) + "...",
          });
          break;
        }
      }

      // 回答済みチェック（統合ログ）
      if (hasAnswer && !options.forceReprocess) {
        skippedRows.push(row);
        continue; // ログは既に出力済み
      }

      // 3-2-1-2: 追加の除外条件（拡張可能）
      if (options.customSkipConditions) {
        let shouldSkip = false;
        for (const condition of options.customSkipConditions) {
          if (condition(rowData, row)) {
            addLog(
              `[TaskList] [Step3-2] ${row}行目: カスタム条件によりスキップ`,
            );
            shouldSkip = true;
            break;
          }
        }
        if (shouldSkip) continue;
      }

      // タスクグループタイプに応じて処理を分岐
      if (
        taskGroup.groupType === "通常処理" ||
        taskGroup.groupType === "3種類AI"
      ) {
        // AIごとにタスクを生成
        let aiRowData = null;
        if (spreadsheetData && aiRow > 0 && aiRow <= spreadsheetData.length) {
          aiRowData = spreadsheetData[aiRow - 1];
        } else {
        }

        let aiTypes;
        if (taskGroup.groupType === "3種類AI") {
          // 3種類AIの場合は特殊なaiTypeを設定
          aiTypes = ["3種類（ChatGPT・Gemini・Claude）"];
        } else {
          // promptColumns[0]が存在するか確認
          if (promptColumns && promptColumns.length > 0 && promptColumns[0]) {
            const colIndex = columnToIndex(promptColumns[0]);

            if (colIndex >= 0) {
              const rawAiValue = aiRowData?.[colIndex];
              const aiValue = rawAiValue || "ChatGPT";
              aiTypes = [aiValue];
            } else {
              aiTypes = ["ChatGPT"];
            }
          } else {
            aiTypes = ["ChatGPT"];
          }
        }

        for (let aiType of aiTypes) {
          const originalAiType = aiType;

          // AIタイプの正規化（singleをClaudeに変換）
          if (aiType === "single" || !aiType) {
            aiType = "Claude";
          }

          // 【シンプル化】文字列結合でセル位置計算
          const answerCell = getAnswerCell(taskGroup, aiType, row);

          // WindowControllerからtabID/windowIDを取得
          // aiTypeを正規化（大文字小文字の不一致を防ぐ）
          const normalizedAiType = aiType?.toLowerCase()?.trim() || "claude";
          let windowInfo = null;
          if (
            typeof window !== "undefined" &&
            window.windowController?.openedWindows
          ) {
            // 新しい保存形式に対応: ${normalizedAiType}_${position} から該当するウィンドウを収集
            const allWindows = [];
            for (const [
              key,
              value,
            ] of window.windowController.openedWindows.entries()) {
              if (key.startsWith(normalizedAiType + "_")) {
                allWindows.push(value);
              }
            }

            if (allWindows.length > 0) {
              // タスクのインデックスに基づいてウィンドウを循環選択
              const taskIndex = tasksCreated; // 現在までに作成されたタスク数を使用
              windowInfo = allWindows[taskIndex % allWindows.length];
            }

            // windowInfoの構造を正規化してtabId/windowIdを確実に設定
            if (windowInfo) {
              windowInfo = {
                tabId: windowInfo.tabId || windowInfo.id,
                windowId: windowInfo.windowId || windowInfo.id,
                url: windowInfo.url,
                position: windowInfo.position,
                aiType: normalizedAiType,
              };
            }
            // DEBUG: WindowInfo取得
          } else {
            // WindowController利用不可
          }

          // windowInfoが取得できない場合の詳細ログ
          if (!windowInfo) {
            // WARNING: WindowInfo取得失敗
          }

          // Step4との互換性のため、aiTypeフィールドも追加
          const task = {
            taskId: `task_${taskGroup.groupNumber}_${row}_${Date.now()}`,
            id: `task_${taskGroup.groupNumber}_${row}_${Date.now()}`, // Step4互換
            groupNumber: taskGroup.groupNumber,
            groupType: taskGroup.groupType,
            row: row,
            column: promptColumns[0],
            prompt: `現在${promptColumns.map((col) => `${col}${row}`).join(",")}の作業中です。\n\n${prompts.join("\n\n")}`,
            ai: aiType, // 🔧 [FIX] 変換後のaiTypeを使用
            aiType:
              taskGroup.groupType === "3種類AI"
                ? "3種類（ChatGPT・Gemini・Claude）"
                : aiType, // Step4互換 - lowercase変換削除
            model:
              spreadsheetData[modelRow - 1] && promptColumns[0]
                ? spreadsheetData[modelRow - 1][columnToIndex(promptColumns[0])]
                : "",
            function:
              spreadsheetData[functionRow - 1] && promptColumns[0]
                ? spreadsheetData[functionRow - 1][
                    columnToIndex(promptColumns[0])
                  ]
                : "",
            logCell: `${taskGroup.columns.log}${row}`,
            promptCells: promptColumns.map((col) => `${col}${row}`),
            answerCell: answerCell,
            tabId: windowInfo?.tabId, // 🆕 タブID追加
            windowId: windowInfo?.windowId, // 🆕 ウィンドウID追加
            cellInfo: {
              // Step4互換: cellInfo構造追加
              row: row,
              column: answerCell
                ? answerCell.match(/^([A-Z]+)/)?.[1]
                : promptColumns[0],
              columnIndex: answerCell
                ? columnToIndex(answerCell.match(/^([A-Z]+)/)?.[1])
                : columnToIndex(promptColumns[0]),
            },
            ...parseSpreadsheetUrl(options.spreadsheetUrl || ""),
          };

          // デバッグログを収集（後でまとめて表示）
          debugLogs.push({
            row: row,
            taskId: task.taskId,
            answerCell: task.answerCell,
            logCell: task.logCell,
            aiType: task.ai,
            promptLength: task.prompt?.length || 0,
          });

          // DEBUG: タスク作成完了

          validTasks.push(task);
          tasksCreated++; // タスク作成数をインクリメント
        }
      } else {
        // 特殊タスク（レポート化、Genspark等）
        // WindowControllerからtabID/windowIDを取得
        let windowInfo = null;
        if (
          typeof window !== "undefined" &&
          window.windowController?.openedWindows
        ) {
          // groupTypeを正規化（大文字小文字の不一致を防ぐ）
          const normalizedGroupType =
            taskGroup.groupType?.toLowerCase()?.trim() || "report";
          const windowData =
            window.windowController.openedWindows.get(normalizedGroupType);
          if (Array.isArray(windowData) && windowData.length > 0) {
            // タスクのインデックスに基づいてウィンドウを循環選択
            windowInfo = windowData[tasksCreated % windowData.length];
          } else if (windowData && typeof windowData === "object") {
            // 単一オブジェクト形式の場合
            windowInfo = windowData;
          }

          // windowInfoの構造を正規化してtabId/windowIdを確実に設定
          if (windowInfo) {
            windowInfo = {
              tabId: windowInfo.tabId || windowInfo.id,
              windowId: windowInfo.windowId || windowInfo.id,
              url: windowInfo.url,
              position: windowInfo.position,
              aiType: normalizedGroupType,
            };
          }
        }

        const task = {
          taskId: `task_${taskGroup.groupNumber}_${row}_${Date.now()}`,
          id: `task_${taskGroup.groupNumber}_${row}_${Date.now()}`, // Step4互換
          groupNumber: taskGroup.groupNumber,
          groupType: taskGroup.groupType,
          row: row,
          // 特殊タスクは作業セルのみ使用するため、columnプロパティは不要
          prompt: `現在${taskGroup.columns.work ? `${taskGroup.columns.work}${row}` : `行${row}`}の作業中です。\n\n${prompts.join("\n\n")}`,
          ai: taskGroup.groupType,
          aiType: taskGroup.groupType, // Step4互換 - lowercase変換削除
          model: "",
          function: "",
          logCell: taskGroup.columns.log
            ? `${taskGroup.columns.log}${row}`
            : null,
          workCell: taskGroup.columns.work
            ? `${taskGroup.columns.work}${row}`
            : null,
          tabId: windowInfo?.tabId, // 🆕 タブID追加
          windowId: windowInfo?.windowId, // 🆕 ウィンドウID追加
          cellInfo: {
            // Step4互換: cellInfo構造追加
            row: row,
            column: taskGroup.columns.work || "A",
            columnIndex: taskGroup.columns.work
              ? columnToIndex(taskGroup.columns.work)
              : 0,
          },
          ...parseSpreadsheetUrl(options.spreadsheetUrl || ""),
        };

        // デバッグログを収集（後でまとめて表示）
        debugLogs.push({
          row: row,
          taskId: task.taskId,
          workCell: task.workCell,
          logCell: task.logCell,
          aiType: task.ai,
          promptLength: task.prompt?.length || 0,
        });

        log.debug(
          `[DEBUG] タスク追加: 行${row}, AI=${aiType}, hasAnswer状態不明`,
        );
        validTasks.push(task);
        tasksCreated++; // タスク作成数をインクリメント
      }
    }

    // まとめログを出力
    const totalRows = lastPromptRow - dataStartRow + 1;
    const processedRows = validTasks.length;
    const skippedCount = skippedRows.length;
    log.debug(
      `[TaskList] 処理結果サマリー: 全${totalRows}行中、処理対象${processedRows}行、スキップ${skippedCount}行`,
    );

    // 3-3: 3タスクずつのバッチ作成
    const batchSize = options.batchSize || 3;
    const batch = validTasks.slice(0, batchSize);

    // 「既に回答あり」ログのサマリー出力（統合済み上記に含む）

    return batch;
  } catch (error) {
    log.error(
      "[step3-tasklist.js] [Step 3-Error] generateTaskList内でエラー発生:",
      {
        エラー: error.message,
        スタック: error.stack,
        taskGroup: {
          番号: taskGroup?.groupNumber,
          列: taskGroup?.columns,
          タイプ: taskGroup?.groupType,
        },
        spreadsheetData長さ: spreadsheetData?.length,
        dataStartRow: dataStartRow,
      },
    );
    throw error;
  }
}

/**
 * 行制御の取得
 * @param {Array} data - スプレッドシートデータ
 * @returns {Array} 行制御情報
 */
function getRowControl(data) {
  const controls = [];

  for (let row = 0; row < data.length; row++) {
    const rowData = data[row];
    if (!rowData || !rowData[1]) continue;

    const cellValue = String(rowData[1] || "").trim();
    if (cellValue.includes("この行から処理")) {
      controls.push({
        type: "start",
        row: row + 1,
      });
    } else if (cellValue.includes("この行の処理後に停止")) {
      controls.push({
        type: "stop",
        row: row + 1,
      });
    } else if (cellValue.includes("この行のみ処理")) {
      controls.push({
        type: "only",
        row: row + 1,
      });
    }
  }

  return controls;
}

/**
 * 列制御の取得
 * @param {Array} data - スプレッドシートデータ
 * @param {number} controlRow - 列制御行
 * @returns {Array} 列制御情報
 */
function getColumnControl(data, controlRow) {
  const controls = [];

  try {
    if (!controlRow || !data[controlRow - 1]) {
      return controls;
    }

    const rowData = data[controlRow - 1];
    for (let col = 0; col < rowData.length; col++) {
      const cellValue = String(rowData[col] || "").trim();

      if (cellValue.includes("この列から処理")) {
        controls.push({
          type: "start",
          column: indexToColumn(col),
        });
      } else if (cellValue.includes("この列の処理後に停止")) {
        controls.push({
          type: "stop",
          column: indexToColumn(col),
        });
      } else if (cellValue.includes("この列のみ処理")) {
        controls.push({
          type: "only",
          column: indexToColumn(col),
        });
      }
    }

    return controls;
  } catch (error) {
    log.error(
      `[step3-tasklist.js] [Step 3-5-Error] ❌ 列制御取得エラー:`,
      error,
    );
    throw error;
  }
}

/**
 * 行が処理対象かどうかを判定
 * @param {number} rowNumber - 行番号
 * @param {Array} rowControls - 行制御情報
 * @returns {boolean} 処理対象かどうか
 */
function shouldProcessRow(rowNumber, rowControls) {
  if (rowControls.length === 0) return true;

  const onlyControls = rowControls.filter((c) => c.type === "only");
  if (onlyControls.length > 0) {
    return onlyControls.some((c) => c.row === rowNumber);
  }

  const startControl = rowControls.find((c) => c.type === "start");
  const stopControl = rowControls.find((c) => c.type === "stop");

  if (startControl && rowNumber < startControl.row) return false;
  if (stopControl && rowNumber > stopControl.row) return false;

  return true;
}

/**
 * タスクグループが処理対象かどうかを判定
 * @param {Object} group - タスクグループ
 * @param {Array} columnControls - 列制御情報
 * @returns {boolean} 処理対象かどうか
 */
function shouldProcessColumn(group, columnControls) {
  if (columnControls.length === 0) return true;

  const onlyControls = columnControls.filter((c) => c.type === "only");
  if (onlyControls.length > 0) {
    // タスクグループの列がonly制御に含まれているか確認
    return onlyControls.some((c) => {
      const prompts = group.columns.prompts || [];
      return prompts.includes(c.column);
    });
  }

  const startControl = columnControls.find((c) => c.type === "start");
  const stopControl = columnControls.find((c) => c.type === "stop");

  if (startControl || stopControl) {
    const prompts = group.columns.prompts || [];
    const firstColumn = prompts[0];
    if (!firstColumn) return true;

    const colIndex = columnToIndex(firstColumn);
    const startIndex = startControl ? columnToIndex(startControl.column) : -1;
    const stopIndex = stopControl
      ? columnToIndex(stopControl.column)
      : Infinity;

    return colIndex >= startIndex && colIndex <= stopIndex;
  }

  return true;
}

/**
 * Google Servicesの初期化
 * @returns {Promise<boolean>} 初期化成功フラグ
 */
async function initializeGoogleServices() {
  try {
    // Google Servicesが既にグローバルに存在するかチェック
    if (typeof window !== "undefined" && window.googleServices) {
      await window.googleServices.initialize();
      log.debug("[step3-tasklist] Google Services初期化完了");
      return true;
    }

    // フォールバック: 基本的な認証チェック
    if (typeof chrome !== "undefined" && chrome.identity) {
      return new Promise((resolve) => {
        chrome.identity.getAuthToken({ interactive: false }, (token) => {
          if (chrome.runtime.lastError) {
            log.warn(
              "[step3-tasklist] 認証トークン取得失敗:",
              chrome.runtime.lastError,
            );
            resolve(false);
          } else {
            log.debug(
              "[step3-tasklist] 認証トークン確認完了:",
              token ? "✓" : "✗",
            );
            resolve(true);
          }
        });
      });
    }

    log.warn("[step3-tasklist] Google Services初期化環境が不明");
    return false;
  } catch (error) {
    log.error("[step3-tasklist] Google Services初期化エラー:", error);
    return false;
  }
}

// モジュールエクスポート
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    generateTaskList,
    getRowControl,
    getColumnControl,
    shouldProcessRow,
    shouldProcessColumn,
    indexToColumn,
    columnToIndex,
    parseSpreadsheetUrl,
    initializeGoogleServices,
  };
}

// グローバル公開（Chrome拡張機能用）
if (typeof window !== "undefined") {
  try {
    // 関数の定義確認
    if (typeof initializeGoogleServices === "undefined") {
      log.error(
        "[step3-tasklist] initializeGoogleServices関数が定義されていません",
      );
    }

    window.Step3TaskList = {
      generateTaskList,
      getRowControl,
      getColumnControl,
      shouldProcessRow,
      shouldProcessColumn,
      indexToColumn,
      columnToIndex,
      parseSpreadsheetUrl,
      initializeGoogleServices:
        typeof initializeGoogleServices !== "undefined"
          ? initializeGoogleServices
          : function () {
              return Promise.resolve(false);
            },
    };

    // スクリプト読み込み完了をトラッキング
    if (window.scriptLoadTracker) {
      window.scriptLoadTracker.addScript("step3-tasklist.js");
      window.scriptLoadTracker.checkDependencies("step3-tasklist.js");
    }
  } catch (error) {
    log.error(
      "❌ [step3-tasklist.js] window.Step3TaskList初期化エラー:",
      error,
    );
    window.Step3TaskList = {
      generateTaskList: function () {
        throw new Error("Step3TaskList初期化エラーのため利用できません");
      },
      error: error.message,
    };

    // エラー時もスクリプト読み込みをトラッキング
    if (window.scriptLoadTracker) {
      window.scriptLoadTracker.addScript("step3-tasklist.js (ERROR)");
    }
  }
}

// ========================================
// ExecuteLogger configuration
// ========================================
const ExecuteLogger = {
  info: (...args) => log.debug(`[step4-tasklist.js]`, ...args),
  debug: (...args) => log.debug(`[step4-tasklist.js] [DEBUG]`, ...args),
  warn: (...args) => log.warn(`[step4-tasklist.js]`, ...args),
  error: (...args) => log.error(`[step4-tasklist.js]`, ...args),
};

// ========================================
// WindowController Class - Moved from step5-execute.js
// ========================================

class WindowController {
  constructor() {
    this.openedWindows = new Map(); // aiType -> windowInfo
    this.windowService = null; // WindowServiceへの参照
  }

  /**
   * AI種別を正規化する
   * @param {string} aiType - 正規化対象のAI種別
   * @returns {string} 正規化されたAI種別
   */
  normalizeAiType(aiType) {
    if (!aiType || typeof aiType !== "string") {
      return "claude";
    }
    const normalized = aiType.toLowerCase().trim();
    const mappings = {
      chatgpt: "chatgpt",
      claude: "claude",
      gemini: "gemini",
      genspark: "genspark",
      report: "report",
      single: "claude",
      "3種類（chatgpt・gemini・claude）": "3ai",
    };
    return mappings[normalized] || normalized;
  }

  /**
   * Step 4-1-1: WindowServiceの初期化
   */
  async initializeWindowService() {
    ExecuteLogger.info(
      "🪟 [WindowController] Step 4-1-1: WindowService初期化開始",
    );

    // WindowServiceの読み込みを少し待つ（ui.htmlの非同期読み込みを考慮）
    let retryCount = 0;
    const maxRetries = 10;

    while (retryCount < maxRetries) {
      // 🔍 [DEBUG] WindowService存在確認（詳細版）
      ExecuteLogger.info(
        `🔍 [DEBUG] WindowService詳細チェック (試行 ${retryCount + 1}/${maxRetries}):`,
        {
          typeofWindowService: typeof WindowService,
          windowWindowService: typeof window.WindowService,
          globalWindowService: typeof globalThis.WindowService,
          windowKeys: Object.keys(window).filter((k) => k.includes("Window")),
          windowServiceConstructor: window.WindowService?.constructor?.name,
          windowServicePrototype: window.WindowService?.prototype,
        },
      );

      // window.WindowServiceが存在すれば使用
      if (window.WindowService) {
        this.windowService = window.WindowService;
        // DEBUG: window.WindowService発見・使用
        ExecuteLogger.info(
          "✅ [WindowController] Step 4-1-1: WindowService初期化完了",
        );
        return;
      }

      // 短い待機
      if (retryCount < maxRetries - 1) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      retryCount++;
    }

    // WindowServiceがグローバルに存在するかチェック
    if (window.WindowService) {
      // 既存のwindow.WindowServiceを使用
      this.windowService = window.WindowService;
    } else if (typeof WindowService !== "undefined") {
      // グローバルのWindowServiceを使用
      this.windowService = WindowService;
    } else {
      // 内部のWindowControllerを使用（step5-execute.js内で完結）
      ExecuteLogger.debug("✅ [DEBUG] 内部WindowController機能を使用");
      this.windowService = null; // WindowControllerクラスを直接使用
    }

    ExecuteLogger.debug("✅ [DEBUG] WindowService設定完了", {
      hasWindowService: !!this.windowService,
      serviceType: typeof this.windowService,
      useInternalController: !this.windowService,
    });

    ExecuteLogger.info(
      "✅ [WindowController] Step 4-1-1: WindowService初期化完了",
    );
  }

  /**
   * Step 4-1-2: 4分割ウィンドウを開く
   * @param {Array} windowLayout - [{aiType, position}] 形式の配置情報
   */
  async openWindows(windowLayout) {
    ExecuteLogger.info(
      "🪟 [WindowController] Step 4-1-2: 4分割ウィンドウ開始",
      windowLayout,
    );

    ExecuteLogger.info("[WindowController] openWindows開始", {
      windowLayoutLength: windowLayout.length,
      layouts: windowLayout.map((l) => ({
        aiType: l.aiType,
        position: l.position,
      })),
      currentOpenedWindowsSize: this.openedWindows.size,
      currentOpenedWindowsEntries: Array.from(this.openedWindows.entries()),
      windowServiceExists: !!this.windowService,
    });

    // WindowService初期化確認
    if (!this.windowService) {
      await this.initializeWindowService();
    }

    // Promise.allを使用して全ウィンドウを同時に開く
    const windowPromises = windowLayout.map(async (layout) => {
      try {
        ExecuteLogger.info(
          `🪟 [Step 4-1-2-${layout.position}] ${layout.aiType}ウィンドウを${layout.position}番目に開く`,
        );

        // AI種別に応じたURLを取得
        const url = this.getAIUrl(layout.aiType);

        // 🔍 [DEBUG] WindowService呼び出し前の詳細チェック
        ExecuteLogger.info(`🔍 [DEBUG] ウィンドウ作成前チェック:`, {
          windowServiceExists: !!this.windowService,
          methodExists: !!this.windowService?.createWindowWithPosition,
          windowServiceType: typeof this.windowService,
          windowServiceName: this.windowService?.constructor?.name,
          availableMethods: this.windowService
            ? Object.getOwnPropertyNames(
                this.windowService.constructor.prototype,
              )
            : [],
          url: url,
          position: layout.position,
        });

        // WindowServiceを使用してウィンドウ作成（正しいメソッドを使用）
        const windowInfo = await this.windowService.createWindowWithPosition(
          url,
          layout.position, // 0=左上, 1=右上, 2=左下
          {
            type: "popup",
            aiType: layout.aiType,
          },
        );

        ExecuteLogger.info(`[WindowController] ウィンドウ作成結果`, {
          aiType: layout.aiType,
          position: layout.position,
          windowInfoReceived: !!windowInfo,
          windowInfoType: typeof windowInfo,
          windowInfoKeys: windowInfo ? Object.keys(windowInfo) : null,
          windowId: windowInfo?.id,
          windowTabs: windowInfo?.tabs,
          tabCount: windowInfo?.tabs?.length || 0,
          firstTabId: windowInfo?.tabs?.[0]?.id,
          conditionWindowInfo: !!windowInfo,
          conditionWindowId: !!(windowInfo && windowInfo.id),
        });

        if (windowInfo && windowInfo.id) {
          const windowData = {
            windowId: windowInfo.id,
            tabId: windowInfo.tabs?.[0]?.id,
            url: url,
            position: layout.position,
            aiType: layout.aiType,
          };

          ExecuteLogger.info(`[WindowController] openedWindows.set実行`, {
            aiType: layout.aiType,
            windowData: windowData,
            beforeSize: this.openedWindows.size,
          });

          // 一意キーを生成して複数のウィンドウを管理
          const uniqueKey = `${this.normalizeAiType(layout.aiType)}_${layout.position}_${Date.now()}`;
          const normalizedAiType = this.normalizeAiType(layout.aiType);
          windowData.uniqueKey = uniqueKey;

          // 並列実行でも安全にウィンドウデータを保存
          // 単一のウィンドウとして保存（後で配列として取得される）
          const storageKey = `${normalizedAiType}_${layout.position}`;
          this.openedWindows.set(storageKey, windowData);

          ExecuteLogger.info(`[WindowController] ウィンドウ保存完了`, {
            aiType: layout.aiType,
            storageKey: storageKey,
            uniqueKey: uniqueKey,
            position: layout.position,
            windowId: windowData.windowId,
            tabId: windowData.tabId,
            currentMapSize: this.openedWindows.size,
          });

          ExecuteLogger.info(`[WindowController] openedWindows.set完了`, {
            aiType: layout.aiType,
            afterSize: this.openedWindows.size,
            allOpenedWindows: Array.from(this.openedWindows.entries()),
          });

          ExecuteLogger.info(
            `✅ [Step 4-1-2-${layout.position}] ${layout.aiType}ウィンドウ作成成功`,
          );

          return {
            aiType: layout.aiType,
            success: true,
            windowId: windowInfo.id,
            position: layout.position,
          };
        } else {
          ExecuteLogger.error(
            `🖼️ [WindowController] ERROR: ウィンドウ作成条件未満`,
            {
              aiType: layout.aiType,
              position: layout.position,
              windowInfoExists: !!windowInfo,
              windowIdExists: !!(windowInfo && windowInfo.id),
              windowInfo: windowInfo,
              reason: !windowInfo
                ? "windowInfoがnull/undefined"
                : "windowInfo.idが存在しない",
            },
          );
          return {
            aiType: layout.aiType,
            success: false,
            error: "ウィンドウ作成失敗: windowInfoが不正",
            position: layout.position,
          };
        }
      } catch (error) {
        ExecuteLogger.error(
          `❌ [Step 4-1-2-${layout.position}] ${layout.aiType}ウィンドウ作成失敗:`,
          error,
        );
        return {
          aiType: layout.aiType,
          success: false,
          error: error.message,
          position: layout.position,
        };
      }
    });

    // 全ウィンドウの作成を並列実行
    const results = await Promise.all(windowPromises);

    // 全ウィンドウ作成後に一度だけ待機（タブの準備を確実にする）
    if (results.some((r) => r.success)) {
      ExecuteLogger.info("⏳ 全ウィンドウのタブ準備待機中... (3秒)");
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }

    ExecuteLogger.info(
      "🏁 [WindowController] Step 4-1-2: 4分割ウィンドウ開く完了",
      results,
    );

    ExecuteLogger.info("[WindowController] openWindows完了", {
      resultsLength: results.length,
      successfulResults: results.filter((r) => r.success).length,
      failedResults: results.filter((r) => !r.success).length,
      finalOpenedWindowsSize: this.openedWindows.size,
      finalOpenedWindowsEntries: Array.from(this.openedWindows.entries()),
      resultsSummary: results.map((r) => ({
        aiType: r.aiType,
        success: r.success,
        position: r.position,
      })),
    });

    return results;
  }

  /**
   * Step 4-1-3: ウィンドウチェック（テキスト入力欄・モデル表示・機能表示）
   * @param {Array} aiTypes - チェック対象のAI種別リスト
   */
  async checkWindows(aiTypes) {
    ExecuteLogger.info(
      "🔍 [WindowController] Step 4-1-3: ウィンドウチェック開始",
      aiTypes,
    );

    // デバッグ：重複チェック
    if (aiTypes.length !== [...new Set(aiTypes)].length) {
      ExecuteLogger.warn(
        `⚠️ [WindowController] 重複したAIタイプが検出されました。重複削除前: ${aiTypes.length}個, 削除後: ${[...new Set(aiTypes)].length}個`,
      );
    }

    const checkResults = [];

    for (const aiType of aiTypes) {
      // タスクキーから基本のAIタイプを抽出（例: Claude_task_2_16_xxx → claude）
      const baseAiType = aiType.replace(/_task.*/, "");
      const normalizedAiType = this.normalizeAiType(baseAiType);

      // 新しい保存形式に対応: 該当するウィンドウを全て探す（並列処理対応）
      const matchingWindows = [];
      for (const [key, value] of this.openedWindows.entries()) {
        if (key.startsWith(normalizedAiType + "_")) {
          matchingWindows.push({ key, value });
        }
      }

      if (matchingWindows.length === 0) {
        ExecuteLogger.warn(
          `⚠️ [Step 4-1-3] ${aiType}のウィンドウが見つかりません`,
        );
        checkResults.push({
          aiType: aiType,
          success: false,
          error: "ウィンドウが開かれていません",
        });
        continue;
      }

      // 全ての該当ウィンドウをチェック（並列処理対応）
      ExecuteLogger.info(
        `🔍 [Step 4-1-3] ${aiType}ウィンドウを全てチェック中... (${matchingWindows.length}個)`,
      );

      let allChecksPass = true;
      const allCheckResults = [];

      for (const { key, value: windowInfo } of matchingWindows) {
        try {
          ExecuteLogger.info(`🔍 [Step 4-1-3] ${key}ウィンドウをチェック中...`);

          // タブをアクティブにしてからチェック
          if (windowInfo.tabId) {
            await chrome.tabs.update(windowInfo.tabId, { active: true });
            await new Promise((resolve) => setTimeout(resolve, 1000)); // 読み込み待機
          }

          // AI種別に応じたチェック処理
          const checkResult = await this.performWindowCheck(
            aiType,
            windowInfo.tabId,
          );

          allCheckResults.push({
            windowKey: key,
            tabId: windowInfo.tabId,
            success: checkResult.success,
            checks: checkResult.checks,
            error: checkResult.error,
          });

          if (!checkResult.success) {
            allChecksPass = false;
          }
        } catch (error) {
          ExecuteLogger.error(
            `❌ [Step 4-1-3] ${key}ウィンドウチェックエラー:`,
            error.message,
          );
          allCheckResults.push({
            windowKey: key,
            tabId: windowInfo.tabId,
            success: false,
            error: error.message,
          });
          allChecksPass = false;
        }
      }

      checkResults.push({
        aiType: aiType,
        success: allChecksPass,
        windowCount: matchingWindows.length,
        allWindowResults: allCheckResults,
        error: allChecksPass
          ? null
          : "一部のウィンドウでUI要素が見つかりません",
      });
    }

    ExecuteLogger.info(
      "🏁 [WindowController] Step 4-1-3: ウィンドウチェック完了",
      checkResults,
    );
    return checkResults;
  }

  /**
   * AI種別に応じたURLを取得
   */
  getAIUrl(aiType) {
    const urls = {
      chatgpt: "https://chatgpt.com/",
      claude: "https://claude.ai/",
      gemini: "https://gemini.google.com/",
      genspark: "https://www.genspark.ai/",
      report: "about:blank", // レポート用は空白ページ
    };
    return urls[aiType.toLowerCase()] || "about:blank";
  }

  /**
   * タブが準備完了になるまで待機する関数
   */
  async waitForTabReady(tabId, maxRetries = 10, delayMs = 2000) {
    for (let i = 0; i < maxRetries; i++) {
      try {
        const tab = await chrome.tabs.get(tabId);

        ExecuteLogger.info(
          `🔄 [Tab Ready Check] Attempt ${i + 1}/${maxRetries}:`,
          {
            tabId: tabId,
            status: tab?.status,
            url: tab?.url,
            readyCheck: tab?.status === "complete",
          },
        );

        if (tab && tab.status === "complete") {
          ExecuteLogger.info(`✅ [Tab Ready] Tab is ready:`, {
            tabId: tabId,
            finalStatus: tab.status,
            attemptsUsed: i + 1,
          });
          // 追加の安定化待機（JavaScript読み込み完了確保）
          await new Promise((resolve) => setTimeout(resolve, 2000));
          return tab;
        }

        if (i < maxRetries - 1) {
          ExecuteLogger.info(
            `⏳ [Tab Ready] Waiting ${delayMs}ms before retry...`,
          );
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      } catch (error) {
        // 詳細なエラー情報を取得
        log.error("🔴 [DEBUG-TAB-ERROR] 詳細エラー情報:", {
          errorMessage: error?.message || "メッセージなし",
          errorStack: error?.stack || "スタックなし",
          errorName: error?.name || "名前なし",
          errorType: typeof error,
          errorKeys: error ? Object.keys(error) : [],
          fullError: JSON.stringify(error, null, 2),
          chromeLastError: chrome.runtime.lastError?.message || "なし",
        });

        // タブID自体の検証
        log.debug("🔍 [DEBUG-TAB-ID] タブID検証:", {
          tabId: tabId,
          tabIdType: typeof tabId,
          isValidNumber: Number.isInteger(tabId),
          tabIdValue: tabId,
        });

        // Chrome API の状態確認
        log.debug("🔧 [DEBUG-CHROME-API] Chrome API状態:", {
          chromeExists: typeof chrome !== "undefined",
          tabsApiExists: typeof chrome?.tabs !== "undefined",
          getMethodExists: typeof chrome?.tabs?.get === "function",
          manifestVersion: chrome?.runtime?.getManifest?.()?.manifest_version,
          permissions: chrome?.runtime?.getManifest?.()?.permissions,
        });

        // 代替手法での情報取得
        try {
          const allTabs = await chrome.tabs.query({});
          log.debug("📋 [DEBUG-ALL-TABS] 全タブ情報:", {
            totalTabs: allTabs.length,
            targetTabExists: allTabs.some((t) => t.id === tabId),
            tabIds: allTabs.map((t) => ({
              id: t.id,
              url: t.url?.substring(0, 50),
            })),
          });
        } catch (queryError) {
          log.error("❌ [DEBUG-QUERY-ERROR]:", queryError.message, queryError);
        }

        ExecuteLogger.error(`❌ [Tab Ready Check] Error on attempt ${i + 1}:`, {
          tabId: tabId,
          error: error.message || String(error),
          errorString: String(error),
          willRetry: i < maxRetries - 1,
        });

        if (i < maxRetries - 1) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
    }

    throw new Error(
      `Tab ${tabId} did not become ready after ${maxRetries} attempts`,
    );
  }

  /**
   * ファーストウィン戦略による高速ウィンドウチェック
   */
  async checkWindowsOptimized(aiType) {
    log.debug(`[FastCheck] ${aiType}の高速チェック開始`);

    // Step 1: UnifiedWindowManagerで最初に動作するウィンドウを見つける
    const workingWindow =
      await StepIntegratedWindowService.unifiedManager.findFirstWorkingWindow(
        aiType,
      );

    if (workingWindow) {
      log.debug(
        `✅ [FastCheck] ${aiType}の動作ウィンドウ発見: ${workingWindow.tabId}`,
      );

      // UI要素の詳細チェック
      const detailCheck = await this.performWindowCheck(
        aiType,
        workingWindow.tabId,
      );
      if (detailCheck.success) {
        return {
          success: true,
          window: workingWindow,
          checks: detailCheck.checks,
          strategy: "first-win",
          checkTime: Date.now(),
        };
      }
    }

    // Step 2: 見つからない場合のみ従来の全チェック
    log.debug(`🔍 [FastCheck] ${aiType}のフォールバック: 全ウィンドウチェック`);
    return await this.performFullWindowCheck(aiType);
  }

  /**
   * 従来の全ウィンドウチェック（フォールバック用）
   */
  async performFullWindowCheck(aiType) {
    log.debug(`[FullCheck] ${aiType}の全ウィンドウチェック開始`);

    // 従来のロジックを保持
    const baseAiType = aiType.replace(/_task.*/, "");
    const normalizedAiType = this.normalizeAiType(baseAiType);

    const matchingWindows = [];
    for (const [key, value] of this.openedWindows.entries()) {
      if (key.startsWith(normalizedAiType + "_")) {
        matchingWindows.push({ key, value });
      }
    }

    if (matchingWindows.length === 0) {
      return {
        success: false,
        error: `${aiType}のウィンドウが見つかりません`,
        strategy: "full-check",
      };
    }

    // 最初の成功ウィンドウで終了（改善版）
    for (const { key, value: windowInfo } of matchingWindows) {
      try {
        const checkResult = await this.performWindowCheck(
          aiType,
          windowInfo.tabId,
        );
        if (checkResult.success) {
          log.debug(
            `✅ [FullCheck] ${aiType}成功ウィンドウ: ${windowInfo.tabId}`,
          );
          return {
            success: true,
            window: { tabId: windowInfo.tabId, key },
            checks: checkResult.checks,
            strategy: "full-check-success",
          };
        }
      } catch (error) {
        log.debug(`❌ [FullCheck] ${key}チェックエラー:`, error.message);
      }
    }

    return {
      success: false,
      error: `${aiType}の動作ウィンドウが見つかりません`,
      strategy: "full-check-failed",
    };
  }

  /**
   * 個別ウィンドウのチェック処理（安定化リトライ版）
   */
  async performWindowCheck(aiType, tabId) {
    log.debug(
      `[DEBUG-performWindowCheck] 開始: aiType=${aiType}, tabId=${tabId}`,
    );

    return await executeSimpleRetry({
      action: async () => {
        const checks = {
          textInput: false,
          modelDisplay: false,
          functionDisplay: false,
        };

        // タブの準備完了を待機
        log.debug(
          `[DEBUG-performWindowCheck] タブ準備完了待機開始: tabId=${tabId}`,
        );
        const tab = await this.waitForTabReady(tabId, 10, 1000);
        log.debug(`[DEBUG-performWindowCheck] タブ準備完了:`, {
          tabId,
          url: tab?.url,
          status: tab?.status,
        });

        // SafeMessengerを使用してContent scriptにチェック要求を送信
        log.debug(
          `[DEBUG-performWindowCheck] SafeMessenger送信開始: tabId=${tabId}, aiType=${aiType}`,
        );
        const result = await SafeMessenger.sendSafeMessage(tabId, {
          action: "CHECK_UI_ELEMENTS",
          aiType: aiType,
        });
        log.debug(`[DEBUG-performWindowCheck] SafeMessenger完了:`, result);

        let response = null;
        if (result.success) {
          response = result.data;
        }

        if (response) {
          checks.textInput = response.textInput || false;
          checks.modelDisplay = response.modelDisplay || false;
          checks.functionDisplay = response.functionDisplay || false;
        }

        const allChecksPass = Object.values(checks).every((check) => check);
        log.debug(
          `[DEBUG-performWindowCheck] チェック結果: allChecksPass=${allChecksPass}`,
          checks,
        );

        return {
          success: allChecksPass,
          checks: checks,
          error: allChecksPass ? null : "UI要素の一部が見つかりません",
        };
      },
      isSuccess: (result) => result && result.success,
      maxRetries: 5,
      interval: 1000,
      actionName: `ウィンドウチェック (${aiType}, tabId=${tabId})`,
      context: { aiType, tabId },
    });
  }

  /**
   * 開かれたウィンドウ情報を取得
   */
  getOpenedWindows() {
    return Array.from(this.openedWindows.entries()).map(([aiType, info]) => ({
      aiType,
      ...info,
    }));
  }

  /**
   * Step 4-1-4: ウィンドウを閉じる
   */
  async closeWindows(aiTypes = null) {
    ExecuteLogger.info(
      "🔒 [WindowController] Step 4-1-4: ウィンドウクローズ開始",
      aiTypes,
    );

    const targetAiTypes = aiTypes || Array.from(this.openedWindows.keys());

    for (const aiType of targetAiTypes) {
      const windowInfo = this.openedWindows.get(aiType);
      if (windowInfo && windowInfo.windowId) {
        try {
          await chrome.windows.remove(windowInfo.windowId);
          this.openedWindows.delete(aiType);
          ExecuteLogger.info(`✅ [Step 4-1-4] ${aiType}ウィンドウクローズ完了`);
        } catch (error) {
          ExecuteLogger.error(
            `❌ [Step 4-1-4] ${aiType}ウィンドウクローズ失敗:`,
            error,
          );
        }
      }
    }

    ExecuteLogger.info(
      "🏁 [WindowController] Step 4-1-4: ウィンドウクローズ完了",
    );
  }
}

// グローバルインスタンス作成
// WindowController は step0-ui-controller.js で初期化済み
// window.windowController = new WindowController();

// ========================================
// SimpleSheetsClient: stepフォルダ内で完結するSheets APIクライアント
// ========================================
class SimpleSheetsClient {
  constructor() {
    this.baseUrl = "https://sheets.googleapis.com/v4/spreadsheets";
    this.sheetNameCache = new Map(); // GID -> シート名のキャッシュ
  }

  /**
   * 認証トークンの取得
   */
  async getAuthToken() {
    if (window.globalState?.authToken) {
      return window.globalState.authToken;
    }
    throw new Error("認証トークンが利用できません");
  }

  /**
   * GIDから実際のシート名を取得
   * @param {string} spreadsheetId - スプレッドシートID
   * @param {string} gid - シートのGID
   * @returns {Promise<string|null>} 実際のシート名
   */
  async getSheetNameFromGid(spreadsheetId, gid) {
    if (!gid) return null;

    // キャッシュチェック
    const cacheKey = `${spreadsheetId}-${gid}`;
    if (this.sheetNameCache.has(cacheKey)) {
      return this.sheetNameCache.get(cacheKey);
    }

    const token = await this.getAuthToken();
    const url = `${this.baseUrl}/${spreadsheetId}`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`スプレッドシート情報取得失敗: ${response.statusText}`);
    }

    const data = await response.json();
    const sheets = data.sheets || [];

    for (const sheet of sheets) {
      if (sheet.properties && sheet.properties.sheetId == gid) {
        const sheetName = sheet.properties.title;
        this.sheetNameCache.set(cacheKey, sheetName);
        return sheetName;
      }
    }

    return null;
  }
} // SimpleSheetsClient クラスの終了

// ========================================
// StreamProcessorV2統合: createWindowForBatch関数
// ========================================

/**
 * バッチ用のウィンドウを作成（StreamProcessorV2パターン）
 * @param {Object} task - タスクオブジェクト
 * @param {number} position - ウィンドウ位置（0=左上, 1=右上, 2=左下, 3=右下）
 * @returns {Promise<Object>} ウィンドウ情報
 */
async function createWindowForBatch(task, position = 0) {
  ExecuteLogger.info(
    `🪟 [createWindowForBatch] ${task.aiType}ウィンドウ作成開始 (position: ${position})`,
  );

  try {
    // Step内統合版クラスを使用
    ExecuteLogger.info(
      `✅ [createWindowForBatch] Step内統合版パターン使用: ${task.aiType}`,
    );

    // Step内統合版aiUrlManagerからURLを取得
    const url = StepIntegratedAiUrlManager.getUrl(task.aiType);
    ExecuteLogger.info(
      `🔗 [createWindowForBatch] URL取得: ${url} (AI: ${task.aiType})`,
    );

    // Step内統合版WindowService.createWindowWithPositionを使用
    const window = await StepIntegratedWindowService.createWindowWithPosition(
      url,
      position,
      {
        type: "popup",
        aiType: task.aiType,
      },
    );

    // StreamProcessorV2と同じ形式で返却
    const windowInfo = {
      ...window,
      tabId: window.tabs && window.tabs.length > 0 ? window.tabs[0].id : null,
      windowId: window.id,
      aiType: task.aiType,
      position: position,
    };

    ExecuteLogger.info(
      `✅ [createWindowForBatch] ${task.aiType}ウィンドウ作成完了`,
      {
        windowId: windowInfo.windowId,
        tabId: windowInfo.tabId,
        url: url,
      },
    );

    return windowInfo;
  } catch (error) {
    ExecuteLogger.error(`❌ [createWindowForBatch] エラー:`, error);
    throw error;
  }
}

// ========================================
// executeStep4 Function - Moved from step5-execute.js
// ========================================

async function executeStep4(taskList) {
  // executeStep4関数定義開始
  ExecuteLogger.info("🚀 Step 4-6 Execute 統合実行開始", taskList);

  // 🔍 [DEBUG] タスクリスト詳細検証ログ
  ExecuteLogger.info(
    "🔍 [DEBUG-TASK-VALIDATION] executeStep4受信タスクリスト詳細検証:",
    {
      taskListReceived: !!taskList,
      taskListType: typeof taskList,
      taskListLength: Array.isArray(taskList) ? taskList.length : "not array",
      isArray: Array.isArray(taskList),
      taskListContent: Array.isArray(taskList)
        ? taskList.map((task, index) => ({
            index: index,
            taskId:
              task?.id ||
              task?.taskId ||
              `${task?.column}${task?.row}` ||
              "ID不明",
            hasPrompt: !!task?.prompt,
            promptLength: task?.prompt?.length || 0,
            promptPreview: task?.prompt
              ? `${task.prompt.substring(0, 50)}...`
              : "❌ プロンプトなし",
            aiType: task?.aiType || "❌ AIタイプなし",
            column: task?.column || "❌ カラムなし",
            row: task?.row || "❌ 行なし",
            hasTabId: !!task?.tabId,
            hasWindowId: !!task?.windowId,
            taskKeys: task ? Object.keys(task) : null,
            isValidTask: !!(
              task?.prompt &&
              task?.aiType &&
              task?.column &&
              task?.row
            ),
          }))
        : "taskListが配列ではありません",
      validTaskCount: Array.isArray(taskList)
        ? taskList.filter(
            (task) =>
              !!(task?.prompt && task?.aiType && task?.column && task?.row),
          ).length
        : 0,
      invalidTasks: Array.isArray(taskList)
        ? taskList
            .filter(
              (task) =>
                !(task?.prompt && task?.aiType && task?.column && task?.row),
            )
            .map((task) => ({
              taskId:
                task?.id ||
                task?.taskId ||
                `${task?.column}${task?.row}` ||
                "ID不明",
              missingFields: [
                !task?.prompt ? "prompt" : null,
                !task?.aiType ? "aiType" : null,
                !task?.column ? "column" : null,
                !task?.row ? "row" : null,
              ].filter(Boolean),
            }))
        : [],
    },
  );

  // 内部関数の存在確認（実行時チェック）
  ExecuteLogger.info("🔍 [executeStep4] 内部関数の定義状態確認:", {
    executeNormalAITask: typeof executeNormalAITask,
    processTaskResult: typeof processTaskResult,
    shouldPerformWindowCleanup: typeof shouldPerformWindowCleanup,
    calculateLogCellRef: typeof calculateLogCellRef,
  });

  const results = [];
  let windowLayoutInfo = null;
  let enrichedTaskList = null;

  try {
    // Step 4-6-0: 【3種類AIタスクの展開処理】
    ExecuteLogger.info(
      "📋 [step4-execute.js] Step 4-6-0: 3種類AIタスクの展開処理開始",
    );

    const expandedTaskList = [];
    for (const task of taskList) {
      if (task.aiType === "3種類（ChatGPT・Gemini・Claude）") {
        ExecuteLogger.info(
          `[step4-execute.js] Step 4-6-0-1: 3種類AIタスク検出！プロンプト: ${task.prompt?.substring(0, 30)}...`,
        );

        // 1つのタスクを3つに展開（元のai-task-executor.jsの動作を再現）
        const baseRow = task.row || task.cellInfo?.row;
        const expandedTasks = [
          {
            ...task,
            aiType: "chatgpt",
            column: "F",
            cellInfo: { ...task.cellInfo, column: "F", row: baseRow },
            originalAiType: "3種類（ChatGPT・Gemini・Claude）",
            taskGroup: task.id || task.taskId, // グループ化用
          },
          {
            ...task,
            aiType: "claude",
            column: "G",
            cellInfo: { ...task.cellInfo, column: "G", row: baseRow },
            originalAiType: "3種類（ChatGPT・Gemini・Claude）",
            taskGroup: task.id || task.taskId, // グループ化用
          },
          {
            ...task,
            aiType: "gemini",
            column: "H",
            cellInfo: { ...task.cellInfo, column: "H", row: baseRow },
            originalAiType: "3種類（ChatGPT・Gemini・Claude）",
            taskGroup: task.id || task.taskId, // グループ化用
          },
        ];

        ExecuteLogger.info(
          `[step4-execute.js] Step 4-6-0-2: 1つのタスクを3つに展開完了`,
        );
        expandedTaskList.push(...expandedTasks);
      } else {
        // 通常のタスクはそのまま追加
        expandedTaskList.push(task);
      }
    }

    ExecuteLogger.info(
      `[step4-execute.js] Step 4-6-0-3: タスク展開完了 - 元: ${taskList.length}個 → 展開後: ${expandedTaskList.length}個`,
    );

    // 展開後のタスクリストを使用
    const processTaskList = expandedTaskList;

    // Step 4-6-1: 初期化とグループタイプ判定
    ExecuteLogger.info(
      "📋 [step4-execute.js] Step 4-6-1: 初期化とグループタイプ判定開始",
    );

    // グループタイプの判定（展開後のタスクリストで判定）
    const groupTypeInfo =
      window.taskGroupTypeDetector.detectGroupType(processTaskList);
    ExecuteLogger.info(
      "🎯 [Step 4-6-1] グループタイプ判定結果:",
      groupTypeInfo,
    );

    // ウィンドウ配置情報の取得（タスク順序ベース）
    windowLayoutInfo =
      window.taskGroupTypeDetector.getWindowLayoutFromTasks(processTaskList);
    ExecuteLogger.info(
      "🖼️ [Step 4-6-1] ウィンドウ配置情報（タスク順序ベース）:",
      windowLayoutInfo,
    );

    // Step 4-6-2: スプレッドシートデータの動的取得
    ExecuteLogger.info("📊 [Step 4-6-2] スプレッドシートデータ動的取得開始");

    // 展開後のタスクリストを使用
    enrichedTaskList =
      await window.spreadsheetDataManager.enrichTaskList(processTaskList);
    ExecuteLogger.info(
      "✅ [Step 4-6-2] タスクリスト拡張完了:",
      enrichedTaskList.length,
      "個のタスク",
    );

    // Step 4-6-3: ウィンドウ開く
    ExecuteLogger.info("🪟 [Step 4-6-3] ウィンドウ開く処理開始");

    // タスクが0個の場合はウィンドウを開かずにスキップ
    let successfulWindows = [];
    if (processTaskList.length === 0) {
      ExecuteLogger.info(
        `⚠️ [Step 4-6-3] タスクが0個のため、ウィンドウ開く処理をスキップ`,
      );
    } else {
      // WindowControllerのメソッド存在確認
      ExecuteLogger.info("🔍 WindowController確認:", {
        windowControllerExists: !!window.windowController,
        hasOpenWindows:
          typeof window.windowController?.openWindows === "function",
        hasCloseWindows:
          typeof window.windowController?.closeWindows === "function",
        constructorName: window.windowController?.constructor?.name,
        availableMethods: window.windowController
          ? Object.getOwnPropertyNames(
              Object.getPrototypeOf(window.windowController),
            )
          : [],
      });

      if (
        !window.windowController ||
        typeof window.windowController.openWindows !== "function"
      ) {
        ExecuteLogger.error("❌ WindowController.openWindowsが利用できません");
        throw new Error("WindowController.openWindowsメソッドが見つかりません");
      }

      const windowResults =
        await window.windowController.openWindows(windowLayoutInfo);
      successfulWindows = windowResults.filter((w) => w.success);
      ExecuteLogger.info(
        `✅ [Step 4-6-3] ウィンドウ開く完了: ${successfulWindows.length}/${windowResults.length}個成功`,
      );

      if (successfulWindows.length === 0 && processTaskList.length > 0) {
        throw new Error("ウィンドウを開くことができませんでした");
      }

      // 全ウィンドウが並列で開かれており、既に待機済みのため追加の待機は不要
      ExecuteLogger.info("✅ ウィンドウとタブの準備完了");

      // Step 4-6-3-0.5: ウィンドウチェックをスキップ（unused/stream-processor-v2.js準拠）
      // 元のコードではウィンドウチェックを行わず、直接タスク実行に進むため削除
      ExecuteLogger.info(
        "📝 [Step 4-6-3-0.5] ウィンドウチェックをスキップ（unused準拠）",
      );
    }

    // Step 4-6-3-1: ポップアップを右下に移動（step外と同じ動作）
    ExecuteLogger.info("🚀 [Step 4-6-3-1] ポップアップを右下に移動開始");
    try {
      // message-handler.jsのmovePopupToBottomRight()と同じ処理を実行
      const storage = await chrome.storage.local.get("extensionWindowId");
      if (storage.extensionWindowId) {
        try {
          const extensionWindow = await chrome.windows.get(
            storage.extensionWindowId,
          );

          // スクリーン情報を取得
          const displays = await chrome.system.display.getInfo();
          const primaryDisplay =
            displays.find((d) => d.isPrimary) || displays[0];

          // 4分割の右下に配置
          const screenWidth = primaryDisplay.workArea.width;
          const screenHeight = primaryDisplay.workArea.height;
          const screenLeft = primaryDisplay.workArea.left;
          const screenTop = primaryDisplay.workArea.top;

          const popupWidth = Math.floor(screenWidth / 2);
          const popupHeight = Math.floor(screenHeight / 2);
          const left = screenLeft + Math.floor(screenWidth / 2);
          const top = screenTop + Math.floor(screenHeight / 2);

          await chrome.windows.update(extensionWindow.id, {
            left: left,
            top: top,
            width: popupWidth,
            height: popupHeight,
            focused: false,
          });

          ExecuteLogger.info("✅ [Step 4-6-3-1] ポップアップ移動完了");
        } catch (e) {
          ExecuteLogger.warn(
            "⚠️ [Step 4-6-3-1] ポップアップウィンドウが見つかりません",
          );
        }
      }
    } catch (error) {
      ExecuteLogger.warn("⚠️ [Step 4-6-3-1] ポップアップ移動エラー:", error);
    }

    // Step 4-6-4: ウィンドウチェックをスキップ（unused/stream-processor-v2.js準拠）
    // 元のコードではウィンドウチェックを行わず、直接タスク実行に進むため削除
    ExecuteLogger.info(
      "📝 [Step 4-6-4] ウィンドウチェックをスキップ（unused準拠）",
    );

    // Step 4-6-5: ライフサイクル管理初期化
    ExecuteLogger.info("🔄 [Step 4-6-5] ライフサイクル管理初期化");

    await window.windowLifecycleManager.initializeLifecycleManager();

    // 各ウィンドウを登録
    for (const windowResult of successfulWindows) {
      const windowInfo = window.windowController.openedWindows.get(
        windowResult.aiType,
      );
      if (windowInfo) {
        window.windowLifecycleManager.registerWindow(
          windowResult.aiType,
          windowInfo,
        );
      }
    }

    // Step 4-6-6: 各タスクの実行（統一バッチ処理: 3タスクずつ）
    ExecuteLogger.info(
      "⚡ [step4-execute.js] Step 4-6-6: タスク実行ループ開始",
    );

    // Step 4-6-6-0: 3タスクずつのバッチに分割
    ExecuteLogger.info(
      `[step4-execute.js] Step 4-6-6-0: タスクをバッチ処理用に準備 - 合計${enrichedTaskList.length}タスク`,
    );

    const batchSize = 3;
    const batches = [];

    // 3タスクずつのバッチを作成
    for (let i = 0; i < enrichedTaskList.length; i += batchSize) {
      const batch = enrichedTaskList.slice(
        i,
        Math.min(i + batchSize, enrichedTaskList.length),
      );
      batches.push(batch);
    }

    ExecuteLogger.info(
      `[step4-execute.js] Step 4-6-6-1: ${batches.length}個のバッチ作成完了（各バッチ最大3タスク）`,
    );

    // バッチごとに処理
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      ExecuteLogger.info(
        `📦 [step4-execute.js] Step 4-6-6-${batchIndex + 2}: バッチ${batchIndex + 1}/${batches.length} 処理開始 - ${batch.length}タスク`,
      );

      // Step 4-6-6-A: ウィンドウ割り当て (unused/stream-processor-v2.js準拠)
      // 各タスクに異なるウィンドウを割り当てる
      const batchWindows = new Map(); // taskIndex -> windowInfo

      ExecuteLogger.info(
        `🔄 [step4-execute.js] Step 4-6-6-${batchIndex + 2}-A: バッチタスクにウィンドウを割り当て（unused準拠）`,
      );

      // 各タスクにpositionベースでウィンドウを割り当て
      for (let taskIndex = 0; taskIndex < batch.length; taskIndex++) {
        const task = batch[taskIndex];
        const aiType = task.aiType;
        const position = taskIndex % 3; // 0,1,2で3つのウィンドウを循環利用

        ExecuteLogger.info(
          `🔍 [step4-execute.js] Step 4-6-6-${batchIndex + 2}-A-1: タスク${taskIndex + 1}/${batch.length} - ${aiType}、Position: ${position}`,
        );

        const normalizedAiType =
          window.windowController.normalizeAiType(aiType);
        const windowKey = `${normalizedAiType}_${position}`;

        // 既存ウィンドウを探す
        let existingWindow = null;
        if (window.windowController.openedWindows.has(windowKey)) {
          existingWindow = window.windowController.openedWindows.get(windowKey);
          ExecuteLogger.info(
            `♻️ [step4-execute.js] Step 4-6-6-${batchIndex + 2}-A-2: 既存の${windowKey}ウィンドウを再利用`,
          );
        }

        if (existingWindow) {
          // 既存ウィンドウを使用
          const windowToUse = Array.isArray(existingWindow)
            ? existingWindow[0]
            : existingWindow;

          batchWindows.set(taskIndex, windowToUse);
          ExecuteLogger.info(
            `✅ [step4-execute.js] Step 4-6-6-${batchIndex + 2}-A-3: タスク${taskIndex + 1}に既存ウィンドウ割り当て`,
            {
              taskIndex: taskIndex,
              aiType: aiType,
              tabId: windowToUse?.tabId,
              windowId: windowToUse?.windowId,
              position: position,
            },
          );
        } else {
          // 新しいウィンドウを作成
          ExecuteLogger.info(
            `🪟 [step4-execute.js] Step 4-6-6-${batchIndex + 2}-A-4: タスク${taskIndex + 1}用の新規ウィンドウ作成（Position: ${position}）`,
          );

          try {
            const windowInfo = await createWindowForBatch(task, position);
            batchWindows.set(taskIndex, windowInfo);

            // windowControllerに登録
            window.windowController.openedWindows.set(windowKey, windowInfo);

            ExecuteLogger.info(
              `✅ [step4-execute.js] Step 4-6-6-${batchIndex + 2}-A-5: タスク${taskIndex + 1}用ウィンドウ作成成功`,
              {
                taskIndex: taskIndex,
                aiType: aiType,
                tabId: windowInfo.tabId,
                windowId: windowInfo.windowId,
                position: position,
              },
            );
          } catch (error) {
            ExecuteLogger.error(
              `❌ [step4-execute.js] タスク${taskIndex + 1}のウィンドウ作成失敗:`,
              error,
            );
          }
        }
      }

      // Step 4-6-6-B: ウィンドウチェックをスキップ（unused/stream-processor-v2.js準拠）
      // unused/stream-processor-v2.jsではウィンドウチェックを行っていないため、
      // 同じ動作になるようチェック処理を削除
      ExecuteLogger.info(
        `📝 [step4-execute.js] Step 4-6-6-${batchIndex + 2}-B: ウィンドウチェックをスキップ（unused/stream-processor-v2.js準拠）`,
      );

      // Step 4-6-6-C: バッチ内のタスクを並列実行（unused/stream-processor-v2.js準拠）
      // unused/stream-processor-v2.jsのproccssBatch()と同じ実装
      ExecuteLogger.info(
        `🚀 [step4-execute.js] Step 4-6-6-${batchIndex + 2}-C: タスク並列実行開始（unused方式）`,
      );

      const validBatchTasks = batch.filter((task, index) => {
        const taskId = task.id || task.taskId || `${task.column}${task.row}`;
        const taskIndex = batch.indexOf(task);

        // Step 4-6-6-C-1: タスクインデックスでウィンドウ情報を取得（unused/stream-processor-v2.js準拠）
        const windowInfo = batchWindows.get(taskIndex);

        ExecuteLogger.info(
          `🔍 [step4-execute.js] Step 4-6-6-${batchIndex + 2}-C-1: タスク${taskId}の有効性確認（unused準拠）`,
          {
            aiType: task.aiType,
            hasWindowInfo: !!windowInfo,
            hasTabId: !!windowInfo?.tabId,
          },
        );

        // Step 4-6-6-C-2: ウィンドウ情報の存在確認（unused/stream-processor-v2.js準拠）
        if (!windowInfo || !windowInfo.tabId) {
          ExecuteLogger.error(
            `❌ [step4-execute.js] Step 4-6-6-${batchIndex + 2}-C-2: タスク${taskId}：${task.aiType}のウィンドウ情報が無効`,
            {
              windowInfo: windowInfo,
              hasWindowInfo: !!windowInfo,
              hasTabId: !!windowInfo?.tabId,
              hasWindowId: !!windowInfo?.windowId,
            },
          );
          return false;
        }

        // Step 4-6-6-C-3: タスクにウィンドウ情報を設定（unused/stream-processor-v2.js準拠）
        task.tabId = windowInfo.tabId;
        task.windowId = windowInfo.windowId;

        ExecuteLogger.info(
          `✅ [step4-execute.js] Step 4-6-6-${batchIndex + 2}-C-3: タスク${taskId}準備完了（unused準拠）`,
          {
            tabId: task.tabId,
            windowId: task.windowId,
            aiType: task.aiType,
          },
        );

        // Step 4-6-6-C-4: 複雑なフォールバック処理を削除（unused/stream-processor-v2.js準拠）
        // unused/stream-processor-v2.jsではシンプルなチェックのみ実施
        if (!task.tabId || !task.windowId) {
          ExecuteLogger.warn(
            `⚠️ [step4-execute.js] Step 4-6-6-${batchIndex + 2}-C-4: タスク${task.id || task.taskId}のtabId/windowIdが未設定`,
            {
              taskId: task.id || task.taskId,
              tabId: task.tabId,
              windowId: task.windowId,
              aiType: task.aiType,
            },
          );
          return false;
        }

        return true;
      });

      // Step 4-6-6-C-5: unused/stream-processor-v2.jsのシンプルな実装に変更
      // 以下の複雑なフォールバック処理は削除

      ExecuteLogger.info(
        `⚡ [step4-execute.js] Step 4-6-6-${batchIndex + 2}-C: ${validBatchTasks.length}/${batch.length}の有効タスクを並列実行`,
      );

      // 🔍 [DEBUG] バッチタスク詳細情報ログ追加
      ExecuteLogger.info("🔍 [DEBUG-BATCH-EXECUTION] バッチタスク詳細:", {
        batchIndex: batchIndex + 1,
        totalBatches: batches.length,
        validTaskCount: validBatchTasks.length,
        originalTaskCount: batch.length,
        validTasks: validBatchTasks.map((task) => ({
          taskId: task.id || task.taskId || `${task.column}${task.row}`,
          aiType: task.aiType,
          prompt: task.prompt
            ? `${task.prompt.substring(0, 80)}...`
            : "❌ プロンプトなし",
          column: task.column,
          row: task.row,
          tabId: task.tabId,
          windowId: task.windowId,
          hasRequiredData: !!(task.prompt && task.tabId && task.windowId),
        })),
      });

      if (validBatchTasks.length === 0) {
        ExecuteLogger.error(
          `❌ [step4-execute.js] バッチ${batchIndex + 1}：実行可能なタスクがありません`,
        );
        ExecuteLogger.error(
          "🔍 [DEBUG-BATCH-EXECUTION] 元のバッチタスク検証失敗詳細:",
          {
            originalBatchLength: batch.length,
            failedTasks: batch.map((task) => ({
              taskId: task.id || task.taskId || `${task.column}${task.row}`,
              aiType: task.aiType,
              hasPrompt: !!task.prompt,
              hasTabId: !!task.tabId,
              hasWindowId: !!task.windowId,
              hasRequiredFields: !!(task.column && task.row),
              failureReason: !task.prompt
                ? "プロンプトなし"
                : !task.tabId
                  ? "tabIdなし"
                  : !task.windowId
                    ? "windowIdなし"
                    : "不明",
            })),
          },
        );
        continue; // 次のバッチへ
      }

      const batchPromises = validBatchTasks.map(async (task, index) => {
        const taskId = task.id || task.taskId || `${task.column}${task.row}`;
        const isThreeTypeTask =
          task.originalAiType === "3種類（ChatGPT・Gemini・Claude）";

        // 各タスク実行を段階的に開始（Chrome APIの過負荷を避ける）
        // Content Scriptの初期化完了を待つため、遅延を増やす
        if (index > 0) {
          const delay = index * 3000; // 3秒ずつずらす（Content Script初期化待ち）
          ExecuteLogger.info(
            `⏱️ Task ${index + 1} 開始待機: ${delay}ms（Content Script初期化待ち）`,
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
        } else {
          // 最初のタスクも5秒待機（ウィンドウ開いてすぐは初期化未完了の可能性）
          ExecuteLogger.info(
            `⏱️ 初回タスク開始前に5秒待機（Content Script初期化待ち）`,
          );
          await new Promise((resolve) => setTimeout(resolve, 5000));
        }

        try {
          // スプレッドシートで指定されたAI種別をそのまま使用
          ExecuteLogger.info(
            `📝 [step4-execute.js] タスク実行: ${taskId} (AI: ${task.aiType}) ${isThreeTypeTask ? "[3種類AI]" : "[通常]"}`,
          );

          // 🔍 [DEBUG] タスク実行前の詳細ログ
          ExecuteLogger.info("🔍 [DEBUG-TASK-START] タスク実行開始詳細:", {
            taskId: taskId,
            aiType: task.aiType,
            prompt: task.prompt
              ? `${task.prompt.substring(0, 100)}...`
              : "❌ プロンプトなし",
            tabId: task.tabId,
            windowId: task.windowId,
            hasPrompt: !!task.prompt,
            hasTabId: !!task.tabId,
            hasWindowId: !!task.windowId,
            column: task.column,
            row: task.row,
            isThreeTypeTask: isThreeTypeTask,
          });

          // 特別処理かチェック
          const specialInfo =
            window.specialTaskProcessor.identifySpecialTask(task);
          let result = null;

          ExecuteLogger.info("🔍 [DEBUG-TASK-TYPE] タスクタイプ判定:", {
            taskId: taskId,
            isSpecial: specialInfo.isSpecial,
            specialType: specialInfo.type,
            willUseSpecialProcessor: specialInfo.isSpecial,
          });

          if (specialInfo.isSpecial) {
            ExecuteLogger.info(`🔧 特別処理実行: ${specialInfo.type}`);
            const windowInfo = batchWindows.get(task.aiType);
            result = await window.specialTaskProcessor.executeSpecialTask(
              task,
              specialInfo,
              windowInfo,
            );
          } else {
            ExecuteLogger.info(`🤖 AI処理実行: ${task.aiType}`);

            // 正常なメッセージパッシングシステムを使用
            ExecuteLogger.info(
              `📋 [step4-execute.js] 正常なメッセージパッシング方式で実行: ${task.aiType}`,
            );

            // 🔍 [DEBUG] executeNormalAITask実行前ログ
            ExecuteLogger.info(
              "🔍 [DEBUG-EXECUTE-AI] executeNormalAITask実行前:",
              {
                taskId: taskId,
                aiType: task.aiType,
                tabId: task.tabId,
                windowId: task.windowId,
                functionExists: typeof executeNormalAITask === "function",
                taskObject: {
                  hasId: !!task.id,
                  hasTaskId: !!task.taskId,
                  hasPrompt: !!task.prompt,
                  hasTabId: !!task.tabId,
                  hasWindowId: !!task.windowId,
                  hasColumn: !!task.column,
                  hasRow: !!task.row,
                },
              },
            );

            result = await executeNormalAITask(task);

            // 🔍 [DEBUG] executeNormalAITask実行後ログ
            ExecuteLogger.info(
              "🔍 [DEBUG-EXECUTE-AI] executeNormalAITask実行後:",
              {
                taskId: taskId,
                resultReceived: !!result,
                resultType: typeof result,
                resultSuccess: result?.success,
                resultKeys: result ? Object.keys(result) : null,
              },
            );
          }

          // 結果処理
          await processTaskResult(task, result, taskId);

          return {
            taskId: taskId,
            aiType: task.aiType,
            success: result.success,
            result: result,
            specialProcessing: specialInfo.isSpecial,
            isThreeType: isThreeTypeTask,
          };
        } catch (error) {
          ExecuteLogger.error(`❌ タスク失敗: ${taskId}`, error);
          await window.windowLifecycleManager.handleTaskCompletion(task, {
            success: false,
            error: error.message,
          });

          return {
            taskId: taskId,
            aiType: task.aiType,
            success: false,
            error: error.message,
            specialProcessing: false,
            isThreeType: isThreeTypeTask,
          };
        }
      });

      // 全タスクの完了を待機
      const batchResults = await Promise.allSettled(batchPromises);

      // 結果を収集
      let successCount = 0;
      let failCount = 0;

      batchResults.forEach((pr) => {
        if (pr.status === "fulfilled") {
          results.push(pr.value);
          if (pr.value.success) {
            successCount++;
          } else {
            failCount++;
          }
        } else {
          failCount++;
        }
      });

      ExecuteLogger.info(
        `✅ [step4-execute.js] Step 4-6-6-${batchIndex + 2}-D: バッチ${batchIndex + 1}完了 - 成功: ${successCount}, 失敗: ${failCount}`,
      );

      // Step 4-6-6-E: バッチのウィンドウをクローズ
      ExecuteLogger.info(
        `🪟 [step4-execute.js] Step 4-6-6-${batchIndex + 2}-E: ウィンドウクローズ`,
      );

      for (const [taskIndex, windowInfo] of batchWindows) {
        try {
          await StepIntegratedWindowService.closeWindow(windowInfo.windowId);
          ExecuteLogger.info(`✅ タスク${taskIndex}ウィンドウクローズ完了`);

          // WindowControllerの配列からも削除（タブID再利用問題の修正）
          // taskIndexは数値なので、windowInfoからaiTypeを取得
          const aiType = windowInfo.aiType || "claude";
          const normalizedAiType =
            window.windowController?.normalizeAiType?.(aiType);
          if (
            normalizedAiType &&
            window.windowController?.openedWindows?.has(normalizedAiType)
          ) {
            const windowArray =
              window.windowController.openedWindows.get(normalizedAiType);
            if (Array.isArray(windowArray)) {
              const filteredArray = windowArray.filter(
                (w) => w.windowId !== windowInfo.windowId,
              );
              if (filteredArray.length > 0) {
                window.windowController.openedWindows.set(
                  normalizedAiType,
                  filteredArray,
                );
              } else {
                window.windowController.openedWindows.delete(normalizedAiType);
              }
              ExecuteLogger.info(
                `📋 WindowController配列を更新: ${normalizedAiType} (残り: ${filteredArray.length}個)`,
              );
            }
          }
        } catch (error) {
          ExecuteLogger.error(
            `⚠️ タスク${taskIndex}ウィンドウクローズエラー:`,
            error,
          );
        }
      }

      // 失敗がある場合は処理を停止
      if (failCount > 0) {
        ExecuteLogger.error(
          `🛑 [step4-execute.js] バッチ${batchIndex + 1}で${failCount}個のタスクが失敗したため、処理を停止します`,
        );
        break;
      }

      // バッチ間の待機時間
      if (batchIndex < batches.length - 1) {
        ExecuteLogger.info(`⏳ 次のバッチまで1秒待機`);
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    ExecuteLogger.info("🏁 [Step 4-6-6] 全タスク実行完了");
  } catch (error) {
    ExecuteLogger.error("❌ [Step 4-6] メイン実行エラー:", error);
    results.push({
      taskId: "SYSTEM_ERROR",
      aiType: "SYSTEM",
      success: false,
      error: error.message,
    });
  } finally {
    // Step 4-6-7: クリーンアップ処理
    ExecuteLogger.info("🧹 [Step 4-6-7] クリーンアップ処理開始");

    try {
      // 全ウィンドウのクリーンアップ（設定により制御可能）
      ExecuteLogger.debug(
        `🔧 [DEBUG] shouldPerformWindowCleanup呼び出し前 - 関数存在確認:`,
        typeof shouldPerformWindowCleanup,
      );
      const shouldCleanupWindows = shouldPerformWindowCleanup(results);
      if (shouldCleanupWindows) {
        await window.windowLifecycleManager.cleanupAllWindows();
      }
    } catch (cleanupError) {
      ExecuteLogger.error(
        "⚠️ [Step 4-6-7] クリーンアップエラー:",
        cleanupError,
      );
    }
  }

  ExecuteLogger.info("🏁 Step 4-6 Execute 統合実行完了", {
    totalTasks: enrichedTaskList?.length || 0,
    successfulTasks: results.filter((r) => r.success).length,
    failedTasks: results.filter((r) => !r.success).length,
    windowLayout: windowLayoutInfo?.length || 0,
  });

  // ========================================
  // Step 4-6: サブ関数群
  // ========================================

  /**
   * Content Scriptとの通信でタスクを実行
   */
  async function executeContentScriptTask(tabId, automationName, task) {
    ExecuteLogger.info(
      `📡 [Content Script] ${automationName} 実行開始 (Tab: ${tabId})`,
      {
        taskId: task.id,
        aiType: task.aiType,
        tabId: tabId,
        prompt: task.prompt ? `${task.prompt.substring(0, 50)}...` : null,
        model: task.model,
        function: task.function,
      },
    );

    return new Promise(async (resolve, reject) => {
      try {
        // タブの準備完了を待機（新しいリトライロジック）
        ExecuteLogger.info(
          `🔄 [Execute Task] タブ準備完了待機開始: tabId=${tabId}`,
        );
        const tab = await windowController.waitForTabReady(tabId, 10, 1000);
        ExecuteLogger.info(`✅ [Execute Task] タブ準備完了:`, {
          tabId: tab.id,
          status: tab.status,
          url: tab.url,
        });

        // URL有効性チェック
        if (
          !tab.url ||
          (!tab.url.includes("claude.ai") &&
            !tab.url.includes("chatgpt.com") &&
            !tab.url.includes("gemini.google.com"))
        ) {
          ExecuteLogger.error(`❌ [Tab Check] 不正なURL:`, {
            tabId: tab.id,
            url: tab.url,
            expectedDomains: ["claude.ai", "chatgpt.com", "gemini.google.com"],
          });
          reject(new Error(`タブID ${tabId} のURLが不正です: ${tab.url}`));
          return;
        }

        ExecuteLogger.info(`🔍 [Tab Check] 送信先タブ情報:`, {
          tabId: tab.id,
          url: tab.url,
          title: tab.title,
          status: tab.status,
          active: tab.active,
        });

        // タブが有効な場合のみメッセージ送信を続行
        sendMessageToValidTab();
      } catch (error) {
        ExecuteLogger.error(`❌ [Tab Check] タブ取得エラー:`, error);
        reject(new Error(`タブID ${tabId} が無効です: ${error.message}`));
        return;
      }

      async function sendMessageToValidTab() {
        // メッセージ送信（Manifest V3対応: Promise形式）
        try {
          ExecuteLogger.info(`🚀 [DEBUG-sendMessage] 送信開始:`, {
            tabId: tabId,
            automationName: automationName,
            taskId: task.id,
            aiType: task.aiType,
            messageAction: "executeTask",
            timestamp: new Date().toISOString(),
          });

          // 互換性のため複数の形式をサポート
          const messagePayload = {
            action: "executeTask",
            type: "CLAUDE_EXECUTE_TASK", // unusedコードと互換
            automationName: automationName,
            task: task,
            taskData: task, // 両方の形式に対応
          };

          ExecuteLogger.info(`📡 [DEBUG-sendMessage] メッセージ詳細:`, {
            payload: messagePayload,
            payloadKeys: Object.keys(messagePayload),
            taskKeys: Object.keys(task),
            taskPromptLength: task.prompt?.length || 0,
            タスクID: task.id,
            aiType: task.aiType,
            送信先TabID: tabId,
          });

          // ClaudeとClaude以外で処理を分岐
          if (automationName === "ClaudeAutomation") {
            // Claudeの場合: Content Script注入を行わず、直接メッセージを送信
            ExecuteLogger.info(
              `📝 [Claude Direct] manifest定義のContent Scriptに直接送信 (TabID: ${tabId})`,
            );

            // 🔍 STEP A: タブ情報確認（デバッグ用）
            try {
              const tab = await chrome.tabs.get(tabId);
              ExecuteLogger.info(`🔍 [STEP A] Claude タブ情報確認:`, {
                tabId: tabId,
                url: tab.url,
                title: tab.title,
                status: tab.status,
                isClaude: tab.url.includes("claude.ai"),
              });

              if (!tab.url.includes("claude.ai")) {
                throw new Error(
                  `Claude.ai以外のタブに送信しようとしました: ${tab.url}`,
                );
              }
            } catch (tabError) {
              ExecuteLogger.error(`❌ [STEP A-ERROR] タブ確認失敗:`, {
                tabId: tabId,
                error: tabError.message,
              });
              reject(new Error(`タブ確認失敗: ${tabError.message}`));
              return;
            }

            // 🔍 STEP B: Content Script存在確認
            try {
              ExecuteLogger.info(`🔍 [STEP B] Content Script存在確認開始...`);

              // Content Scriptのグローバル変数をチェック
              const scriptCheckResponse = await chrome.scripting.executeScript({
                target: { tabId: tabId },
                func: () => {
                  return {
                    CLAUDE_SCRIPT_LOADED: window.CLAUDE_SCRIPT_LOADED || false,
                    CLAUDE_SCRIPT_INIT_TIME:
                      window.CLAUDE_SCRIPT_INIT_TIME || null,
                    hasMessageListener: !!chrome?.runtime?.onMessage,
                    currentURL: window.location.href,
                    timestamp: new Date().toISOString(),
                    windowKeys: Object.keys(window).filter((k) =>
                      k.includes("CLAUDE"),
                    ),
                  };
                },
              });

              const scriptStatus = scriptCheckResponse[0].result;
              ExecuteLogger.info(`🔍 [STEP B] Content Script状態確認結果:`, {
                tabId: tabId,
                scriptLoaded: scriptStatus.CLAUDE_SCRIPT_LOADED,
                initTime: scriptStatus.CLAUDE_SCRIPT_INIT_TIME,
                hasMessageListener: scriptStatus.hasMessageListener,
                url: scriptStatus.currentURL,
                checkTime: scriptStatus.timestamp,
                claudeKeys: scriptStatus.windowKeys,
              });

              if (!scriptStatus.CLAUDE_SCRIPT_LOADED) {
                ExecuteLogger.error(
                  `❌ [STEP B-ERROR] Content Scriptが未初期化:`,
                  {
                    tabId: tabId,
                    reason: "window.CLAUDE_SCRIPT_LOADED = false",
                    manifestPath: "4-2-claude-automation.js",
                    checkResult: scriptStatus,
                  },
                );
                // この場合もメッセージ送信を試行するが、警告を出力
                ExecuteLogger.warn(
                  `⚠️ [STEP B-WARN] Content Script未初期化でもメッセージ送信を試行します`,
                );
              } else {
                ExecuteLogger.info(
                  `✅ [STEP B-SUCCESS] Content Script正常初期化確認`,
                );
              }
            } catch (scriptCheckError) {
              ExecuteLogger.error(`❌ [STEP B-ERROR] Content Script確認失敗:`, {
                tabId: tabId,
                error: scriptCheckError.message,
                reason: "chrome.scripting.executeScript実行失敗",
                stack: scriptCheckError.stack,
              });
              // エラーでもメッセージ送信を試行する
              ExecuteLogger.warn(
                `⚠️ [STEP B-WARN] Content Script確認失敗でもメッセージ送信を試行します`,
              );
            }
          } else {
            // Claude以外のAI: 従来通りContent Script注入チェック
            ExecuteLogger.info(
              `📝 [Content Script注入] ${automationName} 初期化チェック開始 (TabID: ${tabId})`,
            );

            try {
              // まず既存のContent Scriptの存在を確認
              let isScriptReady = false;
              let retryCount = 0;
              const maxRetries = 3;

              while (!isScriptReady && retryCount < maxRetries) {
                try {
                  const checkResponse = await Promise.race([
                    chrome.tabs.sendMessage(tabId, { action: "ping" }),
                    new Promise((_, reject) =>
                      setTimeout(() => reject(new Error("Ping timeout")), 1000),
                    ),
                  ]);
                  if (checkResponse && checkResponse.ready) {
                    isScriptReady = true;
                    ExecuteLogger.info(
                      `♻️ [Content Script注入] 既存のスクリプトが応答 - 注入をスキップ`,
                      {
                        ...checkResponse,
                        試行回数: retryCount + 1,
                      },
                    );
                  }
                } catch (pingError) {
                  retryCount++;
                  ExecuteLogger.info(
                    `📝 [Content Script注入] ping応答なし (試行 ${retryCount}/${maxRetries})`,
                  );
                  if (retryCount < maxRetries) {
                    await new Promise((resolve) => setTimeout(resolve, 500));
                  }
                }
              }

              // スクリプトが準備できていない場合のみ注入（Claude以外のみ）
              if (!isScriptReady) {
                ExecuteLogger.info(
                  `🔧 [Content Script注入] 新規スクリプト注入開始`,
                );

                // automationNameからファイル名を決定
                let scriptFile;
                switch (automationName) {
                  case "ChatGPTAutomationV2":
                    scriptFile = "3-2-gpt-automation.js";
                    break;
                  case "ClaudeAutomation":
                    scriptFile = "4-2-claude-automation.js";
                    break;
                  case "GeminiAutomation":
                    scriptFile = "5-2-gemini-automation.js";
                    break;
                  case "GensparkAutomationV2":
                    scriptFile = "6-2-genspark-automation.js";
                    break;
                  default:
                    throw new Error(`未知のautomationName: ${automationName}`);
                }

                const injectionResults = await chrome.scripting.executeScript({
                  target: { tabId: tabId },
                  files: [scriptFile],
                });

                ExecuteLogger.info(`📋 [Content Script注入] 注入結果:`, {
                  tabId: tabId,
                  scriptFile: scriptFile,
                  resultsCount: injectionResults.length,
                });

                // 初期化待機
                await new Promise((resolve) => setTimeout(resolve, 2000));
              }

              ExecuteLogger.info(
                `✅ [Content Script注入] ${automationName} スクリプト準備完了`,
              );
            } catch (injectionError) {
              ExecuteLogger.error(`❌ [Content Script注入] 準備失敗:`, {
                tabId: tabId,
                error: injectionError.message,
                stack: injectionError.stack,
              });
              reject(
                new Error(`Content Script準備失敗: ${injectionError.message}`),
              );
              return;
            }
          }

          const sendStartTime = Date.now();

          // 🔍 STEP C: メッセージ送信実行
          ExecuteLogger.info(`🔍 [STEP C] メッセージ送信開始:`, {
            tabId: tabId,
            messageType: messagePayload.type || messagePayload.action,
            messageSize: JSON.stringify(messagePayload).length,
            timestamp: new Date().toISOString(),
          });

          // タイムアウト設定を20秒に延長（unusedコードと同じ）
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(
              () => reject(new Error("sendMessage timeout after 20 seconds")),
              20000,
            );
          });

          let response;
          try {
            // Claudeの場合はchrome.scripting.executeScriptを使用
            if (automationName === "ClaudeAutomation") {
              ExecuteLogger.info(
                `🔍 [STEP C-1] chrome.scripting.executeScript実行中...`,
              );

              const results = await Promise.race([
                chrome.scripting.executeScript({
                  target: { tabId: tabId },
                  func: async (taskData) => {
                    try {
                      // Content Script内のexecuteTask関数を直接呼び出し
                      if (typeof window.executeTask !== "function") {
                        throw new Error(
                          "executeTask function is not available",
                        );
                      }

                      console.log("📤 Executing task with data:", taskData);
                      const result = await window.executeTask(taskData);

                      if (result) {
                        return {
                          success: true,
                          message: "Task executed successfully",
                          result: result,
                          timestamp: Date.now(),
                        };
                      } else {
                        return {
                          success: false,
                          message: "Task execution failed",
                          timestamp: Date.now(),
                        };
                      }
                    } catch (error) {
                      console.error("❌ executeTask error:", error);
                      return {
                        success: false,
                        error: error.message,
                        timestamp: Date.now(),
                      };
                    }
                  },
                  args: [messagePayload.task || messagePayload.taskData],
                }),
                timeoutPromise,
              ]);

              response =
                results && results[0]
                  ? results[0].result
                  : { success: false, error: "No response" };
            } else {
              // 他のAIは従来通りchrome.tabs.sendMessage
              ExecuteLogger.info(
                `🔍 [STEP C-1] chrome.tabs.sendMessage実行中...`,
              );
              response = await Promise.race([
                chrome.tabs.sendMessage(tabId, messagePayload),
                timeoutPromise,
              ]);
            }

            ExecuteLogger.info(`🔍 [STEP C-2] メッセージ送信成功:`, {
              tabId: tabId,
              responseReceived: !!response,
              responseType: typeof response,
              responseSuccess: response?.success,
              automationName: automationName,
            });
          } catch (timeoutError) {
            ExecuteLogger.error(`❌ [STEP C-ERROR] メッセージ送信失敗:`, {
              error: timeoutError.message,
              tabId: tabId,
              taskId: task.id,
              errorType: "timeout_or_communication_failure",
            });
            throw timeoutError;
          }

          const sendDuration = Date.now() - sendStartTime;

          ExecuteLogger.info(
            `📨 [DEBUG-sendMessage] 送信完了 (${sendDuration}ms):`,
            {
              tabId: tabId,
              responseExists: !!response,
              responseType: typeof response,
              responseKeys: response ? Object.keys(response) : [],
              responseSuccess: response?.success,
              responseError: response?.error,
              sendDuration: sendDuration,
            },
          );

          if (!response) {
            ExecuteLogger.error(
              `❌ [Content Script] 応答なし - Chrome Runtime情報:`,
              {
                tabId: tabId,
                lastError: chrome.runtime.lastError?.message,
                sendDuration: sendDuration,
              },
            );
            reject(new Error("Content Scriptからの応答がありません"));
            return;
          }

          if (response.success) {
            ExecuteLogger.info(
              `✅ [Content Script] ${automationName} 実行完了`,
            );
            resolve(response);
          } else {
            ExecuteLogger.error(
              `❌ [Content Script] 実行失敗:`,
              response.error,
            );
            reject(new Error(response.error || "不明なエラー"));
          }
        } catch (error) {
          ExecuteLogger.error(`❌ [Content Script] 通信エラー:`, error);
          reject(new Error(`Content Script通信エラー: ${error.message}`));
        }

        // 注意: メイン処理のタイムアウトは上記のPromise.raceで管理済み
        // 追加のタイムアウトは設定しない（重複タイムアウトを防ぐ）
      }
    });
  }

  /**
   * Step 4-6-8: 通常AI処理の実行
   */
  async function executeNormalAITask(task) {
    ExecuteLogger.info(
      `🤖 [step4-execute.js] Step 4-6-8: 通常AI処理実行開始: ${task.aiType}`,
    );

    const taskId = task.id || task.taskId || `${task.column}${task.row}`;
    const cellPosition = `${task.column || task.cellInfo?.column}${task.row || task.cellInfo?.row}`;

    // 注: 3種類AI判定は Step 4-6-0 で既に展開済みのため、ここでは不要

    // Step 4-6-8-1: AI種別の正規化
    let normalizedAiType = task.aiType;
    if (task.aiType === "single" || !task.aiType) {
      ExecuteLogger.info(
        `[step4-execute.js] Step 4-6-8-2: AIタイプ '${task.aiType}' を 'Claude' に変換`,
      );
      normalizedAiType = "Claude";
    }

    // Step 4-6-8-2: 正しいタブIDを取得
    const normalizedKey =
      window.windowController.normalizeAiType(normalizedAiType);
    const windowInfo =
      task.tabId && task.windowId
        ? { tabId: task.tabId, windowId: task.windowId }
        : window.windowController.openedWindows.get(normalizedKey);

    const targetTabId = windowInfo?.tabId;

    ExecuteLogger.info(`🔍 [DEBUG-TabCheck] タブID確認: ${normalizedAiType}`, {
      normalizedKey: normalizedKey,
      windowInfo: !!windowInfo,
      tabId: targetTabId,
      windowId: windowInfo?.windowId,
      url: windowInfo?.url,
      taskProvidedTabId: task.tabId,
      taskProvidedWindowId: task.windowId,
      tabIdMatch: task.tabId === targetTabId,
      openedWindowsSize: window.windowController.openedWindows.size,
      allWindows: Array.from(
        window.windowController.openedWindows.entries(),
      ).map(([key, info]) => ({
        key,
        tabId: info.tabId,
        windowId: info.windowId,
        url: info.url,
      })),
    });

    if (task.tabId && task.tabId !== targetTabId) {
      ExecuteLogger.warn(`⚠️ [DEBUG-TabCheck] タブID不整合検出:`, {
        taskProvidedTabId: task.tabId,
        windowControllerTabId: targetTabId,
        willUseTabId: targetTabId,
        normalizedKey: normalizedKey,
      });
    }

    if (!targetTabId) {
      throw new Error(
        `${normalizedAiType} のタブが見つかりません (Key: ${normalizedKey})`,
      );
    }

    // Step 4-6-8-3: タスク開始ログ記録
    if (window.detailedLogManager) {
      window.detailedLogManager.recordTaskStart(task, windowInfo);
    }

    // Step 4-6-8-3: AI自動化ファイルの読み込み確認（全AI対応）
    const aiType = normalizedAiType.toLowerCase();
    if (!window.aiAutomationLoader.isAIAvailable(aiType)) {
      ExecuteLogger.info(
        `[step4-execute.js] Step 4-6-8-3: ${normalizedAiType} 自動化ファイルを読み込み中...`,
      );
      await window.aiAutomationLoader.loadAIFile(aiType);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } else {
      ExecuteLogger.info(
        `[step4-execute.js] Step 4-6-8-3: ${normalizedAiType} 自動化ファイルは読み込み済み`,
      );
    }

    // Step 4-6-8-4: 送信時刻記録
    if (window.detailedLogManager) {
      window.detailedLogManager.recordSendTime(taskId, windowInfo?.url);
    }

    // Step 4-6-8-5: Retry機能付きでAI実行
    ExecuteLogger.info(
      `[step4-execute.js] Step 4-6-8-5: ${normalizedAiType}実行準備`,
    );
    const executeFunction = async () => {
      switch (aiType) {
        case "chatgpt":
          return await executeContentScriptTask(
            targetTabId,
            "ChatGPTAutomationV2",
            task,
          );

        case "claude":
          return await executeContentScriptTask(
            targetTabId,
            "ClaudeAutomation",
            task,
          );

        case "gemini":
          return await executeContentScriptTask(
            targetTabId,
            "GeminiAutomation",
            task,
          );

        case "genspark":
          return await executeContentScriptTask(
            targetTabId,
            "GensparkAutomationV2",
            task,
          );

        case "report":
          if (!window.ReportAutomation)
            throw new Error("Report Automation が利用できません");
          return await window.ReportAutomation.executeTask(
            task,
            task.spreadsheetData || {},
          );

        default:
          throw new Error(`未対応のAI種別: ${aiType}`);
      }
    };

    const result = await window.windowLifecycleManager.executeWithRetry(
      executeFunction,
      task,
      `${normalizedAiType} AI実行`,
    );

    ExecuteLogger.info(`✅ [Step 4-6-8] 通常AI処理実行完了: ${task.aiType}`);
    return result;
  }

  /**
   * Step 4-6-9: タスク結果の処理
   */
  async function processTaskResult(task, result, taskId) {
    ExecuteLogger.info(`📋 [Step 4-6-9] タスク結果処理開始: ${taskId}`);

    try {
      // 完了時刻とログ記録
      if (window.detailedLogManager) {
        window.detailedLogManager.recordTaskComplete(taskId, result);
      }

      // 回答をスプレッドシートに記載
      if (result.success && result.response) {
        const answerCellRef =
          task.answerCellRef || task.cellRef || `${task.column}${task.row}`;
        if (window.detailedLogManager) {
          await window.detailedLogManager.writeAnswerToSpreadsheet(
            taskId,
            answerCellRef,
          );
        }
      }

      // ログをスプレッドシートに記載
      ExecuteLogger.debug(
        `🔧 [DEBUG] calculateLogCellRef呼び出し前 - 関数存在確認:`,
        typeof calculateLogCellRef,
      );
      const logCellRef = task.logCellRef || calculateLogCellRef(task);
      if (logCellRef && window.detailedLogManager) {
        await window.detailedLogManager.writeLogToSpreadsheet(
          taskId,
          logCellRef,
        );
      }

      // ライフサイクル完了処理
      await window.windowLifecycleManager.handleTaskCompletion(task, result);

      ExecuteLogger.info(`✅ [Step 4-6-9] タスク結果処理完了: ${taskId}`);
    } catch (error) {
      ExecuteLogger.error(
        `❌ [Step 4-6-9] タスク結果処理エラー: ${taskId}`,
        error,
      );
    }
  }

  /**
   * ログセル位置の計算
   */
  function calculateLogCellRef(task) {
    const cellRef = task.cellRef || `${task.column}${task.row}`;
    if (!cellRef) return null;

    // 簡単な実装: A列をログ列として使用
    const match = cellRef.match(/^([A-Z]+)(\d+)$/);
    if (match) {
      return `A${match[2]}`;
    }
    return null;
  }

  /**
   * ウィンドウクリーンアップ判定
   */
  function shouldPerformWindowCleanup(results) {
    // エラーが多い場合はウィンドウを保持（デバッグ用）
    const errorCount = results.filter((r) => !r.success).length;
    const totalCount = results.length;

    if (totalCount === 0) return true;

    const errorRate = errorCount / totalCount;
    return errorRate < 0.5; // エラー率50%未満の場合はクリーンアップ
  }

  // executeStep4関数定義完了
  return results;
}

// ステップ4実行関数をグローバルに公開
try {
  ExecuteLogger.info("🔧 [DEBUG] executeStep4関数グローバル公開開始:", {
    executeStep4Type: typeof executeStep4,
    executeStep4Exists: typeof executeStep4 === "function",
    executeStep4Name: executeStep4?.name,
    windowAvailable: typeof window !== "undefined",
  });

  if (typeof window !== "undefined" && typeof executeStep4 === "function") {
    window.executeStep4 = executeStep4;

    // 即座に検証
    ExecuteLogger.info(
      "✅ [DEBUG] window.executeStep4エクスポート完了・検証:",
      {
        windowExecuteStep4Type: typeof window.executeStep4,
        windowExecuteStep4Exists: typeof window.executeStep4 === "function",
        windowExecuteStep4Name: window.executeStep4?.name,
        canCallFunction: !!(
          window.executeStep4 && typeof window.executeStep4 === "function"
        ),
        globalAccess: typeof globalThis?.executeStep4 === "function",
      },
    );
  } else {
    throw new Error(
      `関数公開失敗: executeStep4=${typeof executeStep4}, window=${typeof window}`,
    );
  }
} catch (error) {
  log.error("❌ [step4-tasklist.js] executeStep4関数公開エラー:", error);
  if (typeof window !== "undefined") {
    window.step4FileError = error.message;
  }
}

ExecuteLogger.debug("🔍 [DEBUG] step4-execute.js 読み込み開始");

ExecuteLogger.debug("✅ [DEBUG] クラス定義完了:", "AIAutomationLoader");
ExecuteLogger.debug("✅ [DEBUG] クラス定義完了:", "TaskGroupTypeDetector");
ExecuteLogger.debug("✅ [DEBUG] クラス定義完了:", "WindowController");
ExecuteLogger.debug("✅ [DEBUG] クラス定義完了:", "SpreadsheetDataManager");
ExecuteLogger.debug("✅ [DEBUG] クラス定義完了:", "DetailedLogManager");
ExecuteLogger.debug("✅ [DEBUG] クラス定義完了:", "WindowLifecycleManager");
ExecuteLogger.debug("✅ [DEBUG] クラス定義完了:", "SpecialTaskProcessor");

// ========================================
// Export to window for global access
// ========================================
if (typeof window !== "undefined") {
  window.executeStep4 = executeStep4;

  // WindowControllerクラスを常にエクスポート（完全版を確実に使用）
  window.WindowController = WindowController;

  // 既存インスタンスの確認ログ
  if (window.windowController) {
    ExecuteLogger.info("🔍 既存のWindowControllerを置き換えます:", {
      hasOpenWindows: typeof window.windowController.openWindows === "function",
      methods: window.windowController.constructor.name,
    });
  }

  // windowControllerインスタンスを常に新規作成（完全版を確実に使用）
  window.windowController = new WindowController();
  window.windowController.initializeWindowService();
  ExecuteLogger.info("✅ WindowController インスタンス作成・初期化（完全版）", {
    hasOpenWindows: typeof window.windowController.openWindows === "function",
    hasCloseWindows: typeof window.windowController.closeWindows === "function",
    hasCheckWindows: typeof window.windowController.checkWindows === "function",
  });

  ExecuteLogger.info("✅ executeStep4 exported to window");
  ExecuteLogger.info(
    `✅ WindowController status: ${window.windowController ? "initialized" : "not initialized"}`,
  );
}

// ========================================
// ファイル読み込み完了通知
// ========================================
try {
  log.debug("✅ [step4-tasklist.js] ファイル読み込み完了", {
    executeStep4Defined: typeof executeStep4,
    windowExecuteStep4: typeof window.executeStep4,
    timestamp: new Date().toISOString(),
    windowObject: !!window,
    chromeApis: {
      windows: !!chrome?.windows,
      tabs: !!chrome?.tabs,
      scripting: !!chrome?.scripting,
    },
  });

  // グローバルエラーフラグをリセット
  if (typeof window !== "undefined") {
    window.step4FileError = null;
  }
} catch (error) {
  log.error("❌ [step4-tasklist.js] ファイル読み込み完了時エラー:", error);
  if (typeof window !== "undefined") {
    window.step4FileError = error.message;
  }
}
