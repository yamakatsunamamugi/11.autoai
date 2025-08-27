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

// WindowServiceをインポート
import { WindowService } from '../../services/window-service.js';

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
    // windowPositionsの管理はWindowServiceに一元化
    this.columnWindows = new Map(); // column -> windowId (列とウィンドウの対応)
    this.maxConcurrentWindows = 4; // 4分割レイアウト対応

    // タスク管理状態
    this.taskQueue = new Map(); // column -> tasks[]
    this.currentRowByColumn = new Map(); // column -> currentRowNumber
    this.completedTasks = new Set(); // taskId
    this.failedTasksByColumn = new Map(); // column -> Set<task> (エラーになったタスク)
    this.errorRows = new Set(); // エラーになった行番号（次の列でスキップする）
    
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
    this.activeThreeTypeGroups = new Set(); // 実行中の3種類AIグループIDのセット
    
    // ペンディングレポートタスク管理
    this.pendingReportTasks = new Set(); // 待機中のレポートタスク
    this.reportCheckInterval = null; // レポートチェック用タイマー
    
    // 通常処理バッチ管理（新規追加）
    this.normalBatchTracker = new Map(); // batchId → {column, tasks: [], windows: Map(), completed: Set()}
    this.activeBatchIds = new Set(); // 実行中のバッチID
    
    // 実行中タスク管理（重複実行防止用）
    this.activeTasksByCell = new Map(); // `${column}${row}` -> { taskId, startTime, windowId }
    this.executionLock = new Set(); // 実行中のタスクID（排他制御用）
    
    // バッチトラッキング排他制御
    this.batchUpdateMutex = new Set(); // バッチ更新中のバッチID
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

    // デバッグ: 最初のタスクのsheetNameを確認
    if (taskList.tasks.length > 0) {
      const firstTask = taskList.tasks[0];
      console.log('[StreamProcessor] 最初のタスクのsheetName:', firstTask.sheetName);
      console.log('[StreamProcessor] 最初のタスク詳細:', {
        id: firstTask.id,
        row: firstTask.row,
        column: firstTask.column,
        sheetName: firstTask.sheetName,
        hasSheetName: !!firstTask.sheetName
      });
    }

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
    
    for (let i = 0; i < columns.length; i++) {
      const column = columns[i];
      const firstTask = tasks.find(t => t.column === column && t.row === rows[0]);
      if (!firstTask) continue;
      
      const position = i;  // インデックスをポジションとして使用（0, 1, 2）
      const windowId = await this.openWindow(firstTask, position);
      windows.set(column, windowId);
      
      this.logger.log(`[StreamProcessor] ウィンドウ作成: ${column}列 (${firstTask.aiType}) - Position: ${position}`);
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
        // WindowServiceを使用してウィンドウを閉じる（エラーハンドリングも統一）
        await WindowService.closeWindow(windowId);
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
      const position = i;  // インデックスをポジションとして使用（0, 1, 2, ...）
      const windowId = await this.openWindow(task, position);
      windows.set(task.row, windowId);
      
      this.logger.log(`[StreamProcessor] ウィンドウ${i + 1}作成: ${column}${task.row} (${task.aiType}) - Position: ${position}`);
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
        // WindowServiceを使用してウィンドウを閉じる（エラーハンドリングも統一）
        await WindowService.closeWindow(windowId);
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
    // WindowServiceを使用してAI URLを取得（ChatGPT/Claude/Gemini等のURL管理を一元化）
    const url = WindowService.getAIUrl(task.aiType);
    
    // WindowServiceのcreateWindowWithPositionを使用してウィンドウを作成
    // これにより位置計算とウィンドウ作成が一元化される
    const window = await WindowService.createWindowWithPosition(url, position, {
      type: 'popup',  // Chrome APIは 'normal', 'panel', 'popup' のみ許可
      aiType: task.aiType
    });
    
    this.activeWindows.set(window.id, {
      windowId: window.id,
      column: task.column,
      position: position,
      aiType: task.aiType,
      createdAt: new Date(),
    });
    
    // windowPositionsの管理はWindowServiceに一元化
    
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
    
    // ウィンドウ設定に基づいて拡張機能とスプレッドシートを配置
    await this.setupWindowsBasedOnSettings();
    
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
    
    // 通常処理列を順次処理（ポジション枯渇を防ぐため）
    for (const [column, tasks] of normalColumns) {
      this.logger.log(`[StreamProcessor] 通常処理列開始: ${column}列`);
      await this.processNormalColumn(column);
      this.logger.log(`[StreamProcessor] 通常処理列完了: ${column}列`);
    }
    
    this.logger.log('[StreamProcessor] 全タスク処理完了');
  }
  
  /**
   * 3種類AIグループを処理（新規追加）
   * @param {Array} groupTasks - グループのタスク配列
   */
  async process3TypeGroup(groupTasks) {
    if (!groupTasks || groupTasks.length === 0) return;
    
    // グループIDを取得
    const groupId = groupTasks[0].groupId;
    
    // グループを実行中として登録
    this.activeThreeTypeGroups.add(groupId);
    this.activeThreeTypeGroupId = groupId;
    
    // グループのタスクを記録（後で参照するため）
    this.groupTasksMap = this.groupTasksMap || new Map();
    this.groupTasksMap.set(groupId, groupTasks);
    
    try {
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
    } catch (error) {
      // エラー時のみ即座に解除
      this.activeThreeTypeGroups.delete(groupId);
      if (this.activeThreeTypeGroupId === groupId) {
        this.activeThreeTypeGroupId = null;
      }
      this.groupTasksMap.delete(groupId);
      throw error;
    }
    // finallyブロックを削除 - 記載完了後に解除するように変更
    
    this.logger.log(`[StreamProcessor] 3種類AIグループタスク実行完了（記載待ち）: ${groupId}`);
  }
  
  /**
   * 3種類AIバッチを開始（新規追加）
   * 
   * ■ 機能概要
   * 同一行の3種類AI（ChatGPT, Claude, Gemini）を並列実行します。
   * 一部のAIに既存回答がある場合でも、残りのAIは正常に処理されます。
   * 
   * ■ ポジション管理
   * - ChatGPT: position=0（左上）
   * - Claude: position=1（右上）  
   * - Gemini: position=2（左下）
   * - 各AIは固定ポジションに配置され、空きがあれば処理実行
   * 
   * ■ 処理フロー
   * 1. 利用可能なタスクを並列でウィンドウ作成
   * 2. 各AIが独立してタスク実行
   * 3. 全タスク完了後、一括でウィンドウクリーンアップ
   * 
   * @param {Array} rowTasks - 行のタスク配列（スキップされたAIは含まれない）
   * @param {number} row - 処理対象の行番号
   * @returns {Promise<void>} 処理完了のPromise
   */
  async start3TypeBatch(rowTasks, row) {
    const batchId = `3type_row${row}_${Date.now()}`;
    
    this.logger.log(`[StreamProcessor] 🔷 3種類AIバッチ開始: 行${row}`);
    this.logger.log(`[StreamProcessor] タスク: ${rowTasks.map(t => `${t.column}${t.row}`).join(', ')}`);
    
    // 開いたウィンドウを記録
    const openedWindows = [];
    const maxRetries = 3;
    const retryDelay = 2000;
    
    // 3つのウィンドウを並列で開いてタスクを実行（3種類AIは同時実行でOK）
    const windowPromises = rowTasks.map(async (task, index) => {
      let retryCount = 0;
      
      while (retryCount < maxRetries) {
        try {
          // ■ AIタイプ固定ポジション割り当て
          // 従来のindex基準ではなく、AIタイプで固定ポジションを決定
          // これにより、一部AIがスキップされても残りのAIが正常に処理される
          // 
          // ポジションマッピング:
          // - chatgpt: 0 (左上)  - F列など
          // - claude:  1 (右上)  - G列など  
          // - gemini:  2 (左下)  - H列など
          // - position 3 (右下) は通常処理用に予約
          const aiTypeToPosition = { 'chatgpt': 0, 'claude': 1, 'gemini': 2 };
          const position = aiTypeToPosition[task.aiType.toLowerCase()];
          
          if (position === undefined || position > 3) {
            throw new Error(`AIタイプ${task.aiType}のポジションが不正です`);
          }
          
          this.logger.log(`[StreamProcessor] ${task.aiType} → position=${position} (${task.column}${task.row})`);
        
        
          // ウィンドウを開く
          let windowId;
          try {
            windowId = await this.openWindowForTask(task, position);
          } catch (windowError) {
            // openWindowForTaskがエラーをスローした場合
            throw new Error(`ウィンドウを開けませんでした: ${task.column}${task.row} - ${windowError.message}`);
          }
          
          // 開いたウィンドウを記録
          openedWindows.push(windowId);
          
          // タスクを実行（リトライ機能付き）
          const result = await this.executeTaskInWindow(task, windowId);
          
          // 成功したらループを抜ける
          break;
          
        } catch (error) {
          retryCount++;
          if (retryCount >= maxRetries) {
            // リトライ上限に達した場合
            this.logger.error(`[StreamProcessor] 3種類AIタスク失敗: ${task.column}${task.row}`, error);
            // タスクを失敗として記録
            this.markTaskAsFailed(task);
          } else {
            this.logger.warn(`[StreamProcessor] リトライ ${retryCount}/${maxRetries}: ${task.column}${task.row}`);
            await new Promise(resolve => setTimeout(resolve, retryDelay));
          }
        }
      }
    });
    
    // 全タスクの完了を待つ
    await Promise.allSettled(windowPromises);
    
    // バッチ完了後、全ウィンドウを閉じる
    this.logger.log(`[StreamProcessor] 3種類AIバッチのウィンドウを閉じる: ${openedWindows.length}個`);
    for (const windowId of openedWindows) {
      try {
        // WindowServiceを使用してウィンドウを閉じる（ポジション解放も含めて一元管理）
        await WindowService.closeWindow(windowId);
        this.activeWindows.delete(windowId);
        // StreamProcessor側のwindowPositions管理は削除（WindowServiceに一元化）
        // WindowService.closeWindow()内でポジション解放が行われる
        this.logger.log(`[StreamProcessor] ✅ Window${windowId}を閉じました`);
      } catch (error) {
        this.logger.debug(`[StreamProcessor] Window${windowId}クローズエラー（無視）: ${error.message}`);
      }
    }
    
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
    
    // 通常処理列（3種類AIでもレポートでもない）の場合はスキップ
    // processNormalColumnでバッチ処理されるため
    if (!currentTask.multiAI && currentTask.taskType !== "report") {
      this.logger.log(`[StreamProcessor] ${column}列は通常処理列のためstartColumnProcessingをスキップ（バッチ処理で対応）`);
      // 処理中フラグを設定して重複を防ぐ
      this.columnWindows.set(column, 'pending-batch');
      return;
    }

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
    // テスト用のpreferredPositionがある場合はそれを使用、なければ列番号から計算
    let position;
    if (currentTask.preferredPosition !== undefined) {
      position = currentTask.preferredPosition;
    } else {
      // 列名から番号を取得してポジションを計算（A=0, B=1, C=2, ...）
      const columnIndex = column.charCodeAt(0) - 'A'.charCodeAt(0);
      position = columnIndex % 4; // 0-3の範囲に収める
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
    // windowPositionsの管理はWindowServiceに一元化

    // WindowServiceを使用してAI URLを取得（ChatGPT/Claude/Gemini等のURL管理を一元化）
    const url = WindowService.getAIUrl(task.aiType);
    
    // WindowServiceを使用してスクリーン情報を取得（モニター情報の取得を統一）
    const screenInfo = await WindowService.getScreenInfo();
    
    // WindowServiceを使用してウィンドウ位置を計算（列番号に応じた位置計算を統一）
    const windowPosition = WindowService.calculateWindowPosition(position, screenInfo);

    try {
      // WindowServiceを使用してAIウィンドウを作成（focused: trueがデフォルトで設定される）
      const window = await WindowService.createAIWindow(url, windowPosition);

      const windowInfo = {
        windowId: window.id,
        column: column,
        position: position,
        aiType: task.aiType,
        createdAt: new Date(),
      };

      this.activeWindows.set(window.id, windowInfo);
      // windowPositionsの管理はWindowServiceに一元化 // 仮予約を本予約に変更
      this.columnWindows.set(column, window.id);

      this.logger.log(`[StreamProcessor] 🔧 ウィンドウ作成完了: position=${position}`);
      this.logger.log(
        `[StreamProcessor] ウィンドウ作成: ${column}列 (${task.aiType}) - 位置: ${["左上", "右上", "左下"][position]} (windowId: ${window.id})`,
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
   * 既存のウィンドウでタスクを実行（リトライ機能付き）
   * @param {Task} task
   * @param {number} windowId
   * @param {number} retryCount - 現在のリトライ回数
   * @returns {Promise<Object>} 実行結果
   */
  async executeTaskInWindow(task, windowId, retryCount = 0) {
    const MAX_RETRIES = 3;
    const taskKey = `${task.column}${task.row}`;
    
    try {
      // コア実行処理を呼び出す
      const result = await this.executeTaskCore(task, windowId);
      
      // 成功したらエラーカウントをリセット
      if (this.errorCount && this.errorCount[taskKey]) {
        delete this.errorCount[taskKey];
        this.logger.log(`[StreamProcessor] ✅ タスク成功、エラーカウントリセット: ${taskKey}`);
      }
      
      return result;
      
    } catch (error) {
      // リトライ可能かチェック
      if (retryCount < MAX_RETRIES - 1) {
        this.logger.warn(
          `[StreamProcessor] ⚠️ タスクエラー（${retryCount + 1}/${MAX_RETRIES}回目）: ${taskKey}`,
          { error: error.message }
        );
        
        // 指数バックオフで待機（1秒、2秒、4秒...最大5秒）
        const waitTime = Math.min(1000 * Math.pow(2, retryCount), 5000);
        this.logger.log(`[StreamProcessor] ${waitTime}ms待機してリトライします...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        
        // 再帰的にリトライ
        return await this.executeTaskInWindow(task, windowId, retryCount + 1);
      }
      
      // リトライ上限に達した
      this.logger.error(
        `[StreamProcessor] ❌ エラー上限到達（${MAX_RETRIES}回失敗）: ${taskKey}`,
        { error: error.message }
      );
      
      // エラー結果を処理
      const errorResult = {
        success: false,
        error: `エラー上限到達: ${error.message}`,
        skipped: true,
      };
      
      // エラータスクを記録（通常処理列の場合）
      if (!task.multiAI) {
        if (!this.failedTasksByColumn.has(task.column)) {
          this.failedTasksByColumn.set(task.column, new Set());
        }
        this.failedTasksByColumn.get(task.column).add(task);
        this.logger.log(`[StreamProcessor] ❌ エラータスク記録: ${task.column}${task.row}`);
        
        // エラー行を記録（次の列でスキップするため）
        this.errorRows.add(task.row);
        this.logger.log(`[StreamProcessor] ❌ エラー行記録: 行${task.row} (次の列でスキップ)`);
      }
      
      await this.handleTaskResult(task, windowId, errorResult);
      
      // エラーの場合もウィンドウを閉じる（通常処理列の場合）
      // 二重安全策：バッチ完了時にも再度閉じる
      if (!task.multiAI) {
        await this.closeWindowAfterTask(windowId);
      }
      
      return errorResult;
    }
  }

  /**
   * タスク実行のコア処理（元のexecuteTaskInWindowの内容）
   * @param {Task} task
   * @param {number} windowId
   * @returns {Promise<Object>} 実行結果
   */
  async executeTaskCore(task, windowId) {
    const windowInfo = this.activeWindows.get(windowId);
    if (!windowInfo) return;

    const cellPosition = `${task.column}${task.row}`;
    
    // 重複実行チェック
    if (this.executionLock.has(task.id)) {
      this.logger.warn(`[StreamProcessor] 🔒 重複実行をスキップ (タスクID既に実行中): ${cellPosition} (ID: ${task.id})`);
      return { success: false, error: "重複実行", taskId: task.id };
    }
    
    if (this.activeTasksByCell.has(cellPosition)) {
      const activeTask = this.activeTasksByCell.get(cellPosition);
      this.logger.warn(`[StreamProcessor] 🔒 重複実行をスキップ (セル既に実行中): ${cellPosition}`, {
        実行中タスクID: activeTask.taskId,
        新規タスクID: task.id,
        実行開始時間: new Date(activeTask.startTime).toLocaleTimeString()
      });
      return { success: false, error: "セル重複実行", taskId: task.id };
    }
    
    // 実行開始をマーク
    this.executionLock.add(task.id);
    this.activeTasksByCell.set(cellPosition, {
      taskId: task.id,
      startTime: Date.now(),
      windowId: windowId
    });

    // 3種類AIグループの追跡を初期化
    this.initializeGroupTracking(task);
    
    // 詳細デバッグログ
    this.logger.log(
      `[StreamProcessor] 📍 タスク実行開始: ${cellPosition}セル (Window: ${windowId})`,
      {
        セル: cellPosition,
        taskAiType: task.aiType,
        windowAiType: windowInfo.aiType,
        タスクID: task.id,
        プロンプト長: task.prompt?.length || 0,
        プロンプト予覧: task.prompt?.substring(0, 100) + (task.prompt?.length > 100 ? '...' : ''),
        multiAI: task.multiAI,
        グループID: task.groupId,
        列: task.column,
        行: task.row,
        モデル: task.model || '未設定',
        機能: task.specialOperation || '未設定',
        実行時刻: new Date().toLocaleTimeString(),
        ウィンドウ位置: windowInfo.position,
        実行中タスク数: this.activeTasksByCell.size,
        実行ロック数: this.executionLock.size
      }
    );
    
    // プロンプト内容の詳細ログ（デバッグモード）
    if (task.prompt && task.prompt.length > 0) {
      const promptLines = task.prompt.split('\n');
      this.logger.log(`[StreamProcessor] プロンプト詳細 (${cellPosition}):`, {
        行数: promptLines.length,
        文字数: task.prompt.length,
        先頭行: promptLines[0]?.substring(0, 100) + (promptLines[0]?.length > 100 ? '...' : ''),
        末尾行: promptLines.length > 1 ? (promptLines[promptLines.length - 1]?.substring(0, 100) + (promptLines[promptLines.length - 1]?.length > 100 ? '...' : '')) : '（1行のみ）'
      });
    }

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
      this.logger.log(`[StreamProcessor] 📊 スプレッドシート設定適用:`, {
        aiType: task.aiType,
        requestedModel: finalModel || '未指定',
        specialOperation: finalOperation || 'なし',
        cellPosition: `${task.column}${task.row}`
      });

      // 送信時刻を記録（ログ用）
      if (this.spreadsheetLogger) {
        this.spreadsheetLogger.recordSendTime(task.id, {
          aiType: task.aiType,
          model: finalModel || '不明'
        });
        this.logger.log(`[StreamProcessor] ⏰ 送信時刻を記録: ${new Date().toLocaleString('ja-JP')}`);
      }

      // AITaskHandlerを直接呼び出す（Service Worker内なので）
      // aiTaskHandlerはbackground.jsでimportされているため、globalThisから取得
      const aiTaskHandler = globalThis.aiTaskHandler || (await import('../../handlers/ai-task-handler.js')).aiTaskHandler;
      
      // デバッグログ追加
      console.log(`[StreamProcessor] タスク実行前 - row=${task.row}, task.sheetName="${task.sheetName}"`);
      console.log('[StreamProcessor] [DEBUG] タスク情報:', {
        taskId: task.id,
        hasSheetName: !!task.sheetName,
        sheetName: task.sheetName,
        row: task.row,
        column: task.column,
        promptColumns: task.promptColumns
      });
      
      // taskInfo作成
      const taskInfoForAI = task.promptColumns ? {
        row: task.row,
        promptColumns: task.promptColumns,
        sheetName: task.sheetName
      } : null;
      
      console.log(`[StreamProcessor] taskInfo送信前 - taskInfo:`, taskInfoForAI);
      
      const result = await aiTaskHandler.handleExecuteAITask({
        tabId,
        prompt: task.prompt,  // 空の場合は動的取得される
        taskId: task.id,
        timeout: 180000,
        model: finalModel,  // UI優先のモデル情報
        specialOperation: finalOperation,  // UI優先の機能情報
        aiType: task.aiType,  // AI種別も明示的に渡す
        cellInfo: {  // セル位置情報を追加
          column: task.column,
          row: task.row
        },
        // 動的プロンプト取得用の情報を追加
        taskInfo: taskInfoForAI,
        spreadsheetId: this.spreadsheetData?.spreadsheetId  // スプレッドシートID
      }, null);

      const cellPosition = `${task.column}${task.row}`;
      
      // 動的に取得したモデル情報をタスクに保存
      if (result.model) {
        task.model = result.model;
        this.logger.log(`[StreamProcessor] 🎯 モデル情報を動的取得: ${cellPosition} = "${result.model}"`);
      } else if (finalModel) {
        // フォールバック: スプレッドシートのモデル情報を使用
        result.model = finalModel;
        task.model = finalModel;
        this.logger.log(`[StreamProcessor] 📄 スプレッドシートのモデル情報を使用: "${finalModel}"`);
      } else {
        this.logger.warn(`[StreamProcessor] ⚠️ モデル情報を取得できませんでした: ${cellPosition}`);
      }
      
      this.logger.log(
        `[StreamProcessor] ✅ タスク実行完了: ${cellPosition}セル`,
        {
          セル: cellPosition,
          実行結果: result.success ? '成功' : '失敗',
          エラー内容: result.error || 'なし',
          aiType: result.aiType || task.aiType,
          実際のモデル: result.model || '取得失敗',
          要求されたモデル: finalModel || '未指定',
          モデル一致: result.model === finalModel ? '✓一致' : '✗不一致',
          応答文字数: result.response?.length || 0,
          応答プレビュー: result.response ? (result.response.substring(0, 100) + (result.response.length > 100 ? '...' : '')) : 'なし',
          列: task.column,
          行: task.row,
          タスクID: task.id,
          実行完了時刻: new Date().toLocaleTimeString(),
          windowId: windowId,
          実行時間: windowInfo.startTime ? `${Date.now() - windowInfo.startTime}ms` : '不明'
        }
      );
      
      // 成功した場合、エラーリストから削除（通常処理列の場合）
      if (!task.multiAI && result.success) {
        const failedSet = this.failedTasksByColumn.get(task.column);
        if (failedSet && failedSet.has(task)) {
          failedSet.delete(task);
          this.logger.log(`[StreamProcessor] ✅ エラーリストから削除: ${task.column}${task.row}`);
          if (failedSet.size === 0) {
            this.failedTasksByColumn.delete(task.column);
          }
        }
      }

      // タスク完了処理（スプレッドシート書き込みを含む）
      await this.onTaskCompleted(task, windowId, result);
      
      // タスク完了後、ウィンドウを閉じる（通常処理列の場合）
      // 二重安全策：バッチ完了時にも再度閉じる
      if (!task.multiAI) {
        await this.closeWindowAfterTask(windowId);
      }
      
      return result;
    } catch (error) {
      // エラーを上位に投げる（executeTaskInWindowでリトライ処理）
      throw error;
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
    
    // 実行ロックを解除
    this.executionLock.delete(taskId);
    this.activeTasksByCell.delete(cellPosition);
    this.logger.log(`[StreamProcessor] 🔓 実行ロック解除: ${cellPosition} (ID: ${taskId})`);
    
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

    // エラー応答のチェックとリトライ処理（バッチ完了チェックの前に実行）
    if (result.success && result.response && result.response.includes("[Request interrupted by user]回答テキスト取得できない　エラー")) {
      this.logger.log(`[StreamProcessor] ❌ エラー応答を検知、リトライキューに追加: ${cellPosition}セル`);
      
      // リトライキューに追加
      if (!this.failedTasksByColumn.has(column)) {
        this.failedTasksByColumn.set(column, new Set());
      }
      this.failedTasksByColumn.get(column).add(task);
      
      // このタスクは失敗扱いとして、バッチ完了チェックから除外
      return;
    }
    
    // 成功した場合の追加処理（重要：バッチ完了チェックの前に実行）
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
            // 重要：ウィンドウが閉じる前に実行する必要がある
            await this.writeResultToSpreadsheet(task, result, windowId);
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
    
    // 通常処理バッチの完了をチェック（重要：スプレッドシート書き込み後に実行）
    // これによりウィンドウクローズ前に全ての書き込みが完了する
    if (!task.multiAI) {
      await this.updateNormalBatchCompletion(task);
    }

    // ■ 並列ストリーミング: 次の列の開始は記載完了後に行われる
    // （writeResultToSpreadsheet内のcheckAndStartNextColumnForRowで処理）
    // 従来のコードは削除し、記載完了ベースの制御に移行
  }

  /**
   * 結果をスプレッドシートに書き込む
   * @param {Task} task
   * @param {Object} result
   * @param {number} windowId - ウィンドウID
   */
  async writeResultToSpreadsheet(task, result, windowId) {
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
      this.logger.log(`[StreamProcessor] ✅ writtenCellsに記録: ${answerCellKey} (タスク: ${task.column}${task.row} → 回答: ${answerCellKey})`);
      
      // ウィンドウクローズチェック（スプレッドシート書き込み後）
      // 重要: onTaskCompletedで既にcurrentRowByColumnがインクリメントされているため、
      // 現在のインデックスが総タスク数以上の場合、全タスクが完了している
      const columnTasks = this.taskQueue.get(answerColumn);
      const columnIndex = this.currentRowByColumn.get(answerColumn) || 0;
      const totalTasks = columnTasks ? columnTasks.length : 0;
      const allTasksCompleted = columnIndex >= totalTasks;
      
      this.logger.log(`[StreamProcessor] 列完了チェック: ${answerColumn}列`, {
        currentIndex: columnIndex,
        totalTasks: totalTasks,
        allTasksCompleted: allTasksCompleted,
        hasWindow: this.columnWindows.has(answerColumn)
      });
      
      if (allTasksCompleted && this.columnWindows.has(answerColumn)) {
        // この列の全タスクが完了したらウィンドウを閉じる
        this.logger.log(`[StreamProcessor] 🚪 列の全タスク完了、ウィンドウを閉じます: ${answerColumn}列`);
        await this.closeColumnWindow(answerColumn);
        this.logger.log(`[StreamProcessor] ✅ ウィンドウクローズ完了: ${answerColumn}列`);
        
        // 3種類AIグループでない場合のみ、次の列をチェック
        // 3種類AIグループの場合は、グループ全体の完了をupdateGroupCompletionで判定
        if (!task.multiAI) {
          // ウィンドウが空いたので、利用可能な列をチェック
          this.checkAndStartAvailableColumns().catch(error => {
            this.logger.error(`[StreamProcessor] 利用可能列チェックエラー`, error);
          });
        }
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
          if (windowId) {  // task.windowId ではなく windowId パラメータを使用
            try {
              const tabs = await chrome.tabs.query({ windowId });
              if (tabs && tabs.length > 0) {
                currentUrl = tabs[0].url || 'N/A';
                console.log(`🌐 [StreamProcessor] 実際の作業 URL取得: ${currentUrl}`);
              }
            } catch (err) {
              console.warn(`⚠️ [StreamProcessor] URL取得エラー:`, err);
            }
          }
          
          // フォールバック: AIタイプからベースURLを生成
          if (currentUrl === 'N/A' || !currentUrl) {
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
          
          // タスクオブジェクトにモデル情報を追加
          const taskWithModel = {
            ...task,
            model: task.model || result?.model || '不明'
          };
          
          this.logger.log(`[StreamProcessor] 📝 ログ書き込み准備:`, {
            セル: `${task.column}${task.row}`,
            モデル: taskWithModel.model,
            URL: currentUrl,
            isGroupTask,
            isLastInGroup
          });
          
          await this.spreadsheetLogger.writeLogToSpreadsheet(taskWithModel, {
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
          console.error(`❌ [StreamProcessor] ログ書き込みエラー詳細:`, logError);
          console.error(`[StreamProcessor] エラー詳細情報:`, {
            errorMessage: logError?.message || 'メッセージなし',
            errorStack: logError?.stack || 'スタックトレースなし',
            taskId: task.id,
            row: task.row,
            aiType: task.aiType,
            currentUrl,
            spreadsheetLogger: !!this.spreadsheetLogger,
            taskModel: task.model || '不明'
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
      
      // ■ 3種類AIグループの場合、記載完了をチェックして解放
      if (task.multiAI && task.groupId) {
        this.checkAndReleaseGroup(task.groupId);
      }
      
      // ■ 列またぎを無効化（列が完全に終わるまで次の列を開始しない）
      // await this.checkAndStartNextColumnForRow(task.column, task.row);
      
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
      // WindowServiceを使用してウィンドウを閉じる（エラーハンドリングも統一）
      await WindowService.closeWindow(windowId);
      this.logger.log(`[StreamProcessor] ✅ ウィンドウクローズ完了 (windowId: ${windowId})`);
    } catch (error) {
      this.logger.warn(`[StreamProcessor] ❌ ウィンドウクローズエラー (windowId: ${windowId})`, error);
    }

    this.activeWindows.delete(windowId);
    // windowPositionsの管理はWindowServiceに一元化（重複管理を削除）
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
    // 実行中の3種類AIグループがある場合は新しいグループを開始しない
    if (this.activeThreeTypeGroups.size > 0) {
      this.logger.log(`[StreamProcessor] 3種類AIグループ実行中のため新規列開始を待機 (実行中: ${this.activeThreeTypeGroups.size}グループ)`);
      return;
    }
    
    // 古い互換性チェック（念のため残す）
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
        // バッチ処理中の列はスキップ
        const isBatchProcessing = Array.from(this.normalBatchTracker.values())
          .some(batch => batch.column === column);
        
        if (!isBatchProcessing) {
          this.logger.log(`[StreamProcessor] ${column}列を開始`);
          this.startColumnProcessing(column).catch(error => {
            this.logger.error(`[StreamProcessor] ${column}列開始エラー`, error);
          });
          started++;
        } else {
          this.logger.log(`[StreamProcessor] ${column}列はバッチ処理中のためスキップ`);
        }
        
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
          
          // 次のタスクを実行
          // 注: ここでは新しいウィンドウを開いて処理する
          // バッチ内の次のタスクは checkAndStartNextNormalBatch で処理される
          this.logger.log(`[StreamProcessor] 次のタスク${nextTask.column}${nextTask.row}はバッチ処理で実行されます`);
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
    
    // すでに処理中（ウィンドウがある）場合はスキップ
    if (this.columnWindows.has(column)) {
      this.logger.log(`[StreamProcessor] ${column}列は既に処理中のためスキップ`);
      return;
    }
    
    // 処理中フラグを設定（重複処理を防ぐ）
    this.columnWindows.set(column, 'batch-processing');
    
    // エラー行をスキップ
    const validTasks = tasks.filter(task => {
      if (this.errorRows.has(task.row)) {
        this.logger.log(`[StreamProcessor] ⚠️ 行${task.row}はエラー行のため${column}列でスキップ`);
        return false;
      }
      return true;
    });
    
    if (validTasks.length === 0) {
      this.logger.log(`[StreamProcessor] ${column}列: 全タスクがエラー行のためスキップ`);
      return;
    }
    
    this.logger.log(`[StreamProcessor] 通常処理列開始: ${column}列 (${validTasks.length}/${tasks.length}タスク)`);
    
    // 3タスクずつのバッチに分割
    const batches = [];
    for (let i = 0; i < validTasks.length; i += 3) {
      const batchTasks = validTasks.slice(i, Math.min(i + 3, validTasks.length));
      batches.push(batchTasks);
    }
    
    this.logger.log(`[StreamProcessor] ${column}列を${batches.length}バッチに分割`);
    
    // 最初のバッチを開始
    if (batches.length > 0) {
      await this.startNormalBatch(column, batches[0], 0, batches.length);
    }
    
    // 全バッチ完了を待つ（バッチは連鎖的に実行される）
    await this.waitForColumnCompletion(column);
    
    // エラータスクの再試行
    const failedTasks = this.failedTasksByColumn.get(column);
    if (failedTasks && failedTasks.size > 0) {
      this.logger.log(`[StreamProcessor] 🔄 ${column}列のエラータスク${failedTasks.size}個を再試行します`);
      
      // 5秒待機（サービス復旧を待つ）
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // エラータスクを配列に変換
      const retryTasks = Array.from(failedTasks);
      
      // 再試行バッチを実行
      await this.retryFailedTasks(column, retryTasks);
      
      // 再試行後、まだエラーが残っているかチェック
      const remainingErrors = this.failedTasksByColumn.get(column);
      if (remainingErrors && remainingErrors.size > 0) {
        this.logger.warn(`[StreamProcessor] ⚠️ ${column}列に${remainingErrors.size}個のエラーが残っています`);
      } else {
        this.logger.log(`[StreamProcessor] ✅ ${column}列の全エラーが解決しました`);
        this.failedTasksByColumn.delete(column);
      }
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
    
    // まず全てのウィンドウを並列で開く
    const windowInfos = [];
    const windowPromises = batchTasks.map(async (task, index) => {
      try {
        // インデックスをポジションとして使用（最大4つまで）
        const position = index % 4;  // 0, 1, 2, 3 をループ
        
        // ポジションチェック（念のため）
        if (position < 0 || position > 3) {
          throw new Error(`無効なポジション: ${position}`);
        }
        
        // ウィンドウを開く
        const windowId = await this.openWindowForTask(task, position);
        if (!windowId) {
          throw new Error(`ウィンドウを開けませんでした: ${task.column}${task.row}`);
        }
        
        // バッチ情報にウィンドウIDを記録
        batchInfo.windows.set(task.id, windowId);
        
        // ウィンドウ情報を保存（後で順次送信するため）
        windowInfos.push({
          task,
          windowId,
          index
        });
        
        this.logger.log(`[StreamProcessor] ✅ ウィンドウ開き完了: ${task.column}${task.row} (Window ID: ${windowId})`);
        
      } catch (error) {
        this.logger.error(`[StreamProcessor] ウィンドウ開きエラー: ${task.column}${task.row}`, error);
        // 予期しないエラーでも完了扱いにして次に進む
        batchInfo.completed.add(task.id);
      }
    });
    
    // 全ウィンドウが開くのを待つ
    await Promise.allSettled(windowPromises);
    
    this.logger.log(`[StreamProcessor] 📂 全ウィンドウ開き完了、送信処理を開始します`);
    
    // 送信を順次実行（5秒間隔）
    const sendPromises = [];
    const positions = ['top-left', 'top-right', 'bottom-left']; // 処理順序を明示
    
    // windowInfosをindex順にソート
    windowInfos.sort((a, b) => a.index - b.index);
    
    for (let i = 0; i < windowInfos.length; i++) {
      const { task, windowId } = windowInfos[i];
      const positionName = positions[i] || positions[0];
      
      // 送信前に5秒待機（最初のタスクは待機なし）
      if (i > 0) {
        this.logger.log(`[StreamProcessor] ⏱️ 次の送信まで5秒待機...`);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
      
      this.logger.log(`[StreamProcessor] 📤 送信開始: ${task.column}${task.row} (${positionName})`);
      
      // タスクを実行（送信処理）
      const sendPromise = this.executeTaskInWindow(task, windowId).then(result => {
        // 成功またはスキップの場合、完了扱い
        if (result && (result.success || result.skipped)) {
          batchInfo.completed.add(task.id);
        }
        return result;
      }).catch(error => {
        this.logger.error(`[StreamProcessor] タスク実行エラー: ${task.column}${task.row}`, error);
        batchInfo.completed.add(task.id);
      });
      
      sendPromises.push(sendPromise);
    }
    
    // 全タスクの完了を待つ
    await Promise.allSettled(sendPromises);
    
    this.logger.log(`[StreamProcessor] バッチ${batchId}の全タスク開始完了`);
  }
  
  /**
   * タスク用のウィンドウを開く（新規追加）
   * @param {Object} task - タスク
   * @param {number} position - ウィンドウ位置
   * @returns {Promise<number>} ウィンドウID
   */
  async openWindowForTask(task, position) {
    // WindowServiceを使用してAI URLを取得（タスクのAIタイプに応じたURL取得を一元化）
    const url = WindowService.getAIUrl(task.aiType);
    
    try {
      // WindowServiceのcreateWindowWithPositionを使用してウィンドウを作成
      // これにより位置計算とウィンドウ作成が一元化される
      const window = await WindowService.createWindowWithPosition(url, position, {
        type: 'popup',  // Chrome APIは 'normal', 'panel', 'popup' のみ許可
        aiType: task.aiType
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
      
      // windowPositionsの管理はWindowServiceに一元化（重複管理を削除）
      // バッチ処理の場合は columnWindows を上書きしない
      // （processNormalColumn で設定した 'batch-processing' フラグを保持）
      if (!this.columnWindows.has(task.column)) {
        this.columnWindows.set(task.column, window.id);
      }
      
      // 自動化スクリプトを注入
      await this.injectAutomationScripts(window.id, task.aiType);
      
      return window.id;
    } catch (error) {
      this.logger.error(`[StreamProcessor] ウィンドウ作成エラー: ${task.column}${task.row}`, {
        error: error.message,
        aiType: task.aiType,
        position: position,
        url: url
      });
      // 予約を解除
      // windowPositionsの管理はWindowServiceに一元化
      // エラー時のポジション解放もWindowServiceが管理
      
      // エラーを再スローして上位でリトライ処理させる
      throw error;
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
        // 列の処理中フラグをクリア
        this.columnWindows.delete(batchInfo.column);
      }
      
      // トラッカーから削除
      this.normalBatchTracker.delete(batchId);
      this.activeBatchIds.delete(batchId);
    }
  }
  
  /**
   * タスク完了後にウィンドウを閉じる（新規追加）
   * @param {number} windowId - ウィンドウID
   */
  async closeWindowAfterTask(windowId) {
    try {
      // ウィンドウクローズ後に確実に位置解放を行うコールバック
      const onWindowClosed = async (closedWindowId) => {
        this.logger.log(`[StreamProcessor] 🧹 ウィンドウ${closedWindowId}の位置管理をクリーンアップ`);
        
        // 管理情報をクリア
        this.activeWindows.delete(closedWindowId);
        
        // windowPositionsの管理はWindowServiceに一元化
        // WindowService.closeWindow()内でポジション解放が行われる
        
        // columnWindowsからも削除
        for (const [col, wId] of this.columnWindows.entries()) {
          if (wId === closedWindowId) {
            this.columnWindows.delete(col);
            this.logger.log(`[StreamProcessor] ✅ 列${col}のウィンドウ管理を解放しました`);
            break;
          }
        }
      };
      
      // WindowServiceを使用してウィンドウを閉じる（コールバック付き）
      await WindowService.closeWindow(windowId, onWindowClosed);
      this.logger.log(`[StreamProcessor] ✅ タスク完了後、Window${windowId}を閉じました`);
    } catch (error) {
      this.logger.debug(`[StreamProcessor] Window${windowId}クローズエラー（無視）: ${error.message}`);
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
        // WindowServiceを使用してウィンドウを閉じる（Promise形式で統一）
        WindowService.closeWindow(windowId)
          .then(() => {
            this.logger.log(`[StreamProcessor] ✅ Window${windowId}を閉じた`);
            // 管理情報をクリア
            this.activeWindows.delete(windowId);
            // windowPositionsの管理はWindowServiceに一元化
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
            // エラーでも管理情報はクリア（既に閉じている可能性があるため）
            this.activeWindows.delete(windowId);
            for (const [pos, wId] of this.windowPositions.entries()) {
              if (wId === windowId) {
                this.windowPositions.delete(pos);
                break;
              }
            }
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
   * 通常処理バッチの完了を更新（排他制御付き）
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
    
    // 排他制御: 同じバッチが同時に更新されないようにする
    if (this.batchUpdateMutex.has(targetBatchId)) {
      this.logger.log(`[StreamProcessor] バッチ更新待機 (他の処理中): ${targetBatchId}`);
      // 簡単な待機ループ（本格的なMutexの代替）
      let retryCount = 0;
      while (this.batchUpdateMutex.has(targetBatchId) && retryCount < 10) {
        await new Promise(resolve => setTimeout(resolve, 100));
        retryCount++;
      }
      if (this.batchUpdateMutex.has(targetBatchId)) {
        this.logger.warn(`[StreamProcessor] バッチ更新タイムアウト: ${targetBatchId}`);
        return;
      }
    }
    
    // 更新開始をマーク
    this.batchUpdateMutex.add(targetBatchId);
    
    try {
      // 重複チェック: 同じタスクが既に完了マークされていないか確認
      if (targetBatchInfo.completed.has(task.id)) {
        this.logger.warn(`[StreamProcessor] バッチ更新スキップ (既に完了済み): ${targetBatchId}, タスクID: ${task.id}`);
        return;
      }
      
      // タスクを完了に追加
      targetBatchInfo.completed.add(task.id);
      
      this.logger.log(`[StreamProcessor] バッチ進捗更新: ${targetBatchId}`, {
        完了数: targetBatchInfo.completed.size,
        総タスク数: targetBatchInfo.tasks.length,
        完了タスクID: task.id,
        完了率: `${Math.round((targetBatchInfo.completed.size / targetBatchInfo.tasks.length) * 100)}%`
      });
      
      // バッチが完了したかチェック
      await this.checkAndStartNextNormalBatch(targetBatchId);
      
      // リトライ処理: バッチ完了後にエラーになったタスクをリトライ
      await this.processRetryTasks();
    } finally {
      // 更新完了をマーク
      this.batchUpdateMutex.delete(targetBatchId);
    }
  }
  
  /**
   * 3種類AIグループの回答列がすべて記載済みかチェック
   * @param {string} groupId - グループID
   * @returns {boolean} すべて記載済みならtrue
   */
  checkGroupAnswerColumnsWritten(groupId) {
    // groupTasksMapから取得（process3TypeGroupで保存済み）
    const groupTasks = this.groupTasksMap?.get(groupId) || [];
    
    if (groupTasks.length === 0) {
      return true; // タスクがない場合は完了とみなす
    }
    
    // 各タスクの回答列が記載済みかチェック
    const requiredCells = [];
    const writtenCellsList = [];
    
    for (const task of groupTasks) {
      // タスクの列から回答列を計算（1つ左の列）
      const columnIndex = this.columnToIndex(task.column);
      const answerColumn = this.indexToColumn(columnIndex - 1);
      const answerCellKey = `${answerColumn}${task.row}`;
      requiredCells.push(answerCellKey);
      
      if (this.writtenCells.has(answerCellKey)) {
        writtenCellsList.push(answerCellKey);
      }
    }
    
    const allWritten = writtenCellsList.length === requiredCells.length;
    
    if (!allWritten) {
      this.logger.log(`[StreamProcessor] グループ${groupId}回答列待機中: ${writtenCellsList.length}/${requiredCells.length}完了`);
    }
    
    return allWritten;
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
      
      // この行が完全に完了したかチェック
      if (tracker.completed.size === tracker.required.size) {
        // このグループIDに関連する全てのトラッカーが完了したかチェック
        const allGroupTasksComplete = Array.from(this.groupCompletionTracker.entries())
          .filter(([key]) => key.includes(task.groupId))
          .every(([, t]) => t.completed.size === t.required.size);
        
        if (allGroupTasksComplete) {
          this.logger.log(`[StreamProcessor] 3種類AIグループ全タスク完了: ${task.groupId}`);
          // 記載完了は各writeResultToSpreadsheetでチェックするので、ここでは何もしない
        }
      }
    }
  }
  
  /**
   * 3種類AIグループの記載完了をチェックして次の処理を開始
   * @param {string} groupId - グループID
   */
  checkAndReleaseGroup(groupId) {
    // 回答列の記載完了をチェック
    const allAnswerColumnsWritten = this.checkGroupAnswerColumnsWritten(groupId);
    
    if (allAnswerColumnsWritten) {
      this.logger.log(`[StreamProcessor] 3種類AIグループ全回答列記載完了、グループ解放: ${groupId}`);
      
      // グループを実行完了として登録解除
      this.activeThreeTypeGroups.delete(groupId);
      if (this.activeThreeTypeGroupId === groupId) {
        this.activeThreeTypeGroupId = null;
      }
      
      // グループタスクマップからも削除
      if (this.groupTasksMap) {
        this.groupTasksMap.delete(groupId);
      }
      
      // 次の3種類AIグループまたは通常処理を開始
      this.checkAndStartAvailableColumns().catch(error => {
        this.logger.error(`[StreamProcessor] 次の処理開始エラー`, error);
      });
    }
  }

  /**
   * タスクを失敗としてマーク
   * @param {Object} task - タスクオブジェクト
   */
  markTaskAsFailed(task) {
    const taskId = `${task.column}${task.row}`;
    this.completedTasks.add(task.id);
    
    // スプレッドシートにエラーを記録
    if (this.spreadsheetLogger) {
      this.spreadsheetLogger.writeResult({
        cell: taskId,
        result: 'エラー: タスク実行に失敗しました',
        timestamp: new Date().toISOString()
      });
    }
    
    this.logger.error(`[StreamProcessor] タスク${taskId}を失敗としてマーク`);
  }
  
  /**
   * 空きポジションを探して即座に予約（非推奨: WindowServiceを使用してください）
   * @deprecated WindowService.findAvailablePosition()を使用してください
   * @returns {number} 空きポジション（0-3）、なければ-1
   */
  findAvailablePosition() {
    // WindowServiceに委譲
    return WindowService.findAvailablePosition();
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
        // ChatGPTはmodelパラメータを付けない（モデル選択はコンテンツスクリプトで制御）
        return "https://chatgpt.com/";

      default:
        this.logger.warn(`[StreamProcessor] 未知のAIタイプ: ${aiType}`);
        return "https://chatgpt.com/";
    }
  }

  /**
   * ウィンドウ位置を計算（4分割）
   * @param {number} index
   * @param {Object} screenInfo
   * @returns {Object} 位置情報
   */
  calculateWindowPosition(index, screenInfo) {
    // 4分割レイアウト（左上、右上、左下、右下は拡張機能用）
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
      // 右下は拡張機能用に空けておく
    ];

    return positions[index % 3];  // 3つのウィンドウのみ使用
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
          // WindowServiceを使用してウィンドウを閉じる（統一されたエラーハンドリング）
          await WindowService.closeWindow(windowInfo.windowId);
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
    // windowPositionsの管理はWindowServiceに一元化
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
      // WindowServiceでポジション利用可能性をチェック（仮実装）
      if (true) { // TODO: WindowService.isPositionAvailable(i)を使用
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

  /**
   * ウィンドウ設定に基づいて拡張機能とスプレッドシートを配置
   */
  async setupWindowsBasedOnSettings() {
    try {
      // ウィンドウ設定を取得
      const result = await chrome.storage.local.get(['windowSettings']);
      const settings = result.windowSettings || {
        extensionWindowNumber: 1,  // デフォルト: モニター1
        spreadsheetWindowNumber: 2  // デフォルト: モニター2
      };

      this.logger.log('[StreamProcessor] モニター設定:', settings);

      // 指定されたモニター内で4分割配置を実行
      await this.setupMonitorQuadrantLayout(settings.extensionWindowNumber);

    } catch (error) {
      this.logger.error('[StreamProcessor] モニター設定エラー', error);
      // フォールバック: 従来の右下移動を実行
      await this.moveExtensionWindowToBottomRight();
    }
  }

  /**
   * 指定されたモニター内で4分割レイアウトを設定
   * 左上→右上→左下：AI操作用、右下：拡張機能
   */
  async setupMonitorQuadrantLayout(monitorNumber) {
    try {
      this.logger.log(`[StreamProcessor] モニター${monitorNumber}内での4分割レイアウト開始`);

      // 拡張機能ウィンドウを右下（4番目）に配置
      await this.moveExtensionToMonitorQuadrant(monitorNumber, 4);

      // AI操作用ウィンドウの準備（必要に応じて）
      // 左上(1)、右上(2)、左下(3)は AI操作時に使用

      this.logger.log(`[StreamProcessor] モニター${monitorNumber}での4分割レイアウト完了`);
    } catch (error) {
      this.logger.error('[StreamProcessor] 4分割レイアウト設定エラー', error);
    }
  }

  /**
   * 拡張機能ウィンドウを指定モニターの指定位置に移動
   */
  async moveExtensionToMonitorQuadrant(monitorNumber, quadrant) {
    try {
      const result = await chrome.storage.local.get(['extensionWindowId']);
      const windowId = result.extensionWindowId;
      
      if (!windowId) {
        this.logger.log('[StreamProcessor] 拡張機能ウィンドウIDが見つかりません');
        return;
      }

      // ウィンドウが存在するか確認
      try {
        await chrome.windows.get(windowId);
      } catch (error) {
        this.logger.log('[StreamProcessor] 拡張機能ウィンドウが存在しません');
        return;
      }

      // モニター内の4分割位置を計算
      const position = await this.calculateMonitorQuadrantPosition(monitorNumber, quadrant);

      // 拡張機能ウィンドウを移動
      await chrome.windows.update(windowId, {
        ...position,
        state: "normal",
      });

      this.logger.log(`[StreamProcessor] 拡張機能をモニター${monitorNumber}の位置${quadrant}に移動しました`);
    } catch (error) {
      this.logger.error('[StreamProcessor] 拡張機能ウィンドウ移動エラー', error);
    }
  }

  /**
   * モニター内の4分割位置を計算
   */
  async calculateMonitorQuadrantPosition(monitorNumber, quadrant) {
    try {
      // 全ディスプレイ情報を取得
      const displays = await chrome.system.display.getInfo();
      
      // 指定されたモニター番号のディスプレイを取得
      const targetDisplay = displays[monitorNumber - 1];
      if (!targetDisplay) {
        this.logger.log(`[StreamProcessor] モニター${monitorNumber}が見つかりません。メインディスプレイを使用します。`);
        const primaryDisplay = displays.find(d => d.isPrimary) || displays[0];
        return this.getQuadrantPositionFromDisplay(primaryDisplay, quadrant);
      }
      
      return this.getQuadrantPositionFromDisplay(targetDisplay, quadrant);
      
    } catch (error) {
      this.logger.error('[StreamProcessor] モニター位置計算エラー:', error);
      // フォールバック: デフォルト位置
      return {
        left: 0,
        top: 0,
        width: 800,
        height: 600
      };
    }
  }

  /**
   * ディスプレイ内の4分割位置を取得
   */
  getQuadrantPositionFromDisplay(display, quadrant) {
    const halfWidth = Math.floor(display.workArea.width / 2);
    const halfHeight = Math.floor(display.workArea.height / 2);
    
    const positions = {
      1: { // 左上 - AI操作用
        left: display.workArea.left,
        top: display.workArea.top,
        width: halfWidth,
        height: halfHeight
      },
      2: { // 右上 - AI操作用
        left: display.workArea.left + halfWidth,
        top: display.workArea.top,
        width: halfWidth,
        height: halfHeight
      },
      3: { // 左下 - AI操作用
        left: display.workArea.left,
        top: display.workArea.top + halfHeight,
        width: halfWidth,
        height: halfHeight
      },
      4: { // 右下 - 拡張機能用
        left: display.workArea.left + halfWidth,
        top: display.workArea.top + halfHeight,
        width: halfWidth,
        height: halfHeight
      }
    };
    
    return positions[quadrant] || positions[1];
  }

  /**
   * 拡張機能ウィンドウを指定番号に移動
   */
  async moveExtensionToWindowNumber(windowNumber) {
    try {
      const result = await chrome.storage.local.get(['extensionWindowId']);
      const windowId = result.extensionWindowId;
      
      if (!windowId) {
        this.logger.log('[StreamProcessor] 拡張機能ウィンドウIDが見つかりません');
        return;
      }

      // ウィンドウが存在するか確認
      try {
        await chrome.windows.get(windowId);
      } catch (error) {
        this.logger.log('[StreamProcessor] 拡張機能ウィンドウが存在しません');
        return;
      }

      // 画面情報を取得
      const screenInfo = await this.getScreenInfo();
      const position = this.calculateWindowPositionFromNumber(windowNumber, screenInfo);

      // 拡張機能ウィンドウを移動
      await chrome.windows.update(windowId, {
        ...position,
        state: "normal",
      });

      this.logger.log(`[StreamProcessor] 拡張機能ウィンドウを番号${windowNumber}に移動しました`);
    } catch (error) {
      this.logger.error('[StreamProcessor] 拡張機能ウィンドウ移動エラー', error);
    }
  }

  /**
   * 列の全バッチ完了を待つ
   * @param {string} column - 列名
   */
  async waitForColumnCompletion(column) {
    const maxWaitTime = 300000; // 5分
    const checkInterval = 1000; // 1秒ごとにチェック
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWaitTime) {
      // 全バッチが完了しているかチェック
      let allBatchesComplete = true;
      
      for (const [batchId, batchInfo] of this.normalBatchTracker) {
        if (batchInfo.column === column) {
          allBatchesComplete = false;
          break;
        }
      }
      
      if (allBatchesComplete) {
        this.logger.log(`[StreamProcessor] ${column}列の全バッチが完了しました`);
        return;
      }
      
      await new Promise(resolve => setTimeout(resolve, checkInterval));
    }
    
    this.logger.warn(`[StreamProcessor] ${column}列の完了待機がタイムアウトしました`);
  }
  
  /**
   * エラータスクを再試行
   * @param {string} column - 列名
   * @param {Array} retryTasks - 再試行するタスクの配列
   */
  async retryFailedTasks(column, retryTasks) {
    if (!retryTasks || retryTasks.length === 0) return;
    
    this.logger.log(`[StreamProcessor] 🔄 エラータスク再試行開始: ${column}列 (${retryTasks.length}タスク)`);
    
    // 3タスクずつのバッチに分割
    const batches = [];
    for (let i = 0; i < retryTasks.length; i += 3) {
      const batchTasks = retryTasks.slice(i, Math.min(i + 3, retryTasks.length));
      batches.push(batchTasks);
    }
    
    // 再試行バッチを順次実行
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      const retryBatchId = `retry_${column}_${i}_${Date.now()}`;
      
      this.logger.log(`[StreamProcessor] 再試行バッチ ${i + 1}/${batches.length}: ${batch.map(t => `${t.column}${t.row}`).join(', ')}`);
      
      // バッチ内のタスクを並列実行
      const retryPromises = batch.map(async (task, index) => {
        try {
          // インデックスをポジションとして使用
          const position = index % 4; // 0-3の範囲に収める
          
          // ウィンドウを開く
          let windowId;
          try {
            windowId = await this.openWindowForTask(task, position);
          } catch (windowError) {
            // openWindowForTaskがエラーをスローした場合
            throw new Error(`ウィンドウを開けませんでした: ${task.column}${task.row} - ${windowError.message}`);
          }
          
          // タスクを実行（リトライ機能付き）
          const result = await this.executeTaskInWindow(task, windowId, 0); // retryCount=0で新たに開始
          
          // 成功した場合、エラーリストから削除
          if (result && result.success) {
            const failedSet = this.failedTasksByColumn.get(column);
            if (failedSet) {
              failedSet.delete(task);
              this.logger.log(`[StreamProcessor] ✅ 再試行成功: ${task.column}${task.row}`);
            }
          }
          
          return result;
          
        } catch (error) {
          this.logger.error(`[StreamProcessor] 再試行エラー: ${task.column}${task.row}`, error);
          return { success: false, error: error.message };
        }
      });
      
      // バッチの完了を待つ
      await Promise.allSettled(retryPromises);
      
      // 次のバッチまで少し待機
      if (i < batches.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    this.logger.log(`[StreamProcessor] 🔄 ${column}列の再試行完了`);
  }
  
  /**
   * スプレッドシートウィンドウを指定番号で開く
   */
  async openSpreadsheetInWindowNumber(windowNumber) {
    try {
      // スプレッドシートURLを取得
      const spreadsheetUrl = this.getSpreadsheetUrl();
      if (!spreadsheetUrl) {
        this.logger.log('[StreamProcessor] スプレッドシートURLが見つかりません');
        return;
      }

      // 画面情報を取得
      const screenInfo = await this.getScreenInfo();

      // モニター番号2の特別処理: 左にchrome://extensions/、右にスプレッドシート
      if (windowNumber === 2) {
        const halfWidth = Math.floor(screenInfo.width / 2);
        const fullHeight = screenInfo.height;

        // 左側: chrome://extensions/を開く
        const leftPosition = {
          left: screenInfo.left,
          top: screenInfo.top,
          width: halfWidth,
          height: fullHeight
        };

        const extensionsWindow = await WindowService.createWindow({
          url: 'chrome://extensions/',
          ...leftPosition
        });

        this.logger.log(`[StreamProcessor] chrome://extensions/を左側に開きました (ID: ${extensionsWindow.id})`);

        // 右側: スプレッドシートを開く
        const rightPosition = {
          left: screenInfo.left + halfWidth,
          top: screenInfo.top,
          width: halfWidth,
          height: fullHeight
        };

        const spreadsheetWindow = await WindowService.createWindow({
          url: spreadsheetUrl,
          ...rightPosition
        });

        this.logger.log(`[StreamProcessor] スプレッドシートを右側に開きました (ID: ${spreadsheetWindow.id})`);
        return;
      }

      // 通常の処理（モニター番号2以外）
      const position = this.calculateWindowPositionFromNumber(windowNumber, screenInfo);

      // スプレッドシートウィンドウを作成
      const window = await WindowService.createWindow({
        url: spreadsheetUrl,
        ...position
      });

      this.logger.log(`[StreamProcessor] スプレッドシートをウィンドウ番号${windowNumber}で開きました (ID: ${window.id})`);
    } catch (error) {
      this.logger.error('[StreamProcessor] スプレッドシートウィンドウ作成エラー', error);
    }
  }

  /**
   * ウィンドウ番号から位置を計算
   */
  calculateWindowPositionFromNumber(windowNumber, screenInfo) {
    // 4分割の基本配置 (1-4: 左上、右上、左下、右下)
    // 5以降は少しずつずらして配置
    const halfWidth = Math.floor(screenInfo.width / 2);
    const halfHeight = Math.floor(screenInfo.height / 2);
    
    const basePositions = [
      // 1: 左上
      { left: screenInfo.left, top: screenInfo.top, width: halfWidth, height: halfHeight },
      // 2: 右上
      { left: screenInfo.left + halfWidth, top: screenInfo.top, width: halfWidth, height: halfHeight },
      // 3: 左下
      { left: screenInfo.left, top: screenInfo.top + halfHeight, width: halfWidth, height: halfHeight },
      // 4: 右下
      { left: screenInfo.left + halfWidth, top: screenInfo.top + halfHeight, width: halfWidth, height: halfHeight }
    ];
    
    const baseIndex = ((windowNumber - 1) % 4);
    const offset = Math.floor((windowNumber - 1) / 4) * 50; // 5番以降は50pxずつずらす
    
    const position = basePositions[baseIndex];
    return {
      left: position.left + offset,
      top: position.top + offset,
      width: position.width,
      height: position.height
    };
  }

  /**
   * スプレッドシートURLを取得
   */
  getSpreadsheetUrl() {
    // spreadsheetDataからURLを取得
    if (this.spreadsheetData && this.spreadsheetData.url) {
      return this.spreadsheetData.url;
    }
    
    // フォールバック: 他の場所からURLを取得
    // ここで必要に応じてURLの取得ロジックを追加
    return null;
  }

  /**
   * 拡張機能ウィンドウを右下に移動（互換性のため保持）
   */
  async moveExtensionWindowToBottomRight() {
    await this.moveExtensionToWindowNumber(4); // 4番 = 右下
  }
  
  /**
   * エラーになったタスクをリトライする
   */
  async processRetryTasks() {
    if (this.failedTasksByColumn.size === 0) {
      return; // リトライタスクがない
    }
    
    this.logger.log(`[StreamProcessor] 🔄 リトライ処理開始: ${this.failedTasksByColumn.size}列にエラータスクあり`);
    
    for (const [column, failedTasks] of this.failedTasksByColumn) {
      if (failedTasks.length === 0) {
        continue;
      }
      
      this.logger.log(`[StreamProcessor] 🔄 ${column}列のエラータスクリトライ: ${failedTasks.length}件`);
      
      // エラータスクをタスクキューに戻す
      if (!this.taskQueue.has(column)) {
        this.taskQueue.set(column, []);
      }
      
      const columnQueue = this.taskQueue.get(column);
      
      // 失敗タスクをキューの先頭に追加（優先処理）
      for (const task of failedTasks.reverse()) { // reverseで先頭に追加する順序を保持
        columnQueue.unshift(task);
        this.logger.log(`[StreamProcessor] 🔄 リトライタスクをキューに追加: ${task.column}${task.row}`);
      }
      
      // 現在の行インデックスをリセット（先頭から再開）
      this.currentRowByColumn.set(column, 0);
      
      // リトライキューをクリア
      this.failedTasksByColumn.set(column, new Set());
    }
    
    // 利用可能な列をチェックしてリトライタスクを開始
    await this.checkAndStartAvailableColumns();
    
    this.logger.log(`[StreamProcessor] 🔄 リトライ処理完了`);
  }
}

// エクスポート
export default StreamProcessor;
