/**
 * @fileoverview AI Selector Testing System - セレクタ動作テストシステム
 * @description AI サイト（ChatGPT、Claude、Gemini）のセレクタが実際に動作するかをテストするシステム
 * @version 2.0.0
 * @updated 2025-01-15 セレクタテストシステムとして完全書き換え
 *
 * 【システム概要】
 * 3つのAIサイトでセレクタの動作を検証：
 * 1. 静的テスト: 要素の存在確認
 * 2. 動的テスト: 実際の操作テスト（入力→送信→停止ボタン確認）
 * 3. メニューテスト: モデル・機能メニューの開閉テスト
 *
 * 【ウィンドウ配置】
 * - ChatGPT: 左上
 * - Claude: 右上
 * - Gemini: 左下
 */

// ========================================
// Step 1: 初期化とユーティリティ関数
// ========================================

console.log('[セレクタテスト] AI Selector Testing システム初期化開始');

// デバッグモード
const DEBUG_MODE = true;

function debugLog(message, data = null) {
    if (DEBUG_MODE) {
        console.log(`[セレクタテスト-Debug] ${message}`, data || '');
    }
}

// 待機関数
function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// システム状態管理
let isTestSystemRunning = false;
let currentTestSession = null;

// ========================================
// Step 2: セレクタテスト用のヘルパー関数
// ========================================

/**
 * 要素が存在し、操作可能かチェック
 */
function isElementInteractable(element) {
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return rect.width > 0 &&
           rect.height > 0 &&
           style.display !== 'none' &&
           style.visibility !== 'hidden' &&
           style.opacity !== '0';
}

/**
 * 複数セレクタで要素検索
 */
function findElement(selectors, description = '') {
    for (const selector of selectors) {
        try {
            let element;

            if (selector.includes(':contains(')) {
                const match = selector.match(/:contains\("([^"]+)"\)/);
                if (match) {
                    const text = match[1];
                    const baseSelector = selector.split(':contains(')[0];
                    const elements = document.querySelectorAll(baseSelector || '*');
                    element = Array.from(elements).find(el =>
                        el.textContent && el.textContent.includes(text)
                    );
                }
            } else {
                element = document.querySelector(selector);
            }

            if (element && isElementInteractable(element)) {
                if (description) {
                    console.log(`✅ ${description}発見: ${selector}`);
                }
                return element;
            }
        } catch (e) {
            // セレクタエラーを無視
        }
    }
    if (description) {
        console.log(`❌ ${description}が見つかりません`);
    }
    return null;
}

/**
 * テキスト入力（自動化ファイルのパターンを使用）
 */
function inputText(element, text) {
    if (!element) return false;

    try {
        if (element.classList.contains('ProseMirror') || element.classList.contains('ql-editor')) {
            // ChatGPT用ProseMirrorエディタ
            element.innerHTML = '';
            const p = document.createElement('p');
            p.textContent = text;
            element.appendChild(p);
            element.classList.remove('ql-blank');
            element.dispatchEvent(new Event('input', { bubbles: true }));
        } else if (element.tagName === 'TEXTAREA' || element.tagName === 'INPUT') {
            // 通常の入力フィールド
            element.value = text;
            element.dispatchEvent(new Event('input', { bubbles: true }));
        } else {
            // contenteditable要素
            element.textContent = text;
            element.dispatchEvent(new Event('input', { bubbles: true }));
        }
        return true;
    } catch (error) {
        console.error('テキスト入力エラー:', error);
        return false;
    }
}

// ========================================
// Step 3: メインエントリーポイント
// ========================================

/**
 * セレクタテストシステムの開始/停止を切り替える
 * @param {HTMLElement} button - ボタン要素
 * @param {Function} updateStatus - ステータス更新関数
 */
export async function toggleMutationObserverMonitoring(button, updateStatus) {
    try {
        console.log('[セレクタテスト] システム制御開始');

        // ボタンのテキストを確認して状態を判定
        const isCurrentlyActive = button.textContent.includes('停止');

        if (isCurrentlyActive) {
            // 停止処理
            updateStatus('AIセレクタテストを停止中...');
            button.textContent = 'AI Selector変更検出システム開始';
            button.classList.remove('monitoring');
            isTestSystemRunning = false;
            currentTestSession = null;
            console.log('[セレクタテスト] システム停止完了');
        } else {
            // 開始処理
            updateStatus('AIセレクタテストを開始中...');
            button.textContent = 'AI Selector変更検出システム停止';
            button.classList.add('monitoring');

            // セレクタテストシステムを実行
            const success = await runAISelectorValidationSystem(updateStatus);

            if (success) {
                console.log('[セレクタテスト] システム開始完了');
                isTestSystemRunning = true;
            } else {
                // エラー時は元に戻す
                button.textContent = 'AI Selector変更検出システム開始';
                button.classList.remove('monitoring');
            }
        }
    } catch (error) {
        console.error('[セレクタテスト-Error] システム制御エラー:', error);
        updateStatus('システムエラーが発生しました');

        // エラー時は安全な状態に戻す
        button.textContent = 'AI Selector変更検出システム開始';
        button.classList.remove('monitoring');
        isTestSystemRunning = false;
        currentTestSession = null;
    }
}

// ========================================
// Step 4: セレクタテストシステムの実装
// ========================================

/**
 * AIセレクタテストシステムを実行
 * 各AIサイトでセレクタが実際に動作するかテスト
 */
async function runAISelectorValidationSystem(updateStatus) {
    try {
        updateStatus('AIセレクタテストシステム実行中...');
        console.log('[セレクタテスト] テストシステム開始');

        // セッション情報を記録
        currentTestSession = {
            startTime: new Date().toISOString(),
            mode: 'selector_validation',
            sites: ['ChatGPT', 'Claude', 'Gemini']
        };

        // Step 1: ウィンドウ配置とサイト開始
        await setupTestWindows(updateStatus);

        // Step 2: 各サイトでセレクタテスト実行
        const results = await executeAllSelectorTests(updateStatus);

        // Step 3: 結果表示
        displayTestResults(results, updateStatus);

        updateStatus('AIセレクタテスト完了');
        console.log('[セレクタテスト] テストシステム完了');

        return true;
    } catch (error) {
        console.error('[セレクタテスト-Error] システムエラー:', error);
        updateStatus('セレクタテストエラー');
        return false;
    }
}

/**
 * Step 1: テスト用ウィンドウの配置
 */
async function setupTestWindows(updateStatus) {
    console.log('[セレクタテスト-Step1] ウィンドウ配置開始');
    updateStatus('ウィンドウを配置中...');

    const sites = [
        { name: 'ChatGPT', url: 'https://chatgpt.com/', position: 'left-top' },
        { name: 'Claude', url: 'https://claude.ai/', position: 'right-top' },
        { name: 'Gemini', url: 'https://gemini.google.com/', position: 'left-bottom' }
    ];

    const screenWidth = screen.availWidth;
    const screenHeight = screen.availHeight;
    const halfWidth = Math.floor(screenWidth / 2);
    const halfHeight = Math.floor(screenHeight / 2);

    const positions = {
        'left-top': { left: 0, top: 0, width: halfWidth, height: halfHeight },
        'right-top': { left: halfWidth, top: 0, width: halfWidth, height: halfHeight },
        'left-bottom': { left: 0, top: halfHeight, width: halfWidth, height: halfHeight }
    };

    for (const site of sites) {
        const pos = positions[site.position];
        console.log(`[セレクタテスト-Step1] ${site.name}ウィンドウを${site.position}に配置`);

        try {
            // Chrome Windows APIを使用してウィンドウを直接作成
            const windowObj = await chrome.windows.create({
                url: site.url,
                left: pos.left,
                top: pos.top,
                width: pos.width,
                height: pos.height,
                type: 'normal'
            });
            console.log(`✅ ${site.name}ウィンドウ作成完了 (ID: ${windowObj.id})`);
        } catch (error) {
            console.error(`❌ ${site.name}ウィンドウ作成エラー:`, error);
        }
    }

    // ページ読み込み待機
    console.log('[セレクタテスト-Step1] ページ読み込み待機（10秒）');
    await wait(10000);
}

/**
 * Step 2: 全サイトでセレクタテスト実行
 */
async function executeAllSelectorTests(updateStatus) {
    console.log('[セレクタテスト-Step2] 全サイトテスト開始');

    const results = {};
    const sites = ['ChatGPT', 'Claude', 'Gemini'];

    for (const siteName of sites) {
        try {
            results[siteName] = await testSiteSelectors(siteName, updateStatus);
        } catch (error) {
            console.error(`[セレクタテスト-${siteName}] エラー:`, error);
            results[siteName] = { error: error.message };
        }
    }

    return results;
}

/**
 * 各サイトのセレクタテスト
 */
async function testSiteSelectors(siteName, updateStatus) {
    console.log(`[セレクタテスト-${siteName}] テスト開始`);
    updateStatus(`${siteName}のセレクタテスト中...`);

    // ui-selectors-data.json から該当サイトのセレクタを取得
    let siteSelectors = {};
    try {
        // セレクタファイルを動的に読み込み
        const response = await fetch(chrome.runtime.getURL('ui-selectors-data.json'));
        const selectorsData = await response.json();
        siteSelectors = selectorsData.selectors?.[siteName] || {};
        console.log(`[セレクタテスト-${siteName}] セレクタファイルから取得:`, Object.keys(siteSelectors));
    } catch (error) {
        console.error(`[セレクタテスト-${siteName}] セレクタファイル読み込みエラー:`, error);
        // フォールバック: グローバルオブジェクトを使用
        siteSelectors = window.UI_SELECTORS?.[siteName] || {};
    }

    const testResults = {
        site: siteName,
        staticTests: {},
        dynamicTests: {},
        menuTests: {}
    };

    try {
        // Chrome拡張APIを使用してテストを実行
        const tabInfo = await chrome.tabs.query({
            url: siteName === 'ChatGPT' ? 'https://chatgpt.com/*' :
                 siteName === 'Claude' ? 'https://claude.ai/*' :
                 'https://gemini.google.com/*'
        });

        if (tabInfo && tabInfo.length > 0) {
            const tabId = tabInfo[0].id;

            // Static Tests: 基本要素の存在確認
            testResults.staticTests = await performStaticTestsInTab(tabId, siteName, siteSelectors);

            // Dynamic Tests: 実際の操作テスト
            testResults.dynamicTests = await performDynamicTestsInTab(tabId, siteName, siteSelectors);

            // Menu Tests: メニュー操作テスト
            testResults.menuTests = await performMenuTestsInTab(tabId, siteName, siteSelectors);
        } else {
            console.log(`[${siteName}] タブが見つかりません`);
        }

    } catch (error) {
        console.error(`[${siteName}] テストエラー:`, error);
        testResults.error = error.message;
    }

    return testResults;
}

/**
 * 静的テスト: 基本セレクタの存在確認
 */
async function performStaticTestsInTab(tabId, siteName, selectors) {
    const staticResults = {};

    try {
        const result = await chrome.scripting.executeScript({
            target: { tabId },
            func: function(selectors, siteName) {
                // 静的テスト: 常に表示されている基本要素のみテスト
                const testTargets = [
                    { key: 'INPUT', name: 'テキスト入力欄' },
                    { key: 'MODEL_BUTTON', name: 'モデルボタン' },
                    { key: 'FUNCTION_MENU_BUTTON', name: '機能メニューボタン' }
                ];

                const results = {};

                for (const target of testTargets) {
                    const selectorArray = selectors[target.key] || [];
                    let element = null;

                    for (const selector of selectorArray) {
                        try {
                            element = document.querySelector(selector);
                            if (element) {
                                const rect = element.getBoundingClientRect();
                                const style = window.getComputedStyle(element);
                                const isVisible = rect.width > 0 && rect.height > 0 &&
                                                style.display !== 'none' && style.visibility !== 'hidden';
                                if (isVisible) break;
                            }
                        } catch (e) {
                            continue;
                        }
                    }

                    results[target.key] = {
                        exists: !!element,
                        selector: element ? 'found' : 'not found',
                        selectors: selectorArray
                    };

                    console.log(`[${siteName}-Static] ${target.name}: ${element ? '✅' : '❌'}`);
                }

                return results;
            },
            args: [selectors, siteName]
        });

        return result[0].result;
    } catch (error) {
        console.error(`[${siteName}-Static] エラー:`, error);
        return {};
    }
}

/**
 * 動的テスト: 実際の操作フロー
 */
async function performDynamicTestsInTab(tabId, siteName, selectors) {
    try {
        const result = await chrome.scripting.executeScript({
            target: { tabId },
            func: function(selectors, siteName) {
                const dynamicResults = {
                    textInput: false,
                    sendButtonEnabled: false,  // テキスト入力後にボタンが有効化されたか
                    sendClick: false,
                    stopButtonAppears: false
                };

                return new Promise(async (resolve) => {
                    try {
                        // 待機関数
                        const wait = (ms) => new Promise(r => setTimeout(r, ms));

                        // 1. テキスト入力テスト
                        const inputSelectors = selectors.INPUT || [];
                        let inputElement = null;

                        for (const selector of inputSelectors) {
                            try {
                                inputElement = document.querySelector(selector);
                                if (inputElement) break;
                            } catch (e) {
                                continue;
                            }
                        }

                        if (inputElement) {
                            const testText = `${siteName}セレクタテスト用メッセージ`;
                            try {
                                // 共通処理関数を使用したテキスト入力（自動化ファイルのロジック）
                                inputElement.focus();
                                await wait(100);

                                if (inputElement.classList.contains('ProseMirror') || inputElement.classList.contains('ql-editor')) {
                                    // ProseMirrorエディタ用の処理
                                    inputElement.innerHTML = '';
                                    const p = document.createElement('p');
                                    p.textContent = testText;
                                    inputElement.appendChild(p);
                                    inputElement.dispatchEvent(new Event('input', { bubbles: true }));
                                } else if (inputElement.tagName === 'TEXTAREA' || inputElement.tagName === 'INPUT') {
                                    // 通常のテキストエリア/入力フィールド用
                                    inputElement.value = testText;
                                    inputElement.dispatchEvent(new Event('input', { bubbles: true }));
                                    inputElement.dispatchEvent(new Event('change', { bubbles: true }));
                                } else {
                                    // contenteditable要素用
                                    inputElement.textContent = testText;
                                    inputElement.dispatchEvent(new Event('input', { bubbles: true }));
                                }

                                // React環境での値変更イベント発火
                                const inputEvent = new Event('input', { bubbles: true });
                                const changeEvent = new Event('change', { bubbles: true });
                                inputElement.dispatchEvent(inputEvent);
                                inputElement.dispatchEvent(changeEvent);

                                dynamicResults.textInput = true;
                                console.log(`[${siteName}-Dynamic] テキスト入力: ✅ (共通処理関数使用)`);
                            } catch (e) {
                                console.log(`[${siteName}-Dynamic] テキスト入力エラー:`, e);
                            }

                            await wait(1000);
                        }

                        // 2. 送信ボタンテスト（テキスト入力後に有効化されるかテスト）
                        if (dynamicResults.textInput) {
                            const sendSelectors = selectors.SEND_BUTTON || [];
                            let sendButton = null;

                            // テキスト入力後、送信ボタンが有効になるまで少し待機
                            await wait(500);

                            // 送信ボタンを検索（テキスト入力後に有効化されたもの）
                            for (const selector of sendSelectors) {
                                try {
                                    const btn = document.querySelector(selector);
                                    if (btn && !btn.disabled && btn.getAttribute('aria-disabled') !== 'true') {
                                        sendButton = btn;
                                        break;
                                    }
                                } catch (e) {
                                    continue;
                                }
                            }

                            console.log(`[${siteName}-Dynamic] 送信ボタン検索結果:`, sendButton ? '有効なボタン発見' : 'ボタンが見つからないか無効');

                            if (sendButton) {
                                // 送信ボタンが有効化されたことを記録
                                dynamicResults.sendButtonEnabled = true;
                                console.log(`[${siteName}-Dynamic] 送信ボタン有効化: ✅`);

                                try {
                                    // 共通処理関数ロジック: ボタンクリック前の確認
                                    if (sendButton.disabled || sendButton.getAttribute('aria-disabled') === 'true') {
                                        console.log(`[${siteName}-Dynamic] 送信ボタンが無効状態`);
                                    } else {
                                        // PointerEventを使用したクリック（自動化ファイルのロジック）
                                        const clickEvent = new PointerEvent('click', {
                                            bubbles: true,
                                            cancelable: true,
                                            pointerId: 1,
                                            pointerType: 'mouse'
                                        });
                                        sendButton.dispatchEvent(clickEvent);

                                        dynamicResults.sendClick = true;
                                        console.log(`[${siteName}-Dynamic] 送信クリック: ✅ (共通処理関数使用)`);
                                        await wait(3000); // 停止ボタン出現まで少し長めに待機

                                        // 3. 停止ボタン出現確認（複数セレクタで検索）
                                        const stopSelectors = selectors.STOP_BUTTON || [];
                                        let stopFound = false;

                                        for (let retry = 0; retry < 5 && !stopFound; retry++) {
                                            for (const selector of stopSelectors) {
                                                try {
                                                    const stopButton = document.querySelector(selector);
                                                    if (stopButton && stopButton.offsetParent !== null) { // 表示確認
                                                        dynamicResults.stopButtonAppears = true;
                                                        console.log(`[${siteName}-Dynamic] 停止ボタン出現: ✅ (セレクタ: ${selector})`);

                                                        // 停止ボタンもPointerEventでクリック
                                                        const stopClickEvent = new PointerEvent('click', {
                                                            bubbles: true,
                                                            cancelable: true,
                                                            pointerId: 1,
                                                            pointerType: 'mouse'
                                                        });
                                                        stopButton.dispatchEvent(stopClickEvent);
                                                        stopFound = true;
                                                        break;
                                                    }
                                                } catch (e) {
                                                    continue;
                                                }
                                            }
                                            if (!stopFound) await wait(1000); // 1秒待機して再確認
                                        }

                                        if (!stopFound) {
                                            console.log(`[${siteName}-Dynamic] 停止ボタンが見つかりませんでした`);
                                        }
                                    }
                                } catch (e) {
                                    console.log(`[${siteName}-Dynamic] 送信エラー:`, e);
                                }
                            }
                        }

                        resolve(dynamicResults);
                    } catch (error) {
                        console.error(`[${siteName}-Dynamic] エラー:`, error);
                        resolve(dynamicResults);
                    }
                });
            },
            args: [selectors, siteName]
        });

        return result[0].result;
    } catch (error) {
        console.error(`[${siteName}-Dynamic] エラー:`, error);
        return {};
    }
}

/**
 * メニューテスト: モデル・機能選択メニュー
 */
async function performMenuTestsInTab(tabId, siteName, selectors) {
    try {
        const result = await chrome.scripting.executeScript({
            target: { tabId },
            func: function(selectors, siteName) {
                const menuResults = {
                    modelMenuOpen: false,
                    functionMenuOpen: false
                };

                return new Promise(async (resolve) => {
                    try {
                        const wait = (ms) => new Promise(r => setTimeout(r, ms));

                        // モデルメニューテスト
                        const modelButtonSelectors = selectors.MODEL_BUTTON || [];
                        let modelButton = null;

                        for (const selector of modelButtonSelectors) {
                            try {
                                modelButton = document.querySelector(selector);
                                if (modelButton) break;
                            } catch (e) {
                                continue;
                            }
                        }

                        if (modelButton) {
                            try {
                                modelButton.click();
                                await wait(1000);

                                const menuSelectors = selectors.MENU?.CONTAINER || [];
                                for (const selector of menuSelectors) {
                                    try {
                                        const menu = document.querySelector(selector);
                                        if (menu) {
                                            menuResults.modelMenuOpen = true;
                                            console.log(`[${siteName}-Menu] モデルメニュー開閉: ✅`);
                                            break;
                                        }
                                    } catch (e) {
                                        continue;
                                    }
                                }

                                // ESCでメニューを閉じる
                                document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
                                await wait(500);
                            } catch (e) {
                                console.log(`[${siteName}-Menu] モデルメニューエラー:`, e);
                            }
                        }

                        // 機能メニューテスト
                        const functionButtonSelectors = selectors.FUNCTION_MENU_BUTTON || [];
                        let functionButton = null;

                        for (const selector of functionButtonSelectors) {
                            try {
                                functionButton = document.querySelector(selector);
                                if (functionButton) break;
                            } catch (e) {
                                continue;
                            }
                        }

                        if (functionButton) {
                            try {
                                functionButton.click();
                                await wait(1000);

                                const menuSelectors = selectors.MENU?.CONTAINER || [];
                                for (const selector of menuSelectors) {
                                    try {
                                        const menu = document.querySelector(selector);
                                        if (menu) {
                                            menuResults.functionMenuOpen = true;
                                            console.log(`[${siteName}-Menu] 機能メニュー開閉: ✅`);
                                            break;
                                        }
                                    } catch (e) {
                                        continue;
                                    }
                                }

                                // ESCでメニューを閉じる
                                document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
                                await wait(500);
                            } catch (e) {
                                console.log(`[${siteName}-Menu] 機能メニューエラー:`, e);
                            }
                        }

                        resolve(menuResults);
                    } catch (error) {
                        console.error(`[${siteName}-Menu] エラー:`, error);
                        resolve(menuResults);
                    }
                });
            },
            args: [selectors, siteName]
        });

        return result[0].result;
    } catch (error) {
        console.error(`[${siteName}-Menu] エラー:`, error);
        return {};
    }
}

/**
 * Step 3: テスト結果の表示
 */
function displayTestResults(results, updateStatus) {
    console.log('[セレクタテスト-Step3] 結果表示');

    let summary = 'セレクタテスト結果:\n';

    for (const [site, result] of Object.entries(results)) {
        summary += `\n【${site}】\n`;

        if (result.error) {
            summary += `  ❌ エラー: ${result.error}\n`;
            continue;
        }

        // Static Tests結果
        summary += '  静的テスト:\n';
        for (const [key, test] of Object.entries(result.staticTests)) {
            summary += `    ${key}: ${test.exists ? '✅' : '❌'}\n`;
        }

        // Dynamic Tests結果
        summary += '  動的テスト:\n';
        summary += `    テキスト入力: ${result.dynamicTests.textInput ? '✅' : '❌'}\n`;
        summary += `    送信ボタン: ${result.dynamicTests.sendClick ? '✅' : '❌'}\n`;
        summary += `    停止ボタン出現: ${result.dynamicTests.stopButtonAppears ? '✅' : '❌'}\n`;

        // Menu Tests結果
        summary += '  メニューテスト:\n';
        summary += `    モデルメニュー: ${result.menuTests.modelMenuOpen ? '✅' : '❌'}\n`;
        summary += `    機能メニュー: ${result.menuTests.functionMenuOpen ? '✅' : '❌'}\n`;
    }

    console.log(summary);
    updateStatus('テスト完了 - コンソールで詳細結果を確認');
}

console.log('[セレクタテスト] AI Selector Testing システム初期化完了');