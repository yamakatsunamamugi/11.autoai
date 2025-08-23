// sequential-executor.js - 順次実行専用Executor

import BaseExecutor from './base-executor.js';
// WindowServiceをインポート（ウィンドウ管理の一元化）
import { WindowService } from '../../../services/window-service.js';

/**
 * 単独AI（1つずつのAI）の順次実行を管理
 * 特徴:
 * - 前の列が完了してから次の列を開始
 * - 1つのウィンドウで各列を順次処理
 * - シンプルな状態管理
 */
class SequentialExecutor extends BaseExecutor {
  constructor(dependencies = {}) {
    super(dependencies);
    
    // 順次実行専用の状態管理
    this.taskQueue = new Map(); // column -> tasks[]
    this.currentRowByColumn = new Map(); // column -> currentRowNumber
    this.currentColumn = null; // 現在処理中の列
    this.columnOrder = []; // 列の処理順序
    this.writtenCells = new Map(); // `${column}${row}` -> true
    this.maxConcurrentWindows = 1; // 順次実行のため1つ
  }
  
  /**
   * 順次実行でタスクストリームを処理
   */
  async processTaskStream(taskList, spreadsheetData, options = {}) {
    this.setupProcessing(taskList, spreadsheetData, options);
    
    try {
      // タスクを列・行でグループ化
      this.organizeTasks(taskList);
      
      // 順次実行開始
      await this.startSequentialExecution();
      
      return this.createSuccessResult({
        processedColumns: Array.from(this.taskQueue.keys()),
        executionPattern: 'sequential'
      });
      
    } catch (error) {
      this.handleError(error, 'processTaskStream');
      throw error;
    } finally {
      this.cleanup();
    }
  }
  
  /**
   * タスクを列・行で整理
   */
  organizeTasks(taskList) {
    // 列ごとにタスクをグループ化
    taskList.tasks.forEach(task => {
      if (!this.taskQueue.has(task.column)) {
        this.taskQueue.set(task.column, []);
      }
      this.taskQueue.get(task.column).push(task);
    });
    
    // 各列のタスクを行順でソート
    this.taskQueue.forEach((tasks, column) => {
      tasks.sort((a, b) => a.row - b.row);
      this.currentRowByColumn.set(column, 0);
    });
    
    // 列の処理順序を決定（アルファベット順）
    this.columnOrder = Array.from(this.taskQueue.keys()).sort();
    
    this.logger.log(`[SequentialExecutor] タスク整理完了`, {
      columnOrder: this.columnOrder,
      totalTasks: taskList.tasks.length
    });
    
    // 各列のタスク詳細を表示
    this.taskQueue.forEach((tasks, column) => {
      this.logger.log(`[SequentialExecutor] ${column}列のタスク: ${tasks.length}件`, {
        tasks: tasks.map(task => ({
          id: task.id.substring(0, 8),
          cell: `${task.column}${task.row}`,
          aiType: task.aiType
        }))
      });
    });
  }
  
  /**
   * 順次実行を開始
   */
  async startSequentialExecution() {
    if (this.columnOrder.length === 0) {
      this.logger.log(`[SequentialExecutor] 処理対象の列がありません`);
      return;
    }
    
    this.logger.log(`[SequentialExecutor] 順次実行開始`, {
      columnOrder: this.columnOrder.join(' → '),
      totalColumns: this.columnOrder.length
    });
    
    // 最初の列から順次処理
    for (const column of this.columnOrder) {
      await this.processColumn(column);
    }
    
    this.logger.log(`[SequentialExecutor] 全列の処理完了`);
  }
  
  /**
   * 列を処理
   */
  async processColumn(column) {
    this.currentColumn = column;
    const tasks = this.taskQueue.get(column);
    
    if (!tasks || tasks.length === 0) {
      this.logger.log(`[SequentialExecutor] ${column}列にタスクがありません`);
      return;
    }
    
    this.logger.log(`[SequentialExecutor] ${column}列の処理開始`, {
      taskCount: tasks.length,
      aiType: tasks[0]?.aiType
    });
    
    // この列の全タスクを順次実行
    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];
      this.currentRowByColumn.set(column, i);
      
      // 前の列の同じ行が完了しているかチェック
      if (this.shouldWaitForPreviousColumn(column, task.row)) {
        this.logger.log(`[SequentialExecutor] ${column}${task.row}は前の列の完了待ち`);
        continue;
      }
      
      await this.processTask(task);
    }
    
    this.logger.log(`[SequentialExecutor] ${column}列の処理完了`);
    this.currentColumn = null;
  }
  
  /**
   * 単一タスクを処理
   */
  async processTask(task) {
    try {
      this.logger.log(`[SequentialExecutor] タスク処理開始`, {
        cell: `${task.column}${task.row}`,
        aiType: task.aiType,
        taskId: task.id.substring(0, 8)
      });
      
      // テストモードの場合は実際のウィンドウ作成をスキップ
      if (this.isTestMode) {
        this.logger.log(`[SequentialExecutor] テストモード: タスク処理をシミュレート`);
        
        // シミュレーション: タスク完了
        this.completedTasks.add(task.id);
        this.writtenCells.set(`${task.column}${task.row}`, true);
        
        return;
      }
      
      // 実際のウィンドウ処理（Service Worker環境でのみ実行）
      await this.openWindowForTask(task);
      
      // タスク完了をマーク
      this.completedTasks.add(task.id);
      this.writtenCells.set(`${task.column}${task.row}`, true);
      
      this.logger.log(`[SequentialExecutor] タスク処理完了`, {
        cell: `${task.column}${task.row}`,
        taskId: task.id.substring(0, 8)
      });
      
    } catch (error) {
      this.logger.error(`[SequentialExecutor] タスク処理エラー`, {
        cell: `${task.column}${task.row}`,
        taskId: task.id.substring(0, 8),
        error: error.message
      });
      throw error;
    }
  }
  
  /**
   * タスク用のウィンドウを開く
   */
  async openWindowForTask(task) {
    // WindowServiceを使用してAI URLを取得（ChatGPT/Claude/Gemini等のURL管理を一元化）
    const url = WindowService.getAIUrl(task.aiType);
    
    // WindowServiceを使用してスクリーン情報を取得（モニター情報の取得を統一）
    const screenInfo = await WindowService.getScreenInfo();
    
    // WindowServiceを使用してウィンドウ位置を計算（順次実行は position 0 固定）
    const windowPosition = WindowService.calculateWindowPosition(0, screenInfo);
    
    try {
      // WindowServiceを使用してAIウィンドウを作成（focused: trueがデフォルトで設定される）
      const window = await WindowService.createAIWindow(url, windowPosition);
      
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
      
      this.logger.log(`[SequentialExecutor] ウィンドウ作成完了`, {
        windowId: window.id,
        cell: `${task.column}${task.row}`,
        aiType: task.aiType
      });
      
      // ウィンドウでのタスク実行を待機（実際の実装では別途ハンドリング）
      // ここでは作成のみ行い、実際の処理は外部で管理
      
    } catch (error) {
      this.logger.error(`[SequentialExecutor] ウィンドウ作成エラー`, {
        message: error.message,
        url: url,
        cell: `${task.column}${task.row}`,
        taskId: task.id.substring(0, 8)
      });
      throw error;
    }
  }
  
  /**
   * 前の列の完了を待つべきか判定
   */
  shouldWaitForPreviousColumn(currentColumn, row) {
    const currentIndex = this.columnOrder.indexOf(currentColumn);
    if (currentIndex === 0) {
      return false; // 最初の列は待機不要
    }
    
    const previousColumn = this.columnOrder[currentIndex - 1];
    const previousCellKey = `${previousColumn}${row}`;
    
    // 前の列の同じ行が記載完了していない場合は待機
    if (!this.writtenCells.has(previousCellKey)) {
      return true;
    }
    
    return false;
  }
  
  /**
   * 現在の処理状況を取得
   */
  getProcessingStatus() {
    return {
      currentColumn: this.currentColumn,
      completedTasks: this.completedTasks.size,
      totalWindows: this.activeWindows.size,
      writtenCells: this.writtenCells.size,
      columnProgress: Array.from(this.currentRowByColumn.entries()).map(([column, index]) => ({
        column,
        currentRow: index,
        totalTasks: this.taskQueue.get(column)?.length || 0
      }))
    };
  }
}

export default SequentialExecutor;