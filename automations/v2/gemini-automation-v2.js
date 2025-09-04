/**
 * Gemini Automation - リファクタリング版
 * 
 * スプレッドシートからのタスクを受け取り、Geminiで自動実行する
 * V2の堅牢なロジックを保ちながらシンプルな構造を実現
 */

(() => {
    'use strict';
    
    const SCRIPT_VERSION = "3.0.0";
    console.log(`🚀 Gemini Automation v${SCRIPT_VERSION} 初期化`);
    
    // ================================================================
    // グローバル変数
    // ================================================================
    window.availableModels = [];
    window.availableFeatures = [];
    
    // ================================================================
    // ユーティリティ関数群
    // ================================================================
    const log = (message, type = 'info') => {
        const styles = {
            info: 'color: #03A9F4;',
            success: 'color: #4CAF50; font-weight: bold;',
            warn: 'color: #FFC107;',
            error: 'color: #F44336; font-weight: bold;',
            step: 'color: #9C27B0; font-weight: bold; font-size: 1.1em; border-bottom: 1px solid #9C27B0;',
        };
        console.log(`%c[${new Date().toLocaleTimeString('ja-JP')}] ${message}`, styles[type] || '');
    };
    
    const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    
    const findElement = (selectorArray, parent = document) => {
        for (const selector of selectorArray) {
            const element = parent.querySelector(selector);
            if (element) return element;
        }
        return null;
    };
    
    const findElements = (selectorArray, parent = document) => {
        for (const selector of selectorArray) {
            const elements = parent.querySelectorAll(selector);
            if (elements.length > 0) return Array.from(elements);
        }
        return [];
    };
    
    const getCleanText = (element) => {
        if (!element) return '';
        try {
            const clone = element.cloneNode(true);
            // 不要な要素を削除
            clone.querySelectorAll('mat-icon, .mat-ripple, .mat-mdc-button-persistent-ripple, .mat-focus-indicator, .mat-mdc-button-touch-target, .cdk-visually-hidden')
                .forEach(el => el.remove());
            return clone.textContent.trim().replace(/\s+/g, ' ');
        } catch (e) {
            return element.textContent.trim().replace(/\s+/g, ' ');
        }
    };
    
    // ================================================================
    // モデルと機能の探索
    // ================================================================
    async function discoverModelsAndFeatures() {
        log('モデルと機能の探索を開始', 'step');
        
        // モデル探索
        try {
            const menuButton = findElement([
                '.gds-mode-switch-button.logo-pill-btn',
                'button[class*="logo-pill-btn"]',
                'button.gds-mode-switch-button',
                'button.logo-pill-btn'
            ]);
            
            if (menuButton) {
                menuButton.click();
                await wait(1500);
                
                const menuContainer = findElement([
                    '.cdk-overlay-pane .menu-inner-container',
                    '.cdk-overlay-pane mat-action-list[data-test-id="mobile-nested-mode-menu"]',
                    '.mat-mdc-menu-panel'
                ]);
                
                if (menuContainer) {
                    const modelButtons = findElements([
                        'button.bard-mode-list-button',
                        'button[role="menuitemradio"]',
                        'button[mat-menu-item]'
                    ], menuContainer);
                    
                    window.availableModels = modelButtons.map(btn => {
                        const text = getCleanText(findElement(['.mode-desc', '.gds-label-m-alt', '.title-and-description'], btn));
                        return text || getCleanText(btn);
                    }).filter(Boolean);
                    
                    log(`モデル探索完了: ${window.availableModels.length}個のモデルを発見`, 'success');
                }
            }
        } catch (e) {
            log('モデル探索エラー: ' + e.message, 'error');
        } finally {
            // メニューを閉じる
            const overlay = document.querySelector('.cdk-overlay-backdrop.cdk-overlay-backdrop-showing');
            if (overlay) overlay.click();
            await wait(500);
        }
        
        // 機能探索
        try {
            const featureNames = new Set();
            
            // メインツールバーの機能
            findElements(['toolbox-drawer-item > button .label']).forEach(label => {
                const text = label.textContent.trim();
                if (text && text !== 'その他') {
                    featureNames.add(text);
                }
            });
            
            // その他メニューの機能
            const moreButton = findElement(['button[aria-label="その他"]']);
            if (moreButton) {
                moreButton.click();
                await wait(1000);
                
                findElements(['.cdk-overlay-pane .toolbox-drawer-menu-item button .label']).forEach(label => {
                    const text = label.textContent.trim().replace(/\s*arrow_drop_down\s*/, '');
                    if (text) {
                        featureNames.add(text);
                    }
                });
            }
            
            window.availableFeatures = Array.from(featureNames).filter(Boolean);
            log(`機能探索完了: ${window.availableFeatures.length}個の機能を発見`, 'success');
            
        } catch (e) {
            log('機能探索エラー: ' + e.message, 'error');
        } finally {
            // メニューを閉じる
            const overlay = document.querySelector('.cdk-overlay-backdrop.cdk-overlay-backdrop-showing');
            if (overlay) overlay.click();
            await wait(500);
        }
        
        return {
            models: window.availableModels,
            features: window.availableFeatures
        };
    }
    
    // ================================================================
    // コア実行関数
    // ================================================================
    async function executeCore(modelName, featureName, promptText) {
        const testResults = [];
        const isCanvasMode = featureName && featureName.toLowerCase().includes('canvas');
        
        const logStep = async (stepName, stepFunction) => {
            try {
                log(stepName, 'step');
                const result = await stepFunction();
                testResults.push({ step: stepName, status: '✅ 成功', details: result || '完了' });
                return result;
            } catch (error) {
                testResults.push({ step: stepName, status: '❌ 失敗', details: error.message });
                log(`エラー: ${error.message}`, 'error');
                throw error;
            }
        };
        
        try {
            // ステップ1: モデルと機能の選択
            await logStep('ステップ1: モデルと機能の選択', async () => {
                log(`選択: モデル='${modelName}', 機能='${featureName}'`, 'info');
                
                // モデルを選択（常に実行、Autoでもデフォルトモデルを明示的に選択）
                const useDefault = !modelName || modelName === 'default' || 
                                  (typeof modelName === 'string' && modelName.toLowerCase() === 'auto');
                
                if (useDefault) {
                    log('デフォルトモデル（Gemini）を使用', 'info');
                } else if (modelName) {
                    const menuButton = findElement([
                        '.gds-mode-switch-button.logo-pill-btn',
                        'button[class*="logo-pill-btn"]',
                        'button.gds-mode-switch-button'
                    ]);
                    
                    if (menuButton) {
                        menuButton.click();
                        await wait(1500);
                        
                        const modelOptions = findElements([
                            'button.bard-mode-list-button',
                            'button[role="menuitemradio"]'
                        ]);
                        
                        const modelButtonToClick = modelOptions.find(btn => {
                            const text = getCleanText(btn);
                            return text.toLowerCase().includes(modelName.toLowerCase());
                        });
                        
                        if (modelButtonToClick) {
                            modelButtonToClick.click();
                            await wait(2000);
                        } else {
                            log(`モデル "${modelName}" が見つからないため、デフォルトを使用`, 'warn');
                        }
                    }
                }
                
                // 機能を選択（null/undefined/'none'/'通常'以外の場合）
                if (featureName && featureName !== 'none' && featureName !== '通常') {
                    // まずメインツールバーから探す
                    let featureButton = findElements([
                        'toolbox-drawer-item button .label',
                        '.toolbox-drawer-menu-item button .label'
                    ]).find(el => {
                        const text = el.textContent.trim();
                        return text.toLowerCase().includes(featureName.toLowerCase());
                    })?.closest('button');
                    
                    // メインツールバーにない場合は、その他メニューから探す
                    if (!featureButton) {
                        const moreButton = findElement(['button[aria-label="その他"]']);
                        if (moreButton) {
                            moreButton.click();
                            await wait(1000);
                            
                            featureButton = findElements([
                                '.cdk-overlay-pane .toolbox-drawer-menu-item button .label'
                            ]).find(el => {
                                const text = el.textContent.trim();
                                return text.toLowerCase().includes(featureName.toLowerCase());
                            })?.closest('button');
                        }
                    }
                    
                    if (featureButton) {
                        featureButton.click();
                        await wait(1000);
                    } else {
                        log(`機能 "${featureName}" が見つからないため、スキップ`, 'warn');
                    }
                }
                
                // オーバーレイを閉じる
                const overlay = document.querySelector('.cdk-overlay-backdrop.cdk-overlay-backdrop-showing');
                if (overlay) overlay.click();
                
                return `モデル: ${modelName}, 機能: ${featureName} を選択しました。`;
            });
            
            // ステップ2: テキスト入力
            await logStep('ステップ2: テキスト入力', async () => {
                const editor = findElement(['.ql-editor']);
                if (!editor) throw new Error("テキスト入力欄 (.ql-editor) が見つかりません。");
                
                editor.textContent = promptText;
                if (editor.classList.contains('ql-blank')) {
                    editor.classList.remove('ql-blank');
                }
                editor.dispatchEvent(new Event('input', { bubbles: true }));
                editor.dispatchEvent(new Event('change', { bubbles: true }));
                
                return `プロンプトを入力しました（${promptText.length}文字）`;
            });
            
            // ステップ3: メッセージ送信
            await logStep('ステップ3: メッセージ送信', async () => {
                const sendButton = findElement([
                    'button.send-button.submit:not(.stop)',
                    'button[aria-label="プロンプトを送信"]:not(.stop)'
                ]);
                
                if (!sendButton) throw new Error("送信ボタンが見つからないか、送信不可能な状態です。");
                sendButton.click();
                
                return "メッセージを送信しました。";
            });
            
            // ステップ4: 応答待機
            const responseText = await logStep('ステップ4: 応答待機', () => new Promise(async (resolve, reject) => {
                log(`待機モード: ${isCanvasMode ? '🎨 Canvas' : '💬 通常'}`, 'info');
                
                if (isCanvasMode) {
                    // Canvasモード: 30秒初期待機 + テキスト変化監視
                    log("Canvasモード: 初期待機30秒...");
                    await wait(30000);
                    log("Canvasモード: テキスト生成の監視を開始します。");
                    
                    let lastLength = -1;
                    let lastChangeTime = Date.now();
                    
                    const monitor = setInterval(() => {
                        const canvasEditor = findElement(['.ProseMirror']);
                        if (!canvasEditor) return;
                        
                        const currentLength = canvasEditor.textContent.length;
                        log(`[監視中] 現在の文字数: ${currentLength}`);
                        
                        if (currentLength > lastLength) {
                            lastLength = currentLength;
                            lastChangeTime = Date.now();
                        }
                        
                        // 10秒間変化がなければ完了とみなす
                        if (Date.now() - lastChangeTime > 10000) {
                            clearInterval(monitor);
                            log("10秒間テキストの更新がなかったため、処理を完了します。", 'success');
                            resolve("Canvasの応答が安定しました。");
                        }
                    }, 2000);
                    
                } else {
                    // 通常モード: 停止ボタンが消えるまで待機
                    log("通常モード: 初期待機10秒...");
                    await wait(10000);
                    
                    let waitTime = 0;
                    const maxWait = 60000;
                    
                    const checker = setInterval(() => {
                        if (!findElement(['button.send-button.stop', 'button.stop'])) {
                            clearInterval(checker);
                            resolve("応答が完了しました（停止ボタンが消えました）。");
                            return;
                        }
                        
                        if (waitTime >= maxWait) {
                            clearInterval(checker);
                            reject(new Error("応答が60秒以内に完了しませんでした。"));
                            return;
                        }
                        
                        log(`[待機中] 応答生成を待っています... (${waitTime / 1000}秒)`);
                        waitTime += 2000;
                    }, 2000);
                }
            }));
            
            // ステップ5: テキスト取得
            await logStep('ステップ5: テキスト取得', async () => {
                let textElement;
                
                if (isCanvasMode) {
                    textElement = findElement(['.ProseMirror[contenteditable="true"]', '.ProseMirror']);
                } else {
                    const responses = findElements(['.model-response-text .markdown', '.markdown']);
                    if (responses.length > 0) {
                        textElement = responses[responses.length - 1];
                    }
                }
                
                if (!textElement || !textElement.textContent) {
                    throw new Error("応答テキストが見つかりません。");
                }
                
                const text = textElement.textContent;
                log(`応答取得成功: ${text.length}文字`, 'success');
                
                // 結果を返す
                return text;
            });
            
            // 最終的な成功レスポンス
            return {
                success: true,
                response: testResults[testResults.length - 1]?.details || '',
                testResults: testResults
            };
            
        } catch (error) {
            log('実行中にエラーが発生しました: ' + error.message, 'error');
            return {
                success: false,
                error: error.message,
                testResults: testResults
            };
        }
    }
    
    // ================================================================
    // メインエントリポイント: executeTask
    // ================================================================
    async function executeTask(taskData) {
        console.log('🚀 Gemini タスク実行開始', taskData);
        
        try {
            // まず利用可能なモデルと機能を探索
            if (window.availableModels.length === 0 || window.availableFeatures.length === 0) {
                await discoverModelsAndFeatures();
            }
            
            // タスクデータから情報を取得（スプレッドシートの値をそのまま使用）
            const modelName = taskData.model;  // そのまま（変換しない）
            const featureName = taskData.function;  // そのまま（変換しない）
            const promptText = taskData.prompt || taskData.text || '桃太郎を2000文字で解説して';
            
            // モデル名と機能名を解決
            let resolvedModel = modelName;
            let resolvedFeature = featureName;
            
            // モデル名の解決（番号または名前マッチング）
            if (typeof modelName === 'number') {
                resolvedModel = window.availableModels[modelName - 1] || 'default';
            } else if (modelName && modelName !== '' && modelName !== 'default' && 
                      (typeof modelName !== 'string' || modelName.toLowerCase() !== 'auto')) {
                // 部分一致で探す
                const found = window.availableModels.find(m => 
                    m.toLowerCase().includes(modelName.toLowerCase())
                );
                if (found) {
                    resolvedModel = found;
                }
            }
            
            // 機能名の解決（番号または名前マッチング）
            if (typeof featureName === 'number') {
                resolvedFeature = window.availableFeatures[featureName - 1] || 'none';
            } else if (featureName && featureName !== '' && featureName !== 'none' && featureName !== '通常') {
                // 部分一致で探す
                const found = window.availableFeatures.find(f => 
                    f.toLowerCase().includes(featureName.toLowerCase())
                );
                if (found) {
                    resolvedFeature = found;
                }
            }
            
            log(`実行パラメータ: モデル="${resolvedModel}", 機能="${resolvedFeature}", プロンプト="${promptText.substring(0, 50)}..."`, 'info');
            
            // コア実行
            const result = await executeCore(resolvedModel, resolvedFeature, promptText);
            
            console.log('✅ Gemini タスク実行完了', result);
            return result;
            
        } catch (error) {
            console.error('❌ Gemini タスク実行エラー:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    // ================================================================
    // グローバル公開
    // ================================================================
    window.GeminiAutomation = {
        executeTask,
        executeCore,
        discoverModelsAndFeatures,
        
        // ユーティリティも公開
        utils: {
            log,
            wait,
            findElement,
            findElements,
            getCleanText
        },
        
        // 状態も公開
        get availableModels() { return window.availableModels; },
        get availableFeatures() { return window.availableFeatures; }
    };
    
    console.log('✅ Gemini Automation 準備完了');
    console.log('使用方法: GeminiAutomation.executeTask({ model: "Pro", function: "Canvas", prompt: "..." })');
    
})();