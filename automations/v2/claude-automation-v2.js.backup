/**
 * @fileoverview Claude Automation V2 - スプレッドシート直接実行版
 * 
 * 特徴:
 * - モデルと機能の事前探索なし
 * - スプレッドシートから直接実行
 * - Deep Research対応（最大40分待機）
 * 
 * @version 2.0.0
 */
(function() {
    'use strict';
    
    console.log('%c🚀 Claude Automation V2 初期化', 'color: #9C27B0; font-weight: bold; font-size: 16px');
    
    // ========================================
    // セレクタ定義（提供コードから抽出）
    // ========================================
    const SELECTORS = {
        // テキスト入力
        textInput: [
            '[aria-label="クロードにプロンプトを入力してください"]',
            '.ProseMirror[contenteditable="true"]',
            '[role="textbox"][contenteditable="true"]',
            'div[contenteditable="true"][translate="no"]',
            '.ProseMirror'
        ],
        // 送信ボタン
        sendButton: [
            '[aria-label="メッセージを送信"]',
            'button[aria-label="メッセージを送信"]',
            'button.bg-accent-main-000',
            'button svg path[d*="M208.49,120.49"]'
        ],
        // 停止ボタン
        stopButton: [
            '[aria-label="応答を停止"]',
            'button[aria-label="応答を停止"]',
            'button.border-border-200[aria-label="応答を停止"]',
            'button svg path[d*="M128,20A108"]'
        ],
        // モデル関連
        modelButton: [
            'button[data-testid="model-selector-dropdown"]',
            'button[aria-haspopup="menu"]',
            'button.inline-flex.items-center.justify-center'
        ],
        modelMenu: [
            '[role="menu"][data-state="open"]',
            '[data-radix-menu-content][data-state="open"]',
            'div.z-dropdown[role="menu"]'
        ],
        otherModelsMenu: [
            '[role="menuitem"][aria-haspopup="menu"]',
            '[role="menuitem"]:has(svg)',
            'div[role="menuitem"]:last-child'
        ],
        // 機能関連
        featureMenuButton: [
            '[data-testid="input-menu-tools"]',
            '[aria-label="ツールメニューを開く"]',
            '#input-tools-menu-trigger',
            'button svg path[d*="M40,88H73a32"]'
        ],
        featureMenu: [
            '[aria-labelledby="input-tools-menu-trigger"]',
            '.w-\\[20rem\\].absolute.max-w-\\[calc\\(100vw-16px\\)\\].block',
            'div.z-dropdown.bg-bg-000.rounded-xl'
        ],
        // トグルスイッチ
        toggleSwitch: 'input[role="switch"]',
        // リサーチボタン
        researchButton: [
            'button[aria-pressed]:has(svg path[d*="M8.5 2C12.0899"])',
            'button:has(p:contains("リサーチ"))',
            'button.text-accent-secondary-100:has(svg)'
        ],
        // Canvas関連
        canvasOpenButton: [
            '[aria-label="内容をプレビュー"]',
            '[role="button"][aria-label="内容をプレビュー"]',
            '.artifact-block-cell'
        ],
        canvasText: [
            '#markdown-artifact',
            '[id="markdown-artifact"]',
            '.font-claude-response#markdown-artifact'
        ],
        // 通常テキスト
        normalText: [
            '.standard-markdown',
            'div.standard-markdown',
            '.grid.gap-2\\.5.standard-markdown'
        ]
    };
    
    // ========================================
    // ユーティリティ関数
    // ========================================
    const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    
    const log = (message, type = 'info') => {
        const timestamp = new Date().toLocaleTimeString('ja-JP', { 
            hour12: false, 
            hour: '2-digit', 
            minute: '2-digit', 
            second: '2-digit' 
        });
        
        const styles = {
            info: 'color: #2196F3',
            success: 'color: #4CAF50',
            warning: 'color: #FF9800',
            error: 'color: #F44336',
            step: 'color: #9C27B0; font-weight: bold'
        };
        
        console.log(`%c[${timestamp}] ${message}`, styles[type] || styles.info);
    };
    
    const findElement = async (selectors, maxRetries = 3) => {
        for (let retry = 0; retry < maxRetries; retry++) {
            for (const selector of selectors) {
                try {
                    // SVGパス経由の検索
                    if (selector.includes('svg path')) {
                        const paths = document.querySelectorAll(selector);
                        if (paths.length > 0) {
                            const button = paths[0].closest('button');
                            if (button && isElementInteractable(button)) {
                                return button;
                            }
                        }
                    }
                    
                    const element = document.querySelector(selector);
                    if (element && isElementInteractable(element)) {
                        return element;
                    }
                } catch (e) {
                    // セレクタエラーを無視
                }
            }
            
            if (retry < maxRetries - 1) {
                await wait(500);
            }
        }
        return null;
    };
    
    const isElementInteractable = (element) => {
        if (!element) return false;
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return rect.width > 0 && 
               rect.height > 0 && 
               style.display !== 'none' && 
               style.visibility !== 'hidden' && 
               style.opacity !== '0';
    };
    
    const findElementByText = (selector, text, parent = document) => {
        const elements = parent.querySelectorAll(selector);
        for (const el of elements) {
            const elementText = el.textContent || '';
            if (elementText.includes(text)) {
                return el;
            }
        }
        return null;
    };
    
    const getCleanText = (element) => {
        if (!element) return '';
        const clone = element.cloneNode(true);
        // 装飾要素を削除
        const decorativeElements = clone.querySelectorAll('mat-icon, mat-ripple, svg, .icon, .ripple');
        decorativeElements.forEach(el => el.remove());
        return clone.textContent?.trim() || '';
    };
    
    // ========================================
    // モデル選択
    // ========================================
    async function selectModel(modelName) {
        // Auto/default/空の場合はデフォルトモデルを明示的に選択
        const useDefault = !modelName || modelName === '' || modelName === 'default' || 
                          (typeof modelName === 'string' && modelName.toLowerCase() === 'auto');
        
        if (useDefault) {
            log('デフォルトモデル（Claude 3.5 Sonnet）を選択', 'info');
            modelName = 'Claude 3.5 Sonnet';  // デフォルトモデルを明示的に指定
        } else {
            log(`モデル選択: ${modelName}`, 'step');
        }
        
        try {
            // 常にモデルメニューを開く（Autoでも開く）
            const modelButton = await findElement(SELECTORS.modelButton);
            if (!modelButton) {
                log('モデルボタンが見つかりません', 'warning');
                return false;
            }
            
            modelButton.click();
            await wait(1500);
            
            const modelMenu = await findElement(SELECTORS.modelMenu);
            if (!modelMenu) {
                log('モデルメニューが開きませんでした', 'warning');
                return false;
            }
            
            // メインメニューから探す
            const menuItems = modelMenu.querySelectorAll('[role="menuitem"]:not([aria-haspopup="menu"])');
            let targetItem = null;
            
            for (const item of menuItems) {
                const text = getCleanText(item);
                if (text.toLowerCase().includes(modelName.toLowerCase()) ||
                    modelName.toLowerCase().includes(text.toLowerCase())) {
                    targetItem = item;
                    break;
                }
            }
            
            // 他のモデルメニューから探す
            if (!targetItem) {
                const otherModelsButton = modelMenu.querySelector('[role="menuitem"][aria-haspopup="menu"]');
                if (otherModelsButton) {
                    otherModelsButton.click();
                    await wait(1000);
                    
                    const subMenuItems = document.querySelectorAll('[role="menu"][data-state="open"]:last-child [role="menuitem"]');
                    for (const item of subMenuItems) {
                        const text = getCleanText(item);
                        if (text.toLowerCase().includes(modelName.toLowerCase()) ||
                            modelName.toLowerCase().includes(text.toLowerCase())) {
                            targetItem = item;
                            break;
                        }
                    }
                }
            }
            
            if (targetItem) {
                targetItem.click();
                await wait(2000);
                log(`モデル選択完了: ${modelName}`, 'success');
                return true;
            } else {
                log(`モデル "${modelName}" が見つかりません`, 'warning');
                // メニューを閉じる
                const escapeEvent = new KeyboardEvent('keydown', {
                    key: 'Escape',
                    code: 'Escape',
                    bubbles: true
                });
                document.dispatchEvent(escapeEvent);
                await wait(500);
                return false;
            }
            
        } catch (error) {
            log(`モデル選択エラー: ${error.message}`, 'error');
            return false;
        }
    }
    
    // ========================================
    // 機能選択
    // ========================================
    async function selectFeature(featureName) {
        // null、undefined、空文字、'none'、'通常'の場合は通常モード
        if (!featureName || featureName === '' || featureName === 'none' || featureName === '通常') {
            log('通常モードを使用', 'info');
            return true;
        }
        
        log(`機能選択: ${featureName}`, 'step');
        
        // Deep Research判定
        const isDeepResearch = featureName.toLowerCase().includes('research') || 
                               featureName.toLowerCase().includes('リサーチ');
        
        try {
            // メニューを開く
            const menuButton = await findElement(SELECTORS.featureMenuButton);
            if (!menuButton) {
                log('機能メニューボタンが見つかりません', 'warning');
                return false;
            }
            
            menuButton.click();
            await wait(1500);
            
            const featureMenu = await findElement(SELECTORS.featureMenu);
            if (!featureMenu) {
                log('機能メニューが開きませんでした', 'warning');
                return false;
            }
            
            if (isDeepResearch) {
                // Deep Researchの場合: ウェブ検索をオンにする
                const webSearchButton = findElementByText('button:has(input[role="switch"])', 'ウェブ検索', featureMenu);
                if (webSearchButton) {
                    const toggle = webSearchButton.querySelector('input[role="switch"]');
                    if (toggle && !toggle.checked) {
                        webSearchButton.click();
                        await wait(1000);
                        log('ウェブ検索を有効化', 'success');
                    }
                }
                
                // メニューを閉じる
                menuButton.click();
                await wait(1000);
                
                // リサーチボタンを探してクリック
                const researchButton = await findElement(SELECTORS.researchButton);
                if (researchButton) {
                    const isPressed = researchButton.getAttribute('aria-pressed') === 'true';
                    if (!isPressed) {
                        researchButton.click();
                        await wait(1000);
                        log('リサーチモードを有効化', 'success');
                    }
                }
            } else {
                // その他の機能
                const featureButtons = featureMenu.querySelectorAll('button:has(input[role="switch"])');
                let found = false;
                
                for (const button of featureButtons) {
                    const label = button.querySelector('p.font-base');
                    if (label && label.textContent.includes(featureName)) {
                        const toggle = button.querySelector('input[role="switch"]');
                        if (toggle && !toggle.checked) {
                            button.click();
                            await wait(1000);
                            log(`機能 "${featureName}" を有効化`, 'success');
                            found = true;
                            break;
                        }
                    }
                }
                
                if (!found) {
                    log(`機能 "${featureName}" が見つかりません`, 'warning');
                }
                
                // メニューを閉じる
                menuButton.click();
                await wait(500);
            }
            
            return true;
            
        } catch (error) {
            log(`機能選択エラー: ${error.message}`, 'error');
            return false;
        }
    }
    
    // ========================================
    // Deep Research特別処理
    // ========================================
    async function handleDeepResearchWaiting() {
        log('【Deep Research特別処理】開始（最大40分待機）', 'step');
        
        try {
            // ステップ1-1: 停止ボタンが出てくるまで待機
            log('停止ボタンの出現を待機中...', 'info');
            
            let stopButtonFound = false;
            let waitCount = 0;
            const maxInitialWait = 120; // 初期待機最大2分
            
            while (!stopButtonFound && waitCount < maxInitialWait) {
                const stopButton = await findElement(SELECTORS.stopButton, 1);
                
                if (stopButton) {
                    stopButtonFound = true;
                    log('停止ボタンが出現しました', 'success');
                    break;
                }
                
                await wait(1000);
                waitCount++;
                
                if (waitCount % 30 === 0) {
                    log(`待機中... ${waitCount}秒経過`, 'info');
                }
            }
            
            if (!stopButtonFound) {
                log('停止ボタンが表示されませんでした', 'warning');
                return false;
            }
            
            // ステップ1-2: 2分間待機して停止ボタンの状態を確認
            log('2分間待機して停止ボタンの状態を確認', 'info');
            const startTime = Date.now();
            let disappeared = false;
            
            while ((Date.now() - startTime) < 120000) { // 2分間
                const stopButton = await findElement(SELECTORS.stopButton, 1);
                
                if (!stopButton) {
                    disappeared = true;
                    log('停止ボタンが消滅しました（2分以内）', 'warning');
                    break;
                }
                
                await wait(5000); // 5秒ごとにチェック
                
                const elapsed = Math.floor((Date.now() - startTime) / 1000);
                if (elapsed % 30 === 0) {
                    log(`Deep Research処理中... ${elapsed}秒経過`, 'info');
                }
            }
            
            // ステップ1-3: 2分以内に消滅した場合、再送信
            if (disappeared) {
                log('「いいから元のプロンプトを確認して作業をして」を送信', 'step');
                
                const input = await findElement(SELECTORS.textInput);
                if (input) {
                    await inputText(input, 'いいから元のプロンプトを確認して作業をして');
                    await wait(1000);
                    
                    const sendButton = await findElement(SELECTORS.sendButton);
                    if (sendButton) {
                        await clickButton(sendButton);
                        log('再送信完了', 'success');
                    }
                }
            }
            
            // ステップ1-4: 停止ボタンが出現するまで待機
            log('停止ボタンが再出現するまで待機', 'info');
            stopButtonFound = false;
            waitCount = 0;
            const maxWaitCount = 2400; // 最大40分
            
            while (!stopButtonFound && waitCount < maxWaitCount) {
                const stopButton = await findElement(SELECTORS.stopButton, 1);
                
                if (stopButton) {
                    stopButtonFound = true;
                    log(`停止ボタンが出現しました（${Math.floor(waitCount/60)}分${waitCount%60}秒後）`, 'success');
                    break;
                }
                
                await wait(1000);
                waitCount++;
                
                if (waitCount % 60 === 0) {
                    log(`Deep Research処理中... ${Math.floor(waitCount/60)}分経過`, 'info');
                }
            }
            
            // ステップ1-5: 停止ボタンが10秒間消滅するまで待機
            if (stopButtonFound) {
                log('停止ボタンが10秒間消滅するまで待機', 'info');
                let stopButtonGone = false;
                let disappearWaitCount = 0;
                const maxDisappearWait = 2400; // 最大40分
                
                while (!stopButtonGone && disappearWaitCount < maxDisappearWait) {
                    const stopButton = await findElement(SELECTORS.stopButton, 1);
                    
                    if (!stopButton) {
                        // 10秒間確認
                        let confirmCount = 0;
                        let stillGone = true;
                        
                        while (confirmCount < 10) {
                            await wait(1000);
                            const checkResult = await findElement(SELECTORS.stopButton, 1);
                            if (checkResult) {
                                stillGone = false;
                                break;
                            }
                            confirmCount++;
                        }
                        
                        if (stillGone) {
                            stopButtonGone = true;
                            log(`Deep Research完了（総時間: ${Math.floor(disappearWaitCount/60)}分）`, 'success');
                            break;
                        }
                    }
                    
                    await wait(1000);
                    disappearWaitCount++;
                    
                    if (disappearWaitCount % 60 === 0) {
                        log(`Deep Research生成中... ${Math.floor(disappearWaitCount/60)}分経過`, 'info');
                    }
                }
            }
            
            await wait(2000);
            return true;
            
        } catch (error) {
            log(`Deep Research待機処理エラー: ${error.message}`, 'error');
            return false;
        }
    }
    
    // ========================================
    // 通常モード待機処理
    // ========================================
    async function handleNormalWaiting() {
        log('通常モード待機処理', 'info');
        
        // 停止ボタンが表示されるまで待機
        let stopButton = null;
        for (let i = 0; i < 30; i++) {
            stopButton = await findElement(SELECTORS.stopButton, 1);
            if (stopButton) {
                log('停止ボタンが表示されました', 'success');
                break;
            }
            await wait(1000);
        }
        
        // 停止ボタンが消えるまで待機（最大5分）
        if (stopButton) {
            log('応答完了を待機中（最大5分）...', 'info');
            for (let i = 0; i < 300; i++) {
                stopButton = await findElement(SELECTORS.stopButton, 1);
                if (!stopButton) {
                    log('応答完了', 'success');
                    break;
                }
                if (i % 30 === 0 && i > 0) {
                    log(`待機中... (${i}秒経過)`, 'info');
                }
                await wait(1000);
            }
        }
        
        await wait(2000);
        return true;
    }
    
    // ========================================
    // テキスト入力
    // ========================================
    async function inputText(element, text) {
        element.focus();
        await wait(100);
        
        element.textContent = '';
        
        const placeholderP = element.querySelector('p.is-empty');
        if (placeholderP) {
            placeholderP.remove();
        }
        
        const p = document.createElement('p');
        p.textContent = text;
        element.appendChild(p);
        
        element.classList.remove('ql-blank');
        
        const inputEvent = new Event('input', { bubbles: true, cancelable: true });
        const changeEvent = new Event('change', { bubbles: true, cancelable: true });
        
        element.dispatchEvent(inputEvent);
        element.dispatchEvent(changeEvent);
    }
    
    // ========================================
    // ボタンクリック
    // ========================================
    async function clickButton(button) {
        button.focus();
        await wait(50);
        
        const mousedown = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
        const mouseup = new MouseEvent('mouseup', { bubbles: true, cancelable: true });
        const click = new MouseEvent('click', { bubbles: true, cancelable: true });
        
        button.dispatchEvent(mousedown);
        await wait(10);
        button.dispatchEvent(mouseup);
        await wait(10);
        button.dispatchEvent(click);
        
        button.click();
    }
    
    // ========================================
    // 応答テキスト取得
    // ========================================
    async function getResponseText() {
        log('応答テキスト取得', 'step');
        
        let canvasText = '';
        let normalText = '';
        
        // Canvas機能のテキスト取得
        let canvasElement = await findElement(SELECTORS.canvasText, 1);
        
        // Canvas開くボタンを試す
        if (!canvasElement) {
            const openButton = await findElement(SELECTORS.canvasOpenButton, 1);
            if (openButton) {
                log('Canvas機能を開きます', 'info');
                await clickButton(openButton);
                await wait(1000);
                canvasElement = await findElement(SELECTORS.canvasText, 1);
            }
        }
        
        if (canvasElement) {
            canvasText = canvasElement.textContent?.trim() || '';
            if (canvasText) {
                log(`Canvas テキスト取得: ${canvasText.length}文字`, 'success');
            }
        }
        
        // 通常処理のテキスト取得
        const normalElements = document.querySelectorAll('.standard-markdown');
        
        if (normalElements.length > 0) {
            // Canvas要素内を除外してフィルタリング
            const filtered = Array.from(normalElements).filter(el => {
                return !el.closest('#markdown-artifact') && 
                       !el.closest('[class*="artifact"]');
            });
            
            if (filtered.length > 0) {
                // 最後の要素（最新の応答）を取得
                const targetElement = filtered[filtered.length - 1];
                normalText = targetElement.textContent?.trim() || '';
                if (normalText) {
                    log(`通常テキスト取得: ${normalText.length}文字`, 'success');
                }
            }
        }
        
        // どちらかのテキストを返す（Canvasを優先）
        return canvasText || normalText || '';
    }
    
    // ========================================
    // メイン実行関数
    // ========================================
    async function executeTask(taskData) {
        console.log('🚀 Claude V2 タスク実行開始', taskData);
        
        try {
            // タスクデータから情報を取得（スプレッドシートの値をそのまま使用）
            const modelName = taskData.model;  // そのまま（変換しない）
            const featureName = taskData.function;  // そのまま（変換しない）
            const promptText = taskData.prompt || taskData.text || '';
            
            if (!promptText) {
                throw new Error('プロンプトが指定されていません');
            }
            
            // 1. テキスト入力
            log('テキスト入力', 'step');
            const input = await findElement(SELECTORS.textInput);
            if (!input) {
                throw new Error('入力欄が見つかりません');
            }
            await inputText(input, promptText);
            log('テキスト入力完了', 'success');
            await wait(1000);
            
            // 2. モデル選択
            await selectModel(modelName);
            
            // 3. 機能選択
            await selectFeature(featureName);
            
            // 4. メッセージ送信
            log('メッセージ送信', 'step');
            const sendButton = await findElement(SELECTORS.sendButton);
            if (!sendButton) {
                throw new Error('送信ボタンが見つかりません');
            }
            await clickButton(sendButton);
            log('送信完了', 'success');
            await wait(1000);
            
            // 5. 応答待機
            const isDeepResearch = featureName && (
                featureName.toLowerCase().includes('research') || 
                featureName.toLowerCase().includes('リサーチ')
            );
            
            if (isDeepResearch) {
                await handleDeepResearchWaiting();
            } else {
                await handleNormalWaiting();
            }
            
            // 6. テキスト取得
            const responseText = await getResponseText();
            
            if (responseText) {
                console.log('✅ Claude V2 タスク実行完了');
                return {
                    success: true,
                    response: responseText
                };
            } else {
                throw new Error('応答テキストを取得できませんでした');
            }
            
        } catch (error) {
            console.error('❌ Claude V2 タスク実行エラー:', error);
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
    window.ClaudeAutomationV2 = {
        executeTask,
        runAutomation
    };
    
    console.log('✅ Claude Automation V2 準備完了');
    console.log('使用方法: ClaudeAutomationV2.executeTask({ model: "Opus 4.1", function: "Deep Research", prompt: "..." })');
    
})();