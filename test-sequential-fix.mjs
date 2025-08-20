// test-sequential-fix.mjs - Sequential実行修正のテスト
import StreamProcessor from './src/features/task/stream-processor.js';
import { Task, TaskList } from './src/features/task/models.js';

async function testSequentialExecution() {
  console.log('🧪 Sequential実行修正のテスト開始');
  
  // テスト用のタスクリストを作成（単独AIタスク）
  const tasks = [
    new Task({
      id: 'test1',
      column: 'D',
      row: 9,
      aiType: 'chatgpt',
      taskType: 'ai',
      prompt: 'Test prompt 1',
      createdAt: Date.now(),
      version: '1.0'
    }),
    new Task({
      id: 'test2', 
      column: 'E',
      row: 9,
      aiType: 'claude',
      taskType: 'ai', 
      prompt: 'Test prompt 2',
      createdAt: Date.now(),
      version: '1.0'
    })
  ];

  const taskList = new TaskList(tasks);
  const processor = new StreamProcessor({
    windowManager: null,
    modelManager: null,
    logger: console
  });

  try {
    console.log('📋 タスクリスト:', taskList.tasks.map(t => ({ column: t.column, row: t.row, aiType: t.aiType })));
    
    const result = await processor.processTaskStream(taskList, {}, { testMode: true });
    console.log('✅ Sequential実行テスト成功');
    console.log('結果:', result);
    
    return true;
  } catch (error) {
    console.error('❌ テストエラー:', error.message);
    console.error('Stack:', error.stack);
    return false;
  }
}

// テスト実行
testSequentialExecution().then(success => {
  console.log(success ? '🎉 全テスト完了' : '💥 テスト失敗');
  process.exit(success ? 0 : 1);
});