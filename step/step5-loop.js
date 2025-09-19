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

// グローバル状態を使用（他のステップと共有）
if (!window.globalState) {
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
      retryCount: 0
    }
  };
}

/**
 * 完了状況の確認
 * @param {Object} taskGroup - タスクグループ情報
 * @returns {Promise<boolean>} 完了の場合true
 */
async function checkCompletionStatus(taskGroup) {
  console.log('[step5-loop.js] [Step 5-1] 完了状況の確認開始', {
    groupNumber: taskGroup.groupNumber || 'undefined',
    taskType: taskGroup.taskType || 'undefined',
    pattern: taskGroup.pattern || 'undefined',
    columns: taskGroup.columns || {}
  });

  try {
    // ========================================
    // Step 5-1-1: プロンプト列の確認
    // ========================================
    console.log('[step5-loop.js] [Step 5-1-1] プロンプト列を確認中...');

    // 必須データの検証
    if (!taskGroup.columns || !taskGroup.columns.prompts) {
      throw new Error('[step5-loop.js] [Step 5-1-1] エラー: columns.promptsが定義されていません');
    }
    if (!taskGroup.dataStartRow) {
      console.warn('[step5-loop.js] [Step 5-1-1] 警告: dataStartRowが未定義。デフォルト値7を使用');
      taskGroup.dataStartRow = 7;
    }

    const promptRange = `${taskGroup.columns.prompts[0]}${taskGroup.dataStartRow}:${taskGroup.columns.prompts[taskGroup.columns.prompts.length - 1]}1000`;
    console.log(`[step5-loop.js] [Step 5-1-1] 取得範囲: ${promptRange}`, {
      開始列: taskGroup.columns.prompts[0],
      終了列: taskGroup.columns.prompts[taskGroup.columns.prompts.length - 1],
      開始行: taskGroup.dataStartRow,
      列数: taskGroup.columns.prompts.length
    });

    let promptValues;
    try {
      promptValues = await readSpreadsheet(promptRange);
    } catch (error) {
      console.error('[step5-loop.js] [Step 5-1-1] スプレッドシート読み込みエラー:', {
        範囲: promptRange,
        エラー: error.message
      });
      throw error;
    }

    // 値があるプロンプトセルをカウント
    let promptCount = 0;
    let promptDetails = [];
    if (promptValues && promptValues.values) {
      for (let rowIndex = 0; rowIndex < promptValues.values.length; rowIndex++) {
        const row = promptValues.values[rowIndex];
        for (let colIndex = 0; colIndex < row.length; colIndex++) {
          const cell = row[colIndex];
          if (cell && cell.trim()) {
            promptCount++;
            promptDetails.push({
              行: taskGroup.dataStartRow + rowIndex,
              列: taskGroup.columns.prompts[colIndex],
              内容プレビュー: cell.substring(0, 30) + (cell.length > 30 ? '...' : '')
            });
          }
        }
      }
    } else {
      console.warn('[step5-loop.js] [Step 5-1-1] 警告: プロンプトデータが空です', {
        promptValues: promptValues,
        範囲: promptRange
      });
    }
    console.log(`[step5-loop.js] [Step 5-1-1] プロンプト数: ${promptCount}件`, {
      詳細: promptDetails.slice(0, 3), // 最初の3件のみ表示
      全件数: promptDetails.length
    });

    // ========================================
    // Step 5-1-2: 回答列の確認
    // ========================================
    console.log('[step5-loop.js] [Step 5-1-2] 回答列を確認中...');

    let answerRange;
    let answerCount = 0;

    if (taskGroup.pattern === '3種類AI') {
      // 3種類AIパターンの場合
      console.log('[step5-loop.js] [Step 5-1-2] 3種類AIパターンの回答を確認');

      if (!taskGroup.columns.answer || typeof taskGroup.columns.answer !== 'object') {
        throw new Error('[step5-loop.js] [Step 5-1-2] エラー: 3種類AIパターンだがanswer列の構造が不正');
      }

      const columns = [
        taskGroup.columns.answer.chatgpt,
        taskGroup.columns.answer.claude,
        taskGroup.columns.answer.gemini
      ];

      console.log('[step5-loop.js] [Step 5-1-2] AI回答列:', {
        ChatGPT列: columns[0] || 'undefined',
        Claude列: columns[1] || 'undefined',
        Gemini列: columns[2] || 'undefined'
      });

      for (const col of columns) {
        if (!col) {
          console.warn('[step5-loop.js] [Step 5-1-2] 警告: 列が未定義のためスキップ');
          continue;
        }

        const range = `${col}${taskGroup.dataStartRow}:${col}1000`;
        console.log(`[step5-loop.js] [Step 5-1-2] ${col}列を確認: ${range}`);

        let values;
        try {
          values = await readSpreadsheet(range);
        } catch (error) {
          console.error(`[step5-loop.js] [Step 5-1-2] ${col}列読み込みエラー:`, {
            範囲: range,
            エラー: error.message
          });
          continue; // エラーでも処理を継続
        }

        if (values && values.values) {
          for (const row of values.values) {
            if (row[0] && row[0].trim()) {
              answerCount++;
            }
          }
        }
      }

      // 3種類AIの場合、プロンプト数×3と比較
      promptCount = promptCount * 3;
      console.log(`[step5-loop.js] [Step 5-1-2] 3種類AI調整後 - 期待回答数: ${promptCount}`);

    } else if (typeof taskGroup.columns.answer === 'string') {
      // 通常パターンの場合
      console.log('[step5-loop.js] [Step 5-1-2] 通常パターンの回答を確認');
      answerRange = `${taskGroup.columns.answer}${taskGroup.dataStartRow}:${taskGroup.columns.answer}1000`;
      console.log(`[step5-loop.js] [Step 5-1-2] 取得範囲: ${answerRange}`);

      const answerValues = await readSpreadsheet(answerRange);

      if (answerValues && answerValues.values) {
        for (const row of answerValues.values) {
          if (row[0] && row[0].trim()) {
            answerCount++;
          }
        }
      }
    }

    console.log(`[step5-loop.js] [Step 5-1-2] 回答数: ${answerCount}件`);

    // 統計情報更新
    window.globalState.stats.totalPrompts = promptCount;
    window.globalState.stats.completedAnswers = answerCount;
    window.globalState.stats.pendingTasks = promptCount - answerCount;

    // ========================================
    // Step 5-1-3: 完了判定
    // ========================================
    console.log('[step5-loop.js] [Step 5-1-3] 完了判定を実行');

    const isComplete = promptCount === answerCount;

    console.log('[step5-loop.js] [Step 5-1-3] 完了状況:', {
      プロンプト数: promptCount,
      回答数: answerCount,
      未完了: window.globalState.stats.pendingTasks,
      完了判定: isComplete ? '完了' : '未完了',
      完了率: promptCount > 0 ? Math.round((answerCount / promptCount) * 100) + '%' : '0%',
      グループ番号: taskGroup.groupNumber,
      タスクタイプ: taskGroup.taskType
    });

    if (!isComplete && promptCount > 0) {
      console.log('[step5-loop.js] [Step 5-1-3] 未完了詳細:', {
        残りタスク数: promptCount - answerCount,
        推定処理時間: `約${(promptCount - answerCount) * 30}秒`
      });
    }

    // 完了判定
    return isComplete;

  } catch (error) {
    console.error('[step5-loop.js] [Step 5-1] 完了状況確認エラー:', {
      エラーメッセージ: error.message,
      スタック: error.stack,
      タスクグループ: {
        番号: taskGroup.groupNumber,
        タイプ: taskGroup.taskType,
        パターン: taskGroup.pattern
      },
      現在の統計: window.globalState.stats
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
  console.log('[Step 5-2] 未完了タスクの処理開始', {
    グループ番号: taskGroup.groupNumber,
    タスクタイプ: taskGroup.taskType,
    現在の統計: window.globalState.stats
  });

  let isComplete = false;
  let iteration = 0;
  const maxIterations = 100; // 無限ループ防止

  // ========================================
  // Step 5-2-3: 繰り返し（完了まで5-2-1から繰り返し）
  // ========================================
  do {
    iteration++;
    console.log(`[step5-loop.js] [Step 5-2-3] 繰り返し処理 ${iteration}回目`, {
      最大回数: maxIterations,
      現在の進捗: `${iteration}/${maxIterations}`
    });

    if (iteration > maxIterations) {
      console.error('[step5-loop.js] [Step 5-2-3] 最大繰り返し回数超過 - 処理を中止', {
        実行回数: iteration,
        最大回数: maxIterations,
        グループ番号: taskGroup.groupNumber,
        残りタスク: window.globalState.stats.pendingTasks
      });
      break;
    }

    // ========================================
    // Step 5-2-1: ステップ3へ戻る（次の3タスクを生成）
    // ========================================
    console.log('[step5-loop.js] [Step 5-2-1] ステップ3へ戻る - タスクリスト作成');
    let tasks;
    try {
      tasks = await createTaskList(taskGroup);
    } catch (error) {
      console.error('[step5-loop.js] [Step 5-2-1] タスクリスト作成エラー:', {
        エラー: error.message,
        グループ番号: taskGroup.groupNumber,
        繰り返し回数: iteration
      });
      break;
    }

    if (!tasks || tasks.length === 0) {
      console.log('[step5-loop.js] [Step 5-2-1] 処理可能なタスクなし', {
        理由: 'すべてのタスクが完了済みまたは処理対象外',
        グループ番号: taskGroup.groupNumber
      });
      break;
    }
    console.log(`[step5-loop.js] [Step 5-2-1] ${tasks.length}個のタスクを生成`, {
      タスク詳細: tasks.slice(0, 3) // 最初の3件のみ表示
    });

    // ========================================
    // Step 5-2-2: ステップ4を実行（タスクを処理）
    // ========================================
    console.log('[step5-loop.js] [Step 5-2-2] ステップ4を実行 - タスク実行', {
      タスク数: tasks.length,
      グループ番号: taskGroup.groupNumber
    });

    try {
      await executeTasks(tasks, taskGroup);
      console.log('[step5-loop.js] [Step 5-2-2] タスク実行完了', {
        成功: true,
        処理タスク数: tasks.length
      });
    } catch (error) {
      console.error('[step5-loop.js] [Step 5-2-2] タスク実行エラー:', {
        エラー: error.message,
        タスク数: tasks.length,
        繰り返し回数: iteration
      });
      // エラーでも処理を継続
    }

    // 処理後の待機
    await sleep(2000);

    // 完了確認（Step 5-1を再実行）
    console.log('[step5-loop.js] [Step 5-2-3] 完了確認のためStep 5-1を再実行');
    isComplete = await checkCompletionStatus(taskGroup);

    if (!isComplete) {
      console.log(`[step5-loop.js] [Step 5-2-3] 未完了タスク残り: ${window.globalState.stats.pendingTasks}件 - 繰り返し継続`, {
        完了率: window.globalState.stats.totalPrompts > 0 ?
          Math.round((window.globalState.stats.completedAnswers / window.globalState.stats.totalPrompts) * 100) + '%' : '0%',
        次の繰り返し: iteration + 1,
        推定残り時間: `約${window.globalState.stats.pendingTasks * 30}秒`
      });
    }

  } while (!isComplete);

  if (isComplete) {
    console.log('[step5-loop.js] [Step 5-2-3] タスクグループ完了 - 繰り返し終了', {
      総繰り返し回数: iteration,
      処理時間: '計測中',
      最終統計: window.globalState.stats
    });
  } else {
    console.warn('[step5-loop.js] [Step 5-2-3] タスクグループ未完了で終了', {
      理由: iteration > maxIterations ? '最大繰り返し回数超過' : '処理可能タスクなし',
      残りタスク: window.globalState.stats.pendingTasks
    });
  }
}

/**
 * メイン処理（ステップ5）
 * @param {Object} taskGroup - タスクグループ情報
 * @returns {Promise<boolean>} 完了の場合true
 */
async function executeStep5(taskGroup) {
  console.log('========================================');
  console.log('[step5-loop.js] [Step 5] タスクグループ内の繰り返し処理開始');
  console.log('========================================');
  console.log('[step5-loop.js] [Step 5] 入力パラメータ:', {
    グループ番号: taskGroup?.groupNumber || 'undefined',
    タスクタイプ: taskGroup?.taskType || 'undefined',
    パターン: taskGroup?.pattern || 'undefined'
  });

  try {
    // グループ情報を状態に保存
    window.globalState.currentGroup = taskGroup;

    // 5-1: 完了状況確認
    const isComplete = await checkCompletionStatus(taskGroup);

    if (isComplete) {
      console.log('[step5-loop.js] [Step 5] タスクグループは既に完了');
      return true;
    }

    // 5-2: 未完了時の処理
    await processIncompleteTasks(taskGroup);

    // 最終的な完了確認
    const finalComplete = await checkCompletionStatus(taskGroup);

    console.log('[step5-loop.js] [Step 5] 処理完了:', {
      完了状態: finalComplete,
      処理統計: window.globalState.stats
    });

    return finalComplete;

  } catch (error) {
    console.error('[Step 5] エラー発生:', {
      エラーメッセージ: error.message,
      スタック: error.stack,
      グループ情報: {
        番号: window.globalState.currentGroup?.groupNumber,
        タイプ: window.globalState.currentGroup?.taskType
      },
      最終統計: window.globalState.stats
    });
    throw error;
  }
}

// ========================================
// ヘルパー関数（他のstepファイルと共通化予定）
// ========================================

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function readSpreadsheet(range) {
  // 実際の実装ではGoogle Sheets APIを呼び出す
  // ここではダミー実装
  console.log(`[Helper] スプレッドシート読み込み: ${range}`);
  return { values: [] };
}

async function createTaskList(taskGroup) {
  // Step 3の機能をここに実装
  // 実際にはstep3-tasklist.jsから呼び出す
  console.log('[Helper] タスクリスト作成');
  return [];
}

async function executeTasks(tasks, taskGroup) {
  // Step 4の機能をここに実装
  // 実際にはstep4-execute.jsから呼び出す
  console.log('[Helper] タスク実行:', tasks.length + '件');
}

// ブラウザ環境用のグローバルエクスポート
if (typeof window !== 'undefined') {
  window.executeStep5 = executeStep5;
  window.checkCompletionStatus = checkCompletionStatus;
  window.processIncompleteTasks = processIncompleteTasks;
}

// エクスポート
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    executeStep5,
    checkCompletionStatus,
    processIncompleteTasks,
    globalState: window.globalState
  };
}