/**
 * @fileoverview TaskProcessorV2 - ExecutorFactoryを使用した統合タスク処理システム
 * 
 * ■ システム概要
 * StreamProcessorと完全互換性を保ちながら、ExecutorFactoryによる
 * 新しい実行パターン選択機能を提供する統合処理システムです。
 * 
 * ■ 主要機能
 * 1. ExecutorFactory統合: TaskListに応じて最適なExecutorを自動選択
 * 2. API互換性: 既存のStreamProcessorと同じAPIを提供
 * 3. 段階的移行: 設定により新旧システムを切り替え可能
 * 4. 透明性: どのExecutorが使用されているかを明確にログ出力
 * 
 * ■ 実行パターン
 * - grouped_sequential: 列ごと順次実行（GroupedSequentialExecutor）
 * - parallel: 3種類AI並列実行（ParallelExecutor）
 * - sequential: 従来の順次実行（SequentialExecutor） 
 * - dependency: 依存関係実行（DependencyExecutor）
 * 
 * ■ 使用方法
 * 既存のStreamProcessorと同じように使用可能：
 * ```javascript
 * const processor = new TaskProcessorV2();
 * const result = await processor.processTaskStream(taskList, spreadsheetData, options);
 * ```
 */

import ExecutorFactory from './executors/executor-factory.js';
import StreamProcessorV2 from './stream-processor-v2.js';
import logger from '../../utils/logger.js';

/**
 * 統合タスクプロセッサ V2
 * ExecutorFactoryを使用してタスクパターンに応じた実行システムを選択
 */
class TaskProcessorV2 {
  constructor(dependencies = {}) {
    this.logger = dependencies.logger || logger;
    this.fallbackProcessor = new StreamProcessorV2(dependencies);
    this.isEnabled = true; // 新システムの有効/無効フラグ
    
    this.logger.info('TaskProcessorV2', '統合タスクプロセッサV2 初期化完了', {
      version: '2.0',
      executorFactoryIntegration: true,
      fallbackAvailable: true
    });
  }
  
  /**
   * タスクストリーム処理のメインエントリーポイント
   * StreamProcessorと完全互換のAPIを提供
   * 
   * @param {TaskList} taskList - 処理対象のタスクリスト
   * @param {Object} spreadsheetData - スプレッドシートデータ
   * @param {Object} options - 処理オプション
   * @returns {Promise<Object>} 処理結果
   */
  async processTaskStream(taskList, spreadsheetData, options = {}) {
    const startTime = Date.now();
    
    this.logger.info('TaskProcessorV2', '🚀 統合タスク処理開始', {
      totalTasks: taskList?.tasks?.length || 0,
      sheetName: spreadsheetData?.sheetName,
      options: Object.keys(options),
      version: 'V2'
    });
    
    try {
      // 新システムが無効化されている場合は従来システムを使用
      if (!this.isEnabled || options.useLegacyProcessor) {
        this.logger.info('TaskProcessorV2', '📋 従来システム使用', {
          reason: !this.isEnabled ? 'V2無効化' : 'オプション指定',
          fallback: 'StreamProcessor'
        });
        return await this.fallbackProcessor.processTaskStream(taskList, spreadsheetData, options);
      }
      
      // ExecutorFactoryでパターンを判定
      const executionPattern = ExecutorFactory.determineExecutionPattern(taskList);
      const patternDescription = ExecutorFactory.getPatternDescription(executionPattern);
      
      this.logger.info('TaskProcessorV2', '🎯 実行パターン選択', {
        pattern: executionPattern,
        description: patternDescription,
        taskCount: taskList?.tasks?.length || 0
      });
      
      // 適切なExecutorを作成
      const executor = ExecutorFactory.createExecutor(taskList, {
        logger: this.logger,
        isTestMode: options.testMode || false
      });
      
      this.logger.info('TaskProcessorV2', '⚡ Executor作成完了', {
        executorType: executor.constructor.name,
        pattern: executionPattern
      });
      
      // Executorでタスクを処理
      const result = await executor.processTaskStream(taskList, spreadsheetData, options);
      
      const processingTime = Date.now() - startTime;
      
      this.logger.info('TaskProcessorV2', '✅ 統合タスク処理完了', {
        success: result?.success || false,
        executorType: executor.constructor.name,
        pattern: executionPattern,
        processingTime: `${Math.round(processingTime / 1000)}秒`,
        totalTasks: taskList?.tasks?.length || 0,
        completedTasks: result?.completedTasks || result?.totalTasks || 0
      });
      
      return {
        ...result,
        executorType: executor.constructor.name,
        executionPattern: executionPattern,
        processingTime: processingTime,
        version: 'V2'
      };
      
    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      this.logger.error('TaskProcessorV2', '❌ 統合タスク処理エラー', {
        error: error.message,
        stack: error.stack?.split('\n').slice(0, 5).join('\n'),
        processingTime: `${Math.round(processingTime / 1000)}秒`,
        taskCount: taskList?.tasks?.length || 0
      });
      
      // エラー時は従来システムにフォールバック
      this.logger.warn('TaskProcessorV2', '🔄 従来システムにフォールバック');
      
      try {
        const fallbackResult = await this.fallbackProcessor.processTaskStream(taskList, spreadsheetData, options);
        return {
          ...fallbackResult,
          fallbackUsed: true,
          originalError: error.message,
          version: 'V2-Fallback'
        };
      } catch (fallbackError) {
        this.logger.error('TaskProcessorV2', '❌ フォールバックも失敗', {
          originalError: error.message,
          fallbackError: fallbackError.message
        });
        
        throw new Error(`TaskProcessorV2処理失敗: ${error.message}, フォールバック失敗: ${fallbackError.message}`);
      }
    }
  }
  
  /**
   * 新システムの有効/無効を切り替え
   * @param {boolean} enabled - 有効にするかどうか
   */
  setEnabled(enabled) {
    this.isEnabled = enabled;
    this.logger.info('TaskProcessorV2', '🔧 システム状態変更', {
      enabled: enabled,
      status: enabled ? '新システム有効' : '従来システム使用'
    });
  }
  
  /**
   * 現在の状態を取得
   * @returns {Object} 状態情報
   */
  getStatus() {
    return {
      version: '2.0',
      enabled: this.isEnabled,
      executorFactoryAvailable: !!ExecutorFactory,
      fallbackAvailable: !!this.fallbackProcessor
    };
  }
}

export default TaskProcessorV2;