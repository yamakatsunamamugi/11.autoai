// Gemini DeepResearch制御関数
(() => {
  "use strict";

  console.log("[Gemini Control] スクリプト読み込み開始...");

  // DeepResearchボタンを探す（動作確認済みコード）
  function findGeminiDeepResearchButton() {
    // 方法1: toolbox-drawer-button-labelのテキストで検索
    const labels = document.querySelectorAll(".toolbox-drawer-button-label");
    for (const label of labels) {
      if (label.textContent.trim() === "Deep Research") {
        return label.closest("button");
      }
    }

    // 方法2: ボタン全体から検索
    const buttons = document.querySelectorAll(
      "button.toolbox-drawer-item-button",
    );
    for (const btn of buttons) {
      const labelDiv = btn.querySelector(".toolbox-drawer-button-label");
      if (labelDiv && labelDiv.textContent.trim() === "Deep Research") {
        return btn;
      }
    }

    return null;
  }

  // 現在のDeepResearch状態を確認
  function getGeminiDeepResearchState() {
    const button = findGeminiDeepResearchButton();

    if (!button) {
      console.log("❌ DeepResearchボタンが見つかりません");
      return null;
    }

    // is-selectedクラスまたはaria-pressed属性で判定
    const isSelected =
      button.classList.contains("is-selected") ||
      button.getAttribute("aria-pressed") === "true";

    console.log("🔍 DeepResearch現在の状態:", {
      "is-selected": button.classList.contains("is-selected"),
      "aria-pressed": button.getAttribute("aria-pressed"),
      有効: isSelected,
    });

    return isSelected;
  }

  // DeepResearchをオンにする（動作確認済みコード）
  async function enableGeminiDeepResearch() {
    console.log("🔬 Gemini DeepResearch強制有効化開始...");

    const button = findGeminiDeepResearchButton();
    if (!button) {
      console.error("❌ DeepResearchボタンが見つかりません");
      return false;
    }

    // 現在の状態をチェック
    const isSelected =
      button.classList.contains("is-selected") ||
      button.getAttribute("aria-pressed") === "true";

    if (isSelected) {
      console.log("✅ DeepResearchは既に有効です");
      return true;
    }

    console.log("✅ DeepResearchボタンをクリックして有効化します");
    button.click();

    // クリック後の確認
    await new Promise((resolve) => setTimeout(resolve, 500));

    const nowSelected =
      button.classList.contains("is-selected") ||
      button.getAttribute("aria-pressed") === "true";

    if (nowSelected) {
      console.log("🎯 DeepResearch状態: 有効");
      return true;
    } else {
      console.error("❌ DeepResearchの有効化に失敗しました");
      return false;
    }
  }

  // DeepResearchをオフにする（動作確認済みコード）
  async function disableGeminiDeepResearch() {
    console.log("🛑 Gemini DeepResearch強制無効化開始...");

    const button = findGeminiDeepResearchButton();
    if (!button) {
      console.error("❌ DeepResearchボタンが見つかりません");
      return false;
    }

    // 現在の状態をチェック
    const isSelected =
      button.classList.contains("is-selected") ||
      button.getAttribute("aria-pressed") === "true";

    if (!isSelected) {
      console.log("✅ DeepResearchは既に無効です");
      return true;
    }

    console.log("✅ DeepResearchボタンをクリックして無効化します");
    button.click();

    // クリック後の確認
    await new Promise((resolve) => setTimeout(resolve, 500));

    const nowSelected =
      button.classList.contains("is-selected") ||
      button.getAttribute("aria-pressed") === "true";

    if (!nowSelected) {
      console.log("🎯 DeepResearch状態: 無効");
      return true;
    } else {
      console.error("❌ DeepResearchの無効化に失敗しました");
      return false;
    }
  }

  // DeepResearchをトグル（切り替え）
  async function toggleGeminiDeepResearch() {
    const currentState = getGeminiDeepResearchState();

    if (currentState === null) {
      console.error("❌ DeepResearch状態を取得できません");
      return false;
    }

    if (currentState) {
      console.log("🔄 DeepResearchをオフに切り替えます");
      return await disableGeminiDeepResearch();
    } else {
      console.log("🔄 DeepResearchをオンに切り替えます");
      return await enableGeminiDeepResearch();
    }
  }

  // DeepThinkボタンを探す（動作確認済みコード）
  function findGeminiDeepThinkButton() {
    // 方法1: toolbox-drawer-button-labelのテキストで検索
    const labels = document.querySelectorAll(".toolbox-drawer-button-label");
    for (const label of labels) {
      if (label.textContent.trim() === "Deep Think") {
        return label.closest("button");
      }
    }

    // 方法2: ボタン全体から検索
    const buttons = document.querySelectorAll(
      "button.toolbox-drawer-item-button",
    );
    for (const btn of buttons) {
      const labelDiv = btn.querySelector(".toolbox-drawer-button-label");
      if (labelDiv && labelDiv.textContent.trim() === "Deep Think") {
        return btn;
      }
    }

    return null;
  }

  // 現在のDeepThink状態を確認
  function getGeminiDeepThinkState() {
    const button = findGeminiDeepThinkButton();

    if (!button) {
      console.log("❌ DeepThinkボタンが見つかりません");
      return null;
    }

    // is-selectedクラスまたはaria-pressed属性で判定
    const isSelected =
      button.classList.contains("is-selected") ||
      button.getAttribute("aria-pressed") === "true";

    console.log("🔍 DeepThink現在の状態:", {
      "is-selected": button.classList.contains("is-selected"),
      "aria-pressed": button.getAttribute("aria-pressed"),
      有効: isSelected,
    });

    return isSelected;
  }

  // DeepThinkをオンにする
  async function enableGeminiDeepThink() {
    console.log("🧠 DeepThinkをオンにします...");

    const button = findGeminiDeepThinkButton();
    if (!button) {
      console.error("❌ DeepThinkボタンが見つかりません");
      return false;
    }

    const currentState = button.getAttribute("aria-pressed") === "true";

    if (currentState) {
      console.log("✅ DeepThinkは既にオンです");
      return true;
    }

    console.log("🖱️ DeepThinkボタンをクリックしてオンにします");
    button.click();

    await new Promise((resolve) => setTimeout(resolve, 500));

    const newState = button.getAttribute("aria-pressed") === "true";
    const hasSelectedClass = button.classList.contains("is-selected");

    if (newState && hasSelectedClass) {
      console.log("✅ DeepThinkが正常にオンになりました");
      return true;
    } else {
      console.error("❌ DeepThinkのオン切り替えに失敗しました");
      return false;
    }
  }

  // DeepThinkをオフにする
  async function disableGeminiDeepThink() {
    console.log("🛑 DeepThinkをオフにします...");

    const button = findGeminiDeepThinkButton();
    if (!button) {
      console.error("❌ DeepThinkボタンが見つかりません");
      return false;
    }

    const currentState = button.getAttribute("aria-pressed") === "true";

    if (!currentState) {
      console.log("✅ DeepThinkは既にオフです");
      return true;
    }

    console.log("🖱️ DeepThinkボタンをクリックしてオフにします");
    button.click();

    await new Promise((resolve) => setTimeout(resolve, 500));

    const newState = button.getAttribute("aria-pressed") === "true";
    const hasSelectedClass = button.classList.contains("is-selected");

    if (!newState && !hasSelectedClass) {
      console.log("✅ DeepThinkが正常にオフになりました");
      return true;
    } else {
      console.error("❌ DeepThinkのオフ切り替えに失敗しました");
      return false;
    }
  }

  // Canvasボタンを探す（動作確認済みコード）
  function findGeminiCanvasButton() {
    // 方法1: toolbox-drawer-button-labelのテキストで検索
    const labels = document.querySelectorAll(".toolbox-drawer-button-label");
    for (const label of labels) {
      if (label.textContent.trim() === "Canvas") {
        return label.closest("button");
      }
    }

    // 方法2: ボタン全体から検索
    const buttons = document.querySelectorAll(
      "button.toolbox-drawer-item-button",
    );
    for (const btn of buttons) {
      const labelDiv = btn.querySelector(".toolbox-drawer-button-label");
      if (labelDiv && labelDiv.textContent.trim() === "Canvas") {
        return btn;
      }
    }

    return null;
  }

  // 現在のCanvas状態を確認
  function getGeminiCanvasState() {
    const button = findGeminiCanvasButton();

    if (!button) {
      console.log("❌ Canvasボタンが見つかりません");
      return null;
    }

    // is-selectedクラスまたはaria-pressed属性で判定
    const isSelected =
      button.classList.contains("is-selected") ||
      button.getAttribute("aria-pressed") === "true";

    console.log("🔍 Canvas現在の状態:", {
      "is-selected": button.classList.contains("is-selected"),
      "aria-pressed": button.getAttribute("aria-pressed"),
      有効: isSelected,
    });

    return isSelected;
  }

  // Canvasをオンにする
  async function enableGeminiCanvas() {
    console.log("🎨 Canvasをオンにします...");

    const button = findGeminiCanvasButton();
    if (!button) {
      console.error("❌ Canvasボタンが見つかりません");
      return false;
    }

    const currentState = button.getAttribute("aria-pressed") === "true";

    if (currentState) {
      console.log("✅ Canvasは既にオンです");
      return true;
    }

    console.log("🖱️ Canvasボタンをクリックしてオンにします");
    button.click();

    await new Promise((resolve) => setTimeout(resolve, 500));

    const newState = button.getAttribute("aria-pressed") === "true";
    const hasSelectedClass = button.classList.contains("is-selected");

    if (newState && hasSelectedClass) {
      console.log("✅ Canvasが正常にオンになりました");
      return true;
    } else {
      console.error("❌ Canvasのオン切り替えに失敗しました");
      return false;
    }
  }

  // Canvasをオフにする
  async function disableGeminiCanvas() {
    console.log("🛑 Canvasをオフにします...");

    const button = findGeminiCanvasButton();
    if (!button) {
      console.error("❌ Canvasボタンが見つかりません");
      return false;
    }

    const currentState = button.getAttribute("aria-pressed") === "true";

    if (!currentState) {
      console.log("✅ Canvasは既にオフです");
      return true;
    }

    console.log("🖱️ Canvasボタンをクリックしてオフにします");
    button.click();

    await new Promise((resolve) => setTimeout(resolve, 500));

    const newState = button.getAttribute("aria-pressed") === "true";
    const hasSelectedClass = button.classList.contains("is-selected");

    if (!newState && !hasSelectedClass) {
      console.log("✅ Canvasが正常にオフになりました");
      return true;
    } else {
      console.error("❌ Canvasのオフ切り替えに失敗しました");
      return false;
    }
  }

  // 画像ボタンを探す（動作確認済みコード）
  function findGeminiImageButton() {
    // 方法1: toolbox-drawer-button-labelのテキストで検索
    const labels = document.querySelectorAll(".toolbox-drawer-button-label");
    for (const label of labels) {
      if (label.textContent.trim() === "画像") {
        return label.closest("button");
      }
    }

    // 方法2: ボタン全体から検索
    const buttons = document.querySelectorAll(
      "button.toolbox-drawer-item-button",
    );
    for (const btn of buttons) {
      const labelDiv = btn.querySelector(".toolbox-drawer-button-label");
      if (labelDiv && labelDiv.textContent.trim() === "画像") {
        return btn;
      }
    }

    return null;
  }

  // 現在の画像モード状態を確認
  function getGeminiImageState() {
    const button = findGeminiImageButton();

    if (!button) {
      console.log("❌ 画像ボタンが見つかりません");
      return null;
    }

    // is-selectedクラスまたはaria-pressed属性で判定
    const isSelected =
      button.classList.contains("is-selected") ||
      button.getAttribute("aria-pressed") === "true";

    console.log("🔍 画像モード現在の状態:", {
      "is-selected": button.classList.contains("is-selected"),
      "aria-pressed": button.getAttribute("aria-pressed"),
      有効: isSelected,
    });

    return isSelected;
  }

  // 画像モードをオンにする
  async function enableGeminiImage() {
    console.log("🇼️ 画像モードをオンにします...");

    const button = findGeminiImageButton();
    if (!button) {
      console.error("❌ 画像ボタンが見つかりません");
      return false;
    }

    const currentState =
      button.classList.contains("is-selected") ||
      button.getAttribute("aria-pressed") === "true";

    if (currentState) {
      console.log("✅ 画像モードは既にオンです");
      return true;
    }

    console.log("🔱️ 画像ボタンをクリックしてオンにします");
    button.click();

    await new Promise((resolve) => setTimeout(resolve, 500));

    const newState =
      button.classList.contains("is-selected") ||
      button.getAttribute("aria-pressed") === "true";

    if (newState) {
      console.log("✅ 画像モードが正常にオンになりました");
      return true;
    } else {
      console.error("❌ 画像モードのオン切り替えに失敗しました");
      return false;
    }
  }

  // 画像モードをオフにする
  async function disableGeminiImage() {
    console.log("🛑 画像モードをオフにします...");

    const button = findGeminiImageButton();
    if (!button) {
      console.error("❌ 画像ボタンが見つかりません");
      return false;
    }

    const currentState =
      button.classList.contains("is-selected") ||
      button.getAttribute("aria-pressed") === "true";

    if (!currentState) {
      console.log("✅ 画像モードは既にオフです");
      return true;
    }

    console.log("🔱️ 画像ボタンをクリックしてオフにします");
    button.click();

    await new Promise((resolve) => setTimeout(resolve, 500));

    const newState =
      button.classList.contains("is-selected") ||
      button.getAttribute("aria-pressed") === "true";

    if (!newState) {
      console.log("✅ 画像モードが正常にオフになりました");
      return true;
    } else {
      console.error("❌ 画像モードのオフ切り替えに失敗しました");
      return false;
    }
  }

  // 動画ボタンを探す（動作確認済みコード）
  function findGeminiVideoButton() {
    // 方法1: toolbox-drawer-button-labelのテキストで検索
    const labels = document.querySelectorAll(".toolbox-drawer-button-label");
    for (const label of labels) {
      if (label.textContent.trim() === "動画") {
        return label.closest("button");
      }
    }

    // 方法2: ボタン全体から検索
    const buttons = document.querySelectorAll(
      "button.toolbox-drawer-item-button",
    );
    for (const btn of buttons) {
      const labelDiv = btn.querySelector(".toolbox-drawer-button-label");
      if (labelDiv && labelDiv.textContent.trim() === "動画") {
        return btn;
      }
    }

    return null;
  }

  // 現在の動画モード状態を確認
  function getGeminiVideoState() {
    const button = findGeminiVideoButton();

    if (!button) {
      console.log("❌ 動画ボタンが見つかりません");
      return null;
    }

    // is-selectedクラスまたはaria-pressed属性で判定
    const isSelected =
      button.classList.contains("is-selected") ||
      button.getAttribute("aria-pressed") === "true";

    console.log("🔍 動画モード現在の状態:", {
      "is-selected": button.classList.contains("is-selected"),
      "aria-pressed": button.getAttribute("aria-pressed"),
      有効: isSelected,
    });

    return isSelected;
  }

  // 動画モードをオンにする
  async function enableGeminiVideo() {
    console.log("🎬 動画モードをオンにします...");

    const button = findGeminiVideoButton();
    if (!button) {
      console.error("❌ 動画ボタンが見つかりません");
      return false;
    }

    const currentState =
      button.classList.contains("is-selected") ||
      button.getAttribute("aria-pressed") === "true";

    if (currentState) {
      console.log("✅ 動画モードは既にオンです");
      return true;
    }

    console.log("🔱️ 動画ボタンをクリックしてオンにします");
    button.click();

    await new Promise((resolve) => setTimeout(resolve, 500));

    const newState =
      button.classList.contains("is-selected") ||
      button.getAttribute("aria-pressed") === "true";

    if (newState) {
      console.log("✅ 動画モードが正常にオンになりました");
      return true;
    } else {
      console.error("❌ 動画モードのオン切り替えに失敗しました");
      return false;
    }
  }

  // 動画モードをオフにする
  async function disableGeminiVideo() {
    console.log("🛑 動画モードをオフにします...");

    const button = findGeminiVideoButton();
    if (!button) {
      console.error("❌ 動画ボタンが見つかりません");
      return false;
    }

    const currentState =
      button.classList.contains("is-selected") ||
      button.getAttribute("aria-pressed") === "true";

    if (!currentState) {
      console.log("✅ 動画モードは既にオフです");
      return true;
    }

    console.log("🔱️ 動画ボタンをクリックしてオフにします");
    button.click();

    await new Promise((resolve) => setTimeout(resolve, 500));

    const newState =
      button.classList.contains("is-selected") ||
      button.getAttribute("aria-pressed") === "true";

    if (!newState) {
      console.log("✅ 動画モードが正常にオフになりました");
      return true;
    } else {
      console.error("❌ 動画モードのオフ切り替えに失敗しました");
      return false;
    }
  }

  // グローバルスコープに関数を公開
  console.log("[Gemini Control] windowオブジェクトに関数を追加中...");

  window.findGeminiDeepResearchButton = findGeminiDeepResearchButton;
  window.getGeminiDeepResearchState = getGeminiDeepResearchState;
  window.enableGeminiDeepResearch = enableGeminiDeepResearch;
  window.disableGeminiDeepResearch = disableGeminiDeepResearch;
  window.toggleGeminiDeepResearch = toggleGeminiDeepResearch;

  window.findGeminiDeepThinkButton = findGeminiDeepThinkButton;
  window.getGeminiDeepThinkState = getGeminiDeepThinkState;
  window.enableGeminiDeepThink = enableGeminiDeepThink;
  window.disableGeminiDeepThink = disableGeminiDeepThink;

  window.findGeminiCanvasButton = findGeminiCanvasButton;
  window.getGeminiCanvasState = getGeminiCanvasState;
  window.enableGeminiCanvas = enableGeminiCanvas;
  window.disableGeminiCanvas = disableGeminiCanvas;

  window.findGeminiImageButton = findGeminiImageButton;
  window.getGeminiImageState = getGeminiImageState;
  window.enableGeminiImage = enableGeminiImage;
  window.disableGeminiImage = disableGeminiImage;

  window.findGeminiVideoButton = findGeminiVideoButton;
  window.getGeminiVideoState = getGeminiVideoState;
  window.enableGeminiVideo = enableGeminiVideo;
  window.disableGeminiVideo = disableGeminiVideo;

  // テストモード用: 3ステップ実行関数
  async function executeGeminiDeepResearchTestMode(customText = null) {
    console.log("\n🚀 [Gemini] DeepResearchテストモード3ステップ実行開始...");

    const text =
      customText ||
      "DeepResearchのテスト: AIとロボティクスの融合による未来社会について";

    try {
      // AIInputインスタンスが利用可能か確認
      if (!window.AIInput) {
        console.error("❌ AIInputクラスが利用できません");
        return false;
      }

      // ステップ1: テキスト入力
      console.log("\n=== ステップ1/3: テキスト入力 ===");
      const aiInput = new window.AIInput("Gemini");
      const inputResult = await aiInput.inputPrompt(text);

      if (!inputResult.success) {
        console.error("❌ ステップ1で失敗しました:", inputResult.error);
        return false;
      }
      console.log("✅ ステップ1完了: テキスト入力成功");

      await new Promise((resolve) => setTimeout(resolve, 500));

      // ステップ2: DeepResearch有効化
      console.log("\n=== ステップ2/3: DeepResearch有効化 ===");
      const deepResearchSuccess = await enableGeminiDeepResearch();
      if (!deepResearchSuccess) {
        console.error("❌ ステップ2で失敗しました");
        return false;
      }
      console.log("✅ ステップ2完了: DeepResearch有効化成功");

      await new Promise((resolve) => setTimeout(resolve, 500));

      // ステップ3: 送信
      console.log("\n=== ステップ3/3: 送信 ===");
      const sendResult = await aiInput.clickSendButton(true); // enableDeepResearch=true

      if (!sendResult.success) {
        console.error("❌ ステップ3で失敗しました:", sendResult.error);
        return false;
      }
      console.log("✅ ステップ3完了: 送信成功");

      console.log("\n✅ Gemini DeepResearchテストモード実行成功！");
      console.log(
        "🔍 DeepResearchの処理が開始されました。結果を待機してください...",
      );

      return true;
    } catch (error) {
      console.error("❌ テスト実行エラー:", error);
      return false;
    }
  }

  // グローバルスコープに追加
  window.executeGeminiDeepResearchTestMode = executeGeminiDeepResearchTestMode;

  // 使い方の説明
  console.log("=== Gemini ツール制御関数 ===");
  console.log("利用可能な関数:");
  console.log("");
  console.log("DeepResearch関連:");
  console.log("  getGeminiDeepResearchState() - DeepResearch状態を確認");
  console.log("  enableGeminiDeepResearch()   - DeepResearchをオンにする");
  console.log("  disableGeminiDeepResearch()  - DeepResearchをオフにする");
  console.log("  toggleGeminiDeepResearch()   - DeepResearchを切り替える");
  console.log("");
  console.log("DeepThink関連:");
  console.log("  getGeminiDeepThinkState()    - DeepThink状態を確認");
  console.log("  enableGeminiDeepThink()      - DeepThinkをオンにする");
  console.log("  disableGeminiDeepThink()     - DeepThinkをオフにする");
  console.log("");
  console.log("Canvas関連:");
  console.log("  getGeminiCanvasState()       - Canvas状態を確認");
  console.log("  enableGeminiCanvas()         - Canvasをオンにする");
  console.log("  disableGeminiCanvas()        - Canvasをオフにする");
  console.log("");
  console.log("画像モード関連:");
  console.log("  getGeminiImageState()        - 画像モード状態を確認");
  console.log("  enableGeminiImage()          - 画像モードをオンにする");
  console.log("  disableGeminiImage()         - 画像モードをオフにする");
  console.log("");
  console.log("動画モード関連:");
  console.log("  getGeminiVideoState()        - 動画モード状態を確認");
  console.log("  enableGeminiVideo()          - 動画モードをオンにする");
  console.log("  disableGeminiVideo()         - 動画モードをオフにする");
  console.log("");
  console.log("テストモード関数:");
  console.log("  executeGeminiDeepResearchTestMode() - 3ステップ実行");
  console.log(
    "  executeGeminiDeepResearchTestMode('カスタムテキスト') - カスタムテキストで実行",
  );
  console.log("");
  console.log(
    "例: await executeGeminiDeepResearchTestMode('AIの未来について')",
  );

  // 読み込み確認
  console.log("✅ Gemini制御関数が正常に読み込まれました");

  // デバッグ用: 関数が実際に存在するか確認
  console.log("[Gemini Control] 関数登録確認:");
  console.log(
    "  - enableGeminiDeepThink:",
    typeof window.enableGeminiDeepThink,
  );
  console.log("  - enableGeminiCanvas:", typeof window.enableGeminiCanvas);
  console.log("  - enableGeminiImage:", typeof window.enableGeminiImage);
  console.log("  - enableGeminiVideo:", typeof window.enableGeminiVideo);
  console.log(
    "  - enableGeminiDeepResearch:",
    typeof window.enableGeminiDeepResearch,
  );
  console.log(
    "  - executeGeminiDeepResearchTestMode:",
    typeof window.executeGeminiDeepResearchTestMode,
  );
})();
