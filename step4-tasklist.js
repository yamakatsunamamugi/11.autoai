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
// StreamProcessorV2統合: Step内統合版ウィンドウ・タスク管理システム
// ========================================

/**
 * Step内統合版 WindowService（StreamProcessorV2の機能を内部実装）
 */
class StepIntegratedWindowService {
  static windowPositions = new Map(); // position -> windowId

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
      console.warn(
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
      console.log(
        `🪟 [StepIntegratedWindowService] ウィンドウ作成開始: position=${position}, url=${url}`,
      );

      // 既存ウィンドウが使用中の場合は閉じる
      if (this.windowPositions.has(position)) {
        const existingWindowId = this.windowPositions.get(position);
        console.log(
          `🔄 [StepIntegratedWindowService] position=${position}の既存ウィンドウ${existingWindowId}を閉じます`,
        );

        try {
          await chrome.windows.remove(existingWindowId);
          this.windowPositions.delete(position);
          await new Promise((resolve) => setTimeout(resolve, 500)); // 削除完了待ち
        } catch (error) {
          console.warn("既存ウィンドウ削除エラー（続行）:", error);
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

      console.log(
        `📐 [StepIntegratedWindowService] ウィンドウ作成オプション:`,
        createOptions,
      );

      // ウィンドウ作成
      const window = await chrome.windows.create(createOptions);

      // 位置を記録
      this.windowPositions.set(position, window.id);

      console.log(
        `✅ [StepIntegratedWindowService] ウィンドウ作成完了: windowId=${window.id}, position=${position}`,
      );

      return {
        id: window.id,
        tabs: window.tabs,
        ...window,
      };
    } catch (error) {
      console.error(
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

      console.log(
        `✅ [StepIntegratedWindowService] ウィンドウ閉じる完了: windowId=${windowId}`,
      );
    } catch (error) {
      console.warn(
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
    console.log(`🔗 [StepIntegratedAiUrlManager] URL取得: ${aiType} -> ${url}`);
    return url;
  }
}

/**
 * Step内統合版 AITaskExecutor（StreamProcessorV2の機能を内部実装）
 */
class StepIntegratedAITaskExecutor {
  constructor() {
    this.logger = console;
  }

  async executeAITask(tabId, taskData) {
    try {
      console.log(
        `🤖 [StepIntegratedAITaskExecutor] タスク実行開始: tabId=${tabId}, AI=${taskData.aiType}`,
      );

      // タブをアクティブにする
      await chrome.tabs.update(tabId, { active: true });
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // コンテンツスクリプトを注入して実行
      const results = await chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: (prompt) => {
          // AI自動化の実行（簡易版）
          if (
            typeof window.automation !== "undefined" &&
            window.automation.executeTask
          ) {
            return window.automation.executeTask({ prompt: prompt });
          } else {
            // フォールバック: プロンプトを入力エリアに設定
            const textarea = document.querySelector(
              'textarea[placeholder*="メッセージ"], textarea[placeholder*="message"], div[contenteditable="true"]',
            );
            if (textarea) {
              textarea.value = prompt;
              textarea.textContent = prompt;

              // 送信ボタンを探してクリック
              const sendButton = document.querySelector(
                'button[type="submit"], button:has(svg)',
              );
              if (sendButton) {
                sendButton.click();
              }

              return { success: true, response: "Task initiated" };
            }
            return { success: false, error: "No input area found" };
          }
        },
        args: [taskData.prompt],
      });

      const result = results[0]?.result || {
        success: false,
        error: "No result",
      };

      console.log(
        `✅ [StepIntegratedAITaskExecutor] タスク実行完了: success=${result.success}`,
      );
      return result;
    } catch (error) {
      console.error(
        `❌ [StepIntegratedAITaskExecutor] タスク実行エラー:`,
        error,
      );
      return { success: false, error: error.message };
    }
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
    console.log("[step3-tasklist] メニュー行またはAI行が見つかりません");
    return { hasAdditions: false, addedColumns: [] };
  }

  try {
    // プロンプト列グループを検索
    const promptGroups = findPromptGroups(
      spreadsheetData[menuRowIndex],
      spreadsheetData[aiRowIndex],
    );

    if (promptGroups.length === 0) {
      console.log("[step3-tasklist] プロンプト列が見つかりません");
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
    console.error("[step3-tasklist] 自動列追加エラー:", error);
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
      console.log(
        `[step3-tasklist] 列追加成功: ${indexToColumn(columnIndex)}列 (${headerText})`,
      );
      return true;
    } else {
      console.error(
        `[step3-tasklist] 列追加失敗: ${headerText}`,
        await response.text(),
      );
      return false;
    }
  } catch (error) {
    console.error(`[step3-tasklist] 列追加エラー: ${headerText}`, error);
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
      console.log(
        `[step3-tasklist] 列削除成功: ${indexToColumn(columnIndex)}列`,
      );
      return true;
    } else {
      console.error("[step3-tasklist] 列削除失敗", await response.text());
      return false;
    }
  } catch (error) {
    console.error("[step3-tasklist] 列削除エラー", error);
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

    // 必要に応じて自動列追加を実行
    if (options.enableAutoColumnSetup && options.spreadsheetId) {
      console.log("[step3-tasklist] 自動列追加を実行中...");
      const setupResult = await executeAutoColumnSetup(
        options.spreadsheetId,
        options.gid,
        spreadsheetData,
        specialRows,
      );

      if (setupResult.hasAdditions) {
        console.log(
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
                console.log(
                  "[step3-tasklist] スプレッドシートデータを再読み込みしました",
                );
              }
            }
          } catch (error) {
            console.error("[step3-tasklist] データ再読み込みエラー:", error);
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
            console.log(`[step3-tasklist] ${message}:`, data);
          } else {
            logBuffer.push(message);
            console.log(`[step3-tasklist] ${message}`);
          }
        }
        return;
      }

      // 通常のログ処理
      if (data) {
        logBuffer.push(`${message}: ${JSON.stringify(data)}`);
        console.log(`[step3-tasklist] ${message}:`, data);
      } else {
        logBuffer.push(message);
        console.log(`[step3-tasklist] ${message}`);
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
            const windowData =
              window.windowController.openedWindows.get(normalizedAiType);
            if (Array.isArray(windowData) && windowData.length > 0) {
              // タスクのインデックスに基づいてウィンドウを循環選択
              const taskIndex = tasksCreated; // 現在までに作成されたタスク数を使用
              windowInfo = windowData[taskIndex % windowData.length];
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
                aiType: normalizedAiType,
              };
            }
            console.log(
              `[step4-tasklist] 🖼️ DEBUG: WindowInfo取得 (aiType: ${aiType})`,
              {
                windowControllerExists: !!window.windowController,
                openedWindowsExists: !!window.windowController?.openedWindows,
                openedWindowsSize: window.windowController?.openedWindows?.size,
                allOpenedWindows: window.windowController?.openedWindows
                  ? Array.from(window.windowController.openedWindows.entries())
                  : null,
                originalAiType: aiType,
                normalizedAiType: normalizedAiType,
                foundWindowInfo: windowInfo,
              },
            );
          } else {
            // WindowController利用不可
          }

          // windowInfoが取得できない場合の詳細ログ
          if (!windowInfo) {
            console.warn(`[step4-tasklist] ⚠️ WARNING: WindowInfo取得失敗`, {
              originalAiType: aiType,
              normalizedAiType: normalizedAiType,
              availableWindows: window.windowController?.openedWindows
                ? Array.from(window.windowController.openedWindows.keys())
                : null,
              suggestion: "aiType正規化が正しく動作しているか確認してください",
            });
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

          console.log(
            `[step4-tasklist] 🖼️ DEBUG: タスク作成完了 (行${row}, aiType: ${aiType})`,
            {
              taskId: task.taskId,
              tabId: task.tabId,
              windowId: task.windowId,
              aiType: task.aiType,
              hasTabId: !!task.tabId,
              hasWindowId: !!task.windowId,
            },
          );

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

        validTasks.push(task);
        tasksCreated++; // タスク作成数をインクリメント
      }
    }

    // 3-3: 3タスクずつのバッチ作成
    const batchSize = options.batchSize || 3;
    const batch = validTasks.slice(0, batchSize);

    // 「既に回答あり」ログのサマリー出力
    if (answerLogCount > MAX_ANSWER_LOGS) {
      console.log(
        `[step3-tasklist] [TaskList] 既に回答済みの行: 合計 ${answerLogCount} 行 (詳細表示: ${MAX_ANSWER_LOGS} 行、省略: ${answerLogCount - MAX_ANSWER_LOGS} 行)`,
      );
    } else if (answerLogCount > 0) {
      console.log(
        `[step3-tasklist] [TaskList] 既に回答済みの行: 合計 ${answerLogCount} 行`,
      );
    }

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

/**
 * Google Servicesの初期化
 * @returns {Promise<boolean>} 初期化成功フラグ
 */
async function initializeGoogleServices() {
  try {
    // Google Servicesが既にグローバルに存在するかチェック
    if (typeof window !== "undefined" && window.googleServices) {
      await window.googleServices.initialize();
      console.log("[step3-tasklist] Google Services初期化完了");
      return true;
    }

    // フォールバック: 基本的な認証チェック
    if (typeof chrome !== "undefined" && chrome.identity) {
      return new Promise((resolve) => {
        chrome.identity.getAuthToken({ interactive: false }, (token) => {
          if (chrome.runtime.lastError) {
            console.warn(
              "[step3-tasklist] 認証トークン取得失敗:",
              chrome.runtime.lastError,
            );
            resolve(false);
          } else {
            console.log(
              "[step3-tasklist] 認証トークン確認完了:",
              token ? "✓" : "✗",
            );
            resolve(true);
          }
        });
      });
    }

    console.warn("[step3-tasklist] Google Services初期化環境が不明");
    return false;
  } catch (error) {
    console.error("[step3-tasklist] Google Services初期化エラー:", error);
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
      console.error(
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

// ========================================
// ExecuteLogger configuration
// ========================================
const ExecuteLogger = {
  info: (...args) => console.log(`[step4-tasklist.js]`, ...args),
  debug: (...args) => console.log(`[step4-tasklist.js] [DEBUG]`, ...args),
  warn: (...args) => console.warn(`[step4-tasklist.js]`, ...args),
  error: (...args) => console.error(`[step4-tasklist.js]`, ...args),
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
        ExecuteLogger.info("✅ [DEBUG] window.WindowService発見・使用", {
          type: typeof this.windowService,
          name: this.windowService?.name,
          methods: Object.getOwnPropertyNames(
            this.windowService.prototype || {},
          ),
        });
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

    const results = [];

    for (const layout of windowLayout) {
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

          // 既存の配列を取得または新規作成
          const normalizedAiType = this.normalizeAiType(layout.aiType);
          if (!this.openedWindows.has(normalizedAiType)) {
            this.openedWindows.set(normalizedAiType, []);
          }

          // ウィンドウデータを配列に追加
          const windowArray = this.openedWindows.get(normalizedAiType);
          windowData.uniqueKey = uniqueKey;
          windowArray.push(windowData);

          ExecuteLogger.info(`[WindowController] ウィンドウ配列に追加`, {
            aiType: layout.aiType,
            uniqueKey: uniqueKey,
            position: layout.position,
            windowArrayLength: windowArray.length,
          });

          ExecuteLogger.info(`[WindowController] openedWindows.set完了`, {
            aiType: layout.aiType,
            afterSize: this.openedWindows.size,
            allOpenedWindows: Array.from(this.openedWindows.entries()),
          });

          results.push({
            aiType: layout.aiType,
            success: true,
            windowId: windowInfo.id,
            position: layout.position,
          });

          ExecuteLogger.info(
            `✅ [Step 4-1-2-${layout.position}] ${layout.aiType}ウィンドウ作成成功`,
          );
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
          throw new Error(`ウィンドウ作成に失敗: ${layout.aiType}`);
        }
      } catch (error) {
        ExecuteLogger.error(
          `❌ [Step 4-1-2-${layout.position}] ${layout.aiType}ウィンドウ作成失敗:`,
          error,
        );
        results.push({
          aiType: layout.aiType,
          success: false,
          error: error.message,
          position: layout.position,
        });
      }

      // ウィンドウ間の待機時間
      await new Promise((resolve) => setTimeout(resolve, 1000));
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

    const checkResults = [];

    for (const aiType of aiTypes) {
      const normalizedAiType = this.normalizeAiType(aiType);
      const windowInfo = this.openedWindows.get(normalizedAiType);
      if (!windowInfo) {
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

      try {
        ExecuteLogger.info(
          `🔍 [Step 4-1-3] ${aiType}ウィンドウをチェック中...`,
        );

        // タブをアクティブにしてからチェック
        if (windowInfo.tabId) {
          await chrome.tabs.update(windowInfo.tabId, { active: true });
          await new Promise((resolve) => setTimeout(resolve, 2000)); // 読み込み待機
        }

        // AI種別に応じたチェック処理
        const checkResult = await this.performWindowCheck(
          aiType,
          windowInfo.tabId,
        );

        checkResults.push({
          aiType: aiType,
          success: checkResult.success,
          checks: checkResult.checks,
          error: checkResult.error,
        });

        ExecuteLogger.info(
          `✅ [Step 4-1-3] ${aiType}ウィンドウチェック完了:`,
          checkResult,
        );
      } catch (error) {
        ExecuteLogger.error(
          `❌ [Step 4-1-3] ${aiType}ウィンドウチェック失敗:`,
          error,
        );
        checkResults.push({
          aiType: aiType,
          success: false,
          error: error.message,
        });
      }
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
   * 個別ウィンドウのチェック処理
   */
  async performWindowCheck(aiType, tabId) {
    const checks = {
      textInput: false,
      modelDisplay: false,
      functionDisplay: false,
    };

    try {
      // Content scriptにチェック要求を送信
      const response = await chrome.tabs.sendMessage(tabId, {
        action: "CHECK_UI_ELEMENTS",
        aiType: aiType,
      });

      // Chrome runtime.lastErrorのチェック
      if (chrome.runtime.lastError) {
        console.warn(
          `[step5-execute.js] タブ通信エラー (tabId: ${tabId}):`,
          chrome.runtime.lastError.message,
        );
        return checks; // デフォルト値で復帰
      }

      if (response && response.success) {
        checks.textInput = response.checks.textInput || false;
        checks.modelDisplay = response.checks.modelDisplay || false;
        checks.functionDisplay = response.checks.functionDisplay || false;
      }

      const allChecksPass = Object.values(checks).every((check) => check);

      return {
        success: allChecksPass,
        checks: checks,
        error: allChecksPass ? null : "UI要素の一部が見つかりません",
      };
    } catch (error) {
      return {
        success: false,
        checks: checks,
        error: error.message,
      };
    }
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

  // Step内統合版AITaskExecutorの初期化
  let aiTaskExecutor = null;
  try {
    aiTaskExecutor = new StepIntegratedAITaskExecutor();
    ExecuteLogger.info(
      "✅ [executeStep4] Step内統合版AITaskExecutor初期化完了",
    );
  } catch (error) {
    ExecuteLogger.warn(
      "⚠️ [executeStep4] Step内統合版AITaskExecutor初期化失敗、従来方式を使用:",
      error,
    );
  }

  // 内部関数の存在確認（実行時チェック）
  ExecuteLogger.info("🔍 [executeStep4] 内部関数の定義状態確認:", {
    executeNormalAITask: typeof executeNormalAITask,
    processTaskResult: typeof processTaskResult,
    shouldPerformWindowCleanup: typeof shouldPerformWindowCleanup,
    calculateLogCellRef: typeof calculateLogCellRef,
    aiTaskExecutorAvailable: !!aiTaskExecutor,
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

    // Step 4-6-4: ウィンドウチェック
    ExecuteLogger.info("🔍 [Step 4-6-4] ウィンドウチェック開始");

    const aiTypes = successfulWindows.map((w) => w.aiType);
    const checkResults = await window.windowController.checkWindows(aiTypes);
    ExecuteLogger.info("✅ [Step 4-6-4] ウィンドウチェック完了:", checkResults);

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

      // Step 4-6-6-A: 既存ウィンドウの再利用 (重複開閉を避ける)
      const batchWindows = new Map(); // aiType -> windowInfo

      ExecuteLogger.info(
        `🔄 [step4-execute.js] Step 4-6-6-${batchIndex + 2}-A: 既存ウィンドウの再利用チェック`,
      );

      for (const task of batch) {
        const aiType = task.aiType;

        // 🔍 DEBUG: 既存ウィンドウ確認の詳細ログ
        ExecuteLogger.info(`🔍 [DEBUG] ${aiType}ウィンドウの存在確認開始`, {
          aiType: aiType,
          normalizedAiType: window.windowController.normalizeAiType(aiType),
          openedWindowsSize: window.windowController.openedWindows.size,
          openedWindowsKeys: Array.from(
            window.windowController.openedWindows.keys(),
          ),
          hasAiType: window.windowController.openedWindows.has(aiType),
          hasNormalizedAiType: window.windowController.openedWindows.has(
            window.windowController.normalizeAiType(aiType),
          ),
        });

        const normalizedAiType =
          window.windowController.normalizeAiType(aiType);

        // 既存ウィンドウがあるかチェック（正規化されたキーで確認）
        if (window.windowController.openedWindows.has(normalizedAiType)) {
          const existingWindow =
            window.windowController.openedWindows.get(normalizedAiType);

          ExecuteLogger.info(`🔍 [DEBUG] 既存ウィンドウ発見 - 構造確認`, {
            aiType: aiType,
            normalizedAiType: normalizedAiType,
            existingWindowType: typeof existingWindow,
            isArray: Array.isArray(existingWindow),
            windowData: existingWindow,
            keys: existingWindow ? Object.keys(existingWindow) : null,
          });

          // 配列の場合は最初の要素を取得
          const windowToUse = Array.isArray(existingWindow)
            ? existingWindow[0]
            : existingWindow;

          ExecuteLogger.info(`🔍 [DEBUG] 使用予定のウィンドウ詳細`, {
            windowToUse: windowToUse,
            hasTabId: !!windowToUse?.tabId,
            hasWindowId: !!windowToUse?.windowId,
            hasId: !!windowToUse?.id,
            tabId: windowToUse?.tabId,
            windowId: windowToUse?.windowId,
            id: windowToUse?.id,
          });

          batchWindows.set(aiType, windowToUse);
          ExecuteLogger.info(
            `♻️ [step4-execute.js] ${aiType}ウィンドウを再利用`,
          );
        } else {
          // 新しいウィンドウが必要な場合のみ開く（StreamProcessorV2統合版）
          ExecuteLogger.info(
            `🪟 [step4-execute.js] ${aiType}ウィンドウが存在しないため新規作成`,
          );

          try {
            const windowInfo = await createWindowForBatch(task, 0); // 基本位置に開く
            batchWindows.set(aiType, windowInfo);
            ExecuteLogger.info(
              `✅ [step4-execute.js] ${aiType}ウィンドウ作成成功`,
            );
          } catch (error) {
            ExecuteLogger.error(
              `❌ [step4-execute.js] ${aiType}ウィンドウ作成失敗:`,
              error,
            );
          }
        }
      }

      // Step 4-6-6-B: ウィンドウチェック
      ExecuteLogger.info(
        `🔍 [step4-execute.js] Step 4-6-6-${batchIndex + 2}-B: ウィンドウチェック`,
      );
      const checkResults = await window.windowController.checkWindows(
        Array.from(batchWindows.keys()),
      );
      ExecuteLogger.info(`✅ チェック結果:`, checkResults);

      // Step 4-6-6-C: バッチ内のタスクを並列実行
      // シンプルな有効性確認（StreamProcessorV2統合版）
      const validBatchTasks = batch.filter((task, index) => {
        const taskId = task.id || task.taskId || `${task.column}${task.row}`;
        const windowInfo = batchWindows.get(task.aiType);

        ExecuteLogger.info(
          `🔍 [step4-execute.js] タスク${taskId}の有効性確認 (AI: ${task.aiType})`,
        );

        // ウィンドウ情報の存在確認
        if (!windowInfo || !windowInfo.tabId) {
          ExecuteLogger.error(
            `❌ [step4-execute.js] タスク${taskId}：${task.aiType}のウィンドウ情報が無効`,
            {
              windowInfo: windowInfo,
              hasWindowInfo: !!windowInfo,
              hasTabId: !!windowInfo?.tabId,
              hasWindowId: !!windowInfo?.windowId,
            },
          );
          return false;
        }

        // タスクにウィンドウ情報を直接設定
        task.tabId = windowInfo.tabId;
        task.windowId = windowInfo.windowId;

        ExecuteLogger.info(
          `✅ [step4-execute.js] タスク${taskId}：ウィンドウ情報設定完了`,
          {
            tabId: task.tabId,
            windowId: task.windowId,
            aiType: task.aiType,
          },
        );

        // StreamProcessorV2統合: 複雑なフォールバック処理を削除
        ExecuteLogger.info(
          `🔍 [DEBUG] タスク${task.id || task.taskId}のtabId/windowIdチェック開始`,
          {
            taskId: task.id || task.taskId,
            currentTabId: task.tabId,
            currentWindowId: task.windowId,
            hasTabId: !!task.tabId,
            hasWindowId: !!task.windowId,
            aiType: task.aiType,
          },
        );

        if (!task.tabId || !task.windowId) {
          // フォールバック1: batchWindowsから取得
          const batchWindowInfo = batchWindows.get(task.aiType);

          ExecuteLogger.info(
            `🔍 [DEBUG] フォールバック1: batchWindowsから取得試行`,
            {
              taskId: task.id || task.taskId,
              aiType: task.aiType,
              batchWindowInfo: batchWindowInfo,
              batchWindowInfoType: typeof batchWindowInfo,
              batchWindowInfoKeys: batchWindowInfo
                ? Object.keys(batchWindowInfo)
                : null,
              hasTabId: !!batchWindowInfo?.tabId,
              hasWindowId: !!batchWindowInfo?.windowId,
              hasId: !!batchWindowInfo?.id,
              tabIdValue: batchWindowInfo?.tabId,
              windowIdValue: batchWindowInfo?.windowId,
              idValue: batchWindowInfo?.id,
            },
          );

          if (
            batchWindowInfo &&
            (batchWindowInfo.tabId ||
              batchWindowInfo.windowId ||
              batchWindowInfo.id)
          ) {
            task.tabId =
              batchWindowInfo.tabId || batchWindowInfo.id || task.tabId;
            task.windowId =
              batchWindowInfo.windowId || batchWindowInfo.id || task.windowId;
            ExecuteLogger.info(
              `🔄 [step4-execute.js] タスク${task.id || task.taskId}：batchWindowsからtabId/windowIdを復元`,
              {
                tabId: task.tabId,
                windowId: task.windowId,
                aiType: task.aiType,
              },
            );
          } else {
            // フォールバック2: windowControllerから直接取得
            const normalizedAiType = task.aiType?.toLowerCase()?.trim();
            const controllerWindowInfo =
              window.windowController?.openedWindows?.get(normalizedAiType);

            ExecuteLogger.info(
              `🔍 [DEBUG] フォールバック2: windowControllerから取得試行`,
              {
                taskId: task.id || task.taskId,
                aiType: task.aiType,
                normalizedAiType: normalizedAiType,
                controllerWindowInfo: controllerWindowInfo,
                controllerWindowInfoType: typeof controllerWindowInfo,
                isArray: Array.isArray(controllerWindowInfo),
                controllerWindowInfoKeys: controllerWindowInfo
                  ? Object.keys(controllerWindowInfo)
                  : null,
                hasTabId: !!controllerWindowInfo?.tabId,
                hasWindowId: !!controllerWindowInfo?.windowId,
                hasId: !!controllerWindowInfo?.id,
                tabIdValue: controllerWindowInfo?.tabId,
                windowIdValue: controllerWindowInfo?.windowId,
                idValue: controllerWindowInfo?.id,
                arrayFirstElement: Array.isArray(controllerWindowInfo)
                  ? controllerWindowInfo[0]
                  : null,
              },
            );

            if (controllerWindowInfo) {
              // 配列の場合は最初の要素を使用
              const windowToUse = Array.isArray(controllerWindowInfo)
                ? controllerWindowInfo[0]
                : controllerWindowInfo;

              ExecuteLogger.info(
                `🔍 [DEBUG] フォールバック2: 使用するwindowInfo詳細`,
                {
                  windowToUse: windowToUse,
                  hasTabId: !!windowToUse?.tabId,
                  hasWindowId: !!windowToUse?.windowId,
                  hasId: !!windowToUse?.id,
                  tabIdValue: windowToUse?.tabId,
                  windowIdValue: windowToUse?.windowId,
                  idValue: windowToUse?.id,
                },
              );

              task.tabId = windowToUse?.tabId || windowToUse?.id || task.tabId;
              task.windowId =
                windowToUse?.windowId || windowToUse?.id || task.windowId;
              ExecuteLogger.info(
                `🔄 [step4-execute.js] タスク${task.id || task.taskId}：windowControllerからtabId/windowIdを復元`,
                {
                  tabId: task.tabId,
                  windowId: task.windowId,
                  aiType: task.aiType,
                },
              );
            }
          }

          // 最終チェック：まだ不正な場合は警告して除外
          if (!task.tabId || !task.windowId) {
            ExecuteLogger.warn(
              `⚠️ [step4-execute.js] タスク${task.id || task.taskId}：フォールバック後もタブIDまたはウィンドウIDが不正`,
              {
                tabId: task.tabId,
                windowId: task.windowId,
                aiType: task.aiType || task.ai,
                groupType: task.groupType,
                row: task.row,
                debugInfo: "batchWindowsとwindowController両方からの復元に失敗",
              },
            );
            return false;
          }
        }

        // 同一バッチ内でのタブID重複チェック
        const duplicateIndex = batch.findIndex(
          (otherTask, otherIndex) =>
            otherIndex < index && otherTask.tabId === task.tabId,
        );

        if (duplicateIndex !== -1) {
          ExecuteLogger.warn(
            `⚠️ [step4-execute.js] タスク${task.id || task.taskId}：タブID重複検出 (tabId: ${task.tabId})`,
            {
              duplicateWith:
                batch[duplicateIndex].id || batch[duplicateIndex].taskId,
            },
          );
          return false;
        }

        return true;
      });

      ExecuteLogger.info(
        `⚡ [step4-execute.js] Step 4-6-6-${batchIndex + 2}-C: ${validBatchTasks.length}/${batch.length}の有効タスクを並列実行`,
      );

      if (validBatchTasks.length === 0) {
        ExecuteLogger.error(
          `❌ [step4-execute.js] バッチ${batchIndex + 1}：実行可能なタスクがありません`,
        );
        continue; // 次のバッチへ
      }

      const batchPromises = validBatchTasks.map(async (task, index) => {
        const taskId = task.id || task.taskId || `${task.column}${task.row}`;
        const isThreeTypeTask =
          task.originalAiType === "3種類（ChatGPT・Gemini・Claude）";

        try {
          // スプレッドシートで指定されたAI種別をそのまま使用
          ExecuteLogger.info(
            `📝 [step4-execute.js] タスク実行: ${taskId} (AI: ${task.aiType}) ${isThreeTypeTask ? "[3種類AI]" : "[通常]"}`,
          );

          // 特別処理かチェック
          const specialInfo =
            window.specialTaskProcessor.identifySpecialTask(task);
          let result = null;

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

            // StreamProcessorV2統合: AITaskExecutorを使用可能かチェック
            if (aiTaskExecutor && task.tabId) {
              ExecuteLogger.info(
                `✅ [step4-execute.js] StreamProcessorV2パターンで実行: ${task.aiType} (tabId: ${task.tabId})`,
              );
              result = await aiTaskExecutor.executeAITask(task.tabId, task);
            } else {
              ExecuteLogger.info(
                `📋 [step4-execute.js] 従来方式で実行: ${task.aiType}`,
              );
              result = await executeNormalAITask(task);
            }
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

      for (const [aiType, windowInfo] of batchWindows) {
        try {
          await StepIntegratedWindowService.closeWindow(windowInfo.windowId);
          ExecuteLogger.info(`✅ ${aiType}ウィンドウクローズ完了`);
        } catch (error) {
          ExecuteLogger.error(`⚠️ ${aiType}ウィンドウクローズエラー:`, error);
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

    return new Promise((resolve, reject) => {
      // タブ情報確認と有効性チェック
      chrome.tabs.get(tabId, (tab) => {
        if (chrome.runtime.lastError) {
          ExecuteLogger.error(
            `❌ [Tab Check] タブ取得エラー:`,
            chrome.runtime.lastError,
          );
          reject(
            new Error(
              `タブID ${tabId} が無効です: ${chrome.runtime.lastError.message}`,
            ),
          );
          return;
        }

        // タブの有効性チェック
        if (!tab || tab.status !== "complete") {
          ExecuteLogger.error(`❌ [Tab Check] タブが無効または未完了:`, {
            tabId: tab?.id,
            status: tab?.status,
            url: tab?.url,
          });
          reject(
            new Error(
              `タブID ${tabId} が無効または未完了です (status: ${tab?.status})`,
            ),
          );
          return;
        }

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
      });

      function sendMessageToValidTab() {
        // メッセージ送信
        chrome.tabs.sendMessage(
          tabId,
          {
            action: "executeTask",
            automationName: automationName,
            task: task,
          },
          (response) => {
            if (chrome.runtime.lastError) {
              ExecuteLogger.error(
                `❌ [Content Script] 通信エラー:`,
                chrome.runtime.lastError,
              );
              reject(
                new Error(
                  `Content Script通信エラー: ${chrome.runtime.lastError.message}`,
                ),
              );
              return;
            }

            if (!response) {
              ExecuteLogger.error(`❌ [Content Script] 応答なし`);
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
          },
        );

        // タイムアウト設定（5分）
        setTimeout(() => {
          reject(new Error(`Content Script実行タイムアウト (Tab: ${tabId})`));
        }, 300000);
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

    ExecuteLogger.info(`🔍 [Step 4-6-8] タブID確認: ${normalizedAiType}`, {
      normalizedKey: normalizedKey,
      windowInfo: !!windowInfo,
      tabId: targetTabId,
      windowId: windowInfo?.windowId,
      url: windowInfo?.url,
      openedWindowsSize: window.windowController.openedWindows.size,
      allWindows: Array.from(window.windowController.openedWindows.entries()),
    });

    if (!targetTabId) {
      throw new Error(
        `${normalizedAiType} のタブが見つかりません (Key: ${normalizedKey})`,
      );
    }

    // Step 4-6-8-3: タスク開始ログ記録
    if (window.detailedLogManager) {
      window.detailedLogManager.recordTaskStart(task, windowInfo);
    }

    // Step 4-6-8-3: AI自動化ファイルの読み込み確認
    const aiType = normalizedAiType.toLowerCase();
    if (!window.aiAutomationLoader.isAIAvailable(aiType)) {
      ExecuteLogger.info(
        `[step4-execute.js] Step 4-6-8-3: ${normalizedAiType} 自動化ファイルを読み込み中...`,
      );
      await window.aiAutomationLoader.loadAIFile(aiType);
      await new Promise((resolve) => setTimeout(resolve, 1000));
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
// window.executeStep4エクスポート実行
ExecuteLogger.info("エクスポート前のexecuteStep4関数状態:", {
  executeStep4Type: typeof executeStep4,
  executeStep4Exists: typeof executeStep4 === "function",
  executeStep4Name: executeStep4?.name,
});
window.executeStep4 = executeStep4;
ExecuteLogger.info("✅ [DEBUG] window.executeStep4エクスポート完了:", {
  windowExecuteStep4Type: typeof window.executeStep4,
  windowExecuteStep4Exists: typeof window.executeStep4 === "function",
  windowExecuteStep4Name: window.executeStep4?.name,
  globalAccess: typeof globalThis?.executeStep4 === "function",
});

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
console.log("✅ [step4-tasklist.js] ファイル読み込み完了", {
  executeStep4Defined: typeof executeStep4,
  windowExecuteStep4: typeof window.executeStep4,
  timestamp: new Date().toISOString(),
});
