/**
 * @fileoverview ChatGPT Automation V2 - テスト済みコードベース版
 * 
 * 特徴:
 * - テスト済みのロジックをそのまま使用
 * - モデル選択・機能選択・応答待機・テキスト取得の完全移植
 * - Deep Research/エージェントモード対応（最大40分待機）
 * 
 * @version 2.1.0
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
        console.log('%c🚀 ChatGPT V2 タスク実行開始', 'color: #00BCD4; font-weight: bold; font-size: 16px');
        console.log('受信したタスクデータ:', {
            model: taskData.model,
            function: taskData.function,
            promptLength: taskData.prompt?.length || taskData.text?.length || 0,
            hasPrompt: !!(taskData.prompt || taskData.text)
        });
        
        try {
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
                
                funcMenuBtn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
                await sleep(100);
                funcMenuBtn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
                await sleep(1500);
                
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
                    const moreBtn = findElementByText('[role="menuitem"]', 'さらに表示');
                    if (moreBtn) {
                        moreBtn.click();
                        
                        // サブメニューが表示されるまで待機（最大3秒）
                        let subMenu = null;
                        for (let i = 0; i < 6; i++) {
                            await sleep(500);
                            subMenu = document.querySelector('[data-side="right"]');
                            if (subMenu) {
                                console.log(`✅ [機能検索] サブメニューが表示されました (${(i + 1) * 0.5}秒後)`);
                                break;
                            }
                        }
                        
                        // 6-3: サブメニューで機能を探す
                        log('6-3. サブメニューで機能を選択', 'step');
                        if (subMenu) {
                            // 追加で少し待機してメニュー項目が完全にレンダリングされるのを待つ
                            await sleep(500);
                            // セレクタのバリエーションを試す
                            featureElement = findElementByText('[role="menuitemradio"]', mappedFeatureName, subMenu);
                            console.log(`🔍 [機能検索] サブメニューで "${mappedFeatureName}" を検索: ${featureElement ? '見つかった' : '見つからない'}`);
                        } else {
                            console.log(`⚠️ [機能検索] サブメニューが見つかりません（3秒待機後）`);
                        }
                    } else {
                        console.log(`⚠️ [機能検索] "さらに表示"ボタンが見つかりません`);
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
            
            // ui-selectorsから取得、フォールバック付き
            const textSelectors = ChatGPTSelectors.TEXT_EXTRACTION || {
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
                    '#canvas-content',
                    '[data-testid="canvas-content"]',
                    'div[class*="canvas"]',
                    'div[class*="artifact"]',
                    '.prose-mirror',
                    '[contenteditable="false"] .markdown'
                ]
            };
            
            // 方法1: アシスタントメッセージから取得
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
            
            // 方法2: Canvas/Artifact機能の内容を取得
            if (!responseText) {
                for (const selector of textSelectors.CANVAS_ARTIFACT) {
                    const elements = document.querySelectorAll(selector);
                    for (const elem of elements) {
                        // アシスタントメッセージ内にあるものは除外
                        if (!elem.closest('[data-message-author-role]')) {
                            const text = elem.textContent?.trim() || '';
                            if (text && text.length > 10) {
                                responseText = text;
                                log(`Canvas/Artifact取得成功 (${selector}): ${text.length}文字`, 'success');
                                log(`最初の100文字: ${text.substring(0, 100)}...`, 'info');
                                break;
                            }
                        }
                    }
                    if (responseText) break;
                }
            }
            
            if (responseText) {
                console.log('✅ ChatGPT V2 タスク実行完了');
                return {
                    success: true,
                    response: responseText
                };
            } else {
                throw new Error('応答テキストを取得できませんでした');
            }
            
        } catch (error) {
            console.error('❌ ChatGPT V2 タスク実行エラー:', error);
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
        return executeTask({
            model: config.model,
            function: config.function,
            prompt: config.text || config.prompt
        });
    }
    
    // ========================================
    // グローバル公開
    // ========================================
    window.ChatGPTAutomationV2 = {
        executeTask,
        runAutomation
    };
    
    console.log('✅ ChatGPT Automation V2 準備完了');
    console.log('使用方法: ChatGPTAutomationV2.executeTask({ model: "GPT-4o", function: "Deep Research", prompt: "..." })');
    
})();