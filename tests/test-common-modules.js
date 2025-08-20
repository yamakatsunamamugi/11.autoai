/**
 * @fileoverview 共通モジュール動作確認テスト
 * 
 * 概要:
 * 新しく作成した共通モジュールの動作を確認するテストスクリプト
 * - AITaskExecutor: AI実行の共通処理
 * - TaskFactory: タスクリスト作成の共通処理
 * - StreamProcessor: 拡張されたoutputTarget機能
 */

import { AITaskExecutor } from '../src/core/ai-task-executor.js';
import { TaskFactory } from '../src/features/task/task-factory.js';
import StreamProcessor from '../src/features/task/stream-processor.js';

// テスト用のモックオブジェクト
const mockChrome = {
  scripting: {
    executeScript: async (options) => {
      console.log('[Mock] スクリプト実行:', options);
      // ダミーの成功レスポンスを返す
      return [{
        result: {
          success: true,
          response: 'テスト応答: ' + new Date().toISOString()
        }
      }];
    }
  }
};

// グローバルchromeオブジェクトをモックに置き換え（テスト環境用）
if (typeof chrome === 'undefined') {
  globalThis.chrome = mockChrome;
}

/**
 * AITaskExecutorのテスト
 */
async function testAITaskExecutor() {
  console.log('\n===== AITaskExecutor テスト =====');
  
  const executor = new AITaskExecutor();
  
  // テスト用のタスクデータ
  const testTask = {
    aiType: 'chatgpt',
    taskId: 'test_' + Date.now(),
    model: 'gpt-4',
    function: 'none',
    prompt: 'テストプロンプト'
  };
  
  console.log('テストタスク:', testTask);
  
  try {
    // 実行（モック環境では実際のタブIDは不要）
    const result = await executor.executeAITask(123, testTask);
    
    if (result.success) {
      console.log('✅ AITaskExecutor: 成功');
      console.log('  応答:', result.response);
    } else {
      console.log('❌ AITaskExecutor: 失敗');
      console.log('  エラー:', result.error);
    }
  } catch (error) {
    console.error('❌ AITaskExecutor: エラー', error);
  }
}

/**
 * TaskFactoryのテスト
 */
async function testTaskFactory() {
  console.log('\n===== TaskFactory テスト =====');
  
  const factory = new TaskFactory();
  
  // テスト1: 手動タスクリストの作成
  console.log('\n[テスト1] 手動タスクリスト作成');
  
  const manualTaskList = factory.createTestTaskList({
    aiTypes: ['chatgpt', 'claude'],
    columns: ['D', 'E'],
    rows: [9, 10],
    prompt: 'テスト質問'
  });
  
  console.log('作成されたタスクリスト:');
  console.log('  タスク数:', manualTaskList.tasks.length);
  console.log('  統計:', manualTaskList.getStatistics());
  
  // テスト2: source='manual'でのタスクリスト取得
  console.log('\n[テスト2] manual sourceでの取得');
  
  try {
    const taskList = await factory.createTaskList({
      source: 'manual',
      taskList: manualTaskList
    });
    
    console.log('✅ TaskFactory (manual): 成功');
    console.log('  タスク数:', taskList.tasks.length);
    console.log('  統計:', taskList.getStatistics());
  } catch (error) {
    console.error('❌ TaskFactory (manual): エラー', error);
  }
  
  // テスト3: タスクリスト検証
  console.log('\n[テスト3] タスクリスト検証');
  
  const invalidTaskList = {
    tasks: [
      { id: '1', aiType: 'chatgpt' } // 必須フィールド不足
    ]
  };
  
  try {
    factory.validateTaskList(invalidTaskList);
    console.log('❌ 検証失敗: エラーが発生するはずでした');
  } catch (error) {
    console.log('✅ 検証成功: 不正なタスクを検出');
    console.log('  エラー:', error.message);
  }
}

/**
 * StreamProcessorのテスト
 */
async function testStreamProcessor() {
  console.log('\n===== StreamProcessor テスト =====');
  
  // モックウィンドウマネージャー
  const mockWindowManager = {
    createWindow: async (url, aiType, position) => {
      console.log(`[Mock] ウィンドウ作成: ${aiType} at position ${position}`);
      return {
        windowId: 1000 + position,
        tabId: 2000 + position
      };
    },
    closeWindow: async (windowId) => {
      console.log(`[Mock] ウィンドウクローズ: ${windowId}`);
      return true;
    }
  };
  
  const processor = new StreamProcessor({
    windowManager: mockWindowManager,
    logger: console
  });
  
  // テスト用タスクリスト
  const testTaskList = {
    tasks: [
      {
        id: 'test1',
        aiType: 'chatgpt',
        column: 'D',
        row: 9,
        prompt: 'テスト1',
        taskType: 'ai',
        waitResponse: false,  // テストモード
        getResponse: false
      },
      {
        id: 'test2',
        aiType: 'claude',
        column: 'E',
        row: 9,
        prompt: 'テスト2',
        taskType: 'ai',
        waitResponse: false,  // テストモード
        getResponse: false
      }
    ],
    getStatistics: () => ({
      total: 2,
      byAI: { chatgpt: 1, claude: 1 }
    })
  };
  
  // テスト1: ログ出力モード
  console.log('\n[テスト1] ログ出力モード');
  
  try {
    const result = await processor.processTaskStream(
      testTaskList,
      { spreadsheetId: 'test123', gid: '0' },
      { outputTarget: 'log' }
    );
    
    console.log('✅ StreamProcessor (log): 成功');
    console.log('  処理列:', result.processedColumns);
    console.log('  ウィンドウ数:', result.totalWindows);
  } catch (error) {
    console.error('❌ StreamProcessor (log): エラー', error);
  }
  
  // テスト2: outputTargetのデフォルト動作
  console.log('\n[テスト2] デフォルト動作確認');
  
  const options1 = { testMode: true };
  const options2 = { testMode: false };
  const options3 = {};
  
  console.log('testMode=true -> outputTarget:', 
    options1.outputTarget || (options1.testMode ? 'log' : 'spreadsheet'));
  console.log('testMode=false -> outputTarget:', 
    options2.outputTarget || (options2.testMode ? 'log' : 'spreadsheet'));
  console.log('オプションなし -> outputTarget:', 
    options3.outputTarget || (options3.testMode ? 'log' : 'spreadsheet'));
}

/**
 * 統合テスト
 */
async function testIntegration() {
  console.log('\n===== 統合テスト =====');
  
  const factory = new TaskFactory();
  const executor = new AITaskExecutor();
  
  // TaskFactoryでタスクリストを作成
  const taskList = factory.createTestTaskList({
    aiTypes: ['chatgpt'],
    columns: ['D'],
    rows: [9],
    prompt: '統合テスト'
  });
  
  console.log('作成されたタスク:', taskList.tasks[0]);
  
  // AITaskExecutorでタスクを実行
  try {
    const task = taskList.tasks[0];
    const result = await executor.executeAITask(123, {
      aiType: task.aiType,
      taskId: task.id,
      model: task.model,
      function: task.specialOperation,
      prompt: task.prompt
    });
    
    if (result.success) {
      console.log('✅ 統合テスト: 成功');
      console.log('  タスクID:', task.id);
      console.log('  応答:', result.response);
    } else {
      console.log('❌ 統合テスト: 失敗');
      console.log('  エラー:', result.error);
    }
  } catch (error) {
    console.error('❌ 統合テスト: エラー', error);
  }
}

/**
 * メイン実行
 */
async function main() {
  console.log('========================================');
  console.log('     共通モジュール動作確認テスト');
  console.log('========================================');
  
  try {
    await testAITaskExecutor();
    await testTaskFactory();
    await testStreamProcessor();
    await testIntegration();
    
    console.log('\n========================================');
    console.log('     全テスト完了');
    console.log('========================================');
  } catch (error) {
    console.error('\n❌ テスト実行エラー:', error);
  }
}

// Node.js環境での実行
if (typeof window === 'undefined') {
  main().catch(console.error);
} else {
  // ブラウザ環境では自動実行しない
  console.log('ブラウザ環境で読み込まれました。main()を手動で実行してください。');
  window.testCommonModules = main;
}