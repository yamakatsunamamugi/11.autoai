/**
 * @fileoverview Gemini Automation V3 - 統合版
 *
 * 【Gemini-ステップ構成】
 * ステップ0: 初期化（UI_SELECTORS読み込み）
 * ステップ1: ページ準備状態チェック
 * ステップ2: テキスト入力
 * ステップ3: モデル選択（条件付き） + 選択後確認
 * ステップ4: 機能選択（条件付き） + 選択後確認
 * ステップ5: メッセージ送信
 * ステップ6: 応答待機（通常/Canvas/Deep Researchモード）
 * ステップ7: テキスト取得
 *
 * @version 3.0.0
 * @updated 2024-12-14 ステップ番号体系統一、コード整理
 */

(async function() {
    'use strict';

    console.log(`🚀 Gemini Automation V3 初期化`);

    // 初期化マーカー設定
    window.GEMINI_SCRIPT_LOADED = true;
    window.GEMINI_SCRIPT_INIT_TIME = Date.now();

    // ========================================
    // ログ管理システムの初期化
    // ========================================
    const GeminiLogManager = {
        logs: [],
        taskStartTime: null,
        currentTaskData: null,

        addLog(entry) {
            this.logs.push({
                timestamp: new Date().toISOString(),
                ...entry
            });
        },

        logStep(step, message, data = {}) {
            this.addLog({
                type: 'step',
                step,
                message,
                data
            });
            console.log(`📝 [ログ] ${step}: ${message}`);
        },

        logError(step, error, context = {}) {
            this.addLog({
                type: 'error',
                step,
                error: {
                    message: error.message,
                    stack: error.stack
                },
                context
            });
            console.error(`❌ [エラーログ] ${step}:`, error);
        },

        startTask(taskData) {
            this.taskStartTime = Date.now();
            this.currentTaskData = taskData;
            this.addLog({
                type: 'task_start',
                taskData: {
                    model: taskData.model,
                    function: taskData.function,
                    promptLength: taskData.prompt?.length || taskData.text?.length || 0,
                    cellInfo: taskData.cellInfo
                }
            });
        },

        completeTask(result) {
            const duration = this.taskStartTime ? Date.now() - this.taskStartTime : 0;
            this.addLog({
                type: 'task_complete',
                duration,
                result: {
                    success: result.success,
                    responseLength: result.response?.length || 0,
                    error: result.error
                }
            });
        },

        async saveToFile() {
            if (this.logs.length === 0) {
                console.log('[GeminiLogManager] 保存するログがありません');
                return;
            }

            try {
                const timestamp = new Date().toISOString()
                    .replace(/[:.]/g, '-')
                    .replace('T', '_')
                    .slice(0, -5);

                const fileName = `gemini-log-${timestamp}.json`;
                const logData = {
                    sessionStart: this.logs[0]?.timestamp,
                    sessionEnd: new Date().toISOString(),
                    totalLogs: this.logs.length,
                    taskData: this.currentTaskData,
                    logs: this.logs
                };

                const key = `gemini_logs_log/1.Geminireport/${fileName}`;
                localStorage.setItem(key, JSON.stringify(logData));
                this.rotateLogs();

                console.log(`✅ [GeminiLogManager] ログを保存しました: ${fileName}`);
                return fileName;
            } catch (error) {
                console.error('[GeminiLogManager] ログ保存エラー:', error);
            }
        },

        rotateLogs() {
            const logKeys = [];
            const prefix = 'gemini_logs_log/1.Geminireport/';

            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith(prefix)) {
                    logKeys.push(key);
                }
            }

            logKeys.sort().reverse();

            if (logKeys.length > 10) {
                const keysToDelete = logKeys.slice(10);
                keysToDelete.forEach(key => {
                    localStorage.removeItem(key);
                    console.log(`🗑️ [GeminiLogManager] 古いログを削除: ${key}`);
                });
            }
        },

        clear() {
            this.logs = [];
            this.taskStartTime = null;
            this.currentTaskData = null;
        }
    };

    // RetryManagerは使用しない（独自実装を使用）
    const retryManager = null;

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
            log('【Gemini-ステップ0-1】✅ UI Selectors loaded from JSON', 'success');
            return UI_SELECTORS;
        } catch (error) {
            log('【Gemini-ステップ0-2】❌ Failed to load ui-selectors-data.json: ' + error.message, 'error');
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

    // 要素の可視性チェック
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

    // ========================================
    // ステップ0: ページ準備確認
    // ========================================
    const waitForPageReady = async () => {
        log('\n【Gemini-ステップ0】ページ準備確認', 'step');
        const maxAttempts = 30; // 最大30秒待機
        let attempts = 0;

        while (attempts < maxAttempts) {
            attempts++;
            log(`[ステップ0] 準備確認 (${attempts}/${maxAttempts})`, 'info');

            // テキスト入力欄の存在をチェック
            const inputElement = findElement(SELECTORS.textInput);

            if (inputElement && isElementInteractable(inputElement)) {
                log('✅ [ステップ0] ページ準備完了', 'success');
                return true;
            }

            await wait(1000);
        }

        log('❌ [ステップ0] ページ準備タイムアウト', 'error');
        throw new Error('ページが準備できませんでした');
    };

    // ========================================
    // ステップ0-1: 要素取得リトライ機能
    // ========================================
    const getElementWithWait = async (selectors, description = '', timeout = 10000) => {
        log(`[ステップ0-1] ${description}を取得中...`, 'info');
        const startTime = Date.now();
        let attempts = 0;

        while (Date.now() - startTime < timeout) {
            attempts++;
            const element = findElement(selectors);

            if (element && isElementInteractable(element)) {
                log(`✅ [ステップ0-1] ${description}取得成功 (試行${attempts}回)`, 'success');
                return element;
            }

            if (attempts % 5 === 0) {
                log(`[ステップ0-1] ${description}を探索中... (${Math.floor((Date.now() - startTime) / 1000)}秒経過)`, 'info');
            }

            await wait(500);
        }

        log(`❌ [ステップ0-1] ${description}取得タイムアウト`, 'error');
        return null;
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
        log('【Gemini-ステップ1-1】モデルと機能の探索', 'step');
        
        // モデル探索
        try {
            const menuButton = findElement([
                '.gds-mode-switch-button.logo-pill-btn',
                'button[class*="logo-pill-btn"]',
                'button.gds-mode-switch-button',
                'button.logo-pill-btn'
            ]);
            
            if (menuButton) {
                await openGeminiModelMenu(menuButton);
                
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
                    
                    log(`【Gemini-ステップ1-1】モデル探索完了: ${window.availableModels.length}個のモデルを発見`, 'success');
                }
            }
        } catch (e) {
            log('【Gemini-ステップ1-1】モデル探索エラー: ' + e.message, 'error');
        } finally {
            // メニューを閉じる
            await closeGeminiMenu();
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
            log('【Gemini-ステップ1-2】機能探索完了: ${window.availableFeatures.length}個の機能を発見', 'success');
            
        } catch (e) {
            log('【Gemini-ステップ1-2】機能探索エラー: ' + e.message, 'error');
        } finally {
            // メニューを閉じる
            await closeGeminiMenu();
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
        // ステップ0: ページ準備確認
        // ========================================
        await waitForPageReady();

        // ========================================
        // ステップ1: ページ初期化チェック
        // ========================================
        log('【Gemini-ステップ1】ページ初期化チェック', 'step');

        // 基本要素の存在確認
        const criticalElements = {
            'テキスト入力欄': SELECTORS.textInput,
            '送信ボタン': SELECTORS.sendButton
        };

        for (const [name, selectors] of Object.entries(criticalElements)) {
            const element = findElement(selectors);
            if (!element) {
                log(`【Gemini-ステップ1-0】⚠️ ${name}が見つかりません`, 'warn');
            } else {
                log(`【Gemini-ステップ1-0】✅ ${name}を確認`, 'success');
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
            // ========================================
            // ステップ3: モデル選択（条件付き）
            // ========================================
            await logStep('【Gemini-ステップ3】モデル選択', async () => {
                log(`【Gemini-ステップ3-1】選択するモデル: '${modelName}'`, 'info');
                
                // モデルを選択（常に実行、Autoでもデフォルトモデルを明示的に選択）
                const useDefault = !modelName || modelName === 'default' || 
                                  (typeof modelName === 'string' && modelName.toLowerCase() === 'auto');
                
                if (useDefault) {
                    log('【Gemini-ステップ1-2】デフォルトモデル（Gemini）を使用', 'info');
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

                            // モデル選択確認（テストコードの検証ロジックを追加）
                            const currentModelDisplay = findElement([
                                '.logo-pill-label-container',
                                '.gds-mode-switch-button .mdc-button__label div',
                                '.gds-mode-switch-button .logo-pill-label'
                            ]);

                            if (currentModelDisplay) {
                                const displayText = getCleanText(currentModelDisplay);
                                // "2.5 Pro" -> "Pro" のような部分一致にも対応
                                const normalizedModelName = modelName.replace('2.5 ', '');

                                if (displayText.includes(normalizedModelName)) {
                                    log(`【Gemini-ステップ1-3】✅ モデル選択確認成功: 「${displayText}」が選択されています`, 'success');
                                } else {
                                    log(`【Gemini-ステップ1-3】⚠️ モデル表示が期待値と異なります。期待値: ${modelName}, 実際: ${displayText}`, 'warn');
                                }
                            }
                        } else {
                            log(`【Gemini-ステップ1-3】モデル "${modelName}" が見つからないため、デフォルトを使用`, 'warn');
                        }
                    }
                }

                return `モデル選択完了: ${modelName || 'デフォルト'}`;
            });

            // ========================================
            // ステップ4: 機能選択（条件付き）
            // ========================================
            await logStep('【Gemini-ステップ4】機能選択', async () => {
                log(`【Gemini-ステップ4-1】選択する機能: '${featureName || '設定なし'}'`, 'info');

                // 機能を選択（null/undefined/'none'/'通常'以外の場合）
                if (featureName && featureName !== 'none' && featureName !== '通常') {
                    let featureButton = null;
                    
                    // 1. まずメインの機能ボタンから探す（テストコードと同じロジック）
                    const allButtons = findElements(['toolbox-drawer-item > button']);
                    log(`【Gemini-ステップ1-4】🔍 メインボタン数: ${allButtons.length}`, 'info');
                    
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
                        log(`【Gemini-ステップ1-5】✅ 機能「${featureName}」を選択しました`, 'success');

                        // 機能選択確認（テストコードの検証ロジックを追加）
                        const selectedButton = findElement([
                            '.toolbox-drawer-item-button button.is-selected',
                            '.toolbox-drawer-button.has-selected-item'
                        ]);

                        if (selectedButton) {
                            const selectedLabel = findElement(['.label'], selectedButton);
                            const selectedText = selectedLabel ? getCleanText(selectedLabel) : '';

                            if (selectedText.toLowerCase() === featureName.toLowerCase() ||
                                selectedText.toLowerCase().includes(featureName.toLowerCase())) {
                                log(`【Gemini-ステップ1-5】✅ 機能選択確認成功: 「${selectedText}」が有効化されています`, 'success');
                            } else {
                                log(`【Gemini-ステップ1-5】⚠️ 機能選択確認: 期待された機能「${featureName}」と異なる機能「${selectedText}」が選択されています`, 'warn');
                            }
                        } else {
                            log(`【Gemini-ステップ1-5】⚠️ 機能の選択状態が確認できません`, 'warn');
                        }
                    } else {
                        log(`【Gemini-ステップ1-5】機能 "${featureName}" が見つからないため、スキップ`, 'warn');
                    }
                }

                // オーバーレイを閉じる
                const overlay = document.querySelector('.cdk-overlay-backdrop.cdk-overlay-backdrop-showing');
                if (overlay) overlay.click();

                return `機能選択完了: ${featureName || '設定なし'}`;
            });
            
            // ========================================
            // ステップ2: テキスト入力
            // ========================================
            await logStep('【Gemini-ステップ2】テキスト入力', async () => {
                const editor = await getElementWithWait(['.ql-editor'], 'テキスト入力欄', 10000);
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
            await logStep('【Gemini-ステップ3】メッセージ送信（再試行対応）', async () => {
                // 送信ボタンを5回まで再試行
                let sendSuccess = false;
                let sendAttempts = 0;
                const maxSendAttempts = 5;
                
                while (!sendSuccess && sendAttempts < maxSendAttempts) {
                    sendAttempts++;
                    log(`【Gemini-ステップ3-${sendAttempts}】送信試行 ${sendAttempts}/${maxSendAttempts}`, 'step');
                    
                    const sendButton = findElement([
                        'button.send-button.submit:not(.stop)',
                        'button[aria-label="プロンプトを送信"]:not(.stop)'
                    ]);
                    
                    if (!sendButton) {
                        if (sendAttempts === maxSendAttempts) {
                            throw new Error('送信ボタンが見つからないか、送信不可能な状態です');
                        }
                        log(`【Gemini-ステップ3-${sendAttempts}】送信ボタンが見つかりません。2秒後に再試行...`, 'warning');
                        await wait(2000);
                        continue;
                    }
                    
                    sendButton.click();
                    log(`【Gemini-ステップ3-${sendAttempts}】送信ボタンをクリックしました（試行${sendAttempts}）`, 'success');
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
                            log(`【Gemini-ステップ3-${sendAttempts}】停止ボタンが表示されました - 送信成功`, 'success');
                            break;
                        }
                        await sleep(1000);
                    }
                    
                    if (stopButtonAppeared) {
                        sendSuccess = true;
                        break;
                    } else {
                        log(`【Gemini-ステップ3-${sendAttempts}】送信反応が確認できません。再試行します...`, 'warning');
                        await wait(2000);
                    }
                }
                
                if (!sendSuccess) {
                    throw new Error(`${maxSendAttempts}回試行しても送信が成功しませんでした`);
                }
                
                // 送信時刻を記録（SpreadsheetLogger用）
                log(`【Gemini-ステップ3-記録】🔍 送信時刻記録開始 - AIHandler: ${!!window.AIHandler}, recordSendTimestamp: ${!!window.AIHandler?.recordSendTimestamp}, currentAITaskInfo: ${!!window.currentAITaskInfo}`, 'info');
                if (window.AIHandler && window.AIHandler.recordSendTimestamp) {
                    try {
                        log(`【Gemini-ステップ3-記録】📝 送信時刻記録実行開始 - タスクID: ${window.currentAITaskInfo?.taskId}`, 'info');
                        await window.AIHandler.recordSendTimestamp('Gemini');
                        log(`【Gemini-ステップ3-記録】✅ 送信時刻記録成功`, 'success');
                    } catch (error) {
                        log(`【Gemini-ステップ3-記録】❌ 送信時刻記録エラー: ${error.message}`, 'error');
                    }
                } else {
                    log(`【Gemini-ステップ3-記録】⚠️ AIHandler または recordSendTimestamp が利用できません`, 'warning');
                }
                
                return "メッセージを送信しました。";
            });
            
            // ========================================
            // ステップ4: 応答待機
            // ========================================
            const responseText = await logStep('【Gemini-ステップ4】応答待機', () => new Promise(async (resolve, reject) => {
                // Deep Researchモードの判定（executeCoreで定義済みの変数を使用）
                console.log(`🔍 [機能判定] Gemini機能チェック:`, {
                    featureName: featureName,
                    isDeepResearchMode: isDeepResearchMode,
                    isCanvasMode: isCanvasMode
                });
                
                console.log(`🎯 [機能判定] Gemini特別モード判定結果: ${isDeepResearchMode ? 'Deep Research' : isCanvasMode ? 'Canvas' : '通常'} (機能: "${featureName}")`);
                
                log(`【Gemini-ステップ4-0】待機モード: ${isDeepResearchMode ? '🔬 Deep Research' : isCanvasMode ? '🎨 Canvas' : '💬 通常'}`, 'info');
                
                if (isDeepResearchMode) {
                    // Deep Researchモード: 特別な処理フロー
                    const MAX_WAIT = 40 * 60 * 1000; // 40分
                    const startTime = Date.now();
                    
                    const logDr = (message, type = 'info') => {
                        const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(1);
                        log(`[経過: ${elapsedTime}秒] ${message}`, type);
                    };
                    
                    logDr('【Gemini-ステップ4-0】Deep Researchモードで応答を監視します。');
                    
                    // 全体のタイムアウト設定
                    const timeoutId = setTimeout(() => {
                        reject(new Error(`Deep Researchの応答が${MAX_WAIT / 60000}分以内に完了しませんでした。`));
                    }, MAX_WAIT);
                    
                    try {
                        // ステップ1: 初期応答の停止ボタンが出現するまで待機
                        logDr('【Gemini-ステップ4-1】初期応答の開始を待機中...');
                        while (!findElement(['button.send-button.stop'])) {
                            if (Date.now() - startTime > 30000) {
                                throw new Error('30秒以内に初期応答が開始されませんでした。');
                            }
                            await wait(1000);
                        }
                        logDr('【Gemini-ステップ4-1】初期応答が開始されました。', 'success');
                        
                        // ステップ2: 初期応答が完了して「リサーチを開始」ボタンが出現するまで待機
                        logDr('【Gemini-ステップ4-2】初期応答の完了を待機中...');
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
                        logDr('【Gemini-ステップ4-2】「リサーチを開始」ボタンをクリックしました。', 'success');
                        await wait(2000);
                        
                        // ステップ3: 本応答の完了を待つ
                        logDr('【Gemini-ステップ4-3】本応答の完了を待機中...');
                        
                        // 定期的な状態チェック
                        const loggingInterval = setInterval(() => {
                            const btn = findElement(['button.send-button.stop']);
                            logDr(`【Gemini-ステップ4-3】[定期チェック] 回答停止ボタンは${btn ? '✅ 存在します' : '❌ 存在しません'}。`);
                        }, 10000);
                        
                        // 本応答の停止ボタンが出現するまで待つ
                        while (!findElement(['button.send-button.stop'])) {
                            await wait(1000);
                        }
                        logDr('【Gemini-ステップ4-3】本応答の停止ボタンが出現しました。');
                        
                        // 停止ボタンが10秒間消えたら完了とみなす
                        let lastSeenTime = Date.now();
                        const checkInterval = setInterval(() => {
                            if (findElement(['button.send-button.stop'])) {
                                lastSeenTime = Date.now();
                            } else if (Date.now() - lastSeenTime > 10000) {
                                clearInterval(checkInterval);
                                clearInterval(loggingInterval);
                                clearTimeout(timeoutId);
                                logDr('【Gemini-ステップ4-3完了】Deep Researchの応答が完了しました。', 'success');
                                resolve('Deep Researchの応答が完了しました。');
                            }
                        }, 2000);
                        
                    } catch (error) {
                        clearTimeout(timeoutId);
                        reject(error);
                    }
                    
                } else if (isCanvasMode) {
                    // Canvasモード: 30秒初期待機 + テキスト変化監視
                    log('【Gemini-ステップ4-1】Canvasモード: 初期待機30秒...');
                    await wait(30000);  // 統一: 30秒
                    log('【Gemini-ステップ4-2】Canvasモード: テキスト生成の監視を開始します。');
                    
                    let lastLength = -1;
                    let lastChangeTime = Date.now();
                    
                    const monitor = setInterval(() => {
                        const canvasEditor = findElement(['.ProseMirror']);
                        if (!canvasEditor) return;
                        
                        const currentLength = canvasEditor.textContent.length;
                        log(`【Gemini-ステップ4-2】[監視中] 現在の文字数: ${currentLength}`);
                        
                        if (currentLength > lastLength) {
                            lastLength = currentLength;
                            lastChangeTime = Date.now();
                        }
                        
                        // 10秒間変化がなければ完了とみなす
                        if (Date.now() - lastChangeTime > 10000) {
                            clearInterval(monitor);
                            log('【Gemini-ステップ4-2】10秒間テキストの更新がなかったため、処理を完了します。', 'success');
                            resolve("Canvasの応答が安定しました。");
                        }
                    }, 2000);
                    
                } else {
                    // 通常モード: 停止ボタンが消えるまで待機
                    log('【Gemini-ステップ4-1】通常モード: 初期待機30秒...');
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
                        
                        log(`【Gemini-ステップ4-2】[待機中] 応答生成を待っています... (${waitTime / 1000}秒)`);
                        waitTime += 2000;
                    }, 2000);
                }
            }));
            
            // ========================================
            // ステップ5: テキスト取得（ui-selectorsを使用）
            // ========================================
            await logStep('【Gemini-ステップ5】テキスト取得', async () => {
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
                            log(`【Gemini-ステップ5-1】Canvas/拡張応答取得成功 (${selector}): ${text.length}文字`, 'success');
                            break;
                        }
                    }
                }
                
                // 方法2: 通常の応答メッセージを取得
                if (!text) {
                    log('【Gemini-ステップ5-2】通常テキスト取得試行', 'info');
                    
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
                                log(`【Gemini-ステップ5-2】通常テキスト取得成功 (${selector}): ${text.length}文字`, 'success');
                                break;
                            }
                        }
                    }
                    
                }
                
                // 方法3: フォールバック - より汎用的なセレクタで探す
                if (!text) {
                    log('【Gemini-ステップ5-3】フォールバックセレクタで取得試行', 'info');
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
                                log(`【Gemini-ステップ5-3】フォールバック取得成功 (${selector}): ${text.length}文字`, 'success');
                                break;
                            }
                        }
                    }
                }
                
                if (!text) {
                    throw new Error("応答テキストが見つかりません。");
                }
                
                log(`【Gemini-ステップ5-完了】最終的に取得: ${text.length}文字`, 'success');
                log(`【Gemini-ステップ5-完了】最初の100文字: ${text.substring(0, 100)}...`, 'info');
                
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
                    log(`【Gemini-ステップ確認-1】📊 選択後確認 - 実際のモデル: "${displayedModel}"`, 'info');
                } else {
                    log('【Gemini-ステップ確認-1】⚠️ ModelInfoExtractorが利用できません', 'warn');
                }

                // FunctionInfoExtractorを使用
                if (window.FunctionInfoExtractor) {
                    displayedFunction = window.FunctionInfoExtractor.extract('Gemini') || '';
                    log(`【Gemini-ステップ確認-2】📊 選択後確認 - 実際の機能: "${displayedFunction}"`, 'info');
                } else {
                    log('【Gemini-ステップ確認-2】⚠️ FunctionInfoExtractorが利用できません', 'warn');
                }
            } catch (error) {
                log(`【Gemini-ステップ確認】⚠️ モデル/機能情報取得エラー: ${error.message}`, 'warn');
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
            log('【エラー】実行中にエラーが発生しました: ' + error.message, 'error');
            return {
                success: false,
                error: error.message,
                testResults: testResults
            };
        }
    }
    
    // ========================================
    // 【関数一覧】検出システム用エクスポート関数
    // ========================================

    /*
    ┌─────────────────────────────────────────────────────┐
    │                【メニュー操作関数】                    │
    │   本番executeTask内のコードをそのまま関数化           │
    └─────────────────────────────────────────────────────┘
    */

    /**
     * 🔧 Geminiモデルメニューを開く
     * @description 本番executeTask内の行223-224のコードをそのまま関数化
     * @param {Element} menuButton - メニューボタン要素
     * @returns {Promise<boolean>} メニュー開放成功フラグ
     */
    async function openGeminiModelMenu(menuButton) {
        if (!menuButton) {
            console.error('[Gemini-openModelMenu] モデルボタンが見つかりません');
            return false;
        }

        try {
            menuButton.click();
            await wait(1500);

            // メニュー出現確認
            const menuItems = document.querySelectorAll('[role="menuitem"], [role="option"], mat-option');
            if (menuItems.length > 0) {
                console.log('[Gemini-openModelMenu] ✅ モデルメニュー開放成功');
                return true;
            } else {
                console.warn('[Gemini-openModelMenu] ⚠️ メニュー開放したがDOM確認できず');
                return false;
            }
        } catch (error) {
            console.error('[Gemini-openModelMenu] ❌ エラー:', error);
            return false;
        }
    }

    /**
     * 🔧 Gemini機能メニューを開く（スキップ）
     * @description Geminiでは明示的な機能メニューが少ないためスキップ
     * @param {Element} functionButton - 機能メニューボタン要素
     * @returns {Promise<boolean>} 常にfalse（機能メニューなし）
     */
    async function openGeminiFunctionMenu(functionButton) {
        console.log('[Gemini-openFunctionMenu] Geminiでは機能メニューをスキップ');
        return false; // 機能メニューなし
    }

    /**
     * 🔧 Geminiメニューを閉じる
     * @description 本番executeTask内の行252のコードをそのまま関数化（オーバーレイクリック）
     * @returns {Promise<void>}
     */
    async function closeGeminiMenu() {
        const overlay = document.querySelector('.cdk-overlay-backdrop.cdk-overlay-backdrop-showing');
        if (overlay) overlay.click();
        await wait(500);
    }

    /*
    ┌─────────────────────────────────────────────────────┐
    │                【基本操作関数】                        │
    │        Geminiでの基本的なUI操作を関数化              │
    └─────────────────────────────────────────────────────┘
    */

    /**
     * ✏️ Geminiテキスト入力処理
     * @description GeminiのcontentEditable要素にHTMLとしてテキストを入力
     * @param {string} text - 入力するテキスト
     * @returns {Promise<Element>} 入力要素
     * @throws {Error} テキスト入力欄が見つからない場合
     */
    async function inputTextGemini(text) {
        const inputSelectors = [
            '.ql-editor[contenteditable="true"]',
            '[data-placeholder*="Gemini"]',
            'div[contenteditable="true"]'
        ];

        let inputElement = null;
        for (const selector of inputSelectors) {
            inputElement = document.querySelector(selector);
            if (inputElement) break;
        }

        if (!inputElement) throw new Error('テキスト入力欄が見つかりません');

        inputElement.focus();
        await wait(100);

        // GeminiのRichTextEditor形式で入力
        inputElement.innerHTML = `<p>${text}</p>`;
        await wait(500);

        return inputElement;
    }

    /**
     * 📤 Geminiメッセージ送信処理
     * @description Geminiの送信ボタンをクリックしてメッセージを送信
     * @returns {Promise<boolean>} 送信成功フラグ
     * @throws {Error} 送信ボタンが見つからない場合
     */
    async function sendMessageGemini() {
        const sendSelectors = [
            'button[aria-label="送信"]:not([disabled])',
            'button[aria-label*="Send"]:not([disabled])',
            '.send-button:not([disabled])'
        ];

        let sendButton = null;
        for (const selector of sendSelectors) {
            sendButton = document.querySelector(selector);
            if (sendButton) break;
        }

        if (!sendButton) throw new Error('送信ボタンが見つかりません');

        sendButton.click();
        await wait(1000);

        return true;
    }

    /**
     * ⏳ Geminiレスポンス待機処理
     * @description Geminiのレスポンス生成完了まで待機（ローディングインジケータの消失を監視）
     * @returns {Promise<boolean>} 待機完了フラグ
     * @throws {Error} タイムアウト（2分）の場合
     */
    async function waitForResponseGemini() {
        const maxWaitTime = 120000; // 2分
        const checkInterval = 1000;
        let elapsedTime = 0;

        while (elapsedTime < maxWaitTime) {
            // Geminiの実行中インジケータをチェック
            const loadingIndicators = document.querySelectorAll([
                '.loading-indicator',
                '[aria-label*="thinking"]',
                '[aria-label*="generating"]'
            ].join(','));

            if (loadingIndicators.length === 0) {
                // ローディングインジケータがない = レスポンス完了
                await wait(2000);
                return true;
            }

            await wait(checkInterval);
            elapsedTime += checkInterval;
        }

        throw new Error('レスポンス待機タイムアウト');
    }

    /**
     * 📥 Geminiレスポンステキスト取得処理
     * @description Geminiの最新の回答を取得
     * @returns {Promise<string>} レスポンステキスト
     * @throws {Error} Geminiの回答が見つからない場合
     */
    async function getResponseTextGemini() {
        const responseSelectors = [
            '[data-response-index]:last-child',
            '.model-response:last-child',
            '[role="presentation"]:last-child'
        ];

        let responseElement = null;
        for (const selector of responseSelectors) {
            const elements = document.querySelectorAll(selector);
            if (elements.length > 0) {
                responseElement = elements[elements.length - 1];
                break;
            }
        }

        if (!responseElement) {
            throw new Error('Geminiの回答が見つかりません');
        }

        const responseText = responseElement.textContent?.trim() || '';
        return responseText;
    }

    /*
    ┌─────────────────────────────────────────────────────┐
    │                【選択操作関数】                        │
    │        モデルや機能の選択処理を関数化                 │
    └─────────────────────────────────────────────────────┘
    */

    /**
     * 🎯 Geminiモデル選択処理
     * @description 指定されたモデル名のモデルを選択
     * @param {string} modelName - 選択するモデル名（例: "Gemini-1.5-Pro", "Gemini-1.5-Flash"）
     * @returns {Promise<boolean>} 選択成功フラグ
     * @throws {Error} モデルが見つからない場合
     */
    async function selectModelGemini(modelName) {
        const menuButton = findElement([
            'button[aria-label*="モデル"]',
            'button.gds-mode-switch-button',
            'button.logo-pill-btn'
        ]);

        if (!menuButton) throw new Error('モデルボタンが見つかりません');

        await openGeminiModelMenu(menuButton);

        // モデル選択
        const modelOptions = document.querySelectorAll('.cdk-overlay-pane [role="menuitem"], .cdk-overlay-pane .model-option');
        for (const option of modelOptions) {
            if (option.textContent?.includes(modelName)) {
                option.click();
                await wait(1000);
                await closeGeminiMenu();
                return true;
            }
        }

        throw new Error(`モデル '${modelName}' が見つかりません`);
    }

    /**
     * 🎯 Gemini機能選択処理
     * @description Geminiでは機能選択は主にプロンプト内で制御する方式
     * @param {string} functionName - 指定する機能名（プロンプト内で活用）
     * @returns {Promise<boolean>} 選択成功フラグ
     * @note Geminiでは明示的な機能メニューが少ないため、プロンプト内で機能を指定
     */
    async function selectFunctionGemini(functionName) {
        // Geminiでは明示的な機能メニューが少ないため、
        // プロンプト内で機能を指定する方式が主流
        console.log(`Gemini機能選択: ${functionName} (プロンプト内で制御推奨)`);
        return true;
    }

    // ================================================================
    // メインエントリポイント: executeTask
    // ================================================================
    async function executeTask(taskData) {
        console.log('🚀 Gemini タスク実行開始', taskData);

        // ログ記録開始
        GeminiLogManager.startTask(taskData);
        
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
                log(`【初期化】📍 セル情報をプロンプトに追加: ${cellPosition}`, 'info');
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
            
            log(`【初期化】実行パラメータ: モデル="${resolvedModel}", 機能="${resolvedFeature}", プロンプト="${promptText.substring(0, 50)}..."`, 'info');
            
            // コア実行
            const result = await executeCore(resolvedModel, resolvedFeature, promptText);

            console.log('✅ Gemini タスク実行完了', result);

            // タスク完了をログに記録
            GeminiLogManager.completeTask(result);
            if (result.success && result.response) {
                GeminiLogManager.logStep('Step7-Complete', 'タスク正常完了', {
                    responseLength: result.response.length,
                    model: resolvedModel,
                    feature: resolvedFeature
                });
            }

            return result;
            
        } catch (error) {
            console.error('❌ Gemini タスク実行エラー:', error);

            const result = {
                success: false,
                error: error.message
            };

            // エラーをログに記録
            GeminiLogManager.logError('Task-Error', error, {
                taskData,
                errorMessage: error.message,
                errorStack: error.stack,
                errorName: error.name,
                timestamp: new Date().toISOString(),
                userAgent: navigator.userAgent,
                url: window.location.href
            });
            GeminiLogManager.completeTask(result);

            return result;
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

/*
┌─────────────────────────────────────────────────────┐
│                【使用例】                              │
└─────────────────────────────────────────────────────┘

// 基本的な使用の流れ
import {
    selectModelGemini,
    inputTextGemini,
    sendMessageGemini,
    waitForResponseGemini,
    getResponseTextGemini
} from './gemini-automation.js';

async function chatWithGemini() {
    try {
        // 1. モデル選択
        await selectModelGemini('Gemini-1.5-Pro');

        // 2. テキスト入力（GeminiのRichTextEditor形式）
        await inputTextGemini('こんにちは！機械学習のベストプラクティスを教えて');

        // 3. 送信
        await sendMessageGemini();

        // 4. レスポンス待機
        await waitForResponseGemini();

        // 5. 結果取得
        const response = await getResponseTextGemini();
        console.log('Gemini回答:', response);

        return response;
    } catch (error) {
        console.error('Gemini操作エラー:', error);
        throw error;
    }
}

*/

// ========================================
// ウィンドウ終了時のログ保存処理
// ========================================
window.addEventListener('beforeunload', async (event) => {
    console.log('🔄 [GeminiAutomation] ウィンドウ終了検知 - ログ保存開始');

    try {
        const fileName = await GeminiLogManager.saveToFile();
        if (fileName) {
            console.log(`✅ [GeminiAutomation] ログ保存完了: ${fileName}`);
        }
    } catch (error) {
        console.error('[GeminiAutomation] ログ保存エラー:', error);
    }
});

window.GeminiLogManager = GeminiLogManager;

// ========================================
// 【エクスポート】検出システム用関数一覧
// ========================================
export {
    // 🔧 メニュー操作
    openGeminiModelMenu,     // モデルメニューを開く
    closeGeminiMenu,         // メニューを閉じる

    // ✏️ 基本操作
    inputTextGemini,         // テキスト入力
    sendMessageGemini,       // メッセージ送信
    waitForResponseGemini,   // レスポンス待機
    getResponseTextGemini,   // レスポンス取得

    // 🎯 選択操作
    selectModelGemini,       // モデル選択
    selectFunctionGemini     // 機能選択（プロンプト制御）
};