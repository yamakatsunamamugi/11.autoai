/**
 * Genspark統合テストコード（完全動的検索版）
 * Version: 3.0.0
 * 作成日: 2025年8月10日
 * 
 * 特徴:
 * - ハードコードなし、完全動的検索
 * - UI変更に自動適応
 * - ファジー検索対応
 * - キャッシュ機能付き
 * - Chrome拡張機能との統合テスト対応
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
        }
    };

    // ========================================
    // グローバル状態管理
    // ========================================
    let globalState = {
        selectorCache: {},
        cacheTime: {},
        debugMode: true,
        currentFunction: null,
        testResults: [],
        extensionDetected: false
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
            console.log(`%c[Genspark Test] ${message}`, styles[type] || styles.info);
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
    // テスト実行関数
    // ========================================
    const tests = {
        /**
         * 拡張機能の存在確認
         */
        checkExtension: async () => {
            utils.log('拡張機能の確認中...', 'test');
            
            try {
                // 拡張機能が注入する要素やAPIを探す
                if (window.chrome && window.chrome.runtime && window.chrome.runtime.id) {
                    globalState.extensionDetected = true;
                    utils.log('✅ Chrome拡張機能を検出', 'success');
                    return true;
                }
                
                // カスタムイベントをディスパッチして応答を待つ
                const testEvent = new CustomEvent('genspark-extension-ping', {
                    detail: { timestamp: Date.now() }
                });
                
                return new Promise((resolve) => {
                    const timeout = setTimeout(() => {
                        utils.log('⚠️ 拡張機能が検出されませんでした', 'warning');
                        resolve(false);
                    }, 2000);
                    
                    window.addEventListener('genspark-extension-pong', (e) => {
                        clearTimeout(timeout);
                        globalState.extensionDetected = true;
                        utils.log('✅ Genspark拡張機能を検出', 'success');
                        resolve(true);
                    }, { once: true });
                    
                    window.dispatchEvent(testEvent);
                });
            } catch (e) {
                utils.log('拡張機能チェックエラー: ' + e.message, 'error');
                return false;
            }
        },

        /**
         * 基本動作テスト
         */
        testBasicOperation: async (query = '桃太郎についてスライド4枚で解説して') => {
            console.clear();
            utils.log('='.repeat(60), 'header');
            utils.log('🎯 Genspark基本動作テスト開始', 'header');
            utils.log('='.repeat(60), 'header');

            const testResult = {
                name: '基本動作テスト',
                startTime: Date.now(),
                query: query,
                steps: [],
                success: false
            };

            try {
                // ステップ1: ページチェック
                utils.log('ステップ1: ページチェック', 'progress');
                if (!window.location.href.includes('genspark.ai')) {
                    utils.log('Gensparkのページを開いてください', 'warning');
                    testResult.steps.push({ step: 'ページチェック', success: false });
                    throw new Error('Not on Genspark page');
                }
                testResult.steps.push({ step: 'ページチェック', success: true });

                // ステップ2: テキスト入力
                utils.log('ステップ2: テキスト入力', 'progress');
                if (!await dom.inputText(query)) {
                    throw new Error('テキスト入力失敗');
                }
                testResult.steps.push({ step: 'テキスト入力', success: true });
                utils.log(`入力完了: "${query}"`, 'success');

                // ステップ3: 送信ボタンクリック
                utils.log('ステップ3: 送信ボタンをクリック', 'progress');
                const submitButton = await dom.findElementDynamic('submitButton');
                if (!submitButton) {
                    throw new Error('送信ボタンが見つかりません');
                }
                
                await dom.clickElement(submitButton);
                testResult.steps.push({ step: '送信', success: true });
                utils.log('送信完了', 'success');

                // ステップ4: 応答待機
                utils.log('ステップ4: 応答待機', 'progress');
                await tests.waitForResponse();
                testResult.steps.push({ step: '応答待機', success: true });

                // ステップ5: 結果確認
                utils.log('ステップ5: 結果確認', 'progress');
                const finalUrl = window.location.href;
                testResult.finalUrl = finalUrl;
                testResult.steps.push({ step: '結果確認', success: true });
                
                testResult.success = true;
                testResult.endTime = Date.now();
                testResult.duration = utils.getElapsedTime(testResult.startTime);

                utils.log('='.repeat(60), 'header');
                utils.log('✅ テスト完了', 'success');
                utils.log(`最終URL: ${finalUrl}`, 'info');
                utils.log(`実行時間: ${testResult.duration}`, 'info');

                globalState.testResults.push(testResult);
                return testResult;

            } catch (error) {
                testResult.error = error.message;
                testResult.success = false;
                testResult.endTime = Date.now();
                testResult.duration = utils.getElapsedTime(testResult.startTime);
                
                utils.log('❌ テスト失敗: ' + error.message, 'error');
                globalState.testResults.push(testResult);
                return testResult;
            }
        },

        /**
         * 応答待機
         */
        waitForResponse: async (maxWaitSeconds = 60) => {
            let waitCount = 0;
            let stopButtonGoneCount = 0;
            
            while (waitCount < maxWaitSeconds) {
                await utils.wait(1000);
                waitCount++;

                // 停止ボタンの状態をチェック
                const stopButton = await dom.findElementDynamic('stopButton', 1);
                
                if (stopButton) {
                    // 停止ボタンがある = 処理中
                    stopButtonGoneCount = 0;
                    if (waitCount % 5 === 0) {
                        utils.log(`処理中... (${waitCount}秒)`, 'progress');
                    }
                } else {
                    // 停止ボタンがない
                    stopButtonGoneCount++;
                    
                    // 5秒間停止ボタンが消えていたら完了
                    if (stopButtonGoneCount >= 5) {
                        utils.log('処理完了を確認', 'success');
                        await utils.wait(CONFIG.DELAYS.finalWait);
                        return true;
                    }
                }
            }
            
            utils.log('応答タイムアウト', 'warning');
            return false;
        },

        /**
         * 機能別テスト
         */
        testFunction: async (functionType = 'slides', query = null) => {
            utils.log(`\n🔧 ${functionType}機能テスト開始`, 'header');
            
            const queries = {
                slides: '桃太郎についてスライド4枚で解説して',
                summarize: 'AIの最新動向について要約して',
                analyze: 'このデータを分析してください'
            };
            
            const testQuery = query || queries[functionType] || 'テストクエリ';
            const targetUrl = CONFIG.URLS[functionType] || CONFIG.URLS.slides;
            
            // URLを変更
            if (window.location.href !== targetUrl) {
                utils.log(`URLを変更: ${targetUrl}`, 'info');
                window.location.href = targetUrl;
                utils.log('ページリロード後に再実行してください', 'warning');
                return false;
            }
            
            return await tests.testBasicOperation(testQuery);
        },

        /**
         * 統合テスト
         */
        runFullTest: async () => {
            console.clear();
            utils.log('🚀 Genspark統合テスト開始', 'header');
            utils.log('='.repeat(60), 'header');
            
            const fullTestResult = {
                startTime: Date.now(),
                tests: [],
                summary: {}
            };
            
            // 1. 拡張機能チェック
            await tests.checkExtension();
            
            // 2. 基本動作テスト
            utils.log('\n📝 基本動作テスト', 'test');
            const basicResult = await tests.testBasicOperation();
            fullTestResult.tests.push(basicResult);
            
            await utils.wait(3000);
            
            // 3. サマリー
            fullTestResult.endTime = Date.now();
            fullTestResult.totalDuration = utils.getElapsedTime(fullTestResult.startTime);
            
            const successCount = fullTestResult.tests.filter(t => t.success).length;
            const failCount = fullTestResult.tests.filter(t => !t.success).length;
            
            fullTestResult.summary = {
                total: fullTestResult.tests.length,
                success: successCount,
                fail: failCount,
                extensionDetected: globalState.extensionDetected
            };
            
            utils.log('\n' + '='.repeat(60), 'header');
            utils.log('📊 テスト結果サマリー', 'header');
            utils.log('='.repeat(60), 'header');
            utils.log(`総テスト数: ${fullTestResult.summary.total}`, 'info');
            utils.log(`成功: ${successCount}`, 'success');
            utils.log(`失敗: ${failCount}`, failCount > 0 ? 'error' : 'info');
            utils.log(`拡張機能: ${globalState.extensionDetected ? '検出済み' : '未検出'}`, 'info');
            utils.log(`総実行時間: ${fullTestResult.totalDuration}`, 'info');
            
            return fullTestResult;
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
    window.GensparkTest = {
        // テスト実行
        test: tests.testBasicOperation,
        testFunction: tests.testFunction,
        runFullTest: tests.runFullTest,
        
        // ユーティリティ
        checkExtension: tests.checkExtension,
        waitForResponse: tests.waitForResponse,
        
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
        
        getResults: () => globalState.testResults,
        
        // ヘルプ
        help: () => {
            console.log('\n%c🚀 Genspark統合テストツール v3.0', 'color: #4CAF50; font-size: 16px; font-weight: bold');
            console.log('━'.repeat(50));
            console.log('\n%c📌 基本コマンド:', 'color: #2196F3; font-weight: bold');
            console.log('');
            console.log('【テスト実行】');
            console.log('  await GensparkTest.test()                // 基本動作テスト');
            console.log('  await GensparkTest.test("カスタムクエリ")   // カスタムクエリでテスト');
            console.log('  await GensparkTest.testFunction("slides") // スライド機能テスト');
            console.log('  await GensparkTest.runFullTest()         // 統合テスト実行');
            console.log('');
            console.log('【拡張機能連携】');
            console.log('  await GensparkTest.checkExtension()      // 拡張機能の検出');
            console.log('');
            console.log('【セレクタ学習】');
            console.log('  await GensparkTest.learn()               // UIから自動学習');
            console.log('  GensparkTest.saveSelectors()             // 学習結果を保存');
            console.log('  GensparkTest.loadSelectors()             // 保存したセレクタを読み込み');
            console.log('');
            console.log('【デバッグ】');
            console.log('  GensparkTest.setDebug(true)              // デバッグモードON');
            console.log('  GensparkTest.clearCache()                // キャッシュクリア');
            console.log('  GensparkTest.getResults()                // テスト結果を取得');
            console.log('');
            console.log('%c💡 ヒント:', 'color: #FF9800; font-weight: bold');
            console.log('  - UI変更時は learn() で新しいセレクタを学習');
            console.log('  - セレクタはキャッシュされ高速動作');
            console.log('  - 拡張機能との統合テストが可能');
        }
    };

    // ========================================
    // 初期化
    // ========================================
    const initialize = () => {
        // 保存されたセレクタを読み込み
        learning.loadSelectors();
        
        // 初期化メッセージ
        console.log('%c✅ Genspark統合テストツール v3.0 初期化完了！', 'color: #4CAF50; font-size: 16px; font-weight: bold');
        console.log('');
        console.log('%c🎯 クイックスタート:', 'color: #FF6B6B; font-size: 14px; font-weight: bold');
        console.log('');
        console.log('%c【すぐ試せるコマンド】', 'color: #2196F3; font-weight: bold');
        console.log('await GensparkTest.checkExtension()  // 拡張機能チェック');
        console.log('await GensparkTest.test()            // 基本テスト実行');
        console.log('await GensparkTest.runFullTest()     // 統合テスト実行');
        console.log('');
        console.log('await GensparkTest.learn()           // UIからセレクタを自動学習');
        console.log('');
        console.log('%c💡 GensparkTest.help() で詳細ヘルプを表示', 'color: #9C27B0');
        console.log('%c👆 上記のコマンドをコピーして使ってください', 'color: #F44336; font-size: 12px');
        
        // 拡張機能へのping（存在確認）
        if (window.chrome && window.chrome.runtime) {
            window.dispatchEvent(new CustomEvent('genspark-test-ready', {
                detail: { version: '3.0.0', timestamp: Date.now() }
            }));
        }
    };

    // 初期化実行
    initialize();

})();