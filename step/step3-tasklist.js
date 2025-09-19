/**
 * @fileoverview ステップ3: タスクリスト生成
 *
 * このファイルは、スプレッドシートからタスクを読み取り、
 * 実行可能なタスクリストを生成する機能を提供します。
 *
 * 【ステップ構成】
 * Step 3-1: スプレッドシートデータ取得（作業開始行～プロンプトがある最終行）
 * Step 3-2: タスク除外処理（回答済みスキップ、拡張可能な構造）
 * Step 3-3: 3タスクずつのバッチ作成、詳細情報構築
 *
 * 【エラーログ追加箇所】
 * - データ取得エラー
 * - カラム変換エラー
 * - タスク生成エラー
 * - バッチ作成エラー
 */

// ========================================
// スプレッドシートユーティリティ（stream-processor-v2.jsから抽出）
// ========================================

/**
 * カラムインデックスをA1記法に変換
 * @param {number} index - カラムインデックス（0ベース）
 * @returns {string} A1記法のカラム名
 */
function indexToColumn(index) {
  let column = '';
  while (index >= 0) {
    column = String.fromCharCode((index % 26) + 65) + column;
    index = Math.floor(index / 26) - 1;
  }
  return column;
}

/**
 * A1記法をカラムインデックスに変換
 * @param {string} column - A1記法のカラム名
 * @returns {number} カラムインデックス（0ベース）
 */
function columnToIndex(column) {
  let index = 0;
  for (let i = 0; i < column.length; i++) {
    index = index * 26 + column.charCodeAt(i) - 64;
  }
  return index - 1;
}

/**
 * セル位置をA1記法に変換
 * @param {number} row - 行番号（1ベース）
 * @param {number} col - カラム番号（1ベース）
 * @returns {string} A1記法のセル参照
 */
function getCellA1Notation(row, col) {
  return `${indexToColumn(col - 1)}${row}`;
}

/**
 * 範囲をA1記法に変換
 * @param {number} startRow - 開始行（1ベース）
 * @param {number} startCol - 開始列（1ベース）
 * @param {number} endRow - 終了行（1ベース）
 * @param {number} endCol - 終了列（1ベース）
 * @returns {string} A1記法の範囲
 */
function getRangeA1Notation(startRow, startCol, endRow, endCol) {
  const startCell = getCellA1Notation(startRow, startCol);
  const endCell = getCellA1Notation(endRow, endCol);
  return `${startCell}:${endCell}`;
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
    gid: gidMatch ? gidMatch[1] : '0'
  };
}

// ========================================
// タスク生成ロジック（stream-processor-v2.jsから抽出）
// ========================================

/**
 * タスクグループからタスクリストを生成
 * @param {Object} taskGroup - タスクグループ情報
 * @param {Array} spreadsheetData - スプレッドシートの全データ
 * @param {Object} specialRows - 特殊行の情報（メニュー行、AI行、モデル行など）
 * @param {number} dataStartRow - データ開始行
 * @param {Object} options - オプション設定
 * @returns {Array} タスクリスト
 */
function generateTaskList(taskGroup, spreadsheetData, specialRows, dataStartRow, options = {}) {
  const tasks = [];
  const {
    menuRow,
    aiRow,
    modelRow,
    functionRow
  } = specialRows;

  console.log(`[TaskList] [Step3-1] タスクグループ${taskGroup.groupNumber}のデータ取得開始`);

  // 3-1: スプレッドシートデータの取得
  const promptColumns = taskGroup.columns.prompts || [];
  const answerColumns = taskGroup.columns.answer ?
    (typeof taskGroup.columns.answer === 'object' ?
      Object.values(taskGroup.columns.answer) :
      [taskGroup.columns.answer]) :
    [];

  // プロンプトがある最終行を検索
  let lastPromptRow = dataStartRow;
  for (let row = dataStartRow; row < spreadsheetData.length; row++) {
    let hasPrompt = false;
    for (const col of promptColumns) {
      const colIndex = columnToIndex(col);
      if (spreadsheetData[row] && spreadsheetData[row][colIndex]) {
        hasPrompt = true;
        lastPromptRow = row + 1; // 1ベースに変換
        break;
      }
    }
  }

  console.log(`[TaskList] [Step3-1] 対象範囲: ${dataStartRow}行 〜 ${lastPromptRow}行`);

  // 3-2: タスク生成の除外処理
  const validTasks = [];

  for (let row = dataStartRow; row <= lastPromptRow; row++) {
    const rowData = spreadsheetData[row - 1]; // 0ベースインデックス
    if (!rowData) continue;

    // 🆕 行制御チェック（最初にチェックして不要な処理を避ける）
    if (options.applyRowControl && options.rowControls && options.rowControls.length > 0) {
      if (!shouldProcessRow(row, options.rowControls)) {
        console.log(`[TaskList] [Step3-2] ${row}行目: 行制御によりスキップ`, {
          行: row,
          制御: options.rowControls.map(c => `${c.type}:${c.row}行目`)
        });
        continue;
      }
    }

    // プロンプトの取得と結合
    let prompts = [];
    for (const col of promptColumns) {
      const colIndex = columnToIndex(col);
      const prompt = rowData[colIndex];
      if (prompt) {
        prompts.push(prompt);
      }
    }

    if (prompts.length === 0) continue; // プロンプトがない行はスキップ

    // 回答済みチェック
    let hasAnswer = false;
    for (const col of answerColumns) {
      const colIndex = columnToIndex(col);
      if (rowData[colIndex]) {
        hasAnswer = true;
        break;
      }
    }

    // 3-2-1-1: 回答済みチェック
    if (hasAnswer && !options.forceReprocess) {
      console.log(`[TaskList] [Step3-2] ${row}行目: 回答済みのためスキップ`);
      continue;
    }

    // 3-2-1-2: 追加の除外条件（拡張可能）
    if (options.customSkipConditions) {
      let shouldSkip = false;
      for (const condition of options.customSkipConditions) {
        if (condition(rowData, row)) {
          console.log(`[TaskList] [Step3-2] ${row}行目: カスタム条件によりスキップ`);
          shouldSkip = true;
          break;
        }
      }
      if (shouldSkip) continue;
    }

    // タスクグループタイプに応じて処理を分岐
    if (taskGroup.groupType === "通常処理" || taskGroup.groupType === "3種類AI") {
      // AIごとにタスクを生成
      const aiTypes = taskGroup.groupType === "3種類AI" ?
        ['ChatGPT', 'Claude', 'Gemini'] :
        [spreadsheetData[aiRow - 1][columnToIndex(promptColumns[0])] || 'ChatGPT'];

      for (const aiType of aiTypes) {
        const task = {
          taskId: `task_${taskGroup.groupNumber}_${row}_${Date.now()}`,
          groupNumber: taskGroup.groupNumber,
          groupType: taskGroup.groupType,
          row: row,
          column: promptColumns[0],
          prompt: prompts.join('\n\n'),
          ai: aiType,
          model: spreadsheetData[modelRow - 1] ?
            spreadsheetData[modelRow - 1][columnToIndex(promptColumns[0])] : '',
          function: spreadsheetData[functionRow - 1] ?
            spreadsheetData[functionRow - 1][columnToIndex(promptColumns[0])] : '',
          logCell: getCellA1Notation(row, columnToIndex(taskGroup.columns.log) + 1),
          promptCells: promptColumns.map(col => getCellA1Notation(row, columnToIndex(col) + 1)),
          answerCell: taskGroup.groupType === "3種類AI" ?
            getCellA1Notation(row, columnToIndex(taskGroup.columns.answer[aiType.toLowerCase()]) + 1) :
            getCellA1Notation(row, columnToIndex(taskGroup.columns.answer) + 1),
          ...parseSpreadsheetUrl(options.spreadsheetUrl || '')
        };

        validTasks.push(task);
      }
    } else {
      // 特殊タスク（レポート化、Genspark等）
      const task = {
        taskId: `task_${taskGroup.groupNumber}_${row}_${Date.now()}`,
        groupNumber: taskGroup.groupNumber,
        groupType: taskGroup.groupType,
        row: row,
        column: taskGroup.columns.work,
        prompt: prompts.join('\n\n'),
        ai: taskGroup.groupType,
        model: '',
        function: '',
        logCell: getCellA1Notation(row, columnToIndex(taskGroup.columns.log) + 1),
        workCell: getCellA1Notation(row, columnToIndex(taskGroup.columns.work) + 1),
        ...parseSpreadsheetUrl(options.spreadsheetUrl || '')
      };

      validTasks.push(task);
    }
  }

  console.log(`[TaskList] [Step3-2] 有効タスク数: ${validTasks.length}件`);

  // 行制御・列制御の統計ログ
  if (options.applyRowControl && options.rowControls && options.rowControls.length > 0) {
    console.log('📊 [TaskList] [Step3-統計] 行制御が適用されました:', {
      制御種類: options.rowControls.map(c => `${c.type}制御(${c.row}行目)`),
      対象範囲: `${dataStartRow}〜${lastPromptRow}行`,
      生成タスク数: validTasks.length
    });
  }

  if (options.applyColumnControl && options.columnControls && options.columnControls.length > 0) {
    console.log('📊 [TaskList] [Step3-統計] 列制御が適用されました:', {
      制御種類: options.columnControls.map(c => `${c.type}制御(${c.column}列)`),
      タスクグループ列: taskGroup.columns.prompts,
      生成タスク数: validTasks.length
    });
  }

  // 3-3: 3タスクずつのバッチ作成
  const batchSize = options.batchSize || 3;
  const batch = validTasks.slice(0, batchSize);

  console.log(`[TaskList] [Step3-3] バッチ作成完了: ${batch.length}タスク`);

  // タスクリストのログ出力
  console.log('📋 タスクリスト生成完了');
  batch.forEach((task, index) => {
    console.log(`- タスク${index + 1}: ${task.row}行目, ${task.ai}, ${task.model || 'モデル未指定'}`);
  });

  return batch;
}

/**
 * 行制御の取得
 * @param {Array} data - スプレッドシートデータ
 * @returns {Array} 行制御情報
 */
function getRowControl(data) {
  const controls = [];
  console.log('[TaskList] [Step3-行制御] B列から行制御を検索中...');

  for (let row = 0; row < data.length; row++) {
    const rowData = data[row];
    if (!rowData || !rowData[1]) continue;

    const cellValue = String(rowData[1] || '').trim();
    if (cellValue.includes('この行から処理')) {
      controls.push({
        type: 'start',
        row: row + 1
      });
    } else if (cellValue.includes('この行の処理後に停止')) {
      controls.push({
        type: 'stop',
        row: row + 1
      });
    } else if (cellValue.includes('この行のみ処理')) {
      controls.push({
        type: 'only',
        row: row + 1
      });
    }
  }

  console.log(`[TaskList] [Step3-Control] 行制御: ${controls.length}個の制御を検出`);
  controls.forEach(c => {
    console.log(`  - ${c.type}: ${c.row}行目`);
  });
  return controls;
}

/**
 * 列制御の取得
 * @param {Array} data - スプレッドシートデータ
 * @param {number} controlRow - 列制御行
 * @returns {Array} 列制御情報
 */
function getColumnControl(data, controlRow) {
  console.log(`[TaskList] [Step3-Control] 列制御情報の取得開始 (制御行: ${controlRow})`);
  const controls = [];

  try {
    if (!controlRow || !data[controlRow - 1]) {
      console.log(`[TaskList] [Step3-Control] 列制御行なし`);
      return controls;
    }

  const rowData = data[controlRow - 1];
  for (let col = 0; col < rowData.length; col++) {
    const cellValue = String(rowData[col] || '').trim();

    if (cellValue.includes('この列から処理')) {
      controls.push({
        type: 'start',
        column: indexToColumn(col)
      });
    } else if (cellValue.includes('この列の処理後に停止')) {
      controls.push({
        type: 'stop',
        column: indexToColumn(col)
      });
    } else if (cellValue.includes('この列のみ処理')) {
      controls.push({
        type: 'only',
        column: indexToColumn(col)
      });
    }
  }

  console.log(`[TaskList] [Step3-Control] 列制御: ${controls.length}個の制御を検出`);
  controls.forEach(c => {
    console.log(`  - ${c.type}: ${c.column}列`);
  });
  return controls;
  } catch (error) {
    console.error(`[TaskList] [Step3-Control] ❌ 列制御取得エラー:`, error);
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

  const onlyControls = rowControls.filter(c => c.type === 'only');
  if (onlyControls.length > 0) {
    return onlyControls.some(c => c.row === rowNumber);
  }

  const startControl = rowControls.find(c => c.type === 'start');
  const stopControl = rowControls.find(c => c.type === 'stop');

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

  const onlyControls = columnControls.filter(c => c.type === 'only');
  if (onlyControls.length > 0) {
    // タスクグループの列がonly制御に含まれているか確認
    return onlyControls.some(c => {
      const prompts = group.columns.prompts || [];
      return prompts.includes(c.column);
    });
  }

  const startControl = columnControls.find(c => c.type === 'start');
  const stopControl = columnControls.find(c => c.type === 'stop');

  if (startControl || stopControl) {
    const prompts = group.columns.prompts || [];
    const firstColumn = prompts[0];
    if (!firstColumn) return true;

    const colIndex = columnToIndex(firstColumn);
    const startIndex = startControl ? columnToIndex(startControl.column) : -1;
    const stopIndex = stopControl ? columnToIndex(stopControl.column) : Infinity;

    return colIndex >= startIndex && colIndex <= stopIndex;
  }

  return true;
}

// モジュールエクスポート
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    generateTaskList,
    getRowControl,
    getColumnControl,
    shouldProcessRow,
    shouldProcessColumn,
    indexToColumn,
    columnToIndex,
    getCellA1Notation,
    getRangeA1Notation,
    parseSpreadsheetUrl
  };
}

// グローバル公開（Chrome拡張機能用）
if (typeof window !== 'undefined') {
  window.Step3TaskList = {
    generateTaskList,
    getRowControl,
    getColumnControl,
    shouldProcessRow,
    shouldProcessColumn,
    indexToColumn,
    columnToIndex,
    getCellA1Notation,
    getRangeA1Notation,
    parseSpreadsheetUrl
  };
}