// stream-processor.js - 並列ストリーミング処理

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
    
    // 記載完了管理（並列ストリーミングの核心）
    this.writtenCells = new Map(); // `${column}${row}` -> true (記載完了したセル)
    this.pendingColumnStarts = new Map(); // `${column}${row}` -> Promise (開始待機中の列)

    // 処理状態
    this.isProcessing = false;
    this.spreadsheetData = null;
    this.processingColumns = new Set(); // 現在処理中の列を管理
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

      // ■ 並列ストリーミング: 最初は第1列のみから開始
      const columns = Array.from(this.taskQueue.keys()).sort();
      this.logger.log(`[StreamProcessor] 並列ストリーミング開始`);
      this.logger.log(`[StreamProcessor] 列グループ: ${columns.join(' → ')}`);
      this.logger.log(`[StreamProcessor] 第1列グループ(${columns[0]})から開始`);
      
      // 最初の列のみ開始（並列ストリーミングの起点）
      if (columns[0]) {
        await this.startColumnProcessing(columns[0]).catch(error => {
          this.logger.error("[StreamProcessor] 第1列処理エラー", {
            message: error.message,
            stack: error.stack,
            name: error.name,
            column: columns[0],
            errorString: error.toString()
          });
        });
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
    // 重複処理チェック
    if (this.processingColumns.has(column)) {
      this.logger.log(`[StreamProcessor] ${column}列は既に処理中のためスキップ`);
      return;
    }
    
    const startTime = Date.now();
    this.logger.log(`[StreamProcessor] 📋 startColumnProcessing開始: ${column}列 (${startTime})`);
    
    // 処理開始フラグを設定
    this.processingColumns.add(column);
    
    const tasks = this.taskQueue.get(column);
    if (!tasks || tasks.length === 0) {
      this.processingColumns.delete(column);
      return;
    }

    const currentIndex = this.currentRowByColumn.get(column) || 0;
    if (currentIndex >= tasks.length) {
      // この列のタスクが全て完了したら、ウィンドウを閉じる
      await this.closeColumnWindow(column);
      this.processingColumns.delete(column); // 処理完了フラグをクリア
      return;
    }

    // ■ 3種類AIグループの特別処理
    if (this.is3TypeGroup(column)) {
      const currentRow = tasks[currentIndex].row;
      
      // 同じ行の3つのタスクを取得（ChatGPT, Claude, Gemini）
      const samRowTasks = tasks.filter(t => t.row === currentRow);
      
      this.logger.log(`[StreamProcessor] 3種類AI検出: ${column}列グループ`);
      this.logger.log(`[StreamProcessor]   行${currentRow}のタスク: ${samRowTasks.map(t => t.column).join(', ')}`);
      
      // 3つのタスクを並列で開始
      await this.start3TypeParallel(samRowTasks);
      
      // インデックスを進める（3つ分）
      this.currentRowByColumn.set(column, currentIndex + samRowTasks.length);
      
      // 3種類AI処理完了後はフラグをクリア
      this.processingColumns.delete(column);
      return;
    }

    const currentTask = tasks[currentIndex];

    // 常に新しいウィンドウを開く（既存ウィンドウは使い回さない）
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
    const { column, row, id: taskId, promptColumn, multiAI } = task;
    
    // タスクはpromptColumnでグループ化されているので、それを使用
    const queueColumn = promptColumn || column;

    this.logger.log(`[StreamProcessor] タスク完了: ${column}${row}`, {
      result: result.success ? "success" : "failed",
      skipped: result.skipped || false,
      queueColumn: queueColumn,
      multiAI: multiAI
    });

    // タスクを完了済みにマーク
    this.completedTasks.add(taskId);

    // 成功した場合の追加処理（AIタスクの場合のみ）
    if (result.success && result.response && task.taskType === "ai") {
      if (this.isTestMode) {
        // テストモード：ログに表示のみ
        this.logger.log(`[StreamProcessor] テスト回答取得: ${task.column}${task.row} -> ${result.response.substring(0, 100)}...`);
      } else {
        // 本番モード：スプレッドシートに書き込み + ログ表示
        this.logger.log(`[StreamProcessor] 本番回答取得: ${task.column}${task.row} -> ${result.response.substring(0, 100)}...`);
        try {
          await this.writeResultToSpreadsheet(task, result);
          this.logger.log(`[StreamProcessor] 本番回答を書き込み: ${task.column}${task.row}`);
        } catch (error) {
          this.logger.error(`[StreamProcessor] 結果の保存エラー`, error);
        }
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

    // ■ 3種類AIグループの特別処理
    if (multiAI) {
      // 3種類AIの場合、同じ行の3つすべてが完了したかチェック
      const tasks = this.taskQueue.get(queueColumn);
      const sameRowTasks = tasks.filter(t => t.row === row);
      const completedCount = sameRowTasks.filter(t => this.completedTasks.has(t.id)).length;
      
      this.logger.log(`[StreamProcessor] 3種類AI進捗: 行${row} - ${completedCount}/${sameRowTasks.length}完了`);
      
      // 3つすべて完了していない場合は、他のタスクの完了を待つ
      if (completedCount < sameRowTasks.length) {
        // ウィンドウは開いたままにして、他のタスクの完了を待つ
        return;
      }
      
      // 3つすべて完了した場合、次の行へ進む
      this.logger.log(`[StreamProcessor] 3種類AI行${row}完了 → 次の行へ`);
      
      // ウィンドウを閉じる（3つとも）
      for (const t of sameRowTasks) {
        const windowId = this.columnWindows.get(t.column);
        if (windowId) {
          await this.closeColumnWindow(t.column);
        }
      }
      
      // 3種類AI完了時は次の行の処理は並列ストリーミングで自動開始される
    } else {
      // 通常の処理（単独AI）
      // 現在のウィンドウを閉じる（タスク完了ごとに必ず閉じる）
      this.logger.log(`[StreamProcessor] タスク完了によりウィンドウを閉じます: ${queueColumn}列`);
      await this.closeColumnWindow(queueColumn);
      
      // 通常処理の次タスクも並列ストリーミングで自動開始される
      this.logger.log(`[StreamProcessor] ${queueColumn}列のタスクが全て完了`);
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

      await globalThis.sheetsClient.updateCell(
        spreadsheetId,
        range,
        result.response,
        gid  // gidを渡してシート名を含む範囲にする
      );

      this.logger.log(`[StreamProcessor] 回答を書き込み: ${range}`);
      
      // ■ 記載完了を記録（並列ストリーミングの核心）
      const cellKey = `${task.promptColumn || task.column}${task.row}`;
      this.writtenCells.set(cellKey, true);
      this.logger.log(`[StreamProcessor] 記載完了マーク: ${cellKey}`);
      
      // ■ この記載により、次の列の同じ行を開始できるかチェック
      await this.checkAndStartNextColumnForRow(task.promptColumn || task.column, task.row);
      
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
   * 記載完了後、次の列の同じ行を開始できるかチェック
   * @param {string} column - 記載が完了した列
   * @param {number} row - 記載が完了した行
   */
  async checkAndStartNextColumnForRow(column, row) {
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
    
    // 現在の処理インデックスが該当行に到達しているか確認
    const currentIndex = this.currentRowByColumn.get(nextColumn) || 0;
    const taskIndex = nextColumnTasks.indexOf(nextTask);
    
    if (taskIndex !== currentIndex) {
      this.logger.log(`[StreamProcessor] ${nextColumn}列はまだ行${row}に到達していない（現在: 行${nextColumnTasks[currentIndex]?.row}）`);
      return;
    }
    
    // ■ 並列ストリーミング: 前の列の記載完了により次の列を開始
    this.logger.log(`[StreamProcessor] 📋 並列ストリーミング発動！`);
    this.logger.log(`[StreamProcessor]   ${column}列の行${row}記載完了 → ${nextColumn}列の行${row}を開始`);
    
    // 次の列がまだウィンドウを持っていない場合のみ開始
    if (!this.columnWindows.has(nextColumn)) {
      await this.startColumnProcessing(nextColumn);
    }
  }
  
  /**
   * 列が3種類AIグループかチェック
   * @param {string} column - プロンプト列
   * @returns {boolean}
   */
  is3TypeGroup(column) {
    const tasks = this.taskQueue.get(column);
    if (!tasks || tasks.length === 0) return false;
    
    // 最初のタスクのmultiAIフラグをチェック
    return tasks[0].multiAI === true;
  }
  
  /**
   * 3種類AIタスクを並列で開始
   * @param {Array} tasks - 同じ行の3つのAIタスク（ChatGPT, Claude, Gemini）
   */
  async start3TypeParallel(tasks) {
    this.logger.log(`[StreamProcessor] 🚀 3種類AI並列処理開始`);
    this.logger.log(`[StreamProcessor]   行${tasks[0].row}: ${tasks.map(t => `${t.column}(${t.aiType})`).join(', ')}`);
    
    const parallelPromises = [];
    
    for (const task of tasks) {
      // ウィンドウ数の制限チェック
      if (this.activeWindows.size >= this.maxConcurrentWindows) {
        this.logger.log(`[StreamProcessor] ⚠️ ウィンドウ数上限のため${task.column}列は待機`);
        continue;
      }
      
      // 各AIタスクを並列で開始
      const position = task.preferredPosition !== undefined 
        ? task.preferredPosition 
        : this.findAvailablePosition();
        
      if (position === -1) {
        this.logger.log(`[StreamProcessor] 空きポジションがないため${task.column}列は待機`);
        continue;
      }
      
      parallelPromises.push(
        this.openWindowForColumn(task.column, task, position).catch(error => {
          this.logger.error(`[StreamProcessor] ${task.column}列エラー:`, {
            message: error.message,
            stack: error.stack
          });
          return null;
        })
      );
    }
    
    // すべてのタスクの完了を待つ
    await Promise.all(parallelPromises);
    this.logger.log(`[StreamProcessor] 3種類AI並列処理完了`);
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
