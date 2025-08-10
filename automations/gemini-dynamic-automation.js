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

    // ========================================
    // ユーティリティ関数
    // ========================================
    const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

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
            document.body.click();
            await wait(500);
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

        log('🔧 利用可能な機能を検索中...', 'info');
        const functions = [];

        // メインツールボックスの機能を収集
        const mainButtons = document.querySelectorAll('.toolbox-drawer-item-button button');
        mainButtons.forEach(button => {
            const text = button.textContent?.trim();
            if (text) {
                const isActive = button.getAttribute('aria-pressed') === 'true';
                functions.push({
                    name: text,
                    location: 'main',
                    element: button,
                    active: isActive
                });
                debugLog(`Found main function: ${text} (active: ${isActive})`);
            }
        });

        // サブメニュー（その他）を探す
        const moreButton = await findElement([
            'button[aria-label="その他"]',
            () => Array.from(document.querySelectorAll('button')).filter(btn => {
                const icon = btn.querySelector('mat-icon[fonticon="more_horiz"], mat-icon[data-mat-icon-name="more_horiz"]');
                return icon !== null;
            })
        ]);

        if (moreButton) {
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
                        active: isActive
                    });
                    debugLog(`Found submenu function: ${text} (active: ${isActive})`);
                }
            });

            // メニューを閉じる
            document.body.click();
            await wait(500);
        }

        // キャッシュに保存
        globalState.functionCache = functions;
        globalState.functionCacheTime = Date.now();

        log(`✅ ${functions.length}個の機能を発見`, 'success');
        return functions;
    };

    // ========================================
    // 動的選択関数
    // ========================================
    const selectModelDynamic = async (searchTerm) => {
        if (!searchTerm) {
            log('検索語を指定してください', 'error');
            return false;
        }

        log(`\n🤖 モデル「${searchTerm}」を検索中...`, 'header');

        const models = await collectAvailableModels();

        // ファジー検索で最適なモデルを探す
        let bestMatch = null;
        let bestScore = 0;

        models.forEach(model => {
            const match = fuzzyMatch(searchTerm, model.name);
            if (match && match.score > bestScore) {
                bestScore = match.score;
                bestMatch = model;
            }
        });

        if (bestMatch) {
            log(`✅ モデル「${bestMatch.name}」を発見 (スコア: ${bestScore.toFixed(2)})`, 'success');

            // モデル選択ボタンをクリック
            const modelButton = await findElement([
                '.gds-mode-switch-button',
                '[aria-label*="モデル"]'
            ]);

            if (modelButton) {
                await clickElement(modelButton);
                await wait(DELAYS.menuWait);

                // メニューから選択
                const menuItems = document.querySelectorAll('[role="menuitemradio"], [role="menuitem"]');
                for (let item of menuItems) {
                    if (item.textContent?.trim() === bestMatch.name) {
                        await clickElement(item);
                        globalState.currentModel = bestMatch.name;
                        log(`✅ モデル「${bestMatch.name}」を選択しました`, 'success');
                        return true;
                    }
                }

                // メニューを閉じる
                document.body.click();
            }
        } else {
            log(`❌ モデル「${searchTerm}」が見つかりません`, 'error');
            log('利用可能なモデル:', 'info');
            models.forEach(m => console.log(`  - ${m.name}`));
        }

        return false;
    };

    const selectFunctionDynamic = async (searchTerm) => {
        if (!searchTerm) {
            log('検索語を指定してください', 'error');
            return false;
        }

        log(`\n🔧 機能「${searchTerm}」を検索中...`, 'header');

        const functions = await collectAvailableFunctions();

        // ファジー検索で最適な機能を探す
        let bestMatch = null;
        let bestScore = 0;

        functions.forEach(func => {
            const match = fuzzyMatch(searchTerm, func.name);
            if (match && match.score > bestScore) {
                bestScore = match.score;
                bestMatch = func;
            }
        });

        if (bestMatch) {
            log(`✅ 機能「${bestMatch.name}」を発見 (場所: ${bestMatch.location}, スコア: ${bestScore.toFixed(2)})`, 'success');

            if (bestMatch.active) {
                log(`機能「${bestMatch.name}」は既に有効です`, 'info');
                return true;
            }

            if (bestMatch.location === 'main') {
                // メイン機能
                await clickElement(bestMatch.element);
                globalState.activeFunctions.push(bestMatch.name);
                log(`✅ 機能「${bestMatch.name}」を有効化しました`, 'success');
                return true;
            } else if (bestMatch.location === 'submenu') {
                // サブメニューの機能
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

                    // メニュー内で機能を探してクリック
                    const menuItems = document.querySelectorAll('button[mat-list-item], .toolbox-drawer-item-list-button');
                    for (let item of menuItems) {
                        if (item.textContent?.trim() === bestMatch.name) {
                            await clickElement(item);
                            await wait(500);
                            document.body.click(); // メニューを閉じる
                            globalState.activeFunctions.push(bestMatch.name);
                            log(`✅ 機能「${bestMatch.name}」を有効化しました`, 'success');
                            return true;
                        }
                    }

                    document.body.click(); // メニューを閉じる
                }
            }
        } else {
            log(`❌ 機能「${searchTerm}」が見つかりません`, 'error');
            log('利用可能な機能:', 'info');
            functions.forEach(f => console.log(`  - ${f.name} (${f.location})`));
        }

        return false;
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

            document.body.click(); // メニューを閉じる
            await wait(500);
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
    const testNormal = async (query = '今日の天気について教えてください', modelSearch = null) => {
        console.clear();
        console.log('%c💬 通常処理テスト開始', 'color: #2196F3; font-size: 18px; font-weight: bold');
        console.log('='.repeat(60));

        try {
            const startTime = Date.now();

            // 機能をクリア
            console.log('🔧 すべての機能を解除中...');
            await clearAllFunctions();
            await wait(2000);
            console.log('✅ 通常モードに設定');

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

            // 3. リサーチ計画画面の検出と処理
            console.log('\n📋 リサーチ計画画面を待機中...');
            let researchStartClicked = false;
            const planWaitSeconds = 300; // 5分間待機
            const planStartTime = Date.now();

            while (Date.now() - planStartTime < planWaitSeconds * 1000 && !researchStartClicked) {
                // 複数の方法でボタンを探す
                let researchBtn = await findElement([
                    'button[aria-label="リサーチを開始"]',
                    'button[data-test-id="confirm-button"]',
                    () => {
                        const buttons = document.querySelectorAll('button');
                        for (let btn of buttons) {
                            const text = btn.textContent?.trim();
                            if (text && text.includes('リサーチを開始')) {
                                return [btn];
                            }
                        }
                        return [];
                    }
                ], null, 1);

                if (researchBtn) {
                    console.log('\n🎯 「リサーチを開始」ボタンを検出！');
                    console.log(`  経過時間: ${Math.floor((Date.now() - planStartTime) / 1000)}秒`);
                    await clickElement(researchBtn);
                    researchStartClicked = true;
                    console.log('✅ リサーチを開始しました！');
                    await wait(3000);
                    break;
                }

                // 既に処理中の可能性をチェック
                const stopBtn = document.querySelector('[aria-label="回答を停止"]');
                if (stopBtn) {
                    console.log('📝 リサーチが既に開始されています');
                    break;
                }

                await wait(2000);
            }

            // 4. メイン処理ループ（長時間待機と進捗表示）
            console.log('\n⏳ Deep Research処理中...');
            console.log('📝 最初の5分は「リサーチを開始」ボタンを探す');
            console.log('📝 5分後は停止ボタンが5秒消えたら完了');
            console.log('='.repeat(60));

            let elapsedMinutes = 0;
            let noStopButtonSeconds = 0;

            // 進捗表示関数
            const showProgress = (min) => {
                const remain = maxWaitMinutes - min;
                console.log(`\n⏳ [${new Date().toLocaleTimeString()}]`);
                log(`    処理中... ${min}分経過`, 'progress');
                log(`    残り最大${remain}分`, 'progress');
                const progressBar = '▓'.repeat(Math.floor(min * 1.5)) + '░'.repeat(Math.floor(remain * 1.5));
                console.log('    ' + progressBar.substring(0, 60));
            };

            showProgress(0);

            // メインループ：1秒ごとにチェック
            for (let seconds = 0; seconds < maxWaitMinutes * 60; seconds++) {
                await wait(1000);

                const elapsed = (Date.now() - sendTime) / 1000;
                const isFirstFiveMinutes = elapsed < 300; // 300秒 = 5分

                // 最初の5分間：追加のリサーチボタンを探す
                if (isFirstFiveMinutes && !researchStartClicked) {
                    const researchBtn = await findElement([
                        'button[aria-label="リサーチを開始"]',
                        'button[data-test-id="confirm-button"]'
                    ], null, 1);

                    if (researchBtn) {
                        console.log('\n🎯 「リサーチを開始」ボタンを発見！');
                        await clickElement(researchBtn);
                        researchStartClicked = true;
                        await wait(3000);
                        continue;
                    }
                }

                // 停止ボタンチェック
                const stopBtn = document.querySelector('[aria-label="回答を停止"]');

                if (stopBtn) {
                    // 停止ボタンあり = 処理中
                    noStopButtonSeconds = 0;

                    // 5分ごとに進捗表示
                    const currentMinutes = Math.floor(seconds / 60);
                    if (currentMinutes > 0 && currentMinutes % 5 === 0 && currentMinutes !== elapsedMinutes) {
                        elapsedMinutes = currentMinutes;
                        showProgress(elapsedMinutes);
                    }
                } else {
                    // 停止ボタンなし
                    if (isFirstFiveMinutes) {
                        // 最初の5分：待機継続
                        if (seconds % 10 === 0) {
                            debugLog('Waiting for research plan or processing...');
                        }
                    } else {
                        // 5分後：5秒カウント
                        noStopButtonSeconds++;

                        if (noStopButtonSeconds >= 5) {
                            // 5秒間停止ボタンなし = 完了
                            const totalMinutes = Math.floor((Date.now() - startTime) / 60000);
                            console.log('\n' + '='.repeat(60));
                            console.log(`🎉 Deep Research完了！`);
                            console.log(`⏱️ 総時間: ${totalMinutes}分`);
                            break;
                        } else {
                            debugLog(`No stop button (${noStopButtonSeconds}/5)`);
                        }
                    }
                }
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
    // API公開
    // ========================================
    window.Gemini = {
        // 動的検索系
        model: selectModelDynamic,
        func: selectFunctionDynamic,
        listModels: async () => {
            const models = await collectAvailableModels();
            console.log('\n📋 利用可能なモデル:');
            models.forEach((m, i) => console.log(`  ${i + 1}. ${m.name}`));
            return models.map(m => m.name);
        },
        listFunctions: async () => {
            const functions = await collectAvailableFunctions();
            console.log('\n📋 利用可能な機能:');
            functions.forEach((f, i) => console.log(`  ${i + 1}. ${f.name} (${f.location})`));
            return functions.map(f => f.name);
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
            console.log('  await Gemini.listFunctions() // 利用可能な機能一覧');
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
            console.log('【デバッグ】');
            console.log('  Gemini.setDebug(true)        // デバッグモードON');
            console.log('  Gemini.clearCache()          // キャッシュクリア');
            console.log('');
            console.log('%c💡 ヒント:', 'color: #FF9800; font-weight: bold');
            console.log('  - ファジー検索対応: "res" → "Deep Research"');
            console.log('  - 部分一致OK: "画像" → "画像 Imagen で生成"');
            console.log('  - Deep Researchは最大40分待機可能');
            console.log('  - 5分間のキャッシュで高速動作');
        }
    };

    // ========================================
    // 初期化メッセージ
    // ========================================
    console.log('%c✅ Gemini 動的テストツール v2.0 初期化完了！', 'color: #4CAF50; font-size: 16px; font-weight: bold');
    console.log('');
    console.log('%c🎯 クイックスタート:', 'color: #FF6B6B; font-size: 14px; font-weight: bold');
    console.log('');
    console.log('%c【すぐ試せるコマンド】', 'color: #2196F3; font-weight: bold');
    console.log('await Gemini.listModels()      // 利用可能なモデルを確認');
    console.log('await Gemini.listFunctions()   // 利用可能な機能を確認');
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