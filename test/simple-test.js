// simple-test.js - シンプルなClaude自動化テスト

const output = document.getElementById("output");

function log(message) {
  const timestamp = new Date().toLocaleTimeString();
  output.textContent += `[${timestamp}] ${message}\n`;
  console.log(message);
}

// テストボタンのクリックハンドラ
document.getElementById("testBtn").addEventListener("click", async () => {
  log("🔍 Testing Claude automation...");

  try {
    const tabs = await chrome.tabs.query({ url: "*://claude.ai/*" });

    if (tabs.length === 0) {
      log("❌ No Claude AI tab found. Please open claude.ai first.");
      return;
    }

    const claudeTab = tabs[0];
    log(`✅ Found Claude tab: ${claudeTab.url}`);

    // Content Scriptの関数を直接呼び出す
    const results = await chrome.scripting.executeScript({
      target: { tabId: claudeTab.id },
      func: () => {
        // Content Script内の関数をチェック
        return {
          executeTask: typeof executeTask,
          findClaudeElement: typeof findClaudeElement,
          inputText: typeof inputText,
          runAutomation: typeof runAutomation,
          CLAUDE_SCRIPT_LOADED: window.CLAUDE_SCRIPT_LOADED,
        };
      },
    });

    if (results && results[0]) {
      const funcs = results[0].result;
      log("\n📊 Function availability:");

      for (const [name, value] of Object.entries(funcs)) {
        if (name === "CLAUDE_SCRIPT_LOADED") {
          log(`  ${name}: ${value}`);
        } else {
          const icon = value === "function" ? "✅" : "❌";
          log(`  ${icon} ${name}: ${value}`);
        }
      }

      if (funcs.executeTask === "function") {
        log("\n🎉 Claude automation is ready!");
      } else {
        log("\n⚠️ Functions not available. Reload Claude tab and try again.");
      }
    }
  } catch (error) {
    log(`❌ Error: ${error.message}`);
  }
});

// メッセージ送信ボタンのクリックハンドラ
document.getElementById("sendBtn").addEventListener("click", async () => {
  log("\n📤 Sending test message to Claude...");

  try {
    const tabs = await chrome.tabs.query({ url: "*://claude.ai/*" });

    if (tabs.length === 0) {
      log("❌ No Claude AI tab found. Please open claude.ai first.");
      return;
    }

    const claudeTab = tabs[0];

    // chrome.scripting.executeScriptを使って直接実行
    const results = await chrome.scripting.executeScript({
      target: { tabId: claudeTab.id },
      func: async () => {
        try {
          // executeTask関数の存在確認
          if (typeof window.executeTask !== "function") {
            throw new Error("executeTask function is not defined");
          }

          // テストメッセージを送信
          const task = {
            prompt:
              "こんにちは！これは拡張機能からのテストメッセージです。短く返答してください。",
            model: "claude-3-5-sonnet-20241022",
          };

          console.log("📤 Executing task with prompt:", task.prompt);
          const result = await window.executeTask(task);

          if (result) {
            return { success: true, message: "Message sent successfully" };
          } else {
            return { success: false, message: "Failed to send message" };
          }
        } catch (error) {
          return { success: false, error: error.message };
        }
      },
    });

    if (results && results[0]) {
      const result = results[0].result;
      if (result.success) {
        log("✅ " + result.message);
        log("🎉 Check the Claude AI tab for the response!");
      } else {
        log("❌ Failed to send message");
        if (result.error) {
          log(`Error details: ${result.error}`);
        }
      }
    }
  } catch (error) {
    log(`❌ Error: ${error.message}`);
  }
});

log("✅ Test page loaded. Click buttons to test Claude automation.");
