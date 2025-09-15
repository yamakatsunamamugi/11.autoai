/**
 * @fileoverview ProcessorFactory - 設定ベースのプロセッサ選択システム
 * 
 * ■ 概要
 * app-config.jsonの設定に基づいて適切なTaskProcessorを動的に選択・作成します。
 * 1箇所の設定変更で全体のプロセッサを切り替え可能にします。
 * 
 * ■ 設定例
 * {
 *   "taskProcessor": {
 *     "type": "TaskProcessorV2",
 *     "fallbackType": "StreamProcessor"
 *   }
 * }
 */

import TaskProcessorV2 from '../features/task/task-processor-v2.js';
import StreamProcessor from '../features/task/stream-processor.js';
import logger from '../utils/logger.js';

/**
 * 設定ベースでTaskProcessorを作成するファクトリクラス
 */
class ProcessorFactory {
  /**
   * 設定に基づいてプロセッサを作成
   * @param {Object} config - app-config.jsonの設定
   * @param {Object} dependencies - 依存関係オブジェクト
   * @returns {Object} プロセッサインスタンス
   */
  static createProcessor(config = {}, dependencies = {}) {
    const processorConfig = config?.taskProcessor || {};
    const processorType = processorConfig.type || 'StreamProcessor'; // デフォルトは従来版
    const fallbackType = processorConfig.fallbackType || 'StreamProcessor';
    
    logger.info('ProcessorFactory', '🏭 プロセッサ作成開始', {
      requestedType: processorType,
      fallbackType: fallbackType,
      configSource: config ? 'app-config.json' : 'default'
    });
    
    try {
      let processor = null;
      
      switch (processorType) {
        case 'TaskProcessorV2':
          processor = new TaskProcessorV2(dependencies);
          logger.info('ProcessorFactory', '✅ TaskProcessorV2を作成', {
            version: 'V2',
            executorIntegration: true
          });
          break;
          
        case 'StreamProcessor':
          processor = new StreamProcessor(dependencies);
          logger.info('ProcessorFactory', '✅ StreamProcessorを作成', {
            version: 'Legacy',
            traditional: true
          });
          break;
          
        default:
          logger.warn('ProcessorFactory', '⚠️ 不明なプロセッサタイプ、フォールバックを使用', {
            unknownType: processorType,
            fallback: fallbackType
          });
          
          // フォールバックプロセッサを作成
          if (fallbackType === 'TaskProcessorV2') {
            processor = new TaskProcessorV2(dependencies);
          } else {
            processor = new StreamProcessor(dependencies);
          }
          break;
      }
      
      // プロセッサにメタデータを追加
      processor._factoryMetadata = {
        type: processorType,
        fallbackType: fallbackType,
        createdAt: new Date().toISOString(),
        configDriven: true
      };
      
      return processor;
      
    } catch (error) {
      logger.error('ProcessorFactory', '❌ プロセッサ作成エラー', {
        error: error.message,
        requestedType: processorType,
        fallback: fallbackType
      });
      
      // エラー時はStreamProcessorで作成
      logger.info('ProcessorFactory', '🔄 エラーリカバリ: StreamProcessorで作成');
      const fallbackProcessor = new StreamProcessor(dependencies);
      fallbackProcessor._factoryMetadata = {
        type: 'StreamProcessor',
        fallbackType: fallbackType,
        createdAt: new Date().toISOString(),
        configDriven: false,
        errorRecovery: true,
        originalError: error.message
      };
      
      return fallbackProcessor;
    }
  }
  
  /**
   * 設定ファイルを動的に読み込み
   * @returns {Promise<Object>} 設定オブジェクト
   */
  static async loadConfig() {
    try {
      const configModule = await import('../../config/app-config.json', {
        assert: { type: 'json' }
      });
      return configModule.default;
    } catch (error) {
      logger.warn('ProcessorFactory', '⚠️ 設定ファイル読み込み失敗、デフォルト設定を使用', {
        error: error.message
      });
      
      // デフォルト設定
      return {
        taskProcessor: {
          type: 'TaskProcessorV2',
          fallbackType: 'StreamProcessor'
        }
      };
    }
  }
  
  /**
   * 設定を動的に読み込んでプロセッサを作成（推奨方法）
   * @param {Object} dependencies - 依存関係オブジェクト
   * @returns {Promise<Object>} プロセッサインスタンス
   */
  static async createProcessorFromConfig(dependencies = {}) {
    const config = await this.loadConfig();
    return this.createProcessor(config, dependencies);
  }
  
  /**
   * 利用可能なプロセッサタイプを取得
   * @returns {Array<string>} プロセッサタイプリスト
   */
  static getAvailableTypes() {
    return ['TaskProcessorV2', 'StreamProcessor'];
  }
  
  /**
   * プロセッサの詳細情報を取得
   * @param {Object} processor - プロセッサインスタンス
   * @returns {Object} プロセッサ情報
   */
  static getProcessorInfo(processor) {
    return {
      className: processor.constructor.name,
      metadata: processor._factoryMetadata || null,
      hasExecutorIntegration: !!processor.fallbackProcessor, // TaskProcessorV2の場合true
      version: processor._factoryMetadata?.type === 'TaskProcessorV2' ? 'V2' : 'Legacy'
    };
  }
}

export default ProcessorFactory;