// test-spreadsheet.js - プロフェッショナルスプレッドシート読み込みテストツール

import TaskGenerator from '../src/features/task/generator.js';
import SpreadsheetAutoSetup from '../src/services/spreadsheet-auto-setup.js';
import { SimpleColumnControl } from '../src/features/task/column-control-simple.js';
import TestDebugger from './test-debugger.js';
import TestVisualizer from './test-visualizer.js';
import TestDiagnostics from './test-diagnostics.js';

class SpreadsheetTestTool {
  constructor() {
    this.currentData = null;
    this.currentTasks = null;
    this.executionMode = 'normal'; // normal, step, auto
    this.stepPaused = false;
    this.breakpoints = new Set();
    this.executionHistory = [];
    this.performanceData = [];
    this.startTime = null;
    this.savedUrls = this.loadSavedUrls();
    
    // モジュール
    this.debugger = new TestDebugger(this);
    this.visualizer = new TestVisualizer(this);
    this.diagnostics = new TestDiagnostics(this);
    
    // ログシステム
    this.logs = [];
    this.logFilters = {
      DEBUG: true,
      INFO: true,
      WARNING: true,
      ERROR: true,
      SUCCESS: true
    };
    
    this.initializeDOM();
    this.setupEventListeners();
    this.setupKeyboardShortcuts();
    this.initializeTheme();
  }
  
  initializeDOM() {
    // 主要なDOM要素の参照を保存
    this.dom = {
      // コントロール
      urlInput: document.getElementById('spreadsheetUrl'),
      loadBtn: document.getElementById('loadBtn'),
      stepModeBtn: document.getElementById('stepModeBtn'),
      autoRunBtn: document.getElementById('autoRunBtn'),
      stopBtn: document.getElementById('stopBtn'),
      
      // ステータス
      statusIndicator: document.getElementById('statusIndicator'),
      statusText: document.querySelector('.status-text'),
      progressBar: document.querySelector('.progress-fill'),
      statusBarText: document.getElementById('statusText'),
      progressText: document.getElementById('progressText'),
      memoryStatus: document.getElementById('memoryStatus'),
      timeStatus: document.getElementById('timeStatus'),
      
      // タブ
      tabButtons: document.querySelectorAll('.tab-btn'),
      tabContents: document.querySelectorAll('.tab-content'),
      
      // 統計
      totalRows: document.getElementById('totalRows'),
      workRows: document.getElementById('workRows'),
      aiColumns: document.getElementById('aiColumns'),
      totalTasks: document.getElementById('totalTasks'),
      
      // その他
      detailPanel: document.querySelector('.detail-panel'),
      panelToggle: document.getElementById('panelToggle'),
      themeToggle: document.getElementById('themeToggle'),
      helpBtn: document.getElementById('helpBtn'),
      
      // モーダル
      savedUrlsModal: document.getElementById('savedUrlsModal'),
      helpModal: document.getElementById('helpModal'),
      
      // ログ
      logsViewer: document.getElementById('logsViewer'),
      logSearch: document.getElementById('logSearch'),
      clearLogsBtn: document.getElementById('clearLogsBtn'),
      exportLogsBtn: document.getElementById('exportLogsBtn')
    };
  }
  
  setupEventListeners() {
    // メインコントロール
    this.dom.loadBtn.addEventListener('click', () => this.handleLoad());
    this.dom.stepModeBtn.addEventListener('click', () => this.startStepMode());
    this.dom.autoRunBtn.addEventListener('click', () => this.startAutoMode());
    this.dom.stopBtn.addEventListener('click', () => this.stopExecution());
    
    // タブ切り替え
    this.dom.tabButtons.forEach(btn => {
      btn.addEventListener('click', (e) => this.switchTab(e.target.dataset.tab));
    });
    
    // パネルトグル
    this.dom.panelToggle.addEventListener('click', () => {
      this.dom.detailPanel.classList.toggle('collapsed');
      this.dom.panelToggle.textContent = 
        this.dom.detailPanel.classList.contains('collapsed') ? '▶' : '◀';
    });
    
    // テーマトグル
    this.dom.themeToggle.addEventListener('click', () => this.toggleTheme());
    
    // ヘルプ
    this.dom.helpBtn.addEventListener('click', () => {
      this.dom.helpModal.classList.add('show');
    });
    
    // モーダルクローズ
    document.getElementById('closeHelp').addEventListener('click', () => {
      this.dom.helpModal.classList.remove('show');
    });
    
    document.getElementById('closeSavedUrls').addEventListener('click', () => {
      this.dom.savedUrlsModal.classList.remove('show');
    });
    
    // 保存済みURL
    document.getElementById('savedUrlsBtn').addEventListener('click', () => {
      this.showSavedUrls();
    });
    
    document.getElementById('saveCurrentUrl').addEventListener('click', () => {
      this.saveCurrentUrl();
    });
    
    // ログ関連
    this.dom.clearLogsBtn.addEventListener('click', () => this.clearLogs());
    this.dom.exportLogsBtn.addEventListener('click', () => this.exportLogs());
    
    // ログフィルター
    ['logDebug', 'logInfo', 'logWarning', 'logError'].forEach(id => {
      const checkbox = document.getElementById(id);
      if (checkbox) {
        checkbox.addEventListener('change', (e) => {
          const level = id.replace('log', '').toUpperCase();
          this.logFilters[level] = e.target.checked;
          this.renderLogs();
        });
      }
    });
    
    // ログ検索
    this.dom.logSearch.addEventListener('input', () => this.renderLogs());
    
    // デバッグコントロール
    document.getElementById('nextStepBtn')?.addEventListener('click', () => {
      this.stepPaused = false;
    });
    
    document.getElementById('skipStepBtn')?.addEventListener('click', () => {
      this.skipCurrentStep();
    });
    
    document.getElementById('continueBtn')?.addEventListener('click', () => {
      this.executionMode = 'normal';
      this.stepPaused = false;
    });
    
    // タスクフィルター
    document.getElementById('taskFilterAI')?.addEventListener('change', () => {
      this.renderTasks();
    });
    
    document.getElementById('taskFilterStatus')?.addEventListener('change', () => {
      this.renderTasks();
    });
    
    // エクスポート
    document.getElementById('exportTasksBtn')?.addEventListener('click', () => {
      this.exportTasks();
    });
  }
  
  setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      // Ctrl+L: URLフィールドにフォーカス
      if (e.ctrlKey && e.key === 'l') {
        e.preventDefault();
        this.dom.urlInput.focus();
        this.dom.urlInput.select();
      }
      
      // Ctrl+Enter: 読み込み実行
      if (e.ctrlKey && e.key === 'Enter') {
        e.preventDefault();
        this.handleLoad();
      }
      
      // F5: ステップ実行
      if (e.key === 'F5') {
        e.preventDefault();
        if (this.executionMode === 'step') {
          this.stepPaused = false;
        } else {
          this.startStepMode();
        }
      }
      
      // F8: 続行
      if (e.key === 'F8') {
        e.preventDefault();
        this.executionMode = 'normal';
        this.stepPaused = false;
      }
      
      // F9: ブレークポイント設定
      if (e.key === 'F9') {
        e.preventDefault();
        this.toggleBreakpoint();
      }
      
      // Ctrl+K: ログクリア
      if (e.ctrlKey && e.key === 'k') {
        e.preventDefault();
        this.clearLogs();
      }
      
      // Ctrl+S: 結果を保存
      if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        this.saveResults();
      }
    });
  }
  
  initializeTheme() {
    const savedTheme = localStorage.getItem('testToolTheme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    this.dom.themeToggle.textContent = savedTheme === 'dark' ? '☀️' : '🌙';
  }
  
  toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('testToolTheme', newTheme);
    this.dom.themeToggle.textContent = newTheme === 'dark' ? '☀️' : '🌙';
  }
  
  // ログ管理
  log(message, level = 'INFO', data = null) {
    const entry = {
      timestamp: new Date(),
      level,
      message,
      data
    };
    
    this.logs.push(entry);
    this.renderLogs();
    
    // コンソールにも出力
    const consoleMethod = level === 'ERROR' ? 'error' : 
                          level === 'WARNING' ? 'warn' : 'log';
    console[consoleMethod](`[${level}] ${message}`, data || '');
  }
  
  renderLogs() {
    const searchTerm = this.dom.logSearch.value.toLowerCase();
    
    const filteredLogs = this.logs.filter(log => {
      if (!this.logFilters[log.level]) return false;
      if (searchTerm && !log.message.toLowerCase().includes(searchTerm)) return false;
      return true;
    });
    
    const html = filteredLogs.map(log => {
      const time = log.timestamp.toLocaleTimeString('ja-JP');
      return `
        <div class="log-entry">
          <span class="log-timestamp">${time}</span>
          <span class="log-level ${log.level}">${log.level}</span>
          <span class="log-message">${this.escapeHtml(log.message)}</span>
        </div>
      `;
    }).join('');
    
    this.dom.logsViewer.innerHTML = html;
    this.dom.logsViewer.scrollTop = this.dom.logsViewer.scrollHeight;
  }
  
  clearLogs() {
    this.logs = [];
    this.renderLogs();
    this.log('ログをクリアしました', 'INFO');
  }
  
  exportLogs() {
    const data = JSON.stringify(this.logs, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `test-logs-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    this.log('ログをエクスポートしました', 'SUCCESS');
  }
  
  // メイン処理
  async handleLoad() {
    const url = this.dom.urlInput.value.trim();
    
    if (!url) {
      this.log('スプレッドシートURLを入力してください', 'ERROR');
      return;
    }
    
    // URLパース
    const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (!match) {
      this.log('有効なスプレッドシートURLではありません', 'ERROR');
      return;
    }
    
    const spreadsheetId = match[1];
    const gidMatch = url.match(/[#&]gid=(\d+)/);
    const gid = gidMatch ? gidMatch[1] : null;
    
    this.log('=== スプレッドシート読み込み開始 ===', 'INFO');
    this.log(`スプレッドシートID: ${spreadsheetId}`, 'INFO');
    this.log(`GID: ${gid || 'なし'}`, 'INFO');
    
    this.setStatus('loading', 'スプレッドシートを読み込み中...');
    this.startPerformanceTracking();
    
    try {
      // ステップ1: データ読み込み
      await this.executeStep('データ読み込み', async () => {
        this.log('SheetsClient.loadAutoAIData呼び出し...', 'DEBUG');
        const sheetsClient = globalThis.sheetsClient || new SheetsClient();
        this.currentData = await sheetsClient.loadAutoAIData(spreadsheetId, gid);
        
        // columnMappingからaiColumnsオブジェクトを生成（本番と同じロジック）
        const aiColumns = {};
        for (const [colIndex, mapping] of Object.entries(this.currentData.columnMapping || {})) {
          if (mapping.type === 'ai') {
            const columnLetter = String.fromCharCode(65 + parseInt(colIndex));
            aiColumns[columnLetter] = mapping;
          }
        }
        this.currentData.aiColumns = aiColumns;
        
        // 表示用にrawDataをvaluesとしても設定
        this.currentData.values = this.currentData.rawData;
        
        this.log(`データ読み込み完了: ${this.currentData?.rawData?.length || 0}行`, 'SUCCESS');
        this.log(`AI列検出: ${Object.keys(aiColumns).length}列`, 'INFO');
      });
      
      // ステップ2: 自動セットアップ
      await this.executeStep('自動セットアップ', async () => {
        this.log('SpreadsheetAutoSetup実行...', 'DEBUG');
        const autoSetup = new SpreadsheetAutoSetup();
        const token = await globalThis.authService.getAuthToken();
        await autoSetup.executeAutoSetup(spreadsheetId, token, gid);
        this.log('自動セットアップ完了', 'SUCCESS');
      });
      
      // ステップ3: データ処理（本番では不要）
      // 本番ではloadAutoAIDataですべての処理が完了している
      
      // ステップ4: 制御情報収集（本番ではタスク生成時に実行）
      // 本番ではTaskGenerator内で自動的に実行される
      
      // ステップ3: タスク生成
      await this.executeStep('タスク生成', async () => {
        this.log('TaskGenerator.generateTasks実行...', 'DEBUG');
        const taskGenerator = new TaskGenerator();
        this.currentTasks = taskGenerator.generateTasks(this.currentData);
        this.log(`タスク生成完了: ${this.currentTasks?.tasks?.length || 0}件`, 'SUCCESS');
      });
      
      // 結果表示
      this.displayResults();
      this.setStatus('success', '読み込み完了');
      this.log('=== スプレッドシート読み込み完了 ===', 'SUCCESS');
      
    } catch (error) {
      this.log(`エラー: ${error.message}`, 'ERROR', error);
      this.setStatus('error', `エラー: ${error.message}`);
      this.diagnostics.analyzeError(error);
    } finally {
      this.stopPerformanceTracking();
    }
  }
  
  async executeStep(stepName, callback) {
    const stepStartTime = performance.now();
    
    // ブレークポイントチェック
    if (this.breakpoints.has(stepName)) {
      this.log(`ブレークポイント: ${stepName}`, 'WARNING');
      this.stepPaused = true;
      this.executionMode = 'step';
    }
    
    // ステップモードでの一時停止
    if (this.executionMode === 'step') {
      this.log(`ステップ実行: ${stepName}`, 'INFO');
      this.updateCurrentStepInfo(stepName);
      this.stepPaused = true;
      
      // 一時停止を待つ
      while (this.stepPaused) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    // 実行
    try {
      await callback();
      
      const stepEndTime = performance.now();
      const duration = stepEndTime - stepStartTime;
      
      this.performanceData.push({
        step: stepName,
        duration,
        success: true
      });
      
      this.executionHistory.push({
        step: stepName,
        timestamp: new Date(),
        duration,
        success: true
      });
      
    } catch (error) {
      const stepEndTime = performance.now();
      const duration = stepEndTime - stepStartTime;
      
      this.performanceData.push({
        step: stepName,
        duration,
        success: false,
        error: error.message
      });
      
      this.executionHistory.push({
        step: stepName,
        timestamp: new Date(),
        duration,
        success: false,
        error: error.message
      });
      
      throw error;
    }
  }
  
  // processSpreadsheetData関数は削除 - 本番ではloadAutoAIDataですべて処理される
  
  // 実行モード
  startStepMode() {
    this.executionMode = 'step';
    this.stepPaused = false;
    this.log('ステップ実行モード開始', 'INFO');
    this.handleLoad();
  }
  
  startAutoMode() {
    this.executionMode = 'auto';
    this.stepPaused = false;
    this.log('自動実行モード開始', 'INFO');
    this.handleLoad();
  }
  
  stopExecution() {
    this.executionMode = 'normal';
    this.stepPaused = false;
    this.log('実行を停止しました', 'WARNING');
    this.setStatus('idle', '停止');
  }
  
  skipCurrentStep() {
    this.stepPaused = false;
    this.log('現在のステップをスキップ', 'WARNING');
  }
  
  // 表示更新
  displayResults() {
    // 統計更新（本番のデータ構造に合わせて修正）
    this.dom.totalRows.textContent = this.currentData?.rawData?.length || '-';
    this.dom.workRows.textContent = this.currentData?.workRows?.length || '-';
    this.dom.aiColumns.textContent = Object.keys(this.currentData?.aiColumns || {}).length || '-';
    this.dom.totalTasks.textContent = this.currentTasks?.tasks?.length || '-';
    
    // 各モジュールの表示更新
    this.visualizer.renderStructure(this.currentData);
    this.visualizer.renderControls(this.currentData);
    this.renderTasks();
    this.renderPerformance();
    this.renderTimeline();
  }
  
  renderTasks() {
    if (!this.currentTasks) return;
    
    const container = document.getElementById('tasksTableContainer');
    const filterAI = document.getElementById('taskFilterAI').value;
    const filterStatus = document.getElementById('taskFilterStatus').value;
    
    let tasks = this.currentTasks.tasks;
    
    // フィルタリング
    if (filterAI) {
      tasks = tasks.filter(t => t.aiType === filterAI);
    }
    if (filterStatus === 'executable') {
      tasks = tasks.filter(t => t.isExecutable());
    } else if (filterStatus === 'skipped') {
      tasks = tasks.filter(t => !t.isExecutable());
    }
    
    // テーブル生成
    const html = `
      <table class="spreadsheet-table">
        <thead>
          <tr>
            <th>行</th>
            <th>AI</th>
            <th>プロンプト列</th>
            <th>回答列</th>
            <th>プロンプト</th>
            <th>状態</th>
          </tr>
        </thead>
        <tbody>
          ${tasks.map(task => `
            <tr class="${!task.isExecutable() ? 'task-skipped' : ''}">
              <td>${task.row}</td>
              <td><span class="ai-badge ai-${task.aiType}">${task.aiType.toUpperCase()}</span></td>
              <td>${task.promptColumn || '-'}</td>
              <td>${task.column}</td>
              <td class="prompt-preview">${this.escapeHtml(task.prompt?.substring(0, 100) || '-')}</td>
              <td>${task.skipReason || '実行可能'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
    
    container.innerHTML = html;
  }
  
  renderPerformance() {
    const container = document.getElementById('performanceTable');
    if (!container) return;
    
    const totalTime = this.performanceData.reduce((sum, d) => sum + d.duration, 0);
    document.getElementById('totalExecutionTime').textContent = `${totalTime.toFixed(2)}ms`;
    
    const html = `
      <thead>
        <tr>
          <th>ステップ</th>
          <th>時間</th>
          <th>割合</th>
          <th>状態</th>
        </tr>
      </thead>
      <tbody>
        ${this.performanceData.map(data => `
          <tr>
            <td>${data.step}</td>
            <td>${data.duration.toFixed(2)}ms</td>
            <td>${((data.duration / totalTime) * 100).toFixed(1)}%</td>
            <td>${data.success ? '✅' : '❌'}</td>
          </tr>
        `).join('')}
      </tbody>
    `;
    
    container.innerHTML = html;
  }
  
  renderTimeline() {
    const container = document.getElementById('timelineContainer');
    if (!container) return;
    
    const html = this.executionHistory.map(entry => `
      <div class="timeline-entry">
        <span class="timeline-time">${entry.timestamp.toLocaleTimeString()}</span>
        <span class="timeline-step">${entry.step}</span>
        <span class="timeline-duration">${entry.duration.toFixed(0)}ms</span>
        ${entry.success ? '✅' : '❌'}
      </div>
    `).join('');
    
    container.innerHTML = html;
  }
  
  // ステータス管理
  setStatus(type, message) {
    this.dom.statusText.textContent = message;
    this.dom.statusBarText.textContent = message;
    
    const dot = this.dom.statusIndicator.querySelector('.status-dot');
    dot.className = 'status-dot';
    
    if (type === 'loading') {
      dot.classList.add('active');
    } else if (type === 'error') {
      dot.classList.add('error');
    } else if (type === 'success') {
      dot.classList.add('active');
    }
  }
  
  updateCurrentStepInfo(stepName) {
    const info = document.getElementById('currentStepInfo');
    if (info) {
      info.innerHTML = `
        <div class="step-info">
          <strong>実行中:</strong> ${stepName}<br>
          <small>F5: 次へ進む / F8: 自動実行に切り替え</small>
        </div>
      `;
    }
  }
  
  // パフォーマンス追跡
  startPerformanceTracking() {
    this.startTime = performance.now();
    this.performanceData = [];
    
    // メモリ使用量の追跡
    if (performance.memory) {
      this.initialMemory = performance.memory.usedJSHeapSize;
    }
    
    // タイマー更新
    this.performanceInterval = setInterval(() => {
      const elapsed = ((performance.now() - this.startTime) / 1000).toFixed(1);
      this.dom.timeStatus.textContent = `経過時間: ${elapsed}s`;
      
      if (performance.memory) {
        const memUsed = ((performance.memory.usedJSHeapSize - this.initialMemory) / 1048576).toFixed(1);
        this.dom.memoryStatus.textContent = `メモリ: +${memUsed}MB`;
      }
    }, 100);
  }
  
  stopPerformanceTracking() {
    if (this.performanceInterval) {
      clearInterval(this.performanceInterval);
    }
  }
  
  // タブ切り替え
  switchTab(tabName) {
    this.dom.tabButtons.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabName);
    });
    
    this.dom.tabContents.forEach(content => {
      const isTarget = content.id === `${tabName}-tab`;
      content.classList.toggle('active', isTarget);
    });
    
    this.log(`タブ切り替え: ${tabName}`, 'DEBUG');
  }
  
  // URL管理
  loadSavedUrls() {
    const saved = localStorage.getItem('testToolSavedUrls');
    return saved ? JSON.parse(saved) : [];
  }
  
  showSavedUrls() {
    const list = document.getElementById('savedUrlsList');
    
    if (this.savedUrls.length === 0) {
      list.innerHTML = '<p>保存されたURLはありません</p>';
    } else {
      list.innerHTML = this.savedUrls.map((item, index) => `
        <div class="saved-url-item" data-index="${index}">
          <div class="saved-url-name">${item.name}</div>
          <div class="saved-url-value">${item.url}</div>
        </div>
      `).join('');
      
      // クリックイベント
      list.querySelectorAll('.saved-url-item').forEach(item => {
        item.addEventListener('click', () => {
          const index = parseInt(item.dataset.index);
          this.dom.urlInput.value = this.savedUrls[index].url;
          this.dom.savedUrlsModal.classList.remove('show');
        });
      });
    }
    
    this.dom.savedUrlsModal.classList.add('show');
  }
  
  saveCurrentUrl() {
    const name = document.getElementById('newUrlName').value.trim();
    const url = this.dom.urlInput.value.trim();
    
    if (!name || !url) {
      this.log('名前とURLを入力してください', 'ERROR');
      return;
    }
    
    this.savedUrls.push({ name, url });
    localStorage.setItem('testToolSavedUrls', JSON.stringify(this.savedUrls));
    
    document.getElementById('newUrlName').value = '';
    this.dom.savedUrlsModal.classList.remove('show');
    this.log(`URL保存: ${name}`, 'SUCCESS');
  }
  
  // エクスポート
  exportTasks() {
    if (!this.currentTasks) {
      this.log('エクスポートするタスクがありません', 'ERROR');
      return;
    }
    
    const data = {
      timestamp: new Date().toISOString(),
      url: this.dom.urlInput.value,
      statistics: this.currentTasks.getStatistics(),
      tasks: this.currentTasks.tasks.map(t => ({
        row: t.row,
        column: t.column,
        aiType: t.aiType,
        prompt: t.prompt,
        executable: t.isExecutable(),
        skipReason: t.skipReason
      }))
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tasks-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    this.log('タスクをエクスポートしました', 'SUCCESS');
  }
  
  saveResults() {
    const results = {
      timestamp: new Date().toISOString(),
      url: this.dom.urlInput.value,
      data: this.currentData,
      tasks: this.currentTasks,
      performance: this.performanceData,
      executionHistory: this.executionHistory
    };
    
    const blob = new Blob([JSON.stringify(results, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `test-results-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    this.log('テスト結果を保存しました', 'SUCCESS');
  }
  
  // ユーティリティ
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
  
  // ブレークポイント管理
  toggleBreakpoint() {
    // 実装予定: 現在のステップにブレークポイントを設定
    this.log('ブレークポイント機能は実装予定です', 'INFO');
  }
}

// 初期化
document.addEventListener('DOMContentLoaded', () => {
  window.testTool = new SpreadsheetTestTool();
  console.log('スプレッドシート読み込みテストツール起動');
});

export default SpreadsheetTestTool;