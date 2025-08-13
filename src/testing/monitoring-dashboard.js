/**
 * @fileoverview テストモニタリングダッシュボード
 * 
 * テスト実行の監視、メトリクス表示、
 * リアルタイム更新機能を提供するダッシュボード。
 */

import { getLogger } from '../core/logging-system.js';
import { globalTestRunner } from './test-runner.js';

/**
 * ダッシュボードコンポーネント
 */
export class MonitoringDashboard {
  constructor(container, config = {}) {
    this.container = container;
    this.config = {
      updateInterval: 1000, // 1秒
      maxLogEntries: 100,
      enableRealtime: true,
      showCharts: true,
      autoRefresh: true,
      ...config
    };

    this.logger = getLogger('MonitoringDashboard');
    this.testRunner = globalTestRunner;
    
    // UI要素
    this.elements = {};
    
    // データ
    this.metrics = {
      testHistory: [],
      performanceData: [],
      errorHistory: []
    };
    
    // タイマー
    this.updateTimer = null;
    
    // チャート
    this.charts = {};
    
    this.isInitialized = false;
  }

  /**
   * ダッシュボードを初期化
   */
  async initialize() {
    if (this.isInitialized) return;

    try {
      // HTML構造を作成
      this._createDashboardHTML();
      
      // DOM要素を取得
      this._collectElements();
      
      // イベントリスナーを設定
      this._setupEventListeners();
      
      // テストランナーのイベントを監視
      this._setupTestRunnerListeners();
      
      // チャートを初期化
      if (this.config.showCharts) {
        this._initializeCharts();
      }
      
      // 初期データを表示
      this._updateDisplay();
      
      // 自動更新を開始
      if (this.config.autoRefresh) {
        this._startAutoUpdate();
      }
      
      this.isInitialized = true;
      this.logger.info('モニタリングダッシュボードが初期化されました');
      
    } catch (error) {
      this.logger.error('ダッシュボード初期化エラー', error);
      throw error;
    }
  }

  /**
   * ダッシュボードを破棄
   */
  destroy() {
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
      this.updateTimer = null;
    }

    // チャートを破棄
    Object.values(this.charts).forEach(chart => {
      if (chart && chart.destroy) {
        chart.destroy();
      }
    });

    this.isInitialized = false;
    this.logger.info('モニタリングダッシュボードが破棄されました');
  }

  /**
   * 表示を更新
   */
  async updateDisplay() {
    if (!this.isInitialized) return;

    try {
      const status = this.testRunner.getStatus();
      const detailedReport = this.testRunner.generateDetailedReport();
      
      // 基本統計を更新
      this._updateBasicStats(status);
      
      // テスト一覧を更新
      this._updateTestList(detailedReport);
      
      // 実行ログを更新
      this._updateExecutionLog(detailedReport);
      
      // チャートを更新
      if (this.config.showCharts) {
        this._updateCharts(status, detailedReport);
      }
      
    } catch (error) {
      this.logger.error('表示更新エラー', error);
    }
  }

  /**
   * ダッシュボードHTML構造を作成
   * 
   * @private
   */
  _createDashboardHTML() {
    this.container.innerHTML = `
      <div class="monitoring-dashboard">
        <!-- ヘッダー -->
        <div class="dashboard-header">
          <h2>テストモニタリングダッシュボード</h2>
          <div class="dashboard-controls">
            <button id="refreshBtn" class="btn btn-secondary">
              <i class="icon-refresh"></i> 更新
            </button>
            <button id="clearBtn" class="btn btn-secondary">
              <i class="icon-clear"></i> クリア
            </button>
            <button id="exportBtn" class="btn btn-secondary">
              <i class="icon-download"></i> エクスポート
            </button>
            <label class="toggle-switch">
              <input type="checkbox" id="autoRefreshToggle" checked>
              <span>自動更新</span>
            </label>
          </div>
        </div>

        <!-- 統計概要 -->
        <div class="stats-overview">
          <div class="stat-card">
            <div class="stat-title">実行状態</div>
            <div class="stat-value" id="runnerState">待機中</div>
          </div>
          <div class="stat-card">
            <div class="stat-title">キュー</div>
            <div class="stat-value" id="queueCount">0</div>
          </div>
          <div class="stat-card">
            <div class="stat-title">実行中</div>
            <div class="stat-value" id="runningCount">0</div>
          </div>
          <div class="stat-card">
            <div class="stat-title">完了</div>
            <div class="stat-value" id="completedCount">0</div>
          </div>
          <div class="stat-card">
            <div class="stat-title">失敗</div>
            <div class="stat-value" id="failedCount">0</div>
          </div>
          <div class="stat-card">
            <div class="stat-title">成功率</div>
            <div class="stat-value" id="successRate">0%</div>
          </div>
        </div>

        <!-- メインコンテンツ -->
        <div class="dashboard-content">
          <!-- 左パネル -->
          <div class="left-panel">
            <!-- テスト一覧 -->
            <div class="panel">
              <div class="panel-header">
                <h3>テスト一覧</h3>
                <div class="panel-controls">
                  <select id="testFilter">
                    <option value="all">すべて</option>
                    <option value="running">実行中</option>
                    <option value="completed">完了</option>
                    <option value="failed">失敗</option>
                    <option value="queued">待機中</option>
                  </select>
                </div>
              </div>
              <div class="panel-content">
                <div id="testList" class="test-list"></div>
              </div>
            </div>

            <!-- 実行ログ -->
            <div class="panel">
              <div class="panel-header">
                <h3>実行ログ</h3>
                <div class="panel-controls">
                  <button id="clearLogBtn" class="btn btn-sm">クリア</button>
                </div>
              </div>
              <div class="panel-content">
                <div id="executionLog" class="execution-log"></div>
              </div>
            </div>
          </div>

          <!-- 右パネル -->
          <div class="right-panel">
            <!-- パフォーマンスチャート -->
            <div class="panel" id="performancePanel">
              <div class="panel-header">
                <h3>パフォーマンス</h3>
              </div>
              <div class="panel-content">
                <canvas id="performanceChart" width="400" height="200"></canvas>
              </div>
            </div>

            <!-- 成功率チャート -->
            <div class="panel" id="successRatePanel">
              <div class="panel-header">
                <h3>成功率推移</h3>
              </div>
              <div class="panel-content">
                <canvas id="successRateChart" width="400" height="200"></canvas>
              </div>
            </div>

            <!-- エラー統計 -->
            <div class="panel">
              <div class="panel-header">
                <h3>エラー統計</h3>
              </div>
              <div class="panel-content">
                <div id="errorStats" class="error-stats"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    // CSSスタイルを追加
    this._addDashboardStyles();
  }

  /**
   * DOM要素を取得
   * 
   * @private
   */
  _collectElements() {
    this.elements = {
      // コントロール
      refreshBtn: document.getElementById('refreshBtn'),
      clearBtn: document.getElementById('clearBtn'),
      exportBtn: document.getElementById('exportBtn'),
      autoRefreshToggle: document.getElementById('autoRefreshToggle'),
      testFilter: document.getElementById('testFilter'),
      clearLogBtn: document.getElementById('clearLogBtn'),
      
      // 統計
      runnerState: document.getElementById('runnerState'),
      queueCount: document.getElementById('queueCount'),
      runningCount: document.getElementById('runningCount'),
      completedCount: document.getElementById('completedCount'),
      failedCount: document.getElementById('failedCount'),
      successRate: document.getElementById('successRate'),
      
      // リスト・ログ
      testList: document.getElementById('testList'),
      executionLog: document.getElementById('executionLog'),
      errorStats: document.getElementById('errorStats'),
      
      // チャート
      performanceChart: document.getElementById('performanceChart'),
      successRateChart: document.getElementById('successRateChart')
    };
  }

  /**
   * イベントリスナーを設定
   * 
   * @private
   */
  _setupEventListeners() {
    // 更新ボタン
    this.elements.refreshBtn.addEventListener('click', () => {
      this.updateDisplay();
    });

    // クリアボタン
    this.elements.clearBtn.addEventListener('click', () => {
      this._clearData();
    });

    // エクスポートボタン
    this.elements.exportBtn.addEventListener('click', () => {
      this._exportData();
    });

    // 自動更新トグル
    this.elements.autoRefreshToggle.addEventListener('change', (e) => {
      if (e.target.checked) {
        this._startAutoUpdate();
      } else {
        this._stopAutoUpdate();
      }
    });

    // テストフィルター
    this.elements.testFilter.addEventListener('change', () => {
      this._updateTestList();
    });

    // ログクリアボタン
    this.elements.clearLogBtn.addEventListener('click', () => {
      this.elements.executionLog.innerHTML = '';
    });
  }

  /**
   * テストランナーのイベントリスナーを設定
   * 
   * @private
   */
  _setupTestRunnerListeners() {
    this.testRunner.on('runStarted', (data) => {
      this._addLogEntry('info', `テスト実行開始: ${data.testCount}個のテスト`);
    });

    this.testRunner.on('testStarted', (data) => {
      this._addLogEntry('info', `テスト開始: ${data.name} (${data.id})`);
    });

    this.testRunner.on('testCompleted', (data) => {
      this._addLogEntry('success', `テスト完了: ${data.name} (${data.duration}ms)`);
      this._recordMetrics('completed', data);
    });

    this.testRunner.on('testFailed', (data) => {
      this._addLogEntry('error', `テスト失敗: ${data.name} - ${data.error}`);
      this._recordMetrics('failed', data);
    });

    this.testRunner.on('runCompleted', (data) => {
      this._addLogEntry('success', 'テスト実行完了');
    });

    this.testRunner.on('progressReport', (data) => {
      this._updateBasicStats(data);
    });
  }

  /**
   * チャートを初期化
   * 
   * @private
   */
  _initializeCharts() {
    // Chart.jsが利用可能な場合のみ
    if (typeof Chart !== 'undefined') {
      this._initializePerformanceChart();
      this._initializeSuccessRateChart();
    } else {
      this.logger.warn('Chart.jsが利用できません。チャート表示は無効化されました。');
      this.config.showCharts = false;
    }
  }

  /**
   * パフォーマンスチャートを初期化
   * 
   * @private
   */
  _initializePerformanceChart() {
    const ctx = this.elements.performanceChart.getContext('2d');
    
    this.charts.performance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [{
          label: '実行時間 (ms)',
          data: [],
          borderColor: 'rgb(75, 192, 192)',
          backgroundColor: 'rgba(75, 192, 192, 0.2)',
          tension: 0.1
        }]
      },
      options: {
        responsive: true,
        scales: {
          y: {
            beginAtZero: true,
            title: {
              display: true,
              text: '実行時間 (ms)'
            }
          },
          x: {
            title: {
              display: true,
              text: '時間'
            }
          }
        }
      }
    });
  }

  /**
   * 成功率チャートを初期化
   * 
   * @private
   */
  _initializeSuccessRateChart() {
    const ctx = this.elements.successRateChart.getContext('2d');
    
    this.charts.successRate = new Chart(ctx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [{
          label: '成功率 (%)',
          data: [],
          borderColor: 'rgb(54, 162, 235)',
          backgroundColor: 'rgba(54, 162, 235, 0.2)',
          tension: 0.1
        }]
      },
      options: {
        responsive: true,
        scales: {
          y: {
            beginAtZero: true,
            max: 100,
            title: {
              display: true,
              text: '成功率 (%)'
            }
          },
          x: {
            title: {
              display: true,
              text: '時間'
            }
          }
        }
      }
    });
  }

  /**
   * 基本統計を更新
   * 
   * @param {Object} status - ステータス情報
   * @private
   */
  _updateBasicStats(status) {
    this.elements.runnerState.textContent = this._getStateDisplayName(status.state);
    this.elements.runnerState.className = `stat-value state-${status.state}`;
    
    this.elements.queueCount.textContent = status.queue;
    this.elements.runningCount.textContent = status.running;
    this.elements.completedCount.textContent = status.completed;
    this.elements.failedCount.textContent = status.failed;
    
    const total = status.completed + status.failed;
    const successRate = total > 0 ? Math.round((status.completed / total) * 100) : 0;
    this.elements.successRate.textContent = `${successRate}%`;
    this.elements.successRate.className = `stat-value ${successRate >= 80 ? 'success' : successRate >= 50 ? 'warning' : 'error'}`;
  }

  /**
   * テスト一覧を更新
   * 
   * @param {Object} report - 詳細レポート
   * @private
   */
  _updateTestList(report = null) {
    if (!report) {
      report = this.testRunner.generateDetailedReport();
    }

    const filter = this.elements.testFilter.value;
    const container = this.elements.testList;
    
    container.innerHTML = '';

    // フィルタリング
    let tests = [];
    
    switch (filter) {
      case 'running':
        tests = report.running.map(r => ({ ...r, status: 'running' }));
        break;
      case 'completed':
        tests = Object.values(report.completed).map(t => ({ ...t, status: 'completed' }));
        break;
      case 'failed':
        tests = Object.values(report.failed).map(t => ({ ...t, status: 'failed' }));
        break;
      case 'queued':
        tests = report.queue.map(q => ({ ...q, status: 'queued' }));
        break;
      default:
        tests = [
          ...report.running.map(r => ({ ...r, status: 'running' })),
          ...Object.values(report.completed).map(t => ({ ...t, status: 'completed' })),
          ...Object.values(report.failed).map(t => ({ ...t, status: 'failed' })),
          ...report.queue.map(q => ({ ...q, status: 'queued' }))
        ];
    }

    // テスト項目を作成
    tests.forEach(test => {
      const item = document.createElement('div');
      item.className = `test-item ${test.status}`;
      
      item.innerHTML = `
        <div class="test-name">${test.name || test.id}</div>
        <div class="test-status">${this._getStatusDisplayName(test.status)}</div>
        <div class="test-details">
          ${test.duration ? `<span class="duration">${test.duration}ms</span>` : ''}
          ${test.error ? `<span class="error" title="${test.error}">エラーあり</span>` : ''}
        </div>
      `;
      
      container.appendChild(item);
    });

    if (tests.length === 0) {
      container.innerHTML = '<div class="no-tests">該当するテストがありません</div>';
    }
  }

  /**
   * 実行ログを更新
   * 
   * @param {Object} report - 詳細レポート
   * @private
   */
  _updateExecutionLog(report) {
    // ログ項目数を制限
    const logEntries = this.elements.executionLog.children;
    while (logEntries.length > this.config.maxLogEntries) {
      this.elements.executionLog.removeChild(logEntries[0]);
    }
  }

  /**
   * ログエントリを追加
   * 
   * @param {string} level - ログレベル
   * @param {string} message - メッセージ
   * @private
   */
  _addLogEntry(level, message) {
    const entry = document.createElement('div');
    entry.className = `log-entry ${level}`;
    
    const timestamp = new Date().toLocaleTimeString();
    entry.innerHTML = `
      <span class="log-time">${timestamp}</span>
      <span class="log-level">${level.toUpperCase()}</span>
      <span class="log-message">${message}</span>
    `;
    
    this.elements.executionLog.appendChild(entry);
    this.elements.executionLog.scrollTop = this.elements.executionLog.scrollHeight;
  }

  /**
   * メトリクスを記録
   * 
   * @param {string} type - メトリクスタイプ
   * @param {Object} data - データ
   * @private
   */
  _recordMetrics(type, data) {
    const timestamp = Date.now();
    
    if (type === 'completed' || type === 'failed') {
      this.metrics.testHistory.push({
        timestamp,
        type,
        duration: data.duration,
        name: data.name
      });
      
      // 履歴サイズを制限
      if (this.metrics.testHistory.length > 100) {
        this.metrics.testHistory = this.metrics.testHistory.slice(-100);
      }
    }
  }

  /**
   * チャートを更新
   * 
   * @param {Object} status - ステータス
   * @param {Object} report - レポート
   * @private
   */
  _updateCharts(status, report) {
    if (!this.config.showCharts) return;

    this._updatePerformanceChart();
    this._updateSuccessRateChart(status);
  }

  /**
   * パフォーマンスチャートを更新
   * 
   * @private
   */
  _updatePerformanceChart() {
    if (!this.charts.performance) return;

    const chart = this.charts.performance;
    const recentHistory = this.metrics.testHistory.slice(-20); // 最新20件
    
    chart.data.labels = recentHistory.map(h => 
      new Date(h.timestamp).toLocaleTimeString()
    );
    chart.data.datasets[0].data = recentHistory.map(h => h.duration);
    
    chart.update('none');
  }

  /**
   * 成功率チャートを更新
   * 
   * @param {Object} status - ステータス
   * @private
   */
  _updateSuccessRateChart(status) {
    if (!this.charts.successRate) return;

    const chart = this.charts.successRate;
    const timestamp = new Date().toLocaleTimeString();
    
    const total = status.completed + status.failed;
    const successRate = total > 0 ? Math.round((status.completed / total) * 100) : 0;
    
    chart.data.labels.push(timestamp);
    chart.data.datasets[0].data.push(successRate);
    
    // データポイント数を制限
    if (chart.data.labels.length > 20) {
      chart.data.labels.shift();
      chart.data.datasets[0].data.shift();
    }
    
    chart.update('none');
  }

  /**
   * 自動更新を開始
   * 
   * @private
   */
  _startAutoUpdate() {
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
    }

    this.updateTimer = setInterval(() => {
      this.updateDisplay();
    }, this.config.updateInterval);
  }

  /**
   * 自動更新を停止
   * 
   * @private
   */
  _stopAutoUpdate() {
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
      this.updateTimer = null;
    }
  }

  /**
   * データをクリア
   * 
   * @private
   */
  _clearData() {
    this.metrics.testHistory = [];
    this.metrics.performanceData = [];
    this.metrics.errorHistory = [];
    
    this.elements.executionLog.innerHTML = '';
    
    // チャートをクリア
    if (this.charts.performance) {
      this.charts.performance.data.labels = [];
      this.charts.performance.data.datasets[0].data = [];
      this.charts.performance.update();
    }
    
    if (this.charts.successRate) {
      this.charts.successRate.data.labels = [];
      this.charts.successRate.data.datasets[0].data = [];
      this.charts.successRate.update();
    }
    
    this.logger.info('ダッシュボードデータをクリアしました');
  }

  /**
   * データをエクスポート
   * 
   * @private
   */
  _exportData() {
    const exportData = {
      timestamp: new Date().toISOString(),
      status: this.testRunner.getStatus(),
      report: this.testRunner.generateDetailedReport(),
      metrics: this.metrics
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { 
      type: 'application/json' 
    });
    
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `test-report-${Date.now()}.json`;
    a.click();
    
    URL.revokeObjectURL(url);
    this.logger.info('テストレポートをエクスポートしました');
  }

  /**
   * 状態表示名を取得
   * 
   * @param {string} state - 状態
   * @returns {string} 表示名
   * @private
   */
  _getStateDisplayName(state) {
    const stateNames = {
      idle: '待機中',
      running: '実行中',
      paused: '一時停止',
      stopping: '停止中',
      completed: '完了',
      error: 'エラー'
    };
    return stateNames[state] || state;
  }

  /**
   * ステータス表示名を取得
   * 
   * @param {string} status - ステータス
   * @returns {string} 表示名
   * @private
   */
  _getStatusDisplayName(status) {
    const statusNames = {
      running: '実行中',
      completed: '完了',
      failed: '失敗',
      queued: '待機中'
    };
    return statusNames[status] || status;
  }

  /**
   * ダッシュボードのCSSスタイルを追加
   * 
   * @private
   */
  _addDashboardStyles() {
    const style = document.createElement('style');
    style.textContent = `
      .monitoring-dashboard {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        background: #f5f5f5;
        min-height: 100vh;
        padding: 20px;
      }
      
      .dashboard-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        background: white;
        padding: 20px;
        border-radius: 8px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        margin-bottom: 20px;
      }
      
      .dashboard-controls {
        display: flex;
        gap: 10px;
        align-items: center;
      }
      
      .stats-overview {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
        gap: 15px;
        margin-bottom: 20px;
      }
      
      .stat-card {
        background: white;
        padding: 20px;
        border-radius: 8px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        text-align: center;
      }
      
      .stat-title {
        font-size: 14px;
        color: #666;
        margin-bottom: 8px;
      }
      
      .stat-value {
        font-size: 24px;
        font-weight: bold;
        color: #333;
      }
      
      .stat-value.state-running { color: #007bff; }
      .stat-value.state-completed { color: #28a745; }
      .stat-value.state-error { color: #dc3545; }
      .stat-value.success { color: #28a745; }
      .stat-value.warning { color: #ffc107; }
      .stat-value.error { color: #dc3545; }
      
      .dashboard-content {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 20px;
      }
      
      .panel {
        background: white;
        border-radius: 8px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        margin-bottom: 20px;
      }
      
      .panel-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 15px 20px;
        border-bottom: 1px solid #eee;
      }
      
      .panel-content {
        padding: 20px;
        max-height: 400px;
        overflow-y: auto;
      }
      
      .test-item {
        padding: 10px;
        border: 1px solid #eee;
        border-radius: 4px;
        margin-bottom: 8px;
      }
      
      .test-item.running {
        border-left: 4px solid #007bff;
        background: #f8f9fa;
      }
      
      .test-item.completed {
        border-left: 4px solid #28a745;
      }
      
      .test-item.failed {
        border-left: 4px solid #dc3545;
      }
      
      .test-item.queued {
        border-left: 4px solid #6c757d;
      }
      
      .log-entry {
        padding: 5px 0;
        border-bottom: 1px solid #f0f0f0;
        font-family: monospace;
        font-size: 12px;
      }
      
      .log-entry.error { color: #dc3545; }
      .log-entry.success { color: #28a745; }
      .log-entry.info { color: #333; }
      
      .btn {
        padding: 8px 16px;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 14px;
      }
      
      .btn-secondary {
        background: #6c757d;
        color: white;
      }
      
      .btn-sm {
        padding: 4px 8px;
        font-size: 12px;
      }
      
      .toggle-switch {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 14px;
      }
    `;
    
    document.head.appendChild(style);
  }
}

/**
 * グローバルダッシュボードインスタンス
 */
export let globalDashboard = null;

/**
 * ダッシュボードを初期化
 * 
 * @param {Element} container - コンテナ要素
 * @param {Object} config - 設定
 * @returns {MonitoringDashboard} ダッシュボードインスタンス
 */
export function initializeDashboard(container, config = {}) {
  if (globalDashboard) {
    globalDashboard.destroy();
  }
  
  globalDashboard = new MonitoringDashboard(container, config);
  return globalDashboard;
}