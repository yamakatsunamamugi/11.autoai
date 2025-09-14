/**
 * @fileoverview ウィンドウ管理サービス
 *
 * Chrome拡張機能のウィンドウ操作を一元管理するサービスクラス。
 * ウィンドウの作成、位置計算、管理、タブ操作などの機能を提供。
 *
 * @class WindowService
 */

// RetryManagerのインポート（グローバル関数として利用）
import '../../automations/1-ai-common-base.js';

export class WindowService {

  // RetryManagerの初期化
  static retryManager = null;

  static getRetryManager() {
    if (!this.retryManager) {
      const aiCommonBase = globalThis.getGlobalAICommonBase?.() || window?.getGlobalAICommonBase?.();
      this.retryManager = aiCommonBase?.RetryManager;
    }
    return this.retryManager;
  }
  
  // アクティブなウィンドウを管理するMap
  static activeWindows = new Map();
  
  // ウィンドウポジション管理 (0-3の位置を管理)
  static windowPositions = new Map();
  
  // ポジションごとのウィンドウID管理
  static positionToWindow = new Map();
  
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
    const startTime = performance.now();
    console.log('[WindowService] AIウィンドウ作成開始:', url);
    
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
      
      const totalTime = (performance.now() - startTime).toFixed(0);
      return window;
    } catch (error) {
      const totalTime = (performance.now() - startTime).toFixed(0);
      console.error(`[WindowService] AIウィンドウ作成エラー (${totalTime}ms):`, error);
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
      
      return window;
    } catch (error) {
      console.error('[WindowService] テストウィンドウ作成エラー:', error);
      throw error;
    }
  }
  
  /**
   * 汎用ウィンドウを作成
   * @param {Object} options - ウィンドウオプション（urlを含む）
   * @returns {Promise<Object>} 作成されたウィンドウオブジェクト
   */
  static async createWindow(options = {}) {
    console.log('[WindowService] ウィンドウ作成:', options.url);
    
    const windowOptions = {
      ...this.DEFAULT_WINDOW_OPTIONS,
      ...options
    };
    
    try {
      const window = await chrome.windows.create(windowOptions);
      
      this.registerWindow(window.id, {
        url: options.url,
        type: 'general',
        createdAt: Date.now(),
        ...options
      });

      // タブIDを取得してwindowオブジェクトに追加
      const tabId = window.tabs && window.tabs.length > 0 ? window.tabs[0].id : null;

      return {
        ...window,
        tabId: tabId,
        windowId: window.id
      };
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
      
      // デバッグ: ディスプレイ情報を詳しくログ出力
      // console.log('[WindowService] ディスプレイ情報:', {
      //   displayCount: displays.length,
      //   primaryDisplay: {
      //     id: primaryDisplay.id,
      //     bounds: primaryDisplay.bounds,
      //     workArea: primaryDisplay.workArea,
      //     isPrimary: primaryDisplay.isPrimary
      //   }
      // });
      
      const screenInfo = {
        width: primaryDisplay.workArea.width,
        height: primaryDisplay.workArea.height,
        left: primaryDisplay.workArea.left,
        top: primaryDisplay.workArea.top,
        displays: displays
      };
      
      // console.log('[WindowService] スクリーン情報:', screenInfo);
      
      return screenInfo;
    } catch (error) {
      console.error('[WindowService] スクリーン情報取得エラー:', error);
      // フォールバック値
      const fallback = {
        width: 1440,
        height: 900,
        left: 0,
        top: 0,
        displays: []
      };
      // console.log('[WindowService] フォールバック値を使用:', fallback);
      return fallback;
    }
  }
  
  /**
   * ウィンドウ位置を計算
   * @param {string|number} position - 位置（left, right, center, または 0-3の数値）
   * @param {Object} screenInfo - スクリーン情報
   * @returns {Object} 位置とサイズ
   */
  static calculateWindowPosition(position, screenInfo) {
    const baseWidth = Math.floor(screenInfo.width * 0.35);
    const baseHeight = Math.floor(screenInfo.height * 0.8);
    
    // console.log('[WindowService] 位置計算開始:', {
    //   position,
    //   screenInfo,
    //   baseWidth,
    //   baseHeight
    // });
    
    // 画面全体を使用（余白なし）
    const offsetLeft = screenInfo.left;  // 余白なし（通常は0）
    const offsetTop = screenInfo.top;     // メニューバーの高さ（通常は25）
    
    // 数値のpositionを処理（4分割レイアウト用）
    if (typeof position === 'number') {
      const quarterWidth = Math.floor(screenInfo.width / 4);
      const quarterHeight = Math.floor(screenInfo.height / 2);
      const halfWidth = Math.floor(screenInfo.width / 2);
      const halfHeight = Math.floor(screenInfo.height / 2);
      
      let calculatedPosition;
      
      switch (position) {
        case 0: // 左上
          calculatedPosition = {
            left: offsetLeft,
            top: offsetTop,
            width: halfWidth,
            height: halfHeight
          };
          break;
        case 1: // 右上
          calculatedPosition = {
            left: offsetLeft + halfWidth,
            top: offsetTop,
            width: halfWidth,
            height: halfHeight
          };
          break;
        case 2: // 左下
          calculatedPosition = {
            left: offsetLeft,
            top: offsetTop + halfHeight,
            width: halfWidth,
            height: halfHeight
          };
          break;
        case 3: // 右下
          calculatedPosition = {
            left: offsetLeft + halfWidth,
            top: offsetTop + halfHeight,
            width: halfWidth,
            height: halfHeight
          };
          break;
        default:
          // 4以上の数値の場合は中央に配置
          return this.calculateWindowPosition('center', screenInfo);
      }
      
      // console.log(`[WindowService] ポジション${position}の計算結果:`, calculatedPosition);
      return calculatedPosition;
    }
    
    // 文字列のpositionを処理
    switch (position) {
      case 'left':
        return {
          left: offsetLeft,
          top: offsetTop,
          width: baseWidth,
          height: baseHeight
        };
        
      case 'right':
        return {
          left: offsetLeft + screenInfo.width - baseWidth,
          top: offsetTop,
          width: baseWidth,
          height: baseHeight
        };
        
      case 'center':
        return {
          left: offsetLeft + Math.floor((screenInfo.width - baseWidth) / 2),
          top: offsetTop + Math.floor((screenInfo.height - baseHeight) / 2),
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
    
    // ポジション情報がある場合は登録
    if (info.position !== undefined && info.position >= 0 && info.position < 4) {
      this.windowPositions.set(info.position, windowId);
      this.positionToWindow.set(windowId, info.position);
    }
    
    // console.log('[WindowService] ウィンドウ登録:', windowId, info);
  }
  
  /**
   * ウィンドウを削除
   * @param {number} windowId - ウィンドウID
   * @param {Function} onClosed - ウィンドウ閉じ後のコールバック関数
   * @returns {Promise<void>}
   */
  static async closeWindow(windowId, onClosed = null) {
    // 必ずポジションを解放（エラーが発生しても実行）
    const releasePosition = () => {
      // ポジション情報をクリア
      const position = this.positionToWindow.get(windowId);
      if (position !== undefined) {
        this.windowPositions.delete(position);
        this.positionToWindow.delete(windowId);
        console.log(`[WindowService] ポジション${position}を解放しました`);
      }
      
      // アクティブウィンドウから削除
      this.activeWindows.delete(windowId);
    };
    
    try {
      // ウィンドウの存在確認
      await chrome.windows.get(windowId);
      await chrome.windows.remove(windowId);
      console.log('[WindowService] ウィンドウ削除:', windowId);
    } catch (error) {
      // ウィンドウが既に閉じられている場合は正常な動作
      if (error.message.includes('No window with id') || error.message.includes('not found')) {
        console.warn('[WindowService] ウィンドウは既に閉じられています:', windowId);
      } else {
        console.error('[WindowService] ウィンドウ削除エラー:', error);
      }
    } finally {
      // エラーが発生してもポジションは必ず解放
      releasePosition();
      
      // コールバックを実行
      if (onClosed && typeof onClosed === 'function') {
        try {
          await onClosed(windowId);
        } catch (callbackError) {
          console.error('[WindowService] ウィンドウ閉じ後コールバックエラー:', callbackError);
        }
      }
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
   * 利用可能なポジションを検索
   * @returns {number} 空きポジション（0-3）、なければ-1
   */
  static findAvailablePosition() {
    for (let i = 0; i < 4; i++) {
      if (!this.windowPositions.has(i)) {
        console.log(`[WindowService] 利用可能なポジション: ${i}`);
        return i;
      }
    }
    console.warn('[WindowService] 利用可能なポジションがありません');
    return -1;
  }
  
  /**
   * ポジションを指定してウィンドウを作成
   * @param {string} url - URL
   * @param {number} position - ポジション（0-3）
   * @param {Object} options - 追加オプション
   * @returns {Promise<Object>} ウィンドウオブジェクト
   */
  static async createWindowWithPosition(url, position, options = {}) {
    // ポジションが既に使用中かチェック
    if (this.windowPositions.has(position)) {
      const existingWindowId = this.windowPositions.get(position);
      console.warn(`[WindowService] ポジション${position}は既に使用中: Window${existingWindowId}`);
      
      // 既存ウィンドウを閉じて完全に削除されるまで待機
      await this.closeWindow(existingWindowId);
      
      // 削除完了を確認するための追加待機（競合回避）
      await new Promise(resolve => setTimeout(resolve, 500));
      console.log(`[WindowService] ポジション${position}の削除完了確認、新規作成開始`);
    }
    
    // スクリーン情報を取得
    const screenInfo = await this.getScreenInfo();
    const positionInfo = this.calculateWindowPosition(position, screenInfo);
    
    // optionsからChrome APIが認識しないプロパティを除外
    const { aiType, ...chromeOptions } = options || {};
    
    // ウィンドウを作成（aiTypeを除外したオプションを使用）
    const windowOptions = {
      ...this.DEFAULT_WINDOW_OPTIONS,
      ...positionInfo,
      ...chromeOptions,  // aiTypeを除外したオプションを使用
      url: url,
      focused: true
    };
    
    // デバッグ: Chrome APIに渡すオプションをログ出力
    // console.log('[WindowService] chrome.windows.create オプション:', {
    //   url: windowOptions.url,
    //   type: windowOptions.type,
    //   left: windowOptions.left,
    //   top: windowOptions.top,
    //   width: windowOptions.width,
    //   height: windowOptions.height,
    //   focused: windowOptions.focused,
    //   state: windowOptions.state
    // });
    
    const createStartTime = performance.now();
    
    try {
      const window = await chrome.windows.create(windowOptions);
      
      const createTime = (performance.now() - createStartTime).toFixed(0);
      
      // Chrome APIが位置を正しく適用しない場合のみ更新
      // 作成されたウィンドウの位置をチェック
      const createdWindow = await chrome.windows.get(window.id);
      const needsPositionUpdate = 
        Math.abs(createdWindow.left - positionInfo.left) > 10 ||
        Math.abs(createdWindow.top - positionInfo.top) > 10;
      
      if (needsPositionUpdate && positionInfo.left !== undefined && positionInfo.top !== undefined) {
        const updateStartTime = performance.now();
        console.log(`[WindowService] ウィンドウ位置補正が必要: 期待=${positionInfo.left},${positionInfo.top} 実際=${createdWindow.left},${createdWindow.top}`);
        
        try {
          await chrome.windows.update(window.id, {
            left: positionInfo.left,
            top: positionInfo.top,
            width: positionInfo.width,
            height: positionInfo.height,
            focused: true
          });
          const updateTime = (performance.now() - updateStartTime).toFixed(0);
          console.log(`[WindowService] ウィンドウ位置補正完了 (${updateTime}ms)`);
        } catch (updateError) {
          console.warn('[WindowService] ウィンドウ位置の更新に失敗:', updateError);
        }
      }
      
      // ウィンドウ情報を登録（ポジション情報を含む）
      this.registerWindow(window.id, {
        url: url,
        position: position,
        type: chromeOptions.type || 'general',
        aiType: aiType,  // 内部管理用に保存
        createdAt: Date.now(),
        ...chromeOptions
      });
      
      // ウィンドウ作成後にページが読み込まれるまで待機
      if (window.tabs && window.tabs.length > 0) {
        const tabId = window.tabs[0].id;

        const retryManager = this.getRetryManager();
        if (retryManager && retryManager.executeSimpleRetry) {
          await retryManager.executeSimpleRetry({
            action: async () => {
              const tab = await chrome.tabs.get(tabId);
              if (tab.status === 'complete') {
                console.log(`[WindowService] ポジション${position}のタブ読み込み完了`);
                return true;
              }
              return null;
            },
            isSuccess: (result) => result === true,
            maxRetries: 10,
            interval: 500,
            actionName: 'タブ読み込み待機',
            context: { tabId, position, url }
          });
        } else {
          // フォールバック: 簡易的なリトライ実装
          const maxRetries = 10;
          for (let i = 0; i < maxRetries; i++) {
            try {
              const tab = await chrome.tabs.get(tabId);
              if (tab.status === 'complete') {
                console.log(`[WindowService] ポジション${position}のタブ読み込み完了`);
                break;
              }
            } catch (e) {
              // タブが見つからない場合は継続
            }
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        }

        // 追加待機（動的コンテンツの生成を待つ）
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      
      return window;
    } catch (error) {
      console.error('[WindowService] ウィンドウ作成エラー:', error);
      throw error;
    }
  }
  
  /**
   * デバッグ情報を出力
   */
  static debug() {
    console.log('[WindowService] デバッグ情報:');
    console.log('  アクティブウィンドウ数:', this.activeWindows.size);
    console.log('  使用中ポジション:', Array.from(this.windowPositions.keys()).sort());
    console.log('  ウィンドウ一覧:');
    for (const [id, info] of this.activeWindows) {
      const position = this.positionToWindow.get(id);
      console.log(`    - ID: ${id}, Position: ${position ?? 'なし'}, Type: ${info.type}, URL: ${info.url}`);
    }
  }
  
  /**
   * すべてのポジションをクリア
   */
  static clearAllPositions() {
    this.windowPositions.clear();
    this.positionToWindow.clear();
    console.log('[WindowService] すべてのポジションをクリアしました');
  }

  // ===== AIサイト一括管理機能 =====

  /**
   * AIサイトを一括で開く（統合機能）
   * 既存チェック、4分割レイアウト、エラーハンドリングを統合
   */
  static async openAllAISites() {
    console.log('[WindowService] AIサイト一括オープン開始');
    const startTime = performance.now();

    try {
      // Step 1: 現在開いているタブをチェック
      const tabs = await new Promise((resolve, reject) => {
        chrome.tabs.query({}, (tabs) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve(tabs);
          }
        });
      });

      // Step 2: AIサイト定義（4分割レイアウト）
      const aiSites = [
        { name: 'ChatGPT', url: this.AI_URLS.chatgpt, position: 0 },  // 左上
        { name: 'Claude', url: this.AI_URLS.claude, position: 1 },    // 右上
        { name: 'Gemini', url: this.AI_URLS.gemini, position: 2 }     // 左下
      ];

      // Step 3: 既に開いているAIサイトをチェック
      const openAISites = aiSites.filter(site =>
        tabs.some(tab => tab.url && tab.url.includes(site.url.replace('https://', '')))
      );

      console.log(`[WindowService] 既に開かれているAIサイト: ${openAISites.length}/3`);
      console.log(`[WindowService] 開かれているサイト: ${openAISites.map(s => s.name).join(', ') || 'なし'}`);

      // Step 4: 未開放サイトを4分割レイアウトで作成
      const createdWindows = [];
      const unopenedSites = aiSites.filter(site =>
        !openAISites.some(openSite => openSite.name === site.name)
      );

      if (unopenedSites.length === 0) {
        console.log('[WindowService] すべてのAIサイトが既に開かれています');
        return { success: true, created: 0, existing: 3 };
      }

      for (const site of unopenedSites) {
        try {
          console.log(`[WindowService] ${site.name}を位置${site.position}に作成中...`);

          // WindowServiceの既存機能を使用
          const window = await this.createWindowWithPosition(site.url, site.position, {
            type: 'popup',
            focused: false  // 連続作成時は最前面にしない
          });

          createdWindows.push({
            name: site.name,
            windowId: window.id,
            position: site.position,
            url: site.url
          });

          console.log(`[WindowService] ✅ ${site.name}作成完了 (Window ${window.id})`);

          // 連続作成の負荷軽減
          if (unopenedSites.indexOf(site) < unopenedSites.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 800));
          }

        } catch (error) {
          console.error(`[WindowService] ❌ ${site.name}作成エラー:`, error);
          // エラーが発生しても他のサイトの作成を続行
        }
      }

      const totalTime = (performance.now() - startTime).toFixed(0);
      console.log(`[WindowService] AIサイト一括オープン完了: ${createdWindows.length}個作成 (${totalTime}ms)`);

      return {
        success: true,
        created: createdWindows.length,
        existing: openAISites.length,
        windows: createdWindows,
        totalTime: totalTime
      };

    } catch (error) {
      const totalTime = (performance.now() - startTime).toFixed(0);
      console.error(`[WindowService] AIサイト一括オープンエラー (${totalTime}ms):`, error);
      return {
        success: false,
        error: error.message,
        totalTime: totalTime
      };
    }
  }

  /**
   * 全AIサイトの状態をチェック
   */
  static async checkAISitesStatus() {
    try {
      const tabs = await new Promise((resolve, reject) => {
        chrome.tabs.query({}, (tabs) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve(tabs);
          }
        });
      });

      const aiSites = [
        { name: 'ChatGPT', url: this.AI_URLS.chatgpt },
        { name: 'Claude', url: this.AI_URLS.claude },
        { name: 'Gemini', url: this.AI_URLS.gemini }
      ];

      const status = aiSites.map(site => {
        const isOpen = tabs.some(tab =>
          tab.url && tab.url.includes(site.url.replace('https://', ''))
        );
        return {
          name: site.name,
          url: site.url,
          isOpen: isOpen,
          tab: isOpen ? tabs.find(tab =>
            tab.url && tab.url.includes(site.url.replace('https://', ''))
          ) : null
        };
      });

      return {
        total: aiSites.length,
        open: status.filter(s => s.isOpen).length,
        closed: status.filter(s => !s.isOpen).length,
        sites: status
      };

    } catch (error) {
      console.error('[WindowService] AIサイト状態チェックエラー:', error);
      return { error: error.message };
    }
  }
}

// デフォルトエクスポート
export default WindowService;