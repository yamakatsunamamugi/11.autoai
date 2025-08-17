// DeepResearch専用ハンドラー
// 全AIのDeepResearch機能を統一管理
(() => {
    "use strict";

    // UI_SELECTORSをインポート（Chrome拡張機能の場合はchrome.runtime.getURLを使用）
    let UI_SELECTORS = null;
    
    // セレクタの読み込みを試みる
    async function loadSelectors() {
        try {
            // Chrome拡張機能として動作している場合
            if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
                const url = chrome.runtime.getURL('src/config/ui-selectors.js');
                const module = await import(url);
                UI_SELECTORS = module.UI_SELECTORS;
            }
        } catch (error) {
            console.log('[DeepResearch] ui-selectors.jsの読み込みに失敗、内蔵セレクタを使用します');
        }
    }

    // ========================================
    // AI別の設定（DeepResearch専用）
    // ========================================
    const AI_CONFIGS = {
        ChatGPT: {
            // 自動返信メッセージ
            autoReplyMessage: '良いからさきほどの質問を確認して作業して',
            // AI名（ログ用）
            aiName: 'ChatGPT'
        },
        
        Claude: {
            autoReplyMessage: '良いからさきほどの質問を確認して作業して',
            aiName: 'Claude'
        },
        
        Gemini: {
            // Geminiは特殊（リサーチ開始ボタンをクリック）
            researchButtonSelectors: [
                'button[aria-label="リサーチを開始"]',
                'button[data-test-id="confirm-button"][aria-label="リサーチを開始"]',
                'button:contains("リサーチを開始")',
                'button[aria-label*="リサーチ"]',
                'button[class*="research"]'
            ],
            aiName: 'Gemini'
        }
    };

    // ========================================
    // セレクタ取得関数
    // ========================================
    function getSelectors(aiName, selectorType) {
        // UI_SELECTORSが読み込まれていれば使用
        if (UI_SELECTORS && UI_SELECTORS[aiName]) {
            return UI_SELECTORS[aiName][selectorType] || [];
        }
        
        // フォールバックは削除 - UI_SELECTORSのみを使用
        return [];
    }

    // ========================================
    // ログ関数
    // ========================================
    const log = (message, type = 'INFO', aiName = 'DeepResearch') => {
        if (window.AICommonUtils) {
            window.AICommonUtils.log(message, type, aiName);
        } else {
            const prefix = {
                'INFO': '📝',
                'SUCCESS': '✅',
                'ERROR': '❌',
                'WARNING': '⚠️',
                'DEBUG': '🔍'
            }[type] || '📝';
            console.log(`${prefix} [${aiName}] ${message}`);
        }
    };

    // ========================================
    // メイン処理関数
    // ========================================
    const handleDeepResearch = async (aiType, maxWaitMinutes = 60) => {
        const config = AI_CONFIGS[aiType];
        
        if (!config) {
            log(`未対応のAIタイプ: ${aiType}`, 'ERROR');
            return false;
        }

        // 共通ユーティリティが利用可能か確認（無くても動作可能）
        const utils = window.AICommonUtils || null;
        if (!utils) {
            log('共通ユーティリティが読み込まれていません。フォールバックモードで動作します', 'WARNING');
        }
        const aiName = config.aiName;
        
        log(`🚀 ${aiName} DeepResearch処理を開始`, 'INFO', aiName);
        console.log(`🚀 [DeepResearch] ${aiName} 処理開始 - 現在時刻: ${new Date().toLocaleTimeString()}`);
        
        // ウィンドウにフォーカスを与える（全AI共通）
        window.focus();
        document.body.click();
        
        try {
            // 初期メッセージ数を取得
            const initialMessages = document.querySelectorAll(config.messageSelector);
            let lastMessageCount = initialMessages.length;
            let hasResponded = false;
            let hasRespondedGemini = false;  // Gemini専用フラグ
            
            // 最初の5分間、質問を監視
            log('🔍 最初の5分間、質問を監視中...', 'INFO', aiName);
            log(`📊 初期メッセージ数: ${lastMessageCount}`, 'DEBUG', aiName);
            const startTime = Date.now();
            const fiveMinutes = 5 * 60 * 1000;
            let loopCount = 0;
            let previousStopButtonState = null;
            let hasSeenStopButton = false;  // 停止ボタンを一度でも見たか
            
            while (Date.now() - startTime < fiveMinutes) {
                loopCount++;
                if (loopCount % 10 === 0) { // 20秒ごとにログ出力
                    const elapsed = Math.floor((Date.now() - startTime) / 1000);
                    log(`⏱️ 監視中... ${elapsed}秒経過`, 'DEBUG', aiName);
                }
                // 現在のメッセージ数をチェック
                const currentMessages = document.querySelectorAll(config.messageSelector);
                const currentMessageCount = currentMessages.length;
                
                if (currentMessageCount !== lastMessageCount) {
                    log(`📨 メッセージ数変化: ${lastMessageCount} → ${currentMessageCount}`, 'DEBUG', aiName);
                    lastMessageCount = currentMessageCount;
                }
                
                // 停止ボタンの状態をチェック
                let stopButton = null;
                const stopSelectors = getSelectors(aiName, 'STOP_BUTTON');
                for (const selector of stopSelectors) {
                    if (selector) {
                        stopButton = document.querySelector(selector);
                        if (stopButton) {
                            hasSeenStopButton = true;  // 停止ボタンを検出したことを記録
                            // 初回検出時のみログ
                            if (previousStopButtonState === null || previousStopButtonState === false) {
                                log(`🛑 停止ボタン検出: ${selector}`, 'DEBUG', aiName);
                            }
                            break;
                        }
                    }
                }
                
                // ChatGPT/Claudeは停止ボタンが消滅したら返信（5分以内）
                if (aiType !== 'Gemini') {
                    // 停止ボタンの状態変化を検出
                    if (previousStopButtonState === true && !stopButton && !hasResponded) {
                        // 停止ボタンがあった → なくなった
                        log(`✅ ${aiName}の停止ボタンが消滅しました（5分以内）`, 'SUCCESS', aiName);
                        log(`📝 自動返信を実行します`, 'INFO', aiName);
                        await handleAutoReply(config, utils);
                        hasResponded = true;
                        // breakを削除 - 5分間のループを継続
                    }
                }
                
                // Geminiは停止ボタンが消滅したら「リサーチを開始」ボタンを押す（5分以内）
                if (aiType === 'Gemini') {
                    // 停止ボタンの状態変化を検出（あった → なくなった）
                    if (previousStopButtonState === true && !stopButton && !hasRespondedGemini) {
                        log(`✅ ${aiName}の停止ボタンが消滅しました（5分以内）`, 'SUCCESS', aiName);
                        log(`🔍 2秒待機してから「リサーチを開始」ボタンを探します`, 'INFO', aiName);
                        
                        // 画面更新を待つ（重要）
                        await new Promise(resolve => setTimeout(resolve, 2000));
                        
                        // ウィンドウフォーカス
                        window.focus();
                        document.body.click();
                        await new Promise(resolve => setTimeout(resolve, 500));
                        
                        // あなたのテストコードと同じ検索方法を使用
                        let researchButton = null;
                        
                        // 方法1: 両方の属性を持つボタン（最も確実）
                        researchButton = document.querySelector('button[data-test-id="confirm-button"][aria-label="リサーチを開始"]');
                        if (researchButton) {
                            log('✅ 方法1で発見: data-test-id + aria-label', 'SUCCESS', aiName);
                        }
                        
                        // 方法2: aria-labelのみ
                        if (!researchButton) {
                            researchButton = document.querySelector('button[aria-label="リサーチを開始"]');
                            if (researchButton) {
                                log('✅ 方法2で発見: aria-labelのみ', 'SUCCESS', aiName);
                            }
                        }
                        
                        // 方法3: テキスト検索
                        if (!researchButton) {
                            const buttons = document.querySelectorAll('button');
                            for (let btn of buttons) {
                                const text = btn.textContent?.trim();
                                if (text && text.includes('リサーチを開始')) {
                                    researchButton = btn;
                                    log('✅ 方法3で発見: テキスト検索', 'SUCCESS', aiName);
                                    break;
                                }
                            }
                        }
                        
                        if (researchButton) {
                            log(`🔍 ボタン情報: "${researchButton.textContent?.trim()}"`, 'DEBUG', aiName);
                            
                            // クリック処理
                            try {
                                researchButton.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                await new Promise(resolve => setTimeout(resolve, 500));
                                
                                // 通常のclick（コンソールテストで動作確認済み）
                                researchButton.click();
                                
                                log('🎆 「リサーチを開始」ボタンをクリックしました！', 'SUCCESS', aiName);
                                hasRespondedGemini = true;  // Gemini専用フラグを使用
                                await new Promise(resolve => setTimeout(resolve, 3000));
                                break;
                            } catch (e) {
                                log(`ボタンクリックエラー: ${e.message}`, 'ERROR', aiName);
                            }
                        } else {
                            log(`⚠️ リサーチボタンが見つかりません（リサーチ計画がまだ表示されていない可能性）`, 'WARNING', aiName);
                        }
                    }
                }
                
                // 状態を更新（次回ループで状態変化を検出するため）
                previousStopButtonState = !!stopButton;
                
                // 2秒待機
                if (utils && utils.wait) {
                    await utils.wait(2000);
                } else {
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
            }
            
            // 5分経過後、停止ボタンの消失を待つ
            log(`${aiName} DeepResearch処理の完了を待機中...`, 'INFO', aiName);
            const completionResult = await waitForCompletion(config, utils, maxWaitMinutes - 5, startTime, hasSeenStopButton);
            
            if (completionResult) {
                log(`${aiName} DeepResearch完了を検出`, 'SUCCESS', aiName);
            } else {
                log(`${aiName} DeepResearch待機タイムアウト`, 'WARNING', aiName);
            }
            
            return completionResult;
            
        } catch (error) {
            log(`DeepResearchエラー: ${error.message}`, 'ERROR', aiName);
            return false;
        }
    };

    // ========================================
    // 自動返信処理（ChatGPT/Claude用）
    // ========================================
    const handleAutoReply = async (config, utils) => {
        const aiName = config.aiName;
        
        log(`💬 ${aiName} 自動返信処理を開始`, 'INFO', aiName);
        
        try {
            // 入力欄を探す（utilsが無い場合は直接検索）
            let inputField = null;
            const inputSelectors = getSelectors(aiName, 'INPUT');
            if (utils && utils.findElement) {
                inputField = await utils.findElement(inputSelectors);
            } else {
                // フォールバック：直接DOM検索
                for (const selector of inputSelectors) {
                    inputField = document.querySelector(selector);
                    if (inputField && inputField.offsetParent !== null) break;
                }
            }
            
            if (!inputField) {
                log('❌ 入力欄が見つかりません', 'ERROR', aiName);
                log(`🔍 検索したセレクタ: ${inputSelectors.join(', ')}`, 'DEBUG', aiName);
                return false;
            }
            
            log(`✅ 入力欄を発見`, 'SUCCESS', aiName);
            
            // テキストを入力
            if (utils && utils.inputText) {
                await utils.inputText(inputField, config.autoReplyMessage);
            } else {
                // フォールバック：直接入力
                inputField.focus();
                if (inputField.tagName === 'TEXTAREA' || inputField.tagName === 'INPUT') {
                    inputField.value = config.autoReplyMessage;
                } else {
                    inputField.textContent = config.autoReplyMessage;
                }
                inputField.dispatchEvent(new Event('input', { bubbles: true }));
            }
            
            // 待機
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // 送信ボタンを探す
            let sendButton = null;
            const sendSelectors = getSelectors(aiName, 'SEND_BUTTON');
            if (utils && utils.findElement) {
                sendButton = await utils.findElement(sendSelectors);
            } else {
                // フォールバック：直接DOM検索
                for (const selector of sendSelectors) {
                    sendButton = document.querySelector(selector);
                    if (sendButton && sendButton.offsetParent !== null && !sendButton.disabled) break;
                }
            }
            
            if (!sendButton) {
                log('送信ボタンが見つかりません', 'ERROR', aiName);
                return false;
            }
            
            // 送信
            if (!sendButton.disabled) {
                log(`🚀 送信ボタンをクリック中...`, 'INFO', aiName);
                if (utils && utils.performClick) {
                    await utils.performClick(sendButton);
                } else {
                    // フォールバック：直接クリック
                    sendButton.click();
                }
                log(`🎉 「${config.autoReplyMessage}」を送信しました`, 'SUCCESS', aiName);
                return true;
            } else {
                log('送信ボタンが無効です', 'WARNING', aiName);
                return false;
            }
            
        } catch (error) {
            log(`自動返信エラー: ${error.message}`, 'ERROR', aiName);
            return false;
        }
    };


    // ========================================
    // 完了待機処理
    // ========================================
    const waitForCompletion = async (config, utils, remainingMinutes, startTime, hasSeenStopButton = false) => {
        const aiName = config.aiName;
        const maxWaitTime = remainingMinutes * 60 * 1000;
        const waitStartTime = Date.now();
        let localHasSeenStopButton = hasSeenStopButton;  // 停止ボタンを見たかのローカルフラグ
        
        while (Date.now() - waitStartTime < maxWaitTime) {
            try {
                // 停止ボタンをチェック（複数セレクタ対応）
                let stopButton = null;
                const stopSelectors = getSelectors(aiName, 'STOP_BUTTON');
                for (const selector of stopSelectors) {
                    if (selector) {
                        stopButton = document.querySelector(selector);
                        if (stopButton) {
                            localHasSeenStopButton = true;  // 停止ボタンを見つけた
                            break;
                        }
                    }
                }
                
                if (!stopButton) {
                    // 停止ボタンを一度でも見た場合のみ完了チェック
                    if (localHasSeenStopButton) {
                        // 停止ボタンがない状態で3秒待機して最終確認
                        if (utils && utils.wait) {
                            await utils.wait(3000);
                        } else {
                            await new Promise(resolve => setTimeout(resolve, 3000));
                        }
                        
                        // 最終確認も複数セレクタで
                        let finalStopCheck = null;
                        for (const selector of stopSelectors) {
                            if (selector) {
                                finalStopCheck = document.querySelector(selector);
                                if (finalStopCheck) break;
                            }
                        }
                        
                        if (!finalStopCheck) {
                            // 経過時間を計算（送信時刻から）
                            const elapsedTotal = Date.now() - startTime;
                            const minutes = Math.floor(elapsedTotal / 60000);
                            const seconds = Math.floor((elapsedTotal % 60000) / 1000);
                            log(`処理完了（開始から ${minutes}分${seconds}秒経過）`, 'SUCCESS', aiName);
                            return true;
                        }
                    }
                    // 停止ボタンを一度も見ていない場合は待機を継続
                }
                
                // 進捗ログ（10秒ごと）
                if ((Date.now() - waitStartTime) % 10000 < 1000) {
                    const elapsedSec = Math.round((Date.now() - waitStartTime) / 1000);
                    log(`処理待機中... (${elapsedSec}秒経過)`, 'INFO', aiName);
                }
                
                // 5秒ごとにチェック
                if (utils && utils.wait) {
                    await utils.wait(5000);
                } else {
                    await new Promise(resolve => setTimeout(resolve, 5000));
                }
                
            } catch (error) {
                log(`完了待機エラー: ${error.message}`, 'WARNING', aiName);
            }
        }
        
        return false;
    };

    // ========================================
    // 設定取得関数
    // ========================================
    const getConfig = (aiType) => {
        return AI_CONFIGS[aiType] || null;
    };

    // ========================================
    // グローバル公開
    // ========================================
    window.DeepResearchHandler = {
        handle: async (aiName, maxWaitMinutes) => {
            // UI_SELECTORSを読み込み
            await loadSelectors();
            return await handleDeepResearch(aiName, maxWaitMinutes);
        },
        getConfig: getConfig,
        AI_CONFIGS: AI_CONFIGS,
        getSelectors: getSelectors
    };

    log('DeepResearchハンドラーが利用可能になりました', 'SUCCESS');
    return window.DeepResearchHandler;
})();