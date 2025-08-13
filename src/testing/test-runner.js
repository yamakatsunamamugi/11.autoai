/**
 * @fileoverview 統一テスト実行エンジン
 * 
 * 複数のテストを統一的に実行・管理するエンジン。
 * スケジュール実行、並列実行、結果集約機能を提供。
 */

import { getLogger } from '../core/logging-system.js';
import { globalErrorHandler } from '../core/error-system.js';
import { loadAppConfig } from '../config/config-loader.js';

/**
 * テスト実行状態
 */
export const RUNNER_STATES = {
  IDLE: 'idle',
  RUNNING: 'running',
  PAUSED: 'paused',
  STOPPING: 'stopping',
  COMPLETED: 'completed',
  ERROR: 'error'
};

/**
 * テスト優先度
 */
export const TEST_PRIORITIES = {
  LOW: 1,
  NORMAL: 2,
  HIGH: 3,
  CRITICAL: 4
};

/**
 * テスト実行エンジン
 */
export class TestRunner {
  constructor(config = {}) {
    this.config = {
      maxConcurrentTests: 2,
      defaultTimeout: 300000, // 5分
      retryFailedTests: true,
      maxRetries: 3,
      retryDelay: 5000,
      enableScheduling: true,
      enableReporting: true,
      reportInterval: 10000, // 10秒
      ...config
    };

    this.logger = getLogger('TestRunner');
    this.state = RUNNER_STATES.IDLE;
    
    // テスト管理
    this.tests = new Map(); // testId -> testDefinition
    this.queue = []; // 実行待ちテスト
    this.running = new Map(); // testId -> runningTest
    this.completed = new Map(); // testId -> result
    this.failed = new Map(); // testId -> failureInfo
    
    // スケジュール管理
    this.schedules = new Map(); // scheduleId -> schedule
    this.schedulerTimer = null;
    
    // 統計情報
    this.stats = {
      totalTests: 0,
      completedTests: 0,
      failedTests: 0,
      skippedTests: 0,
      totalDuration: 0,
      averageDuration: 0,
      startTime: null,
      endTime: null
    };
    
    // イベントリスナー
    this.listeners = new Map();
    
    // レポートタイマー
    this.reportTimer = null;
  }

  /**
   * テストを登録
   * 
   * @param {string} id - テストID
   * @param {Object} definition - テスト定義
   */
  registerTest(id, definition) {
    if (this.tests.has(id)) {
      throw new Error(`Test ${id} is already registered`);
    }

    const testDef = {
      id,
      name: definition.name || id,
      description: definition.description || '',
      priority: definition.priority || TEST_PRIORITIES.NORMAL,
      timeout: definition.timeout || this.config.defaultTimeout,
      retryable: definition.retryable !== false,
      tags: definition.tags || [],
      dependencies: definition.dependencies || [],
      setup: definition.setup || null,
      teardown: definition.teardown || null,
      test: definition.test,
      validate: definition.validate || null,
      enabled: definition.enabled !== false,
      ...definition
    };

    this.tests.set(id, testDef);
    this.logger.info(`テスト登録: ${id}`, { name: testDef.name });
  }

  /**
   * テストの登録を解除
   * 
   * @param {string} id - テストID
   */
  unregisterTest(id) {
    if (this.running.has(id)) {
      throw new Error(`Cannot unregister running test: ${id}`);
    }

    this.tests.delete(id);
    this.queue = this.queue.filter(t => t.id !== id);
    this.logger.info(`テスト登録解除: ${id}`);
  }

  /**
   * テストを実行キューに追加
   * 
   * @param {string|Array<string>} testIds - テストID（複数可）
   * @param {Object} options - 実行オプション
   */
  queueTests(testIds, options = {}) {
    const ids = Array.isArray(testIds) ? testIds : [testIds];
    
    ids.forEach(id => {
      if (!this.tests.has(id)) {
        throw new Error(`Test not found: ${id}`);
      }

      const testDef = this.tests.get(id);
      if (!testDef.enabled) {
        this.logger.warn(`テストが無効化されています: ${id}`);
        return;
      }

      // 依存関係をチェック
      const missingDeps = testDef.dependencies.filter(dep => !this.tests.has(dep));
      if (missingDeps.length > 0) {
        throw new Error(`Missing dependencies for ${id}: ${missingDeps.join(', ')}`);
      }

      const queueItem = {
        id,
        definition: testDef,
        options: { ...options },
        queuedAt: Date.now(),
        retryCount: 0
      };

      this.queue.push(queueItem);
      this.logger.info(`テストをキューに追加: ${id}`);
    });

    // 優先度でソート
    this.queue.sort((a, b) => b.definition.priority - a.definition.priority);
  }

  /**
   * 全テストを実行
   * 
   * @param {Object} options - 実行オプション
   * @returns {Promise<Object>} 実行結果
   */
  async runAll(options = {}) {
    const enabledTests = Array.from(this.tests.keys()).filter(id => 
      this.tests.get(id).enabled
    );
    
    return this.run(enabledTests, options);
  }

  /**
   * 指定されたテストを実行
   * 
   * @param {string|Array<string>} testIds - テストID
   * @param {Object} options - 実行オプション
   * @returns {Promise<Object>} 実行結果
   */
  async run(testIds, options = {}) {
    if (this.state === RUNNER_STATES.RUNNING) {
      throw new Error('Test runner is already running');
    }

    this.state = RUNNER_STATES.RUNNING;
    this.stats.startTime = Date.now();
    this.stats.endTime = null;

    try {
      // テストをキューに追加
      this.queueTests(testIds, options);
      
      // レポート開始
      if (this.config.enableReporting) {
        this._startReporting();
      }

      // テスト実行開始
      this._emit('runStarted', { testCount: this.queue.length });
      this.logger.info(`テスト実行開始: ${this.queue.length}個のテスト`);

      // メインループ
      await this._runTestLoop();

      this.state = RUNNER_STATES.COMPLETED;
      this.stats.endTime = Date.now();
      this.stats.totalDuration = this.stats.endTime - this.stats.startTime;

      // レポート停止
      if (this.reportTimer) {
        clearInterval(this.reportTimer);
        this.reportTimer = null;
      }

      const result = this._generateSummaryReport();
      this._emit('runCompleted', result);
      this.logger.info('テスト実行完了', result.summary);

      return result;

    } catch (error) {
      this.state = RUNNER_STATES.ERROR;
      this.logger.error('テスト実行エラー', error);
      
      if (this.reportTimer) {
        clearInterval(this.reportTimer);
        this.reportTimer = null;
      }

      this._emit('runFailed', { error });
      throw error;
    }
  }

  /**
   * テスト実行を停止
   */
  async stop() {
    if (this.state !== RUNNER_STATES.RUNNING) {
      return;
    }

    this.state = RUNNER_STATES.STOPPING;
    this.logger.info('テスト実行を停止中...');

    // 実行中のテストを停止
    const stopPromises = Array.from(this.running.values()).map(async (runningTest) => {
      try {
        if (runningTest.testInstance && runningTest.testInstance.stop) {
          await runningTest.testInstance.stop();
        }
      } catch (error) {
        this.logger.error(`テスト停止エラー: ${runningTest.id}`, error);
      }
    });

    await Promise.all(stopPromises);

    // キューをクリア
    this.queue = [];
    this.running.clear();

    this.state = RUNNER_STATES.IDLE;
    this._emit('runStopped');
    this.logger.info('テスト実行を停止しました');
  }

  /**
   * テスト実行を一時停止
   */
  pause() {
    if (this.state === RUNNER_STATES.RUNNING) {
      this.state = RUNNER_STATES.PAUSED;
      this._emit('runPaused');
      this.logger.info('テスト実行を一時停止しました');
    }
  }

  /**
   * テスト実行を再開
   */
  resume() {
    if (this.state === RUNNER_STATES.PAUSED) {
      this.state = RUNNER_STATES.RUNNING;
      this._emit('runResumed');
      this.logger.info('テスト実行を再開しました');
    }
  }

  /**
   * スケジュールを追加
   * 
   * @param {string} id - スケジュールID
   * @param {Object} schedule - スケジュール定義
   */
  addSchedule(id, schedule) {
    const scheduleDef = {
      id,
      name: schedule.name || id,
      testIds: schedule.testIds,
      cron: schedule.cron,
      interval: schedule.interval,
      enabled: schedule.enabled !== false,
      options: schedule.options || {},
      lastRun: null,
      nextRun: null,
      runCount: 0
    };

    this.schedules.set(id, scheduleDef);
    this._updateSchedulerTimer();
    this.logger.info(`スケジュール追加: ${id}`, scheduleDef);
  }

  /**
   * スケジュールを削除
   * 
   * @param {string} id - スケジュールID
   */
  removeSchedule(id) {
    this.schedules.delete(id);
    this._updateSchedulerTimer();
    this.logger.info(`スケジュール削除: ${id}`);
  }

  /**
   * イベントリスナーを追加
   * 
   * @param {string} event - イベント名
   * @param {Function} listener - リスナー関数
   */
  on(event, listener) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(listener);
  }

  /**
   * イベントリスナーを削除
   * 
   * @param {string} event - イベント名
   * @param {Function} listener - リスナー関数
   */
  off(event, listener) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).delete(listener);
    }
  }

  /**
   * 現在の状態を取得
   * 
   * @returns {Object} 状態情報
   */
  getStatus() {
    return {
      state: this.state,
      stats: { ...this.stats },
      queue: this.queue.length,
      running: this.running.size,
      completed: this.completed.size,
      failed: this.failed.size,
      tests: {
        total: this.tests.size,
        enabled: Array.from(this.tests.values()).filter(t => t.enabled).length
      },
      schedules: {
        total: this.schedules.size,
        enabled: Array.from(this.schedules.values()).filter(s => s.enabled).length
      }
    };
  }

  /**
   * 詳細レポートを生成
   * 
   * @returns {Object} 詳細レポート
   */
  generateDetailedReport() {
    return {
      summary: this._generateSummaryReport(),
      tests: Array.from(this.tests.values()),
      completed: Object.fromEntries(this.completed),
      failed: Object.fromEntries(this.failed),
      running: Array.from(this.running.values()).map(r => ({
        id: r.id,
        startTime: r.startTime,
        duration: Date.now() - r.startTime
      })),
      queue: this.queue.map(q => ({
        id: q.id,
        priority: q.definition.priority,
        queuedAt: q.queuedAt
      }))
    };
  }

  /**
   * テスト実行ループ
   * 
   * @returns {Promise} 実行完了Promise
   * @private
   */
  async _runTestLoop() {
    while (this.queue.length > 0 || this.running.size > 0) {
      // 停止チェック
      if (this.state === RUNNER_STATES.STOPPING) {
        break;
      }

      // 一時停止チェック
      if (this.state === RUNNER_STATES.PAUSED) {
        await this._sleep(1000);
        continue;
      }

      // 新しいテストを開始
      while (this.queue.length > 0 && 
             this.running.size < this.config.maxConcurrentTests) {
        
        const queueItem = this.queue.shift();
        
        // 依存関係チェック
        if (!this._checkDependencies(queueItem.definition)) {
          // 依存関係が満たされていない場合は後回し
          this.queue.push(queueItem);
          break;
        }

        this._startTest(queueItem);
      }

      // 完了したテストをチェック
      await this._checkCompletedTests();

      // 短時間待機
      await this._sleep(100);
    }
  }

  /**
   * テストを開始
   * 
   * @param {Object} queueItem - キューアイテム
   * @private
   */
  async _startTest(queueItem) {
    const { id, definition, options } = queueItem;
    
    try {
      this.logger.info(`テスト開始: ${id}`, { name: definition.name });
      
      const runningTest = {
        id,
        definition,
        options,
        startTime: Date.now(),
        testInstance: null,
        promise: null
      };

      // テストインスタンスを作成
      if (typeof definition.test === 'function') {
        runningTest.testInstance = definition.test;
      } else if (definition.test && typeof definition.test.run === 'function') {
        runningTest.testInstance = definition.test;
      } else {
        throw new Error(`Invalid test definition: ${id}`);
      }

      // セットアップ実行
      if (definition.setup) {
        await definition.setup(options);
      }

      // テスト実行Promise
      runningTest.promise = this._executeTest(runningTest);

      this.running.set(id, runningTest);
      this._emit('testStarted', { id, name: definition.name });

    } catch (error) {
      this.logger.error(`テスト開始エラー: ${id}`, error);
      this._handleTestFailure(queueItem, error);
    }
  }

  /**
   * テストを実行
   * 
   * @param {Object} runningTest - 実行中テスト
   * @returns {Promise<Object>} 実行結果
   * @private
   */
  async _executeTest(runningTest) {
    const { id, definition, options } = runningTest;
    
    try {
      let result;
      
      // タイムアウト付きで実行
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Test timeout')), definition.timeout);
      });

      if (typeof runningTest.testInstance === 'function') {
        // 関数型テスト
        const testPromise = runningTest.testInstance(options);
        result = await Promise.race([testPromise, timeoutPromise]);
      } else {
        // オブジェクト型テスト
        const testPromise = runningTest.testInstance.run(options);
        result = await Promise.race([testPromise, timeoutPromise]);
      }

      // バリデーション実行
      if (definition.validate) {
        const validation = await definition.validate(result, options);
        if (!validation.valid) {
          throw new Error(`Validation failed: ${validation.error}`);
        }
      }

      const duration = Date.now() - runningTest.startTime;
      const testResult = {
        id,
        name: definition.name,
        success: true,
        result,
        duration,
        completedAt: Date.now()
      };

      this.completed.set(id, testResult);
      this.stats.completedTests++;
      this.stats.totalDuration += duration;
      this._updateAverages();

      this.logger.info(`テスト完了: ${id}`, { duration });
      this._emit('testCompleted', testResult);

      return testResult;

    } catch (error) {
      const duration = Date.now() - runningTest.startTime;
      const testResult = {
        id,
        name: definition.name,
        success: false,
        error: error.message,
        duration,
        completedAt: Date.now()
      };

      this.failed.set(id, testResult);
      this.stats.failedTests++;

      this.logger.error(`テスト失敗: ${id}`, error);
      this._emit('testFailed', testResult);

      // リトライ処理
      if (this.config.retryFailedTests && definition.retryable) {
        const queueItem = { 
          id, 
          definition, 
          options, 
          retryCount: (runningTest.retryCount || 0) + 1 
        };
        
        if (queueItem.retryCount <= this.config.maxRetries) {
          this.logger.info(`テストをリトライします: ${id} (${queueItem.retryCount}/${this.config.maxRetries})`);
          
          setTimeout(() => {
            this.queue.unshift(queueItem);
          }, this.config.retryDelay);
        }
      }

      return testResult;

    } finally {
      // ティアダウン実行
      if (definition.teardown) {
        try {
          await definition.teardown(options);
        } catch (error) {
          this.logger.error(`ティアダウンエラー: ${id}`, error);
        }
      }
    }
  }

  /**
   * 完了したテストをチェック
   * 
   * @returns {Promise} チェック処理
   * @private
   */
  async _checkCompletedTests() {
    const promises = Array.from(this.running.values()).map(async (runningTest) => {
      try {
        await runningTest.promise;
      } catch (error) {
        // エラーは_executeTestで処理済み
      } finally {
        this.running.delete(runningTest.id);
      }
    });

    await Promise.all(promises);
  }

  /**
   * 依存関係をチェック
   * 
   * @param {Object} testDef - テスト定義
   * @returns {boolean} 依存関係が満たされているか
   * @private
   */
  _checkDependencies(testDef) {
    return testDef.dependencies.every(depId => 
      this.completed.has(depId) && this.completed.get(depId).success
    );
  }

  /**
   * レポート開始
   * 
   * @private
   */
  _startReporting() {
    if (this.reportTimer) {
      clearInterval(this.reportTimer);
    }

    this.reportTimer = setInterval(() => {
      const status = this.getStatus();
      this._emit('progressReport', status);
      this.logger.debug('進捗レポート', status);
    }, this.config.reportInterval);
  }

  /**
   * サマリーレポート生成
   * 
   * @returns {Object} サマリーレポート
   * @private
   */
  _generateSummaryReport() {
    const total = this.stats.completedTests + this.stats.failedTests;
    const successRate = total > 0 ? (this.stats.completedTests / total * 100) : 0;

    return {
      summary: {
        total,
        completed: this.stats.completedTests,
        failed: this.stats.failedTests,
        successRate: Math.round(successRate * 100) / 100,
        totalDuration: this.stats.totalDuration,
        averageDuration: this.stats.averageDuration
      },
      timing: {
        startTime: this.stats.startTime,
        endTime: this.stats.endTime,
        duration: this.stats.totalDuration
      }
    };
  }

  /**
   * 平均値を更新
   * 
   * @private
   */
  _updateAverages() {
    if (this.stats.completedTests > 0) {
      this.stats.averageDuration = this.stats.totalDuration / this.stats.completedTests;
    }
  }

  /**
   * スケジューラータイマーを更新
   * 
   * @private
   */
  _updateSchedulerTimer() {
    if (this.schedulerTimer) {
      clearInterval(this.schedulerTimer);
      this.schedulerTimer = null;
    }

    if (this.config.enableScheduling && this.schedules.size > 0) {
      this.schedulerTimer = setInterval(() => {
        this._checkSchedules();
      }, 60000); // 1分ごとにチェック
    }
  }

  /**
   * スケジュールをチェック
   * 
   * @private
   */
  _checkSchedules() {
    const now = Date.now();
    
    this.schedules.forEach(schedule => {
      if (!schedule.enabled || this.state === RUNNER_STATES.RUNNING) {
        return;
      }

      let shouldRun = false;

      if (schedule.interval) {
        // インターバル実行
        if (!schedule.lastRun || now - schedule.lastRun >= schedule.interval) {
          shouldRun = true;
        }
      }

      // TODO: cron式の実装

      if (shouldRun) {
        this.logger.info(`スケジュール実行: ${schedule.id}`);
        
        schedule.lastRun = now;
        schedule.runCount++;
        
        this.run(schedule.testIds, schedule.options).catch(error => {
          this.logger.error(`スケジュール実行エラー: ${schedule.id}`, error);
        });
      }
    });
  }

  /**
   * イベントを発火
   * 
   * @param {string} event - イベント名
   * @param {*} data - イベントデータ
   * @private
   */
  _emit(event, data = null) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach(listener => {
        try {
          listener(data);
        } catch (error) {
          this.logger.error(`イベントリスナーエラー: ${event}`, error);
        }
      });
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

/**
 * グローバルテストランナーインスタンス
 */
export const globalTestRunner = new TestRunner();