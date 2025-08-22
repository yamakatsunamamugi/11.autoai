// stream-processor.js - 並列ストリーミング処理

// ReportManagerを動的にインポート
// Chrome拡張機能環境でのES6モジュール制限のため動的インポートを使用
let ReportManager = null;
let SpreadsheetLogger = null;

async function getReportManager() {
  if (!ReportManager) {
    try {
      const module = await import('../report/report-manager.js');
      ReportManager = module.ReportManager || module.default;
      console.log('[StreamProcessor] ReportManagerを動的にインポートしました');
    } catch (error) {
      console.warn('[StreamProcessor] ReportManagerのインポートに失敗、フォールバックを使用', error);
      return null;
    }
  }
  return ReportManager;
}

async function getSpreadsheetLogger() {
  if (!SpreadsheetLogger) {
    try {
      // Service Worker環境では動的インポートが使用できないため、
      // グローバルに登録されたSpreadsheetLoggerを取得
      if (globalThis.SpreadsheetLogger) {
        SpreadsheetLogger = globalThis.SpreadsheetLogger;
        console.log('[StreamProcessor] グローバルからSpreadsheetLoggerを取得しました');
      } else if (globalThis.spreadsheetLogger) {
        SpreadsheetLogger = globalThis.spreadsheetLogger.constructor;
        console.log('[StreamProcessor] グローバルインスタンスからSpreadsheetLoggerクラスを取得しました');
      } else {
        console.warn('[StreamProcessor] SpreadsheetLoggerがグローバルに見つかりません');
        return null;
      }
    } catch (error) {
      console.warn('[StreamProcessor] SpreadsheetLoggerの取得に失敗', error);
      return null;
    }
  }
  return SpreadsheetLogger;
}

/**
 * StreamProcessor - タスクの並列ストリーミング処理を管理
 *
 * ■ 並列ストリーミング処理の仕様:
 * 1. 最初は第1列グループ（例:D列グループ）のみから開始
 * 2. 各列グループ内では上から下へ順次処理（同じウィンドウを使い回す）
 * 3. 前の列グループの同じ行の回答が記載完了したら、次の列グループの同じ行を開始
 * 4. 結果として左上から右下へ斜めに波が広がるように処理が進行
 * 
 * ■ 具体例（D,I,N,R,V列の5つの列グループの場合）:
 * 
 * 時刻T1: D9開始
 * 時刻T2: D9完了→E,F,G列に記載 → D10開始（同じウィンドウ）
 * 時刻T3: D9記載完了により → I9開始（新規ウィンドウ）
 * 時刻T4: D10完了→記載 → D11開始
 * 時刻T5: I9完了→J,K,L列に記載 → I10開始 & D10記載完了により→I10待機
 * 時刻T6: I9記載完了により → N9開始（新規ウィンドウ）
 * 
 * ■ 処理イメージ:
 * ```
 * 　　D列　I列　N列　R列　V列
 * 9行: ①→②→③→④→⑤
 * 10行: ②→③→④→⑤→⑥  
 * 11行: ③→④→⑤→⑥→⑦
 * 12行: ④→⑤→⑥→⑦→⑧
 * ```
 * ※数字は処理開始の順序
 * 
 * ■ ウィンドウ管理:
 * - 最大4つのウィンドウを並列使用
 * - 各列グループごとに1つのウィンドウを占有
 * - 列グループの全行完了後、ウィンドウを解放
 */
// DynamicConfigManager import削除 - スプレッドシート設定を直接使用するため不要

class StreamProcessor {
  constructor(dependencies = {}) {
    // Node.js環境でのテスト用にglobalThisを使用
    const globalContext = typeof self !== "undefined" ? self : globalThis;
    this.windowManager =
      dependencies.windowManager || globalContext.aiWindowManager;
    this.modelManager =
      dependencies.modelManager || globalContext.modelManager;
    this.logger = dependencies.logger || console;
    
    // DynamicConfigManager削除 - スプレッドシート設定を直接使用するため不要
    
    // SpreadsheetLoggerのインスタンスを初期化
    this.spreadsheetLogger = null;
    this.initializeSpreadsheetLogger();

    // ウィンドウ管理状態
    this.activeWindows = new Map(); // windowId -> windowInfo
    this.windowPositions = new Map(); // position(0-3) -> windowId
    this.columnWindows = new Map(); // column -> windowId (列とウィンドウの対応)
    this.maxConcurrentWindows = 4;

    // タスク管理状態
    this.taskQueue = new Map(); // column -> tasks[]
    this.currentRowByColumn = new Map(); // column -> currentRowNumber
    this.completedTasks = new Set(); // taskId
    
    // 記載完了管理（並列ストリーミング用）
    this.writtenCells = new Map(); // `${column}${row}` -> true (記載完了したセル)
    
    // 3種類AIグループ完了追跡
    this.groupCompletionTracker = new Map(); // `${groupId}_${row}` -> { required: Set(['chatgpt', 'claude', 'gemini']), completed: Set() }
    
    // 待機中の列管理
    this.waitingColumns = new Set(); // 空きポジション待機中の列

    // 処理状態
    this.isProcessing = false;
    this.spreadsheetData = null;
    
    // 3種類AI実行制御
    this.activeThreeTypeGroupId = null; // 実行中の3種類AIグループID
    
    // ペンディングレポートタスク管理
    this.pendingReportTasks = new Set(); // 待機中のレポートタスク
    this.reportCheckInterval = null; // レポートチェック用タイマー
  }

  /**
   * SpreadsheetLoggerを非同期で初期化
   */
  async initializeSpreadsheetLogger() {
    try {
      const LoggerClass = await getSpreadsheetLogger();
      if (LoggerClass) {
        this.spreadsheetLogger = globalThis.spreadsheetLogger || new LoggerClass(this.logger);
        if (!globalThis.spreadsheetLogger) {
          globalThis.spreadsheetLogger = this.spreadsheetLogger;
        }
        this.logger.log('[StreamProcessor] SpreadsheetLoggerを初期化しました');
      }
    } catch (error) {
      this.logger.warn('[StreamProcessor] SpreadsheetLogger初期化エラー:', error.message);
    }
  }

  /**
   * タスクリストをストリーミング処理で実行
   * @param {TaskList} taskList - タスクリスト
   * @param {Object} spreadsheetData - スプレッドシートデータ
   * @param {Object} options - オプション設定
   * @param {string} options.outputTarget - 出力先 ('spreadsheet' | 'log')
   * @param {boolean} options.testMode - テストモード（互換性のため残す）
   * @returns {Promise<Object>} 処理結果
   */
  async processTaskStream(taskList, spreadsheetData, options = {}) {
    // outputTargetの設定（testModeからの移行をサポート）
    const outputTarget = options.outputTarget || (options.testMode ? 'log' : 'spreadsheet');
    
    this.logger.log("[StreamProcessor] ストリーミング処理開始", {
      totalTasks: taskList.tasks.length,
      outputTarget: outputTarget,
      testMode: options.testMode || false
    });

    this.isProcessing = true;
    this.spreadsheetData = spreadsheetData;
    this.outputTarget = outputTarget;
    this.isTestMode = options.testMode || (outputTarget === 'log');
    this.isFirstTaskProcessed = false; // 最初のタスクフラグを追加

    try {
      // タスクを列・行でグループ化
      this.organizeTasks(taskList);

      // ■ Sequential実行: 最初の1列のみ開始（根本的修正）
      const columns = Array.from(this.taskQueue.keys()).sort();
      this.logger.log(`[StreamProcessor] Sequential実行開始`);
      this.logger.log(`[StreamProcessor] 列グループ: ${columns.join(' → ')}`);
      
      // 最初のタスクが3種類AIグループかチェック
      const firstTask = this.taskQueue.get(columns[0])?.[0];
      const isThreeTypeGroup = firstTask?.multiAI && firstTask?.groupId;
      
      if (isThreeTypeGroup) {
        this.logger.log(`[StreamProcessor] 3種類AIグループを検出: 3列のみ同時開始`);
        // 実行中の3種類AIグループIDを記録
        this.activeThreeTypeGroupId = firstTask.groupId;
        this.logger.log(`[StreamProcessor] アクティブな3種類AIグループ: ${this.activeThreeTypeGroupId}`);
        
        // 3種類AIの場合のみ3列同時開始
        const maxStart = Math.min(columns.length, 3);
        for (let i = 0; i < maxStart; i++) {
          this.logger.log(`[StreamProcessor] ${columns[i]}列を開始 (3種類AIグループ: ${i + 1}/3)`);
          this.startColumnProcessing(columns[i]).catch(error => {
            this.logger.error(`[StreamProcessor] ${columns[i]}列エラー`, {
              message: error.message,
              stack: error.stack,
              name: error.name,
            });
          });
        }
      } else {
        this.logger.log(`[StreamProcessor] Sequential実行: 最初の1列のみ開始`);
        // 通常のAIタスクの場合は1列のみ開始
        if (columns.length > 0) {
          this.logger.log(`[StreamProcessor] ${columns[0]}列を開始`);
          this.startColumnProcessing(columns[0]).catch(error => {
            this.logger.error(`[StreamProcessor] ${columns[0]}列エラー`, {
              message: error.message,
              stack: error.stack,
              name: error.name,
              column: columns[0],
              errorString: error.toString()
            });
          });
        }
      }

      return {
        success: true,
        processedColumns: Array.from(this.taskQueue.keys()),
        totalWindows: this.activeWindows.size,
      };
    } catch (error) {
      this.logger.error("[StreamProcessor] 処理エラー", error);
      throw error;
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * タスクを列・行で整理
   * @param {TaskList} taskList
   */
  organizeTasks(taskList) {
    // 列ごとにタスクをグループ化し、行番号でソート
    taskList.tasks.forEach((task) => {
      const column = task.column;
      if (!this.taskQueue.has(column)) {
        this.taskQueue.set(column, []);
        this.currentRowByColumn.set(column, 0);
      }
      this.taskQueue.get(column).push(task);
    });

    // 各列のタスクを行番号でソート
    this.taskQueue.forEach((tasks, column) => {
      tasks.sort((a, b) => a.row - b.row);
    });

    this.logger.log("[StreamProcessor] タスク整理完了", {
      columns: Array.from(this.taskQueue.keys()),
      totalTasks: taskList.tasks.length,
    });

    // 各列のタスク詳細を表示
    this.taskQueue.forEach((tasks, column) => {
      this.logger.log(`[StreamProcessor] ${column}列のタスク: ${tasks.length}件`, {
        tasks: tasks.map(task => ({
          id: task.id.substring(0, 8),
          cell: `${task.column}${task.row}`,
          aiType: task.aiType
        }))
      });
    });
  }

  /**
   * 最初の列を取得（アルファベット順）
   */
  getFirstColumn() {
    const columns = Array.from(this.taskQueue.keys()).sort();
    return columns[0] || null;
  }

  /**
   * 列の処理を開始
   * @param {string} column
   */
  async startColumnProcessing(column) {
    // 重複処理チェック（既にウィンドウがある場合はスキップ）
    if (this.columnWindows.has(column)) {
      this.logger.log(`[StreamProcessor] ${column}列は既にウィンドウがあるためスキップ`);
      return;
    }
    
    const startTime = Date.now();
    this.logger.log(`[StreamProcessor] 📋 startColumnProcessing開始: ${column}列 (${startTime})`);
    
    const tasks = this.taskQueue.get(column);
    if (!tasks || tasks.length === 0) {
      return;
    }

    const currentIndex = this.currentRowByColumn.get(column) || 0;
    if (currentIndex >= tasks.length) {
      // この列のタスクが全て完了したら、ウィンドウを閉じる
      await this.closeColumnWindow(column);
      return;
    }

    // 3種類AI特別処理を削除：全てのAIを独立したタスクとして扱う

    const currentTask = tasks[currentIndex];

    // レポートタスクの場合は特別処理（ウィンドウを開かない）
    if (currentTask.taskType === "report") {
      this.logger.log(`[StreamProcessor] レポートタスクを直接実行: ${column}${currentTask.row}`);
      
      // ダミーのウィンドウIDを設定（タスク処理の一貫性のため）
      const dummyWindowId = -1;
      this.columnWindows.set(column, dummyWindowId);
      
      // レポートタスクを直接実行
      await this.executeReportTask(currentTask, dummyWindowId);
      return;
    }

    // 常に新しいウィンドウを開く（既存ウィンドウは使い回さない）
    // テスト用のpreferredPositionがある場合はそれを使用、なければ自動検索
    const position = currentTask.preferredPosition !== undefined 
      ? currentTask.preferredPosition 
      : this.findAvailablePosition();
    if (position === -1) {
      this.logger.log(
        `[StreamProcessor] 空きポジションがありません。待機中...`,
      );
      this.waitingColumns.add(column);
      return;
    }

    // 待機状態をクリア
    this.waitingColumns.delete(column);
    
    await this.openWindowForColumn(column, currentTask, position);
  }

  /**
   * 列用のウィンドウを開く
   * @param {string} column
   * @param {Task} task
   * @param {number} position
   */
  async openWindowForColumn(column, task, position) {
    const openTime = Date.now();
    this.logger.log(`[StreamProcessor] 🚀 ${column}列用のウィンドウを開く (position=${position}) ${openTime}`);
    this.logger.log(`[StreamProcessor] 位置設定前のwindowPositions:`, Array.from(this.windowPositions.keys()));

    const url = this.determineAIUrl(task.aiType, column);
    const screenInfo = await this.getScreenInfo();
    const windowPosition = this.calculateWindowPosition(position, screenInfo);

    try {
      // chrome.windows APIの存在確認
      if (typeof chrome === 'undefined' || !chrome.windows) {
        throw new Error('chrome.windows API is not available. This must run in a Service Worker context.');
      }

      const window = await chrome.windows.create({
        url: url,
        type: "popup",
        focused: false,
        ...windowPosition,
      });

      const windowInfo = {
        windowId: window.id,
        column: column,
        position: position,
        aiType: task.aiType,
        createdAt: new Date(),
      };

      this.activeWindows.set(window.id, windowInfo);
      this.windowPositions.set(position, window.id); // 仮予約を本予約に変更
      this.columnWindows.set(column, window.id);

      this.logger.log(`[StreamProcessor] 🔧 位置設定後のwindowPositions:`, Array.from(this.windowPositions.keys()));
      this.logger.log(
        `[StreamProcessor] ウィンドウ作成: ${column}列 (${task.aiType}) - 位置: ${["左上", "右上", "左下", "右下"][position]} (windowId: ${window.id})`,
      );

      // ページの読み込みとコンテンツスクリプトのロードを待機
      this.logger.log(`[StreamProcessor] ページ読み込み待機中...`);
      await this.waitForContentScriptReady(window.id);

      // 自動化スクリプトを注入
      await this.injectAutomationScripts(window.id, task.aiType);

      // 最初のタスクを実行
      await this.executeTaskInWindow(task, window.id);
    } catch (error) {
      this.logger.error(`[StreamProcessor] ウィンドウ作成エラー`, {
        message: error.message,
        stack: error.stack,
        name: error.name,
        url: url,
        position: position,
        column: column,
        taskAiType: task.aiType,
        errorString: error.toString()
      });
      throw error; // エラーを再スロー
    }
  }

  /**
   * 既存のウィンドウでタスクを実行
   * @param {Task} task
   * @param {number} windowId
   */
  async executeTaskInWindow(task, windowId) {
    const windowInfo = this.activeWindows.get(windowId);
    if (!windowInfo) return;

    // 3種類AIグループの追跡を初期化
    this.initializeGroupTracking(task);

    const cellPosition = `${task.column}${task.row}`;
    
    this.logger.log(
      `[StreamProcessor] 📍 タスク実行: ${cellPosition}セル (Window: ${windowId})`,
      {
        セル: cellPosition,
        taskAiType: task.aiType,
        windowAiType: windowInfo.aiType,
        taskId: task.id,
        prompt: task.prompt?.substring(0, 50) + '...',
        multiAI: task.multiAI,
        groupId: task.groupId,
        column: task.column,
        row: task.row
      }
    );

    // レポートタスクの場合は特別な処理
    if (task.taskType === "report") {
      await this.executeReportTask(task, windowId);
      return;
    }

    // テストモード（waitResponse=false or getResponse=false）の場合はプロンプト送信をスキップ
    if (task.waitResponse === false || task.getResponse === false) {
      this.logger.log(`[StreamProcessor] テストモード: プロンプト送信をスキップしてランダム待機`);
      
      // ランダム待機（5-15秒）
      const waitTime = Math.floor(Math.random() * (15000 - 5000 + 1)) + 5000;
      this.logger.log(`[StreamProcessor] ${waitTime}ms待機中...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      
      // ダミー結果でタスク完了
      const dummyResult = {
        success: true,
        response: `テストモード完了 (${waitTime}ms待機)`,
        aiType: task.aiType,
        taskId: task.id
      };
      
      await this.onTaskCompleted(task, windowId, dummyResult);
      return;
    }

    try {
      // ウィンドウのタブを取得
      const tabs = await chrome.tabs.query({ windowId });
      if (!tabs || tabs.length === 0) {
        throw new Error(`ウィンドウ ${windowId} にタブが見つかりません`);
      }

      const tabId = tabs[0].id;

      // 🔥 実行時にUIの最新選択肢を再取得（テスト環境と同様）
      let finalModel = task.model;
      let finalOperation = task.specialOperation;
      
      // DynamicConfig上書きを削除 - スプレッドシートの設定をそのまま使用
      this.logger.log(`[StreamProcessor] 📊 スプレッドシート設定適用: ${task.aiType} -> モデル:${finalModel}, 機能:${finalOperation}`);

      // AITaskHandlerを直接呼び出す（Service Worker内なので）
      // aiTaskHandlerはbackground.jsでimportされているため、globalThisから取得
      const aiTaskHandler = globalThis.aiTaskHandler || (await import('../../handlers/ai-task-handler.js')).aiTaskHandler;
      
      const result = await aiTaskHandler.handleExecuteAITask({
        tabId,
        prompt: task.prompt,
        taskId: task.id,
        timeout: 180000,
        model: finalModel,  // UI優先のモデル情報
        specialOperation: finalOperation,  // UI優先の機能情報
        aiType: task.aiType,  // AI種別も明示的に渡す
        cellInfo: {  // セル位置情報を追加
          column: task.column,
          row: task.row
        }
      }, null);

      const cellPosition = `${task.column}${task.row}`;
      
      this.logger.log(
        `[StreamProcessor] ✅ タスク完了: ${cellPosition}セル`,
        {
          セル: cellPosition,
          aiType: result.aiType,
          responseLength: result.response?.length || 0,
          column: task.column,
          row: task.row,
          taskId: task.id
        },
      );

      // タスク完了処理
      await this.onTaskCompleted(task, windowId, result);
    } catch (error) {
      this.logger.error(
        `[StreamProcessor] タスク実行エラー: ${task.column}${task.row}`,
        {
          error: error.message,
          stack: error.stack,
          taskId: task.id,
          prompt: task.prompt?.substring(0, 100) + "...",
          windowId: windowId,
        },
      );

      // エラーの場合は無限ループを防ぐため、次のタスクに進まない
      // TODO: 再試行ロジックを実装
      this.logger.error(
        `[StreamProcessor] タスクをスキップします: ${task.column}${task.row}`,
      );

      // エラーカウンターを追加（無限ループ防止）
      if (!this.errorCount) this.errorCount = {};
      const taskKey = `${task.column}${task.row}`;
      this.errorCount[taskKey] = (this.errorCount[taskKey] || 0) + 1;

      // 3回以上エラーが発生したらスキップ
      if (this.errorCount[taskKey] >= 3) {
        this.logger.error(
          `[StreamProcessor] エラー上限に達しました。タスクを完全にスキップ: ${taskKey}`,
        );
        delete this.errorCount[taskKey];
        // 次のタスクに進むが、エラーフラグ付き
        await this.onTaskCompleted(task, windowId, {
          success: false,
          error: `エラー上限到達: ${error.message}`,
          skipped: true,
        });
      }
      // それ以外は何もしない（リトライは別途実装）
    }
  }

  /**
   * 応答しないタスクを強制完了する（デッドロック回避）
   * @param {string} taskId - 強制完了するタスクID
   * @param {string} reason - 完了理由
   */
  forceCompleteTask(taskId, reason = "タイムアウト") {
    if (this.completedTasks.has(taskId)) return false;
    
    this.completedTasks.add(taskId);
    this.logger.log(`[StreamProcessor] 🚨 タスク強制完了: ${taskId} (理由: ${reason})`);
    return true;
  }

  /**
   * タスク完了時の処理
   * @param {Task} task
   * @param {number} windowId
   * @param {Object} result - タスク実行結果
   */
  async onTaskCompleted(task, windowId, result = {}) {
    const { column, row, id: taskId } = task;
    const cellPosition = `${column}${row}`;
    
    // ウィンドウIDをタスクに保存
    task.windowId = windowId;

    this.logger.log(`[StreamProcessor] 🎯 タスク完了処理開始: ${cellPosition}セル`, {
      セル: cellPosition,
      result: result.success ? "success" : "failed",
      skipped: result.skipped || false,
      windowId: windowId,
      hasResponse: !!result.response,
      column: column,
      row: row,
      taskId: taskId
    });

    // タスクを完了済みにマーク
    this.completedTasks.add(taskId);

    // 成功した場合の追加処理
    if (result.success) {
      // AIタスクの場合
      if (result.response && task.taskType === "ai") {
        if (this.outputTarget === 'log') {
          // ログ出力モード：ログに表示のみ
          this.logger.log(`[StreamProcessor] ログ出力: ${cellPosition}セル -> ${result.response.substring(0, 100)}...`);
        } else if (this.outputTarget === 'spreadsheet') {
          // スプレッドシート出力モード：スプレッドシートに書き込み（同期実行で完了を待つ）
          this.logger.log(`[StreamProcessor] スプレッドシート出力: ${cellPosition}セル -> ${result.response.substring(0, 100)}...`);
          
          try {
            // スプレッドシート書き込みを同期で実行（awaitで完了を待つ）
            await this.writeResultToSpreadsheet(task, result);
            this.logger.log(`[StreamProcessor] 📝 スプレッドシートに書き込み完了: ${cellPosition}セル`);
          } catch (error) {
            this.logger.error(`[StreamProcessor] ❌ 結果の保存エラー`, error);
            // エラーが発生してもタスク処理は継続
          }
        }
      }
      // レポートタスクの場合
      else if (result.reportUrl && task.taskType === "report") {
        if (this.outputTarget === 'spreadsheet') {
          this.logger.log(`[StreamProcessor] レポートURL書き込み: ${cellPosition}セル -> ${result.reportUrl}`);
          
          try {
            // レポートURLをスプレッドシートに書き込み
            if (globalThis.sheetsClient && this.spreadsheetData) {
              const { spreadsheetId, gid } = this.spreadsheetData;
              const range = `${task.column}${task.row}`;
              await globalThis.sheetsClient.updateCell(
                spreadsheetId,
                range,
                result.reportUrl,
                gid
              );
              this.logger.log(`[StreamProcessor] 📝 レポートURL書き込み完了: ${cellPosition}セル`);
              
              // レポート記載完了もマーク
              const cellKey = `${task.column}${task.row}`;
              this.writtenCells.set(cellKey, true);
            }
          } catch (error) {
            this.logger.error(`[StreamProcessor] ❌ レポートURL保存エラー`, error);
            // エラーが発生してもタスク処理は継続
          }
        }
      }
    }

    // 同じ列の次の行へ進む
    const currentIndex = this.currentRowByColumn.get(column) || 0;
    const nextIndex = currentIndex + 1;
    this.currentRowByColumn.set(column, nextIndex);

    // タスクが残っているか確認
    const tasks = this.taskQueue.get(column);
    const hasMoreTasks = tasks && nextIndex < tasks.length;

    this.logger.log(`[StreamProcessor] 次のタスク確認: ${column}列`, {
      currentIndex: currentIndex,
      nextIndex: nextIndex,
      totalTasks: tasks?.length || 0,
      hasMoreTasks: hasMoreTasks,
    });

    // ウィンドウクローズを一時的に保留
    // スプレッドシート記録完了後にクローズするため、ここではクローズ情報を保存
    const windowCloseInfo = {
      column,
      windowId,
      hasMoreTasks
    };
    
    // タスクにウィンドウクローズ情報を付与
    task._windowCloseInfo = windowCloseInfo;
    
    this.logger.log(`[StreamProcessor] 📋 ウィンドウクローズを保留: ${column}列 (スプレッドシート記録完了待ち)`);
    
    if (hasMoreTasks) {
      this.logger.log(`[StreamProcessor] 🔄 ${column}列の次のタスクあり`);
    } else {
      this.logger.log(`[StreamProcessor] 🎯 ${column}列の全タスク完了`);
    }

    // ■ 並列ストリーミング: 次の列の開始は記載完了後に行われる
    // （writeResultToSpreadsheet内のcheckAndStartNextColumnForRowで処理）
    // 従来のコードは削除し、記載完了ベースの制御に移行
  }

  /**
   * 結果をスプレッドシートに書き込む
   * @param {Task} task
   * @param {Object} result
   */
  async writeResultToSpreadsheet(task, result) {
    if (!globalThis.sheetsClient || !this.spreadsheetData) return;

    try {
      const { spreadsheetId, gid } = this.spreadsheetData;
      const answerColumn = task.column;
      const range = `${answerColumn}${task.row}`;

      // 応答を書き込み
      await globalThis.sheetsClient.updateCell(
        spreadsheetId,
        range,
        result.response,
        gid  // gidを渡してシート名を含む範囲にする
      );

      this.logger.log(`[StreamProcessor] 回答を書き込み: ${range}`);
      
      // 書き込み完了をマーク（3種類AI完了判定用）
      const answerCellKey = `${answerColumn}${task.row}`;
      this.writtenCells.set(answerCellKey, true);
      this.logger.log(`[StreamProcessor] ✅ writtenCellsに記録: ${answerCellKey}`);
      
      // ログを書き込み（SpreadsheetLoggerを使用）
      console.log(`📝 [StreamProcessor] ログ書き込み準備:`, {
        hasSpreadsheetLogger: !!this.spreadsheetLogger,
        hasWriteMethod: !!(this.spreadsheetLogger?.writeLogToSpreadsheet),
        taskId: task.id,
        row: task.row
      });
      
      if (this.spreadsheetLogger) {
        // URLを取得（Service Worker環境用）
        let currentUrl = 'N/A';
        try {
          // ウィンドウIDから実際のタブURLを取得
          if (task.windowId) {
            try {
              const tabs = await chrome.tabs.query({ windowId: task.windowId });
              if (tabs && tabs.length > 0) {
                currentUrl = tabs[0].url || 'N/A';
                console.log(`🌐 [StreamProcessor] 実際の作業 URL取得: ${currentUrl}`);
              }
            } catch (err) {
              console.warn(`⚠️ [StreamProcessor] URL取得エラー:`, err);
            }
          }
          
          // フォールバック: AIタイプからベースURLを生成
          if (currentUrl === 'N/A') {
            const urlMap = {
              'chatgpt': 'https://chatgpt.com/',
              'claude': 'https://claude.ai/',
              'gemini': 'https://gemini.google.com/'
            };
            currentUrl = urlMap[task.aiType?.toLowerCase()] || 'N/A';
          }
          
          // 3種類AIグループかどうか判定
          const isGroupTask = task.multiAI && task.groupId;
          let isLastInGroup = false;
          
          if (isGroupTask) {
            // グループ内の最後のタスクかどうか判定
            const groupTracker = this.groupCompletionTracker.get(`${task.groupId}_${task.row}`);
            if (groupTracker) {
              const completedCount = groupTracker.completed.size;
              isLastInGroup = (completedCount === 2); // すでに2つ完了していれば、これが3つ目（最後）
            }
          }
          
          await this.spreadsheetLogger.writeLogToSpreadsheet(task, {
            url: currentUrl,
            sheetsClient: globalThis.sheetsClient,
            spreadsheetId,
            gid,
            isFirstTask: !this.isFirstTaskProcessed,
            isGroupTask,
            isLastInGroup,
            onComplete: async (completedTask, logCell, error) => {
              // スプレッドシート記録完了後のコールバック
              if (!error) {
                this.logger.log(`[StreamProcessor] 📝 ログ記録完了コールバック実行: ${logCell}`);
                
                // ウィンドウクローズ情報があれば、ここでウィンドウを閉じる
                if (completedTask._windowCloseInfo) {
                  const { column: closeColumn, windowId: closeWindowId, hasMoreTasks: closeHasMoreTasks } = completedTask._windowCloseInfo;
                  
                  this.logger.log(`[StreamProcessor] 🚪 ウィンドウを閉じます: ${closeColumn}列, windowId: ${closeWindowId}`);
                  
                  // タスクが完了しているかチェック
                  const hasMoreTasksInColumn = closeHasMoreTasks;
                  
                  if (!hasMoreTasksInColumn) {
                    // この列のタスクが全て完了した場合のみウィンドウを閉じる
                    await this.closeColumnWindow(closeColumn);
                    this.logger.log(`[StreamProcessor] ✅ ウィンドウクローズ完了: ${closeColumn}列（全タスク完了）`);
                    
                    // ウィンドウが空いたので、利用可能な全ての列をチェックして開始
                    this.checkAndStartAvailableColumns().catch(checkError => {
                      this.logger.error(`[StreamProcessor] 利用可能列チェックエラー`, checkError);
                    });
                  } else {
                    this.logger.log(`[StreamProcessor] ⏸️ ウィンドウクローズをスキップ: ${closeColumn}列（まだタスクが残っている）`);
                  }
                }
              } else {
                this.logger.error(`[StreamProcessor] ログ記録エラー時のコールバック: ${error.message}`);
                
                // エラーが発生してもウィンドウは閉じる
                if (completedTask._windowCloseInfo) {
                  const { column: closeColumn } = completedTask._windowCloseInfo;
                  await this.closeColumnWindow(closeColumn);
                }
              }
            }
          });
          
          // 最初のタスク処理完了フラグを更新
          this.isFirstTaskProcessed = true;
          this.logger.log(`[StreamProcessor] ログを書き込み: ${task.logColumns?.[0] || 'B'}${task.row}`);
        } catch (logError) {
          // ログ書き込みエラーは警告として記録し、処理は続行
          console.error(`❌ [StreamProcessor] ログ書き込みエラー詳細:`, {
            error: logError,
            message: logError.message,
            stack: logError.stack,
            taskId: task.id,
            row: task.row,
            aiType: task.aiType,
            currentUrl,
            spreadsheetLogger: !!this.spreadsheetLogger
          });
          this.logger.warn(
            `[StreamProcessor] ログ書き込みエラー（処理は続行）`,
            {
              message: logError.message,
              taskId: task.id,
              row: task.row
            }
          );
        }
      }
      
      // ■ 記載完了を記録（並列ストリーミングの核心）
      const cellKey = `${task.column}${task.row}`;
      this.writtenCells.set(cellKey, true);
      this.logger.log(`[StreamProcessor] 記載完了マーク: ${cellKey}`);
      
      // ■ 3種類AIグループの完了状況を更新
      this.updateGroupCompletion(task);
      
      // ■ この記載により、次の列の同じ行を開始できるかチェック
      await this.checkAndStartNextColumnForRow(task.column, task.row);
      
    } catch (error) {
      this.logger.error(
        `[StreamProcessor] スプレッドシート書き込みエラー`,
        {
          message: error.message,
          stack: error.stack,
          name: error.name,
          errorString: error.toString()
        },
      );
    }
  }

  /**
   * Googleドキュメントを作成
   * @param {Task} task
   * @param {Object} result
   * @returns {Promise<Object>} ドキュメント情報
   */
  async createGoogleDocument(task, result) {
    if (!globalThis.docsClient) return null;

    try {
      const taskResult = {
        prompt: task.prompt,
        response: result.response,
        aiType: task.aiType,
        rowNumber: task.row,
        columnIndex: task.column,
      };

      const docInfo =
        await globalThis.docsClient.createDocumentFromTaskResult(taskResult);

      this.logger.log(`[StreamProcessor] ドキュメント作成: ${docInfo.url}`);

      return docInfo;
    } catch (error) {
      this.logger.error(`[StreamProcessor] ドキュメント作成エラー`, error);
      return null;
    }
  }


  /**
   * レポートタスクを実行
   * @param {Task} task
   * @param {number} windowId
   */
  async executeReportTask(task, windowId) {
    this.logger.log(
      `[StreamProcessor] レポートタスク実行: ${task.column}${task.row} (ソース: ${task.sourceColumn}, プロンプト: ${task.promptColumn})`,
    );

    // 依存タスクが完了しているか確認
    if (task.dependsOn && !this.completedTasks.has(task.dependsOn)) {
      this.logger.log(
        `[StreamProcessor] レポートタスクは依存タスク${task.dependsOn}の完了待ち、後で再試行`,
      );
      // レポートタスクを後で再試行するため、ペンディングリストに追加
      this.schedulePendingReportTask(task);
      // タスクを完了扱いにして次へ進む（ただし実際の処理はペンディング）
      await this.onTaskCompleted(task, windowId, {
        success: false,
        pending: true,
        reason: "waiting_dependency"
      });
      return;
    }
    
    // ソース列の記載が完了しているか確認
    const sourceCellKey = `${task.sourceColumn}${task.row}`;
    if (!this.writtenCells.has(sourceCellKey)) {
      this.logger.log(
        `[StreamProcessor] レポートタスクはソース${sourceCellKey}の記載待ち、後で再試行`,
      );
      // レポートタスクを後で再試行するため、ペンディングリストに追加
      this.schedulePendingReportTask(task);
      // タスクを完了扱いにして次へ進む（ただし実際の処理はペンディング）
      await this.onTaskCompleted(task, windowId, {
        success: false,
        pending: true,
        reason: "waiting_source"
      });
      return;
    }

    try {
      // レポート列の直前の列を確認
      const prevColumnIndex = this.columnToIndex(task.column) - 1;
      const prevColumnName = this.indexToColumn(prevColumnIndex);
      
      // メニュー行を正しく取得（spreadsheetDataから）
      const menuRowNumber = this.spreadsheetData?.menuRow?.index ? 
        this.spreadsheetData.menuRow.index + 1 : 3; // デフォルトは3行目（メニュー行）
      const prevColumnHeader = await this.getSpreadsheetCellValue(prevColumnName, menuRowNumber);
      
      this.logger.log(`[StreamProcessor] レポート列判定:`);
      this.logger.log(`  - レポート列: ${task.column}`);
      this.logger.log(`  - 直前列: ${prevColumnName}="${prevColumnHeader}"`);
      this.logger.log(`  - メニュー行: ${menuRowNumber}行目`);
      
      let answerText = "";
      let allAnswers = {};
      
      // シンプルな判定：直前列が「Gemini回答」なら3種類AI、それ以外は単独AI
      const isThreeTypeAI = prevColumnHeader && prevColumnHeader.includes("Gemini回答");
      
      this.logger.log(`[StreamProcessor] AI種別判定: ${isThreeTypeAI ? '3種類AI' : '単独AI'}`);
      
      if (isThreeTypeAI) {
        // 3種類AIの場合：ChatGPT回答、Claude回答、Gemini回答の3列を取得
        this.logger.log(`[StreamProcessor] 3種類AIレポート：ChatGPT回答、Claude回答、Gemini回答を取得`);
        
        // レポート列の前の3列が ChatGPT回答、Claude回答、Gemini回答 の順番
        const chatgptColumn = this.indexToColumn(prevColumnIndex - 2);  // 3列前 = ChatGPT回答
        const claudeColumn = this.indexToColumn(prevColumnIndex - 1);   // 2列前 = Claude回答
        const geminiColumn = prevColumnName;                            // 1列前 = Gemini回答
        
        // 各列のヘッダーを確認（検証用）
        const chatgptHeader = await this.getSpreadsheetCellValue(chatgptColumn, menuRowNumber);
        const claudeHeader = await this.getSpreadsheetCellValue(claudeColumn, menuRowNumber);
        const geminiHeader = await this.getSpreadsheetCellValue(geminiColumn, menuRowNumber);
        
        this.logger.log(`[StreamProcessor] 3種類AI列の配置確認:`);
        this.logger.log(`  - ${chatgptColumn}列: "${chatgptHeader}" (ChatGPT回答列)`);
        this.logger.log(`  - ${claudeColumn}列: "${claudeHeader}" (Claude回答列)`);
        this.logger.log(`  - ${geminiColumn}列: "${geminiHeader}" (Gemini回答列)`);
        
        // 各AIの回答を取得
        const chatgptAnswer = await this.getSpreadsheetCellValue(chatgptColumn, task.row);
        const claudeAnswer = await this.getSpreadsheetCellValue(claudeColumn, task.row);
        const geminiAnswer = await this.getSpreadsheetCellValue(geminiColumn, task.row);
        
        this.logger.log(`[StreamProcessor] 取得した回答の状況:`);
        this.logger.log(`  - ChatGPT(${chatgptColumn}${task.row}): ${chatgptAnswer ? `${chatgptAnswer.substring(0, 30)}...` : '(空)'}`);
        this.logger.log(`  - Claude(${claudeColumn}${task.row}): ${claudeAnswer ? `${claudeAnswer.substring(0, 30)}...` : '(空)'}`);
        this.logger.log(`  - Gemini(${geminiColumn}${task.row}): ${geminiAnswer ? `${geminiAnswer.substring(0, 30)}...` : '(空)'}`);
        
        // 警告：ヘッダーが想定と異なる場合
        if (!chatgptHeader?.includes('ChatGPT') || !claudeHeader?.includes('Claude') || !geminiHeader?.includes('Gemini')) {
          this.logger.warn(`[StreamProcessor] ⚠️ ヘッダーが想定と異なる可能性があります`);
          this.logger.warn(`  - 期待: ChatGPT回答、Claude回答、Gemini回答`);
          this.logger.warn(`  - 実際: ${chatgptHeader}、${claudeHeader}、${geminiHeader}`);
        }
        
        // 回答を整形（。の後に改行が2回未満の場合、2回改行を追加）
        const formatAnswer = (text) => {
          if (!text) return "(回答なし)";
          // 。の後に改行が0回または1回の場合、2回改行に置換
          return text.replace(/。(?!\n\n)/g, '。\n\n');
        };
        
        allAnswers = {
          chatgpt: chatgptAnswer || "",
          claude: claudeAnswer || "",
          gemini: geminiAnswer || ""
        };
        
        // 各AIの回答を確認（必ずChatGPT→Claude→Geminiの順番で）
        const formattedChatGPT = formatAnswer(chatgptAnswer || allAnswers.chatgpt || "");
        const formattedClaude = formatAnswer(claudeAnswer || allAnswers.claude || "");
        const formattedGemini = formatAnswer(geminiAnswer || allAnswers.gemini || "");
        
        // デバッグ: 各AIの回答が存在するか確認
        this.logger.log(`[StreamProcessor] レポート生成前の確認:`);
        this.logger.log(`  - ChatGPT回答あり: ${!!chatgptAnswer} (長さ: ${chatgptAnswer?.length || 0})`);
        this.logger.log(`  - Claude回答あり: ${!!claudeAnswer} (長さ: ${claudeAnswer?.length || 0})`);
        this.logger.log(`  - Gemini回答あり: ${!!geminiAnswer} (長さ: ${geminiAnswer?.length || 0})`);
        
        // 回答が全部空の場合の警告
        if (!chatgptAnswer && !claudeAnswer && !geminiAnswer) {
          this.logger.warn(`[StreamProcessor] ⚠️ すべてのAI回答が空です。スプレッドシートの内容を確認してください。`);
        }
        
        // レポート用に全回答を結合（必ずChatGPT→Claude→Geminiの順番で）
        answerText = `----------------------------------------
【ChatGPT回答】
----------------------------------------
${formattedChatGPT}

----------------------------------------
【Claude回答】
----------------------------------------
${formattedClaude}

----------------------------------------
【Gemini回答】
----------------------------------------
${formattedGemini}`;
        
        // デバッグ: 生成されたanswerTextの確認
        this.logger.log(`[StreamProcessor] 3種類AIレポートテキスト生成完了:`);
        this.logger.log(`  - 全体の長さ: ${answerText.length}文字`);
        this.logger.log(`  - 最初の100文字: ${answerText.substring(0, 100)}...`);
        this.logger.log(`  - ChatGPT部分含む: ${answerText.includes('【ChatGPT回答】')}`);
        this.logger.log(`  - Claude部分含む: ${answerText.includes('【Claude回答】')}`);
        this.logger.log(`  - Gemini部分含む: ${answerText.includes('【Gemini回答】')}`);
        
        this.logger.log(`[StreamProcessor] 3種類AI回答取得完了: ChatGPT=${!!chatgptAnswer}, Claude=${!!claudeAnswer}, Gemini=${!!geminiAnswer}`);
      } else {
        // 単独AIの場合：ソース列から回答を取得
        const singleAnswer = await this.getSpreadsheetCellValue(
          task.sourceColumn,
          task.row,
        );
        
        // 回答を整形（。の後に改行が2回未満の場合、2回改行を追加）
        if (singleAnswer) {
          answerText = singleAnswer.replace(/。(?!\n\n)/g, '。\n\n');
        } else {
          answerText = singleAnswer;
        }
      }

      if (!answerText || answerText.trim().length === 0) {
        this.logger.log(
          `[StreamProcessor] ${task.sourceColumn}${task.row}に回答がないため、レポート作成をスキップ`,
        );
        // レポートタスクも完了扱いにして次へ進む
        await this.onTaskCompleted(task, windowId, {
          success: false,
          skipped: true,
          reason: "no_answer",
        });
        return;
      }

      // プロンプトも取得（レポートに含めるため）
      const promptText = await this.getSpreadsheetCellValue(
        task.promptColumn || task.column,
        task.row,
      );

      // ReportManagerを使用してレポートを生成
      let docInfo = null;
      const ReportManagerClass = await getReportManager();
      
      if (ReportManagerClass) {
        // ReportManagerが利用可能な場合
        this.logger.log('[StreamProcessor] ReportManagerを使用してレポートを生成');
        const reportManager = new ReportManagerClass({
          sheetsClient: globalThis.sheetsClient,
          docsClient: globalThis.docsClient,
          authService: globalThis.authService,
          logger: this.logger
        });
        
        const result = await reportManager.generateReportForRow({
          spreadsheetId: this.spreadsheetData.spreadsheetId,
          gid: this.spreadsheetData.gid,
          rowNumber: task.row,
          promptText: promptText,
          answerText: answerText,
          reportColumn: task.column
        });
        
        if (result.success) {
          docInfo = { url: result.url, documentId: result.documentId };
        }
      } else {
        // フォールバック: 直接DocsClientを使用
        this.logger.log('[StreamProcessor] フォールバック: DocsClientを直接使用');
        docInfo = await this.createGoogleDocumentForReport(
          task,
          promptText,
          answerText,
        );
      }

      if (docInfo && docInfo.url) {
        this.logger.log(
          `[StreamProcessor] レポート作成完了: ${docInfo.url}`,
        );

        // タスク完了処理
        await this.onTaskCompleted(task, windowId, {
          success: true,
          reportUrl: docInfo.url,
        });
      } else {
        throw new Error("ドキュメント作成に失敗しました");
      }
    } catch (error) {
      this.logger.error(
        `[StreamProcessor] レポートタスクエラー: ${task.column}${task.row}`,
        error,
      );

      // エラーでも次のタスクへ進む
      await this.onTaskCompleted(task, windowId, {
        success: false,
        error: error.message,
      });
    }
  }

  /**
   * スプレッドシートのセル値を取得
   * @param {string} column
   * @param {number} row
   * @returns {Promise<string>}
   */
  async getSpreadsheetCellValue(column, row) {
    if (!globalThis.sheetsClient || !this.spreadsheetData) return "";

    try {
      const { spreadsheetId } = this.spreadsheetData;
      const range = `${column}${row}`;
      const data = await globalThis.sheetsClient.getSheetData(
        spreadsheetId,
        range,
      );
      return data[0]?.[0] || "";
    } catch (error) {
      this.logger.error(
        `[StreamProcessor] セル値取得エラー: ${column}${row}`,
        error,
      );
      return "";
    }
  }

  /**
   * レポート用のGoogleドキュメントを作成
   * @param {Task} task
   * @param {string} promptText
   * @param {string} answerText
   * @returns {Promise<Object>}
   */
  async createGoogleDocumentForReport(task, promptText, answerText) {
    if (!globalThis.docsClient) return null;

    try {
      const taskResult = {
        prompt: promptText || "(プロンプトなし)",
        response: answerText,
        aiType: task.aiType,
        rowNumber: task.row,
        columnIndex: task.sourceColumn,
      };

      const docInfo =
        await globalThis.docsClient.createDocumentFromTaskResult(taskResult);

      this.logger.log(`[StreamProcessor] レポートドキュメント作成: ${docInfo.url}`);

      return docInfo;
    } catch (error) {
      this.logger.error(`[StreamProcessor] ドキュメント作成エラー`, error);
      return null;
    }
  }


  /**
   * 列名をインデックスに変換
   * @param {string} column
   * @returns {number} インデックス
   */
  columnToIndex(column) {
    let index = 0;
    for (let i = 0; i < column.length; i++) {
      index = index * 26 + (column.charCodeAt(i) - 65) + 1;
    }
    return index - 1;
  }

  /**
   * インデックスを列名に変換
   * @param {number} index
   * @returns {string} 列名
   */
  indexToColumn(index) {
    let column = "";
    index++;
    while (index > 0) {
      index--;
      column = String.fromCharCode(65 + (index % 26)) + column;
      index = Math.floor(index / 26);
    }
    return column;
  }

  /**
   * 列のウィンドウを閉じる
   * @param {string} column
   */
  async closeColumnWindow(column) {
    const windowId = this.columnWindows.get(column);
    if (!windowId) return;

    const windowInfo = this.activeWindows.get(windowId);
    if (!windowInfo) return;

    this.logger.log(`[StreamProcessor] 🗂️ ${column}列のウィンドウを閉じる開始 (windowId: ${windowId})`);

    try {
      await chrome.windows.remove(windowId);
      this.logger.log(`[StreamProcessor] ✅ ウィンドウクローズ完了 (windowId: ${windowId})`);
    } catch (error) {
      this.logger.warn(`[StreamProcessor] ❌ ウィンドウクローズエラー (windowId: ${windowId})`, error);
    }

    this.activeWindows.delete(windowId);
    this.windowPositions.delete(windowInfo.position);
    this.columnWindows.delete(column);
    
    // 待機中の列があればそれを再開する
    this.checkAndStartWaitingColumns();
    
    // 注意: 次のタスクの開始はonTaskCompletedで既に行われているため、ここでは行わない
    // checkAndStartNextTaskの呼び出しを削除（重複処理を避ける）
  }

  /**
   * 空きウィンドウ分だけ利用可能な列を開始
   */
  async checkAndStartAvailableColumns() {
    // 実行中の3種類AIグループがある場合のチェック
    if (this.activeThreeTypeGroupId) {
      // このグループがまだ未完了かチェック
      const hasIncompleteGroup = Array.from(this.groupCompletionTracker.entries())
        .some(([key, tracker]) => {
          // アクティブなグループIDを含むキーかチェック
          if (key.includes(this.activeThreeTypeGroupId)) {
            return tracker.completed.size < tracker.required.size;
          }
          return false;
        });
      
      if (hasIncompleteGroup) {
        this.logger.log(`[StreamProcessor] 3種類AIグループ(${this.activeThreeTypeGroupId})実行中のため新規列開始を待機`);
        return;
      }
    }
    
    const availableSlots = this.maxConcurrentWindows - this.activeWindows.size;
    if (availableSlots <= 0) {
      this.logger.log(`[StreamProcessor] 空きウィンドウなし (${this.activeWindows.size}/${this.maxConcurrentWindows})`);
      return;
    }
    
    this.logger.log(`[StreamProcessor] 空きウィンドウ${availableSlots}個で未処理列をチェック`);
    
    const columns = Array.from(this.taskQueue.keys()).sort();
    let started = 0;
    let nextThreeTypeGroupId = null;
    
    for (const column of columns) {
      if (started >= availableSlots) break;
      
      // すでにウィンドウがある列はスキップ
      if (this.columnWindows.has(column)) continue;
      
      const tasks = this.taskQueue.get(column);
      const index = this.currentRowByColumn.get(column) || 0;
      
      if (tasks && index < tasks.length) {
        const task = tasks[index];
        
        // 3種類AIグループのチェック
        if (task.multiAI && task.groupId) {
          // 新しい3種類AIグループを検出
          if (!nextThreeTypeGroupId) {
            nextThreeTypeGroupId = task.groupId;
            this.activeThreeTypeGroupId = nextThreeTypeGroupId;
            this.logger.log(`[StreamProcessor] 新しい3種類AIグループを開始: ${nextThreeTypeGroupId}`);
          }
          
          // 同じグループのタスクのみ開始（最大3つ）
          if (task.groupId === nextThreeTypeGroupId && started < 3) {
            this.logger.log(`[StreamProcessor] ${column}列を開始 (3種類AIグループ: ${started + 1}/3)`);
            this.startColumnProcessing(column).catch(error => {
              this.logger.error(`[StreamProcessor] ${column}列開始エラー`, error);
            });
            started++;
          }
        } else if (!nextThreeTypeGroupId) {
          // 3種類AIグループがない場合
          // レポートタスクかチェック
          if (task.taskType === "report") {
            // レポートタスクの場合、依存元タスクが完了しているか確認
            const dependsOnTaskId = task.dependsOn;
            if (dependsOnTaskId && !this.completedTasks.has(dependsOnTaskId)) {
              this.logger.log(`[StreamProcessor] ${column}列(レポート)は依存タスク${dependsOnTaskId}の完了待ち`);
              continue;
            }
            // ソース列のデータが存在するか確認
            const sourceColumn = task.sourceColumn;
            const sourceRow = task.row;
            const sourceCellKey = `${sourceColumn}${sourceRow}`;
            if (!this.writtenCells.has(sourceCellKey)) {
              this.logger.log(`[StreamProcessor] ${column}列(レポート)はソース${sourceCellKey}の記載待ち`);
              continue;
            }
          } else {
            // 通常のAIタスクの場合
            // 前の列が完了しているか確認（単独AIの場合のみ1つずつ開始）
            const prevColumn = this.getPreviousColumn(column);
            if (prevColumn && this.shouldWaitForPreviousColumn(prevColumn, column, task.row)) {
              this.logger.log(`[StreamProcessor] ${column}列は前の列${prevColumn}の完了待ち`);
              continue;
            }
          }
          
          // 開始可能な列を開始（単独AIは1つずつ）
          this.logger.log(`[StreamProcessor] ${column}列を開始`);
          this.startColumnProcessing(column).catch(error => {
            this.logger.error(`[StreamProcessor] ${column}列開始エラー`, error);
          });
          started++;
          
          // 単独AIは1つずつ開始するため、ここで終了
          break;
        }
      }
    }
    
    if (started === 0) {
      this.logger.log(`[StreamProcessor] 開始可能な列がありません`);
    }
  }

  /**
   * 次のタスクを確認して開始
   * @param {string} closedColumn - 閉じた列
   */
  async checkAndStartNextTask(closedColumn) {
    this.logger.log(`[StreamProcessor] 次のタスク確認: ${closedColumn}列のウィンドウを閉じた後`);
    
    // 1. 同じ列の次のタスクをチェック
    const tasks = this.taskQueue.get(closedColumn);
    const currentIndex = this.currentRowByColumn.get(closedColumn) || 0;
    
    if (tasks && currentIndex < tasks.length) {
      this.logger.log(`[StreamProcessor] ${closedColumn}列に未処理タスクあり (${currentIndex}/${tasks.length})`);
      // 同じ列に未処理タスクがある場合は開始
      await this.startColumnProcessing(closedColumn);
      return;
    }
    
    // 2. 他の列で未処理タスクを探す
    const columns = Array.from(this.taskQueue.keys()).sort();
    for (const column of columns) {
      // すでにウィンドウがある列はスキップ
      if (this.columnWindows.has(column)) {
        this.logger.log(`[StreamProcessor] ${column}列は既にウィンドウがあるためスキップ`);
        continue;
      }
      
      const columnTasks = this.taskQueue.get(column);
      const index = this.currentRowByColumn.get(column) || 0;
      
      if (columnTasks && index < columnTasks.length) {
        this.logger.log(`[StreamProcessor] ${column}列で未処理タスク発見 (${index}/${columnTasks.length})`);
        // 未処理タスクがある列を開始
        await this.startColumnProcessing(column);
        break; // 1つだけ開始
      }
    }
    
    // 全タスク完了チェック
    const allCompleted = this.checkAllTasksCompleted();
    if (allCompleted) {
      this.logger.log(`[StreamProcessor] ✅ 全タスク完了！`);
    }
  }

  /**
   * 全タスクが完了したかチェック
   * @returns {boolean}
   */
  checkAllTasksCompleted() {
    for (const [column, tasks] of this.taskQueue.entries()) {
      const currentIndex = this.currentRowByColumn.get(column) || 0;
      if (currentIndex < tasks.length) {
        return false; // まだ未処理タスクがある
      }
    }
    return true; // 全タスク完了
  }

  /**
   * 記載完了後、次の列の同じ行を開始できるかチェック
   * 
   * ■ 3種類AI完了待機機能の核心部分
   * このメソッドは、タスクがスプレッドシートに記載された後に呼ばれ、
   * 次の列の処理を開始するかどうかを判定します。
   * 
   * 【重要】3種類AI（ChatGPT・Claude・Gemini）の場合：
   * - 3つすべての回答が記載完了するまで、次の列の開始をブロック
   * - これにより、3種類の結果が揃ってから次の処理に進むことを保証
   * 
   * @param {string} column - 記載が完了した列（例: "F", "G", "H"）
   * @param {number} row - 記載が完了した行（例: 9）
   */
  async checkAndStartNextColumnForRow(column, row) {
    // ======= STEP 1: 現在のタスク情報を取得 =======
    // 現在の列のタスクキューから、該当行のタスクを探す
    const currentColumnTasks = this.taskQueue.get(column);
    const currentTask = currentColumnTasks?.find(t => t.row === row);
    
    // ======= STEP 2: 3種類AIグループの完了待機チェック =======
    // multiAI=true かつ groupIdがある場合、3種類AIグループの一部
    if (currentTask?.multiAI && currentTask?.groupId) {
      /*
       * 【3種類AI完了待機の仕組み】
       * 
       * 1. getGroupAnswerColumns()で同じグループの全回答列を取得
       *    例: groupId="group_row9_3type_3" → ["F", "G", "H"]
       * 
       * 2. writtenCells Mapを使って、全列が記載済みかチェック
       *    - writtenCells.has("F9") → ChatGPT記載済み？
       *    - writtenCells.has("G9") → Claude記載済み？
       *    - writtenCells.has("H9") → Gemini記載済み？
       * 
       * 3. 1つでも未記載があれば、次列の開始をブロック
       *    これにより3種類すべての結果が揃うまで待機
       */
      
      // 同じグループIDを持つ全タスクの列を取得（例: F,G,H列）
      const answerColumns = this.getGroupAnswerColumns(currentTask.groupId, row);
      
      // 全列が記載完了しているかチェック（記載完了ベースの判定）
      const allWritten = answerColumns.every(col => 
        this.writtenCells.has(`${col}${row}`)
      );
      
      if (!allWritten) {
        // まだ記載されていない列がある場合
        const writtenColumns = answerColumns.filter(col => this.writtenCells.has(`${col}${row}`));
        this.logger.log(`[StreamProcessor] 3種類AI記載未完了: ${writtenColumns.length}/${answerColumns.length}列完了 (${column}${row})`);
        return; // ★ ここで次列開始をブロック ★
      }
      
      // 全列記載完了の場合のみ、次の処理へ進む
      this.logger.log(`[StreamProcessor] 3種類AI全列記載完了確認: ${column}${row}`);
      
      // グループが完了したらactiveThreeTypeGroupIdをクリア
      if (this.activeThreeTypeGroupId === currentTask.groupId) {
        this.logger.log(`[StreamProcessor] 🎯 3種類AIグループ ${currentTask.groupId} 完了！activeThreeTypeGroupIdをクリア`);
        this.activeThreeTypeGroupId = null;
        
        // 次の3種類AIグループがあるか確認して開始
        this.checkAndStartNextThreeTypeGroup();
      }
    }
    
    const nextColumn = this.getNextColumn(column);
    if (!nextColumn) {
      this.logger.log(`[StreamProcessor] 次の列なし: ${column}列が最後`);
      return;
    }
    
    // 次の列の同じ行のタスクを探す
    const nextColumnTasks = this.taskQueue.get(nextColumn);
    if (!nextColumnTasks) return;
    
    const nextTask = nextColumnTasks.find(t => t.row === row);
    if (!nextTask) {
      this.logger.log(`[StreamProcessor] ${nextColumn}列に行${row}のタスクなし`);
      return;
    }
    
    // すでに処理済みか確認
    if (this.completedTasks.has(nextTask.id)) {
      this.logger.log(`[StreamProcessor] ${nextColumn}列の行${row}は処理済み`);
      return;
    }
    
    // レポートタスクの場合は特別な処理
    if (nextTask.taskType === "report") {
      // レポートタスクは依存関係があるため、ここでは開始しない
      // checkAndStartAvailableColumnsで依存関係をチェックして開始される
      this.logger.log(`[StreamProcessor] ${nextColumn}列はレポートタスクのため、依存関係チェック後に開始`);
      return;
    }
    
    // 3種類AIグループの場合は同時開始されるため、ここでは開始しない
    if (nextTask.multiAI && nextTask.groupId) {
      this.logger.log(`[StreamProcessor] ${nextColumn}列は3種類AIグループのため、グループ単位で開始`);
      return;
    }
    
    // 現在の処理インデックスが該当行に到達しているか確認
    const currentIndex = this.currentRowByColumn.get(nextColumn) || 0;
    const taskIndex = nextColumnTasks.indexOf(nextTask);
    
    if (taskIndex !== currentIndex) {
      this.logger.log(`[StreamProcessor] ${nextColumn}列はまだ行${row}に到達していない（現在: 行${nextColumnTasks[currentIndex]?.row}）`);
      return;
    }
    
    // 単独AIの場合、前の列の記載完了により次の列を開始
    this.logger.log(`[StreamProcessor] 📋 並列ストリーミング発動！`);
    this.logger.log(`[StreamProcessor]   ${column}列の行${row}記載完了 → ${nextColumn}列の行${row}を開始`);
    
    // 次の列がまだウィンドウを持っていない場合のみ開始
    if (!this.columnWindows.has(nextColumn)) {
      await this.startColumnProcessing(nextColumn);
    }
  }
  
  /**
   * 前の列を取得
   * @param {string} currentColumn
   * @returns {string|null}
   */
  getPreviousColumn(currentColumn) {
    const columns = Array.from(this.taskQueue.keys()).sort();
    const currentIndex = columns.indexOf(currentColumn);
    return currentIndex > 0 ? columns[currentIndex - 1] : null;
  }
  
  /**
   * 前の列の完了を待つべきか判定
   * @param {string} prevColumn - 前の列
   * @param {string} currentColumn - 現在の列
   * @param {number} row - 行番号
   * @returns {boolean}
   */
  shouldWaitForPreviousColumn(prevColumn, currentColumn, row) {
    // 前の列のタスクを取得
    const prevTasks = this.taskQueue.get(prevColumn);
    if (!prevTasks) return false;
    
    // 前の列の同じ行のタスクを探す
    const prevTask = prevTasks.find(t => t.row === row);
    if (!prevTask) return false;
    
    // 前の列のタスクが完了していない場合は待つ
    if (!this.completedTasks.has(prevTask.id)) {
      return true;
    }
    
    // 前の列の記載が完了していない場合は待つ
    const prevCellKey = `${prevColumn}${row}`;
    if (!this.writtenCells.has(prevCellKey)) {
      return true;
    }
    
    return false;
  }
  
  /**
   * 次の列を取得
   * @param {string} currentColumn
   * @returns {string|null}
   */
  getNextColumn(currentColumn) {
    const columns = Array.from(this.taskQueue.keys()).sort();
    const currentIndex = columns.indexOf(currentColumn);
    return currentIndex < columns.length - 1 ? columns[currentIndex + 1] : null;
  }

  /**
   * 次の列を開始すべきか判定（並列ストリーミングでは使用しない）
   * @deprecated 記載完了ベースの制御に移行したため不要
   * @param {string} column
   * @param {number} row
   * @returns {boolean}
   */
  shouldStartNextColumn(column, row) {
    // 並列ストリーミングでは checkAndStartNextColumnForRow を使用
    return false;
  }

  /**
   * 次の3種類AIグループを探して開始
   */
  async checkAndStartNextThreeTypeGroup() {
    this.logger.log(`[StreamProcessor] 次の3種類AIグループを探索中...`);
    
    // 全列をチェックして次の3種類AIグループを探す
    const columns = Array.from(this.taskQueue.keys()).sort();
    let nextGroupId = null;
    let groupColumns = [];
    
    for (const column of columns) {
      // すでにウィンドウがある列はスキップ
      if (this.columnWindows.has(column)) continue;
      
      const tasks = this.taskQueue.get(column);
      const index = this.currentRowByColumn.get(column) || 0;
      
      if (tasks && index < tasks.length) {
        const task = tasks[index];
        
        // 3種類AIグループを発見
        if (task.multiAI && task.groupId) {
          if (!nextGroupId) {
            nextGroupId = task.groupId;
            this.logger.log(`[StreamProcessor] 📋 次の3種類AIグループ発見: ${nextGroupId}`);
          }
          
          // 同じグループの列を収集
          if (task.groupId === nextGroupId) {
            groupColumns.push(column);
          }
        }
      }
    }
    
    // 3種類AIグループが見つかったら開始
    if (nextGroupId && groupColumns.length > 0) {
      this.activeThreeTypeGroupId = nextGroupId;
      this.logger.log(`[StreamProcessor] 🚀 3種類AIグループ ${nextGroupId} を開始: ${groupColumns.join(', ')}列`);
      
      // グループの全列を同時に開始
      for (const column of groupColumns) {
        this.logger.log(`[StreamProcessor] ${column}列を開始`);
        await this.startColumnProcessing(column);
      }
    } else {
      this.logger.log(`[StreamProcessor] 次の3種類AIグループなし`);
      
      // 3種類AIグループがない場合は通常のタスクを開始
      this.checkAndStartAvailableColumns();
    }
  }

  /**
   * 3種類AIグループの回答列を取得
   * 
   * ■ このメソッドの役割
   * 指定されたグループIDに属する全ての回答列を返します。
   * 3種類AIの場合、同じgroupIdを持つ3つのタスク（ChatGPT, Claude, Gemini）の
   * 列を配列として返します。
   * 
   * 【例】
   * - グループ1（D-E列のプロンプト）: groupId="group_row9_3type_3"
   *   → 返り値: ["F", "G", "H"]（ChatGPT, Claude, Gemini列）
   * 
   * - グループ2（J-K列のプロンプト）: groupId="group_row9_3type_9"
   *   → 返り値: ["L", "M", "N"]（ChatGPT, Claude, Gemini列）
   * 
   * 【重要】複数の3種類AIグループがある場合も正しく分離
   * groupIdでフィルタリングするため、各グループは独立して管理されます。
   * 
   * @param {string} groupId - グループID（例: "group_row9_3type_3"）
   * @param {number} row - 行番号（例: 9）
   * @returns {string[]} 回答列の配列（例: ["F", "G", "H"]）
   */
  getGroupAnswerColumns(groupId, row) {
    // タスクキューの全エントリをループ
    // taskQueue: Map { "F" => [tasks], "G" => [tasks], ... }
    const columns = [];
    for (const [column, tasks] of this.taskQueue.entries()) {
      // この列のタスクの中から、指定されたgroupIdと行に一致するものを探す
      const groupTask = tasks.find(t => 
        t.groupId === groupId &&  // 同じグループID
        t.row === row             // 同じ行
      );
      
      if (groupTask) {
        // 一致するタスクがあれば、その列を結果に追加
        columns.push(column);
      }
    }
    
    // デバッグ用ログ: どの列が同じグループに属するか表示
    this.logger.log(`[StreamProcessor] グループ${groupId}の回答列: ${columns.join(', ')}`);
    return columns;
  }

  /**
   * 3種類AIグループが完了しているかチェック
   * @param {string} groupId - グループID
   * @param {number} row - 行番号
   * @returns {boolean} グループが完了しているか
   */
  isGroupComplete(groupId, row) {
    const trackerKey = `${groupId}_${row}`;
    const tracker = this.groupCompletionTracker.get(trackerKey);
    
    if (!tracker) {
      // 追跡対象外（単独AIなど）は完了扱い
      return true;
    }
    
    // すべての必要なAIが完了しているか確認
    for (const requiredAI of tracker.required) {
      if (!tracker.completed.has(requiredAI)) {
        this.logger.log(`[StreamProcessor] グループ未完了: ${trackerKey}, 待機中: ${requiredAI}`);
        return false;
      }
    }
    
    this.logger.log(`[StreamProcessor] グループ完了: ${trackerKey}`);
    return true;
  }

  /**
   * 3種類AIグループの完了状況を初期化
   * @param {Object} task - タスク
   */
  initializeGroupTracking(task) {
    if (!task.multiAI || !task.groupId) {
      return; // 3種類AIグループでない場合はスキップ
    }
    
    const trackerKey = `${task.groupId}_${task.row}`;
    
    if (!this.groupCompletionTracker.has(trackerKey)) {
      // 初回のみトラッカーを作成
      this.groupCompletionTracker.set(trackerKey, {
        required: new Set(['chatgpt', 'claude', 'gemini']),
        completed: new Set()
      });
      this.logger.log(`[StreamProcessor] グループトラッカー初期化: ${trackerKey}`);
    }
  }

  /**
   * 3種類AIグループのタスク完了を記録
   * @param {Object} task - 完了したタスク
   */
  updateGroupCompletion(task) {
    if (!task.multiAI || !task.groupId) {
      return; // 3種類AIグループでない場合はスキップ
    }
    
    const trackerKey = `${task.groupId}_${task.row}`;
    const tracker = this.groupCompletionTracker.get(trackerKey);
    
    if (tracker) {
      // タスクのAIタイプを完了に追加
      tracker.completed.add(task.aiType);
      this.logger.log(`[StreamProcessor] グループ進捗更新: ${trackerKey}, 完了: ${task.aiType}, 状況: ${tracker.completed.size}/${tracker.required.size}`);
      
      // グループが完全に完了したかチェック
      if (tracker.completed.size === tracker.required.size) {
        // このグループIDに関連する全てのトラッカーが完了したかチェック
        const allGroupTasksComplete = Array.from(this.groupCompletionTracker.entries())
          .filter(([key]) => key.includes(task.groupId))
          .every(([, t]) => t.completed.size === t.required.size);
        
        if (allGroupTasksComplete && this.activeThreeTypeGroupId === task.groupId) {
          this.logger.log(`[StreamProcessor] 3種類AIグループ完了: ${task.groupId}`);
          this.activeThreeTypeGroupId = null; // アクティブグループをクリア
        }
      }
    }
  }

  /**
   * 空きポジションを探して即座に予約
   * @returns {number} 空きポジション（0-3）、なければ-1
   */
  findAvailablePosition() {
    const timestamp = Date.now();
    this.logger.log(`[StreamProcessor] 🔍 findAvailablePosition開始 ${timestamp}`, {
      currentWindowPositions: Array.from(this.windowPositions.keys()),
      activeWindowsCount: this.activeWindows.size,
      stackTrace: new Error().stack?.split('\n')[2]?.trim()
    });
    
    for (let i = 0; i < this.maxConcurrentWindows; i++) {
      const hasPosition = this.windowPositions.has(i);
      this.logger.log(`[StreamProcessor] ポジション${i}チェック: ${hasPosition ? '使用中' : '空き'}`);
      
      if (!hasPosition) {
        // 競合状態を防ぐため、即座に仮予約
        this.windowPositions.set(i, 'RESERVED');
        this.logger.log(`[StreamProcessor] ✅ ポジション${i}を予約して返す (${timestamp})`);
        return i;
      }
    }
    
    this.logger.log(`[StreamProcessor] ❌ 空きポジションなし (${timestamp})`);
    return -1;
  }

  /**
   * 自動化スクリプトを注入
   * @param {number} windowId - ウィンドウID
   * @param {string} aiType - AI種別
   * @returns {Promise<void>}
   */
  async injectAutomationScripts(windowId, aiType) {
    try {
      // ウィンドウのタブを取得
      const tabs = await chrome.tabs.query({ windowId });
      if (!tabs || tabs.length === 0) {
        throw new Error(`ウィンドウ ${windowId} にタブが見つかりません`);
      }
      const tabId = tabs[0].id;

      // AI種別に応じたスクリプトファイルを定義
      const scriptFileMap = {
        'claude': 'automations/claude-automation-dynamic.js',
        'chatgpt': 'automations/chatgpt-automation.js',
        'gemini': 'automations/gemini-dynamic-automation.js',
        'genspark': 'automations/genspark-automation.js'
      };

      const aiName = aiType.toLowerCase();
      const scriptFile = scriptFileMap[aiName];

      if (!scriptFile) {
        this.logger.warn(`[StreamProcessor] ${aiType}用の自動化スクリプトが見つかりません`);
        return;
      }

      // 共通スクリプトを含む
      // 注意: ui-selectors.jsはESモジュールなので、chrome.scripting.executeScriptでは直接注入できない
      // common-ai-handler.jsがUI_SELECTORSを内部で定義しているので、それを使用
      const scriptsToInject = [
        'automations/common-ai-handler.js',
        scriptFile
      ];

      // スクリプトを注入
      this.logger.log(`[StreamProcessor] スクリプト注入開始: ${scriptsToInject.join(', ')}`);
      
      // chrome.scripting.executeScriptの結果を取得してエラーチェック
      const results = await chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: scriptsToInject
      });
      
      if (!results || results.length === 0) {
        throw new Error('スクリプト注入結果が空です');
      }
      
      // エラーチェック
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        throw new Error(`Chrome runtime error: ${lastError.message}`);
      }

      this.logger.log(`[StreamProcessor] ${aiType}の自動化スクリプトを注入しました (結果: ${results.length}件)`);
      
      // スクリプトが初期化されるまで少し待機
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // 自動化オブジェクトの存在を確認（正しいAPIを使用）
      const verification = await chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: () => ({
          ChatGPTAutomation: !!window.ChatGPTAutomation,
          ClaudeAutomation: !!window.ClaudeAutomation,
          GeminiAutomation: !!window.GeminiAutomation,
          Gemini: !!window.Gemini,
          commonAIHandler: !!window.AIHandler
        })
      });
      
      this.logger.log(`[StreamProcessor] ${aiType}自動化オブジェクト確認:`, verification[0]?.result || 'error');
      
    } catch (error) {
      this.logger.error(`[StreamProcessor] 自動化スクリプト注入エラー`, {
        message: error.message,
        aiType: aiType,
        windowId: windowId
      });
      // エラーが発生しても処理は続行（フォールバック）
    }
  }

  /**
   * コンテンツスクリプトの準備完了を待機
   * @param {number} windowId - ウィンドウID
   * @returns {Promise<void>}
   */
  async waitForContentScriptReady(windowId) {
    const maxRetries = 60; // 最大60回（60秒）
    const retryDelay = 1000; // 1秒ごとにリトライ

    for (let i = 0; i < maxRetries; i++) {
      try {
        // ウィンドウのタブを取得
        const tabs = await chrome.tabs.query({ windowId });
        if (!tabs || tabs.length === 0) {
          throw new Error(`ウィンドウ ${windowId} にタブが見つかりません`);
        }

        const tabId = tabs[0].id;
        
        // タブの読み込み状態を確認
        const tab = await chrome.tabs.get(tabId);
        if (tab.status !== 'complete') {
          this.logger.log(`[StreamProcessor] ページ読み込み中... (${i + 1}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          continue;
        }
        
        // 追加の待機時間（ページが完全に初期化されるまで）
        if (i === 0) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }

        // コンテンツスクリプトに準備完了確認メッセージを送信
        const response = await new Promise((resolve) => {
          chrome.tabs.sendMessage(tabId, { action: "checkReady" }, (response) => {
            if (chrome.runtime.lastError) {
              resolve(null);
            } else {
              resolve(response);
            }
          });
        });

        if (response && response.ready) {
          this.logger.log(`[StreamProcessor] コンテンツスクリプト準備完了 (AI: ${response.aiType})`);
          return;
        }

        this.logger.log(`[StreamProcessor] コンテンツスクリプト待機中... (${i + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      } catch (error) {
        this.logger.warn(`[StreamProcessor] 準備確認エラー (${i + 1}/${maxRetries}):`, error.message);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }

    throw new Error("コンテンツスクリプトの準備がタイムアウトしました");
  }

  /**
   * AI種別に応じたURLを決定
   * @param {string} aiType
   * @param {string} column
   * @returns {string} URL
   */
  determineAIUrl(aiType, column) {
    switch (aiType) {
      case "claude":
        return "https://claude.ai/new";

      case "gemini":
        return "https://gemini.google.com/app";

      case "chatgpt":
        // モデルをチェック
        if (this.modelManager) {
          return this.modelManager.generateChatGPTUrl(column, aiType);
        }
        return "https://chatgpt.com/?model=gpt-4o";

      default:
        this.logger.warn(`[StreamProcessor] 未知のAIタイプ: ${aiType}`);
        return "https://chatgpt.com/?model=gpt-4o";
    }
  }

  /**
   * ウィンドウ位置を計算（4分割）
   * @param {number} index
   * @param {Object} screenInfo
   * @returns {Object} 位置情報
   */
  calculateWindowPosition(index, screenInfo) {
    const halfWidth = Math.floor(screenInfo.width / 2);
    const halfHeight = Math.floor(screenInfo.height / 2);

    const positions = [
      {
        // 左上
        left: screenInfo.left,
        top: screenInfo.top,
        width: halfWidth,
        height: halfHeight,
      },
      {
        // 右上
        left: screenInfo.left + halfWidth,
        top: screenInfo.top,
        width: halfWidth,
        height: halfHeight,
      },
      {
        // 左下
        left: screenInfo.left,
        top: screenInfo.top + halfHeight,
        width: halfWidth,
        height: halfHeight,
      },
      {
        // 右下
        left: screenInfo.left + halfWidth,
        top: screenInfo.top + halfHeight,
        width: halfWidth,
        height: halfHeight,
      },
    ];

    return positions[index % 4];
  }

  /**
   * 画面情報を取得
   * @returns {Promise<Object>}
   */
  async getScreenInfo() {
    try {
      const displays = await chrome.system.display.getInfo();
      const primaryDisplay = displays.find((d) => d.isPrimary) || displays[0];

      return {
        width: primaryDisplay.workArea.width,
        height: primaryDisplay.workArea.height,
        left: primaryDisplay.workArea.left,
        top: primaryDisplay.workArea.top,
      };
    } catch (error) {
      this.logger.warn(
        "[StreamProcessor] 画面情報取得エラー、デフォルト値使用",
        error,
      );
      return {
        width: 1920,
        height: 1080,
        left: 0,
        top: 0,
      };
    }
  }

  /**
   * 全ウィンドウを閉じる
   * @returns {Promise<void>}
   */
  async closeAllWindows() {
    this.logger.log("[StreamProcessor] 全ウィンドウクローズ開始");

    // レポートチェック用タイマーをクリア
    if (this.reportCheckInterval) {
      clearInterval(this.reportCheckInterval);
      this.reportCheckInterval = null;
    }

    const closePromises = Array.from(this.activeWindows.values()).map(
      async (windowInfo) => {
        try {
          await chrome.windows.remove(windowInfo.windowId);
        } catch (error) {
          this.logger.error(
            `[StreamProcessor] ウィンドウクローズエラー: ${windowInfo.column}`,
            error,
          );
        }
      },
    );

    await Promise.allSettled(closePromises);

    this.activeWindows.clear();
    this.windowPositions.clear();
    this.columnWindows.clear();
    this.taskQueue.clear();
    this.currentRowByColumn.clear();
    this.completedTasks.clear();
    this.waitingColumns.clear();
    this.pendingReportTasks.clear();

    this.logger.log("[StreamProcessor] 全ウィンドウクローズ完了");
  }

  /**
   * 待機中の列をチェックして再開する
   */
  checkAndStartWaitingColumns() {
    if (this.waitingColumns.size === 0) {
      return;
    }

    this.logger.log(`[StreamProcessor] 待機中の列をチェック: ${Array.from(this.waitingColumns).join(', ')}`);

    // 待機中の列を1つずつ処理
    for (const waitingColumn of this.waitingColumns) {
      // ポジション予約をせずに空きがあるかのみチェック
      const availablePosition = this.checkAvailablePositionWithoutReserve();
      if (availablePosition !== -1) {
        this.logger.log(`[StreamProcessor] 待機中の${waitingColumn}列を再開 (利用可能ポジション: ${availablePosition})`);
        this.waitingColumns.delete(waitingColumn);
        // 非同期で開始（awaitしない）
        this.startColumnProcessing(waitingColumn).catch(error => {
          this.logger.error(`[StreamProcessor] 待機列再開エラー: ${waitingColumn}`, {
            message: error.message,
            stack: error.stack,
            name: error.name,
            column: waitingColumn,
            errorString: error.toString()
          });
        });
        // 1つずつ処理するため、最初の1つだけ処理してbreak
        break;
      }
    }
  }

  /**
   * 予約せずに空きポジションをチェック（待機列再開専用）
   * @returns {number} 空きポジション（0-3）、なければ-1
   */
  checkAvailablePositionWithoutReserve() {
    for (let i = 0; i < this.maxConcurrentWindows; i++) {
      if (!this.windowPositions.has(i)) {
        return i;
      }
    }
    return -1;
  }

  /**
   * 処理状態を取得
   * @returns {Object}
   */
  getStatus() {
    const activeWindowsList = Array.from(this.activeWindows.values());
    const processedColumns = new Set();

    // 処理済みの列を特定
    this.currentRowByColumn.forEach((rowIndex, column) => {
      if (rowIndex > 0) {
        processedColumns.add(column);
      }
    });

    // 現在のタスク情報を取得
    const currentTasks = [];
    this.columnWindows.forEach((windowId, column) => {
      const currentIndex = this.currentRowByColumn.get(column) || 0;
      const tasks = this.taskQueue.get(column);
      if (tasks && currentIndex < tasks.length) {
        const currentTask = tasks[currentIndex];
        const windowInfo = this.activeWindows.get(windowId);
        if (windowInfo) {
          currentTasks.push({
            column: column,
            row: currentTask.row,
            windowId: windowId,
            aiType: currentTask.aiType,
            position: windowInfo.position,
          });
        }
      }
    });

    return {
      isProcessing: this.isProcessing,
      activeWindows: this.activeWindows.size,
      queueLength: this.getQueueLength(),
      processedColumns: Array.from(processedColumns),
      windows: currentTasks,
      taskProgress: this.getTaskProgress(),
    };
  }

  /**
   * 待機中のタスク数を取得
   */
  getQueueLength() {
    let count = 0;
    this.taskQueue.forEach((tasks, column) => {
      const currentIndex = this.currentRowByColumn.get(column) || 0;
      count += Math.max(0, tasks.length - currentIndex);
    });
    return count;
  }

  /**
   * タスクの進捗状況を取得
   */
  getTaskProgress() {
    const progress = {};
    this.taskQueue.forEach((tasks, column) => {
      const currentIndex = this.currentRowByColumn.get(column) || 0;
      progress[column] = {
        completed: currentIndex,
        total: tasks.length,
        percentage:
          tasks.length > 0
            ? Math.round((currentIndex / tasks.length) * 100)
            : 0,
      };
    });
    return progress;
  }

  /**
   * ペンディングレポートタスクをスケジュール
   * @param {Task} task
   */
  schedulePendingReportTask(task) {
    this.pendingReportTasks.add(task);
    this.logger.log(`[StreamProcessor] レポートタスクをペンディングリストに追加: ${task.column}${task.row}`);
    
    // まだタイマーが動いていない場合は開始
    if (!this.reportCheckInterval) {
      this.startReportCheckTimer();
    }
  }

  /**
   * レポートチェック用タイマーを開始
   */
  startReportCheckTimer() {
    // 5秒ごとにペンディングレポートをチェック
    this.reportCheckInterval = setInterval(() => {
      this.checkPendingReportTasks();
    }, 5000);
    
    this.logger.log(`[StreamProcessor] レポートチェックタイマーを開始（5秒間隔）`);
  }

  /**
   * ペンディングレポートタスクをチェックして実行可能なものを処理
   */
  async checkPendingReportTasks() {
    if (this.pendingReportTasks.size === 0) {
      // ペンディングタスクがなくなったらタイマー停止
      if (this.reportCheckInterval) {
        clearInterval(this.reportCheckInterval);
        this.reportCheckInterval = null;
        this.logger.log(`[StreamProcessor] レポートチェックタイマーを停止`);
      }
      return;
    }

    this.logger.log(`[StreamProcessor] ペンディングレポートタスクをチェック: ${this.pendingReportTasks.size}件`);
    
    const tasksToProcess = [];
    
    // 実行可能なタスクを探す
    for (const task of this.pendingReportTasks) {
      // 依存タスクが完了しているか確認
      const dependencyMet = !task.dependsOn || this.completedTasks.has(task.dependsOn);
      
      // ソース列の記載が完了しているか確認
      const sourceCellKey = `${task.sourceColumn}${task.row}`;
      const sourceWritten = this.writtenCells.has(sourceCellKey);
      
      if (dependencyMet && sourceWritten) {
        tasksToProcess.push(task);
        this.pendingReportTasks.delete(task);
      }
    }
    
    // 実行可能なタスクを処理
    for (const task of tasksToProcess) {
      this.logger.log(`[StreamProcessor] ペンディングレポートタスクを実行: ${task.column}${task.row}`);
      
      try {
        // レポートタスクを直接実行（ウィンドウなし）
        await this.executeReportTaskDirect(task);
      } catch (error) {
        this.logger.error(`[StreamProcessor] ペンディングレポートタスク実行エラー: ${task.column}${task.row}`, error);
      }
    }
  }

  /**
   * レポートタスクを直接実行（ペンディング処理用）
   * @param {Task} task
   */
  async executeReportTaskDirect(task) {
    try {
      // レポート列の直前の列を確認
      const prevColumnIndex = this.columnToIndex(task.column) - 1;
      const prevColumnName = this.indexToColumn(prevColumnIndex);
      
      // メニュー行を正しく取得（spreadsheetDataから）
      const menuRowNumber = this.spreadsheetData?.menuRow?.index ? 
        this.spreadsheetData.menuRow.index + 1 : 3; // デフォルトは3行目（メニュー行）
      const prevColumnHeader = await this.getSpreadsheetCellValue(prevColumnName, menuRowNumber);
      
      this.logger.log(`[StreamProcessor] レポート列判定:`);
      this.logger.log(`  - レポート列: ${task.column}`);
      this.logger.log(`  - 直前列: ${prevColumnName}="${prevColumnHeader}"`);
      this.logger.log(`  - メニュー行: ${menuRowNumber}行目`);
      
      let answerText = "";
      let allAnswers = {};
      
      // シンプルな判定：直前列が「Gemini回答」なら3種類AI、それ以外は単独AI
      const isThreeTypeAI = prevColumnHeader && prevColumnHeader.includes("Gemini回答");
      
      this.logger.log(`[StreamProcessor] AI種別判定（ペンディング）: ${isThreeTypeAI ? '3種類AI' : '単独AI'}`);
      
      if (isThreeTypeAI) {
        // 3種類AIの場合：ChatGPT回答、Claude回答、Gemini回答の3列を取得
        this.logger.log(`[StreamProcessor] 3種類AIレポート（ペンディング）：ChatGPT回答、Claude回答、Gemini回答を取得`);
        
        // レポート列の前の3列が ChatGPT回答、Claude回答、Gemini回答 の順番
        const chatgptColumn = this.indexToColumn(prevColumnIndex - 2);  // 3列前 = ChatGPT回答
        const claudeColumn = this.indexToColumn(prevColumnIndex - 1);   // 2列前 = Claude回答
        const geminiColumn = prevColumnName;                            // 1列前 = Gemini回答
        
        // 各列のヘッダーを確認（検証用）
        const chatgptHeader = await this.getSpreadsheetCellValue(chatgptColumn, menuRowNumber);
        const claudeHeader = await this.getSpreadsheetCellValue(claudeColumn, menuRowNumber);
        const geminiHeader = await this.getSpreadsheetCellValue(geminiColumn, menuRowNumber);
        
        this.logger.log(`[StreamProcessor] 3種類AI列の配置確認（ペンディング）:`);
        this.logger.log(`  - ${chatgptColumn}列: "${chatgptHeader}" (ChatGPT回答列)`);
        this.logger.log(`  - ${claudeColumn}列: "${claudeHeader}" (Claude回答列)`);
        this.logger.log(`  - ${geminiColumn}列: "${geminiHeader}" (Gemini回答列)`);
        
        // 各AIの回答を取得
        const chatgptAnswer = await this.getSpreadsheetCellValue(chatgptColumn, task.row);
        const claudeAnswer = await this.getSpreadsheetCellValue(claudeColumn, task.row);
        const geminiAnswer = await this.getSpreadsheetCellValue(geminiColumn, task.row);
        
        this.logger.log(`[StreamProcessor] 取得した回答の状況（ペンディング）:`);
        this.logger.log(`  - ChatGPT(${chatgptColumn}${task.row}): ${chatgptAnswer ? `${chatgptAnswer.substring(0, 30)}...` : '(空)'}`);
        this.logger.log(`  - Claude(${claudeColumn}${task.row}): ${claudeAnswer ? `${claudeAnswer.substring(0, 30)}...` : '(空)'}`);
        this.logger.log(`  - Gemini(${geminiColumn}${task.row}): ${geminiAnswer ? `${geminiAnswer.substring(0, 30)}...` : '(空)'}`);
        
        // 警告：ヘッダーが想定と異なる場合
        if (!chatgptHeader?.includes('ChatGPT') || !claudeHeader?.includes('Claude') || !geminiHeader?.includes('Gemini')) {
          this.logger.warn(`[StreamProcessor] ⚠️ ヘッダーが想定と異なる可能性があります（ペンディング）`);
          this.logger.warn(`  - 期待: ChatGPT回答、Claude回答、Gemini回答`);
          this.logger.warn(`  - 実際: ${chatgptHeader}、${claudeHeader}、${geminiHeader}`);
        }
        
        // 回答を整形（。の後に改行が2回未満の場合、2回改行を追加）
        const formatAnswer = (text) => {
          if (!text) return "(回答なし)";
          // 。の後に改行が0回または1回の場合、2回改行に置換
          return text.replace(/。(?!\n\n)/g, '。\n\n');
        };
        
        allAnswers = {
          chatgpt: chatgptAnswer || "",
          claude: claudeAnswer || "",
          gemini: geminiAnswer || ""
        };
        
        // 各AIの回答を確認（必ずChatGPT→Claude→Geminiの順番で）
        const formattedChatGPT = formatAnswer(chatgptAnswer || allAnswers.chatgpt || "");
        const formattedClaude = formatAnswer(claudeAnswer || allAnswers.claude || "");
        const formattedGemini = formatAnswer(geminiAnswer || allAnswers.gemini || "");
        
        // デバッグ: 各AIの回答が存在するか確認
        this.logger.log(`[StreamProcessor] レポート生成前の確認:`);
        this.logger.log(`  - ChatGPT回答あり: ${!!chatgptAnswer} (長さ: ${chatgptAnswer?.length || 0})`);
        this.logger.log(`  - Claude回答あり: ${!!claudeAnswer} (長さ: ${claudeAnswer?.length || 0})`);
        this.logger.log(`  - Gemini回答あり: ${!!geminiAnswer} (長さ: ${geminiAnswer?.length || 0})`);
        
        // 回答が全部空の場合の警告
        if (!chatgptAnswer && !claudeAnswer && !geminiAnswer) {
          this.logger.warn(`[StreamProcessor] ⚠️ すべてのAI回答が空です。スプレッドシートの内容を確認してください。`);
        }
        
        // レポート用に全回答を結合（必ずChatGPT→Claude→Geminiの順番で）
        answerText = `----------------------------------------
【ChatGPT回答】
----------------------------------------
${formattedChatGPT}

----------------------------------------
【Claude回答】
----------------------------------------
${formattedClaude}

----------------------------------------
【Gemini回答】
----------------------------------------
${formattedGemini}`;
        
        // デバッグ: 生成されたanswerTextの確認
        this.logger.log(`[StreamProcessor] 3種類AIレポートテキスト生成完了:`);
        this.logger.log(`  - 全体の長さ: ${answerText.length}文字`);
        this.logger.log(`  - 最初の100文字: ${answerText.substring(0, 100)}...`);
        this.logger.log(`  - ChatGPT部分含む: ${answerText.includes('【ChatGPT回答】')}`);
        this.logger.log(`  - Claude部分含む: ${answerText.includes('【Claude回答】')}`);
        this.logger.log(`  - Gemini部分含む: ${answerText.includes('【Gemini回答】')}`);
        
        this.logger.log(`[StreamProcessor] 3種類AI回答取得完了（ペンディング）: ChatGPT=${!!chatgptAnswer}, Claude=${!!claudeAnswer}, Gemini=${!!geminiAnswer}`);
      } else {
        // 単独AIの場合：ソース列から回答を取得
        const singleAnswer = await this.getSpreadsheetCellValue(
          task.sourceColumn,
          task.row,
        );
        
        // 回答を整形（。の後に改行が2回未満の場合、2回改行を追加）
        if (singleAnswer) {
          answerText = singleAnswer.replace(/。(?!\n\n)/g, '。\n\n');
        } else {
          answerText = singleAnswer;
        }
      }

      if (!answerText || answerText.trim().length === 0) {
        this.logger.log(
          `[StreamProcessor] ${task.sourceColumn}${task.row}に回答がないため、レポート作成をスキップ`,
        );
        return;
      }

      // プロンプトも取得（レポートに含めるため）
      const promptText = await this.getSpreadsheetCellValue(
        task.promptColumn || task.column,
        task.row,
      );

      // ReportManagerを使用してレポートを生成
      let docInfo = null;
      const ReportManagerClass = await getReportManager();
      
      if (ReportManagerClass) {
        // ReportManagerが利用可能な場合
        this.logger.log('[StreamProcessor] ReportManagerを使用してレポートを生成');
        const reportManager = new ReportManagerClass({
          sheetsClient: globalThis.sheetsClient,
          docsClient: globalThis.docsClient,
          authService: globalThis.authService,
          logger: this.logger
        });
        
        const result = await reportManager.generateReportForRow({
          spreadsheetId: this.spreadsheetData.spreadsheetId,
          gid: this.spreadsheetData.gid,
          rowNumber: task.row,
          promptText: promptText,
          answerText: answerText,
          reportColumn: task.column
        });
        
        if (result.success) {
          docInfo = { url: result.url, documentId: result.documentId };
        }
      } else {
        // フォールバック: 直接DocsClientを使用
        this.logger.log('[StreamProcessor] フォールバック: DocsClientを直接使用');
        docInfo = await this.createGoogleDocumentForReport(
          task,
          promptText,
          answerText,
        );
      }

      if (docInfo && docInfo.url) {
        this.logger.log(
          `[StreamProcessor] ペンディングレポート作成完了: ${docInfo.url}`,
        );
        
        // レポートURLをスプレッドシートに記載
        if (globalThis.sheetsClient && this.spreadsheetData) {
          const { spreadsheetId, gid } = this.spreadsheetData;
          const range = `${task.column}${task.row}`;
          await globalThis.sheetsClient.updateCell(
            spreadsheetId,
            range,
            docInfo.url,
            gid
          );
          this.logger.log(`[StreamProcessor] レポートURLを記載: ${range}`);
        }
      } else {
        throw new Error("ドキュメント作成に失敗しました");
      }
    } catch (error) {
      this.logger.error(
        `[StreamProcessor] レポートタスク直接実行エラー: ${task.column}${task.row}`,
        error,
      );
    }
  }
}

// エクスポート
export default StreamProcessor;
