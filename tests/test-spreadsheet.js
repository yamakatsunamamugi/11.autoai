// test-spreadsheet.js - スプレッドシート読み込みテストツール

import TaskGenerator from '../src/features/task/generator.js';
import SimpleColumnControl from '../src/features/task/column-control-simple.js';

// グローバル変数
let currentSpreadsheetData = null;
let currentTaskList = null;
let currentControls = null;
let stepMode = false;
let autoRunMode = false;
let currentStep = 0;

// デバッグモード
const DEBUG = true;

// DOM要素
const elements = {
  spreadsheetUrl: null,
  loadBtn: null,
  stepModeBtn: null,
  autoRunBtn: null,
  stopBtn: null,
  statusIndicator: null,
  statusText: null,
  progressBar: null,
  progressFill: null,
  totalRows: null,
  workRows: null,
  aiColumns: null,
  totalTasks: null,
  logsViewer: null,
  spreadsheetTable: null,
  structureTree: null,
  tasksTableContainer: null,
  rowControlsContainer: null,
  columnControlsContainer: null
};

// 初期化
document.addEventListener('DOMContentLoaded', () => {
  console.log('🚀 スプレッドシート読み込みテストツール初期化');
  
  // DOM要素の取得
  initializeElements();
  
  // イベントリスナーの設定
  setupEventListeners();
  
  // タブナビゲーションの設定
  setupTabNavigation();
  
  // 初期状態の設定
  updateStatus('待機中', 'idle');
  
  // 保存済みURLから最後のURLを読み込み
  loadLastUsedUrl();
});

// DOM要素の初期化
function initializeElements() {
  elements.spreadsheetUrl = document.getElementById('spreadsheetUrl');
  elements.loadBtn = document.getElementById('loadBtn');
  elements.stepModeBtn = document.getElementById('stepModeBtn');
  elements.autoRunBtn = document.getElementById('autoRunBtn');
  elements.stopBtn = document.getElementById('stopBtn');
  elements.statusIndicator = document.getElementById('statusIndicator');
  elements.statusText = document.querySelector('.status-text');
  elements.progressBar = document.getElementById('progressBar');
  elements.progressFill = document.querySelector('.progress-fill');
  elements.totalRows = document.getElementById('totalRows');
  elements.workRows = document.getElementById('workRows');
  elements.aiColumns = document.getElementById('aiColumns');
  elements.totalTasks = document.getElementById('totalTasks');
  elements.logsViewer = document.getElementById('logsViewer');
  elements.spreadsheetTable = document.getElementById('spreadsheetTable');
  elements.structureTree = document.getElementById('structureTree');
  elements.tasksTableContainer = document.getElementById('tasksTableContainer');
  elements.rowControlsContainer = document.getElementById('rowControlsContainer');
  elements.columnControlsContainer = document.getElementById('columnControlsContainer');
}

// イベントリスナーの設定
function setupEventListeners() {
  // 読み込みボタン
  elements.loadBtn.addEventListener('click', handleLoad);
  
  // ステップ実行ボタン
  elements.stepModeBtn.addEventListener('click', handleStepMode);
  
  // 自動実行ボタン
  elements.autoRunBtn.addEventListener('click', handleAutoRun);
  
  // 停止ボタン
  elements.stopBtn.addEventListener('click', handleStop);
  
  // 保存済みURLボタン
  const savedUrlsBtn = document.getElementById('savedUrlsBtn');
  if (savedUrlsBtn) {
    savedUrlsBtn.addEventListener('click', showSavedUrls);
  }
  
  // ヘルプボタン
  const helpBtn = document.getElementById('helpBtn');
  if (helpBtn) {
    helpBtn.addEventListener('click', showHelp);
  }
  
  // テーマ切り替え
  const themeToggle = document.getElementById('themeToggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', toggleTheme);
  }
}

// タブナビゲーションの設定
function setupTabNavigation() {
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');
  
  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      const tabName = button.dataset.tab;
      
      // アクティブタブの切り替え
      tabButtons.forEach(btn => btn.classList.remove('active'));
      button.classList.add('active');
      
      // タブコンテンツの切り替え
      tabContents.forEach(content => {
        if (content.id === `${tabName}-tab`) {
          content.classList.add('active');
        } else {
          content.classList.remove('active');
        }
      });
    });
  });
}

// ステータス更新
function updateStatus(text, type = 'idle') {
  elements.statusText.textContent = text;
  
  // ステータスインジケーターのクラス更新
  elements.statusIndicator.className = 'status-indicator ' + type;
  
  // ログに追加
  addLog(text, type === 'error' ? 'ERROR' : 'INFO');
}

// ログ追加
function addLog(message, level = 'INFO') {
  const timestamp = new Date().toLocaleTimeString();
  const logEntry = document.createElement('div');
  logEntry.className = `log-entry log-${level.toLowerCase()}`;
  logEntry.innerHTML = `
    <span class="log-time">${timestamp}</span>
    <span class="log-level">${level}</span>
    <span class="log-message">${message}</span>
  `;
  
  if (elements.logsViewer) {
    elements.logsViewer.appendChild(logEntry);
    elements.logsViewer.scrollTop = elements.logsViewer.scrollHeight;
  }
  
  // コンソールにも出力
  console.log(`[${level}] ${message}`);
}

// 読み込み処理
async function handleLoad() {
  const url = elements.spreadsheetUrl.value.trim();
  
  if (!url) {
    updateStatus('URLを入力してください', 'error');
    return;
  }
  
  // URLを保存
  saveLastUsedUrl(url);
  
  // URLパース
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!match) {
    updateStatus('有効なスプレッドシートURLではありません', 'error');
    return;
  }
  
  const spreadsheetId = match[1];
  const gidMatch = url.match(/[#&]gid=(\d+)/);
  const gid = gidMatch ? gidMatch[1] : null;
  
  updateStatus('スプレッドシート読み込み中...', 'loading');
  elements.loadBtn.disabled = true;
  
  try {
    // ステップ1: スプレッドシートデータの読み込み
    addLog('ステップ1: スプレッドシートデータの読み込み開始', 'INFO');
    currentSpreadsheetData = await loadSpreadsheetData(spreadsheetId, gid);
    
    // ステップ2: データ構造の解析
    addLog('ステップ2: データ構造の解析', 'INFO');
    analyzeDataStructure(currentSpreadsheetData);
    
    // ステップ3: 制御情報の収集
    addLog('ステップ3: 制御情報の収集', 'INFO');
    currentControls = SimpleColumnControl.collectControls(currentSpreadsheetData);
    displayControls(currentControls);
    
    // ステップ4: タスクリストの生成
    addLog('ステップ4: タスクリストの生成', 'INFO');
    const taskGenerator = new TaskGenerator();
    currentTaskList = taskGenerator.generateTasks(currentSpreadsheetData);
    
    // ステップ5: 結果の表示
    addLog('ステップ5: 結果の表示', 'INFO');
    displayResults();
    
    updateStatus('読み込み完了', 'success');
    addLog(`読み込み完了: ${currentTaskList.tasks.length}個のタスクを生成`, 'SUCCESS');
    
  } catch (error) {
    console.error('読み込みエラー:', error);
    updateStatus(`エラー: ${error.message}`, 'error');
    addLog(`エラー: ${error.message}`, 'ERROR');
  } finally {
    elements.loadBtn.disabled = false;
  }
}

// スプレッドシートデータの読み込み
async function loadSpreadsheetData(spreadsheetId, gid) {
  // SheetsClientを使用
  const sheetsClient = new SheetsClient();
  const spreadsheetData = await sheetsClient.loadAutoAIData(spreadsheetId, gid);
  
  // background.jsと同じprocessSpreadsheetData処理を実行
  const processedData = processSpreadsheetData(spreadsheetData);
  
  // modelRowとtaskRowも含める
  processedData.modelRow = spreadsheetData.modelRow;
  processedData.taskRow = spreadsheetData.taskRow;
  
  console.log('[Test] 読み込んだスプレッドシートデータ:', processedData);
  
  return processedData;
}

// background.jsと同じprocessSpreadsheetData関数
function processSpreadsheetData(spreadsheetData) {
  const result = {
    ...spreadsheetData,
    aiColumns: {},
    columnMapping: {},
  };

  if (!spreadsheetData.values || spreadsheetData.values.length === 0) {
    return result;
  }

  // メニュー行とAI行から情報を取得
  const menuRow = spreadsheetData.menuRow?.data || spreadsheetData.values[0];
  const aiRow = spreadsheetData.aiRow?.data || [];
  
  console.log("[Test] processSpreadsheetData - AI行:", aiRow);
  
  // 各列を解析
  menuRow.forEach((header, index) => {
    const columnLetter = String.fromCharCode(65 + index);
    const trimmedHeader = header ? header.trim() : "";
    const aiValue = aiRow[index] ? aiRow[index].trim() : "";
    
    // 列マッピングを作成
    result.columnMapping[columnLetter] = {
      index,
      header: trimmedHeader,
    };
    
    // プロンプト列の検出
    if (trimmedHeader === "プロンプト") {
      // AI行の値を確認して3種類AIレイアウトを検出
      let aiType = null;
      
      // 3種類レイアウトのチェック（AI行に"3種類"がある場合）
      const nextAiValue = aiRow[index + 1] ? aiRow[index + 1].trim() : "";
      if (nextAiValue === "3種類") {
        aiType = "3type";
        console.log(`[Test] 3種類AIレイアウト検出: ${columnLetter}列`);
      }
      // 個別AIのチェック（メニュー行から）
      else if (trimmedHeader.startsWith("ChatGPT ")) {
        aiType = "chatgpt";
      } else if (trimmedHeader.startsWith("Claude ")) {
        aiType = "claude";
      } else if (trimmedHeader.startsWith("Gemini ")) {
        aiType = "gemini";
      }
      // メニュー行が"プロンプト"で、次の3列がChatGPT、Claude、Geminiの場合
      else if (trimmedHeader === "プロンプト") {
        const nextHeaders = [
          menuRow[index + 6],
          menuRow[index + 7],
          menuRow[index + 8]
        ];
        
        if (nextHeaders[0]?.includes("ChatGPT") &&
            nextHeaders[1]?.includes("Claude") && 
            nextHeaders[2]?.includes("Gemini")) {
          aiType = "3type";
          console.log(`[Test] メニュー行から3種類AIレイアウト検出: ${columnLetter}列`);
        }
      }
      
      if (aiType) {
        result.aiColumns[columnLetter] = {
          index,
          letter: columnLetter,
          header: trimmedHeader,
          type: aiType,
          promptDescription: trimmedHeader === "プロンプト" ? "" : trimmedHeader.split(" ").slice(1).join(" ")
        };
      }
    }
  });
  
  console.log("[Test] 処理後のaiColumns:", result.aiColumns);

  return result;
}

// データ構造の解析
function analyzeDataStructure(data) {
  // 統計情報の更新
  if (elements.totalRows) {
    elements.totalRows.textContent = data.values ? data.values.length : 0;
  }
  if (elements.workRows) {
    elements.workRows.textContent = data.workRows ? data.workRows.length : 0;
  }
  if (elements.aiColumns) {
    elements.aiColumns.textContent = Object.keys(data.aiColumns || {}).length;
  }
  
  // 構造ツリーの表示
  displayStructureTree(data);
  
  // スプレッドシートテーブルの表示
  displaySpreadsheetTable(data);
}

// 構造ツリーの表示
function displayStructureTree(data) {
  if (!elements.structureTree) return;
  
  const tree = document.createElement('div');
  tree.className = 'structure-tree';
  
  // メニュー行
  if (data.menuRow) {
    tree.innerHTML += `
      <div class="tree-node">
        <span class="tree-icon">📋</span>
        <span class="tree-label">メニュー行: ${data.menuRow.index + 1}行目</span>
      </div>
    `;
  }
  
  // AI行
  if (data.aiRow) {
    tree.innerHTML += `
      <div class="tree-node">
        <span class="tree-icon">🤖</span>
        <span class="tree-label">AI行: ${data.aiRow.index + 1}行目</span>
      </div>
    `;
  }
  
  // モデル行
  if (data.modelRow) {
    tree.innerHTML += `
      <div class="tree-node">
        <span class="tree-icon">🔧</span>
        <span class="tree-label">モデル行: ${data.modelRow.index + 1}行目</span>
      </div>
    `;
  }
  
  // 機能行
  if (data.taskRow) {
    tree.innerHTML += `
      <div class="tree-node">
        <span class="tree-icon">⚙️</span>
        <span class="tree-label">機能行: ${data.taskRow.index + 1}行目</span>
      </div>
    `;
  }
  
  // AI列
  const aiColumns = Object.entries(data.aiColumns || {});
  if (aiColumns.length > 0) {
    tree.innerHTML += `
      <div class="tree-node">
        <span class="tree-icon">📊</span>
        <span class="tree-label">AI列: ${aiColumns.length}列</span>
      </div>
    `;
    
    aiColumns.forEach(([column, info]) => {
      tree.innerHTML += `
        <div class="tree-node tree-child">
          <span class="tree-icon">📝</span>
          <span class="tree-label">${column}列: ${info.type === '3type' ? '3種類AI' : info.type.toUpperCase()}</span>
        </div>
      `;
    });
  }
  
  elements.structureTree.innerHTML = '';
  elements.structureTree.appendChild(tree);
}

// スプレッドシートテーブルの表示
function displaySpreadsheetTable(data) {
  if (!elements.spreadsheetTable || !data.values) return;
  
  const table = elements.spreadsheetTable;
  table.innerHTML = '';
  
  // ヘッダー行
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  
  // 列ヘッダー（A, B, C...）
  headerRow.innerHTML = '<th></th>';
  const maxCols = Math.max(...data.values.map(row => row.length));
  for (let i = 0; i < maxCols; i++) {
    const th = document.createElement('th');
    th.textContent = String.fromCharCode(65 + i);
    headerRow.appendChild(th);
  }
  thead.appendChild(headerRow);
  table.appendChild(thead);
  
  // データ行
  const tbody = document.createElement('tbody');
  data.values.slice(0, 20).forEach((row, index) => {
    const tr = document.createElement('tr');
    
    // 行番号
    const th = document.createElement('th');
    th.textContent = index + 1;
    tr.appendChild(th);
    
    // セルデータ
    for (let i = 0; i < maxCols; i++) {
      const td = document.createElement('td');
      const value = row[i] || '';
      td.textContent = value.length > 50 ? value.substring(0, 50) + '...' : value;
      td.title = value;
      
      // 特別な行のハイライト
      if (data.menuRow && index === data.menuRow.index) {
        td.classList.add('menu-row');
      }
      if (data.aiRow && index === data.aiRow.index) {
        td.classList.add('ai-row');
      }
      if (data.modelRow && index === data.modelRow.index) {
        td.classList.add('model-row');
      }
      if (data.taskRow && index === data.taskRow.index) {
        td.classList.add('task-row');
      }
      
      tr.appendChild(td);
    }
    
    tbody.appendChild(tr);
  });
  
  table.appendChild(tbody);
}

// 制御情報の表示
function displayControls(controls) {
  // 行制御の表示
  if (elements.rowControlsContainer) {
    elements.rowControlsContainer.innerHTML = '';
    
    if (controls.rowControls && Object.keys(controls.rowControls).length > 0) {
      const list = document.createElement('ul');
      list.className = 'control-list';
      
      Object.entries(controls.rowControls).forEach(([row, control]) => {
        const li = document.createElement('li');
        li.innerHTML = `
          <span class="control-row">行 ${row}</span>
          <span class="control-type">${control}</span>
        `;
        list.appendChild(li);
      });
      
      elements.rowControlsContainer.appendChild(list);
    } else {
      elements.rowControlsContainer.innerHTML = '<p class="no-controls">行制御なし</p>';
    }
  }
  
  // 列制御の表示
  if (elements.columnControlsContainer) {
    elements.columnControlsContainer.innerHTML = '';
    
    if (controls.columnControls && controls.columnControls.length > 0) {
      const list = document.createElement('ul');
      list.className = 'control-list';
      
      controls.columnControls.forEach(control => {
        const li = document.createElement('li');
        li.innerHTML = `
          <span class="control-column">${control.column}列</span>
          <span class="control-type">${control.type}</span>
        `;
        list.appendChild(li);
      });
      
      elements.columnControlsContainer.appendChild(list);
    } else {
      elements.columnControlsContainer.innerHTML = '<p class="no-controls">列制御なし</p>';
    }
  }
}

// 結果の表示
function displayResults() {
  if (!currentTaskList) return;
  
  // 統計情報の更新
  const stats = currentTaskList.getStatistics();
  if (elements.totalTasks) {
    elements.totalTasks.textContent = stats.total;
  }
  
  // タスクテーブルの表示
  displayTasksTable();
}

// タスクテーブルの表示
function displayTasksTable() {
  if (!elements.tasksTableContainer || !currentTaskList) return;
  
  const container = elements.tasksTableContainer;
  container.innerHTML = '';
  
  // 統計情報カード
  const statsCard = document.createElement('div');
  statsCard.className = 'stats-card';
  const stats = currentTaskList.getStatistics();
  statsCard.innerHTML = `
    <div class="stats-grid">
      <div class="stat-item">
        <span class="stat-label">総タスク数:</span>
        <span class="stat-value">${stats.total}</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">実行可能:</span>
        <span class="stat-value">${stats.executable}</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">ChatGPT:</span>
        <span class="stat-value">${stats.byAI.chatgpt}</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">Claude:</span>
        <span class="stat-value">${stats.byAI.claude}</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">Gemini:</span>
        <span class="stat-value">${stats.byAI.gemini}</span>
      </div>
    </div>
  `;
  container.appendChild(statsCard);
  
  // タスクテーブル
  const table = document.createElement('table');
  table.className = 'tasks-table';
  
  // ヘッダー
  const thead = document.createElement('thead');
  thead.innerHTML = `
    <tr>
      <th>ID</th>
      <th>行</th>
      <th>列</th>
      <th>AI</th>
      <th>タイプ</th>
      <th>プロンプト</th>
      <th>モデル</th>
      <th>機能</th>
      <th>制御</th>
      <th>状態</th>
    </tr>
  `;
  table.appendChild(thead);
  
  // ボディ
  const tbody = document.createElement('tbody');
  currentTaskList.tasks.forEach(task => {
    const tr = document.createElement('tr');
    
    // タスクが実行可能かどうかでスタイルを変更
    if (!task.isExecutable()) {
      tr.classList.add('task-skipped');
    }
    
    // プロンプトのプレビュー
    const promptPreview = task.prompt ? 
      (task.prompt.length > 100 ? task.prompt.substring(0, 100) + '...' : task.prompt) :
      '(なし)';
    
    // 制御情報
    const controlInfo = [];
    if (task.controlFlags) {
      Object.entries(task.controlFlags).forEach(([key, value]) => {
        if (value) controlInfo.push(key);
      });
    }
    
    tr.innerHTML = `
      <td class="task-id" title="${task.id}">${task.id.substring(0, 8)}...</td>
      <td class="task-row">${task.row}</td>
      <td class="task-column">${task.column}</td>
      <td class="task-ai">
        <span class="ai-badge ai-${task.aiType}">${task.aiType.toUpperCase()}</span>
      </td>
      <td class="task-type">${task.taskType || 'ai'}</td>
      <td class="task-prompt" title="${task.prompt || ''}">${promptPreview}</td>
      <td class="task-model">${task.model || '-'}</td>
      <td class="task-operation">${task.specialOperation || '-'}</td>
      <td class="task-control">${controlInfo.join(', ') || '-'}</td>
      <td class="task-status">
        ${task.skipReason ? `<span class="skip-reason">${task.skipReason}</span>` : '<span class="executable">実行可能</span>'}
      </td>
    `;
    
    tbody.appendChild(tr);
  });
  
  table.appendChild(tbody);
  container.appendChild(table);
}

// ステップ実行モード
function handleStepMode() {
  stepMode = !stepMode;
  elements.stepModeBtn.classList.toggle('active', stepMode);
  
  if (stepMode) {
    addLog('ステップ実行モード有効', 'INFO');
    updateStatus('ステップ実行モード', 'step');
  } else {
    addLog('ステップ実行モード無効', 'INFO');
    updateStatus('待機中', 'idle');
  }
}

// 自動実行
function handleAutoRun() {
  if (!currentTaskList || currentTaskList.tasks.length === 0) {
    updateStatus('タスクがありません', 'error');
    return;
  }
  
  autoRunMode = true;
  elements.autoRunBtn.disabled = true;
  elements.stopBtn.disabled = false;
  
  addLog('自動実行開始', 'INFO');
  updateStatus('自動実行中...', 'running');
  
  // ここで実際のタスク実行処理を実装
  simulateTaskExecution();
}

// 停止
function handleStop() {
  autoRunMode = false;
  stepMode = false;
  
  elements.autoRunBtn.disabled = false;
  elements.stopBtn.disabled = true;
  elements.stepModeBtn.classList.remove('active');
  
  addLog('処理停止', 'WARNING');
  updateStatus('停止', 'idle');
}

// タスク実行のシミュレーション
async function simulateTaskExecution() {
  if (!currentTaskList) return;
  
  const executableTasks = currentTaskList.getExecutableTasks();
  const totalTasks = executableTasks.length;
  
  for (let i = 0; i < totalTasks && autoRunMode; i++) {
    const task = executableTasks[i];
    const progress = ((i + 1) / totalTasks) * 100;
    
    // プログレスバーの更新
    if (elements.progressFill) {
      elements.progressFill.style.width = `${progress}%`;
    }
    
    // タスク実行のログ
    addLog(`タスク実行: ${task.id} (${task.column}${task.row})`, 'INFO');
    
    // 擬似的な待機
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  if (autoRunMode) {
    handleStop();
    addLog('自動実行完了', 'SUCCESS');
    updateStatus('完了', 'success');
  }
}

// 保存済みURLの表示
function showSavedUrls() {
  // モーダル表示などの実装
  console.log('保存済みURL表示');
}

// ヘルプの表示
function showHelp() {
  // モーダル表示などの実装
  console.log('ヘルプ表示');
}

// テーマ切り替え
function toggleTheme() {
  document.body.classList.toggle('dark-theme');
  const isDark = document.body.classList.contains('dark-theme');
  localStorage.setItem('theme', isDark ? 'dark' : 'light');
}

// 最後に使用したURLの保存
function saveLastUsedUrl(url) {
  localStorage.setItem('lastUsedSpreadsheetUrl', url);
}

// 最後に使用したURLの読み込み
function loadLastUsedUrl() {
  const lastUrl = localStorage.getItem('lastUsedSpreadsheetUrl');
  if (lastUrl && elements.spreadsheetUrl) {
    elements.spreadsheetUrl.value = lastUrl;
  }
}

// グローバルに公開（デバッグ用）
window.testSpreadsheet = {
  currentSpreadsheetData,
  currentTaskList,
  currentControls,
  DEBUG
};