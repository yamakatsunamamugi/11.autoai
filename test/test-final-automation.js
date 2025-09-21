// test-final-automation.js - 最終的な自動化テスト

console.log("🎯 Final automation test starting...");

async function testAutomation() {
  const tabs = await chrome.tabs.query({ url: "*://claude.ai/*" });

  if (tabs.length === 0) {
    console.log("❌ No Claude AI tab found");
    return;
  }

  const claudeTab = tabs[0];
  console.log("📍 Testing on tab:", claudeTab.id);

  // executeTask関数を使用してプロンプトを送信
  console.log("📝 Sending test prompt...");

  chrome.scripting.executeScript(
    {
      target: { tabId: claudeTab.id },
      func: async () => {
        console.log("🔧 Starting automation test in page context...");

        try {
          // executeTask関数の存在確認
          if (typeof window.executeTask !== "function") {
            throw new Error("executeTask is not defined");
          }

          console.log("✅ executeTask function found");

          // テストプロンプトを作成
          const task = {
            prompt: "こんにちは！簡単に挨拶を返してください。",
            model: "claude-3-5-sonnet-20241022",
          };

          console.log("📤 Sending prompt:", task.prompt);

          // タスクを実行
          const result = await window.executeTask(task);

          if (result) {
            console.log("✅ Task executed successfully!");
            return { success: true, message: "Prompt sent and clicked" };
          } else {
            console.log("❌ Task execution failed");
            return { success: false, message: "Failed to send prompt" };
          }
        } catch (error) {
          console.error("❌ Error during automation:", error);
          return { success: false, error: error.message };
        }
      },
    },
    (results) => {
      if (chrome.runtime.lastError) {
        console.error("❌ Script execution failed:", chrome.runtime.lastError);
      } else if (results && results[0]) {
        const result = results[0].result;
        console.log("📊 Final result:", result);

        if (result.success) {
          console.log("\n🎉 === AUTOMATION SUCCESS ===");
          console.log("✅ Prompt was sent to Claude!");
          console.log("✅ Check the Claude AI tab for the response");
        } else {
          console.log("\n❌ === AUTOMATION FAILED ===");
          console.log("Error:", result.error || result.message);
        }
      }
    },
  );
}

// 安全モードテスト（送信ボタンをクリックしない）
async function testAutomationSafe() {
  console.log("\n🛡️ Running safe mode test (no send)...");

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

          // テキストを設定（送信しない）
          const testText = "これはテストです（送信されません）";
          inputElement.innerHTML = `<p>${testText}</p>`;
          inputElement.dispatchEvent(new Event("input", { bubbles: true }));
          inputElement.focus();

          console.log("✅ Text set in input field (not sent)");

          // 送信ボタンの状態確認
          const sendButton =
            document.querySelector('button[aria-label*="送信"]') ||
            document.querySelector('button[aria-label*="Send"]');

          if (sendButton) {
            console.log("Send button status:");
            console.log("  - Found: true");
            console.log("  - Disabled:", sendButton.disabled);
            console.log("  - Clickable:", !sendButton.disabled);
          }

          return { success: true, message: "Text set in safe mode" };
        } catch (error) {
          return { success: false, error: error.message };
        }
      },
    },
    (results) => {
      if (results && results[0]) {
        console.log("📊 Safe mode result:", results[0].result);
      }
    },
  );
}

// 実行選択
console.log("\n📋 Choose test mode:");
console.log("1. testAutomation() - 実際にプロンプトを送信");
console.log("2. testAutomationSafe() - 入力のみ（送信しない）");
console.log("\nDefault: Running actual automation...\n");

// デフォルトで実際の自動化を実行
testAutomation();
