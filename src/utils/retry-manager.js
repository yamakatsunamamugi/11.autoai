/**
 * @fileoverview RetryManager - リトライ処理を管理するユーティリティ
 *
 * 元々1-ai-common-base.jsにあったRetryManager機能を独立したモジュールとして実装
 * 各種自動リトライ処理を提供
 */

export class RetryManager {
  constructor(logger = console) {
    this.logger = logger;
    this.pcId = 'RetryManager';
    this.maxGroupRetryCount = 10;
    this.groupRetryDelays = [30000, 60000, 300000, 600000, 1200000, 2400000, 3600000, 5400000, 7200000, 9000000];
    this.waitingTextPatterns = ['お待ちください...'];
    this.groupFailedTasks = new Map();
    this.groupEmptyTasks = new Map();
    this.groupResponseFailures = new Map();
    this.groupRetryCount = new Map();
    this.groupRetryStats = new Map();
    this.groupRetryTimers = new Map();
  }

  recordFailedTask(groupId, task) {
    if (!this.groupFailedTasks.has(groupId)) {
      this.groupFailedTasks.set(groupId, new Map());
    }
    const columnMap = this.groupFailedTasks.get(groupId);
    if (!columnMap.has(task.column)) {
      columnMap.set(task.column, new Set());
    }
    columnMap.get(task.column).add(task);
    this.logger.log(`【RetryManager】失敗タスクを記録: グループ${groupId} - ${task.column}${task.row}`);
  }

  recordEmptyTask(groupId, task) {
    if (!this.groupEmptyTasks.has(groupId)) {
      this.groupEmptyTasks.set(groupId, new Map());
    }
    const columnMap = this.groupEmptyTasks.get(groupId);
    if (!columnMap.has(task.column)) {
      columnMap.set(task.column, new Set());
    }
    columnMap.get(task.column).add(task);
    this.logger.log(`【RetryManager】空白セルを記録: グループ${groupId} - ${task.column}${task.row}`);
  }

  isWaitingText(text) {
    if (!text) return false;
    if (text === '処理完了') return true;
    return this.waitingTextPatterns.some(pattern => text === pattern);
  }

  async executeWithRetry(config) {
    const {
      action,
      isSuccess = (result) => result && result.success !== false,
      maxRetries = 3,
      retryDelay = 2000,
      actionName = '処理',
      context = {}
    } = config;

    let retryCount = 0;
    let lastResult = null;
    let lastError = null;

    while (retryCount < maxRetries) {
      try {
        if (retryCount === 1 || retryCount === maxRetries - 1) {
          this.logger.log(`【RetryManager】${actionName} 再試行 ${retryCount}/${maxRetries}`, context);
        }
        lastResult = await action();
        if (isSuccess(lastResult)) {
          if (retryCount > 0) {
            this.logger.log(`【RetryManager】✅ ${actionName} 成功（${retryCount}回目の試行）`, context);
          }
          return { success: true, result: lastResult, retryCount };
        }
      } catch (error) {
        lastError = error;
        this.logger.error(`【RetryManager】${actionName} エラー`, {
          ...context,
          attempt: retryCount + 1,
          error: error.message
        });
      }
      retryCount++;
      if (retryCount >= maxRetries) {
        return { success: false, result: lastResult, error: lastError, retryCount };
      }
      if (retryDelay > 0) {
        await this.delay(retryDelay);
      }
    }
    return { success: false, result: lastResult, error: lastError, retryCount };
  }

  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // WindowService用のシンプルなリトライメソッド
  async executeSimpleRetry({ action, isSuccess, maxRetries = 20, interval = 500, actionName = '', context = {} }) {
    let retryCount = 0;
    let lastResult = null;
    let lastError = null;

    while (retryCount < maxRetries) {
      try {
        if (retryCount === 1 || retryCount === maxRetries - 1) {
          this.logger.log(`【RetryManager】${actionName} 再試行 ${retryCount}/${maxRetries}`, context);
        }
        lastResult = await action();
        if (isSuccess(lastResult)) {
          if (retryCount > 0) {
            this.logger.log(`【RetryManager】✅ ${actionName} 成功（${retryCount}回目の試行）`, context);
          }
          return { success: true, result: lastResult, retryCount };
        }
      } catch (error) {
        lastError = error;
        this.logger.error(`【RetryManager】${actionName} エラー`, {
          ...context,
          attempt: retryCount + 1,
          error: error.message
        });
      }
      retryCount++;
      if (retryCount >= maxRetries) {
        return { success: false, result: lastResult, error: lastError, retryCount };
      }
      if (interval > 0) {
        await this.delay(interval);
      }
    }
    return { success: false, result: lastResult, error: lastError, retryCount };
  }
}

// デフォルトインスタンスをエクスポート
export const defaultRetryManager = new RetryManager();