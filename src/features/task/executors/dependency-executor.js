// dependency-executor.js - 依存関係実行専用Executor

import BaseExecutor from './base-executor.js';

/**
 * レポートタスクの依存関係実行を管理
 * 特徴:
 * - AIタスク完了後にレポートタスクを実行
 * - 依存関係の解決とタスク実行順序の管理
 * - ReportManagerとの連携
 */
class DependencyExecutor extends BaseExecutor {
  constructor(dependencies = {}) {
    super(dependencies);
    
    // 依存関係実行専用の状態管理
    this.aiTaskQueue = new Map(); // column -> AI tasks[]
    this.reportTaskQueue = new Map(); // column -> Report tasks[]
    this.dependencyGraph = new Map(); // taskId -> dependsOn taskIds[]
    this.writtenCells = new Map(); // `${column}${row}` -> true
    this.currentRowByColumn = new Map(); // column -> currentRowNumber
    this.reportManager = null; // ReportManagerインスタンス
  }
  
  /**
   * 依存関係実行でタスクストリームを処理
   */
  async processTaskStream(taskList, spreadsheetData, options = {}) {
    this.setupProcessing(taskList, spreadsheetData, options);
    
    try {
      // ReportManagerを初期化
      await this.initializeReportManager();
      
      // タスクを種類別・列別で整理
      this.organizeTasks(taskList);
      
      // 依存関係実行開始
      await this.startDependencyExecution();
      
      return this.createSuccessResult({
        processedColumns: Array.from(new Set([
          ...this.aiTaskQueue.keys(),
          ...this.reportTaskQueue.keys()
        ])),
        executionPattern: 'dependency'
      });
      
    } catch (error) {
      this.handleError(error, 'processTaskStream');
      throw error;
    } finally {
      this.cleanup();
    }
  }
  
  /**
   * ReportManagerを初期化
   */
  async initializeReportManager() {
    try {
      // 動的にReportManagerをインポート
      const module = await import('../../report/report-manager.js');
      const ReportManagerClass = module.ReportManager || module.default;
      
      this.reportManager = new ReportManagerClass({
        testMode: this.isTestMode,
        logger: this.logger,
        sheetsClient: globalThis.sheetsClient,
        docsClient: globalThis.docsClient,
        authService: globalThis.authService
      });
      
      this.logger.log(`[DependencyExecutor] ReportManager初期化完了`);
    } catch (error) {
      this.logger.warn(`[DependencyExecutor] ReportManagerインポート失敗、代替処理`, error);
      this.reportManager = null;
    }
  }
  
  /**
   * タスクを種類別・列別で整理
   */
  organizeTasks(taskList) {
    // AIタスクとレポートタスクを分離
    taskList.tasks.forEach(task => {
      if (task.taskType === 'report') {
        // レポートタスク
        if (!this.reportTaskQueue.has(task.column)) {
          this.reportTaskQueue.set(task.column, []);
        }
        this.reportTaskQueue.get(task.column).push(task);
        
        // 依存関係を記録
        if (task.dependsOn) {
          this.dependencyGraph.set(task.id, task.dependsOn);
        }
      } else {
        // AIタスク
        if (!this.aiTaskQueue.has(task.column)) {
          this.aiTaskQueue.set(task.column, []);
        }
        this.aiTaskQueue.get(task.column).push(task);
      }
    });
    
    // 各列のタスクを行順でソート
    [this.aiTaskQueue, this.reportTaskQueue].forEach(queue => {
      queue.forEach((tasks, column) => {
        tasks.sort((a, b) => a.row - b.row);
        this.currentRowByColumn.set(column, 0);
      });
    });
    
    this.logger.log(`[DependencyExecutor] タスク整理完了`, {
      aiColumns: Array.from(this.aiTaskQueue.keys()).sort(),
      reportColumns: Array.from(this.reportTaskQueue.keys()).sort(),
      totalAITasks: Array.from(this.aiTaskQueue.values()).flat().length,
      totalReportTasks: Array.from(this.reportTaskQueue.values()).flat().length,
      dependencies: this.dependencyGraph.size
    });
  }
  
  /**
   * 依存関係実行を開始
   */
  async startDependencyExecution() {
    this.logger.log(`[DependencyExecutor] 依存関係実行開始`);
    
    // Phase 1: AIタスクを順次実行
    await this.executeAITasks();
    
    // Phase 2: レポートタスクを依存関係に従って実行
    await this.executeReportTasks();
    
    this.logger.log(`[DependencyExecutor] 全ての依存関係実行完了`);
  }
  
  /**
   * AIタスクを順次実行
   */
  async executeAITasks() {
    const aiColumns = Array.from(this.aiTaskQueue.keys()).sort();
    
    if (aiColumns.length === 0) {
      this.logger.log(`[DependencyExecutor] AIタスクがありません`);
      return;
    }
    
    this.logger.log(`[DependencyExecutor] AIタスク実行開始`, {
      columns: aiColumns.join(' → '),
      totalColumns: aiColumns.length
    });
    
    // 各列を順次処理
    for (const column of aiColumns) {
      await this.processAIColumn(column);
    }
    
    this.logger.log(`[DependencyExecutor] AIタスク実行完了`);
  }
  
  /**
   * AI列を処理
   */
  async processAIColumn(column) {
    const tasks = this.aiTaskQueue.get(column);
    
    if (!tasks || tasks.length === 0) {
      return;
    }
    
    this.logger.log(`[DependencyExecutor] AI列${column}処理開始`, {
      taskCount: tasks.length
    });
    
    // この列の全AIタスクを順次実行
    for (const task of tasks) {
      await this.processAITask(task);
    }
    
    this.logger.log(`[DependencyExecutor] AI列${column}処理完了`);
  }
  
  /**
   * AIタスクを処理
   */
  async processAITask(task) {
    try {
      this.logger.log(`[DependencyExecutor] AIタスク処理`, {
        cell: `${task.column}${task.row}`,
        aiType: task.aiType,
        taskId: task.id.substring(0, 8)
      });
      
      // テストモードの場合はシミュレート
      if (this.isTestMode) {
        this.logger.log(`[DependencyExecutor] テストモード: AIタスクをシミュレート`);
      } else {
        // 実際のウィンドウ処理
        await this.openWindowForTask(task);
      }
      
      // タスク完了をマーク
      this.completedTasks.add(task.id);
      this.writtenCells.set(`${task.column}${task.row}`, true);
      
      this.logger.log(`[DependencyExecutor] AIタスク完了`, {
        cell: `${task.column}${task.row}`,
        taskId: task.id.substring(0, 8)
      });
      
    } catch (error) {
      this.logger.error(`[DependencyExecutor] AIタスクエラー`, {
        cell: `${task.column}${task.row}`,
        taskId: task.id.substring(0, 8),
        error: error.message
      });
      throw error;
    }
  }
  
  /**
   * レポートタスクを依存関係に従って実行
   */
  async executeReportTasks() {
    const reportColumns = Array.from(this.reportTaskQueue.keys()).sort();
    
    if (reportColumns.length === 0) {
      this.logger.log(`[DependencyExecutor] レポートタスクがありません`);
      return;
    }
    
    this.logger.log(`[DependencyExecutor] レポートタスク実行開始`, {
      columns: reportColumns.join(' → '),
      totalColumns: reportColumns.length
    });
    
    // 各列のレポートタスクを処理
    for (const column of reportColumns) {
      await this.processReportColumn(column);
    }
    
    this.logger.log(`[DependencyExecutor] レポートタスク実行完了`);
  }
  
  /**
   * レポート列を処理
   */
  async processReportColumn(column) {
    const tasks = this.reportTaskQueue.get(column);
    
    if (!tasks || tasks.length === 0) {
      return;
    }
    
    this.logger.log(`[DependencyExecutor] レポート列${column}処理開始`, {
      taskCount: tasks.length
    });
    
    // この列の全レポートタスクを処理
    for (const task of tasks) {
      if (this.canExecuteReportTask(task)) {
        await this.processReportTask(task);
      } else {
        this.logger.log(`[DependencyExecutor] レポートタスク依存関係未充足`, {
          cell: `${task.column}${task.row}`,
          dependsOn: task.dependsOn,
          taskId: task.id.substring(0, 8)
        });
      }
    }
    
    this.logger.log(`[DependencyExecutor] レポート列${column}処理完了`);
  }
  
  /**
   * レポートタスクが実行可能かチェック
   */
  canExecuteReportTask(task) {
    // 依存タスクが完了しているかチェック
    if (task.dependsOn && !this.completedTasks.has(task.dependsOn)) {
      return false;
    }
    
    // ソース列のデータが存在するかチェック
    const sourceColumn = task.sourceColumn;
    const sourceRow = task.row;
    const sourceCellKey = `${sourceColumn}${sourceRow}`;
    
    if (!this.writtenCells.has(sourceCellKey)) {
      return false;
    }
    
    return true;
  }
  
  /**
   * レポートタスクを処理
   */
  async processReportTask(task) {
    try {
      this.logger.log(`[DependencyExecutor] レポートタスク処理開始`, {
        cell: `${task.column}${task.row}`,
        sourceColumn: task.sourceColumn,
        taskId: task.id.substring(0, 8)
      });
      
      if (this.isTestMode) {
        // テストモードではレポート生成をシミュレート
        this.logger.log(`[DependencyExecutor] テストモード: レポート生成をシミュレート`);
      } else if (this.reportManager) {
        // ReportManagerを使用してレポート生成
        const params = {
          spreadsheetId: this.spreadsheetData?.spreadsheetId,
          gid: this.spreadsheetData?.gid,
          row: task.row,
          sourceColumn: task.sourceColumn,
          reportColumn: task.reportColumn,
          testMode: this.isTestMode
        };
        
        const result = await this.reportManager.generateReportForRow(params);
        
        if (result.success) {
          this.logger.log(`[DependencyExecutor] レポート生成成功`, {
            cell: `${task.column}${task.row}`,
            url: result.url
          });
        } else {
          throw new Error(`レポート生成失敗: ${result.error}`);
        }
      } else {
        // ReportManagerがない場合のフォールバック処理
        this.logger.log(`[DependencyExecutor] ReportManager未使用、処理をスキップ`);
      }
      
      // タスク完了をマーク
      this.completedTasks.add(task.id);
      this.writtenCells.set(`${task.column}${task.row}`, true);
      
      this.logger.log(`[DependencyExecutor] レポートタスク完了`, {
        cell: `${task.column}${task.row}`,
        taskId: task.id.substring(0, 8)
      });
      
    } catch (error) {
      this.logger.error(`[DependencyExecutor] レポートタスクエラー`, {
        cell: `${task.column}${task.row}`,
        taskId: task.id.substring(0, 8),
        error: error.message
      });
      throw error;
    }
  }
  
  /**
   * タスク用のウィンドウを開く（AIタスク用）
   */
  async openWindowForTask(task) {
    const url = this.determineAIUrl(task.aiType, task.column);
    const screenInfo = await this.getScreenInfo();
    const windowPosition = this.calculateWindowPosition(0, screenInfo);
    
    try {
      // chrome.windows APIの存在確認
      if (typeof chrome === 'undefined' || !chrome.windows) {
        throw new Error('chrome.windows API is not available. This must run in a Service Worker context.');
      }
      
      const window = await chrome.windows.create({
        url: url,
        type: "popup",
        focused: true,  // AIページを最前面に表示
        ...windowPosition,
      });
      
      const windowInfo = {
        windowId: window.id,
        column: task.column,
        row: task.row,
        aiType: task.aiType,
        taskId: task.id,
        url: url,
        createdAt: Date.now()
      };
      
      this.activeWindows.set(window.id, windowInfo);
      
    } catch (error) {
      this.logger.error(`[DependencyExecutor] ウィンドウ作成エラー`, {
        message: error.message,
        cell: `${task.column}${task.row}`
      });
      throw error;
    }
  }
  
  /**
   * 依存関係の状況を取得
   */
  getDependencyStatus() {
    const pendingDependencies = [];
    
    this.dependencyGraph.forEach((dependsOn, taskId) => {
      if (!this.completedTasks.has(dependsOn)) {
        pendingDependencies.push({ taskId, dependsOn });
      }
    });
    
    return {
      totalDependencies: this.dependencyGraph.size,
      resolvedDependencies: this.dependencyGraph.size - pendingDependencies.length,
      pendingDependencies: pendingDependencies,
      completedTasks: this.completedTasks.size,
      writtenCells: this.writtenCells.size
    };
  }
}

export default DependencyExecutor;