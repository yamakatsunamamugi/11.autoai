// background.js - Service Worker エントリーポイント
//
// このファイルは、Chrome拡張機能のService Workerとして動作します。
// 必要なモジュールを読み込んで、拡張機能を初期化します。

console.log("AutoAI Service Worker が起動しました");

// 必要なモジュールをインポート
// サービス（最初に読み込む必要がある）
import "./src/services/auth-service.js";
import "./src/features/spreadsheet/sheets-client.js";
import "./src/features/spreadsheet/docs-client.js";

// 設定ファイル
import "./src/features/spreadsheet/config.js";

// ユーティリティ
import "./src/features/spreadsheet/url-parser.js";

// 機能モジュール
import "./src/features/spreadsheet/reader.js";
import "./src/features/task/generator.js";
import TaskGenerator from "./src/features/task/generator.js";
import TaskQueue from "./src/features/task/queue.js";

// サービス
import SpreadsheetAutoSetup from "./src/services/spreadsheet-auto-setup.js";
import SpreadsheetColumnRemover from "./src/services/spreadsheet-column-remover.js";

// コアモジュール
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
    aiColumns: [],
    columnMapping: {},
  };

  if (!spreadsheetData.values || spreadsheetData.values.length === 0) {
    return result;
  }

  const headerRow = spreadsheetData.values[0];
  headerRow.forEach((header, index) => {
    const columnLetter = String.fromCharCode(65 + index);
    const trimmedHeader = header.trim();

    if (
      trimmedHeader.startsWith("ChatGPT ") ||
      trimmedHeader.startsWith("Claude ") ||
      trimmedHeader.startsWith("Gemini ")
    ) {
      const [ai, ...rest] = trimmedHeader.split(" ");
      const promptDescription = rest.join(" ");

      result.aiColumns.push({
        index,
        letter: columnLetter,
        header: trimmedHeader,
        ai,
        promptDescription,
      });
    }

    result.columnMapping[columnLetter] = {
      index,
      header: trimmedHeader,
    };
  });

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
          console.log("[Background] 処理されたデータ:", {
            aiColumns: processedData.aiColumns,
            columnCount: Object.keys(processedData.columnMapping || {}).length,
            valueRows: updatedSpreadsheetData.values?.length || 0,
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

    // ----- 処理関連 -----
    case "checkProcessingStatus":
      sendResponse({ isProcessing });
      return false;

    case "stopProcessing":
      isProcessing = false;
      console.log("[MessageHandler] 処理を停止しました");
      sendResponse({ success: true });
      return false;

    // ----- ストリーミング処理関連 -----
    case "streamProcessTasks":
      (async () => {
        try {
          console.log("[MessageHandler] ストリーミング処理開始", request);
          const manager = getStreamingServiceManager();
          if (!manager) {
            throw new Error("StreamingServiceManager が初期化されていません");
          }

          // DeepResearchモードのチェック
          const enableDeepResearch = request.enableDeepResearch || false;
          if (enableDeepResearch) {
            deepResearchHandler.log("DeepResearchモードが有効です");
          }

          isProcessing = true;
          const result = await manager.startStreaming({
            spreadsheetData: {
              spreadsheetId: request.spreadsheetId,
              gid: request.gid,
              aiColumns: request.tasks.map((task) => ({
                index: task.columnIndex,
                letter: task.columnLetter,
                header: task.columnHeader,
                ai: task.aiType,
              })),
              columnMapping: request.columnMapping,
              values: [],
            },
            testMode: request.testMode,
            tabId: request.tabId,
            enableDeepResearch: enableDeepResearch,
          });

          sendResponse({ success: true, result });
        } catch (error) {
          console.error("[MessageHandler] ストリーミング処理エラー:", error);
          sendResponse({ success: false, error: error.message });
        } finally {
          isProcessing = false;
        }
      })();
      return true;

    case "stopStreaming":
      (async () => {
        try {
          const manager = getStreamingServiceManager();
          if (manager) {
            await manager.stopStreaming();
          }
          isProcessing = false;
          sendResponse({ success: true });
        } catch (error) {
          sendResponse({ success: false, error: error.message });
        }
      })();
      return true;

    // ----- 列削除機能 -----
    case "removeColumns":
      (async () => {
        try {
          console.log("[MessageHandler] 列削除リクエスト:", request);
          const remover = new SpreadsheetColumnRemover();
          const result = await remover.removeColumns(
            request.spreadsheetId,
            request.gid,
            request.columnIndices,
          );
          sendResponse({ success: true, result });
        } catch (error) {
          console.error("[MessageHandler] 列削除エラー:", error);
          sendResponse({ success: false, error: error.message });
        }
      })();
      return true;

    // ----- ステータス確認 -----
    case "getStatus":
      (async () => {
        try {
          const manager = getStreamingServiceManager();
          const status = {
            isProcessing,
            streamingStatus: manager ? manager.getStatus() : null,
            servicesReady: manager ? manager.isInitialized() : false,
          };
          sendResponse({ success: true, status });
        } catch (error) {
          console.error("[MessageHandler] ステータス取得エラー:", error);
          sendResponse({ success: false, error: error.message });
        }
      })();
      return true;

    // ----- テストウィンドウ管理 -----
    case "createTestWindow":
      (async () => {
        try {
          const { aiType, url, left, top, width, height, enableDeepResearch } =
            request;
          console.log(`[Background] createTestWindow - ${aiType}: ${url}`);

          // DeepResearchモードの場合はURLを調整
          let finalUrl = url;
          if (enableDeepResearch && aiType === "ChatGPT") {
            finalUrl = deepResearchHandler.generateDeepResearchUrl(url);
            deepResearchHandler.log(`DeepResearch URL生成: ${finalUrl}`);
          }

          const window = await chrome.windows.create({
            url: finalUrl,
            left,
            top,
            width,
            height,
            type: "popup", // ブックマークバーなどを非表示
            focused: false,
          });
          const tab = window.tabs[0];
          console.log(
            `[Background] ウィンドウ作成成功 - 実際のURL: ${tab.url}`,
          );
          sendResponse({ success: true, windowId: window.id, tabId: tab.id });
        } catch (error) {
          console.error("[MessageHandler] ウィンドウ作成エラー:", error);
          sendResponse({ success: false, error: error.message });
        }
      })();
      return true;

    case "getScreenInfo":
      (async () => {
        try {
          const displays = await chrome.system.display.getInfo();
          const primaryDisplay =
            displays.find((d) => d.isPrimary) || displays[0];
          sendResponse({
            success: true,
            screenWidth: primaryDisplay.bounds.width,
            screenHeight: primaryDisplay.bounds.height,
          });
        } catch (error) {
          // chrome.system.display API が利用できない場合のフォールバック
          sendResponse({
            success: true,
            screenWidth: 1920, // デフォルト値
            screenHeight: 1080,
          });
        }
      })();
      return true;

    case "startStreaming":
      // streamProcessTasksと同じ処理を直接実行
      (async () => {
        try {
          console.log("[MessageHandler] ストリーミング処理開始", request);
          const manager = getStreamingServiceManager();
          if (!manager) {
            throw new Error("StreamingServiceManager が初期化されていません");
          }

          // DeepResearchモードのチェック
          const enableDeepResearch = request.enableDeepResearch || false;
          if (enableDeepResearch) {
            deepResearchHandler.log("DeepResearchモードが有効です");
          }

          // リクエストからタスクリストを生成
          const spreadsheetData = {
            spreadsheetId: request.spreadsheetId,
            gid: request.gid,
            aiColumns: [],
            columnMapping: {},
            values: [],
          };

          isProcessing = true;
          const result = await manager.startStreaming({
            spreadsheetData,
            testMode: request.testMode,
            tabId: request.tabId,
            enableDeepResearch: enableDeepResearch,
          });

          sendResponse({ success: true, result });
        } catch (error) {
          console.error("[MessageHandler] ストリーミング処理エラー:", error);
          sendResponse({ success: false, error: error.message });
        } finally {
          isProcessing = false;
        }
      })();
      return true;

    // ----- タスク実行（content scriptへの転送） -----
    // ----- Content Script通知関連 -----
    case "contentScriptReady":
      console.log("[MessageHandler] content script準備完了:", request);
      sendResponse({ success: true, message: "準備完了を確認しました" });
      return false;

    case "executeTask":
      (async () => {
        try {
          const {
            tabId,
            prompt,
            taskId,
            timeout,
            enableDeepResearch,
            specialMode,
          } = request;
          console.log("[MessageHandler] executeTask受信:", {
            tabId,
            taskId,
            specialMode,
          });

          // DeepResearchモードの処理
          const actualTimeout = deepResearchHandler.getTimeout({
            enableDeepResearch,
          });
          if (enableDeepResearch) {
            deepResearchHandler.log(
              `DeepResearchモード: タイムアウト ${actualTimeout / 1000}秒に設定`,
            );
          }

          // 特殊モードの処理
          if (specialMode) {
            console.log(`[MessageHandler] 特殊モード検出: ${specialMode}`);
          }

          // content scriptにメッセージを転送
          console.log("[MessageHandler] content scriptへ送信:", {
            tabId,
            action: "executeTask",
            taskId,
            enableDeepResearch,
            specialMode,
          });

          chrome.tabs.sendMessage(
            tabId,
            {
              action: "executeTask",
              prompt: prompt,
              taskId: taskId,
              timeout: timeout || actualTimeout,
              enableDeepResearch: enableDeepResearch || false,
              specialMode: specialMode || null,
            },
            (response) => {
              console.log(
                "[MessageHandler] content scriptからの応答:",
                response,
              );
              if (chrome.runtime.lastError) {
                console.error(
                  "[MessageHandler] content scriptへの転送エラー:",
                  chrome.runtime.lastError,
                );
                sendResponse({
                  success: false,
                  error: chrome.runtime.lastError.message,
                });
                return;
              }
              sendResponse(response || { success: false, error: "応答なし" });
            },
          );
        } catch (error) {
          console.error("[MessageHandler] executeTaskエラー:", error);
          sendResponse({ success: false, error: error.message });
        }
      })();
      return true;

    // ----- テスト用AIウィンドウ管理 -----
    case "openAIWindows":
      (async () => {
        try {
          const { urls, enableSpecial, enableDeep, enableDeepResearch } =
            request;
          console.log(`[MessageHandler] openAIWindows:`, {
            enableDeepResearch,
          });

          const results = {};

          // 画面情報を取得してウィンドウ配置を計算
          const displays = await chrome.system.display
            .getInfo()
            .catch(() => null);
          const primaryDisplay = displays?.find((d) => d.isPrimary) || {
            bounds: { width: 1920, height: 1080 },
          };
          const screenWidth = primaryDisplay.bounds.width;
          const screenHeight = primaryDisplay.bounds.height;

          // ウィンドウサイズと配置を計算
          const windowWidth = Math.floor(screenWidth / 3);
          const windowHeight = Math.floor(screenHeight * 0.8);

          let windowIndex = 0;
          for (const [aiType, url] of Object.entries(urls)) {
            const left = windowIndex * windowWidth;
            const top = Math.floor(screenHeight * 0.1);

            try {
              const window = await chrome.windows.create({
                url,
                left,
                top,
                width: windowWidth,
                height: windowHeight,
                type: "popup",
                focused: false,
              });

              const tab = window.tabs[0];
              results[aiType] = {
                success: true,
                windowId: window.id,
                tabId: tab.id,
                url: tab.url,
              };

              console.log(
                `[Background] ${aiType}ウィンドウ作成成功: ${tab.url}`,
              );
            } catch (error) {
              console.error(
                `[Background] ${aiType}ウィンドウ作成エラー:`,
                error,
              );
              results[aiType] = {
                success: false,
                error: error.message,
              };
            }

            windowIndex++;
          }

          sendResponse({ success: true, results });
        } catch (error) {
          console.error("[MessageHandler] openAIWindowsエラー:", error);
          sendResponse({ success: false, error: error.message });
        }
      })();
      return true;

    case "sendPromptToAIs":
      (async () => {
        try {
          const { prompt, enableSpecial, enableDeep, enableDeepResearch } =
            request;
          console.log(`[MessageHandler] sendPromptToAIs:`, {
            enableDeepResearch,
          });

          // 現在開いているタブからAIサイトを検出
          const tabs = await chrome.tabs.query({});
          const aiTabs = tabs.filter((tab) => {
            const hostname = new URL(tab.url).hostname;
            return (
              hostname.includes("chatgpt.com") ||
              hostname.includes("claude.ai") ||
              hostname.includes("gemini.google.com")
            );
          });

          const results = {};

          for (const tab of aiTabs) {
            const hostname = new URL(tab.url).hostname;
            let aiType;
            if (hostname.includes("chatgpt.com")) aiType = "ChatGPT";
            else if (hostname.includes("claude.ai")) aiType = "Claude";
            else if (hostname.includes("gemini.google.com")) aiType = "Gemini";

            try {
              // Content scriptにプロンプト送信を依頼
              const response = await new Promise((resolve) => {
                chrome.tabs.sendMessage(
                  tab.id,
                  {
                    action: "sendPrompt",
                    prompt: prompt,
                    taskId: `test-${Date.now()}`,
                    enableDeepResearch: enableDeepResearch || false,
                  },
                  (response) => {
                    if (chrome.runtime.lastError) {
                      resolve({
                        success: false,
                        error: chrome.runtime.lastError.message,
                      });
                    } else {
                      resolve(
                        response || { success: false, error: "応答なし" },
                      );
                    }
                  },
                );
              });

              results[aiType] = response;
              console.log(
                `[Background] ${aiType}プロンプト送信:`,
                response.success ? "成功" : "失敗",
              );
            } catch (error) {
              console.error(
                `[Background] ${aiType}プロンプト送信エラー:`,
                error,
              );
              results[aiType] = { success: false, error: error.message };
            }
          }

          sendResponse({ success: true, results });
        } catch (error) {
          console.error("[MessageHandler] sendPromptToAIsエラー:", error);
          sendResponse({ success: false, error: error.message });
        }
      })();
      return true;

    case "clickSendButtons":
      (async () => {
        try {
          const { enableDeepResearch } = request;
          console.log(`[MessageHandler] clickSendButtons:`, {
            enableDeepResearch,
          });

          // 実際の実装では、送信はsendPromptToAIsで同時に行われるため
          // ここではログ出力のみ
          console.log(
            "[Background] 送信ボタンクリックは sendPromptToAIs で実行済み",
          );

          sendResponse({ success: true, message: "送信完了" });
        } catch (error) {
          console.error("[MessageHandler] clickSendButtonsエラー:", error);
          sendResponse({ success: false, error: error.message });
        }
      })();
      return true;

    // Google Docs統合テスト用アクション
    case "checkServices":
      sendResponse({
        success: true,
        services: {
          authService: !!globalThis.authService,
          sheetsClient: !!globalThis.sheetsClient,
          docsClient: !!globalThis.docsClient,
        },
      });
      return false;

    case "testAuth":
      (async () => {
        try {
          const token = await globalThis.authService.getAuthToken();
          sendResponse({
            success: true,
            tokenType: "Bearer",
            expiresIn: 3600,
          });
        } catch (error) {
          sendResponse({
            success: false,
            error: error.message,
          });
        }
      })();
      return true;

    case "createDocument":
      (async () => {
        try {
          const { title, content } = request;
          const doc = await globalThis.docsClient.createAndWriteDocument(
            title,
            content,
          );
          sendResponse({
            success: true,
            document: doc,
          });
        } catch (error) {
          console.error("[MessageHandler] createDocumentエラー:", error);
          sendResponse({
            success: false,
            error: error.message,
          });
        }
      })();
      return true;

    case "createDocumentFromTask":
      (async () => {
        try {
          const { taskResult } = request;
          const doc =
            await globalThis.docsClient.createDocumentFromTaskResult(
              taskResult,
            );
          sendResponse({
            success: true,
            document: doc,
          });
        } catch (error) {
          console.error(
            "[MessageHandler] createDocumentFromTaskエラー:",
            error,
          );
          sendResponse({
            success: false,
            error: error.message,
          });
        }
      })();
      return true;

    default:
      console.warn("[MessageHandler] 未知のアクション:", request.action);
      sendResponse({ success: false, error: "Unknown action" });
      return false;
  }
});
