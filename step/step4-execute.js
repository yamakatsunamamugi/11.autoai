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
            'chatgpt': './4-1-chatgpt-automation.js',
            'claude': './4-2-claude-automation.js',
            'gemini': './4-3-gemini-automation.js',
            'report': './4-4-report-automation.js',
            'genspark': './4-5-genspark-automation.js'
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
            console.log(`[AILoader] ${aiType} 自動化ファイル読み込み開始: ${filePath}`);

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
// メイン実行関数
// ========================================
async function executeStep4(taskList) {
    console.log('🚀 Step 4 Execute 実行開始', taskList);

    const results = [];

    for (const task of taskList) {
        try {
            // AI種別の正規化（singleをClaudeに変換）
            let normalizedAiType = task.aiType;
            if (task.aiType === 'single' || !task.aiType) {
                console.log(`[Step4] AIタイプ '${task.aiType}' を 'Claude' に変換`);
                normalizedAiType = 'Claude';
            }

            console.log(`📝 タスク実行開始: ${task.id} (AI: ${normalizedAiType})`);

            // AI自動化ファイルの読み込み確認
            const aiType = normalizedAiType.toLowerCase();
            if (!window.aiAutomationLoader.isAIAvailable(aiType)) {
                console.log(`[Step4] ${normalizedAiType} 自動化ファイルを読み込み中...`);
                await window.aiAutomationLoader.loadAIFile(aiType);

                // 読み込み後の待機
                await new Promise(resolve => setTimeout(resolve, 1000));
            }

            let result;

            // AI種別に応じて適切な自動化関数を呼び出し
            switch (aiType) {
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
                    throw new Error(`未対応のAI種別: ${normalizedAiType}`);
            }

            console.log(`✅ タスク完了: ${task.id}`, result);
            results.push({
                taskId: task.id,
                aiType: normalizedAiType,
                success: result.success,
                result: result
            });

        } catch (error) {
            console.error(`❌ タスク失敗: ${task.id}`, error);
            results.push({
                taskId: task.id,
                aiType: normalizedAiType || task.aiType,
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

console.log('✅ Step 4 Execute - AI自動化制御ファイル準備完了');
console.log('使用方法: executeStep4([{id: "task1", aiType: "ChatGPT", prompt: "Hello"}])');