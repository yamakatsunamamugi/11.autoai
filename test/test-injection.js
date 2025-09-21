// test-injection.js - Content Script injection and communication test

console.log("🧪 Test Injection Script");

// Test 1: Check if the extension is loaded
chrome.management.getSelf((extensionInfo) => {
  console.log(
    "✅ Extension loaded:",
    extensionInfo.name,
    extensionInfo.version,
  );
});

// Test 2: Find Claude AI tab
async function testClaudeTab() {
  const tabs = await chrome.tabs.query({ url: "*://claude.ai/*" });

  if (tabs.length === 0) {
    console.log("❌ No Claude AI tab found. Please open claude.ai");
    return;
  }

  const claudeTab = tabs[0];
  console.log("✅ Claude AI tab found:", claudeTab.id, claudeTab.url);

  // Test 3: Check if Content Script responds
  console.log("🔍 Testing Content Script communication...");

  chrome.tabs.sendMessage(claudeTab.id, { type: "ping" }, (response) => {
    if (chrome.runtime.lastError) {
      console.log(
        "❌ Content Script not responding:",
        chrome.runtime.lastError.message,
      );
      console.log("⚙️ Attempting manual injection...");

      // Test 4: Manual injection
      chrome.scripting.executeScript(
        {
          target: { tabId: claudeTab.id },
          files: ["4-2-claude-automation.js"],
        },
        (results) => {
          if (chrome.runtime.lastError) {
            console.error("❌ Failed to inject:", chrome.runtime.lastError);
          } else {
            console.log("✅ Content Script injected successfully");

            // Test again after injection
            setTimeout(() => {
              chrome.tabs.sendMessage(
                claudeTab.id,
                { type: "ping" },
                (response2) => {
                  if (chrome.runtime.lastError) {
                    console.log(
                      "❌ Still not responding after injection:",
                      chrome.runtime.lastError.message,
                    );
                  } else {
                    console.log("✅ Content Script responding:", response2);
                  }
                },
              );
            }, 1000);
          }
        },
      );
    } else {
      console.log("✅ Content Script responding:", response);
    }
  });

  // Test 5: Check if functions are available
  console.log("🔍 Testing function availability...");

  chrome.scripting.executeScript(
    {
      target: { tabId: claudeTab.id },
      func: () => {
        const results = {
          executeTask: typeof window.executeTask,
          findClaudeElement: typeof window.findClaudeElement,
          inputText: typeof window.inputText,
          runAutomation: typeof window.runAutomation,
          ClaudeLogManager: typeof window.ClaudeLogManager,
          ClaudeRetryManager: typeof window.ClaudeRetryManager,
        };

        console.log("Function availability in page context:", results);
        return results;
      },
    },
    (injectionResults) => {
      if (chrome.runtime.lastError) {
        console.error(
          "❌ Failed to check functions:",
          chrome.runtime.lastError,
        );
      } else if (injectionResults && injectionResults[0]) {
        console.log("📊 Function availability:", injectionResults[0].result);

        const funcs = injectionResults[0].result;
        for (const [name, type] of Object.entries(funcs)) {
          if (type === "function") {
            console.log(`✅ ${name}: available`);
          } else {
            console.log(`❌ ${name}: ${type}`);
          }
        }
      }
    },
  );
}

// Run tests
console.log("🚀 Starting Content Script tests...");
testClaudeTab();
