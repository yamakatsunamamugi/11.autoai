/**
 * @fileoverview Step 4 Execute - 統合自動化実行ファイル
 *
 * このファイルは以下の自動化スクリプトを統合します：
 * - ChatGPT Automation
 * - Claude Automation
 * - Gemini Automation
 * - Report Automation
 * - Genspark Automation
 * - Window Management Functions
 *
 * 各AIの自動化機能を一つのファイルに集約し、統一されたインターフェースを提供します。
 *
 * @version 1.0.0
 * @date 2025-09-20
 */

// ========================================
// ChatGPT Automation（既存コードを丸ごとコピー）
// ========================================
// 自動実行を無効化（STEP専用ボタンから手動で実行するため）
(function() {
    'use strict';

    console.log(`🚀 ChatGPT Automation V2 初期化 - ${new Date().toLocaleString('ja-JP')}`);

    // デバッグマーカー設定
    window.CHATGPT_SCRIPT_LOADED = true;
    window.CHATGPT_SCRIPT_INIT_TIME = Date.now();

    // ChatGPT固有のRetryManagerクラス
    class ChatGPTRetryManager {
        constructor() {
            this.escalationLevels = {
                LIGHTWEIGHT: {
                    range: [1, 5],
                    delays: [1000, 2000, 5000, 10000, 15000],
                    method: 'SAME_WINDOW',
                    description: '軽量リトライ - 同一ウィンドウ内での再試行'
                },
                MODERATE: {
                    range: [6, 8],
                    delays: [30000, 60000, 120000],
                    method: 'PAGE_REFRESH',
                    description: '中程度リトライ - ページリフレッシュ'
                },
                HEAVY_RESET: {
                    range: [9, 20],
                    delays: [300000, 900000, 1800000, 3600000, 7200000],
                    method: 'NEW_WINDOW',
                    description: '重いリトライ - 新規ウィンドウ作成'
                }
            };

            this.errorStrategies = {
                RATE_LIMIT_ERROR: { immediate_escalation: 'HEAVY_RESET', maxRetries: 10 },
                LOGIN_ERROR: { immediate_escalation: 'HEAVY_RESET', maxRetries: 5 },
                SESSION_ERROR: { immediate_escalation: 'HEAVY_RESET', maxRetries: 5 },
                NETWORK_ERROR: { maxRetries: 8, escalation: 'MODERATE' },
                DOM_ERROR: { maxRetries: 5, escalation: 'LIGHTWEIGHT' },
                UI_TIMING_ERROR: { maxRetries: 10, escalation: 'LIGHTWEIGHT' },
                GENERAL_ERROR: { maxRetries: 8, escalation: 'MODERATE' }
            };

            this.errorHistory = [];
            this.consecutiveErrorCount = 0;
            this.lastErrorType = null;
            this.maxHistorySize = 50;
            this.metrics = {
                totalAttempts: 0,
                successfulAttempts: 0,
                errorCounts: {},
                escalationCounts: { LIGHTWEIGHT: 0, MODERATE: 0, HEAVY_RESET: 0 },
                averageRetryCount: 0
            };
            this.activeTimeouts = new Set();
            this.abortController = null;
        }

        classifyError(error, context = {}) {
            const errorMessage = error?.message || error?.toString() || '';

            if (errorMessage.includes('rate limit') || errorMessage.includes('Rate limited') || errorMessage.includes('Too many requests')) {
                return 'RATE_LIMIT_ERROR';
            }
            if (errorMessage.includes('ログイン') || errorMessage.includes('login') || errorMessage.includes('authentication')) {
                return 'LOGIN_ERROR';
            }
            if (errorMessage.includes('session') || errorMessage.includes('セッション')) {
                return 'SESSION_ERROR';
            }
            if (errorMessage.includes('timeout') || errorMessage.includes('network') || errorMessage.includes('fetch')) {
                return 'NETWORK_ERROR';
            }
            if (errorMessage.includes('要素が見つかりません') || errorMessage.includes('element not found')) {
                return 'DOM_ERROR';
            }
            if (errorMessage.includes('click') || errorMessage.includes('input') || errorMessage.includes('button')) {
                return 'UI_TIMING_ERROR';
            }
            return 'GENERAL_ERROR';
        }

        async delay(ms) {
            return new Promise(resolve => {
                const timeoutId = setTimeout(resolve, ms);
                this.activeTimeouts.add(timeoutId);
                setTimeout(() => this.activeTimeouts.delete(timeoutId), ms);
            });
        }
    }

    // ChatGPT自動化のメイン関数
    async function executeChatGPTTask(taskData) {
        console.log('🚀 ChatGPT タスク実行開始', taskData);

        try {
            // UI_SELECTORSの読み込み
            let UI_SELECTORS = {};
            try {
                const response = await fetch(chrome.runtime.getURL('ui-selectors-data.json'));
                const data = await response.json();
                UI_SELECTORS = data.selectors;
            } catch (error) {
                console.warn('UI_SELECTORS読み込み失敗:', error.message);
            }

            // セレクタ定義
            const SELECTORS = {
                textInput: UI_SELECTORS.ChatGPT?.INPUT || ['#prompt-textarea', '[data-id="root"] textarea'],
                sendButton: UI_SELECTORS.ChatGPT?.SEND_BUTTON || ['[data-testid="send-button"]'],
                stopButton: UI_SELECTORS.ChatGPT?.STOP_BUTTON || ['[aria-label="応答を停止"]'],
                response: UI_SELECTORS.ChatGPT?.RESPONSE || ['[data-message-author-role="assistant"]']
            };

            // テキスト入力
            const inputElement = document.querySelector(SELECTORS.textInput[0]);
            if (!inputElement) {
                throw new Error('入力欄が見つかりません');
            }

            inputElement.value = taskData.prompt || taskData.text || '';
            inputElement.dispatchEvent(new Event('input', { bubbles: true }));

            // 送信ボタンクリック
            const sendButton = document.querySelector(SELECTORS.sendButton[0]);
            if (!sendButton) {
                throw new Error('送信ボタンが見つかりません');
            }

            sendButton.click();

            // 応答待機（簡易版）
            await new Promise(resolve => setTimeout(resolve, 5000));

            // レスポンス取得
            const responseElements = document.querySelectorAll(SELECTORS.response[0]);
            const lastResponse = responseElements[responseElements.length - 1];
            const responseText = lastResponse ? lastResponse.textContent || lastResponse.innerText : '';

            return {
                success: true,
                response: responseText,
                aiType: 'ChatGPT'
            };

        } catch (error) {
            console.error('❌ ChatGPT タスク実行エラー:', error);
            return {
                success: false,
                error: error.message,
                aiType: 'ChatGPT'
            };
        }
    }

    // グローバル公開
    window.ChatGPTAutomationV2 = {
        executeTask: executeChatGPTTask,
        RetryManager: ChatGPTRetryManager
    };

    console.log('✅ ChatGPT Automation V2 準備完了');
})();

// ========================================
// Claude Automation（既存コードを丸ごとコピー）
// ========================================
(function() {
    'use strict';

    console.log(`🚀 Claude Automation V2 初期化 - ${new Date().toLocaleString('ja-JP')}`);

    // ログ管理システム
    window.claudeLogFileManager = {
        logs: [],
        sessionStartTime: new Date().toISOString(),

        addLog(entry) {
            this.logs.push({
                timestamp: new Date().toISOString(),
                ...entry
            });
        },

        logStep(step, message, data = {}) {
            this.addLog({ type: 'step', step, message, data });
        },

        logError(step, error, context = {}) {
            this.addLog({
                type: 'error',
                step,
                error: {
                    message: error.message,
                    stack: error.stack,
                    name: error.name
                },
                context
            });
        },

        async saveToFile() {
            console.log('[LogFileManager] レポート生成は無効化されています');
            this.logs = [];
            return null;
        }
    };

    // Claude RetryManagerクラス
    class ClaudeRetryManager {
        constructor() {
            this.defaultMaxRetries = 3;
            this.defaultRetryDelay = 2000;
            this.globalTimeout = 600000;

            this.errorStrategies = {
                NETWORK_ERROR: { maxRetries: 5, baseDelay: 2000, backoffMultiplier: 1.5 },
                DOM_ERROR: { maxRetries: 3, baseDelay: 1000, backoffMultiplier: 1.2 },
                UI_TIMING_ERROR: { maxRetries: 10, baseDelay: 500, backoffMultiplier: 1.1 },
                CANVAS_VERSION_UPDATE: { maxRetries: 10, customDelays: [5000, 10000, 60000, 300000] },
                USER_INPUT_ERROR: { maxRetries: 1, baseDelay: 0, backoffMultiplier: 1 },
                GENERAL_ERROR: { maxRetries: 3, baseDelay: 2000, backoffMultiplier: 1.5 }
            };

            this.metrics = {
                totalAttempts: 0,
                successfulAttempts: 0,
                errorCounts: {},
                averageRetryCount: 0
            };

            this.errorHistory = [];
            this.activeTimeouts = new Set();
        }

        classifyError(error, context = {}) {
            const errorMessage = error?.message || error?.toString() || '';

            if (context.isCanvasVersionUpdate || errorMessage.includes('Canvas無限更新')) {
                return 'CANVAS_VERSION_UPDATE';
            }
            if (errorMessage.includes('timeout') || errorMessage.includes('network')) {
                return 'NETWORK_ERROR';
            }
            if (errorMessage.includes('要素が見つかりません') || errorMessage.includes('element not found')) {
                return 'DOM_ERROR';
            }
            if (errorMessage.includes('click') || errorMessage.includes('input') || errorMessage.includes('button')) {
                return 'UI_TIMING_ERROR';
            }
            if (errorMessage.includes('設定なし') || context.isUserInputError) {
                return 'USER_INPUT_ERROR';
            }
            return 'GENERAL_ERROR';
        }
    }

    // Claude自動化のメイン関数
    async function executeClaudeTask(taskData) {
        console.log('🚀 Claude タスク実行開始', taskData);

        try {
            // UI_SELECTORSの読み込み
            let UI_SELECTORS = {};
            try {
                const response = await fetch(chrome.runtime.getURL('ui-selectors-data.json'));
                const data = await response.json();
                UI_SELECTORS = data.selectors;
            } catch (error) {
                console.warn('UI_SELECTORS読み込み失敗:', error.message);
            }

            // セレクタ定義
            const SELECTORS = {
                textInput: UI_SELECTORS.Claude?.INPUT || ['div[contenteditable="true"]'],
                sendButton: UI_SELECTORS.Claude?.SEND_BUTTON || ['button[aria-label="Send Message"]'],
                stopButton: UI_SELECTORS.Claude?.STOP_BUTTON || ['button[aria-label="Stop"]'],
                response: UI_SELECTORS.Claude?.RESPONSE || ['div[data-is-streaming="false"]']
            };

            // テキスト入力
            const inputElement = document.querySelector(SELECTORS.textInput[0]);
            if (!inputElement) {
                throw new Error('入力欄が見つかりません');
            }

            inputElement.textContent = taskData.prompt || taskData.text || '';
            inputElement.dispatchEvent(new Event('input', { bubbles: true }));

            // 送信ボタンクリック
            const sendButton = document.querySelector(SELECTORS.sendButton[0]);
            if (!sendButton) {
                throw new Error('送信ボタンが見つかりません');
            }

            sendButton.click();

            // 応答待機（簡易版）
            await new Promise(resolve => setTimeout(resolve, 5000));

            // レスポンス取得
            const responseElements = document.querySelectorAll(SELECTORS.response[0]);
            const lastResponse = responseElements[responseElements.length - 1];
            const responseText = lastResponse ? lastResponse.textContent || lastResponse.innerText : '';

            return {
                success: true,
                response: responseText,
                aiType: 'Claude'
            };

        } catch (error) {
            console.error('❌ Claude タスク実行エラー:', error);
            return {
                success: false,
                error: error.message,
                aiType: 'Claude'
            };
        }
    }

    // グローバル公開
    window.ClaudeAutomation = {
        executeTask: executeClaudeTask,
        RetryManager: ClaudeRetryManager
    };

    console.log('✅ Claude Automation V2 準備完了');
})();

// ========================================
// Gemini Automation（既存コードを丸ごとコピー）
// ========================================
(function() {
    'use strict';

    console.log(`🚀 Gemini Automation V3 初期化 - ${new Date().toLocaleString('ja-JP')}`);

    // 初期化マーカー設定
    window.GEMINI_SCRIPT_LOADED = true;
    window.GEMINI_SCRIPT_INIT_TIME = Date.now();

    // ログ管理システム
    window.geminiLogFileManager = {
        logs: [],
        logStep: (step, message, data) => console.log(`📝 [${step}] ${message}`),
        logError: (step, error, context) => console.error(`❌ [${step}]`, error),
        logSuccess: (step, message, result) => console.log(`✅ [${step}] ${message}`),
        logTaskStart: (taskData) => console.log(`🚀 [タスク開始]`, taskData),
        logTaskComplete: (result) => console.log(`🏁 [タスク完了]`, result),
        saveToFile: () => { console.log('レポート生成は無効化されています'); return null; },
        saveErrorImmediately: () => {},
        saveIntermediate: () => {}
    };

    // Gemini RetryManagerクラス
    class GeminiRetryManager {
        constructor() {
            this.escalationLevels = {
                LIGHTWEIGHT: {
                    range: [1, 5],
                    delays: [1000, 2000, 5000, 10000, 15000],
                    method: 'SAME_WINDOW',
                    description: '軽量リトライ - 同一ウィンドウ内での再試行'
                },
                MODERATE: {
                    range: [6, 8],
                    delays: [30000, 60000, 120000],
                    method: 'PAGE_REFRESH',
                    description: '中程度リトライ - ページリフレッシュ'
                },
                HEAVY_RESET: {
                    range: [9, 20],
                    delays: [300000, 900000, 1800000, 3600000, 7200000],
                    method: 'NEW_WINDOW',
                    description: '重いリトライ - 新規ウィンドウ作成'
                }
            };

            this.errorStrategies = {
                AUTH_ERROR: { immediate_escalation: 'HEAVY_RESET', maxRetries: 5 },
                API_LIMIT_ERROR: { immediate_escalation: 'HEAVY_RESET', maxRetries: 10 },
                SESSION_EXPIRED_ERROR: { immediate_escalation: 'HEAVY_RESET', maxRetries: 5 },
                GOOGLE_AUTH_ERROR: { immediate_escalation: 'HEAVY_RESET', maxRetries: 5 },
                NETWORK_ERROR: { maxRetries: 8, escalation: 'MODERATE' },
                DOM_ERROR: { maxRetries: 5, escalation: 'LIGHTWEIGHT' },
                UI_TIMING_ERROR: { maxRetries: 10, escalation: 'LIGHTWEIGHT' },
                GENERAL_ERROR: { maxRetries: 8, escalation: 'MODERATE' }
            };

            this.errorHistory = [];
            this.consecutiveErrorCount = 0;
            this.metrics = {
                totalAttempts: 0,
                successfulAttempts: 0,
                errorCounts: {},
                escalationCounts: { LIGHTWEIGHT: 0, MODERATE: 0, HEAVY_RESET: 0 }
            };
        }

        classifyError(error, context = {}) {
            const errorMessage = error?.message || error?.toString() || '';

            if (errorMessage.includes('Google Auth') || errorMessage.includes('Authentication failed')) {
                return 'GOOGLE_AUTH_ERROR';
            }
            if (errorMessage.includes('API limit') || errorMessage.includes('quota exceeded')) {
                return 'API_LIMIT_ERROR';
            }
            if (errorMessage.includes('session expired') || errorMessage.includes('セッションが期限切れ')) {
                return 'SESSION_EXPIRED_ERROR';
            }
            if (errorMessage.includes('authentication') || errorMessage.includes('認証')) {
                return 'AUTH_ERROR';
            }
            if (errorMessage.includes('timeout') || errorMessage.includes('network')) {
                return 'NETWORK_ERROR';
            }
            if (errorMessage.includes('要素が見つかりません') || errorMessage.includes('element not found')) {
                return 'DOM_ERROR';
            }
            if (errorMessage.includes('click') || errorMessage.includes('input') || errorMessage.includes('button')) {
                return 'UI_TIMING_ERROR';
            }
            return 'GENERAL_ERROR';
        }
    }

    // Gemini自動化のメイン関数
    async function executeGeminiTask(taskData) {
        console.log('🚀 Gemini タスク実行開始', taskData);

        try {
            // UI_SELECTORSの読み込み
            let UI_SELECTORS = {};
            try {
                const response = await fetch(chrome.runtime.getURL('ui-selectors-data.json'));
                const data = await response.json();
                UI_SELECTORS = data.selectors;
            } catch (error) {
                console.warn('UI_SELECTORS読み込み失敗:', error.message);
            }

            // セレクタ定義
            const SELECTORS = {
                textInput: UI_SELECTORS.Gemini?.INPUT || ['.ql-editor'],
                sendButton: UI_SELECTORS.Gemini?.SEND_BUTTON || ['button.send-button'],
                stopButton: UI_SELECTORS.Gemini?.STOP_BUTTON || ['button.stop-button'],
                response: UI_SELECTORS.Gemini?.RESPONSE || ['.model-response-text']
            };

            // テキスト入力
            const inputElement = document.querySelector(SELECTORS.textInput[0]);
            if (!inputElement) {
                throw new Error('入力欄が見つかりません');
            }

            inputElement.textContent = taskData.prompt || taskData.text || '';
            if (inputElement.classList.contains('ql-blank')) {
                inputElement.classList.remove('ql-blank');
            }
            inputElement.dispatchEvent(new Event('input', { bubbles: true }));

            // 送信ボタンクリック
            const sendButton = document.querySelector(SELECTORS.sendButton[0]);
            if (!sendButton) {
                throw new Error('送信ボタンが見つかりません');
            }

            sendButton.click();

            // 応答待機（簡易版）
            await new Promise(resolve => setTimeout(resolve, 5000));

            // レスポンス取得
            const responseElements = document.querySelectorAll(SELECTORS.response[0]);
            const lastResponse = responseElements[responseElements.length - 1];
            const responseText = lastResponse ? lastResponse.textContent || lastResponse.innerText : '';

            return {
                success: true,
                response: responseText,
                aiType: 'Gemini'
            };

        } catch (error) {
            console.error('❌ Gemini タスク実行エラー:', error);
            return {
                success: false,
                error: error.message,
                aiType: 'Gemini'
            };
        }
    }

    // グローバル公開
    window.GeminiAutomation = {
        executeTask: executeGeminiTask,
        RetryManager: GeminiRetryManager
    };

    console.log('✅ Gemini Automation V3 準備完了');
})();

// ========================================
// Report Automation（既存コードを丸ごとコピー）
// ========================================
(function() {
    'use strict';

    console.log(`🚀 Report Automation V2 初期化 - ${new Date().toLocaleString('ja-JP')}`);

    // レポート自動化の設定
    const CONFIG = {
        AI_TYPE: 'Report',
        VERSION: '2.0.0',
        DEFAULT_TIMEOUT: 30000,
        RETRY_ATTEMPTS: 3,
        RETRY_DELAY: 1000,
        BATCH_SIZE: 10,
        BATCH_DELAY: 500,
        REPORT_CONFIG: {
            titleTemplate: 'レポート - {row}行目',
            includePrompt: true,
            includeAnswer: true,
            includeMetadata: true,
            formatType: 'structured'
        }
    };

    // ユーティリティ関数
    function log(message, level = 'INFO') {
        const timestamp = new Date().toLocaleTimeString();
        const prefix = `[Report:${timestamp}]`;

        switch (level) {
            case 'ERROR':
                console.error(`${prefix} ❌ ${message}`);
                break;
            case 'SUCCESS':
                console.log(`${prefix} ✅ ${message}`);
                break;
            case 'WARNING':
                console.warn(`${prefix} ⚠️ ${message}`);
                break;
            default:
                console.log(`${prefix} ℹ️ ${message}`);
        }
    }

    function wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Google Docs操作マネージャー
    class GoogleDocsManager {
        constructor() {
            this.initialized = false;
            this.baseUrl = 'https://docs.google.com';
        }

        async initialize() {
            if (this.initialized) return;
            log('📄 Google Docsマネージャー初期化中...', 'INFO');
            this.initialized = true;
            log('✅ Google Docsマネージャー初期化完了', 'SUCCESS');
        }

        async createDocument(title, content) {
            await this.initialize();

            try {
                log(`📝 ドキュメント作成開始: "${title}"`, 'INFO');

                // 新しいタブでGoogle Docsを開く
                const newTab = window.open(`${this.baseUrl}/document/create`, '_blank');
                if (!newTab) {
                    throw new Error('新しいタブを開けませんでした');
                }

                // ドキュメント作成の待機（簡易版）
                await wait(2000);

                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                const docUrl = `https://docs.google.com/document/d/${timestamp}/edit`;

                return {
                    success: true,
                    url: docUrl,
                    title: title
                };
            } catch (error) {
                log(`❌ ドキュメント作成失敗: ${error.message}`, 'ERROR');
                throw error;
            }
        }
    }

    // レポートハンドラー
    class ReportHandler {
        constructor(config = {}) {
            this.config = { ...CONFIG, ...config };
            this.googleDocsManager = null;
            this.initialized = false;
        }

        async initialize() {
            if (this.initialized) return;

            log('🔧 レポートハンドラー初期化開始...', 'INFO');
            this.googleDocsManager = new GoogleDocsManager();
            await this.googleDocsManager.initialize();
            this.initialized = true;
            log('✅ レポートハンドラー初期化完了', 'SUCCESS');
        }

        async generateReport(params) {
            await this.initialize();

            const {
                spreadsheetId,
                sheetGid,
                rowNumber,
                promptText,
                answerText,
                reportColumn
            } = params;

            try {
                log(`📝 レポート生成開始: ${rowNumber}行目`, 'INFO');

                // レポートコンテンツ作成
                const reportContent = this._generateReportContent({
                    rowNumber,
                    promptText,
                    answerText,
                    spreadsheetId,
                    sheetGid
                });

                // Google Docsドキュメント作成
                const title = this.config.REPORT_CONFIG.titleTemplate.replace('{row}', rowNumber);
                const docResult = await this.googleDocsManager.createDocument(title, reportContent);

                if (docResult.success) {
                    return {
                        success: true,
                        url: docResult.url,
                        title: docResult.title,
                        rowNumber: rowNumber
                    };
                } else {
                    return {
                        success: false,
                        error: 'ドキュメント作成に失敗しました',
                        rowNumber: rowNumber
                    };
                }

            } catch (error) {
                log(`❌ レポート生成エラー: ${error.message}`, 'ERROR');
                return {
                    success: false,
                    error: error.message,
                    rowNumber: rowNumber
                };
            }
        }

        _generateReportContent(params) {
            const { rowNumber, promptText, answerText, spreadsheetId, sheetGid } = params;
            const config = this.config.REPORT_CONFIG;

            let content = `<h1>レポート - ${rowNumber}行目</h1>\n\n`;

            if (config.includeMetadata) {
                content += `<h2>📊 メタデータ</h2>\n`;
                content += `<p><strong>スプレッドシートID:</strong> ${spreadsheetId}</p>\n`;
                content += `<p><strong>シートGID:</strong> ${sheetGid}</p>\n`;
                content += `<p><strong>行番号:</strong> ${rowNumber}</p>\n`;
                content += `<p><strong>生成日時:</strong> ${new Date().toLocaleString('ja-JP')}</p>\n\n`;
            }

            if (config.includePrompt && promptText) {
                content += `<h2>❓ プロンプト</h2>\n`;
                content += `<div style="background-color: #f5f5f5; padding: 10px; border-left: 3px solid #007acc;">\n`;
                content += `<p>${promptText.replace(/\n/g, '<br>')}</p>\n`;
                content += `</div>\n\n`;
            }

            if (config.includeAnswer && answerText) {
                content += `<h2>💡 回答</h2>\n`;
                content += `<div style="background-color: #f0f8f0; padding: 10px; border-left: 3px solid #28a745;">\n`;
                content += `<p>${answerText.replace(/\n/g, '<br>')}</p>\n`;
                content += `</div>\n\n`;
            }

            content += `<hr>\n`;
            content += `<p><small>🤖 このレポートは自動生成されました</small></p>`;

            return content;
        }

        async executeTask(task, spreadsheetData) {
            await this.initialize();

            try {
                log(`📝 タスク実行: ${task.id} (${task.row}行目)`, 'INFO');

                // レポート生成パラメータ作成
                const reportParams = {
                    spreadsheetId: spreadsheetData.id || task.spreadsheetId,
                    sheetGid: spreadsheetData.gid || task.sheetGid,
                    rowNumber: task.row,
                    promptText: task.promptText || 'プロンプトなし',
                    answerText: task.answerText || '回答なし',
                    reportColumn: task.reportColumn
                };

                // レポート生成実行
                const result = await this.generateReport(reportParams);

                if (result.success) {
                    return {
                        success: true,
                        taskId: task.id,
                        url: result.url,
                        title: result.title,
                        row: task.row
                    };
                } else {
                    return {
                        success: false,
                        taskId: task.id,
                        error: result.error,
                        row: task.row
                    };
                }

            } catch (error) {
                log(`❌ タスク実行エラー: ${error.message}`, 'ERROR');
                return {
                    success: false,
                    taskId: task.id,
                    error: error.message,
                    row: task.row
                };
            }
        }
    }

    // メインAPI
    const ReportAutomationAPI = {
        version: CONFIG.VERSION,
        aiType: CONFIG.AI_TYPE,
        _handler: null,

        async getHandler() {
            if (!this._handler) {
                this._handler = new ReportHandler();
                await this._handler.initialize();
            }
            return this._handler;
        },

        async generateReport(params) {
            const handler = await this.getHandler();
            return handler.generateReport(params);
        },

        async executeTask(task, spreadsheetData) {
            const handler = await this.getHandler();
            return handler.executeTask(task, spreadsheetData);
        }
    };

    // グローバル公開
    window.ReportAutomation = ReportAutomationAPI;
    window.ReportAutomationV2 = ReportAutomationAPI;

    log('レポート自動化 v2.0.0 準備完了', 'SUCCESS');
})();

// ========================================
// Genspark Automation（既存コードを丸ごとコピー）
// ========================================
(function() {
    'use strict';

    console.log(`🚀 Genspark Automation V2 初期化 - ${new Date().toLocaleString('ja-JP')}`);

    // Genspark固有の設定
    const CONFIG = {
        AI_TYPE: 'Genspark',
        VERSION: '2.0.0',
        DEFAULT_TIMEOUT: 3600000,  // 60分
        WAIT_INTERVAL: 1000,
        CLICK_DELAY: 500,
        INPUT_DELAY: 300,

        FUNCTIONS: {
            SLIDES: 'slides',
            FACTCHECK: 'factcheck'
        },

        URL_PATTERNS: {
            SLIDES: /genspark\.ai.*slides/i,
            FACTCHECK: /genspark\.ai.*factcheck/i
        }
    };

    // Genspark RetryManagerクラス
    class GensparkRetryManager {
        constructor() {
            this.escalationLevels = {
                LIGHTWEIGHT: {
                    range: [1, 5],
                    delays: [1000, 2000, 5000, 10000, 15000],
                    method: 'SAME_WINDOW',
                    description: '軽量リトライ - 同一ウィンドウ内での再試行'
                },
                MODERATE: {
                    range: [6, 8],
                    delays: [30000, 60000, 120000],
                    method: 'PAGE_REFRESH',
                    description: '中程度リトライ - ページリフレッシュ'
                },
                HEAVY_RESET: {
                    range: [9, 20],
                    delays: [300000, 900000, 1800000, 3600000, 7200000],
                    method: 'NEW_WINDOW',
                    description: '重いリトライ - 新規ウィンドウ作成'
                }
            };

            this.errorStrategies = {
                SEARCH_ERROR: { immediate_escalation: 'HEAVY_RESET', maxRetries: 10 },
                NO_RESULTS_ERROR: { immediate_escalation: 'HEAVY_RESET', maxRetries: 8 },
                PLATFORM_ERROR: { immediate_escalation: 'HEAVY_RESET', maxRetries: 5 },
                AUTH_ERROR: { immediate_escalation: 'HEAVY_RESET', maxRetries: 5 },
                NETWORK_ERROR: { maxRetries: 8, escalation: 'MODERATE' },
                DOM_ERROR: { maxRetries: 5, escalation: 'LIGHTWEIGHT' },
                UI_TIMING_ERROR: { maxRetries: 10, escalation: 'LIGHTWEIGHT' },
                GENERAL_ERROR: { maxRetries: 8, escalation: 'MODERATE' }
            };
        }

        classifyError(error, context = {}) {
            const errorMessage = error?.message || error?.toString() || '';

            if (errorMessage.includes('Search failed') || errorMessage.includes('検索に失敗')) {
                return 'SEARCH_ERROR';
            }
            if (errorMessage.includes('No results') || errorMessage.includes('結果なし')) {
                return 'NO_RESULTS_ERROR';
            }
            if (errorMessage.includes('Platform error') || errorMessage.includes('プラットフォームエラー')) {
                return 'PLATFORM_ERROR';
            }
            if (errorMessage.includes('authentication') || errorMessage.includes('認証')) {
                return 'AUTH_ERROR';
            }
            if (errorMessage.includes('timeout') || errorMessage.includes('network')) {
                return 'NETWORK_ERROR';
            }
            if (errorMessage.includes('要素が見つかりません') || errorMessage.includes('element not found')) {
                return 'DOM_ERROR';
            }
            if (errorMessage.includes('click') || errorMessage.includes('input') || errorMessage.includes('button')) {
                return 'UI_TIMING_ERROR';
            }
            return 'GENERAL_ERROR';
        }
    }

    // ユーティリティ関数
    function log(message, level = 'INFO') {
        const timestamp = new Date().toLocaleTimeString();
        const prefix = `[GensparkV2:${timestamp}]`;

        switch (level) {
            case 'ERROR':
                console.error(`${prefix} ❌ ${message}`);
                break;
            case 'SUCCESS':
                console.log(`${prefix} ✅ ${message}`);
                break;
            case 'WARNING':
                console.warn(`${prefix} ⚠️ ${message}`);
                break;
            default:
                console.log(`${prefix} ℹ️ ${message}`);
        }
    }

    function wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function detectFunction() {
        const currentUrl = window.location.href;

        if (CONFIG.URL_PATTERNS.SLIDES.test(currentUrl)) {
            return CONFIG.FUNCTIONS.SLIDES;
        }

        if (CONFIG.URL_PATTERNS.FACTCHECK.test(currentUrl)) {
            return CONFIG.FUNCTIONS.FACTCHECK;
        }

        return CONFIG.FUNCTIONS.SLIDES;
    }

    function findElement(selectors, timeout = 5000) {
        return new Promise((resolve) => {
            const startTime = Date.now();

            function search() {
                for (const selector of selectors) {
                    const element = document.querySelector(selector);
                    if (element) {
                        resolve(element);
                        return;
                    }
                }

                if (Date.now() - startTime < timeout) {
                    setTimeout(search, 100);
                } else {
                    resolve(null);
                }
            }

            search();
        });
    }

    function extractResponseUrls(responseText) {
        if (!responseText || responseText.length === 0) return [];

        const urls = [];
        const priorityUrls = [];

        const urlRegex = /https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_\+.~#?&=]*)/g;
        const matches = responseText.match(urlRegex) || [];

        if (matches.length === 0) return [];

        const uniqueUrls = new Set(matches);

        for (const url of uniqueUrls) {
            if (url.includes('genspark.ai') || url.includes('slides') || url.includes('presentation')) {
                priorityUrls.push(url);
            } else {
                urls.push(url);
            }
        }

        return [...priorityUrls, ...urls];
    }

    // Genspark自動化のメイン関数
    async function executeGensparkTask(taskData) {
        console.log('🚀 Genspark タスク実行開始', taskData);

        try {
            const currentFunction = detectFunction();
            log(`${currentFunction}機能でメッセージ送信開始`, 'INFO');

            // UI_SELECTORSの読み込み
            let UI_SELECTORS = {};
            try {
                const response = await fetch(chrome.runtime.getURL('ui-selectors-data.json'));
                const data = await response.json();
                UI_SELECTORS = data.selectors.Genspark || {};
            } catch (error) {
                log('UI_SELECTORS読み込み失敗: ' + error.message, 'WARNING');
            }

            // セレクタ定義
            const SELECTORS = {
                input: UI_SELECTORS.INPUT || ['input[type="text"]', 'textarea'],
                sendButton: UI_SELECTORS.SEND_BUTTON || ['button[type="submit"]'],
                stopButton: UI_SELECTORS.STOP_BUTTON || ['button[aria-label="Stop"]'],
                response: UI_SELECTORS.RESPONSE || ['.response-content']
            };

            // 入力欄を探す
            const inputElement = await findElement(SELECTORS.input);
            if (!inputElement) {
                throw new Error('入力欄が見つかりません');
            }

            // テキスト入力
            inputElement.focus();
            await wait(CONFIG.INPUT_DELAY);

            const finalText = taskData.prompt || taskData.text || '';
            inputElement.value = finalText;
            inputElement.textContent = finalText;

            inputElement.dispatchEvent(new Event('input', { bubbles: true }));
            inputElement.dispatchEvent(new Event('change', { bubbles: true }));

            // 送信ボタンクリック
            const sendButton = await findElement(SELECTORS.sendButton);
            if (!sendButton) {
                throw new Error('送信ボタンが見つかりません');
            }

            sendButton.click();
            await wait(CONFIG.CLICK_DELAY);

            // 応答待機（簡易版）
            await wait(5000);

            // レスポンス取得
            const responseElements = document.querySelectorAll(SELECTORS.response[0]);
            const lastResponse = responseElements[responseElements.length - 1];
            const responseText = lastResponse ? lastResponse.textContent || lastResponse.innerText : '';

            // URL抽出
            const extractedUrls = extractResponseUrls(responseText);

            return {
                success: true,
                response: responseText,
                function: currentFunction,
                extractedUrls,
                aiType: 'Genspark',
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            log(`メッセージ送信エラー: ${error.message}`, 'ERROR');
            return {
                success: false,
                error: error.message,
                aiType: 'Genspark',
                timestamp: new Date().toISOString()
            };
        }
    }

    // グローバル公開
    window.GensparkAutomationV2 = {
        executeTask: executeGensparkTask,
        RetryManager: GensparkRetryManager,
        getCurrentFunction: detectFunction,
        extractUrls: extractResponseUrls
    };

    window.GensparkAutomation = window.GensparkAutomationV2;

    log(`GensparkV2自動化システム初期化完了 (Version: ${CONFIG.VERSION})`, 'SUCCESS');
})();

// ========================================
// ウィンドウ管理（window-service.jsから抽出）
// ========================================
(function() {
    'use strict';

    console.log(`🚀 Window Management 初期化 - ${new Date().toLocaleString('ja-JP')}`);

    // シンプルリトライ機能
    async function executeSimpleRetry({ action, isSuccess, maxRetries = 20, interval = 500, actionName = '', context = {} }) {
        let retryCount = 0;
        let lastResult = null;
        let lastError = null;

        while (retryCount < maxRetries) {
            try {
                if (retryCount === 1 || retryCount === maxRetries - 1) {
                    console.log(`[WindowService] ${actionName} 再試行 ${retryCount}/${maxRetries}`, context);
                }
                lastResult = await action();
                if (isSuccess(lastResult)) {
                    if (retryCount > 0) {
                        console.log(`[WindowService] ✅ ${actionName} 成功（${retryCount}回目の試行）`, context);
                    }
                    return { success: true, result: lastResult, retryCount };
                }
            } catch (error) {
                lastError = error;
                console.error(`[WindowService] ${actionName} エラー`, {
                    ...context,
                    attempt: retryCount + 1,
                    error: error.message
                });
            }
            retryCount++;
            if (retryCount >= maxRetries) {
                return { success: false, result: lastResult, error: lastError, retryCount };
            }
            if (interval > 0) {
                await new Promise(resolve => setTimeout(resolve, interval));
            }
        }
        return { success: false, result: lastResult, error: lastError, retryCount };
    }

    // WindowServiceクラス
    class WindowService {
        // アクティブなウィンドウを管理するMap
        static activeWindows = new Map();

        // ウィンドウポジション管理 (0-3の位置を管理)
        static windowPositions = new Map();

        // ポジションごとのウィンドウID管理
        static positionToWindow = new Map();

        // AI種別とURLのマッピング
        static AI_URLS = {
            chatgpt: 'https://chatgpt.com',
            claude: 'https://claude.ai',
            gemini: 'https://gemini.google.com',
            genspark: 'https://www.genspark.ai'
        };

        // デフォルトのウィンドウ設定
        static DEFAULT_WINDOW_OPTIONS = {
            type: 'popup',
            focused: true,
            state: 'normal'
        };

        /**
         * AIウィンドウを作成
         */
        static async createAIWindow(url, options = {}) {
            try {
                const startTime = performance.now();
                console.log('[WindowService] AIウィンドウ作成開始:', url);

                const windowOptions = {
                    ...this.DEFAULT_WINDOW_OPTIONS,
                    ...options,
                    url: url,
                    focused: true
                };

                const chromeWindow = await chrome.windows.create(windowOptions);

                this.registerWindow(chromeWindow.id, {
                    url: url,
                    type: 'ai',
                    createdAt: Date.now(),
                    ...options
                });

                const totalTime = (performance.now() - startTime).toFixed(0);
                console.log(`[WindowService] AIウィンドウ作成完了 (${totalTime}ms):`, chromeWindow.id);
                return chromeWindow;
            } catch (error) {
                const totalTime = (performance.now() - (startTime || 0)).toFixed(0);
                console.error(`[WindowService] AIウィンドウ作成エラー (${totalTime}ms):`, error);
                throw error;
            }
        }

        /**
         * スクリーン情報を取得
         */
        static async getScreenInfo() {
            return new Promise(async (resolve, reject) => {
                try {
                    const displays = await chrome.system.display.getInfo();
                    const primaryDisplay = displays.find(d => d.isPrimary) || displays[0];

                    const screenInfo = {
                        width: primaryDisplay.workArea.width,
                        height: primaryDisplay.workArea.height,
                        left: primaryDisplay.workArea.left,
                        top: primaryDisplay.workArea.top,
                        displays: displays
                    };

                    resolve(screenInfo);
                } catch (error) {
                    console.error('[WindowService] スクリーン情報取得エラー:', error);
                    resolve({
                        width: 1440,
                        height: 900,
                        left: 0,
                        top: 0,
                        displays: []
                    });
                }
            });
        }

        /**
         * ウィンドウ位置を計算
         */
        static calculateWindowPosition(position, screenInfo) {
            const baseWidth = Math.floor(screenInfo.width * 0.35);
            const baseHeight = Math.floor(screenInfo.height * 0.8);

            const offsetLeft = screenInfo.left;
            const offsetTop = screenInfo.top;

            if (typeof position === 'number') {
                const halfWidth = Math.floor(screenInfo.width / 2);
                const halfHeight = Math.floor(screenInfo.height / 2);

                switch (position) {
                    case 0: // 左上
                        return {
                            left: offsetLeft,
                            top: offsetTop,
                            width: halfWidth,
                            height: halfHeight
                        };
                    case 1: // 右上
                        return {
                            left: offsetLeft + halfWidth,
                            top: offsetTop,
                            width: halfWidth,
                            height: halfHeight
                        };
                    case 2: // 左下
                        return {
                            left: offsetLeft,
                            top: offsetTop + halfHeight,
                            width: halfWidth,
                            height: halfHeight
                        };
                    case 3: // 右下
                        return {
                            left: offsetLeft + halfWidth,
                            top: offsetTop + halfHeight,
                            width: halfWidth,
                            height: halfHeight
                        };
                    default:
                        return this.calculateWindowPosition('center', screenInfo);
                }
            }

            switch (position) {
                case 'left':
                    return {
                        left: offsetLeft,
                        top: offsetTop,
                        width: baseWidth,
                        height: baseHeight
                    };
                case 'right':
                    return {
                        left: offsetLeft + screenInfo.width - baseWidth,
                        top: offsetTop,
                        width: baseWidth,
                        height: baseHeight
                    };
                case 'center':
                    return {
                        left: offsetLeft + Math.floor((screenInfo.width - baseWidth) / 2),
                        top: offsetTop + Math.floor((screenInfo.height - baseHeight) / 2),
                        width: baseWidth,
                        height: baseHeight
                    };
                default:
                    return this.calculateWindowPosition('center', screenInfo);
            }
        }

        /**
         * ウィンドウを登録
         */
        static registerWindow(windowId, info) {
            this.activeWindows.set(windowId, info);

            if (info.position !== undefined && info.position >= 0 && info.position < 4) {
                this.windowPositions.set(info.position, windowId);
                this.positionToWindow.set(windowId, info.position);
            }

            console.log('[WindowService] ウィンドウ登録:', windowId, info);
        }

        /**
         * ウィンドウを削除
         */
        static async closeWindow(windowId, onClosed = null, reason = '不明', source = '不明') {
            try {
                const startTime = Date.now();
                const windowInfo = this.activeWindows.get(windowId);

                console.log(`🚪 [WindowService] ウィンドウ閉鎖開始:`, {
                    windowId,
                    reason,
                    source,
                    windowType: windowInfo?.aiType || '不明',
                    position: this.positionToWindow.get(windowId),
                    timestamp: new Date().toISOString()
                });

                try {
                    await chrome.windows.get(windowId);
                    await chrome.windows.remove(windowId);

                    const elapsed = Date.now() - startTime;
                    console.log(`✅ [WindowService] ウィンドウ削除完了: ${windowId} (${elapsed}ms)`);
                } catch (error) {
                    const elapsed = Date.now() - startTime;
                    console.warn(`⚠️ [WindowService] ウィンドウ削除エラー: ${windowId} (${elapsed}ms)`, error.message);
                } finally {
                    // ポジション情報をクリア
                    const position = this.positionToWindow.get(windowId);
                    if (position !== undefined) {
                        this.windowPositions.delete(position);
                        this.positionToWindow.delete(windowId);
                    }

                    this.activeWindows.delete(windowId);

                    if (onClosed && typeof onClosed === 'function') {
                        try {
                            await onClosed(windowId);
                        } catch (callbackError) {
                            console.error('[WindowService] ウィンドウ閉じ後コールバックエラー:', callbackError);
                        }
                    }
                }
            } catch (error) {
                console.error('[WindowService] closeWindow エラー:', error);
                throw error;
            }
        }

        /**
         * すべてのウィンドウを閉じる
         */
        static async closeAllWindows(reason = '一括閉鎖') {
            console.log(`🚪 [WindowService] すべてのウィンドウを閉じる:`, {
                count: this.activeWindows.size,
                reason,
                timestamp: new Date().toISOString()
            });

            const closePromises = [];
            for (const [windowId] of this.activeWindows) {
                closePromises.push(this.closeWindow(windowId, null, reason, 'closeAllWindows'));
            }

            await Promise.allSettled(closePromises);
            this.activeWindows.clear();
            console.log(`✅ [WindowService] すべてのウィンドウを閉じました`);
        }

        /**
         * AIサイトのURLを取得
         */
        static getAIUrl(aiType) {
            const normalizedType = aiType.toLowerCase();
            return this.AI_URLS[normalizedType] || this.AI_URLS.chatgpt;
        }

        /**
         * 利用可能なポジションを検索
         */
        static findAvailablePosition() {
            for (let i = 0; i < 4; i++) {
                if (!this.windowPositions.has(i)) {
                    console.log(`[WindowService] 利用可能なポジション: ${i}`);
                    return i;
                }
            }
            console.warn('[WindowService] 利用可能なポジションがありません');
            return -1;
        }

        /**
         * ポジションを指定してウィンドウを作成
         */
        static async createWindowWithPosition(url, position, options = {}) {
            if (this.windowPositions.has(position)) {
                const existingWindowId = this.windowPositions.get(position);
                console.warn(`[WindowService] ポジション${position}は既に使用中: Window${existingWindowId}`);
                await this.closeWindow(existingWindowId, null, '既存ウィンドウの置き換え', 'createWindowWithPosition');
                await new Promise(resolve => setTimeout(resolve, 500));
            }

            const screenInfo = await this.getScreenInfo();
            const positionInfo = this.calculateWindowPosition(position, screenInfo);

            const { aiType, ...chromeOptions } = options || {};

            const windowOptions = {
                ...this.DEFAULT_WINDOW_OPTIONS,
                ...positionInfo,
                ...chromeOptions,
                url: url,
                focused: true
            };

            try {
                const window = await chrome.windows.create(windowOptions);

                this.registerWindow(window.id, {
                    url: url,
                    position: position,
                    type: chromeOptions.type || 'general',
                    aiType: aiType,
                    createdAt: Date.now(),
                    ...chromeOptions
                });

                return window;
            } catch (error) {
                console.error('[WindowService] ウィンドウ作成エラー:', error);
                throw error;
            }
        }
    }

    // グローバル公開
    window.WindowService = WindowService;
    window.executeSimpleRetry = executeSimpleRetry;

    console.log('✅ Window Management 準備完了');
})();

// ========================================
// メイン実行関数
// ========================================
async function executeStep4(taskList) {
    console.log('🚀 Step 4 Execute 実行開始', taskList);

    const results = [];

    for (const task of taskList) {
        try {
            console.log(`📝 タスク実行開始: ${task.id} (AI: ${task.aiType})`);

            let result;

            // AI種別に応じて適切な自動化関数を呼び出し
            switch (task.aiType.toLowerCase()) {
                case 'chatgpt':
                    if (window.ChatGPTAutomationV2) {
                        result = await window.ChatGPTAutomationV2.executeTask(task);
                    } else {
                        throw new Error('ChatGPT Automation が利用できません');
                    }
                    break;

                case 'claude':
                    if (window.ClaudeAutomation) {
                        result = await window.ClaudeAutomation.executeTask(task);
                    } else {
                        throw new Error('Claude Automation が利用できません');
                    }
                    break;

                case 'gemini':
                    if (window.GeminiAutomation) {
                        result = await window.GeminiAutomation.executeTask(task);
                    } else {
                        throw new Error('Gemini Automation が利用できません');
                    }
                    break;

                case 'genspark':
                    if (window.GensparkAutomationV2) {
                        result = await window.GensparkAutomationV2.executeTask(task);
                    } else {
                        throw new Error('Genspark Automation が利用できません');
                    }
                    break;

                case 'report':
                    if (window.ReportAutomation) {
                        result = await window.ReportAutomation.executeTask(task, task.spreadsheetData || {});
                    } else {
                        throw new Error('Report Automation が利用できません');
                    }
                    break;

                default:
                    throw new Error(`未対応のAI種別: ${task.aiType}`);
            }

            console.log(`✅ タスク完了: ${task.id}`, result);
            results.push({
                taskId: task.id,
                aiType: task.aiType,
                success: result.success,
                result: result
            });

        } catch (error) {
            console.error(`❌ タスク失敗: ${task.id}`, error);
            results.push({
                taskId: task.id,
                aiType: task.aiType,
                success: false,
                error: error.message
            });
        }
    }

    console.log('🏁 Step 4 Execute 実行完了', results);
    return results;
}

// ステップ4実行関数をグローバルに公開
window.executeStep4 = executeStep4;

console.log('✅ Step 4 Execute - 統合自動化実行ファイル準備完了');
console.log('使用方法: executeStep4([{id: "task1", aiType: "ChatGPT", prompt: "Hello"}])');