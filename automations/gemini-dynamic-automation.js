/**
 * Gemini動的自動化関数（完全動的検索版）
 * Version: 2.0.0
 * 
 * 特徴:
 * - ハードコードなし、完全動的検索
 * - UI変更に自動適応
 * - ファジー検索対応
 * - キャッシュ機能付き
 */

(function() {
    'use strict';
    
    // AIHandlerを使用
    const useAIHandler = window.AIHandler;
    let menuHandler = null;  // AIHandlerのメニューハンドラーインスタンス

    // ========================================
    // 遅延時間設定のみ
    // ========================================
    const DELAYS = {
        elementSearch: 2000,
        menuWait: 2000,
        clickDelay: 1000,
        stateCheck: 1500,
        submitWait: 2000,
        afterSubmit: 3000,
        responseCheck: 5000,
        textRender: 3000,
        cacheExpiry: 300000 // 5分
    };

    // ========================================
    // グローバル状態管理
    // ========================================
    let globalState = {
        modelCache: null,
        modelCacheTime: null,
        functionCache: null,
        functionCacheTime: null,
        debugMode: false,
        currentModel: null,
        activeFunctions: []
    };
    
    // グローバルに公開（外部からアクセス可能にする）
    window.globalState = globalState;

    // ========================================
    // ユーティリティ関数
    // ========================================
    const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    // メニューを閉じる統一関数（テスト結果に基づくメニュートリガー方式）
    const closeMenu = async () => {
        try {
            // 方法1: メニュートリガーのトグル（最も効果的）
            const menuTrigger = document.querySelector('.mat-mdc-menu-trigger[aria-expanded="true"]');
            if (menuTrigger) {
                debugLog('メニュートリガーを使用してメニューを閉じます');
                menuTrigger.click();
                await wait(300);
                return true;
            }

            // 方法2: ESCキー（バックアップ）
            debugLog('ESCキーでメニューを閉じます');
            document.body.dispatchEvent(new KeyboardEvent('keydown', {
                key: 'Escape',
                code: 'Escape',
                bubbles: true
            }));
            await wait(300);

            // 方法3: document.body.click（最終手段）
            debugLog('document.body.clickでメニューを閉じます');
            document.body.click();
            await wait(200);
            
            return true;
        } catch (error) {
            debugLog(`メニューを閉じる際にエラー: ${error.message}`);
            return false;
        }
    };

    // 要素の可視性チェック関数
    const isElementVisible = (element) => {
        if (!element) return false;
        
        // 基本的な表示チェック
        const style = window.getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
            return false;
        }
        
        // 境界チェック
        const rect = element.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) {
            return false;
        }
        
        // 画面内にあるかチェック
        const viewport = {
            width: window.innerWidth || document.documentElement.clientWidth,
            height: window.innerHeight || document.documentElement.clientHeight
        };
        
        // 完全に画面外にある場合は非表示とする
        if (rect.right < 0 || rect.bottom < 0 || rect.left > viewport.width || rect.top > viewport.height) {
            return false;
        }
        
        // offsetParentがnullの場合は非表示
        if (!element.offsetParent && element.tagName !== 'BODY') {
            return false;
        }
        
        return true;
    };

    // 画面サイズ情報を取得する関数
    const getScreenInfo = () => {
        return {
            width: window.innerWidth || document.documentElement.clientWidth,
            height: window.innerHeight || document.documentElement.clientHeight,
            devicePixelRatio: window.devicePixelRatio || 1
        };
    };

    const log = (message, type = 'info') => {
        const styles = {
            info: 'color: #2196F3',
            success: 'color: #4CAF50',
            warning: 'color: #FF9800',
            error: 'color: #F44336',
            header: 'color: #9C27B0; font-size: 14px; font-weight: bold',
            progress: 'color: #00BCD4; font-weight: bold'
        };
        console.log(`%c${message}`, styles[type] || styles.info);
    };

    const debugLog = (message) => {
        if (globalState.debugMode) {
            console.log(`%c[DEBUG] ${message}`, 'color: #9E9E9E');
        }
    };

    // ファジー検索関数
    const fuzzyMatch = (needle, haystack) => {
        if (!needle || !haystack) return false;

        // 正規化（小文字、スペース削除、特殊文字削除）
        const normalizeString = (str) => {
            return str.toLowerCase()
                     .replace(/[\s\-_\.]/g, '')
                     .replace(/[^\w\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf]/g, '');
        };

        const n = normalizeString(needle);
        const h = normalizeString(haystack);

        // 完全一致
        if (h === n) return { score: 1.0, type: 'exact' };

        // 部分一致
        if (h.includes(n)) return { score: 0.8, type: 'contains' };

        // 文字順序を保持した部分一致
        let j = 0;
        for (let i = 0; i < n.length; i++) {
            const pos = h.indexOf(n[i], j);
            if (pos === -1) return false;
            j = pos + 1;
        }
        return { score: 0.6, type: 'fuzzy' };
    };

    // ========================================
    // DOM検索関数
    // ========================================
    const findElement = async (selectors, condition = null, maxRetries = 3) => {
        const selectorArray = Array.isArray(selectors) ? selectors : [selectors];

        for (let retry = 0; retry < maxRetries; retry++) {
            for (let selector of selectorArray) {
                try {
                    if (typeof selector === 'function') {
                        const elements = selector();
                        if (elements && elements.length > 0) {
                            if (condition) {
                                const filtered = Array.from(elements).filter(condition);
                                if (filtered.length > 0) return filtered[0];
                            } else {
                                return elements[0];
                            }
                        }
                    } else {
                        const elements = document.querySelectorAll(selector);
                        if (elements.length > 0) {
                            if (condition) {
                                const filtered = Array.from(elements).filter(condition);
                                if (filtered.length > 0) return filtered[0];
                            } else {
                                return elements[0];
                            }
                        }
                    }
                } catch (e) {
                    debugLog(`Selector error: ${e.message}`);
                }
            }

            if (retry < maxRetries - 1) {
                await wait(DELAYS.elementSearch);
            }
        }

        return null;
    };

    const waitForMenu = async (checkSelector, maxWait = 3000) => {
        const startTime = Date.now();

        while (Date.now() - startTime < maxWait) {
            const menu = document.querySelector(checkSelector);
            if (menu) {
                debugLog('Menu appeared');
                return menu;
            }
            await wait(100);
        }

        debugLog('Menu wait timeout');
        return null;
    };

    const clickElement = async (element) => {
        if (!element) return false;

        try {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            await wait(200);
            element.click();
            await wait(DELAYS.clickDelay);
            return true;
        } catch (e) {
            debugLog(`Click failed, trying event dispatch: ${e.message}`);
            try {
                const event = new MouseEvent('click', {
                    bubbles: true,
                    cancelable: true,
                    view: window
                });
                element.dispatchEvent(event);
                await wait(DELAYS.clickDelay);
                return true;
            } catch (e2) {
                debugLog(`Event dispatch failed: ${e2.message}`);
                return false;
            }
        }
    };

    // ========================================
    // 動的情報収集
    // ========================================
    const collectAvailableModels = async () => {
        // キャッシュチェック
        if (globalState.modelCache && 
            Date.now() - globalState.modelCacheTime < DELAYS.cacheExpiry) {
            debugLog('Using model cache');
            return globalState.modelCache;
        }

        log('🔍 利用可能なモデルを検索中...', 'info');
        const models = [];

        // モデル選択ボタンを探す
        const modelButton = await findElement([
            '.gds-mode-switch-button',
            '[aria-label*="モデル"]',
            'button:has(.mode-title)',
            () => Array.from(document.querySelectorAll('button')).filter(btn => 
                btn.textContent && (btn.textContent.includes('Flash') || btn.textContent.includes('Pro')))
        ]);

        if (modelButton) {
            // 現在のモデルを記録
            const currentModelText = modelButton.textContent?.trim();
            if (currentModelText) {
                models.push({ name: currentModelText, location: 'current', element: modelButton });
                debugLog(`Current model: ${currentModelText}`);
            }

            // メニューを開く
            await clickElement(modelButton);
            await wait(DELAYS.menuWait);

            // メニュー項目を収集
            const menuItems = document.querySelectorAll('[role="menuitemradio"], [role="menuitem"]');
            menuItems.forEach(item => {
                const text = item.textContent?.trim();
                if (text && !models.find(m => m.name === text)) {
                    models.push({ name: text, location: 'menu', element: item });
                    debugLog(`Found model in menu: ${text}`);
                }
            });

            // メニューを閉じる
            await closeMenu();
        }

        // キャッシュに保存
        globalState.modelCache = models;
        globalState.modelCacheTime = Date.now();

        log(`✅ ${models.length}個のモデルを発見`, 'success');
        return models;
    };

    const collectAvailableFunctions = async () => {
        // キャッシュチェック
        if (globalState.functionCache && 
            Date.now() - globalState.functionCacheTime < DELAYS.cacheExpiry) {
            debugLog('Using function cache');
            return globalState.functionCache;
        }

        const screenInfo = getScreenInfo();
        log(`🔧 利用可能な機能を検索中... (画面サイズ: ${screenInfo.width}x${screenInfo.height})`, 'info');
        const functions = [];
        let hiddenFunctionsCount = 0;

        // メインツールボックスの機能を収集（可視性チェック付き）
        const mainButtons = document.querySelectorAll('.toolbox-drawer-item-button button');
        mainButtons.forEach(button => {
            const text = button.textContent?.trim();
            if (text) {
                const isActive = button.getAttribute('aria-pressed') === 'true';
                const isVisible = isElementVisible(button);
                
                functions.push({
                    name: text,
                    location: isVisible ? 'main' : 'main-hidden',
                    element: button,
                    active: isActive,
                    visible: isVisible
                });
                
                if (!isVisible) {
                    hiddenFunctionsCount++;
                    debugLog(`Found HIDDEN main function: ${text} (active: ${isActive})`);
                } else {
                    debugLog(`Found visible main function: ${text} (active: ${isActive})`);
                }
            }
        });

        // 隠れた機能がある場合、またはその他ボタンが存在する場合はサブメニューを探す
        const shouldCheckSubmenu = hiddenFunctionsCount > 0;
        
        const moreButton = await findElement([
            'button[aria-label="その他"]',
            () => Array.from(document.querySelectorAll('button')).filter(btn => {
                const icon = btn.querySelector('mat-icon[fonticon="more_horiz"], mat-icon[data-mat-icon-name="more_horiz"]');
                return icon !== null;
            })
        ]);

        if (moreButton || shouldCheckSubmenu) {
            if (moreButton) {
                debugLog(`その他ボタンを発見 (可視: ${isElementVisible(moreButton)})`);
                
                // その他メニューを開く
                await clickElement(moreButton);
                await wait(DELAYS.menuWait);

                // メニュー内の機能を収集
                const menuItems = document.querySelectorAll('button[mat-list-item], .toolbox-drawer-item-list-button');
                menuItems.forEach(item => {
                    const text = item.textContent?.trim();
                    if (text && !functions.find(f => f.name === text)) {
                        const isActive = item.getAttribute('aria-pressed') === 'true';
                        functions.push({
                            name: text,
                            location: 'submenu',
                            element: item,
                            active: isActive,
                            visible: true
                        });
                        debugLog(`Found submenu function: ${text} (active: ${isActive})`);
                    }
                });

                // メニューを閉じる
                await closeMenu();
            }
            
            if (shouldCheckSubmenu && !moreButton) {
                debugLog(`${hiddenFunctionsCount}個の非表示機能を検出しましたが、「その他」ボタンが見つかりません`);
            }
        }

        // 統計情報をログ出力
        const visibleCount = functions.filter(f => f.visible !== false).length;
        const hiddenCount = functions.filter(f => f.visible === false).length;
        const submenuCount = functions.filter(f => f.location === 'submenu').length;

        // キャッシュに保存
        globalState.functionCache = functions;
        globalState.functionCacheTime = Date.now();

        log(`✅ ${functions.length}個の機能を発見 (表示中: ${visibleCount}, 非表示: ${hiddenCount}, サブメニュー: ${submenuCount})`, 'success');
        
        // デバッグ情報
        if (globalState.debugMode) {
            log('機能一覧:', 'info');
            functions.forEach(f => {
                const status = f.active ? '[有効]' : '[無効]';
                const visibility = f.visible === false ? '[非表示]' : '[表示中]';
                console.log(`  ${status}${visibility} ${f.name} (${f.location})`);
            });
        }
        
        return functions;
    };

    // ========================================
    // 動的モデル選択（共通ハンドラー使用）
    // ========================================
    const selectModelDynamic = async (searchTerm) => {
        if (!searchTerm) {
            log('検索語を指定してください', 'error');
            return false;
        }
        
        // AIHandlerを使用
        if (!useAIHandler || !menuHandler) {
            log('AIHandlerが利用できません', 'error');
            return false;
        }

        try {
            const result = await menuHandler.selectModel(searchTerm);
            if (result) {
                log(`✅ 共通ハンドラーでモデル「${searchTerm}」を選択しました`, 'success');
                globalState.currentModel = searchTerm;
                return true;
            }
            return false;
        } catch (error) {
            log(`モデル選択エラー: ${error.message}`, 'error');
            return false;
        }
    };

    const selectFunctionDynamic = async (searchTerm, retryCount = 0) => {
        if (!searchTerm) {
            log('検索語を指定してください', 'error');
            return false;
        }
        
        // AIHandlerを使用
        if (!useAIHandler || !menuHandler) {
            log('AIHandlerが利用できません', 'error');
            return false;
        }

        try {
            const result = await menuHandler.selectFunction(searchTerm);
            if (result) {
                log(`✅ 共通ハンドラーで機能「${searchTerm}」を選択しました`, 'success');
                globalState.activeFunctions.push(searchTerm);
                return true;
            }
            return false;
        } catch (error) {
            log(`機能選択エラー: ${error.message}`, 'error');
            return false;
        }
    };

    // メイン機能の選択ヘルパー関数
    const selectFromMain = async (bestMatch) => {
        try {
            await clickElement(bestMatch.element);
            globalState.activeFunctions.push(bestMatch.name);
            
            // Deep Research関連の名前も追加（念のため）
            if (bestMatch.name.toLowerCase().includes('research') || 
                bestMatch.name.toLowerCase().includes('リサーチ')) {
                if (!globalState.activeFunctions.includes('Deep Research')) {
                    globalState.activeFunctions.push('Deep Research');
                    console.log('🔍 Deep Researchをactivefunctionsに追加しました');
                    console.log('現在のactiveFunctions:', globalState.activeFunctions);
                }
            }
            
            log(`✅ 機能「${bestMatch.name}」を有効化しました`, 'success');
            return true;
        } catch (error) {
            debugLog(`メイン機能選択エラー: ${error.message}`);
            return false;
        }
    };

    // サブメニューからの選択ヘルパー関数
    const selectFromSubmenu = async (functionName) => {
        const moreButton = await findElement([
            'button[aria-label="その他"]',
            () => Array.from(document.querySelectorAll('button')).filter(btn => {
                const icon = btn.querySelector('mat-icon[fonticon="more_horiz"]');
                return icon !== null;
            })
        ]);

        if (!moreButton) {
            log(`「その他」ボタンが見つかりません`, 'error');
            return false;
        }

        try {
            await clickElement(moreButton);
            await wait(DELAYS.menuWait);

            // メニュー内で機能を探してクリック
            const menuItems = document.querySelectorAll('button[mat-list-item], .toolbox-drawer-item-list-button');
            let functionSelected = false;
            
            for (let item of menuItems) {
                if (item.textContent?.trim() === functionName) {
                    await clickElement(item);
                    await wait(500);
                    globalState.activeFunctions.push(functionName);
                    
                    // Deep Research関連の名前も追加（念のため）
                    if (functionName.toLowerCase().includes('research') || 
                        functionName.toLowerCase().includes('リサーチ')) {
                        if (!globalState.activeFunctions.includes('Deep Research')) {
                            globalState.activeFunctions.push('Deep Research');
                            console.log('🔍 Deep Researchをactivefunctionsに追加しました（サブメニュー）');
                            console.log('現在のactiveFunctions:', globalState.activeFunctions);
                        }
                    }
                    
                    log(`✅ 機能「${functionName}」を有効化しました（サブメニュー）`, 'success');
                    functionSelected = true;
                    break;
                }
            }

            // メニューを確実に閉じる
            await wait(500);
            await closeMenu();
            log('メニューを閉じました', 'info');
            
            if (!functionSelected) {
                log(`サブメニューで機能「${functionName}」が見つかりませんでした`, 'error');
            }
            
            return functionSelected;
        } catch (error) {
            debugLog(`サブメニュー機能選択エラー: ${error.message}`);
            // エラー時もメニューを閉じる
            await closeMenu();
            return false;
        }
    };

    const clearAllFunctions = async () => {
        log('\n🔧 すべての機能を解除中...', 'header');

        let clearedCount = 0;

        // メインツールボックスの機能を解除
        const mainButtons = document.querySelectorAll('.toolbox-drawer-item-button button');
        for (let button of mainButtons) {
            const isActive = button.getAttribute('aria-pressed') === 'true';
            if (isActive) {
                await clickElement(button);
                await wait(500);
                clearedCount++;
                debugLog(`Cleared: ${button.textContent?.trim()}`);
            }
        }

        // サブメニューの機能を解除
        const moreButton = await findElement([
            'button[aria-label="その他"]',
            () => Array.from(document.querySelectorAll('button')).filter(btn => {
                const icon = btn.querySelector('mat-icon[fonticon="more_horiz"]');
                return icon !== null;
            })
        ]);

        if (moreButton) {
            await clickElement(moreButton);
            await wait(DELAYS.menuWait);

            const menuItems = document.querySelectorAll('button[mat-list-item]');
            for (let item of menuItems) {
                const isActive = item.getAttribute('aria-pressed') === 'true';
                if (isActive) {
                    await clickElement(item);
                    await wait(500);
                    clearedCount++;
                    debugLog(`Cleared: ${item.textContent?.trim()}`);
                }
            }

            await closeMenu(); // メニューを閉じる
        }

        globalState.activeFunctions = [];
        log(`✅ ${clearedCount}個の機能を解除しました`, 'success');
        return true;
    };

    // ========================================
    // テキスト入力・送信関数
    // ========================================
    const inputText = async (text) => {
        const inputField = await findElement([
            '.ql-editor',
            '[contenteditable="true"]',
            '[role="textbox"]',
            '[aria-label*="プロンプト"]'
        ]);

        if (!inputField) {
            log('入力欄が見つかりません', 'error');
            return false;
        }

        // ウィンドウにフォーカスしてからクリック
        window.focus();
        await closeMenu(); // 開いているメニューがあれば閉じる
        inputField.click();
        inputField.focus();
        await wait(500);

        if (inputField.classList.contains('ql-editor')) {
            while (inputField.firstChild) {
                inputField.removeChild(inputField.firstChild);
            }

            const p = document.createElement('p');
            p.textContent = text;
            inputField.appendChild(p);

            inputField.classList.remove('ql-blank');

            inputField.dispatchEvent(new Event('input', { bubbles: true }));
            inputField.dispatchEvent(new Event('change', { bubbles: true }));
        } else {
            inputField.textContent = text;
            inputField.dispatchEvent(new Event('input', { bubbles: true }));
        }

        await wait(DELAYS.submitWait);
        debugLog('Text input completed');
        return true;
    };

    const sendMessage = async () => {
        // 送信前に開いているメニューを閉じる（重要）
        await closeMenu();
        await wait(500);
        
        const sendButton = await findElement([
            '[aria-label="プロンプトを送信"]',
            '.send-button:not(.stop)',
            'button[type="submit"]',
            '[data-testid="send-button"]'
        ]);

        if (!sendButton) {
            log('送信ボタンが見つかりません', 'error');
            return false;
        }

        await clickElement(sendButton);
        await wait(DELAYS.afterSubmit);
        debugLog('Message sent');
        return true;
    };

    const getTextFromScreen = async () => {
        const results = {
            inputText: null,
            canvasText: null,
            latestResponse: null,
            all: null
        };

        debugLog('Getting text from screen');

        const inputField = await findElement([
            '.ql-editor',
            '[contenteditable="true"]',
            '[role="textbox"]'
        ]);

        if (inputField) {
            const text = inputField.textContent?.trim();
            if (text) {
                results.inputText = text;
                debugLog(`Input text: ${text.substring(0, 50)}...`);
            }
        }

        const responseContainers = document.querySelectorAll([
            '.response-container',
            '.conversation-turn',
            '.message-container',
            '.markdown'
        ].join(','));

        if (responseContainers.length > 0) {
            const lastResponse = responseContainers[responseContainers.length - 1];
            const responseText = lastResponse.textContent?.trim();
            if (responseText) {
                results.latestResponse = responseText;
                debugLog(`Response text: ${responseText.substring(0, 50)}...`);
            }
        }

        results.all = results.latestResponse || results.inputText || '';

        return results;
    };

    // ========================================
    // テスト関数
    // ========================================
    const testNormal = async (query = '今日の天気について教えてください', modelSearch = null, clearFunctions = true) => {
        console.clear();
        console.log('%c💬 通常処理テスト開始', 'color: #2196F3; font-size: 18px; font-weight: bold');
        console.log('='.repeat(60));

        try {
            const startTime = Date.now();

            // 機能をクリア（オプション）
            if (clearFunctions) {
                console.log('🔧 すべての機能を解除中...');
                await clearAllFunctions();
                await wait(2000);
                console.log('✅ 通常モードに設定');
            } else {
                console.log('🔧 機能設定を維持します');
            }

            // モデルを選択（指定された場合）
            if (modelSearch) {
                console.log(`🤖 モデル「${modelSearch}」を選択中...`);
                await selectModelDynamic(modelSearch);
                await wait(1000);
            }

            // 質問を入力
            console.log(`📝 入力: "${query}"`);
            if (!await inputText(query)) {
                throw new Error('テキスト入力失敗');
            }

            // 送信
            console.log('📤 送信中...');
            if (!await sendMessage()) {
                throw new Error('送信失敗');
            }

            // Deep Research機能が有効な場合、DeepResearchHandlerを使用
            console.log('🔍 現在のactiveFunctions:', globalState.activeFunctions);
            if (globalState.activeFunctions.includes('Deep Research') || 
                globalState.activeFunctions.some(f => f.toLowerCase().includes('research'))) {
                
                // DeepResearchHandlerが利用可能か確認
                if (window.DeepResearchHandler) {
                    console.log('🔍 DeepResearchハンドラーを使用します');
                    const researchResult = await window.DeepResearchHandler.handle('Gemini', 60);
                    if (researchResult) {
                        console.log('✅ DeepResearch処理完了');
                    } else {
                        console.log('⚠️ DeepResearch処理がタイムアウトしました');
                    }
                } else {
                    console.log('❌ DeepResearchハンドラーが見つかりません');
                    console.log('deepresearch-handler.jsが読み込まれているか確認してください');
                    return { success: false, error: 'DeepResearchHandler not found' };
                }
            }

            // 応答待機
            console.log('⏳ 応答を待機中...');
            let responseReceived = false;
            let waitCount = 0;
            const maxWait = 30;

            while (!responseReceived && waitCount < maxWait) {
                await wait(1000);
                waitCount++;

                const stopButton = document.querySelector('[aria-label="回答を停止"]');
                if (stopButton) {
                    console.log(`    処理中... (${waitCount}秒)`);
                } else if (waitCount > 3) {
                    responseReceived = true;
                }
            }

            // 応答を取得
            await wait(2000);
            const texts = await getTextFromScreen();

            const endTime = Date.now();
            const totalTime = Math.floor((endTime - startTime) / 1000);

            console.log('\n' + '='.repeat(60));

            if (texts.latestResponse) {
                console.log('🤖 AI返答:');
                console.log(texts.latestResponse.substring(0, 500) +
                            (texts.latestResponse.length > 500 ? '...' : ''));
                console.log(`\n📊 統計:`);
                console.log(`    文字数: ${texts.latestResponse.length}文字`);
                console.log(`    応答時間: ${totalTime}秒`);
            } else {
                console.log('⚠️ 応答が取得できませんでした');
            }

            console.log('\n✅ 通常処理テスト完了！');

            return {
                success: true,
                query: query,
                model: modelSearch,
                response: texts.latestResponse,
                responseLength: texts.latestResponse ? texts.latestResponse.length : 0,
                responseTime: totalTime
            };

        } catch (error) {
            console.error('❌ エラー:', error.message);
            return { 
                success: false, 
                query: query,
                model: modelSearch,
                error: error.message 
            };
        }
    };

    const testSpecial = async (functionSearch = 'research', query = null) => {
        console.clear();
        console.log('%c🔬 特殊機能テスト開始', 'color: #FF6B6B; font-size: 18px; font-weight: bold');
        console.log('='.repeat(60));

        try {
            // 機能をクリア
            console.log('🔧 すべての機能を解除中...');
            await clearAllFunctions();
            await wait(2000);

            // 機能を選択
            console.log(`🔧 機能「${functionSearch}」を選択中...`);
            if (!await selectFunctionDynamic(functionSearch)) {
                throw new Error(`機能「${functionSearch}」の選択失敗`);
            }
            console.log('✅ 機能を有効化');

            // クエリがない場合はデフォルトを設定
            if (!query) {
                if (functionSearch.toLowerCase().includes('research')) {
                    query = 'AIの最新動向について調べて';
                } else if (functionSearch.includes('画像')) {
                    query = '美しい夕日の風景';
                } else {
                    query = 'テストクエリ';
                }
            }

            // 入力と送信
            console.log(`📝 入力: "${query}"`);
            if (!await inputText(query)) {
                throw new Error('テキスト入力失敗');
            }

            if (!await sendMessage()) {
                throw new Error('送信失敗');
            }
            console.log('✅ リクエスト送信完了');

            // 応答待機（特殊機能は時間がかかる場合がある）
            console.log('⏳ 処理中...');
            await wait(10000);

            const texts = await getTextFromScreen();

            console.log('\n' + '='.repeat(60));
            console.log('✅ 特殊機能テスト完了！');

            return {
                success: true,
                function: functionSearch,
                query: query,
                response: texts.latestResponse
            };

        } catch (error) {
            console.error('❌ エラー:', error.message);
            return { 
                success: false, 
                function: functionSearch,
                query: query,
                error: error.message 
            };
        }
    };

    // ========================================
    // Deep Research専用の完全版テスト関数
    // ========================================
    const testDeepResearch = async (query = 'AIの最新動向について調査して', maxWaitMinutes = 40) => {
        console.clear();
        console.log('%c🔬 Deep Research 完全版テスト開始', 'color: #4CAF50; font-size: 18px; font-weight: bold');
        console.log('='.repeat(60));

        try {
            const startTime = Date.now();

            // 1. Deep Research機能を有効化
            console.log('🔧 すべての機能を解除中...');
            await clearAllFunctions();
            await wait(2000);

            console.log('🔧 Deep Research機能を選択中...');
            if (!await selectFunctionDynamic('research')) {
                throw new Error('Deep Research選択失敗');
            }
            console.log('✅ Deep Research有効化');

            // 2. テキスト入力と送信
            console.log(`📝 入力: "${query}"`);
            if (!await inputText(query)) {
                throw new Error('テキスト入力失敗');
            }

            if (!await sendMessage()) {
                throw new Error('送信失敗');
            }
            console.log('✅ 送信完了');

            const sendTime = Date.now();

            // 3. DeepResearchHandlerを使用してリサーチ処理
            console.log('\n🔍 DeepResearch処理を開始...');
            
            // DeepResearchHandlerが利用可能か確認
            if (window.DeepResearchHandler) {
                console.log('✅ DeepResearchハンドラーを使用します');
                const researchResult = await window.DeepResearchHandler.handle('Gemini', maxWaitMinutes);
                
                if (researchResult) {
                    console.log('✅ DeepResearch処理完了！');
                } else {
                    console.log('⚠️ DeepResearch処理がタイムアウトしました');
                }
            } else {
                console.log('❌ DeepResearchハンドラーが見つかりません');
                console.log('deepresearch-handler.jsが読み込まれているか確認してください');
                throw new Error('DeepResearchHandler not found');
            }

            // 5. 結果取得
            await wait(3000);
            const texts = await getTextFromScreen();

            console.log('\n' + '='.repeat(60));
            if (texts.latestResponse) {
                console.log('🤖 調査結果:');
                console.log(texts.latestResponse.substring(0, 800) +
                            (texts.latestResponse.length > 800 ? '...' : ''));
                console.log(`\n📈 統計: ${texts.latestResponse.length}文字`);
            }

            console.log('\n✅ Deep Research完了！');
            console.log(`総実行時間: ${Math.floor((Date.now() - startTime) / 60000)}分`);

            return {
                success: true,
                query: query,
                response: texts.latestResponse,
                responseLength: texts.latestResponse ? texts.latestResponse.length : 0,
                totalTime: Math.floor((Date.now() - startTime) / 60000)
            };

        } catch (error) {
            console.error('❌ エラー:', error.message);
            return { 
                success: false, 
                query: query, 
                error: error.message 
            };
        }
    };

    // ========================================
    // 統合実行関数（他のAIと互換性のため）
    // ========================================
    const runAutomation = async (config) => {
        console.log('[Gemini] runAutomation開始', config);
        
        try {
            // 機能をクリア（必要に応じて）
            if (!config.function || config.function === 'none') {
                await clearAllFunctions();
            }
            
            // モデル選択
            if (config.model) {
                await selectModelDynamic(config.model);
                await wait(1000);
                
                // メニューを確実に閉じる
                await closeMenu();
                await wait(500);
            }
            
            // 機能選択
            if (config.function && config.function !== 'none') {
                await selectFunctionDynamic(config.function);
                await wait(1000);
                
                // メニューを確実に閉じる
                await closeMenu();
                await wait(500);
            }
            
            // テキスト入力
            if (config.text) {
                await inputText(config.text);
            }
            
            // 送信
            if (config.send) {
                await sendMessage();
            }
            
            // DeepResearchハンドラーを使用
            if (config.function && 
                (config.function.toLowerCase().includes('research') || 
                 config.function === 'リサーチ' ||
                 config.function === 'Deep Research')) {
                
                if (window.DeepResearchHandler) {
                    console.log('[Gemini] DeepResearchハンドラーを使用');
                    const timeout = config.timeout || 60 * 60 * 1000; // デフォルト60分
                    const maxMinutes = Math.floor(timeout / 60000);
                    await window.DeepResearchHandler.handle('Gemini', maxMinutes);
                } else {
                    console.log('[Gemini] DeepResearchハンドラーが見つかりません');
                }
            } else if (config.waitResponse) {
                // 通常の応答待機
                const timeout = config.timeout || 60000;
                const maxWait = Math.floor(timeout / 1000);
                let responseReceived = false;
                let waitCount = 0;
                
                while (!responseReceived && waitCount < maxWait) {
                    await wait(1000);
                    waitCount++;
                    
                    const stopButton = document.querySelector('[aria-label="回答を停止"]');
                    if (!stopButton && waitCount > 3) {
                        responseReceived = true;
                    }
                }
            }
            
            // 応答取得
            let response = null;
            if (config.getResponse) {
                await wait(2000);
                const texts = await getTextFromScreen();
                response = texts.latestResponse;
            }
            
            return {
                success: true,
                model: config.model,
                function: config.function,
                text: config.text,
                response: response
            };
            
        } catch (error) {
            console.error('[Gemini] runAutomation エラー:', error);
            return {
                success: false,
                error: error.message
            };
        }
    };

    // ========================================
    // API公開
    // ========================================
    window.Gemini = {
        // 動的検索系
        model: selectModelDynamic,
        func: selectFunctionDynamic,
        runAutomation,  // 追加
        listModels: async () => {
            const models = await collectAvailableModels();
            console.log('\n📋 利用可能なモデル:');
            models.forEach((m, i) => console.log(`  ${i + 1}. ${m.name}`));
            return models.map(m => m.name);
        },
        getAvailableModels: async () => {
            // 他のAI（ChatGPT、Claude）との統一API
            const models = await collectAvailableModels();
            console.log('\n📋 利用可能なモデル:');
            models.forEach((m, i) => console.log(`  ${i + 1}. ${m.name} (${m.location})`));
            return models; // 完全なオブジェクトを返す
        },
        listFunctions: async () => {
            const functions = await collectAvailableFunctions();
            console.log('\n📋 利用可能な機能:');
            functions.forEach((f, i) => console.log(`  ${i + 1}. ${f.name} (${f.location})`));
            return functions.map(f => f.name);
        },
        getAvailableFunctions: async () => {
            // 他のAI（ChatGPT、Claude）との統一API
            const functions = await collectAvailableFunctions();
            console.log('\n📋 利用可能な機能:');
            functions.forEach((f, i) => console.log(`  ${i + 1}. ${f.name} (${f.location})`));
            return functions; // 完全なオブジェクトを返す
        },

        // テスト系
        testNormal,
        testSpecial,
        testDeepResearch, // Deep Research完全版

        // ユーティリティ
        clearFunctions: clearAllFunctions,
        clearCache: () => {
            globalState.modelCache = null;
            globalState.functionCache = null;
            globalState.modelCacheTime = null;
            globalState.functionCacheTime = null;
            log('✅ キャッシュをクリアしました', 'success');
        },
        setDebug: (enabled) => {
            globalState.debugMode = enabled;
            log(`デバッグモード: ${enabled ? 'ON' : 'OFF'}`, 'info');
        },
        
        // デバッグ・診断機能
        diagnose: async () => {
            console.clear();
            log('🔧 Gemini UI診断開始', 'header');
            console.log('='.repeat(60));
            
            const screenInfo = getScreenInfo();
            log(`📱 画面情報: ${screenInfo.width}x${screenInfo.height} (ratio: ${screenInfo.devicePixelRatio})`, 'info');
            
            // ツールボックス診断
            log('\n🔍 ツールボックス診断:', 'header');
            const toolboxContainer = document.querySelector('.toolbox-drawer, .toolbox-container');
            if (toolboxContainer) {
                const rect = toolboxContainer.getBoundingClientRect();
                log(`ツールボックス要素: 発見 (${rect.width}x${rect.height})`, 'success');
            } else {
                log('ツールボックス要素: 見つかりません', 'error');
            }
            
            // メイン機能ボタン診断
            const mainButtons = document.querySelectorAll('.toolbox-drawer-item-button button');
            log(`\n🎯 メイン機能ボタン診断: ${mainButtons.length}個発見`, 'info');
            mainButtons.forEach((btn, i) => {
                const text = btn.textContent?.trim();
                const isVisible = isElementVisible(btn);
                const isActive = btn.getAttribute('aria-pressed') === 'true';
                const rect = btn.getBoundingClientRect();
                
                const status = isActive ? '[有効]' : '[無効]';
                const visibility = isVisible ? '[表示]' : '[非表示]';
                log(`  ${i + 1}. ${status}${visibility} "${text}" (${rect.width.toFixed(0)}x${rect.height.toFixed(0)})`, 
                    isVisible ? 'success' : 'warning');
            });
            
            // その他ボタン診断
            log('\n📂 その他ボタン診断:', 'info');
            const moreButtons = document.querySelectorAll('button').values();
            let moreButtonFound = false;
            
            for (const btn of moreButtons) {
                const icon = btn.querySelector('mat-icon[fonticon="more_horiz"], mat-icon[data-mat-icon-name="more_horiz"]');
                if (icon) {
                    const isVisible = isElementVisible(btn);
                    const rect = btn.getBoundingClientRect();
                    log(`その他ボタン: 発見 ${isVisible ? '[表示]' : '[非表示]'} (${rect.width.toFixed(0)}x${rect.height.toFixed(0)})`, 
                        isVisible ? 'success' : 'warning');
                    moreButtonFound = true;
                    break;
                }
            }
            
            if (!moreButtonFound) {
                log('その他ボタン: 見つかりません', 'error');
            }
            
            // 現在の状態表示
            log('\n📊 現在の状態:', 'info');
            log(`有効な機能: ${globalState.activeFunctions.join(', ') || 'なし'}`, 'info');
            log(`モデルキャッシュ: ${globalState.modelCache ? `${globalState.modelCache.length}個` : 'なし'}`, 'info');
            log(`機能キャッシュ: ${globalState.functionCache ? `${globalState.functionCache.length}個` : 'なし'}`, 'info');
            
            console.log('\n' + '='.repeat(60));
            log('✅ 診断完了', 'success');
        },
        
        // ========================================
        // 自動変更検出システム
        // ========================================
        startChangeDetection: (options = {}) => {
            const {
                enableDOMObserver = true,
                enablePeriodicCheck = true,
                checkInterval = 30000 // 30秒
            } = options;

            if (globalState.changeDetectionEnabled) {
                log('変更検出は既に有効です', 'warning');
                return;
            }

            log('🔍 Gemini変更検出システムを開始します', 'info');
            
            globalState.changeDetectionEnabled = true;
            
            // 初期状態を記録
            geminiPeriodicCheck();
            
            // DOM監視開始
            if (enableDOMObserver) {
                setupGeminiDOMObserver();
                log('DOM変更監視を開始しました', 'info');
            }
            
            // 定期チェック開始
            if (enablePeriodicCheck) {
                globalState.changeDetectionInterval = setInterval(geminiPeriodicCheck, checkInterval);
                log(`定期チェックを開始しました (${checkInterval/1000}秒間隔)`, 'info');
            }
        },

        stopChangeDetection: () => {
            if (!globalState.changeDetectionEnabled) {
                log('変更検出は無効です', 'warning');
                return;
            }

            log('🛑 Gemini変更検出システムを停止します', 'info');
            
            globalState.changeDetectionEnabled = false;
            
            // DOM監視停止
            if (globalState.changeDetectionObserver) {
                globalState.changeDetectionObserver.disconnect();
                globalState.changeDetectionObserver = null;
            }
            
            // 定期チェック停止
            if (globalState.changeDetectionInterval) {
                clearInterval(globalState.changeDetectionInterval);
                globalState.changeDetectionInterval = null;
            }
            
            // デバウンスタイマークリア
            if (globalState.changeDetectionDebounceTimer) {
                clearTimeout(globalState.changeDetectionDebounceTimer);
                globalState.changeDetectionDebounceTimer = null;
            }
        },

        onModelChange: (callback) => {
            if (typeof callback === 'function') {
                if (!globalState.modelChangeCallbacks) {
                    globalState.modelChangeCallbacks = [];
                }
                globalState.modelChangeCallbacks.push(callback);
                log('モデル変更コールバックを登録しました', 'info');
            }
        },

        onFunctionChange: (callback) => {
            if (typeof callback === 'function') {
                if (!globalState.functionChangeCallbacks) {
                    globalState.functionChangeCallbacks = [];
                }
                globalState.functionChangeCallbacks.push(callback);
                log('機能変更コールバックを登録しました', 'info');
            }
        },

        forceCheck: async () => {
            log('🔍 強制チェックを実行中...', 'info');
            await geminiPeriodicCheck();
            log('✅ 強制チェック完了', 'success');
        },

        getChangeDetectionState: () => ({
            enabled: globalState.changeDetectionEnabled || false,
            lastModelsHash: globalState.lastModelsHash || null,
            lastFunctionsHash: globalState.lastFunctionsHash || null,
            callbackCounts: {
                models: globalState.modelChangeCallbacks ? globalState.modelChangeCallbacks.length : 0,
                functions: globalState.functionChangeCallbacks ? globalState.functionChangeCallbacks.length : 0
            }
        }),
        
        getScreenInfo,
        isElementVisible: (selector) => {
            const element = typeof selector === 'string' ? document.querySelector(selector) : selector;
            return isElementVisible(element);
        },
        inputText,
        send: sendMessage,
        getText: getTextFromScreen,

        // ヘルプ
        help: () => {
            console.log('\n%c🚀 Gemini 動的テストツール v2.0', 'color: #4CAF50; font-size: 16px; font-weight: bold');
            console.log('━'.repeat(50));
            console.log('\n%c📌 基本コマンド:', 'color: #2196F3; font-weight: bold');
            console.log('');
            console.log('【情報取得】');
            console.log('  await Gemini.listModels()    // 利用可能なモデル一覧');
            console.log('  await Gemini.getAvailableModels() // 利用可能なモデル一覧（統一API）');
            console.log('  await Gemini.listFunctions() // 利用可能な機能一覧');
            console.log('  await Gemini.getAvailableFunctions() // 利用可能な機能一覧（統一API）');
            console.log('');
            console.log('【動的選択】');
            console.log('  await Gemini.model("Flash")  // モデルを検索・選択');
            console.log('  await Gemini.model("Pro")    // Proモデルを選択');
            console.log('  await Gemini.func("画像")    // 機能を検索・選択');
            console.log('  await Gemini.func("research")// Research機能を選択');
            console.log('');
            console.log('【テスト実行】');
            console.log('  await Gemini.testNormal()    // 通常処理テスト');
            console.log('  await Gemini.testNormal("質問", "Pro")  // Proモデルでテスト');
            console.log('  await Gemini.testSpecial("research")    // 特殊機能テスト（簡易版）');
            console.log('  await Gemini.testDeepResearch()         // Deep Research完全版テスト');
            console.log('  await Gemini.testDeepResearch("調査内容", 30)  // 最大30分待機');
            console.log('  await Gemini.testSpecial("画像", "夕日") // 画像生成テスト');
            console.log('');
            console.log('【手動操作】');
            console.log('  await Gemini.clearFunctions()// すべての機能を解除');
            console.log('  await Gemini.inputText("テキスト")  // テキスト入力');
            console.log('  await Gemini.send()          // 送信');
            console.log('  await Gemini.getText()       // 画面のテキスト取得');
            console.log('');
            console.log('【デバッグ・診断】');
            console.log('  Gemini.setDebug(true)        // デバッグモードON');
            console.log('  Gemini.clearCache()          // キャッシュクリア');
            console.log('  await Gemini.diagnose()      // UI診断実行');
            console.log('  Gemini.getScreenInfo()       // 画面情報取得');
            console.log('  Gemini.isElementVisible("selector") // 要素可視性チェック');
            console.log('');
            console.log('%c💡 ヒント:', 'color: #FF9800; font-weight: bold');
            console.log('  - ファジー検索対応: "res" → "Deep Research"');
            console.log('  - 部分一致OK: "画像" → "画像 Imagen で生成"');
            console.log('  - Deep Researchは最大40分待機可能');
            console.log('  - 5分間のキャッシュで高速動作');
            console.log('  - 画面サイズ変更時は自動で「その他」メニューもチェック');
            console.log('  - 機能選択失敗時は自動リトライ（最大3回）');
        }
    };

    // ========================================
    // 変更検出用ヘルパー関数
    // ========================================
    
    // ハッシュ生成関数
    const generateHash = (data) => {
        return JSON.stringify(data).split('').reduce((a, b) => {
            a = ((a << 5) - a) + b.charCodeAt(0);
            return a & a;
        }, 0);
    };

    // モデル変更検出
    const detectGeminiModelChanges = async () => {
        try {
            const currentModels = await collectAvailableModels();
            const currentHash = generateHash(currentModels.map(m => m.name));
            
            if (globalState.lastModelsHash !== null && 
                globalState.lastModelsHash !== currentHash) {
                
                log('🔄 モデル変更を検出しました', 'warning');
                
                // コールバック実行
                if (globalState.modelChangeCallbacks) {
                    globalState.modelChangeCallbacks.forEach(callback => {
                        try {
                            callback(currentModels);
                        } catch (error) {
                            log(`モデル変更コールバックエラー: ${error.message}`, 'error');
                        }
                    });
                }
                
                // イベント発火
                window.dispatchEvent(new CustomEvent('gemini-models-changed', {
                    detail: { models: currentModels }
                }));
            }
            
            globalState.lastModelsHash = currentHash;
        } catch (error) {
            debugLog(`モデル変更検出エラー: ${error.message}`);
        }
    };

    // 機能変更検出
    const detectGeminiFunctionChanges = async () => {
        try {
            const currentFunctions = await collectAvailableFunctions();
            const currentHash = generateHash(currentFunctions.map(f => f.name));
            
            if (globalState.lastFunctionsHash !== null && 
                globalState.lastFunctionsHash !== currentHash) {
                
                log('🔄 機能変更を検出しました', 'warning');
                
                // コールバック実行
                if (globalState.functionChangeCallbacks) {
                    globalState.functionChangeCallbacks.forEach(callback => {
                        try {
                            callback(currentFunctions);
                        } catch (error) {
                            log(`機能変更コールバックエラー: ${error.message}`, 'error');
                        }
                    });
                }
                
                // イベント発火
                window.dispatchEvent(new CustomEvent('gemini-functions-changed', {
                    detail: { functions: currentFunctions }
                }));
            }
            
            globalState.lastFunctionsHash = currentHash;
        } catch (error) {
            debugLog(`機能変更検出エラー: ${error.message}`);
        }
    };

    // 定期チェック関数
    const geminiPeriodicCheck = async () => {
        await detectGeminiModelChanges();
        await detectGeminiFunctionChanges();
    };

    // DOM変更監視
    const setupGeminiDOMObserver = () => {
        if (globalState.changeDetectionObserver) {
            globalState.changeDetectionObserver.disconnect();
        }

        globalState.changeDetectionObserver = new MutationObserver((mutations) => {
            let shouldCheck = false;
            
            mutations.forEach(mutation => {
                // Gemini特有のセレクタ監視
                if (mutation.target.matches && (
                    mutation.target.matches('.gds-mode-switch-button') ||
                    mutation.target.matches('.toolbox-drawer-item-button') ||
                    mutation.target.matches('[aria-label*="その他"]') ||
                    mutation.target.matches('[role="menuitemradio"]') ||
                    mutation.target.matches('[role="menuitem"]') ||
                    mutation.target.matches('[mat-list-item]')
                )) {
                    shouldCheck = true;
                }
                
                // 追加/削除されたノードをチェック
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        if (node.querySelector && (
                            node.querySelector('.gds-mode-switch-button') ||
                            node.querySelector('.toolbox-drawer-item-button') ||
                            node.querySelector('[aria-label*="その他"]') ||
                            node.querySelector('[role="menuitemradio"]')
                        )) {
                            shouldCheck = true;
                        }
                    }
                });
            });
            
            if (shouldCheck) {
                // デバウンス処理（500ms後に実行）
                clearTimeout(globalState.changeDetectionDebounceTimer);
                globalState.changeDetectionDebounceTimer = setTimeout(() => {
                    geminiPeriodicCheck();
                }, 500);
            }
        });

        // body要素全体を監視
        globalState.changeDetectionObserver.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['aria-label', 'aria-pressed', 'mat-list-item', 'role']
        });
    };

    // ========================================
    // 初期化
    // ========================================
    function initialize() {
        // AIHandlerの初期化
        if (useAIHandler) {
            menuHandler = window.AIHandler.menuHandler || new window.AIHandler.MenuHandler();
            console.log('✅ AIHandlerを初期化しました');
        } else {
            console.log('AIHandlerが利用できません、従来の方法を使用します');
        }
    }
    
    // 初期化実行
    initialize();
    
    // ========================================
    // 初期化メッセージ
    // ========================================
    console.log('%c✅ Gemini 動的テストツール v2.0 初期化完了！', 'color: #4CAF50; font-size: 16px; font-weight: bold');
    console.log('');
    console.log('%c🎯 クイックスタート:', 'color: #FF6B6B; font-size: 14px; font-weight: bold');
    console.log('');
    console.log('%c【すぐ試せるコマンド】', 'color: #2196F3; font-weight: bold');
    console.log('await Gemini.listModels()      // 利用可能なモデルを確認');
    console.log('await Gemini.getAvailableModels() // 利用可能なモデルを確認（統一API）');
    console.log('await Gemini.listFunctions()   // 利用可能な機能を確認');
    console.log('await Gemini.getAvailableFunctions() // 利用可能な機能を確認（統一API）');
    console.log('');
    console.log('await Gemini.testNormal()      // 通常処理をテスト');
    console.log('await Gemini.testNormal("こんにちは", "Pro")  // Proモデルでテスト');
    console.log('');
    console.log('await Gemini.testDeepResearch()// Deep Research完全版テスト（最大40分）');
    console.log('await Gemini.testDeepResearch("AIの歴史", 20)  // 最大20分待機');
    console.log('');
    console.log('await Gemini.testSpecial("画像", "美しい風景")  // 画像生成テスト');
    console.log('');
    console.log('%c💡 Gemini.help() で詳細ヘルプを表示', 'color: #9C27B0');
    console.log('%c👆 上記のコマンドをコピーして使ってください', 'color: #F44336; font-size: 12px');
    
})();