// Claude モード制御機能
// Claudeの各種特殊モード（Projects、Artifacts、モデル選択など）を制御

(() => {
  "use strict";

  console.log("[11.autoai][Claude] モード制御機能を読み込み中...");

  // ===== ユーティリティ関数 =====

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function waitForElement(selector, timeout = 5000) {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      const checkElement = () => {
        const element = document.querySelector(selector);
        if (element) {
          resolve(element);
        } else if (Date.now() - startTime > timeout) {
          reject(new Error(`要素が見つかりません: ${selector}`));
        } else {
          setTimeout(checkElement, 100);
        }
      };
      checkElement();
    });
  }

  // ===== Claude Projects機能制御 =====

  async function enableClaudeProjects() {
    console.log("[11.autoai][Claude] 📁 Projectsモードを有効化中...");

    try {
      // Projectsボタンを探す
      const projectButton = Array.from(
        document.querySelectorAll("button, a"),
      ).find(
        (el) =>
          el.textContent?.includes("Projects") ||
          el.textContent?.includes("Project"),
      );

      if (projectButton) {
        console.log("[11.autoai][Claude] 📁 Projectsボタンを選択");
        projectButton.click();
        await sleep(500);
        console.log("[11.autoai][Claude] ✅ Projectsモードが有効になりました");
        return true;
      } else {
        console.warn("[11.autoai][Claude] ❌ Projectsボタンが見つかりません");
        return false;
      }
    } catch (error) {
      console.error("[11.autoai][Claude] Projects有効化エラー:", error);
      return false;
    }
  }

  async function disableClaudeProjects() {
    console.log("[11.autoai][Claude] 📁 Projectsモードを無効化中...");

    try {
      // 通常のチャット画面に戻るボタンを探す
      const chatButton = Array.from(
        document.querySelectorAll("button, a"),
      ).find(
        (el) =>
          el.textContent?.includes("Chat") ||
          el.textContent?.includes("New chat"),
      );

      if (chatButton) {
        chatButton.click();
        await sleep(500);
        console.log("[11.autoai][Claude] ✅ 通常のチャットモードに戻しました");
        return true;
      }
      return false;
    } catch (error) {
      console.error("[11.autoai][Claude] Projects無効化エラー:", error);
      return false;
    }
  }

  // ===== Claude Artifacts機能制御 =====

  async function enableClaudeArtifacts() {
    console.log("[11.autoai][Claude] 🛠️ Artifactsモードを有効化中...");

    try {
      // Artifactsは通常自動的に有効になるため、設定を確認
      const artifactElement = document.querySelector(
        '[data-testid*="artifact"], .artifact, [class*="artifact"]',
      );
      if (artifactElement) {
        console.log("[11.autoai][Claude] ✅ Artifactsは既に利用可能です");
        return true;
      }

      // Artifacts設定ボタンを探す
      const settingsButton = document.querySelector(
        'button[aria-label*="settings"], button[aria-label*="Settings"]',
      );
      if (settingsButton) {
        settingsButton.click();
        await sleep(500);

        // Artifacts設定を探す
        const artifactToggle = Array.from(
          document.querySelectorAll('input[type="checkbox"], button'),
        ).find(
          (el) =>
            el.parentElement?.textContent?.includes("Artifacts") ||
            el.getAttribute("aria-label")?.includes("Artifacts"),
        );

        if (artifactToggle && !artifactToggle.checked) {
          artifactToggle.click();
          await sleep(500);
          console.log("[11.autoai][Claude] ✅ Artifactsが有効になりました");
          // 設定を閉じる
          document.body.click();
          return true;
        }
      }

      console.log("[11.autoai][Claude] ✅ Artifactsは既に有効です");
      return true;
    } catch (error) {
      console.error("[11.autoai][Claude] Artifacts有効化エラー:", error);
      return false;
    }
  }

  async function disableClaudeArtifacts() {
    console.log("[11.autoai][Claude] 🛠️ Artifactsモードを無効化中...");

    try {
      const settingsButton = document.querySelector(
        'button[aria-label*="settings"], button[aria-label*="Settings"]',
      );
      if (settingsButton) {
        settingsButton.click();
        await sleep(500);

        const artifactToggle = Array.from(
          document.querySelectorAll('input[type="checkbox"]'),
        ).find((el) => el.parentElement?.textContent?.includes("Artifacts"));

        if (artifactToggle && artifactToggle.checked) {
          artifactToggle.click();
          await sleep(500);
          console.log("[11.autoai][Claude] ✅ Artifactsを無効化しました");
          document.body.click();
          return true;
        }
      }
      return false;
    } catch (error) {
      console.error("[11.autoai][Claude] Artifacts無効化エラー:", error);
      return false;
    }
  }

  // ===== Claude モデル選択制御 =====

  async function enableClaudeModel(modelName) {
    console.log(`[11.autoai][Claude] 🧠 ${modelName}モデルを有効化中...`);

    try {
      // モデル選択ボタンを探す
      const modelButton = document.querySelector(
        'button[role="combobox"], button[aria-haspopup="true"], button[data-testid*="model"]',
      );
      if (!modelButton) {
        console.warn("[11.autoai][Claude] ❌ モデル選択ボタンが見つかりません");
        return false;
      }

      // ドロップダウンを開く
      console.log("[11.autoai][Claude] モデル選択メニューを開きます");
      modelButton.click();
      await sleep(500);

      // 指定されたモデルオプションを探す
      const modelOption = Array.from(
        document.querySelectorAll('[role="option"], [role="menuitem"]'),
      ).find((item) => item.textContent?.includes(modelName));

      if (modelOption) {
        console.log(`[11.autoai][Claude] 🧠 ${modelName}モデルを選択`);
        modelOption.click();
        await sleep(500);
        console.log(
          `[11.autoai][Claude] ✅ ${modelName}モデルが有効になりました`,
        );
        return true;
      } else {
        console.warn(
          `[11.autoai][Claude] ❌ ${modelName}モデルが見つかりません`,
        );
        // メニューを閉じる
        document.body.click();
        return false;
      }
    } catch (error) {
      console.error(`[11.autoai][Claude] ${modelName}有効化エラー:`, error);
      return false;
    }
  }

  // ===== 個別モデル制御関数 =====

  async function enableClaudeSonnet() {
    return await enableClaudeModel("Sonnet");
  }

  async function enableClaudeHaiku() {
    return await enableClaudeModel("Haiku");
  }

  async function enableClaudeOpus() {
    return await enableClaudeModel("Opus");
  }

  // ===== Claude DeepResearch制御（既存機能との統合） =====

  async function enableClaudeDeepResearch() {
    console.log("[11.autoai][Claude] 🔬 DeepResearch機能を有効化中...");

    try {
      // ステップ1: ツールメニューを開く
      console.log("[11.autoai][Claude] 📋 ステップ1: ツールメニューを開く");
      const toolsButton = document.querySelector(
        'button[id="input-tools-menu-trigger"]',
      );
      if (!toolsButton) {
        console.error(
          "[11.autoai][Claude] ❌ ツールメニューボタンが見つかりません",
        );
        return false;
      }

      // メニューが閉じている場合は開く
      if (toolsButton.getAttribute("aria-expanded") !== "true") {
        toolsButton.click();
        await sleep(800);
        console.log("[11.autoai][Claude] ✅ ツールメニューを開きました");
      } else {
        console.log("[11.autoai][Claude] ℹ️ ツールメニューは既に開いています");
      }

      // ステップ2: Web検索モードを有効化
      console.log("[11.autoai][Claude] 🔍 ステップ2: Web検索を有効化");
      const webSearchButton = Array.from(
        document.querySelectorAll("button"),
      ).find((btn) => btn.textContent?.includes("ウェブ検索"));

      if (!webSearchButton) {
        console.error(
          "[11.autoai][Claude] ❌ ウェブ検索ボタンが見つかりません",
        );
        // デバッグ: ボタン一覧表示
        console.log("[11.autoai][Claude] 利用可能なボタン:");
        document.querySelectorAll("button").forEach((btn, i) => {
          const text = btn.textContent?.trim();
          if (text && text.length < 30) {
            console.log(`  ${i}: "${text}"`);
          }
        });
        return false;
      }

      if (!webSearchButton.classList.contains("text-primary-500")) {
        webSearchButton.click();
        await sleep(500);
        console.log("[11.autoai][Claude] ✅ Web検索を有効化しました");
      } else {
        console.log("[11.autoai][Claude] ℹ️ Web検索は既に有効です");
      }

      // ステップ3: リサーチボタンをクリック
      console.log("[11.autoai][Claude] 🔬 ステップ3: リサーチボタンを押す");
      await sleep(500); // ボタン読み込み待機

      const researchButton = Array.from(
        document.querySelectorAll("button"),
      ).find((btn) => {
        const svg = btn.querySelector('svg path[d*="M8.5 2C12.0899"]');
        const text = btn.querySelector("p");
        return svg && text && text.textContent === "リサーチ";
      });

      if (!researchButton) {
        console.error("[11.autoai][Claude] ❌ リサーチボタンが見つかりません");
        return false;
      }

      const isPressed = researchButton.getAttribute("aria-pressed") === "true";
      if (!isPressed) {
        researchButton.click();
        await sleep(500);
        console.log("[11.autoai][Claude] ✅ リサーチモードを有効化しました");
      } else {
        console.log("[11.autoai][Claude] ℹ️ リサーチモードは既に有効です");
      }

      console.log(
        "[11.autoai][Claude] ✅ DeepResearchモードが完全に有効になりました",
      );
      return true;
    } catch (error) {
      console.error("[11.autoai][Claude] ❌ DeepResearch有効化エラー:", error);
      return false;
    }
  }

  async function disableClaudeDeepResearch() {
    console.log("[11.autoai][Claude] 🔬 DeepResearch機能を無効化中...");

    try {
      // まず、リサーチボタン（研究アイコン）を探す
      const buttons = document.querySelectorAll('button[type="button"]');
      let targetButton = null;

      for (const btn of buttons) {
        const svg = btn.querySelector('svg path[d*="M8.5 2C12.0899"]');
        const text = btn.querySelector("p");
        if (svg && text && text.textContent === "リサーチ") {
          targetButton = btn;
          break;
        }
      }

      if (targetButton) {
        const isPressed = targetButton.getAttribute("aria-pressed") === "true";

        if (isPressed) {
          console.log(
            "[11.autoai][Claude] 🔍 リサーチボタンをクリックして無効化します",
          );
          targetButton.click();
          await sleep(500);
          console.log(
            "[11.autoai][Claude] ✅ リサーチモードが無効になりました",
          );
        } else {
          console.log("[11.autoai][Claude] ℹ️ リサーチモードは既に無効です");
        }
        return true;
      }

      // リサーチボタンが見つからない場合は、既存の実装を試す
      console.log(
        "[11.autoai][Claude] リサーチボタンが見つからないため、既存の実装を試します",
      );

      if (window.disableDeepResearch) {
        return await window.disableDeepResearch();
      }

      return false;
    } catch (error) {
      console.error("[11.autoai][Claude] ❌ DeepResearch無効化エラー:", error);
      return false;
    }
  }

  // ===== 統合制御関数 =====

  /**
   * 全ての特殊機能を無効化
   */
  async function disableAllClaudeModes() {
    console.log("[11.autoai][Claude] 🔄 全モードを無効化中...");

    const results = await Promise.allSettled([
      disableClaudeProjects(),
      disableClaudeArtifacts(),
      disableClaudeDeepResearch(),
    ]);

    console.log("[11.autoai][Claude] ✅ 全モード無効化完了");
    return results.some(
      (result) => result.status === "fulfilled" && result.value,
    );
  }

  /**
   * 指定されたモードを有効化
   */
  async function enableClaudeMode(mode) {
    console.log(`[11.autoai][Claude] 🔄 ${mode}モードを有効化中...`);

    // まず特殊機能を無効化（モデル変更は除く）
    await Promise.allSettled([
      disableClaudeProjects(),
      disableClaudeDeepResearch(),
    ]);
    await sleep(500);

    switch (mode) {
      case "Projects":
        return await enableClaudeProjects();
      case "Artifacts":
        return await enableClaudeArtifacts();
      case "Sonnet":
        return await enableClaudeSonnet();
      case "Haiku":
        return await enableClaudeHaiku();
      case "Opus":
        return await enableClaudeOpus();
      case "DeepResearch":
        return await enableClaudeDeepResearch();
      default:
        console.log(`[11.autoai][Claude] ✅ 標準モードに設定`);
        return true;
    }
  }

  // ===== グローバル関数として公開 =====

  window.enableClaudeProjects = enableClaudeProjects;
  window.disableClaudeProjects = disableClaudeProjects;
  window.enableClaudeArtifacts = enableClaudeArtifacts;
  window.disableClaudeArtifacts = disableClaudeArtifacts;
  window.enableClaudeSonnet = enableClaudeSonnet;
  window.enableClaudeHaiku = enableClaudeHaiku;
  window.enableClaudeOpus = enableClaudeOpus;
  window.enableClaudeModel = enableClaudeModel;
  window.enableClaudeDeepResearch = enableClaudeDeepResearch;
  window.disableClaudeDeepResearch = disableClaudeDeepResearch;
  window.disableAllClaudeModes = disableAllClaudeModes;
  window.enableClaudeMode = enableClaudeMode;

  console.log("[11.autoai][Claude] ✅ モード制御機能が利用可能になりました");
  console.log("[11.autoai][Claude] 利用可能な関数:");
  console.log("  - enableClaudeProjects()");
  console.log("  - enableClaudeArtifacts()");
  console.log("  - enableClaudeSonnet()");
  console.log("  - enableClaudeHaiku()");
  console.log("  - enableClaudeOpus()");
  console.log("  - enableClaudeDeepResearch()");
  console.log(
    "  - enableClaudeMode('Projects'|'Artifacts'|'Sonnet'|'Haiku'|'Opus'|'DeepResearch')",
  );
  console.log("  - disableAllClaudeModes()");
})();
