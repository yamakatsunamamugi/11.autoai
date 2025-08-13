// test-window-creation.js - ウィンドウ作成テストツール

// グローバル変数
let spreadsheetData = null;
let taskList = null;
let activeWindows = new Map();
let testStartTime = null;
let autoTestRunning = false;
let autoTestLoop = null;
let streamProcessorInstance = null;

// DOM要素
const elements = {
  totalTasks: document.getElementById('totalTasks'),
  processedTasks: document.getElementById('processedTasks'),
  activeWindows: document.getElementById('activeWindows'),
  maxWindows: document.getElementById('maxWindows'),
  openTestWindowsBtn: document.getElementById('openTestWindowsBtn'),
  startAutoTestBtn: document.getElementById('startAutoTestBtn'),
  closeAllWindowsBtn: document.getElementById('closeAllWindowsBtn'),
  stopAutoTestBtn: document.getElementById('stopAutoTestBtn'),
  clearLogBtn: document.getElementById('clearLogBtn'),
  windowGrid: document.getElementById('windowGrid'),
  logContainer: document.getElementById('logContainer'),
  statusIndicator: document.getElementById('statusIndicator'),
  statusText: document.getElementById('statusText'),
  statusTime: document.getElementById('statusTime'),
  // 新しい設定要素
  useChatGPT: document.getElementById('useChatGPT'),
  useClaude: document.getElementById('useClaude'),
  useGemini: document.getElementById('useGemini'),
  windowCountSlider: document.getElementById('windowCountSlider'),
  windowCountDisplay: document.getElementById('windowCountDisplay'),
  waitTimeMin: document.getElementById('waitTimeMin'),
  waitTimeMax: document.getElementById('waitTimeMax'),
  repeatCount: document.getElementById('repeatCount')
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
  elements.openTestWindowsBtn.addEventListener('click', openTestWindows);
  elements.startAutoTestBtn.addEventListener('click', startAutoTest);
  elements.closeAllWindowsBtn.addEventListener('click', closeAllWindows);
  elements.stopAutoTestBtn.addEventListener('click', stopAutoTest);
  elements.clearLogBtn.addEventListener('click', clearLog);
  
  // スライダーのリアルタイム更新
  elements.windowCountSlider.addEventListener('input', (e) => {
    elements.windowCountDisplay.textContent = e.target.value;
  });
  
  // クイック設定ボタン
  document.querySelectorAll('.quick-set-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const count = e.target.dataset.count;
      elements.windowCountSlider.value = count;
      elements.windowCountDisplay.textContent = count;
    });
  });
}

// 親ウィンドウからのメッセージ処理
function handleMessage(event) {
  if (event.data && event.data.type === 'INIT_TEST') {
    spreadsheetData = event.data.spreadsheetData;
    const taskCount = event.data.taskCount || 0;
    
    elements.totalTasks.textContent = taskCount;
    log(`スプレッドシートデータを受信: ${taskCount}個のタスク`, 'success');
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

// 設定に基づいてウィンドウを開く
async function openTestWindows() {
  log('設定に基づいてウィンドウを開きます', 'info');
  
  // 選択されたAIを取得
  const selectedAIs = [];
  if (elements.useChatGPT.checked) selectedAIs.push('chatgpt');
  if (elements.useClaude.checked) selectedAIs.push('claude');
  if (elements.useGemini.checked) selectedAIs.push('gemini');
  
  if (selectedAIs.length === 0) {
    log('少なくとも1つのAIを選択してください', 'error');
    return;
  }
  
  const windowCount = parseInt(elements.windowCountSlider.value);
  log(`選択されたAI: ${selectedAIs.join(', ')}`, 'info');
  log(`ウィンドウ数: ${windowCount}`, 'info');
  
  try {
    // 本番のモジュールをインポート
    const [streamModule, modelsModule, factoryModule] = await Promise.all([
      import('../src/features/task/stream-processor.js'),
      import('../src/features/task/models.js'),
      import('../src/features/task/models.js')  // TaskFactoryも同じファイルから
    ]);
    
    const StreamProcessor = streamModule.default;
    const { Task, TaskList, TaskFactory } = modelsModule;
    
    log('本番モジュールをインポートしました', 'success');
    
    // タスクリストを直接作成（スプレッドシートを経由しない）
    const taskList = new TaskList();
    const columns = ['C', 'F', 'I', 'L']; // テスト用の列
    
    // 各ウィンドウ用のタスクを作成（各AIで3個のタスクを作成し、3回開閉をシミュレート）
    for (let i = 0; i < windowCount; i++) {
      const column = columns[i % columns.length];
      const aiType = selectedAIs[i % selectedAIs.length];
      
      // 各列に3つのタスクを作成（3回開閉をシミュレート）
      for (let taskNum = 1; taskNum <= 3; taskNum++) {
        const taskData = {
          id: `test_${column}${taskNum}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
          column: column,
          promptColumn: column,  // StreamProcessorはpromptColumnでグループ化する
          row: taskNum + 1,  // 2,3,4行目
          aiType: aiType,  // 正しいAIタイプを直接設定
          taskType: 'ai',
          prompt: `テストプロンプト${taskNum} for ${aiType} (${column}列)`,
          groupId: `test_group_${column}_${aiType}`,
          groupInfo: {
            type: 'single',
            columns: [column],
            promptColumn: column
          },
          // テストモード用設定：AI応答を取得しない
          waitResponse: false,
          getResponse: false
        };
        
        const task = new Task(TaskFactory.createTask(taskData));
        taskList.add(task);
      }
    }
    
    log(`タスクリスト作成完了: ${taskList.tasks.length}個のタスク`, 'info');
    
    // デバッグ: 作成されたタスクのAIタイプを確認
    const aiTypes = {};
    taskList.tasks.forEach(task => {
      const aiType = task.aiType || 'unknown';
      aiTypes[aiType] = (aiTypes[aiType] || 0) + 1;
    });
    log(`タスクのAIタイプ分布: ${JSON.stringify(aiTypes)}`, 'info');
    
    if (taskList.tasks.length === 0) {
      log('タスクが生成されませんでした。データを確認してください。', 'error');
      return;
    }
    
    log('本番StreamProcessorでウィンドウを開きます...', 'info');
    log(`タスク数: ${taskList.tasks.length}個`, 'info');
    
    // デバッグ: タスクリストの詳細
    taskList.tasks.forEach((task, index) => {
      log(`タスク${index + 1}: ${task.promptColumn}${task.row} (${task.aiType})`, 'info');
    });
    
    // 本番のStreamProcessorで実行（既にインポート済み）
    const streamProcessor = new StreamProcessor();
    
    const minimalSpreadsheetData = {
      spreadsheetId: 'test_spreadsheet',
      values: [],
      aiColumns: {}
    };
    
    log('processTaskStream実行中...', 'info');
    const result = await streamProcessor.processTaskStream(taskList, minimalSpreadsheetData);
    
    log(`ウィンドウ作成完了: ${result.totalWindows}個`, 'success');
    log(`処理された列: ${result.processedColumns.join(', ')}`, 'info');
    
    // StreamProcessorの状態を取得してUIに反映
    updateActiveWindowsFromStreamProcessor(streamProcessor);
    
    // グローバルに保持（後でクローズできるように）
    streamProcessorInstance = streamProcessor;
    
  } catch (error) {
    log(`エラー: ${error.message}`, 'error');
    console.error('詳細エラー:', error);
  }
}

// 不要な独自関数は削除済み - StreamProcessorが全て処理

// 自動開閉テストを開始
async function startAutoTest() {
  log('===== 自動開閉テスト開始 =====', 'success');
  autoTestRunning = true;
  elements.startAutoTestBtn.disabled = true;
  elements.stopAutoTestBtn.disabled = false;
  elements.openTestWindowsBtn.disabled = true;
  
  const repeatCount = parseInt(elements.repeatCount.value);
  const waitMin = parseInt(elements.waitTimeMin.value) * 1000;
  const waitMax = parseInt(elements.waitTimeMax.value) * 1000;
  
  // 選択されたAIを取得
  const selectedAIs = [];
  if (elements.useChatGPT.checked) selectedAIs.push('chatgpt');
  if (elements.useClaude.checked) selectedAIs.push('claude');
  if (elements.useGemini.checked) selectedAIs.push('gemini');
  
  if (selectedAIs.length === 0) {
    log('少なくとも1つのAIを選択してください', 'error');
    stopAutoTest();
    return;
  }
  
  const windowCount = parseInt(elements.windowCountSlider.value);
  
  try {
    // モジュールをインポート
    const [streamModule, modelsModule] = await Promise.all([
      import('../src/features/task/stream-processor.js'),
      import('../src/features/task/models.js')
    ]);
    
    const StreamProcessor = streamModule.default;
    const { Task, TaskList, TaskFactory } = modelsModule;
    
    // タスクリストを作成
    const taskList = new TaskList();
    const columns = ['C', 'F', 'I', 'L']; // テスト用の列
    
    // 各ウィンドウ用のタスクを作成（各AIで3個のタスクを作成し、3回開閉をシミュレート）
    for (let i = 0; i < windowCount; i++) {
      const column = columns[i % columns.length];
      const aiType = selectedAIs[i % selectedAIs.length];
      
      // 各列に3つのタスクを作成（3回開閉をシミュレート）
      for (let taskNum = 1; taskNum <= 3; taskNum++) {
        const taskData = {
          id: `test_${column}${taskNum}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
          column: column,
          promptColumn: column,
          row: taskNum + 1,
          aiType: aiType,
          taskType: 'ai',
          prompt: `テストプロンプト${taskNum} for ${aiType} (${column}列)`,
          groupId: `test_group_${column}_${aiType}`,
          groupInfo: {
            type: 'single',
            columns: [column],
            promptColumn: column
          },
          // テストモード用設定：AI応答を取得しない
          waitResponse: false,
          getResponse: false
        };
        
        const task = new Task(TaskFactory.createTask(taskData));
        taskList.add(task);
      }
    }
  
    // 本番のStreamProcessorでテストを実行（各列に3つのタスクがあるため、自動的に3回開閉される）
    log('本番StreamProcessorで開閉テストを開始します', 'info');
    log('（各AIで3つのタスクを処理し、自動的に3回開閉されます）', 'info');
    
    // StreamProcessorで実行（本番と同じ処理）
    const streamProcessor = new StreamProcessor();
    streamProcessorInstance = streamProcessor; // グローバルに保持
    
    const minimalSpreadsheetData = {
      spreadsheetId: 'test_spreadsheet',
      values: [],
      aiColumns: {}
    };
    
    log('StreamProcessorで処理開始...', 'info');
    log(`タスクリスト詳細: ${taskList.tasks.length}個のタスク`, 'info');
    
    // デバッグ: タスクリストの内容を確認
    taskList.tasks.forEach((task, index) => {
      log(`タスク${index + 1}: ${task.promptColumn}列 ${task.row}行 (${task.aiType})`, 'info');
    });
    
    log('processTaskStreamを呼び出します...', 'info');
    const result = await streamProcessor.processTaskStream(taskList, minimalSpreadsheetData);
    
    log(`処理完了: ${result.totalWindows}個のウィンドウで処理されました`, 'success');
    log('StreamProcessorにより各AIで3回の開閉が自動実行されました', 'info');
    
    // 最終的な状態を確認
    const status = streamProcessor.getStatus();
    log(`最終状態: 処理済み列 ${status.processedColumns.length}個`, 'info');
    
  } catch (error) {
    log(`エラー詳細: ${error.message}`, 'error');
    log(`エラースタック: ${error.stack}`, 'error');
    console.error('StreamProcessor エラー:', error);
    
    // エラーが発生してもクリーンアップ
    try {
      await streamProcessor.closeAllWindows();
    } catch (cleanupError) {
      log(`クリーンアップエラー: ${cleanupError.message}`, 'warning');
    }
  } finally {
    // UIを更新
    activeWindows.clear();
    elements.activeWindows.textContent = '0';
    updateWindowGrid();
  }
  
  log('===== 自動開閉テスト完了 =====', 'success');
  stopAutoTest();
}

// 自動テストを停止
function stopAutoTest() {
  autoTestRunning = false;
  elements.startAutoTestBtn.disabled = false;
  elements.stopAutoTestBtn.disabled = true;
  elements.openTestWindowsBtn.disabled = false;
  updateStatus('テスト停止', 'idle');
  log('自動テストを停止しました', 'warning');
}

// 全ウィンドウを閉じる（StreamProcessorを使用）
async function closeAllWindows() {
  log('StreamProcessorで全ウィンドウを閉じます', 'info');
  
  if (streamProcessorInstance) {
    try {
      await streamProcessorInstance.closeAllWindows();
      log('StreamProcessorによるウィンドウクローズ完了', 'success');
    } catch (error) {
      log(`StreamProcessorクローズエラー: ${error.message}`, 'warning');
    }
  } else {
    log('StreamProcessorインスタンスがありません', 'warning');
  }
  
  // UIを更新
  activeWindows.clear();
  elements.activeWindows.textContent = '0';
  updateWindowGrid();
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
          <span class="window-info-label">作成時刻</span>
          <span class="window-info-value">${windowInfo.createdAt.toLocaleTimeString('ja-JP')}</span>
        </div>
      </div>
    `;
    elements.windowGrid.appendChild(card);
  });
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