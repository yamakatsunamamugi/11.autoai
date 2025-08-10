// ChatGPTツール選択の動作確認スクリプト
console.log("🔍 ChatGPTツール選択動作確認スクリプト開始");

// 現在選択されているツールを確認
function checkCurrentTool() {
  console.log("\n📊 現在のツール状態を確認中...");

  // ツールボタンを探す
  const toolButton = document.querySelector('button[aria-label="Tools"]');
  if (!toolButton) {
    console.error("❌ ツールボタンが見つかりません");
    return null;
  }

  console.log("✅ ツールボタンを発見:", toolButton);

  // 選択されているツールを探す
  const selectedTools = document.querySelectorAll(
    '[role="menuitemradio"][aria-checked="true"]',
  );
  const tools = [];

  selectedTools.forEach((tool) => {
    const name = tool.textContent.trim();
    tools.push(name);
    console.log(`✅ 選択中のツール: ${name}`);
  });

  if (tools.length === 0) {
    console.log("ℹ️ 現在選択されているツールはありません");
  }

  return tools;
}

// ツール選択をテスト
async function testToolSelection(toolName) {
  console.log(`\n🧪 ${toolName} の選択テスト開始`);

  try {
    // ChatGPTToolControlが利用可能か確認
    if (!window.chatGPTToolControl) {
      console.error("❌ ChatGPTToolControlが見つかりません");

      // 動的にロード試行
      console.log("📥 ChatGPTToolControlを動的にロード中...");
      const { ChatGPTToolControl } = await import(
        chrome.runtime.getURL("src/features/chatgpt/chatgpt-tool-control.js")
      );
      window.chatGPTToolControl = new ChatGPTToolControl();
    }

    // ツール選択実行
    console.log(`🎯 ${toolName} を選択中...`);
    const result = await window.chatGPTToolControl.selectTool(toolName);

    if (result) {
      console.log(`✅ ${toolName} の選択に成功しました`);

      // 選択後の状態を確認
      setTimeout(() => {
        checkCurrentTool();
      }, 1000);
    } else {
      console.error(`❌ ${toolName} の選択に失敗しました`);
    }

    return result;
  } catch (error) {
    console.error(`❌ エラー発生:`, error);
    return false;
  }
}

// プルダウン選択の動作を確認
function verifyDropdownSelection() {
  console.log("\n🔍 プルダウン選択の動作確認");

  // ChatGPTのセレクターを探す
  const selector = document.querySelector("#chatgpt-model");
  if (!selector) {
    console.error("❌ ChatGPTモデルセレクターが見つかりません");
    return;
  }

  console.log("✅ セレクター発見:", selector);
  console.log("現在の選択値:", selector.value);

  // 選択変更イベントをリスナー
  selector.addEventListener("change", async (e) => {
    const selectedValue = e.target.value;
    console.log(`\n📌 ドロップダウンで「${selectedValue}」が選択されました`);

    // ChatGPTツールの場合、実際に選択を実行
    if (selectedValue.startsWith("ChatGPT")) {
      await testToolSelection(selectedValue);
    }
  });

  console.log("✅ ドロップダウン監視を開始しました");
}

// メッセージリスナー（テストHTMLからのメッセージを受信）
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "selectChatGPTTool") {
    console.log(`\n📨 メッセージ受信: ${request.tool} を選択`);

    testToolSelection(request.tool)
      .then((result) => {
        sendResponse({
          success: result,
          details: {
            tool: request.tool,
            currentTools: checkCurrentTool(),
          },
        });
      })
      .catch((error) => {
        sendResponse({
          success: false,
          error: error.message,
        });
      });

    return true; // 非同期応答のため
  }
});

// 初期化と自動テスト
console.log("🚀 動作確認スクリプト準備完了");
console.log("以下のコマンドでテストできます:");
console.log("- checkCurrentTool() : 現在のツール状態を確認");
console.log('- testToolSelection("ChatGPTAgent") : エージェントモードを選択');
console.log('- testToolSelection("ChatGPTCanvas") : Canvasを選択');
console.log('- testToolSelection("ChatGPTWebSearch") : Web検索を選択');
console.log('- testToolSelection("ChatGPTImage") : 画像生成を選択');
console.log("- verifyDropdownSelection() : ドロップダウンの動作確認");

// グローバルに公開
window.checkCurrentTool = checkCurrentTool;
window.testToolSelection = testToolSelection;
window.verifyDropdownSelection = verifyDropdownSelection;

// 初期状態を確認
checkCurrentTool();
