/**
 * @fileoverview StreamProcessor V2 - ColumnProcessorを使用したシンプルな実行システム
 * 
 * 特徴:
 * - 列ごとにタスクリストを生成して順次処理
 * - ColumnProcessorに処理を委譲
 * - シンプルで保守しやすい実装
 */

import ColumnProcessor from './column-processor.js';
import TaskQueue from './queue.js';

export default class StreamProcessorV2 {
  constructor(logger = console) {
    this.logger = logger;
    this.columnProcessor = new ColumnProcessor(logger);
  }

  /**
   * タスクストリームを処理（TaskGeneratorV2のタスクリストを使用）
   * @param {TaskList} taskList - タスクリスト（行制御・列制御適用済み）
   * @param {Object} spreadsheetData - スプレッドシートデータ
   * @returns {Promise<Object>} 実行結果
   */
  async processTaskStream(taskList, spreadsheetData) {
    this.logger.log('[StreamProcessorV2] 🚀 処理開始', {
      タスク数: taskList.tasks.length,
      行制御・列制御: '適用済み'
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
    
    // ColumnProcessorにタスクリストと処理を委譲
    const result = await this.columnProcessor.processTaskList(taskList, spreadsheetData);
    
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