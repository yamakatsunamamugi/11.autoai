// ログレベル定義
const LOG_LEVEL = { ERROR: 1, WARN: 2, INFO: 3, DEBUG: 4 };

// Chrome Storageからログレベルを取得（非同期）
let CURRENT_LOG_LEVEL = LOG_LEVEL.INFO; // デフォルト値

// Chrome拡張環境でのみStorageから設定を読み込む
if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
  chrome.storage.local.get('logLevel', (result) => {
    if (result.logLevel) {
      CURRENT_LOG_LEVEL = parseInt(result.logLevel);
      console.log(`📋 ログレベル設定: ${['', 'ERROR', 'WARN', 'INFO', 'DEBUG'][CURRENT_LOG_LEVEL]} (${CURRENT_LOG_LEVEL})`);
    } else {
      console.log('📋 ログレベル: デフォルト (INFO)');
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
  }
};



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

// =======================================
// 簡易ログシステム（LoopLogger）
// =======================================
const LoopLogger = {
  logLevel: "INFO",
  logLevels: { ERROR: 0, WARN: 1, INFO: 2, DEBUG: 3 },
  retryCount: new Map(),

  shouldLog(level) {
    return this.logLevels[level] <= this.logLevels[this.logLevel];
  },

  error(msg, data) {},

  warn(msg, data) {},

  info(msg, data) {},

  debug(msg, data) {},

  // ループ処理専用の集約ログ
  logLoop(iteration, maxIterations, tasksRemaining) {},
};

// デフォルトログレベル設定
const isDebugMode = localStorage.getItem("loopLogLevel") === "DEBUG";
LoopLogger.logLevel = isDebugMode ? "DEBUG" : "INFO";

// step3-loop.js 読み込み開始

// ファイルの文字エンコーディングチェック
try {
  const testString = "テスト文字列：日本語、英語、記号!@#$%";
  // 文字エンコーディングテスト
} catch (e) {
  // 文字エンコーディングエラー
}

// グローバル状態を使用（他のステップと共有）
// グローバル状態チェック

if (!window.globalState) {
  // グローバル状態を初期化
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
      retryCount: 0,
    },
  };
}

/**
 * 完了状況の確認
 * @param {Object} taskGroup - タスクグループ情報
 * @returns {Promise<boolean>} 完了の場合true
 */
// データ検証関数（自己完結型）
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

async function checkCompletionStatus(taskGroup) {
  LoopLogger.info("[step5-loop.js→Step5-1] 完了状況の確認開始", {
    groupNumber: taskGroup.groupNumber || "undefined",
    taskType: taskGroup.taskType || "undefined",
    pattern: taskGroup.pattern || "undefined",
    columns: taskGroup.columns || {},
  });

  // データ検証
  const validationErrors = validateTaskGroupForStep5(taskGroup);
  if (validationErrors.length > 0) {
    LoopLogger.error(
      "[step5-loop.js] [Step 5-1] タスクグループ検証エラー:",
      validationErrors,
    );
    throw new Error(`タスクグループ検証失敗: ${validationErrors.join(", ")}`);
  }

  try {
    // ========================================
    // Step 5-1-1: プロンプト列の確認
    // ========================================
    LoopLogger.info("[step5-loop.js→Step5-1-1] プロンプト列を確認中...");

    // 必須データの検証
    if (!taskGroup.columns || !taskGroup.columns.prompts) {
      throw new Error(
        "[step5-loop.js] [Step 5-1-1] エラー: columns.promptsが定義されていません",
      );
    }
    if (!taskGroup.dataStartRow) {
      LoopLogger.warn(
        "[step5-loop.js] [Step 5-1-1] 警告: dataStartRowが未定義。デフォルト値7を使用",
      );
      taskGroup.dataStartRow = 7;
    }

    // セル範囲計算（自己完結型）
    const startCol = taskGroup.columns.prompts[0];
    const endCol =
      taskGroup.columns.prompts[taskGroup.columns.prompts.length - 1];
    const promptRange = `${startCol}${taskGroup.dataStartRow}:${endCol}1000`;
    LoopLogger.info(`[step5-loop.js] [Step 5-1-1] 取得範囲: ${promptRange}`, {
      開始列: taskGroup.columns.prompts[0],
      終了列: taskGroup.columns.prompts[taskGroup.columns.prompts.length - 1],
      開始行: taskGroup.dataStartRow,
      列数: taskGroup.columns.prompts.length,
    });

    let promptValues;
    try {
      promptValues = await readSpreadsheet(promptRange);
    } catch (error) {
      LoopLogger.error(
        "[step5-loop.js] [Step 5-1-1] スプレッドシート読み込みエラー:",
        {
          範囲: promptRange,
          エラー: error.message,
        },
      );
      throw error;
    }

    // 値があるプロンプトセルをカウント
    let promptCount = 0;
    let promptDetails = [];
    if (promptValues && promptValues.values) {
      LoopLogger.info(
        `[step5-loop.js] [Step 5-1-1] プロンプトデータ取得成功: ${promptValues.values.length}行`,
      );
      for (
        let rowIndex = 0;
        rowIndex < promptValues.values.length;
        rowIndex++
      ) {
        const row = promptValues.values[rowIndex];
        if (!row) continue;

        for (
          let colIndex = 0;
          colIndex < row.length && colIndex < taskGroup.columns.prompts.length;
          colIndex++
        ) {
          const cell = row[colIndex];
          if (cell && cell.trim()) {
            promptCount++;
            promptDetails.push({
              行: taskGroup.dataStartRow + rowIndex,
              列: taskGroup.columns.prompts[colIndex],
              内容プレビュー:
                cell.substring(0, 30) + (cell.length > 30 ? "..." : ""),
            });
          }
        }
      }
    } else {
      LoopLogger.error(
        "[step5-loop.js] [Step 5-1-1] ❌ プロンプトデータが取得できませんでした",
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
    LoopLogger.info(
      `[step5-loop.js] [Step 5-1-1] プロンプト数: ${promptCount}件`,
      {
        詳細: promptDetails.slice(0, 3), // 最初の3件のみ表示
        全件数: promptDetails.length,
        検索範囲: promptRange,
        prompts列設定: taskGroup.columns.prompts,
      },
    );
    log.debug(
      `[DEBUG-checkCompletionStatus] グループ${taskGroup.groupNumber}: プロンプト検索完了 - promptCount=${promptCount}, 範囲=${promptRange}`,
    );

    // ========================================
    // Step 5-1-2: 回答列の確認
    // ========================================
    LoopLogger.info("[step5-loop.js→Step5-1-2] 回答列を確認中...");

    let answerRange;
    let answerCount = 0;

    if (taskGroup.pattern === "3種類AI") {
      // 3種類AIパターンの場合
      LoopLogger.info(
        "[step5-loop.js] [Step 5-1-2] 3種類AIパターンの回答を確認",
      );

      // 【統一修正】全てオブジェクト形式になったのでチェックを調整
      if (
        !taskGroup.columns.answer ||
        typeof taskGroup.columns.answer !== "object"
      ) {
        throw new Error(
          "[step5-loop.js] [Step 5-1-2] エラー: answer列がオブジェクト形式ではありません（統一修正後のエラー）",
        );
      }

      const columns = [
        taskGroup.columns.answer.chatgpt,
        taskGroup.columns.answer.claude,
        taskGroup.columns.answer.gemini,
      ];

      LoopLogger.info("[step5-loop.js] [Step 5-1-2] AI回答列:", {
        ChatGPT列: columns[0] || "undefined",
        Claude列: columns[1] || "undefined",
        Gemini列: columns[2] || "undefined",
      });

      for (const col of columns) {
        if (!col) {
          LoopLogger.warn(
            "[step5-loop.js] [Step 5-1-2] 警告: 列が未定義のためスキップ",
          );
          continue;
        }

        const range = `${col}${taskGroup.dataStartRow}:${col}1000`;
        LoopLogger.info(
          `[step5-loop.js] [Step 5-1-2] ${col}列を確認: ${range}`,
        );

        let values;
        try {
          values = await readSpreadsheet(range);
        } catch (error) {
          LoopLogger.error(
            `[step5-loop.js] [Step 5-1-2] ${col}列読み込みエラー:`,
            {
              範囲: range,
              エラー: error.message,
            },
          );
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
      LoopLogger.info(
        `[step5-loop.js] [Step 5-1-2] 3種類AI調整後 - 期待回答数: ${promptCount}`,
      );
    } else {
      // 【統一修正】通常パターンもオブジェクト形式に統一
      LoopLogger.info("[step5-loop.js] [Step 5-1-2] 通常パターンの回答を確認");

      // 【シンプル化】primary列を使用して範囲を生成
      const answerColumn = taskGroup.columns.answer.primary || "C";
      answerRange = `${answerColumn}${taskGroup.dataStartRow}:${answerColumn}1000`;
      LoopLogger.info(`[step5-loop.js] [Step 5-1-2] 取得範囲: ${answerRange}`);

      const answerValues = await readSpreadsheet(answerRange);

      if (answerValues && answerValues.values) {
        for (const row of answerValues.values) {
          if (row[0] && row[0].trim()) {
            answerCount++;
          }
        }
      }
    }

    LoopLogger.info(`[step5-loop.js] [Step 5-1-2] 回答数: ${answerCount}件`);
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
    LoopLogger.info("[step5-loop.js→Step5-1-3] 完了判定を実行");

    log.debug(
      `[DEBUG-checkCompletionStatus] グループ${taskGroup.groupNumber}: promptCount=${promptCount}, answerCount=${answerCount}`,
    );
    const isComplete = promptCount === answerCount;

    LoopLogger.info("[step5-loop.js] [Step 5-1-3] 完了状況:", {
      プロンプト数: promptCount,
      回答数: answerCount,
      未完了: window.globalState.stats.pendingTasks,
      完了判定: isComplete ? "完了" : "未完了",
      完了率:
        promptCount > 0
          ? Math.round((answerCount / promptCount) * 100) + "%"
          : "0%",
      グループ番号: taskGroup.groupNumber,
      タスクタイプ: taskGroup.taskType,
    });

    if (!isComplete && promptCount > 0) {
      LoopLogger.info("[step5-loop.js] [Step 5-1-3] 未完了詳細:", {
        残りタスク数: promptCount - answerCount,
        推定処理時間: `約${(promptCount - answerCount) * 30}秒`,
      });
    }

    // 完了判定
    return isComplete;
  } catch (error) {
    LoopLogger.error("[step5-loop.js] [Step 5-1] 完了状況確認エラー:", {
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

/**
 * 未完了タスクの処理
 * @param {Object} taskGroup - タスクグループ情報
 * @returns {Promise<void>}
 */
async function processIncompleteTasks(taskGroup) {
  LoopLogger.info("[step5-loop.js→Step5-2] 未完了タスクの処理開始", {
    グループ番号: taskGroup.groupNumber,
    タスクタイプ: taskGroup.taskType,
    現在の統計: window.globalState.stats,
  });

  let isComplete = false;
  let iteration = 0;
  const maxIterations = 100; // 無限ループ防止

  // ========================================
  // Step 5-2-3: 繰り返し（完了まで5-2-1から繰り返し）
  // ========================================
  do {
    iteration++;
    LoopLogger.info(
      `[step5-loop.js] [Step 5-2-3] 繰り返し処理 ${iteration}回目`,
      {
        最大回数: maxIterations,
        現在の進捗: `${iteration}/${maxIterations}`,
      },
    );

    if (iteration > maxIterations) {
      LoopLogger.error(
        "[step5-loop.js] [Step 5-2-3] 最大繰り返し回数超過 - 処理を中止",
        {
          実行回数: iteration,
          最大回数: maxIterations,
          グループ番号: taskGroup.groupNumber,
          残りタスク: window.globalState.stats.pendingTasks,
        },
      );
      break;
    }

    // ========================================
    // Step 5-2-1: ステップ3へ戻る（次の3タスクを生成）
    // ========================================
    LoopLogger.info(
      "[step5-loop.js] [Step 5-2-1] ステップ3へ戻る - タスクリスト作成",
    );
    let tasks;
    try {
      tasks = await createTaskList(taskGroup);
    } catch (error) {
      LoopLogger.error("[step5-loop.js] [Step 5-2-1] タスクリスト作成エラー:", {
        エラー: error.message,
        グループ番号: taskGroup.groupNumber,
        繰り返し回数: iteration,
      });
      break;
    }

    if (!tasks || tasks.length === 0) {
      LoopLogger.info("[step5-loop.js] [Step 5-2-1] 処理可能なタスクなし", {
        理由: "すべてのタスクが完了済みまたは処理対象外",
        グループ番号: taskGroup.groupNumber,
      });
      log.debug(
        "🎯 [step5-loop.js] このグループは完了済み - 正常終了として扱います",
      );
      isComplete = true; // タスクがない = このグループは完了
      break;
    }
    LoopLogger.info(
      `[step5-loop.js] [Step 5-2-1] ${tasks.length}個のタスクを生成`,
      {
        タスク詳細: tasks.slice(0, 3), // 最初の3件のみ表示
      },
    );

    // ========================================
    // Step 5-2-2: ステップ4を実行（タスクを処理）
    // ========================================
    LoopLogger.info(
      "[step5-loop.js] [Step 5-2-2] ステップ4を実行 - タスク実行",
      {
        タスク数: tasks.length,
        グループ番号: taskGroup.groupNumber,
      },
    );

    try {
      await executeTasks(tasks, taskGroup);
      LoopLogger.info("[step5-loop.js] [Step 5-2-2] タスク実行完了", {
        成功: true,
        処理タスク数: tasks.length,
      });
    } catch (error) {
      LoopLogger.error("[step5-loop.js] [Step 5-2-2] タスク実行エラー:", {
        エラー: error.message,
        タスク数: tasks.length,
        繰り返し回数: iteration,
      });
      // エラーでも処理を継続
    }

    // 処理後の待機（APIレート制限対策: iteration回数に応じて待機時間を増やす）
    const waitTime = Math.min(2000 + iteration * 1000, 10000); // 2秒〜10秒で段階的に増加
    LoopLogger.info(
      `[step5-loop.js] [Step 5-2-2] APIレート制限対策: ${waitTime}ms待機中...`,
      {
        繰り返し回数: iteration,
        待機時間: `${waitTime / 1000}秒`,
      },
    );
    await sleep(waitTime);

    // 完了確認（Step 5-1を再実行）
    LoopLogger.info(
      "[step5-loop.js] [Step 5-2-3] 完了確認のためStep 5-1を再実行",
    );
    isComplete = await checkCompletionStatus(taskGroup);

    if (!isComplete) {
      LoopLogger.info(
        `[step5-loop.js] [Step 5-2-3] 未完了タスク残り: ${window.globalState.stats.pendingTasks}件 - 繰り返し継続`,
        {
          完了率:
            window.globalState.stats.totalPrompts > 0
              ? Math.round(
                  (window.globalState.stats.completedAnswers /
                    window.globalState.stats.totalPrompts) *
                    100,
                ) + "%"
              : "0%",
          次の繰り返し: iteration + 1,
          推定残り時間: `約${window.globalState.stats.pendingTasks * 30}秒`,
        },
      );
    }
  } while (!isComplete);

  if (isComplete) {
    LoopLogger.info(
      "[step5-loop.js] [Step 5-2-3] タスクグループ完了 - 繰り返し終了",
      {
        総繰り返し回数: iteration,
        処理時間: "計測中",
        最終統計: window.globalState.stats,
      },
    );
  } else {
    LoopLogger.warn("[step5-loop.js] [Step 5-2-3] タスクグループ未完了で終了", {
      理由:
        iteration > maxIterations
          ? "最大繰り返し回数超過"
          : "処理可能タスクなし",
      残りタスク: window.globalState.stats.pendingTasks,
    });
  }
}

/**
 * 全グループを処理するメイン関数
 * Step 3が全体のループ制御を担当
 * @returns {Promise<Object>} 処理結果
 */
async function executeStep3AllGroups() {
  log.debug("========================================");
  log.debug("🚀 [step3-loop.js] 全グループ処理開始");
  log.debug("========================================");

  const taskGroups = window.globalState?.taskGroups || [];
  log.debug(`📊 処理対象: ${taskGroups.length}グループ`);

  let completedGroups = 0;

  // 各グループを順番に処理
  for (let i = 0; i < taskGroups.length; i++) {
    window.globalState.currentGroupIndex = i;
    const taskGroup = taskGroups[i];

    log.debug(
      `\n====== グループ ${i + 1}/${taskGroups.length} 処理開始 ======`,
    );
    log.debug(`📋 グループ詳細:`, {
      番号: taskGroup.groupNumber,
      タイプ: taskGroup.taskType || taskGroup.type,
      列範囲: `${taskGroup.columns?.prompts?.[0]} 〜 ${taskGroup.columns?.answer?.primary || taskGroup.columns?.answer?.claude}`,
    });

    // 現在のグループを処理
    const isComplete = await executeStep3SingleGroup(taskGroup);

    if (isComplete) {
      completedGroups++;
      log.debug(`✅ グループ ${i + 1} 完了`);
    }

    // Step 6: 次グループへの移行判定
    if (window.executeStep6) {
      log.debug(`🔄 [step3-loop.js] Step 6 を呼び出し中...`);
      const step6Result = await window.executeStep6(taskGroups, i);

      if (!step6Result.hasNext) {
        log.debug(`🏁 [step3-loop.js] 全グループ処理完了`);
        break;
      }
    }
  }

  log.debug(`\n========================================`);
  log.debug(
    `📊 処理結果: ${completedGroups}/${taskGroups.length} グループ完了`,
  );
  log.debug(`========================================\n`);

  return {
    success: true,
    completedGroups,
    totalGroups: taskGroups.length,
  };
}

/**
 * 単一グループの処理
 * @param {Object} taskGroup - タスクグループ情報
 * @returns {Promise<boolean>} 完了の場合true
 */
async function executeStep3SingleGroup(taskGroup) {
  LoopLogger.info("========================================");
  LoopLogger.info(
    "[step3-loop.js] [Step 3] タスクグループ内の繰り返し処理開始",
  );
  LoopLogger.info("========================================");
  log.debug("📋 [step5-loop.js] 処理開始グループ:", {
    グループ番号: taskGroup?.groupNumber,
    タイプ: taskGroup?.type || taskGroup?.taskType,
    パターン: taskGroup?.pattern,
    列範囲: `${taskGroup?.columns?.prompts?.[0] || "?"} 〜 ${taskGroup?.columns?.answer?.primary || taskGroup?.columns?.answer?.claude || "?"}`,
    開始行: taskGroup?.dataStartRow,
  });
  // DEBUG: 入力グループ詳細情報

  try {
    // グループ情報を状態に保存
    window.globalState.currentGroup = taskGroup;

    // 5-1: 完了状況確認
    log.debug("🔍 [step5-loop.js] Step 5-1: 完了状況を確認中...");
    const isComplete = await checkCompletionStatus(taskGroup);

    if (isComplete) {
      log.debug("✅ [step5-loop.js] グループ完了済み - Step 5終了");
      LoopLogger.info("[step5-loop.js] [Step 5] タスクグループは既に完了");
      return true;
    }

    // 5-2: 未完了時の処理
    log.debug("⚡ [step5-loop.js] Step 5-2: 未完了タスクを処理中...");
    await processIncompleteTasks(taskGroup);

    // 最終的な完了確認
    log.debug("🔍 [step5-loop.js] 最終完了確認中...");
    const finalComplete = await checkCompletionStatus(taskGroup);

    LoopLogger.info("[step5-loop.js] 🎯 [Step 5] グループ処理完了");

    return finalComplete;
  } catch (error) {
    LoopLogger.error("[Step 5] エラー発生:", {
      エラーメッセージ: error.message,
      スタック: error.stack,
      グループ情報: {
        番号: window.globalState.currentGroup?.groupNumber,
        タイプ: window.globalState.currentGroup?.taskType,
      },
      最終統計: window.globalState.stats,
    });
    throw error;
  }
}

// ========================================
// ヘルパー関数（他のstepファイルと共通化予定）
// ========================================

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readSpreadsheet(range, retryCount = 0) {
  LoopLogger.info(`[Helper] スプレッドシート読み込み: ${range}`);

  try {
    // グローバル状態から認証情報とスプレッドシートIDを取得
    if (!window.globalState || !window.globalState.authToken) {
      throw new Error("認証情報が見つかりません");
    }

    if (!window.globalState.spreadsheetId) {
      throw new Error("スプレッドシートIDが見つかりません");
    }

    const spreadsheetId = window.globalState.spreadsheetId;
    const accessToken = window.globalState.authToken;

    // Google Sheets API呼び出し（既存のapiHeadersを活用）
    const apiUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`;
    const headers = window.globalState.apiHeaders || {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    };

    const response = await fetch(apiUrl, {
      method: "GET",
      headers: headers,
    });

    if (!response.ok) {
      // 429エラー（レート制限）の場合、リトライ処理（最大5回）
      if (response.status === 429 && retryCount < 5) {
        const retryAfter = response.headers.get("Retry-After");

        // バックオフ戦略: 5秒→10秒→20秒→30秒→60秒
        const backoffTimes = [5000, 10000, 20000, 30000, 60000];
        const waitTime = retryAfter
          ? parseInt(retryAfter) * 1000
          : backoffTimes[Math.min(retryCount, backoffTimes.length - 1)];

        LoopLogger.warn(
          `[Helper] APIレート制限エラー (429) 検出。${waitTime}ms後にリトライ...`,
          {
            リトライ回数: retryCount + 1,
            最大リトライ: 5,
            待機時間: `${waitTime / 1000}秒`,
            範囲: range,
          },
        );

        await sleep(waitTime);
        return readSpreadsheet(range, retryCount + 1);
      }

      throw new Error(
        `API応答エラー: ${response.status} ${response.statusText}`,
      );
    }

    const data = await response.json();
    LoopLogger.info(
      `[Helper] 読み込み成功: ${data.values ? data.values.length : 0}行取得`,
    );

    return data;
  } catch (error) {
    LoopLogger.error("[Helper] スプレッドシート読み込みエラー:", error);
    throw error;
  }
}

/**
 * スプレッドシート全体のデータを取得（Step3が期待する2次元配列形式）
 * @returns {Promise<Array>} スプレッドシートの2次元配列データ
 */
async function readFullSpreadsheet() {
  // DEBUG: readFullSpreadsheet関数実行開始

  LoopLogger.info("[Helper] スプレッドシート全体データ取得開始");

  try {
    if (!window.globalState || !window.globalState.spreadsheetId) {
      throw new Error("スプレッドシートIDが見つかりません");
    }

    // 全体範囲を取得（A1:ZZ1000の範囲で十分なデータを取得）
    const fullRange = "A1:ZZ1000";
    const data = await readSpreadsheet(fullRange);

    if (!data || !data.values) {
      LoopLogger.warn("[Helper] スプレッドシートデータが空です");
      return [];
    }

    // ログバッファに集約
    const logData = {
      取得行数: data.values.length,
      "データサンプル（最初の3行）": data.values.slice(0, 3),
    };
    LoopLogger.info(`[Helper] スプレッドシート全体データ取得完了:`, logData);

    // 🔍 デバッグログ：データの形状
    try {
      const debugInfo = {
        全体行数: data.values?.length,
        各行の列数: data.values?.slice(0, 10).map((row, i) => ({
          行番号: i + 1,
          列数: row.length,
        })),
        最長行: Math.max(...(data.values?.map((row) => row.length) || [0])),
        最短行: Math.min(...(data.values?.map((row) => row.length) || [0])),
        "36行目の列数": data.values?.[35]?.length,
        "36行目の内容プレビュー": data.values?.[35]?.slice(0, 5),
      };

      // デバッグ情報を一つのログにまとめる
      const debugLog = {
        データ形状: debugInfo,
        プロパティ詳細: {},
      };

      // オブジェクトの各プロパティをチェック
      for (const [key, value] of Object.entries(debugInfo)) {
        debugLog["プロパティ詳細"][key] = {
          type: typeof value,
          isNull: value === null,
          isUndefined: value === undefined,
          valuePreview: JSON.stringify(value).substring(0, 100),
        };
      }

      // LoopLogger.debug("🔍 [DEBUG] データ形状詳細（統合）:", debugLog);
    } catch (debugError) {
      LoopLogger.error("❌ [DEBUG] デバッグ情報の出力エラー:", {
        message: debugError.message,
        stack: debugError.stack,
        lineNumber: debugError.lineNumber,
      });
    }

    return data.values;
  } catch (error) {
    LoopLogger.error("[Helper] スプレッドシート全体データ取得エラー:", error);
    throw error;
  }
}

async function createTaskList(taskGroup) {
  LoopLogger.info("[Helper] タスクリスト作成開始:", {
    グループ番号: taskGroup?.groupNumber,
    グループタイプ: taskGroup?.groupType,
    列情報: taskGroup?.columns,
    dataStartRow: taskGroup?.dataStartRow,
  });

  // ログバッファを初期化
  const logBuffer = [];
  const addLog = (message, data) => {
    if (data) {
      logBuffer.push(`${message}: ${JSON.stringify(data)}`);
    } else {
      logBuffer.push(message);
    }
  };

  try {
    // Step3TaskList利用可能性の詳細チェック

    // step3-tasklist.jsのgenerateTaskList関数を利用
    if (!window.Step3TaskList || !window.Step3TaskList.generateTaskList) {
      throw new Error("Step3TaskList.generateTaskListが利用できません");
    }

    // 重要：Step3が期待する実際のスプレッドシートデータ（2次元配列）を取得
    LoopLogger.info("[Helper] スプレッドシート全体データを取得中...");
    const spreadsheetData = await readFullSpreadsheet();

    if (!spreadsheetData || spreadsheetData.length === 0) {
      LoopLogger.warn(
        "[Helper] スプレッドシートデータが空のため、タスク生成をスキップ",
      );
      return [];
    }

    const specialRows = {
      menuRow: window.globalState.setupResult?.menuRow || 3,
      aiRow: window.globalState.setupResult?.aiRow || 5,
      modelRow: window.globalState.setupResult?.modelRow || 6,
      functionRow: window.globalState.setupResult?.functionRow || 7,
    };

    // taskGroupから直接dataStartRowを取得（統一構造）
    const dataStartRow =
      taskGroup?.dataStartRow ||
      window.globalState.setupResult?.dataStartRow ||
      9;

    const options = {
      batchSize: 3,
      forceReprocess: false,
      spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${window.globalState.spreadsheetId}/edit#gid=${window.globalState.gid}`,
    };

    // Step 5-3-前処理: 制御情報の取得と適用
    LoopLogger.info(
      "[createTaskList] [Step 5-3-前処理] 行制御・列制御情報を取得中...",
    );

    let rowControls = [];
    let columnControls = [];

    try {
      // Step 5-3-1: 行制御をチェック
      rowControls = window.Step3TaskList.getRowControl(spreadsheetData);
      LoopLogger.info("[createTaskList] [Step 5-3-1] 行制御情報取得完了:", {
        制御数: rowControls.length,
        詳細: rowControls.map((c) => `${c.type}制御: ${c.row}行目`),
      });

      // Step 5-3-2: 列制御の再チェック（タスクグループ作成後の追加フィルタ）
      const columnControlRow =
        window.globalState.setupResult?.columnControlRow || 4;
      columnControls = window.Step3TaskList.getColumnControl(
        spreadsheetData,
        columnControlRow,
      );
      LoopLogger.info("[createTaskList] [Step 5-3-2] 列制御情報取得完了:", {
        制御数: columnControls.length,
        制御行: columnControlRow,
        詳細: columnControls.map((c) => `${c.type}制御: ${c.column}列`),
      });
    } catch (error) {
      LoopLogger.error(
        "[createTaskList] [Step 5-3-前処理] 制御情報取得エラー:",
        {
          エラーメッセージ: error.message,
          スタック: error.stack,
        },
      );
      // エラーが発生しても処理を継続
    }

    // Step 5-3-3: 列制御チェック（タスクグループレベルでの追加フィルタリング）
    if (columnControls.length > 0) {
      LoopLogger.info("[createTaskList] [Step 5-3-3] 列制御チェック実行中...");

      if (
        !window.Step3TaskList.shouldProcessColumn(taskGroup, columnControls)
      ) {
        LoopLogger.info("[createTaskList] [Step 5-3-3] タスクグループ除外:", {
          グループ番号: taskGroup.groupNumber,
          理由: "列制御により除外（この列から処理/この列の処理後に停止/この列のみ処理）",
          グループ列: taskGroup?.columns?.prompts,
          列制御: columnControls.map((c) => `${c.type}:${c.column}`),
        });
        return []; // このタスクグループは処理しない
      } else {
        LoopLogger.info("[createTaskList] [Step 5-3-3] タスクグループ通過:", {
          グループ番号: taskGroup.groupNumber,
          理由: "列制御を通過",
        });
      }
    } else {
      LoopLogger.info(
        "[createTaskList] [Step 5-3-前処理] 列制御なし - 全てのタスクグループを処理",
      );
    }

    // 拡張オプションに制御情報を追加
    const extendedOptions = {
      ...options,
      rowControls: rowControls,
      columnControls: columnControls,
      applyRowControl: true,
      applyColumnControl: true,
    };

    // DEBUG: Step3に渡すパラメータ

    // ログバッファを一つのログとして出力
    // LoopLogger.info(`[Step5-Loop] [統合ログ]\n${logBuffer.join("\n")}`);

    // generateTaskList内でaddLogが使われているため、グローバルに定義
    if (typeof window.addLog === "undefined") {
      window.addLog = (message, data) => {
        if (data) {
          LoopLogger.info(`[Step3-TaskList] ${message}:`, data);
        } else {
          LoopLogger.info(`[Step3-TaskList] ${message}`);
        }
      };
    }

    // タスクリスト生成を実行（制御情報付き）
    const tasks = await window.Step3TaskList.generateTaskList(
      taskGroup,
      spreadsheetData, // 修正：実際の2次元配列データを渡す
      specialRows,
      dataStartRow,
      extendedOptions, // 制御情報を含む拡張オプション
    );

    LoopLogger.info(`[Helper] タスクリスト作成完了: ${tasks.length}件のタスク`);
    if (tasks.length > 0) {
      LoopLogger.info("[Helper] 生成されたタスクサンプル:", tasks.slice(0, 2));
    } else {
      LoopLogger.warn(
        "[Helper] ⚠️ 0件のタスクが生成されました。以下を確認してください:",
      );
      LoopLogger.warn(
        "  - taskGroup.columns.prompts:",
        taskGroup?.columns?.prompts,
      );
      LoopLogger.warn("  - プロンプトデータの存在確認が必要");
    }

    return tasks;
  } catch (error) {
    LoopLogger.error("[Helper] タスクリスト作成エラー:", {
      エラーメッセージ: error.message,
      スタック: error.stack,
      taskGroup: taskGroup,
      "window.Step3TaskList": !!window.Step3TaskList,
    });
    throw error;
  }
}

async function executeTasks(tasks, taskGroup) {
  LoopLogger.info(`[Helper] タスク実行開始: ${tasks.length}件`, {
    グループ番号: taskGroup?.groupNumber,
    タスクタイプ: taskGroup?.taskType,
    パターン: taskGroup?.pattern,
  });

  // 🔍 デバッグ: 関数開始直後のログ
  // DEBUG: executeTasks関数に入りました

  try {
    // step4-execute.jsのexecuteStep4関数を利用
    // DEBUG: executeStep4チェック開始
    // DEBUG: executeStep4呼び出し前チェック

    if (!window.executeStep4) {
      log.error("executeStep4が見つかりません！");
      throw new Error("executeStep4関数が利用できません");
    }

    // DEBUG: executeStep4が見つかりました

    if (!tasks || tasks.length === 0) {
      LoopLogger.warn("[Helper] 実行するタスクがありません");
      return [];
    }

    // タスクリストを適切な形式に変換（Step4が期待する形式に統一）
    const formattedTasks = tasks.map((task, index) => {
      // DEBUG: Step3からのタスクデータ詳細

      // Step3で生成されたタスクの情報を使用
      const aiType = task.ai || taskGroup?.aiType || "Claude";

      // DEBUG: aiType決定プロセス

      const formattedTask = {
        id:
          task.taskId ||
          task.id ||
          `task-${task.row}-${taskGroup.groupNumber}-${index}`,
        row: task.row,
        aiType: aiType,
        prompt: task.prompt || task.text || "",
        answerCell: task.answerCell, // 🔧 [FIX] 直接task.answerCellを設定
        spreadsheetData: {
          id: window.globalState.spreadsheetId,
          gid: window.globalState.gid,
          spreadsheetId: task.spreadsheetId || window.globalState.spreadsheetId, // Step3からの情報
          answerCell: task.answerCell, // Step3で計算された回答セル
          logCell: task.logCell, // Step3で計算されたログセル
        },
        columns: taskGroup.columns,
        taskGroup: taskGroup,
        // Step3からの詳細情報を保持
        model: task.model || "",
        function: task.function || "",
        groupNumber: task.groupNumber,
        groupType: task.groupType,
      };

      // DEBUG: 最終フォーマットタスクの確認

      LoopLogger.info(`[Helper] タスク${index + 1}フォーマット完了:`, {
        taskId: formattedTask.id,
        row: formattedTask.row,
        aiType: formattedTask.aiType,
        プロンプト長: formattedTask.prompt.length,
        answerCell: formattedTask.answerCell, // 🔧 [FIX] 直接参照するように変更
        logCell: formattedTask.spreadsheetData.logCell,
      });

      return formattedTask;
    });

    LoopLogger.info(
      `[Helper] フォーマット済みタスク: ${formattedTasks.length}件`,
    );
    LoopLogger.info("[Helper] 最初のタスク詳細:", formattedTasks[0]);

    // Step4バリデーション
    for (const task of formattedTasks) {
      if (!task.aiType) {
        throw new Error(`タスク${task.id}: aiTypeが未定義`);
      }
      if (!task.prompt) {
        throw new Error(`タスク${task.id}: promptが未定義`);
      }
      // 特殊タスク（report, genspark, single）の場合はanswerCellが不要なので警告を出さない
      const isSpecialTask =
        task.groupType === "report" ||
        task.groupType === "genspark" ||
        task.ai === "single" ||
        task.aiType === "single" ||
        task.ai === "Report" ||
        task.ai === "Genspark";

      // デバッグログ：タスクの詳細情報を出力
      if (!task.spreadsheetData.answerCell) {
        // DEBUG: answerCell検証

        if (!isSpecialTask) {
          LoopLogger.warn(`タスク${task.id}: answerCellが未定義（通常タスク）`);
        } else {
          LoopLogger.info(`タスク${task.id}: answerCell不要（特殊タスク）`);
        }
      }
    }

    // Step4を実行
    LoopLogger.info("[Helper] Step4実行中...");

    // DEBUG: executeStep4呼び出し直前の詳細ログ
    // DEBUG: executeStep4を呼び出す直前

    // 🎯 [DEBUG] 最終チェック - より詳細な情報
    // DEBUG: executeStep4呼び出し直前の最終チェック

    try {
      // DEBUG: executeStep4を呼び出し
      const results = await window.executeStep4(formattedTasks);
      // DEBUG: executeStep4完了
      return results || [];
    } catch (step4Error) {
      log.error("executeStep4でエラーが発生:", step4Error.message);
      throw step4Error;
    }
  } catch (error) {
    LoopLogger.error("⚠️ [DEBUG] エラー詳細:", {
      message: error.message,
      stack: error.stack,
      name: error.name,
      cause: error.cause,
    });

    LoopLogger.error("[Helper] タスク実行エラー:", {
      エラーメッセージ: error.message,
      スタック: error.stack,
      タスク数: tasks?.length,
      グループ情報: {
        番号: taskGroup?.groupNumber,
        タイプ: taskGroup?.taskType,
      },
      "window.executeStep4存在": !!window.executeStep4,
    });
    throw error;
  }
}

// ブラウザ環境用のグローバルエクスポート
// DEBUG: グローバルエクスポート前の状態

if (typeof window !== "undefined") {
  try {
    // Step 3 として関数をエクスポート
    window.executeStep3 = executeStep3AllGroups; // メインエントリーポイント
    window.executeStep3AllGroups = executeStep3AllGroups; // 明示的な名前でもエクスポート
    window.executeStep3SingleGroup = executeStep3SingleGroup; // 単一グループ処理

    // 互換性のため旧名称でもエクスポート
    window.executeStep5 = executeStep3AllGroups;
    window.executeStep5SingleGroup = executeStep3SingleGroup;

    window.checkCompletionStatus = checkCompletionStatus;
    window.processIncompleteTasks = processIncompleteTasks;
    window.readFullSpreadsheet = readFullSpreadsheet;

    // DEBUG: グローバルエクスポート成功
  } catch (exportError) {
    LoopLogger.error("❌ [DEBUG] グローバルエクスポートエラー:", exportError);
  }
}

// エクスポート
// DEBUG: モジュールエクスポートチェック

if (typeof module !== "undefined" && module.exports) {
  try {
    module.exports = {
      executeStep5,
      checkCompletionStatus,
      processIncompleteTasks,
      readFullSpreadsheet,
      globalState: window.globalState,
    };
    // DEBUG: モジュールエクスポート成功
  } catch (moduleExportError) {
    LoopLogger.error(
      "❌ [DEBUG] モジュールエクスポートエラー:",
      moduleExportError,
    );
  }
}

// ファイル読み込み完了ログ
// DEBUG: step5-loop.js 読み込み完了
