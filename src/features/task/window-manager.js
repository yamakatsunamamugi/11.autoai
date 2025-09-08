/**
 * ウィンドウマネージャー
 * AI処理用のブラウザウィンドウを管理
 */

export class WindowManager {
  constructor(logger = console) {
    this.logger = logger;
    this.activeWindows = new Map(); // tabId -> window情報
  }

  /**
   * タスク用のウィンドウを作成
   * @param {Object} task - タスク情報
   * @param {number} position - ウィンドウ位置（0:左, 1:中央, 2:右）
   * @returns {Promise<number>} タブID
   */
  async createWindowForTask(task, position = 0) {
    try {
      const aiType = this.normalizeAIType(task.aiType);
      const url = this.getAIUrl(aiType);
      
      this.logger.log(`[WindowManager] ウィンドウ作成: ${task.column}${task.row}`, {
        aiType,
        position
      });
      
      // ウィンドウ位置を計算
      const windowOptions = await this.calculateWindowPosition(position);
      
      // Chrome拡張機能APIでウィンドウを作成
      return new Promise((resolve, reject) => {
        chrome.windows.create({
          url,
          ...windowOptions,
          focused: false,
          type: 'normal'
        }, (window) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          
          const tabId = window.tabs[0].id;
          
          // ウィンドウ情報を保存
          this.activeWindows.set(tabId, {
            windowId: window.id,
            task,
            aiType,
            position,
            createdAt: Date.now()
          });
          
          this.logger.log(`[WindowManager] ウィンドウ作成成功: タブID=${tabId}`);
          resolve(tabId);
        });
      });
    } catch (error) {
      this.logger.error('[WindowManager] ウィンドウ作成エラー:', error);
      throw error;
    }
  }

  /**
   * ウィンドウを閉じる
   * @param {number} tabId - タブID
   */
  async closeWindow(tabId) {
    try {
      const windowInfo = this.activeWindows.get(tabId);
      
      if (!windowInfo) {
        this.logger.warn(`[WindowManager] ウィンドウ情報が見つかりません: タブID=${tabId}`);
        return;
      }
      
      await chrome.windows.remove(windowInfo.windowId);
      this.activeWindows.delete(tabId);
      
      this.logger.log(`[WindowManager] ウィンドウを閉じました: タブID=${tabId}`);
    } catch (error) {
      this.logger.error('[WindowManager] ウィンドウクローズエラー:', error);
    }
  }

  /**
   * すべてのウィンドウを閉じる
   */
  async closeAllWindows() {
    const promises = [];
    
    for (const [tabId, windowInfo] of this.activeWindows) {
      promises.push(this.closeWindow(tabId));
    }
    
    await Promise.allSettled(promises);
    this.activeWindows.clear();
    
    this.logger.log('[WindowManager] すべてのウィンドウを閉じました');
  }

  /**
   * ウィンドウ位置を計算
   * @param {number} position - 0:左, 1:中央, 2:右
   * @returns {Object} ウィンドウオプション
   */
  async calculateWindowPosition(position) {
    // デフォルトのウィンドウサイズ
    const width = 600;
    const height = 800;
    
    // スクリーンサイズを取得
    const screenWidth = screen.availWidth || 1920;
    const screenHeight = screen.availHeight || 1080;
    
    // 位置に応じてX座標を計算
    let left;
    switch (position) {
      case 0: // 左
        left = 0;
        break;
      case 1: // 中央
        left = Math.floor((screenWidth - width) / 2);
        break;
      case 2: // 右
        left = screenWidth - width;
        break;
      default:
        left = position * 610; // カスタム位置
    }
    
    return {
      left,
      top: 0,
      width,
      height: Math.min(height, screenHeight)
    };
  }

  /**
   * AIタイプを正規化
   */
  normalizeAIType(aiType) {
    if (!aiType) return 'claude';
    
    const normalized = aiType.toLowerCase();
    
    if (normalized.includes('chatgpt') || normalized.includes('gpt')) {
      return 'chatgpt';
    } else if (normalized.includes('claude')) {
      return 'claude';
    } else if (normalized.includes('gemini')) {
      return 'gemini';
    }
    
    return 'claude'; // デフォルト
  }

  /**
   * AIのURLを取得
   */
  getAIUrl(aiType) {
    const urls = {
      chatgpt: 'https://chat.openai.com/',
      claude: 'https://claude.ai/new',
      gemini: 'https://gemini.google.com/app'
    };
    
    return urls[aiType] || urls.claude;
  }

  /**
   * アクティブなウィンドウ数を取得
   */
  getActiveWindowCount() {
    return this.activeWindows.size;
  }

  /**
   * ウィンドウ情報を取得
   */
  getWindowInfo(tabId) {
    return this.activeWindows.get(tabId);
  }
}