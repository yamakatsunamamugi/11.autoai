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
   * @param {string} request.prompt - 送信するプロンプト（省略可能、動的取得する場合）
   * @param {Object} request.taskInfo - タスク情報（動的取得用）
   * @param {string} request.taskId - タスクID
   * @param {number} request.timeout - タイムアウト時間（ミリ秒）
   * @param {Object} sender - 送信元情報
   * @returns {Promise<Object>} 実行結果
   */
  async handleExecuteAITask(request, sender) {
    let { tabId, prompt, taskId, timeout = 180000, model, specialOperation, aiType, cellInfo, taskInfo, spreadsheetId } = request;
    
    // デバッグ: taskInfo確認
    console.log(`[AITaskHandler] handleExecuteAITask - taskInfo受信:`, taskInfo);
    
    // promptが無い場合は動的に取得
    if (!prompt && taskInfo && spreadsheetId) {
      try {
        this.log(`[AITaskHandler] 📋 プロンプトを動的取得中...`, {
          row: taskInfo.row,
          promptColumns: taskInfo.promptColumns,
          spreadsheetId
        });
        
        // Google Sheets APIを使用してプロンプトを取得
        prompt = await this.fetchPromptFromSpreadsheet(spreadsheetId, taskInfo);
        
        if (!prompt) {
          throw new Error('プロンプトの取得に失敗しました');
        }
        
        this.log(`[AITaskHandler] ✅ プロンプト取得成功 (${prompt.length}文字)`);
      } catch (error) {
        this.error(`[AITaskHandler] ❌ プロンプト取得エラー:`, error);
        throw error;
      }
    }
    
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
      promptLength: prompt?.length || 0,
      hasPrompt: !!prompt,
      promptPreview: prompt ? prompt.substring(0, 100) + '...' : '❌ プロンプトが空です！'
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
      // 🔍 DEBUG: sendPromptToTab呼び出し前の確認
      this.log(`[AITaskHandler] 🔍 DEBUG: sendPromptToTab呼び出し前`, {
        promptExists: !!prompt,
        promptLength: prompt?.length || 0,
        promptType: typeof prompt,
        promptPreview: prompt ? prompt.substring(0, 200) + '...' : '❌ プロンプトが空！'
      });
      
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
  
  /**
   * スプレッドシートからプロンプトを動的に取得
   * @param {string} spreadsheetId - スプレッドシートID
   * @param {Object} taskInfo - タスク情報
   * @returns {Promise<string>} 結合されたプロンプト
   */
  async fetchPromptFromSpreadsheet(spreadsheetId, taskInfo) {
    const { row, promptColumns, sheetName } = taskInfo;
    
    console.log(`[AITaskHandler] ========== fetchPromptFromSpreadsheet START ==========`);
    console.log(`[AITaskHandler] STEP 1: 入力パラメータ確認`);
    console.log(`[AITaskHandler]   - spreadsheetId: ${spreadsheetId}`);
    console.log(`[AITaskHandler]   - row: ${row}`);
    console.log(`[AITaskHandler]   - sheetName: "${sheetName}" (type: ${typeof sheetName})`);
    
    this.log(`[AITaskHandler] 📋 fetchPromptFromSpreadsheet開始:`, {
      row,
      promptColumns,
      spreadsheetId,
      sheetName,
      hasSheetName: !!sheetName,
      sheetNameType: typeof sheetName
    });
    
    if (!promptColumns || promptColumns.length === 0) {
      console.error(`[AITaskHandler] ❌ プロンプト列情報がありません`);
      this.error(`[AITaskHandler] ❌ プロンプト列情報がありません`);
      throw new Error('プロンプト列情報がありません');
    }
    
    try {
      console.log(`[AITaskHandler] STEP 2: 列名変換処理`);
      // 列名を取得（例: ['G', 'H', 'I']）
      const columnLetters = promptColumns.map((col, index) => {
        const letter = typeof col === 'string' ? col : this.indexToColumn(col);
        return letter;
      });
      
      console.log(`[AITaskHandler] STEP 3: 範囲文字列構築`);
      // 複数のセル範囲を一度に取得（例: 'G10:I10'）
      const startCol = columnLetters[0];
      const endCol = columnLetters[columnLetters.length - 1];
      console.log(`[AITaskHandler]   - 開始列: ${startCol}`);
      console.log(`[AITaskHandler]   - 終了列: ${endCol}`);
      
      // シート名が指定されていればシート名を含める
      const rangeWithoutSheet = `${startCol}${row}:${endCol}${row}`;
      console.log(`[AITaskHandler]   - シート名なし範囲: ${rangeWithoutSheet}`);
      
      const range = sheetName ? `'${sheetName}'!${rangeWithoutSheet}` : rangeWithoutSheet;
      console.log(`[AITaskHandler]   - 最終範囲: ${range}`);
      
      this.log(`[AITaskHandler] 📊 スプレッドシートから範囲取得: ${range}`);
      
      console.log(`[AITaskHandler] STEP 4: sheetsClient確認`);
      // sheetsClientを直接使用（background.jsのグローバル変数）
      if (!globalThis.sheetsClient) {
        console.error(`[AITaskHandler] ❌ sheetsClientが初期化されていません`);
        this.error(`[AITaskHandler] ❌ sheetsClientが初期化されていません`);
        throw new Error('sheetsClientが初期化されていません');
      }
      console.log(`[AITaskHandler]   - sheetsClient: 利用可能`);
      
      console.log(`[AITaskHandler] STEP 5: Google Sheets API呼び出し`);
      console.log(`[AITaskHandler]   - 呼び出し: sheetsClient.getSheetData("${spreadsheetId}", "${range}")`);
      
      // Google Sheets APIを直接呼び出し
      const data = await globalThis.sheetsClient.getSheetData(spreadsheetId, range);
      
      console.log(`[AITaskHandler] STEP 6: APIレスポンス受信`);
      console.log('[AITaskHandler]   - Raw API data:', data);
      
      console.log(`[AITaskHandler] STEP 7: データ構造確認`);
      console.log(`[AITaskHandler]   - dataが存在: ${!!data}`);
      console.log(`[AITaskHandler]   - dataの型: ${typeof data}`);
      console.log(`[AITaskHandler]   - dataが配列: ${Array.isArray(data)}`);
      console.log(`[AITaskHandler]   - dataの長さ: ${Array.isArray(data) ? data.length : '配列ではない'}`);
      if (Array.isArray(data) && data.length > 0) {
        console.log(`[AITaskHandler]   - data[0]の内容: ${JSON.stringify(data[0])}`);
      }
      
      this.log(`[AITaskHandler] 📬 Google Sheets API応答:`, {
        hasData: !!data,
        isArray: Array.isArray(data),
        dataLength: Array.isArray(data) ? data.length : 'not array',
        firstRow: Array.isArray(data) && data.length > 0 ? data[0] : 'no data'
      });
      
      if (!data && !Array.isArray(data)) {
        console.error(`[AITaskHandler] ❌ Sheets API エラー: データが取得できません`);
        this.error(`[AITaskHandler] ❌ Sheets API エラー: データが取得できません`);
        throw new Error('スプレッドシートのデータ取得に失敗');
      }
      
      console.log(`[AITaskHandler] STEP 8: 値の抽出`);
      // 取得したデータから値を抽出して結合
      // dataは配列として返される (values配列そのもの)
      const values = Array.isArray(data) && data.length > 0 ? data[0] : [];
      console.log(`[AITaskHandler]   - values配列: ${JSON.stringify(values)}`);
      console.log(`[AITaskHandler]   - valuesの長さ: ${values.length}`);
      
      this.log(`[AITaskHandler] 📝 取得した値の配列:`, {
        valuesCount: values.length,
        values: values,
        rawData: data
      });
      
      const prompts = [];
      
      for (let i = 0; i < values.length; i++) {
        const value = values[i];
        console.log(`[AITaskHandler]   - values[${i}]: "${value}" (type: ${typeof value})`);
        if (value && value.trim()) {
          const trimmed = value.trim();
          console.log(`[AITaskHandler]     -> トリム後: "${trimmed}" (長さ: ${trimmed.length})`);
          prompts.push(trimmed);
        } else {
          console.log(`[AITaskHandler]     -> 空または空白のためスキップ`);
        }
      }
      
      
      this.log(`[AITaskHandler] 📝 フィルター後のプロンプト:`, {
        promptsCount: prompts.length,
        totalLength: prompts.join('\n').length
      });
      
      if (prompts.length === 0) {
        console.error(`[AITaskHandler] ❌ プロンプトが空です`);
        this.error(`[AITaskHandler] ❌ セル${columnLetters.join(',')}${row}が空です（プロンプトが入力されていません）`, {
          検索範囲: range,
          取得データ: values,
          スプレッドシートを確認してください: `G${row}セルにプロンプトを入力してください`
        });
        throw new Error(`セル${columnLetters.join(',')}${row}が空です。スプレッドシートのG${row}セルにプロンプトを入力してください`);
      }
      
      // プロンプトを改行で結合
      const combinedPrompt = prompts.join('\n');
      
      this.log(`[AITaskHandler] ✅ プロンプト結合完了:`, {
        promptCount: prompts.length,
        totalLength: combinedPrompt.length,
        preview: combinedPrompt.substring(0, 200) + '...'
      });
      
      return combinedPrompt;
    } catch (error) {
      this.error(`[AITaskHandler] ❌ スプレッドシート取得エラー:`, error);
      throw error;
    }
  }
  
  /**
   * 列インデックスを列文字に変換
   * @param {number} index - 列インデックス（0ベース）
   * @returns {string} 列文字（例: 0 -> 'A', 25 -> 'Z', 26 -> 'AA'）
   */
  indexToColumn(index) {
    let column = '';
    let quotient = index;
    
    while (quotient >= 0) {
      const remainder = quotient % 26;
      column = String.fromCharCode(65 + remainder) + column;
      quotient = Math.floor(quotient / 26) - 1;
    }
    
    return column;
  }
  
}

// シングルトンインスタンスをエクスポート
export const aiTaskHandler = new AITaskHandler();