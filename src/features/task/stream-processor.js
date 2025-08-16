// stream-processor.js - 並列ストリーミング処理

/**
 * StreamProcessor - タスクの並列ストリーミング処理を管理
 *
 * 並列ストリーミング処理の動作:
 * 1. 最初の列の最初の行から開始
 * 2. タスクが完了したら:
 *    - 同じ列の次の行へ進む（同じウィンドウを使い回す）
 *    - 完了した行の隣の列も開始する
 * 3. 波のように処理が広がっていく
 * 4. 最大4つのウィンドウを使い、列ごとに同じウィンドウを使い回す
 */
class StreamProcessor {
  constructor(dependencies = {}) {
    // Node.js環境でのテスト用にglobalThisを使用
    const globalContext = typeof self !== "undefined" ? self : globalThis;
    this.windowManager =
      dependencies.windowManager || globalContext.aiWindowManager;
    this.modelManager =
      dependencies.modelManager || globalContext.modelManager;
    this.logger = dependencies.logger || console;

    // ウィンドウ管理状態
    this.activeWindows = new Map(); // windowId -> windowInfo
    this.windowPositions = new Map(); // position(0-3) -> windowId
    this.columnWindows = new Map(); // column -> windowId (列とウィンドウの対応)
    this.maxConcurrentWindows = 4;

    // タスク管理状態
    this.taskQueue = new Map(); // column -> tasks[]
    this.currentRowByColumn = new Map(); // column -> currentRowNumber
    this.completedTasks = new Set(); // taskId

    // 処理状態
    this.isProcessing = false;
    this.spreadsheetData = null;
  }

  /**
   * タスクリストをストリーミング処理で実行
   * @param {TaskList} taskList - タスクリスト
   * @param {Object} spreadsheetData - スプレッドシートデータ
   * @param {Object} options - オプション設定
   * @returns {Promise<Object>} 処理結果
   */
  async processTaskStream(taskList, spreadsheetData, options = {}) {
    this.logger.log("[StreamProcessor] ストリーミング処理開始", {
      totalTasks: taskList.tasks.length,
      testMode: options.testMode || false
    });

    this.isProcessing = true;
    this.spreadsheetData = spreadsheetData;
    this.isTestMode = options.testMode || false;

    try {
      // タスクを列・行でグループ化
      this.organizeTasks(taskList);

      // 複数の列を並列で開始（最大4ウィンドウまで）
      const columns = Array.from(this.taskQueue.keys()).sort();
      const columnsToStart = Math.min(columns.length, this.maxConcurrentWindows);
      
      this.logger.log(`[StreamProcessor] ${columnsToStart}個の列を並列で開始`);
      
      // 各列を並列で開始
      const columnProcessingPromises = [];
      for (let i = 0; i < columnsToStart; i++) {
        if (columns[i]) {
          columnProcessingPromises.push(this.startColumnProcessing(columns[i]));
        }
      }
      
      // 全ての列の処理開始を並列実行（ウィンドウ作成のみ並列、タスク実行は各列内で順次）
      await Promise.all(columnProcessingPromises.map(promise => 
        promise.catch(error => {
          this.logger.error("[StreamProcessor] 列処理エラー", error);
          return null; // エラーが発生した列は無視して続行
        })
      ));

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
      const column = task.promptColumn;
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
    const startTime = Date.now();
    this.logger.log(`[StreamProcessor] 📋 startColumnProcessing開始: ${column}列 (${startTime})`);
    
    const tasks = this.taskQueue.get(column);
    if (!tasks || tasks.length === 0) return;

    const currentIndex = this.currentRowByColumn.get(column) || 0;
    if (currentIndex >= tasks.length) {
      // この列のタスクが全て完了したら、ウィンドウを閉じる
      await this.closeColumnWindow(column);
      return;
    }

    const currentTask = tasks[currentIndex];

    // この列に既存のウィンドウがあるかチェック
    const existingWindowId = this.columnWindows.get(column);
    if (existingWindowId && this.activeWindows.has(existingWindowId)) {
      // 既存のウィンドウでタスクを実行
      await this.executeTaskInWindow(currentTask, existingWindowId);
    } else {
      // 新しいウィンドウを開く必要がある
      // テスト用のpreferredPositionがある場合はそれを使用、なければ自動検索
      const position = currentTask.preferredPosition !== undefined 
        ? currentTask.preferredPosition 
        : this.findAvailablePosition();
      if (position === -1) {
        this.logger.log(
          `[StreamProcessor] 空きポジションがありません。待機中...`,
        );
        return;
      }

      await this.openWindowForColumn(column, currentTask, position);
    }
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

      // 最初のタスクを実行
      await this.executeTaskInWindow(task, window.id);
    } catch (error) {
      this.logger.error(`[StreamProcessor] ウィンドウ作成エラー`, error);
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

    this.logger.log(
      `[StreamProcessor] タスク実行: ${task.column}${task.row} (Window: ${windowId})`,
      {
        taskAiType: task.aiType,
        windowAiType: windowInfo.aiType,
        taskId: task.id,
        prompt: task.prompt?.substring(0, 50) + '...'
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

      // AITaskHandlerを直接呼び出す（Service Worker内なので）
      // aiTaskHandlerはbackground.jsでimportされているため、globalThisから取得
      const aiTaskHandler = globalThis.aiTaskHandler || (await import('../../handlers/ai-task-handler.js')).aiTaskHandler;
      
      const result = await aiTaskHandler.handleExecuteAITask({
        tabId,
        prompt: task.prompt,
        taskId: task.id,
        timeout: 180000,
      }, null);

      this.logger.log(
        `[StreamProcessor] タスク完了: ${task.column}${task.row}`,
        {
          aiType: result.aiType,
          responseLength: result.response?.length || 0,
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
   * タスク完了時の処理
   * @param {Task} task
   * @param {number} windowId
   * @param {Object} result - タスク実行結果
   */
  async onTaskCompleted(task, windowId, result = {}) {
    const { column, row, id: taskId, promptColumn } = task;
    
    // タスクはpromptColumnでグループ化されているので、それを使用
    const queueColumn = promptColumn || column;

    this.logger.log(`[StreamProcessor] タスク完了: ${column}${row}`, {
      result: result.success ? "success" : "failed",
      skipped: result.skipped || false,
      queueColumn: queueColumn
    });

    // タスクを完了済みにマーク
    this.completedTasks.add(taskId);

    // 成功した場合の追加処理（AIタスクの場合のみ）
    // テストモードの場合はスプレッドシート書き込みをスキップ
    if (result.success && result.response && task.taskType === "ai" && !this.isTestMode) {
      try {
        // 回答をスプレッドシートに書き込む
        await this.writeResultToSpreadsheet(task, result);
      } catch (error) {
        this.logger.error(`[StreamProcessor] 結果の保存エラー`, error);
      }
    }

    // 同じ列の次の行へ進む（promptColumnを使用）
    const currentIndex = this.currentRowByColumn.get(queueColumn) || 0;
    const nextIndex = currentIndex + 1;
    this.currentRowByColumn.set(queueColumn, nextIndex);

    // タスクが残っているか確認（promptColumnを使用）
    const tasks = this.taskQueue.get(queueColumn);
    const hasMoreTasks = tasks && nextIndex < tasks.length;

    this.logger.log(`[StreamProcessor] 次のタスク確認: ${queueColumn}列`, {
      currentIndex: currentIndex,
      nextIndex: nextIndex,
      totalTasks: tasks?.length || 0,
      hasMoreTasks: hasMoreTasks,
    });

    // 現在のウィンドウを閉じる（タスク完了ごとに必ず閉じる）
    this.logger.log(`[StreamProcessor] タスク完了によりウィンドウを閉じます: ${queueColumn}列`);
    await this.closeColumnWindow(queueColumn);
    
    // 次のタスクがある場合は新しいウィンドウで開始
    if (hasMoreTasks) {
      this.logger.log(`[StreamProcessor] 新しいウィンドウで次のタスクを開始: ${queueColumn}列`);
      // 少し待機してから新しいウィンドウを開く
      await new Promise(resolve => setTimeout(resolve, 500));
      await this.startColumnProcessing(queueColumn);
    } else {
      this.logger.log(`[StreamProcessor] ${queueColumn}列のタスクが全て完了`);
    }

    // 完了した行の隣の列も開始
    const nextColumn = this.getNextColumn(queueColumn);
    if (nextColumn && this.shouldStartNextColumn(nextColumn, row)) {
      await this.startColumnProcessing(nextColumn);
    }
  }

  /**
   * 結果をスプレッドシートに書き込む
   * @param {Task} task
   * @param {Object} result
   */
  async writeResultToSpreadsheet(task, result) {
    if (!globalThis.sheetsClient || !this.spreadsheetData) return;

    try {
      const { spreadsheetId } = this.spreadsheetData;
      const answerColumn = this.getAnswerColumn(task);
      const range = `${answerColumn}${task.row}`;

      await globalThis.sheetsClient.updateCell(
        spreadsheetId,
        range,
        result.response,
      );

      this.logger.log(`[StreamProcessor] 回答を書き込み: ${range}`);
    } catch (error) {
      this.logger.error(
        `[StreamProcessor] スプレッドシート書き込みエラー`,
        error,
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
        columnIndex: task.promptColumn,
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
   * ドキュメントURLをスプレッドシートに書き込む
   * @param {Task} task
   * @param {string} docUrl
   */
  async writeDocumentUrlToSpreadsheet(task, docUrl) {
    if (!globalThis.sheetsClient || !this.spreadsheetData) return;

    try {
      const { spreadsheetId } = this.spreadsheetData;
      const docUrlColumn = this.getDocumentUrlColumn(task);
      const range = `${docUrlColumn}${task.row}`;

      await globalThis.sheetsClient.updateCell(spreadsheetId, range, docUrl);

      this.logger.log(`[StreamProcessor] ドキュメントURL書き込み: ${range}`);
    } catch (error) {
      this.logger.error(
        `[StreamProcessor] ドキュメントURL書き込みエラー`,
        error,
      );
    }
  }

  /**
   * レポートタスクを実行
   * @param {Task} task
   * @param {number} windowId
   */
  async executeReportTask(task, windowId) {
    this.logger.log(
      `[StreamProcessor] レポートタスク実行: ${task.column}${task.row}`,
    );

    try {
      // ソース列（AI回答列）からテキストを取得
      const answerText = await this.getSpreadsheetCellValue(
        task.sourceColumn,
        task.row,
      );

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
        task.promptColumn,
        task.row,
      );

      // Googleドキュメントを作成
      const docInfo = await this.createGoogleDocumentForReport(
        task,
        promptText,
        answerText,
      );

      if (docInfo && docInfo.url) {
        // ドキュメントURLをレポート化列に書き込む
        await this.writeReportUrlToSpreadsheet(task, docInfo.url);
        
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
   * レポートURLをスプレッドシートに書き込む
   * @param {Task} task
   * @param {string} docUrl
   */
  async writeReportUrlToSpreadsheet(task, docUrl) {
    if (!globalThis.sheetsClient || !this.spreadsheetData) return;

    try {
      const { spreadsheetId } = this.spreadsheetData;
      const range = `${task.reportColumn}${task.row}`;

      await globalThis.sheetsClient.updateCell(spreadsheetId, range, docUrl);

      this.logger.log(`[StreamProcessor] レポートURL書き込み: ${range}`);
    } catch (error) {
      this.logger.error(
        `[StreamProcessor] レポートURL書き込みエラー`,
        error,
      );
    }
  }

  /**
   * 回答列の列名を取得
   * @param {Task} task
   * @returns {string} 列名
   */
  getAnswerColumn(task) {
    // プロンプト列の次の列が回答列
    const columnIndex = this.columnToIndex(task.promptColumn);
    return this.indexToColumn(columnIndex + 1);
  }

  /**
   * ドキュメントURL列の列名を取得
   * @param {Task} task
   * @returns {string} 列名
   */
  getDocumentUrlColumn(task) {
    // プロンプト列の2つ後の列がドキュメントURL列
    const columnIndex = this.columnToIndex(task.promptColumn);
    return this.indexToColumn(columnIndex + 2);
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

    this.logger.log(`[StreamProcessor] ${column}列のウィンドウを閉じる`);

    try {
      await chrome.windows.remove(windowId);
    } catch (error) {
      this.logger.warn(`[StreamProcessor] ウィンドウクローズエラー`, error);
    }

    this.activeWindows.delete(windowId);
    this.windowPositions.delete(windowInfo.position);
    this.columnWindows.delete(column);
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
   * 次の列を開始すべきか判定
   * @param {string} column
   * @param {number} row
   * @returns {boolean}
   */
  shouldStartNextColumn(column, row) {
    const tasks = this.taskQueue.get(column);
    if (!tasks || tasks.length === 0) return false;

    const currentIndex = this.currentRowByColumn.get(column) || 0;
    if (currentIndex >= tasks.length) return false;

    const nextTask = tasks[currentIndex];
    return nextTask.row === row;
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

    this.logger.log("[StreamProcessor] 全ウィンドウクローズ完了");
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
}

// エクスポート
export default StreamProcessor;
