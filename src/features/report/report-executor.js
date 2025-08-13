// report-executor.js - レポートタスク実行サービス

import ReportManager from './report-manager.js';

/**
 * レポートタスク実行サービス
 * レポートタスクの実行に関する責任を持つ
 */
export class ReportExecutor {
  constructor(config = {}) {
    this.reportManager = config.reportManager || new ReportManager();
    this.logger = config.logger || console;
    this.retryAttempts = config.retryAttempts || 3;
    this.retryDelay = config.retryDelay || 1000;
  }

  /**
   * レポートタスクを実行
   * @param {Object} task - レポートタスク
   * @param {Object} spreadsheetData - スプレッドシートデータ
   * @returns {Promise<Object>} 実行結果
   */
  async executeTask(task, spreadsheetData) {
    if (task.taskType !== 'report') {
      throw new Error(`Invalid task type: ${task.taskType}. Expected 'report'`);
    }

    const startTime = Date.now();
    
    try {
      // AI回答を取得
      const aiAnswer = await this.getAIAnswer(task, spreadsheetData);
      
      if (!aiAnswer) {
        throw new Error(`AI回答が見つかりません: ${task.sourceColumn}${task.row}`);
      }

      // プロンプトテキストを取得
      const promptText = await this.getPromptText(task, spreadsheetData);

      // レポートを生成
      const result = await this.createReportWithRetry({
        spreadsheetId: task.spreadsheetId || spreadsheetData.spreadsheetId,
        gid: task.sheetGid || spreadsheetData.gid,
        rowNumber: task.row,
        promptText: promptText,
        answerText: aiAnswer,
        reportColumn: task.reportColumn
      });

      const executionTime = Date.now() - startTime;

      return {
        success: result.success,
        taskId: task.id,
        row: task.row,
        documentId: result.documentId,
        url: result.url,
        executionTime: executionTime,
        error: result.error
      };

    } catch (error) {
      this.logger.error('[ReportExecutor] タスク実行エラー:', error);
      
      return {
        success: false,
        taskId: task.id,
        row: task.row,
        error: error.message,
        executionTime: Date.now() - startTime
      };
    }
  }

  /**
   * 複数のレポートタスクをバッチ実行
   * @param {Array<Object>} tasks - レポートタスクの配列
   * @param {Object} spreadsheetData - スプレッドシートデータ
   * @param {Object} options - 実行オプション
   * @returns {Promise<Object>} バッチ実行結果
   */
  async executeBatch(tasks, spreadsheetData, options = {}) {
    const results = [];
    const startTime = Date.now();
    
    // オプションの設定
    const { parallel = false, maxConcurrent = 3 } = options;

    if (parallel) {
      // 並列実行
      const chunks = this.chunkArray(tasks, maxConcurrent);
      
      for (const chunk of chunks) {
        const chunkResults = await Promise.all(
          chunk.map(task => this.executeTask(task, spreadsheetData))
        );
        results.push(...chunkResults);
      }
    } else {
      // 順次実行
      for (const task of tasks) {
        const result = await this.executeTask(task, spreadsheetData);
        results.push(result);
        
        // 実行間隔を設ける（APIレート制限対策）
        if (options.delay) {
          await this.delay(options.delay);
        }
      }
    }

    const totalTime = Date.now() - startTime;
    const successCount = results.filter(r => r.success).length;
    const failedCount = results.filter(r => !r.success).length;

    return {
      success: failedCount === 0,
      results: results,
      stats: {
        total: tasks.length,
        success: successCount,
        failed: failedCount,
        totalTime: totalTime,
        averageTime: totalTime / tasks.length
      }
    };
  }

  /**
   * AI回答を取得
   * @private
   */
  async getAIAnswer(task, spreadsheetData) {
    // まずタスクのsourceColumnから取得を試みる
    if (task.sourceColumn && task.row) {
      const answer = this.getCellValue(
        spreadsheetData,
        task.sourceColumn,
        task.row
      );
      
      if (answer && answer.trim()) {
        return answer.trim();
      }
    }

    // メタデータから取得を試みる
    if (task.metadata?.aiAnswer) {
      return task.metadata.aiAnswer;
    }

    return null;
  }

  /**
   * プロンプトテキストを取得
   * @private
   */
  async getPromptText(task, spreadsheetData) {
    // promptColumnから取得を試みる
    if (task.promptColumn && task.row) {
      const prompt = this.getCellValue(
        spreadsheetData,
        task.promptColumn,
        task.row
      );
      
      if (prompt && prompt.trim()) {
        return prompt.trim();
      }
    }

    // メタデータから取得を試みる
    if (task.metadata?.originalPrompt) {
      return task.metadata.originalPrompt;
    }

    // デフォルト値
    return 'プロンプトなし';
  }

  /**
   * リトライ機能付きレポート作成
   * @private
   */
  async createReportWithRetry(params, attemptNumber = 1) {
    try {
      return await this.reportManager.generateReportForRow(params);
    } catch (error) {
      if (attemptNumber < this.retryAttempts) {
        this.logger.warn(
          `[ReportExecutor] レポート作成失敗（試行 ${attemptNumber}/${this.retryAttempts}）:`,
          error.message
        );
        
        await this.delay(this.retryDelay * attemptNumber);
        
        return this.createReportWithRetry(params, attemptNumber + 1);
      }
      
      throw error;
    }
  }

  /**
   * セル値を取得
   * @private
   */
  getCellValue(spreadsheetData, column, row) {
    if (!spreadsheetData.values) return null;

    const rowData = spreadsheetData.values[row - 1];
    if (!rowData) return null;

    const columnIndex = this.getColumnIndex(column);
    return rowData[columnIndex] || null;
  }

  /**
   * 列名から列インデックスを計算
   * @private
   */
  getColumnIndex(columnName) {
    let index = 0;
    for (let i = 0; i < columnName.length; i++) {
      index = index * 26 + (columnName.charCodeAt(i) - 64);
    }
    return index - 1;
  }

  /**
   * 配列をチャンクに分割
   * @private
   */
  chunkArray(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * 遅延処理
   * @private
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 実行状態のサマリーを取得
   * @param {Array<Object>} results - 実行結果の配列
   * @returns {Object} サマリー情報
   */
  getSummary(results) {
    const successResults = results.filter(r => r.success);
    const failedResults = results.filter(r => !r.success);
    
    const totalTime = results.reduce((sum, r) => sum + (r.executionTime || 0), 0);
    const averageTime = results.length > 0 ? totalTime / results.length : 0;
    
    return {
      totalTasks: results.length,
      successCount: successResults.length,
      failedCount: failedResults.length,
      successRate: results.length > 0 
        ? (successResults.length / results.length * 100).toFixed(1) 
        : 0,
      totalExecutionTime: totalTime,
      averageExecutionTime: Math.round(averageTime),
      documentIds: successResults
        .filter(r => r.documentId)
        .map(r => r.documentId),
      failedRows: failedResults.map(r => r.row),
      errors: failedResults
        .filter(r => r.error)
        .map(r => ({ row: r.row, error: r.error }))
    };
  }
}

export default ReportExecutor;