/**
 * @fileoverview タスクキュー管理システム
 * 
 * ウィンドウリソースの効率的な利用とタスクの順序制御を行うシステム。
 * タスクをキューに保持し、利用可能なリソースに応じて自動的に実行する。
 */

import { WindowService } from '../services/window-service.js';

export class TaskQueueManager {
  constructor() {
    // タスクキュー
    this.taskQueue = [];
    this.processingTasks = new Map(); // taskId -> task
    this.failedTasks = new Map(); // taskId -> {task, error, retryCount}
    
    // 設定
    this.maxConcurrentTasks = 4;
    this.maxRetries = 3;
    this.retryDelay = 2000;
    
    // 状態管理
    this.isProcessing = false;
    this.isPaused = false;
    
    // イベントハンドラー
    this.onTaskComplete = null;
    this.onTaskFailed = null;
    this.onQueueEmpty = null;
    
    console.log('[TaskQueueManager] 初期化完了');
  }
  
  /**
   * タスクをキューに追加
   * @param {Object} task - タスクオブジェクト
   * @param {boolean} priority - 優先度フラグ
   */
  enqueue(task, priority = false) {
    if (!task || !task.id) {
      console.error('[TaskQueueManager] 無効なタスク:', task);
      return;
    }
    
    if (priority) {
      this.taskQueue.unshift(task);
      console.log(`[TaskQueueManager] 優先タスク追加: ${task.id}`);
    } else {
      this.taskQueue.push(task);
      console.log(`[TaskQueueManager] タスク追加: ${task.id}`);
    }
    
    // 処理が停止していれば開始
    if (!this.isProcessing && !this.isPaused) {
      this.startProcessing();
    }
  }
  
  /**
   * 複数タスクを一括追加
   * @param {Array} tasks - タスク配列
   */
  enqueueMultiple(tasks) {
    if (!Array.isArray(tasks)) {
      console.error('[TaskQueueManager] タスク配列が必要です:', tasks);
      return;
    }
    
    tasks.forEach(task => this.enqueue(task, false));
    console.log(`[TaskQueueManager] ${tasks.length}個のタスクを追加`);
  }
  
  /**
   * キュー処理を開始
   */
  async startProcessing() {
    if (this.isProcessing || this.isPaused) {
      return;
    }
    
    this.isProcessing = true;
    console.log('[TaskQueueManager] キュー処理開始');
    
    let taskIndex = 0;
    while (this.taskQueue.length > 0 && !this.isPaused) {
      // タスクインデックスからポジションを計算
      const position = taskIndex % 4; // 0-3の範囲に収める
      
      // 処理中タスク数が上限に達している場合は待機
      if (this.processingTasks.size >= this.maxConcurrentTasks) {
        await new Promise(resolve => setTimeout(resolve, 500));
        continue;
      }
      
      // タスクを取り出して実行
      const task = this.taskQueue.shift();
      if (task) {
        this.processTask(task, position);
        taskIndex++;
      }
    }
    
    this.isProcessing = false;
    console.log('[TaskQueueManager] キュー処理終了');
    
    // キューが空になったらコールバック実行
    if (this.taskQueue.length === 0 && this.processingTasks.size === 0) {
      if (this.onQueueEmpty) {
        this.onQueueEmpty();
      }
    }
  }
  
  /**
   * 利用可能なポジションを待つ
   * @returns {Promise<number>} ポジション番号
   */
  async waitForAvailablePosition() {
    const maxWaitTime = 30000; // 30秒
    const checkInterval = 500; // 0.5秒ごとにチェック
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWaitTime) {
      // 処理中タスク数が上限未満かチェック
      if (this.processingTasks.size >= this.maxConcurrentTasks) {
        await new Promise(resolve => setTimeout(resolve, checkInterval));
        continue;
      }
      
      // 利用可能なポジションを探す
      const position = WindowService.findAvailablePosition();
      if (position !== -1) {
        return position;
      }
      
      await new Promise(resolve => setTimeout(resolve, checkInterval));
    }
    
    console.warn('[TaskQueueManager] ポジション待機タイムアウト');
    return -1;
  }
  
  /**
   * タスクを処理
   * @param {Object} task - タスク
   * @param {number} position - ポジション
   */
  async processTask(task, position) {
    const taskId = task.id;
    
    try {
      console.log(`[TaskQueueManager] タスク処理開始: ${taskId} (Position: ${position})`);
      this.processingTasks.set(taskId, task);
      
      // タスク実行関数を呼び出し
      if (task.execute) {
        await task.execute(position);
      } else {
        throw new Error('タスクにexecute関数がありません');
      }
      
      // 成功処理
      this.processingTasks.delete(taskId);
      console.log(`[TaskQueueManager] タスク完了: ${taskId}`);
      
      if (this.onTaskComplete) {
        this.onTaskComplete(task);
      }
      
    } catch (error) {
      console.error(`[TaskQueueManager] タスクエラー: ${taskId}`, error);
      this.processingTasks.delete(taskId);
      
      // リトライ処理
      await this.handleTaskError(task, error);
    }
    
    // 次のタスクを処理
    if (!this.isPaused && this.taskQueue.length > 0) {
      this.startProcessing();
    }
  }
  
  /**
   * タスクエラーを処理
   * @param {Object} task - タスク
   * @param {Error} error - エラー
   */
  async handleTaskError(task, error) {
    const taskId = task.id;
    let failedInfo = this.failedTasks.get(taskId) || { task, error, retryCount: 0 };
    
    failedInfo.retryCount++;
    failedInfo.error = error;
    
    if (failedInfo.retryCount < this.maxRetries) {
      // リトライ
      console.log(`[TaskQueueManager] リトライ ${failedInfo.retryCount}/${this.maxRetries}: ${taskId}`);
      this.failedTasks.set(taskId, failedInfo);
      
      // 遅延後に再度キューに追加
      await new Promise(resolve => setTimeout(resolve, this.retryDelay));
      this.enqueue(task, true); // 優先的に再実行
      
    } else {
      // 最終的に失敗
      console.error(`[TaskQueueManager] タスク最終失敗: ${taskId}`);
      this.failedTasks.delete(taskId);
      
      if (this.onTaskFailed) {
        this.onTaskFailed(task, error);
      }
    }
  }
  
  /**
   * キュー処理を一時停止
   */
  pause() {
    this.isPaused = true;
    console.log('[TaskQueueManager] キュー処理を一時停止');
  }
  
  /**
   * キュー処理を再開
   */
  resume() {
    this.isPaused = false;
    console.log('[TaskQueueManager] キュー処理を再開');
    
    if (!this.isProcessing && this.taskQueue.length > 0) {
      this.startProcessing();
    }
  }
  
  /**
   * キューをクリア
   */
  clear() {
    this.taskQueue = [];
    console.log('[TaskQueueManager] キューをクリア');
  }
  
  /**
   * 統計情報を取得
   * @returns {Object} 統計情報
   */
  getStats() {
    return {
      queueLength: this.taskQueue.length,
      processingCount: this.processingTasks.size,
      failedCount: this.failedTasks.size,
      isProcessing: this.isProcessing,
      isPaused: this.isPaused
    };
  }
  
  /**
   * デバッグ情報を出力
   */
  debug() {
    console.log('[TaskQueueManager] デバッグ情報:');
    console.log('  キュー長:', this.taskQueue.length);
    console.log('  処理中:', this.processingTasks.size);
    console.log('  失敗:', this.failedTasks.size);
    console.log('  処理状態:', this.isProcessing ? '処理中' : '停止');
    console.log('  一時停止:', this.isPaused ? 'はい' : 'いいえ');
    
    if (this.taskQueue.length > 0) {
      console.log('  次のタスク:', this.taskQueue[0].id);
    }
    
    if (this.processingTasks.size > 0) {
      console.log('  処理中タスク:');
      for (const [id, task] of this.processingTasks) {
        console.log(`    - ${id}`);
      }
    }
  }
}

// デフォルトエクスポート
export default TaskQueueManager;