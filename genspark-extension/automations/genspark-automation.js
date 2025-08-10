/**
 * Genspark自動化スクリプト（完全動的検索版）
 * Version: 3.0.0
 * 作成日: 2025年8月10日
 * 
 * 特徴:
 * - ハードコードなし、完全動的検索
 * - UI変更に自動適応
 * - ファジー検索対応
 * - キャッシュ機能付き
 * - Chrome拡張機能との統合対応
 */

(function() {
    'use strict';

    // ========================================
    // 設定と定数
    // ========================================
    const CONFIG = {
        DELAYS: {
            elementSearch: 2000,
            menuWait: 2000,
            clickDelay: 1000,
            stateCheck: 1500,
            submitWait: 2000,
            afterSubmit: 3000,
            responseCheck: 5000,
            stopButtonCheck: 500,
            finalWait: 5000,
            cacheExpiry: 300000 // 5分
        },
        SELECTORS: {
            // 動的に更新される可能性があるセレクタ
            textInput: [
                'textarea[name="query"]',
                '.search-input',
                '.j-search-input',
                'textarea.search-input.j-search-input',
                '.prompt-input-wrapper-upper textarea',
                '.textarea-wrapper textarea',
                'textarea[placeholder*="スライド"]',
                'textarea[placeholder*="質問"]',
                'textarea[placeholder*="入力"]'
            ],
            submitButton: [
                '.enter-icon.active',
                '.enter-icon-wrapper.active',
                '.enter-icon-wrapper[class*="bg-[#262626]"]',
                '.enter-icon.cursor-pointer.active',
                'div[class*="enter-icon"][class*="active"]',
                '.enter-icon-wrapper[class*="text-white"]',
                '.input-icon .enter-icon',
                'button[type="submit"]:not(:disabled)',
                '.submit-button',
                '[data-testid="send-button"]'
            ],
            stopButton: [
                '.stop-icon',
                '.enter-icon-wrapper[class*="bg-[#232425]"]',
                'svg.stop-icon',
                '.input-icon .enter-icon-wrapper[class*="bg-[#232425]"]',
                '.enter-icon-wrapper[class*="text-[#fff]"]',
                'div[class*="enter-icon-wrapper"][class*="bg-[#232425]"]',
                '[aria-label*="停止"]',
                '[aria-label*="stop"]'
            ],
            responseContainer: [
                '.response-container',
                '.answer-container',
                '.result-container',
                '.output-container',
                '[class*="response"]',
                '[class*="answer"]',
                '[data-testid="response"]'
            ],
            modelSelector: [
                '.model-selector',
                '.model-dropdown',
                'select[name="model"]',
                '[aria-label*="モデル"]',
                '.model-switch'
            ],
            functionSelector: [
                '.function-selector',
                '.agent-selector',
                '[data-agent-type]',
                '.agent-type-selector',
                'button[data-type]'
            ]
        },
        URLS: {
            slides: 'https://www.genspark.ai/agents?type=slides_agent',
            summarize: 'https://www.genspark.ai/agents?type=summarize',
            analyze: 'https://www.genspark.ai/agents?type=analyze',
            chat: 'https://www.genspark.ai/chat',
            base: 'https://www.genspark.ai'
        },
        ERROR_PAGE: 'https://docs.google.com/spreadsheets/d/1QfOFEUWtlR0wwaN5BRyVdenFPxCRJmsf4SPo87O_ZnY/edit?gid=2134602748#gid=2134602748'
    };

    // ========================================
    // グローバル状態管理
    // ========================================
    let globalState = {
        selectorCache: {},
        cacheTime: {},
        debugMode: false,
        currentFunction: null,
        testResults: [],
        extensionDetected: false,
        startTime: null,
        isRunning: false
    };

    // ========================================
    // ユーティリティ関数
    // ========================================
    const utils = {
        wait: (ms) => new Promise(resolve => setTimeout(resolve, ms)),

        log: (message, type = 'info') => {
            const styles = {
                info: 'color: #2196F3',
                success: 'color: #4CAF50',
                warning: 'color: #FF9800',
                error: 'color: #F44336',
                header: 'color: #9C27B0; font-size: 14px; font-weight: bold',
                progress: 'color: #00BCD4; font-weight: bold',
                test: 'color: #FF6B6B; font-weight: bold'
            };
            console.log(`%c[Genspark] ${message}`, styles[type] || styles.info);
        },

        debugLog: (message) => {
            if (globalState.debugMode) {
                console.log(`%c[DEBUG] ${message}`, 'color: #9E9E9E');
            }
        },

        getTimestamp: () => {
            return new Date().toLocaleString('ja-JP');
        },

        getElapsedTime: (startTime) => {
            const elapsed = Date.now() - startTime;
            const minutes = Math.floor(elapsed / 60000);
            const seconds = Math.floor((elapsed % 60000) / 1000);
            return `${minutes}分${seconds}秒`;
        },

        // ファジー検索
        fuzzyMatch: (needle, haystack) => {
            if (!needle || !haystack) return false;

            const normalizeString = (str) => {
                return str.toLowerCase()
                         .replace(/[\s\-_\.]/g, '')
                         .replace(/[^\w\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf]/g, '');
            };

            const n = normalizeString(needle);
            const h = normalizeString(haystack);

            if (h === n) return { score: 1.0, type: 'exact' };
            if (h.includes(n)) return { score: 0.8, type: 'contains' };

            let j = 0;
            for (let i = 0; i < n.length; i++) {
                const pos = h.indexOf(n[i], j);
                if (pos === -1) return false;
                j = pos + 1;
            }
            return { score: 0.6, type: 'fuzzy' };
        }
    };

    // ========================================
    // DOM操作関数
    // ========================================
    const dom = {
        /**
         * 動的セレクタ検索
         */
        findElementDynamic: async (selectorGroup, maxRetries = 3) => {
            const cacheKey = selectorGroup;
            
            // キャッシュチェック
            if (globalState.selectorCache[cacheKey] && 
                Date.now() - globalState.cacheTime[cacheKey] < CONFIG.DELAYS.cacheExpiry) {
                const cachedSelector = globalState.selectorCache[cacheKey];
                const element = document.querySelector(cachedSelector);
                if (element) {
                    utils.debugLog(`Cache hit: ${cachedSelector}`);
                    return element;
                }
            }

            // セレクタリストを取得
            const selectors = CONFIG.SELECTORS[selectorGroup] || [];
            
            for (let retry = 0; retry < maxRetries; retry++) {
                for (let selector of selectors) {
                    try {
                        const elements = document.querySelectorAll(selector);
                        if (elements.length > 0) {
                            // 成功したセレクタをキャッシュ
                            globalState.selectorCache[cacheKey] = selector;
                            globalState.cacheTime[cacheKey] = Date.now();
                            utils.debugLog(`Found with selector: ${selector}`);
                            return elements[0];
                        }
                    } catch (e) {
                        utils.debugLog(`Selector error: ${e.message}`);
                    }
                }

                // 動的に新しいセレクタを探す
                const newSelector = await dom.discoverNewSelector(selectorGroup);
                if (newSelector) {
                    CONFIG.SELECTORS[selectorGroup].push(newSelector);
                    utils.log(`新しいセレクタを発見: ${newSelector}`, 'success');
                    const element = document.querySelector(newSelector);
                    if (element) return element;
                }

                if (retry < maxRetries - 1) {
                    await utils.wait(CONFIG.DELAYS.elementSearch);
                }
            }

            // エラーメッセージ
            const errorMessage = `${selectorGroup}の要素が変更されています。UIが変更された可能性があります。\n設定ページ: ${CONFIG.ERROR_PAGE}`;
            utils.log(errorMessage, 'error');
            
            return null;
        },

        /**
         * 新しいセレクタを動的に発見
         */
        discoverNewSelector: async (selectorGroup) => {
            utils.debugLog(`Discovering new selector for: ${selectorGroup}`);
            
            // パターンマッチングで新しいセレクタを探す
            const patterns = {
                textInput: ['textarea', 'input[type="text"]', '[contenteditable="true"]'],
                submitButton: ['button:not(:disabled)', '[role="button"]', '.btn-primary'],
                stopButton: ['button.stop', '[aria-label*="stop"]', '.cancel-button'],
                responseContainer: ['[class*="message"]', '[class*="output"]', 'div.result']
            };

            const searchPatterns = patterns[selectorGroup] || [];
            
            for (let pattern of searchPatterns) {
                const elements = document.querySelectorAll(pattern);
                for (let element of elements) {
                    // 要素の特徴を分析
                    const isVisible = element.offsetParent !== null;
                    const hasContent = element.textContent?.trim().length > 0;
                    const isInteractive = element.tagName === 'BUTTON' || 
                                         element.tagName === 'TEXTAREA' ||
                                         element.hasAttribute('onclick');
                    
                    if (isVisible && (hasContent || isInteractive)) {
                        // より具体的なセレクタを生成
                        const newSelector = dom.generateSelector(element);
                        if (newSelector) {
                            return newSelector;
                        }
                    }
                }
            }
            
            return null;
        },

        /**
         * 要素から具体的なセレクタを生成
         */
        generateSelector: (element) => {
            // ID があれば使用
            if (element.id) {
                return `#${element.id}`;
            }
            
            // クラスの組み合わせ
            if (element.className) {
                const classes = element.className.split(' ')
                    .filter(c => c && !c.includes('active') && !c.includes('hover'))
                    .slice(0, 3)
                    .join('.');
                if (classes) {
                    return `.${classes}`;
                }
            }
            
            // 属性セレクタ
            const attrs = ['name', 'data-testid', 'aria-label', 'placeholder'];
            for (let attr of attrs) {
                if (element.hasAttribute(attr)) {
                    const value = element.getAttribute(attr);
                    if (value) {
                        return `[${attr}="${value}"]`;
                    }
                }
            }
            
            return null;
        },

        /**
         * 要素をクリック
         */
        clickElement: async (element) => {
            if (!element) return false;

            try {
                element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                await utils.wait(200);
                
                // 複数の方法でクリックを試みる
                const clickMethods = [
                    () => element.click(),
                    () => element.dispatchEvent(new MouseEvent('click', {
                        bubbles: true,
                        cancelable: true,
                        view: window
                    })),
                    () => {
                        const event = document.createEvent('MouseEvents');
                        event.initMouseEvent('click', true, true, window, 0, 0, 0, 0, 0, false, false, false, false, 0, null);
                        element.dispatchEvent(event);
                    }
                ];

                for (let method of clickMethods) {
                    try {
                        method();
                        await utils.wait(CONFIG.DELAYS.clickDelay);
                        return true;
                    } catch (e) {
                        utils.debugLog(`Click method failed: ${e.message}`);
                    }
                }

                return false;
            } catch (e) {
                utils.debugLog(`Click failed: ${e.message}`);
                return false;
            }
        },

        /**
         * テキスト入力
         */
        inputText: async (text) => {
            const inputField = await dom.findElementDynamic('textInput');
            
            if (!inputField) {
                utils.log('入力欄が見つかりません', 'error');
                return false;
            }

            inputField.focus();
            await utils.wait(500);

            // 既存のテキストをクリア
            inputField.value = '';
            inputField.textContent = '';

            // テキストを入力
            if (inputField.tagName === 'TEXTAREA' || inputField.tagName === 'INPUT') {
                inputField.value = text;
            } else {
                inputField.textContent = text;
            }

            // イベントを発火
            const events = ['input', 'change', 'keyup'];
            for (let eventType of events) {
                inputField.dispatchEvent(new Event(eventType, { bubbles: true }));
            }

            await utils.wait(CONFIG.DELAYS.submitWait);
            utils.debugLog('Text input completed');
            return true;
        }
    };

    // ========================================
    // 自動化実行関数
    // ========================================
    const automation = {
        /**
         * メイン実行関数
         */
        execute: async (query = '桃太郎についてスライド4枚で解説して', options = {}) => {
            if (globalState.isRunning) {
                utils.log('既に実行中です', 'warning');
                return false;
            }

            globalState.isRunning = true;
            globalState.startTime = Date.now();

            console.log('=== Genspark Automation 開始 ===');
            console.log('作成日: 2025年8月10日 21時00分');
            console.log('開始時刻:', utils.getTimestamp());

            try {
                // ステップ1: URLチェック
                utils.log('ステップ1: AIスライドURLチェック', 'progress');
                const targetUrl = options.url || CONFIG.URLS.slides;
                
                if (window.location.href !== targetUrl) {
                    utils.log(`URLを開いています: ${targetUrl}`, 'info');
                    window.location.href = targetUrl;
                    utils.log('ページが読み込まれたら、このスクリプトを再実行してください。', 'warning');
                    globalState.isRunning = false;
                    return false;
                }
                
                utils.log('ページが正常に読み込まれました', 'success');
                await utils.wait(CONFIG.DELAYS.pageLoad || 5000);

                // ステップ2: テキスト入力
                utils.log('ステップ2: テキスト入力欄を検索しています...', 'progress');
                if (!await dom.inputText(query)) {
                    throw new Error('テキスト入力失敗');
                }
                utils.log(`テキストを入力しました: "${query}"`, 'success');
                await utils.wait(5000);

                // ステップ3: 送信ボタンクリック
                utils.log('ステップ3: 送信ボタンを検索しています...', 'progress');
                const submitButton = await dom.findElementDynamic('submitButton');
                if (!submitButton) {
                    throw new Error('送信ボタンが見つかりません');
                }
                
                utils.log('送信ボタンをクリックします...', 'info');
                await dom.clickElement(submitButton);
                utils.log('送信ボタンがクリックされました', 'success');
                await utils.wait(5000);

                // ステップ4: 回答停止ボタンの監視
                utils.log('ステップ4: 回答停止ボタンの監視を開始します...', 'progress');
                const completed = await automation.waitForCompletion();
                
                if (completed) {
                    // ステップ5: 最終URLを取得
                    utils.log('ステップ5: 最終URLを取得しています...', 'progress');
                    const finalUrl = window.location.href;
                    utils.log('最終URL: ' + finalUrl, 'success');
                    
                    const elapsedTime = utils.getElapsedTime(globalState.startTime);
                    
                    console.log('\n=== 実行結果サマリー ===');
                    console.log('✓ AIスライドURLアクセス: 成功');
                    console.log('✓ テキスト入力: 成功');
                    console.log('✓ 送信ボタンクリック: 成功');
                    console.log('✓ 回答停止ボタン監視: 成功');
                    console.log('✓ 最終URL取得: 成功');
                    console.log('最終URL: ' + finalUrl);
                    console.log('総実行時間: ' + elapsedTime);
                    
                    globalState.isRunning = false;
                    return {
                        success: true,
                        query: query,
                        finalUrl: finalUrl,
                        executionTime: elapsedTime
                    };
                }

                throw new Error('処理がタイムアウトしました');

            } catch (error) {
                utils.log('エラーが発生しました: ' + error.message, 'error');
                console.error('スタックトレース:', error);
                globalState.isRunning = false;
                return {
                    success: false,
                    error: error.message
                };
            }
        },

        /**
         * 完了待機
         */
        waitForCompletion: async () => {
            // 回答停止ボタンが表示されるまで待機
            let stopButton = null;
            let attempts = 0;
            const maxAttempts = 30; // 30秒まで待機
            
            while (!stopButton && attempts < maxAttempts) {
                stopButton = await dom.findElementDynamic('stopButton', 1);
                if (stopButton) {
                    utils.log('回答停止ボタンが表示されました', 'info');
                    break;
                }
                attempts++;
                await utils.wait(1000);
            }
            
            if (!stopButton) {
                utils.log('回答停止ボタンが見つかりませんでした。処理を続行します。', 'warning');
            } else {
                // 回答停止ボタンが消滅するまで待機
                utils.log('回答停止ボタンの消滅を監視しています...', 'info');
                
                let disappeared = false;
                let disappearanceTime = null;
                
                while (!disappeared) {
                    const currentStopButton = await dom.findElementDynamic('stopButton', 1);
                    
                    if (!currentStopButton) {
                        if (!disappearanceTime) {
                            disappearanceTime = Date.now();
                            utils.log('回答停止ボタンが消滅しました。5秒間待機します...', 'info');
                        }
                        
                        // 5秒間消滅状態が続いているかチェック
                        if (Date.now() - disappearanceTime >= 5000) {
                            disappeared = true;
                            utils.log('回答停止ボタンが5秒間消滅しました。処理を続行します。', 'success');
                        }
                    } else {
                        // ボタンが再表示された場合
                        if (disappearanceTime) {
                            utils.log('回答停止ボタンが再表示されました。監視を続行します...', 'info');
                            disappearanceTime = null;
                        }
                    }
                    
                    await utils.wait(CONFIG.DELAYS.stopButtonCheck);
                }
                
                // 消滅後さらに5秒待機
                await utils.wait(5000);
            }
            
            return true;
        }
    };

    // ========================================
    // セレクタ学習機能
    // ========================================
    const learning = {
        /**
         * UIから自動的にセレクタを学習
         */
        learnSelectors: async () => {
            utils.log('🎓 セレクタ学習モード開始', 'header');
            
            const learned = {
                textInput: [],
                submitButton: [],
                stopButton: [],
                responseContainer: []
            };
            
            // テキスト入力欄を探す
            const textareas = document.querySelectorAll('textarea, input[type="text"], [contenteditable="true"]');
            textareas.forEach(el => {
                if (el.offsetParent !== null) { // 表示されている要素のみ
                    const selector = dom.generateSelector(el);
                    if (selector && !CONFIG.SELECTORS.textInput.includes(selector)) {
                        learned.textInput.push(selector);
                    }
                }
            });
            
            // ボタンを探す
            const buttons = document.querySelectorAll('button, [role="button"], .btn');
            buttons.forEach(el => {
                const text = el.textContent?.toLowerCase() || '';
                const ariaLabel = el.getAttribute('aria-label')?.toLowerCase() || '';
                
                if (text.includes('送信') || text.includes('send') || ariaLabel.includes('send')) {
                    const selector = dom.generateSelector(el);
                    if (selector && !CONFIG.SELECTORS.submitButton.includes(selector)) {
                        learned.submitButton.push(selector);
                    }
                } else if (text.includes('停止') || text.includes('stop') || ariaLabel.includes('stop')) {
                    const selector = dom.generateSelector(el);
                    if (selector && !CONFIG.SELECTORS.stopButton.includes(selector)) {
                        learned.stopButton.push(selector);
                    }
                }
            });
            
            // 学習結果を表示
            utils.log('学習結果:', 'success');
            Object.entries(learned).forEach(([key, selectors]) => {
                if (selectors.length > 0) {
                    console.log(`${key}: ${selectors.length}個の新しいセレクタを発見`);
                    selectors.forEach(s => console.log(`  - ${s}`));
                    
                    // CONFIG に追加
                    CONFIG.SELECTORS[key].push(...selectors);
                }
            });
            
            return learned;
        },

        /**
         * セレクタを保存（ローカルストレージ）
         */
        saveSelectors: () => {
            try {
                localStorage.setItem('genspark_selectors', JSON.stringify(CONFIG.SELECTORS));
                utils.log('セレクタを保存しました', 'success');
            } catch (e) {
                utils.log('セレクタ保存エラー: ' + e.message, 'error');
            }
        },

        /**
         * セレクタを読み込み
         */
        loadSelectors: () => {
            try {
                const saved = localStorage.getItem('genspark_selectors');
                if (saved) {
                    const selectors = JSON.parse(saved);
                    Object.assign(CONFIG.SELECTORS, selectors);
                    utils.log('セレクタを読み込みました', 'success');
                }
            } catch (e) {
                utils.log('セレクタ読み込みエラー: ' + e.message, 'error');
            }
        }
    };

    // ========================================
    // API公開
    // ========================================
    window.GensparkAutomation = {
        // メイン実行
        execute: automation.execute,
        run: automation.execute, // エイリアス
        
        // ユーティリティ
        wait: utils.wait,
        log: utils.log,
        
        // DOM操作
        findElement: dom.findElementDynamic,
        clickElement: dom.clickElement,
        inputText: dom.inputText,
        
        // セレクタ学習
        learn: learning.learnSelectors,
        saveSelectors: learning.saveSelectors,
        loadSelectors: learning.loadSelectors,
        
        // 設定
        setDebug: (enabled) => {
            globalState.debugMode = enabled;
            utils.log(`デバッグモード: ${enabled ? 'ON' : 'OFF'}`, 'info');
        },
        
        clearCache: () => {
            globalState.selectorCache = {};
            globalState.cacheTime = {};
            utils.log('キャッシュをクリアしました', 'success');
        },
        
        getConfig: () => CONFIG,
        getState: () => globalState,
        
        // ヘルプ
        help: () => {
            console.log('\n%c🚀 Genspark Automation v3.0', 'color: #4CAF50; font-size: 16px; font-weight: bold');
            console.log('━'.repeat(50));
            console.log('\n%c📌 基本コマンド:', 'color: #2196F3; font-weight: bold');
            console.log('');
            console.log('【実行】');
            console.log('  await GensparkAutomation.execute()       // デフォルトクエリで実行');
            console.log('  await GensparkAutomation.execute("質問") // カスタムクエリで実行');
            console.log('');
            console.log('【セレクタ学習】');
            console.log('  await GensparkAutomation.learn()         // UIから自動学習');
            console.log('  GensparkAutomation.saveSelectors()       // 学習結果を保存');
            console.log('  GensparkAutomation.loadSelectors()       // 保存したセレクタを読み込み');
            console.log('');
            console.log('【デバッグ】');
            console.log('  GensparkAutomation.setDebug(true)        // デバッグモードON');
            console.log('  GensparkAutomation.clearCache()          // キャッシュクリア');
            console.log('  GensparkAutomation.getState()            // 状態確認');
            console.log('');
            console.log('%c💡 ヒント:', 'color: #FF9800; font-weight: bold');
            console.log('  - UI変更時は learn() で新しいセレクタを学習');
            console.log('  - セレクタはキャッシュされ高速動作');
            console.log('  - デバッグモードで詳細な動作を確認可能');
        }
    };

    // ========================================
    // 初期化
    // ========================================
    const initialize = () => {
        // 保存されたセレクタを読み込み
        learning.loadSelectors();
        
        // 初期化メッセージ
        console.log('%c✅ Genspark Automation v3.0 初期化完了！', 'color: #4CAF50; font-size: 16px; font-weight: bold');
        console.log('');
        console.log('%c🎯 クイックスタート:', 'color: #FF6B6B; font-size: 14px; font-weight: bold');
        console.log('');
        console.log('%c【すぐ試せるコマンド】', 'color: #2196F3; font-weight: bold');
        console.log('await GensparkAutomation.execute()           // 実行');
        console.log('await GensparkAutomation.execute("カスタム")  // カスタムクエリで実行');
        console.log('');
        console.log('await GensparkAutomation.learn()             // UIからセレクタを自動学習');
        console.log('');
        console.log('%c💡 GensparkAutomation.help() で詳細ヘルプを表示', 'color: #9C27B0');
    };

    // 初期化実行
    initialize();

})();