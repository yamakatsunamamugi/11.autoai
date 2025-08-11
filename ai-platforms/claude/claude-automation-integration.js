// Claude自動操作統合スクリプト
// 提供された検証コードを既存システムに統合

(function() {
    'use strict';
    
    // ===== 既存システムへの統合用インターフェース =====
    class ClaudeAutomationIntegration {
        constructor() {
            // 提供されたコードのCONFIG設定をそのまま使用
            this.CONFIG = {
                models: {
                    available: [
                        { name: 'Claude Opus 4.1', searchText: 'Claude Opus 4.1' },
                        { name: 'Claude Sonnet 4', searchText: 'Claude Sonnet 4' }
                    ]
                },
                features: {
                    available: [
                        { name: 'じっくり考える', type: 'toggle', index: 1 },
                        { name: 'ウェブ検索', type: 'toggle', index: 2 },
                        { name: 'スタイル', type: 'button', index: 3, displayName: 'スタイル使用' }
                    ]
                },
                text: {
                    testMessage: '桃太郎について歴史観点も含めて解説して。Canvas機能を活用して'
                },
                timeouts: {
                    shortWait: 500,
                    normalWait: 1500,
                    longWait: 2000,
                    textWait: 5000,
                    clickDelay: 50,
                    maxResponseWait: 60000
                },
                validation: {
                    maxRetryCount: 12,
                    consecutiveNotFoundThreshold: 1,
                    minSuccessConditions: 2
                }
            };
            
            this.isRunning = false;
        }
        
        // 設定を動的に更新するメソッド
        updateConfig(model, features, text) {
            // モデル設定を更新
            if (model) {
                const modelConfig = this.CONFIG.models.available.find(m => 
                    m.name.includes(model) || m.searchText.includes(model)
                );
                if (modelConfig) {
                    this.selectedModel = modelConfig;
                }
            }
            
            // 機能設定を更新
            if (features && Array.isArray(features)) {
                this.selectedFeatures = features.map(f => 
                    this.CONFIG.features.available.find(feat => feat.name === f)
                ).filter(Boolean);
            }
            
            // テキスト設定を更新
            if (text) {
                this.CONFIG.text.testMessage = text;
            }
        }
        
        // 提供されたコードをClaude内で実行
        async executeInClaude(options = {}) {
            const { model, features, text } = options;
            
            // 設定を更新
            this.updateConfig(model, features, text);
            
            // 提供されたコードを実行するための関数を生成
            const executionCode = this.generateExecutionCode();
            
            // Claudeのウィンドウ/タブで実行
            return await this.runInClaudeContext(executionCode);
        }
        
        // 実行コードを生成
        generateExecutionCode() {
            const config = JSON.stringify(this.CONFIG);
            
            // 提供されたコードをそのまま使用（一部調整）
            return `
            (async function() {
                'use strict';
                
                const CONFIG = ${config};
                const TestResults = {
                    startTime: new Date(),
                    logs: [],
                    errors: [],
                    modelClickSuccess: null,
                    modelSwitchSuccess: {},
                    featureClickSuccess: null,
                    featureActivateSuccess: {},
                    submitClickSuccess: null,
                    canvasSetup: null,
                    modelElements: [],
                    featureElements: [],
                    feature11Elements: {},
                    elementMatchResults: {}
                };
                
                function log(step, message, type = 'INFO') {
                    const timestamp = new Date().toLocaleTimeString();
                    const logEntry = \`[\${timestamp}] [\${type}] ステップ\${step}: \${message}\`;
                    console.log(type === 'ERROR' ? \`❌ \${logEntry}\` : 
                               type === 'SUCCESS' ? \`✅ \${logEntry}\` : 
                               type === 'WARNING' ? \`⚠️ \${logEntry}\` : logEntry);
                    TestResults.logs.push(logEntry);
                    if (type === 'ERROR') TestResults.errors.push(logEntry);
                    
                    // 親ウィンドウに通知
                    window.parent.postMessage({
                        type: 'CLAUDE_AUTOMATION_LOG',
                        data: { step, message, type, timestamp }
                    }, '*');
                }
                
                async function wait(ms) {
                    await new Promise(resolve => setTimeout(resolve, ms));
                }
                
                function getReactProps(element) {
                    const key = Object.keys(element).find(key => 
                        key.startsWith('__reactInternalInstance') || key.startsWith('__reactFiber')
                    );
                    if (key) {
                        const fiberNode = element[key];
                        if (fiberNode && fiberNode.memoizedProps) {
                            return fiberNode.memoizedProps;
                        }
                    }
                    return null;
                }
                
                ${this.getPerformClickFunction()}
                ${this.getStep1Function()}
                ${this.getStep2Function()}
                ${this.getStep3Function()}
                ${this.getStep4Function()}
                ${this.getStep5Function()}
                
                // メイン実行
                try {
                    await step1_ModelButtonResearch();
                    await wait(CONFIG.timeouts.longWait);
                    
                    await step2_ModelSelectionCheck();
                    await wait(CONFIG.timeouts.longWait);
                    
                    await step3_FeatureButtonResearch();
                    await wait(CONFIG.timeouts.longWait);
                    
                    await step4_FeatureSelectionCheck();
                    await wait(CONFIG.timeouts.longWait);
                    
                    await step5_ActualOperationCheck();
                    
                    // 結果を親ウィンドウに送信
                    window.parent.postMessage({
                        type: 'CLAUDE_AUTOMATION_COMPLETE',
                        data: TestResults
                    }, '*');
                    
                } catch (e) {
                    console.error('致命的エラー:', e);
                    window.parent.postMessage({
                        type: 'CLAUDE_AUTOMATION_ERROR',
                        data: { error: e.message }
                    }, '*');
                }
            })();
            `;
        }
        
        // performClick関数を取得
        getPerformClickFunction() {
            return `
            async function performClick(element, stepNum) {
                const clickMethods = [
                    {
                        name: 'PointerEventWithCoords',
                        fn: async (el) => {
                            const rect = el.getBoundingClientRect();
                            const x = rect.left + rect.width / 2;
                            const y = rect.top + rect.height / 2;
                            
                            el.dispatchEvent(new PointerEvent('pointerdown', {
                                bubbles: true,
                                cancelable: true,
                                view: window,
                                clientX: x,
                                clientY: y,
                                pointerId: 1
                            }));
                            
                            await new Promise(r => setTimeout(r, CONFIG.timeouts.clickDelay));
                            
                            el.dispatchEvent(new PointerEvent('pointerup', {
                                bubbles: true,
                                cancelable: true,
                                view: window,
                                clientX: x,
                                clientY: y,
                                pointerId: 1
                            }));
                            
                            el.click();
                        }
                    },
                    {
                        name: 'ReactClick',
                        fn: async (el) => {
                            const props = getReactProps(el);
                            if (props && props.onClick) {
                                const event = new MouseEvent('click', {
                                    bubbles: true,
                                    cancelable: true,
                                    view: window
                                });
                                Object.defineProperty(event, 'target', {
                                    value: el,
                                    enumerable: true
                                });
                                props.onClick(event);
                            } else {
                                el.click();
                            }
                        }
                    },
                    {
                        name: 'DirectClick',
                        fn: (el) => {
                            el.click();
                        }
                    }
                ];
                
                if (element.disabled || element.getAttribute('aria-disabled') === 'true') {
                    log(stepNum, '要素が無効化されています', 'WARNING');
                    return null;
                }
                
                for (const method of clickMethods) {
                    try {
                        log(stepNum, \`\${method.name}方式でクリック試行中\`);
                        
                        const beforeExpanded = element.getAttribute('aria-expanded');
                        const beforeState = element.getAttribute('data-state');
                        
                        await method.fn(element);
                        await wait(CONFIG.timeouts.normalWait);
                        
                        const afterExpanded = element.getAttribute('aria-expanded');
                        const afterState = element.getAttribute('data-state');
                        
                        const menuOpened = 
                            (beforeExpanded === 'false' && afterExpanded === 'true') ||
                            (beforeState === 'closed' && afterState === 'open') ||
                            document.querySelector('[role="menu"][data-state="open"]') !== null;
                        
                        if (menuOpened) {
                            log(stepNum, \`\${method.name}方式でクリック成功\`, 'SUCCESS');
                            return method.name;
                        }
                        
                        if (element.getAttribute('aria-label') === 'メッセージを送信') {
                            const stopButton = document.querySelector('[aria-label="応答を停止"]');
                            if (stopButton) {
                                log(stepNum, \`\${method.name}方式でクリック成功\`, 'SUCCESS');
                                return method.name;
                            }
                        }
                    } catch (e) {
                        log(stepNum, \`\${method.name}方式でエラー: \${e.message}\`, 'ERROR');
                    }
                }
                
                return null;
            }
            
            async function performModelItemClick(element, stepNum, modelName) {
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
                    
                    await new Promise(r => setTimeout(r, CONFIG.timeouts.clickDelay));
                    
                    element.dispatchEvent(new PointerEvent('pointerup', {
                        bubbles: true,
                        cancelable: true,
                        view: window,
                        clientX: x,
                        clientY: y,
                        pointerId: 1
                    }));
                    
                    element.click();
                    
                    let menuClosedAutomatically = false;
                    for (let i = 0; i < 10; i++) {
                        await wait(CONFIG.timeouts.shortWait);
                        const menuStillOpen = document.querySelector('[role="menu"][data-state="open"]');
                        if (!menuStillOpen) {
                            menuClosedAutomatically = true;
                            break;
                        }
                    }
                    
                    if (menuClosedAutomatically) {
                        log(stepNum, \`\${modelName}への切り替え成功 - メニュー自動終了確認\`, 'SUCCESS');
                        return true;
                    }
                    
                    return false;
                } catch (e) {
                    log(stepNum, \`モデルクリックエラー: \${e.message}\`, 'ERROR');
                    return false;
                }
            }
            `;
        }
        
        // Step1関数を取得（モデル選択）
        getStep1Function() {
            return `
            async function step1_ModelButtonResearch() {
                log('1', 'モデル選択関係のボタンリサーチ開始');
                
                try {
                    log('1-1', '「7.モデル選択ボタン」があるかチェック');
                    
                    let modelButton = document.querySelector('[data-testid="model-selector-dropdown"]');
                    if (!modelButton) {
                        modelButton = document.querySelector('button[aria-haspopup="menu"]');
                    }
                    if (!modelButton) {
                        modelButton = Array.from(document.querySelectorAll('button'))
                            .find(el => el.textContent && (el.textContent.includes('Opus') || el.textContent.includes('Sonnet')));
                    }
                    
                    if (!modelButton) {
                        log('1-1', 'モデル選択ボタンが見つかりません。UIを修正してください。', 'ERROR');
                        return;
                    }
                    
                    log('1-1', 'モデル選択ボタンを発見', 'SUCCESS');
                    TestResults.elementMatchResults['7. モデル選択ボタン'] = true;
                    
                    const clickMethod = await performClick(modelButton, '1-2');
                    if (clickMethod) {
                        TestResults.modelClickSuccess = clickMethod;
                        log('1-2', \`{1.モデルクリック成功例}: \${clickMethod}\`, 'SUCCESS');
                    }
                    
                    await wait(CONFIG.timeouts.longWait);
                    
                    const modelMenu = document.querySelector('[role="menu"][data-state="open"]') ||
                                     document.querySelector('[role="menu"]');
                    
                    if (!modelMenu) {
                        log('1-3', 'モデルメニューが開かれていません', 'ERROR');
                        return;
                    }
                    
                    log('1-3', 'モデルメニューが開きました', 'SUCCESS');
                    
                    const menuItems = Array.from(document.querySelectorAll('[role="menuitem"]'));
                    
                    CONFIG.models.available.forEach((model, index) => {
                        const item = menuItems.find(el => el.textContent && el.textContent.includes(model.searchText));
                        if (item) {
                            TestResults.modelElements.push({name: model.name, element: item});
                            log('1-4', \`8-\${index + 1}. \${model.name} を検出\`, 'SUCCESS');
                        }
                    });
                    
                    document.body.dispatchEvent(new KeyboardEvent('keydown', { 
                        key: 'Escape', 
                        code: 'Escape',
                        bubbles: true 
                    }));
                    await wait(CONFIG.timeouts.normalWait);
                    
                } catch (e) {
                    log('1', \`エラー: \${e.message}\`, 'ERROR');
                }
            }
            `;
        }
        
        // Step2関数を取得（モデル選択チェック）
        getStep2Function() {
            return `
            async function step2_ModelSelectionCheck() {
                log('2', 'モデル選択チェック開始');
                
                try {
                    for (const model of TestResults.modelElements) {
                        const modelButton = document.querySelector('[data-testid="model-selector-dropdown"]') ||
                                           document.querySelector('button[aria-haspopup="menu"]');
                        
                        if (modelButton && TestResults.modelClickSuccess) {
                            await performClick(modelButton, '2-1');
                            await wait(CONFIG.timeouts.longWait);
                        }
                        
                        const modelItem = Array.from(document.querySelectorAll('[role="menuitem"]'))
                            .find(el => el.textContent?.includes(model.name));
                            
                        if (modelItem) {
                            const switchSuccess = await performModelItemClick(modelItem, '2-2', model.name);
                            
                            if (switchSuccess) {
                                TestResults.modelSwitchSuccess[model.name] = true;
                                log('2-2', \`{2.モデル名クリック成功例}: \${model.name}\`, 'SUCCESS');
                            }
                        }
                    }
                    
                    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
                    await wait(CONFIG.timeouts.normalWait);
                    
                } catch (e) {
                    log('2', \`エラー: \${e.message}\`, 'ERROR');
                }
            }
            `;
        }
        
        // Step3関数を取得（機能選択）
        getStep3Function() {
            return `
            async function step3_FeatureButtonResearch() {
                log('3', '機能選択関係のボタンリサーチ開始');
                
                try {
                    const featureButton = document.querySelector('[data-testid="input-menu-tools"]') ||
                                         document.querySelector('[aria-label="ツールメニューを開く"]');
                    
                    if (!featureButton) {
                        log('3-1', '機能選択ボタンが見つかりません。UIを修正してください。', 'ERROR');
                        return;
                    }
                    
                    log('3-1', '機能選択ボタンを発見', 'SUCCESS');
                    
                    const clickMethod = await performClick(featureButton, '3-2');
                    if (clickMethod) {
                        TestResults.featureClickSuccess = clickMethod;
                        log('3-2', \`{3.機能選択ボタンクリック成功例}: \${clickMethod}\`, 'SUCCESS');
                    }
                    
                    await wait(CONFIG.timeouts.longWait);
                    
                    const featureMenu = document.querySelector('.relative.w-full.will-change-transform') ||
                                       document.querySelector('[class*="will-change-transform"]');
                    
                    if (!featureMenu) {
                        log('3-3', '機能メニューが開かれていません', 'ERROR');
                        return;
                    }
                    
                    log('3-3', '機能メニューが開きました', 'SUCCESS');
                    
                    CONFIG.features.available.forEach(feature => {
                        const featureElement = Array.from(document.querySelectorAll('button'))
                            .find(el => el.textContent?.includes(feature.name));
                        
                        if (featureElement) {
                            TestResults.featureElements.push({name: feature.name, element: featureElement, type: feature.type, index: feature.index});
                            log('3-4', \`10-\${feature.index}. \${feature.displayName || feature.name} を検出\`, 'SUCCESS');
                            
                            if (feature.name === 'スタイル') {
                                TestResults.canvasSetup = true;
                            }
                        }
                    });
                    
                    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
                    await wait(CONFIG.timeouts.normalWait);
                    
                } catch (e) {
                    log('3', \`エラー: \${e.message}\`, 'ERROR');
                }
            }
            `;
        }
        
        // Step4関数を取得（機能選択チェック）
        getStep4Function() {
            return `
            async function step4_FeatureSelectionCheck() {
                log('4', '機能選択チェック開始');
                
                try {
                    for (let i = 0; i < TestResults.featureElements.length; i++) {
                        const feature = TestResults.featureElements[i];
                        
                        const featureButton = document.querySelector('[data-testid="input-menu-tools"]') ||
                                             document.querySelector('[aria-label="ツールメニューを開く"]');
                        
                        if (featureButton && TestResults.featureClickSuccess) {
                            await performClick(featureButton, '4-1');
                            await wait(CONFIG.timeouts.longWait);
                        }
                        
                        const featureItem = Array.from(document.querySelectorAll('button'))
                            .find(el => el.textContent?.includes(feature.name));
                            
                        if (featureItem) {
                            const clickResult = await performClick(featureItem, '4-3');
                            if (clickResult) {
                                log('4-3', \`{機能名クリック成功例}: \${feature.name} - \${clickResult}\`, 'SUCCESS');
                                TestResults.featureActivateSuccess[feature.name] = clickResult;
                                await wait(CONFIG.timeouts.longWait);
                            }
                        }
                        
                        document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
                        await wait(CONFIG.timeouts.normalWait);
                    }
                    
                } catch (e) {
                    log('4', \`エラー: \${e.message}\`, 'ERROR');
                }
            }
            `;
        }
        
        // Step5関数を取得（実際の動作チェック）
        getStep5Function() {
            return `
            async function step5_ActualOperationCheck() {
                log('5', '実際の動作チェック開始');
                
                try {
                    const inputField = document.querySelector('[contenteditable="true"][role="textbox"]') ||
                                      document.querySelector('.ProseMirror');
                    
                    if (!inputField) {
                        log('5-1-1', 'テキスト入力欄が見つかりません', 'ERROR');
                        return;
                    }
                    log('5-1-1', 'テキスト入力欄を検出', 'SUCCESS');
                    
                    let submitButton = document.querySelector('[aria-label="メッセージを送信"]');
                    if (submitButton) {
                        log('5-1-2', '送信ボタンを検出', 'SUCCESS');
                    }
                    
                    log('5-2', \`テキストに「\${CONFIG.text.testMessage}」と入力\`);
                    inputField.focus();
                    inputField.innerHTML = \`<p>\${CONFIG.text.testMessage}</p>\`;
                    inputField.dispatchEvent(new Event('input', { bubbles: true }));
                    
                    if (TestResults.canvasSetup) {
                        log('5-2', '{Canvas設定}を実行');
                        const featureButton = document.querySelector('[data-testid="input-menu-tools"]');
                        if (featureButton) {
                            await performClick(featureButton, '5-2');
                            await wait(CONFIG.timeouts.longWait);
                            
                            const canvasButton = Array.from(document.querySelectorAll('button'))
                                .find(el => el.textContent?.includes('スタイル'));
                            if (canvasButton) {
                                await performClick(canvasButton, '5-2');
                                log('5-2', 'Canvas機能設定完了', 'SUCCESS');
                            }
                            
                            document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
                        }
                    }
                    
                    await wait(CONFIG.timeouts.longWait);
                    
                    submitButton = document.querySelector('[aria-label="メッセージを送信"]:not([disabled])');
                    
                    if (submitButton) {
                        const clickMethod = await performClick(submitButton, '5-3');
                        if (clickMethod) {
                            TestResults.submitClickSuccess = clickMethod;
                            log('5-3', \`{5.送信成功クリック}: \${clickMethod}\`, 'SUCCESS');
                        }
                    }
                    
                    await wait(CONFIG.timeouts.textWait);
                    
                } catch (e) {
                    log('5', \`エラー: \${e.message}\`, 'ERROR');
                }
            }
            `;
        }
        
        // Claudeのコンテキストで実行
        async runInClaudeContext(code) {
            return new Promise((resolve, reject) => {
                // メッセージリスナーを設定
                const messageHandler = (event) => {
                    if (event.data.type === 'CLAUDE_AUTOMATION_COMPLETE') {
                        window.removeEventListener('message', messageHandler);
                        resolve(event.data.data);
                    } else if (event.data.type === 'CLAUDE_AUTOMATION_ERROR') {
                        window.removeEventListener('message', messageHandler);
                        reject(new Error(event.data.data.error));
                    } else if (event.data.type === 'CLAUDE_AUTOMATION_LOG') {
                        console.log('[Claude]', event.data.data.message);
                    }
                };
                
                window.addEventListener('message', messageHandler);
                
                // Claudeのタブ/ウィンドウでコードを実行
                if (typeof chrome !== 'undefined' && chrome.tabs) {
                    // Chrome拡張機能として実行
                    chrome.tabs.query({ url: 'https://claude.ai/*' }, (tabs) => {
                        if (tabs && tabs.length > 0) {
                            chrome.tabs.executeScript(tabs[0].id, {
                                code: code
                            });
                        } else {
                            reject(new Error('Claudeのタブが見つかりません'));
                        }
                    });
                } else {
                    // 直接実行（同じページ内）
                    try {
                        eval(code);
                    } catch (error) {
                        reject(error);
                    }
                }
            });
        }
    }
    
    // グローバルに公開
    window.ClaudeAutomationIntegration = ClaudeAutomationIntegration;
    
    console.log('✅ Claude自動操作統合システムが初期化されました');
    console.log('使用方法:');
    console.log('  const claude = new ClaudeAutomationIntegration();');
    console.log('  await claude.executeInClaude({');
    console.log('    model: "Claude Opus 4.1",');
    console.log('    features: ["じっくり考える", "スタイル"],');
    console.log('    text: "テストメッセージ"');
    console.log('  });');
    
})();