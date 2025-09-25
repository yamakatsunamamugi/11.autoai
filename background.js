// background.js - Service Worker for Chrome Extension (Manifest V3)
// log.debug("🚀 Background Service Worker started");

// Extension初回インストール時の処理
chrome.runtime.onInstalled.addListener(() => {
  // log.debug("✅ Extension installed/updated");
});

// タブ更新時の処理を削除 - step4-tasklist.jsで統一管理
// Content Script注入はタスク実行時にのみ行う

// ========================================
// SimpleSheetsClient: スプレッドシート操作クラス
// ========================================
class SimpleSheetsClient {
  constructor() {
    this.baseUrl = "https://sheets.googleapis.com/v4/spreadsheets";
  }

  /**
   * 認証トークン取得
   */
  async getAuthToken() {
    return new Promise((resolve, reject) => {
      if (typeof chrome === "undefined" || !chrome.identity) {
        reject(new Error("Chrome Identity APIが利用できません"));
        return;
      }

      chrome.identity.getAuthToken({ interactive: false }, (token) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(token);
        }
      });
    });
  }

  /**
   * スプレッドシートに値を書き込み（単一セル）
   */
  async updateValue(spreadsheetId, range, value) {
    const token = await this.getAuthToken();
    const url = `${this.baseUrl}/${spreadsheetId}/values/${range}?valueInputOption=USER_ENTERED`;

    const response = await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        values: [[value]],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`書き込み失敗: HTTP ${response.status}, ${errorText}`);
    }

    return await response.json();
  }
}

// グローバルインスタンス
const sheetsClient = new SimpleSheetsClient();

// ========================================
// ログ記録関数
// ========================================

/**
 * ログをフォーマット
 */
function formatLogEntry(request) {
  const parts = [];
  const aiType = request.taskInfo?.aiType || "AI不明";

  // デバッグ：request全体の構造確認
  console.log("🔍 [DEBUG-formatLogEntry] request全体:", {
    requestKeys: Object.keys(request),
    hasTaskInfo: !!request.taskInfo,
    taskInfoType: typeof request.taskInfo,
    aiType: aiType,
  });

  // AIタイプをヘッダーとして
  parts.push(`---------- ${aiType} ----------`);

  // モデル情報
  const model =
    request.taskInfo?.model && request.taskInfo?.model !== "不明"
      ? request.taskInfo.model
      : "不明";
  parts.push(`モデル: 選択: ${model} / 表示: ${model}`);

  // 機能情報
  const func =
    request.taskInfo?.function && request.taskInfo?.function !== "通常"
      ? request.taskInfo.function
      : "通常";
  parts.push(`機能: 選択: ${func} / 表示: ${func}`);

  // URL
  console.log("🔍 [DEBUG-URL] formatLogEntry内のURL処理:", {
    hasTaskInfo: !!request.taskInfo,
    hasUrl: !!request.taskInfo?.url,
    urlValue: request.taskInfo?.url,
    urlType: typeof request.taskInfo?.url,
    urlLength: request.taskInfo?.url?.length,
    taskInfoKeys: request.taskInfo ? Object.keys(request.taskInfo) : [],
  });

  // 🔍 formatLogEntry引数の完全なデバッグ
  console.log("🔍 [FORMAT-LOG-ARGS] formatLogEntry呼び出し時の全引数:", {
    requestType: typeof request,
    requestKeys: Object.keys(request),
    requestStringified: JSON.stringify(request, null, 2),
    taskInfoExists: !!request.taskInfo,
    taskInfoStringified: request.taskInfo
      ? JSON.stringify(request.taskInfo, null, 2)
      : "なし",
    urlDirectAccess: request.taskInfo?.url,
    urlViaDestruct: request.taskInfo && request.taskInfo.url,
    timestamp: new Date().toISOString(),
  });

  // URLが存在し、空文字列でない場合に追加（防御的処理強化）
  const urlValue = request.taskInfo?.url;
  if (urlValue && typeof urlValue === "string" && urlValue.trim() !== "") {
    parts.push(`URL: ${urlValue}`);
    console.log("✅ [DEBUG-URL] URLをログに追加:", urlValue);
  } else {
    // URLが無い場合の詳細ログ
    console.warn("⚠️ [DEBUG-URL] URLが存在しないか空のため追加されません:", {
      urlExists: !!urlValue,
      urlType: typeof urlValue,
      urlValue: urlValue,
      taskInfoExists: !!request.taskInfo,
      requestKeys: Object.keys(request),
    });

    // フォールバック: 他の場所からURLを探索
    const fallbackUrl =
      request.url || request.taskInfo?.cellInfo?.url || request.data?.url;
    if (
      fallbackUrl &&
      typeof fallbackUrl === "string" &&
      fallbackUrl.trim() !== ""
    ) {
      parts.push(`URL: ${fallbackUrl}`);
      console.log("🔄 [DEBUG-URL] フォールバックURLをログに追加:", fallbackUrl);
    }
  }

  // 送信時刻
  if (request.sendTime) {
    const sendTime = new Date(request.sendTime);
    parts.push(`送信時刻: ${sendTime.toLocaleString("ja-JP")}`);
  }

  // 記載時刻（タスク完了時刻を使用）
  if (request.completionTime) {
    const recordTime = new Date(request.completionTime);
    const timeDiff = request.sendTime
      ? Math.round(
          (recordTime.getTime() - new Date(request.sendTime).getTime()) / 1000,
        )
      : 0;
    parts.push(
      `記載時刻: ${recordTime.toLocaleString("ja-JP")} (${timeDiff}秒後)`,
    );
  } else {
    // completionTimeが無い場合は現在時刻を使用（後方互換性）
    const recordTime = new Date();
    const timeDiff = request.sendTime
      ? Math.round(
          (recordTime.getTime() - new Date(request.sendTime).getTime()) / 1000,
        )
      : 0;
    parts.push(
      `記載時刻: ${recordTime.toLocaleString("ja-JP")} (${timeDiff}秒後)`,
    );
  }

  return parts.join("\n");
}

/**
 * スプレッドシートにログを記録
 */
async function recordLogToSpreadsheet(request) {
  try {
    // Chrome storage からスプレッドシート情報とタスクグループ情報を取得
    const result = await chrome.storage.local.get([
      "spreadsheetId",
      "gid",
      "currentTaskGroup",
    ]);

    if (!result.spreadsheetId) {
      // スプレッドシートIDが未設定の場合は静かにスキップ
      throw new Error("スプレッドシートIDが設定されていません");
    }

    // requestオブジェクトからlogCellを複数の方法で取得試行
    let logCell = request.logCell;

    // フォールバック機能: 複数の場所からlogCellを探索
    if (!logCell) {
      logCell =
        request.task?.logCell ||
        request.taskData?.logCell ||
        request.taskInfo?.logCell ||
        request.data?.task?.logCell ||
        request.payload?.logCell;
    }

    if (!logCell) {
      console.error(
        "ログセル位置（logCell）が見つからないためログ記録をスキップ",
        JSON.stringify(
          {
            requestLogCell: request.logCell,
            requestLogCellType: typeof request.logCell,
            requestTaskId: request.taskId,
            requestKeys: Object.keys(request),
            allRequestData: request,
          },
          null,
          2,
        ),
      );
      return;
    }

    // デバッグ：requestの内容確認
    console.log("🔍 [DEBUG-URL] recordLogToSpreadsheet内のrequest:", {
      hasTaskInfo: !!request.taskInfo,
      taskInfoKeys: request.taskInfo ? Object.keys(request.taskInfo) : [],
      taskInfoUrl: request.taskInfo?.url,
      requestKeys: Object.keys(request),
      taskId: request.taskId,
      logCell: logCell,
    });

    // ログをフォーマット
    const logText = formatLogEntry(request);

    // 指定されたログセルにログを記録
    const range = logCell;
    await sheetsClient.updateValue(result.spreadsheetId, range, logText);

    console.log(`📊 ログ記録完了: ${range} → ${logText}`);
  } catch (error) {
    console.error("❌ スプレッドシートログ記録エラー:", error);
    throw error;
  }
}

// ========================================
// AITestController クラス定義（background.js内）
// ========================================

// ログレベル定義
const LOG_LEVEL = { ERROR: 1, WARN: 2, INFO: 3, DEBUG: 4 };
let CURRENT_LOG_LEVEL = LOG_LEVEL.INFO;

// ログユーティリティ
const log = {
  error: (...args) => {
    if (CURRENT_LOG_LEVEL >= LOG_LEVEL.ERROR) console.error(...args);
  },
  warn: (...args) => {
    if (CURRENT_LOG_LEVEL >= LOG_LEVEL.WARN) console.warn(...args);
  },
  info: (...args) => {
    if (CURRENT_LOG_LEVEL >= LOG_LEVEL.INFO) console.log(...args);
  },
  debug: (...args) => {
    if (CURRENT_LOG_LEVEL >= LOG_LEVEL.DEBUG) console.log(...args);
  },
};

class AITestController {
  constructor() {
    this.windows = {
      chatgpt: null,
      claude: null,
      gemini: null,
    };

    this.tabs = {
      chatgpt: null,
      claude: null,
      gemini: null,
    };

    this.urls = {
      chatgpt: "https://chatgpt.com",
      claude: "https://claude.ai/new",
      gemini: "https://gemini.google.com/app",
    };

    this.readyStates = {
      chatgpt: false,
      claude: false,
      gemini: false,
    };

    this.testResults = {
      chatgpt: null,
      claude: null,
      gemini: null,
    };
  }

  async executeTest(testConfig) {
    // 設定の型を確認（文字列の場合は後方互換性のため変換）
    if (typeof testConfig === "string") {
      testConfig = {
        chatgpt: { prompt: testConfig },
        claude: { prompt: testConfig },
        gemini: { prompt: testConfig },
      };
    }

    // デフォルト値を設定
    testConfig = testConfig || {
      chatgpt: { prompt: "こんにちは！今日はいい天気ですね。AIテストです。" },
      claude: { prompt: "こんにちは！今日はいい天気ですね。AIテストです。" },
      gemini: { prompt: "こんにちは！今日はいい天気ですね。AIテストです。" },
    };

    log.info("🚀 AI統合テスト開始", testConfig);

    try {
      // Step 1: 画面サイズを取得
      const screenInfo = await this.getScreenInfo();

      // Step 2: 3つのウィンドウを配置して作成
      await this.createTestWindows(screenInfo);

      // Step 3: Content Scriptの準備を待つ
      await this.waitForContentScripts();

      // Step 4: 各AIに個別設定でテストタスクを送信
      await this.sendTestTasks(testConfig);

      // Step 5: 結果を待つ
      await this.waitForResults();

      log.info("✅ AI統合テスト完了", this.testResults);
      return {
        success: true,
        results: this.testResults,
      };
    } catch (error) {
      log.error("❌ AI統合テストエラー:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  async getScreenInfo() {
    return new Promise((resolve) => {
      chrome.system.display.getInfo((displays) => {
        const primaryDisplay = displays.find((d) => d.isPrimary) || displays[0];
        const workArea = primaryDisplay.workArea;
        log.debug("画面情報:", workArea);
        resolve(workArea);
      });
    });
  }

  async createTestWindows(screenInfo) {
    const windowWidth = Math.floor(screenInfo.width / 2);
    const windowHeight = Math.floor(screenInfo.height / 2);

    const positions = {
      chatgpt: { left: 0, top: 0 },
      claude: { left: windowWidth, top: 0 },
      gemini: { left: 0, top: windowHeight },
    };

    const createPromises = [];

    for (const [aiType, url] of Object.entries(this.urls)) {
      const position = positions[aiType];

      const windowOptions = {
        url: url,
        type: "popup",
        left: screenInfo.left + position.left,
        top: screenInfo.top + position.top,
        width: windowWidth,
        height: windowHeight,
        focused: false,
      };

      const promise = new Promise((resolve, reject) => {
        chrome.windows.create(windowOptions, (window) => {
          if (chrome.runtime.lastError) {
            reject(
              new Error(
                `${aiType} ウィンドウ作成エラー: ${chrome.runtime.lastError.message}`,
              ),
            );
            return;
          }

          this.windows[aiType] = window;
          this.tabs[aiType] = window.tabs[0];

          log.info(`✅ ${aiType} ウィンドウ作成完了`, {
            windowId: window.id,
            tabId: window.tabs[0].id,
            position: position,
          });

          resolve(window);
        });
      });

      createPromises.push(promise);
    }

    await Promise.all(createPromises);
    log.info("✅ 全てのウィンドウを作成しました");
  }

  async waitForContentScripts() {
    log.info("⏳ Content Scriptの準備を待っています...");

    const maxWaitTime = 30000;
    const checkInterval = 1000;
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitTime) {
      const pingPromises = [];

      for (const [aiType, tabId] of Object.entries(this.tabs)) {
        if (!this.readyStates[aiType] && tabId) {
          const promise = chrome.tabs
            .sendMessage(tabId.id, {
              type: "PING",
              aiType: aiType,
            })
            .then(() => {
              this.readyStates[aiType] = true;
              log.info(`✅ ${aiType} Content Script準備完了`);
              return true;
            })
            .catch(() => {
              return false;
            });

          pingPromises.push(promise);
        }
      }

      await Promise.all(pingPromises);

      if (Object.values(this.readyStates).every((ready) => ready)) {
        log.info("✅ 全てのContent Scriptが準備完了");

        // 各AIのモデル・機能探索を実行
        await this.discoverAllAIFeatures();

        return true;
      }

      await new Promise((resolve) => setTimeout(resolve, checkInterval));
    }

    const notReady = Object.entries(this.readyStates)
      .filter(([_, ready]) => !ready)
      .map(([aiType, _]) => aiType);

    log.warn(
      `⚠️ 一部のContent Scriptが準備できませんでした: ${notReady.join(", ")}`,
    );

    // 準備できたものだけで続行して探索
    await this.discoverAllAIFeatures();

    return false;
  }

  // ========================================
  // 全AIのモデル・機能探索
  // ========================================
  async discoverAllAIFeatures() {
    log.info("🔍 各AIサービスのモデル・機能を探索中...");

    const discoveryPromises = [];

    // ChatGPTの探索
    if (this.readyStates["chatgpt"] && this.tabs["chatgpt"]) {
      discoveryPromises.push(
        this.discoverAIFeatures("chatgpt")
          .then((result) => {
            this.chatgptCapabilities = result;
            log.info("✅ ChatGPT探索完了", result);
          })
          .catch((error) => {
            log.error("❌ ChatGPT探索エラー:", error);
          }),
      );
    }

    // Claudeの探索
    if (this.readyStates["claude"] && this.tabs["claude"]) {
      discoveryPromises.push(
        this.discoverAIFeatures("claude")
          .then((result) => {
            this.claudeCapabilities = result;
            log.info("✅ Claude探索完了", result);
          })
          .catch((error) => {
            log.error("❌ Claude探索エラー:", error);
          }),
      );
    }

    // Geminiの探索
    if (this.readyStates["gemini"] && this.tabs["gemini"]) {
      discoveryPromises.push(
        this.discoverAIFeatures("gemini")
          .then((result) => {
            this.geminiCapabilities = result;
            log.info("✅ Gemini探索完了", result);
          })
          .catch((error) => {
            log.error("❌ Gemini探索エラー:", error);
          }),
      );
    }

    await Promise.all(discoveryPromises);
    log.info("✅ 全AIサービスの探索が完了しました");
  }

  // ========================================
  // 個別AIのモデル・機能探索
  // ========================================
  async discoverAIFeatures(aiType) {
    if (!this.readyStates[aiType] || !this.tabs[aiType]) {
      log.info(
        `⏭️ ${aiType}が準備できていないため、モデル・機能探索をスキップ`,
      );
      return null;
    }

    log.info(`🔍 ${aiType}のモデル・機能を探索中...`);

    try {
      const response = await chrome.tabs.sendMessage(this.tabs[aiType].id, {
        type: "DISCOVER_FEATURES",
        aiType: aiType,
      });

      if (response && response.success) {
        log.info(`✅ ${aiType}探索成功`, {
          models: response.result?.models || [],
          features: response.result?.features || [],
        });

        return response.result;
      } else {
        log.warn(`⚠️ ${aiType}探索失敗`, response);
        return null;
      }
    } catch (error) {
      log.error(`❌ ${aiType}探索エラー:`, error);
      return null;
    }
  }

  async sendTestTasks(testConfig) {
    log.info("📤 テストタスクを送信中...");

    const taskPromises = [];

    for (const [aiType, tabId] of Object.entries(this.tabs)) {
      if (this.readyStates[aiType] && tabId) {
        // 各AIサービスの個別設定を取得
        const aiConfig = testConfig[aiType] || {};

        const taskData = {
          prompt: aiConfig.prompt || "デフォルトプロンプト",
          model: aiConfig.model || "",
          feature: aiConfig.feature || "",
          taskId: `test_${aiType}_${Date.now()}`,
          timestamp: new Date().toISOString(),
        };

        log.debug(`📝 ${aiType}への送信タスク:`, taskData);

        const promise = chrome.tabs
          .sendMessage(tabId.id, {
            type: "EXECUTE_TASK",
            aiType: aiType,
            taskData: taskData,
          })
          .then((response) => {
            log.info(`✅ ${aiType} タスク送信成功`, response);

            // デバッグログ追加
            if (aiType === "claude") {
            }

            return response;
          })
          .catch((error) => {
            log.error(`❌ ${aiType} タスク送信エラー:`, error);
            return { success: false, error: error.message };
          });

        taskPromises.push(promise);
      }
    }

    const results = await Promise.all(taskPromises);
    log.info("📤 全てのタスクを送信しました", results);
    return results;
  }

  async waitForResults() {
    log.info("⏳ テスト結果を待っています...");

    const maxWaitTime = 180000;
    const checkInterval = 2000;
    const startTime = Date.now();

    const messageHandler = (request, sender, sendResponse) => {
      if (request.type === "TASK_COMPLETE") {
        const aiType = request.aiType;
        if (aiType && this.tabs[aiType]) {
          this.testResults[aiType] = request.result;
          log.info(`✅ ${aiType} テスト完了`, request.result);

          // デバッグログ追加
          if (aiType === "claude") {
          }
        }
      }
    };

    chrome.runtime.onMessage.addListener(messageHandler);

    while (Date.now() - startTime < maxWaitTime) {
      const completedCount = Object.values(this.testResults).filter(
        (r) => r !== null,
      ).length;
      const expectedCount = Object.values(this.readyStates).filter(
        (r) => r,
      ).length;

      if (completedCount >= expectedCount) {
        log.info("✅ 全てのテスト結果を受信しました");
        chrome.runtime.onMessage.removeListener(messageHandler);
        return true;
      }

      await new Promise((resolve) => setTimeout(resolve, checkInterval));

      if ((Date.now() - startTime) % 10000 === 0) {
        log.debug(`待機中... (${completedCount}/${expectedCount} 完了)`);
      }
    }

    chrome.runtime.onMessage.removeListener(messageHandler);
    log.warn("⚠️ 一部のテストがタイムアウトしました");
    return false;
  }

  async discoverOnly() {
    log.info("🔍 AIモデル・機能探索のみ実行開始");

    try {
      // Step 1: 画面サイズを取得
      const screenInfo = await this.getScreenInfo();

      // Step 2: 3つのウィンドウを配置して作成
      await this.createTestWindows(screenInfo);

      // Step 3: Content Scriptの準備を待つ
      await this.waitForContentScripts();

      // Step 4: 探索は waitForContentScripts 内で実行済み

      // Step 5: 少し待ってからウィンドウを閉じる (無効化 - テスト用にウィンドウを残す)
      // await new Promise((resolve) => setTimeout(resolve, 2000));

      // Step 6: クリーンアップ (無効化 - テスト用にウィンドウを残す)
      // await this.cleanup();
      log.info("🔧 テスト用にウィンドウを残します（クリーンアップをスキップ）");

      log.info("✅ AIモデル・機能探索完了");
      return {
        success: true,
        capabilities: {
          chatgpt: this.chatgptCapabilities,
          claude: this.claudeCapabilities,
          gemini: this.geminiCapabilities,
        },
      };
    } catch (error) {
      log.error("❌ AIモデル・機能探索エラー:", error);
      // await this.cleanup(); // エラー時もウィンドウを残す
      log.info("🔧 エラー時もテスト用にウィンドウを残します");
      return {
        success: false,
        error: error.message,
      };
    }
  }

  async cleanup() {
    log.info("🧹 テストウィンドウをクリーンアップ中...");

    const closePromises = [];

    for (const [aiType, window] of Object.entries(this.windows)) {
      if (window && window.id) {
        const promise = new Promise((resolve) => {
          chrome.windows.remove(window.id, () => {
            if (chrome.runtime.lastError) {
              log.warn(
                `${aiType} ウィンドウクローズエラー:`,
                chrome.runtime.lastError,
              );
            } else {
              log.debug(`✅ ${aiType} ウィンドウをクローズしました`);
            }
            resolve();
          });
        });
        closePromises.push(promise);
      }
    }

    await Promise.all(closePromises);

    this.windows = { chatgpt: null, claude: null, gemini: null };
    this.tabs = { chatgpt: null, claude: null, gemini: null };
    this.readyStates = { chatgpt: false, claude: false, gemini: false };
    this.testResults = { chatgpt: null, claude: null, gemini: null };

    log.info("✅ クリーンアップ完了");
  }
}

// ========================================
// メッセージリスナー
// ========================================

// Extension間メッセージの中継
chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
  // log.debug("📨 Message received in background:", {
  //   type: request.type,
  //   from: sender.tab ? `Tab ${sender.tab.id}` : "Extension",
  // });

  // Content Script初期化確認
  if (request.type === "content_script_ready") {
    // log.debug("✅ Content Script initialized on tab:", sender.tab?.id);
    sendResponse({ success: true, message: "Background acknowledged" });
    return true;
  }

  // 📝 送信時刻記録要求（4-2-claude-automation.js:4295から）
  if (request.type === "recordSendTime") {
    console.log("📝 [BG-FIX] recordSendTime要求を受信:", {
      taskId: request.taskId,
      sendTime: request.sendTime,
      taskInfo: request.taskInfo,
      logCell: request.logCell, // 🔍 logCell受信状況確認
    });

    // 🔍 URL記録デバッグ - URLが含まれているかチェック
    console.log("🔍 [URL-DEBUG] taskInfo詳細:", {
      hasTaskInfo: !!request.taskInfo,
      taskInfoKeys: request.taskInfo ? Object.keys(request.taskInfo) : [],
      hasUrl: !!request.taskInfo?.url,
      urlValue: request.taskInfo?.url,
      aiType: request.taskInfo?.aiType,
    });

    // 送信時刻のみを記録（後でタスク完了時に記載時刻と合わせて記録）
    // Chrome storageに一時保存（ディープコピーでデータ保護）
    const taskLogData = {
      taskId: request.taskId,
      sendTime: request.sendTime,
      taskInfo: JSON.parse(JSON.stringify(request.taskInfo)), // ディープコピー
      logCell: request.logCell,
    };

    // 🔍 保存前のURL確認ログ
    console.log("🔍 [DEBUG-STORAGE] 保存前のtaskLogData:", {
      hasTaskInfo: !!taskLogData.taskInfo,
      hasUrl: !!taskLogData.taskInfo?.url,
      urlValue: taskLogData.taskInfo?.url,
      taskInfoKeys: taskLogData.taskInfo
        ? Object.keys(taskLogData.taskInfo)
        : [],
    });

    // Promise版Chrome Storageを使用（非同期処理の確実性向上）
    try {
      await chrome.storage.local.set({
        [`taskLog_${request.taskId}`]: taskLogData,
      });

      // 🔍 保存後の確認読み取り
      const verifyResult = await chrome.storage.local.get([
        `taskLog_${request.taskId}`,
      ]);
      const savedData = verifyResult[`taskLog_${request.taskId}`];
      console.log("🔍 [DEBUG-STORAGE] 保存後の確認読み取り:", {
        dataExists: !!savedData,
        hasTaskInfo: !!savedData?.taskInfo,
        hasUrl: !!savedData?.taskInfo?.url,
        urlValue: savedData?.taskInfo?.url,
      });

      console.log("📝 送信時刻を一時保存しました:", request.taskId);

      sendResponse({
        success: true,
        message: "Send time recorded successfully",
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("❌ Chrome Storage保存エラー:", error);
      sendResponse({
        success: false,
        message: "Failed to save send time",
        error: error.message,
      });
    }
    return true; // 非同期レスポンス許可
  }

  // 📝 タスク完了時のログ記録要求
  if (request.type === "recordCompletionTime") {
    console.log("📝 タスク完了時刻記録要求を受信:", {
      taskId: request.taskId,
      completionTime: request.completionTime,
    });

    // 非同期処理を適切にラップして実行
    (async () => {
      try {
        // Chrome storageから送信時の情報を取得（Promise版で確実性向上）
        const result = await chrome.storage.local.get([
          `taskLog_${request.taskId}`,
        ]);
        const taskLogData = result[`taskLog_${request.taskId}`];

        // 🔍 取得後のURL確認ログ（強化版）
        console.log("🔍 [DEBUG-STORAGE] 取得後のtaskLogData:", {
          dataExists: !!taskLogData,
          hasTaskInfo: !!taskLogData?.taskInfo,
          hasUrl: !!taskLogData?.taskInfo?.url,
          urlValue: taskLogData?.taskInfo?.url,
          urlValueType: typeof taskLogData?.taskInfo?.url,
          urlValueLength: taskLogData?.taskInfo?.url?.length,
          taskInfoKeys: taskLogData?.taskInfo
            ? Object.keys(taskLogData.taskInfo)
            : [],
          allDataKeys: taskLogData ? Object.keys(taskLogData) : [],
          completeTaskInfo: taskLogData?.taskInfo,
        });

        // 🔍 URL値の詳細分析
        if (taskLogData?.taskInfo) {
          console.log("🔍 [URL-DETAILED-CHECK] taskInfo詳細分析:", {
            taskInfoStringified: JSON.stringify(taskLogData.taskInfo, null, 2),
            urlProperty: taskLogData.taskInfo.url,
            urlPropertyExists: "url" in taskLogData.taskInfo,
            urlPropertyType: typeof taskLogData.taskInfo.url,
            urlTruthyCheck: !!taskLogData.taskInfo.url,
            urlEmptyCheck: taskLogData.taskInfo.url === "",
            urlNullCheck: taskLogData.taskInfo.url === null,
            urlUndefinedCheck: taskLogData.taskInfo.url === undefined,
          });
        }

        if (taskLogData) {
          // URL防御的チェック - もしURLが失われていたら警告
          if (!taskLogData.taskInfo?.url) {
            console.warn(
              "⚠️ [URL-WARNING] 取得されたデータにURLが含まれていません!",
              {
                taskId: request.taskId,
                taskInfo: taskLogData.taskInfo,
              },
            );
          }

          // 完了時刻を追加
          taskLogData.completionTime =
            request.completionTime || new Date().toISOString();

          // スプレッドシートにログを記録
          try {
            await recordLogToSpreadsheet(taskLogData);
            console.log("📊 タスク完了ログ記録成功:", request.taskId);

            // 使用済みデータを削除
            await chrome.storage.local.remove([`taskLog_${request.taskId}`]);
          } catch (error) {
            console.error("❌ タスク完了ログ記録エラー:", error);
            // エラーが発生してもレスポンスは返す
          }
        } else {
          console.warn("⚠️ 送信時刻データが見つかりません:", request.taskId);
        }

        // 成功レスポンスを送信
        sendResponse({
          success: true,
          message: "Completion time recorded successfully",
        });
      } catch (storageError) {
        console.error("❌ Chrome Storage取得エラー:", storageError);
        // エラーレスポンスを送信
        sendResponse({
          success: false,
          message: "Storage error occurred",
          error: storageError.message,
        });
      }
    })();

    return true; // 非同期レスポンス許可
  }

  // 🔧 関数注入要求（4-2-claude-automation.js:5728から）
  if (request.action === "injectClaudeFunctions") {
    // 実際の注入は既にContent Script側で完了済み
    sendResponse({
      success: true,
      message: "Functions already injected via content script",
      injected: true,
    });
    return true; // 非同期レスポンス許可
  }

  // 🔄 新規ウィンドウでのリトライ要求（ChatGPT, Geminiから）
  if (request.type === "RETRY_WITH_NEW_WINDOW") {
    // 実際のウィンドウ管理は実装なし（デバッグ用のみ）
    sendResponse({
      success: true,
      message: "Retry request acknowledged (not implemented yet)",
      timestamp: new Date().toISOString(),
    });
    return true; // 非同期レスポンス許可
  }

  // 🚨 全AI Overloadedエラー対応: ウィンドウリセット (汎用版)
  if (
    request.action === "RESET_AI_WINDOW" ||
    request.action === "RESET_CLAUDE_WINDOW"
  ) {
    const aiType = request.aiType || "claude";

    // AI別のURL設定
    const urlPatterns = {
      claude: "*://*.claude.ai/*",
      chatgpt: "*://chatgpt.com/*",
      gemini: "*://gemini.google.com/*",
      genspark: "*://genspark.ai/*",
    };

    const urlPattern = urlPatterns[aiType] || urlPatterns.claude;

    // 指定されたAIのタブを特定して閉じる
    chrome.tabs.query({ url: urlPattern }, (tabs) => {
      tabs.forEach((tab) => {
        chrome.tabs.remove(tab.id);
      });
    });

    sendResponse({
      success: true,
      message: `${aiType.toUpperCase()} window reset completed`,
      aiType: aiType,
      timestamp: new Date().toISOString(),
    });
    return true;
  }

  // 🚨 全AI Overloadedエラー対応: 新しいウィンドウを開く (汎用版)
  if (
    request.action === "OPEN_AI_WINDOW" ||
    request.action === "OPEN_CLAUDE_WINDOW"
  ) {
    const aiType = request.aiType || "claude";

    // AI別のURL設定
    const urls = {
      claude: "https://claude.ai/new",
      chatgpt: "https://chatgpt.com/",
      gemini: "https://gemini.google.com/",
      genspark: "https://genspark.ai/",
    };

    const targetUrl = urls[aiType] || urls.claude;

    // 新しいAIタブを開く
    chrome.tabs.create(
      {
        url: targetUrl,
        active: true,
      },
      (tab) => {
        sendResponse({
          success: true,
          message: `New ${aiType.toUpperCase()} window opened`,
          aiType: aiType,
          tabId: tab.id,
          targetUrl: targetUrl,
          timestamp: new Date().toISOString(),
        });
      },
    );

    return true;
  }

  // 🔍 AI モデル・機能情報更新要求
  if (request.type === "AI_MODEL_FUNCTION_UPDATE") {
    // UIウィンドウにメッセージを転送
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach((tab) => {
        if (tab.url && tab.url.includes("chrome-extension://")) {
          chrome.tabs
            .sendMessage(tab.id, {
              type: "AI_MODEL_FUNCTION_UPDATE",
              aiType: request.aiType,
              data: request.data,
            })
            .catch(() => {
              // エラーは無視（UIタブが見つからない場合）
            });
        }
      });
    });

    sendResponse({
      success: true,
      message: "AI information forwarded to UI",
      timestamp: new Date().toISOString(),
    });
    return true; // 非同期レスポンス許可
  }

  // 🧪 AI統合テスト実行要求
  if (request.type === "RUN_AI_TEST_ALL") {
    // AITestControllerを直接実行
    (async () => {
      try {
        const controller = new AITestController();
        const result = await controller.executeTest(request.data);

        sendResponse({
          success: result.success,
          results: result.results,
          error: result.error,
        });
      } catch (error) {
        console.error("❌ [BG] AI統合テストエラー:", error);
        sendResponse({
          success: false,
          error: error.message,
        });
      }
    })();

    return true; // 非同期レスポンス許可
  }

  // 🔍 AIモデル・機能探索のみ実行要求
  if (request.action === "DISCOVER_AI_FEATURES_ONLY") {
    // AITestControllerのdiscoverOnlyメソッドを実行
    (async () => {
      try {
        const controller = new AITestController();
        const result = await controller.discoverOnly();

        sendResponse({
          success: result.success,
          capabilities: result.capabilities,
          error: result.error,
        });
      } catch (error) {
        console.error("❌ [BG] AIモデル・機能探索エラー:", error);
        sendResponse({
          success: false,
          error: error.message,
        });
      }
    })();

    return true; // 非同期レスポンス許可
  }

  // 注意: Content Script注入はmanifest.json自動注入に移行済み
  // Content Script注入要求は廃止

  return true; // 非同期レスポンスを許可
});

// 注意: Content Script注入機能は廃止
// manifest.json自動注入方式に移行済み

// エラーハンドリング
self.addEventListener("unhandledrejection", (event) => {
  console.error("❌ Unhandled promise rejection:", event.reason);
});

// log.debug("✅ Background Service Worker ready");
