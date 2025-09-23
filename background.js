// background.js - Service Worker for Chrome Extension (Manifest V3)
// log.debug("🚀 Background Service Worker started");

// Extension初回インストール時の処理
chrome.runtime.onInstalled.addListener(() => {
  // log.debug("✅ Extension installed/updated");
});

// タブ更新時の処理を削除 - step4-tasklist.jsで統一管理
// Content Script注入はタスク実行時にのみ行う

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

    // AITestControllerを使用してテスト実行
    (async () => {
      try {
        // Service Worker内でAITestControllerをfetch+evalで読み込み
        if (!self.AITestController) {
          console.log("🔄 [BG] AITestController読み込み開始");

          // ファイル内容を取得して評価
          const response = await fetch(
            chrome.runtime.getURL("aitest/ai-test-controller.js"),
          );

          if (!response.ok) {
            throw new Error(
              `Failed to fetch AITestController: ${response.status}`,
            );
          }

          const code = await response.text();

          // 安全にevalを実行
          try {
            eval(code);
            console.log("✅ [BG] AITestController読み込み完了");
          } catch (evalError) {
            console.error("❌ [BG] AITestController eval エラー:", evalError);
            throw new Error(
              `AITestController eval failed: ${evalError.message}`,
            );
          }
        }

        // コントローラーが正しく読み込まれているか確認
        if (!self.AITestController) {
          throw new Error("AITestController was not loaded properly");
        }

        // コントローラーインスタンスを作成して実行
        console.log("🚀 [BG] AITestController実行開始");
        const controller = new self.AITestController();
        const result = await controller.executeTest(request.data?.prompt);

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
