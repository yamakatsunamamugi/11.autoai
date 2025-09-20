/**
 * @fileoverview Claude Automation V2 - ステップ実行版
 *
 * 【ステップ構成】
 * Step 4-2-0: 初期化（設定・セレクタ読み込み）
 * Step 4-2-1: ヘルパー関数定義
 * Step 4-2-2: テキスト入力
 * Step 4-2-3: モデル選択（条件付き）
 * Step 4-2-4: 機能選択（条件付き）
 * Step 4-2-5: メッセージ送信
 * Step 4-2-6: 応答待機（通常/Deep Research）
 * Step 4-2-6-5: 「続ける」ボタンチェック（新規追加）
 * Step 4-2-7: テキスト取得
 *
 * @version 3.1.0
 * @updated 2024-12-20 Step 4-2-X番号体系導入、詳細エラーログ強化
 */
(function() {
    'use strict';

    const scriptLoadTime = Date.now();
    const loadTimeISO = new Date().toISOString();

    // =======================================
    // ClaudeLogger - 集中ログ管理システム
    // =======================================
    const ClaudeLogger = {
        logLevel: 'INFO', // ERROR, WARN, INFO, DEBUG
        logLevels: { ERROR: 0, WARN: 1, INFO: 2, DEBUG: 3 },
        rateLimitMap: new Map(),
        retryCounters: new Map(),

        setLevel(level) {
            this.logLevel = level;
            ClaudeLogger.info(`📊 ログレベルを${level}に設定しました`);
        },

        shouldLog(level) {
            return this.logLevels[level] <= this.logLevels[this.logLevel];
        },

        formatMessage(level, message, data = null) {
            const emoji = { ERROR: '❌', WARN: '⚠️', INFO: '✅', DEBUG: '🔍' }[level];
            const timestamp = new Date().toLocaleTimeString('ja-JP');
            return { emoji, timestamp, message, data };
        },

        error(message, data = null) {
            if (this.shouldLog('ERROR')) {
                const formatted = this.formatMessage('ERROR', message, data);
                console.error(`${formatted.emoji} [${formatted.timestamp}] ${message}`, data || '');
            }
        },

        warn(message, data = null) {
            if (this.shouldLog('WARN')) {
                const formatted = this.formatMessage('WARN', message, data);
                console.warn(`${formatted.emoji} [${formatted.timestamp}] ${message}`, data || '');
            }
        },

        info(message, data = null) {
            if (this.shouldLog('INFO')) {
                const formatted = this.formatMessage('INFO', message, data);
                console.info(`${formatted.emoji} [${formatted.timestamp}] ${message}`, data || '');
            }
        },

        debug(message, data = null) {
            if (this.shouldLog('DEBUG')) {
                const formatted = this.formatMessage('DEBUG', message, data);
                console.info(`${formatted.emoji} [${formatted.timestamp}] ${message}`, data || '');
            }
        },

        // リトライ処理の集約ログ
        logRetry(operation, attempt, maxAttempts, error = null) {
            const key = operation;
            if (attempt === 1) {
                this.retryCounters.set(key, { start: Date.now(), attempts: [] });
            }

            const counter = this.retryCounters.get(key);
            counter.attempts.push({ attempt, error: error?.message });

            if (attempt === maxAttempts) {
                const duration = Date.now() - counter.start;
                this.error(`${operation} 失敗 (${maxAttempts}回リトライ, ${duration}ms)`, counter.attempts);
                this.retryCounters.delete(key);
            } else if (this.shouldLog('DEBUG')) {
                this.debug(`${operation} リトライ ${attempt}/${maxAttempts}`);
            }
        },

        // レート制限付きログ（同じメッセージの繰り返しを抑制）
        logRateLimited(key, message, data = null, intervalMs = 5000) {
            const now = Date.now();
            const lastLogged = this.rateLimitMap.get(key);

            if (!lastLogged || now - lastLogged > intervalMs) {
                this.info(message, data);
                this.rateLimitMap.set(key, now);
            }
        }
    };

    // グローバルに公開
    window.ClaudeLogger = ClaudeLogger;

    // デフォルトログレベル設定（本番環境では INFO、開発環境では DEBUG）
    const isDebugMode = window.location.href.includes('localhost') ||
                       localStorage.getItem('claudeLogLevel') === 'DEBUG';
    ClaudeLogger.setLevel(isDebugMode ? 'DEBUG' : 'INFO');

    ClaudeLogger.info('Claude Automation V2 初期化開始', {
        url: window.location.href,
        既存のClaudeAutomation: typeof window.ClaudeAutomation
    });

    // 初期化順序検証ログ
    ClaudeLogger.info('🔍 [Claude初期化DEBUG] スクリプト初期化状態確認:', {
        スクリプトロード時刻: loadTimeISO,
        タイムスタンプ: scriptLoadTime,
        URL: window.location.href,
        タイトル: document.title,
        readyState: document.readyState,
        既存マーカー: {
            CLAUDE_SCRIPT_LOADED: window.CLAUDE_SCRIPT_LOADED || false,
            CLAUDE_SCRIPT_INIT_TIME: window.CLAUDE_SCRIPT_INIT_TIME || null
        },
        chromeオブジェクト: typeof chrome !== 'undefined',
        runtime: typeof chrome?.runtime !== 'undefined',
        tabs: typeof chrome?.tabs !== 'undefined'
    });

    // ========================================
    // ログ管理システムの初期化（メッセージベース対応）
    // ========================================
    // Content scriptから直接importできないため、メッセージベースのログマネージャーを作成
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
            this.addLog({
                type: 'step',
                step,
                message,
                data
            });
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

        logSuccess(step, message, result = {}) {
            this.addLog({
                type: 'success',
                step,
                message,
                result
            });
        },

        logTaskStart(taskData) {
            this.addLog({
                type: 'task_start',
                taskData: {
                    model: taskData.model,
                    function: taskData.function,
                    promptLength: taskData.prompt?.length || 0,
                    cellInfo: taskData.cellInfo
                }
            });
        },

        logTaskComplete(result) {
            this.addLog({
                type: 'task_complete',
                result: {
                    success: result.success,
                    responseLength: result.response?.length || 0,
                    error: result.error
                }
            });
        },

        async saveErrorImmediately(error, context = {}) {
            // エラーログ保存機能は無効化されています
            // ClaudeLogger.debug('[DEBUG] saveErrorImmediately呼び出し:', error.message);
            /* try {
                const timestamp = new Date().toISOString()
                    .replace(/[:.]/g, '-')
                    .replace('T', '_')
                    .slice(0, -5);

                const errorData = {
                    timestamp: new Date().toISOString(),
                    type: 'error',
                    error: {
                        message: error.message,
                        stack: error.stack,
                        name: error.name
                    },
                    context,
                    sessionStart: this.sessionStartTime
                };

                // エラーレポート生成を無効化
                const fileName = `11autoai-logs/claude/errors/error-${timestamp}.json`;

                // バックグラウンドスクリプトにメッセージを送信
                if (typeof chrome !== 'undefined' && chrome.runtime) {
                    chrome.runtime.sendMessage({
                        type: 'DOWNLOAD_LOG_FILE',
                        data: {
                            fileName,
                            content: JSON.stringify(errorData, null, 2)
                        }
                    });
                }
                ClaudeLogger.info(`❌ [エラー保存] ${fileName}`);
            } catch (saveError) {
                ClaudeLogger.error('[エラー保存失敗]', saveError);
            } */
        },

        async saveIntermediate() {
            // 実装は省略（必要に応じて追加）
        },

        async saveToFile() {
            // Claudeレポート生成を無効化
            if (this.logs.length === 0) {
                ClaudeLogger.info('[LogFileManager] 保存するログがありません');
                return;
            }

            // ファイル保存処理を無効化 - コンソールログのみ出力
            ClaudeLogger.info('[LogFileManager] レポート生成は無効化されています');
            ClaudeLogger.info(`[LogFileManager] ログ件数: ${this.logs.length}`);

            // ログをクリア
            this.logs = [];
            return null;

            // 以下、元のファイル保存処理（無効化）
            // try {
            //     const timestamp = new Date().toISOString()
            //         .replace(/[:.]/g, '-')
            //         .replace('T', '_')
            //         .slice(0, -5);
            //
            //     const fileName = `claude-log-${timestamp}.json`;
            //     const filePath = `11autoai-logs/claude/complete/${fileName}`;
            //
            //     const logData = {
            //         sessionStart: this.sessionStartTime,
            //         sessionEnd: new Date().toISOString(),
            //         totalLogs: this.logs.length,
            //         logs: this.logs
            //     };
            //
            //     // 通常ログレポート生成も無効化
            //     // バックグラウンドスクリプトにメッセージを送信
            //     if (typeof chrome !== 'undefined' && chrome.runtime) {
            //         chrome.runtime.sendMessage({
            //             type: 'DOWNLOAD_LOG_FILE',
            //             data: {
            //                 fileName: filePath,
            //                 content: JSON.stringify(logData, null, 2)
            //             }
            //         });
            //     }
            //
            //     ClaudeLogger.info(`✅ [LogFileManager] 最終ログを保存しました: ${fileName}`);
            //
            //     // ログをクリア
            //     this.logs = [];
            //     return filePath;
            // } catch (error) {
            //     ClaudeLogger.error('[LogFileManager] ログ保存エラー:', error);
            //     throw error;
            // }
        },

        clearCurrentLogs() {
            this.logs = [];
            ClaudeLogger.info('[LogFileManager] 現在のログをクリアしました');
        }
    };

    const ClaudeLogManager = {
        // LogFileManagerのプロキシとして動作
        get logFileManager() {
            return window.claudeLogFileManager || {
                logStep: () => {},
                logError: () => {},
                logSuccess: () => {},
                logTaskStart: () => {},
                logTaskComplete: () => {},
                saveToFile: () => {},
                saveErrorImmediately: () => {},
                saveIntermediate: () => {}
            };
        },

        // ステップログを記録
        logStep(step, message, data = {}) {
            this.logFileManager.logStep(step, message, data);
            ClaudeLogger.info(`📝 [ログ] ${step}: ${message}`);
        },

        // エラーログを記録（即座にファイル保存）
        async logError(step, error, context = {}) {
            this.logFileManager.logError(step, error, context);
            ClaudeLogger.error(`❌ [エラーログ] ${step}:`, error);
            // エラーは即座に保存
            await this.logFileManager.saveErrorImmediately(error, { step, ...context });
        },

        // 成功ログを記録
        logSuccess(step, message, result = {}) {
            this.logFileManager.logSuccess(step, message, result);
            ClaudeLogger.info(`✅ [成功ログ] ${step}: ${message}`);
        },

        // タスク開始を記録
        startTask(taskData) {
            this.logFileManager.logTaskStart(taskData);
            ClaudeLogger.info(`🚀 [タスク開始]`, taskData);
        },

        // タスク完了を記録
        completeTask(result) {
            this.logFileManager.logTaskComplete(result);
            ClaudeLogger.info(`🏁 [タスク完了]`, result);
        },

        // ログをファイルに保存（最終保存）
        async saveToFile() {
            try {
                const filePath = await this.logFileManager.saveToFile();
                ClaudeLogger.info(`✅ [ClaudeLogManager] 最終ログを保存しました: ${filePath}`);
                return filePath;
            } catch (error) {
                ClaudeLogger.error('[ClaudeLogManager] ログ保存エラー:', error);
            }
        },

        // ログをクリア
        clear() {
            if (this.logFileManager.clearCurrentLogs) {
                this.logFileManager.clearCurrentLogs();
            }
        }
    };

    // ========================================
    // Step 4-2-0: 初期化処理
    // ========================================

    // Step 4-2-0-1: 設定の取得（グローバル変数への直接アクセスを避ける）
    const getConfig = () => {
        return {
            AI_WAIT_CONFIG: window.AI_WAIT_CONFIG || {
                INITIAL_WAIT: 30000,
                MAX_WAIT: 1200000,  // 20分に延長（元: 5分）
                CHECK_INTERVAL: 2000,
                DEEP_RESEARCH_WAIT: 2400000,
                SHORT_WAIT: 1000,
                MEDIUM_WAIT: 2000,
                STOP_BUTTON_INITIAL_WAIT: 30000,
                STOP_BUTTON_DISAPPEAR_WAIT: 300000
            },
            UI_SELECTORS: window.UI_SELECTORS || {
                Claude: {
                    // テキスト入力欄
                    INPUT: [
                        '.ProseMirror[contenteditable="true"]',
                        'div[contenteditable="true"][role="textbox"]',
                        '[aria-label*="プロンプト"]',
                        'div[contenteditable="true"]',
                        'textarea[placeholder*="メッセージ"]'
                    ],

                    // 送信ボタン
                    SEND_BUTTON: [
                        'button[aria-label="メッセージを送信"]',
                        '[aria-label="メッセージを送信"]',
                        'button[type="submit"]',
                        '.send-button',
                        'button[aria-label*="送信"]',
                        'button:has(svg)',
                        'button[data-testid*="send"]'
                    ],

                    // 停止ボタン
                    STOP_BUTTON: [
                        'button[aria-label="応答を停止"]',
                        '[aria-label="応答を停止"]',
                        '[aria-label="Stop generating"]',
                        '[data-testid="stop-button"]',
                        'button[aria-label*="stop"]',
                        'button[aria-label*="Stop"]'
                    ],

                    // モデル選択
                    MODEL_BUTTON: [
                        '[data-testid="model-selector-dropdown"]',
                        'button[data-value*="claude"]',
                        'button.cursor-pointer:has(span.font-medium)',
                        'button[aria-label*="モデル"]',
                        'button[aria-label*="Model"]',
                        '[aria-label="モデルを選択"]',
                        'button[aria-haspopup="menu"]',
                        '[data-testid="model-selector"]'
                    ],

                    // 機能メニュー
                    FUNCTION_MENU_BUTTON: [
                        '[data-testid="input-menu-tools"]',
                        '#input-tools-menu-trigger',
                        '[aria-label="ツールメニューを開く"]',
                        '[data-testid="input-menu-trigger"]',
                        'button[aria-label*="機能"]'
                    ],

                    // 機能ボタン（別名）
                    FUNCTION_BUTTON: [
                        '[data-testid="input-menu-tools"]',
                        '#input-tools-menu-trigger',
                        '[aria-label="ツールメニューを開く"]',
                        '[data-testid="input-menu-trigger"]',
                        'button[aria-label*="機能"]'
                    ],

                    // メッセージ
                    MESSAGE: [
                        '.grid-cols-1.grid',
                        'div[class*="grid-cols-1"][class*="grid"]',
                        '.font-claude-message',
                        '[data-is-streaming="false"]',
                        'div[class*="font-claude-message"]',
                        '.group.relative.-tracking-\\[0\\.015em\\]'
                    ],

                    // 思考プロセス除外用
                    THINKING_PROCESS: {
                        TEXT_PATTERNS: [
                            '思考プロセス',
                            'Analyzed',
                            'Pondered',
                            'Thought',
                            'Considered',
                            'Evaluated',
                            'Reviewed'
                        ],
                        ELEMENTS: [
                            'button:has(.tabular-nums)',
                            'svg path[d*="M10.3857 2.50977"]',
                            '.tabular-nums'
                        ],
                        PARENT_CLASSES: [
                            'rounded-lg',
                            'border-0.5',
                            'transition-all',
                            'my-3'
                        ]
                    },

                    // DeepResearchボタン
                    DEEP_RESEARCH_BUTTON: [
                        'button:has-text("リサーチ")',
                        'button[aria-pressed]',
                        'button:contains("リサーチ")'
                    ],

                    // Deep Research関連
                    DEEP_RESEARCH: {
                        CANVAS_PREVIEW: [
                            'button[aria-label="内容をプレビュー"]',
                            'button[aria-label*="プレビュー"]',
                            'button[aria-label*="preview"]',
                            'button[aria-label="View content"]'
                        ]
                    },

                    // プレビューボタン
                    PREVIEW_BUTTON: [
                        'button[aria-label="内容をプレビュー"]'
                    ],

                    // 応答/レスポンス
                    RESPONSE: [
                        '.grid-cols-1.grid',
                        'div[class*="grid-cols-1"][class*="grid"]',
                        '.font-claude-message',
                        '[data-is-streaming="false"]',
                        'div[class*="font-claude-message"]',
                        '.group.relative.-tracking-\\[0\\.015em\\]'
                    ],

                    // メニュー関連
                    MENU: {
                        CONTAINER: '[role="menu"][data-state="open"], [role="menu"]',
                        ITEM: '[role="option"], [role="menuitem"]',
                        MODEL_ITEM: 'button[role="option"]:has(span)',
                        OTHER_MODELS: [
                            'div[role="menuitem"][aria-haspopup="menu"]',
                            '[role="menuitem"][aria-haspopup="menu"]',
                            'div[role="menuitem"]:has(div:contains("他のモデル"))',
                            'div[role="menuitem"]:has(div:contains("Other models"))',
                            '[aria-haspopup="menu"]:has(svg)'
                        ]
                    },

                    // メニューアイテム（拡張）
                    MENU_ITEM: [
                        '[role="option"]',
                        '[role="menuitem"]',
                        '[role="menuitemradio"]'
                    ],

                    // Canvas関連
                    CANVAS: {
                        CONTAINER: [
                            '.grid-cols-1.grid:has(h1)',
                            '.grid-cols-1.grid',
                            '[class*="grid-cols-1"][class*="grid"]',
                            'div:has(> h1.text-2xl)',
                            '.overflow-y-auto:has(h1)'
                        ],
                        PREVIEW_TEXT: [
                            '.absolute.inset-0'
                        ],
                        PREVIEW_BUTTON: [
                            'button[aria-label="内容をプレビュー"]',
                            'button[aria-label*="プレビュー"]',
                            'button[aria-label*="preview"]',
                            'button[aria-label="View content"]'
                        ],
                        TITLE: 'h1.text-2xl',
                        SECTION: 'h2.text-xl',
                        PARAGRAPH: 'p.whitespace-normal, p[class*="whitespace"]'
                    },

                    // モデル情報取得
                    MODEL_INFO: {
                        BUTTON: [
                            'button[data-testid="model-selector-dropdown"]',
                            'button[aria-haspopup="menu"]',
                            'button.cursor-pointer:has(span.font-medium)',
                            'button[aria-label*="モデル"]',
                            'button[aria-label*="Model"]'
                        ],
                        TEXT_ELEMENT: [
                            'button[data-testid="model-selector-dropdown"] .whitespace-nowrap.tracking-tight.select-none',
                            'button[data-testid="model-selector-dropdown"] span',
                            'button[data-testid="model-selector-dropdown"] div',
                            'button[aria-haspopup="menu"] .whitespace-nowrap',
                            'button[aria-haspopup="menu"] span.font-medium'
                        ]
                    }
                }
            }
        };
    };

    // Step 4-2-0-2: 設定の適用
    const config = getConfig();
    const AI_WAIT_CONFIG = config.AI_WAIT_CONFIG;
    const UI_SELECTORS = config.UI_SELECTORS;

    // Step 4-2-0-3: UI_SELECTORSの確認
    ClaudeLogger.info('🔧 【Step 4-2-0-1】UI_SELECTORS初期化確認:');
    ClaudeLogger.info('  UI_SELECTORS存在:', !!UI_SELECTORS);
    if (UI_SELECTORS && UI_SELECTORS.Claude) {
        ClaudeLogger.info('  UI_SELECTORS.Claude存在:', !!UI_SELECTORS.Claude);
        ClaudeLogger.info('  UI_SELECTORS.Claude.INPUT:', UI_SELECTORS.Claude.INPUT);
        ClaudeLogger.info('  UI_SELECTORS.Claude.SEND_BUTTON:', UI_SELECTORS.Claude.SEND_BUTTON);
        ClaudeLogger.info('  UI_SELECTORS.Claude.STOP_BUTTON:', UI_SELECTORS.Claude.STOP_BUTTON);
    } else {
        ClaudeLogger.warn('⚠️ 【Step 4-2-0-2】UI_SELECTORSが未定義です！デフォルト値を使用します。');
    }

    // ========================================
    // Step 4-2-0-3: 統一ClaudeRetryManager クラス定義
    // エラー分類とリトライ戦略を統合した統一システム
    // ========================================

    class ClaudeRetryManager {
        constructor() {
            // デフォルト設定
            this.defaultMaxRetries = 3;
            this.defaultRetryDelay = 2000;
            this.globalTimeout = 600000; // 10分

            // Canvas無限更新専用設定
            this.canvasMaxRetries = 10;
            this.canvasRetryDelays = [
                5000,    // 5秒
                10000,   // 10秒
                60000,   // 1分
                300000,  // 5分
                600000,  // 10分
                900000,  // 15分
                1800000, // 30分
                3600000, // 1時間
                7200000  // 2時間
            ];

            // エラー種別別の設定
            this.errorStrategies = {
                NETWORK_ERROR: { maxRetries: 5, baseDelay: 2000, backoffMultiplier: 1.5 },
                DOM_ERROR: { maxRetries: 3, baseDelay: 1000, backoffMultiplier: 1.2 },
                UI_TIMING_ERROR: { maxRetries: 10, baseDelay: 500, backoffMultiplier: 1.1 },
                CANVAS_VERSION_UPDATE: { maxRetries: 10, customDelays: this.canvasRetryDelays },
                USER_INPUT_ERROR: { maxRetries: 1, baseDelay: 0, backoffMultiplier: 1 },
                GENERAL_ERROR: { maxRetries: 3, baseDelay: 2000, backoffMultiplier: 1.5 }
            };

            // 実行時統計
            this.metrics = {
                totalAttempts: 0,
                successfulAttempts: 0,
                errorCounts: {},
                averageRetryCount: 0
            };

            // エラー履歴管理（段階的エスカレーション用）
            this.errorHistory = [];
            this.taskContext = null;
            this.lastResults = [];
            this.maxHistorySize = 50; // 履歴の最大サイズ

            // リソース管理
            this.activeTimeouts = new Set();
            this.abortController = null;
        }

        // Step 4-2-0-3: 統一されたエラー分類器（詳細ログ付き）
        classifyError(error, context = {}) {
            const errorMessage = error?.message || error?.toString() || '';
            const errorName = error?.name || '';

            ClaudeLogger.info(`🔍 [Step 4-2-0-3] エラー分類開始:`, {
                errorMessage,
                errorName,
                context,
                timestamp: new Date().toISOString(),
                url: window.location.href,
                userAgent: navigator.userAgent
            });

            let errorType = 'GENERAL_ERROR';

            // Canvas無限更新エラー
            if (context.isCanvasVersionUpdate ||
                errorMessage.includes('Canvas無限更新') ||
                context.errorType === 'CANVAS_VERSION_UPDATE') {
                errorType = 'CANVAS_VERSION_UPDATE';
                ClaudeLogger.info(`🎨 [Step 4-2-0-3] Canvas更新エラー検出:`, {
                    errorType,
                    errorMessage,
                    maxRetries: this.errorStrategies[errorType]?.maxRetries,
                    reason: 'Canvas V2無限更新による特別処理が必要'
                });
                return errorType;
            }

            // ネットワークエラー
            if (errorMessage.includes('timeout') ||
                errorMessage.includes('network') ||
                errorMessage.includes('fetch') ||
                errorName.includes('NetworkError')) {
                errorType = 'NETWORK_ERROR';
                ClaudeLogger.info(`🌐 [Step 4-2-0-3] ネットワークエラー検出:`, {
                    errorType,
                    errorMessage,
                    maxRetries: this.errorStrategies[errorType]?.maxRetries,
                    baseDelay: this.errorStrategies[errorType]?.baseDelay,
                    reason: 'ネットワーク接続問題により段階的リトライ適用'
                });
                return errorType;
            }

            // DOM要素エラー
            if (errorMessage.includes('要素が見つかりません') ||
                errorMessage.includes('element not found') ||
                errorMessage.includes('selector') ||
                errorMessage.includes('querySelector')) {
                errorType = 'DOM_ERROR';
                ClaudeLogger.info(`🔍 [Step 4-2-0-3] DOM要素エラー検出:`, {
                    errorType,
                    errorMessage,
                    maxRetries: this.errorStrategies[errorType]?.maxRetries,
                    baseDelay: this.errorStrategies[errorType]?.baseDelay,
                    reason: 'DOM要素の検出失敗により軽量リトライ適用',
                    context: context
                });
                return errorType;
            }

            // UIタイミングエラー
            if (errorMessage.includes('click') ||
                errorMessage.includes('input') ||
                errorMessage.includes('button') ||
                errorMessage.includes('まで待機')) {
                errorType = 'UI_TIMING_ERROR';
                ClaudeLogger.info(`⏱️ [Step 4-2-0-3] UIタイミングエラー検出:`, {
                    errorType,
                    errorMessage,
                    maxRetries: this.errorStrategies[errorType]?.maxRetries,
                    baseDelay: this.errorStrategies[errorType]?.baseDelay,
                    reason: 'UI操作タイミング問題により高頻度リトライ適用'
                });
                return errorType;
            }

            // ユーザー入力エラー
            if (errorMessage.includes('設定なし') ||
                errorMessage.includes('Invalid') ||
                context.isUserInputError) {
                errorType = 'USER_INPUT_ERROR';
                ClaudeLogger.info(`👤 [Step 4-2-0-3] ユーザー入力エラー検出:`, {
                    errorType,
                    errorMessage,
                    maxRetries: this.errorStrategies[errorType]?.maxRetries,
                    reason: 'ユーザー入力に問題があるためリトライ無効'
                });
                return errorType;
            }

            // デフォルト（汎用エラー）
            errorType = 'GENERAL_ERROR';
            ClaudeLogger.info(`❓ [Step 4-2-0-3] 一般エラーとして分類:`, {
                errorType,
                errorMessage,
                maxRetries: this.errorStrategies[errorType]?.maxRetries,
                baseDelay: this.errorStrategies[errorType]?.baseDelay,
                reason: '特定パターンに該当しないため一般エラーとして分類'
            });

            return errorType;
        }

        // エラー履歴記録
        recordError(error, retryCount, result = null, context = {}) {
            const errorRecord = {
                timestamp: Date.now(),
                errorType: this.classifyError(error, context),
                retryCount,
                message: error?.message || error?.toString() || 'Unknown error',
                result: result,
                context: context
            };

            this.errorHistory.push(errorRecord);

            // 履歴サイズ制限
            if (this.errorHistory.length > this.maxHistorySize) {
                this.errorHistory.shift();
            }

            return errorRecord;
        }

        // 結果履歴記録
        recordResult(result, retryCount, context = {}) {
            const resultRecord = {
                timestamp: Date.now(),
                retryCount,
                success: result && result.success !== false,
                result: result,
                context: context
            };

            this.lastResults.push(resultRecord);

            // 結果履歴サイズ制限
            if (this.lastResults.length > 10) {
                this.lastResults.shift();
            }

            return resultRecord;
        }

        // Canvas無限更新検出
        isCanvasInfiniteUpdate() {
            try {
                const versionElement = document.querySelector('[data-testid="artifact-version-trigger"]');
                if (versionElement) {
                    const versionText = versionElement.textContent || versionElement.innerText || '';
                    const hasHighVersion = /v([2-9]|\d{2,})/.test(versionText);
                    if (hasHighVersion) {
                        ClaudeLogger.info(`🎨 Canvas無限更新検出: ${versionText}`);
                        return true;
                    }
                }
                return false;
            } catch (error) {
                ClaudeLogger.warn('Canvas版本チェックエラー:', error.message);
                return false;
            }
        }

        // 連続同一エラー検出
        detectConsecutiveErrors(threshold = 5) {
            if (this.errorHistory.length < threshold) return false;

            const recentErrors = this.errorHistory.slice(-threshold);
            const firstErrorType = recentErrors[0].errorType;

            const isConsecutive = recentErrors.every(error => error.errorType === firstErrorType);

            if (isConsecutive) {
                ClaudeLogger.info(`🔍 連続同一エラー検出: ${firstErrorType} (${threshold}回)`);
            }

            return isConsecutive;
        }

        // リトライレベル判定
        determineRetryLevel(retryCount, context = {}) {
            // Canvas無限更新は即座に最終手段
            if (this.isCanvasInfiniteUpdate() || context.isCanvasVersionUpdate) {
                ClaudeLogger.info('📋 リトライレベル: HEAVY_RESET (Canvas無限更新)');
                return 'HEAVY_RESET';
            }

            // 連続同一エラーが5回以上 = 構造的問題
            if (this.detectConsecutiveErrors(5)) {
                ClaudeLogger.info('📋 リトライレベル: HEAVY_RESET (構造的問題)');
                return 'HEAVY_RESET';
            }

            // リトライ回数による段階判定
            if (retryCount <= 5) {
                ClaudeLogger.info(`📋 リトライレベル: LIGHTWEIGHT (${retryCount}/5)`);
                return 'LIGHTWEIGHT';
            } else if (retryCount <= 8) {
                ClaudeLogger.info(`📋 リトライレベル: MODERATE (${retryCount}/8)`);
                return 'MODERATE';
            } else {
                ClaudeLogger.info(`📋 リトライレベル: HEAVY_RESET (${retryCount}/10)`);
                return 'HEAVY_RESET';
            }
        }

        // メイン実行メソッド（統一インターフェース）
        async executeWithRetry(config) {
            // 引数の互換性チェック
            if (typeof config === 'object' && config.taskId && config.prompt && !config.action) {
                // Canvas無限更新の古い形式
                return await this.executeCanvasRetry(config);
            }

            // 新しい統一形式での処理
            const {
                action,
                errorClassifier = this.classifyError.bind(this),
                successValidator = (result) => result && result.success !== false,
                maxRetries = this.defaultMaxRetries,
                retryDelay = this.defaultRetryDelay,
                actionName = '処理',
                context = {},
                timeoutMs = this.globalTimeout
            } = config;

            if (!action) {
                throw new Error('action関数が必要です');
            }

            this.abortController = new AbortController();
            const startTime = Date.now();
            let retryCount = 0;
            let lastResult = null;
            let lastError = null;
            let errorType = 'GENERAL_ERROR';

            try {
                while (retryCount < maxRetries) {
                    // グローバルタイムアウトチェック
                    if (Date.now() - startTime > timeoutMs) {
                        throw new Error(`グローバルタイムアウト: ${timeoutMs}ms`);
                    }

                    try {
                        this.metrics.totalAttempts++;

                        if (retryCount > 0) {
                            ClaudeLogger.info(`🔄 【${actionName}】リトライ ${retryCount}/${maxRetries} (エラー種別: ${errorType})`);
                        }

                        // アクション実行
                        lastResult = await Promise.race([
                            action(),
                            this.createTimeoutPromise(timeoutMs - (Date.now() - startTime))
                        ]);

                        // 成功判定
                        if (successValidator(lastResult)) {
                            this.metrics.successfulAttempts++;
                            if (retryCount > 0) {
                                ClaudeLogger.info(`✅ 【${actionName}】${retryCount}回目のリトライで成功`);
                            }
                            return {
                                success: true,
                                result: lastResult,
                                retryCount,
                                errorType: retryCount > 0 ? errorType : null,
                                executionTime: Date.now() - startTime
                            };
                        }

                        // 成功判定失敗の場合は次のリトライへ
                        lastError = new Error('成功判定に失敗しました');
                        errorType = errorClassifier(lastError, { ...context, result: lastResult });

                    } catch (error) {
                        lastError = error;
                        errorType = errorClassifier(error, context);

                        // エラー履歴記録
                        this.recordError(error, retryCount, lastResult, context);

                        // エラー統計更新
                        this.metrics.errorCounts[errorType] = (this.metrics.errorCounts[errorType] || 0) + 1;

                        ClaudeLogger.error(`❌ 【${actionName}】エラー発生 (種別: ${errorType}):`, error.message);
                    }

                    retryCount++;

                    // 最大リトライ回数チェック
                    if (retryCount >= maxRetries) {
                        break;
                    }

                    // 段階的エスカレーション: リトライレベル判定
                    const retryLevel = this.determineRetryLevel(retryCount, context);

                    // タスクデータの準備（新規ウィンドウリトライ用）
                    const taskData = context.taskData || config.taskData || {
                        taskId: context.taskId || `retry_${Date.now()}`,
                        prompt: context.prompt || 'リトライタスク',
                        enableDeepResearch: context.enableDeepResearch || false,
                        specialMode: context.specialMode || null
                    };

                    // リトライレベルに応じた実行戦略
                    try {
                        ClaudeLogger.info(`🔄 【${actionName}】段階的エスカレーション: ${retryLevel}`);

                        if (retryLevel === 'HEAVY_RESET') {
                            // 新規ウィンドウ作成リトライ
                            const heavyRetryResult = await this.executeRetryByLevel(
                                retryLevel,
                                action,
                                taskData,
                                retryCount,
                                { ...context, errorType }
                            );

                            if (heavyRetryResult && heavyRetryResult.success) {
                                ClaudeLogger.info(`✅ 【${actionName}】新規ウィンドウリトライで復旧成功`);
                                this.metrics.successfulAttempts++;
                                return {
                                    success: true,
                                    result: heavyRetryResult,
                                    retryCount,
                                    errorType,
                                    retryLevel,
                                    executionTime: Date.now() - startTime
                                };
                            }
                        } else {
                            // 軽量・中程度リトライ（従来の待機戦略）
                            await this.waitWithStrategy(errorType, retryCount, context);
                        }
                    } catch (retryError) {
                        ClaudeLogger.error(`❌ 【${actionName}】${retryLevel}リトライでエラー:`, retryError.message);
                        // リトライエラーも記録
                        this.recordError(retryError, retryCount, null, { ...context, retryLevel });
                    }
                }

                // 全リトライ失敗
                ClaudeLogger.error(`❌ 【${actionName}】${maxRetries}回のリトライ後も失敗`);
                return {
                    success: false,
                    error: lastError?.message || 'Unknown error',
                    errorType,
                    retryCount,
                    result: lastResult,
                    executionTime: Date.now() - startTime,
                    finalError: true
                };

            } finally {
                this.cleanup();
            }
        }

        // Canvas無限更新専用処理（後方互換性）
        async executeCanvasRetry(taskData) {
            ClaudeLogger.info(`🔄 Canvas無限更新リトライ処理開始 - 最大${this.canvasMaxRetries}回まで実行`);

            const retryConfig = {
                action: async () => {
                    // Canvas専用のリトライロジック
                    return await this.performCanvasRetry(taskData);
                },
                errorClassifier: () => 'CANVAS_VERSION_UPDATE',
                successValidator: (result) => result && result.success,
                maxRetries: this.canvasMaxRetries,
                actionName: 'Canvas無限更新対応',
                context: { isCanvasVersionUpdate: true, taskData }
            };

            return await this.executeWithRetry(retryConfig);
        }

        // Canvas専用リトライアクション
        async performCanvasRetry(taskData) {
            return new Promise((resolve) => {
                chrome.runtime.sendMessage({
                    type: 'RETRY_WITH_NEW_WINDOW',
                    taskId: taskData.taskId || `retry_${Date.now()}`,
                    prompt: taskData.prompt,
                    aiType: 'Claude',
                    enableDeepResearch: taskData.enableDeepResearch || false,
                    specialMode: taskData.specialMode || null,
                    error: 'CANVAS_VERSION_UPDATE',
                    errorMessage: 'Canvas無限更新によるリトライ',
                    retryReason: 'canvas_infinite_update_prevention',
                    closeCurrentWindow: true
                }, (response) => {
                    if (response && response.success) {
                        resolve(response);
                    } else {
                        resolve({ success: false });
                    }
                });
            });
        }

        // レベル1: 軽量リトライ（同一ウィンドウ内での再試行）
        async performLightweightRetry(action, retryCount, context = {}) {
            ClaudeLogger.info(`🔧 軽量リトライ実行 (${retryCount}回目)`);

            // 軽量リトライの待機時間（1秒 → 2秒 → 5秒 → 10秒 → 15秒）
            const lightDelays = [1000, 2000, 5000, 10000, 15000];
            const delayIndex = Math.min(retryCount - 1, lightDelays.length - 1);
            const delay = lightDelays[delayIndex];

            ClaudeLogger.info(`⏳ ${delay/1000}秒後に軽量リトライします...`);
            await this.wait(delay);

            // DOM要素の再検索やUI操作の再実行
            return await action();
        }

        // レベル2: 中程度リトライ（ページリフレッシュ）
        async performModerateRetry(action, retryCount, context = {}) {
            ClaudeLogger.info(`🔄 中程度リトライ実行 (${retryCount}回目) - ページリフレッシュ`);

            // 中程度リトライの待機時間（30秒 → 1分 → 2分）
            const moderateDelays = [30000, 60000, 120000];
            const delayIndex = Math.min(retryCount - 6, moderateDelays.length - 1);
            const delay = moderateDelays[delayIndex];

            ClaudeLogger.info(`⏳ ${delay/1000}秒後にページリフレッシュリトライします...`);
            await this.wait(delay);

            try {
                // ページリフレッシュ実行
                ClaudeLogger.info('🔄 ページリフレッシュを実行...');
                location.reload();

                // リフレッシュ後の待機
                await this.wait(5000);

                // アクション再実行
                return await action();
            } catch (error) {
                ClaudeLogger.error('ページリフレッシュエラー:', error.message);
                return { success: false, error: error.message };
            }
        }

        // レベル3: 重いリトライ（新規ウィンドウ作成）
        async performHeavyRetry(taskData, retryCount, context = {}) {
            ClaudeLogger.info(`🚨 重いリトライ実行 (${retryCount}回目) - 新規ウィンドウ作成`);

            // 重いリトライの待機時間（5分 → 15分 → 30分 → 1時間 → 2時間）
            const heavyDelays = [
                300000,  // 5分
                900000,  // 15分
                1800000, // 30分
                3600000, // 1時間
                7200000  // 2時間
            ];
            const delayIndex = Math.min(retryCount - 9, heavyDelays.length - 1);
            const delay = heavyDelays[delayIndex];

            ClaudeLogger.info(`⏳ ${delay/60000}分後に新規ウィンドウリトライします...`);
            await this.waitWithCountdown(delay);

            // 新規ウィンドウ作成（performCanvasRetryを汎用化）
            return await this.performNewWindowRetry(taskData, context);
        }

        // 汎用新規ウィンドウリトライ（Canvas専用から汎用化）
        async performNewWindowRetry(taskData, context = {}) {
            const errorType = context.errorType || 'GENERAL_ERROR';
            const errorMessage = context.errorMessage || 'エラー復旧によるリトライ';
            const retryReason = context.retryReason || 'error_recovery_retry';

            return new Promise((resolve) => {
                chrome.runtime.sendMessage({
                    type: 'RETRY_WITH_NEW_WINDOW',
                    taskId: taskData.taskId || `retry_${Date.now()}`,
                    prompt: taskData.prompt,
                    aiType: 'Claude',
                    enableDeepResearch: taskData.enableDeepResearch || false,
                    specialMode: taskData.specialMode || null,
                    error: errorType,
                    errorMessage: errorMessage,
                    retryReason: retryReason,
                    closeCurrentWindow: true
                }, (response) => {
                    if (response && response.success) {
                        ClaudeLogger.info('✅ 新規ウィンドウリトライ成功');
                        resolve(response);
                    } else {
                        ClaudeLogger.info('❌ 新規ウィンドウリトライ失敗');
                        resolve({ success: false });
                    }
                });
            });
        }

        // リトライレベルに応じた実行戦略
        async executeRetryByLevel(retryLevel, action, taskData, retryCount, context = {}) {
            switch (retryLevel) {
                case 'LIGHTWEIGHT':
                    return await this.performLightweightRetry(action, retryCount, context);

                case 'MODERATE':
                    return await this.performModerateRetry(action, retryCount, context);

                case 'HEAVY_RESET':
                    // 新規ウィンドウ作成の場合はtaskDataが必要
                    if (taskData) {
                        return await this.performHeavyRetry(taskData, retryCount, context);
                    } else {
                        // taskDataがない場合は軽量リトライにフォールバック
                        ClaudeLogger.warn('⚠️ 新規ウィンドウリトライにはtaskDataが必要です。軽量リトライにフォールバック。');
                        return await this.performLightweightRetry(action, retryCount, context);
                    }

                default:
                    return await this.performLightweightRetry(action, retryCount, context);
            }
        }

        // エラー種別に応じた待機戦略
        async waitWithStrategy(errorType, retryCount, context = {}) {
            const strategy = this.errorStrategies[errorType] || this.errorStrategies.GENERAL_ERROR;

            let delay;

            if (strategy.customDelays) {
                // Canvas用のカスタム遅延
                const delayIndex = Math.min(retryCount - 1, strategy.customDelays.length - 1);
                delay = strategy.customDelays[delayIndex];

                // 長時間待機の場合はカウントダウン表示
                if (delay >= 60000) {
                    await this.waitWithCountdown(delay);
                    return;
                }
            } else {
                // 指数バックオフ
                delay = strategy.baseDelay * Math.pow(strategy.backoffMultiplier, retryCount - 1);
            }

            ClaudeLogger.info(`⏳ ${delay/1000}秒後にリトライします... (${errorType})`);
            await this.wait(delay);
        }

        // カウントダウン付き待機
        async waitWithCountdown(totalDelay) {
            const delayMinutes = Math.round(totalDelay / 60000 * 10) / 10;
            ClaudeLogger.info(`⏳ ${delayMinutes}分後にリトライします...`);

            if (totalDelay >= 60000) {
                const intervals = Math.min(10, totalDelay / 10000);
                const intervalTime = totalDelay / intervals;

                for (let i = 0; i < intervals; i++) {
                    const remaining = totalDelay - (intervalTime * i);
                    const remainingMinutes = Math.round(remaining / 60000 * 10) / 10;
                    ClaudeLogger.info(`⏱️ 残り ${remainingMinutes}分...`);
                    await this.wait(intervalTime);
                }
            } else {
                await this.wait(totalDelay);
            }
        }

        // 基本待機関数
        wait(ms) {
            return new Promise(resolve => {
                const timeoutId = setTimeout(resolve, ms);
                this.activeTimeouts.add(timeoutId);

                // クリーンアップ用にPromiseを拡張
                const promise = new Promise(res => setTimeout(res, ms));
                promise.finally(() => this.activeTimeouts.delete(timeoutId));
                return promise;
            });
        }

        // タイムアウトPromise作成
        createTimeoutPromise(ms) {
            return new Promise((_, reject) => {
                const timeoutId = setTimeout(() => {
                    reject(new Error(`処理タイムアウト: ${ms}ms`));
                }, ms);
                this.activeTimeouts.add(timeoutId);
            });
        }

        // リソースクリーンアップ
        cleanup() {
            // アクティブなタイムアウトをクリア
            this.activeTimeouts.forEach(timeoutId => clearTimeout(timeoutId));
            this.activeTimeouts.clear();

            // AbortControllerのクリーンアップ
            if (this.abortController) {
                this.abortController.abort();
                this.abortController = null;
            }
        }

        // 統計情報取得
        getMetrics() {
            const totalAttempts = this.metrics.totalAttempts;
            const successRate = totalAttempts > 0 ?
                (this.metrics.successfulAttempts / totalAttempts * 100).toFixed(2) : 0;

            // エラー履歴の分析
            const recentErrors = this.errorHistory.slice(-10); // 直近10件
            const errorTrends = this.analyzeErrorTrends();

            return {
                ...this.metrics,
                successRate: `${successRate}%`,
                errorDistribution: this.metrics.errorCounts,
                errorHistory: {
                    totalErrors: this.errorHistory.length,
                    recentErrors: recentErrors,
                    trends: errorTrends
                },
                retryLevels: this.getRetryLevelStats()
            };
        }

        // エラー傾向分析
        analyzeErrorTrends() {
            if (this.errorHistory.length === 0) return { message: 'エラー履歴なし' };

            const last5Errors = this.errorHistory.slice(-5);
            const errorTypes = last5Errors.map(e => e.errorType);
            const uniqueTypes = [...new Set(errorTypes)];

            return {
                recentErrorTypes: uniqueTypes,
                hasConsecutiveErrors: this.detectConsecutiveErrors(3),
                canvasIssueDetected: this.isCanvasInfiniteUpdate(),
                lastErrorTime: this.errorHistory[this.errorHistory.length - 1]?.timestamp
            };
        }

        // リトライレベル統計
        getRetryLevelStats() {
            const levels = { LIGHTWEIGHT: 0, MODERATE: 0, HEAVY_RESET: 0 };

            this.errorHistory.forEach(error => {
                const level = this.determineRetryLevel(error.retryCount, error.context);
                if (levels.hasOwnProperty(level)) {
                    levels[level]++;
                }
            });

            return levels;
        }

        // 統計リセット
        resetMetrics() {
            this.metrics = {
                totalAttempts: 0,
                successfulAttempts: 0,
                errorCounts: {},
                averageRetryCount: 0
            };

            // エラー履歴もリセット
            this.errorHistory = [];
            this.lastResults = [];
            this.taskContext = null;
        }
    }

    // ========================================
    // Step 4-2-0-4: セレクタ定義
    // ========================================

    // Step 4-2-0-4-1: Deep Research用セレクタ
    const getDeepResearchSelectors = () => ({
        '3_回答停止ボタン': {
            selectors: UI_SELECTORS.Claude?.STOP_BUTTON || [],
            description: '回答停止ボタン'
        },
        '4_Canvas機能テキスト位置': {
            selectors: [
                // 【最優先】最終Canvas結果のみを正確に取得
                '.grid-cols-1.grid[class*="!gap-3.5"]',

                // 【重要】従来のセレクタの優先順位について
                // 1. 最優先: 親要素（div.grid-cols-1.grid）を取得 - 全体のテキスト構造を含む
                //    - <p>タグのテキストと<code>タグ内のテキストを両方取得可能
                // 2. 中優先: Canvas固有のID/クラスセレクタ
                // 3. 低優先: .code-block__codeクラス（<code>タグのみ）- 部分的な取得になる
                // この順序により、HTMLの全体構造を正しく取得できる

                // フォールバック: Canvas全体構造を取得（思考プロセスを除外）
                'div.grid-cols-1.grid.gap-2\\.5:has(p.whitespace-pre-wrap)',
                'div.grid-cols-1.grid:not(:has(.ease-out.rounded-lg))',
                // 除外条件付きセレクタ（作業説明文と思考プロセスを除外）
                'div.grid-cols-1.grid.gap-2\\.5:not([class*="p-3"]):not([class*="pt-0"]):not([class*="pr-8"])',
                'div[class*="grid-cols-1"][class*="gap-2.5"]:not([class*="p-3"]):not([class*="pt-0"])',
                // 通常回答除外セレクタ
                '.grid-cols-1.grid:not(.standard-markdown):not([class*="p-3"]):not([class*="pt-0"])',
                // Canvas固有セレクタ
                '#markdown-artifact',
                '[id="markdown-artifact"]',
                '.font-claude-response#markdown-artifact',
                '[tabindex="0"]#markdown-artifact',
                'div.mx-auto.max-w-3xl#markdown-artifact',
                // コードブロックのみ（フォールバック）- 部分的な取得になるため優先度を下げた
                '.code-block__code',
                'div.code-block__code',
                '.code-block__code.h-fit.min-h-full.w-fit.min-w-full',
                // 最後のフォールバック（汎用セレクタ）
                '[class*="grid"][class*="gap"]:not([class*="standard-markdown"]):not([class*="p-3"])'
            ],
            description: 'Canvas機能のテキスト表示エリア'
        },
        '4_3_Canvas続けるボタン': {
            selectors: [
                'button[aria-label="続ける"]',
                'button[type="button"]',
                'button.inline-flex'
            ],
            description: 'Canvas機能の続けるボタン'
        },
        '4_4_Canvasプレビューボタン': {
            selectors: [
                'div[aria-label="内容をプレビュー"][role="button"]',
                '[aria-label="内容をプレビュー"]',
                'div[role="button"][tabindex="0"]:has(div.artifact-block-cell)',
                'div.artifact-block-cell',
                '.flex.text-left.font-ui.rounded-lg[role="button"]',
                'div[role="button"]'
            ],
            description: 'Canvas機能のプレビューボタン'
        },
        '4_2_Canvas開くボタン': {
            selectors: UI_SELECTORS.Claude?.DEEP_RESEARCH?.CANVAS_PREVIEW || UI_SELECTORS.Claude?.PREVIEW_BUTTON || [],
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
    });

    // Step 4-2-0-4-2: モデル選択用セレクタ
    const modelSelectors = {
        menuButton: (UI_SELECTORS.Claude?.MODEL_BUTTON || []).map(selector => ({ selector, description: 'モデル選択ボタン' })),
        menuContainer: [
            { selector: UI_SELECTORS.Claude?.MENU?.CONTAINER || '[role="menu"][data-state="open"]', description: 'メニューコンテナ' }
        ],
        // その他のモデルメニュー用セレクタ - デフォルト値を設定
        otherModelsMenu: (UI_SELECTORS.Claude?.MENU?.OTHER_MODELS && UI_SELECTORS.Claude.MENU.OTHER_MODELS.length > 0)
            ? UI_SELECTORS.Claude.MENU.OTHER_MODELS.map(selector => ({ selector, description: 'その他のモデルメニュー' }))
            : [
                // デフォルトセレクタ - 最新Claude UIに対応
                { selector: 'div[role="menuitem"][aria-haspopup="menu"][data-state="closed"]', description: '最新Claude UIセレクタ（data-state付き）' },
                { selector: 'div[role="menuitem"][aria-haspopup="menu"]:has(*:contains("他のモデル"))', description: '他のモデル日本語（子要素検索）' },
                { selector: 'div[role="menuitem"][aria-haspopup="menu"]:has(*:contains("Other models"))', description: '他のモデル英語（子要素検索）' },
                { selector: 'div[role="menuitem"][aria-haspopup="menu"]', description: '汎用他のモデル' },
                { selector: '[role="menuitem"][aria-haspopup="menu"]', description: '最も汎用的なセレクタ' }
            ],
        modelDisplay: (UI_SELECTORS.Claude?.MODEL_INFO?.TEXT_ELEMENT || []).slice(0, 3).map(selector => ({ selector, description: 'モデル表示要素' }))
    };

    // Step 4-2-0-4-3: 機能選択用セレクタ
    const featureSelectors = {
        menuButton: UI_SELECTORS.Claude?.FUNCTION_MENU_BUTTON || [],
        menuContainer: UI_SELECTORS.Claude?.FEATURE_MENU?.CONTAINER || [],
        webSearchToggle: UI_SELECTORS.Claude?.FEATURE_MENU?.WEB_SEARCH_TOGGLE || [],
        researchButton: UI_SELECTORS.Claude?.FEATURE_BUTTONS?.RESEARCH || []
    };

    // Step 4-2-0-4-4: デフォルトセレクタ（フォールバック用）
    const DEFAULT_SELECTORS = {
        INPUT: [
            '.ProseMirror',
            'div.ProseMirror[contenteditable="true"]',
            '[data-placeholder*="Message Claude"]',
            'div[contenteditable="true"][role="textbox"]'
        ],
        SEND_BUTTON: [
            'button[aria-label="Send Message"]',
            'button[type="submit"][aria-label*="Send"]',
            'button svg path[d*="M320 448"]'
        ],
        STOP_BUTTON: [
            'button[aria-label="応答を停止"]',
            '[aria-label="応答を停止"]',
            'button svg path[d*="M128,20A108"]'
        ]
    };

    // Step 4-2-0-4-5: Claude動作用セレクタ
    const claudeSelectors = {
        '1_テキスト入力欄': {
            selectors: (UI_SELECTORS.Claude?.INPUT && UI_SELECTORS.Claude.INPUT.length > 0)
                ? UI_SELECTORS.Claude.INPUT
                : DEFAULT_SELECTORS.INPUT,
            description: 'テキスト入力欄（ProseMirrorエディタ）'
        },
        '2_送信ボタン': {
            selectors: (UI_SELECTORS.Claude?.SEND_BUTTON && UI_SELECTORS.Claude.SEND_BUTTON.length > 0)
                ? UI_SELECTORS.Claude.SEND_BUTTON
                : DEFAULT_SELECTORS.SEND_BUTTON,
            description: '送信ボタン'
        },
        '3_回答停止ボタン': {
            selectors: (UI_SELECTORS.Claude?.STOP_BUTTON && UI_SELECTORS.Claude.STOP_BUTTON.length > 0)
                ? UI_SELECTORS.Claude.STOP_BUTTON
                : DEFAULT_SELECTORS.STOP_BUTTON,
            description: '回答停止ボタン'
        },
        '4_Canvas機能テキスト位置': {
            selectors: [
                // 【最優先】最終Canvas結果のみを正確に取得
                '.grid-cols-1.grid[class*="!gap-3.5"]',

                // 【重要】従来のセレクタの優先順位について
                // 1. 最優先: 親要素（div.grid-cols-1.grid）を取得 - 全体のテキスト構造を含む
                //    - <p>タグのテキストと<code>タグ内のテキストを両方取得可能
                // 2. 中優先: Canvas固有のID/クラスセレクタ
                // 3. 低優先: .code-block__codeクラス（<code>タグのみ）- 部分的な取得になる
                // この順序により、HTMLの全体構造を正しく取得できる

                // フォールバック: Canvas全体構造を取得（思考プロセスを除外）
                'div.grid-cols-1.grid.gap-2\\.5:has(p.whitespace-pre-wrap)',
                'div.grid-cols-1.grid:not(:has(.ease-out.rounded-lg))',
                // 除外条件付きセレクタ（作業説明文と思考プロセスを除外）
                'div.grid-cols-1.grid.gap-2\\.5:not([class*="p-3"]):not([class*="pt-0"]):not([class*="pr-8"])',
                'div[class*="grid-cols-1"][class*="gap-2.5"]:not([class*="p-3"]):not([class*="pt-0"])',
                // 通常回答除外セレクタ
                '.grid-cols-1.grid:not(.standard-markdown):not([class*="p-3"]):not([class*="pt-0"])',
                // Canvas固有セレクタ
                '#markdown-artifact',
                '[id="markdown-artifact"]',
                '.font-claude-response#markdown-artifact',
                '[tabindex="0"]#markdown-artifact',
                'div.mx-auto.max-w-3xl#markdown-artifact',
                // コードブロックのみ（フォールバック）- 部分的な取得になるため優先度を下げた
                '.code-block__code',
                'div.code-block__code',
                '.code-block__code.h-fit.min-h-full.w-fit.min-w-full',
                // 最後のフォールバック（汎用セレクタ）
                '[class*="grid"][class*="gap"]:not([class*="standard-markdown"]):not([class*="p-3"])'
            ],
            description: 'Canvas機能のテキスト表示エリア'
        },
        '4_3_Canvas続けるボタン': {
            selectors: [
                'button[aria-label="続ける"]',
                'button[type="button"]',
                'button.inline-flex'
            ],
            description: 'Canvas機能の続けるボタン'
        },
        '4_4_Canvasプレビューボタン': {
            selectors: [
                'div[aria-label="内容をプレビュー"][role="button"]',
                '[aria-label="内容をプレビュー"]',
                'div[role="button"][tabindex="0"]:has(div.artifact-block-cell)',
                'div.artifact-block-cell',
                '.flex.text-left.font-ui.rounded-lg[role="button"]',
                'div[role="button"]'
            ],
            description: 'Canvas機能のプレビューボタン'
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

    // Step 4-2-0-5: セレクタの最終状態をログ出力
    ClaudeLogger.info('📋 【Step 4-2-0-3】claudeSelectors最終設定:');
    ClaudeLogger.info('  入力欄セレクタ数:', claudeSelectors['1_テキスト入力欄'].selectors.length);
    ClaudeLogger.info('  送信ボタンセレクタ数:', claudeSelectors['2_送信ボタン'].selectors.length);
    ClaudeLogger.info('  停止ボタンセレクタ数:', claudeSelectors['3_回答停止ボタン'].selectors.length);

    if (claudeSelectors['1_テキスト入力欄'].selectors.length === 0) {
        ClaudeLogger.error('❌ 【Step 4-2-0-4】致命的エラー: 入力欄セレクタが空です！');
    }

    // ========================================
    // Step 4-2-1: ヘルパー関数定義
    // ========================================

    // Step 4-2-1-1: 基本ユーティリティ関数
    /**
     * 基本待機関数
     * 【動作説明】指定されたミリ秒数だけ処理を停止し、タイミング制御を行う
     * 【用途】要素の読み込み待機、アニメーション完了待機、API制限回避など
     * 【引数】ms: 待機時間（ミリ秒）
     * 【戻り値】Promise<void> - 指定時間経過後に解決される
     */
    const wait = async (ms) => {
        return new Promise(resolve => setTimeout(resolve, ms));
    };

    /**
     * 要素出現待機関数
     * 【動作説明】指定セレクタの要素が表示されるまで繰り返し検索し、可視性もチェックする
     * 【用途】動的に生成される要素の待機、ページ読み込み完了の確認
     * 【引数】selector: CSSセレクタ, maxRetries: 最大試行回数, retryDelay: 試行間隔（ms）
     * 【戻り値】Promise<Element|null> - 発見された要素またはnull
     * 【チェック項目】要素の存在、サイズ、display、visibility、opacity
     */
    const waitForElement = async (selector, maxRetries = 10, retryDelay = 500) => {
        const log = (msg) => ClaudeLogger.info(`⏳ [待機] ${msg}`);

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

        const retryManager = new ClaudeRetryManager();
        const result = await retryManager.executeWithRetry({
            action: async () => {
                // findClaudeElementに適切なオブジェクト形式で渡す
                const selectorInfo = {
                    selectors: [selector],
                    description: `セレクタ: ${selector}`
                };
                const element = await findClaudeElement(selectorInfo);
                if (element) return { success: true, element };
                return { success: false, error: '要素が見つかりません' };
            },
            maxRetries: 3,
            actionName: `要素検索: ${selector}`,
            context: { selector }
        });

        if (!result.success) {
            throw new Error(`要素が見つかりません: ${selector}`);
        }
        return result.result.element;
    };

    const getReactProps = (element) => {
        const keys = Object.keys(element || {});
        const reactKey = keys.find(key => key.startsWith('__reactInternalInstance') || key.startsWith('__reactFiber'));
        return reactKey ? element[reactKey] : null;
    };

    const triggerReactEvent = async (element, eventType = 'click') => {
        const log = (msg) => ClaudeLogger.info(`🎯 [イベント] ${msg}`);

        try {
            const reactProps = getReactProps(element);
            if (reactProps) {
                log(`React要素検出: ${element.tagName}`);
            }

            if (eventType === 'click') {
                const rect = element.getBoundingClientRect();
                const x = rect.left + rect.width / 2;
                const y = rect.top + rect.height / 2;

                const events = [
                    new PointerEvent('pointerover', { bubbles: true, cancelable: true, clientX: x, clientY: y }),
                    new PointerEvent('pointerenter', { bubbles: false, cancelable: false, clientX: x, clientY: y }),
                    new MouseEvent('mouseover', { bubbles: true, cancelable: true, clientX: x, clientY: y }),
                    new MouseEvent('mouseenter', { bubbles: false, cancelable: false, clientX: x, clientY: y }),
                    new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: x, clientY: y }),
                    new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: x, clientY: y }),
                    new PointerEvent('pointerup', { bubbles: true, cancelable: true, clientX: x, clientY: y }),
                    new MouseEvent('mouseup', { bubbles: true, cancelable: true, clientX: x, clientY: y }),
                    new MouseEvent('click', { bubbles: true, cancelable: true, clientX: x, clientY: y })
                ];

                for (const event of events) {
                    element.dispatchEvent(event);
                    await wait(10);
                }

                element.click();
                log(`✅ クリックイベント完了: ${element.tagName}`);
            }
        } catch (error) {
            log(`⚠️ イベント処理エラー: ${error.message}`);
        }
    };

    const findElementByMultipleSelectors = async (selectors, description) => {
        ClaudeLogger.info(`\n🔍 [${description}] 要素検索開始`);

        // デバッグ: selectorsの詳細情報を出力
        ClaudeLogger.info(`📊 [DEBUG] selectors情報:`, {
            type: typeof selectors,
            isArray: Array.isArray(selectors),
            length: selectors?.length,
            firstElement: selectors?.[0],
            allSelectors: JSON.stringify(selectors, null, 2)
        });

        for (let i = 0; i < selectors.length; i++) {
            const selector = selectors[i];
            ClaudeLogger.info(`  試行 ${i + 1}/${selectors.length}: ${selector.description}`);
            ClaudeLogger.info(`  📝 [DEBUG] セレクタ詳細:`, {
                type: typeof selector,
                selector: selector?.selector,
                description: selector?.description,
                rawValue: selector
            });

            try {
                // より長い待機時間を設定（5回×500ms = 2.5秒）
                const element = await waitForElement(selector.selector, 5, 500);
                if (element) {
                    ClaudeLogger.info(`  ✅ 成功: ${selector.description}`);
                    return element;
                }
            } catch (error) {
                ClaudeLogger.info(`  ❌ 失敗: ${error.message}`);
            }
        }

        // 全セレクタで失敗した場合は、selectorInfoオブジェクトを作成してfindClaudeElementを使用
        ClaudeLogger.debug(`⚠️ [DEBUG] 全セレクタで失敗、findClaudeElementにフォールバック`);
        ClaudeLogger.info(`📊 [DEBUG-FALLBACK] 元のselectors:`, JSON.stringify(selectors, null, 2));

        const mappedSelectors = selectors.map(s => {
            if (typeof s === 'string') {
                ClaudeLogger.debug(`  📝 [DEBUG] 文字列セレクタをマップ: ${s}`);
                return s;
            } else if (s && typeof s === 'object' && s.selector) {
                ClaudeLogger.debug(`  📝 [DEBUG] オブジェクトセレクタをマップ: ${s.selector}`);
                return s.selector;
            }
            ClaudeLogger.debug(`  ⚠️ [DEBUG] 不明な型のセレクタ:`, s);
            return null; // undefinedではなくnullを返す
        });

        ClaudeLogger.info(`📊 [DEBUG-FALLBACK] マップ後のselectors:`, mappedSelectors);

        const selectorInfo = {
            description: description,
            selectors: mappedSelectors.filter(selector => selector !== null && selector !== undefined) // null/undefinedを除外
        };

        ClaudeLogger.info(`📊 [DEBUG] selectorInfo構築完了:`, {
            description: selectorInfo.description,
            selectorsCount: selectorInfo.selectors?.length,
            selectors: selectorInfo.selectors
        });

        const retryManager = new ClaudeRetryManager();
        const result = await retryManager.executeWithRetry({
            action: async () => {
                const element = await findClaudeElement(selectorInfo);
                if (element) return { success: true, element };
                return { success: false, error: `${description}の要素が見つかりません` };
            },
            maxRetries: 3,
            actionName: `${description}検索`,
            context: { selectorInfo, description }
        });

        if (!result.success) {
            throw new Error(`${description} の要素が見つかりません`);
        }
        return result.result.element;
    };

    // Step 4-2-1-2: モデル情報取得関数
    /**
     * 現在選択モデル情報取得関数
     * 【動作説明】Claude画面に表示されている現在のモデル名を複数セレクタで検索取得
     * 【用途】実行時のモデル情報記録、ログ出力、結果データに含める
     * 【引数】なし
     * 【戻り値】string|null - 検出されたモデル名または null
     * 【検索対象】モデル表示エリア、設定表示部分など複数箇所
     * 【使用頻度】頻繁（タスク実行時の重要な情報取得）
     */
    const getCurrentModelInfo = () => {
        ClaudeLogger.info('\n📊 【Step 4-2-1-1】現在のモデル情報を取得');

        for (const selectorInfo of modelSelectors.modelDisplay) {
            try {
                const element = document.querySelector(selectorInfo.selector);
                if (element) {
                    const text = element.textContent.trim();
                    ClaudeLogger.info(`  ✅ モデル情報発見: "${text}"`);
                    return text;
                }
            } catch (error) {
                ClaudeLogger.info(`  ❌ 取得失敗: ${error.message}`);
            }
        }

        ClaudeLogger.info('  ⚠️ モデル情報が見つかりません');
        return null;
    };

    // Step 4-2-1-2-2: 機能確認関数
    /**
     * 現在選択機能確認関数
     * 【動作説明】画面上の機能ボタンの状態を詳細に確認し、どの機能が有効かを判定する
     * 【用途】機能選択後の確認、Deep Research検出、意図しない機能の発見
     * 【引数】expectedFeature: 期待される機能名（省略可能）
     * 【戻り値】Object - 各機能の状態とerrorプロパティ
     * 【検出機能】じっくり考える、ウェブ検索、Deep Research（複数パターン対応）
     * 【使用頻度】機能選択処理で重要な確認処理
     */
    const confirmFeatureSelection = (expectedFeature = null) => {
        ClaudeLogger.info('\n🔍 【機能確認】選択された機能のボタンを確認');
        ClaudeLogger.info(`期待される機能: ${expectedFeature || '(指定なし)'}`);

        const confirmationResults = {
            slowThinking: false,
            webSearch: false,
            deepResearch: false,
            detected: []
        };

        try {
            // じっくり考える/ゆっくり考えるボタンの確認（トグル状態も確認）
            const slowThinkingButtons = document.querySelectorAll('button');
            for (const button of slowThinkingButtons) {
                const text = button.textContent?.trim() || '';
                const hasClockIcon = button.querySelector('svg') || button.innerHTML.includes('clock');

                // じっくり考える機能の正確な検出
                if (text.includes('じっくり考える') || text.includes('ゆっくり考える') || (hasClockIcon && text.includes('考える'))) {
                    // トグルスイッチがある場合は状態も確認
                    const toggleInput = button.querySelector('input[role="switch"]');
                    const isActive = toggleInput ?
                        (toggleInput.checked || toggleInput.getAttribute('aria-checked') === 'true') :
                        button.getAttribute('aria-pressed') === 'true';

                    if (isActive) {
                        confirmationResults.slowThinking = true;
                        const detectedType = text.includes('じっくり考える') ? 'じっくり考える' : 'ゆっくり考える';
                        confirmationResults.detected.push(detectedType);
                        ClaudeLogger.info(`  ✅ ${detectedType}ボタン（活性化状態）発見`);
                    }
                    break;
                }
            }

            // ウェブ検索ボタンの確認
            const webSearchButtons = document.querySelectorAll('button');
            for (const button of webSearchButtons) {
                const text = button.textContent?.trim() || '';
                const hasSearchIcon = button.querySelector('svg') || button.innerHTML.includes('search');
                if (text.includes('ウェブ検索') || (hasSearchIcon && text.includes('検索'))) {
                    confirmationResults.webSearch = true;
                    confirmationResults.detected.push('ウェブ検索');
                    ClaudeLogger.info('  ✅ ウェブ検索ボタン発見');
                    break;
                }
            }

            // Deep Research/リサーチボタンの確認（正確な判定）
            const researchButtons = document.querySelectorAll('button[type="button"][aria-pressed]');
            for (const button of researchButtons) {
                const text = button.textContent?.trim() || '';
                const isPressed = button.getAttribute('aria-pressed') === 'true';

                // "リサーチ" ボタンでaria-pressed="true"の場合のみDeepResearch
                if (text.includes('リサーチ') && isPressed) {
                    confirmationResults.deepResearch = true;
                    confirmationResults.detected.push('DeepResearch');
                    ClaudeLogger.info('  ✅ DeepResearch（リサーチボタン活性化）発見');
                    break;
                }
                // "Research"文字列を含むボタンも確認（英語表示対応）
                else if ((text.includes('Research') || text.includes('research')) && isPressed) {
                    confirmationResults.deepResearch = true;
                    confirmationResults.detected.push('DeepResearch');
                    ClaudeLogger.info('  ✅ DeepResearch（Researchボタン活性化）発見');
                    break;
                }
            }

            // 結果の表示
            ClaudeLogger.info(`\n📊 機能確認結果:`);
            ClaudeLogger.info(`  - じっくり/ゆっくり考える: ${confirmationResults.slowThinking ? '✅' : '❌'}`);
            ClaudeLogger.info(`  - ウェブ検索: ${confirmationResults.webSearch ? '✅' : '❌'}`);
            ClaudeLogger.info(`  - DeepResearch: ${confirmationResults.deepResearch ? '✅' : '❌'}`);
            ClaudeLogger.info(`  - 検出された機能: [${confirmationResults.detected.join(', ')}]`);

            // 期待される機能との照合
            if (expectedFeature) {
                const isExpectedFound = confirmationResults.detected.some(feature =>
                    feature.includes(expectedFeature) || expectedFeature.includes(feature)
                );
                ClaudeLogger.info(`  - 期待機能の確認: ${isExpectedFound ? '✅' : '❌'}`);
                confirmationResults.expectedFound = isExpectedFound;
            }

            return confirmationResults;

        } catch (error) {
            ClaudeLogger.info(`  ❌ 機能確認エラー: ${error.message}`);
            return { ...confirmationResults, error: error.message };
        }
    };

    // Step 4-2-1-5: React風イベント処理関数
    /**
     * 高精度トグルボタン制御関数
     * 【動作説明】現在のトグル状態を確認し、目標状態と異なる場合のみクリックして変更する
     * 【用途】機能選択時のトグルON/OFF、Deep Research設定、ウェブ検索設定
     * 【引数】toggleButton: トグルボタンのDOM要素, targetState: 目標状態（true=ON, false=OFF）
     * 【戻り値】boolean - 状態変更が行われたかどうか
     * 【チェック項目】input[role="switch"]の存在確認、checked属性またはaria-checked属性
     * 【使用頻度】3回（機能選択処理で重要）
     */
    const setToggleState = (toggleButton, targetState) => {
        ClaudeLogger.info(`\n🔄 トグル状態変更: ${targetState ? 'ON' : 'OFF'}`);

        const inputElement = toggleButton.querySelector('input[role="switch"]');
        if (!inputElement) {
            ClaudeLogger.info('  ⚠️ トグル入力要素が見つかりません');
            return false;
        }

        const currentState = inputElement.checked || inputElement.getAttribute('aria-checked') === 'true';
        ClaudeLogger.info(`  現在の状態: ${currentState ? 'ON' : 'OFF'}`);

        if (currentState !== targetState) {
            toggleButton.click();
            ClaudeLogger.info(`  ✅ トグル状態を変更しました`);
            return true;
        } else {
            ClaudeLogger.info(`  ℹ️ 既に目標の状態です`);
            return false;
        }
    };

    // Step 4-2-1-6: 強化版findClaudeElement
    /**
     * Claude専用要素検索関数（最重要）
     * 【動作説明】複数のセレクタパターンを順次試行し、要素の可視性を厳密にチェックする
     * 【用途】Claude画面のボタン、入力欄、表示エリアなど全ての要素取得
     * 【引数】selectorInfo: セレクタ情報オブジェクト, retryCount: 再試行回数, skipLog: ログ抑制フラグ
     * 【戻り値】Promise<Element|null> - 発見された要素またはnull
     * 【特徴】優先度順セレクタ試行、可視性検証、リアルタイムログ、リトライ機能
     * 【使用頻度】25回（全ステップで最も重要な関数）
     */
    const findClaudeElement = async (selectorInfo, retryCount = 5, skipLog = false) => {
        const logPrefix = skipLog ? '' : '🔍 [findClaudeElement] ';

        // デバッグ: 受け取った引数の詳細を出力
        if (!skipLog) {
            ClaudeLogger.info(`${logPrefix}📊 [DEBUG] 受け取った引数:`, {
                type: typeof selectorInfo,
                isArray: Array.isArray(selectorInfo),
                isString: typeof selectorInfo === 'string',
                value: selectorInfo,
                retryCount: retryCount
            });
        }

        // nullチェックとエラーハンドリングを追加
        if (!selectorInfo) {
            const errorMsg = 'selectorInfoが未定義です';
            ClaudeLogger.error(`${logPrefix}❌ ${errorMsg}`);
            ClaudeLogger.error(`${logPrefix}📊 [DEBUG] エラー時のselectorInfo:`, selectorInfo);
            ClaudeLogManager.logStep('Selector-Error', errorMsg, { selectorInfo });
            throw new Error(errorMsg);
        }

        // 文字列が直接渡された場合の互換性対応
        if (typeof selectorInfo === 'string') {
            ClaudeLogger.warn(`${logPrefix}⚠️ 文字列が直接渡されました、オブジェクト形式に変換します: ${selectorInfo}`);
            selectorInfo = {
                selectors: [selectorInfo],
                description: `セレクタ: ${selectorInfo}`
            };
            ClaudeLogger.debug(`${logPrefix}📊 [DEBUG] 変換後のselectorInfo:`, selectorInfo);
        }

        // 配列が直接渡された場合の互換性対応
        if (Array.isArray(selectorInfo)) {
            ClaudeLogger.warn(`${logPrefix}⚠️ 配列が直接渡されました、オブジェクト形式に変換します`);
            ClaudeLogger.debug(`${logPrefix}📊 [DEBUG] 配列の内容:`, selectorInfo);
            selectorInfo = {
                selectors: selectorInfo,
                description: `セレクタ配列: ${selectorInfo.length}個`
            };
            ClaudeLogger.debug(`${logPrefix}📊 [DEBUG] 変換後のselectorInfo:`, selectorInfo);
        }

        if (!selectorInfo.selectors || !Array.isArray(selectorInfo.selectors)) {
            const errorMsg = `selectorInfo.selectorsが配列ではありません: ${typeof selectorInfo.selectors}`;
            ClaudeLogger.error(`${logPrefix}❌ ${errorMsg}`);
            ClaudeLogger.error(`${logPrefix}📊 [DEBUG] 問題のselectorInfo:`, selectorInfo);
            ClaudeLogManager.logStep('Selector-Error', errorMsg, {
                selectorInfo: selectorInfo,
                selectorsType: typeof selectorInfo.selectors,
                selectorsValue: selectorInfo.selectors
            });
            throw new Error(errorMsg);
        }

        if (selectorInfo.selectors.length === 0) {
            const errorMsg = 'セレクタ配列が空です';
            ClaudeLogger.error(`${logPrefix}❌ ${errorMsg}`);
            ClaudeLogManager.logStep('Selector-Error', errorMsg, { selectorInfo });
            throw new Error(errorMsg);
        }

        if (!skipLog) {
            ClaudeLogger.info(`${logPrefix}要素検索開始: ${selectorInfo.description || '説明なし'}`);
            ClaudeLogger.info(`${logPrefix}使用セレクタ数: ${selectorInfo.selectors.length}`);

            // セレクタ詳細をログに記録
            ClaudeLogManager.logStep('Selector-Search', `セレクタ検索開始: ${selectorInfo.description || '説明なし'}`, {
                selectorCount: selectorInfo.selectors.length,
                selectors: selectorInfo.selectors.slice(0, 5) // 最初の5つを記録
            });
        }

        const results = [];

        for (let retry = 0; retry < retryCount; retry++) {
            if (!skipLog && retry > 0) {
                ClaudeLogger.info(`${logPrefix}リトライ ${retry + 1}/${retryCount}`);
            }

            for (let i = 0; i < selectorInfo.selectors.length; i++) {
                const selector = selectorInfo.selectors[i];

                try {
                    const elements = document.querySelectorAll(selector);

                    if (elements.length > 0) {
                        for (const element of elements) {
                            const rect = element.getBoundingClientRect();
                            const style = window.getComputedStyle(element);
                            const isVisible = rect.width > 0 && rect.height > 0 &&
                                            style.display !== 'none' &&
                                            style.visibility !== 'hidden' &&
                                            style.opacity !== '0';

                            if (isVisible) {
                                // 特別なケース: 「続ける」ボタンの場合はテキストを確認
                                if (selectorInfo.description && selectorInfo.description.includes('続けるボタン')) {
                                    const buttonText = element.textContent || element.innerText || '';
                                    if (!buttonText.includes('続ける')) {
                                        continue; // テキストが「続ける」でない場合はスキップ
                                    }
                                }
                                if (!skipLog) {
                                    ClaudeLogger.info(`${logPrefix}✅ 要素発見: セレクタ[${i}]`);
                                    ClaudeLogger.info(`${logPrefix}  セレクタ: ${selector}`);
                                    ClaudeLogger.info(`${logPrefix}  要素タイプ: ${element.tagName}`);
                                    ClaudeLogger.info(`${logPrefix}  位置: (${Math.round(rect.left)}, ${Math.round(rect.top)})`);
                                    if (element.textContent) {
                                        ClaudeLogger.info(`${logPrefix}  テキスト: ${element.textContent.substring(0, 30)}`);
                                    }

                                    // セレクタヒットをログに記録
                                    ClaudeLogManager.logStep('Selector-Hit', `セレクタがヒット: ${selectorInfo.description}`, {
                                        selector: selector,
                                        selectorIndex: i,
                                        elementTag: element.tagName,
                                        elementId: element.id || 'none',
                                        elementClass: element.className || 'none',
                                        position: { x: Math.round(rect.left), y: Math.round(rect.top) },
                                        size: { width: Math.round(rect.width), height: Math.round(rect.height) }
                                    });
                                }
                                return element;
                            }
                        }

                        results.push({
                            selector: selector,
                            count: elements.length,
                            reason: '全て非表示'
                        });
                    } else {
                        results.push({
                            selector: selector,
                            count: 0,
                            reason: '要素なし'
                        });
                    }
                } catch (error) {
                    results.push({
                        selector: selector,
                        count: 0,
                        reason: `エラー: ${error.message}`
                    });
                }
            }

            if (retry < retryCount - 1) {
                const waitTime = 2000 + (retry * 1000);
                if (!skipLog) {
                    ClaudeLogger.info(`${logPrefix}🔄 要素検索リトライ中... (${retry + 1}/${retryCount}) 次回まで${waitTime}ms待機`);
                }
                await wait(waitTime);
            }
        }

        if (!skipLog) {
            // より詳細なエラー情報を出力
            ClaudeLogger.warn(`${logPrefix}✗ 要素未発見: ${selectorInfo.description}`);
            ClaudeLogger.info(`${logPrefix}  使用セレクタ:`, selectorInfo.selectors);
            ClaudeLogger.info(`${logPrefix}  試行結果:`, results);

            // DOM内の実際のmenuitem要素を調査
            const actualMenuItems = document.querySelectorAll('[role="menuitem"]');
            ClaudeLogger.info(`${logPrefix}  📊 DOM内のmenuitem要素数: ${actualMenuItems.length}`);

            // aria-haspopup属性を持つ要素を詳細に調査
            const menuItemsWithPopup = Array.from(actualMenuItems).filter(el => el.hasAttribute('aria-haspopup'));
            ClaudeLogger.info(`${logPrefix}  📊 aria-haspopup属性を持つmenuitem: ${menuItemsWithPopup.length}`);

            menuItemsWithPopup.forEach((el, idx) => {
                const text = (el.textContent || '').trim().substring(0, 50);
                const dataState = el.getAttribute('data-state');
                const ariaExpanded = el.getAttribute('aria-expanded');
                const id = el.getAttribute('id');
                ClaudeLogger.info(`${logPrefix}    [${idx}] text="${text}", data-state="${dataState}", aria-expanded="${ariaExpanded}", id="${id}"`);
            });

            // 問題解決のためのヘルプ情報
            ClaudeLogger.info(`${logPrefix}  💡 ヘルプ: この問題を解決するには以下を確認してください:`);
            ClaudeLogger.info(`${logPrefix}     1. Claudeのモデル選択メニューが開いているか`);
            ClaudeLogger.info(`${logPrefix}     2. セレクタが最新のUIに対応しているか`);
            ClaudeLogger.info(`${logPrefix}     3. タイミングの問題（メニューが完全に開く前に検索している）`);
            ClaudeLogger.info(`${logPrefix}     4. 現在のURLが正しいか: ${window.location.href}`);

            // セレクタミスをログに記録
            ClaudeLogManager.logError('Selector-NotFound', new Error(`要素未発見: ${selectorInfo.description}`), {
                description: selectorInfo.description,
                attemptedSelectors: selectorInfo.selectors,
                results: results
            });
        }

        return null;
    };

    // Step 4-2-1-7: テキスト入力関数
    /**
     * React対応テキスト入力関数
     * 【動作説明】Reactの仮想DOMに対応したテキスト入力を行い、適切なイベントを発火する
     * 【用途】プロンプト入力、テスト用テキスト入力
     * 【引数】element: 入力対象のDOM要素, text: 入力するテキスト
     * 【戻り値】Promise<boolean> - 入力成功可否
     * 【処理順序】フォーカス → textContent設定 → inputイベント → changeイベント発火
     * 【使用頻度】2回（メイン処理とテスト処理）
     */
    const inputText = async (element, text) => {
        try {
            element.focus();
            await wait(100);

            element.textContent = text;

            const inputEvent = new Event('input', {
                bubbles: true,
                cancelable: true
            });
            element.dispatchEvent(inputEvent);

            const changeEvent = new Event('change', {
                bubbles: true,
                cancelable: true
            });
            element.dispatchEvent(changeEvent);

            await wait(100);

            ClaudeLogger.info('✓ テキスト入力成功');
            return true;
        } catch (e) {
            ClaudeLogger.error('✗ テキスト入力エラー:', e);
            return false;
        }
    };

    // Step 4-2-1-8: ボタンクリック関数
    /**
     * 高精度マウスクリック関数
     * 【動作説明】実際のマウス操作を完全再現し、クリック座標も正確に計算する
     * 【用途】送信ボタンクリック、メニューボタンクリック
     * 【引数】button: クリック対象のDOM要素, description: ログ用説明文
     * 【戻り値】Promise<boolean> - クリック成功可否
     * 【処理順序】スクロール → 座標計算 → mouseenter → mouseover → mousedown → mouseup → click
     * 【使用頻度】2回（メイン送信とテスト送信）
     */
    const clickButton = async (button, description = '送信ボタン') => {
        ClaudeLogger.info(`\n👆 ${description}をクリック`);

        try {
            button.scrollIntoView({ behavior: 'smooth', block: 'center' });
            await wait(100);

            const rect = button.getBoundingClientRect();
            ClaudeLogger.info(`📍 ボタン位置: (${Math.round(rect.left)}, ${Math.round(rect.top)})`);

            const x = rect.left + rect.width / 2;
            const y = rect.top + rect.height / 2;

            const mouseenter = new MouseEvent('mouseenter', { bubbles: true, cancelable: true, clientX: x, clientY: y });
            const mouseover = new MouseEvent('mouseover', { bubbles: true, cancelable: true, clientX: x, clientY: y });
            const mousedown = new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: x, clientY: y });
            const mouseup = new MouseEvent('mouseup', { bubbles: true, cancelable: true, clientX: x, clientY: y });
            const click = new MouseEvent('click', { bubbles: true, cancelable: true, clientX: x, clientY: y });

            button.dispatchEvent(mouseenter);
            await wait(10);
            button.dispatchEvent(mouseover);
            await wait(10);
            button.dispatchEvent(mousedown);
            await wait(10);
            button.dispatchEvent(mouseup);
            await wait(10);
            button.dispatchEvent(click);

            button.click();

            ClaudeLogger.info('✓ ボタンクリック完了');
            return true;
        } catch (e) {
            ClaudeLogger.error('✗ ボタンクリックエラー:', e);
            return false;
        }
    };

    // Step 4-2-1-8: 新しいAI応答取得ロジック
    /**
     * 階層的セレクタ定義
     * 【動作説明】AI応答を確実に取得するための階層的セレクタ戦略
     * 【戻り値】Object: セレクタ定義オブジェクト
     */
    const getAIResponseSelectors = () => {
        return {
            // レベル1: メッセージコンテナから最後の回答を特定
            message_containers: [
                '[data-testid="assistant-message"]:last-of-type',
                '.conversation-thread > :last-child [class*="standard-markdown"]',
                '.conversation-thread > :last-child .grid-cols-1.grid',
            ],

            // レベル2: 回答タイプ別セレクタ
            response_types: {
                canvas: [
                    '#markdown-artifact .grid-cols-1.grid.gap-2\\.5',
                    '.artifact-content .grid-cols-1.grid',
                    '[data-artifact-type] .grid-cols-1.grid',
                    '#markdown-artifact',
                    '.code-block__code',
                ],
                standard: [
                    ':not([id*="artifact"]) .standard-markdown',
                    '.assistant-message-content .standard-markdown',
                    '.standard-markdown',
                    'div.standard-markdown',
                ],
                code_block: [
                    '.code-block__code:last-of-type',
                    'pre code:last-of-type',
                ]
            }
        };
    };

    /**
     * ユーザー/アシスタント境界検出
     * 【動作説明】最後のユーザーメッセージ後のAI応答を確実に取得
     * 【戻り値】Element or null: AI応答要素
     */
    const getCleanAIResponse = async () => {
        ClaudeLogger.info('🔍 [getCleanAIResponse] ユーザー/アシスタント境界検出');

        // 最後のユーザーメッセージを探す
        const userMessages = document.querySelectorAll('[data-testid="user-message"]');
        const lastUserMessage = userMessages[userMessages.length - 1];

        if (lastUserMessage) {
            ClaudeLogger.info('  ✓ 最後のユーザーメッセージを発見');

            // 最後のユーザーメッセージの後の要素を取得
            let nextElement = lastUserMessage.nextElementSibling;

            while (nextElement) {
                // アシスタントメッセージを探す
                if (nextElement.matches('[data-testid="assistant-message"]') ||
                    nextElement.querySelector('[data-testid="assistant-message"]')) {

                    ClaudeLogger.info('  ✓ アシスタントメッセージを検出');

                    // Canvas要素を優先的に探す
                    const canvasContent = nextElement.querySelector(
                        '#markdown-artifact, .grid-cols-1.grid.gap-2\\.5, .code-block__code'
                    );

                    if (canvasContent) {
                        ClaudeLogger.info('  ✓ Canvas要素を発見');
                        return canvasContent;
                    }

                    // 通常のマークダウン
                    const standardContent = nextElement.querySelector('.standard-markdown');
                    if (standardContent) {
                        ClaudeLogger.info('  ✓ 標準マークダウン要素を発見');
                        return standardContent;
                    }
                }
                nextElement = nextElement.nextElementSibling;
            }
        } else {
            ClaudeLogger.info('  ⚠️ ユーザーメッセージが見つかりません');
        }

        return null;
    };

    /**
     * 思考プロセス除外の強化
     * 【動作説明】思考プロセス要素を確実に除外
     * 【引数】element: チェック対象の要素
     * 【戻り値】Element or null: クリーンな要素
     */
    const excludeThinkingProcess = (element) => {
        if (!element) return null;

        ClaudeLogger.info('🧹 [excludeThinkingProcess] 思考プロセス除外チェック');

        // 思考プロセスインジケータ
        const thinkingIndicators = [
            '.ease-out.rounded-lg',
            '[class*="thinking-process"]',
        ];

        // 親要素に思考プロセスが含まれていないか確認
        for (const indicator of thinkingIndicators) {
            try {
                if (element.closest(indicator)) {
                    ClaudeLogger.info(`  ⚠️ 思考プロセス要素を検出: ${indicator}`);
                    return null;
                }
            } catch (e) {
                // セレクタエラーをスキップ
            }
        }

        // 要素のクラスをチェック
        const classNames = element.className || '';
        if (classNames.includes('thinking') || classNames.includes('thought')) {
            ClaudeLogger.info('  ⚠️ 思考プロセスクラスを検出');
            return null;
        }

        // ボタンテキストのチェック
        const buttons = element.querySelectorAll('button');
        for (const btn of buttons) {
            if (btn.textContent && btn.textContent.includes('思考プロセス')) {
                ClaudeLogger.info('  ⚠️ 思考プロセスボタンを検出');
                return null;
            }
        }

        ClaudeLogger.info('  ✓ 思考プロセスではありません');
        return element;
    };

    /**
     * コンテンツ検証（簡略版）
     * 【動作説明】セレクタベースでの除外がメインのため、基本的なチェックのみ
     * 【引数】element: 検証対象の要素
     * 【戻り値】boolean: 有効なコンテンツかどうか
     */
    const validateResponseContent = (element) => {
        if (!element) return false;

        ClaudeLogger.info('✅ [validateResponseContent] コンテンツ検証（簡略版）');
        const text = element.textContent?.trim() || '';

        // セレクタベースでの除外がメインのため、テキストパターンチェックは簡略化
        // 明らかに空のUIラベルのみを除外
        const uiLabels = ['User', 'Assistant', 'ユーザーのプロンプト', '思考プロセス'];
        if (uiLabels.includes(text.trim())) {
            ClaudeLogger.info(`  ⚠️ UIラベルを検出: ${text.trim()}`);
            return false;
        }

        // 最小文字数チェック
        if (text.length < 10) {
            ClaudeLogger.info(`  ⚠️ テキストが短すぎます: ${text.length}文字`);
            return false;
        }

        // セレクタベースでの除外がメインのため、プロンプトテキストチェックは簡略化
        // data-testid="user-message"で除外されるため、ここでは基本的なチェックのみ
        // 特に長いプロンプトが残っている場合のみチェック
        if (text.length > 2000 && (text.includes('# 命令書') || text.includes('【現在'))) {
            ClaudeLogger.info(`  ⚠️ 長いプロンプトテキストが残存: ${text.length}文字`);
            return false;
        }

        ClaudeLogger.info(`  ✓ 有効なコンテンツ: ${text.length}文字`);
        return true;
    };

    /**
     * セレクタによる要素検索
     * 【動作説明】セレクタリストから要素を検索
     * 【引数】selectors: セレクタ配列
     * 【戻り値】Element or null: 見つかった要素
     */
    const findElementBySelectors = (selectors) => {
        for (const selector of selectors) {
            try {
                const element = document.querySelector(selector);
                if (element) {
                    ClaudeLogger.info(`  ✓ セレクタでマッチ: ${selector}`);
                    return element;
                }
            } catch (e) {
                // セレクタエラーをスキップ
            }
        }
        return null;
    };

    /**
     * 統合AI応答取得メソッド
     * 【動作説明】複数の手法を組み合わせて確実にAI応答を取得
     * 【戻り値】Object: {element, text, method}
     */
    const getReliableAIResponse = async () => {
        ClaudeLogger.info('🚀 [getReliableAIResponse] AI応答取得開始');

        // Method 1: ユーザー/アシスタント境界検出
        let response = await getCleanAIResponse();

        if (response) {
            response = excludeThinkingProcess(response);
            if (response && validateResponseContent(response)) {
                return {
                    element: response,
                    text: response.textContent?.trim() || '',
                    method: 'User/Assistant Boundary'
                };
            }
        }

        // Method 2: 階層的セレクタ
        ClaudeLogger.info('  階層的セレクタ戦略を試行');
        const selectors = getAIResponseSelectors();

        // Canvas要素を優先
        let element = findElementBySelectors(selectors.response_types.canvas);

        if (!element) {
            element = findElementBySelectors(selectors.response_types.standard);
        }

        if (!element) {
            element = findElementBySelectors(selectors.response_types.code_block);
        }

        if (element) {
            element = excludeThinkingProcess(element);
            if (element && validateResponseContent(element)) {
                return {
                    element: element,
                    text: element.textContent?.trim() || '',
                    method: 'Hierarchical Selectors'
                };
            }
        }

        // Method 3: フォールバック - 最後のgrid要素
        ClaudeLogger.info('  フォールバック検索');
        const grids = document.querySelectorAll('.grid-cols-1.grid');
        if (grids.length > 0) {
            const lastGrid = grids[grids.length - 1];
            const validated = excludeThinkingProcess(lastGrid);
            if (validated && validateResponseContent(validated)) {
                return {
                    element: validated,
                    text: validated.textContent?.trim() || '',
                    method: 'Fallback - Last Grid'
                };
            }
        }

        return {
            element: null,
            text: '',
            method: 'Not Found'
        };
    };

    /**
     * テキスト内容によるプロンプト除外（簡略版）
     * 【動作説明】セレクタベースの除外がメインのため、テキストパターンマッチングは簡略化
     * 【引数】fullText: 完全テキスト
     * 【戻り値】String: テキスト（セレクタベースで除外されているためそのまま返却）
     */
    const removePromptFromText = (fullText, sentPrompt = null) => {
        if (!fullText) return '';

        ClaudeLogger.info('✂️ [removePromptFromText] セレクタベースで除外済みのため、テキストをそのまま返却');
        ClaudeLogger.info(`  - 入力テキスト長: ${fullText.length}文字`);

        // セレクタベースでのPROMPT除外がメインのため、テキストパターンマッチングは簡略化
        // HTML構造の<details>タグのみ除外（思考プロセスの折りたたみブロック）
        let processedText = fullText;
        if (processedText.includes('<details>')) {
            ClaudeLogger.info('  - <details>ブロックを除外');
            processedText = processedText.replace(/<details>[\s\S]*?<\/details>/gi, '');
        }

        return processedText.trim();
    };

    // Step 4-2-1-9: テキストプレビュー取得関数（改善版）
    /**
     * 高度テキスト抽出関数（応答取得の核心）
     * 【動作説明】新しいAI応答取得ロジックを使用して確実にテキストを取得
     * 【引数】element: テキスト抽出対象のDOM要素（オプション）
     * 【戻り値】Object {full: 完全テキスト, preview: プレビュー, length: 文字数}
     */
    const getTextPreview = async (element) => {
        ClaudeLogger.info('📊 [getTextPreview] テキスト取得開始');

        // 要素が指定されていない場合は、新しいAI応答取得ロジックを使用
        if (!element) {
            ClaudeLogger.info('  新しいAI応答取得ロジックを使用');
            const response = await getReliableAIResponse();

            if (response.element) {
                ClaudeLogger.info(`  取得メソッド: ${response.method}`);
                ClaudeLogger.info(`  テキスト長: ${response.text.length}文字`);

                const length = response.text.length;
                if (length <= 200) {
                    return { full: response.text, preview: response.text, length };
                } else {
                    const preview = response.text.substring(0, 100) + '\n...[中略]...\n' + response.text.substring(length - 100);
                    return { full: response.text, preview, length };
                }
            } else {
                ClaudeLogger.info('  AI応答が見つかりませんでした');
                return { full: '', preview: '', length: 0 };
            }
        }

        // 既存のロジック（要素が指定されている場合）
        ClaudeLogger.info('  - 要素タグ:', element.tagName);
        ClaudeLogger.info('  - 要素ID:', element.id || '(なし)');
        ClaudeLogger.info('  - 要素クラス:', element.className ? element.className.substring(0, 100) : '(なし)');
        ClaudeLogger.info('  - 子要素数:', element.children.length);

        // まず、思考プロセスとコンテンツ検証をチェック
        const cleanedElement = excludeThinkingProcess(element);
        if (!cleanedElement || !validateResponseContent(cleanedElement)) {
            ClaudeLogger.info('  要素が無効なコンテンツと判定されました');
            // フォールバック：新しいロジックで再試行
            const response = await getReliableAIResponse();
            if (response.element) {
                const length = response.text.length;
                if (length <= 200) {
                    return { full: response.text, preview: response.text, length };
                } else {
                    const preview = response.text.substring(0, 100) + '\n...[中略]...\n' + response.text.substring(length - 100);
                    return { full: response.text, preview, length };
                }
            }
        }

        // 複数の方法でテキスト取得を試みる
        let fullText = '';

        // 方法1: innerText（表示されているテキスト）
        if (element.innerText) {
            fullText = element.innerText.trim();
            ClaudeLogger.info('  - innerText長:', fullText.length);
        }

        // 方法2: textContent（全テキスト）
        if (!fullText || fullText.length < 100) {
            const textContent = element.textContent.trim();
            ClaudeLogger.info('  - textContent長:', textContent.length);
            if (textContent.length > fullText.length) {
                fullText = textContent;
            }
        }

        // 方法3: 特定の子要素からテキスト取得（Canvasの場合）
        const isCanvasElement = element.classList.contains('code-block__code') ||
                               element.id === 'markdown-artifact' ||
                               element.querySelector('#markdown-artifact') ||
                               element.querySelector('.code-block__code') ||
                               element.querySelector('.grid-cols-1.grid.gap-2\\.5');

        // 作業説明文を除外（間違った取得対象）
        const isTaskExplanation = element.classList.contains('p-3') ||
                                 element.classList.contains('pt-0') ||
                                 element.classList.contains('pr-8') ||
                                 (element.textContent && element.textContent.includes('The task is complete'));

        // 思考プロセス要素を除外
        const thinkingButtons = Array.from(element.querySelectorAll('button')).filter(btn =>
            btn.textContent && btn.textContent.includes('思考プロセス')
        );
        const isThinkingProcess = thinkingButtons.length > 0 ||
                                 element.querySelector('.ease-out.rounded-lg') ||
                                 (element.textContent && element.textContent.includes('思考プロセス'));

        if (isCanvasElement && !isTaskExplanation && !isThinkingProcess) {
            ClaudeLogger.info('  📝 Canvas要素を検出、特別処理を実行');
            ClaudeLogger.info(`    - 要素判定: ${element.classList.contains('code-block__code') ? 'code-block__code' : 'その他Canvas要素'}`);

            // code-block__code要素の場合は直接テキストを取得
            if (element.classList.contains('code-block__code')) {
                const codeText = element.innerText || element.textContent || '';
                if (codeText.trim() && codeText.length > fullText.length) {
                    fullText = codeText.trim();
                    ClaudeLogger.info('  - code-block__code テキスト長:', fullText.length);
                }
            } else {
                // その他のCanvas要素の場合は従来の方法
                const paragraphs = element.querySelectorAll('p');
                ClaudeLogger.info('  - 段落数:', paragraphs.length);

                if (paragraphs.length > 0) {
                    let combinedText = '';
                    let totalChars = 0;
                    paragraphs.forEach((para, index) => {
                        const paraText = para.innerText || para.textContent || '';
                        if (paraText.trim()) {
                            const charCount = paraText.length;
                            totalChars += charCount;
                            if (index < 5 || index >= paragraphs.length - 2) {
                                // 最初の5段落と最後の2段落の詳細をログ
                                ClaudeLogger.info(`    - 段落${index + 1}: ${charCount}文字`);
                            }
                            combinedText += paraText.trim() + '\n\n';
                        }
                    });

                    ClaudeLogger.info(`  - 総文字数: ${totalChars}文字`);

                    if (combinedText.trim().length > fullText.length) {
                        fullText = combinedText.trim();
                        ClaudeLogger.info('  - 結合テキスト長:', fullText.length);
                    }
                }

                // pre/codeブロックも探す（コード例が含まれる場合）
                const codeBlocks = element.querySelectorAll('pre, code');
                if (codeBlocks.length > 0) {
                    ClaudeLogger.info('  - コードブロック数:', codeBlocks.length);
                    let codeText = '';
                    codeBlocks.forEach((block, index) => {
                        const blockText = block.innerText || block.textContent || '';
                        if (blockText.trim() && !fullText.includes(blockText.trim())) {
                            ClaudeLogger.info(`    - コードブロック${index + 1}: ${blockText.length}文字`);
                            codeText += blockText + '\n';
                        }
                    });

                    if (codeText.trim()) {
                        fullText += '\n\n' + codeText.trim();
                    }
                }
            }
        } else if (isTaskExplanation) {
            ClaudeLogger.info('  ⚠️ 作業説明文を検出、除外します');
            ClaudeLogger.info(`    - 除外理由: ${element.classList.contains('p-3') ? 'p-3クラス' :
                                        element.classList.contains('pt-0') ? 'pt-0クラス' :
                                        element.classList.contains('pr-8') ? 'pr-8クラス' :
                                        'タスク完了テキスト'}`);
        } else if (isThinkingProcess) {
            ClaudeLogger.info('  ⚠️ 思考プロセス要素を検出、除外します');
            ClaudeLogger.info('    - 除外理由: 思考プロセスボタンまたは関連要素を検出');
            // 思考プロセス以外の要素を探して取得
            const canvasContent = Array.from(element.querySelectorAll('div.grid-cols-1.grid')).find(div => {
                const buttons = Array.from(div.querySelectorAll('button'));
                return !buttons.some(btn => btn.textContent && btn.textContent.includes('思考プロセス'));
            });
            if (canvasContent) {
                const contentText = canvasContent.innerText || canvasContent.textContent || '';
                if (contentText.trim()) {
                    fullText = contentText.trim();
                    ClaudeLogger.info('  - 思考プロセス除外後のテキスト長:', fullText.length);
                }
            }
        }

        let length = fullText.length;
        ClaudeLogger.info('  ✅ 最終テキスト長:', length);

        if (length === 0) {
            ClaudeLogger.warn('  ⚠️ テキストが空です！');
            ClaudeLogger.info('  - element.innerHTML長:', element.innerHTML ? element.innerHTML.length : 0);
            ClaudeLogger.info('  - element.outerHTML冒頭:', element.outerHTML ? element.outerHTML.substring(0, 200) : '(なし)');
        }

        // セレクタベースでの除外がメインのため、テキスト処理は最小限に
        const originalLength = fullText.length;
        fullText = removePromptFromText(fullText);  // HTMLの<details>タグのみ除外
        const finalLength = fullText.length;

        if (originalLength !== finalLength) {
            ClaudeLogger.info(`📝 HTMLタグクリーニング: ${originalLength}文字 → ${finalLength}文字`);
        }

        // length変数を再利用
        length = finalLength;

        if (length <= 200) {
            return { full: fullText, preview: fullText, length };
        } else {
            const preview = fullText.substring(0, 100) + '\n...[中略]...\n' + fullText.substring(length - 100);
            return { full: fullText, preview, length };
        }
    };

    // Step 4-2-1-10: 要素の可視性チェック
    /**
     * 要素可視性判定関数
     * 【動作説明】DOM要素が実際に画面上で見える状態かを厳密にチェックする
     * 【用途】getFeatureElement内での要素検証、表示確認
     * 【引数】element: チェック対象のDOM要素
     * 【戻り値】boolean - 要素が可視状態かどうか
     * 【チェック項目】要素存在、width>0、height>0、display≠none、visibility≠hidden、opacity≠0
     * 【使用頻度】1回（getFeatureElement内のみ）
     */
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

    // Step 4-2-1-11: 機能要素の取得（特別処理対応）
    /**
     * 機能ボタン特別検索関数
     * 【動作説明】通常のセレクタ検索に加え、テキスト内容での検索も行う高度な要素取得
     * 【用途】機能メニューボタン、ウェブ検索トグル、特殊機能ボタンの取得
     * 【引数】selectors: セレクタ配列, description: ログ用説明文
     * 【戻り値】Element|null - 発見された要素またはnull
     * 【特別処理】「ウェブ検索」「じっくり考える」テキストでのボタン検索対応
     * 【使用頻度】3回（機能選択処理で重要）
     */
    const getFeatureElement = (selectors, description = '') => {
        ClaudeLogger.info(`🔍 機能要素取得開始: ${description}`);
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
                                ClaudeLogger.info(`✅ ${description}発見（テキスト検索）`);
                                return el;
                            }
                        }
                    }
                } else {
                    const element = document.querySelector(selector);
                    if (element && isElementVisible(element)) {
                        ClaudeLogger.info(`✅ ${description}発見: ${selector}`);
                        return element;
                    }
                }
            } catch (error) {
                continue;
            }
        }
        ClaudeLogger.info(`⚠️ ${description}が見つかりません`);
        return null;
    };

    // Step 4-2-1-12: すべての機能トグルをオフにする関数
    /**
     * 一括機能リセット関数
     * 【動作説明】画面上の全てのトグルスイッチを検索し、ONになっているものを自動的にOFFにする
     * 【用途】機能選択前の初期化、意図しない機能の無効化
     * 【引数】なし
     * 【戻り値】Promise<number> - 変更したトグル数
     * 【処理対象】input[role="switch"]要素、複数のHTML構造パターンに対応
     * 【使用頻度】2回（機能選択前の重要な初期化処理）
     */
    const turnOffAllFeatureToggles = async () => {
        ClaudeLogger.info('\n🔄 すべての機能トグルをオフに設定中...');
        let toggleCount = 0;

        // 機能メニュー内のすべてのトグルを探す（改良版セレクタ）
        const allInputs = document.querySelectorAll('input[role="switch"]');

        for (const inputElement of allInputs) {
            try {
                // input要素が属するボタンを遡って探す
                const toggleButton = inputElement.closest('button');

                if (toggleButton && inputElement) {
                    const isCurrentlyOn = inputElement.checked || inputElement.getAttribute('aria-checked') === 'true';

                    if (isCurrentlyOn) {
                        // 機能名の取得（複数パターンに対応）
                        let featureName = 'Unknown';

                        // パターン1: p.font-base (従来)
                        const labelFontBase = toggleButton.querySelector('p.font-base');
                        if (labelFontBase) {
                            featureName = labelFontBase.textContent.trim();
                        }
                        // パターン2: 新しいHTML構造（text-text-300クラス）
                        else {
                            const labelTextClass = toggleButton.querySelector('p.font-base.text-text-300, p[class*="text-text-300"]');
                            if (labelTextClass) {
                                featureName = labelTextClass.textContent.trim();
                            }
                            // パターン3: 任意のpタグ内のテキスト
                            else {
                                const anyLabel = toggleButton.querySelector('p');
                                if (anyLabel && anyLabel.textContent.trim()) {
                                    featureName = anyLabel.textContent.trim();
                                }
                            }
                        }

                        ClaudeLogger.info(`  🔘 ${featureName}をオフに設定`);
                        toggleButton.click();
                        toggleCount++;

                        // クリック後の短い待機
                        await new Promise(resolve => setTimeout(resolve, 200));
                    }
                }
            } catch (error) {
                ClaudeLogger.warn('  ⚠️ トグル処理エラー:', error.message);
            }
        }

        ClaudeLogger.info(`✅ ${toggleCount}個のトグルをオフにしました`);
        return toggleCount;
    };

    // ========================================
    // Step 4-2-1-13: Deep Research専用処理関数
    // ========================================

    /**
     * Deep Research専用複雑待機関数（最も複雑な処理）
     * 【動作説明】Deep Research特有の多段階応答パターンに対応した高度な待機制御
     * 【用途】Deep Research機能使用時の応答完了待機
     * 【引数】なし
     * 【戻り値】Promise<void> - 完了まで待機
     * 【処理段階】送信後待機 → 初回完了待機 → 追加処理待機 → 再開待機 → 最終完了待機
     * 【特殊対応】Canvas機能、プレビューボタン、続けるボタン、複数回の完了確認
     * 【使用頻度】Deep Research使用時のみ（高度な専用処理）
     */
    const handleDeepResearchWait = async () => {
        ClaudeLogger.info('\n【Deep Research専用待機処理】');
        ClaudeLogger.info('─'.repeat(40));

        try {
            // Step 4-2-6-1-1: 送信後、回答停止ボタンが出てくるまで待機
            ClaudeLogger.info('\n【Step 4-2-6-1】送信後、回答停止ボタンが出てくるまで待機');

            let stopButtonFound = false;
            let waitCount = 0;
            const maxInitialWait = AI_WAIT_CONFIG.STOP_BUTTON_INITIAL_WAIT / 1000; // 統一設定: 30秒

            while (!stopButtonFound && waitCount < maxInitialWait) {
                const deepResearchSelectors = getDeepResearchSelectors();
                const stopResult = await findClaudeElement(deepResearchSelectors['3_回答停止ボタン'], 3, true);

                if (stopResult) {
                    stopButtonFound = true;
                    ClaudeLogger.info(`✓ 停止ボタンが出現しました（${waitCount}秒後）`);
                    break;
                }

                await wait(1000);
                waitCount++;

                // 5秒ごとにログ出力
                if (waitCount % 5 === 0) {
                    ClaudeLogger.info(`  待機中... ${waitCount}秒経過`);
                }
            }

            // Step 4-2-6-1-2: 回答停止ボタンが消滅するまで待機（初回）
            if (stopButtonFound) {
                ClaudeLogger.info('\n【Step 4-2-6-2】回答停止ボタンが消滅するまで待機（初回）');
                let stopButtonGone = false;
                waitCount = 0;
                const maxDisappearWait = AI_WAIT_CONFIG.STOP_BUTTON_DISAPPEAR_WAIT / 1000; // 統一設定: 5分

                while (!stopButtonGone && waitCount < maxDisappearWait) {
                    const deepResearchSelectors = getDeepResearchSelectors();
                    const stopResult = await findClaudeElement(deepResearchSelectors['3_回答停止ボタン'], 3, true);

                    if (!stopResult) {
                        stopButtonGone = true;
                        ClaudeLogger.info(`✓ 停止ボタンが消滅しました（${waitCount}秒後）`);
                        // 停止ボタン消滅後の3秒待機
                        ClaudeLogger.info('⏳ 停止ボタン消滅後の3秒待機中...');
                        await wait(3000);
                        break;
                    }

                    await wait(1000);
                    waitCount++;

                    // 10秒ごとにログ出力
                    if (waitCount % 10 === 0) {
                        ClaudeLogger.info(`  初回回答生成中... ${Math.floor(waitCount / 60)}分${waitCount % 60}秒経過`);
                    }
                }
            }

            // Step 4-2-6-1-3: 一時待機（Deep Researchの追加処理のため）
            ClaudeLogger.info('\n【Step 4-2-6-3】Deep Research追加処理の一時待機');
            await wait(5000);

            // ログで状態を確認
            const currentButtons = document.querySelectorAll('button');
            for (const btn of currentButtons) {
                const text = btn.textContent?.trim() || '';
                if (text.includes('停止') || text.includes('Stop')) {
                    ClaudeLogger.info('  停止ボタン検出:', text);
                }
            }

            // Step 4-2-6-1-4: 回答停止ボタンが出現するまで待機
            ClaudeLogger.info('\n【Step 4-2-6-4】回答停止ボタンが出現するまで待機');
            stopButtonFound = false;
            waitCount = 0;
            const maxWaitCount = AI_WAIT_CONFIG.DEEP_RESEARCH_WAIT / 1000; // 統一設定: 40分

            while (!stopButtonFound && waitCount < maxWaitCount) {
                const deepResearchSelectors = getDeepResearchSelectors();
                const stopResult = await findClaudeElement(deepResearchSelectors['3_回答停止ボタン'], 3, true);

                if (stopResult) {
                    stopButtonFound = true;
                    ClaudeLogger.info(`✓ 停止ボタンが出現しました（開始から${Math.floor(waitCount/60)}分${waitCount%60}秒後）`);
                    break;
                }

                await wait(1000);
                waitCount++;

                // 1分ごとにログ出力
                if (waitCount % 60 === 0) {
                    ClaudeLogger.info(`  Deep Research処理中... ${Math.floor(waitCount/60)}分経過`);
                }
            }

            // Step 4-2-6-1-5: 回答停止ボタンが10秒間消滅するまで待機
            if (stopButtonFound) {
                ClaudeLogger.info('\n【Step 4-2-6-5】回答停止ボタンが10秒間消滅するまで待機');
                let stopButtonGone = false;
                let disappearWaitCount = 0;
                const maxDisappearWait = AI_WAIT_CONFIG.DEEP_RESEARCH_WAIT / 1000; // 統一設定: 40分
                let lastLogTime = Date.now();

                while (!stopButtonGone && disappearWaitCount < maxDisappearWait) {
                    const deepResearchSelectors = getDeepResearchSelectors();
                    const stopResult = await findClaudeElement(deepResearchSelectors['3_回答停止ボタン'], 3, true);

                    if (!stopResult) {
                        // 10秒間確認
                        let confirmCount = 0;
                        let stillGone = true;

                        while (confirmCount < 10) {
                            await wait(1000);
                            const deepResearchSelectors = getDeepResearchSelectors();
                            const checkResult = await findClaudeElement(deepResearchSelectors['3_回答停止ボタン'], 2);
                            if (checkResult) {
                                stillGone = false;
                                break;
                            }
                            confirmCount++;
                        }

                        if (stillGone) {
                            stopButtonGone = true;
                            ClaudeLogger.info(`✓ Deep Research完了（総時間: ${Math.floor(disappearWaitCount/60)}分）`);
                            // 停止ボタン消滅後の3秒待機
                            ClaudeLogger.info('⏳ 停止ボタン消滅後の3秒待機中...');
                            await wait(3000);
                            break;
                        }
                    }

                    await wait(1000);
                    disappearWaitCount++;

                    // 1分ごとにログ出力
                    if (Date.now() - lastLogTime >= 60000) {
                        ClaudeLogger.info(`  Deep Research生成中... ${Math.floor(disappearWaitCount / 60)}分経過`);
                        lastLogTime = Date.now();
                    }
                }
            }

        } catch (error) {
            ClaudeLogger.error('❌ Deep Research待機処理エラー:', error.message);
            throw error;
        }
    };

    // ========================================
    // メイン実行関数（Step 4-2-2-7を含む）
    // ========================================

    async function executeTask(taskData) {
        ClaudeLogger.info('%c🚀 Claude V2 タスク実行開始', 'color: #9C27B0; font-weight: bold; font-size: 16px');
        ClaudeLogger.info('%c【Step 4-2-0-1】タスク初期化開始', 'color: #2196F3; font-weight: bold;');
        ClaudeLogger.info('════════════════════════════════════════');

        ClaudeLogger.info('📋 受信したタスクデータ:', {
            model: taskData.model || '未指定',
            function: taskData.function || '通常',
            promptLength: taskData.prompt?.length || taskData.text?.length || 0,
            hasPrompt: !!(taskData.prompt || taskData.text),
            cellInfo: taskData.cellInfo || '不明',
            spreadsheetId: taskData.spreadsheetId || '未設定',
            gid: taskData.gid || '未設定'
        });

        // 送信時刻をタスク開始時に記録（関数全体で使用可能）
        const taskStartTime = new Date();
        let sendTime = taskStartTime; // 実際の送信時刻で更新される
        ClaudeLogger.info('🕰️ タスク開始時刻:', taskStartTime.toISOString());
        ClaudeLogger.info('🎯 実行プラン:');
        ClaudeLogger.info('  1. テキスト入力');
        ClaudeLogger.info('    1.1. 入力欄検索');
        ClaudeLogger.info('    1.2. テキスト挿入');
        ClaudeLogger.info('    1.3. 入力検証');
        ClaudeLogger.info('  2. モデル選択（条件付き）');
        ClaudeLogger.info('    2.1. メニュー検索・クリック');
        ClaudeLogger.info('    2.2. 目標モデル検索');
        ClaudeLogger.info('    2.3. モデル選択確認');
        ClaudeLogger.info('  3. 機能選択（条件付き）');
        ClaudeLogger.info('    3.1. 機能メニューアクセス');
        ClaudeLogger.info('    3.2. 全トグルオフ');
        ClaudeLogger.info('    3.3. 目標機能設定');
        ClaudeLogger.info('    3.4. 機能選択確認');
        ClaudeLogger.info('  4. メッセージ送信');
        ClaudeLogger.info('    4.1. 送信ボタン検索');
        ClaudeLogger.info('    4.2. ボタンクリック実行');
        ClaudeLogger.info('    4.3. 送信時刻記録');
        ClaudeLogger.info('  5. 応答待機');
        ClaudeLogger.info('    5.1. 停止ボタン監視');
        ClaudeLogger.info('    5.2. 応答完了判定');
        ClaudeLogger.info('  6. テキスト取得');
        ClaudeLogger.info('    6.1. Canvas/通常判定');
        ClaudeLogger.info('    6.2. テキスト抽出');
        ClaudeLogger.info('    6.3. 結果検証');
        ClaudeLogger.info('✅【Step 4-2-0-2】タスク初期化完了\n');

        // ログ記録開始
        ClaudeLogManager.startTask(taskData);

        try {
            // パラメータ準備（スプレッドシートの値をそのまま使用）
            let prompt = taskData.prompt || taskData.text || '';

            // セル位置情報を追加
            if (taskData.cellInfo && taskData.cellInfo.column && taskData.cellInfo.row) {
                const cellPosition = `${taskData.cellInfo.column}${taskData.cellInfo.row}`;
                prompt = `【現在${cellPosition}セルを処理中です】\n\n${prompt}`;
                ClaudeLogger.info(`📍 セル位置情報を追加: ${cellPosition}`);
            }

            const modelName = taskData.model || '';
            const featureName = taskData.function || null;

            // Deep Research判定
            const isDeepResearch = featureName === 'Deep Research';

            ClaudeLogger.info('実行パラメータ:');
            ClaudeLogger.info('  - モデル名:', modelName || '(デフォルト)');
            ClaudeLogger.info('  - 機能名:', featureName || '(なし)');
            ClaudeLogger.info('  - Deep Research:', isDeepResearch ? '有効' : '無効');
            ClaudeLogger.info('  - プロンプト長:', prompt.length, '文字');

            // ========================================
            // ステップ2: テキスト入力
            // ========================================
            ClaudeLogger.info('\n【Step 4-2-2-1】テキスト入力');
            ClaudeLogger.info('─'.repeat(40));
            ClaudeLogger.info(`📋 プロンプト長: ${prompt.length}文字`);
            ClaudeLogger.info(`🎯 対象セレクタ: ${claudeSelectors['1_テキスト入力欄']}`);
            ClaudeLogManager.logStep('Step2-TextInput', 'テキスト入力開始');

            ClaudeLogger.info('🔍 テキスト入力欄を検索中...');
            const inputResult = await findClaudeElement(claudeSelectors['1_テキスト入力欄']);
            if (!inputResult) {
                ClaudeLogger.error('❌ テキスト入力欄が見つかりません - リトライ機能で再試行');
                ClaudeLogger.error(`🎯 検索セレクタ: ${claudeSelectors['1_テキスト入力欄']}`);

                const retryManager = new ClaudeRetryManager();
                const retryResult = await retryManager.executeWithRetry({
                    action: async () => {
                        const input = await findClaudeElement(claudeSelectors['1_テキスト入力欄']);
                        return input ? { success: true, element: input } : { success: false };
                    },
                    maxRetries: 5,
                    actionName: 'テキスト入力欄検索',
                    context: { taskId: taskData.taskId }
                });

                if (!retryResult.success) {
                    throw new Error('テキスト入力欄が見つかりません');
                }
                inputResult = retryResult.result.element;
            }

            ClaudeLogger.info(`✅ テキスト入力欄発見: ${inputResult.tagName}`);
            ClaudeLogger.info(`📝 ${prompt.length}文字のテキストを入力中...`);
            ClaudeLogger.info(`💬 プロンプト先頭: "${prompt.substring(0, 50)}${prompt.length > 50 ? '...' : ''}"`);

            const inputSuccess = await inputText(inputResult, prompt);
            if (!inputSuccess) {
                ClaudeLogger.error('❌ テキスト入力処理に失敗 - リトライ機能で再試行');

                const retryManager = new ClaudeRetryManager();
                const retryResult = await retryManager.executeWithRetry({
                    action: async () => {
                        const success = await enterText(inputResult, prompt, '目標プロンプト');
                        return success ? { success: true } : { success: false };
                    },
                    maxRetries: 3,
                    actionName: 'テキスト入力処理',
                    context: { taskId: taskData.taskId, promptLength: prompt.length }
                });

                if (!retryResult.success) {
                    throw new Error('テキスト入力に失敗しました');
                }
            }

            ClaudeLogger.info('✅ テキスト入力完了');
            ClaudeLogger.info(`📊 入力結果: ${inputResult.textContent.length}文字が入力欄に設定されました`);

            // 入力成功の確認
            const inputVerification = inputResult.textContent.length > 0;
            ClaudeLogger.info(`🔍 入力検証: ${inputVerification ? '✅ 成功' : '❌ 失敗'}`);
            ClaudeLogger.info(`📈 入力精度: ${Math.round((inputResult.textContent.length / prompt.length) * 100)}%`);

            ClaudeLogManager.logStep('Step2-TextInput', 'テキスト入力完了', {
                promptLength: prompt.length,
                inputElementTag: inputResult.tagName,
                finalLength: inputResult.textContent.length,
                inputAccuracy: Math.round((inputResult.textContent.length / prompt.length) * 100)
            });

            ClaudeLogger.info('%c✅【Step 4-2-2-2】テキスト入力処理完了', 'color: #4CAF50; font-weight: bold;');
            ClaudeLogger.info('─'.repeat(50));
            await wait(1000);

            // ========================================
            // ステップ3: モデル選択（条件付き）
            // ========================================
            if (modelName && modelName !== '' && modelName !== '設定なし') {
                ClaudeLogger.info('%c【Step 4-2-3-1】モデル選択開始', 'color: #FF9800; font-weight: bold;');
                ClaudeLogger.info('─'.repeat(40));
                ClaudeLogger.info(`🎯 目標モデル: ${modelName}`);
                ClaudeLogger.info(`📍 現在のページURL: ${window.location.href}`);

                // モデルメニューボタンを探してクリック
                ClaudeLogger.info('\n【Step 4-2-3-2】モデルメニューボタンを探す');
                const menuButton = await findElementByMultipleSelectors(modelSelectors.menuButton, 'モデル選択ボタン');
                await triggerReactEvent(menuButton);
                await wait(2000);

                // モデル名がClaudeを含むか確認
                const targetModelName = modelName.startsWith('Claude') ? modelName : `Claude ${modelName}`;

                // サブメニューチェック
                const mainMenuItems = document.querySelectorAll('[role="menuitem"]:not([aria-haspopup="menu"])');
                let foundInMain = false;

                for (const item of mainMenuItems) {
                    const itemText = item.textContent;
                    if (itemText && itemText.includes(targetModelName)) {
                        foundInMain = true;
                        await triggerReactEvent(item, 'click');
                        await wait(1500);
                        break;
                    }
                }

                if (!foundInMain) {
                    // その他のモデルをチェック
                    ClaudeLogger.info('【Step 4-2-3-3】その他のモデルメニューをチェック');

                    // デバッグ: modelSelectors.otherModelsMenuの詳細を出力
                    ClaudeLogger.debug('📊 [DEBUG] modelSelectors.otherModelsMenu:');
                    ClaudeLogger.info('  - 型:', typeof modelSelectors.otherModelsMenu);
                    ClaudeLogger.info('  - 配列:', Array.isArray(modelSelectors.otherModelsMenu));
                    ClaudeLogger.info('  - 長さ:', modelSelectors.otherModelsMenu?.length);
                    ClaudeLogger.info('  - 内容:', JSON.stringify(modelSelectors.otherModelsMenu, null, 2));

                    // デバッグ: 現在のDOM状態を確認
                    ClaudeLogger.debug('📊 [DEBUG] 現在のDOM状態:');
                    const allMenuItems = document.querySelectorAll('[role="menuitem"]');
                    ClaudeLogger.info('  - 全menuitem数:', allMenuItems.length);
                    allMenuItems.forEach((item, index) => {
                        const hasPopup = item.getAttribute('aria-haspopup');
                        const text = item.textContent?.trim();
                        if (hasPopup || text?.includes('他のモデル') || text?.includes('Other')) {
                            ClaudeLogger.info(`  - [${index}] text: "${text?.substring(0, 50)}", aria-haspopup: "${hasPopup}"`);
                        }
                    });

                    // modelSelectors.otherModelsMenuは既にデフォルト値を持っているので、直接使用
                    ClaudeLogger.debug('📊 [DEBUG] その他のモデルメニューセレクタ数:', modelSelectors.otherModelsMenu.length);
                    const otherModelsItem = await findElementByMultipleSelectors(modelSelectors.otherModelsMenu, 'その他のモデルメニュー');
                    if (otherModelsItem) {
                        ClaudeLogger.debug('✅ [DEBUG] その他のモデルメニューアイテム発見');
                        await triggerReactEvent(otherModelsItem, 'click');
                        await wait(1500);

                        // サブメニュー内でモデルを探す
                        const subMenuItems = document.querySelectorAll('[role="menuitem"]');
                        ClaudeLogger.debug(`📊 [DEBUG] サブメニュー内のアイテム数: ${subMenuItems.length}`);
                        for (const item of subMenuItems) {
                            const itemText = item.textContent;
                            if (itemText && itemText.includes(targetModelName)) {
                                ClaudeLogger.debug(`✅ [DEBUG] ターゲットモデル発見: ${itemText}`);
                                await triggerReactEvent(item, 'click');
                                await wait(1500);
                                break;
                            }
                        }
                    } else {
                        ClaudeLogger.debug('❌ [DEBUG] その他のモデルメニューアイテムが見つかりません');
                    }
                }

                // モデル選択結果の確認
                const newCurrentModel = getCurrentModelInfo();
                ClaudeLogger.info(`🔍 選択後のモデル: "${newCurrentModel}"`);
                ClaudeLogger.info(`🎯 期待されるモデル: "${targetModelName}"`);
                const modelMatched = newCurrentModel === targetModelName;
                ClaudeLogger.info(`📊 モデル一致: ${modelMatched ? '✅ 成功' : '❌ 不一致'}`);

                ClaudeLogger.info('%c✅【Step 4-2-3-4】モデル選択処理完了', 'color: #4CAF50; font-weight: bold;');
                ClaudeLogger.info('─'.repeat(50));
            } else {
                ClaudeLogger.info('%c⏭️【Step 4-2-3-1】モデル選択をスキップ（設定なし）', 'color: #9E9E9E; font-style: italic;');
            }

            // ========================================
            // ステップ4: 機能選択（条件付き）
            // ========================================
            if (featureName && featureName !== '' && featureName !== '設定なし') {
                ClaudeLogger.info('%c【Step 4-2-4-1】機能選択開始', 'color: #9C27B0; font-weight: bold;');
                ClaudeLogger.info('─'.repeat(40));
                ClaudeLogger.info(`🎯 目標機能: ${featureName}`);
                ClaudeLogger.info(`🔍 Deep Research判定: ${isDeepResearch ? 'Yes' : 'No'}`);

                ClaudeLogger.info('\n🔧【Step 4-2-4-2】機能メニューアクセス開始');

                const featureMenuBtn = getFeatureElement(featureSelectors.menuButton, '機能メニューボタン');
                if (featureMenuBtn) {
                    featureMenuBtn.click();
                    await wait(1500);

                    // 機能選択前にすべてのトグルをオフにする
                    ClaudeLogger.info('\n【Step 4-2-4-3】全トグルをオフに設定');
                    await turnOffAllFeatureToggles();
                    await wait(500);

                    if (isDeepResearch) {
                        // ウェブ検索をオンにする
                        const webSearchToggle = getFeatureElement(featureSelectors.webSearchToggle, 'ウェブ検索トグル');
                        if (webSearchToggle) {
                            setToggleState(webSearchToggle, true);
                            await wait(1500);
                        }

                        // メニューを閉じる（Deep Research用）
                        ClaudeLogger.info('\n【Step 4-2-4-4】Deep Research用: メニューを閉じる');
                        featureMenuBtn.click();
                        await wait(1000);

                        // リサーチボタンを探してクリック
                        const buttons = document.querySelectorAll('button[type="button"][aria-pressed]');
                        for (const btn of buttons) {
                            const svg = btn.querySelector('svg path[d*="M8.5 2C12.0899"]');
                            if (svg) {
                                const isPressed = btn.getAttribute('aria-pressed') === 'true';
                                if (!isPressed) {
                                    btn.click();
                                    await wait(1000);
                                }
                                break;
                            }
                        }

                        // ========================================
                        // Step 4-2-4-2-2: Deep Research機能確認
                        // ========================================
                        ClaudeLogger.info('\n【Step 4-2-4-5】Deep Research機能の確認');
                        const deepResearchConfirm = confirmFeatureSelection('Deep Research');

                        if (deepResearchConfirm.deepResearch || deepResearchConfirm.webSearch) {
                            ClaudeLogger.info(`✅ Deep Research機能確認完了: [${deepResearchConfirm.detected.join(', ')}]`);
                        } else {
                            ClaudeLogger.info('⚠️ Deep Research機能の確認ができませんでしたが処理を継続します');
                        }
                    } else {
                        // その他の機能を選択
                        const toggles = document.querySelectorAll('button:has(input[role="switch"])');
                        for (const toggle of toggles) {
                            const label = toggle.querySelector('p.font-base');
                            if (label && label.textContent.trim() === featureName) {
                                setToggleState(toggle, true);
                                await wait(1000);
                                break;
                            }
                        }

                        // メニューを閉じる
                        ClaudeLogger.info('\n【Step 4-2-4-6】メニューを閉じる');
                        featureMenuBtn.click();
                        await wait(1000);
                    }
                }

                // ========================================
                // Step 4-2-4-4: 機能選択確認（新機能）
                // ========================================
                ClaudeLogger.info('\n【Step 4-2-4-7】機能選択の確認');
                const confirmationResult = confirmFeatureSelection(featureName);

                if (confirmationResult.error) {
                    ClaudeLogger.info(`⚠️ 機能確認でエラーが発生しましたが処理を継続します: ${confirmationResult.error}`);
                } else if (confirmationResult.detected.length === 0) {
                    ClaudeLogger.info('⚠️ 期待される機能ボタンが検出されませんでしたが処理を継続します');
                } else {
                    ClaudeLogger.info(`🔍 検出された機能: [${confirmationResult.detected.join(', ')}]`);
                    ClaudeLogger.info(`✅ 機能選択確認完了`);
                }

                ClaudeLogger.info('%c✅【Step 4-2-4-8】機能選択処理完了', 'color: #4CAF50; font-weight: bold;');
                ClaudeLogger.info('─'.repeat(50));
            } else {
                ClaudeLogger.info('%c⏭️【Step 4-2-4-1】機能選択をスキップ（設定なし）', 'color: #9E9E9E; font-style: italic;');
            }

            // ========================================
            // ステップ5: メッセージ送信
            // ========================================
            ClaudeLogger.info('%c【Step 4-2-5-1】メッセージ送信開始', 'color: #E91E63; font-weight: bold;');
            ClaudeLogger.info('─'.repeat(40));
            ClaudeLogger.info(`🎯 送信ボタンセレクタ: ${claudeSelectors['2_送信ボタン']}`);
            ClaudeLogger.info(`📝 送信内容長: ${prompt.length}文字`);

            ClaudeLogger.info('🔍 送信ボタンを検索中...');
            const sendResult = await findClaudeElement(claudeSelectors['2_送信ボタン']);
            if (!sendResult) {
                ClaudeLogger.error('❌ 送信ボタンが見つかりません - リトライ機能で再試行');
                ClaudeLogger.error(`🎯 検索セレクタ: ${claudeSelectors['2_送信ボタン']}`);

                const retryManager = new ClaudeRetryManager();
                const retryResult = await retryManager.executeWithRetry({
                    action: async () => {
                        const button = await findClaudeElement(claudeSelectors['2_送信ボタン']);
                        return button ? { success: true, element: button } : { success: false };
                    },
                    maxRetries: 5,
                    actionName: '送信ボタン検索',
                    context: { taskId: taskData.taskId }
                });

                if (!retryResult.success) {
                    throw new Error('送信ボタンが見つかりません');
                }
                sendResult = retryResult.result.element;
            }

            ClaudeLogger.info(`✅ 送信ボタン発見: ${sendResult.tagName}`);
            const buttonRect = sendResult.getBoundingClientRect();
            ClaudeLogger.info(`📍 送信ボタン位置: x=${Math.round(buttonRect.left)}, y=${Math.round(buttonRect.top)}`);
            ClaudeLogger.info(`📏 送信ボタンサイズ: ${Math.round(buttonRect.width)}×${Math.round(buttonRect.height)}px`);

            ClaudeLogger.info('📤 送信ボタンをクリック...');
            const clickSuccess = await clickButton(sendResult, '送信ボタン');
            if (!clickSuccess) {
                ClaudeLogger.error('❌ 送信ボタンのクリック処理に失敗 - リトライ機能で再試行');

                const retryManager = new ClaudeRetryManager();
                const retryResult = await retryManager.executeWithRetry({
                    action: async () => {
                        const success = await clickButton(sendResult, '送信ボタン');
                        return success ? { success: true } : { success: false };
                    },
                    maxRetries: 3,
                    actionName: '送信ボタンクリック',
                    context: { taskId: taskData.taskId }
                });

                if (!retryResult.success) {
                    throw new Error('送信ボタンのクリックに失敗しました');
                }
            }

            ClaudeLogger.info('✅ 送信ボタンクリック完了');

            // 送信時刻を更新（実際の送信タイミング）
            sendTime = new Date(); // 変数を更新
            ClaudeLogger.info('🔍 送信時刻記録開始 - ', sendTime.toISOString());

            // taskDataからtaskIdを取得、なければ生成
            const taskId = taskData.taskId || `Claude_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

            try {
                // Chrome拡張機能のメッセージ送信で直接記録
                if (chrome.runtime && chrome.runtime.sendMessage) {
                    await chrome.runtime.sendMessage({
                        type: 'recordSendTime',
                        taskId: taskId,
                        sendTime: sendTime.toISOString(),
                        taskInfo: {
                            aiType: 'Claude',
                            model: modelName || '不明',
                            function: featureName || '通常'
                        }
                    });
                    ClaudeLogger.info('✅ 送信時刻記録成功:', taskId, sendTime.toISOString());
                } else {
                    ClaudeLogger.warn('⚠️ Chrome runtime APIが利用できません');
                }
            } catch (error) {
                ClaudeLogger.info('❌ 送信時刻記録エラー:', error.message);
            }

            ClaudeLogger.info('✅ メッセージ送信完了');
            ClaudeLogger.info(`📤 実際の送信時刻: ${sendTime.toISOString()}`);
            ClaudeLogger.info(`⏱️ 送信処理時間: ${Date.now() - taskStartTime.getTime()}ms`);

            ClaudeLogManager.logStep('Step5-Send', 'メッセージ送信完了', {
                sendTime: sendTime.toISOString(),
                processingTime: Date.now() - taskStartTime.getTime()
            });

            ClaudeLogger.info('%c✅【Step 4-2-5-2】メッセージ送信処理完了', 'color: #4CAF50; font-weight: bold;');
            ClaudeLogger.info('─'.repeat(50));
            await wait(2000);

            // Canvas内容を保存する変数（スコープを広く）
            let finalText = '';

            // ========================================
            // ステップ6-0: Canvas V2検出チェック（リトライ機能統合）
            // ========================================
            ClaudeLogger.info('%c【Step 4-2-6-0】Canvas V2検出チェック', 'color: #FF5722; font-weight: bold;');
            ClaudeLogger.info('─'.repeat(40));

            const retryManager = new ClaudeRetryManager();
            const versionElement = document.querySelector('[data-testid="artifact-version-trigger"]');

            if (versionElement) {
                const versionText = versionElement.textContent || versionElement.innerText || '';
                ClaudeLogger.info(`🔍 検出されたバージョン表示: "${versionText}"`);

                // V2以上を検出した場合
                if (versionText.includes('v2') || versionText.includes('v3') ||
                    versionText.includes('v4') || versionText.includes('v5') ||
                    /v([2-9]|\d{2,})/.test(versionText)) {

                    ClaudeLogger.info('🚨 Canvas無限更新を検出しました - 10回リトライシステム開始');
                    ClaudeLogger.info(`   - 検出バージョン: ${versionText}`);
                    ClaudeLogger.info(`   - タスクID: ${taskData.taskId || 'unknown'}`);
                    ClaudeLogger.info(`   - リトライ間隔: 5秒→10秒→1分→5分→10分→15分→30分→1時間→2時間`);

                    const retryResult = await retryManager.executeWithRetry({
                        taskId: taskData.taskId || taskId,
                        prompt: taskData.prompt || prompt,
                        enableDeepResearch: taskData.enableDeepResearch || isDeepResearch,
                        specialMode: taskData.specialMode || null
                    });

                    if (retryResult) {
                        return retryResult;
                    }
                    // retryResultがnullの場合は通常処理を継続（初回実行）
                } else {
                    ClaudeLogger.info(`✅ 正常なバージョン: ${versionText} - 通常処理を継続`);
                }
            } else {
                ClaudeLogger.info('ℹ️ バージョン表示要素が見つかりません（通常の応答）');
            }

            ClaudeLogger.info('%c✅【Step 4-2-6-0】Canvas V2検出チェック完了', 'color: #4CAF50; font-weight: bold;');
            ClaudeLogger.info('─'.repeat(50));

            // ========================================
            // ステップ6: 応答待機（Deep Research/通常）
            // ========================================
            ClaudeLogger.info('%c【Step 4-2-6-1】応答待機開始', 'color: #607D8B; font-weight: bold;');
            const waitStartTime = Date.now();

            if (isDeepResearch) {
                ClaudeLogger.info('🔬【Step 4-2-6-2】Deep Research専用待機処理');
                ClaudeLogger.info('─'.repeat(40));
                ClaudeLogger.info('⏱️ 最大待機時間: 40分');
                ClaudeLogger.info('🎯 監視対象: Canvas機能、プレビューボタン、停止ボタン');
                await handleDeepResearchWait();
            } else {
                // ========================================
                // ステップ6-2: 通常応答待機
                // ========================================
                ClaudeLogger.info('📝【Step 4-2-6-3】通常応答待機（停止ボタン監視）');
                ClaudeLogger.info('─'.repeat(40));
                ClaudeLogger.info(`⏱️ 最大待機時間: ${Math.round(AI_WAIT_CONFIG.STOP_BUTTON_INITIAL_WAIT / 60000)}分`);
                ClaudeLogger.info('🎯 監視対象: 回答停止ボタン');

                let stopButtonFound = false;
                let waitCount = 0;
                const maxInitialWait = AI_WAIT_CONFIG.STOP_BUTTON_INITIAL_WAIT / 1000;

                while (!stopButtonFound && waitCount < maxInitialWait) {
                    const stopResult = await findClaudeElement(claudeSelectors['3_回答停止ボタン'], 3, true);

                    if (stopResult) {
                        stopButtonFound = true;
                        ClaudeLogger.info(`✓ 停止ボタンが出現（${waitCount}秒後）`);
                        break;
                    }

                    await wait(1000);
                    waitCount++;

                    if (waitCount % 5 === 0) {
                        ClaudeLogger.info(`  応答生成中... ${waitCount}秒経過`);
                    }
                }

                if (stopButtonFound) {
                    ClaudeLogger.info('\n停止ボタンが消えるまで待機中...');
                    const deepResearchSelectors = getDeepResearchSelectors();
                    let stopButtonGone = false;
                    let isCanvasMode = false;
                    waitCount = 0;
                    const maxDisappearWait = AI_WAIT_CONFIG.MAX_WAIT / 1000;

                    while (!stopButtonGone && waitCount < maxDisappearWait) {
                        // 待機中の文字数カウント（10秒ごと）
                        if (waitCount % 10 === 0 && waitCount > 0) {
                            // Canvasテキストをチェック
                            const canvasElement = await findClaudeElement(deepResearchSelectors['4_Canvas機能テキスト位置'], 1, true);
                            if (canvasElement) {
                                const canvasTextLength = canvasElement.textContent ? canvasElement.textContent.trim().length : 0;
                                ClaudeLogger.info(`  📈 Canvasテキスト: ${canvasTextLength}文字`);
                                ClaudeLogManager.logStep('Progress-Canvas', `Canvas文字数: ${canvasTextLength}文字`, {
                                    charCount: canvasTextLength,
                                    time: waitCount
                                });
                            }

                            // 通常テキストをチェック
                            const normalElement = await findClaudeElement(deepResearchSelectors['5_通常処理テキスト位置'], 1, true);
                            if (normalElement) {
                                const normalTextLength = normalElement.textContent ? normalElement.textContent.trim().length : 0;
                                ClaudeLogger.info(`  📈 通常テキスト: ${normalTextLength}文字`);
                                ClaudeLogManager.logStep('Progress-Normal', `通常文字数: ${normalTextLength}文字`, {
                                    charCount: normalTextLength,
                                    time: waitCount
                                });
                            }
                        }

                        // Canvas処理は停止ボタン消滅後に実行

                        // 停止ボタンの状態をチェック
                        const stopResult = await findClaudeElement(claudeSelectors['3_回答停止ボタン'], 2, true);

                        if (!stopResult) {
                            // 10秒間確認
                            let stillGone = true;
                            for (let confirmCount = 0; confirmCount < 10; confirmCount++) {
                                await wait(1000);
                                const reconfirmResult = await findClaudeElement(claudeSelectors['3_回答停止ボタン'], 2, true);
                                if (reconfirmResult) {
                                    stillGone = false;
                                    ClaudeLogger.info(`  停止ボタン再出現（${confirmCount + 1}秒後）`);
                                    break;
                                }
                            }

                            if (stillGone) {
                                stopButtonGone = true;
                                ClaudeLogger.info(`✓ 応答生成完了（${waitCount}秒後）`);

                                // ウィンドウ状態確認（Content Scriptでは利用不可）
                                // chrome.windows APIはContent Script環境では利用できないためコメントアウト
                                // ClaudeLogger.info('🔍 [Claude] ウィンドウ状態確認はスキップ（Content Script制限）');

                                // 停止ボタン消滅後の3秒待機
                                ClaudeLogger.info('⏳ 停止ボタン消滅後の3秒待機中...');
                                await wait(3000);
                                break;
                            }
                        }

                        await wait(1000);
                        waitCount++;

                        if (waitCount % 10 === 0) {
                            ClaudeLogger.info(`  生成中... ${Math.floor(waitCount/60)}分${waitCount%60}秒経過`);
                        }
                    }
                }
            }

            const waitEndTime = Date.now();
            const totalWaitTime = Math.round((waitEndTime - waitStartTime) / 1000);
            ClaudeLogger.info(`⏱️ 応答待機総時間: ${totalWaitTime}秒`);
            ClaudeLogger.info('%c✅【Step 4-2-6-4】応答待機処理完了', 'color: #4CAF50; font-weight: bold;');
            ClaudeLogger.info('─'.repeat(50));

            // 応答完了後の追加待機とウィンドウ状態確認
            await wait(3000);

            // ウィンドウ存在確認（Content Scriptでは利用不可）
            // chrome.windows APIはContent Script環境では利用できないためコメントアウト
            // ClaudeLogger.info('🔍 [Claude] ウィンドウ状態確認はスキップ（Content Script制限）');

            // ========================================
            // ステップ6-4-1: Canvasプレビューボタンチェック
            // ========================================
            ClaudeLogger.info('%c【Step 4-2-6-4-1】Canvasプレビューボタンの存在確認', 'color: #9C27B0; font-weight: bold;');
            ClaudeLogger.info('─'.repeat(40));

            const deepResearchSelectors = getDeepResearchSelectors();
            const previewButton = await findClaudeElement(deepResearchSelectors['4_4_Canvasプレビューボタン'], 3, true);

            if (previewButton) {
                ClaudeLogger.info('✓ Canvasプレビューボタンを発見、クリック中...');

                // クリック前のウィンドウ状態確認（Content Scriptでは利用不可）
                // chrome.windows APIはContent Script環境では利用できないためコメントアウト

                previewButton.click();

                // Canvas表示を3秒間待機
                ClaudeLogger.info('⏳ Canvas表示を3秒間待機中...');
                await wait(3000);

                // クリック後のウィンドウ状態確認（Content Scriptでは利用不可）
                // chrome.windows APIはContent Script環境では利用できないためコメントアウト

                // Canvas内容の確認
                const canvasContent = await findClaudeElement(deepResearchSelectors['4_Canvas機能テキスト位置'], 2, true);
                if (canvasContent) {
                    ClaudeLogger.info('✅ Canvas内容が表示されました');
                    ClaudeLogger.info(`   - 要素ID: ${canvasContent.id || '(なし)'}`);
                    ClaudeLogger.info(`   - テキスト長: ${canvasContent.textContent ? canvasContent.textContent.trim().length : 0}文字`);
                } else {
                    ClaudeLogger.info('⚠️ Canvas内容が検出されませんでした');
                }
            } else {
                ClaudeLogger.info('ℹ️ Canvasプレビューボタンは検出されませんでした（通常の回答のみ）');
            }

            // ========================================
            // ステップ6-5: 「続ける」ボタンチェック
            // ========================================
            ClaudeLogger.info('%c【Step 4-2-6-5】「続ける」ボタンの存在確認', 'color: #607D8B; font-weight: bold;');
            ClaudeLogger.info('─'.repeat(40));
            const continueButton = await findClaudeElement(deepResearchSelectors['4_3_Canvas続けるボタン'], 3, true);

            if (continueButton) {
                ClaudeLogger.info('✓「続ける」ボタンを発見、クリック中...');

                // 「続ける」ボタンクリック前のウィンドウ状態確認
                try {
                    const currentWindow = await chrome.windows.getCurrent();
                    ClaudeLogger.info('🔍 [Claude] 「続ける」ボタンクリック前のウィンドウ状態:', {
                        windowId: currentWindow.id,
                        state: currentWindow.state,
                        timestamp: new Date().toISOString()
                    });
                } catch (windowError) {
                    ClaudeLogger.error('⚠️ [Claude] 「続ける」ボタンクリック前のウィンドウエラー:', windowError);
                }

                continueButton.click();
                await wait(2000);

                // 「続ける」ボタンクリック後のウィンドウ状態確認
                try {
                    const currentWindow = await chrome.windows.getCurrent();
                    ClaudeLogger.info('🔍 [Claude] 「続ける」ボタンクリック後のウィンドウ状態:', {
                        windowId: currentWindow.id,
                        state: currentWindow.state,
                        timestamp: new Date().toISOString()
                    });
                } catch (windowError) {
                    ClaudeLogger.error('🚨 [Claude] 「続ける」ボタンクリック後のウィンドウエラー:', {
                        error: windowError.message,
                        timestamp: new Date().toISOString(),
                        action: '「続ける」ボタンクリック後'
                    });
                }

                // 新しい応答サイクルの応答待機を実行
                ClaudeLogger.info('🔄 新しい応答サイクルの停止ボタン出現を待機中...');
                let stopButtonFound = false;
                let waitCount = 0;
                const maxWait = 30; // 30秒まで待機

                while (!stopButtonFound && waitCount < maxWait) {
                    // このループ中でもウィンドウ状態を監視
                    if (waitCount % 5 === 0 && waitCount > 0) {
                        try {
                            const currentWindow = await chrome.windows.getCurrent();
                            ClaudeLogger.info(`🔍 [Claude] 「続ける」処理中のウィンドウ状態 (${waitCount}秒):`, {
                                windowId: currentWindow.id,
                                state: currentWindow.state,
                                focused: currentWindow.focused
                            });
                        } catch (windowError) {
                            ClaudeLogger.error('🚨 [Claude] 「続ける」処理中のウィンドウエラー:', {
                                error: windowError.message,
                                waitTime: waitCount,
                                timestamp: new Date().toISOString()
                            });
                        }
                    }

                    const stopResult = await findClaudeElement(deepResearchSelectors['3_回答停止ボタン'], 2, true);
                    if (stopResult) {
                        stopButtonFound = true;
                        ClaudeLogger.info(`✓ 回答停止ボタンが出現（${waitCount}秒後）`);
                        break;
                    }
                    await wait(1000);
                    waitCount++;
                }

                // 回答停止ボタンが消滅するまで待機
                if (stopButtonFound) {
                    ClaudeLogger.info('🔄 継続応答完了まで待機中...');
                    while (waitCount < 600) { // 最大10分待機
                        const stopResult = await findClaudeElement(deepResearchSelectors['3_回答停止ボタン'], 2, true);
                        if (!stopResult) {
                            // 10秒間確認
                            let stillGone = true;
                            for (let confirmCount = 0; confirmCount < 10; confirmCount++) {
                                await wait(1000);
                                const reconfirmResult = await findClaudeElement(deepResearchSelectors['3_回答停止ボタン'], 2, true);
                                if (reconfirmResult) {
                                    stillGone = false;
                                    ClaudeLogger.info(`  停止ボタン再出現（${confirmCount + 1}秒後）`);
                                    break;
                                }
                            }

                            if (stillGone) {
                                ClaudeLogger.info('✓ 継続応答生成完了');
                                // 停止ボタン消滅後の3秒待機
                                ClaudeLogger.info('⏳ 停止ボタン消滅後の3秒待機中...');
                                await wait(3000);
                                break;
                            }
                        }
                        await wait(1000);
                        waitCount++;
                    }
                }

                ClaudeLogger.info('%c✅【Step 4-2-6-5】「続ける」ボタン処理完了', 'color: #4CAF50; font-weight: bold;');
                await wait(2000); // 追加待機
            } else {
                ClaudeLogger.info('「続ける」ボタンは見つかりませんでした。次のステップに進みます。');
                ClaudeLogger.info('%c✅【Step 4-2-6-5】「続ける」ボタンチェック完了', 'color: #4CAF50; font-weight: bold;');
            }

            // ========================================
            // ステップ7: テキスト取得
            // ========================================
            ClaudeLogger.info('%c【Step 4-2-7-1】テキスト取得処理開始', 'color: #3F51B5; font-weight: bold;');
            ClaudeLogger.info('─'.repeat(40));
            ClaudeLogger.info('🎯 取得対象: Canvas機能、通常応答テキスト');

            // テキスト取得前のウィンドウ状態確認（Content Scriptでは利用不可）
            // chrome.windows APIはContent Script環境では利用できないためコメントアウト

            // Canvas処理後の最終テキスト取得（応答完了後に再取得）
            ClaudeLogger.info(`🔍 最終テキスト取得開始 - 現在のfinalText: ${finalText ? finalText.length + '文字' : 'なし'}`);

            // Canvas機能のテキストを優先的に最終取得
            let canvasResult = null;
            try {
                canvasResult = await findClaudeElement(deepResearchSelectors['4_Canvas機能テキスト位置'], 5, true);
            } catch (canvasError) {
                ClaudeLogger.error('⚠️ [Claude] Canvasテキスト取得エラー:', {
                    error: canvasError.message,
                    timestamp: new Date().toISOString()
                });
            }

            if (canvasResult) {
                ClaudeLogger.info('🎨 Canvas機能の最終テキストを取得中...');
                ClaudeLogger.info('🚫 【Step 4-2-7-1】プロンプト除外機能を適用してテキスト取得');
                const textInfo = getTextPreview(canvasResult);
                if (textInfo && textInfo.full && textInfo.full.length > 100) {
                    finalText = textInfo.full;
                    ClaudeLogger.info(`📄 Canvas 最終テキスト取得完了 (${textInfo.length}文字)`);
                    ClaudeLogger.info('✅ 【Step 4-2-7-2】プロンプト除外完了 - 純粋なAI応答を取得');
                    ClaudeLogger.info('プレビュー:\n', textInfo.preview.substring(0, 200) + '...');
                }
            }

            // Canvas以外の処理（通常テキストのフォールバック）
            if (!finalText) {
                ClaudeLogger.info('🔍 Canvas以外のテキストを確認中...');
                const deepResearchSelectors = getDeepResearchSelectors();

                // 通常のテキストを確認（Canvasが見つからない場合のフォールバック）
                const normalResult = await findClaudeElement(deepResearchSelectors['5_通常処理テキスト位置'], 3, true);
                if (normalResult) {
                    ClaudeLogger.info('✓ 通常処理のテキストを検出');
                    ClaudeLogger.info('🚫 【Step 4-2-7-3】プロンプト除外機能を適用してテキスト取得（通常応答）');
                    const textInfo = getTextPreview(normalResult);
                    if (textInfo && textInfo.full) {
                        finalText = textInfo.full;
                        ClaudeLogger.info(`📄 通常 テキスト取得完了 (${textInfo.length}文字)`);
                        ClaudeLogger.info('✅ 【Step 4-2-7-4】プロンプト除外完了 - 純粋なAI応答を取得');
                        ClaudeLogger.info('プレビュー:\n', textInfo.preview.substring(0, 200) + '...');
                    }
                }
            }

            // finalTextの確実な初期化
            if (!finalText || finalText.trim() === '') {
                ClaudeLogger.warn('⚠️ テキストが取得できませんでした');
                finalText = 'テキスト取得失敗';
            }

            ClaudeLogger.info('%c✅【Step 4-2-7-2】テキスト取得処理完了', 'color: #4CAF50; font-weight: bold;');
            ClaudeLogger.info(`📊 最終取得文字数: ${finalText.length}文字`);
            ClaudeLogger.info('─'.repeat(50));

            ClaudeLogger.info('\n' + '='.repeat(60));
            ClaudeLogger.info('%c✨ Claude V2 タスク完了', 'color: #4CAF50; font-weight: bold; font-size: 16px');
            ClaudeLogger.info('='.repeat(60));

            const totalExecutionTime = Date.now() - taskStartTime.getTime();
            ClaudeLogger.info('📈 タスク実行サマリー:');
            ClaudeLogger.info(`  ├─ 総実行時間: ${Math.round(totalExecutionTime / 1000)}秒`);
            ClaudeLogger.info(`  ├─ 入力文字数: ${prompt.length}文字`);
            ClaudeLogger.info(`  ├─ 出力文字数: ${finalText.length}文字`);
            ClaudeLogger.info(`  ├─ 使用モデル: ${modelName || '未指定'}`);
            ClaudeLogger.info(`  ├─ 使用機能: ${featureName || '通常'}`);
            ClaudeLogger.info(`  └─ 送信時刻: ${sendTime.toISOString()}`);

            const result = {
                success: true,
                result: {  // ai-task-executor.jsが期待するネスト構造
                    response: finalText,
                    status: 'success'
                },
                response: finalText,  // 後方互換性のため
                text: finalText,
                model: modelName,
                function: featureName,
                sendTime: sendTime,
                url: window.location.href,
                cellInfo: taskData.cellInfo
            };

            // タスク完了をログに記録
            ClaudeLogManager.completeTask(result);
            ClaudeLogManager.logStep('Step7-Complete', 'タスク正常完了', {
                responseLength: finalText ? finalText.length : 0,
                responsePreview: finalText ? (finalText.substring(0, 100) + '...') : 'テキスト取得失敗',
                model: modelName,
                function: featureName,
                cellInfo: taskData.cellInfo
            });

            // 実際の表示情報を取得（ChatGPT/Geminiと同様）
            let displayedModel = '';
            let displayedFunction = '';

            try {
                // 実際のモデル情報を取得
                displayedModel = getCurrentModelInfo() || '';
                ClaudeLogger.info(`📊 [Claude-Direct] 実際のモデル: "${displayedModel}"`);

                // 実際の機能情報を取得
                const functionConfirmation = confirmFeatureSelection(featureName);
                displayedFunction = functionConfirmation.detected.join(', ') || '';
                ClaudeLogger.info(`📊 [Claude-Direct] 実際の機能: "${displayedFunction}"`);
            } catch (infoError) {
                ClaudeLogger.warn(`⚠️ [Claude-Direct] 表示情報取得エラー: ${infoError.message}`);
            }

            // 統合フロー用にresultオブジェクトを拡張（ChatGPT/Geminiと同じ形式）
            // sendTime = new Date(); // この行は削除 - sendTimeは送信時に既に設定済み
            result.displayedModel = displayedModel;
            result.displayedFunction = displayedFunction;
            result.sendTime = sendTime;  // 既存の送信時刻を使用

            ClaudeLogger.info('✅ [Claude-Unified] タスク完了 - 統合フローでDropbox→スプレッドシートの順序で処理します', {
                sendTime: sendTime.toISOString(),
                taskId: taskData.cellInfo,
                displayedModel: displayedModel,
                displayedFunction: displayedFunction
            });

            // リトライマネージャーの統計情報をログに記録
            try {
                const retryManager = new ClaudeRetryManager();
                const metrics = retryManager.getMetrics();
                if (metrics.totalAttempts > 0) {
                    ClaudeLogger.info('📊 [Claude-Metrics] リトライ統計:', metrics);
                    ClaudeLogManager.logStep('Task-Metrics', 'リトライマネージャー統計', metrics);
                }
            } catch (metricsError) {
                ClaudeLogger.warn('⚠️ メトリクス取得エラー:', metricsError.message);
            }

            return result;

        } catch (error) {
            ClaudeLogger.error('❌ [ClaudeV2] タスク実行エラー:', error.message);
            ClaudeLogger.error('スタックトレース:', error.stack);

            const result = {
                success: false,
                error: error.message,
                text: 'エラーが発生しました: ' + error.message
            };

            // リトライマネージャーで最終リトライを実行
            ClaudeLogger.info('🔄 内蔵リトライマネージャーでエラー復旧を試行中...');
            const retryManager = new ClaudeRetryManager();

            const retryResult = await retryManager.executeWithRetry({
                action: async () => {
                    // タスクを再実行
                    return await executeClaude(taskData);
                },
                maxRetries: 2,
                actionName: 'Claude全体タスク最終リトライ',
                context: {
                    taskId: taskData.taskId,
                    originalError: error.message,
                    errorType: error.name
                },
                successValidator: (result) => result && result.success === true
            });

            if (retryResult.success) {
                ClaudeLogger.info('✅ リトライマネージャーでタスク復旧成功');

                // 復旧成功のログ記録
                ClaudeLogManager.logStep('Error-Recovery', 'リトライマネージャーによる復旧成功', {
                    originalError: error.message,
                    retryCount: retryResult.retryCount,
                    executionTime: retryResult.executionTime
                });

                return retryResult.result;
            }

            const finalResult = {
                success: false,
                error: error.message,
                text: 'エラーが発生しました: ' + error.message,
                needsRetry: true,
                retryReason: 'CLAUDE_AUTOMATION_ERROR'
            };

            // エラーをログに記録（詳細情報付き）
            ClaudeLogManager.logError('Task-Error', error, {
                taskData,
                errorMessage: error.message,
                errorStack: error.stack,
                errorName: error.name,
                retryAttempted: true,
                retryCount: retryResult.retryCount,
                retryMetrics: retryManager.getMetrics(),
                currentStep: (ClaudeLogManager.logs && ClaudeLogManager.logs.length > 0) ? ClaudeLogManager.logs[ClaudeLogManager.logs.length - 1]?.step : 'unknown',
                timestamp: new Date().toISOString(),
                userAgent: navigator.userAgent,
                url: window.location.href
            });
            ClaudeLogManager.completeTask(finalResult);

            return finalResult;
        }
    }

    // ========================================
    // フェーズ別実行関数（個別処理用）
    // ========================================

    async function inputTextOnly(text) {
        ClaudeLogger.info('【Phase】テキスト入力のみ実行');

        try {
            const retryManager = new ClaudeRetryManager();
            const inputResult = await retryManager.executeWithRetry({
                action: async () => {
                    const input = await findClaudeElement(claudeSelectors['1_テキスト入力欄']);
                    if (input) {
                        const success = await inputText(input, text);
                        return { success: true, result: success };
                    }
                    return { success: false };
                },
                maxRetries: 3,
                actionName: 'テキスト入力(個別処理)',
                context: { textLength: text.length }
            });

            return { success: inputResult.success, phase: 'input' };
        } catch (error) {
            ClaudeLogger.error('❌ テキスト入力エラー:', error.message);
            return { success: false, phase: 'input', error: error.message };
        }
    }

    async function selectModelOnly(modelName) {
        ClaudeLogger.info('【Phase】モデル選択のみ実行');

        try {
            if (!modelName || modelName === '' || modelName === '設定なし') {
                return { success: true, phase: 'model', skipped: true };
            }

            const retryManager = new ClaudeRetryManager();
            const modelResult = await retryManager.executeWithRetry({
                action: async () => {
                    const menuButton = await findElementByMultipleSelectors(modelSelectors.menuButton, 'モデル選択ボタン');
                    await triggerReactEvent(menuButton);
                    await wait(2000);

                    const targetModelName = modelName.startsWith('Claude') ? modelName : `Claude ${modelName}`;

                    const menuItems = document.querySelectorAll('[role="menuitem"]');
                    for (const item of menuItems) {
                        const itemText = item.textContent;
                        if (itemText && itemText.includes(targetModelName)) {
                            await triggerReactEvent(item, 'click');
                            await wait(1500);
                            return { success: true, selected: targetModelName };
                        }
                    }
                    return { success: false };
                },
                maxRetries: 3,
                actionName: 'モデル選択(個別処理)',
                context: { modelName }
            });

            return { success: modelResult.success, phase: 'model', selected: modelResult.result?.selected };
        } catch (error) {
            ClaudeLogger.error('❌ モデル選択エラー:', error.message);
            return { success: false, phase: 'model', error: error.message };
        }
    }

    async function selectFunctionOnly(featureName) {
        ClaudeLogger.info('【Phase】機能選択のみ実行');

        try {
            if (!featureName || featureName === '' || featureName === '設定なし') {
                return { success: true, phase: 'function', skipped: true };
            }

            const retryManager = new ClaudeRetryManager();
            const functionResult = await retryManager.executeWithRetry({
                action: async () => {
                    const featureMenuBtn = getFeatureElement(featureSelectors.menuButton, '機能メニューボタン');
                    if (!featureMenuBtn) {
                        return { success: false };
                    }

                    featureMenuBtn.click();
                    await wait(1500);

                    // 機能選択前にすべてのトグルをオフにする
                    ClaudeLogger.info('【Phase】全トグルをオフに設定');
                    await turnOffAllFeatureToggles();
                    await wait(500);

                    // 指定の機能を有効にする
                    const toggles = document.querySelectorAll('button:has(input[role="switch"])');
                    for (const toggle of toggles) {
                        const label = toggle.querySelector('p.font-base');
                        if (label && label.textContent.trim() === featureName) {
                            setToggleState(toggle, true);
                            await wait(1000);
                            return { success: true, selected: featureName };
                        }
                    }
                    return { success: true, selected: featureName };
                },
                maxRetries: 3,
                actionName: '機能選択(個別処理)',
                context: { featureName }
            });

            return { success: functionResult.success, phase: 'function', selected: functionResult.result?.selected };
        } catch (error) {
            ClaudeLogger.error('❌ 機能選択エラー:', error.message);
            return { success: false, phase: 'function', error: error.message };
        }
    }

    async function sendAndGetResponse(isDeepResearch = false) {
        ClaudeLogger.info('【Phase】送信と応答取得実行');

        try {
            const retryManager = new ClaudeRetryManager();
            const sendResponseResult = await retryManager.executeWithRetry({
                action: async () => {
                    // 送信
                    const sendResult = await findClaudeElement(claudeSelectors['2_送信ボタン']);
                    if (!sendResult) {
                        return { success: false };
                    }

                    await clickButton(sendResult, '送信ボタン');
                    await wait(2000);

                    // 応答待機
                    if (isDeepResearch) {
                        await handleDeepResearchWait();
                    } else {
                        // 通常の応答待機処理
                        let stopButtonFound = false;
                        let waitCount = 0;
                        const maxWait = AI_WAIT_CONFIG.MAX_WAIT / 1000;

                        while (!stopButtonFound && waitCount < maxWait) {
                            const stopResult = await findClaudeElement(claudeSelectors['3_回答停止ボタン'], 2, true);
                            if (stopResult) {
                                stopButtonFound = true;
                                break;
                            }
                            await wait(1000);
                            waitCount++;
                        }

                        // 停止ボタンが消えるまで待機
                        if (stopButtonFound) {
                            while (waitCount < maxWait) {
                                const stopResult = await findClaudeElement(claudeSelectors['3_回答停止ボタン'], 2, true);
                                if (!stopResult) break;
                                await wait(1000);
                                waitCount++;
                            }
                        }
                    }

                    // テキスト取得
                    await wait(3000);
                    let finalText = '';

                    const deepResearchSelectors = getDeepResearchSelectors();
                    const canvasResult = await findClaudeElement(deepResearchSelectors['4_Canvas機能テキスト位置'], 3, true);

                    if (canvasResult) {
                        const textInfo = getTextPreview(canvasResult);
                        if (textInfo) finalText = textInfo.full;
                    }

                    if (!finalText) {
                        const normalResult = await findClaudeElement(deepResearchSelectors['5_通常処理テキスト位置'], 3, true);
                        if (normalResult) {
                            const textInfo = getTextPreview(normalResult);
                            if (textInfo) finalText = textInfo.full;
                        }
                    }

                    return { success: true, text: finalText };
                },
                maxRetries: 3,
                actionName: '送信・応答取得(個別処理)',
                context: { isDeepResearch },
                isSuccess: (result) => result && result.success && result.text && result.text.length > 0
            });

            return {
                success: sendResponseResult.success,
                phase: 'send',
                text: sendResponseResult.success ? sendResponseResult.result.text : ''
            };

        } catch (error) {
            ClaudeLogger.error('❌ [ClaudeV2] 送信・応答取得エラー:', error.message);
            return { success: false, error: error.message };
        }
    }

    // ========================================
    // runAutomation関数（後方互換性）
    // ========================================
    async function runAutomation(config) {
        return executeTask({
            model: config.model,
            function: config.function,
            prompt: config.text || config.prompt
        });
    }

    // ========================================
    // Chrome Runtime Message Handler (詳細ログ版)
    // ========================================
    ClaudeLogger.info('📝 [ClaudeAutomation] メッセージリスナー登録開始:', {
        登録時刻: new Date().toISOString(),
        スクリプト初期化時刻: window.CLAUDE_SCRIPT_INIT_TIME ? new Date(window.CLAUDE_SCRIPT_INIT_TIME).toISOString() : '未設定',
        初期化マーカー: window.CLAUDE_SCRIPT_LOADED,
        chromeオブジェクト: typeof chrome !== 'undefined',
        runtimeオブジェクト: typeof chrome?.runtime !== 'undefined'
    });

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        const messageReceiveTime = Date.now();
        const requestId = Math.random().toString(36).substring(2, 8);

        ClaudeLogger.info(`📬 [ClaudeAutomation] メッセージ受信 [ID:${requestId}]:`, {
            メッセージタイプ: request.type,
            メッセージ全体: request,
            送信者: {
                タブID: sender.tab?.id,
                URL: sender.tab?.url,
                タイトル: sender.tab?.title
            },
            受信時刻: new Date().toISOString()
        });

        // Claude専用のメッセージのみ処理
        if (request.type === 'CLAUDE_EXECUTE_TASK') {
            ClaudeLogger.info(`🎯 [ClaudeAutomation] CLAUDE_EXECUTE_TASK処理開始 [ID:${requestId}]:`, {
                タスクID: request.taskData?.taskId,
                タスクデータ構造: request.taskData ? Object.keys(request.taskData) : 'なし',
                プロンプト長: request.taskData?.prompt?.length || 0,
                モデル: request.taskData?.model,
                機能: request.taskData?.function,
                処理開始時刻: new Date().toISOString()
            });

            // sendResponseコールバックの状態追跡
            let responseCallbackCalled = false;
            const wrappedSendResponse = (response) => {
                if (responseCallbackCalled) {
                    ClaudeLogger.warn(`⚠️ [ClaudeAutomation] 重複レスポンス試行 [ID:${requestId}]:`, response);
                    return;
                }
                responseCallbackCalled = true;
                const responseTime = Date.now() - messageReceiveTime;
                ClaudeLogger.info(`📤 [ClaudeAutomation] レスポンス送信 [ID:${requestId}]:`, {
                    処理時間: `${responseTime}ms`,
                    成功: response.success,
                    レスポンス構造: Object.keys(response),
                    エラー: response.error,
                    送信時刻: new Date().toISOString()
                });
                sendResponse(response);
            };

            ClaudeLogger.info(`🚀 [ClaudeAutomation] executeTask実行開始 [ID:${requestId}]`);

            // 非同期処理のため、即座にtrueを返してチャネルを開いておく
            executeTask(request.taskData).then(result => {
                ClaudeLogger.info(`✅ [ClaudeAutomation] executeTask成功 [ID:${requestId}]:`, {
                    結果構造: result ? Object.keys(result) : 'なし',
                    成功: result?.success,
                    レスポンス長: result?.response?.length || 0,
                    結果詳細: result
                });
                wrappedSendResponse({ success: true, result });
            }).catch(error => {
                ClaudeLogger.error(`❌ [ClaudeAutomation] executeTask失敗 [ID:${requestId}]:`, {
                    エラー名: error.name,
                    エラーメッセージ: error.message,
                    エラースタック: error.stack?.substring(0, 500),
                    エラー全体: error
                });
                wrappedSendResponse({ success: false, error: error.message });
            });

            ClaudeLogger.info(`🔄 [ClaudeAutomation] 非同期チャネル保持 [ID:${requestId}] - trueを返します`);
            return true; // 非同期レスポンスのためチャネルを保持
        } else if (request.type === 'CLAUDE_CHECK_READY') {
            ClaudeLogger.info(`🔍 [ClaudeAutomation] CLAUDE_CHECK_READY処理 [ID:${requestId}]`);
            // スクリプトの準備状態を確認
            const readyResponse = {
                ready: true,
                initTime: Date.now(),
                methods: ['executeTask', 'runAutomation', 'inputTextOnly', 'selectModelOnly', 'selectFunctionOnly', 'sendAndGetResponse']
            };
            ClaudeLogger.info(`✅ [ClaudeAutomation] READYレスポンス [ID:${requestId}]:`, readyResponse);
            sendResponse(readyResponse);
            return false;
        }

        ClaudeLogger.info(`🚀 [ClaudeAutomation] 非対応メッセージ [ID:${requestId}] - content-script-consolidated.jsに委譲:`, {
            メッセージタイプ: request.type,
            処理結果: 'falseを返して他に委譲'
        });
        // Claude専用のメッセージでない場合は何もしない
        // （content-script-consolidated.jsに処理を委譲）
        return false;
    });

    ClaudeLogger.info('✅ [ClaudeAutomation] メッセージリスナー登録完了:', {
        登録完了時刻: new Date().toISOString(),
        処理対象: ['CLAUDE_EXECUTE_TASK', 'CLAUDE_CHECK_READY'],
        リスナー状態: 'アクティブ'
    });

    // 初期化完了マーカーを設定（ai-task-executorが期待する名前を使用）
    const initCompleteTime = Date.now();
    window.CLAUDE_SCRIPT_LOADED = true;
    window.CLAUDE_SCRIPT_INIT_TIME = initCompleteTime;

    const initDuration = initCompleteTime - scriptLoadTime;

    ClaudeLogger.info('✅ [Claude初期化DEBUG] スクリプト初期化完了:', {
        初期化完了時刻: new Date(initCompleteTime).toISOString(),
        初期化時間: `${initDuration}ms`,
        マーカー状態: {
            CLAUDE_SCRIPT_LOADED: window.CLAUDE_SCRIPT_LOADED,
            CLAUDE_SCRIPT_INIT_TIME: window.CLAUDE_SCRIPT_INIT_TIME
        },
        利用可能機能: {
            executeTask: typeof executeTask !== 'undefined',
            runAutomation: typeof runAutomation !== 'undefined',
            UI_SELECTORS: typeof UI_SELECTORS !== 'undefined'
        },
        メッセージリスナー: '登録済み'
    });

    ClaudeLogger.info('✅ Claude Automation V2 準備完了（メッセージベース通信）');
    ClaudeLogger.info('使用方法: Chrome Runtime Message経由でタスクを実行');

    // 初期化完了を知らせるカスタムイベントを発行
    window.dispatchEvent(new CustomEvent('claudeAutomationReady', {
        detail: {
            initTime: initCompleteTime,
            loadDuration: initDuration,
            version: 'V2'
        }
    }));

    ClaudeLogger.info('📡 [Claude初期化DEBUG] claudeAutomationReadyイベント発行完了');

    // ========================================
    // ウィンドウ終了時のログ保存処理
    // ========================================
    window.addEventListener('beforeunload', async (event) => {
        ClaudeLogger.info('🔄 [ClaudeAutomation] ウィンドウ終了検知 - ログ保存開始');

        try {
            // ログをファイルに保存
            const fileName = await ClaudeLogManager.saveToFile();
            if (fileName) {
                ClaudeLogger.info(`✅ [ClaudeAutomation] ログ保存完了: ${fileName}`);
            }
        } catch (error) {
            ClaudeLogger.error('[ClaudeAutomation] ログ保存エラー:', error);
        }
    });

    // グローバルにログマネージャーを公開（デバッグ用）
    window.ClaudeLogManager = ClaudeLogManager;

    // Claude Automation オブジェクトをグローバルに公開
    ClaudeLogger.info('🔧 [DEBUG] ClaudeAutomation定義前の状態:', {
        windowClaudeAutomation: typeof window.ClaudeAutomation,
        executeTask: typeof executeTask,
        runAutomation: typeof runAutomation,
        スクリプトエラー: 'なし',
        正常ロード: true
    });

    window.ClaudeAutomation = {
        executeTask: executeTask,
        runAutomation: runAutomation,
        version: 'V2',
        initTime: initCompleteTime,
        isReady: true,
        loadedAt: new Date().toISOString()
    };

    // デバッグ: 登録確認
    ClaudeLogger.info('✅ [DEBUG] window.ClaudeAutomation登録完了:', {
        定義済み: !!window.ClaudeAutomation,
        executeTask存在: typeof window.ClaudeAutomation?.executeTask === 'function',
        runAutomation存在: typeof window.ClaudeAutomation?.runAutomation === 'function'
    });

    ClaudeLogger.info('🌍 [Claude] window.ClaudeAutomation オブジェクト公開完了:', {
        executeTask: typeof window.ClaudeAutomation.executeTask,
        runAutomation: typeof window.ClaudeAutomation.runAutomation,
        version: window.ClaudeAutomation.version,
        isReady: window.ClaudeAutomation.isReady
    });

})();