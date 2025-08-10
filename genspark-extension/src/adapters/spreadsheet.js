/**
 * スプレッドシートアダプター
 * Google Sheetsからデータを取得（将来実装）
 */

import { IDataAdapter } from './interface.js';

export class SpreadsheetDataAdapter extends IDataAdapter {
  constructor() {
    super();
    this.spreadsheetId = null;
    this.range = null;
    this.apiKey = null;
  }

  /**
   * 設定
   */
  async configure(config) {
    super.configure(config);
    this.spreadsheetId = config.spreadsheetId;
    this.range = config.range || 'A1:B100';
    this.apiKey = config.apiKey;
  }

  /**
   * Google Sheets APIからデータ取得
   */
  async getData() {
    if (!this.spreadsheetId) {
      throw new Error('スプレッドシートIDが設定されていません');
    }

    try {
      // Google Sheets API v4を使用
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${this.spreadsheetId}/values/${this.range}`;
      const params = new URLSearchParams({
        key: this.apiKey,
        majorDimension: 'ROWS'
      });

      const response = await fetch(`${url}?${params}`);
      
      if (!response.ok) {
        throw new Error(`API エラー: ${response.status}`);
      }

      const data = await response.json();
      
      // データ処理（最初の未処理行を取得）
      const rows = data.values || [];
      
      for (const row of rows) {
        if (row[0] && !row[2]) { // プロンプトがあり、処理済みフラグがない
          return {
            prompt: row[0],
            options: {
              rowIndex: rows.indexOf(row),
              metadata: row[1] || ''
            }
          };
        }
      }

      throw new Error('処理可能なデータが見つかりません');
      
    } catch (error) {
      console.error('スプレッドシート取得エラー:', error);
      throw error;
    }
  }

  /**
   * 処理済みマーク（将来実装）
   */
  async markAsProcessed(rowIndex, result) {
    // Google Sheets APIを使って該当行に処理済みマークを付ける
    console.log(`Row ${rowIndex} marked as processed with result:`, result);
  }

  /**
   * 接続テスト
   */
  async validate() {
    try {
      await this.getData();
      return true;
    } catch (error) {
      console.error('検証エラー:', error);
      return false;
    }
  }
}

/**
 * アダプターファクトリー
 */
export class DataAdapterFactory {
  static async create(type = 'manual', config = {}) {
    switch (type) {
      case 'manual':
        const { ManualDataAdapter } = await import('./manual.js');
        return new ManualDataAdapter();
        
      case 'spreadsheet':
        const adapter = new SpreadsheetDataAdapter();
        await adapter.configure(config);
        return adapter;
        
      default:
        throw new Error(`Unknown adapter type: ${type}`);
    }
  }
}