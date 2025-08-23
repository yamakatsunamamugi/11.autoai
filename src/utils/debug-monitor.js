/**
 * @fileoverview デバッグ監視ツール
 * 
 * リアルタイムでシステムの状態を監視し、問題の早期発見を支援するツール。
 * ウィンドウリソース、タスク状態、エラー発生状況を追跡する。
 */

import { WindowService } from '../services/window-service.js';

export class DebugMonitor {
  constructor() {
    this.isMonitoring = false;
    this.monitorInterval = null;
    this.errorLog = [];
    this.resourceLog = [];
    this.maxLogSize = 100;
    
    // 監視設定
    this.config = {
      intervalMs: 5000, // 5秒ごとに監視
      alertOnResourceExhaustion: true,
      alertOnErrorRate: true,
      errorRateThreshold: 5, // 5分間に5回以上のエラー
      logToConsole: true
    };
    
    // メトリクス
    this.metrics = {
      totalTasks: 0,
      completedTasks: 0,
      failedTasks: 0,
      averageTaskTime: 0,
      resourceUtilization: 0,
      errorRate: 0
    };
    
    console.log('[DebugMonitor] 初期化完了');
  }
  
  /**
   * 監視を開始
   */
  start() {
    if (this.isMonitoring) {
      console.warn('[DebugMonitor] 既に監視中です');
      return;
    }
    
    this.isMonitoring = true;
    console.log('[DebugMonitor] 監視開始');
    
    // 定期的な監視
    this.monitorInterval = setInterval(() => {
      this.performCheck();
    }, this.config.intervalMs);
    
    // 初回チェック
    this.performCheck();
  }
  
  /**
   * 監視を停止
   */
  stop() {
    if (!this.isMonitoring) {
      return;
    }
    
    this.isMonitoring = false;
    
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
    
    console.log('[DebugMonitor] 監視停止');
  }
  
  /**
   * 監視チェックを実行
   */
  performCheck() {
    const timestamp = new Date().toISOString();
    const status = this.collectSystemStatus();
    
    // リソース使用状況を記録
    this.resourceLog.push({
      timestamp,
      ...status.resources
    });
    
    // ログサイズ制限
    if (this.resourceLog.length > this.maxLogSize) {
      this.resourceLog.shift();
    }
    
    // アラートチェック
    this.checkAlerts(status);
    
    // コンソール出力
    if (this.config.logToConsole) {
      this.logStatus(status);
    }
    
    // メトリクス更新
    this.updateMetrics(status);
  }
  
  /**
   * システム状態を収集
   * @returns {Object} システム状態
   */
  collectSystemStatus() {
    const status = {
      timestamp: new Date().toISOString(),
      resources: {
        activeWindows: WindowService.activeWindows.size,
        usedPositions: Array.from(WindowService.windowPositions.keys()).sort(),
        availablePositions: this.getAvailablePositions()
      },
      errors: {
        recentCount: this.getRecentErrorCount(),
        lastError: this.errorLog[this.errorLog.length - 1] || null
      }
    };
    
    // StreamProcessorの状態も取得（利用可能な場合）
    if (globalThis.streamProcessor) {
      status.tasks = {
        queueSize: globalThis.streamProcessor.taskQueue?.size || 0,
        processing: globalThis.streamProcessor.activeWindows?.size || 0,
        completed: globalThis.streamProcessor.completedTasks?.size || 0
      };
    }
    
    // TaskQueueManagerの状態も取得（利用可能な場合）
    if (globalThis.taskQueueManager) {
      const stats = globalThis.taskQueueManager.getStats();
      status.queue = stats;
    }
    
    return status;
  }
  
  /**
   * 利用可能なポジションを取得
   * @returns {Array} 利用可能なポジション番号
   */
  getAvailablePositions() {
    const available = [];
    for (let i = 0; i < 4; i++) {
      if (!WindowService.windowPositions.has(i)) {
        available.push(i);
      }
    }
    return available;
  }
  
  /**
   * 最近のエラー数を取得
   * @returns {number} エラー数
   */
  getRecentErrorCount() {
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    return this.errorLog.filter(error => 
      new Date(error.timestamp).getTime() > fiveMinutesAgo
    ).length;
  }
  
  /**
   * アラートをチェック
   * @param {Object} status - システム状態
   */
  checkAlerts(status) {
    // リソース枯渇チェック
    if (this.config.alertOnResourceExhaustion) {
      if (status.resources.availablePositions.length === 0) {
        this.raiseAlert('RESOURCE_EXHAUSTION', 'すべてのウィンドウポジションが使用中です');
      }
    }
    
    // エラー率チェック
    if (this.config.alertOnErrorRate) {
      if (status.errors.recentCount >= this.config.errorRateThreshold) {
        this.raiseAlert('HIGH_ERROR_RATE', `エラー率が閾値を超えました: ${status.errors.recentCount}回/5分`);
      }
    }
    
    // デッドロック検出
    if (this.detectDeadlock()) {
      this.raiseAlert('DEADLOCK', 'デッドロックの可能性を検出しました');
    }
  }
  
  /**
   * デッドロックを検出
   * @returns {boolean} デッドロックの可能性があるか
   */
  detectDeadlock() {
    // 10回連続で同じリソース状態が続いている場合はデッドロックの可能性
    if (this.resourceLog.length < 10) {
      return false;
    }
    
    const last10 = this.resourceLog.slice(-10);
    const firstState = JSON.stringify(last10[0]);
    
    return last10.every(log => 
      JSON.stringify({
        activeWindows: log.activeWindows,
        usedPositions: log.usedPositions
      }) === firstState
    );
  }
  
  /**
   * アラートを発生
   * @param {string} type - アラートタイプ
   * @param {string} message - メッセージ
   */
  raiseAlert(type, message) {
    const alert = {
      type,
      message,
      timestamp: new Date().toISOString()
    };
    
    console.error(`[DebugMonitor] ⚠️ アラート: ${type} - ${message}`);
    
    // アラート履歴に追加
    this.errorLog.push(alert);
    
    // ログサイズ制限
    if (this.errorLog.length > this.maxLogSize) {
      this.errorLog.shift();
    }
  }
  
  /**
   * エラーを記録
   * @param {Error} error - エラーオブジェクト
   * @param {Object} context - コンテキスト情報
   */
  logError(error, context = {}) {
    const errorInfo = {
      message: error.message,
      stack: error.stack,
      context,
      timestamp: new Date().toISOString()
    };
    
    this.errorLog.push(errorInfo);
    
    // ログサイズ制限
    if (this.errorLog.length > this.maxLogSize) {
      this.errorLog.shift();
    }
    
    console.error('[DebugMonitor] エラー記録:', errorInfo);
  }
  
  /**
   * ステータスをログ出力
   * @param {Object} status - システム状態
   */
  logStatus(status) {
    console.log('[DebugMonitor] === システム状態 ===');
    console.log(`  時刻: ${status.timestamp}`);
    console.log(`  アクティブウィンドウ: ${status.resources.activeWindows}`);
    console.log(`  使用中ポジション: [${status.resources.usedPositions.join(', ')}]`);
    console.log(`  利用可能ポジション: [${status.resources.availablePositions.join(', ')}]`);
    
    if (status.tasks) {
      console.log(`  タスクキュー: ${status.tasks.queueSize}`);
      console.log(`  処理中タスク: ${status.tasks.processing}`);
      console.log(`  完了タスク: ${status.tasks.completed}`);
    }
    
    console.log(`  最近のエラー: ${status.errors.recentCount}回`);
    console.log('========================');
  }
  
  /**
   * メトリクスを更新
   * @param {Object} status - システム状態
   */
  updateMetrics(status) {
    this.metrics.resourceUtilization = (status.resources.activeWindows / 4) * 100;
    this.metrics.errorRate = status.errors.recentCount;
    
    if (status.tasks) {
      this.metrics.totalTasks = status.tasks.queueSize + 
                                status.tasks.processing + 
                                status.tasks.completed;
      this.metrics.completedTasks = status.tasks.completed;
    }
  }
  
  /**
   * メトリクスを取得
   * @returns {Object} メトリクス
   */
  getMetrics() {
    return { ...this.metrics };
  }
  
  /**
   * レポートを生成
   * @returns {string} レポート文字列
   */
  generateReport() {
    const status = this.collectSystemStatus();
    const metrics = this.getMetrics();
    
    let report = '=== デバッグレポート ===\n';
    report += `生成時刻: ${new Date().toISOString()}\n\n`;
    
    report += '【リソース状態】\n';
    report += `  アクティブウィンドウ: ${status.resources.activeWindows}/4\n`;
    report += `  リソース使用率: ${metrics.resourceUtilization.toFixed(1)}%\n`;
    report += `  使用中ポジション: [${status.resources.usedPositions.join(', ')}]\n\n`;
    
    report += '【タスク状態】\n';
    report += `  総タスク数: ${metrics.totalTasks}\n`;
    report += `  完了タスク: ${metrics.completedTasks}\n`;
    report += `  失敗タスク: ${metrics.failedTasks}\n\n`;
    
    report += '【エラー状態】\n';
    report += `  エラー率: ${metrics.errorRate}回/5分\n`;
    
    if (status.errors.lastError) {
      report += `  最終エラー: ${status.errors.lastError.message}\n`;
      report += `  発生時刻: ${status.errors.lastError.timestamp}\n`;
    }
    
    report += '\n【推奨事項】\n';
    
    if (metrics.resourceUtilization > 75) {
      report += '  - リソース使用率が高いです。タスクの並列度を下げることを検討してください。\n';
    }
    
    if (metrics.errorRate > 3) {
      report += '  - エラー率が高いです。エラーログを確認してください。\n';
    }
    
    if (this.detectDeadlock()) {
      report += '  - デッドロックの可能性があります。ウィンドウを手動でクリアしてください。\n';
    }
    
    report += '========================\n';
    
    return report;
  }
  
  /**
   * リソースをクリア（緊急時用）
   */
  async clearResources() {
    console.warn('[DebugMonitor] 緊急リソースクリアを実行');
    
    // すべてのウィンドウを閉じる
    await WindowService.closeAllWindows();
    
    // ポジション情報をクリア
    WindowService.clearAllPositions();
    
    // エラーログをクリア
    this.errorLog = [];
    this.resourceLog = [];
    
    console.log('[DebugMonitor] リソースクリア完了');
  }
}

// シングルトンインスタンス
export const debugMonitor = new DebugMonitor();

// グローバルに登録（デバッグ用）
if (typeof globalThis !== 'undefined') {
  globalThis.debugMonitor = debugMonitor;
}

export default DebugMonitor;