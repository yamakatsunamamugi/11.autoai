/**
 * @fileoverview Gemini Automation V3 - 統合版
 *
 * 【ステップ構成】
 * ステップ0: 初期化（UI_SELECTORS読み込み）
 * ステップ1: ページ準備状態チェック
 * ステップ2: テキスト入力
 * ステップ3: モデル選択（条件付き）
 * ステップ4: 機能選択（条件付き）
 * ステップ5: メッセージ送信
 * ステップ6: 応答待機（通常/Canvasモード）
 * ステップ7: テキスト取得
 *
 * @version 3.0.0
 * @updated 2024-12-14 ステップ番号体系統一、コード整理
 */

(async function() {
    'use strict';

    console.log(`🚀 Gemini Automation V3 初期化`);

    // 統一された待機時間設定を取得（Claude/ChatGPTと同じ方式）
    const AI_WAIT_CONFIG = window.AI_WAIT_CONFIG || {
        DEEP_RESEARCH_WAIT: 2400000, // 40分（Geminiでは未使用）
        NORMAL_WAIT: 300000,         // 5分
        STOP_BUTTON_WAIT: 30000,     // 30秒
        CHECK_INTERVAL: 2000,        // 2秒
        MICRO_WAIT: 100,            // 100ms
        TINY_WAIT: 500,             // 500ms
        SHORT_WAIT: 1000,           // 1秒
        MEDIUM_WAIT: 2000,          // 2秒
        LONG_WAIT: 3000             // 3秒
    };

    // ========================================
    // ステップ0: UI_SELECTORSをJSONから読み込み（Claude/ChatGPT方式）
    // ========================================
    let UI_SELECTORS = window.UI_SELECTORS || {};
    let selectorsLoaded = false;

    const loadSelectors = async () => {
        if (selectorsLoaded) return UI_SELECTORS;

        try {
            const response = await fetch(chrome.runtime.getURL('ui-selectors-data.json'));
            const data = await response.json();
            UI_SELECTORS = data.selectors;
            window.UI_SELECTORS = UI_SELECTORS;
            selectorsLoaded = true;
            log('✅ UI Selectors loaded from JSON', 'success');
            return UI_SELECTORS;
        } catch (error) {
            log('❌ Failed to load ui-selectors-data.json: ' + error.message, 'error');
            // フォールバックとしてwindow.UI_SELECTORSを使用
            UI_SELECTORS = window.UI_SELECTORS || {};
            selectorsLoaded = true;
            return UI_SELECTORS;
        }
    };

    // セレクタを読み込み
    await loadSelectors();

    // Gemini用セレクタを取得
    const SELECTORS = {
        textInput: UI_SELECTORS.Gemini?.INPUT || [],
        sendButton: UI_SELECTORS.Gemini?.SEND_BUTTON || [],
        stopButton: UI_SELECTORS.Gemini?.STOP_BUTTON || [],
        modelMenu: UI_SELECTORS.Gemini?.MODEL_MENU || [],
        functionMenu: UI_SELECTORS.Gemini?.FUNCTION_MENU || [],
        response: UI_SELECTORS.Gemini?.RESPONSE || [],
        canvas: UI_SELECTORS.Gemini?.CANVAS || []
    };
    
    // ========================================
    // ユーティリティ関数
    // ========================================
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
    
    // Canvas形式の構造化されたテキストを取得
    const getStructuredCanvasContent = (element) => {
        if (!element) return '';
        
        try {
            let result = [];
            
            const processNode = (node, depth = 0) => {
                if (node.nodeType === Node.TEXT_NODE) {
                    const text = node.textContent.trim();
                    if (text) {
                        result.push(text);
                    }
                } else if (node.nodeType === Node.ELEMENT_NODE) {
                    const tagName = node.tagName.toLowerCase();
                    
                    // 見出し処理
                    if (tagName.match(/^h[1-4]$/)) {
                        const level = parseInt(tagName.charAt(1));
                        const prefix = '#'.repeat(level);
                        const text = node.textContent.trim();
                        if (text) {
                            result.push('\n' + prefix + ' ' + text + '\n');
                        }
                    }
                    // リスト処理
                    else if (tagName === 'ul' || tagName === 'ol') {
                        result.push('\n');
                        const items = node.querySelectorAll('li');
                        items.forEach((item, index) => {
                            const prefix = tagName === 'ol' ? `${index + 1}. ` : '• ';
                            const text = item.textContent.trim();
                            if (text) {
                                result.push(prefix + text);
                            }
                        });
                        result.push('\n');
                    }
                    // 段落処理
                    else if (tagName === 'p') {
                        const text = node.textContent.trim();
                        if (text) {
                            result.push('\n' + text + '\n');
                        }
                    }
                    // 強調処理
                    else if (tagName === 'strong' || tagName === 'b') {
                        const text = node.textContent.trim();
                        if (text) {
                            result.push('**' + text + '**');
                        }
                    }
                    // イタリック処理
                    else if (tagName === 'em' || tagName === 'i') {
                        const text = node.textContent.trim();
                        if (text) {
                            result.push('*' + text + '*');
                        }
                    }
                    // その他の要素は子要素を処理
                    else if (!['script', 'style', 'li'].includes(tagName)) {
                        for (const child of node.childNodes) {
                            processNode(child, depth + 1);
                        }
                    }
                }
            };
            
            // ルート要素から処理開始
            for (const child of element.childNodes) {
                processNode(child);
            }
            
            // 結果を結合して返す
            const structuredText = result.join(' ').replace(/\s+/g, ' ').replace(/\n\s+/g, '\n').trim();
            
            // 構造化テキストが取得できない場合は通常のテキストを返す
            return structuredText || element.textContent?.trim() || '';
            
        } catch (error) {
            log(`⚠️ Canvas構造化テキスト取得エラー: ${error.message}`, 'warn');
            // エラー時はフォールバック
            return element.textContent?.trim() || '';
        }
    };
    
    // ========================================
    // ステップ1-1: モデルと機能の探索
    // ========================================
    async function discoverModelsAndFeatures() {
        log('【ステップ1-1】モデルと機能の探索', 'step');
        
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
                await wait(1500);  // メニュー表示の待機時間を増やす
                
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
        // ========================================
        // ステップ1: ページ初期化チェック
        // ========================================
        log('【ステップ1】ページ初期化チェック', 'step');

        // ページ初期読み込み待機（ネット環境を考慮）
        log('ページ初期読み込み待機中...', 'info');
        await wait(3000);  // 3秒待機

        // 基本要素の存在確認
        const criticalElements = {
            'テキスト入力欄': SELECTORS.textInput,
            '送信ボタン': SELECTORS.sendButton
        };

        for (const [name, selectors] of Object.entries(criticalElements)) {
            const element = findElement(selectors);
            if (!element) {
                log(`⚠️ ${name}が見つかりません`, 'warn');
            } else {
                log(`✅ ${name}を確認`, 'success');
            }
        }

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
                            await wait(2500);  // モデル選択後の待機時間を増やす
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
            
            // ========================================
            // ステップ2: テキスト入力
            // ========================================
            await logStep('【ステップ2】テキスト入力', async () => {
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
            
            // ========================================
            // ステップ3: メッセージ送信（再試行対応）
            // ========================================
            await logStep('【ステップ3】メッセージ送信（再試行対応）', async () => {
                // 送信ボタンを5回まで再試行
                let sendSuccess = false;
                let sendAttempts = 0;
                const maxSendAttempts = 5;
                
                while (!sendSuccess && sendAttempts < maxSendAttempts) {
                    sendAttempts++;
                    log(`【ステップ3-${sendAttempts}】送信試行 ${sendAttempts}/${maxSendAttempts}`, 'step');
                    
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
            
            // ========================================
            // ステップ4: 応答待機
            // ========================================
            const responseText = await logStep('【ステップ4】応答待機', () => new Promise(async (resolve, reject) => {
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
                        logDr('【ステップ4-1】初期応答の開始を待機中...');
                        while (!findElement(['button.send-button.stop'])) {
                            if (Date.now() - startTime > 30000) {
                                throw new Error('30秒以内に初期応答が開始されませんでした。');
                            }
                            await wait(1000);
                        }
                        logDr('【ステップ4-1完了】初期応答が開始されました。', 'success');
                        
                        // ステップ2: 初期応答が完了して「リサーチを開始」ボタンが出現するまで待機
                        logDr('【ステップ4-2】初期応答の完了を待機中...');
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
                        logDr('【ステップ4-2完了】「リサーチを開始」ボタンをクリックしました。', 'success');
                        await wait(2000);
                        
                        // ステップ3: 本応答の完了を待つ
                        logDr('【ステップ4-3】本応答の完了を待機中...');
                        
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
                                logDr('【ステップ4-3完了】Deep Researchの応答が完了しました。', 'success');
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
            
            // ========================================
            // ステップ5: テキスト取得（ui-selectorsを使用）
            // ========================================
            await logStep('【ステップ5】テキスト取得', async () => {
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
            
            // 現在表示されているモデルと機能を取得（選択後確認）
            let displayedModel = '';
            let displayedFunction = '';

            try {
                // ModelInfoExtractorを使用
                if (window.ModelInfoExtractor) {
                    displayedModel = window.ModelInfoExtractor.extract('Gemini') || '';
                    log(`📊 選択後確認 - 実際のモデル: "${displayedModel}"`, 'info');
                } else {
                    log('⚠️ ModelInfoExtractorが利用できません', 'warn');
                }

                // FunctionInfoExtractorを使用
                if (window.FunctionInfoExtractor) {
                    displayedFunction = window.FunctionInfoExtractor.extract('Gemini') || '';
                    log(`📊 選択後確認 - 実際の機能: "${displayedFunction}"`, 'info');
                } else {
                    log('⚠️ FunctionInfoExtractorが利用できません', 'warn');
                }
            } catch (error) {
                log(`⚠️ モデル/機能情報取得エラー: ${error.message}`, 'warn');
            }

            // 最終的な成功レスポンス
            return {
                success: true,
                response: testResults[testResults.length - 1]?.details || '',
                testResults: testResults,
                displayedModel: displayedModel,
                displayedFunction: displayedFunction
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
    
    // デバッグ: グローバル公開の確認
    if (typeof window.GeminiAutomation !== 'undefined') {
        console.log('✅ window.GeminiAutomation が正常に公開されました');
        console.log('利用可能なメソッド:', Object.keys(window.GeminiAutomation));
    } else {
        console.error('❌ window.GeminiAutomation の公開に失敗しました');
    }
    
})();