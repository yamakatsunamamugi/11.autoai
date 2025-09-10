/**
 * Gemini Automation - リファクタリング版
 * 
 * スプレッドシートからのタスクを受け取り、Geminiで自動実行する
 * V2の堅牢なロジックを保ちながらシンプルな構造を実現
 * 
 * 待機時間設定:
 * - 初期待機: 30秒（全モード統一）
 * - 最大待機: 5分（通常モード・Canvasモード共通）
 * - チェック間隔: 2秒
 */

(function() {
    'use strict';
    
    const SCRIPT_VERSION = "3.0.0";
    console.log(`🚀 Gemini Automation v${SCRIPT_VERSION} 初期化`);
    
    // ui-selectorsからインポート（Chrome拡張機能のインジェクトコンテキスト）
    const UI_SELECTORS = window.UI_SELECTORS || {};
    const GeminiSelectors = UI_SELECTORS.Gemini || {};
    
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
                    let featureButton = null;
                    
                    // 1. まずメインの機能ボタンから探す（テストコードと同じロジック）
                    const allButtons = findElements(['toolbox-drawer-item > button']);
                    log(`🔍 メインボタン数: ${allButtons.length}`, 'info');
                    
                    featureButton = Array.from(allButtons).find(btn => {
                        const labelElement = findElement(['.label'], btn);
                        if (labelElement) {
                            const text = getCleanText(labelElement);
                            return text.toLowerCase() === featureName.toLowerCase() || 
                                   text.toLowerCase().includes(featureName.toLowerCase());
                        }
                        return false;
                    });
                    
                    // 2. メインにない場合は「その他」メニューを開く
                    if (!featureButton) {
                        const moreButton = findElement(['button[aria-label="その他"]']);
                        if (moreButton) {
                            moreButton.click();
                            await wait(1500); // 待機時間を増やす
                            
                            // サブメニュー内から機能を探す
                            const menuButtons = findElements(['.cdk-overlay-pane .toolbox-drawer-menu-item button']);
                            featureButton = Array.from(menuButtons).find(btn => {
                                const labelElement = findElement(['.label'], btn);
                                if (labelElement) {
                                    const text = getCleanText(labelElement);
                                    return text.toLowerCase() === featureName.toLowerCase() || 
                                           text.toLowerCase().includes(featureName.toLowerCase());
                                }
                                return false;
                            });
                        }
                    }
                    
                    if (featureButton) {
                        featureButton.click();
                        await wait(2000); // 選択後の待機時間を増やす
                        log(`✅ 機能「${featureName}」を選択しました`, 'success');
                        
                        // 選択状態の検証
                        const selectedButton = findElement([
                            '.toolbox-drawer-item-button button.is-selected',
                            '.toolbox-drawer-button.has-selected-item'
                        ]);
                        if (!selectedButton) {
                            log(`⚠️ 機能の選択状態が確認できません`, 'warn');
                        }
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
                    await wait(30000);  // 統一: 30秒
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
                    log("通常モード: 初期待機30秒...");
                    await wait(30000);  // 統一: 30秒
                    
                    let waitTime = 0;
                    const maxWait = 300000;  // 統一: 5分
                    
                    const checker = setInterval(() => {
                        if (!findElement(['button.send-button.stop', 'button.stop'])) {
                            clearInterval(checker);
                            resolve("応答が完了しました（停止ボタンが消えました）。");
                            return;
                        }
                        
                        if (waitTime >= maxWait) {
                            clearInterval(checker);
                            reject(new Error("応答が5分以内に完了しませんでした。"));
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
            
            // セル情報をプロンプトに追加（column-processor.js形式）
            if (taskData.cellInfo && taskData.cellInfo.column && taskData.cellInfo.row) {
                const cellPosition = `${taskData.cellInfo.column}${taskData.cellInfo.row}`;
                promptText = `【現在${cellPosition}セルを処理中です】\n\n${promptText}`;
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
            
            // セル情報をプロンプトに追加（column-processor.js形式）
            let finalPrompt = prompt;
            if (config.cellInfo && config.cellInfo.column && config.cellInfo.row) {
                const cellPosition = `${config.cellInfo.column}${config.cellInfo.row}`;
                finalPrompt = `【現在${cellPosition}セルを処理中です】\n\n${prompt}`;
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
                // 現在表示されているモデル名を取得して返す
                const currentModelDisplay = findElement([
                    '.logo-pill-label-container',
                    '.gds-mode-switch-button .mdc-button__label div',
                    '.gds-mode-switch-button .label'
                ]);
                const displayText = currentModelDisplay ? getCleanText(currentModelDisplay) : 'Gemini';
                return { success: true, displayedModel: displayText };
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
                
                // メニューコンテナを明示的に取得（テストコードと同じ方法）
                const menuContainer = findElement([
                    '.cdk-overlay-pane .menu-inner-container',
                    '.cdk-overlay-pane mat-action-list[data-test-id="mobile-nested-mode-menu"]',
                    '.cdk-overlay-pane'
                ]);
                
                const modelOptions = menuContainer ? 
                    findElements(['button.bard-mode-list-button[mat-menu-item]', 'button[role="menuitemradio"]'], menuContainer) :
                    findElements(['button.bard-mode-list-button', 'button[role="menuitemradio"]']);
                
                const modelButtonToClick = Array.from(modelOptions).find(btn => {
                    const text = getCleanText(btn);
                    return text.toLowerCase().includes(modelName.toLowerCase());
                });
                
                if (modelButtonToClick) {
                    modelButtonToClick.click();
                    await wait(2000);
                    log(`✅ [GeminiV2] モデル選択完了: ${modelName}`, 'success');
                } else {
                    log(`⚠️ モデル "${modelName}" が見つからないため、デフォルトを使用`, 'warn');
                    // メニューを閉じる
                    const backdrop = document.querySelector('.cdk-overlay-backdrop');
                    if (backdrop) backdrop.click();
                    await wait(500);
                }
            } else {
                log('⚠️ モデルメニューボタンが見つかりません', 'warn');
            }
            
            // 現在表示されているモデル名を取得
            const currentModelDisplay = findElement([
                '.logo-pill-label-container',
                '.gds-mode-switch-button .mdc-button__label div',
                '.gds-mode-switch-button .label'
            ]);
            const displayText = currentModelDisplay ? getCleanText(currentModelDisplay) : modelName;
            
            log(`📊 [GeminiV2] 現在のモデル表示: ${displayText}`, 'info');
            
            return { 
                success: true,
                displayedModel: displayText
            };
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
            
            // テストコードのロジックに合わせて修正
            let featureButton = null;
            
            // 1. まずメインの機能ボタンから探す
            const allButtons = findElements(['toolbox-drawer-item > button']);
            log(`🔍 メインボタン数: ${allButtons.length}`, 'info');
            
            featureButton = Array.from(allButtons).find(btn => {
                const labelElement = findElement(['.label'], btn);
                if (labelElement) {
                    const text = getCleanText(labelElement);
                    log(`   チェック中: "${text}" vs "${functionName}"`, 'info');
                    return text.toLowerCase() === functionName.toLowerCase() || 
                           text.toLowerCase().includes(functionName.toLowerCase());
                }
                return false;
            });
            
            // 2. メインにない場合は「その他」メニューを開く
            if (!featureButton) {
                log('📝 メインボタンに見つからないため、「その他」メニューを確認', 'info');
                const moreButton = findElement(['button[aria-label="その他"]']);
                
                if (!moreButton) {
                    log('⚠️ 「その他」ボタンが見つかりません', 'warn');
                    return { success: false, error: '「その他」ボタンが見つかりません' };
                }
                
                // サブメニューを開く
                moreButton.click();
                await wait(1500); // 待機時間を増やす
                
                // サブメニュー内から機能を探す
                const menuButtons = findElements(['.cdk-overlay-pane .toolbox-drawer-menu-item button']);
                log(`🔍 サブメニューボタン数: ${menuButtons.length}`, 'info');
                
                featureButton = Array.from(menuButtons).find(btn => {
                    const labelElement = findElement(['.label'], btn);
                    if (labelElement) {
                        const text = getCleanText(labelElement);
                        log(`   チェック中（サブメニュー）: "${text}" vs "${functionName}"`, 'info');
                        return text.toLowerCase() === functionName.toLowerCase() || 
                               text.toLowerCase().includes(functionName.toLowerCase());
                    }
                    return false;
                });
            }
            
            // 3. 見つかった機能ボタンをクリック
            if (!featureButton) {
                log(`❌ 機能ボタン "${functionName}" が見つかりませんでした`, 'error');
                // オーバーレイを閉じる
                const overlay = document.querySelector('.cdk-overlay-backdrop');
                if (overlay) {
                    overlay.click();
                    await wait(500);
                }
                return { success: false, error: `機能 "${functionName}" が見つかりません` };
            }
            
            featureButton.click();
            await wait(2000); // 選択後の待機時間を増やす
            log(`✅ 機能ボタンをクリックしました: ${functionName}`, 'success');
            
            // 4. 選択状態の検証（画面サイズに対応）
            let displayedFunction = functionName || '通常';
            
            // 機能アイコンのマッピング（画面が小さい場合の「その他」ボタン用）
            const iconToFunction = {
                'photo_prints': '画像',
                'image': '画像',
                'note_stack_add': 'Canvas',
                'canvas': 'Canvas',
                'science': 'Deep Research',
                'research': 'Deep Research',
                // 必要に応じて他の機能も追加
            };
            
            // 通常の選択ボタンを確認
            const selectedButton = findElement([
                '.toolbox-drawer-item-button button.is-selected',
                '.toolbox-drawer-button.has-selected-item'
            ]);
            
            if (selectedButton) {
                log(`✅ 機能「${functionName}」の選択状態を確認しました`, 'success');
                
                // 「その他」ボタンの場合、アイコンから実際の機能を特定
                if (selectedButton.classList.contains('has-selected-item')) {
                    const iconElement = selectedButton.querySelector('mat-icon[data-mat-icon-name]');
                    if (iconElement) {
                        const iconName = iconElement.getAttribute('data-mat-icon-name');
                        log(`🔍 「その他」ボタンのアイコン: ${iconName}`, 'info');
                        
                        // アイコン名から機能名を取得
                        const detectedFunction = iconToFunction[iconName];
                        if (detectedFunction) {
                            displayedFunction = detectedFunction;
                            log(`✅ アイコンから機能を特定: ${detectedFunction}`, 'success');
                        } else {
                            log(`⚠️ 未知のアイコン: ${iconName}`, 'warn');
                        }
                    }
                }
            } else {
                log(`⚠️ 「${functionName}」を選択しましたが、選択状態が確認できません`, 'warn');
                // 選択自体は実行されたため、成功として扱う
            }
            
            // オーバーレイが残っている場合は閉じる
            const overlay = document.querySelector('.cdk-overlay-backdrop');
            if (overlay) {
                overlay.click();
                await wait(500);
            }
            
            log(`📊 [GeminiV2] 選択された機能: ${displayedFunction}`, 'info');
            return { success: true, displayedFunction: displayedFunction };
        } catch (error) {
            log(`❌ [GeminiV2] 機能選択エラー: ${error.message}`, 'error');
            // オーバーレイを閉じる（エラー時も）
            const overlay = document.querySelector('.cdk-overlay-backdrop');
            if (overlay) {
                overlay.click();
                await wait(500);
            }
            return { success: false, error: error.message };
        }
    }
    
    /**
     * 送信と応答取得のみ実行
     * @param {Object} taskData - タスク情報（function含む）
     */
    async function sendAndGetResponse(taskData) {
        try {
            log('📝 [GeminiV2] 送信と応答取得を実行', 'info');
            
            // taskDataのデバッグログ
            log(`🔍 [GeminiV2] taskData受信: ${JSON.stringify(taskData)}`, 'info');
            
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
            
            // 送信後、応答形式（通常/Canvas）を判定
            log('📝 [GeminiV2] 応答形式を判定中...', 'info');
            
            // 初期待機（AIが応答形式を決定する時間）
            await wait(5000); // 5秒待機（AIの応答形式決定を待つ）
            
            // Canvas応答テキストを外側のスコープで定義（最初に定義）
            let canvasResponseText = '';
            let isCanvasMode = false;
            let checkAttempts = 0;
            const maxCheckAttempts = 3; // 3回チェック（3秒ごと = 最大9秒）
            
            while (checkAttempts < maxCheckAttempts) {
                checkAttempts++;
                await wait(3000); // 3秒待機
                
                // Canvas要素（.ProseMirror）の存在をチェック - これがAIの応答形式判定の鍵
                const canvasSelectors = GeminiSelectors.CANVAS_EDITOR || [
                    '.ProseMirror',
                    '.ProseMirror[contenteditable="true"]',
                    'div[contenteditable="true"].ProseMirror',
                    '.immersive-editor .ProseMirror',
                    '#extended-response-markdown-content .ProseMirror'
                ];
                const canvasEditor = findElement(canvasSelectors);
                
                // Canvas要素が存在 = AIがCanvas形式を選択した
                if (canvasEditor) {
                    isCanvasMode = true;
                    const currentText = getStructuredCanvasContent(canvasEditor) || canvasEditor.textContent?.trim() || '';
                    
                    if (currentText.length > 0) {
                        canvasResponseText = currentText;
                        log(`🎨 [GeminiV2] Canvas形式の応答を検出（${currentText.length}文字）- 試行${checkAttempts}/${maxCheckAttempts}`, 'success');
                        log(`🎨 [GeminiV2] 検出したテキストの先頭100文字: ${currentText.substring(0, 100)}...`, 'info');
                    } else {
                        log(`🎨 [GeminiV2] Canvas形式検出、テキスト生成待機中 - 試行${checkAttempts}/${maxCheckAttempts}`, 'info');
                    }
                    break; // Canvas要素が見つかったらループを抜ける
                }
                
                // Canvasボタンのチェック（表示されているが未展開の場合）
                const canvasButtonSelectors = GeminiSelectors.CANVAS_BUTTON || [
                    'div.container.is-open.clickable[data-test-id="container"]',
                    'div.container.clickable[data-test-id="container"]',
                    'div[data-test-id="container"].clickable'
                ];
                const canvasButton = findElement(canvasButtonSelectors);
                
                // Canvasボタンがある場合はクリックして展開
                if (canvasButton) {
                    log('🎨 [GeminiV2] Canvasボタンを検出 - クリックして開きます', 'info');
                    canvasButton.click();
                    await wait(2000); // Canvas展開を待つ
                    
                    // 再度Canvas要素を確認
                    const canvasEditorAfterClick = findElement(canvasSelectors);
                    if (canvasEditorAfterClick) {
                        isCanvasMode = true;
                        const canvasTextAfterClick = getStructuredCanvasContent(canvasEditorAfterClick) || canvasEditorAfterClick.textContent?.trim() || '';
                        if (canvasTextAfterClick.length > 0) {
                            canvasResponseText = canvasTextAfterClick;
                            log(`🎨 [GeminiV2] Canvas形式の応答を展開して取得（${canvasTextAfterClick.length}文字）`, 'success');
                        } else {
                            log(`🎨 [GeminiV2] Canvas形式を展開、テキスト生成待機中`, 'info');
                        }
                        break;
                    }
                }
                
                // Canvas要素が見つからない場合、通常形式の応答をチェック
                if (!isCanvasMode) {
                    // 通常の応答要素（停止ボタンは判定から除外）
                    const normalResponse = findElement([
                        '.message-content .model-response-text',
                        '.model-response-text',
                        '.markdown.markdown-main-panel',
                        '.conversation-turn .markdown'
                    ]);
                    
                    if (normalResponse) {
                        log(`💬 [GeminiV2] 通常形式の応答を検出`, 'info');
                        break;
                    } else {
                        log(`⏳ [GeminiV2] 応答形式を判定中 - 試行${checkAttempts}/${maxCheckAttempts}`, 'info');
                    }
                }
            }
            
            if (!isCanvasMode) {
                log(`💬 [GeminiV2] 通常形式の応答として処理`, 'info');
            }
            
            // 応答待機（Canvas/通常モード判定）
            if (isCanvasMode) {
                // 既に取得済みのテキストがある場合はそれを使用
                if (canvasResponseText && canvasResponseText.length > 0) {
                    log(`✅ [GeminiV2] Canvas応答を最初の検出時に取得済み: ${canvasResponseText.length}文字`, 'success');
                    // 既にテキストがあるので、リトライ処理はスキップ
                } else {
                    // テキストがない場合のみ、追加の待機と監視を実行
                    // Canvasモード: 最大3回リトライ
                    let retryCount = 0;
                    const maxRetries = 3;
                    
                    while (retryCount < maxRetries) {
                        retryCount++;
                        log(`🎨 Canvasモード: 追加監視試行 ${retryCount}/${maxRetries}`, 'info');
                        
                        // 初期待機を統一（30秒）
                        log('🎨 Canvasモード: 追加待機30秒...', 'info');
                        await wait(30000);  // 統一: 30秒
                    
                    log('🎨 Canvasモード: テキスト生成の監視を開始します。', 'info');
                    
                    // テキスト安定性監視（5分タイムアウト）
                    canvasResponseText = await new Promise((resolve) => {
                        let lastLength = -1;
                        let lastChangeTime = Date.now();
                        const monitorStartTime = Date.now();
                        const maxWaitTime = 300000; // 5分
                        const stabilityDuration = 10000; // 10秒
                        const monitorInterval = 2000; // 2秒
                        let canvasNotFoundCount = 0;
                        const maxCanvasNotFound = 5; // Canvas要素が5回連続で見つからなければ終了
                        
                        const monitor = setInterval(() => {
                            // ui-selectorsから取得
                            const canvasSelectors = GeminiSelectors.CANVAS_EDITOR || [
                                '.ProseMirror',
                                'immersive-editor .ProseMirror',
                                '.immersive-editor .ProseMirror',
                                '#extended-response-markdown-content .ProseMirror'
                            ];
                            const canvasEditor = findElement(canvasSelectors);
                            if (!canvasEditor) {
                                canvasNotFoundCount++;
                                log(`⚠️ Canvas要素(.ProseMirror)が見つかりません (${canvasNotFoundCount}/${maxCanvasNotFound})`, 'warn');
                                
                                // 5回連続で見つからない場合は空文字列で終了
                                if (canvasNotFoundCount >= maxCanvasNotFound) {
                                    clearInterval(monitor);
                                    log('⚠️ Canvas要素が見つからないため、このリトライを終了します', 'warn');
                                    resolve('');
                                }
                                return;
                            }
                            
                            // Canvas要素が見つかったらカウンターをリセット
                            canvasNotFoundCount = 0;
                            
                            const currentText = canvasEditor.textContent || '';
                            const currentLength = currentText.length;
                            log(`[監視中] Canvas文字数: ${currentLength}`, 'info');
                            
                            if (currentLength > lastLength) {
                                lastLength = currentLength;
                                lastChangeTime = Date.now();
                            }
                            
                            // 10秒間変化がなく、かつテキストがある場合は完了
                            if (Date.now() - lastChangeTime > stabilityDuration && currentLength > 0) {
                                clearInterval(monitor);
                                log(`✅ Canvasのテキストが${stabilityDuration / 1000}秒間安定しました（${currentLength}文字）`, 'success');
                                resolve(currentText);
                            }
                            
                            // 5分タイムアウト - 現在のテキストを返す
                            if (Date.now() - monitorStartTime > maxWaitTime) {
                                clearInterval(monitor);
                                const finalText = canvasEditor ? (canvasEditor.textContent || '') : '';
                                if (finalText.length > 0) {
                                    log(`⏱️ 5分タイムアウト - 現在のテキストを取得（${finalText.length}文字）`, 'warn');
                                } else {
                                    log(`⏱️ 5分タイムアウト - テキストが取得できませんでした`, 'warn');
                                }
                                resolve(finalText);
                            }
                        }, monitorInterval);
                    });
                    
                    // テキストが取得できたら終了
                    if (canvasResponseText && canvasResponseText.length > 0) {
                        log(`✅ Canvas応答取得成功: ${canvasResponseText.length}文字`, 'success');
                        break;
                    }
                    
                    // リトライ
                    if (retryCount < maxRetries) {
                        log(`⚠️ Canvas応答が空です。10秒後にリトライします...`, 'warn');
                        await wait(10000);
                    }
                }
                
                    // 最終的にテキストが取得できなかった場合
                    if (!canvasResponseText || canvasResponseText.length === 0) {
                        log('❌ 3回リトライしてもCanvas応答を取得できませんでした', 'error');
                        // エラーをthrowせずに処理を継続（空文字列として扱う）
                    }
                }
                
            } else {
                // 通常モード: 既存の処理
                log("通常モード: 応答待機開始...");
                await wait(30000); // 初期待機を30秒に統一
                
                let waitTime = 0;
                const maxWait = 300000;  // 最大待機を5分に統一
                
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
                            resolve("応答待機がタイムアウトしました（5分）。処理を続行します。");
                            return;
                        }
                        
                        log(`[待機中] 応答生成を待っています... (${waitTime / 1000}秒)`, 'info');
                        waitTime += 2000;
                    }, 2000);
                });
            }
            
            // テキスト取得
            await wait(2000); // 少し待ってから取得
            
            // 応答テキストを取得
            log('📝 [GeminiV2] 応答テキスト取得開始', 'info');
            
            // [DEBUG] DOM状態の確認
            console.log('🔍 [DEBUG] Gemini応答取得時のDOM状態:', {
                timestamp: new Date().toISOString(),
                messageContents: document.querySelectorAll('.message-content').length,
                modelResponseTexts: document.querySelectorAll('.model-response-text').length,
                proseMirrors: document.querySelectorAll('.ProseMirror').length,
                allTexts: Array.from(document.querySelectorAll('.model-response-text, .ProseMirror')).map(el => ({
                    className: el.className,
                    textLength: el.textContent?.length || 0,
                    preview: el.textContent?.substring(0, 200)
                }))
            });
            
            let responseText = '';
            
            if (isCanvasMode) {
                // Canvasモード: リトライ処理で取得済みのテキストを使用
                if (typeof canvasResponseText !== 'undefined' && canvasResponseText) {
                    responseText = canvasResponseText;
                    log(`✅ [GeminiV2] Canvas応答使用: ${responseText.length}文字`, 'success');
                    
                    // [DEBUG] Canvas取得テキストの詳細
                    console.log('🔍 [DEBUG] Canvas取得テキスト:', {
                        length: responseText.length,
                        preview: responseText.substring(0, 500),
                        fullText: responseText
                    });
                    if (responseText.length <= 200) {
                        log(`Canvas内容: ${responseText}`, 'info');
                    } else {
                        log(`Canvas内容（先頭100文字）: ${responseText.substring(0, 100)}...`, 'info');
                        log(`Canvas内容（末尾100文字）: ...${responseText.substring(responseText.length - 100)}`, 'info');
                    }
                } else {
                    // フォールバック: 再度Canvas要素を探す
                    const canvasSelectors = GeminiSelectors.CANVAS_EDITOR || ['.ProseMirror'];
                    const canvasEditor = findElement(canvasSelectors);
                    if (canvasEditor) {
                        responseText = canvasEditor.textContent || '';
                        log(`✅ [GeminiV2] Canvas応答取得（フォールバック）: ${responseText.length}文字`, 'success');
                    } else {
                        log('⚠️ [GeminiV2] Canvas要素(.ProseMirror)が見つかりません - 空文字列として処理を継続', 'warn');
                        responseText = '';
                    }
                }
            }
            
            // Canvas応答が取得できない場合は通常の応答要素をチェック
            if (!responseText) {
                log('📝 [GeminiV2] 通常の応答要素を確認', 'info');
                const responseElements = findElements([
                    '.message-content .model-response-text',
                    '.model-response-text',
                    '.response-container',
                    '.conversation-turn .message',
                    '.message-content',
                    '[data-message-author="assistant"]',
                    '.model-message'
                ]);
                
                // [DEBUG] 通常応答要素の詳細
                console.log('🔍 [DEBUG] 通常応答要素の詳細:', {
                    elementCount: responseElements.length,
                    elements: Array.from(responseElements).map((el, idx) => ({
                        index: idx,
                        className: el.className,
                        textLength: el.textContent?.length || 0,
                        preview: el.textContent?.substring(0, 200)
                    }))
                });
                
                if (responseElements.length > 0) {
                    const lastResponse = responseElements[responseElements.length - 1];
                    responseText = lastResponse.textContent?.trim() || '';
                    
                    // [DEBUG] 最後の応答要素の詳細
                    console.log('🔍 [DEBUG] 最後の応答要素から取得:', {
                        length: responseText.length,
                        preview: responseText.substring(0, 500),
                        fullText: responseText
                    });
                    
                    if (responseText) {
                        log(`✅ [GeminiV2] 通常応答取得: ${responseText.substring(0, 100)}...`, 'success');
                    }
                }
            }
            
            // それでも取得できない場合、より広範囲に探す
            if (!responseText) {
                log('⚠️ [GeminiV2] 応答テキストが見つからない。全体を探索中...', 'warn');
                
                // メインコンテナから探す
                const mainContainer = findElement([
                    '.conversation-container',
                    '.chat-container',
                    'main',
                    '[role="main"]'
                ]);
                
                if (mainContainer) {
                    // 最後のメッセージを探す
                    const allMessages = mainContainer.querySelectorAll('[class*="message"], [class*="response"]');
                    if (allMessages.length > 0) {
                        const lastMessage = allMessages[allMessages.length - 1];
                        responseText = lastMessage.textContent?.trim() || '';
                        if (responseText) {
                            log(`✅ [GeminiV2] 全体探索で応答取得: ${responseText.substring(0, 100)}...`, 'success');
                        }
                    }
                }
            }
            
            if (responseText) {
                log(`✅ [GeminiV2] 応答取得完了: ${responseText.length}文字`, 'success');
                
                // 現在表示されているモデルと機能を取得
                let displayedModel = '';
                let displayedFunction = '';
                
                try {
                    // ModelInfoExtractorを使用（グローバルに登録されている）
                    if (window.ModelInfoExtractor) {
                        displayedModel = window.ModelInfoExtractor.extract('Gemini') || '';
                        log(`📊 ModelInfoExtractor結果: "${displayedModel}"`, 'info');
                    } else {
                        log('⚠️ ModelInfoExtractorが利用できません', 'warn');
                    }
                    
                    // FunctionInfoExtractorを使用
                    if (window.FunctionInfoExtractor) {
                        displayedFunction = window.FunctionInfoExtractor.extract('Gemini') || '';
                        log(`📊 FunctionInfoExtractor結果: "${displayedFunction}"`, 'info');
                    } else {
                        log('⚠️ FunctionInfoExtractorが利用できません', 'warn');
                    }
                } catch (error) {
                    log(`⚠️ モデル/機能情報取得エラー: ${error.message}`, 'warn');
                }
                
                // [DEBUG] 最終的に返すテキスト
                console.log('🔍 [DEBUG] Gemini最終応答テキスト:', {
                    timestamp: new Date().toISOString(),
                    length: responseText.length,
                    preview: responseText.substring(0, 500),
                    fullText: responseText,
                    isCanvasMode: isCanvasMode,
                    displayedModel: displayedModel,
                    displayedFunction: displayedFunction
                });
                
                return {
                    success: true,
                    response: responseText,
                    displayedModel: displayedModel,
                    displayedFunction: displayedFunction
                };
            } else {
                // [DEBUG] 応答取得失敗時のDOM状態
                console.log('🔍 [DEBUG] 応答取得失敗時のDOM:', {
                    timestamp: new Date().toISOString(),
                    bodyTextLength: document.body.textContent?.length || 0,
                    visibleElements: Array.from(document.querySelectorAll('*')).filter(el => 
                        el.offsetHeight > 0 && el.textContent?.trim().length > 100
                    ).map(el => ({
                        tagName: el.tagName,
                        className: el.className,
                        textLength: el.textContent?.length || 0
                    }))
                });
                
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