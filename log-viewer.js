/**
 * @fileoverview AutoAI ログビューアー JavaScript
 * Chrome拡張機能のログを表示・管理するUIコントローラー
 */

(() => {
    'use strict';

    // ========================================
    // 定数定義
    // ========================================
    const LOG_CATEGORIES = {
        ALL: 'all',
        CHATGPT: 'chatgpt',
        CLAUDE: 'claude', 
        GEMINI: 'gemini',
        GENSPARK: 'genspark',
        SYSTEM: 'system',
        ERROR: 'error'
    };

    const LOG_LEVELS = {
        DEBUG: 'debug',
        INFO: 'info',
        WARNING: 'warning',
        ERROR: 'error',
        SUCCESS: 'success'
    };

    // レベル別の絵文字とスタイル
    const LEVEL_CONFIG = {
        debug: { icon: '🔍', class: 'log-debug' },
        info: { icon: '📝', class: 'log-info' },
        warning: { icon: '⚠️', class: 'log-warning' },
        error: { icon: '❌', class: 'log-error' },
        success: { icon: '✅', class: 'log-success' }
    };

    // ========================================
    // 状態管理
    // ========================================
    const state = {
        logs: [],
        filteredLogs: [],
        currentCategory: LOG_CATEGORIES.ALL,
        currentLevel: 'all',
        searchQuery: '',
        autoScroll: true,
        showTimestamp: true,
        showDebug: true,
        selectedLogs: new Set(),
        isConnected: false,
        counts: {
            all: 0,
            chatgpt: 0,
            claude: 0,
            gemini: 0,
            genspark: 0,
            system: 0,
            error: 0
        }
    };

    // ========================================
    // DOM要素のキャッシュ
    // ========================================
    const elements = {};

    /**
     * DOM要素を初期化
     */
    function initElements() {
        elements.logContainer = document.getElementById('log-container');
        elements.searchInput = document.getElementById('search-input');
        elements.btnClearSearch = document.getElementById('btn-clear-search');
        elements.btnCopyAll = document.getElementById('btn-copy-all');
        elements.btnCopySelected = document.getElementById('btn-copy-selected');
        elements.btnExport = document.getElementById('btn-export');
        elements.btnClear = document.getElementById('btn-clear');
        elements.autoScroll = document.getElementById('auto-scroll');
        elements.showTimestamp = document.getElementById('show-timestamp');
        elements.showDebug = document.getElementById('show-debug');
        elements.logLevelFilter = document.getElementById('log-level-filter');
        elements.logCount = document.getElementById('log-count');
        elements.filteredCount = document.getElementById('filtered-count');
        elements.connectionStatus = document.getElementById('connection-status');
        elements.lastUpdate = document.getElementById('last-update');
        
        // タブボタン
        elements.tabs = document.querySelectorAll('.tab-button');
        
        // バッジ
        elements.badges = {
            all: document.getElementById('badge-all'),
            chatgpt: document.getElementById('badge-chatgpt'),
            claude: document.getElementById('badge-claude'),
            gemini: document.getElementById('badge-gemini'),
            genspark: document.getElementById('badge-genspark'),
            system: document.getElementById('badge-system'),
            error: document.getElementById('badge-error')
        };
    }

    // ========================================
    // ログ管理
    // ========================================
    
    /**
     * ログを追加
     */
    function addLog(logData) {
        const log = {
            id: logData.id || Date.now().toString(),
            timestamp: logData.timestamp || new Date().toISOString(),
            message: logData.message || '',
            category: logData.category || 'system',
            level: logData.level || 'info',
            ai: logData.ai || null,
            metadata: logData.metadata || {},
            source: logData.source || 'unknown'
        };
        
        state.logs.push(log);
        
        // 最大ログ数を超えたら古いものを削除
        if (state.logs.length > 10000) {
            state.logs.shift();
        }
        
        // カテゴリカウントを更新
        updateCounts();
        
        // フィルタリングを再実行
        applyFilters();
        
        // 最終更新時刻を更新
        updateLastUpdateTime();
    }

    /**
     * カテゴリカウントを更新
     */
    function updateCounts() {
        // カウントをリセット
        Object.keys(state.counts).forEach(key => {
            state.counts[key] = 0;
        });
        
        // 再カウント
        state.logs.forEach(log => {
            state.counts.all++;
            
            // AI別カウント
            if (log.ai) {
                const aiType = log.ai.toLowerCase();
                if (state.counts[aiType] !== undefined) {
                    state.counts[aiType]++;
                }
            }
            
            // カテゴリ別カウント
            if (log.category === 'system' || log.source === 'system') {
                state.counts.system++;
            }
            
            // エラーカウント
            if (log.level === 'error') {
                state.counts.error++;
            }
        });
        
        // バッジを更新
        updateBadges();
    }

    /**
     * バッジを更新
     */
    function updateBadges() {
        Object.keys(elements.badges).forEach(key => {
            const badge = elements.badges[key];
            if (badge) {
                badge.textContent = state.counts[key] || 0;
            }
        });
    }

    /**
     * フィルタを適用
     */
    function applyFilters() {
        state.filteredLogs = state.logs.filter(log => {
            // カテゴリフィルタ
            if (state.currentCategory !== LOG_CATEGORIES.ALL) {
                if (state.currentCategory === LOG_CATEGORIES.ERROR) {
                    if (log.level !== 'error') return false;
                } else if (state.currentCategory === LOG_CATEGORIES.SYSTEM) {
                    if (log.category !== 'system' && log.source !== 'system') return false;
                } else {
                    // AI別フィルタ
                    if (!log.ai || log.ai.toLowerCase() !== state.currentCategory) return false;
                }
            }
            
            // レベルフィルタ
            if (state.currentLevel !== 'all' && log.level !== state.currentLevel) {
                return false;
            }
            
            // デバッグフィルタ
            if (!state.showDebug && log.level === 'debug') {
                return false;
            }
            
            // 検索フィルタ
            if (state.searchQuery) {
                const query = state.searchQuery.toLowerCase();
                const messageMatch = log.message.toLowerCase().includes(query);
                const metadataMatch = JSON.stringify(log.metadata).toLowerCase().includes(query);
                if (!messageMatch && !metadataMatch) return false;
            }
            
            return true;
        });
        
        renderLogs();
        updateStatusBar();
    }

    /**
     * ログを表示
     */
    function renderLogs() {
        if (state.filteredLogs.length === 0) {
            elements.logContainer.innerHTML = `
                <div class="log-empty-state">
                    <p>📝 表示するログがありません</p>
                    <p class="text-muted">フィルタを調整するか、新しいログを待ってください</p>
                </div>
            `;
            return;
        }
        
        // 仮想スクロール対応（大量ログの場合）
        const fragment = document.createDocumentFragment();
        const maxDisplay = 1000; // 一度に表示する最大ログ数
        const logsToDisplay = state.filteredLogs.slice(-maxDisplay);
        
        logsToDisplay.forEach(log => {
            const logElement = createLogElement(log);
            fragment.appendChild(logElement);
        });
        
        elements.logContainer.innerHTML = '';
        elements.logContainer.appendChild(fragment);
        
        // 自動スクロール
        if (state.autoScroll) {
            elements.logContainer.scrollTop = elements.logContainer.scrollHeight;
        }
    }

    /**
     * ログ要素を作成
     */
    function createLogElement(log) {
        const div = document.createElement('div');
        div.className = `log-entry ${LEVEL_CONFIG[log.level]?.class || 'log-info'}`;
        div.dataset.logId = log.id;
        
        // タイムスタンプ
        let timestampHtml = '';
        if (state.showTimestamp) {
            const time = new Date(log.timestamp).toLocaleTimeString();
            timestampHtml = `<span class="log-timestamp">[${time}]</span>`;
        }
        
        // レベルアイコン
        const levelIcon = LEVEL_CONFIG[log.level]?.icon || '';
        
        // AI/ソース表示
        let sourceHtml = '';
        if (log.ai) {
            sourceHtml = `<span class="log-source">[${log.ai}]</span>`;
        } else if (log.source && log.source !== 'unknown') {
            sourceHtml = `<span class="log-source">[${log.source}]</span>`;
        }
        
        // メタデータ
        let metadataHtml = '';
        if (log.metadata && Object.keys(log.metadata).length > 0) {
            metadataHtml = `<span class="log-metadata" title="${escapeHtml(JSON.stringify(log.metadata, null, 2))}">📎</span>`;
        }
        
        div.innerHTML = `
            <input type="checkbox" class="log-checkbox" data-log-id="${log.id}">
            ${timestampHtml}
            ${levelIcon}
            ${sourceHtml}
            <span class="log-message">${escapeHtml(log.message)}</span>
            ${metadataHtml}
        `;
        
        // クリックイベント
        div.addEventListener('click', (e) => {
            if (e.target.classList.contains('log-checkbox')) {
                toggleLogSelection(log.id);
            } else if (e.target.classList.contains('log-metadata')) {
                showMetadataPopup(log.metadata);
            }
        });
        
        // 右クリックメニュー
        div.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            showContextMenu(e, log);
        });
        
        return div;
    }

    /**
     * HTMLエスケープ
     */
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ========================================
    // UI操作
    // ========================================
    
    /**
     * タブ切り替え
     */
    function switchTab(category) {
        state.currentCategory = category;
        
        // タブのアクティブ状態を更新
        elements.tabs.forEach(tab => {
            if (tab.dataset.category === category) {
                tab.classList.add('active');
            } else {
                tab.classList.remove('active');
            }
        });
        
        applyFilters();
    }

    /**
     * ログ選択の切り替え
     */
    function toggleLogSelection(logId) {
        if (state.selectedLogs.has(logId)) {
            state.selectedLogs.delete(logId);
        } else {
            state.selectedLogs.add(logId);
        }
        
        updateSelectionUI();
    }

    /**
     * 選択UIを更新
     */
    function updateSelectionUI() {
        elements.btnCopySelected.disabled = state.selectedLogs.size === 0;
        
        // チェックボックスの状態を同期
        document.querySelectorAll('.log-checkbox').forEach(checkbox => {
            const logId = checkbox.dataset.logId;
            checkbox.checked = state.selectedLogs.has(logId);
        });
    }

    /**
     * ステータスバーを更新
     */
    function updateStatusBar() {
        elements.logCount.textContent = `${state.logs.length} 件のログ`;
        elements.filteredCount.textContent = `${state.filteredLogs.length} 件表示中`;
    }

    /**
     * 最終更新時刻を更新
     */
    function updateLastUpdateTime() {
        const now = new Date().toLocaleTimeString();
        elements.lastUpdate.textContent = `最終更新: ${now}`;
    }

    /**
     * 接続状態を更新
     */
    function updateConnectionStatus(connected) {
        state.isConnected = connected;
        const statusDot = elements.connectionStatus.querySelector('.status-dot');
        
        if (connected) {
            statusDot.className = 'status-dot status-connected';
            elements.connectionStatus.innerHTML = '<span class="status-dot status-connected"></span> 接続中';
        } else {
            statusDot.className = 'status-dot status-disconnected';
            elements.connectionStatus.innerHTML = '<span class="status-dot status-disconnected"></span> 切断';
        }
    }

    // ========================================
    // アクション
    // ========================================
    
    /**
     * すべてコピー
     */
    function copyAll() {
        const text = state.filteredLogs.map(log => {
            const time = new Date(log.timestamp).toLocaleTimeString();
            return `[${time}] ${log.message}`;
        }).join('\n');
        
        navigator.clipboard.writeText(text).then(() => {
            showToast('ログをコピーしました');
        });
    }

    /**
     * 選択をコピー
     */
    function copySelected() {
        const selectedLogs = state.logs.filter(log => state.selectedLogs.has(log.id));
        const text = selectedLogs.map(log => {
            const time = new Date(log.timestamp).toLocaleTimeString();
            return `[${time}] ${log.message}`;
        }).join('\n');
        
        navigator.clipboard.writeText(text).then(() => {
            showToast(`${selectedLogs.length}件のログをコピーしました`);
            state.selectedLogs.clear();
            updateSelectionUI();
        });
    }

    /**
     * エクスポート
     */
    function exportLogs() {
        const data = {
            exportDate: new Date().toISOString(),
            logs: state.filteredLogs,
            metadata: {
                totalLogs: state.logs.length,
                filteredLogs: state.filteredLogs.length,
                category: state.currentCategory,
                level: state.currentLevel
            }
        };
        
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `autoai-logs-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
        
        showToast('ログをエクスポートしました');
    }

    /**
     * クリア
     */
    function clearLogs() {
        if (!confirm('現在のカテゴリのログをクリアしますか？')) return;
        
        if (state.currentCategory === LOG_CATEGORIES.ALL) {
            state.logs = [];
        } else {
            state.logs = state.logs.filter(log => {
                if (state.currentCategory === LOG_CATEGORIES.ERROR) {
                    return log.level !== 'error';
                } else if (state.currentCategory === LOG_CATEGORIES.SYSTEM) {
                    return log.category !== 'system' && log.source !== 'system';
                } else {
                    return !log.ai || log.ai.toLowerCase() !== state.currentCategory;
                }
            });
        }
        
        updateCounts();
        applyFilters();
        showToast('ログをクリアしました');
    }

    /**
     * トースト表示
     */
    function showToast(message) {
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = message;
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.classList.add('show');
        }, 10);
        
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => {
                document.body.removeChild(toast);
            }, 300);
        }, 2000);
    }

    /**
     * コンテキストメニュー表示
     */
    function showContextMenu(e, log) {
        const menu = document.getElementById('context-menu');
        menu.style.left = `${e.pageX}px`;
        menu.style.top = `${e.pageY}px`;
        menu.style.display = 'block';
        
        // メニューアイテムのクリック処理
        const handleClick = (e) => {
            const action = e.target.dataset.action;
            if (action === 'copy') {
                navigator.clipboard.writeText(log.message);
                showToast('コピーしました');
            } else if (action === 'copy-row') {
                const time = new Date(log.timestamp).toLocaleTimeString();
                navigator.clipboard.writeText(`[${time}] ${log.message}`);
                showToast('行をコピーしました');
            } else if (action === 'filter-similar') {
                state.searchQuery = log.message.substring(0, 30);
                elements.searchInput.value = state.searchQuery;
                applyFilters();
            } else if (action === 'clear-selection') {
                state.selectedLogs.clear();
                updateSelectionUI();
            }
            
            menu.style.display = 'none';
            menu.removeEventListener('click', handleClick);
        };
        
        menu.addEventListener('click', handleClick);
        
        // 外側クリックで閉じる
        setTimeout(() => {
            document.addEventListener('click', () => {
                menu.style.display = 'none';
            }, { once: true });
        }, 0);
    }

    /**
     * メタデータポップアップ表示
     */
    function showMetadataPopup(metadata) {
        alert(JSON.stringify(metadata, null, 2));
    }

    // ========================================
    // Chrome拡張機能との通信
    // ========================================
    
    /**
     * バックグラウンドスクリプトと接続
     */
    function connectToBackground() {
        // ポート接続
        const port = chrome.runtime.connect({ name: 'log-viewer' });
        
        port.onMessage.addListener((message) => {
            if (message.type === 'log') {
                addLog(message.data);
            } else if (message.type === 'logs-batch') {
                message.data.forEach(log => addLog(log));
            } else if (message.type === 'clear') {
                state.logs = [];
                updateCounts();
                applyFilters();
            }
        });
        
        port.onDisconnect.addListener(() => {
            updateConnectionStatus(false);
            // 再接続を試みる
            setTimeout(connectToBackground, 5000);
        });
        
        updateConnectionStatus(true);
        
        // 既存のログを要求
        port.postMessage({ type: 'get-logs' });
    }

    /**
     * chrome.runtime.onMessageリスナー
     */
    function setupMessageListener() {
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            if (request.action === 'addLog') {
                addLog(request.log);
                sendResponse({ success: true });
            } else if (request.action === 'clearLogs') {
                state.logs = [];
                updateCounts();
                applyFilters();
                sendResponse({ success: true });
            }
        });
    }

    // ========================================
    // イベントリスナー
    // ========================================
    
    function setupEventListeners() {
        // タブ切り替え
        elements.tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                switchTab(tab.dataset.category);
            });
        });
        
        // 検索
        elements.searchInput.addEventListener('input', (e) => {
            state.searchQuery = e.target.value;
            applyFilters();
        });
        
        elements.btnClearSearch.addEventListener('click', () => {
            state.searchQuery = '';
            elements.searchInput.value = '';
            applyFilters();
        });
        
        // ボタン
        elements.btnCopyAll.addEventListener('click', copyAll);
        elements.btnCopySelected.addEventListener('click', copySelected);
        elements.btnExport.addEventListener('click', exportLogs);
        elements.btnClear.addEventListener('click', clearLogs);
        
        // チェックボックス
        elements.autoScroll.addEventListener('change', (e) => {
            state.autoScroll = e.target.checked;
        });
        
        elements.showTimestamp.addEventListener('change', (e) => {
            state.showTimestamp = e.target.checked;
            renderLogs();
        });
        
        elements.showDebug.addEventListener('change', (e) => {
            state.showDebug = e.target.checked;
            applyFilters();
        });
        
        // レベルフィルタ
        elements.logLevelFilter.addEventListener('change', (e) => {
            state.currentLevel = e.target.value;
            applyFilters();
        });
        
        // キーボードショートカット
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey || e.metaKey) {
                if (e.key === 'a') {
                    e.preventDefault();
                    // すべて選択
                    state.selectedLogs.clear();
                    state.filteredLogs.forEach(log => {
                        state.selectedLogs.add(log.id);
                    });
                    updateSelectionUI();
                } else if (e.key === 'c' && state.selectedLogs.size > 0) {
                    e.preventDefault();
                    copySelected();
                } else if (e.key === 'f') {
                    e.preventDefault();
                    elements.searchInput.focus();
                }
            } else if (e.key === 'Escape') {
                state.selectedLogs.clear();
                updateSelectionUI();
            }
        });
    }

    // ========================================
    // 初期化
    // ========================================
    
    function init() {
        initElements();
        setupEventListeners();
        setupMessageListener();
        connectToBackground();
        
        // 初期表示
        applyFilters();
        updateConnectionStatus(false);
        
        // テストデータ（開発用）
        if (window.location.protocol === 'file:') {
            addTestLogs();
        }
    }

    /**
     * テストログを追加（開発用）
     */
    function addTestLogs() {
        const testLogs = [
            { message: 'ChatGPT タスク実行開始', ai: 'ChatGPT', level: 'info' },
            { message: 'Claude DeepResearch モード検出', ai: 'Claude', level: 'info' },
            { message: 'Gemini 停止ボタン消滅を検出', ai: 'Gemini', level: 'success' },
            { message: 'Genspark スライド生成開始', ai: 'Genspark', level: 'info' },
            { message: 'タスクリスト生成完了: 50件', category: 'system', level: 'success' },
            { message: 'ネットワークエラー: タイムアウト', level: 'error' },
            { message: 'デバッグ情報: メモリ使用率 45%', level: 'debug' }
        ];
        
        testLogs.forEach((log, i) => {
            setTimeout(() => addLog(log), i * 500);
        });
    }

    // DOMContentLoaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();