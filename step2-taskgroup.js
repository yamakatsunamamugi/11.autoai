/**
 * ========================================
 * step2-taskgroup.js - タスクグループ管理
 * ========================================
 *
 * 【実行フロー】
 *
 * [2-1] executeStep2TaskGroups() - タスクグループ作成
 *   ├─ [2-1-1] extractSpreadsheetInfo() - スプレッドシート情報取得
 *   ├─ [2-1-2] identifyTaskGroups() - タスクグループ識別
 *   ├─ [2-1-3] applyColumnControls() - 列制御適用
 *   ├─ [2-1-4] applySkipConditions() - スキップ条件適用
 *   ├─ [2-1-5] reorganizeTaskGroups() - グループ再編成
 *   ├─ [2-1-6] 最左の未完了グループ検索
 *   └─ [2-1-7] setCurrentGroup() → step4へ
 *
 * [2-2] checkCompletionStatus() ← step4から呼び出し
 *   ├─ [2-2-1] validateTaskGroupForStep5() - 検証
 *   ├─ [2-2-2] プロンプト数カウント
 *   ├─ [2-2-3] 回答数カウント
 *   └─ [2-2-4] 完了判定 → 完了ならstep2に戻る
 *
 * ========================================
 */

// ログレベル定義
const LOG_LEVEL = { ERROR: 1, WARN: 2, INFO: 3, DEBUG: 4 };

// Chrome Storageからログレベルを取得（非同期）
let CURRENT_LOG_LEVEL = LOG_LEVEL.WARN; // デフォルト値（簡潔な動作確認用）

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
// ========================================
// [2-1] メイン実行関数
// ========================================
async function executeStep2TaskGroups() {
  log.debug("[2-1][step2-taskgroup.js] ステップ2: タスクグループ作成 開始");

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

    log.debug(
      "[2-1][step2-taskgroup.js] ✅ ステップ2: タスクグループ作成 完了",
    );

    // ========================================
    // スキップ対象を除外してtaskGroupsを更新
    // ========================================
    // identifyTaskGroups()で既にenrichment済みなので、skipフィルタリングのみ実行
    const allTaskGroups = window.globalState.allTaskGroups || [];
    window.globalState.taskGroups = allTaskGroups.filter(
      (group) => !group.skip,
    );

    log.debug(
      `[2-1][step2-taskgroup.js] ✅ タスクグループフィルタリング完了: 有効${window.globalState.taskGroups.length}個`,
    );

    // 統合ログ出力 - タスクグループ最終結果のみ
    const totalGroups = window.globalState.allTaskGroups?.length || 0;
    const activeGroups = window.globalState.taskGroups.length;
    const skippedGroups = (
      window.globalState.allTaskGroups?.filter((g) => g.skip) || []
    ).length;

    log.debug("[2-1]========");
    log.debug(
      `[2-1][step2-taskgroup.js] 🗂️ タスクグループ最終結果: 全${totalGroups}個 | 有効${activeGroups}個 | スキップ${skippedGroups}個`,
    );
    log.debug("[2-1]========");

    // ========================================
    // 【統合】最も左の未完了グループを選択（旧step3の機能）
    // ========================================
    log.info("[2-1][step2-taskgroup.js] 🔍 最も左の未完了グループを検索中...");
    const allGroups = window.globalState?.allTaskGroups || [];
    let leftmostIncompleteGroup = null;

    for (const group of allGroups) {
      // スキップ設定されているグループは除外
      if (group.skip) {
        log.debug(
          `[2-1][step2-taskgroup.js] ⏭️ グループ${group.groupNumber}はスキップ設定済み`,
        );
        continue;
      }

      // 完了状況を確認（checkCompletionStatus関数を使用）
      try {
        if (window.checkCompletionStatus) {
          const isComplete = await window.checkCompletionStatus(group);
          if (!isComplete) {
            leftmostIncompleteGroup = group;
            log.info(
              `[2-1][step2-taskgroup.js] ✅ 未完了グループ発見: グループ${group.groupNumber}`,
            );
            break; // 最初の未完了グループ（最も左）を見つけたら終了
          } else {
            log.debug(
              `[2-1][step2-taskgroup.js] ⏭️ グループ${group.groupNumber}は完了済み`,
            );
          }
        } else {
          // checkCompletionStatusがない場合は未完了として扱う
          leftmostIncompleteGroup = group;
          log.warn(
            `[2-1][step2-taskgroup.js] ⚠️ checkCompletionStatus未定義 - グループ${group.groupNumber}を未完了として扱う`,
          );
          break;
        }
      } catch (error) {
        log.warn(
          `[2-1][step2-taskgroup.js] ⚠️ グループ${group.groupNumber}の完了チェックエラー:`,
          error.message,
        );
        // エラーの場合は未完了として扱う
        leftmostIncompleteGroup = group;
        break;
      }
    }

    // 未完了グループがなければ終了
    if (!leftmostIncompleteGroup) {
      log.info("[2-1]🎉 [step2-taskgroup.js] 全グループ完了 - 処理終了");
      return {
        success: true,
        hasNextGroup: false,
        message: "全グループ完了",
        globalState: window.globalState,
      };
    }

    // グループをglobalStateに設定
    log.info(
      `[2-1]📋 [step2-taskgroup.js] グループ${leftmostIncompleteGroup.groupNumber}を設定`,
    );
    log.debug(`[2-1]📋 グループ詳細:`, {
      番号: leftmostIncompleteGroup.groupNumber,
      タイプ: leftmostIncompleteGroup.taskType || leftmostIncompleteGroup.type,
      列範囲: `${leftmostIncompleteGroup.columns?.prompts?.[0]} 〜 ${leftmostIncompleteGroup.columns?.answer?.primary || leftmostIncompleteGroup.columns?.answer?.claude}`,
    });

    if (window.setCurrentGroup) {
      await window.setCurrentGroup(leftmostIncompleteGroup, "step2-taskgroup");
    } else {
      // フォールバック
      window.globalState.currentGroup = leftmostIncompleteGroup;
    }

    return {
      success: true,
      hasNextGroup: true,
      group: leftmostIncompleteGroup,
      groupNumber: leftmostIncompleteGroup.groupNumber,
      globalState: window.globalState,
    };
  } catch (error) {
    log.error("[2-1][step2-taskgroup.js] ❌ ステップ2 エラー:", error);
    throw error;
  }
}

// [2-1-1] スプレッドシート情報の取得
// ========================================
function extractSpreadsheetInfo() {
  log.debug("[2-1-1]========");
  log.debug("[2-1-1][step2-taskgroup.js→Step2-0] スプレッドシート情報の取得");
  log.debug("[2-1-1]========");

  // 2-0-1. globalStateまたはURLからIDを取得
  let spreadsheetId = null;
  let gid = "0";

  // 方法1: globalStateから取得（STEP専用ボタンで設定済み）
  if (window.globalState && window.globalState.spreadsheetId) {
    spreadsheetId = window.globalState.spreadsheetId;
    gid = window.globalState.gid || "0";
    log.debug(
      `[2-1-1][step2-taskgroup.js] [Step 2-0-1] ✅ globalStateから取得:`,
    );
    log.debug(`[2-1-1]  - スプレッドシートID: ${spreadsheetId}`);
    log.debug(`[2-1-1]  - GID: ${gid}`);
  } else {
    // 方法2: URLから解析（元の方法）
    const url = window.location.href;
    // 現在のURL確認

    const spreadsheetIdMatch = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    const gidMatch = url.match(/#gid=([0-9]+)/);

    // URLパターンマッチング
    log.debug(
      `[2-1-1]  - スプレッドシートIDマッチ: ${spreadsheetIdMatch ? "成功" : "失敗"}`,
    );
    log.debug(`[2-1-1]  - GIDマッチ: ${gidMatch ? "成功" : "失敗"}`);

    spreadsheetId = spreadsheetIdMatch ? spreadsheetIdMatch[1] : null;
    gid = gidMatch ? gidMatch[1] : "0";
  }

  // 2-0-2. 取得した情報の保存・更新
  // 抽出情報を保存
  window.globalState.spreadsheetId = spreadsheetId;
  window.globalState.gid = gid;

  log.debug(`[2-1-1]  - スプレッドシートID: ${spreadsheetId}`);
  log.debug(`[2-1-1]  - GID: ${gid}`);
  log.debug(
    `[2-1-1]  - シート名: ${gid === "0" ? "デフォルトシート" : `シート${gid}`}`,
  );

  if (!spreadsheetId) {
    log.error(
      "[2-1-1][step2-taskgroup.js] [Step 2-0-2] ⚠️ スプレッドシートIDが取得できませんでした",
    );
    log.error(
      "[2-1-1]  - 原因: URLが正しいGoogleスプレッドシートではない可能性",
    );
    log.error(
      "[2-1-1]  - Chrome Extension環境ではUIコントローラーでglobalStateに設定してください",
    );
  }

  return { spreadsheetId, gid };
}

// ========================================
// [2-1-2] タスクグループの識別と作成
// ========================================
async function identifyTaskGroups() {
  log.debug("[2-1-2]========");
  log.debug("[2-1-2][step2-taskgroup.js→Step2-1] タスクグループの識別開始");
  log.debug("[2-1-2]========");

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
      "[2-1-2][step2-taskgroup.js] [Step 2-1] ✅ globalStateからsetupResultを構築",
    );
  } else {
    // 従来の方法（フォールバック）
    setupResult =
      window.setupResult ||
      JSON.parse(localStorage.getItem("step1Result") || "null");
  }

  if (!setupResult) {
    log.error(
      "[2-1-2][step2-taskgroup.js] [Step 2-1] ❌ ステップ1の結果が取得できません",
    );
    log.error("[2-1-2]  - window.globalState: ", window.globalState);
    log.error("[2-1-2]  - window.setupResult: ", window.setupResult);
    log.error(
      "[2-1-2]  - localStorage.step1Result: ",
      localStorage.getItem("step1Result") ? "あり" : "なし",
    );
    throw new Error("ステップ1の結果が見つかりません");
  }

  const { spreadsheetId, specialRows, apiHeaders, sheetsApiBase } = setupResult;
  const { menuRow, aiRow } = specialRows;

  // 2-1-1. メニュー行とAI行の読み込み
  log.debug(
    "[2-1-2][step2-taskgroup.js] [Step 2-1-1] メニュー行とAI行の読み込み開始",
  );
  log.debug(`[2-1-2]  - メニュー行: ${menuRow}行目`);
  log.debug(`[2-1-2]  - AI行: ${aiRow}行目`);

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
          // step3-tasklist.js互換のためcolumns.logを追加
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

    // ========================================
    // Enrichment処理: columnsとdataStartRowを設定
    // ========================================

    // データ検証関数（自己完結型）
    function validateTaskGroup(group, groupIndex = null) {
      const errors = [];

      if (!group) {
        log.error(
          `[2-1-2][step2-taskgroup.js] [Step 2-1] グループ${groupIndex ? groupIndex : ""}が未定義`,
        );
        errors.push("グループが未定義");
        return errors;
      }

      if (!group.columns) {
        log.error(
          `[2-1-2][step2-taskgroup.js] [Step 2-1] グループ${groupIndex ? groupIndex : ""}のcolumns構造が未定義`,
        );
        errors.push("columns構造が未定義");
      } else {
        if (
          !group.columns.prompts ||
          !Array.isArray(group.columns.prompts) ||
          group.columns.prompts.length === 0
        ) {
          log.error(
            `[2-1-2][step2-taskgroup.js] [Step 2-1] グループ${groupIndex ? groupIndex : ""}のprompts列が未定義または空`,
          );
          errors.push("prompts列が未定義または空");
        }
        if (
          !group.columns.answer ||
          (typeof group.columns.answer === "object" &&
            Object.keys(group.columns.answer).length === 0)
        ) {
          log.error(
            `[2-1-2][step2-taskgroup.js] [Step 2-1] グループ${groupIndex ? groupIndex : ""}のanswer列が未定義または空`,
          );
          errors.push("answer列が未定義または空");
        }
      }

      if (!group.groupType && !group.type) {
        log.error(
          `[2-1-2][step2-taskgroup.js] [Step 2-1] グループ${groupIndex ? groupIndex : ""}のgroupTypeまたはtypeが未定義`,
        );
        errors.push("groupTypeまたはtypeが未定義");
      }

      return errors;
    }

    log.debug(
      `[2-1-2][step2-taskgroup.js] [Step 2-1] 📝 タスクグループEnrichment開始 (${taskGroups.length}個)`,
    );

    let totalValidationErrors = 0;
    taskGroups.forEach((group, index) => {
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
          `[2-1-2][step2-taskgroup.js] グループ${group.groupNumber}の検証エラー:`,
          validationErrors,
        );
        // エラーがあってもスキップ設定で処理を継続
        group.hasValidationErrors = true;
        group.validationErrors = validationErrors;
        totalValidationErrors += validationErrors.length;
      }
    });

    log.debug(
      `[2-1-2][step2-taskgroup.js] [Step 2-1] ✅ Enrichment完了: ${totalValidationErrors}個の検証エラー`,
    );

    // 内部で作成したtaskGroupsを保存（統計情報用）
    window.globalState.allTaskGroups = taskGroups;
    window.globalState.taskGroups = taskGroups;
    return taskGroups;
  } catch (error) {
    log.error(
      "[2-1-2][step2-taskgroup.js] [Step 2-1] ❌ タスクグループ識別エラー詳細:",
    );
    log.error(`[2-1-2]  - エラー名: ${error.name}`);
    log.error(`[2-1-2]  - メッセージ: ${error.message}`);
    log.error(`[2-1-2]  - スタック: ${error.stack}`);
    throw error;
  }
}

// ========================================
// [2-1-3] 列制御の適用
// ========================================
async function applyColumnControls() {
  log.debug("[2-1-3]========");
  log.debug("[2-1-3][step2-taskgroup.js→Step2-2] 列制御の適用");
  log.debug("[2-1-3]========");

  // globalStateから最新のデータを取得
  const spreadsheetId = window.globalState.spreadsheetId;
  const specialRows = window.globalState.specialRows;
  const apiHeaders = window.globalState.apiHeaders;
  const sheetsApiBase = window.globalState.sheetsApiBase;
  const { controlRow } = specialRows;

  if (!controlRow) {
    log.debug(
      "[2-1-3][step2-taskgroup.js] [Step 2-2] 列制御行が定義されていません - 列制御処理をスキップ",
    );
    return;
  }

  // 列制御行: ${controlRow}行目

  // 2-2-1. 列制御行の全列を読み込み（キャッシュから）
  log.debug(
    `[2-1-3][step2-taskgroup.js] [Step 2-2-1] 列制御行データ取得: ${controlRow}行目`,
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

      log.debug(`[2-1-3]  [${column}] 制御テキスト: "${text}"`);

      // 2-2-2-1. 「この列から処理」の検出
      if (text.includes("この列から処理")) {
        controls.startFrom = groupIndex;
        controlCount++;
        log.debug(
          `[2-1-3][step2-taskgroup.js] [Step 2-2-2-1] ✅ 「この列から処理」検出: ${column}列 (グループ${groupIndex})`,
        );
      }

      // 2-2-2-2. 「この列の処理後に停止」の検出
      if (text.includes("この列の処理後に停止")) {
        controls.stopAfter = groupIndex;
        controlCount++;
        log.debug(
          `[2-1-3][step2-taskgroup.js] [Step 2-2-2-2] ✅ 「この列の処理後に停止」検出: ${column}列 (グループ${groupIndex})`,
        );
      }

      // 2-2-2-3. 「この列のみ処理」の検出
      if (text.includes("この列のみ処理")) {
        controls.onlyProcess.push(groupIndex);
        controlCount++;
        log.debug(
          `[2-1-3][step2-taskgroup.js] [Step 2-2-2-3] ✅ 「この列のみ処理」検出: ${column}列 (グループ${groupIndex})`,
        );
      }
    });

    log.debug(
      `[2-1-3][step2-taskgroup.js] [Step 2-2-2] 列制御検出完了: ${controlCount}個の制御を検出`,
    );

    // 2-2-3. 複数の列制御がある場合の処理
    // 列制御の適用
    const taskGroups = window.globalState.taskGroups;
    let skipCount = 0;

    const skippedGroups = [];

    if (controls.onlyProcess.length > 0) {
      // 「この列のみ処理」が優先
      log.debug(
        `[2-1-3][step2-taskgroup.js] [Step 2-2-3] 「この列のみ処理」モード: グループ${controls.onlyProcess.join(", ")}のみ処理`,
      );

      taskGroups.forEach((group, index) => {
        if (!controls.onlyProcess.includes(index + 1)) {
          group.skip = true;
          skipCount++;
          skippedGroups.push(group.groupNumber);
        }
      });
    } else {
      // 範囲制御の適用
      if (controls.startFrom) {
        log.debug(
          `[2-1-3][step2-taskgroup.js] [Step 2-2-3] 開始位置制御: グループ${controls.startFrom}から開始`,
        );
        taskGroups.forEach((group) => {
          if (group.groupNumber < controls.startFrom) {
            group.skip = true;
            skipCount++;
            skippedGroups.push(group.groupNumber);
          }
        });
      }

      if (controls.stopAfter) {
        log.debug(
          `[2-1-3][step2-taskgroup.js] [Step 2-2-3] 終了位置制御: グループ${controls.stopAfter}で停止`,
        );
        taskGroups.forEach((group) => {
          if (group.groupNumber > controls.stopAfter) {
            group.skip = true;
            skipCount++;
            skippedGroups.push(group.groupNumber);
          }
        });
      }
    }

    // スキップしたグループをサマリー化してログ出力
    if (skippedGroups.length > 0) {
      const groupRanges = [];
      let rangeStart = skippedGroups[0];
      let rangeEnd = skippedGroups[0];

      for (let i = 1; i <= skippedGroups.length; i++) {
        if (i < skippedGroups.length && skippedGroups[i] === rangeEnd + 1) {
          rangeEnd = skippedGroups[i];
        } else {
          if (rangeStart === rangeEnd) {
            groupRanges.push(`${rangeStart}`);
          } else {
            groupRanges.push(`${rangeStart}-${rangeEnd}`);
          }
          if (i < skippedGroups.length) {
            rangeStart = skippedGroups[i];
            rangeEnd = skippedGroups[i];
          }
        }
      }

      log.debug(
        `[2-1-3]  - グループ${groupRanges.join(", ")}をスキップ設定 (${skippedGroups.length}グループ)`,
      );
    }

    log.debug(
      `[2-1-3][step2-taskgroup.js] [Step 2-2-3] 列制御適用完了: ${skipCount}個のグループをスキップ設定`,
    );

    window.globalState.columnControls = controls;
  } catch (error) {
    log.error(
      "[2-1-3][step2-taskgroup.js] [Step 2-2] ❌ 列制御適用エラー詳細:",
    );
    log.error(`[2-1-3]  - エラー名: ${error.name}`);
    log.error(`[2-1-3]  - メッセージ: ${error.message}`);
    log.error("[2-1-3]  - 注: 列制御エラーでも処理は継続します");
    // エラーでも処理を続行
  }
}

// ========================================
// [2-1-4] タスクグループのスキップ判定
// ========================================
async function applySkipConditions() {
  log.debug("[2-1-4]========");
  log.debug("[2-1-4][step2-taskgroup.js→Step2-3] スキップ判定の適用");
  log.debug("[2-1-4]========");

  // globalStateから最新のspreadsheetIdを取得（localStorageは古い可能性がある）
  const spreadsheetId = window.globalState.spreadsheetId;
  const gid = window.globalState.gid;
  const specialRows = window.globalState.specialRows;
  const sheetsApiBase = window.globalState.sheetsApiBase;
  const { dataStartRow } = specialRows;
  const taskGroups = window.globalState.taskGroups;

  log.debug(
    `[2-1-4][step2-taskgroup.js] [Step 2-3] 使用するspreadsheetId: ${spreadsheetId}`,
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
        const promptUrl = `${sheetsApiBase}/${spreadsheetId}/values/${encodeURIComponent(promptRange)}`;

        // プロンプト列取得
        const promptResponse = await window.fetchWithTokenRefresh(promptUrl, {
          headers: apiHeaders,
        });

        const promptData = await promptResponse.json();
        const promptValues = promptData.values || [];

        // 回答列の取得
        const answerRange = `'${sheetName}'!${answerCol}${dataStartRow}:${answerCol}${endRow}`;
        const answerUrl = `${sheetsApiBase}/${spreadsheetId}/values/${encodeURIComponent(answerRange)}`;

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

        // レポート化/Gensparkの場合、作業セル列のみ表示
        const workCol = group.column || group.promptColumns[0];
        result.cellRange = `${workCol}${dataStartRow}:${workCol}${endRow}`;
      }
    } catch (error) {
      result.status = "error";
      result.error = error.message;

      // エラー詳細をログ出力
      log.error(
        `[2-1-4][step2-taskgroup.js] ❌ グループ${group.groupNumber}処理エラー:`,
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

  // 処理対象グループの詳細のみ表示
  const activeGroupDetails = groupResults
    .filter((r) => r.status === "active")
    .map((r) => `グループ${r.groupNumber}(${r.unprocessedCount}未処理)`)
    .join(", ");

  log.info(
    `[2-1-4][step2-taskgroup.js] 📊 タスクグループ判定完了: 全${groupResults.length}個 | 処理対象${activeGroups}個 | スキップ${skippedGroups}個 | ${activeGroupDetails || "なし"}`,
  );
}

// ========================================
// [2-1-5] タスクグループの順番整理
// ========================================
function reorganizeTaskGroups() {
  log.debug("[2-1-5]========");
  log.debug("[2-1-5][step2-taskgroup.js→Step2-4] タスクグループの順番整理");
  log.debug("[2-1-5]========");

  const taskGroups = window.globalState.taskGroups;

  // 2-4-1. 有効なタスクグループの番号振り直し
  log.debug(
    "[2-1-5][step2-taskgroup.js] [Step 2-4-1] 有効グループの番号振り直し開始",
  );
  const activeGroups = taskGroups.filter((group) => !group.skip);
  const skippedGroups = taskGroups.filter((group) => group.skip);

  log.debug(`[2-1-5]  - 元のグループ数: ${taskGroups.length}`);
  log.debug(`[2-1-5]  - スキップグループ: ${skippedGroups.length}`);
  log.debug(`[2-1-5]  - 有効グループ: ${activeGroups.length}`);

  let renumberCount = 0;
  activeGroups.forEach((group, index) => {
    const oldNumber = group.groupNumber;
    group.groupNumber = index + 1;
    if (oldNumber !== group.groupNumber) {
      renumberCount++;
      log.debug(
        `[2-1-5]  - グループ番号変更: ${oldNumber} → ${group.groupNumber} (${group.type})`,
      );
    }
  });

  if (renumberCount === 0) {
    log.debug("[2-1-5]  - 番号変更なし（連続したグループ）");
  }

  log.debug(
    `[2-1-5][step2-taskgroup.js] [Step 2-4] ✅ 順番整理完了: ${activeGroups.length}個の有効グループ`,
  );
  return activeGroups;
}

// ========================================
// [2-1-6] タスクグループ情報の記録とログ出力
// ========================================
async function logTaskGroups() {
  log.debug("[2-1-6]========");
  log.debug("[2-1-6]2-5. タスクグループ情報の調査開始");
  log.debug("[2-1-6]========");

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
    log.error("[2-1-6]行データ取得エラー:", error);
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
    `[2-1-6]📋 タスクグループ解析完了: ${activeGroupsCount}個 (スキップ: ${skipCount}個)`,
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
  log.info(`[2-1-6]📊 タスクタイプ: ${typeStr}`);
}

// ========================================
// [2-1-7] 定義の作成と保存
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
        log.error("[2-1-7]Chrome storage保存エラー:", chrome.runtime.lastError);
        // フォールバック: セッションストレージに保存
        try {
          sessionStorage.setItem("step2Result", JSON.stringify(minimalData));
          log.info("[2-1-7]✅ タスクグループ定義をセッションストレージに保存");
        } catch (e) {
          log.error("[2-1-7]セッションストレージ保存エラー:", e);
        }
      } else {
        log.info("[2-1-7]✅ タスクグループ定義の保存完了");
      }
    });
  } else {
    // Chrome Extension APIが使えない場合はセッションストレージを使用
    try {
      sessionStorage.setItem("step2Result", JSON.stringify(minimalData));
      log.info("[2-1-7]✅ タスクグループ定義をセッションストレージに保存");
    } catch (e) {
      log.error("[2-1-7]セッションストレージ保存エラー:", e);
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
// グループ管理システム（旧step3から統合）
// ========================================

/**
 * currentGroupの一元管理システム
 */
class CurrentGroupManager {
  constructor() {
    this.listeners = new Set();
    this.updateHistory = [];
    this.maxHistorySize = 10;
    this.lastUpdateTimestamp = null;
    this.updateLock = false;
    log.debug("🔧 [CurrentGroupManager] 初期化完了");
  }

  async updateCurrentGroup(newGroup, source = "system") {
    if (this.updateLock) {
      log.debug("⏳ [CurrentGroupManager] 更新ロック中 - 待機");
      await this.waitForUnlock();
    }
    this.updateLock = true;

    try {
      const oldGroup = window.globalState?.currentGroup;
      const timestamp = new Date().toISOString();

      if (
        oldGroup?.groupNumber === newGroup?.groupNumber &&
        oldGroup?.taskType === newGroup?.taskType
      ) {
        log.debug("🔄 [CurrentGroupManager] 同じグループへの更新 - スキップ");
        return true;
      }

      if (!window.globalState) {
        window.globalState = {};
      }

      const previousGroup = window.globalState.currentGroup;
      window.globalState.currentGroup = {
        ...newGroup,
        _metadata: {
          updatedBy: source,
          updatedAt: timestamp,
          previousGroup: previousGroup?.groupNumber || null,
        },
      };

      this.recordUpdate({ from: oldGroup, to: newGroup, source, timestamp });

      log.info("✅ [CurrentGroupManager] currentGroup更新完了:", {
        previousGroup: oldGroup?.groupNumber || "none",
        newGroup: newGroup.groupNumber,
        source,
      });

      this.notifyListeners({
        type: "GROUP_CHANGED",
        previousGroup: oldGroup,
        currentGroup: newGroup,
        source,
        timestamp,
      });

      return true;
    } catch (error) {
      log.error("❌ [CurrentGroupManager] currentGroup更新エラー:", error);
      return false;
    } finally {
      this.updateLock = false;
    }
  }

  getCurrentGroup() {
    return window.globalState?.currentGroup;
  }

  addListener(listener) {
    this.listeners.add(listener);
  }

  removeListener(listener) {
    this.listeners.delete(listener);
  }

  notifyListeners(changeEvent) {
    for (const listener of this.listeners) {
      try {
        listener(changeEvent);
      } catch (error) {
        log.warn("⚠️ [CurrentGroupManager] リスナー通知エラー:", error.message);
      }
    }
  }

  recordUpdate(updateRecord) {
    this.updateHistory.push(updateRecord);
    if (this.updateHistory.length > this.maxHistorySize) {
      this.updateHistory = this.updateHistory.slice(-this.maxHistorySize);
    }
    this.lastUpdateTimestamp = updateRecord.timestamp;
  }

  async waitForUnlock() {
    const maxWaitTime = 5000;
    const checkInterval = 100;
    let waitTime = 0;

    while (this.updateLock && waitTime < maxWaitTime) {
      await new Promise((resolve) => setTimeout(resolve, checkInterval));
      waitTime += checkInterval;
    }

    if (waitTime >= maxWaitTime) {
      log.warn("⚠️ [CurrentGroupManager] 更新ロック解除タイムアウト");
      this.updateLock = false;
    }
  }

  reset() {
    this.listeners.clear();
    this.updateHistory = [];
    this.lastUpdateTimestamp = null;
    this.updateLock = false;
    if (window.globalState) {
      window.globalState.currentGroup = null;
    }
    log.info("🔄 [CurrentGroupManager] システムリセット完了");
  }
}

// グローバルインスタンス作成
if (!window.currentGroupManager) {
  window.currentGroupManager = new CurrentGroupManager();
}

/**
 * currentGroupの統一アクセス関数
 */
function setCurrentGroup(newGroup, source = "system") {
  return window.currentGroupManager.updateCurrentGroup(newGroup, source);
}

function getCurrentGroup() {
  return window.currentGroupManager.getCurrentGroup();
}

function addCurrentGroupListener(listener) {
  return window.currentGroupManager.addListener(listener);
}

function removeCurrentGroupListener(listener) {
  return window.currentGroupManager.removeListener(listener);
}

// =======================================
// [2-2] グループ検証・完了チェック関数
// =======================================

// [2-2-1] タスクグループの検証
function validateTaskGroupForStep5(taskGroup) {
  const errors = [];

  if (!taskGroup) {
    errors.push("タスクグループが未定義");
    return errors;
  }

  if (!taskGroup.columns) {
    errors.push("columns構造が未定義");
  } else {
    if (
      !taskGroup.columns.prompts ||
      !Array.isArray(taskGroup.columns.prompts)
    ) {
      errors.push("prompts列が未定義または配列ではない");
    }
    if (!taskGroup.columns.answer) {
      errors.push("answer列が未定義");
    }
  }

  if (!taskGroup.dataStartRow || typeof taskGroup.dataStartRow !== "number") {
    errors.push("dataStartRowが未定義または数値ではない");
  }

  return errors;
}

// [2-2-2] 完了ステータスチェック
async function checkCompletionStatus(taskGroup) {
  const completionCheckId = `completion_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  log.debug(
    `[2-2-2]🔍 [COMPLETION-CHECK] グループ${taskGroup.groupNumber}完了チェック開始`,
  );

  log.info("[2-2-2][step2-taskgroup.js→Step5-1] 完了状況の確認開始", {
    completionCheckId,
    groupNumber: taskGroup.groupNumber || "undefined",
    taskType: taskGroup.taskType || "undefined",
    pattern: taskGroup.pattern || "undefined",
    columns: taskGroup.columns || {},
  });

  // データ検証
  const validationErrors = validateTaskGroupForStep5(taskGroup);
  if (validationErrors.length > 0) {
    log.error(
      "[2-2-2][step2-taskgroup.js] [Step 5-1] タスクグループ検証エラー:",
      validationErrors,
    );
    throw new Error(`タスクグループ検証失敗: ${validationErrors.join(", ")}`);
  }

  try {
    // ========================================
    // シート名の取得
    // ========================================
    const sheetName =
      window.globalState.sheetName || `シート${window.globalState.gid || "0"}`;
    log.info(`[2-2-2][step2-taskgroup.js] 対象シート: ${sheetName}`);

    // ========================================
    // 行制御情報の取得（タスクグループの範囲内）
    // ========================================
    let rowControls = [];

    // タスクグループの範囲のデータを取得して行制御を抽出
    // 注意：B列に行制御命令が入っているため、B列を含む範囲を取得する必要がある
    const controlCheckRange = `'${sheetName}'!B${taskGroup.dataStartRow}:B1000`;
    let controlData;
    try {
      controlData = await readSpreadsheet(controlCheckRange);
      if (controlData && controlData.values) {
        // getRowControlの形式に合わせてデータを整形
        const formattedData = controlData.values.map((row, index) => {
          // B列のデータを2列目として配置（getRowControlがrowData[1]を見るため）
          return [null, row[0] || ""];
        });

        // 行制御を取得
        if (
          window.Step3TaskList &&
          typeof window.Step3TaskList.getRowControl === "function"
        ) {
          rowControls = window.Step3TaskList.getRowControl(formattedData);

          // 🔧 [OFFSET-FIX] dataStartRowオフセットを行制御の行番号に適用
          rowControls = rowControls.map((control) => ({
            ...control,
            row: control.row + taskGroup.dataStartRow - 1,
          }));

          log.info("[2-2-2][step2-taskgroup.js] 行制御情報取得:", {
            制御数: rowControls.length,
            詳細: rowControls.map((c) => `${c.type}制御: ${c.row}行目`),
            オフセット適用: `dataStartRow(${taskGroup.dataStartRow}) - 1`,
          });
        } else {
          log.warn("[2-2-2][step2-taskgroup.js] getRowControl関数が利用不可");
        }
      }
    } catch (error) {
      log.warn("[2-2-2][step2-taskgroup.js] 行制御取得エラー:", error.message);
      // エラーがあっても処理は継続（行制御なしで全行対象）
    }

    // ========================================
    // Step 5-1-1: プロンプト列の確認
    // ========================================
    log.info("[2-2-2][step2-taskgroup.js→Step5-1-1] プロンプト列を確認中...");

    // 必須データの検証
    if (!taskGroup.columns || !taskGroup.columns.prompts) {
      throw new Error(
        "[2-2-2][step2-taskgroup.js] [Step 5-1-1] エラー: columns.promptsが定義されていません",
      );
    }
    if (!taskGroup.dataStartRow) {
      log.warn(
        "[2-2-2][step2-taskgroup.js] [Step 5-1-1] 警告: dataStartRowが未定義。デフォルト値7を使用",
      );
      taskGroup.dataStartRow = 7;
    }

    // セル範囲計算（自己完結型）
    const startCol = taskGroup.columns.prompts[0];
    const endCol =
      taskGroup.columns.prompts[taskGroup.columns.prompts.length - 1];
    const promptRange = `'${sheetName}'!${startCol}${taskGroup.dataStartRow}:${endCol}1000`;
    log.info(
      `[2-2-2][step2-taskgroup.js] [Step 5-1-1] 取得範囲: ${promptRange}`,
      {
        開始列: taskGroup.columns.prompts[0],
        終了列: taskGroup.columns.prompts[taskGroup.columns.prompts.length - 1],
        開始行: taskGroup.dataStartRow,
        列数: taskGroup.columns.prompts.length,
      },
    );

    let promptValues;
    try {
      promptValues = await readSpreadsheet(promptRange);
    } catch (error) {
      log.error(
        "[2-2-2][step2-taskgroup.js] [Step 5-1-1] スプレッドシート読み込みエラー:",
        {
          範囲: promptRange,
          エラー: error.message,
        },
      );
      throw error;
    }

    // 値があるプロンプト行をカウント（行ベース：複数列でも1行は1タスク）
    let promptCount = 0;
    let promptDetails = [];
    let rowControlSkipCount = 0; // 行制御でスキップされた行数
    if (promptValues && promptValues.values) {
      log.info(
        `[2-2-2][step2-taskgroup.js] [Step 5-1-1] プロンプトデータ取得成功: ${promptValues.values.length}行`,
      );
      for (
        let rowIndex = 0;
        rowIndex < promptValues.values.length;
        rowIndex++
      ) {
        const row = promptValues.values[rowIndex];
        if (!row) continue;

        // 実際の行番号を計算
        const actualRow = taskGroup.dataStartRow + rowIndex;

        // 行制御チェック
        if (rowControls.length > 0) {
          if (
            window.Step3TaskList &&
            typeof window.Step3TaskList.shouldProcessRow === "function"
          ) {
            if (
              !window.Step3TaskList.shouldProcessRow(actualRow, rowControls)
            ) {
              rowControlSkipCount++;
              continue;
            }
          }
        }

        // この行にプロンプトが存在するかチェック
        let hasPromptInRow = false;
        let firstPromptContent = "";

        for (
          let colIndex = 0;
          colIndex < row.length && colIndex < taskGroup.columns.prompts.length;
          colIndex++
        ) {
          const cell = row[colIndex];
          if (cell && cell.trim()) {
            hasPromptInRow = true;
            if (!firstPromptContent) {
              firstPromptContent = cell;
            }
          }
        }

        // この行にプロンプトがあれば1カウント
        if (hasPromptInRow) {
          promptCount++;
          promptDetails.push({
            行: actualRow,
            列: taskGroup.columns.prompts.join(", "),
            内容プレビュー:
              firstPromptContent.substring(0, 30) +
              (firstPromptContent.length > 30 ? "..." : ""),
          });
        }
      }

      // 行制御スキップのサマリーログ
      if (rowControlSkipCount > 0) {
        log.info(
          `[2-2-2][step2-taskgroup.js] 行制御により${rowControlSkipCount}行をスキップしました`,
        );
      }
    } else {
      log.error(
        "[2-2-2][step2-taskgroup.js] [Step 5-1-1] ❌ プロンプトデータが取得できませんでした",
        {
          promptValues: promptValues,
          範囲: promptRange,
          タスクグループ: {
            番号: taskGroup.groupNumber,
            prompts列: taskGroup.columns.prompts,
          },
        },
      );
    }
    log.info(
      `[2-2-2][step2-taskgroup.js] [Step 5-1-1] プロンプト数: ${promptCount}件`,
      {
        詳細: promptDetails.slice(0, 3), // 最初の3件のみ表示
        全件数: promptDetails.length,
        検索範囲: promptRange,
        prompts列設定: taskGroup.columns.prompts,
      },
    );
    log.info(
      `[2-2-2]📊 グループ${taskGroup.groupNumber}: プロンプト=${promptCount}`,
    );

    // ========================================
    // Step 5-1-2: 回答列の確認
    // ========================================
    log.info("[2-2-2][step2-taskgroup.js→Step5-1-2] 回答列を確認中...");

    let answerRange;
    let answerCount = 0;

    if (taskGroup.pattern === "3種類AI") {
      // 3種類AIパターンの場合（行ベースでカウント）
      log.info(
        "[2-2-2][step2-taskgroup.js] [Step 5-1-2] 3種類AIパターンの回答を確認（行ベース）",
      );

      // 【統一修正】全てオブジェクト形式になったのでチェックを調整
      if (
        !taskGroup.columns.answer ||
        typeof taskGroup.columns.answer !== "object"
      ) {
        throw new Error(
          "[2-2-2][step2-taskgroup.js] [Step 5-1-2] エラー: answer列がオブジェクト形式ではありません（統一修正後のエラー）",
        );
      }

      const columns = [
        taskGroup.columns.answer.chatgpt,
        taskGroup.columns.answer.claude,
        taskGroup.columns.answer.gemini,
      ];

      log.info("[2-2-2][step2-taskgroup.js] [Step 5-1-2] AI回答列:", {
        ChatGPT列: columns[0] || "undefined",
        Claude列: columns[1] || "undefined",
        Gemini列: columns[2] || "undefined",
      });

      // 3列をまとめて取得（行ベースで処理するため）
      const startCol = columns[0]; // ChatGPT列
      const endCol = columns[2]; // Gemini列
      answerRange = `'${sheetName}'!${startCol}${taskGroup.dataStartRow}:${endCol}1000`;

      log.info(
        `[2-2-2][step2-taskgroup.js] [Step 5-1-2] 3種類AI回答範囲: ${answerRange}`,
      );

      let values;
      try {
        values = await readSpreadsheet(answerRange);
      } catch (error) {
        log.error(
          "[2-2-2][step2-taskgroup.js] [Step 5-1-2] 3種類AI回答読み込みエラー:",
          {
            範囲: answerRange,
            エラー: error.message,
          },
        );
        throw error;
      }

      if (values && values.values) {
        // 行ごとに処理（いずれかのAIに回答があれば1カウント）
        for (let rowIndex = 0; rowIndex < values.values.length; rowIndex++) {
          const row = values.values[rowIndex];
          if (!row) continue;

          // 実際の行番号を計算
          const actualRow = taskGroup.dataStartRow + rowIndex;

          // 行制御チェック
          if (rowControls.length > 0) {
            if (
              window.Step3TaskList &&
              typeof window.Step3TaskList.shouldProcessRow === "function"
            ) {
              if (
                !window.Step3TaskList.shouldProcessRow(actualRow, rowControls)
              ) {
                continue;
              }
            }
          }

          let hasAnswerInRow = false;
          // 3列（ChatGPT, Claude, Gemini）をチェック
          for (
            let colIndex = 0;
            colIndex < 3 && colIndex < row.length;
            colIndex++
          ) {
            const cellValue = row[colIndex] ? row[colIndex].trim() : "";
            // 値があり、かつ「作業中」マーカーでない場合のみ回答としてカウント
            if (cellValue && !cellValue.startsWith("作業中")) {
              hasAnswerInRow = true;
              break; // 1つでも回答があれば十分
            }
          }

          if (hasAnswerInRow) {
            answerCount++; // 行ごとに1カウント
          }
        }
      }

      // 注意：3種類AIでもプロンプト数を3倍にしない（行ベースで比較）
      log.info(
        `[2-2-2][step2-taskgroup.js] [Step 5-1-2] 3種類AI回答数（行ベース）: ${answerCount}行`,
      );
    } else {
      // 【統一修正】通常パターンもオブジェクト形式に統一
      log.info(
        "[2-2-2][step2-taskgroup.js] [Step 5-1-2] 通常パターンの回答を確認",
      );

      // 【シンプル化】primary列を使用して範囲を生成
      const answerColumn = taskGroup.columns.answer.primary || "C";
      answerRange = `'${sheetName}'!${answerColumn}${taskGroup.dataStartRow}:${answerColumn}1000`;
      log.info(
        `[2-2-2][step2-taskgroup.js] [Step 5-1-2] 取得範囲: ${answerRange}`,
      );

      // 【問題特定ログ】通常パターンでのスプレッドシート読み込み前ログ
      log.debug(
        `[2-2-2][DEBUG-PROBLEM-TRACE] 通常パターン回答データ読み込み開始:`,
        {
          answerRange: answerRange,
          answerColumn: answerColumn,
          taskGroupNumber: taskGroup.groupNumber,
          dataStartRow: taskGroup.dataStartRow,
          読み込み前タイムスタンプ: new Date().toISOString(),
        },
      );

      const answerValues = await readSpreadsheet(answerRange);

      // 【問題特定ログ】通常パターンでのスプレッドシート読み込み後ログ
      log.debug(
        `[2-2-2][DEBUG-PROBLEM-TRACE] 通常パターン回答データ読み込み完了:`,
        {
          answerRange: answerRange,
          answerValues存在: !!answerValues,
          answerValuesValues存在: !!(answerValues && answerValues.values),
          rawDataLength: answerValues?.values?.length || 0,
          読み込み後タイムスタンプ: new Date().toISOString(),
          rawDataプレビュー: answerValues?.values?.slice(0, 5) || "データなし",
        },
      );

      if (answerValues && answerValues.values) {
        for (
          let rowIndex = 0;
          rowIndex < answerValues.values.length;
          rowIndex++
        ) {
          const row = answerValues.values[rowIndex];
          if (!row) continue;

          // 実際の行番号を計算
          const actualRow = taskGroup.dataStartRow + rowIndex;

          // 行制御チェック
          if (rowControls.length > 0) {
            if (
              window.Step3TaskList &&
              typeof window.Step3TaskList.shouldProcessRow === "function"
            ) {
              if (
                !window.Step3TaskList.shouldProcessRow(actualRow, rowControls)
              ) {
                continue;
              }
            }
          }

          const cellValue = row[0] ? row[0].trim() : "";

          // 【根本原因特定ログ】セル詳細と直近書き込み記録の照合
          if (actualRow >= 11 && actualRow <= 13) {
            // 直近書き込み記録をチェック
            const recentWrites = window.globalState?.recentWrites || [];
            const matchingWrite = recentWrites.find(
              (write) =>
                write.cellRef === `${answerColumn}${actualRow}` &&
                write.groupNumber === taskGroup.groupNumber,
            );

            log.debug(
              `[DEBUG-PROBLEM-TRACE] セル詳細チェック (行${actualRow}):`,
              {
                actualRow: actualRow,
                cellValue: cellValue,
                cellValueLength: cellValue.length,
                isEmpty: !cellValue,
                isWorkingMarker: cellValue.startsWith("作業中"),
                willCount: cellValue && !cellValue.startsWith("作業中"),
                rowIndex: rowIndex,
                answerColumn: answerColumn,
                cellRef: `${answerColumn}${actualRow}`,
                // 直近書き込み情報
                hasMatchingWrite: !!matchingWrite,
                matchingWriteInfo: matchingWrite
                  ? {
                      taskId: matchingWrite.taskId,
                      writeTimestamp: new Date(
                        matchingWrite.timestamp,
                      ).toISOString(),
                      verificationTimestamp: new Date(
                        matchingWrite.verificationTimestamp,
                      ).toISOString(),
                      wasVerified: matchingWrite.isVerified,
                      expectedTextLength: matchingWrite.textLength,
                      timeSinceWrite: `${(Date.now() - matchingWrite.timestamp) / 1000}秒前`,
                    }
                  : null,
                // APIキャッシュ疑惑判定
                possibleCacheIssue:
                  matchingWrite && matchingWrite.isVerified && !cellValue,
                タイムスタンプ: new Date().toISOString(),
              },
            );

            // APIキャッシュ問題の疑いがある場合、追加検証
            if (matchingWrite && matchingWrite.isVerified && !cellValue) {
              log.warn(
                `[2-2-2]🚨 [CACHE-ISSUE-DETECTED] APIキャッシュ問題の疑い:`,
                {
                  cellRef: `${answerColumn}${actualRow}`,
                  expectedFromWrite: `${matchingWrite.textLength}文字`,
                  actualFromRead: `${cellValue.length}文字`,
                  writeTime: new Date(matchingWrite.timestamp).toISOString(),
                  readTime: new Date().toISOString(),
                  timeDifference: `${(Date.now() - matchingWrite.timestamp) / 1000}秒`,
                  writeWasVerified: matchingWrite.isVerified,
                },
              );
            }
          }

          // 値があり、かつ「作業中」マーカーでない場合のみ回答としてカウント
          if (cellValue && !cellValue.startsWith("作業中")) {
            answerCount++;

            // 【問題特定ログ】カウントしたセルの詳細（U12付近のみ）
            if (actualRow >= 11 && actualRow <= 13) {
              log.debug(
                `[DEBUG-PROBLEM-TRACE] 回答カウント実行 (行${actualRow}):`,
                {
                  actualRow: actualRow,
                  cellValue: cellValue.substring(0, 100),
                  現在のanswerCount: answerCount,
                  answerColumn: answerColumn,
                  タイムスタンプ: new Date().toISOString(),
                },
              );
            }
          }
        }
      }
    }

    log.info(
      `[2-2-2][step2-taskgroup.js] [Step 5-1-2] 回答数: ${answerCount}件`,
    );
    log.debug(
      `[DEBUG-checkCompletionStatus] グループ${taskGroup.groupNumber}: 回答検索完了 - answerCount=${answerCount}, 範囲=${answerRange}`,
    );

    // 統計情報更新
    window.globalState.stats.totalPrompts = promptCount;
    window.globalState.stats.completedAnswers = answerCount;
    window.globalState.stats.pendingTasks = promptCount - answerCount;

    // ========================================
    // Step 5-1-3: 完了判定
    // ========================================
    log.info("[2-2-2][step2-taskgroup.js→Step5-1-3] 完了判定を実行");

    log.debug(
      `[DEBUG-checkCompletionStatus] グループ${taskGroup.groupNumber}: promptCount=${promptCount}, answerCount=${answerCount}`,
    );

    // 【問題特定ログ】完了判定前の詳細状態
    log.debug(`[2-2-2][DEBUG-PROBLEM-TRACE] 完了判定前の最終状態:`, {
      promptCount: promptCount,
      answerCount: answerCount,
      difference: promptCount - answerCount,
      taskGroupNumber: taskGroup.groupNumber,
      promptRange: promptRange,
      answerRange: answerRange,
      判定タイムスタンプ: new Date().toISOString(),
    });

    // 🔍 【強化】空白タスク詳細検出ログ
    const blankTasks = [];
    const completedTasks = [];

    // 🔄 【修正】キャッシュを使わず直接APIから最新データ取得
    log.debug(`[2-2-2]🔍 [CACHE-FIX] 個別タスク検証のためAPI直接読み取り開始`, {
      completionCheckId,
      taskGroupNumber: taskGroup.groupNumber,
      dataStartRow: taskGroup.dataStartRow,
      promptCount,
      timestamp: new Date().toISOString(),
    });

    // 🔍 【シート名統一】GIDからシート名を取得して使用
    let sheetPrefix = "";
    if (window.globalState?.gid) {
      try {
        // SimpleSheetsClientのインスタンスからシート名取得
        if (window.simpleSheetsClientStep5?.getSheetNameFromGid) {
          const sheetName =
            await window.simpleSheetsClientStep5.getSheetNameFromGid(
              window.globalState.spreadsheetId,
              window.globalState.gid,
            );
          if (sheetName) {
            sheetPrefix = `'${sheetName}'!`;
          }
        }
      } catch (err) {
        console.warn(
          `⚠️ [BATCH-READ] シート名取得失敗、デフォルトシート使用:`,
          err,
        );
      }
    }

    // バッチ読み取り範囲の計算
    // columns.promptsは常に配列（例: ['O', 'P']）
    const promptCol =
      Array.isArray(taskGroup.columns?.prompts) &&
      taskGroup.columns.prompts.length > 0
        ? taskGroup.columns.prompts[0]
        : null;

    // columns.answerは2つの構造に対応:
    // 1. 文字列（古い構造）: 'Q'
    // 2. オブジェクト（新しい構造）: {primary: 'Q'} または {chatgpt: 'C', claude: 'D', gemini: 'E'}
    let answerCol = null;
    if (taskGroup.columns?.answer) {
      if (typeof taskGroup.columns.answer === "string") {
        // 古い構造（文字列）
        answerCol = taskGroup.columns.answer;
      } else if (typeof taskGroup.columns.answer === "object") {
        // 新しい構造（オブジェクト）
        answerCol =
          taskGroup.columns.answer.primary ||
          taskGroup.columns.answer.claude ||
          taskGroup.columns.answer.chatgpt ||
          taskGroup.columns.answer.gemini;
      }
    }

    // 列が取得できない場合はエラー
    if (!promptCol || !answerCol) {
      console.error(`❌ [BATCH-READ] 列情報が不正:`, {
        promptCol,
        answerCol,
        columns: taskGroup.columns,
      });
      // 個別タスク詳細を空で返す
      log.debug(
        `🔍 [COMPLETION-CHECK-DETAILS] 個別タスク詳細分析（スキップ）`,
        {
          completionCheckId,
          taskGroupNumber: taskGroup.groupNumber,
          error: "列情報が取得できません",
        },
      );
      return { isComplete: false, blankTasks, completedTasks };
    }

    // SpreadsheetDataを使用した個別検証は削除（不要な機能）

    // 個別タスク検証機能は削除（SpreadsheetDataクラス未定義のため）

    // 完了判定：プロンプト数と回答数が一致し、かつプロンプトが存在する場合のみ完了
    const isComplete = promptCount > 0 && promptCount === answerCount;

    log.info("[2-2-2][step2-taskgroup.js] [Step 5-1-3] 完了状況:", {
      プロンプト数: promptCount,
      回答数: answerCount,
      完了判定: isComplete ? "完了" : "未完了",
      完了率:
        promptCount > 0
          ? Math.round((answerCount / promptCount) * 100) + "%"
          : "0%",
      グループ番号: taskGroup.groupNumber,
      タスクタイプ: taskGroup.taskType,
    });

    // 完了判定
    return isComplete;
  } catch (error) {
    log.error("[2-2-2][step2-taskgroup.js] [Step 5-1] 完了状況確認エラー:", {
      エラーメッセージ: error.message,
      スタック: error.stack,
      タスクグループ: {
        番号: taskGroup.groupNumber,
        タイプ: taskGroup.taskType,
        パターン: taskGroup.pattern,
      },
      現在の統計: window.globalState.stats,
    });
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
    setCurrentGroup,
    getCurrentGroup,
    validateTaskGroupForStep5,
    checkCompletionStatus,
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
  window.setCurrentGroup = setCurrentGroup;
  window.getCurrentGroup = getCurrentGroup;
  window.addCurrentGroupListener = addCurrentGroupListener;
  window.removeCurrentGroupListener = removeCurrentGroupListener;
  window.validateTaskGroupForStep5 = validateTaskGroupForStep5;
  window.checkCompletionStatus = checkCompletionStatus;
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
      log.debug('[2-2-2]ステップ1の完了待機中...');
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

log.debug("[2-2-2][step2-taskgroup.js] ✅ Step2関数定義完了（自動実行無効）");
