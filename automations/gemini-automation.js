/**
 * Gemini自動化実装
 * Version: 2.0.0
 * automations/gemini-automation.js
 */

(() => {
    "use strict";

    // ========================================
    // グローバル変数
    // ========================================
    let sendStartTime = null;  // 送信開始時刻を記録

    // ========================================
    // ユーティリティ関数
    // ========================================
    const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    const log = (message, type = 'info') => {
        const styles = {
            info: 'color: #2196F3',
            success: 'color: #4CAF50',
            warning: 'color: #FF9800',
            error: 'color: #F44336'
        };
        console.log(`%c[Gemini] ${message}`, styles[type] || styles.info);
    };

    const findElement = (selectors, maxRetries = 3) => {
        const selectorArray = Array.isArray(selectors) ? selectors : [selectors];
        
        for (let retry = 0; retry < maxRetries; retry++) {
            for (const selector of selectorArray) {
                try {
                    const element = document.querySelector(selector);
                    if (element) return element;
                } catch (e) {
                    // セレクタエラーは無視
                }
            }
            if (retry < maxRetries - 1) {
                // リトライの場合は少し待つ（同期的に処理）
                const start = Date.now();
                while (Date.now() - start < 100) {
                    // busy wait
                }
            }
        }
        return null;
    };

    const clickElement = async (element) => {
        if (!element) return false;

        try {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            await wait(200);
            element.click();
            await wait(500);
            return true;
        } catch (e) {
            try {
                const event = new MouseEvent('click', {
                    bubbles: true,
                    cancelable: true,
                    view: window
                });
                element.dispatchEvent(event);
                await wait(500);
                return true;
            } catch (e2) {
                log(`クリック失敗: ${e2.message}`, 'error');
                return false;
            }
        }
    };

    // ========================================
    // Gemini自動化関数の実装
    // ========================================
    
    /**
     * モデルを選択
     * @param {string} modelId - "gemini-pro", "gemini-ultra", "gemini-flash" など
     */
    const selectModel = async (modelId) => {
        log(`モデル選択: ${modelId}`);
        
        try {
            // モデル選択ボタンを探す
            const modelButton = findElement([
                '.gds-mode-switch-button',
                '[aria-label*="モデル"]',
                'button:has(.mode-title)'
            ]);

            if (!modelButton) {
                log('モデル選択ボタンが見つかりません', 'warning');
                return false;
            }

            // ボタンをクリックしてメニューを開く
            await clickElement(modelButton);
            await wait(1000);

            // モデル名のマッピング
            const modelMappings = {
                'gemini-pro': ['Pro', 'Gemini Pro', 'Pro 1.5'],
                'gemini-ultra': ['Ultra', 'Gemini Ultra'],
                'gemini-flash': ['Flash', 'Flash 2.0', 'Gemini Flash']
            };

            const possibleNames = modelMappings[modelId.toLowerCase()] || [modelId];

            // メニュー項目から該当モデルを探す
            const menuItems = document.querySelectorAll('[role="menuitemradio"], [role="menuitem"]');
            for (const item of menuItems) {
                const text = item.textContent?.trim() || '';
                for (const name of possibleNames) {
                    if (text.includes(name)) {
                        await clickElement(item);
                        log(`✅ モデルを「${text}」に変更しました`, 'success');
                        return true;
                    }
                }
            }

            // メニューを閉じる
            document.body.click();
            log(`モデル「${modelId}」が見つかりません`, 'warning');
            return false;

        } catch (error) {
            log(`モデル選択エラー: ${error.message}`, 'error');
            return false;
        }
    };

    /**
     * 機能を選択
     * @param {string} functionId - "deep-research", "canvas", "image" など
     */
    const selectFunction = async (functionId) => {
        log(`機能選択: ${functionId}`);

        if (functionId === 'none' || !functionId) {
            // すべての機能をクリア
            return await clearAllFunctions();
        }

        try {
            // 機能名のマッピング
            const functionMappings = {
                'deep-research': 'Deep Research',
                'deep-think': 'Deep Think',
                'canvas': 'Canvas',
                'image': '画像',
                'video': '動画'
            };

            const functionName = functionMappings[functionId.toLowerCase()] || functionId;

            // メインツールボックスの機能ボタンを探す
            const mainButtons = document.querySelectorAll('.toolbox-drawer-item-button button');
            for (const button of mainButtons) {
                const text = button.textContent?.trim() || '';
                if (text.includes(functionName)) {
                    const isActive = button.getAttribute('aria-pressed') === 'true';
                    if (!isActive) {
                        await clickElement(button);
                        log(`✅ 機能を「${functionName}」に変更しました`, 'success');
                    } else {
                        log(`機能「${functionName}」は既に有効です`, 'info');
                    }
                    return true;
                }
            }

            // サブメニューを確認
            const moreButton = findElement(['button[aria-label="その他"]']);
            if (moreButton) {
                await clickElement(moreButton);
                await wait(1000);

                const menuItems = document.querySelectorAll('button[mat-list-item], .toolbox-drawer-item-list-button');
                for (const item of menuItems) {
                    const text = item.textContent?.trim() || '';
                    if (text.includes(functionName)) {
                        await clickElement(item);
                        await wait(500);
                        document.body.click(); // メニューを閉じる
                        log(`✅ 機能を「${functionName}」に変更しました`, 'success');
                        return true;
                    }
                }
                
                document.body.click(); // メニューを閉じる
            }

            log(`機能「${functionId}」が見つかりません`, 'warning');
            return false;

        } catch (error) {
            log(`機能選択エラー: ${error.message}`, 'error');
            return false;
        }
    };

    /**
     * すべての機能をクリア
     */
    const clearAllFunctions = async () => {
        log('すべての機能を解除中...');
        let clearedCount = 0;

        // メインツールボックスの機能を解除
        const mainButtons = document.querySelectorAll('.toolbox-drawer-item-button button');
        for (const button of mainButtons) {
            const isActive = button.getAttribute('aria-pressed') === 'true';
            if (isActive) {
                await clickElement(button);
                await wait(300);
                clearedCount++;
            }
        }

        log(`✅ ${clearedCount}個の機能を無効化しました`, 'success');
        return true;
    };

    /**
     * テキストを入力
     * @param {string} text - 入力するテキスト
     */
    const inputText = async (text) => {
        log('テキスト入力中...');

        try {
            if (!text) {
                throw new Error('入力するテキストがありません');
            }

            log('テキスト入力を開始: ' + text.substring(0, 50) + '...', 'info');
            
            // 優先順位付きセレクタで検索
            const selectors = [
                '.ql-editor.new-input-ui[contenteditable="true"]', // 最新UI
                'rich-textarea .ql-editor[contenteditable="true"]', // 現在構造
                '.ql-editor[role="textbox"]',                       // 役割指定
                '[aria-label*="プロンプト"][contenteditable="true"]', // 日本語対応
                '.ql-editor[contenteditable="true"]',               // 汎用
                '[contenteditable="true"][role="textbox"]',          // フォールバック
                '[aria-label*="プロンプト"]'                          // 旧セレクタ
            ];

            let inputField = null;
            for (const selector of selectors) {
                try {
                    const elements = document.querySelectorAll(selector);
                    for (const element of elements) {
                        if (element && element.offsetParent !== null) {
                            inputField = element;
                            log('入力欄発見: ' + selector, 'success');
                            break;
                        }
                    }
                    if (inputField) break;
                } catch (e) {
                    // セレクタエラーは無視
                }
            }

            if (!inputField) {
                throw new Error('入力欄が見つかりません');
            }

            inputField.focus();
            await wait(300);

            // Quillエディタの場合
            if (inputField.classList.contains('ql-editor')) {
                // 既存の内容をクリア
                while (inputField.firstChild) {
                    inputField.removeChild(inputField.firstChild);
                }

                // 新しいテキストを設定
                const p = document.createElement('p');
                p.textContent = text;
                inputField.appendChild(p);

                // ql-blankクラスを削除
                inputField.classList.remove('ql-blank');

                // イベントを発火
                inputField.dispatchEvent(new Event('input', { bubbles: true }));
                inputField.dispatchEvent(new Event('change', { bubbles: true }));
            } else {
                // 通常のcontenteditable要素
                inputField.textContent = text;
                inputField.dispatchEvent(new Event('input', { bubbles: true }));
            }

            await wait(500);
            log('テキストを入力しました: ' + text.length + '文字', 'success');
            return true;

        } catch (error) {
            log(`テキスト入力エラー: ${error.message}`, 'error');
            return false;
        }
    };

    /**
     * メッセージを送信
     */
    const sendMessage = async () => {
        log('メッセージ送信中...');

        try {
            // 優先順位付きセレクタで検索
            const selectors = [
                'button[aria-label="プロンプトを送信"].send-button',       // 最新UI
                'button.send-button.submit',                           // 最新UIクラス組み合わせ
                'button[aria-label="プロンプトを送信"]',                    // aria-label指定
                'button[aria-label*="送信"]',                           // 部分一致
                '.send-button:not(.stop)',                             // 停止ボタンではない送信ボタン
                'button[mattooltip*="送信"]',                          // Material tooltip
                'button[type="submit"]',                               // フォームsubmit
                '[data-testid="send-button"]'                         // 旧セレクタ
            ];

            let sendButton = null;
            for (const selector of selectors) {
                try {
                    const elements = document.querySelectorAll(selector);
                    for (const element of elements) {
                        if (element && element.offsetParent !== null && !element.disabled) {
                            sendButton = element;
                            log('送信ボタン発見: ' + selector, 'success');
                            break;
                        }
                    }
                    if (sendButton) break;
                } catch (e) {
                    // セレクタエラーは無視
                }
            }

            if (!sendButton) {
                throw new Error('送信ボタンが見つかりません');
            }

            await clickElement(sendButton);
            sendStartTime = Date.now();  // 送信時刻を記録
            await wait(1000);
            log('📤 メッセージを送信しました', 'success');
            return true;

        } catch (error) {
            log(`送信エラー: ${error.message}`, 'error');
            return false;
        }
    };

    /**
     * 応答を待機
     * @param {number} timeout - タイムアウト時間（ミリ秒）
     */
    const waitForResponse = async (timeout = 30000) => {
        log('応答を待機中...');
        const startTime = Date.now();
        let lastStopButton = null;
        let lastMinuteLogged = 0;

        try {
            while (Date.now() - startTime < timeout) {
                const elapsedMs = Date.now() - startTime;
                const elapsedMinutes = Math.floor(elapsedMs / 60000);
                
                // 1分ごとにログを出力
                if (elapsedMinutes > lastMinuteLogged) {
                    lastMinuteLogged = elapsedMinutes;
                    log(`応答待機中... (${elapsedMinutes}分経過)`, 'info');
                }
                
                // 停止ボタンの存在をチェック（優先順位付きセレクタ）
                const stopSelectors = [
                    'button[aria-label="回答を停止"].send-button.stop',       // 最新UI
                    'button.send-button.stop',                             // 最新UIクラス
                    'button[aria-label="回答を停止"]',                        // aria-label指定
                    '[aria-label*="停止"]',                                 // 部分一致
                    '.stop-icon',                                          // アイコンクラス
                    '.blue-circle.stop-icon'                               // 最新UIの停止アイコン
                ];
                
                let stopButton = null;
                for (const selector of stopSelectors) {
                    try {
                        const elements = document.querySelectorAll(selector);
                        for (const element of elements) {
                            if (element && element.offsetParent !== null) {
                                stopButton = element;
                                break;
                            }
                        }
                        if (stopButton) break;
                    } catch (e) {
                        // セレクタエラーは無視
                    }
                }
                
                if (stopButton) {
                    lastStopButton = Date.now();
                } else if (lastStopButton && Date.now() - lastStopButton > 2000) {
                    // 停止ボタンが2秒以上表示されていない = 完了
                    
                    // 経過時間を計算
                    if (sendStartTime) {
                        const elapsedTotal = Date.now() - sendStartTime;
                        const minutes = Math.floor(elapsedTotal / 60000);
                        const seconds = Math.floor((elapsedTotal % 60000) / 1000);
                        log(`✅ 応答完了（送信から ${minutes}分${seconds}秒経過）`, 'success');
                    } else {
                        log('✅ 応答完了', 'success');
                    }
                    return true;
                }

                // ローディング表示もチェック
                const loadingIndicators = document.querySelectorAll('.loading, .spinner, [aria-busy="true"]');
                if (loadingIndicators.length === 0 && !stopButton && Date.now() - startTime > 3000) {
                    // 経過時間を計算
                    if (sendStartTime) {
                        const elapsedTotal = Date.now() - sendStartTime;
                        const minutes = Math.floor(elapsedTotal / 60000);
                        const seconds = Math.floor((elapsedTotal % 60000) / 1000);
                        log(`✅ 応答完了（送信から ${minutes}分${seconds}秒経過）`, 'success');
                    } else {
                        log('✅ 応答完了', 'success');
                    }
                    return true;
                }

                await wait(500);
            }

            log(`応答待機タイムアウト (${timeout/1000}秒経過)`, 'warning');
            return false;

        } catch (error) {
            log(`待機エラー: ${error.message}`, 'error');
            return false;
        }
    };

    /**
     * 応答テキストを取得
     */
    const getResponse = async () => {
        log('応答取得中...');

        try {
            let responseText = '';
            
            // 1. Canvas機能（immersive-editor）を最優先で確認
            const canvasSelectors = [
                'immersive-editor .ProseMirror',                           // Canvas最新UI
                '[data-test-id="immersive-editor"] .ProseMirror',         // Canvas test-id指定
                '.immersive-editor .markdown',                            // Canvas markdown
                'immersive-editor #extended-response-markdown-content'     // Canvas extended response
            ];
            
            for (const selector of canvasSelectors) {
                try {
                    const elements = document.querySelectorAll(selector);
                    for (const element of elements) {
                        if (element && element.offsetParent !== null) {
                            responseText = element.textContent?.trim();
                            if (responseText && responseText.length > 0) {
                                log('Canvas回答取得: ' + selector, 'success');
                                log(`Canvas応答取得完了（${responseText.length}文字）`, 'success');
                                return responseText;
                            }
                        }
                    }
                } catch (e) {
                    // セレクタエラーは無視
                }
            }
            
            // 2. 通常の応答（message-content）を確認
            const normalSelectors = [
                'message-content .markdown.markdown-main-panel',          // 通常処理最新UI
                '[id*="model-response-message-content"]',                 // response message ID
                '.model-response-text .markdown',                        // model response text
                '.conversation-turn:last-child',                         // 会話ターン
                '.message-container:last-child',                         // メッセージコンテナ
                '[data-message-author="assistant"]:last-child',          // assistant role
                '.markdown:last-child'                                   // markdown汎用
            ];
            
            for (const selector of normalSelectors) {
                try {
                    const elements = document.querySelectorAll(selector);
                    for (const element of elements) {
                        if (element && element.offsetParent !== null) {
                            responseText = element.textContent?.trim();
                            if (responseText && responseText.length > 0) {
                                log('通常回答取得: ' + selector, 'success');
                                log(`通常応答取得完了（${responseText.length}文字）`, 'success');
                                return responseText;
                            }
                        }
                    }
                } catch (e) {
                    // セレクタエラーは無視
                }
            }

            log('応答が見つかりません', 'warning');
            return null;

        } catch (error) {
            log(`応答取得エラー: ${error.message}`, 'error');
            return null;
        }
    };

    /**
     * 統合実行
     * @param {Object} config - 実行設定
     */
    const runAutomation = async (config) => {
        log('自動化実行開始', 'info');
        const results = {
            success: false,
            model: null,
            function: null,
            text: null,
            response: null,
            error: null
        };

        try {
            // モデル選択
            if (config.model) {
                const modelResult = await selectModel(config.model);
                results.model = modelResult ? config.model : null;
            }

            // 機能選択
            if (config.function) {
                const functionResult = await selectFunction(config.function);
                results.function = functionResult ? config.function : null;
            }

            // テキスト入力
            if (config.text) {
                const inputResult = await inputText(config.text);
                if (!inputResult) {
                    throw new Error('テキスト入力に失敗しました');
                }
                results.text = config.text;
            }

            // 送信
            if (config.send !== false) {
                const sendResult = await sendMessage();
                if (!sendResult) {
                    throw new Error('送信に失敗しました');
                }
            }

            // 応答待機
            if (config.waitResponse !== false) {
                const waitResult = await waitForResponse(config.timeout || 30000);
                if (!waitResult) {
                    log('応答待機がタイムアウトしましたが、続行します', 'warning');
                }
            }

            // 応答取得
            if (config.getResponse !== false) {
                const response = await getResponse();
                results.response = response;
            }

            results.success = true;
            log('自動化実行完了', 'success');

        } catch (error) {
            results.success = false;
            results.error = error.message;
            log(`自動化実行エラー: ${error.message}`, 'error');
        }

        return results;
    };

    // ========================================
    // グローバル公開
    // ========================================
    window.GeminiAutomation = {
        selectModel,
        selectFunction,
        inputText,
        sendMessage,
        waitForResponse,
        getResponse,
        runAutomation,
        // ユーティリティも公開
        clearAllFunctions,
        wait,
        log
    };

    console.log('%c✅ Gemini自動化関数が利用可能になりました', 'color: #4CAF50; font-weight: bold');
    console.log('使用例: await GeminiAutomation.inputText("こんにちは")');
    console.log('       await GeminiAutomation.sendMessage()');
    console.log('       await GeminiAutomation.waitForResponse()');
    console.log('       const response = await GeminiAutomation.getResponse()');

})();