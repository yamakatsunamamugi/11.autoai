// ChatGPT モデル＆機能選択システム（強化版）
// 提供されたコードの堅牢性とエラーハンドリングを統合した改良版

(() => {
  "use strict";

  // ===========================================
  // 設定
  // ===========================================
  const CONFIG = {
    // モデル設定（拡張版）
    models: {
      "gpt-4o": {
        id: "gpt-4o",
        name: "GPT-4o (Default)",
        description: "標準的な GPT-4o モデル",
        testId: "model-switcher-gpt-4o",
        keywords: ["GPT-4o", "4o"],
      },
      "gpt-4o-mini": {
        id: "gpt-4o-mini",
        name: "GPT-4o Mini",
        description: "軽量版 GPT-4o",
        testId: "model-switcher-gpt-4o-mini",
        keywords: ["GPT-4o-mini", "4o-mini"],
      },
      o1: {
        id: "o1",
        name: "o1 (推論モデル)",
        description: "高度な推論が可能なモデル",
        testId: "model-switcher-o1",
        keywords: ["o1"],
      },
      "o1-preview": {
        id: "o1-preview",
        name: "o1-preview",
        description: "o1のプレビュー版",
        testId: "model-switcher-o1-preview",
        keywords: ["o1-preview"],
      },
      "o1-mini": {
        id: "o1-mini",
        name: "o1-mini",
        description: "o1の軽量版",
        testId: "model-switcher-o1-mini",
        keywords: ["o1-mini"],
      },
      o3: {
        id: "o3",
        name: "o3 (最新)",
        description: "最新の実験的モデル",
        testId: "model-switcher-o3",
        keywords: ["o3"],
      },
      "o3-pro": {
        id: "o3-pro",
        name: "o3-pro",
        description: "o3のプロフェッショナル版",
        testId: "model-switcher-o3-pro",
        keywords: ["o3-pro"],
      },
      "o4-mini": {
        id: "o4-mini",
        name: "o4-mini",
        description: "o4の軽量版",
        testId: "model-switcher-o4-mini",
        keywords: ["o4-mini"],
      },
      "o4-mini-high": {
        id: "o4-mini-high",
        name: "o4-mini-high",
        description: "o4-miniの高性能版",
        testId: "model-switcher-o4-mini-high",
        keywords: ["o4-mini-high"],
      },
    },

    // 機能設定（拡張版）
    functions: {
      none: {
        id: "none",
        name: "なし（通常モード）",
        description: "特殊機能を使用しない",
        icon: "💬",
        keywords: [],
      },
      agent: {
        id: "agent",
        name: "エージェントモード",
        description: "自律的にタスクを実行",
        icon: "🤖",
        keywords: ["エージェント", "agent"],
        pillText: "エージェント",
      },
      "deep-research": {
        id: "deep-research",
        name: "Deep Research",
        description: "最大15分の深層調査",
        icon: "🔬",
        keywords: ["deep research", "リサーチ", "research"],
        pillText: "リサーチ",
      },
      canvas: {
        id: "canvas",
        name: "Canvas",
        description: "コード編集用インターフェース",
        icon: "🎨",
        keywords: ["canvas"],
        pillText: "Canvas",
      },
      "web-search": {
        id: "web-search",
        name: "ウェブ検索",
        description: "インターネット検索を有効化",
        icon: "🔍",
        keywords: ["ウェブ検索", "web search", "検索"],
        pillText: "検索",
      },
      image: {
        id: "image",
        name: "画像生成",
        description: "DALL-E 3による画像生成",
        icon: "🖼️",
        keywords: ["画像", "image", "dall-e", "画像を作成する"],
        pillText: "画像",
      },
      connector: {
        id: "connector",
        name: "コネクター",
        description: "外部サービスとの連携",
        icon: "🔌",
        keywords: ["コネクター", "connector", "コネクターを使用する"],
        pillText: "コネクター",
      },
      learning: {
        id: "learning",
        name: "学習サポート",
        description: "あらゆる学びをサポート",
        icon: "📚",
        keywords: ["学習", "learning", "勉強", "あらゆる学びをサポート"],
        pillText: "勉強する",
      },
    },

    // セレクター設定（堅牢性向上）
    selectors: {
      model: {
        menuButton: [
          '[data-testid="model-switcher-dropdown-button"]',
          'button[aria-label*="モデル"]',
          'button[aria-label*="Model"]',
          'button[aria-haspopup="true"]',
        ],
        menuContainer: '[role="menu"][data-state="open"]',
        menuItem: '[role="menuitem"]',
      },
      function: {
        toolButton: [
          "#system-hint-button",
          'button[aria-label*="ツールを選択"]',
          'button[aria-label*="Select tool"]',
        ],
        menuContainer: 'div[role="menu"][data-state="open"]',
        menuItem: 'div[role="menuitemradio"]',
        selectedPill: 'button[data-is-selected="true"][data-pill="true"]',
        pillCloseButton: 'svg[aria-label*="無効"], svg[aria-label*="disable"]',
      },
    },

    // タイミング設定
    timing: {
      actionDelay: 800,
      defaultTimeout: 10000,
      uiUpdateDelay: 500,
      animationDelay: 300,
    },

    // UI変更警告
    uiChangeWarning: {
      enabled: true,
      documentUrl:
        "https://docs.google.com/spreadsheets/d/1QfOFEUWtlR0wwaN5BRyVdenFPxCRJmsf4SPo87O_ZnY/edit?gid=0#gid=0",
      message: "ChatGPTのUIが変更された可能性があります。",
    },
  };

  // ===========================================
  // ユーティリティ関数（強化版）
  // ===========================================
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const normalizeString = (str) =>
    (str || "").toLowerCase().replace(/[\s-]/g, "");

  // 強化版: waitForElement
  const waitForElement = (selector, timeout = CONFIG.timing.defaultTimeout) => {
    return new Promise((resolve) => {
      const startTime = Date.now();
      const check = () => {
        const element = document.querySelector(selector);
        if (element) {
          resolve(element);
        } else if (Date.now() - startTime > timeout) {
          console.warn(`[Timeout] 要素が見つかりません: ${selector}`);
          resolve(null);
        } else {
          setTimeout(check, 100);
        }
      };
      check();
    });
  };

  // 複数のセレクターから要素を探す
  const findElementBySelectors = (selectors) => {
    if (typeof selectors === "string") {
      return document.querySelector(selectors);
    }
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) return element;
    }
    return null;
  };

  // 堅牢なクリック処理
  const robustClick = async (element, options = {}) => {
    if (!element) {
      console.error("クリック対象の要素が存在しません");
      return false;
    }

    if (options.dryRun) {
      console.log(`[DryRun] 要素をクリック:`, element);
      return true;
    }

    try {
      // 複数の方法でクリックを試行
      element.focus();

      // Method 1: MouseEvent
      element.dispatchEvent(
        new MouseEvent("click", {
          bubbles: true,
          cancelable: true,
          view: window,
        }),
      );

      // Method 2: PointerEvent (より新しいブラウザ用)
      element.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      element.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));

      // Method 3: 直接クリック
      if (typeof element.click === "function") {
        element.click();
      }

      await wait(50);
      return true;
    } catch (error) {
      console.error("クリックエラー:", error);
      return false;
    }
  };

  // UI変更警告表示
  const showUIChangeWarning = () => {
    if (!CONFIG.uiChangeWarning.enabled) return;

    console.error(
      "%c[警告] " + CONFIG.uiChangeWarning.message,
      "color: red; font-size: 14px; font-weight: bold;",
    );
    console.error(
      "詳細はこちらを確認してください:\n" + CONFIG.uiChangeWarning.documentUrl,
    );
  };

  // ===========================================
  // モデル選択クラス（強化版）
  // ===========================================
  class ModelSelector {
    constructor() {
      this.currentModel = "gpt-4o";
    }

    async getMenuButton() {
      const button = findElementBySelectors(CONFIG.selectors.model.menuButton);
      if (!button) {
        showUIChangeWarning();
        throw new Error("モデル選択ボタンが見つかりません");
      }
      return button;
    }

    async openMenu(options = {}) {
      const button = await this.getMenuButton();
      if (button.getAttribute("aria-expanded") === "true") {
        console.log("モデルメニューは既に開いています");
        return true;
      }

      console.log("モデルメニューを開きます...");

      if (!options.dryRun) {
        // Enterキーでの開閉を試行
        button.focus();
        button.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
        );
        button.dispatchEvent(
          new KeyboardEvent("keyup", { key: "Enter", bubbles: true }),
        );
        await wait(CONFIG.timing.actionDelay);

        // まだ開いていない場合はクリック
        if (button.getAttribute("aria-expanded") !== "true") {
          await robustClick(button, options);
          await wait(CONFIG.timing.actionDelay);
        }

        // メニューコンテナの表示を確認
        const menuContainer = await waitForElement(
          CONFIG.selectors.model.menuContainer,
          3000,
        );
        if (!menuContainer) {
          showUIChangeWarning();
          return false;
        }
      }

      console.log("✅ モデルメニューが開きました");
      return true;
    }

    async closeMenu(options = {}) {
      try {
        const button = await this.getMenuButton();
        if (button.getAttribute("aria-expanded") === "true") {
          await robustClick(button, options);
          await wait(CONFIG.timing.actionDelay);
        }
      } catch (error) {
        console.warn("メニューを閉じる際のエラー:", error);
      }
    }

    async selectModel(modelId, options = {}) {
      const modelConfig = CONFIG.models[modelId];
      if (!modelConfig) {
        throw new Error(`不明なモデル: ${modelId}`);
      }

      console.log(`🔄 モデルを選択中: ${modelConfig.name}`);

      try {
        // メニューを開く
        if (!(await this.openMenu(options))) {
          return false;
        }

        // data-testid属性で要素を探す（優先）
        let targetItem = null;
        if (modelConfig.testId) {
          const selector = `${CONFIG.selectors.model.menuItem}[data-testid="${modelConfig.testId}"]`;
          targetItem = await waitForElement(selector, 3000);
        }

        // data-testidで見つからない場合はテキストで探す
        if (!targetItem) {
          const menuItems = document.querySelectorAll(
            CONFIG.selectors.model.menuItem,
          );
          for (const item of menuItems) {
            const itemText = normalizeString(item.textContent);
            for (const keyword of modelConfig.keywords) {
              if (itemText.includes(normalizeString(keyword))) {
                targetItem = item;
                break;
              }
            }
            if (targetItem) break;
          }
        }

        if (!targetItem) {
          showUIChangeWarning();
          throw new Error(`モデルが見つかりません: ${modelConfig.name}`);
        }

        // モデルを選択
        await robustClick(targetItem, options);
        await wait(CONFIG.timing.actionDelay);

        // 選択の検証
        if (!options.dryRun) {
          const verified = await this.verifySelection(modelId);
          if (!verified) {
            console.warn("モデル選択の検証に失敗しました");
          }
        }

        this.currentModel = modelId;
        console.log(`✅ モデル選択完了: ${modelConfig.name}`);
        return true;
      } catch (error) {
        console.error(`❌ モデル選択エラー: ${error.message}`);
        return false;
      } finally {
        await this.closeMenu(options);
      }
    }

    async verifySelection(modelId) {
      const modelConfig = CONFIG.models[modelId];
      const button = await this.getMenuButton();
      const buttonText = normalizeString(button.textContent);

      for (const keyword of modelConfig.keywords) {
        if (buttonText.includes(normalizeString(keyword))) {
          console.log(`✅ 検証成功: ${modelConfig.name}が選択されています`);
          return true;
        }
      }

      console.warn(
        `⚠️ 検証失敗: 期待=${modelConfig.name}, 実際=${button.textContent}`,
      );
      return false;
    }

    async getCurrentModel() {
      try {
        const button = await this.getMenuButton();
        const buttonText = button.textContent.trim().toLowerCase();

        for (const [modelId, config] of Object.entries(CONFIG.models)) {
          for (const keyword of config.keywords) {
            if (buttonText.includes(keyword.toLowerCase())) {
              return modelId;
            }
          }
        }

        return "gpt-4o"; // デフォルト
      } catch {
        return "gpt-4o";
      }
    }
  }

  // ===========================================
  // 機能選択クラス（強化版）
  // ===========================================
  class FunctionSelector {
    constructor() {
      this.currentFunction = "none";
    }

    async getToolButton() {
      const button = findElementBySelectors(
        CONFIG.selectors.function.toolButton,
      );
      return button; // nullの可能性あり（ツールボタンがない場合もある）
    }

    async openToolMenu(options = {}) {
      const button = await this.getToolButton();
      if (!button) {
        console.log(
          "ツールメニューボタンが見つかりません（機能が利用できない可能性があります）",
        );
        return false;
      }

      if (button.getAttribute("aria-expanded") === "true") {
        console.log("ツールメニューは既に開いています");
        return true;
      }

      console.log("ツールメニューを開きます...");
      await robustClick(button, options);
      await wait(CONFIG.timing.actionDelay);

      if (options.dryRun || button.getAttribute("aria-expanded") === "true") {
        console.log("✅ ツールメニューが開きました");
        return true;
      }

      return false;
    }

    async closeToolMenu(options = {}) {
      try {
        const button = await this.getToolButton();
        if (button && button.getAttribute("aria-expanded") === "true") {
          await robustClick(button, options);
          await wait(CONFIG.timing.actionDelay);
        }
      } catch (error) {
        console.warn("ツールメニューを閉じる際のエラー:", error);
      }
    }

    async selectFunction(functionId, options = {}) {
      const functionConfig = CONFIG.functions[functionId];
      if (!functionConfig) {
        throw new Error(`不明な機能: ${functionId}`);
      }

      // 「なし」の場合は現在の機能を無効化
      if (functionId === "none") {
        await this.deselectAllFunctions(options);
        return true;
      }

      console.log(`🔄 機能を選択中: ${functionConfig.name}`);

      try {
        // 既存の選択を解除
        await this.deselectAllFunctions(options);

        // ツールメニューを開く
        if (!(await this.openToolMenu(options))) {
          throw new Error("ツールメニューを開けませんでした");
        }

        // メニューコンテナを確認
        const menuContainer = await waitForElement(
          CONFIG.selectors.function.menuContainer,
          3000,
        );
        if (!menuContainer && !options.dryRun) {
          showUIChangeWarning();
          throw new Error("メニューコンテナが見つかりません");
        }

        // 機能オプションを探す
        const menuItems = document.querySelectorAll(
          CONFIG.selectors.function.menuItem,
        );
        let targetItem = null;

        for (const item of menuItems) {
          const itemText = normalizeString(item.textContent);
          for (const keyword of functionConfig.keywords) {
            if (itemText.includes(normalizeString(keyword))) {
              targetItem = item;
              break;
            }
          }
          if (targetItem) break;
        }

        if (!targetItem && !options.dryRun) {
          showUIChangeWarning();
          throw new Error(`機能が見つかりません: ${functionConfig.name}`);
        }

        // 機能を選択
        if (targetItem) {
          await robustClick(targetItem, options);
          await wait(CONFIG.timing.uiUpdateDelay);
        }

        // 選択の検証
        if (!options.dryRun) {
          const verified = await this.verifySelection(functionId);
          if (!verified) {
            console.warn("機能選択の検証に失敗しました");
          }
        }

        this.currentFunction = functionId;
        console.log(`✅ 機能選択完了: ${functionConfig.name}`);
        return true;
      } catch (error) {
        console.error(`❌ 機能選択エラー: ${error.message}`);
        return false;
      } finally {
        // メニューを閉じる（body clickでメニューを閉じる）
        document.body.click();
        await wait(CONFIG.timing.animationDelay);
      }
    }

    async verifySelection(functionId) {
      const functionConfig = CONFIG.functions[functionId];

      if (functionId === "none") {
        const pill = document.querySelector(
          CONFIG.selectors.function.selectedPill,
        );
        return !pill;
      }

      const pill = await waitForElement(
        CONFIG.selectors.function.selectedPill,
        3000,
      );

      if (!pill) {
        console.warn("機能選択後、ピルが表示されませんでした");
        return false;
      }

      const pillText = normalizeString(pill.textContent);
      const expectedText = normalizeString(
        functionConfig.pillText || functionConfig.name,
      );

      if (pillText.includes(expectedText.split(" ")[0])) {
        console.log(`✅ 検証成功: ${functionConfig.name}が選択されています`);
        return true;
      }

      console.warn(
        `⚠️ 検証失敗: 期待=${expectedText}, 実際=${pill.textContent}`,
      );
      return false;
    }

    async deselectAllFunctions(options = {}) {
      console.log("🔄 全ての機能を無効化中...");

      const selectedPills = document.querySelectorAll(
        CONFIG.selectors.function.selectedPill,
      );

      for (const pill of selectedPills) {
        const closeButton = pill.querySelector(
          CONFIG.selectors.function.pillCloseButton,
        );
        const clickTarget = closeButton?.parentElement || pill;
        await robustClick(clickTarget, options);
        await wait(CONFIG.timing.animationDelay);
      }

      this.currentFunction = "none";
      console.log("✅ 全ての機能を無効化しました");
      return true;
    }

    async getCurrentFunction() {
      const selectedPill = document.querySelector(
        CONFIG.selectors.function.selectedPill,
      );
      if (!selectedPill) return "none";

      const pillText = selectedPill.textContent.trim().toLowerCase();

      for (const [functionId, config] of Object.entries(CONFIG.functions)) {
        if (functionId === "none") continue;

        const expectedText = normalizeString(config.pillText || config.name);
        if (pillText.includes(expectedText.split(" ")[0])) {
          return functionId;
        }
      }

      return "none";
    }
  }

  // ===========================================
  // 統合セレクタークラス（強化版）
  // ===========================================
  class ChatGPTSelector {
    constructor() {
      this.modelSelector = new ModelSelector();
      this.functionSelector = new FunctionSelector();
    }

    async initialize() {
      console.log("🚀 ChatGPT モデル＆機能セレクターを初期化中...");

      const currentModel = await this.modelSelector.getCurrentModel();
      const currentFunction = await this.functionSelector.getCurrentFunction();

      console.log(
        `📊 現在の状態: モデル=${currentModel}, 機能=${currentFunction}`,
      );

      return {
        model: currentModel,
        function: currentFunction,
      };
    }

    async select(modelId, functionId, options = {}) {
      const { dryRun = false } = options;

      console.log(
        `🎯 選択開始: モデル=${modelId}, 機能=${functionId}${
          dryRun ? " [DryRun]" : ""
        }`,
      );

      const results = {
        model: false,
        function: false,
      };

      // モデルを選択
      if (modelId && modelId !== (await this.modelSelector.getCurrentModel())) {
        results.model = await this.modelSelector.selectModel(modelId, options);
      } else {
        results.model = true;
      }

      // 機能を選択
      if (functionId !== undefined) {
        results.function = await this.functionSelector.selectFunction(
          functionId,
          options,
        );
      } else {
        results.function = true;
      }

      console.log(
        `📊 選択結果: モデル=${results.model}, 機能=${results.function}`,
      );
      return results;
    }

    // 個別選択メソッド
    async selectModel(modelId, options = {}) {
      return await this.modelSelector.selectModel(modelId, options);
    }

    async selectFunction(functionId, options = {}) {
      return await this.functionSelector.selectFunction(functionId, options);
    }

    // 情報取得メソッド
    async getAvailableModels() {
      return CONFIG.models;
    }

    async getAvailableFunctions() {
      return CONFIG.functions;
    }

    async getCurrentSelection() {
      return {
        model: await this.modelSelector.getCurrentModel(),
        function: await this.functionSelector.getCurrentFunction(),
      };
    }

    // テストメソッド
    async runAllTests(options = {}) {
      console.log("🚀 全機能の連続テストを開始します...");

      // 全モデルのテスト
      console.log("=== モデルテスト ===");
      for (const modelId of Object.keys(CONFIG.models)) {
        await this.selectModel(modelId, options);
        await wait(1500);
      }

      // 全機能のテスト
      console.log("=== 機能テスト ===");
      for (const functionId of Object.keys(CONFIG.functions)) {
        await this.selectFunction(functionId, options);
        await wait(1500);
      }

      // 最後にデフォルトに戻す
      await this.select("gpt-4o", "none", options);
      console.log("🎉 全てのテストが完了しました");
    }
  }

  // ===========================================
  // UIコンポーネント生成（強化版）
  // ===========================================
  function createSelectorUI(containerId, options = {}) {
    const container = document.getElementById(containerId);
    if (!container) {
      console.error(`コンテナが見つかりません: ${containerId}`);
      return null;
    }

    const { enableDryRun = true } = options;

    const html = `
      <div class="chatgpt-selector-container" style="
        padding: 15px;
        background: #f8f9fa;
        border-radius: 8px;
        margin: 10px 0;
      ">
        <h4 style="margin: 0 0 15px 0; color: #10a37f;">
          🤖 ChatGPT モデル＆機能選択（強化版）
        </h4>
        
        <div style="display: flex; gap: 15px; margin-bottom: 15px;">
          <div style="flex: 1;">
            <label for="chatgpt-model-select" style="
              display: block;
              margin-bottom: 5px;
              font-weight: bold;
              color: #333;
            ">モデル選択:</label>
            <select id="chatgpt-model-select" style="
              width: 100%;
              padding: 8px;
              border: 2px solid #10a37f;
              border-radius: 4px;
              background: white;
              font-size: 14px;
            ">
              ${Object.entries(CONFIG.models)
                .map(
                  ([id, config]) =>
                    `<option value="${id}">${config.name}</option>`,
                )
                .join("")}
            </select>
            <div id="chatgpt-model-desc" style="
              margin-top: 5px;
              font-size: 12px;
              color: #666;
            ">${CONFIG.models["gpt-4o"].description}</div>
          </div>
          
          <div style="flex: 1;">
            <label for="chatgpt-function-select" style="
              display: block;
              margin-bottom: 5px;
              font-weight: bold;
              color: #333;
            ">機能選択:</label>
            <select id="chatgpt-function-select" style="
              width: 100%;
              padding: 8px;
              border: 2px solid #10a37f;
              border-radius: 4px;
              background: white;
              font-size: 14px;
            ">
              ${Object.entries(CONFIG.functions)
                .map(
                  ([id, config]) =>
                    `<option value="${id}">${config.icon} ${config.name}</option>`,
                )
                .join("")}
            </select>
            <div id="chatgpt-function-desc" style="
              margin-top: 5px;
              font-size: 12px;
              color: #666;
            ">${CONFIG.functions["none"].description}</div>
          </div>
        </div>
        
        ${
          enableDryRun
            ? `
        <div style="margin-bottom: 15px;">
          <label style="display: flex; align-items: center; gap: 5px;">
            <input type="checkbox" id="chatgpt-dryrun-mode" style="
              width: 18px;
              height: 18px;
            ">
            <span style="font-size: 14px; color: #666;">
              DryRunモード（実際の操作を行わずにログ出力のみ）
            </span>
          </label>
        </div>
        `
            : ""
        }
        
        <div style="display: flex; gap: 10px;">
          <button id="chatgpt-apply-selection" style="
            padding: 10px 20px;
            background: #10a37f;
            color: white;
            border: none;
            border-radius: 4px;
            font-weight: bold;
            cursor: pointer;
            transition: background 0.3s;
          " onmouseover="this.style.background='#0e8c6b'" 
             onmouseout="this.style.background='#10a37f'">
            適用
          </button>
          
          <button id="chatgpt-reset-selection" style="
            padding: 10px 20px;
            background: #6c757d;
            color: white;
            border: none;
            border-radius: 4px;
            font-weight: bold;
            cursor: pointer;
            transition: background 0.3s;
          " onmouseover="this.style.background='#5a6268'" 
             onmouseout="this.style.background='#6c757d'">
            リセット
          </button>
          
          <button id="chatgpt-test-all" style="
            padding: 10px 20px;
            background: #ffc107;
            color: #212529;
            border: none;
            border-radius: 4px;
            font-weight: bold;
            cursor: pointer;
            transition: background 0.3s;
          " onmouseover="this.style.background='#e0a800'" 
             onmouseout="this.style.background='#ffc107'">
            全テスト
          </button>
          
          <div id="chatgpt-selection-status" style="
            margin-left: auto;
            padding: 10px;
            color: #666;
            font-size: 14px;
          ">
            準備完了
          </div>
        </div>
      </div>
    `;

    container.innerHTML = html;

    // イベントリスナーを設定
    const modelSelect = document.getElementById("chatgpt-model-select");
    const functionSelect = document.getElementById("chatgpt-function-select");
    const modelDesc = document.getElementById("chatgpt-model-desc");
    const functionDesc = document.getElementById("chatgpt-function-desc");
    const applyButton = document.getElementById("chatgpt-apply-selection");
    const resetButton = document.getElementById("chatgpt-reset-selection");
    const testButton = document.getElementById("chatgpt-test-all");
    const statusDiv = document.getElementById("chatgpt-selection-status");
    const dryRunCheckbox = document.getElementById("chatgpt-dryrun-mode");

    // セレクタインスタンス
    const selector = new ChatGPTSelector();

    // モデル選択変更時
    modelSelect.addEventListener("change", (e) => {
      const modelConfig = CONFIG.models[e.target.value];
      modelDesc.textContent = modelConfig.description;
    });

    // 機能選択変更時
    functionSelect.addEventListener("change", (e) => {
      const functionConfig = CONFIG.functions[e.target.value];
      functionDesc.textContent = functionConfig.description;
    });

    // 適用ボタン
    applyButton.addEventListener("click", async () => {
      const modelId = modelSelect.value;
      const functionId = functionSelect.value;
      const dryRun = dryRunCheckbox?.checked || false;

      statusDiv.textContent = "適用中...";
      statusDiv.style.color = "#ffc107";

      try {
        const results = await selector.select(modelId, functionId, { dryRun });

        if (results.model && results.function) {
          statusDiv.textContent = dryRun
            ? "✅ 適用完了 (DryRun)"
            : "✅ 適用完了";
          statusDiv.style.color = "#28a745";
        } else {
          statusDiv.textContent = "⚠️ 一部失敗";
          statusDiv.style.color = "#dc3545";
        }
      } catch (error) {
        statusDiv.textContent = `❌ エラー: ${error.message}`;
        statusDiv.style.color = "#dc3545";
      }

      setTimeout(() => {
        statusDiv.textContent = "準備完了";
        statusDiv.style.color = "#666";
      }, 3000);
    });

    // リセットボタン
    resetButton.addEventListener("click", async () => {
      modelSelect.value = "gpt-4o";
      functionSelect.value = "none";
      modelDesc.textContent = CONFIG.models["gpt-4o"].description;
      functionDesc.textContent = CONFIG.functions["none"].description;

      const dryRun = dryRunCheckbox?.checked || false;

      statusDiv.textContent = "リセット中...";
      statusDiv.style.color = "#ffc107";

      try {
        await selector.select("gpt-4o", "none", { dryRun });
        statusDiv.textContent = dryRun
          ? "✅ リセット完了 (DryRun)"
          : "✅ リセット完了";
        statusDiv.style.color = "#28a745";
      } catch (error) {
        statusDiv.textContent = `❌ エラー: ${error.message}`;
        statusDiv.style.color = "#dc3545";
      }

      setTimeout(() => {
        statusDiv.textContent = "準備完了";
        statusDiv.style.color = "#666";
      }, 3000);
    });

    // 全テストボタン
    testButton.addEventListener("click", async () => {
      const dryRun = dryRunCheckbox?.checked || false;

      statusDiv.textContent = "テスト実行中...";
      statusDiv.style.color = "#ffc107";

      try {
        await selector.runAllTests({ dryRun });
        statusDiv.textContent = "✅ テスト完了";
        statusDiv.style.color = "#28a745";
      } catch (error) {
        statusDiv.textContent = `❌ エラー: ${error.message}`;
        statusDiv.style.color = "#dc3545";
      }

      setTimeout(() => {
        statusDiv.textContent = "準備完了";
        statusDiv.style.color = "#666";
      }, 3000);
    });

    return selector;
  }

  // ===========================================
  // グローバル公開
  // ===========================================
  window.ChatGPTSelector = ChatGPTSelector;
  window.createChatGPTSelectorUI = createSelectorUI;
  window.ChatGPTSelectorConfig = CONFIG;

  // 個別のユーティリティも公開
  window.ChatGPTSelectorUtils = {
    wait,
    normalizeString,
    waitForElement,
    findElementBySelectors,
    robustClick,
    showUIChangeWarning,
  };

  console.log(
    "✅ ChatGPT モデル＆機能セレクター（強化版）が利用可能になりました",
  );
  console.log("使用方法:");
  console.log("  const selector = new ChatGPTSelector();");
  console.log('  await selector.select("gpt-4o", "deep-research");');
  console.log('  await selector.select("o3-pro", "agent", { dryRun: true });');
  console.log("  または");
  console.log('  createChatGPTSelectorUI("container-id");');
})();
