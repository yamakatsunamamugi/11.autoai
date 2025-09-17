/**
 * @fileoverview Claude Automation V2 - ステップ実行版
 *
 * 【ステップ構成】
 * ステップ0: 初期化（設定・セレクタ読み込み）
 * ステップ1: ヘルパー関数定義
 * ステップ2: テキスト入力
 * ステップ3: モデル選択（条件付き）
 * ステップ4: 機能選択（条件付き）
 * ステップ5: メッセージ送信
 * ステップ6: 応答待機（通常/Deep Research）
 * ステップ7: テキスト取得
 *
 * @version 3.0.0
 * @updated 2024-12-16 ステップ番号体系統一、コード整理
 */
(function() {
    'use strict';

    console.log(`Claude Automation V2 - 初期化時刻: ${new Date().toLocaleString('ja-JP')}`);

    // ========================================
    // ログ管理システムの初期化（メッセージベース対応）
    // ========================================
    // Content scriptから直接importできないため、メッセージベースのログマネージャーを作成
    window.claudeLogFileManager = {
        logs: [],
        sessionStartTime: new Date().toISOString(),

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
        },

        logError(step, error, context = {}) {
            this.addLog({
                type: 'error',
                step,
                error: {
                    message: error.message,
                    stack: error.stack,
                    name: error.name
                },
                context
            });
        },

        logSuccess(step, message, result = {}) {
            this.addLog({
                type: 'success',
                step,
                message,
                result
            });
        },

        logTaskStart(taskData) {
            this.addLog({
                type: 'task_start',
                taskData: {
                    model: taskData.model,
                    function: taskData.function,
                    promptLength: taskData.prompt?.length || 0,
                    cellInfo: taskData.cellInfo
                }
            });
        },

        logTaskComplete(result) {
            this.addLog({
                type: 'task_complete',
                result: {
                    success: result.success,
                    responseLength: result.response?.length || 0,
                    error: result.error
                }
            });
        },

        async saveErrorImmediately(error, context = {}) {
            try {
                const timestamp = new Date().toISOString()
                    .replace(/[:.]/g, '-')
                    .replace('T', '_')
                    .slice(0, -5);

                const errorData = {
                    timestamp: new Date().toISOString(),
                    type: 'error',
                    error: {
                        message: error.message,
                        stack: error.stack,
                        name: error.name
                    },
                    context,
                    sessionStart: this.sessionStartTime
                };

                const fileName = `11autoai-logs/claude/errors/error-${timestamp}.json`;

                // バックグラウンドスクリプトにメッセージを送信
                if (typeof chrome !== 'undefined' && chrome.runtime) {
                    chrome.runtime.sendMessage({
                        type: 'DOWNLOAD_LOG_FILE',
                        data: {
                            fileName,
                            content: JSON.stringify(errorData, null, 2)
                        }
                    });
                }
                console.log(`❌ [エラー保存] ${fileName}`);
            } catch (saveError) {
                console.error('[エラー保存失敗]', saveError);
            }
        },

        async saveIntermediate() {
            // 実装は省略（必要に応じて追加）
        },

        async saveToFile() {
            if (this.logs.length === 0) {
                console.log('[LogFileManager] 保存するログがありません');
                return;
            }

            try {
                const timestamp = new Date().toISOString()
                    .replace(/[:.]/g, '-')
                    .replace('T', '_')
                    .slice(0, -5);

                const fileName = `claude-log-${timestamp}.json`;
                const filePath = `11autoai-logs/claude/complete/${fileName}`;

                const logData = {
                    sessionStart: this.sessionStartTime,
                    sessionEnd: new Date().toISOString(),
                    totalLogs: this.logs.length,
                    logs: this.logs
                };

                // バックグラウンドスクリプトにメッセージを送信
                if (typeof chrome !== 'undefined' && chrome.runtime) {
                    chrome.runtime.sendMessage({
                        type: 'DOWNLOAD_LOG_FILE',
                        data: {
                            fileName: filePath,
                            content: JSON.stringify(logData, null, 2)
                        }
                    });
                }

                console.log(`✅ [LogFileManager] 最終ログを保存しました: ${fileName}`);

                // ログをクリア
                this.logs = [];
                return filePath;
            } catch (error) {
                console.error('[LogFileManager] ログ保存エラー:', error);
                throw error;
            }
        },

        clearCurrentLogs() {
            this.logs = [];
            console.log('[LogFileManager] 現在のログをクリアしました');
        }
    };

    const ClaudeLogManager = {
        // LogFileManagerのプロキシとして動作
        get logFileManager() {
            return window.claudeLogFileManager || {
                logStep: () => {},
                logError: () => {},
                logSuccess: () => {},
                logTaskStart: () => {},
                logTaskComplete: () => {},
                saveToFile: () => {},
                saveErrorImmediately: () => {},
                saveIntermediate: () => {}
            };
        },

        // ステップログを記録
        logStep(step, message, data = {}) {
            this.logFileManager.logStep(step, message, data);
            console.log(`📝 [ログ] ${step}: ${message}`);
        },

        // エラーログを記録（即座にファイル保存）
        async logError(step, error, context = {}) {
            this.logFileManager.logError(step, error, context);
            console.error(`❌ [エラーログ] ${step}:`, error);
            // エラーは即座に保存
            await this.logFileManager.saveErrorImmediately(error, { step, ...context });
        },

        // 成功ログを記録
        logSuccess(step, message, result = {}) {
            this.logFileManager.logSuccess(step, message, result);
            console.log(`✅ [成功ログ] ${step}: ${message}`);
        },

        // タスク開始を記録
        startTask(taskData) {
            this.logFileManager.logTaskStart(taskData);
            console.log(`🚀 [タスク開始]`, taskData);
        },

        // タスク完了を記録
        completeTask(result) {
            this.logFileManager.logTaskComplete(result);
            console.log(`🏁 [タスク完了]`, result);
        },

        // ログをファイルに保存（最終保存）
        async saveToFile() {
            try {
                const filePath = await this.logFileManager.saveToFile();
                console.log(`✅ [ClaudeLogManager] 最終ログを保存しました: ${filePath}`);
                return filePath;
            } catch (error) {
                console.error('[ClaudeLogManager] ログ保存エラー:', error);
            }
        },

        // ログをクリア
        clear() {
            if (this.logFileManager.clearCurrentLogs) {
                this.logFileManager.clearCurrentLogs();
            }
        }
    };

    // ========================================
    // ステップ0: 初期化処理
    // ========================================

    // ステップ0-1: 設定の取得（グローバル変数への直接アクセスを避ける）
    const getConfig = () => {
        return {
            AI_WAIT_CONFIG: window.AI_WAIT_CONFIG || {
                INITIAL_WAIT: 30000,
                MAX_WAIT: 1200000,  // 20分に延長（元: 5分）
                CHECK_INTERVAL: 2000,
                DEEP_RESEARCH_WAIT: 2400000,
                SHORT_WAIT: 1000,
                MEDIUM_WAIT: 2000,
                STOP_BUTTON_INITIAL_WAIT: 30000,
                STOP_BUTTON_DISAPPEAR_WAIT: 300000
            },
            UI_SELECTORS: window.UI_SELECTORS || {}
        };
    };

    // ステップ0-2: 設定の適用
    const config = getConfig();
    const AI_WAIT_CONFIG = config.AI_WAIT_CONFIG;
    const UI_SELECTORS = config.UI_SELECTORS;

    // ステップ0-3: UI_SELECTORSの確認
    console.log('🔧 [Claude-ステップ0-3] UI_SELECTORS初期化確認:');
    console.log('  UI_SELECTORS存在:', !!UI_SELECTORS);
    if (UI_SELECTORS && UI_SELECTORS.Claude) {
        console.log('  UI_SELECTORS.Claude存在:', !!UI_SELECTORS.Claude);
        console.log('  UI_SELECTORS.Claude.INPUT:', UI_SELECTORS.Claude.INPUT);
        console.log('  UI_SELECTORS.Claude.SEND_BUTTON:', UI_SELECTORS.Claude.SEND_BUTTON);
        console.log('  UI_SELECTORS.Claude.STOP_BUTTON:', UI_SELECTORS.Claude.STOP_BUTTON);
    } else {
        console.warn('⚠️ [Claude-ステップ0-3] UI_SELECTORSが未定義です！デフォルト値を使用します。');
    }

    // ========================================
    // ステップ0-4: セレクタ定義
    // ========================================

    // ステップ0-4-1: Deep Research用セレクタ
    const getDeepResearchSelectors = () => ({
        '3_回答停止ボタン': {
            selectors: UI_SELECTORS.Claude?.STOP_BUTTON || [],
            description: '回答停止ボタン'
        },
        '4_Canvas機能テキスト位置': {
            selectors: [
                // 最優先: 実際のCanvasコンテンツ（code-blockクラス）
                '.code-block__code',
                'div.code-block__code',
                '.code-block__code.h-fit.min-h-full.w-fit.min-w-full',
                // Canvas固有セレクタ
                '#markdown-artifact',
                '[id="markdown-artifact"]',
                '.font-claude-response#markdown-artifact',
                '[tabindex="0"]#markdown-artifact',
                'div.mx-auto.max-w-3xl#markdown-artifact',
                // 実際のCanvas構造
                'div.grid-cols-1.grid.gap-2\\.5:has(p.whitespace-pre-wrap)',
                // 除外条件付きセレクタ（作業説明文を除外）
                'div.grid-cols-1.grid.gap-2\\.5:not([class*="p-3"]):not([class*="pt-0"]):not([class*="pr-8"])',
                'div[class*="grid-cols-1"][class*="gap-2.5"]:not([class*="p-3"]):not([class*="pt-0"])',
                // 通常回答除外セレクタ
                '.grid-cols-1.grid:not(.standard-markdown):not([class*="p-3"]):not([class*="pt-0"])',
                // フォールバック（汎用セレクタ）
                '[class*="grid"][class*="gap"]:not([class*="standard-markdown"]):not([class*="p-3"])'
            ],
            description: 'Canvas機能のテキスト表示エリア'
        },
        '4_3_Canvas続けるボタン': {
            selectors: [
                'button[aria-label="続ける"]',
                'button:contains("続ける")',
                'button[type="button"]:has-text("続ける")',
                'button.inline-flex:contains("続ける")'
            ],
            description: 'Canvas機能の続けるボタン'
        },
        '4_4_Canvasプレビューボタン': {
            selectors: [
                'div[aria-label="内容をプレビュー"][role="button"]',
                '[aria-label="内容をプレビュー"]',
                'div[role="button"][tabindex="0"]:has(div.artifact-block-cell)',
                'div.artifact-block-cell',
                '.flex.text-left.font-ui.rounded-lg[role="button"]',
                'div[role="button"]:contains("ドキュメント")'
            ],
            description: 'Canvas機能のプレビューボタン'
        },
        '4_2_Canvas開くボタン': {
            selectors: UI_SELECTORS.Claude?.DEEP_RESEARCH?.CANVAS_PREVIEW || UI_SELECTORS.Claude?.PREVIEW_BUTTON || [],
            description: 'Canvas機能を開くボタン'
        },
        '5_通常処理テキスト位置': {
            selectors: [
                '.standard-markdown',
                'div.standard-markdown',
                '.grid.gap-2\\.5.standard-markdown',
                'div.grid-cols-1.standard-markdown',
                '[class*="standard-markdown"]'
            ],
            description: '通常処理のテキスト表示エリア'
        }
    });

    // ステップ0-4-2: モデル選択用セレクタ
    const modelSelectors = {
        menuButton: (UI_SELECTORS.Claude?.MODEL_BUTTON || []).map(selector => ({ selector, description: 'モデル選択ボタン' })),
        menuContainer: [
            { selector: UI_SELECTORS.Claude?.MENU?.CONTAINER || '[role="menu"][data-state="open"]', description: 'メニューコンテナ' }
        ],
        otherModelsMenu: (UI_SELECTORS.Claude?.MENU?.OTHER_MODELS || []).map(selector => ({ selector, description: 'その他のモデルメニュー' })),
        modelDisplay: (UI_SELECTORS.Claude?.MODEL_INFO?.TEXT_ELEMENT || []).slice(0, 3).map(selector => ({ selector, description: 'モデル表示要素' }))
    };

    // ステップ0-4-3: 機能選択用セレクタ
    const featureSelectors = {
        menuButton: UI_SELECTORS.Claude?.FUNCTION_MENU_BUTTON || [],
        menuContainer: UI_SELECTORS.Claude?.FEATURE_MENU?.CONTAINER || [],
        webSearchToggle: UI_SELECTORS.Claude?.FEATURE_MENU?.WEB_SEARCH_TOGGLE || [],
        researchButton: UI_SELECTORS.Claude?.FEATURE_BUTTONS?.RESEARCH || []
    };

    // ステップ0-4-4: デフォルトセレクタ（フォールバック用）
    const DEFAULT_SELECTORS = {
        INPUT: [
            '.ProseMirror',
            'div.ProseMirror[contenteditable="true"]',
            '[data-placeholder*="Message Claude"]',
            'div[contenteditable="true"][role="textbox"]'
        ],
        SEND_BUTTON: [
            'button[aria-label="Send Message"]',
            'button[type="submit"][aria-label*="Send"]',
            'button svg path[d*="M320 448"]'
        ],
        STOP_BUTTON: [
            'button[aria-label="応答を停止"]',
            '[aria-label="応答を停止"]',
            'button svg path[d*="M128,20A108"]'
        ]
    };

    // ステップ0-4-5: Claude動作用セレクタ
    const claudeSelectors = {
        '1_テキスト入力欄': {
            selectors: (UI_SELECTORS.Claude?.INPUT && UI_SELECTORS.Claude.INPUT.length > 0)
                ? UI_SELECTORS.Claude.INPUT
                : DEFAULT_SELECTORS.INPUT,
            description: 'テキスト入力欄（ProseMirrorエディタ）'
        },
        '2_送信ボタン': {
            selectors: (UI_SELECTORS.Claude?.SEND_BUTTON && UI_SELECTORS.Claude.SEND_BUTTON.length > 0)
                ? UI_SELECTORS.Claude.SEND_BUTTON
                : DEFAULT_SELECTORS.SEND_BUTTON,
            description: '送信ボタン'
        },
        '3_回答停止ボタン': {
            selectors: (UI_SELECTORS.Claude?.STOP_BUTTON && UI_SELECTORS.Claude.STOP_BUTTON.length > 0)
                ? UI_SELECTORS.Claude.STOP_BUTTON
                : DEFAULT_SELECTORS.STOP_BUTTON,
            description: '回答停止ボタン'
        },
        '4_Canvas機能テキスト位置': {
            selectors: [
                // 最優先: 実際のCanvasコンテンツ（code-blockクラス）
                '.code-block__code',
                'div.code-block__code',
                '.code-block__code.h-fit.min-h-full.w-fit.min-w-full',
                // Canvas固有セレクタ
                '#markdown-artifact',
                '[id="markdown-artifact"]',
                '.font-claude-response#markdown-artifact',
                '[tabindex="0"]#markdown-artifact',
                'div.mx-auto.max-w-3xl#markdown-artifact',
                // 実際のCanvas構造
                'div.grid-cols-1.grid.gap-2\\.5:has(p.whitespace-pre-wrap)',
                // 除外条件付きセレクタ（作業説明文を除外）
                'div.grid-cols-1.grid.gap-2\\.5:not([class*="p-3"]):not([class*="pt-0"]):not([class*="pr-8"])',
                'div[class*="grid-cols-1"][class*="gap-2.5"]:not([class*="p-3"]):not([class*="pt-0"])',
                // 通常回答除外セレクタ
                '.grid-cols-1.grid:not(.standard-markdown):not([class*="p-3"]):not([class*="pt-0"])',
                // フォールバック（汎用セレクタ）
                '[class*="grid"][class*="gap"]:not([class*="standard-markdown"]):not([class*="p-3"])'
            ],
            description: 'Canvas機能のテキスト表示エリア'
        },
        '4_3_Canvas続けるボタン': {
            selectors: [
                'button[aria-label="続ける"]',
                'button:contains("続ける")',
                'button[type="button"]:has-text("続ける")',
                'button.inline-flex:contains("続ける")'
            ],
            description: 'Canvas機能の続けるボタン'
        },
        '4_4_Canvasプレビューボタン': {
            selectors: [
                'div[aria-label="内容をプレビュー"][role="button"]',
                '[aria-label="内容をプレビュー"]',
                'div[role="button"][tabindex="0"]:has(div.artifact-block-cell)',
                'div.artifact-block-cell',
                '.flex.text-left.font-ui.rounded-lg[role="button"]',
                'div[role="button"]:contains("ドキュメント")'
            ],
            description: 'Canvas機能のプレビューボタン'
        },
        '5_通常処理テキスト位置': {
            selectors: [
                '.standard-markdown',
                'div.standard-markdown',
                '.grid.gap-2\\.5.standard-markdown',
                'div.grid-cols-1.standard-markdown',
                '[class*="standard-markdown"]'
            ],
            description: '通常処理のテキスト表示エリア'
        }
    };

    // ステップ0-5: セレクタの最終状態をログ出力
    console.log('📋 [Claude-ステップ0-5] claudeSelectors最終設定:');
    console.log('  入力欄セレクタ数:', claudeSelectors['1_テキスト入力欄'].selectors.length);
    console.log('  送信ボタンセレクタ数:', claudeSelectors['2_送信ボタン'].selectors.length);
    console.log('  停止ボタンセレクタ数:', claudeSelectors['3_回答停止ボタン'].selectors.length);

    if (claudeSelectors['1_テキスト入力欄'].selectors.length === 0) {
        console.error('❌ [Claude-ステップ0-5] 致命的エラー: 入力欄セレクタが空です！');
    }

    // ========================================
    // ステップ1: ヘルパー関数定義
    // ========================================

    // ステップ1-1: 基本ユーティリティ関数
    const wait = async (ms) => {
        return new Promise(resolve => setTimeout(resolve, ms));
    };

    const waitForElement = async (selector, maxRetries = 10, retryDelay = 500) => {
        const log = (msg) => console.log(`⏳ [待機] ${msg}`);

        for (let i = 0; i < maxRetries; i++) {
            try {
                const element = document.querySelector(selector);
                if (element) {
                    const rect = element.getBoundingClientRect();
                    const isVisible = rect.width > 0 && rect.height > 0;
                    const style = window.getComputedStyle(element);
                    const isDisplayed = style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';

                    if (isVisible && isDisplayed) {
                        log(`✅ 要素発見: ${selector} (試行 ${i + 1}/${maxRetries})`);
                        return element;
                    }
                }
            } catch (error) {
                log(`⚠️ 要素検索エラー: ${error.message}`);
            }

            if (i < maxRetries - 1) {
                await wait(retryDelay);
            }
        }

        throw new Error(`要素が見つかりません: ${selector}`);
    };

    const getReactProps = (element) => {
        const keys = Object.keys(element || {});
        const reactKey = keys.find(key => key.startsWith('__reactInternalInstance') || key.startsWith('__reactFiber'));
        return reactKey ? element[reactKey] : null;
    };

    const triggerReactEvent = async (element, eventType = 'click') => {
        const log = (msg) => console.log(`🎯 [イベント] ${msg}`);

        try {
            const reactProps = getReactProps(element);
            if (reactProps) {
                log(`React要素検出: ${element.tagName}`);
            }

            if (eventType === 'click') {
                const rect = element.getBoundingClientRect();
                const x = rect.left + rect.width / 2;
                const y = rect.top + rect.height / 2;

                const events = [
                    new PointerEvent('pointerover', { bubbles: true, cancelable: true, clientX: x, clientY: y }),
                    new PointerEvent('pointerenter', { bubbles: false, cancelable: false, clientX: x, clientY: y }),
                    new MouseEvent('mouseover', { bubbles: true, cancelable: true, clientX: x, clientY: y }),
                    new MouseEvent('mouseenter', { bubbles: false, cancelable: false, clientX: x, clientY: y }),
                    new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: x, clientY: y }),
                    new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: x, clientY: y }),
                    new PointerEvent('pointerup', { bubbles: true, cancelable: true, clientX: x, clientY: y }),
                    new MouseEvent('mouseup', { bubbles: true, cancelable: true, clientX: x, clientY: y }),
                    new MouseEvent('click', { bubbles: true, cancelable: true, clientX: x, clientY: y })
                ];

                for (const event of events) {
                    element.dispatchEvent(event);
                    await wait(10);
                }

                element.click();
                log(`✅ クリックイベント完了: ${element.tagName}`);
            }
        } catch (error) {
            log(`⚠️ イベント処理エラー: ${error.message}`);
        }
    };

    const findElementByMultipleSelectors = async (selectors, description) => {
        console.log(`\n🔍 [${description}] 要素検索開始`);

        for (let i = 0; i < selectors.length; i++) {
            const selector = selectors[i];
            console.log(`  試行 ${i + 1}/${selectors.length}: ${selector.description}`);

            try {
                const element = await waitForElement(selector.selector, 3, 200);
                if (element) {
                    console.log(`  ✅ 成功: ${selector.description}`);
                    return element;
                }
            } catch (error) {
                console.log(`  ❌ 失敗: ${error.message}`);
            }
        }

        throw new Error(`${description} の要素が見つかりません`);
    };

    // ステップ1-2: モデル情報取得関数
    const getCurrentModelInfo = () => {
        console.log('\n📊 【ステップ1-2】現在のモデル情報を取得');

        for (const selectorInfo of modelSelectors.modelDisplay) {
            try {
                const element = document.querySelector(selectorInfo.selector);
                if (element) {
                    const text = element.textContent.trim();
                    console.log(`  ✅ モデル情報発見: "${text}"`);
                    return text;
                }
            } catch (error) {
                console.log(`  ❌ 取得失敗: ${error.message}`);
            }
        }

        console.log('  ⚠️ モデル情報が見つかりません');
        return null;
    };

    // ステップ1-5: React風イベント処理関数
    const setToggleState = (toggleButton, targetState) => {
        console.log(`\n🔄 トグル状態変更: ${targetState ? 'ON' : 'OFF'}`);

        const inputElement = toggleButton.querySelector('input[role="switch"]');
        if (!inputElement) {
            console.log('  ⚠️ トグル入力要素が見つかりません');
            return false;
        }

        const currentState = inputElement.checked || inputElement.getAttribute('aria-checked') === 'true';
        console.log(`  現在の状態: ${currentState ? 'ON' : 'OFF'}`);

        if (currentState !== targetState) {
            toggleButton.click();
            console.log(`  ✅ トグル状態を変更しました`);
            return true;
        } else {
            console.log(`  ℹ️ 既に目標の状態です`);
            return false;
        }
    };

    // ステップ1-6: 強化版findClaudeElement
    const findClaudeElement = async (selectorInfo, retryCount = 5, skipLog = false) => {
        const logPrefix = skipLog ? '' : '🔍 [findClaudeElement] ';

        if (!skipLog) {
            console.log(`${logPrefix}要素検索開始: ${selectorInfo.description}`);
            console.log(`${logPrefix}使用セレクタ数: ${selectorInfo.selectors.length}`);

            // セレクタ詳細をログに記録
            ClaudeLogManager.logStep('Selector-Search', `セレクタ検索開始: ${selectorInfo.description}`, {
                selectorCount: selectorInfo.selectors.length,
                selectors: selectorInfo.selectors.slice(0, 5) // 最初の5つを記録
            });
        }

        const results = [];

        for (let retry = 0; retry < retryCount; retry++) {
            if (!skipLog && retry > 0) {
                console.log(`${logPrefix}リトライ ${retry + 1}/${retryCount}`);
            }

            for (let i = 0; i < selectorInfo.selectors.length; i++) {
                const selector = selectorInfo.selectors[i];

                try {
                    const elements = document.querySelectorAll(selector);

                    if (elements.length > 0) {
                        for (const element of elements) {
                            const rect = element.getBoundingClientRect();
                            const style = window.getComputedStyle(element);
                            const isVisible = rect.width > 0 && rect.height > 0 &&
                                            style.display !== 'none' &&
                                            style.visibility !== 'hidden' &&
                                            style.opacity !== '0';

                            if (isVisible) {
                                if (!skipLog) {
                                    console.log(`${logPrefix}✅ 要素発見: セレクタ[${i}]`);
                                    console.log(`${logPrefix}  セレクタ: ${selector}`);
                                    console.log(`${logPrefix}  要素タイプ: ${element.tagName}`);
                                    console.log(`${logPrefix}  位置: (${Math.round(rect.left)}, ${Math.round(rect.top)})`);

                                    // セレクタヒットをログに記録
                                    ClaudeLogManager.logStep('Selector-Hit', `セレクタがヒット: ${selectorInfo.description}`, {
                                        selector: selector,
                                        selectorIndex: i,
                                        elementTag: element.tagName,
                                        elementId: element.id || 'none',
                                        elementClass: element.className || 'none',
                                        position: { x: Math.round(rect.left), y: Math.round(rect.top) },
                                        size: { width: Math.round(rect.width), height: Math.round(rect.height) }
                                    });
                                }
                                return element;
                            }
                        }

                        results.push({
                            selector: selector,
                            count: elements.length,
                            reason: '全て非表示'
                        });
                    } else {
                        results.push({
                            selector: selector,
                            count: 0,
                            reason: '要素なし'
                        });
                    }
                } catch (error) {
                    results.push({
                        selector: selector,
                        count: 0,
                        reason: `エラー: ${error.message}`
                    });
                }
            }

            if (retry < retryCount - 1) {
                const waitTime = 2000 + (retry * 1000);
                if (!skipLog) {
                    console.log(`${logPrefix}🔄 要素検索リトライ中... (${retry + 1}/${retryCount}) 次回まで${waitTime}ms待機`);
                }
                await wait(waitTime);
            }
        }

        if (!skipLog) {
            console.warn(`${logPrefix}✗ 要素未発見: ${selectorInfo.description}`);
            console.log(`${logPrefix}  試行結果:`, results);

            // セレクタミスをログに記録
            ClaudeLogManager.logError('Selector-NotFound', new Error(`要素未発見: ${selectorInfo.description}`), {
                description: selectorInfo.description,
                attemptedSelectors: selectorInfo.selectors,
                results: results
            });
        }

        return null;
    };

    // ステップ1-7: テキスト入力関数
    const inputText = async (element, text) => {
        try {
            element.focus();
            await wait(100);

            element.textContent = text;

            const inputEvent = new Event('input', {
                bubbles: true,
                cancelable: true
            });
            element.dispatchEvent(inputEvent);

            const changeEvent = new Event('change', {
                bubbles: true,
                cancelable: true
            });
            element.dispatchEvent(changeEvent);

            await wait(100);

            console.log('✓ テキスト入力成功');
            return true;
        } catch (e) {
            console.error('✗ テキスト入力エラー:', e);
            return false;
        }
    };

    // ステップ1-8: ボタンクリック関数
    const clickButton = async (button, description = '送信ボタン') => {
        console.log(`\n👆 ${description}をクリック`);

        try {
            button.scrollIntoView({ behavior: 'smooth', block: 'center' });
            await wait(100);

            const rect = button.getBoundingClientRect();
            console.log(`📍 ボタン位置: (${Math.round(rect.left)}, ${Math.round(rect.top)})`);

            const x = rect.left + rect.width / 2;
            const y = rect.top + rect.height / 2;

            const mouseenter = new MouseEvent('mouseenter', { bubbles: true, cancelable: true, clientX: x, clientY: y });
            const mouseover = new MouseEvent('mouseover', { bubbles: true, cancelable: true, clientX: x, clientY: y });
            const mousedown = new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: x, clientY: y });
            const mouseup = new MouseEvent('mouseup', { bubbles: true, cancelable: true, clientX: x, clientY: y });
            const click = new MouseEvent('click', { bubbles: true, cancelable: true, clientX: x, clientY: y });

            button.dispatchEvent(mouseenter);
            await wait(10);
            button.dispatchEvent(mouseover);
            await wait(10);
            button.dispatchEvent(mousedown);
            await wait(10);
            button.dispatchEvent(mouseup);
            await wait(10);
            button.dispatchEvent(click);

            button.click();

            console.log('✓ ボタンクリック完了');
            return true;
        } catch (e) {
            console.error('✗ ボタンクリックエラー:', e);
            return false;
        }
    };

    // ステップ1-9: テキストプレビュー取得関数（改善版）
    const getTextPreview = (element) => {
        if (!element) return { full: '', preview: '', length: 0 };

        console.log('📊 [getTextPreview] テキスト取得開始');
        console.log('  - 要素タグ:', element.tagName);
        console.log('  - 要素ID:', element.id || '(なし)');
        console.log('  - 要素クラス:', element.className ? element.className.substring(0, 100) : '(なし)');
        console.log('  - 子要素数:', element.children.length);

        // 複数の方法でテキスト取得を試みる
        let fullText = '';

        // 方法1: innerText（表示されているテキスト）
        if (element.innerText) {
            fullText = element.innerText.trim();
            console.log('  - innerText長:', fullText.length);
        }

        // 方法2: textContent（全テキスト）
        if (!fullText || fullText.length < 100) {
            const textContent = element.textContent.trim();
            console.log('  - textContent長:', textContent.length);
            if (textContent.length > fullText.length) {
                fullText = textContent;
            }
        }

        // 方法3: 特定の子要素からテキスト取得（Canvasの場合）
        const isCanvasElement = element.classList.contains('code-block__code') ||
                               element.id === 'markdown-artifact' ||
                               element.querySelector('#markdown-artifact') ||
                               element.querySelector('.code-block__code') ||
                               element.querySelector('.grid-cols-1.grid.gap-2\\.5');

        // 作業説明文を除外（間違った取得対象）
        const isTaskExplanation = element.classList.contains('p-3') ||
                                 element.classList.contains('pt-0') ||
                                 element.classList.contains('pr-8') ||
                                 (element.textContent && element.textContent.includes('The task is complete'));

        if (isCanvasElement && !isTaskExplanation) {
            console.log('  📝 Canvas要素を検出、特別処理を実行');
            console.log(`    - 要素判定: ${element.classList.contains('code-block__code') ? 'code-block__code' : 'その他Canvas要素'}`);

            // code-block__code要素の場合は直接テキストを取得
            if (element.classList.contains('code-block__code')) {
                const codeText = element.innerText || element.textContent || '';
                if (codeText.trim() && codeText.length > fullText.length) {
                    fullText = codeText.trim();
                    console.log('  - code-block__code テキスト長:', fullText.length);
                }
            } else {
                // その他のCanvas要素の場合は従来の方法
                const paragraphs = element.querySelectorAll('p');
                console.log('  - 段落数:', paragraphs.length);

                if (paragraphs.length > 0) {
                    let combinedText = '';
                    let totalChars = 0;
                    paragraphs.forEach((para, index) => {
                        const paraText = para.innerText || para.textContent || '';
                        if (paraText.trim()) {
                            const charCount = paraText.length;
                            totalChars += charCount;
                            if (index < 5 || index >= paragraphs.length - 2) {
                                // 最初の5段落と最後の2段落の詳細をログ
                                console.log(`    - 段落${index + 1}: ${charCount}文字`);
                            }
                            combinedText += paraText.trim() + '\n\n';
                        }
                    });

                    console.log(`  - 総文字数: ${totalChars}文字`);

                    if (combinedText.trim().length > fullText.length) {
                        fullText = combinedText.trim();
                        console.log('  - 結合テキスト長:', fullText.length);
                    }
                }

                // pre/codeブロックも探す（コード例が含まれる場合）
                const codeBlocks = element.querySelectorAll('pre, code');
                if (codeBlocks.length > 0) {
                    console.log('  - コードブロック数:', codeBlocks.length);
                    let codeText = '';
                    codeBlocks.forEach((block, index) => {
                        const blockText = block.innerText || block.textContent || '';
                        if (blockText.trim() && !fullText.includes(blockText.trim())) {
                            console.log(`    - コードブロック${index + 1}: ${blockText.length}文字`);
                            codeText += blockText + '\n';
                        }
                    });

                    if (codeText.trim()) {
                        fullText += '\n\n' + codeText.trim();
                    }
                }
            }
        } else if (isTaskExplanation) {
            console.log('  ⚠️ 作業説明文を検出、除外します');
            console.log(`    - 除外理由: ${element.classList.contains('p-3') ? 'p-3クラス' :
                                        element.classList.contains('pt-0') ? 'pt-0クラス' :
                                        element.classList.contains('pr-8') ? 'pr-8クラス' :
                                        'タスク完了テキスト'}`);
        }

        const length = fullText.length;
        console.log('  ✅ 最終テキスト長:', length);

        if (length === 0) {
            console.warn('  ⚠️ テキストが空です！');
            console.log('  - element.innerHTML長:', element.innerHTML ? element.innerHTML.length : 0);
            console.log('  - element.outerHTML冒頭:', element.outerHTML ? element.outerHTML.substring(0, 200) : '(なし)');
        }

        if (length <= 200) {
            return { full: fullText, preview: fullText, length };
        } else {
            const preview = fullText.substring(0, 100) + '\n...[中略]...\n' + fullText.substring(length - 100);
            return { full: fullText, preview, length };
        }
    };

    // ステップ1-10: 要素の可視性チェック
    const isElementVisible = (element) => {
        if (!element) return false;
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return rect.width > 0 &&
               rect.height > 0 &&
               style.display !== 'none' &&
               style.visibility !== 'hidden' &&
               style.opacity !== '0';
    };

    // ステップ1-11: 機能要素の取得（特別処理対応）
    const getFeatureElement = (selectors, description = '') => {
        console.log(`🔍 機能要素取得開始: ${description}`);
        for (const selector of selectors) {
            try {
                // 特別処理：テキスト検索
                if (typeof selector === 'string' && (selector.includes('ウェブ検索') || selector.includes('じっくり考える'))) {
                    const buttons = document.querySelectorAll('button');
                    for (const el of buttons) {
                        const text = el.textContent || '';
                        if (text.includes('ウェブ検索') || text.includes('じっくり考える')) {
                            const hasSwitch = el.querySelector('input[role="switch"]');
                            if (hasSwitch) {
                                console.log(`✅ ${description}発見（テキスト検索）`);
                                return el;
                            }
                        }
                    }
                } else {
                    const element = document.querySelector(selector);
                    if (element && isElementVisible(element)) {
                        console.log(`✅ ${description}発見: ${selector}`);
                        return element;
                    }
                }
            } catch (error) {
                continue;
            }
        }
        console.log(`⚠️ ${description}が見つかりません`);
        return null;
    };

    // ステップ1-12: すべての機能トグルをオフにする関数
    const turnOffAllFeatureToggles = () => {
        console.log('\n🔄 すべての機能トグルをオフに設定中...');
        let toggleCount = 0;

        // 機能メニュー内のすべてのトグルを探す
        const toggles = document.querySelectorAll('button:has(input[role="switch"])');

        for (const toggle of toggles) {
            try {
                const inputElement = toggle.querySelector('input[role="switch"]');
                if (inputElement) {
                    const isCurrentlyOn = inputElement.checked || inputElement.getAttribute('aria-checked') === 'true';

                    if (isCurrentlyOn) {
                        const label = toggle.querySelector('p.font-base');
                        const featureName = label ? label.textContent.trim() : 'Unknown';

                        console.log(`  🔘 ${featureName}をオフに設定`);
                        toggle.click();
                        toggleCount++;
                    }
                }
            } catch (error) {
                console.warn('  ⚠️ トグル処理エラー:', error.message);
            }
        }

        console.log(`✅ ${toggleCount}個のトグルをオフにしました`);
        return toggleCount;
    };

    // ========================================
    // ステップ1-12: Deep Research専用処理関数
    // ========================================

    const handleDeepResearchWait = async () => {
        console.log('\n【Deep Research専用待機処理】');
        console.log('─'.repeat(40));

        try {
            // ステップ1-1: 送信後、回答停止ボタンが出てくるまで待機
            console.log('\n【ステップ1-1】送信後、回答停止ボタンが出てくるまで待機');

            let stopButtonFound = false;
            let waitCount = 0;
            const maxInitialWait = AI_WAIT_CONFIG.STOP_BUTTON_INITIAL_WAIT / 1000; // 統一設定: 30秒

            while (!stopButtonFound && waitCount < maxInitialWait) {
                const deepResearchSelectors = getDeepResearchSelectors();
                const stopResult = await findClaudeElement(deepResearchSelectors['3_回答停止ボタン'], 3, true);

                if (stopResult) {
                    stopButtonFound = true;
                    console.log(`✓ 停止ボタンが出現しました（${waitCount}秒後）`);
                    break;
                }

                await wait(1000);
                waitCount++;

                // 5秒ごとにログ出力
                if (waitCount % 5 === 0) {
                    console.log(`  待機中... ${waitCount}秒経過`);
                }
            }

            // ステップ1-2: 回答停止ボタンが消滅するまで待機（初回）
            if (stopButtonFound) {
                console.log('\n【ステップ1-2】回答停止ボタンが消滅するまで待機（初回）');
                let stopButtonGone = false;
                waitCount = 0;
                const maxDisappearWait = AI_WAIT_CONFIG.STOP_BUTTON_DISAPPEAR_WAIT / 1000; // 統一設定: 5分

                while (!stopButtonGone && waitCount < maxDisappearWait) {
                    const deepResearchSelectors = getDeepResearchSelectors();
                    const stopResult = await findClaudeElement(deepResearchSelectors['3_回答停止ボタン'], 3, true);

                    if (!stopResult) {
                        stopButtonGone = true;
                        console.log(`✓ 停止ボタンが消滅しました（${waitCount}秒後）`);
                        break;
                    }

                    await wait(1000);
                    waitCount++;

                    // 10秒ごとにログ出力
                    if (waitCount % 10 === 0) {
                        console.log(`  初回回答生成中... ${Math.floor(waitCount / 60)}分${waitCount % 60}秒経過`);
                    }
                }
            }

            // ステップ1-3: 一時待機（Deep Researchの追加処理のため）
            console.log('\n【ステップ1-3】Deep Research追加処理の一時待機');
            await wait(5000);

            // ログで状態を確認
            const currentButtons = document.querySelectorAll('button');
            for (const btn of currentButtons) {
                const text = btn.textContent?.trim() || '';
                if (text.includes('停止') || text.includes('Stop')) {
                    console.log('  停止ボタン検出:', text);
                }
            }

            // ステップ1-4: 回答停止ボタンが出現するまで待機
            console.log('\n【ステップ1-4】回答停止ボタンが出現するまで待機');
            stopButtonFound = false;
            waitCount = 0;
            const maxWaitCount = AI_WAIT_CONFIG.DEEP_RESEARCH_WAIT / 1000; // 統一設定: 40分

            while (!stopButtonFound && waitCount < maxWaitCount) {
                const deepResearchSelectors = getDeepResearchSelectors();
                const stopResult = await findClaudeElement(deepResearchSelectors['3_回答停止ボタン'], 3, true);

                if (stopResult) {
                    stopButtonFound = true;
                    console.log(`✓ 停止ボタンが出現しました（開始から${Math.floor(waitCount/60)}分${waitCount%60}秒後）`);
                    break;
                }

                await wait(1000);
                waitCount++;

                // 1分ごとにログ出力
                if (waitCount % 60 === 0) {
                    console.log(`  Deep Research処理中... ${Math.floor(waitCount/60)}分経過`);
                }
            }

            // ステップ1-5: 回答停止ボタンが10秒間消滅するまで待機
            if (stopButtonFound) {
                console.log('\n【ステップ1-5】回答停止ボタンが10秒間消滅するまで待機');
                let stopButtonGone = false;
                let disappearWaitCount = 0;
                const maxDisappearWait = AI_WAIT_CONFIG.DEEP_RESEARCH_WAIT / 1000; // 統一設定: 40分
                let lastLogTime = Date.now();

                while (!stopButtonGone && disappearWaitCount < maxDisappearWait) {
                    const deepResearchSelectors = getDeepResearchSelectors();
                    const stopResult = await findClaudeElement(deepResearchSelectors['3_回答停止ボタン'], 3, true);

                    if (!stopResult) {
                        // 10秒間確認
                        let confirmCount = 0;
                        let stillGone = true;

                        while (confirmCount < 10) {
                            await wait(1000);
                            const deepResearchSelectors = getDeepResearchSelectors();
                            const checkResult = await findClaudeElement(deepResearchSelectors['3_回答停止ボタン'], 2);
                            if (checkResult) {
                                stillGone = false;
                                break;
                            }
                            confirmCount++;
                        }

                        if (stillGone) {
                            stopButtonGone = true;
                            console.log(`✓ Deep Research完了（総時間: ${Math.floor(disappearWaitCount/60)}分）`);
                            break;
                        }
                    }

                    await wait(1000);
                    disappearWaitCount++;

                    // 1分ごとにログ出力
                    if (Date.now() - lastLogTime >= 60000) {
                        console.log(`  Deep Research生成中... ${Math.floor(disappearWaitCount / 60)}分経過`);
                        lastLogTime = Date.now();
                    }
                }
            }

        } catch (error) {
            console.error('❌ Deep Research待機処理エラー:', error.message);
            throw error;
        }
    };

    // ========================================
    // メイン実行関数（ステップ2-7を含む）
    // ========================================

    async function executeTask(taskData) {
        console.log('%c🚀 Claude V2 タスク実行開始', 'color: #9C27B0; font-weight: bold; font-size: 16px');
        console.log('受信したタスクデータ:', {
            model: taskData.model,
            function: taskData.function,
            promptLength: taskData.prompt?.length || taskData.text?.length || 0,
            hasPrompt: !!(taskData.prompt || taskData.text),
            cellInfo: taskData.cellInfo
        });

        // ログ記録開始
        ClaudeLogManager.startTask(taskData);

        try {
            // パラメータ準備（スプレッドシートの値をそのまま使用）
            let prompt = taskData.prompt || taskData.text || '';

            // セル位置情報を追加
            if (taskData.cellInfo && taskData.cellInfo.column && taskData.cellInfo.row) {
                const cellPosition = `${taskData.cellInfo.column}${taskData.cellInfo.row}`;
                prompt = `【現在${cellPosition}セルを処理中です】\n\n${prompt}`;
                console.log(`📍 セル位置情報を追加: ${cellPosition}`);
            }

            const modelName = taskData.model || '';
            const featureName = taskData.function || null;

            // Deep Research判定
            const isDeepResearch = featureName === 'Deep Research';

            console.log('実行パラメータ:');
            console.log('  - モデル名:', modelName || '(デフォルト)');
            console.log('  - 機能名:', featureName || '(なし)');
            console.log('  - Deep Research:', isDeepResearch ? '有効' : '無効');
            console.log('  - プロンプト長:', prompt.length, '文字');

            // ========================================
            // ステップ2: テキスト入力
            // ========================================
            console.log('\n【Claude-ステップ2】テキスト入力');
            console.log('─'.repeat(40));
            ClaudeLogManager.logStep('Step2-TextInput', 'テキスト入力開始');

            const inputResult = await findClaudeElement(claudeSelectors['1_テキスト入力欄']);
            if (!inputResult) {
                console.error('❌ テキスト入力欄が見つかりません');
                throw new Error('テキスト入力欄が見つかりません');
            }

            console.log('📝 テキストを入力中...');
            const inputSuccess = await inputText(inputResult, prompt);
            if (!inputSuccess) {
                throw new Error('テキスト入力に失敗しました');
            }

            console.log('✅ テキスト入力完了');
            ClaudeLogManager.logStep('Step2-TextInput', 'テキスト入力完了', { promptLength: prompt.length });
            await wait(1000);

            // ========================================
            // ステップ3: モデル選択（条件付き）
            // ========================================
            if (modelName && modelName !== '' && modelName !== '設定なし') {
                console.log('\n【Claude-ステップ3】モデル選択');
                console.log('─'.repeat(40));
                console.log(`目標モデル: ${modelName}`);

                // モデルメニューボタンを探してクリック
                console.log('\n【ステップ3-1】モデルメニューボタンを探す');
                const menuButton = await findElementByMultipleSelectors(modelSelectors.menuButton, 'モデル選択ボタン');
                await triggerReactEvent(menuButton);
                await wait(2000);

                // モデル名がClaudeを含むか確認
                const targetModelName = modelName.startsWith('Claude') ? modelName : `Claude ${modelName}`;

                // サブメニューチェック
                const mainMenuItems = document.querySelectorAll('[role="menuitem"]:not([aria-haspopup="menu"])');
                let foundInMain = false;

                for (const item of mainMenuItems) {
                    const itemText = item.textContent;
                    if (itemText && itemText.includes(targetModelName)) {
                        foundInMain = true;
                        await triggerReactEvent(item, 'click');
                        await wait(1500);
                        break;
                    }
                }

                if (!foundInMain) {
                    // その他のモデルをチェック
                    console.log('【ステップ3-2】その他のモデルメニューをチェック');
                    const otherModelsItem = await findElementByMultipleSelectors(modelSelectors.otherModelsMenu, 'その他のモデルメニュー');
                    if (otherModelsItem) {
                        await triggerReactEvent(otherModelsItem, 'click');
                        await wait(1500);

                        // サブメニュー内でモデルを探す
                        const subMenuItems = document.querySelectorAll('[role="menuitem"]');
                        for (const item of subMenuItems) {
                            const itemText = item.textContent;
                            if (itemText && itemText.includes(targetModelName)) {
                                await triggerReactEvent(item, 'click');
                                await wait(1500);
                                break;
                            }
                        }
                    }
                }

                // モデル選択結果の確認
                const newCurrentModel = getCurrentModelInfo();
                console.log(`選択後のモデル: "${newCurrentModel}"`);
                console.log(`期待されるモデル: "${targetModelName}"`);
                console.log(`モデル一致: ${newCurrentModel === targetModelName ? '✅' : '❌'}`);
            }

            // ========================================
            // ステップ4: 機能選択（条件付き）
            // ========================================
            if (featureName && featureName !== '' && featureName !== '設定なし') {
                console.log('\n【Claude-ステップ4】機能選択');
                console.log('─'.repeat(40));

                console.log('\n【ステップ4-1】機能を選択');

                const featureMenuBtn = getFeatureElement(featureSelectors.menuButton, '機能メニューボタン');
                if (featureMenuBtn) {
                    featureMenuBtn.click();
                    await wait(1500);

                    // 機能選択前にすべてのトグルをオフにする
                    console.log('\n【ステップ4-1-1】全トグルをオフに設定');
                    turnOffAllFeatureToggles();
                    await wait(500);

                    if (isDeepResearch) {
                        // ウェブ検索をオンにする
                        const webSearchToggle = getFeatureElement(featureSelectors.webSearchToggle, 'ウェブ検索トグル');
                        if (webSearchToggle) {
                            setToggleState(webSearchToggle, true);
                            await wait(1500);
                        }

                        // メニューを閉じる（Deep Research用）
                        console.log('\n【ステップ4-2】Deep Research用: メニューを閉じる');
                        featureMenuBtn.click();
                        await wait(1000);

                        // リサーチボタンを探してクリック
                        const buttons = document.querySelectorAll('button[type="button"][aria-pressed]');
                        for (const btn of buttons) {
                            const svg = btn.querySelector('svg path[d*="M8.5 2C12.0899"]');
                            if (svg) {
                                const isPressed = btn.getAttribute('aria-pressed') === 'true';
                                if (!isPressed) {
                                    btn.click();
                                    await wait(1000);
                                }
                                break;
                            }
                        }
                    } else {
                        // その他の機能を選択
                        const toggles = document.querySelectorAll('button:has(input[role="switch"])');
                        for (const toggle of toggles) {
                            const label = toggle.querySelector('p.font-base');
                            if (label && label.textContent.trim() === featureName) {
                                setToggleState(toggle, true);
                                await wait(1000);
                                break;
                            }
                        }

                        // メニューを閉じる
                        console.log('\n【ステップ4-3】メニューを閉じる');
                        featureMenuBtn.click();
                        await wait(1000);
                    }
                }
            }

            // ========================================
            // ステップ5: メッセージ送信
            // ========================================
            console.log('\n【Claude-ステップ5】メッセージ送信');
            console.log('─'.repeat(40));

            const sendResult = await findClaudeElement(claudeSelectors['2_送信ボタン']);
            if (!sendResult) {
                console.error('❌ 送信ボタンが見つかりません');
                throw new Error('送信ボタンが見つかりません');
            }

            console.log('📤 送信ボタンをクリック...');
            const clickSuccess = await clickButton(sendResult, '送信ボタン');
            if (!clickSuccess) {
                throw new Error('送信ボタンのクリックに失敗しました');
            }

            // 送信時刻を記録（SpreadsheetLogger用）
            const sendTime = new Date();
            console.log('🔍 送信時刻記録開始 - ', sendTime.toISOString());

            // taskDataからtaskIdを取得、なければ生成
            const taskId = taskData.taskId || `Claude_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

            try {
                // Chrome拡張機能のメッセージ送信で直接記録
                if (chrome.runtime && chrome.runtime.sendMessage) {
                    await chrome.runtime.sendMessage({
                        type: 'recordSendTime',
                        taskId: taskId,
                        sendTime: sendTime.toISOString(),
                        taskInfo: {
                            aiType: 'Claude',
                            model: modelName || '不明',
                            function: featureName || '通常'
                        }
                    });
                    console.log('✅ 送信時刻記録成功:', taskId, sendTime.toISOString());
                } else {
                    console.warn('⚠️ Chrome runtime APIが利用できません');
                }
            } catch (error) {
                console.log('❌ 送信時刻記録エラー:', error.message);
            }

            console.log('✅ メッセージ送信完了');
            ClaudeLogManager.logStep('Step5-Send', 'メッセージ送信完了');
            await wait(2000);

            // Canvas内容を保存する変数（スコープを広く）
            let finalText = '';

            // ========================================
            // ステップ6: 応答待機（Deep Research/通常）
            // ========================================
            if (isDeepResearch) {
                console.log('\n【Claude-ステップ6-1】Deep Research専用待機処理');
                await handleDeepResearchWait();
            } else {
                // ========================================
                // ステップ6-2: 通常応答待機
                // ========================================
                console.log('\n【Claude-ステップ6-2】通常応答待機（停止ボタン監視）');
                console.log('─'.repeat(40));

                let stopButtonFound = false;
                let waitCount = 0;
                const maxInitialWait = AI_WAIT_CONFIG.STOP_BUTTON_INITIAL_WAIT / 1000;

                while (!stopButtonFound && waitCount < maxInitialWait) {
                    const stopResult = await findClaudeElement(claudeSelectors['3_回答停止ボタン'], 3, true);

                    if (stopResult) {
                        stopButtonFound = true;
                        console.log(`✓ 停止ボタンが出現（${waitCount}秒後）`);
                        break;
                    }

                    await wait(1000);
                    waitCount++;

                    if (waitCount % 5 === 0) {
                        console.log(`  応答生成中... ${waitCount}秒経過`);
                    }
                }

                if (stopButtonFound) {
                    console.log('\n停止ボタンが消えるまで待機中...');
                    const deepResearchSelectors = getDeepResearchSelectors();
                    let stopButtonGone = false;
                    let isCanvasMode = false;
                    waitCount = 0;
                    const maxDisappearWait = AI_WAIT_CONFIG.MAX_WAIT / 1000;

                    while (!stopButtonGone && waitCount < maxDisappearWait) {
                        // 待機中の文字数カウント（10秒ごと）
                        if (waitCount % 10 === 0 && waitCount > 0) {
                            // Canvasテキストをチェック
                            const canvasElement = await findClaudeElement(deepResearchSelectors['4_Canvas機能テキスト位置'], 1, true);
                            if (canvasElement) {
                                const canvasTextLength = canvasElement.textContent ? canvasElement.textContent.trim().length : 0;
                                console.log(`  📈 Canvasテキスト: ${canvasTextLength}文字`);
                                ClaudeLogManager.logStep('Progress-Canvas', `Canvas文字数: ${canvasTextLength}文字`, {
                                    charCount: canvasTextLength,
                                    time: waitCount
                                });
                            }

                            // 通常テキストをチェック
                            const normalElement = await findClaudeElement(deepResearchSelectors['5_通常処理テキスト位置'], 1, true);
                            if (normalElement) {
                                const normalTextLength = normalElement.textContent ? normalElement.textContent.trim().length : 0;
                                console.log(`  📈 通常テキスト: ${normalTextLength}文字`);
                                ClaudeLogManager.logStep('Progress-Normal', `通常文字数: ${normalTextLength}文字`, {
                                    charCount: normalTextLength,
                                    time: waitCount
                                });
                            }
                        }

                        // Canvasプレビューボタンをチェック（Canvas未処理の場合のみ）
                        if (!isCanvasMode) {
                            const previewButton = await findClaudeElement(deepResearchSelectors['4_4_Canvasプレビューボタン'], 2, true);
                            if (previewButton) {
                                console.log(`\n✓ Canvas プレビューボタンを検出！（${waitCount}秒後）`);
                                console.log('📱 Canvas処理モードに切り替えます');
                                isCanvasMode = true;

                                // Canvas プレビューボタンのクリックとリトライ処理
                                console.log('🔄 Canvas プレビューボタンをクリック中...');
                                let canvasLoaded = false;
                                const maxRetries = 5; // 最大5回リトライ
                                const retryDelays = [2000, 3000, 5000, 8000, 10000]; // 段階的に待機時間を延長

                                for (let retryCount = 0; retryCount < maxRetries && !canvasLoaded; retryCount++) {
                                    if (retryCount > 0) {
                                        console.log(`🔄 リトライ ${retryCount}/${maxRetries}: Canvas プレビューボタンを再クリック...`);
                                        // ボタンを再取得（DOM更新の可能性があるため）
                                        const retryButton = await findClaudeElement(deepResearchSelectors['4_4_Canvasプレビューボタン'], 2, true);
                                        if (retryButton) {
                                            retryButton.click();
                                        } else {
                                            console.log('⚠ プレビューボタンが見つかりません');
                                            break;
                                        }
                                    } else {
                                        previewButton.click();
                                    }

                                    // 各リトライの待機時間
                                    const waitTime = retryDelays[retryCount] || 10000;
                                    console.log(`⏳ Canvas表示を${waitTime/1000}秒間待機中...`);

                                    let loadWaitCount = 0;
                                    const maxLoadWait = waitTime / 1000;

                                    while (!canvasLoaded && loadWaitCount < maxLoadWait) {
                                        const canvasContent = await findClaudeElement(deepResearchSelectors['4_Canvas機能テキスト位置'], 2, true);

                                        if (canvasContent) {
                                            // 方法1: ID による判定（最も確実）
                                            const hasMarkdownArtifactId = canvasContent.id === 'markdown-artifact' ||
                                                                         canvasContent.querySelector && canvasContent.querySelector('#markdown-artifact');

                                            // 方法2: Canvas固有のクラスによる判定
                                            const hasFontClaudeResponse = canvasContent.classList &&
                                                                         canvasContent.classList.contains('font-claude-response');

                                            // 方法3: 通常回答の除外（通常回答特有のクラスを持たない）
                                            const isNotNormalResponse = canvasContent.classList &&
                                                                       !canvasContent.classList.contains('standard-markdown') &&
                                                                       !canvasContent.classList.contains('pt-0') &&
                                                                       !canvasContent.classList.contains('pr-8');

                                            // 方法4: Canvas固有のtabindex属性
                                            const hasTabIndex = canvasContent.getAttribute &&
                                                              canvasContent.getAttribute('tabindex') === '0' &&
                                                              canvasContent.id === 'markdown-artifact';

                                            // いずれかの条件を満たせばCanvas内容と判定
                                            if (hasMarkdownArtifactId || hasFontClaudeResponse || hasTabIndex) {
                                                canvasLoaded = true;
                                                const textLength = canvasContent.textContent ? canvasContent.textContent.trim().length : 0;
                                                console.log(`✅ Canvas内容が表示されました（リトライ${retryCount}、${loadWaitCount}秒後）`);
                                                console.log(`   - 判定理由: ${hasMarkdownArtifactId ? 'ID=markdown-artifact' :
                                                                           hasFontClaudeResponse ? 'font-claude-responseクラス' :
                                                                           hasTabIndex ? 'tabindex属性' : '条件一致'}`);
                                                console.log(`   - 要素ID: ${canvasContent.id || '(なし)'}`);
                                                console.log(`   - クラス: ${canvasContent.className ? canvasContent.className.substring(0, 80) : '(なし)'}`);
                                                console.log(`   - テキスト長: ${textLength}文字`);

                                                // Canvas内容を取得して保存（改善版）
                                                if (textLength > 0) {
                                                    // テキストが完全に読み込まれるまで待機
                                                    console.log('⏳ テキスト完全読み込み待機中...');
                                                    let previousLength = textLength;
                                                    let stableCount = 0;
                                                    const maxStableWait = 5; // 5秒間長さが変わらなければ完了

                                                    for (let i = 0; i < maxStableWait; i++) {
                                                        await wait(1000);
                                                        const currentContent = await findClaudeElement(deepResearchSelectors['4_Canvas機能テキスト位置'], 1, true);
                                                        if (currentContent) {
                                                            const currentLength = currentContent.textContent ? currentContent.textContent.trim().length : 0;
                                                            console.log(`    - ${i + 1}秒後: ${currentLength}文字`);

                                                            if (currentLength === previousLength) {
                                                                stableCount++;
                                                                if (stableCount >= 2) {
                                                                    console.log('  ✅ テキスト長が安定しました');
                                                                    canvasContent = currentContent; // 最新の要素に更新
                                                                    break;
                                                                }
                                                            } else {
                                                                stableCount = 0;
                                                                previousLength = currentLength;
                                                            }
                                                        }
                                                    }

                                                    // Canvas検出確認のみ（最終テキストは停止ボタン消滅後に取得）
                                                    const textInfo = getTextPreview(canvasContent);
                                                    if (textInfo && textInfo.full) {
                                                        console.log(`📝 Canvas内容を検出しました（${textInfo.length}文字） - 最終取得は停止ボタン消滅後`);
                                                    } else {
                                                        // フォールバック: 直接取得で確認
                                                        const tempText = canvasContent.innerText || canvasContent.textContent || '';
                                                        console.log(`📝 Canvas内容を検出しました（${tempText.trim().length}文字） - 最終取得は停止ボタン消滅後`);
                                                    }
                                                }
                                                break;
                                            }
                                        }
                                        await wait(1000);
                                        loadWaitCount++;
                                    }

                                    if (canvasLoaded) {
                                        break;
                                    } else if (retryCount < maxRetries - 1) {
                                        console.log(`⚠ Canvas表示待機タイムアウト。再試行します...`);
                                        await wait(1000); // リトライ前の小休止
                                    }
                                }

                                if (!canvasLoaded) {
                                    console.log('❌ Canvas内容の表示に失敗しました（すべてのリトライを使い切りました）');
                                }
                                await wait(1000);
                                // Canvas処理後も停止ボタンの消滅を待機するため、breakせずに続行
                            }
                        }

                        // 停止ボタンの状態をチェック
                        const stopResult = await findClaudeElement(claudeSelectors['3_回答停止ボタン'], 2, true);

                        if (!stopResult) {
                            // 10秒間確認
                            let stillGone = true;
                            for (let confirmCount = 0; confirmCount < 10; confirmCount++) {
                                await wait(1000);
                                const reconfirmResult = await findClaudeElement(claudeSelectors['3_回答停止ボタン'], 2, true);
                                if (reconfirmResult) {
                                    stillGone = false;
                                    console.log(`  停止ボタン再出現（${confirmCount + 1}秒後）`);
                                    break;
                                }
                            }

                            if (stillGone) {
                                stopButtonGone = true;
                                console.log(`✓ 応答生成完了（${waitCount}秒後）`);
                                break;
                            }
                        }

                        await wait(1000);
                        waitCount++;

                        if (waitCount % 10 === 0) {
                            console.log(`  生成中... ${Math.floor(waitCount/60)}分${waitCount%60}秒経過`);
                        }
                    }
                }
            }

            // 応答完了後の追加待機
            await wait(3000);

            // ========================================
            // ステップ7: テキスト取得
            // ========================================
            console.log('\n【Claude-ステップ7】テキスト取得処理');
            console.log('─'.repeat(40));

            // Canvas処理後の最終テキスト取得（応答完了後に再取得）
            console.log(`🔍 最終テキスト取得開始 - 現在のfinalText: ${finalText ? finalText.length + '文字' : 'なし'}`);

            // Canvas機能のテキストを優先的に最終取得
            const deepResearchSelectors = getDeepResearchSelectors();
            const canvasResult = await findClaudeElement(deepResearchSelectors['4_Canvas機能テキスト位置'], 5, true);

            if (canvasResult) {
                console.log('🎨 Canvas機能の最終テキストを取得中...');
                const textInfo = getTextPreview(canvasResult);
                if (textInfo && textInfo.full && textInfo.full.length > 100) {
                    finalText = textInfo.full;
                    console.log(`📄 Canvas 最終テキスト取得完了 (${textInfo.length}文字)`);
                    console.log('プレビュー:\n', textInfo.preview.substring(0, 200) + '...');
                }
            }

            // Canvas以外の処理（既存のロジック）
            if (!finalText) {
                // Canvas機能のテキストを確認
                const deepResearchSelectors = getDeepResearchSelectors();

                // 「続ける」ボタンがあればクリック（Canvas内で続ける操作が必要な場合）
                const continueButton = await findClaudeElement(deepResearchSelectors['4_3_Canvas続けるボタン'], 3, true);
                if (continueButton) {
                    console.log('✓ Canvas「続ける」ボタンを発見、クリック中...');
                    continueButton.click();
                    await wait(2000);

                    // 回答停止ボタンが出現するまで待機
                    console.log('🔄 回答停止ボタンの出現を待機中...');
                    let stopButtonFound = false;
                    let waitCount = 0;
                    const maxWait = 30; // 30秒まで待機

                    while (!stopButtonFound && waitCount < maxWait) {
                        const stopResult = await findClaudeElement(deepResearchSelectors['3_回答停止ボタン'], 2, true);
                        if (stopResult) {
                            stopButtonFound = true;
                            console.log(`✓ 回答停止ボタンが出現（${waitCount}秒後）`);
                            break;
                        }
                        await wait(1000);
                        waitCount++;
                    }

                    // 回答停止ボタンが消滅するまで待機
                    if (stopButtonFound) {
                        console.log('🔄 回答完了まで待機中...');
                        while (waitCount < 600) { // 最大10分待機
                            const stopResult = await findClaudeElement(deepResearchSelectors['3_回答停止ボタン'], 2, true);
                            if (!stopResult) {
                                // 10秒間確認
                                let stillGone = true;
                                for (let confirmCount = 0; confirmCount < 10; confirmCount++) {
                                    await wait(1000);
                                    const reconfirmResult = await findClaudeElement(deepResearchSelectors['3_回答停止ボタン'], 2, true);
                                    if (reconfirmResult) {
                                        stillGone = false;
                                        console.log(`  停止ボタン再出現（${confirmCount + 1}秒後）`);
                                        break;
                                    }
                                }

                                if (stillGone) {
                                    console.log('✓ Canvas回答生成完了');
                                    break;
                                }
                            }
                            await wait(1000);
                            waitCount++;
                        }
                    }

                    await wait(2000); // 追加待機
                }

                // 通常のテキストを確認（Canvasが見つからない場合のフォールバック）
                const normalResult = await findClaudeElement(deepResearchSelectors['5_通常処理テキスト位置'], 3, true);
                if (normalResult) {
                    console.log('✓ 通常処理のテキストを検出');
                    const textInfo = getTextPreview(normalResult);
                    if (textInfo && textInfo.full) {
                        finalText = textInfo.full;
                        console.log(`📄 通常 テキスト取得完了 (${textInfo.length}文字)`);
                        console.log('プレビュー:\n', textInfo.preview.substring(0, 200) + '...');
                    }
                }
            }

            if (!finalText) {
                console.warn('⚠️ テキストが取得できませんでした');
                finalText = 'テキスト取得失敗';
            }

            console.log('\n' + '='.repeat(60));
            console.log('%c✨ Claude V2 タスク完了', 'color: #4CAF50; font-weight: bold; font-size: 16px');
            console.log('='.repeat(60));

            const result = {
                success: true,
                response: finalText,
                text: finalText,
                model: modelName,
                function: featureName
            };

            // タスク完了をログに記録
            ClaudeLogManager.completeTask(result);
            ClaudeLogManager.logStep('Step7-Complete', 'タスク正常完了', {
                responseLength: finalText.length,
                responsePreview: finalText.substring(0, 100) + '...',
                model: modelName,
                function: featureName,
                cellInfo: taskData.cellInfo
            });

            return result;

        } catch (error) {
            console.error('❌ [ClaudeV2] タスク実行エラー:', error.message);
            console.error('スタックトレース:', error.stack);

            const result = {
                success: false,
                error: error.message,
                text: 'エラーが発生しました: ' + error.message
            };

            // エラーをログに記録（詳細情報付き）
            ClaudeLogManager.logError('Task-Error', error, {
                taskData,
                errorMessage: error.message,
                errorStack: error.stack,
                errorName: error.name,
                currentStep: ClaudeLogManager.logs[ClaudeLogManager.logs.length - 1]?.step || 'unknown',
                timestamp: new Date().toISOString(),
                userAgent: navigator.userAgent,
                url: window.location.href
            });
            ClaudeLogManager.completeTask(result);

            return result;
        }
    }

    // ========================================
    // フェーズ別実行関数（個別処理用）
    // ========================================

    async function inputTextOnly(text) {
        console.log('【Phase】テキスト入力のみ実行');

        try {
            const inputResult = await findClaudeElement(claudeSelectors['1_テキスト入力欄']);
            if (!inputResult) {
                throw new Error('テキスト入力欄が見つかりません');
            }

            const success = await inputText(inputResult, text);
            return { success, phase: 'input' };
        } catch (error) {
            console.error('❌ テキスト入力エラー:', error.message);
            return { success: false, phase: 'input', error: error.message };
        }
    }

    async function selectModelOnly(modelName) {
        console.log('【Phase】モデル選択のみ実行');

        try {
            if (!modelName || modelName === '' || modelName === '設定なし') {
                return { success: true, phase: 'model', skipped: true };
            }

            const menuButton = await findElementByMultipleSelectors(modelSelectors.menuButton, 'モデル選択ボタン');
            await triggerReactEvent(menuButton);
            await wait(2000);

            const targetModelName = modelName.startsWith('Claude') ? modelName : `Claude ${modelName}`;

            const menuItems = document.querySelectorAll('[role="menuitem"]');
            for (const item of menuItems) {
                const itemText = item.textContent;
                if (itemText && itemText.includes(targetModelName)) {
                    await triggerReactEvent(item, 'click');
                    await wait(1500);
                    break;
                }
            }

            return { success: true, phase: 'model', selected: targetModelName };
        } catch (error) {
            console.error('❌ モデル選択エラー:', error.message);
            return { success: false, phase: 'model', error: error.message };
        }
    }

    async function selectFunctionOnly(featureName) {
        console.log('【Phase】機能選択のみ実行');

        try {
            if (!featureName || featureName === '' || featureName === '設定なし') {
                return { success: true, phase: 'function', skipped: true };
            }

            const featureMenuBtn = getFeatureElement(featureSelectors.menuButton, '機能メニューボタン');
            if (!featureMenuBtn) {
                throw new Error('機能メニューボタンが見つかりません');
            }

            featureMenuBtn.click();
            await wait(1500);

            // 機能選択前にすべてのトグルをオフにする
            console.log('【Phase】全トグルをオフに設定');
            turnOffAllFeatureToggles();
            await wait(500);

            // 指定の機能を有効にする
            const toggles = document.querySelectorAll('button:has(input[role="switch"])');
            for (const toggle of toggles) {
                const label = toggle.querySelector('p.font-base');
                if (label && label.textContent.trim() === featureName) {
                    setToggleState(toggle, true);
                    await wait(1000);
                    break;
                }
            }

            return { success: true, phase: 'function', selected: featureName };
        } catch (error) {
            console.error('❌ 機能選択エラー:', error.message);
            return { success: false, phase: 'function', error: error.message };
        }
    }

    async function sendAndGetResponse(isDeepResearch = false) {
        console.log('【Phase】送信と応答取得実行');

        try {
            // 送信
            const sendResult = await findClaudeElement(claudeSelectors['2_送信ボタン']);
            if (!sendResult) {
                throw new Error('送信ボタンが見つかりません');
            }

            await clickButton(sendResult, '送信ボタン');
            await wait(2000);

            // 応答待機
            if (isDeepResearch) {
                await handleDeepResearchWait();
            } else {
                // 通常の応答待機処理
                let stopButtonFound = false;
                let waitCount = 0;
                const maxWait = AI_WAIT_CONFIG.MAX_WAIT / 1000;

                while (!stopButtonFound && waitCount < maxWait) {
                    const stopResult = await findClaudeElement(claudeSelectors['3_回答停止ボタン'], 2, true);
                    if (stopResult) {
                        stopButtonFound = true;
                        break;
                    }
                    await wait(1000);
                    waitCount++;
                }

                // 停止ボタンが消えるまで待機
                if (stopButtonFound) {
                    while (waitCount < maxWait) {
                        const stopResult = await findClaudeElement(claudeSelectors['3_回答停止ボタン'], 2, true);
                        if (!stopResult) break;
                        await wait(1000);
                        waitCount++;
                    }
                }
            }

            // テキスト取得
            await wait(3000);
            let finalText = '';

            const deepResearchSelectors = getDeepResearchSelectors();
            const canvasResult = await findClaudeElement(deepResearchSelectors['4_Canvas機能テキスト位置'], 3, true);

            if (canvasResult) {
                const textInfo = getTextPreview(canvasResult);
                if (textInfo) finalText = textInfo.full;
            }

            if (!finalText) {
                const normalResult = await findClaudeElement(deepResearchSelectors['5_通常処理テキスト位置'], 3, true);
                if (normalResult) {
                    const textInfo = getTextPreview(normalResult);
                    if (textInfo) finalText = textInfo.full;
                }
            }

            return { success: true, phase: 'send', text: finalText };

        } catch (error) {
            console.error('❌ [ClaudeV2] 送信・応答取得エラー:', error.message);
            return { success: false, error: error.message };
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
    // Chrome Runtime Message Handler
    // ========================================
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.type === 'CLAUDE_EXECUTE_TASK') {
            console.log('📨 [ClaudeAutomation] タスク実行リクエスト受信:', request.taskData);

            // 非同期処理のため、即座にtrueを返してチャネルを開いておく
            executeTask(request.taskData).then(result => {
                console.log('✅ [ClaudeAutomation] タスク実行完了:', result);
                sendResponse({ success: true, result });
            }).catch(error => {
                console.error('❌ [ClaudeAutomation] タスク実行エラー:', error);
                sendResponse({ success: false, error: error.message });
            });

            return true; // 非同期レスポンスのためチャネルを保持
        }

        if (request.type === 'CLAUDE_CHECK_READY') {
            // スクリプトの準備状態を確認
            sendResponse({
                ready: true,
                initTime: Date.now(),
                methods: ['executeTask', 'runAutomation', 'inputTextOnly', 'selectModelOnly', 'selectFunctionOnly', 'sendAndGetResponse']
            });
            return false;
        }
    });

    // 初期化完了マーカーを設定（ai-task-executorが期待する名前を使用）
    window.CLAUDE_SCRIPT_LOADED = true;
    window.CLAUDE_SCRIPT_INIT_TIME = Date.now();

    console.log('✅ Claude Automation V2 準備完了（メッセージベース通信）');
    console.log('使用方法: Chrome Runtime Message経由でタスクを実行');

    // ========================================
    // ウィンドウ終了時のログ保存処理
    // ========================================
    window.addEventListener('beforeunload', async (event) => {
        console.log('🔄 [ClaudeAutomation] ウィンドウ終了検知 - ログ保存開始');

        try {
            // ログをファイルに保存
            const fileName = await ClaudeLogManager.saveToFile();
            if (fileName) {
                console.log(`✅ [ClaudeAutomation] ログ保存完了: ${fileName}`);
            }
        } catch (error) {
            console.error('[ClaudeAutomation] ログ保存エラー:', error);
        }
    });

    // グローバルにログマネージャーを公開（デバッグ用）
    window.ClaudeLogManager = ClaudeLogManager;

})();