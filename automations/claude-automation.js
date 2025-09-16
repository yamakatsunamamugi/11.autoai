/**
 * =====================================================================
 * Claude V2 自動化ワークフロー - 7ステップ実行（リトライ機能付き）
 * =====================================================================
 *
 * 【概要】
 * Claude.aiのブラウザ自動化を行う統合システム
 * テスト済みのロジックをベースとした安定した自動化処理
 * 各ステップでエラー発生時はウィンドウ再作成によるリトライを実行
 *
 * 【7ステップワークフロー】
 * ステップ0: セレクタ・ユーティリティ初期化
 * ステップ1: タスクデータ受信・ログ出力
 * ステップ2: パラメータ準備（モデル名・機能名・プロンプト）
 * ステップ3: Deep Research判定
 * ステップ4: テキスト入力（常に実行）
 * ステップ5: モデル選択（条件: modelName && modelName !== ''）
 * ステップ6: 機能選択（条件: featureName && featureName !== ''）
 * ステップ7: メッセージ送信・応答待機（常に実行）
 *
 * 【重要】ステップ5・6がスキップされる原因:
 * - taskData.model が空文字列 '' の場合 → モデル選択スキップ
 * - taskData.function が空文字列 '' の場合 → 機能選択スキップ
 *
 * @fileoverview Claude Automation V2 - 7ステップワークフロー版
 * @version 2.4.0
 * @author AI Automation System
 * =====================================================================
 */
(async function() {
    'use strict';

    console.log('Claude V2 自動化ワークフロー - 初期化開始');

    // ===== Claude専用セレクタ定義（内蔵版） =====
    const CLAUDE_SELECTORS = {
        INPUT: [
            "[aria-label=\"クロードにプロンプトを入力してください\"]",
            ".ProseMirror[contenteditable=\"true\"]",
            "[role=\"textbox\"][contenteditable=\"true\"]",
            "div[contenteditable=\"true\"][translate=\"no\"]",
            ".ProseMirror",
            "div[enterkeyhint=\"enter\"][role=\"textbox\"]"
        ],
        SEND_BUTTON: [
            "[aria-label=\"メッセージを送信\"]",
            "button[aria-label=\"メッセージを送信\"]",
            "[data-state=\"closed\"] button[type=\"button\"]",
            "button.bg-accent-main-000",
            "button svg path[d*=\"M208.49,120.49\"]"
        ],
        STOP_BUTTON: [
            "[aria-label=\"応答を停止\"]",
            "button[aria-label=\"応答を停止\"]",
            "[data-state=\"closed\"][aria-label=\"応答を停止\"]",
            "button.border-border-200[aria-label=\"応答を停止\"]",
            "button svg path[d*=\"M128,20A108\"]"
        ],
        MODEL_BUTTON: [
            "button[data-testid=\"model-selector-dropdown\"]",
            "button[aria-haspopup=\"menu\"]",
            "#radix-_r_g_",
            "button.inline-flex.items-center.justify-center",
            "button:has(svg.claude-logo-model-selector)",
            "[data-testid=\"model-selector-dropdown\"]",
            ".claude-logo-model-selector",
            "button[type=\"button\"][aria-haspopup=\"menu\"]",
            "button[data-value*=\"claude\"]",
            "button.cursor-pointer:has(span.font-medium)",
            "button[aria-label*=\"モデル\"]",
            "button[aria-label*=\"Model\"]",
            "[aria-label=\"モデルを選択\"]",
            "[data-testid=\"model-selector\"]"
        ],
        FUNCTION_MENU_BUTTON: [
            "[data-testid=\"input-menu-tools\"]",
            "[aria-label=\"ツールメニューを開く\"]",
            "#input-tools-menu-trigger",
            "button[aria-expanded][aria-haspopup=\"listbox\"]",
            "button svg path[d*=\"M40,88H73a32\"]"
        ],
        FEATURE_BUTTONS: {
            DEEP_THINKING: [
                "button[type=\"button\"][aria-pressed=\"true\"]:has(svg path[d*=\"M10.3857 2.50977\"])",
                "button[aria-pressed=\"true\"]:has(svg path[d*=\"M10.3857\"])",
                "button.text-accent-secondary-100[aria-pressed=\"true\"]"
            ],
            RESEARCH: [
                "button[aria-pressed]:has(svg path[d*=\"M8.5 2C12.0899\"])",
                "button:has(p:contains(\"リサーチ\"))",
                "button.text-accent-secondary-100:has(svg)",
                "button[type=\"button\"]:has(.min-w-0.pl-1.text-xs)",
                ".flex.shrink button:has(svg)",
                "button[type=\"button\"][aria-pressed]:has(svg path[d*=\"M8.5 2C12.0899\"])",
                "button[aria-pressed]:has(svg path[d*=\"M8.5 2\"])",
                "button:has(svg path[d*=\"M8.5\"]):has(p:contains(\"リサーチ\"))",
                "button.text-accent-secondary-100[aria-pressed=\"true\"]:has(svg)",
                "button.text-text-300[aria-pressed=\"false\"]:has(svg)"
            ]
        },
        MENU: {
            CONTAINER: [
                "[role=\"menu\"][data-state=\"open\"]",
                "[data-radix-menu-content][data-state=\"open\"]",
                "div.z-dropdown[role=\"menu\"]",
                "[aria-orientation=\"vertical\"][data-state=\"open\"]",
                "div[role=\"menu\"]:not([data-state=\"closed\"])",
                "[role=\"menu\"]",
                "[data-radix-menu-content]",
                ".z-dropdown",
                "[aria-orientation=\"vertical\"][role=\"menu\"]"
            ],
            ITEM: "[role=\"option\"], [role=\"menuitem\"]",
            MODEL_ITEM: "button[role=\"option\"]:has(span)",
            OTHER_MODELS: [
                "[role=\"menuitem\"][aria-haspopup=\"menu\"]",
                "[role=\"menuitem\"]:has(svg)",
                "[role=\"menuitem\"]:has(.group-hover\\:text-text-100)",
                "[aria-haspopup=\"menu\"][role=\"menuitem\"]",
                "div[role=\"menuitem\"] div.text-sm",
                "div[role=\"menuitem\"]:last-child"
            ]
        },
        FEATURE_MENU: {
            CONTAINER: [
                "[aria-labelledby=\"input-tools-menu-trigger\"]",
                ".w-\\[20rem\\].absolute.max-w-\\[calc\\(100vw-16px\\)\\].block",
                "div.z-dropdown.bg-bg-000.rounded-xl",
                "div[style*=\"max-height\"][style*=\"336\"]",
                ".absolute .flex-col .overscroll-auto"
            ],
            WEB_SEARCH_TOGGLE: [
                "button:has(svg path[d*=\"M7.2705 3.0498\"]):has(input[role=\"switch\"])",
                "button:has(p:contains(\"ウェブ検索\")):has(input[role=\"switch\"])",
                "button.text-primary-500:has(input[role=\"switch\"])",
                "div:contains(\"ウェブ検索\") button:has(.group\\/switch)",
                "button .font-base:contains(\"ウェブ検索\")"
            ],
            THINK_TOGGLE: [
                "button:has(svg path[d*=\"M10.3857 2.50977\"]):has(input[role=\"switch\"])",
                "button:has(p:contains(\"じっくり考える\")):has(input[role=\"switch\"])",
                "button input[role=\"switch\"][style*=\"width: 28px\"]",
                "div:contains(\"じっくり考える\") button:has(.group\\/switch)",
                "button .font-base:contains(\"じっくり考える\")"
            ]
        },
        TEXT_EXTRACTION: {
            NORMAL_RESPONSE: [
                ".standard-markdown",
                "div.standard-markdown",
                ".grid.gap-2\\.5.standard-markdown",
                "div.grid-cols-1.standard-markdown",
                "[class*=\"standard-markdown\"]",
                ".standard-markdown p",
                "div.grid-cols-1.grid.gap-2\\.5",
                ".grid-cols-1.grid.gap-2\\.5 p",
                "div[data-is-streaming=\"false\"] .standard-markdown",
                "div.font-claude-response .standard-markdown"
            ],
            ARTIFACT_CONTENT: [
                "#markdown-artifact",
                "[id=\"markdown-artifact\"]",
                ".font-claude-response#markdown-artifact",
                "[tabindex=\"0\"]#markdown-artifact",
                "div.mx-auto.max-w-3xl#markdown-artifact",
                "[id*=\"markdown\"]",
                ".artifact-block-cell",
                "[class*=\"artifact-block\"]",
                "div[class*=\"artifact\"]",
                ".absolute.right-2[class*=\"whitespace-pre-wrap\"]",
                "div[class*=\"font-mono\"][class*=\"whitespace-pre-wrap\"]",
                "[data-testid=\"artifact-content\"]",
                "div[class*=\"canvas\"]"
            ]
        }
    };

    console.log('✅ Claude専用セレクタ内蔵完了');

    // AI共通基盤からRetryManagerを取得（現在の共通処理関数を活用）
    const getRetryManager = () => {
        try {
            if (typeof window !== 'undefined' && window.AICommonBase) {
                return window.AICommonBase.RetryManager;
            }
            if (typeof globalThis !== 'undefined' && globalThis.AICommonBase) {
                return globalThis.AICommonBase.RetryManager;
            }
            console.log('📝 AI共通基盤が見つかりません、独自実装を使用');
            return null;
        } catch (error) {
            console.log('📝 RetryManager取得失敗、独自実装を使用:', error.message);
            return null;
        }
    };

    // RetryManagerの取得を試行
    const retryManager = getRetryManager();

    // ===== リトライ機能のための関数定義 =====

    /**
     * ウィンドウ再作成処理
     * エラー時にウィンドウを閉じて新しいウィンドウで作業を続行
     */
    const recreateWindow = async () => {
        console.log('🔄 ウィンドウ再作成を実行中...');

        try {
            // 拡張機能コンテキストの確認
            if (!chrome || !chrome.tabs) {
                throw new Error('Chrome拡張機能のコンテキストが無効です');
            }

            // 現在のウィンドウを閉じる
            if (typeof chrome.tabs.reload === 'function') {
                await chrome.tabs.reload();
            } else {
                // フォールバック: ページリロード
                if (window && window.location) {
                    window.location.reload();
                } else {
                    throw new Error('ページリロード機能が利用できません');
                }
            }
            await wait(2000);

            // ページを再読み込み（セレクタは内蔵済み）
            console.log('📝 ページ再読み込み完了');

            console.log('✅ ウィンドウ再作成完了');
            return true;
        } catch (error) {
            console.error('❌ ウィンドウ再作成エラー:', error);
            return false;
        }
    };

    /**
     * リトライ付きでステップを実行
     * @param {Function} stepFunction - 実行するステップ関数
     * @param {string} stepName - ステップ名
     * @param {number} maxRetries - 最大リトライ回数
     * @returns {Promise<any>} 実行結果
     */
    const executeStepWithRetry = async (stepFunction, stepName, maxRetries = 5) => {
        // AI共通基盤のRetryManagerが利用可能な場合は使用
        if (retryManager) {
            console.log(`🔧 AI共通基盤RetryManagerを使用: ${stepName}`);
            try {
                const result = await retryManager.executeWithRetry({
                    action: stepFunction,
                    isSuccess: (result) => result !== null && result !== undefined,
                    maxRetries: maxRetries,
                    retryDelay: 3000,
                    actionName: stepName,
                    context: { aiType: 'claude', source: 'claude-automation-v2' }
                });
                return result.success ? result.result : null;
            } catch (error) {
                console.error(`❌ RetryManager実行エラー: ${error.message}`);
                // フォールバックは下記の独自実装を使用
            }
        }

        // フォールバック: 独自実装
        console.log(`🔧 独自リトライ実装を使用: ${stepName}`);
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                console.log(`\n🔄 ${stepName} (試行 ${attempt}/${maxRetries})`);
                const result = await stepFunction();
                console.log(`✅ ${stepName} 成功`);
                return result;
            } catch (error) {
                console.error(`❌ ${stepName} 失敗 (試行 ${attempt}/${maxRetries}):`, error);

                if (attempt < maxRetries) {
                    console.log(`🔄 ${stepName} をリトライします...`);

                    // ウィンドウ再作成
                    const recreateSuccess = await recreateWindow();
                    if (!recreateSuccess) {
                        console.error(`❌ ウィンドウ再作成失敗、${stepName} を中断`);
                        throw error;
                    }

                    // 少し待機してからリトライ
                    await wait(3000);
                } else {
                    console.error(`❌ ${stepName} が${maxRetries}回失敗しました`);
                    throw error;
                }
            }
        }
    };

    // ===== ステップ0: セレクタ・ユーティリティ初期化 =====

    // 統一された待機時間設定
    const AI_WAIT_CONFIG = window.AI_WAIT_CONFIG || {
        DEEP_RESEARCH_WAIT: 2400000, // 40分
        NORMAL_WAIT: 600000,         // 10分
        STOP_BUTTON_WAIT: 30000      // 30秒
    };

    // ===== 複数セレクタ対応ユーティリティ関数 =====

    // 要素の可視性チェック
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

    // 複数セレクタから要素を検索
    const findElementByMultipleSelectors = async (selectors, maxRetries = 10, retryDelay = 500) => {
        for (let i = 0; i < maxRetries; i++) {
            for (const selector of selectors) {
                try {
                    const element = document.querySelector(selector);
                    if (element && isElementVisible(element)) {
                        console.log(`✅ 要素発見: ${selector} (試行 ${i + 1}/${maxRetries})`);
                        return element;
                    }
                } catch (error) {
                    continue;
                }
            }
            if (i < maxRetries - 1) {
                await wait(retryDelay);
            }
        }
        throw new Error(`要素が見つかりません。試行したセレクタ: ${selectors.join(', ')}`);
    };

    // 機能要素の取得（特別処理対応）
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

    console.log('✅ セレクタユーティリティ関数初期化完了');

    // 基本ユーティリティ
    const wait = async (ms) => new Promise(resolve => setTimeout(resolve, ms));

    async function executeTask(taskData) {
        console.log('🚀 Claude V2 タスク実行開始');

        // ===== Deep Research版テスト済みユーティリティ関数群 =====

        // 要素の可視性とクリック可能状態を確認
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

        // React要素のプロパティを取得
        const getReactProps = (element) => {
            const keys = Object.keys(element || {});
            const reactKey = keys.find(key => key.startsWith('__reactInternalInstance') || key.startsWith('__reactFiber'));
            return reactKey ? element[reactKey] : null;
        };

        // 高度なイベント発火（Reactシンセティックイベント対応）
        const triggerReactEvent = async (element, eventType = 'click') => {
            const log = (msg) => console.log(`🎯 [イベント] ${msg}`);

            try {
                // React内部プロパティの検出
                const reactProps = getReactProps(element);
                if (reactProps) {
                    log(`React要素検出: ${element.tagName}`);
                }

                // マウスイベントのフルシーケンス
                if (eventType === 'click') {
                    const rect = element.getBoundingClientRect();
                    const x = rect.left + rect.width / 2;
                    const y = rect.top + rect.height / 2;

                    // pointer/mouse フルシーケンス（A3パターン）
                    const events = [
                        new PointerEvent('pointerover', { bubbles: true, cancelable: true, clientX: x, clientY: y }),
                        new PointerEvent('pointerenter', { bubbles: false, cancelable: false, clientX: x, clientY: y }),
                        new MouseEvent('mouseover', { bubbles: true, cancelable: true, clientX: x, clientY: y }),
                        new MouseEvent('mouseenter', { bubbles: false, cancelable: false, clientX: x, clientY: y }),
                        new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons: 1 }),
                        new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons: 1 }),
                        new PointerEvent('pointerup', { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons: 0 }),
                        new MouseEvent('mouseup', { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons: 0 }),
                        new PointerEvent('click', { bubbles: true, cancelable: true, clientX: x, clientY: y })
                    ];

                    for (const event of events) {
                        element.dispatchEvent(event);
                        await wait(10);
                    }

                    // S1パターン: 直接クリック
                    element.click();

                    log(`✅ イベント発火完了: ${eventType}`);
                }
            } catch (error) {
                log(`❌ イベント発火エラー: ${error.message}`);
                throw error;
            }
        };

        const findElementByMultipleSelectors = async (selectors, description) => {
            console.log(`\n🔍 [${description}] 要素検索開始`);

            for (let i = 0; i < selectors.length; i++) {
                const selector = selectors[i];
                console.log(`  試行 ${i + 1}/${selectors.length}: ${selector.description || selector}`);

                try {
                    const selectorStr = selector.selector || selector;
                    const element = await waitForElement(selectorStr, 3, 200);
                    if (element) {
                        console.log(`  ✅ 成功: ${selector.description || selector}`);
                        return element;
                    }
                } catch (error) {
                    console.log(`  ❌ 失敗: ${error.message}`);
                }
            }

            throw new Error(`${description} の要素が見つかりません`);
        };

        // セレクタ内の文字列検索用（特別処理対応）
        function getFeatureElement(selectorList, elementName) {
            console.log(`要素取得開始: ${elementName}`);

            for (let i = 0; i < selectorList.length; i++) {
                const selector = selectorList[i];
                console.log(`試行 ${i + 1}/${selectorList.length}: ${selector}`);

                try {
                    if (selector.includes(':has(')) {
                        const elements = document.querySelectorAll('button');
                        for (const el of elements) {
                            if (selector.includes('じっくり考える')) {
                                const text = el.textContent || '';
                                if (text.includes('じっくり考える') && el.querySelector('input[role="switch"]')) {
                                    console.log(`要素発見: ${elementName} (特別処理)`);
                                    return el;
                                }
                            }
                            if (selector.includes('ウェブ検索')) {
                                const text = el.textContent || '';
                                if (text.includes('ウェブ検索') && el.querySelector('input[role="switch"]')) {
                                    console.log(`要素発見: ${elementName} (特別処理)`);
                                    return el;
                                }
                            }
                        }
                    } else {
                        const element = document.querySelector(selector);
                        if (element) {
                            console.log(`要素発見: ${elementName}`);
                            return element;
                        }
                    }
                } catch (e) {
                    console.log(`セレクタエラー: ${e.message}`);
                }
            }

            console.log(`要素が見つかりません: ${elementName}`);
            return null;
        }

        // Claude動作用セレクタとコンビネーションした要素取得
        const findClaudeElement = async (selectorInfo, retryCount = 3) => {
            const results = [];

            for (let retry = 0; retry < retryCount; retry++) {
                for (let i = 0; i < selectorInfo.selectors.length; i++) {
                    const selector = selectorInfo.selectors[i];
                    try {
                        if (selector.includes('svg path')) {
                            const paths = document.querySelectorAll(selector);
                            if (paths.length > 0) {
                                const button = paths[0].closest('button');
                                if (button) {
                                    console.log(`✓ 要素発見 (SVG経由): ${selectorInfo.description}`);
                                    return { element: button, selector, method: 'svg-parent' };
                                }
                            }
                        }

                        const elements = document.querySelectorAll(selector);

                        if (selectorInfo.description.includes('通常処理')) {
                            const filtered = Array.from(elements).filter(el => {
                                return !el.closest('#markdown-artifact') &&
                                       !el.closest('[class*="artifact"]');
                            });

                            if (filtered.length > 0) {
                                const element = filtered[filtered.length - 1];
                                console.log(`✓ 要素発見 (フィルタ済み): ${selectorInfo.description} - セレクタ#${i + 1}`);
                                return { element, selector, method: 'filtered' };
                            }
                        } else if (elements.length > 0) {
                            console.log(`✓ 要素発見: ${selectorInfo.description} - セレクタ#${i + 1}`);
                            return { element: elements[0], selector, method: 'direct' };
                        }

                        results.push({ selector, found: false });
                    } catch (e) {
                        results.push({ selector, error: e.message });
                    }
                }

                if (retry < retryCount - 1) {
                    await wait(1000);
                }
            }

            console.warn(`✗ 要素未発見: ${selectorInfo.description}`);
            console.log('  試行結果:', results);
            return null;
        };

        // Deep Research版テキスト入力処理
        const inputText = async (element, text) => {
            try {
                element.focus();
                await wait(100);

                element.textContent = '';

                const placeholderP = element.querySelector('p.is-empty');
                if (placeholderP) {
                    placeholderP.remove();
                }

                const p = document.createElement('p');
                p.textContent = text;
                element.appendChild(p);

                element.classList.remove('ql-blank');

                const inputEvent = new Event('input', { bubbles: true, cancelable: true });
                const changeEvent = new Event('change', { bubbles: true, cancelable: true });

                element.dispatchEvent(inputEvent);
                element.dispatchEvent(changeEvent);

                console.log('✓ テキスト入力完了');
                return true;
            } catch (e) {
                console.error('✗ テキスト入力エラー:', e);
                return false;
            }
        };

        // Deep Research版ボタンクリック処理
        const clickButton = async (button) => {
            try {
                button.focus();
                await wait(50);

                const mousedown = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
                const mouseup = new MouseEvent('mouseup', { bubbles: true, cancelable: true });
                const click = new MouseEvent('click', { bubbles: true, cancelable: true });

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

        // 重複削除：上記の高度なtriggerReactEvent関数を使用

        // Deep Research版トグル状態取得・設定
        function getToggleState(toggleButton) {
            const input = toggleButton.querySelector('input[role="switch"]');
            if (!input) {
                console.log('トグルinput要素が見つかりません');
                return null;
            }
            return input.checked;
        }

        function setToggleState(toggleButton, targetState) {
            const currentState = getToggleState(toggleButton);
            if (currentState === null) return false;

            console.log(`トグル現在状態: ${currentState}, 目標状態: ${targetState}`);

            if (currentState !== targetState) {
                toggleButton.click();
                console.log('トグルクリック実行');
                return true;
            }

            console.log('状態変更不要');
            return false;
        }

        function getMenuFeatures() {
            const features = [];
            const menuItems = document.querySelectorAll('button:has(input[role="switch"])');

            menuItems.forEach(item => {
                const label = item.querySelector('p.font-base');
                if (label) {
                    features.push(label.textContent.trim());
                }
            });

            return features;
        }

        // Deep Research版テキスト取得（切り詰め処理付き）
        const getTextPreview = function(element) {
            if (!element) return null;

            const fullText = element.textContent.trim();
            const length = fullText.length;

            if (length <= 200) {
                return { full: fullText, preview: fullText, length };
            } else {
                const preview = fullText.substring(0, 100) + '\n...[中略]...\n' + fullText.substring(length - 100);
                return { full: fullText, preview, length };
            }
        };

        // ===== Deep Research専用処理関数 =====

        // Deep Research専用セレクタ定義
        const deepResearchSelectors = {
            '3_回答停止ボタン': {
                selectors: [
                    '[aria-label="応答を停止"]',
                    'button[aria-label="応答を停止"]',
                    '[data-state="closed"][aria-label="応答を停止"]',
                    'button.border-border-200[aria-label="応答を停止"]',
                    'button svg path[d*="M128,20A108"]'
                ],
                description: '回答停止ボタン'
            },
            '4_Canvas機能テキスト位置': {
                selectors: [
                    '#markdown-artifact',
                    '[id="markdown-artifact"]',
                    '.font-claude-response#markdown-artifact',
                    '[tabindex="0"]#markdown-artifact',
                    'div.mx-auto.max-w-3xl#markdown-artifact'
                ],
                description: 'Canvas機能のテキスト表示エリア'
            },
            '4_2_Canvas開くボタン': {
                selectors: [
                    '[aria-label="内容をプレビュー"]',
                    '[role="button"][aria-label="内容をプレビュー"]',
                    '.artifact-block-cell',
                    '[class*="artifact-block"]'
                ],
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
        };

        const handleDeepResearchWait = async () => {
            console.log('\n【Deep Research専用待機処理】');
            console.log('─'.repeat(40));

            try {
                // ステップ1-1: 送信後、回答停止ボタンが出てくるまで待機
                console.log('\n【ステップ1-1】送信後、回答停止ボタンが出てくるまで待機');

                let stopButtonFound = false;
                let waitCount = 0;
                const maxInitialWait = 120; // 初期待機最大2分

                while (!stopButtonFound && waitCount < maxInitialWait) {
                    const stopResult = await findClaudeElement(deepResearchSelectors['3_回答停止ボタン'], 1);

                    if (stopResult) {
                        stopButtonFound = true;
                        console.log('✓ 停止ボタンが出現しました');
                        break;
                    }

                    await wait(1000);
                    waitCount++;

                    if (waitCount % 30 === 0) {
                        console.log(`  待機中... ${waitCount}秒経過`);
                    }
                }

                // ステップ1-2: 2分間待機して停止ボタンの状態を確認
                console.log('\n【ステップ1-2】2分間待機して停止ボタンの状態を確認');
                const startTime = Date.now();
                let disappeared = false;

                while ((Date.now() - startTime) < 120000) { // 2分間
                    const stopResult = await findClaudeElement(deepResearchSelectors['3_回答停止ボタン'], 1);

                    if (!stopResult) {
                        disappeared = true;
                        console.log('✓ 停止ボタンが消滅しました（2分以内）');
                        break;
                    }

                    await wait(5000); // 5秒ごとにチェック

                    const elapsed = Math.floor((Date.now() - startTime) / 1000);
                    if (elapsed % 30 === 0) {
                        console.log(`  Deep Research処理中... ${elapsed}秒経過`);
                    }
                }

                // ステップ1-3: 2分以内に消滅した場合、プロンプトを再送信
                if (disappeared) {
                    console.log('\n【ステップ1-3】いいから元のプロンプトを確認して作業をして」を送信');

                    const inputResult = await findClaudeElement({
                        selectors: CLAUDE_SELECTORS.INPUT,
                        description: 'テキスト入力欄'
                    });

                    if (inputResult) {
                        await inputText(inputResult.element, "いいから元のプロンプトを確認して作業をして");

                        const sendResult = await findClaudeElement({
                            selectors: CLAUDE_SELECTORS.SEND_BUTTON,
                            description: '送信ボタン'
                        });

                        if (sendResult) {
                            await clickButton(sendResult.element);
                        }
                    }
                }

                // ステップ1-4: 回答停止ボタンが出現するまで待機
                console.log('\n【ステップ1-4】回答停止ボタンが出現するまで待機');
                stopButtonFound = false;
                waitCount = 0;
                const maxWaitCount = 2400; // 最大40分

                while (!stopButtonFound && waitCount < maxWaitCount) {
                    const stopResult = await findClaudeElement(deepResearchSelectors['3_回答停止ボタン'], 1);

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
                    const maxDisappearWait = 2400; // 最大40分
                    let lastLogTime = Date.now();

                    while (!stopButtonGone && disappearWaitCount < maxDisappearWait) {
                        const stopResult = await findClaudeElement(deepResearchSelectors['3_回答停止ボタン'], 1);

                        if (!stopResult) {
                            // 10秒間確認
                            let confirmCount = 0;
                            let stillGone = true;

                            while (confirmCount < 10) {
                                await wait(1000);
                                const checkResult = await findClaudeElement(deepResearchSelectors['3_回答停止ボタン'], 1);
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

        const getDeepResearchText = async () => {
            console.log('\n【ステップ2】Deep Research テキスト取得');
            console.log('─'.repeat(40));

            const results = {
                canvas: null,
                normal: null
            };

            try {
                // Canvas機能テキスト取得
                console.log('\nCanvas機能テキスト取得試行');
                let canvasResult = await findClaudeElement(deepResearchSelectors['4_Canvas機能テキスト位置'], 1);

                if (!canvasResult) {
                    console.log('Canvas機能を開くボタンを探します');
                    const openButtonSelectors = deepResearchSelectors['4_2_Canvas開くボタン'].selectors;

                    for (const selector of openButtonSelectors) {
                        try {
                            const openButton = document.querySelector(selector);
                            if (openButton) {
                                console.log('Canvas機能を開くボタンを発見、クリックします');
                                await clickButton(openButton);
                                await wait(1000);

                                canvasResult = await findClaudeElement(deepResearchSelectors['4_Canvas機能テキスト位置'], 1);
                                if (canvasResult) {
                                    break;
                                }
                            }
                        } catch (e) {
                            // エラーは無視して次を試す
                        }
                    }
                }

                if (canvasResult) {
                    results.canvas = getTextPreview(canvasResult.element);
                    console.log('\n**取得したCanvasのテキスト**');
                    console.log(`文字数: ${results.canvas.length}文字`);
                    console.log(results.canvas.preview);
                } else {
                    console.log('⚠ Canvas機能のテキストが見つかりません');
                }

                // 通常処理テキスト取得（複数要素対応）
                console.log('\n通常処理テキスト取得試行');
                const normalElements = document.querySelectorAll('.standard-markdown');

                if (normalElements.length > 0) {
                    console.log(`通常処理要素数: ${normalElements.length}個`);

                    // Canvas要素内を除外してフィルタリング
                    const filtered = Array.from(normalElements).filter(el => {
                        return !el.closest('#markdown-artifact') &&
                               !el.closest('[class*="artifact"]');
                    });

                    if (filtered.length > 0) {
                        // 最後の要素（最新の応答）を取得
                        const targetElement = filtered[filtered.length - 1];
                        results.normal = getTextPreview(targetElement);

                        console.log('\n**取得した通常処理のテキスト**');
                        console.log(`文字数: ${results.normal.length}文字`);
                        console.log(results.normal.preview);
                    }
                }

                if (!results.normal) {
                    console.log('⚠ 通常処理のテキストが見つかりません');
                }

            } catch (error) {
                console.error('❌ テキスト取得エラー:', error.message);
            }

            return results;
        };

        // 応答待機処理
        const waitForResponse = async (isDeepResearch = false) => {
            const maxWait = isDeepResearch ? AI_WAIT_CONFIG.DEEP_RESEARCH_WAIT : AI_WAIT_CONFIG.NORMAL_WAIT;
            const stopSelectors = CLAUDE_SELECTORS.STOP_BUTTON;

            let stopButtonFound = false;
            let waitCount = 0;

            while (!stopButtonFound && waitCount < AI_WAIT_CONFIG.STOP_BUTTON_WAIT / 1000) {
                const stopButton = document.querySelector(stopSelectors[0]);
                if (stopButton) {
                    stopButtonFound = true;
                    console.log('✓ 停止ボタン出現確認');
                    break;
                }
                await wait(1000);
                waitCount++;
            }

            if (stopButtonFound) {
                const startTime = Date.now();
                let confirmCount = 0;

                while (Date.now() - startTime < maxWait) {
                    const stopButton = document.querySelector(stopSelectors[0]);

                    if (!stopButton) {
                        confirmCount++;
                        if (confirmCount >= 10) {
                            console.log('✓ 回答完了確認');
                            return true;
                        }
                    } else {
                        confirmCount = 0;
                    }

                    await wait(1000);

                    const elapsed = Math.floor((Date.now() - startTime) / 60000);
                    if (elapsed > 0 && (Date.now() - startTime) % 60000 < 1000) {
                        console.log(`  回答生成中... ${elapsed}分経過`);
                    }
                }
            }
            return false;
        };

        // ===== ステップ0: ページ準備確認 =====
        const waitForPageReady = async () => {
            console.log('\n■■■ ステップ0: ページ準備確認 ■■■');
            const maxAttempts = 30; // 最大30秒待機
            let attempts = 0;

            while (attempts < maxAttempts) {
                attempts++;
                console.log(`[ステップ0] 準備確認 (${attempts}/${maxAttempts})`);

                // テキスト入力欄の存在をチェック
                const inputSelectors = CLAUDE_SELECTORS.INPUT;
                if (!inputSelectors || inputSelectors.length === 0) {
                    throw new Error('Claude INPUTセレクタが定義されていません');
                }
                const inputElement = await waitForElement(inputSelectors[0], 5, 500);

                if (inputElement) {
                    console.log('✅ [ステップ0] ページ準備完了');
                    return true;
                }

                await wait(1000);
            }

            console.error('❌ [ステップ0] ページ準備タイムアウト');
            throw new Error('ページが準備できませんでした');
        };

        // ===== Deep Research版テスト済み関数のみ使用 =====

        try {
            // ===== ステップ0: ページ準備確認（リトライ付き） =====
            await executeStepWithRetry(async () => {
                await waitForPageReady();
                return true;
            }, 'ステップ0: ページ準備確認', 3);

            // ===== ステップ1: タスクデータ受信・ログ出力 =====
            console.log('\n■■■ ステップ1: タスクデータ受信 ■■■');
            console.log('📦 受信したタスクデータ:', {
                model: taskData.model,
                function: taskData.function,
                promptLength: taskData.prompt?.length || taskData.text?.length || 0,
                hasPrompt: !!(taskData.prompt || taskData.text),
                cellInfo: taskData.cellInfo,
                taskId: taskData.taskId,
                aiType: taskData.aiType
            });
            console.log('🔍 デバッグ情報:');
            console.log(`  taskData.modelの型: ${typeof taskData.model}`);
            console.log(`  taskData.modelの値: "${taskData.model}"`);
            console.log(`  taskData.functionの型: ${typeof taskData.function}`);
            console.log(`  taskData.functionの値: "${taskData.function}"`);
            console.log('■■■ ステップ1完了 ■■■');

            // ===== ステップ2: パラメータ準備 =====
            console.log('\n■■■ ステップ2: パラメータ準備 ■■■');
            let prompt = taskData.prompt || taskData.text || '';
            const modelName = taskData.model || '';
            const featureName = taskData.function || null;

            console.log(`🔄 変換後のパラメータ:`);
            console.log(`  プロンプト: ${prompt ? `設定済み（${prompt.length}文字）` : '❌ 空'}`);
            console.log(`  モデル名: "${modelName || '未指定'}"` );
            console.log(`  機能名: "${featureName || '設定なし'}"`);
            console.log(`🔍 変数の状態:`);
            console.log(`  modelNameのTruthy判定: ${!!modelName}`);
            console.log(`  modelName !== '': ${modelName !== ''}`);
            console.log(`  featureNameのTruthy判定: ${!!featureName}`);
            console.log(`  featureName !== '': ${featureName !== ''}`);
            console.log(`  featureName !== '設定なし': ${featureName !== '設定なし'}`);
            console.log('■■■ ステップ2完了 ■■■');

            // ===== ステップ3: プロンプト最終化（セル情報追加） =====
            if (taskData.cellInfo && taskData.cellInfo.column && taskData.cellInfo.row) {
                console.log('\n■■■ ステップ3: プロンプト最終化 ■■■');
                const cellPosition = `${taskData.cellInfo.column}${taskData.cellInfo.row}`;
                prompt = `【現在${cellPosition}セルを処理中です】

${prompt}`;
                console.log(`セル情報 ${cellPosition} をプロンプトに追加しました`);
                console.log('■■■ ステップ3完了 ■■■');
            }

            // ===== ステップ3: Deep Research判定 =====
            console.log('\n■■■ ステップ3: Deep Research判定 ■■■');
            const isDeepResearch = featureName && (
                featureName === 'Deep Research' ||
                featureName.includes('Research') ||
                featureName.includes('リサーチ')
            );
            console.log(`Deep Research判定 = ${isDeepResearch ? 'YES' : 'NO'}`);
            console.log('■■■ ステップ3完了 ■■■');

            // ===== 実行サマリー表示 =====
            console.log('\n━'.repeat(60));
            console.log(`🎯 モデル: ${modelName || '未指定（自動選択）'}`);
            console.log(`🎯 機能: ${featureName || '通常処理'}`);
            console.log(`🎯 Deep Research: ${isDeepResearch ? 'ON' : 'OFF'}`);
            console.log(`🎯 プロンプト: ${prompt.substring(0, 80)}...`);
            console.log('━'.repeat(60));

            // ===== ステップ4: テキスト入力（リトライ付き） =====
            await executeStepWithRetry(async () => {
                console.log('\n■■■ ステップ4: テキスト入力 ■■■');
                const inputSelectors = CLAUDE_SELECTORS.INPUT;
                if (!inputSelectors || inputSelectors.length === 0) {
                    throw new Error('Claude INPUTセレクタが定義されていません');
                }
                const inputElement = await findElementByMultipleSelectors(inputSelectors, 20, 500);

                if (!inputElement) {
                    throw new Error('テキスト入力欄が見つかりません');
                }

                const inputSuccess = await inputText(inputElement, prompt);

                if (!inputSuccess) {
                    throw new Error('テキスト入力に失敗しました');
                }

                console.log('✅ テキスト入力完了（検証済み）');
                console.log('■■■ ステップ4完了 ■■■');

                return inputElement;
            }, 'ステップ4: テキスト入力', 3);

            // ===== ステップ5: モデル選択（条件付き、リトライ付き） =====
            if (modelName && modelName !== '') {
                await executeStepWithRetry(async () => {
                    console.log('\n■■■ ステップ5: モデル選択 ■■■');
                    console.log(`🎯 選択するモデル: "${modelName}"`);

                    // Claude内蔵セレクタからモデルボタンセレクタを取得
                    const menuSelectors = CLAUDE_SELECTORS.MODEL_BUTTON;
                    console.log(`🔍 モデルボタンセレクタ数: ${menuSelectors.length}`);

                    const menuButton = await findElementByMultipleSelectors(menuSelectors, 20, 500);

                    if (!menuButton) {
                        throw new Error('モデルメニューボタンが見つかりません');
                    }

                    console.log('🔍 PointerEventでメニューを開く');
                    // ポインターイベントを使用してメニューを開く
                    menuButton.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, view: window }));
                    await wait(50);
                    menuButton.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, view: window }));
                    await wait(1500);

                    // 他のモデルメニューボタン
                    const otherModelsSelectors = CLAUDE_SELECTORS.MENU.OTHER_MODELS;
                    let otherModelsBtn = null;
                    for (const selector of otherModelsSelectors) {
                        otherModelsBtn = document.querySelector(selector);
                        if (otherModelsBtn) {
                            console.log(`🔍 他のモデルボタン発見: ${selector}`);
                            break;
                        }
                    }
                    if (otherModelsBtn) {
                        console.log('🔍 他のモデルメニューを開く');
                        await triggerReactEvent(otherModelsBtn, 'click');
                        await wait(1000);
                    }

                    // 目標モデル選択
                    const targetModelName = modelName.startsWith('Claude') ? modelName : `Claude ${modelName}`;
                    console.log(`🔍 検索するモデル名: "${targetModelName}"`);

                    const menuItemSelectors = [CLAUDE_SELECTORS.MENU.ITEM];
                    const modelElements = Array.from(document.querySelectorAll(menuItemSelectors.join(', ')));
                    console.log(`🔍 メニューアイテム数: ${modelElements.length}`);

                    const targetModel = modelElements.find(el => {
                        const text = el.textContent?.trim();
                        const found = text?.includes(targetModelName);
                        if (found) {
                            console.log(`  ✅ マッチ: "${text}"`);
                        }
                        return found;
                    });

                    if (targetModel) {
                        await triggerReactEvent(targetModel, 'click');
                        await wait(1500);
                        console.log(`✅ モデル選択完了: ${targetModelName}`);
                    } else {
                        console.log(`⚠️ 指定モデルが見つかりません、デフォルトモデルを選択`);
                        const firstModel = modelElements[0];
                        if (firstModel) {
                            console.log(`  🎯 デフォルト: "${firstModel.textContent?.trim()}"`);
                            await triggerReactEvent(firstModel, 'click');
                            await wait(1500);
                        } else {
                            throw new Error('選択可能なモデルが見つかりません');
                        }
                    }

                    console.log('■■■ ステップ5完了 ■■■');
                    return { success: true };
                }, 'ステップ5: モデル選択', 3);
            } else {
                console.log('\n■■■ ステップ5: モデル選択スキップ ■■■');
                console.log('理由: モデル名が未指定のためスキップ');
            }

            // ===== ステップ6: 機能選択（条件付き、リトライ付き） =====
            if (featureName && featureName !== '' && featureName !== '設定なし') {
                await executeStepWithRetry(async () => {
                    console.log('\n■■■ ステップ6: 機能選択 ■■■');
                    console.log(`🎯 指定された機能: "${featureName}"`);

                    if (isDeepResearch) {
                        console.log('🔍 Deep Research設定を実行中...');
                        const featureMenuSelectors = CLAUDE_SELECTORS.FUNCTION_MENU_BUTTON;
                        const featureMenuBtn = await findElementByMultipleSelectors(featureMenuSelectors, 20, 500);

                        if (!featureMenuBtn) {
                            throw new Error('機能メニューボタンが見つかりません');
                        }

                        featureMenuBtn.click();
                        await wait(1500);

                        // ウェブ検索をオン
                        const webSearchToggleSelectors = CLAUDE_SELECTORS.FEATURE_MENU.WEB_SEARCH_TOGGLE;
                        const webSearchToggle = getFeatureElement(webSearchToggleSelectors, 'ウェブ検索トグル');
                        if (webSearchToggle) {
                            setToggleState(webSearchToggle, true);
                            await wait(1500);
                            console.log('✅ ウェブ検索有効化');
                        }

                        // メニューを閉じる
                        featureMenuBtn.click();
                        await wait(1000);

                        // リサーチボタンを有効化
                        const researchButtonSelectors = CLAUDE_SELECTORS.FEATURE_BUTTONS.RESEARCH;
                        const buttons = document.querySelectorAll(researchButtonSelectors.join(', '));
                        let researchButtonFound = false;
                        const svgPaths = {
                            RESEARCH: 'M8.5 2C12.0899'
                        };
                        for (const btn of buttons) {
                            const svg = btn.querySelector(`svg path[d*="${svgPaths.RESEARCH}"]`);
                            if (svg) {
                                const isPressed = btn.getAttribute('aria-pressed') === 'true';
                                if (!isPressed) {
                                    btn.click();
                                    await wait(1000);
                                    console.log('✅ Deep Researchモード有効化');
                                }
                                researchButtonFound = true;
                                break;
                            }
                        }

                        if (!researchButtonFound) {
                            console.log('⚠️ Deep Researchボタンが見つかりません - フォールバック処理');
                        }
                    } else if (featureName === 'じっくり考える' || featureName.includes('Deep Thinking') || featureName.includes('思考')) {
                        console.log('🤔 じっくり考える機能を設定中...');

                        // Deep Thinkingボタンを有効化（メニューを開かずに直接）
                        const deepThinkSelectors = CLAUDE_SELECTORS.FEATURE_BUTTONS.DEEP_THINKING;

                        const deepThinkBtn = getFeatureElement(deepThinkSelectors, 'じっくり考えるボタン');
                        if (deepThinkBtn) {
                            const isPressed = deepThinkBtn.getAttribute('aria-pressed') === 'true';
                            if (!isPressed) {
                                deepThinkBtn.click();
                                await wait(1000);
                                console.log('✅ じっくり考えるモード有効化');
                            } else {
                                console.log('📝 じっくり考えるモードは既に有効');
                            }
                        } else {
                            console.log('⚠️ じっくり考えるボタンが見つかりません');

                            // フォールバック: 機能メニューから探す
                            const featureMenuSelectors = CLAUDE_SELECTORS.FUNCTION_MENU_BUTTON;
                            const featureMenuBtn = await findElementByMultipleSelectors(featureMenuSelectors, 10, 500);

                            if (featureMenuBtn) {
                                featureMenuBtn.click();
                                await wait(1500);

                                // メニュー内のトグルを探す
                                const toggleButtons = document.querySelectorAll('button:has(input[role="switch"])');
                                for (const toggle of toggleButtons) {
                                    const label = toggle.querySelector('p.font-base') || toggle;
                                    const labelText = label.textContent || '';
                                    if (labelText.includes('じっくり考える') || labelText.includes('Deep Thinking')) {
                                        setToggleState(toggle, true);
                                        console.log('✅ メニューからじっくり考えるを有効化');
                                        break;
                                    }
                                }

                                // メニューを閉じる
                                featureMenuBtn.click();
                                await wait(1000);
                            }
                        }
                    } else {
                        console.log(`🔧 その他の機能選択: ${featureName}`);

                        // 機能メニューを開く
                        const featureMenuSelectors = CLAUDE_SELECTORS.FUNCTION_MENU_BUTTON;
                        const featureMenuBtn = await findElementByMultipleSelectors(featureMenuSelectors, 20, 500);

                        if (featureMenuBtn) {
                            featureMenuBtn.click();
                            await wait(1500);

                            // メニュー内のトグルから指定された機能を探す
                            const toggleButtons = document.querySelectorAll('button:has(input[role="switch"])');
                            let found = false;

                            for (const toggle of toggleButtons) {
                                const label = toggle.querySelector('p.font-base') || toggle;
                                const labelText = label.textContent || '';
                                console.log(`  📝 チェック: "${labelText}"`);

                                if (labelText.includes(featureName)) {
                                    setToggleState(toggle, true);
                                    console.log(`✅ ${featureName}を有効化`);
                                    found = true;
                                    break;
                                }
                            }

                            if (!found) {
                                console.log(`⚠️ 機能 "${featureName}" がメニューに見つかりません`);
                            }

                            // メニューを閉じる
                            featureMenuBtn.click();
                            await wait(1000);
                        } else {
                            console.log('⚠️ 機能メニューボタンが見つかりません');
                        }
                    }

                    console.log('■■■ ステップ6完了 ■■■');
                    return { success: true };
                }, 'ステップ6: 機能選択', 3);
            } else {
                console.log('\n■■■ ステップ6: 機能選択スキップ ■■■');
                console.log('理由: 機能名が未指定または「設定なし」のためスキップ');
            }

            // ===== ステップ7: メッセージ送信・応答待機（リトライ付き） =====
            await executeStepWithRetry(async () => {
                console.log('\n■■■ ステップ7: メッセージ送信・応答待機 ■■■');

                // 送信ボタンをクリック
                const sendSelectors = CLAUDE_SELECTORS.SEND_BUTTON;
                if (!sendSelectors || sendSelectors.length === 0) {
                    throw new Error('Claude SEND_BUTTONセレクタが定義されていません');
                }
                const sendButton = await findElementByMultipleSelectors(sendSelectors, 20, 500);

                if (!sendButton) {
                    throw new Error('送信ボタンが見つかりません');
                }

                const clickSuccess = await clickButton(sendButton);
                if (!clickSuccess) {
                    throw new Error('送信ボタンのクリックに失敗しました');
                }

                // 送信時刻記録
                if (window.AIHandler && window.AIHandler.recordSendTimestamp) {
                    try {
                        await window.AIHandler.recordSendTimestamp('Claude');
                    } catch (error) {
                        console.log(`エラー: 送信時刻記録失敗 - ${error.message}`);
                    }
                }

                console.log('✅ メッセージ送信完了（検証済み）');

                // 応答待機
                console.log(`応答待機開始: ${isDeepResearch ? 'Deep Research（最大40分）' : '通常処理（最大5分）'}`);
                const responseCompleted = await waitForResponse(isDeepResearch);
                if (responseCompleted) {
                    console.log('✅ 応答完了確認');
                } else {
                    console.log('⚠️ 最大待機時間に達しました');
                }

                console.log('■■■ ステップ7完了 ■■■');
                return sendButton;
            }, 'ステップ7: メッセージ送信・応答待機', 3);

            // ===== テキスト安定化待機 =====
            await executeStepWithRetry(async () => {
                console.log('\n■■■ テキスト安定化待機 ■■■');

                // 1. 応答停止ボタンの完全消失を確認
                const stopButtonSelectors = ['[data-testid="stop-button"]'];
                let stopButtonExists = true;
                let waitCount = 0;

                while (stopButtonExists && waitCount < 30) { // 最大30秒待機
                    const stopButton = document.querySelector(stopButtonSelectors[0]);
                    if (!stopButton) {
                        stopButtonExists = false;
                        console.log('✅ 応答停止ボタン消失確認');
                    } else {
                        await wait(1000);
                        waitCount++;
                        if (waitCount % 5 === 0) {
                            console.log(`応答停止ボタン待機中... ${waitCount}秒`);
                        }
                    }
                }

                if (stopButtonExists) {
                    console.log('⚠️ 応答停止ボタンが30秒後も残存しています');
                }

                // 2. テキスト安定化待機（変化が止まるまで待機）
                console.log('テキスト安定化待機開始（変化が止まるまで待機）...');
                let lastTextContent = '';
                let stableCount = 0;
                const requiredStableCount = 5; // 5回連続で同じ内容なら安定とみなす（約5秒間変化なし）
                let stableText = ''; // 安定化したテキストを保存
                const maxWaitTime = 120; // 最大120秒待機（長い回答に対応）
                let totalWaitTime = 0;

                while (totalWaitTime < maxWaitTime) {
                    await wait(1000);
                    totalWaitTime++;

                    // 現在のテキスト内容を取得
                    const normalSelectors = CLAUDE_SELECTORS.TEXT_EXTRACTION.NORMAL_RESPONSE;
                    const canvasSelectors = CLAUDE_SELECTORS.TEXT_EXTRACTION.ARTIFACT_CONTENT;

                    // 通常テキスト取得（フィルタリングなし）
                    let currentTextContent = '';
                    const normalElements = document.querySelectorAll(normalSelectors.join(', '));
                    if (normalElements.length > 0) {
                        const texts = Array.from(normalElements)
                            .map(el => el.textContent?.trim() || '')
                            .filter(text => text.length > 0);
                        currentTextContent = texts.join('\n');
                    }

                    // Canvas/Artifactテキスト取得
                    for (const selector of canvasSelectors) {
                        const elements = document.querySelectorAll(selector);
                        if (elements.length > 0) {
                            const canvasTexts = Array.from(elements)
                                .map(el => el.textContent?.trim() || '')
                                .filter(text => text.length > 0);
                            if (canvasTexts.length > 0) {
                                currentTextContent += '\n\n--- Canvas Content ---\n\n' + canvasTexts.join('\n');
                            }
                        }
                    }

                    const currentLength = currentTextContent.length;
                    const lastLength = lastTextContent.length;

                    if (currentTextContent === lastTextContent) {
                        stableCount++;
                        if (stableCount >= requiredStableCount) {
                            console.log(`✅ テキスト安定化確認 (${totalWaitTime}秒後, ${currentLength}文字)`);
                            console.log(`  ${requiredStableCount}秒間テキスト変化なし`);
                            stableText = currentTextContent;
                            break;
                        }
                    } else {
                        stableCount = 0;
                        console.log(`テキスト変化検出 (${totalWaitTime}秒経過): ${lastLength} → ${currentLength}文字`);
                        if (currentLength > lastLength) {
                            console.log(`  追加された文字数: ${currentLength - lastLength}`);
                        } else if (currentLength < lastLength) {
                            console.log(`  削除された文字数: ${lastLength - currentLength}`);
                        }
                    }

                    lastTextContent = currentTextContent;

                    // 10秒ごとに経過時間を表示
                    if (totalWaitTime % 10 === 0) {
                        console.log(`  待機中... ${totalWaitTime}秒経過`);
                    }
                }

                // 最終的なテキストを保存
                if (!stableText) {
                    stableText = lastTextContent;
                    console.log(`⚠️ ${maxWaitTime}秒経過。最終状態のテキストを使用 (${stableText.length}文字)`);
                    console.log(`  ※まだテキストが変化している可能性があります`);
                }

                // グローバル変数に保存して後で使用
                window.__stabilizedText = stableText;
                console.log(`📝 安定化テキストを保存 (${stableText.length}文字)`);

                console.log('■■■ テキスト安定化待機完了 ■■■');
                return { success: true, stabilizedText: stableText };
            }, 'テキスト安定化待機', 2);

            // ===== 結果取得（Deep Research対応版） =====
            let responseText;

            // Deep Research機能がオンの場合、専用テキスト取得を実行
            if (isDeepResearch) {
                console.log('🔍 Deep Research有効 - 専用テキスト取得を開始');
                responseText = await getDeepResearchText();
                console.log(`✅ Deep Research完了: ${responseText.length}文字`);
            } else {
                // 通常のテキスト取得処理
                responseText = await executeStepWithRetry(async () => {
                    // まず安定化待機で取得したテキストを優先使用
                    if (window.__stabilizedText && window.__stabilizedText.length > 100) {
                        console.log(`📝 安定化待機で取得済みのテキストを使用 (${window.__stabilizedText.length}文字)`);
                        return window.__stabilizedText;
                    }
                    console.log('⚠️ 安定化テキストが不十分。DOM再取得を実行');

                let normalText = '';
                let canvasTexts = [];

                // 1. Canvas/Artifact テキスト取得（最後に1回だけ取得）
                const canvasSelectors = CLAUDE_SELECTORS.TEXT_EXTRACTION.ARTIFACT_CONTENT;
                console.log(`Canvas/Artifact用セレクタ: ${canvasSelectors.length}個`);

                // Canvas要素を最後に1回だけチェック（シンプルな方法）
                const checkCanvasOnce = () => {
                    console.log('🔍 Canvas要素の最終チェックを実行');

                    for (const selector of canvasSelectors) {
                        const elements = document.querySelectorAll(selector);
                        if (elements.length > 0) {
                            console.log(`Canvas要素発見: セレクタ"${selector}" ${elements.length}個`);

                            elements.forEach((element, index) => {
                                const text = element.textContent?.trim() || '';
                                if (text && text.length > 10) {
                                    // 重複チェック
                                    const isDuplicate = canvasTexts.some(existing => existing === text);

                                    if (!isDuplicate) {
                                        canvasTexts.push(text);
                                        console.log(`✅ Canvasテキスト[${index}]取得成功 (${text.length}文字)`);

                                        if (text.length > 100) {
                                            console.log(`Canvas内容先頭100文字: "${text.substring(0, 100)}..."`);
                                            console.log(`Canvas内容末尾100文字: "...${text.substring(text.length - 100)}"`);
                                        }

                                        // 不完全なテキストの検出
                                        const lastChars = text.slice(-20);
                                        if (!lastChars.match(/[。！？\n%]/) && text.length > 500) {
                                            console.log('⚠️ テキストが不完全な可能性があります（文末が不自然）');
                                            console.log(`文末20文字: "${lastChars}"`);
                                        }
                                    } else {
                                        console.log(`⚠️ Canvasテキスト[${index}]は重複のためスキップ`);
                                    }
                                }
                            });
                        }
                    }

                    if (canvasTexts.length === 0) {
                        console.log('💭 Canvas要素が見つかりませんでした（通常のテキスト応答の可能性）');
                    } else {
                        console.log(`🎯 Canvasテキスト取得完了: 合計${canvasTexts.length}個`);
                    }
                };

                // テキスト生成完了後に1回だけ実行
                checkCanvasOnce();

                if (canvasTexts.length === 0) {
                    console.log('⚠️ Canvas/Artifactテキストが1つも見つかりませんでした');
                } else {
                    console.log(`✅ Canvas/Artifactテキスト取得完了: ${canvasTexts.length}個`);
                }

                // 2. 通常テキスト取得（デバッグ強化）
                const normalSelectors = CLAUDE_SELECTORS.TEXT_EXTRACTION.NORMAL_RESPONSE;
                console.log(`通常テキスト用セレクタ: ${normalSelectors.length}個`);

                // セレクタ別に取得結果をチェック
                for (let i = 0; i < normalSelectors.length; i++) {
                    const selector = normalSelectors[i];
                    const elements = document.querySelectorAll(selector);
                    if (elements.length > 0) {
                        const totalText = Array.from(elements).map(el => el.textContent?.trim() || '').join('');
                        console.log(`セレクタ[${i}] "${selector}": ${elements.length}個の要素, ${totalText.length}文字`);
                        if (totalText.length > 100) {
                            console.log(`  先頭100文字: "${totalText.substring(0, 100)}..."`);
                        }
                    }
                }

                const normalElements = document.querySelectorAll(normalSelectors.join(', '));
                console.log(`統合結果: ${normalElements.length}個のテキスト要素を発見`);

                if (normalElements.length > 0) {
                    // フィルタリングを削除：全ての要素を使用
                    console.log('フィルタリング削除: 全要素を使用');

                    // すべての要素のテキストを結合（Claudeの回答が複数要素に分かれている場合に対応）
                    normalText = Array.from(normalElements)
                        .map(el => el.textContent?.trim() || '')
                        .filter(text => text.length > 0)
                        .join('\n');

                    console.log(`通常テキスト取得成功 (${normalText.length}文字, ${normalElements.length}要素から結合)`);
                    if (normalText.length > 100) {
                        console.log(`取得テキスト先頭100文字: "${normalText.substring(0, 100)}..."`);
                    }
                    if (normalText.length > 1000) {
                        console.log(`取得テキスト末尾100文字: "...${normalText.substring(normalText.length - 100)}"`);
                    }
                } else {
                    console.log('⚠️ 通常テキスト要素が1つも見つかりませんでした');
                }

                // 3. Canvas-First テキスト統合システム（修正版）
                let extractedText = '';

                // Canvas要素が存在する場合は常にCanvas優先
                if (canvasTexts.length > 0) {
                    const canvasContent = canvasTexts.join('\n\n--- Canvas ---\n\n');
                    extractedText = canvasContent;
                    console.log(`✅ Canvas-First取得: ${canvasTexts.length}個のCanvas, ${canvasContent.length}文字`);

                    // 通常テキストは補足情報として最小限追加（Canvas説明文でない場合のみ）
                    if (normalText && normalText.length > 200 &&
                        !normalText.toLowerCase().includes('canvas') &&
                        !normalText.toLowerCase().includes('artifact') &&
                        !normalText.includes('Claude can make content') &&
                        canvasContent.length < normalText.length * 2) {
                        extractedText = normalText + '\n\n=== Canvas Content ===\n\n' + canvasContent;
                        console.log(`🔄 例外的統合: 通常${normalText.length}文字 + Canvas${canvasContent.length}文字`);
                    }
                } else if (normalText) {
                    extractedText = normalText;
                    console.log(`📝 通常テキスト取得: ${normalText.length}文字`);
                } else {
                    console.log('❌ テキスト取得失敗: 通常・Canvasともに空');
                }

                // 最終的なテキストの完全性チェック
                if (extractedText) {
                    const lastChars = extractedText.slice(-20);
                    if (!lastChars.match(/[。！？\n%]/) && extractedText.length > 500) {
                        console.log('⚠️ 警告: テキストが途中で切れている可能性があります');
                        console.log(`末尾20文字: "${lastChars}"`);
                    }
                }

                console.log(`Canvas-Firstシステム適用後の総文字数: ${extractedText.length}文字`);

                if (!extractedText) {
                    throw new Error('応答テキストを取得できませんでした');
                }

                    console.log(`最終結果: ${extractedText.length}文字 (通常: ${normalText.length}文字, Canvas: ${canvasTexts.length}個)`);
                    return extractedText;
                }, '結果取得', 3);
            }

            // ===== 結果返却・完了 =====
            if (responseText) {
                console.log(`\n✅ Claude V2 タスク実行完了`);
                console.log(`総文字数 ${responseText.length}文字の回答を取得`);

                window.__v2_execution_complete = true;
                window.__v2_execution_result = {
                    success: true,
                    response: responseText
                };

                return {
                    success: true,
                    response: responseText
                };
            } else {
                console.log(`\n❌ Claude V2 タスク実行失敗: 応答テキストを取得できませんでした`);
                window.__v2_execution_complete = true;
                window.__v2_execution_result = {
                    success: false,
                    error: '応答テキストを取得できませんでした'
                };

                throw new Error('応答テキストを取得できませんでした');
            }

        } catch (error) {
            console.log('\n■■■ エラーハンドリング ■■■');
            console.error('❌ Claude V2 タスク実行エラー:', error);
            console.log('エラー内容:', error.message);

            window.__v2_execution_complete = true;
            window.__v2_execution_result = {
                success: false,
                error: error.message
            };

            return {
                success: false,
                error: error.message
            };
        }
    }

    // ========================================
    // グローバル公開
    // ========================================
    const automationAPI = {
        executeTask
    };

    // 下位互換性保持
    window.ClaudeAutomationV2 = automationAPI;
    window.ClaudeAutomation = automationAPI;

    // 初期化マーカー設定
    window.CLAUDE_SCRIPT_LOADED = true;
    window.CLAUDE_SCRIPT_INIT_TIME = Date.now();

    // 初期化完了ログ
    console.log(`
=====================================================================
✅ Claude V2 自動化ワークフロー 初期化完了
=====================================================================
🎯 7ステップワークフローが利用可能になりました
🎯 使用方法: ClaudeAutomation.executeTask({...})
🎯 下位互換性: ClaudeAutomation と ClaudeAutomationV2 両対応
=====================================================================
    `.trim());

})();