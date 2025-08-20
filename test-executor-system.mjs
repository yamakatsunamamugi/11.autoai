// test-executor-system.mjs - 新しいExecutorシステムの統合テスト
import { Task, TaskList } from './src/features/task/models.js';
import ExecutorFactory from './src/features/task/executors/executor-factory.js';

/**
 * 各実行パターンのテストケースを生成
 */
function createTestCases() {
  return {
    // テストケース1: Sequential実行（単独AIタスク）
    sequential: new TaskList([
      new Task({
        id: 'seq1',
        column: 'D',
        row: 9,
        aiType: 'chatgpt',
        taskType: 'ai',
        prompt: 'Test sequential prompt 1',
        createdAt: Date.now(),
        version: '1.0'
      }),
      new Task({
        id: 'seq2',
        column: 'E', 
        row: 9,
        aiType: 'claude',
        taskType: 'ai',
        prompt: 'Test sequential prompt 2',
        createdAt: Date.now(),
        version: '1.0'
      })
    ]),
    
    // テストケース2: Parallel実行（3種類AIグループ）
    parallel: new TaskList([
      new Task({
        id: 'par1',
        column: 'D',
        row: 9,
        aiType: 'chatgpt',
        taskType: 'ai',
        prompt: 'Test parallel prompt 1',
        multiAI: true,
        groupId: 'group1',
        createdAt: Date.now(),
        version: '1.0'
      }),
      new Task({
        id: 'par2',
        column: 'E',
        row: 9,
        aiType: 'claude',
        taskType: 'ai',
        prompt: 'Test parallel prompt 2',
        multiAI: true,
        groupId: 'group1',
        createdAt: Date.now(),
        version: '1.0'
      }),
      new Task({
        id: 'par3',
        column: 'F',
        row: 9,
        aiType: 'gemini',
        taskType: 'ai', 
        prompt: 'Test parallel prompt 3',
        multiAI: true,
        groupId: 'group1',
        createdAt: Date.now(),
        version: '1.0'
      })
    ]),
    
    // テストケース3: Dependency実行（AIタスク + レポートタスク）
    dependency: new TaskList([
      new Task({
        id: 'dep1',
        column: 'D',
        row: 9,
        aiType: 'chatgpt',
        taskType: 'ai',
        prompt: 'Test AI task for report',
        createdAt: Date.now(),
        version: '1.0'
      }),
      new Task({
        id: 'dep2',
        column: 'E',
        row: 9,
        taskType: 'report',
        sourceColumn: 'D',
        reportColumn: 'E',
        dependsOn: 'dep1',
        createdAt: Date.now(),
        version: '1.0'
      })
    ])
  };
}

/**
 * パターン判定テスト
 */
function testPatternDetermination() {
  console.log('📊 パターン判定テスト開始');
  
  const testCases = createTestCases();
  const results = {};
  
  Object.entries(testCases).forEach(([expectedPattern, taskList]) => {
    const detectedPattern = ExecutorFactory.determineExecutionPattern(taskList);
    const description = ExecutorFactory.getPatternDescription(detectedPattern);
    
    results[expectedPattern] = {
      expected: expectedPattern,
      detected: detectedPattern,
      correct: expectedPattern === detectedPattern,
      description: description
    };
    
    const status = results[expectedPattern].correct ? '✅' : '❌';
    console.log(`${status} ${expectedPattern}: ${detectedPattern} - ${description}`);
  });
  
  const allCorrect = Object.values(results).every(r => r.correct);
  console.log(allCorrect ? '✅ パターン判定テスト成功' : '❌ パターン判定テスト失敗');
  
  return { allCorrect, results };
}

/**
 * Executor作成テスト
 */
async function testExecutorCreation() {
  console.log('🏭 Executor作成テスト開始');
  
  const testCases = createTestCases();
  const results = {};
  
  for (const [pattern, taskList] of Object.entries(testCases)) {
    try {
      const executor = ExecutorFactory.createExecutor(taskList, {
        logger: console
      });
      
      results[pattern] = {
        success: true,
        executorType: executor.constructor.name,
        hasProcessMethod: typeof executor.processTaskStream === 'function'
      };
      
      console.log(`✅ ${pattern}: ${executor.constructor.name}作成成功`);
    } catch (error) {
      results[pattern] = {
        success: false,
        error: error.message
      };
      
      console.log(`❌ ${pattern}: 作成失敗 - ${error.message}`);
    }
  }
  
  const allSuccess = Object.values(results).every(r => r.success);
  console.log(allSuccess ? '✅ Executor作成テスト成功' : '❌ Executor作成テスト失敗');
  
  return { allSuccess, results };
}

/**
 * 実行テスト
 */
async function testExecution() {
  console.log('🚀 実行テスト開始');
  
  const testCases = createTestCases();
  const results = {};
  
  for (const [pattern, taskList] of Object.entries(testCases)) {
    try {
      console.log(`\n--- ${pattern}実行テスト ---`);
      
      const executor = ExecutorFactory.createExecutor(taskList, {
        logger: {
          log: (...args) => console.log(`[${pattern}]`, ...args),
          error: (...args) => console.error(`[${pattern}]`, ...args),
          warn: (...args) => console.warn(`[${pattern}]`, ...args)
        }
      });
      
      const result = await executor.processTaskStream(taskList, {}, { 
        testMode: true,
        outputTarget: 'log'
      });
      
      results[pattern] = {
        success: result.success,
        executor: result.executor,
        executionPattern: result.executionPattern,
        totalWindows: result.totalWindows,
        completedTasks: result.completedTasks
      };
      
      console.log(`✅ ${pattern}実行成功:`, result);
      
    } catch (error) {
      results[pattern] = {
        success: false,
        error: error.message
      };
      
      console.log(`❌ ${pattern}実行失敗:`, error.message);
    }
  }
  
  const allSuccess = Object.values(results).every(r => r.success);
  console.log(allSuccess ? '\n✅ 実行テスト成功' : '\n❌ 実行テスト失敗');
  
  return { allSuccess, results };
}

/**
 * メインテスト実行
 */
async function runAllTests() {
  console.log('🧪 新Executorシステム統合テスト開始\n');
  
  try {
    // パターン判定テスト
    const patternTest = testPatternDetermination();
    
    // Executor作成テスト  
    const creationTest = await testExecutorCreation();
    
    // 実行テスト
    const executionTest = await testExecution();
    
    // 総合結果
    const allTestsPassed = patternTest.allCorrect && 
                          creationTest.allSuccess && 
                          executionTest.allSuccess;
    
    console.log('\n🎯 統合テスト結果:');
    console.log(`パターン判定: ${patternTest.allCorrect ? '✅ 成功' : '❌ 失敗'}`);
    console.log(`Executor作成: ${creationTest.allSuccess ? '✅ 成功' : '❌ 失敗'}`);
    console.log(`実行テスト: ${executionTest.allSuccess ? '✅ 成功' : '❌ 失敗'}`);
    
    console.log(allTestsPassed ? 
      '\n🎉 全てのテストが成功しました！新しいExecutorシステムは正常に動作しています。' : 
      '\n💥 一部のテストが失敗しました。');
    
    return allTestsPassed;
    
  } catch (error) {
    console.error('❌ テスト実行中にエラーが発生:', error);
    return false;
  }
}

// テスト実行
runAllTests().then(success => {
  process.exit(success ? 0 : 1);
});