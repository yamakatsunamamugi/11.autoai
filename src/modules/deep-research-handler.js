/**
 * @fileoverview DeepResearchモード処理モジュール
 * ChatGPTのDeepResearchモード（最大40分の深層調査）の処理を管理
 */

export class DeepResearchHandler {
  constructor() {
    this.DEEP_RESEARCH_TIMEOUT = 2400000; // 40分
    this.NORMAL_TIMEOUT = 180000; // 3分（通常）
    this.DEEP_RESEARCH_MODEL = "gpt-4-deep-research";
  }

  /**
   * DeepResearchモードが有効かチェック
   * @param {Object} options - オプション設定
   * @returns {boolean}
   */
  isDeepResearchEnabled(options = {}) {
    // 明示的なフラグチェック
    if (options.enableDeepResearch) {
      return true;
    }

    // URLパラメータチェック
    if (options.url && options.url.includes("model=gpt-4-deep-research")) {
      return true;
    }

    // モデル名チェック
    if (options.model === this.DEEP_RESEARCH_MODEL) {
      return true;
    }

    return false;
  }

  /**
   * タイムアウト時間を取得
   * @param {Object} options - オプション設定
   * @returns {number} タイムアウト時間（ミリ秒）
   */
  getTimeout(options = {}) {
    return this.isDeepResearchEnabled(options)
      ? this.DEEP_RESEARCH_TIMEOUT
      : this.NORMAL_TIMEOUT;
  }

  /**
   * DeepResearch用のURLを生成
   * @param {string} baseUrl - ベースURL
   * @returns {string} DeepResearch用URL
   */
  generateDeepResearchUrl(baseUrl = "https://chatgpt.com/") {
    const url = new URL(baseUrl);
    url.searchParams.set("model", this.DEEP_RESEARCH_MODEL);
    return url.toString();
  }

  /**
   * メッセージにDeepResearchフラグを追加
   * @param {Object} message - 送信するメッセージ
   * @param {boolean} enableDeepResearch - DeepResearchを有効にするか
   * @returns {Object} 更新されたメッセージ
   */
  enrichMessageWithDeepResearch(message, enableDeepResearch = false) {
    return {
      ...message,
      enableDeepResearch,
      timeout: this.getTimeout({ enableDeepResearch }),
      model: enableDeepResearch ? this.DEEP_RESEARCH_MODEL : message.model,
    };
  }

  /**
   * DeepResearchモードの状態を取得
   * @returns {Object} 現在の状態
   */
  getStatus() {
    return {
      enabled: false,
      timeout: this.NORMAL_TIMEOUT,
      model: null,
      description:
        "DeepResearchは最大40分の深層調査を行うChatGPT専用モードです",
    };
  }

  /**
   * ログ出力（DeepResearch専用）
   * @param {string} message - ログメッセージ
   * @param {string} level - ログレベル
   */
  log(message, level = "info") {
    const prefix = "🔬 [DeepResearch]";
    const timestamp = new Date().toISOString();

    switch (level) {
      case "error":
        console.error(`${prefix} ${timestamp} ${message}`);
        break;
      case "warn":
        console.warn(`${prefix} ${timestamp} ${message}`);
        break;
      default:
        console.log(`${prefix} ${timestamp} ${message}`);
    }
  }
}

// シングルトンインスタンスをエクスポート
export const deepResearchHandler = new DeepResearchHandler();
