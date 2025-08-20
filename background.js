// background.js - Service Worker 
console.log("AutoAI Service Worker が起動しました");

// 段階的復元: Step 1 - 基本サービスのみ（問題のあるファイルを除外）
import "./src/services/auth-service.js";
import "./src/features/spreadsheet/config.js";
import "./src/features/spreadsheet/url-parser.js";

// Step 3 - SheetsClientを追加
import "./src/features/spreadsheet/sheets-client.js";

// Step 4 - その他の基本ファイル
import "./src/features/spreadsheet/docs-client.js";
import "./src/features/spreadsheet/reader.js";

// Step 5 - タスク関連ファイル
import "./src/features/task/generator.js";
import TaskGenerator from "./src/features/task/generator.js";
import TaskQueue from "./src/features/task/queue.js";
import StreamProcessor from "./src/features/task/stream-processor.js";

// Step 6 - サービスファイル
import SpreadsheetAutoSetup from "./src/services/spreadsheet-auto-setup.js";
import SpreadsheetColumnRemover from "./src/services/spreadsheet-column-remover.js";

// Step 7 - コアモジュール
import "./src/core/streaming-service-manager.js";
import { getStreamingServiceManager } from "./src/core/streaming-service-manager.js";

// DeepResearchモジュール
import { deepResearchHandler } from "./src/modules/deep-research-handler.js";

// ===== AIタスク実行ハンドラー =====
// StreamProcessorからのAIタスク実行要求を処理
// 詳細な実装はsrc/handlers/ai-task-handler.jsに分離
// これにより、background.jsの肥大化を防ぎ、保守性を向上
import { aiTaskHandler } from "./src/handlers/ai-task-handler.js";

// ===== ウィンドウマネージャー =====
import { TestWindowManager } from "./src/ui/test-window-manager.js";

// グローバルにウィンドウマネージャーを設定
globalThis.aiWindowManager = new TestWindowManager();

// グローバルにAIタスクハンドラーを設定（StreamProcessorから直接アクセス可能にする）
globalThis.aiTaskHandler = aiTaskHandler;

// ===== 初期化完了後の処理 =====
// モジュール読み込み完了を待ってから初期化処理を実行
setTimeout(() => {
  console.log("モジュール読み込み完了、拡張機能初期化中...");

  // サービスの初期化確認
  if (
    globalThis.authService &&
    globalThis.sheetsClient &&
    globalThis.docsClient
  ) {
    console.log("✅ サービス初期化完了");
    console.log("  - authService: 利用可能");
    console.log("  - sheetsClient: 利用可能");
    console.log("  - docsClient: 利用可能");
    console.log("  - aiWindowManager: 利用可能");

    // 拡張機能インストール時の処理
    chrome.runtime.onInstalled.addListener(async () => {
      console.log("拡張機能がインストール/更新されました");
      // 自動認証は無効化（必要時のみ実行）
    });

    // Chrome起動時の処理
    chrome.runtime.onStartup.addListener(async () => {
      console.log("Chromeが起動しました");
      // 自動認証は無効化（必要時のみ実行）
    });
  } else {
    console.error("❌ サービス初期化に失敗しました");
    console.log("authService:", typeof globalThis.authService);
    console.log("sheetsClient:", typeof globalThis.sheetsClient);
    console.log("docsClient:", typeof globalThis.docsClient);
  }
}, 2000); // 2秒待機

// ===== グローバル変数 =====
let isProcessing = false;

// ===== AI実行制御（統合テストと同じアプローチ） =====
/**
 * AIタスクを実行する中央制御関数
 * コンテンツスクリプトから転送されたタスクをchrome.scripting.executeScriptで実行
 */
async function executeAITask(tabId, taskData) {
  console.log(`[Background] AIタスク実行開始:`, {
    tabId,
    aiType: taskData.aiType,
    function: taskData.function,
    promptLength: taskData.prompt?.length
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
    const aiScript = scriptFileMap[taskData.aiType.toLowerCase()] || `automations/${taskData.aiType.toLowerCase()}-automation.js`;
    
    // 共通スクリプトを順番に注入
    let scriptsToInject = [...commonScripts, aiScript];

    console.log(`[Background] スクリプト注入:`, scriptsToInject);

    // スクリプトを注入（統合テストと同じ方式）
    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: scriptsToInject
    });

    console.log(`[Background] スクリプト注入完了、初期化待機中...`);

    // スクリプト初期化を待つ（統合テストと同じ2秒待機）
    await new Promise(resolve => setTimeout(resolve, 2000));

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

          console.log(`[ExecuteAITask] ${taskData.aiType}の自動化オブジェクトを探しています...`);
          console.log(`[ExecuteAITask] 利用可能な候補: ${possibleNames.join(', ')}`);

          if (!automation) {
            const availableKeys = Object.keys(window).filter(key =>
              key.includes('Automation') || key.includes(taskData.aiType)
            );
            console.error(`[ExecuteAITask] ${taskData.aiType}の自動化オブジェクトが見つかりません`);
            console.log(`[ExecuteAITask] ウィンドウで利用可能: ${availableKeys.join(', ')}`);
            return { success: false, error: `${taskData.aiType}の自動化オブジェクトが見つかりません` };
          }

          console.log(`[ExecuteAITask] ${foundName}を発見、実行開始`);

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
            console.log(`[ExecuteAITask] ${taskData.aiType} DeepResearchモード - 最大60分待機`);
          } else if (isGenspark) {
            console.log(`[ExecuteAITask] ${taskData.aiType} スライド生成モード - 最大60分待機`);
          }

          // 設定オブジェクト（統合テストと同じ形式）
          const config = {
            model: taskData.model,
            function: taskData.function,
            text: taskData.prompt,
            send: true,
            waitResponse: true,
            getResponse: true,
            timeout: timeout
          };

          // runAutomationを実行
          if (typeof automation.runAutomation === 'function') {
            console.log(`[ExecuteAITask] ${foundName}.runAutomationを実行`);
            const result = await automation.runAutomation(config);
            console.log(`[ExecuteAITask] runAutomation完了:`, {
              success: result?.success,
              hasResponse: !!result?.response,
              responseLength: result?.response?.length
            });
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
      console.log(`[Background] AIタスク実行成功:`, {
        success: result[0].result.success,
        hasResponse: !!result[0].result.response
      });
      return result[0].result;
    } else {
      throw new Error('スクリプト実行結果が取得できませんでした');
    }

  } catch (error) {
    console.error(`[Background] AIタスク実行エラー:`, error);
    return { success: false, error: error.message };
  }
}

// ===== ヘルパー関数 =====
/**
 * 列名生成関数（A, B, ..., Z, AA, AB, ...）
 */
function getColumnName(index) {
  if (index < 0) return null;
  
  let columnName = '';
  let num = index;
  
  while (num >= 0) {
    columnName = String.fromCharCode(65 + (num % 26)) + columnName;
    num = Math.floor(num / 26) - 1;
    if (num < 0) break;
  }
  
  return columnName;
}

// ===== メッセージハンドラー =====
/**
 * processSpreadsheetData関数
 */
function processSpreadsheetData(spreadsheetData) {
  const result = {
    ...spreadsheetData,
    aiColumns: {},
    columnMapping: {},
  };

  if (!spreadsheetData.values || spreadsheetData.values.length === 0) {
    return result;
  }

  // メニュー行とAI行から情報を取得
  const menuRow = spreadsheetData.menuRow?.data || spreadsheetData.values[0];
  const aiRow = spreadsheetData.aiRow?.data || [];
  
  console.log("[Background] processSpreadsheetData - メニュー行:", menuRow);
  console.log("[Background] processSpreadsheetData - AI行:", aiRow);
  
  // 各列を解析
  menuRow.forEach((header, index) => {
    const columnLetter = getColumnName(index);
    const trimmedHeader = header ? header.trim() : "";
    const aiValue = aiRow[index] ? aiRow[index].trim() : "";
    
    // 列マッピングを作成
    result.columnMapping[columnLetter] = {
      index,
      header: trimmedHeader,
    };
    
    // デバッグログ
    if (index < 20) {
      console.log(`[Background] 列${columnLetter}: メニュー="${trimmedHeader}", AI="${aiValue}"`);
    }
    
    // プロンプト列の検出 - より柔軟に
    if (trimmedHeader === "プロンプト" || trimmedHeader.includes("プロンプト")) {
      // AI行の値を確認して3種類AIレイアウトを検出
      let aiType = null;
      
      // 3種類レイアウトのチェック（AI行に"3種類"がある場合）
      const nextAiValue = aiRow[index + 1] ? aiRow[index + 1].trim() : "";
      if (nextAiValue === "3種類") {
        aiType = "3type";
        console.log(`[Background] 3種類AIレイアウト検出: ${columnLetter}列`);
      }
      // メニュー行が"プロンプト"で、次の3列がChatGPT、Claude、Geminiを含む場合
      else if (trimmedHeader === "プロンプト" || trimmedHeader.includes("プロンプト")) {
        const nextHeaders = [
          menuRow[index + 1],
          menuRow[index + 2],
          menuRow[index + 3]
        ];
        
        console.log(`[Background] 次の列をチェック:`, nextHeaders);
        
        if ((nextHeaders[0] && nextHeaders[0].includes("ChatGPT") &&
             nextHeaders[1] && nextHeaders[1].includes("Claude") && 
             nextHeaders[2] && nextHeaders[2].includes("Gemini")) ||
            (nextHeaders[0] && nextHeaders[0].includes("回答") &&
             nextHeaders[1] && nextHeaders[1].includes("回答") &&
             nextHeaders[2] && nextHeaders[2].includes("回答"))) {
          aiType = "3type";
          console.log(`[Background] メニュー行から3種類AIレイアウト検出: ${columnLetter}列`);
        } else {
          // デフォルトでプロンプト列は登鞂（単独AI扱い）
          aiType = "single";
          console.log(`[Background] 単独AIプロンプト列として検出: ${columnLetter}列`);
        }
      }
      // 個別AIのチェック（メニュー行から）
      else if (trimmedHeader.startsWith("ChatGPT ")) {
        aiType = "chatgpt";
      } else if (trimmedHeader.startsWith("Claude ")) {
        aiType = "claude";
      } else if (trimmedHeader.startsWith("Gemini ")) {
        aiType = "gemini";
      }
      
      if (aiType) {
        result.aiColumns[columnLetter] = {
          index,
          letter: columnLetter,
          header: trimmedHeader,
          type: aiType,
          promptDescription: trimmedHeader === "プロンプト" ? "" : trimmedHeader.split(" ").slice(1).join(" ")
        };
        console.log(`[Background] AI列として登録: ${columnLetter}列 (${aiType})`);
      }
    }
  });
  
  console.log("[Background] 処理後のaiColumns:", result.aiColumns);

  return result;
}

/**
 * ポップアップ/ウィンドウからのメッセージを処理
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.action) {
    // ===== AIタスク実行（コンテンツスクリプトから転送） =====
    case "executeAITask":
      console.log("[MessageHandler] AIタスク実行要求:", {
        from: sender.tab?.url,
        tabId: sender.tab?.id,
        aiType: request.taskData?.aiType,
        function: request.taskData?.function
      });
      
      if (!sender.tab?.id) {
        sendResponse({ success: false, error: "タブIDが取得できません" });
        return false;
      }
      
      // 非同期でAIタスクを実行
      executeAITask(sender.tab.id, request.taskData)
        .then(result => {
          console.log("[MessageHandler] AIタスク実行完了:", result);
          sendResponse(result);
        })
        .catch(error => {
          console.error("[MessageHandler] AIタスク実行エラー:", error);
          sendResponse({ success: false, error: error.message });
        });
      
      return true; // 非同期応答のため true を返す
      
    // ----- スプレッドシート読み込み（タスク生成含む） -----
    case "loadSpreadsheet":
    case "loadSpreadsheets": // 互換性のため両方サポート
      (async () => {
        try {
          // 新旧フォーマット対応
          const url = request.url || (request.urls && request.urls[0]);
          console.log("[MessageHandler] スプレッドシート読み込み:", url);

          if (!url) {
            sendResponse({
              success: false,
              error: "URLが指定されていません",
            });
            return;
          }

          // 1. URLを解析
          const { spreadsheetId, gid } = globalThis.parseSpreadsheetUrl(url);
          if (!spreadsheetId) {
            sendResponse({
              success: false,
              error: "無効なスプレッドシートURLです",
            });
            return;
          }

          // 2. データを読み込み
          console.log("シートデータ読み込み中...");
          const updatedSpreadsheetData =
            await globalThis.sheetsClient.loadAutoAIData(spreadsheetId, gid);

          // 自動セットアップ
          const autoSetup = new SpreadsheetAutoSetup();
          const token = await globalThis.authService.getAuthToken();
          await autoSetup.executeAutoSetup(spreadsheetId, token, gid);

          // 3. データを整形（AI列情報を抽出）
          const processedData = processSpreadsheetData(updatedSpreadsheetData);
          
          // modelRowとtaskRowも含める
          processedData.modelRow = updatedSpreadsheetData.modelRow;
          processedData.taskRow = updatedSpreadsheetData.taskRow;
          
          console.log("[Background] 処理されたデータ:", {
            aiColumns: processedData.aiColumns,
            columnCount: Object.keys(processedData.columnMapping || {}).length,
            valueRows: updatedSpreadsheetData.values?.length || 0,
            modelRow: !!processedData.modelRow,
            taskRow: !!processedData.taskRow
          });

          // 4. タスクを生成
          console.log("タスク生成中...");
          const taskGenerator = new TaskGenerator();
          const taskList = await taskGenerator.generateTasks(processedData);  // awaitを追加
          
          // taskListとtasksの存在を確認
          if (!taskList || !taskList.tasks) {
            console.error("タスク生成失敗 - taskList:", taskList);
            throw new Error("タスク生成に失敗しました: タスクリストが空です");
          }
          
          console.log("[Background] 生成されたタスク:", {
            totalTasks: taskList.tasks.length,
            statistics: taskList.getStatistics(),
          });

          // 5. タスクを保存
          console.log("タスク保存中...");
          const taskQueue = new TaskQueue();
          const saveResult = await taskQueue.saveTaskList(taskList);

          // 6. レスポンスを返す
          const response = {
            success: true,
            ...processedData,
            taskCount: taskList.tasks ? taskList.tasks.length : 0,
            taskQueueStatus: saveResult,
          };
          console.log("[MessageHandler] レスポンス:", response);
          sendResponse(response);
        } catch (error) {
          console.error("[MessageHandler] エラー:", error);
          sendResponse({ success: false, error: error.message });
        }
      })();
      return true; // 非同期レスポンスを有効化

    // ----- 認証関連 -----
    case "getAuthStatus":
      (async () => {
        try {
          const status = await globalThis.authService.checkAuthStatus();
          sendResponse(status);
        } catch (error) {
          sendResponse({ isAuthenticated: false, error: error.message });
        }
      })();
      return true;

    case "authenticate":
      (async () => {
        try {
          const token = await globalThis.authService.getAuthToken();
          sendResponse({ success: true });
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        }
      })();
      return true;

    // ----- 自動テスト関連 -----
    case "checkServiceWorkerStatus":
      console.log("[MessageHandler] Service Worker ステータスチェック");
      sendResponse({ status: "ready", message: "Service Worker is active" });
      return false;

    case "checkAutoAIStatus":
      console.log("[MessageHandler] AutoAI ステータスチェック");
      const manager = getStreamingServiceManager();
      sendResponse({
        status: "ready",
        message: "AutoAI is ready",
        servicesReady: manager ? manager.isInitialized() : false,
      });
      return false;

    case "testServiceWorker":
      console.log("[MessageHandler] テストメッセージ受信:", request);
      sendResponse({ success: true, echo: request.data });
      return false;

    // ===== AIタスク実行 =====
    // StreamProcessorからのタスク実行要求を処理
    case "executeAITask":
      console.log("[MessageHandler] AIタスク実行要求:", {
        taskId: request.taskId,
        tabId: request.tabId,
        promptLength: request.prompt?.length || 0,
        waitResponse: request.waitResponse,
        getResponse: request.getResponse
      });
      
      // AITaskHandlerに処理を委譲（非同期処理）
      // waitResponse/getResponseの判定はAITaskHandler内で行う
      (async () => {
        try {
          const result = await aiTaskHandler.handleExecuteAITask(request, sender);
          sendResponse(result);
        } catch (error) {
          console.error("[MessageHandler] AIタスク実行エラー:", error);
          sendResponse({ 
            success: false, 
            error: error.message,
            taskId: request.taskId 
          });
        }
      })();
      return true; // 非同期応答のため true を返す

    // ===== コンテンツスクリプトからのメッセージ =====
    case "contentScriptReady":
      console.log("[MessageHandler] コンテンツスクリプト準備完了:", {
        tabId: sender.tab?.id,
        url: sender.tab?.url,
        aiType: request.aiType
      });
      sendResponse({ received: true });
      return false;

    case "aiResponse":
      console.log("[MessageHandler] AI応答受信:", {
        tabId: sender.tab?.id,
        taskId: request.taskId,
        responseLength: request.response?.length || 0
      });
      sendResponse({ received: true });
      return false;

    // ===== ストリーミング処理開始 =====
    case "streamProcessTasks":
      console.log("[MessageHandler] ストリーミング処理開始要求:", {
        spreadsheetId: request.spreadsheetId,
        taskCount: request.tasks?.length || 0,
        testMode: request.testMode
      });
      
      (async () => {
        try {
          // StreamingServiceManagerを取得
          const manager = getStreamingServiceManager();
          
          if (!manager) {
            throw new Error("StreamingServiceManagerが取得できません");
          }
          
          // 初期化完了を待つ
          await manager.waitForInitialization();
          
          // ストリーミング処理を開始
          const result = await manager.startStreaming({
            spreadsheetId: request.spreadsheetId,
            spreadsheetUrl: request.spreadsheetUrl,
            gid: request.gid,
            tasks: request.tasks,
            columnMapping: request.columnMapping,
            testMode: request.testMode || false
          });
          
          sendResponse({
            success: true,
            totalWindows: result.totalWindows || 4,
            message: "ストリーミング処理を開始しました"
          });
        } catch (error) {
          console.error("[MessageHandler] ストリーミング処理開始エラー:", error);
          sendResponse({
            success: false,
            error: error.message
          });
        }
      })();
      return true; // 非同期応答のため true を返す
      
    // ===== タスクリストストリーミング処理（AI Orchestratorから） =====
    case "streamProcessTaskList":
      console.log("[MessageHandler] タスクリストストリーミング処理要求:", {
        taskListSize: request.taskList?.tasks?.length || 0,
        testMode: request.testMode
      });
      
      (async () => {
        try {
          // StreamProcessorは既に静的インポート済み
          const processor = new StreamProcessor();
          
          // スプレッドシートデータを準備
          const spreadsheetData = {
            spreadsheetId: request.spreadsheetId,
            spreadsheetUrl: request.spreadsheetUrl,
            gid: request.gid
          };
          
          // タスクリストを処理
          const result = await processor.processTaskStream(request.taskList, spreadsheetData, {
            testMode: request.testMode || false,
            taskListMode: true
          });
          
          console.log("[MessageHandler] StreamProcessor実行結果:", result);
          
          sendResponse({
            success: true,
            totalWindows: result.totalWindows || 0,
            processedColumns: result.processedColumns || [],
            message: "タスクリストストリーミング処理を開始しました"
          });
        } catch (error) {
          console.error("[MessageHandler] タスクリストストリーミング処理エラー:", error);
          sendResponse({
            success: false,
            error: error.message
          });
        }
      })();
      return true; // 非同期応答のため true を返す

    // ===== テストウィンドウ作成 =====
    case "createTestWindow":
      console.log("[MessageHandler] テストウィンドウ作成要求:", {
        aiType: request.aiType,
        url: request.url
      });
      
      (async () => {
        try {
          const window = await chrome.windows.create({
            url: request.url,
            type: "normal",
            state: "normal",
            left: request.left,
            top: request.top,
            width: request.width,
            height: request.height,
            focused: false
          });
          
          const tabs = await chrome.tabs.query({ windowId: window.id });
          
          sendResponse({
            success: true,
            windowId: window.id,
            tabId: tabs[0]?.id
          });
        } catch (error) {
          console.error("[MessageHandler] ウィンドウ作成エラー:", error);
          sendResponse({
            success: false,
            error: error.message
          });
        }
      })();
      return true;

    // ===== 画面情報取得 =====
    case "getScreenInfo":
      console.log("[MessageHandler] 画面情報取得要求");
      
      (async () => {
        try {
          const displays = await chrome.system.display.getInfo();
          const primaryDisplay = displays.find(d => d.isPrimary) || displays[0];
          
          sendResponse({
            screenWidth: primaryDisplay.bounds.width,
            screenHeight: primaryDisplay.bounds.height,
            availWidth: primaryDisplay.workArea.width,
            availHeight: primaryDisplay.workArea.height
          });
        } catch (error) {
          // system.display APIが使えない場合のフォールバック
          sendResponse({
            screenWidth: 1920,
            screenHeight: 1080,
            availWidth: 1920,
            availHeight: 1080
          });
        }
      })();
      return true;
    
    // ===== テストウィンドウ閉じる =====
    case "closeTestWindow":
      console.log("[MessageHandler] ウィンドウクローズ要求:", request.data);
      
      (async () => {
        try {
          if (request.data?.windowId) {
            await chrome.windows.remove(request.data.windowId);
            sendResponse({ success: true });
          } else {
            sendResponse({ success: false, error: "windowId not provided" });
          }
        } catch (error) {
          console.error("[MessageHandler] ウィンドウクローズエラー:", error);
          sendResponse({ success: false, error: error.message });
        }
      })();
      return true;

    // ===== AITaskHandlerログ設定 =====
    // test-runner-chrome.jsからのログ関数設定要求
    case "setAITaskLogger":
      console.log("[MessageHandler] AITaskHandlerログ設定要求");
      
      // 拡張機能のログ関数を設定
      const extensionLogFunction = (message, type = 'info') => {
        // 全ての拡張機能タブにログを送信
        chrome.tabs.query({}, (tabs) => {
          tabs.forEach(tab => {
            if (tab.url && tab.url.includes('test-ai-automation-integrated.html')) {
              chrome.tabs.sendMessage(tab.id, {
                action: "extensionLog",
                message: message,
                type: type
              }).catch(() => {
                // エラーは無視（タブが閉じられている場合など）
              });
            }
          });
        });
      };
      
      aiTaskHandler.setExtensionLogger(extensionLogFunction);
      
      sendResponse({ 
        success: true, 
        message: "AITaskHandlerログ設定完了" 
      });
      return false;

    default:
      console.warn("[MessageHandler] 未知のアクション:", request.action);
      sendResponse({ success: false, error: "Unknown action" });
      return false;
  }
});