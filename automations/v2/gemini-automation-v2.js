/**
 * Gemini Automation - リファクタリング版
 * 
 * スプレッドシートからのタスクを受け取り、Geminiで自動実行する
 * V2の堅牢なロジックを保ちながらシンプルな構造を実現
 */

(function() {
    'use strict';
    
    const SCRIPT_VERSION = "3.0.0";
    console.log(`🚀 Gemini Automation v${SCRIPT_VERSION} 初期化`);
    
    // ui-selectorsからインポート（Chrome拡張機能のインジェクトコンテキスト）
    const UI_SELECTORS = window.UI_SELECTORS || {};
    const GeminiSelectorsFromUI = UI_SELECTORS.Gemini || {};
    
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
        const isDeepResearchMode = featureName && (
            featureName.toLowerCase().includes('deep research') || 
            featureName.toLowerCase().includes('deep') ||
            featureName === 'DeepReserch' ||
            featureName === 'DeepResearch'
        );
        
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
            
            // ステップ3: メッセージ送信（再試行対応）
            await logStep('ステップ3: メッセージ送信（再試行対応）', async () => {
                // 送信ボタンを5回まで再試行
                let sendSuccess = false;
                let sendAttempts = 0;
                const maxSendAttempts = 5;
                
                while (!sendSuccess && sendAttempts < maxSendAttempts) {
                    sendAttempts++;
                    log(`送信試行 ${sendAttempts}/${maxSendAttempts}`, 'step');
                    
                    const sendButton = findElement([
                        'button.send-button.submit:not(.stop)',
                        'button[aria-label="プロンプトを送信"]:not(.stop)'
                    ]);
                    
                    if (!sendButton) {
                        if (sendAttempts === maxSendAttempts) {
                            throw new Error('送信ボタンが見つからないか、送信不可能な状態です');
                        }
                        log(`送信ボタンが見つかりません。2秒後に再試行...`, 'warning');
                        await wait(2000);
                        continue;
                    }
                    
                    sendButton.click();
                    log(`送信ボタンをクリックしました（試行${sendAttempts}）`, 'success');
                    await sleep(1000);
                    
                    // 送信後に停止ボタンが表示されるか、5秒待機
                    let stopButtonAppeared = false;
                    
                    for (let i = 0; i < 5; i++) {
                        const stopButton = findElement([
                            'button.stop-button, button.send-button.stop',
                            'button[aria-label="ストリーミングを停止"]'
                        ]);
                        if (stopButton) {
                            stopButtonAppeared = true;
                            log('停止ボタンが表示されました - 送信成功', 'success');
                            break;
                        }
                        await sleep(1000);
                    }
                    
                    if (stopButtonAppeared) {
                        sendSuccess = true;
                        break;
                    } else {
                        log(`送信反応が確認できません。再試行します...`, 'warning');
                        await wait(2000);
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
                        await window.AIHandler.recordSendTimestamp('Gemini');
                        log(`✅ 送信時刻記録成功`, 'success');
                    } catch (error) {
                        log(`❌ 送信時刻記録エラー: ${error.message}`, 'error');
                    }
                } else {
                    log(`⚠️ AIHandler または recordSendTimestamp が利用できません`, 'warning');
                }
                
                return "メッセージを送信しました。";
            });
            
            // ステップ4: 応答待機
            const responseText = await logStep('ステップ4: 応答待機', () => new Promise(async (resolve, reject) => {
                // Deep Researchモードの判定（executeCoreで定義済みの変数を使用）
                console.log(`🔍 [機能判定] Gemini機能チェック:`, {
                    featureName: featureName,
                    isDeepResearchMode: isDeepResearchMode,
                    isCanvasMode: isCanvasMode
                });
                
                console.log(`🎯 [機能判定] Gemini特別モード判定結果: ${isDeepResearchMode ? 'Deep Research' : isCanvasMode ? 'Canvas' : '通常'} (機能: "${featureName}")`);
                
                log(`待機モード: ${isDeepResearchMode ? '🔬 Deep Research' : isCanvasMode ? '🎨 Canvas' : '💬 通常'}`, 'info');
                
                if (isDeepResearchMode) {
                    // Deep Researchモード: 特別な処理フロー
                    const MAX_WAIT = 40 * 60 * 1000; // 40分
                    const startTime = Date.now();
                    
                    const logDr = (message, type = 'info') => {
                        const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(1);
                        log(`[経過: ${elapsedTime}秒] ${message}`, type);
                    };
                    
                    logDr('Deep Researchモードで応答を監視します。');
                    
                    // 全体のタイムアウト設定
                    const timeoutId = setTimeout(() => {
                        reject(new Error(`Deep Researchの応答が${MAX_WAIT / 60000}分以内に完了しませんでした。`));
                    }, MAX_WAIT);
                    
                    try {
                        // ステップ1: 初期応答の停止ボタンが出現するまで待機
                        logDr('ステップ1: 初期応答の開始を待機中...');
                        while (!findElement(['button.send-button.stop'])) {
                            if (Date.now() - startTime > 30000) {
                                throw new Error('30秒以内に初期応答が開始されませんでした。');
                            }
                            await wait(1000);
                        }
                        logDr('ステップ1完了: 初期応答が開始されました。', 'success');
                        
                        // ステップ2: 初期応答が完了して「リサーチを開始」ボタンが出現するまで待機
                        logDr('ステップ2: 初期応答の完了を待機中...');
                        while (findElement(['button.send-button.stop'])) {
                            if (Date.now() - startTime > 2 * 60 * 1000) {
                                throw new Error('2分以内に初期応答が完了しませんでした。');
                            }
                            await wait(1000);
                        }
                        
                        // 「リサーチを開始」ボタンをクリック
                        const researchButton = findElement(['button[data-test-id="confirm-button"]']);
                        if (!researchButton) {
                            throw new Error('「リサーチを開始」ボタンが見つかりませんでした。');
                        }
                        researchButton.click();
                        logDr('ステップ2完了: 「リサーチを開始」ボタンをクリックしました。', 'success');
                        await wait(2000);
                        
                        // ステップ3: 本応答の完了を待つ
                        logDr('ステップ3: 本応答の完了を待機中...');
                        
                        // 定期的な状態チェック
                        const loggingInterval = setInterval(() => {
                            const btn = findElement(['button.send-button.stop']);
                            logDr(`[定期チェック] 回答停止ボタンは${btn ? '✅ 存在します' : '❌ 存在しません'}。`);
                        }, 10000);
                        
                        // 本応答の停止ボタンが出現するまで待つ
                        while (!findElement(['button.send-button.stop'])) {
                            await wait(1000);
                        }
                        logDr('本応答の停止ボタンが出現しました。');
                        
                        // 停止ボタンが10秒間消えたら完了とみなす
                        let lastSeenTime = Date.now();
                        const checkInterval = setInterval(() => {
                            if (findElement(['button.send-button.stop'])) {
                                lastSeenTime = Date.now();
                            } else if (Date.now() - lastSeenTime > 10000) {
                                clearInterval(checkInterval);
                                clearInterval(loggingInterval);
                                clearTimeout(timeoutId);
                                logDr('ステップ3完了: Deep Researchの応答が完了しました。', 'success');
                                resolve('Deep Researchの応答が完了しました。');
                            }
                        }, 2000);
                        
                    } catch (error) {
                        clearTimeout(timeoutId);
                        reject(error);
                    }
                    
                } else if (isCanvasMode) {
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
            
            // ステップ5: テキスト取得（ui-selectorsを使用）
            await logStep('ステップ5: テキスト取得', async () => {
                let text = '';
                
                // 方法1: Canvas/拡張応答を実際のDOM要素で判定して優先的に取得
                const canvasSelectors = [
                    '.ProseMirror[contenteditable="true"][translate="no"]',  // Canvasエディタの正確なセレクタ
                    'div[contenteditable="true"][translate="no"].ProseMirror',
                    '#extended-response-markdown-content .ProseMirror',
                    '#extended-response-message-content .ProseMirror',
                    '.immersive-editor .ProseMirror',
                    '.ProseMirror[contenteditable="true"]',
                    '.ProseMirror'
                ];
                
                // Canvas/拡張応答のチェック
                for (const selector of canvasSelectors) {
                    const canvasElement = findElement([selector]);
                    if (canvasElement) {
                        text = canvasElement.textContent?.trim() || '';
                        if (text && text.length > 10) {
                            log(`Canvas/拡張応答取得成功 (${selector}): ${text.length}文字`, 'success');
                            break;
                        }
                    }
                }
                
                // 方法2: 通常の応答メッセージを取得
                if (!text) {
                    log('通常テキスト取得試行', 'info');
                    
                    // 通常テキストのセレクタ
                    const normalSelectors = [
                        '.model-response-text .markdown.markdown-main-panel',  // 最も具体的なセレクタ
                        '.model-response-text .markdown',
                        '.markdown.markdown-main-panel',
                        '.model-response-text',
                        '.conversation-turn .markdown',
                        'div[class*="model-response"] .markdown'
                    ];
                    
                    for (const selector of normalSelectors) {
                        const responseElements = findElements([selector]);
                        if (responseElements.length > 0) {
                            const latestResponse = responseElements[responseElements.length - 1];
                            text = latestResponse.textContent?.trim() || '';
                            
                            if (text && text.length > 10) {
                                log(`通常テキスト取得成功 (${selector}): ${text.length}文字`, 'success');
                                break;
                            }
                        }
                    }
                    
                }
                
                // 方法3: フォールバック - より汎用的なセレクタで探す
                if (!text) {
                    log('フォールバックセレクタで取得試行', 'info');
                    const fallbackSelectors = [
                        '.model-response-text',
                        'div[class*="model-response"]',
                        '.message-content',
                        'div[data-message-role="model"]',
                        'div[class*="message"][class*="assistant"]'
                    ];
                    
                    for (const selector of fallbackSelectors) {
                        const elements = findElements([selector]);
                        if (elements.length > 0) {
                            const lastElement = elements[elements.length - 1];
                            text = lastElement.textContent?.trim() || '';
                            if (text && text.length > 10) {
                                log(`フォールバック取得成功 (${selector}): ${text.length}文字`, 'success');
                                break;
                            }
                        }
                    }
                }
                
                if (!text) {
                    throw new Error("応答テキストが見つかりません。");
                }
                
                log(`最終的に取得: ${text.length}文字`, 'success');
                log(`最初の100文字: ${text.substring(0, 100)}...`, 'info');
                
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
            
            // タスクデータから情報を取得（機能名マッピング処理あり）
            const modelName = taskData.model;  // そのまま（変換しない）
            let featureName = taskData.function;
            let promptText = taskData.prompt || taskData.text || '桃太郎を2000文字で解説して';
            
            // セル情報をプロンプトに追加（ChatGPT風）
            if (taskData.cellInfo && taskData.cellInfo.column && taskData.cellInfo.row) {
                const cellPosition = `${taskData.cellInfo.column}${taskData.cellInfo.row}`;
                promptText = `[${cellPosition}セル] ${promptText}`;
                log(`📍 セル情報をプロンプトに追加: ${cellPosition}`, 'info');
            }
            
            // 機能名マッピング（スプレッドシート値 → Gemini UI表記）
            const featureMapping = {
                'DeepReserch': 'Deep Research',
                'DeepResearch': 'Deep Research',
                'Deep Research': 'Deep Research'
            };
            
            const mappedFeatureName = featureMapping[featureName] || featureName;
            featureName = mappedFeatureName;
            
            console.log(`🔄 [機能名マッピング] Gemini: "${taskData.function}" → "${featureName}"`);
            
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
    // フェーズ別実行メソッド（順次処理用）
    // ================================================================
    
    /**
     * テキスト入力のみ実行
     * @param {string} prompt - 入力するテキスト
     * @param {object} config - 設定オブジェクト（cellInfo等を含む）
     */
    async function inputTextOnly(prompt, config = {}) {
        try {
            log('📝 [GeminiV2] テキスト入力のみ実行', 'info');
            
            // セル情報をプロンプトに追加（ChatGPT風）
            let finalPrompt = prompt;
            if (config.cellInfo && config.cellInfo.column && config.cellInfo.row) {
                const cellPosition = `${config.cellInfo.column}${config.cellInfo.row}`;
                finalPrompt = `[${cellPosition}セル] ${prompt}`;
                log(`📍 セル情報をプロンプトに追加: ${cellPosition}`, 'info');
            }
            
            const editor = findElement(['.ql-editor']);
            if (!editor) {
                throw new Error("テキスト入力欄 (.ql-editor) が見つかりません。");
            }
            
            editor.textContent = finalPrompt;
            if (editor.classList.contains('ql-blank')) {
                editor.classList.remove('ql-blank');
            }
            editor.dispatchEvent(new Event('input', { bubbles: true }));
            editor.dispatchEvent(new Event('change', { bubbles: true }));
            
            log(`✅ [GeminiV2] テキスト入力完了（${finalPrompt.length}文字）`, 'success');
            return { success: true };
        } catch (error) {
            log(`❌ [GeminiV2] テキスト入力エラー: ${error.message}`, 'error');
            return { success: false, error: error.message };
        }
    }
    
    /**
     * モデル選択のみ実行
     * @param {string} modelName - 選択するモデル名
     */
    async function selectModelOnly(modelName) {
        try {
            if (!modelName || modelName === '') {
                log('⚠️ [GeminiV2] モデル名が指定されていません', 'warn');
                return { success: true };
            }
            
            log(`📝 [GeminiV2] モデル選択のみ実行: ${modelName}`, 'info');
            
            // まずモデルと機能のリストを取得
            await discoverModelsAndFeatures();
            
            // モデル選択（null/undefined以外の場合）
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
                    log(`✅ [GeminiV2] モデル選択完了: ${modelName}`, 'success');
                } else {
                    log(`⚠️ モデル "${modelName}" が見つからないため、デフォルトを使用`, 'warn');
                }
            } else {
                log('⚠️ モデルメニューボタンが見つかりません', 'warn');
            }
            
            return { success: true };
        } catch (error) {
            log(`❌ [GeminiV2] モデル選択エラー: ${error.message}`, 'error');
            return { success: false, error: error.message };
        }
    }
    
    /**
     * 機能選択のみ実行
     * @param {string} functionName - 選択する機能名
     */
    async function selectFunctionOnly(functionName) {
        try {
            if (!functionName || functionName === '' || functionName === 'none' || functionName === '通常') {
                log('⚠️ [GeminiV2] 機能が指定されていません', 'warn');
                return { success: true };
            }
            
            log(`📝 [GeminiV2] 機能選択のみ実行: ${functionName}`, 'info');
            
            // まずメインツールバーから探す
            let featureButton = findElements([
                'toolbox-drawer-item button .label',
                '.toolbox-drawer-menu-item button .label'
            ]).find(el => {
                const text = el.textContent.trim();
                return text.toLowerCase().includes(functionName.toLowerCase());
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
                        return text.toLowerCase().includes(functionName.toLowerCase());
                    })?.closest('button');
                }
            }
            
            if (featureButton) {
                featureButton.click();
                await wait(1000);
                log(`✅ [GeminiV2] 機能選択完了: ${functionName}`, 'success');
            } else {
                log(`⚠️ 機能 "${functionName}" が見つからないため、スキップ`, 'warn');
            }
            
            // オーバーレイを閉じる
            const overlay = document.querySelector('.cdk-overlay-backdrop.cdk-overlay-backdrop-showing');
            if (overlay) overlay.click();
            
            return { success: true };
        } catch (error) {
            log(`❌ [GeminiV2] 機能選択エラー: ${error.message}`, 'error');
            return { success: false, error: error.message };
        }
    }
    
    /**
     * 送信と応答取得のみ実行
     */
    async function sendAndGetResponse() {
        try {
            log('📝 [GeminiV2] 送信と応答取得を実行', 'info');
            
            // 送信ボタンを5回まで再試行
            let sendSuccess = false;
            let sendAttempts = 0;
            const maxSendAttempts = 5;
            
            while (!sendSuccess && sendAttempts < maxSendAttempts) {
                sendAttempts++;
                log(`送信試行 ${sendAttempts}/${maxSendAttempts}`, 'step');
                
                const sendButton = findElement([
                    'button.send-button.submit:not(.stop)',
                    'button[aria-label="プロンプトを送信"]:not(.stop)'
                ]);
                
                if (!sendButton) {
                    if (sendAttempts === maxSendAttempts) {
                        throw new Error('送信ボタンが見つかりません');
                    }
                    log(`送信ボタンが見つかりません。2秒後に再試行...`);
                    await wait(2000);
                    continue;
                }
                
                sendButton.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
                await wait(100);
                sendButton.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
                await wait(100);
                sendButton.click();
                
                log(`送信ボタンをクリックしました（試行${sendAttempts}）`);
                await wait(2000);
                
                // 停止ボタンの出現を確認
                const stopButton = findElement([
                    'button.send-button.stop',
                    'button.stop',
                    'button[aria-label="生成を停止"]'
                ]);
                
                if (stopButton) {
                    sendSuccess = true;
                    log('停止ボタンが表示されました - 送信成功', 'success');
                    break;
                } else {
                    log(`送信反応が確認できません。再試行します...`);
                    await wait(2000);
                }
            }
            
            if (!sendSuccess) {
                throw new Error(`${maxSendAttempts}回試行しても送信が成功しませんでした`);
            }
            
            // 送信時刻を記録
            if (window.AIHandler && window.AIHandler.recordSendTimestamp) {
                try {
                    await window.AIHandler.recordSendTimestamp('Gemini');
                    log(`✅ 送信時刻記録成功`);
                } catch (error) {
                    log(`⚠️ 送信時刻記録エラー: ${error.message}`);
                }
            }
            
            // 応答待機（通常モード）
            log("応答待機開始...");
            await wait(10000); // 初期待機
            
            let waitTime = 0;
            const maxWait = 60000;
            
            // 停止ボタンが消えるまで待機
            await new Promise((resolve) => {
                const checker = setInterval(() => {
                    if (!findElement(['button.send-button.stop', 'button.stop'])) {
                        clearInterval(checker);
                        resolve("応答が完了しました（停止ボタンが消えました）。");
                        return;
                    }
                    
                    if (waitTime >= maxWait) {
                        clearInterval(checker);
                        resolve("応答待機がタイムアウトしました（60秒）。処理を続行します。");
                        return;
                    }
                    
                    waitTime += 2000;
                }, 2000);
            });
            
            // テキスト取得
            await wait(2000); // 少し待ってから取得
            
            // 応答テキストを取得
            const responseElements = findElements([
                '.message-content .model-response-text',
                '.model-response-text',
                '.response-container',
                '.conversation-turn .message'
            ]);
            
            let responseText = '';
            if (responseElements.length > 0) {
                const lastResponse = responseElements[responseElements.length - 1];
                responseText = lastResponse.textContent?.trim() || '';
            }
            
            // Canvas機能の場合
            if (!responseText) {
                const canvasEditor = findElement(['.ProseMirror']);
                if (canvasEditor) {
                    responseText = canvasEditor.textContent?.trim() || '';
                }
            }
            
            if (responseText) {
                log(`✅ [GeminiV2] 応答取得完了: ${responseText.length}文字`, 'success');
                return {
                    success: true,
                    response: responseText
                };
            } else {
                throw new Error('応答テキストを取得できませんでした');
            }
            
        } catch (error) {
            log(`❌ [GeminiV2] 送信・応答取得エラー: ${error.message}`, 'error');
            return { success: false, error: error.message };
        }
    }
    
    // ================================================================
    // グローバル公開
    // ================================================================
    window.GeminiAutomation = {
        executeTask,
        executeCore,
        discoverModelsAndFeatures,
        // フェーズ別メソッド（順次処理用）
        inputTextOnly,
        selectModelOnly,
        selectFunctionOnly,
        sendAndGetResponse,
        
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
    
    // デバッグ: グローバル公開の確認
    if (typeof window.GeminiAutomation !== 'undefined') {
        console.log('✅ window.GeminiAutomation が正常に公開されました');
        console.log('利用可能なメソッド:', Object.keys(window.GeminiAutomation));
    } else {
        console.error('❌ window.GeminiAutomation の公開に失敗しました');
    }
    
})();