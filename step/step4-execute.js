/**
 * @fileoverview Step 4 Execute - AI自動化制御ファイル
 *
 * 各AI専用自動化ファイルを読み込んで制御します：
 * - 4-1-chatgpt-automation.js: ChatGPT専用処理
 * - 4-2-claude-automation.js: Claude専用処理
 * - 4-3-gemini-automation.js: Gemini専用処理
 * - 4-4-report-automation.js: Report専用処理
 * - 4-5-genspark-automation.js: Genspark専用処理
 *
 * @version 2.0.0
 * @date 2025-09-20
 */

console.log('🚀 Step 4 Execute - AI自動化制御ファイル初期化');

// ========================================
// AI専用ファイル読み込み管理
// ========================================
class AIAutomationLoader {
    constructor() {
        this.loadedFiles = new Set();
        this.aiFileMap = {
            'chatgpt': chrome.runtime.getURL('step/4-1-chatgpt-automation.js'),
            'claude': chrome.runtime.getURL('step/4-2-claude-automation.js'),
            'gemini': chrome.runtime.getURL('step/4-3-gemini-automation.js'),
            'report': chrome.runtime.getURL('step/4-4-report-automation.js'),
            'genspark': chrome.runtime.getURL('step/4-5-genspark-automation.js')
        };
    }

    /**
     * AI専用ファイルを動的に読み込み
     */
    async loadAIFile(aiType) {
        const normalizedType = aiType.toLowerCase();
        const filePath = this.aiFileMap[normalizedType];

        if (!filePath) {
            throw new Error(`未対応のAI種別: ${aiType}`);
        }

        if (this.loadedFiles.has(normalizedType)) {
            console.log(`[AILoader] ${aiType} は既に読み込み済み`);
            return;
        }

        try {
            console.log(`[AILoader] ${aiType} 自動化ファイル読み込み開始`);
            console.log(`[AILoader] [DEBUG] 元のfilePath: ${filePath}`);
            console.log(`[AILoader] [DEBUG] 現在のページURL: ${window.location.href}`);
            console.log(`[AILoader] [DEBUG] chrome.runtime.getURL使用: ${typeof chrome !== 'undefined' && chrome.runtime}`);
            console.log(`[AILoader] [DEBUG] 最終的なスクリプトURL: ${filePath}`);

            // スクリプトタグで動的読み込み
            const script = document.createElement('script');
            script.src = filePath;
            script.type = 'text/javascript';

            await new Promise((resolve, reject) => {
                script.onload = () => {
                    console.log(`[AILoader] ✅ ${aiType} 読み込み完了`);
                    this.loadedFiles.add(normalizedType);
                    resolve();
                };
                script.onerror = () => {
                    console.error(`[AILoader] ❌ ${aiType} 読み込み失敗: ${filePath}`);
                    reject(new Error(`${aiType} 自動化ファイルの読み込みに失敗しました`));
                };
                document.head.appendChild(script);
            });

        } catch (error) {
            console.error(`[AILoader] ${aiType} 読み込みエラー:`, error);
            throw error;
        }
    }

    /**
     * AI自動化が利用可能かチェック
     */
    isAIAvailable(aiType) {
        const normalizedType = aiType.toLowerCase();

        switch (normalizedType) {
            case 'chatgpt':
                return window.ChatGPTAutomationV2 && typeof window.ChatGPTAutomationV2.executeTask === 'function';
            case 'claude':
                return window.ClaudeAutomation && typeof window.ClaudeAutomation.executeTask === 'function';
            case 'gemini':
                return window.GeminiAutomation && typeof window.GeminiAutomation.executeTask === 'function';
            case 'report':
                return window.ReportAutomation && typeof window.ReportAutomation.executeTask === 'function';
            case 'genspark':
                return window.GensparkAutomationV2 && typeof window.GensparkAutomationV2.executeTask === 'function';
            default:
                return false;
        }
    }
}

// グローバルインスタンス作成
window.aiAutomationLoader = new AIAutomationLoader();

// ========================================
// グループタイプ判定クラス
// ========================================
class TaskGroupTypeDetector {
    constructor() {
        this.threeTypeAIs = ['chatgpt', 'claude', 'gemini'];
    }

    /**
     * タスクリストからグループタイプを判定
     * @param {Array} taskList - タスクリスト
     * @returns {Object} - {type: 'normal' | 'threeTypes', aiTypes: Array}
     */
    detectGroupType(taskList) {
        console.log('🔍 [GroupTypeDetector] タスクリスト分析開始', taskList);

        if (!taskList || taskList.length === 0) {
            console.log('🔍 [GroupTypeDetector] 空のタスクリスト - デフォルト: normal');
            return { type: 'normal', aiTypes: [] };
        }

        // タスクリストからAI種別を抽出
        const aiTypes = [...new Set(taskList.map(task => {
            let aiType = task.aiType;
            // AI種別の正規化
            if (aiType === 'single' || !aiType) {
                aiType = 'claude';
            }
            return aiType.toLowerCase();
        }))];

        console.log('🔍 [GroupTypeDetector] 検出されたAI種別:', aiTypes);

        // 3種類AI判定: ChatGPT、Claude、Geminiが全て含まれているか
        const hasAllThreeTypes = this.threeTypeAIs.every(aiType => aiTypes.includes(aiType));

        if (hasAllThreeTypes && aiTypes.length === 3) {
            console.log('🎯 [GroupTypeDetector] グループタイプ: 3種類AI');
            return {
                type: 'threeTypes',
                aiTypes: ['chatgpt', 'claude', 'gemini'] // 固定順序
            };
        } else {
            console.log('🎯 [GroupTypeDetector] グループタイプ: 通常処理');
            return {
                type: 'normal',
                aiTypes: aiTypes.slice(0, 3) // 最大3つまで
            };
        }
    }

    /**
     * グループタイプに応じたウィンドウ配置を取得
     * @param {string} groupType - 'normal' | 'threeTypes'
     * @param {Array} aiTypes - AI種別リスト
     * @returns {Array} - [{aiType, position}] 形式の配置情報
     */
    getWindowLayout(groupType, aiTypes) {
        console.log('🖼️ [GroupTypeDetector] ウィンドウ配置計算:', { groupType, aiTypes });

        if (groupType === 'threeTypes') {
            // 3種類AI: 固定配置（左上→右上→左下）
            return [
                { aiType: 'chatgpt', position: 0 }, // 左上
                { aiType: 'claude', position: 1 },   // 右上
                { aiType: 'gemini', position: 2 }    // 左下
            ];
        } else {
            // 通常処理: タスクリストの順序で配置（左上→右上→左下）
            return aiTypes.slice(0, 3).map((aiType, index) => ({
                aiType: aiType,
                position: index // 0=左上, 1=右上, 2=左下
            }));
        }
    }
}

// グローバルインスタンス作成
window.taskGroupTypeDetector = new TaskGroupTypeDetector();

// ========================================
// Step 4-1: ウィンドウ制御クラス
// ========================================
class WindowController {
    constructor() {
        this.openedWindows = new Map(); // aiType -> windowInfo
        this.windowService = null; // WindowServiceへの参照
    }

    /**
     * Step 4-1-1: WindowServiceの初期化
     */
    async initializeWindowService() {
        console.log('🪟 [WindowController] Step 4-1-1: WindowService初期化開始');

        // WindowServiceがグローバルに存在するかチェック
        if (typeof WindowService === 'undefined') {
            throw new Error('WindowServiceが利用できません');
        }

        this.windowService = WindowService;
        console.log('✅ [WindowController] Step 4-1-1: WindowService初期化完了');
    }

    /**
     * Step 4-1-2: 4分割ウィンドウを開く
     * @param {Array} windowLayout - [{aiType, position}] 形式の配置情報
     */
    async openWindows(windowLayout) {
        console.log('🪟 [WindowController] Step 4-1-2: 4分割ウィンドウ開始', windowLayout);

        // WindowService初期化確認
        if (!this.windowService) {
            await this.initializeWindowService();
        }

        const results = [];

        for (const layout of windowLayout) {
            try {
                console.log(`🪟 [Step 4-1-2-${layout.position}] ${layout.aiType}ウィンドウを${layout.position}番目に開く`);

                // AI種別に応じたURLを取得
                const url = this.getAIUrl(layout.aiType);

                // WindowServiceを使用してウィンドウ作成
                const windowInfo = await this.windowService.createWindow({
                    url: url,
                    type: 'popup',
                    position: layout.position // 0=左上, 1=右上, 2=左下
                });

                if (windowInfo && windowInfo.id) {
                    this.openedWindows.set(layout.aiType, {
                        windowId: windowInfo.id,
                        tabId: windowInfo.tabs?.[0]?.id,
                        url: url,
                        position: layout.position,
                        aiType: layout.aiType
                    });

                    results.push({
                        aiType: layout.aiType,
                        success: true,
                        windowId: windowInfo.id,
                        position: layout.position
                    });

                    console.log(`✅ [Step 4-1-2-${layout.position}] ${layout.aiType}ウィンドウ作成成功`);
                } else {
                    throw new Error(`ウィンドウ作成に失敗: ${layout.aiType}`);
                }

            } catch (error) {
                console.error(`❌ [Step 4-1-2-${layout.position}] ${layout.aiType}ウィンドウ作成失敗:`, error);
                results.push({
                    aiType: layout.aiType,
                    success: false,
                    error: error.message,
                    position: layout.position
                });
            }

            // ウィンドウ間の待機時間
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        console.log('🏁 [WindowController] Step 4-1-2: 4分割ウィンドウ開く完了', results);
        return results;
    }

    /**
     * Step 4-1-3: ウィンドウチェック（テキスト入力欄・モデル表示・機能表示）
     * @param {Array} aiTypes - チェック対象のAI種別リスト
     */
    async checkWindows(aiTypes) {
        console.log('🔍 [WindowController] Step 4-1-3: ウィンドウチェック開始', aiTypes);

        const checkResults = [];

        for (const aiType of aiTypes) {
            const windowInfo = this.openedWindows.get(aiType);
            if (!windowInfo) {
                console.warn(`⚠️ [Step 4-1-3] ${aiType}のウィンドウが見つかりません`);
                checkResults.push({
                    aiType: aiType,
                    success: false,
                    error: 'ウィンドウが開かれていません'
                });
                continue;
            }

            try {
                console.log(`🔍 [Step 4-1-3] ${aiType}ウィンドウをチェック中...`);

                // タブをアクティブにしてからチェック
                if (windowInfo.tabId) {
                    await chrome.tabs.update(windowInfo.tabId, { active: true });
                    await new Promise(resolve => setTimeout(resolve, 2000)); // 読み込み待機
                }

                // AI種別に応じたチェック処理
                const checkResult = await this.performWindowCheck(aiType, windowInfo.tabId);

                checkResults.push({
                    aiType: aiType,
                    success: checkResult.success,
                    checks: checkResult.checks,
                    error: checkResult.error
                });

                console.log(`✅ [Step 4-1-3] ${aiType}ウィンドウチェック完了:`, checkResult);

            } catch (error) {
                console.error(`❌ [Step 4-1-3] ${aiType}ウィンドウチェック失敗:`, error);
                checkResults.push({
                    aiType: aiType,
                    success: false,
                    error: error.message
                });
            }
        }

        console.log('🏁 [WindowController] Step 4-1-3: ウィンドウチェック完了', checkResults);
        return checkResults;
    }

    /**
     * AI種別に応じたURLを取得
     */
    getAIUrl(aiType) {
        const urls = {
            'chatgpt': 'https://chatgpt.com/',
            'claude': 'https://claude.ai/',
            'gemini': 'https://gemini.google.com/',
            'genspark': 'https://www.genspark.ai/',
            'report': 'about:blank' // レポート用は空白ページ
        };
        return urls[aiType.toLowerCase()] || 'about:blank';
    }

    /**
     * 個別ウィンドウのチェック処理
     */
    async performWindowCheck(aiType, tabId) {
        const checks = {
            textInput: false,
            modelDisplay: false,
            functionDisplay: false
        };

        try {
            // Content scriptにチェック要求を送信
            const response = await chrome.tabs.sendMessage(tabId, {
                action: 'CHECK_UI_ELEMENTS',
                aiType: aiType
            });

            if (response && response.success) {
                checks.textInput = response.checks.textInput || false;
                checks.modelDisplay = response.checks.modelDisplay || false;
                checks.functionDisplay = response.checks.functionDisplay || false;
            }

            const allChecksPass = Object.values(checks).every(check => check);

            return {
                success: allChecksPass,
                checks: checks,
                error: allChecksPass ? null : 'UI要素の一部が見つかりません'
            };

        } catch (error) {
            return {
                success: false,
                checks: checks,
                error: error.message
            };
        }
    }

    /**
     * 開かれたウィンドウ情報を取得
     */
    getOpenedWindows() {
        return Array.from(this.openedWindows.entries()).map(([aiType, info]) => ({
            aiType,
            ...info
        }));
    }

    /**
     * Step 4-1-4: ウィンドウを閉じる
     */
    async closeWindows(aiTypes = null) {
        console.log('🔒 [WindowController] Step 4-1-4: ウィンドウクローズ開始', aiTypes);

        const targetAiTypes = aiTypes || Array.from(this.openedWindows.keys());

        for (const aiType of targetAiTypes) {
            const windowInfo = this.openedWindows.get(aiType);
            if (windowInfo && windowInfo.windowId) {
                try {
                    await chrome.windows.remove(windowInfo.windowId);
                    this.openedWindows.delete(aiType);
                    console.log(`✅ [Step 4-1-4] ${aiType}ウィンドウクローズ完了`);
                } catch (error) {
                    console.error(`❌ [Step 4-1-4] ${aiType}ウィンドウクローズ失敗:`, error);
                }
            }
        }

        console.log('🏁 [WindowController] Step 4-1-4: ウィンドウクローズ完了');
    }
}

// グローバルインスタンス作成
window.windowController = new WindowController();

// ========================================
// Step 4-2: スプレッドシートデータ動的取得クラス
// ========================================
class SpreadsheetDataManager {
    constructor() {
        this.sheetsClient = null;
        this.spreadsheetData = null;
    }

    /**
     * Step 4-2-1: SheetsClientの初期化
     */
    async initializeSheetsClient() {
        console.log('📊 [SpreadsheetDataManager] Step 4-2-1: SheetsClient初期化開始');

        // SheetsClientがグローバルに存在するかチェック
        if (typeof SheetsClient === 'undefined') {
            throw new Error('SheetsClientが利用できません');
        }

        this.sheetsClient = new SheetsClient();
        console.log('✅ [SpreadsheetDataManager] Step 4-2-1: SheetsClient初期化完了');
    }

    /**
     * Step 4-2-2: スプレッドシート設定データの取得
     */
    async getSpreadsheetConfig() {
        console.log('📊 [SpreadsheetDataManager] Step 4-2-2: スプレッドシート設定取得開始');

        // グローバル設定の確認
        if (!globalThis.SPREADSHEET_CONFIG) {
            throw new Error('SPREADSHEET_CONFIGが設定されていません');
        }

        this.spreadsheetData = globalThis.SPREADSHEET_CONFIG;
        console.log('✅ [SpreadsheetDataManager] Step 4-2-2: スプレッドシート設定取得完了', {
            spreadsheetId: this.spreadsheetData.spreadsheetId,
            sheetName: this.spreadsheetData.sheetName
        });

        return this.spreadsheetData;
    }

    /**
     * Step 4-2-3: タスクリストから動的データを取得
     * @param {Array} taskList - タスクリスト
     * @returns {Array} - 拡張されたタスクリスト（AI・モデル・機能・プロンプト含む）
     */
    async enrichTaskList(taskList) {
        console.log('📊 [SpreadsheetDataManager] Step 4-2-3: タスクリスト動的データ取得開始', taskList);

        // SheetsClient初期化確認
        if (!this.sheetsClient) {
            await this.initializeSheetsClient();
        }

        // スプレッドシート設定確認
        if (!this.spreadsheetData) {
            await this.getSpreadsheetConfig();
        }

        const enrichedTaskList = [];

        for (const task of taskList) {
            try {
                console.log(`📊 [Step 4-2-3] タスク ${task.id || task.taskId} の動的データ取得中...`);

                // タスクのセル位置情報から動的データを取得
                const enrichedTask = await this.getTaskDynamicData(task);

                enrichedTaskList.push(enrichedTask);
                console.log(`✅ [Step 4-2-3] タスク ${task.id || task.taskId} の動的データ取得完了`);

            } catch (error) {
                console.error(`❌ [Step 4-2-3] タスク ${task.id || task.taskId} の動的データ取得失敗:`, error);
                // エラーの場合は元のタスクデータを使用
                enrichedTaskList.push(task);
            }
        }

        console.log('🏁 [SpreadsheetDataManager] Step 4-2-3: タスクリスト動的データ取得完了', enrichedTaskList);
        return enrichedTaskList;
    }

    /**
     * Step 4-2-4: 個別タスクの動的データ取得
     * @param {Object} task - タスクデータ
     * @returns {Object} - 拡張されたタスクデータ
     */
    async getTaskDynamicData(task) {
        const enrichedTask = { ...task };

        try {
            // セル位置情報の確認
            const cellRef = task.cellRef || `${task.column}${task.row}`;
            if (!cellRef) {
                console.warn(`⚠️ [Step 4-2-4] タスクにセル位置情報がありません:`, task);
                return enrichedTask;
            }

            console.log(`📊 [Step 4-2-4] セル ${cellRef} から動的データ取得中...`);

            // Step 4-2-4-1: プロンプトデータの取得
            const promptData = await this.getPromptData(cellRef);
            if (promptData) {
                enrichedTask.prompt = promptData.prompt;
                enrichedTask.aiType = promptData.aiType || task.aiType;
            }

            // Step 4-2-4-2: モデル情報の取得
            const modelData = await this.getModelData(cellRef);
            if (modelData) {
                enrichedTask.model = modelData.model;
                enrichedTask.modelDisplay = modelData.display;
            }

            // Step 4-2-4-3: 機能情報の取得
            const functionData = await this.getFunctionData(cellRef);
            if (functionData) {
                enrichedTask.function = functionData.function;
                enrichedTask.functionDisplay = functionData.display;
            }

            // Step 4-2-4-4: 作業セル位置情報の取得（レポート・Genspark用）
            const workCellData = await this.getWorkCellData(cellRef);
            if (workCellData) {
                enrichedTask.workCellRef = workCellData.cellRef;
                enrichedTask.workCellType = workCellData.type;
            }

            console.log(`✅ [Step 4-2-4] セル ${cellRef} の動的データ取得完了:`, {
                prompt: !!enrichedTask.prompt,
                model: enrichedTask.model,
                function: enrichedTask.function,
                workCell: enrichedTask.workCellRef
            });

        } catch (error) {
            console.error(`❌ [Step 4-2-4] セル動的データ取得エラー:`, error);
        }

        return enrichedTask;
    }

    /**
     * プロンプトデータの取得
     */
    async getPromptData(cellRef) {
        try {
            // セルからプロンプトテキストを取得
            const response = await this.sheetsClient.readRange(
                this.spreadsheetData.spreadsheetId,
                `${this.spreadsheetData.sheetName}!${cellRef}`
            );

            if (response?.values?.[0]?.[0]) {
                const promptText = response.values[0][0];

                // プロンプトからAI種別を推定（プロンプト内に指定がある場合）
                let aiType = null;
                const aiKeywords = {
                    'chatgpt': ['chatgpt', 'gpt', 'openai'],
                    'claude': ['claude', 'anthropic'],
                    'gemini': ['gemini', 'google'],
                    'genspark': ['genspark', 'スライド', 'ファクトチェック'],
                    'report': ['レポート', 'report']
                };

                for (const [ai, keywords] of Object.entries(aiKeywords)) {
                    if (keywords.some(keyword => promptText.toLowerCase().includes(keyword))) {
                        aiType = ai;
                        break;
                    }
                }

                return {
                    prompt: promptText,
                    aiType: aiType
                };
            }
        } catch (error) {
            console.error('プロンプトデータ取得エラー:', error);
        }
        return null;
    }

    /**
     * モデル情報の取得（隣接セルやヘッダーから）
     */
    async getModelData(cellRef) {
        try {
            // 隣接セルやヘッダーからモデル情報を取得する仮実装
            // 実際の実装では、スプレッドシートの構造に応じて調整が必要
            return {
                model: 'Claude Opus 4.1', // デフォルト値
                display: 'Claude Opus 4.1'
            };
        } catch (error) {
            console.error('モデルデータ取得エラー:', error);
        }
        return null;
    }

    /**
     * 機能情報の取得
     */
    async getFunctionData(cellRef) {
        try {
            // 機能情報の取得仮実装
            return {
                function: '通常', // デフォルト値
                display: '通常'
            };
        } catch (error) {
            console.error('機能データ取得エラー:', error);
        }
        return null;
    }

    /**
     * 作業セル位置情報の取得
     */
    async getWorkCellData(cellRef) {
        try {
            // 作業セル位置の計算仮実装
            // レポートやGensparkの場合の作業セル位置を計算
            return {
                cellRef: cellRef, // 同じセルまたは隣接セル
                type: 'normal'
            };
        } catch (error) {
            console.error('作業セルデータ取得エラー:', error);
        }
        return null;
    }
}

// グローバルインスタンス作成
window.spreadsheetDataManager = new SpreadsheetDataManager();

// ========================================
// Step 4-3: 詳細ログ記載クラス
// ========================================
class DetailedLogManager {
    constructor() {
        this.taskLogs = new Map(); // taskId -> logData
        this.sheetsClient = null;
    }

    /**
     * Step 4-3-1: ログマネージャーの初期化
     */
    async initializeLogManager() {
        console.log('📝 [DetailedLogManager] Step 4-3-1: ログマネージャー初期化開始');

        // SheetsClientの参照取得
        if (window.spreadsheetDataManager && window.spreadsheetDataManager.sheetsClient) {
            this.sheetsClient = window.spreadsheetDataManager.sheetsClient;
        } else if (typeof SheetsClient !== 'undefined') {
            this.sheetsClient = new SheetsClient();
        } else {
            throw new Error('SheetsClientが利用できません');
        }

        console.log('✅ [DetailedLogManager] Step 4-3-1: ログマネージャー初期化完了');
    }

    /**
     * Step 4-3-2: タスク開始時のログ記録
     * @param {Object} task - タスクデータ
     * @param {Object} windowInfo - ウィンドウ情報
     */
    recordTaskStart(task, windowInfo) {
        const taskId = task.id || task.taskId || `${task.column}${task.row}`;
        const startTime = new Date();

        console.log(`📝 [DetailedLogManager] Step 4-3-2: タスク開始ログ記録 - ${taskId}`);

        const logData = {
            taskId: taskId,
            aiType: task.aiType,
            model: {
                selected: task.model || 'Claude Opus 4.1',
                display: task.modelDisplay || task.model || 'Claude Opus 4.1'
            },
            function: {
                selected: task.function || '通常',
                display: task.functionDisplay || task.function || '通常'
            },
            url: windowInfo?.url || '',
            startTime: startTime,
            sendTime: null,
            completeTime: null,
            prompt: task.prompt || '',
            response: null,
            error: null
        };

        this.taskLogs.set(taskId, logData);
        console.log(`✅ [Step 4-3-2] タスク開始ログ記録完了 - ${taskId}`);
    }

    /**
     * Step 4-3-3: 送信時刻の記録
     * @param {string} taskId - タスクID
     * @param {string} url - 作業URL
     */
    recordSendTime(taskId, url = null) {
        console.log(`📝 [DetailedLogManager] Step 4-3-3: 送信時刻記録 - ${taskId}`);

        const logData = this.taskLogs.get(taskId);
        if (logData) {
            logData.sendTime = new Date();
            if (url) {
                logData.url = url;
            }
            console.log(`✅ [Step 4-3-3] 送信時刻記録完了 - ${taskId}: ${logData.sendTime.toLocaleString('ja-JP')}`);
        } else {
            console.warn(`⚠️ [Step 4-3-3] タスクログが見つかりません - ${taskId}`);
        }
    }

    /**
     * Step 4-3-4: 完了時刻と結果の記録
     * @param {string} taskId - タスクID
     * @param {Object} result - AI実行結果
     */
    recordTaskComplete(taskId, result) {
        console.log(`📝 [DetailedLogManager] Step 4-3-4: 完了時刻記録 - ${taskId}`);

        const logData = this.taskLogs.get(taskId);
        if (logData) {
            logData.completeTime = new Date();
            logData.response = result?.response || result?.result || null;
            logData.error = result?.error || null;

            console.log(`✅ [Step 4-3-4] 完了時刻記録完了 - ${taskId}: ${logData.completeTime.toLocaleString('ja-JP')}`);
        } else {
            console.warn(`⚠️ [Step 4-3-4] タスクログが見つかりません - ${taskId}`);
        }
    }

    /**
     * Step 4-3-5: 詳細ログフォーマットの生成
     * @param {string} taskId - タスクID
     * @returns {string} - フォーマットされたログテキスト
     */
    generateDetailedLog(taskId) {
        console.log(`📝 [DetailedLogManager] Step 4-3-5: 詳細ログ生成 - ${taskId}`);

        const logData = this.taskLogs.get(taskId);
        if (!logData) {
            console.warn(`⚠️ [Step 4-3-5] タスクログが見つかりません - ${taskId}`);
            return '';
        }

        // 時間差計算
        let timeDiff = '';
        if (logData.sendTime && logData.completeTime) {
            const diffMs = logData.completeTime.getTime() - logData.sendTime.getTime();
            const diffSeconds = Math.round(diffMs / 1000);
            timeDiff = ` (${diffSeconds}秒後)`;
        }

        // AI名の日本語変換
        const aiNameMap = {
            'chatgpt': 'ChatGPT',
            'claude': 'Claude',
            'gemini': 'Gemini',
            'genspark': 'Genspark',
            'report': 'Report'
        };
        const aiDisplayName = aiNameMap[logData.aiType?.toLowerCase()] || logData.aiType || 'AI';

        // フォーマット生成
        const logText = `---------- ${aiDisplayName} ----------
モデル: 選択: ${logData.model.selected} / 表示: ${logData.model.display}
機能: 選択: ${logData.function.selected} / 表示: ${logData.function.display}
URL: ${logData.url}
送信時刻: ${logData.sendTime ? logData.sendTime.toLocaleString('ja-JP') : '未記録'}
記載時刻: ${logData.completeTime ? logData.completeTime.toLocaleString('ja-JP') : '未記録'}${timeDiff}`;

        console.log(`✅ [Step 4-3-5] 詳細ログ生成完了 - ${taskId}`);
        return logText;
    }

    /**
     * Step 4-3-6: ログをスプレッドシートに記載
     * @param {string} taskId - タスクID
     * @param {string} logCellRef - ログ記載先セル位置
     */
    async writeLogToSpreadsheet(taskId, logCellRef) {
        console.log(`📝 [DetailedLogManager] Step 4-3-6: ログスプレッドシート記載 - ${taskId} -> ${logCellRef}`);

        try {
            // ログマネージャー初期化確認
            if (!this.sheetsClient) {
                await this.initializeLogManager();
            }

            // 詳細ログ生成
            const logText = this.generateDetailedLog(taskId);
            if (!logText) {
                throw new Error('ログデータが生成できませんでした');
            }

            // スプレッドシート設定取得
            const spreadsheetData = globalThis.SPREADSHEET_CONFIG;
            if (!spreadsheetData) {
                throw new Error('SPREADSHEET_CONFIGが設定されていません');
            }

            // スプレッドシートに書き込み
            await this.sheetsClient.writeToRange(
                spreadsheetData.spreadsheetId,
                `${spreadsheetData.sheetName}!${logCellRef}`,
                logText
            );

            console.log(`✅ [Step 4-3-6] ログスプレッドシート記載完了 - ${taskId} -> ${logCellRef}`);

        } catch (error) {
            console.error(`❌ [Step 4-3-6] ログスプレッドシート記載失敗 - ${taskId}:`, error);
            throw error;
        }
    }

    /**
     * Step 4-3-7: 回答をスプレッドシートに記載
     * @param {string} taskId - タスクID
     * @param {string} answerCellRef - 回答記載先セル位置
     */
    async writeAnswerToSpreadsheet(taskId, answerCellRef) {
        console.log(`📝 [DetailedLogManager] Step 4-3-7: 回答スプレッドシート記載 - ${taskId} -> ${answerCellRef}`);

        try {
            const logData = this.taskLogs.get(taskId);
            if (!logData || !logData.response) {
                console.warn(`⚠️ [Step 4-3-7] 回答データが見つかりません - ${taskId}`);
                return;
            }

            // ログマネージャー初期化確認
            if (!this.sheetsClient) {
                await this.initializeLogManager();
            }

            // スプレッドシート設定取得
            const spreadsheetData = globalThis.SPREADSHEET_CONFIG;
            if (!spreadsheetData) {
                throw new Error('SPREADSHEET_CONFIGが設定されていません');
            }

            // 回答をスプレッドシートに書き込み
            await this.sheetsClient.writeToRange(
                spreadsheetData.spreadsheetId,
                `${spreadsheetData.sheetName}!${answerCellRef}`,
                logData.response
            );

            console.log(`✅ [Step 4-3-7] 回答スプレッドシート記載完了 - ${taskId} -> ${answerCellRef}`);

        } catch (error) {
            console.error(`❌ [Step 4-3-7] 回答スプレッドシート記載失敗 - ${taskId}:`, error);
            throw error;
        }
    }

    /**
     * タスクログデータの取得
     */
    getTaskLog(taskId) {
        return this.taskLogs.get(taskId);
    }

    /**
     * 全タスクログの取得
     */
    getAllTaskLogs() {
        return Array.from(this.taskLogs.entries()).map(([taskId, logData]) => ({
            taskId,
            ...logData
        }));
    }
}

// グローバルインスタンス作成
window.detailedLogManager = new DetailedLogManager();

// ========================================
// Step 4-4: ウィンドウライフサイクル管理クラス
// ========================================
class WindowLifecycleManager {
    constructor() {
        this.retryConfig = {
            maxRetries: 3,
            retryDelay: 2000, // 2秒
            timeoutMs: 300000 // 5分
        };
        this.activeWindows = new Set(); // 現在アクティブなウィンドウを追跡
    }

    /**
     * Step 4-4-1: ライフサイクル管理の初期化
     */
    async initializeLifecycleManager() {
        console.log('🔄 [WindowLifecycleManager] Step 4-4-1: ライフサイクル管理初期化開始');

        // 既存ウィンドウの確認
        try {
            const windows = await chrome.windows.getAll();
            console.log(`📊 [Step 4-4-1] 既存ウィンドウ: ${windows.length}個`);
        } catch (error) {
            console.warn(`⚠️ [Step 4-4-1] ウィンドウ確認エラー:`, error);
        }

        console.log('✅ [WindowLifecycleManager] Step 4-4-1: ライフサイクル管理初期化完了');
    }

    /**
     * Step 4-4-2: ウィンドウの登録と追跡開始
     * @param {string} aiType - AI種別
     * @param {Object} windowInfo - ウィンドウ情報
     */
    registerWindow(aiType, windowInfo) {
        console.log(`🔄 [WindowLifecycleManager] Step 4-4-2: ウィンドウ登録 - ${aiType}`);

        const windowData = {
            aiType: aiType,
            windowId: windowInfo.windowId,
            tabId: windowInfo.tabId,
            url: windowInfo.url,
            registeredAt: new Date(),
            lastActivity: new Date()
        };

        this.activeWindows.add(JSON.stringify(windowData));
        console.log(`✅ [Step 4-4-2] ウィンドウ登録完了 - ${aiType}: ${windowInfo.windowId}`);

        return windowData;
    }

    /**
     * Step 4-4-3: AI実行のRetry処理
     * @param {Function} executeFunction - 実行する関数
     * @param {Object} task - タスクデータ
     * @param {string} operationName - 操作名
     */
    async executeWithRetry(executeFunction, task, operationName = 'AI実行') {
        console.log(`🔄 [WindowLifecycleManager] Step 4-4-3: Retry処理開始 - ${operationName}`);

        let lastError = null;
        let attempt = 0;

        while (attempt < this.retryConfig.maxRetries) {
            try {
                console.log(`🔄 [Step 4-4-3] ${operationName} 試行 ${attempt + 1}/${this.retryConfig.maxRetries}`);

                // タイムアウト付きで実行
                const result = await this.executeWithTimeout(executeFunction, this.retryConfig.timeoutMs);

                console.log(`✅ [Step 4-4-3] ${operationName} 成功 (試行 ${attempt + 1})`);
                return result;

            } catch (error) {
                lastError = error;
                attempt++;

                console.error(`❌ [Step 4-4-3] ${operationName} 失敗 (試行 ${attempt}):`, error.message);

                // 最後の試行でない場合は待機
                if (attempt < this.retryConfig.maxRetries) {
                    console.log(`⏳ [Step 4-4-3] ${this.retryConfig.retryDelay}ms待機後に再試行...`);
                    await new Promise(resolve => setTimeout(resolve, this.retryConfig.retryDelay));

                    // ウィンドウ状態の確認とリフレッシュ
                    await this.refreshWindowIfNeeded(task);
                }
            }
        }

        console.error(`❌ [Step 4-4-3] ${operationName} 最終失敗 (${this.retryConfig.maxRetries}回試行)`, lastError);
        throw new Error(`${operationName} failed after ${this.retryConfig.maxRetries} attempts: ${lastError?.message}`);
    }

    /**
     * Step 4-4-4: タイムアウト付き実行
     */
    async executeWithTimeout(executeFunction, timeoutMs) {
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error(`操作がタイムアウトしました (${timeoutMs}ms)`)), timeoutMs);
        });

        return Promise.race([executeFunction(), timeoutPromise]);
    }

    /**
     * Step 4-4-5: ウィンドウ状態確認とリフレッシュ
     * @param {Object} task - タスクデータ
     */
    async refreshWindowIfNeeded(task) {
        console.log(`🔄 [WindowLifecycleManager] Step 4-4-5: ウィンドウ状態確認 - ${task.aiType}`);

        try {
            // WindowControllerからウィンドウ情報を取得
            const windowInfo = window.windowController?.openedWindows?.get(task.aiType);
            if (!windowInfo) {
                console.warn(`⚠️ [Step 4-4-5] ウィンドウ情報が見つかりません - ${task.aiType}`);
                return;
            }

            // ウィンドウの存在確認
            try {
                await chrome.windows.get(windowInfo.windowId);
                console.log(`✅ [Step 4-4-5] ウィンドウ存在確認OK - ${task.aiType}`);
            } catch (error) {
                console.warn(`⚠️ [Step 4-4-5] ウィンドウが存在しません - ${task.aiType}:`, error);

                // ウィンドウが存在しない場合は再作成
                await this.recreateWindow(task);
            }

            // タブをアクティブにする
            if (windowInfo.tabId) {
                try {
                    await chrome.tabs.update(windowInfo.tabId, { active: true });
                    console.log(`✅ [Step 4-4-5] タブアクティブ化完了 - ${task.aiType}`);
                } catch (error) {
                    console.warn(`⚠️ [Step 4-4-5] タブアクティブ化失敗 - ${task.aiType}:`, error);
                }
            }

        } catch (error) {
            console.error(`❌ [Step 4-4-5] ウィンドウ状態確認エラー - ${task.aiType}:`, error);
        }
    }

    /**
     * Step 4-4-6: ウィンドウの再作成
     * @param {Object} task - タスクデータ
     */
    async recreateWindow(task) {
        console.log(`🔄 [WindowLifecycleManager] Step 4-4-6: ウィンドウ再作成 - ${task.aiType}`);

        try {
            // WindowControllerを使用してウィンドウを再作成
            if (window.windowController) {
                const layout = [{
                    aiType: task.aiType,
                    position: 0 // 左上固定
                }];

                const results = await window.windowController.openWindows(layout);
                if (results[0]?.success) {
                    console.log(`✅ [Step 4-4-6] ウィンドウ再作成成功 - ${task.aiType}`);
                } else {
                    throw new Error(`ウィンドウ再作成に失敗: ${results[0]?.error}`);
                }
            } else {
                throw new Error('WindowControllerが利用できません');
            }

        } catch (error) {
            console.error(`❌ [Step 4-4-6] ウィンドウ再作成失敗 - ${task.aiType}:`, error);
            throw error;
        }
    }

    /**
     * Step 4-4-7: タスク完了後のウィンドウクローズ
     * @param {Object} task - タスクデータ
     * @param {Object} result - 実行結果
     */
    async handleTaskCompletion(task, result) {
        console.log(`🔄 [WindowLifecycleManager] Step 4-4-7: タスク完了処理 - ${task.aiType}`);

        try {
            const taskId = task.id || task.taskId || `${task.column}${task.row}`;

            // 完了ログ記録
            if (window.detailedLogManager) {
                window.detailedLogManager.recordTaskComplete(taskId, result);
            }

            // ウィンドウクローズ（設定により制御可能）
            const shouldCloseWindow = this.shouldCloseWindowAfterTask(task, result);
            if (shouldCloseWindow) {
                await this.closeTaskWindow(task);
            } else {
                console.log(`📌 [Step 4-4-7] ウィンドウを保持 - ${task.aiType}`);
            }

            // ウィンドウ追跡から削除
            this.unregisterWindow(task.aiType);

            console.log(`✅ [Step 4-4-7] タスク完了処理完了 - ${task.aiType}`);

        } catch (error) {
            console.error(`❌ [Step 4-4-7] タスク完了処理エラー - ${task.aiType}:`, error);
        }
    }

    /**
     * ウィンドウクローズ判定
     */
    shouldCloseWindowAfterTask(task, result) {
        // エラーの場合はウィンドウを保持（デバッグ用）
        if (!result.success) {
            return false;
        }

        // レポートやGensparkの場合は保持（作業継続の可能性）
        const keepOpenTypes = ['report', 'genspark'];
        if (keepOpenTypes.includes(task.aiType?.toLowerCase())) {
            return false;
        }

        // 通常のAIタスクは完了後にクローズ
        return true;
    }

    /**
     * Step 4-4-8: 個別ウィンドウのクローズ
     * @param {Object} task - タスクデータ
     */
    async closeTaskWindow(task) {
        console.log(`🔄 [WindowLifecycleManager] Step 4-4-8: ウィンドウクローズ - ${task.aiType}`);

        try {
            if (window.windowController) {
                await window.windowController.closeWindows([task.aiType]);
                console.log(`✅ [Step 4-4-8] ウィンドウクローズ完了 - ${task.aiType}`);
            } else {
                console.warn(`⚠️ [Step 4-4-8] WindowControllerが利用できません`);
            }
        } catch (error) {
            console.error(`❌ [Step 4-4-8] ウィンドウクローズエラー - ${task.aiType}:`, error);
        }
    }

    /**
     * ウィンドウ追跡からの削除
     */
    unregisterWindow(aiType) {
        // 該当するウィンドウデータを削除
        for (const windowDataStr of this.activeWindows) {
            try {
                const windowData = JSON.parse(windowDataStr);
                if (windowData.aiType === aiType) {
                    this.activeWindows.delete(windowDataStr);
                    console.log(`🗑️ [WindowLifecycleManager] ウィンドウ追跡削除 - ${aiType}`);
                    break;
                }
            } catch (error) {
                console.warn('ウィンドウデータの解析エラー:', error);
            }
        }
    }

    /**
     * 全ウィンドウのクリーンアップ
     */
    async cleanupAllWindows() {
        console.log('🧹 [WindowLifecycleManager] 全ウィンドウクリーンアップ開始');

        if (window.windowController) {
            await window.windowController.closeWindows();
        }

        this.activeWindows.clear();
        console.log('✅ [WindowLifecycleManager] 全ウィンドウクリーンアップ完了');
    }

    /**
     * アクティブウィンドウ状態の取得
     */
    getActiveWindowsStatus() {
        return Array.from(this.activeWindows).map(windowDataStr => {
            try {
                return JSON.parse(windowDataStr);
            } catch (error) {
                return { error: 'Parse error', data: windowDataStr };
            }
        });
    }
}

// グローバルインスタンス作成
window.windowLifecycleManager = new WindowLifecycleManager();

// ========================================
// Step 4-5: 特別処理機能クラス（レポート・Genspark）
// ========================================
class SpecialTaskProcessor {
    constructor() {
        this.supportedTypes = ['report', 'genspark'];
        this.gensparkSubTypes = ['スライド', 'ファクトチェック'];
    }

    /**
     * Step 4-5-1: 特別処理プロセッサーの初期化
     */
    async initializeProcessor() {
        console.log('🔧 [SpecialTaskProcessor] Step 4-5-1: 特別処理プロセッサー初期化開始');

        // 必要なAutomationの確認
        const automationStatus = {
            report: typeof window.ReportAutomation !== 'undefined',
            genspark: typeof window.GensparkAutomationV2 !== 'undefined'
        };

        console.log('📊 [Step 4-5-1] Automation利用可能状況:', automationStatus);
        console.log('✅ [SpecialTaskProcessor] Step 4-5-1: 特別処理プロセッサー初期化完了');
    }

    /**
     * Step 4-5-2: 特別処理タスクの判定
     * @param {Object} task - タスクデータ
     * @returns {Object} - {isSpecial: boolean, type: string, subType: string}
     */
    identifySpecialTask(task) {
        console.log(`🔧 [SpecialTaskProcessor] Step 4-5-2: 特別処理タスク判定 - ${task.aiType}`);

        const aiType = task.aiType?.toLowerCase();

        // レポート処理の判定
        if (aiType === 'report' || task.prompt?.includes('レポート')) {
            console.log(`✅ [Step 4-5-2] レポート処理タスクを検出`);
            return {
                isSpecial: true,
                type: 'report',
                subType: 'standard'
            };
        }

        // Genspark処理の判定
        if (aiType === 'genspark' || task.prompt?.includes('genspark')) {
            let subType = 'standard';

            // サブタイプの判定
            if (task.prompt?.includes('スライド')) {
                subType = 'slide';
            } else if (task.prompt?.includes('ファクトチェック')) {
                subType = 'factcheck';
            }

            console.log(`✅ [Step 4-5-2] Genspark処理タスクを検出 (${subType})`);
            return {
                isSpecial: true,
                type: 'genspark',
                subType: subType
            };
        }

        console.log(`📝 [Step 4-5-2] 通常タスクと判定`);
        return {
            isSpecial: false,
            type: 'normal',
            subType: null
        };
    }

    /**
     * Step 4-5-3: 特別処理タスクの実行
     * @param {Object} task - タスクデータ
     * @param {Object} specialInfo - 特別処理情報
     * @param {Object} windowInfo - ウィンドウ情報
     */
    async executeSpecialTask(task, specialInfo, windowInfo) {
        console.log(`🔧 [SpecialTaskProcessor] Step 4-5-3: 特別処理実行 - ${specialInfo.type}`);

        try {
            let result = null;

            switch (specialInfo.type) {
                case 'report':
                    result = await this.executeReportTask(task, windowInfo);
                    break;

                case 'genspark':
                    result = await this.executeGensparkTask(task, specialInfo.subType, windowInfo);
                    break;

                default:
                    throw new Error(`未対応の特別処理タイプ: ${specialInfo.type}`);
            }

            console.log(`✅ [Step 4-5-3] 特別処理実行完了 - ${specialInfo.type}`);
            return result;

        } catch (error) {
            console.error(`❌ [Step 4-5-3] 特別処理実行失敗 - ${specialInfo.type}:`, error);
            throw error;
        }
    }

    /**
     * Step 4-5-4: レポート処理の実行
     * @param {Object} task - タスクデータ
     * @param {Object} windowInfo - ウィンドウ情報
     */
    async executeReportTask(task, windowInfo) {
        console.log(`🔧 [SpecialTaskProcessor] Step 4-5-4: レポート処理実行開始`);

        try {
            // ReportAutomation の確認
            if (!window.ReportAutomation) {
                throw new Error('ReportAutomation が利用できません');
            }

            // スプレッドシートデータの取得
            const spreadsheetData = task.spreadsheetData || globalThis.SPREADSHEET_CONFIG;
            if (!spreadsheetData) {
                throw new Error('スプレッドシートデータが設定されていません');
            }

            // レポート実行
            const result = await window.ReportAutomation.executeTask(task, spreadsheetData);

            // 作業セルへの記載
            if (result.success && result.reportData) {
                await this.writeToWorkCell(task, result.reportData, 'report');
            }

            console.log(`✅ [Step 4-5-4] レポート処理実行完了`);
            return result;

        } catch (error) {
            console.error(`❌ [Step 4-5-4] レポート処理実行失敗:`, error);
            throw error;
        }
    }

    /**
     * Step 4-5-5: Genspark処理の実行
     * @param {Object} task - タスクデータ
     * @param {string} subType - サブタイプ（slide, factcheck, standard）
     * @param {Object} windowInfo - ウィンドウ情報
     */
    async executeGensparkTask(task, subType, windowInfo) {
        console.log(`🔧 [SpecialTaskProcessor] Step 4-5-5: Genspark処理実行開始 (${subType})`);

        try {
            // GensparkAutomationV2 の確認
            if (!window.GensparkAutomationV2) {
                throw new Error('GensparkAutomationV2 が利用できません');
            }

            // サブタイプに応じたタスク調整
            const adjustedTask = { ...task };
            switch (subType) {
                case 'slide':
                    adjustedTask.gensparkType = 'slide';
                    adjustedTask.prompt = `スライド作成: ${task.prompt}`;
                    break;

                case 'factcheck':
                    adjustedTask.gensparkType = 'factcheck';
                    adjustedTask.prompt = `ファクトチェック: ${task.prompt}`;
                    break;

                default:
                    adjustedTask.gensparkType = 'standard';
                    break;
            }

            // Genspark実行
            const result = await window.GensparkAutomationV2.executeTask(adjustedTask);

            // 作業セルへの記載
            if (result.success && result.generatedContent) {
                await this.writeToWorkCell(task, result.generatedContent, `genspark_${subType}`);
            }

            console.log(`✅ [Step 4-5-5] Genspark処理実行完了 (${subType})`);
            return result;

        } catch (error) {
            console.error(`❌ [Step 4-5-5] Genspark処理実行失敗:`, error);
            throw error;
        }
    }

    /**
     * Step 4-5-6: 作業セルへのデータ記載
     * @param {Object} task - タスクデータ
     * @param {string} workData - 作業データ
     * @param {string} workType - 作業タイプ
     */
    async writeToWorkCell(task, workData, workType) {
        console.log(`🔧 [SpecialTaskProcessor] Step 4-5-6: 作業セル記載開始 - ${workType}`);

        try {
            // 作業セル位置の決定
            const workCellRef = this.determineWorkCellRef(task, workType);
            if (!workCellRef) {
                console.warn(`⚠️ [Step 4-5-6] 作業セル位置が決定できません`);
                return;
            }

            // DetailedLogManagerのSheetsClientを使用
            let sheetsClient = null;
            if (window.detailedLogManager && window.detailedLogManager.sheetsClient) {
                sheetsClient = window.detailedLogManager.sheetsClient;
            } else if (window.spreadsheetDataManager && window.spreadsheetDataManager.sheetsClient) {
                sheetsClient = window.spreadsheetDataManager.sheetsClient;
            } else {
                throw new Error('SheetsClientが利用できません');
            }

            // スプレッドシート設定取得
            const spreadsheetData = globalThis.SPREADSHEET_CONFIG;
            if (!spreadsheetData) {
                throw new Error('SPREADSHEET_CONFIGが設定されていません');
            }

            // 作業データをフォーマット
            const formattedData = this.formatWorkData(workData, workType);

            // スプレッドシートに書き込み
            await sheetsClient.writeToRange(
                spreadsheetData.spreadsheetId,
                `${spreadsheetData.sheetName}!${workCellRef}`,
                formattedData
            );

            console.log(`✅ [Step 4-5-6] 作業セル記載完了 - ${workCellRef}`);

        } catch (error) {
            console.error(`❌ [Step 4-5-6] 作業セル記載失敗:`, error);
            throw error;
        }
    }

    /**
     * 作業セル位置の決定
     */
    determineWorkCellRef(task, workType) {
        // タスクに明示的に指定されている場合
        if (task.workCellRef) {
            return task.workCellRef;
        }

        // デフォルトの位置計算（元のセルの隣接セル）
        const cellRef = task.cellRef || `${task.column}${task.row}`;
        if (!cellRef) {
            return null;
        }

        // 列を1つ右にずらす（例: B3 -> C3）
        const match = cellRef.match(/^([A-Z]+)(\d+)$/);
        if (!match) {
            return null;
        }

        const column = match[1];
        const row = match[2];

        // 列を1つ進める簡単な実装（A->B, B->C, etc.）
        let nextColumn = '';
        if (column === 'A') nextColumn = 'B';
        else if (column === 'B') nextColumn = 'C';
        else if (column === 'C') nextColumn = 'D';
        else if (column === 'D') nextColumn = 'E';
        else nextColumn = column + 'W'; // フォールバック

        return `${nextColumn}${row}`;
    }

    /**
     * 作業データのフォーマット
     */
    formatWorkData(workData, workType) {
        const timestamp = new Date().toLocaleString('ja-JP');

        switch (workType) {
            case 'report':
                return `[レポート作成結果 - ${timestamp}]\n${workData}`;

            case 'genspark_slide':
                return `[Gensparkスライド作成結果 - ${timestamp}]\n${workData}`;

            case 'genspark_factcheck':
                return `[Gensparkファクトチェック結果 - ${timestamp}]\n${workData}`;

            case 'genspark_standard':
                return `[Genspark作業結果 - ${timestamp}]\n${workData}`;

            default:
                return `[作業結果 - ${timestamp}]\n${workData}`;
        }
    }

    /**
     * 特別処理対応確認
     */
    isSpecialTaskSupported(aiType) {
        const normalizedType = aiType?.toLowerCase();
        return this.supportedTypes.includes(normalizedType);
    }

    /**
     * 特別処理統計の取得
     */
    getSpecialTaskStats() {
        return {
            supportedTypes: this.supportedTypes,
            gensparkSubTypes: this.gensparkSubTypes,
            automationStatus: {
                report: typeof window.ReportAutomation !== 'undefined',
                genspark: typeof window.GensparkAutomationV2 !== 'undefined'
            }
        };
    }
}

// グローバルインスタンス作成
window.specialTaskProcessor = new SpecialTaskProcessor();

// ========================================
// Step 4-6: メイン実行関数（統合版）
// ========================================
async function executeStep4(taskList) {
    console.log('🔍 [DEBUG] executeStep4関数定義開始');
    console.log('🚀 Step 4-6 Execute 統合実行開始', taskList);

    // 内部関数の存在確認（実行時チェック）
    console.log('🔍 [DEBUG] 内部関数の定義状態確認:', {
        executeNormalAITask: typeof executeNormalAITask,
        processTaskResult: typeof processTaskResult,
        shouldPerformWindowCleanup: typeof shouldPerformWindowCleanup,
        calculateLogCellRef: typeof calculateLogCellRef
    });

    const results = [];
    let windowLayoutInfo = null;
    let enrichedTaskList = null;

    try {
        // Step 4-6-1: 初期化とグループタイプ判定
        console.log('📋 [Step 4-6-1] 初期化とグループタイプ判定開始');

        // グループタイプの判定
        const groupTypeInfo = window.taskGroupTypeDetector.detectGroupType(taskList);
        console.log('🎯 [Step 4-6-1] グループタイプ判定結果:', groupTypeInfo);

        // ウィンドウ配置情報の取得
        windowLayoutInfo = window.taskGroupTypeDetector.getWindowLayout(groupTypeInfo.type, groupTypeInfo.aiTypes);
        console.log('🖼️ [Step 4-6-1] ウィンドウ配置情報:', windowLayoutInfo);

        // Step 4-6-2: スプレッドシートデータの動的取得
        console.log('📊 [Step 4-6-2] スプレッドシートデータ動的取得開始');

        enrichedTaskList = await window.spreadsheetDataManager.enrichTaskList(taskList);
        console.log('✅ [Step 4-6-2] タスクリスト拡張完了:', enrichedTaskList.length, '個のタスク');

        // Step 4-6-3: ウィンドウ開く
        console.log('🪟 [Step 4-6-3] ウィンドウ開く処理開始');

        const windowResults = await window.windowController.openWindows(windowLayoutInfo);
        const successfulWindows = windowResults.filter(w => w.success);
        console.log(`✅ [Step 4-6-3] ウィンドウ開く完了: ${successfulWindows.length}/${windowResults.length}個成功`);

        if (successfulWindows.length === 0) {
            throw new Error('ウィンドウを開くことができませんでした');
        }

        // Step 4-6-4: ウィンドウチェック
        console.log('🔍 [Step 4-6-4] ウィンドウチェック開始');

        const aiTypes = successfulWindows.map(w => w.aiType);
        const checkResults = await window.windowController.checkWindows(aiTypes);
        console.log('✅ [Step 4-6-4] ウィンドウチェック完了:', checkResults);

        // Step 4-6-5: ライフサイクル管理初期化
        console.log('🔄 [Step 4-6-5] ライフサイクル管理初期化');

        await window.windowLifecycleManager.initializeLifecycleManager();

        // 各ウィンドウを登録
        for (const windowResult of successfulWindows) {
            const windowInfo = window.windowController.openedWindows.get(windowResult.aiType);
            if (windowInfo) {
                window.windowLifecycleManager.registerWindow(windowResult.aiType, windowInfo);
            }
        }

        // Step 4-6-6: 各タスクの実行
        console.log('⚡ [Step 4-6-6] タスク実行ループ開始');

        for (let i = 0; i < enrichedTaskList.length; i++) {
            const task = enrichedTaskList[i];
            const taskId = task.id || task.taskId || `${task.column}${task.row}`;

            try {
                console.log(`📝 [Step 4-6-6-${i + 1}] タスク実行開始: ${taskId} (AI: ${task.aiType})`);

                // Step 4-6-6-1: 特別処理タスクの判定
                const specialInfo = window.specialTaskProcessor.identifySpecialTask(task);

                let result = null;

                if (specialInfo.isSpecial) {
                    // 特別処理の実行
                    console.log(`🔧 [Step 4-6-6-${i + 1}] 特別処理実行: ${specialInfo.type}`);
                    const windowInfo = window.windowController.openedWindows.get(task.aiType);
                    result = await window.specialTaskProcessor.executeSpecialTask(task, specialInfo, windowInfo);
                } else {
                    // 通常のAI処理の実行
                    console.log(`🤖 [Step 4-6-6-${i + 1}] 通常AI処理実行: ${task.aiType}`);
                    console.log(`🔧 [DEBUG] executeNormalAITask呼び出し前 - 関数存在確認:`, typeof executeNormalAITask);
                    result = await executeNormalAITask(task);
                }

                // Step 4-6-6-2: 結果処理とログ記録
                console.log(`🔧 [DEBUG] processTaskResult呼び出し前 - 関数存在確認:`, typeof processTaskResult);
                await processTaskResult(task, result, taskId);

                results.push({
                    taskId: taskId,
                    aiType: task.aiType,
                    success: result.success,
                    result: result,
                    specialProcessing: specialInfo.isSpecial
                });

                console.log(`✅ [Step 4-6-6-${i + 1}] タスク完了: ${taskId}`);

            } catch (error) {
                console.error(`❌ [Step 4-6-6-${i + 1}] タスク失敗: ${taskId}`, error);

                results.push({
                    taskId: taskId,
                    aiType: task.aiType,
                    success: false,
                    error: error.message,
                    specialProcessing: false
                });

                // エラー時もライフサイクル処理を実行
                await window.windowLifecycleManager.handleTaskCompletion(task, { success: false, error: error.message });
            }

            // タスク間の待機時間
            if (i < enrichedTaskList.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        console.log('🏁 [Step 4-6-6] 全タスク実行完了');

    } catch (error) {
        console.error('❌ [Step 4-6] メイン実行エラー:', error);
        results.push({
            taskId: 'SYSTEM_ERROR',
            aiType: 'SYSTEM',
            success: false,
            error: error.message
        });
    } finally {
        // Step 4-6-7: クリーンアップ処理
        console.log('🧹 [Step 4-6-7] クリーンアップ処理開始');

        try {
            // 全ウィンドウのクリーンアップ（設定により制御可能）
            console.log(`🔧 [DEBUG] shouldPerformWindowCleanup呼び出し前 - 関数存在確認:`, typeof shouldPerformWindowCleanup);
            const shouldCleanupWindows = shouldPerformWindowCleanup(results);
            if (shouldCleanupWindows) {
                await window.windowLifecycleManager.cleanupAllWindows();
            }
        } catch (cleanupError) {
            console.error('⚠️ [Step 4-6-7] クリーンアップエラー:', cleanupError);
        }
    }

    console.log('🏁 Step 4-6 Execute 統合実行完了', {
        totalTasks: enrichedTaskList?.length || 0,
        successfulTasks: results.filter(r => r.success).length,
        failedTasks: results.filter(r => !r.success).length,
        windowLayout: windowLayoutInfo?.length || 0
    });

    // ========================================
    // Step 4-6: サブ関数群
    // ========================================

    /**
     * Step 4-6-8: 通常AI処理の実行
     */
    async function executeNormalAITask(task) {
        console.log(`🤖 [Step 4-6-8] 通常AI処理実行開始: ${task.aiType}`);

        const taskId = task.id || task.taskId || `${task.column}${task.row}`;

        // タスク開始ログ記録
        const windowInfo = window.windowController.openedWindows.get(task.aiType);
        if (window.detailedLogManager) {
            window.detailedLogManager.recordTaskStart(task, windowInfo);
        }

        // AI種別の正規化
        let normalizedAiType = task.aiType;
        if (task.aiType === 'single' || !task.aiType) {
            console.log(`[Step 4-6-8] AIタイプ '${task.aiType}' を 'Claude' に変換`);
            normalizedAiType = 'Claude';
        }

        // AI自動化ファイルの読み込み確認
        const aiType = normalizedAiType.toLowerCase();
        if (!window.aiAutomationLoader.isAIAvailable(aiType)) {
            console.log(`[Step 4-6-8] ${normalizedAiType} 自動化ファイルを読み込み中...`);
            await window.aiAutomationLoader.loadAIFile(aiType);
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        // 送信時刻記録
        if (window.detailedLogManager) {
            window.detailedLogManager.recordSendTime(taskId, windowInfo?.url);
        }

        // Retry機能付きでAI実行
        const executeFunction = async () => {
            switch (aiType) {
                case 'chatgpt':
                    if (!window.ChatGPTAutomationV2) throw new Error('ChatGPT Automation が利用できません');
                    return await window.ChatGPTAutomationV2.executeTask(task);

                case 'claude':
                    if (!window.ClaudeAutomation) throw new Error('Claude Automation が利用できません');
                    return await window.ClaudeAutomation.executeTask(task);

                case 'gemini':
                    if (!window.GeminiAutomation) throw new Error('Gemini Automation が利用できません');
                    return await window.GeminiAutomation.executeTask(task);

                case 'genspark':
                    if (!window.GensparkAutomationV2) throw new Error('Genspark Automation が利用できません');
                    return await window.GensparkAutomationV2.executeTask(task);

                case 'report':
                    if (!window.ReportAutomation) throw new Error('Report Automation が利用できません');
                    return await window.ReportAutomation.executeTask(task, task.spreadsheetData || {});

                default:
                    throw new Error(`未対応のAI種別: ${normalizedAiType}`);
            }
        };

        const result = await window.windowLifecycleManager.executeWithRetry(
            executeFunction,
            task,
            `${normalizedAiType} AI実行`
        );

        console.log(`✅ [Step 4-6-8] 通常AI処理実行完了: ${task.aiType}`);
        return result;
    }

    /**
     * Step 4-6-9: タスク結果の処理
     */
    async function processTaskResult(task, result, taskId) {
        console.log(`📋 [Step 4-6-9] タスク結果処理開始: ${taskId}`);

        try {
            // 完了時刻とログ記録
            if (window.detailedLogManager) {
                window.detailedLogManager.recordTaskComplete(taskId, result);
            }

            // 回答をスプレッドシートに記載
            if (result.success && result.response) {
                const answerCellRef = task.answerCellRef || task.cellRef || `${task.column}${task.row}`;
                if (window.detailedLogManager) {
                    await window.detailedLogManager.writeAnswerToSpreadsheet(taskId, answerCellRef);
                }
            }

            // ログをスプレッドシートに記載
            console.log(`🔧 [DEBUG] calculateLogCellRef呼び出し前 - 関数存在確認:`, typeof calculateLogCellRef);
            const logCellRef = task.logCellRef || calculateLogCellRef(task);
            if (logCellRef && window.detailedLogManager) {
                await window.detailedLogManager.writeLogToSpreadsheet(taskId, logCellRef);
            }

            // ライフサイクル完了処理
            await window.windowLifecycleManager.handleTaskCompletion(task, result);

            console.log(`✅ [Step 4-6-9] タスク結果処理完了: ${taskId}`);

        } catch (error) {
            console.error(`❌ [Step 4-6-9] タスク結果処理エラー: ${taskId}`, error);
        }
    }

    /**
     * ログセル位置の計算
     */
    function calculateLogCellRef(task) {
        const cellRef = task.cellRef || `${task.column}${task.row}`;
        if (!cellRef) return null;

        // 簡単な実装: A列をログ列として使用
        const match = cellRef.match(/^([A-Z]+)(\d+)$/);
        if (match) {
            return `A${match[2]}`;
        }
        return null;
    }

    /**
     * ウィンドウクリーンアップ判定
     */
    function shouldPerformWindowCleanup(results) {
        // エラーが多い場合はウィンドウを保持（デバッグ用）
        const errorCount = results.filter(r => !r.success).length;
        const totalCount = results.length;

        if (totalCount === 0) return true;

        const errorRate = errorCount / totalCount;
        return errorRate < 0.5; // エラー率50%未満の場合はクリーンアップ
    }

    console.log('✅ [DEBUG] executeStep4関数定義完了');
    return results;
}

// ステップ4実行関数をグローバルに公開
console.log('🔍 [DEBUG] window.executeStep4エクスポート実行');
console.log('🔍 [DEBUG] エクスポート前のexecuteStep4関数状態:', {
    executeStep4Type: typeof executeStep4,
    executeStep4Exists: typeof executeStep4 === 'function',
    executeStep4Name: executeStep4?.name
});
window.executeStep4 = executeStep4;
console.log('✅ [DEBUG] window.executeStep4エクスポート完了:', {
    windowExecuteStep4Type: typeof window.executeStep4,
    windowExecuteStep4Exists: typeof window.executeStep4 === 'function',
    windowExecuteStep4Name: window.executeStep4?.name,
    globalAccess: typeof globalThis?.executeStep4 === 'function'
});

console.log('🔍 [DEBUG] step4-execute.js 読み込み開始');

console.log('✅ [DEBUG] クラス定義完了:', 'AIAutomationLoader');
console.log('✅ [DEBUG] クラス定義完了:', 'TaskGroupTypeDetector');
console.log('✅ [DEBUG] クラス定義完了:', 'WindowController');
console.log('✅ [DEBUG] クラス定義完了:', 'SpreadsheetDataManager');
console.log('✅ [DEBUG] クラス定義完了:', 'DetailedLogManager');
console.log('✅ [DEBUG] クラス定義完了:', 'WindowLifecycleManager');
console.log('✅ [DEBUG] クラス定義完了:', 'SpecialTaskProcessor');

console.log('✅ Step 4-6 Execute - AI自動化制御ファイル準備完了（統合版）');
console.log('🎯 利用可能機能:');
console.log('  - グループタイプ自動判定（通常処理/3種類AI）');
console.log('  - 4分割ウィンドウ自動配置');
console.log('  - スプレッドシートデータ動的取得');
console.log('  - 詳細ログ自動記載');
console.log('  - ウィンドウライフサイクル管理');
console.log('  - 特別処理（レポート/Genspark）');
console.log('📖 使用方法: executeStep4([{id: "task1", aiType: "ChatGPT", prompt: "Hello", column: "B", row: "3"}])');