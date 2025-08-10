// ============================================
// ChatGPT自動化関数 - 統合テスト版
// 元のテストコードをベースに統合テスト用に調整
// ============================================

(function() {
    'use strict';

    console.log('%cChatGPT自動化関数 - 統合テスト版', 'color: #00BCD4; font-weight: bold; font-size: 16px');

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
            textInput: 100
        }
    };

    // HTMLのIDと実際の機能名のマッピング
    const MODEL_MAPPING = {
        'gpt-5': 'GPT-5',
        'gpt-5-thinking': 'GPT-5 Thinking',
        'gpt-5-pro': 'GPT-5 Pro'
    };

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

    const log = (message, type = 'info') => {
        const styles = {
            info: 'color: #2196F3',
            success: 'color: #4CAF50',
            warning: 'color: #FF9800',
            error: 'color: #F44336',
            debug: 'color: #9C27B0'
        };
        console.log(`%c[ChatGPT] ${message}`, `${styles[type]}; font-weight: bold`);
    };

    const debugLog = (message) => {
        log(`[DEBUG] ${message}`, 'debug');
    };

    // ============================================
    // メニュー操作関数（動作確認済み堅牢版）
    // ============================================
    async function closeMenu() {
        debugLog('メニューを閉じます');
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await wait(100);
        document.body.click();
        await wait(100);
        
        const openMenus = document.querySelectorAll('[role="menu"]');
        openMenus.forEach(menu => menu.remove());
        
        await wait(CONFIG.delays.afterClick);
        const menuStillOpen = document.querySelector('[role="menu"]');
        debugLog(`メニュー閉じた: ${!menuStillOpen}`);
        return !menuStillOpen;
    }

    async function performClick(element) {
        if (!element) {
            debugLog('クリック対象要素がnull');
            return false;
        }
        
        try {
            debugLog('PointerEventでクリック実行');
            element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
            await wait(10);
            element.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true }));
            element.dispatchEvent(new PointerEvent('click', { bubbles: true, cancelable: true }));
            await wait(CONFIG.delays.afterClick);
            return true;
        } catch (e) {
            debugLog('PointerEvent失敗、通常クリックで再試行');
            element.click();
            await wait(CONFIG.delays.afterClick);
            return true;
        }
    }

    async function waitForMenu(maxWait = 3000) {
        debugLog(`メニューを待機中... (最大${maxWait}ms)`);
        const startTime = Date.now();
        while (Date.now() - startTime < maxWait) {
            const menu = document.querySelector('[role="menu"]');
            if (menu && menu.offsetParent !== null) {
                debugLog('メニューを発見');
                await wait(CONFIG.delays.menuOpen);
                return menu;
            }
            await wait(100);
        }
        debugLog('メニュー待機タイムアウト');
        return null;
    }

    async function openSubmenu(menuItem) {
        debugLog('サブメニューを開きます');
        menuItem.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
        menuItem.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
        await wait(CONFIG.delays.submenuOpen);
        
        const allMenus = document.querySelectorAll('[role="menu"]');
        if (allMenus.length > 1) {
            debugLog(`サブメニュー発見 (総メニュー数: ${allMenus.length})`);
            return allMenus[allMenus.length - 1];
        }
        
        debugLog('マウスホバーで開かなかったため、クリックで試行');
        await performClick(menuItem);
        await wait(CONFIG.delays.submenuOpen);
        
        const menusAfterClick = document.querySelectorAll('[role="menu"]');
        if (menusAfterClick.length > 1) {
            debugLog(`クリック後にサブメニュー発見 (総メニュー数: ${menusAfterClick.length})`);
            return menusAfterClick[menusAfterClick.length - 1];
        }
        
        debugLog('サブメニューが開けませんでした');
        return null;
    }

    // ============================================
    // モデル選択関数（動的検索版）
    // ============================================

    // ============================================
    // モデル選択関数（Geminiスタイル動的検索版）
    // ============================================
    async function selectModel(modelName) {
        log(`🤖 モデル選択開始: ${modelName}`, 'info');
        
        try {
            // モデル選択ボタンを探す（ChatGPT特有の方法）
            const modelButtonSelectors = [
                '[data-testid="model-switcher-dropdown-button"]',
                'button[aria-haspopup="menu"]',
                'button[aria-label*="モデル"]',
                'button[aria-label*="Model"]'
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
                return false;
            }
            
            // メニューを開く（ChatGPT特有の方法）
            debugLog('モデルメニューを開きます');
            await performClick(modelButton);
            const menu = await waitForMenu();
            
            if (!menu) {
                log('❌ モデルメニューが開きませんでした', 'error');
                return false;
            }
            
            debugLog('モデルメニューが正常に開きました');
            
            // モデル名マッピング（Geminiスタイル - 複数パターン対応）
            const modelMappings = {
                'gpt-5': ['GPT-5'],
                'gpt-5-thinking': ['GPT-5 Thinking', 'Thinking'],
                'gpt-5-pro': ['GPT-5 Pro', 'Pro'],
                '5': ['GPT-5'],
                '5-thinking': ['GPT-5 Thinking', 'Thinking'],
                '5-pro': ['GPT-5 Pro', 'Pro'],
                'thinking': ['GPT-5 Thinking', 'Thinking'],
                'pro': ['GPT-5 Pro', 'Pro']
            };
            
            const possibleNames = modelMappings[modelName.toLowerCase()] || [modelName];
            log(`検索パターン: ${possibleNames.join(', ')}`, 'info');
            
            // メニューからモデルを動的検索（ChatGPT特有のセレクタ）
            const menuItems = menu.querySelectorAll('[role="menuitem"]');
            debugLog(`利用可能なモデル項目数: ${menuItems.length}`);
            
            let allModels = [];
            
            for (const item of menuItems) {
                const textContent = item.textContent?.trim() || '';
                const testId = item.getAttribute('data-testid');
                
                if (textContent) {
                    allModels.push({ text: textContent, testId: testId });
                    debugLog(`発見モデル: "${textContent}" (testId: ${testId})`);
                    
                    // Geminiスタイルのマッチング - シンプルなincludes()
                    for (const name of possibleNames) {
                        if (textContent.includes(name)) {
                            log(`🎯 マッチ成功: "${textContent}" ← "${name}"`, 'success');
                            
                            // 既に選択済みかチェック
                            const isSelected = item.querySelector('svg path[d*="12.0961"]') !== null;
                            if (isSelected) {
                                log(`ℹ️ モデル "${textContent}" は既に選択済みです`, 'info');
                                await closeMenu();
                                return true;
                            }
                            
                            // モデル選択実行
                            debugLog(`モデル "${textContent}" をクリックします`);
                            await performClick(item);
                            await wait(1000);
                            
                            currentState.selectedModel = textContent;
                            log(`✅ モデルを「${textContent}」に変更しました`, 'success');
                            return true;
                        }
                    }
                }
            }
            
            // モデルが見つからない場合
            log(`❌ モデル「${modelName}」が見つかりませんでした`, 'error');
            log('利用可能なモデル:', 'info');
            allModels.forEach(model => {
                log(`  • ${model.text} (${model.testId})`, 'info');
            });
            await closeMenu();
            return false;
            
        } catch (error) {
            log(`モデル選択エラー: ${error.message}`, 'error');
            return false;
        }
    }

    // 利用可能なモデルを取得する関数
    async function getAvailableModels() {
        log('📋 利用可能なモデルを取得中...', 'info');
        
        // モデル選択ボタンを探す
        const modelButton = document.querySelector('[data-testid="model-switcher-dropdown-button"]');
        if (!modelButton) {
            log('❌ モデル選択ボタンが見つかりません', 'error');
            return [];
        }
        
        // メニューを開く
        await performClick(modelButton);
        const menu = await waitForMenu();
        
        if (!menu) {
            log('❌ モデルメニューが開きませんでした', 'error');
            return [];
        }
        
        // モデル一覧を取得
        const menuItems = menu.querySelectorAll('[role="menuitem"]');
        const models = [];
        
        for (const item of menuItems) {
            const textContent = item.textContent?.trim();
            const testId = item.getAttribute('data-testid');
            const isSelected = item.querySelector('svg path[d*="12.0961"]') !== null;
            
            if (textContent) {
                models.push({
                    name: textContent,
                    testId: testId,
                    selected: isSelected
                });
            }
        }
        
        // メニューを閉じる
        await closeMenu();
        
        log(`✅ ${models.length}個のモデルを発見`, 'success');
        models.forEach(model => {
            const status = model.selected ? ' [選択中]' : '';
            log(`  • ${model.name}${status}`, 'info');
        });
        
        return models;
    }

    // ============================================
    // 機能選択関数（動的検索版）
    // ============================================
    async function selectFunction(functionName) {
        // 機能を無効化する場合
        if (functionName === 'none' || !functionName) {
            log('🔄 全ての機能を無効化します', 'info');
            const activePills = document.querySelectorAll('button[data-is-selected="true"][data-pill="true"]');
            for (const pill of activePills) {
                const closeButton = pill.querySelector('svg[aria-label*="無効"], svg[aria-label*="disable"]');
                const clickTarget = closeButton?.parentElement || pill;
                await performClick(clickTarget);
                await wait(CONFIG.delays.afterClick);
            }
            log('✅ 全ての機能を無効化しました', 'success');
            return true;
        }

        log(`🔍 機能を動的検索: ${functionName}`, 'info');

        // 機能選択ボタンを探す
        const functionButtonSelectors = [
            '[data-testid="composer-plus-btn"]',
            'button.composer-btn',
            'button[aria-label*="機能"]',
            'button[aria-label*="プラス"]',
            'button[aria-label*="追加"]'
        ];

        let functionButton = null;
        for (const selector of functionButtonSelectors) {
            try {
                const elements = document.querySelectorAll(selector);
                for (const element of elements) {
                    if (element && element.offsetParent !== null) {
                        functionButton = element;
                        debugLog(`機能選択ボタン発見: ${selector}`);
                        break;
                    }
                }
                if (functionButton) break;
            } catch (e) {
                debugLog(`セレクタエラー: ${selector}`);
            }
        }

        if (!functionButton) {
            log('❌ 機能選択ボタンが見つかりません', 'error');
            return false;
        }

        // メニューを開く
        debugLog('機能メニューを開きます');
        await performClick(functionButton);
        const menu = await waitForMenu();

        if (!menu) {
            log('❌ 機能メニューが開きませんでした', 'error');
            return false;
        }

        debugLog('機能メニューが正常に開きました');

        // 動的に機能項目を検索
        let allMenuItems = [];
        let targetFunction = null;
        let allFunctions = [];

        // メインメニューから検索
        const mainMenuItems = menu.querySelectorAll('[role="menuitem"], [role="menuitemradio"]');
        debugLog(`メインメニュー項目数: ${mainMenuItems.length}`);

        for (const item of mainMenuItems) {
            const textContent = item.textContent?.trim();
            if (textContent) {
                allFunctions.push({ text: textContent, location: 'main', element: item });
                debugLog(`発見機能(メイン): "${textContent}"`);

                // 機能名のマッチング（柔軟な検索）
                const normalizedInput = functionName.toLowerCase().replace(/[^a-z0-9]/g, '');
                const normalizedFunction = textContent.toLowerCase().replace(/[^a-z0-9]/g, '');

                if (normalizedFunction.includes(normalizedInput) || 
                    normalizedInput.includes(normalizedFunction) ||
                    textContent.toLowerCase().includes(functionName.toLowerCase()) ||
                    functionName.toLowerCase().includes(textContent.toLowerCase())) {
                    targetFunction = { element: item, text: textContent, location: 'main' };
                    log(`🎯 マッチする機能を発見(メイン): "${textContent}"`, 'success');
                    break;
                }
            }
        }

        // サブメニューも検索（メインで見つからない場合）
        if (!targetFunction) {
            // 「さらに表示」ボタンを探す
            const submenuTrigger = Array.from(mainMenuItems)
                .find(item => item.textContent?.includes('さらに表示'));

            if (submenuTrigger) {
                log('📂 サブメニューを開きます', 'info');
                const submenu = await openSubmenu(submenuTrigger);

                if (submenu) {
                    const submenuItems = submenu.querySelectorAll('[role="menuitem"], [role="menuitemradio"]');
                    debugLog(`サブメニュー項目数: ${submenuItems.length}`);

                    for (const item of submenuItems) {
                        const textContent = item.textContent?.trim();
                        if (textContent) {
                            allFunctions.push({ text: textContent, location: 'submenu', element: item });
                            debugLog(`発見機能(サブ): "${textContent}"`);

                            // 機能名のマッチング
                            const normalizedInput = functionName.toLowerCase().replace(/[^a-z0-9]/g, '');
                            const normalizedFunction = textContent.toLowerCase().replace(/[^a-z0-9]/g, '');

                            if (normalizedFunction.includes(normalizedInput) || 
                                normalizedInput.includes(normalizedFunction) ||
                                textContent.toLowerCase().includes(functionName.toLowerCase()) ||
                                functionName.toLowerCase().includes(textContent.toLowerCase())) {
                                targetFunction = { element: item, text: textContent, location: 'submenu' };
                                log(`🎯 マッチする機能を発見(サブ): "${textContent}"`, 'success');
                                break;
                            }
                        }
                    }
                } else {
                    debugLog('サブメニューが開けませんでした');
                }
            } else {
                debugLog('「さらに表示」ボタンが見つかりませんでした');
            }
        }

        // 機能が見つからない場合、利用可能な機能一覧を表示
        if (!targetFunction) {
            log(`❌ 機能 "${functionName}" が見つかりませんでした`, 'error');
            log('利用可能な機能:', 'info');
            allFunctions.forEach(func => {
                log(`  • ${func.text} (${func.location})`, 'info');
            });
            await closeMenu();
            return false;
        }

        // 機能を選択
        debugLog(`機能 "${targetFunction.text}" をクリックします`);
        await performClick(targetFunction.element);

        // 選択確認（メニューが閉じるのを待つ）
        await wait(500);

        currentState.activeFunctions.add(targetFunction.text);
        log(`✅ 機能を「${targetFunction.text}」に変更しました`, 'success');
        return true;
    }

    // 利用可能な機能を取得する関数
    async function getAvailableFunctions() {
        log('📋 利用可能な機能を取得中...', 'info');
        
        // 機能選択ボタンを探す
        const functionButton = document.querySelector('[data-testid="composer-plus-btn"]');
        if (!functionButton) {
            log('❌ 機能選択ボタンが見つかりません', 'error');
            return [];
        }
        
        // メニューを開く
        await performClick(functionButton);
        const menu = await waitForMenu();
        
        if (!menu) {
            log('❌ 機能メニューが開きませんでした', 'error');
            return [];
        }
        
        // 機能一覧を取得
        const functions = [];
        
        // メインメニューの機能
        const mainMenuItems = menu.querySelectorAll('[role="menuitem"], [role="menuitemradio"]');
        for (const item of mainMenuItems) {
            const textContent = item.textContent?.trim();
            if (textContent) {
                functions.push({
                    name: textContent,
                    location: 'main',
                    type: item.getAttribute('role') === 'menuitemradio' ? 'radio' : 'normal'
                });
            }
        }
        
        // サブメニューの機能
        const submenuTrigger = Array.from(mainMenuItems)
            .find(item => item.textContent?.includes('さらに表示'));
        
        if (submenuTrigger) {
            const submenu = await openSubmenu(submenuTrigger);
            if (submenu) {
                const submenuItems = submenu.querySelectorAll('[role="menuitem"], [role="menuitemradio"]');
                for (const item of submenuItems) {
                    const textContent = item.textContent?.trim();
                    if (textContent) {
                        functions.push({
                            name: textContent,
                            location: 'submenu',
                            type: item.getAttribute('role') === 'menuitemradio' ? 'radio' : 'normal'
                        });
                    }
                }
            }
        }
        
        // メニューを閉じる
        await closeMenu();
        
        log(`✅ ${functions.length}個の機能を発見`, 'success');
        functions.forEach(func => {
            log(`  • ${func.name} (${func.location}, ${func.type})`, 'info');
        });
        
        return functions;
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
            const sendButtonSelectors = [
                '[data-testid="send-button"]',
                '#composer-submit-button',
                '[aria-label="プロンプトを送信する"]',
                '[aria-label*="送信"]',
                'button[data-testid="composer-send-button"]',
                'button[class*="send"]'
            ];
            
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
            return true;
            
        } catch (error) {
            log(`送信エラー: ${error.message}`, 'error');
            return false;
        }
    }

    async function waitForResponse(timeout = 60000) {
        log('回答を待機中...', 'info');
        const startTime = Date.now();
        let lastMinuteLogged = 0;
        
        while (Date.now() - startTime < timeout) {
            const elapsedMs = Date.now() - startTime;
            const elapsedMinutes = Math.floor(elapsedMs / 60000);
            
            // 1分ごとにログを出力
            if (elapsedMinutes > lastMinuteLogged) {
                lastMinuteLogged = elapsedMinutes;
                log(`回答待機中... (${elapsedMinutes}分経過)`, 'info');
            }
            
            // 停止ボタンの存在を確認（生成中の判定）
            const stopButton = document.querySelector('[data-testid="stop-button"]');
            
            if (!stopButton) {
                // 停止ボタンがない = 生成完了
                await wait(1000); // 念のため1秒待つ
                
                // 経過時間を計算
                if (currentState.sendStartTime) {
                    const elapsedTotal = Date.now() - currentState.sendStartTime;
                    const minutes = Math.floor(elapsedTotal / 60000);
                    const seconds = Math.floor((elapsedTotal % 60000) / 1000);
                    log(`✅ 回答生成完了（送信から ${minutes}分${seconds}秒経過）`, 'success');
                } else {
                    log('✅ 回答生成完了', 'success');
                }
                return true;
            }
            
            await wait(500);
        }
        
        log(`回答待機タイムアウト (${timeout/1000}秒経過)`, 'warning');
        return false;
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
                throw new Error('回答が見つかりません');
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
            
            throw new Error('回答テキストを抽出できませんでした');
            
        } catch (error) {
            log(`回答取得エラー: ${error.message}`, 'error');
            return null;
        }
    }

    // ============================================
    // 統合実行関数
    // ============================================
    async function runAutomation(config) {
        log('自動化実行開始', 'info');
        console.log('[ChatGPT] 設定:', config);
        
        const result = {
            success: false,
            model: null,
            function: null,
            text: null,
            response: null,
            error: null
        };
        
        try {
            // モデル選択
            if (config.model) {
                const modelResult = await selectModel(config.model);
                result.model = modelResult ? config.model : null;
                await wait(CONFIG.delays.betweenActions);
            }
            
            // 機能選択
            if (config.function !== undefined) {
                const functionResult = await selectFunction(config.function);
                result.function = functionResult ? config.function : null;
                await wait(CONFIG.delays.betweenActions);
            }
            
            // テキスト入力
            if (config.text) {
                const inputResult = await inputText(config.text);
                if (!inputResult) {
                    throw new Error('テキスト入力に失敗しました');
                }
                result.text = config.text;
            }
            
            // 送信
            if (config.send) {
                const sendResult = await sendMessage();
                if (!sendResult) {
                    throw new Error('送信に失敗しました');
                }
            }
            
            // 回答待機
            if (config.waitResponse) {
                const waitResult = await waitForResponse(config.timeout || 60000);
                if (!waitResult) {
                    log('回答待機がタイムアウトしましたが、続行します', 'warning');
                }
            }
            
            // 回答取得
            if (config.getResponse) {
                const response = await getResponse();
                result.response = response;
            }
            
            result.success = true;
            log('自動化実行完了', 'success');
            
        } catch (error) {
            result.success = false;
            result.error = error.message;
            log(`自動化実行エラー: ${error.message}`, 'error');
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
        utils: {
            wait,
            waitForMenu,
            performClick
        }
    };

    log('ChatGPT自動化関数が利用可能になりました', 'success');
    return window.ChatGPTAutomation;
})();