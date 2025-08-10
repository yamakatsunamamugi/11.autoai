// AI自動操作コントローラー
// モデル・機能・テキストを選択してAIに自動操作を実行させる統合システム

(async function() {
    'use strict';
    
    // ===== 動的設定システム =====
    class AIAutomationConfig {
        constructor() {
            // デフォルト設定
            this.config = {
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
        }
        
        // モデル設定を更新
        updateModels(models) {
            this.config.models.available = models;
        }
        
        // 機能設定を更新
        updateFeatures(features) {
            this.config.features.available = features;
        }
        
        // テキスト設定を更新
        updateText(text) {
            this.config.text.testMessage = text;
        }
        
        // 現在の設定を取得
        getConfig() {
            return this.config;
        }
    }
    
    // ===== 自動操作エンジン =====
    class AIAutomationEngine {
        constructor(config) {
            this.config = config;
            this.TestResults = {
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
        }
        
        // ログ関数
        log(step, message, type = 'INFO') {
            const timestamp = new Date().toLocaleTimeString();
            const logEntry = `[${timestamp}] [${type}] ステップ${step}: ${message}`;
            console.log(type === 'ERROR' ? `❌ ${logEntry}` : 
                       type === 'SUCCESS' ? `✅ ${logEntry}` : 
                       type === 'WARNING' ? `⚠️ ${logEntry}` : logEntry);
            this.TestResults.logs.push(logEntry);
            if (type === 'ERROR') this.TestResults.errors.push(logEntry);
            
            // イベントを発火してUIに通知
            window.dispatchEvent(new CustomEvent('ai-automation-log', {
                detail: { step, message, type, timestamp }
            }));
        }
        
        // 待機関数
        async wait(ms) {
            this.log('', `${ms/1000}秒待機中...`);
            await new Promise(resolve => setTimeout(resolve, ms));
        }
        
        // React要素のプロパティを取得
        getReactProps(element) {
            const key = Object.keys(element).find(key => key.startsWith('__reactInternalInstance') || key.startsWith('__reactFiber'));
            if (key) {
                const fiberNode = element[key];
                if (fiberNode && fiberNode.memoizedProps) {
                    return fiberNode.memoizedProps;
                }
            }
            return null;
        }
        
        // モデル項目用の特別なクリック操作
        async performModelItemClick(element, stepNum, modelName) {
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
                
                await new Promise(r => setTimeout(r, this.config.timeouts.clickDelay));
                
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
                    await this.wait(this.config.timeouts.shortWait);
                    const menuStillOpen = document.querySelector('[role="menu"][data-state="open"]');
                    if (!menuStillOpen) {
                        menuClosedAutomatically = true;
                        break;
                    }
                }
                
                if (menuClosedAutomatically) {
                    this.log(stepNum, `${modelName}への切り替え成功 - メニュー自動終了確認`, 'SUCCESS');
                    return true;
                }
                
                return false;
            } catch (e) {
                this.log(stepNum, `モデルクリックエラー: ${e.message}`, 'ERROR');
                return false;
            }
        }
        
        // 改善されたクリック操作実装
        async performClick(element, stepNum) {
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
                        
                        await new Promise(r => setTimeout(r, this.config.timeouts.clickDelay));
                        
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
                        const props = this.getReactProps(el);
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
                this.log(stepNum, '要素が無効化されています', 'WARNING');
                return null;
            }
            
            for (const method of clickMethods) {
                try {
                    this.log(stepNum, `${method.name}方式でクリック試行中`);
                    
                    const beforeExpanded = element.getAttribute('aria-expanded');
                    const beforeState = element.getAttribute('data-state');
                    
                    await method.fn(element);
                    await this.wait(this.config.timeouts.normalWait);
                    
                    const afterExpanded = element.getAttribute('aria-expanded');
                    const afterState = element.getAttribute('data-state');
                    
                    const menuOpened = 
                        (beforeExpanded === 'false' && afterExpanded === 'true') ||
                        (beforeState === 'closed' && afterState === 'open') ||
                        document.querySelector('[role="menu"][data-state="open"]') !== null ||
                        document.querySelector('.z-dropdown') !== null ||
                        document.querySelector('.relative.w-full.will-change-transform:not(.hidden)') !== null;
                    
                    if (menuOpened) {
                        this.log(stepNum, `${method.name}方式でクリック成功`, 'SUCCESS');
                        return method.name;
                    }
                    
                    if (element.getAttribute('aria-label') === 'メッセージを送信') {
                        const stopButton = document.querySelector('[aria-label="応答を停止"]');
                        if (stopButton) {
                            this.log(stepNum, `${method.name}方式でクリック成功`, 'SUCCESS');
                            return method.name;
                        }
                    }
                } catch (e) {
                    this.log(stepNum, `${method.name}方式でエラー: ${e.message}`, 'ERROR');
                }
            }
            
            return null;
        }
        
        // 自動操作の実行
        async execute() {
            this.log('', '='.repeat(80));
            this.log('', `自動操作開始: ${new Date().toLocaleString()}`);
            this.log('', '='.repeat(80));
            
            try {
                await this.step1_ModelButtonResearch();
                await this.wait(this.config.timeouts.longWait);
                
                await this.step2_ModelSelectionCheck();
                await this.wait(this.config.timeouts.longWait);
                
                await this.step3_FeatureButtonResearch();
                await this.wait(this.config.timeouts.longWait);
                
                await this.step4_FeatureSelectionCheck();
                await this.wait(this.config.timeouts.longWait);
                
                await this.step5_ActualOperationCheck();
                
                this.generateFinalReport();
                
                return this.TestResults;
            } catch (e) {
                console.error('致命的エラー:', e);
                this.generateFinalReport();
                return this.TestResults;
            }
        }
        
        // ステップ1: モデル選択関係のボタンリサーチ
        async step1_ModelButtonResearch() {
            this.log('1', 'モデル選択関係のボタンリサーチ開始');
            
            try {
                this.log('1-1', '「7.モデル選択ボタン」があるかチェック');
                
                let modelButton = document.querySelector('[data-testid="model-selector-dropdown"]');
                if (!modelButton) {
                    modelButton = document.querySelector('button[aria-haspopup="menu"]');
                }
                if (!modelButton) {
                    modelButton = Array.from(document.querySelectorAll('button'))
                        .find(el => el.textContent && (el.textContent.includes('Opus') || el.textContent.includes('Sonnet')));
                }
                
                if (!modelButton) {
                    this.log('1-1', 'モデル選択ボタンが見つかりません。UIを修正してください。', 'ERROR');
                    return;
                }
                
                this.log('1-1', 'モデル選択ボタンを発見', 'SUCCESS');
                this.TestResults.elementMatchResults['7. モデル選択ボタン'] = true;
                
                this.log('1-2', '{クリック操作}を行い、成功するまでクリック');
                const clickMethod = await this.performClick(modelButton, '1-2');
                if (clickMethod) {
                    this.TestResults.modelClickSuccess = clickMethod;
                    this.log('1-2', `{1.モデルクリック成功例}: ${clickMethod}`, 'SUCCESS');
                }
                
                await this.wait(this.config.timeouts.longWait);
                
                this.log('1-3', '「8.モデルメニュー」が開かれるはず - 抽出優先順位と結果の一致確認');
                const modelMenu = document.querySelector('[role="menu"][data-state="open"]') ||
                                 document.querySelector('[role="menu"]') ||
                                 document.querySelector('.z-dropdown');
                
                if (!modelMenu) {
                    this.log('1-3', 'モデルメニューが開かれていません', 'ERROR');
                    return;
                }
                
                this.log('1-3', 'モデルメニューが開きました', 'SUCCESS');
                this.TestResults.elementMatchResults['8. モデルメニュー'] = true;
                
                this.log('1-4', '「8-1. モデル名」「8-2.モデル名」のすべてあるかチェック');
                const menuItems = Array.from(document.querySelectorAll('[role="menuitem"]'));
                
                this.config.models.available.forEach((model, index) => {
                    const item = menuItems.find(el => el.textContent && el.textContent.includes(model.searchText));
                    if (item) {
                        this.TestResults.modelElements.push({name: model.name, element: item});
                        this.log('1-4', `8-${index + 1}. ${model.name} を検出`, 'SUCCESS');
                        this.TestResults.elementMatchResults[`8-${index + 1}. ${model.name}`] = true;
                    }
                });
                
                this.log('1-5', `{モデル全要素}記録: ${this.TestResults.modelElements.length}個`);
                
                this.log('1-6', '「8.モデルメニュー」を閉じる - Escキーを押す');
                document.body.dispatchEvent(new KeyboardEvent('keydown', { 
                    key: 'Escape', 
                    code: 'Escape',
                    bubbles: true 
                }));
                await this.wait(this.config.timeouts.normalWait);
                
                this.log('1-7', '「8.モデルメニュー」が閉じられました', 'SUCCESS');
                    
            } catch (e) {
                this.log('1', `エラー: ${e.message}`, 'ERROR');
            }
        }
        
        // ステップ2: モデル選択チェック
        async step2_ModelSelectionCheck() {
            this.log('2', 'モデル選択チェック開始');
            
            try {
                for (const model of this.TestResults.modelElements) {
                    this.log('2-1', `${model.name}のテスト - {モデルクリック成功例}でメニューを開く`);
                    const modelButton = document.querySelector('[data-testid="model-selector-dropdown"]') ||
                                       document.querySelector('button[aria-haspopup="menu"]');
                    
                    if (modelButton && this.TestResults.modelClickSuccess) {
                        await this.performClick(modelButton, '2-1');
                        await this.wait(this.config.timeouts.longWait);
                    }
                    
                    this.log('2-2', `{モデル全要素}を活用して「${model.name}」をクリック`);
                    const modelItem = Array.from(document.querySelectorAll('[role="menuitem"]'))
                        .find(el => el.textContent?.includes(model.name));
                        
                    if (modelItem) {
                        const switchSuccess = await this.performModelItemClick(modelItem, '2-2', model.name);
                        
                        if (switchSuccess) {
                            this.TestResults.modelSwitchSuccess[model.name] = true;
                            this.log('2-2', `{2.モデル名クリック成功例}: ${model.name}`, 'SUCCESS');
                        }
                    }
                }
                
                this.log('2-3', '「8-2.モデル名」→「8-3モデル名」とモデル名が終わるまで繰り返し完了');
                
                this.log('2-4', '「8.モデルメニュー」を閉じる - Escキーを押す');
                document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
                await this.wait(this.config.timeouts.normalWait);
                
            } catch (e) {
                this.log('2', `エラー: ${e.message}`, 'ERROR');
            }
        }
        
        // ステップ3: 機能選択関係のボタンリサーチ
        async step3_FeatureButtonResearch() {
            this.log('3', '機能選択関係のボタンリサーチ開始');
            
            try {
                this.log('3-1', '「9.機能選択ボタン」があるか？抽出優先順位と結果の一致確認');
                const featureButton = document.querySelector('[data-testid="input-menu-tools"]') ||
                                     document.querySelector('[aria-label="ツールメニューを開く"]');
                
                if (!featureButton) {
                    this.log('3-1', '機能選択ボタンが見つかりません。UIを修正してください。', 'ERROR');
                    return;
                }
                
                this.log('3-1', '機能選択ボタンを発見', 'SUCCESS');
                this.TestResults.elementMatchResults['9. 機能選択ボタン'] = true;
                
                this.log('3-2', '{クリック操作}を行い、成功するまでクリック');
                const clickMethod = await this.performClick(featureButton, '3-2');
                if (clickMethod) {
                    this.TestResults.featureClickSuccess = clickMethod;
                    this.log('3-2', `{3.機能選択ボタンクリック成功例}: ${clickMethod}`, 'SUCCESS');
                }
                
                await this.wait(this.config.timeouts.longWait);
                
                this.log('3-3', '「10.機能メニュー」が開かれるはず - 抽出優先順位と結果の一致確認');
                const featureMenu = document.querySelector('.relative.w-full.will-change-transform') ||
                                   document.querySelector('[class*="will-change-transform"]');
                
                if (!featureMenu) {
                    this.log('3-3', '機能メニューが開かれていません', 'ERROR');
                    return;
                }
                
                this.log('3-3', '機能メニューが開きました', 'SUCCESS');
                this.TestResults.elementMatchResults['10. 機能メニュー'] = true;
                
                this.log('3-4', '「10-1. 機能名」「10-2.機能名」のすべてあるかチェック');
                
                this.config.features.available.forEach(feature => {
                    const featureElement = Array.from(document.querySelectorAll('button'))
                        .find(el => el.textContent?.includes(feature.name));
                    
                    if (featureElement) {
                        this.TestResults.featureElements.push({name: feature.name, element: featureElement, type: feature.type, index: feature.index});
                        this.log('3-4', `10-${feature.index}. ${feature.displayName || feature.name} を検出`, 'SUCCESS');
                        this.TestResults.elementMatchResults[`10-${feature.index}. ${feature.displayName || feature.name}`] = true;
                        
                        if (feature.name === 'スタイル') {
                            this.TestResults.canvasSetup = true;
                        }
                    }
                });
                
                this.log('3-5', `「全機能要素記録」: ${this.TestResults.featureElements.length}個`);
                
                this.log('3-6', '「10.機能メニュー」を閉じる - Escキーを押す');
                document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
                await this.wait(this.config.timeouts.normalWait);
                
            } catch (e) {
                this.log('3', `エラー: ${e.message}`, 'ERROR');
            }
        }
        
        // ステップ4: 機能選択チェック
        async step4_FeatureSelectionCheck() {
            this.log('4', '機能選択チェック開始');
            
            try {
                for (let i = 0; i < this.TestResults.featureElements.length; i++) {
                    const feature = this.TestResults.featureElements[i];
                    
                    this.log('4-1', `${feature.name}のテスト - {3.機能選択ボタンクリック成功例}でクリック`);
                    const featureButton = document.querySelector('[data-testid="input-menu-tools"]') ||
                                         document.querySelector('[aria-label="ツールメニューを開く"]');
                    
                    if (featureButton && this.TestResults.featureClickSuccess) {
                        await this.performClick(featureButton, '4-1');
                        
                        this.log('4-2', '「10.機能メニュー」でメニューを開く');
                        await this.wait(this.config.timeouts.longWait);
                    }
                    
                    this.log('4-3', `「10-${feature.index}. ${feature.name}」について{クリック操作}して成功するまでクリック`);
                    const featureItem = Array.from(document.querySelectorAll('button'))
                        .find(el => el.textContent?.includes(feature.name));
                        
                    if (featureItem) {
                        const clickResult = await this.performClick(featureItem, '4-3');
                        if (clickResult) {
                            this.log('4-3', `{機能名クリック成功例}: ${feature.name} - ${clickResult}`, 'SUCCESS');
                            this.TestResults.featureActivateSuccess[feature.name] = clickResult;
                            await this.wait(this.config.timeouts.longWait);
                        }
                    }
                    
                    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
                    await this.wait(this.config.timeouts.normalWait);
                }
                
                this.log('4-6', '「10-2.機能名」→「10-3機能名」と機能名がすべて終わるまで繰り返し完了');
                
            } catch (e) {
                this.log('4', `エラー: ${e.message}`, 'ERROR');
            }
        }
        
        // ステップ5: 実際の動作チェック
        async step5_ActualOperationCheck() {
            this.log('5', '実際の動作チェック開始');
            
            try {
                this.log('5-1-1', '「テキスト入力欄」→「抽出優先順位と結果」と一致しているかチェック');
                const inputField = document.querySelector('[contenteditable="true"][role="textbox"]') ||
                                  document.querySelector('.ProseMirror');
                
                if (!inputField) {
                    this.log('5-1-1', 'テキスト入力欄が見つかりません', 'ERROR');
                    return;
                }
                this.log('5-1-1', 'テキスト入力欄を検出', 'SUCCESS');
                this.TestResults.elementMatchResults['1. テキスト入力欄'] = true;
                
                this.log('5-1-2', '「送信ボタン」→「抽出優先順位と結果」と一致しているかチェック');
                let submitButton = document.querySelector('[aria-label="メッセージを送信"]');
                if (submitButton) {
                    this.log('5-1-2', '送信ボタンを検出', 'SUCCESS');
                    this.TestResults.elementMatchResults['2. 送信ボタン'] = true;
                }
                
                this.log('5-2', `テキストに「${this.config.text.testMessage}」と入力`);
                inputField.focus();
                inputField.innerHTML = `<p>${this.config.text.testMessage}</p>`;
                
                inputField.dispatchEvent(new Event('input', { bubbles: true }));
                
                if (this.TestResults.canvasSetup) {
                    this.log('5-2', '{Canvas設定}を実行');
                    const featureButton = document.querySelector('[data-testid="input-menu-tools"]');
                    if (featureButton) {
                        await this.performClick(featureButton, '5-2');
                        await this.wait(this.config.timeouts.longWait);
                        
                        const canvasButton = Array.from(document.querySelectorAll('button'))
                            .find(el => el.textContent?.includes('スタイル'));
                        if (canvasButton) {
                            await this.performClick(canvasButton, '5-2');
                            this.log('5-2', 'Canvas機能設定完了', 'SUCCESS');
                        }
                        
                        document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
                    }
                }
                
                this.log('5-2', '~2秒待機~');
                await this.wait(this.config.timeouts.longWait);
                
                this.log('5-3', '「送信ボタン」を{クリック操作}でクリック');
                submitButton = document.querySelector('[aria-label="メッセージを送信"]:not([disabled])');
                
                if (submitButton) {
                    const clickMethod = await this.performClick(submitButton, '5-3');
                    if (clickMethod) {
                        this.TestResults.submitClickSuccess = clickMethod;
                        this.log('5-3', `{5.送信成功クリック}: ${clickMethod}`, 'SUCCESS');
                    }
                }
                
                this.log('5-4', '送信5秒待機');
                await this.wait(this.config.timeouts.textWait);
                
                this.log('5-5', '送信できているか確認する - 3条件すべてを確認');
                
                const conditions = {
                    inputEmpty: inputField.textContent?.trim() === '' || 
                               inputField.innerHTML === '<p><br></p>' ||
                               inputField.innerHTML === '<p></p>',
                    submitDisabled: submitButton?.disabled || 
                                   submitButton?.getAttribute('aria-disabled') === 'true',
                    stopButtonVisible: document.querySelector('[aria-label="応答を停止"]') !== null
                };
                
                const conditionsMet = [conditions.inputEmpty, conditions.submitDisabled, conditions.stopButtonVisible]
                    .filter(c => c === true).length;
                
                if (conditionsMet >= this.config.validation.minSuccessConditions) {
                    this.log('5-5', `送信成功：${conditionsMet}/3条件クリア（2条件以上で成功）`, 'SUCCESS');
                } else {
                    this.log('5-5', '送信失敗：{クリック操作}の別のクリックを試す必要があります', 'ERROR');
                }
                
            } catch (e) {
                this.log('5', `エラー: ${e.message}`, 'ERROR');
            }
        }
        
        // 最終レポート生成
        generateFinalReport() {
            console.log('\n' + '='.repeat(80));
            console.log('最終検証レポート');
            console.log('='.repeat(80));
            
            const duration = Math.round((new Date() - this.TestResults.startTime) / 1000);
            console.log(`実行時間: ${duration}秒`);
            console.log(`総ログ数: ${this.TestResults.logs.length}`);
            console.log(`エラー数: ${this.TestResults.errors.length}`);
            
            console.log('\n1. 要素の「抽出優先順位と結果」が一致しているか？');
            
            console.log('\n2. モデル選択のテスト結果:');
            console.log(`  成功したクリック方法: ${this.TestResults.modelClickSuccess || '失敗'}`);
            console.log(`  検出されたモデル数: ${this.TestResults.modelElements.length}`);
            
            console.log('\n3. 機能選択のテスト結果:');
            console.log(`  成功したクリック方法: ${this.TestResults.featureClickSuccess || '失敗'}`);
            console.log(`  検出された機能数: ${this.TestResults.featureElements.length}`);
            
            console.log('\n4. 実際の動作テストの結果:');
            console.log(`  ・テキスト入力: ${this.TestResults.logs.some(l => l.includes('テキストに「')) ? '✅' : '❌'}`);
            console.log(`  ・送信: ${this.TestResults.submitClickSuccess ? '✅' : '❌'} (${this.TestResults.submitClickSuccess || '失敗'})`);
            
            if (this.TestResults.errors.length > 0) {
                console.log('\n❌ エラー詳細:');
                this.TestResults.errors.forEach(err => console.log(`  ${err}`));
            }
            
            console.log('\n' + '='.repeat(80));
            console.log('検証完了');
            console.log('='.repeat(80));
            
            // イベントを発火してUIに通知
            window.dispatchEvent(new CustomEvent('ai-automation-complete', {
                detail: this.TestResults
            }));
        }
    }
    
    // ===== UIコントローラー =====
    class AIAutomationUI {
        constructor(containerId) {
            this.containerId = containerId;
            this.config = new AIAutomationConfig();
            this.engine = null;
            this.init();
        }
        
        init() {
            this.render();
            this.attachEventListeners();
        }
        
        render() {
            const container = document.getElementById(this.containerId);
            if (!container) {
                console.error(`Container not found: ${this.containerId}`);
                return;
            }
            
            container.innerHTML = `
                <div class="ai-automation-container" style="
                    padding: 20px;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    border-radius: 12px;
                    color: white;
                    box-shadow: 0 10px 30px rgba(0,0,0,0.2);
                ">
                    <h2 style="margin: 0 0 20px 0; font-size: 24px;">
                        🤖 AI自動操作コントローラー
                    </h2>
                    
                    <div style="background: rgba(255,255,255,0.1); padding: 15px; border-radius: 8px; margin-bottom: 20px;">
                        <h3 style="margin: 0 0 15px 0; font-size: 18px;">📋 設定</h3>
                        
                        <div style="margin-bottom: 15px;">
                            <label style="display: block; margin-bottom: 5px; font-weight: bold;">
                                🎯 モデル選択
                            </label>
                            <div id="model-config" style="display: flex; gap: 10px; flex-wrap: wrap;">
                                <label style="display: flex; align-items: center; gap: 5px;">
                                    <input type="checkbox" value="Claude Opus 4.1" checked>
                                    <span>Claude Opus 4.1</span>
                                </label>
                                <label style="display: flex; align-items: center; gap: 5px;">
                                    <input type="checkbox" value="Claude Sonnet 4" checked>
                                    <span>Claude Sonnet 4</span>
                                </label>
                            </div>
                        </div>
                        
                        <div style="margin-bottom: 15px;">
                            <label style="display: block; margin-bottom: 5px; font-weight: bold;">
                                ⚙️ 機能選択
                            </label>
                            <div id="feature-config" style="display: flex; gap: 10px; flex-wrap: wrap;">
                                <label style="display: flex; align-items: center; gap: 5px;">
                                    <input type="checkbox" value="じっくり考える" checked>
                                    <span>じっくり考える</span>
                                </label>
                                <label style="display: flex; align-items: center; gap: 5px;">
                                    <input type="checkbox" value="ウェブ検索" checked>
                                    <span>ウェブ検索</span>
                                </label>
                                <label style="display: flex; align-items: center; gap: 5px;">
                                    <input type="checkbox" value="スタイル" checked>
                                    <span>スタイル（Canvas）</span>
                                </label>
                            </div>
                        </div>
                        
                        <div style="margin-bottom: 15px;">
                            <label style="display: block; margin-bottom: 5px; font-weight: bold;">
                                ✍️ テストテキスト
                            </label>
                            <textarea id="test-text" style="
                                width: 100%;
                                padding: 10px;
                                border: none;
                                border-radius: 4px;
                                background: rgba(255,255,255,0.9);
                                color: #333;
                                font-size: 14px;
                                min-height: 60px;
                                resize: vertical;
                            ">桃太郎について歴史観点も含めて解説して。Canvas機能を活用して</textarea>
                        </div>
                    </div>
                    
                    <div style="display: flex; gap: 10px; margin-bottom: 20px;">
                        <button id="execute-automation" style="
                            flex: 1;
                            padding: 12px 20px;
                            background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%);
                            color: white;
                            border: none;
                            border-radius: 6px;
                            font-size: 16px;
                            font-weight: bold;
                            cursor: pointer;
                            transition: transform 0.2s;
                        " onmouseover="this.style.transform='scale(1.05)'" 
                           onmouseout="this.style.transform='scale(1)'">
                            🚀 自動操作を実行
                        </button>
                        
                        <button id="stop-automation" style="
                            padding: 12px 20px;
                            background: linear-gradient(135deg, #f44336 0%, #da190b 100%);
                            color: white;
                            border: none;
                            border-radius: 6px;
                            font-size: 16px;
                            font-weight: bold;
                            cursor: pointer;
                            display: none;
                        ">
                            ⏹️ 停止
                        </button>
                    </div>
                    
                    <div id="automation-status" style="
                        padding: 10px;
                        background: rgba(255,255,255,0.1);
                        border-radius: 6px;
                        text-align: center;
                        font-size: 14px;
                    ">
                        準備完了
                    </div>
                    
                    <div id="automation-logs" style="
                        margin-top: 20px;
                        padding: 15px;
                        background: rgba(0,0,0,0.3);
                        border-radius: 6px;
                        font-family: monospace;
                        font-size: 12px;
                        max-height: 300px;
                        overflow-y: auto;
                        display: none;
                    "></div>
                </div>
            `;
        }
        
        attachEventListeners() {
            const executeBtn = document.getElementById('execute-automation');
            const stopBtn = document.getElementById('stop-automation');
            const statusDiv = document.getElementById('automation-status');
            const logsDiv = document.getElementById('automation-logs');
            
            // 実行ボタン
            executeBtn.addEventListener('click', async () => {
                // 設定を更新
                this.updateConfig();
                
                // UIを更新
                executeBtn.style.display = 'none';
                stopBtn.style.display = 'block';
                logsDiv.style.display = 'block';
                logsDiv.innerHTML = '';
                statusDiv.textContent = '🔄 自動操作実行中...';
                statusDiv.style.background = 'rgba(255,193,7,0.2)';
                
                // エンジンを作成して実行
                this.engine = new AIAutomationEngine(this.config.getConfig());
                const results = await this.engine.execute();
                
                // 完了後のUI更新
                executeBtn.style.display = 'block';
                stopBtn.style.display = 'none';
                statusDiv.textContent = results.errors.length > 0 ? 
                    `⚠️ 完了（エラー: ${results.errors.length}件）` : 
                    '✅ 自動操作完了';
                statusDiv.style.background = results.errors.length > 0 ? 
                    'rgba(244,67,54,0.2)' : 'rgba(76,175,80,0.2)';
            });
            
            // 停止ボタン
            stopBtn.addEventListener('click', () => {
                if (this.engine) {
                    // 停止処理（必要に応じて実装）
                    console.log('自動操作を停止しました');
                }
                executeBtn.style.display = 'block';
                stopBtn.style.display = 'none';
                statusDiv.textContent = '⏹️ 停止されました';
                statusDiv.style.background = 'rgba(244,67,54,0.2)';
            });
            
            // ログイベントのリスナー
            window.addEventListener('ai-automation-log', (event) => {
                const { message, type, timestamp } = event.detail;
                const logEntry = document.createElement('div');
                logEntry.style.marginBottom = '5px';
                logEntry.style.color = type === 'ERROR' ? '#ff6b6b' : 
                                       type === 'SUCCESS' ? '#51cf66' : 
                                       type === 'WARNING' ? '#ffd43b' : '#ffffff';
                logEntry.textContent = `[${timestamp}] ${message}`;
                logsDiv.appendChild(logEntry);
                logsDiv.scrollTop = logsDiv.scrollHeight;
            });
            
            // 完了イベントのリスナー
            window.addEventListener('ai-automation-complete', (event) => {
                console.log('自動操作完了:', event.detail);
            });
        }
        
        updateConfig() {
            // モデル設定を更新
            const modelCheckboxes = document.querySelectorAll('#model-config input[type="checkbox"]:checked');
            const models = Array.from(modelCheckboxes).map(cb => ({
                name: cb.value,
                searchText: cb.value
            }));
            this.config.updateModels(models);
            
            // 機能設定を更新
            const featureCheckboxes = document.querySelectorAll('#feature-config input[type="checkbox"]:checked');
            const features = Array.from(featureCheckboxes).map((cb, index) => ({
                name: cb.value,
                type: cb.value === 'スタイル' ? 'button' : 'toggle',
                index: index + 1,
                displayName: cb.value === 'スタイル' ? 'スタイル使用' : cb.value
            }));
            this.config.updateFeatures(features);
            
            // テキスト設定を更新
            const testText = document.getElementById('test-text').value;
            this.config.updateText(testText);
        }
    }
    
    // グローバルに公開
    window.AIAutomationConfig = AIAutomationConfig;
    window.AIAutomationEngine = AIAutomationEngine;
    window.AIAutomationUI = AIAutomationUI;
    
    // 初期化関数
    window.initAIAutomation = function(containerId) {
        return new AIAutomationUI(containerId);
    };
    
    console.log('✅ AI自動操作コントローラーが利用可能になりました');
    console.log('使用方法: initAIAutomation("container-id")');
    
})();