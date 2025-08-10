// ai-url-manager.js - AI URL管理の一元化

/**
 * AI URL管理クラス
 * 全てのAI URLの取得と管理を一元化する
 */
export class AIUrlManager {
  constructor() {
    // AI設定の基本定義
    this.aiConfigs = {
      chatgpt: {
        id: "chatgpt",
        name: "ChatGPT",
        baseUrl: "https://chatgpt.com/?model=gpt-4o",
        defaultModel: "default",
        models: {
          default: {
            id: "default",
            name: "デフォルト（GPT-4o）",
            url: "https://chatgpt.com/?model=gpt-4o",
          },
          o3: {
            id: "o3",
            name: "o3",
            url: "https://chatgpt.com/?model=o3",
          },
          "o3-pro": {
            id: "o3-pro",
            name: "o3-pro",
            url: "https://chatgpt.com/?model=o3-pro",
          },
        },
        operations: {
          DeepResearch: {
            id: "DeepResearch",
            name: "DeepResearch",
            url: "https://chatgpt.com/?model=gpt-4o", // URLは変更せず、ボタン操作で対応
          },
        },
      },
      claude: {
        id: "claude",
        name: "Claude",
        baseUrl: "https://claude.ai/new",
        defaultModel: "default",
        models: {
          default: {
            id: "default",
            name: "デフォルト（Sonnet 3.5）",
            url: "https://claude.ai/new",
          },
        },
        operations: {
          DeepResearch: {
            id: "DeepResearch",
            name: "DeepResearch",
            url: "https://claude.ai/new",
          },
        },
      },
      gemini: {
        id: "gemini",
        name: "Gemini",
        baseUrl: "https://gemini.google.com/app",
        defaultModel: "default",
        models: {
          default: {
            id: "default",
            name: "デフォルト（Gemini）",
            url: "https://gemini.google.com/app",
          },
        },
        operations: {
          DeepResearch: {
            id: "DeepResearch",
            name: "DeepResearch",
            url: "https://gemini.google.com/app",
          },
        },
      },
    };

    // 現在の選択状態を保持
    this.currentSelections = {
      chatgpt: "default",
      claude: "default",
      gemini: "default",
    };
  }

  /**
   * 指定されたAIの現在のURLを取得
   * @param {string} aiType - AI種別 (chatgpt, claude, gemini)
   * @returns {string} URL
   */
  getUrl(aiType) {
    const lowerAiType = aiType.toLowerCase();
    const config = this.aiConfigs[lowerAiType];

    if (!config) {
      console.warn(`[AIUrlManager] Unknown AI type: ${aiType}`);
      return "";
    }

    const currentSelection = this.currentSelections[lowerAiType];
    console.log(`[AIUrlManager] ${aiType} - 現在の選択: ${currentSelection}`);

    // モデルまたは操作から選択されたURLを取得
    const selectedModel = config.models[currentSelection];
    const selectedOperation = config.operations[currentSelection];

    let url = "";
    if (selectedModel) {
      url = selectedModel.url;
      console.log(`[AIUrlManager] ${aiType} - モデルURL: ${url}`);
    } else if (selectedOperation) {
      url = selectedOperation.url;
      console.log(`[AIUrlManager] ${aiType} - 操作URL: ${url}`);
    } else {
      // デフォルトに戻る
      url = config.baseUrl;
      console.log(`[AIUrlManager] ${aiType} - フォールバックURL: ${url}`);
    }

    console.log(`[AIUrlManager] ${aiType} - 最終URL: ${url}`);
    return url;
  }

  /**
   * 指定されたAIのURLを直接設定
   * @param {string} aiType - AI種別
   * @param {string} url - 設定するURL
   */
  setUrl(aiType, url) {
    const lowerAiType = aiType.toLowerCase();
    if (!this.aiConfigs[lowerAiType]) {
      console.warn(`[AIUrlManager] Unknown AI type: ${aiType}`);
      return;
    }

    // URLから適切な選択を判断
    if (url.includes("gpt-4-deep-research")) {
      this.setSelection(lowerAiType, "DeepResearch");
    } else if (url.includes("o1-preview")) {
      this.setSelection(lowerAiType, "o1-preview");
    } else {
      // カスタムURLとして一時的に保持
      this.aiConfigs[lowerAiType].baseUrl = url;
      this.setSelection(lowerAiType, "default");
    }

    console.log(`[AIUrlManager] ${aiType} URL set to: ${url}`);
  }

  /**
   * 選択を更新
   * @param {string} aiType - AI種別
   * @param {string} selection - 選択されたモデル/操作ID
   */
  setSelection(aiType, selection) {
    const lowerAiType = aiType.toLowerCase();
    if (this.aiConfigs[lowerAiType]) {
      this.currentSelections[lowerAiType] = selection;
      console.log(
        `[AIUrlManager] ${aiType} selection updated to: ${selection}`,
      );
    }
  }

  /**
   * 現在の選択状態を取得
   * @param {string} aiType - AI種別
   * @returns {string} 現在の選択
   */
  getSelection(aiType) {
    const lowerAiType = aiType.toLowerCase();
    return this.currentSelections[lowerAiType] || "default";
  }

  /**
   * AI設定を取得
   * @param {string} aiType - AI種別
   * @returns {Object} AI設定
   */
  getConfig(aiType) {
    const lowerAiType = aiType.toLowerCase();
    return this.aiConfigs[lowerAiType];
  }

  /**
   * 全てのAIの現在の状態を取得
   * @returns {Object} 全AIの状態
   */
  getAllStates() {
    const states = {};

    Object.keys(this.aiConfigs).forEach((aiType) => {
      states[aiType] = {
        selection: this.currentSelections[aiType],
        url: this.getUrl(aiType),
        config: this.aiConfigs[aiType],
      };
    });

    return states;
  }

  /**
   * デバッグ情報を出力
   */
  debug() {
    console.log("[AIUrlManager] Current State:", {
      selections: this.currentSelections,
      urls: {
        chatgpt: this.getUrl("chatgpt"),
        claude: this.getUrl("claude"),
        gemini: this.getUrl("gemini"),
      },
    });
  }
}

// シングルトンインスタンスを作成してエクスポート
export const aiUrlManager = new AIUrlManager();
