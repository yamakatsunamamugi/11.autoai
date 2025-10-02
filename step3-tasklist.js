/**
 * ========================================
 * step3-tasklist.js - タスク実行管理
 * ========================================
 *
 * 【実行フロー】
 *
 * [3-1] startNextTaskIfAvailable() ← step2から開始
 *   └─ タスク探索開始
 *
 * [3-2] findNextAvailableTask()
 *   ├─ DynamicTaskSearch.findNext() - 空きタスク検索
 *   └─ 次タスクを返す
 *
 * [3-3] executeTaskIndependently()
 *   ├─ AIウィンドウオープン
 *   ├─ タスク実行
 *   ├─ 結果をスプレッドシートに記載
 *   └─ DynamicTaskSearch.registerCompletion() - 完了登録
 *
 * [3-4] checkAndHandleGroupCompletion()
 *   ├─ window.checkCompletionStatus() ← step2の[2-2-2]を呼び出し
 *   ├─ グループ完了判定
 *   └─ 完了なら window.executeStep2() → step2の[2-1]に戻る
 *
 * ========================================
 */

// ログレベル定義
const LOG_LEVEL = { ERROR: 1, WARN: 2, INFO: 3, DEBUG: 4 };

// バッチ処理改善設定（個別完了処理を有効化）
const BATCH_PROCESSING_CONFIG = {
  ENABLE_ASYNC_BATCH: true, // 非同期バッチ処理を有効化
  ENABLE_INDIVIDUAL_COMPLETION: false, // 個別タスク完了時の即座処理（processTaskResultと重複するため無効化）
  ENABLE_IMMEDIATE_SPREADSHEET: true, // 即座スプレッドシート記載
  ENABLE_IMMEDIATE_WINDOW_CLOSE: true, // 即座ウィンドウクローズ
  ENABLE_DYNAMIC_NEXT_TASK: true, // 動的次タスク開始を再有効化
  SAFE_MODE: false, // 新機能有効化

  // === バッチ完了待機設定 ===
  WAIT_FOR_BATCH_COMPLETION: true, // バッチ完了待機（デフォルトON = 3つ全て待つ）

  // === 待機時間設定（ミリ秒） ===
  SPREADSHEET_WAIT_TIME: 10000, // スプレッドシート反映待機時間（デフォルト10秒）
  WINDOW_CLOSE_WAIT_TIME: 1000, // ウィンドウクローズ後待機時間（デフォルト1秒）

  // 回答待機時間設定
  MAX_RESPONSE_WAIT_TIME: 600000, // 通常モード: 最大回答待機時間（デフォルト10分）
  MAX_RESPONSE_WAIT_TIME_DEEP: 2400000, // DeepResearchモード: 最大回答待機時間（デフォルト40分）
  MAX_RESPONSE_WAIT_TIME_AGENT: 2400000, // エージェントモード: 最大回答待機時間（デフォルト40分）
  STOP_CHECK_INTERVAL: 10000, // 回答停止ボタンの消滅継続時間（デフォルト10秒）

  // === ウィンドウ初期化タイムアウト設定 ===
  WINDOW_CREATION_WAIT: 5000, // ウィンドウ作成初期待機: 5秒
  TAB_READY_TIMEOUT: 20000, // タブ準備確認タイムアウト: 20秒
  CONTENT_SCRIPT_WAIT: 3000, // Content Script初期化待機: 3秒
  ELEMENT_RETRY_COUNT: 5, // 要素検出リトライ回数: 5回
  ELEMENT_RETRY_INTERVAL: 2500, // 要素検出リトライ間隔: 2.5秒
};

// Chrome Storageからログレベルを取得（非同期）
let CURRENT_LOG_LEVEL = LOG_LEVEL.WARN; // デフォルト値（簡潔な動作確認用）

// Chrome拡張環境でのみStorageから設定を読み込む
if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
  // ログレベルの読み込み
  chrome.storage.local.get("logLevel", (result) => {
    if (result.logLevel) {
      CURRENT_LOG_LEVEL = parseInt(result.logLevel);
    }
  });

  // バッチ処理設定の読み込み
  chrome.storage.local.get("batchProcessingConfig", (result) => {
    if (result.batchProcessingConfig) {
      // Chrome Storageの設定でBATCH_PROCESSING_CONFIGを上書き
      Object.assign(BATCH_PROCESSING_CONFIG, result.batchProcessingConfig);

      // WAIT_FOR_BATCH_COMPLETIONを強制的にtrueに固定（安全な動作を保証）
      BATCH_PROCESSING_CONFIG.WAIT_FOR_BATCH_COMPLETION = true;

      console.log(
        "📋 [step3-tasklist] Chrome Storageから設定を読み込みました:",
        {
          WAIT_FOR_BATCH_COMPLETION:
            BATCH_PROCESSING_CONFIG.WAIT_FOR_BATCH_COMPLETION,
          SPREADSHEET_WAIT_TIME: BATCH_PROCESSING_CONFIG.SPREADSHEET_WAIT_TIME,
          WINDOW_CLOSE_WAIT_TIME:
            BATCH_PROCESSING_CONFIG.WINDOW_CLOSE_WAIT_TIME,
        },
      );
    } else {
      console.log(
        "📋 [step3-tasklist] Chrome Storageに設定がないため、デフォルト設定を使用",
      );
    }
  });

  // 回答待機時間設定の読み込み
  chrome.storage.local.get("responseWaitConfig", (result) => {
    if (result.responseWaitConfig) {
      // Chrome Storageの設定で回答待機時間設定を上書き
      Object.assign(BATCH_PROCESSING_CONFIG, result.responseWaitConfig);

      console.log("⏱️ [step3-tasklist] 回答待機時間設定を読み込みました:", {
        MAX_RESPONSE_WAIT_TIME:
          BATCH_PROCESSING_CONFIG.MAX_RESPONSE_WAIT_TIME / 60000 + "分",
        MAX_RESPONSE_WAIT_TIME_DEEP:
          BATCH_PROCESSING_CONFIG.MAX_RESPONSE_WAIT_TIME_DEEP / 60000 + "分",
        MAX_RESPONSE_WAIT_TIME_AGENT:
          BATCH_PROCESSING_CONFIG.MAX_RESPONSE_WAIT_TIME_AGENT / 60000 + "分",
        STOP_CHECK_INTERVAL:
          BATCH_PROCESSING_CONFIG.STOP_CHECK_INTERVAL / 1000 + "秒",
      });
    }
  });

  // ウィンドウ初期化タイムアウト設定の読み込み
  chrome.storage.local.get("windowInitConfig", (result) => {
    if (result.windowInitConfig) {
      // Chrome Storageの設定でウィンドウ初期化設定を上書き
      Object.assign(BATCH_PROCESSING_CONFIG, result.windowInitConfig);

      console.log("🪟 [step3-tasklist] ウィンドウ初期化設定を読み込みました:", {
        WINDOW_CREATION_WAIT:
          BATCH_PROCESSING_CONFIG.WINDOW_CREATION_WAIT / 1000 + "秒",
        TAB_READY_TIMEOUT:
          BATCH_PROCESSING_CONFIG.TAB_READY_TIMEOUT / 1000 + "秒",
        CONTENT_SCRIPT_WAIT:
          BATCH_PROCESSING_CONFIG.CONTENT_SCRIPT_WAIT / 1000 + "秒",
        ELEMENT_RETRY_COUNT: BATCH_PROCESSING_CONFIG.ELEMENT_RETRY_COUNT + "回",
        ELEMENT_RETRY_INTERVAL:
          BATCH_PROCESSING_CONFIG.ELEMENT_RETRY_INTERVAL / 1000 + "秒",
      });
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
 * Step 4-3: AI処理の並列実行とエラーハンドリング
 */

// 初期化ログ（簡略化）
log.info("[3-0] ✅ [step3-tasklist.js] 初期化完了");
log.info("[3-0] 🔧 [バッチ処理設定]", {
  // 基本設定
  ENABLE_ASYNC_BATCH: BATCH_PROCESSING_CONFIG.ENABLE_ASYNC_BATCH,
  ENABLE_INDIVIDUAL_COMPLETION:
    BATCH_PROCESSING_CONFIG.ENABLE_INDIVIDUAL_COMPLETION,
  ENABLE_IMMEDIATE_SPREADSHEET:
    BATCH_PROCESSING_CONFIG.ENABLE_IMMEDIATE_SPREADSHEET,
  ENABLE_IMMEDIATE_WINDOW_CLOSE:
    BATCH_PROCESSING_CONFIG.ENABLE_IMMEDIATE_WINDOW_CLOSE,
  ENABLE_DYNAMIC_NEXT_TASK: BATCH_PROCESSING_CONFIG.ENABLE_DYNAMIC_NEXT_TASK,
  SAFE_MODE: BATCH_PROCESSING_CONFIG.SAFE_MODE,
  // バッチ完了待機設定
  WAIT_FOR_BATCH_COMPLETION: BATCH_PROCESSING_CONFIG.WAIT_FOR_BATCH_COMPLETION,
  // 待機時間設定
  SPREADSHEET_WAIT_TIME: `${BATCH_PROCESSING_CONFIG.SPREADSHEET_WAIT_TIME}ms`,
  WINDOW_CLOSE_WAIT_TIME: `${BATCH_PROCESSING_CONFIG.WINDOW_CLOSE_WAIT_TIME}ms`,
});

/**
 * オブジェクトを安全にJSONシリアライズする関数
 * 循環参照や[object Object]エラーを回避
 */
function safeStringify(obj, maxDepth = 3) {
  const seen = new WeakSet();

  function stringify(value, depth = 0) {
    // 深度制限
    if (depth > maxDepth) {
      return "[Max Depth Exceeded]";
    }

    // null や undefined の場合
    if (value === null) return "null";
    if (value === undefined) return "undefined";

    // プリミティブ型の場合
    if (typeof value !== "object") {
      if (typeof value === "string") return `"${value}"`;
      if (typeof value === "function") return "[Function]";
      if (typeof value === "symbol") return "[Symbol]";
      return String(value);
    }

    // 循環参照チェック
    if (seen.has(value)) {
      return "[Circular Reference]";
    }
    seen.add(value);

    try {
      // 配列の場合
      if (Array.isArray(value)) {
        const items = value
          .slice(0, 5)
          .map((item) => stringify(item, depth + 1));
        if (value.length > 5)
          items.push(`...and ${value.length - 5} more items`);
        return `[${items.join(", ")}]`;
      }

      // オブジェクトの場合
      const keys = Object.keys(value).slice(0, 5);
      const entries = keys.map((key) => {
        try {
          return `"${key}": ${stringify(value[key], depth + 1)}`;
        } catch (error) {
          return `"${key}": [Error: ${error.message}]`;
        }
      });

      if (Object.keys(value).length > 5) {
        entries.push(`...and ${Object.keys(value).length - 5} more properties`);
      }

      return `{${entries.join(", ")}}`;
    } catch (error) {
      return `[Error: ${error.message}]`;
    } finally {
      seen.delete(value);
    }
  }

  try {
    return stringify(obj);
  } catch (error) {
    return `[Stringify Error: ${error.message}]`;
  }
}

/**
 * 安全な非同期バッチ処理（将来実装用）
 * 既存のPromise.allSettledを拡張し、個別タスク完了時の即座処理を追加
 */
async function executeAsyncBatchProcessing(batchPromises, originalTasks = []) {
  if (BATCH_PROCESSING_CONFIG.SAFE_MODE) {
    // セーフモードでは既存処理にフォールバック
    return await Promise.allSettled(batchPromises);
  }

  log.info("[3-0] 🚀 [非同期バッチ処理] 個別完了処理対応モードで実行開始");

  const completedTasks = new Map();

  const enhancedPromises = batchPromises.map((promise, index) => {
    // 元のタスク情報を取得
    const originalTask = originalTasks[index] || {};

    // Promiseであることを確実にする
    const ensuredPromise = Promise.resolve(promise);

    return ensuredPromise
      .then(async (result) => {
        try {
          // 元のタスク情報を結果にマージ（結果側の値を優先）
          const enhancedResult = {
            ...result,
            // 【修正】column情報の適切な取得
            column:
              result.column ||
              originalTask.column ||
              originalTask.cellRef?.match(/([A-Z]+)/)?.[1] ||
              originalTask.answerCell?.match(/([A-Z]+)/)?.[1],
            // 【修正】row情報の適切な取得
            row:
              result.row ||
              originalTask.row ||
              parseInt(
                originalTask.cellRef?.match(/(\d+)/)?.[1] ||
                  originalTask.answerCell?.match(/(\d+)/)?.[1] ||
                  "0",
              ),
            windowId: result.windowId || originalTask.windowId,
            response: result.response,
          };

          // 【仮説検証】詳細デバッグログ追加
          log.debug(
            `[3-0] 🔍 [仮説検証] タスク[${index}] enhancedResult生成詳細:`,
            {
              originalTask: {
                taskId: originalTask.id,
                column: originalTask.column,
                row: originalTask.row,
                cellRef: originalTask.cellRef,
                answerCell: originalTask.answerCell,
                windowId: originalTask.windowId,
              },
              result: {
                taskId: result.taskId,
                column: result.column,
                row: result.row,
                windowId: result.windowId,
                success: result.success,
                hasResponse: !!result.response,
              },
              enhancedResult: {
                taskId: enhancedResult.taskId,
                column: enhancedResult.column,
                row: enhancedResult.row,
                windowId: enhancedResult.windowId,
                success: enhancedResult.success,
                hasResponse: !!enhancedResult.response,
              },
              timestamp: new Date().toISOString(),
            },
          );

          log.info(`[3-0] ✅ [個別完了] タスク[${index}]完了:`, {
            success: enhancedResult.success,
            taskId: enhancedResult.taskId,
            windowId: enhancedResult.windowId,
            column: enhancedResult.column,
            row: enhancedResult.row,
            hasResponse: !!enhancedResult.response,
          });

          log.debug(`[3-0] 🔍 [個別完了判定] タスク[${index}]`, {
            success: enhancedResult.success,
            ENABLE_INDIVIDUAL_COMPLETION:
              BATCH_PROCESSING_CONFIG.ENABLE_INDIVIDUAL_COMPLETION,
            willCallHandler:
              enhancedResult.success &&
              BATCH_PROCESSING_CONFIG.ENABLE_INDIVIDUAL_COMPLETION,
          });

          if (
            enhancedResult.success &&
            BATCH_PROCESSING_CONFIG.ENABLE_INDIVIDUAL_COMPLETION
          ) {
            log.info(
              `[3-0] 🚀 [個別完了] handleIndividualTaskCompletion呼び出し開始: タスク[${index}]`,
            );
            // 個別タスク完了時の即座処理（拡張された結果を渡す）
            await handleIndividualTaskCompletion(enhancedResult, index);
            log.info(
              `[3-0] ✅ [個別完了] handleIndividualTaskCompletion呼び出し完了: タスク[${index}]`,
            );
          } else {
            log.warn(
              `[3-0] ⚠️ [個別完了] handleIndividualTaskCompletion呼び出しスキップ: タスク[${index}]`,
              {
                success: enhancedResult.success,
                ENABLE_INDIVIDUAL_COMPLETION:
                  BATCH_PROCESSING_CONFIG.ENABLE_INDIVIDUAL_COMPLETION,
              },
            );
          }

          completedTasks.set(index, enhancedResult);
          return { status: "fulfilled", value: enhancedResult };
        } catch (error) {
          log.error(`[3-0] ❌ [個別完了処理エラー] タスク[${index}]:`, error);
          const errorResult = { status: "rejected", reason: error };
          completedTasks.set(index, errorResult);
          return errorResult;
        }
      })
      .catch((error) => {
        log.error(`[3-0] ❌ [タスク実行エラー] タスク[${index}]:`, error);
        const errorResult = { status: "rejected", reason: error };
        completedTasks.set(index, errorResult);
        return errorResult;
      });
  });

  // 全てのタスクの完了を待機
  const results = await Promise.all(enhancedPromises);

  log.info(`[3-0] 🏁 [非同期バッチ処理] 全タスク完了:`, {
    total: results.length,
    fulfilled: results.filter((r) => r.status === "fulfilled").length,
    rejected: results.filter((r) => r.status === "rejected").length,
  });

  return results;
}

/**
 * 個別タスク完了時の処理（安全実装）
 */
async function handleIndividualTaskCompletion(result, taskIndex) {
  log.info(`[3-0] 🎯🎯🎯 [個別完了処理] 関数呼び出し開始 タスク[${taskIndex}]`);

  try {
    log.info(`[3-0] 🎯 [個別完了処理] タスク[${taskIndex}]開始:`, {
      taskId: result.taskId,
      success: result.success,
      hasResponse: !!result.response,
      BATCH_CONFIG: {
        ENABLE_IMMEDIATE_SPREADSHEET:
          BATCH_PROCESSING_CONFIG.ENABLE_IMMEDIATE_SPREADSHEET,
        ENABLE_IMMEDIATE_WINDOW_CLOSE:
          BATCH_PROCESSING_CONFIG.ENABLE_IMMEDIATE_WINDOW_CLOSE,
        ENABLE_DYNAMIC_NEXT_TASK:
          BATCH_PROCESSING_CONFIG.ENABLE_DYNAMIC_NEXT_TASK,
      },
    });

    // Phase 2: 即座スプレッドシート記載
    if (
      BATCH_PROCESSING_CONFIG.ENABLE_IMMEDIATE_SPREADSHEET &&
      result.success
    ) {
      await immediateSpreadsheetUpdate(result, taskIndex);
    }

    // Phase 3: 即座ウィンドウクローズ
    if (
      BATCH_PROCESSING_CONFIG.ENABLE_IMMEDIATE_WINDOW_CLOSE &&
      result.windowId
    ) {
      await immediateWindowClose(result.windowId, taskIndex);

      // 重要: ウィンドウクローズ完了を確実に待機
      if (BATCH_PROCESSING_CONFIG.WINDOW_CLOSE_WAIT_TIME > 0) {
        log.info(
          `[3-0] ⏰ [TASK-FLOW-TRACE] ウィンドウクローズ完了待機: ${result.windowId} (${BATCH_PROCESSING_CONFIG.WINDOW_CLOSE_WAIT_TIME}ms)`,
        );
        await new Promise((resolve) =>
          setTimeout(resolve, BATCH_PROCESSING_CONFIG.WINDOW_CLOSE_WAIT_TIME),
        );
        log.info(
          `[3-0] ✅ [TASK-FLOW-TRACE] ウィンドウクローズ完了待機終了: ${result.windowId}`,
        );
      } else {
        log.info(
          `[3-0] ⚡ [TASK-FLOW-TRACE] ウィンドウクローズ後の待機をスキップ (設定: 0ms)`,
        );
      }
    }

    // Phase 4: 動的次タスク探索
    log.info(`[3-0] 🔍 [TASK-FLOW-TRACE] Phase 4開始 - 動的次タスク探索:`, {
      taskIndex: taskIndex,
      taskId: result.taskId,
      ENABLE_DYNAMIC_NEXT_TASK:
        BATCH_PROCESSING_CONFIG.ENABLE_DYNAMIC_NEXT_TASK,
      タイムスタンプ: new Date().toISOString(),
    });

    if (BATCH_PROCESSING_CONFIG.ENABLE_DYNAMIC_NEXT_TASK) {
      // DynamicTaskSearchにタスク完了を登録
      log.info(`[3-0] 🔍 [TASK-FLOW-TRACE] 完了登録プロセス開始:`, {
        hasRegisterFunction:
          typeof window.registerTaskCompletionDynamic === "function",
        hasTaskId: !!result.taskId,
        resultColumn: result.column,
        resultRow: result.row,
        taskIndex: taskIndex,
        タイムスタンプ: new Date().toISOString(),
      });

      if (
        typeof window.registerTaskCompletionDynamic === "function" &&
        result.taskId
      ) {
        const taskId =
          result.column && result.row
            ? `${result.column}${result.row}`
            : result.taskId;

        log.info(`[3-0] 🔍 [TASK-FLOW-TRACE] 完了登録実行中:`, {
          taskId: taskId,
          originalTaskId: result.taskId,
          taskIndex: taskIndex,
          generatedFrom: result.column && result.row ? "column+row" : "taskId",
          タイムスタンプ: new Date().toISOString(),
        });

        try {
          // 【追加】完了状態を両システムに同期

          // DynamicTaskSearchに登録
          window.registerTaskCompletionDynamic(taskId);

          // グローバルレジストリにも登録
          if (window.globalCompletedTasks) {
            window.globalCompletedTasks.add(taskId);
          }

          log.info(
            `[3-0] ✅ [TASK-FLOW-TRACE] DynamicTaskSearch完了登録成功: ${taskId}`,
            {
              taskIndex: taskIndex,
              登録時刻: new Date().toISOString(),
            },
          );
        } catch (error) {
          log.error(
            `[3-0] ❌ [TASK-FLOW-TRACE] DynamicTaskSearch完了登録エラー:`,
            {
              taskId: taskId,
              taskIndex: taskIndex,
              error: error.message,
              stack: error.stack,
              タイムスタンプ: new Date().toISOString(),
            },
          );
        }
      } else {
        log.warn(`[3-0] ⚠️ [TASK-FLOW-TRACE] 完了登録スキップ - 条件未満:`, {
          hasRegisterFunction:
            typeof window.registerTaskCompletionDynamic === "function",
          hasTaskId: !!result.taskId,
          taskIndex: taskIndex,
          タイムスタンプ: new Date().toISOString(),
        });
      }

      // 【修正】スプレッドシート書き込み完了を待機してから次タスク探索
      // Google Sheets APIの書き込み反映に時間が必要（設定可能）
      const waitTime = BATCH_PROCESSING_CONFIG.SPREADSHEET_WAIT_TIME || 10000;

      if (waitTime > 0) {
        log.info(
          `[3-0] ⏰ [TASK-FLOW-TRACE] ${waitTime}ms待機開始 - スプレッドシート反映待ち:`,
          {
            taskIndex: taskIndex,
            taskId: result.taskId,
            待機開始時刻: new Date().toISOString(),
            待機終了予定時刻: new Date(Date.now() + waitTime).toISOString(),
          },
        );

        setTimeout(() => {
          log.info(
            `[3-0] ⏰ [TASK-FLOW-TRACE] ${waitTime}ms待機完了 - 次タスク探索開始:`,
            {
              taskIndex: taskIndex,
              taskId: result.taskId,
              実際の待機完了時刻: new Date().toISOString(),
            },
          );

          startNextTaskIfAvailable(taskIndex).catch((error) => {
            log.error(
              `[3-0] ❌ [TASK-FLOW-TRACE] 次タスク探索エラー[${taskIndex}]:`,
              {
                error: error.message,
                stack: error.stack,
                taskId: result.taskId,
                エラー発生時刻: new Date().toISOString(),
              },
            );
          });
        }, waitTime); // 設定可能な待機時間
      } else {
        log.info(
          `[3-0] ⚡ [TASK-FLOW-TRACE] スプレッドシート反映待機をスキップ (設定: 0ms)`,
        );
        // 待機せずに即座に次タスク探索
        startNextTaskIfAvailable(taskIndex).catch((error) => {
          log.error(
            `[3-0] ❌ [TASK-FLOW-TRACE] 次タスク探索エラー[${taskIndex}]:`,
            {
              error: error.message,
              stack: error.stack,
              taskId: result.taskId,
              エラー発生時刻: new Date().toISOString(),
            },
          );
        });
      }
    } else {
      log.warn(
        `[3-0] ⚠️ [TASK-FLOW-TRACE] Phase 4スキップ - ENABLE_DYNAMIC_NEXT_TASK無効:`,
        {
          taskIndex: taskIndex,
          設定値: BATCH_PROCESSING_CONFIG.ENABLE_DYNAMIC_NEXT_TASK,
          タイムスタンプ: new Date().toISOString(),
        },
      );
    }

    log.info(`[3-0] ✅ [個別完了処理] タスク[${taskIndex}]完了`);
  } catch (error) {
    log.error(`[3-0] ❌ [個別完了処理エラー] タスク[${taskIndex}]:`, error);
  }
}

/**
 * Phase 2: 即座スプレッドシート記載機能
 */
async function immediateSpreadsheetUpdate(result, taskIndex) {
  try {
    // SimpleSheetsClient初期化状態チェック

    log.info(`[3-0] 📊 [即座スプレッドシート] タスク[${taskIndex}]記載開始:`, {
      taskId: result.taskId,
      column: result.column,
      row: result.row,
      hasResponse: !!result.response,
    });

    // 【仮説検証】詳細な事前チェックログ
    log.debug(
      `[3-0] 🔍 [仮説検証] スプレッドシート書き込み事前チェック[${taskIndex}]:`,
      {
        result: {
          taskId: result.taskId,
          column: result.column,
          columnType: typeof result.column,
          row: result.row,
          rowType: typeof result.row,
          response: result.response
            ? result.response.substring(0, 100) + "..."
            : null,
          responseLength: result.response ? result.response.length : 0,
          hasResponse: !!result.response,
          allResultKeys: Object.keys(result),
        },
        globalState: {
          spreadsheetId: window.globalState?.spreadsheetId,
          hasSimpleSheetsClient: !!window.simpleSheetsClient,
          simpleSheetsClientMethods: window.simpleSheetsClient
            ? Object.getOwnPropertyNames(
                Object.getPrototypeOf(window.simpleSheetsClient),
              )
            : [],
        },
        timestamp: new Date().toISOString(),
      },
    );

    // スプレッドシート記載に必要な情報を確認
    const responseText = this.extractResultText(result);
    if (!result.column || !result.row || !responseText) {
      console.error(
        `❌ [仮説検証] スプレッドシート書き込み失敗 - 記載情報不足[${taskIndex}]:`,
        {
          hasColumn: !!result.column,
          hasRow: !!result.row,
          hasResponse: !!responseText,
          column: result.column,
          row: result.row,
          responseLength: responseText ? responseText.length : 0,
          thisIsTheRootCause: !result.column || !result.row || !responseText,
        },
      );
      return;
    }

    // SimpleSheetsClientを使用してスプレッドシートを更新
    // 初期化されていない場合はここで初期化を試みる
    if (!window.simpleSheetsClient && window.SimpleSheetsClient) {
      console.log("⚠️ [初期化] simpleSheetsClientを初期化します");
      window.simpleSheetsClient = new window.SimpleSheetsClient();
    }

    if (
      window.simpleSheetsClient &&
      typeof window.simpleSheetsClient.updateCell === "function"
    ) {
      // spreadsheetIdを取得（globalStateまたは他のソースから）
      const spreadsheetId =
        window.globalState?.spreadsheetId ||
        window.currentSpreadsheetId ||
        localStorage.getItem("spreadsheetId");

      if (!spreadsheetId) {
        log.error(
          `[3-0] ❌ [即座スプレッドシート] spreadsheetId未設定[${taskIndex}]`,
        );
        return;
      }

      // セル参照を作成（例：column=3, row=5 -> "C5"、column="C", row=5 -> "C5"）
      let columnLetter;
      if (typeof result.column === "string") {
        // すでに文字列の場合（"C"など）
        columnLetter = result.column;
      } else if (typeof result.column === "number") {
        // 数値の場合（3 -> "C"）
        columnLetter = String.fromCharCode(64 + result.column); // 1->A, 2->B, 3->C
      } else {
        log.error(
          `[3-0] ❌ [即座スプレッドシート] 不正な列型[${taskIndex}]:`,
          typeof result.column,
        );
        return;
      }
      const cellRef = `${columnLetter}${result.row}`;

      // 【仮説検証】書き込み実行前ログ
      log.debug(
        `[3-0] 🔍 [仮説検証] スプレッドシート書き込み実行[${taskIndex}]:`,
        {
          spreadsheetId: spreadsheetId,
          cellRef: cellRef,
          columnLetter: columnLetter,
          originalColumn: result.column,
          originalRow: result.row,
          responseLength: responseText.length,
          aboutToCallUpdateCell: true,
        },
      );

      const updateResult = await window.simpleSheetsClient.updateCell(
        spreadsheetId,
        cellRef,
        responseText,
      );

      // 【仮説検証】書き込み成功ログ
      log.debug(
        `[3-0] ✅ [仮説検証] スプレッドシート書き込み成功[${taskIndex}]:`,
        {
          requestedCell: cellRef,
          actualCell: updateResult?.updatedRange || cellRef,
          column: result.column,
          row: result.row,
          success: updateResult?.success || true,
          updateResult: updateResult,
          writeWasSuccessful: true,
        },
      );

      log.info(`[3-0] ✅ [即座スプレッドシート] 記載完了[${taskIndex}]:`, {
        requestedCell: cellRef,
        actualCell: updateResult?.updatedRange || cellRef,
        column: result.column,
        row: result.row,
        success: updateResult?.success || true,
      });
    } else {
      // SimpleSheetsClient利用不可
      log.error(
        `[3-0] ❌ [即座スプレッドシート] SimpleSheetsClient利用不可[${taskIndex}]`,
      );
    }
  } catch (error) {
    log.error(`[3-0] ❌ [即座スプレッドシート] エラー[${taskIndex}]:`, error);
  }
}

/**
 * Phase 3: 即座ウィンドウクローズ機能
 */
async function immediateWindowClose(windowId, taskIndex) {
  try {
    log.info(`[3-0] 🪟 [即座ウィンドウクローズ] タスク[${taskIndex}]開始:`, {
      windowId,
    });

    // ウィンドウクローズ完了を確実に待機
    try {
      await chrome.windows.remove(windowId);
      log.info(
        `[3-0] ✅ [ウィンドウクローズ完了] タスク[${taskIndex}]: windowId=${windowId}`,
      );

      // 追加の待機時間でクローズ確実性を向上
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (err) {
      log.warn(`[3-0] ⚠️ [ウィンドウクローズ警告] タスク[${taskIndex}]:`, err);
    }

    // WindowControllerから削除
    if (
      window.windowController &&
      typeof window.windowController.removeClosedWindow === "function"
    ) {
      await window.windowController.removeClosedWindow(windowId);
    }

    log.info(`[3-0] ✅ [即座ウィンドウクローズ] 完了[${taskIndex}]:`, {
      windowId,
    });
  } catch (error) {
    log.error(`[3-0] ❌ [即座ウィンドウクローズ] エラー[${taskIndex}]:`, error);
  }
}

/**
 * Phase 4: 動的次タスク探索システム
 */

// 無限ループ防止用の状態追跡
const groupTransitionState = {
  consecutiveNoTasksCount: 0,
  lastTransitionAttempt: null,
  maxConsecutiveAttempts: 3,
  lastTaskIndex: null,
};

// グローバル完了タスクレジストリの初期化
if (!window.globalCompletedTasks) {
  window.globalCompletedTasks = new Set();
  log.info(
    `[3-1] 📋 [GLOBAL-REGISTRY] グローバル完了タスクレジストリ初期化完了`,
  );
}

// ========================================
// [3-1] タスク探索開始
// ========================================
async function startNextTaskIfAvailable(taskIndex) {
  try {
    log.info(`[3-1] 🔍 [TASK-FLOW-TRACE] startNextTaskIfAvailable開始:`, {
      taskIndex: taskIndex,
      開始時刻: new Date().toISOString(),
    });

    // デバッグ: 設定値と状態を確認
    log.info("[3-1] 🔍 [TASK-FLOW-TRACE] 次タスク探索システム状態確認:", {
      taskIndex: taskIndex,
      ENABLE_DYNAMIC_NEXT_TASK:
        BATCH_PROCESSING_CONFIG.ENABLE_DYNAMIC_NEXT_TASK,
      hasFindNextAvailableTaskDynamic:
        typeof window.findNextAvailableTaskDynamic === "function",
      hasRegisterTaskCompletionDynamic:
        typeof window.registerTaskCompletionDynamic === "function",
      currentGroup: window.globalState?.currentGroup,
      globalStateExists: !!window.globalState,
      spreadsheetId: window.globalState?.spreadsheetId,
      状態確認時刻: new Date().toISOString(),
    });

    // 利用可能なタスクを動的に検索
    log.info(`[3-1] 🔍 [TASK-FLOW-TRACE] findNextAvailableTask呼び出し開始:`, {
      taskIndex: taskIndex,
      呼び出し開始時刻: new Date().toISOString(),
    });

    const nextTask = await findNextAvailableTask();

    log.info(`[3-1] 🔍 [TASK-FLOW-TRACE] findNextAvailableTask結果:`, {
      taskIndex: taskIndex,
      hasNextTask: !!nextTask,
      nextTaskId: nextTask?.id,
      nextTaskAiType: nextTask?.aiType,
      nextTaskColumn: nextTask?.column,
      nextTaskRow: nextTask?.row,
      検索結果時刻: new Date().toISOString(),
    });

    if (nextTask) {
      log.info(
        `[3-1] 🚀 [TASK-FLOW-TRACE] 次タスク発見 - ウィンドウ開設開始[${taskIndex}]:`,
        {
          nextTaskId: nextTask.id,
          aiType: nextTask.aiType,
          column: nextTask.column,
          row: nextTask.row,
          ウィンドウ開設開始時刻: new Date().toISOString(),
        },
      );

      // 新しいウィンドウを開いて即座に開始
      const windowInfo = await openAIWindowForTask(nextTask);

      log.info(`[3-1] 🔍 [TASK-FLOW-TRACE] ウィンドウ開設結果:`, {
        taskIndex: taskIndex,
        nextTaskId: nextTask.id,
        hasWindowInfo: !!windowInfo,
        windowId: windowInfo?.windowId,
        tabId: windowInfo?.tabId,
        ウィンドウ開設完了時刻: new Date().toISOString(),
      });

      if (windowInfo) {
        nextTask.tabId = windowInfo.tabId;
        nextTask.windowId = windowInfo.windowId;

        log.info(`[3-1] 🚀 [TASK-FLOW-TRACE] タスク独立実行開始:`, {
          taskIndex: taskIndex,
          nextTaskId: nextTask.id,
          tabId: nextTask.tabId,
          windowId: nextTask.windowId,
          実行開始時刻: new Date().toISOString(),
        });

        // 【修正】タスク発見時はカウンターをリセット
        groupTransitionState.consecutiveNoTasksCount = 0;
        log.debug(
          `[3-1] 🔄 [LOOP-PREVENTION] カウンターリセット[${taskIndex}] - タスク発見`,
        );

        // 非同期で実行開始
        executeTaskIndependently(nextTask);
      } else {
        log.error(`[3-1] ❌ [TASK-FLOW-TRACE] ウィンドウ開設失敗:`, {
          taskIndex: taskIndex,
          nextTaskId: nextTask.id,
          エラー時刻: new Date().toISOString(),
        });
      }
    } else {
      log.info(`[3-1] 📭 [TASK-FLOW-TRACE] 利用可能タスクなし[${taskIndex}]:`, {
        taskIndex: taskIndex,
        理由: "findNextAvailableTaskがnullを返却",
        確認時刻: new Date().toISOString(),
      });

      // 【修正】無限ループ防止チェック
      groupTransitionState.consecutiveNoTasksCount++;
      const timeSinceLastAttempt = groupTransitionState.lastTransitionAttempt
        ? Date.now() - groupTransitionState.lastTransitionAttempt
        : Infinity;

      log.info(`[3-1] 🔍 [LOOP-PREVENTION] 無限ループ防止状態[${taskIndex}]:`, {
        taskIndex: taskIndex,
        consecutiveNoTasksCount: groupTransitionState.consecutiveNoTasksCount,
        maxConsecutiveAttempts: groupTransitionState.maxConsecutiveAttempts,
        timeSinceLastAttempt: timeSinceLastAttempt,
        shouldProceed:
          groupTransitionState.consecutiveNoTasksCount <=
            groupTransitionState.maxConsecutiveAttempts ||
          timeSinceLastAttempt > 30000,
        チェック時刻: new Date().toISOString(),
      });

      // 連続試行回数制限または30秒経過後なら処理を続行
      if (
        groupTransitionState.consecutiveNoTasksCount <=
          groupTransitionState.maxConsecutiveAttempts ||
        timeSinceLastAttempt > 30000
      ) {
        // 【修正】利用可能タスクなし - グループ完了チェックと移行処理
        log.info(
          `[3-1] 🔍 [GROUP-TRANSITION] グループ完了チェック開始[${taskIndex}]:`,
          {
            taskIndex: taskIndex,
            attemptNumber: groupTransitionState.consecutiveNoTasksCount,
            開始時刻: new Date().toISOString(),
          },
        );

        groupTransitionState.lastTransitionAttempt = Date.now();
        groupTransitionState.lastTaskIndex = taskIndex;

        await checkAndHandleGroupCompletion(taskIndex);
      } else {
        log.warn(
          `[3-2] ⚠️ [LOOP-PREVENTION] 無限ループ防止により処理スキップ[${taskIndex}]:`,
          {
            taskIndex: taskIndex,
            consecutiveAttempts: groupTransitionState.consecutiveNoTasksCount,
            maxAllowed: groupTransitionState.maxConsecutiveAttempts,
            スキップ時刻: new Date().toISOString(),
          },
        );
      }
    }
  } catch (error) {
    log.error(`[3-2] ❌ [次タスク探索] エラー[${taskIndex}]:`, error);
  }
}

// ========================================
// [3-2] 次タスク検索
// ========================================

/**
 * 利用可能な次タスクを検索
 */
async function findNextAvailableTask() {
  try {
    log.info("[3-2] 🔍 [TASK-FLOW-TRACE] findNextAvailableTask開始:", {
      開始時刻: new Date().toISOString(),
    });

    // デバッグ: 利用可能な機能を確認
    log.info("[3-2] 🔍 [TASK-FLOW-TRACE] システム機能確認:", {
      hasDynamicSearch:
        typeof window.findNextAvailableTaskDynamic === "function",
      hasRegisterCompletion:
        typeof window.registerTaskCompletionDynamic === "function",
      hasDynamicTaskSearchClass:
        typeof window.DynamicTaskSearch !== "undefined",
      globalState: {
        exists: !!window.globalState,
        currentGroup: window.globalState?.currentGroup,
        spreadsheetId: window.globalState?.spreadsheetId,
      },
      機能確認時刻: new Date().toISOString(),
    });

    // step4.5-dynamic-search.jsの動的検索システムを使用
    if (typeof window.findNextAvailableTaskDynamic === "function") {
      log.info("[3-2] 🔗 [TASK-FLOW-TRACE] DynamicTaskSearch使用開始:", {
        システム: "window.findNextAvailableTaskDynamic",
        呼び出し開始時刻: new Date().toISOString(),
      });

      try {
        const nextTask = await window.findNextAvailableTaskDynamic();

        log.info("[3-2] 🔍 [TASK-FLOW-TRACE] DynamicTaskSearch検索結果:", {
          hasNextTask: !!nextTask,
          nextTaskId: nextTask?.id,
          nextTaskAiType: nextTask?.aiType,
          nextTaskRow: nextTask?.row,
          nextTaskColumn: nextTask?.column,
          nextTaskPrompt: nextTask?.prompt?.substring(0, 50),
          検索完了時刻: new Date().toISOString(),
        });

        if (nextTask) {
          log.info(
            "[3-2] ✅ [TASK-FLOW-TRACE] DynamicTaskSearchで次タスク発見:",
            {
              taskId: nextTask.id,
              aiType: nextTask.aiType,
              row: nextTask.row,
              column: nextTask.column,
              発見時刻: new Date().toISOString(),
            },
          );
          return nextTask;
        } else {
          log.info("[3-2] 📭 [TASK-FLOW-TRACE] DynamicTaskSearch結果なし:", {
            理由: "利用可能タスクなし - グループ完了の可能性",
            検索完了時刻: new Date().toISOString(),
          });
        }
      } catch (error) {
        log.error("[3-2] ❌ [TASK-FLOW-TRACE] DynamicTaskSearchエラー:", {
          error: error.message,
          stack: error.stack,
          エラー発生時刻: new Date().toISOString(),
        });
      }
    } else {
      log.warn("[3-2] ⚠️ [TASK-FLOW-TRACE] DynamicTaskSearch利用不可:", {
        hasDynamicFunction:
          typeof window.findNextAvailableTaskDynamic === "function",
        理由: "window.findNextAvailableTaskDynamic関数が存在しない",
        確認時刻: new Date().toISOString(),
      });
    }

    // フォールバック: 従来の方法
    if (typeof window.processIncompleteTasks === "function") {
      // 既存のタスク処理システムを活用
      log.debug("[3-2] 🔗 [次タスク検索] 既存システム活用（フォールバック）");
      return null; // 既存システムに委譲
    }

    // 緊急時の代替実装：現在のタスクリストから次の未処理タスクを探す
    if (window.currentTaskList && Array.isArray(window.currentTaskList)) {
      const availableTask = window.currentTaskList.find(
        (task) => task && !task.completed && !task.processing && task.prompt,
      );

      if (availableTask) {
        log.info("[3-2] 🎯 [次タスク検索] 発見（フォールバック）:", {
          taskId: availableTask.id,
          aiType: availableTask.aiType,
        });

        // タスクを処理中としてマーク
        availableTask.processing = true;
        return availableTask;
      }
    }

    log.debug("[3-2] 📭 [次タスク検索] 利用可能タスクなし");
    return null;
  } catch (error) {
    log.error("[3-2] ❌ [次タスク検索] エラー:", error);
    return null;
  }
}

// ========================================
// [3-3] タスク実行
// ========================================

/**
 * タスクを独立して実行
 */
async function executeTaskIndependently(task) {
  try {
    log.info("[3-3] 🔍 [TASK-FLOW-TRACE] executeTaskIndependently開始:", {
      taskId: task.id,
      aiType: task.aiType,
      column: task.column,
      row: task.row,
      hasTabId: !!task.tabId,
      tabId: task.tabId,
      hasWindowId: !!task.windowId,
      windowId: task.windowId,
      hasLogCell: !!task.logCell,
      logCell: task.logCell || "未設定",
      実行開始時刻: new Date().toISOString(),
    });

    // Content Script初期化待機（新しいウィンドウの場合）
    if (task.tabId && task.windowId) {
      log.info("[3-3] ⏰ [TASK-FLOW-TRACE] Content Script初期化待機開始:", {
        taskId: task.id,
        tabId: task.tabId,
        windowId: task.windowId,
        待機時間: "3秒",
        待機開始時刻: new Date().toISOString(),
      });

      await new Promise((resolve) => setTimeout(resolve, 3000)); // 3秒待機

      log.info("[3-3] ⏰ [TASK-FLOW-TRACE] Content Script初期化待機完了:", {
        taskId: task.id,
        tabId: task.tabId,
        待機完了時刻: new Date().toISOString(),
      });

      // Content Script準備確認
      try {
        const response = await chrome.tabs.sendMessage(task.tabId, {
          action: "ping",
          from: "independent-task-executor",
        });
        log.info("[3-3] ✅ [TASK-FLOW-TRACE] Content Script準備確認成功:", {
          taskId: task.id,
          tabId: task.tabId,
          response: response,
          確認成功時刻: new Date().toISOString(),
        });
      } catch (e) {
        log.warn("[3-3] ⚠️ [TASK-FLOW-TRACE] Content Script未応答:", {
          taskId: task.id,
          tabId: task.tabId,
          error: e.message,
          エラー時刻: new Date().toISOString(),
          処理: "続行",
        });
      }
    } else {
      log.warn("[3-3] ⚠️ [TASK-FLOW-TRACE] タブ/ウィンドウ情報不足:", {
        taskId: task.id,
        hasTabId: !!task.tabId,
        hasWindowId: !!task.windowId,
        タイムスタンプ: new Date().toISOString(),
      });
    }

    // windowに保存されたexecuteNormalAITask関数をチェック
    if (
      window._executeNormalAITask &&
      typeof window._executeNormalAITask === "function"
    ) {
      log.debug("[3-3] 🔍 [独立タスク実行] _executeNormalAITask使用");
      const result = await window._executeNormalAITask(task);

      log.info("[3-3] ✅ [独立タスク実行] 完了:", {
        taskId: task.id,
        success: result?.success,
      });

      // 完了後の処理（スプレッドシート記載、ウィンドウクローズ）
      if (result?.success) {
        // 【修正】タスク情報を結果にマージして渡す
        const enhancedResult = {
          ...result,
          taskId: result.taskId || task.id,
          column: result.column || task.column,
          row: result.row || task.row,
          windowId: result.windowId || task.windowId,
          aiType: result.aiType || task.aiType,
        };

        // 個別完了処理を実行
        await handleIndividualTaskCompletion(enhancedResult, "independent");
      }

      return result;
    } else {
      log.warn(
        "[3-3] ⚠️ [独立タスク実行] window._executeNormalAITask関数が利用不可、簡易実行モードを使用",
      );
      // 簡易実行モードで直接タスクを実行
      const result = await executeSimpleTask(task);
      return result;
    }
  } catch (error) {
    log.error("[3-3] ❌ [独立タスク実行] エラー:", error);
    return { success: false, error: error.message };
  }
}

/**
 * 簡易タスク実行（動的タスク用）
 */
async function executeSimpleTask(task) {
  try {
    // WindowControllerからタブ情報を取得
    const windowInfo = window.windowController?.openedWindows?.get(
      task.aiType?.toLowerCase(),
    );
    const tabId = windowInfo?.tabId || task.tabId;

    if (!tabId) {
      log.error("[3-3] ❌ [簡易タスク実行] タブIDが見つかりません");
      return { success: false, error: "Tab ID not found" };
    }

    log.info("[3-3] 📝 [簡易タスク実行] タスク送信開始:", {
      taskId: task.id,
      tabId: tabId,
      aiType: task.aiType,
    });

    // Content Scriptに直接メッセージを送信
    const response = await chrome.tabs.sendMessage(tabId, {
      action: "executeTask",
      task: {
        ...task,
        taskId: task.id,
        tabId: tabId,
        model: task.model || "Claude Opus 4.1",
        function: task.function || "",
      },
      from: "step3-tasklist-simple",
    });

    log.info("[3-3] ✅ [簡易タスク実行] 応答受信:", {
      taskId: task.id,
      success: response?.success,
    });

    // 結果を記録
    if (response?.success && response?.response) {
      const cellRef = `${task.column}${task.row}`;
      await updateSpreadsheetCell(cellRef, response.response);
    }

    return {
      success: response?.success || false,
      response: response?.response,
      taskId: task.id,
    };
  } catch (error) {
    log.error("[3-3] ❌ [簡易タスク実行] エラー:", error);
    return { success: false, error: error.message };
  }
}

/**
 * スプレッドシートのセルを更新
 */
async function updateSpreadsheetCell(cellRef, value) {
  try {
    if (!window.globalState?.spreadsheetId || !window.globalState?.authToken) {
      log.warn("[3-3] ⚠️ [セル更新] 認証情報が不足");
      return;
    }

    // シート名が含まれていない場合は追加
    let fullCellRef = cellRef;
    if (!cellRef.includes("!")) {
      const sheetName =
        window.globalState?.sheetName ||
        `シート${window.globalState?.gid || "0"}`;
      fullCellRef = `'${sheetName}'!${cellRef}`;
    }

    const apiUrl = `https://sheets.googleapis.com/v4/spreadsheets/${window.globalState.spreadsheetId}/values/${encodeURIComponent(fullCellRef)}?valueInputOption=USER_ENTERED`;

    const response = await fetch(apiUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${window.globalState.authToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        values: [[value]],
      }),
    });

    if (response.ok) {
      log.info("[3-3] ✅ [セル更新] 成功:", cellRef);
    } else {
      log.error("[3-3] ❌ [セル更新] 失敗:", await response.text());
    }
  } catch (error) {
    log.error("[3-3] ❌ [セル更新] エラー:", error);
  }
}

// グローバルエラーハンドリング
if (typeof window !== "undefined") {
  window.step4FileError = null;

  // 未処理エラーの捕捉
  window.addEventListener("error", function (event) {
    if (event.filename && event.filename.includes("step3-tasklist.js")) {
      log.error("[3-3] ❌ [step3-tasklist.js] エラー:", event.error);
      window.step4FileError = event.error?.message || "未知のエラー";
    }
  });
}

// ========================================
// [3-4] グループ完了チェック
// ========================================

/**
 * グループ完了チェックと次のグループへの移行処理（シンプル版）
 * step2を呼び出して次のグループを準備
 */
async function checkAndHandleGroupCompletion(taskIndex) {
  try {
    log.info(
      `[3-4] 🔍 [GROUP-TRANSITION] グループ完了状態確認開始[${taskIndex}]:`,
      {
        taskIndex: taskIndex,
        currentGroup: window.globalState?.currentGroup?.groupNumber,
        開始時刻: new Date().toISOString(),
      },
    );

    const currentGroup = window.globalState?.currentGroup;
    if (!currentGroup) {
      log.warn(
        `[3-4] ⚠️ [GROUP-TRANSITION] 現在のグループ情報なし[${taskIndex}]`,
      );
      return;
    }

    // グループ完了判定
    if (!window.checkCompletionStatus) {
      log.error(
        `[3-4] ❌ [GROUP-TRANSITION] checkCompletionStatus未定義[${taskIndex}]`,
      );
      return;
    }

    const isGroupCompleted = await window.checkCompletionStatus(currentGroup);

    log.info(
      `[3-4] 📊 [GROUP-TRANSITION] グループ完了判定結果[${taskIndex}]:`,
      {
        taskIndex: taskIndex,
        groupNumber: currentGroup.groupNumber,
        isCompleted: isGroupCompleted,
        判定時刻: new Date().toISOString(),
      },
    );

    if (isGroupCompleted) {
      log.info(
        `[3-4] 🏁 [GROUP-TRANSITION] グループ${currentGroup.groupNumber}完了 - step2でタスクグループ再作成[${taskIndex}]`,
      );

      // step2を呼び出して次のグループを準備（タスクグループ作成+未完了グループ選択）
      if (!window.executeStep2) {
        log.error(
          `[3-4] ❌ [GROUP-TRANSITION] executeStep2未定義[${taskIndex}]`,
        );
        return;
      }

      const step2Result = await window.executeStep2();

      if (!step2Result.success) {
        log.error(
          `[3-4] ❌ [GROUP-TRANSITION] step2実行エラー[${taskIndex}]:`,
          {
            error: step2Result.error,
          },
        );
        return;
      }

      if (!step2Result.hasNextGroup) {
        log.info(
          `[3-4] 🎉 [GROUP-TRANSITION] 全グループ完了 - 処理終了[${taskIndex}]`,
        );
        return;
      }

      log.info(
        `[3-4] ✅ [GROUP-TRANSITION] 次グループ準備完了: グループ${step2Result.groupNumber}[${taskIndex}]`,
      );

      // 次のタスクを即座に探して実行
      setTimeout(() => {
        log.info(
          `[3-4] 🚀 [GROUP-TRANSITION] 新グループでタスク探索開始[${taskIndex}]`,
        );
        startNextTaskIfAvailable(taskIndex).catch((error) => {
          log.error(
            `[3-4] ❌ [GROUP-TRANSITION] 新グループタスク探索エラー[${taskIndex}]:`,
            error,
          );
        });
      }, 2000); // 2秒待機してからタスク探索
    } else {
      log.info(
        `[3-4] 📋 [GROUP-TRANSITION] グループ${currentGroup.groupNumber}未完了 - 他タスクの完了待ち[${taskIndex}]`,
      );
    }
  } catch (error) {
    log.error(
      `[3-4] ❌ [GROUP-TRANSITION] グループ完了チェックエラー[${taskIndex}]:`,
      {
        taskIndex: taskIndex,
        error: error.message,
        stack: error.stack,
        エラー時刻: new Date().toISOString(),
      },
    );
  }
}

/**
 * 次のグループへの移行実行
 * 【追加】step6-nextgroup.jsとの連携
 */
async function transitionToNextGroup(completedGroup, taskIndex) {
  try {
    log.info(
      `[3-4] 🔀 [GROUP-TRANSITION] グループ移行実行開始[${taskIndex}]:`,
      {
        taskIndex: taskIndex,
        completedGroup: completedGroup.groupNumber,
        移行開始時刻: new Date().toISOString(),
      },
    );

    // step6-nextgroup.jsの機能を使用
    if (
      typeof window.checkNextGroup === "function" &&
      typeof window.processNextGroup === "function"
    ) {
      const nextGroup = window.checkNextGroup();

      if (nextGroup) {
        log.info(
          `[3-4] ➡️ [GROUP-TRANSITION] 次のグループ発見[${taskIndex}]:`,
          {
            taskIndex: taskIndex,
            nextGroup: nextGroup.groupNumber || nextGroup.number,
            groupType: nextGroup.groupType || nextGroup.type,
          },
        );

        await window.processNextGroup(nextGroup);

        log.info(
          `[3-4] ✅ [GROUP-TRANSITION] グループ移行完了[${taskIndex}]:`,
          {
            taskIndex: taskIndex,
            from: completedGroup.groupNumber,
            to: nextGroup.groupNumber || nextGroup.number,
            移行完了時刻: new Date().toISOString(),
          },
        );

        // 移行後、新しいグループでタスクを開始
        setTimeout(() => {
          log.info(
            `[3-4] 🚀 [GROUP-TRANSITION] 新グループでタスク探索開始[${taskIndex}]`,
          );
          startNextTaskIfAvailable(taskIndex).catch((error) => {
            log.error(
              `[3-4] ❌ [GROUP-TRANSITION] 新グループタスク探索エラー[${taskIndex}]:`,
              error,
            );
          });
        }, 2000); // 2秒待機してからタスク探索
      } else {
        log.info(
          `[3-4] 🏁 [GROUP-TRANSITION] 全てのグループ完了[${taskIndex}] - 処理終了`,
        );
      }
    } else {
      log.error(
        `[3-4] ❌ [GROUP-TRANSITION] step6-nextgroup.js機能利用不可[${taskIndex}]`,
      );
    }
  } catch (error) {
    log.error(`[3-4] ❌ [GROUP-TRANSITION] グループ移行エラー[${taskIndex}]:`, {
      taskIndex: taskIndex,
      error: error.message,
      stack: error.stack,
      エラー時刻: new Date().toISOString(),
    });
  }
}

/**
 * フォールバック用のグループ移行処理
 * 【追加】DynamicTaskSearch利用不可時の代替処理
 */
async function transitionToNextGroupFallback(taskIndex) {
  try {
    log.info(
      `[3-4] 🔄 [GROUP-TRANSITION] フォールバック移行開始[${taskIndex}]`,
    );

    // 簡単なグループ移行ロジック
    if (
      typeof window.checkNextGroup === "function" &&
      typeof window.processNextGroup === "function"
    ) {
      const nextGroup = window.checkNextGroup();
      if (nextGroup) {
        await window.processNextGroup(nextGroup);
        log.info(
          `[3-4] ✅ [GROUP-TRANSITION] フォールバック移行完了[${taskIndex}]`,
        );

        // 移行後タスク探索
        setTimeout(() => {
          startNextTaskIfAvailable(taskIndex).catch((error) => {
            log.error(
              `[3-4] ❌ [GROUP-TRANSITION] フォールバック後タスク探索エラー[${taskIndex}]:`,
              error,
            );
          });
        }, 2000);
      } else {
        log.info(
          `[3-4] 🏁 [GROUP-TRANSITION] フォールバック: 全グループ完了[${taskIndex}]`,
        );
      }
    } else {
      log.warn(`[3-4] ⚠️ [GROUP-TRANSITION] step6機能も利用不可[${taskIndex}]`);
    }
  } catch (error) {
    log.error(
      `[3-4] ❌ [GROUP-TRANSITION] フォールバック移行エラー[${taskIndex}]:`,
      error,
    );
  }
}

/**
 * タスク用のAIウィンドウを開く（既存コンポーネント活用版）
 */
async function openAIWindowForTask(task) {
  try {
    log.info("[3-4] 🔍 [TASK-FLOW-TRACE] openAIWindowForTask開始:", {
      taskId: task.id,
      aiType: task.aiType,
      column: task.column,
      row: task.row,
      ウィンドウ開設開始時刻: new Date().toISOString(),
    });

    if (!window.windowController) {
      log.error("[3-4] ❌ [AIウィンドウ開く] WindowController利用不可");
      return null;
    }

    if (typeof window.windowController.openWindows !== "function") {
      log.error(
        "[3-4] ❌ [AIウィンドウ開く] openWindowsメソッドが存在しません",
        {
          availableMethods: Object.getOwnPropertyNames(
            Object.getPrototypeOf(window.windowController),
          ),
        },
      );
      return null;
    }

    // StableWindowManager.positionToWindowの初期化確認
    if (!StableWindowManager.positionToWindow) {
      log.warn(
        "[3-4] ⚠️ [AIウィンドウ開く] positionToWindow未初期化、初期化実行",
      );
      StableWindowManager.positionToWindow = new Map();
    }

    // StepIntegratedWindowServiceの状態確認
    log.debug("[3-4] 🔍 [AIウィンドウ開く] StepIntegratedWindowService状態:", {
      serviceExists: typeof StepIntegratedWindowService !== "undefined",
      hasPositionToWindow:
        StableWindowManager && StableWindowManager.positionToWindow,
      positionMapSize: StableWindowManager?.positionToWindow?.size || 0,
      positionMapEntries: StableWindowManager?.positionToWindow
        ? Array.from(StableWindowManager.positionToWindow.entries())
        : [],
    });

    // 利用可能なpositionを検索
    log.debug("[3-4] 🔍 [AIウィンドウ開く] findAvailablePosition呼び出し前");
    const availablePosition = window.windowController.findAvailablePosition();
    log.info(
      `[3-4] 🎯 [AIウィンドウ開く] 検索結果 position: ${availablePosition}`,
    );

    // 既存ウィンドウとの競合チェック
    if (availablePosition !== null) {
      // 現在のopenedWindowsの状態を確認
      const openedWindowsInfo = Array.from(
        window.windowController.openedWindows.entries(),
      );
      log.info(`[3-4] 🔍 [競合チェック] 現在のウィンドウ状態:`, {
        position: availablePosition,
        openedWindowsCount: openedWindowsInfo.length,
        openedWindows: openedWindowsInfo.map(([key, value]) => ({
          key,
          windowId: value.windowId,
          tabId: value.tabId,
          position: value.position,
        })),
      });

      // StableWindowManagerのpositionToWindowも確認
      if (StableWindowManager.positionToWindow) {
        const positionMap = Array.from(
          StableWindowManager.positionToWindow.entries(),
        );
        log.info(
          `[3-4] 🔍 [競合チェック] StableWindowManager.positionToWindow:`,
          positionMap,
        );
      }
    }

    // 単一ウィンドウレイアウトを作成
    const windowLayout = [
      {
        aiType: task.aiType,
        position: availablePosition,
      },
    ];

    log.debug("[3-4] 🔧 [AIウィンドウ開く] 単一ウィンドウレイアウト作成:", {
      windowLayout,
      layoutValid:
        windowLayout.length > 0 &&
        windowLayout[0].aiType &&
        typeof windowLayout[0].position === "number",
    });

    // openWindowsメソッド呼び出し前の詳細ログ
    log.debug("[3-4] 🔍 [AIウィンドウ開く] openWindows呼び出し前の状態:", {
      windowControllerReady: !!window.windowController,
      openWindowsMethod: typeof window.windowController.openWindows,
      layoutLength: windowLayout.length,
      taskAiType: task.aiType,
      targetPosition: availablePosition,
      windowControllerState: {
        hasOpenedWindows: window.windowController.openedWindows?.size,
        openedWindowsKeys: Array.from(
          window.windowController.openedWindows?.keys() || [],
        ),
      },
    });

    // 既存のopenWindowsメソッドを使用して単一ウィンドウを開く
    log.info("[3-4] 🚀 [AIウィンドウ開く] openWindows実行開始");
    const windowResults =
      await window.windowController.openWindows(windowLayout);

    log.debug("[3-4] 🔍 [AIウィンドウ開く] openWindows戻り値詳細:", {
      resultsExists: !!windowResults,
      resultsType: typeof windowResults,
      resultsLength: Array.isArray(windowResults)
        ? windowResults.length
        : "not array",
      resultsContent: windowResults,
      firstResult:
        windowResults && windowResults.length > 0 ? windowResults[0] : null,
      firstResultSuccess:
        windowResults && windowResults.length > 0
          ? windowResults[0].success
          : null,
      hasTabId: !!windowResults?.[0]?.tabId,
      tabIdValue: windowResults?.[0]?.tabId,
      windowIdValue: windowResults?.[0]?.windowId,
    });

    if (windowResults && windowResults.length > 0 && windowResults[0].success) {
      const windowResult = windowResults[0];

      log.info("[3-4] ✅ [AIウィンドウ開く] 成功:", {
        aiType: task.aiType,
        position: availablePosition,
        tabId: windowResult.tabId,
        windowId: windowResult.windowId,
        url: windowResult.url,
        fullResult: windowResult,
      });

      const result = {
        tabId: windowResult.tabId,
        windowId: windowResult.windowId,
        url: windowResult.url,
        position: availablePosition,
      };

      log.info("[3-4] ✅ [AIウィンドウ開く] 最終的な戻り値:", result);
      return result;
    }

    log.error("[3-4] ❌ [AIウィンドウ開く] ウィンドウ作成失敗:", {
      windowResults,
      resultsLength: Array.isArray(windowResults)
        ? windowResults.length
        : "not array",
      failureReason:
        windowResults && windowResults.length > 0
          ? windowResults[0].success
            ? "unexpected"
            : windowResults[0].error || "success=false"
          : "no results",
    });
    return null;
  } catch (error) {
    log.error("[3-4] ❌ [AIウィンドウ開く] エラー詳細:", {
      errorMessage: error.message,
      errorStack: error.stack,
      errorName: error.name,
      errorProps: Object.getOwnPropertyNames(error),
      fullError: error,
      taskId: task?.id,
      aiType: task?.aiType,
    });
    return null;
  }
}

// ========================================
// StreamProcessorV2統合: Step内統合版ウィンドウ・タスク管理システム
// ========================================

/**
 * Step内統合版 WindowService（StreamProcessorV2の機能を内部実装）
 */
// ========================================
// 成功済みリトライロジック（unused/window-service.jsから移植）
// ========================================

/**
 * シンプルリトライ機能 - 成功実績あり
 * @param {Object} options リトライ設定
 * @param {Function} options.action 実行する関数
 * @param {Function} options.isSuccess 成功判定関数
 * @param {number} options.maxRetries 最大リトライ回数
 * @param {number} options.interval リトライ間隔(ms)
 * @param {string} options.actionName アクション名（ログ用）
 * @param {Object} options.context コンテキスト情報
 */
async function executeSimpleRetry({
  action,
  isSuccess,
  maxRetries = BATCH_PROCESSING_CONFIG.ELEMENT_RETRY_COUNT || 20,
  interval = BATCH_PROCESSING_CONFIG.ELEMENT_RETRY_INTERVAL || 500,
  actionName = "",
  context = {},
}) {
  let retryCount = 0;
  let lastResult = null;
  let lastError = null;

  while (retryCount < maxRetries) {
    try {
      if (retryCount === maxRetries - 1) {
        log.debug(
          `[3-4] [Retry] ${actionName} 最終試行 ${retryCount}/${maxRetries}`,
        );
      }
      lastResult = await action();
      if (isSuccess(lastResult)) {
        // 成功時は詳細ログ不要
        return { success: true, result: lastResult, retryCount };
      }
    } catch (error) {
      lastError = error;
      if (retryCount === maxRetries - 1) {
        log.error(`[3-4] [Retry] ${actionName} 失敗: ${error.message}`);
      }
    }
    retryCount++;
    if (retryCount >= maxRetries) {
      return {
        success: false,
        result: lastResult,
        error: lastError,
        retryCount,
      };
    }
    if (interval > 0) {
      await new Promise((resolve) => setTimeout(resolve, interval));
    }
  }
  return { success: false, result: lastResult, error: lastError, retryCount };
}

/**
 * 統一ウィンドウ管理クラス - 複数Mapを1つに集約
 */
class UnifiedWindowManager {
  constructor() {
    // 1つのMapで全ての状態を管理
    this.windows = new Map(); // windowId -> 全情報
    this.sendMessageQueue = new Map(); // tabId -> Promise (排他制御)
  }

  /**
   * ウィンドウ追加
   */
  addWindow(windowId, tabId, aiType, position) {
    this.windows.set(windowId, {
      windowId,
      tabId,
      aiType,
      position,
      status: "loading",
      lastCheck: Date.now(),
      checkResult: null,
    });
    log.debug(`[3-4] [WindowManager] ウィンドウ追加: ${windowId} (${aiType})`);
  }

  /**
   * AI種別の正規化
   */
  normalizeAiType(aiType) {
    if (!aiType) return "unknown";
    const baseType = aiType.replace(/_task.*/, "").toLowerCase();
    const typeMap = {
      chatgpt: "ChatGPT",
      claude: "Claude",
      gemini: "Gemini",
      genspark: "Genspark",
    };
    return typeMap[baseType] || baseType;
  }

  /**
   * AI種別でウィンドウ検索（改善版）
   */
  async findWindowsByAiType(aiType) {
    const normalizedType = this.normalizeAiType(aiType);
    const results = [];

    for (const [windowId, info] of this.windows.entries()) {
      // 大文字小文字を無視して比較（Claudeも統一）
      const infoNormalized = info.aiType.toLowerCase();
      const searchNormalized = normalizedType.toLowerCase();
      if (infoNormalized.startsWith(searchNormalized + "_")) {
        // タブが実際に存在するかチェック
        try {
          const tab = await chrome.tabs.get(info.tabId);
          if (tab && tab.status === "complete") {
            results.push(info);
          }
        } catch (error) {
          // タブが存在しない場合はマップから削除
          log.debug(`[3-4] [WindowManager] 無効タブ削除: ${info.tabId}`);
          this.windows.delete(windowId);
        }
      }
    }
    return results;
  }

  /**
   * 最初に成功したウィンドウを返す（ファーストウィン戦略）
   */
  async findFirstWorkingWindow(aiType) {
    const candidates = await this.findWindowsByAiType(aiType);
    log.debug(`[3-4] [WindowManager] ${aiType}候補: ${candidates.length}個`);

    for (const window of candidates) {
      const isWorking = await this.quickCheck(window.tabId);
      if (isWorking) {
        log.debug(`[3-4] [FirstWin] ${aiType}動作確認`);
        return window;
      }
    }
    log.debug(`[3-4] [FirstWin] ${aiType}動作ウィンドウなし`);
    return null;
  }

  /**
   * クイックチェック（簡単なタブ存在確認）
   */
  async quickCheck(tabId) {
    try {
      const tab = await chrome.tabs.get(tabId);
      return tab && tab.status === "complete" && tab.url;
    } catch (error) {
      return false;
    }
  }

  /**
   * ウィンドウ情報取得
   */
  getWindow(windowId) {
    return this.windows.get(windowId);
  }

  /**
   * 全ウィンドウ情報取得
   */
  getAllWindows() {
    return Array.from(this.windows.values());
  }
}

/**
 * 安全なメッセージ送信クラス - sendMessage競合防止
 */
class SafeMessenger {
  static sendMessageQueue = new Map(); // tabId -> Promise (排他制御)

  /**
   * 排他制御付きメッセージ送信
   */
  static async sendSafeMessage(tabId, message, timeout = 8000) {
    log.debug(
      `[3-4] [SafeMessenger] 送信開始: tabId=${tabId}, action=${message.action}`,
    );

    // 🔍 [DEBUG] SafeMessenger詳細ログ
    log.debug("[3-4] 🔍 [DEBUG-SAFE-MESSENGER] 送信開始詳細:", {
      tabId: tabId,
      messageAction: message.action,
      messageKeys: Object.keys(message),
      timeout: timeout,
      currentQueueSize: this.sendMessageQueue.size,
      isTabInQueue: this.sendMessageQueue.has(tabId),
      allQueuedTabs: Array.from(this.sendMessageQueue.keys()),
      timestamp: new Date().toISOString(),
    });

    // 既に同じタブに送信中の場合は待機
    if (this.sendMessageQueue.has(tabId)) {
      log.debug(`[SafeMessenger] タブ${tabId}は送信中、待機...`);
      log.debug("[3-4] 🔍 [DEBUG-SAFE-MESSENGER] キュー待機詳細:", {
        waitingForTab: tabId,
        currentQueueSize: this.sendMessageQueue.size,
        queuedTabs: Array.from(this.sendMessageQueue.keys()),
      });
      try {
        await this.sendMessageQueue.get(tabId);
        log.debug("[3-4] 🔍 [DEBUG-SAFE-MESSENGER] キュー待機完了:", {
          tabId: tabId,
        });
      } catch (error) {
        log.debug("[3-4] 🔍 [DEBUG-SAFE-MESSENGER] キュー待機エラー:", {
          tabId: tabId,
          error: error.message,
        });
        // 前のリクエストのエラーは無視
      }
    }

    // 新しいリクエストを開始
    log.debug("[3-4] 🔍 [DEBUG-SAFE-MESSENGER] 新規リクエスト開始:", {
      tabId: tabId,
    });
    const promise = this._doSendMessage(tabId, message, timeout);
    this.sendMessageQueue.set(tabId, promise);

    try {
      const result = await promise;
      log.debug(
        `[3-4] [SafeMessenger] 送信完了: tabId=${tabId}, success=${result.success}`,
      );
      // 🔍 [DEBUG] SafeMessenger結果詳細ログ
      log.debug("[3-4] 🔍 [DEBUG-SAFE-MESSENGER] 送信完了詳細:", {
        tabId: tabId,
        success: result.success,
        resultKeys: result ? Object.keys(result) : null,
        hasData: !!result.data,
        hasError: !!result.error,
        timestamp: result.timestamp,
      });
      return result;
    } finally {
      // 完了後はキューから削除
      this.sendMessageQueue.delete(tabId);
      log.debug("[3-4] 🔍 [DEBUG-SAFE-MESSENGER] キューから削除:", {
        tabId: tabId,
        remainingQueueSize: this.sendMessageQueue.size,
      });
    }
  }

  /**
   * 実際のメッセージ送信処理（リトライ機能付き）
   */
  static async _doSendMessage(tabId, message, timeout) {
    // 🔍 [DEBUG] 実際の送信処理開始ログ
    log.debug("[3-4] 🔍 [DEBUG-SAFE-MESSENGER] _doSendMessage開始:", {
      tabId: tabId,
      messageAction: message.action,
      timeout: timeout,
      chromeTabsExists: !!chrome?.tabs,
      sendMessageExists: !!chrome?.tabs?.sendMessage,
    });

    // リトライ設定
    const maxRetries = 3;
    let lastError = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // 🔍 [DEBUG] chrome.tabs.sendMessage実行前ログ
        log.debug(
          "[3-4] 🔍 [DEBUG-SAFE-MESSENGER] chrome.tabs.sendMessage実行前:",
          {
            tabId: tabId,
            message: message,
            attempt: attempt + 1,
            maxRetries: maxRetries,
          },
        );

        const response = await Promise.race([
          chrome.tabs.sendMessage(tabId, message),
          new Promise((_, reject) =>
            setTimeout(
              () => reject(new Error(`sendMessage timeout after ${timeout}ms`)),
              timeout,
            ),
          ),
        ]);

        // 🔍 [DEBUG] レスポンス受信ログ
        log.debug("[3-4] 🔍 [DEBUG-SAFE-MESSENGER] レスポンス受信:", {
          tabId: tabId,
          responseReceived: !!response,
          responseType: typeof response,
          responseKeys: response ? Object.keys(response) : null,
          responseSuccess: response?.success,
          hasResponseData: !!response?.data,
          responseAction: response?.action,
          attempt: attempt + 1,
        });

        return {
          success: true,
          data: response,
          tabId: tabId,
          timestamp: Date.now(),
          retryCount: attempt,
        };
      } catch (error) {
        lastError = error;
        const errorMessage = error.message || String(error);

        // "Could not establish connection"エラーの場合はリトライ
        if (
          (errorMessage.includes("Could not establish connection") ||
            errorMessage.includes("Receiving end does not exist")) &&
          attempt < maxRetries - 1
        ) {
          log.debug(
            `[3-4] 🔁 [SafeMessenger] 接続エラー、リトライ ${attempt + 1}/${maxRetries}`,
          );
          // 指数バックオフ
          await new Promise((resolve) =>
            setTimeout(resolve, Math.min(1000 * Math.pow(2, attempt), 5000)),
          );
          continue;
        }

        // その他のエラーまたは最終リトライ
        log.debug(`[3-4] [SafeMessenger] エラー: ${errorMessage}`);
        // 🔍 [DEBUG] エラー詳細ログ
        log.debug("[3-4] 🔍 [DEBUG-SAFE-MESSENGER] エラー詳細:", {
          tabId: tabId,
          errorMessage: errorMessage,
          errorName: error.name,
          errorStack: error.stack?.substring(0, 200),
          isTimeout: errorMessage.includes("timeout"),
          isTabError: errorMessage.includes("tab"),
          isConnectionError: errorMessage.includes("connection"),
          attempt: attempt + 1,
          willRetry: attempt < maxRetries - 1,
        });

        if (attempt >= maxRetries - 1) {
          return {
            success: false,
            error: errorMessage,
            tabId: tabId,
            timestamp: Date.now(),
            retryCount: attempt,
          };
        }
      }
    }

    // リトライ全て失敗
    return {
      success: false,
      error: lastError?.message || "Unknown error",
      tabId: tabId,
      timestamp: Date.now(),
      retryCount: maxRetries,
    };
  }

  /**
   * 簡単なUI要素チェック（ファーストウィン戦略用）
   */
  static async quickUICheck(tabId, aiType) {
    const result = await this.sendSafeMessage(
      tabId,
      {
        action: "CHECK_UI_ELEMENTS",
        aiType: aiType,
        quickCheck: true, // クイックチェックフラグ
      },
      5000,
    ); // 短いタイムアウト

    if (result.success && result.data) {
      // 少なくとも1つのUI要素があれば成功とみなす
      const hasAnyUI =
        result.data.textInput ||
        result.data.modelDisplay ||
        result.data.functionDisplay;
      return hasAnyUI;
    }
    return false;
  }

  /**
   * キューの状態確認（デバッグ用）
   */
  static getQueueStatus() {
    return {
      activeRequests: this.sendMessageQueue.size,
      tabIds: Array.from(this.sendMessageQueue.keys()),
    };
  }
}

// ========================================
// 成功済みウィンドウ管理ロジック（unused/window-service.jsから移植）
// ========================================

/**
 * 安定したウィンドウ管理クラス - 成功実績あり
 */
class StableWindowManager {
  // アクティブなウィンドウを管理するMap
  static activeWindows = new Map();

  // ウィンドウポジション管理 (0-3の位置を管理)
  static windowPositions = new Map();

  // ポジションごとのウィンドウID管理
  static positionToWindow = new Map();

  // 予期しないウィンドウ閉鎖を監視するフラグ
  static isMonitoringEnabled = false;

  /**
   * chrome.windows.onRemovedイベントリスナーを初期化
   */
  static initializeWindowMonitoring() {
    if (this.isMonitoringEnabled) {
      return; // 既に初期化済み
    }

    if (
      typeof chrome !== "undefined" &&
      chrome.windows &&
      chrome.windows.onRemoved
    ) {
      chrome.windows.onRemoved.addListener((windowId) => {
        this.handleUnexpectedWindowClosure(windowId);
      });

      this.isMonitoringEnabled = true;
      log.debug(
        "[3-4] 🔍 [StableWindowManager] ウィンドウ閉鎖監視を開始しました",
      );
    }
  }

  /**
   * 予期しないウィンドウ閉鎖をハンドリング
   */
  static handleUnexpectedWindowClosure(windowId) {
    const windowInfo = this.activeWindows.get(windowId);

    if (windowInfo) {
      log.error(
        `[3-4] 🚨 [StableWindowManager] 予期しないウィンドウ閉鎖を検出:`,
        {
          windowId,
          aiType: windowInfo.aiType || "不明",
          position: this.positionToWindow.get(windowId),
          timestamp: new Date().toISOString(),
        },
      );

      // クリーンアップ処理
      this.cleanupClosedWindow(windowId);
    }
  }

  /**
   * 閉鎖されたウィンドウのクリーンアップ
   */
  static cleanupClosedWindow(windowId) {
    // activeWindowsから削除
    this.activeWindows.delete(windowId);

    // positionToWindowから該当エントリを削除
    for (const [position, wId] of this.positionToWindow.entries()) {
      if (wId === windowId) {
        this.positionToWindow.delete(position);
        break;
      }
    }

    // windowPositionsから該当エントリを削除
    for (const [position, wId] of this.windowPositions.entries()) {
      if (wId === windowId) {
        this.windowPositions.delete(position);
        break;
      }
    }
  }

  /**
   * 安定したウィンドウ作成（リトライ機能付き）
   */
  static async createStableWindow(url, position, options = {}) {
    const windowOptions = {
      url: url,
      type: "popup",
      focused: true,
      ...options,
    };

    return await executeSimpleRetry({
      action: async () => {
        // 既存ウィンドウが存在する場合は削除
        if (this.windowPositions.has(position)) {
          const existingWindowId = this.windowPositions.get(position);
          try {
            await chrome.windows.remove(existingWindowId);
            this.cleanupClosedWindow(existingWindowId);
          } catch (error) {
            log.warn(
              `[3-4] [StableWindowManager] 既存ウィンドウ削除エラー:`,
              error.message,
            );
          }
        }

        // 新しいウィンドウを作成
        const window = await chrome.windows.create(windowOptions);

        // 🔍 [段階1] ウィンドウ作成結果の詳細ログ
        log.warn(
          `[3-4] 🔍 [段階1-ウィンドウ作成] chrome.windows.create結果の詳細分析:`,
          {
            requestedUrl: url,
            windowOptions: windowOptions,
            createdWindow: {
              id: window.id,
              state: window.state,
              type: window.type,
              focused: window.focused,
              top: window.top,
              left: window.left,
              width: window.width,
              height: window.height,
              tabsCount: window.tabs ? window.tabs.length : 0,
            },
            tabsDetails: window.tabs
              ? window.tabs.map((tab, index) => ({
                  index: index,
                  id: tab.id,
                  url: tab.url,
                  title: tab.title,
                  status: tab.status,
                  active: tab.active,
                  windowId: tab.windowId,
                  isClaudeAI: tab.url ? tab.url.includes("claude.ai") : false,
                  isExtensionPage: tab.url
                    ? tab.url.startsWith("chrome-extension://")
                    : false,
                }))
              : [],
          },
        );

        // ウィンドウ情報を登録
        const windowInfo = {
          url: url,
          aiType: options.aiType || "unknown",
          position: position,
          createdAt: Date.now(),
          tabId:
            window.tabs && window.tabs.length > 0 ? window.tabs[0].id : null,
        };

        this.activeWindows.set(window.id, windowInfo);
        this.windowPositions.set(position, window.id);
        this.positionToWindow.set(position, window.id);

        return window;
      },
      isSuccess: (result) =>
        result && result.id && result.tabs && result.tabs.length > 0,
      maxRetries: 10,
      interval: 1000,
      actionName: `ウィンドウ作成 (${url})`,
      context: { url, position, options },
    });
  }
}

class StepIntegratedWindowService {
  static windowPositions = new Map(); // position -> windowId
  static unifiedManager = new UnifiedWindowManager(); // 統一管理インスタンス
  static stableManager = StableWindowManager; // 安定管理インスタンス

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
      log.warn(
        "[3-4] [StepIntegratedWindowService] スクリーン情報取得エラー、フォールバック使用:",
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
    const baseWidth = Math.floor(screenInfo.width * 0.5);
    const baseHeight = Math.floor(screenInfo.height * 0.5);
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
        left: offsetLeft + baseWidth,
        top: offsetTop,
        width: baseWidth,
        height: baseHeight,
      },
      2: {
        // 左下
        left: offsetLeft,
        top: offsetTop + baseHeight,
        width: baseWidth,
        height: baseHeight,
      },
      3: {
        // 右下
        left: offsetLeft + baseWidth,
        top: offsetTop + baseHeight,
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
      log.debug(
        `[3-4] 🪟 [StepIntegratedWindowService] ウィンドウ作成開始: position=${position}, url=${url}`,
      );

      // 既存ウィンドウが使用中の場合は閉じる
      if (this.windowPositions.has(position)) {
        const existingWindowId = this.windowPositions.get(position);

        // ウィンドウ存在確認後に競合判定
        let windowExists = true;
        try {
          await chrome.windows.get(existingWindowId);
        } catch (e) {
          // ウィンドウが既に閉じられている場合はマップから削除
          this.windowPositions.delete(position);
          windowExists = false;
        }

        // ウィンドウが存在する場合のみ使用中チェック
        if (windowExists) {
          const isInUse = await this.checkWindowInUse(existingWindowId);

          if (isInUse) {
            log.info(
              `[3-4] ⏳ [ウィンドウ完了待機] windowId=${existingWindowId}の処理完了を待機します（position=${position}）`,
            );

            // ウィンドウの処理完了を待機（最大60秒）
            let waitCount = 0;
            const maxWaitTime = 60; // 60秒
            let windowBecameAvailable = false;

            while (waitCount < maxWaitTime && !windowBecameAvailable) {
              await new Promise((resolve) => setTimeout(resolve, 1000)); // 1秒待機
              waitCount++;

              try {
                // ウィンドウがまだ存在するかチェック
                await chrome.windows.get(existingWindowId);
                const stillInUse =
                  await this.checkWindowInUse(existingWindowId);

                if (!stillInUse) {
                  log.info(
                    `[3-4] ✅ [ウィンドウ解放] windowId=${existingWindowId}の処理が完了しました（${waitCount}秒待機）`,
                  );
                  windowBecameAvailable = true;
                }
              } catch (error) {
                // ウィンドウが閉じられた場合
                log.info(
                  `[3-4] ✅ [ウィンドウ閉鎖] windowId=${existingWindowId}が閉じられました（${waitCount}秒待機）`,
                );
                this.windowPositions.delete(position);
                windowBecameAvailable = true;
              }
            }

            if (!windowBecameAvailable) {
              log.warn(
                `[3-4] ⚠️ [待機タイムアウト] windowId=${existingWindowId}の処理完了を${maxWaitTime}秒待機しましたが完了しませんでした。別のpositionを使用します。`,
              );
              // タイムアウト時は別のpositionを探す
              for (let altPosition = 0; altPosition < 4; altPosition++) {
                if (
                  altPosition !== position &&
                  !this.windowPositions.has(altPosition)
                ) {
                  log.info(
                    `[3-4] 🔄 [代替position] position=${altPosition}を使用`,
                  );
                  position = altPosition;
                  break;
                }
              }
              // それでも見つからない場合はエラー
              if (this.windowPositions.has(position)) {
                log.error(
                  `[3-4] ❌ [position不足] すべてのpositionが使用中です`,
                );
                return null;
              }
            }
          } else {
            log.info(
              `[3-4] 🔄 [ウィンドウ削除] position=${position}の未使用ウィンドウ${existingWindowId}を削除`,
            );

            try {
              await chrome.windows.remove(existingWindowId);
              this.windowPositions.delete(position);
              await new Promise((resolve) => setTimeout(resolve, 500)); // 削除完了待ち
            } catch (error) {
              // 既に閉じられたウィンドウの削除は正常な状況
            }
          }
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

      log.debug(
        `[3-4] 📐 [StepIntegratedWindowService] ウィンドウ作成オプション:`,
        createOptions,
      );

      // ウィンドウ作成
      const window = await chrome.windows.create(createOptions);

      // 🔍 [段階1] StepIntegratedWindowService ウィンドウ作成結果の詳細ログ
      const windowDetails = {
        requestedUrl: url,
        position: position,
        createOptions: createOptions,
        createdWindow: {
          id: window.id,
          state: window.state,
          type: window.type,
          focused: window.focused,
          top: window.top,
          left: window.left,
          width: window.width,
          height: window.height,
          tabsCount: window.tabs ? window.tabs.length : 0,
        },
        immediateTabsAnalysis: window.tabs
          ? window.tabs.map((tab, index) => ({
              tabIndex: index,
              tabId: tab.id,
              url: tab.url,
              pendingUrl: tab.pendingUrl,
              title: tab.title,
              status: tab.status,
              active: tab.active,
              windowId: tab.windowId,
              isClaudeAI: tab.url ? tab.url.includes("claude.ai") : false,
              isExtensionPage: tab.url
                ? tab.url.startsWith("chrome-extension://")
                : false,
              isChromeNewTab: tab.url === "chrome://newtab/",
              isAboutBlank: tab.url === "about:blank",
              urlMatchesRequest: tab.url === url,
            }))
          : [],
        potentialIssues: {
          noTabsCreated: !window.tabs || window.tabs.length === 0,
          wrongUrl: window.tabs && window.tabs[0] && window.tabs[0].url !== url,
          extensionPageDetected:
            window.tabs &&
            window.tabs.some((tab) =>
              tab.url?.startsWith("chrome-extension://"),
            ),
          pendingUrlExists:
            window.tabs && window.tabs.some((tab) => tab.pendingUrl),
        },
      };

      // 位置を記録
      this.windowPositions.set(position, window.id);

      // タブURLが正しいか確認
      if (window.tabs && window.tabs.length > 0) {
        const firstTab = window.tabs[0];
        if (firstTab.url && firstTab.url.startsWith("chrome-extension://")) {
          log.warn(
            `[3-4] ⚠️ [StepIntegratedWindowService] タブURLが拡張機能ページです。正しいURLへのナビゲーションを待機します...`,
          );

          // タブが正しいURLにナビゲートされるまで待機（最大5秒）
          let retryCount = 0;
          const maxRetries = 10;
          let correctTab = null;

          while (retryCount < maxRetries) {
            await new Promise((resolve) => setTimeout(resolve, 500));
            try {
              const updatedTab = await chrome.tabs.get(firstTab.id);
              log.debug(
                `[3-4] 🔄 [StepIntegratedWindowService] タブ状態確認 (試行 ${retryCount + 1}):`,
                {
                  tabId: updatedTab.id,
                  url: updatedTab.url,
                  pendingUrl: updatedTab.pendingUrl,
                  status: updatedTab.status,
                },
              );

              if (
                updatedTab.url &&
                !updatedTab.url.startsWith("chrome-extension://")
              ) {
                correctTab = updatedTab;
                log.info(
                  `[3-4] ✅ [StepIntegratedWindowService] タブが正しいURLにナビゲートされました: ${updatedTab.url}`,
                );
                break;
              }
            } catch (error) {
              log.debug(
                `[3-4] タブ状態取得エラー (試行 ${retryCount + 1}):`,
                error,
              );
            }
            retryCount++;
          }

          if (correctTab) {
            window.tabs[0] = correctTab;
          }
        }
      }

      log.debug(
        `[3-4] ✅ [StepIntegratedWindowService] ウィンドウ作成完了: windowId=${window.id}, position=${position}`,
      );

      // デバッグログ：戻り値の詳細
      log.debug("[3-4] 🔍 [createWindowWithPosition] ウィンドウ作成後の詳細:", {
        windowId: window.id,
        tabsCount: window.tabs?.length,
        firstTabId: window.tabs?.[0]?.id,
        firstTabUrl: window.tabs?.[0]?.url,
        windowState: window.state,
      });

      return {
        id: window.id,
        tabs: window.tabs,
        tabId: window.tabs?.[0]?.id, // タブIDを明示的に追加
        ...window,
      };
    } catch (error) {
      log.error(
        `[3-4] ❌ [StepIntegratedWindowService] ウィンドウ作成エラー:`,
        error,
      );
      throw error;
    }
  }

  /**
   * ウィンドウが使用中かチェック
   */
  static async checkWindowInUse(windowId) {
    try {
      // ウィンドウの存在確認を最初に実行
      try {
        const window = await chrome.windows.get(windowId);
        if (!window) {
          return false; // 存在しないウィンドウは使用中でない
        }
      } catch (e) {
        return false; // 既に閉じられたウィンドウは使用中でない
      }

      // タブでContent Scriptが動作中かチェック
      const tabs = await chrome.tabs.query({ windowId });
      log.debug(`[3-4] [使用中チェック] タブ数: ${tabs.length}`);

      for (const tab of tabs) {
        try {
          // Content Scriptにpingを送信
          const response = await chrome.tabs.sendMessage(tab.id, {
            action: "ping",
            timestamp: Date.now(),
          });

          if (
            response &&
            (response.action === "pong" || response.status === "ready")
          ) {
            log.info(
              `[3-4] ✅ [使用中チェック] タブ${tab.id}でContent Script動作中、windowId=${windowId}は使用中`,
            );
            return true;
          }
        } catch (e) {
          // "Could not establish connection"エラーは正常な状態
          // Content Scriptが存在しない、またはタブが閉じられている
          continue; // 次のタブをチェック
        }
      }

      return false; // どのタブでもContent Scriptが動作していない
    } catch (error) {
      return false; // エラー時は使用中でないとみなす
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

      log.debug(
        `[3-4] ✅ [StepIntegratedWindowService] ウィンドウ閉じる完了: windowId=${windowId}`,
      );
    } catch (error) {
      log.debug(
        `[3-4] [StepIntegratedWindowService] ウィンドウ閉じるエラー: windowId=${windowId}`,
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
    log.debug(
      `[3-4] 🔗 [StepIntegratedAiUrlManager] URL取得: ${aiType} -> ${url}`,
    );
    return url;
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
    log.debug("[3-4] [step3-tasklist] メニュー行またはAI行が見つかりません");
    return { hasAdditions: false, addedColumns: [] };
  }

  try {
    // プロンプト列グループを検索
    const promptGroups = findPromptGroups(
      spreadsheetData[menuRowIndex],
      spreadsheetData[aiRowIndex],
    );

    if (promptGroups.length === 0) {
      log.debug("[3-4] [step3-tasklist] プロンプト列が見つかりません");
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
    log.error("[3-4] [step3-tasklist] 自動列追加エラー:", error);
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
      log.debug(
        `[3-4] [step3-tasklist] 列追加成功: ${indexToColumn(columnIndex)}列 (${headerText})`,
      );
      return true;
    } else {
      log.error(
        `[3-4] [step3-tasklist] 列追加失敗: ${headerText}`,
        await response.text(),
      );
      return false;
    }
  } catch (error) {
    log.error(`[3-4] [step3-tasklist] 列追加エラー: ${headerText}`, error);
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
      log.debug(
        `[3-4] [step3-tasklist] 列削除成功: ${indexToColumn(columnIndex)}列`,
      );
      return true;
    } else {
      log.error("[3-4] [step3-tasklist] 列削除失敗", await response.text());
      return false;
    }
  } catch (error) {
    log.error("[3-4] [step3-tasklist] 列削除エラー", error);
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
    log.error("[3-4] [step3-tasklist.js] getAnswerCell エラー:", error);
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
      log.debug("[3-4] [step3-tasklist] 自動列追加を実行中...");
      const setupResult = await executeAutoColumnSetup(
        options.spreadsheetId,
        options.gid,
        spreadsheetData,
        specialRows,
      );

      if (setupResult.hasAdditions) {
        log.debug(
          `[3-4] [step3-tasklist] ${setupResult.addedColumns.length}列を追加しました`,
        );
        // 列追加後はスプレッドシートデータを再読み込み
        if (setupResult.addedColumns && setupResult.addedColumns.length > 0) {
          // Google Sheets APIから最新データを取得
          const token = window.globalState?.authToken || "";
          const sheetName =
            window.globalState?.sheetName ||
            `シート${window.globalState?.gid || "0"}`;
          const range = `'${sheetName}'!A1:ZZ1000`; // 十分な範囲を指定
          const apiUrl = `https://sheets.googleapis.com/v4/spreadsheets/${options.spreadsheetId}/values/${encodeURIComponent(range)}`;

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
                log.debug(
                  "[3-4] [step3-tasklist] スプレッドシートデータを再読み込みしました",
                );
              }
            }
          } catch (error) {
            log.error("[3-4] [step3-tasklist] データ再読み込みエラー:", error);
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
            log.debug(`[3-4] [step3-tasklist] ${message}:`, data);
          } else {
            logBuffer.push(message);
            log.debug(`[3-4] [step3-tasklist] ${message}`);
          }
        }
        return;
      }

      // 通常のログ処理
      if (data) {
        logBuffer.push(`${message}: ${JSON.stringify(data)}`);
        log.debug(`[3-4] [step3-tasklist] ${message}:`, data);
      } else {
        logBuffer.push(message);
        log.debug(`[3-4] [step3-tasklist] ${message}`);
      }
    };

    const promptColumns = taskGroup.columns.prompts || [];

    // Step 4-3-1: プロンプト列確認
    addLog(
      `[プロンプト列] Group ${taskGroup.groupNumber}: ${promptColumns.join(", ") || "未設定"}`,
    );
    // 【統一修正】全てオブジェクト形式なのでObject.valuesを直接使用
    const answerColumns = taskGroup.columns.answer
      ? Object.values(taskGroup.columns.answer)
      : [];

    // プロンプトがある最終行を検索（0-based index）
    let lastPromptRow = dataStartRow - 1; // 0-basedに変換

    for (let row = dataStartRow - 1; row < spreadsheetData.length; row++) {
      let hasPrompt = false;
      for (const col of promptColumns) {
        const colIndex = columnToIndex(col);
        if (spreadsheetData[row] && spreadsheetData[row][colIndex]) {
          hasPrompt = true;
          lastPromptRow = row; // rowをそのまま使用（0-based）
          break;
        }
      }
    }

    // 3-2: タスク生成の除外処理
    const validTasks = [];
    const skippedRows = []; // スキップした行を記録
    const skippedDetails = []; // スキップの詳細情報を記録
    const debugLogs = []; // デバッグログを収集

    // デバッグ: タスク生成範囲を明示（0-based indexなので表示時は+1）
    log.debug(
      `[3-4] [step3-tasklist.js] タスク生成範囲: ${dataStartRow} ~ ${lastPromptRow + 1}`,
    );
    log.debug(
      `[3-4] [step3-tasklist.js] グループ${taskGroup.groupNumber}のプロンプト列: ${promptColumns}`,
    );
    log.debug(
      `[3-4] [step3-tasklist.js] グループ${taskGroup.groupNumber}の回答列: ${answerColumns}`,
    );

    for (let row = dataStartRow - 1; row <= lastPromptRow; row++) {
      const rowData = spreadsheetData[row]; // rowをそのまま使用（0-based）

      // デバッグ: 各行の処理状況を出力（表示時は+1して行番号に）
      if (row <= dataStartRow + 1) {
        // 最初の数行だけデバッグ出力
        log.debug(`[3-4] [step3-tasklist.js] 行${row + 1}を処理中...`);
      }

      if (!rowData) continue;

      // 🆕 行制御チェック（最初にチェックして不要な処理を避ける）
      if (
        options.applyRowControl &&
        options.rowControls &&
        options.rowControls.length > 0
      ) {
        if (!shouldProcessRow(row + 1, options.rowControls)) {
          skippedRows.push(row + 1); // スキップした行を記録（1-based）
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
          const cellValue = rowData[colIndex].trim();
          // 「作業中」マーカーは回答とみなさない
          if (!cellValue.startsWith("作業中")) {
            hasAnswer = true;
            // スキップ詳細を記録（後でまとめて出力）
            skippedDetails.push({
              row: row + 1, // 1-basedの行番号
              column: col,
              reason: "既に回答あり",
              cellValuePreview: cellValue.substring(0, 50) + "...",
              group: taskGroup.groupNumber,
              groupType: taskGroup.groupType,
            });
            // 🔍 スキップ時の詳細ログ（冒頭10文字表示）
            log.info(`⏭️ [行${row + 1}] 回答済みスキップ:`, {
              行: row + 1,
              列: col,
              冒頭10文字: cellValue.substring(0, 10),
              文字数: cellValue.length,
            });
            break;
          } else {
            // 初回実行時は作業中マーカーを削除
            if (options.isFirstRun) {
              // TaskStatusManagerインスタンスを作成
              const taskStatusManager = new TaskStatusManager();

              // 一時的なタスクオブジェクトを作成
              const tempTask = {
                column: col,
                row: row + 1, // 1-basedの行番号
                spreadsheetId:
                  options.spreadsheetId || window.globalState?.spreadsheetId,
                groupNumber: taskGroup.groupNumber,
              };

              // 作業中マーカーを削除
              const cleared =
                await taskStatusManager.clearWorkingMarker(tempTask);

              if (cleared) {
                ExecuteLogger.info(
                  `[TaskList] 初回実行: 作業中マーカー削除後タスク作成 ${row + 1}行目 (${col}列)`,
                  {
                    理由: "初回実行時の自動クリア",
                    元のマーカー: cellValue.substring(0, 50) + "...",
                    グループ: taskGroup.groupNumber,
                    グループタイプ: taskGroup.groupType,
                  },
                );
                addLog(
                  `[TaskList] ${row + 1}行目: 初回実行で作業中マーカー削除 (${col}列)`,
                  {
                    column: col,
                    originalMarker: cellValue.substring(0, 30) + "...",
                    reason: "初回実行時自動クリア",
                  },
                );
              } else {
                ExecuteLogger.warn(
                  `[TaskList] 作業中マーカー削除失敗: ${row + 1}行目 (${col}列)`,
                  {
                    マーカー: cellValue.substring(0, 50) + "...",
                    グループ: taskGroup.groupNumber,
                  },
                );
              }
            } else {
              ExecuteLogger.info(
                `[TaskList] タスク作成対象: ${row + 1}行目 (${col}列)`,
                {
                  理由: "作業中マーカーは回答とみなさない",
                  マーカー: cellValue.substring(0, 50) + "...",
                  グループ: taskGroup.groupNumber,
                  グループタイプ: taskGroup.groupType,
                },
              );
              addLog(
                `[TaskList] ${row + 1}行目: 作業中マーカー検出 (${col}列) - タスク作成対象`,
                {
                  column: col,
                  marker: cellValue.substring(0, 30) + "...",
                },
              );
            }
          }
        }
      }

      // 回答済みチェック（統合ログ）
      if (hasAnswer && !options.forceReprocess) {
        skippedRows.push(row + 1); // 1-basedの行番号
        continue; // ログは既に出力済み
      }

      // 3-2-1-2: 追加の除外条件（拡張可能）
      if (options.customSkipConditions) {
        let shouldSkip = false;
        for (const condition of options.customSkipConditions) {
          if (condition(rowData, row + 1)) {
            // 1-basedの行番号を渡す
            addLog(
              `[TaskList] [Step3-2] ${row + 1}行目: カスタム条件によりスキップ`,
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

          // AI行の実際の値をそのまま使用（"single" → "Claude"変換を削除）
          // aiTypeは既にAI行から取得した正しい値（"ChatGPT", "Claude", "Gemini"など）

          // 【シンプル化】文字列結合でセル位置計算
          const answerCell = getAnswerCell(taskGroup, aiType, row + 1); // 1-basedの行番号
          // answerCellから列文字を抽出（例: "Q9" → "Q"）
          const answerColumn = answerCell
            ? answerCell.match(/^([A-Z]+)/)?.[1]
            : null;

          // WindowControllerからtabID/windowIDを取得
          // aiTypeを正規化（大文字小文字の不一致を防ぐ）
          const normalizedAiType = aiType?.toLowerCase()?.trim() || "claude";
          let windowInfo = null;
          if (
            typeof window !== "undefined" &&
            window.windowController?.openedWindows
          ) {
            // 新しい保存形式に対応: ${normalizedAiType}_${position} から該当するウィンドウを収集
            const allWindows = [];
            for (const [
              key,
              value,
            ] of window.windowController.openedWindows.entries()) {
              if (
                key
                  .toLowerCase()
                  .startsWith(normalizedAiType.toLowerCase() + "_")
              ) {
                allWindows.push(value);
              }
            }

            if (allWindows.length > 0) {
              // タスクのインデックスに基づいてウィンドウを循環選択
              const taskIndex = tasksCreated; // 現在までに作成されたタスク数を使用
              windowInfo = allWindows[taskIndex % allWindows.length];
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
            // DEBUG: WindowInfo取得
          } else {
            // WindowController利用不可
          }

          // windowInfoが取得できない場合の詳細ログ
          if (!windowInfo) {
            // WARNING: WindowInfo取得失敗
          }

          // 【追加】DynamicTaskSearchとの協調チェック - タスク生成前の重複防止
          const taskId = `${answerColumn}${row + 1}`; // 1-basedの行番号

          // DynamicTaskSearchで完了済みの場合はスキップ
          if (window.DynamicTaskSearch?.completedTasks?.has(taskId)) {
            console.warn(
              `⏭️ [COORDINATION-SKIP] DynamicTaskSearchで完了済み - スキップ:`,
              {
                taskId: taskId,
                skippedBy: "DynamicTaskSearch coordination",
                completedTasksSize:
                  window.DynamicTaskSearch.completedTasks.size,
                groupNumber: taskGroup.groupNumber,
                timestamp: new Date().toISOString(),
              },
            );
            continue; // タスク生成をスキップ
          }

          // グローバルレジストリで完了済みの場合もスキップ
          if (window.globalCompletedTasks?.has(taskId)) {
            console.warn(
              `⏭️ [COORDINATION-SKIP] グローバルレジストリで完了済み - スキップ:`,
              {
                taskId: taskId,
                skippedBy: "GlobalRegistry coordination",
                globalRegistrySize: window.globalCompletedTasks.size,
                groupNumber: taskGroup.groupNumber,
                timestamp: new Date().toISOString(),
              },
            );
            continue; // タスク生成をスキップ
          }

          // Step4との互換性のため、aiTypeフィールドも追加
          const task = {
            taskId: `task_${taskGroup.groupNumber}_${row + 1}_${Date.now()}`, // 1-basedの行番号
            id: `task_${taskGroup.groupNumber}_${row + 1}_${Date.now()}`, // Step4互換、1-basedの行番号
            groupNumber: taskGroup.groupNumber,
            groupType: taskGroup.groupType,
            row: row + 1, // 1-basedの行番号
            column: answerColumn, // プロンプト列ではなく回答列を設定
            prompt: `現在${answerColumn ? `${answerColumn}${row + 1}` : promptColumns.length > 0 ? promptColumns.map((col) => `${col}${row + 1}`).join(",") : `行${row + 1}`}の作業中です。\n\n${prompts.join("\n\n")}`, // 1-basedの行番号
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
            logCell: taskGroup.columns?.log
              ? `${taskGroup.columns.log}${row + 1}` // 1-basedの行番号
              : taskGroup.logColumn
                ? `${taskGroup.logColumn}${row + 1}` // 1-basedの行番号
                : null,
            promptCells: promptColumns.map((col) => `${col}${row + 1}`), // 1-basedの行番号
            answerCell: answerCell,
            tabId: windowInfo?.tabId, // 🆕 タブID追加
            windowId: windowInfo?.windowId, // 🆕 ウィンドウID追加
            cellInfo: {
              // Step4互換: cellInfo構造追加
              row: row + 1, // 1-basedの行番号
              column: answerColumn || promptColumns[0], // answerColumnを直接使用（正規表現不要）
              columnIndex: columnToIndex(answerColumn || promptColumns[0]),
            },
            ...parseSpreadsheetUrl(options.spreadsheetUrl || ""),
            sheetName: options.sheetName || "", // シート名を追加
          };

          // デバッグログを収集（後でまとめて表示）
          debugLogs.push({
            row: row + 1, // 1-basedの行番号
            taskId: task.taskId,
            answerCell: task.answerCell,
            logCell: task.logCell,
            aiType: task.ai,
            promptLength: task.prompt?.length || 0,
            sheetName: task.sheetName, // シート名を追加
          });

          // DEBUG: タスク作成完了

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
          taskId: `task_${taskGroup.groupNumber}_${row + 1}_${Date.now()}`, // 1-basedの行番号
          id: `task_${taskGroup.groupNumber}_${row + 1}_${Date.now()}`, // Step4互換、1-basedの行番号
          groupNumber: taskGroup.groupNumber,
          groupType: taskGroup.groupType,
          row: row + 1, // 1-basedの行番号
          // Step 4-5-3: 統一プロンプト生成ロジック（作業列を優先表示）
          prompt: `現在${taskGroup.columns.work ? `${taskGroup.columns.work}${row + 1}` : promptColumns.length > 0 ? promptColumns.map((col) => `${col}${row + 1}`).join(",") : `行${row + 1}`}の作業中です。\n\n${prompts.join("\n\n")}`, // 1-basedの行番号
          ai: taskGroup.groupType,
          aiType: taskGroup.groupType, // Step4互換 - lowercase変換削除
          model: "",
          function: "",
          logCell: taskGroup.columns.log
            ? `${taskGroup.columns.log}${row + 1}` // 1-basedの行番号
            : null,
          workCell: taskGroup.columns.work
            ? `${taskGroup.columns.work}${row + 1}` // 1-basedの行番号
            : null,
          tabId: windowInfo?.tabId, // 🆕 タブID追加
          windowId: windowInfo?.windowId, // 🆕 ウィンドウID追加
          cellInfo: {
            // Step4互換: cellInfo構造追加
            row: row + 1, // 1-basedの行番号
            column: taskGroup.columns.work || "A",
            columnIndex: taskGroup.columns.work
              ? columnToIndex(taskGroup.columns.work)
              : 0,
          },
          ...parseSpreadsheetUrl(options.spreadsheetUrl || ""),
          sheetName: options.sheetName || "", // シート名を追加
        };

        // Step 4-5-4: 統一プロンプト生成の動作確認ログ
        const promptPreview = task.prompt.substring(
          0,
          task.prompt.indexOf("\n\n") || 30,
        );
        addLog(`[統一プロンプト] 行${row + 1}: ${promptPreview}`); // 1-basedの行番号

        // デバッグログを収集（後でまとめて表示）
        debugLogs.push({
          row: row + 1, // 1-basedの行番号
          taskId: task.taskId,
          workCell: task.workCell,
          logCell: task.logCell,
          aiType: task.ai,
          promptLength: task.prompt?.length || 0,
          sheetName: task.sheetName, // シート名を追加
        });

        log.debug(
          `[3-4] [DEBUG] タスク追加: 行${row + 1}, AI=${aiType}, hasAnswer状態不明`, // 1-basedの行番号
        );
        validTasks.push(task);
        tasksCreated++; // タスク作成数をインクリメント
      }
    }

    // まとめログを出力（0-based indexから行数を計算）
    const totalRows = lastPromptRow - (dataStartRow - 1) + 1;
    const processedRows = validTasks.length;
    const skippedCount = skippedRows.length;

    // スキップ詳細のサマリー出力
    if (skippedDetails.length > 0) {
      const skipSummary = {};
      skippedDetails.forEach((detail) => {
        const key = `${detail.reason}_${detail.column}列`;
        if (!skipSummary[key]) {
          skipSummary[key] = [];
        }
        skipSummary[key].push(detail.row);
      });

      ExecuteLogger.info(
        `[TaskList] スキップサマリー (${skippedDetails.length}件):`,
        {
          詳細: Object.entries(skipSummary).map(([key, rows]) => {
            return `${key}: ${rows.length}件 (行: ${rows.join(", ")})`;
          }),
          グループ: taskGroup.groupNumber,
          グループタイプ: taskGroup.groupType,
        },
      );

      addLog(
        `[TaskList] スキップサマリー: ${skippedDetails.length}件スキップ`,
        {
          summary: Object.entries(skipSummary)
            .map(([key, rows]) => `${key}: ${rows.length}件`)
            .join(", "),
        },
      );
    }

    log.debug(
      `[3-4] [TaskList] 処理結果サマリー: 全${totalRows}行中、処理対象${processedRows}行、スキップ${skippedCount}行`,
    );

    // 3-3: 3タスクずつのバッチ作成
    const batchSize = options.batchSize || 3;
    const batch = validTasks.slice(0, batchSize);

    // 「既に回答あり」ログのサマリー出力（統合済み上記に含む）

    return batch;
  } catch (error) {
    log.error(
      "[3-4] [step3-tasklist.js] [Step 3-Error] generateTaskList内でエラー発生:",
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
    log.error(
      `[3-4] [step3-tasklist.js] [Step 3-5-Error] ❌ 列制御取得エラー:`,
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
      log.debug("[3-4] [step3-tasklist] Google Services初期化完了");
      return true;
    }

    // フォールバック: 基本的な認証チェック
    if (typeof chrome !== "undefined" && chrome.identity) {
      return new Promise((resolve) => {
        chrome.identity.getAuthToken({ interactive: false }, (token) => {
          if (chrome.runtime.lastError) {
            log.warn(
              "[3-4] [step3-tasklist] 認証トークン取得失敗:",
              chrome.runtime.lastError,
            );
            resolve(false);
          } else {
            log.debug(
              "[3-4] [step3-tasklist] 認証トークン確認完了:",
              token ? "✓" : "✗",
            );
            resolve(true);
          }
        });
      });
    }

    log.warn("[3-4] [step3-tasklist] Google Services初期化環境が不明");
    return false;
  } catch (error) {
    log.error("[3-4] [step3-tasklist] Google Services初期化エラー:", error);
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
      log.error(
        "[3-4] [step3-tasklist] initializeGoogleServices関数が定義されていません",
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
    log.error(
      "[3-4] ❌ [step3-tasklist.js] window.Step3TaskList初期化エラー:",
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
  info: (...args) => log.debug(`[3-4] [step3-tasklist.js]`, ...args),
  debug: (...args) =>
    log.debug(`[3-4] [step3-tasklist.js] [3-4] [DEBUG]`, ...args),
  warn: (...args) => log.warn(`[3-4] [step3-tasklist.js]`, ...args),
  error: (...args) => log.error(`[3-4] [step3-tasklist.js]`, ...args),
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
      return "Claude";
    }
    const normalized = aiType.toLowerCase().trim();
    const mappings = {
      chatgpt: "ChatGPT",
      claude: "Claude",
      gemini: "Gemini",
      genspark: "Genspark",
      report: "Report",
      "3種類（chatgpt・gemini・claude）": "3AI",
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
      // window.WindowServiceが存在すれば使用
      if (window.WindowService) {
        this.windowService = window.WindowService;
        // DEBUG: window.WindowService発見・使用
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
      this.windowService = StepIntegratedWindowService; // StepIntegratedWindowServiceを直接使用
    }

    // WindowService設定完了
    ExecuteLogger.info({
      serviceName:
        this.windowService?.name || this.windowService?.constructor?.name,
      useInternalController: this.windowService === StepIntegratedWindowService,
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
    });

    // WindowService初期化確認
    if (!this.windowService) {
      await this.initializeWindowService();
    }

    // Promise.allを使用して全ウィンドウを同時に開く
    const windowPromises = windowLayout.map(async (layout) => {
      try {
        ExecuteLogger.info(
          `🪟 [Step 4-1-2-${layout.position}] ${layout.aiType}ウィンドウを${layout.position}番目に開く`,
        );

        // AI種別に応じたURLを取得
        const url = this.getAIUrl(layout.aiType);

        // 🔍 [DEBUG] WindowService呼び出し前の詳細チェック（簡潔版）
        ExecuteLogger.debug(`🔍 [DEBUG] ウィンドウ作成前チェック:`, {
          aiType: layout.aiType,
          position: layout.position,
          url: url,
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
          windowId: windowInfo?.id,
          tabId: windowInfo?.tabs?.[0]?.id,
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
          const normalizedAiType = this.normalizeAiType(layout.aiType);
          windowData.uniqueKey = uniqueKey;

          // 並列実行でも安全にウィンドウデータを保存
          // 単一のウィンドウとして保存（後で配列として取得される）
          const storageKey = `${normalizedAiType}_${layout.position}`;
          this.openedWindows.set(storageKey, windowData);

          ExecuteLogger.debug(`[WindowController] ウィンドウ保存完了`, {
            aiType: layout.aiType,
            storageKey: storageKey,
            position: layout.position,
          });

          ExecuteLogger.info(
            `✅ [Step 4-1-2-${layout.position}] ${layout.aiType}ウィンドウ作成成功`,
          );

          return {
            aiType: layout.aiType,
            success: true,
            windowId: windowInfo.id,
            tabId:
              windowInfo.tabs && windowInfo.tabs[0]
                ? windowInfo.tabs[0].id
                : undefined,
            position: layout.position,
          };
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
          return {
            aiType: layout.aiType,
            success: false,
            error: "ウィンドウ作成失敗: windowInfoが不正",
            position: layout.position,
          };
        }
      } catch (error) {
        ExecuteLogger.error(
          `❌ [Step 4-1-2-${layout.position}] ${layout.aiType}ウィンドウ作成失敗:`,
          error,
        );
        return {
          aiType: layout.aiType,
          success: false,
          error: error.message,
          position: layout.position,
        };
      }
    });

    // 全ウィンドウの作成を並列実行
    const results = await Promise.all(windowPromises);

    // 全ウィンドウ作成後に5秒待機（ページの完全読み込みを待つ）
    if (results.some((r) => r.success)) {
      ExecuteLogger.info(
        `⏳ 全ウィンドウのタブ準備待機中... (${BATCH_PROCESSING_CONFIG.WINDOW_CREATION_WAIT / 1000}秒)`,
      );
      await new Promise((resolve) =>
        setTimeout(resolve, BATCH_PROCESSING_CONFIG.WINDOW_CREATION_WAIT),
      );
    }

    ExecuteLogger.info(
      "🏁 [WindowController] Step 4-1-2: 4分割ウィンドウ開く完了",
      results,
    );

    ExecuteLogger.info("[WindowController] openWindows完了", {
      resultsLength: results.length,
      successfulResults: results.filter((r) => r.success).length,
      failedResults: results.filter((r) => !r.success).length,
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

    // デバッグ：重複チェック
    if (aiTypes.length !== [...new Set(aiTypes)].length) {
      ExecuteLogger.warn(
        `⚠️ [WindowController] 重複したAIタイプが検出されました。重複削除前: ${aiTypes.length}個, 削除後: ${[...new Set(aiTypes)].length}個`,
      );
    }

    const checkResults = [];

    for (const aiType of aiTypes) {
      // タスクキーから基本のAIタイプを抽出（例: Claude_task_2_16_xxx → claude）
      const baseAiType = aiType.replace(/_task.*/, "");
      const normalizedAiType = this.normalizeAiType(baseAiType);

      // 新しい保存形式に対応: 該当するウィンドウを全て探す（並列処理対応）
      const matchingWindows = [];
      for (const [key, value] of this.openedWindows.entries()) {
        if (
          key.toLowerCase().startsWith(normalizedAiType.toLowerCase() + "_")
        ) {
          matchingWindows.push({ key, value });
        }
      }

      if (matchingWindows.length === 0) {
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

      // 全ての該当ウィンドウをチェック（並列処理対応）
      ExecuteLogger.info(
        `🔍 [Step 4-1-3] ${aiType}ウィンドウを全てチェック中... (${matchingWindows.length}個)`,
      );

      let allChecksPass = true;
      const allCheckResults = [];

      for (const { key, value: windowInfo } of matchingWindows) {
        try {
          ExecuteLogger.info(`🔍 [Step 4-1-3] ${key}ウィンドウをチェック中...`);

          // タブをアクティブにしてからチェック
          if (windowInfo.tabId) {
            await chrome.tabs.update(windowInfo.tabId, { active: true });
            await new Promise((resolve) => setTimeout(resolve, 1000)); // 読み込み待機
          }

          // AI種別に応じたチェック処理
          const checkResult = await this.performWindowCheck(
            aiType,
            windowInfo.tabId,
          );

          allCheckResults.push({
            windowKey: key,
            tabId: windowInfo.tabId,
            success: checkResult.success,
            checks: checkResult.checks,
            error: checkResult.error,
          });

          if (!checkResult.success) {
            allChecksPass = false;
          }
        } catch (error) {
          ExecuteLogger.error(
            `❌ [Step 4-1-3] ${key}ウィンドウチェックエラー:`,
            error.message,
          );
          allCheckResults.push({
            windowKey: key,
            tabId: windowInfo.tabId,
            success: false,
            error: error.message,
          });
          allChecksPass = false;
        }
      }

      checkResults.push({
        aiType: aiType,
        success: allChecksPass,
        windowCount: matchingWindows.length,
        allWindowResults: allCheckResults,
        error: allChecksPass
          ? null
          : "一部のウィンドウでUI要素が見つかりません",
      });
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
   * Content Scriptが準備完了になるまで待機する関数
   * @param {number} tabId - タブID
   * @param {string} aiType - AI種別 (claude, chatgpt, gemini, genspark)
   * @param {number} maxRetries - 最大リトライ回数
   * @param {number} delayMs - リトライ間隔(ms)
   * @returns {boolean} Content Scriptが準備完了したかどうか
   */
  async waitForContentScriptReady(
    tabId,
    aiType,
    maxRetries = 5,
    delayMs = 1000,
  ) {
    ExecuteLogger.info(
      `🔄 [Content Script Check] 開始: ${aiType} (tabId: ${tabId})`,
    );

    for (let i = 0; i < maxRetries; i++) {
      try {
        // ping/pongメッセージでContent Scriptの準備状態を確認
        const pingMessage = {
          action: "ping",
          type: "CONTENT_SCRIPT_CHECK",
          timestamp: Date.now(),
        };

        // 初回のみログ出力
        if (i === 0) {
          ExecuteLogger.debug(
            `📡 [Content Script Check] Attempt ${i + 1}/${maxRetries}`,
          );
        }

        // タイムアウト付きでpingを送信
        const response = await Promise.race([
          chrome.tabs.sendMessage(tabId, pingMessage),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Ping timeout")), 2000),
          ),
        ]);

        if (
          response &&
          (response.status === "ready" || response.action === "pong")
        ) {
          ExecuteLogger.info(`✅ [Content Script Check] 準備完了: ${aiType}`);
          return true;
        }
      } catch (error) {
        const errorMessage = error.message || String(error);

        // "Could not establish connection"エラーの場合
        if (
          errorMessage.includes("Could not establish connection") ||
          errorMessage.includes("Receiving end does not exist")
        ) {
          ExecuteLogger.debug(
            `⏳ [Content Script Check] まだ準備中 (${i + 1}/${maxRetries})`,
          );
        } else if (errorMessage.includes("Ping timeout")) {
          ExecuteLogger.debug(
            `⏱️ [Content Script Check] タイムアウト (${i + 1}/${maxRetries})`,
          );
        } else {
          ExecuteLogger.warn(
            `⚠️ [Content Script Check] エラー: ${errorMessage}`,
          );
        }

        if (i < maxRetries - 1) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
    }

    ExecuteLogger.warn(
      `⚠️ [Content Script Check] 準備完了タイムアウト: ${aiType}`,
    );
    return false;
  }

  /**
   * タブが準備完了になるまで待機する関数
   */
  async waitForTabReady(
    tabId,
    maxRetries = 15, // 15回に増やす（30秒待機）
    delayMs = 2000,
  ) {
    const startTimestamp = new Date().toISOString();
    const lifecycleId = `tab_${tabId}_${Date.now()}`;

    // 🔍 [TAB-LIFECYCLE] タブライフサイクル開始ログ
    console.log(`🔍 [TAB-LIFECYCLE] waitForTabReady開始:`, {
      lifecycleId,
      tabId,
      startTimestamp,
      maxRetries,
      delayMs,
      callStack: new Error().stack.split("\n").slice(1, 3),
    });

    for (let i = 0; i < maxRetries; i++) {
      try {
        const attemptTimestamp = new Date().toISOString();
        const tab = await chrome.tabs.get(tabId);

        // 🔍 [TAB-LIFECYCLE] タブ状態チェック詳細（初回とエラー時のみ）
        if (i === 0 || i === maxRetries - 1) {
          console.log(`🔍 [TAB-LIFECYCLE] タブ状態チェック:`, {
            lifecycleId,
            tabId,
            attempt: i + 1,
            maxRetries,
            attemptTimestamp,
            tabState: {
              exists: Boolean(tab),
              status: tab?.status,
              url: tab?.url,
            },
            isReady: tab && tab.status === "complete",
          });
        }

        if (tab && tab.status === "complete") {
          const completionTimestamp = new Date().toISOString();

          // 🔍 [TAB-LIFECYCLE] タブ準備完了
          console.log(`🔍 [TAB-LIFECYCLE] タブ準備完了:`, {
            lifecycleId,
            tabId,
            completionTimestamp,
            totalDuration: Date.now() - new Date(startTimestamp).getTime(),
            attemptsUsed: i + 1,
            finalTabState: {
              status: tab.status,
              url: tab.url,
              windowId: tab.windowId,
            },
          });

          ExecuteLogger.info(`✅ [Tab Ready] Tab is ready:`, {
            tabId: tabId,
            finalStatus: tab.status,
            attemptsUsed: i + 1,
          });
          // 追加の安定化待機（JavaScript読み込み完了確保）
          await new Promise((resolve) => setTimeout(resolve, 2000));
          return tab;
        }

        if (i < maxRetries - 1) {
          ExecuteLogger.info(
            `⏳ [Tab Ready] Waiting ${delayMs}ms before retry...`,
          );
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      } catch (error) {
        const errorTimestamp = new Date().toISOString();

        // 🔍 [TAB-LIFECYCLE] タブエラー詳細
        console.error(`🔍 [TAB-LIFECYCLE] タブエラー発生:`, {
          lifecycleId,
          tabId,
          errorTimestamp,
          attempt: i + 1,
          errorMessage: error.message,
          errorType: error.constructor.name,
          isTabMissing: error?.message?.includes("No tab with id"),
          callDuration: Date.now() - new Date(startTimestamp).getTime(),
        });

        // タブが存在しない場合の早期終了
        if (error?.message?.includes("No tab with id")) {
          // 代替手法でタブ存在確認
          try {
            const allTabs = await chrome.tabs.query({});
            const targetExists = allTabs.some((t) => t.id === tabId);

            // 🔍 [TAB-LIFECYCLE] 全タブスキャン結果
            console.error(`🔍 [TAB-LIFECYCLE] 全タブスキャン結果:`, {
              lifecycleId,
              tabId,
              targetExists,
              totalTabsCount: allTabs.length,
              existingTabIds: allTabs.map((t) => t.id),
              searchedTabId: tabId,
            });

            if (!targetExists) {
              log.warn(
                `[3-4] ⚠️ [Tab Check] タブ ${tabId} は削除済みのため新しいタブを作成します`,
              );
              // タブが閉じられている場合は新しいタブを作成して復旧
              return null; // nullを返して呼び出し側で新しいタブを作成させる
            }
          } catch (queryError) {
            console.error(`🔍 [TAB-LIFECYCLE] クエリエラー:`, {
              lifecycleId,
              tabId,
              queryError: queryError.message,
              originalError: error.message,
            });

            log.warn(
              `[3-4] ⚠️ [Tab Check] タブ ${tabId} の存在確認に失敗 - 復旧を試行: ${queryError.message}`,
            );
            // タブ検証エラーの場合は null を返して呼び出し側で新しいタブを作成
            return null;
          }
        }

        // その他のエラーについてはデバッグ情報を記録
        log.error("[3-4] 🔴 [DEBUG-TAB-ERROR] 詳細エラー情報:", {
          errorMessage: error?.message || "メッセージなし",
          tabId: tabId,
          attempt: i + 1,
          maxRetries: maxRetries,
        });

        // 代替手法での情報取得
        try {
          const allTabs = await chrome.tabs.query({});
          log.debug("[3-4] 📋 [DEBUG-ALL-TABS] 全タブ情報:", {
            totalTabs: allTabs.length,
            targetTabExists: allTabs.some((t) => t.id === tabId),
            tabIds: allTabs.map((t) => t.id),
          });
        } catch (queryError) {
          log.error(
            "[3-4] ❌ [DEBUG-QUERY-ERROR]:",
            queryError.message,
            queryError,
          );
        }

        ExecuteLogger.error(`❌ [Tab Ready Check] Error on attempt ${i + 1}:`, {
          tabId: tabId,
          error: error.message || String(error),
          errorString: String(error),
          willRetry: i < maxRetries - 1,
        });

        if (i < maxRetries - 1) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
    }

    throw new Error(
      `Tab ${tabId} did not become ready after ${maxRetries} attempts`,
    );
  }

  /**
   * ファーストウィン戦略による高速ウィンドウチェック
   */
  async checkWindowsOptimized(aiType) {
    log.debug(`[3-4] [FastCheck] ${aiType}の高速チェック開始`);

    // Step 1: UnifiedWindowManagerで最初に動作するウィンドウを見つける
    const workingWindow =
      await StepIntegratedWindowService.unifiedManager.findFirstWorkingWindow(
        aiType,
      );

    if (workingWindow) {
      log.debug(
        `[3-4] ✅ [FastCheck] ${aiType}の動作ウィンドウ発見: ${workingWindow.tabId}`,
      );

      // UI要素の詳細チェック
      const detailCheck = await this.performWindowCheck(
        aiType,
        workingWindow.tabId,
      );
      if (detailCheck.success) {
        return {
          success: true,
          window: workingWindow,
          checks: detailCheck.checks,
          strategy: "first-win",
          checkTime: Date.now(),
        };
      }
    }

    // Step 2: 見つからない場合のみ従来の全チェック
    log.debug(
      `[3-4] 🔍 [FastCheck] ${aiType}のフォールバック: 全ウィンドウチェック`,
    );
    return await this.performFullWindowCheck(aiType);
  }

  /**
   * 従来の全ウィンドウチェック（フォールバック用）
   */
  async performFullWindowCheck(aiType) {
    log.debug(`[3-4] [FullCheck] ${aiType}の全ウィンドウチェック開始`);

    // 従来のロジックを保持
    const baseAiType = aiType.replace(/_task.*/, "");
    const normalizedAiType = this.normalizeAiType(baseAiType);

    const matchingWindows = [];
    for (const [key, value] of this.openedWindows.entries()) {
      if (key.toLowerCase().startsWith(normalizedAiType.toLowerCase() + "_")) {
        matchingWindows.push({ key, value });
      }
    }

    if (matchingWindows.length === 0) {
      return {
        success: false,
        error: `${aiType}のウィンドウが見つかりません`,
        strategy: "full-check",
      };
    }

    // 最初の成功ウィンドウで終了（改善版）
    for (const { key, value: windowInfo } of matchingWindows) {
      try {
        const checkResult = await this.performWindowCheck(
          aiType,
          windowInfo.tabId,
        );
        if (checkResult.success) {
          log.debug(
            `[3-4] ✅ [FullCheck] ${aiType}成功ウィンドウ: ${windowInfo.tabId}`,
          );
          return {
            success: true,
            window: { tabId: windowInfo.tabId, key },
            checks: checkResult.checks,
            strategy: "full-check-success",
          };
        }
      } catch (error) {
        log.debug(`[3-4] ❌ [FullCheck] ${key}チェックエラー:`, error.message);
      }
    }

    return {
      success: false,
      error: `${aiType}の動作ウィンドウが見つかりません`,
      strategy: "full-check-failed",
    };
  }

  /**
   * 個別ウィンドウのチェック処理（安定化リトライ版）
   */
  async performWindowCheck(aiType, tabId) {
    log.debug(
      `[3-4] [DEBUG-performWindowCheck] 開始: aiType=${aiType}, tabId=${tabId}`,
    );

    return await executeSimpleRetry({
      action: async () => {
        const checks = {
          textInput: false,
          modelDisplay: false,
          functionDisplay: false,
        };

        // タブの準備完了を待機
        log.debug(
          `[3-4] [DEBUG-performWindowCheck] タブ準備完了待機開始: tabId=${tabId}`,
        );
        const tab = await this.waitForTabReady(
          tabId,
          BATCH_PROCESSING_CONFIG.ELEMENT_RETRY_COUNT,
          BATCH_PROCESSING_CONFIG.ELEMENT_RETRY_INTERVAL,
        );
        log.debug(`[3-4] [DEBUG-performWindowCheck] タブ準備完了:`, {
          tabId,
          url: tab?.url,
          status: tab?.status,
        });

        // SafeMessengerを使用してContent scriptにチェック要求を送信
        log.debug(
          `[3-4] [DEBUG-performWindowCheck] SafeMessenger送信開始: tabId=${tabId}, aiType=${aiType}`,
        );
        const result = await SafeMessenger.sendSafeMessage(tabId, {
          action: "CHECK_UI_ELEMENTS",
          aiType: aiType,
        });
        log.debug(
          `[3-4] [DEBUG-performWindowCheck] SafeMessenger完了:`,
          result,
        );

        let response = null;
        if (result.success) {
          response = result.data;
        }

        if (response) {
          checks.textInput = response.textInput || false;
          checks.modelDisplay = response.modelDisplay || false;
          checks.functionDisplay = response.functionDisplay || false;
        }

        const allChecksPass = Object.values(checks).every((check) => check);
        log.debug(
          `[3-4] [DEBUG-performWindowCheck] チェック結果: allChecksPass=${allChecksPass}`,
          checks,
        );

        return {
          success: allChecksPass,
          checks: checks,
          error: allChecksPass ? null : "UI要素の一部が見つかりません",
        };
      },
      isSuccess: (result) => result && result.success,
      maxRetries: 5,
      interval: 1000,
      actionName: `ウィンドウチェック (${aiType}, tabId=${tabId})`,
      context: { aiType, tabId },
    });
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
   * 利用可能なウィンドウポジションを検索
   * @returns {number} 利用可能なposition (0-2)
   */
  findAvailablePosition() {
    try {
      ExecuteLogger.debug(`🔍 [findAvailablePosition] 検索開始`);

      // positionToWindowが未初期化の場合は初期化
      if (!StableWindowManager.positionToWindow) {
        ExecuteLogger.warn(
          "⚠️ [findAvailablePosition] positionToWindow未初期化、初期化実行",
        );
        StableWindowManager.positionToWindow = new Map();
      }

      // 現在の使用状況をログ出力
      const currentPositions = Array.from(
        StableWindowManager.positionToWindow.entries(),
      );
      ExecuteLogger.debug(
        `🔍 [findAvailablePosition] 現在の使用状況:`,
        currentPositions,
      );

      // positionToWindowマップから利用可能なpositionを検索（0-2の3つのみ）
      for (let position = 0; position < 3; position++) {
        const isUsed = StableWindowManager.positionToWindow.has(position);
        ExecuteLogger.debug(
          `   position ${position}: ${isUsed ? "使用中" : "利用可能"}`,
        );

        if (!isUsed) {
          ExecuteLogger.debug(
            `🎯 [findAvailablePosition] 利用可能なposition発見: ${position}`,
          );
          return position;
        }
      }

      // 全てのpositionが使用中の場合
      ExecuteLogger.warn(
        "⚠️ [findAvailablePosition] 全positionが使用中、position 0を上書き使用",
      );
      return 0;
    } catch (error) {
      ExecuteLogger.error(
        "❌ [findAvailablePosition] エラー発生、デフォルトでposition 0を返す:",
        error,
      );
      return 0;
    }
  }

  /**
   * 閉じられたウィンドウをopenedWindowsから削除
   * @param {number} windowId - 削除するウィンドウID
   */
  async removeClosedWindow(windowId) {
    try {
      ExecuteLogger.debug(
        `🗑️ [removeClosedWindow] ウィンドウ削除開始: ${windowId}`,
      );

      // 先にウィンドウの存在確認
      try {
        await chrome.windows.get(windowId);
        ExecuteLogger.warn(
          `⚠️ [removeClosedWindow] ウィンドウ ${windowId} は実際にはまだ存在します`,
        );
        return; // 実際に存在する場合は削除しない
      } catch (checkError) {
        // ウィンドウが存在しない場合（期待される動作）
        ExecuteLogger.debug(
          `✅ [removeClosedWindow] ウィンドウ ${windowId} は既に削除済み - 管理情報をクリーンアップ`,
        );
      }

      // openedWindowsマップから該当ウィンドウを検索・削除
      let found = false;
      for (const [key, windowInfo] of this.openedWindows.entries()) {
        if (windowInfo.windowId === windowId) {
          this.openedWindows.delete(key);
          ExecuteLogger.info(
            `✅ [removeClosedWindow] ウィンドウ削除完了: ${key} (windowId: ${windowId})`,
          );
          found = true;
          break;
        }
      }

      if (!found) {
        ExecuteLogger.warn(
          `⚠️ [removeClosedWindow] ウィンドウ ${windowId} は管理情報に見つかりませんでした`,
        );
      }

      // StepIntegratedWindowServiceのクリーンアップも実行
      if (
        typeof StepIntegratedWindowService.cleanupClosedWindow === "function"
      ) {
        StepIntegratedWindowService.cleanupClosedWindow(windowId);
        ExecuteLogger.debug(
          `🧹 [removeClosedWindow] StepIntegratedWindowService クリーンアップ完了`,
        );
      }
    } catch (error) {
      ExecuteLogger.error(`❌ [removeClosedWindow] エラー:`, error);
    }
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

  /**
   * 正しいAIサイトのタブIDを検索する
   * @param {string} automationName - オートメーション名
   * @param {number} windowId - ウィンドウID
   * @returns {Promise<number|null>} 正しいタブID
   */
  async findCorrectAITab(automationName, windowId) {
    try {
      ExecuteLogger.info(`🔍 [findCorrectAITab] AIサイトタブ検索開始:`, {
        automationName: automationName,
        windowId: windowId,
      });

      // ウィンドウ内の全タブを取得
      const window = await chrome.windows.get(windowId, { populate: true });

      // 🔍 [段階2] ウィンドウ取得結果の詳細ログ
      ExecuteLogger.warn(
        `🔍 [段階2-findCorrectAITab] chrome.windows.get結果の詳細分析:`,
        {
          windowId: windowId,
          automationName: automationName,
          windowExists: !!window,
          windowState: window ? window.state : null,
          windowType: window ? window.type : null,
          tabsCount: window && window.tabs ? window.tabs.length : 0,
          hasPopulatedTabs: !!(window && window.tabs && window.tabs.length > 0),
        },
      );

      if (!window.tabs || window.tabs.length === 0) {
        ExecuteLogger.warn(
          `⚠️ [findCorrectAITab] ウィンドウにタブが見つかりません: ${windowId}`,
        );
        return null;
      }

      // 🔍 [段階2] 全タブの詳細分析
      const tabsAnalysis = window.tabs.map((tab, index) => {
        const isValidAI = this.validateAIUrl(tab.url, automationName);
        return {
          tabIndex: index,
          tabId: tab.id,
          url: tab.url,
          pendingUrl: tab.pendingUrl,
          title: tab.title,
          status: tab.status,
          active: tab.active,
          windowId: tab.windowId,
          isExtensionPage: tab.url
            ? tab.url.startsWith("chrome-extension://")
            : false,
          isClaudeAI: tab.url ? tab.url.includes("claude.ai") : false,
          isChromeNewTab: tab.url === "chrome://newtab/",
          isAboutBlank: tab.url === "about:blank",
          validateAIUrlResult: isValidAI,
          urlLength: tab.url ? tab.url.length : 0,
          hasUrl: !!tab.url,
        };
      });

      ExecuteLogger.warn(`🔍 [段階2-findCorrectAITab] 全タブの詳細分析:`, {
        windowId: windowId,
        automationName: automationName,
        tabCount: window.tabs.length,
        tabsAnalysis: tabsAnalysis,
        validAITabsCount: tabsAnalysis.filter((t) => t.validateAIUrlResult)
          .length,
        extensionPagesCount: tabsAnalysis.filter((t) => t.isExtensionPage)
          .length,
        claudeAITabsCount: tabsAnalysis.filter((t) => t.isClaudeAI).length,
      });

      ExecuteLogger.debug(`🔍 [findCorrectAITab] ウィンドウ内タブ情報:`, {
        windowId: windowId,
        tabCount: window.tabs.length,
        tabs: window.tabs.map((tab) => ({
          id: tab.id,
          url: tab.url,
          title: tab.title,
          status: tab.status,
        })),
      });

      // 期待されるURLパターンを取得
      const expectedUrlPatterns = this.getExpectedUrlPatterns(automationName);

      // 🔍 [段階2] URLパターンマッチングの詳細ログ
      ExecuteLogger.warn(
        `🔍 [段階2-findCorrectAITab] URLパターンマッチング開始:`,
        {
          automationName: automationName,
          expectedUrlPatterns: expectedUrlPatterns,
        },
      );

      // タブをURLパターンでフィルタリング
      for (const tab of window.tabs) {
        // 🔍 [段階2] 各タブの検証詳細ログ
        const validationResult = this.validateAIUrl(tab.url, automationName);
        const tabValidationDetails = {
          tabId: tab.id,
          url: tab.url,
          automationName: automationName,
          hasUrl: !!tab.url,
          urlType: tab.url
            ? tab.url.startsWith("chrome-extension://")
              ? "extension"
              : tab.url.includes("claude.ai")
                ? "claude"
                : tab.url === "chrome://newtab/"
                  ? "newtab"
                  : tab.url === "about:blank"
                    ? "blank"
                    : "other"
            : "none",
          validationResult: validationResult,
          expectedPatterns: expectedUrlPatterns,
        };
        ExecuteLogger.warn(
          `🔍 [段階2-findCorrectAITab] タブ検証結果: ${JSON.stringify(tabValidationDetails, null, 2)}`,
        );

        if (tab.url && validationResult) {
          ExecuteLogger.info(
            `✅ [findCorrectAITab] 正しいAIサイトタブを発見:`,
            {
              tabId: tab.id,
              url: tab.url,
              automationName: automationName,
            },
          );
          return tab.id;
        }
      }

      ExecuteLogger.error(
        `❌ [findCorrectAITab] 該当するAIサイトタブが見つかりません:`,
        {
          automationName: automationName,
          windowId: windowId,
          availableTabs: window.tabs.map((tab) => tab.url),
          expectedPatterns: expectedUrlPatterns,
        },
      );

      return null;
    } catch (error) {
      ExecuteLogger.error(`❌ [findCorrectAITab] エラー:`, {
        automationName: automationName,
        windowId: windowId,
        error: error.message,
      });
      return null;
    }
  }

  /**
   * AIサイトのURL有効性を検証する
   * @param {string} url - チェックするURL
   * @param {string} automationName - オートメーション名
   * @returns {boolean} 有効かどうか
   */
  validateAIUrl(url, automationName) {
    if (!url || typeof url !== "string") {
      return false;
    }

    // 拡張機能ページは無効
    if (url.startsWith("chrome-extension://")) {
      return false;
    }

    const urlPatterns = this.getExpectedUrlPatterns(automationName);

    for (const pattern of urlPatterns) {
      if (url.includes(pattern)) {
        return true;
      }
    }

    return false;
  }

  /**
   * オートメーション名から期待されるURLパターンを取得
   * @param {string} automationName - オートメーション名
   * @returns {string[]} URLパターンの配列
   */
  getExpectedUrlPatterns(automationName) {
    const patterns = {
      ClaudeAutomation: ["claude.ai"],
      ChatGPTAutomationV2: ["chatgpt.com", "chat.openai.com"],
      GeminiAutomation: ["gemini.google.com"],
      GensparkAutomation: ["genspark.com", "genspark.ai"],
    };

    return patterns[automationName] || [];
  }
}

// ========================================
// WindowLifecycleManager: タスク完了処理とウィンドウライフサイクル管理
// ========================================
class WindowLifecycleManager {
  constructor() {
    this.registeredWindows = new Map(); // aiType -> windowInfo
    this.sheetsClient = null;
    this.maxRetries = 3;
    this.retryDelay = 1000;
    ExecuteLogger.info("🔄 WindowLifecycleManager初期化");
  }

  /**
   * ライフサイクル管理初期化
   */
  async initializeLifecycleManager() {
    try {
      ExecuteLogger.info("🔄 [WindowLifecycleManager] 初期化開始");

      // SimpleSheetsClientクラスの存在確認
      if (typeof SimpleSheetsClient === "undefined") {
        throw new Error("SimpleSheetsClientクラスが定義されていません");
      }

      // SheetsClientインスタンス作成
      if (!this.sheetsClient) {
        ExecuteLogger.info(
          "📊 [WindowLifecycleManager] SimpleSheetsClientインスタンス作成中",
        );
        this.sheetsClient = new SimpleSheetsClient();

        // updateCellメソッドの存在確認（より寛容なチェック）
        if (typeof this.sheetsClient.updateCell !== "function") {
          ExecuteLogger.warn(
            "⚠️ [WindowLifecycleManager] SimpleSheetsClient.updateCellメソッドが見つかりません。フォールバックを設定します。",
          );
          // フォールバックメソッドを追加
          this.sheetsClient.updateCell = async (
            spreadsheetId,
            cellRef,
            value,
          ) => {
            ExecuteLogger.warn(
              `⚠️ [WindowLifecycleManager] フォールバックupdateCell: ${cellRef} = ${value?.length || 0}文字`,
            );
            if (typeof this.sheetsClient.updateValue === "function") {
              return await this.sheetsClient.updateValue(
                spreadsheetId,
                cellRef,
                value,
              );
            } else {
              ExecuteLogger.warn(
                "⚠️ updateValueメソッドも見つかりません。スキップします。",
              );
            }
          };
        }

        ExecuteLogger.info(
          "✅ [WindowLifecycleManager] SimpleSheetsClientインスタンス作成完了",
        );
      }

      ExecuteLogger.info("✅ WindowLifecycleManager初期化完了", {
        sheetsClientExists: !!this.sheetsClient,
        hasUpdateCellMethod:
          typeof this.sheetsClient?.updateCell === "function",
        registeredWindowsSize: this.registeredWindows.size,
      });

      return true;
    } catch (error) {
      ExecuteLogger.error("❌ WindowLifecycleManager初期化エラー:", error);

      // フォールバック処理: 基本的な機能だけでも動作するように
      if (!this.sheetsClient) {
        ExecuteLogger.warn(
          "⚠️ [WindowLifecycleManager] フォールバック: SheetsClient機能無効化",
        );
        this.sheetsClient = {
          updateCell: async () => {
            ExecuteLogger.warn(
              "⚠️ [WindowLifecycleManager] SheetsClient無効のため、セル更新をスキップ",
            );
          },
        };
      }

      return false;
    }
  }

  /**
   * ウィンドウを登録
   */
  registerWindow(aiType, windowInfo) {
    this.registeredWindows.set(aiType, windowInfo);
    ExecuteLogger.debug(`🪟 ウィンドウ登録: ${aiType}`, {
      tabId: windowInfo?.tabId,
      windowId: windowInfo?.windowId,
    });
  }

  /**
   * タスク完了処理（メイン機能）
   * @param {Object} task - タスク情報
   * @param {Object} result - 実行結果
   */
  async handleTaskCompletion(task, result) {
    ExecuteLogger.info(
      `🎯 [WindowLifecycleManager] タスク完了処理開始: ${task.id || task.taskId}`,
      {
        aiType: task.aiType,
        success: result?.success,
        hasResult: !!result?.result,
      },
    );

    try {
      // 1. 結果が成功している場合のみスプレッドシート書き込み処理
      if (result?.success && result?.response) {
        await this.writeResultToSpreadsheet(task, result);
      }

      // 2. エラーの場合はエラー情報を記録
      if (!result?.success && result?.error) {
        await this.writeErrorToSpreadsheet(task, result.error);
      }

      // 3. ウィンドウクローズ判定（設定により制御可能）
      await this.handleWindowCleanup(task, result);

      ExecuteLogger.info(
        `✅ [WindowLifecycleManager] タスク完了処理完了: ${task.id || task.taskId}`,
      );
    } catch (error) {
      ExecuteLogger.error(
        `❌ [WindowLifecycleManager] タスク完了処理エラー: ${task.id || task.taskId}`,
        error,
      );
    }
  }

  /**
   * スプレッドシートに結果を書き込み
   */
  async writeResultToSpreadsheet(task, result) {
    try {
      ExecuteLogger.info(
        `📝 [WindowLifecycleManager] スプレッドシート書き込み開始: ${task.id || task.taskId}`,
      );

      // スプレッドシート情報を取得
      const spreadsheetId =
        task.spreadsheetId || window.globalState?.spreadsheetId;
      if (!spreadsheetId) {
        throw new Error("スプレッドシートIDが見つかりません");
      }

      // 結果テキストを取得
      const resultText = this.extractResultText(result);
      if (!resultText || resultText.length < 10) {
        ExecuteLogger.warn(
          `⚠️ [WindowLifecycleManager] 結果テキストが短すぎます: ${resultText?.length || 0}文字`,
        );
      }

      // セル位置を計算
      const cellRef = this.calculateCellReference(task);

      // スプレッドシートに書き込み
      const updateResult = await this.sheetsClient.updateCell(
        spreadsheetId,
        cellRef,
        resultText,
      );

      ExecuteLogger.info(
        `✅ [WindowLifecycleManager] スプレッドシート書き込み完了`,
        {
          requestedCell: cellRef,
          actualCell: updateResult?.updatedRange || cellRef,
          textLength: resultText?.length || 0,
        },
      );

      // 【根本原因特定ログ】書き込み直後の即座検証読み込み
      try {
        const writeTimestamp = Date.now();
        await new Promise((resolve) => setTimeout(resolve, 100)); // 100ms待機

        // cellRefから範囲形式を生成: 'シート名'!A1 -> 'シート名'!A1:A1
        const rangeForVerification = cellRef.includes("!")
          ? cellRef.replace(/!([A-Z]+\d+)$/, "!$1:$1")
          : cellRef;

        const verificationResult = await this.sheetsClient.readRange(
          spreadsheetId,
          rangeForVerification,
        );

        const verifiedValue = verificationResult?.values?.[0]?.[0] || "";
        const isVerified = verifiedValue.length > 0;

        ExecuteLogger.info(`🔍 [WRITE-VERIFICATION] 書き込み直後検証:`, {
          cellRef: cellRef,
          taskId: task.id || task.taskId,
          writeTimestamp: new Date(writeTimestamp).toISOString(),
          verificationTimestamp: new Date().toISOString(),
          originalTextLength: resultText?.length || 0,
          verifiedTextLength: verifiedValue.length,
          isSuccessfullyWritten: isVerified,
          verifiedPreview: verifiedValue.substring(0, 100),
          timeDifference: `${Date.now() - writeTimestamp}ms`,
          groupNumber: task.groupNumber || "unknown",
        });

        // グローバル記録として保存（完了チェック時の参照用）
        if (!window.globalState.recentWrites) {
          window.globalState.recentWrites = [];
        }
        window.globalState.recentWrites.push({
          cellRef: cellRef,
          taskId: task.id || task.taskId,
          timestamp: writeTimestamp,
          verificationTimestamp: Date.now(),
          isVerified: isVerified,
          textLength: resultText?.length || 0,
          groupNumber: task.groupNumber || "unknown",
          row: task.row || "unknown",
        });

        // 古い記録を削除（5分以上前）
        const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
        window.globalState.recentWrites =
          window.globalState.recentWrites.filter(
            (write) => write.timestamp > fiveMinutesAgo,
          );
      } catch (verificationError) {
        ExecuteLogger.error(`❌ [WRITE-VERIFICATION] 書き込み検証エラー:`, {
          cellRef: cellRef,
          taskId: task.id || task.taskId,
          error: verificationError.message,
        });
      }
    } catch (error) {
      ExecuteLogger.error(
        `❌ [WindowLifecycleManager] スプレッドシート書き込みエラー:`,
        error,
      );
    }
  }

  /**
   * エラー情報をスプレッドシートに書き込み
   * 【無効化】エラーメッセージをスプレッドシートに書き込まない
   */
  async writeErrorToSpreadsheet(task, error) {
    // エラーメッセージをスプレッドシートに書き込まない
    ExecuteLogger.warn(
      `⚠️ [WindowLifecycleManager] エラー記録をスキップ（エラーメッセージを回答欄に書かない）: ${error}`,
    );
    return;

    /* 以下の処理は実行されない
    try {
      const spreadsheetId =
        task.spreadsheetId || window.globalState?.spreadsheetId;
      if (!spreadsheetId) return;

      const cellRef = this.calculateCellReference(task);
      const errorMessage = `エラー: ${error}`;

      await this.sheetsClient.updateCell(spreadsheetId, cellRef, errorMessage);

      ExecuteLogger.info(
        `📝 [WindowLifecycleManager] エラー情報記録完了: ${cellRef}`,
      );
    } catch (writeError) {
      ExecuteLogger.error(
        `❌ [WindowLifecycleManager] エラー記録失敗:`,
        writeError,
      );
    }
    */
  }

  /**
   * 結果からテキストを抽出
   */
  extractResultText(result) {
    if (!result) return "";

    // 統一形式に対応（全AI共通）
    if (typeof result === "string") return result;
    if (result.response) return result.response;
    if (result.finalText) return result.finalText;
    if (result.content) return result.content;

    // オブジェクトの場合はJSON文字列として保存
    return JSON.stringify(result, null, 2);
  }

  /**
   * セル参照を計算
   */
  calculateCellReference(task) {
    // answerCellのみを使用（確実な回答列への記載）
    if (!task.answerCell) {
      throw new Error(
        `answerCellが存在しません: taskId=${task.id || "unknown"}`,
      );
    }

    // シート名を動的に取得（ハードコーディング禁止）
    const sheetName =
      window.globalState?.sheetName ||
      `シート${window.globalState?.gid || "0"}`;

    // シート名が既に含まれている場合はそのまま返す
    if (task.answerCell.includes("!")) {
      return task.answerCell;
    }

    // シート名を追加して返す
    return `'${sheetName}'!${task.answerCell}`;
  }

  /**
   * ウィンドウクリーンアップ処理
   */
  async handleWindowCleanup(task, result) {
    try {
      // 個別タスク完了時の即座クローズ設定確認
      const shouldCloseImmediately = this.shouldCloseWindowImmediately(
        task,
        result,
      );

      if (shouldCloseImmediately) {
        ExecuteLogger.info(
          `🚪 [WindowLifecycleManager] ウィンドウ即座クローズ: ${task.aiType}`,
        );

        const windowInfo = this.registeredWindows.get(task.aiType) || {
          windowId: task.windowId,
          tabId: task.tabId,
        };

        if (windowInfo?.windowId) {
          await StepIntegratedWindowService.closeWindow(windowInfo.windowId);
          this.registeredWindows.delete(task.aiType);

          // window.windowController.openedWindows からも削除
          if (task.windowKey && window.windowController?.openedWindows) {
            window.windowController.openedWindows.delete(task.windowKey);
            ExecuteLogger.info(
              `🗑️ [WindowLifecycleManager] openedWindowsから削除: ${task.windowKey}`,
            );
          }

          ExecuteLogger.info(
            `✅ [WindowLifecycleManager] ウィンドウクローズ完了: ${task.aiType}`,
          );
        }
      } else {
        ExecuteLogger.debug(
          `💤 [WindowLifecycleManager] ウィンドウ保持: ${task.aiType}`,
        );
      }
    } catch (error) {
      ExecuteLogger.error(
        `❌ [WindowLifecycleManager] ウィンドウクリーンアップエラー:`,
        error,
      );
    }
  }

  /**
   * ウィンドウを即座に閉じるべきかの判定
   */
  shouldCloseWindowImmediately(task, result) {
    // 成功したタスクのウィンドウを即座に閉じる
    if (result?.success) return true;

    // エラーの場合は保持（デバッグ用）
    return false;
  }

  /**
   * リトライ機能付きタスク実行
   */
  async executeWithRetry(taskFunction, task, description) {
    let lastError = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        ExecuteLogger.info(
          `🔄 [WindowLifecycleManager] 実行試行 ${attempt}/${this.maxRetries}: ${description}`,
        );

        const result = await taskFunction();

        if (result?.success) {
          ExecuteLogger.info(
            `✅ [WindowLifecycleManager] 実行成功: ${description}`,
          );
          return result;
        } else {
          throw new Error(result?.error || "実行結果が成功ではありません");
        }
      } catch (error) {
        lastError = error;

        // タブクローズエラーの場合は復旧を試行
        if (this.isTabClosedError(error)) {
          ExecuteLogger.warn(
            `⚠️ [WindowLifecycleManager] タブクローズエラーを検出 - 復旧を試行: ${error.message}`,
          );
          const recoveryResult = await this.recoverClosedTab(error);
          if (recoveryResult.success) {
            ExecuteLogger.info(`✅ [WindowLifecycleManager] タブ復旧に成功`);
            continue; // 復旧後にリトライ
          } else {
            ExecuteLogger.error(
              `❌ [WindowLifecycleManager] タブ復旧に失敗: ${recoveryResult.error}`,
            );
            return {
              success: false,
              error: recoveryResult.error,
              nonRecoverable: true,
            };
          }
        }

        // その他のリカバリ不可能なエラーの場合は即座に処理を終了
        if (this.isNonRecoverableError(error)) {
          ExecuteLogger.error(
            `❌ [WindowLifecycleManager] リカバリ不可能なエラー - 処理終了: ${error.message}`,
          );
          return { success: false, error: error.message, nonRecoverable: true };
        }

        ExecuteLogger.warn(
          `⚠️ [WindowLifecycleManager] 実行失敗 ${attempt}/${this.maxRetries}: ${error.message}`,
        );

        if (attempt < this.maxRetries) {
          const waitTime = this.retryDelay * attempt;
          ExecuteLogger.info(
            `⏳ [WindowLifecycleManager] ${waitTime}ms待機後リトライ`,
          );
          await new Promise((resolve) => setTimeout(resolve, waitTime));
        }
      }
    }

    ExecuteLogger.warn(
      `⚠️ [WindowLifecycleManager] リトライ後も失敗（エラーはスプレッドシートに記録しません）: ${description}`,
      lastError,
    );
    // エラーを返すが、スプレッドシートには書き込まれない（writeErrorToSpreadsheetが無効化されているため）
    return { success: false, error: lastError?.message || "実行失敗" };
  }

  /**
   * エラーがタブクローズエラーかどうかを判定
   * @param {Error} error - エラーオブジェクト
   * @returns {boolean} - タブクローズエラーの場合はtrue
   */
  isTabClosedError(error) {
    if (!error || !error.message) return false;

    const tabClosedPatterns = [
      /No tab with id:/,
      /tab has been closed/,
      /has been closed and is no longer available/,
      /Tab .* validation failed/,
    ];

    return tabClosedPatterns.some((pattern) => pattern.test(error.message));
  }

  /**
   * エラーがリカバリ不可能かどうかを判定
   * @param {Error} error - エラーオブジェクト
   * @returns {boolean} - リカバリ不可能な場合はtrue
   */
  isNonRecoverableError(error) {
    if (!error || !error.message) return false;

    const nonRecoverablePatterns = [
      /window has been closed/,
      /could not establish connection/i,
      /receiving end does not exist/i,
    ];

    return nonRecoverablePatterns.some((pattern) =>
      pattern.test(error.message),
    );
  }

  /**
   * クローズされたタブを復旧する
   * @param {Error} error - タブクローズエラー
   * @returns {Promise<{success: boolean, error?: string, newTabId?: number}>}
   */
  async recoverClosedTab(error) {
    try {
      ExecuteLogger.info(`🔄 [WindowLifecycleManager] タブ復旧処理開始`);

      // エラーメッセージからタブIDを抽出
      const tabIdMatch = error.message.match(/Tab (\d+)/);
      if (!tabIdMatch) {
        return { success: false, error: "タブIDを特定できませんでした" };
      }

      const closedTabId = parseInt(tabIdMatch[1]);
      ExecuteLogger.info(
        `📋 [WindowLifecycleManager] クローズされたタブID: ${closedTabId}`,
      );

      // 新しいタブを作成（適切なAIサービスURLで）
      const newTab = await this.createNewAITab();
      if (!newTab) {
        return { success: false, error: "新しいタブの作成に失敗しました" };
      }

      ExecuteLogger.info(
        `✨ [WindowLifecycleManager] 新しいタブを作成: ${newTab.id}`,
      );

      // 復旧成功
      return { success: true, newTabId: newTab.id };
    } catch (recoveryError) {
      ExecuteLogger.error(
        `❌ [WindowLifecycleManager] タブ復旧中にエラー: ${recoveryError.message}`,
      );
      return { success: false, error: recoveryError.message };
    }
  }

  /**
   * 新しいAIサービスタブを作成する
   * @returns {Promise<chrome.tabs.Tab|null>}
   */
  async createNewAITab() {
    try {
      // デフォルトのAIサービスURL（ChatGPT）
      const aiServiceUrls = [
        "https://chatgpt.com/",
        "https://claude.ai/",
        "https://gemini.google.com/",
        "https://www.genspark.ai/",
      ];

      // 最初のURLで新しいタブを作成
      const newTab = await chrome.tabs.create({
        url: aiServiceUrls[0],
        active: false,
      });

      // タブが完全に読み込まれるまで待機
      await new Promise((resolve) => setTimeout(resolve, 3000));

      return newTab;
    } catch (error) {
      ExecuteLogger.error(
        `❌ [WindowLifecycleManager] 新しいタブ作成中にエラー: ${error.message}`,
      );
      return null;
    }
  }

  /**
   * 全ウィンドウクリーンアップ
   */
  async cleanupAllWindows() {
    ExecuteLogger.info(
      "🧹 [WindowLifecycleManager] 全ウィンドウクリーンアップ開始",
    );

    for (const [aiType, windowInfo] of this.registeredWindows) {
      try {
        if (windowInfo?.windowId) {
          await StepIntegratedWindowService.closeWindow(windowInfo.windowId);
          ExecuteLogger.info(
            `✅ [WindowLifecycleManager] ウィンドウクローズ: ${aiType}`,
          );
        }
      } catch (error) {
        ExecuteLogger.error(
          `❌ [WindowLifecycleManager] ウィンドウクローズエラー: ${aiType}`,
          error,
        );
      }
    }

    this.registeredWindows.clear();
    ExecuteLogger.info(
      "🏁 [WindowLifecycleManager] 全ウィンドウクリーンアップ完了",
    );
  }
}

// ========================================
// SimpleSheetsClient: step4内で完結するSheets APIクライアント（step5から複製）
// ========================================
// Step5で定義されている場合はスキップ
if (!window.SimpleSheetsClient) {
  class SimpleSheetsClient {
    constructor() {
      this.baseUrl = "https://sheets.googleapis.com/v4/spreadsheets";
      this.sheetNameCache = new Map(); // GID -> シート名のキャッシュ
      ExecuteLogger.info("📊 SimpleSheetsClient初期化（step4内部版）");
    }

    /**
     * 認証トークン取得
     */
    async getAuthToken() {
      return new Promise((resolve, reject) => {
        if (typeof chrome === "undefined" || !chrome.identity) {
          reject(new Error("Chrome Identity APIが利用できません"));
          return;
        }

        chrome.identity.getAuthToken({ interactive: false }, (token) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve(token);
          }
        });
      });
    }

    /**
     * スプレッドシートから値を取得（レート制限対策付き）
     */
    async getValues(spreadsheetId, range, retryCount = 0) {
      const maxRetries = 10;
      // 待機時間（ミリ秒）: 10秒→30秒→1分→3分→5分→10分→15分→30分→45分→60分
      const retryDelays = [
        10000, 30000, 60000, 180000, 300000, 600000, 900000, 1800000, 2700000,
        3600000,
      ];

      // レート制限対策：最小間隔を設ける
      if (this.lastApiCallTime) {
        const elapsed = Date.now() - this.lastApiCallTime;
        if (elapsed < 1500) {
          // 1.5秒の最小間隔
          await new Promise((resolve) => setTimeout(resolve, 1500 - elapsed));
        }
      }

      try {
        const token = await this.getAuthToken();
        const url = `${this.baseUrl}/${spreadsheetId}/values/${range}`;

        const response = await fetch(url, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        this.lastApiCallTime = Date.now();

        if (!response.ok) {
          const errorText = await response.text();

          // レート制限エラーの場合、exponential backoffでリトライ
          if (response.status === 429) {
            ExecuteLogger.warn(
              `⚠️ API レート制限エラー検出。3秒後にリトライします: ${range}`,
            );
            await new Promise((resolve) => setTimeout(resolve, 3000));
            return await this.getValues(spreadsheetId, range, retryCount); // リトライ
          }

          // サーバーエラー（500/502/503）の場合、リトライ
          if (
            (response.status === 500 ||
              response.status === 502 ||
              response.status === 503) &&
            retryCount < maxRetries
          ) {
            const waitTime =
              retryDelays[Math.min(retryCount, retryDelays.length - 1)];
            ExecuteLogger.warn(
              `⚠️ API サーバーエラー検出 (${response.status})。${waitTime / 1000}秒後にリトライします (${retryCount + 1}/${maxRetries}): ${range}`,
            );
            await new Promise((resolve) => setTimeout(resolve, waitTime));
            return await this.getValues(spreadsheetId, range, retryCount + 1); // リトライ
          }

          throw new Error(
            `データ取得失敗: HTTP ${response.status} - ${errorText || response.statusText}`,
          );
        }

        const data = await response.json();
        return data.values || [];
      } catch (error) {
        ExecuteLogger.error(`❌ getValues失敗: ${range}`, error);
        throw error;
      }
    }

    /**
     * スプレッドシートから範囲データを取得（readRangeエイリアス）
     * 書き込み検証機能との互換性のため
     */
    async readRange(spreadsheetId, range) {
      ExecuteLogger.debug(`📖 [SimpleSheetsClient] readRange: ${range}`);
      return await this.getValues(spreadsheetId, range);
    }

    /**
     * スプレッドシートから単一セルの値を取得（readValueエイリアス）
     * clearMarker機能との互換性のため
     */
    async readValue(spreadsheetId, range) {
      const values = await this.getValues(spreadsheetId, range);
      return values?.[0]?.[0];
    }

    /**
     * スプレッドシートに値を書き込み（単一セル）
     */
    async updateValue(spreadsheetId, range, value, retryCount = 0) {
      const maxRetries = 10;
      // 待機時間（ミリ秒）: 10秒→30秒→1分→3分→5分→10分→15分→30分→45分→60分
      const retryDelays = [
        10000, 30000, 60000, 180000, 300000, 600000, 900000, 1800000, 2700000,
        3600000,
      ];

      // レート制限対策：最小間隔を設ける
      if (this.lastApiCallTime) {
        const elapsed = Date.now() - this.lastApiCallTime;
        if (elapsed < 1500) {
          // 1.5秒の最小間隔
          await new Promise((resolve) => setTimeout(resolve, 1500 - elapsed));
        }
      }

      try {
        const token = await this.getAuthToken();
        const url = `${this.baseUrl}/${spreadsheetId}/values/${range}?valueInputOption=USER_ENTERED`;

        const response = await fetch(url, {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            values: [[value]],
          }),
        });

        this.lastApiCallTime = Date.now();

        if (!response.ok) {
          const errorText = await response.text();

          // レート制限エラーの場合、exponential backoffでリトライ
          if (response.status === 429) {
            ExecuteLogger.warn(
              `⚠️ API レート制限エラー検出。3秒後にリトライします: ${range}`,
            );
            await new Promise((resolve) => setTimeout(resolve, 3000));
            return await this.updateValue(
              spreadsheetId,
              range,
              value,
              retryCount,
            ); // リトライ
          }

          // サーバーエラー（500/502/503）の場合、リトライ
          if (
            (response.status === 500 ||
              response.status === 502 ||
              response.status === 503) &&
            retryCount < maxRetries
          ) {
            const waitTime =
              retryDelays[Math.min(retryCount, retryDelays.length - 1)];
            ExecuteLogger.warn(
              `⚠️ API サーバーエラー検出 (${response.status})。${waitTime / 1000}秒後にリトライします (${retryCount + 1}/${maxRetries}): ${range}`,
            );
            await new Promise((resolve) => setTimeout(resolve, waitTime));
            return await this.updateValue(
              spreadsheetId,
              range,
              value,
              retryCount + 1,
            ); // リトライ
          }

          throw new Error(
            `データ書き込み失敗: HTTP ${response.status} - ${errorText || response.statusText}`,
          );
        }

        const result = await response.json();

        // 実際に書き込まれたセル位置をログ出力
        const actualRange = result.updatedRange || range;
        ExecuteLogger.debug(
          `📝 [SimpleSheetsClient] 実際の書き込み先: ${actualRange} (${result.updatedCells || 1}セル)`,
        );

        return result;
      } catch (error) {
        ExecuteLogger.error(`❌ updateValue失敗: ${range}`, error);
        throw error;
      }
    }

    /**
     * スプレッドシートに値を書き込み（updateCellエイリアス）
     * WindowLifecycleManagerとの互換性のため
     */
    async updateCell(spreadsheetId, cellRef, value) {
      ExecuteLogger.debug(
        `📝 [SimpleSheetsClient] updateCell: ${cellRef} = ${value?.length || 0}文字`,
      );
      return await this.updateValue(spreadsheetId, cellRef, value);
    }
  }

  // Step4内でSimpleSheetsClientをグローバルに登録
  window.SimpleSheetsClient = SimpleSheetsClient;
}

// Step4内でグローバルインスタンスを作成（step5の依存を解消）
if (!window.simpleSheetsClient) {
  if (typeof window.SimpleSheetsClient === "function") {
    window.simpleSheetsClient = new window.SimpleSheetsClient();
    ExecuteLogger.info("✅ window.simpleSheetsClient を step4内で初期化");
  }
}

// updateCellメソッドの存在確認と修正
if (window.simpleSheetsClient && !window.simpleSheetsClient.updateCell) {
  window.simpleSheetsClient.updateCell = async function (
    spreadsheetId,
    cellRef,
    value,
  ) {
    if (this.updateValue) {
      return await this.updateValue(spreadsheetId, cellRef, value);
    } else {
      throw new Error("updateValueメソッドも存在しません");
    }
  };
}

// readRangeメソッドの存在確認と修正
if (window.simpleSheetsClient && !window.simpleSheetsClient.readRange) {
  console.warn("⚠️ [INIT-FIX] readRangeメソッドが存在しないため追加します");
  window.simpleSheetsClient.readRange = async function (spreadsheetId, range) {
    console.log(`📖 [SimpleSheetsClient-Fix] readRange: ${range}`);
    if (this.getValues) {
      return await this.getValues(spreadsheetId, range);
    } else {
      throw new Error("getValuesメソッドも存在しません");
    }
  };
  console.log("✅ [INIT-FIX] readRangeメソッドを動的に追加しました");
}

// ========================================
// TaskStatusManager: 作業中マーカーによる排他制御
// ========================================
class TaskStatusManager {
  constructor() {
    this.checkInterval = 10000; // 10秒
  }

  /**
   * タスクの機能に応じた最大待機時間を取得
   * @param {Object} task - タスクオブジェクト
   * @returns {number} タイムアウト時間（ミリ秒）
   */
  getMaxWaitTimeForTask(task) {
    try {
      // タスクの機能名を取得
      const functionName = task.function || task.featureName || "";

      // Deep Research/エージェント機能の判定（既存AIコードと同じロジック）
      const isDeepResearchMode =
        functionName === "Deep Research" ||
        functionName.includes("エージェント") ||
        functionName.includes("Research") ||
        functionName.includes("DeepResearch") ||
        functionName.includes("研究");

      // 既存のAI処理設定に合わせる
      const timeout = isDeepResearchMode ? 2400000 : 600000; // 40分 : 10分

      ExecuteLogger.debug(
        `⏰ タスクタイムアウト判定: ${functionName || "(機能名なし)"} → ${timeout / 60000}分`,
        {
          taskId: task.id || task.taskId,
          functionName: functionName,
          isDeepResearchMode: isDeepResearchMode,
          timeoutMinutes: timeout / 60000,
        },
      );

      return timeout;
    } catch (error) {
      ExecuteLogger.warn(
        "⚠️ タスクタイムアウト判定エラー、デフォルト10分を使用:",
        error,
      );
      return 600000; // デフォルト10分
    }
  }

  /**
   * セルの現在値を取得
   */
  async getCellValue(task) {
    try {
      // answerCellから範囲を取得、または列と行から構築
      const range = task.answerCell || `${task.column}${task.row}`;
      const spreadsheetId =
        task.spreadsheetId ||
        task.spreadsheetData?.spreadsheetId ||
        window.globalState?.spreadsheetId;

      if (!spreadsheetId) {
        ExecuteLogger.warn("⚠️ スプレッドシートIDが取得できません");
        return "";
      }

      if (!window.simpleSheetsClient) {
        ExecuteLogger.error("❌ simpleSheetsClientが利用できません");
        return "";
      }

      // シート名を追加
      const sheetName =
        window.globalState?.sheetName ||
        `シート${window.globalState?.gid || "0"}`;
      const fullRange = `'${sheetName}'!${range}`;

      const values = await window.simpleSheetsClient.getValues(
        spreadsheetId,
        fullRange,
      );
      return values && values[0] && values[0][0] ? values[0][0] : "";
    } catch (error) {
      ExecuteLogger.error(
        `❌ セル値取得エラー: ${task.column}${task.row}`,
        error,
      );
      return "";
    }
  }

  /**
   * 作業中マーカーを書き込み
   */
  async markTaskInProgress(task) {
    try {
      // 日本時間（JST）でタイムスタンプを生成
      const now = new Date();
      const jstDate = new Date(now.getTime() + 9 * 60 * 60 * 1000);
      const jstString =
        jstDate.toISOString().replace("T", " ").replace("Z", "") + " JST";
      const marker = `作業中\n${jstString}`;
      // answerCellから範囲を取得、または列と行から構築
      const range = task.answerCell || `${task.column}${task.row}`;
      const spreadsheetId =
        task.spreadsheetId ||
        task.spreadsheetData?.spreadsheetId ||
        window.globalState?.spreadsheetId;

      if (!spreadsheetId) {
        ExecuteLogger.error("❌ スプレッドシートIDが取得できません");
        return false;
      }

      // 書き込み前に現在値を確認（競合状態回避）
      const currentValue = await this.getCellValue(task);
      if (currentValue && currentValue.startsWith("作業中")) {
        ExecuteLogger.warn(`⚠️ すでに作業中: ${range}`);
        return false;
      }

      // シート名を追加
      const sheetName =
        window.globalState?.sheetName ||
        `シート${window.globalState?.gid || "0"}`;
      const fullRange = `'${sheetName}'!${range}`;

      await window.simpleSheetsClient.updateValue(
        spreadsheetId,
        fullRange,
        marker,
      );
      ExecuteLogger.info(`✍️ 作業中マーカー設定: ${fullRange}`);
      return true;
    } catch (error) {
      ExecuteLogger.error(
        `❌ マーカー設定エラー: ${task.column}${task.row}`,
        error,
      );
      return false;
    }
  }

  /**
   * 作業中マーカーを削除（初回実行時のみ使用）
   */
  async clearWorkingMarker(task) {
    try {
      const range = task.answerCell || `${task.column}${task.row}`;
      const spreadsheetId =
        task.spreadsheetId ||
        task.spreadsheetData?.spreadsheetId ||
        window.globalState?.spreadsheetId;

      if (!spreadsheetId) {
        ExecuteLogger.error("❌ スプレッドシートIDが取得できません");
        return false;
      }

      // 現在値を確認
      const currentValue = await this.getCellValue(task);
      if (!currentValue || !currentValue.startsWith("作業中")) {
        ExecuteLogger.warn(`⚠️ 作業中マーカーがありません: ${range}`);
        return false;
      }

      // シート名を追加
      const sheetName =
        window.globalState?.sheetName ||
        `シート${window.globalState?.gid || "0"}`;
      const fullRange = `'${sheetName}'!${range}`;

      // 作業中マーカーを削除（空文字に更新）
      await window.simpleSheetsClient.updateValue(spreadsheetId, fullRange, "");

      ExecuteLogger.info(`🧹 初回実行: 作業中マーカー削除 ${fullRange}`, {
        削除理由: "初回実行時の自動クリア",
        元のマーカー: currentValue.substring(0, 50) + "...",
        タスク: `${task.column}${task.row} (グループ${task.groupNumber})`,
      });

      return true;
    } catch (error) {
      ExecuteLogger.error(
        `❌ 作業中マーカー削除エラー: ${task.column}${task.row}`,
        error,
      );
      return false;
    }
  }

  /**
   * 利用可能なタスクを取得（最大limit個）
   */
  async getAvailableTasks(taskList, limit = 3) {
    const available = [];
    const skippedTasks = []; // スキップしたタスクを記録

    for (const task of taskList) {
      if (available.length >= limit) break;

      const cellValue = await this.getCellValue(task);
      const taskIdentifier = `${task.column}${task.row} (グループ${task.groupNumber})`;

      // 【根本原因特定ログ】空セル判定の詳細検証
      if (!cellValue || cellValue === "") {
        // 直近書き込み記録をチェック
        const recentWrites = window.globalState?.recentWrites || [];
        const matchingWrite = recentWrites.find(
          (write) =>
            write.cellRef === `${task.column}${task.row}` &&
            write.groupNumber === task.groupNumber,
        );

        ExecuteLogger.info(`✅ 利用可能: ${taskIdentifier} - 理由: セルが空`, {
          cellValue: cellValue,
          cellValueType: typeof cellValue,
          cellValueLength: cellValue?.length || 0,
          taskDetails: {
            column: task.column,
            row: task.row,
            groupNumber: task.groupNumber,
            answerCell: task.answerCell,
          },
          // 直近書き込み検証
          hasMatchingWrite: !!matchingWrite,
          matchingWriteInfo: matchingWrite
            ? {
                taskId: matchingWrite.taskId,
                writeTimestamp: new Date(matchingWrite.timestamp).toISOString(),
                wasVerified: matchingWrite.isVerified,
                expectedTextLength: matchingWrite.textLength,
                timeSinceWrite: `${(Date.now() - matchingWrite.timestamp) / 1000}秒前`,
              }
            : null,
          // 重複判定の警告
          possibleDuplicate: matchingWrite && matchingWrite.isVerified,
          判定タイムスタンプ: new Date().toISOString(),
        });

        // 重複可能性の警告
        if (matchingWrite && matchingWrite.isVerified) {
          ExecuteLogger.warn(`🚨 [DUPLICATE-RISK] 重複タスク生成の可能性:`, {
            cellRef: `${task.column}${task.row}`,
            現在の判定: "セルが空 → タスク生成",
            直近の書き込み: `${matchingWrite.textLength}文字 (${(Date.now() - matchingWrite.timestamp) / 1000}秒前)`,
            書き込み検証結果: matchingWrite.isVerified ? "成功" : "失敗",
            重複リスク: "HIGH",
          });
        }

        available.push(task);
      } else if (cellValue.startsWith("作業中")) {
        const markerMatch = cellValue.match(/作業中\n(.+)/);
        const markerTime = markerMatch ? markerMatch[1] : "不明";

        // 【修正】作業中マーカーの自動削除を無効化 - タスク重複実行の根本原因を修正
        // 以前のロジック：作業中マーカーを自動削除していたため、処理中のタスクが再実行されていた
        // 新しいロジック：タイムアウト判定のみで利用可能性を判断
        ExecuteLogger.debug(
          `🔍 [getAvailableTasks] 作業中タスク発見: ${taskIdentifier}`,
          {
            マーカー時刻: markerTime,
            理由: "タイムアウト判定で処理を決定",
          },
        );

        if (this.isTaskTimedOut(cellValue, task)) {
          available.push(task);
          const maxWaitTime = this.getMaxWaitTimeForTask(task);
          ExecuteLogger.warn(`⏰ タイムアウトタスク: ${taskIdentifier}`, {
            マーカー時刻: markerTime,
            タイムアウト時間: `${maxWaitTime / 60000}分`,
            理由: "作業中マーカーがタイムアウト",
          });
        } else {
          // タイムアウトしていない場合の詳細情報
          try {
            const now = new Date();
            const markerDate = new Date(markerTime);
            const elapsedMinutes = Math.round((now - markerDate) / 60000);
            const maxWaitMinutes = this.getMaxWaitTimeForTask(task) / 60000;

            skippedTasks.push({
              task: taskIdentifier,
              reason: "作業中（タイムアウト前）",
              markerTime: markerTime,
              elapsed: `${elapsedMinutes}分経過`,
              maxWait: `${maxWaitMinutes}分`,
              remaining: `残り${maxWaitMinutes - elapsedMinutes}分`,
            });

            ExecuteLogger.info(`⏳ スキップ（作業中）: ${taskIdentifier}`, {
              マーカー時刻: markerTime,
              経過時間: `${elapsedMinutes}分`,
              タイムアウトまで: `残り${maxWaitMinutes - elapsedMinutes}分`,
              理由: "他のプロセスが作業中",
            });
          } catch (e) {
            ExecuteLogger.error(`❌ 時刻解析エラー: ${taskIdentifier}`, e);
          }
        }
      } else {
        // すでに結果が書かれている場合
        const preview = cellValue.substring(0, 50);
        skippedTasks.push({
          task: taskIdentifier,
          reason: "完了済み",
          value: preview + (cellValue.length > 50 ? "..." : ""),
        });

        ExecuteLogger.info(`✓ スキップ（完了済み）: ${taskIdentifier}`, {
          セル値: preview + "...",
          理由: "既に回答が記入済み",
        });
      }
    }

    // サマリーログ
    ExecuteLogger.info(`📊 タスク取得結果:`, {
      利用可能: `${available.length}個`,
      スキップ: `${skippedTasks.length}個`,
      スキップ詳細: skippedTasks,
    });

    return available;
  }

  /**
   * 作業中タスクを取得
   */
  async getInProgressTasks(taskList) {
    const inProgress = [];

    for (const task of taskList) {
      const cellValue = await this.getCellValue(task);
      if (cellValue && cellValue.startsWith("作業中")) {
        inProgress.push({
          ...task,
          markerText: cellValue,
        });
      }
    }

    ExecuteLogger.info(`⏳ 作業中タスク: ${inProgress.length}個`);
    return inProgress;
  }

  /**
   * タイムアウトチェック（タスク情報を考慮）
   * @param {string} markerText - 作業中マーカーテキスト
   * @param {Object} task - タスクオブジェクト
   * @returns {boolean} タイムアウトしているかどうか
   */
  isTaskTimedOut(markerText, task) {
    try {
      const match = markerText.match(/作業中\n(.+)/);
      if (!match) {
        ExecuteLogger.warn("⚠️ 作業中マーカーの形式が不正", {
          markerText: markerText,
          task: `${task.column}${task.row}`,
        });
        return false;
      }

      const timeString = match[1];
      const startTime = new Date(timeString);
      const now = new Date();
      const elapsed = now - startTime.getTime();

      // タスクに応じた最大待機時間を取得
      const maxWaitTime = this.getMaxWaitTimeForTask(task);
      const isTimeout = elapsed > maxWaitTime;

      const elapsedMinutes = Math.floor(elapsed / 60000);
      const maxMinutes = Math.floor(maxWaitTime / 60000);

      ExecuteLogger.debug("タイムアウト判定", {
        タスク: `${task.column}${task.row} (グループ${task.groupNumber})`,
        マーカー時刻: timeString,
        現在時刻: now.toISOString(),
        経過時間: `${elapsedMinutes}分`,
        最大待機時間: `${maxMinutes}分`,
        タイムアウト: isTimeout ? "はい" : "いいえ",
        タスク機能: task.function || "(なし)",
      });

      if (isTimeout) {
        ExecuteLogger.info(
          `⏰ タイムアウト検出: ${task.column}${task.row} - ` +
            `経過時間: ${elapsedMinutes}分 > 最大待機時間: ${maxMinutes}分`,
        );
      }

      return isTimeout;
    } catch (e) {
      ExecuteLogger.error("❌ タイムアウト判定エラー:", {
        エラー: e.message,
        マーカーテキスト: markerText,
        タスク: `${task.column}${task.row}`,
      });
      return true; // 日時解析失敗時はタイムアウト扱い
    }
  }

  /**
   * マーカーをクリア
   */
  async clearMarker(task) {
    try {
      // answerCellから範囲を取得、または列と行から構築
      const range = task.answerCell || `${task.column}${task.row}`;
      const spreadsheetId =
        task.spreadsheetId ||
        task.spreadsheetData?.spreadsheetId ||
        window.globalState?.spreadsheetId;

      if (!spreadsheetId) {
        ExecuteLogger.error("❌ スプレッドシートIDが取得できません");
        return;
      }

      // シート名を追加
      const sheetName =
        window.globalState?.sheetName ||
        `シート${window.globalState?.gid || "0"}`;
      const fullRange = `'${sheetName}'!${range}`;

      // 🔍 【安全チェック追加】値を確認してから削除
      const currentValue = await window.simpleSheetsClient.readValue(
        spreadsheetId,
        fullRange,
      );

      // 作業中マーカーのみ削除（それ以外は保護）
      if (!currentValue) {
        ExecuteLogger.info(
          `🔍 [SAFE-CLEAR] ${fullRange}: 空またはnull - スキップ`,
        );
        return;
      }

      if (typeof currentValue !== "string") {
        ExecuteLogger.warn(
          `⚠️ [SAFE-CLEAR] ${fullRange}: 文字列以外の値を検出 - タイプ: ${typeof currentValue}`,
          {
            値: safeStringify(currentValue),
            範囲: fullRange,
          },
        );
        return;
      }

      if (
        typeof currentValue !== "string" ||
        !currentValue.startsWith("作業中")
      ) {
        // ログを削除し、単純にreturnのみ
        return;
      }

      // 作業中マーカーのみクリア
      await window.simpleSheetsClient.updateValue(spreadsheetId, fullRange, "");
      ExecuteLogger.info(
        `🧹 [SAFE-CLEAR] 作業中マーカーをクリア: ${fullRange}`,
        {
          削除された値:
            typeof currentValue === "string"
              ? currentValue.substring(0, 100)
              : safeStringify(currentValue).substring(0, 100),
        },
      );
    } catch (error) {
      ExecuteLogger.error(
        `❌ マーカークリアエラー: ${task.column}${task.row}`,
        error,
      );
    }
  }

  /**
   * 【新規追加】スプレッドシート書き込み後にグループ完了状態をチェック
   * @param {number} groupNumber - チェック対象のグループ番号
   * @param {Array} allTasks - 全タスクリスト
   */
  async checkGroupCompletionAfterWrite(groupNumber, allTasks) {
    try {
      // 同グループのタスクをフィルタリング
      const groupTasks = allTasks.filter(
        (task) => task.groupNumber === groupNumber,
      );

      if (groupTasks.length === 0) {
        ExecuteLogger.warn(`⚠️ グループ${groupNumber}のタスクが見つかりません`);
        return;
      }

      // 作業中のタスクをカウント
      let inProgressCount = 0;
      let completedCount = 0;

      for (const task of groupTasks) {
        const cellValue = await this.getCellValue(task);
        if (cellValue && cellValue.startsWith("作業中")) {
          inProgressCount++;
        } else if (cellValue) {
          completedCount++;
        }
      }

      ExecuteLogger.info(`📊 グループ${groupNumber}の状態:`, {
        総タスク数: groupTasks.length,
        作業中: inProgressCount,
        完了済み: completedCount,
        未処理: groupTasks.length - inProgressCount - completedCount,
      });

      // グループが完了した場合、イベントを発火
      if (inProgressCount === 0 && completedCount === groupTasks.length) {
        ExecuteLogger.info(`✅ グループ${groupNumber}が完了しました`);
        this.notifyGroupComplete(groupNumber);
      }
    } catch (error) {
      ExecuteLogger.error(`❌ グループ完了チェックエラー:`, error);
    }
  }

  /**
   * グループ完了イベントを通知
   * @param {number} groupNumber - 完了したグループ番号
   */
  notifyGroupComplete(groupNumber) {
    // グループ完了イベントを発火
    if (
      window.groupCompletionCallbacks &&
      window.groupCompletionCallbacks[groupNumber]
    ) {
      const callbacks = window.groupCompletionCallbacks[groupNumber];
      for (const callback of callbacks) {
        callback(groupNumber);
      }
      delete window.groupCompletionCallbacks[groupNumber];
    }

    // グローバル状態を更新
    if (window.globalState) {
      window.globalState.lastCompletedGroup = groupNumber;
    }
  }

  /**
   * 特定グループの完了を待機（イベントドリブン）
   * @param {number} groupNumber - 待機対象のグループ番号
   * @returns {Promise<void>}
   */
  async waitForGroupCompletionEvent(groupNumber) {
    return new Promise((resolve) => {
      // コールバックを登録
      if (!window.groupCompletionCallbacks) {
        window.groupCompletionCallbacks = {};
      }
      if (!window.groupCompletionCallbacks[groupNumber]) {
        window.groupCompletionCallbacks[groupNumber] = [];
      }

      window.groupCompletionCallbacks[groupNumber].push((completedGroup) => {
        ExecuteLogger.info(`📢 グループ${completedGroup}完了イベントを受信`);
        resolve();
      });

      // 既に完了している場合は即座に解決
      if (window.globalState?.lastCompletedGroup >= groupNumber) {
        resolve();
      }
    });
  }
}

// グローバルインスタンス作成
// WindowController は step0-ui-controller.js で初期化済み
// window.windowController = new WindowController();

// ========================================
// Step 4-1: createTaskListFromGroup Helper Function - グループ変換ユーティリティ
// ========================================

/**
 * グループオブジェクトをタスク配列に変換する
 * step4内部遷移時にグループオブジェクトが渡される場合に使用
 * Groups 3以降のデータ形式統一のためのヘルパー関数
 * @param {Object} groupData - グループオブジェクト
 * @returns {Array} タスク配列
 */
async function createTaskListFromGroup(groupData) {
  ExecuteLogger.info(
    "🔧 [Step 4-1] createTaskListFromGroup: グループデータ変換開始:",
    {
      groupType: typeof groupData,
      groupKeys: groupData ? Object.keys(groupData) : null,
      hasColumns: !!(groupData && groupData.columns),
      hasTaskGroup: !!(groupData && groupData.taskGroup),
    },
  );

  try {
    // Step 4-1-1: グループデータの構造を判定
    let taskGroup = null;
    let spreadsheetData = null;
    let specialRows = null;
    let dataStartRow = null;
    let options = {};

    // Step 4-1-2: step6からの遷移データの場合
    if (groupData.taskGroup) {
      taskGroup = groupData.taskGroup;
      spreadsheetData = groupData.spreadsheetData || [];
      specialRows = groupData.specialRows || {};
      dataStartRow =
        groupData.dataStartRow || window.globalState?.specialRows?.dataStartRow;
      options = groupData.options || {};

      ExecuteLogger.info("✅ [Step 4-1-2] Step6遷移データ形式を検出:", {
        groupNumber: taskGroup.groupNumber,
        groupType: taskGroup.groupType,
        columnKeys: taskGroup.columns ? Object.keys(taskGroup.columns) : null,
      });
    }
    // Step 4-1-3: 直接グループオブジェクトの場合
    else if (groupData.columns) {
      taskGroup = groupData;

      // 現在のコンテキストからスプレッドシートデータを取得
      spreadsheetData = window.globalState?.currentSpreadsheetData || [];
      specialRows = window.globalState?.specialRows || {};
      dataStartRow = window.globalState?.specialRows?.dataStartRow;

      ExecuteLogger.info(
        `[step3-tasklist.js] [Step 4-1-3] 📝 globalState.sheetName取得: "${window.globalState?.sheetName}"`,
      );

      options = {
        spreadsheetUrl: window.globalState?.spreadsheetUrl || "",
        spreadsheetId: window.globalState?.spreadsheetId || "",
        gid: window.globalState?.gid || "",
        sheetName: window.globalState?.sheetName || "",
      };

      ExecuteLogger.info(
        `[step3-tasklist.js] [Step 4-1-3] ✅ options.sheetName設定: "${options.sheetName}"`,
      );

      ExecuteLogger.info(
        "✅ [Step 4-1-3] 直接グループオブジェクト形式を検出:",
        {
          groupNumber: taskGroup.groupNumber,
          groupType: taskGroup.groupType,
          hasGlobalState: !!window.globalState,
        },
      );
    } else {
      throw new Error("未対応のグループデータ形式です");
    }

    // Step 4-1-4: generateTaskListを使用してタスク配列を生成
    const taskList = await generateTaskList(
      taskGroup,
      spreadsheetData,
      specialRows,
      dataStartRow,
      options,
    );

    ExecuteLogger.info("✅ [Step 4-1-4] タスク配列変換完了:", {
      inputGroupNumber: taskGroup.groupNumber,
      outputTaskCount: taskList.length,
      taskTypes: taskList.map((task) => task.aiType).slice(0, 5), // 最初の5個のタスクタイプを表示
    });

    return taskList;
  } catch (error) {
    ExecuteLogger.error("❌ [Step 4-1] createTaskListFromGroup変換エラー:", {
      error: error.message,
      stack: error.stack,
      groupData: groupData,
    });
    throw new Error(`グループオブジェクト変換失敗: ${error.message}`);
  }
}

// ========================================
// 削除: 重複したSimpleSheetsClientクラス定義
// 正しい定義は上記の3533行目で定義済み（updateCellメソッド付き）
// この重複定義により WindowLifecycleManager がメソッド不存在エラーを起こしていた
// ======================================== // SimpleSheetsClient クラスの終了

// ========================================
// 削除: createWindowForBatch関数 (unused/StreamProcessorV2からの不要なコード)
// この関数は実際には使われていないため削除
// 実際のウィンドウ作成は WindowController.openWindows が担当
// ========================================

// ========================================
// executeStep3 Function - Moved from step5-execute.js
// ========================================
class DynamicTaskSearch {
  constructor() {
    this.cache = {
      spreadsheetData: null,
      lastFetchTime: null,
      cacheTimeout: 0, // 🔍 【修正】キャッシュを完全無効化（常に最新データ取得）
    };

    this.processingTasks = new Set(); // 処理中タスクのID管理
    this.completedTasks = new Set(); // 完了タスクのID管理

    // 【追加】currentGroup変更の監視
    this.initializeCurrentGroupListener();
  }

  /**
   * currentGroup変更監視リスナーの初期化
   * 【追加】統一管理システムとの連携
   */
  initializeCurrentGroupListener() {
    if (window.addCurrentGroupListener) {
      const listener = (changeEvent) => {
        log.warn(
          "[3-4] 🔄 [DynamicTaskSearch] currentGroup変更:",
          changeEvent.currentGroup?.groupNumber,
        );

        // グループ変更時にキャッシュをクリア
        this.cache.spreadsheetData = null;
        this.cache.lastFetchTime = null;

        // 新しいグループに関連しない処理中タスクをクリア
        if (
          changeEvent.currentGroup?.groupNumber !==
          changeEvent.previousGroup?.groupNumber
        ) {
          this.processingTasks.clear(); // 前のグループの処理中タスクをクリア
        }
      };

      window.addCurrentGroupListener(listener);
      this._currentGroupListener = listener; // クリーンアップ用に保存
    } else {
    }
  }

  /**
   * スプレッドシートから最新データを取得（キャッシュ付き + リトライ機能）
   * step3-loop.jsのreadFullSpreadsheetを参考に実装
   * 【修正】書き込み完了後の最新データ取得を確実にするためリトライ機能追加
   */
  async fetchLatestSpreadsheetData(forceRefresh = false) {
    const now = Date.now();

    // 🔍 【修正】キャッシュ完全無効化 - 常に最新データを取得
    if (
      !forceRefresh &&
      this.cache.spreadsheetData &&
      this.cache.lastFetchTime &&
      this.cache.cacheTimeout > 0 && // cacheTimeout=0なら常に新規取得
      now - this.cache.lastFetchTime < this.cache.cacheTimeout
    ) {
      return this.cache.spreadsheetData;
    }

    console.log(`🔍 [DYNAMIC-SEARCH] キャッシュ無効化により最新データ取得`);

    log.info("[3-4] 🔄 スプレッドシート最新データ取得中...");

    // 【追加】書き込み完了後の最新データ取得のためのリトライ機能
    let retryCount = 0;
    const maxRetries = 3;
    const retryDelay = 1000; // 1秒待機

    while (retryCount <= maxRetries) {
      try {
        // 依存関係チェック
        if (!window.fetchWithTokenRefresh) {
          throw new Error("fetchWithTokenRefresh が初期化されていません");
        }

        // グローバル状態から必要な情報を取得
        const spreadsheetId = window.globalState?.spreadsheetId;
        const authToken = window.globalState?.authToken;
        const gid = window.globalState?.gid;

        if (!spreadsheetId || !authToken) {
          throw new Error("認証情報またはスプレッドシートIDが見つかりません");
        }

        // 【追加】書き込み完了待機：初回以外は待機してから取得
        if (retryCount > 0) {
          await new Promise((resolve) => setTimeout(resolve, retryDelay));
        }

        // シート名を取得
        const sheetName = window.globalState.sheetName || `シート${gid || "0"}`;

        // 全体データ取得（A1:Z1000）- シート名を含める
        const range = `'${sheetName}'!A1:Z1000`;
        const apiUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`;

        const response = await window.fetchWithTokenRefresh(apiUrl, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${authToken}`,
            "Content-Type": "application/json",
          },
        });

        if (!response.ok) {
          throw new Error(
            `API応答エラー: ${response.status} ${response.statusText}`,
          );
        }

        const data = await response.json();
        const values = data.values || [];

        // 【追加】データ変更確認：前回と比較して変更があるかチェック
        const hasSignificantChange = this.validateDataFreshness(values);
        if (retryCount > 0 && !hasSignificantChange) {
          retryCount++;
          continue;
        }

        // キャッシュ更新
        this.cache.spreadsheetData = values;
        this.cache.lastFetchTime = now;

        log.info(
          `[3-4] ✅ データ取得成功: ${values.length}行 (試行: ${retryCount + 1})`,
        );
        return values;
      } catch (error) {
        retryCount++;
        if (retryCount > maxRetries) {
          log.error("[3-4] ❌ スプレッドシートデータ取得エラー:", error);
          throw error;
        }
        log.warn(
          `[3-4] ⚠️ データ取得失敗、リトライ中... (${retryCount}/${maxRetries}):`,
          error.message,
        );
      }
    }
  }

  /**
   * データの新しさを検証（書き込み完了の確認）
   * 【追加】完了タスクの結果がスプレッドシートに反映されているかチェック
   */
  validateDataFreshness(newData) {
    if (!this.cache.spreadsheetData || !newData) {
      return true; // 初回取得またはデータなしの場合は有効とみなす
    }

    // 簡単な変更検出：行数または内容の変化をチェック
    if (newData.length !== this.cache.spreadsheetData.length) {
      return true;
    }

    // 最近完了したタスクのセルをチェック
    for (const taskId of this.completedTasks) {
      // taskIdの形式: "U9" -> U列9行
      const match = taskId.match(/([A-Z]+)(\d+)/);
      if (match) {
        const [, column, row] = match;
        const rowIndex = parseInt(row) - 1;
        const colIndex = this.columnToIndex(column);

        if (newData[rowIndex] && newData[rowIndex][colIndex]) {
          const cellValue = newData[rowIndex][colIndex];
          if (cellValue && !cellValue.startsWith("作業中")) {
            return true;
          }
        }
      }
    }

    return false;
  }

  /**
   * 次の利用可能なタスクを1つ検索
   * @returns {Object|null} 次のタスク、または null
   */
  async findNextTask() {
    log.info("[3-4] 🔍 次のタスク検索開始");

    try {
      // 【修正】統一管理システムから現在のグループ番号を取得し、詳細情報を参照
      const currentGroupNumber = window.getCurrentGroup
        ? window.getCurrentGroup()?.groupNumber
        : window.globalState?.currentGroup?.groupNumber;

      if (!currentGroupNumber) {
        log.warn("[3-4] ⚠️ 現在のグループ番号が見つかりません");
        return null;
      }

      // 詳細なグループ情報をtaskGroupsから取得
      const currentGroup = window.globalState?.taskGroups?.find(
        (g) => g.groupNumber === currentGroupNumber,
      );

      if (!currentGroup) {
        log.warn("[3-4] ⚠️ 詳細なグループ情報が見つかりません", {
          currentGroupNumber,
          availableGroups: window.globalState?.taskGroups?.map(
            (g) => g.groupNumber,
          ),
        });
        return null;
      }

      // 最新のスプレッドシートデータを取得
      const spreadsheetData = await this.fetchLatestSpreadsheetData();

      // グループの範囲内でタスクを検索
      const availableTask = await this.searchTaskInGroup(
        spreadsheetData,
        currentGroup,
      );

      if (availableTask) {
        log.info("[3-4] ✅ 利用可能なタスク発見:", {
          taskId: availableTask.id,
          row: availableTask.row,
          column: availableTask.column,
          aiType: availableTask.aiType,
        });

        // 処理中としてマーク
        this.markTaskAsProcessing(availableTask);
        return availableTask;
      }

      // 【修正】タスクが見つからない場合の制御移譲シグナル実装
      log.info("[3-4] 📭 現在のグループ内に利用可能なタスクなし");

      // グループ完了状態を確認・記録
      const isGroupCompleted = await this.checkAndRecordGroupCompletion(
        currentGroup,
        spreadsheetData,
      );

      if (isGroupCompleted) {
        log.info(
          `[3-4] 🏁 グループ${currentGroup.groupNumber}完了 - step3メインループに制御移譲`,
        );

        // 【修正】統一移行協調システムを使用
        await this.initiateGroupTransition(currentGroup);

        // 【追加】グループ完了をglobalStateに記録（step3との協調用）
        if (window.globalState) {
          window.globalState.dynamicSearchStatus = {
            groupCompleted: true,
            completedGroupNumber: currentGroup.groupNumber,
            transferControlToStep3: true,
            timestamp: new Date().toISOString(),
          };
        }

        // 【追加】step3メインループに制御移譲イベントを送信
        this.notifyGroupCompletionToStep3(currentGroup);
      } else {
      }

      return null;
    } catch (error) {
      log.error("[3-4] ❌ タスク検索エラー:", error);
      return null;
    }
  }

  /**
   * グループ内でタスクを検索
   * step3-loop.jsのcreateTaskListロジックを個別タスク用に改良
   */
  async searchTaskInGroup(spreadsheetData, taskGroup) {
    const { columns, dataStartRow } = taskGroup;

    if (!columns || !dataStartRow) {
      log.error("[3-4] グループ情報が不完全");
      return null;
    }

    // プロンプト列を確認
    const promptColumns = columns.prompts || [];
    const answerColumns = this.getAnswerColumns(columns.answer, taskGroup);

    // 【無限ループ防止】カウンター追加
    let tasksChecked = 0;
    let completedTasksFound = 0;
    let availableTasksFound = 0;
    let skippedTasks = [];
    const maxTasksToCheck = 200;

    // グループの範囲を限定（最大70行までチェック）
    const groupMaxRows = 100;
    const endRow = Math.min(
      dataStartRow + groupMaxRows - 1,
      spreadsheetData.length,
    );

    // データ行を順番にチェック
    for (let rowIndex = dataStartRow - 1; rowIndex < endRow; rowIndex++) {
      const row = spreadsheetData[rowIndex];
      if (!row) continue;

      const rowNumber = rowIndex + 1; // 1-based行番号

      // 各プロンプト列をチェック
      for (const promptCol of promptColumns) {
        const colIndex = this.columnToIndex(promptCol);
        const promptValue = row[colIndex];

        // プロンプトが存在しない場合はスキップ
        if (!promptValue || !promptValue.trim()) continue;

        // 対応する回答列をチェック
        for (const answerCol of answerColumns) {
          const answerIndex = this.columnToIndex(answerCol.column);
          const answerValue = row[answerIndex] || "";

          // タスクIDを生成
          const taskId = `${answerCol.column}${rowNumber}`;

          tasksChecked++;

          // 【無限ループ防止】チェック数制限
          if (tasksChecked > maxTasksToCheck) {
            log.warn(
              `[3-4] ⚠️ タスクチェック制限に達しました (${maxTasksToCheck}個)`,
            );
            return null;
          }

          // 完了済みタスクをカウント（詳細ログなしで高速チェック）
          if (this.completedTasks.has(taskId)) {
            completedTasksFound++;
            continue; // スキップして次へ
          }

          // このタスクが処理可能かチェック
          const isAvailable = await this.isTaskAvailable(taskId, answerValue);

          if (isAvailable) {
            availableTasksFound++;
            // 【デバッグ追加】logCell生成確認
            const logCellValue = taskGroup.columns?.log
              ? `${taskGroup.columns.log}${rowNumber}`
              : null;

            log.warn("[3-4] 🔍 [DynamicSearch] タスク生成時のlogCell:", {
              taskId: taskId,
              logCellValue: logCellValue,
              logCellType: typeof logCellValue,
              taskGroupColumns: taskGroup.columns,
              logColumnExists: taskGroup.columns?.log ? true : false,
              logColumn: taskGroup.columns?.log || "未設定",
              rowNumber: rowNumber,
              finalTaskLogCell: logCellValue,
              logCellCalculation: `${taskGroup.columns?.log}${rowNumber}`,
            });

            // 利用可能なタスクを返す
            return {
              id: taskId,
              row: rowNumber,
              column: answerCol.column,
              prompt: promptValue.trim(),
              aiType: answerCol.aiType,
              spreadsheetId: window.globalState?.spreadsheetId,
              gid: window.globalState?.gid,
              sheetName: window.globalState?.sheetName,
              groupNumber: taskGroup.groupNumber,
              // 追加情報
              cellRef: `${answerCol.column}${rowNumber}`,
              answerCell: `${answerCol.column}${rowNumber}`,
              logCell: logCellValue,
            };
          }
        }
      }
    }

    // 【無限ループ防止】統計情報ログ
    log.info(`[3-4] 📊 タスク検索完了:`, {
      チェック済み: tasksChecked,
      完了済み発見: completedTasksFound,
      利用可能タスク: availableTasksFound + "個",
      グループ: taskGroup.groupNumber,
    });

    return null;
  }

  /**
   * 回答列の情報を取得
   * スプレッドシートのAI行から実際のAI種別を取得
   */
  getAnswerColumns(answerConfig, taskGroup) {
    const columns = [];

    if (typeof answerConfig === "object" && answerConfig !== null) {
      // 通常の場合：primaryカラムとそのAI種別を取得
      if (answerConfig.primary) {
        const column = answerConfig.primary;
        // 回答列に対応するプロンプト列を特定してからAI種別を取得
        const promptColumn = this.getPromptColumnForAnswer(column, taskGroup);
        const aiType = this.getAITypeForColumn(promptColumn);

        if (!aiType) {
          console.error(
            `❌ [DynamicSearch] 列${column}のAI種別が取得できません`,
            {
              column,
              taskGroup: taskGroup?.groupNumber,
              availableAIData: window.globalState?.aiRowData,
            },
          );
          throw new Error(
            `列${column}のAI種別が特定できません。スプレッドシートのAI行を確認してください。`,
          );
        }

        columns.push({ column: column, aiType: aiType });
      }
    } else if (typeof answerConfig === "string") {
      // 文字列形式（通常パターン）
      // 回答列に対応するプロンプト列を特定してからAI種別を取得
      const promptColumn = this.getPromptColumnForAnswer(
        answerConfig,
        taskGroup,
      );
      const aiType = this.getAITypeForColumn(promptColumn);

      if (!aiType) {
        console.error(
          `❌ [DynamicSearch] 列${answerConfig}のAI種別が取得できません`,
        );
        throw new Error(
          `列${answerConfig}のAI種別が特定できません。スプレッドシートのAI行を確認してください。`,
        );
      }

      columns.push({ column: answerConfig, aiType: aiType });
    }

    return columns;
  }

  /**
   * 回答列に対応するプロンプト列を取得
   */
  getPromptColumnForAnswer(answerColumn, taskGroup) {
    // タスクグループの列設定から対応関係を判定
    const { columns } = taskGroup;

    // プロンプト列が配列の場合、最後のプロンプト列を使用（通常パターン）
    if (columns?.prompts && Array.isArray(columns.prompts)) {
      const lastPromptColumn = columns.prompts[columns.prompts.length - 1];
      console.log(
        `✅ [DynamicSearch] 回答列${answerColumn}に対応するプロンプト列: ${lastPromptColumn}`,
      );
      return lastPromptColumn;
    }

    // フォールバック：回答列の1つ前の列をプロンプト列と仮定
    const answerIndex = this.columnToIndex(answerColumn);
    const promptIndex = answerIndex - 1;
    const promptColumn = this.indexToColumn(promptIndex);
    console.log(
      `⚠️ [DynamicSearch] プロンプト列を推定: ${promptColumn} (回答列${answerColumn}の1つ前)`,
    );
    return promptColumn;
  }

  /**
   * インデックスを列文字に変換
   */
  indexToColumn(index) {
    let column = "";
    while (index >= 0) {
      column = String.fromCharCode((index % 26) + 65) + column;
      index = Math.floor(index / 26) - 1;
    }
    return column;
  }

  /**
   * 列からAI種別を取得（スプレッドシートのAI行を参照）
   */
  getAITypeForColumn(column) {
    try {
      // globalStateから保存されたAI行データを取得
      const aiRowData = window.globalState?.aiRowData;
      if (!aiRowData) {
        console.error("❌ AI行データが取得できません");
        return null;
      }

      // 列インデックスを計算
      const colIndex = this.columnToIndex(column);

      // AI行データから該当列のAI種別を取得
      const aiValue = aiRowData[colIndex];

      if (!aiValue) {
        console.error(
          `❌ プロンプト列${column}(インデックス${colIndex})のAI種別が空です`,
        );
        return null;
      }

      // AI種別を正規化（小文字に変換）
      const normalizedAI = aiValue.toLowerCase().trim();

      // 有効なAI種別かチェック
      const validAITypes = ["claude", "chatgpt", "gemini", "genspark"];
      if (!validAITypes.includes(normalizedAI)) {
        console.error(`❌ 無効なAI種別: ${aiValue}`);
        return null;
      }

      console.log(`✅ [DynamicSearch] 列${column}のAI種別: ${normalizedAI}`);
      return normalizedAI;
    } catch (error) {
      console.error(`❌ AI種別取得エラー:`, error);
      return null;
    }
  }

  /**
   * 🔍 【追加】指定されたAIを優先するAIタイプ配列を生成
   * @param {Object} taskGroup - タスクグループ情報
   * @returns {Array<string>} AI タイプの配列（指定AI優先順）
   */
  getAiTypesOrderByPreference(taskGroup) {
    // Claudeをデフォルトで最優先に変更
    const defaultOrder = ["claude", "chatgpt", "gemini"];

    // タスクグループからAI指定があるかチェック
    let preferredAI = null;

    if (taskGroup?.aiPreference) {
      preferredAI = taskGroup.aiPreference.toLowerCase();
    } else if (taskGroup?.groupType?.includes("claude")) {
      preferredAI = "claude";
    } else if (taskGroup?.groupType?.includes("chatgpt")) {
      preferredAI = "chatgpt";
    } else if (taskGroup?.groupType?.includes("gemini")) {
      preferredAI = "gemini";
    }

    // 指定されたAIを最初に配置
    if (preferredAI && defaultOrder.includes(preferredAI)) {
      const reorderedTypes = [
        preferredAI,
        ...defaultOrder.filter((ai) => ai !== preferredAI),
      ];

      log.debug(`[3-4] 🔍 [AI-SELECTION] AI優先順序を調整: ${preferredAI}優先`);

      return reorderedTypes;
    }

    log.debug(`[3-4] 🔍 [AI-SELECTION] デフォルト順序を使用`);

    return defaultOrder;
  }

  /**
   * タスクが実行可能かチェック
   * 【修正】重複実行防止のための厳密なチェック
   */
  async isTaskAvailable(taskId, cellValue) {
    const startTimestamp = new Date().toISOString();
    const callId = `${taskId}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

    // 🔍 【詳細デバッグ】Group 2のタスク可用性詳細チェック
    // 競合状態検知のための内部記録のみ（ログ出力削除）

    // エラー相関トラッカーへのイベント記録
    if (window.errorCorrelationTracker) {
      window.errorCorrelationTracker.recordEvent(
        "task_availability_check_start",
        {
          taskId,
          callId,
          cellValue: cellValue ? "has_content" : "empty",
          completedTasksHas: this.completedTasks.has(taskId),
          processingTasksHas: this.processingTasks.has(taskId),
        },
      );
    }

    // 【修正1】すでに完了済みならスキップ（優先度：最高）
    if (this.completedTasks.has(taskId)) {
      return false;
    }

    // 【修正2】現在処理中ならスキップ（優先度：最高）
    if (this.processingTasks.has(taskId)) {
      log.debug(`[3-4] ❌ タスク実行拒否 - 処理中: ${taskId}`);
      return false;
    }

    // 【修正2.5】セル位置ベースの重複チェック（より確実な重複防止）
    const cellPosition = this.extractCellPosition(taskId);
    if (cellPosition) {
      for (const processingTaskId of this.processingTasks) {
        const processingCellPosition =
          this.extractCellPosition(processingTaskId);
        if (
          processingCellPosition &&
          processingCellPosition.column === cellPosition.column &&
          processingCellPosition.row === cellPosition.row
        ) {
          log.debug(`[3-4] ❌ セル位置重複によりタスク実行拒否: ${taskId}`);
          return false;
        }
      }
    }

    // 【修正3】最新データ再取得による二重確認
    // セル値が空の場合、スプレッドシートから最新値を再確認
    if (!cellValue || !cellValue.trim()) {
      log.debug(`[3-4] ⚠️ セル空検出 - 最新データ再確認: ${taskId}`);

      try {
        // 最新のスプレッドシートデータを強制取得
        const latestData = await this.fetchLatestSpreadsheetData(true); // forceRefresh=true

        // 該当セルの最新値を確認
        const match = taskId.match(/([A-Z]+)(\d+)/);
        if (match && latestData) {
          const [, column, row] = match;
          const rowIndex = parseInt(row) - 1;
          const colIndex = this.columnToIndex(column);

          if (latestData[rowIndex] && latestData[rowIndex][colIndex]) {
            const latestCellValue = latestData[rowIndex][colIndex];

            // 最新セル値の内部確認

            // 最新データに内容がある場合は実行拒否
            if (latestCellValue && latestCellValue.trim()) {
              if (latestCellValue.startsWith("作業中")) {
                return false;
              }

              // 実際の回答がある場合
              this.completedTasks.add(taskId); // 完了済みとしてマーク
              log.debug(`[3-4] ✅ 最新確認で回答発見 - 重複防止: ${taskId}`);
              return false;
            }
          }
        }
      } catch (error) {
        log.debug(`[3-4] ⚠️ 最新データ確認エラー: ${error.message}`);
        // エラーの場合は慎重にスキップ
        return false;
      }
    }

    // セルに値がある場合
    if (cellValue && cellValue.trim()) {
      // 作業中マーカーの場合
      if (cellValue.startsWith("作業中")) {
        // 既存のTaskStatusManagerでタイムアウトチェック
        if (window.TaskStatusManager) {
          const taskInfo = this.extractTaskInfo(taskId);
          if (taskInfo) {
            const statusManager = new window.TaskStatusManager();
            const isTimeout = statusManager.isTaskTimedOut(cellValue, taskInfo);
            if (isTimeout) {
              log.info(`[3-4] ⏰ タイムアウト検出 - 再実行可能: ${taskId}`);
              return true; // タイムアウトしたので実行可能
            }
          }
        }
        return false; // タイムアウトしていないのでブロック
      }

      // すでに回答がある場合
      this.completedTasks.add(taskId); // 完了済みとしてマーク
      return false;
    }

    // 【修正4】最終確認：処理中状態を再度チェック
    if (this.processingTasks.has(taskId)) {
      log.debug(`[3-4] ❌ 最終チェックで処理中検出 - 重複防止: ${taskId}`);
      return false;
    }

    // セルが本当に空の場合のみ実行可能
    const result = true;
    const endTimestamp = new Date().toISOString();

    // 最終判定結果の内部記録のみ（ログ出力削除）

    log.info(`[3-4] ✅ タスク実行許可: ${taskId}`);
    return result;
  }

  /**
   * タスクを処理中としてマーク
   */
  markTaskAsProcessing(task) {
    this.processingTasks.add(task.id);
    log.debug(`[3-4] ✅ タスク処理開始: ${task.id}`);

    // window.currentTaskListも更新
    if (window.currentTaskList && Array.isArray(window.currentTaskList)) {
      const existingTask = window.currentTaskList.find((t) => t.id === task.id);
      if (existingTask) {
        existingTask.processing = true;
      } else {
        window.currentTaskList.push({
          ...task,
          processing: true,
        });
      }
    }
  }

  /**
   * タスク完了を登録
   * 【修正】重複防止の強化とデータ整合性確保
   */
  registerTaskCompletion(taskId) {
    // 重複完了登録の防止
    if (this.completedTasks.has(taskId)) {
      log.debug(`[3-4] ⚠️ 重複完了登録をスキップ: ${taskId}`);
      return;
    }

    // 処理中リストから削除
    this.processingTasks.delete(taskId);

    // 完了リストに追加
    this.completedTasks.add(taskId);

    log.info(`[3-4] ✅ タスク完了登録: ${taskId}`);

    // window.currentTaskListも更新
    if (window.currentTaskList && Array.isArray(window.currentTaskList)) {
      const task = window.currentTaskList.find((t) => t.id === taskId);
      if (task) {
        task.processing = false;
        task.completed = true;
        task.completedAt = new Date().toISOString(); // 完了時刻を記録
      }
    }

    // 【修正】キャッシュクリアの強化
    this.cache.spreadsheetData = null;
    this.cache.lastFetchTime = null; // 完全リセット

    // 【追加】グローバル状態への完了通知
    if (window.globalState && window.globalState.completedTasksRegistry) {
      window.globalState.completedTasksRegistry.add(taskId);
    }
  }

  /**
   * グループ完了状態を確認・記録
   * 【追加】ハイブリッド協調モデル: グループ完了判定の実装
   */
  async checkAndRecordGroupCompletion(currentGroup, spreadsheetData) {
    try {
      const { columns, dataStartRow } = currentGroup;
      if (!columns || !dataStartRow) {
        log.warn("[3-4] ⚠️ グループ情報不完全", { currentGroup });
        return false;
      }

      const promptColumns = columns.prompts || [];
      const answerColumns = this.getAnswerColumns(columns.answer, currentGroup);

      let totalTasks = 0;
      let completedTasks = 0;
      let debugRows = [];

      // グループ範囲内の全タスクをチェック
      // グループの終了行を決定（グループサイズまたはデータ終端）
      const maxRowsToCheck = 100; // グループの最大行数
      const endRow = Math.min(
        dataStartRow + maxRowsToCheck - 1,
        spreadsheetData.length,
      );

      for (let rowIndex = dataStartRow - 1; rowIndex < endRow; rowIndex++) {
        const row = spreadsheetData[rowIndex];
        if (!row) continue;

        const rowNumber = rowIndex + 1;

        // プロンプト存在確認
        let hasPrompt = false;
        let promptDetails = [];
        for (const promptCol of promptColumns) {
          const colIndex = this.columnToIndex(promptCol);
          const promptValue = row[colIndex];
          promptDetails.push({
            column: promptCol,
            index: colIndex,
            value: promptValue ? promptValue.substring(0, 50) + "..." : "empty",
          });
          if (promptValue && promptValue.trim()) {
            hasPrompt = true;
            break;
          }
        }

        if (!hasPrompt) continue;

        // 各回答列の完了状態をチェック
        let rowTasks = [];
        for (const answerCol of answerColumns) {
          totalTasks++;
          const answerIndex = this.columnToIndex(answerCol.column);
          const answerValue = row[answerIndex] || "";

          const isCompleted =
            answerValue &&
            answerValue.trim() &&
            !answerValue.startsWith("作業中");

          if (isCompleted) {
            completedTasks++;
          }
        }

        debugRows.push({
          rowNumber,
          hasPrompt,
          tasks: rowTasks.length,
          completed: rowTasks.filter((t) => t.isCompleted).length,
        });
      }

      const isCompleted = totalTasks > 0 && completedTasks === totalTasks;
      const completionRate =
        totalTasks > 0
          ? ((completedTasks / totalTasks) * 100).toFixed(1)
          : "0.0";

      log.info(`[3-4] 📊 グループ${currentGroup.groupNumber}完了状態:`, {
        totalTasks,
        completedTasks,
        completionRate: `${completionRate}%`,
        isCompleted,
      });

      return isCompleted;
    } catch (error) {
      log.error("[3-4] ❌ グループ完了状態確認エラー:", error);
      return false;
    }
  }

  /**
   * グループ移行の協調実行
   * 【追加】統一移行協調システムを使用したグループ移行
   */
  async initiateGroupTransition(completedGroup) {
    try {
      log.info("[3-4] 🔀 [DynamicTaskSearch] グループ移行協調開始:", {
        completedGroup: completedGroup.groupNumber,
        initiator: "DynamicSearch",
      });

      // 統一移行協調システムが利用可能かチェック
      if (!window.executeGroupTransition) {
        log.warn(
          "[3-4] ⚠️ [DynamicTaskSearch] グループ移行協調システム未利用可能 - 従来通知のみ",
        );
        return false;
      }

      // 次のグループを決定（step3-loop.jsと同じロジック）
      const nextGroup = this.determineNextGroup(completedGroup);

      if (!nextGroup) {
        log.info(
          "[3-4] 📋 [DynamicTaskSearch] 次のグループなし - スプレッドシートURLチェック開始",
        );

        // UI入力欄から最新のURL一覧を取得
        const urlInputs = document.querySelectorAll(".spreadsheet-url-input");
        const currentUrls = [];

        urlInputs.forEach((input) => {
          const url = input.value.trim();
          if (url) currentUrls.push(url);
        });

        // 既存URLと比較して新しいURLを抽出
        const existingUrls = window.globalState?.spreadsheetUrls || [];
        const newUrls = currentUrls.filter(
          (url) => !existingUrls.includes(url),
        );

        if (newUrls.length > 0) {
          log.info(
            `[3-4] 📋 [DynamicTaskSearch] 新しいスプレッドシート${newUrls.length}個を検出 - 処理開始`,
          );

          // globalStateに追加
          window.globalState.spreadsheetUrls = [...existingUrls, ...newUrls];
          window.globalState.totalUrlCount =
            window.globalState.spreadsheetUrls.length;

          // 最初の新しいURLでstep1-2-3を実行
          const nextUrl = newUrls[0];
          const nextIndex = existingUrls.length;
          window.globalState.currentUrlIndex = nextIndex;

          log.info(
            `[3-4] 🔄 次のスプレッドシート(${nextIndex + 1}/${window.globalState.spreadsheetUrls.length})へ移行: ${nextUrl.substring(0, 80)}...`,
          );

          // Step1-2-3を実行
          try {
            if (typeof window.executeStep1 === "function") {
              await window.executeStep1(nextUrl);
              log.info("[3-4] ✅ Step1完了");
            }

            if (typeof window.executeStep2 === "function") {
              await window.executeStep2();
              log.info("[3-4] ✅ Step2完了");
            }

            // Step3は現在のループが継続する
            return false; // ループ継続
          } catch (error) {
            log.error("[3-4] ❌ 次のスプレッドシート処理エラー:", error);
            return true; // エラー時は終了
          }
        }

        log.info("[3-4] 🎉 [DynamicTaskSearch] 全スプレッドシート処理完了");
        return true;
      }

      // 統一移行協調システムを使用して移行実行
      const transitionSuccess = await window.executeGroupTransition(
        completedGroup,
        nextGroup,
        "DynamicSearch",
      );

      if (transitionSuccess) {
        log.info("[3-4] ✅ [DynamicTaskSearch] グループ移行協調成功:", {
          from: completedGroup.groupNumber,
          to: nextGroup.groupNumber,
        });
      } else {
        log.warn("[3-4] ❌ [DynamicTaskSearch] グループ移行協調失敗:", {
          from: completedGroup.groupNumber,
          to: nextGroup.groupNumber,
        });
      }

      return transitionSuccess;
    } catch (error) {
      log.error("[3-4] ❌ [DynamicTaskSearch] グループ移行協調エラー:", error);
      return false;
    }
  }

  /**
   * 次のグループを決定
   * 【追加】step3-loop.jsのグループ順序と整合性を保つ
   */
  determineNextGroup(currentGroup) {
    try {
      const taskGroups = window.globalState?.taskGroups;
      if (!taskGroups || !Array.isArray(taskGroups)) {
        log.warn("[3-4] ⚠️ [DynamicTaskSearch] taskGroups未定義");
        return null;
      }

      // 現在のグループのインデックスを検索
      const currentIndex = taskGroups.findIndex(
        (group) => group.groupNumber === currentGroup.groupNumber,
      );

      if (currentIndex === -1) {
        log.warn(
          "[3-4] ⚠️ [DynamicTaskSearch] 現在のグループがtaskGroups内に見つからない",
        );
        return null;
      }

      // 次のグループを取得
      const nextIndex = currentIndex + 1;
      if (nextIndex >= taskGroups.length) {
        log.info(
          "[3-4] 📋 [DynamicTaskSearch] 最後のグループ完了 - 次のグループなし",
        );
        return null;
      }

      const nextGroup = taskGroups[nextIndex];

      return nextGroup;
    } catch (error) {
      log.error("[3-4] ❌ [DynamicTaskSearch] 次のグループ決定エラー:", error);
      return null;
    }
  }

  /**
   * step3メインループに制御移譲を通知
   * 【追加】ハイブリッド協調モデル: step3との協調プロトコル
   */
  notifyGroupCompletionToStep3(completedGroup) {
    try {
      log.info(
        `[3-4] 📡 step3メインループに制御移譲通知送信: グループ${completedGroup.groupNumber}`,
      );

      // 【方法1】カスタムイベントによる通知
      if (typeof window !== "undefined" && window.dispatchEvent) {
        const event = new CustomEvent("dynamicSearchGroupCompleted", {
          detail: {
            groupNumber: completedGroup.groupNumber,
            groupType: completedGroup.groupType,
            transferControl: true,
            timestamp: new Date().toISOString(),
            source: "DynamicSearch",
          },
        });
        window.dispatchEvent(event);
      }

      // 【方法2】グローバル状態による通知
      if (window.globalState) {
        window.globalState.dynamicSearchNotification = {
          type: "GROUP_COMPLETED",
          groupNumber: completedGroup.groupNumber,
          requestControlTransfer: true,
          timestamp: new Date().toISOString(),
        };
      }

      // 【方法3】直接コールバック（利用可能な場合）
      if (typeof window.onDynamicSearchGroupCompleted === "function") {
        window.onDynamicSearchGroupCompleted({
          groupNumber: completedGroup.groupNumber,
          groupData: completedGroup,
        });
      }
    } catch (error) {
      log.error("[3-4] ❌ step3制御移譲通知エラー:", error);
    }
  }

  /**
   * 列文字をインデックスに変換（A→0, B→1, C→2...）
   */
  columnToIndex(column) {
    let index = 0;
    for (let i = 0; i < column.length; i++) {
      index = index * 26 + (column.charCodeAt(i) - 64);
    }
    return index - 1;
  }

  /**
   * インデックスを列文字に変換（0→A, 1→B, 2→C...）
   */
  indexToColumn(index) {
    let column = "";
    let num = index;

    while (num >= 0) {
      column = String.fromCharCode(65 + (num % 26)) + column;
      num = Math.floor(num / 26) - 1;
      if (num < 0) break;
    }

    return column;
  }

  /**
   * システムリセット（デバッグ用）
   */
  reset() {
    this.processingTasks.clear();
    this.completedTasks.clear();
    this.cache.spreadsheetData = null;
    this.cache.lastFetchTime = null;

    // 【追加】currentGroupリスナーのクリーンアップ
    if (this._currentGroupListener && window.removeCurrentGroupListener) {
      window.removeCurrentGroupListener(this._currentGroupListener);
      this._currentGroupListener = null;
    }

    log.info("[3-4] 🔄 DynamicTaskSearchをリセットしました");
  }

  /**
   * タスクIDからセル位置を抽出するヘルパーメソッド
   * @param {string} taskId - タスクID（例: "Y25", "task_2_25_1758775278465"）
   * @returns {Object|null} - {column: string, row: number} または null
   */
  extractCellPosition(taskId) {
    if (!taskId || typeof taskId !== "string") return null;

    // パターン1: "Y25" 形式
    const simpleMatch = taskId.match(/^([A-Z]+)(\d+)$/);
    if (simpleMatch) {
      return {
        column: simpleMatch[1],
        row: parseInt(simpleMatch[2], 10),
      };
    }

    // パターン2: "task_2_25_1758775278465" 形式から行番号を抽出
    const complexMatch = taskId.match(/task_\d+_(\d+)_\d+/);
    if (complexMatch) {
      const row = parseInt(complexMatch[1], 10);
      // この場合、列は現在のグループのデータから取得する必要がある
      const currentGroup = window.globalState?.currentGroup;
      if (currentGroup && window.globalState?.taskGroups) {
        const taskGroup = window.globalState.taskGroups.find(
          (g) => g.groupNumber === currentGroup,
        );
        if (taskGroup && taskGroup.columns && taskGroup.columns.answer) {
          return {
            column: taskGroup.columns.answer,
            row: row,
          };
        }
      }
    }

    return null;
  }

  /**
   * タスクIDからタスク情報を抽出
   * TaskStatusManager.isTaskTimedOut() に渡すための情報を生成
   */
  extractTaskInfo(taskId) {
    const cellPosition = this.extractCellPosition(taskId);
    if (!cellPosition) {
      return null;
    }

    // 現在のグループ情報を取得
    const currentGroupNumber = window.getCurrentGroup
      ? window.getCurrentGroup()?.groupNumber
      : window.globalState?.currentGroup?.groupNumber;

    // タスク情報オブジェクトを構築
    const taskInfo = {
      id: taskId,
      column: cellPosition.column,
      row: cellPosition.row,
      groupNumber: currentGroupNumber,
      spreadsheetId: window.globalState?.spreadsheetId,
    };

    // 機能名を取得（タイムアウト判定に使用）
    // スプレッドシートの機能列から取得する必要がある場合は追加実装
    // 現在は基本情報のみ

    return taskInfo;
  }
}

// ========================================
// Lazy Initialization関数
// ========================================
function getDynamicTaskSearchInstance() {
  // 必要な依存関係がそろっているかチェック
  if (!window.fetchWithTokenRefresh) {
    log.warn(
      "[3-4] ⚠️ fetchWithTokenRefresh が未初期化のため、DynamicTaskSearchを作成できません",
    );
    return null;
  }

  if (!window.globalState) {
    log.warn(
      "[3-4] ⚠️ globalState が未初期化のため、DynamicTaskSearchを作成できません",
    );
    return null;
  }

  // シングルトンインスタンスとして作成
  if (!window.DynamicTaskSearch) {
    window.DynamicTaskSearch = new DynamicTaskSearch();
    log.info("[3-4] 📦 window.DynamicTaskSearch を遅延初期化");
  }

  return window.DynamicTaskSearch;
}

// ========================================
// グローバル関数のエクスポート
// ========================================
if (typeof window !== "undefined") {
  // 互換性のための関数エクスポート（遅延初期化対応）
  window.findNextAvailableTaskDynamic = async function () {
    const instance = getDynamicTaskSearchInstance();
    if (!instance) {
      log.error("[3-4] ❌ DynamicTaskSearchインスタンスを初期化できません");
      return null;
    }
    return await instance.findNextTask();
  };

  window.registerTaskCompletionDynamic = function (taskId) {
    log.info(
      `[3-4] 🔍 [TASK-FLOW-TRACE] registerTaskCompletionDynamic呼び出し:`,
      {
        taskId: taskId,
        taskIdType: typeof taskId,
        呼び出し時刻: new Date().toISOString(),
      },
    );

    const instance = getDynamicTaskSearchInstance();

    log.info(`[3-4] 🔍 [TASK-FLOW-TRACE] DynamicTaskSearchインスタンス確認:`, {
      taskId: taskId,
      hasInstance: !!instance,
      instanceType: typeof instance,
      インスタンス確認時刻: new Date().toISOString(),
    });

    if (!instance) {
      log.error(
        `[3-4] ❌ [TASK-FLOW-TRACE] DynamicTaskSearchインスタンス初期化失敗:`,
        {
          taskId: taskId,
          globalStateExists: !!window.globalState,
          currentGroup: window.globalState?.currentGroup,
          エラー時刻: new Date().toISOString(),
        },
      );
      return null;
    }

    try {
      const result = instance.registerTaskCompletion(taskId);
      log.info(`[3-4] ✅ [TASK-FLOW-TRACE] タスク完了登録成功:`, {
        taskId: taskId,
        result: result,
        登録成功時刻: new Date().toISOString(),
      });
      return result;
    } catch (error) {
      log.error(`[3-4] ❌ [TASK-FLOW-TRACE] タスク完了登録エラー:`, {
        taskId: taskId,
        error: error.message,
        stack: error.stack,
        エラー発生時刻: new Date().toISOString(),
      });
      throw error;
    }
  };
}

// ========================================
// モジュールエクスポート（Node.js環境用）
// ========================================
if (typeof module !== "undefined" && module.exports) {
  module.exports = DynamicTaskSearch;
}

// ========================================
// SpecialTaskProcessor クラス
// ========================================
class SpecialTaskProcessor {
  constructor() {
    this.specialTypes = {
      REPORT: "レポート化",
      GENSPARK: "Genspark",
      SCREENSHOT: "スクリーンショット",
    };
  }

  /**
   * 特別なタスクか判定
   */
  identifySpecialTask(task) {
    const prompt = task.prompt || "";
    const aiType = task.aiType || task.ai || "";

    // レポート化タスク
    if (
      aiType.toLowerCase() === "report" ||
      aiType === "レポート化" ||
      prompt.includes("レポート化")
    ) {
      return {
        isSpecial: true,
        type: this.specialTypes.REPORT,
        requiresData: true,
      };
    }

    // Gensparkタスク
    if (aiType.toLowerCase() === "genspark") {
      return {
        isSpecial: true,
        type: this.specialTypes.GENSPARK,
        requiresData: false,
      };
    }

    // スクリーンショットタスク
    if (
      prompt.includes("スクリーンショット") ||
      prompt.includes("画面キャプチャ")
    ) {
      return {
        isSpecial: true,
        type: this.specialTypes.SCREENSHOT,
        requiresData: false,
      };
    }

    return {
      isSpecial: false,
      type: null,
      requiresData: false,
    };
  }

  /**
   * 特別タスクを実行
   */
  async executeSpecialTask(task, specialInfo, windowInfo) {
    ExecuteLogger.info(`🔧 特別タスク実行: ${specialInfo.type}`);

    switch (specialInfo.type) {
      case this.specialTypes.REPORT:
        return await this.executeReportTask(task, windowInfo);

      case this.specialTypes.GENSPARK:
        return await this.executeGensparkTask(task, windowInfo);

      case this.specialTypes.SCREENSHOT:
        return await this.executeScreenshotTask(task, windowInfo);

      default:
        return {
          success: false,
          error: `未対応の特別タスク: ${specialInfo.type}`,
        };
    }
  }

  /**
   * レポート化タスクを実行
   */
  async executeReportTask(task, windowInfo) {
    try {
      // レポート自動化が利用可能か確認
      if (!window.ReportAutomation) {
        await window.aiAutomationLoader.loadAIFile("report");
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      if (!window.ReportAutomation) {
        throw new Error("レポート自動化が利用できません");
      }

      // スプレッドシートデータが必要
      const spreadsheetData = task.spreadsheetData || {};
      const result = await window.ReportAutomation.executeTask(
        task,
        spreadsheetData,
      );

      return result;
    } catch (error) {
      return {
        success: false,
        error: `レポートタスク実行エラー: ${error.message}`,
      };
    }
  }

  /**
   * Gensparkタスクを実行
   */
  async executeGensparkTask(task, windowInfo) {
    try {
      // Genspark自動化が利用可能か確認
      if (!window.GensparkAutomationV2) {
        await window.aiAutomationLoader.loadAIFile("genspark");
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      if (!window.GensparkAutomationV2) {
        throw new Error("Genspark自動化が利用できません");
      }

      const result = await window.GensparkAutomationV2.executeTask(task);
      return result;
    } catch (error) {
      return {
        success: false,
        error: `Gensparkタスク実行エラー: ${error.message}`,
      };
    }
  }

  /**
   * スクリーンショットタスクを実行
   */
  async executeScreenshotTask(task, windowInfo) {
    try {
      ExecuteLogger.info("📸 スクリーンショット取得開始");

      // Chrome APIでスクリーンショットを取得
      const dataUrl = await new Promise((resolve, reject) => {
        chrome.tabs.captureVisibleTab(
          windowInfo.windowId,
          { format: "png" },
          (dataUrl) => {
            if (chrome.runtime.lastError) {
              reject(chrome.runtime.lastError);
            } else {
              resolve(dataUrl);
            }
          },
        );
      });

      return {
        success: true,
        response: dataUrl,
        metadata: {
          type: "screenshot",
          format: "png",
          timestamp: new Date().toISOString(),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `スクリーンショット取得エラー: ${error.message}`,
      };
    }
  }
}

// グローバルインスタンス作成
window.specialTaskProcessor = new SpecialTaskProcessor();

async function executeStep3(taskList) {
  // executeStep3関数定義開始

  // 🔧 [FIX] 引数なしで呼ばれた場合、window.globalState.taskGroupsを使用
  if (taskList === undefined || taskList === null) {
    ExecuteLogger.info(
      "🔧 [DATA-SOURCE] 引数なし、window.globalState.taskGroupsを使用:",
      {
        hasGlobalState: !!window.globalState,
        taskGroupsCount: window.globalState?.taskGroups?.length || 0,
      },
    );

    taskList = window.globalState?.taskGroups || [];

    if (taskList.length === 0) {
      ExecuteLogger.warn("⚠️ [DATA-SOURCE] タスクグループが見つかりません");
      throw new Error(
        "executeStep3: タスクグループが見つかりません。Step2を先に実行してください。",
      );
    }
  }

  // 🔧 [FIX] 入力データ検証・変換処理
  if (!Array.isArray(taskList)) {
    ExecuteLogger.info(
      "🔧 [DATA-CONVERSION] グループオブジェクトを検出、タスク配列に変換中:",
      {
        inputType: typeof taskList,
        inputKeys: taskList ? Object.keys(taskList) : null,
        isGroupObject: !!(
          taskList &&
          typeof taskList === "object" &&
          !Array.isArray(taskList)
        ),
      },
    );

    if (taskList && typeof taskList === "object") {
      // グループオブジェクトをタスク配列に変換
      try {
        taskList = await createTaskListFromGroup(taskList);
        ExecuteLogger.info(
          "✅ [DATA-CONVERSION] グループオブジェクトからタスク配列への変換完了:",
          {
            convertedTaskCount: taskList.length,
            taskListPreview: taskList.slice(0, 3).map((task) => ({
              id: task?.id || task?.taskId,
              aiType: task?.aiType,
              prompt: task?.prompt?.substring(0, 30) + "...",
            })),
          },
        );
      } catch (error) {
        ExecuteLogger.error(
          "❌ [DATA-CONVERSION] グループオブジェクト変換エラー:",
          error,
        );
        throw new Error(`executeStep3: 入力データ変換失敗 - ${error.message}`);
      }
    } else {
      ExecuteLogger.error("❌ [DATA-CONVERSION] 無効な入力データ:", {
        taskList,
        type: typeof taskList,
      });
      throw new Error(
        "executeStep3: taskListは配列またはグループオブジェクトである必要があります",
      );
    }
  }

  // 🔧 [FIX] taskGroupsの配列が渡された場合、各グループを順次処理
  // タスク配列とグループ配列を区別：タスクは必ずpromptを持ち、グループはpromptを持たない
  if (
    Array.isArray(taskList) &&
    taskList.length > 0 &&
    taskList[0]?.columns &&
    !taskList[0]?.prompt
  ) {
    ExecuteLogger.info(
      "🔧 [DATA-CONVERSION] タスクグループ配列を検出、各グループを順次処理:",
      {
        groupCount: taskList.length,
        groupNumbers: taskList.map((g) => g.groupNumber),
      },
    );

    const allResults = [];
    for (const group of taskList) {
      try {
        ExecuteLogger.info(`🔄 グループ ${group.groupNumber} 処理開始`);
        const groupTaskList = await createTaskListFromGroup(group);

        // 各グループのタスクリストを処理
        // ここで再帰的にexecuteStep3を呼び出すのではなく、
        // 全てのタスクを1つの配列にまとめる
        allResults.push(...groupTaskList);
      } catch (error) {
        ExecuteLogger.error(
          `❌ グループ ${group.groupNumber} 処理エラー:`,
          error,
        );
        throw error;
      }
    }

    taskList = allResults;
    ExecuteLogger.info("✅ [DATA-CONVERSION] 全グループ変換完了:", {
      totalTaskCount: taskList.length,
    });
  }

  ExecuteLogger.info("🚀 Step 4-6 Execute 統合実行開始", taskList);

  // 🔍 [DEBUG] タスクリスト詳細検証ログ
  ExecuteLogger.info(
    "🔍 [DEBUG-TASK-VALIDATION] executeStep3受信タスクリスト詳細検証:",
    {
      taskListReceived: !!taskList,
      taskListType: typeof taskList,
      taskListLength: Array.isArray(taskList) ? taskList.length : "not array",
      isArray: Array.isArray(taskList),
      taskListContent: Array.isArray(taskList)
        ? taskList.map((task, index) => ({
            index: index,
            taskId:
              task?.id ||
              task?.taskId ||
              `${task?.column}${task?.row}` ||
              "ID不明",
            hasPrompt: !!task?.prompt,
            promptLength: task?.prompt?.length || 0,
            promptPreview: task?.prompt
              ? `${task.prompt.substring(0, 50)}...`
              : "❌ プロンプトなし",
            aiType: task?.aiType || "❌ AIタイプなし",
            column: task?.column || "❌ カラムなし",
            row: task?.row || "❌ 行なし",
            hasTabId: !!task?.tabId,
            hasWindowId: !!task?.windowId,
            taskKeys: task ? Object.keys(task) : null,
            isValidTask: !!(
              task?.prompt &&
              task?.aiType &&
              task?.column &&
              task?.row
            ),
          }))
        : "taskListが配列ではありません",
      validTaskCount: Array.isArray(taskList)
        ? taskList.filter(
            (task) =>
              !!(task?.prompt && task?.aiType && task?.column && task?.row),
          ).length
        : 0,
      invalidTasks: Array.isArray(taskList)
        ? taskList
            .filter(
              (task) =>
                !(task?.prompt && task?.aiType && task?.column && task?.row),
            )
            .map((task) => ({
              taskId:
                task?.id ||
                task?.taskId ||
                `${task?.column}${task?.row}` ||
                "ID不明",
              missingFields: [
                !task?.prompt ? "prompt" : null,
                !task?.aiType ? "aiType" : null,
                !task?.column ? "column" : null,
                !task?.row ? "row" : null,
              ].filter(Boolean),
            }))
        : [],
    },
  );

  // 内部関数の存在確認（実行時チェック）
  ExecuteLogger.info("🔍 [executeStep3] 内部関数の定義状態確認:", {
    executeNormalAITask: typeof executeNormalAITask,
    processTaskResult: typeof processTaskResult,
    shouldPerformWindowCleanup: typeof shouldPerformWindowCleanup,
    calculateLogCellRef: typeof calculateLogCellRef,
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

    // グループタイプの判定（taskGroupTypeDetectorは未定義のため簡略化）
    const groupTypeInfo = {
      groupType:
        processTaskList.length > 0
          ? processTaskList[0]?.taskType || "通常処理"
          : "通常処理",
      taskCount: processTaskList.length,
    };
    ExecuteLogger.info(
      "🎯 [Step 4-6-1] グループタイプ判定結果:",
      groupTypeInfo,
    );

    // ウィンドウ配置情報の取得（デフォルト値を使用）
    windowLayoutInfo = {
      layout: "default",
      taskCount: processTaskList.length,
    };
    ExecuteLogger.info(
      "🖼️ [Step 4-6-1] ウィンドウ配置情報（タスク順序ベース）:",
      windowLayoutInfo,
    );

    // Step 4-6-2: スプレッドシートデータの動的取得
    ExecuteLogger.info("📊 [Step 4-6-2] スプレッドシートデータ動的取得開始");

    // enrichTaskListは削除（spreadsheetDataManagerが未定義のため）
    // processTaskListをそのまま使用
    enrichedTaskList = processTaskList;
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

      // === 全ウィンドウ事前作成 ===
      ExecuteLogger.info(
        "🪟 [Step 4-6-3] 全タスク用のウィンドウを事前に一括作成します",
      );

      // 全タスクから必要なAI種別を抽出（重複排除）
      const requiredAiTypes = new Set();
      for (const task of enrichedTaskList) {
        if (task.aiType) {
          requiredAiTypes.add(task.aiType);
        }
      }

      ExecuteLogger.info(
        `必要なAI種別: ${Array.from(requiredAiTypes).join(", ")}`,
      );

      // ウィンドウレイアウトを作成（各AI種別ごとに3つのウィンドウ: position 0,1,2）
      const windowLayout = [];
      for (const aiType of requiredAiTypes) {
        for (let position = 0; position < 3; position++) {
          windowLayout.push({ aiType, position });
        }
      }

      // 全ウィンドウを一度に開く（内部で5秒待機）
      ExecuteLogger.info(
        `🚀 ${windowLayout.length}個のウィンドウを一括作成開始（各AI種別×3ウィンドウ）...`,
      );
      const windowResults =
        await window.windowController.openWindows(windowLayout);
      const successfulWindows = windowResults.filter((w) => w.success);

      ExecuteLogger.info(
        `✅ [Step 4-6-3] ウィンドウ一括作成完了: ${successfulWindows.length}/${windowResults.length}個成功`,
      );

      if (successfulWindows.length === 0 && enrichedTaskList.length > 0) {
        throw new Error("ウィンドウを開くことができませんでした");
      }

      // Step 4-6-3-0.5: ウィンドウチェックをスキップ（unused/stream-processor-v2.js準拠）
      // 元のコードではウィンドウチェックを行わず、直接タスク実行に進むため削除
      ExecuteLogger.info(
        "📝 [Step 4-6-3-0.5] ウィンドウチェックをスキップ（unused準拠）",
      );
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

    // Step 4-6-4: ウィンドウチェックをスキップ（unused/stream-processor-v2.js準拠）
    // 元のコードではウィンドウチェックを行わず、直接タスク実行に進むため削除
    ExecuteLogger.info(
      "📝 [Step 4-6-4] ウィンドウチェックをスキップ（unused準拠）",
    );

    // Step 4-6-5: ライフサイクル管理初期化
    ExecuteLogger.info("🔄 [Step 4-6-5] ライフサイクル管理初期化");

    const lifecycleInitialized =
      await window.windowLifecycleManager.initializeLifecycleManager();
    if (!lifecycleInitialized) {
      ExecuteLogger.warn(
        "⚠️ [Step 4-6-5] WindowLifecycleManager初期化に失敗しましたが、処理を継続します（フォールバック機能有効）",
      );
    }

    ExecuteLogger.info("✅ WindowLifecycleManager初期化完了");

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

    // Step 4-6-6: 各タスクの実行（グループ順次処理: 各グループ内は3タスクずつ並列）
    ExecuteLogger.info(
      "⚡ [step4-execute.js] Step 4-6-6: タスク実行ループ開始（グループ順次処理方式）",
    );

    // TaskStatusManagerの初期化
    const statusManager = new TaskStatusManager();
    ExecuteLogger.info(
      `[step4-execute.js] Step 4-6-6-0: TaskStatusManager初期化完了`,
    );

    // DynamicTaskSearch用のグローバル変数を設定
    if (typeof window !== "undefined") {
      // 現在のタスクリストを設定
      window.currentTaskList = enrichedTaskList;

      // TaskStatusManagerをグローバルに設定
      window.taskStatusManager = statusManager;

      // executeNormalAITask関数をグローバルに登録（動的タスク実行用）
      window._executeNormalAITask = executeNormalAITask;

      // 現在のグループ情報を設定（最初のタスクから取得）
      if (enrichedTaskList && enrichedTaskList.length > 0) {
        const firstTask = enrichedTaskList[0];
        window.globalState = window.globalState || {};
        window.globalState.currentGroup = {
          groupNumber: firstTask.groupNumber || 0,
          columns: firstTask.columns || {},
          dataStartRow: firstTask.dataStartRow || 8,
          pattern: firstTask.pattern || "通常",
        };
      }

      ExecuteLogger.info(
        "📦 [executeStep3] DynamicTaskSearch用グローバル変数設定完了",
      );
    }

    // タスクをグループ番号で分類
    const groupedTasks = {};
    for (const task of enrichedTaskList) {
      const groupNum = task.groupNumber || 0;
      if (!groupedTasks[groupNum]) {
        groupedTasks[groupNum] = [];
      }
      groupedTasks[groupNum].push(task);
    }

    ExecuteLogger.info(`📊 タスクグループ分類完了:`, {
      グループ数: Object.keys(groupedTasks).length,
      各グループのタスク数: Object.entries(groupedTasks).map(
        ([groupNum, tasks]) => ({
          グループ: groupNum,
          タスク数: tasks.length,
        }),
      ),
    });

    // グループ番号順に処理
    const sortedGroupNumbers = Object.keys(groupedTasks).sort(
      (a, b) => Number(a) - Number(b),
    );
    let processedCount = 0;
    let batchIndex = 0;

    for (const groupNumber of sortedGroupNumbers) {
      const currentGroupTasks = groupedTasks[groupNumber];
      ExecuteLogger.info(
        `🎯 グループ${groupNumber}の処理開始（${currentGroupTasks.length}タスク）`,
      );

      // 前のグループの完了を待機（イベントドリブン）
      const prevGroups = sortedGroupNumbers.filter(
        (g) => Number(g) < Number(groupNumber),
      );
      for (const prevGroup of prevGroups) {
        const prevGroupTasks = groupedTasks[prevGroup];
        const hasInProgress =
          await statusManager.getInProgressTasks(prevGroupTasks);
        if (hasInProgress.length > 0) {
          ExecuteLogger.info(`⏳ グループ${prevGroup}の完了を待機中...`);
          await statusManager.waitForGroupCompletionEvent(Number(prevGroup));
        }
      }

      // 現在のグループのタスクを処理
      let groupProcessedCount = 0;
      while (groupProcessedCount < currentGroupTasks.length) {
        // グループ内で利用可能なタスクを最大3つ取得
        const batch = await statusManager.getAvailableTasks(
          currentGroupTasks.slice(groupProcessedCount),
          3,
        );

        if (batch.length === 0) {
          // 利用可能なタスクがない場合は、タイムアウトしたタスクをチェック
          const inProgressTasks =
            await statusManager.getInProgressTasks(currentGroupTasks);

          if (inProgressTasks.length > 0) {
            ExecuteLogger.info(
              `⏳ [グループ${groupNumber}] 作業中のタスク${inProgressTasks.length}個を待機中...`,
            );
            await new Promise((resolve) =>
              setTimeout(resolve, statusManager.checkInterval),
            );
            continue;
          } else {
            ExecuteLogger.info(`✅ [グループ${groupNumber}] 全タスク処理完了`);
            break;
          }
        }

        ExecuteLogger.info(
          `📦 [step4-execute.js] Step 4-6-6-${batchIndex + 2}: バッチ${batchIndex + 1} 処理開始 - ${batch.length}タスク`,
        );

        // 作業中マーカーを設定
        for (const task of batch) {
          await statusManager.markTaskInProgress(task);
        }

        // Step 4-6-6-A: ウィンドウ割り当て (unused/stream-processor-v2.js準拠)
        // 各タスクに異なるウィンドウを割り当てる
        const batchWindows = new Map(); // taskIndex -> windowInfo

        ExecuteLogger.info(
          `🔄 [step4-execute.js] Step 4-6-6-${batchIndex + 2}-A: バッチタスクにウィンドウを割り当て（unused準拠）`,
        );

        // 各タスクにpositionベースでウィンドウを割り当て
        for (let taskIndex = 0; taskIndex < batch.length; taskIndex++) {
          const task = batch[taskIndex];
          const aiType = task.aiType;
          const position = taskIndex % 3; // 0,1,2で3つのウィンドウを循環利用

          ExecuteLogger.info(
            `🔍 [step4-execute.js] Step 4-6-6-${batchIndex + 2}-A-1: タスク${taskIndex + 1}/${batch.length} - ${aiType}、Position: ${position}`,
          );

          const normalizedAiType =
            window.windowController.normalizeAiType(aiType);
          const windowKey = `${normalizedAiType}_${position}`;

          // 既存ウィンドウを探す
          let existingWindow = null;
          if (window.windowController.openedWindows.has(windowKey)) {
            existingWindow =
              window.windowController.openedWindows.get(windowKey);
            ExecuteLogger.info(
              `♻️ [step4-execute.js] Step 4-6-6-${batchIndex + 2}-A-2: 既存の${windowKey}ウィンドウを再利用`,
            );
          }

          if (existingWindow) {
            // 既存ウィンドウを使用
            const windowToUse = Array.isArray(existingWindow)
              ? existingWindow[0]
              : existingWindow;

            // windowKeyを保存（ウィンドウクローズ時のMap削除用）
            windowToUse.windowKey = windowKey;
            batchWindows.set(taskIndex, windowToUse);
            ExecuteLogger.info(
              `✅ [step4-execute.js] Step 4-6-6-${batchIndex + 2}-A-3: タスク${taskIndex + 1}に既存ウィンドウ割り当て`,
              {
                taskIndex: taskIndex,
                aiType: aiType,
                tabId: windowToUse?.tabId,
                windowId: windowToUse?.windowId,
                position: position,
              },
            );
          } else {
            // 既存ウィンドウが見つからない場合はエラー
            ExecuteLogger.error(
              `❌ [step4-execute.js] Step 4-6-6-${batchIndex + 2}-A-2: ${windowKey}ウィンドウが見つかりません（事前作成が必要）`,
              {
                taskIndex: taskIndex,
                aiType: aiType,
                position: position,
              },
            );
            // ウィンドウが見つからない場合は処理をスキップ
            continue;
          }
        }

        // Step 4-6-6-B: ウィンドウチェックをスキップ（unused/stream-processor-v2.js準拠）
        // unused/stream-processor-v2.jsではウィンドウチェックを行っていないため、
        // 同じ動作になるようチェック処理を削除
        ExecuteLogger.info(
          `📝 [step4-execute.js] Step 4-6-6-${batchIndex + 2}-B: ウィンドウチェックをスキップ（unused/stream-processor-v2.js準拠）`,
        );

        // Step 4-6-6-C: バッチ内のタスクを並列実行（unused/stream-processor-v2.js準拠）
        // unused/stream-processor-v2.jsのproccssBatch()と同じ実装
        ExecuteLogger.info(
          `🚀 [step4-execute.js] Step 4-6-6-${batchIndex + 2}-C: タスク並列実行開始（unused方式）`,
        );

        const validBatchTasks = batch.filter((task, index) => {
          const taskId = task.id || task.taskId || `${task.column}${task.row}`;
          const taskIndex = batch.indexOf(task);

          // Step 4-6-6-C-1: タスクインデックスでウィンドウ情報を取得（unused/stream-processor-v2.js準拠）
          const windowInfo = batchWindows.get(taskIndex);

          ExecuteLogger.info(
            `🔍 [step4-execute.js] Step 4-6-6-${batchIndex + 2}-C-1: タスク${taskId}の有効性確認（unused準拠）`,
            {
              aiType: task.aiType,
              hasWindowInfo: !!windowInfo,
              hasTabId: !!windowInfo?.tabId,
            },
          );

          // Step 4-6-6-C-2: ウィンドウ情報の存在確認（unused/stream-processor-v2.js準拠）
          if (!windowInfo || !windowInfo.tabId) {
            ExecuteLogger.error(
              `❌ [step4-execute.js] Step 4-6-6-${batchIndex + 2}-C-2: タスク${taskId}：${task.aiType}のウィンドウ情報が無効`,
              {
                windowInfo: windowInfo,
                hasWindowInfo: !!windowInfo,
                hasTabId: !!windowInfo?.tabId,
                hasWindowId: !!windowInfo?.windowId,
              },
            );
            return false;
          }

          // Step 4-6-6-C-3: タスクにウィンドウ情報を設定（unused/stream-processor-v2.js準拠）
          task.tabId = windowInfo.tabId;
          task.windowId = windowInfo.windowId;
          task.windowKey = windowInfo.windowKey; // ウィンドウクローズ時のMap削除用

          ExecuteLogger.info(
            `✅ [step4-execute.js] Step 4-6-6-${batchIndex + 2}-C-3: タスク${taskId}準備完了（unused準拠）`,
            {
              tabId: task.tabId,
              windowId: task.windowId,
              aiType: task.aiType,
            },
          );

          // Step 4-6-6-C-4: 複雑なフォールバック処理を削除（unused/stream-processor-v2.js準拠）
          // unused/stream-processor-v2.jsではシンプルなチェックのみ実施
          if (!task.tabId || !task.windowId) {
            ExecuteLogger.warn(
              `⚠️ [step4-execute.js] Step 4-6-6-${batchIndex + 2}-C-4: タスク${task.id || task.taskId}のtabId/windowIdが未設定`,
              {
                taskId: task.id || task.taskId,
                tabId: task.tabId,
                windowId: task.windowId,
                aiType: task.aiType,
              },
            );
            return false;
          }

          return true;
        });

        // Step 4-6-6-C-5: unused/stream-processor-v2.jsのシンプルな実装に変更
        // 以下の複雑なフォールバック処理は削除

        ExecuteLogger.info(
          `⚡ [step4-execute.js] Step 4-6-6-${batchIndex + 2}-C: ${validBatchTasks.length}/${batch.length}の有効タスクを並列実行`,
        );

        // 🔍 [DEBUG] バッチタスク詳細情報ログ追加
        ExecuteLogger.info("🔍 [DEBUG-BATCH-EXECUTION] バッチタスク詳細:", {
          batchIndex: batchIndex + 1,
          totalBatches: "動的生成のため不明",
          validTaskCount: validBatchTasks.length,
          originalTaskCount: batch.length,
          validTasks: validBatchTasks.map((task) => ({
            taskId: task.id || task.taskId || `${task.column}${task.row}`,
            aiType: task.aiType,
            prompt: task.prompt
              ? `${task.prompt.substring(0, 80)}...`
              : "❌ プロンプトなし",
            column: task.column,
            row: task.row,
            tabId: task.tabId,
            windowId: task.windowId,
            hasRequiredData: !!(task.prompt && task.tabId && task.windowId),
          })),
        });

        if (validBatchTasks.length === 0) {
          ExecuteLogger.error(
            `❌ [step4-execute.js] バッチ${batchIndex + 1}：実行可能なタスクがありません`,
          );
          ExecuteLogger.error(
            "🔍 [DEBUG-BATCH-EXECUTION] 元のバッチタスク検証失敗詳細:",
            {
              originalBatchLength: batch.length,
              failedTasks: batch.map((task) => ({
                taskId: task.id || task.taskId || `${task.column}${task.row}`,
                aiType: task.aiType,
                hasPrompt: !!task.prompt,
                hasTabId: !!task.tabId,
                hasWindowId: !!task.windowId,
                hasRequiredFields: !!(task.column && task.row),
                failureReason: !task.prompt
                  ? "プロンプトなし"
                  : !task.tabId
                    ? "tabIdなし"
                    : !task.windowId
                      ? "windowIdなし"
                      : "不明",
              })),
            },
          );
          continue; // 次のバッチへ
        }

        const batchPromises = validBatchTasks.map(async (task, index) => {
          const taskId = task.id || task.taskId || `${task.column}${task.row}`;
          const isThreeTypeTask =
            task.originalAiType === "3種類（ChatGPT・Gemini・Claude）";

          // 各タスク実行を段階的に開始（Chrome APIの過負荷を避ける）
          // Content Scriptの初期化完了を待つため、遅延を増やす
          if (index > 0) {
            const delay = index * BATCH_PROCESSING_CONFIG.CONTENT_SCRIPT_WAIT; // Content Script初期化待ち
            ExecuteLogger.info(
              `⏱️ Task ${index + 1} 開始待機: ${delay}ms（Content Script初期化待ち）`,
            );
            await new Promise((resolve) => setTimeout(resolve, delay));
          } else {
            // 最初のタスクも5秒待機（ウィンドウ開いてすぐは初期化未完了の可能性）
            ExecuteLogger.info(
              `⏱️ 初回タスク開始前に${BATCH_PROCESSING_CONFIG.WINDOW_CREATION_WAIT / 1000}秒待機（Content Script初期化待ち）`,
            );
            await new Promise((resolve) =>
              setTimeout(resolve, BATCH_PROCESSING_CONFIG.WINDOW_CREATION_WAIT),
            );
          }

          try {
            // スプレッドシートで指定されたAI種別をそのまま使用
            ExecuteLogger.info(
              `📝 [step4-execute.js] タスク実行: ${taskId} (AI: ${task.aiType}) ${isThreeTypeTask ? "[3種類AI]" : "[通常]"}`,
            );

            // 🔍 [DEBUG] タスク実行前の詳細ログ
            ExecuteLogger.info("🔍 [DEBUG-TASK-START] タスク実行開始詳細:", {
              taskId: taskId,
              aiType: task.aiType,
              prompt: task.prompt
                ? `${task.prompt.substring(0, 100)}...`
                : "❌ プロンプトなし",
              tabId: task.tabId,
              windowId: task.windowId,
              hasPrompt: !!task.prompt,
              hasTabId: !!task.tabId,
              hasWindowId: !!task.windowId,
              column: task.column,
              row: task.row,
              isThreeTypeTask: isThreeTypeTask,
            });

            // 特別処理かチェック
            const specialInfo =
              window.specialTaskProcessor.identifySpecialTask(task);
            let result = null;

            ExecuteLogger.info("🔍 [DEBUG-TASK-TYPE] タスクタイプ判定:", {
              taskId: taskId,
              isSpecial: specialInfo.isSpecial,
              specialType: specialInfo.type,
              willUseSpecialProcessor: specialInfo.isSpecial,
            });

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

              // 正常なメッセージパッシングシステムを使用
              ExecuteLogger.info(
                `📋 [step4-execute.js] 正常なメッセージパッシング方式で実行: ${task.aiType}`,
              );

              // 🔍 [DEBUG] executeNormalAITask実行前ログ
              ExecuteLogger.info(
                "🔍 [DEBUG-EXECUTE-AI] executeNormalAITask実行前:",
                {
                  taskId: taskId,
                  aiType: task.aiType,
                  tabId: task.tabId,
                  windowId: task.windowId,
                  functionExists: typeof executeNormalAITask === "function",
                  taskObject: {
                    hasId: !!task.id,
                    hasTaskId: !!task.taskId,
                    hasPrompt: !!task.prompt,
                    hasTabId: !!task.tabId,
                    hasWindowId: !!task.windowId,
                    hasColumn: !!task.column,
                    hasRow: !!task.row,
                  },
                },
              );

              result = await executeNormalAITask(task);

              // 🔍 [DEBUG] executeNormalAITask実行後ログ
              ExecuteLogger.info(
                "🔍 [DEBUG-EXECUTE-AI] executeNormalAITask実行後:",
                {
                  taskId: taskId,
                  resultReceived: !!result,
                  resultType: typeof result,
                  resultSuccess: result?.success,
                  resultKeys: result ? Object.keys(result) : null,
                },
              );
            }

            // 結果処理
            await processTaskResult(task, result, taskId);

            // デバッグ: 返す前の結果を詳細に確認
            const finalSuccess = result.success;
            ExecuteLogger.info("🔍 [DEBUG-FINAL-RESULT] タスク実行最終結果:", {
              taskId: taskId,
              success: finalSuccess,
              successType: typeof finalSuccess,
              successValue:
                finalSuccess === true
                  ? "true"
                  : finalSuccess === false
                    ? "false"
                    : "undefined/null",
              resultObjectKeys: result ? Object.keys(result) : null,
              hasResponse: !!result.response,
              column: task.column,
              row: task.row,
              windowId: task.windowId,
            });

            return {
              taskId: taskId,
              aiType: task.aiType,
              success: result.success,
              result: result,
              column: task.column, // タスクの列情報を追加
              row: task.row, // タスクの行情報を追加
              windowId: task.windowId, // ウィンドウIDを追加
              response: result.response,
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
              column: task.column, // エラー時もタスク情報を保持
              row: task.row,
              windowId: task.windowId,
              response: null,
              specialProcessing: false,
              isThreeType: isThreeTypeTask,
            };
          }
        });

        // タスクを逐次実行（3つずつ同時実行）
        let batchResults;

        if (
          BATCH_PROCESSING_CONFIG.ENABLE_ASYNC_BATCH &&
          !BATCH_PROCESSING_CONFIG.SAFE_MODE
        ) {
          // 新しい非同期バッチ処理（タスクリスト情報付き）
          batchResults = await executeAsyncBatchProcessing(
            batchPromises,
            validBatchTasks,
          );
        } else {
          // 既存の安定したPromise.allSettled処理を維持
          batchResults = await Promise.allSettled(batchPromises);
        }

        // 結果を収集
        let successCount = 0;
        let failCount = 0;
        const failedTasks = [];

        ExecuteLogger.info(`🔍 [仮説検証-Step2] batchResults受信:`, {
          batchResultsLength: batchResults.length,
          batchResultsSample: batchResults[0],
          allStatuses: batchResults.map((r) => r.status),
        });

        batchResults.forEach((pr, index) => {
          ExecuteLogger.info(`🔍 [仮説検証-Step3] タスク[${index}]判定:`, {
            status: pr.status,
            hasValue: !!pr.value,
            valueSuccess: pr.value?.success,
            valueInProgress: pr.value?.inProgress,
            hasReason: !!pr.reason,
          });

          if (pr.status === "fulfilled") {
            results.push(pr.value);
            if (pr.value.success) {
              successCount++;
              ExecuteLogger.info(
                `✅ [仮説検証-Step3-A] タスク[${index}]: 成功カウント`,
              );
            } else {
              failCount++;
              ExecuteLogger.info(
                `❌ [仮説検証-Step3-B] タスク[${index}]: 失敗カウント (success=${pr.value.success})`,
              );
              failedTasks.push({
                taskIndex: index,
                taskId:
                  pr.value.taskId || `batch_${batchIndex + 1}_task_${index}`,
                aiType: pr.value.aiType || "不明",
                error: pr.value.error || "詳細不明",
                row: pr.value.row || "不明",
                column: pr.value.column || "不明",
              });
            }
          } else {
            failCount++;
            ExecuteLogger.info(
              `❌ [仮説検証-Step3-C] タスク[${index}]: Rejectedとして失敗カウント (status=${pr.status})`,
            );
            failedTasks.push({
              taskIndex: index,
              taskId: `batch_${batchIndex + 1}_task_${index}`,
              aiType: "不明",
              error: pr.reason?.message || pr.reason || "Promise rejected",
              row: "不明",
              column: "不明",
            });
          }
        });

        ExecuteLogger.info(
          `✅ [step4-execute.js] Step 4-6-6-${batchIndex + 2}-D: バッチ${batchIndex + 1}完了 - 成功: ${successCount}, 失敗: ${failCount}`,
        );

        // 作業中マーカーは削除しない（タスク完了時に回答で自動上書き）

        // Step 4-6-6-E: バッチのウィンドウをクローズ
        ExecuteLogger.info(
          `🪟 [step4-execute.js] Step 4-6-6-${batchIndex + 2}-E: ウィンドウクローズ`,
        );

        ExecuteLogger.info(`🔍 [仮説検証-Step4] ウィンドウクローズ開始:`, {
          batchWindowsCount: batchWindows.size,
          batchWindowsKeys: Array.from(batchWindows.keys()),
          resultsCount: results.length,
          failCountBeforeClose: failCount,
        });

        for (const [taskIndex, windowInfo] of batchWindows) {
          try {
            // inProgressフラグがtrueの場合はウィンドウを保持（即座実行モード対応）
            const taskResult = batchResults.find((r, idx) => idx === taskIndex);
            if (taskResult?.value?.inProgress) {
              ExecuteLogger.info(
                `💤 [仮説検証-Step4-B] タスク[${taskIndex}]実行中 - ウィンドウ保持:`,
                {
                  windowId: windowInfo.windowId,
                  aiType: windowInfo.aiType,
                  inProgress: true,
                },
              );
              continue;
            }

            ExecuteLogger.info(
              `🔍 [仮説検証-Step4-A] タスク[${taskIndex}]ウィンドウクローズ試行:`,
              {
                windowId: windowInfo.windowId,
                aiType: windowInfo.aiType,
              },
            );
            await StepIntegratedWindowService.closeWindow(windowInfo.windowId);
            ExecuteLogger.info(`✅ タスク${taskIndex}ウィンドウクローズ完了`);

            // WindowControllerの配列からも削除（タブID再利用問題の修正）
            // taskIndexは数値なので、windowInfoからaiTypeを取得
            const aiType = windowInfo.aiType || "claude";
            const normalizedAiType =
              window.windowController?.normalizeAiType?.(aiType);
            if (
              normalizedAiType &&
              window.windowController?.openedWindows?.has(normalizedAiType)
            ) {
              const windowArray =
                window.windowController.openedWindows.get(normalizedAiType);
              if (Array.isArray(windowArray)) {
                const filteredArray = windowArray.filter(
                  (w) => w.windowId !== windowInfo.windowId,
                );
                if (filteredArray.length > 0) {
                  window.windowController.openedWindows.set(
                    normalizedAiType,
                    filteredArray,
                  );
                } else {
                  window.windowController.openedWindows.delete(
                    normalizedAiType,
                  );
                }
                ExecuteLogger.info(
                  `📋 WindowController配列を更新: ${normalizedAiType} (残り: ${filteredArray.length}個)`,
                );
              }
            }
          } catch (error) {
            ExecuteLogger.error(
              `⚠️ タスク${taskIndex}ウィンドウクローズエラー:`,
              error,
            );
          }
        }

        // 失敗がある場合は処理を停止
        if (failCount > 0) {
          ExecuteLogger.error(
            `🛑 [step4-execute.js] バッチ${batchIndex + 1}で${failCount}個のタスクが失敗したため、処理を停止します`,
          );

          // 失敗したタスクの詳細ログ記録
          ExecuteLogger.error(`📋 [step4-execute.js] 失敗したタスクの詳細:`, {
            batchIndex: batchIndex + 1,
            failCount: failCount,
            failedTasks: failedTasks,
            timestamp: new Date().toISOString(),
          });

          // 個別の失敗タスクも詳細ログ出力
          failedTasks.forEach((failedTask, failIndex) => {
            ExecuteLogger.error(
              `❌ [失敗タスク ${failIndex + 1}/${failCount}]`,
              {
                taskId: failedTask.taskId,
                aiType: failedTask.aiType,
                position: `${failedTask.column}${failedTask.row}`,
                error: failedTask.error,
                batchIndex: batchIndex + 1,
                taskIndex: failedTask.taskIndex,
              },
            );
          });

          // 失敗時でも作業中マーカーをクリア
          ExecuteLogger.info(
            `🧹 [step4-execute.js] 失敗時の緊急マーカークリア開始（バッチ${batchIndex + 1}）`,
          );

          for (const task of validBatchTasks) {
            try {
              await statusManager.clearMarker(task);
              ExecuteLogger.debug(
                `🧹 [緊急クリア] マーカークリア完了: ${task.column}${task.row}`,
              );
            } catch (clearError) {
              ExecuteLogger.error(
                `❌ [緊急クリア] マーカークリアエラー: ${task.column}${task.row}`,
                clearError,
              );
            }
          }

          break;
        }

        // 処理済みカウントを更新
        groupProcessedCount += batch.length;
        processedCount += batch.length;
        batchIndex++;
      } // グループ内のwhileループ終了

      ExecuteLogger.info(`✅ グループ${groupNumber}の処理完了`);
    } // グループごとのforループ終了

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

  // 🔧 [UNIFICATION] Step 4-6-8: グループ統一化完了
  // step4自動移行ロジックを削除し、全グループをstep3メインループで統一管理

  const allSuccess = results.every((r) => r.success);

  ExecuteLogger.info("📋 [UNIFICATION] グループ統一化完了:", {
    allSuccess: allSuccess,
    taskCount: enrichedTaskList.length,
    currentGroup: window.globalState?.currentGroupIndex + 1 || "不明",
    統一管理: "step3メインループ",
    step4自動移行: "削除済み",
    データフロー: "step3 → processIncompleteTasks → executeStep3",
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

    return new Promise(async (resolve, reject) => {
      try {
        // タブの準備完了を待機（新しいリトライロジック）
        ExecuteLogger.info(
          `🔄 [Execute Task] タブ準備完了待機開始: tabId=${tabId}`,
        );
        const tab = await windowController.waitForTabReady(tabId, 10, 1000);

        // タブがnullの場合の処理
        if (!tab) {
          ExecuteLogger.error(
            `❌ [Execute Task] タブ ${tabId} が取得できませんでした（削除済みまたは無効）`,
          );
          reject(new Error(`タブID ${tabId} が無効または削除済みです`));
          return;
        }

        ExecuteLogger.info(`✅ [Execute Task] タブ準備完了:`, {
          tabId: tab.id,
          status: tab.status,
          url: tab.url,
        });

        // Content Scriptの準備確認（AI種別を判定して実行）
        if (tab.url) {
          let aiType = null;
          if (tab.url.includes("claude.ai")) {
            aiType = "claude";
          } else if (
            tab.url.includes("chatgpt.com") ||
            tab.url.includes("chat.openai.com")
          ) {
            aiType = "chatgpt";
          } else if (tab.url.includes("gemini.google.com")) {
            aiType = "gemini";
          } else if (
            tab.url.includes("genspark.com") ||
            tab.url.includes("genspark.ai")
          ) {
            aiType = "genspark";
          }

          if (aiType) {
            ExecuteLogger.info(
              `🔍 [Execute Task] ${aiType} Content Script準備確認開始`,
            );
            const isContentScriptReady =
              await windowController.waitForContentScriptReady(
                tabId,
                aiType,
                5,
                1500,
              );
            if (!isContentScriptReady) {
              ExecuteLogger.warn(
                `⚠️ [Execute Task] ${aiType} Content Script準備タイムアウト、続行します`,
              );
            } else {
              ExecuteLogger.info(
                `✅ [Execute Task] ${aiType} Content Script準備完了`,
              );
            }
          }
        }

        // URL有効性チェック（拡張機能ページを明示的に除外）
        if (!tab.url) {
          ExecuteLogger.error(`❌ [Tab Check] URLが取得できません:`, {
            tabId: tab.id,
            status: tab.status,
          });
          reject(new Error(`タブID ${tabId} のURLが取得できません`));
          return;
        }

        if (tab.url.startsWith("chrome-extension://")) {
          ExecuteLogger.error(
            `❌ [Tab Check] 拡張機能ページが検出されました:`,
            {
              tabId: tab.id,
              url: tab.url,
              expectedDomains: [
                "claude.ai",
                "chatgpt.com",
                "gemini.google.com",
                "genspark.ai",
              ],
            },
          );
          reject(new Error(`タブID ${tabId} は拡張機能ページです: ${tab.url}`));
          return;
        }

        if (
          !tab.url.includes("claude.ai") &&
          !tab.url.includes("chatgpt.com") &&
          !tab.url.includes("gemini.google.com") &&
          !tab.url.includes("genspark.ai")
        ) {
          ExecuteLogger.error(`❌ [Tab Check] 不正なURL:`, {
            tabId: tab.id,
            url: tab.url,
            expectedDomains: [
              "claude.ai",
              "chatgpt.com",
              "gemini.google.com",
              "genspark.ai",
            ],
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
      } catch (error) {
        ExecuteLogger.error(`❌ [Tab Check] タブ取得エラー:`, error);
        reject(new Error(`タブID ${tabId} が無効です: ${error.message}`));
        return;
      }

      // 削除: 問題のあったverifyContentScriptInjection関数
      // この関数がContent Script通信失敗の原因だった（ping応答機能がContent Script側に未実装）

      async function sendMessageToValidTab() {
        // メッセージ送信（Manifest V3対応: Promise形式）
        try {
          ExecuteLogger.info(`🚀 [DEBUG-sendMessage] 送信開始:`, {
            tabId: tabId,
            automationName: automationName,
            taskId: task.id,
            aiType: task.aiType,
            messageAction: "executeTask",
            timestamp: new Date().toISOString(),
          });

          // 🔧 [SIMPLIFIED] 元のtaskオブジェクトをそのまま使用（データ一貫性のため）
          // 不要な変換を削除し、Single Source of Truthを維持

          // プロンプト送信処理

          // AI種別に応じたメッセージタイプを設定
          const getMessageType = (automationName) => {
            const typeMap = {
              ClaudeAutomation: "CLAUDE_EXECUTE_TASK",
              ChatGPTAutomationV2: "CHATGPT_EXECUTE_TASK",
              GeminiAutomation: "GEMINI_EXECUTE_TASK",
              GensparkAutomationV2: "GENSPARK_EXECUTE_TASK",
            };
            return typeMap[automationName] || "EXECUTE_TASK";
          };

          // Content Script用の最適化されたタスクデータ（必要最小限）
          const optimizedTask = {
            id: task.id || task.taskId,
            taskId: task.id || task.taskId,
            prompt: task.prompt,
            aiType: task.aiType,
            row: task.row,
            column: task.column,
            model: task.model,
            function: task.function,
            logCell: task.logCell,
            tabId: task.tabId,
            windowId: task.windowId,
            sheetName: task.sheetName,
            spreadsheetId: task.spreadsheetId,
            gid: task.gid,
            cellInfo: task.cellInfo, // 🔧 [CELLINFO-FIX] セル位置情報を追加（ChatGPT/Claude/Gemini統一）
          };

          const messagePayload = {
            action: "executeTask",
            type: getMessageType(automationName), // AI種別に応じて動的に設定
            automationName: automationName,
            task: optimizedTask, // 最適化されたタスクデータのみ送信
            logCell: task?.logCell, // 🔧 [LOGCELL-FIX] logCellを明示的に追加
          };

          ExecuteLogger.info(`📡 [DEBUG-sendMessage] メッセージ詳細:`, {
            payload: messagePayload,
            payloadKeys: Object.keys(messagePayload),
            taskKeys: Object.keys(task),
            taskPromptLength: task.prompt?.length || 0,
            タスクID: task.id,
            aiType: task.aiType,
            送信先TabID: tabId,
          });

          // Content Script注入処理 - シンプルかつ確実な実装
          {
            ExecuteLogger.info(
              `📝 [Content Script注入] ${automationName} 注入開始 (TabID: ${tabId})`,
            );

            try {
              // automationNameからファイル名を決定
              let scriptFile;
              switch (automationName) {
                case "ChatGPTAutomationV2":
                  scriptFile = "4-1-chatgpt-automation.js";
                  break;
                case "ClaudeAutomation":
                  scriptFile = "4-2-claude-automation.js";
                  break;
                case "GeminiAutomation":
                  scriptFile = "4-3-gemini-automation.js";
                  break;
                case "GensparkAutomationV2":
                  scriptFile = "6-2-genspark-automation.js";
                  break;
                default:
                  throw new Error(`未知のautomationName: ${automationName}`);
              }

              // 注入前にタブ情報を確認して正しいタブか検証
              let tabInfo;
              try {
                tabInfo = await chrome.tabs.get(tabId);
                if (!tabInfo) {
                  throw new Error(`タブID ${tabId} が見つかりません`);
                }
              } catch (tabError) {
                ExecuteLogger.error(`❌ [Content Script注入] タブ取得エラー:`, {
                  tabId: tabId,
                  error: tabError.message,
                });
                throw new Error(
                  `タブID ${tabId} が無効または削除済みです: ${tabError.message}`,
                );
              }
              const tabInfoDetails = {
                tabId: tabId,
                url: tabInfo.url,
                title: tabInfo.title,
                status: tabInfo.status,
                isExtensionPage: tabInfo.url?.startsWith("chrome-extension://"),
                isClaudeUrl: tabInfo.url?.includes("claude.ai"),
                isChatGPTUrl:
                  tabInfo.url?.includes("chatgpt.com") ||
                  tabInfo.url?.includes("chat.openai.com"),
                isGeminiUrl: tabInfo.url?.includes("gemini.google.com"),
                isGensparkUrl:
                  tabInfo.url?.includes("genspark.com") ||
                  tabInfo.url?.includes("genspark.ai"),
                windowId: tabInfo.windowId,
                active: tabInfo.active,
                scriptFile: scriptFile,
                taskId: task?.id,
                aiType: task?.aiType,
              };
              // タブ情報詳細確認

              // 拡張機能ページへの注入チェックと修正
              if (tabInfo.url?.startsWith("chrome-extension://")) {
                ExecuteLogger.warn(
                  `⚠️ [Content Script注入] 拡張機能ページが検出されました。正しいAIサイトタブを検索中...`,
                  {
                    wrongTabId: tabId,
                    wrongUrl: tabInfo.url,
                    windowId: tabInfo.windowId,
                  },
                );

                // 正しいAIサイトのタブを検索
                const correctTabId =
                  await window.windowController.findCorrectAITab(
                    automationName,
                    tabInfo.windowId,
                  );

                if (correctTabId && correctTabId !== tabId) {
                  ExecuteLogger.info(
                    `✅ [Content Script注入] 正しいAIサイトタブを発見: ${correctTabId}`,
                  );
                  tabId = correctTabId; // 正しいタブIDに更新

                  // 正しいタブの情報を再取得
                  tabInfo = await chrome.tabs.get(tabId);
                  ExecuteLogger.info(
                    `🔍 [Content Script注入] 正しいタブ情報:`,
                    {
                      tabId: tabId,
                      url: tabInfo.url,
                      windowId: tabInfo.windowId,
                      status: tabInfo.status,
                    },
                  );
                } else {
                  ExecuteLogger.error(
                    `❌ [Content Script注入] 正しいAIサイトタブが見つかりません`,
                    {
                      automationName: automationName,
                      windowId: tabInfo.windowId,
                      expectedPattern:
                        automationName === "ClaudeAutomation"
                          ? "https://claude.ai/*"
                          : automationName === "ChatGPTAutomation"
                            ? "https://chatgpt.com/* or https://chat.openai.com/*"
                            : automationName === "GeminiAutomation"
                              ? "https://gemini.google.com/*"
                              : automationName === "GensparkAutomation"
                                ? "https://genspark.com/* or https://genspark.ai/*"
                                : "Unknown AI URL",
                    },
                  );
                  throw new Error(
                    `正しいAIサイトタブが見つかりません: ${automationName}`,
                  );
                }
              }

              // 🔍 [段階3] manifest.json自動注入Content Scriptへの直接通信
              const autoInjectionDetails = {
                automationName: automationName,
                targetTabId: tabId,
                tabInfo: {
                  id: tabInfo.id,
                  url: tabInfo.url,
                  title: tabInfo.title,
                  status: tabInfo.status,
                  active: tabInfo.active,
                  windowId: tabInfo.windowId,
                },
                manifestAutoInjection: true,
                timestamp: new Date().toISOString(),
              };
              // 自動注入Content Script通信開始

              // タブの現在状態を再取得して確認
              let currentTabInfo;
              try {
                currentTabInfo = await chrome.tabs.get(tabId);
                const tabStateDetails = {
                  tabId: tabId,
                  current: {
                    id: currentTabInfo.id,
                    url: currentTabInfo.url,
                    title: currentTabInfo.title,
                    status: currentTabInfo.status,
                    active: currentTabInfo.active,
                    windowId: currentTabInfo.windowId,
                  },
                  urlAnalysis: {
                    isExtensionPage: currentTabInfo.url
                      ? currentTabInfo.url.startsWith("chrome-extension://")
                      : false,
                    isClaudeAI: currentTabInfo.url
                      ? currentTabInfo.url.includes("claude.ai")
                      : false,
                    shouldHaveAutoInjection: currentTabInfo.url
                      ? currentTabInfo.url.includes("claude.ai") ||
                        currentTabInfo.url.includes("chatgpt.com") ||
                        currentTabInfo.url.includes("gemini.google.com") ||
                        currentTabInfo.url.includes("genspark")
                      : false,
                  },
                };
                // 現在のタブ状態確認
              } catch (tabGetError) {
                ExecuteLogger.error(
                  `❌ [段階3-タブ確認] chrome.tabs.get失敗:`,
                  {
                    tabId: tabId,
                    error: tabGetError.message,
                  },
                );
                currentTabInfo = tabInfo; // フォールバック
              }

              // 最終確認：AIサイトのURLパターンをチェック
              const isValidAIUrl = window.windowController.validateAIUrl(
                currentTabInfo.url,
                automationName,
              );

              const urlValidationDetails = {
                tabId: tabId,
                url: currentTabInfo.url,
                automationName: automationName,
                isValidAIUrl: isValidAIUrl,
                validationMethod: "window.windowController.validateAIUrl",
                manifestAutoInjection: "有効",
              };
              // URL有効性チェック

              if (!isValidAIUrl) {
                ExecuteLogger.error(
                  `❌ [manifest.json自動注入] 無効なAIサイトURL`,
                  {
                    tabId: tabId,
                    url: currentTabInfo.url,
                    automationName: automationName,
                  },
                );
                throw new Error(
                  `無効なAIサイトURL: ${currentTabInfo.url} (${automationName})`,
                );
              }

              // manifest.json自動注入Content Scriptの準備確認
              ExecuteLogger.info(
                `🔧 [manifest.json自動注入] Content Script準備確認中: ${automationName}`,
                {
                  tabId: tabId,
                  url: currentTabInfo.url,
                  automationName: automationName,
                },
              );

              // 初期化待機（manifest.json自動注入Content Scriptが初期化されるまで）
              // 緊急修正: 通信エラー回避のための待機
              await new Promise((resolve) =>
                setTimeout(
                  resolve,
                  BATCH_PROCESSING_CONFIG.WINDOW_CREATION_WAIT,
                ),
              );

              ExecuteLogger.info(
                `✅ [manifest.json自動注入] ${automationName} 準備完了`,
              );

              // 緊急追加: Content Script通信テスト
              try {
                const testMessage = {
                  action: "ping",
                  type: "CONNECTIVITY_TEST",
                  timestamp: Date.now(),
                };
                const testResponse = await chrome.tabs.sendMessage(
                  tabId,
                  testMessage,
                );
                ExecuteLogger.info(
                  `✅ [通信テスト成功] ${automationName}:`,
                  testResponse,
                );
              } catch (testError) {
                ExecuteLogger.warn(
                  `⚠️ [通信テスト失敗] ${automationName}:`,
                  testError.message,
                );
                // テスト失敗でも処理継続（警告のみ）
              }
            } catch (injectionError) {
              ExecuteLogger.error(`❌ [Content Script注入] 失敗:`, {
                tabId: tabId,
                error: injectionError.message,
                stack: injectionError.stack,
              });
              reject(
                new Error(`Content Script注入失敗: ${injectionError.message}`),
              );
              return;
            }
          }

          const sendStartTime = Date.now();

          // 🔍 STEP C: メッセージ送信実行
          const messageSize = JSON.stringify(messagePayload).length;
          ExecuteLogger.info(`🔍 [STEP C] メッセージ送信開始:`, {
            tabId: tabId,
            messageType: messagePayload.type || messagePayload.action,
            messageSize: messageSize,
            messageSizeKB: Math.round(messageSize / 1024),
            timestamp: new Date().toISOString(),
          });

          // メッセージサイズが大きすぎる場合の警告
          if (messageSize > 100000) {
            ExecuteLogger.warn(`⚠️ [STEP C] 大きなメッセージサイズ検出:`, {
              tabId: tabId,
              messageSize: messageSize,
              messageSizeKB: Math.round(messageSize / 1024),
              messageSizeMB: (messageSize / 1024 / 1024).toFixed(2),
              taskId: task.id,
              promptLength: optimizedTask.prompt?.length || 0,
              warning: "Chrome拡張のメッセージパッシングには制限があります",
            });

            // プロンプトが非常に長い場合、切り詰める
            if (optimizedTask.prompt && optimizedTask.prompt.length > 50000) {
              const originalLength = optimizedTask.prompt.length;
              // 最初の45000文字と最後の5000文字を保持
              optimizedTask.prompt =
                optimizedTask.prompt.substring(0, 45000) +
                "\n\n[...中略...](" +
                (originalLength - 50000) +
                "文字省略)\n\n" +
                optimizedTask.prompt.substring(originalLength - 5000);

              // メッセージペイロードを再構築
              messagePayload.task = optimizedTask;

              const newMessageSize = JSON.stringify(messagePayload).length;
              ExecuteLogger.info(`✂️ [STEP C] プロンプトを切り詰めました:`, {
                originalSize: messageSize,
                newSize: newMessageSize,
                originalSizeKB: Math.round(messageSize / 1024),
                newSizeKB: Math.round(newMessageSize / 1024),
                reduction:
                  Math.round((1 - newMessageSize / messageSize) * 100) + "%",
              });
            }
          }

          // unusedの実装と同じく、タイムアウトなしでシンプルに送信
          let response;
          try {
            // すべてのAI（Claude含む）で統一的にchrome.tabs.sendMessageを使用
            ExecuteLogger.info(
              `🔍 [STEP C-1] chrome.tabs.sendMessage実行中...`,
            );

            // chrome.tabs.sendMessage実行

            response = await chrome.tabs.sendMessage(tabId, messagePayload);

            ExecuteLogger.info(`🔍 [STEP C-2] メッセージ送信完了:`, {
              tabId: tabId,
              responseReceived: !!response,
              responseType: typeof response,
              responseSuccess: response?.success,
              responseContent: response
                ? {
                    hasSuccess: "success" in response,
                    hasResult: "result" in response,
                    hasError: "error" in response,
                    hasWarning: "warning" in response,
                    keys: Object.keys(response),
                  }
                : null,
              automationName: automationName,
            });

            // ClaudeAutomation応答処理
          } catch (timeoutError) {
            ExecuteLogger.error(`❌ [STEP C-ERROR] メッセージ送信エラー:`, {
              error: timeoutError.message,
              errorStack: timeoutError.stack,
              tabId: tabId,
              taskId: task.id,
              automationName: automationName,
              errorType: "sendMessage_failure",
              lastError: chrome.runtime.lastError,
            });

            // ClaudeAutomationの場合は特別な処理
            if (automationName === "ClaudeAutomation") {
              ExecuteLogger.error(
                `❌ [ClaudeAutomation] sendMessageエラー - Content Scriptが応答していません`,
                {
                  tabId: tabId,
                  taskId: task.id,
                  error: timeoutError.message,
                },
              );
            }

            throw timeoutError;
          }

          const sendDuration = Date.now() - sendStartTime;

          ExecuteLogger.info(
            `📨 [DEBUG-sendMessage] 送信完了 (${sendDuration}ms):`,
            {
              tabId: tabId,
              responseExists: !!response,
              responseType: typeof response,
              responseKeys: response ? Object.keys(response) : [],
              responseSuccess: response?.success,
              responseError: response?.error,
              sendDuration: sendDuration,
            },
          );

          if (!response) {
            // Manifest V3では、Content Scriptが非同期処理中でも即座にundefinedが返る可能性がある
            ExecuteLogger.warn(
              `⚠️ [Content Script] 応答なし（Manifest V3の仕様変更の可能性）:`,
              {
                tabId: tabId,
                lastError: chrome.runtime.lastError?.message,
                sendDuration: sendDuration,
                responseType: typeof response,
                automationName: automationName,
                taskId: task.id,
              },
            );

            // ClaudeAutomationの場合、応答がない場合はエラーとして扱う
            // （Claude自動化は応答待機処理を含むため、即座に応答が返るべき）
            if (automationName === "ClaudeAutomation") {
              ExecuteLogger.error(
                `❌ [ClaudeAutomation] 応答なし - Content Scriptが正しく動作していない可能性`,
                {
                  tabId: tabId,
                  taskId: task.id,
                  prompt: task.prompt
                    ? task.prompt.substring(0, 50) + "..."
                    : null,
                },
              );
              reject(
                new Error("ClaudeAutomation: No response from Content Script"),
              );
              return;
            }

            // 他のAIの場合は警告のみ（互換性のため）
            resolve({
              success: true,
              warning:
                "No immediate response from Content Script (async processing)",
              tabId: tabId,
            });
            return;
          }

          if (response.success) {
            ExecuteLogger.info(
              `✅ [Content Script] ${automationName} 実行完了`,
            );

            // 🔍 [DEBUG-RECEIVE] Content Scriptから受信した結果の詳細ログ
            ExecuteLogger.info(
              "🔍 [DEBUG-RECEIVE] Content Scriptから受信した結果詳細:",
              {
                responseSuccess: response.success,
                hasResponseResult: !!response.result,
                responseResultType: response.result
                  ? typeof response.result
                  : null,
                responseResultSuccess: response.result?.success,
                hasResponseResultResponse: !!response.result?.response,
                responseResultResponseType: response.result?.response
                  ? typeof response.result?.response
                  : null,
                responseResultResponseLength: response.result?.response
                  ? response.result?.response.length
                  : 0,
                responseResultResponsePreview: response.result?.response
                  ? response.result?.response.substring(0, 100) + "..."
                  : null,
                responseResultCellInfo: response.result?.cellInfo,
                responseResultModel: response.result?.model,
                responseResultFunction: response.result?.function,
                responseResultUrl: response.result?.url,
                responseKeys: Object.keys(response),
                responseResultKeys: response.result
                  ? Object.keys(response.result)
                  : null,
                taskId: task.id || task.taskId,
                aiType: task.aiType,
                timestamp: new Date().toISOString(),
              },
            );

            resolve(response);
          } else {
            ExecuteLogger.error(
              `❌ [Content Script] 実行失敗:`,
              response.error,
            );
            reject(new Error(response.error || "不明なエラー"));
          }
        } catch (error) {
          ExecuteLogger.error(`❌ [Content Script] 通信エラー:`, error);
          reject(new Error(`Content Script通信エラー: ${error.message}`));
        }

        // 注意: メイン処理のタイムアウトは上記のPromise.raceで管理済み
        // 追加のタイムアウトは設定しない（重複タイムアウトを防ぐ）
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

    // Step 4-6-8-1: AI種別の正規化（不要な"single"変換を削除）
    let normalizedAiType = task.aiType || "Claude";
    // aiTypeは既にAI行から取得した正しい値（"ChatGPT", "Claude", "Gemini"など）

    // Step 4-6-8-2: 正しいタブIDを取得
    const normalizedKey =
      window.windowController.normalizeAiType(normalizedAiType);
    const windowInfo =
      task.tabId && task.windowId
        ? { tabId: task.tabId, windowId: task.windowId }
        : window.windowController.openedWindows.get(normalizedKey);

    const targetTabId = windowInfo?.tabId;

    ExecuteLogger.info(`🔍 [DEBUG-TabCheck] タブID確認: ${normalizedAiType}`, {
      normalizedKey: normalizedKey,
      windowInfo: !!windowInfo,
      tabId: targetTabId,
      windowId: windowInfo?.windowId,
      url: windowInfo?.url,
      taskProvidedTabId: task.tabId,
      taskProvidedWindowId: task.windowId,
      tabIdMatch: task.tabId === targetTabId,
      openedWindowsSize: window.windowController.openedWindows.size,
      allWindows: Array.from(
        window.windowController.openedWindows.entries(),
      ).map(([key, info]) => ({
        key,
        tabId: info.tabId,
        windowId: info.windowId,
        url: info.url,
      })),
    });

    if (task.tabId && task.tabId !== targetTabId) {
      ExecuteLogger.warn(`⚠️ [DEBUG-TabCheck] タブID不整合検出:`, {
        taskProvidedTabId: task.tabId,
        windowControllerTabId: targetTabId,
        willUseTabId: targetTabId,
        normalizedKey: normalizedKey,
      });
    }

    if (!targetTabId) {
      throw new Error(
        `${normalizedAiType} のタブが見つかりません (Key: ${normalizedKey})`,
      );
    }

    // Step 4-6-8-3: タスク開始ログ記録 - 詳細なwindowInfo情報を含める
    if (window.detailedLogManager) {
      const enhancedWindowInfo = {
        ...windowInfo,
        windowId: windowInfo?.windowId || windowInfo?.id,
        tabId: windowInfo?.tabId || windowInfo?.tabs?.[0]?.id,
        url: windowInfo?.url || windowInfo?.tabs?.[0]?.url,
        aiType: normalizedAiType,
        feature: task.feature || "デフォルト",
      };
      window.detailedLogManager.recordTaskStart(task, enhancedWindowInfo);
    }

    // Step 4-6-8-3: manifest.json自動注入Content Script確認（純粋メッセージパッシング版）
    ExecuteLogger.info(
      `[step4-execute.js] Step 4-6-8-3: ${normalizedAiType} manifest.json自動注入Content Script準備確認`,
    );

    // Step 4-6-8-4: 送信時刻記録
    if (window.detailedLogManager) {
      window.detailedLogManager.recordSendTime(taskId, windowInfo?.url);
    }

    // Step 4-6-8-5: Retry機能付きでAI実行
    ExecuteLogger.info(
      `[step4-execute.js] Step 4-6-8-5: ${normalizedAiType}実行準備`,
    );
    const executeFunction = async () => {
      switch (normalizedAiType.toLowerCase()) {
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

    // 🔍 [DEBUG-PROCESS] processTaskResult入口ログ - 受け取った引数の詳細
    ExecuteLogger.info(
      "🔍 [DEBUG-PROCESS] processTaskResult受け取った引数詳細:",
      {
        taskId: taskId,
        hasTask: !!task,
        taskKeys: task ? Object.keys(task) : null,
        taskColumn: task?.column,
        taskRow: task?.row,
        taskAiType: task?.aiType,
        hasResult: !!result,
        resultKeys: result ? Object.keys(result) : null,
        resultSuccess: result?.success,
        resultSuccessType: typeof result?.success,
        hasResultResponse: !!result?.response,
        resultResponseType: result?.response ? typeof result?.response : null,
        resultResponseLength: result?.response ? result?.response.length : 0,
        resultResponsePreview: result?.response
          ? result?.response.substring(0, 100) + "..."
          : null,
        hasResultResult: !!result?.result,
        resultResultResponse: result?.result?.response,
        timestamp: new Date().toISOString(),
      },
    );

    try {
      // スプレッドシート書き込みはWindowLifecycleManager.handleTaskCompletionで実行される
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
    // 1. タスクに直接logCellが設定されている場合はそれを使用
    if (task.logCell) {
      return task.logCell;
    }

    // 2. taskGroupのログ列を使用してセル参照を計算
    if (
      task.taskGroup &&
      task.taskGroup.columns &&
      task.taskGroup.columns.log &&
      task.row
    ) {
      return `${task.taskGroup.columns.log}${task.row}`;
    }

    // 3. ログ列が設定されていない場合は null を返す
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

  // executeStep3関数定義完了
  return results;
}

// ステップ4実行関数をグローバルに公開
try {
  ExecuteLogger.info("🔧 [DEBUG] executeStep3関数グローバル公開開始:", {
    executeStep3Type: typeof executeStep3,
    executeStep3Exists: typeof executeStep3 === "function",
    executeStep3Name: executeStep3?.name,
    windowAvailable: typeof window !== "undefined",
  });

  if (typeof window !== "undefined" && typeof executeStep3 === "function") {
    window.executeStep3 = executeStep3;

    // 即座に検証
    ExecuteLogger.info(
      "✅ [DEBUG] window.executeStep3エクスポート完了・検証:",
      {
        windowExecuteStep4Type: typeof window.executeStep3,
        windowExecuteStep4Exists: typeof window.executeStep3 === "function",
        windowExecuteStep4Name: window.executeStep3?.name,
        canCallFunction: !!(
          window.executeStep3 && typeof window.executeStep3 === "function"
        ),
        globalAccess: typeof globalThis?.executeStep3 === "function",
      },
    );
  } else {
    throw new Error(
      `関数公開失敗: executeStep3=${typeof executeStep3}, window=${typeof window}`,
    );
  }
} catch (error) {
  log.error("[3-4] ❌ [step3-tasklist.js] executeStep3関数公開エラー:", error);
  if (typeof window !== "undefined") {
    window.step4FileError = error.message;
  }
}

ExecuteLogger.debug("🔍 [DEBUG] step4-execute.js 読み込み開始");

ExecuteLogger.debug("✅ [DEBUG] クラス定義完了:", "AIAutomationLoader");
ExecuteLogger.debug("✅ [DEBUG] クラス定義完了:", "TaskGroupTypeDetector");
ExecuteLogger.debug("✅ [DEBUG] クラス定義完了:", "WindowController");
ExecuteLogger.debug("✅ [DEBUG] クラス定義完了:", "SpreadsheetDataManager");
ExecuteLogger.debug("✅ [DEBUG] クラス定義完了:", "DetailedLogManager");
ExecuteLogger.debug("✅ [DEBUG] クラス定義完了:", "WindowLifecycleManager");
ExecuteLogger.debug("✅ [DEBUG] クラス定義完了:", "SpecialTaskProcessor");
async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readSpreadsheet(range, retryCount = 0) {
  log.info(`[Helper] スプレッドシート読み込み: ${range}`);

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

        log.warn(
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
    log.info(
      `[Helper] 読み込み成功: ${data.values ? data.values.length : 0}行取得`,
    );

    return data;
  } catch (error) {
    log.error("[Helper] スプレッドシート読み込みエラー:", error);
    throw error;
  }
}

/**
 * スプレッドシート全体のデータを取得（Step3が期待する2次元配列形式）
 * @returns {Promise<Array>} スプレッドシートの2次元配列データ
 */
async function readFullSpreadsheet() {
  // DEBUG: readFullSpreadsheet関数実行開始

  log.info("[Helper] スプレッドシート全体データ取得開始");

  try {
    if (!window.globalState || !window.globalState.spreadsheetId) {
      throw new Error("スプレッドシートIDが見つかりません");
    }

    // シート名を取得
    const sheetName =
      window.globalState.sheetName || `シート${window.globalState.gid || "0"}`;

    // 全体範囲を取得（A1:ZZ1000の範囲で十分なデータを取得）
    const fullRange = `'${sheetName}'!A1:ZZ1000`;
    const data = await readSpreadsheet(fullRange);

    if (!data || !data.values) {
      log.warn("[Helper] スプレッドシートデータが空です");
      return [];
    }

    // ログバッファに集約
    const logData = {
      取得行数: data.values.length,
      "データサンプル（最初の3行）": data.values.slice(0, 3),
    };
    log.info(`[Helper] スプレッドシート全体データ取得完了:`, logData);

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

      // log.debug("🔍 [DEBUG] データ形状詳細（統合）:", debugLog);
    } catch (debugError) {
      log.error("❌ [DEBUG] デバッグ情報の出力エラー:", {
        message: debugError.message,
        stack: debugError.stack,
        lineNumber: debugError.lineNumber,
      });
    }

    return data.values;
  } catch (error) {
    log.error("[Helper] スプレッドシート全体データ取得エラー:", error);
    throw error;
  }
}

async function createTaskList(taskGroup, isFirstRun = false) {
  log.info("[Helper] タスクリスト作成開始:", {
    グループ番号: taskGroup?.groupNumber,
    グループタイプ: taskGroup?.groupType,
    列情報: taskGroup?.columns,
    dataStartRow: taskGroup?.dataStartRow,
    初回実行: isFirstRun
      ? "はい（作業中マーカー削除あり）"
      : "いいえ（通常処理）",
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
    log.info("[Helper] スプレッドシート全体データを取得中...");
    const spreadsheetData = await readFullSpreadsheet();

    if (!spreadsheetData || spreadsheetData.length === 0) {
      log.warn(
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
    log.info(
      "[createTaskList] [Step 5-3-前処理] 行制御・列制御情報を取得中...",
    );

    let rowControls = [];
    let columnControls = [];

    try {
      // Step 5-3-1: 行制御をチェック
      rowControls = window.Step3TaskList.getRowControl(spreadsheetData);

      // 🔧 [OFFSET-FIX] createTaskList用のdataStartRowオフセット適用
      // 注意：spreadsheetDataは全体データなので、dataStartRowオフセットは不要
      // rowControlsは既に正しい行番号を持っている

      log.info("[createTaskList] [Step 5-3-1] 行制御情報取得完了:", {
        制御数: rowControls.length,
        詳細: rowControls.map((c) => `${c.type}制御: ${c.row}行目`),
        備考: "全体データからの行制御取得（オフセット不要）",
      });

      // Step 5-3-2: 列制御の再チェック（タスクグループ作成後の追加フィルタ）
      const columnControlRow =
        window.globalState.setupResult?.columnControlRow || 4;
      columnControls = window.Step3TaskList.getColumnControl(
        spreadsheetData,
        columnControlRow,
      );
      log.info("[createTaskList] [Step 5-3-2] 列制御情報取得完了:", {
        制御数: columnControls.length,
        制御行: columnControlRow,
        詳細: columnControls.map((c) => `${c.type}制御: ${c.column}列`),
      });
    } catch (error) {
      log.error("[createTaskList] [Step 5-3-前処理] 制御情報取得エラー:", {
        エラーメッセージ: error.message,
        スタック: error.stack,
      });
      // エラーが発生しても処理を継続
    }

    // Step 5-3-3: 列制御チェック（タスクグループレベルでの追加フィルタリング）
    if (columnControls.length > 0) {
      log.info("[createTaskList] [Step 5-3-3] 列制御チェック実行中...");

      if (
        !window.Step3TaskList.shouldProcessColumn(taskGroup, columnControls)
      ) {
        log.info("[createTaskList] [Step 5-3-3] タスクグループ除外:", {
          グループ番号: taskGroup.groupNumber,
          理由: "列制御により除外（この列から処理/この列の処理後に停止/この列のみ処理）",
          グループ列: taskGroup?.columns?.prompts,
          列制御: columnControls.map((c) => `${c.type}:${c.column}`),
        });
        return []; // このタスクグループは処理しない
      } else {
        log.info("[createTaskList] [Step 5-3-3] タスクグループ通過:", {
          グループ番号: taskGroup.groupNumber,
          理由: "列制御を通過",
        });
      }
    } else {
      log.info(
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
      isFirstRun: isFirstRun, // 初回実行フラグを追加
    };

    // DEBUG: Step3に渡すパラメータ

    // ログバッファを一つのログとして出力
    // log.info(`[Step5-Loop] [統合ログ]\n${logBuffer.join("\n")}`);

    // generateTaskList内でaddLogが使われているため、グローバルに定義
    if (typeof window.addLog === "undefined") {
      window.addLog = (message, data) => {
        if (data) {
          log.info(`[Step3-TaskList] ${message}:`, data);
        } else {
          log.info(`[Step3-TaskList] ${message}`);
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

    log.info(`[Helper] タスクリスト作成完了: ${tasks.length}件のタスク`);
    if (tasks.length > 0) {
      log.info("[Helper] 生成されたタスクサンプル:", tasks.slice(0, 2));
    } else {
      log.warn(
        "[Helper] ⚠️ 0件のタスクが生成されました。以下を確認してください:",
      );
      log.warn("  - taskGroup.columns.prompts:", taskGroup?.columns?.prompts);
      log.warn("  - プロンプトデータの存在確認が必要");
    }

    return tasks;
  } catch (error) {
    log.error("[Helper] タスクリスト作成エラー:", {
      エラーメッセージ: error.message,
      スタック: error.stack,
      taskGroup: taskGroup,
      "window.Step3TaskList": !!window.Step3TaskList,
    });
    throw error;
  }
}

async function executeTasks(tasks, taskGroup) {
  log.info(`[Helper] タスク実行開始: ${tasks.length}件`, {
    グループ番号: taskGroup?.groupNumber,
    タスクタイプ: taskGroup?.taskType,
    パターン: taskGroup?.pattern,
  });

  // 🔍 デバッグ: 関数開始直後のログ
  // DEBUG: executeTasks関数に入りました

  try {
    // step4-execute.jsのexecuteStep3関数を利用
    // DEBUG: executeStep3チェック開始
    // DEBUG: executeStep3呼び出し前チェック

    if (!window.executeStep3) {
      log.error("[3-4] executeStep3が見つかりません！");
      throw new Error("executeStep3関数が利用できません");
    }

    // DEBUG: executeStep3が見つかりました

    if (!tasks || tasks.length === 0) {
      log.warn("[Helper] 実行するタスクがありません");
      return [];
    }

    // タスクリストを適切な形式に変換（Step4が期待する形式に統一）
    const formattedTasks = tasks.map((task, index) => {
      // DEBUG: Step3からのタスクデータ詳細

      // Step3で生成されたタスクの情報を使用（AI行の実際の値）
      // taskGroupのAI列の値も考慮（グループ2はClaude、グループ3はChatGPT等）
      let aiType = task.ai || task.aiType;

      // aiTypeが取得できない場合、taskGroupの回答列から推測
      if (!aiType && taskGroup?.answerColumnLetter) {
        const columnLetter = taskGroup.answerColumnLetter;
        // AG列 = Claude, P列 = ChatGPT, Q列 = Gemini 等のマッピング
        if (columnLetter === "AG" || columnLetter === "AK") {
          aiType = "Claude";
        } else if (columnLetter === "P" || columnLetter === "T") {
          aiType = "ChatGPT";
        } else if (columnLetter === "Q" || columnLetter === "U") {
          aiType = "Gemini";
        } else {
          aiType = "Claude"; // デフォルト
        }
        log.debug(`[3-4] [DEBUG] aiType推測: ${columnLetter}列 → ${aiType}`);
      }

      // それでも取得できない場合はデフォルト値
      aiType = aiType || "Claude";

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
        logCell: task.logCell, // 🔧 [FIX] ルートレベルにlogCellを追加
        spreadsheetData: {
          id: window.globalState.spreadsheetId,
          gid: window.globalState.gid,
          spreadsheetId: task.spreadsheetId || window.globalState.spreadsheetId, // Step3からの情報
          answerCell: task.answerCell, // Step3で計算された回答セル
          logCell: task.logCell, // Step3で計算されたログセル（互換性のため残す）
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

      log.info(`[Helper] タスク${index + 1}フォーマット完了:`, {
        taskId: formattedTask.id,
        row: formattedTask.row,
        aiType: formattedTask.aiType,
        プロンプト長: formattedTask.prompt.length,
        answerCell: formattedTask.answerCell, // 🔧 [FIX] 直接参照するように変更
        logCell: formattedTask.spreadsheetData.logCell,
      });

      return formattedTask;
    });

    log.info(`[Helper] フォーマット済みタスク: ${formattedTasks.length}件`);
    log.info("[Helper] 最初のタスク詳細:", formattedTasks[0]);

    // Step4バリデーション
    for (const task of formattedTasks) {
      if (!task.aiType) {
        throw new Error(`タスク${task.id}: aiTypeが未定義`);
      }
      if (!task.prompt) {
        throw new Error(`タスク${task.id}: promptが未定義`);
      }
      // 特殊タスク（report, genspark）の場合はanswerCellが不要なので警告を出さない
      const isSpecialTask =
        task.groupType === "report" ||
        task.groupType === "genspark" ||
        task.ai === "Report" ||
        task.ai === "Genspark";

      // デバッグログ：タスクの詳細情報を出力
      if (!task.spreadsheetData.answerCell) {
        // DEBUG: answerCell検証

        if (!isSpecialTask) {
          log.warn(`タスク${task.id}: answerCellが未定義（通常タスク）`);
        } else {
          log.info(`タスク${task.id}: answerCell不要（特殊タスク）`);
        }
      }
    }

    // Step4を実行
    log.info("[Helper] Step4実行中...");

    // 🔧 [UNIFICATION] タスク配列生成確認ログ
    log.info("📋 [UNIFICATION] processIncompleteTasks → executeStep3:", {
      データ形式: "タスク配列",
      タスク数: formattedTasks.length,
      グループ番号: formattedTasks[0]?.groupNumber || "不明",
      最初のタスクID: formattedTasks[0]?.id || "不明",
      プロンプトプレビュー:
        formattedTasks[0]?.prompt?.substring(0, 50) + "..." || "なし",
      executeStep3呼び出し: "step3経由（統一フロー）",
      生成方法: "generateTaskList経由",
    });

    // DEBUG: executeStep3呼び出し直前の詳細ログ
    // DEBUG: executeStep3を呼び出す直前

    // 🎯 [DEBUG] 最終チェック - より詳細な情報
    // DEBUG: executeStep3呼び出し直前の最終チェック

    try {
      // DEBUG: executeStep3を呼び出し
      log.debug(
        "[3-4] 🔍 [STEP3-EXEC] executeStep3呼び出し前のSimpleSheetsClient状態:",
        !!window.simpleSheetsClient,
      );
      const results = await window.executeStep3(formattedTasks);
      // DEBUG: executeStep3完了
      log.debug(
        "[3-4] ✅ [STEP3-EXEC] executeStep3実行完了後のSimpleSheetsClient状態:",
        !!window.simpleSheetsClient,
      );
      return results || [];
    } catch (step4Error) {
      log.error("[3-4] executeStep3でエラーが発生:", step4Error.message);
      throw step4Error;
    }
  } catch (error) {
    log.error("⚠️ [DEBUG] エラー詳細:", {
      message: error.message,
      stack: error.stack,
      name: error.name,
      cause: error.cause,
    });

    log.error("[Helper] タスク実行エラー:", {
      エラーメッセージ: error.message,
      スタック: error.stack,
      タスク数: tasks?.length,
      グループ情報: {
        番号: taskGroup?.groupNumber,
        タイプ: taskGroup?.taskType,
      },
      "window.executeStep3存在": !!window.executeStep3,
    });
    throw error;
  }
}

// ========================================
// Export to window for global access
// ========================================
if (typeof window !== "undefined") {
  window.executeStep3 = executeStep3;

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

  // WindowLifecycleManagerクラスをエクスポートとインスタンス化
  window.WindowLifecycleManager = WindowLifecycleManager;
  window.windowLifecycleManager = new WindowLifecycleManager();

  ExecuteLogger.info("✅ WindowLifecycleManager インスタンス作成完了", {
    hasHandleTaskCompletion:
      typeof window.windowLifecycleManager.handleTaskCompletion === "function",
    hasWriteResultToSpreadsheet:
      typeof window.windowLifecycleManager.writeResultToSpreadsheet ===
      "function",
    hasExecuteWithRetry:
      typeof window.windowLifecycleManager.executeWithRetry === "function",
  });

  // タスク実行関連の関数をエクスポート
  window.readSpreadsheet = readSpreadsheet;
  window.readFullSpreadsheet = readFullSpreadsheet;
  window.createTaskList = createTaskList;
  window.executeTasks = executeTasks;

  ExecuteLogger.info("✅ executeStep3 exported to window");
  ExecuteLogger.info(
    `✅ WindowController status: ${window.windowController ? "initialized" : "not initialized"}`,
  );
  ExecuteLogger.info(
    `✅ WindowLifecycleManager status: ${window.windowLifecycleManager ? "initialized" : "not initialized"}`,
  );
}

// ========================================
// ファイル読み込み完了通知
// ========================================
try {
  log.debug("[3-4] ✅ [step3-tasklist.js] ファイル読み込み完了", {
    executeStep3Defined: typeof executeStep3,
    windowExecuteStep4: typeof window.executeStep3,
    timestamp: new Date().toISOString(),
    windowObject: !!window,
    chromeApis: {
      windows: !!chrome?.windows,
      tabs: !!chrome?.tabs,
      scripting: !!chrome?.scripting,
    },
  });

  // グローバルエラーフラグをリセット
  if (typeof window !== "undefined") {
    window.step4FileError = null;
  }
} catch (error) {
  log.error(
    "[3-4] ❌ [step3-tasklist.js] ファイル読み込み完了時エラー:",
    error,
  );
  if (typeof window !== "undefined") {
    window.step4FileError = error.message;
  }
}
