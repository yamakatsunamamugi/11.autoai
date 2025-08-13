/**
 * @fileoverview リファクタリング済みウィンドウテスト
 * 
 * 新しい共通ライブラリを使用してリファクタリングされた
 * ウィンドウ作成テストツール。
 */

import { BaseTest, TEST_STATES } from '../src/testing/base-test.js';
import { TestConfigManager, createTestConfig } from '../src/config/test-config.js';
import { getSelectedAIs } from '../src/utils/test-utils.js';
import { getLogger, setupDOMLogging } from '../src/core/logging-system.js';
import { EnhancedStreamProcessor } from '../src/features/task/enhanced-stream-processor.js';

/**
 * ウィンドウテストクラス
 */
class WindowTest extends BaseTest {
  constructor() {
    const config = createTestConfig('testing', {
      execution: {
        tasksPerWindow: 3,
        waitTime: { min: 2, max: 5 }
      }
    });
    
    super('WindowCreationTest', { configManager: config });
    
    // テスト固有の設定
    this.testConfig = {
      selectedAIs: ['chatgpt', 'claude', 'gemini'],
      windowCount: 4,
      repeatCount: 3,
      autoTestEnabled: false
    };
  }

  /**
   * テスト固有の初期化
   * 
   * @param {Object} elements - DOM要素
   * @param {Object} options - オプション
   */
  async initialize(elements, options = {}) {
    await super.initialize(elements, options);
    
    // DOM専用ログを設定
    if (elements.logContainer) {
      setupDOMLogging('WindowTest', elements.logContainer, {
        maxEntries: 500,
        colorize: true,
        autoScroll: true
      });
    }
    
    // UI イベントリスナーを設定
    this._setupUIEventListeners();
    
    // デフォルト設定をUIに反映
    this._loadUISettings();
    
    this.logger.info('ウィンドウテストが初期化されました');
  }

  /**
   * メインテスト実行
   * 
   * @param {Object} params - 実行パラメータ
   * @returns {Promise<Object>} 実行結果
   */
  async _executeTest(params = {}) {
    const { testType = 'single', ...options } = params;
    
    switch (testType) {
      case 'single':
        return this._executeSingleTest(options);
      case 'auto':
        return this._executeAutoTest(options);
      default:
        throw new Error(`Unknown test type: ${testType}`);
    }
  }

  /**
   * 単発テスト実行
   * 
   * @param {Object} options - オプション
   * @returns {Promise<Object>} 実行結果
   */
  async _executeSingleTest(options = {}) {
    this.logger.info('単発ウィンドウテストを開始します');
    
    // UI設定を取得
    const selectedAIs = this._getSelectedAIs();
    const windowCount = this._getWindowCount();
    
    if (selectedAIs.length === 0) {
      throw new Error('少なくとも1つのAIを選択してください');
    }

    // タスクを生成
    const tasks = this.taskBuilder.createWindowTestTasks({
      aiTypes: selectedAIs,
      windowCount,
      tasksPerWindow: this.config.get('execution.tasksPerWindow')
    });

    this.logger.info(`タスク生成完了: ${tasks.length}個`, { selectedAIs, windowCount });

    // TaskListを作成
    const taskList = this._createTaskList(tasks);
    
    // 拡張StreamProcessorを作成
    const processor = this._createEnhancedStreamProcessor();
    
    // スプレッドシートデータを生成
    const spreadsheetData = this.taskBuilder.createMinimalSpreadsheetData();
    
    // 実行オプションを作成
    const executionOptions = this.config.createExecutionOptions({
      testMode: true,
      consecutiveTest: false
    });

    // ウィンドウ作成処理を実行
    const result = await this._withPerformanceTracking(async () => {
      return processor.processTaskStream(taskList, spreadsheetData, executionOptions);
    }, 'WindowCreation');

    // ウィンドウ情報をUIに反映
    this._updateWindowDisplay(processor);

    this.logger.success(`ウィンドウ作成完了: ${result.totalWindows}個`);

    return {
      testType: 'single',
      totalWindows: result.totalWindows,
      processedColumns: result.processedColumns,
      selectedAIs,
      windowCount,
      taskCount: tasks.length
    };
  }

  /**
   * 自動テスト実行
   * 
   * @param {Object} options - オプション
   * @returns {Promise<Object>} 実行結果
   */
  async _executeAutoTest(options = {}) {
    this.logger.info('自動ウィンドウテストを開始します');
    
    const selectedAIs = this._getSelectedAIs();
    const windowCount = this._getWindowCount();
    const repeatCount = this._getRepeatCount();

    if (selectedAIs.length === 0) {
      throw new Error('少なくとも1つのAIを選択してください');
    }

    const results = [];
    
    // UI状態を更新
    this._setAutoTestUI(true);

    try {
      for (let i = 1; i <= repeatCount; i++) {
        // 停止チェック
        if (this.state === TEST_STATES.CANCELLED) {
          break;
        }

        this.logger.info(`自動テスト ${i}/${repeatCount} 回目を実行中`);
        this.uiUpdater.updateStatus(`自動テスト ${i}/${repeatCount}`, 'active', this.startTime);

        // 単発テストを実行
        const result = await this._executeSingleTest({
          round: i,
          totalRounds: repeatCount
        });

        results.push(result);

        // ウィンドウを閉じる
        if (this.streamProcessor) {
          await this.streamProcessor.closeAllWindows();
        }

        // 次の実行まで待機
        if (i < repeatCount) {
          const waitTime = this.config.get('execution.pauseBetweenTasks');
          this.logger.info(`次のテストまで ${waitTime}ms 待機`);
          await this._sleep(waitTime);
        }
      }

      this.logger.success(`自動テスト完了: ${results.length}回実行`);

      return {
        testType: 'auto',
        rounds: results.length,
        results,
        totalWindowsCreated: results.reduce((sum, r) => sum + r.totalWindows, 0)
      };

    } finally {
      this._setAutoTestUI(false);
    }
  }

  /**
   * テスト停止時の処理
   */
  async stop() {
    await super.stop();
    this._setAutoTestUI(false);
  }

  /**
   * 拡張StreamProcessorを作成
   * 
   * @returns {EnhancedStreamProcessor} プロセッサインスタンス
   * @private
   */
  _createEnhancedStreamProcessor() {
    const processor = new EnhancedStreamProcessor(
      this.config.export(),
      { logger: getLogger('WindowTest.StreamProcessor') }
    );

    // フック関数を設定
    processor.setHook('beforeWindowCreation', async (column, aiType, position) => {
      this.logger.debug(`ウィンドウ作成開始: ${column}列 (${aiType})`);
    });

    processor.setHook('afterWindowCreation', async (windowInfo) => {
      this.logger.info(`ウィンドウ作成完了: ${windowInfo.windowId}`, {
        column: windowInfo.column,
        aiType: windowInfo.aiType,
        position: this.windowManager.getPositionName(windowInfo.position)
      });
      
      // UIを更新
      this._updateWindowDisplay(processor);
    });

    this.streamProcessor = processor;
    return processor;
  }

  /**
   * UIイベントリスナーを設定
   * 
   * @private
   */
  _setupUIEventListeners() {
    // ウィンドウ作成ボタン
    if (this.elements.openTestWindowsBtn) {
      this.elements.openTestWindowsBtn.addEventListener('click', () => {
        this.run({ testType: 'single' }).catch(error => {
          this.logger.error('単発テストエラー', error);
        });
      });
    }

    // 自動テスト開始ボタン
    if (this.elements.startAutoTestBtn) {
      this.elements.startAutoTestBtn.addEventListener('click', () => {
        this.run({ testType: 'auto' }).catch(error => {
          this.logger.error('自動テストエラー', error);
        });
      });
    }

    // 停止ボタン
    if (this.elements.stopAutoTestBtn) {
      this.elements.stopAutoTestBtn.addEventListener('click', () => {
        this.stop().catch(error => {
          this.logger.error('停止エラー', error);
        });
      });
    }

    // 全閉じるボタン
    if (this.elements.closeAllWindowsBtn) {
      this.elements.closeAllWindowsBtn.addEventListener('click', () => {
        this._cleanup().catch(error => {
          this.logger.error('クリーンアップエラー', error);
        });
      });
    }

    // ログクリアボタン
    if (this.elements.clearLogBtn) {
      this.elements.clearLogBtn.addEventListener('click', () => {
        const domAppender = this.logger.appenders.get('DOM');
        if (domAppender) {
          domAppender.clear();
        }
      });
    }

    // スライダーのリアルタイム更新
    if (this.elements.windowCountSlider && this.elements.windowCountDisplay) {
      this.elements.windowCountSlider.addEventListener('input', (e) => {
        this.elements.windowCountDisplay.textContent = e.target.value;
      });
    }

    // クイック設定ボタン
    document.querySelectorAll('.quick-set-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const count = e.target.dataset.count;
        if (this.elements.windowCountSlider && this.elements.windowCountDisplay) {
          this.elements.windowCountSlider.value = count;
          this.elements.windowCountDisplay.textContent = count;
        }
      });
    });
  }

  /**
   * UI設定を読み込み
   * 
   * @private
   */
  _loadUISettings() {
    // AI選択状態を設定
    const defaultSelections = this.config.get('ai.defaultSelections');
    ['chatgpt', 'claude', 'gemini'].forEach(aiType => {
      const element = this.elements[`use${aiType.charAt(0).toUpperCase() + aiType.slice(1)}`];
      if (element) {
        element.checked = defaultSelections.includes(aiType);
      }
    });

    // ウィンドウ数を設定
    if (this.elements.windowCountSlider) {
      this.elements.windowCountSlider.value = this.config.get('window.maxCount');
      if (this.elements.windowCountDisplay) {
        this.elements.windowCountDisplay.textContent = this.config.get('window.maxCount');
      }
    }

    // 待機時間を設定
    const waitTime = this.config.get('execution.waitTime');
    if (this.elements.waitTimeMin) {
      this.elements.waitTimeMin.value = waitTime.min;
    }
    if (this.elements.waitTimeMax) {
      this.elements.waitTimeMax.value = waitTime.max;
    }

    // 繰り返し回数を設定
    if (this.elements.repeatCount) {
      this.elements.repeatCount.value = this.config.get('execution.defaultRepeatCount');
    }
  }

  /**
   * 選択されたAIを取得
   * 
   * @returns {Array<string>} 選択されたAI配列
   * @private
   */
  _getSelectedAIs() {
    return getSelectedAIs(this.elements);
  }

  /**
   * ウィンドウ数を取得
   * 
   * @returns {number} ウィンドウ数
   * @private
   */
  _getWindowCount() {
    return this.elements.windowCountSlider ? 
      parseInt(this.elements.windowCountSlider.value) : 
      this.config.get('window.maxCount');
  }

  /**
   * 繰り返し回数を取得
   * 
   * @returns {number} 繰り返し回数
   * @private
   */
  _getRepeatCount() {
    return this.elements.repeatCount ? 
      parseInt(this.elements.repeatCount.value) : 
      this.config.get('execution.defaultRepeatCount');
  }

  /**
   * ウィンドウ表示を更新
   * 
   * @param {EnhancedStreamProcessor} processor - プロセッサ
   * @private
   */
  _updateWindowDisplay(processor) {
    // ウィンドウマネージャーを更新
    this.windowManager.updateFromStreamProcessor(processor.activeWindows);
    
    // UI要素を更新
    this.uiUpdater.updateWindowCount(this.windowManager.getActiveWindowCount());
    
    // ウィンドウグリッドを更新
    if (this.elements.windowGrid) {
      this.elements.windowGrid.innerHTML = this.windowManager.generateWindowGridHTML();
    }
  }

  /**
   * 自動テストUI状態を設定
   * 
   * @param {boolean} running - 実行中かどうか
   * @private
   */
  _setAutoTestUI(running) {
    if (this.elements.startAutoTestBtn) {
      this.elements.startAutoTestBtn.disabled = running;
    }
    if (this.elements.stopAutoTestBtn) {
      this.elements.stopAutoTestBtn.disabled = !running;
    }
    if (this.elements.openTestWindowsBtn) {
      this.elements.openTestWindowsBtn.disabled = running;
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

// グローバルインスタンス
let windowTestInstance = null;

/**
 * DOM読み込み完了時の初期化
 */
document.addEventListener('DOMContentLoaded', async () => {
  try {
    // DOM要素を取得
    const elements = {
      totalTasks: document.getElementById('totalTasks'),
      processedTasks: document.getElementById('processedTasks'),
      activeWindows: document.getElementById('activeWindows'),
      maxWindows: document.getElementById('maxWindows'),
      openTestWindowsBtn: document.getElementById('openTestWindowsBtn'),
      startAutoTestBtn: document.getElementById('startAutoTestBtn'),
      closeAllWindowsBtn: document.getElementById('closeAllWindowsBtn'),
      stopAutoTestBtn: document.getElementById('stopAutoTestBtn'),
      clearLogBtn: document.getElementById('clearLogBtn'),
      windowGrid: document.getElementById('windowGrid'),
      logContainer: document.getElementById('logContainer'),
      statusIndicator: document.getElementById('statusIndicator'),
      statusText: document.getElementById('statusText'),
      statusTime: document.getElementById('statusTime'),
      useChatGPT: document.getElementById('useChatGPT'),
      useClaude: document.getElementById('useClaude'),
      useGemini: document.getElementById('useGemini'),
      windowCountSlider: document.getElementById('windowCountSlider'),
      windowCountDisplay: document.getElementById('windowCountDisplay'),
      waitTimeMin: document.getElementById('waitTimeMin'),
      waitTimeMax: document.getElementById('waitTimeMax'),
      repeatCount: document.getElementById('repeatCount')
    };

    // テストインスタンスを作成・初期化
    windowTestInstance = new WindowTest();
    await windowTestInstance.initialize(elements);

    // グローバルに公開（デバッグ用）
    window.windowTest = windowTestInstance;

    console.log('リファクタリング済みウィンドウテストが初期化されました');

  } catch (error) {
    console.error('ウィンドウテスト初期化エラー:', error);
    
    // エラーメッセージをUIに表示
    const statusText = document.getElementById('statusText');
    if (statusText) {
      statusText.textContent = 'テスト初期化エラー';
    }
  }
});

// ページ離脱時のクリーンアップ
window.addEventListener('beforeunload', () => {
  if (windowTestInstance) {
    windowTestInstance.destroy();
  }
});

// 親ウィンドウからのメッセージ処理（互換性のため残す）
window.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'INIT_TEST' && windowTestInstance) {
    const { spreadsheetData, taskCount = 0 } = event.data;
    
    windowTestInstance.uiUpdater.updateTaskCount(taskCount);
    windowTestInstance.logger.success(`スプレッドシートデータを受信: ${taskCount}個のタスク`);
  }
});