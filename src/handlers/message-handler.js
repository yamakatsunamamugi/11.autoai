/**
 * @fileoverview メッセージハンドラモジュール
 * Chrome拡張機能のメッセージ処理を一元管理
 *
 * 【ステップ構成】
 * Step 1: 初期化とインポート
 * Step 2: AIタスク実行関数
 * Step 3: メインメッセージハンドラ
 * Step 4: 各メッセージケースの処理
 */

// ===== Step 1: 初期化とインポート =====
import { logManager } from '../core/log-manager.js';
import { ConsoleLogger } from '../utils/console-logger.js';
import {
  processSpreadsheetData,
  taskGroupCache,
  determineGroupType,
  determineAIType,
  applyColumnControlsToGroups,
  getColumnName,
  columnToIndex
} from '../core/task-group-processor.js';
import { AITaskExecutor } from '../core/ai-task-executor.js';
import StreamProcessorV2 from '../features/task/stream-processor-v2.js';
import SpreadsheetAutoSetup from '../services/spreadsheet-auto-setup.js';
import SheetsClient from '../features/spreadsheet/sheets-client.js';
import { getStreamingServiceManager } from '../core/streaming-service-manager.js';
// SpreadsheetLogger削除済み - SheetsClientに統合
import { getAuthService } from '../services/auth-service.js';
import { dropboxService } from '../services/dropbox-service.js';

// ConsoleLoggerインスタンス
const logger = new ConsoleLogger('message-handler');

// Step 1-1: AIタスク実行インスタンス
const aiTaskExecutor = new AITaskExecutor();

// Step 1-2: 処理状態管理
let isProcessing = false;

// ===== Step 2: AI実行制御（共通モジュールを使用） =====
/**
 * AIタスクを実行する中央制御関数
 * 共通のAITaskExecutorモジュールを使用
 */
async function executeAITask(tabId, taskData) {
  logger.log('[Step 2-1: executeAITask開始] executeAITask開始');
  const startTime = Date.now();

  // Step 2-2: セル位置情報を含む詳細ログ
  const cellInfo = taskData.cellInfo || {};
  const cellPosition = cellInfo.column && cellInfo.row ? `${cellInfo.column}${cellInfo.row}` : '不明';

  logManager.logAI(taskData.aiType, `📊 (${taskData.aiType}) Step2-3: スプレッドシート処理開始 [${cellPosition}セル]`, {
    level: 'info',
    metadata: {
      tabId,
      taskId: taskData.taskId,
      cellPosition,
      column: cellInfo.column,
      row: cellInfo.row,
      step: 'Step 2-3',
      process: 'スプレッドシート読み込み',
      model: taskData.model,
      function: taskData.function,
      promptLength: taskData.prompt?.length
    }
  });

  try {
    // Step 2-4: 共通モジュールを使用してAIタスクを実行
    const result = await aiTaskExecutor.executeAITask(tabId, taskData);

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);

    if (result.success) {
      // Step 2-5: 成功ログ
      logManager.logAI(taskData.aiType, `✅ 全プロセス完了 [${cellPosition}セル] (${totalTime}秒)`, {
        level: 'success',
        metadata: {
          taskId: taskData.taskId,
          cellPosition,
          column: cellInfo.column,
          row: cellInfo.row,
          totalTime: `${totalTime}秒`,
          responseLength: result.response?.length || 0,
          allStepsCompleted: true,
          finalStep: 'Step 2-5',
          process: '完了'
        }
      });
    } else {
      // Step 2-6: エラーログ
      logManager.logAI(taskData.aiType, `❌ 処理失敗 [${cellPosition}セル]: ${result.error}`, {
        level: 'error',
        metadata: {
          taskId: taskData.taskId,
          cellPosition,
          column: cellInfo.column,
          row: cellInfo.row,
          totalTime: `${totalTime}秒`,
          error: result.error,
          failedProcess: result.failedStep || '不明',
          step: 'Step 2-6'
        }
      });
    }

    return result;
  } catch (error) {
    // Step 2-7: 例外エラー処理
    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    logManager.error(`[${taskData.aiType}] AIタスク実行エラー: ${error.message}`, error);
    return { success: false, error: error.message };
  }
}

// ===== Step 3: ポップアップ移動関数 =====
async function movePopupToBottomRight() {
  logger.log('[Step 3-1: ポップアップ移動開始] ポップアップ移動開始');
  try {
    // Step 3-2: Chrome Storageから拡張機能のウィンドウIDを取得
    const storage = await chrome.storage.local.get('extensionWindowId');
    let extensionWindow = null;

    if (storage.extensionWindowId) {
      try {
        extensionWindow = await chrome.windows.get(storage.extensionWindowId);
      } catch (e) {
        // ウィンドウが既に閉じられている場合
        console.log('[Step 3-3] ウィンドウが閉じられています');
      }
    }

    // Step 3-4: StorageのIDが無効な場合、ui.htmlを含むウィンドウを検索
    if (!extensionWindow) {
      const windows = await chrome.windows.getAll({ populate: true });

      for (const window of windows) {
        if (window.tabs && window.tabs.length > 0) {
          const tab = window.tabs[0];
          if (tab.url && tab.url.includes('ui.html')) {
            extensionWindow = window;
            break;
          }
        }
      }
    }

    if (!extensionWindow) {
      console.log('[Step 3-5] 拡張機能ウィンドウが見つかりません');
      return;
    }

    // Step 3-6: 画面サイズを取得
    const displays = await chrome.system.display.getInfo();
    const primaryDisplay = displays.find(d => d.isPrimary) || displays[0];
    const screenWidth = primaryDisplay.workArea.width;
    const screenHeight = primaryDisplay.workArea.height;
    const screenLeft = primaryDisplay.workArea.left;
    const screenTop = primaryDisplay.workArea.top;

    // Step 3-7: 4分割の右下に配置（画面の半分のサイズ）
    const popupWidth = Math.floor(screenWidth / 2);
    const popupHeight = Math.floor(screenHeight / 2);
    const left = screenLeft + Math.floor(screenWidth / 2); // 画面の右半分（オフセット考慮）
    const top = screenTop + Math.floor(screenHeight / 2);  // 画面の下半分（オフセット考慮）

    // Step 3-8: ウィンドウを右下に移動とリサイズ
    await chrome.windows.update(extensionWindow.id, {
      left: left,
      top: top,
      width: popupWidth,
      height: popupHeight,
      focused: false // フォーカスは移動しない
    });

    console.log('[Step 3-9] ポップアップ移動完了');
  } catch (error) {
    console.error('[Step 3-10] ポップアップ移動エラー:', error);
  }
}

// ===== Step 4: メインメッセージハンドラー =====
export function setupMessageHandler() {
  console.log('[Step 4-1] メッセージハンドラー設定開始');

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Step 4-2: メッセージタイプをログ
    console.log(`[Step 4-2] メッセージ受信: ${request.action || request.type}`);

    switch (request.action || request.type) {
      // ===== Step 5: PowerManager制御（スクリーンセイバー防止） =====
      case "START_AI_PROCESSING":
        console.log('[Step 5-1] AI処理開始要求');
        (async () => {
          // PowerManager削除済み - power-config.jsを使用してください
          console.log('[Step 5-2] ⚠️ PowerManager削除済み - power-config.jsを使用してください');
          sendResponse({ success: true });
        })();
        return true;

      // ===== ログファイル保存処理 =====
      case "SAVE_LOG_FILE":
        console.log('[LogFile] ログファイル保存要求');
        (async () => {
          try {
            const { filePath, content } = request.data;
            // Chrome拡張機能のFile System APIを使用してファイル保存
            // 現在はLocalStorageに保存（Chrome拡張機能の制限のため）
            const key = `log_file_${filePath}`;
            await chrome.storage.local.set({ [key]: content });

            console.log(`[LogFile] ファイル保存完了: ${filePath}`);
            sendResponse({ success: true, filePath });
          } catch (error) {
            console.error('[LogFile] ファイル保存エラー:', error);
            sendResponse({ success: false, error: error.message });
          }
        })();
        return true;

      case "GET_LOG_FILES":
        console.log('[LogFile] ログファイルリスト取得要求');
        (async () => {
          try {
            const { directory } = request.data;
            const storage = await chrome.storage.local.get();
            const files = [];
            const prefix = `log_file_${directory}/`;

            for (const key in storage) {
              if (key.startsWith(prefix)) {
                const fileName = key.replace('log_file_', '');
                const match = fileName.match(/claude-log-(\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2})/);
                if (match) {
                  files.push({
                    name: fileName.split('/').pop(),
                    path: fileName,
                    timestamp: new Date(match[1].replace('_', 'T').replace(/-/g, ':')).getTime()
                  });
                }
              }
            }

            sendResponse({ success: true, files });
          } catch (error) {
            console.error('[LogFile] ファイルリスト取得エラー:', error);
            sendResponse({ success: false, error: error.message });
          }
        })();
        return true;

      case "DELETE_LOG_FILE":
        console.log('[LogFile] ログファイル削除要求');
        (async () => {
          try {
            const { filePath } = request.data;
            const key = `log_file_${filePath}`;
            await chrome.storage.local.remove(key);

            console.log(`[LogFile] ファイル削除完了: ${filePath}`);
            sendResponse({ success: true });
          } catch (error) {
            console.error('[LogFile] ファイル削除エラー:', error);
            sendResponse({ success: false, error: error.message });
          }
        })();
        return true;

      case "DOWNLOAD_LOG_FILE":
        console.log('🔥 [CRITICAL] DOWNLOAD_LOG_FILE メッセージ受信！', new Date().toISOString());
        console.log('🔥 [CRITICAL] request全体:', request);
        console.log('🔥 [CRITICAL] request.data詳細:', {
          hasData: !!request.data,
          hasFileName: !!request.data?.fileName,
          hasContent: !!request.data?.content,
          contentLength: request.data?.content?.length || 0,
          contentPreview: request.data?.content?.substring(0, 200) + '...',
          fileName: request.data?.fileName
        });
        console.log('🔥 [CRITICAL] sender情報:', {
          tabId: sender?.tab?.id,
          url: sender?.tab?.url,
          frameId: sender?.frameId
        });

        // 即座にレスポンスを試みる
        console.log('🔥 [CRITICAL] 即座のテストレスポンス送信開始');

        (async () => {
          try {
            const { fileName, content } = request.data;

            console.log('🔍 [DEBUG-MessageHandler] Step 1: パラメータ確認完了');

            // Blob作成してダウンロード
            console.log('🔍 [DEBUG-MessageHandler] Step 2: Blob作成開始');
            const blob = new Blob([content], { type: 'application/json' });
            console.log('🔍 [DEBUG-MessageHandler] Step 3: Blob作成完了:', {
              blobSize: blob.size,
              blobType: blob.type
            });

            console.log('🔍 [DEBUG-MessageHandler] Step 4: DataURL変換開始');
            const dataUrl = await new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onloadend = () => {
                console.log('🔍 [DEBUG-MessageHandler] Step 5: DataURL変換完了');
                resolve(reader.result);
              };
              reader.onerror = (error) => {
                console.error('🔍 [DEBUG-MessageHandler] DataURL変換エラー:', error);
                reject(error);
              };
              reader.readAsDataURL(blob);
            });

            console.log('🔍 [DEBUG-MessageHandler] Step 6: Chrome Downloads API呼び出し開始:', {
              fileName,
              dataUrlLength: dataUrl.length,
              chromeDownloads: !!chrome.downloads
            });

            // Chrome Downloads APIでダウンロード
            const downloadId = await chrome.downloads.download({
              url: dataUrl,
              filename: fileName,
              saveAs: false,
              conflictAction: 'uniquify'
            });

            console.log('🔍 [DEBUG-MessageHandler] Step 7: Chrome Downloads API成功:', {
              downloadId,
              fileName
            });

            console.log('🔍 [DEBUG-MessageHandler] Step 8: sendResponse呼び出し開始');
            sendResponse({ success: true, downloadId });
            console.log('🔍 [DEBUG-MessageHandler] Step 9: sendResponse呼び出し完了');
          } catch (error) {
            console.error('🔍 [DEBUG-MessageHandler] DOWNLOAD_LOG_FILEエラー:', {
              message: error.message,
              stack: error.stack,
              name: error.name
            });
            try {
              sendResponse({ success: false, error: error.message });
              console.log('🔍 [DEBUG-MessageHandler] エラーレスポンス送信完了');
            } catch (responseError) {
              console.error('🔍 [DEBUG-MessageHandler] sendResponseエラー:', responseError);
            }
          }
        })();
        return true;

      case "STOP_AI_PROCESSING":
        console.log('[Step 5-3] AI処理停止要求');
        (async () => {
          // PowerManager削除済み - power-config.jsを使用してください
          console.log('[Step 5-4] ⚠️ PowerManager削除済み - power-config.jsを使用してください');
          sendResponse({ success: true });
        })();
        return true;

      // Step 5-5: Keep-Aliveメッセージの処理
      case "KEEP_ALIVE_PING":
        console.log('[Step 5-5] Keep-Aliveメッセージ受信', {
          timestamp: request.timestamp,
          currentTime: Date.now()
        });
        sendResponse({ success: true });
        return false;

      // ===== Step 6: AI詳細ログメッセージ受信 =====
      case "LOG_AI_MESSAGE":
        console.log('[Step 6-1] AIログメッセージ受信');
        if (request.aiType && request.message) {
          logManager.logAI(request.aiType, request.message, request.options || {});
          sendResponse({ success: true });
        } else {
          console.error('[Step 6-2] 無効なLOG_AI_MESSAGEフォーマット:', request);
          sendResponse({ success: false, error: 'Invalid message format' });
        }
        return false; // 同期応答

      // ===== Step 7: セレクタ検出ログメッセージ受信 =====
      case "SELECTOR_DETECTION_LOG":
        console.log('[Step 7-1] セレクタ検出ログ受信');
        if (request.log) {
          const { timestamp, message, type, aiType } = request.log;

          // LogManagerに送信（拡張機能UI用）
          logManager.logAI(aiType || 'selector_detection', message, {
            level: type === 'error' ? 'error' : 'info',
            timestamp: timestamp,
            category: 'selector_detection',
            step: 'Step 7-2'
          });
          sendResponse({ success: true });
        } else {
          console.error('[Step 7-3] 無効なSELECTOR_DETECTION_LOGフォーマット:', request);
          sendResponse({ success: false, error: 'Invalid log format' });
        }
        return false; // 同期応答

      // ===== Step 8: AIタスク実行（コンテンツスクリプトから転送） =====
      case "executeAITask":
        console.log(`[Step 8-1] AIタスク実行要求受信:`, {
          from: sender.tab?.url?.split('?')[0],  // URLからクエリパラメータを除外
          tabId: sender.tab?.id,
          aiType: request.taskData?.aiType,
          model: request.taskData?.model,
          function: request.taskData?.function,
          promptLength: request.taskData?.prompt?.length,
          promptPreview: request.taskData?.prompt ? request.taskData?.prompt.substring(0, 100) + '...' : '❌ プロンプトがありません！',
          hasPrompt: !!request.taskData?.prompt,
          cellInfo: request.taskData?.cellInfo,
          timestamp: new Date().toLocaleTimeString()
        });

        if (!sender.tab?.id) {
          console.error('[Step 8-2] タブIDが取得できません');
          sendResponse({ success: false, error: "タブIDが取得できません" });
          return false;
        }

        // Step 8-3: 非同期でAIタスクを実行
        executeAITask(sender.tab.id, request.taskData)
          .then(result => {
            console.log("[Step 8-4] ✅ AIタスク実行成功:", {
              aiType: request.taskData?.aiType,
              taskId: request.taskData?.taskId,
              success: result.success,
              hasResponse: !!result.response,
              responseLength: result.response?.length || 0
            });
            sendResponse(result);
          })
          .catch(error => {
            console.error("[Step 8-5] ❌ AIタスク実行エラー:", {
              aiType: request.taskData?.aiType,
              taskId: request.taskData?.taskId,
              error: error.message
            });
            sendResponse({ success: false, error: error.message });
          });

        return true; // 非同期応答のため true を返す

      // ===== Step 9: レポートタスク実行 =====
      case "executeReportTask":
        console.log("[Step 9-1] 📄 レポートタスク実行要求受信:", request.task);

        (async () => {
          try {
            // Step 9-2: ReportExecutorを使用してレポート生成
            const ReportExecutor = globalThis.ReportExecutor;
            if (!ReportExecutor) {
              // Step 9-3: ReportExecutorが利用できない場合は簡易処理
              const reportUrl = `https://docs.google.com/document/d/sample_report_${Date.now()}`;
              sendResponse({
                success: true,
                url: reportUrl,
                message: "レポート作成完了（テスト）"
              });
              return;
            }

            // Step 9-4: ReportExecutor実行
            const executor = new ReportExecutor({ logger: console });
            const result = await executor.executeTask(request.task, {
              spreadsheetId: request.task.spreadsheetId,
              gid: request.task.sheetGid
            });

            sendResponse(result);
          } catch (error) {
            console.error("[Step 9-5] レポートタスクエラー:", error);
            sendResponse({ success: false, error: error.message });
          }
        })();

        return true; // 非同期応答

      // ===== Step 10: Gensparkタスク実行 =====
      case "executeGensparkTask":
        console.log("[Step 10-1] ⚡ Gensparkタスク実行要求受信:", request.task);

        (async () => {
          try {
            // Step 10-2: Gensparkタブを開いて処理
            const gensparkUrl = request.task.functionType === 'factcheck'
              ? 'https://www.genspark.ai/factcheck'
              : 'https://www.genspark.ai/slides';

            // Step 10-3: 新しいタブでGensparkを開く
            const tab = await chrome.tabs.create({ url: gensparkUrl, active: false });

            // Step 10-4: ページの読み込みを待つ
            await new Promise(resolve => setTimeout(resolve, 3000));

            // Step 10-5: Gensparkタスクを実行
            const result = await chrome.tabs.sendMessage(tab.id, {
              action: 'executeGensparkAutomation',
              text: request.task.text,
              functionType: request.task.functionType
            });

            // Step 10-6: タブを閉じる
            await chrome.tabs.remove(tab.id);

            sendResponse({
              success: true,
              url: result.extractedUrls?.[0] || result.url,
              text: result.text,
              message: `Genspark${request.task.functionType === 'slides' ? 'スライド' : 'ファクトチェック'}完了`
            });
          } catch (error) {
            console.error("[Step 10-7] Gensparkタスクエラー:", error);
            sendResponse({ success: false, error: error.message });
          }
        })();

        return true; // 非同期応答

      // ===== Step 11: Google Sheetsデータ取得 =====
      case "getSheetsData":
        console.log(`[Step 11-1] 📊 Google Sheets データ取得:`, {
          spreadsheetId: request.spreadsheetId,
          range: request.range
        });

        (async () => {
          try {
            if (!request.spreadsheetId || !request.range) {
              console.error('[Step 11-2] パラメータ不足');
              sendResponse({
                success: false,
                error: "spreadsheetIdとrangeが必要です"
              });
              return;
            }

            // Step 11-3: ServiceRegistryからSheetsClientを取得（static import使用）
            const sheetsClient = new SheetsClient();

            // Step 11-5: Google Sheets APIを呼び出してデータ取得
            const data = await sheetsClient.getSheetData(request.spreadsheetId, request.range);

            console.log("[Step 11-6] ✅ Sheetsデータ取得成功:", {
              rowsCount: data?.values?.length || 0,
              firstRow: data?.values?.[0]
            });
            sendResponse({
              success: true,
              data: data
            });
          } catch (error) {
            console.error("[Step 11-7] ❌ Sheetsデータ取得エラー:", error);
            sendResponse({
              success: false,
              error: error.message
            });
          }
        })();

        return true; // 非同期応答

      // ===== Step 13: スプレッドシート読み込み（タスク生成含む） =====
      case "loadSpreadsheet":
      case "loadSpreadsheets": // 互換性のため両方サポート
        console.log('[Step 13-1] スプレッドシート読み込み開始');
        (async () => {
          try {
            // Step 13-2: 新旧フォーマット対応
            const url = request.url || (request.urls && request.urls[0]);

            if (!url) {
              console.error('[Step 13-3] URLが指定されていません');
              sendResponse({
                success: false,
                error: "URLが指定されていません",
              });
              return;
            }

            // Step 13-4: URL解析でスプレッドシートIDとgidを取得
            const { spreadsheetId, gid } = globalThis.parseSpreadsheetUrl(url);
            if (!spreadsheetId) {
              console.error('[Step 13-5] 無効なスプレッドシートURL');
              sendResponse({
                success: false,
                error: "無効なスプレッドシートURLです",
              });
              return;
            }

            // Step 13-6: データを読み込み（static import使用）
            const sheetsClient = new SheetsClient();
            const updatedSpreadsheetData =
              await sheetsClient.loadAutoAIData(spreadsheetId, gid);

            // Step 13-7: StreamProcessorV2初期化を確保してから自動セットアップ
            if (!globalThis.SPREADSHEET_CONFIG) {
              console.log('[Step 13-7-1] SPREADSHEET_CONFIG未初期化、StreamProcessorV2を初期化');
              // 依存性を取得してシングルトンに設定
              try {
                const sheetsClient = new SheetsClient();
                const processor = StreamProcessorV2.getInstance();
                await processor.setDependencies({
                  sheetsClient: sheetsClient
                  // SpreadsheetLogger削除済み - SheetsClientに統合
                });
              } catch (e) {
                // Service Worker環境では動的インポート失敗
                console.warn('Service Worker環境で依存性設定をスキップ:', e.message);
              }
            }

            const autoSetup = new SpreadsheetAutoSetup();
            const authService = await getAuthService();
            const token = await authService.getAuthToken();
            await autoSetup.executeAutoSetup(spreadsheetId, token, gid);

            // Step 13-8: データを整形（AI列情報を抽出）
            let processedData;
            try {
              processedData = processSpreadsheetData(updatedSpreadsheetData);

              // modelRowとtaskRowも含める
              processedData.modelRow = updatedSpreadsheetData.modelRow;
              processedData.taskRow = updatedSpreadsheetData.taskRow;

              // Step 13-9: タスクグループをキャッシュに保存
              taskGroupCache.spreadsheetId = spreadsheetId;
              taskGroupCache.gid = gid;
              taskGroupCache.taskGroups = processedData.taskGroups;
              taskGroupCache.timestamp = Date.now();

              console.log(`[Step 13-10] タスクグループをキャッシュに保存: ${processedData.taskGroups?.length || 0}グループ`);
            } catch (processError) {
              console.error("[Step 13-11] processSpreadsheetDataエラー:", processError);
              // エラーが発生してもデフォルトのデータを使用
              processedData = {
                ...updatedSpreadsheetData,
                aiColumns: {},
                columnMapping: {}
              };
            }

            // Step 13-12: タスクグループ情報は作成済み（processedData.taskGroupsに格納）
            console.log("[Step 13-12] ✅ タスクグループ準備完了 - 実行時に動的タスク判定を行います");

            // Step 13-13: レスポンスを返す
            const response = {
              success: true,
              aiColumns: processedData.aiColumns,
              columnMapping: processedData.columnMapping,
              taskGroups: processedData.taskGroups,  // タスクグループ情報を追加
              sheetName: processedData.sheetName,
              modelRow: processedData.modelRow,
              taskRow: processedData.taskRow,
              // タスクは実行時に動的生成するため、起動時は0件で正常
              message: "タスクグループ作成完了 - 実行時に動的タスク判定"
            };
            sendResponse(response);
          } catch (error) {
            console.error("[Step 13-14] エラー:", error);
            sendResponse({ success: false, error: error.message });
          }
        })();
        return true; // 非同期レスポンスを有効化

      // ===== Step 14: 認証関連 =====
      case "getAuthStatus":
        console.log('[Step 14-1] 認証ステータス取得');
        (async () => {
          try {
            const authService = await getAuthService();
            const status = await authService.checkAuthStatus();
            sendResponse(status);
          } catch (error) {
            console.error('[Step 14-2] 認証ステータス取得エラー:', error);
            sendResponse({ isAuthenticated: false, error: error.message });
          }
        })();
        return true;

      case "authenticate":
        console.log('[Step 14-3] 認証実行');
        (async () => {
          try {
            const authService = await getAuthService();
            const token = await authService.getAuthToken();
            sendResponse({ success: true });
          } catch (error) {
            console.error('[Step 14-4] 認証エラー:', error);
            sendResponse({ success: false, error: error.message });
          }
        })();
        return true;

      // ===== Step 15: 自動テスト関連 =====
      case "checkServiceWorkerStatus":
        console.log('[Step 15-1] Service Workerステータス確認');
        sendResponse({ status: "ready", message: "Service Worker is active" });
        return false;

      case "checkAutoAIStatus":
        console.log('[Step 15-2] AutoAIステータス確認');
        const manager = getStreamingServiceManager();
        sendResponse({
          status: "ready",
          message: "AutoAI is ready",
          servicesReady: manager ? manager.isInitialized() : false,
        });
        return false;

      case "testServiceWorker":
        console.log('[Step 15-3] Service Workerテスト');
        sendResponse({ success: true, echo: request.data });
        return false;

      // ===== Step 16: コンテンツスクリプトからのメッセージ =====
      case "contentScriptReady":
        console.log(`[Step 16-1] 📡 コンテンツスクリプト準備完了:`, {
          tabId: sender.tab?.id,
          url: sender.tab?.url,
          aiType: request.aiType
        });
        sendResponse({ received: true });
        return false;

      case "aiResponse":
        console.log(`[Step 16-2] 🤖 AI応答受信:`, {
          tabId: sender.tab?.id,
          taskId: request.taskId,
          responseLength: request.response?.length || 0
        });
        sendResponse({ received: true });
        return false;

      // ===== Step 17: ストリーミング処理開始 =====
      case "streamProcessTasks":
        console.log(`[Step 17-1] 🌊 ストリーミング処理開始:`, {
          spreadsheetId: request.spreadsheetId,
          taskCount: request.tasks?.length || 0,
          testMode: request.testMode
        });

        (async () => {
          try {
            // Step 17-2: StreamingServiceManagerを取得
            const manager = getStreamingServiceManager();

            if (!manager) {
              throw new Error("StreamingServiceManagerが取得できません");
            }

            // Step 17-3: 初期化完了を待つ
            await manager.waitForInitialization();

            // Step 17-4: ストリーミング処理を開始
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
            console.error("[Step 17-5] ストリーミング処理開始エラー:", error);
            sendResponse({
              success: false,
              error: error.message
            });
          }
        })();
        return true; // 非同期応答のため true を返す

      // ===== Step 18: タスクリストストリーミング処理（AI Orchestratorから） =====
      case "streamProcessTaskList":
        console.log(`[Step 18-1] 📋 動的タスク生成ストリーミング処理:`, {
          isDynamicMode: !request.taskList,
          testMode: request.testMode,
          spreadsheetId: request.spreadsheetId,
          hasSpreadsheetUrl: !!request.spreadsheetUrl
        });

        // Step 18-2: 即座にレスポンスを送信してメッセージチャネルの閉鎖を防ぐ
        sendResponse({
          success: true,
          totalWindows: 4, // デフォルト値
          processedColumns: [],
          message: "タスクリストストリーミング処理を開始しました"
        });

        // Step 18-3: バックグラウンドで非同期処理を開始
        (async () => {
          try {
            // Step 18-4: ポップアップウィンドウを右下に移動
            await movePopupToBottomRight();

            // Step 18-5: V2モード切り替えフラグ（上部の設定と同じ値を使用）
            const USE_V2_MODE = true; // true: V2版を使用, false: 従来版を使用

            // シングルトンインスタンスを取得して依存性を設定
            const processor = StreamProcessorV2.getInstance();

            // Service Worker環境では動的インポートが失敗するため、try-catch
            try {
              // ServiceRegistry使用 (static import)
              const sheetsClient = new SheetsClient();
              await processor.setDependencies({
                sheetsClient: sheetsClient,
                // SpreadsheetLogger削除済み - SheetsClientに統合
              });
            } catch (e) {
              // Service Worker環境：依存性設定をスキップ
              console.warn('Service Worker環境で依存性設定をスキップ:', e.message);
            }

            // Step 18-6: スプレッドシートデータを取得
            let spreadsheetData;
            let processedData = { taskGroups: [] }; // 初期化

            if (request.spreadsheetId) {
              // Step 18-7: スプレッドシートのデータを読み込み
              // ServiceRegistry使用 (static import)
            const sheetsClient752 = new SheetsClient();
            const sheetData = await sheetsClient752.loadAutoAIData(
                request.spreadsheetId,
                request.gid
              );

              spreadsheetData = {
                spreadsheetId: request.spreadsheetId,
                spreadsheetUrl: request.spreadsheetUrl,
                gid: request.gid,
                sheetName: sheetData.sheetName || request.sheetName || null,
                values: sheetData.values || [],
                modelRow: sheetData.modelRow || null,
                taskRow: sheetData.taskRow || null,
                aiRow: sheetData.aiRow || null
              };

              console.log(`[Step 18-8] 📊 スプレッドシートデータ取得完了:`, {
                rows: spreadsheetData.values.length,
                columns: spreadsheetData.values[0]?.length || 0,
                sheetName: spreadsheetData.sheetName
              });

              // Step 18-9: キャッシュされたタスクグループを使用するか、新規作成
              if (taskGroupCache.spreadsheetId === request.spreadsheetId &&
                  taskGroupCache.gid === request.gid &&
                  taskGroupCache.taskGroups) {
                // キャッシュを使用
                processedData = {
                  taskGroups: taskGroupCache.taskGroups
                };
                console.log(`[Step 18-10] キャッシュされたタスクグループを使用: ${taskGroupCache.taskGroups.length}グループ`);
              } else {
                // Step 18-11: スプレッドシートデータを処理してタスクグループを作成
                processedData = processSpreadsheetData(sheetData);
                console.log(`[Step 18-12] タスクグループ作成完了: ${processedData.taskGroups.length}グループ`);
              }
            } else {
              // Step 18-13: スプレッドシートIDがない場合は空のデータ
              spreadsheetData = {
                spreadsheetId: '',
                spreadsheetUrl: '',
                gid: null,
                sheetName: null,
                values: []
              };
            }

            // Step 18-14: 動的タスク生成モード（StreamProcessorV2のメインエントリーポイント）
            const result = await processor.processDynamicTaskGroups(spreadsheetData, {
              testMode: request.testMode || false,
              taskGroups: processedData.taskGroups || []  // タスクグループ情報を渡す
            });

            console.log('[Step 18-15] 動的タスク生成完了');
          } catch (error) {
            console.error("[Step 18-16] ❌ タスクリストストリーミング処理エラー:", error);
            console.error("[Step 18-17] ❌ エラー詳細:", {
              message: error.message,
              stack: error.stack,
              taskListSize: request.taskList?.tasks?.length || 0
            });
          }
        })();

        return true; // 非同期応答（バックグラウンド処理を実行）

      // ===== Step 19: スプレッドシートログクリア =====
      case "clearLog":
        console.log('[Step 19-1] ログクリア要求');
        (async () => {
          try {
            if (!request.spreadsheetId) {
              console.error('[Step 19-2] スプレッドシートIDが指定されていません');
              throw new Error("スプレッドシートIDが指定されていません");
            }

            // Step 19-3: SheetsClientを使用してログをクリア
            // ServiceRegistry使用 (static import)
            const sheetsClient829 = new SheetsClient();
            const result = await sheetsClient829.clearSheetLogs(request.spreadsheetId);

            console.log('[Step 19-4] ログクリア成功:', result.clearedCount);
            sendResponse({
              success: true,
              clearedCount: result.clearedCount || 0,
              message: "ログをクリアしました"
            });
          } catch (error) {
            console.error("[Step 19-5] ログクリアエラー:", error);
            sendResponse({
              success: false,
              error: error.message
            });
          }
        })();
        return true;

      // ===== Step 20: AI回答削除 =====
      case "deleteAnswers":
        console.log('[Step 20-1] AI回答削除要求');
        (async () => {
          try {
            if (!request.spreadsheetId) {
              console.error('[Step 20-2] スプレッドシートIDが指定されていません');
              throw new Error("スプレッドシートIDが指定されていません");
            }

            // Step 20-3: SheetsClientを使用してAI回答を削除
            // ServiceRegistry使用 (static import)
            const sheetsClient858 = new SheetsClient();
            const result = await sheetsClient858.deleteAnswers(request.spreadsheetId);

            console.log('[Step 20-4] AI回答削除成功:', result.deletedCount);
            sendResponse({
              success: true,
              deletedCount: result.deletedCount || 0,
              message: "AI回答を削除しました"
            });
          } catch (error) {
            console.error("[Step 20-5] 回答削除エラー:", error);
            sendResponse({
              success: false,
              error: error.message
            });
          }
        })();
        return true;

      // ===== Step 21: プロンプト動的取得（V2用） =====
      case "fetchPromptFromSpreadsheet":
        console.log('[Step 21-1] プロンプト動的取得要求');
        (async () => {
          try {
            const { spreadsheetId, row, promptColumns, sheetName, gid } = request;

            // Step 21-2: AITaskHandlerのfetchPromptFromSpreadsheet関数を呼び出し
            if (globalThis.aiTaskHandler) {
              const prompt = await globalThis.aiTaskHandler.fetchPromptFromSpreadsheet(
                spreadsheetId,
                { row, promptColumns, sheetName }
              );

              console.log('[Step 21-3] プロンプト取得成功');
              sendResponse({ success: true, prompt });
            } else {
              console.error('[Step 21-4] AITaskHandler not available');
              throw new Error("AITaskHandler not available");
            }
          } catch (error) {
            console.error("[Step 21-5] プロンプト取得エラー:", error);
            sendResponse({ success: false, error: error.message });
          }
        })();
        return true;

      // ===== Step 22: スプレッドシート書き込み（V2用） =====
      case "writeToSpreadsheet":
        console.log('[Step 22-1] スプレッドシート書き込み要求');
        (async () => {
          try {
            const { spreadsheetId, range, value, sheetName } = request;

            let sheetsClient910;
            try {
              // ServiceRegistry使用 (static import)
              sheetsClient910 = new SheetsClient();
            } catch (e) {
              console.error('sheetsClient取得エラー:', e.message);
              sendResponse({ success: false, error: 'sheetsClient取得に失敗しました' });
              return false;
            }

            if (!sheetsClient910) {
              console.error('[Step 22-2] SheetsClient not available');
              throw new Error("SheetsClient not available");
            }

            // Step 22-3: スプレッドシートに書き込み
            const fullRange = sheetName ? `'${sheetName}'!${range}` : range;
            const result = await sheetsClient910.writeValue(spreadsheetId, fullRange, value);

            console.log('[Step 22-4] 書き込み成功');
            sendResponse({ success: true, result });
          } catch (error) {
            console.error("[Step 22-5] スプレッドシート書き込みエラー:", error);
            sendResponse({ success: false, error: error.message });
          }
        })();
        return true;

      // ===== Step 23: 送信時刻記録メッセージ =====
      case "recordSendTime":
        console.log('[Step 23-1] 送信時刻記録要求');
        (async () => {
          try {
            let spreadsheetLogger = null;

            // Step 23-2: StreamingServiceManagerからStreamProcessorを取得
            try {
              const manager = getStreamingServiceManager();
              // serviceRegistryは削除されたため、services Mapを直接参照
              const streamProcessor = manager?.services?.get("StreamProcessor");
              spreadsheetLogger = streamProcessor?.spreadsheetLogger;
            } catch (error) {
              console.log('[Step 23-3] StreamingServiceManagerから取得失敗', error.message);
            }

            // Step 23-4: グローバルSpreadsheetLoggerを使用（フォールバック）
            if (!spreadsheetLogger && globalThis.spreadsheetLogger) {
              spreadsheetLogger = globalThis.spreadsheetLogger;
            }

            console.log(`[Step 23-5] ⏰ 送信時刻記録:`, {
              taskId: request.taskId,
              sendTime: request.sendTime,
              aiType: request.taskInfo?.aiType,
              model: request.taskInfo?.model,
              spreadsheetLogger: !!spreadsheetLogger
            });

            // Step 23-6: SpreadsheetLoggerに送信時刻を記録
            if (spreadsheetLogger) {
              // ISO文字列をDateオブジェクトに変換
              const sendTime = new Date(request.sendTime);

              // SpreadsheetLoggerのrecordSendTimeを呼び出し（送信時刻を直接設定）
              spreadsheetLogger.sendTimestamps.set(request.taskId, {
                time: sendTime,
                aiType: request.taskInfo.aiType || 'Unknown',
                model: request.taskInfo.model || '不明'
              });

              // Step 23-7: 拡張機能のログシステムにも記録
              if (logManager) {
                logManager.log(`📝 送信時刻記録: ${request.taskInfo?.aiType} - ${request.taskId}`, {
                  category: 'system',
                  level: 'info',
                  metadata: {
                    taskId: request.taskId,
                    aiType: request.taskInfo?.aiType,
                    model: request.taskInfo?.model,
                    sendTime: sendTime.toLocaleString('ja-JP')
                  },
                  step: 'Step 23-7'
                });
              }

              sendResponse({ success: true });
            } else {
              console.warn("[Step 23-8] ❌ SpreadsheetLoggerが利用できません");
              sendResponse({ success: false, error: "SpreadsheetLogger not available" });
            }
          } catch (error) {
            console.error("[Step 23-9] ❌ 送信時刻記録エラー:", error);
            console.error("エラー詳細:", { message: error.message, stack: error.stack, name: error.name });
            sendResponse({
              success: false,
              error: error.message
            });
          }
        })();
        return true;

      // ===== Step 24: テストウィンドウ作成 =====
      case "createTestWindow":
        console.log(`[Step 24-1] 🪟 テストウィンドウ作成:`, {
          aiType: request.aiType,
          url: request.url
        });

        (async () => {
          try {
            // Step 24-2: ウィンドウ作成
            const window = await chrome.windows.create({
              url: request.url,
              type: "normal",
              state: "normal",
              left: request.left,
              top: request.top,
              width: request.width,
              height: request.height,
              focused: true  // ウィンドウを最前面に表示
            });

            // Step 24-3: タブ情報取得
            const tabs = await chrome.tabs.query({ windowId: window.id });

            sendResponse({
              success: true,
              windowId: window.id,
              tabId: tabs[0]?.id
            });
          } catch (error) {
            console.error("[Step 24-4] ウィンドウ作成エラー:", error);
            sendResponse({
              success: false,
              error: error.message
            });
          }
        })();
        return true;

      // ===== Step 25: 画面情報取得 =====
      case "getScreenInfo":
        console.log('[Step 25-1] 画面情報取得要求');
        (async () => {
          try {
            // Step 25-2: ディスプレイ情報取得
            const displays = await chrome.system.display.getInfo();
            const primaryDisplay = displays.find(d => d.isPrimary) || displays[0];

            sendResponse({
              screenWidth: primaryDisplay.bounds.width,
              screenHeight: primaryDisplay.bounds.height,
              availWidth: primaryDisplay.workArea.width,
              availHeight: primaryDisplay.workArea.height
            });
          } catch (error) {
            // Step 25-3: system.display APIが使えない場合のフォールバック
            console.warn('[Step 25-3] system.display API使用不可、デフォルト値を返します');
            sendResponse({
              screenWidth: 1920,
              screenHeight: 1080,
              availWidth: 1920,
              availHeight: 1080
            });
          }
        })();
        return true;

      // ===== Step 26: テストウィンドウ閉じる =====
      case "closeTestWindow":
        console.log('[Step 26-1] テストウィンドウクローズ要求');
        (async () => {
          try {
            if (request.data?.windowId) {
              // Step 26-2: ウィンドウを閉じる
              await chrome.windows.remove(request.data.windowId);
              sendResponse({ success: true });
            } else {
              console.error('[Step 26-3] windowId not provided');
              sendResponse({ success: false, error: "windowId not provided" });
            }
          } catch (error) {
            console.error("[Step 26-4] ウィンドウクローズエラー:", error);
            sendResponse({ success: false, error: error.message });
          }
        })();
        return true;

      // ===== Step 27: リトライ用新規ウィンドウ作成 =====
      case "RETRY_WITH_NEW_WINDOW":
        console.log(`[Step 27-1] 🔄 新規ウィンドウでリトライ:`, {
          taskId: request.taskId,
          aiType: request.aiType,
          error: request.error
        });

        (async () => {
          try {
            // Step 27-2: AIタイプに応じたURLを決定
            const aiUrls = {
              'ChatGPT': 'https://chatgpt.com',
              'Claude': 'https://claude.ai',
              'Gemini': 'https://gemini.google.com'
            };

            const url = aiUrls[request.aiType] || aiUrls['Claude'];

            // Step 27-3: 新規ウィンドウを作成
            const window = await chrome.windows.create({
              url: url,
              type: "normal",
              state: "normal",
              focused: true
            });

            const tabs = await chrome.tabs.query({ windowId: window.id });
            const newTabId = tabs[0]?.id;

            if (newTabId) {
              // Step 27-4: 新規タブでページ読み込み完了を待つ
              setTimeout(async () => {
                try {
                  // Step 27-5: 新規タブでタスクを再実行
                  const response = await chrome.tabs.sendMessage(newTabId, {
                    action: "EXECUTE_RETRY_TASK",
                    taskId: request.taskId,
                    prompt: request.prompt,
                    enableDeepResearch: request.enableDeepResearch,
                    specialMode: request.specialMode,
                    isRetry: true,
                    originalError: request.error
                  });

                  // Step 27-6: 元のタブに結果を通知
                  if (sender.tab?.id) {
                    chrome.tabs.sendMessage(sender.tab.id, {
                      action: "RETRY_RESULT",
                      taskId: request.taskId,
                      ...response
                    });
                  }

                  sendResponse({
                    success: true,
                    windowId: window.id,
                    tabId: newTabId,
                    message: "リトライタスクを開始しました"
                  });
                } catch (error) {
                  console.error("[Step 27-7] リトライタスク実行エラー:", error);
                  sendResponse({
                    success: false,
                    error: error.message
                  });
                }
              }, 5000); // ページ読み込みを待つ
            } else {
              throw new Error("新規タブIDが取得できません");
            }
          } catch (error) {
            console.error("[Step 27-8] リトライウィンドウ作成エラー:", error);
            sendResponse({
              success: false,
              error: error.message
            });
          }
        })();
        return true;

      // ===== Step 28: Dropbox認証 =====
      case "authenticateDropbox":
        console.log('[Step 28-1] Dropbox認証要求');
        (async () => {
          try {
            const result = await dropboxService.authenticate();
            sendResponse(result);
          } catch (error) {
            console.error("[Step 28-2] Dropbox認証エラー:", error);
            sendResponse({
              success: false,
              error: error.message
            });
          }
        })();
        return true;

      // ===== Step 29: Dropbox Client ID設定 =====
      case "setDropboxClientId":
        console.log('[Step 29-1] Dropbox Client ID設定要求');
        (async () => {
          try {
            const { clientId } = request.data;
            if (!clientId) {
              throw new Error('Client IDが必要です');
            }

            await dropboxService.config.setClientId(clientId);
            sendResponse({
              success: true,
              message: 'Dropbox Client IDを設定しました'
            });
          } catch (error) {
            console.error("[Step 29-2] Dropbox Client ID設定エラー:", error);
            sendResponse({
              success: false,
              error: error.message
            });
          }
        })();
        return true;

      // ===== Step 30: Dropbox設定取得 =====
      case "getDropboxSettings":
        console.log('[Step 30-1] Dropbox設定取得要求');
        (async () => {
          try {
            const settings = await dropboxService.config.getUploadSettings();
            const isAuthenticated = await dropboxService.isAuthenticated();
            const clientId = await dropboxService.config.loadClientId();

            sendResponse({
              success: true,
              settings: {
                ...settings,
                isAuthenticated,
                clientIdConfigured: !!clientId
              }
            });
          } catch (error) {
            console.error("[Step 30-2] Dropbox設定取得エラー:", error);
            sendResponse({
              success: false,
              error: error.message
            });
          }
        })();
        return true;

      // ===== Step 31: Dropbox設定更新 =====
      case "updateDropboxSettings":
        console.log('[Step 31-1] Dropbox設定更新要求');
        (async () => {
          try {
            const { settings } = request.data;
            await dropboxService.config.saveUploadSettings(settings);

            sendResponse({
              success: true,
              message: 'Dropbox設定を更新しました'
            });
          } catch (error) {
            console.error("[Step 31-2] Dropbox設定更新エラー:", error);
            sendResponse({
              success: false,
              error: error.message
            });
          }
        })();
        return true;

      // ===== Step 32: Dropboxファイルアップロード =====
      case "uploadToDropbox":
        console.log('[Step 32-1] Dropboxファイルアップロード要求');
        (async () => {
          try {
            const { fileName, content, options = {} } = request.data;

            if (!fileName || !content) {
              throw new Error('ファイル名とコンテンツが必要です');
            }

            const result = await dropboxService.uploadFile(fileName, content, options);

            sendResponse({
              success: true,
              result,
              message: 'ファイルをDropboxにアップロードしました'
            });
          } catch (error) {
            console.error("[Step 32-2] Dropboxアップロードエラー:", error);
            sendResponse({
              success: false,
              error: error.message
            });
          }
        })();
        return true;

      // ===== Step 33: Dropboxファイル一覧取得 =====
      case "listDropboxFiles":
        console.log('[Step 33-1] Dropboxファイル一覧取得要求');
        (async () => {
          try {
            const { folderPath = '' } = request.data || {};
            const files = await dropboxService.listFiles(folderPath);

            sendResponse({
              success: true,
              files
            });
          } catch (error) {
            console.error("[Step 33-2] Dropboxファイル一覧取得エラー:", error);
            sendResponse({
              success: false,
              error: error.message
            });
          }
        })();
        return true;

      // ===== Step 34: Dropboxユーザー情報取得 =====
      case "getDropboxUserInfo":
        console.log('[Step 34-1] Dropboxユーザー情報取得要求');
        (async () => {
          try {
            const userInfo = await dropboxService.getUserInfo();

            sendResponse({
              success: true,
              userInfo
            });
          } catch (error) {
            console.error("[Step 34-2] Dropboxユーザー情報取得エラー:", error);
            sendResponse({
              success: false,
              error: error.message
            });
          }
        })();
        return true;

      // ===== Step 35: Dropboxログアウト =====
      case "logoutDropbox":
        console.log('[Step 35-1] Dropboxログアウト要求');
        (async () => {
          try {
            const success = await dropboxService.logout();

            sendResponse({
              success,
              message: success ? 'Dropboxからログアウトしました' : 'ログアウトに失敗しました'
            });
          } catch (error) {
            console.error("[Step 35-2] Dropboxログアウトエラー:", error);
            sendResponse({
              success: false,
              error: error.message
            });
          }
        })();
        return true;

      // ===== Step 36: ログダウンロード完了通知 =====
      case "LOG_DOWNLOAD_COMPLETED":
        console.log('[Step 36-1] ログダウンロード完了通知:', {
          fileName: request.data?.fileName,
          timestamp: request.data?.timestamp
        });
        // 通知のみで特別な処理は不要
        sendResponse({ success: true });
        return false;

      default:
        console.warn("[Step 99] 未知のアクション:", request.action);
        sendResponse({ success: false, error: "Unknown action" });
        return false;
    }
  });

  console.log('[Step 4-3] メッセージハンドラー設定完了');
}

// Step 100: エクスポート
export default {
  setupMessageHandler,
  executeAITask
};