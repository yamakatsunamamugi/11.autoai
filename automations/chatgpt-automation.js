// ============================================
// ChatGPT自動化関数 - 統合テスト版
// 元のテストコードをベースに統合テスト用に調整
// ============================================
(() => {
    "use strict";

    console.log('%cChatGPT自動化関数 - 統合テスト版', 'color: #00BCD4; font-weight: bold; font-size: 16px');
    
    // AIHandlerを使用
    const useAIHandler = window.AIHandler;
    let menuHandler = null;  // AIHandlerのメニューハンドラーインスタンス

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
            const poppers = document.querySelectorAll('[data-radix-popper-content-wrapper]');
            for (const popper of poppers) {
                const menu = popper.querySelector('[role="menu"]');
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
        debugLog('サブメニューを開きます');
        
        // ホバーイベントを発火（成功実績のある方法）
        menuItem.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
        menuItem.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
        await wait(800); // 800ms待機（成功実績のある待機時間）
        
        // サブメニューが開いたか確認
        const allMenus = document.querySelectorAll('[role="menu"]');
        if (allMenus.length > 1) {
            debugLog('✅ ホバーでサブメニューが開きました');
            return allMenus[allMenus.length - 1];
        }
        
        // Radix UIポッパーも確認
        const poppers = document.querySelectorAll('[data-radix-popper-content-wrapper]');
        if (poppers.length > 1) {
            const submenu = poppers[poppers.length - 1].querySelector('[role="menu"]');
            if (submenu) {
                debugLog('✅ ホバーでサブメニューが開きました（ポッパー経由）');
                return submenu;
            }
        }
        
        // ホバーで開かない場合はクリックも試みる
        debugLog('ホバーで開かなかったため、クリックを試行');
        await performClick(menuItem);
        await wait(800);
        
        const menusAfterClick = document.querySelectorAll('[role="menu"]');
        if (menusAfterClick.length > 1) {
            debugLog('✅ クリックでサブメニューが開きました');
            return menusAfterClick[menusAfterClick.length - 1];
        }
        
        const poppersAfterClick = document.querySelectorAll('[data-radix-popper-content-wrapper]');
        if (poppersAfterClick.length > 1) {
            const submenu = poppersAfterClick[poppersAfterClick.length - 1].querySelector('[role="menu"]');
            if (submenu) {
                debugLog('✅ クリックでサブメニューが開きました（ポッパー経由）');
                return submenu;
            }
        }
        
        debugLog('❌ サブメニューが開けませんでした');
        return null;
    }

    // ============================================
    // モデル選択関数（動的検索版）
    // ============================================

    // ============================================
    // モデル選択関数（共通ハンドラー使用）
    // ============================================
    async function selectModel(modelName) {
        log(`🤖 モデル選択開始: ${modelName}`, 'info');
        
        // AIHandlerを使用
        if (!useAIHandler || !menuHandler) {
            log('AIHandlerが利用できません', 'error');
            return false;
        }

        try {
            const result = await menuHandler.selectModel(modelName);
            if (result) {
                log(`✅ 共通ハンドラーでモデル「${modelName}」を選択しました`, 'success');
                currentState.selectedModel = modelName;
                return true;
            }
            return false;
        } catch (error) {
            log(`モデル選択エラー: ${error.message}`, 'error');
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
            
            // 各サブメニューを順番に処理
            for (const trigger of submenuTriggers) {
                const triggerText = trigger.textContent?.trim() || 'Unknown';
                log(`📂 サブメニューを開きます: ${triggerText}`, 'info');
                debugLog(`サブメニュートリガー: "${triggerText}"`);
                
                // openSubmenu関数を使用してサブメニューを開く
                const submenu = await openSubmenu(trigger);
                
                if (submenu) {
                    const submenuItems = submenu.querySelectorAll('[role="menuitem"], [role="menuitemradio"]');
                    debugLog(`サブメニュー項目数: ${submenuItems.length}`);
                    
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
                            debugLog(`発見モデル(${locationName}): "${textContent}" (testId: ${testId}, selected: ${isSelected})`);
                        }
                    }
                    
                    // サブメニューを閉じる処理をスキップ（誤クリック防止）
                    await wait(200);
                } else {
                    debugLog(`サブメニューが開けませんでした: ${triggerText}`);
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
            
            // ストレージに保存（検出したモデルを保存）
            // 機能取得は後で別途行う
            await saveToStorage({
                models: models,
                functions: [],
                lastUpdated: new Date().toISOString()
            });
            
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
        
        // AIHandlerを使用
        if (!useAIHandler || !menuHandler) {
            log('AIHandlerが利用できません', 'error');
            return false;
        }

        try {
            // FUNCTION_MAPPINGで変換
            const mappedFunction = FUNCTION_MAPPING[functionName] || functionName;
            const result = await menuHandler.selectFunction(mappedFunction);
            if (result) {
                log(`✅ 共通ハンドラーで機能「${mappedFunction}」を選択しました`, 'success');
                currentState.activeFunctions.add(mappedFunction);
                return true;
            }
            return false;
        } catch (error) {
            log(`機能選択エラー: ${error.message}`, 'error');
            return false;
        }
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
            
            // 各サブメニューを順番に処理
            for (const trigger of submenuTriggers) {
                const triggerText = trigger.textContent?.trim() || 'Unknown';
                log(`📂 サブメニューを開きます: ${triggerText}`, 'info');
                
                const submenu = await openSubmenu(trigger);
                
                if (submenu) {
                    const submenuItems = submenu.querySelectorAll('[role="menuitem"], [role="menuitemradio"]');
                    debugLog(`✅ サブメニュー項目数: ${submenuItems.length}`);
                    
                    for (const item of submenuItems) {
                        const textContent = item.textContent?.trim();
                        // トリガー自体は除外
                        if (textContent && textContent !== triggerText) {
                            // サブメニューの場所を記録（シンプルに "submenu" とする）
                            const locationName = 'submenu';
                            
                            allFunctions.push({ text: textContent, location: locationName, element: item });
                            debugLog(`発見機能(サブメニュー): "${textContent}"`);
                            
                            functions.push({
                                name: textContent,
                                location: locationName,
                                type: item.getAttribute('role') === 'menuitemradio' ? 'radio' : 'normal',
                                active: item.getAttribute('aria-checked') === 'true'
                            });
                        }
                    }
                    
                    // サブメニューを閉じる処理をスキップ（誤クリック防止）
                    await wait(200);
                } else {
                    debugLog(`サブメニューが開けませんでした: ${triggerText}`);
                    
                    // フォールバック: 「さらに表示」の場合は既知の機能を追加
                    if (triggerText === 'さらに表示' || triggerText.toLowerCase() === 'show more') {
                        debugLog('フォールバック: 既知の「さらに表示」機能を追加');
                        const fallbackFunctions = [
                            'あらゆる学びをサポート',
                            'ウェブ検索',
                            'canvas',
                            'OneDrive を接続する',
                            'Sharepoint を接続する'
                        ];
                        
                        fallbackFunctions.forEach(funcName => {
                            functions.push({
                                name: funcName,
                                location: 'submenu-fallback',
                                type: 'normal',
                                active: false
                            });
                            debugLog(`フォールバック機能追加: "${funcName}"`);
                        });
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
            
            // ストレージに保存（検出した機能を保存）
            await saveToStorage({
                models: [],
                functions: functions,
                lastUpdated: new Date().toISOString()
            });
            
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
        const initialMessages = document.querySelectorAll('[data-message-author-role="assistant"]');
        let lastMessageCount = initialMessages.length;
        let hasQuestionReceived = false;
        
        // 最初の5分間、質問を監視
        log('最初の5分間、質問を監視中...', 'info');
        const fiveMinutes = 5 * 60 * 1000;
        
        while (Date.now() - startTime < fiveMinutes) {
            try {
                // 現在のメッセージ数をチェック
                const currentMessages = document.querySelectorAll('[data-message-author-role="assistant"]');
                const currentMessageCount = currentMessages.length;
                
                // 停止ボタンの状態をチェック
                const stopButton = document.querySelector('[aria-label="Stop generating"]');
                
                // 新しいメッセージが追加され、かつ停止ボタンが消えた場合
                if (currentMessageCount > lastMessageCount && !stopButton && !hasQuestionReceived) {
                    log('ChatGPTから質問を受信しました（停止ボタン消滅後・5分以内）', 'info');
                    hasQuestionReceived = true;
                    lastMessageCount = currentMessageCount;
                    
                    // 「プロンプトを見て調べて」と返信
                    const inputField = await findElement(['#prompt-textarea', '[contenteditable="true"]']);
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
                const stopButton = document.querySelector('[aria-label="Stop generating"]');
                if (!stopButton) {
                    await wait(3000);
                    const finalStopCheck = document.querySelector('[aria-label="Stop generating"]');
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
            
            // 回答待機（DeepResearchの場合は専用の待機関数を使用）
            if (config.waitResponse) {
                if (config.function && config.function.includes('Deep Research')) {
                    log('DeepResearch モードで待機', 'info');
                    const waitResult = await waitForDeepResearchResponse(60);
                    if (!waitResult) {
                        log('DeepResearch待機がタイムアウトしましたが、続行します', 'warning');
                    }
                } else {
                    const waitResult = await waitForResponse(config.timeout || 60000);
                    if (!waitResult) {
                        log('回答待機がタイムアウトしましたが、続行します', 'warning');
                    }
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

    log('ChatGPT自動化関数が利用可能になりました', 'success');
    return window.ChatGPTAutomation;
})();