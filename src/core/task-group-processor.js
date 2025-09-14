/**
 * @fileoverview タスクグループ処理モジュール
 * スプレッドシートデータからタスクグループを生成し、処理を管理
 *
 * 【ステップ構成】
 * Step 1: 初期化
 * Step 2: メイン処理関数
 * Step 3: グループタイプ判定
 * Step 4: AIタイプ判定
 * Step 5: 列制御適用
 * Step 6: ヘルパー関数
 */

import StreamProcessorV2 from '../features/task/stream-processor-v2.js';

// ===== Step 1: タスクグループキャッシュ =====
export let taskGroupCache = {
  spreadsheetId: null,
  gid: null,
  taskGroups: null,
  timestamp: null
};

/**
 * Step 2: processSpreadsheetData関数
 * StreamProcessorV2.processSpreadsheetDataへ委譲
 */
export function processSpreadsheetData(spreadsheetData) {
  console.log('[Step 2-1] processSpreadsheetData開始');

  // Step 2-2: StreamProcessorV2のシングルトンインスタンスを取得
  const processor = StreamProcessorV2.getInstance(console);

  // Step 2-3: StreamProcessorV2のprocessSpreadsheetDataメソッドを使用
  const result = processor.processSpreadsheetData(spreadsheetData);

  console.log(`[Step 2-4] StreamProcessorV2で処理完了: タスクグループ${result.taskGroups?.length || 0}個`);

  return result;
}

/**
 * Step 3: グループタイプを判定するヘルパー関数
 */
export function determineGroupType(trimmedHeader) {
  console.log('[Step 3-1] グループタイプ判定:', trimmedHeader);

  if (trimmedHeader === "レポート化") {
    console.log('[Step 3-2] レポートタイプ');
    return "report";
  } else if (trimmedHeader.includes("Genspark（スライド）")) {
    console.log('[Step 3-3] Gensparkスライドタイプ');
    return "genspark_slide";
  } else if (trimmedHeader.includes("Genspark（ファクトチェック）")) {
    console.log('[Step 3-4] Gensparkファクトチェックタイプ');
    return "genspark_factcheck";
  } else if (trimmedHeader.includes("Genspark（")) {
    console.log('[Step 3-5] Gensparkタイプ');
    return "genspark";
  }
  console.log('[Step 3-6] 標準タイプ');
  return "standard";
}

/**
 * Step 4: AIタイプを判定するヘルパー関数
 */
export function determineAIType(trimmedHeader) {
  console.log('[Step 4-1] AIタイプ判定:', trimmedHeader);

  if (trimmedHeader === "レポート化") {
    console.log('[Step 4-2] Reportタイプ');
    return "Report";
  } else if (trimmedHeader.includes("Genspark（スライド）")) {
    console.log('[Step 4-3] Genspark-Slidesタイプ');
    return "Genspark-Slides";
  } else if (trimmedHeader.includes("Genspark（ファクトチェック）")) {
    console.log('[Step 4-4] Genspark-FactCheckタイプ');
    return "Genspark-FactCheck";
  }
  console.log('[Step 4-5] タイプなし');
  return null;
}

/**
 * Step 5: 列制御をタスクグループに適用
 */
export function applyColumnControlsToGroups(taskGroups, columnControls) {
  console.log('[Step 5-1] 列制御適用開始');

  if (!columnControls || columnControls.length === 0) {
    console.log('[Step 5-2] 列制御なし');
    return taskGroups;
  }

  // Step 5-3: "この列のみ処理"が最優先
  const onlyControls = columnControls.filter(c => c.type === 'only');
  if (onlyControls.length > 0) {
    console.log('[Step 5-3-1] "この列のみ処理"フィルタ適用');
    // 指定列を含むグループのみを選択
    const filteredGroups = taskGroups.filter(group => {
      // グループ内のすべての列をチェック
      const allColumns = [
        ...group.columnRange.promptColumns,
        ...group.columnRange.answerColumns.map(a => typeof a === 'string' ? a : a.column)
      ];

      // 指定列のいずれかがグループに含まれているか
      return onlyControls.some(ctrl => allColumns.includes(ctrl.column));
    });

    console.log(`[Step 5-3-2] "この列のみ処理"により${taskGroups.length}グループから${filteredGroups.length}グループに絞り込み`);
    return filteredGroups;
  }

  // Step 5-4: "この列から処理"と"この列で停止"の処理
  const fromControl = columnControls.find(c => c.type === 'from');
  const untilControl = columnControls.find(c => c.type === 'until');

  let filteredGroups = taskGroups;

  if (fromControl) {
    console.log('[Step 5-4-1] "この列から処理"フィルタ適用');
    // 指定列以降のグループのみ
    filteredGroups = filteredGroups.filter(group => {
      const groupStartIndex = columnToIndex(group.startColumn);
      return groupStartIndex >= fromControl.index;
    });
    console.log(`[Step 5-4-2] "${fromControl.column}列から処理"によりグループをフィルタ`);
  }

  if (untilControl) {
    console.log('[Step 5-4-3] "この列で停止"フィルタ適用');
    // 指定列までのグループのみ
    filteredGroups = filteredGroups.filter(group => {
      const groupEndIndex = columnToIndex(group.endColumn);
      return groupEndIndex <= untilControl.index;
    });
    console.log(`[Step 5-4-4] "${untilControl.column}列で停止"によりグループをフィルタ`);
  }

  return filteredGroups;
}

/**
 * Step 6-1: 列名生成関数（A, B, ..., Z, AA, AB, ...）
 */
export function getColumnName(index) {
  if (index < 0) return null;

  let columnName = '';
  let num = index;

  while (num >= 0) {
    columnName = String.fromCharCode(65 + (num % 26)) + columnName;
    num = Math.floor(num / 26) - 1;
    if (num < 0) break;
  }

  return columnName;
}

/**
 * Step 6-2: 列名をインデックスに変換（ヘルパー関数）
 */
export function columnToIndex(column) {
  if (typeof column !== 'string' || column.length === 0) {
    return -1;
  }

  let index = 0;
  for (let i = 0; i < column.length; i++) {
    index = index * 26 + (column.charCodeAt(i) - 'A'.charCodeAt(0) + 1);
  }
  return index - 1; // 0ベースに変換
}

// Step 7: グローバル設定（Service Worker環境用）
if (typeof globalThis !== 'undefined') {
  globalThis.processSpreadsheetData = processSpreadsheetData;
  globalThis.taskGroupCache = taskGroupCache;
  globalThis.determineGroupType = determineGroupType;
  globalThis.determineAIType = determineAIType;
  globalThis.applyColumnControlsToGroups = applyColumnControlsToGroups;
  globalThis.getColumnName = getColumnName;
  globalThis.columnToIndex = columnToIndex;
  // タスクグループ処理をグローバル空間に登録完了
}