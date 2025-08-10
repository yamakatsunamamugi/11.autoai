/**
 * データアダプターインターフェース
 * 様々なデータソースから入力を取得するための共通インターフェース
 */

export class IDataAdapter {
  /**
   * データを取得
   * @returns {Promise<Object>} { prompt: string, options: Object }
   */
  async getData() {
    throw new Error('getData() must be implemented by subclass');
  }

  /**
   * データソースの検証
   * @returns {Promise<boolean>}
   */
  async validate() {
    return true;
  }

  /**
   * データソースの設定
   * @param {Object} config
   */
  async configure(config) {
    this.config = config;
  }
}