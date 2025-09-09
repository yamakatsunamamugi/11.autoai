/**
 * @fileoverview 拡張AIタスクハンドラー
 * 
 * 既存のAITaskHandlerを拡張し、以下の機能を追加:
 * - プラグイン機能
 * - 設定注入パターン
 * - リトライ機能の強化
 * - パフォーマンス監視
 * - 詳細なエラーハンドリング
 */

import { AITaskHandler } from './ai-task-handler.js';
import { sleep } from '../utils/sleep-utils.js';

/**
 * プラグインインターフェース
 */
export class TaskHandlerPlugin {
  constructor(name) {
    this.name = name;
    this.enabled = true;
  }

  /**
   * タスク実行前の処理
   * 
   * @param {Object} request - リクエストオブジェクト
   * @param {Object} context - 実行コンテキスト
   * @returns {Promise<Object>} 変更されたリクエスト
   */
  async beforeTaskExecution(request, context) {
    return request;
  }

  /**
   * タスク実行後の処理
   * 
   * @param {Object} result - 実行結果
   * @param {Object} context - 実行コンテキスト
   * @returns {Promise<Object>} 変更された結果
   */
  async afterTaskExecution(result, context) {
    return result;
  }

  /**
   * エラー処理
   * 
   * @param {Error} error - エラーオブジェクト
   * @param {Object} context - 実行コンテキスト
   * @returns {Promise<Object|null>} 回復結果（nullの場合はエラーを再スロー）
   */
  async onError(error, context) {
    return null;
  }
}

/**
 * テストモードプラグイン
 */
export class TestModePlugin extends TaskHandlerPlugin {
  constructor(config = {}) {
    super('TestMode');
    this.config = {
      skipPromptSending: true,
      skipResponseWaiting: true,
      simulateDelay: true,
      delayRange: { min: 1000, max: 3000 },
      dummyResponse: 'テストモードでの模擬応答',
      ...config
    };
  }

  async beforeTaskExecution(request, context) {
    if (request.waitResponse === false || request.getResponse === false) {
      context.testMode = true;
      context.originalRequest = { ...request };
    }
    return request;
  }

  async afterTaskExecution(result, context) {
    if (context.testMode) {
      // テストモードでの模擬処理
      if (this.config.simulateDelay) {
        const delay = Math.random() * 
          (this.config.delayRange.max - this.config.delayRange.min) + 
          this.config.delayRange.min;
        await sleep(delay);
      }

      return {
        success: true,
        response: this.config.dummyResponse,
        aiType: context.originalRequest?.aiType || 'test',
        taskId: context.originalRequest?.taskId,
        testMode: true,
        simulatedDelay: this.config.simulateDelay
      };
    }
    return result;
  }

}

/**
 * パフォーマンス監視プラグイン
 */
export class PerformanceMonitorPlugin extends TaskHandlerPlugin {
  constructor(config = {}) {
    super('PerformanceMonitor');
    this.config = {
      trackTiming: true,
      trackMemory: true,
      warnThreshold: 10000, // 10秒
      logSlowTasks: true,
      ...config
    };
    this.metrics = new Map();
  }

  async beforeTaskExecution(request, context) {
    if (this.config.trackTiming) {
      context.startTime = performance.now();
      context.startMemory = this.config.trackMemory ? this._getMemoryUsage() : null;
    }
    return request;
  }

  async afterTaskExecution(result, context) {
    if (this.config.trackTiming && context.startTime) {
      const duration = performance.now() - context.startTime;
      const memoryDelta = this.config.trackMemory ? 
        this._getMemoryUsage() - context.startMemory : null;

      const metrics = {
        taskId: result.taskId,
        duration,
        memoryDelta,
        timestamp: Date.now(),
        success: result.success
      };

      this.metrics.set(result.taskId, metrics);

      // 遅いタスクの警告
      if (duration > this.config.warnThreshold && this.config.logSlowTasks) {
        console.warn(`[PerformanceMonitor] 遅いタスク検出: ${result.taskId} (${duration.toFixed(2)}ms)`);
      }

      // 結果にメトリクスを追加
      result.performance = metrics;
    }
    return result;
  }

  getMetrics() {
    return Object.fromEntries(this.metrics);
  }

  clearMetrics() {
    this.metrics.clear();
  }

  _getMemoryUsage() {
    if (typeof performance !== 'undefined' && performance.memory) {
      return performance.memory.usedJSHeapSize;
    }
    return 0;
  }
}

/**
 * リトライプラグイン
 */
export class RetryPlugin extends TaskHandlerPlugin {
  constructor(config = {}) {
    super('Retry');
    this.config = {
      maxAttempts: 3,
      baseDelay: 1000,
      exponentialBackoff: true,
      retryConditions: ['timeout', 'network', 'temporary', 'spreadsheet_write_failed', 'write_verification_failed'],
      ...config
    };
  }

  async onError(error, context) {
    const attemptCount = context.attemptCount || 1;
    
    if (attemptCount >= this.config.maxAttempts) {
      return null; // 最大試行回数に達した場合はエラーを再スロー
    }

    if (!this._shouldRetry(error)) {
      return null; // リトライしない条件の場合はエラーを再スロー
    }

    // リトライ実行
    const delay = this._calculateDelay(attemptCount);
    console.log(`[RetryPlugin] タスクをリトライします (${attemptCount}/${this.config.maxAttempts}): ${delay}ms後`);
    
    await sleep(delay);
    
    context.attemptCount = attemptCount + 1;
    context.isRetry = true;
    
    // リトライを実行（呼び出し元で処理）
    return { retry: true, context };
  }

  _shouldRetry(error) {
    const errorMessage = error.message.toLowerCase();
    const errorType = error.type || '';
    
    // エラータイプまたはメッセージでリトライ判定
    return this.config.retryConditions.some(condition => 
      errorMessage.includes(condition) || 
      errorType.includes(condition) ||
      (condition === 'spreadsheet_write_failed' && (
        errorMessage.includes('書き込み確認失敗') ||
        errorMessage.includes('write verification failed') ||
        errorMessage.includes('スプレッドシート書き込み') ||
        errorType === 'SPREADSHEET_WRITE_FAILED'
      )) ||
      (condition === 'write_verification_failed' && (
        errorMessage.includes('確認失敗') ||
        errorMessage.includes('verification failed') ||
        errorType === 'WRITE_VERIFICATION_FAILED'
      ))
    );
  }

  _calculateDelay(attemptCount) {
    if (this.config.exponentialBackoff) {
      return this.config.baseDelay * Math.pow(2, attemptCount - 1);
    }
    return this.config.baseDelay;
  }

}

/**
 * 拡張AIタスクハンドラー
 */
export class EnhancedAITaskHandler extends AITaskHandler {
  constructor(config = {}) {
    super();
    
    this.config = {
      // 基本設定
      defaultTimeout: 180000,
      enablePlugins: true,
      logLevel: 'info',
      
      // プラグイン設定
      plugins: {
        testMode: { enabled: true },
        performanceMonitor: { enabled: true },
        retry: { enabled: true }
      },
      
      // エラーハンドリング設定
      errorHandling: {
        captureStack: true,
        logErrors: true,
        includeContext: true
      },
      
      ...config
    };

    // プラグインシステム
    this.plugins = new Map();
    this.pluginOrder = []; // 実行順序を管理
    
    // メトリクス
    this.metrics = {
      totalTasks: 0,
      successfulTasks: 0,
      failedTasks: 0,
      retriedTasks: 0,
      averageResponseTime: 0,
      lastActivity: null
    };
    
    // 履歴
    this.executionHistory = [];
    this.maxHistorySize = 1000;
    
    // デフォルトプラグインを初期化
    this._initializeDefaultPlugins();
  }

  /**
   * プラグインを登録
   * 
   * @param {TaskHandlerPlugin} plugin - プラグインインスタンス
   * @param {number} priority - 実行優先度（低い数値ほど早く実行）
   */
  registerPlugin(plugin, priority = 100) {
    this.plugins.set(plugin.name, { plugin, priority, enabled: plugin.enabled });
    
    // 優先度順でソート
    this.pluginOrder = Array.from(this.plugins.entries())
      .sort((a, b) => a[1].priority - b[1].priority)
      .map(([name]) => name);
    
    this.logger.log(`[EnhancedAITaskHandler] プラグイン登録: ${plugin.name} (優先度: ${priority})`);
  }

  /**
   * プラグインを無効化
   * 
   * @param {string} pluginName - プラグイン名
   */
  disablePlugin(pluginName) {
    if (this.plugins.has(pluginName)) {
      this.plugins.get(pluginName).enabled = false;
      this.logger.log(`[EnhancedAITaskHandler] プラグイン無効化: ${pluginName}`);
    }
  }

  /**
   * プラグインを有効化
   * 
   * @param {string} pluginName - プラグイン名
   */
  enablePlugin(pluginName) {
    if (this.plugins.has(pluginName)) {
      this.plugins.get(pluginName).enabled = true;
      this.logger.log(`[EnhancedAITaskHandler] プラグイン有効化: ${pluginName}`);
    }
  }

  /**
   * 拡張されたAIタスク実行処理
   * 
   * @param {Object} request - リクエストオブジェクト
   * @param {Object} sender - 送信元情報
   * @returns {Promise<Object>} 実行結果
   */
  async handleExecuteAITask(request, sender) {
    const startTime = performance.now();
    const context = {
      request: { ...request },
      sender,
      startTime,
      attemptCount: 1,
      pluginData: {}
    };

    this.metrics.totalTasks++;
    this.metrics.lastActivity = Date.now();

    try {
      // プラグインの前処理を実行
      if (this.config.enablePlugins) {
        request = await this._executePluginHook('beforeTaskExecution', request, context);
      }

      // メインタスク実行
      let result = await this._executeTaskWithRetry(request, sender, context);

      // プラグインの後処理を実行
      if (this.config.enablePlugins) {
        result = await this._executePluginHook('afterTaskExecution', result, context);
      }

      // 成功メトリクスを更新
      this.metrics.successfulTasks++;
      this._updateAverageResponseTime(performance.now() - startTime);

      // 実行履歴を記録
      this._recordExecution(request, result, context);

      return result;

    } catch (error) {
      // エラーメトリクスを更新
      this.metrics.failedTasks++;

      // プラグインのエラー処理を実行
      if (this.config.enablePlugins) {
        const recoveryResult = await this._executePluginErrorHandling(error, context);
        if (recoveryResult && recoveryResult.retry) {
          // リトライが要求された場合
          this.metrics.retriedTasks++;
          return this.handleExecuteAITask(request, sender);
        }
      }

      // エラー履歴を記録
      this._recordExecution(request, { success: false, error: error.message }, context);

      // 拡張されたエラー情報を投げる
      throw this._enhanceError(error, context);
    }
  }

  /**
   * 現在の状態を取得
   * 
   * @returns {Object} 詳細状態
   */
  getDetailedStatus() {
    return {
      metrics: { ...this.metrics },
      plugins: Object.fromEntries(
        Array.from(this.plugins.entries()).map(([name, info]) => [
          name, 
          { enabled: info.enabled, priority: info.priority }
        ])
      ),
      config: this._getSafeConfig(),
      executionHistory: this.executionHistory.slice(-10), // 最新10件
      performance: this._getPerformanceMetrics()
    };
  }

  /**
   * 履歴をクリア
   */
  clearHistory() {
    this.executionHistory = [];
    this.logger.log('[EnhancedAITaskHandler] 実行履歴をクリアしました');
  }

  /**
   * メトリクスをリセット
   */
  resetMetrics() {
    this.metrics = {
      totalTasks: 0,
      successfulTasks: 0,
      failedTasks: 0,
      retriedTasks: 0,
      averageResponseTime: 0,
      lastActivity: null
    };
    this.logger.log('[EnhancedAITaskHandler] メトリクスをリセットしました');
  }

  /**
   * デフォルトプラグインを初期化
   * 
   * @private
   */
  _initializeDefaultPlugins() {
    if (this.config.plugins.testMode?.enabled) {
      this.registerPlugin(new TestModePlugin(this.config.plugins.testMode), 10);
    }
    
    if (this.config.plugins.performanceMonitor?.enabled) {
      this.registerPlugin(new PerformanceMonitorPlugin(this.config.plugins.performanceMonitor), 20);
    }
    
    if (this.config.plugins.retry?.enabled) {
      this.registerPlugin(new RetryPlugin(this.config.plugins.retry), 30);
    }
  }

  /**
   * プラグインフックを実行
   * 
   * @param {string} hookName - フック名
   * @param {*} data - データ
   * @param {Object} context - コンテキスト
   * @returns {Promise<*>} 処理済みデータ
   * @private
   */
  async _executePluginHook(hookName, data, context) {
    for (const pluginName of this.pluginOrder) {
      const pluginInfo = this.plugins.get(pluginName);
      if (pluginInfo.enabled && pluginInfo.plugin[hookName]) {
        try {
          data = await pluginInfo.plugin[hookName](data, context);
        } catch (error) {
          this.logger.error(`[EnhancedAITaskHandler] プラグインエラー ${pluginName}.${hookName}:`, error);
        }
      }
    }
    return data;
  }

  /**
   * プラグインのエラーハンドリングを実行
   * 
   * @param {Error} error - エラー
   * @param {Object} context - コンテキスト
   * @returns {Promise<Object|null>} 回復結果
   * @private
   */
  async _executePluginErrorHandling(error, context) {
    for (const pluginName of this.pluginOrder) {
      const pluginInfo = this.plugins.get(pluginName);
      if (pluginInfo.enabled && pluginInfo.plugin.onError) {
        try {
          const result = await pluginInfo.plugin.onError(error, context);
          if (result) {
            return result; // 最初に回復結果を返したプラグインを使用
          }
        } catch (pluginError) {
          this.logger.error(`[EnhancedAITaskHandler] プラグインエラーハンドリングエラー ${pluginName}:`, pluginError);
        }
      }
    }
    return null;
  }

  /**
   * リトライ付きタスク実行
   * 
   * @param {Object} request - リクエスト
   * @param {Object} sender - 送信元
   * @param {Object} context - コンテキスト
   * @returns {Promise<Object>} 実行結果
   * @private
   */
  async _executeTaskWithRetry(request, sender, context) {
    try {
      return await super.handleExecuteAITask(request, sender);
    } catch (error) {
      // プラグインのエラー処理でリトライが決定される
      throw error;
    }
  }

  /**
   * 実行履歴を記録
   * 
   * @param {Object} request - リクエスト
   * @param {Object} result - 結果
   * @param {Object} context - コンテキスト
   * @private
   */
  _recordExecution(request, result, context) {
    const record = {
      timestamp: Date.now(),
      taskId: request.taskId,
      tabId: request.tabId,
      success: result.success,
      duration: performance.now() - context.startTime,
      attemptCount: context.attemptCount,
      error: result.error || null
    };

    this.executionHistory.push(record);

    // 履歴サイズを制限
    if (this.executionHistory.length > this.maxHistorySize) {
      this.executionHistory = this.executionHistory.slice(-this.maxHistorySize);
    }
  }

  /**
   * エラーを拡張
   * 
   * @param {Error} error - 元のエラー
   * @param {Object} context - コンテキスト
   * @returns {Error} 拡張されたエラー
   * @private
   */
  _enhanceError(error, context) {
    if (this.config.errorHandling.includeContext) {
      error.context = {
        taskId: context.request.taskId,
        tabId: context.request.tabId,
        attemptCount: context.attemptCount,
        duration: performance.now() - context.startTime
      };
    }

    if (this.config.errorHandling.captureStack && !error.stack) {
      error.stack = new Error().stack;
    }

    return error;
  }

  /**
   * 平均応答時間を更新
   * 
   * @param {number} responseTime - 応答時間
   * @private
   */
  _updateAverageResponseTime(responseTime) {
    const totalSuccessful = this.metrics.successfulTasks;
    if (totalSuccessful === 1) {
      this.metrics.averageResponseTime = responseTime;
    } else {
      this.metrics.averageResponseTime = 
        (this.metrics.averageResponseTime * (totalSuccessful - 1) + responseTime) / totalSuccessful;
    }
  }

  /**
   * 安全な設定を取得
   * 
   * @returns {Object} 設定オブジェクト
   * @private
   */
  _getSafeConfig() {
    return {
      defaultTimeout: this.config.defaultTimeout,
      enablePlugins: this.config.enablePlugins,
      logLevel: this.config.logLevel,
      pluginCount: this.plugins.size
    };
  }

  /**
   * パフォーマンスメトリクスを取得
   * 
   * @returns {Object} パフォーマンスメトリクス
   * @private
   */
  _getPerformanceMetrics() {
    const performancePlugin = this.plugins.get('PerformanceMonitor');
    if (performancePlugin && performancePlugin.enabled) {
      return performancePlugin.plugin.getMetrics();
    }
    return null;
  }
}

// シングルトンインスタンスをエクスポート
export const enhancedAiTaskHandler = new EnhancedAITaskHandler();