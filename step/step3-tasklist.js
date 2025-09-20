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

// columnToIndex関数の定義確認・フォールバック作成
if (typeof columnToIndex === "undefined") {
  console.warn(
    "⚠️ [step3-tasklist.js] columnToIndex関数が未定義です。フォールバック関数を作成します。",
  );

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

  console.log("✅ [step3-tasklist.js] フォールバック関数を作成しました");
}

// ========================================
// Google Services統合（自動列追加機能対応）
// ========================================

// Google Servicesをインポート（自動列追加機能を利用）
// import { GoogleServices } from "../src/services/google-services.js";

// Google Servicesインスタンス（グローバル）
let googleServices = null;

/**
 * Google Servicesの初期化
 * @returns {Promise<GoogleServices>} 初期化されたGoogle Servicesインスタンス
 */
async function initializeGoogleServices() {
  if (!googleServices) {
    try {
      // GoogleServicesクラスをグローバルから取得
      const GoogleServices = window.GoogleServices || globalThis.GoogleServices;

      if (GoogleServices) {
        googleServices = new GoogleServices();
        await googleServices.initialize();
        console.log("✅ [step3-tasklist.js] Google Services初期化完了");
      } else {
        console.warn(
          "⚠️ [step3-tasklist.js] GoogleServicesクラスが利用できません - グローバル確認:",
          {
            windowKeys:
              typeof window !== "undefined"
                ? Object.keys(window).filter((k) => k.includes("Google"))
                : [],
            globalThisKeys: Object.keys(globalThis).filter((k) =>
              k.includes("Google"),
            ),
          },
        );
        return null;
      }
    } catch (initError) {
      console.error(
        "❌ [step3-tasklist.js] GoogleServices初期化エラー:",
        initError,
      );
      return null;
    }
  }
  return googleServices;
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
    console.error("[step3-tasklist.js] getAnswerCell エラー:", error);
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

    // Google Servicesの初期化
    const services = await initializeGoogleServices();

    // 必要に応じて自動列追加を実行
    if (options.enableAutoColumnSetup && options.spreadsheetId) {
      console.log("[step3-tasklist.js] 自動列追加セットアップを実行中...");
      const setupResult = await services.runAutoSetup(
        options.spreadsheetId,
        options.gid,
      );

      if (setupResult.hasAdditions) {
        console.log(
          `[step3-tasklist.js] ✅ 自動列追加完了: ${setupResult.addedColumns?.length || 0}列追加`,
        );

        // 列追加後はスプレッドシートデータを再読み込み
        if (setupResult.addedColumns && setupResult.addedColumns.length > 0) {
          console.log(
            "[step3-tasklist.js] 📋 スプレッドシートデータを再読み込み中...",
          );
          const refreshedData = await services.loadData(
            options.spreadsheetId,
            options.gid,
          );
          if (refreshedData && refreshedData.data) {
            // spreadsheetDataを更新（参照渡しで更新）
            spreadsheetData.splice(
              0,
              spreadsheetData.length,
              ...refreshedData.data,
            );
            console.log(
              `[step3-tasklist.js] ✅ データ再読み込み完了: ${spreadsheetData.length}行`,
            );
          }
        }
      }
    }
    const tasks = [];
    const { menuRow, aiRow, modelRow, functionRow } = specialRows;

    // ログバッファを初期化
    const logBuffer = [];
    const addLog = (message, data) => {
      if (data) {
        logBuffer.push(`${message}: ${JSON.stringify(data)}`);
      } else {
        logBuffer.push(message);
      }
    };

    console.log(
      `[step3-tasklist.js→Step3-1-0] タスクグループ${taskGroup.groupNumber}の処理開始`,
    );

    const promptColumns = taskGroup.columns.prompts || [];
    // 【統一修正】全てオブジェクト形式なのでObject.valuesを直接使用
    const answerColumns = taskGroup.columns.answer
      ? Object.values(taskGroup.columns.answer)
      : [];

    // デバッグ情報をコンソールに出力
    console.log("[step3-tasklist.js→Step3-1-1] 列設定:", {
      promptColumns: promptColumns,
      answerColumns: answerColumns,
    });

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

    // 最終行検索完了
    console.log(
      `[step3-tasklist.js→Step3-1-2] 対象範囲: ${dataStartRow}行〜${lastPromptRow}行 (プロンプト列: ${promptColumns.join(", ")})`,
    );

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
          addLog(`[TaskList] ${row}行目: 既に回答あり (${col}列)`);
          break;
        }
      }

      // 回答済みチェック
      if (hasAnswer && !options.forceReprocess) {
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
          console.warn(
            `[step3-tasklist.js] [Step 3-2-0] ⚠️ [WARNING] aiRowData取得失敗:`,
            {
              spreadsheetDataExists: !!spreadsheetData,
              spreadsheetDataLength: spreadsheetData?.length,
              aiRow: aiRow,
              aiRowValid: aiRow > 0 && aiRow <= (spreadsheetData?.length || 0),
            },
          );
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
              console.warn(
                "[step3-tasklist.js] [Step 3-2-1] [Warning] 無効な列インデックス, デフォルトでChatGPTを使用",
              );
              aiTypes = ["ChatGPT"];
            }
          } else {
            console.warn(
              "[step3-tasklist.js] [Step 3-2-2] [Warning] promptColumnsが未定義または空, デフォルトでChatGPTを使用",
            );
            aiTypes = ["ChatGPT"];
          }
        }

        for (let aiType of aiTypes) {
          const originalAiType = aiType;

          // AIタイプの正規化（singleをClaudeに変換）
          if (aiType === "single" || !aiType) {
            console.log(
              `[step3-tasklist.js] [Step 3-2-3] AIタイプ '${aiType}' を 'Claude' に変換`,
            );
            aiType = "Claude";
          }

          // 【シンプル化】文字列結合でセル位置計算
          const answerCell = getAnswerCell(taskGroup, aiType, row);

          // Step4との互換性のため、aiTypeフィールドも追加
          const task = {
            taskId: `task_${taskGroup.groupNumber}_${row}_${Date.now()}`,
            id: `task_${taskGroup.groupNumber}_${row}_${Date.now()}`, // Step4互換
            groupNumber: taskGroup.groupNumber,
            groupType: taskGroup.groupType,
            row: row,
            column: promptColumns[0],
            prompt: prompts.join("\n\n"),
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

          validTasks.push(task);
        }
      } else {
        // 特殊タスク（レポート化、Genspark等）
        const task = {
          taskId: `task_${taskGroup.groupNumber}_${row}_${Date.now()}`,
          id: `task_${taskGroup.groupNumber}_${row}_${Date.now()}`, // Step4互換
          groupNumber: taskGroup.groupNumber,
          groupType: taskGroup.groupType,
          row: row,
          // 特殊タスクは作業セルのみ使用するため、columnプロパティは不要
          prompt: prompts.join("\n\n"),
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

        validTasks.push(task);
      }
    }

    // サマリーログ出力
    const skippedCount = logBuffer.filter((log) =>
      log.includes("既に回答あり"),
    ).length;
    if (skippedCount > 0) {
      console.log(
        `[step3-tasklist.js] [Step 3-2-9] グループ${taskGroup.groupNumber}: ${skippedCount}行スキップ（既に回答あり）`,
      );
    }

    console.log(
      `[step3-tasklist.js] [Step 3-2-10] 有効タスク数: ${validTasks.length}件`,
    );

    if (validTasks.length === 0) {
      console.warn(
        "[step3-tasklist.js] [Step 3-2-12] [Warning] タスクが生成されませんでした。以下を確認してください:",
        {
          dataStartRow: dataStartRow,
          lastPromptRow: lastPromptRow,
          処理対象行数: lastPromptRow - dataStartRow + 1,
          行制御数: options.rowControls?.length || 0,
          列制御数: options.columnControls?.length || 0,
          taskGroup: taskGroup,
        },
      );
    }

    // 行制御・列制御の統計ログ
    if (
      options.applyRowControl &&
      options.rowControls &&
      options.rowControls.length > 0
    ) {
      console.log(
        "[step3-tasklist.js] [Step 3-3-1] 📊 行制御が適用されました:",
        {
          制御種類: options.rowControls.map(
            (c) => `${c.type}制御(${c.row}行目)`,
          ),
          対象範囲: `${dataStartRow}〜${lastPromptRow}行`,
          生成タスク数: validTasks.length,
        },
      );
    }

    if (
      options.applyColumnControl &&
      options.columnControls &&
      options.columnControls.length > 0
    ) {
      console.log(
        "[step3-tasklist.js] [Step 3-3-2] 📊 列制御が適用されました:",
        {
          制御種類: options.columnControls.map(
            (c) => `${c.type}制御(${c.column}列)`,
          ),
          タスクグループ列: taskGroup.columns.prompts,
          生成タスク数: validTasks.length,
        },
      );
    }

    // 3-3: 3タスクずつのバッチ作成
    const batchSize = options.batchSize || 3;
    const batch = validTasks.slice(0, batchSize);

    console.log(
      `[step3-tasklist.js] [Step 3-3-3] バッチ作成完了: ${batch.length}タスク`,
    );

    // タスクリストのログ出力
    console.log("[step3-tasklist.js] [Step 3-3-4] 📋 タスクリスト生成完了");
    batch.forEach((task, index) => {
      console.log(
        `[step3-tasklist.js] [Step 3-3-5] - タスク${index + 1}: ${task.row}行目, ${task.ai}, ${task.model || "モデル未指定"}`,
      );
    });

    return batch;
  } catch (error) {
    console.error(
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
  console.log("[step3-tasklist.js→Step3-4-1] B列から行制御を検索中...");

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

  console.log(
    `[step3-tasklist.js] [Step 3-4-2] 行制御: ${controls.length}個の制御を検出`,
  );
  controls.forEach((c) => {
    console.log(`[step3-tasklist.js] [Step 3-4-3]   - ${c.type}: ${c.row}行目`);
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
  console.log(
    `[step3-tasklist.js→Step3-5-1] 列制御情報の取得開始 (制御行: ${controlRow})`,
  );
  const controls = [];

  try {
    if (!controlRow || !data[controlRow - 1]) {
      console.log(`[step3-tasklist.js] [Step 3-5-2] 列制御行なし`);
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

    console.log(
      `[step3-tasklist.js] [Step 3-5-3] 列制御: ${controls.length}個の制御を検出`,
    );
    controls.forEach((c) => {
      console.log(
        `[step3-tasklist.js] [Step 3-5-4]   - ${c.type}: ${c.column}列`,
      );
    });
    return controls;
  } catch (error) {
    console.error(
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
    window.Step3TaskList = {
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
    console.log("✅ [step3-tasklist.js] window.Step3TaskList初期化完了");

    // スクリプト読み込み完了をトラッキング
    if (window.scriptLoadTracker) {
      window.scriptLoadTracker.addScript("step3-tasklist.js");
      window.scriptLoadTracker.checkDependencies("step3-tasklist.js");
    }
  } catch (error) {
    console.error(
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
