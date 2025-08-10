// chatgpt-tool-control.js - ChatGPTツールモード制御モジュール

/**
 * ChatGPTツールモード制御クラス
 */
export class ChatGPTToolControl {
  constructor() {
    this.isMenuOpen = false;
    this.selectedTools = new Set();
  }

  /**
   * 既存の選択ツールを解除
   */
  async clearSelectedTools() {
    const selectedButtons = document.querySelectorAll(
      'button[data-is-selected="true"]',
    );

    if (selectedButtons.length > 0) {
      console.log(
        `[ChatGPT Tool] 選択中のツールを解除 (${selectedButtons.length}個)`,
      );

      selectedButtons.forEach((btn) => {
        const toolName =
          btn.querySelector('[data-label="true"]')?.textContent?.trim() ||
          "ツール";
        console.log(`[ChatGPT Tool] ${toolName}を解除`);
        btn.click();
      });

      // 解除処理の完了を待つ
      await new Promise((resolve) => setTimeout(resolve, 800));
    }

    return selectedButtons.length;
  }

  /**
   * ツールメニューを開く
   */
  async openToolsMenu() {
    const toolButton = Array.from(document.querySelectorAll("button")).find(
      (btn) =>
        btn.textContent?.trim() === "ツール" &&
        btn.classList.contains("composer-btn"),
    );

    if (!toolButton) {
      console.error("[ChatGPT Tool] ツールボタンが見つかりません");
      return false;
    }

    // focus + Enterキーで確実に開く
    toolButton.focus();
    const keyEvent = new KeyboardEvent("keydown", {
      key: "Enter",
      code: "Enter",
      keyCode: 13,
      bubbles: true,
    });
    toolButton.dispatchEvent(keyEvent);

    // メニューが開くまで待機
    return new Promise((resolve) => {
      let attempts = 0;
      const maxAttempts = 10;

      const checkMenu = () => {
        attempts++;
        const menuItems = document.querySelectorAll('[role="menuitemradio"]');

        if (menuItems.length > 0) {
          console.log("[ChatGPT Tool] ツールメニューが開きました");
          this.isMenuOpen = true;
          resolve(true);
        } else if (attempts >= maxAttempts) {
          console.error("[ChatGPT Tool] メニューを開けませんでした");
          resolve(false);
        } else {
          setTimeout(checkMenu, 200);
        }
      };

      setTimeout(checkMenu, 200);
    });
  }

  /**
   * 利用可能なツール一覧を取得
   */
  getAvailableTools() {
    const menuItems = document.querySelectorAll('[role="menuitemradio"]');
    const tools = [];

    menuItems.forEach((item, i) => {
      const text = item.textContent?.trim();
      const isChecked =
        item.getAttribute("aria-checked") === "true" ||
        item.getAttribute("data-state") === "checked";
      tools.push({
        index: i,
        name: text,
        selected: isChecked,
        element: item,
      });
    });

    return tools;
  }

  /**
   * 特定のツールを選択
   */
  async selectTool(toolName) {
    // 既存の選択を解除
    await this.clearSelectedTools();

    // メニューを開く
    if (!(await this.openToolsMenu())) {
      return false;
    }

    const tools = this.getAvailableTools();
    const tool = tools.find((t) =>
      t.name?.toLowerCase().includes(toolName.toLowerCase()),
    );

    if (!tool) {
      console.error(`[ChatGPT Tool] ${toolName}が見つかりません`);
      return false;
    }

    if (!tool.selected) {
      tool.element.click();
      console.log(`[ChatGPT Tool] ${toolName}を選択しました`);
    } else {
      console.log(`[ChatGPT Tool] ${toolName}は既に選択されています`);
    }

    this.selectedTools.clear();
    this.selectedTools.add(toolName);

    return true;
  }

  /**
   * 現在選択されているツールを確認
   */
  getCurrentTool() {
    const selectedBtn = document.querySelector(
      'button[data-is-selected="true"]',
    );

    if (selectedBtn) {
      const toolName = selectedBtn
        .querySelector('[data-label="true"]')
        ?.textContent?.trim();
      return toolName;
    }

    return null;
  }

  /**
   * ツールモード設定（統合用）
   */
  async enableToolMode(toolType) {
    console.log(`[ChatGPT Tool] ${toolType}モードを有効化`);

    const toolMap = {
      ChatGPTAgent: "エージェントモード",
      ChatGPTCanvas: "canvas",
      ChatGPTWebSearch: "ウェブ検索",
      ChatGPTImage: "画像を作成",
      DeepResearch: "Deep Research",
    };

    const toolName = toolMap[toolType];
    if (!toolName) {
      console.error(`[ChatGPT Tool] 未知のツールタイプ: ${toolType}`);
      return false;
    }

    return await this.selectTool(toolName);
  }

  /**
   * すべてのツールを無効化
   */
  async disableAllTools() {
    const count = await this.clearSelectedTools();
    console.log(`[ChatGPT Tool] ${count}個のツールを無効化しました`);
    this.selectedTools.clear();
    return count;
  }
}

// シングルトンインスタンスをエクスポート
export const chatGPTToolControl = new ChatGPTToolControl();
