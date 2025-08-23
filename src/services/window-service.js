/**
 * @fileoverview ウィンドウ管理サービス
 * 
 * Chrome拡張機能のウィンドウ操作を一元管理するサービスクラス。
 * ウィンドウの作成、位置計算、管理、タブ操作などの機能を提供。
 * 
 * @class WindowService
 */

export class WindowService {
  // アクティブなウィンドウを管理するMap
  static activeWindows = new Map();
  
  // AI種別とURLのマッピング
  static AI_URLS = {
    chatgpt: 'https://chatgpt.com',
    claude: 'https://claude.ai',
    gemini: 'https://gemini.google.com',
    genspark: 'https://www.genspark.ai'
  };
  
  // デフォルトのウィンドウ設定
  static DEFAULT_WINDOW_OPTIONS = {
    type: 'popup',
    focused: true,  // デフォルトで最前面に表示
    state: 'normal'
  };
  
  // ===== ウィンドウ作成機能 =====
  
  /**
   * AIウィンドウを作成
   * @param {string} url - ウィンドウで開くURL
   * @param {Object} options - ウィンドウオプション
   * @returns {Promise<Object>} 作成されたウィンドウオブジェクト
   */
  static async createAIWindow(url, options = {}) {
    console.log('[WindowService] AIウィンドウ作成:', url);
    
    const windowOptions = {
      ...this.DEFAULT_WINDOW_OPTIONS,
      ...options,
      url: url,
      focused: true  // AIウィンドウは常に最前面
    };
    
    try {
      const window = await chrome.windows.create(windowOptions);
      
      // ウィンドウ情報を登録
      this.registerWindow(window.id, {
        url: url,
        type: 'ai',
        createdAt: Date.now(),
        ...options
      });
      
      console.log('[WindowService] AIウィンドウ作成成功:', window.id);
      return window;
    } catch (error) {
      console.error('[WindowService] AIウィンドウ作成エラー:', error);
      throw error;
    }
  }
  
  /**
   * テストウィンドウを作成
   * @param {string} url - ウィンドウで開くURL
   * @param {Object} options - ウィンドウオプション
   * @returns {Promise<Object>} 作成されたウィンドウオブジェクト
   */
  static async createTestWindow(url, options = {}) {
    console.log('[WindowService] テストウィンドウ作成:', url);
    
    const windowOptions = {
      ...this.DEFAULT_WINDOW_OPTIONS,
      ...options,
      url: url,
      type: 'popup'
    };
    
    try {
      const window = await chrome.windows.create(windowOptions);
      
      this.registerWindow(window.id, {
        url: url,
        type: 'test',
        createdAt: Date.now(),
        ...options
      });
      
      console.log('[WindowService] テストウィンドウ作成成功:', window.id);
      return window;
    } catch (error) {
      console.error('[WindowService] テストウィンドウ作成エラー:', error);
      throw error;
    }
  }
  
  /**
   * 汎用ウィンドウを作成
   * @param {string} url - ウィンドウで開くURL
   * @param {Object} options - ウィンドウオプション
   * @returns {Promise<Object>} 作成されたウィンドウオブジェクト
   */
  static async createWindow(url, options = {}) {
    console.log('[WindowService] ウィンドウ作成:', url);
    
    const windowOptions = {
      ...this.DEFAULT_WINDOW_OPTIONS,
      ...options,
      url: url
    };
    
    try {
      const window = await chrome.windows.create(windowOptions);
      
      this.registerWindow(window.id, {
        url: url,
        type: 'general',
        createdAt: Date.now(),
        ...options
      });
      
      return window;
    } catch (error) {
      console.error('[WindowService] ウィンドウ作成エラー:', error);
      throw error;
    }
  }
  
  // ===== ウィンドウ位置計算機能 =====
  
  /**
   * スクリーン情報を取得
   * @returns {Promise<Object>} スクリーン情報
   */
  static async getScreenInfo() {
    try {
      const displays = await chrome.system.display.getInfo();
      const primaryDisplay = displays.find(d => d.isPrimary) || displays[0];
      
      return {
        width: primaryDisplay.workArea.width,
        height: primaryDisplay.workArea.height,
        left: primaryDisplay.workArea.left,
        top: primaryDisplay.workArea.top,
        displays: displays
      };
    } catch (error) {
      console.error('[WindowService] スクリーン情報取得エラー:', error);
      // フォールバック値
      return {
        width: 1440,
        height: 900,
        left: 0,
        top: 0,
        displays: []
      };
    }
  }
  
  /**
   * ウィンドウ位置を計算
   * @param {string} position - 位置（left, right, center, etc）
   * @param {Object} screenInfo - スクリーン情報
   * @returns {Object} 位置とサイズ
   */
  static calculateWindowPosition(position, screenInfo) {
    const baseWidth = Math.floor(screenInfo.width * 0.35);
    const baseHeight = Math.floor(screenInfo.height * 0.8);
    
    switch (position) {
      case 'left':
        return {
          left: screenInfo.left + 20,
          top: screenInfo.top + 50,
          width: baseWidth,
          height: baseHeight
        };
        
      case 'right':
        return {
          left: screenInfo.left + screenInfo.width - baseWidth - 20,
          top: screenInfo.top + 50,
          width: baseWidth,
          height: baseHeight
        };
        
      case 'center':
        return {
          left: screenInfo.left + Math.floor((screenInfo.width - baseWidth) / 2),
          top: screenInfo.top + Math.floor((screenInfo.height - baseHeight) / 2),
          width: baseWidth,
          height: baseHeight
        };
        
      default:
        // デフォルトは中央
        return this.calculateWindowPosition('center', screenInfo);
    }
  }
  
  /**
   * モニター番号から位置を計算
   * @param {number} monitorNumber - モニター番号
   * @param {Object} screenInfo - スクリーン情報
   * @returns {Object} 位置とサイズ
   */
  static calculateWindowPositionFromNumber(monitorNumber, screenInfo) {
    const displays = screenInfo.displays || [];
    
    // モニター番号が範囲内かチェック
    if (monitorNumber > 0 && monitorNumber <= displays.length) {
      const display = displays[monitorNumber - 1];
      const width = Math.floor(display.workArea.width * 0.35);
      const height = Math.floor(display.workArea.height * 0.8);
      
      return {
        left: display.workArea.left + Math.floor((display.workArea.width - width) / 2),
        top: display.workArea.top + Math.floor((display.workArea.height - height) / 2),
        width: width,
        height: height
      };
    }
    
    // フォールバック: デフォルト位置
    return this.calculateWindowPosition('center', screenInfo);
  }
  
  /**
   * 4分割レイアウトを計算
   * @param {Object} screenInfo - スクリーン情報
   * @returns {Object} 4つのウィンドウ位置
   */
  static calculateQuadLayout(screenInfo) {
    const halfWidth = Math.floor(screenInfo.width / 2);
    const halfHeight = Math.floor(screenInfo.height / 2);
    
    return {
      topLeft: {
        left: screenInfo.left,
        top: screenInfo.top,
        width: halfWidth,
        height: halfHeight
      },
      topRight: {
        left: screenInfo.left + halfWidth,
        top: screenInfo.top,
        width: halfWidth,
        height: halfHeight
      },
      bottomLeft: {
        left: screenInfo.left,
        top: screenInfo.top + halfHeight,
        width: halfWidth,
        height: halfHeight
      },
      bottomRight: {
        left: screenInfo.left + halfWidth,
        top: screenInfo.top + halfHeight,
        width: halfWidth,
        height: halfHeight
      }
    };
  }
  
  // ===== AI URL管理 =====
  
  /**
   * AI種別からURLを取得
   * @param {string} aiType - AI種別
   * @returns {string} URL
   */
  static getAIUrl(aiType) {
    const normalizedType = aiType.toLowerCase();
    return this.AI_URLS[normalizedType] || this.AI_URLS.chatgpt;
  }
  
  /**
   * AI種別を判定
   * @param {string} url - URL
   * @returns {string} AI種別
   */
  static determineAIType(url) {
    if (url.includes('chatgpt.com') || url.includes('chat.openai.com')) {
      return 'chatgpt';
    } else if (url.includes('claude.ai')) {
      return 'claude';
    } else if (url.includes('gemini.google.com')) {
      return 'gemini';
    } else if (url.includes('genspark')) {
      return 'genspark';
    }
    return 'unknown';
  }
  
  // ===== ウィンドウ管理機能 =====
  
  /**
   * ウィンドウを登録
   * @param {number} windowId - ウィンドウID
   * @param {Object} info - ウィンドウ情報
   */
  static registerWindow(windowId, info) {
    this.activeWindows.set(windowId, info);
    console.log('[WindowService] ウィンドウ登録:', windowId, info);
  }
  
  /**
   * ウィンドウを削除
   * @param {number} windowId - ウィンドウID
   * @returns {Promise<void>}
   */
  static async closeWindow(windowId) {
    try {
      await chrome.windows.remove(windowId);
      this.activeWindows.delete(windowId);
      console.log('[WindowService] ウィンドウ削除:', windowId);
    } catch (error) {
      console.error('[WindowService] ウィンドウ削除エラー:', error);
      // ウィンドウが既に閉じられている場合もMapから削除
      this.activeWindows.delete(windowId);
    }
  }
  
  /**
   * すべてのウィンドウを閉じる
   * @returns {Promise<void>}
   */
  static async closeAllWindows() {
    console.log('[WindowService] すべてのウィンドウを閉じる:', this.activeWindows.size);
    
    const closePromises = [];
    for (const [windowId] of this.activeWindows) {
      closePromises.push(this.closeWindow(windowId));
    }
    
    await Promise.allSettled(closePromises);
    this.activeWindows.clear();
    console.log('[WindowService] すべてのウィンドウを閉じました');
  }
  
  /**
   * ウィンドウにフォーカス
   * @param {number} windowId - ウィンドウID
   * @returns {Promise<void>}
   */
  static async focusWindow(windowId) {
    try {
      await chrome.windows.update(windowId, {
        focused: true,
        drawAttention: true,
        state: 'normal'
      });
      console.log('[WindowService] ウィンドウフォーカス:', windowId);
    } catch (error) {
      console.error('[WindowService] ウィンドウフォーカスエラー:', error);
    }
  }
  
  /**
   * ウィンドウ情報を取得
   * @param {number} windowId - ウィンドウID
   * @returns {Object|null} ウィンドウ情報
   */
  static getWindowInfo(windowId) {
    return this.activeWindows.get(windowId) || null;
  }
  
  // ===== タブ管理機能 =====
  
  /**
   * タブをアクティブにする
   * @param {number} tabId - タブID
   * @returns {Promise<void>}
   */
  static async activateTab(tabId) {
    try {
      await chrome.tabs.update(tabId, { active: true });
      console.log('[WindowService] タブアクティブ化:', tabId);
    } catch (error) {
      console.error('[WindowService] タブアクティブ化エラー:', error);
    }
  }
  
  /**
   * タブにメッセージを送信
   * @param {number} tabId - タブID
   * @param {Object} message - メッセージ
   * @returns {Promise<Object>} レスポンス
   */
  static async sendMessageToTab(tabId, message) {
    try {
      const response = await chrome.tabs.sendMessage(tabId, message);
      console.log('[WindowService] タブメッセージ送信成功:', tabId);
      return response;
    } catch (error) {
      console.error('[WindowService] タブメッセージ送信エラー:', error);
      throw error;
    }
  }
  
  /**
   * タブ情報を取得
   * @param {number} tabId - タブID
   * @returns {Promise<Object>} タブ情報
   */
  static async getTabInfo(tabId) {
    try {
      const tab = await chrome.tabs.get(tabId);
      return tab;
    } catch (error) {
      console.error('[WindowService] タブ情報取得エラー:', error);
      return null;
    }
  }
  
  // ===== ユーティリティ =====
  
  /**
   * アクティブなウィンドウ数を取得
   * @returns {number} ウィンドウ数
   */
  static getActiveWindowCount() {
    return this.activeWindows.size;
  }
  
  /**
   * すべてのアクティブウィンドウIDを取得
   * @returns {Array<number>} ウィンドウIDの配列
   */
  static getActiveWindowIds() {
    return Array.from(this.activeWindows.keys());
  }
  
  /**
   * デバッグ情報を出力
   */
  static debug() {
    console.log('[WindowService] デバッグ情報:');
    console.log('  アクティブウィンドウ数:', this.activeWindows.size);
    console.log('  ウィンドウ一覧:');
    for (const [id, info] of this.activeWindows) {
      console.log(`    - ID: ${id}, Type: ${info.type}, URL: ${info.url}`);
    }
  }
}

// デフォルトエクスポート
export default WindowService;