// parallel-executor.js - 3種類AI並列実行専用Executor

import BaseExecutor from './base-executor.js';
// WindowServiceをインポート（ウィンドウ管理の一元化）
import { WindowService } from '../../../services/window-service.js';

/**
 * 3種類AI（ChatGPT, Claude, Gemini）の並列実行を管理
 * 特徴:
 * - 同じグループの3つのAIを同時実行
 * - グループ完了後に次のグループへ進行
 * - 各AIは独立したウィンドウで実行
 */
class ParallelExecutor extends BaseExecutor {
  constructor(dependencies = {}) {
    super(dependencies);
    
    // 並列実行専用の状態管理
    this.taskQueue = new Map(); // column -> tasks[]
    this.currentRowByColumn = new Map(); // column -> currentRowNumber
    this.groupCompletionTracker = new Map(); // groupKey -> { required: Set, completed: Set }
    this.activeGroupId = null;
    this.windowPositions = new Map(); // position(0-2) -> windowId
    this.columnWindows = new Map(); // column -> windowId
    this.maxConcurrentWindows = 3; // 3種類AIのため3つ
  }
  
  /**
   * 3種類AI並列実行でタスクストリームを処理
   */
  async processTaskStream(taskList, spreadsheetData, options = {}) {
    this.setupProcessing(taskList, spreadsheetData, options);
    
    try {
      // タスクを列・行でグループ化
      this.organizeTasks(taskList);
      
      // 3種類AIグループの実行開始
      await this.startParallelExecution();
      
      return this.createSuccessResult({
        processedColumns: Array.from(this.taskQueue.keys()),
        executionPattern: 'parallel'
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
    
    this.logger.log(`[ParallelExecutor] タスク整理完了`, {
      columns: Array.from(this.taskQueue.keys()).sort(),
      totalTasks: taskList.tasks.length
    });
  }
  
  /**
   * 3種類AI並列実行を開始
   */
  async startParallelExecution() {
    const columns = Array.from(this.taskQueue.keys()).sort();
    
    // 最初のグループから開始
    const firstTask = this.taskQueue.get(columns[0])?.[0];
    if (!firstTask || !firstTask.groupId) {
      throw new Error('3種類AIグループが見つかりません');
    }
    
    this.activeGroupId = firstTask.groupId;
    this.logger.log(`[ParallelExecutor] 3種類AIグループ開始: ${this.activeGroupId}`);
    
    // 3つのAI列を同時実行
    const maxStart = Math.min(columns.length, this.maxConcurrentWindows);
    const parallelPromises = [];
    
    for (let i = 0; i < maxStart; i++) {
      const column = columns[i];
      this.logger.log(`[ParallelExecutor] ${column}列を開始 (${i + 1}/${maxStart})`);
      
      parallelPromises.push(
        this.startColumnProcessing(column).catch(error => {
          this.logger.error(`[ParallelExecutor] ${column}列エラー`, error);
          return { column, error };
        })
      );
    }
    
    // 全ての並列実行が完了するまで待機
    const results = await Promise.allSettled(parallelPromises);
    this.logger.log(`[ParallelExecutor] 並列実行完了`, {
      results: results.map(r => r.status),
      errors: results.filter(r => r.status === 'rejected').length
    });
  }
  
  /**
   * 列の処理を開始
   */
  async startColumnProcessing(column) {
    const tasks = this.taskQueue.get(column);
    if (!tasks || tasks.length === 0) {
      return;
    }
    
    const currentIndex = this.currentRowByColumn.get(column) || 0;
    if (currentIndex >= tasks.length) {
      return;
    }
    
    const currentTask = tasks[currentIndex];
    
    // ウィンドウポジションを決定
    const position = this.findAvailablePosition();
    if (position === -1) {
      throw new Error(`利用可能なウィンドウポジションがありません`);
    }
    
    await this.openWindowForColumn(column, currentTask, position);
  }
  
  /**
   * 利用可能なポジションを検索
   */
  findAvailablePosition() {
    for (let i = 0; i < this.maxConcurrentWindows; i++) {
      if (!this.windowPositions.has(i)) {
        this.windowPositions.set(i, null); // 予約
        return i;
      }
    }
    return -1;
  }
  
  /**
   * 列用のウィンドウを開く
   */
  async openWindowForColumn(column, task, position) {
    this.logger.log(`[ParallelExecutor] ${column}列用ウィンドウ開く (position=${position})`);
    
    // WindowServiceを使用してAI URLを取得（ChatGPT/Claude/Gemini等のURL管理を一元化）
    const url = WindowService.getAIUrl(task.aiType);
    
    // WindowServiceを使用してスクリーン情報を取得（モニター情報の取得を統一）
    const screenInfo = await WindowService.getScreenInfo();
    
    // WindowServiceを使用してウィンドウ位置を計算（並列実行用の位置計算を統一）
    const windowPosition = WindowService.calculateWindowPosition(position, screenInfo);
    
    try {
      // テストモードの場合はウィンドウ作成をスキップ
      if (this.isTestMode) {
        this.logger.log(`[ParallelExecutor] テストモード: ${column}列ウィンドウ作成をスキップ`);
        return;
      }
      
      // WindowServiceを使用してAIウィンドウを作成（API存在確認も内部で実施）
      const window = await WindowService.createAIWindow(url, windowPosition);
      
      const windowInfo = {
        windowId: window.id,
        column: column,
        aiType: task.aiType,
        position: position,
        url: url,
        createdAt: Date.now()
      };
      
      this.activeWindows.set(window.id, windowInfo);
      this.windowPositions.set(position, window.id);
      this.columnWindows.set(column, window.id);
      
      this.logger.log(`[ParallelExecutor] ${column}列ウィンドウ作成完了`, {
        windowId: window.id,
        position: position,
        aiType: task.aiType
      });
      
    } catch (error) {
      this.logger.error(`[ParallelExecutor] ウィンドウ作成エラー`, {
        message: error.message,
        url: url,
        position: position,
        column: column,
        taskAiType: task.aiType
      });
      throw error;
    }
  }
  
  /**
   * グループ完了を追跡
   */
  trackGroupCompletion(groupId, row, aiType) {
    const groupKey = `${groupId}_${row}`;
    
    if (!this.groupCompletionTracker.has(groupKey)) {
      this.groupCompletionTracker.set(groupKey, {
        required: new Set(['chatgpt', 'claude', 'gemini']),
        completed: new Set()
      });
    }
    
    const tracker = this.groupCompletionTracker.get(groupKey);
    tracker.completed.add(aiType);
    
    const isComplete = tracker.completed.size >= tracker.required.size;
    this.logger.log(`[ParallelExecutor] グループ${groupKey}進捗: ${tracker.completed.size}/${tracker.required.size}`);
    
    return isComplete;
  }
  
  /**
   * ウィンドウを閉じる
   */
  async closeWindow(windowId) {
    try {
      if (!this.isTestMode) {
        // WindowServiceを使用してウィンドウを閉じる（エラーハンドリングも統一）
        await WindowService.closeWindow(windowId);
      }
      
      const windowInfo = this.activeWindows.get(windowId);
      if (windowInfo) {
        this.windowPositions.delete(windowInfo.position);
        this.columnWindows.delete(windowInfo.column);
        this.activeWindows.delete(windowId);
        
        this.logger.log(`[ParallelExecutor] ウィンドウ閉鎖完了`, {
          windowId: windowId,
          column: windowInfo.column
        });
      }
    } catch (error) {
      this.logger.error(`[ParallelExecutor] ウィンドウ閉鎖エラー`, error);
    }
  }
}

export default ParallelExecutor;