// content-integration.js - スプレッドシート統合機能（拡張機能対応版）
(function() {
    'use strict';
    
    const isExtension = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id;
    
    // 基本操作関数
    window.CLAUDE_OPERATIONS = {
        // モデル切り替え関数
        changeModel: async function(modelName) {
            try {
                const normalizedModel = CLAUDE_CONFIG.MODEL_ALIASES[modelName.toLowerCase()] || modelName;
                
                // キャッシュチェック
                const now = Date.now();
                if (CLAUDE_CONFIG.globalState.modelCache === normalizedModel &&
                    CLAUDE_CONFIG.globalState.modelCacheTime &&
                    (now - CLAUDE_CONFIG.globalState.modelCacheTime) < CLAUDE_CONFIG.globalState.CACHE_DURATION) {
                    CLAUDE_UTILS.log('モデルはキャッシュから確認済み: ' + normalizedModel, 'SUCCESS');
                    return { success: true, model: normalizedModel };
                }
                
                // モデル選択ボタンを探す
                const modelButton = await CLAUDE_UTILS.findElement([
                    'button[class*="model-selector"]',
                    'button[data-testid="model-selector"]',
                    'button[aria-haspopup="menu"]'
                ], (el) => el.textContent && (
                    el.textContent.includes('Claude Opus') || 
                    el.textContent.includes('Claude Sonnet') || 
                    el.textContent.includes('Claude Haiku')
                ));
                
                if (!modelButton) {
                    throw new Error('モデル選択ボタンが見つかりません');
                }
                
                // 現在のモデルを確認
                const currentModelText = modelButton.textContent;
                if (currentModelText.includes(normalizedModel)) {
                    CLAUDE_UTILS.log('既に ' + normalizedModel + ' が選択されています', 'SUCCESS');
                    CLAUDE_CONFIG.globalState.currentModel = normalizedModel;
                    CLAUDE_CONFIG.globalState.modelCache = normalizedModel;
                    CLAUDE_CONFIG.globalState.modelCacheTime = now;
                    return { success: true, model: normalizedModel };
                }
                
                // モデルメニューを開く
                await CLAUDE_UTILS.performClick(modelButton);
                await CLAUDE_UTILS.wait(CLAUDE_CONFIG.DELAYS.menuOpen);
                
                // メニューから目的のモデルを選択
                const modelOption = await CLAUDE_UTILS.findElement([
                    'div[role="menuitem"]',
                    'button[role="menuitem"]',
                    '[data-testid*="model-option"]'
                ], (el) => el.textContent && el.textContent.includes(normalizedModel));
                
                if (!modelOption) {
                    throw new Error('モデル ' + normalizedModel + ' が見つかりません');
                }
                
                await CLAUDE_UTILS.performClick(modelOption);
                await CLAUDE_UTILS.wait(CLAUDE_CONFIG.DELAYS.modelSwitch);
                
                CLAUDE_CONFIG.globalState.currentModel = normalizedModel;
                CLAUDE_CONFIG.globalState.modelCache = normalizedModel;
                CLAUDE_CONFIG.globalState.modelCacheTime = now;
                
                CLAUDE_UTILS.log('モデルを ' + normalizedModel + ' に切り替えました', 'SUCCESS');
                return { success: true, model: normalizedModel };
                
            } catch (error) {
                CLAUDE_UTILS.log('モデル切り替えエラー: ' + error.message, 'ERROR');
                return { success: false, error: error.message };
            }
        },
        
        // 機能の有効化/無効化
        toggleFunction: async function(functionName, enable = true) {
            try {
                const normalizedFunction = CLAUDE_CONFIG.FUNCTION_ALIASES[functionName.toLowerCase()] || functionName;
                
                // DeepResearchモードの特別処理
                if (normalizedFunction === 'リサーチ') {
                    CLAUDE_CONFIG.globalState.deepResearchMode = enable;
                    CLAUDE_UTILS.log('DeepResearchモード: ' + (enable ? '有効' : '無効'), 'SUCCESS');
                }
                
                // キャッシュチェック
                const now = Date.now();
                const isActive = CLAUDE_CONFIG.globalState.activeFunctions.has(normalizedFunction);
                if (isActive === enable &&
                    CLAUDE_CONFIG.globalState.functionCacheTime &&
                    (now - CLAUDE_CONFIG.globalState.functionCacheTime) < CLAUDE_CONFIG.globalState.CACHE_DURATION) {
                    CLAUDE_UTILS.log('機能 ' + normalizedFunction + ' は既に' + (enable ? '有効' : '無効') + 'です', 'SUCCESS');
                    return { success: true, function: normalizedFunction, enabled: enable };
                }
                
                // 機能メニューボタンを探す
                const functionButton = await CLAUDE_UTILS.findElement([
                    'button[aria-label*="機能"]',
                    'button[data-testid="functions-button"]',
                    'button[class*="functions"]'
                ]);
                
                if (!functionButton) {
                    throw new Error('機能メニューボタンが見つかりません');
                }
                
                // メニューを開く
                await CLAUDE_UTILS.performClick(functionButton);
                await CLAUDE_UTILS.wait(CLAUDE_CONFIG.DELAYS.menuOpen);
                
                // 目的の機能を探す
                const functionOption = await CLAUDE_UTILS.findElement([
                    'div[role="menuitemcheckbox"]',
                    'button[role="menuitemcheckbox"]',
                    '[data-testid*="function-option"]'
                ], (el) => el.textContent && el.textContent.includes(normalizedFunction));
                
                if (!functionOption) {
                    // メニューを閉じる
                    document.body.click();
                    throw new Error('機能 ' + normalizedFunction + ' が見つかりません');
                }
                
                // 現在の状態を確認
                const isChecked = functionOption.getAttribute('aria-checked') === 'true';
                
                // 必要に応じて切り替え
                if (isChecked !== enable) {
                    await CLAUDE_UTILS.performClick(functionOption);
                    await CLAUDE_UTILS.wait(500);
                    
                    if (enable) {
                        CLAUDE_CONFIG.globalState.activeFunctions.add(normalizedFunction);
                    } else {
                        CLAUDE_CONFIG.globalState.activeFunctions.delete(normalizedFunction);
                    }
                }
                
                // メニューを閉じる
                document.body.click();
                await CLAUDE_UTILS.wait(CLAUDE_CONFIG.DELAYS.menuClose);
                
                CLAUDE_CONFIG.globalState.functionCacheTime = now;
                CLAUDE_UTILS.log('機能 ' + normalizedFunction + ' を' + (enable ? '有効' : '無効') + 'にしました', 'SUCCESS');
                return { success: true, function: normalizedFunction, enabled: enable };
                
            } catch (error) {
                CLAUDE_UTILS.log('機能切り替えエラー: ' + error.message, 'ERROR');
                return { success: false, error: error.message };
            }
        },
        
        // テキスト入力
        inputText: async function(text) {
            try {
                const inputField = await CLAUDE_UTILS.findElement([
                    'div[contenteditable="true"]',
                    'textarea[placeholder*="メッセージ"]',
                    '[data-testid="message-input"]'
                ]);
                
                if (!inputField) {
                    throw new Error('入力フィールドが見つかりません');
                }
                
                // テキストを設定
                if (inputField.tagName === 'TEXTAREA') {
                    inputField.value = text;
                    inputField.dispatchEvent(new Event('input', { bubbles: true }));
                } else {
                    inputField.textContent = text;
                    inputField.dispatchEvent(new Event('input', { bubbles: true }));
                }
                
                await CLAUDE_UTILS.wait(500);
                CLAUDE_UTILS.log('テキストを入力しました', 'SUCCESS');
                return { success: true };
                
            } catch (error) {
                CLAUDE_UTILS.log('テキスト入力エラー: ' + error.message, 'ERROR');
                return { success: false, error: error.message };
            }
        },
        
        // 送信
        sendMessage: async function() {
            try {
                const sendButton = await CLAUDE_UTILS.findElement([
                    'button[aria-label="Send Message"]',
                    'button[data-testid="send-button"]',
                    'button[type="submit"]'
                ], (el) => !el.disabled);
                
                if (!sendButton) {
                    throw new Error('送信ボタンが見つかりません');
                }
                
                await CLAUDE_UTILS.performClick(sendButton);
                await CLAUDE_UTILS.wait(CLAUDE_CONFIG.DELAYS.submit);
                
                CLAUDE_CONFIG.globalState.hasAutoReplied = false;
                CLAUDE_UTILS.log('メッセージを送信しました', 'SUCCESS');
                return { success: true };
                
            } catch (error) {
                CLAUDE_UTILS.log('送信エラー: ' + error.message, 'ERROR');
                return { success: false, error: error.message };
            }
        },
        
        // 応答待機
        waitForResponse: async function(maxWaitMinutes = 5) {
            try {
                const maxWaitMs = maxWaitMinutes * 60 * 1000;
                const startTime = Date.now();
                
                // DeepResearchモードの場合は待機時間を延長
                const actualMaxWait = CLAUDE_CONFIG.globalState.deepResearchMode ? 
                    CLAUDE_CONFIG.globalState.deepResearch.maxWaitMinutes * 60 * 1000 : maxWaitMs;
                
                CLAUDE_UTILS.log('応答を待機中... (最大' + (actualMaxWait / 60000) + '分)', 'INFO');
                
                while (Date.now() - startTime < actualMaxWait) {
                    // 送信ボタンが有効になっているか確認
                    const sendButton = await CLAUDE_UTILS.findElement([
                        'button[aria-label="Send Message"]',
                        'button[data-testid="send-button"]'
                    ], null, 1000);
                    
                    if (sendButton && !sendButton.disabled) {
                        CLAUDE_UTILS.log('応答を受信しました', 'SUCCESS');
                        return { success: true };
                    }
                    
                    // ローディングインジケータが消えているか確認
                    const loadingIndicator = document.querySelector('[data-testid="loading-indicator"]');
                    if (!loadingIndicator) {
                        await CLAUDE_UTILS.wait(2000); // 少し待ってから再確認
                        const sendButtonCheck = await CLAUDE_UTILS.findElement([
                            'button[aria-label="Send Message"]',
                            'button[data-testid="send-button"]'
                        ], null, 1000);
                        
                        if (sendButtonCheck && !sendButtonCheck.disabled) {
                            CLAUDE_UTILS.log('応答を受信しました', 'SUCCESS');
                            return { success: true };
                        }
                    }
                    
                    await CLAUDE_UTILS.wait(CLAUDE_CONFIG.DELAYS.responseCheck);
                    
                    // 進捗表示
                    const elapsedMinutes = Math.floor((Date.now() - startTime) / 60000);
                    if (elapsedMinutes > 0 && elapsedMinutes % 5 === 0) {
                        CLAUDE_UTILS.log('待機中... (' + elapsedMinutes + '分経過)', 'INFO');
                    }
                }
                
                throw new Error('応答待機タイムアウト');
                
            } catch (error) {
                CLAUDE_UTILS.log('応答待機エラー: ' + error.message, 'ERROR');
                return { success: false, error: error.message };
            }
        },
        
        // 応答テキスト取得
        getResponse: async function() {
            try {
                let responseText = '';
                
                // Canvas/アーティファクトの確認
                const artifactContainer = await CLAUDE_UTILS.findElement([
                    '[data-testid="artifact-container"]',
                    '[class*="artifact"]',
                    'div[class*="canvas"]'
                ], null, 1000);
                
                if (artifactContainer) {
                    // Canvas内のコンテンツを取得
                    const codeBlocks = artifactContainer.querySelectorAll('pre, code');
                    if (codeBlocks.length > 0) {
                        responseText = Array.from(codeBlocks)
                            .map(block => block.textContent)
                            .join('\n\n');
                        CLAUDE_UTILS.log('Canvasからコンテンツを取得しました', 'SUCCESS');
                    }
                }
                
                // 通常の応答を取得
                if (!responseText) {
                    const messageContainers = document.querySelectorAll('[data-testid*="message"], [class*="message-content"]');
                    if (messageContainers.length > 0) {
                        const lastMessage = messageContainers[messageContainers.length - 1];
                        responseText = lastMessage.textContent || '';
                        CLAUDE_UTILS.log('通常の応答を取得しました', 'SUCCESS');
                    }
                }
                
                if (!responseText) {
                    throw new Error('応答テキストが見つかりません');
                }
                
                return { success: true, text: responseText.trim() };
                
            } catch (error) {
                CLAUDE_UTILS.log('応答取得エラー: ' + error.message, 'ERROR');
                return { success: false, error: error.message };
            }
        }
    };
    
    // スプレッドシート統合メイン関数
    window.CLAUDE_SPREADSHEET_INTEGRATION = {
        processSpreadsheetData: async function(model, functions, text, options = {}) {
            const result = {
                success: false,
                model: null,
                functions: [],
                responseText: null,
                errors: [],
                executionTime: 0
            };
            
            const startTime = Date.now();
            
            try {
                // オプション設定
                const {
                    maxRetries = 3,
                    waitForResponse = true,
                    responseWaitMinutes = 5,
                    disableAllFunctionsFirst = false
                } = options;
                
                CLAUDE_UTILS.log('=== スプレッドシート統合処理開始 ===', 'INFO');
                
                // 1. モデルの切り替え
                CLAUDE_UTILS.log('ステップ1: モデル切り替え', 'INFO');
                let modelResult = null;
                for (let retry = 0; retry < maxRetries; retry++) {
                    modelResult = await CLAUDE_OPERATIONS.changeModel(model);
                    if (modelResult.success) {
                        result.model = modelResult.model;
                        break;
                    }
                    if (retry < maxRetries - 1) {
                        CLAUDE_UTILS.log('リトライ中... (' + (retry + 1) + '/' + maxRetries + ')', 'WARNING');
                        await CLAUDE_UTILS.wait(2000);
                    }
                }
                
                if (!modelResult || !modelResult.success) {
                    result.errors.push('モデル切り替え失敗: ' + (modelResult ? modelResult.error : '不明なエラー'));
                    throw new Error('モデル切り替えに失敗しました');
                }
                
                // 2. 全機能を一旦無効化（オプション）
                if (disableAllFunctionsFirst) {
                    CLAUDE_UTILS.log('全機能を無効化中...', 'INFO');
                    const allFunctions = Object.values(CLAUDE_CONFIG.FUNCTION_ALIASES);
                    const uniqueFunctions = [...new Set(allFunctions)];
                    
                    for (const func of uniqueFunctions) {
                        if (CLAUDE_CONFIG.TOGGLE_FUNCTIONS.includes(func)) {
                            await CLAUDE_OPERATIONS.toggleFunction(func, false);
                            await CLAUDE_UTILS.wait(500);
                        }
                    }
                }
                
                // 3. 機能の有効化
                if (functions && functions.length > 0) {
                    CLAUDE_UTILS.log('ステップ2: 機能の有効化', 'INFO');
                    for (const func of functions) {
                        const funcResult = await CLAUDE_OPERATIONS.toggleFunction(func, true);
                        if (funcResult.success) {
                            result.functions.push(funcResult.function);
                        } else {
                            result.errors.push('機能有効化失敗 (' + func + '): ' + funcResult.error);
                        }
                        await CLAUDE_UTILS.wait(500); // 各機能切り替え間に待機
                    }
                }
                
                // 4. テキスト入力
                CLAUDE_UTILS.log('ステップ3: テキスト入力', 'INFO');
                const inputResult = await CLAUDE_OPERATIONS.inputText(text);
                if (!inputResult.success) {
                    result.errors.push('テキスト入力失敗: ' + inputResult.error);
                    throw new Error('テキスト入力に失敗しました');
                }
                
                // 5. 送信
                CLAUDE_UTILS.log('ステップ4: メッセージ送信', 'INFO');
                const sendResult = await CLAUDE_OPERATIONS.sendMessage();
                if (!sendResult.success) {
                    result.errors.push('送信失敗: ' + sendResult.error);
                    throw new Error('送信に失敗しました');
                }
                
                // 6. 応答待機（オプション）
                if (waitForResponse) {
                    CLAUDE_UTILS.log('ステップ5: 応答待機', 'INFO');
                    const waitResult = await CLAUDE_OPERATIONS.waitForResponse(responseWaitMinutes);
                    if (!waitResult.success) {
                        result.errors.push('応答待機タイムアウト: ' + waitResult.error);
                    } else {
                        // 7. 応答取得
                        CLAUDE_UTILS.log('ステップ6: 応答取得', 'INFO');
                        const responseResult = await CLAUDE_OPERATIONS.getResponse();
                        if (responseResult.success) {
                            result.responseText = responseResult.text;
                        } else {
                            result.errors.push('応答取得失敗: ' + responseResult.error);
                        }
                    }
                }
                
                result.success = result.errors.length === 0;
                result.executionTime = Date.now() - startTime;
                
                CLAUDE_UTILS.log('=== 処理完了 (実行時間: ' + (result.executionTime / 1000) + '秒) ===', 
                               result.success ? 'SUCCESS' : 'WARNING');
                
            } catch (error) {
                result.errors.push('予期しないエラー: ' + error.message);
                result.executionTime = Date.now() - startTime;
                CLAUDE_UTILS.log('=== 処理失敗 ===', 'ERROR');
            }
            
            return result;
        },
        
        processBatch: async function(dataArray, options = {}) {
            const results = [];
            const { 
                delayBetweenRequests = 5000,
                continueOnError = true 
            } = options;
            
            CLAUDE_UTILS.log('バッチ処理開始: ' + dataArray.length + '件', 'INFO');
            
            for (let i = 0; i < dataArray.length; i++) {
                const data = dataArray[i];
                CLAUDE_UTILS.log('処理中: ' + (i + 1) + '/' + dataArray.length, 'INFO');
                
                const result = await this.processSpreadsheetData(
                    data.model,
                    data.functions,
                    data.text,
                    options
                );
                
                results.push({
                    index: i,
                    input: data,
                    output: result
                });
                
                if (!result.success && !continueOnError) {
                    CLAUDE_UTILS.log('エラーによりバッチ処理を中止', 'ERROR');
                    break;
                }
                
                if (i < dataArray.length - 1) {
                    CLAUDE_UTILS.log('次の処理まで待機中...', 'INFO');
                    await CLAUDE_UTILS.wait(delayBetweenRequests);
                }
            }
            
            CLAUDE_UTILS.log('バッチ処理完了', 'SUCCESS');
            return results;
        }
    };
    
    // グローバルに公開
    window.claudeIntegration = CLAUDE_SPREADSHEET_INTEGRATION;
    
    // 拡張機能のメッセージリスナー
    if (isExtension) {
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            // 非同期処理のためにtrueを返す
            (async () => {
                try {
                    switch (request.type) {
                        case 'PROCESS_DATA':
                            const result = await claudeIntegration.processSpreadsheetData(
                                request.model,
                                request.functions,
                                request.text,
                                request.options
                            );
                            sendResponse({ success: true, data: result });
                            break;
                            
                        case 'PROCESS_BATCH':
                            const batchResult = await claudeIntegration.processBatch(
                                request.dataArray,
                                request.options
                            );
                            sendResponse({ success: true, data: batchResult });
                            break;
                            
                        case 'GET_STATUS':
                            sendResponse({ 
                                success: true, 
                                status: {
                                    currentModel: CLAUDE_CONFIG.globalState.currentModel,
                                    activeFunctions: Array.from(CLAUDE_CONFIG.globalState.activeFunctions),
                                    deepResearchMode: CLAUDE_CONFIG.globalState.deepResearchMode
                                }
                            });
                            break;
                            
                        case 'SET_DEBUG':
                            CLAUDE_CONFIG.globalState.debugMode = request.enabled;
                            sendResponse({ success: true });
                            break;
                            
                        default:
                            sendResponse({ success: false, error: 'Unknown request type' });
                    }
                } catch (error) {
                    sendResponse({ success: false, error: error.message });
                }
            })();
            
            return true; // 非同期応答のため
        });
    }
    
    console.log('✅ Claude統合機能（拡張機能対応版）が準備完了しました');
})();