// Claude自動操作エンジン
// 提供されたテストコードと同じ動作を実現するClaude専用の自動化システム

(function() {
    'use strict';
    
    // ===== Claude用設定 =====
    const CLAUDE_CONFIG = {
        // モデル設定
        models: {
            available: [
                { name: 'Claude Opus 4.1', searchText: 'Claude Opus 4.1', selector: '[data-testid="model-selector-opus-4-1"]' },
                { name: 'Claude Sonnet 4', searchText: 'Claude Sonnet 4', selector: '[data-testid="model-selector-sonnet-4"]' },
                { name: 'Claude Haiku', searchText: 'Claude Haiku', selector: '[data-testid="model-selector-haiku"]' }
            ]
        },
        
        // 機能設定
        features: {
            available: [
                // Claude.aiで実際に利用可能な機能に更新
                // 注: 「じっくり考える」は存在しないため削除
                { name: 'なし', type: 'none', index: 0, selector: '' }
            ]
        },
        
        // タイミング設定
        timeouts: {
            shortWait: 500,
            normalWait: 1500,
            longWait: 2000,
            textWait: 5000,
            clickDelay: 50,
            maxResponseWait: 60000
        },
        
        // 検証設定
        validation: {
            maxRetryCount: 12,
            consecutiveNotFoundThreshold: 1,
            minSuccessConditions: 2
        }
    };
    
    // ===== Claude自動操作エンジンクラス =====
    class ClaudeAutomationEngine {
        constructor(config = CLAUDE_CONFIG) {
            this.config = config;
            this.currentModel = null;
            this.currentFeatures = [];
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
                elementMatchResults: {}
            };
        }
        
        // ログ出力
        log(step, message, type = 'INFO') {
            const timestamp = new Date().toLocaleTimeString();
            const logEntry = `[${timestamp}] [${type}] ステップ${step}: ${message}`;
            
            console.log(type === 'ERROR' ? `❌ ${logEntry}` : 
                       type === 'SUCCESS' ? `✅ ${logEntry}` : 
                       type === 'WARNING' ? `⚠️ ${logEntry}` : logEntry);
            
            this.TestResults.logs.push(logEntry);
            if (type === 'ERROR') this.TestResults.errors.push(logEntry);
            
            // UIへの通知
            this.notifyUI(step, message, type, timestamp);
        }
        
        // UIへの通知
        notifyUI(step, message, type, timestamp) {
            window.dispatchEvent(new CustomEvent('claude-automation-log', {
                detail: { step, message, type, timestamp }
            }));
        }
        
        // 待機処理
        async wait(ms) {
            await new Promise(resolve => setTimeout(resolve, ms));
        }
        
        // React要素のプロパティ取得
        getReactProps(element) {
            const key = Object.keys(element).find(key => 
                key.startsWith('__reactInternalInstance') || 
                key.startsWith('__reactFiber')
            );
            if (key) {
                const fiberNode = element[key];
                if (fiberNode && fiberNode.memoizedProps) {
                    return fiberNode.memoizedProps;
                }
            }
            return null;
        }
        
        // 改善されたクリック操作
        async performClick(element, stepNum) {
            const clickMethods = [
                // PointerEvent with coordinates
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
                        
                        await this.wait(this.config.timeouts.clickDelay);
                        
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
                // React Click
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
                // Direct Click
                {
                    name: 'DirectClick',
                    fn: (el) => {
                        el.click();
                    }
                }
            ];
            
            // 要素の状態確認
            if (element.disabled || element.getAttribute('aria-disabled') === 'true') {
                this.log(stepNum, '要素が無効化されています', 'WARNING');
                return null;
            }
            
            // 各クリック方法を試す
            for (const method of clickMethods) {
                try {
                    this.log(stepNum, `${method.name}方式でクリック試行中`);
                    
                    const beforeExpanded = element.getAttribute('aria-expanded');
                    const beforeState = element.getAttribute('data-state');
                    
                    await method.fn(element);
                    await this.wait(this.config.timeouts.normalWait);
                    
                    const afterExpanded = element.getAttribute('aria-expanded');
                    const afterState = element.getAttribute('data-state');
                    
                    // メニューが開いたかチェック
                    const menuOpened = 
                        (beforeExpanded === 'false' && afterExpanded === 'true') ||
                        (beforeState === 'closed' && afterState === 'open') ||
                        document.querySelector('[role="menu"][data-state="open"]') !== null;
                    
                    if (menuOpened) {
                        this.log(stepNum, `${method.name}方式でクリック成功`, 'SUCCESS');
                        return method.name;
                    }
                    
                    // 送信ボタンの場合の特別な成功判定
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
        
        // ===== ステップ1: モデル選択 =====
        async selectModel(modelName) {
            this.log('1', `モデル選択開始: ${modelName}`);
            
            try {
                // モデル選択ボタンを探す
                let modelButton = document.querySelector('[data-testid="model-selector-dropdown"]');
                if (!modelButton) {
                    modelButton = document.querySelector('button[aria-haspopup="menu"]');
                }
                if (!modelButton) {
                    modelButton = Array.from(document.querySelectorAll('button'))
                        .find(el => el.textContent && (el.textContent.includes('Opus') || el.textContent.includes('Sonnet')));
                }
                
                if (!modelButton) {
                    this.log('1', 'モデル選択ボタンが見つかりません', 'ERROR');
                    return false;
                }
                
                // ボタンをクリックしてメニューを開く
                const clickMethod = await this.performClick(modelButton, '1');
                if (!clickMethod) {
                    this.log('1', 'モデル選択ボタンのクリックに失敗', 'ERROR');
                    return false;
                }
                
                await this.wait(this.config.timeouts.longWait);
                
                // メニューが開いたか確認
                const modelMenu = document.querySelector('[role="menu"][data-state="open"]') ||
                                 document.querySelector('[role="menu"]');
                
                if (!modelMenu) {
                    this.log('1', 'モデルメニューが開かれていません', 'ERROR');
                    return false;
                }
                
                // 指定されたモデルを選択
                const menuItems = Array.from(document.querySelectorAll('[role="menuitem"]'));
                
                // モデル名で直接検索（Claude Opus 4.1などの実際の表示名で検索）
                const modelItem = menuItems.find(el => {
                    const text = el.textContent || '';
                    // 部分一致で検索
                    if (modelName.includes('Opus')) return text.includes('Opus');
                    if (modelName.includes('Sonnet')) return text.includes('Sonnet');
                    if (modelName.includes('Haiku')) return text.includes('Haiku');
                    return text.includes(modelName);
                });
                
                if (!modelItem) {
                    this.log('1', `モデル項目が見つかりません: ${modelName}`, 'ERROR');
                    return false;
                }
                
                // モデルをクリック
                await this.performClick(modelItem, '1');
                await this.wait(this.config.timeouts.normalWait);
                
                this.currentModel = modelName;
                this.log('1', `モデル選択完了: ${modelName}`, 'SUCCESS');
                
                // メニューを閉じる
                document.body.dispatchEvent(new KeyboardEvent('keydown', { 
                    key: 'Escape', 
                    code: 'Escape',
                    bubbles: true 
                }));
                
                return true;
                
            } catch (e) {
                this.log('1', `モデル選択エラー: ${e.message}`, 'ERROR');
                return false;
            }
        }
        
        // ===== ステップ2: 機能選択 =====
        async selectFeature(featureName) {
            this.log('2', `機能選択開始: ${featureName}`);
            
            // 現在のClaude.aiでは「じっくり考える」などの機能は利用できないため、
            // 機能選択をスキップする
            if (featureName === 'じっくり考える' || featureName === 'Thinking') {
                this.log('2', `機能「${featureName}」は現在のClaude.aiでは利用できません。スキップします。`, 'WARNING');
                return true; // エラーではなく成功として扱う
            }
            
            if (featureName === 'なし' || !featureName) {
                this.log('2', '機能選択なし', 'SUCCESS');
                return true;
            }
            
            this.log('2', `機能「${featureName}」は認識できません。スキップします。`, 'WARNING');
            return true; // エラーではなく成功として扱う
        }
        
        // ===== ステップ3: テキスト入力と送信 =====
        async sendText(text) {
            this.log('3', 'テキスト入力と送信開始');
            
            try {
                // テキスト入力欄を探す
                const inputField = document.querySelector('[contenteditable="true"][role="textbox"]') ||
                                  document.querySelector('.ProseMirror');
                
                if (!inputField) {
                    this.log('3', 'テキスト入力欄が見つかりません', 'ERROR');
                    return false;
                }
                
                // テキストを入力
                inputField.focus();
                inputField.innerHTML = `<p>${text}</p>`;
                inputField.dispatchEvent(new Event('input', { bubbles: true }));
                
                this.log('3', `テキスト入力完了: ${text.substring(0, 50)}...`, 'SUCCESS');
                
                await this.wait(this.config.timeouts.normalWait);
                
                // 送信ボタンを探す
                let submitButton = document.querySelector('[aria-label="メッセージを送信"]:not([disabled])');
                
                if (!submitButton) {
                    this.log('3', '送信ボタンが見つかりません', 'ERROR');
                    return false;
                }
                
                // 送信ボタンをクリック
                const clickMethod = await this.performClick(submitButton, '3');
                if (!clickMethod) {
                    this.log('3', '送信ボタンのクリックに失敗', 'ERROR');
                    return false;
                }
                
                this.log('3', 'テキスト送信完了', 'SUCCESS');
                
                // 送信後の待機
                await this.wait(this.config.timeouts.textWait);
                
                // 送信確認
                const conditions = {
                    inputEmpty: inputField.textContent?.trim() === '' || 
                               inputField.innerHTML === '<p><br></p>',
                    submitDisabled: submitButton?.disabled || 
                                   submitButton?.getAttribute('aria-disabled') === 'true',
                    stopButtonVisible: document.querySelector('[aria-label="応答を停止"]') !== null
                };
                
                const conditionsMet = [conditions.inputEmpty, conditions.submitDisabled, conditions.stopButtonVisible]
                    .filter(c => c === true).length;
                
                if (conditionsMet >= this.config.validation.minSuccessConditions) {
                    this.log('3', `送信成功確認: ${conditionsMet}/3条件クリア`, 'SUCCESS');
                    return true;
                } else {
                    this.log('3', '送信の確認に失敗', 'ERROR');
                    return false;
                }
                
            } catch (e) {
                this.log('3', `テキスト送信エラー: ${e.message}`, 'ERROR');
                return false;
            }
        }
        
        // ===== 統合実行メソッド =====
        async execute(options = {}) {
            const {
                model = 'Claude Opus 4.1',
                features = [],
                text = '桃太郎について歴史観点も含めて解説して。Canvas機能を活用して'
            } = options;
            
            this.log('', '='.repeat(50));
            this.log('', `Claude自動操作開始: ${new Date().toLocaleString()}`);
            this.log('', '='.repeat(50));
            
            try {
                // モデル選択
                if (model) {
                    const modelSuccess = await this.selectModel(model);
                    if (!modelSuccess) {
                        throw new Error('モデル選択に失敗しました');
                    }
                }
                
                // 機能選択
                for (const feature of features) {
                    const featureSuccess = await this.selectFeature(feature);
                    if (!featureSuccess) {
                        this.log('', `機能選択に失敗: ${feature}`, 'WARNING');
                    }
                }
                
                // テキスト入力と送信
                const sendSuccess = await this.sendText(text);
                if (!sendSuccess) {
                    throw new Error('テキスト送信に失敗しました');
                }
                
                this.log('', '='.repeat(50));
                this.log('', 'Claude自動操作完了', 'SUCCESS');
                this.log('', '='.repeat(50));
                
                return {
                    success: true,
                    results: this.TestResults
                };
                
            } catch (e) {
                this.log('', `自動操作エラー: ${e.message}`, 'ERROR');
                return {
                    success: false,
                    error: e.message,
                    results: this.TestResults
                };
            }
        }
        
        // 現在の状態を取得
        getStatus() {
            return {
                model: this.currentModel,
                features: this.currentFeatures,
                logs: this.TestResults.logs,
                errors: this.TestResults.errors
            };
        }
    }
    
    // ===== UIインテグレーション用クラス =====
    class ClaudeAutomationUI {
        constructor() {
            this.engine = new ClaudeAutomationEngine();
            this.init();
        }
        
        init() {
            // イベントリスナーを設定
            window.addEventListener('claude-automation-request', (event) => {
                this.handleAutomationRequest(event.detail);
            });
            
            // ログイベントをリッスン
            window.addEventListener('claude-automation-log', (event) => {
                this.handleLog(event.detail);
            });
        }
        
        async handleAutomationRequest(options) {
            const result = await this.engine.execute(options);
            
            // 結果を通知
            window.dispatchEvent(new CustomEvent('claude-automation-complete', {
                detail: result
            }));
        }
        
        handleLog(logData) {
            // ログをコンソールまたはUIに表示
            console.log(`[Claude Automation] ${logData.message}`);
        }
    }
    
    // グローバルに公開
    window.ClaudeAutomationEngine = ClaudeAutomationEngine;
    window.ClaudeAutomationUI = ClaudeAutomationUI;
    window.ClaudeAutomation = new ClaudeAutomationUI();
    
    console.log('✅ Claude自動操作エンジンが初期化されました');
    console.log('使用方法:');
    console.log('  window.ClaudeAutomation.engine.execute({');
    console.log('    model: "Claude Opus 4.1",');
    console.log('    features: ["じっくり考える", "スタイル"],');
    console.log('    text: "テストメッセージ"');
    console.log('  });');
    
})();