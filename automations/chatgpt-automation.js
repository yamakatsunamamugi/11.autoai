/**
 * @fileoverview ChatGPT Automation V2 - 統合版
 *
 * 【ステップ構成】
 * ステップ0: 初期化（UI_SELECTORS読み込み）
 * ステップ1: ページ準備状態チェック
 * ステップ2: テキスト入力
 * ステップ3: モデル選択（条件付き）
 * ステップ4: 機能選択（条件付き）
 * ステップ5: メッセージ送信
 * ステップ6: 応答待機（通常/特別モード）
 * ステップ7: テキスト取得
 *
 * @version 3.0.0
 * @updated 2024-12-14 ステップ番号体系統一、コード整理
 */
(async function() {
    'use strict';

    console.log(`ChatGPT Automation V2 - 初期化時刻: ${new Date().toLocaleString('ja-JP')}`);

    // 統一された待機時間設定を取得（Claudeと同じ方式）
    const AI_WAIT_CONFIG = window.AI_WAIT_CONFIG || {
        DEEP_RESEARCH_WAIT: 2400000, // 40分
        NORMAL_WAIT: 300000,         // 5分
        STOP_BUTTON_WAIT: 30000,     // 30秒
        CHECK_INTERVAL: 2000,        // 2秒
        MICRO_WAIT: 100,            // 100ms
        TINY_WAIT: 500,             // 500ms
        SHORT_WAIT: 1000,           // 1秒
        MEDIUM_WAIT: 2000,          // 2秒
        LONG_WAIT: 3000             // 3秒
    };

    // ========================================
    // ステップ0: UI_SELECTORSをJSONから読み込み（Claude方式）
    // ========================================
    let UI_SELECTORS = window.UI_SELECTORS || {};
    let selectorsLoaded = false;

    const loadSelectors = async () => {
        if (selectorsLoaded) return UI_SELECTORS;

        try {
            const response = await fetch(chrome.runtime.getURL('ui-selectors-data.json'));
            const data = await response.json();
            UI_SELECTORS = data.selectors;
            window.UI_SELECTORS = UI_SELECTORS;
            selectorsLoaded = true;
            log('【ステップ0-1】✅ UI Selectors loaded from JSON', 'success');
            return UI_SELECTORS;
        } catch (error) {
            log('【ステップ0-2】❌ Failed to load ui-selectors-data.json: ' + error.message, 'error');
            // フォールバックとしてwindow.UI_SELECTORSを使用
            UI_SELECTORS = window.UI_SELECTORS || {};
            selectorsLoaded = true;
            return UI_SELECTORS;
        }
    };

    // セレクタを読み込み
    await loadSelectors();

    // ChatGPT用セレクタを取得
    const SELECTORS = {
        modelButton: UI_SELECTORS.ChatGPT?.MODEL_BUTTON || [],
        modelMenu: UI_SELECTORS.ChatGPT?.MENU?.CONTAINER || [],
        menuButton: UI_SELECTORS.ChatGPT?.FUNCTION_MENU_BUTTON || [],
        mainMenu: UI_SELECTORS.ChatGPT?.MENU?.CONTAINER || [],
        subMenu: UI_SELECTORS.ChatGPT?.MENU?.SUBMENU_TRIGGERS || [],
        textInput: UI_SELECTORS.ChatGPT?.INPUT || [],
        sendButton: UI_SELECTORS.ChatGPT?.SEND_BUTTON || [],
        stopButton: UI_SELECTORS.ChatGPT?.STOP_BUTTON || [],
        canvasText: UI_SELECTORS.ChatGPT?.TEXT_EXTRACTION?.CANVAS_ARTIFACT || [],
        normalText: UI_SELECTORS.ChatGPT?.MESSAGE || [],
        menuItem: UI_SELECTORS.ChatGPT?.MENU_ITEM || [],
        response: UI_SELECTORS.ChatGPT?.RESPONSE || []
    };
    
    // ========================================
    // ユーティリティ関数（テストコードより）
    // ========================================
    
    // 待機関数
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    // 通常モードの待機処理
    async function standardWaitForResponse() {
        // 停止ボタンが表示されるまで待機
        let stopBtn = null;
        for (let i = 0; i < 30; i++) {
            stopBtn = await findElement(SELECTORS.stopButton, 1);
            if (stopBtn) {
                log('【ステップ6-1】停止ボタンが表示されました', 'success');
                break;
            }
            await sleep(AI_WAIT_CONFIG.SHORT_WAIT);
        }

        // 停止ボタンが消えるまで待機（最大5分）
        if (stopBtn) {
            log('【ステップ6-2】停止ボタンが消えるまで待機（最大5分）', 'info');
            for (let i = 0; i < 300; i++) {
                stopBtn = await findElement(SELECTORS.stopButton, 1);
                if (!stopBtn) {
                    log('【ステップ6-2】応答完了', 'success');
                    break;
                }
                if (i % 30 === 0 && i > 0) {
                    const minutes = Math.floor(i / 60);
                    const seconds = i % 60;
                    log(`応答待機中... (${minutes}分${seconds}秒経過)`, 'info');
                }
                await sleep(AI_WAIT_CONFIG.SHORT_WAIT);
            }
        }
    }
    
    // ログ出力
    function log(message, type = 'info') {
        const timestamp = new Date().toLocaleTimeString('ja-JP', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const prefix = `[${timestamp}]`;
        
        switch(type) {
            case 'error':
                console.error(`${prefix} ❌ ${message}`);
                break;
            case 'success':
                console.log(`${prefix} ✅ ${message}`);
                break;
            case 'warning':
                console.warn(`${prefix} ⚠️ ${message}`);
                break;
            case 'step':
                console.log(`${prefix} 📍 ${message}`);
                break;
            default:
                console.log(`${prefix} ℹ️ ${message}`);
        }
    }
    
    // 装飾要素を除外したテキスト取得
    function getCleanText(element) {
        if (!element) return '';
        const clone = element.cloneNode(true);
        // 装飾要素を削除
        const decorativeElements = clone.querySelectorAll('mat-icon, mat-ripple, svg, .icon, .ripple');
        decorativeElements.forEach(el => el.remove());
        return clone.textContent?.trim() || '';
    }
    
    
    // 要素が可視かつクリック可能かチェック
    function isElementInteractable(element) {
        if (!element) return false;
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return rect.width > 0 && 
               rect.height > 0 && 
               style.display !== 'none' && 
               style.visibility !== 'hidden' && 
               style.opacity !== '0';
    }
    
    // 複数セレクタで要素検索
    async function findElement(selectors, maxRetries = 3) {
        for (let retry = 0; retry < maxRetries; retry++) {
            for (const selector of selectors) {
                try {
                    let element;
                    
                    if (selector.includes(':contains(')) {
                        const match = selector.match(/\:contains\("([^"]+)"\)/);
                        if (match) {
                            const text = match[1];
                            const baseSelector = selector.split(':contains(')[0];
                            const elements = document.querySelectorAll(baseSelector || '*');
                            element = Array.from(elements).find(el => 
                                el.textContent && el.textContent.includes(text)
                            );
                        }
                    } else {
                        element = document.querySelector(selector);
                    }
                    
                    if (element && isElementInteractable(element)) {
                        return element;
                    }
                } catch (e) {
                    // セレクタエラーを無視
                }
            }
            
            if (retry < maxRetries - 1) {
                await sleep(AI_WAIT_CONFIG.TINY_WAIT);
            }
        }
        
        return null;
    }
    
    // テキストで要素を検索
    function findElementByText(selector, text, parent = document) {
        const elements = parent.querySelectorAll(selector);
        for (const el of elements) {
            if (el.textContent && el.textContent.includes(text)) {
                return el;
            }
        }
        return null;
    }
    
    // ========================================
    // Deep Research/エージェントモード統合処理
    // ========================================
    async function handleSpecialModeWaiting(featureName) {
        try {
            log(`【${featureName}モード特別処理】開始`, 'step');
            log('【ステップ6-1】最大回答待機時間: 40分', 'info');

            // ステップ6-1: 停止ボタン出現待機
            let stopBtn = await waitForStopButton();
            if (!stopBtn) return false;

            // ステップ6-2: 2分間初期待機
            const disappeared = await initialWaitCheck();

            // ステップ6-3: 2分以内に完了した場合の再送信
            if (disappeared) {
                await retryWithPrompt();
            }

            // ステップ6-4: 最終待機（最大40分）
            await finalWaitForCompletion();

            log(`${featureName}モード特別処理完了`, 'success');
            return true;
        } catch (error) {
            log(`特別処理エラー: ${error.message}`, 'error');
            return false;
        }
    }

    // 6-1: 停止ボタン出現待機
    async function waitForStopButton() {
        log('【ステップ6-1】停止ボタン出現待機', 'step');
        for (let i = 0; i < 60; i++) {
            const stopBtn = await findElement(SELECTORS.stopButton, 1);
            if (stopBtn) {
                log(`停止ボタンが表示されました (${i+1}秒後)`, 'success');
                return stopBtn;
            }
            if (i % 10 === 0 && i > 0) {
                log(`停止ボタン待機中... ${i}秒経過`, 'info');
            }
            await sleep(AI_WAIT_CONFIG.SHORT_WAIT);
        }
        log('【ステップ6-1】停止ボタンが表示されませんでした', 'warning');
        return null;
    }

    // 6-2: 2分間初期待機
    async function initialWaitCheck() {
        log('【ステップ6-2】2分間初期待機チェック', 'step');
        for (let i = 0; i < 120; i++) {
            const stopBtn = await findElement(SELECTORS.stopButton, 1);
            if (!stopBtn) {
                const minutes = Math.floor(i / 60);
                const seconds = i % 60;
                log(`停止ボタンが消えました (${minutes}分${seconds}秒で完了)`, 'info');
                return true;
            }
            if (i % 30 === 0 && i > 0) {
                log(`待機中... (${Math.floor(i/60)}分${i%60}秒経過)`, 'info');
            }
            await sleep(AI_WAIT_CONFIG.SHORT_WAIT);
        }
        return false;
    }

    // 6-3: 再送信処理
    async function retryWithPrompt() {
        log('【ステップ6-3】再送信処理（「いいから元のプロンプトを確認して作業をして」）', 'step');
        const input = await findElement(SELECTORS.textInput);
        if (!input) return;

        const retryMessage = 'いいから元のプロンプトを確認して作業をして';

        // テキスト入力
        if (input.classList.contains('ProseMirror') || input.classList.contains('ql-editor')) {
            input.innerHTML = '';
            const p = document.createElement('p');
            p.textContent = retryMessage;
            input.appendChild(p);
            input.classList.remove('ql-blank');
            input.dispatchEvent(new Event('input', { bubbles: true }));
        } else {
            input.textContent = retryMessage;
            input.dispatchEvent(new Event('input', { bubbles: true }));
        }

        // 送信
        const sendBtn = await findElement(SELECTORS.sendButton);
        if (sendBtn) {
            sendBtn.click();
            log('【ステップ6-2】再送信完了', 'success');
            await sleep(AI_WAIT_CONFIG.LONG_WAIT);
        }
    }

    // 6-4: 最終待機処理
    async function finalWaitForCompletion() {
        log('【ステップ6-4】最終待機（最大40分）', 'step');
        const maxWaitTime = AI_WAIT_CONFIG.DEEP_RESEARCH_WAIT / 1000;
        let consecutiveAbsent = 0;

        for (let i = 0; i < maxWaitTime; i++) {
            const stopBtn = await findElement(SELECTORS.stopButton, 1);

            if (!stopBtn) {
                consecutiveAbsent++;
                if (consecutiveAbsent >= 10) {
                    log('【ステップ6-3】停止ボタンが10秒間連続で消滅。完了！', 'success');
                    break;
                }
            } else {
                consecutiveAbsent = 0;
            }

            if (i % 60 === 0 && i > 0) {
                log(`待機中... (${Math.floor(i/60)}分経過 / 最大40分)`, 'info');
            }
            await sleep(AI_WAIT_CONFIG.SHORT_WAIT);
        }
    }
    
    // ========================================
    // メイン実行関数
    // ========================================
    async function executeTask(taskData) {
        // 実行前にフラグをリセット（どの経路から呼ばれても適切に初期化）
        window.__v2_execution_complete = false;
        window.__v2_execution_result = null;
        
        // ページ初期読み込み待機（ネット環境を考慮）
        console.log('【ステップ1-0】⏳ ページ初期読み込み待機中...');
        await sleep(3000);  // 3秒待機
        
        console.log('%c🚀 ChatGPT V2 タスク実行開始', 'color: #00BCD4; font-weight: bold; font-size: 16px');
        console.log('受信したタスクデータ:', {
            model: taskData.model,
            function: taskData.function,
            promptLength: taskData.prompt?.length || taskData.text?.length || 0,
            hasPrompt: !!(taskData.prompt || taskData.text)
        });
        
        try {
            // ========================================
            // ステップ1: ページ準備状態チェック（初回実行の問題を解決）
            // ========================================
            log('\n【ステップ1】ページ初期化チェック', 'step');
            
            // 1-1. ChatGPT UIの基本要素が存在するか確認
            const criticalElements = {
                'テキスト入力欄': SELECTORS.textInput,
                'モデルボタン': SELECTORS.modelButton
            };
            
            let allElementsReady = false;
            let retryCount = 0;
            const maxRetries = 10;
            
            // 最初のタスクの場合は追加の初期化待機
            const isFirstTask = !window.ChatGPTAutomationV2._initialized;
            if (isFirstTask) {
                log('初回タスク実行を検知。追加の初期化待機を行います', 'info');
                await sleep(AI_WAIT_CONFIG.LONG_WAIT); // 初回は3秒待機
                window.ChatGPTAutomationV2._initialized = true;
            }
            
            // 全ての重要な要素が利用可能になるまで待機
            while (!allElementsReady && retryCount < maxRetries) {
                allElementsReady = true;
                
                for (const [name, selectors] of Object.entries(criticalElements)) {
                    const element = await findElement(selectors, name, 1);
                    if (!element) {
                        log(`${name}が見つかりません。待機中... (${retryCount + 1}/${maxRetries})`, 'warning');
                        allElementsReady = false;
                        break;
                    }
                }
                
                if (!allElementsReady) {
                    await sleep(AI_WAIT_CONFIG.MEDIUM_WAIT);
                    retryCount++;
                }
            }
            
            if (!allElementsReady) {
                throw new Error('ChatGPT UIが完全に初期化されていません。ページをリロードしてください。');
            }
            
            // 1-2. React/DOM の安定化待機
            log('1-2. DOM安定化待機中...', 'info');
            await sleep(AI_WAIT_CONFIG.MEDIUM_WAIT - 500);
            
            // 1-3. 既存の開いているメニューを全て閉じる
            const openMenus = document.querySelectorAll('[role="menu"][data-state="open"]');
            if (openMenus.length > 0) {
                log(`開いているメニュー(${openMenus.length}個)を閉じます`, 'info');
                document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape' }));
                await sleep(AI_WAIT_CONFIG.TINY_WAIT);
            }
            
            log('ページ初期化チェック完了', 'success');
            
            // パラメータ準備（スプレッドシートの値をそのまま使用）
            const prompt = taskData.prompt || taskData.text || '';
            const modelName = taskData.model || '';
            const featureName = taskData.function || null;
            
            log(`選択されたモデル: ${modelName}`, 'info');
            log(`選択された機能: ${featureName || '設定なし'}`, 'info');
            log(`プロンプト: ${prompt.substring(0, 100)}...`, 'info');
            
            // モデル情報を事前取得（テスト済みコードのロジック）
            let selectedModel = null;
            if (modelName) {
                // 利用可能なモデルを検索してselectedModelオブジェクトを作成
                const modelButton = await findElement(SELECTORS.modelButton, 'モデル切り替えボタン');
                if (modelButton) {
                    modelButton.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
                    await sleep(AI_WAIT_CONFIG.MICRO_WAIT);
                    modelButton.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
                    await sleep(AI_WAIT_CONFIG.MEDIUM_WAIT - 500);
                    
                    const modelMenu = await findElement(SELECTORS.modelMenu, 'モデルメニュー');
                    if (modelMenu) {
                        // メインメニューのモデル取得
                        const mainMenuItems = modelMenu.querySelectorAll('[role="menuitem"][data-testid^="model-switcher-"]');
                        for (const item of mainMenuItems) {
                            const itemModelName = getCleanText(item);
                            if (itemModelName === modelName || itemModelName.includes(modelName)) {
                                selectedModel = {
                                    name: itemModelName,
                                    testId: item.getAttribute('data-testid'),
                                    type: 'Current'
                                };
                                break;
                            }
                        }
                        
                        // レガシーモデルもチェック
                        if (!selectedModel) {
                            const legacyButton = modelMenu.querySelector('[role="menuitem"][data-has-submenu]') ||
                                                Array.from(modelMenu.querySelectorAll('[role="menuitem"]'))
                                                    .find(el => el.textContent && el.textContent.includes('レガシーモデル'));
                            
                            if (legacyButton) {
                                legacyButton.click();
                                await sleep(AI_WAIT_CONFIG.MEDIUM_WAIT - 500);
                                
                                const allMenus = document.querySelectorAll('[role="menu"]');
                                for (const menu of allMenus) {
                                    if (menu !== modelMenu) {
                                        const items = menu.querySelectorAll('[role="menuitem"]');
                                        for (const item of items) {
                                            const itemModelName = getCleanText(item);
                                            if (itemModelName === modelName || itemModelName.includes(modelName)) {
                                                selectedModel = {
                                                    name: itemModelName,
                                                    type: 'Legacy'
                                                };
                                                break;
                                            }
                                        }
                                        if (selectedModel) break;
                                    }
                                }
                            }
                        }
                        
                        // メニューを閉じる
                        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape' }));
                        await sleep(AI_WAIT_CONFIG.SHORT_WAIT);
                    }
                }
            }
            
            // ========================================
            // ステップ2: テキスト入力
            // ========================================
            log('\n【ステップ2】テキスト入力', 'step');
            
            const input = await findElement(SELECTORS.textInput, 'テキスト入力欄');
            if (!input) {
                throw new Error('入力欄が見つかりません');
            }
            
            // ChatGPT動作コードのテキスト入力処理をそのまま使用
            if (input.classList.contains('ProseMirror') || input.classList.contains('ql-editor')) {
                input.innerHTML = '';
                const p = document.createElement('p');
                p.textContent = prompt;
                input.appendChild(p);
                input.classList.remove('ql-blank');
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
            } else {
                input.textContent = prompt;
                input.dispatchEvent(new Event('input', { bubbles: true }));
            }
            
            log('テキスト入力完了', 'success');
            await sleep(AI_WAIT_CONFIG.SHORT_WAIT);
            
            // ========================================
            // ステップ3: モデル選択（テスト済みコード）
            // ========================================
            if (modelName) {
                log('\n【ステップ3】モデル選択', 'step');

                // 動的モデル選択ロジック（Gemini方式を適用）
                let resolvedModel = modelName;

                // 3-0: モデルメニューを開いて利用可能なモデルを取得
                log('【ステップ3-0】利用可能なモデル一覧を取得', 'step');
                const modelBtn = await findElement(SELECTORS.modelButton, 'モデルボタン');
                if (!modelBtn) {
                    throw new Error('モデルボタンが見つかりません');
                }

                modelBtn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
                await sleep(AI_WAIT_CONFIG.MICRO_WAIT);
                modelBtn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
                await sleep(AI_WAIT_CONFIG.MEDIUM_WAIT - 500);

                const modelMenuEl = await findElement(SELECTORS.modelMenu, 'モデルメニュー');
                if (!modelMenuEl) {
                    throw new Error('モデルメニューが開きません');
                }

                // 利用可能なモデル一覧を動的に取得
                const availableModels = [];
                const mainMenuItems = modelMenuEl.querySelectorAll('[role="menuitem"][data-testid^="model-switcher-"]');
                mainMenuItems.forEach(item => {
                    const name = getCleanText(item);
                    if (name && !name.includes('レガシー')) {
                        availableModels.push({ name, element: item, type: 'Current' });
                    }
                });

                // レガシーモデルもチェック
                const legacyButton = modelMenuEl.querySelector('[role="menuitem"][data-has-submenu]') ||
                                    Array.from(modelMenuEl.querySelectorAll('[role="menuitem"]'))
                                        .find(el => el.textContent && el.textContent.includes('レガシーモデル'));

                if (legacyButton) {
                    legacyButton.click();
                    await sleep(1500);

                    const allMenus = document.querySelectorAll('[role="menu"]');
                    allMenus.forEach(menu => {
                        if (menu !== modelMenuEl) {
                            const items = menu.querySelectorAll('[role="menuitem"]');
                            items.forEach(item => {
                                const name = getCleanText(item);
                                if (name && name.includes('GPT')) {
                                    availableModels.push({ name, element: item, type: 'Legacy' });
                                }
                            });
                        }
                    });
                }

                log(`取得したモデル一覧: ${availableModels.map(m => m.name).join(', ')}`, 'info');

                // 動的選択ロジック（番号指定または名前マッチング）
                if (typeof modelName === 'number') {
                    // 番号指定: modelName: 1 → availableModels[0]
                    if (modelName >= 1 && modelName <= availableModels.length) {
                        const selectedModelObj = availableModels[modelName - 1];
                        resolvedModel = selectedModelObj.name;
                        selectedModel = selectedModelObj.element;
                        log(`番号指定によるモデル選択: ${modelName} → "${resolvedModel}"`, 'info');
                    } else {
                        log(`無効な番号指定: ${modelName} (1-${availableModels.length}の範囲で指定してください)`, 'error');
                        resolvedModel = availableModels[0]?.name || modelName;
                        selectedModel = availableModels[0]?.element;
                    }
                } else if (modelName && modelName !== '' && modelName !== 'default' &&
                          (typeof modelName !== 'string' || modelName.toLowerCase() !== 'auto')) {
                    // 名前マッチング: 部分一致で探す
                    const found = availableModels.find(m =>
                        m.name.toLowerCase().includes(modelName.toLowerCase())
                    );
                    if (found) {
                        resolvedModel = found.name;
                        selectedModel = found.element;
                        log(`名前マッチングによるモデル選択: "${modelName}" → "${resolvedModel}"`, 'info');
                    } else {
                        log(`マッチするモデルが見つかりません: "${modelName}"`, 'warning');
                        log(`利用可能なモデル: ${availableModels.map(m => m.name).join(', ')}`, 'info');
                        selectedModel = null;
                    }
                } else {
                    log(`デフォルトモデルを使用`, 'info');
                    selectedModel = null;
                }

                // メニューを一旦閉じて、選択が決定したら再度開く
                document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape' }));
                await sleep(500);

                if (selectedModel) {
                    // 3-1: モデルメニューを開く（選択対象が決定済み）
                    log('【ステップ3-1】モデルのメニューを開く', 'step');
                    const modelBtn2 = await findElement(SELECTORS.modelButton, 'モデルボタン');
                    if (!modelBtn2) {
                        throw new Error('モデルボタンが見つかりません');
                    }

                    modelBtn2.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
                    await sleep(AI_WAIT_CONFIG.MICRO_WAIT);
                    modelBtn2.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
                    await sleep(AI_WAIT_CONFIG.MEDIUM_WAIT - 500);

                    const modelMenuEl2 = await findElement(SELECTORS.modelMenu, 'モデルメニュー');
                    if (!modelMenuEl2) {
                        throw new Error('モデルメニューが開きません');
                    }

                    // レガシーモデルの場合
                    if (selectedModel.type === 'Legacy') {
                        const legacyBtn = modelMenuEl2.querySelector('[role="menuitem"][data-has-submenu]') ||
                                        Array.from(modelMenuEl2.querySelectorAll('[role="menuitem"]'))
                                            .find(el => el.textContent && el.textContent.includes('レガシーモデル'));
                        if (legacyBtn) {
                            log('レガシーモデルメニューを開く', 'info');
                            legacyBtn.click();
                            await sleep(AI_WAIT_CONFIG.MEDIUM_WAIT - 500);
                        }
                    }

                    // 3-2: 該当のモデルを選択
                    log('【ステップ3-2】該当のモデルを選択する', 'step');

                    // 動的に取得した要素をそのまま使用
                    selectedModel.element.click();
                    await sleep(AI_WAIT_CONFIG.MEDIUM_WAIT);
                    log(`モデル選択完了: ${resolvedModel}`, 'success');
                } else {
                    log('選択するモデルが特定できませんでした。現在のモデルを使用します。', 'warning');
                }
            } else {
                log('モデル選択をスキップ（モデル名が指定されていません）', 'info');
            }
            
            // ========================================
            // ステップ4: 機能選択（機能名マッピング対応）
            // ========================================
            let resolvedFeature = featureName;
            if (featureName && featureName !== '' && featureName !== 'none' && featureName !== '通常') {
                log('\n【ステップ4】機能選択', 'step');

                // 動的機能選択ロジック（Gemini方式を適用）
                // 機能名マッピング（スプレッドシート値 → ChatGPT UI表記）
                const featureMapping = {
                    'DeepReserch': 'Deep Research'  // スペルミスの修正のみ
                };

                let mappedFeatureName = featureMapping[featureName] || featureName;
                console.log(`🔄 [機能名マッピング] "${featureName}" → "${mappedFeatureName}"`);

                // 4-0: 機能メニューを開いて利用可能な機能を取得
                log('【ステップ4-0】利用可能な機能一覧を取得', 'step');

                // 選択されている機能があれば解除
                const selectedButtons = document.querySelectorAll('button[data-pill="true"]');
                selectedButtons.forEach(btn => {
                    const closeBtn = btn.querySelector('button[aria-label*="削除"]');
                    if (closeBtn) closeBtn.click();
                });
                await sleep(500);

                const funcMenuBtn = await findElement(SELECTORS.menuButton, 'メニューボタン');
                if (!funcMenuBtn) {
                    throw new Error('機能メニューボタンが見つかりません');
                }

                funcMenuBtn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
                await sleep(AI_WAIT_CONFIG.MICRO_WAIT);
                funcMenuBtn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
                await sleep(AI_WAIT_CONFIG.MEDIUM_WAIT);

                const funcMenu = await findElement(SELECTORS.mainMenu, 'メインメニュー');
                if (!funcMenu) {
                    throw new Error('機能メニューが開きません');
                }

                // 利用可能な機能一覧を動的に取得
                const availableFeatures = [];
                const menuItems = funcMenu.querySelectorAll('[role="menuitemradio"]');
                menuItems.forEach(item => {
                    const name = getCleanText(item);
                    if (name) {
                        availableFeatures.push({ name, element: item });
                    }
                });

                // さらに表示ボタンチェック
                const moreButton = findElementByText('[role="menuitem"]', 'さらに表示');
                if (moreButton) {
                    moreButton.click();
                    await sleep(1000);

                    const subMenu = document.querySelector('[data-side="right"]');
                    if (subMenu) {
                        const subMenuItems = subMenu.querySelectorAll('[role="menuitemradio"]');
                        subMenuItems.forEach(item => {
                            const name = getCleanText(item);
                            if (name) {
                                availableFeatures.push({ name, element: item });
                            }
                        });
                    }
                }

                log(`取得した機能一覧: ${availableFeatures.map(f => f.name).join(', ')}`, 'info');

                // 動的選択ロジック（番号指定または名前マッチング）
                let selectedFeature = null;
                if (typeof featureName === 'number') {
                    // 番号指定: featureName: 1 → availableFeatures[0]
                    if (featureName >= 1 && featureName <= availableFeatures.length) {
                        const selectedFeatureObj = availableFeatures[featureName - 1];
                        resolvedFeature = selectedFeatureObj.name;
                        selectedFeature = selectedFeatureObj;
                        log(`番号指定による機能選択: ${featureName} → "${resolvedFeature}"`, 'info');
                    } else {
                        log(`無効な番号指定: ${featureName} (1-${availableFeatures.length}の範囲で指定してください)`, 'error');
                        selectedFeature = availableFeatures[0] || null;
                        resolvedFeature = selectedFeature?.name || featureName;
                    }
                } else {
                    // 名前マッチング: 部分一致で探す（マッピング後の名前で）
                    const found = availableFeatures.find(f =>
                        f.name.toLowerCase().includes(mappedFeatureName.toLowerCase())
                    );
                    if (found) {
                        resolvedFeature = found.name;
                        selectedFeature = found;
                        log(`名前マッチングによる機能選択: "${mappedFeatureName}" → "${resolvedFeature}"`, 'info');
                    } else {
                        log(`マッチする機能が見つかりません: "${mappedFeatureName}"`, 'warning');
                        log(`利用可能な機能: ${availableFeatures.map(f => f.name).join(', ')}`, 'info');
                        selectedFeature = null;
                    }
                }

                // メニューを一旦閉じてから再度開く
                document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape' }));
                await sleep(1000);

                if (selectedFeature) {
                    // 4-1: 機能メニューを開く（選択対象が決定済み）
                    log('【ステップ4-1】機能メニューボタンをクリック', 'step');
                    const funcMenuBtn2 = await findElement(SELECTORS.menuButton, 'メニューボタン');
                    if (!funcMenuBtn2) {
                        throw new Error('機能メニューボタンが見つかりません');
                    }

                    funcMenuBtn2.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
                    await sleep(AI_WAIT_CONFIG.MICRO_WAIT);
                    funcMenuBtn2.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
                    await sleep(AI_WAIT_CONFIG.MEDIUM_WAIT);

                    const funcMenu2 = await findElement(SELECTORS.mainMenu, 'メインメニュー');
                    if (!funcMenu2) {
                        throw new Error('機能メニューが開きません');
                    }

                    // サブメニューが必要かチェック
                    let targetElement = selectedFeature.element;
                    if (!funcMenu2.contains(targetElement)) {
                        // サブメニューの機能の場合、さらに表示ボタンをクリック
                        const moreBtn = findElementByText('[role="menuitem"]', 'さらに表示', funcMenu2);
                        if (moreBtn) {
                            log('【ステップ4-2】サブメニューを開く', 'step');
                            moreBtn.click();
                            await sleep(1000);
                        }
                    }

                    // 4-3: 機能を選択
                    log('【ステップ4-3】機能を選択する', 'step');
                    selectedFeature.element.click();
                    await sleep(AI_WAIT_CONFIG.MEDIUM_WAIT);
                    log(`機能選択完了: ${resolvedFeature}`, 'success');

                    // 4-4: メニューを閉じる
                    log('【ステップ4-4】機能メニューを閉じる', 'step');
                    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape' }));
                    await sleep(AI_WAIT_CONFIG.SHORT_WAIT);
                } else {
                    log('選択する機能が特定できませんでした。機能なしで続行します。', 'warning');
                }
            } else {
                log('機能選択をスキップ', 'info');
            }
            log('\n【ステップ5】メッセージ送信（再試行対応）', 'step');
            
            // 送信ボタンを5回まで再試行
            let sendSuccess = false;
            let sendAttempts = 0;
            const maxSendAttempts = 5;
            
            while (!sendSuccess && sendAttempts < maxSendAttempts) {
                sendAttempts++;
                log(`【ステップ5-${sendAttempts}】送信試行 ${sendAttempts}/${maxSendAttempts}`, 'step');
                
                const sendBtn = await findElement(SELECTORS.sendButton, '送信ボタン');
                if (!sendBtn) {
                    if (sendAttempts === maxSendAttempts) {
                        throw new Error('送信ボタンが見つかりません');
                    }
                    log(`送信ボタンが見つかりません。2秒後に再試行...`, 'warning');
                    await sleep(AI_WAIT_CONFIG.MEDIUM_WAIT);
                    continue;
                }
                
                // 送信ボタンをクリック
                sendBtn.click();
                log(`送信ボタンをクリックしました（試行${sendAttempts}）`, 'success');
                await sleep(AI_WAIT_CONFIG.SHORT_WAIT);
                
                // 送信後に停止ボタンが表示されるか、または送信ボタンが消えるまで5秒待機
                let stopButtonAppeared = false;
                let sendButtonDisappeared = false;
                
                for (let i = 0; i < 5; i++) {
                    // 停止ボタンの確認
                    const stopBtn = await findElement(SELECTORS.stopButton, '停止ボタン', 1);
                    if (stopBtn) {
                        stopButtonAppeared = true;
                        log('停止ボタンが表示されました - 送信成功', 'success');
                        break;
                    }
                    
                    // 送信ボタンが消えたかどうかを確認
                    const stillSendBtn = await findElement(SELECTORS.sendButton, '送信ボタン', 1);
                    if (!stillSendBtn) {
                        sendButtonDisappeared = true;
                        log('送信ボタンが消えました - 送信成功', 'success');
                        break;
                    }
                    
                    await sleep(AI_WAIT_CONFIG.SHORT_WAIT);
                }
                
                if (stopButtonAppeared || sendButtonDisappeared) {
                    sendSuccess = true;
                    break;
                } else {
                    log(`送信反応が確認できません。再試行します...`, 'warning');
                    await sleep(AI_WAIT_CONFIG.MEDIUM_WAIT);
                }
            }
            
            if (!sendSuccess) {
                throw new Error(`${maxSendAttempts}回試行しても送信が成功しませんでした`);
            }
            
            // 送信時刻を記録（SpreadsheetLogger用）
            log(`🔍 送信時刻記録開始 - AIHandler: ${!!window.AIHandler}, recordSendTimestamp: ${!!window.AIHandler?.recordSendTimestamp}, currentAITaskInfo: ${!!window.currentAITaskInfo}`, 'info');
            if (window.AIHandler && window.AIHandler.recordSendTimestamp) {
                try {
                    log(`📝 送信時刻記録実行開始 - タスクID: ${window.currentAITaskInfo?.taskId}`, 'info');
                    await window.AIHandler.recordSendTimestamp('ChatGPT');
                    log(`✅ 送信時刻記録成功`, 'success');
                } catch (error) {
                    log(`❌ 送信時刻記録エラー: ${error.message}`, 'error');
                }
            } else {
                log(`⚠️ AIHandler または recordSendTimestamp が利用できません`, 'warning');
            }
            
            await sleep(AI_WAIT_CONFIG.SHORT_WAIT);
            
            // ========================================
            // ステップ6: 応答待機（Deep Research/エージェントモード統合処理）
            // ========================================
            log('\n【ステップ6】応答待機', 'step');
            
            // Deep Research/エージェントモードの判定
            const finalFeatureName = mappedFeatureName || featureName;
            const isSpecialMode = finalFeatureName && (
                finalFeatureName === 'Deep Research' ||
                finalFeatureName.includes('エージェント') ||
                finalFeatureName.includes('Research')
            );

            if (isSpecialMode) {
                log(`${finalFeatureName}モード検出 - 特別待機処理を実行`, 'warning');
                await handleSpecialModeWaiting(finalFeatureName);
            } else {
                // 通常の待機処理
                log('通常モード - 標準待機処理を実行', 'info');
                await standardWaitForResponse();
            }
            
            await sleep(AI_WAIT_CONFIG.MEDIUM_WAIT); // 追加の待機
            
            // ========================================
            // ステップ7: テキスト取得と表示
            // ========================================
            log('\n【ステップ7】テキスト取得と表示', 'step');

            // テキスト取得（ui-selectors-data.jsonを使用）
            let responseText = '';

            // Canvas/Artifactを最優先でチェック
            log('Canvas/Artifactコンテンツを検索中...', 'info');

            const canvasSelectors = UI_SELECTORS.ChatGPT?.TEXT_EXTRACTION?.CANVAS_ARTIFACT || SELECTORS.canvasText;
            for (const selector of canvasSelectors) {
                const elements = document.querySelectorAll(selector);
                
                if (elements.length > 0) {
                    log(`セレクタ "${selector}" で ${elements.length}個の要素を発見`, 'info');
                    
                    for (const elem of elements) {
                        const text = elem.textContent?.trim() || '';
                        
                        // 最低文字数のチェックを緩和（10文字→5文字）
                        if (text && text.length > 5) {
                            responseText = text;
                            log(`Canvas取得成功: ${text.length}文字`, 'success');
                            break;
                        }
                    }
                    if (responseText) break;
                }
            }
            
            // Canvasが見つからない場合のデバッグ（簡潔化）
            if (!responseText) {
                log('Canvasコンテンツが見つかりません', 'warning');
            }
            
            // Canvasが見つからない場合はアシスタントメッセージから取得
            if (!responseText) {
                log('Canvasが見つからないため、アシスタントメッセージから取得', 'info');

                const messageSelectors = UI_SELECTORS.ChatGPT?.MESSAGE || SELECTORS.normalText;
                const assistantMessages = document.querySelectorAll(messageSelectors[0]);
                if (assistantMessages.length > 0) {
                    const lastMessage = assistantMessages[assistantMessages.length - 1];
                    const contentSelectors = UI_SELECTORS.ChatGPT?.RESPONSE || ['div.markdown.prose', 'div.markdown'];

                    for (const selector of contentSelectors) {
                        const elements = lastMessage.querySelectorAll(selector);
                        for (const elem of elements) {
                            const text = elem.textContent?.trim() || '';
                            if (text && text.length > 10) {
                                responseText = text;
                                log(`アシスタントメッセージ取得成功: ${text.length}文字`, 'success');
                                break;
                            }
                        }
                        if (responseText) break;
                    }
                }
            }
            
            if (responseText) {
                // 現在表示されているモデルと機能を取得（選択後確認）
                let displayedModel = '';
                let displayedFunction = '';

                try {
                    // ModelInfoExtractorを使用
                    if (window.ModelInfoExtractor) {
                        displayedModel = window.ModelInfoExtractor.extract('ChatGPT') || '';
                        log(`📊 選択後確認 - 実際のモデル: "${displayedModel}"`, 'info');
                    } else {
                        log('⚠️ ModelInfoExtractorが利用できません', 'warn');
                    }

                    // FunctionInfoExtractorを使用
                    if (window.FunctionInfoExtractor) {
                        displayedFunction = window.FunctionInfoExtractor.extract('ChatGPT') || '';
                        log(`📊 選択後確認 - 実際の機能: "${displayedFunction}"`, 'info');
                    } else {
                        log('⚠️ FunctionInfoExtractorが利用できません', 'warn');
                    }
                } catch (error) {
                    log(`⚠️ モデル/機能情報取得エラー: ${error.message}`, 'warn');
                }

                console.log('✅ ChatGPT V2 タスク実行完了');
                // 実行完了フラグを設定（AITaskExecutorが確認）
                window.__v2_execution_complete = true;
                window.__v2_execution_result = {
                    success: true,
                    response: responseText,
                    displayedModel: displayedModel,
                    displayedFunction: displayedFunction
                };
                return {
                    success: true,
                    response: responseText,
                    displayedModel: displayedModel,
                    displayedFunction: displayedFunction
                };
            } else {
                throw new Error('応答テキストを取得できませんでした');
            }
            
        } catch (error) {
            console.error('❌ ChatGPT V2 タスク実行エラー:', error);
            // エラー時も完了フラグを設定
            window.__v2_execution_complete = true;
            window.__v2_execution_result = {
                success: false,
                error: error.message
            };
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    // ========================================
    // runAutomation関数（後方互換性）
    // ========================================
    async function runAutomation(config) {
        // executeTask内でフラグリセットが行われるため、ここでは不要
        return executeTask({
            model: config.model,
            function: config.function,
            prompt: config.text || config.prompt
        });
    }
    
    
    // ========================================
    // グローバル公開
    // ========================================
    const automationAPI = {
        executeTask,
        runAutomation,
        // フェーズ別メソッド（順次処理用）
        inputTextOnly,
        selectModelOnly,
        selectFunctionOnly,
        sendAndGetResponse
    };
    
    // v2名と標準名の両方をサポート（下位互換性保持）
    window.ChatGPTAutomationV2 = automationAPI;
    window.ChatGPTAutomation = automationAPI;
    
    console.log('✅ ChatGPT Automation V2 準備完了');
    console.log('使用方法: ChatGPTAutomation.executeTask({ model: "GPT-4o", function: "Deep Research", prompt: "..." })');
    console.log('✅ 下位互換性: ChatGPTAutomation と ChatGPTAutomationV2 の両方で利用可能');
    
})();