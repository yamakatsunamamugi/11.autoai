/**
 * @fileoverview リファクタリング済み統合テスト
 * 
 * 新しい共通ライブラリを使用してリファクタリングされた
 * AI自動操作統合テスト。
 */

import { BaseTest } from '../src/testing/base-test.js';
import { createTestConfig } from '../src/config/test-config.js';
import { getLogger, setupDOMLogging } from '../src/core/logging-system.js';
import { EnhancedStreamProcessor } from '../src/features/task/enhanced-stream-processor.js';

/**
 * 統合テストクラス
 */
class IntegrationTest extends BaseTest {
  constructor() {
    const config = createTestConfig('testing', {
      prompts: {
        consecutive: [
          '今日は何日ですか？',
          '1+1は何ですか？',
          'こんにちは、調子はどうですか？'
        ]
      }
    });
    
    super('AI Integration Test', { configManager: config });
    
    // 3連続テストの状態管理
    this.consecutiveTestStates = {
      'chatgpt-prompt': { enabled: false, targetId: 'chatgpt-prompt', testData: null },
      'claude-prompt': { enabled: false, targetId: 'claude-prompt', testData: null },
      'gemini-prompt': { enabled: false, targetId: 'gemini-prompt', testData: null }
    };
  }

  /**
   * 統合テスト固有の初期化
   */
  async initialize(elements, options = {}) {
    await super.initialize(elements, options);
    
    // カスタムドロップダウンを設定
    this._setupCustomDropdowns();
    
    // デフォルトプロンプトを設定
    this._setupDefaultPrompts();
    
    // グローバルに公開（互換性のため）
    window.consecutiveTestStates = this.consecutiveTestStates;
    window.executeConsecutiveTest = this.executeConsecutiveTest.bind(this);
    
    this.logger.info('統合テストが初期化されました');
  }

  /**
   * 3連続テストの準備
   * 
   * @param {string} targetId - 対象要素ID
   */
  handleConsecutiveTest(targetId) {
    this.logger.info(`3連続テスト準備: ${targetId}`);
    
    const aiType = targetId.replace('-prompt', '');
    const normalizedAiType = aiType.toLowerCase();
    
    // テスト用タスクリストを作成
    const tasks = this.taskBuilder.createConsecutiveTestTasks(
      normalizedAiType,
      this.config.get('prompts.consecutive')
    );
    
    // TaskListオブジェクトを作成
    const testTaskList = {
      tasks,
      getStatistics: () => ({
        total: tasks.length,
        byAI: { [normalizedAiType]: tasks.length }
      })
    };
    
    this.logger.info(`作成した3連続テストタスク: ${tasks.length}個`, { aiType: normalizedAiType });
    
    // テストデータを保存
    if (this.consecutiveTestStates[targetId]) {
      this.consecutiveTestStates[targetId].enabled = true;
      this.consecutiveTestStates[targetId].testData = testTaskList;
    }
    
    // プロンプト欄を更新
    const inputElement = document.getElementById(targetId);
    if (inputElement) {
      inputElement.value = '🔄 3連続テスト準備完了（「テスト実行」ボタンを押してください）';
      inputElement.style.backgroundColor = '#fff3cd';
    }
    
    // ステータス更新
    this.uiUpdater.updateStatus('3連続テスト準備完了 - 「テスト実行」ボタンを押してください', 'idle');
    
    this.logger.success('3連続テスト準備完了');
  }

  /**
   * 3連続テストを実行
   * 
   * @param {string} targetAiType - 対象AIタイプ
   * @returns {Promise<Object>} 実行結果
   */
  async executeConsecutiveTest(targetAiType = null) {
    this.logger.info('3連続テスト実行開始', { targetAiType });
    
    // 実行するAIを特定
    let targetId = targetAiType ? `${targetAiType}-prompt` : null;
    let testState = null;
    
    if (targetId && this.consecutiveTestStates[targetId]) {
      testState = this.consecutiveTestStates[targetId];
    } else {
      // 有効な状態を持つAIを探す
      for (const [id, state] of Object.entries(this.consecutiveTestStates)) {
        if (state.enabled && state.testData) {
          targetId = id;
          testState = state;
          break;
        }
      }
    }
    
    if (!testState || !testState.enabled || !testState.testData) {
      throw new Error('3連続テストが準備されていません');
    }
    
    const aiType = targetId.replace('-prompt', '');
    
    try {
      // 拡張StreamProcessorを作成
      const processor = this._createEnhancedStreamProcessor();
      
      // 実行オプション
      const executionOptions = this.config.createExecutionOptions({
        testMode: true,
        consecutiveTest: true
      });
      
      // スプレッドシートデータ
      const spreadsheetData = this.taskBuilder.createMinimalSpreadsheetData();
      
      this.logger.info('StreamProcessorでタスクを実行中', {
        taskCount: testState.testData.tasks.length,
        aiType
      });
      
      // タスクリストを直接実行
      const result = await processor.processTaskStream(
        testState.testData,
        spreadsheetData,
        executionOptions
      );
      
      this.logger.success(`3連続テスト完了: ${aiType}`, result);
      
      // 結果をユーザーに通知
      const message = result.success ? 
        `✅ ${aiType}の3連続テスト成功！\n処理したタスク数: ${result.totalTasks || testState.testData.tasks.length}` :
        `❌ ${aiType}の3連続テストでエラーが発生しました`;
      
      alert(message);
      
      // 状態をリセット
      this._resetConsecutiveTestState(targetId);
      
      return result;
      
    } catch (error) {
      this.logger.error(`3連続テストエラー: ${aiType}`, error);
      
      // 状態をリセット
      this._resetConsecutiveTestState(targetId);
      
      alert(`エラーが発生しました: ${error.message}`);
      throw error;
    }
  }

  /**
   * カスタムドロップダウンを設定
   * 
   * @private
   */
  _setupCustomDropdowns() {
    // プルダウンボタンのクリックイベント
    document.addEventListener('click', (e) => {
      if (e.target.classList.contains('dropdown-btn')) {
        e.preventDefault();
        e.stopPropagation();
        
        const targetId = e.target.dataset.target;
        const menu = document.querySelector(`.dropdown-menu[data-for="${targetId}"]`);
        
        if (menu) {
          // 他のメニューを閉じる
          document.querySelectorAll('.dropdown-menu').forEach(m => {
            if (m !== menu) m.style.display = 'none';
          });
          
          // 現在のメニューを開閉
          menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
        }
      }
      
      // ドロップダウン項目のクリック
      if (e.target.classList.contains('dropdown-item')) {
        e.preventDefault();
        e.stopPropagation();
        
        const value = e.target.dataset.value;
        const action = e.target.dataset.action;
        const menu = e.target.closest('.dropdown-menu');
        const targetId = menu.dataset.for;
        const input = document.getElementById(targetId);
        
        // 特殊アクション（3連続テスト）の処理
        if (action === 'consecutive-test') {
          menu.style.display = 'none';
          this.handleConsecutiveTest(targetId);
          return;
        }
        
        // 通常のプロンプト選択
        if (input && value) {
          input.value = value;
          menu.style.display = 'none';
          
          // 入力イベントを発火
          const event = new Event('input', { bubbles: true });
          input.dispatchEvent(event);
          
          this.logger.info(`プロンプト選択: ${targetId} = ${value}`);
        }
      }
      
      // 他の場所をクリックしたらメニューを閉じる
      if (!e.target.closest('.custom-dropdown')) {
        document.querySelectorAll('.dropdown-menu').forEach(menu => {
          menu.style.display = 'none';
        });
      }
    });

    // ホバーエフェクト
    document.addEventListener('mouseover', (e) => {
      if (e.target.classList.contains('dropdown-item')) {
        if (!e.target.dataset.action) {
          e.target.style.backgroundColor = '#f8f9fa';
        }
      }
    });
    
    document.addEventListener('mouseout', (e) => {
      if (e.target.classList.contains('dropdown-item')) {
        if (e.target.dataset.action === 'consecutive-test') {
          e.target.style.backgroundColor = '#fff3cd';
        } else {
          e.target.style.backgroundColor = 'white';
        }
      }
    });
  }

  /**
   * デフォルトプロンプトを設定
   * 
   * @private
   */
  _setupDefaultPrompts() {
    const promptFields = [
      { id: 'chatgpt-prompt', default: '桃太郎について歴史を解説して' },
      { id: 'claude-prompt', default: '桃太郎について歴史を解説して' },
      { id: 'gemini-prompt', default: '桃太郎について歴史を解説して' },
      { id: 'genspark-prompt', default: '桃太郎について2枚のスライドで解説して' }
    ];
    
    promptFields.forEach(field => {
      const element = document.getElementById(field.id);
      if (element && !element.value) {
        element.value = field.default;
      }
    });
    
    this.logger.info('デフォルトプロンプトを設定しました');
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
      { logger: getLogger('IntegrationTest.StreamProcessor') }
    );

    // フック関数を設定
    processor.setHook('beforeTaskExecution', async (task, windowInfo) => {
      this.logger.debug(`タスク実行開始: ${task.id}`, {
        aiType: task.aiType,
        prompt: task.prompt?.substring(0, 50) + '...'
      });
    });

    processor.setHook('afterTaskExecution', async (task, windowInfo, result) => {
      this.logger.info(`タスク実行完了: ${task.id}`, {
        success: result.success,
        aiType: task.aiType
      });
    });

    return processor;
  }

  /**
   * 3連続テスト状態をリセット
   * 
   * @param {string} targetId - 対象ID
   * @private
   */
  _resetConsecutiveTestState(targetId) {
    if (this.consecutiveTestStates[targetId]) {
      this.consecutiveTestStates[targetId].enabled = false;
      this.consecutiveTestStates[targetId].testData = null;
    }
    
    // プロンプト欄を元に戻す
    const inputElement = document.getElementById(targetId);
    if (inputElement) {
      inputElement.value = '桃太郎について歴史を解説して';
      inputElement.style.backgroundColor = '';
    }
  }
}

// グローバルインスタンス
let integrationTestInstance = null;

/**
 * DOM読み込み完了時の初期化
 */
document.addEventListener('DOMContentLoaded', async () => {
  try {
    console.log('AI自動操作統合テスト - 初期化開始');
    
    // DOM要素を取得
    const elements = {
      logContainer: document.getElementById('logContainer'),
      statusText: document.getElementById('statusText')
    };

    // テストインスタンスを作成・初期化
    integrationTestInstance = new IntegrationTest();
    await integrationTestInstance.initialize(elements);

    // DOM専用ログを設定
    if (elements.logContainer) {
      setupDOMLogging('IntegrationTest', elements.logContainer, {
        maxEntries: 500,
        colorize: true,
        autoScroll: true
      });
    }

    // グローバルに公開（互換性のため）
    window.integrationTest = integrationTestInstance;

    console.log('AI自動操作統合テスト - 初期化完了');
    console.log('カスタムプルダウンが利用可能 - ▼ボタンでプリセット選択、テキストは自由編集可能');

  } catch (error) {
    console.error('統合テスト初期化エラー:', error);
    
    // エラーメッセージをUIに表示
    const statusText = document.getElementById('statusText');
    if (statusText) {
      statusText.textContent = '統合テスト初期化エラー';
    }
  }
});

// ページ離脱時のクリーンアップ
window.addEventListener('beforeunload', () => {
  if (integrationTestInstance) {
    integrationTestInstance.destroy();
  }
});

// レガシー関数のエクスポート（互換性のため）
window.handleConsecutiveTest = (targetId) => {
  if (integrationTestInstance) {
    integrationTestInstance.handleConsecutiveTest(targetId);
  }
};

window.executeConsecutiveTest = (targetAiType) => {
  if (integrationTestInstance) {
    return integrationTestInstance.executeConsecutiveTest(targetAiType);
  }
};