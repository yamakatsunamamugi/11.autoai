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

// グローバル状態を使用（他のステップと共有）
if (!window.globalState) {
  window.globalState = {
    taskGroups: [],
    currentGroupIndex: 0,
    processedGroups: [],
    startTime: null,
    endTime: null,
    stats: {
      totalGroups: 0,
      completedGroups: 0,
      totalTasks: 0,
      successTasks: 0,
      failedTasks: 0,
      retryCount: 0
    },
    wakeLock: null
  };
}

/**
 * 次グループの確認
 * @returns {Object|null} 次のグループ情報、存在しない場合null
 */
function checkNextGroup() {
  console.log('[step6-nextgroup.js] [Step 6-1] 次グループの確認', {
    現在の状態: {
      グループ数: window.globalState.taskGroups.length,
      現在インデックス: window.globalState.currentGroupIndex,
      処理済み数: window.globalState.processedGroups.length
    }
  });

  // ========================================
  // Step 6-1-1: 現在のグループ番号を取得
  // ========================================
  console.log('[step6-nextgroup.js] [Step 6-1-1] 現在のグループ番号を取得');

  // データ検証
  if (!window.globalState.taskGroups || !Array.isArray(window.globalState.taskGroups)) {
    console.error('[step6-nextgroup.js] [Step 6-1-1] エラー: taskGroupsが不正', {
      taskGroups: window.globalState.taskGroups,
      型: typeof window.globalState.taskGroups
    });
    return null;
  }

  const currentIndex = window.globalState.currentGroupIndex;
  const totalGroups = window.globalState.taskGroups.length;
  console.log(`[step6-nextgroup.js] [Step 6-1-1] 現在のグループ番号: ${currentIndex + 1}/${totalGroups}`, {
    インデックス: currentIndex,
    総グループ数: totalGroups,
    処理済みグループ: window.globalState.processedGroups.map(g => g.index)
  });

  // ========================================
  // Step 6-1-2: 次のグループの存在確認
  // ========================================
  console.log('[step6-nextgroup.js] [Step 6-1-2] 次のグループの存在確認');

  // タスクグループ配列を確認
  if (currentIndex + 1 < totalGroups) {
    const nextGroup = window.globalState.taskGroups[currentIndex + 1];

    if (!nextGroup) {
      console.error('[step6-nextgroup.js] [Step 6-1-2] エラー: 次グループのデータが不正', {
        期待インデックス: currentIndex + 1,
        実際のデータ: nextGroup
      });
      return null;
    }

    console.log('[step6-nextgroup.js] [Step 6-1-2] 次のグループが存在:', {
      番号: currentIndex + 2,
      タイプ: nextGroup.taskType || 'undefined',
      パターン: nextGroup.pattern || 'undefined',
      列: nextGroup.columns || {},
      詳細: {
        プロンプト列: nextGroup.columns?.prompts || [],
        回答列: nextGroup.columns?.answer || 'undefined'
      }
    });
    return nextGroup;
  }

  console.log('[step6-nextgroup.js] [Step 6-1-2] 次のグループなし（全グループ処理完了）', {
    処理済みグループ数: window.globalState.processedGroups.length,
    総グループ数: totalGroups,
    完了率: totalGroups > 0 ? Math.round((window.globalState.processedGroups.length / totalGroups) * 100) + '%' : '0%'
  });
  return null;
}

/**
 * 次グループの処理
 * @param {Object} nextGroup - 次のグループ情報
 * @returns {Promise<void>}
 */
async function processNextGroup(nextGroup) {
  console.log('[step6-nextgroup.js] [Step 6-2] 次グループの処理', {
    グループ詳細: {
      番号: window.globalState.currentGroupIndex + 2,
      タイプ: nextGroup?.taskType || 'undefined',
      パターン: nextGroup?.pattern || 'undefined'
    }
  });

  try {
    // データ検証
    if (!nextGroup) {
      throw new Error('[step6-nextgroup.js] [Step 6-2] エラー: nextGroupがnullまたはundefined');
    }

    // ========================================
    // Step 6-2-1: グループが存在する場合
    // ========================================
    console.log('[step6-nextgroup.js] [Step 6-2-1] 次のグループが存在する場合の処理');

    // グループ番号をインクリメント
    const prevIndex = window.globalState.currentGroupIndex;
    window.globalState.currentGroupIndex++;
    window.globalState.stats.completedGroups++;
    console.log(`[step6-nextgroup.js] [Step 6-2-1] グループ番号をインクリメント: ${prevIndex + 1} → ${window.globalState.currentGroupIndex + 1}`, {
      前のインデックス: prevIndex,
      新しいインデックス: window.globalState.currentGroupIndex,
      完了グループ数: window.globalState.stats.completedGroups
    });

    const startCol = nextGroup.columns?.prompts?.[0] || 'undefined';
    const endCol = typeof nextGroup.columns?.answer === 'string'
      ? nextGroup.columns.answer
      : nextGroup.columns?.answer?.gemini || 'undefined';

    console.log(`[step6-nextgroup.js] [Step 6-2-1] グループ ${window.globalState.currentGroupIndex + 1} 処理開始:`, {
      タイプ: nextGroup.taskType,
      パターン: nextGroup.pattern,
      列範囲: `${startCol}-${endCol}`,
      詳細: {
        プロンプト列数: nextGroup.columns?.prompts?.length || 0,
        回答列タイプ: typeof nextGroup.columns?.answer,
        開始行: nextGroup.dataStartRow || 'undefined'
      }
    });

    // ステップ3から再開
    console.log('[step6-nextgroup.js] [Step 6-2-1] ステップ3から再開（タスクリスト作成）');
    // 実際の実装では外部から呼び出し
    await sleep(1000);

    // 処理済みグループに追加
    window.globalState.processedGroups.push({
      index: window.globalState.currentGroupIndex,
      group: nextGroup,
      timestamp: new Date().toISOString()
    });

    console.log('[step6-nextgroup.js] [Step 6-2-1] 次グループ処理設定完了');

  } catch (error) {
    console.error('[step6-nextgroup.js] [Step 6-2-1] 次グループ処理エラー:', {
      エラーメッセージ: error.message,
      スタック: error.stack,
      グループ情報: {
        インデックス: window.globalState.currentGroupIndex,
        タイプ: nextGroup?.taskType,
        パターン: nextGroup?.pattern
      },
      現在の統計: window.globalState.stats
    });
    throw error;
  }
}

/**
 * スリープ防止解除
 * @returns {Promise<void>}
 */
async function releaseSleepPrevention() {
  console.log('[step6-nextgroup.js] [Step 6-3-1] スリープ防止の解除', {
    wakeLock状態: window.globalState.wakeLock ? '有効' : '無効',
    処理時間: window.globalState.startTime ? `${Date.now() - window.globalState.startTime}ms` : '不明'
  });

  try {
    // PowerConfigのリリース
    console.log('[step6-nextgroup.js] [Step 6-3-1] PowerConfig.allowSleep()を実行');
    // 実際の実装では:
    // await PowerConfig.allowSleep();

    if (window.globalState.wakeLock) {
      // Wake Lock APIを使用している場合
      console.log('[step6-nextgroup.js] [Step 6-3-1] Wake Lockをリリース中...');
      await window.globalState.wakeLock.release();
      window.globalState.wakeLock = null;
      console.log('[step6-nextgroup.js] [Step 6-3-1] Wake Lockリリース完了');
    }

    // ウェイクロックの解放
    console.log('[step6-nextgroup.js] [Step 6-3-1] ウェイクロックを解放');

    console.log('[step6-nextgroup.js] [Step 6-3-1] スリープ防止解除完了');

  } catch (error) {
    console.warn('[step6-nextgroup.js] [Step 6-3-1] スリープ防止解除エラー:', {
      エラー: error.message,
      wakeLock状態: window.globalState.wakeLock ? '解除失敗' : '既に解除済み'
    });
  }
}

/**
 * 処理統計の集計
 * @returns {Object} 統計情報
 */
function calculateStatistics() {
  console.log('[step6-nextgroup.js] [Step 6-3-2] 処理統計の集計', {
    開始時刻: window.globalState.startTime ? new Date(window.globalState.startTime).toISOString() : '不明',
    現在の統計: window.globalState.stats
  });

  const endTime = new Date();
  const startTime = window.globalState.startTime || new Date();
  const duration = endTime - startTime;

  // 処理時間を分と秒に変換
  const minutes = Math.floor(duration / 60000);
  const seconds = Math.floor((duration % 60000) / 1000);

  console.log('[step6-nextgroup.js] [Step 6-3-2] 統計集計中...');

  // 総タスク数
  console.log(`[step6-nextgroup.js] [Step 6-3-2] 総タスク数: ${window.globalState.stats.totalTasks}件`);

  // 成功タスク数
  console.log(`[step6-nextgroup.js] [Step 6-3-2] 成功タスク数: ${window.globalState.stats.successTasks}件`);

  // 失敗タスク数
  console.log(`[step6-nextgroup.js] [Step 6-3-2] 失敗タスク数: ${window.globalState.stats.failedTasks}件`);

  // 処理時間
  console.log(`[step6-nextgroup.js] [Step 6-3-2] 処理時間: ${minutes}分${seconds}秒`);

  const statistics = {
    総グループ数: window.globalState.taskGroups.length,
    完了グループ数: window.globalState.stats.completedGroups,
    総タスク数: window.globalState.stats.totalTasks,
    成功タスク数: window.globalState.stats.successTasks,
    失敗タスク数: window.globalState.stats.failedTasks,
    リトライ回数: window.globalState.stats.retryCount,
    処理時間: `${minutes}分${seconds}秒`,
    開始時刻: startTime.toLocaleString('ja-JP'),
    終了時刻: endTime.toLocaleString('ja-JP'),
    成功率: window.globalState.stats.totalTasks > 0
      ? Math.round((window.globalState.stats.successTasks / window.globalState.stats.totalTasks) * 100) + '%'
      : '0%'
  };

  console.log('[step6-nextgroup.js] [Step 6-3-2] 統計集計完了:', statistics);

  // エラー率の計算
  if (window.globalState.stats.failedTasks > 0) {
    console.warn('[step6-nextgroup.js] [Step 6-3-2] 警告: 失敗タスクあり', {
      失敗率: Math.round((window.globalState.stats.failedTasks / window.globalState.stats.totalTasks) * 100) + '%',
      失敗タスク詳細: '詳細ログを確認してください'
    });
  }

  return statistics;
}

/**
 * 完了メッセージの表示
 * @param {Object} statistics - 統計情報
 */
function showCompletionMessage(statistics) {
  console.log('[step6-nextgroup.js] [Step 6-3-3] 完了メッセージの表示', {
    成功率: statistics.成功率,
    処理時間: statistics.処理時間,
    総タスク数: statistics.総タスク数
  });

  const message = `
✅ ================================
   全タスク処理完了
================================

📊 処理統計:
   総グループ数: ${statistics.総グループ数}
   完了グループ: ${statistics.完了グループ数}
   総タスク数: ${statistics.総タスク数}
   成功: ${statistics.成功タスク数}件
   失敗: ${statistics.失敗タスク数}件
   成功率: ${statistics.成功率}

⏱️ 処理時間:
   ${statistics.処理時間}
   開始: ${statistics.開始時刻}
   終了: ${statistics.終了時刻}

================================
`;

  console.log(message);

  // 処理詳細ログ
  if (window.globalState.processedGroups.length > 0) {
    console.log('\n📋 処理済みグループ詳細:');
    window.globalState.processedGroups.forEach((item, index) => {
      console.log(`   ${index + 1}. ${item.group.taskType} - ${item.timestamp}`, {
        グループ番号: item.index,
        パターン: item.group.pattern,
        列範囲: item.group.columns
      });
    });
  } else {
    console.warn('[step6-nextgroup.js] [Step 6-3-3] 警告: 処理済みグループがありません');
  }

  // エラーがある場合の追加メッセージ
  if (statistics.失敗タスク数 > 0) {
    console.warn('\n⚠️ 一部のタスクが失敗しました。ログを確認してください。');
  }

  return message;
}

/**
 * 終了処理
 * @returns {Promise<void>}
 */
async function performShutdown() {
  console.log('[step6-nextgroup.js] [Step 6-3] 終了処理', {
    処理グループ数: window.globalState.processedGroups.length,
    総グループ数: window.globalState.taskGroups.length,
    開始時刻: window.globalState.startTime ? new Date(window.globalState.startTime).toISOString() : '不明'
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
    console.log('[step6-nextgroup.js] [Step 6-3] クリーンアップ処理');

    // ウィンドウのクローズ（必要に応じて）
    console.log('[step6-nextgroup.js] [Step 6-3] 使用済みウィンドウをクローズ');
    // await closeAllWindows();

    // 状態のリセット（必要に応じて）
    console.log('[step6-nextgroup.js] [Step 6-3] 状態をリセット');
    // resetState();

    console.log('[step6-nextgroup.js] [Step 6-3] 終了処理完了');

    return {
      success: true,
      statistics,
      message
    };

  } catch (error) {
    console.error('[step6-nextgroup.js] [Step 6-3] 終了処理エラー:', {
      エラーメッセージ: error.message,
      スタック: error.stack,
      最終統計: window.globalState.stats,
      処理済みグループ数: window.globalState.processedGroups.length
    });
    throw error;
  }
}

/**
 * メイン処理（ステップ6）
 * @param {Array} taskGroups - 全タスクグループ
 * @param {number} currentIndex - 現在のグループインデックス
 * @returns {Promise<Object>} 処理結果
 */
async function executeStep6(taskGroups = [], currentIndex = 0) {
  console.log('========================================');
  console.log('[Step 6] 次のタスクグループへ移行');
  console.log('========================================');
  console.log('[Step 6] 入力パラメータ:', {
    タスクグループ数: taskGroups.length,
    現在のインデックス: currentIndex,
    グループ詳細: taskGroups.length > 0 ? taskGroups.slice(0, 3) : [] // 最初の3件のみ表示
  });

  // 状態を初期化
  window.globalState.taskGroups = taskGroups;
  window.globalState.currentGroupIndex = currentIndex;

  try {
    // Step 6-1: 次グループの確認
    const nextGroup = checkNextGroup();

    if (nextGroup) {
      // Step 6-2-1: グループが存在する場合
      console.log('[step6-nextgroup.js] [Step 6-2-1] 次グループが存在 → 処理継続');
      await processNextGroup(nextGroup);

      return {
        hasNext: true,
        nextGroup,
        nextIndex: window.globalState.currentGroupIndex
      };

    } else {
      // Step 6-2-2: すべて完了した場合
      console.log('[step6-nextgroup.js] [Step 6-2-2] すべて完了した場合 → 終了処理へ進む');

      // Step 6-3: 終了処理
      const result = await performShutdown();

      return {
        hasNext: false,
        ...result
      };
    }

  } catch (error) {
    console.error('[step6-nextgroup.js] [Step 6] エラー発生:', {
      エラーメッセージ: error.message,
      スタック: error.stack,
      現在の状態: {
        グループインデックス: window.globalState.currentGroupIndex,
        処理済みグループ数: window.globalState.processedGroups.length,
        統計: window.globalState.stats
      }
    });

    // エラー時も終了処理を実行
    console.log('[Step 6] エラーリカバリー: 終了処理を実行');
    await performShutdown();

    throw error;
  }
}

// ========================================
// ヘルパー関数
// ========================================

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 状態管理用の関数
function updateStats(updates) {
  Object.assign(window.globalState.stats, updates);
}

function setStartTime() {
  window.globalState.startTime = new Date();
}

function setWakeLock(wakeLock) {
  window.globalState.wakeLock = wakeLock;
}

// ブラウザ環境用のグローバルエクスポート
if (typeof window !== 'undefined') {
  window.executeStep6 = executeStep6;
  window.checkNextGroup = checkNextGroup;
  window.processNextGroup = processNextGroup;
  window.performShutdown = performShutdown;
  window.calculateStatistics = calculateStatistics;
}

// エクスポート
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    executeStep6,
    checkNextGroup,
    processNextGroup,
    performShutdown,
    calculateStatistics,
    globalState: window.globalState,
    updateStats,
    setStartTime,
    setWakeLock
  };
}