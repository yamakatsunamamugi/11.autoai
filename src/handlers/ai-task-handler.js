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

// WindowServiceをインポート（ウィンドウ管理の一元化）
import { WindowService } from '../services/window-service.js';

export class AITaskHandler {
  constructor() {
    this.logger = console;
    this.pendingTasks = new Map(); // taskId -> Promise resolver
    // 拡張機能ログシステムとの連携用
    this.extensionLogger = null;
  }
  
  /**
   * 拡張機能のログシステムを設定
   * @param {Function} logFunction - ログ関数
   */
  setExtensionLogger(logFunction) {
    this.extensionLogger = logFunction;
  }
  
  /**
   * ログ出力（コンソール + 拡張機能ログ）
   */
  log(message, data = null) {
    this.logger.log(message, data);
    if (this.extensionLogger) {
      const logText = data ? `${message} ${JSON.stringify(data)}` : message;
      this.extensionLogger(logText, 'function');
    }
  }
  
  error(message, data = null) {
    this.logger.error(message, data);
    if (this.extensionLogger) {
      const logText = data ? `${message} ${JSON.stringify(data)}` : message;
      this.extensionLogger(logText, 'error');
    }
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
    const { tabId, prompt, taskId, timeout = 180000, model, specialOperation, aiType, cellInfo } = request;
    
    const cellPosition = cellInfo?.column && cellInfo?.row 
      ? `${cellInfo.column}${cellInfo.row}` 
      : '不明';
    
    this.log(`[AITaskHandler] 🚀 タスク実行開始 [${cellPosition}セル]: ${taskId}`, {
      セル: cellPosition,
      aiType: aiType || '未指定',
      taskId,
      column: cellInfo?.column,
      row: cellInfo?.row,
      tabId,
      promptLength: prompt?.length || 0
    });
    
    // モデル・機能情報を詳細ログ出力
    this.log(`[AITaskHandler] 🔧 タスク設定:`, {
      requestedModel: model || '未指定',
      specialOperation: specialOperation || 'なし',
      aiType: aiType || '未指定',
      timeout: `${timeout / 1000}秒`
    });
    
    try {
      // タブの存在確認
      const tab = await chrome.tabs.get(tabId);
      if (!tab) {
        throw new Error(`タブが見つかりません: ${tabId}`);
      }
      
      // WindowServiceを使用してAIページのウィンドウを最前面に表示（ウィンドウフォーカス処理を統一）
      this.log(`[AITaskHandler] 🔝 AIページのウィンドウを最前面に表示 (WindowID: ${tab.windowId})`);
      try {
        // WindowServiceのfocusWindow関数でウィンドウを最前面に（focused: true, drawAttention: true, state: 'normal'が自動設定される）
        await WindowService.focusWindow(tab.windowId);
        
        // WindowServiceを使用してタブもアクティブにする（タブ操作も統一）
        await WindowService.activateTab(tabId);
        
        // 少し待機して確実に最前面になるのを待つ
        await new Promise(resolve => setTimeout(resolve, 300));
        
        this.log(`[AITaskHandler] ✅ ウィンドウ最前面表示完了`);
      } catch (focusError) {
        this.log(`[AITaskHandler] ⚠️ ウィンドウ最前面表示エラー: ${focusError.message}`);
        // エラーが発生しても処理は続行
      }
      
      // コンテンツスクリプトにプロンプト送信を依頼（モデル・機能情報も含める）
      const sendResult = await this.sendPromptToTab(tabId, {
        action: "sendPrompt",
        prompt: prompt,
        taskId: taskId,
        model: model,  // タスクで指定されたモデル情報
        specialOperation: specialOperation,  // タスクで指定された機能情報
        aiType: aiType,  // AI種別
        cellInfo: cellInfo  // セル位置情報
      });
      
      if (!sendResult.success) {
        throw new Error(`プロンプト送信失敗: ${sendResult.error}`);
      }
      
      // ai-content-unified.jsで既に回答待機が完了しているため、
      // ここでは追加の待機は不要（sendResultに応答が含まれている）
      this.log(`[AITaskHandler] ✅ タスク完了 [${cellPosition}セル]: ${taskId}`, {
        セル: cellPosition,
        success: true,
        responseLength: sendResult.response?.length || 0,
        aiType: sendResult.aiType || 'unknown',
        actualModel: sendResult.model || '取得失敗',
        requestedModel: model || '未指定',
        modelMatch: sendResult.model === model ? '一致' : '不一致'
      });
      
      // モデル情報の詳細ログ
      if (sendResult.model) {
        this.log(`[AITaskHandler] 🎯 モデル情報取得成功: "${sendResult.model}"`);
      } else {
        this.log(`[AITaskHandler] ⚠️ モデル情報を取得できませんでした`);
      }
      
      return {
        success: true,
        response: sendResult.response || "[Request interrupted by user]回答テキスト取得できない　エラー",
        aiType: sendResult.aiType || 'unknown',
        model: sendResult.model,  // モデル情報を追加
        taskId: taskId
      };
      
    } catch (error) {
      this.error(`[AITaskHandler] ❌ タスク実行エラー [${cellPosition}セル]:`, {
        error: error.message,
        stack: error.stack,
        taskId,
        aiType,
        model
      });
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
    this.log(`[AITaskHandler] タブ${tabId}にメッセージ送信:`, {
      action: message.action,
      taskId: message.taskId,
      hasPrompt: !!message.prompt,
      promptPreview: message.prompt ? message.prompt.substring(0, 50) + '...' : 'なし'
    });
    
    return new Promise((resolve) => {
      const startTime = Date.now();
      chrome.tabs.sendMessage(tabId, message, (response) => {
        const elapsed = Date.now() - startTime;
        
        if (chrome.runtime.lastError) {
          this.error(`[AITaskHandler] タブ送信エラー (${elapsed}ms):`, {
            error: chrome.runtime.lastError.message,
            tabId: tabId,
            action: message.action
          });
          resolve({ 
            success: false, 
            error: chrome.runtime.lastError.message 
          });
        } else {
          this.log(`[AITaskHandler] タブからの応答 (${elapsed}ms):`, {
            success: response?.success,
            hasResponse: !!response?.response,
            aiType: response?.aiType,
            taskId: response?.taskId,
            responsePreview: response?.response ? response.response.substring(0, 100) + '...' : 'なし'
          });
          resolve(response || { success: true });
        }
      });
    });
  }
  
}

// シングルトンインスタンスをエクスポート
export const aiTaskHandler = new AITaskHandler();