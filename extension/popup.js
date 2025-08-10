// popup.js - 拡張機能のポップアップスクリプト

let selectedFunctions = [];

// 初期化
document.addEventListener('DOMContentLoaded', async () => {
    checkConnection();
    loadSettings();
    setupEventListeners();
    updateLogs();
});

// 接続状態の確認
async function checkConnection() {
    try {
        const tabs = await chrome.tabs.query({ url: '*://claude.ai/*' });
        const statusEl = document.getElementById('connectionStatus');
        
        if (tabs.length === 0) {
            statusEl.textContent = '❌ Claudeタブなし';
            statusEl.style.color = '#ff6b6b';
            return false;
        }
        
        // コンテンツスクリプトの準備状態を確認
        chrome.tabs.sendMessage(tabs[0].id, { type: 'GET_STATUS' }, (response) => {
            if (chrome.runtime.lastError) {
                statusEl.textContent = '⚠️ 接続エラー';
                statusEl.style.color = '#ffd43b';
            } else if (response && response.success) {
                statusEl.textContent = '✅ 接続済み';
                statusEl.style.color = '#51cf66';
                
                // 現在のモデルを表示
                if (response.status && response.status.currentModel) {
                    document.getElementById('currentModel').textContent = response.status.currentModel;
                }
            } else {
                statusEl.textContent = '❓ 不明';
                statusEl.style.color = '#fab005';
            }
        });
        
        return true;
    } catch (error) {
        console.error('Connection check error:', error);
        return false;
    }
}

// 設定の読み込み
async function loadSettings() {
    chrome.storage.local.get('settings', (data) => {
        const settings = data.settings || {};
        document.getElementById('debugMode').checked = settings.debugMode || false;
        document.getElementById('waitForResponse').checked = settings.waitForResponse !== false;
        document.getElementById('waitMinutes').value = settings.responseWaitMinutes || 5;
        document.getElementById('maxRetries').value = settings.maxRetries || 3;
    });
}

// イベントリスナーの設定
function setupEventListeners() {
    // タブ切り替え
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            
            tab.classList.add('active');
            document.getElementById(tab.dataset.tab).classList.add('active');
        });
    });
    
    // 機能タグのクリック
    document.querySelectorAll('.function-tag').forEach(tag => {
        tag.addEventListener('click', () => {
            const func = tag.dataset.function;
            if (tag.classList.contains('active')) {
                tag.classList.remove('active');
                selectedFunctions = selectedFunctions.filter(f => f !== func);
            } else {
                tag.classList.add('active');
                selectedFunctions.push(func);
            }
        });
    });
    
    // 単一実行ボタン
    document.getElementById('executeButton').addEventListener('click', executeSingle);
    
    // バッチ実行ボタン
    document.getElementById('executeBatchButton').addEventListener('click', executeBatch);
    
    // 設定保存ボタン
    document.getElementById('saveSettings').addEventListener('click', saveSettings);
    
    // ログクリアボタン
    document.getElementById('clearLogs').addEventListener('click', () => {
        document.getElementById('logs').innerHTML = '';
    });
}

// 単一実行
async function executeSingle() {
    const model = document.getElementById('modelSelect').value;
    const text = document.getElementById('textInput').value;
    
    if (!text.trim()) {
        showResult('テキストを入力してください', 'error');
        return;
    }
    
    const connected = await checkConnection();
    if (!connected) {
        showResult('Claudeタブを開いてください', 'error');
        return;
    }
    
    showLoading(true);
    
    try {
        const tabs = await chrome.tabs.query({ url: '*://claude.ai/*' });
        const options = {
            waitForResponse: document.getElementById('waitForResponse').checked,
            responseWaitMinutes: parseInt(document.getElementById('waitMinutes').value),
            maxRetries: parseInt(document.getElementById('maxRetries').value)
        };
        
        chrome.tabs.sendMessage(tabs[0].id, {
            type: 'PROCESS_DATA',
            model: model,
            functions: selectedFunctions,
            text: text,
            options: options
        }, (response) => {
            showLoading(false);
            
            if (chrome.runtime.lastError) {
                showResult('エラー: ' + chrome.runtime.lastError.message, 'error');
            } else if (response && response.success) {
                const result = response.data;
                let resultText = `
                    ✅ 処理完了
                    モデル: ${result.model}
                    機能: ${result.functions.join(', ') || 'なし'}
                    実行時間: ${(result.executionTime / 1000).toFixed(2)}秒
                `;
                
                if (result.responseText) {
                    resultText += `\n\n応答:\n${result.responseText.substring(0, 500)}...`;
                }
                
                if (result.errors && result.errors.length > 0) {
                    resultText += `\n\n⚠️ エラー:\n${result.errors.join('\n')}`;
                }
                
                showResult(resultText, result.success ? 'success' : 'error');
            } else {
                showResult('処理失敗: ' + (response ? response.error : '不明なエラー'), 'error');
            }
        });
    } catch (error) {
        showLoading(false);
        showResult('エラー: ' + error.message, 'error');
    }
}

// バッチ実行
async function executeBatch() {
    const batchDataText = document.getElementById('batchData').value;
    
    if (!batchDataText.trim()) {
        showBatchResult('バッチデータを入力してください', 'error');
        return;
    }
    
    let dataArray;
    try {
        dataArray = JSON.parse(batchDataText);
    } catch (e) {
        showBatchResult('JSONフォーマットエラー: ' + e.message, 'error');
        return;
    }
    
    const connected = await checkConnection();
    if (!connected) {
        showBatchResult('Claudeタブを開いてください', 'error');
        return;
    }
    
    showLoading(true);
    
    try {
        const tabs = await chrome.tabs.query({ url: '*://claude.ai/*' });
        const options = {
            waitForResponse: document.getElementById('waitForResponse').checked,
            responseWaitMinutes: parseInt(document.getElementById('waitMinutes').value),
            maxRetries: parseInt(document.getElementById('maxRetries').value),
            delayBetweenRequests: 5000,
            continueOnError: true
        };
        
        chrome.tabs.sendMessage(tabs[0].id, {
            type: 'PROCESS_BATCH',
            dataArray: dataArray,
            options: options
        }, (response) => {
            showLoading(false);
            
            if (chrome.runtime.lastError) {
                showBatchResult('エラー: ' + chrome.runtime.lastError.message, 'error');
            } else if (response && response.success) {
                const results = response.data;
                let resultText = `✅ バッチ処理完了: ${results.length}件\n\n`;
                
                results.forEach((r, i) => {
                    resultText += `[${i + 1}] ${r.output.success ? '✅' : '❌'} `;
                    resultText += `${r.input.model} - ${r.input.text.substring(0, 30)}...\n`;
                    if (!r.output.success && r.output.errors) {
                        resultText += `  エラー: ${r.output.errors[0]}\n`;
                    }
                });
                
                showBatchResult(resultText, 'success');
            } else {
                showBatchResult('処理失敗: ' + (response ? response.error : '不明なエラー'), 'error');
            }
        });
    } catch (error) {
        showLoading(false);
        showBatchResult('エラー: ' + error.message, 'error');
    }
}

// 設定の保存
async function saveSettings() {
    const settings = {
        debugMode: document.getElementById('debugMode').checked,
        waitForResponse: document.getElementById('waitForResponse').checked,
        responseWaitMinutes: parseInt(document.getElementById('waitMinutes').value),
        maxRetries: parseInt(document.getElementById('maxRetries').value)
    };
    
    chrome.storage.local.set({ settings: settings }, () => {
        // デバッグモードの設定を反映
        const tabs = chrome.tabs.query({ url: '*://claude.ai/*' }, (tabs) => {
            if (tabs.length > 0) {
                chrome.tabs.sendMessage(tabs[0].id, {
                    type: 'SET_DEBUG',
                    enabled: settings.debugMode
                });
            }
        });
        
        showResult('設定を保存しました', 'success');
        setTimeout(() => {
            document.getElementById('result').classList.remove('show');
        }, 2000);
    });
}

// 結果表示
function showResult(message, type) {
    const resultEl = document.getElementById('result');
    resultEl.textContent = message;
    resultEl.className = 'result show ' + type;
}

function showBatchResult(message, type) {
    const resultEl = document.getElementById('batchResult');
    resultEl.textContent = message;
    resultEl.className = 'result show ' + type;
}

// ローディング表示
function showLoading(show) {
    const loadingEl = document.getElementById('loading');
    if (show) {
        loadingEl.classList.add('show');
    } else {
        loadingEl.classList.remove('show');
    }
}

// ログの更新
function updateLogs() {
    chrome.runtime.sendMessage({ type: 'GET_LOGS' }, (response) => {
        if (response && response.logs) {
            const logsEl = document.getElementById('logs');
            const recentLogs = response.logs.slice(-10).reverse();
            logsEl.innerHTML = recentLogs.map(log => 
                `<div style="margin-bottom: 5px; opacity: 0.9;">
                    <span style="font-size: 10px; opacity: 0.7;">${new Date(log.timestamp).toLocaleTimeString()}</span>
                    ${log.message}
                </div>`
            ).join('');
        }
    });
    
    // 定期的に更新
    setTimeout(updateLogs, 5000);
}