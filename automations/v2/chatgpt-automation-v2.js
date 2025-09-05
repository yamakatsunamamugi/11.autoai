/**
 * @fileoverview ChatGPT Automation V2 - テスト済みコードベース版
 * 
 * 特徴:
 * - テスト済みのロジックをそのまま使用
 * - モデル選択・機能選択・応答待機・テキスト取得の完全移植
 * - Deep Research/エージェントモード対応（最大40分待機）
 * - ChatGPT Canvas機能対応（prosemirror-editor-containerからの取得）
 * 
 * @version 2.2.0
 * @updated 2024-12-05 Canvas機能のテキスト取得を優先的に処理
 */
(function() {
    'use strict';
    
    console.log(`ChatGPT Automation V2 - 初期化時刻: ${new Date().toLocaleString('ja-JP')}`);
    
    // ui-selectorsからインポート（Chrome拡張機能のインジェクトコンテキスト）
    const UI_SELECTORS = window.UI_SELECTORS || {};
    const ChatGPTSelectors = UI_SELECTORS.ChatGPT || {};
    
    // ========================================
    // セレクタ定義（ui-selectorsからマージ、フォールバック付き）
    // ========================================
    const SELECTORS = {
        // モデル関連
        modelButton: [
            '[data-testid="model-switcher-dropdown-button"]',
            'button[aria-label*="モデル セレクター"]',
            'button[aria-label*="モデル"][aria-haspopup="menu"]',
            '#radix-\\:r2m\\:',
            'button.group.flex.cursor-pointer[aria-haspopup="menu"]'
        ],
        modelMenu: [
            '[role="menu"][data-radix-menu-content]',
            '[role="menu"][data-state="open"]',
            'div.z-50.max-w-xs.rounded-2xl.popover[role="menu"]',
            '[aria-labelledby*="radix"][role="menu"]',
            'div[data-radix-popper-content-wrapper] [role="menu"]'
        ],
        legacyButton: [
            '[data-testid="レガシーモデル-submenu"]',
            '[role="menuitem"][data-has-submenu]:contains("レガシーモデル")',
            'div.__menu-item:contains("レガシーモデル")',
            '[role="menuitem"][aria-haspopup="menu"]:last-of-type'
        ],
        legacyMenu: [
            '[role="menu"][data-side="right"]',
            'div[data-side="right"][role="menu"]',
            '[role="menu"]:not([data-side="bottom"])',
            'div.mt-2.max-h-\\[calc\\(100vh-300px\\)\\][role="menu"]'
        ],
        // 機能関連
        menuButton: [
            '[data-testid="composer-plus-btn"]',
            'button[aria-haspopup="menu"]',
            '#radix-\\:R2eij4im4pact9a4mj5\\:',
            'button.composer-btn',
            'div[class*="leading"] button'
        ],
        mainMenu: [
            '[role="menu"][data-state="open"]',
            '[data-radix-menu-content]',
            'div[data-side="bottom"][role="menu"]',
            'div.popover[role="menu"]',
            '[role="menu"]'
        ],
        subMenu: [
            '[role="menu"][data-side="right"]',
            'div[data-side="right"][role="menu"]',
            '[data-align="start"][role="menu"]:last-of-type'
        ],
        // 入力・送信関連
        textInput: [
            '.ProseMirror',
            '#prompt-textarea',
            '[contenteditable="true"][translate="no"]',
            'div[data-virtualkeyboard="true"]',
            'div.ProseMirror.text-token-text-primary',
            '.ql-editor'
        ],
        sendButton: [
            '[data-testid="send-button"]',
            '#composer-submit-button',
            'button[aria-label="プロンプトを送信する"]',
            'button.composer-submit-btn.composer-submit-button-color',
            'button:has(svg[width="20"][height="20"])'
        ],
        stopButton: [
            '[data-testid="stop-button"]',
            '#composer-submit-button[aria-label="ストリーミングの停止"]',
            'button.composer-submit-btn.composer-secondary-button-color',
            'button:has(svg path[d*="M4.5 5.75"])'
        ],
        // 結果取得関連
        canvasText: [
            'div.markdown.prose',
            'div.w-full.pt-1.pb-1',
            'div.markdown-new-styling'
        ],
        normalText: [
            '[data-message-author-role="assistant"]',
            'div.text-message',
            'div.min-h-8.text-message'
        ]
    };
    
    // ========================================
    // ユーティリティ関数（テストコードより）
    // ========================================
    
    // 待機関数
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    
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
    
    // React イベントトリガー
    function triggerReactEvent(element, eventType, eventData = {}) {
        try {
            if (eventType === 'click') {
                element.click();
                return true;
            } else if (eventType === 'pointer') {
                const pointerDown = new PointerEvent('pointerdown', {
                    bubbles: true,
                    cancelable: true,
                    view: window,
                    ...eventData
                });
                const pointerUp = new PointerEvent('pointerup', {
                    bubbles: true,
                    cancelable: true,
                    view: window,
                    ...eventData
                });
                element.dispatchEvent(pointerDown);
                element.dispatchEvent(pointerUp);
                return true;
            }
            return false;
        } catch (error) {
            log(`React イベントトリガー失敗: ${error.message}`, 'error');
            return false;
        }
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
    async function findElement(selectors, description, maxRetries = 3) {
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
                await sleep(500);
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
    // Deep Research/エージェントモード専用処理（テストコードより）
    // ========================================
    async function handleSpecialModeWaiting() {
        try {
            log('【Deep Research/エージェントモード特別処理】開始', 'step');
            log('最大回答待機時間: 40分', 'info');
            
            // 1-1: 送信停止ボタンが出てくるまで待機
            log('1-1. 送信後、回答停止ボタンが出てくるまで待機', 'step');
            let stopBtn = null;
            for (let i = 0; i < 60; i++) {
                stopBtn = await findElement(SELECTORS.stopButton, '停止ボタン', 1);
                if (stopBtn) {
                    log(`停止ボタンが表示されました (${i+1}秒後)`, 'success');
                    break;
                }
                if (i % 10 === 0 && i > 0) {
                    log(`停止ボタン待機中... ${i}秒経過`, 'info');
                }
                await sleep(1000);
            }
            
            if (!stopBtn) {
                log('停止ボタンが表示されませんでした', 'warning');
                return false;
            }
            
            // 1-2: 2分間待機して停止ボタンの状態を確認
            log('1-2. 回答送信後、2分間待機。2分以内に回答停止が消滅したら1-3へ、2分待機後は1-4へ', 'step');
            const twoMinutes = 120; // 2分 = 120秒
            let disappeared = false;
            
            for (let i = 0; i < twoMinutes; i++) {
                stopBtn = await findElement(SELECTORS.stopButton, '停止ボタン', 1);
                
                if (!stopBtn) {
                    disappeared = true;
                    const minutes = Math.floor(i / 60);
                    const seconds = i % 60;
                    log(`停止ボタンが完了しました (${minutes}分${seconds}秒で完了)`, 'info');
                    break;
                }
                
                if (i % 30 === 0 && i > 0) {
                    const minutes = Math.floor(i / 60);
                    const seconds = i % 60;
                    log(`停止ボタン存在確認中... (${minutes}分${seconds}秒経過 / 2分まで)`, 'info');
                }
                
                await sleep(1000);
            }
            
            // 1-3: 2分以内に停止ボタンが消滅した場合
            if (disappeared) {
                log('1-3. 回答停止が2分以内に消滅したため、「いいから元のプロンプトを確認して作業をして」と再送信', 'step');
                
                await sleep(2000); // 少し待機
                
                // テキスト入力欄を取得
                const input = await findElement(SELECTORS.textInput, 'テキスト入力欄');
                if (!input) {
                    log('入力欄が見つかりません', 'error');
                    return false;
                }
                
                const retryMessage = 'いいから元のプロンプトを確認して作業をして';
                
                // 元のコードの入力処理を使用
                if (input.classList.contains('ProseMirror') || input.classList.contains('ql-editor')) {
                    input.innerHTML = '';
                    const p = document.createElement('p');
                    p.textContent = retryMessage;
                    input.appendChild(p);
                    input.classList.remove('ql-blank');
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                } else {
                    input.textContent = retryMessage;
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                }
                
                log(`再送信メッセージ入力完了: "${retryMessage}"`, 'success');
                await sleep(1000);
                
                // 送信ボタンをクリック
                const sendBtn = await findElement(SELECTORS.sendButton, '送信ボタン');
                if (sendBtn) {
                    sendBtn.click();
                    log('再送信しました', 'success');
                    await sleep(3000);
                    
                    // 再送信後、停止ボタンが再出現するのを待つ
                    for (let i = 0; i < 30; i++) {
                        stopBtn = await findElement(SELECTORS.stopButton, '停止ボタン', 1);
                        if (stopBtn) {
                            log('再送信後、停止ボタンが再表示されました', 'success');
                            break;
                        }
                        await sleep(1000);
                    }
                } else {
                    log('送信ボタンが見つかりません', 'error');
                }
            } else {
                log('2分間経過。停止ボタンは消滅しませんでした', 'info');
            }
            
            // 1-4: 回答停止ボタンが10秒間連続で消滅するまで待機（最大40分）
            log('1-4. 回答停止ボタンが10秒間連続で消滅するまで待機（最大40分）', 'step');
            
            const maxWaitTime = 40 * 60; // 40分 = 2400秒
            let consecutiveAbsent = 0;
            
            for (let i = 0; i < maxWaitTime; i++) {
                stopBtn = await findElement(SELECTORS.stopButton, '停止ボタン', 1);
                
                if (!stopBtn) {
                    consecutiveAbsent++;
                    if (consecutiveAbsent <= 10) {
                        log(`停止ボタン不在: ${consecutiveAbsent}秒連続`, 'info');
                    }
                    
                    if (consecutiveAbsent >= 10) {
                        log('停止ボタンが10秒間連続で消滅しました。応答完了！', 'success');
                        break;
                    }
                } else {
                    if (consecutiveAbsent > 0) {
                        log('停止ボタンが再表示されました。カウントリセット', 'info');
                    }
                    consecutiveAbsent = 0;
                }
                
                // 30秒ごとに進捗表示
                if (i % 30 === 0 && i > 0) {
                    const minutes = Math.floor(i / 60);
                    const seconds = i % 60;
                    log(`待機中... (${minutes}分${seconds}秒経過 / 最大40分)`, 'info');
                }
                
                await sleep(1000);
            }
            
            if (consecutiveAbsent < 10) {
                log('最大待機時間（40分）に達しました', 'warning');
            }
            
            await sleep(2000);
            log('Deep Research/エージェントモード特別処理完了', 'success');
            return true;
            
        } catch (error) {
            log(`特別処理でエラー: ${error.message}`, 'error');
            console.error(error);
            return false;
        }
    }
    
    // ========================================
    // メイン実行関数
    // ========================================
    async function executeTask(taskData) {
        // 実行前にフラグをリセット（どの経路から呼ばれても適切に初期化）
        window.__v2_execution_complete = false;
        window.__v2_execution_result = null;
        
        console.log('%c🚀 ChatGPT V2 タスク実行開始', 'color: #00BCD4; font-weight: bold; font-size: 16px');
        console.log('受信したタスクデータ:', {
            model: taskData.model,
            function: taskData.function,
            promptLength: taskData.prompt?.length || taskData.text?.length || 0,
            hasPrompt: !!(taskData.prompt || taskData.text)
        });
        
        try {
            // ========================================
            // ページ準備状態チェック（初回実行の問題を解決）
            // ========================================
            log('\n【ページ初期化チェック】', 'step');
            
            // 1. ChatGPT UIの基本要素が存在するか確認
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
                await sleep(3000); // 初回は3秒待機
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
                    await sleep(2000);
                    retryCount++;
                }
            }
            
            if (!allElementsReady) {
                throw new Error('ChatGPT UIが完全に初期化されていません。ページをリロードしてください。');
            }
            
            // 2. React/DOM の安定化待機
            log('DOM安定化待機中...', 'info');
            await sleep(1500);
            
            // 3. 既存の開いているメニューを全て閉じる
            const openMenus = document.querySelectorAll('[role="menu"][data-state="open"]');
            if (openMenus.length > 0) {
                log(`開いているメニュー(${openMenus.length}個)を閉じます`, 'info');
                document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape' }));
                await sleep(500);
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
                    await sleep(100);
                    modelButton.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
                    await sleep(1500);
                    
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
                                await sleep(1500);
                                
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
                        await sleep(1000);
                    }
                }
            }
            
            // ========================================
            // ステップ4: テキスト入力
            // ========================================
            log('\n【ステップ4】テキスト入力', 'step');
            
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
            await sleep(1000);
            
            // ========================================
            // ステップ5: モデル選択（テスト済みコード）
            // ========================================
            if (modelName) {
                log('\n【ステップ5】モデル選択', 'step');
                
                // selectedModelが事前検索で見つからなかった場合の情報を出力
                if (!selectedModel) {
                    log(`事前検索でモデル "${modelName}" が見つかりませんでした。再検索を試みます。`, 'warning');
                }
                
                // 5-1: モデルメニューを開く
                log('5-1. モデルのメニューを開く', 'step');
                const modelBtn = await findElement(SELECTORS.modelButton, 'モデルボタン');
                if (!modelBtn) {
                    throw new Error('モデルボタンが見つかりません');
                }
                
                modelBtn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
                await sleep(100);
                modelBtn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
                await sleep(1500);
                
                const modelMenuEl = await findElement(SELECTORS.modelMenu, 'モデルメニュー');
                if (!modelMenuEl) {
                    throw new Error('モデルメニューが開きません');
                }
                
                // レガシーモデルの場合（テスト済みコードのロジック）
                if (selectedModel.type === 'Legacy') {
                    const legacyBtn = modelMenuEl.querySelector('[role="menuitem"][data-has-submenu]') ||
                                    Array.from(modelMenuEl.querySelectorAll('[role="menuitem"]'))
                                        .find(el => el.textContent && el.textContent.includes('レガシーモデル'));
                    if (legacyBtn) {
                        log('レガシーモデルメニューを開く', 'info');
                        legacyBtn.click();
                        await sleep(1500);
                    }
                }
                
                // 5-2: 該当のモデルを選択（テスト済みコードのロジック）
                log('5-2. 該当のモデルを選択する', 'step');
                const allMenuItems = document.querySelectorAll('[role="menuitem"]');
                
                // selectedModelがない場合は、modelNameで直接検索
                let targetItem = null;
                if (selectedModel) {
                    targetItem = Array.from(allMenuItems).find(item => {
                        const text = getCleanText(item);
                        return text === selectedModel.name || 
                               (selectedModel.testId && item.getAttribute('data-testid') === selectedModel.testId);
                    });
                } else {
                    // selectedModelがない場合、modelNameで直接検索
                    targetItem = Array.from(allMenuItems).find(item => {
                        const text = getCleanText(item);
                        return text === modelName || text.includes(modelName);
                    });
                }
                
                if (targetItem) {
                    targetItem.click();
                    await sleep(2000);
                    const selectedName = selectedModel ? selectedModel.name : modelName;
                    log(`モデル選択完了: ${selectedName}`, 'success');
                } else {
                    log(`モデル "${modelName}" が見つかりません。デフォルトモデルを使用します。`, 'warning');
                }
            } else {
                log('モデル選択をスキップ（モデル名が指定されていません）', 'info');
            }
            
            // ========================================
            // ステップ6: 機能選択（機能名マッピング対応）
            // ========================================
            let mappedFeatureName = null;
            if (featureName && featureName !== '' && featureName !== 'none' && featureName !== '通常') {
                // 機能名マッピング（スプレッドシート値 → ChatGPT UI表記）
                // 必要最小限のマッピングのみ（スペルミスの修正など）
                const featureMapping = {
                    'DeepReserch': 'Deep Research'  // スペルミスの修正のみ
                };
                
                mappedFeatureName = featureMapping[featureName] || featureName;
                
                console.log(`🔄 [機能名マッピング] "${featureName}" → "${mappedFeatureName}"`);
                
                log('\n【ステップ6】機能選択', 'step');
                
                // 6-1: 機能メニューボタンをクリック
                log('6-1. 機能メニューボタンをクリック', 'step');
                const funcMenuBtn = await findElement(SELECTORS.menuButton, 'メニューボタン');
                if (!funcMenuBtn) {
                    throw new Error('機能メニューボタンが見つかりません');
                }
                
                // 初回タスクの場合は追加待機
                if (isFirstTask) {
                    log('初回タスクのため、メニュー操作前に追加待機', 'info');
                    await sleep(1000);
                }
                
                funcMenuBtn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
                await sleep(100);
                funcMenuBtn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
                await sleep(2000); // メニュー表示の待機時間を増やす
                
                const funcMenu = await findElement(SELECTORS.mainMenu, 'メインメニュー');
                if (!funcMenu) {
                    throw new Error('機能メニューが開きません');
                }
                
                // メインメニューで機能を探す（マッピングした機能名を使用）
                let featureElement = findElementByText('[role="menuitemradio"]', mappedFeatureName);
                
                console.log(`🔍 [機能検索] メインメニューで "${mappedFeatureName}" を検索: ${featureElement ? '見つかった' : '見つからない'}`);
                
                if (!featureElement) {
                    // 6-2: さらに表示ボタンをクリック
                    log('6-2. 機能メニューの中のさらに表示ボタンをクリック', 'step');
                    
                    // さらに表示ボタンを複数の方法で探す
                    let moreBtn = findElementByText('[role="menuitem"]', 'さらに表示');
                    if (!moreBtn) {
                        // 別のパターンで検索
                        const allMenuItems = funcMenu.querySelectorAll('[role="menuitem"]');
                        for (const item of allMenuItems) {
                            const text = getCleanText(item);
                            if (text === 'さらに表示' || text.includes('さらに表示')) {
                                moreBtn = item;
                                console.log(`🔍 [機能検索] 別のパターンで"さらに表示"ボタンを発見`);
                                break;
                            }
                        }
                    }
                    
                    if (moreBtn) {
                        log('「さらに表示」にホバーしてサブメニューを開く', 'info');
                        
                        // まずホバーイベントを試す
                        moreBtn.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
                        moreBtn.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
                        await sleep(500);
                        
                        // サブメニューが開いたかチェック
                        let subMenu = document.querySelector('[data-side="right"]');
                        if (!subMenu) {
                            log('ホバーでサブメニューが開かないため、クリックを試行', 'info');
                            
                            // クリック前にフォーカスを設定
                            moreBtn.focus();
                            await sleep(100);
                            
                            // クリックイベントを発火
                            moreBtn.click();
                            await sleep(500);
                            
                            // 再度チェック
                            subMenu = document.querySelector('[data-side="right"]');
                        }
                        
                        // それでも開かない場合は、ポインターイベントで試す
                        if (!subMenu) {
                            log('サブメニューが開きませんでした', 'warn');
                            
                            // ポインターイベントを試す
                            const rect = moreBtn.getBoundingClientRect();
                            const x = rect.left + rect.width / 2;
                            const y = rect.top + rect.height / 2;
                            
                            moreBtn.dispatchEvent(new PointerEvent('pointerenter', {
                                bubbles: true,
                                clientX: x,
                                clientY: y
                            }));
                            
                            moreBtn.dispatchEvent(new PointerEvent('pointerover', {
                                bubbles: true,
                                clientX: x,
                                clientY: y
                            }));
                            
                            await sleep(500);
                            subMenu = document.querySelector('[data-side="right"]');
                        }
                        
                        // 最終手段: キーボード操作
                        if (!subMenu) {
                            log('最終手段: キーボード操作を試行', 'warn');
                            
                            // Enterキーを押す
                            moreBtn.focus();
                            await sleep(100);
                            
                            moreBtn.dispatchEvent(new KeyboardEvent('keydown', {
                                key: 'Enter',
                                code: 'Enter',
                                bubbles: true
                            }));
                            
                            moreBtn.dispatchEvent(new KeyboardEvent('keyup', {
                                key: 'Enter',
                                code: 'Enter',
                                bubbles: true
                            }));
                            
                            await sleep(500);
                            subMenu = document.querySelector('[data-side="right"]');
                        }
                        
                        // デバッグ用の詳細ログ（失敗時のみ）
                        if (!subMenu) {
                            // 🔍 デバッグ: クリック前の詳細な状態を記録
                        console.log('🔥🔥🔥 [重要デバッグ] さらに表示ボタンクリック処理開始 🔥🔥🔥');
                        console.log('📋 [クリック前] ボタンの完全な情報:');
                        console.log('  - ボタン要素:', moreBtn);
                        console.log('  - テキスト:', moreBtn.textContent?.trim());
                        console.log('  - タグ名:', moreBtn.tagName);
                        console.log('  - クラス名:', moreBtn.className);
                        console.log('  - ID:', moreBtn.id || 'なし');
                        
                        // HTML属性を全て記録
                        console.log('📋 [クリック前] HTML属性:');
                        console.log('  - role:', moreBtn.getAttribute('role'));
                        console.log('  - aria-haspopup:', moreBtn.getAttribute('aria-haspopup'));
                        console.log('  - aria-expanded:', moreBtn.getAttribute('aria-expanded'));
                        console.log('  - data-has-submenu:', moreBtn.getAttribute('data-has-submenu'));
                        console.log('  - data-testid:', moreBtn.getAttribute('data-testid'));
                        console.log('  - data-state:', moreBtn.getAttribute('data-state'));
                        
                        // ボタンの位置とサイズ
                        const rect = moreBtn.getBoundingClientRect();
                        console.log('📋 [クリック前] ボタンの位置とサイズ:');
                        console.log('  - 位置:', { x: rect.x, y: rect.y });
                        console.log('  - サイズ:', { width: rect.width, height: rect.height });
                        console.log('  - 表示状態:', moreBtn.offsetParent !== null ? '表示' : '非表示');
                        
                        // スタイル情報
                        const computed = window.getComputedStyle(moreBtn);
                        console.log('📋 [クリック前] スタイル情報:');
                        console.log('  - pointerEvents:', computed.pointerEvents);
                        console.log('  - cursor:', computed.cursor);
                        console.log('  - display:', computed.display);
                        console.log('  - visibility:', computed.visibility);
                        console.log('  - opacity:', computed.opacity);
                        
                        // イベントリスナー情報
                        console.log('📋 [クリック前] イベントリスナー情報:');
                        console.log('  - onclick関数:', typeof moreBtn.onclick);
                        const reactKeys = Object.keys(moreBtn).filter(key => key.startsWith('__react'));
                        console.log('  - Reactプロパティ:', reactKeys);
                        if (reactKeys.length > 0) {
                            reactKeys.forEach(key => {
                                console.log(`    - ${key}:`, typeof moreBtn[key]);
                            });
                        }
                        
                        // 親要素の情報
                        console.log('📋 [クリック前] 親要素の情報:');
                        console.log('  - 親要素タグ:', moreBtn.parentElement?.tagName);
                        console.log('  - 親要素role:', moreBtn.parentElement?.getAttribute('role'));
                        console.log('  - 親要素クラス:', moreBtn.parentElement?.className);
                        
                        // 現在のメニュー状態
                        console.log('📋 [クリック前] メニュー状態:');
                        const menus = document.querySelectorAll('[role="menu"]');
                        console.log('  - メニュー数:', menus.length);
                        menus.forEach((menu, idx) => {
                            console.log(`  - メニュー${idx}:`, {
                                dataState: menu.getAttribute('data-state'),
                                dataSide: menu.getAttribute('data-side'),
                                子要素数: menu.children.length
                            });
                        });
                        
                        // クリック実行
                        // 重要: フォーカスを維持してクリックする必要がある
                        // 理由: ChatGPTのメニューはフォーカスを失うと自動的に閉じる
                        console.log('🎯 [クリック実行] フォーカスを設定してからクリック');
                        
                        // フォーカスを明示的に設定
                        moreBtn.focus();
                        console.log('  ✅ フォーカスを設定');
                        await sleep(100); // フォーカスが安定するまで待機
                        
                        // onclickの詳細を調査
                        console.log('🔍 [onclick詳細分析]');
                        console.log('  - onclick型:', typeof moreBtn.onclick);
                        console.log('  - onclick値:', moreBtn.onclick);
                        if (moreBtn.onclick && typeof moreBtn.onclick === 'object') {
                            console.log('  - onclickオブジェクトのキー:', Object.keys(moreBtn.onclick));
                            console.log('  - コンストラクタ名:', moreBtn.onclick.constructor?.name);
                            // オブジェクトの中身を詳しく調査
                            try {
                                console.log('  - onclick JSON:', JSON.stringify(moreBtn.onclick));
                            } catch (e) {
                                console.log('  - onclick JSON変換失敗:', e.message);
                            }
                        }
                        
                        // メインメニューが閉じる原因を調査
                        console.log('🔍 [メニュー閉じる問題の調査]');
                        const mainMenu = document.querySelector('[role="menu"]');
                        if (mainMenu) {
                            console.log('  - メインメニューのdata-state:', mainMenu.getAttribute('data-state'));
                            console.log('  - メインメニューのaria-hidden:', mainMenu.getAttribute('aria-hidden'));
                            // イベントリスナーを一時的に追加して閉じる原因を特定
                            const handleClose = (e) => {
                                console.log('⚠️ メニューが閉じられようとしています!', e.type);
                            };
                            mainMenu.addEventListener('focusout', handleClose);
                            mainMenu.addEventListener('blur', handleClose);
                            mainMenu.addEventListener('mouseleave', handleClose);
                        }
                        
                        // クリック実行（フォーカスを維持）
                        console.log('  🖱️ クリック実行');
                        
                        // preventDefaultでfocusoutを防ぐ
                        const preventFocusLoss = (e) => {
                            console.log('  🛡️ フォーカス喪失を防止:', e.type);
                            e.preventDefault();
                            e.stopPropagation();
                        };
                        
                        // 一時的にfocusoutを無効化
                        moreBtn.addEventListener('focusout', preventFocusLoss, true);
                        moreBtn.addEventListener('blur', preventFocusLoss, true);
                        
                        moreBtn.click();
                        
                        // クリック後もフォーカスを維持
                        console.log('  🎯 クリック後、フォーカスを強制維持');
                        setTimeout(() => {
                            moreBtn.focus();
                            // サブメニューが開くまでフォーカスを保持
                            const keepFocus = setInterval(() => {
                                if (document.activeElement !== moreBtn) {
                                    moreBtn.focus();
                                }
                            }, 50);
                            
                            // 500ms後にフォーカス保持を解除
                            setTimeout(() => {
                                clearInterval(keepFocus);
                                moreBtn.removeEventListener('focusout', preventFocusLoss, true);
                                moreBtn.removeEventListener('blur', preventFocusLoss, true);
                            }, 500);
                        }, 10);
                        
                        console.log('✅ [クリック完了] フォーカス保護付きclick()実行完了');
                        
                        // クリック後の変化を段階的に記録
                        for (let i = 0; i < 5; i++) {
                            await sleep(200);
                            const elapsed = (i + 1) * 200;
                            console.log(`📊 [クリック後 ${elapsed}ms]:`, {
                                'aria-expanded': moreBtn.getAttribute('aria-expanded'),
                                'data-state': moreBtn.getAttribute('data-state'),
                                'メニュー数': document.querySelectorAll('[role="menu"]').length,
                                'サブメニュー存在': !!document.querySelector('[data-side="right"]')
                            });
                            
                            // サブメニューが開いたら即座に記録
                            if (document.querySelector('[data-side="right"]')) {
                                console.log('🎉 サブメニューが開きました！');
                                break;
                            }
                        }
                        
                            // すべての方法が失敗した場合のみデバッグログを出力
                            console.log('❌ [エラー] すべての方法でサブメニューを開けませんでした');
                            console.log('  - 試した方法: ホバー、クリック、ポインターイベント、キーボード');
                            console.log('  - 現在のメニュー数:', document.querySelectorAll('[role="menu"]').length);
                            
                            // 機能選択を失敗として返す
                            return {
                                success: false,
                                error: 'サブメニューを開けませんでした',
                                displayedFunction: ''
                            };
                        }
                        
                        // サブメニューが正常に開いた場合
                        subMenu = document.querySelector('[data-side="right"]');
                        if (!subMenu) {
                            // 代替方法: 最後のメニューまたはmenuitemradioを含むメニューを探す
                            const allMenusAfter = document.querySelectorAll('[role="menu"]');
                            if (allMenusAfter.length > 1) {
                                subMenu = allMenusAfter[allMenusAfter.length - 1];
                            }
                            
                            if (!subMenu) {
                                for (const menu of allMenusAfter) {
                                    if (menu.querySelectorAll('[role="menuitemradio"]').length > 0) {
                                        subMenu = menu;
                                        break;
                                    }
                                }
                            }
                        }
                        
                        // 6-3: サブメニューで機能を探す（テストコードの実装）
                        log('6-3. サブメニューで機能を選択', 'step');
                        if (subMenu) {
                            console.log('✅ [デバッグ] サブメニュー検出成功');
                            console.log('  - サブメニューのmenuitemradio数:', subMenu.querySelectorAll('[role="menuitemradio"]').length);
                            // テストコードの実装をそのまま使用
                            const subMenuItems = subMenu.querySelectorAll('[role="menuitemradio"]');
                            for (const item of subMenuItems) {
                                const featureName = getCleanText(item);
                                if (featureName === mappedFeatureName) {
                                    featureElement = item;
                                    log(`サブメニュー機能発見: ${featureName}`, 'success');
                                    break;
                                }
                            }
                            
                            // テストコードのfindElementByText互換実装も追加
                            if (!featureElement) {
                                featureElement = findElementByText('[role="menuitemradio"]', mappedFeatureName, subMenu);
                            }
                            
                            console.log(`🔍 [機能検索] サブメニューで "${mappedFeatureName}" を検索: ${featureElement ? '見つかった' : '見つからない'}`);
                        } else {
                            console.log(`❌ [デバッグ] サブメニューが見つかりません`);
                            console.log('  - 問題: さらに表示クリック後もサブメニューが開かない');
                            console.log('  - 可能な原因:');
                            console.log('    1. メニューが閉じてしまった');
                            console.log('    2. クリックイベントが正しく処理されなかった');
                            console.log('    3. UIの状態が不安定');
                            
                            // エラー時の追加情報収集
                            const bodyClick = document.querySelector('body');
                            const activeElement = document.activeElement;
                            console.log('  - 現在のフォーカス要素:', activeElement?.tagName, activeElement?.className);
                            console.log('  - body要素の状態:', {
                                クリック可能: !!bodyClick,
                                スクロール位置: window.scrollY
                            });
                        }
                    } else {
                        console.log(`⚠️ [機能検索] "さらに表示"ボタンが見つかりません`);
                        console.log('  - 利用可能なmenuitem:');
                        const allMenuItems = document.querySelectorAll('[role="menuitem"]');
                        allMenuItems.forEach((item, idx) => {
                            const text = item.textContent?.trim();
                            if (text && text.length < 50) {
                                console.log(`    [${idx}] "${text}"`);
                            }
                        });
                    }
                }
                
                // すべての検索が終わってから判定
                if (featureElement) {
                    featureElement.click();
                    await sleep(1500);
                    log(`機能選択完了: ${mappedFeatureName}`, 'success');
                    
                    // 6-4: 機能が選択されているか確認
                    log('6-4. 機能が選択されているかを確認', 'step');
                    const buttons = document.querySelectorAll('button[data-pill="true"]');
                    let found = false;
                    for (const button of buttons) {
                        const text = getCleanText(button);
                        if (text) {
                            log(`選択された機能ボタン: ${text}`, 'success');
                            found = true;
                        }
                    }
                    if (!found) {
                        log('機能ボタンが表示されていません', 'warning');
                    }
                } else {
                    // デバッグ: 利用可能な機能を収集
                    const allFeatures = [];
                    
                    // メインメニューの機能を取得
                    const mainMenuItems = document.querySelectorAll('[role="menuitemradio"]');
                    mainMenuItems.forEach(item => {
                        const text = getCleanText(item);
                        if (text) {
                            // サブメニュー内かメインメニュー内かを判定
                            const isInSubMenu = item.closest('[data-side="right"]');
                            if (isInSubMenu) {
                                allFeatures.push(`[サブ] ${text}`);
                            } else {
                                allFeatures.push(`[メイン] ${text}`);
                            }
                        }
                    });
                    
                    console.log(`❌ [機能検索] "${mappedFeatureName}" が見つかりません。利用可能な機能:`, allFeatures);
                    
                    // より詳細な情報を出力
                    if (allFeatures.length === 0) {
                        console.log(`⚠️ [機能検索] メニュー項目が1つも見つかりません。メニューが正しく開いていない可能性があります。`);
                    } else {
                        console.log(`📋 [機能検索] 見つかった機能数: ${allFeatures.length}個`);
                    }
                    
                    log(`指定された機能 "${mappedFeatureName}" が見つかりません`, 'warning');
                }
                
                // 6-5: メニューを閉じる
                log('6-5. 機能メニューを閉じる', 'step');
                document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape' }));
                await sleep(1000);
            }
            
            // ========================================
            // ステップ7: メッセージ送信（再試行対応）
            // ========================================
            log('\n【ステップ7】メッセージ送信（再試行対応）', 'step');
            
            // 送信ボタンを5回まで再試行
            let sendSuccess = false;
            let sendAttempts = 0;
            const maxSendAttempts = 5;
            
            while (!sendSuccess && sendAttempts < maxSendAttempts) {
                sendAttempts++;
                log(`送信試行 ${sendAttempts}/${maxSendAttempts}`, 'step');
                
                const sendBtn = await findElement(SELECTORS.sendButton, '送信ボタン');
                if (!sendBtn) {
                    if (sendAttempts === maxSendAttempts) {
                        throw new Error('送信ボタンが見つかりません');
                    }
                    log(`送信ボタンが見つかりません。2秒後に再試行...`, 'warning');
                    await sleep(2000);
                    continue;
                }
                
                // 送信ボタンをクリック
                sendBtn.click();
                log(`送信ボタンをクリックしました（試行${sendAttempts}）`, 'success');
                await sleep(1000);
                
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
                    
                    await sleep(1000);
                }
                
                if (stopButtonAppeared || sendButtonDisappeared) {
                    sendSuccess = true;
                    break;
                } else {
                    log(`送信反応が確認できません。再試行します...`, 'warning');
                    await sleep(2000);
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
            
            await sleep(1000);
            
            // ========================================
            // ステップ8: 応答待機
            // ========================================
            log('\n【ステップ8】応答待機', 'step');
            
            // Deep Research/エージェントモードの判定（マッピング後の機能名を使用）
            const finalFeatureName = mappedFeatureName || featureName;
            console.log(`🔍 [機能判定] ChatGPT機能チェック:`, {
                originalFeatureName: featureName,
                mappedFeatureName: mappedFeatureName,
                finalFeatureName: finalFeatureName,
                isDeepResearch: finalFeatureName === 'Deep Research',
                containsResearch: finalFeatureName && finalFeatureName.includes('Research'),
                containsAgent: finalFeatureName && finalFeatureName.includes('エージェント')
            });
            
            const isSpecialMode = finalFeatureName && (
                finalFeatureName === 'Deep Research' || 
                finalFeatureName === 'エージェントモード新規' ||
                finalFeatureName === 'エージェントモード' ||
                finalFeatureName.includes('エージェント') ||
                finalFeatureName.includes('Research')
            );
            
            console.log(`🎯 [機能判定] ChatGPT特別モード判定結果: ${isSpecialMode} (最終機能名: "${finalFeatureName}")`);
            
            if (isSpecialMode) {
                log(`${finalFeatureName}検出 - 特別な待機処理を実行`, 'warning');
                await handleSpecialModeWaiting();
            } else {
                // 通常の待機処理
                log('通常の待機処理を実行', 'info');
                
                // 停止ボタンが表示されるまで待機
                let stopBtn = null;
                for (let i = 0; i < 30; i++) {
                    stopBtn = await findElement(SELECTORS.stopButton, '停止ボタン', 1);
                    if (stopBtn) {
                        log('停止ボタンが表示されました', 'success');
                        break;
                    }
                    await sleep(1000);
                }
                
                // 停止ボタンが消えるまで待機（最大5分）
                if (stopBtn) {
                    log('送信停止ボタンが消えるまで待機（最大5分）', 'info');
                    for (let i = 0; i < 300; i++) {
                        stopBtn = await findElement(SELECTORS.stopButton, '停止ボタン', 1);
                        if (!stopBtn) {
                            log('応答完了', 'success');
                            break;
                        }
                        if (i % 30 === 0 && i > 0) {
                            const minutes = Math.floor(i / 60);
                            const seconds = i % 60;
                            log(`応答待機中... (${minutes}分${seconds}秒経過)`, 'info');
                        }
                        await sleep(1000);
                    }
                }
            }
            
            await sleep(2000); // 追加の待機
            
            // ========================================
            // ステップ9: テキスト取得と表示  
            // ========================================
            log('\n【ステップ9】テキスト取得と表示', 'step');
            
            // テキスト取得の改善版（ui-selectorsを使用）
            let responseText = '';
            
            // ui-selectorsから取得（フォールバックあり）
            // UI_SELECTORSはui-selectors.jsから自動的に注入される
            const textSelectors = (window.UI_SELECTORS && window.UI_SELECTORS.ChatGPT && window.UI_SELECTORS.ChatGPT.TEXT_EXTRACTION) || 
                ChatGPTSelectors.TEXT_EXTRACTION || {
                    ASSISTANT_MESSAGE: [
                        '[data-message-author-role="assistant"]',
                        'div[class*="agent-turn"]',
                        'div[class*="model-response"]',
                        'article[class*="message"]'
                    ],
                    MESSAGE_CONTENT: [
                        'div.markdown.prose',
                        'div.markdown',
                        'div[class*="markdown"]',
                        'div.text-base',
                        'div[class*="text-message"]',
                        'div[class*="prose"]'
                    ],
                    CANVAS_ARTIFACT: [
                        // ui-selectors.jsの最新定義を使用（動的に取得）
                        '#prosemirror-editor-container .ProseMirror[contenteditable="false"]',
                        '#prosemirror-editor-container .ProseMirror',
                        'div#prosemirror-editor-container .markdown.prose',
                        'div._main_5jn6z_1.markdown.prose.ProseMirror',
                        'div._main_5jn6z_1.ProseMirror',
                        '.ProseMirror[contenteditable="false"]',
                        'div.markdown.prose.ProseMirror[contenteditable="false"]',
                        '[contenteditable="false"].markdown.prose',
                        'div.markdown.prose:not([data-message-author-role])',
                        '#canvas-content',
                        '[data-testid="canvas-content"]',
                        'div[class*="canvas"]',
                        'div[class*="artifact"]'
                    ]
                };
            
            // 【重要】Canvas/Artifactを最優先でチェック（ChatGPT Canvas機能対応）
            log('Canvas/Artifactコンテンツを優先的に検索中...', 'info');
            
            for (const selector of textSelectors.CANVAS_ARTIFACT) {
                const elements = document.querySelectorAll(selector);
                
                if (elements.length > 0) {
                    log(`セレクタ "${selector}" で ${elements.length}個の要素を発見`, 'info');
                    
                    for (const elem of elements) {
                        const text = elem.textContent?.trim() || '';
                        
                        // Canvas要素の詳細情報をログ
                        const isEditable = elem.getAttribute('contenteditable');
                        const classList = elem.className || '';
                        const hasProseMirror = elem.classList && elem.classList.contains('ProseMirror');
                        
                        log(`Canvas要素チェック: 文字数=${text.length}, contenteditable=${isEditable}, classes="${classList}"`, 'info');
                        
                        // 最低文字数のチェックを緩和（10文字→5文字）
                        if (text && text.length > 5) {
                            responseText = text;
                            
                            // Canvas要素の種類を判定
                            if (selector.includes('prosemirror-editor-container')) {
                                log(`✅ prosemirror-editor-container型Canvas取得成功: ${text.length}文字`, 'success');
                            } else if (hasProseMirror) {
                                log(`✅ ProseMirror型Canvas取得成功: ${text.length}文字`, 'success');
                            } else {
                                log(`✅ Canvas取得成功 (${selector}): ${text.length}文字`, 'success');
                            }
                            
                            log(`Canvas内容プレビュー: ${text.substring(0, 200)}...`, 'info');
                            break;
                        } else if (text) {
                            log(`Canvas要素は見つかりましたが文字数が少なすぎます（${text.length}文字）`, 'warning');
                        }
                    }
                    if (responseText) break;
                }
            }
            
            // Canvasのデバッグ情報を詳細に出力
            if (!responseText) {
                log('⚠️ Canvasコンテンツが見つかりません。詳細な診断を実行中...', 'warning');
                
                // prosemirror-editor-containerの存在確認
                const editorContainer = document.getElementById('prosemirror-editor-container');
                if (editorContainer) {
                    log('✅ prosemirror-editor-containerが存在します', 'info');
                    const proseMirrorInside = editorContainer.querySelector('.ProseMirror');
                    if (proseMirrorInside) {
                        const content = proseMirrorInside.textContent?.trim() || '';
                        log(`  内部のProseMirror要素: 文字数=${content.length}`, 'info');
                        if (content.length > 0) {
                            log(`  内容の最初の100文字: ${content.substring(0, 100)}...`, 'info');
                        }
                    }
                }
                
                // すべてのProseMirror要素を確認
                const allProseMirror = document.querySelectorAll('.ProseMirror');
                if (allProseMirror.length > 0) {
                    log(`全ProseMirror要素: ${allProseMirror.length}個`, 'info');
                    allProseMirror.forEach((elem, index) => {
                        const content = elem.textContent?.trim() || '';
                        const isEditable = elem.getAttribute('contenteditable');
                        const parent = elem.parentElement?.id || elem.parentElement?.className || 'unknown';
                        log(`  [${index}] 親要素="${parent}", 編集可能=${isEditable}, 文字数=${content.length}`, 'info');
                    });
                }
            }
            
            // Canvas取得に失敗した場合のみ、アシスタントメッセージから取得を試みる
            if (!responseText) {
                log('Canvasが見つからないため、アシスタントメッセージから取得を試みます', 'info');
                
                for (const msgSelector of textSelectors.ASSISTANT_MESSAGE) {
                    const assistantMessages = document.querySelectorAll(msgSelector);
                    if (assistantMessages.length > 0) {
                        const lastMessage = assistantMessages[assistantMessages.length - 1];
                        
                        // markdown形式のコンテンツを探す
                        for (const contentSelector of textSelectors.MESSAGE_CONTENT) {
                            const elements = lastMessage.querySelectorAll(contentSelector);
                            for (const elem of elements) {
                                const text = elem.textContent?.trim() || '';
                                if (text && text.length > 10) {
                                    responseText = text;
                                    log(`アシスタントメッセージ取得成功 (${contentSelector}): ${text.length}文字`, 'success');
                                    log(`最初の100文字: ${text.substring(0, 100)}...`, 'info');
                                    break;
                                }
                            }
                            if (responseText) break;
                        }
                        if (responseText) break;
                    }
                }
            }
            
            if (responseText) {
                console.log('✅ ChatGPT V2 タスク実行完了');
                // 実行完了フラグを設定（AITaskExecutorが確認）
                window.__v2_execution_complete = true;
                window.__v2_execution_result = {
                    success: true,
                    response: responseText
                };
                return {
                    success: true,
                    response: responseText
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
    // フェーズ別実行関数（順次処理用）
    // ========================================
    
    /**
     * テキスト入力のみ実行
     */
    async function inputTextOnly(prompt) {
        try {
            log('📝 テキスト入力のみ実行', 'info');
            const input = await findElement(SELECTORS.textInput, 'テキスト入力欄');
            if (!input) {
                throw new Error('入力欄が見つかりません');
            }
            
            // テキスト入力処理
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
            
            log('✅ テキスト入力完了', 'success');
            return { success: true };
        } catch (error) {
            log(`❌ テキスト入力エラー: ${error.message}`, 'error');
            return { success: false, error: error.message };
        }
    }
    
    /**
     * モデル選択のみ実行
     */
    async function selectModelOnly(modelName) {
        try {
            if (!modelName) {
                log('モデル名が指定されていません', 'warning');
                return { success: true };
            }
            
            log(`📝 モデル選択のみ実行: ${modelName}`, 'info');
            
            // モデルメニューを開く
            const modelBtn = await findElement(SELECTORS.modelButton, 'モデルボタン');
            if (!modelBtn) {
                throw new Error('モデルボタンが見つかりません');
            }
            
            modelBtn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
            await sleep(100);
            modelBtn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
            await sleep(1500);
            
            const modelMenuEl = await findElement(SELECTORS.modelMenu, 'モデルメニュー');
            if (!modelMenuEl) {
                throw new Error('モデルメニューが開きません');
            }
            
            // モデルを選択
            const allMenuItems = document.querySelectorAll('[role="menuitem"]');
            const targetItem = Array.from(allMenuItems).find(item => {
                const text = getCleanText(item);
                return text === modelName || text.includes(modelName);
            });
            
            if (targetItem) {
                targetItem.click();
                await sleep(2000);
                log(`✅ モデル選択完了: ${modelName}`, 'success');
            } else {
                log(`⚠️ モデル "${modelName}" が見つかりません`, 'warning');
            }
            
            // 選択後の実際のモデルを取得
            let actualSelectedModel = '';
            try {
                if (window.ModelInfoExtractor) {
                    actualSelectedModel = window.ModelInfoExtractor.extract('ChatGPT') || '';
                    log(`📊 実際に選択されたモデル: "${actualSelectedModel}"`, 'info');
                }
            } catch (e) {
                log(`モデル情報取得エラー: ${e.message}`, 'warn');
            }
            
            return { 
                success: true,
                displayedModel: actualSelectedModel
            };
        } catch (error) {
            log(`❌ モデル選択エラー: ${error.message}`, 'error');
            return { success: false, error: error.message };
        }
    }
    
    /**
     * 機能選択のみ実行
     */
    async function selectFunctionOnly(functionName) {
        try {
            if (!functionName || functionName === '' || functionName === 'none' || functionName === '通常') {
                log('機能選択をスキップ', 'info');
                return { success: true };
            }
            
            log(`📝 機能選択のみ実行: ${functionName}`, 'info');
            
            // 機能メニューを開く
            const funcMenuBtn = await findElement(SELECTORS.menuButton, 'メニューボタン');
            if (!funcMenuBtn) {
                throw new Error('機能メニューボタンが見つかりません');
            }
            
            funcMenuBtn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
            await sleep(100);
            funcMenuBtn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
            await sleep(2000);
            
            const funcMenu = await findElement(SELECTORS.mainMenu, 'メインメニュー');
            if (!funcMenu) {
                throw new Error('機能メニューが開きません');
            }
            
            // 機能を探す
            let featureElement = findElementByText('[role="menuitemradio"]', functionName);
            
            if (!featureElement) {
                // さらに表示ボタンを探してホバー（ChatGPTはホバーでメニューが開く）
                let moreBtn = findElementByText('[role="menuitem"]', 'さらに表示');
                if (!moreBtn) {
                    // 英語版の場合
                    moreBtn = findElementByText('[role="menuitem"]', 'Show more');
                }
                
                if (moreBtn) {
                    log('「さらに表示」にホバーしてサブメニューを開く', 'info');
                    
                    // マウスホバーイベントを発火（ChatGPTのメニューはホバーで開く）
                    moreBtn.dispatchEvent(new MouseEvent('mouseenter', { 
                        bubbles: true, 
                        cancelable: true,
                        view: window
                    }));
                    await sleep(50);
                    
                    moreBtn.dispatchEvent(new MouseEvent('mouseover', { 
                        bubbles: true,
                        cancelable: true,
                        view: window
                    }));
                    await sleep(50);
                    
                    // PointerEventも試す（より現代的なイベント）
                    moreBtn.dispatchEvent(new PointerEvent('pointerenter', {
                        bubbles: true,
                        cancelable: true,
                        pointerType: 'mouse'
                    }));
                    await sleep(50);
                    
                    moreBtn.dispatchEvent(new PointerEvent('pointerover', {
                        bubbles: true,
                        cancelable: true,
                        pointerType: 'mouse'
                    }));
                    
                    // サブメニューが開くまで待機
                    await sleep(800);
                    
                    // サブメニューが開いたか確認
                    let subMenu = document.querySelector('[data-side="right"]');
                    
                    // サブメニューが開かない場合、フォールバックとして1回だけクリックを試みる
                    if (!subMenu) {
                        log('ホバーでサブメニューが開かないため、クリックを試行', 'info');
                        moreBtn.focus();
                        await sleep(100);
                        moreBtn.click();
                        await sleep(800);
                        subMenu = document.querySelector('[data-side="right"]');
                    }
                    
                    if (subMenu) {
                        log('サブメニューが開きました', 'success');
                        featureElement = findElementByText('[role="menuitemradio"]', functionName, subMenu);
                    } else {
                        log('⚠️ サブメニューが開きませんでした', 'warning');
                    }
                }
            }
            
            if (featureElement) {
                featureElement.click();
                await sleep(1500);
                log(`✅ 機能選択完了: ${functionName}`, 'success');
            } else {
                log(`⚠️ 機能 "${functionName}" が見つかりません`, 'warning');
            }
            
            // メニューを閉じる
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape' }));
            await sleep(1000);
            
            // 選択後の実際の機能を取得
            let actualSelectedFunction = '';
            try {
                if (window.FunctionInfoExtractor) {
                    actualSelectedFunction = window.FunctionInfoExtractor.extract('ChatGPT') || '';
                    log(`📊 実際に選択された機能: "${actualSelectedFunction}"`, 'info');
                }
            } catch (e) {
                log(`機能情報取得エラー: ${e.message}`, 'warn');
            }
            
            return { 
                success: true, 
                displayedFunction: actualSelectedFunction 
            };
        } catch (error) {
            log(`❌ 機能選択エラー: ${error.message}`, 'error');
            return { success: false, error: error.message };
        }
    }
    
    /**
     * 送信と応答取得のみ実行
     */
    async function sendAndGetResponse() {
        try {
            log('📝 送信と応答取得を実行', 'info');
            
            // 送信ボタンをクリック
            const sendBtn = await findElement(SELECTORS.sendButton, '送信ボタン');
            if (!sendBtn) {
                throw new Error('送信ボタンが見つかりません');
            }
            
            sendBtn.click();
            log('✅ 送信ボタンをクリック', 'success');
            await sleep(1000);
            
            // 停止ボタンが消えるまで待機（最大5分）
            let stopBtn = await findElement(SELECTORS.stopButton, '停止ボタン', 1);
            if (stopBtn) {
                log('応答待機中...', 'info');
                for (let i = 0; i < 300; i++) {
                    stopBtn = await findElement(SELECTORS.stopButton, '停止ボタン', 1);
                    if (!stopBtn) {
                        log('応答完了', 'success');
                        break;
                    }
                    await sleep(1000);
                }
            }
            
            await sleep(2000);
            
            // テキスト取得（Canvas優先）
            let responseText = '';
            
            // 最初にCanvas/Artifactをチェック（ChatGPT Canvas機能対応）
            // ui-selectors.jsから取得、またはフォールバック
            const canvasSelectors = (window.UI_SELECTORS && window.UI_SELECTORS.ChatGPT && window.UI_SELECTORS.ChatGPT.TEXT_EXTRACTION && window.UI_SELECTORS.ChatGPT.TEXT_EXTRACTION.CANVAS_ARTIFACT) ||
                [
                    '#prosemirror-editor-container .ProseMirror[contenteditable="false"]',
                    '#prosemirror-editor-container .ProseMirror',
                    'div._main_5jn6z_1.markdown.prose.ProseMirror',
                    '.ProseMirror[contenteditable="false"]',
                    'div.markdown.prose.ProseMirror[contenteditable="false"]'
                ];
            
            for (const selector of canvasSelectors) {
                const elements = document.querySelectorAll(selector);
                for (const elem of elements) {
                    const text = elem.textContent?.trim() || '';
                    if (text && text.length > 5) {
                        responseText = text;
                        log(`✅ Canvas取得成功: ${text.length}文字`, 'success');
                        break;
                    }
                }
                if (responseText) break;
            }
            
            // Canvasが見つからない場合はアシスタントメッセージから取得
            if (!responseText) {
                const assistantMessages = document.querySelectorAll('[data-message-author-role="assistant"]');
                if (assistantMessages.length > 0) {
                    const lastMessage = assistantMessages[assistantMessages.length - 1];
                    const elements = lastMessage.querySelectorAll('div.markdown.prose');
                    for (const elem of elements) {
                        const text = elem.textContent?.trim() || '';
                        if (text && text.length > 10) {
                            responseText = text;
                            break;
                        }
                    }
                }
            }
            
            if (responseText) {
                log(`✅ 応答取得成功: ${responseText.length}文字`, 'success');
                
                // 現在表示されているモデルと機能を取得
                let displayedModel = '';
                let displayedFunction = '';
                
                try {
                    // ModelInfoExtractorを使用（グローバルに登録されている）
                    if (window.ModelInfoExtractor) {
                        displayedModel = window.ModelInfoExtractor.extract('ChatGPT') || '';
                        log(`📊 ModelInfoExtractor結果: "${displayedModel}"`, 'info');
                    } else {
                        log('⚠️ ModelInfoExtractorが利用できません', 'warn');
                    }
                    
                    // FunctionInfoExtractorを使用
                    if (window.FunctionInfoExtractor) {
                        displayedFunction = window.FunctionInfoExtractor.extract('ChatGPT') || '';
                        log(`📊 FunctionInfoExtractor結果: "${displayedFunction}"`, 'info');
                        
                        // 空文字の場合の診断
                        if (!displayedFunction) {
                            log('⚠️ 機能情報が取得できませんでした。UIの状態を診断します...', 'warn');
                            
                            // Canvas パネルの存在確認
                            const canvasPanel = document.querySelector('#prosemirror-editor-container');
                            log(`  - Canvasパネル (#prosemirror-editor-container): ${canvasPanel ? '存在' : '存在しない'}`, 'info');
                            
                            // 機能ボタンの確認
                            const pillButtons = document.querySelectorAll('button[data-pill="true"]');
                            log(`  - 機能ボタン (data-pill="true"): ${pillButtons.length}個`, 'info');
                            if (pillButtons.length > 0) {
                                pillButtons.forEach((btn, idx) => {
                                    log(`    [${idx}] ${btn.textContent?.trim() || '(テキストなし)'}`, 'info');
                                });
                            }
                            
                            // メニュー項目の確認
                            const checkedItems = document.querySelectorAll('[role="menuitemradio"][aria-checked="true"]');
                            log(`  - 選択されたメニュー項目: ${checkedItems.length}個`, 'info');
                            if (checkedItems.length > 0) {
                                checkedItems.forEach((item, idx) => {
                                    log(`    [${idx}] ${item.textContent?.trim() || '(テキストなし)'}`, 'info');
                                });
                            }
                        }
                    } else {
                        log('⚠️ FunctionInfoExtractorが利用できません', 'warn');
                    }
                } catch (e) {
                    log(`❌ モデル/機能情報の取得エラー: ${e.message}`, 'error');
                    console.error(e);
                }
                
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
            log(`❌ 送信・応答取得エラー: ${error.message}`, 'error');
            return { success: false, error: error.message };
        }
    }
    
    // ========================================
    // グローバル公開
    // ========================================
    window.ChatGPTAutomationV2 = {
        executeTask,
        runAutomation,
        // フェーズ別メソッド（順次処理用）
        inputTextOnly,
        selectModelOnly,
        selectFunctionOnly,
        sendAndGetResponse
    };
    
    console.log('✅ ChatGPT Automation V2 準備完了');
    console.log('使用方法: ChatGPTAutomationV2.executeTask({ model: "GPT-4o", function: "Deep Research", prompt: "..." })');
    
})();