// test-force-inject.js - Content Scriptを強制的に再注入

console.log("🔧 Force injecting Content Script...");

async function forceInjectContentScript() {
  const tabs = await chrome.tabs.query({ url: "*://claude.ai/*" });

  if (tabs.length === 0) {
    console.log("❌ No Claude AI tab found");
    return;
  }

  const claudeTab = tabs[0];
  console.log("📍 Target tab:", claudeTab.id, claudeTab.url);

  // まず古いスクリプトをリロードするためにタブをリフレッシュ
  console.log("🔄 Refreshing tab to clear old scripts...");

  await chrome.tabs.reload(claudeTab.id);

  // ページが完全に読み込まれるまで待機
  await new Promise((resolve) => setTimeout(resolve, 3000));

  console.log("💉 Injecting Content Script...");

  // Content Scriptを注入
  chrome.scripting.executeScript(
    {
      target: { tabId: claudeTab.id },
      files: ["4-2-claude-automation.js"],
    },
    (results) => {
      if (chrome.runtime.lastError) {
        console.error("❌ Injection failed:", chrome.runtime.lastError);
      } else {
        console.log("✅ Content Script injected successfully");

        // 注入後、関数の確認
        setTimeout(() => {
          chrome.scripting.executeScript(
            {
              target: { tabId: claudeTab.id },
              func: () => {
                const functionsCheck = {
                  executeTask: typeof window.executeTask,
                  runAutomation: typeof window.runAutomation,
                  inputText: typeof window.inputText,
                  findClaudeElement: typeof window.findClaudeElement,
                };

                console.log("🔍 Functions availability after injection:");
                for (const [name, type] of Object.entries(functionsCheck)) {
                  console.log(`  ${name}: ${type}`);
                }

                // エラーがあればコンソールに表示
                if (window.CLAUDE_SCRIPT_ERROR) {
                  console.error(
                    "⚠️ Script had errors:",
                    window.CLAUDE_SCRIPT_ERROR,
                  );
                }

                return functionsCheck;
              },
            },
            (checkResults) => {
              if (checkResults && checkResults[0]) {
                console.log(
                  "📊 Function check result:",
                  checkResults[0].result,
                );

                const funcs = checkResults[0].result;
                let allFunctionsAvailable = true;

                for (const [name, type] of Object.entries(funcs)) {
                  if (type !== "function") {
                    console.error(
                      `❌ ${name} is not available (type: ${type})`,
                    );
                    allFunctionsAvailable = false;
                  } else {
                    console.log(`✅ ${name} is available`);
                  }
                }

                if (allFunctionsAvailable) {
                  console.log("\n🎉 All functions are now available!");
                  console.log(
                    "You can now test executeTask with the debug script.",
                  );
                } else {
                  console.log("\n⚠️ Some functions are still missing.");
                  console.log(
                    "Check the Claude AI tab console (F12) for syntax errors.",
                  );
                }
              }
            },
          );
        }, 1000);
      }
    },
  );
}

// 関数を直接定義してテスト
async function defineExecuteTaskDirectly() {
  console.log("\n📝 Defining executeTask directly in the page...");

  const tabs = await chrome.tabs.query({ url: "*://claude.ai/*" });
  if (tabs.length === 0) return;

  const claudeTab = tabs[0];

  chrome.scripting.executeScript(
    {
      target: { tabId: claudeTab.id },
      func: () => {
        // executeTaskを直接定義
        window.executeTask = async (task) => {
          console.log("🚀 [Direct executeTask] Starting:", task);

          try {
            // 入力欄を探す
            const inputElement = document.querySelector(
              'div[contenteditable="true"].ProseMirror',
            );
            if (!inputElement) {
              console.error("❌ Input element not found");
              return false;
            }

            // テキストを設定
            inputElement.innerHTML = `<p>${task.prompt}</p>`;
            inputElement.dispatchEvent(new Event("input", { bubbles: true }));
            inputElement.focus();

            // 少し待機
            await new Promise((resolve) => setTimeout(resolve, 500));

            // 送信ボタンを探してクリック
            const sendButton =
              document.querySelector('button[aria-label*="送信"]') ||
              document.querySelector('button[aria-label*="Send"]');

            if (sendButton && !sendButton.disabled) {
              console.log("📤 Clicking send button");
              sendButton.click();
              return true;
            } else {
              console.error("❌ Send button not found or disabled");
              return false;
            }
          } catch (error) {
            console.error("❌ Error in executeTask:", error);
            return false;
          }
        };

        // runAutomationも定義
        window.runAutomation = async (task) => {
          return await window.executeTask(task);
        };

        console.log("✅ Functions defined directly:");
        console.log("  executeTask:", typeof window.executeTask);
        console.log("  runAutomation:", typeof window.runAutomation);

        return {
          executeTask: typeof window.executeTask,
          runAutomation: typeof window.runAutomation,
        };
      },
    },
    (results) => {
      if (results && results[0]) {
        console.log("✅ Direct definition result:", results[0].result);
        console.log("\n🎯 You can now test executeTask!");
      }
    },
  );
}

// 実行
console.log("Starting force injection process...");
forceInjectContentScript();

// 5秒後に直接定義も試す
setTimeout(() => {
  defineExecuteTaskDirectly();
}, 5000);
