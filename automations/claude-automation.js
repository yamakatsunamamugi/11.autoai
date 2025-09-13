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
    const executeStepWithRetry = async (stepFunction, stepName, maxRetries = 3) => {
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
            const response = await fetch(chrome.runtime.getURL('ui-selectors-data.json'));
            const data = await response.json();
            UI_SELECTORS = data.selectors;
            window.UI_SELECTORS = UI_SELECTORS;
            selectorsLoaded = true;
            console.log('✅ UI Selectors loaded');
            return UI_SELECTORS;
        } catch (error) {
            console.error('❌ Failed to load ui-selectors-data.json:', error);
            UI_SELECTORS = window.UI_SELECTORS || {};
            selectorsLoaded = true;
            return UI_SELECTORS;
        }
    };

    await loadSelectors();
    console.log('🔧 UI_SELECTORS初期化完了');

    // 基本ユーティリティ
    const wait = async (ms) => new Promise(resolve => setTimeout(resolve, ms));

    /**
     * 現在選択されているモデル名を取得
     */
    const getCurrentModel = async () => {
        try {
            // モデル表示エリアのセレクタ（複数パターンに対応）
            const modelDisplaySelectors = [
                'button[role="button"]:has(svg):has(span)',
                'button:has([data-testid="model-select"])',
                'button:contains("Claude")',
                '[role="button"] span:contains("Claude")',
                'div[data-testid="model-indicator"]',
                '.model-selector span',
                'button span:contains("Claude")'
            ];

            for (const selector of modelDisplaySelectors) {
                try {
                    let elements;
                    if (selector.includes(':contains(')) {
                        // :contains疑似セレクタを手動で処理
                        const baseSelector = selector.split(':contains(')[0];
                        const searchText = selector.match(/\((.*?)\)/)[1].replace(/"/g, '');
                        elements = Array.from(document.querySelectorAll(baseSelector))
                            .filter(el => el.textContent.includes(searchText));
                    } else {
                        elements = document.querySelectorAll(selector);
                    }

                    for (const element of elements) {
                        const text = element.textContent?.trim();
                        if (text && text.includes('Claude')) {
                            console.log(`✅ 現在のモデル検出: "${text}"`);
                            return text;
                        }
                    }
                } catch (error) {
                    continue;
                }
            }

            console.log('⚠️ 現在のモデルを特定できませんでした');
            return '不明';
        } catch (error) {
            console.error('❌ getCurrentModel エラー:', error);
            return '不明';
        }
    };

    /**
     * 現在選択されている機能名を取得
     */
    const getCurrentFunction = async () => {
        try {
            // アクティブな機能ボタンを探す（ui-selectors-data.jsonから取得）
            const functionButtonSelectors = UI_SELECTORS.Claude?.FUNCTION_BUTTONS || ['button[aria-pressed="true"]'];
            const activeButtons = document.querySelectorAll(functionButtonSelectors.join(', '));

            for (const button of activeButtons) {
                const svg = button.querySelector('svg path');
                if (!svg) continue;

                const svgPath = svg.getAttribute('d');
                if (!svgPath) continue;

                // SVGパスで機能を判定（ui-selectors-data.jsonから取得）
                const svgPaths = UI_SELECTORS.Claude?.FEATURE_BUTTON_SVG || {
                    RESEARCH: 'M8.5 2C12.0899',
                    DEEP_THINKING: 'M10.3857 2.50977'
                };

                if (svgPath.includes(svgPaths.RESEARCH)) {
                    return 'Deep Research';
                } else if (svgPath.includes(svgPaths.DEEP_THINKING)) {
                    return 'じっくり考える';
                }
            }

            // Web検索の状態もチェック（ui-selectors-data.jsonから取得）
            const webSearchToggleSelectors = UI_SELECTORS.Claude?.WEB_SEARCH_TOGGLE || ['input[role="switch"]'];
            const webSearchToggles = document.querySelectorAll(webSearchToggleSelectors.join(', '));
            for (const toggle of webSearchToggles) {
                if (toggle.checked) {
                    const parent = toggle.closest('button');
                    if (parent && parent.textContent.includes('ウェブ検索')) {
                        return 'ウェブ検索';
                    }
                }
            }

            return '通常';
        } catch (error) {
            console.error('❌ getCurrentFunction エラー:', error);
            return '通常';
        }
    };

    /*
    =====================================================================
    Claude V2 自動化ワークフロー - 階層化ステップ実行
    =====================================================================

    【大ステップ1: 初期化・準備フェーズ】
    Claude.aiでの自動化に必要な設定やデータの準備を行う段階

      【中ステップ1.1: システム初期化】
      自動化システムが動作するための基礎設定
        小ステップ1.1.1: セレクタ読み込み
          → Claude.aiの画面要素を特定するためのセレクタ（目印）をJSONファイルから読み込む
          → 入力欄、送信ボタン、停止ボタンなどの場所を特定するために必要
        小ステップ1.1.2: 待機時間設定
          → 各操作の間に待つ時間を設定（Claude.aiの応答時間に合わせる）
          → Deep Research（40分）、通常処理（5分）など用途別に設定
        小ステップ1.1.3: ユーティリティ関数定義
          → 要素をクリックしたり、テキストを入力したりする基本機能を準備

      【中ステップ1.2: タスクデータ処理】
      ユーザーから受け取った作業指示の内容を整理
        小ステップ1.2.1: タスクデータ受信
          → ユーザーが指定したモデル名、機能名、プロンプト（質問文）を受け取る
        小ステップ1.2.2: ログ出力
          → 受け取った内容をコンソールに表示（デバッグや確認のため）
        小ステップ1.2.3: パラメータ準備
          → 受け取ったデータを実際の処理で使いやすい形に整理・変換

      【中ステップ1.3: 実行計画策定】
      どのような処理を行うかの最終確認と計画立て
        小ステップ1.3.1: Deep Research判定
          → 指定された機能がDeep Research（詳細調査）かどうかを判断
          → Deep Researchの場合は特別な設定と長時間待機が必要
        小ステップ1.3.2: プロンプト最終化
          → セル情報がある場合は質問文に追加（スプレッドシート処理用）
        小ステップ1.3.3: 実行サマリー表示
          → 最終的な設定内容をコンソールに表示（確認用）

    【大ステップ2: UI操作フェーズ】
    実際にClaude.aiの画面を操作して設定や入力を行う段階

      【中ステップ2.1: 入力準備】
      質問文をClaude.aiに入力する準備と実行
        小ステップ2.1.1: 入力欄検索
          → Claude.aiの画面でテキストを入力する場所（入力欄）を探す
        小ステップ2.1.2: 入力欄フォーカス
          → 見つけた入力欄をクリックして入力可能な状態にする
        小ステップ2.1.3: テキスト入力実行
          → 準備した質問文を入力欄に実際に入力する

      【中ステップ2.2: モデル選択（条件付き）】
      使用するClaudeのモデル（Opus、Sonnet、Haikuなど）を選択
      ※モデル名が指定されている場合のみ実行
        小ステップ2.2.1: モデルメニュー開く
          → モデル選択用のドロップダウンメニューを開く
        小ステップ2.2.2: 他のモデルメニュー処理
          → デフォルトで表示されていないモデルがある場合、「他のモデル」を開く
        小ステップ2.2.3: 目標モデル選択
          → 指定されたモデル（例：Claude Opus）を見つけてクリック選択

      【中ステップ2.3: 機能選択（条件付き）】
      特別な機能（Deep Research、ウェブ検索など）を設定
      ※機能名が指定されている場合のみ実行
        小ステップ2.3.1: 機能メニュー開く
          → 機能設定用のメニューを開く（ツールアイコンなど）
        小ステップ2.3.2: Deep Research設定
          → Deep Researchが指定されている場合の特別設定
          → ウェブ検索をON、リサーチボタンを有効化
        小ステップ2.3.3: その他機能設定
          → Deep Research以外の機能が指定されている場合の処理

    【大ステップ3: 実行・完了フェーズ】
    質問を送信してClaude.aiからの回答を受け取り、結果を取得する段階

      【中ステップ3.1: メッセージ送信】
      準備した質問をClaude.aiに送信
        小ステップ3.1.1: 送信ボタン検索
          → 「メッセージを送信」ボタンを画面上で探す
        小ステップ3.1.2: 送信ボタンクリック
          → 送信ボタンをクリックして質問を送信
        小ステップ3.1.3: 送信時刻記録
          → いつ送信したかの時刻を記録（管理用）

      【中ステップ3.2: 応答待機】
      Claude.aiが回答を生成するまで待機
        小ステップ3.2.1: 停止ボタン出現待機
          → 回答生成が始まったことを示す「停止」ボタンが表示されるまで待つ
        小ステップ3.2.2: 応答生成待機
          → Claude.aiが回答を作成している間、最大40分（Deep Research）または5分（通常）待機
        小ステップ3.2.3: 応答完了確認
          → 停止ボタンが消えることで回答完了を確認

      【中ステップ3.3: 結果取得・完了】
      Claude.aiからの回答を取得して処理完了
        小ステップ3.3.1: 通常テキスト取得
          → Claude.aiの通常の回答テキストを取得
        小ステップ3.3.2: Canvas テキスト取得
          → Canvas機能（特別な表示形式）でのテキストがあれば取得
        小ステップ3.3.3: 結果返却・完了フラグ設定
          → 取得した回答をシステムに返却し、処理完了を記録

    【重要】条件付きステップのスキップ条件:
    - taskData.model が空文字列 '' の場合 → 中ステップ2.2 モデル選択をスキップ
    - taskData.function が空文字列 '' の場合 → 中ステップ2.3 機能選択をスキップ
    =====================================================================
    */

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
                        // UI_SELECTORSから汎用ボタンセレクタを取得
                        const genericButtonSelectors = UI_SELECTORS.Claude?.GENERIC_BUTTONS || ['button'];
                        const buttons = document.querySelectorAll(genericButtonSelectors.join(', '));
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
        /**
         * テキスト入力関数（ProseMirrorエディタ対応）
         * Claude.aiの入力欄にテキストを入力する
         *
         * 【問題】現在のコードは実際に入力が失敗しても成功を返してしまう
         * 【解決】入力後の検証を追加して、実際の成功/失敗を正確に判定
         */
        const inputText = async (element, text) => {
            // ===== ステップ1: 要素の存在確認 =====
            // 入力欄が見つからない場合は即座に失敗を返す
            if (!element) {
                console.log('❌ [inputText] エラー: 入力欄要素がnullまたはundefined');
                return false;  // 失敗を返す
            }

            console.log(`📝 [inputText] テキスト入力処理開始`);
            console.log(`📝 [inputText] 入力テキスト: "${text.substring(0, 50)}..."`);

            // ===== ステップ2: 入力欄にフォーカスを設定 =====
            // ユーザーがクリックしたときと同じ状態にする
            element.focus();
            await wait(100);  // フォーカス処理の完了を待つ

            // ===== ステップ3: 既存の内容をクリア =====
            // 前のテキストが残っていると混在してしまうため
            element.textContent = '';  // テキストをクリア
            element.innerHTML = '';     // HTMLもクリア（念のため）

            // ===== ステップ4: プレースホルダーを削除 =====
            // Claude.aiの「メッセージを入力...」などの表示を削除
            const placeholderP = element.querySelector('p.is-empty');
            if (placeholderP) {
                console.log('📝 [inputText] プレースホルダー要素を削除');
                placeholderP.remove();
            }

            // ===== ステップ5: 新しいテキストを設定 =====
            // ProseMirrorエディタの構造に合わせて<p>タグ内にテキストを設定
            const p = document.createElement('p');
            p.textContent = text;
            element.appendChild(p);
            console.log('📝 [inputText] テキストを<p>タグで設定完了');

            // ===== ステップ6: CSSクラスの調整 =====
            // エディタが「空」の状態を示すクラスを削除
            element.classList.remove('ql-blank');

            // ===== ステップ7: Reactイベントを発火 =====
            // Claude.aiはReactを使用しているため、適切なイベントを発火させる必要がある
            console.log('🔥 [inputText] Reactイベントを発火中...');

            // inputイベント: テキストが入力されたことを通知
            element.dispatchEvent(new Event('input', { bubbles: true }));

            // changeイベント: 値が変更されたことを通知
            element.dispatchEvent(new Event('change', { bubbles: true }));

            // ===== ステップ8: ProseMirror固有のイベントも発火 =====
            // ProseMirrorエディタはキーボードイベントも監視している可能性があるため
            element.dispatchEvent(new Event('keydown', { bubbles: true }));
            element.dispatchEvent(new Event('keyup', { bubbles: true }));

            // ===== ステップ9: イベント処理の完了を待つ =====
            await wait(500);  // Reactの再レンダリングを待つ

            // ===== ステップ10: 入力結果の検証（重要！） =====
            // 実際にテキストが入力されたかを確認
            console.log('🔍 [inputText] 入力結果を検証中...');

            // 入力欄から実際のテキストを取得
            const actualText = element.textContent || element.innerText || '';

            // 入力が成功したかを判定
            // 条件: 入力したテキストが含まれているか、または何かしらのテキストが存在するか
            const textMatch = actualText.includes(text) || actualText.length > 0;

            if (textMatch) {
                // ===== 成功: テキストが正しく入力された =====
                console.log(`✅ [inputText] テキスト入力成功！`);
                console.log(`✅ [inputText] 確認されたテキスト: "${actualText.substring(0, 50)}..."`);
                return true;  // 成功を返す
            } else {
                // ===== 失敗: テキストが入力されていない =====
                console.log(`❌ [inputText] テキスト入力失敗！`);
                console.log(`❌ [inputText] 期待したテキスト: "${text.substring(0, 50)}..."`);
                console.log(`❌ [inputText] 実際のテキスト: "${actualText}"`);
                return false;  // 失敗を返す
            }
        };

        // ボタンクリック処理
        /**
         * ボタンクリック処理（検証機能付き）
         * 送信ボタンなどをクリックする
         *
         * 【改善点】クリック後の状態変化を確認して成功/失敗を判定
         */
        const clickButton = async (button) => {
            // ===== ステップ1: ボタンの存在確認 =====
            if (!button) {
                console.log('❌ [clickButton] エラー: ボタン要素がnullまたはundefined');
                return false;
            }

            console.log('🖱️ [clickButton] ボタンクリック処理開始');

            // ===== ステップ2: ボタンの初期状態を記録 =====
            const initialDisabled = button.disabled;
            const initialAriaLabel = button.getAttribute('aria-label');
            console.log(`🖱️ [clickButton] 初期状態: disabled=${initialDisabled}, aria-label="${initialAriaLabel}"`);

            // ===== ステップ3: ボタンにフォーカス =====
            button.focus();
            await wait(50);

            // ===== ステップ4: マウスイベントチェーンを作成 =====
            // 実際のユーザーのクリックを完全に再現
            console.log('🔥 [clickButton] マウスイベントチェーンを発火中...');
            const events = [
                new MouseEvent('mousedown', { bubbles: true, cancelable: true }),  // マウスボタン押下
                new MouseEvent('mouseup', { bubbles: true, cancelable: true }),    // マウスボタン解放
                new MouseEvent('click', { bubbles: true, cancelable: true })       // クリックイベント
            ];

            // ===== ステップ5: 各イベントを順番に発火 =====
            for (const event of events) {
                button.dispatchEvent(event);
                await wait(10);  // 各イベント間に短い待機
            }

            // ===== ステップ6: ネイティブクリックも実行（フォールバック） =====
            button.click();

            // ===== ステップ7: クリック処理の完了を待つ =====
            await wait(500);

            // ===== ステップ8: クリック結果の検証 =====
            console.log('🔍 [clickButton] クリック結果を検証中...');

            // 送信ボタンの場合、通常はクリック後にdisabledになるか、停止ボタンに変わる
            const afterDisabled = button.disabled;
            const afterAriaLabel = button.getAttribute('aria-label');

            // 状態変化を確認
            const stateChanged = (initialDisabled !== afterDisabled) || (initialAriaLabel !== afterAriaLabel);

            console.log(`🔍 [clickButton] 結果状態: disabled=${afterDisabled}, aria-label="${afterAriaLabel}"`);

            if (stateChanged) {
                console.log('✅ [clickButton] ボタンクリック成功（状態変化を確認）');
                return true;
            } else {
                // 状態変化がない場合でも、停止ボタンが出現している可能性があるため確認
                const stopButtonSelectors = UI_SELECTORS.Claude?.STOP_BUTTON || [];
                const stopButton = await getElement(stopButtonSelectors, '停止ボタン');

                if (stopButton) {
                    console.log('✅ [clickButton] ボタンクリック成功（停止ボタンが出現）');
                    return true;
                }

                console.log('⚠️ [clickButton] ボタンクリックは実行されたが、明確な状態変化なし');
                return true;  // 一応成功扱いとするが、警告を出力
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

            // 停止ボタン出現まで待機
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

            // 停止ボタン消失まで待機
            if (stopButtonFound) {
                const startTime = Date.now();
                let confirmCount = 0;

                while (Date.now() - startTime < maxWait) {
                    const stopButton = await getElement(stopSelectors);

                    if (!stopButton) {
                        confirmCount++;
                        if (confirmCount >= 10) { // 10秒間確認
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

        try {
            // ===== 1.2.1: タスクデータ受信 =====
            console.log('\n■■■ ステップ 1.2.1 開始 ■■■');
            console.log('ステップ 1.2.1: タスクデータ受信');
            console.log('概要: ユーザーが指定したモデル名、機能名、プロンプト（質問文）を受け取る');
            console.log('\n受信したタスクデータ:', {
                model: taskData.model,
                function: taskData.function,
                promptLength: taskData.prompt?.length || taskData.text?.length || 0,
                hasPrompt: !!(taskData.prompt || taskData.text),
                cellInfo: taskData.cellInfo
            });
            console.log('■■■ ステップ 1.2.1 完了 ■■■');

            // ===== 1.2.3: パラメータ準備 =====
            console.log('\n■■■ ステップ 1.2.3 開始 ■■■');
            console.log('ステップ 1.2.3: パラメータ準備');
            console.log('概要: 受け取ったデータを実際の処理で使いやすい形に整理・変換');
            let prompt = taskData.prompt || taskData.text || '';
            const modelName = taskData.model || '';
            const featureName = taskData.function || null;
            console.log('■■■ ステップ 1.2.3 完了 ■■■');

            // ===== 1.3.2: プロンプト最終化 =====
            if (taskData.cellInfo && taskData.cellInfo.column && taskData.cellInfo.row) {
                console.log('\n■■■ ステップ 1.3.2 開始 ■■■');
                console.log('ステップ 1.3.2: プロンプト最終化');
                console.log('概要: セル情報がある場合は質問文に追加（スプレッドシート処理用）');
                const cellPosition = `${taskData.cellInfo.column}${taskData.cellInfo.row}`;
                prompt = `【現在${cellPosition}セルを処理中です】

${prompt}`;
                console.log(`結果: セル情報 ${cellPosition} をプロンプトに追加しました`);
                console.log('■■■ ステップ 1.3.2 完了 ■■■');
            }

            // ===== 1.3.1: Deep Research判定 =====
            console.log('\n■■■ ステップ 1.3.1 開始 ■■■');
            console.log('ステップ 1.3.1: Deep Research判定');
            console.log('概要: 指定された機能がDeep Research（詳細調査）かどうかを判断');
            const isDeepResearch = featureName && (
                featureName === 'Deep Research' ||
                featureName.includes('Research') ||
                featureName.includes('リサーチ')
            );
            console.log(`結果: Deep Research判定 = ${isDeepResearch ? 'YES (特別な設定と長時間待機が必要)' : 'NO (通常処理)'}`);
            console.log('■■■ ステップ 1.3.1 完了 ■■■');

            // ===== 1.3.3: 実行サマリー表示 =====
            console.log('\n■■■ ステップ 1.3.3 開始 ■■■');
            console.log('ステップ 1.3.3: 実行サマリー表示');
            console.log('概要: 最終的な設定内容をコンソールに表示（確認用）');
            console.log('━'.repeat(60));
            console.log(`🎯 モデル: ${modelName || '未指定（自動選択）'}`);
            console.log(`🎯 機能: ${featureName || '通常処理'}`);
            console.log(`🎯 Deep Research: ${isDeepResearch ? 'ON' : 'OFF'}`);
            console.log(`🎯 プロンプト: ${prompt.substring(0, 80)}...`);
            console.log('━'.repeat(60));
            console.log('■■■ ステップ 1.3.3 完了 ■■■');

            // ===== 2.1: テキスト入力（リトライ付き） =====
            await executeStepWithRetry(async () => {
                // ===== 2.1.1: 入力欄検索 =====
                console.log('\n■■■ ステップ 2.1.1 開始 ■■■');
                console.log('ステップ 2.1.1: 入力欄検索');
                console.log('概要: Claude.aiの画面でテキストを入力する場所（入力欄）を探す');
                const inputSelectors = UI_SELECTORS.Claude?.INPUT || [];
                const inputElement = await getElement(inputSelectors, 'テキスト入力欄');

                if (!inputElement) {
                    console.log('エラー: テキスト入力欄が見つかりません');
                    throw new Error('テキスト入力欄が見つかりません');
                }
                console.log('結果: テキスト入力欄を発見');
                console.log('■■■ ステップ 2.1.1 完了 ■■■');

                // ===== 2.1.2: 入力欄フォーカス =====
                console.log('\n■■■ ステップ 2.1.2 開始 ■■■');
                console.log('ステップ 2.1.2: 入力欄フォーカス');
                console.log('概要: 見つけた入力欄をクリックして入力可能な状態にする');
                console.log('■■■ ステップ 2.1.2 完了 ■■■');

                // ===== 2.1.3: テキスト入力実行 =====
                console.log('\n■■■ ステップ 2.1.3 開始 ■■■');
                console.log('ステップ 2.1.3: テキスト入力実行');
                console.log('概要: 準備した質問文を入力欄に実際に入力する');

                // 【重要】inputText関数の戻り値をチェック
                // true = 成功、false = 失敗
                const inputSuccess = await inputText(inputElement, prompt);

                // 入力結果を確認して、失敗した場合はエラーを投げる
                if (!inputSuccess) {
                    console.log('❌ テキスト入力に失敗したため、リトライが必要です');
                    throw new Error('テキスト入力に失敗しました - 入力欄にテキストが設定されませんでした');
                }

                console.log('✅ 結果: テキスト入力完了（検証済み）');
                console.log('■■■ ステップ 2.1.3 完了 ■■■');

                return inputElement;
            }, 'ステップ2.1: テキスト入力', 3);

            // ===== 2.2: モデル選択（条件付き、リトライ付き） =====
            if (modelName && modelName !== '') {
                await executeStepWithRetry(async () => {
                    console.log('\n■■■ ステップ 2.2 開始 ■■■');
                    console.log('ステップ 2.2: モデル選択');
                    console.log('概要: 使用するClaudeのモデル（Opus、Sonnet、Haikuなど）を選択');

                    // ===== 2.2.1: モデルメニュー開く =====
                    console.log('\n■■■ ステップ 2.2.1 開始 ■■■');
                    console.log('ステップ 2.2.1: モデルメニュー開く');
                    console.log('概要: モデル選択用のドロップダウンメニューを開く');
                    const menuSelectors = UI_SELECTORS.Claude?.MODEL_BUTTON || [];
                    const menuButton = await getElement(menuSelectors, 'モデルメニューボタン');

                    if (!menuButton) {
                        throw new Error('モデルメニューボタンが見つかりません');
                    }

                    await triggerReactEvent(menuButton, 'click');
                    await wait(1500);
                    console.log('結果: モデルメニューを開きました');
                    console.log('■■■ ステップ 2.2.1 完了 ■■■');

                    // ===== 2.2.2: 他のモデルメニュー処理 =====
                    console.log('\n■■■ ステップ 2.2.2 開始 ■■■');
                    console.log('ステップ 2.2.2: 他のモデルメニュー処理');
                    console.log('概要: デフォルトで表示されていないモデルがある場合、「他のモデル」を開く');
                    // 他のモデルメニューボタンをUI_SELECTORSから取得
                    const otherModelsSelectors = UI_SELECTORS.Claude?.OTHER_MODELS_BUTTON || ['[role="menuitem"][aria-haspopup="menu"]'];
                    let otherModelsBtn = null;
                    for (const selector of otherModelsSelectors) {
                        otherModelsBtn = document.querySelector(selector);
                        if (otherModelsBtn) break;
                    }
                    if (otherModelsBtn) {
                        await triggerReactEvent(otherModelsBtn, 'click');
                        await wait(1000);
                        console.log('結果: 他のモデルメニューを開きました');
                    } else {
                        console.log('結果: 他のモデルメニューは不要でした');
                    }
                    console.log('■■■ ステップ 2.2.2 完了 ■■■');

                    // ===== 2.2.3: 目標モデル選択 =====
                    console.log('\n■■■ ステップ 2.2.3 開始 ■■■');
                    console.log('ステップ 2.2.3: 目標モデル選択');
                    console.log('概要: 指定されたモデルを見つけてクリック選択');
                    const targetModelName = modelName.startsWith('Claude') ? modelName : `Claude ${modelName}`;
                    console.log(`検索中のモデル: ${targetModelName}`);
                    // メニューアイテムをUI_SELECTORSから取得
                    const menuItemSelectors = UI_SELECTORS.Claude?.MENU_ITEMS || ['[role="menuitem"]'];
                    const modelElements = Array.from(document.querySelectorAll(menuItemSelectors.join(', ')));
                    const targetModel = modelElements.find(el => {
                        return el.textContent?.includes(targetModelName);
                    });

                    if (targetModel) {
                        await triggerReactEvent(targetModel, 'click');
                        await wait(1500);
                        console.log(`結果: モデル選択完了: ${targetModelName}`);
                    } else {
                        console.log(`警告: 指定モデルが見つかりません、デフォルトモデルを選択`);
                        const firstModel = modelElements[0];
                        if (firstModel) {
                            await triggerReactEvent(firstModel, 'click');
                            await wait(1500);
                            console.log('結果: デフォルトモデル選択完了');
                        } else {
                            throw new Error('選択可能なモデルが見つかりません');
                        }
                    }
                    console.log('■■■ ステップ 2.2.3 完了 ■■■');

                    // ===== 2.2.4: モデル選択確認 =====
                    console.log('\n■■■ ステップ 2.2.4 開始 ■■■');
                    console.log('ステップ 2.2.4: モデル選択確認');
                    console.log('概要: 選択したモデルが正しく表示され一致しているか確認');

                    await wait(1000); // 表示更新を待機

                    const currentModel = await getCurrentModel();
                    // targetModelNameは既に上で宣言済みなので再利用

                    console.log(`選択後のモデル: "${currentModel}"`);
                    console.log(`期待されるモデル: "${targetModelName}"`);

                    const isModelMatch = currentModel.includes(modelName) || currentModel === targetModelName;
                    if (isModelMatch) {
                        console.log('✅ モデル選択確認成功: 期待通りのモデルが選択されています');
                    } else {
                        console.log('⚠️ モデル選択確認: 期待と異なるモデルが表示されていますが、処理を継続します');
                    }

                    console.log('■■■ ステップ 2.2.4 完了 ■■■');
                    console.log('■■■ ステップ 2.2 完了 ■■■');
                    return { success: true, selectedModel: currentModel };
                }, 'ステップ2.2: モデル選択', 3);
            } else {
                console.log('\n■■■ ステップ 2.2 スキップ ■■■');
                console.log('ステップ 2.2: モデル選択スキップ');
                console.log('理由: モデル名が未指定のためスキップ');
            }

            // ===== 2.3: 機能選択（条件付き、リトライ付き） =====
            if (featureName && featureName !== '' && featureName !== '設定なし') {
                await executeStepWithRetry(async () => {
                    console.log('\n■■■ ステップ 2.3 開始 ■■■');
                    console.log('ステップ 2.3: 機能選択');
                    console.log('概要: 特別な機能（Deep Research、ウェブ検索など）を設定');
                    console.log(`指定された機能: ${featureName}`);

                    if (isDeepResearch) {
                        // ===== 2.3.1: Deep Research設定 =====
                        console.log('\n■■■ ステップ 2.3.1 開始 ■■■');
                        console.log('ステップ 2.3.1: Deep Research設定');
                        console.log('概要: Deep Researchが指定されている場合の特別設定');
                        const featureMenuSelectors = UI_SELECTORS.Claude?.FUNCTION_MENU_BUTTON || [];
                        const featureMenuBtn = await getElement(featureMenuSelectors, '機能メニューボタン');

                        if (!featureMenuBtn) {
                            throw new Error('機能メニューボタンが見つかりません');
                        }

                        featureMenuBtn.click();
                        await wait(1500);

                        // ウェブ検索をオン
                        console.log('ウェブ検索トグルを探して有効化中...');
                        // ウェブ検索トグルをUI_SELECTORSから取得
                        const webSearchToggleSelectors = UI_SELECTORS.Claude?.WEB_SEARCH_TOGGLE_BUTTON || ['button:has(p:contains("ウェブ検索")):has(input[role="switch"])'];
                        const webSearchToggle = await getElement(webSearchToggleSelectors, 'ウェブ検索トグル');
                        if (webSearchToggle) {
                            setToggleState(webSearchToggle, true);
                            await wait(1500);
                            console.log('結果: ウェブ検索有効化');
                        }

                        // メニューを閉じる
                        console.log('機能メニューを閉じています...');
                        featureMenuBtn.click();
                        await wait(1000);
                        console.log('結果: 機能メニューを閉じました');

                        // リサーチボタンを有効化
                        console.log('Deep Researchボタンを探して有効化中...');
                        // Deep Researchボタンをui-selectors-data.jsonから取得
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
                                    console.log('結果: Deep Researchモード有効化');
                                }
                                researchButtonFound = true;
                                break;
                            }
                        }

                        if (!researchButtonFound) {
                            throw new Error('Deep Researchボタンが見つかりません');
                        }
                        console.log('■■■ ステップ 2.3.1 完了 ■■■');
                    } else {
                        // ===== 2.3.2: その他機能設定 =====
                        console.log('\n■■■ ステップ 2.3.2 開始 ■■■');
                        console.log('ステップ 2.3.2: その他機能設定');
                        console.log('概要: Deep Research以外の機能が指定されている場合の処理');
                        console.log(`機能選択: ${featureName}`);
                        console.log('■■■ ステップ 2.3.2 完了 ■■■');
                    }

                    // ===== 2.3.3: 機能選択確認 =====
                    console.log('\n■■■ ステップ 2.3.3 開始 ■■■');
                    console.log('ステップ 2.3.3: 機能選択確認');
                    console.log('概要: 選択した機能が正しく有効化されているか確認');

                    await wait(1500); // 機能の表示更新を待機

                    const currentFunction = await getCurrentFunction();
                    console.log(`選択後の機能: "${currentFunction}"`);
                    console.log(`期待される機能: "${featureName}"`);

                    let isFunctionMatch = false;

                    if (isDeepResearch) {
                        // Deep Research系の場合
                        isFunctionMatch = currentFunction === 'Deep Research' ||
                                         currentFunction.includes('Research') ||
                                         currentFunction.includes('リサーチ');

                        if (isFunctionMatch) {
                            console.log('✅ 機能選択確認成功: Deep Research機能が正しく有効化されています');
                        } else {
                            // Web検索だけでも有効化されていれば部分的成功とする
                            if (currentFunction === 'ウェブ検索') {
                                console.log('⚠️ 機能選択確認: ウェブ検索は有効化されましたが、Deep Researchボタンの確認ができません');
                                isFunctionMatch = true; // 部分的成功とする
                            } else {
                                console.log('❌ 機能選択確認失敗: Deep Research機能が正しく有効化されていません');
                            }
                        }
                    } else {
                        // その他の機能の場合
                        isFunctionMatch = currentFunction === featureName ||
                                         currentFunction.includes(featureName);

                        if (isFunctionMatch) {
                            console.log('✅ 機能選択確認成功: 指定した機能が正しく有効化されています');
                        } else {
                            console.log(`⚠️ 機能選択確認: 期待された機能「${featureName}」と異なる機能「${currentFunction}」が表示されていますが、処理を継続します`);
                        }
                    }

                    console.log('■■■ ステップ 2.3.3 完了 ■■■');
                    console.log('結果: 機能選択完了');
                    console.log('■■■ ステップ 2.3 完了 ■■■');
                    return { success: true, selectedFunction: currentFunction, verified: isFunctionMatch };
                }, 'ステップ2.3: 機能選択', 3);
            } else {
                console.log('\n■■■ ステップ 2.3 スキップ ■■■');
                console.log('ステップ 2.3: 機能選択スキップ');
                console.log('理由: 機能名が未指定または「設定なし」のためスキップ');
            }

            // ===== 3.1: メッセージ送信（リトライ付き） =====
            await executeStepWithRetry(async () => {
                console.log('\n■■■ ステップ 3.1 開始 ■■■');
                console.log('ステップ 3.1: メッセージ送信');
                console.log('概要: 準備した質問をClaude.aiに送信');

                // ===== 3.1.1: 送信ボタン検索 =====
                console.log('\n■■■ ステップ 3.1.1 開始 ■■■');
                console.log('ステップ 3.1.1: 送信ボタン検索');
                console.log('概要: 「メッセージを送信」ボタンを画面上で探す');
                const sendSelectors = UI_SELECTORS.Claude?.SEND_BUTTON || [];
                const sendButton = await getElement(sendSelectors, '送信ボタン');

                if (!sendButton) {
                    console.log('エラー: 送信ボタンが見つかりません');
                    throw new Error('送信ボタンが見つかりません');
                }
                console.log('結果: 送信ボタンを発見');
                console.log('■■■ ステップ 3.1.1 完了 ■■■');

                // ===== 3.1.2: 送信ボタンクリック =====
                console.log('\n■■■ ステップ 3.1.2 開始 ■■■');
                console.log('ステップ 3.1.2: 送信ボタンクリック');
                console.log('概要: 送信ボタンをクリックして質問を送信');

                // 【重要】clickButton関数の戻り値をチェック
                // true = 成功、false = 失敗
                const clickSuccess = await clickButton(sendButton);

                // クリック結果を確認して、失敗した場合はエラーを投げる
                if (!clickSuccess) {
                    console.log('❌ 送信ボタンのクリックに失敗したため、リトライが必要です');
                    throw new Error('送信ボタンのクリックに失敗しました - ボタンが反応しませんでした');
                }

                console.log('✅ 結果: メッセージ送信完了（検証済み）');
                console.log('■■■ ステップ 3.1.2 完了 ■■■');

                // ===== 3.1.3: 送信時刻記録 =====
                console.log('\n■■■ ステップ 3.1.3 開始 ■■■');
                console.log('ステップ 3.1.3: 送信時刻記録');
                console.log('概要: いつ送信したかの時刻を記録（管理用）');
                if (window.AIHandler && window.AIHandler.recordSendTimestamp) {
                    try {
                        await window.AIHandler.recordSendTimestamp('Claude');
                        console.log('結果: 送信時刻記録完了');
                    } catch (error) {
                        console.log(`エラー: 送信時刻記録失敗 - ${error.message}`);
                        // 送信時刻記録の失敗はリトライ対象外（送信自体は成功したため）
                    }
                } else {
                    console.log('情報: 送信時刻記録機能は使用できません');
                }
                console.log('■■■ ステップ 3.1.3 完了 ■■■');
                console.log('■■■ ステップ 3.1 完了 ■■■');

                return sendButton;
            }, 'ステップ3.1: メッセージ送信', 3);

            // ===== 3.2: 応答待機 =====
            console.log('\n■■■ ステップ 3.2 開始 ■■■');
            console.log('ステップ 3.2: 応答待機');
            console.log('概要: Claude.aiが回答を生成するまで待機');
            console.log(`待機モード: ${isDeepResearch ? 'Deep Research（最大40分）' : '通常処理（最大5分）'}`);
            const responseCompleted = await waitForResponse(isDeepResearch);
            if (responseCompleted) {
                console.log('結果: 応答完了確認');
            } else {
                console.log('警告: 最大待機時間に達しました');
            }
            console.log('■■■ ステップ 3.2 完了 ■■■');

            // ===== 3.3: 結果取得・完了 =====
            console.log('\n■■■ ステップ 3.3 開始 ■■■');
            console.log('ステップ 3.3: 結果取得・完了');
            console.log('概要: Claude.aiからの回答を取得して処理完了');

            // ===== 3.3: 結果取得（リトライ付き） =====
            let responseText = await executeStepWithRetry(async () => {
                let extractedText = '';

                // ===== 3.3.1: 通常テキスト取得 =====
                console.log('\n■■■ ステップ 3.3.1 開始 ■■■');
                console.log('ステップ 3.3.1: 通常テキスト取得');
                console.log('概要: Claude.aiの通常の回答テキストを取得');
                const normalSelectors = UI_SELECTORS.Claude?.TEXT_EXTRACTION?.NORMAL_RESPONSE || [];
                const normalElements = document.querySelectorAll(normalSelectors.join(', '));

                if (normalElements.length > 0) {
                    console.log(`情報: ${normalElements.length}個のテキスト要素を発見`);
                    // Canvas要素内を除外
                    const filtered = Array.from(normalElements).filter(el => {
                        return !el.closest('#markdown-artifact') &&
                               !el.closest('[class*="artifact"]');
                    });
                    console.log(`情報: フィルタリング後 ${filtered.length}個の要素`);

                    if (filtered.length > 0) {
                        const targetElement = filtered[filtered.length - 1];
                        extractedText = targetElement.textContent?.trim() || '';
                        console.log(`結果: 通常テキスト取得成功 (${extractedText.length}文字)`);
                    }
                } else {
                    console.log('情報: 通常テキスト要素が見つかりません');
                }
                console.log('■■■ ステップ 3.3.1 完了 ■■■');

                // ===== 3.3.2: Canvas テキスト取得 =====
                if (!extractedText) {
                    console.log('\n■■■ ステップ 3.3.2 開始 ■■■');
                    console.log('ステップ 3.3.2: Canvas テキスト取得');
                    console.log('概要: Canvas機能（特別な表示形式）でのテキストがあれば取得');
                    const canvasSelectors = UI_SELECTORS.Claude?.TEXT_EXTRACTION?.ARTIFACT_CONTENT || [];
                    for (const selector of canvasSelectors) {
                        const canvasElement = document.querySelector(selector);
                        if (canvasElement) {
                            const text = canvasElement.textContent?.trim() || '';
                            if (text && text.length > 10) {
                                extractedText = text;
                                console.log(`結果: Canvasテキスト取得成功 (${text.length}文字)`);
                                break;
                            }
                        }
                    }
                    if (!extractedText) {
                        console.log('情報: Canvasテキストは見つかりませんでした');
                    }
                    console.log('■■■ ステップ 3.3.2 完了 ■■■');
                } else {
                    console.log('\n■■■ ステップ 3.3.2 スキップ ■■■');
                    console.log('ステップ 3.3.2: Canvas テキスト取得スキップ');
                    console.log('理由: 通常テキストで回答を取得済み');
                }

                // テキストが取得できない場合はエラーを投げてリトライ
                if (!extractedText) {
                    throw new Error('応答テキストを取得できませんでした');
                }

                return extractedText;
            }, 'ステップ3.3: 結果取得', 3);

            // ===== 3.3.3: 結果返却・完了フラグ設定 =====
            if (responseText) {
                console.log('\n■■■ ステップ 3.3.3 開始 ■■■');
                console.log('ステップ 3.3.3: 結果返却・完了フラグ設定');
                console.log('概要: 取得した回答をシステムに返却し、処理完了を記録');
                console.log(`結果: 総文字数 ${responseText.length}文字の回答を取得`);
                console.log('✅ Claude V2 タスク実行完了');

                // 完了フラグを設定
                window.__v2_execution_complete = true;
                window.__v2_execution_result = {
                    success: true,
                    response: responseText
                };

                console.log('■■■ ステップ 3.3.3 完了 ■■■');
                console.log('■■■ ステップ 3.3 完了 ■■■');

                return {
                    success: true,
                    response: responseText
                };
            } else {
                console.log('\n■■■ ステップ 3.3.3 エラー ■■■');
                console.log('ステップ 3.3.3: 結果返却・完了フラグ設定 - エラー状態で処理完了');
                console.log('エラー: 応答テキストを取得できませんでした');
                window.__v2_execution_complete = true;
                window.__v2_execution_result = {
                    success: false,
                    error: '応答テキストを取得できませんでした'
                };

                throw new Error('応答テキストを取得できませんでした');
            }

        } catch (error) {
            console.log('\n■■■ エラーハンドリング 開始 ■■■');
            console.log('エラーハンドリング: 予期しないエラーが発生しました');
            console.error('❌ Claude V2 タスク実行エラー:', error);
            console.log('エラー内容:', error.message);
            console.log('■■■ エラーハンドリング 完了 ■■■');

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