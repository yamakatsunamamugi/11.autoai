// test-window-creation.js - ウィンドウ作成テストツール

// グローバル変数
let spreadsheetData = null;
let taskList = null;
let activeWindows = new Map();
let testStartTime = null;

// DOM要素
const elements = {
  totalTasks: document.getElementById('totalTasks'),
  processedTasks: document.getElementById('processedTasks'),
  activeWindows: document.getElementById('activeWindows'),
  maxWindows: document.getElementById('maxWindows'),
  openWindowWithSettingsBtn: document.getElementById('openWindowWithSettingsBtn'),
  testStreamProcessorBtn: document.getElementById('testStreamProcessorBtn'),
  openMultipleWindowsBtn: document.getElementById('openMultipleWindowsBtn'),
  closeAllWindowsBtn: document.getElementById('closeAllWindowsBtn'),
  closeSelectedWindowBtn: document.getElementById('closeSelectedWindowBtn'),
  clearLogBtn: document.getElementById('clearLogBtn'),
  windowGrid: document.getElementById('windowGrid'),
  logContainer: document.getElementById('logContainer'),
  statusIndicator: document.getElementById('statusIndicator'),
  statusText: document.getElementById('statusText'),
  statusTime: document.getElementById('statusTime'),
  // テスト設定要素
  aiTypeSelect: document.getElementById('aiTypeSelect'),
  columnSelect: document.getElementById('columnSelect'),
  rowNumber: document.getElementById('rowNumber'),
  positionSelect: document.getElementById('positionSelect'),
  modelSelect: document.getElementById('modelSelect'),
  taskTypeSelect: document.getElementById('taskTypeSelect'),
  promptText: document.getElementById('promptText')
};

// 初期化
document.addEventListener('DOMContentLoaded', () => {
  log('テストツール起動完了', 'success');
  setupEventListeners();
  
  // 親ウィンドウからのメッセージを待機
  window.addEventListener('message', handleMessage);
});

// イベントリスナー設定
function setupEventListeners() {
  elements.openWindowWithSettingsBtn.addEventListener('click', openWindowWithSettings);
  elements.testStreamProcessorBtn.addEventListener('click', testStreamProcessor);
  elements.openMultipleWindowsBtn.addEventListener('click', openMultipleWindows);
  elements.closeAllWindowsBtn.addEventListener('click', closeAllWindows);
  elements.closeSelectedWindowBtn.addEventListener('click', closeSelectedWindow);
  elements.clearLogBtn.addEventListener('click', clearLog);
}

// 親ウィンドウからのメッセージ処理
function handleMessage(event) {
  if (event.data && event.data.type === 'INIT_TEST') {
    spreadsheetData = event.data.spreadsheetData;
    const taskCount = event.data.taskCount || 0;
    
    elements.totalTasks.textContent = taskCount;
    log(`スプレッドシートデータを受信: ${taskCount}個のタスク`, 'success');
    
    // テスト開始ボタンを有効化
    elements.startTestBtn.disabled = false;
  }
}

// ログ出力
function log(message, type = 'info') {
  const time = new Date().toLocaleTimeString('ja-JP');
  const entry = document.createElement('div');
  entry.className = `log-entry ${type}`;
  entry.innerHTML = `<span class="log-time">[${time}]</span>${message}`;
  
  elements.logContainer.appendChild(entry);
  elements.logContainer.scrollTop = elements.logContainer.scrollHeight;
  
  // コンソールにも出力
  console.log(`[${type.toUpperCase()}] ${message}`);
}

// ステータス更新
function updateStatus(text, type = 'idle') {
  elements.statusText.textContent = text;
  elements.statusIndicator.className = 'status-indicator';
  
  if (type === 'active') {
    elements.statusIndicator.classList.add('active');
  } else if (type === 'error') {
    elements.statusIndicator.classList.add('error');
  }
  
  // 経過時間を更新
  if (testStartTime) {
    const elapsed = Math.floor((Date.now() - testStartTime) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    elements.statusTime.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }
}

// テスト開始
async function startTest() {
  if (!spreadsheetData) {
    log('スプレッドシートデータがありません', 'error');
    return;
  }
  
  log('===== ウィンドウ作成テスト開始 =====', 'success');
  testStartTime = Date.now();
  updateStatus('テスト実行中', 'active');
  
  // タスクジェネレーターのインポート（動的）
  try {
    // StreamProcessorのモックアップを作成
    log('StreamProcessorのテスト環境を構築中...', 'info');
    
    // テスト用のタスクリストを作成
    const mockTaskList = createMockTaskList();
    log(`モックタスクリスト作成: ${mockTaskList.length}個のタスク`, 'success');
    
    // ウィンドウ作成のシミュレーション
    await simulateWindowCreation(mockTaskList);
    
  } catch (error) {
    log(`エラー: ${error.message}`, 'error');
    updateStatus('エラー発生', 'error');
  }
}

// モックタスクリストの作成
function createMockTaskList() {
  const tasks = [];
  const columns = ['C', 'F', 'I', 'L']; // 4列
  const aiTypes = ['chatgpt', 'claude', 'gemini', 'chatgpt'];
  
  columns.forEach((column, index) => {
    // 各列に3つのタスク
    for (let row = 2; row <= 4; row++) {
      tasks.push({
        id: `${column}${row}_mock`,
        column: column,
        row: row,
        aiType: aiTypes[index],
        prompt: `テストプロンプト ${column}${row}`,
        status: 'pending'
      });
    }
  });
  
  return tasks;
}

// ウィンドウ作成シミュレーション
async function simulateWindowCreation(tasks) {
  log('ウィンドウ作成シミュレーション開始', 'info');
  
  // 列ごとにグループ化
  const tasksByColumn = {};
  tasks.forEach(task => {
    if (!tasksByColumn[task.column]) {
      tasksByColumn[task.column] = [];
    }
    tasksByColumn[task.column].push(task);
  });
  
  const columns = Object.keys(tasksByColumn).sort();
  log(`${columns.length}列のタスクを処理`, 'info');
  
  // 順次ウィンドウを開く
  for (let i = 0; i < columns.length && i < 4; i++) {
    const column = columns[i];
    const columnTasks = tasksByColumn[column];
    const position = i; // 0: 左上, 1: 右上, 2: 左下, 3: 右下
    
    await createWindow(column, columnTasks[0], position);
    await sleep(500); // 視覚的にわかりやすくするため
  }
  
  log('ウィンドウ作成シミュレーション完了', 'success');
  updateStatus('テスト完了', 'idle');
}

// 設定に基づいて本番のStreamProcessorでウィンドウを開く
async function openWindowWithSettings() {
  log('設定に基づいて本番コードでウィンドウを開きます', 'info');
  
  try {
    // 本番のモジュールをインポート
    const [streamModule, generatorModule, modelsModule] = await Promise.all([
      import('../src/features/task/stream-processor.js'),
      import('../src/features/task/generator.js'),
      import('../src/features/task/models.js')
    ]);
    
    const StreamProcessor = streamModule.default;
    const TaskGenerator = generatorModule.default;
    const { Task, TaskList } = modelsModule;
    
    log('本番モジュールをインポートしました', 'success');
    
    // 設定値を取得（テスト用の設定）
    const aiType = elements.aiTypeSelect.value;
    const column = elements.columnSelect.value;
    const row = parseInt(elements.rowNumber.value);
    const prompt = elements.promptText.value;
    const model = elements.modelSelect.value;
    const taskType = elements.taskTypeSelect.value;
    
    // テスト用のスプレッドシートデータを作成
    const testData = createTestSpreadsheetDataForSingleTask(column, row, aiType, prompt);
    
    // 本番のTaskGeneratorでタスクリストを生成
    const taskGenerator = new TaskGenerator();
    const taskList = taskGenerator.generateTasks(testData);
    
    log(`タスクリスト生成完了: ${taskList.tasks.length}個のタスク`, 'info');
    
    if (taskList.tasks.length === 0) {
      log('タスクが生成されませんでした。データを確認してください。', 'error');
      return;
    }
    
    // モデル情報を設定（必要な場合）
    if (model && taskList.tasks[0]) {
      taskList.tasks[0].model = model;
    }
    
    // 本番のStreamProcessorで実行
    const streamProcessor = new StreamProcessor();
    
    log('本番のprocessTaskStreamを実行します...', 'info');
    const result = await streamProcessor.processTaskStream(taskList, testData);
    
    log('ウィンドウ作成完了', 'success');
    log(`結果: ${JSON.stringify(result)}`, 'info');
    
    // アクティブウィンドウの状態を更新
    updateActiveWindowsFromStreamProcessor(streamProcessor);
    
    // グローバルに保持（後でクローズできるように）
    window.testStreamProcessor = streamProcessor;
    
  } catch (error) {
    log(`エラー: ${error.message}`, 'error');
    console.error('詳細エラー:', error);
  }
}

// 単一タスク用のテストデータを作成
function createTestSpreadsheetDataForSingleTask(column, row, aiType, prompt) {
  const columnIndex = column.charCodeAt(0) - 65;
  
  const data = {
    spreadsheetId: 'test_spreadsheet_id',
    gid: '12345',
    values: [],
    menuRow: { index: 0, data: [] },
    aiRow: { index: 1, data: [] },
    modelRow: null,
    taskRow: null,
    workRows: [],
    aiColumns: {},
    columnMapping: {}
  };
  
  // メニュー行を設定
  data.menuRow.data[columnIndex] = 'プロンプト';
  data.menuRow.data[columnIndex + 1] = `${aiType}回答`;
  
  // AI列情報を設定
  data.aiColumns[column] = {
    index: columnIndex,
    letter: column,
    header: 'プロンプト',
    type: 'single'
  };
  
  // 作業行を1つだけ追加
  const workRow = {
    index: row - 1,
    number: row,
    data: []
  };
  workRow.data[columnIndex] = prompt;
  data.workRows.push(workRow);
  
  // valuesにも追加
  data.values[row - 1] = workRow.data;
  
  return data;
}

// 本番のStreamProcessorを使用したテスト実行
async function testStreamProcessor() {
  log('===== 本番StreamProcessor実行テスト開始 =====', 'success');
  
  try {
    // 本番のStreamProcessorをインポート
    const streamModule = await import('../src/features/task/stream-processor.js');
    const StreamProcessor = streamModule.default;
    
    log('本番のStreamProcessorをインポートしました', 'success');
    
    // 本番のTaskGeneratorもインポート
    const generatorModule = await import('../src/features/task/generator.js');
    const TaskGenerator = generatorModule.default;
    
    log('本番のTaskGeneratorをインポートしました', 'success');
    
    // テスト用のスプレッドシートデータを作成（実際のデータ構造を模倣）
    const testSpreadsheetData = createTestSpreadsheetData();
    
    // 本番のTaskGeneratorでタスクリストを生成
    const taskGenerator = new TaskGenerator();
    const taskList = taskGenerator.generateTasks(testSpreadsheetData);
    
    log(`本番TaskGeneratorでタスクリスト生成: ${taskList.tasks.length}個のタスク`, 'info');
    
    // タスクリストの詳細をログ
    taskList.tasks.forEach((task, index) => {
      log(`  タスク${index + 1}: ${task.column}${task.row} - ${task.aiType}`, 'info');
    });
    
    // 本番のStreamProcessorインスタンスを作成
    const streamProcessor = new StreamProcessor();
    
    // processTaskStreamを実行
    log('本番のprocessTaskStreamを実行します...', 'info');
    const result = await streamProcessor.processTaskStream(taskList, testSpreadsheetData);
    
    log('本番StreamProcessor実行完了', 'success');
    log(`結果: ${JSON.stringify(result)}`, 'info');
    
    // アクティブウィンドウの状態を更新
    updateActiveWindowsFromStreamProcessor(streamProcessor);
    
  } catch (error) {
    log(`本番StreamProcessorテストエラー: ${error.message}`, 'error');
    console.error('詳細エラー:', error);
  }
}

// 複数行のテスト用スプレッドシートデータを作成
function createTestSpreadsheetData() {
  const aiType = elements.aiTypeSelect.value;
  const column = elements.columnSelect.value;
  const row = parseInt(elements.rowNumber.value);
  const prompt = elements.promptText.value;
  
  // 本番と同じデータ構造を作成
  const data = {
    spreadsheetId: 'test_spreadsheet_id',
    gid: '12345',
    values: [],
    menuRow: { index: 0, data: [] },
    aiRow: { index: 1, data: [] },
    modelRow: null,
    taskRow: null,
    workRows: [],
    aiColumns: {},
    columnMapping: {}
  };
  
  // メニュー行を設定
  const columnIndex = column.charCodeAt(0) - 65;
  data.menuRow.data[columnIndex] = 'プロンプト';
  data.menuRow.data[columnIndex + 1] = `${aiType}回答`;
  
  // AI列情報を設定
  data.aiColumns[column] = {
    index: columnIndex,
    letter: column,
    header: 'プロンプト',
    type: 'single'
  };
  
  // 作業行を追加（3行分）
  for (let i = 0; i < 3; i++) {
    const workRow = {
      index: row + i - 1,
      number: row + i,
      data: []
    };
    workRow.data[columnIndex] = `${prompt} (行${row + i})`;
    data.workRows.push(workRow);
    
    // valuesにも追加
    data.values[row + i - 1] = workRow.data;
  }
  
  log('テスト用スプレッドシートデータを作成しました', 'info');
  return data;
}

// StreamProcessorのアクティブウィンドウ情報を取得して更新
function updateActiveWindowsFromStreamProcessor(streamProcessor) {
  if (streamProcessor && streamProcessor.activeWindows) {
    const windowCount = streamProcessor.activeWindows.size;
    elements.activeWindows.textContent = windowCount;
    log(`StreamProcessorのアクティブウィンドウ数: ${windowCount}`, 'info');
    
    // グローバルのactiveWindowsにも反映
    activeWindows.clear();
    streamProcessor.activeWindows.forEach((windowInfo, windowId) => {
      activeWindows.set(windowId, windowInfo);
    });
    
    updateWindowGrid();
  }
}

// テスト用タスクリストを作成
function createTestTaskList() {
  // 設定から取得
  const aiType = elements.aiTypeSelect.value;
  const column = elements.columnSelect.value;
  const row = parseInt(elements.rowNumber.value);
  const taskType = elements.taskTypeSelect.value;
  const prompt = elements.promptText.value;
  
  // TaskListのモック
  const taskList = {
    tasks: [],
    getExecutableTasks: function() { return this.tasks; },
    getStatistics: function() {
      return {
        byAI: {
          chatgpt: this.tasks.filter(t => t.aiType === 'chatgpt').length,
          claude: this.tasks.filter(t => t.aiType === 'claude').length,
          gemini: this.tasks.filter(t => t.aiType === 'gemini').length
        }
      };
    }
  };
  
  // テストタスクを追加
  for (let i = 0; i < 3; i++) {
    taskList.tasks.push({
      id: `${column}${row + i}_test_${Date.now()}_${i}`,
      column: column,
      row: row + i,
      aiType: aiType,
      taskType: taskType,
      prompt: `${prompt} (行 ${row + i})`,
      promptColumn: column,
      groupId: `group_test_${column}`,
      logColumns: { log: column, layout: 'single' },
      groupInfo: { type: 'single', columns: [column], promptColumn: column }
    });
  }
  
  return taskList;
}

// 4分割ウィンドウを本番コードで開く
async function openMultipleWindows() {
  log('4分割ウィンドウテスト開始（本番コード使用）', 'info');
  
  try {
    // 本番のモジュールをインポート
    const [streamModule, generatorModule] = await Promise.all([
      import('../src/features/task/stream-processor.js'),
      import('../src/features/task/generator.js')
    ]);
    
    const StreamProcessor = streamModule.default;
    const TaskGenerator = generatorModule.default;
    
    log('本番モジュールをインポートしました', 'success');
    
    // 4つの異なる設定
    const testConfigs = [
      { column: 'C', aiType: 'chatgpt', model: 'gpt-4o' },
      { column: 'F', aiType: 'claude', model: null },
      { column: 'I', aiType: 'gemini', model: null },
      { column: 'L', aiType: 'chatgpt', model: 'o1-preview' }
    ];
    
    // テスト用のスプレッドシートデータを作成（4列分）
    const testData = createTestSpreadsheetDataForMultipleTasks(testConfigs);
    
    // 本番のTaskGeneratorでタスクリストを生成
    const taskGenerator = new TaskGenerator();
    const taskList = taskGenerator.generateTasks(testData);
    
    log(`タスクリスト生成完了: ${taskList.tasks.length}個のタスク`, 'info');
    
    // タスク詳細をログ
    taskList.tasks.forEach((task, index) => {
      log(`  タスク${index + 1}: ${task.column}${task.row} - ${task.aiType}`, 'info');
    });
    
    // 本番のStreamProcessorで実行
    const streamProcessor = new StreamProcessor();
    
    log('本番のprocessTaskStreamを実行します...', 'info');
    const result = await streamProcessor.processTaskStream(taskList, testData);
    
    log('4分割ウィンドウテスト完了', 'success');
    log(`結果: ${JSON.stringify(result)}`, 'info');
    
    // アクティブウィンドウの状態を更新
    updateActiveWindowsFromStreamProcessor(streamProcessor);
    
    // グローバルに保持（後でクローズできるように）
    window.testStreamProcessor = streamProcessor;
    
  } catch (error) {
    log(`エラー: ${error.message}`, 'error');
    console.error('詳細エラー:', error);
  }
}

// 複数タスク用のテストデータを作成
function createTestSpreadsheetDataForMultipleTasks(configs) {
  const data = {
    spreadsheetId: 'test_spreadsheet_id',
    gid: '12345',
    values: [],
    menuRow: { index: 0, data: [] },
    aiRow: { index: 1, data: [] },
    modelRow: null,
    taskRow: null,
    workRows: [],
    aiColumns: {},
    columnMapping: {}
  };
  
  // 各列の設定
  configs.forEach(config => {
    const columnIndex = config.column.charCodeAt(0) - 65;
    
    // メニュー行を設定
    data.menuRow.data[columnIndex] = 'プロンプト';
    data.menuRow.data[columnIndex + 1] = `${config.aiType}回答`;
    
    // AI列情報を設定
    data.aiColumns[config.column] = {
      index: columnIndex,
      letter: config.column,
      header: 'プロンプト',
      type: 'single'
    };
  });
  
  // 作業行を追加（各列に1つずつタスクを作成）
  const workRow = {
    index: 1, // 行2
    number: 2,
    data: []
  };
  
  configs.forEach(config => {
    const columnIndex = config.column.charCodeAt(0) - 65;
    workRow.data[columnIndex] = `テストプロンプト（${config.column}列）`;
  });
  
  data.workRows.push(workRow);
  data.values[1] = workRow.data;
  
  return data;
}

// これらの関数は削除（本番コードを使用するため不要）

// これらのヘルパー関数も削除（本番コードが独自に持っているため不要）

// 位置名を取得
function getPositionName(position) {
  const names = ['左上', '右上', '左下', '右下'];
  return names[position % 4];
}

// ウィンドウグリッドを更新
function updateWindowGrid() {
  elements.windowGrid.innerHTML = '';
  
  if (activeWindows.size === 0) {
    elements.windowGrid.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <div class="empty-state-icon">🪟</div>
        <div class="empty-state-text">ウィンドウがまだ開かれていません</div>
      </div>
    `;
    return;
  }
  
  // 位置順にソート
  const sortedWindows = Array.from(activeWindows.values()).sort((a, b) => a.position - b.position);
  
  sortedWindows.forEach(windowInfo => {
    const card = document.createElement('div');
    card.className = 'window-card active';
    card.innerHTML = `
      <div class="window-position">${getPositionName(windowInfo.position)}</div>
      <h4>列 ${windowInfo.column}</h4>
      <div class="window-info">
        <div class="window-info-row">
          <span class="window-info-label">AI タイプ</span>
          <span class="window-info-value">${windowInfo.aiType}</span>
        </div>
        <div class="window-info-row">
          <span class="window-info-label">ウィンドウ ID</span>
          <span class="window-info-value">${windowInfo.windowId}</span>
        </div>
        <div class="window-info-row">
          <span class="window-info-label">タスク</span>
          <span class="window-info-value">${windowInfo.task.id}</span>
        </div>
        <div class="window-info-row">
          <span class="window-info-label">作成時刻</span>
          <span class="window-info-value">${windowInfo.createdAt.toLocaleTimeString('ja-JP')}</span>
        </div>
      </div>
    `;
    elements.windowGrid.appendChild(card);
  });
}

// 全ウィンドウを閉じる（本番のStreamProcessorも対応）
async function closeAllWindows() {
  log('全ウィンドウを閉じます', 'info');
  
  // StreamProcessorインスタンスが存在する場合はそちらも閉じる
  try {
    const streamModule = await import('../src/features/task/stream-processor.js');
    const StreamProcessor = streamModule.default;
    
    // グローバルに保持されている可能性のあるStreamProcessorインスタンスをチェック
    if (window.testStreamProcessor) {
      log('本番StreamProcessorのウィンドウも閉じます', 'info');
      await window.testStreamProcessor.closeAllWindows();
    }
  } catch (error) {
    // インポートエラーは無視
  }
  
  for (const [windowId, windowInfo] of activeWindows) {
    try {
      if (windowInfo.webWindow) {
        // window.openで開いたウィンドウ
        windowInfo.webWindow.close();
      } else {
        // Chrome APIで開いたウィンドウ
        await chrome.windows.remove(windowInfo.windowId);
      }
      log(`ウィンドウ ${windowId} を閉じました`, 'success');
    } catch (error) {
      log(`ウィンドウ ${windowId} のクローズに失敗: ${error.message}`, 'warning');
    }
  }
  
  activeWindows.clear();
  elements.activeWindows.textContent = '0';
  updateWindowGrid();
  log('全ウィンドウのクローズ完了', 'success');
}

// 選択したウィンドウを閉じる
async function closeSelectedWindow() {
  const column = elements.columnSelect.value;
  let windowClosed = false;
  
  log(`${column}列のウィンドウを閉じます`, 'info');
  
  for (const [windowId, windowInfo] of activeWindows) {
    if (windowInfo.column === column) {
      try {
        if (windowInfo.webWindow) {
          windowInfo.webWindow.close();
        } else {
          await chrome.windows.remove(windowInfo.windowId);
        }
        activeWindows.delete(windowId);
        log(`ウィンドウ ${windowId} (${column}列) を閉じました`, 'success');
        windowClosed = true;
      } catch (error) {
        log(`ウィンドウ ${windowId} のクローズに失敗: ${error.message}`, 'warning');
      }
    }
  }
  
  if (!windowClosed) {
    log(`${column}列のウィンドウが見つかりませんでした`, 'warning');
  }
  
  elements.activeWindows.textContent = activeWindows.size;
  updateWindowGrid();
}

// ログをクリア
function clearLog() {
  elements.logContainer.innerHTML = `
    <div class="log-entry info">
      <span class="log-time">[${new Date().toLocaleTimeString('ja-JP')}]</span>
      ログをクリアしました
    </div>
  `;
}

// スリープ関数
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ページ離脱時のクリーンアップ
window.addEventListener('beforeunload', () => {
  // 開いているウィンドウを全て閉じる
  for (const windowInfo of activeWindows.values()) {
    if (windowInfo.webWindow) {
      try {
        windowInfo.webWindow.close();
      } catch (e) {
        // エラーは無視
      }
    }
  }
});