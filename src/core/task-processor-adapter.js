/**
 * @fileoverview TaskProcessorAdapter - 既存コードと新DIコンテナの橋渡し
 *
 * StreamProcessorV2を新しいDIコンテナ構造でラップし、
 * 段階的な移行を可能にするアダプター
 *
 * @example
 * // DIコンテナから使用
 * const container = await getGlobalContainer();
 * const processor = container.get('taskProcessorAdapter');
 * await processor.processTasks(spreadsheetData, taskGroups, options);
 */

import StreamProcessorV2 from '../features/task/stream-processor-v2.js';

/**
 * TaskProcessorAdapter
 * 既存のStreamProcessorV2を新しいインターフェースでラップ
 */
export class TaskProcessorAdapter {
  constructor(dependencies = {}) {
    // 依存サービスを受け取る
    this.sheetsClient = dependencies.sheetsClient;
    this.spreadsheetLogger = dependencies.spreadsheetLogger;
    this.exclusiveControlManager = dependencies.exclusiveControlManager;
    this.powerManager = dependencies.powerManager;
    this.retryManager = dependencies.retryManager;
    this.taskExecutor = dependencies.taskExecutor;
    this.logger = dependencies.logger || console;

    // 内部でStreamProcessorV2を使用（依存性を渡す）
    this.v2Processor = new StreamProcessorV2(this.logger, {
      sheetsClient: this.sheetsClient,
      SpreadsheetLogger: dependencies.SpreadsheetLogger
    });

    // 依存を注入（可能な範囲で）
    this.injectDependencies();
  }

  /**
   * 既存のプロセッサーに依存を注入
   */
  injectDependencies() {
    // sheetsClientを注入
    if (this.sheetsClient) {
      // StreamProcessorV2が初期化時にnullに設定するので、
      // 処理前に設定する必要がある
      this.v2Processor.sheetsClient = this.sheetsClient;
    }

    // spreadsheetLoggerを注入
    if (this.spreadsheetLogger) {
      this.v2Processor.spreadsheetLogger = this.spreadsheetLogger;
    }

    // グローバル変数も更新（後方互換性のため）
    if (this.sheetsClient && !globalThis.sheetsClient) {
      globalThis.sheetsClient = this.sheetsClient;
    }
  }

  /**
   * タスクを処理（新しいインターフェース）
   * @param {Object} spreadsheetData - スプレッドシートデータ
   * @param {Array} taskGroups - タスクグループ配列
   * @param {Object} options - 処理オプション
   * @returns {Promise<Object>} 処理結果
   */
  async processTasks(spreadsheetData, taskGroups, options = {}) {
    try {
      this.logger.log('[TaskProcessorAdapter] タスク処理開始');

      // 依存を再注入（processDynamicTaskGroupsで初期化される前に）
      this.injectDependencies();

      // optionsにtaskGroupsを含める（既存の形式に変換）
      const v2Options = {
        ...options,
        taskGroups: taskGroups
      };

      // StreamProcessorV2のメソッドを呼び出し
      const result = await this.v2Processor.processDynamicTaskGroups(
        spreadsheetData,
        v2Options
      );

      this.logger.log('[TaskProcessorAdapter] タスク処理完了');
      return result;

    } catch (error) {
      this.logger.error('[TaskProcessorAdapter] エラー:', error);
      throw error;
    }
  }

  /**
   * タスクグループを処理
   * @param {Object} group - タスクグループ
   * @param {number} index - グループインデックス
   * @returns {Promise<Object>} グループ処理結果
   */
  async processTaskGroup(group, index) {
    // 将来的に実装
    this.logger.log(`[TaskProcessorAdapter] グループ${index + 1}処理: ${group.name}`);

    // 現在はv2Processorの内部メソッドを呼び出すことはできないので、
    // processTasks経由で処理する
    return {
      groupName: group.name,
      status: 'processed_via_v2'
    };
  }

  /**
   * クリーンアップ処理
   */
  async cleanup() {
    if (this.v2Processor && typeof this.v2Processor.cleanupAndStopProtection === 'function') {
      await this.v2Processor.cleanupAndStopProtection('アダプター経由のクリーンアップ');
    }
  }

  /**
   * デバッグ情報を出力
   */
  debug() {
    console.group('[TaskProcessorAdapter] デバッグ情報');
    console.log('sheetsClient:', !!this.sheetsClient);
    console.log('spreadsheetLogger:', !!this.spreadsheetLogger);
    console.log('exclusiveControlManager:', !!this.exclusiveControlManager);
    console.log('powerManager:', !!this.powerManager);
    console.log('retryManager:', !!this.retryManager);
    console.log('taskExecutor:', !!this.taskExecutor);
    console.log('v2Processor:', !!this.v2Processor);
    console.groupEnd();
  }
}

/**
 * ファクトリー関数：DIコンテナから使用
 * @param {Object} container - DIコンテナ
 * @returns {Promise<TaskProcessorAdapter>}
 */
export async function createTaskProcessorAdapter(container) {
  // 必要な依存を取得
  const dependencies = {};

  // 各サービスを取得（存在する場合のみ）
  try {
    if (container.has('sheetsClient')) {
      dependencies.sheetsClient = await container.get('sheetsClient');
    }
  } catch (e) {
    console.warn('sheetsClient取得失敗:', e.message);
  }

  try {
    if (container.has('spreadsheetLogger')) {
      dependencies.spreadsheetLogger = await container.get('spreadsheetLogger');
    }
  } catch (e) {
    console.warn('spreadsheetLogger取得失敗:', e.message);
  }

  // SpreadsheetLoggerクラスも取得
  try {
    const module = await import('../features/logging/spreadsheet-logger.js');
    dependencies.SpreadsheetLogger = module.default || module.SpreadsheetLogger;
  } catch (e) {
    console.warn('SpreadsheetLoggerクラス取得失敗:', e.message);
  }

  try {
    if (container.has('exclusiveControlManager')) {
      dependencies.exclusiveControlManager = await container.get('exclusiveControlManager');
    }
  } catch (e) {
    console.warn('exclusiveControlManager取得失敗:', e.message);
  }

  try {
    if (container.has('powerManager')) {
      dependencies.powerManager = await container.get('powerManager');
    }
  } catch (e) {
    console.warn('powerManager取得失敗:', e.message);
  }

  try {
    if (container.has('retryManager')) {
      dependencies.retryManager = await container.get('retryManager');
    }
  } catch (e) {
    console.warn('retryManager取得失敗:', e.message);
  }

  try {
    if (container.has('taskExecutor')) {
      dependencies.taskExecutor = await container.get('taskExecutor');
    }
  } catch (e) {
    console.warn('taskExecutor取得失敗:', e.message);
  }

  return new TaskProcessorAdapter(dependencies);
}

export default TaskProcessorAdapter;