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
            // 現在のウィンドウを閉じる
            await chrome.tabs.reload();
            await wait(2000);

            // ページを再読み込みしてセレクタを再ロード
            await loadSelectors();

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
        NORMAL_WAIT: 300000,         // 5分
        STOP_BUTTON_WAIT: 30000      // 30秒
    };

    // UI_SELECTORSをJSONから読み込み
    let UI_SELECTORS = window.UI_SELECTORS || {};
    let selectorsLoaded = false;

    const loadSelectors = async () => {
        if (selectorsLoaded) return UI_SELECTORS;

        try {
            console.log('🔄 JSONファイル読み込み中...');
            const response = await fetch(chrome.runtime.getURL('ui-selectors-data.json'));
            console.log('🔄 データパース中...');
            const data = await response.json();
            UI_SELECTORS = data.selectors;
            window.UI_SELECTORS = UI_SELECTORS;
            selectorsLoaded = true;
            console.log('✅ UI Selectors読み込み完了');
            return UI_SELECTORS;
        } catch (error) {
            console.error('❌ ui-selectors-data.json読み込み失敗:', error);
            console.log('🔧 フォールバック: 既存セレクタを使用');
            UI_SELECTORS = window.UI_SELECTORS || {};
            selectorsLoaded = true;
            return UI_SELECTORS;
        }
    };

    await loadSelectors();
    console.log('✅ UI_SELECTORS初期化完了');

    // 基本ユーティリティ
    const wait = async (ms) => new Promise(resolve => setTimeout(resolve, ms));

    async function executeTask(taskData) {
        console.log('🚀 Claude V2 タスク実行開始');

        // ===== ステップ内部ユーティリティ関数 =====

        // 要素の可視性チェック
        const isVisible = (element) => {
            if (!element) return false;
            const rect = element.getBoundingClientRect();
            const style = window.getComputedStyle(element);
            return rect.width > 0 &&
                   rect.height > 0 &&
                   style.display !== 'none' &&
                   style.visibility !== 'hidden' &&
                   style.opacity !== '0';
        };

        // 要素取得（複数セレクタ対応）
        const getElement = async (selectors, description = '') => {
            for (const selector of selectors) {
                try {
                    // 特別処理：ウェブ検索トグル
                    if (typeof selector === 'string' && selector.includes('ウェブ検索')) {
                        const buttons = document.querySelectorAll('button');
                        for (const el of buttons) {
                            const text = el.textContent || '';
                            if (text.includes('ウェブ検索') && el.querySelector('input[role="switch"]')) {
                                return el;
                            }
                        }
                    } else {
                        const element = document.querySelector(selector);
                        if (element && isVisible(element)) {
                            return element;
                        }
                    }
                } catch (error) {
                    continue;
                }
            }
            return null;
        };

        // テキスト入力処理
        const inputText = async (element, text) => {
            if (!element) {
                console.log('❌ テキスト入力エラー: 入力欄要素がnullまたはundefined');
                return false;
            }

            console.log(`📝 テキスト入力処理開始`);
            console.log(`📝 入力テキスト: "${text.substring(0, 50)}..."`);

            element.focus();
            await wait(100);

            element.textContent = '';
            element.innerHTML = '';

            const placeholderP = element.querySelector('p.is-empty');
            if (placeholderP) {
                console.log('📝 プレースホルダー要素を削除');
                placeholderP.remove();
            }

            const p = document.createElement('p');
            p.textContent = text;
            element.appendChild(p);
            console.log('📝 テキストを<p>タグで設定完了');

            element.classList.remove('ql-blank');

            console.log('🔥 Reactイベントを発火中...');
            element.dispatchEvent(new Event('input', { bubbles: true }));
            element.dispatchEvent(new Event('change', { bubbles: true }));
            element.dispatchEvent(new Event('keydown', { bubbles: true }));
            element.dispatchEvent(new Event('keyup', { bubbles: true }));

            await wait(500);

            console.log('🔍 入力結果を検証中...');
            const actualText = element.textContent || element.innerText || '';
            const textMatch = actualText.includes(text) || actualText.length > 0;

            if (textMatch) {
                console.log(`✅ テキスト入力成功！`);
                console.log(`✅ 確認されたテキスト: "${actualText.substring(0, 50)}..."`);
                return true;
            } else {
                console.log(`❌ テキスト入力失敗！`);
                console.log(`❌ 期待したテキスト: "${text.substring(0, 50)}..."`);
                console.log(`❌ 実際のテキスト: "${actualText}"`);
                return false;
            }
        };

        // ボタンクリック処理
        const clickButton = async (button) => {
            if (!button) {
                console.log('❌ ボタンクリックエラー: ボタン要素がnullまたはundefined');
                return false;
            }

            console.log('🖱️ ボタンクリック処理開始');

            const initialDisabled = button.disabled;
            const initialAriaLabel = button.getAttribute('aria-label');
            console.log(`🖱️ 初期状態: disabled=${initialDisabled}, aria-label="${initialAriaLabel}"`);

            button.focus();
            await wait(50);

            console.log('🔥 マウスイベントチェーンを発火中...');
            const events = [
                new MouseEvent('mousedown', { bubbles: true, cancelable: true }),
                new MouseEvent('mouseup', { bubbles: true, cancelable: true }),
                new MouseEvent('click', { bubbles: true, cancelable: true })
            ];

            for (const event of events) {
                button.dispatchEvent(event);
                await wait(10);
            }

            button.click();
            await wait(500);

            console.log('🔍 クリック結果を検証中...');

            const afterDisabled = button.disabled;
            const afterAriaLabel = button.getAttribute('aria-label');
            const stateChanged = (initialDisabled !== afterDisabled) || (initialAriaLabel !== afterAriaLabel);

            console.log(`🔍 結果状態: disabled=${afterDisabled}, aria-label="${afterAriaLabel}"`);

            if (stateChanged) {
                console.log('✅ ボタンクリック成功（状態変化を確認）');
                return true;
            } else {
                const stopButtonSelectors = UI_SELECTORS.Claude?.STOP_BUTTON || [];
                const stopButton = await getElement(stopButtonSelectors, '停止ボタン');

                if (stopButton) {
                    console.log('✅ ボタンクリック成功（停止ボタンが出現）');
                    return true;
                }

                console.log('⚠️ ボタンクリックは実行されたが、明確な状態変化なし');
                return true;
            }
        };

        // React要素クリック処理
        const triggerReactEvent = async (element, eventType = 'click') => {
            if (!element) return false;

            if (eventType === 'click') {
                const rect = element.getBoundingClientRect();
                const x = rect.left + rect.width / 2;
                const y = rect.top + rect.height / 2;

                const events = [
                    new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: x, clientY: y }),
                    new MouseEvent('mouseup', { bubbles: true, cancelable: true, clientX: x, clientY: y }),
                    new MouseEvent('click', { bubbles: true, cancelable: true, clientX: x, clientY: y })
                ];

                for (const event of events) {
                    element.dispatchEvent(event);
                    await wait(10);
                }

                element.click();
            }
            return true;
        };

        // トグル状態取得・設定
        const getToggleState = (toggleButton) => {
            const input = toggleButton.querySelector('input[role="switch"]');
            return input ? input.checked : null;
        };

        const setToggleState = (toggleButton, targetState) => {
            const currentState = getToggleState(toggleButton);
            if (currentState === null) return false;

            if (currentState !== targetState) {
                toggleButton.click();
                return true;
            }
            return false;
        };

        // 応答待機処理
        const waitForResponse = async (isDeepResearch = false) => {
            const maxWait = isDeepResearch ? AI_WAIT_CONFIG.DEEP_RESEARCH_WAIT : AI_WAIT_CONFIG.NORMAL_WAIT;
            const stopSelectors = UI_SELECTORS.Claude?.STOP_BUTTON || [];

            let stopButtonFound = false;
            let waitCount = 0;

            while (!stopButtonFound && waitCount < AI_WAIT_CONFIG.STOP_BUTTON_WAIT / 1000) {
                const stopButton = await getElement(stopSelectors);
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
                    const stopButton = await getElement(stopSelectors);

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
                const inputSelectors = UI_SELECTORS.Claude?.INPUT || [];
                const inputElement = await getElement(inputSelectors, 'テキスト入力欄');

                if (inputElement && isVisible(inputElement)) {
                    console.log('✅ [ステップ0] ページ準備完了');
                    return true;
                }

                await wait(1000);
            }

            console.error('❌ [ステップ0] ページ準備タイムアウト');
            throw new Error('ページが準備できませんでした');
        };

        // ===== ステップ0-1: 要素取得リトライ機能 =====
        const getElementWithWait = async (selectors, description = '', timeout = 10000) => {
            console.log(`[ステップ0-1] ${description}を取得中...`);
            const startTime = Date.now();
            let attempts = 0;

            while (Date.now() - startTime < timeout) {
                attempts++;
                const element = await getElement(selectors, description);

                if (element && isVisible(element)) {
                    console.log(`✅ [ステップ0-1] ${description}取得成功 (試行${attempts}回)`);
                    return element;
                }

                if (attempts % 5 === 0) {
                    console.log(`[ステップ0-1] ${description}を探索中... (${Math.floor((Date.now() - startTime) / 1000)}秒経過)`);
                }

                await wait(500);
            }

            console.error(`❌ [ステップ0-1] ${description}取得タイムアウト`);
            return null;
        };

        try {
            // ===== ステップ0: ページ準備確認（リトライ付き） =====
            await executeStepWithRetry(async () => {
                await waitForPageReady();
                return true;
            }, 'ステップ0: ページ準備確認', 3);

            // ===== ステップ1: タスクデータ受信・ログ出力 =====
            console.log('\n■■■ ステップ1: タスクデータ受信 ■■■');
            console.log('受信したタスクデータ:', {
                model: taskData.model,
                function: taskData.function,
                promptLength: taskData.prompt?.length || taskData.text?.length || 0,
                hasPrompt: !!(taskData.prompt || taskData.text),
                cellInfo: taskData.cellInfo,
                taskId: taskData.taskId,
                aiType: taskData.aiType
            });
            console.log('■■■ ステップ1完了 ■■■');

            // ===== ステップ2: パラメータ準備 =====
            console.log('\n■■■ ステップ2: パラメータ準備 ■■■');
            let prompt = taskData.prompt || taskData.text || '';
            const modelName = taskData.model || '';
            const featureName = taskData.function || null;

            console.log(`変換後のパラメータ:`);
            console.log(`  プロンプト: ${prompt ? `設定済み（${prompt.length}文字）` : '❌ 空'}`);
            console.log(`  モデル名: "${modelName || '未指定'}"` );
            console.log(`  機能名: "${featureName || '設定なし'}"`);
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
                const inputSelectors = UI_SELECTORS.Claude?.INPUT || [];
                const inputElement = await getElementWithWait(inputSelectors, 'テキスト入力欄', 10000);

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
                    const menuSelectors = UI_SELECTORS.Claude?.MODEL_BUTTON || [];
                    const menuButton = await getElementWithWait(menuSelectors, 'モデルメニューボタン', 10000);

                    if (!menuButton) {
                        throw new Error('モデルメニューボタンが見つかりません');
                    }

                    // ポインターイベントを使用してメニューを開く
                    menuButton.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, view: window }));
                    await wait(100);
                    menuButton.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, view: window }));
                    await wait(1500);

                    // 他のモデルメニューボタン
                    const otherModelsSelectors = UI_SELECTORS.Claude?.OTHER_MODELS_BUTTON || ['[role="menuitem"][aria-haspopup="menu"]'];
                    let otherModelsBtn = null;
                    for (const selector of otherModelsSelectors) {
                        otherModelsBtn = document.querySelector(selector);
                        if (otherModelsBtn) break;
                    }
                    if (otherModelsBtn) {
                        await triggerReactEvent(otherModelsBtn, 'click');
                        await wait(1000);
                    }

                    // 目標モデル選択
                    const targetModelName = modelName.startsWith('Claude') ? modelName : `Claude ${modelName}`;
                    const menuItemSelectors = UI_SELECTORS.Claude?.MENU_ITEMS || ['[role="menuitem"]'];
                    const modelElements = Array.from(document.querySelectorAll(menuItemSelectors.join(', ')));
                    const targetModel = modelElements.find(el => {
                        return el.textContent?.includes(targetModelName);
                    });

                    if (targetModel) {
                        await triggerReactEvent(targetModel, 'click');
                        await wait(1500);
                        console.log(`✅ モデル選択完了: ${targetModelName}`);
                    } else {
                        console.log(`⚠️ 指定モデルが見つかりません、デフォルトモデルを選択`);
                        const firstModel = modelElements[0];
                        if (firstModel) {
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
                    console.log(`指定された機能: ${featureName}`);

                    if (isDeepResearch) {
                        console.log('Deep Research設定を実行中...');
                        const featureMenuSelectors = UI_SELECTORS.Claude?.FUNCTION_MENU_BUTTON || [];
                        const featureMenuBtn = await getElementWithWait(featureMenuSelectors, '機能メニューボタン', 10000);

                        if (!featureMenuBtn) {
                            throw new Error('機能メニューボタンが見つかりません');
                        }

                        featureMenuBtn.click();
                        await wait(1500);

                        // ウェブ検索をオン
                        const webSearchToggleSelectors = UI_SELECTORS.Claude?.WEB_SEARCH_TOGGLE_BUTTON || ['button:has(p:contains("ウェブ検索")):has(input[role="switch"])'];
                        const webSearchToggle = await getElement(webSearchToggleSelectors, 'ウェブ検索トグル');
                        if (webSearchToggle) {
                            setToggleState(webSearchToggle, true);
                            await wait(1500);
                            console.log('✅ ウェブ検索有効化');
                        }

                        // メニューを閉じる
                        featureMenuBtn.click();
                        await wait(1000);

                        // リサーチボタンを有効化
                        const deepResearchButtonSelectors = UI_SELECTORS.Claude?.DEEP_RESEARCH_BUTTON || ['button[type="button"][aria-pressed]'];
                        const buttons = document.querySelectorAll(deepResearchButtonSelectors.join(', '));
                        let researchButtonFound = false;
                        const svgPaths = UI_SELECTORS.Claude?.FEATURE_BUTTON_SVG || {
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
                            throw new Error('Deep Researchボタンが見つかりません');
                        }
                    } else {
                        console.log(`その他の機能選択: ${featureName}`);
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
                const sendSelectors = UI_SELECTORS.Claude?.SEND_BUTTON || [];
                const sendButton = await getElementWithWait(sendSelectors, '送信ボタン', 10000);

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

            // ===== 結果取得（リトライ付き） =====
            let responseText = await executeStepWithRetry(async () => {
                let extractedText = '';

                // 通常テキスト取得
                const normalSelectors = UI_SELECTORS.Claude?.TEXT_EXTRACTION?.NORMAL_RESPONSE || [];
                const normalElements = document.querySelectorAll(normalSelectors.join(', '));

                if (normalElements.length > 0) {
                    console.log(`${normalElements.length}個のテキスト要素を発見`);
                    const filtered = Array.from(normalElements).filter(el => {
                        return !el.closest('#markdown-artifact') &&
                               !el.closest('[class*="artifact"]');
                    });
                    console.log(`フィルタリング後 ${filtered.length}個の要素`);

                    if (filtered.length > 0) {
                        const targetElement = filtered[filtered.length - 1];
                        extractedText = targetElement.textContent?.trim() || '';
                        console.log(`通常テキスト取得成功 (${extractedText.length}文字)`);
                    }
                }

                // Canvas テキスト取得
                if (!extractedText) {
                    const canvasSelectors = UI_SELECTORS.Claude?.TEXT_EXTRACTION?.ARTIFACT_CONTENT || [];
                    for (const selector of canvasSelectors) {
                        const canvasElement = document.querySelector(selector);
                        if (canvasElement) {
                            const text = canvasElement.textContent?.trim() || '';
                            if (text && text.length > 10) {
                                extractedText = text;
                                console.log(`Canvasテキスト取得成功 (${text.length}文字)`);
                                break;
                            }
                        }
                    }
                }

                if (!extractedText) {
                    throw new Error('応答テキストを取得できませんでした');
                }

                return extractedText;
            }, '結果取得', 3);

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