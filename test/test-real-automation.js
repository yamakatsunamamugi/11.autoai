// test-real-automation.js - 実際のClaude自動化実行テスト

console.log("🚀 Starting Real Claude Automation Test...");

async function runRealAutomation() {
  const tabs = await chrome.tabs.query({ url: "*://claude.ai/*" });

  if (tabs.length === 0) {
    console.log("❌ Claude AI tab not found");
    return;
  }

  const claudeTab = tabs[0];
  console.log("✅ Found Claude tab:", claudeTab.id);

  // executeTask関数を使用して実際にプロンプトを送信
  console.log("📝 Sending real prompt to Claude...");

  chrome.scripting.executeScript(
    {
      target: { tabId: claudeTab.id },
      func: async () => {
        try {
          console.log("🔧 Attempting to execute task...");

          // executeTask関数を直接呼び出す
          if (typeof window.executeTask === "function") {
            const task = {
              prompt:
                "こんにちは。今日は良い天気ですね。簡単に返事をしてください。",
              model: "claude-3-5-sonnet-20241022",
            };

            console.log("📤 Executing task with prompt:", task.prompt);

            // 実際にタスクを実行
            const result = await window.executeTask(task);

            console.log("📥 Task execution result:", result);
            return { success: true, result };
          } else {
            throw new Error("executeTask function not found");
          }
        } catch (error) {
          console.error("❌ Error executing task:", error);
          return { success: false, error: error.message, stack: error.stack };
        }
      },
    },
    (results) => {
      if (chrome.runtime.lastError) {
        console.error("❌ Script execution failed:", chrome.runtime.lastError);
      } else if (results && results[0]) {
        const result = results[0].result;
        if (result.success) {
          console.log("✅ Automation successful!");
          console.log("📊 Result:", result);
        } else {
          console.error("❌ Automation failed:", result);
        }
      }
    },
  );
}

// 代替方法: runAutomation関数を使用
async function runAutomationAlternative() {
  console.log("\n🔄 Trying alternative method with runAutomation...");

  const tabs = await chrome.tabs.query({ url: "*://claude.ai/*" });
  if (tabs.length === 0) return;

  const claudeTab = tabs[0];

  chrome.scripting.executeScript(
    {
      target: { tabId: claudeTab.id },
      func: async () => {
        try {
          if (typeof window.runAutomation === "function") {
            console.log("🎯 Using runAutomation function...");

            const task = {
              prompt: "1+1は何ですか？",
              model: "claude-3-5-sonnet-20241022",
            };

            const result = await window.runAutomation(task);
            console.log("📥 runAutomation result:", result);
            return { success: true, result };
          } else {
            throw new Error("runAutomation function not found");
          }
        } catch (error) {
          console.error("❌ Error with runAutomation:", error);
          return { success: false, error: error.message };
        }
      },
    },
    (results) => {
      if (results && results[0]) {
        console.log("📊 Alternative method result:", results[0].result);
      }
    },
  );
}

// 手動でUI要素を操作する方法
async function manualUIInteraction() {
  console.log("\n🖱️ Trying manual UI interaction...");

  const tabs = await chrome.tabs.query({ url: "*://claude.ai/*" });
  if (tabs.length === 0) return;

  const claudeTab = tabs[0];

  chrome.scripting.executeScript(
    {
      target: { tabId: claudeTab.id },
      func: async () => {
        try {
          // 入力欄を探す
          const inputElement = document.querySelector(
            'div[contenteditable="true"].ProseMirror',
          );
          if (!inputElement) {
            throw new Error("Input element not found");
          }

          // テキストを入力
          inputElement.innerHTML = "<p>テストメッセージです。2+2は？</p>";
          inputElement.dispatchEvent(new Event("input", { bubbles: true }));

          console.log("✅ Text inserted into input field");

          // 送信ボタンを探す
          await new Promise((resolve) => setTimeout(resolve, 500));

          const sendButton =
            document.querySelector('button[aria-label*="送信"]') ||
            document.querySelector('button[aria-label*="Send"]');

          if (sendButton && !sendButton.disabled) {
            console.log("🔘 Send button found and enabled");
            // 注意: 実際にクリックする場合はコメントを外す
            // sendButton.click();
            // console.log("✅ Send button clicked");
            console.log("⚠️ Send button found but not clicked (safety mode)");
            return {
              success: true,
              message: "Ready to send (button not clicked for safety)",
            };
          } else {
            throw new Error("Send button not found or disabled");
          }
        } catch (error) {
          console.error("❌ Manual UI interaction failed:", error);
          return { success: false, error: error.message };
        }
      },
    },
    (results) => {
      if (results && results[0]) {
        console.log("📊 Manual UI result:", results[0].result);
      }
    },
  );
}

// 実行選択
console.log("Choose test method:");
console.log("1. runRealAutomation() - executeTask関数を使用");
console.log("2. runAutomationAlternative() - runAutomation関数を使用");
console.log("3. manualUIInteraction() - 手動UI操作（安全モード）");

// デフォルトで最初のメソッドを実行
runRealAutomation();
