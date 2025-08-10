// background.js - 拡張機能のバックグラウンドスクリプト

// ログの保存
const logs = [];
const MAX_LOGS = 100;

// ログ受信と保存
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'LOG') {
        const logEntry = {
            timestamp: new Date().toISOString(),
            message: request.message,
            level: request.level,
            tabId: sender.tab ? sender.tab.id : null
        };
        
        logs.push(logEntry);
        if (logs.length > MAX_LOGS) {
            logs.shift();
        }
        
        console.log(request.message);
    }
});

// 拡張機能のAPIエンドポイント
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'GET_LOGS') {
        sendResponse({ logs: logs });
    }
});

// タブの状態管理
const tabStates = {};

// Claudeタブの検出
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url && tab.url.includes('claude.ai')) {
        tabStates[tabId] = {
            url: tab.url,
            ready: false
        };
        
        // コンテンツスクリプトの準備状態を確認
        chrome.tabs.sendMessage(tabId, { type: 'PING' }, (response) => {
            if (response && response.status === 'ready') {
                tabStates[tabId].ready = true;
                console.log(`Claude tab ${tabId} is ready`);
            }
        });
    }
});

// タブが閉じられた時のクリーンアップ
chrome.tabs.onRemoved.addListener((tabId) => {
    delete tabStates[tabId];
});

// 外部からのメッセージを処理（他の拡張機能やウェブページから）
chrome.runtime.onMessageExternal.addListener((request, sender, sendResponse) => {
    (async () => {
        try {
            // Claudeタブを探す
            const tabs = await chrome.tabs.query({ url: '*://claude.ai/*' });
            if (tabs.length === 0) {
                sendResponse({ success: false, error: 'Claude tab not found' });
                return;
            }
            
            const activeTab = tabs[0];
            
            // コンテンツスクリプトにメッセージを転送
            chrome.tabs.sendMessage(activeTab.id, request, (response) => {
                sendResponse(response);
            });
            
        } catch (error) {
            sendResponse({ success: false, error: error.message });
        }
    })();
    
    return true; // 非同期応答のため
});

// 拡張機能のインストール/更新時の処理
chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
        console.log('Claude Spreadsheet Integration Extension installed');
        
        // 初期設定をストレージに保存
        chrome.storage.local.set({
            settings: {
                debugMode: false,
                defaultModel: 'Opus 4.1',
                defaultFunctions: [],
                maxRetries: 3,
                responseWaitMinutes: 5
            }
        });
    } else if (details.reason === 'update') {
        console.log('Claude Spreadsheet Integration Extension updated');
    }
});

// 設定の取得と更新
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'GET_SETTINGS') {
        chrome.storage.local.get('settings', (data) => {
            sendResponse(data.settings || {});
        });
        return true;
    }
    
    if (request.type === 'UPDATE_SETTINGS') {
        chrome.storage.local.set({ settings: request.settings }, () => {
            sendResponse({ success: true });
        });
        return true;
    }
});

console.log('Claude Spreadsheet Integration Extension - Background script loaded');