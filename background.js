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

// Step 6 - サービスファイル
import SpreadsheetAutoSetup from "./src/services/spreadsheet-auto-setup.js";
import SpreadsheetColumnRemover from "./src/services/spreadsheet-column-remover.js";

// Step 7 - コアモジュール
import "./src/core/streaming-service-manager.js";
import { getStreamingServiceManager } from "./src/core/streaming-service-manager.js";

// DeepResearchモジュール
import { deepResearchHandler } from "./src/modules/deep-research-handler.js";

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
    const columnLetter = String.fromCharCode(65 + index);
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
          menuRow[index + 6],
          menuRow[index + 7],
          menuRow[index + 8]
        ];
        
        console.log(`[Background] 次の列をチェック:`, nextHeaders);
        
        if (nextHeaders[0] && nextHeaders[0].includes("ChatGPT") &&
            nextHeaders[1] && nextHeaders[1].includes("Claude") && 
            nextHeaders[2] && nextHeaders[2].includes("Gemini")) {
          aiType = "3type";
          console.log(`[Background] メニュー行から3種類AIレイアウト検出: ${columnLetter}列`);
        } else {
          // デフォルトでプロンプト列は登録（単独AI扱い）
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
          const taskList = taskGenerator.generateTasks(processedData);
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
            taskCount: taskList.tasks.length,
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

    default:
      console.warn("[MessageHandler] 未知のアクション:", request.action);
      sendResponse({ success: false, error: "Unknown action" });
      return false;
  }
});