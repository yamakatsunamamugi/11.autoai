/**
 * @fileoverview AI自動化共通ユーティリティ
 * 
 * 【役割】
 * AIに依存しない汎用的なユーティリティ関数を提供
 * 
 * 【主要機能】
 * - wait: 待機処理
 * - findElement: 要素検索（複数セレクタ対応）
 * - performClick: クリック実行
 * - inputText: テキスト入力
 * - isElementVisible/Enabled: 要素状態チェック
 * - log/debugLog: ログ出力
 * 
 * 【使用者】
 * - common-ai-handler.js: 一部の関数を使用（現在は重複実装あり）
 * - 各AI個別ファイル: 必要に応じて使用
 * 
 * 【グローバル公開】
 * window.CommonUtils: コンソールから直接呼び出し可能
 */
(() => {
    "use strict";

    // ========================================
    // 共通設定
    // ========================================
    const CONFIG = {
        DELAYS: {
            elementSearch: 100,    // 要素検索の間隔
            click: 50,            // クリック後の待機
            textInput: 500,       // テキスト入力後の待機
            betweenActions: 1000  // アクション間の待機
        },
        TIMEOUTS: {
            elementSearch: 3000,  // 要素検索のタイムアウト
            menuWait: 5000       // メニュー表示待機
        }
    };

    // ========================================
    // ログ関数
    // ========================================
    const log = (message, type = 'INFO', aiName = 'Common') => {
        const prefix = {
            'INFO': '📝',
            'SUCCESS': '✅',
            'ERROR': '❌',
            'WARNING': '⚠️',
            'DEBUG': '🔍'
        }[type] || '📝';
        console.log(`${prefix} [${aiName}] ${message}`);
    };

    const debugLog = (message, aiName = 'Common') => {
        if (window.DEBUG_MODE) {
            console.log(`🔍 [${aiName}:Debug] ${message}`);
        }
    };

    // ========================================
    // 待機処理
    // ========================================
    const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    // ========================================
    // 要素検索関数
    // ========================================
    const findElement = async (selectors, condition = null, maxWait = CONFIG.TIMEOUTS.elementSearch) => {
        if (!selectors || (Array.isArray(selectors) && selectors.length === 0)) {
            log('セレクタが指定されていません', 'ERROR');
            return null;
        }

        // 配列でない場合は配列に変換
        const selectorArray = Array.isArray(selectors) ? selectors : [selectors];
        const startTime = Date.now();
        
        debugLog(`要素を検索中: ${selectorArray.join(', ')}`);
        
        while (Date.now() - startTime < maxWait) {
            for (const selector of selectorArray) {
                try {
                    const elements = document.querySelectorAll(selector);
                    for (const element of elements) {
                        // 要素が表示されているかチェック
                        if (element && element.offsetParent !== null) {
                            // 追加条件がある場合はチェック
                            if (!condition || condition(element)) {
                                debugLog(`要素発見: ${selector}`);
                                return element;
                            }
                        }
                    }
                } catch (e) {
                    // セレクタエラーは無視
                    debugLog(`セレクタエラー: ${selector} - ${e.message}`);
                }
            }
            await wait(CONFIG.DELAYS.elementSearch);
        }
        
        debugLog(`要素が見つかりませんでした (${maxWait}ms経過)`);
        return null;
    };

    // ========================================
    // 複数要素検索関数
    // ========================================
    const findElements = async (selectors, maxWait = CONFIG.TIMEOUTS.elementSearch) => {
        if (!selectors || (Array.isArray(selectors) && selectors.length === 0)) {
            log('セレクタが指定されていません', 'ERROR');
            return [];
        }

        const selectorArray = Array.isArray(selectors) ? selectors : [selectors];
        const startTime = Date.now();
        const foundElements = [];
        
        while (Date.now() - startTime < maxWait && foundElements.length === 0) {
            for (const selector of selectorArray) {
                try {
                    const elements = document.querySelectorAll(selector);
                    for (const element of elements) {
                        if (element && element.offsetParent !== null) {
                            foundElements.push(element);
                        }
                    }
                } catch (e) {
                    // エラーは無視
                }
            }
            
            if (foundElements.length === 0) {
                await wait(CONFIG.DELAYS.elementSearch);
            }
        }
        
        return foundElements;
    };

    // ========================================
    // クリック処理
    // ========================================
    const performClick = async (element) => {
        if (!element) {
            log('クリック対象の要素がnullです', 'ERROR');
            return false;
        }

        try {
            debugLog(`要素をクリック: ${element.tagName}${element.className ? '.' + element.className : ''}`);
            
            // 要素が表示されていることを確認
            if (element.offsetParent === null) {
                log('要素が非表示です', 'WARNING');
                return false;
            }

            // 要素の位置を取得
            const rect = element.getBoundingClientRect();
            const x = rect.left + rect.width / 2;
            const y = rect.top + rect.height / 2;

            // PointerEventでクリックをシミュレート
            element.dispatchEvent(new PointerEvent('pointerdown', {
                bubbles: true,
                cancelable: true,
                view: window,
                clientX: x,
                clientY: y,
                pointerId: 1
            }));

            await wait(CONFIG.DELAYS.click);

            element.dispatchEvent(new PointerEvent('pointerup', {
                bubbles: true,
                cancelable: true,
                view: window,
                clientX: x,
                clientY: y,
                pointerId: 1
            }));

            // 通常のクリックも実行
            element.click();
            
            await wait(CONFIG.DELAYS.click);
            debugLog('クリック成功');
            return true;
            
        } catch (error) {
            log(`クリックエラー: ${error.message}`, 'ERROR');
            return false;
        }
    };

    // ========================================
    // テキスト入力処理
    // ========================================
    const inputText = async (element, text) => {
        if (!element) {
            log('入力対象の要素がnullです', 'ERROR');
            return false;
        }

        if (!text) {
            log('入力するテキストが空です', 'WARNING');
            return false;
        }

        try {
            element.focus();
            await wait(CONFIG.DELAYS.textInput);

            // contentEditableの場合
            if (element.contentEditable === 'true') {
                element.textContent = text;
                element.dispatchEvent(new Event('input', { bubbles: true }));
                debugLog('contentEditableへの入力完了');
            }
            // TEXTAREA/INPUTの場合
            else if (element.tagName === 'TEXTAREA' || element.tagName === 'INPUT') {
                element.value = text;
                element.dispatchEvent(new Event('input', { bubbles: true }));
                debugLog('TEXTAREA/INPUTへの入力完了');
            }
            // ProseMirrorの場合
            else if (element.classList?.contains('ProseMirror')) {
                element.innerHTML = `<p>${text}</p>`;
                element.dispatchEvent(new Event('input', { bubbles: true }));
                debugLog('ProseMirrorへの入力完了');
            }
            // その他の場合
            else {
                element.textContent = text;
                element.dispatchEvent(new Event('input', { bubbles: true }));
                debugLog('その他要素への入力完了');
            }

            await wait(CONFIG.DELAYS.textInput);
            return true;

        } catch (error) {
            log(`テキスト入力エラー: ${error.message}`, 'ERROR');
            return false;
        }
    };

    // ========================================
    // メニュー操作
    // ========================================
    const waitForMenu = async (menuSelectors = null, maxWait = CONFIG.TIMEOUTS.menuWait) => {
        const defaultSelectors = [
            '[role="menu"][data-state="open"]',
            '[role="menu"]',
            '.menu-container',
            '[class*="menu"]',
            '[class*="dropdown"]'
        ];
        
        const selectors = menuSelectors || defaultSelectors;
        return await findElement(selectors, null, maxWait);
    };

    const closeMenu = async () => {
        // Escapeキーでメニューを閉じる
        document.body.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Escape',
            code: 'Escape',
            bubbles: true
        }));
        await wait(CONFIG.DELAYS.betweenActions);
    };

    // ========================================
    // 要素の状態チェック
    // ========================================
    const isElementVisible = (element) => {
        if (!element) return false;
        return element.offsetParent !== null;
    };

    const isElementEnabled = (element) => {
        if (!element) return false;
        return !element.disabled && !element.hasAttribute('disabled');
    };

    const waitForElementToDisappear = async (selector, maxWait = 60000) => {
        const startTime = Date.now();
        
        while (Date.now() - startTime < maxWait) {
            const element = document.querySelector(selector);
            if (!element || !isElementVisible(element)) {
                return true;
            }
            await wait(1000);
        }
        
        return false;
    };

    // ========================================
    // グローバル公開
    // ========================================
    window.AICommonUtils = {
        // 設定
        CONFIG,
        
        // 基本関数
        log,
        debugLog,
        wait,
        
        // 要素操作
        findElement,
        findElements,
        performClick,
        inputText,
        
        // メニュー操作
        waitForMenu,
        closeMenu,
        
        // 状態チェック
        isElementVisible,
        isElementEnabled,
        waitForElementToDisappear
    };

    log('AI共通ユーティリティが利用可能になりました', 'SUCCESS');
    return window.AICommonUtils;
})();