// executor-factory.js - Strategy Pattern for Task Execution
// 実行パターン別のExecutorを提供するFactory

import ParallelExecutor from './parallel-executor.js';
import SequentialExecutor from './sequential-executor.js'; 
import DependencyExecutor from './dependency-executor.js';

/**
 * タスクの実行パターンを判定し適切なExecutorを提供
 */
class ExecutorFactory {
  /**
   * タスクリストに適したExecutorを作成
   * @param {TaskList} taskList 
   * @param {Object} dependencies 
   * @returns {BaseExecutor}
   */
  static createExecutor(taskList, dependencies = {}) {
    const executionPattern = ExecutorFactory.determineExecutionPattern(taskList);
    
    switch (executionPattern) {
      case 'parallel':
        return new ParallelExecutor(dependencies);
      
      case 'sequential':
        return new SequentialExecutor(dependencies);
        
      case 'dependency':
        return new DependencyExecutor(dependencies);
        
      default:
        throw new Error(`Unknown execution pattern: ${executionPattern}`);
    }
  }
  
  /**
   * タスクリストの実行パターンを判定
   * @param {TaskList} taskList 
   * @returns {string} 'parallel' | 'sequential' | 'dependency'
   */
  static determineExecutionPattern(taskList) {
    if (!taskList || !taskList.tasks || taskList.tasks.length === 0) {
      return 'sequential'; // デフォルト
    }
    
    // レポートタスクがある場合は依存関係実行
    const hasReportTasks = taskList.tasks.some(task => task.taskType === 'report');
    if (hasReportTasks) {
      return 'dependency';
    }
    
    // 3種類AIグループがある場合は並列実行
    const firstTask = taskList.tasks[0];
    const isThreeTypeGroup = firstTask?.multiAI && firstTask?.groupId;
    
    // グループ内の全タスクが3種類AIかチェック
    if (isThreeTypeGroup) {
      const groupTasks = taskList.tasks.filter(task => task.groupId === firstTask.groupId);
      const aiTypes = new Set(groupTasks.map(task => task.aiType));
      
      // 3種類AI（chatgpt, claude, gemini）が揃っている場合
      if (aiTypes.has('chatgpt') && aiTypes.has('claude') && aiTypes.has('gemini')) {
        return 'parallel';
      }
    }
    
    // デフォルトは順次実行
    return 'sequential';
  }
  
  /**
   * 実行パターンの説明を取得
   * @param {string} pattern 
   * @returns {string}
   */
  static getPatternDescription(pattern) {
    const descriptions = {
      'parallel': '3種類AI並列実行 - ChatGPT, Claude, Geminiを同時実行',
      'sequential': '順次実行 - 前の列完了後に次の列を開始',
      'dependency': '依存関係実行 - AIタスク完了後にレポートタスクを実行'
    };
    
    return descriptions[pattern] || '不明な実行パターン';
  }
}

export default ExecutorFactory;