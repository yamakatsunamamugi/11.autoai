/**
 * @fileoverview ステップ6: 次のタスクグループへの移行と終了処理（簡素化版）
 */

// 統一されたglobalState初期化
if (!window.globalState) {
  window.globalState = {
    // 基本情報
    spreadsheetId: null,
    gid: null,
    authToken: null,
    apiHeaders: null,

    // step1結果
    specialRows: null,

    // step2結果
    taskGroups: [],

    // 進行状況
    currentGroupIndex: 0,

    // 最小限統計
    stats: { completed: 0, total: 0 }
  };
}

/**
 * 次のグループがあるかチェック
 * @returns {boolean} 次のグループが存在するか
 */
function hasNextGroup() {
  const taskGroups = window.globalState.taskGroups || [];
  const currentIndex = window.globalState.currentGroupIndex || 0;

  return (currentIndex + 1) < taskGroups.length;
}

/**
 * 現在のグループ情報を取得
 * @returns {Object|null} 現在のグループ情報
 */
function getCurrentGroup() {
  const taskGroups = window.globalState.taskGroups || [];
  const currentIndex = window.globalState.currentGroupIndex || 0;

  return taskGroups[currentIndex] || null;
}

/**
 * 次のグループに移行
 */
function moveToNextGroup() {
  window.globalState.currentGroupIndex = (window.globalState.currentGroupIndex || 0) + 1;
  window.globalState.stats.completed = window.globalState.currentGroupIndex;

  console.log(`[step6] 次のグループに移行: ${window.globalState.currentGroupIndex + 1}/${window.globalState.taskGroups.length}`);
}

/**
 * Wake Lockを解除
 */
async function releaseWakeLock() {
  try {
    if (window.globalState.wakeLock) {
      await window.globalState.wakeLock.release();
      window.globalState.wakeLock = null;
      console.log('[step6] Wake Lock解除完了');
    }
  } catch (error) {
    console.warn('[step6] Wake Lock解除エラー:', error);
  }
}

/**
 * 終了処理
 */
async function performShutdown() {
  console.log('[step6] 全タスク完了 - 終了処理開始');

  await releaseWakeLock();

  const stats = window.globalState.stats;
  console.log('[step6] 処理完了:', {
    完了グループ数: stats.completed,
    総グループ数: stats.total,
    完了率: stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) + '%' : '0%'
  });

  return { success: true, message: '全タスクが完了しました' };
}

/**
 * メイン処理（ステップ6）
 */
async function executeStep6() {
  console.log('========================================');
  console.log('[Step 6] 次のタスクグループへ移行');
  console.log('========================================');

  try {
    // 統計を更新
    window.globalState.stats.total = (window.globalState.taskGroups || []).length;

    // 次のグループがあるかチェック
    if (hasNextGroup()) {
      moveToNextGroup();
      console.log('[step6] 次のグループが存在 → 処理継続');
      return {
        success: true,
        action: 'continue',
        nextGroup: getCurrentGroup()
      };
    } else {
      console.log('[step6] 全グループ完了 → 終了処理');
      const result = await performShutdown();
      return {
        success: true,
        action: 'finished',
        ...result
      };
    }

  } catch (error) {
    console.error('[step6] エラー:', error);
    return {
      success: false,
      error: error.message,
      action: 'error'
    };
  }
}

// Node.js環境用のエクスポート
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    executeStep6,
    hasNextGroup,
    getCurrentGroup,
    moveToNextGroup,
    performShutdown
  };
}

// ブラウザ環境用のグローバル関数登録
if (typeof window !== 'undefined') {
  window.executeStep6 = executeStep6;
  window.hasNextGroup = hasNextGroup;
  window.getCurrentGroup = getCurrentGroup;
  window.moveToNextGroup = moveToNextGroup;
  window.performShutdown = performShutdown;
}

console.log('[step6-nextgroup.js] ✅ Step6関数定義完了（簡素化版）');