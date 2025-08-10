// Claude DeepResearch 堅牢な実装
// UIの変更に強い実装パターン

(() => {
  "use strict";

  console.log("[11.autoai][Claude] DeepResearch堅牢版を読み込み中...");

  // ===== ユーティリティ関数 =====

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // 要素を待機する関数（セレクタ関数を受け取る）
  function waitForElement(selectorFunc, timeout = 5000, description = "要素") {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      const checkElement = () => {
        try {
          const element = selectorFunc();
          if (element) {
            console.log(`✅ ${description}を発見`);
            resolve(element);
          } else if (Date.now() - startTime > timeout) {
            reject(
              new Error(
                `❌ ${description}が見つかりません (${timeout}ms timeout)`,
              ),
            );
          } else {
            setTimeout(checkElement, 100);
          }
        } catch (error) {
          if (Date.now() - startTime > timeout) {
            reject(error);
          } else {
            setTimeout(checkElement, 100);
          }
        }
      };
      checkElement();
    });
  }

  // 複数のパターンでボタンを検索
  function findButtonByPatterns(patterns, description = "ボタン") {
    console.log(`🔍 ${description}を検索中...`);

    for (let i = 0; i < patterns.length; i++) {
      try {
        const button = patterns[i]();
        if (button) {
          console.log(`✅ ${description}を発見 (パターン${i + 1})`);
          return button;
        }
      } catch (error) {
        console.debug(`パターン${i + 1}エラー:`, error.message);
      }
    }

    console.error(`❌ ${description}が見つかりません`);
    return null;
  }

  // ===== メイン関数 =====

  async function enableClaudeDeepResearchRobust() {
    console.log("\n🚀 Claude DeepResearch有効化開始（堅牢版）\n");

    try {
      // ステップ1: ツールメニューを開く
      console.log("📋 ステップ1: ツールメニューを開く");

      const toolsButtonPatterns = [
        // パターン1: ID指定（最優先）
        () => document.querySelector('button[id="input-tools-menu-trigger"]'),
        // パターン2: aria-label
        () =>
          document.querySelector(
            'button[aria-label*="ツール"], button[aria-label*="Tools"]',
          ),
        // パターン3: アイコン付きボタン
        () =>
          Array.from(document.querySelectorAll("button")).find(
            (btn) =>
              btn.querySelector("svg") &&
              (btn.textContent?.includes("ツール") ||
                btn.getAttribute("aria-label")?.includes("ツール")),
          ),
        // パターン4: 入力欄近くのボタン
        () => {
          const inputArea = document.querySelector(
            '.ProseMirror[contenteditable="true"]',
          );
          if (!inputArea) return null;
          const nearbyButtons =
            inputArea.parentElement?.parentElement?.querySelectorAll("button");
          return Array.from(nearbyButtons || []).find(
            (btn) => btn.id?.includes("tools") || btn.id?.includes("menu"),
          );
        },
      ];

      const toolsButton = await waitForElement(
        () => findButtonByPatterns(toolsButtonPatterns, "ツールメニューボタン"),
        5000,
        "ツールメニューボタン",
      );

      if (toolsButton.getAttribute("aria-expanded") !== "true") {
        toolsButton.click();
        await sleep(800);
        console.log("✅ ツールメニューを開きました");
      } else {
        console.log("ℹ️ ツールメニューは既に開いています");
      }

      // ステップ2: Web検索を有効化
      console.log("\n🔍 ステップ2: Web検索を有効化");

      const webSearchPatterns = [
        // パターン1: テキストコンテンツ
        () =>
          Array.from(document.querySelectorAll("button")).find(
            (btn) =>
              btn.textContent?.includes("ウェブ検索") ||
              btn.textContent?.includes("Web Search"),
          ),
        // パターン2: aria-label
        () =>
          document.querySelector(
            'button[aria-label*="ウェブ検索"], button[aria-label*="Web Search"]',
          ),
        // パターン3: data属性
        () =>
          document.querySelector(
            'button[data-testid*="web-search"], button[data-id*="web-search"]',
          ),
        // パターン4: クラス名
        () =>
          Array.from(document.querySelectorAll("button")).find(
            (btn) =>
              btn.className.includes("web-search") ||
              btn.className.includes("search-toggle"),
          ),
      ];

      const webSearchButton = await waitForElement(
        () => findButtonByPatterns(webSearchPatterns, "Web検索ボタン"),
        5000,
        "Web検索ボタン",
      );

      // 状態確認の複数パターン
      const isWebSearchActive =
        webSearchButton.classList.contains("text-primary-500") ||
        webSearchButton.classList.contains("active") ||
        webSearchButton.getAttribute("aria-pressed") === "true" ||
        webSearchButton.getAttribute("data-state") === "active";

      if (!isWebSearchActive) {
        webSearchButton.click();
        await sleep(500);
        console.log("✅ Web検索を有効化しました");
      } else {
        console.log("ℹ️ Web検索は既に有効です");
      }

      // ステップ3: リサーチボタンを押す
      console.log("\n🔬 ステップ3: リサーチボタンを押す");
      await sleep(500); // ボタン読み込み待機

      const researchPatterns = [
        // パターン1: SVGアイコンとテキスト（最も確実）
        () =>
          Array.from(document.querySelectorAll("button")).find((btn) => {
            const svg = btn.querySelector('svg path[d*="M8.5 2C12.0899"]');
            const text = btn.querySelector("p, span");
            return (
              svg &&
              text &&
              (text.textContent === "リサーチ" ||
                text.textContent === "Research")
            );
          }),
        // パターン2: aria-labelまたはtitle
        () =>
          document.querySelector(
            'button[aria-label*="リサーチ"], button[aria-label*="Research"], button[title*="リサーチ"], button[title*="Research"]',
          ),
        // パターン3: テキストのみ
        () =>
          Array.from(document.querySelectorAll("button")).find((btn) => {
            const text = btn.textContent?.trim();
            return (
              text === "リサーチ" ||
              text === "Research" ||
              text === "Deep Research"
            );
          }),
        // パターン4: data属性
        () =>
          document.querySelector(
            'button[data-testid*="research"], button[data-id*="research"], button[data-action*="research"]',
          ),
        // パターン5: クラス名パターン
        () =>
          document.querySelector(
            'button[class*="research-button"], button[class*="deep-research"]',
          ),
      ];

      const researchButton = await waitForElement(
        () => findButtonByPatterns(researchPatterns, "リサーチボタン"),
        5000,
        "リサーチボタン",
      );

      // 状態確認
      const isResearchActive =
        researchButton.getAttribute("aria-pressed") === "true" ||
        researchButton.classList.contains("active") ||
        researchButton.getAttribute("data-state") === "pressed";

      if (!isResearchActive) {
        // クリックの複数方法を試す
        try {
          researchButton.click();
        } catch (e) {
          console.log("⚠️ 通常クリック失敗、代替方法を試行");
          researchButton.dispatchEvent(
            new MouseEvent("click", { bubbles: true }),
          );
        }

        await sleep(500);
        console.log("✅ リサーチモードを有効化しました");
      } else {
        console.log("ℹ️ リサーチモードは既に有効です");
      }

      console.log("\n✅ DeepResearchモードが完全に有効になりました！");

      // 最終確認
      await sleep(300);
      const finalCheck = await verifyDeepResearchState();
      if (finalCheck) {
        console.log("✅ 最終確認: DeepResearchモードは正常に動作しています");
      }

      return true;
    } catch (error) {
      console.error("❌ DeepResearch有効化エラー:", error);

      // エラー時のデバッグ情報
      console.log("\n📊 デバッグ情報:");
      analyzeCurrentState();

      return false;
    }
  }

  // DeepResearch状態の確認
  async function verifyDeepResearchState() {
    try {
      // 複数の方法で状態を確認
      const checks = [
        // リサーチボタンの状態
        () => {
          const btn = Array.from(document.querySelectorAll("button")).find(
            (b) => b.querySelector("p")?.textContent === "リサーチ",
          );
          return btn?.getAttribute("aria-pressed") === "true";
        },
        // Web検索の状態
        () => {
          const btn = Array.from(document.querySelectorAll("button")).find(
            (b) => b.textContent?.includes("ウェブ検索"),
          );
          return btn?.classList.contains("text-primary-500");
        },
        // UI全体の変化
        () => {
          return (
            document.querySelector('[data-state="research-active"]') !== null
          );
        },
      ];

      const results = checks.map((check) => {
        try {
          return check();
        } catch {
          return false;
        }
      });

      return results.some((r) => r === true);
    } catch (error) {
      console.error("状態確認エラー:", error);
      return false;
    }
  }

  // 現在の状態を分析
  function analyzeCurrentState() {
    console.log("\n=== 現在のUI状態分析 ===");

    // ツールメニューの状態
    const toolsButton = document.querySelector(
      'button[id="input-tools-menu-trigger"]',
    );
    console.log(
      "ツールメニュー:",
      toolsButton
        ? `found (expanded: ${toolsButton.getAttribute("aria-expanded")})`
        : "not found",
    );

    // ボタン一覧
    console.log("\n利用可能なボタン:");
    const buttons = document.querySelectorAll("button");
    buttons.forEach((btn, i) => {
      const text = btn.textContent?.trim();
      const ariaLabel = btn.getAttribute("aria-label");
      const ariaPressed = btn.getAttribute("aria-pressed");

      if (text && text.length < 50) {
        console.log(
          `${i}: "${text}"${ariaLabel ? ` (aria-label: ${ariaLabel})` : ""}${ariaPressed ? ` (pressed: ${ariaPressed})` : ""}`,
        );
      }
    });

    // SVGアイコン付きボタン
    console.log("\nSVGアイコン付きボタン:");
    buttons.forEach((btn, i) => {
      const svg = btn.querySelector("svg");
      if (svg) {
        const text = btn.textContent?.trim() || btn.getAttribute("aria-label");
        console.log(`${i}: ${text || "no text"} (has SVG)`);
      }
    });
  }

  // ===== グローバル公開 =====

  window.enableClaudeDeepResearchRobust = enableClaudeDeepResearchRobust;
  window.verifyClaudeDeepResearchState = verifyDeepResearchState;
  window.analyzeClaudeUIState = analyzeCurrentState;

  console.log(
    "[11.autoai][Claude] ✅ DeepResearch堅牢版が利用可能になりました",
  );
  console.log("利用可能な関数:");
  console.log(
    "  - enableClaudeDeepResearchRobust() : 堅牢なDeepResearch有効化",
  );
  console.log("  - verifyClaudeDeepResearchState() : 状態確認");
  console.log("  - analyzeClaudeUIState() : UI状態分析");
})();
