// ログレベル定義
const LOG_LEVEL = { ERROR: 1, WARN: 2, INFO: 3, DEBUG: 4 };

// Chrome Storageからログレベルを取得（非同期）
let CURRENT_LOG_LEVEL = LOG_LEVEL.INFO; // デフォルト値

// Chrome拡張環境でのみStorageから設定を読み込む
if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
  chrome.storage.local.get('logLevel', (result) => {
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
  }
};

/**
 * @fileoverview ステップ6: 次のタスクグループへの移行と終了処理
 *
 * overview.mdのステップ番号体系を完全遵守：
 *
 * ステップ6: 次のタスクグループへ移行
 * - 6-1: 次グループの確認
 *   - 6-1-1: 現在のグループ番号を取得
 *   - 6-1-2: 次のグループの存在確認
 * - 6-2: 次グループの処理
 *   - 6-2-1: グループが存在する場合（グループ番号をインクリメント、ステップ3から再開）
 *   - 6-2-2: すべて完了した場合（次の終了処理へ進む）
 * - 6-3: 終了処理
 *   - 6-3-1: スリープ防止の解除
 *   - 6-3-2: 処理統計の集計
 *   - 6-3-3: 完了メッセージの表示
 */

// 統一されたグローバル状態を使用（防御的プログラミング適用）
if (!window.globalState) {
  window.globalState = {
    // Core Data (統一構造)
    spreadsheetId: null,
    gid: null,
    authToken: null,
    apiHeaders: null,
    sheetsApiBase: null,

    // Step Results
    specialRows: null, // step1の結果
    taskGroups: [], // step2の結果

    // Progress Tracking
    currentGroupIndex: 0,
    processedGroups: [], // 詳細追跡配列

    // Timing
    startTime: null,
    endTime: null,

    // Statistics (詳細版)
    stats: {
      totalGroups: 0,
      completedGroups: 0,
      totalTasks: 0,
      successTasks: 0,
      failedTasks: 0,
      retryCount: 0,
    },

    // Resources
    wakeLock: null,
  };
}

/**
 * 次グループの確認（防御的プログラミング適用）
 * @returns {Object|null} 次のグループ情報、存在しない場合null
 */
function checkNextGroup() {
  // 安全な配列アクセス
  const taskGroups = window.globalState?.taskGroups || [];
  const processedGroups = window.globalState?.processedGroups || [];
  const currentIndex = window.globalState?.currentGroupIndex || 0;

  log.debug("🔄 [step6-nextgroup.js] ====== Step 6 開始 ======");
  log.debug("[step6-nextgroup.js→Step6-1] 次グループの確認", {
    現在の状態: {
      グループ数: taskGroups.length,
      現在インデックス: currentIndex,
      処理済み数: processedGroups.length,
      各グループの状態: taskGroups.map((g, i) => ({
        index: i,
        番号: g.groupNumber,
        タイプ: g.taskType || g.type,
        処理済み: i < currentIndex ? "✅" : i === currentIndex ? "⚡" : "⏳",
      })),
    },
  });

  // ========================================
  // Step 6-1-1: 現在のグループ番号を取得
  // ========================================
  log.debug("[step6-nextgroup.js→Step6-1-1] 現在のグループ番号を取得");

  // データ検証（防御的プログラミング）
  if (!Array.isArray(taskGroups)) {
    log.error(
      "[step6-nextgroup.js] [Step 6-1-1] エラー: taskGroupsが不正",
      {
        taskGroups: taskGroups,
        型: typeof taskGroups,
      },
    );
    return null;
  }

  const totalGroups = taskGroups.length;
  log.debug(
    `[step6-nextgroup.js] [Step 6-1-1] 現在のグループ番号: ${currentIndex + 1}/${totalGroups}`,
    {
      インデックス: currentIndex,
      総グループ数: totalGroups,
      処理済みグループ: processedGroups.map((g) => g?.index || "undefined"),
    },
  );

  // ========================================
  // Step 6-1-2: 次のグループの存在確認
  // ========================================
  log.debug("[step6-nextgroup.js→Step6-1-2] 次のグループの存在確認");

  // タスクグループ配列を確認
  if (currentIndex + 1 < totalGroups) {
    const nextGroup = taskGroups[currentIndex + 1];

    if (!nextGroup) {
      log.error(
        "[step6-nextgroup.js] [Step 6-1-2] エラー: 次グループのデータが不正",
        {
          期待インデックス: currentIndex + 1,
          実際のデータ: nextGroup,
        },
      );
      return null;
    }

    log.debug("[step6-nextgroup.js] [Step 6-1-2] 次のグループが存在:", {
      番号: currentIndex + 2,
      タイプ: nextGroup.taskType || nextGroup.type || "undefined",
      パターン: nextGroup.pattern || "undefined",
      列: nextGroup.columns || {},
      詳細: {
        プロンプト列: nextGroup.columns?.prompts || [],
        回答列: nextGroup.columns?.answer || "undefined",
      },
    });
    return nextGroup;
  }

  log.debug(
    "[step6-nextgroup.js] [Step 6-1-2] 次のグループなし（全グループ処理完了）",
    {
      処理済みグループ数: processedGroups.length,
      総グループ数: totalGroups,
      完了率:
        totalGroups > 0
          ? Math.round((processedGroups.length / totalGroups) * 100) + "%"
          : "0%",
    },
  );
  return null;
}

/**
 * 次グループの処理（防御的プログラミング適用）
 * @param {Object} nextGroup - 次のグループ情報
 * @returns {Promise<void>}
 */
async function processNextGroup(nextGroup) {
  log.debug("[step6-nextgroup.js→Step6-2] 次グループの処理", {
    グループ詳細: {
      番号: (window.globalState?.currentGroupIndex || 0) + 2,
      タイプ: nextGroup?.taskType || nextGroup?.type || "undefined",
      パターン: nextGroup?.pattern || "undefined",
    },
  });

  try {
    // データ検証
    if (!nextGroup) {
      throw new Error(
        "[step6-nextgroup.js] [Step 6-2] エラー: nextGroupがnullまたはundefined",
      );
    }

    // ========================================
    // Step 6-2-1: グループが存在する場合
    // ========================================
    log.debug(
      "[step6-nextgroup.js→Step6-2-1] 次のグループが存在する場合の処理",
    );

    // 安全な状態更新
    const prevIndex = window.globalState?.currentGroupIndex || 0;
    if (window.globalState) {
      window.globalState.currentGroupIndex = prevIndex + 1;
      if (window.globalState.stats) {
        window.globalState.stats.completedGroups =
          (window.globalState.stats.completedGroups || 0) + 1;
      }
    }

    log.debug(
      `[step6-nextgroup.js] [Step 6-2-1] グループ番号をインクリメント: ${prevIndex + 1} → ${(window.globalState?.currentGroupIndex || 0) + 1}`,
      {
        前のインデックス: prevIndex,
        新しいインデックス: window.globalState?.currentGroupIndex || 0,
        完了グループ数: window.globalState?.stats?.completedGroups || 0,
      },
    );

    const startCol = nextGroup.columns?.prompts?.[0] || "undefined";
    // 【統一修正】全てオブジェクト形式に統一
    const endCol =
      nextGroup.columns?.answer?.gemini ||
      nextGroup.columns?.answer?.primary ||
      Object.values(nextGroup.columns?.answer || {})[0] ||
      "undefined";

    log.debug(
      `[step6-nextgroup.js] [Step 6-2-1] グループ ${(window.globalState?.currentGroupIndex || 0) + 1} 処理開始:`,
      {
        タイプ: nextGroup.taskType || nextGroup.type,
        パターン: nextGroup.pattern,
        列範囲: `${startCol}-${endCol}`,
        詳細: {
          プロンプト列数: nextGroup.columns?.prompts?.length || 0,
          回答列タイプ: typeof nextGroup.columns?.answer,
          開始行: nextGroup.dataStartRow || "undefined",
        },
      },
    );

    // 次のグループに移行するだけで、ここでstepを実行しない
    log.debug("[step6-nextgroup.js] [Step 6-2-1] 次のグループに移行設定完了");

    // globalStateを更新して次のグループを設定
    if (typeof window !== "undefined" && window.globalState) {
      // nextIndexは既に上で更新済みなので、currentGroupIndexを使用
      window.globalState.currentGroup = nextGroup;
      log.debug(
        `[step6-nextgroup.js] グループ${nextGroup.number}に移行設定完了`,
      );
    }

    log.debug("[step6-nextgroup.js] [Step 6-2-1] 次グループ移行完了");
  } catch (error) {
    log.error("[step6-nextgroup.js] [Step 6-2-1] 次グループ処理エラー:", {
      エラーメッセージ: error.message,
      スタック: error.stack,
      グループ情報: {
        インデックス: window.globalState?.currentGroupIndex || 0,
        タイプ: nextGroup?.taskType || nextGroup?.type,
        パターン: nextGroup?.pattern,
      },
      現在の統計: window.globalState?.stats || {},
    });
    throw error;
  }
}

/**
 * スリープ防止解除（防御的プログラミング適用）
 * @returns {Promise<void>}
 */
async function releaseSleepPrevention() {
  const wakeLock = window.globalState?.wakeLock;
  const startTime = window.globalState?.startTime;

  log.debug("[step6-nextgroup.js] [Step 6-3-1] スリープ防止の解除", {
    wakeLock状態: wakeLock ? "有効" : "無効",
    処理時間: startTime ? `${Date.now() - startTime}ms` : "不明",
  });

  try {
    if (wakeLock) {
      log.debug("[step6-nextgroup.js] [Step 6-3-1] Wake Lockをリリース中...");
      await wakeLock.release();
      if (window.globalState) {
        window.globalState.wakeLock = null;
      }
      log.debug("[step6-nextgroup.js] [Step 6-3-1] Wake Lockリリース完了");
    }

    log.debug("[step6-nextgroup.js] [Step 6-3-1] スリープ防止解除完了");
  } catch (error) {
    log.warn("[step6-nextgroup.js] [Step 6-3-1] スリープ防止解除エラー:", {
      エラー: error.message,
      wakeLock状態: wakeLock ? "解除失敗" : "既に解除済み",
    });
  }
}

/**
 * 処理統計の集計（防御的プログラミング適用）
 * @returns {Object} 統計情報
 */
function calculateStatistics() {
  const stats = window.globalState?.stats || {};
  const taskGroups = window.globalState?.taskGroups || [];
  const startTime = window.globalState?.startTime || new Date();

  log.debug("[step6-nextgroup.js] [Step 6-3-2] 処理統計の集計", {
    開始時刻: startTime ? new Date(startTime).toISOString() : "不明",
    現在の統計: stats,
  });

  const endTime = new Date();
  const duration = endTime - startTime;

  // 処理時間を分と秒に変換
  const minutes = Math.floor(duration / 60000);
  const seconds = Math.floor((duration % 60000) / 1000);

  log.debug("[step6-nextgroup.js] [Step 6-3-2] 統計集計中...");

  // 安全な統計値取得
  const totalTasks = stats.totalTasks || 0;
  const successTasks = stats.successTasks || 0;
  const failedTasks = stats.failedTasks || 0;
  const completedGroups = stats.completedGroups || 0;
  const retryCount = stats.retryCount || 0;

  log.debug(`[step6-nextgroup.js] [Step 6-3-2] 総タスク数: ${totalTasks}件`);
  log.debug(
    `[step6-nextgroup.js] [Step 6-3-2] 成功タスク数: ${successTasks}件`,
  );
  log.debug(
    `[step6-nextgroup.js] [Step 6-3-2] 失敗タスク数: ${failedTasks}件`,
  );
  log.debug(
    `[step6-nextgroup.js] [Step 6-3-2] 処理時間: ${minutes}分${seconds}秒`,
  );

  const statistics = {
    総グループ数: taskGroups.length,
    完了グループ数: completedGroups,
    総タスク数: totalTasks,
    成功タスク数: successTasks,
    失敗タスク数: failedTasks,
    リトライ回数: retryCount,
    処理時間: `${minutes}分${seconds}秒`,
    開始時刻: startTime.toLocaleString("ja-JP"),
    終了時刻: endTime.toLocaleString("ja-JP"),
    成功率:
      totalTasks > 0
        ? Math.round((successTasks / totalTasks) * 100) + "%"
        : "0%",
  };

  log.debug("[step6-nextgroup.js] [Step 6-3-2] 統計集計完了:", statistics);

  // エラー率の計算
  if (failedTasks > 0) {
    log.warn("[step6-nextgroup.js] [Step 6-3-2] 警告: 失敗タスクあり", {
      失敗率:
        totalTasks > 0
          ? Math.round((failedTasks / totalTasks) * 100) + "%"
          : "0%",
      失敗タスク詳細: "詳細ログを確認してください",
    });
  }

  return statistics;
}

/**
 * 完了メッセージの表示（防御的プログラミング適用）
 * @param {Object} statistics - 統計情報
 */
function showCompletionMessage(statistics) {
  log.debug("[step6-nextgroup.js] [Step 6-3-3] 完了メッセージの表示", {
    成功率: statistics?.成功率 || "0%",
    処理時間: statistics?.処理時間 || "不明",
    総タスク数: statistics?.総タスク数 || 0,
  });

  const message = `
✅ ================================
   全タスク処理完了
================================

📊 処理統計:
   総グループ数: ${statistics?.総グループ数 || 0}
   完了グループ: ${statistics?.完了グループ数 || 0}
   総タスク数: ${statistics?.総タスク数 || 0}
   成功: ${statistics?.成功タスク数 || 0}件
   失敗: ${statistics?.失敗タスク数 || 0}件
   成功率: ${statistics?.成功率 || "0%"}

⏱️ 処理時間:
   ${statistics?.処理時間 || "不明"}
   開始: ${statistics?.開始時刻 || "不明"}
   終了: ${statistics?.終了時刻 || "不明"}

================================
`;

  log.debug(message);

  // 処理詳細ログ（安全な配列アクセス）
  const processedGroups = window.globalState?.processedGroups || [];
  if (processedGroups.length > 0) {
    log.debug("\n📋 処理済みグループ詳細:");
    processedGroups.forEach((item, index) => {
      if (item && item.group) {
        log.debug(
          `   ${index + 1}. ${item.group.taskType || item.group.type || "不明"} - ${item.timestamp || "不明"}`,
          {
            グループ番号: item.index || "不明",
            パターン: item.group.pattern || "不明",
            列範囲: item.group.columns || {},
          },
        );
      }
    });
  } else {
    log.warn(
      "[step6-nextgroup.js] [Step 6-3-3] 警告: 処理済みグループがありません",
    );
  }

  // エラーがある場合の追加メッセージ
  if ((statistics?.失敗タスク数 || 0) > 0) {
    log.warn("\n⚠️ 一部のタスクが失敗しました。ログを確認してください。");
  }

  return message;
}

/**
 * 終了処理（防御的プログラミング適用）
 * @returns {Promise<Object>}
 */
async function performShutdown() {
  const processedGroups = window.globalState?.processedGroups || [];
  const taskGroups = window.globalState?.taskGroups || [];
  const startTime = window.globalState?.startTime;

  log.debug("[step6-nextgroup.js] [Step 6-3] 終了処理", {
    処理グループ数: processedGroups.length,
    総グループ数: taskGroups.length,
    開始時刻: startTime ? new Date(startTime).toISOString() : "不明",
  });

  try {
    // ========================================
    // Step 6-3-1: スリープ防止の解除
    // ========================================
    await releaseSleepPrevention();

    // ========================================
    // Step 6-3-2: 処理統計の集計
    // ========================================
    const statistics = calculateStatistics();

    // ========================================
    // Step 6-3-3: 完了メッセージの表示
    // ========================================
    const message = showCompletionMessage(statistics);

    // クリーンアップ処理
    log.debug("[step6-nextgroup.js] [Step 6-3] クリーンアップ処理");
    log.debug("[step6-nextgroup.js] [Step 6-3] 終了処理完了");

    return {
      success: true,
      statistics,
      message,
    };
  } catch (error) {
    log.error("[step6-nextgroup.js] [Step 6-3] 終了処理エラー:", {
      エラーメッセージ: error.message,
      スタック: error.stack,
      最終統計: window.globalState?.stats || {},
      処理済みグループ数: (window.globalState?.processedGroups || []).length,
    });
    throw error;
  }
}

/**
 * メイン処理（ステップ6）- 防御的プログラミング適用
 * @param {Array} taskGroups - 全タスクグループ
 * @param {number} currentIndex - 現在のグループインデックス
 * @returns {Promise<Object>} 処理結果
 */
async function executeStep6(taskGroups = [], currentIndex = 0) {
  log.debug("========================================");
  log.debug("[Step 6] 次のタスクグループへ移行");
  log.debug("========================================");
  log.debug("[Step 6] 入力パラメータ:", {
    タスクグループ数: Array.isArray(taskGroups) ? taskGroups.length : 0,
    現在のインデックス: currentIndex || 0,
    グループ詳細:
      Array.isArray(taskGroups) && taskGroups.length > 0
        ? taskGroups.slice(0, 3)
        : [],
  });

  // 状態を安全に初期化
  if (window.globalState) {
    window.globalState.taskGroups = Array.isArray(taskGroups) ? taskGroups : [];
    window.globalState.currentGroupIndex = currentIndex || 0;
  }

  try {
    // Step 6-1: 次グループの確認
    const nextGroup = checkNextGroup();

    if (nextGroup) {
      // Step 6-2-1: グループが存在する場合
      log.debug(
        "[step6-nextgroup.js] [Step 6-2-1] 次グループが存在 → 処理継続",
      );
      await processNextGroup(nextGroup);

      return {
        hasNext: true,
        nextGroup,
        nextIndex: window.globalState?.currentGroupIndex || 0,
      };
    } else {
      // Step 6-2-2: すべて完了した場合
      log.debug(
        "[step6-nextgroup.js] [Step 6-2-2] すべて完了した場合 → 終了処理へ進む",
      );

      // Step 6-3: 終了処理
      const result = await performShutdown();

      return {
        hasNext: false,
        ...result,
      };
    }
  } catch (error) {
    log.error("[step6-nextgroup.js] [Step 6] エラー発生:", {
      エラーメッセージ: error.message,
      スタック: error.stack,
      現在の状態: {
        グループインデックス: window.globalState?.currentGroupIndex || 0,
        処理済みグループ数: (window.globalState?.processedGroups || []).length,
        統計: window.globalState?.stats || {},
        // デバッグ用
        globalStateExists: !!window.globalState,
        taskGroupsType: typeof window.globalState?.taskGroups,
        processedGroupsExists: Array.isArray(
          window.globalState?.processedGroups,
        ),
      },
    });

    // エラー時も終了処理を実行
    log.debug("[Step 6] エラーリカバリー: 終了処理を実行");
    try {
      await performShutdown();
    } catch (shutdownError) {
      log.error("[Step 6] エラーリカバリー失敗:", shutdownError);
    }

    throw error;
  }
}

// ========================================
// ヘルパー関数（防御的プログラミング適用）
// ========================================

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms || 0));
}

// 状態管理用の関数（安全な更新）
function updateStats(updates = {}) {
  if (window.globalState && window.globalState.stats) {
    Object.assign(window.globalState.stats, updates);
  }
}

function setStartTime() {
  if (window.globalState) {
    window.globalState.startTime = new Date();
  }
}

function setWakeLock(wakeLock) {
  if (window.globalState) {
    window.globalState.wakeLock = wakeLock;
  }
}

// Node.js環境用のエクスポート
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    executeStep6,
    checkNextGroup,
    processNextGroup,
    performShutdown,
    calculateStatistics,
    updateStats,
    setStartTime,
    setWakeLock,
  };
}

// ブラウザ環境用のグローバル関数登録
if (typeof window !== "undefined") {
  window.executeStep6 = executeStep6;
  window.checkNextGroup = checkNextGroup;
  window.processNextGroup = processNextGroup;
  window.performShutdown = performShutdown;
  window.calculateStatistics = calculateStatistics;
  window.updateStats = updateStats;
  window.setStartTime = setStartTime;
  window.setWakeLock = setWakeLock;
}

log.debug(
  "[step6-nextgroup.js] ✅ Step6関数定義完了（復元版 + 防御的プログラミング適用）",
);
