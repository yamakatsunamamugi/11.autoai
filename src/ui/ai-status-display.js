// AI Status Display - モデルと機能の表形式表示

(function() {
    'use strict';
    
    // AI設定を取得する関数
    async function getAIConfig() {
        return new Promise((resolve) => {
            chrome.storage.local.get(['ai_config_persistence'], (result) => {
                resolve(result.ai_config_persistence || {});
            });
        });
    }
    
    // タブからデータを取得する関数
    async function getDataFromTab(aiType) {
        const urls = {
            chatgpt: 'https://chatgpt.com',
            claude: 'https://claude.ai',
            gemini: 'https://gemini.google.com'
        };
        
        try {
            // 対象のタブを探す
            const tabs = await chrome.tabs.query({ url: `${urls[aiType]}/*` });
            if (tabs.length === 0) {
                return { connected: false, models: [], functions: [] };
            }
            
            // タブにメッセージを送信してデータを取得
            const response = await chrome.tabs.sendMessage(tabs[0].id, {
                action: 'getAIStatus'
            }).catch(() => null);
            
            if (response) {
                return {
                    connected: true,
                    models: response.models || [],
                    functions: response.functions || []
                };
            }
            
            return { connected: false, models: [], functions: [] };
        } catch (error) {
            console.error(`Error getting data from ${aiType}:`, error);
            return { connected: false, models: [], functions: [] };
        }
    }
    
    // テーブルを更新する関数
    function updateTable(aiType, dataType, items) {
        const tableId = `${aiType}${dataType.charAt(0).toUpperCase() + dataType.slice(1)}Table`;
        const loadingId = `${aiType}${dataType.charAt(0).toUpperCase() + dataType.slice(1)}Loading`;
        const noDataId = `${aiType}${dataType.charAt(0).toUpperCase() + dataType.slice(1)}NoData`;
        const countId = `${aiType}${dataType === 'models' ? 'Model' : 'Function'}Count`;
        
        const table = document.getElementById(tableId);
        const loading = document.getElementById(loadingId);
        const noData = document.getElementById(noDataId);
        const count = document.getElementById(countId);
        
        // ローディング非表示
        loading.classList.remove('active');
        
        if (!items || items.length === 0) {
            table.style.display = 'none';
            noData.style.display = 'block';
            count.textContent = '0';
            return;
        }
        
        // データがある場合
        noData.style.display = 'none';
        table.style.display = 'table';
        count.textContent = items.length;
        
        const tbody = table.querySelector('tbody');
        tbody.innerHTML = '';
        
        if (dataType === 'models') {
            items.forEach(model => {
                const row = tbody.insertRow();
                
                // モデル名
                const nameCell = row.insertCell();
                nameCell.textContent = model.name || model;
                
                // 状態
                const statusCell = row.insertCell();
                if (model.selected || model.active) {
                    statusCell.innerHTML = '<span class="tag tag-selected">選択中</span>';
                } else {
                    statusCell.innerHTML = '-';
                }
                
                // location情報があれば追加
                if (model.location && model.location !== 'main') {
                    nameCell.innerHTML += ` <span class="tag tag-location">${model.location}</span>`;
                }
            });
        } else {
            // Functions
            items.forEach(func => {
                const row = tbody.insertRow();
                
                // 機能名
                const nameCell = row.insertCell();
                nameCell.textContent = func.name || func;
                
                // タイプ
                const typeCell = row.insertCell();
                const type = func.type || 'normal';
                typeCell.innerHTML = `<span class="tag tag-type">${type}</span>`;
                
                // 場所
                const locationCell = row.insertCell();
                const location = func.location || 'main';
                locationCell.innerHTML = `<span class="tag tag-location">${location}</span>`;
                
                // アクティブな機能にマーク
                if (func.active) {
                    row.style.background = '#e8f5e9';
                }
            });
        }
    }
    
    // ステータスを更新する関数
    function updateStatus(aiType, connected) {
        const statusEl = document.getElementById(`${aiType}Status`);
        if (connected) {
            statusEl.textContent = '接続済み';
            statusEl.className = 'ai-status status-active';
        } else {
            statusEl.textContent = '未接続';
            statusEl.className = 'ai-status status-inactive';
        }
    }
    
    // 全てのAIデータを更新
    async function updateAllData() {
        console.log('データを更新中...');
        
        // 保存されているデータを取得
        const config = await getAIConfig();
        console.log('保存された設定:', config);
        
        // 各AIのデータを処理
        const aiTypes = ['chatgpt', 'claude', 'gemini'];
        
        for (const aiType of aiTypes) {
            // ローディング表示
            [`${aiType}ModelsLoading`, `${aiType}FunctionsLoading`].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.classList.add('active');
            });
            
            // 保存データから取得
            const aiConfig = config[aiType] || {};
            const models = aiConfig.models || [];
            const functions = aiConfig.functions || [];
            
            // タブから最新データを取得しようとする
            const tabData = await getDataFromTab(aiType);
            
            if (tabData.connected) {
                // タブが開いている場合は最新データを使用
                updateStatus(aiType, true);
                updateTable(aiType, 'models', tabData.models.length > 0 ? tabData.models : models);
                updateTable(aiType, 'functions', tabData.functions.length > 0 ? tabData.functions : functions);
            } else {
                // タブが開いていない場合は保存データを使用
                updateStatus(aiType, false);
                updateTable(aiType, 'models', models);
                updateTable(aiType, 'functions', functions);
            }
        }
        
        // 最終更新時刻を更新（要素が存在する場合のみ）
        const now = new Date();
        const lastUpdateEl = document.getElementById('lastUpdate');
        if (lastUpdateEl) {
            lastUpdateEl.textContent = `最終更新: ${now.toLocaleString('ja-JP')}`;
        }
    }
    
    // リアルタイムデータ取得（タブが開いている場合）
    async function fetchRealtimeData() {
        const aiTypes = ['chatgpt', 'claude', 'gemini'];
        
        for (const aiType of aiTypes) {
            try {
                // UnifiedAI APIを使用してデータを取得
                const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
                if (tabs[0]) {
                    const response = await chrome.tabs.sendMessage(tabs[0].id, {
                        action: 'executeScript',
                        script: `
                            if (typeof UnifiedAI !== 'undefined') {
                                (async () => {
                                    const models = await UnifiedAI.getAvailableModels();
                                    const functions = await UnifiedAI.getAvailableFunctions();
                                    return { models, functions };
                                })();
                            }
                        `
                    }).catch(() => null);
                    
                    if (response) {
                        updateTable(aiType, 'models', response.models);
                        updateTable(aiType, 'functions', response.functions);
                    }
                }
            } catch (error) {
                console.error(`Error fetching realtime data for ${aiType}:`, error);
            }
        }
    }
    
    // ストレージの変更を監視
    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName === 'local' && changes.ai_config_persistence) {
            console.log('設定が更新されました');
            updateAllData();
        }
    });
    
    // 初期化
    document.addEventListener('DOMContentLoaded', () => {
        // 初回データ取得
        updateAllData();
        
        // 更新ボタン
        document.getElementById('refreshBtn').addEventListener('click', () => {
            updateAllData();
            fetchRealtimeData();
        });
        
        // 自動更新は削除（手動更新のみ）
    });
})();