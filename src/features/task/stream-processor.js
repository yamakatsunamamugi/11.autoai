/**
 * @fileoverview StreamProcessor - AIタスクの並列ストリーミング処理システム
 * 
 * ■ システム概要
 * このモジュールは、複数のAI（ChatGPT、Claude、Gemini）に対して
 * 並列でプロンプトを送信し、結果をストリーミングで取得・記録するシステムです。
 * 
 * ■ 主要機能
 * 1. タスクキュー管理: 列・行単位でタスクを整理し、実行順序を制御
 * 2. ウィンドウ管理: 最大4つのブラウザウィンドウを並列で制御
 * 3. ストリーミング処理: AIの応答をリアルタイムで取得・記録
 * 4. 依存関係管理: タスク間の依存関係を解決し、適切な順序で実行
 * 5. エラーハンドリング: 再試行機能とエラーログの記録
 * 
 * ■ 処理フロー
 * 1. タスクリストの受信 → organizeTasks()でキュー化
 * 2. checkAndStartAvailableColumns()で開始可能なタスクを検出
 * 3. startColumnProcessing()で列単位の処理を開始
 * 4. processNextTask()で個別タスクを実行
 * 5. handleStreamData()でAIの応答をストリーミング処理
 * 6. writeResultToSpreadsheet()で結果をスプレッドシートに記録
 * 
 * ■ 特殊処理
 * - 3種類AIグループ: ChatGPT/Claude/Geminiを同時実行する特別なタスクグループ
 * - レポートタスク: 他のタスク結果を集約して要約を生成
 * - Sequential実行: 列間で依存関係を持つタスクの順次実行
 * 
 * ■ 依存関係
 * - windowManager: ブラウザウィンドウの管理
 * - modelManager: AI APIとの通信
 * - SpreadsheetLogger: スプレッドシートへの記録
 * - ReportManager: レポート生成（オプション）
 */

// stream-processor.js - 並列ストリーミング処理

// ReportManagerを動的にインポート
// Chrome拡張機能環境でのES6モジュール制限のため動的インポートを使用
let ReportManager = null;
let SpreadsheetLogger = null;

/**
 * ReportManagerの動的取得
 * 
 * ■ 動作
 * 1. 初回呼び出し時にReportManagerモジュールを動的インポート
 * 2. 取得したモジュールをキャッシュして再利用
 * 3. インポート失敗時はnullを返してフォールバック
 * 
 * ■ 依存関係
 * - ../report/report-manager.js モジュール
 * 
 * ■ 使用条件
 * - レポートタスクが存在する場合のみ呼び出される
 * - Chrome拡張機能環境でES6モジュールが利用可能な場合
 * 
 * @returns {Promise<Class|null>} ReportManagerクラスまたはnull
 */
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

/**
 * SpreadsheetLoggerの動的取得
 * 
 * ■ 動作
 * 1. グローバル空間からSpreadsheetLoggerクラスを検索
 * 2. クラスが見つからない場合はインスタンスから取得
 * 3. 取得したクラスをキャッシュして再利用
 * 
 * ■ 依存関係
 * - globalThis.SpreadsheetLogger (クラス)
 * - globalThis.spreadsheetLogger (インスタンス)
 * 
 * ■ 使用条件
 * - Service Worker環境での実行時
 * - スプレッドシートへの記録が必要な場合
 * 
 * ■ 特記事項
 * Service Worker環境では動的インポートが制限されるため、
 * グローバル空間に事前に登録されたクラスを使用
 * 
 * @returns {Promise<Class|null>} SpreadsheetLoggerクラスまたはnull
 */
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
  /**
   * StreamProcessorのコンストラクタ
   * 
   * ■ 初期化内容
   * 1. 依存関係の注入（windowManager、modelManager、logger）
   * 2. ウィンドウ管理状態の初期化
   * 3. タスクキューとトラッキング用データ構造の初期化
   * 4. SpreadsheetLoggerのインスタンス作成
   * 
   * ■ 依存関係
   * - windowManager: AIウィンドウの開閉・制御を管理
   * - modelManager: AI APIとの通信を管理
   * - logger: ログ出力（デフォルト: console）
   * 
   * ■ 初期化される主要なプロパティ
   * - activeWindows: 開いているウィンドウの管理Map
   * - columnWindows: 列とウィンドウの対応Map
   * - taskQueue: 列ごとのタスクキュー
   * - completedTasks: 完了済みタスクのSet
   * - writtenCells: スプレッドシートに記載済みのセル
   * 
   * @param {Object} dependencies - 依存関係オブジェクト
   */
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
    
    // 通常処理バッチ管理（新規追加）
    this.normalBatchTracker = new Map(); // batchId → {column, tasks: [], windows: Map(), completed: Set()}
    this.activeBatchIds = new Set(); // 実行中のバッチID
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

      // 新しい処理フローで開始
      await this.processAllTasks()

      return {
        success: true,
        totalGroups: Math.ceil(taskList.tasks.length / 3),
        processedTasks: taskList.tasks.length,
      };
    } catch (error) {
      this.logger.error("[StreamProcessor] 処理エラー", error);
      throw error;
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * タスクをグループ単位に整理
   * @param {TaskList} taskList
   * @returns {Array} グループ配列
   */
  createTaskGroups(taskList) {
    const groups = [];
    const processedTasks = new Set();
    
    // まずタスクを列ごとに整理
    this.organizeTasks(taskList);
    
    // 行番号順にソート
    const allRows = [...new Set(taskList.tasks.map(t => t.row))].sort((a, b) => a - b);
    
    for (const row of allRows) {
      // 3種類AIグループをチェック
      const threeTypeTasks = taskList.tasks.filter(t => 
        t.row === row && 
        t.multiAI && 
        !processedTasks.has(t.id)
      );
      
      if (threeTypeTasks.length >= 3) {
        // 3種類AIグループを作成
        const groupId = threeTypeTasks[0].groupId;
        const columns = [...new Set(threeTypeTasks.map(t => t.column))].sort();
        
        // この行から始まる連続した行を収集
        const rows = [];
        let currentRow = row;
        
        while (true) {
          const tasksInRow = taskList.tasks.filter(t => 
            t.row === currentRow && 
            columns.includes(t.column) &&
            t.multiAI &&
            !processedTasks.has(t.id)
          );
          
          if (tasksInRow.length === columns.length) {
            rows.push(currentRow);
            tasksInRow.forEach(t => processedTasks.add(t.id));
            currentRow++;
          } else {
            break;
          }
        }
        
        if (rows.length > 0) {
          groups.push({
            type: '3type',
            columns: columns,
            rows: rows,
            tasks: taskList.tasks.filter(t => 
              columns.includes(t.column) && 
              rows.includes(t.row)
            )
          });
        }
      }
    }
    
    // 1種類AI（単独）のグループを作成
    const singleAIColumns = [...new Set(
      taskList.tasks
        .filter(t => !t.multiAI && !processedTasks.has(t.id))
        .map(t => t.column)
    )].sort();
    
    for (const column of singleAIColumns) {
      const columnTasks = taskList.tasks
        .filter(t => t.column === column && !processedTasks.has(t.id))
        .sort((a, b) => a.row - b.row);
      
      // 3行ずつのバッチに分割
      for (let i = 0; i < columnTasks.length; i += 3) {
        const batchTasks = columnTasks.slice(i, Math.min(i + 3, columnTasks.length));
        const rows = batchTasks.map(t => t.row);
        
        groups.push({
          type: 'single',
          columns: [column],
          rows: rows,
          tasks: batchTasks
        });
        
        batchTasks.forEach(t => processedTasks.add(t.id));
      }
    }
    
    // レポートタスクのグループを作成
    const reportTasks = taskList.tasks.filter(t => 
      t.taskType === 'report' && !processedTasks.has(t.id)
    );
    
    for (const task of reportTasks) {
      groups.push({
        type: 'report',
        columns: [task.column],
        rows: [task.row],
        tasks: [task]
      });
      processedTasks.add(task.id);
    }
    
    this.logger.log(`[StreamProcessor] グループ作成完了:`, groups.map(g => ({
      type: g.type,
      columns: g.columns,
      rows: g.rows,
      taskCount: g.tasks.length
    })));
    
    return groups;
  }

  /**
   * グループを処理
   * @param {Object} group - タスクグループ
   */
  async processGroup(group) {
    this.logger.log(`[StreamProcessor] グループ処理開始: ${group.type}`, {
      columns: group.columns,
      rows: group.rows,
      taskCount: group.tasks.length
    });
    
    if (group.type === '3type') {
      await this.processThreeTypeGroup(group);
    } else if (group.type === 'single') {
      await this.processSingleGroup(group);
    } else if (group.type === 'report') {
      await this.processReportGroup(group);
    }
    
    this.logger.log(`[StreamProcessor] グループ処理完了: ${group.type}`);
  }
  
  /**
   * 3種類AIグループを処理
   * @param {Object} group
   */
  async processThreeTypeGroup(group) {
    const { columns, rows, tasks } = group;
    this.logger.log(`[StreamProcessor] 3種類AIグループ処理: ${columns.join(',')}列 x ${rows.length}行`);
    
    // 3つのウィンドウを開く
    const windows = new Map();
    
    for (const column of columns) {
      const firstTask = tasks.find(t => t.column === column && t.row === rows[0]);
      if (!firstTask) continue;
      
      const position = this.findAvailablePosition();
      const windowId = await this.openWindow(firstTask, position);
      windows.set(column, windowId);
      
      this.logger.log(`[StreamProcessor] ウィンドウ作成: ${column}列 (${firstTask.aiType})`);
    }
    
    // 各行を順次処理
    for (const row of rows) {
      const rowTasks = tasks.filter(t => t.row === row);
      
      // 3つのタスクを並列実行
      await Promise.all(rowTasks.map(async (task) => {
        const windowId = windows.get(task.column);
        if (windowId) {
          await this.executeTaskInWindow(task, windowId);
        }
      }));
      
      this.logger.log(`[StreamProcessor] 3種類AI行${row}完了`);
    }
    
    // ウィンドウを閉じる
    for (const windowId of windows.values()) {
      try {
        await chrome.windows.remove(windowId);
      } catch (error) {
        this.logger.warn(`[StreamProcessor] ウィンドウクローズエラー`, error);
      }
    }
  }
  
  /**
   * 1種類AIグループを処理（3ウィンドウで並列処理）
   * @param {Object} group
   */
  async processSingleGroup(group) {
    const { columns, rows, tasks } = group;
    const column = columns[0];
    
    this.logger.log(`[StreamProcessor] 1種類AIグループ処理: ${column}列 x ${rows.length}行（3ウィンドウ並列）`);
    
    // 3つのウィンドウを開く（各行に1つずつ）
    const windows = new Map();
    
    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];
      const position = this.findAvailablePosition();
      const windowId = await this.openWindow(task, position);
      windows.set(task.row, windowId);
      
      this.logger.log(`[StreamProcessor] ウィンドウ${i + 1}作成: ${column}${task.row} (${task.aiType})`);
    }
    
    // タスクを並列処理
    await Promise.all(tasks.map(async (task) => {
      const windowId = windows.get(task.row);
      if (windowId) {
        await this.executeTaskInWindow(task, windowId);
        this.logger.log(`[StreamProcessor] タスク完了: ${task.column}${task.row}`);
      }
    }));
    
    this.logger.log(`[StreamProcessor] ${column}列のバッチ完了（行${rows.join(',')}）`);
    
    // ウィンドウを閉じる
    for (const windowId of windows.values()) {
      try {
        await chrome.windows.remove(windowId);
      } catch (error) {
        this.logger.warn(`[StreamProcessor] ウィンドウクローズエラー`, error);
      }
    }
  }
  
  /**
   * レポートグループを処理
   * @param {Object} group
   */
  async processReportGroup(group) {
    const task = group.tasks[0];
    this.logger.log(`[StreamProcessor] レポートタスク処理: ${task.column}${task.row}`);
    
    // レポートタスクは特別処理
    await this.executeReportTask(task, -1);
  }
  
  /**
   * ウィンドウを開く
   * @param {Task} task
   * @param {number} position
   * @returns {Promise<number>} windowId
   */
  async openWindow(task, position) {
    const url = this.determineAIUrl(task.aiType, task.column);
    const screenInfo = await this.getScreenInfo();
    const windowPosition = this.calculateWindowPosition(position, screenInfo);
    
    const window = await chrome.windows.create({
      url: url,
      type: "popup",
      focused: false,
      ...windowPosition,
    });
    
    this.activeWindows.set(window.id, {
      windowId: window.id,
      column: task.column,
      position: position,
      aiType: task.aiType,
      createdAt: new Date(),
    });
    
    this.windowPositions.set(position, window.id);
    
    // ページの読み込みを待機
    await this.waitForContentScriptReady(window.id);
    
    // 自動化スクリプトを注入
    await this.injectAutomationScripts(window.id, task.aiType);
    
    return window.id;
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
   * 全タスクを処理（新規追加）
   * 3種類AIと通常処理を適切に振り分ける
   */
  async processAllTasks() {
    this.logger.log('[StreamProcessor] 全タスク処理開始');
    
    // タスクを3種類AIと通常処理に分類
    const threeTypeGroups = new Map(); // groupId → tasks[]
    const normalColumns = new Map(); // column → tasks[]
    
    for (const [column, tasks] of this.taskQueue.entries()) {
      for (const task of tasks) {
        if (task.multiAI && task.groupId) {
          // 3種類AIグループ
          if (!threeTypeGroups.has(task.groupId)) {
            threeTypeGroups.set(task.groupId, []);
          }
          threeTypeGroups.get(task.groupId).push(task);
        } else {
          // 通常処理
          if (!normalColumns.has(column)) {
            normalColumns.set(column, []);
          }
          normalColumns.get(column).push(task);
        }
      }
    }
    
    this.logger.log(`[StreamProcessor] タスク分類完了:`, {
      threeTypeGroups: threeTypeGroups.size,
      normalColumns: normalColumns.size
    });
    
    // 3種類AIグループを処理
    for (const [groupId, groupTasks] of threeTypeGroups) {
      this.logger.log(`[StreamProcessor] 3種類AIグループ処理: ${groupId}`);
      await this.process3TypeGroup(groupTasks);
    }
    
    // 通常処理列を並列で処理
    const normalPromises = [];
    for (const [column, tasks] of normalColumns) {
      this.logger.log(`[StreamProcessor] 通常処理列開始: ${column}列`);
      normalPromises.push(this.processNormalColumn(column));
    }
    
    // 全ての通常処理列の完了を待つ
    await Promise.all(normalPromises);
    
    this.logger.log('[StreamProcessor] 全タスク処理完了');
  }
  
  /**
   * 3種類AIグループを処理（新規追加）
   * @param {Array} groupTasks - グループのタスク配列
   */
  async process3TypeGroup(groupTasks) {
    if (!groupTasks || groupTasks.length === 0) return;
    
    // 行番号でグループ化
    const tasksByRow = new Map();
    for (const task of groupTasks) {
      if (!tasksByRow.has(task.row)) {
        tasksByRow.set(task.row, []);
      }
      tasksByRow.get(task.row).push(task);
    }
    
    // 行番号順にソート
    const sortedRows = Array.from(tasksByRow.keys()).sort((a, b) => a - b);
    
    this.logger.log(`[StreamProcessor] 3種類AIグループ: ${sortedRows.length}行`);
    
    // 各行を順番に処理
    for (const row of sortedRows) {
      const rowTasks = tasksByRow.get(row);
      await this.start3TypeBatch(rowTasks, row);
    }
  }
  
  /**
   * 3種類AIバッチを開始（新規追加）
   * @param {Array} rowTasks - 行のタスク配列
   * @param {number} row - 行番号
   */
  async start3TypeBatch(rowTasks, row) {
    const batchId = `3type_row${row}_${Date.now()}`;
    
    this.logger.log(`[StreamProcessor] 🔷 3種類AIバッチ開始: 行${row}`);
    this.logger.log(`[StreamProcessor] タスク: ${rowTasks.map(t => `${t.column}${t.row}`).join(', ')}`);
    
    // 3つのウィンドウを並列で開いてタスクを実行
    const windowPromises = rowTasks.map(async (task) => {
      try {
        // ポジションを探す
        const position = this.findAvailablePosition();
        if (position === -1) {
          throw new Error('利用可能なポジションがありません');
        }
        
        // ウィンドウを開く
        const windowId = await this.openWindowForTask(task, position);
        if (!windowId) {
          throw new Error(`ウィンドウを開けませんでした: ${task.column}${task.row}`);
        }
        
        // タスクを実行
        await this.executeTaskInWindow(task, windowId);
        
        // ウィンドウを閉じる
        await chrome.windows.remove(windowId);
        this.activeWindows.delete(windowId);
        // positionからも削除
        for (const [pos, wId] of this.windowPositions.entries()) {
          if (wId === windowId) {
            this.windowPositions.delete(pos);
            break;
          }
        }
        
      } catch (error) {
        this.logger.error(`[StreamProcessor] 3種類AIタスクエラー: ${task.column}${task.row}`, error);
      }
    });
    
    // 全タスクの完了を待つ
    await Promise.allSettled(windowPromises);
    
    this.logger.log(`[StreamProcessor] 3種類AIバッチ完了: 行${row}`);
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
        `[StreamProcessor] ウィンドウ作成: ${column}列 (${task.aiType}) - 位置: ${["左", "中央", "右"][position]} (windowId: ${window.id})`,
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
   * 既存のウィンドウでタスクを実行（完了まで待機）
   * @param {Task} task
   * @param {number} windowId
   * @returns {Promise<Object>} 実行結果
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

      // タスク完了処理（スプレッドシート書き込みを含む）
      await this.handleTaskResult(task, windowId, result);
      return result;
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
        // エラーをスキップ
        const errorResult = {
          success: false,
          error: `エラー上限到達: ${error.message}`,
          skipped: true,
        };
        await this.handleTaskResult(task, windowId, errorResult);
        return errorResult;
      }
      // それ以外は何もしない（リトライは別途実装）
    }
  }

  /**
   * タスク結果を処理（シンプル版）
   * @param {Task} task
   * @param {number} windowId
   * @param {Object} result
   */
  async handleTaskResult(task, windowId, result) {
    const cellPosition = `${task.column}${task.row}`;
    
    this.logger.log(`[StreamProcessor] タスク結果処理: ${cellPosition}`, {
      success: result.success,
      error: result.error
    });
    
    // タスクを完了済みにマーク
    this.completedTasks.add(task.id);
    
    // 成功した場合はスプレッドシートに書き込み
    if (result.success && result.response) {
      if (this.outputTarget === 'spreadsheet') {
        await this.writeResultToSpreadsheet(task, result);
      }
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
    
    // 通常処理バッチの完了をチェック（新規追加）
    if (!task.multiAI) {
      await this.updateNormalBatchCompletion(task);
    }

    // 同じ列の次の行へ進むための情報を先に計算
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
    
    
    if (hasMoreTasks) {
      this.logger.log(`[StreamProcessor] 🔄 ${column}列の次のタスクあり`);
    } else {
      this.logger.log(`[StreamProcessor] 🎯 ${column}列の全タスク完了`);
    }

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
      
      // ウィンドウクローズチェック（スプレッドシート書き込み後）
      const columnTasks = this.taskQueue.get(answerColumn);
      const columnIndex = this.currentRowByColumn.get(answerColumn) || 0;
      const hasMoreTasksInColumn = columnTasks && columnIndex < columnTasks.length;
      
      if (!hasMoreTasksInColumn && this.columnWindows.has(answerColumn)) {
        // この列の全タスクが完了したらウィンドウを閉じる
        this.logger.log(`[StreamProcessor] 🚪 スプレッドシート書き込み完了、ウィンドウを閉じます: ${answerColumn}列`);
        await this.closeColumnWindow(answerColumn);
        this.logger.log(`[StreamProcessor] ✅ ウィンドウクローズ完了: ${answerColumn}列`);
        
        // ウィンドウが空いたので、利用可能な列をチェック
        this.checkAndStartAvailableColumns().catch(error => {
          this.logger.error(`[StreamProcessor] 利用可能列チェックエラー`, error);
        });
      }
      
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
            isLastInGroup
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
    
    // 1種類AIの場合、次のバッチを開始
    const tasks = this.taskQueue.get(column);
    const currentIndex = this.currentRowByColumn.get(column) || 0;
    
    if (tasks && currentIndex < tasks.length) {
      const nextTask = tasks[currentIndex];
      if (!nextTask.multiAI) {
        // 1種類AIの次のバッチを開始
        this.logger.log(`[StreamProcessor] 📋 1種類AI次のバッチ開始: ${column}列の行${nextTask.row}から`);
        await this.startColumnProcessing(column);
        return;
      }
    }
    
    // 待機中の列があればそれを再開する
    this.checkAndStartWaitingColumns();
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
    let nextThreeTypeGroupId = null;
    let groupColumns = [];
    
    // まず3種類AIグループを探す
    for (const column of columns) {
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
            this.logger.log(`[StreamProcessor] 新しい3種類AIグループを検出: ${nextThreeTypeGroupId}`);
          }
          
          // 同じグループの列を収集
          if (task.groupId === nextThreeTypeGroupId) {
            groupColumns.push(column);
          }
        }
      }
    }
    
    // 3種類AIグループが見つかった場合、全列を同時に開始
    if (nextThreeTypeGroupId && groupColumns.length > 0) {
      this.logger.log(`[StreamProcessor] 3種類AIグループ ${nextThreeTypeGroupId} を開始: ${groupColumns.join(', ')}列`);
      for (const column of groupColumns) {
        this.logger.log(`[StreamProcessor] ${column}列を開始`);
        this.startColumnProcessing(column).catch(error => {
          this.logger.error(`[StreamProcessor] ${column}列エラー`, error);
        });
      }
      return;
    }
    
    // 3種類AIグループがない場合、通常のタスクを処理
    let started = 0;
    for (const column of columns) {
      if (started >= availableSlots) break;
      
      // すでにウィンドウがある列はスキップ
      if (this.columnWindows.has(column)) continue;
      
      const tasks = this.taskQueue.get(column);
      const index = this.currentRowByColumn.get(column) || 0;
      
      if (tasks && index < tasks.length) {
        const task = tasks[index];
        
        // 3種類AIタスクはスキップ（既に処理済み）
        if (task.multiAI && task.groupId) continue;
        
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
   * 記載完了後、次のタスクを開始できるかチェック
   * 
   * ■ 処理パターン
   * 1. 3種類AI並列処理: 同じ行を3つのウィンドウで並列処理（F9,G9,H9 → F10,G10,H10）
   * 2. 1種類AI連続処理: 同じ列で3行ずつ連続処理（F9,F10,F11 → F12,F13,F14）
   * 
   * @param {string} column - 記載が完了した列（例: "F", "G", "H"）
   * @param {number} row - 記載が完了した行（例: 9）
   */
  async checkAndStartNextColumnForRow(column, row) {
    // ======= STEP 1: 現在のタスク情報を取得 =======
    // 現在の列のタスクキューから、該当行のタスクを探す
    const currentColumnTasks = this.taskQueue.get(column);
    const currentTask = currentColumnTasks?.find(t => t.row === row);
    
    // ======= STEP 2: 3種類AI並列処理の場合 =======
    // 3種類AIは同じ行を並列で処理（横方向）
    if (currentTask?.multiAI && currentTask?.groupId) {
      // 同じグループIDを持つ全タスクの列を取得（例: F,G,H列）
      const answerColumns = this.getGroupAnswerColumns(currentTask.groupId, row);
      
      // 全列が記載完了しているかチェック
      const allWritten = answerColumns.every(col => 
        this.writtenCells.has(`${col}${row}`)
      );
      
      if (!allWritten) {
        // まだ記載されていない列がある場合
        const writtenColumns = answerColumns.filter(col => this.writtenCells.has(`${col}${row}`));
        this.logger.log(`[StreamProcessor] 3種類AI並列処理中: ${writtenColumns.length}/${answerColumns.length}列完了 (行${row})`);
        return;
      }
      
      // 全列記載完了の場合、次の行に進む
      this.logger.log(`[StreamProcessor] 🎯 3種類AI行${row}完了 → 次の行へ`);
      
      // グループが完了したら次の行の3種類AIグループを開始
      if (this.activeThreeTypeGroupId === currentTask.groupId) {
        this.activeThreeTypeGroupId = null;
        
        // 次の行の3種類AIグループを探して開始
        await this.startNextThreeTypeRow(answerColumns, row + 1);
      }
      return;
    }
    
    // ======= STEP 3: 1種類AI連続処理の場合 =======
    // 1種類AIは同じ列で3行ずつ処理（縦方向）
    if (!currentTask?.multiAI) {
      // 現在の列のタスクリストを取得
      const columnTasks = this.taskQueue.get(column);
      const currentIndex = this.currentRowByColumn.get(column) || 0;
      
      // 次のタスクがあるかチェック
      if (columnTasks && currentIndex < columnTasks.length) {
        const nextTask = columnTasks[currentIndex];
        
        // 3行単位のバッチで処理しているか判定
        const batchStart = Math.floor((nextTask.row - 9) / 3) * 3 + 9;
        const batchEnd = batchStart + 2;
        
        // 現在のバッチ内にまだ未処理タスクがある場合
        if (nextTask.row <= batchEnd) {
          this.logger.log(`[StreamProcessor] 📋 1種類AI連続処理: ${column}列の行${nextTask.row}を開始`);
          
          // 同じウィンドウで次のタスクを処理
          const windowId = this.columnWindows.get(column);
          if (windowId) {
            await this.processNextTask(column, windowId);
          }
          return;
        }
      }
      
      // バッチ完了後、ウィンドウを閉じて次のバッチへ
      this.logger.log(`[StreamProcessor] ${column}列の3行バッチ完了`);
      await this.closeColumnWindow(column);
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
   * 通常処理列を3タスクずつのバッチで処理（新規追加）
   * @param {string} column - 処理する列
   */
  async processNormalColumn(column) {
    const tasks = this.taskQueue.get(column);
    if (!tasks || tasks.length === 0) return;
    
    this.logger.log(`[StreamProcessor] 通常処理列開始: ${column}列 (${tasks.length}タスク)`);
    
    // 3タスクずつのバッチに分割
    const batches = [];
    for (let i = 0; i < tasks.length; i += 3) {
      const batchTasks = tasks.slice(i, Math.min(i + 3, tasks.length));
      batches.push(batchTasks);
    }
    
    this.logger.log(`[StreamProcessor] ${column}列を${batches.length}バッチに分割`);
    
    // 最初のバッチを開始
    if (batches.length > 0) {
      await this.startNormalBatch(column, batches[0], 0, batches.length);
    }
  }
  
  /**
   * 通常処理の3タスクバッチを開始（新規追加）
   * @param {string} column - 列
   * @param {Array} batchTasks - バッチ内のタスク配列（最大3つ）
   * @param {number} batchIndex - バッチインデックス
   * @param {number} totalBatches - 全バッチ数
   */
  async startNormalBatch(column, batchTasks, batchIndex, totalBatches) {
    const batchId = `batch_${column}_${batchIndex}_${Date.now()}`;
    
    this.logger.log(`[StreamProcessor] 📦 バッチ開始: ${batchId} (${batchIndex + 1}/${totalBatches})`);
    this.logger.log(`[StreamProcessor] タスク: ${batchTasks.map(t => `${t.column}${t.row}`).join(', ')}`);
    
    // バッチトラッカーに登録
    const batchInfo = {
      column: column,
      batchIndex: batchIndex,
      totalBatches: totalBatches,
      tasks: batchTasks,
      windows: new Map(), // taskId → windowId
      completed: new Set(),
      startTime: Date.now()
    };
    
    this.normalBatchTracker.set(batchId, batchInfo);
    this.activeBatchIds.add(batchId);
    
    // 3つのウィンドウを並列で開いてタスクを実行
    const windowPromises = batchTasks.map(async (task, index) => {
      try {
        // ポジションを探す
        const position = this.findAvailablePosition();
        if (position === -1) {
          throw new Error('利用可能なポジションがありません');
        }
        
        // ウィンドウを開く
        const windowId = await this.openWindowForTask(task, position);
        if (!windowId) {
          throw new Error(`ウィンドウを開けませんでした: ${task.column}${task.row}`);
        }
        
        // バッチ情報にウィンドウIDを記録
        batchInfo.windows.set(task.id, windowId);
        
        // タスクを実行
        await this.executeTaskInWindow(task, windowId);
        
      } catch (error) {
        this.logger.error(`[StreamProcessor] バッチタスクエラー: ${task.column}${task.row}`, error);
        // エラーでも完了扱いにして次に進む
        batchInfo.completed.add(task.id);
      }
    });
    
    // 全タスクの実行を待つ（並列実行）
    await Promise.allSettled(windowPromises);
    
    this.logger.log(`[StreamProcessor] バッチ${batchId}の全タスク開始完了`);
  }
  
  /**
   * タスク用のウィンドウを開く（新規追加）
   * @param {Object} task - タスク
   * @param {number} position - ウィンドウ位置
   * @returns {Promise<number>} ウィンドウID
   */
  async openWindowForTask(task, position) {
    const url = this.determineAIUrl(task.aiType, task.column);
    const screenInfo = await this.getScreenInfo();
    const windowPosition = this.calculateWindowPosition(position, screenInfo);
    
    try {
      const window = await chrome.windows.create({
        url: url,
        ...windowPosition,
        focused: false,
        type: "normal",
      });
      
      // ウィンドウ情報を記録
      this.activeWindows.set(window.id, {
        windowId: window.id,
        column: task.column,
        position: position,
        aiType: task.aiType,
        taskId: task.id,
        createdAt: Date.now()
      });
      
      this.windowPositions.set(position, window.id);
      this.columnWindows.set(task.column, window.id);
      
      // 自動化スクリプトを注入
      await this.injectAutomationScripts(window.id, task.aiType);
      
      return window.id;
    } catch (error) {
      this.logger.error(`[StreamProcessor] ウィンドウ作成エラー`, error);
      // 予約を解除
      if (this.windowPositions.get(position) === 'RESERVED') {
        this.windowPositions.delete(position);
      }
      return null;
    }
  }
  
  /**
   * 通常処理バッチの完了をチェックして次のバッチを開始（新規追加）
   * @param {string} batchId - バッチID
   */
  async checkAndStartNextNormalBatch(batchId) {
    const batchInfo = this.normalBatchTracker.get(batchId);
    if (!batchInfo) return;
    
    // 全タスクが完了しているかチェック
    if (batchInfo.completed.size === batchInfo.tasks.length) {
      const duration = ((Date.now() - batchInfo.startTime) / 1000).toFixed(1);
      this.logger.log(`[StreamProcessor] ✅ バッチ完了: ${batchId} (${duration}秒)`);
      
      // バッチのウィンドウを全て閉じる
      await this.closeNormalBatchWindows(batchId);
      
      // 次のバッチを開始
      const nextBatchIndex = batchInfo.batchIndex + 1;
      if (nextBatchIndex < batchInfo.totalBatches) {
        // 列の全タスクを取得
        const allTasks = this.taskQueue.get(batchInfo.column);
        const nextBatchTasks = allTasks.slice(nextBatchIndex * 3, (nextBatchIndex + 1) * 3);
        
        if (nextBatchTasks.length > 0) {
          this.logger.log(`[StreamProcessor] 次のバッチを開始: ${batchInfo.column}列 バッチ${nextBatchIndex + 1}`);
          await this.startNormalBatch(batchInfo.column, nextBatchTasks, nextBatchIndex, batchInfo.totalBatches);
        }
      } else {
        this.logger.log(`[StreamProcessor] ${batchInfo.column}列の全バッチ完了`);
      }
      
      // トラッカーから削除
      this.normalBatchTracker.delete(batchId);
      this.activeBatchIds.delete(batchId);
    }
  }
  
  /**
   * 通常処理バッチのウィンドウを閉じる（新規追加）
   * @param {string} batchId - バッチID
   */
  async closeNormalBatchWindows(batchId) {
    const batchInfo = this.normalBatchTracker.get(batchId);
    if (!batchInfo) return;
    
    this.logger.log(`[StreamProcessor] バッチのウィンドウを閉じる: ${batchId} (${batchInfo.windows.size}個)`);
    
    const closePromises = [];
    for (const [taskId, windowId] of batchInfo.windows) {
      closePromises.push(
        chrome.windows.remove(windowId)
          .then(() => {
            this.logger.log(`[StreamProcessor] ✅ Window${windowId}を閉じた`);
            // 管理情報をクリア
            this.activeWindows.delete(windowId);
            // positionからも削除
            for (const [pos, wId] of this.windowPositions.entries()) {
              if (wId === windowId) {
                this.windowPositions.delete(pos);
                break;
              }
            }
            // columnWindowsからも削除
            for (const [col, wId] of this.columnWindows.entries()) {
              if (wId === windowId) {
                this.columnWindows.delete(col);
                break;
              }
            }
          })
          .catch(error => {
            this.logger.debug(`[StreamProcessor] Window${windowId}クローズエラー（無視）: ${error.message}`);
          })
      );
    }
    
    await Promise.all(closePromises);
    this.logger.log(`[StreamProcessor] バッチウィンドウクローズ完了: ${batchId}`);
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
   * 次の行の3種類AIグループを開始
   * @param {Array<string>} columns - 処理する列（例: ["F", "G", "H"]）
   * @param {number} nextRow - 次の行番号
   */
  async startNextThreeTypeRow(columns, nextRow) {
    this.logger.log(`[StreamProcessor] 3種類AI次の行チェック: 行${nextRow}`);
    
    // 各列で次の行のタスクがあるか確認
    const tasksToStart = [];
    for (const column of columns) {
      const tasks = this.taskQueue.get(column);
      const currentIndex = this.currentRowByColumn.get(column) || 0;
      
      if (tasks && currentIndex < tasks.length) {
        const nextTask = tasks[currentIndex];
        if (nextTask.row === nextRow && nextTask.multiAI) {
          tasksToStart.push({ column, task: nextTask });
        }
      }
    }
    
    // 3つの列すべてに次の行のタスクがある場合のみ開始
    if (tasksToStart.length === columns.length) {
      this.logger.log(`[StreamProcessor] 🚀 3種類AI行${nextRow}を並列開始`);
      
      // グループIDを設定
      const groupId = tasksToStart[0].task.groupId;
      this.activeThreeTypeGroupId = groupId;
      
      // 3つのウィンドウを同時に開始
      for (const { column } of tasksToStart) {
        await this.startColumnProcessing(column);
      }
    } else {
      this.logger.log(`[StreamProcessor] 行${nextRow}は3種類AIタスクが揃っていません`);
    }
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
      
      // グループの全列を同時に開始（awaitなしで並列実行）
      for (const column of groupColumns) {
        this.logger.log(`[StreamProcessor] ${column}列を開始`);
        this.startColumnProcessing(column).catch(error => {
          this.logger.error(`[StreamProcessor] ${column}列エラー`, error);
        });
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
   * 通常処理バッチの完了を更新（新規追加）
   * @param {Object} task - 完了したタスク
   */
  async updateNormalBatchCompletion(task) {
    // どのバッチに属するか探す
    let targetBatchId = null;
    let targetBatchInfo = null;
    
    for (const [batchId, batchInfo] of this.normalBatchTracker) {
      if (batchInfo.tasks.some(t => t.id === task.id)) {
        targetBatchId = batchId;
        targetBatchInfo = batchInfo;
        break;
      }
    }
    
    if (!targetBatchId || !targetBatchInfo) {
      return; // バッチに属さないタスク
    }
    
    // タスクを完了に追加
    targetBatchInfo.completed.add(task.id);
    
    this.logger.log(`[StreamProcessor] バッチ進捗: ${targetBatchId}, 完了: ${targetBatchInfo.completed.size}/${targetBatchInfo.tasks.length}`);
    
    // バッチが完了したかチェック
    await this.checkAndStartNextNormalBatch(targetBatchId);
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
          // activeThreeTypeGroupIdは checkAndStartNextColumnForRow でクリアする
          // this.activeThreeTypeGroupId = null; // ここではクリアしない
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
    // 3分割レイアウト（左、中央、右）
    const thirdWidth = Math.floor(screenInfo.width / 3);
    const fullHeight = screenInfo.height;

    const positions = [
      {
        // 左
        left: screenInfo.left,
        top: screenInfo.top,
        width: thirdWidth,
        height: fullHeight,
      },
      {
        // 中央
        left: screenInfo.left + thirdWidth,
        top: screenInfo.top,
        width: thirdWidth,
        height: fullHeight,
      },
      {
        // 右
        left: screenInfo.left + thirdWidth * 2,
        top: screenInfo.top,
        width: thirdWidth,
        height: fullHeight,
      },
    ];

    return positions[index % 3];
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
