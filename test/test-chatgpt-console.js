// ========================================
// ChatGPT Console テストコード (動作確認済みコードベース)
// ========================================
// ChatGPTのページで開発者コンソールを開いて、
// このコード全体をコピー&ペーストして実行してください

(function () {
  "use strict";

  // ========================================
  // ユーティリティ関数
  // ========================================
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const log = function (message, type = "info") {
    const timestamp = new Date().toLocaleTimeString("ja-JP", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    const prefix = `[${timestamp}]`;

    switch (type) {
      case "error":
        console.error(`${prefix} ❌ ${message}`);
        break;
      case "success":
        console.log(`${prefix} ✅ ${message}`);
        break;
      case "warning":
        console.warn(`${prefix} ⚠️ ${message}`);
        break;
      case "step":
        console.log(`${prefix} 📍 ${message}`);
        break;
      default:
        console.log(`${prefix} ℹ️ ${message}`);
    }
  };

  log.error = (message) => log(message, "error");
  log.debug = (message) => log(message, "info");

  // ========================================
  // セレクター定義（提供コードより）
  // ========================================
  const SELECTORS = {
    // モデル関連
    modelButton: [
      '[data-testid="model-switcher-dropdown-button"]',
      'button[aria-label*="モデル セレクター"]',
      'button[aria-label*="モデル"][aria-haspopup="menu"]',
      "#radix-\\:r2m\\:",
      'button.group.flex.cursor-pointer[aria-haspopup="menu"]',
    ],
    modelMenu: [
      '[role="menu"][data-radix-menu-content]',
      '[role="menu"][data-state="open"]',
      'div.z-50.max-w-xs.rounded-2xl.popover[role="menu"]',
      '[aria-labelledby*="radix"][role="menu"]',
      'div[data-radix-popper-content-wrapper] [role="menu"]',
    ],
    legacyButton: [
      '[data-testid="レガシーモデル-submenu"]',
      '[role="menuitem"][data-has-submenu]:contains("レガシーモデル")',
      'div.__menu-item:contains("レガシーモデル")',
      '[role="menuitem"][aria-haspopup="menu"]:last-of-type',
    ],
    legacyMenu: [
      '[role="menu"][data-side="right"]',
      'div[data-side="right"][role="menu"]',
      '[role="menu"]:not([data-side="bottom"])',
      'div.mt-2.max-h-\\[calc\\(100vh-300px\\)\\][role="menu"]',
    ],
    // 機能関連
    menuButton: [
      '[data-testid="composer-plus-btn"]',
      'button[aria-haspopup="menu"]',
      "#radix-\\:R2eij4im4pact9a4mj5\\:",
      "button.composer-btn",
      'div[class*="leading"] button',
    ],
    mainMenu: [
      '[role="menu"][data-state="open"]',
      "[data-radix-menu-content]",
      'div[data-side="bottom"][role="menu"]',
      'div.popover[role="menu"]',
      '[role="menu"]',
    ],
    subMenu: [
      '[role="menu"][data-side="right"]',
      'div[data-side="right"][role="menu"]',
      '[data-align="start"][role="menu"]:last-of-type',
    ],
    // 入力・送信関連
    textInput: [
      ".ProseMirror",
      "#prompt-textarea",
      '[contenteditable="true"][translate="no"]',
      'div[data-virtualkeyboard="true"]',
      "div.ProseMirror.text-token-text-primary",
      ".ql-editor",
    ],
    sendButton: [
      '[data-testid="send-button"]',
      "#composer-submit-button",
      'button[aria-label="プロンプトを送信する"]',
      "button.composer-submit-btn.composer-submit-button-color",
      'button:has(svg[width="20"][height="20"])',
    ],
    stopButton: [
      '[data-testid="stop-button"]',
      '#composer-submit-button[aria-label="ストリーミングの停止"]',
      "button.composer-submit-btn.composer-secondary-button-color",
      'button:has(svg path[d*="M4.5 5.75"])',
    ],
    // 結果取得関連
    canvasText: [
      "div.markdown.prose",
      "div.w-full.pt-1.pb-1",
      "div.markdown-new-styling",
    ],
    normalText: [
      '[data-message-author-role="assistant"]',
      "div.text-message",
      "div.min-h-8.text-message",
    ],
  };

  // ========================================
  // ヘルパー関数（提供コードより）
  // ========================================

  // 装飾要素を除外したテキスト取得
  function getCleanText(element) {
    if (!element) return "";
    const clone = element.cloneNode(true);
    // 装飾要素を削除
    const decorativeElements = clone.querySelectorAll(
      "mat-icon, mat-ripple, svg, .icon, .ripple",
    );
    decorativeElements.forEach((el) => el.remove());
    return clone.textContent?.trim() || "";
  }

  // React イベントトリガー
  function triggerReactEvent(element, eventType, eventData = {}) {
    try {
      if (eventType === "click") {
        element.click();
        return true;
      } else if (eventType === "pointer") {
        const pointerDown = new PointerEvent("pointerdown", {
          bubbles: true,
          cancelable: true,
          view: window,
          ...eventData,
        });
        const pointerUp = new PointerEvent("pointerup", {
          bubbles: true,
          cancelable: true,
          view: window,
          ...eventData,
        });
        element.dispatchEvent(pointerDown);
        element.dispatchEvent(pointerUp);
        return true;
      }
      return false;
    } catch (error) {
      log(`React イベントトリガー失敗: ${error.message}`, "error");
      return false;
    }
  }

  // 要素が可視かつクリック可能かチェック
  function isElementInteractable(element) {
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      style.opacity !== "0"
    );
  }

  // 複数セレクタで要素検索（提供コードより）
  async function findElement(selectors, description, maxRetries = 3) {
    for (let retry = 0; retry < maxRetries; retry++) {
      for (const selector of selectors) {
        try {
          let element;

          if (selector.includes(":contains(")) {
            const match = selector.match(/\:contains\("([^"]+)"\)/);
            if (match) {
              const text = match[1];
              const baseSelector = selector.split(":contains(")[0];
              const elements = document.querySelectorAll(baseSelector || "*");
              element = Array.from(elements).find(
                (el) => el.textContent && el.textContent.includes(text),
              );
            }
          } else {
            element = document.querySelector(selector);
          }

          if (element && isElementInteractable(element)) {
            return element;
          }
        } catch (e) {
          // セレクタエラーを無視
        }
      }

      if (retry < maxRetries - 1) {
        await sleep(500);
      }
    }

    return null;
  }

  // テキストで要素を検索
  function findElementByText(selector, text, parent = document) {
    const elements = parent.querySelectorAll(selector);
    for (const el of elements) {
      if (el.textContent && el.textContent.includes(text)) {
        return el;
      }
    }
    return null;
  }

  // ========================================
  // ChatGPTモデル・機能検出関数（提供コードより）
  // ========================================
  async function detectChatGPTModelsAndFeatures() {
    log("🔍 ChatGPTモデル・機能検出開始", "step");

    const availableModels = [];
    const availableFunctions = [];

    try {
      // ========================================
      // モデル一覧取得
      // ========================================
      log("モデル切り替えボタンを探しています...", "step");
      const modelButton = await findElement(
        SELECTORS.modelButton,
        "モデル切り替えボタン",
      );
      if (!modelButton) {
        throw new Error("モデル切り替えボタンが見つかりません");
      }

      const currentModelText = getCleanText(modelButton);
      log(`現在のモデル: ${currentModelText}`, "info");

      triggerReactEvent(modelButton, "pointer");
      await sleep(1500);

      log("表示されたモデル一覧を取得・記録", "step");
      const modelMenu = await findElement(
        SELECTORS.modelMenu,
        "モデルメニュー",
      );
      if (!modelMenu) {
        throw new Error("モデルメニューが開きませんでした");
      }

      // メインメニューのモデル取得
      const mainMenuItems = modelMenu.querySelectorAll(
        '[role="menuitem"][data-testid^="model-switcher-"]',
      );
      mainMenuItems.forEach((item) => {
        const modelName = getCleanText(item);
        if (modelName && !modelName.includes("レガシー")) {
          availableModels.push({
            name: modelName,
            testId: item.getAttribute("data-testid"),
            type: "Current",
          });
          log(`モデル発見: ${modelName}`, "success");
        }
      });

      // レガシーモデルチェック
      const legacyButton =
        modelMenu.querySelector('[role="menuitem"][data-has-submenu]') ||
        Array.from(modelMenu.querySelectorAll('[role="menuitem"]')).find(
          (el) => el.textContent && el.textContent.includes("レガシーモデル"),
        );

      if (legacyButton) {
        log("レガシーモデルボタンをクリック", "info");
        legacyButton.click();
        await sleep(1500);

        const allMenus = document.querySelectorAll('[role="menu"]');
        allMenus.forEach((menu) => {
          if (menu !== modelMenu) {
            const items = menu.querySelectorAll('[role="menuitem"]');
            items.forEach((item) => {
              const modelName = getCleanText(item);
              if (modelName && modelName.includes("GPT")) {
                availableModels.push({
                  name: modelName,
                  type: "Legacy",
                });
                log(`レガシーモデル発見: ${modelName}`, "success");
              }
            });
          }
        });
      }

      // メニューを閉じる
      log("メニューを閉じる", "step");
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", code: "Escape" }),
      );
      await sleep(1000);

      // ========================================
      // 機能一覧取得
      // ========================================
      log("\n機能一覧の取得", "step");

      // 選択されている機能があれば解除
      log("選択されている機能があれば、すべて解除", "step");
      const selectedButtons = document.querySelectorAll(
        'button[data-pill="true"]',
      );
      selectedButtons.forEach((btn) => {
        const closeBtn = btn.querySelector('button[aria-label*="削除"]');
        if (closeBtn) closeBtn.click();
      });
      await sleep(500);

      // メニューを開く
      log("メニューを開くためのボタンをクリック", "step");
      const functionMenuButton = await findElement(
        SELECTORS.menuButton,
        "メニューボタン",
      );
      if (!functionMenuButton) {
        throw new Error("機能メニューボタンが見つかりません");
      }

      functionMenuButton.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true }),
      );
      await sleep(100);
      functionMenuButton.dispatchEvent(
        new PointerEvent("pointerup", { bubbles: true }),
      );
      await sleep(1500);

      const functionMenu = await findElement(
        SELECTORS.mainMenu,
        "メインメニュー",
      );
      if (!functionMenu) {
        throw new Error("機能メニューが開きませんでした");
      }
      log("機能メニューが開かれました", "success");

      // すべての機能の情報を取得
      log("開いたメニューからすべての機能の情報を取得", "step");

      // メインメニューの機能
      const menuItems = functionMenu.querySelectorAll('[role="menuitemradio"]');
      menuItems.forEach((item) => {
        const featureName = getCleanText(item);
        if (featureName) {
          availableFunctions.push(featureName);
          log(`機能発見: ${featureName}`, "success");
        }
      });

      // さらに表示ボタンチェック
      const moreButton = findElementByText('[role="menuitem"]', "さらに表示");
      if (moreButton) {
        log("「さらに表示」をクリック", "info");
        moreButton.click();
        await sleep(1000);

        const subMenu = document.querySelector('[data-side="right"]');
        if (subMenu) {
          const subMenuItems = subMenu.querySelectorAll(
            '[role="menuitemradio"]',
          );
          subMenuItems.forEach((item) => {
            const featureName = getCleanText(item);
            if (featureName) {
              availableFunctions.push(featureName);
              log(`サブメニュー機能発見: ${featureName}`, "success");
            }
          });
        }
      }

      // メニューを閉じる
      log("メニューを閉じる", "step");
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", code: "Escape" }),
      );
      await sleep(1000);

      const result = {
        models: availableModels,
        functions: availableFunctions,
      };

      // グローバルに検出結果を保存
      window.ChatGPTTest.detectionResult = result;

      log(
        `✅ ChatGPT検出完了 - モデル: ${availableModels.length}個, 機能: ${availableFunctions.length}個`,
        "success",
      );

      console.log("\n" + "=".repeat(60));
      console.log("📋 利用可能なモデル一覧:");
      console.log("=".repeat(60));
      availableModels.forEach((model, index) => {
        console.log(`${index}. [${model.type}] ${model.name}`);
      });

      console.log("\n" + "=".repeat(60));
      console.log("📋 利用可能な機能一覧:");
      console.log("=".repeat(60));
      console.log("0. 設定なし");
      availableFunctions.forEach((feature, index) => {
        console.log(`${index + 1}. ${feature}`);
      });

      // UIへ送信
      if (
        typeof chrome !== "undefined" &&
        chrome.runtime &&
        chrome.runtime.sendMessage
      ) {
        chrome.runtime.sendMessage(
          {
            type: "AI_MODEL_FUNCTION_UPDATE",
            aiType: "chatgpt",
            data: {
              models: availableModels.map((m) => m.name),
              functions: availableFunctions,
            },
          },
          (response) => {
            if (chrome.runtime.lastError) {
              log(
                "⚠️ UI送信エラー: " + chrome.runtime.lastError.message,
                "warning",
              );
            } else {
              log("✅ UIへの送信完了", "success");
            }
          },
        );
      }

      return result;
    } catch (error) {
      log.error(`ChatGPT検出エラー: ${error.message}`);
      return {
        models: availableModels,
        functions: availableFunctions,
      };
    }
  }

  // ========================================
  // 基本操作関数（提供コードより）
  // ========================================

  // テキスト入力
  async function inputTextChatGPT(text) {
    const input = await findElement(SELECTORS.textInput, "テキスト入力欄");
    if (!input) {
      throw new Error("入力欄が見つかりません");
    }

    // ChatGPT動作コードのテキスト入力処理をそのまま使用
    if (
      input.classList.contains("ProseMirror") ||
      input.classList.contains("ql-editor")
    ) {
      input.innerHTML = "";
      const p = document.createElement("p");
      p.textContent = text;
      input.appendChild(p);
      input.classList.remove("ql-blank");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    } else {
      input.textContent = text;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }

    log("テキスト入力完了", "success");
    await sleep(1000);
    return true;
  }

  // メッセージ送信
  async function sendMessageChatGPT() {
    const sendBtn = await findElement(SELECTORS.sendButton, "送信ボタン");
    if (!sendBtn) {
      throw new Error("送信ボタンが見つかりません");
    }

    sendBtn.click();
    log("送信ボタンをクリックしました", "success");
    await sleep(1000);
    return true;
  }

  // レスポンス待機
  async function waitForResponseChatGPT() {
    log("応答待機中...", "step");

    // 停止ボタンが表示されるまで待機
    let stopBtn = null;
    for (let i = 0; i < 30; i++) {
      stopBtn = await findElement(SELECTORS.stopButton, "停止ボタン", 1);
      if (stopBtn) {
        log("停止ボタンが表示されました", "success");
        break;
      }
      await sleep(1000);
    }

    // 停止ボタンが消えるまで待機（最大5分）
    if (stopBtn) {
      log("送信停止ボタンが消えるまで待機（最大5分）", "info");
      for (let i = 0; i < 300; i++) {
        stopBtn = await findElement(SELECTORS.stopButton, "停止ボタン", 1);
        if (!stopBtn) {
          log("応答完了", "success");
          break;
        }
        if (i % 10 === 0) {
          log(`応答待機中... (${i}秒経過)`, "info");
        }
        await sleep(1000);
      }
    }

    await sleep(2000); // 追加の待機
    return true;
  }

  // レスポンステキスト取得
  async function getResponseTextChatGPT() {
    // Canvas機能のテキスト取得
    let canvasText = "";
    const canvasContainers = document.querySelectorAll(
      "div.w-full.pt-1.pb-1, div.w-full.pt-1.pb-1.sm\\:pt-4.sm\\:pb-3",
    );
    for (const container of canvasContainers) {
      const markdownDiv = container.querySelector(
        "div.markdown.prose, div.markdown.prose.dark\\:prose-invert",
      );
      if (markdownDiv) {
        const parentMessage = markdownDiv.closest("[data-message-author-role]");
        if (!parentMessage) {
          canvasText = markdownDiv.textContent?.trim() || "";
          if (canvasText) {
            log(
              `Canvas機能のテキスト取得: ${canvasText.length}文字`,
              "success",
            );
            break;
          }
        }
      }
    }

    // 通常処理のテキスト取得
    let normalText = "";
    const assistantMessages = document.querySelectorAll(
      '[data-message-author-role="assistant"]',
    );
    if (assistantMessages.length > 0) {
      const lastMessage = assistantMessages[assistantMessages.length - 1];
      const markdownDivs = lastMessage.querySelectorAll("div.markdown");
      for (const markdownDiv of markdownDivs) {
        const text = markdownDiv.textContent?.trim() || "";
        if (text && text !== canvasText) {
          normalText = text;
          log(`通常処理のテキスト取得: ${normalText.length}文字`, "success");
          break;
        }
      }
    }

    // 優先順位：Canvasテキスト > 通常テキスト
    const responseText = canvasText || normalText;

    if (!responseText) {
      throw new Error("応答テキストが空です");
    }

    log(
      `✅ レスポンステキスト取得完了: ${responseText.substring(0, 100)}...`,
      "success",
    );
    return responseText;
  }

  // モデル選択（レガシーモデル対応版）
  async function selectModelChatGPT(modelName) {
    log(`モデル選択: ${modelName}`, "step");

    const modelBtn = await findElement(SELECTORS.modelButton, "モデルボタン");
    if (!modelBtn) {
      throw new Error("モデルボタンが見つかりません");
    }

    triggerReactEvent(modelBtn, "pointer");
    await sleep(1500);

    const modelMenuEl = await findElement(
      SELECTORS.modelMenu,
      "モデルメニュー",
    );
    if (!modelMenuEl) {
      throw new Error("モデルメニューが開きません");
    }

    // レガシーモデルかチェック
    const isLegacy =
      modelName.includes("GPT-4o") || modelName.includes("GPT-3");

    if (isLegacy) {
      // レガシーモデルメニューを開く
      const legacyButton =
        modelMenuEl.querySelector('[role="menuitem"][data-has-submenu]') ||
        Array.from(modelMenuEl.querySelectorAll('[role="menuitem"]')).find(
          (el) => el.textContent && el.textContent.includes("レガシーモデル"),
        );

      if (legacyButton) {
        log("レガシーモデルメニューを開く", "info");
        legacyButton.click();
        await sleep(1500);
      }
    }

    // すべてのメニューアイテムから検索
    const allMenuItems = document.querySelectorAll('[role="menuitem"]');
    const targetItem = Array.from(allMenuItems).find((item) => {
      const text = getCleanText(item);
      return text === modelName || text.includes(modelName);
    });

    if (targetItem) {
      targetItem.click();
      await sleep(2000);
      log(`モデル選択完了: ${modelName}`, "success");
      return true;
    } else {
      throw new Error(`指定されたモデルが見つかりません: ${modelName}`);
    }
  }

  // 機能選択
  async function selectFunctionChatGPT(functionName) {
    log(`機能選択: ${functionName}`, "step");

    const funcMenuBtn = await findElement(
      SELECTORS.menuButton,
      "メニューボタン",
    );
    if (!funcMenuBtn) {
      throw new Error("機能メニューボタンが見つかりません");
    }

    funcMenuBtn.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true }),
    );
    await sleep(100);
    funcMenuBtn.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
    await sleep(1500);

    const funcMenu = await findElement(SELECTORS.mainMenu, "メインメニュー");
    if (!funcMenu) {
      throw new Error("機能メニューが開きません");
    }

    // メインメニューで機能を探す
    let featureElement = findElementByText(
      '[role="menuitemradio"]',
      functionName,
    );

    if (!featureElement) {
      // さらに表示ボタンをクリック
      const moreBtn = findElementByText('[role="menuitem"]', "さらに表示");
      if (moreBtn) {
        moreBtn.click();
        await sleep(1000);

        const subMenu = document.querySelector('[data-side="right"]');
        if (subMenu) {
          featureElement = findElementByText(
            '[role="menuitemradio"]',
            functionName,
            subMenu,
          );
        }
      }
    }

    if (featureElement) {
      featureElement.click();
      await sleep(1500);
      log(`機能選択完了: ${functionName}`, "success");

      // メニューを閉じる
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", code: "Escape" }),
      );
      await sleep(1000);
      return true;
    } else {
      throw new Error(`指定された機能が見つかりません: ${functionName}`);
    }
  }

  // ========================================
  // 新規追加関数
  // ========================================

  // インデックスでモデル選択
  async function selectModelByIndex(index) {
    if (!window.ChatGPTTest.detectionResult) {
      throw new Error("先にdetectChatGPTModelsAndFeatures()を実行してください");
    }

    const model = window.ChatGPTTest.detectionResult.models[index];
    if (!model) {
      throw new Error(`インデックス${index}のモデルが見つかりません`);
    }

    log(`モデル選択: [${model.type}] ${model.name}`, "step");
    return await selectModelChatGPT(model.name);
  }

  // インデックスで機能選択
  async function selectFunctionByIndex(index) {
    if (!window.ChatGPTTest.detectionResult) {
      throw new Error("先にdetectChatGPTModelsAndFeatures()を実行してください");
    }

    if (index === 0) {
      log("機能選択: 設定なし", "step");
      // 既存の選択を解除
      const selectedButtons = document.querySelectorAll(
        'button[data-pill="true"]',
      );
      selectedButtons.forEach((btn) => {
        const closeBtn = btn.querySelector('button[aria-label*="削除"]');
        if (closeBtn) closeBtn.click();
      });
      return true;
    }

    const functionName =
      window.ChatGPTTest.detectionResult.functions[index - 1];
    if (!functionName) {
      throw new Error(`インデックス${index}の機能が見つかりません`);
    }

    return await selectFunctionChatGPT(functionName);
  }

  // UIへデータを送信
  function sendToUI(data) {
    if (!data) data = window.ChatGPTTest.detectionResult;

    if (
      typeof chrome !== "undefined" &&
      chrome.runtime &&
      chrome.runtime.sendMessage
    ) {
      chrome.runtime.sendMessage(
        {
          type: "AI_MODEL_FUNCTION_UPDATE",
          aiType: "chatgpt",
          data: {
            models: data.models.map((m) =>
              typeof m === "object" ? m.name : m,
            ),
            functions: data.functions,
          },
        },
        (response) => {
          if (chrome.runtime.lastError) {
            log(
              "⚠️ UI送信エラー: " + chrome.runtime.lastError.message,
              "warning",
            );
          } else {
            log("✅ UIへの送信完了", "success");
          }
        },
      );
    }
  }

  // 統合テスト実行
  async function executeFullTest(modelIndex, functionIndex, prompt) {
    log("🚀 統合テスト開始", "step");

    try {
      // 1. 検出実行（まだ実行されていない場合）
      if (!window.ChatGPTTest.detectionResult) {
        await detectChatGPTModelsAndFeatures();
      }

      // 2. モデル選択
      await selectModelByIndex(modelIndex);

      // 3. 機能選択
      await selectFunctionByIndex(functionIndex);

      // 4. プロンプト入力・送信
      await inputTextChatGPT(prompt);
      await sendMessageChatGPT();

      // 5. 応答待機・取得
      await waitForResponseChatGPT();
      const response = await getResponseTextChatGPT();

      log(`✅ テスト完了: ${response.substring(0, 100)}...`, "success");
      return response;
    } catch (error) {
      log.error(`テストエラー: ${error.message}`);
      throw error;
    }
  }

  // ========================================
  // テスト関数
  // ========================================
  async function runTests() {
    log("🎯 ChatGPTテスト開始", "step");

    try {
      // 1. モデル・機能検出テスト
      log("\n📋 テスト1: モデル・機能検出", "step");
      const detectionResult = await detectChatGPTModelsAndFeatures();
      log("検出結果:", "info");
      console.log(detectionResult);

      // 2. 基本チャットテスト
      log("\n💬 テスト2: 基本チャット機能", "step");
      await inputTextChatGPT("こんにちは！これはテストメッセージです。");
      await sendMessageChatGPT();
      await waitForResponseChatGPT();
      const response = await getResponseTextChatGPT();
      log(`チャット応答: ${response.substring(0, 200)}...`, "info");

      log("\n✅ 全テスト完了！", "success");
    } catch (error) {
      log.error(`テストエラー: ${error.message}`);
    }
  }

  // ========================================
  // グローバルに公開
  // ========================================
  window.ChatGPTTest = {
    // 検出結果を保存
    detectionResult: null,

    // 検出機能
    detectChatGPTModelsAndFeatures,

    // 基本操作
    inputTextChatGPT,
    sendMessageChatGPT,
    waitForResponseChatGPT,
    getResponseTextChatGPT,
    selectModelChatGPT,
    selectFunctionChatGPT,

    // 新規追加
    selectModelByIndex,
    selectFunctionByIndex,
    sendToUI,
    executeFullTest,

    // テスト実行
    runTests,

    // ユーティリティ
    sleep,
    log,
  };

  // ========================================
  // 使用方法の表示
  // ========================================
  console.log(`
╔════════════════════════════════════════════════════╗
║         ChatGPT コンソールテストツール             ║
╚════════════════════════════════════════════════════╝

📌 利用可能なコマンド:

1️⃣ モデル・機能の検出:
   await ChatGPTTest.detectChatGPTModelsAndFeatures()

2️⃣ 基本的なチャット:
   await ChatGPTTest.inputTextChatGPT("テストメッセージ")
   await ChatGPTTest.sendMessageChatGPT()
   await ChatGPTTest.waitForResponseChatGPT()
   await ChatGPTTest.getResponseTextChatGPT()

3️⃣ モデル選択:
   await ChatGPTTest.selectModelChatGPT("GPT-4o")

4️⃣ 機能選択:
   await ChatGPTTest.selectFunctionChatGPT("Deep Research")

5️⃣ 全機能テスト実行:
   await ChatGPTTest.runTests()

💡 ヒント:
- すべての関数は async/await で実行してください
- エラーが発生した場合は、ブラウザのコンソールで詳細を確認できます
- ChatGPTTest.log() でカスタムログを出力できます
`);

  log("✅ ChatGPTテストツールの準備完了！", "success");
})();
