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
  console.log("========");
  console.log("[step2-taskgroup.js→Step2-0] スプレッドシート情報の取得");
  console.log("========");

  // 2-0-1. globalStateまたはURLからIDを取得
  let spreadsheetId = null;
  let gid = "0";

  // 方法1: globalStateから取得（STEP専用ボタンで設定済み）
  if (window.globalState && window.globalState.spreadsheetId) {
    spreadsheetId = window.globalState.spreadsheetId;
    gid = window.globalState.gid || "0";
    console.log(`[step2-taskgroup.js] [Step 2-0-1] ✅ globalStateから取得:`);
    console.log(`  - スプレッドシートID: ${spreadsheetId}`);
    console.log(`  - GID: ${gid}`);
  } else {
    // 方法2: URLから解析（元の方法）
    const url = window.location.href;
    console.log(`[step2-taskgroup.js] [Step 2-0-1] 現在のURL: ${url}`);

    const spreadsheetIdMatch = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    const gidMatch = url.match(/#gid=([0-9]+)/);

    console.log("[step2-taskgroup.js] [Step 2-0-1] URLパターンマッチング結果:");
    console.log(
      `  - スプレッドシートIDマッチ: ${spreadsheetIdMatch ? "成功" : "失敗"}`,
    );
    console.log(`  - GIDマッチ: ${gidMatch ? "成功" : "失敗"}`);

    spreadsheetId = spreadsheetIdMatch ? spreadsheetIdMatch[1] : null;
    gid = gidMatch ? gidMatch[1] : "0";
  }

  // 2-0-2. 取得した情報の保存・更新
  console.log("[step2-taskgroup.js] [Step 2-0-2] 抽出情報を保存");
  window.globalState.spreadsheetId = spreadsheetId;
  window.globalState.gid = gid;

  console.log(`  - スプレッドシートID: ${spreadsheetId}`);
  console.log(`  - GID: ${gid}`);
  console.log(
    `  - シート名: ${gid === "0" ? "デフォルトシート" : `シート${gid}`}`,
  );

  if (!spreadsheetId) {
    console.error(
      "[step2-taskgroup.js] [Step 2-0-2] ⚠️ スプレッドシートIDが取得できませんでした",
    );
    console.error("  - 原因: URLが正しいGoogleスプレッドシートではない可能性");
    console.error(
      "  - Chrome Extension環境ではUIコントローラーでglobalStateに設定してください",
    );
  }

  return { spreadsheetId, gid };
}

// ========================================
// 2-1. タスクグループの識別と作成
// ========================================
async function identifyTaskGroups() {
  console.log("========");
  console.log("[step2-taskgroup.js→Step2-1] タスクグループの識別開始");
  console.log("========");

  // globalStateまたは従来の方法でステップ1の結果を取得
  let setupResult = null;

  if (window.globalState && window.globalState.spreadsheetId) {
    // STEP専用ボタン用：globalStateから構築
    setupResult = {
      spreadsheetId: window.globalState.spreadsheetId,
      specialRows: window.globalState.specialRows || {},
      apiHeaders: {
        Authorization: `Bearer ${window.globalState.authToken}`,
        "Content-Type": "application/json",
      },
      sheetsApiBase: "https://sheets.googleapis.com/v4/spreadsheets",
    };
    console.log(
      "[step2-taskgroup.js] [Step 2-1] ✅ globalStateからsetupResultを構築",
    );
  } else {
    // 従来の方法
    setupResult =
      window.setupResult ||
      JSON.parse(localStorage.getItem("step1Result") || "null");
  }

  if (!setupResult) {
    console.error(
      "[step2-taskgroup.js] [Step 2-1] ❌ ステップ1の結果が取得できません",
    );
    console.error("  - window.globalState: ", window.globalState);
    console.error("  - window.setupResult: ", window.setupResult);
    console.error(
      "  - localStorage.step1Result: ",
      localStorage.getItem("step1Result") ? "あり" : "なし",
    );
    throw new Error("ステップ1の結果が見つかりません");
  }

  const { spreadsheetId, specialRows, apiHeaders, sheetsApiBase } = setupResult;
  const { menuRow, aiRow } = specialRows;

  // 2-1-1. メニュー行とAI行の読み込み
  console.log(
    "[step2-taskgroup.js] [Step 2-1-1] メニュー行とAI行の読み込み開始",
  );
  console.log(`  - メニュー行: ${menuRow}行目`);
  console.log(`  - AI行: ${aiRow}行目`);

  const menuRange = `${menuRow}:${menuRow}`; // メニュー行全体
  const aiRange = `${aiRow}:${aiRow}`; // AI行全体

  try {
    // キャッシュの確認
    if (!window.globalState.initialSheetData) {
      throw new Error("初期データキャッシュが見つかりません");
    }

    // キャッシュからメニュー行・AI行取得
    console.log(
      "[step2-taskgroup.js] [Step 2-1-1] ✅ キャッシュからデータ取得",
    );
    const menuValues = window.globalState.initialSheetData[menuRow - 1] || [];
    const aiValues = window.globalState.initialSheetData[aiRow - 1] || [];

    console.log(`[step2-taskgroup.js] [Step 2-1-1] 取得データ概要:`);
    console.log(`  - メニュー行列数: ${menuValues.length}`);
    console.log(`  - AI行列数: ${aiValues.length}`);
    console.log(`  - メニュー行先頭5列: ${menuValues.slice(0, 5).join(", ")}`);
    console.log(`  - AI行先頭5列: ${aiValues.slice(0, 5).join(", ")}`);

    // 2-1-2. 列の走査とパターン認識（stream-processor-v2.jsのロジックを採用）
    console.log("[step2-taskgroup.js] [Step 2-1-2] 列の走査とパターン認識開始");
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
    console.error(
      "[step2-taskgroup.js] [Step 2-1] ❌ タスクグループ識別エラー詳細:",
    );
    console.error(`  - エラー名: ${error.name}`);
    console.error(`  - メッセージ: ${error.message}`);
    console.error(`  - スタック: ${error.stack}`);
    throw error;
  }
}

// ========================================
// 2-2. 列制御の適用
// ========================================
async function applyColumnControls() {
  console.log("========");
  console.log("[step2-taskgroup.js→Step2-2] 列制御の適用");
  console.log("========");

  const setupResult =
    window.setupResult || JSON.parse(localStorage.getItem("step1Result"));
  const { spreadsheetId, specialRows, apiHeaders, sheetsApiBase } = setupResult;
  const { controlRow } = specialRows;

  if (!controlRow) {
    console.log(
      "[step2-taskgroup.js] [Step 2-2] 列制御行が定義されていません - 列制御処理をスキップ",
    );
    return;
  }

  console.log(`[step2-taskgroup.js] [Step 2-2] 列制御行: ${controlRow}行目`);

  // 2-2-1. 列制御行の全列を読み込み（キャッシュから）
  console.log(
    `[step2-taskgroup.js] [Step 2-2-1] 列制御行データ取得: ${controlRow}行目`,
  );

  try {
    // キャッシュの確認
    if (!window.globalState.initialSheetData) {
      throw new Error("初期データキャッシュが見つかりません");
    }

    // キャッシュから列制御行取得
    console.log(
      "[step2-taskgroup.js] [Step 2-2-1] ✅ キャッシュから列制御行取得",
    );
    const controlValues =
      window.globalState.initialSheetData[controlRow - 1] || [];

    console.log(
      `[step2-taskgroup.js] [Step 2-2-1] 取得データ: ${controlValues.length}列`,
    );
    console.log(`  - 有効な制御: ${controlValues.filter((v) => v).length}個`);

    // 2-2-2. 列制御テキストの検出と処理
    console.log("[step2-taskgroup.js] [Step 2-2-2] 列制御テキストの検出開始");
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

      console.log(`  [${column}] 制御テキスト: "${text}"`);

      // 2-2-2-1. 「この列から処理」の検出
      if (text.includes("この列から処理")) {
        controls.startFrom = groupIndex;
        controlCount++;
        console.log(
          `[step2-taskgroup.js] [Step 2-2-2-1] ✅ 「この列から処理」検出: ${column}列 (グループ${groupIndex})`,
        );
      }

      // 2-2-2-2. 「この列の処理後に停止」の検出
      if (text.includes("この列の処理後に停止")) {
        controls.stopAfter = groupIndex;
        controlCount++;
        console.log(
          `[step2-taskgroup.js] [Step 2-2-2-2] ✅ 「この列の処理後に停止」検出: ${column}列 (グループ${groupIndex})`,
        );
      }

      // 2-2-2-3. 「この列のみ処理」の検出
      if (text.includes("この列のみ処理")) {
        controls.onlyProcess.push(groupIndex);
        controlCount++;
        console.log(
          `[step2-taskgroup.js] [Step 2-2-2-3] ✅ 「この列のみ処理」検出: ${column}列 (グループ${groupIndex})`,
        );
      }
    });

    console.log(
      `[step2-taskgroup.js] [Step 2-2-2] 列制御検出完了: ${controlCount}個の制御を検出`,
    );

    // 2-2-3. 複数の列制御がある場合の処理
    console.log("[step2-taskgroup.js] [Step 2-2-3] 列制御の適用開始");
    const taskGroups = window.globalState.taskGroups;
    let skipCount = 0;

    if (controls.onlyProcess.length > 0) {
      // 「この列のみ処理」が優先
      console.log(
        `[step2-taskgroup.js] [Step 2-2-3] 「この列のみ処理」モード: グループ${controls.onlyProcess.join(", ")}のみ処理`,
      );

      taskGroups.forEach((group, index) => {
        if (!controls.onlyProcess.includes(index + 1)) {
          group.skip = true;
          skipCount++;
          console.log(`  - グループ${group.groupNumber}をスキップ設定`);
        }
      });
    } else {
      // 範囲制御の適用
      if (controls.startFrom) {
        console.log(
          `[step2-taskgroup.js] [Step 2-2-3] 開始位置制御: グループ${controls.startFrom}から開始`,
        );
        taskGroups.forEach((group) => {
          if (group.groupNumber < controls.startFrom) {
            group.skip = true;
            skipCount++;
            console.log(`  - グループ${group.groupNumber}をスキップ（開始前）`);
          }
        });
      }

      if (controls.stopAfter) {
        console.log(
          `[step2-taskgroup.js] [Step 2-2-3] 終了位置制御: グループ${controls.stopAfter}で停止`,
        );
        taskGroups.forEach((group) => {
          if (group.groupNumber > controls.stopAfter) {
            group.skip = true;
            skipCount++;
            console.log(`  - グループ${group.groupNumber}をスキップ（終了後）`);
          }
        });
      }
    }

    console.log(
      `[step2-taskgroup.js] [Step 2-2-3] 列制御適用完了: ${skipCount}個のグループをスキップ設定`,
    );

    window.globalState.columnControls = controls;
  } catch (error) {
    console.error("[step2-taskgroup.js] [Step 2-2] ❌ 列制御適用エラー詳細:");
    console.error(`  - エラー名: ${error.name}`);
    console.error(`  - メッセージ: ${error.message}`);
    console.error("  - 注: 列制御エラーでも処理は継続します");
    // エラーでも処理を続行
  }
}

// ========================================
// 2-3. タスクグループのスキップ判定
// ========================================
async function applySkipConditions() {
  console.log("========");
  console.log("[step2-taskgroup.js→Step2-3] スキップ判定の適用");
  console.log("========");

  const setupResult =
    window.setupResult || JSON.parse(localStorage.getItem("step1Result"));
  const { spreadsheetId, specialRows, sheetsApiBase } = setupResult;
  const { dataStartRow } = specialRows;
  const taskGroups = window.globalState.taskGroups;

  // 現在のトークンで最新のAPIヘッダーを作成
  const currentToken = window.globalState.authToken;
  const apiHeaders = {
    Authorization: `Bearer ${currentToken}`,
    "Content-Type": "application/json",
  };

  // デバッグ情報を出力
  console.log(`[step2-taskgroup.js] デバッグ情報:`);
  console.log(`  - spreadsheetId: ${spreadsheetId}`);
  console.log(`  - dataStartRow: ${dataStartRow}`);
  console.log(
    `  - taskGroups数: ${taskGroups ? taskGroups.length : "undefined"}`,
  );
  console.log(`  - authToken存在: ${!!currentToken}`);
  console.log(
    `  - fetchWithTokenRefresh存在: ${!!window.fetchWithTokenRefresh}`,
  );

  if (currentToken) {
    console.log(`  - authToken長: ${currentToken.length}文字`);
    console.log(`  - authToken先頭: ${currentToken.substring(0, 20)}...`);
  }

  console.log(`  - 作成したapiHeaders:`, apiHeaders);

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
    };

    if (group.skip) {
      result.status = "already-skipped";
      result.skipReason = "列制御によりスキップ設定済み";
      groupResults.push(result);
      continue;
    }

    checkedGroups++;

    console.log(`[step2-taskgroup.js] グループ${group.groupNumber}処理開始:`);
    console.log(`  - タイプ: ${group.type}`);
    console.log(
      `  - プロンプト列: ${group.promptColumns ? group.promptColumns.join(",") : "なし"}`,
    );
    console.log(
      `  - 回答列: ${group.answerColumn || group.chatgptColumn || "なし"}`,
    );

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

        // プロンプト列の取得
        const promptRange = `${promptCol}${dataStartRow}:${promptCol}${endRow}`;
        const promptUrl = `${sheetsApiBase}/${spreadsheetId}/values/${promptRange}`;

        // プロンプト列取得

        const promptResponse = await window.fetchWithTokenRefresh(promptUrl, {
          headers: apiHeaders,
        });
        const promptData = await promptResponse.json();
        const promptValues = promptData.values || [];

        // プロンプト取得完了: ${promptValues.length}行

        // 回答列の取得
        const answerRange = `${answerCol}${dataStartRow}:${answerCol}${endRow}`;
        const answerUrl = `${sheetsApiBase}/${spreadsheetId}/values/${answerRange}`;

        // 回答列取得

        const answerResponse = await window.fetchWithTokenRefresh(answerUrl, {
          headers: apiHeaders,
        });
        const answerData = await answerResponse.json();
        const answerValues = answerData.values || [];

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
      }
    } catch (error) {
      result.status = "error";
      result.error = error.message;
      // エラーの場合はスキップしない（安全のため処理対象として扱う）
    }

    groupResults.push(result);
  }

  // 統合ログ出力
  console.log("[step2-taskgroup.js] [Step 2-3] 📊 スキップ判定結果サマリー:");
  console.log(
    "┌─────────────────────────────────────────────────────────────┐",
  );
  console.log(
    "│ グループ │ タイプ     │ 状態       │ 処理済み │ 未処理 │ 備考        │",
  );
  console.log(
    "├─────────────────────────────────────────────────────────────┤",
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
    const processed = String(result.processedCount).padStart(6);
    const unprocessed = String(result.unprocessedCount).padStart(6);
    const note = (result.skipReason || result.error || "").substring(0, 12);

    console.log(
      `│ ${group} │ ${type} │ ${status} │ ${processed} │ ${unprocessed} │ ${note} │`,
    );
  });

  console.log(
    "└─────────────────────────────────────────────────────────────┘",
  );
  console.log(
    `[step2-taskgroup.js] [Step 2-3] ✅ 判定完了: チェック${checkedGroups}個, データによるスキップ${skippedByData}個`,
  );
}

// ========================================
// 2-4. タスクグループの順番整理
// ========================================
function reorganizeTaskGroups() {
  console.log("========");
  console.log("[step2-taskgroup.js→Step2-4] タスクグループの順番整理");
  console.log("========");

  const taskGroups = window.globalState.taskGroups;

  // 2-4-1. 有効なタスクグループの番号振り直し
  console.log(
    "[step2-taskgroup.js] [Step 2-4-1] 有効グループの番号振り直し開始",
  );
  const activeGroups = taskGroups.filter((group) => !group.skip);
  const skippedGroups = taskGroups.filter((group) => group.skip);

  console.log(`  - 元のグループ数: ${taskGroups.length}`);
  console.log(`  - スキップグループ: ${skippedGroups.length}`);
  console.log(`  - 有効グループ: ${activeGroups.length}`);

  let renumberCount = 0;
  activeGroups.forEach((group, index) => {
    const oldNumber = group.groupNumber;
    group.groupNumber = index + 1;
    if (oldNumber !== group.groupNumber) {
      renumberCount++;
      console.log(
        `  - グループ番号変更: ${oldNumber} → ${group.groupNumber} (${group.type})`,
      );
    }
  });

  if (renumberCount === 0) {
    console.log("  - 番号変更なし（連続したグループ）");
  }

  console.log(
    `[step2-taskgroup.js] [Step 2-4] ✅ 順番整理完了: ${activeGroups.length}個の有効グループ`,
  );
  return activeGroups;
}

// ========================================
// 2-5. タスクグループ情報の記録とログ出力
// ========================================
async function logTaskGroups() {
  console.log("========");
  console.log("2-5. タスクグループ情報のログ出力");
  console.log("========");

  const setupResult =
    window.setupResult || JSON.parse(localStorage.getItem("step1Result"));
  const { spreadsheetId, specialRows, apiHeaders, sheetsApiBase } = setupResult;
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

    console.log(
      "[step2-taskgroup.js] [Step 2-5] ✅ キャッシュからモデル行・メニュー行取得",
    );

    if (modelRow) {
      modelValues = window.globalState.initialSheetData[modelRow - 1] || [];
    }

    menuValues = window.globalState.initialSheetData[menuRow - 1] || [];

    console.log(`  - モデル行: ${modelValues.length}列`);
    console.log(`  - メニュー行: ${menuValues.length}列`);
  } catch (error) {
    console.error("キャッシュからの行データ取得エラー:", error);
  }

  // globalStateの必要なプロパティを初期化
  if (!window.globalState.taskTypeMap) {
    window.globalState.taskTypeMap = {};
  }
  if (!window.globalState.workColumnMap) {
    window.globalState.workColumnMap = {};
  }

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

    // ログ出力
    console.log("＝＝＝＝＝＝＝＝");
    console.log(`タスクグループ${group.groupNumber}`);
    console.log(`タスク: ${taskType}`);

    if (group.type === "通常処理") {
      console.log(`ログ: ${group.logColumn}`);
      console.log(`プロンプト: ${group.promptColumns.join("~")}`);
      console.log(`回答: ${group.answerColumn}`);
    } else if (group.type === "3種類AI") {
      console.log(`ログ: ${group.logColumn}`);
      console.log(`プロンプト: ${group.promptColumns.join("~")}`);
      console.log(`ChatGPT回答: ${group.chatgptColumn}`);
      console.log(`Claude回答: ${group.claudeColumn}`);
      console.log(`Gemini回答: ${group.geminiColumn}`);
    } else {
      console.log(`作業列: ${group.column}`);
    }
    console.log("＝＝＝＝＝＝＝＝");
  });
}

// ========================================
// 2-6. 定義の作成と保存
// ========================================
function saveDefinitions() {
  console.log("========");
  console.log("2-6. 定義の作成と保存");
  console.log("========");

  const activeGroups = window.globalState.taskGroups.filter((g) => !g.skip);

  // 2-6-1. タスクグループ配列の作成（既に完了）
  console.log(`タスクグループ配列: ${activeGroups.length}個`);

  // 2-6-2. タスクタイプマップの作成（2-5で完了）
  console.log("タスクタイプマップ:", window.globalState.taskTypeMap);

  // 2-6-3. 作業列マップの作成（2-5で完了）
  console.log("作業列マップ:", window.globalState.workColumnMap);

  // localStorageに保存
  localStorage.setItem("step2Result", JSON.stringify(window.globalState));

  console.log("✅ 定義の保存完了");
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
  console.log("[step2-taskgroup.js] ステップ2: タスクグループ作成 開始");

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

    console.log("[step2-taskgroup.js] ✅ ステップ2: タスクグループ作成 完了");

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
    function validateTaskGroup(group) {
      console.log(
        "[step2-taskgroup.js] [Step 2-6-1] タスクグループデータ検証開始",
      );
      const errors = [];

      if (!group) {
        console.error("[step2-taskgroup.js] [Step 2-6-1-1] グループが未定義");
        errors.push("グループが未定義");
        return errors;
      }

      if (!group.columns) {
        console.error(
          "[step2-taskgroup.js] [Step 2-6-1-2] columns構造が未定義",
        );
        errors.push("columns構造が未定義");
      } else {
        if (
          !group.columns.prompts ||
          !Array.isArray(group.columns.prompts) ||
          group.columns.prompts.length === 0
        ) {
          console.error(
            "[step2-taskgroup.js] [Step 2-6-1-3] prompts列が未定義または空",
          );
          errors.push("prompts列が未定義または空");
        }
        if (
          !group.columns.answer ||
          (typeof group.columns.answer === "object" &&
            Object.keys(group.columns.answer).length === 0)
        ) {
          console.error(
            "[step2-taskgroup.js] [Step 2-6-1-4] answer列が未定義または空",
          );
          errors.push("answer列が未定義または空");
        }
      }

      if (!group.groupType && !group.type) {
        console.error(
          "[step2-taskgroup.js] [Step 2-6-1-5] groupTypeまたはtypeが未定義",
        );
        errors.push("groupTypeまたはtypeが未定義");
      }

      console.log(
        `[step2-taskgroup.js] [Step 2-6-1-6] 検証完了: ${errors.length}個のエラー`,
      );
      return errors;
    }

    // 統一データ構造の実装（修正版・検証付き）
    window.globalState.taskGroups.forEach((group) => {
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
        log: group.logColumn || "A",
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
      const validationErrors = validateTaskGroup(group);
      if (validationErrors.length > 0) {
        console.warn(
          `[step2-taskgroup.js] グループ${group.groupNumber}の検証エラー:`,
          validationErrors,
        );
        // エラーがあってもスキップ設定で処理を継続
        group.hasValidationErrors = true;
        group.validationErrors = validationErrors;
      }
    });

    // 統合ログ出力 - タスクグループ最終結果のみ
    const totalGroups = window.globalState.allTaskGroups?.length || 0;
    const activeGroups = window.globalState.taskGroups.length;
    const skippedGroups = (
      window.globalState.allTaskGroups?.filter((g) => g.skip) || []
    ).length;

    console.log("========");
    console.log("[step2-taskgroup.js] 📋 検出されたタスクグループサマリー:");
    window.globalState.taskGroups.forEach((group) => {
      const aiInfo = group.aiType || group.ai || "未設定";
      const promptInfo = group.columns?.prompts
        ? group.columns.prompts.join(",")
        : "なし";
      const answerInfo = group.columns?.answer || "なし";
      console.log(
        `  グループ${group.groupNumber}: ${group.groupType || group.type} | 範囲: ${group.startColumn}〜${group.endColumn}列 | AI: ${aiInfo} | プロンプト: ${promptInfo} | 回答: ${answerInfo}`,
      );
    });

    console.log(
      `[step2-taskgroup.js] 🗂️ タスクグループ最終結果: 全${totalGroups}個 | 有効${activeGroups}個 | スキップ${skippedGroups}個`,
    );
    console.log("========");

    return window.globalState;
  } catch (error) {
    console.error("[step2-taskgroup.js] ❌ ステップ2 エラー:", error);
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
      console.log('ステップ1の完了待機中...');
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

console.log("[step2-taskgroup.js] ✅ Step2関数定義完了（自動実行無効）");
