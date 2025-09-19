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
      console.log(`[step5-loop.js] [Step 5-1-1] プロンプトデータ取得成功: ${promptValues.values.length}行`);
      for (let rowIndex = 0; rowIndex < promptValues.values.length; rowIndex++) {
        const row = promptValues.values[rowIndex];
        if (!row) continue;

        for (let colIndex = 0; colIndex < row.length && colIndex < taskGroup.columns.prompts.length; colIndex++) {
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
      console.error('[step5-loop.js] [Step 5-1-1] ❌ プロンプトデータが取得できませんでした', {
        promptValues: promptValues,
        範囲: promptRange,
        タスクグループ: {
          番号: taskGroup.groupNumber,
          prompts列: taskGroup.columns.prompts
        }
      });
    }
    console.log(`[step5-loop.js] [Step 5-1-1] プロンプト数: ${promptCount}件`, {
      詳細: promptDetails.slice(0, 3), // 最初の3件のみ表示
      全件数: promptDetails.length,
      検索範囲: promptRange,
      prompts列設定: taskGroup.columns.prompts
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
  console.log(`[Helper] スプレッドシート読み込み: ${range}`);

  try {
    // グローバル状態から認証情報とスプレッドシートIDを取得
    if (!window.globalState || !window.globalState.authToken) {
      throw new Error('認証情報が見つかりません');
    }

    if (!window.globalState.spreadsheetId) {
      throw new Error('スプレッドシートIDが見つかりません');
    }

    const spreadsheetId = window.globalState.spreadsheetId;
    const accessToken = window.globalState.authToken;

    // Google Sheets API呼び出し（既存のapiHeadersを活用）
    const apiUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`;
    const headers = window.globalState.apiHeaders || {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    };

    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: headers
    });

    if (!response.ok) {
      throw new Error(`API応答エラー: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    console.log(`[Helper] 読み込み成功: ${data.values ? data.values.length : 0}行取得`);

    return data;
  } catch (error) {
    console.error('[Helper] スプレッドシート読み込みエラー:', error);
    throw error;
  }
}

/**
 * スプレッドシート全体のデータを取得（Step3が期待する2次元配列形式）
 * @returns {Promise<Array>} スプレッドシートの2次元配列データ
 */
async function readFullSpreadsheet() {
  console.log('[Helper] スプレッドシート全体データ取得開始');

  try {
    if (!window.globalState || !window.globalState.spreadsheetId) {
      throw new Error('スプレッドシートIDが見つかりません');
    }

    // 全体範囲を取得（A1:ZZ1000の範囲で十分なデータを取得）
    const fullRange = 'A1:ZZ1000';
    const data = await readSpreadsheet(fullRange);

    if (!data || !data.values) {
      console.warn('[Helper] スプレッドシートデータが空です');
      return [];
    }

    console.log(`[Helper] スプレッドシート全体データ取得完了: ${data.values.length}行`);
    console.log('[Helper] データサンプル（最初の3行）:', data.values.slice(0, 3));

    return data.values;

  } catch (error) {
    console.error('[Helper] スプレッドシート全体データ取得エラー:', error);
    throw error;
  }
}

async function createTaskList(taskGroup) {
  console.log('[Helper] タスクリスト作成開始:', {
    グループ番号: taskGroup?.groupNumber,
    タスクタイプ: taskGroup?.taskType,
    パターン: taskGroup?.pattern,
    列情報: taskGroup?.columns
  });

  try {
    // step3-tasklist.jsのgenerateTaskList関数を利用
    if (!window.Step3TaskList || !window.Step3TaskList.generateTaskList) {
      throw new Error('Step3TaskList.generateTaskListが利用できません');
    }

    // 重要：Step3が期待する実際のスプレッドシートデータ（2次元配列）を取得
    console.log('[Helper] スプレッドシート全体データを取得中...');
    const spreadsheetData = await readFullSpreadsheet();

    if (!spreadsheetData || spreadsheetData.length === 0) {
      console.warn('[Helper] スプレッドシートデータが空のため、タスク生成をスキップ');
      return [];
    }

    const specialRows = {
      menuRow: window.globalState.setupResult?.menuRow || 3,
      aiRow: window.globalState.setupResult?.aiRow || 5,
      modelRow: window.globalState.setupResult?.modelRow || 6,
      functionRow: window.globalState.setupResult?.functionRow || 7
    };

    const dataStartRow = window.globalState.setupResult?.dataStartRow || 9;

    const options = {
      batchSize: 3,
      forceReprocess: false,
      spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${window.globalState.spreadsheetId}/edit#gid=${window.globalState.gid}`
    };

    // Step 5-3-前処理: 制御情報の取得と適用
    console.log('[createTaskList] [Step 5-3-前処理] 行制御・列制御情報を取得中...');

    let rowControls = [];
    let columnControls = [];

    try {
      // Step 5-3-1: 行制御をチェック
      rowControls = window.Step3TaskList.getRowControl(spreadsheetData);
      console.log('[createTaskList] [Step 5-3-1] 行制御情報取得完了:', {
        制御数: rowControls.length,
        詳細: rowControls.map(c => `${c.type}制御: ${c.row}行目`)
      });

      // Step 5-3-2: 列制御の再チェック（タスクグループ作成後の追加フィルタ）
      const columnControlRow = window.globalState.setupResult?.columnControlRow || 4;
      columnControls = window.Step3TaskList.getColumnControl(spreadsheetData, columnControlRow);
      console.log('[createTaskList] [Step 5-3-2] 列制御情報取得完了:', {
        制御数: columnControls.length,
        制御行: columnControlRow,
        詳細: columnControls.map(c => `${c.type}制御: ${c.column}列`)
      });

    } catch (error) {
      console.error('[createTaskList] [Step 5-3-前処理] 制御情報取得エラー:', {
        エラーメッセージ: error.message,
        スタック: error.stack
      });
      // エラーが発生しても処理を継続
    }

    // Step 5-3-3: 列制御チェック（タスクグループレベルでの追加フィルタリング）
    if (columnControls.length > 0) {
      console.log('[createTaskList] [Step 5-3-3] 列制御チェック実行中...');

      if (!window.Step3TaskList.shouldProcessColumn(taskGroup, columnControls)) {
        console.log('[createTaskList] [Step 5-3-3] タスクグループ除外:', {
          グループ番号: taskGroup.groupNumber,
          理由: '列制御により除外（この列から処理/この列の処理後に停止/この列のみ処理）',
          グループ列: taskGroup?.columns?.prompts,
          列制御: columnControls.map(c => `${c.type}:${c.column}`)
        });
        return [];  // このタスクグループは処理しない
      } else {
        console.log('[createTaskList] [Step 5-3-3] タスクグループ通過:', {
          グループ番号: taskGroup.groupNumber,
          理由: '列制御を通過'
        });
      }
    } else {
      console.log('[createTaskList] [Step 5-3-前処理] 列制御なし - 全てのタスクグループを処理');
    }

    // 拡張オプションに制御情報を追加
    const extendedOptions = {
      ...options,
      rowControls: rowControls,
      columnControls: columnControls,
      applyRowControl: true,
      applyColumnControl: true
    };

    console.log('[Helper] [Step 5-3] Step3に渡すパラメータ:', {
      'taskGroup.columns': taskGroup?.columns,
      'spreadsheetData.length': spreadsheetData.length,
      'specialRows': specialRows,
      'dataStartRow': dataStartRow,
      '行制御数': rowControls.length,
      '列制御数': columnControls.length,
      'options': Object.keys(extendedOptions)
    });

    // タスクリスト生成を実行（制御情報付き）
    const tasks = window.Step3TaskList.generateTaskList(
      taskGroup,
      spreadsheetData,  // 修正：実際の2次元配列データを渡す
      specialRows,
      dataStartRow,
      extendedOptions  // 制御情報を含む拡張オプション
    );

    console.log(`[Helper] タスクリスト作成完了: ${tasks.length}件のタスク`);
    if (tasks.length > 0) {
      console.log('[Helper] 生成されたタスクサンプル:', tasks.slice(0, 2));
    } else {
      console.warn('[Helper] ⚠️ 0件のタスクが生成されました。以下を確認してください:');
      console.warn('  - taskGroup.columns.prompts:', taskGroup?.columns?.prompts);
      console.warn('  - プロンプトデータの存在確認が必要');
    }

    return tasks;

  } catch (error) {
    console.error('[Helper] タスクリスト作成エラー:', {
      エラーメッセージ: error.message,
      スタック: error.stack,
      taskGroup: taskGroup,
      'window.Step3TaskList': !!window.Step3TaskList
    });
    throw error;
  }
}

async function executeTasks(tasks, taskGroup) {
  console.log(`[Helper] タスク実行開始: ${tasks.length}件`, {
    グループ番号: taskGroup?.groupNumber,
    タスクタイプ: taskGroup?.taskType,
    パターン: taskGroup?.pattern
  });

  try {
    // step4-execute.jsのexecuteStep4関数を利用
    if (!window.executeStep4) {
      throw new Error('executeStep4関数が利用できません');
    }

    if (!tasks || tasks.length === 0) {
      console.warn('[Helper] 実行するタスクがありません');
      return [];
    }

    // タスクリストを適切な形式に変換（Step4が期待する形式に統一）
    const formattedTasks = tasks.map((task, index) => {
      // Step3で生成されたタスクの情報を使用
      const aiType = task.ai || taskGroup?.aiType || 'Claude';

      const formattedTask = {
        id: task.taskId || task.id || `task-${task.row}-${taskGroup.groupNumber}-${index}`,
        row: task.row,
        aiType: aiType,
        prompt: task.prompt || task.text || '',
        spreadsheetData: {
          id: window.globalState.spreadsheetId,
          gid: window.globalState.gid,
          spreadsheetId: task.spreadsheetId || window.globalState.spreadsheetId,  // Step3からの情報
          answerCell: task.answerCell,  // Step3で計算された回答セル
          logCell: task.logCell        // Step3で計算されたログセル
        },
        columns: taskGroup.columns,
        taskGroup: taskGroup,
        // Step3からの詳細情報を保持
        model: task.model || '',
        function: task.function || '',
        groupNumber: task.groupNumber,
        groupType: task.groupType
      };

      console.log(`[Helper] タスク${index + 1}フォーマット完了:`, {
        taskId: formattedTask.id,
        row: formattedTask.row,
        aiType: formattedTask.aiType,
        プロンプト長: formattedTask.prompt.length,
        answerCell: formattedTask.spreadsheetData.answerCell,
        logCell: formattedTask.spreadsheetData.logCell
      });

      return formattedTask;
    });

    console.log(`[Helper] フォーマット済みタスク: ${formattedTasks.length}件`);
    console.log('[Helper] 最初のタスク詳細:', formattedTasks[0]);

    // Step4バリデーション
    for (const task of formattedTasks) {
      if (!task.aiType) {
        throw new Error(`タスク${task.id}: aiTypeが未定義`);
      }
      if (!task.prompt) {
        throw new Error(`タスク${task.id}: promptが未定義`);
      }
      if (!task.spreadsheetData.answerCell) {
        console.warn(`タスク${task.id}: answerCellが未定義`);
      }
    }

    // Step4を実行
    console.log('[Helper] Step4実行中...');
    const results = await window.executeStep4(formattedTasks);

    console.log(`[Helper] タスク実行完了: ${results?.length || 0}件の結果`);
    return results || [];

  } catch (error) {
    console.error('[Helper] タスク実行エラー:', {
      エラーメッセージ: error.message,
      スタック: error.stack,
      タスク数: tasks?.length,
      グループ情報: {
        番号: taskGroup?.groupNumber,
        タイプ: taskGroup?.taskType
      },
      'window.executeStep4存在': !!window.executeStep4
    });
    throw error;
  }
}

// ブラウザ環境用のグローバルエクスポート
if (typeof window !== 'undefined') {
  window.executeStep5 = executeStep5;
  window.checkCompletionStatus = checkCompletionStatus;
  window.processIncompleteTasks = processIncompleteTasks;
  window.readFullSpreadsheet = readFullSpreadsheet;  // 新しい関数も追加
}

// エクスポート
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    executeStep5,
    checkCompletionStatus,
    processIncompleteTasks,
    readFullSpreadsheet,
    globalState: window.globalState
  };
}