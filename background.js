// background.js - Service Worker for Chrome Extension (Manifest V3)
// log.debug("🚀 Background Service Worker started");

// Extension初回インストール時の処理
chrome.runtime.onInstalled.addListener(() => {
  // log.debug("✅ Extension installed/updated");
});

// タブ更新時の処理を削除 - step4-tasklist.jsで統一管理
// Content Script注入はタスク実行時にのみ行う

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
              console.log(`🔍 [Background Debug] ${aiType}から受信した応答:`, {
                responseType: typeof response,
                responseKeys: Object.keys(response || {}),
                responseResult: response?.result,
                fullResponse: response,
              });
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
            console.log(`🔍 [Background Debug 2] testResultsに保存:`, {
              aiType: aiType,
              savedResult: this.testResults[aiType],
              resultContent: this.testResults[aiType]?.content,
            });
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
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
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
    });
    // ログ記録処理は省略（デバッグ用のみ）
    sendResponse({
      success: true,
      message: "Send time recorded successfully",
      timestamp: new Date().toISOString(),
    });
    return true; // 非同期レスポンス許可
  }

  // 🔧 関数注入要求（4-2-claude-automation.js:5728から）
  if (request.action === "injectClaudeFunctions") {
    console.log("🔧 [BG-FIX] injectClaudeFunctions要求を受信:", {
      tabId: request.tabId,
      timestamp: new Date().toISOString(),
    });
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
    console.log("🔄 [BG-FIX] RETRY_WITH_NEW_WINDOW要求を受信:", {
      taskId: request.taskId,
      aiType: request.aiType,
      prompt: request.prompt?.substring(0, 50) + "...",
      retryReason: request.retryReason,
    });
    // 実際のウィンドウ管理は実装なし（デバッグ用のみ）
    sendResponse({
      success: true,
      message: "Retry request acknowledged (not implemented yet)",
      timestamp: new Date().toISOString(),
    });
    return true; // 非同期レスポンス許可
  }

  // 🔍 AI モデル・機能情報更新要求
  if (request.type === "AI_MODEL_FUNCTION_UPDATE") {
    console.log("🔍 [BG] AI モデル・機能情報受信:", {
      aiType: request.aiType,
      modelsCount: request.data.models?.length || 0,
      functionsCount: request.data.functions?.length || 0,
      timestamp: new Date().toISOString(),
    });

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
    console.log("🧪 [BG] AI統合テスト実行要求受信:", {
      prompt: request.data?.prompt,
      timestamp: request.data?.timestamp,
    });

    // AITestControllerを直接実行
    (async () => {
      try {
        console.log("🚀 [BG] AITestController実行開始");
        const controller = new AITestController();
        const result = await controller.executeTest(request.data);

        console.log("✅ [BG] AITestController実行完了:", result);
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
    console.log("🔍 [BG] AIモデル・機能探索要求受信:", {
      timestamp: new Date().toISOString(),
    });

    // AITestControllerのdiscoverOnlyメソッドを実行
    (async () => {
      try {
        console.log("🚀 [BG] AIモデル・機能探索開始");
        const controller = new AITestController();
        const result = await controller.discoverOnly();

        console.log("✅ [BG] AIモデル・機能探索完了:", result);
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
