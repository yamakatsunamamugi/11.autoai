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

// 列名生成ヘルパー関数（A, B, ..., Z, AA, AB, ...）
function getColumnName(index) {
  if (index < 0) return null;
  
  let columnName = '';
  let num = index;
  
  while (num >= 0) {
    columnName = String.fromCharCode(65 + (num % 26)) + columnName;
    num = Math.floor(num / 26) - 1;
    if (num < 0) break;
  }
  
  return columnName;
}

// 列名から列インデックスを計算（A=0, Z=25, AA=26, AB=27...）
function getColumnIndex(columnName) {
  let index = 0;
  for (let i = 0; i < columnName.length; i++) {
    index = index * 26 + (columnName.charCodeAt(i) - 64);
  }
  return index - 1;
}

// 初期化
document.addEventListener('DOMContentLoaded', () => {
  originalConsoleLog('🚀 スプレッドシート読み込みテストツール初期化');
  
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
  elements.controlMappingDiagram = document.getElementById('controlMappingDiagram');
  elements.variablesTree = document.getElementById('variablesTree');
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

// ログ追加（詳細版）
let currentProcessingStep = '待機中';

function addLog(message, level = 'INFO', details = null) {
  const timestamp = new Date().toLocaleTimeString('ja-JP', { 
    hour12: false, 
    hour: '2-digit', 
    minute: '2-digit', 
    second: '2-digit'
  });
  
  const logEntry = document.createElement('div');
  logEntry.className = `log-entry log-${level.toLowerCase()} ${details ? 'expandable' : ''}`;
  
  const headerDiv = document.createElement('div');
  headerDiv.className = 'log-header';
  headerDiv.innerHTML = `
    <span class="log-time">${timestamp}</span>
    <span class="log-level ${level.toLowerCase()}">${level.padEnd(7)}</span>
    <span class="log-category">${getLogCategory(message)}</span>
    <span class="log-message">${message}</span>
    ${details ? '<button class="log-expand">▼</button>' : ''}
  `;
  
  logEntry.appendChild(headerDiv);
  
  if (details) {
    const detailsDiv = document.createElement('div');
    detailsDiv.className = 'log-details collapsed';
    detailsDiv.innerHTML = `<pre>${typeof details === 'object' ? JSON.stringify(details, null, 2) : details}</pre>`;
    logEntry.appendChild(detailsDiv);
    
    const expandBtn = headerDiv.querySelector('.log-expand');
    if (expandBtn) {
      expandBtn.addEventListener('click', () => {
        detailsDiv.classList.toggle('collapsed');
        expandBtn.textContent = detailsDiv.classList.contains('collapsed') ? '▼' : '▲';
      });
    }
  }
  
  if (elements.logsViewer) {
    elements.logsViewer.appendChild(logEntry);
    elements.logsViewer.scrollTop = elements.logsViewer.scrollHeight;
  }
  
  // 元のコンソールに出力（ループを避けるため）
  originalConsoleLog(`[${timestamp}] [${level}] ${message}`, details || '');
}

// コンソールログをキャプチャしてログビューアにも表示
const originalConsoleLog = console.log;
const originalConsoleInfo = console.info;
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;

console.log = function(...args) {
  originalConsoleLog.apply(console, args);
  if (elements.logsViewer) {
    const message = args.map(arg => {
      if (typeof arg === 'object') {
        try {
          return JSON.stringify(arg, null, 2);
        } catch (e) {
          return String(arg);
        }
      }
      return String(arg);
    }).join(' ');
    
    // addLogの重複を避けるため、内部フラグをチェック
    if (!message.includes('[デバッグ]') && !message.includes('[制御マッピング]')) {
      addLog(message, 'INFO');
    }
  }
};

console.info = function(...args) {
  originalConsoleInfo.apply(console, args);
  if (elements.logsViewer && args[0] && typeof args[0] === 'string') {
    const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : arg).join(' ');
    addLog(message, 'INFO');
  }
};

console.warn = function(...args) {
  originalConsoleWarn.apply(console, args);
  if (elements.logsViewer && args[0] && typeof args[0] === 'string') {
    const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : arg).join(' ');
    addLog(message, 'WARNING');
  }
};

console.error = function(...args) {
  originalConsoleError.apply(console, args);
  if (elements.logsViewer && args[0] && typeof args[0] === 'string') {
    const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : arg).join(' ');
    addLog(message, 'ERROR');
  }
};

// ログカテゴリの判定
function getLogCategory(message) {
  if (message.includes('読み込み')) return 'LOAD';
  if (message.includes('構造')) return 'STRUCT';
  if (message.includes('制御')) return 'CONTROL';
  if (message.includes('タスク')) return 'TASK';
  if (message.includes('エラー')) return 'ERROR';
  if (message.includes('完了')) return 'COMPLETE';
  return 'GENERAL';
}

// デバッグ情報の更新
function updateDebugInfo() {
  const variablesTree = document.getElementById('variablesTree');
  const currentStepInfo = document.getElementById('currentStepInfo');
  const debugOutput = document.getElementById('debugOutput');
  
  console.log('[デバッグ] 情報更新開始');
  
  if (!variablesTree && !currentStepInfo && !debugOutput) {
    console.log('[デバッグ] デバッグ要素が見つかりません');
    return;
  }
  
  const debugData = {
    currentStep: currentProcessingStep,
    spreadsheetData: currentSpreadsheetData ? {
      rows: currentSpreadsheetData.values?.length || 0,
      columns: currentSpreadsheetData.values?.[0]?.length || 0,
      specialRows: {
        menuRow: currentSpreadsheetData.menuRow?.index !== undefined ? currentSpreadsheetData.menuRow.index + 1 : null,
        aiRow: currentSpreadsheetData.aiRow?.index !== undefined ? currentSpreadsheetData.aiRow.index + 1 : null,
        modelRow: currentSpreadsheetData.modelRow?.index !== undefined ? currentSpreadsheetData.modelRow.index + 1 : null,
        taskRow: currentSpreadsheetData.taskRow?.index !== undefined ? currentSpreadsheetData.taskRow.index + 1 : null
      },
      workRows: currentSpreadsheetData.workRows?.length || 0,
      aiColumns: Object.keys(currentSpreadsheetData.aiColumns || {})
    } : null,
    taskList: currentTaskList ? {
      total: currentTaskList.tasks.length,
      executable: currentTaskList.getExecutableTasks().length,
      skipped: currentTaskList.tasks.filter(t => t.skipReason).length,
      byAI: currentTaskList.getStatistics().byAI
    } : null,
    controls: currentControls ? {
      rowControls: currentControls.rowControls?.length || 0,
      columnControls: currentControls.columnControls?.length || 0
    } : null
  };
  
  if (variablesTree) {
    variablesTree.innerHTML = '';
    const pre = document.createElement('pre');
    pre.style.margin = '0';
    pre.style.fontSize = '12px';
    pre.textContent = JSON.stringify(debugData, null, 2);
    variablesTree.appendChild(pre);
    console.log('[デバッグ] 変数ツリー更新完了');
  }
  
  // デバッグ出力エリアも更新
  const debugOutputElement = document.getElementById('debugOutput');
  if (debugOutputElement) {
    const entry = document.createElement('div');
    entry.className = 'debug-entry';
    entry.innerHTML = `
      <span class="debug-time">${new Date().toLocaleTimeString()}</span>
      <span class="debug-step">${currentProcessingStep}</span>
    `;
    debugOutputElement.appendChild(entry);
    debugOutputElement.scrollTop = debugOutputElement.scrollHeight;
  }
  
  // 現在のステップ情報を更新
  if (currentStepInfo) {
    currentStepInfo.textContent = currentProcessingStep;
  }
}

// 読み込み処理
async function handleLoad() {
  console.log('====== スプレッドシート読み込み開始 ======');
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
  
  // パフォーマンス測定開始
  const perfStart = performance.now();
  const perfSteps = [];
  
  try {
    // ステップ1: スプレッドシートデータの読み込み
    let stepStart = performance.now();
    addLog('ステップ1: スプレッドシートデータの読み込み開始', 'INFO');
    currentSpreadsheetData = await loadSpreadsheetData(spreadsheetId, gid);
    perfSteps.push({ name: 'データ読み込み', time: performance.now() - stepStart });
    
    // ステップ2: データ構造の解析
    stepStart = performance.now();
    addLog('ステップ2: データ構造の解析', 'INFO');
    analyzeDataStructure(currentSpreadsheetData);
    perfSteps.push({ name: 'データ構造解析', time: performance.now() - stepStart });
    
    // ステップ3: 制御情報の収集
    stepStart = performance.now();
    currentProcessingStep = '制御情報収集';
    addLog('ステップ3: 制御情報の収集', 'INFO');
    currentControls = SimpleColumnControl.collectControls(currentSpreadsheetData);
    displayControls(currentControls);
    updateDebugInfo(); // デバッグ情報を更新
    perfSteps.push({ name: '制御情報収集', time: performance.now() - stepStart });
    
    // ステップ4: タスクリストの生成
    stepStart = performance.now();
    currentProcessingStep = 'タスク生成';
    addLog('ステップ4: タスクリストの生成', 'INFO');
    const taskGenerator = new TaskGenerator();
    currentTaskList = await taskGenerator.generateTasks(currentSpreadsheetData);
    updateDebugInfo(); // デバッグ情報を更新
    perfSteps.push({ name: 'タスク生成', time: performance.now() - stepStart });
    
    // ステップ5: 結果の表示
    stepStart = performance.now();
    currentProcessingStep = '結果表示';
    addLog('ステップ5: 結果の表示', 'INFO');
    displayResults();
    updateDebugInfo(); // デバッグ情報を更新
    perfSteps.push({ name: '結果表示', time: performance.now() - stepStart });
    
    console.log('====== 処理完了 ======');
    
    // パフォーマンス測定終了
    const totalTime = performance.now() - perfStart;
    updatePerformanceDisplay(perfSteps, totalTime);
    
    currentProcessingStep = '完了';
    updateStatus('読み込み完了', 'success');
    addLog(`読み込み完了: ${currentTaskList.tasks.length}個のタスクを生成`, 'SUCCESS', {
      総タスク数: currentTaskList.tasks.length,
      実行可能: currentTaskList.getExecutableTasks().length,
      AI別: currentTaskList.getStatistics().byAI
    });
    updateDebugInfo(); // 最終的なデバッグ情報を更新
    
  } catch (error) {
    console.error('読み込みエラー:', error);
    updateStatus(`エラー: ${error.message}`, 'error');
    addLog(`エラー: ${error.message}`, 'ERROR');
    updateDebugInfo();
  } finally {
    elements.loadBtn.disabled = false;
  }
}

// スプレッドシートデータの読み込み
async function loadSpreadsheetData(spreadsheetId, gid) {
  // SheetsClientを使用
  const sheetsClient = new SheetsClient();
  const spreadsheetData = await sheetsClient.loadAutoAIData(spreadsheetId, gid);
  
  console.log('[Test] 生のスプレッドシートデータ:', spreadsheetData);
  console.log('[Test] rawData.values[0]:', spreadsheetData.values?.[0]);
  console.log('[Test] menuRow:', spreadsheetData.menuRow);
  console.log('[Test] aiRow:', spreadsheetData.aiRow);
  console.log('[Test] modelRow:', spreadsheetData.modelRow);
  console.log('[Test] taskRow (機能行):', spreadsheetData.taskRow);
  
  // A列の全データを確認（モデル・機能行検出のため）
  console.log('[Test] A列の全データ:');
  spreadsheetData.values?.forEach((row, index) => {
    if (row[0]) {
      console.log(`  行${index + 1}: "${row[0]}" (length: ${row[0].length})`);
    }
  });
  
  // background.jsと同じprocessSpreadsheetData処理を実行
  const processedData = processSpreadsheetData(spreadsheetData);
  
  // modelRowとtaskRowも含める
  processedData.modelRow = spreadsheetData.modelRow;
  processedData.taskRow = spreadsheetData.taskRow;
  
  console.log('[Test] 処理後のprocessedData:', processedData);
  console.log('[Test] processedData.aiColumns:', processedData.aiColumns);
  
  // モデル行と機能行のデバッグ情報
  if (processedData.modelRow) {
    console.log('[Test] モデル行詳細:', {
      index: processedData.modelRow.index,
      rowNumber: processedData.modelRow.index + 1,
      data: processedData.modelRow.data,
      fullRowLength: processedData.modelRow.data?.length,
      'A列(index=0)': processedData.modelRow.data?.[0],
      'B列(index=1)': processedData.modelRow.data?.[1],
      'C列(index=2)': processedData.modelRow.data?.[2],
      'D列(index=3)': processedData.modelRow.data?.[3],
      'E列(index=4)': processedData.modelRow.data?.[4],
      'F列(index=5)': processedData.modelRow.data?.[5],
      'G列(index=6)': processedData.modelRow.data?.[6],
      'H列(index=7)': processedData.modelRow.data?.[7],
      'I列(index=8)': processedData.modelRow.data?.[8],
      'J列(index=9)': processedData.modelRow.data?.[9]
    });
  }
  
  if (processedData.taskRow) {
    console.log('[Test] 機能行詳細:', {
      index: processedData.taskRow.index,
      rowNumber: processedData.taskRow.index + 1,
      data: processedData.taskRow.data,
      'E列(index=4)': processedData.taskRow.data?.[4],
      'F列(index=5)': processedData.taskRow.data?.[5],
      'G列(index=6)': processedData.taskRow.data?.[6],
      'H列(index=7)': processedData.taskRow.data?.[7]
    });
  }
  
  // 列インデックス計算テスト
  console.log('[Test] 列インデックス計算テスト:', {
    'E': getColumnIndex('E'),
    'F': getColumnIndex('F'),
    'G': getColumnIndex('G'),
    'H': getColumnIndex('H')
  });
  
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
  
  console.log("[Test] processSpreadsheetData - メニュー行:", menuRow);
  console.log("[Test] processSpreadsheetData - AI行:", aiRow);
  
  // 各列を解析
  menuRow.forEach((header, index) => {
    const columnLetter = getColumnName(index);
    const trimmedHeader = header ? header.trim() : "";
    const aiValue = aiRow[index] ? aiRow[index].trim() : "";
    
    // 列マッピングを作成
    result.columnMapping[columnLetter] = {
      index,
      header: trimmedHeader,
    };
    
    // デバッグログ
    if (index < 10) {
      console.log(`[Test] 列${columnLetter}: メニュー="${trimmedHeader}", AI="${aiValue}"`);
    }
    
    // プロンプト列の検出
    if (trimmedHeader === "プロンプト" || trimmedHeader.includes("プロンプト")) {
      // AI行の値を確認して3種類AIレイアウトを検出
      let aiType = null;
      
      // 3種類レイアウトのチェック（AI行に"3種類"がある場合）
      const nextAiValue = aiRow[index + 1] ? aiRow[index + 1].trim() : "";
      if (nextAiValue === "3種類") {
        aiType = "3type";
        console.log(`[Test] 3種類AIレイアウト検出: ${columnLetter}列`);
      }
      // メニュー行が"プロンプト"で、次の3列がChatGPT、Claude、Geminiを含む場合
      else if (trimmedHeader === "プロンプト" || trimmedHeader.includes("プロンプト")) {
        const nextHeaders = [
          menuRow[index + 1],
          menuRow[index + 2],
          menuRow[index + 3]
        ];
        
        console.log(`[Test] 次の列をチェック:`, nextHeaders);
        
        if ((nextHeaders[0] && nextHeaders[0].includes("ChatGPT") &&
             nextHeaders[1] && nextHeaders[1].includes("Claude") && 
             nextHeaders[2] && nextHeaders[2].includes("Gemini")) ||
            (nextHeaders[0] && nextHeaders[0].includes("回答") &&
             nextHeaders[1] && nextHeaders[1].includes("回答") &&
             nextHeaders[2] && nextHeaders[2].includes("回答"))) {
          aiType = "3type";
          console.log(`[Test] メニュー行から3種類AIレイアウト検出: ${columnLetter}列`);
        } else {
          // デフォルトでプロンプト列は登録（単独AI扱い）
          aiType = "single";
          console.log(`[Test] 単独AIプロンプト列として検出: ${columnLetter}列`);
        }
      }
      // 個別AIのチェック（メニュー行から）
      else if (trimmedHeader.startsWith("ChatGPT ")) {
        aiType = "chatgpt";
      } else if (trimmedHeader.startsWith("Claude ")) {
        aiType = "claude";
      } else if (trimmedHeader.startsWith("Gemini ")) {
        aiType = "gemini";
      }
      
      if (aiType) {
        result.aiColumns[columnLetter] = {
          index,
          letter: columnLetter,
          header: trimmedHeader,
          type: aiType,
          promptDescription: trimmedHeader === "プロンプト" ? "" : trimmedHeader.split(" ").slice(1).join(" ")
        };
        console.log(`[Test] AI列として登録: ${columnLetter}列 (${aiType})`);
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

// 構造ツリーの表示（改善版）
function displayStructureTree(data) {
  if (!elements.structureTree) return;
  
  elements.structureTree.innerHTML = '';
  
  // セクション1: 特殊行サマリー
  const summarySection = document.createElement('div');
  summarySection.className = 'structure-section';
  summarySection.innerHTML = '<h4>特殊行の検出状況</h4>';
  
  const summaryTable = document.createElement('table');
  summaryTable.className = 'special-rows-table';
  summaryTable.innerHTML = `
    <thead>
      <tr>
        <th>行タイプ</th>
        <th>行番号</th>
        <th>内容</th>
        <th>状態</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>📋 メニュー行</td>
        <td>${data.menuRow ? (data.menuRow.index + 1) + '行目' : '-'}</td>
        <td>${data.menuRow ? '列ヘッダー定義' : '未検出'}</td>
        <td>${data.menuRow ? '<span class="status-badge success">✓</span>' : '<span class="status-badge warning">×</span>'}</td>
      </tr>
      <tr>
        <td>🤖 AI行</td>
        <td>${data.aiRow ? (data.aiRow.index + 1) + '行目' : '-'}</td>
        <td>${data.aiRow ? '使用AI指定' : '未検出'}</td>
        <td>${data.aiRow ? '<span class="status-badge success">✓</span>' : '<span class="status-badge warning">×</span>'}</td>
      </tr>
      <tr>
        <td>🔧 モデル行</td>
        <td>${data.modelRow ? (data.modelRow.index + 1) + '行目' : '-'}</td>
        <td>${data.modelRow ? 'モデル指定' : '未検出'}</td>
        <td>${data.modelRow ? '<span class="status-badge success">✓</span>' : '<span class="status-badge info">任意</span>'}</td>
      </tr>
      <tr>
        <td>⚙️ 機能行</td>
        <td>${data.taskRow ? (data.taskRow.index + 1) + '行目' : '-'}</td>
        <td>${data.taskRow ? '機能指定' : '未検出'}</td>
        <td>${data.taskRow ? '<span class="status-badge success">✓</span>' : '<span class="status-badge info">任意</span>'}</td>
      </tr>
    </tbody>
  `;
  summarySection.appendChild(summaryTable);
  elements.structureTree.appendChild(summarySection);
  
  // セクション2: AI列マッピング
  const aiColumnsSection = document.createElement('div');
  aiColumnsSection.className = 'structure-section';
  aiColumnsSection.innerHTML = '<h4>AI列の構成</h4>';
  
  if (data.aiColumns && Object.keys(data.aiColumns).length > 0) {
    const aiTable = document.createElement('table');
    aiTable.className = 'ai-columns-mapping-table';
    aiTable.innerHTML = `
      <thead>
        <tr>
          <th>列</th>
          <th>タイプ</th>
          <th>AI</th>
          <th>説明</th>
        </tr>
      </thead>
      <tbody>
    `;
    
    const tbody = aiTable.querySelector('tbody');
    Object.entries(data.aiColumns).forEach(([col, info]) => {
      const tr = document.createElement('tr');
      let aiTypeDisplay = info.type;
      let aiDescription = '';
      
      if (info.type === '3type') {
        aiTypeDisplay = '3種類AI';
        aiDescription = 'ChatGPT/Claude/Gemini';
      } else if (info.type === 'single') {
        aiTypeDisplay = '単体AI';
        aiDescription = info.header || 'プロンプト列';
      } else {
        aiTypeDisplay = info.type;
        aiDescription = info.header || '';
      }
      
      tr.innerHTML = `
        <td class="column-letter">${col}列</td>
        <td><span class="ai-type-badge ${info.type}">${aiTypeDisplay}</span></td>
        <td>${info.type === '3type' ? '複数' : (info.type || '-')}</td>
        <td>${aiDescription}</td>
      `;
      tbody.appendChild(tr);
    });
    
    aiColumnsSection.appendChild(aiTable);
  } else {
    aiColumnsSection.innerHTML += '<p class="no-data">AI列が検出されていません</p>';
  }
  
  elements.structureTree.appendChild(aiColumnsSection);
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
    th.textContent = getColumnName(i);
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
    
    if (controls.rowControls && controls.rowControls.length > 0) {
      const table = document.createElement('table');
      table.className = 'control-table';
      table.innerHTML = `
        <thead>
          <tr>
            <th>行番号</th>
            <th>制御タイプ</th>
            <th>説明</th>
          </tr>
        </thead>
        <tbody>
      `;
      
      const tbody = table.querySelector('tbody');
      // rowControlsは配列なので、直接forEachで処理
      controls.rowControls.forEach((control) => {
        let controlText = control.type || 'unknown';
        let description = '';
        let rowNumber = control.row || control.startRow || '不明';
        
        switch(controlText) {
          case 'skip':
            description = 'この行のタスクをスキップ';
            break;
          case 'only':
            description = 'この行のみを処理';
            break;
          case 'from':
            description = 'この行から処理開始';
            break;
          case 'until':
            description = 'この行まで処理';
            break;
          case 'range':
            description = `${control.startRow}行目から${control.endRow}行目まで処理`;
            rowNumber = `${control.startRow}-${control.endRow}`;
            break;
          default:
            description = '特殊制御';
        }
        
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td class="control-row">${rowNumber}行目</td>
          <td class="control-type">${controlText}</td>
          <td class="control-description">${description}</td>
        `;
        tbody.appendChild(tr);
      });
      
      elements.rowControlsContainer.appendChild(table);
    } else {
      elements.rowControlsContainer.innerHTML = '<p class="no-controls">行制御は設定されていません</p>';
    }
  }
  
  // 列制御の表示
  if (elements.columnControlsContainer) {
    elements.columnControlsContainer.innerHTML = '';
    
    if (controls.columnControls && controls.columnControls.length > 0) {
      const table = document.createElement('table');
      table.className = 'control-table';
      table.innerHTML = `
        <thead>
          <tr>
            <th>列</th>
            <th>制御タイプ</th>
            <th>説明</th>
          </tr>
        </thead>
        <tbody>
      `;
      
      const tbody = table.querySelector('tbody');
      controls.columnControls.forEach(control => {
        let description = '';
        
        switch(control.type) {
          case 'skip':
            description = 'この列のタスクをスキップ';
            break;
          case 'only':
            description = 'この列のみを処理';
            break;
          case 'from':
            description = 'この列から処理開始';
            break;
          case 'until':
            description = 'この列まで処理';
            break;
          default:
            description = '特殊制御';
        }
        
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td class="control-column">${control.column}列</td>
          <td class="control-type">${control.type}</td>
          <td class="control-description">${description}</td>
        `;
        tbody.appendChild(tr);
      });
      
      elements.columnControlsContainer.appendChild(table);
    } else {
      elements.columnControlsContainer.innerHTML = '<p class="no-controls">列制御は設定されていません</p>';
    }
  }
  
  // 制御マッピング図の生成
  console.log('[制御マッピング] 制御情報:', controls);
  if (controls && (controls.rowControls || controls.columnControls)) {
    displayControlMappingGrid(controls);
  } else {
    console.log('[制御マッピング] 制御情報がないためスキップ');
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

  // タスクテーブル制御パネル
  const controlPanel = document.createElement('div');
  controlPanel.className = 'task-control-panel';
  controlPanel.innerHTML = `
    <div class="task-controls-left">
      <div class="control-group">
        <label for="taskSearch">検索:</label>
        <input type="text" id="taskSearch" placeholder="ID、プロンプトで検索..." />
      </div>
      <div class="control-group">
        <label for="aiTypeFilter">AIタイプ:</label>
        <select id="aiTypeFilter">
          <option value="">すべて</option>
          <option value="chatgpt">ChatGPT</option>
          <option value="claude">Claude</option>
          <option value="gemini">Gemini</option>
        </select>
      </div>
      <div class="control-group">
        <label for="executableFilter">実行可能:</label>
        <select id="executableFilter">
          <option value="">すべて</option>
          <option value="yes">実行可能</option>
          <option value="no">実行不可</option>
        </select>
      </div>
      <div class="control-group">
        <label for="taskTypeFilter">タスクタイプ:</label>
        <select id="taskTypeFilter">
          <option value="">すべて</option>
          <option value="ai">AI</option>
          <option value="report">レポート</option>
        </select>
      </div>
    </div>
    <div class="task-controls-right">
      <button id="toggleDetailColumns" class="btn-secondary btn-small">詳細列表示</button>
      <button id="resetFilters" class="btn-secondary btn-small">フィルタリセット</button>
      <button id="exportTasks" class="btn-primary btn-small">エクスポート</button>
    </div>
  `;
  container.appendChild(controlPanel);
  
  // AIタスクとレポートタスクを分離
  const aiTasks = currentTaskList.tasks.filter(task => task.taskType !== 'report');
  const reportTasks = currentTaskList.tasks.filter(task => task.taskType === 'report');
  
  // AIタスクテーブル
  const aiTableTitle = document.createElement('h3');
  aiTableTitle.textContent = 'AIタスク一覧';
  aiTableTitle.style.marginTop = '20px';
  container.appendChild(aiTableTitle);
  
  const aiTable = document.createElement('table');
  aiTable.className = 'tasks-table ai-tasks-table';
  
  const aiThead = document.createElement('thead');
  aiThead.innerHTML = `
    <tr>
      <th>AI種別</th>
      <th>実行可能</th>
      <th>プロンプトセル</th>
      <th>回答セル</th>
      <th>AI</th>
      <th>モデル</th>
      <th>機能</th>
      <th>プロンプト</th>
      <th class="detail-column" title="スキップ理由">スキップ理由</th>
      <th class="detail-column" title="タスクID">タスクID</th>
      <th class="detail-column" title="グループID">グループID</th>
      <th class="detail-column" title="ログ列情報">ログ列情報</th>
      <th class="detail-column" title="制御フラグ">制御フラグ</th>
      <th class="detail-column" title="メタデータ">メタデータ</th>
    </tr>
  `;
  aiTable.appendChild(aiThead);
  
  // AIタスクのボディ
  const aiTbody = document.createElement('tbody');
  aiTasks.forEach(task => {
    const tr = document.createElement('tr');
    
    // タスクが実行可能かどうかでスタイルを変更
    const isExecutable = !task.skipReason && task.prompt && task.prompt.trim().length > 0;
    if (!isExecutable) {
      tr.classList.add('task-skipped');
    }
    
    // プロンプトのプレビュー（30文字まで）
    const promptPreview = task.prompt ? 
      (task.prompt.length > 30 ? task.prompt.substring(0, 30) + '...' : task.prompt) :
      '(なし)';
    
    // ログ列情報（詳細説明付き）
    const logInfo = [];
    if (task.logColumns) {
      if (task.logColumns.log) logInfo.push(`ログ列:${task.logColumns.log}`);
      if (task.logColumns.layout) logInfo.push(`レイアウト:${task.logColumns.layout === '3type' ? '3種類AI' : '単体AI'}`);
      if (task.logColumns.aiColumns) {
        const aiCols = Object.entries(task.logColumns.aiColumns).map(([col, ai]) => `${col}列→${ai}`).join(', ');
        logInfo.push(`AI列マッピング:[${aiCols}]`);
      }
    }
    const logInfoText = logInfo.length > 0 ? logInfo.join(' | ') : '設定なし';
    
    // 制御フラグ情報（詳細説明付き）
    let controlFlagsText = '設定なし';
    if (task.controlFlags && Object.keys(task.controlFlags).length > 0) {
      const flags = [];
      if (task.controlFlags.stopAfterGroup) flags.push('グループ後停止');
      if (task.controlFlags.priority !== undefined) flags.push(`優先度:${task.controlFlags.priority}`);
      // その他のフラグも追加
      Object.entries(task.controlFlags).forEach(([key, value]) => {
        if (key !== 'stopAfterGroup' && key !== 'priority') {
          flags.push(`${key}:${value}`);
        }
      });
      controlFlagsText = flags.length > 0 ? flags.join(', ') : '設定なし';
    }
    
    // メタデータ情報（フォーマット改善）
    let metadataText = '設定なし';
    if (task.metadata && Object.keys(task.metadata).length > 0) {
      const items = Object.entries(task.metadata).map(([key, value]) => {
        if (typeof value === 'object') {
          return `${key}:${JSON.stringify(value)}`;
        }
        return `${key}:${value}`;
      });
      metadataText = items.join(', ');
    }
    
    // 実行可能状態の色分け
    const executableIcon = isExecutable ? '○' : '×';
    const executableClass = isExecutable ? 'executable-yes' : 'executable-no';
    
    // NULL値とスキップ理由の改善表示
    const displayModel = task.model || '<span class="null-value">未設定</span>';
    const displayOperation = task.specialOperation || '<span class="null-value">未設定</span>';
    
    // スキップ理由の詳細説明
    let displaySkipReason = '<span class="no-setting">実行可能</span>';
    if (task.skipReason) {
      displaySkipReason = `<span class="skip-reason-text">${task.skipReason}</span>`;
    } else if (!task.prompt || task.prompt.trim().length === 0) {
      displaySkipReason = '<span class="skip-reason-text">プロンプトなし</span>';
    } else if (!isExecutable) {
      displaySkipReason = '<span class="skip-reason-text">実行条件未満</span>';
    }
    
    const displayGroupId = task.groupId || '<span class="null-value">-</span>';
    const displayPromptColumn = task.promptColumn || '<span class="null-value">-</span>';
    
    // ログ情報の整形表示
    const displayLogInfo = logInfoText !== '設定なし' ? 
      `<span class="log-info-formatted">${logInfoText.length > 40 ? logInfoText.substring(0, 40) + '...' : logInfoText}</span>` :
      '<span class="no-setting">設定なし</span>';
    
    // 制御フラグの整形表示
    const displayControlFlags = controlFlagsText !== '設定なし' ? 
      `<span class="control-flags-formatted">${controlFlagsText.length > 30 ? controlFlagsText.substring(0, 30) + '...' : controlFlagsText}</span>` :
      '<span class="no-setting">設定なし</span>';
    
    // メタデータの整形表示
    const displayMetadata = metadataText !== '設定なし' ? 
      `<span class="metadata-formatted">${metadataText.length > 40 ? metadataText.substring(0, 40) + '...' : metadataText}</span>` :
      '<span class="no-setting">設定なし</span>';

    // AI種別の判定（3種類AIかどうか）
    const aiGroupType = task.multiAI || (task.logColumns && task.logColumns.layout === '3type') ? '3種類AI' : '単体AI';
    const aiGroupClass = aiGroupType === '3種類AI' ? 'ai-group-multi' : 'ai-group-single';
    
    // プロンプトセルと回答セルの情報
    const promptCell = task.promptColumn ? `${task.promptColumn}${task.row}` : '-';
    const answerCell = `${task.column}${task.row}`;
    
    tr.innerHTML = `
      <td class="task-ai-group ${aiGroupClass}">${aiGroupType}</td>
      <td class="task-executable ${executableClass}">${executableIcon}</td>
      <td class="task-prompt-cell">${promptCell}</td>
      <td class="task-answer-cell">${answerCell}</td>
      <td class="task-ai">
        <span class="ai-badge ai-${task.aiType}">${task.aiType.toUpperCase()}</span>
      </td>
      <td class="task-model">${displayModel}</td>
      <td class="task-operation">${displayOperation}</td>
      <td class="task-prompt prompt-cell" data-full-text="${task.prompt || ''}" title="クリックで全文表示">${promptPreview}</td>
      <td class="task-skip-reason detail-column">${displaySkipReason}</td>
      <td class="task-id detail-column" title="${task.id}">${task.id || '<span class="null-value">-</span>'}</td>
      <td class="task-group-id detail-column" title="${task.groupId || ''}">${displayGroupId}</td>
      <td class="task-log-info detail-column" title="${logInfoText}">${displayLogInfo}</td>
      <td class="task-control-flags detail-column" title="${controlFlagsText}">${displayControlFlags}</td>
      <td class="task-metadata detail-column" title="${metadataText}">${displayMetadata}</td>
    `;
    
    aiTbody.appendChild(tr);
  });
  
  aiTable.appendChild(aiTbody);
  container.appendChild(aiTable);
  
  // レポートタスクテーブル（レポートタスクがある場合のみ表示）
  if (reportTasks.length > 0) {
    const reportTableTitle = document.createElement('h3');
    reportTableTitle.textContent = 'レポート化タスク一覧';
    reportTableTitle.style.marginTop = '30px';
    container.appendChild(reportTableTitle);
    
    const reportTable = document.createElement('table');
    reportTable.className = 'tasks-table report-tasks-table';
    
    const reportThead = document.createElement('thead');
    reportThead.innerHTML = `
      <tr>
        <th>タイプ</th>
        <th>実行可能</th>
        <th>ソース列</th>
        <th>レポート列</th>
        <th>行</th>
        <th>依存タスク</th>
        <th class="detail-column" title="タスクID">タスクID</th>
        <th class="detail-column" title="グループID">グループID</th>
      </tr>
    `;
    reportTable.appendChild(reportThead);
    
    const reportTbody = document.createElement('tbody');
    reportTasks.forEach(task => {
      const tr = document.createElement('tr');
      
      // レポートタスクの実行可能判定
      const isExecutable = !task.skipReason;
      const executableIcon = isExecutable ? '○' : '×';
      const executableClass = isExecutable ? 'executable-yes' : 'executable-no';
      
      const displayGroupId = task.groupId || '<span class="null-value">-</span>';
      const dependsOn = task.dependsOn || '<span class="null-value">-</span>';
      
      tr.innerHTML = `
        <td class="task-type">レポート化</td>
        <td class="task-executable ${executableClass}">${executableIcon}</td>
        <td class="task-source-column">${task.sourceColumn || '-'}列</td>
        <td class="task-report-column">${task.reportColumn || task.column}列</td>
        <td class="task-row">${task.row}行目</td>
        <td class="task-depends-on">${dependsOn}</td>
        <td class="task-id detail-column" title="${task.id}">${task.id || '<span class="null-value">-</span>'}</td>
        <td class="task-group-id detail-column" title="${task.groupId || ''}">${displayGroupId}</td>
      `;
      
      reportTbody.appendChild(tr);
    });
    
    reportTable.appendChild(reportTbody);
    container.appendChild(reportTable);
  }
  
  // ソート・フィルタ・検索機能の初期化（AIタスクテーブルに対して）
  initializeTaskTableControls(aiTable, aiTasks);
  
  // 詳細列の初期状態を非表示にする
  toggleDetailColumnsFunction(false);
  
  // プロンプトクリック機能を初期化（AIテーブルに対して）
  initializePromptClickFeature(aiTable);
  
  // 詳細情報セクション（折りたたみ可能）
  const detailsSection = document.createElement('div');
  detailsSection.className = 'task-details-section';
  detailsSection.innerHTML = '<h3>タスク詳細情報</h3>';
  
  const detailsContainer = document.createElement('div');
  detailsContainer.className = 'task-details-container';
  
  currentTaskList.tasks.forEach((task, index) => {
    const taskDetail = document.createElement('div');
    taskDetail.className = 'task-detail-item';
    
    const groupInfo = task.groupInfo ? `
      <div class="detail-row">
        <span class="detail-label">グループタイプ:</span>
        <span class="detail-value">${task.groupInfo.type}</span>
      </div>
      ${task.groupInfo.columns ? `
        <div class="detail-row">
          <span class="detail-label">グループ列:</span>
          <span class="detail-value">${task.groupInfo.columns.join(', ')}</span>
        </div>
      ` : ''}
      ${task.groupInfo.sourceColumn ? `
        <div class="detail-row">
          <span class="detail-label">ソース列:</span>
          <span class="detail-value">${task.groupInfo.sourceColumn}</span>
        </div>
      ` : ''}
      ${task.groupInfo.reportColumn ? `
        <div class="detail-row">
          <span class="detail-label">レポート列:</span>
          <span class="detail-value">${task.groupInfo.reportColumn}</span>
        </div>
      ` : ''}
    ` : '';
    
    taskDetail.innerHTML = `
      <h4>タスク ${index + 1}: ${task.column}${task.row}</h4>
      <div class="detail-grid">
        <div class="detail-row">
          <span class="detail-label">ID:</span>
          <span class="detail-value">${task.id}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">タイプ:</span>
          <span class="detail-value">${task.taskType || 'ai'}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">AI:</span>
          <span class="detail-value">${task.aiType}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">グループID:</span>
          <span class="detail-value">${task.groupId || '-'}</span>
        </div>
        ${groupInfo}
        <div class="detail-row">
          <span class="detail-label">マルチAI:</span>
          <span class="detail-value">${task.multiAI ? 'はい' : 'いいえ'}</span>
        </div>
        ${task.metadata && Object.keys(task.metadata).length > 0 ? `
          <div class="detail-row">
            <span class="detail-label">メタデータ:</span>
            <span class="detail-value">${JSON.stringify(task.metadata)}</span>
          </div>
        ` : ''}
      </div>
    `;
    
    detailsContainer.appendChild(taskDetail);
  });
  
  detailsSection.appendChild(detailsContainer);
  container.appendChild(detailsSection);
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

// タスクテーブル制御機能
function initializeTaskTableControls(table, tasks) {
  let currentTasks = [...tasks];
  let sortState = { column: null, direction: 'asc' };
  
  // 列リサイズ機能を初期化
  initializeColumnResize(table);
  
  // ソート機能
  const sortableHeaders = table.querySelectorAll('th.sortable');
  sortableHeaders.forEach(header => {
    header.addEventListener('click', () => {
      const sortKey = header.dataset.sort;
      
      // ソート方向の切り替え
      if (sortState.column === sortKey) {
        sortState.direction = sortState.direction === 'asc' ? 'desc' : 'asc';
      } else {
        sortState.column = sortKey;
        sortState.direction = 'asc';
      }
      
      // ソートアイコンの更新
      sortableHeaders.forEach(h => {
        const icon = h.querySelector('.sort-icon');
        if (h === header) {
          icon.textContent = sortState.direction === 'asc' ? '↑' : '↓';
          h.classList.add('sort-active');
        } else {
          icon.textContent = '⚊';
          h.classList.remove('sort-active');
        }
      });
      
      // ソート実行
      sortTasks(sortKey, sortState.direction);
    });
  });
  
  // フィルタとサーチのイベントリスナー
  const taskSearch = document.getElementById('taskSearch');
  const aiTypeFilter = document.getElementById('aiTypeFilter');
  const executableFilter = document.getElementById('executableFilter');
  const taskTypeFilter = document.getElementById('taskTypeFilter');
  const resetFilters = document.getElementById('resetFilters');
  const exportTasks = document.getElementById('exportTasks');
  const toggleDetailColumns = document.getElementById('toggleDetailColumns');
  
  [taskSearch, aiTypeFilter, executableFilter, taskTypeFilter].forEach(control => {
    if (control) {
      control.addEventListener('input', filterTasks);
      control.addEventListener('change', filterTasks);
    }
  });
  
  if (resetFilters) {
    resetFilters.addEventListener('click', () => {
      taskSearch.value = '';
      aiTypeFilter.value = '';
      executableFilter.value = '';
      taskTypeFilter.value = '';
      filterTasks();
    });
  }
  
  if (exportTasks) {
    exportTasks.addEventListener('click', exportTasksToCSV);
  }
  
  if (toggleDetailColumns) {
    let detailColumnsVisible = false;
    toggleDetailColumns.addEventListener('click', () => {
      detailColumnsVisible = !detailColumnsVisible;
      toggleDetailColumnsFunction(detailColumnsVisible);
      toggleDetailColumns.textContent = detailColumnsVisible ? '詳細列非表示' : '詳細列表示';
    });
  }
  
  // ソート関数
  function sortTasks(sortKey, direction) {
    currentTasks.sort((a, b) => {
      let aVal = getTaskValue(a, sortKey);
      let bVal = getTaskValue(b, sortKey);
      
      // 文字列の場合は大文字小文字を無視
      if (typeof aVal === 'string') aVal = aVal.toLowerCase();
      if (typeof bVal === 'string') bVal = bVal.toLowerCase();
      
      if (aVal < bVal) return direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return direction === 'asc' ? 1 : -1;
      return 0;
    });
    
    updateTableDisplay();
  }
  
  // フィルタ関数
  function filterTasks() {
    const searchTerm = taskSearch.value.toLowerCase();
    const aiType = aiTypeFilter.value;
    const executable = executableFilter.value;
    const taskType = taskTypeFilter.value;
    
    currentTasks = tasks.filter(task => {
      // 検索フィルタ
      if (searchTerm) {
        const searchFields = [
          task.id || '',
          task.prompt || '',
          task.model || '',
          task.specialOperation || ''
        ].join(' ').toLowerCase();
        
        if (!searchFields.includes(searchTerm)) return false;
      }
      
      // AIタイプフィルタ
      if (aiType && task.aiType !== aiType) return false;
      
      // 実行可能フィルタ
      if (executable) {
        const isExecutable = !task.skipReason && task.prompt && task.prompt.trim().length > 0;
        if (executable === 'yes' && !isExecutable) return false;
        if (executable === 'no' && isExecutable) return false;
      }
      
      // タスクタイプフィルタ
      if (taskType && (task.taskType || 'ai') !== taskType) return false;
      
      return true;
    });
    
    updateTableDisplay();
  }
  
  // テーブル表示更新
  function updateTableDisplay() {
    const tbody = table.querySelector('tbody');
    tbody.innerHTML = '';
    
    currentTasks.forEach(task => {
      // 既存のタスク行生成ロジックを再利用
      const tr = document.createElement('tr');
      
      const isExecutable = !task.skipReason && task.prompt && task.prompt.trim().length > 0;
      if (!isExecutable) {
        tr.classList.add('task-skipped');
      }
      
      const promptPreview = task.prompt ? 
        (task.prompt.length > 50 ? task.prompt.substring(0, 50) + '...' : task.prompt) :
        '(なし)';
      
      const executableIcon = isExecutable ? '○' : '×';
      const executableClass = isExecutable ? 'executable-yes' : 'executable-no';
      
      // ログ情報、制御フラグ、メタデータの生成（簡略版）
      const logInfo = task.logColumns ? 
        [
          task.logColumns.log && `ログ:${task.logColumns.log}`,
          task.logColumns.layout && `レイアウト:${task.logColumns.layout}`,
          task.logColumns.aiColumns && `AI列:${Object.entries(task.logColumns.aiColumns).map(([col, ai]) => `${col}:${ai}`).join(',')}`
        ].filter(Boolean).join(' | ') : '-';
      
      const controlFlags = task.controlFlags ? 
        Object.entries(task.controlFlags).map(([key, value]) => `${key}:${value}`).join(',') : 
        '-';
      
      const metadata = task.metadata && Object.keys(task.metadata).length > 0 ? 
        JSON.stringify(task.metadata) : 
        '-';
      
      tr.innerHTML = `
        <td class="task-cell">${task.column}${task.row}</td>
        <td class="task-ai">
          <span class="ai-badge ai-${task.aiType}">${task.aiType.toUpperCase()}</span>
        </td>
        <td class="task-type">${task.taskType || 'ai'}</td>
        <td class="task-executable ${executableClass}">${executableIcon}</td>
        <td class="task-prompt" title="${task.prompt || ''}">${promptPreview}</td>
        <td class="task-model">${task.model || '<span class="null-value">未設定</span>'}</td>
        <td class="task-operation">${task.specialOperation || '<span class="null-value">未設定</span>'}</td>
        <td class="task-prompt-column">${task.promptColumn || '<span class="null-value">-</span>'}</td>
        <td class="task-multi-ai">${task.multiAI ? 'はい' : 'いいえ'}</td>
        <td class="task-skip-reason">${task.skipReason || '<span class="null-value">-</span>'}</td>
        <td class="task-id" title="${task.id}">${task.id || '-'}</td>
        <td class="task-group-id" title="${task.groupId || ''}">${task.groupId || '<span class="null-value">-</span>'}</td>
        <td class="task-log-info" title="${logInfo}">${logInfo.length > 30 ? logInfo.substring(0, 30) + '...' : logInfo}</td>
        <td class="task-control-flags" title="${controlFlags}">${controlFlags.length > 20 ? controlFlags.substring(0, 20) + '...' : controlFlags}</td>
        <td class="task-metadata" title="${metadata}">${metadata.length > 30 ? metadata.substring(0, 30) + '...' : metadata}</td>
      `;
      
      tbody.appendChild(tr);
    });
  }
  
  // タスク値取得ヘルパー
  function getTaskValue(task, key) {
    switch (key) {
      case 'id': return task.id || '';
      case 'aiGroupType': return task.multiAI || (task.logColumns && task.logColumns.layout === '3type') ? '3種類AI' : '単体AI';
      case 'promptCell': return task.promptColumn ? `${task.promptColumn}${task.row}` : '-';
      case 'answerCell': return `${task.column}${task.row}`;
      case 'aiType': return task.aiType || '';
      case 'taskType': return task.taskType || 'ai';
      case 'prompt': return task.prompt || '';
      case 'model': return task.model || '';
      case 'operation': return task.specialOperation || '';
      case 'executable': return !task.skipReason && task.prompt && task.prompt.trim().length > 0;
      case 'skipReason': return task.skipReason || '';
      case 'groupId': return task.groupId || '';
      case 'promptColumn': return task.promptColumn || '';
      case 'multiAI': return task.multiAI || false;
      default: return '';
    }
  }
  
  // CSV エクスポート
  function exportTasksToCSV() {
    const headers = [
      'AI種別', 'プロンプトセル', '回答セル', 'AI', '実行可能', 'モデル', '機能', 'プロンプト', 'タスクタイプ',
      'スキップ理由', 'グループID', 'タスクID'
    ];
    
    const csvData = [headers];
    
    currentTasks.forEach(task => {
      const isExecutable = !task.skipReason && task.prompt && task.prompt.trim().length > 0;
      const aiGroupType = task.multiAI || (task.logColumns && task.logColumns.layout === '3type') ? '3種類AI' : '単体AI';
      const promptCell = task.promptColumn ? `${task.promptColumn}${task.row}` : '-';
      const answerCell = `${task.column}${task.row}`;
      
      csvData.push([
        aiGroupType,
        promptCell,
        answerCell,
        task.aiType || '',
        isExecutable ? '○' : '×',
        task.model || '',
        task.specialOperation || '',
        task.prompt || '',
        task.taskType || 'ai',
        task.skipReason || '',
        task.groupId || '',
        task.id || ''
      ]);
    });
    
    const csvContent = csvData.map(row => 
      row.map(cell => `"${(cell || '').toString().replace(/"/g, '""')}"`).join(',')
    ).join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `tasks_export_${new Date().toISOString().slice(0,10)}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

// 詳細列の表示/非表示切り替え
function toggleDetailColumnsFunction(show) {
  // ヘッダーの詳細列
  const detailHeaders = document.querySelectorAll('th.detail-column');
  detailHeaders.forEach(header => {
    header.style.display = show ? 'table-cell' : 'none';
  });
  
  // データ行の詳細列セル
  const detailCells = document.querySelectorAll('td.detail-column');
  detailCells.forEach(cell => {
    cell.style.display = show ? 'table-cell' : 'none';
  });
}

// プロンプトクリック機能
function initializePromptClickFeature(table) {
  table.addEventListener('click', (e) => {
    if (e.target.closest('.prompt-cell')) {
      const cell = e.target.closest('.prompt-cell');
      const fullText = cell.dataset.fullText;
      
      if (fullText && fullText.trim() !== '') {
        showPromptModal(fullText);
      }
    }
  });
}

// プロンプト全文表示モーダル
function showPromptModal(text) {
  const modal = document.createElement('div');
  modal.className = 'prompt-modal';
  modal.innerHTML = `
    <div class="prompt-modal-content">
      <div class="prompt-modal-header">
        <h3>プロンプト全文</h3>
        <button class="prompt-modal-close">×</button>
      </div>
      <div class="prompt-modal-body">
        <pre class="prompt-text">${text}</pre>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // モーダルを表示
  setTimeout(() => modal.classList.add('show'), 10);
  
  // 閉じるボタンとバックグラウンドクリックで閉じる
  const closeButton = modal.querySelector('.prompt-modal-close');
  const modalContent = modal.querySelector('.prompt-modal-content');
  
  closeButton.addEventListener('click', () => closePromptModal(modal));
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      closePromptModal(modal);
    }
  });
  
  // ESCキーで閉じる
  const handleEscape = (e) => {
    if (e.key === 'Escape') {
      closePromptModal(modal);
      document.removeEventListener('keydown', handleEscape);
    }
  };
  document.addEventListener('keydown', handleEscape);
}

function closePromptModal(modal) {
  modal.classList.remove('show');
  setTimeout(() => {
    if (modal.parentNode) {
      modal.parentNode.removeChild(modal);
    }
  }, 300);
}

// 列リサイズ機能
function initializeColumnResize(table) {
  const headers = table.querySelectorAll('th');
  let isResizing = false;
  let currentColumn = null;
  let startX = 0;
  let startWidth = 0;
  
  // 各ヘッダーにリサイズハンドルを追加
  headers.forEach((header, index) => {
    if (index === headers.length - 1) return; // 最後の列はリサイズしない
    
    // リサイズハンドルを作成
    const resizeHandle = document.createElement('div');
    resizeHandle.className = 'resize-handle';
    header.appendChild(resizeHandle);
    header.classList.add('resizable');
    
    // マウスイベントの追加
    resizeHandle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      isResizing = true;
      currentColumn = header;
      startX = e.clientX;
      startWidth = parseInt(window.getComputedStyle(header).width, 10);
      
      document.addEventListener('mousemove', handleResize);
      document.addEventListener('mouseup', stopResize);
      
      // リサイズ中のカーソルを変更
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    });
  });
  
  function handleResize(e) {
    if (!isResizing || !currentColumn) return;
    
    const diff = e.clientX - startX;
    const newWidth = Math.max(50, startWidth + diff); // 最小幅50px
    
    currentColumn.style.width = newWidth + 'px';
    currentColumn.style.minWidth = newWidth + 'px';
    currentColumn.style.maxWidth = newWidth + 'px';
    
    // 対応するtd要素にも同じ幅を適用
    const columnIndex = Array.from(currentColumn.parentNode.children).indexOf(currentColumn);
    const rows = table.querySelectorAll('tbody tr');
    rows.forEach(row => {
      const cell = row.children[columnIndex];
      if (cell) {
        cell.style.width = newWidth + 'px';
        cell.style.minWidth = newWidth + 'px';
        cell.style.maxWidth = newWidth + 'px';
      }
    });
  }
  
  function stopResize() {
    isResizing = false;
    currentColumn = null;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    
    document.removeEventListener('mousemove', handleResize);
    document.removeEventListener('mouseup', stopResize);
  }
}

// 制御マッピンググリッドの表示
function displayControlMappingGrid(controls) {
  const container = document.getElementById('controlMappingDiagram');
  if (!container) {
    console.error('[制御マッピング] コンテナが見つかりません');
    return;
  }
  
  console.log('[制御マッピング] グリッド表示開始', controls);
  
  container.innerHTML = '';
  
  // グリッドの説明
  const description = document.createElement('div');
  description.className = 'mapping-description';
  description.innerHTML = `
    <p>スプレッドシートの制御状況を視覚的に表示します。色の意味：</p>
    <div class="legend">
      <span class="legend-item"><span class="control-color only"></span> この行/列のみ処理</span>
      <span class="legend-item"><span class="control-color from"></span> ここから処理開始</span>
      <span class="legend-item"><span class="control-color until"></span> ここまで処理</span>
      <span class="legend-item"><span class="control-color range"></span> 範囲処理</span>
    </div>
  `;
  container.appendChild(description);
  
  // グリッドテーブルの作成
  const table = document.createElement('table');
  table.className = 'control-mapping-table';
  
  // ヘッダー行
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  headerRow.innerHTML = '<th>行/列</th>';
  
  // A-Z列のヘッダー
  for (let i = 0; i < 26; i++) {
    const th = document.createElement('th');
    th.textContent = String.fromCharCode(65 + i);
    th.className = 'column-header';
    headerRow.appendChild(th);
  }
  thead.appendChild(headerRow);
  table.appendChild(thead);
  
  // データ行（1-10行）
  const tbody = document.createElement('tbody');
  for (let row = 1; row <= 10; row++) {
    const tr = document.createElement('tr');
    const rowHeader = document.createElement('th');
    rowHeader.textContent = row;
    rowHeader.className = 'row-header';
    tr.appendChild(rowHeader);
    
    // 各セル
    for (let col = 0; col < 26; col++) {
      const td = document.createElement('td');
      const colLetter = String.fromCharCode(65 + col);
      
      // 行制御のチェック
      const rowControl = controls?.rowControls?.find(c => c.row === row);
      if (rowControl) {
        td.classList.add('has-control', `control-${rowControl.type}`);
        td.title = `行${row}: ${rowControl.type}`;
      }
      
      // 列制御のチェック
      const colControl = controls?.columnControls?.find(c => c.column === colLetter);
      if (colControl) {
        td.classList.add('has-control', `control-${colControl.type}`);
        td.title = (td.title ? td.title + ', ' : '') + `${colLetter}列: ${colControl.type}`;
      }
      
      // セルの内容（制御タイプのアイコン）
      if (rowControl || colControl) {
        const types = [];
        if (rowControl) types.push(rowControl.type[0].toUpperCase());
        if (colControl) types.push(colControl.type[0].toLowerCase());
        td.textContent = types.join('/');
      }
      
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  
  container.appendChild(table);
}

// パフォーマンス表示更新
function updatePerformanceDisplay(steps, totalTime) {
  // 総実行時間の更新
  const totalTimeEl = document.getElementById('totalExecutionTime');
  if (totalTimeEl) {
    totalTimeEl.textContent = `${totalTime.toFixed(2)} ms`;
  }
  
  // 読み込み時間の更新
  const loadTimeEl = document.getElementById('loadTime');
  if (loadTimeEl && steps.length > 0) {
    const loadStep = steps.find(s => s.name === 'データ読み込み');
    loadTimeEl.textContent = loadStep ? `${loadStep.time.toFixed(2)} ms` : '-';
  }
  
  // タスク生成時間の更新
  const taskGenTimeEl = document.getElementById('taskGenTime');
  if (taskGenTimeEl && steps.length > 0) {
    const taskStep = steps.find(s => s.name === 'タスク生成');
    taskGenTimeEl.textContent = taskStep ? `${taskStep.time.toFixed(2)} ms` : '-';
  }
  
  // 詳細テーブルの更新
  const perfTableBody = document.getElementById('perfTableBody');
  if (perfTableBody) {
    perfTableBody.innerHTML = '';
    
    steps.forEach(step => {
      const percentage = ((step.time / totalTime) * 100).toFixed(1);
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${step.name}</td>
        <td>${step.time.toFixed(2)}</td>
        <td>
          <div class="perf-bar" style="width: ${percentage}%; background: var(--primary-color);">
            ${percentage}%
          </div>
        </td>
      `;
      perfTableBody.appendChild(tr);
    });
  }
}

// グローバルに公開（デバッグ用）
window.testSpreadsheet = {
  currentSpreadsheetData,
  currentTaskList,
  currentControls,
  DEBUG
};