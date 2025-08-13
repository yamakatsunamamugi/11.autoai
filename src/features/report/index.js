// index.js - レポート機能のエントリーポイント

// コアモジュール
export { ReportTaskFactory } from './report-task-factory.js';
export { ReportExecutor } from './report-executor.js';
export { ReportConfig, getReportConfig, resetReportConfig } from './report-config.js';

// 管理モジュール
export { ReportManager } from './report-manager.js';
export { ReportGenerator } from './report-generator.js';
export { ReportDeleter } from './report-deleter.js';

// デフォルトエクスポート
import { ReportTaskFactory } from './report-task-factory.js';
import { ReportExecutor } from './report-executor.js';
import { ReportConfig, getReportConfig } from './report-config.js';
import { ReportManager } from './report-manager.js';

/**
 * レポート機能の統合インターフェース
 */
export class ReportService {
  constructor(config = {}) {
    // 設定の初期化
    this.config = getReportConfig(config);
    
    // 各コンポーネントの初期化
    this.taskFactory = new ReportTaskFactory({
      defaultAIType: this.config.get('defaultAIType'),
      defaultPrompt: this.config.get('defaultPrompt')
    });
    
    this.executor = new ReportExecutor({
      retryAttempts: this.config.get('execution.retryAttempts'),
      retryDelay: this.config.get('execution.retryDelay'),
      logger: this.getLogger()
    });
    
    this.manager = new ReportManager({
      logger: this.getLogger(),
      testMode: this.config.get('logging.level') === 'debug'
    });
  }

  /**
   * レポートタスクを作成
   */
  createTask(params, spreadsheetData) {
    return this.taskFactory.createTask(params, spreadsheetData);
  }

  /**
   * レポートタスクを実行
   */
  async executeTask(task, spreadsheetData) {
    return this.executor.executeTask(task, spreadsheetData);
  }

  /**
   * 複数のレポートタスクをバッチ実行
   */
  async executeBatch(tasks, spreadsheetData) {
    const options = {
      parallel: this.config.get('execution.parallel'),
      maxConcurrent: this.config.get('execution.maxConcurrent'),
      delay: this.config.get('execution.executionDelay')
    };
    
    return this.executor.executeBatch(tasks, spreadsheetData, options);
  }

  /**
   * スプレッドシート全体のレポートを生成
   */
  async generateReports(spreadsheetId, gid) {
    return this.manager.generateReports(spreadsheetId, gid);
  }

  /**
   * レポートを削除
   */
  async deleteReports(documentIds = null, options = {}) {
    return this.manager.deleteReports(documentIds, options);
  }

  /**
   * レポート列をクリア
   */
  async clearReportColumn(spreadsheetId, gid) {
    return this.manager.clearReportColumn(spreadsheetId, gid);
  }

  /**
   * 設定を更新
   */
  updateConfig(path, value) {
    this.config.set(path, value);
  }

  /**
   * 設定を取得
   */
  getConfig(path) {
    return path ? this.config.get(path) : this.config.export();
  }

  /**
   * ロガーを取得
   */
  getLogger() {
    const level = this.config.get('logging.level');
    const enabled = this.config.get('logging.enabled');
    
    if (!enabled) {
      // ログ無効化時はダミーロガーを返す
      return {
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
        log: () => {}
      };
    }
    
    // レベルに応じたロガーを返す
    const levels = ['debug', 'info', 'warn', 'error'];
    const currentLevelIndex = levels.indexOf(level);
    
    return {
      debug: currentLevelIndex <= 0 ? console.log.bind(console, '[DEBUG]') : () => {},
      info: currentLevelIndex <= 1 ? console.log.bind(console, '[INFO]') : () => {},
      warn: currentLevelIndex <= 2 ? console.warn.bind(console, '[WARN]') : () => {},
      error: currentLevelIndex <= 3 ? console.error.bind(console, '[ERROR]') : () => {},
      log: console.log.bind(console)
    };
  }

  /**
   * サービスの状態を取得
   */
  getStatus() {
    return {
      configSummary: this.config.getSummary(),
      generatedDocuments: this.manager.getGeneratedDocumentIds(),
      isEnabled: this.config.get('enabled')
    };
  }

  /**
   * サービスをリセット
   */
  reset() {
    this.config.reset();
    this.manager.clearGeneratedIds();
  }
}

// デフォルトエクスポート
export default ReportService;