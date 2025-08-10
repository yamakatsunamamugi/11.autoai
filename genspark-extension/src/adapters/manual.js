/**
 * 手動入力アダプター
 * ポップアップUIからの入力を受け取る
 */

import { IDataAdapter } from './interface.js';
import { StorageHelper } from '../core/utils.js';

export class ManualDataAdapter extends IDataAdapter {
  constructor() {
    super();
    this.storageKey = 'manualInput';
  }

  /**
   * ストレージから最新の入力を取得
   */
  async getData() {
    const storage = await StorageHelper.get([this.storageKey]);
    const data = storage[this.storageKey];
    
    if (!data || !data.prompt) {
      // デフォルト値を返す（テスト環境の場合）
      const env = await chrome.storage.local.get(['environment']);
      if (env.environment === 'test') {
        return {
          prompt: '桃太郎についてスライド4枚で解説して',
          options: {}
        };
      }
      
      throw new Error('入力データがありません。ポップアップから入力してください。');
    }
    
    return {
      prompt: data.prompt,
      options: data.options || {}
    };
  }

  /**
   * 入力データを保存
   */
  static async saveInput(prompt, options = {}) {
    await StorageHelper.set({
      manualInput: {
        prompt,
        options,
        timestamp: new Date().toISOString()
      }
    });
  }

  /**
   * 入力データをクリア
   */
  static async clearInput() {
    await StorageHelper.remove(['manualInput']);
  }
}