// DeepResearch専用ハンドラー
// 全AIのDeepResearch機能を統一管理
(() => {
    "use strict";

    // ========================================
    // AI別の設定
    // ========================================
    const AI_CONFIGS = {
        ChatGPT: {
            // 入力欄のセレクタ
            inputSelectors: [
                '#prompt-textarea',
                '[contenteditable="true"]',
                '.ProseMirror',
                'textarea[data-testid="conversation-textarea"]',
                'textarea[placeholder*="メッセージ"]'
            ],
            // 送信ボタンのセレクタ
            sendSelectors: [
                '[data-testid="send-button"]',
                '[aria-label="Send prompt"]',
                '[aria-label="プロンプトを送信する"]',
                'button[type="submit"]',
                'button[class*="send"]'
            ],
            // 停止ボタンのセレクタ（テストコードと同じ）
            stopSelectors: [
                '[data-testid="stop-button"]',
                '[aria-label="Stop generating"]',
                '[aria-label="Stop"]',
                'button[aria-label*="stop"]',
                'button[aria-label*="Stop"]'
            ],
            // メッセージのセレクタ
            messageSelector: '[data-message-author-role="assistant"]',
            // 自動返信メッセージ
            autoReplyMessage: 'プロンプトを見て調べて',
            // AI名（ログ用）
            aiName: 'ChatGPT'
        },
        
        Claude: {
            inputSelectors: [
                '.ProseMirror[contenteditable="true"]',
                'div[contenteditable="true"][role="textbox"]',
                '[aria-label*="プロンプト"]',
                'div[contenteditable="true"]',
                'textarea[placeholder*="メッセージ"]'
            ],
            sendSelectors: [
                '[aria-label="メッセージを送信"]:not([disabled])',
                'button[type="submit"]:not([disabled])',
                '.send-button:not([disabled])'
            ],
            // 停止ボタンのセレクタ（ChatGPTと同じロジック）
            stopSelectors: [
                '[aria-label="応答を停止"]',
                '[aria-label="Stop generating"]',
                '[data-testid="stop-button"]',
                'button[aria-label*="stop"]',
                'button[aria-label*="Stop"]'
            ],
            messageSelector: '[data-is-streaming="false"]',
            autoReplyMessage: 'プロンプトを見て調べて',
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
            // 停止ボタンのセレクタ（統一）
            stopSelectors: [
                '[aria-label="回答を停止"]',
                '[aria-label="Stop generating"]',
                '[data-testid="stop-button"]',
                'button[aria-label*="stop"]',
                'button[aria-label*="Stop"]'
            ],
            messageSelector: '.conversation-turn.model-turn',
            aiName: 'Gemini'
        }
    };

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
                const stopSelectors = config.stopSelectors || [config.stopSelector];
                for (const selector of stopSelectors) {
                    if (selector) {
                        stopButton = document.querySelector(selector);
                        if (stopButton) {
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
                        break;
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
            const completionResult = await waitForCompletion(config, utils, maxWaitMinutes - 5, startTime);
            
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
            if (utils && utils.findElement) {
                inputField = await utils.findElement(config.inputSelectors);
            } else {
                // フォールバック：直接DOM検索
                for (const selector of config.inputSelectors) {
                    inputField = document.querySelector(selector);
                    if (inputField && inputField.offsetParent !== null) break;
                }
            }
            
            if (!inputField) {
                log('❌ 入力欄が見つかりません', 'ERROR', aiName);
                log(`🔍 検索したセレクタ: ${config.inputSelectors.join(', ')}`, 'DEBUG', aiName);
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
            if (utils && utils.findElement) {
                sendButton = await utils.findElement(config.sendSelectors);
            } else {
                // フォールバック：直接DOM検索
                for (const selector of config.sendSelectors) {
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
    const waitForCompletion = async (config, utils, remainingMinutes, startTime) => {
        const aiName = config.aiName;
        const maxWaitTime = remainingMinutes * 60 * 1000;
        const waitStartTime = Date.now();
        
        while (Date.now() - waitStartTime < maxWaitTime) {
            try {
                // 停止ボタンをチェック（複数セレクタ対応）
                let stopButton = null;
                const stopSelectors = config.stopSelectors || [config.stopSelector];
                for (const selector of stopSelectors) {
                    if (selector) {
                        stopButton = document.querySelector(selector);
                        if (stopButton) break;
                    }
                }
                
                if (!stopButton) {
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
        handle: handleDeepResearch,
        getConfig: getConfig,
        AI_CONFIGS: AI_CONFIGS
    };

    log('DeepResearchハンドラーが利用可能になりました', 'SUCCESS');
    return window.DeepResearchHandler;
})();