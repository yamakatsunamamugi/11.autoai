/**
 * バックグラウンドサービスワーカー
 * 拡張機能の中央制御
 */

// インストール時の処理
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('[Genspark Extension] インストール/更新:', details.reason);
  
  // デフォルト設定を保存
  if (details.reason === 'install') {
    await chrome.storage.local.set({
      environment: 'test',
      adapterType: 'manual',
      history: []
    });
    
    console.log('[Genspark Extension] デフォルト設定を保存しました');
  }
});

// アイコンクリック時の処理
chrome.action.onClicked.addListener(async (tab) => {
  // Gensparkのページかチェック
  if (!tab.url.includes('genspark.ai')) {
    // Gensparkのページを開く
    chrome.tabs.create({
      url: 'https://www.genspark.ai/agents?type=slides_agent'
    });
  }
});

// メッセージハンドラ
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('[Genspark Extension Background] メッセージ受信:', request);
  
  switch (request.action) {
    case 'executeAutomation':
      handleExecuteAutomation(request, sendResponse);
      return true; // 非同期レスポンス
      
    case 'getSettings':
      handleGetSettings(sendResponse);
      return true;
      
    case 'updateSettings':
      handleUpdateSettings(request, sendResponse);
      return true;
      
    case 'getHistory':
      handleGetHistory(sendResponse);
      return true;
      
    case 'clearHistory':
      handleClearHistory(sendResponse);
      return true;
      
    default:
      sendResponse({ success: false, error: 'Unknown action' });
  }
});

/**
 * 自動化実行
 */
async function handleExecuteAutomation(request, sendResponse) {
  try {
    // モデルと機能からURLを決定
    const targetUrl = getTargetUrl(request.modelId, request.functionId);
    
    // 現在のタブを取得
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    // 対象AIのページかチェック
    if (!tab.url.includes(getDomain(request.modelId))) {
      // 対象AIのページを開く
      const newTab = await chrome.tabs.create({
        url: targetUrl
      });
      
      // ページ読み込み完了を待つ
      await waitForTabLoad(newTab.id);
      
      // コンテンツスクリプトにメッセージを送信
      const response = await chrome.tabs.sendMessage(newTab.id, {
        action: 'start',
        modelId: request.modelId,
        functionId: request.functionId,
        adapterType: request.adapterType,
        adapterConfig: request.adapterConfig
      });
      
      sendResponse(response);
    } else {
      // 既に対象AIのページにいる場合
      const response = await chrome.tabs.sendMessage(tab.id, {
        action: 'start',
        modelId: request.modelId,
        functionId: request.functionId,
        adapterType: request.adapterType,
        adapterConfig: request.adapterConfig
      });
      
      sendResponse(response);
    }
    
  } catch (error) {
    console.error('[Genspark Extension Background] エラー:', error);
    sendResponse({
      success: false,
      error: error.message
    });
  }
}

/**
 * 設定取得
 */
async function handleGetSettings(sendResponse) {
  try {
    const settings = await chrome.storage.local.get([
      'environment',
      'adapterType',
      'spreadsheetConfig'
    ]);
    
    sendResponse({
      success: true,
      settings: settings
    });
    
  } catch (error) {
    sendResponse({
      success: false,
      error: error.message
    });
  }
}

/**
 * 設定更新
 */
async function handleUpdateSettings(request, sendResponse) {
  try {
    await chrome.storage.local.set(request.settings);
    
    sendResponse({
      success: true
    });
    
  } catch (error) {
    sendResponse({
      success: false,
      error: error.message
    });
  }
}

/**
 * 履歴取得
 */
async function handleGetHistory(sendResponse) {
  try {
    const storage = await chrome.storage.local.get(['history']);
    
    sendResponse({
      success: true,
      history: storage.history || []
    });
    
  } catch (error) {
    sendResponse({
      success: false,
      error: error.message
    });
  }
}

/**
 * 履歴クリア
 */
async function handleClearHistory(sendResponse) {
  try {
    await chrome.storage.local.set({ history: [] });
    
    sendResponse({
      success: true
    });
    
  } catch (error) {
    sendResponse({
      success: false,
      error: error.message
    });
  }
}

/**
 * モデルと機能からターゲットURLを取得
 */
function getTargetUrl(modelId, functionId) {
  const urls = {
    genspark: {
      slides_agent: 'https://www.genspark.ai/agents?type=slides_agent',
      summarize: 'https://www.genspark.ai/agents?type=summarize',
      analyze: 'https://www.genspark.ai/agents?type=analyze'
    },
    chatgpt: {
      chat: 'https://chat.openai.com'
    },
    claude: {
      chat: 'https://claude.ai/new'
    },
    gemini: {
      chat: 'https://gemini.google.com/app'
    },
    perplexity: {
      chat: 'https://www.perplexity.ai'
    }
  };
  
  return urls[modelId]?.[functionId] || urls[modelId]?.chat || 'https://www.genspark.ai/agents?type=slides_agent';
}

/**
 * モデルIDからドメインを取得
 */
function getDomain(modelId) {
  const domains = {
    genspark: 'genspark.ai',
    chatgpt: 'openai.com',
    claude: 'claude.ai',
    gemini: 'google.com',
    perplexity: 'perplexity.ai'
  };
  
  return domains[modelId] || 'genspark.ai';
}

/**
 * タブの読み込み完了を待つ
 */
function waitForTabLoad(tabId) {
  return new Promise((resolve) => {
    chrome.tabs.onUpdated.addListener(function listener(id, info) {
      if (id === tabId && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        // コンテンツスクリプトの読み込みを待つ
        setTimeout(resolve, 1000);
      }
    });
  });
}