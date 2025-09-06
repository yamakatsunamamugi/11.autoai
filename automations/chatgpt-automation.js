/**
 * @fileoverview ChatGPT自動化関数 - 統合テスト版
 * 
 * 【役割】
 * ChatGPT専用の自動化処理を提供
 * 
 * 【主要機能】
 * - ChatGPT固有のモデル選択（GPT-5、Fast、Thinking、Proなど）
 * - ChatGPT固有の機能選択（エージェントモード、Deep Research、Canvasなど）
 * - サブメニュー対応（"その他のモデル"、"さらに表示"）
 * 
 * 【依存関係】
 * - common-ai-handler.js: window.AIHandlerを使用
 * - ui-selectors.js: ChatGPT用セレクタを使用
 * 
 * 【グローバル公開】
 * window.ChatGPTAutomation: コンソールから直接呼び出し可能
 */
(() => {
    "use strict";

    console.log('%cChatGPT自動化関数 - 統合テスト版', 'color: #00BCD4; font-weight: bold; font-size: 16px');
    console.log('【使用】common-ai-handler.jsのwindow.AIHandlerを使用');
    
    // common-ai-handler.jsのAIHandlerを使用
    const useAIHandler = window.AIHandler;
    let menuHandler = null;  // AIHandlerのメニューハンドラーインスタンス（common-ai-handler.jsのMenuHandlerクラス）

    // ============================================
    // CONFIG部分
    // ============================================
    const CONFIG = {
        models: {
            main: [
                { name: 'GPT-5', testId: 'model-switcher-gpt-5' }
            ],
            submenu: [
                { name: 'GPT-5 Thinking', menuText: 'その他のモデル' },
                { name: 'GPT-5 Pro', menuText: 'その他のモデル' }
            ]
        },
        
        functions: {
            main: [
                { name: '写真とファイルを追加', type: 'normal' },
                { name: 'エージェントモード', type: 'radio', badge: '新規' },
                { name: 'Deep Research', type: 'radio' },
                { name: '画像を作成する', type: 'radio' },
                { name: 'より長く思考する', type: 'radio' }
            ],
            submenu: [
                { name: 'コネクターを使用する', menuText: 'さらに表示', type: 'radio' },
                { name: 'あらゆる学びをサポート', menuText: 'さらに表示', type: 'radio' },
                { name: 'ウェブ検索', menuText: 'さらに表示', type: 'radio' },
                { name: 'canvas', menuText: 'さらに表示', type: 'radio' },
                { name: 'OneDrive を接続する', menuText: 'さらに表示', type: 'normal' },
                { name: 'Sharepoint を接続する', menuText: 'さらに表示', type: 'normal' }
            ]
        },
        
        delays: {
            menuOpen: 500,
            submenuOpen: 800,
            afterClick: 300,
            betweenActions: 1000,
            textInput: 100,
            elementSearch: 500
        }
    };

    // HTMLのIDと実際の機能名のマッピング
    const FUNCTION_MAPPING = {
        'none': null,
        'agent': 'エージェントモード',
        'deep-research': 'Deep Research',
        'image': '画像を作成する',
        'thinking': 'より長く思考する',
        'canvas': 'canvas',
        'web-search': 'ウェブ検索',
        'learning': 'あらゆる学びをサポート',
        'connector': 'コネクターを使用する'
    };

    // ============================================
    // グローバル変数
    // ============================================
    let currentState = {
        selectedModel: null,
        activeFunctions: new Set(),
        lastText: null,
        debug: false,
        sendStartTime: null  // 送信開始時刻を記録
    };

    // ============================================
    // ユーティリティ関数
    // ============================================
    const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    const findElement = async (selectors, condition = null, maxWait = 3000) => {
        const startTime = Date.now();
        while (Date.now() - startTime < maxWait) {
            for (const selector of selectors) {
                try {
                    const elements = document.querySelectorAll(selector);
                    for (const element of elements) {
                        if (!condition || condition(element)) {
                            return element;
                        }
                    }
                } catch (e) {}
            }
            await wait(CONFIG.delays.elementSearch);
        }
        return null;
    };

    const performClick = async (element) => {
        if (!element) return false;
        try {
            const rect = element.getBoundingClientRect();
            const x = rect.left + rect.width / 2;
            const y = rect.top + rect.height / 2;

            element.dispatchEvent(new PointerEvent('pointerdown', {
                bubbles: true,
                cancelable: true,
                view: window,
                clientX: x,
                clientY: y,
                pointerId: 1
            }));

            await wait(CONFIG.delays.click);

            element.dispatchEvent(new PointerEvent('pointerup', {
                bubbles: true,
                cancelable: true,
                view: window,
                clientX: x,
                clientY: y,
                pointerId: 1
            }));

            element.click();
            return true;
        } catch (e) {
            return false;
        }
    };

    // ========================================
    // 拡張ログシステム（Claudeと同様）
    // ========================================
    const LogLevel = {
        TRACE: 0,
        DEBUG: 1,
        INFO: 2,
        WARN: 3,
        ERROR: 4,
        FATAL: 5
    };

    let logConfig = {
        level: LogLevel.INFO,
        enableConsole: true,
        enableStorage: true,
        maxStorageEntries: 1000,
        includeTimestamp: true,
        includePerformance: true
    };

    let logStorage = [];
    let sessionId = Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    let operationContext = null;
    let performanceMetrics = new Map();

    const logTypeConfig = {
        'TRACE': { level: LogLevel.TRACE, prefix: '🔬', color: '#888' },
        'DEBUG': { level: LogLevel.DEBUG, prefix: '🔍', color: '#9C27B0' },
        'INFO': { level: LogLevel.INFO, prefix: '📝', color: '#2196F3' },
        'SUCCESS': { level: LogLevel.INFO, prefix: '✅', color: '#4CAF50' },
        'WARN': { level: LogLevel.WARN, prefix: '⚠️', color: '#FF9800' },
        'WARNING': { level: LogLevel.WARN, prefix: '⚠️', color: '#FF9800' },
        'ERROR': { level: LogLevel.ERROR, prefix: '❌', color: '#F44336' },
        'FATAL': { level: LogLevel.FATAL, prefix: '💀', color: '#8B0000' },
        'SEARCH': { level: LogLevel.INFO, prefix: '🔎', color: '#2196F3' },
        'PERFORMANCE': { level: LogLevel.INFO, prefix: '⚡', color: '#FF6B35' },
        'USER_ACTION': { level: LogLevel.INFO, prefix: '👤', color: '#8764B8' },
        'AUTOMATION': { level: LogLevel.INFO, prefix: '🤖', color: '#00BCD4' }
    };

    function formatTimestamp() {
        const now = new Date();
        return now.toISOString().replace('T', ' ').substr(0, 23);
    }

    function formatDuration(startTime) {
        const duration = Date.now() - startTime;
        if (duration < 1000) return `${duration}ms`;
        if (duration < 60000) return `${(duration / 1000).toFixed(2)}s`;
        return `${(duration / 60000).toFixed(2)}m`;
    }

    function createLogEntry(message, type, context = {}) {
        const typeInfo = logTypeConfig[type] || logTypeConfig['INFO'];
        
        return {
            timestamp: Date.now(),
            sessionId,
            level: typeInfo.level,
            type,
            message,
            context: {
                operation: operationContext,
                ...context
            },
            formattedTime: formatTimestamp()
        };
    }

    function shouldLog(type) {
        const typeInfo = logTypeConfig[type] || logTypeConfig['INFO'];
        return typeInfo.level >= logConfig.level;
    }

    function storeLogEntry(entry) {
        if (!logConfig.enableStorage) return;
        
        logStorage.push(entry);
        
        if (logStorage.length > logConfig.maxStorageEntries) {
            logStorage = logStorage.slice(-logConfig.maxStorageEntries);
        }
    }

    const log = (message, type = 'INFO', context = {}) => {
        if (!shouldLog(type)) return;

        const typeInfo = logTypeConfig[type] || logTypeConfig['INFO'];
        const entry = createLogEntry(message, type, context);
        
        storeLogEntry(entry);

        // 拡張機能のLogManagerに送信
        if (window.chrome && window.chrome.runtime) {
            try {
                window.chrome.runtime.sendMessage({
                    action: 'LOG_AI_MESSAGE',
                    aiType: 'ChatGPT',
                    message: message,
                    options: {
                        level: type.toLowerCase(),
                        metadata: {
                            operation: operationContext,
                            ...context
                        }
                    }
                }).catch(() => {
                    // エラーを無視（拡張機能が無効な場合）
                });
            } catch (e) {
                // chrome.runtime が利用できない場合は無視
            }
        }

        if (logConfig.enableConsole) {
            const timeStr = logConfig.includeTimestamp ? `[${formatTimestamp()}] ` : '';
            const contextStr = operationContext ? `[${operationContext}] ` : '';
            const fullMessage = `${typeInfo.prefix} ${timeStr}[ChatGPT] ${contextStr}${message}`;
            
            if (typeInfo.level >= LogLevel.ERROR) {
                console.error(fullMessage, context);
            } else if (typeInfo.level >= LogLevel.WARN) {
                console.warn(fullMessage, context);
            } else {
                console.log(fullMessage, context);
            }
        }
    };

    function startOperation(operationName, details = {}) {
        operationContext = operationName;
        const startTime = Date.now();
        performanceMetrics.set(operationName, { startTime, details });
        
        log(`開始: ${operationName}`, 'AUTOMATION', details);
        return startTime;
    }

    function endOperation(operationName, result = {}) {
        const metrics = performanceMetrics.get(operationName);
        if (metrics) {
            const duration = Date.now() - metrics.startTime;
            const context = {
                duration: formatDuration(metrics.startTime),
                durationMs: duration,
                ...metrics.details,
                result
            };
            
            log(`完了: ${operationName} (${formatDuration(metrics.startTime)})`, 'PERFORMANCE', context);
            performanceMetrics.delete(operationName);
        }
        
        if (operationContext === operationName) {
            operationContext = null;
        }
    }

    function logError(error, context = {}) {
        const errorContext = {
            name: error.name,
            message: error.message,
            stack: error.stack,
            ...context
        };
        log(`エラー発生: ${error.message}`, 'ERROR', errorContext);
    }

    function logUserAction(action, target, details = {}) {
        const context = {
            action,
            target,
            ...details
        };
        log(`ユーザーアクション: ${action} -> ${target}`, 'USER_ACTION', context);
    }

    const debugLog = (message) => {
        log(`[DEBUG] ${message}`, 'DEBUG');
    };

    // ============================================
    // 基本的なユーティリティ関数
    // ============================================
    const clickElement = async (element) => {
        if (!element) return false;

        const clickMethods = [
            // 方法1: 通常のclick
            async () => {
                element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                await wait(200);
                element.click();
                return true;
            },
            // 方法2: MouseEvent (mousedown→mouseup→click)
            async () => {
                element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
                await wait(50);
                element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
                element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
                return true;
            },
            // 方法3: PointerEvent (pointerdown→pointerup→click)
            async () => {
                element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
                await wait(50);
                element.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
                element.click();
                return true;
            },
            // 方法4: Focus + Enter
            async () => {
                element.focus();
                await wait(50);
                element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
                element.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }));
                return true;
            }
        ];

        // 各クリック方法を順番に試す
        for (let i = 0; i < clickMethods.length; i++) {
            try {
                debugLog(`クリック方法${i + 1}/4を試行中...`);
                await clickMethods[i]();
                await wait(500);
                
                // ChatGPTのモデルボタンの場合、メニューが開いたか確認
                if (element.getAttribute('data-testid') === 'model-switcher-dropdown-button') {
                    // aria-expandedがtrueになったか確認
                    if (element.getAttribute('aria-expanded') === 'true') {
                        debugLog(`クリック方法${i + 1}で成功`);
                        return true;
                    }
                } else {
                    // 他の要素の場合は成功とみなす
                    return true;
                }
            } catch (e) {
                debugLog(`クリック方法${i + 1}失敗: ${e.message}`);
            }
        }
        
        debugLog('すべてのクリック方法が失敗しました');
        return false;
    };

    // ============================================
    // メニュー操作関数（動作確認済み堅牢版）
    // ============================================
    async function closeMenu() {
        debugLog('メニューを閉じる処理をスキップ（誤クリック防止）');
        
        // ESCキーとbodyクリックは誤クリックの原因となるため削除
        // メニューは自然に閉じるか、他の操作で閉じることを想定
        
        await wait(200); // 少し待機
        
        debugLog('メニュー閉じ処理完了（スキップ）');
        return true; // 常に成功とみなす
    }


    async function waitForMenu(maxWait = 3000) {
        debugLog(`メニューを待機中... (最大${maxWait}ms)`);
        const startTime = Date.now();
        
        while (Date.now() - startTime < maxWait) {
            // Radix UIのポッパーを優先的に探す
            const popperSelectors = window.AIHandler?.getSelectors?.('ChatGPT', 'POPPER_CONTAINER') || ['[data-radix-popper-content-wrapper]'];
            let poppers = [];
            for (const selector of popperSelectors) {
                poppers.push(...document.querySelectorAll(selector));
            }
            for (const popper of poppers) {
                // MENU.CONTAINERセレクタを取得（オブジェクトの場合はCONTAINERプロパティを使用）
                const menuConfig = window.AIHandler?.getSelectors?.('ChatGPT', 'MENU');
                const menuSelectors = menuConfig?.CONTAINER ? 
                    [menuConfig.CONTAINER] : 
                    (Array.isArray(menuConfig) ? menuConfig : ['[role="menu"]']);
                
                let menu = null;
                for (const selector of menuSelectors) {
                    menu = popper.querySelector(selector);
                    if (menu) break;
                }
                if (menu && menu.offsetParent !== null) {
                    const items = menu.querySelectorAll('[role="menuitem"], [role="menuitemradio"]');
                    if (items.length > 0) {
                        debugLog(`メニューを発見: Radix UIポッパー内 (項目数: ${items.length})`);
                        await wait(CONFIG.delays.menuOpen);
                        return menu;
                    }
                }
            }
            
            // 通常のメニューセレクタでも探す
            const menuSelectors = [
                '[role="menu"]',
                'div[data-radix-menu-content]',
                'div[data-state="open"][role="menu"]',
                '.popover[role="menu"]',
                '[aria-orientation="vertical"][role="menu"]'
            ];
            
            for (const selector of menuSelectors) {
                const menus = document.querySelectorAll(selector);
                for (const menu of menus) {
                    // 表示されているメニューのみ対象
                    if (menu && menu.offsetParent !== null) {
                        // メニューの内容も確認（空でないこと）
                        const items = menu.querySelectorAll('[role="menuitem"], [role="menuitemradio"]');
                        if (items.length > 0) {
                            debugLog(`メニューを発見: ${selector} (項目数: ${items.length})`);
                            await wait(CONFIG.delays.menuOpen);
                            return menu;
                        }
                    }
                }
            }
            await wait(100);
        }
        
        debugLog('メニュー待機タイムアウト');
        return null;
    }

    async function openSubmenu(menuItem) {
        const triggerText = menuItem.textContent?.trim() || 'Unknown';
        debugLog(`サブメニューを開きます: "${triggerText}"`);
        
        // 初期状態を記録
        const initialAriaExpanded = menuItem.getAttribute('aria-expanded');
        debugLog(`初期aria-expanded: ${initialAriaExpanded}`);
        
        // ホバーイベントを発火（成功実績のある方法）
        debugLog('ホバーイベントを発火中...');
        menuItem.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
        menuItem.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
        
        // より長い待機時間でaria-expandedの変化を監視
        let waitTime = 0;
        const maxWaitTime = 2000; // 2秒まで待機
        const checkInterval = 100; // 100msごとにチェック
        
        while (waitTime < maxWaitTime) {
            await wait(checkInterval);
            waitTime += checkInterval;
            
            const currentAriaExpanded = menuItem.getAttribute('aria-expanded');
            if (currentAriaExpanded === 'true') {
                debugLog(`✅ aria-expanded状態変化検出: ${initialAriaExpanded} → ${currentAriaExpanded} (${waitTime}ms)`);
                break;
            }
        }
        
        // 追加の安定化待機
        await wait(300);
        
        // サブメニューが開いたか確認
        const menuConfig = window.AIHandler?.getSelectors?.('ChatGPT', 'MENU');
        const menuSelectors = menuConfig?.CONTAINER ? 
            [menuConfig.CONTAINER] : 
            (Array.isArray(menuConfig) ? menuConfig : ['[role="menu"]']);
        let allMenus = [];
        for (const selector of menuSelectors) {
            allMenus.push(...document.querySelectorAll(selector));
        }
        
        debugLog(`メニュー数確認: ${allMenus.length}個`);
        if (allMenus.length > 1) {
            const submenu = allMenus[allMenus.length - 1];
            debugLog(`✅ ホバーでサブメニューが開きました: ${submenu.className}`);
            return submenu;
        }
        
        // Radix UIポッパーも確認
        const popperSelectors = window.AIHandler?.getSelectors?.('ChatGPT', 'POPPER_CONTAINER') || ['[data-radix-popper-content-wrapper]'];
        let poppers = [];
        for (const selector of popperSelectors) {
            poppers.push(...document.querySelectorAll(selector));
        }
        
        debugLog(`ポッパー数確認: ${poppers.length}個`);
        if (poppers.length > 1) {
            const submenu = poppers[poppers.length - 1].querySelector('[role="menu"]');
            if (submenu) {
                debugLog(`✅ ホバーでサブメニューが開きました（ポッパー経由）: ${submenu.className}`);
                return submenu;
            }
        }
        
        // ホバーで開かない場合はクリックも試みる
        debugLog('ホバーで開かなかったため、クリックを試行');
        await performClick(menuItem);
        
        // クリック後もaria-expandedの変化を監視
        waitTime = 0;
        while (waitTime < maxWaitTime) {
            await wait(checkInterval);
            waitTime += checkInterval;
            
            const currentAriaExpanded = menuItem.getAttribute('aria-expanded');
            if (currentAriaExpanded === 'true') {
                debugLog(`✅ クリック後のaria-expanded状態変化検出: ${currentAriaExpanded} (${waitTime}ms)`);
                break;
            }
        }
        
        // 追加の安定化待機
        await wait(300);
        
        // menuSelectorsは上で定義済みなので再利用
        let menusAfterClick = [];
        for (const selector of menuSelectors) {
            menusAfterClick.push(...document.querySelectorAll(selector));
        }
        
        debugLog(`クリック後メニュー数確認: ${menusAfterClick.length}個`);
        if (menusAfterClick.length > 1) {
            const submenu = menusAfterClick[menusAfterClick.length - 1];
            debugLog(`✅ クリックでサブメニューが開きました: ${submenu.className}`);
            return submenu;
        }
        
        let poppersAfterClick = [];
        for (const selector of popperSelectors) {
            poppersAfterClick.push(...document.querySelectorAll(selector));
        }
        
        debugLog(`クリック後ポッパー数確認: ${poppersAfterClick.length}個`);
        if (poppersAfterClick.length > 1) {
            const submenu = poppersAfterClick[poppersAfterClick.length - 1].querySelector('[role="menu"]');
            if (submenu) {
                debugLog(`✅ クリックでサブメニューが開きました（ポッパー経由）: ${submenu.className}`);
                return submenu;
            }
        }
        
        const finalAriaExpanded = menuItem.getAttribute('aria-expanded');
        debugLog(`❌ サブメニューが開けませんでした - 最終aria-expanded: ${finalAriaExpanded}`);
        return null;
    }

    // ============================================
    // モデル選択関数（動的検索版）
    // ============================================

    // ============================================
    // メニューが閉じたか確認する関数
    // ============================================
    const checkMenuClosed = async () => {
        const menuSelectors = [
            '[data-radix-popper-content-wrapper]',
            '[role="menu"]:not([style*="display: none"])',
            '.relative.z-\\[60\\]',
            '[data-state="open"]'
        ];
        
        for (const selector of menuSelectors) {
            const menu = document.querySelector(selector);
            if (menu && menu.offsetParent !== null) {
                return false; // メニューがまだ開いている
            }
        }
        return true; // メニューが閉じている
    };

    // ============================================
    // モデル選択関数（collectAvailableModelsのロジックを使用）
    // ============================================
    async function selectModel(modelName) {
        const operationName = 'selectModel';
        const startTime = startOperation(operationName, {
            modelName,
            timestamp: new Date().toISOString()
        });

        log(`モデル選択開始: ${modelName}`, 'SEARCH', { modelName });
        
        try {
            // モデル選択ボタンを探す
            const modelButtonSelectors = [
                '[data-testid="model-switcher-dropdown-button"]',
                '[aria-label*="モデル"]',
                '[aria-label*="Model"]',
                'button[aria-haspopup="menu"]'
            ];
            
            const modelButton = await findElement(modelButtonSelectors);
            if (!modelButton) {
                const error = 'モデル選択ボタンが見つかりません';
                log(error, 'ERROR');
                endOperation(operationName, { success: false, error });
                return false;
            }
            
            // メニューを開く
            await clickElement(modelButton);
            await wait(CONFIG.delays.menuOpen);
            
            // "first"の場合は一番上のモデルを選択
            if (modelName === 'first') {
                const menuItemSelectors = window.AIHandler?.getSelectors?.('ChatGPT', 'MENU_ITEM') || ['[role="option"]', '[role="menuitem"]', '[role="menuitemradio"]'];
                let menuItems = [];
                for (const selector of menuItemSelectors) {
                    menuItems.push(...document.querySelectorAll(selector));
                }
                
                if (menuItems.length > 0) {
                    // 一番最初のメニュー項目を選択
                    const firstItem = menuItems[0];
                    log(`一番上のモデルを選択: ${firstItem.textContent?.trim()}`, 'INFO');
                    await clickElement(firstItem);
                    await wait(CONFIG.delays.afterClick);
                    
                    const success = await checkMenuClosed();
                    if (success) {
                        log(`一番上のモデル選択成功: ${firstItem.textContent?.trim()}`, 'SUCCESS');
                        endOperation(operationName, { success: true, model: firstItem.textContent?.trim() });
                        return true;
                    }
                }
                
                log('一番上のモデルが見つかりません', 'ERROR');
                endOperation(operationName, { success: false, error: '一番上のモデルが見つかりません' });
                return false;
            }
            
            // まずメインメニューから探す
            const menuItemSelectors = window.AIHandler?.getSelectors?.('ChatGPT', 'MENU_ITEM') || ['[role="option"]', '[role="menuitem"]', '[role="menuitemradio"]'];
            let menuItems = [];
            for (const selector of menuItemSelectors) {
                menuItems.push(...document.querySelectorAll(selector));
            }
            
            log(`メニュー項目数: ${menuItems.length}`, 'DEBUG');
            
            // メインメニューで探す
            for (const item of menuItems) {
                const text = item.textContent?.trim();
                if (text && (text === modelName || text.includes(modelName))) {
                    log(`メインメニューでモデル「${text}」を発見`, 'INFO');
                    
                    // 複数のクリック方法を試す
                    const clickMethods = [
                        async () => {
                            log('クリック方法1: 通常のclick', 'DEBUG');
                            item.click();
                            return true;
                        },
                        async () => {
                            log('クリック方法2: clickElement', 'DEBUG');
                            await clickElement(item);
                            return true;
                        },
                        async () => {
                            log('クリック方法3: PointerEvent', 'DEBUG');
                            const rect = item.getBoundingClientRect();
                            const x = rect.left + rect.width / 2;
                            const y = rect.top + rect.height / 2;
                            
                            item.dispatchEvent(new PointerEvent('pointerdown', {
                                bubbles: true,
                                cancelable: true,
                                clientX: x,
                                clientY: y
                            }));
                            await wait(50);
                            item.dispatchEvent(new PointerEvent('pointerup', {
                                bubbles: true,
                                cancelable: true,
                                clientX: x,
                                clientY: y
                            }));
                            item.click();
                            return true;
                        }
                    ];
                    
                    // 各クリック方法を試す
                    for (const [index, clickMethod] of clickMethods.entries()) {
                        try {
                            await clickMethod();
                            await wait(500);
                            
                            const menuClosed = await checkMenuClosed();
                            if (menuClosed) {
                                const message = `✅ クリック方法${index + 1}でモデル「${modelName}」を選択成功`;
                                log(message, 'SUCCESS');
                                currentState.selectedModel = modelName;
                                endOperation(operationName, { 
                                    success: true, 
                                    selectedModel: modelName,
                                    clickMethod: index + 1
                                });
                                return true;
                            }
                        } catch (error) {
                            log(`クリック方法${index + 1}失敗: ${error.message}`, 'DEBUG');
                        }
                    }
                }
            }
            
            // メインメニューで見つからない場合、サブメニューを探す（レガシーモデルなど）
            log('メインメニューで見つからないため、サブメニューを探します', 'INFO');
            const submenuTriggers = Array.from(menuItems).filter(item => {
                const text = item.textContent?.trim();
                return text && (text.includes('レガシー') || text.includes('legacy') || 
                               text.includes('他の') || text.includes('その他'));
            });
            
            for (const trigger of submenuTriggers) {
                const triggerText = trigger.textContent?.trim();
                log(`サブメニュー「${triggerText}」を開きます`, 'INFO');
                
                await clickElement(trigger);
                await wait(500);
                
                // サブメニュー内のアイテムを取得
                const submenuItems = document.querySelectorAll('[role="menuitem"], [role="menuitemradio"]');
                
                for (const item of submenuItems) {
                    const text = item.textContent?.trim();
                    if (text && (text === modelName || text.includes(modelName) || 
                                (modelName === 'GPT-4o' && text.includes('4o')))) {
                        log(`サブメニューでモデル「${text}」を発見`, 'INFO');
                        
                        await clickElement(item);
                        await wait(500);
                        
                        const menuClosed = await checkMenuClosed();
                        if (menuClosed) {
                            const message = `✅ サブメニューからモデル「${modelName}」を選択成功`;
                            log(message, 'SUCCESS');
                            currentState.selectedModel = modelName;
                            endOperation(operationName, { 
                                success: true, 
                                selectedModel: modelName,
                                location: 'submenu'
                            });
                            return true;
                        }
                    }
                }
            }
            
            // どこにも見つからない場合
            const error = `モデル「${modelName}」が見つかりません`;
            log(error, 'ERROR');
            
            // メニューを閉じる
            document.body.dispatchEvent(new KeyboardEvent('keydown', { 
                key: 'Escape', 
                bubbles: true 
            }));
            await wait(500);
            
            endOperation(operationName, { success: false, error });
            return false;
            
        } catch (error) {
            logError(error, { 
                operation: 'selectModel',
                modelName
            });
            endOperation(operationName, { success: false, error: error.message });
            return false;
        }
    }

    // ストレージ保存機能
    async function saveToStorage(data) {
        try {
            if (chrome?.storage?.local) {
                // 既存の設定を取得
                const result = await new Promise((resolve) => {
                    chrome.storage.local.get(['ai_config_persistence'], (result) => {
                        resolve(result.ai_config_persistence || {});
                    });
                });
                
                // ChatGPTの設定を更新
                result.chatgpt = data;
                
                // ストレージに保存
                await new Promise((resolve) => {
                    chrome.storage.local.set({ ai_config_persistence: result }, resolve);
                });
                
                log('💾 設定をストレージに保存しました', 'success');
            }
        } catch (error) {
            debugLog(`ストレージ保存エラー: ${error.message}`);
        }
    }

    // 利用可能なモデルを取得する関数（selectModelと同じロジックを使用）
    async function getAvailableModels() {
        // 既に実行中の場合はスキップ
        if (isCheckingModels) {
            debugLog('モデル取得は既に実行中です');
            return [];
        }
        
        log('📋 利用可能なモデルを取得中...', 'info');
        isCheckingModels = true; // 実行開始
        
        try {
            // 既存のメニューを閉じる処理をスキップ（誤クリック防止）
            await wait(300); // 少し待機
            
            // selectModelと同じ複数セレクタでモデルボタンを探す
            const modelButtonSelectors = [
                '[data-testid="model-switcher-dropdown-button"]',
                'button[aria-label*="モデル セレクター"]',
                'button[aria-label*="モデル"]',
                'button[aria-label*="Model"]',
                'button[id^="radix-"][aria-haspopup="menu"]',
                // 特定のテキストを含むボタンを探す
                'button:has(> div > div:first-child)',
                'button[aria-haspopup="menu"][aria-expanded]',
                'button[aria-haspopup="menu"]'
            ];
            
            let modelButton = null;
            for (const selector of modelButtonSelectors) {
                try {
                    const elements = document.querySelectorAll(selector);
                    for (const element of elements) {
                        if (element && element.offsetParent !== null) {
                            modelButton = element;
                            debugLog(`モデルボタン発見: ${selector}`);
                            break;
                        }
                    }
                    if (modelButton) break;
                } catch (e) {
                    debugLog(`セレクタエラー: ${selector}`);
                }
            }
            
            if (!modelButton) {
                log('❌ モデル選択ボタンが見つかりません', 'error');
                return [];
            }
            
            debugLog(`モデルボタン確定: ${modelButton.getAttribute('aria-label') || modelButton.textContent?.trim()}`);
            
            // メニューを開く
            await performClick(modelButton);
            const menu = await waitForMenu();
            
            if (!menu) {
                log('❌ モデルメニューが開きませんでした', 'error');
                return [];
            }
            
            // メニューの内容を詳細に確認
            const menuItems = menu.querySelectorAll('[role="menuitem"]');
            const menuLabels = menu.querySelectorAll('.__menu-label, div:not([role])');
            const menuContent = menu.textContent || '';
            
            debugLog(`メニュー項目数: ${menuItems.length}`);
            debugLog(`メニュー内容の一部: ${menuContent.substring(0, 100)}`);
            
            // モデルメニューの特徴をチェック（機能メニューを除外）
            const hasModelIndicators = 
                // GPT-5ラベルがあるか
                Array.from(menuLabels).some(label => label.textContent?.includes('GPT-5')) ||
                // モデル関連のtest-idがあるか
                Array.from(menuItems).some(item => {
                    const testId = item.getAttribute('data-testid') || '';
                    return testId.includes('model-switcher') || testId.includes('gpt-5');
                }) ||
                // モデル特有のテキストパターン
                menuContent.includes('思考時間') || menuContent.includes('即時の応答') || 
                menuContent.includes('深く思考') || menuContent.includes('研究レベル');
            
            // 機能メニューの特徴（これがあったらモデルメニューではない）
            const hasFunctionIndicators = 
                menuContent.includes('写真とファイルを追加') ||
                menuContent.includes('エージェントモード') ||
                menuContent.includes('Deep Research') ||
                menuContent.includes('画像を作成する') ||
                menuContent.includes('コネクターを使用する');
            
            const isModelMenu = hasModelIndicators && !hasFunctionIndicators;
            
            if (!isModelMenu) {
                debugLog('警告: これはモデルメニューではありません（機能メニューの可能性）');
                await closeMenu();
                return [];
            }
            
            debugLog('✅ モデルメニューと確認されました');
            
            debugLog(`利用可能なモデル項目数: ${menuItems.length}`);
            
            // モデル一覧を取得
            const models = [];
            const allModels = [];
            
            // 全てのモデルを収集（複数の条件で確実に検出）
            for (const item of menuItems) {
                const textContent = item.textContent?.trim() || '';
                const testId = item.getAttribute('data-testid') || '';
                const role = item.getAttribute('role');
                const hasSubmenu = item.hasAttribute('data-has-submenu');
                const ariaLabel = item.getAttribute('aria-label') || '';
                const isSelected = item.querySelector('svg path[d*="12.0961"]') !== null;
                
                // サブメニュートリガーは除外
                if (hasSubmenu) continue;
                
                // 複数の条件でモデルを判定
                const isModelItem = 
                    // testIdベースの判定
                    (testId.includes('model-switcher') || testId.includes('gpt-5')) ||
                    // テキストベースの判定（GPT-5のモード）
                    (textContent && (
                        textContent.includes('Auto') && textContent.includes('思考時間') ||
                        textContent.includes('Fast') && textContent.includes('即時') ||
                        textContent.includes('Thinking') && textContent.includes('深く思考') ||
                        textContent.includes('Pro') && textContent.includes('研究レベル')
                    )) ||
                    // シンプルなモデル名判定
                    (textContent && /^(Auto|Fast|Thinking|Pro)$/.test(textContent.split('\n')[0]));
                
                if (textContent && isModelItem) {
                    // モデル名を整理（最初の単語のみ取得）
                    let modelName = '';
                    
                    // testIdから判定する方が確実
                    if (testId === 'model-switcher-gpt-5') {
                        modelName = 'GPT-5 Auto';
                    } else if (testId === 'model-switcher-gpt-5-instant') {
                        modelName = 'GPT-5 Fast';
                    } else if (testId === 'model-switcher-gpt-5-thinking') {
                        modelName = 'GPT-5 Thinking';
                    } else if (testId === 'model-switcher-gpt-5-pro') {
                        modelName = 'GPT-5 Pro';
                    } else {
                        // フォールバック：最初の単語を取得
                        const firstWord = textContent.match(/^(\w+)/)?.[1] || textContent;
                        modelName = ['Auto', 'Fast', 'Thinking', 'Pro'].includes(firstWord) 
                            ? `GPT-5 ${firstWord}` 
                            : textContent.split('\n')[0].trim();
                    }
                    
                    allModels.push({ text: modelName, testId: testId });
                    models.push({
                        name: modelName,
                        testId: testId,
                        selected: isSelected,
                        location: 'main'
                    });
                    debugLog(`発見モデル(メイン): "${modelName}" (testId: ${testId}, selected: ${isSelected})`);
                }
            }
            
            // サブメニューを持つ全ての要素を探索（汎用的なアプローチ）
            const submenuTriggers = Array.from(menuItems).filter(item => {
                const hasSubmenu = item.hasAttribute('data-has-submenu');
                const hasAriaHaspopup = item.getAttribute('aria-haspopup') === 'menu';
                const hasAriaExpanded = item.hasAttribute('aria-expanded');
                
                // サブメニューを持つ要素を検出
                return hasSubmenu || hasAriaHaspopup || hasAriaExpanded;
            });
            
            debugLog(`サブメニュートリガー発見: ${submenuTriggers.length}個`);
            
            // 各サブメニューを順番に処理（リトライ機能付き）
            for (const trigger of submenuTriggers) {
                const triggerText = trigger.textContent?.trim() || 'Unknown';
                const triggerTestId = trigger.getAttribute('data-testid') || 'no-testid';
                const triggerAttributes = {
                    'data-has-submenu': trigger.hasAttribute('data-has-submenu'),
                    'aria-haspopup': trigger.getAttribute('aria-haspopup'),
                    'aria-expanded': trigger.getAttribute('aria-expanded'),
                    'data-testid': triggerTestId
                };
                
                log(`📂 サブメニューを開きます: ${triggerText}`, 'info');
                debugLog(`サブメニュートリガー詳細: "${triggerText}"`, triggerAttributes);
                
                let submenu = null;
                let retryCount = 0;
                const maxRetries = 2;
                
                // リトライ機能付きでサブメニューを開く
                while (retryCount <= maxRetries && !submenu) {
                    if (retryCount > 0) {
                        debugLog(`サブメニュー開放リトライ ${retryCount}回目: ${triggerText}`);
                        await wait(500); // リトライ前に少し待機
                    }
                    
                    submenu = await openSubmenu(trigger);
                    retryCount++;
                }
                
                if (submenu) {
                    debugLog(`✅ サブメニュー開放成功: ${triggerText} (試行回数: ${retryCount})`);
                    
                    // サブメニューの詳細情報をログ
                    const submenuInfo = {
                        className: submenu.className,
                        tagName: submenu.tagName,
                        id: submenu.id,
                        role: submenu.getAttribute('role')
                    };
                    debugLog(`サブメニュー詳細:`, submenuInfo);
                    
                    const submenuItems = submenu.querySelectorAll('[role="menuitem"], [role="menuitemradio"]');
                    debugLog(`サブメニュー項目数: ${submenuItems.length}`);
                    
                    // サブメニュー内の全項目をログに出力（デバッグ用）
                    submenuItems.forEach((item, index) => {
                        const itemText = item.textContent?.trim();
                        const itemTestId = item.getAttribute('data-testid');
                        debugLog(`  サブメニュー項目[${index}]: "${itemText}" (testId: ${itemTestId})`);
                    });
                    
                    let itemsAdded = 0;
                    for (const item of submenuItems) {
                        const textContent = item.textContent?.trim();
                        const testId = item.getAttribute('data-testid');
                        const isSelected = item.querySelector('svg path[d*="12.0961"]') !== null;
                        
                        // サブメニュー内の全ての項目を追加（トリガー自体は除外）
                        if (textContent && textContent !== triggerText) {
                            // サブメニューの場所を記録（例: "submenu-レガシーモデル"）
                            const locationName = `submenu-${triggerText.replace(/\s+/g, '-').toLowerCase()}`;
                            
                            models.push({
                                name: textContent,
                                testId: testId,
                                selected: isSelected,
                                location: locationName
                            });
                            debugLog(`✅ 発見モデル(${locationName}): "${textContent}" (testId: ${testId}, selected: ${isSelected})`);
                            itemsAdded++;
                        }
                    }
                    
                    log(`📝 サブメニュー"${triggerText}"から${itemsAdded}個のモデルを取得`, 'success');
                    
                    // サブメニューを閉じる処理をスキップ（誤クリック防止）
                    await wait(200);
                } else {
                    log(`❌ サブメニューが開けませんでした: ${triggerText} (${maxRetries + 1}回試行)`, 'error');
                    debugLog(`失敗したサブメニューの属性:`, triggerAttributes);
                    
                    // レガシーモデル専用のフォールバック処理
                    if (triggerText.includes('レガシー') || triggerText.toLowerCase().includes('legacy')) {
                        debugLog('レガシーモデル専用フォールバック処理を実行');
                        
                        // 既知のレガシーモデルを追加
                        const fallbackLegacyModels = [
                            { name: 'GPT-4o', testId: 'model-switcher-gpt-4o' },
                            { name: 'GPT-4', testId: 'model-switcher-gpt-4' },
                            { name: 'GPT-3.5', testId: 'model-switcher-gpt-3.5' }
                        ];
                        
                        let fallbackAdded = 0;
                        fallbackLegacyModels.forEach(model => {
                            models.push({
                                name: model.name,
                                testId: model.testId,
                                selected: false,
                                location: 'submenu-legacy-fallback'
                            });
                            debugLog(`📋 フォールバック追加: "${model.name}" (testId: ${model.testId})`);
                            fallbackAdded++;
                        });
                        
                        log(`📋 レガシーモデルフォールバック: ${fallbackAdded}個のモデルを追加`, 'warning');
                    }
                }
            }
            
            if (submenuTriggers.length === 0) {
                debugLog('サブメニュートリガーが見つかりませんでした');
            }
            
            // メニューを閉じる
            await closeMenu();
            
            // 結果をログに出力
            if (models.length > 0) {
                log(`✅ ${models.length}個のモデルを発見`, 'success');
                models.forEach(model => {
                    const status = model.selected ? ' [選択中]' : '';
                    const location = model.location === 'submenu' ? ' (サブメニュー)' : '';
                    log(`  • ${model.name}${status}${location}`, 'info');
                });
            } else {
                log('⚠️ モデルが見つかりませんでした', 'warning');
            }
            
            return models;
            
        } catch (error) {
            log(`モデル取得エラー: ${error.message}`, 'error');
            // エラー時はメニューを確実に閉じる
            try {
                await closeMenu();
            } catch (e) {
                // 無視
            }
            return [];
        } finally {
            isCheckingModels = false; // 実行完了
        }
    }

    // ============================================
    // 機能選択関数（共通ハンドラー使用）
    // ============================================
    async function selectFunction(functionName) {
        // 機能を無効化する場合
        if (functionName === 'none' || !functionName || functionName === 'なし（通常モード）' || functionName.includes('なし')) {
            log('🔄 機能無効化処理をスキップ（誤クリック防止）', 'info');
            log(`✅ 機能設定を「${functionName || 'なし'}」に設定しました`, 'success');
            
            // メニューを閉じる
            await closeMenu();
            return true;
        }
        
        // FUNCTION_MAPPINGで変換
        const mappedFunction = FUNCTION_MAPPING[functionName] || functionName;
        
        // シンプルな直接クリック処理
        log(`🎯 機能「${mappedFunction}」を選択中...`, 'info');
        
        // 既存のメニューが開いている場合は閉じる
        debugLog('既存のメニューをチェック中...');
        const existingMenu = document.querySelector('[role="menu"][data-state="open"], [data-radix-popper-content-wrapper]');
        if (existingMenu) {
            debugLog('既存のメニューを閉じます');
            document.body.click();
            await wait(500);
        }
        
        // 機能ボタンをクリック
        const button = document.querySelector('[data-testid="composer-plus-btn"]');
        if (!button) {
            log('機能ボタンが見つかりません', 'error');
            return false;
        }
        
        debugLog('機能ボタンをクリックします');
        
        // 複数の方法でクリックを試す
        const clickMethods = [
            () => button.click(),
            () => button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })),
            () => {
                button.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
                button.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
                button.dispatchEvent(new PointerEvent('click', { bubbles: true }));
            }
        ];
        
        for (const method of clickMethods) {
            method();
            await wait(100);
        }
        
        await wait(1500);  // メニューが開くまで少し長めに待つ
        
        // メニューが開いたか確認
        const menu = await waitForMenu();
        if (!menu) {
            log('機能メニューが開きませんでした', 'error');
            return false;
        }
        
        // 全ての要素を収集して探す関数
        const findAndClickFunction = async () => {
            // 現在表示されている全てのメニュー項目を取得
            const allItems = document.querySelectorAll('[role="menuitemradio"], [role="menuitem"], [role="option"]');
            debugLog(`メニュー項目数: ${allItems.length}`);
            
            // 各項目をログに出力（デバッグ用）
            allItems.forEach((item, index) => {
                const text = item.textContent?.trim();
                if (text) {
                    debugLog(`  [${index}] "${text}" (role=${item.getAttribute('role')})`);
                }
            });
            
            // 目的の機能を探す
            for (const item of allItems) {
                const itemText = item.textContent?.trim();
                // バッジ付きの場合も考慮（例：「エージェントモード新規」）
                if (itemText === mappedFunction || itemText?.startsWith(mappedFunction)) {
                    debugLog(`機能「${mappedFunction}」発見！クリックします（実際のテキスト: "${itemText}"）`);
                    
                    // 直接クリック（サイズチェックなし）
                    item.click();
                    
                    // 選択結果を確認
                    await wait(500);
                    const checked = item.getAttribute('aria-checked');
                    if (checked === 'true') {
                        log(`✅ 機能「${mappedFunction}」を選択しました`, 'success');
                    } else {
                        log(`✅ 機能「${mappedFunction}」をクリックしました`, 'success');
                    }
                    
                    currentState.activeFunctions.add(mappedFunction);
                    return true;
                }
            }
            return false;
        };
        
        // まずメインメニューで探す
        debugLog('メインメニューで機能を探しています...');
        if (await findAndClickFunction()) {
            return true;
        }
        
        // メインメニューで見つからない場合、「さらに表示」を探して展開
        debugLog('メインメニューで見つからないため、「さらに表示」を探します');
        const showMoreItems = document.querySelectorAll('[role="menuitemradio"], [role="menuitem"], [role="option"]');
        
        for (const item of showMoreItems) {
            const text = item.textContent?.trim();
            if (text === 'さらに表示' || text === 'Show more') {
                debugLog('「さらに表示」を発見、クリックして展開します');
                item.click();
                
                // サブメニューが展開されるのを待つ
                await wait(1000);
                
                // サブメニューで再度探す
                debugLog('サブメニューで機能を探しています...');
                if (await findAndClickFunction()) {
                    return true;
                }
                
                break; // 「さらに表示」は1つだけのはず
            }
        }
        
        log(`機能「${mappedFunction}」が見つかりません`, 'error');
        
        // デバッグ情報を出力
        debugLog('=== 最終的なメニュー状態 ===');
        const finalItems = document.querySelectorAll('[role="menuitemradio"], [role="menuitem"], [role="option"]');
        finalItems.forEach((item, index) => {
            const text = item.textContent?.trim();
            if (text) {
                debugLog(`  [${index}] "${text}"`);
            }
        });
        
        return false;
    }

    // 利用可能な機能を取得する関数（selectFunctionと同じロジックを使用）
    async function getAvailableFunctions() {
        // 既に実行中の場合はスキップ
        if (isCheckingFunctions) {
            debugLog('機能取得は既に実行中です');
            return [];
        }
        
        log('📋 利用可能な機能を取得中...', 'info');
        isCheckingFunctions = true; // 実行開始
        
        try {
            // 既存のメニューを閉じる処理をスキップ（誤クリック防止）
            await wait(300); // 少し待機
            
            // selectFunctionと同じ複数セレクタで機能ボタンを探す
            const functionButtonSelectors = [
                '[data-testid="composer-plus-btn"]',
                'button.composer-btn',
                'button[aria-label*="機能"]',
                'button[aria-label*="プラス"]',
                'button[aria-label*="追加"]',
                // 追加のセレクタ（より柔軟に対応）
                'button svg path[d*="M9.33496"]', // +アイコンのパスを含むボタン
                'div.absolute.start-2\\.5 button', // 位置指定のボタン
                'button:has(svg[width="20"][height="20"])', // 20x20のSVGを含むボタン
            ];

            let functionButton = null;
            for (const selector of functionButtonSelectors) {
                try {
                    if (selector.includes('path[d*=')) {
                        // SVGパスの場合は親のボタンを探す
                        const svgElements = document.querySelectorAll(selector);
                        for (const svgElement of svgElements) {
                            const button = svgElement.closest('button');
                            if (button && button.offsetParent !== null) {
                                functionButton = button;
                                debugLog(`機能選択ボタン発見(SVG経由): ${selector}`);
                                break;
                            }
                        }
                    } else {
                        const elements = document.querySelectorAll(selector);
                        for (const element of elements) {
                            if (element && element.offsetParent !== null) {
                                // ボタン要素であることを確認
                                const button = element.tagName === 'BUTTON' ? element : element.closest('button');
                                if (button) {
                                    functionButton = button;
                                    debugLog(`機能選択ボタン発見: ${selector}`);
                                    break;
                                }
                            }
                        }
                    }
                    if (functionButton) break;
                } catch (e) {
                    debugLog(`セレクタエラー: ${selector}`);
                }
            }

            if (!functionButton) {
                log('❌ 機能選択ボタンが見つかりません', 'error');
                return [];
            }
            
            debugLog(`機能選択ボタン発見: data-testid="composer-plus-btn"`);
            
            // メニューを開く
            await performClick(functionButton);
            const menu = await waitForMenu();
            
            if (!menu) {
                log('❌ 機能メニューが開きませんでした', 'error');
                return [];
            }
            
            // 機能メニューかどうか確認（より正確な判定）
            const menuItems = menu.querySelectorAll('[role="menuitem"], [role="menuitemradio"]');
            
            // モデル名のパターン
            const modelPatterns = [
                'model-switcher',
                'gpt-5',
                'GPT-4',
                'Auto思考',
                'Fast即時',
                'Thinking時間',
                'Pro研究',
                'レガシーモデル'
            ];
            
            // 機能名のパターン
            const functionPatterns = [
                '一時的なチャット',
                'Temporary chat',
                'Canvas',
                'キャンバス',
                'Memory',
                'メモリー',
                'さらに表示',
                'Show more'
            ];
            
            let isModelMenu = false;
            let isFunctionMenu = false;
            
            // メニュー内容をチェック
            Array.from(menuItems).forEach(item => {
                const testId = item.getAttribute('data-testid') || '';
                const text = item.textContent?.trim() || '';
                
                // モデルメニューの特徴をチェック
                if (modelPatterns.some(pattern => testId.includes(pattern) || text.includes(pattern))) {
                    isModelMenu = true;
                }
                
                // 機能メニューの特徴をチェック
                if (functionPatterns.some(pattern => text.includes(pattern))) {
                    isFunctionMenu = true;
                }
            });
            
            // モデルメニューと判定された場合は中断
            if (isModelMenu && !isFunctionMenu) {
                debugLog('警告: これはモデルメニューです、機能メニューではありません');
                // メニューは閉じずに空の配列を返す（他の処理に影響を与えないため）
                return [];
            }
            
            debugLog(`メインメニュー項目数: ${menuItems.length}`);
            
            // 機能一覧を取得
            const functions = [];
            const allFunctions = [];
            
            // メインメニューの機能を収集（サブメニュートリガーは除外）
            for (const item of menuItems) {
                const textContent = item.textContent?.trim();
                const hasSubmenu = item.hasAttribute('data-has-submenu');
                const hasAriaHaspopup = item.getAttribute('aria-haspopup') === 'menu';
                
                // サブメニュートリガーは後で処理するので除外
                if (hasSubmenu || hasAriaHaspopup) continue;
                
                // モデル名らしきものを除外
                if (textContent && 
                    !textContent.includes('考える時間') && 
                    !textContent.includes('即時応答') && 
                    !textContent.includes('じっくり思考') &&
                    !textContent.includes('研究レベル') &&
                    !textContent.includes('従来モデル')) {
                    
                    allFunctions.push({ text: textContent, location: 'main', element: item });
                    debugLog(`発見機能(メイン): "${textContent}"`);
                    
                    // 機能として追加
                    functions.push({
                        name: textContent,
                        location: 'main',
                        type: item.getAttribute('role') === 'menuitemradio' ? 'radio' : 'normal',
                        active: item.getAttribute('aria-checked') === 'true'
                    });
                }
            }
            
            // サブメニューを持つ全ての要素を探索（汎用的なアプローチ）
            const submenuTriggers = Array.from(menuItems).filter(item => {
                const hasSubmenu = item.hasAttribute('data-has-submenu');
                const hasAriaHaspopup = item.getAttribute('aria-haspopup') === 'menu';
                const hasAriaExpanded = item.hasAttribute('aria-expanded');
                
                // サブメニューを持つ要素を検出
                return hasSubmenu || hasAriaHaspopup || hasAriaExpanded;
            });
            
            debugLog(`サブメニュートリガー発見: ${submenuTriggers.length}個`);
            
            // 各サブメニューを順番に処理（機能版 - モデル版と同様のリトライ機能）
            for (const trigger of submenuTriggers) {
                const triggerText = trigger.textContent?.trim() || 'Unknown';
                const triggerTestId = trigger.getAttribute('data-testid') || 'no-testid';
                const triggerAttributes = {
                    'data-has-submenu': trigger.hasAttribute('data-has-submenu'),
                    'aria-haspopup': trigger.getAttribute('aria-haspopup'),
                    'aria-expanded': trigger.getAttribute('aria-expanded'),
                    'data-testid': triggerTestId
                };
                
                log(`📂 機能サブメニューを開きます: ${triggerText}`, 'info');
                debugLog(`機能サブメニュートリガー詳細: "${triggerText}"`, triggerAttributes);
                
                let submenu = null;
                let retryCount = 0;
                const maxRetries = 2;
                
                // リトライ機能付きでサブメニューを開く
                while (retryCount <= maxRetries && !submenu) {
                    if (retryCount > 0) {
                        debugLog(`機能サブメニュー開放リトライ ${retryCount}回目: ${triggerText}`);
                        await wait(500); // リトライ前に少し待機
                    }
                    
                    submenu = await openSubmenu(trigger);
                    retryCount++;
                }
                
                if (submenu) {
                    debugLog(`✅ 機能サブメニュー開放成功: ${triggerText} (試行回数: ${retryCount})`);
                    
                    // サブメニューの詳細情報をログ
                    const submenuInfo = {
                        className: submenu.className,
                        tagName: submenu.tagName,
                        id: submenu.id,
                        role: submenu.getAttribute('role')
                    };
                    debugLog(`機能サブメニュー詳細:`, submenuInfo);
                    
                    const submenuItems = submenu.querySelectorAll('[role="menuitem"], [role="menuitemradio"]');
                    debugLog(`機能サブメニュー項目数: ${submenuItems.length}`);
                    
                    // サブメニュー内の全項目をログに出力（デバッグ用）
                    submenuItems.forEach((item, index) => {
                        const itemText = item.textContent?.trim();
                        const itemTestId = item.getAttribute('data-testid');
                        debugLog(`  機能サブメニュー項目[${index}]: "${itemText}" (testId: ${itemTestId})`);
                    });
                    
                    let itemsAdded = 0;
                    for (const item of submenuItems) {
                        const textContent = item.textContent?.trim();
                        // トリガー自体は除外
                        if (textContent && textContent !== triggerText) {
                            // サブメニューの場所を記録（例: "submenu-さらに表示"）
                            const locationName = `submenu-${triggerText.replace(/\s+/g, '-').toLowerCase()}`;
                            
                            allFunctions.push({ text: textContent, location: locationName, element: item });
                            debugLog(`✅ 発見機能(${locationName}): "${textContent}"`);
                            
                            functions.push({
                                name: textContent,
                                location: locationName,
                                type: item.getAttribute('role') === 'menuitemradio' ? 'radio' : 'normal',
                                active: item.getAttribute('aria-checked') === 'true'
                            });
                            itemsAdded++;
                        }
                    }
                    
                    log(`📝 機能サブメニュー"${triggerText}"から${itemsAdded}個の機能を取得`, 'success');
                    
                    // サブメニューを閉じる処理をスキップ（誤クリック防止）
                    await wait(200);
                } else {
                    log(`❌ 機能サブメニューが開けませんでした: ${triggerText} (${maxRetries + 1}回試行)`, 'error');
                    debugLog(`失敗した機能サブメニューの属性:`, triggerAttributes);
                    
                    // 「さらに表示」専用のフォールバック処理
                    if (triggerText === 'さらに表示' || triggerText.toLowerCase() === 'show more') {
                        debugLog('「さらに表示」専用フォールバック処理を実行');
                        
                        // 既知の「さらに表示」機能を追加
                        const fallbackFunctions = [
                            'あらゆる学びをサポート',
                            'ウェブ検索', 
                            'canvas',
                            'OneDrive を接続する',
                            'Sharepoint を接続する',
                            'コネクターを使用する'
                        ];
                        
                        let fallbackAdded = 0;
                        fallbackFunctions.forEach(funcName => {
                            functions.push({
                                name: funcName,
                                location: 'submenu-show-more-fallback',
                                type: 'normal',
                                active: false
                            });
                            debugLog(`📋 フォールバック追加: "${funcName}"`);
                            fallbackAdded++;
                        });
                        
                        log(`📋 「さらに表示」フォールバック: ${fallbackAdded}個の機能を追加`, 'warning');
                    }
                }
            }
            
            if (submenuTriggers.length === 0) {
                debugLog('サブメニュートリガーが見つかりませんでした');
            }
            
            // メニューを閉じる
            await closeMenu();
            
            // 結果をログに出力
            if (functions.length > 0) {
                log(`✅ ${functions.length}個の機能を発見`, 'success');
                functions.forEach(func => {
                    const status = func.active ? ' [有効]' : '';
                    const location = func.location === 'submenu' ? ' (サブメニュー)' : '';
                    log(`  • ${func.name} (${func.type})${status}${location}`, 'info');
                });
            } else {
                log('⚠️ 機能が見つかりませんでした', 'warning');
            }
            
            return functions;
            
        } catch (error) {
            log(`機能取得エラー: ${error.message}`, 'error');
            // エラー時はメニューを確実に閉じる
            try {
                await closeMenu();
            } catch (e) {
                // 無視
            }
            return [];
        } finally {
            isCheckingFunctions = false; // 実行完了
        }
    }

    // ============================================
    // テキスト処理関数
    // ============================================
    async function inputText(text) {
        if (!text) {
            log('入力するテキストがありません', 'error');
            return false;
        }
        
        log('テキストを入力します...', 'info');
        
        try {
            const selectors = [
                '#prompt-textarea',
                '[contenteditable="true"]',
                '.ProseMirror',
                'div[contenteditable="true"]',
                'textarea[data-testid="conversation-textarea"]',
                'textarea[placeholder*="メッセージ"]',
                'textarea'
            ];
            
            let textInput = null;
            for (const selector of selectors) {
                try {
                    const elements = document.querySelectorAll(selector);
                    for (const element of elements) {
                        if (element && element.offsetParent !== null) {
                            textInput = element;
                            debugLog(`入力欄発見: ${selector}`);
                            break;
                        }
                    }
                    if (textInput) break;
                } catch (e) {
                    // エラーは無視
                }
            }
            
            if (!textInput) {
                log('入力欄が見つかりません', 'error');
                return false;
            }
            
            textInput.focus();
            await wait(CONFIG.delays.textInput);
            
            if (textInput.contentEditable === 'true') {
                textInput.textContent = text;
                textInput.dispatchEvent(new Event('input', { bubbles: true }));
                debugLog('contentEditableへの入力完了');
            } 
            else if (textInput.tagName === 'TEXTAREA' || textInput.tagName === 'INPUT') {
                textInput.value = text;
                textInput.dispatchEvent(new Event('input', { bubbles: true }));
                debugLog('TEXTAREA/INPUTへの入力完了');
            }
            else {
                if (textInput.classList.contains('ProseMirror')) {
                    textInput.innerHTML = `<p>${text}</p>`;
                    textInput.dispatchEvent(new Event('input', { bubbles: true }));
                } else {
                    textInput.textContent = text;
                    textInput.dispatchEvent(new Event('input', { bubbles: true }));
                }
            }
            
            await wait(CONFIG.delays.textInput);
            log(`${text.length} 文字を入力しました`, 'success');
            return true;
            
        } catch (error) {
            log(`テキスト入力エラー: ${error.message}`, 'error');
            return false;
        }
    }

    async function sendMessage() {
        log('テキストを送信します...', 'info');
        
        try {
            const sendButtonSelectors = window.AIHandler?.getSelectors?.('ChatGPT', 'SEND_BUTTON');
            
            if (!sendButtonSelectors || sendButtonSelectors.length === 0) {
                log('送信ボタンセレクタが取得できません', 'error');
                return false;
            }
            
            let sendButton = null;
            
            for (const selector of sendButtonSelectors) {
                try {
                    const elements = document.querySelectorAll(selector);
                    for (const element of elements) {
                        if (element && element.offsetParent !== null && !element.disabled) {
                            sendButton = element;
                            debugLog(`送信ボタン発見: ${selector}`);
                            break;
                        }
                    }
                    if (sendButton) break;
                } catch (e) {
                    // エラーは無視
                }
            }
            
            if (!sendButton) {
                log('送信ボタンが見つかりません', 'error');
                return false;
            }
            
            if (sendButton.disabled) {
                log('送信ボタンが無効です', 'warning');
                return false;
            }
            
            await performClick(sendButton);
            currentState.sendStartTime = Date.now();  // 送信時刻を記録
            await wait(1000);
            
            log('📤 テキストを送信しました', 'success');
            
            // 送信時刻を記録（SpreadsheetLogger用）
            log(`🔍 送信時刻記録開始 - AIHandler: ${!!window.AIHandler}, recordSendTimestamp: ${!!window.AIHandler?.recordSendTimestamp}, currentAITaskInfo: ${!!window.currentAITaskInfo}`, 'info');
            if (window.AIHandler && window.AIHandler.recordSendTimestamp) {
                try {
                    log(`📝 送信時刻記録実行開始 - タスクID: ${window.currentAITaskInfo?.taskId}`, 'info');
                    await window.AIHandler.recordSendTimestamp('ChatGPT');
                    log(`✅ 送信時刻記録成功`, 'success');
                } catch (error) {
                    log(`❌ 送信時刻記録エラー: ${error.message}`, 'error');
                    log(`エラー詳細: ${JSON.stringify({ stack: error.stack, name: error.name })}`, 'error');
                }
            } else {
                log(`⚠️ 送信時刻記録スキップ - AIHandler利用不可`, 'warning');
            }
            
            return true;
            
        } catch (error) {
            log(`送信エラー: ${error.message}`, 'error');
            return false;
        }
    }

    async function waitForResponse(timeout = 60000) {
        // 停止ボタンのセレクタログフラグをリセット
        currentState.stopButtonSelectorLogged = false;
        
        // 共通関数を使用
        return await window.AIHandler?.message?.waitForResponse?.(null, {
            timeout: timeout,
            sendStartTime: currentState.sendStartTime
        }, 'ChatGPT');
    }

    async function getResponse() {
        log('回答を取得中...', 'info');
        
        try {
            // メッセージ取得
            const selectors = [
                '[data-message-author-role="assistant"]',
                '.text-message[data-message-author-role="assistant"]',
                'div[data-message-author-role="assistant"]'
            ];
            
            let messages = [];
            for (const selector of selectors) {
                messages = document.querySelectorAll(selector);
                if (messages.length > 0) {
                    debugLog(`メッセージ発見: ${selector} (${messages.length}件)`);
                    break;
                }
            }
            
            if (messages.length === 0) {
                log('回答が見つかりません - 空の回答として処理を継続', 'warning');
                return '';  // 空文字列を返して処理を継続
            }
            
            const lastMessage = messages[messages.length - 1];
            
            // テキスト抽出
            const methods = [
                () => {
                    const markdown = lastMessage.querySelector('.markdown');
                    return markdown ? markdown.textContent?.trim() : '';
                },
                () => lastMessage.textContent?.trim() || '',
                () => lastMessage.innerText?.trim() || ''
            ];
            
            for (const method of methods) {
                try {
                    const text = method();
                    if (text && text.length > 0) {
                        log('回答取得完了', 'success');
                        return text;
                    }
                } catch (e) {
                    // エラーは無視
                }
            }
            
            log('回答テキストを抽出できませんでした - 空の回答として処理を継続', 'warning');
            return '';  // 空文字列を返して処理を継続
            
        } catch (error) {
            log(`回答取得エラー: ${error.message}`, 'error');
            return null;
        }
    }

    // DeepResearch専用の待機・応答関数
    const waitForDeepResearchResponse = async (maxWaitMinutes = 60) => {
        // DeepResearchハンドラーが利用可能か確認
        log('DeepResearchハンドラーの確認中...', 'info');
        console.log('window.DeepResearchHandler:', window.DeepResearchHandler);
        
        if (window.DeepResearchHandler) {
            log('DeepResearchハンドラーを使用します', 'info');
            try {
                const result = await window.DeepResearchHandler.handle('ChatGPT', maxWaitMinutes);
                log(`DeepResearchハンドラー結果: ${result}`, 'info');
                return result;
            } catch (error) {
                log(`DeepResearchハンドラーエラー: ${error.message}`, 'error');
                log('フォールバック実装を使用します', 'warning');
            }
        } else {
            log('DeepResearchハンドラーが見つかりません。フォールバック実装を使用します', 'warning');
        }
        
        // フォールバック：完全な実装（Claudeと同様）
        log('DeepResearch応答を待機中（レガシーモード）...', 'warning');
        const startTime = Date.now();
        
        // 初期メッセージ数を取得
        const responseSelectors = window.AIHandler?.getSelectors?.('ChatGPT', 'RESPONSE') || ['[data-message-author-role="assistant"]'];
        let initialMessages = [];
        for (const selector of responseSelectors) {
            initialMessages.push(...document.querySelectorAll(selector));
        }
        let lastMessageCount = initialMessages.length;
        let hasQuestionReceived = false;
        
        // 最初の5分間、質問を監視
        log('最初の5分間、質問を監視中...', 'info');
        const fiveMinutes = 5 * 60 * 1000;
        
        while (Date.now() - startTime < fiveMinutes) {
            try {
                // 現在のメッセージ数をチェック
                let currentMessages = [];
                for (const selector of responseSelectors) {
                    currentMessages.push(...document.querySelectorAll(selector));
                }
                const currentMessageCount = currentMessages.length;
                
                // 停止ボタンの状態をチェック
                const stopButtonSelectors = window.AIHandler?.getSelectors?.('ChatGPT', 'STOP_BUTTON') || ['[aria-label="Stop generating"]'];
                let stopButton = null;
                for (const selector of stopButtonSelectors) {
                    stopButton = document.querySelector(selector);
                    if (stopButton) break;
                }
                
                // 新しいメッセージが追加され、かつ停止ボタンが消えた場合
                if (currentMessageCount > lastMessageCount && !stopButton && !hasQuestionReceived) {
                    log('ChatGPTから質問を受信しました（停止ボタン消滅後・5分以内）', 'info');
                    hasQuestionReceived = true;
                    lastMessageCount = currentMessageCount;
                    
                    // 「プロンプトを見て調べて」と返信
                    const inputSelectors = window.AIHandler?.getSelectors?.('ChatGPT', 'INPUT') || [];
                    const inputField = await findElement(inputSelectors);
                    if (inputField) {
                        inputField.focus();
                        await wait(500);
                        
                        if (inputField.tagName === 'TEXTAREA') {
                            inputField.value = 'プロンプトを見て調べて';
                        } else {
                            inputField.textContent = 'プロンプトを見て調べて';
                        }
                        
                        inputField.dispatchEvent(new Event('input', { bubbles: true }));
                        await wait(1000);
                        
                        // 送信
                        const sendButton = await findElement([
                            '[data-testid="send-button"]',
                            '[aria-label="Send prompt"]',
                            'button[type="submit"]'
                        ]);
                        
                        if (sendButton && !sendButton.disabled) {
                            await performClick(sendButton);
                            log('「プロンプトを見て調べて」を送信しました', 'success');
                        }
                    }
                    
                    break; // 5分以内に返信したら監視ループを抜ける
                }
                
                // メッセージ数を更新（返信はしない）
                if (currentMessageCount > lastMessageCount) {
                    lastMessageCount = currentMessageCount;
                    if (stopButton) {
                        log('質問を検出しましたが、まだ処理中です（停止ボタンあり）', 'info');
                    }
                }
                
                await wait(2000); // 2秒ごとにチェック
                
            } catch (error) {
                debugLog(`質問監視エラー: ${error.message}`);
            }
        }
        
        // 5分経過後、または質問に返信後、停止ボタンの消失を待つ
        log('DeepResearch処理の完了を待機中...', 'info');
        while (Date.now() - startTime < maxWaitMinutes * 60 * 1000) {
            try {
                let stopButton = null;
                for (const selector of stopButtonSelectors) {
                    stopButton = document.querySelector(selector);
                    if (stopButton) break;
                }
                if (!stopButton) {
                    await wait(3000);
                    let finalStopCheck = null;
                    for (const selector of stopButtonSelectors) {
                        finalStopCheck = document.querySelector(selector);
                        if (finalStopCheck) break;
                    }
                    if (!finalStopCheck) {
                        log('DeepResearch完了を検出', 'success');
                        return true;
                    }
                }
                await wait(5000);
            } catch (error) {
                debugLog(`DeepResearch完了待機エラー: ${error.message}`);
            }
        }
        
        log('DeepResearch待機タイムアウト', 'warning');
        return false;
    };

    // ============================================
    // 統合実行関数
    // ============================================
    async function runAutomation(config) {
        const operationName = 'runAutomation';
        const fullStartTime = startOperation(operationName, {
            config,
            sessionId,
            timestamp: new Date().toISOString()
        });

        log('(ChatGPT) 自動化実行開始', 'AUTOMATION', config);
        console.log('[ChatGPT] 設定:', config);
        
        // セル位置情報を含む詳細ログ
        const cellInfo = config.cellInfo || {};
        const cellPosition = cellInfo.column && cellInfo.row 
          ? `${cellInfo.column}${cellInfo.row}` 
          : (cellInfo.column === "TEST" && cellInfo.row === "検出" ? "TEST検出" : "タスク実行中");
        
        log(`📊 (ChatGPT) Step1: スプレッドシート読み込み開始 [${cellPosition}セル]`, 'INFO', {
            cellPosition,
            column: cellInfo.column,
            row: cellInfo.row,
            step: 1,
            process: 'スプレッドシート読み込み',
            model: config.model,
            function: config.function,
            promptLength: config.text?.length
        });
        
        const result = {
            success: false,
            model: null,
            function: null,
            text: null,
            response: null,
            error: null,
            timings: {}
        };
        
        try {
            // Step 2: タスクリスト作成
            log(`📋 (ChatGPT) Step2: タスクリスト作成開始 [${cellPosition}セル]`, 'INFO', {
                cellPosition,
                step: 2,
                process: 'タスクリスト作成',
                model: config.model,
                function: config.function
            });
            
            // モデル選択
            if (config.model) {
                const modelStepStart = Date.now();
                log(`モデル選択ステップ開始: ${config.model}`, 'DEBUG');
                
                const modelResult = await selectModel(config.model);
                result.model = modelResult ? config.model : null;
                result.timings.modelSelection = Date.now() - modelStepStart;
                
                log(`モデル選択ステップ完了: ${modelResult ? '成功' : '失敗'}`, 
                    modelResult ? 'SUCCESS' : 'ERROR', {
                  model: config.model,
                  success: modelResult,
                  duration: `${result.timings.modelSelection}ms`
                });
                
                await wait(CONFIG.delays.betweenActions);
            }
            
            // タスクリスト作成完了のログ
            log(`✅ (ChatGPT) Step2: タスクリスト作成完了 [${cellPosition}セル]`, 'SUCCESS', {
                cellPosition,
                step: 2,
                process: 'タスクリスト作成完了'
            });
            
            // Step 3: AI実行開始（経過時間計測開始）
            const step3StartTime = Date.now();
            log(`🤖 (ChatGPT) Step3: AI実行開始 [${cellPosition}セル]`, 'INFO', {
                cellPosition,
                step: 3,
                process: 'AI実行',
                model: config.model,
                function: config.function,
                startTime: step3StartTime
            });
            
            // 機能選択
            if (config.function !== undefined) {
                const functionStepStart = Date.now();
                log(`機能選択ステップ開始: ${config.function}`, 'DEBUG');
                
                const functionResult = await selectFunction(config.function);
                result.function = functionResult ? config.function : null;
                result.timings.functionSelection = Date.now() - functionStepStart;
                
                log(`機能選択ステップ完了: ${functionResult ? '成功' : '失敗'}`, 
                    functionResult ? 'SUCCESS' : 'ERROR', {
                  function: config.function,
                  success: functionResult,
                  duration: `${result.timings.functionSelection}ms`
                });
                
                await wait(CONFIG.delays.betweenActions);
            }
            
            // テキスト入力
            if (config.text) {
                let finalText = config.text;
                
                // セル情報をプロンプトの冒頭に追加（column-processor.js形式）
                if (config.cellInfo && config.cellInfo.column && config.cellInfo.row) {
                    const cellPosition = `${config.cellInfo.column}${config.cellInfo.row}`;
                    finalText = `【現在${cellPosition}セルを処理中です】\n\n${config.text}`;
                    log(`📍 セル情報をプロンプトに追加: ${cellPosition}`, 'INFO');
                }
                
                const inputResult = await inputText(finalText);
                if (!inputResult) {
                    throw new Error('テキスト入力に失敗しました');
                }
                result.text = config.text;  // 元のテキストを保存
            }
            
            // 送信
            if (config.send) {
                const sendResult = await sendMessage();
                if (!sendResult) {
                    throw new Error('送信に失敗しました');
                }
                
                const step3Duration = Date.now() - step3StartTime;
                log(`✅ (ChatGPT) Step3: AI実行完了（送信） [${cellPosition}セル] (${step3Duration}ms)`, 'SUCCESS', {
                    cellPosition,
                    step: 3,
                    process: 'AI実行完了',
                    promptLength: config.text?.length,
                    duration: step3Duration,
                    elapsedTime: `${step3Duration}ms`
                });
            }
            
            // Step 4: 応答停止ボタン消滅まで待機
            if (config.waitResponse) {
                const step4Duration = Date.now() - step3StartTime;
                const currentCellInfo = config.cellInfo || {};
                const currentCellPosition = currentCellInfo.column && currentCellInfo.row ? `${currentCellInfo.column}${currentCellInfo.row}` : '不明';
                log(`⏳ (ChatGPT) Step4: 応答停止ボタン消滅まで待機 [${currentCellPosition}セル] (${step4Duration}ms経過)`, 'INFO', {
                    cellPosition: currentCellPosition,
                    step: 4,
                    process: '応答完了待機',
                    elapsedFromStep3: step4Duration,
                    elapsedTime: `${step4Duration}ms`
                });
                
                const isDeepResearch = window.FeatureConstants ? 
                    window.FeatureConstants.isDeepResearch(config.function) :
                    (config.function && config.function.includes('Deep Research'));
                
                if (isDeepResearch) {
                    log('(ChatGPT) DeepResearch モードで待機', 'INFO');
                    const waitResult = await waitForDeepResearchResponse(60);
                    if (!waitResult) {
                        log('(ChatGPT) DeepResearch待機がタイムアウトしましたが、続行します', 'WARNING');
                    }
                } else {
                    const waitResult = await waitForResponse(config.timeout || 60000);
                    if (!waitResult) {
                        log('(ChatGPT) 回答待機がタイムアウトしましたが、続行します', 'WARNING');
                    }
                }
                
                const step4EndDuration = Date.now() - step3StartTime;
                log(`✅ (ChatGPT) Step4: 応答完了検出 [${cellPosition}セル] (${step4EndDuration}ms経過)`, 'SUCCESS', {
                    cellPosition,
                    step: 4,
                    process: '応答完了検出',
                    elapsedFromStep3: step4EndDuration,
                    elapsedTime: `${step4EndDuration}ms`
                });
            }
            
            // Step 5: 応答取得
            if (config.getResponse) {
                const step5Duration = Date.now() - step3StartTime;
                const step5CellInfo = config.cellInfo || {};
                const step5CellPosition = step5CellInfo.column && step5CellInfo.row ? `${step5CellInfo.column}${step5CellInfo.row}` : '不明';
                log(`📤 (ChatGPT) Step5: 応答取得開始 [${step5CellPosition}セル] (${step5Duration}ms経過)`, 'INFO', {
                    cellPosition: step5CellPosition,
                    step: 5,
                    process: '応答取得',
                    elapsedFromStep3: step5Duration,
                    elapsedTime: `${step5Duration}ms`
                });
                
                const response = await getResponse();
                result.response = response;
                
                if (response) {
                    const step5EndDuration = Date.now() - step3StartTime;
                    const responsePreview = response.substring(0, 30);
                    const hasMore = response.length > 30;
                    log(`✅ (ChatGPT) Step5: 応答取得完了 [${step5CellPosition}セル] (${response.length}文字, ${step5EndDuration}ms経過)`, 'SUCCESS', {
                        cellPosition: step5CellPosition,
                        step: 5,
                        process: '応答取得完了',
                        responseLength: response.length,
                        responsePreview: responsePreview + (hasMore ? '...' : ''),
                        responsePreview30: responsePreview,
                        hasMoreContent: hasMore,
                        fullResponse: response,
                        elapsedFromStep3: step5EndDuration,
                        elapsedTime: `${step5EndDuration}ms`
                    });
                } else {
                    const step5FailDuration = Date.now() - step3StartTime;
                    log(`❌ (ChatGPT) Step5: 応答取得失敗 [${step5CellPosition}セル] (${step5FailDuration}ms経過)`, 'ERROR', {
                        cellPosition: step5CellPosition,
                        step: 5,
                        process: '応答取得失敗',
                        elapsedFromStep3: step5FailDuration,
                        elapsedTime: `${step5FailDuration}ms`
                    });
                }
            }
            
            result.success = true;
            log('(ChatGPT) 自動化実行完了', 'success');
            
        } catch (error) {
            result.success = false;
            result.error = error.message;
            log(`(ChatGPT) 自動化実行エラー: ${error.message}`, 'error');
        }
        
        return result;
    }

    // ============================================
    // デバッグ機能
    // ============================================
    const setDebug = (enabled) => {
        currentState.debug = enabled;
        log(`デバッグモード: ${enabled ? 'ON' : 'OFF'}`, 'info');
    };

    // ============================================
    // 自動変更検出システム
    // ============================================
    let isCheckingModels = false;   // モデル取得中フラグ
    let isCheckingFunctions = false; // 機能取得中フラグ
    let changeDetectionState = {
        enabled: false,
        lastModelsHash: null,
        lastFunctionsHash: null,
        observer: null,
        checkInterval: null,
        debounceTimer: null,  // デバウンス用タイマー
        callbacks: {
            onModelChange: [],
            onFunctionChange: []
        }
    };

    // ハッシュ生成関数
    function generateHash(data) {
        return JSON.stringify(data).split('').reduce((a, b) => {
            a = ((a << 5) - a) + b.charCodeAt(0);
            return a & a;
        }, 0);
    }

    // モデル変更検出
    async function detectModelChanges() {
        try {
            // DOM監視を一時停止
            const observerWasActive = changeDetectionState.observer !== null;
            if (observerWasActive) {
                changeDetectionState.observer.disconnect();
            }
            
            const currentModels = await getAvailableModels();
            const currentHash = generateHash(currentModels.map(m => m.name));
            
            // DOM監視を再開
            if (observerWasActive && changeDetectionState.enabled) {
                setupDOMObserver();
            }
            
            if (changeDetectionState.lastModelsHash !== null && 
                changeDetectionState.lastModelsHash !== currentHash) {
                
                log('🔄 モデル変更を検出しました', 'warning');
                
                // コールバック実行
                changeDetectionState.callbacks.onModelChange.forEach(callback => {
                    try {
                        callback(currentModels);
                    } catch (error) {
                        log(`モデル変更コールバックエラー: ${error.message}`, 'error');
                    }
                });
                
                // イベント発火
                window.dispatchEvent(new CustomEvent('chatgpt-models-changed', {
                    detail: { models: currentModels }
                }));
            }
            
            changeDetectionState.lastModelsHash = currentHash;
        } catch (error) {
            debugLog(`モデル変更検出エラー: ${error.message}`);
        }
    }

    // 機能変更検出
    async function detectFunctionChanges() {
        try {
            // DOM監視を一時停止
            const observerWasActive = changeDetectionState.observer !== null;
            if (observerWasActive) {
                changeDetectionState.observer.disconnect();
            }
            
            const currentFunctions = await getAvailableFunctions();
            const currentHash = generateHash(currentFunctions.map(f => f.name));
            
            // DOM監視を再開
            if (observerWasActive && changeDetectionState.enabled) {
                setupDOMObserver();
            }
            
            if (changeDetectionState.lastFunctionsHash !== null && 
                changeDetectionState.lastFunctionsHash !== currentHash) {
                
                log('🔄 機能変更を検出しました', 'warning');
                
                // コールバック実行
                changeDetectionState.callbacks.onFunctionChange.forEach(callback => {
                    try {
                        callback(currentFunctions);
                    } catch (error) {
                        log(`機能変更コールバックエラー: ${error.message}`, 'error');
                    }
                });
                
                // イベント発火
                window.dispatchEvent(new CustomEvent('chatgpt-functions-changed', {
                    detail: { functions: currentFunctions }
                }));
            }
            
            changeDetectionState.lastFunctionsHash = currentHash;
        } catch (error) {
            debugLog(`機能変更検出エラー: ${error.message}`);
        }
    }

    // 定期チェック関数（同時実行を防ぐ）
    let isPeriodicCheckRunning = false;
    async function periodicCheck() {
        // 既に実行中ならスキップ
        if (isPeriodicCheckRunning) {
            debugLog('定期チェックは既に実行中です（スキップ）');
            return;
        }
        
        isPeriodicCheckRunning = true;
        
        try {
            // モデルチェック（getAvailableModels内で重複チェック済み）
            await detectModelChanges();
            
            // 少し待つ
            await wait(1000);
            
            // 機能チェック（getAvailableFunctions内で重複チェック済み）
            await detectFunctionChanges();
        } finally {
            isPeriodicCheckRunning = false;
        }
    }

    // DOM変更監視
    function setupDOMObserver() {
        if (changeDetectionState.observer) {
            changeDetectionState.observer.disconnect();
        }

        changeDetectionState.observer = new MutationObserver((mutations) => {
            // 既にチェック中なら何もしない（無限ループ防止）
            if (isCheckingModels || isCheckingFunctions) {
                return;
            }
            
            let shouldCheck = false;
            
            mutations.forEach(mutation => {
                // モデル選択ボタンやメニューの変更を監視
                // ただしメニュー自体の追加は無視（getAvailableModels/Functionsが開くメニューを無視）
                if (mutation.target.matches && (
                    mutation.target.matches('[data-testid="model-switcher-dropdown-button"]') ||
                    mutation.target.matches('[data-testid="composer-plus-btn"]')
                )) {
                    shouldCheck = true;
                }
            });
            
            if (shouldCheck) {
                // デバウンス処理（2秒後に実行 - より長めに設定）
                clearTimeout(changeDetectionState.debounceTimer);
                changeDetectionState.debounceTimer = setTimeout(() => {
                    if (!isCheckingModels && !isCheckingFunctions) {
                        periodicCheck();
                    }
                }, 2000);
            }
        });

        // body要素全体を監視（ただし必要最小限の属性のみ）
        changeDetectionState.observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['data-testid'] // roleは監視しない（メニューの開閉を無視）
        });
    }

    // 変更検出開始
    function startChangeDetection(options = {}) {
        const {
            enableDOMObserver = true,
            enablePeriodicCheck = false, // デフォルトで定期チェックを無効化
            checkInterval = 30000 // 30秒
        } = options;

        if (changeDetectionState.enabled) {
            log('変更検出は既に有効です', 'warning');
            return;
        }

        log('🔍 ChatGPT変更検出システムを開始します', 'info');
        
        changeDetectionState.enabled = true;
        
        // 初期状態を記録（手動実行モードでは実行しない）
        if (enablePeriodicCheck || enableDOMObserver) {
            periodicCheck();
        }
        
        // DOM監視開始
        if (enableDOMObserver) {
            setupDOMObserver();
            log('DOM変更監視を開始しました', 'info');
        }
        
        // 定期チェック開始（デフォルトでは無効）
        if (enablePeriodicCheck) {
            changeDetectionState.checkInterval = setInterval(periodicCheck, checkInterval);
            log(`定期チェックを開始しました (${checkInterval/1000}秒間隔)`, 'info');
        }
    }

    // 変更検出停止
    function stopChangeDetection() {
        if (!changeDetectionState.enabled) {
            log('変更検出は無効です', 'warning');
            return;
        }

        log('🛑 ChatGPT変更検出システムを停止します', 'info');
        
        changeDetectionState.enabled = false;
        
        // DOM監視停止
        if (changeDetectionState.observer) {
            changeDetectionState.observer.disconnect();
            changeDetectionState.observer = null;
        }
        
        // 定期チェック停止
        if (changeDetectionState.checkInterval) {
            clearInterval(changeDetectionState.checkInterval);
            changeDetectionState.checkInterval = null;
        }
        
        // デバウンスタイマークリア
        if (changeDetectionState.debounceTimer) {
            clearTimeout(changeDetectionState.debounceTimer);
            changeDetectionState.debounceTimer = null;
        }
    }

    // コールバック登録
    function onModelChange(callback) {
        if (typeof callback === 'function') {
            changeDetectionState.callbacks.onModelChange.push(callback);
            log('モデル変更コールバックを登録しました', 'info');
        }
    }

    function onFunctionChange(callback) {
        if (typeof callback === 'function') {
            changeDetectionState.callbacks.onFunctionChange.push(callback);
            log('機能変更コールバックを登録しました', 'info');
        }
    }

    // 強制チェック実行
    async function forceCheck() {
        log('🔍 強制チェックを実行中...', 'info');
        await periodicCheck();
        log('✅ 強制チェック完了', 'success');
    }

    // ============================================
    // 初期化
    // ============================================
    function initialize() {
        // AIHandlerの初期化
        if (useAIHandler) {
            menuHandler = window.AIHandler.menuHandler || new window.AIHandler.MenuHandler();
            log('✅ AIHandlerを初期化しました', 'success');
        } else {
            log('AIHandlerが利用できません、従来の方法を使用します', 'info');
        }
    }
    
    // 初期化実行
    initialize();
    
    // ============================================
    // グローバル公開
    // ============================================
    window.ChatGPTAutomation = {
        selectModel,
        selectFunction,
        inputText,
        sendMessage,
        waitForResponse,
        getResponse,
        runAutomation,
        setDebug,
        getAvailableModels,
        getAvailableFunctions,
        // 変更検出API
        startChangeDetection,
        stopChangeDetection,
        forceCheck,
        onModelChange,
        onFunctionChange,
        getChangeDetectionState: () => ({
            enabled: changeDetectionState.enabled,
            lastModelsHash: changeDetectionState.lastModelsHash,
            lastFunctionsHash: changeDetectionState.lastFunctionsHash,
            callbackCounts: {
                models: changeDetectionState.callbacks.onModelChange.length,
                functions: changeDetectionState.callbacks.onFunctionChange.length
            }
        }),
        utils: {
            wait,
            waitForMenu,
            performClick
        }
    };

    // 拡張機能ログ統合テスト
    log('ChatGPT自動化スクリプト初期化開始', 'AUTOMATION', {
        version: '統合テスト版',
        sessionId: sessionId,
        logSystemEnabled: true,
        extensionIntegration: !!(window.chrome && window.chrome.runtime)
    });

    log('ChatGPT自動化関数が利用可能になりました', 'SUCCESS');
    
    // テスト用の詳細ログ
    log('詳細ログシステム動作確認', 'DEBUG', {
        logLevels: Object.keys(LogLevel),
        logTypes: Object.keys(logTypeConfig),
        storageEnabled: logConfig.enableStorage,
        consoleEnabled: logConfig.enableConsole
    });
    
    return window.ChatGPTAutomation;
})();