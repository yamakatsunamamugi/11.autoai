/**
 * @fileoverview AIタスク実行共通モジュール
 * 
 * 概要:
 * 統合テストと本番環境の両方で使用される共通のAIタスク実行ロジック。
 * background.jsのexecuteAITask関数を独立モジュール化したもの。
 * 
 * 特徴:
 * - スクリプト注入処理
 * - 自動化オブジェクトの検索と実行
 * - DeepResearch/Genspark対応のタイムアウト制御
 * - エラーハンドリング
 * 
 * @module AITaskExecutor
 */

export class AITaskExecutor {
  constructor(logger = console) {
    this.logger = logger;
  }

  /**
   * AIタスクを実行する中央制御関数
   * @param {number} tabId - 実行対象のタブID
   * @param {Object} taskData - タスクデータ
   * @param {string} taskData.aiType - AI種別 (claude, chatgpt, gemini, genspark)
   * @param {string} taskData.taskId - タスクID
   * @param {string} taskData.model - モデル名
   * @param {string} taskData.function - 機能名
   * @param {string} taskData.prompt - プロンプトテキスト
   * @returns {Promise<Object>} 実行結果
   */
  async executeAITask(tabId, taskData) {
    const startTime = Date.now();
    const cellPosition = taskData.cellInfo?.column && taskData.cellInfo?.row 
      ? `${taskData.cellInfo.column}${taskData.cellInfo.row}` 
      : '不明';
    
    this.logger.log(`[AITaskExecutor] 🚀 AIタスク実行開始 [${cellPosition}セル] [${taskData.aiType}]:`, {
      セル: cellPosition,
      tabId,
      taskId: taskData.taskId,
      model: taskData.model,
      function: taskData.function,
      promptLength: taskData.prompt?.length,
      timestamp: new Date().toLocaleTimeString()
    });

    try {
      // AI固有のスクリプトマップ（統合テストと完全に同じ）
      const scriptFileMap = {
        'claude': 'automations/claude-automation-dynamic.js',
        'chatgpt': 'automations/chatgpt-automation.js',
        'gemini': 'automations/gemini-dynamic-automation.js',
        'genspark': 'automations/genspark-automation.js'
      };

      // 統合テストと同じ共通スクリプト
      const commonScripts = [
        'automations/feature-constants.js',
        'automations/common-ai-handler.js',
        'automations/deepresearch-handler.js',
        'automations/claude-deepresearch-selector.js'
      ];

      // AI固有のスクリプトを追加（統合テストと同じ方式）
      const aiScript = scriptFileMap[taskData.aiType.toLowerCase()] || 
                       `automations/${taskData.aiType.toLowerCase()}-automation.js`;
      
      // 共通スクリプトを順番に注入
      let scriptsToInject = [...commonScripts, aiScript];

      this.logger.log(`[AITaskExecutor] 📝 [${taskData.aiType}] スクリプト注入開始:`, {
        scripts: scriptsToInject.map(s => s.split('/').pop()),
        count: scriptsToInject.length
      });

      // スクリプトを注入（統合テストと同じ方式）
      await chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: scriptsToInject
      });

      this.logger.log(`[AITaskExecutor] ✅ [${taskData.aiType}] スクリプト注入完了、初期化待機中...`);

      // スクリプト初期化を待つ（統合テストと同じ2秒待機）
      await new Promise(resolve => setTimeout(resolve, 2000));

      this.logger.log(`[AITaskExecutor] 🔄 [${taskData.aiType}] タスク実行開始...`);
      
      // タスクを実行
      const result = await chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: async (taskData) => {
          try {
            // 統合テストと同じAI自動化オブジェクト検索方式
            const automationMap = {
              'Claude': ['ClaudeAutomation', 'Claude'],
              'ChatGPT': ['ChatGPTAutomation', 'ChatGPT'],
              'Gemini': ['Gemini', 'GeminiAutomation'],
              'Genspark': ['GensparkAutomation', 'Genspark']
            };

            const possibleNames = automationMap[taskData.aiType] || [`${taskData.aiType}Automation`];
            let automation = null;
            let foundName = null;

            for (const name of possibleNames) {
              if (window[name]) {
                automation = window[name];
                foundName = name;
                break;
              }
            }

            console.log(`[ExecuteAITask] 🔍 ${taskData.aiType}の自動化オブジェクトを探しています...`);
            console.log(`[ExecuteAITask] 📋 利用可能な候補: ${possibleNames.join(', ')}`);

            if (!automation) {
              const availableKeys = Object.keys(window).filter(key =>
                key.includes('Automation') || key.includes(taskData.aiType)
              );
              console.error(`[ExecuteAITask] ❌ ${taskData.aiType}の自動化オブジェクトが見つかりません`);
              console.log(`[ExecuteAITask] 📋 ウィンドウで利用可能: ${availableKeys.join(', ')}`);
              return { success: false, error: `${taskData.aiType}の自動化オブジェクトが見つかりません` };
            }

            console.log(`[ExecuteAITask] ✅ ${foundName}を発見、実行開始`);

            // DeepResearchの判定（統合テストと同じ）
            const isDeepResearch = window.FeatureConstants ?
              window.FeatureConstants.isDeepResearch(taskData.function) :
              (taskData.function && taskData.function.toLowerCase().includes('research'));

            // タイムアウト設定（統合テストと同じ）
            const isGenspark = taskData.aiType.toLowerCase() === 'genspark';
            const timeout = isDeepResearch ? 60 * 60 * 1000 :
                           isGenspark ? 60 * 60 * 1000 :
                           60000;

            if (isDeepResearch) {
              console.log(`[ExecuteAITask] 🔬 ${taskData.aiType} DeepResearchモード - 最大60分待機`);
            } else if (isGenspark) {
              console.log(`[ExecuteAITask] 📊 ${taskData.aiType} スライド生成モード - 最大60分待機`);
            } else {
              console.log(`[ExecuteAITask] ⚡ ${taskData.aiType} 通常モード - 最大1分待機`);
            }

            // グローバル変数に現在のタスク情報を設定（SpreadsheetLogger用）
            window.currentAITaskInfo = {
              taskId: taskData.taskId,
              model: taskData.model,
              aiType: taskData.aiType
            };
            console.log(`[ExecuteAITask] 📝 タスク情報をグローバル変数に設定:`, window.currentAITaskInfo);

            // 設定オブジェクト（統合テストと同じ形式）
            const config = {
              model: taskData.model,
              function: taskData.function,
              text: taskData.prompt,
              send: true,
              waitResponse: true,
              getResponse: true,
              timeout: timeout,
              cellInfo: taskData.cellInfo  // セル位置情報を追加
            };

            // runAutomationを実行
            if (typeof automation.runAutomation === 'function') {
              console.log(`[ExecuteAITask] 🎯 ${foundName}.runAutomationを実行中...`);
              const execStartTime = Date.now();
              const result = await automation.runAutomation(config);
              const execTime = ((Date.now() - execStartTime) / 1000).toFixed(1);
              
              console.log(`[ExecuteAITask] ✅ ${taskData.aiType} runAutomation完了:`, {
                success: result?.success,
                hasResponse: !!result?.response,
                responseLength: result?.response?.length,
                executionTime: `${execTime}秒`,
                error: result?.error
              });
              
              // タスク完了後、グローバル変数をクリア
              window.currentAITaskInfo = null;
              
              return result;
            } else {
              return { success: false, error: `${foundName}に適切な実行方法が見つかりません` };
            }

          } catch (error) {
            console.error(`[ExecuteAITask] 実行エラー:`, error);
            return { success: false, error: error.message };
          }
        },
        args: [taskData]
      });

      // 結果を返す
      if (result && result[0] && result[0].result) {
        const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
        const resultData = result[0].result;
        const cellPosition = taskData.cellInfo?.column && taskData.cellInfo?.row 
          ? `${taskData.cellInfo.column}${taskData.cellInfo.row}` 
          : '不明';
        
        if (resultData.success) {
          this.logger.log(`[AITaskExecutor] ✅ [${taskData.aiType}] タスク完了 [${cellPosition}セル]:`, {
            セル: cellPosition,
            taskId: taskData.taskId,
            success: true,
            responseLength: resultData.response?.length || 0,
            totalTime: `${totalTime}秒`
          });
        } else {
          // エラーの詳細情報をログに記録
          const errorMessage = `⚠️ [${taskData.aiType}] タスク失敗 [${cellPosition}セル]: ${resultData.error}`;
          
          // logManagerがある場合は詳細なエラー情報を記録
          if (this.logger.logAI) {
            this.logger.logAI(taskData.aiType, errorMessage, {
              level: 'error',
              metadata: {
                セル: cellPosition,
                taskId: taskData.taskId,
                error: resultData.error,
                errorDetails: resultData.errorDetails || {},
                totalTime: `${totalTime}秒`
              }
            });
          } else {
            this.logger.log(errorMessage, {
              セル: cellPosition,
              taskId: taskData.taskId,
              error: resultData.error,
              totalTime: `${totalTime}秒`
            });
          }
        }
        
        return resultData;
      } else {
        throw new Error('スクリプト実行結果が不正です');
      }

    } catch (error) {
      const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
      const cellPosition = taskData.cellInfo?.column && taskData.cellInfo?.row 
        ? `${taskData.cellInfo.column}${taskData.cellInfo.row}` 
        : '不明';
      
      const errorMessage = `❌ [${taskData.aiType}] 実行エラー [${cellPosition}セル]: ${error.message}`;
      
      // logManagerがある場合は詳細なエラー情報を記録
      if (this.logger.logAI) {
        this.logger.logAI(taskData.aiType, errorMessage, {
          level: 'error',
          metadata: {
            セル: cellPosition,
            taskId: taskData.taskId,
            error: error.message,
            errorStack: error.stack,
            errorName: error.name,
            totalTime: `${totalTime}秒`
          }
        });
      } else if (this.logger.error) {
        this.logger.error(errorMessage, {
          セル: cellPosition,
          taskId: taskData.taskId,
          error: error.message,
          stack: error.stack,
          totalTime: `${totalTime}秒`
        });
      } else {
        this.logger.log(errorMessage);
      }
      
      return {
        success: false,
        error: error.message,
        errorDetails: {
          message: error.message,
          stack: error.stack,
          name: error.name
        }
      };
    }
  }

  /**
   * 複数のAIタスクを並列実行
   * @param {Array<Object>} tasks - タスクの配列
   * @param {number} maxConcurrent - 最大同時実行数
   * @returns {Promise<Array<Object>>} 実行結果の配列
   */
  async executeMultipleTasks(tasks, maxConcurrent = 4) {
    const results = [];
    const executing = [];
    
    for (const task of tasks) {
      const promise = this.executeAITask(task.tabId, task).then(result => {
        return { taskId: task.taskId, result };
      });
      
      results.push(promise);
      
      if (tasks.length >= maxConcurrent) {
        executing.push(promise);
        
        if (executing.length >= maxConcurrent) {
          await Promise.race(executing);
          executing.splice(executing.findIndex(p => p.isResolved), 1);
        }
      }
    }
    
    return Promise.all(results);
  }
}

// デフォルトインスタンスをエクスポート
export const aiTaskExecutor = new AITaskExecutor();