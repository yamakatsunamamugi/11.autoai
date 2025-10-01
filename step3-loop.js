// SpreadsheetDataクラスをインポート
import SpreadsheetData from "./spreadsheet-data.js";

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
 * @fileoverview ステップ5: タスクグループ内の繰り返し処理
 *
 * overview.mdのステップ番号体系を完全遵守：
 *
 * ステップ5: タスクグループ内の繰り返し
 * - 5-1: 完了状況の確認
 *   - 5-1-1: プロンプト列の確認
 *   - 5-1-2: 回答列の確認
 *   - 5-1-3: 完了判定
 * - 5-2: 未完了タスクの処理
 *   - 5-2-1: ステップ3へ戻る
 *   - 5-2-2: ステップ4を実行
 *   - 5-2-3: 繰り返し
 */

// =======================================
// 簡易ログシステム（LoopLogger）
// =======================================
const LoopLogger = {
  logLevel: "INFO",
  logLevels: { ERROR: 0, WARN: 1, INFO: 2, DEBUG: 3 },
  retryCount: new Map(),

  shouldLog(level) {
    return this.logLevels[level] <= this.logLevels[this.logLevel];
  },

  error(msg, data) {},

  warn(msg, data) {},

  info(msg, data) {},

  debug(msg, data) {},

  // ループ処理専用の集約ログ
  logLoop(iteration, maxIterations, tasksRemaining) {},
};

// デフォルトログレベル設定
const isDebugMode = localStorage.getItem("loopLogLevel") === "DEBUG";
LoopLogger.logLevel = isDebugMode ? "DEBUG" : "INFO";

// step3-loop.js 読み込み開始

// ファイルの文字エンコーディングチェック
try {
  const testString = "テスト文字列：日本語、英語、記号!@#$%";
  // 文字エンコーディングテスト
} catch (e) {
  // 文字エンコーディングエラー
}

// グローバル状態を使用（他のステップと共有）
// グローバル状態チェック

if (!window.globalState) {
  const initTimestamp = new Date().toISOString();
  const initSource = "step3-loop.js";

  // 🔍 [GLOBAL-STATE] グローバル状態初期化ログ
  log.debug(`🔍 [GLOBAL-STATE] globalState初期化開始:`, {
    initTimestamp,
    initSource,
    previousState: window.globalState,
    callStack: new Error().stack.split("\n").slice(1, 4),
  });

  // グローバル状態を初期化
  window.globalState = {
    spreadsheetId: null,
    gid: null,
    currentGroup: null,
    stats: {
      totalPrompts: 0,
      completedAnswers: 0,
      pendingTasks: 0,
      totalGroups: 0,
      completedGroups: 0,
      totalTasks: 0,
      successTasks: 0,
      failedTasks: 0,
      retryCount: 0,
    },
  };
}

// ========================================
// DynamicSearch協調システム
// ========================================

/**
 * DynamicSearchからの制御移譲シグナルを初期化・監視
 * 【追加】ハイブリッド協調モデル: step3-loop.jsでの受信機能
 */
function initializeDynamicSearchCoordination() {
  log.debug("🔗 [step3-loop.js] DynamicSearch協調システムを初期化中...");

  // 【方法1】カスタムイベントリスナーを設定
  if (typeof window !== "undefined" && window.addEventListener) {
    // 既存のリスナーを削除（重複登録防止）
    window.removeEventListener(
      "dynamicSearchGroupCompleted",
      handleDynamicSearchCompletion,
    );

    // 新しいリスナーを登録
    window.addEventListener(
      "dynamicSearchGroupCompleted",
      handleDynamicSearchCompletion,
    );
    log.debug(
      "✅ [step3-loop.js] カスタムイベントリスナー登録完了: dynamicSearchGroupCompleted",
    );
  }

  // 【方法2】直接コールバック関数を設定
  window.onDynamicSearchGroupCompleted = function (data) {
    log.info("📡 [step3-loop.js] DynamicSearch直接コールバック受信:", {
      groupNumber: data.groupNumber,
      groupData: data.groupData,
      timestamp: new Date().toISOString(),
    });

    handleDynamicSearchCompletionData({
      detail: {
        groupNumber: data.groupNumber,
        transferControl: true,
        timestamp: new Date().toISOString(),
        source: "DirectCallback",
      },
    });
  };

  // 【方法3】globalState監視用のポーリング開始
  initializeGlobalStateMonitoring();

  log.info("🔗 [step3-loop.js] DynamicSearch協調システム初期化完了");
}

/**
 * DynamicSearchからの制御移譲イベントハンドラー
 * 【追加】ハイブリッド協調モデル: イベント受信時の処理
 */
function handleDynamicSearchCompletion(event) {
  log.info("📡 [step3-loop.js] DynamicSearchから制御移譲イベント受信:", {
    groupNumber: event.detail?.groupNumber,
    groupType: event.detail?.groupType,
    source: event.detail?.source,
    timestamp: event.detail?.timestamp,
  });

  handleDynamicSearchCompletionData(event);
}

/**
 * DynamicSearch完了データの共通処理
 * 【追加】ハイブリッド協調モデル: 完了通知の統一処理
 */
function handleDynamicSearchCompletionData(event) {
  try {
    const { groupNumber, transferControl, timestamp, source } =
      event.detail || {};

    if (!transferControl) {
      log.debug("🔄 [step3-loop.js] 制御移譲不要 - 処理継続");
      return;
    }

    log.info("🎯 [step3-loop.js] DynamicSearch制御移譲を受信:", {
      completedGroup: groupNumber,
      source: source || "Unknown",
      currentGroup: window.globalState.currentGroup?.groupNumber,
      timestamp,
    });

    // グループ完了をglobalStateに記録
    if (window.globalState) {
      if (!window.globalState.completedGroupsByDynamicSearch) {
        window.globalState.completedGroupsByDynamicSearch = new Set();
      }

      // 🛡️ 【安全装置】グループを完了済みにマークする前に実際に完了しているか確認
      const targetGroup = window.globalState?.taskGroups?.find(
        (g) => g.groupNumber === groupNumber,
      );
      if (targetGroup) {
        checkCompletionStatus(targetGroup)
          .then((isActuallyCompleted) => {
            if (isActuallyCompleted) {
              window.globalState.completedGroupsByDynamicSearch.add(
                groupNumber,
              );
              log.info(
                "✅ [SAFETY-CHECK] グループ完了確認済み - 完了リストに追加:",
                {
                  groupNumber,
                  verificationPassed: true,
                },
              );
            } else {
              log.error(
                "🚨 [SAFETY-CHECK] 完了マーキング阻止 - グループに未処理タスクあり:",
                {
                  groupNumber,
                  reason: "DynamicSearchからの完了通知だが実際は未完了",
                  action: "完了リストに追加せず",
                },
              );
            }
          })
          .catch((error) => {
            log.error(
              "❌ [SAFETY-CHECK] 完了確認エラー - 安全のため完了マーキング拒否:",
              {
                groupNumber,
                error: error.message,
              },
            );
          });
      } else {
        // フォールバック: グループが見つからない場合はマークしない
        log.warn(
          "⚠️ [SAFETY-CHECK] 対象グループ未発見 - 完了マーキングスキップ:",
          {
            groupNumber,
            availableGroups: window.globalState?.taskGroups?.map(
              (g) => g.groupNumber,
            ),
          },
        );
      }

      // 協調フラグを設定
      window.globalState.dynamicSearchCoordination = {
        lastCompletedGroup: groupNumber,
        transferReceived: true,
        processedAt: new Date().toISOString(),
        shouldSkipProcessing: true,
        source: source,
      };

      log.debug("✅ [step3-loop.js] globalState協調情報更新完了");
    }

    // 現在処理中のグループが完了したグループと一致する場合
    if (window.globalState.currentGroup?.groupNumber === groupNumber) {
      log.info(
        "🏁 [step3-loop.js] 現在のグループがDynamicSearchで完了 - 次グループへ移行準備",
      );

      // 完了フラグを設定（processIncompleteTasks内のループを終了させる）
      window.globalState.currentGroup.dynamicSearchCompleted = true;
    }
  } catch (error) {
    log.error("❌ [step3-loop.js] DynamicSearch制御移譲処理エラー:", error);
  }
}

/**
 * globalState監視によるDynamicSearch通知検出
 * 【追加】ハイブリッド協調モデル: ポーリングベースの監視
 */
function initializeGlobalStateMonitoring() {
  // ポーリング間隔（1秒）
  const POLLING_INTERVAL = 1000;
  let lastCheckedTimestamp = null;

  const checkGlobalStateNotifications = () => {
    try {
      const notification = window.globalState?.dynamicSearchNotification;

      if (
        notification &&
        notification.type === "GROUP_COMPLETED" &&
        notification.requestControlTransfer &&
        notification.timestamp !== lastCheckedTimestamp
      ) {
        log.info("📊 [step3-loop.js] globalState経由でDynamicSearch通知検出:", {
          groupNumber: notification.groupNumber,
          timestamp: notification.timestamp,
        });

        // イベントデータ形式に変換してハンドラーに渡す
        handleDynamicSearchCompletionData({
          detail: {
            groupNumber: notification.groupNumber,
            transferControl: true,
            timestamp: notification.timestamp,
            source: "GlobalStatePolling",
          },
        });

        lastCheckedTimestamp = notification.timestamp;
      }
    } catch (error) {
      log.debug(
        "🔍 [step3-loop.js] globalState監視エラー（継続）:",
        error.message,
      );
    }
  };

  // ポーリング開始
  if (typeof window !== "undefined") {
    window.dynamicSearchPollingInterval = setInterval(
      checkGlobalStateNotifications,
      POLLING_INTERVAL,
    );
    log.debug("🔄 [step3-loop.js] globalState監視ポーリング開始");
  }
}

/**
 * DynamicSearchとの協調状態をチェック
 * 【追加】ハイブリッド協調モデル: グループスキップ判定
 */
async function shouldSkipGroupProcessing(taskGroup) {
  try {
    // 🚨 【詳細デバッグ】スキップ判定の全状態をログ出力
    const completedGroups = window.globalState?.completedGroupsByDynamicSearch;
    const coordination = window.globalState?.dynamicSearchCoordination;

    log.info("🔍 [SKIP-DEBUG] shouldSkipGroupProcessing詳細調査:", {
      groupNumber: taskGroup.groupNumber,
      groupType: taskGroup.type || taskGroup.taskType,
      columnRange: `${taskGroup.columns?.prompts?.[0]} 〜 ${taskGroup.columns?.answer?.primary || taskGroup.columns?.answer?.claude}`,
      completedGroups: {
        exists: !!completedGroups,
        type: typeof completedGroups,
        size: completedGroups?.size || 0,
        hasThisGroup: completedGroups?.has(taskGroup.groupNumber),
        allGroups: completedGroups ? Array.from(completedGroups) : null,
      },
      coordination: {
        exists: !!coordination,
        shouldSkipProcessing: coordination?.shouldSkipProcessing,
        lastCompletedGroup: coordination?.lastCompletedGroup,
        matchesThisGroup:
          coordination?.lastCompletedGroup === taskGroup.groupNumber,
      },
      globalState: {
        exists: !!window.globalState,
        hasCompletedGroups:
          !!window.globalState?.completedGroupsByDynamicSearch,
        hasCoordination: !!window.globalState?.dynamicSearchCoordination,
      },
      timestamp: new Date().toISOString(),
    });

    // DynamicSearchで完了済みのグループかチェック
    if (completedGroups && completedGroups.has(taskGroup.groupNumber)) {
      log.error("🚨 [SKIP-REASON] DynamicSearchで完了済みと判定:", {
        groupNumber: taskGroup.groupNumber,
        reason: "DynamicSearch completed",
        completedGroupsContent: Array.from(completedGroups),
        skipDecision: true,
      });
      return true;
    }

    // 協調フラグによるスキップ判定
    if (
      coordination?.shouldSkipProcessing &&
      coordination.lastCompletedGroup === taskGroup.groupNumber
    ) {
      log.error("🚨 [SKIP-REASON] 協調フラグによりスキップ:", {
        groupNumber: taskGroup.groupNumber,
        reason: "Coordination flag",
        shouldSkipProcessing: coordination.shouldSkipProcessing,
        lastCompletedGroup: coordination.lastCompletedGroup,
        skipDecision: true,
      });

      // スキップフラグをリセット（1回のみ有効）
      coordination.shouldSkipProcessing = false;
      return true;
    }

    // 【新規追加】実際の完了状態チェック
    // DynamicSearch状態に関係なく、実際のデータで完了状態を確認
    try {
      const actualCompletion = await checkCompletionStatus(taskGroup);
      if (actualCompletion) {
        log.info("🔍 [SKIP-DEBUG] 実際の完了状態によりスキップ:", {
          groupNumber: taskGroup.groupNumber,
          reason: "Actually completed (checkCompletionStatus)",
          skipDecision: true,
        });
        return true;
      }
    } catch (completionError) {
      log.warn("⚠️ [SKIP-DEBUG] 完了状態チェックエラー:", {
        groupNumber: taskGroup.groupNumber,
        error: completionError.message,
        reason: "Completion check failed, continuing with processing",
      });
    }

    // スキップしない場合もログ出力
    log.info("✅ [SKIP-DEBUG] グループ処理継続:", {
      groupNumber: taskGroup.groupNumber,
      reason: "No skip conditions met",
      skipDecision: false,
    });

    return false;
  } catch (error) {
    log.error("❌ [step3-loop.js] スキップ判定エラー:", {
      error: error.message,
      stack: error.stack,
      groupNumber: taskGroup?.groupNumber,
      timestamp: new Date().toISOString(),
    });
    return false;
  }
}

// ========================================
// globalState.currentGroup 一元管理システム
// ========================================

/**
 * currentGroupの一元管理システム
 * 【追加】ハイブリッド協調モデル: 統一状態管理
 */
class CurrentGroupManager {
  constructor() {
    this.listeners = new Set();
    this.updateHistory = [];
    this.maxHistorySize = 10;
    this.lastUpdateTimestamp = null;
    this.updateLock = false;

    log.debug("🔧 [CurrentGroupManager] 初期化完了");
  }

  /**
   * currentGroupを安全に更新
   * @param {Object} newGroup - 新しいグループ情報
   * @param {string} source - 更新元（"step3-loop" | "DynamicSearch" | "system"）
   * @returns {boolean} 更新成功
   */
  async updateCurrentGroup(newGroup, source = "system") {
    // 更新ロック処理
    if (this.updateLock) {
      log.debug("⏳ [CurrentGroupManager] 更新ロック中 - 待機");
      await this.waitForUnlock();
    }

    this.updateLock = true;

    try {
      const oldGroup = window.globalState?.currentGroup;
      const timestamp = new Date().toISOString();

      // 検証: 同じグループへの重複更新をスキップ
      if (
        oldGroup?.groupNumber === newGroup?.groupNumber &&
        oldGroup?.taskType === newGroup?.taskType
      ) {
        log.debug("🔄 [CurrentGroupManager] 同じグループへの更新 - スキップ", {
          groupNumber: newGroup.groupNumber,
          source,
        });
        return true;
      }

      // グローバル状態を更新
      if (!window.globalState) {
        window.globalState = {};
      }

      const previousGroup = window.globalState.currentGroup;
      window.globalState.currentGroup = {
        ...newGroup,
        _metadata: {
          updatedBy: source,
          updatedAt: timestamp,
          previousGroup: previousGroup?.groupNumber || null,
        },
      };

      // 更新履歴を記録
      this.recordUpdate({
        from: oldGroup,
        to: newGroup,
        source,
        timestamp,
      });

      log.info("✅ [CurrentGroupManager] currentGroup更新完了:", {
        previousGroup: oldGroup?.groupNumber || "none",
        newGroup: newGroup.groupNumber,
        source: source,
        timestamp,
      });

      // リスナーに通知
      this.notifyListeners({
        type: "GROUP_CHANGED",
        previousGroup: oldGroup,
        currentGroup: newGroup,
        source,
        timestamp,
      });

      return true;
    } catch (error) {
      log.error("❌ [CurrentGroupManager] currentGroup更新エラー:", error);
      return false;
    } finally {
      this.updateLock = false;
    }
  }

  /**
   * currentGroupを安全に取得
   * @returns {Object|null} 現在のグループ情報
   */
  getCurrentGroup() {
    try {
      const currentGroup = window.globalState?.currentGroup;

      if (currentGroup) {
        log.debug("📋 [CurrentGroupManager] currentGroup取得:", {
          groupNumber: currentGroup.groupNumber,
          taskType: currentGroup.taskType || currentGroup.type,
          updatedBy: currentGroup._metadata?.updatedBy,
          updatedAt: currentGroup._metadata?.updatedAt,
        });
      } else {
        log.debug("📋 [CurrentGroupManager] currentGroup未設定");
      }

      return currentGroup;
    } catch (error) {
      log.error("❌ [CurrentGroupManager] currentGroup取得エラー:", error);
      return null;
    }
  }

  /**
   * グループの変更を監視するリスナーを追加
   * @param {Function} listener - リスナー関数
   */
  addListener(listener) {
    this.listeners.add(listener);
    log.debug(
      "👂 [CurrentGroupManager] リスナー追加 - 総数:",
      this.listeners.size,
    );
  }

  /**
   * リスナーを削除
   * @param {Function} listener - 削除するリスナー関数
   */
  removeListener(listener) {
    this.listeners.delete(listener);
    log.debug(
      "🗑️ [CurrentGroupManager] リスナー削除 - 総数:",
      this.listeners.size,
    );
  }

  /**
   * 全リスナーに変更を通知
   * @param {Object} changeEvent - 変更イベント情報
   */
  notifyListeners(changeEvent) {
    for (const listener of this.listeners) {
      try {
        listener(changeEvent);
      } catch (error) {
        log.warn("⚠️ [CurrentGroupManager] リスナー通知エラー:", error.message);
      }
    }
  }

  /**
   * 更新履歴を記録
   * @param {Object} updateRecord - 更新記録
   */
  recordUpdate(updateRecord) {
    this.updateHistory.push(updateRecord);

    // 履歴サイズ制限
    if (this.updateHistory.length > this.maxHistorySize) {
      this.updateHistory = this.updateHistory.slice(-this.maxHistorySize);
    }

    this.lastUpdateTimestamp = updateRecord.timestamp;
  }

  /**
   * 更新ロックが解除されるまで待機
   * @returns {Promise<void>}
   */
  async waitForUnlock() {
    const maxWaitTime = 5000; // 5秒でタイムアウト
    const checkInterval = 100; // 100msごとにチェック
    let waitTime = 0;

    while (this.updateLock && waitTime < maxWaitTime) {
      await new Promise((resolve) => setTimeout(resolve, checkInterval));
      waitTime += checkInterval;
    }

    if (waitTime >= maxWaitTime) {
      log.warn(
        "⚠️ [CurrentGroupManager] 更新ロック解除タイムアウト - 強制継続",
      );
      this.updateLock = false;
    }
  }

  /**
   * システム状態の診断情報を取得
   * @returns {Object} 診断情報
   */
  getDiagnostics() {
    return {
      currentGroup: this.getCurrentGroup(),
      updateHistory: this.updateHistory,
      listeners: this.listeners.size,
      lastUpdateTimestamp: this.lastUpdateTimestamp,
      updateLock: this.updateLock,
    };
  }

  /**
   * システムをリセット
   */
  reset() {
    this.listeners.clear();
    this.updateHistory = [];
    this.lastUpdateTimestamp = null;
    this.updateLock = false;

    if (window.globalState) {
      window.globalState.currentGroup = null;
    }

    log.info("🔄 [CurrentGroupManager] システムリセット完了");
  }
}

// グローバルインスタンス作成
if (!window.currentGroupManager) {
  window.currentGroupManager = new CurrentGroupManager();
}

/**
 * currentGroupの統一アクセス関数
 * 【追加】両システムで使用する統一インターフェース
 */
function setCurrentGroup(newGroup, source = "system") {
  return window.currentGroupManager.updateCurrentGroup(newGroup, source);
}

function getCurrentGroup() {
  return window.currentGroupManager.getCurrentGroup();
}

function addCurrentGroupListener(listener) {
  return window.currentGroupManager.addListener(listener);
}

function removeCurrentGroupListener(listener) {
  return window.currentGroupManager.removeListener(listener);
}

// ========================================
// グループ間移行協調プロトコル
// ========================================

/**
 * グループ移行の協調管理システム
 * 【追加】ハイブリッド協調モデル: グループ移行の統一制御
 */
class GroupTransitionCoordinator {
  constructor() {
    this.transitionLock = false;
    this.transitionHistory = [];
    this.maxHistorySize = 20;
    this.pendingTransitions = new Map();
    this.validationCache = new Map();

    log.debug("🔀 [GroupTransitionCoordinator] 初期化完了");
  }

  /**
   * グループ移行を安全に実行
   * @param {Object} fromGroup - 移行元グループ
   * @param {Object} toGroup - 移行先グループ
   * @param {string} initiator - 移行開始者 ("step3-loop" | "DynamicSearch")
   * @returns {Promise<boolean>} 移行成功
   */
  async executeGroupTransition(fromGroup, toGroup, initiator) {
    const transitionId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    log.info("🔀 [GroupTransitionCoordinator] グループ移行開始:", {
      transitionId,
      from: fromGroup?.groupNumber || "none",
      to: toGroup?.groupNumber || "unknown",
      initiator,
      timestamp: new Date().toISOString(),
    });

    // 移行ロックの取得
    if (this.transitionLock) {
      log.info("⏳ [GroupTransitionCoordinator] 移行ロック中 - 待機");
      await this.waitForTransitionUnlock();
    }

    this.transitionLock = true;
    let transitionSuccess = false;

    try {
      // Phase 1: 移行前検証
      const validationResult = await this.validateGroupTransition(
        fromGroup,
        toGroup,
        initiator,
      );
      if (!validationResult.valid) {
        log.warn(
          "❌ [GroupTransitionCoordinator] 移行検証失敗:",
          validationResult.reason,
        );
        return false;
      }

      // Phase 2: 移行実行
      transitionSuccess = await this.performGroupTransition(
        fromGroup,
        toGroup,
        initiator,
        transitionId,
      );

      if (transitionSuccess) {
        // Phase 3: 移行後処理
        await this.completeGroupTransition(
          fromGroup,
          toGroup,
          initiator,
          transitionId,
        );

        log.info("✅ [GroupTransitionCoordinator] グループ移行完了:", {
          transitionId,
          from: fromGroup?.groupNumber || "none",
          to: toGroup?.groupNumber,
          initiator,
        });
      } else {
        log.error("❌ [GroupTransitionCoordinator] グループ移行失敗:", {
          transitionId,
          from: fromGroup?.groupNumber || "none",
          to: toGroup?.groupNumber || "unknown",
          initiator,
        });
      }

      return transitionSuccess;
    } catch (error) {
      log.error("❌ [GroupTransitionCoordinator] グループ移行エラー:", error);

      // エラー時のロールバック
      try {
        await this.rollbackTransition(fromGroup, toGroup, transitionId);
      } catch (rollbackError) {
        log.error(
          "❌ [GroupTransitionCoordinator] ロールバックエラー:",
          rollbackError,
        );
      }

      return false;
    } finally {
      this.transitionLock = false;
      this.pendingTransitions.delete(transitionId);
    }
  }

  /**
   * グループ移行の事前検証
   * @param {Object} fromGroup - 移行元グループ
   * @param {Object} toGroup - 移行先グループ
   * @param {string} initiator - 移行開始者
   * @returns {Promise<Object>} 検証結果
   */
  async validateGroupTransition(fromGroup, toGroup, initiator) {
    try {
      log.debug("🔍 [GroupTransitionCoordinator] グループ移行検証開始");

      // 基本検証
      if (!toGroup || !toGroup.groupNumber) {
        return { valid: false, reason: "移行先グループが無効" };
      }

      // 移行元グループの完了状態検証 (null/undefined は初期状態として許可)
      if (fromGroup && fromGroup.groupNumber) {
        const cacheKey = `completion-${fromGroup.groupNumber}`;
        let isFromGroupComplete;

        // キャッシュから取得を試行
        if (this.validationCache.has(cacheKey)) {
          isFromGroupComplete = this.validationCache.get(cacheKey);
          log.debug(
            "📋 [GroupTransitionCoordinator] キャッシュから完了状態取得",
          );
        } else {
          // step3-loop.jsの完了確認機能を使用
          try {
            isFromGroupComplete = await window.checkCompletionStatus(fromGroup);
            this.validationCache.set(cacheKey, isFromGroupComplete);

            // キャッシュの自動クリア (30秒後)
            setTimeout(() => this.validationCache.delete(cacheKey), 30000);
          } catch (error) {
            log.warn(
              "⚠️ [GroupTransitionCoordinator] 完了状態確認エラー:",
              error.message,
            );
            // エラー時は移行を許可（保守的でない判断）
            isFromGroupComplete = true;
          }
        }

        if (!isFromGroupComplete) {
          return {
            valid: false,
            reason: `移行元グループ${fromGroup.groupNumber}が未完了`,
            details: { fromGroupComplete: isFromGroupComplete },
          };
        }
      }

      // 重複移行の防止
      const currentGroup = window.getCurrentGroup();
      if (currentGroup?.groupNumber === toGroup.groupNumber) {
        return {
          valid: false,
          reason: `移行先グループ${toGroup.groupNumber}は既に現在のグループ`,
          details: { currentGroup: currentGroup.groupNumber },
        };
      }

      // 移行タイミングの検証
      const recentTransitions = this.transitionHistory
        .filter((t) => Date.now() - new Date(t.timestamp).getTime() < 5000) // 5秒以内
        .filter((t) => t.toGroupNumber === toGroup.groupNumber);

      if (recentTransitions.length > 0) {
        return {
          valid: false,
          reason: `グループ${toGroup.groupNumber}への最近の移行を検出`,
          details: { recentTransitions: recentTransitions.length },
        };
      }

      log.debug("✅ [GroupTransitionCoordinator] グループ移行検証成功");
      return {
        valid: true,
        reason: "検証成功",
        details: {
          fromGroup: fromGroup?.groupNumber || "none",
          toGroup: toGroup.groupNumber,
          initiator,
        },
      };
    } catch (error) {
      log.error("❌ [GroupTransitionCoordinator] 移行検証エラー:", error);
      return {
        valid: false,
        reason: `検証エラー: ${error.message}`,
        error: error,
      };
    }
  }

  /**
   * グループ移行の実行
   * @param {Object} fromGroup - 移行元グループ
   * @param {Object} toGroup - 移行先グループ
   * @param {string} initiator - 移行開始者
   * @param {string} transitionId - 移行ID
   * @returns {Promise<boolean>} 実行成功
   */
  async performGroupTransition(fromGroup, toGroup, initiator, transitionId) {
    try {
      log.debug("⚡ [GroupTransitionCoordinator] グループ移行実行開始");

      // 移行を記録 (実行前)
      this.pendingTransitions.set(transitionId, {
        fromGroup,
        toGroup,
        initiator,
        startTime: new Date().toISOString(),
        status: "executing",
      });

      // 統一管理システムを使用してcurrentGroupを更新
      const updateSuccess = await setCurrentGroup(toGroup, initiator);

      if (!updateSuccess) {
        throw new Error("currentGroup更新失敗");
      }

      log.debug("✅ [GroupTransitionCoordinator] グループ移行実行成功");
      return true;
    } catch (error) {
      log.error(
        "❌ [GroupTransitionCoordinator] グループ移行実行エラー:",
        error,
      );
      return false;
    }
  }

  /**
   * グループ移行の完了処理
   * @param {Object} fromGroup - 移行元グループ
   * @param {Object} toGroup - 移行先グループ
   * @param {string} initiator - 移行開始者
   * @param {string} transitionId - 移行ID
   */
  async completeGroupTransition(fromGroup, toGroup, initiator, transitionId) {
    try {
      log.debug("🎯 [GroupTransitionCoordinator] グループ移行完了処理開始");

      // 移行履歴に記録
      const transitionRecord = {
        transitionId,
        fromGroupNumber: fromGroup?.groupNumber || null,
        toGroupNumber: toGroup.groupNumber,
        initiator,
        timestamp: new Date().toISOString(),
        status: "completed",
      };

      this.recordTransition(transitionRecord);

      // 他システムへの移行通知
      this.notifyTransitionComplete(transitionRecord);

      // 検証キャッシュのクリア
      this.validationCache.clear();

      log.debug("✅ [GroupTransitionCoordinator] グループ移行完了処理成功");
    } catch (error) {
      log.error("❌ [GroupTransitionCoordinator] 移行完了処理エラー:", error);
    }
  }

  /**
   * 移行のロールバック
   * @param {Object} fromGroup - 移行元グループ
   * @param {Object} toGroup - 移行先グループ
   * @param {string} transitionId - 移行ID
   */
  async rollbackTransition(fromGroup, toGroup, transitionId) {
    try {
      log.warn("🔄 [GroupTransitionCoordinator] 移行ロールバック実行");

      // 元のグループに戻す (fromGroupが存在する場合のみ)
      if (fromGroup && fromGroup.groupNumber) {
        await setCurrentGroup(fromGroup, "rollback");
      }

      // ロールバック記録
      this.recordTransition({
        transitionId,
        fromGroupNumber: toGroup?.groupNumber || null,
        toGroupNumber: fromGroup?.groupNumber || null,
        initiator: "rollback",
        timestamp: new Date().toISOString(),
        status: "rolled_back",
      });

      log.info("✅ [GroupTransitionCoordinator] 移行ロールバック完了");
    } catch (error) {
      log.error("❌ [GroupTransitionCoordinator] ロールバックエラー:", error);
    }
  }

  /**
   * 移行記録の保存
   * @param {Object} record - 移行記録
   */
  recordTransition(record) {
    this.transitionHistory.push(record);

    // 履歴サイズ制限
    if (this.transitionHistory.length > this.maxHistorySize) {
      this.transitionHistory = this.transitionHistory.slice(
        -this.maxHistorySize,
      );
    }

    log.debug("📝 [GroupTransitionCoordinator] 移行記録保存:", {
      transitionId: record.transitionId,
      transition: `${record.fromGroupNumber || "none"} → ${record.toGroupNumber}`,
      status: record.status,
    });
  }

  /**
   * 移行完了の通知
   * @param {Object} transitionRecord - 移行記録
   */
  notifyTransitionComplete(transitionRecord) {
    try {
      // カスタムイベントで通知
      if (typeof window !== "undefined" && window.dispatchEvent) {
        const event = new CustomEvent("groupTransitionCompleted", {
          detail: transitionRecord,
        });
        window.dispatchEvent(event);
      }

      // グローバル状態に通知情報を設定
      if (window.globalState) {
        window.globalState.lastGroupTransition = transitionRecord;
      }

      log.debug("📡 [GroupTransitionCoordinator] 移行完了通知送信");
    } catch (error) {
      log.warn(
        "⚠️ [GroupTransitionCoordinator] 移行通知エラー:",
        error.message,
      );
    }
  }

  /**
   * 移行ロック解除まで待機
   * @returns {Promise<void>}
   */
  async waitForTransitionUnlock() {
    const maxWaitTime = 10000; // 10秒でタイムアウト
    const checkInterval = 200; // 200msごとにチェック
    let waitTime = 0;

    while (this.transitionLock && waitTime < maxWaitTime) {
      await new Promise((resolve) => setTimeout(resolve, checkInterval));
      waitTime += checkInterval;
    }

    if (waitTime >= maxWaitTime) {
      log.warn(
        "⚠️ [GroupTransitionCoordinator] 移行ロック解除タイムアウト - 強制継続",
      );
      this.transitionLock = false;
    }
  }

  /**
   * 診断情報の取得
   * @returns {Object} 診断情報
   */
  getDiagnostics() {
    return {
      transitionLock: this.transitionLock,
      transitionHistory: this.transitionHistory.slice(-5), // 最新5件
      pendingTransitions: Array.from(this.pendingTransitions.entries()),
      validationCacheSize: this.validationCache.size,
    };
  }

  /**
   * システムのリセット
   */
  reset() {
    this.transitionLock = false;
    this.transitionHistory = [];
    this.pendingTransitions.clear();
    this.validationCache.clear();

    log.info("🔄 [GroupTransitionCoordinator] システムリセット完了");
  }
}

// グローバルインスタンス作成
if (!window.groupTransitionCoordinator) {
  window.groupTransitionCoordinator = new GroupTransitionCoordinator();
}

/**
 * グループ移行の統一インターフェース
 * 【追加】両システムで使用する移行制御関数
 */
function executeGroupTransition(fromGroup, toGroup, initiator) {
  return window.groupTransitionCoordinator.executeGroupTransition(
    fromGroup,
    toGroup,
    initiator,
  );
}

function getTransitionDiagnostics() {
  return window.groupTransitionCoordinator.getDiagnostics();
}

/**
 * 完了状況の確認
 * @param {Object} taskGroup - タスクグループ情報
 * @returns {Promise<boolean>} 完了の場合true
 */
// データ検証関数（自己完結型）
function validateTaskGroupForStep5(taskGroup) {
  const errors = [];

  if (!taskGroup) {
    errors.push("タスクグループが未定義");
    return errors;
  }

  if (!taskGroup.columns) {
    errors.push("columns構造が未定義");
  } else {
    if (
      !taskGroup.columns.prompts ||
      !Array.isArray(taskGroup.columns.prompts)
    ) {
      errors.push("prompts列が未定義または配列ではない");
    }
    if (!taskGroup.columns.answer) {
      errors.push("answer列が未定義");
    }
  }

  if (!taskGroup.dataStartRow || typeof taskGroup.dataStartRow !== "number") {
    errors.push("dataStartRowが未定義または数値ではない");
  }

  return errors;
}

async function checkCompletionStatus(taskGroup) {
  const completionCheckId = `completion_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  log.debug(
    `🔍 [COMPLETION-CHECK] グループ${taskGroup.groupNumber}完了チェック開始`,
  );

  LoopLogger.info("[step5-loop.js→Step5-1] 完了状況の確認開始", {
    completionCheckId,
    groupNumber: taskGroup.groupNumber || "undefined",
    taskType: taskGroup.taskType || "undefined",
    pattern: taskGroup.pattern || "undefined",
    columns: taskGroup.columns || {},
  });

  // データ検証
  const validationErrors = validateTaskGroupForStep5(taskGroup);
  if (validationErrors.length > 0) {
    LoopLogger.error(
      "[step5-loop.js] [Step 5-1] タスクグループ検証エラー:",
      validationErrors,
    );
    throw new Error(`タスクグループ検証失敗: ${validationErrors.join(", ")}`);
  }

  try {
    // ========================================
    // 行制御情報の取得（タスクグループの範囲内）
    // ========================================
    let rowControls = [];

    // タスクグループの範囲のデータを取得して行制御を抽出
    // 注意：B列に行制御命令が入っているため、B列を含む範囲を取得する必要がある
    const controlCheckRange = `B${taskGroup.dataStartRow}:B1000`;
    let controlData;
    try {
      controlData = await readSpreadsheet(controlCheckRange);
      if (controlData && controlData.values) {
        // getRowControlの形式に合わせてデータを整形
        const formattedData = controlData.values.map((row, index) => {
          // B列のデータを2列目として配置（getRowControlがrowData[1]を見るため）
          return [null, row[0] || ""];
        });

        // 行制御を取得
        if (
          window.Step3TaskList &&
          typeof window.Step3TaskList.getRowControl === "function"
        ) {
          rowControls = window.Step3TaskList.getRowControl(formattedData);

          // 🔧 [OFFSET-FIX] dataStartRowオフセットを行制御の行番号に適用
          rowControls = rowControls.map((control) => ({
            ...control,
            row: control.row + taskGroup.dataStartRow - 1,
          }));

          LoopLogger.info("[step5-loop.js] 行制御情報取得:", {
            制御数: rowControls.length,
            詳細: rowControls.map((c) => `${c.type}制御: ${c.row}行目`),
            オフセット適用: `dataStartRow(${taskGroup.dataStartRow}) - 1`,
          });
        } else {
          LoopLogger.warn("[step5-loop.js] getRowControl関数が利用不可");
        }
      }
    } catch (error) {
      LoopLogger.warn("[step5-loop.js] 行制御取得エラー:", error.message);
      // エラーがあっても処理は継続（行制御なしで全行対象）
    }

    // ========================================
    // Step 5-1-1: プロンプト列の確認
    // ========================================
    LoopLogger.info("[step5-loop.js→Step5-1-1] プロンプト列を確認中...");

    // 必須データの検証
    if (!taskGroup.columns || !taskGroup.columns.prompts) {
      throw new Error(
        "[step5-loop.js] [Step 5-1-1] エラー: columns.promptsが定義されていません",
      );
    }
    if (!taskGroup.dataStartRow) {
      LoopLogger.warn(
        "[step5-loop.js] [Step 5-1-1] 警告: dataStartRowが未定義。デフォルト値7を使用",
      );
      taskGroup.dataStartRow = 7;
    }

    // セル範囲計算（自己完結型）
    const startCol = taskGroup.columns.prompts[0];
    const endCol =
      taskGroup.columns.prompts[taskGroup.columns.prompts.length - 1];
    const promptRange = `${startCol}${taskGroup.dataStartRow}:${endCol}1000`;
    LoopLogger.info(`[step5-loop.js] [Step 5-1-1] 取得範囲: ${promptRange}`, {
      開始列: taskGroup.columns.prompts[0],
      終了列: taskGroup.columns.prompts[taskGroup.columns.prompts.length - 1],
      開始行: taskGroup.dataStartRow,
      列数: taskGroup.columns.prompts.length,
    });

    let promptValues;
    try {
      promptValues = await readSpreadsheet(promptRange);
    } catch (error) {
      LoopLogger.error(
        "[step5-loop.js] [Step 5-1-1] スプレッドシート読み込みエラー:",
        {
          範囲: promptRange,
          エラー: error.message,
        },
      );
      throw error;
    }

    // 値があるプロンプト行をカウント（行ベース：複数列でも1行は1タスク）
    let promptCount = 0;
    let promptDetails = [];
    if (promptValues && promptValues.values) {
      LoopLogger.info(
        `[step5-loop.js] [Step 5-1-1] プロンプトデータ取得成功: ${promptValues.values.length}行`,
      );
      for (
        let rowIndex = 0;
        rowIndex < promptValues.values.length;
        rowIndex++
      ) {
        const row = promptValues.values[rowIndex];
        if (!row) continue;

        // 実際の行番号を計算
        const actualRow = taskGroup.dataStartRow + rowIndex;

        // 行制御チェック
        if (rowControls.length > 0) {
          if (
            window.Step3TaskList &&
            typeof window.Step3TaskList.shouldProcessRow === "function"
          ) {
            if (
              !window.Step3TaskList.shouldProcessRow(actualRow, rowControls)
            ) {
              LoopLogger.debug(
                `[step5-loop.js] 行${actualRow}は行制御によりスキップ`,
              );
              continue;
            }
          }
        }

        // この行にプロンプトが存在するかチェック
        let hasPromptInRow = false;
        let firstPromptContent = "";

        for (
          let colIndex = 0;
          colIndex < row.length && colIndex < taskGroup.columns.prompts.length;
          colIndex++
        ) {
          const cell = row[colIndex];
          if (cell && cell.trim()) {
            hasPromptInRow = true;
            if (!firstPromptContent) {
              firstPromptContent = cell;
            }
          }
        }

        // この行にプロンプトがあれば1カウント
        if (hasPromptInRow) {
          promptCount++;
          promptDetails.push({
            行: actualRow,
            列: taskGroup.columns.prompts.join(", "),
            内容プレビュー:
              firstPromptContent.substring(0, 30) +
              (firstPromptContent.length > 30 ? "..." : ""),
          });
        }
      }
    } else {
      LoopLogger.error(
        "[step5-loop.js] [Step 5-1-1] ❌ プロンプトデータが取得できませんでした",
        {
          promptValues: promptValues,
          範囲: promptRange,
          タスクグループ: {
            番号: taskGroup.groupNumber,
            prompts列: taskGroup.columns.prompts,
          },
        },
      );
    }
    LoopLogger.info(
      `[step5-loop.js] [Step 5-1-1] プロンプト数: ${promptCount}件`,
      {
        詳細: promptDetails.slice(0, 3), // 最初の3件のみ表示
        全件数: promptDetails.length,
        検索範囲: promptRange,
        prompts列設定: taskGroup.columns.prompts,
      },
    );
    log.info(`📊 グループ${taskGroup.groupNumber}: プロンプト=${promptCount}`);

    // ========================================
    // Step 5-1-2: 回答列の確認
    // ========================================
    LoopLogger.info("[step5-loop.js→Step5-1-2] 回答列を確認中...");

    let answerRange;
    let answerCount = 0;

    if (taskGroup.pattern === "3種類AI") {
      // 3種類AIパターンの場合（行ベースでカウント）
      LoopLogger.info(
        "[step5-loop.js] [Step 5-1-2] 3種類AIパターンの回答を確認（行ベース）",
      );

      // 【統一修正】全てオブジェクト形式になったのでチェックを調整
      if (
        !taskGroup.columns.answer ||
        typeof taskGroup.columns.answer !== "object"
      ) {
        throw new Error(
          "[step5-loop.js] [Step 5-1-2] エラー: answer列がオブジェクト形式ではありません（統一修正後のエラー）",
        );
      }

      const columns = [
        taskGroup.columns.answer.chatgpt,
        taskGroup.columns.answer.claude,
        taskGroup.columns.answer.gemini,
      ];

      LoopLogger.info("[step5-loop.js] [Step 5-1-2] AI回答列:", {
        ChatGPT列: columns[0] || "undefined",
        Claude列: columns[1] || "undefined",
        Gemini列: columns[2] || "undefined",
      });

      // 3列をまとめて取得（行ベースで処理するため）
      const startCol = columns[0]; // ChatGPT列
      const endCol = columns[2]; // Gemini列
      answerRange = `${startCol}${taskGroup.dataStartRow}:${endCol}1000`;

      LoopLogger.info(
        `[step5-loop.js] [Step 5-1-2] 3種類AI回答範囲: ${answerRange}`,
      );

      let values;
      try {
        values = await readSpreadsheet(answerRange);
      } catch (error) {
        LoopLogger.error(
          "[step5-loop.js] [Step 5-1-2] 3種類AI回答読み込みエラー:",
          {
            範囲: answerRange,
            エラー: error.message,
          },
        );
        throw error;
      }

      if (values && values.values) {
        // 行ごとに処理（いずれかのAIに回答があれば1カウント）
        for (let rowIndex = 0; rowIndex < values.values.length; rowIndex++) {
          const row = values.values[rowIndex];
          if (!row) continue;

          // 実際の行番号を計算
          const actualRow = taskGroup.dataStartRow + rowIndex;

          // 行制御チェック
          if (rowControls.length > 0) {
            if (
              window.Step3TaskList &&
              typeof window.Step3TaskList.shouldProcessRow === "function"
            ) {
              if (
                !window.Step3TaskList.shouldProcessRow(actualRow, rowControls)
              ) {
                continue;
              }
            }
          }

          let hasAnswerInRow = false;
          // 3列（ChatGPT, Claude, Gemini）をチェック
          for (
            let colIndex = 0;
            colIndex < 3 && colIndex < row.length;
            colIndex++
          ) {
            const cellValue = row[colIndex] ? row[colIndex].trim() : "";
            // 値があり、かつ「作業中」マーカーでない場合のみ回答としてカウント
            if (cellValue && !cellValue.startsWith("作業中")) {
              hasAnswerInRow = true;
              break; // 1つでも回答があれば十分
            }
          }

          if (hasAnswerInRow) {
            answerCount++; // 行ごとに1カウント
          }
        }
      }

      // 注意：3種類AIでもプロンプト数を3倍にしない（行ベースで比較）
      LoopLogger.info(
        `[step5-loop.js] [Step 5-1-2] 3種類AI回答数（行ベース）: ${answerCount}行`,
      );
    } else {
      // 【統一修正】通常パターンもオブジェクト形式に統一
      LoopLogger.info("[step5-loop.js] [Step 5-1-2] 通常パターンの回答を確認");

      // 【シンプル化】primary列を使用して範囲を生成
      const answerColumn = taskGroup.columns.answer.primary || "C";
      answerRange = `${answerColumn}${taskGroup.dataStartRow}:${answerColumn}1000`;
      LoopLogger.info(`[step5-loop.js] [Step 5-1-2] 取得範囲: ${answerRange}`);

      // 【問題特定ログ】通常パターンでのスプレッドシート読み込み前ログ
      log.debug(`[DEBUG-PROBLEM-TRACE] 通常パターン回答データ読み込み開始:`, {
        answerRange: answerRange,
        answerColumn: answerColumn,
        taskGroupNumber: taskGroup.groupNumber,
        dataStartRow: taskGroup.dataStartRow,
        読み込み前タイムスタンプ: new Date().toISOString(),
      });

      const answerValues = await readSpreadsheet(answerRange);

      // 【問題特定ログ】通常パターンでのスプレッドシート読み込み後ログ
      log.debug(`[DEBUG-PROBLEM-TRACE] 通常パターン回答データ読み込み完了:`, {
        answerRange: answerRange,
        answerValues存在: !!answerValues,
        answerValuesValues存在: !!(answerValues && answerValues.values),
        rawDataLength: answerValues?.values?.length || 0,
        読み込み後タイムスタンプ: new Date().toISOString(),
        rawDataプレビュー: answerValues?.values?.slice(0, 5) || "データなし",
      });

      if (answerValues && answerValues.values) {
        for (
          let rowIndex = 0;
          rowIndex < answerValues.values.length;
          rowIndex++
        ) {
          const row = answerValues.values[rowIndex];
          if (!row) continue;

          // 実際の行番号を計算
          const actualRow = taskGroup.dataStartRow + rowIndex;

          // 行制御チェック
          if (rowControls.length > 0) {
            if (
              window.Step3TaskList &&
              typeof window.Step3TaskList.shouldProcessRow === "function"
            ) {
              if (
                !window.Step3TaskList.shouldProcessRow(actualRow, rowControls)
              ) {
                continue;
              }
            }
          }

          const cellValue = row[0] ? row[0].trim() : "";

          // 【根本原因特定ログ】セル詳細と直近書き込み記録の照合
          if (actualRow >= 11 && actualRow <= 13) {
            // 直近書き込み記録をチェック
            const recentWrites = window.globalState?.recentWrites || [];
            const matchingWrite = recentWrites.find(
              (write) =>
                write.cellRef === `${answerColumn}${actualRow}` &&
                write.groupNumber === taskGroup.groupNumber,
            );

            log.debug(
              `[DEBUG-PROBLEM-TRACE] セル詳細チェック (行${actualRow}):`,
              {
                actualRow: actualRow,
                cellValue: cellValue,
                cellValueLength: cellValue.length,
                isEmpty: !cellValue,
                isWorkingMarker: cellValue.startsWith("作業中"),
                willCount: cellValue && !cellValue.startsWith("作業中"),
                rowIndex: rowIndex,
                answerColumn: answerColumn,
                cellRef: `${answerColumn}${actualRow}`,
                // 直近書き込み情報
                hasMatchingWrite: !!matchingWrite,
                matchingWriteInfo: matchingWrite
                  ? {
                      taskId: matchingWrite.taskId,
                      writeTimestamp: new Date(
                        matchingWrite.timestamp,
                      ).toISOString(),
                      verificationTimestamp: new Date(
                        matchingWrite.verificationTimestamp,
                      ).toISOString(),
                      wasVerified: matchingWrite.isVerified,
                      expectedTextLength: matchingWrite.textLength,
                      timeSinceWrite: `${(Date.now() - matchingWrite.timestamp) / 1000}秒前`,
                    }
                  : null,
                // APIキャッシュ疑惑判定
                possibleCacheIssue:
                  matchingWrite && matchingWrite.isVerified && !cellValue,
                タイムスタンプ: new Date().toISOString(),
              },
            );

            // APIキャッシュ問題の疑いがある場合、追加検証
            if (matchingWrite && matchingWrite.isVerified && !cellValue) {
              log.warn(`🚨 [CACHE-ISSUE-DETECTED] APIキャッシュ問題の疑い:`, {
                cellRef: `${answerColumn}${actualRow}`,
                expectedFromWrite: `${matchingWrite.textLength}文字`,
                actualFromRead: `${cellValue.length}文字`,
                writeTime: new Date(matchingWrite.timestamp).toISOString(),
                readTime: new Date().toISOString(),
                timeDifference: `${(Date.now() - matchingWrite.timestamp) / 1000}秒`,
                writeWasVerified: matchingWrite.isVerified,
              });
            }
          }

          // 値があり、かつ「作業中」マーカーでない場合のみ回答としてカウント
          if (cellValue && !cellValue.startsWith("作業中")) {
            answerCount++;

            // 【問題特定ログ】カウントしたセルの詳細（U12付近のみ）
            if (actualRow >= 11 && actualRow <= 13) {
              log.debug(
                `[DEBUG-PROBLEM-TRACE] 回答カウント実行 (行${actualRow}):`,
                {
                  actualRow: actualRow,
                  cellValue: cellValue.substring(0, 100),
                  現在のanswerCount: answerCount,
                  answerColumn: answerColumn,
                  タイムスタンプ: new Date().toISOString(),
                },
              );
            }
          }
        }
      }
    }

    LoopLogger.info(`[step5-loop.js] [Step 5-1-2] 回答数: ${answerCount}件`);
    log.debug(
      `[DEBUG-checkCompletionStatus] グループ${taskGroup.groupNumber}: 回答検索完了 - answerCount=${answerCount}, 範囲=${answerRange}`,
    );

    // 統計情報更新
    window.globalState.stats.totalPrompts = promptCount;
    window.globalState.stats.completedAnswers = answerCount;
    window.globalState.stats.pendingTasks = promptCount - answerCount;

    // ========================================
    // Step 5-1-3: 完了判定
    // ========================================
    LoopLogger.info("[step5-loop.js→Step5-1-3] 完了判定を実行");

    log.debug(
      `[DEBUG-checkCompletionStatus] グループ${taskGroup.groupNumber}: promptCount=${promptCount}, answerCount=${answerCount}`,
    );

    // 【問題特定ログ】完了判定前の詳細状態
    log.debug(`[DEBUG-PROBLEM-TRACE] 完了判定前の最終状態:`, {
      promptCount: promptCount,
      answerCount: answerCount,
      difference: promptCount - answerCount,
      taskGroupNumber: taskGroup.groupNumber,
      promptRange: promptRange,
      answerRange: answerRange,
      判定タイムスタンプ: new Date().toISOString(),
    });

    // 🔍 【強化】空白タスク詳細検出ログ
    const blankTasks = [];
    const completedTasks = [];

    // 🔄 【修正】キャッシュを使わず直接APIから最新データ取得
    log.debug(`🔍 [CACHE-FIX] 個別タスク検証のためAPI直接読み取り開始`, {
      completionCheckId,
      taskGroupNumber: taskGroup.groupNumber,
      dataStartRow: taskGroup.dataStartRow,
      promptCount,
      timestamp: new Date().toISOString(),
    });

    // 🔍 【シート名統一】GIDからシート名を取得して使用
    let sheetPrefix = "";
    if (window.globalState?.gid) {
      try {
        // SimpleSheetsClientのインスタンスからシート名取得
        if (window.simpleSheetsClientStep5?.getSheetNameFromGid) {
          const sheetName =
            await window.simpleSheetsClientStep5.getSheetNameFromGid(
              window.globalState.spreadsheetId,
              window.globalState.gid,
            );
          if (sheetName) {
            sheetPrefix = `'${sheetName}'!`;
          }
        }
      } catch (err) {
        console.warn(
          `⚠️ [BATCH-READ] シート名取得失敗、デフォルトシート使用:`,
          err,
        );
      }
    }

    // バッチ読み取り範囲の計算
    // columns.promptsは常に配列（例: ['O', 'P']）
    const promptCol =
      Array.isArray(taskGroup.columns?.prompts) &&
      taskGroup.columns.prompts.length > 0
        ? taskGroup.columns.prompts[0]
        : null;

    // columns.answerは2つの構造に対応:
    // 1. 文字列（古い構造）: 'Q'
    // 2. オブジェクト（新しい構造）: {primary: 'Q'} または {chatgpt: 'C', claude: 'D', gemini: 'E'}
    let answerCol = null;
    if (taskGroup.columns?.answer) {
      if (typeof taskGroup.columns.answer === "string") {
        // 古い構造（文字列）
        answerCol = taskGroup.columns.answer;
      } else if (typeof taskGroup.columns.answer === "object") {
        // 新しい構造（オブジェクト）
        answerCol =
          taskGroup.columns.answer.primary ||
          taskGroup.columns.answer.claude ||
          taskGroup.columns.answer.chatgpt ||
          taskGroup.columns.answer.gemini;
      }
    }

    // 列が取得できない場合はエラー
    if (!promptCol || !answerCol) {
      console.error(`❌ [BATCH-READ] 列情報が不正:`, {
        promptCol,
        answerCol,
        columns: taskGroup.columns,
      });
      // 個別タスク詳細を空で返す
      log.debug(
        `🔍 [COMPLETION-CHECK-DETAILS] 個別タスク詳細分析（スキップ）`,
        {
          completionCheckId,
          taskGroupNumber: taskGroup.groupNumber,
          error: "列情報が取得できません",
        },
      );
      return { isComplete: false, blankTasks, completedTasks };
    }

    const startRow = taskGroup.dataStartRow;
    const endRow = taskGroup.dataStartRow + promptCount - 1;

    // SpreadsheetDataを使用したセルアドレスベースのアクセス
    const spreadsheetData = new (window.SpreadsheetData || SpreadsheetData)();

    // 両列を含む範囲を取得
    const minCol = promptCol < answerCol ? promptCol : answerCol;
    const maxCol = promptCol > answerCol ? promptCol : answerCol;
    const batchRange = `${sheetPrefix}${minCol}${startRow}:${maxCol}${endRow}`;

    log.debug(`📊 [BATCH-READ] バッチ読み取り開始:`, {
      range: batchRange,
      rowCount: promptCount,
      startRow: startRow,
      endRow: endRow,
      promptCol,
      answerCol,
    });

    try {
      // APIレート制限対策：バッチ読み取り前に少し待機
      await new Promise((resolve) => setTimeout(resolve, 200)); // 200ms待機

      const batchResponse = await readSpreadsheet(batchRange);
      if (batchResponse?.values) {
        // SpreadsheetDataにデータをロード
        spreadsheetData.loadBatchData(batchRange, batchResponse.values);

        // セルアドレスで直接アクセス
        for (let row = startRow; row <= endRow; row++) {
          const promptAddress = `${promptCol}${row}`;
          const answerAddress = `${answerCol}${row}`;

          const promptValue = spreadsheetData.getCell(promptAddress) || "";
          const answerValue = spreadsheetData.getCell(answerAddress) || "";

          const taskInfo = {
            row,
            promptAddress,
            answerAddress,
            promptValue: promptValue,
            answerValue: answerValue,
            hasPrompt: spreadsheetData.hasValue(promptAddress),
            hasAnswer: spreadsheetData.hasValue(answerAddress),
          };

          if (taskInfo.hasPrompt && !taskInfo.hasAnswer) {
            blankTasks.push(taskInfo);
          } else if (taskInfo.hasPrompt && taskInfo.hasAnswer) {
            completedTasks.push(taskInfo);
          }

          // デバッグログ（最初の3件のみ）
          if (row <= startRow + 2) {
            log.debug(
              `🔍 [BATCH-READ] ${promptAddress}/${answerAddress}の結果:`,
              {
                promptValue: promptValue?.substring(0, 50),
                answerValue: answerValue?.substring(0, 50),
                hasPrompt: taskInfo.hasPrompt,
                hasAnswer: taskInfo.hasAnswer,
              },
            );
          }
        }

        // デバッグ用：読み込まれたセルを表示
        if (taskGroup.groupNumber === 2) {
          log.debug(`🔍 [GROUP-2-CELLS] Group 2のセルアドレス確認:`);
          spreadsheetData.debugPrintCells(5);
        }
      } else {
        console.warn(`⚠️ [BATCH-READ] バッチ読み取りの結果が空です`);
      }
    } catch (batchError) {
      console.error(`❌ [BATCH-READ] バッチ読み取りエラー:`, batchError);
      // エラー時は個別読み取りにフォールバック（レート制限対策付き）
      log.info(`🔄 [BATCH-READ] 個別読み取りにフォールバック`);

      // APIレート制限対策：個別読み取りを小さいバッチに分割
      const BATCH_SIZE = 5; // 5行ずつ処理
      const BATCH_DELAY = 1000; // バッチ間で1秒待機

      for (
        let batchStart = startRow;
        batchStart <= endRow;
        batchStart += BATCH_SIZE
      ) {
        const batchEnd = Math.min(batchStart + BATCH_SIZE - 1, endRow);

        // バッチ間の待機（最初のバッチ以外）
        if (batchStart > startRow) {
          await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY));
        }

        for (let row = batchStart; row <= batchEnd; row++) {
          try {
            const promptAddress = `${promptCol}${row}`;
            const answerAddress = `${answerCol}${row}`;
            const promptRange = `${sheetPrefix}${promptAddress}`;
            const answerRange = `${sheetPrefix}${answerAddress}`;

            // 個別API呼び出し間にも小さな待機
            await new Promise((resolve) => setTimeout(resolve, 100)); // 100ms待機

            const promptResponse = await readSpreadsheet(promptRange);
            await new Promise((resolve) => setTimeout(resolve, 100)); // 100ms待機
            const answerResponse = await readSpreadsheet(answerRange);

            const promptValue = promptResponse?.values?.[0]?.[0] || "";
            const answerValue = answerResponse?.values?.[0]?.[0] || "";

            const taskInfo = {
              row,
              promptAddress,
              answerAddress,
              promptValue: promptValue,
              answerValue: answerValue,
              hasPrompt: Boolean(promptValue && promptValue.trim()),
              hasAnswer: Boolean(answerValue && answerValue.trim()),
            };

            if (taskInfo.hasPrompt && !taskInfo.hasAnswer) {
              blankTasks.push(taskInfo);
            } else if (taskInfo.hasPrompt && taskInfo.hasAnswer) {
              completedTasks.push(taskInfo);
            }
          } catch (readError) {
            console.error(
              `❌ [FALLBACK] ${promptCol}${row}/${answerCol}${row}読み取りエラー:`,
              readError,
            );

            // 429エラー（レート制限）の場合は長めに待機
            if (
              readError.message?.includes("429") ||
              readError.message?.includes("Quota exceeded")
            ) {
              log.info(`⏳ [RATE-LIMIT] APIレート制限検出、長めの待機中...`);
              await new Promise((resolve) => setTimeout(resolve, 5000)); // 5秒待機
            }
          }
        }
      }
    }

    log.debug(`🔍 [COMPLETION-CHECK-DETAILS] 個別タスク詳細分析`, {
      completionCheckId,
      taskGroupNumber: taskGroup.groupNumber,
      totalTasks: promptCount,
      completedTasks: completedTasks.length,
      blankTasks: blankTasks.length,
      blankTaskRows: blankTasks.map((t) => t.row),
      blankTaskDetails: blankTasks.slice(0, 3), // 最初の3件のみ表示
      timestamp: new Date().toISOString(),
    });

    // 厳格な完了判定：プロンプトと回答が一致し、かつプロンプトが存在する場合のみ完了
    const isComplete = promptCount > 0 && promptCount === answerCount;

    // 🔍 【強化】完了判定結果の詳細ログ
    log.debug(`🔍 [COMPLETION-CHECK-RESULT] 完了判定結果`, {
      completionCheckId,
      isComplete: isComplete,
      promptCount: promptCount,
      answerCount: answerCount,
      promptCountCheck: promptCount > 0,
      equalityCheck: promptCount === answerCount,
      blankTasksFound: blankTasks.length,
      taskGroupNumber: taskGroup.groupNumber,
      cacheStatus: {
        hasCacheData: Boolean(window.globalState?.cache?.spreadsheetData),
        cacheDataRows: window.globalState?.cache?.spreadsheetData?.length || 0,
      },
      timestamp: new Date().toISOString(),
    });

    // 【問題特定ログ】完了判定結果の詳細
    log.debug(`[DEBUG-PROBLEM-TRACE] 完了判定結果:`, {
      isComplete: isComplete,
      promptCount: promptCount,
      answerCount: answerCount,
      promptCountCheck: promptCount > 0,
      equalityCheck: promptCount === answerCount,
      taskGroupNumber: taskGroup.groupNumber,
      blankTasksCount: blankTasks.length,
      判定結果タイムスタンプ: new Date().toISOString(),
    });

    LoopLogger.info("[step5-loop.js] [Step 5-1-3] 完了状況:", {
      プロンプト数: promptCount,
      回答数: answerCount,
      未完了: window.globalState.stats.pendingTasks,
      完了判定: isComplete ? "完了" : "未完了",
      完了率:
        promptCount > 0
          ? Math.round((answerCount / promptCount) * 100) + "%"
          : "0%",
      グループ番号: taskGroup.groupNumber,
      タスクタイプ: taskGroup.taskType,
    });

    if (!isComplete && promptCount > 0) {
      LoopLogger.info("[step5-loop.js] [Step 5-1-3] 未完了詳細:", {
        残りタスク数: promptCount - answerCount,
        推定処理時間: `約${(promptCount - answerCount) * 30}秒`,
      });
    }

    // 完了判定
    return isComplete;
  } catch (error) {
    LoopLogger.error("[step5-loop.js] [Step 5-1] 完了状況確認エラー:", {
      エラーメッセージ: error.message,
      スタック: error.stack,
      タスクグループ: {
        番号: taskGroup.groupNumber,
        タイプ: taskGroup.taskType,
        パターン: taskGroup.pattern,
      },
      現在の統計: window.globalState.stats,
    });
    throw error;
  }
}

/**
 * 未完了タスクの処理
 * @param {Object} taskGroup - タスクグループ情報
 * @returns {Promise<void>}
 */
async function processIncompleteTasks(taskGroup) {
  LoopLogger.info("[step5-loop.js→Step5-2] 未完了タスクの処理開始", {
    グループ番号: taskGroup.groupNumber,
    タスクタイプ: taskGroup.taskType,
    現在の統計: window.globalState.stats,
  });

  let isComplete = false;
  let iteration = 0;
  const maxIterations = 100; // 無限ループ防止

  // ========================================
  // Step 5-2-3: 繰り返し（完了まで5-2-1から繰り返し）
  // ========================================
  do {
    iteration++;
    LoopLogger.info(
      `[step5-loop.js] [Step 5-2-3] 繰り返し処理 ${iteration}回目`,
      {
        最大回数: maxIterations,
        現在の進捗: `${iteration}/${maxIterations}`,
      },
    );

    // 【追加】DynamicSearchによるグループ完了チェック
    if (window.globalState.currentGroup?.dynamicSearchCompleted) {
      log.info(
        "🎯 [step5-loop.js] DynamicSearchによりグループ完了 - ループ終了",
        {
          groupNumber: taskGroup.groupNumber,
          iteration: iteration,
          reason: "DynamicSearch completed flag",
        },
      );
      isComplete = true;
      break;
    }

    if (iteration > maxIterations) {
      LoopLogger.error(
        "[step5-loop.js] [Step 5-2-3] 最大繰り返し回数超過 - 処理を中止",
        {
          実行回数: iteration,
          最大回数: maxIterations,
          グループ番号: taskGroup.groupNumber,
          残りタスク: window.globalState.stats.pendingTasks,
        },
      );
      break;
    }

    // ========================================
    // Step 5-2-1: ステップ3へ戻る（次の3タスクを生成）
    // ========================================
    LoopLogger.info(
      "[step5-loop.js] [Step 5-2-1] ステップ3へ戻る - タスクリスト作成",
    );
    let tasks;
    try {
      // 初回実行フラグを渡す（iteration === 1の時が初回）
      tasks = await createTaskList(taskGroup, iteration === 1);
    } catch (error) {
      LoopLogger.error("[step5-loop.js] [Step 5-2-1] タスクリスト作成エラー:", {
        エラー: error.message,
        グループ番号: taskGroup.groupNumber,
        繰り返し回数: iteration,
      });
      break;
    }

    if (!tasks || tasks.length === 0) {
      LoopLogger.info("[step5-loop.js] [Step 5-2-1] 処理可能なタスクなし", {
        理由: "すべてのタスクが完了済みまたは処理対象外",
        グループ番号: taskGroup.groupNumber,
      });

      // タスクがない場合でも、実際の完了状況を再確認
      const actualCompletion = await checkCompletionStatus(taskGroup);

      if (actualCompletion) {
        log.debug("🎯 [step5-loop.js] タスクなし＆完了確認済み - 正常終了");
        isComplete = true;
      } else {
        log.warn(
          "⚠️ [step5-loop.js] タスクなしだが未完了 - プロンプトと回答の不一致の可能性",
          actualCompletion,
        );
        // グループ内で処理可能なタスクがないが、実際は未完了の状態
        isComplete = false;
      }
      break;
    }
    LoopLogger.info(
      `[step5-loop.js] [Step 5-2-1] ${tasks.length}個のタスクを生成`,
      {
        タスク詳細: tasks.slice(0, 3), // 最初の3件のみ表示
      },
    );

    // ========================================
    // Step 5-2-2: ステップ4を実行（タスクを処理）
    // ========================================
    LoopLogger.info(
      "[step5-loop.js] [Step 5-2-2] ステップ4を実行 - タスク実行",
      {
        タスク数: tasks.length,
        グループ番号: taskGroup.groupNumber,
      },
    );

    try {
      await executeTasks(tasks, taskGroup);
      LoopLogger.info("[step5-loop.js] [Step 5-2-2] タスク実行完了", {
        成功: true,
        処理タスク数: tasks.length,
      });
    } catch (error) {
      LoopLogger.error("[step5-loop.js] [Step 5-2-2] タスク実行エラー:", {
        エラー: error.message,
        タスク数: tasks.length,
        繰り返し回数: iteration,
      });
      // エラーでも処理を継続
    }

    // 処理後の待機（APIレート制限対策: iteration回数に応じて待機時間を増やす）
    const waitTime = Math.min(2000 + iteration * 1000, 10000); // 2秒〜10秒で段階的に増加
    LoopLogger.info(
      `[step5-loop.js] [Step 5-2-2] APIレート制限対策: ${waitTime}ms待機中...`,
      {
        繰り返し回数: iteration,
        待機時間: `${waitTime / 1000}秒`,
      },
    );
    await sleep(waitTime);

    // 完了確認（Step 5-1を再実行）
    LoopLogger.info(
      "[step5-loop.js] [Step 5-2-3] 完了確認のためStep 5-1を再実行",
      {
        繰り返し回数: iteration,
        待機後タイムスタンプ: new Date().toISOString(),
        checkCompletionStatus呼び出し前: true,
      },
    );

    // 【問題特定ログ】checkCompletionStatus呼び出し前の状態
    log.debug(
      `[DEBUG-PROBLEM-TRACE] checkCompletionStatus呼び出し前の詳細状態:`,
      {
        iteration: iteration,
        taskGroupNumber: taskGroup.groupNumber,
        globalStateStats: window.globalState?.stats || "undefined",
        タイムスタンプ: new Date().toISOString(),
      },
    );

    isComplete = await checkCompletionStatus(taskGroup);

    // 【問題特定ログ】checkCompletionStatus呼び出し後の状態
    log.debug(
      `[DEBUG-PROBLEM-TRACE] checkCompletionStatus呼び出し後の詳細状態:`,
      {
        iteration: iteration,
        isComplete: isComplete,
        globalStateStats: window.globalState?.stats || "undefined",
        promptCount: window.globalState.stats?.totalPrompts,
        answerCount: window.globalState.stats?.completedAnswers,
        pendingTasks: window.globalState.stats?.pendingTasks,
        タイムスタンプ: new Date().toISOString(),
      },
    );

    if (!isComplete) {
      LoopLogger.info(
        `[step5-loop.js] [Step 5-2-3] 未完了タスク残り: ${window.globalState.stats.pendingTasks}件 - 繰り返し継続`,
        {
          完了率:
            window.globalState.stats.totalPrompts > 0
              ? Math.round(
                  (window.globalState.stats.completedAnswers /
                    window.globalState.stats.totalPrompts) *
                    100,
                ) + "%"
              : "0%",
          次の繰り返し: iteration + 1,
          推定残り時間: `約${window.globalState.stats.pendingTasks * 30}秒`,
        },
      );
    }
  } while (!isComplete);

  if (isComplete) {
    LoopLogger.info(
      "[step5-loop.js] [Step 5-2-3] タスクグループ完了 - 繰り返し終了",
      {
        総繰り返し回数: iteration,
        処理時間: "計測中",
        最終統計: window.globalState.stats,
      },
    );
  } else {
    LoopLogger.warn("[step5-loop.js] [Step 5-2-3] タスクグループ未完了で終了", {
      理由:
        iteration > maxIterations
          ? "最大繰り返し回数超過"
          : "処理可能タスクなし",
      残りタスク: window.globalState.stats.pendingTasks,
    });
  }
}

/**
 * 全グループを処理するメイン関数
 * Step 3が全体のループ制御を担当
 * @returns {Promise<Object>} 処理結果
 */
async function executeStep3AllGroups() {
  const executionFlowId = `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  log.info(`🚀 [EXECUTION-FLOW] 全グループ処理開始`, {
    executionFlowId,
    timestamp: new Date().toISOString(),
    phase: "START_ALL_GROUPS",
    totalGroups: window.globalState?.taskGroups?.length || 0,
  });

  log.debug("========================================");
  log.debug("🚀 [step3-loop.js] 全グループ処理開始");
  log.debug("========================================");

  // 【追加】DynamicSearch協調システムを初期化
  try {
    initializeDynamicSearchCoordination();
    log.debug("✅ [step3-loop.js] DynamicSearch協調システム初期化完了");
  } catch (error) {
    log.warn(
      "⚠️ [step3-loop.js] DynamicSearch協調システム初期化エラー:",
      error.message,
    );
  }

  log.debug(
    `📊 処理対象: ${window.globalState?.taskGroups?.length || 0}グループ`,
  );

  let completedGroups = 0;

  // currentGroupIndexの初期化（未定義の場合は0から開始）
  if (
    window.globalState &&
    typeof window.globalState.currentGroupIndex !== "number"
  ) {
    window.globalState.currentGroupIndex = 0;
    log.debug(
      "[step3-loop.js] currentGroupIndexを0で初期化（シンプル再生成対応）",
    );
  }

  // 🔧 【初回のみ】step6で未処理グループ1つに絞り込み
  if (window.executeStep6 && window.globalState?.taskGroups?.length > 1) {
    log.info(
      `[step3-loop.js] 🔄 初回起動: 全${window.globalState.taskGroups.length}グループから未処理グループ1つに絞り込み中...`,
    );
    const initialTaskGroups = window.globalState.taskGroups;
    const step6Result = await window.executeStep6(initialTaskGroups, -1);

    if (!step6Result.hasNext) {
      log.info(`[step3-loop.js] 🎉 未処理グループなし、処理終了`);
      return {
        success: true,
        completedGroups: 0,
        totalGroups: 0,
      };
    }

    log.info(
      `[step3-loop.js] ✅ 初回絞り込み完了: ${window.globalState.taskGroups.length}グループを処理`,
    );
  }

  // 各グループを順番に処理（動的タスクグループ再生成対応のためwhileループ使用）
  while (
    window.globalState?.currentGroupIndex <
    (window.globalState?.taskGroups?.length || 0)
  ) {
    const i = window.globalState.currentGroupIndex;
    const taskGroups = window.globalState?.taskGroups || [];
    const taskGroup = taskGroups[i];

    log.debug(
      `\n====== グループ ${i + 1}/${taskGroups.length} 処理開始 ======`,
    );

    // 【診断ログ】Step2とStep3の整合性確認
    log.info("🔍 [STEP2-STEP3-CONSISTENCY] グループ情報整合性確認:", {
      step3GroupNumber: taskGroup.groupNumber,
      step3GroupId: taskGroup.id,
      step3GroupName: taskGroup.name,
      step3ColumnRange: `${taskGroup.columns?.prompts?.[0]} 〜 ${taskGroup.columns?.answer?.primary || taskGroup.columns?.answer?.claude}`,
      step3SkipReason: taskGroup.skipReason,
      step3ProcessingStatus: taskGroup.processingStatus,
      step3CellRange: `${taskGroup.startColumn}:${taskGroup.endColumn}`,
      timestamp: new Date().toISOString(),
    });

    // 【追加】DynamicSearchとの協調チェック：スキップ判定
    log.info("🔍 [STEP-BY-STEP] グループスキップ判定開始:", {
      groupNumber: taskGroup.groupNumber,
      groupType: taskGroup.type || taskGroup.taskType,
      columnRange: `${taskGroup.columns?.prompts?.[0]} 〜 ${taskGroup.columns?.answer?.primary || taskGroup.columns?.answer?.claude}`,
      timestamp: new Date().toISOString(),
    });

    const skipDecision = await shouldSkipGroupProcessing(taskGroup);

    log.info("🔍 [STEP-BY-STEP] スキップ判定結果:", {
      groupNumber: taskGroup.groupNumber,
      skipDecision: skipDecision,
      nextAction: skipDecision ? "二重チェック実行" : "処理継続",
      timestamp: new Date().toISOString(),
    });

    if (skipDecision) {
      // 🛡️ 【安全装置】スキップ前に未処理タスクがないか二重チェック
      const completionCheck = await checkCompletionStatus(taskGroup);

      log.info("🔍 [STEP-BY-STEP] 二重チェック結果:", {
        groupNumber: taskGroup.groupNumber,
        shouldSkipResult: skipDecision,
        completionCheckResult: completionCheck,
        finalDecision: completionCheck
          ? "スキップ実行"
          : "処理継続（安全装置作動）",
        timestamp: new Date().toISOString(),
      });

      if (!completionCheck) {
        log.info(
          "🛡️ [SAFETY-CHECK] スキップ阻止 - グループに未処理タスクあり",
          {
            groupNumber: taskGroup.groupNumber,
            reason:
              "shouldSkipGroupProcessingがtrueでもcheckCompletionStatusがfalse",
            action: "強制的に処理継続",
          },
        );
      } else {
        log.info("⏭️ [step3-loop.js] グループスキップ - 完了確認済み", {
          groupNumber: taskGroup.groupNumber,
          currentIndex: i + 1,
          totalGroups: taskGroups.length,
          safetyCheckPassed: true,
        });
        completedGroups++;

        // スキップ時もstep6を呼び出して次の未処理グループを取得
        if (window.executeStep6) {
          log.debug(`🔄 [step3-loop.js] スキップ後のStep 6呼び出し`);
          const step6Result = await window.executeStep6(taskGroups, i);

          if (!step6Result.hasNext) {
            log.debug(`🏁 [step3-loop.js] 全グループ処理完了`);
            break;
          }
          // step6が次の未処理グループ1つを設定し、currentGroupIndex=0にリセット
        } else {
          // step6が存在しない場合は手動でインクリメント（フォールバック）
          window.globalState.currentGroupIndex = i + 1;
        }

        continue;
      }
    }

    // 🔧 [UNIFICATION] グループ統一化確認ログ
    LoopLogger.info("📋 [UNIFICATION] step3メインループでグループ処理:", {
      グループ番号: i + 1,
      総グループ数: taskGroups.length,
      統一フロー: "step3 → processIncompleteTasks → executeStep4",
      step4自動移行: "無効化済み",
      データ形式: "タスク配列（全グループ統一）",
      プロンプト生成: "統一済み",
      DynamicSearch協調: "有効",
    });

    log.debug(`📋 グループ詳細:`, {
      番号: taskGroup.groupNumber,
      タイプ: taskGroup.taskType || taskGroup.type,
      列範囲: `${taskGroup.columns?.prompts?.[0]} 〜 ${taskGroup.columns?.answer?.primary || taskGroup.columns?.answer?.claude}`,
    });

    // 現在のグループを処理
    const isComplete = await executeStep3SingleGroup(taskGroup);

    if (isComplete) {
      completedGroups++;
      log.debug(`✅ グループ ${i + 1} 完了`);
    }

    // Step 6: 次グループへの移行判定
    if (window.executeStep6) {
      log.debug(`🔄 [step3-loop.js] Step 6 を呼び出し中...`);
      const step6Result = await window.executeStep6(taskGroups, i);

      if (!step6Result.hasNext) {
        log.debug(`🏁 [step3-loop.js] 全グループ処理完了`);
        break;
      }

      // step6がcurrentGroupIndexを更新している可能性があるため、
      // ここではインクリメントせず、次のループでglobalState.currentGroupIndexを参照
    } else {
      // step6が存在しない場合は手動でインクリメント
      window.globalState.currentGroupIndex = i + 1;
    }
  }

  // 【追加】DynamicSearch協調システムのクリーンアップ
  try {
    if (window.dynamicSearchPollingInterval) {
      clearInterval(window.dynamicSearchPollingInterval);
      window.dynamicSearchPollingInterval = null;
      log.debug("🧹 [step3-loop.js] DynamicSearchポーリング停止完了");
    }
  } catch (error) {
    log.warn(
      "⚠️ [step3-loop.js] DynamicSearchクリーンアップエラー:",
      error.message,
    );
  }

  // 最終的なグループ数を取得
  const finalTaskGroups = window.globalState?.taskGroups || [];

  log.debug(`\n========================================`);
  log.debug(
    `📊 処理結果: ${completedGroups}/${finalTaskGroups.length} グループ完了`,
  );
  log.debug(`========================================\n`);

  return {
    success: true,
    completedGroups,
    totalGroups: finalTaskGroups.length,
  };
}

/**
 * 単一グループの処理
 * @param {Object} taskGroup - タスクグループ情報
 * @returns {Promise<boolean>} 完了の場合true
 */
async function executeStep3SingleGroup(taskGroup) {
  const groupExecutionId = `group_${taskGroup?.groupNumber}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  log.info(`🔄 [EXECUTION-FLOW] 単一グループ処理開始`, {
    groupExecutionId,
    timestamp: new Date().toISOString(),
    phase: "START_SINGLE_GROUP",
    groupNumber: taskGroup?.groupNumber,
    groupType: taskGroup?.type || taskGroup?.taskType,
    pattern: taskGroup?.pattern,
    dataStartRow: taskGroup?.dataStartRow,
  });

  LoopLogger.info("========================================");
  LoopLogger.info(
    "[step3-loop.js] [Step 3] タスクグループ内の繰り返し処理開始",
  );
  LoopLogger.info("========================================");
  log.debug("📋 [step5-loop.js] 処理開始グループ:", {
    グループ番号: taskGroup?.groupNumber,
    タイプ: taskGroup?.type || taskGroup?.taskType,
    パターン: taskGroup?.pattern,
    列範囲: `${taskGroup?.columns?.prompts?.[0] || "?"} 〜 ${taskGroup?.columns?.answer?.primary || taskGroup?.columns?.answer?.claude || "?"}`,
    開始行: taskGroup?.dataStartRow,
  });
  // DEBUG: 入力グループ詳細情報

  try {
    // 【修正】統一管理システムを使用してグループ情報を保存
    await setCurrentGroup(taskGroup, "step3-loop");

    // 5-1: 完了状況確認
    log.debug("🔍 [step5-loop.js] Step 5-1: 完了状況を確認中...");
    const isComplete = await checkCompletionStatus(taskGroup);

    if (isComplete) {
      log.debug("✅ [step5-loop.js] グループ完了済み - Step 5終了");
      LoopLogger.info("[step5-loop.js] [Step 5] タスクグループは既に完了");
      return true;
    }

    // 5-2: 未完了時の処理
    log.debug("⚡ [step5-loop.js] Step 5-2: 未完了タスクを処理中...");
    await processIncompleteTasks(taskGroup);

    // 最終的な完了確認
    log.debug("🔍 [step5-loop.js] 最終完了確認中...");
    const finalComplete = await checkCompletionStatus(taskGroup);

    log.info(`✅ [EXECUTION-FLOW] 単一グループ処理完了`, {
      groupExecutionId,
      timestamp: new Date().toISOString(),
      phase: "COMPLETE_SINGLE_GROUP",
      groupNumber: taskGroup?.groupNumber,
      finalComplete,
      duration: `${Date.now() - parseInt(groupExecutionId.split("_")[2])}ms`,
    });

    LoopLogger.info("[step5-loop.js] 🎯 [Step 5] グループ処理完了");

    return finalComplete;
  } catch (error) {
    LoopLogger.error("[Step 5] エラー発生:", {
      エラーメッセージ: error.message,
      スタック: error.stack,
      グループ情報: {
        番号: window.globalState.currentGroup?.groupNumber,
        タイプ: window.globalState.currentGroup?.taskType,
      },
      最終統計: window.globalState.stats,
    });
    throw error;
  }
}

// ========================================
// ヘルパー関数（他のstepファイルと共通化予定）
// ========================================

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readSpreadsheet(range, retryCount = 0) {
  LoopLogger.info(`[Helper] スプレッドシート読み込み: ${range}`);

  try {
    // グローバル状態から認証情報とスプレッドシートIDを取得
    if (!window.globalState || !window.globalState.authToken) {
      throw new Error("認証情報が見つかりません");
    }

    if (!window.globalState.spreadsheetId) {
      throw new Error("スプレッドシートIDが見つかりません");
    }

    const spreadsheetId = window.globalState.spreadsheetId;
    const accessToken = window.globalState.authToken;

    // Google Sheets API呼び出し（既存のapiHeadersを活用）
    const apiUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`;
    const headers = window.globalState.apiHeaders || {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    };

    const response = await fetch(apiUrl, {
      method: "GET",
      headers: headers,
    });

    if (!response.ok) {
      // 429エラー（レート制限）の場合、リトライ処理（最大5回）
      if (response.status === 429 && retryCount < 5) {
        const retryAfter = response.headers.get("Retry-After");

        // バックオフ戦略: 5秒→10秒→20秒→30秒→60秒
        const backoffTimes = [5000, 10000, 20000, 30000, 60000];
        const waitTime = retryAfter
          ? parseInt(retryAfter) * 1000
          : backoffTimes[Math.min(retryCount, backoffTimes.length - 1)];

        LoopLogger.warn(
          `[Helper] APIレート制限エラー (429) 検出。${waitTime}ms後にリトライ...`,
          {
            リトライ回数: retryCount + 1,
            最大リトライ: 5,
            待機時間: `${waitTime / 1000}秒`,
            範囲: range,
          },
        );

        await sleep(waitTime);
        return readSpreadsheet(range, retryCount + 1);
      }

      throw new Error(
        `API応答エラー: ${response.status} ${response.statusText}`,
      );
    }

    const data = await response.json();
    LoopLogger.info(
      `[Helper] 読み込み成功: ${data.values ? data.values.length : 0}行取得`,
    );

    return data;
  } catch (error) {
    LoopLogger.error("[Helper] スプレッドシート読み込みエラー:", error);
    throw error;
  }
}

/**
 * スプレッドシート全体のデータを取得（Step3が期待する2次元配列形式）
 * @returns {Promise<Array>} スプレッドシートの2次元配列データ
 */
async function readFullSpreadsheet() {
  // DEBUG: readFullSpreadsheet関数実行開始

  LoopLogger.info("[Helper] スプレッドシート全体データ取得開始");

  try {
    if (!window.globalState || !window.globalState.spreadsheetId) {
      throw new Error("スプレッドシートIDが見つかりません");
    }

    // 全体範囲を取得（A1:ZZ1000の範囲で十分なデータを取得）
    const fullRange = "A1:ZZ1000";
    const data = await readSpreadsheet(fullRange);

    if (!data || !data.values) {
      LoopLogger.warn("[Helper] スプレッドシートデータが空です");
      return [];
    }

    // ログバッファに集約
    const logData = {
      取得行数: data.values.length,
      "データサンプル（最初の3行）": data.values.slice(0, 3),
    };
    LoopLogger.info(`[Helper] スプレッドシート全体データ取得完了:`, logData);

    // 🔍 デバッグログ：データの形状
    try {
      const debugInfo = {
        全体行数: data.values?.length,
        各行の列数: data.values?.slice(0, 10).map((row, i) => ({
          行番号: i + 1,
          列数: row.length,
        })),
        最長行: Math.max(...(data.values?.map((row) => row.length) || [0])),
        最短行: Math.min(...(data.values?.map((row) => row.length) || [0])),
        "36行目の列数": data.values?.[35]?.length,
        "36行目の内容プレビュー": data.values?.[35]?.slice(0, 5),
      };

      // デバッグ情報を一つのログにまとめる
      const debugLog = {
        データ形状: debugInfo,
        プロパティ詳細: {},
      };

      // オブジェクトの各プロパティをチェック
      for (const [key, value] of Object.entries(debugInfo)) {
        debugLog["プロパティ詳細"][key] = {
          type: typeof value,
          isNull: value === null,
          isUndefined: value === undefined,
          valuePreview: JSON.stringify(value).substring(0, 100),
        };
      }

      // LoopLogger.debug("🔍 [DEBUG] データ形状詳細（統合）:", debugLog);
    } catch (debugError) {
      LoopLogger.error("❌ [DEBUG] デバッグ情報の出力エラー:", {
        message: debugError.message,
        stack: debugError.stack,
        lineNumber: debugError.lineNumber,
      });
    }

    return data.values;
  } catch (error) {
    LoopLogger.error("[Helper] スプレッドシート全体データ取得エラー:", error);
    throw error;
  }
}

async function createTaskList(taskGroup, isFirstRun = false) {
  LoopLogger.info("[Helper] タスクリスト作成開始:", {
    グループ番号: taskGroup?.groupNumber,
    グループタイプ: taskGroup?.groupType,
    列情報: taskGroup?.columns,
    dataStartRow: taskGroup?.dataStartRow,
    初回実行: isFirstRun
      ? "はい（作業中マーカー削除あり）"
      : "いいえ（通常処理）",
  });

  // ログバッファを初期化
  const logBuffer = [];
  const addLog = (message, data) => {
    if (data) {
      logBuffer.push(`${message}: ${JSON.stringify(data)}`);
    } else {
      logBuffer.push(message);
    }
  };

  try {
    // Step3TaskList利用可能性の詳細チェック

    // step3-tasklist.jsのgenerateTaskList関数を利用
    if (!window.Step3TaskList || !window.Step3TaskList.generateTaskList) {
      throw new Error("Step3TaskList.generateTaskListが利用できません");
    }

    // 重要：Step3が期待する実際のスプレッドシートデータ（2次元配列）を取得
    LoopLogger.info("[Helper] スプレッドシート全体データを取得中...");
    const spreadsheetData = await readFullSpreadsheet();

    if (!spreadsheetData || spreadsheetData.length === 0) {
      LoopLogger.warn(
        "[Helper] スプレッドシートデータが空のため、タスク生成をスキップ",
      );
      return [];
    }

    const specialRows = {
      menuRow: window.globalState.setupResult?.menuRow || 3,
      aiRow: window.globalState.setupResult?.aiRow || 5,
      modelRow: window.globalState.setupResult?.modelRow || 6,
      functionRow: window.globalState.setupResult?.functionRow || 7,
    };

    // taskGroupから直接dataStartRowを取得（統一構造）
    const dataStartRow =
      taskGroup?.dataStartRow ||
      window.globalState.setupResult?.dataStartRow ||
      9;

    const options = {
      batchSize: 3,
      forceReprocess: false,
      spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${window.globalState.spreadsheetId}/edit#gid=${window.globalState.gid}`,
    };

    // Step 5-3-前処理: 制御情報の取得と適用
    LoopLogger.info(
      "[createTaskList] [Step 5-3-前処理] 行制御・列制御情報を取得中...",
    );

    let rowControls = [];
    let columnControls = [];

    try {
      // Step 5-3-1: 行制御をチェック
      rowControls = window.Step3TaskList.getRowControl(spreadsheetData);

      // 🔧 [OFFSET-FIX] createTaskList用のdataStartRowオフセット適用
      // 注意：spreadsheetDataは全体データなので、dataStartRowオフセットは不要
      // rowControlsは既に正しい行番号を持っている

      LoopLogger.info("[createTaskList] [Step 5-3-1] 行制御情報取得完了:", {
        制御数: rowControls.length,
        詳細: rowControls.map((c) => `${c.type}制御: ${c.row}行目`),
        備考: "全体データからの行制御取得（オフセット不要）",
      });

      // Step 5-3-2: 列制御の再チェック（タスクグループ作成後の追加フィルタ）
      const columnControlRow =
        window.globalState.setupResult?.columnControlRow || 4;
      columnControls = window.Step3TaskList.getColumnControl(
        spreadsheetData,
        columnControlRow,
      );
      LoopLogger.info("[createTaskList] [Step 5-3-2] 列制御情報取得完了:", {
        制御数: columnControls.length,
        制御行: columnControlRow,
        詳細: columnControls.map((c) => `${c.type}制御: ${c.column}列`),
      });
    } catch (error) {
      LoopLogger.error(
        "[createTaskList] [Step 5-3-前処理] 制御情報取得エラー:",
        {
          エラーメッセージ: error.message,
          スタック: error.stack,
        },
      );
      // エラーが発生しても処理を継続
    }

    // Step 5-3-3: 列制御チェック（タスクグループレベルでの追加フィルタリング）
    if (columnControls.length > 0) {
      LoopLogger.info("[createTaskList] [Step 5-3-3] 列制御チェック実行中...");

      if (
        !window.Step3TaskList.shouldProcessColumn(taskGroup, columnControls)
      ) {
        LoopLogger.info("[createTaskList] [Step 5-3-3] タスクグループ除外:", {
          グループ番号: taskGroup.groupNumber,
          理由: "列制御により除外（この列から処理/この列の処理後に停止/この列のみ処理）",
          グループ列: taskGroup?.columns?.prompts,
          列制御: columnControls.map((c) => `${c.type}:${c.column}`),
        });
        return []; // このタスクグループは処理しない
      } else {
        LoopLogger.info("[createTaskList] [Step 5-3-3] タスクグループ通過:", {
          グループ番号: taskGroup.groupNumber,
          理由: "列制御を通過",
        });
      }
    } else {
      LoopLogger.info(
        "[createTaskList] [Step 5-3-前処理] 列制御なし - 全てのタスクグループを処理",
      );
    }

    // 拡張オプションに制御情報を追加
    const extendedOptions = {
      ...options,
      rowControls: rowControls,
      columnControls: columnControls,
      applyRowControl: true,
      applyColumnControl: true,
      isFirstRun: isFirstRun, // 初回実行フラグを追加
    };

    // DEBUG: Step3に渡すパラメータ

    // ログバッファを一つのログとして出力
    // LoopLogger.info(`[Step5-Loop] [統合ログ]\n${logBuffer.join("\n")}`);

    // generateTaskList内でaddLogが使われているため、グローバルに定義
    if (typeof window.addLog === "undefined") {
      window.addLog = (message, data) => {
        if (data) {
          LoopLogger.info(`[Step3-TaskList] ${message}:`, data);
        } else {
          LoopLogger.info(`[Step3-TaskList] ${message}`);
        }
      };
    }

    // タスクリスト生成を実行（制御情報付き）
    const tasks = await window.Step3TaskList.generateTaskList(
      taskGroup,
      spreadsheetData, // 修正：実際の2次元配列データを渡す
      specialRows,
      dataStartRow,
      extendedOptions, // 制御情報を含む拡張オプション
    );

    LoopLogger.info(`[Helper] タスクリスト作成完了: ${tasks.length}件のタスク`);
    if (tasks.length > 0) {
      LoopLogger.info("[Helper] 生成されたタスクサンプル:", tasks.slice(0, 2));
    } else {
      LoopLogger.warn(
        "[Helper] ⚠️ 0件のタスクが生成されました。以下を確認してください:",
      );
      LoopLogger.warn(
        "  - taskGroup.columns.prompts:",
        taskGroup?.columns?.prompts,
      );
      LoopLogger.warn("  - プロンプトデータの存在確認が必要");
    }

    return tasks;
  } catch (error) {
    LoopLogger.error("[Helper] タスクリスト作成エラー:", {
      エラーメッセージ: error.message,
      スタック: error.stack,
      taskGroup: taskGroup,
      "window.Step3TaskList": !!window.Step3TaskList,
    });
    throw error;
  }
}

async function executeTasks(tasks, taskGroup) {
  LoopLogger.info(`[Helper] タスク実行開始: ${tasks.length}件`, {
    グループ番号: taskGroup?.groupNumber,
    タスクタイプ: taskGroup?.taskType,
    パターン: taskGroup?.pattern,
  });

  // 🔍 デバッグ: 関数開始直後のログ
  // DEBUG: executeTasks関数に入りました

  try {
    // step4-execute.jsのexecuteStep4関数を利用
    // DEBUG: executeStep4チェック開始
    // DEBUG: executeStep4呼び出し前チェック

    if (!window.executeStep4) {
      log.error("executeStep4が見つかりません！");
      throw new Error("executeStep4関数が利用できません");
    }

    // DEBUG: executeStep4が見つかりました

    if (!tasks || tasks.length === 0) {
      LoopLogger.warn("[Helper] 実行するタスクがありません");
      return [];
    }

    // タスクリストを適切な形式に変換（Step4が期待する形式に統一）
    const formattedTasks = tasks.map((task, index) => {
      // DEBUG: Step3からのタスクデータ詳細

      // Step3で生成されたタスクの情報を使用（AI行の実際の値）
      // taskGroupのAI列の値も考慮（グループ2はClaude、グループ3はChatGPT等）
      let aiType = task.ai || task.aiType;

      // aiTypeが取得できない場合、taskGroupの回答列から推測
      if (!aiType && taskGroup?.answerColumnLetter) {
        const columnLetter = taskGroup.answerColumnLetter;
        // AG列 = Claude, P列 = ChatGPT, Q列 = Gemini 等のマッピング
        if (columnLetter === "AG" || columnLetter === "AK") {
          aiType = "Claude";
        } else if (columnLetter === "P" || columnLetter === "T") {
          aiType = "ChatGPT";
        } else if (columnLetter === "Q" || columnLetter === "U") {
          aiType = "Gemini";
        } else {
          aiType = "Claude"; // デフォルト
        }
        log.debug(`[DEBUG] aiType推測: ${columnLetter}列 → ${aiType}`);
      }

      // それでも取得できない場合はデフォルト値
      aiType = aiType || "Claude";

      // DEBUG: aiType決定プロセス

      const formattedTask = {
        id:
          task.taskId ||
          task.id ||
          `task-${task.row}-${taskGroup.groupNumber}-${index}`,
        row: task.row,
        aiType: aiType,
        prompt: task.prompt || task.text || "",
        answerCell: task.answerCell, // 🔧 [FIX] 直接task.answerCellを設定
        logCell: task.logCell, // 🔧 [FIX] ルートレベルにlogCellを追加
        spreadsheetData: {
          id: window.globalState.spreadsheetId,
          gid: window.globalState.gid,
          spreadsheetId: task.spreadsheetId || window.globalState.spreadsheetId, // Step3からの情報
          answerCell: task.answerCell, // Step3で計算された回答セル
          logCell: task.logCell, // Step3で計算されたログセル（互換性のため残す）
        },
        columns: taskGroup.columns,
        taskGroup: taskGroup,
        // Step3からの詳細情報を保持
        model: task.model || "",
        function: task.function || "",
        groupNumber: task.groupNumber,
        groupType: task.groupType,
      };

      // DEBUG: 最終フォーマットタスクの確認

      LoopLogger.info(`[Helper] タスク${index + 1}フォーマット完了:`, {
        taskId: formattedTask.id,
        row: formattedTask.row,
        aiType: formattedTask.aiType,
        プロンプト長: formattedTask.prompt.length,
        answerCell: formattedTask.answerCell, // 🔧 [FIX] 直接参照するように変更
        logCell: formattedTask.spreadsheetData.logCell,
      });

      return formattedTask;
    });

    LoopLogger.info(
      `[Helper] フォーマット済みタスク: ${formattedTasks.length}件`,
    );
    LoopLogger.info("[Helper] 最初のタスク詳細:", formattedTasks[0]);

    // Step4バリデーション
    for (const task of formattedTasks) {
      if (!task.aiType) {
        throw new Error(`タスク${task.id}: aiTypeが未定義`);
      }
      if (!task.prompt) {
        throw new Error(`タスク${task.id}: promptが未定義`);
      }
      // 特殊タスク（report, genspark）の場合はanswerCellが不要なので警告を出さない
      const isSpecialTask =
        task.groupType === "report" ||
        task.groupType === "genspark" ||
        task.ai === "Report" ||
        task.ai === "Genspark";

      // デバッグログ：タスクの詳細情報を出力
      if (!task.spreadsheetData.answerCell) {
        // DEBUG: answerCell検証

        if (!isSpecialTask) {
          LoopLogger.warn(`タスク${task.id}: answerCellが未定義（通常タスク）`);
        } else {
          LoopLogger.info(`タスク${task.id}: answerCell不要（特殊タスク）`);
        }
      }
    }

    // Step4を実行
    LoopLogger.info("[Helper] Step4実行中...");

    // 🔧 [UNIFICATION] タスク配列生成確認ログ
    LoopLogger.info("📋 [UNIFICATION] processIncompleteTasks → executeStep4:", {
      データ形式: "タスク配列",
      タスク数: formattedTasks.length,
      グループ番号: formattedTasks[0]?.groupNumber || "不明",
      最初のタスクID: formattedTasks[0]?.id || "不明",
      プロンプトプレビュー:
        formattedTasks[0]?.prompt?.substring(0, 50) + "..." || "なし",
      executeStep4呼び出し: "step3経由（統一フロー）",
      生成方法: "generateTaskList経由",
    });

    // DEBUG: executeStep4呼び出し直前の詳細ログ
    // DEBUG: executeStep4を呼び出す直前

    // 🎯 [DEBUG] 最終チェック - より詳細な情報
    // DEBUG: executeStep4呼び出し直前の最終チェック

    try {
      // DEBUG: executeStep4を呼び出し
      log.debug(
        "🔍 [STEP3-EXEC] executeStep4呼び出し前のSimpleSheetsClient状態:",
        !!window.simpleSheetsClient,
      );
      const results = await window.executeStep4(formattedTasks);
      // DEBUG: executeStep4完了
      log.debug(
        "✅ [STEP3-EXEC] executeStep4実行完了後のSimpleSheetsClient状態:",
        !!window.simpleSheetsClient,
      );
      return results || [];
    } catch (step4Error) {
      log.error("executeStep4でエラーが発生:", step4Error.message);
      throw step4Error;
    }
  } catch (error) {
    LoopLogger.error("⚠️ [DEBUG] エラー詳細:", {
      message: error.message,
      stack: error.stack,
      name: error.name,
      cause: error.cause,
    });

    LoopLogger.error("[Helper] タスク実行エラー:", {
      エラーメッセージ: error.message,
      スタック: error.stack,
      タスク数: tasks?.length,
      グループ情報: {
        番号: taskGroup?.groupNumber,
        タイプ: taskGroup?.taskType,
      },
      "window.executeStep4存在": !!window.executeStep4,
    });
    throw error;
  }
}

// ブラウザ環境用のグローバルエクスポート
// DEBUG: グローバルエクスポート前の状態

if (typeof window !== "undefined") {
  try {
    // Step 3 として関数をエクスポート
    window.executeStep3 = executeStep3AllGroups; // メインエントリーポイント
    window.executeStep3AllGroups = executeStep3AllGroups; // 明示的な名前でもエクスポート
    window.executeStep3SingleGroup = executeStep3SingleGroup; // 単一グループ処理

    // 互換性のため旧名称でもエクスポート
    window.executeStep5 = executeStep3AllGroups;
    window.executeStep5SingleGroup = executeStep3SingleGroup;

    window.checkCompletionStatus = checkCompletionStatus;
    window.processIncompleteTasks = processIncompleteTasks;
    window.readFullSpreadsheet = readFullSpreadsheet;

    // 【追加】DynamicSearch協調機能のエクスポート
    window.initializeDynamicSearchCoordination =
      initializeDynamicSearchCoordination;
    window.shouldSkipGroupProcessing = shouldSkipGroupProcessing;
    window.handleDynamicSearchCompletion = handleDynamicSearchCompletion;

    // 【追加】currentGroup一元管理システムのエクスポート
    window.setCurrentGroup = setCurrentGroup;
    window.getCurrentGroup = getCurrentGroup;
    window.addCurrentGroupListener = addCurrentGroupListener;
    window.removeCurrentGroupListener = removeCurrentGroupListener;

    // 【追加】グループ移行協調システムのエクスポート
    window.executeGroupTransition = executeGroupTransition;
    window.getTransitionDiagnostics = getTransitionDiagnostics;

    // DEBUG: グローバルエクスポート成功
  } catch (exportError) {
    LoopLogger.error("❌ [DEBUG] グローバルエクスポートエラー:", exportError);
  }
}

// エクスポート
// DEBUG: モジュールエクスポートチェック

if (typeof module !== "undefined" && module.exports) {
  try {
    module.exports = {
      executeStep5,
      checkCompletionStatus,
      processIncompleteTasks,
      readFullSpreadsheet,
      globalState: window.globalState,
    };
    // DEBUG: モジュールエクスポート成功
  } catch (moduleExportError) {
    LoopLogger.error(
      "❌ [DEBUG] モジュールエクスポートエラー:",
      moduleExportError,
    );
  }
}

// ファイル読み込み完了ログ
// DEBUG: step5-loop.js 読み込み完了
