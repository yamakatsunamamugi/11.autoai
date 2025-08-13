/**
 * @fileoverview 拡張StreamProcessor
 * 
 * 既存のStreamProcessorを拡張し、
 * テスト設定の統一管理と柔軟な実行オプションを提供する。
 */

import StreamProcessor from './stream-processor.js';

/**
 * 拡張StreamProcessorクラス
 * 
 * 既存のStreamProcessorを継承し、以下の機能を追加:
 * - 設定管理の統一化
 * - テストモードの強化
 * - 実行オプションの拡張
 * - パフォーマンス計測
 * - 詳細なログ出力
 */
export class EnhancedStreamProcessor extends StreamProcessor {
  constructor(config = {}, dependencies = {}) {
    super(dependencies);
    
    // 設定管理
    this.config = {
      // ウィンドウ設定
      window: {
        maxConcurrent: 4,
        positions: [
          { id: 0, name: '左上', x: 100, y: 100 },
          { id: 1, name: '右上', x: 800, y: 100 },
          { id: 2, name: '左下', x: 100, y: 600 },
          { id: 3, name: '右下', x: 800, y: 600 }
        ],
        size: { width: 1200, height: 800 },
        closeDelay: 1000 // ウィンドウを閉じる前の待機時間
      },
      
      // テスト設定
      test: {
        enabled: false,
        waitTime: { min: 5, max: 15 }, // 秒
        skipPromptSending: false,
        skipResponseWaiting: false,
        simulateDelay: true
      },
      
      // 実行設定
      execution: {
        retryAttempts: 3,
        retryDelay: 1000, // ミリ秒
        timeout: 180000, // 3分
        batchSize: 4,
        pauseBetweenTasks: 500 // ミリ秒
      },
      
      // ログ設定
      logging: {
        level: 'info', // 'debug', 'info', 'warning', 'error'
        includeTimestamp: true,
        includeContext: true
      },
      
      // パフォーマンス設定
      performance: {
        trackMetrics: true,
        measureSteps: true,
        logSlowOperations: true,
        slowOperationThreshold: 5000 // ミリ秒
      },
      
      ...config
    };
    
    // パフォーマンス計測
    this.metrics = {
      totalStartTime: null,
      totalEndTime: null,
      windowCreationTimes: new Map(),
      taskExecutionTimes: new Map(),
      operationCounts: {
        windowsCreated: 0,
        windowsClosed: 0,
        tasksExecuted: 0,
        tasksCompleted: 0,
        tasksFailed: 0,
        retries: 0
      }
    };
    
    // 実行状態の拡張
    this.enhancedState = {
      isPaused: false,
      currentPhase: 'idle', // 'idle', 'initializing', 'processing', 'cleanup'
      lastError: null,
      executionHistory: []
    };
    
    // フック関数（カスタマイズ用）
    this.hooks = {
      beforeProcessing: null,
      afterProcessing: null,
      beforeWindowCreation: null,
      afterWindowCreation: null,
      beforeTaskExecution: null,
      afterTaskExecution: null,
      onError: null
    };
  }

  /**
   * 設定を更新
   * 
   * @param {string} path - 設定パス（例: 'test.waitTime.min'）
   * @param {*} value - 新しい値
   */
  updateConfig(path, value) {
    const keys = path.split('.');
    let target = this.config;
    
    for (let i = 0; i < keys.length - 1; i++) {
      if (!target[keys[i]]) {
        target[keys[i]] = {};
      }
      target = target[keys[i]];
    }
    
    const oldValue = target[keys[keys.length - 1]];
    target[keys[keys.length - 1]] = value;
    
    this._log('info', `設定更新: ${path} = ${JSON.stringify(value)} (旧値: ${JSON.stringify(oldValue)})`);
  }

  /**
   * 設定を取得
   * 
   * @param {string} path - 設定パス
   * @returns {*} 設定値
   */
  getConfig(path = null) {
    if (!path) return this.config;
    
    return path.split('.').reduce((obj, key) => obj?.[key], this.config);
  }

  /**
   * フック関数を設定
   * 
   * @param {string} name - フック名
   * @param {Function} callback - コールバック関数
   */
  setHook(name, callback) {
    if (this.hooks.hasOwnProperty(name)) {
      this.hooks[name] = callback;
      this._log('info', `フック関数を設定: ${name}`);
    } else {
      throw new Error(`Unknown hook: ${name}`);
    }
  }

  /**
   * 拡張されたタスクストリーム処理
   * 
   * @param {TaskList} taskList - タスクリスト
   * @param {Object} spreadsheetData - スプレッドシートデータ
   * @param {Object} options - 実行オプション
   * @returns {Promise<Object>} 処理結果
   */
  async processTaskStream(taskList, spreadsheetData, options = {}) {
    // オプションを設定にマージ
    this._mergeExecutionOptions(options);
    
    // パフォーマンス計測開始
    if (this.config.performance.trackMetrics) {
      this.metrics.totalStartTime = performance.now();
    }
    
    this.enhancedState.currentPhase = 'initializing';
    this._log('info', 'Enhanced StreamProcessor 処理開始', {
      totalTasks: taskList.tasks.length,
      config: this._getSafeConfig()
    });

    try {
      // 前処理フック
      if (this.hooks.beforeProcessing) {
        await this.hooks.beforeProcessing(taskList, spreadsheetData, options);
      }

      this.enhancedState.currentPhase = 'processing';
      
      // 親クラスの処理を実行
      const result = await super.processTaskStream(taskList, spreadsheetData, {
        testMode: this.config.test.enabled,
        ...options
      });

      // 後処理フック
      if (this.hooks.afterProcessing) {
        await this.hooks.afterProcessing(result);
      }

      // パフォーマンス計測終了
      if (this.config.performance.trackMetrics) {
        this.metrics.totalEndTime = performance.now();
        const totalDuration = this.metrics.totalEndTime - this.metrics.totalStartTime;
        this._log('info', `処理完了: ${totalDuration.toFixed(2)}ms`);
      }

      this.enhancedState.currentPhase = 'idle';
      
      // 拡張結果を返す
      return {
        ...result,
        metrics: this.config.performance.trackMetrics ? this._getMetrics() : null,
        executionHistory: [...this.enhancedState.executionHistory]
      };

    } catch (error) {
      this.enhancedState.lastError = error;
      this.enhancedState.currentPhase = 'error';
      
      // エラーフック
      if (this.hooks.onError) {
        await this.hooks.onError(error);
      }
      
      this._log('error', `処理エラー: ${error.message}`, { stack: error.stack });
      throw error;
    }
  }

  /**
   * ウィンドウ作成処理の拡張
   * 
   * @param {string} column - 列
   * @param {string} aiType - AIタイプ
   * @param {number} preferredPosition - 希望位置
   * @returns {Promise<Object>} ウィンドウ情報
   */
  async createWindow(column, aiType, preferredPosition = null) {
    const startTime = performance.now();
    
    try {
      // 前処理フック
      if (this.hooks.beforeWindowCreation) {
        await this.hooks.beforeWindowCreation(column, aiType, preferredPosition);
      }

      // 親クラスのウィンドウ作成処理を呼び出し
      const windowInfo = await super.createWindow(column, aiType, preferredPosition);

      // パフォーマンス計測
      if (this.config.performance.trackMetrics) {
        const duration = performance.now() - startTime;
        this.metrics.windowCreationTimes.set(windowInfo.windowId, duration);
        this.metrics.operationCounts.windowsCreated++;
        
        if (duration > this.config.performance.slowOperationThreshold) {
          this._log('warning', `ウィンドウ作成が遅い: ${duration.toFixed(2)}ms`);
        }
      }

      // 後処理フック
      if (this.hooks.afterWindowCreation) {
        await this.hooks.afterWindowCreation(windowInfo);
      }

      this._log('info', `ウィンドウ作成完了: ${windowInfo.windowId} (${column}列, ${aiType})`, {
        position: windowInfo.position,
        duration: performance.now() - startTime
      });

      return windowInfo;

    } catch (error) {
      this._log('error', `ウィンドウ作成エラー: ${error.message}`, { column, aiType });
      throw error;
    }
  }

  /**
   * タスク実行処理の拡張
   * 
   * @param {Object} task - タスク
   * @param {Object} windowInfo - ウィンドウ情報
   * @returns {Promise<Object>} 実行結果
   */
  async executeTaskInWindow(task, windowInfo) {
    const startTime = performance.now();
    
    try {
      // 前処理フック
      if (this.hooks.beforeTaskExecution) {
        await this.hooks.beforeTaskExecution(task, windowInfo);
      }

      // 一時停止チェック
      while (this.enhancedState.isPaused) {
        await this._sleep(100);
      }

      // タスク間の待機
      if (this.config.execution.pauseBetweenTasks > 0) {
        await this._sleep(this.config.execution.pauseBetweenTasks);
      }

      this.metrics.operationCounts.tasksExecuted++;

      // 親クラスのタスク実行処理を呼び出し
      const result = await super.executeTaskInWindow(task, windowInfo);

      // パフォーマンス計測
      if (this.config.performance.trackMetrics) {
        const duration = performance.now() - startTime;
        this.metrics.taskExecutionTimes.set(task.id, duration);
        
        if (duration > this.config.performance.slowOperationThreshold) {
          this._log('warning', `タスク実行が遅い: ${duration.toFixed(2)}ms`);
        }
      }

      this.metrics.operationCounts.tasksCompleted++;

      // 後処理フック
      if (this.hooks.afterTaskExecution) {
        await this.hooks.afterTaskExecution(task, windowInfo, result);
      }

      // 実行履歴を記録
      this.enhancedState.executionHistory.push({
        timestamp: Date.now(),
        taskId: task.id,
        column: task.column,
        aiType: task.aiType,
        duration: performance.now() - startTime,
        success: result.success
      });

      return result;

    } catch (error) {
      this.metrics.operationCounts.tasksFailed++;
      this._log('error', `タスク実行エラー: ${error.message}`, { taskId: task.id });
      throw error;
    }
  }

  /**
   * 処理を一時停止
   */
  pause() {
    this.enhancedState.isPaused = true;
    this._log('info', '処理を一時停止しました');
  }

  /**
   * 処理を再開
   */
  resume() {
    this.enhancedState.isPaused = false;
    this._log('info', '処理を再開しました');
  }

  /**
   * 現在の詳細状態を取得
   * 
   * @returns {Object} 詳細状態
   */
  getDetailedStatus() {
    return {
      ...this.getStatus(),
      config: this._getSafeConfig(),
      enhancedState: { ...this.enhancedState },
      metrics: this.config.performance.trackMetrics ? this._getMetrics() : null,
      hooks: Object.keys(this.hooks).filter(key => this.hooks[key] !== null)
    };
  }

  /**
   * リトライ付きで処理を実行
   * 
   * @param {Function} fn - 実行する関数
   * @param {string} context - コンテキスト
   * @param {number} attempts - リトライ回数
   * @returns {Promise} 実行結果
   * @private
   */
  async _withRetry(fn, context, attempts = null) {
    const maxAttempts = attempts || this.config.execution.retryAttempts;
    let lastError;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        this.metrics.operationCounts.retries++;
        
        if (attempt < maxAttempts) {
          this._log('warning', `${context} 失敗 (${attempt}/${maxAttempts}): ${error.message}`);
          await this._sleep(this.config.execution.retryDelay);
        }
      }
    }

    throw new Error(`${context} 最大リトライ回数を超過: ${lastError.message}`);
  }

  /**
   * ログ出力の統一化
   * 
   * @param {string} level - ログレベル
   * @param {string} message - メッセージ
   * @param {Object} data - 追加データ
   * @private
   */
  _log(level, message, data = null) {
    if (!this._shouldLog(level)) return;

    const logEntry = {
      timestamp: this.config.logging.includeTimestamp ? new Date().toISOString() : null,
      level: level.toUpperCase(),
      context: this.config.logging.includeContext ? 'EnhancedStreamProcessor' : null,
      message,
      data
    };

    // フィルタリングして出力
    const filteredEntry = Object.fromEntries(
      Object.entries(logEntry).filter(([_, value]) => value !== null)
    );

    if (this.logger && this.logger.log) {
      this.logger.log(JSON.stringify(filteredEntry));
    } else {
      console.log(JSON.stringify(filteredEntry));
    }
  }

  /**
   * ログレベルをチェック
   * 
   * @param {string} level - ログレベル
   * @returns {boolean} 出力するかどうか
   * @private
   */
  _shouldLog(level) {
    const levels = ['debug', 'info', 'warning', 'error'];
    const currentLevelIndex = levels.indexOf(this.config.logging.level);
    const messageLevelIndex = levels.indexOf(level);
    return messageLevelIndex >= currentLevelIndex;
  }

  /**
   * 安全な設定オブジェクトを取得
   * 
   * @returns {Object} 設定オブジェクト（機密情報除外）
   * @private
   */
  _getSafeConfig() {
    // 機密情報や大きなオブジェクトを除外した設定を返す
    return {
      window: this.config.window,
      test: this.config.test,
      execution: this.config.execution,
      logging: { level: this.config.logging.level },
      performance: { trackMetrics: this.config.performance.trackMetrics }
    };
  }

  /**
   * メトリクスを取得
   * 
   * @returns {Object} パフォーマンスメトリクス
   * @private
   */
  _getMetrics() {
    const totalDuration = this.metrics.totalEndTime && this.metrics.totalStartTime
      ? this.metrics.totalEndTime - this.metrics.totalStartTime
      : null;

    return {
      totalDuration,
      operationCounts: { ...this.metrics.operationCounts },
      averageWindowCreationTime: this._calculateAverage(this.metrics.windowCreationTimes),
      averageTaskExecutionTime: this._calculateAverage(this.metrics.taskExecutionTimes),
      windowCreationTimes: Object.fromEntries(this.metrics.windowCreationTimes),
      taskExecutionTimes: Object.fromEntries(this.metrics.taskExecutionTimes)
    };
  }

  /**
   * 平均値を計算
   * 
   * @param {Map} values - 値のマップ
   * @returns {number|null} 平均値
   * @private
   */
  _calculateAverage(values) {
    if (values.size === 0) return null;
    const total = Array.from(values.values()).reduce((sum, val) => sum + val, 0);
    return total / values.size;
  }

  /**
   * 実行オプションを設定にマージ
   * 
   * @param {Object} options - 実行オプション
   * @private
   */
  _mergeExecutionOptions(options) {
    if (options.testMode !== undefined) {
      this.config.test.enabled = options.testMode;
    }
    if (options.timeout !== undefined) {
      this.config.execution.timeout = options.timeout;
    }
    if (options.retryAttempts !== undefined) {
      this.config.execution.retryAttempts = options.retryAttempts;
    }
    if (options.consecutiveTest !== undefined) {
      this.config.test.skipPromptSending = options.consecutiveTest;
      this.config.test.skipResponseWaiting = options.consecutiveTest;
    }
  }

  /**
   * 待機処理
   * 
   * @param {number} ms - 待機時間（ミリ秒）
   * @returns {Promise} 待機Promise
   * @private
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default EnhancedStreamProcessor;