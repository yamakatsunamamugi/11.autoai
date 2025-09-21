// test-fixed-script.js - 修正後のContent Scriptテスト

// log.debug("🔧 Testing fixed Content Script...");

async function testFixedScript() {
  const tabs = await chrome.tabs.query({ url: "*://claude.ai/*" });

  if (tabs.length === 0) {
    // log.debug("❌ No Claude AI tab found");
    return;
  }

  const claudeTab = tabs[0];
  // log.debug("📍 Target tab:", claudeTab.id, claudeTab.url);

  // タブをリフレッシュして新しいスクリプトを読み込む
  // log.debug("🔄 Refreshing tab to load fixed script...");
  await chrome.tabs.reload(claudeTab.id);

  // ページが完全に読み込まれるまで待機
  await new Promise((resolve) => setTimeout(resolve, 3000));

  // log.debug("🔍 Checking if Content Script loaded correctly...");

  // Content Scriptが正しく読み込まれたか確認
  chrome.scripting.executeScript(
    {
      target: { tabId: claudeTab.id },
      func: () => {
        const functionsCheck = {
          executeTask: typeof window.executeTask,
          runAutomation: typeof window.runAutomation,
          inputText: typeof window.inputText,
          findClaudeElement: typeof window.findClaudeElement,
          CLAUDE_SCRIPT_LOADED: window.CLAUDE_SCRIPT_LOADED,
        };

        // log.debug("🔍 Content Script status:");
        // log.debug("  Script loaded:", window.CLAUDE_SCRIPT_LOADED === true);
        // log.debug("  Functions availability:");
        for (const [name, type] of Object.entries(functionsCheck)) {
          if (name !== "CLAUDE_SCRIPT_LOADED") {
            // log.debug(`    ${name}: ${type}`);
          }
        }

        return functionsCheck;
      },
    },
    (results) => {
      if (chrome.runtime.lastError) {
        console.error("❌ Failed to check:", chrome.runtime.lastError);
      } else if (results && results[0]) {
        const funcs = results[0].result;

        // log.debug("\n📊 === RESULTS ===");

        if (funcs.CLAUDE_SCRIPT_LOADED === true) {
          // log.debug("✅ Content Script loaded successfully!");
        } else {
          // log.debug("❌ Content Script not loaded");
        }

        let allFunctionsAvailable = true;
        for (const [name, type] of Object.entries(funcs)) {
          if (name !== "CLAUDE_SCRIPT_LOADED") {
            if (type === "function") {
              // log.debug(`✅ ${name}: Available`);
            } else {
              // log.debug(`❌ ${name}: Not available (${type})`);
              allFunctionsAvailable = false;
            }
          }
        }

        if (allFunctionsAvailable && funcs.CLAUDE_SCRIPT_LOADED === true) {
          // log.debug("\n🎉 === SUCCESS ===");
          // log.debug("All functions are now automatically available!");
          // log.debug("You can use executeTask without manual injection!");

          // 自動化テストを実行
          testAutomationAfterFix();
        } else {
          // log.debug("\n⚠️ Some functions are still missing");
          // log.debug("Check Claude AI tab console for errors");
        }
      }
    },
  );
}

// 修正後の自動化テスト
async function testAutomationAfterFix() {
  // log.debug("\n📝 Testing automation with fixed script...");

  const tabs = await chrome.tabs.query({ url: "*://claude.ai/*" });
  if (tabs.length === 0) return;

  const claudeTab = tabs[0];

  chrome.scripting.executeScript(
    {
      target: { tabId: claudeTab.id },
      func: async () => {
        try {
          if (typeof window.executeTask !== "function") {
            throw new Error("executeTask is not available");
          }

          // テストメッセージを送信
          const task = {
            prompt:
              "修正完了！これはテストメッセージです。短く返答してください。",
            model: "claude-3-5-sonnet-20241022",
          };

          // log.debug("📤 Sending test message:", task.prompt);
          const result = await window.executeTask(task);

          if (result) {
            // log.debug("✅ Message sent successfully!");
            return { success: true };
          } else {
            // log.debug("❌ Failed to send message");
            return { success: false };
          }
        } catch (error) {
          console.error("❌ Error:", error);
          return { success: false, error: error.message };
        }
      },
    },
    (results) => {
      if (results && results[0]) {
        const result = results[0].result;
        if (result.success) {
          // log.debug("\n🎊 === COMPLETE SUCCESS ===");
          // log.debug("✅ Content Script is fixed and working!");
          // log.debug("✅ Claude automation is fully functional!");
        } else {
          // log.debug("❌ Automation test failed:", result.error);
        }
      }
    },
  );
}

// 実行
testFixedScript();
