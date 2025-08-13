/**
 * @fileoverview ベーステストクラス
 * 
 * 全テストクラスの基底クラス。
 * 共通の初期化、実行、クリーンアップ処理を提供。
 */

import { TestLogger, TestTaskBuilder, WindowManager, ModuleLoader, UIUpdater, withErrorHandling } from '../utils/test-utils.js';
import { TestConfigManager, defaultTestConfig } from '../config/test-config.js';

/**
 * テスト実行状態の定義
 */
export const TEST_STATES = {
  IDLE: 'idle',
  INITIALIZING: 'initializing',
  RUNNING: 'running',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  ERROR: 'error',
  CANCELLED: 'cancelled'
};

/**
 * ベーステストクラス
 */
export class BaseTest {
  constructor(name, config = {}) {
    this.name = name;
    this.config = config.configManager || defaultTestConfig;
    this.logger = null;
    this.taskBuilder = null;
    this.windowManager = null;
    this.moduleLoader = null;
    this.uiUpdater = null;
    
    // 実行状態
    this.state = TEST_STATES.IDLE;
    this.startTime = null;
    this.endTime = null;
    this.results = {};
    this.errors = [];
    
    // StreamProcessor関連
    this.streamProcessor = null;
    this.activeTaskList = null;
    
    // UI要素（サブクラスで設定）
    this.elements = {};
    
    // イベントリスナー
    this.eventListeners = new Map();
    
    // 設定
    this.options = {
      autoCleanup: true,
      logToConsole: true,
      trackPerformance: true,
      ...config.options
    };
  }

  /**
   * テストを初期化
   * 
   * @param {Object} elements - DOM要素マッピング
   * @param {Object} options - 初期化オプション
   */
  async initialize(elements = {}, options = {}) {
    try {
      this.state = TEST_STATES.INITIALIZING;
      this.elements = { ...this.elements, ...elements };
      
      // コンポーネントを初期化
      await this._initializeComponents();
      
      // イベントリスナーを設定
      this._setupEventListeners();
      
      // 設定を検証
      this._validateConfiguration();
      
      this.logger.success(`テスト "${this.name}" の初期化が完了しました`);
      this.state = TEST_STATES.IDLE;
      
    } catch (error) {
      this.state = TEST_STATES.ERROR;
      this.errors.push(error);
      this.logger.error(`初期化エラー: ${error.message}`);
      throw error;
    }
  }

  /**
   * テストを実行
   * 
   * @param {Object} params - 実行パラメータ
   * @returns {Promise<Object>} 実行結果
   */
  async run(params = {}) {
    if (this.state === TEST_STATES.RUNNING) {
      throw new Error('テストは既に実行中です');
    }

    try {
      this.state = TEST_STATES.RUNNING;
      this.startTime = Date.now();
      this.results = {};
      this.errors = [];
      
      this.logger.info(`テスト "${this.name}" を開始します`);
      this.uiUpdater.updateStatus('実行中', 'active', this.startTime);
      
      // 前処理
      await this._beforeRun(params);
      
      // メイン処理（サブクラスで実装）
      const results = await this._executeTest(params);
      
      // 後処理
      await this._afterRun(results);
      
      this.endTime = Date.now();
      this.results = {
        ...results,
        duration: this.endTime - this.startTime,
        success: true
      };
      
      this.state = TEST_STATES.COMPLETED;
      this.logger.success(`テスト完了: ${this.results.duration}ms`);
      this.uiUpdater.updateStatus('完了', 'idle');
      
      return this.results;
      
    } catch (error) {
      this.state = TEST_STATES.ERROR;
      this.errors.push(error);
      this.endTime = Date.now();
      
      this.logger.error(`テスト実行エラー: ${error.message}`);
      this.uiUpdater.updateStatus('エラー', 'error');
      
      // エラー時でもクリーンアップを試行
      try {
        await this._cleanup();
      } catch (cleanupError) {
        this.logger.warning(`クリーンアップエラー: ${cleanupError.message}`);
      }
      
      throw error;
    }
  }

  /**
   * テストを停止
   */
  async stop() {
    if (this.state !== TEST_STATES.RUNNING) {
      return;
    }

    try {
      this.state = TEST_STATES.CANCELLED;
      this.logger.warning('テストを停止中...');
      
      await this._cleanup();
      
      this.endTime = Date.now();
      this.logger.warning('テストが停止されました');
      this.uiUpdater.updateStatus('停止', 'idle');
      
    } catch (error) {
      this.logger.error(`停止エラー: ${error.message}`);
      throw error;
    }
  }

  /**
   * テストをリセット
   */
  async reset() {
    await this.stop();
    
    this.state = TEST_STATES.IDLE;
    this.startTime = null;
    this.endTime = null;
    this.results = {};
    this.errors = [];
    
    if (this.logger) {
      this.logger.clear();
    }
    
    this.logger.info('テストがリセットされました');
  }

  /**
   * 現在の状態を取得
   * 
   * @returns {Object} 状態情報
   */
  getStatus() {
    return {
      name: this.name,
      state: this.state,
      startTime: this.startTime,
      endTime: this.endTime,
      duration: this.endTime && this.startTime ? this.endTime - this.startTime : null,
      results: this.results,
      errors: this.errors,
      hasActiveWindows: this.streamProcessor ? this.streamProcessor.activeWindows.size > 0 : false
    };
  }

  /**
   * 設定を更新
   * 
   * @param {string} path - 設定パス
   * @param {*} value - 新しい値
   */
  updateConfig(path, value) {
    this.config.set(path, value);
    this.logger.info(`設定を更新: ${path} = ${JSON.stringify(value)}`);
  }

  /**
   * コンポーネントを初期化（プライベート）
   * 
   * @private
   */
  async _initializeComponents() {
    // ログシステム
    this.logger = new TestLogger(this.elements.logContainer);
    
    // タスクビルダー
    this.taskBuilder = new TestTaskBuilder(this.config.export());
    
    // ウィンドウ管理
    this.windowManager = new WindowManager();
    
    // モジュールローダー
    this.moduleLoader = new ModuleLoader();
    
    // UI更新
    this.uiUpdater = new UIUpdater(this.elements);
    
    // 必要なモジュールを事前ロード
    const modules = await this.moduleLoader.loadTestModules();
    this.modules = modules;
    
    this.logger.info('コンポーネントの初期化が完了しました');
  }

  /**
   * イベントリスナーを設定（プライベート）
   * 
   * @private
   */
  _setupEventListeners() {
    // ページ離脱時のクリーンアップ
    const beforeUnloadHandler = () => {
      if (this.options.autoCleanup) {
        this._cleanup().catch(console.error);
      }
    };
    
    window.addEventListener('beforeunload', beforeUnloadHandler);
    this.eventListeners.set('beforeunload', beforeUnloadHandler);
    
    // 設定変更の監視
    this.config.watch('*', (newValue, oldValue, path) => {
      this.logger.info(`設定が変更されました: ${path}`);
      this._onConfigChange(path, newValue, oldValue);
    });
  }

  /**
   * 設定を検証（プライベート）
   * 
   * @private
   */
  _validateConfiguration() {
    const validation = this.config.validate();
    if (!validation.valid) {
      throw new Error(`設定エラー: ${validation.errors.join(', ')}`);
    }
  }

  /**
   * 実行前処理（オーバーライド可能）
   * 
   * @param {Object} params - 実行パラメータ
   * @protected
   */
  async _beforeRun(params) {
    // サブクラスでオーバーライド
  }

  /**
   * メインテスト実行（サブクラスで実装必須）
   * 
   * @param {Object} params - 実行パラメータ
   * @returns {Promise<Object>} 実行結果
   * @protected
   */
  async _executeTest(params) {
    throw new Error('_executeTest must be implemented by subclass');
  }

  /**
   * 実行後処理（オーバーライド可能）
   * 
   * @param {Object} results - 実行結果
   * @protected
   */
  async _afterRun(results) {
    if (this.options.autoCleanup) {
      await this._cleanup();
    }
  }

  /**
   * クリーンアップ処理（オーバーライド可能）
   * 
   * @protected
   */
  async _cleanup() {
    // StreamProcessorのクリーンアップ
    if (this.streamProcessor) {
      try {
        await this.streamProcessor.closeAllWindows();
        this.logger.info('ウィンドウを全て閉じました');
      } catch (error) {
        this.logger.warning(`ウィンドウクローズエラー: ${error.message}`);
      }
    }
    
    // ウィンドウ管理のクリーンアップ
    if (this.windowManager) {
      this.windowManager.clear();
      this.uiUpdater.updateWindowCount(0);
    }
  }

  /**
   * 設定変更時の処理（オーバーライド可能）
   * 
   * @param {string} path - 変更されたパス
   * @param {*} newValue - 新しい値
   * @param {*} oldValue - 古い値
   * @protected
   */
  _onConfigChange(path, newValue, oldValue) {
    // サブクラスでオーバーライド
  }

  /**
   * StreamProcessorを作成
   * 
   * @returns {Object} StreamProcessorインスタンス
   * @protected
   */
  _createStreamProcessor() {
    this.streamProcessor = new this.modules.StreamProcessor();
    return this.streamProcessor;
  }

  /**
   * TaskListを作成
   * 
   * @param {Array} tasks - タスク配列
   * @returns {Object} TaskListインスタンス
   * @protected
   */
  _createTaskList(tasks = []) {
    const taskList = new this.modules.TaskList();
    
    tasks.forEach(taskData => {
      const task = new this.modules.Task(
        this.modules.TaskFactory.createTask(taskData)
      );
      taskList.add(task);
    });
    
    this.activeTaskList = taskList;
    return taskList;
  }

  /**
   * エラーハンドリング付きで関数を実行
   * 
   * @param {Function} fn - 実行する関数
   * @param {string} context - エラーコンテキスト
   * @returns {Promise} 実行結果
   * @protected
   */
  async _withErrorHandling(fn, context = '処理') {
    return withErrorHandling(fn, this.logger, context);
  }

  /**
   * パフォーマンス測定付きで関数を実行
   * 
   * @param {Function} fn - 実行する関数
   * @param {string} name - 測定名
   * @returns {Promise} 実行結果
   * @protected
   */
  async _withPerformanceTracking(fn, name) {
    if (!this.options.trackPerformance) {
      return fn();
    }
    
    const startTime = performance.now();
    const result = await fn();
    const endTime = performance.now();
    const duration = endTime - startTime;
    
    this.logger.info(`${name}: ${duration.toFixed(2)}ms`);
    
    if (!this.results.performance) {
      this.results.performance = {};
    }
    this.results.performance[name] = duration;
    
    return result;
  }

  /**
   * リソースの破棄
   */
  destroy() {
    // イベントリスナーの削除
    this.eventListeners.forEach((handler, event) => {
      window.removeEventListener(event, handler);
    });
    this.eventListeners.clear();
    
    // 設定監視の解除
    this.config.unwatch('*');
    
    this.logger.info('テストインスタンスが破棄されました');
  }
}