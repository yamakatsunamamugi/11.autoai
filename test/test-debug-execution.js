// test-debug-execution.js - executeTask関数のデバッグ

console.log("🔍 Starting debug execution test...");

async function debugExecuteTask() {
  const tabs = await chrome.tabs.query({ url: "*://claude.ai/*" });
  if (tabs.length === 0) {
    console.log("❌ No Claude AI tab found");
    return;
  }

  const claudeTab = tabs[0];
  console.log("✅ Testing on tab:", claudeTab.id);

  // Claude AIタブのコンソールログを確認
  chrome.scripting.executeScript(
    {
      target: { tabId: claudeTab.id },
      func: async () => {
        console.log("=== DEBUG: Starting executeTask test ===");

        try {
          // まず関数の存在を確認
          console.log("executeTask type:", typeof window.executeTask);
          console.log("inputText type:", typeof window.inputText);

          if (typeof window.executeTask !== "function") {
            throw new Error("executeTask is not a function");
          }

          // シンプルなタスクを作成
          const task = {
            prompt: "2+2は？",
            model: "claude-3-5-sonnet-20241022",
          };

          console.log("📤 Calling executeTask with:", task);

          // executeTaskを実行
          const result = await window.executeTask(task);

          console.log("📥 executeTask returned:", result);

          // 結果の詳細を確認
          if (result === false) {
            console.log("❌ executeTask returned false");

            // inputText関数も試してみる
            console.log("🔄 Trying inputText instead...");
            const inputResult = await window.inputText(task.prompt);
            console.log("inputText result:", inputResult);
          } else {
            console.log("✅ executeTask succeeded:", result);
          }

          return {
            success: true,
            executeTaskResult: result,
            taskSent: task,
          };
        } catch (error) {
          console.error("❌ Error in executeTask:", error);
          console.error("Error stack:", error.stack);
          return {
            success: false,
            error: error.message,
            stack: error.stack,
          };
        }
      },
    },
    (results) => {
      if (chrome.runtime.lastError) {
        console.error("❌ Script execution error:", chrome.runtime.lastError);
      } else if (results && results[0]) {
        console.log("📊 Debug result:", results[0].result);

        if (!results[0].result.success) {
          console.log(
            "\n⚠️ executeTask failed. Check the Claude AI tab console for details.",
          );
          console.log("Press F12 on Claude AI tab and check console logs.");
        }
      }
    },
  );
}

// inputText関数の詳細テスト
async function testInputTextDetailed() {
  console.log("\n📝 Testing inputText function in detail...");

  const tabs = await chrome.tabs.query({ url: "*://claude.ai/*" });
  if (tabs.length === 0) return;

  const claudeTab = tabs[0];

  chrome.scripting.executeScript(
    {
      target: { tabId: claudeTab.id },
      func: async () => {
        console.log("=== DEBUG: inputText detailed test ===");

        try {
          // 入力欄を探す
          const inputElement = document.querySelector(
            'div[contenteditable="true"].ProseMirror',
          );
          console.log("Input element found:", !!inputElement);

          if (!inputElement) {
            throw new Error("Input element not found");
          }

          // 現在の内容をクリア
          inputElement.innerHTML = "";

          // テキストを設定
          const testText = "テスト: 3+3は？";
          inputElement.innerHTML = `<p>${testText}</p>`;

          // イベントを発火
          inputElement.dispatchEvent(new Event("input", { bubbles: true }));
          inputElement.dispatchEvent(new Event("change", { bubbles: true }));

          // フォーカスを設定
          inputElement.focus();

          console.log("✅ Text set to:", testText);
          console.log("Current innerHTML:", inputElement.innerHTML);

          // 送信ボタンの状態を確認
          const sendButton =
            document.querySelector('button[aria-label*="送信"]') ||
            document.querySelector('button[aria-label*="Send"]');

          if (sendButton) {
            console.log("Send button found:", true);
            console.log("Send button disabled:", sendButton.disabled);
            console.log(
              "Send button aria-disabled:",
              sendButton.getAttribute("aria-disabled"),
            );

            // ボタンがdisabledでない場合のみクリック可能
            if (
              !sendButton.disabled &&
              sendButton.getAttribute("aria-disabled") !== "true"
            ) {
              console.log("✅ Send button is clickable");
              // 実際にクリックする場合はコメントを外す
              // sendButton.click();
              return {
                success: true,
                message: "Ready to send",
                buttonClickable: true,
              };
            } else {
              console.log("⚠️ Send button is disabled");
              return {
                success: true,
                message: "Text set but button disabled",
                buttonClickable: false,
              };
            }
          } else {
            console.log("❌ Send button not found");
            return { success: false, message: "Send button not found" };
          }
        } catch (error) {
          console.error("Error:", error);
          return { success: false, error: error.message };
        }
      },
    },
    (results) => {
      if (results && results[0]) {
        console.log("📊 Input test result:", results[0].result);
      }
    },
  );
}

// 実行
console.log("Running debug tests...");
debugExecuteTask();

// 2秒後に詳細なinputTextテストを実行
setTimeout(() => {
  testInputTextDetailed();
}, 2000);
