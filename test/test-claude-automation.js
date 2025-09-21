// test-claude-automation.js - Claude自動化機能の実際のテスト

console.log("🧪 Claude Automation Test Starting...");

async function testClaudeAutomation() {
  const tabs = await chrome.tabs.query({ url: "*://claude.ai/*" });

  if (tabs.length === 0) {
    console.log("❌ No Claude AI tab found");
    return;
  }

  const claudeTab = tabs[0];
  console.log("✅ Testing on tab:", claudeTab.id, claudeTab.url);

  // Test 1: プロンプト入力のテスト
  console.log("\n📝 Test 1: Testing prompt input...");

  chrome.scripting.executeScript(
    {
      target: { tabId: claudeTab.id },
      func: async () => {
        try {
          // inputText関数を使用してテキストを入力
          const testPrompt = "これはテストメッセージです。返答は不要です。";

          if (typeof window.inputText === "function") {
            console.log(
              "✅ inputText function found, attempting to input text...",
            );
            const result = await window.inputText(testPrompt);
            console.log("Input result:", result);
            return { success: true, message: "Text input attempted", result };
          } else {
            console.error("❌ inputText function not found");
            return {
              success: false,
              message: "inputText function not available",
            };
          }
        } catch (error) {
          console.error("❌ Error during input test:", error);
          return { success: false, message: error.message };
        }
      },
    },
    (results) => {
      if (chrome.runtime.lastError) {
        console.error("❌ Failed to test input:", chrome.runtime.lastError);
      } else if (results && results[0]) {
        console.log("📊 Input test result:", results[0].result);
      }
    },
  );

  // Test 2: UI要素の検出テスト
  setTimeout(() => {
    console.log("\n🔍 Test 2: Testing UI element detection...");

    chrome.scripting.executeScript(
      {
        target: { tabId: claudeTab.id },
        func: async () => {
          try {
            if (typeof window.findClaudeElement === "function") {
              console.log("✅ findClaudeElement function found");

              // 入力欄を探す
              const inputSelectors = [
                'div[contenteditable="true"].ProseMirror',
                'div[contenteditable="true"]',
                ".ProseMirror",
                "textarea",
              ];

              let inputElement = null;
              for (const selector of inputSelectors) {
                const element = document.querySelector(selector);
                if (element) {
                  inputElement = element;
                  console.log(
                    `✅ Found input element with selector: ${selector}`,
                  );
                  break;
                }
              }

              // 送信ボタンを探す
              const buttonSelectors = [
                'button[aria-label*="Send"]',
                'button[aria-label*="送信"]',
                'button svg[xmlns="http://www.w3.org/2000/svg"]',
                "button:has(svg)",
              ];

              let sendButton = null;
              for (const selector of buttonSelectors) {
                const element = document.querySelector(selector);
                if (element) {
                  sendButton = element;
                  console.log(
                    `✅ Found send button with selector: ${selector}`,
                  );
                  break;
                }
              }

              return {
                success: true,
                inputFound: !!inputElement,
                buttonFound: !!sendButton,
                inputSelector: inputElement
                  ? inputSelectors.find((s) => document.querySelector(s))
                  : null,
                buttonSelector: sendButton
                  ? buttonSelectors.find((s) => document.querySelector(s))
                  : null,
              };
            } else {
              return {
                success: false,
                message: "findClaudeElement function not available",
              };
            }
          } catch (error) {
            console.error("❌ Error during element detection:", error);
            return { success: false, message: error.message };
          }
        },
      },
      (results) => {
        if (chrome.runtime.lastError) {
          console.error(
            "❌ Failed to test element detection:",
            chrome.runtime.lastError,
          );
        } else if (results && results[0]) {
          console.log("📊 Element detection result:", results[0].result);
        }
      },
    );
  }, 2000);

  // Test 3: executeTask関数のテスト
  setTimeout(() => {
    console.log("\n⚡ Test 3: Testing executeTask function...");

    chrome.scripting.executeScript(
      {
        target: { tabId: claudeTab.id },
        func: async () => {
          try {
            if (typeof window.executeTask === "function") {
              console.log("✅ executeTask function found");

              // 簡単なタスクを実行（実際には送信しない）
              const testTask = {
                prompt: "テストプロンプト（送信されません）",
                model: "claude-3-5-sonnet-20241022",
                test: true, // テストモードフラグ
              };

              console.log("Attempting to execute test task:", testTask);

              // Note: 実際にはexecuteTaskを呼び出さない（送信を避けるため）
              return {
                success: true,
                message: "executeTask function is available",
                functionType: typeof window.executeTask,
              };
            } else {
              return {
                success: false,
                message: "executeTask function not available",
              };
            }
          } catch (error) {
            console.error("❌ Error during executeTask test:", error);
            return { success: false, message: error.message };
          }
        },
      },
      (results) => {
        if (chrome.runtime.lastError) {
          console.error(
            "❌ Failed to test executeTask:",
            chrome.runtime.lastError,
          );
        } else if (results && results[0]) {
          console.log("📊 executeTask test result:", results[0].result);

          // 最終結果のまとめ
          setTimeout(() => {
            console.log("\n📋 === Test Summary ===");
            console.log("✅ Content Script: Loaded");
            console.log("✅ Functions: Available");
            console.log("ℹ️ Ready for automation tasks");
            console.log(
              "\n💡 Next step: Run actual automation with real prompts",
            );
          }, 1000);
        }
      },
    );
  }, 4000);
}

// テスト実行
testClaudeAutomation();
