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
   * タスクストリームを処理（ColumnProcessorに委譲）
   * @param {TaskList} taskList - タスクリスト（使用しない）
   * @param {Object} spreadsheetData - スプレッドシートデータ
   * @returns {Promise<Object>} 実行結果
   */
  async processTaskStream(taskList, spreadsheetData) {
    this.logger.log('[StreamProcessorV2] 🚀 ColumnProcessorで処理開始');
    
    // ColumnProcessorに処理を委譲
    const result = await this.columnProcessor.processSpreadsheet(spreadsheetData);
    
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