/**
 * @fileoverview StreamProcessor V2 - SequentialExecutorを使用した列ごと順次処理システム
 * 
 * 特徴:
 * - 列ごとに上から下へ順次処理
 * - SequentialExecutorに処理を委譲
 * - 列完了後に次の列に進む
 */

import SequentialExecutor from './executors/sequential-executor.js';
import TaskQueue from './queue.js';

export default class StreamProcessorV2 {
  constructor(logger = console) {
    this.logger = logger;
    this.sequentialExecutor = new SequentialExecutor({
      logger: logger
    });
  }

  /**
   * タスクストリームを処理（TaskGeneratorV2のタスクリストを使用）
   * @param {TaskList} taskList - タスクリスト（行制御・列制御適用済み）
   * @param {Object} spreadsheetData - スプレッドシートデータ
   * @returns {Promise<Object>} 実行結果
   */
  async processTaskStream(taskList, spreadsheetData) {
    this.logger.log('[StreamProcessorV2] 🚀 列ごと順次処理開始', {
      タスク数: taskList.tasks.length,
      行制御・列制御: '適用済み',
      処理方式: '列ごと（上から下へ）'
    });
    
    // タスクリストが空の場合は早期リターン
    if (!taskList || taskList.tasks.length === 0) {
      this.logger.log('[StreamProcessorV2] タスクリストが空です');
      return {
        success: true,
        total: 0,
        completed: 0,
        failed: 0,
        totalTime: '0秒'
      };
    }
    
    // SequentialExecutorにタスクリストと処理を委譲
    const result = await this.sequentialExecutor.processTaskStream(taskList, spreadsheetData, {
      testMode: false
    });
    
    // タスクリストをクリア（Chrome Storageから削除）
    try {
      const taskQueue = new TaskQueue();
      await taskQueue.clearTaskList();
      this.logger.log('[StreamProcessorV2] ✅ タスクリストを削除しました');
    } catch (error) {
      this.logger.warn('[StreamProcessorV2] タスクリスト削除失敗:', error);
    }
    
    return result;
  }

}