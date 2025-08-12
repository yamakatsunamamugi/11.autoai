// reader.js - スプレッドシートデータの読み込み処理

/**
 * スプレッドシートデータリーダー
 * SheetsClientを使用してデータを読み込み、処理する
 */
class SpreadsheetReader {
  constructor() {
    this.sheetsClient = globalThis.sheetsClient || new SheetsClient();
  }

  /**
   * スプレッドシートデータを読み込んで処理
   * @param {string} spreadsheetId - スプレッドシートID
   * @param {string} gid - シートID（オプション）
   * @returns {Promise<Object>} 処理済みデータ
   */
  async readAndProcess(spreadsheetId, gid = null) {
    // SheetsClientを使用してデータを読み込み
    const rawData = await this.sheetsClient.loadAutoAIData(spreadsheetId, gid);
    
    // データ処理
    const processedData = this.processData(rawData);
    
    return processedData;
  }

  /**
   * データを処理
   * @param {Object} rawData - 生データ
   * @returns {Object} 処理済みデータ
   */
  processData(rawData) {
    // 必要に応じてデータを加工
    return {
      ...rawData,
      processed: true,
      timestamp: Date.now()
    };
  }
}

// グローバルスコープに公開
if (typeof globalThis !== 'undefined') {
  globalThis.SpreadsheetReader = SpreadsheetReader;
}