// ログレベル定義
const LOG_LEVEL = { ERROR: 1, WARN: 2, INFO: 3, DEBUG: 4 };

// Chrome Storageからログレベルを取得（非同期）
let CURRENT_LOG_LEVEL = LOG_LEVEL.INFO; // デフォルト値

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
 * ステップ2: タスクグループの作成
 * スプレッドシート構造を解析してタスクグループを識別・生成
 */

// グローバル状態を使用（step1と共有）
if (!window.globalState) {
  window.globalState = {
    spreadsheetId: null,
    gid: null,
    taskGroups: [],
    taskTypeMap: {},
    workColumnMap: {},
    columnControls: {},
    skipInfo: {},
    currentGroupIndex: 0,
    stats: {
      totalGroups: 0,
      completedGroups: 0,
      totalTasks: 0,
      successTasks: 0,
      failedTasks: 0,
    },
  };
}

// ========================================
// 2-0. スプレッドシート情報の取得
// ========================================
function extractSpreadsheetInfo() {
  log.debug("========");
  log.debug("[step2-taskgroup.js→Step2-0] スプレッドシート情報の取得");
  log.debug("========");

  // 2-0-1. globalStateまたはURLからIDを取得
  let spreadsheetId = null;
  let gid = "0";

  // 方法1: globalStateから取得（STEP専用ボタンで設定済み）
  if (window.globalState && window.globalState.spreadsheetId) {
    spreadsheetId = window.globalState.spreadsheetId;
    gid = window.globalState.gid || "0";
    log.debug(`[step2-taskgroup.js] [Step 2-0-1] ✅ globalStateから取得:`);
    log.debug(`  - スプレッドシートID: ${spreadsheetId}`);
    log.debug(`  - GID: ${gid}`);
  } else {
    // 方法2: URLから解析（元の方法）
    const url = window.location.href;
    // 現在のURL確認

    const spreadsheetIdMatch = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    const gidMatch = url.match(/#gid=([0-9]+)/);

    // URLパターンマッチング
    log.debug(
      `  - スプレッドシートIDマッチ: ${spreadsheetIdMatch ? "成功" : "失敗"}`,
    );
    log.debug(`  - GIDマッチ: ${gidMatch ? "成功" : "失敗"}`);

    spreadsheetId = spreadsheetIdMatch ? spreadsheetIdMatch[1] : null;
    gid = gidMatch ? gidMatch[1] : "0";
  }

  // 2-0-2. 取得した情報の保存・更新
  // 抽出情報を保存
  window.globalState.spreadsheetId = spreadsheetId;
  window.globalState.gid = gid;

  log.debug(`  - スプレッドシートID: ${spreadsheetId}`);
  log.debug(`  - GID: ${gid}`);
  log.debug(
    `  - シート名: ${gid === "0" ? "デフォルトシート" : `シート${gid}`}`,
  );

  if (!spreadsheetId) {
    log.error(
      "[step2-taskgroup.js] [Step 2-0-2] ⚠️ スプレッドシートIDが取得できませんでした",
    );
    log.error("  - 原因: URLが正しいGoogleスプレッドシートではない可能性");
    log.error(
      "  - Chrome Extension環境ではUIコントローラーでglobalStateに設定してください",
    );
  }

  return { spreadsheetId, gid };
}

// ========================================
// 2-1. タスクグループの識別と作成
// ========================================
async function identifyTaskGroups() {
  log.debug("========");
  log.debug("[step2-taskgroup.js→Step2-1] タスクグループの識別開始");
  log.debug("========");

  // globalStateまたは従来の方法でステップ1の結果を取得
  let setupResult = null;

  if (window.globalState && window.globalState.spreadsheetId) {
    // STEP専用ボタン用：globalStateから構築
    setupResult = {
      spreadsheetId: window.globalState.spreadsheetId,
      specialRows: window.globalState.specialRows || {},
      apiHeaders: window.globalState.apiHeaders || {
        Authorization: `Bearer ${window.globalState.authToken}`,
        "Content-Type": "application/json",
      },
      sheetsApiBase:
        window.globalState.sheetsApiBase ||
        "https://sheets.googleapis.com/v4/spreadsheets",
    };
    log.debug(
      "[step2-taskgroup.js] [Step 2-1] ✅ globalStateからsetupResultを構築",
    );
  } else {
    // 従来の方法（フォールバック）
    setupResult =
      window.setupResult ||
      JSON.parse(localStorage.getItem("step1Result") || "null");
  }

  if (!setupResult) {
    log.error(
      "[step2-taskgroup.js] [Step 2-1] ❌ ステップ1の結果が取得できません",
    );
    log.error("  - window.globalState: ", window.globalState);
    log.error("  - window.setupResult: ", window.setupResult);
    log.error(
      "  - localStorage.step1Result: ",
      localStorage.getItem("step1Result") ? "あり" : "なし",
    );
    throw new Error("ステップ1の結果が見つかりません");
  }

  const { spreadsheetId, specialRows, apiHeaders, sheetsApiBase } = setupResult;
  const { menuRow, aiRow } = specialRows;

  // 2-1-1. メニュー行とAI行の読み込み
  log.debug("[step2-taskgroup.js] [Step 2-1-1] メニュー行とAI行の読み込み開始");
  log.debug(`  - メニュー行: ${menuRow}行目`);
  log.debug(`  - AI行: ${aiRow}行目`);

  const menuRange = `${menuRow}:${menuRow}`; // メニュー行全体
  const aiRange = `${aiRow}:${aiRow}`; // AI行全体

  try {
    // キャッシュの確認
    if (!window.globalState.initialSheetData) {
      throw new Error("初期データキャッシュが見つかりません");
    }

    // メニュー行・AI行取得
    const menuValues = window.globalState.initialSheetData[menuRow - 1] || [];
    const aiValues = window.globalState.initialSheetData[aiRow - 1] || [];

    // 取得データ概要: メニュー行${menuValues.length}列, AI行${aiValues.length}列

    // 2-1-2. 列の走査とパターン認識（stream-processor-v2.jsのロジックを採用）
    // 列の走査とパターン認識開始
    const taskGroups = [];
    let groupCounter = 1;
    let currentGroup = null;
    let processedColumns = 0;

    menuValues.forEach((header, index) => {
      processedColumns++;
      const columnLetter = columnToLetter(index);
      const trimmedHeader = header ? header.trim() : "";
      const aiValue = aiValues[index] || "";

      // ログ列の検出（stream-processor-v2.jsより）
      if (trimmedHeader === "ログ" || trimmedHeader.includes("ログ")) {
        // 前のグループが完成していれば保存
        if (
          currentGroup &&
          currentGroup.answerColumns &&
          currentGroup.answerColumns.length > 0
        ) {
          taskGroups.push(currentGroup);
          groupCounter++;
          currentGroup = null;
        }

        // 新しいグループを開始
        currentGroup = {
          id: `group_${groupCounter}`,
          name: `タスクグループ${groupCounter}`,
          groupNumber: groupCounter,
          type: "通常処理",
          startColumn: columnLetter,
          endColumn: columnLetter,
          logColumn: columnLetter,
          promptColumns: [],
          answerColumns: [],
          groupType: "通常処理",
          aiType: aiValue || "Claude",
          dependencies: groupCounter > 1 ? [`group_${groupCounter - 1}`] : [],
          sequenceOrder: groupCounter,
          startCol: index,
          // step4-tasklist.js互換のためcolumns.logを追加
          columns: {
            log: columnLetter,
          },
          endCol: index,
        };
      }

      // 2-1-3. 特殊グループの検出（レポート化、Genspark）
      if (
        trimmedHeader === "レポート化" ||
        trimmedHeader.includes("Genspark（スライド）") ||
        trimmedHeader.includes("Genspark（ファクトチェック）")
      ) {
        // 前のグループがあれば完了させる
        if (
          currentGroup &&
          (currentGroup.answerColumns.length > 0 ||
            ["report", "genspark_slide", "genspark_factcheck"].includes(
              currentGroup.groupType,
            ))
        ) {
          taskGroups.push(currentGroup);
          groupCounter++;
        }

        // 特殊グループタイプの判定
        let groupType = "report";
        let aiType = "Report";
        if (trimmedHeader.includes("Genspark（スライド）")) {
          groupType = "genspark_slide";
          aiType = "Genspark-Slides";
        } else if (trimmedHeader.includes("Genspark（ファクトチェック）")) {
          groupType = "genspark_factcheck";
          aiType = "Genspark-FactCheck";
        }

        // 特殊グループを作成
        const specialGroup = {
          id: `group_${groupCounter}`,
          name: `タスクグループ${groupCounter}`,
          groupNumber: groupCounter,
          type: trimmedHeader.includes("レポート")
            ? "レポート化"
            : trimmedHeader.includes("スライド")
              ? "Gensparkスライド"
              : "Gensparkファクトチェック",
          startColumn: columnLetter,
          endColumn: columnLetter,
          column: columnLetter,
          promptColumns: [columnLetter],
          answerColumns: [],
          groupType: groupType,
          aiType: aiType,
          ai: aiType,
          dependencies: groupCounter > 1 ? [`group_${groupCounter - 1}`] : [],
          sequenceOrder: groupCounter,
          isSpecialGroup: true,
          startCol: index,
          endCol: index,
        };

        taskGroups.push(specialGroup);
        groupCounter++;
        currentGroup = null;
      }

      // プロンプト列の検出
      if (trimmedHeader.includes("プロンプト")) {
        // 前のグループが完成していれば新しいグループを開始
        if (
          currentGroup &&
          currentGroup.promptColumns.length > 0 &&
          currentGroup.answerColumns.length > 0
        ) {
          taskGroups.push(currentGroup);
          groupCounter++;
          currentGroup = null;
        }

        // 現在のグループがない場合、新しいグループを開始
        if (!currentGroup) {
          currentGroup = {
            id: `group_${groupCounter}`,
            name: `タスクグループ${groupCounter}`,
            groupNumber: groupCounter,
            type: "通常処理",
            startColumn: columnLetter,
            endColumn: columnLetter,
            logColumn: null,
            promptColumns: [columnLetter],
            answerColumns: [],
            groupType: "通常処理",
            aiType: aiValue || "Claude",
            ai: aiValue,
            dependencies: groupCounter > 1 ? [`group_${groupCounter - 1}`] : [],
            sequenceOrder: groupCounter,
            startCol: index,
            endCol: index,
          };
        } else {
          // 既存のグループにプロンプト列を追加
          currentGroup.promptColumns.push(columnLetter);
          currentGroup.endCol = index;
        }

        // AI行の値からグループタイプを判定
        if (aiValue.includes("3種類")) {
          currentGroup.groupType = "3type";
          currentGroup.type = "3種類AI";
          currentGroup.aiType = aiValue;
        } else if (aiValue) {
          currentGroup.groupType = "通常処理";
          currentGroup.aiType = aiValue;
        }
      }

      // 回答列の検出
      if (
        currentGroup &&
        (trimmedHeader.includes("回答") || trimmedHeader.includes("答"))
      ) {
        // AIタイプを判定（stream-processor-v2.jsのdetectAITypeFromHeaderロジック）
        let detectedAiType = "Claude";
        if (
          currentGroup.groupType === "3type" ||
          currentGroup.type === "3種類AI"
        ) {
          const headerLower = trimmedHeader.toLowerCase();
          if (headerLower.includes("chatgpt") || headerLower.includes("gpt")) {
            detectedAiType = "ChatGPT";
            currentGroup.chatgptColumn = columnLetter;
          } else if (headerLower.includes("claude")) {
            detectedAiType = "Claude";
            currentGroup.claudeColumn = columnLetter;
          } else if (headerLower.includes("gemini")) {
            detectedAiType = "Gemini";
            currentGroup.geminiColumn = columnLetter;
          }
        } else {
          currentGroup.answerColumn = columnLetter;
        }

        currentGroup.answerColumns.push({
          column: columnLetter,
          index: index,
          aiType: detectedAiType,
        });
        currentGroup.endColumn = columnLetter;
        currentGroup.endCol = index;
      }
    });

    // 最後のグループを追加
    if (currentGroup && currentGroup.answerColumns.length > 0) {
      taskGroups.push(currentGroup);
    }

    // 内部で作成したtaskGroupsを保存（統計情報用）
    window.globalState.allTaskGroups = taskGroups;
    window.globalState.taskGroups = taskGroups;
    return taskGroups;
  } catch (error) {
    log.error(
      "[step2-taskgroup.js] [Step 2-1] ❌ タスクグループ識別エラー詳細:",
    );
    log.error(`  - エラー名: ${error.name}`);
    log.error(`  - メッセージ: ${error.message}`);
    log.error(`  - スタック: ${error.stack}`);
    throw error;
  }
}

// ========================================
// 2-2. 列制御の適用
// ========================================
async function applyColumnControls() {
  log.debug("========");
  log.debug("[step2-taskgroup.js→Step2-2] 列制御の適用");
  log.debug("========");

  // globalStateから最新のデータを取得
  const spreadsheetId = window.globalState.spreadsheetId;
  const specialRows = window.globalState.specialRows;
  const apiHeaders = window.globalState.apiHeaders;
  const sheetsApiBase = window.globalState.sheetsApiBase;
  const { controlRow } = specialRows;

  if (!controlRow) {
    log.debug(
      "[step2-taskgroup.js] [Step 2-2] 列制御行が定義されていません - 列制御処理をスキップ",
    );
    return;
  }

  // 列制御行: ${controlRow}行目

  // 2-2-1. 列制御行の全列を読み込み（キャッシュから）
  log.debug(
    `[step2-taskgroup.js] [Step 2-2-1] 列制御行データ取得: ${controlRow}行目`,
  );

  try {
    // キャッシュの確認
    if (!window.globalState.initialSheetData) {
      throw new Error("初期データキャッシュが見つかりません");
    }

    // 列制御行取得
    const controlValues =
      window.globalState.initialSheetData[controlRow - 1] || [];

    // 列制御データ取得済み

    // 2-2-2. 列制御テキストの検出と処理
    // 列制御テキストの検出
    const controls = {
      startFrom: null,
      stopAfter: null,
      onlyProcess: [],
    };

    let controlCount = 0;
    controlValues.forEach((text, index) => {
      if (!text) return;

      const column = columnToLetter(index);
      const groupIndex = findGroupByColumn(column);

      log.debug(`  [${column}] 制御テキスト: "${text}"`);

      // 2-2-2-1. 「この列から処理」の検出
      if (text.includes("この列から処理")) {
        controls.startFrom = groupIndex;
        controlCount++;
        log.debug(
          `[step2-taskgroup.js] [Step 2-2-2-1] ✅ 「この列から処理」検出: ${column}列 (グループ${groupIndex})`,
        );
      }

      // 2-2-2-2. 「この列の処理後に停止」の検出
      if (text.includes("この列の処理後に停止")) {
        controls.stopAfter = groupIndex;
        controlCount++;
        log.debug(
          `[step2-taskgroup.js] [Step 2-2-2-2] ✅ 「この列の処理後に停止」検出: ${column}列 (グループ${groupIndex})`,
        );
      }

      // 2-2-2-3. 「この列のみ処理」の検出
      if (text.includes("この列のみ処理")) {
        controls.onlyProcess.push(groupIndex);
        controlCount++;
        log.debug(
          `[step2-taskgroup.js] [Step 2-2-2-3] ✅ 「この列のみ処理」検出: ${column}列 (グループ${groupIndex})`,
        );
      }
    });

    log.debug(
      `[step2-taskgroup.js] [Step 2-2-2] 列制御検出完了: ${controlCount}個の制御を検出`,
    );

    // 2-2-3. 複数の列制御がある場合の処理
    // 列制御の適用
    const taskGroups = window.globalState.taskGroups;
    let skipCount = 0;

    if (controls.onlyProcess.length > 0) {
      // 「この列のみ処理」が優先
      log.debug(
        `[step2-taskgroup.js] [Step 2-2-3] 「この列のみ処理」モード: グループ${controls.onlyProcess.join(", ")}のみ処理`,
      );

      taskGroups.forEach((group, index) => {
        if (!controls.onlyProcess.includes(index + 1)) {
          group.skip = true;
          skipCount++;
          log.debug(`  - グループ${group.groupNumber}をスキップ設定`);
        }
      });
    } else {
      // 範囲制御の適用
      if (controls.startFrom) {
        log.debug(
          `[step2-taskgroup.js] [Step 2-2-3] 開始位置制御: グループ${controls.startFrom}から開始`,
        );
        taskGroups.forEach((group) => {
          if (group.groupNumber < controls.startFrom) {
            group.skip = true;
            skipCount++;
            log.debug(`  - グループ${group.groupNumber}をスキップ（開始前）`);
          }
        });
      }

      if (controls.stopAfter) {
        log.debug(
          `[step2-taskgroup.js] [Step 2-2-3] 終了位置制御: グループ${controls.stopAfter}で停止`,
        );
        taskGroups.forEach((group) => {
          if (group.groupNumber > controls.stopAfter) {
            group.skip = true;
            skipCount++;
            log.debug(`  - グループ${group.groupNumber}をスキップ（終了後）`);
          }
        });
      }
    }

    log.debug(
      `[step2-taskgroup.js] [Step 2-2-3] 列制御適用完了: ${skipCount}個のグループをスキップ設定`,
    );

    window.globalState.columnControls = controls;
  } catch (error) {
    log.error("[step2-taskgroup.js] [Step 2-2] ❌ 列制御適用エラー詳細:");
    log.error(`  - エラー名: ${error.name}`);
    log.error(`  - メッセージ: ${error.message}`);
    log.error("  - 注: 列制御エラーでも処理は継続します");
    // エラーでも処理を続行
  }
}

// ========================================
// 2-3. タスクグループのスキップ判定
// ========================================
async function applySkipConditions() {
  log.debug("========");
  log.debug("[step2-taskgroup.js→Step2-3] スキップ判定の適用");
  log.debug("========");

  // globalStateから最新のspreadsheetIdを取得（localStorageは古い可能性がある）
  const spreadsheetId = window.globalState.spreadsheetId;
  const gid = window.globalState.gid;
  const specialRows = window.globalState.specialRows;
  const sheetsApiBase = window.globalState.sheetsApiBase;
  const { dataStartRow } = specialRows;
  const taskGroups = window.globalState.taskGroups;

  log.debug(
    `[step2-taskgroup.js] [Step 2-3] 使用するspreadsheetId: ${spreadsheetId}`,
  );

  // 現在のトークンで最新のAPIヘッダーを作成
  const currentToken = window.globalState.authToken;
  const apiHeaders = {
    Authorization: `Bearer ${currentToken}`,
    "Content-Type": "application/json",
  };

  // デバッグ情報: spreadsheetId, dataStartRow, taskGroups数, 認証情報

  let checkedGroups = 0;
  let skippedByData = 0;
  const groupResults = [];

  for (const group of taskGroups) {
    const result = {
      groupNumber: group.groupNumber,
      type: group.type,
      status: "unknown",
      processedCount: 0,
      unprocessedCount: 0,
      skipReason: null,
      error: null,
      cellRange: null,
    };

    if (group.skip) {
      result.status = "already-skipped";
      result.skipReason = "列制御によりスキップ設定済み";
      groupResults.push(result);
      continue;
    }

    checkedGroups++;

    try {
      // データ範囲を決定（データ開始行から100行）
      const endRow = dataStartRow + 99;

      if (group.type === "通常処理" || group.type === "3種類AI") {
        // プロンプト列の最初の列を取得
        const promptCol = group.promptColumns[0];

        // 回答列を取得
        let answerCol;
        if (group.type === "通常処理") {
          answerCol = group.answerColumn;
        } else {
          answerCol = group.chatgptColumn; // 3種類AIの場合は最初の回答列で判定
        }

        // セル範囲を計算（ログ列〜回答列）
        const logCol = group.logColumn || "A";
        let finalAnswerCol = answerCol;
        if (group.type === "3種類AI") {
          // 3種類AIの場合、最終の回答列を取得
          finalAnswerCol =
            group.geminiColumn || group.claudeColumn || group.chatgptColumn;
        }
        result.cellRange = `${logCol}${dataStartRow}:${finalAnswerCol}${endRow}`;

        // プロンプト列の取得
        // Step1で取得したシート名を使用
        const sheetName = window.globalState.sheetName || `シート${gid}`;
        const promptRange = `'${sheetName}'!${promptCol}${dataStartRow}:${promptCol}${endRow}`;
        const promptUrl = `${sheetsApiBase}/${spreadsheetId}/values/${promptRange}`;

        // プロンプト列取得
        log.debug(`[step2-taskgroup.js] API呼び出し: ${promptUrl}`);

        const promptResponse = await window.fetchWithTokenRefresh(promptUrl, {
          headers: apiHeaders,
        });

        log.debug(
          `[step2-taskgroup.js] API応答ステータス: ${promptResponse.status}`,
        );

        const promptData = await promptResponse.json();
        const promptValues = promptData.values || [];

        log.debug(
          `[step2-taskgroup.js] ✅ プロンプト取得完了: ${promptValues.length}行`,
        );

        // 回答列の取得
        const answerRange = `'${sheetName}'!${answerCol}${dataStartRow}:${answerCol}${endRow}`;
        const answerUrl = `${sheetsApiBase}/${spreadsheetId}/values/${answerRange}`;

        // 回答列取得
        log.debug(`[step2-taskgroup.js] API呼び出し: ${answerUrl}`);

        const answerResponse = await window.fetchWithTokenRefresh(answerUrl, {
          headers: apiHeaders,
        });

        log.debug(
          `[step2-taskgroup.js] API応答ステータス: ${answerResponse.status}`,
        );

        const answerData = await answerResponse.json();
        const answerValues = answerData.values || [];

        log.debug(
          `[step2-taskgroup.js] ✅ 回答取得完了: ${answerValues.length}行`,
        );

        // 回答取得完了: ${answerValues.length}行

        // スキップ条件の適用
        let hasUnprocessedTask = false;
        let processedCount = 0;
        let unprocessedCount = 0;

        for (let i = 0; i < promptValues.length; i++) {
          const promptText = promptValues[i] && promptValues[i][0];
          const answerText = answerValues[i] && answerValues[i][0];

          // プロンプトがあって回答がない場合は処理対象
          if (promptText && !answerText) {
            hasUnprocessedTask = true;
            unprocessedCount++;
          } else if (promptText && answerText) {
            processedCount++;
          }
        }

        result.processedCount = processedCount;
        result.unprocessedCount = unprocessedCount;

        // 有効なタスクグループの判定
        if (!hasUnprocessedTask) {
          group.skip = true;
          skippedByData++;
          result.status = "skipped";
          result.skipReason = "未処理タスクなし";
        } else {
          result.status = "active";
        }
      } else {
        result.status = "special";
        result.skipReason = "特殊グループ（レポート/Genspark）";

        // レポート化/Gensparkの場合、作業セル列のみ表示
        const workCol = group.column || group.promptColumns[0];
        result.cellRange = `${workCol}${dataStartRow}:${workCol}${endRow}`;
      }
    } catch (error) {
      result.status = "error";
      result.error = error.message;

      // エラー詳細をログ出力
      log.error(
        `[step2-taskgroup.js] ❌ グループ${group.groupNumber}処理エラー:`,
        {
          エラーメッセージ: error.message,
          スタック: error.stack,
          グループ情報: {
            groupNumber: group.groupNumber,
            type: group.type,
            promptColumns: group.promptColumns,
          },
        },
      );

      // エラーの場合はスキップしない（安全のため処理対象として扱う）
    }

    groupResults.push(result);
  }

  // 結果サマリー
  const activeGroups = groupResults.filter((r) => r.status === "active").length;
  const skippedGroups = groupResults.filter(
    (r) => r.status === "skipped",
  ).length;
  log.debug(
    `[step2-taskgroup.js] 📊 グループ判定結果: 全${groupResults.length}個 | 処理対象${activeGroups}個 | スキップ${skippedGroups}個`,
  );
  log.debug(
    "┌─────────────────────────────────────────────────────────────────────────────────────┐",
  );
  log.debug(
    "│ グループ │ タイプ     │ 状態       │ セル範囲      │ 処理済み │ 未処理 │ 備考        │",
  );
  log.debug(
    "├─────────────────────────────────────────────────────────────────────────────────────┤",
  );

  groupResults.forEach((result) => {
    const group = `グループ${result.groupNumber}`.padEnd(8);
    const type = (result.type || "").substring(0, 8).padEnd(8);
    const status = {
      active: "✅ 処理対象",
      skipped: "⏭️ スキップ",
      "already-skipped": "🔒 除外済み",
      special: "🔹 特殊",
      error: "❌ エラー",
    }[result.status].padEnd(10);
    const cellRange = (result.cellRange || "").substring(0, 12).padEnd(12);
    const processed = String(result.processedCount).padStart(6);
    const unprocessed = String(result.unprocessedCount).padStart(6);
    const note = (result.skipReason || result.error || "").substring(0, 12);

    log.debug(
      `│ ${group} │ ${type} │ ${status} │ ${cellRange} │ ${processed} │ ${unprocessed} │ ${note} │`,
    );
  });

  log.debug(
    "└─────────────────────────────────────────────────────────────────────────────────────┘",
  );
  log.debug(
    `[step2-taskgroup.js] [Step 2-3] ✅ 判定完了: チェック${checkedGroups}個, データによるスキップ${skippedByData}個`,
  );
}

// ========================================
// 2-4. タスクグループの順番整理
// ========================================
function reorganizeTaskGroups() {
  log.debug("========");
  log.debug("[step2-taskgroup.js→Step2-4] タスクグループの順番整理");
  log.debug("========");

  const taskGroups = window.globalState.taskGroups;

  // 2-4-1. 有効なタスクグループの番号振り直し
  log.debug("[step2-taskgroup.js] [Step 2-4-1] 有効グループの番号振り直し開始");
  const activeGroups = taskGroups.filter((group) => !group.skip);
  const skippedGroups = taskGroups.filter((group) => group.skip);

  log.debug(`  - 元のグループ数: ${taskGroups.length}`);
  log.debug(`  - スキップグループ: ${skippedGroups.length}`);
  log.debug(`  - 有効グループ: ${activeGroups.length}`);

  let renumberCount = 0;
  activeGroups.forEach((group, index) => {
    const oldNumber = group.groupNumber;
    group.groupNumber = index + 1;
    if (oldNumber !== group.groupNumber) {
      renumberCount++;
      log.debug(
        `  - グループ番号変更: ${oldNumber} → ${group.groupNumber} (${group.type})`,
      );
    }
  });

  if (renumberCount === 0) {
    log.debug("  - 番号変更なし（連続したグループ）");
  }

  log.debug(
    `[step2-taskgroup.js] [Step 2-4] ✅ 順番整理完了: ${activeGroups.length}個の有効グループ`,
  );
  return activeGroups;
}

// ========================================
// 2-5. タスクグループ情報の記録とログ出力
// ========================================
async function logTaskGroups() {
  log.debug("========");
  log.debug("2-5. タスクグループ情報の調査開始");
  log.debug("========");

  // globalStateから最新のデータを取得
  const spreadsheetId = window.globalState.spreadsheetId;
  const specialRows = window.globalState.specialRows;
  const apiHeaders = window.globalState.apiHeaders;
  const sheetsApiBase = window.globalState.sheetsApiBase;
  const { modelRow, menuRow } = specialRows;
  const taskGroups = window.globalState.taskGroups.filter((g) => !g.skip);

  // モデル行とメニュー行を取得（キャッシュから）
  let modelValues = [];
  let menuValues = [];

  try {
    // キャッシュの確認
    if (!window.globalState.initialSheetData) {
      throw new Error("初期データキャッシュが見つかりません");
    }

    // モデル行・メニュー行取得

    if (modelRow) {
      modelValues = window.globalState.initialSheetData[modelRow - 1] || [];
    }

    menuValues = window.globalState.initialSheetData[menuRow - 1] || [];
  } catch (error) {
    log.error("行データ取得エラー:", error);
  }

  // globalStateの必要なプロパティを初期化
  if (!window.globalState.taskTypeMap) {
    window.globalState.taskTypeMap = {};
  }
  if (!window.globalState.workColumnMap) {
    window.globalState.workColumnMap = {};
  }

  // 結果を格納する配列
  const logOutputs = [];

  // 2-5-1. タスクタイプの決定と2-5-3. ログ出力
  taskGroups.forEach((group) => {
    let taskType = group.type;

    // タスクタイプをより詳細に設定
    if (group.type === "通常処理" || group.type === "3種類AI") {
      const modelText = modelValues[group.startCol] || "";
      if (modelText) {
        taskType = modelText;
      }
    }

    // 2-5-2. タスクグループ情報の構造化
    const structuredInfo = {
      groupNumber: group.groupNumber,
      taskType: taskType,
      columns: {},
    };

    if (group.type === "通常処理") {
      structuredInfo.columns = {
        log: group.logColumn,
        prompts: group.promptColumns,
        answer: group.answerColumn,
      };
    } else if (group.type === "3種類AI") {
      structuredInfo.columns = {
        log: group.logColumn,
        prompts: group.promptColumns,
        answer: {
          chatgpt: group.chatgptColumn,
          claude: group.claudeColumn,
          gemini: group.geminiColumn,
        },
      };
    } else {
      structuredInfo.columns = {
        column: group.column,
      };
    }

    // taskTypeMapとworkColumnMapを更新
    window.globalState.taskTypeMap[group.groupNumber] = taskType;
    window.globalState.workColumnMap[group.groupNumber] =
      structuredInfo.columns;

    // ログ出力内容を配列に追加
    let logOutput = [];
    logOutput.push("＝＝＝＝＝＝＝＝");
    logOutput.push(`タスクグループ${group.groupNumber}`);
    logOutput.push(`タスク: ${taskType}`);

    if (group.type === "通常処理") {
      logOutput.push(`ログ: ${group.logColumn}`);
      logOutput.push(`プロンプト: ${group.promptColumns.join("~")}`);
      logOutput.push(`回答: ${group.answerColumn}`);
    } else if (group.type === "3種類AI") {
      logOutput.push(`ログ: ${group.logColumn}`);
      logOutput.push(`プロンプト: ${group.promptColumns.join("~")}`);
      logOutput.push(`ChatGPT回答: ${group.chatgptColumn}`);
      logOutput.push(`Claude回答: ${group.claudeColumn}`);
      logOutput.push(`Gemini回答: ${group.geminiColumn}`);
    } else {
      logOutput.push(`作業列: ${group.column}`);
    }
    logOutput.push("＝＝＝＝＝＝＝＝");

    logOutputs.push(logOutput);
  });

  // タスクグループ情報をまとめて出力
  const activeGroupsCount = window.globalState.taskGroups.filter(
    (g) => !g.skip,
  ).length;
  const totalGroupsCount = window.globalState.taskGroups.length;
  const skipCount = totalGroupsCount - activeGroupsCount;

  log.info(
    `📋 タスクグループ解析完了: ${activeGroupsCount}個 (スキップ: ${skipCount}個)`,
  );

  // 各グループのタイプ別集計
  const typeCounts = {};
  window.globalState.taskGroups
    .filter((g) => !g.skip)
    .forEach((group) => {
      const taskType =
        group.type === "通常処理"
          ? "通常処理"
          : group.type === "3種類AI"
            ? "3種類AI"
            : "レポート化";
      typeCounts[taskType] = (typeCounts[taskType] || 0) + 1;
    });

  const typeStr = Object.entries(typeCounts)
    .map(([type, count]) => `${type}:${count}`)
    .join(", ");
  log.info(`📊 タスクタイプ: ${typeStr}`);
}

// ========================================
// 2-6. 定義の作成と保存
// ========================================
function saveDefinitions() {
  const activeGroups = window.globalState.taskGroups.filter((g) => !g.skip);

  // 必要最小限のデータのみ抽出（大きなデータを除外）
  const minimalData = {
    taskGroups: window.globalState.taskGroups,
    setupResult: window.globalState.setupResult,
    spreadsheetId: window.globalState.spreadsheetId,
    gid: window.globalState.gid,
    taskTypeMap: window.globalState.taskTypeMap,
    workColumnMap: window.globalState.workColumnMap,
    specialRowsFound: window.globalState.specialRowsFound,
  };

  // Chrome Extension APIのstorage.localを使用（容量制限が100MB）
  if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
    chrome.storage.local.set({ step2Result: minimalData }, () => {
      if (chrome.runtime.lastError) {
        log.error("Chrome storage保存エラー:", chrome.runtime.lastError);
        // フォールバック: セッションストレージに保存
        try {
          sessionStorage.setItem("step2Result", JSON.stringify(minimalData));
          log.info("✅ タスクグループ定義をセッションストレージに保存");
        } catch (e) {
          log.error("セッションストレージ保存エラー:", e);
        }
      } else {
        log.info("✅ タスクグループ定義の保存完了");
      }
    });
  } else {
    // Chrome Extension APIが使えない場合はセッションストレージを使用
    try {
      sessionStorage.setItem("step2Result", JSON.stringify(minimalData));
      log.info("✅ タスクグループ定義をセッションストレージに保存");
    } catch (e) {
      log.error("セッションストレージ保存エラー:", e);
    }
  }

  return window.globalState;
}

// ========================================
// ユーティリティ関数
// ========================================
function columnToLetter(index) {
  let letter = "";
  while (index >= 0) {
    letter = String.fromCharCode((index % 26) + 65) + letter;
    index = Math.floor(index / 26) - 1;
  }
  return letter;
}

function findGroupByColumn(column) {
  const taskGroups = window.globalState.taskGroups;
  for (const group of taskGroups) {
    const colIndex = letterToColumn(column);
    if (colIndex >= group.startCol && colIndex <= group.endCol) {
      return group.groupNumber;
    }
  }
  return null;
}

function letterToColumn(letter) {
  let column = 0;
  for (let i = 0; i < letter.length; i++) {
    column = column * 26 + (letter.charCodeAt(i) - 64);
  }
  return column - 1; // 0-based index
}

// ========================================
// メイン実行関数
// ========================================
async function executeStep2TaskGroups() {
  log.debug("[step2-taskgroup.js] ステップ2: タスクグループ作成 開始");

  try {
    // 2-0: スプレッドシート情報取得
    extractSpreadsheetInfo();

    // 2-1: タスクグループ識別
    await identifyTaskGroups();

    // 2-2: 列制御適用
    await applyColumnControls();

    // 2-3: スキップ判定
    await applySkipConditions();

    // 2-4: 順番整理
    reorganizeTaskGroups();

    // 2-5: ログ出力
    await logTaskGroups();

    // 2-6: 定義保存
    saveDefinitions();

    log.debug("[step2-taskgroup.js] ✅ ステップ2: タスクグループ作成 完了");

    // taskGroupsをstep5が使える形式でglobalStateに保存
    if (!window.globalState.taskGroups) {
      window.globalState.taskGroups = [];
    }

    // 処理対象のtaskGroupsのみをglobalStateに保存
    // taskGroupsは内部で作成されているため、globalStateから一時的に取得
    const allTaskGroups = window.globalState.allTaskGroups || [];
    window.globalState.taskGroups = allTaskGroups.filter(
      (group) => !group.skip,
    );

    // データ検証関数（自己完結型）
    function validateTaskGroup(group, groupIndex = null) {
      const errors = [];

      if (!group) {
        log.error(
          `[step2-taskgroup.js] [Step 2-6-1-1] グループ${groupIndex ? groupIndex : ""}が未定義`,
        );
        errors.push("グループが未定義");
        return errors;
      }

      if (!group.columns) {
        log.error(
          `[step2-taskgroup.js] [Step 2-6-1-2] グループ${groupIndex ? groupIndex : ""}のcolumns構造が未定義`,
        );
        errors.push("columns構造が未定義");
      } else {
        if (
          !group.columns.prompts ||
          !Array.isArray(group.columns.prompts) ||
          group.columns.prompts.length === 0
        ) {
          log.error(
            `[step2-taskgroup.js] [Step 2-6-1-3] グループ${groupIndex ? groupIndex : ""}のprompts列が未定義または空`,
          );
          errors.push("prompts列が未定義または空");
        }
        if (
          !group.columns.answer ||
          (typeof group.columns.answer === "object" &&
            Object.keys(group.columns.answer).length === 0)
        ) {
          log.error(
            `[step2-taskgroup.js] [Step 2-6-1-4] グループ${groupIndex ? groupIndex : ""}のanswer列が未定義または空`,
          );
          errors.push("answer列が未定義または空");
        }
      }

      if (!group.groupType && !group.type) {
        log.error(
          `[step2-taskgroup.js] [Step 2-6-1-5] グループ${groupIndex ? groupIndex : ""}のgroupTypeまたはtypeが未定義`,
        );
        errors.push("groupTypeまたはtypeが未定義");
      }

      return errors;
    }

    // 統一データ構造の実装（修正版・検証付き）
    log.debug(
      `[step2-taskgroup.js] [Step 2-6-1] タスクグループデータ検証開始 (${window.globalState.taskGroups.length}個のグループ)`,
    );

    let totalValidationErrors = 0;
    window.globalState.taskGroups.forEach((group, index) => {
      // dataStartRowを設定（step1で取得した情報を使用）
      group.dataStartRow = window.globalState.specialRows?.dataStartRow || 9;

      // 【シンプル化】列情報のみを設定（セル位置計算は実行時に行う）
      let answerColumns;
      if (group.groupType === "3種類AI" || group.type === "3種類AI") {
        // 3種類AIの場合
        answerColumns = {
          chatgpt: group.chatgptColumn || "C",
          claude: group.claudeColumn || "D",
          gemini: group.geminiColumn || "E",
        };
      } else {
        // 通常処理の場合
        const primaryColumn =
          group.answerColumn ||
          (group.answerColumns && group.answerColumns.length > 0
            ? group.answerColumns[0].column
            : "C");
        answerColumns = {
          primary: primaryColumn,
        };
      }

      // シンプルなcolumns構造（列名のみ）
      group.columns = {
        log: group.logColumn || group.startColumn || "A",
        prompts: group.promptColumns || ["B"],
        answer: answerColumns,
        work: group.workColumn || null,
      };

      // groupTypeが未設定の場合、typeから設定
      if (!group.groupType) {
        group.groupType = group.type || "通常処理";
      }

      // 旧フィールドは保持（後方互換性確保）
      // delete文をコメントアウトして安全性を確保
      // delete group.logColumn;
      // delete group.promptColumns;
      // delete group.answerColumn;
      // delete group.workColumn;
      // delete group.type;

      // 必要に応じて他の情報も補完
      if (!group.spreadsheetId) {
        group.spreadsheetId = window.globalState.spreadsheetId;
      }
      if (!group.apiHeaders) {
        group.apiHeaders = window.globalState.apiHeaders;
      }
      if (!group.sheetsApiBase) {
        group.sheetsApiBase = window.globalState.sheetsApiBase;
      }

      // データ検証実行
      const validationErrors = validateTaskGroup(group, group.groupNumber);
      if (validationErrors.length > 0) {
        log.warn(
          `[step2-taskgroup.js] グループ${group.groupNumber}の検証エラー:`,
          validationErrors,
        );
        // エラーがあってもスキップ設定で処理を継続
        group.hasValidationErrors = true;
        group.validationErrors = validationErrors;
        totalValidationErrors += validationErrors.length;
      }
    });

    // 検証結果サマリー
    log.debug(
      `[step2-taskgroup.js] [Step 2-6-1-6] 検証完了: ${totalValidationErrors}個のエラー (${window.globalState.taskGroups.length}個のグループを検証)`,
    );

    // 統合ログ出力 - タスクグループ最終結果のみ
    const totalGroups = window.globalState.allTaskGroups?.length || 0;
    const activeGroups = window.globalState.taskGroups.length;
    const skippedGroups = (
      window.globalState.allTaskGroups?.filter((g) => g.skip) || []
    ).length;

    log.debug("========");
    log.debug(
      `[step2-taskgroup.js] 🗂️ タスクグループ最終結果: 全${totalGroups}個 | 有効${activeGroups}個 | スキップ${skippedGroups}個`,
    );
    log.debug("========");

    return window.globalState;
  } catch (error) {
    log.error("[step2-taskgroup.js] ❌ ステップ2 エラー:", error);
    throw error;
  }
}

// エクスポート（モジュールとして使用する場合）
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    executeStep2TaskGroups,
    extractSpreadsheetInfo,
    identifyTaskGroups,
    applyColumnControls,
    applySkipConditions,
    reorganizeTaskGroups,
    logTaskGroups,
    saveDefinitions,
  };
}

// グローバル関数として公開（ブラウザ環境用）
if (typeof window !== "undefined") {
  window.executeStep2TaskGroups = executeStep2TaskGroups;
  window.executeStep2 = executeStep2TaskGroups; // step0-ui-controller.jsとの互換性のため
  window.extractSpreadsheetInfo = extractSpreadsheetInfo;
  window.identifyTaskGroups = identifyTaskGroups;
  window.applyColumnControls = applyColumnControls;
  window.applySkipConditions = applySkipConditions;
  window.reorganizeTaskGroups = reorganizeTaskGroups;
  window.logTaskGroups = logTaskGroups;
  window.saveDefinitions = saveDefinitions;
}

// 自動実行を無効化（STEP専用ボタンから手動で実行するため）
// 元の自動実行コード:
/*
if (typeof window !== 'undefined' && !window.step2Executed) {
  window.step2Executed = true;

  // ステップ1の完了を待つ
  const waitForStep1 = () => {
    if (window.setupResult || localStorage.getItem('step1Result')) {
      executeStep2TaskGroups();
    } else {
      log.debug('ステップ1の完了待機中...');
      setTimeout(waitForStep1, 1000);
    }
  };

  // DOMContentLoadedを待つ
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', waitForStep1);
  } else {
    waitForStep1();
  }
}
*/

log.debug("[step2-taskgroup.js] ✅ Step2関数定義完了（自動実行無効）");
