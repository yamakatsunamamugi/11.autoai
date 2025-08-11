// ChatGPT モデル＆機能選択システム
// モデル選択と機能選択を統合した高度な制御システム

(() => {
  "use strict";

  // ===========================================
  // 設定
  // ===========================================
  const CONFIG = {
    // モデル設定
    models: {
      "gpt-4o": {
        id: "gpt-4o",
        name: "GPT-4o (Default)",
        description: "標準的な GPT-4o モデル",
        selector: "gpt-4o",
      },
      "gpt-4o-mini": {
        id: "gpt-4o-mini",
        name: "GPT-4o Mini",
        description: "軽量版 GPT-4o",
        selector: "gpt-4o-mini",
      },
      o1: {
        id: "o1",
        name: "o1 (推論モデル)",
        description: "高度な推論が可能なモデル",
        selector: "o1",
      },
      "o1-preview": {
        id: "o1-preview",
        name: "o1-preview",
        description: "o1のプレビュー版",
        selector: "o1-preview",
      },
      "o1-mini": {
        id: "o1-mini",
        name: "o1-mini",
        description: "o1の軽量版",
        selector: "o1-mini",
      },
      o3: {
        id: "o3",
        name: "o3 (最新)",
        description: "最新の実験的モデル",
        selector: "o3",
      },
      "o3-pro": {
        id: "o3-pro",
        name: "o3-pro",
        description: "o3のプロフェッショナル版",
        selector: "o3-pro",
      },
    },

    // 機能設定
    functions: {
      none: {
        id: "none",
        name: "なし（通常モード）",
        description: "機能を使用しない",
        icon: "💬",
      },
      agent: {
        id: "agent",
        name: "エージェントモード",
        description: "自律的にタスクを実行",
        icon: "🤖",
      },
      "deep-research": {
        id: "deep-research",
        name: "Deep Research",
        description: "最大15分の深層調査",
        icon: "🔬",
      },
      canvas: {
        id: "canvas",
        name: "Canvas",
        description: "コード編集用インターフェース",
        icon: "🎨",
      },
      "web-search": {
        id: "web-search",
        name: "ウェブ検索",
        description: "インターネット検索を有効化",
        icon: "🔍",
      },
      image: {
        id: "image",
        name: "画像生成",
        description: "DALL-E 3による画像生成",
        icon: "🖼️",
      },
      connector: {
        id: "connector",
        name: "コネクター",
        description: "外部サービスとの連携",
        icon: "🔌",
      },
      learning: {
        id: "learning",
        name: "学習サポート",
        description: "あらゆる学びをサポート",
        icon: "📚",
      },
    },

    // UI設定
    ui: {
      actionDelay: 800,
      defaultTimeout: 5000,
      uiUpdateDelay: 500,
    },
  };

  // ===========================================
  // ユーティリティ関数
  // ===========================================
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const normalize = (str) => str.toLowerCase().replace(/\s+/g, "");

  const waitForElement = (selector, timeout = CONFIG.ui.defaultTimeout) => {
    return new Promise((resolve, reject) => {
      const element = document.querySelector(selector);
      if (element) return resolve(element);

      const observer = new MutationObserver(() => {
        const el = document.querySelector(selector);
        if (el) {
          observer.disconnect();
          resolve(el);
        }
      });

      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
      });

      setTimeout(() => {
        observer.disconnect();
        reject(new Error(`要素が見つかりません: ${selector}`));
      }, timeout);
    });
  };

  // ===========================================
  // モデル選択クラス
  // ===========================================
  class ModelSelector {
    constructor() {
      this.currentModel = "gpt-4o";
      this.menuButtonSelectors = [
        '[data-testid="model-switcher-dropdown-button"]',
        'button[aria-label*="モデル"]',
        'button[aria-label*="Model"]',
      ];
    }

    async getMenuButton() {
      for (const selector of this.menuButtonSelectors) {
        const button = document.querySelector(selector);
        if (button) return button;
      }
      throw new Error("モデル選択ボタンが見つかりません");
    }

    async openMenu() {
      const button = await this.getMenuButton();
      if (button.getAttribute("aria-expanded") === "true") {
        console.log("メニューは既に開いています");
        return true;
      }

      button.focus();
      button.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
      button.dispatchEvent(
        new KeyboardEvent("keyup", { key: "Enter", bubbles: true }),
      );
      await wait(CONFIG.ui.actionDelay);

      if (button.getAttribute("aria-expanded") !== "true") {
        button.click();
        await wait(CONFIG.ui.actionDelay);
      }

      return button.getAttribute("aria-expanded") === "true";
    }

    async closeMenu() {
      const button = await this.getMenuButton();
      if (button.getAttribute("aria-expanded") === "true") {
        button.click();
        await wait(CONFIG.ui.actionDelay);
      }
    }

    async selectModel(modelId) {
      const modelConfig = CONFIG.models[modelId];
      if (!modelConfig) {
        throw new Error(`不明なモデル: ${modelId}`);
      }

      console.log(`🔄 モデルを選択中: ${modelConfig.name}`);

      try {
        // メニューを開く
        await this.openMenu();

        // モデルオプションを探す
        const menuItems = document.querySelectorAll('[role="menuitem"]');
        let targetItem = null;

        for (const item of menuItems) {
          const itemText = normalize(item.textContent);
          const searchText = normalize(modelConfig.selector);

          if (itemText.includes(searchText)) {
            targetItem = item;
            break;
          }
        }

        if (!targetItem) {
          throw new Error(`モデルが見つかりません: ${modelConfig.name}`);
        }

        // モデルを選択
        targetItem.click();
        await wait(CONFIG.ui.actionDelay);

        this.currentModel = modelId;
        console.log(`✅ モデル選択完了: ${modelConfig.name}`);
        return true;
      } catch (error) {
        console.error(`❌ モデル選択エラー: ${error.message}`);
        return false;
      } finally {
        await this.closeMenu();
      }
    }

    async getCurrentModel() {
      try {
        const button = await this.getMenuButton();
        const buttonText = button.textContent.trim().toLowerCase();

        for (const [modelId, config] of Object.entries(CONFIG.models)) {
          if (buttonText.includes(config.selector.toLowerCase())) {
            return modelId;
          }
        }

        return "gpt-4o"; // デフォルト
      } catch {
        return "gpt-4o";
      }
    }
  }

  // ===========================================
  // 機能選択クラス
  // ===========================================
  class FunctionSelector {
    constructor() {
      this.currentFunction = "none";
      this.toolButtonSelectors = [
        "#system-hint-button",
        'button[aria-label*="ツールを選択"]',
        'button[aria-label*="Select tool"]',
      ];
    }

    async getToolButton() {
      for (const selector of this.toolButtonSelectors) {
        const button = document.querySelector(selector);
        if (button) return button;
      }
      return null; // ツールボタンがない場合もある
    }

    async openToolMenu() {
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

      button.click();
      await wait(CONFIG.ui.actionDelay);
      return button.getAttribute("aria-expanded") === "true";
    }

    async closeToolMenu() {
      const button = await this.getToolButton();
      if (button && button.getAttribute("aria-expanded") === "true") {
        button.click();
        await wait(CONFIG.ui.actionDelay);
      }
    }

    async selectFunction(functionId) {
      const functionConfig = CONFIG.functions[functionId];
      if (!functionConfig) {
        throw new Error(`不明な機能: ${functionId}`);
      }

      // 「なし」の場合は現在の機能を無効化
      if (functionId === "none") {
        await this.deselectAllFunctions();
        return true;
      }

      console.log(`🔄 機能を選択中: ${functionConfig.name}`);

      try {
        // ツールメニューを開く
        if (!(await this.openToolMenu())) {
          throw new Error("ツールメニューを開けませんでした");
        }

        // 機能オプションを探す
        const menuItems = document.querySelectorAll('[role="menuitemradio"]');
        let targetItem = null;

        for (const item of menuItems) {
          const itemText = normalize(item.textContent);

          // 各機能に対応するテキストをチェック
          const searchTexts = this.getFunctionSearchTexts(functionId);
          for (const searchText of searchTexts) {
            if (itemText.includes(normalize(searchText))) {
              targetItem = item;
              break;
            }
          }
          if (targetItem) break;
        }

        if (!targetItem) {
          throw new Error(`機能が見つかりません: ${functionConfig.name}`);
        }

        // 機能を選択
        targetItem.click();
        await wait(CONFIG.ui.actionDelay);

        this.currentFunction = functionId;
        console.log(`✅ 機能選択完了: ${functionConfig.name}`);
        return true;
      } catch (error) {
        console.error(`❌ 機能選択エラー: ${error.message}`);
        return false;
      } finally {
        await this.closeToolMenu();
      }
    }

    getFunctionSearchTexts(functionId) {
      const searchTexts = {
        agent: ["エージェント", "agent"],
        "deep-research": ["deep research", "リサーチ", "research"],
        canvas: ["canvas"],
        "web-search": ["ウェブ検索", "web search", "検索"],
        image: ["画像", "image", "dall-e"],
        connector: ["コネクター", "connector"],
        learning: ["学習", "learning", "勉強"],
      };

      return searchTexts[functionId] || [functionId];
    }

    async deselectAllFunctions() {
      console.log("🔄 全ての機能を無効化中...");

      // 選択されている機能ピルを探す
      const selectedPills = document.querySelectorAll(
        'button[data-is-selected="true"][data-pill="true"]',
      );

      for (const pill of selectedPills) {
        // 閉じるボタンを探す
        const closeButton = pill.querySelector(
          'svg[aria-label*="無効"], svg[aria-label*="disable"]',
        );
        if (closeButton) {
          closeButton.parentElement.click();
        } else {
          pill.click();
        }
        await wait(CONFIG.ui.uiUpdateDelay);
      }

      this.currentFunction = "none";
      console.log("✅ 全ての機能を無効化しました");
      return true;
    }

    async getCurrentFunction() {
      const selectedPill = document.querySelector(
        'button[data-is-selected="true"][data-pill="true"]',
      );
      if (!selectedPill) return "none";

      const pillText = selectedPill.textContent.trim().toLowerCase();

      for (const [functionId, config] of Object.entries(CONFIG.functions)) {
        if (functionId === "none") continue;

        const searchTexts = this.getFunctionSearchTexts(functionId);
        for (const searchText of searchTexts) {
          if (pillText.includes(searchText.toLowerCase())) {
            return functionId;
          }
        }
      }

      return "none";
    }
  }

  // ===========================================
  // 統合セレクタークラス
  // ===========================================
  class ChatGPTSelector {
    constructor() {
      this.modelSelector = new ModelSelector();
      this.functionSelector = new FunctionSelector();
    }

    async initialize() {
      console.log("🚀 ChatGPT モデル＆機能セレクターを初期化中...");

      // 現在の選択状態を取得
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

    async select(modelId, functionId) {
      console.log(`🎯 選択開始: モデル=${modelId}, 機能=${functionId}`);

      const results = {
        model: false,
        function: false,
      };

      // モデルを選択
      if (modelId && modelId !== (await this.modelSelector.getCurrentModel())) {
        results.model = await this.modelSelector.selectModel(modelId);
      } else {
        results.model = true;
      }

      // 機能を選択
      if (functionId !== undefined) {
        results.function =
          await this.functionSelector.selectFunction(functionId);
      } else {
        results.function = true;
      }

      console.log(
        `📊 選択結果: モデル=${results.model}, 機能=${results.function}`,
      );
      return results;
    }

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
  }

  // ===========================================
  // UIコンポーネント生成
  // ===========================================
  function createSelectorUI(containerId) {
    const container = document.getElementById(containerId);
    if (!container) {
      console.error(`コンテナが見つかりません: ${containerId}`);
      return null;
    }

    const html = `
      <div class="chatgpt-selector-container" style="
        padding: 15px;
        background: #f8f9fa;
        border-radius: 8px;
        margin: 10px 0;
      ">
        <h4 style="margin: 0 0 15px 0; color: #10a37f;">
          🤖 ChatGPT モデル＆機能選択
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
    const statusDiv = document.getElementById("chatgpt-selection-status");

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

      statusDiv.textContent = "適用中...";
      statusDiv.style.color = "#ffc107";

      try {
        const results = await selector.select(modelId, functionId);

        if (results.model && results.function) {
          statusDiv.textContent = "✅ 適用完了";
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

      statusDiv.textContent = "リセット中...";
      statusDiv.style.color = "#ffc107";

      try {
        await selector.select("gpt-4o", "none");
        statusDiv.textContent = "✅ リセット完了";
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

  console.log("✅ ChatGPT モデル＆機能セレクターが利用可能になりました");
  console.log("使用方法:");
  console.log("  const selector = new ChatGPTSelector();");
  console.log('  await selector.select("gpt-4o", "deep-research");');
  console.log("  または");
  console.log('  createChatGPTSelectorUI("container-id");');
})();
