/**
 * ポップアップのメインスクリプト
 */

document.addEventListener('DOMContentLoaded', async () => {
  // DOM要素の取得
  const elements = {
    // モデル・機能選択
    modelSelect: document.getElementById('modelSelect'),
    functionSelect: document.getElementById('functionSelect'),
    
    // 入力
    promptInput: document.getElementById('promptInput'),
    dataSourceRadios: document.querySelectorAll('input[name="dataSource"]'),
    spreadsheetConfig: document.getElementById('spreadsheetConfig'),
    spreadsheetId: document.getElementById('spreadsheetId'),
    apiKey: document.getElementById('apiKey'),
    
    // ボタン
    executeBtn: document.getElementById('executeBtn'),
    stopBtn: document.getElementById('stopBtn'),
    settingsBtn: document.getElementById('settingsBtn'),
    historyBtn: document.getElementById('historyBtn'),
    environmentToggle: document.getElementById('environmentToggle'),
    
    // ステータス・結果
    statusSection: document.getElementById('statusSection'),
    statusMessage: document.getElementById('statusMessage'),
    loadingSpinner: document.getElementById('loadingSpinner'),
    resultSection: document.getElementById('resultSection'),
    resultUrl: document.getElementById('resultUrl'),
    executionTime: document.getElementById('executionTime'),
    
    // 環境
    environmentBadge: document.getElementById('environmentBadge'),
    environmentName: document.getElementById('environmentName'),
    
    // モーダル
    settingsModal: document.getElementById('settingsModal'),
    historyModal: document.getElementById('historyModal'),
    environmentSelect: document.getElementById('environmentSelect'),
    saveSettingsBtn: document.getElementById('saveSettingsBtn'),
    closeSettingsBtn: document.getElementById('closeSettingsBtn'),
    historyList: document.getElementById('historyList'),
    clearHistoryBtn: document.getElementById('clearHistoryBtn'),
    closeHistoryBtn: document.getElementById('closeHistoryBtn')
  };

  // 現在の設定を読み込み
  await loadSettings();

  // イベントリスナーの設定
  setupEventListeners();
  
  // モデル選択時に機能リストを更新
  updateFunctionOptions();

  /**
   * 設定を読み込み
   */
  async function loadSettings() {
    const response = await sendMessage('getSettings');
    if (response.success) {
      const settings = response.settings;
      
      // 環境表示を更新
      updateEnvironmentDisplay(settings.environment || 'test');
      
      // データソースを設定
      const adapterType = settings.adapterType || 'manual';
      document.querySelector(`input[value="${adapterType}"]`).checked = true;
      
      // スプレッドシート設定
      if (settings.spreadsheetConfig) {
        elements.spreadsheetId.value = settings.spreadsheetConfig.spreadsheetId || '';
        elements.apiKey.value = settings.spreadsheetConfig.apiKey || '';
      }
      
      // UIを更新
      updateDataSourceUI();
    }
  }

  /**
   * 環境表示を更新
   */
  function updateEnvironmentDisplay(environment) {
    const displayName = environment === 'production' ? '本番' : 'テスト';
    elements.environmentName.textContent = displayName;
    elements.environmentBadge.className = `environment-badge ${environment}`;
    elements.environmentSelect.value = environment;
  }

  /**
   * イベントリスナーの設定
   */
  function setupEventListeners() {
    // モデル選択変更
    elements.modelSelect.addEventListener('change', updateFunctionOptions);
    
    // 実行ボタン
    elements.executeBtn.addEventListener('click', handleExecute);
    
    // 停止ボタン
    elements.stopBtn.addEventListener('click', handleStop);
    
    // データソース選択
    elements.dataSourceRadios.forEach(radio => {
      radio.addEventListener('change', updateDataSourceUI);
    });
    
    // 環境切り替え
    elements.environmentToggle.addEventListener('click', toggleEnvironment);
    
    // 設定モーダル
    elements.settingsBtn.addEventListener('click', () => showModal('settings'));
    elements.saveSettingsBtn.addEventListener('click', saveSettings);
    elements.closeSettingsBtn.addEventListener('click', () => hideModal('settings'));
    
    // 履歴モーダル
    elements.historyBtn.addEventListener('click', () => showHistory());
    elements.clearHistoryBtn.addEventListener('click', clearHistory);
    elements.closeHistoryBtn.addEventListener('click', () => hideModal('history'));
    
    // モーダル背景クリックで閉じる
    elements.settingsModal.addEventListener('click', (e) => {
      if (e.target === elements.settingsModal) hideModal('settings');
    });
    elements.historyModal.addEventListener('click', (e) => {
      if (e.target === elements.historyModal) hideModal('history');
    });
  }

  /**
   * 機能オプションの更新
   */
  function updateFunctionOptions() {
    const modelId = elements.modelSelect.value;
    const functions = getModelFunctions(modelId);
    
    elements.functionSelect.innerHTML = functions.map(func => 
      `<option value="${func.id}">${func.name}</option>`
    ).join('');
  }
  
  /**
   * モデルに対応する機能を取得
   */
  function getModelFunctions(modelId) {
    const modelFunctions = {
      genspark: [
        { id: 'slides_agent', name: 'スライド生成' },
        { id: 'summarize', name: '要約' },
        { id: 'analyze', name: '分析' }
      ],
      chatgpt: [
        { id: 'chat', name: 'チャット' }
      ],
      claude: [
        { id: 'chat', name: 'チャット' }
      ],
      gemini: [
        { id: 'chat', name: 'チャット' }
      ],
      perplexity: [
        { id: 'chat', name: '検索型チャット' }
      ]
    };
    
    return modelFunctions[modelId] || [];
  }
  
  /**
   * 実行処理
   */
  async function handleExecute() {
    try {
      // UIを実行中状態に
      setExecutingState(true);
      
      // 選択されたモデルと機能を取得
      const modelId = elements.modelSelect.value;
      const functionId = elements.functionSelect.value;
      
      // 入力データを取得
      const dataSource = document.querySelector('input[name="dataSource"]:checked').value;
      let adapterConfig = {};
      
      if (dataSource === 'manual') {
        // 手動入力の場合、プロンプトを保存
        const prompt = elements.promptInput.value.trim();
        if (!prompt) {
          showError('プロンプトを入力してください');
          setExecutingState(false);
          return;
        }
        
        // 入力データを保存
        await chrome.storage.local.set({
          manualInput: {
            prompt: prompt,
            options: {}
          }
        });
        
      } else if (dataSource === 'spreadsheet') {
        // スプレッドシート設定を取得
        adapterConfig = {
          spreadsheetId: elements.spreadsheetId.value.trim(),
          apiKey: elements.apiKey.value.trim()
        };
        
        if (!adapterConfig.spreadsheetId || !adapterConfig.apiKey) {
          showError('スプレッドシートIDとAPIキーを入力してください');
          setExecutingState(false);
          return;
        }
      }
      
      // 実行メッセージを送信
      showStatus(`${modelId} - ${functionId} で自動化を開始しています...`);
      
      const response = await sendMessage('executeAutomation', {
        modelId: modelId,
        functionId: functionId,
        adapterType: dataSource,
        adapterConfig: adapterConfig
      });
      
      if (response.success) {
        showResult(response.result);
      } else {
        showError(response.error);
      }
      
    } catch (error) {
      showError('実行エラー: ' + error.message);
    } finally {
      setExecutingState(false);
    }
  }

  /**
   * 停止処理
   */
  async function handleStop() {
    try {
      const tabs = await chrome.tabs.query({ url: '*://*.genspark.ai/*' });
      if (tabs.length > 0) {
        const response = await chrome.tabs.sendMessage(tabs[0].id, { action: 'stop' });
        if (response.success) {
          showStatus('停止しました');
          setExecutingState(false);
        }
      }
    } catch (error) {
      showError('停止エラー: ' + error.message);
    }
  }

  /**
   * データソースUIの更新
   */
  function updateDataSourceUI() {
    const dataSource = document.querySelector('input[name="dataSource"]:checked').value;
    if (dataSource === 'spreadsheet') {
      elements.spreadsheetConfig.classList.remove('hidden');
      elements.promptInput.disabled = true;
      elements.promptInput.placeholder = 'スプレッドシートから取得されます';
    } else {
      elements.spreadsheetConfig.classList.add('hidden');
      elements.promptInput.disabled = false;
      elements.promptInput.placeholder = '例: 桃太郎についてスライド4枚で解説して';
    }
  }

  /**
   * 環境切り替え
   */
  async function toggleEnvironment() {
    const current = elements.environmentSelect.value;
    const next = current === 'test' ? 'production' : 'test';
    
    await sendMessage('updateSettings', {
      settings: { environment: next }
    });
    
    updateEnvironmentDisplay(next);
    showStatus(`環境を${next === 'production' ? '本番' : 'テスト'}に切り替えました`);
  }

  /**
   * 設定保存
   */
  async function saveSettings() {
    const environment = elements.environmentSelect.value;
    
    await sendMessage('updateSettings', {
      settings: { environment: environment }
    });
    
    updateEnvironmentDisplay(environment);
    hideModal('settings');
    showStatus('設定を保存しました');
  }

  /**
   * 履歴表示
   */
  async function showHistory() {
    showModal('history');
    
    const response = await sendMessage('getHistory');
    if (response.success) {
      displayHistory(response.history);
    }
  }

  /**
   * 履歴表示更新
   */
  function displayHistory(history) {
    if (history.length === 0) {
      elements.historyList.innerHTML = '<div class="history-item">履歴がありません</div>';
      return;
    }
    
    elements.historyList.innerHTML = history
      .slice()
      .reverse()
      .map(item => `
        <div class="history-item">
          <div class="history-item-time">${new Date(item.timestamp).toLocaleString('ja-JP')}</div>
          <div class="history-item-prompt">${item.prompt || 'N/A'}</div>
          <span class="history-item-status ${item.success ? 'success' : 'error'}">
            ${item.success ? '成功' : 'エラー'}
          </span>
        </div>
      `)
      .join('');
  }

  /**
   * 履歴クリア
   */
  async function clearHistory() {
    if (confirm('履歴をすべて削除しますか？')) {
      await sendMessage('clearHistory');
      displayHistory([]);
      showStatus('履歴をクリアしました');
    }
  }

  /**
   * 実行中状態の設定
   */
  function setExecutingState(executing) {
    if (executing) {
      elements.executeBtn.classList.add('hidden');
      elements.stopBtn.classList.remove('hidden');
      elements.statusSection.classList.remove('hidden');
      elements.loadingSpinner.classList.remove('hidden');
      elements.resultSection.classList.add('hidden');
    } else {
      elements.executeBtn.classList.remove('hidden');
      elements.stopBtn.classList.add('hidden');
      elements.loadingSpinner.classList.add('hidden');
    }
  }

  /**
   * ステータス表示
   */
  function showStatus(message) {
    elements.statusSection.classList.remove('hidden');
    elements.statusMessage.textContent = message;
  }

  /**
   * エラー表示
   */
  function showError(message) {
    elements.statusSection.classList.remove('hidden');
    elements.statusMessage.textContent = '❌ ' + message;
    elements.statusMessage.style.color = '#dc2626';
    
    setTimeout(() => {
      elements.statusMessage.style.color = '';
    }, 3000);
  }

  /**
   * 結果表示
   */
  function showResult(result) {
    elements.resultSection.classList.remove('hidden');
    elements.statusSection.classList.add('hidden');
    
    if (result.url) {
      elements.resultUrl.href = result.url;
      elements.resultUrl.textContent = result.url.substring(0, 50) + '...';
    }
    
    if (result.executionTime) {
      elements.executionTime.textContent = result.executionTime;
    }
  }

  /**
   * モーダル表示
   */
  function showModal(type) {
    if (type === 'settings') {
      elements.settingsModal.classList.remove('hidden');
    } else if (type === 'history') {
      elements.historyModal.classList.remove('hidden');
    }
  }

  /**
   * モーダル非表示
   */
  function hideModal(type) {
    if (type === 'settings') {
      elements.settingsModal.classList.add('hidden');
    } else if (type === 'history') {
      elements.historyModal.classList.add('hidden');
    }
  }

  /**
   * バックグラウンドにメッセージ送信
   */
  async function sendMessage(action, data = {}) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ action, ...data }, (response) => {
        resolve(response || { success: false, error: 'No response' });
      });
    });
  }
});