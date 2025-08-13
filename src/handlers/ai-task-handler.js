/**
 * @fileoverview AIタスク実行ハンドラー
 * 
 * 概要:
 * StreamProcessor（src/features/task/stream-processor.js）から送信される
 * AIタスク実行要求を処理するハンドラークラス。
 * 
 * 責任:
 * - executeAITaskメッセージの処理
 * - 対象タブ（AI画面）へのプロンプト送信
 * - AI応答の待機と収集
 * - エラーハンドリング
 * 
 * 処理フロー:
 * 1. StreamProcessor → background.js → AITaskHandler
 * 2. AITaskHandler → コンテンツスクリプト（ai-content-unified.js）
 * 3. コンテンツスクリプト → AI画面でプロンプト実行
 * 4. 応答を収集して返却
 * 
 * 関連ファイル:
 * - src/features/task/stream-processor.js (呼び出し元)
 * - src/content/ai-content-unified.js (実行先)
 * - background.js (メッセージルーティング)
 * 
 * @class AITaskHandler
 */

export class AITaskHandler {
  constructor() {
    this.logger = console;
    this.pendingTasks = new Map(); // taskId -> Promise resolver
  }

  /**
   * executeAITaskメッセージを処理
   * StreamProcessorから呼び出される
   * 
   * @param {Object} request - リクエストオブジェクト
   * @param {number} request.tabId - 対象タブID
   * @param {string} request.prompt - 送信するプロンプト
   * @param {string} request.taskId - タスクID
   * @param {number} request.timeout - タイムアウト時間（ミリ秒）
   * @param {Object} sender - 送信元情報
   * @returns {Promise<Object>} 実行結果
   */
  async handleExecuteAITask(request, sender) {
    const { tabId, prompt, taskId, timeout = 180000 } = request;
    
    this.logger.log(`[AITaskHandler] タスク実行開始: ${taskId}`);
    this.logger.log(`[AITaskHandler] タブID: ${tabId}, プロンプト: ${prompt ? prompt.substring(0, 50) : 'なし'}...`);
    
    try {
      // タブの存在確認
      const tab = await chrome.tabs.get(tabId);
      if (!tab) {
        throw new Error(`タブが見つかりません: ${tabId}`);
      }
      
      // コンテンツスクリプトにプロンプト送信を依頼
      const sendResult = await this.sendPromptToTab(tabId, {
        action: "sendPrompt",
        prompt: prompt,
        taskId: taskId
      });
      
      if (!sendResult.success) {
        throw new Error(`プロンプト送信失敗: ${sendResult.error}`);
      }
      
      // 応答待機（タイムアウト付き）
      const response = await this.waitForAIResponse(tabId, taskId, timeout);
      
      this.logger.log(`[AITaskHandler] タスク完了: ${taskId}`);
      
      return {
        success: true,
        response: response.text,
        aiType: response.aiType || 'unknown',
        taskId: taskId
      };
      
    } catch (error) {
      this.logger.error(`[AITaskHandler] エラー:`, error);
      return {
        success: false,
        error: error.message,
        taskId: taskId
      };
    }
  }
  
  /**
   * タブにプロンプトを送信
   * 
   * @param {number} tabId - 対象タブID
   * @param {Object} message - 送信メッセージ
   * @returns {Promise<Object>} 送信結果
   */
  async sendPromptToTab(tabId, message) {
    this.logger.log(`[AITaskHandler] タブ${tabId}にメッセージ送信:`, {
      action: message.action,
      taskId: message.taskId,
      hasPrompt: !!message.prompt
    });
    
    return new Promise((resolve) => {
      chrome.tabs.sendMessage(tabId, message, (response) => {
        if (chrome.runtime.lastError) {
          this.logger.error(`[AITaskHandler] タブ送信エラー:`, {
            error: chrome.runtime.lastError.message,
            tabId: tabId,
            action: message.action
          });
          resolve({ 
            success: false, 
            error: chrome.runtime.lastError.message 
          });
        } else {
          this.logger.log(`[AITaskHandler] タブからの応答:`, response);
          resolve(response || { success: true });
        }
      });
    });
  }
  
  /**
   * AI応答を待機
   * 
   * @param {number} tabId - 対象タブID
   * @param {string} taskId - タスクID
   * @param {number} timeout - タイムアウト時間
   * @returns {Promise<Object>} AI応答
   */
  async waitForAIResponse(tabId, taskId, timeout) {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.logger.error(`[AITaskHandler] 応答タイムアウト: ${taskId} (${timeout}ms)`);
        chrome.runtime.onMessage.removeListener(listener);
        reject(new Error(`応答タイムアウト: ${timeout}ms`));
      }, timeout);
      
      // 応答リスナーを設定
      const listener = (message, sender) => {
        // aiResponseメッセージを待機
        if (message.action === "aiResponse" && 
            message.taskId === taskId && 
            sender.tab?.id === tabId) {
          
          this.logger.log(`[AITaskHandler] 応答受信: ${taskId}`);
          clearTimeout(timeoutId);
          chrome.runtime.onMessage.removeListener(listener);
          resolve({
            text: message.response,
            aiType: message.aiType
          });
        }
      };
      
      chrome.runtime.onMessage.addListener(listener);
      this.logger.log(`[AITaskHandler] 応答待機開始: ${taskId} (最大${timeout}ms)`);
    });
  }
}

// シングルトンインスタンスをエクスポート
export const aiTaskHandler = new AITaskHandler();