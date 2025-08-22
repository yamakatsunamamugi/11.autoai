// window-manager.js - ウィンドウ管理機能
//
// ウィンドウの位置指定、場所確認、ポップアップ表示などの機能を管理

class WindowManager {
  constructor() {
    this.initializeElements();
    this.setupEventListeners();
    this.loadWindowSettings();
  }

  // DOM要素を初期化
  initializeElements() {
    this.extensionWindowNumberInput = document.getElementById('extensionWindowNumber');
    this.spreadsheetWindowNumberInput = document.getElementById('spreadsheetWindowNumber');
    this.openSpreadsheetBtn = document.getElementById('openSpreadsheetBtn');
    this.checkWindowLocationsBtn = document.getElementById('checkWindowLocationsBtn');
    this.windowLocationDialog = document.getElementById('windowLocationDialog');
    this.windowLocationList = document.getElementById('windowLocationList');
    this.refreshWindowLocationBtn = document.getElementById('refreshWindowLocationBtn');
    this.closeWindowLocationBtn = document.getElementById('closeWindowLocationBtn');
  }

  // イベントリスナーを設定
  setupEventListeners() {
    if (this.openSpreadsheetBtn) {
      this.openSpreadsheetBtn.addEventListener('click', () => this.openSpreadsheetInWindow());
    }

    if (this.checkWindowLocationsBtn) {
      this.checkWindowLocationsBtn.addEventListener('click', () => this.checkAllWindowLocations());
    }

    if (this.refreshWindowLocationBtn) {
      this.refreshWindowLocationBtn.addEventListener('click', () => this.checkAllWindowLocations());
    }

    if (this.closeWindowLocationBtn) {
      this.closeWindowLocationBtn.addEventListener('click', () => {
        this.windowLocationDialog.style.display = 'none';
      });
    }

    // ウィンドウ番号が変更されたら設定を保存
    if (this.extensionWindowNumberInput) {
      this.extensionWindowNumberInput.addEventListener('change', () => this.saveWindowSettings());
    }

    if (this.spreadsheetWindowNumberInput) {
      this.spreadsheetWindowNumberInput.addEventListener('change', () => this.saveWindowSettings());
    }
  }

  // ウィンドウ番号設定を読み込み
  async loadWindowSettings() {
    try {
      const result = await chrome.storage.local.get(['windowSettings']);
      const settings = result.windowSettings || {};
      
      if (settings.extensionWindowNumber && this.extensionWindowNumberInput) {
        this.extensionWindowNumberInput.value = settings.extensionWindowNumber;
      }
      if (settings.spreadsheetWindowNumber && this.spreadsheetWindowNumberInput) {
        this.spreadsheetWindowNumberInput.value = settings.spreadsheetWindowNumber;
      }
    } catch (error) {
      console.error('ウィンドウ設定読み込みエラー:', error);
    }
  }

  // ウィンドウ番号設定を保存
  async saveWindowSettings() {
    try {
      const settings = {
        extensionWindowNumber: parseInt(this.extensionWindowNumberInput.value),
        spreadsheetWindowNumber: parseInt(this.spreadsheetWindowNumberInput.value)
      };
      
      await chrome.storage.local.set({ windowSettings: settings });
      console.log('ウィンドウ設定保存完了:', settings);
    } catch (error) {
      console.error('ウィンドウ設定保存エラー:', error);
    }
  }

  // スプレッドシートを指定番号のウィンドウで開く
  async openSpreadsheetInWindow() {
    try {
      // 設定を保存
      await this.saveWindowSettings();
      
      // スプレッドシートURLを取得
      const urlInputs = document.querySelectorAll('.spreadsheet-url-input');
      let url = null;
      
      for (const input of urlInputs) {
        const inputUrl = input.value.trim();
        if (inputUrl && inputUrl.includes('spreadsheets.google.com')) {
          url = inputUrl;
          break;
        }
      }
      
      if (!url) {
        this.showFeedback('スプレッドシートURLを入力してください', 'error');
        return;
      }
      
      const windowNumber = parseInt(this.spreadsheetWindowNumberInput.value);
      
      // ウィンドウ番号に基づいて位置を計算
      const screenInfo = await this.getScreenInfo();
      const position = this.calculateWindowPositionFromNumber(windowNumber, screenInfo);
      
      // スプレッドシートウィンドウを作成
      const window = await chrome.windows.create({
        url: url,
        type: 'popup',
        ...position,
        focused: false  // 背景で開く
      });
      
      this.showFeedback(`スプレッドシートをウィンドウ${windowNumber}で開きました`, 'success');
      console.log(`スプレッドシートウィンドウ作成: ID=${window.id}, 番号=${windowNumber}`);
      
    } catch (error) {
      console.error('スプレッドシートウィンドウ作成エラー:', error);
      this.showFeedback('スプレッドシートウィンドウの作成に失敗しました', 'error');
    }
  }

  // 拡張機能ウィンドウを指定番号に移動
  async moveExtensionToWindow() {
    try {
      await this.saveWindowSettings();
      
      const result = await chrome.storage.local.get(['extensionWindowId']);
      const windowId = result.extensionWindowId;
      
      if (!windowId) {
        this.showFeedback('拡張機能ウィンドウIDが見つかりません', 'error');
        return;
      }
      
      // ウィンドウが存在するか確認
      try {
        await chrome.windows.get(windowId);
      } catch (error) {
        this.showFeedback('拡張機能ウィンドウが存在しません', 'error');
        return;
      }
      
      const windowNumber = parseInt(this.extensionWindowNumberInput.value);
      const screenInfo = await this.getScreenInfo();
      const position = this.calculateWindowPositionFromNumber(windowNumber, screenInfo);
      
      // 拡張機能ウィンドウを移動
      await chrome.windows.update(windowId, {
        ...position,
        state: 'normal'
      });
      
      this.showFeedback(`拡張機能をウィンドウ${windowNumber}に移動しました`, 'success');
      
    } catch (error) {
      console.error('拡張機能ウィンドウ移動エラー:', error);
      this.showFeedback('拡張機能ウィンドウの移動に失敗しました', 'error');
    }
  }

  // ウィンドウ番号から位置を計算
  calculateWindowPositionFromNumber(windowNumber, screenInfo) {
    // 4分割の基本配置 (1-4: 左上、右上、左下、右下)
    // 5以降は少しずつずらして配置
    const halfWidth = Math.floor(screenInfo.width / 2);
    const halfHeight = Math.floor(screenInfo.height / 2);
    
    const basePositions = [
      // 1: 左上
      { left: screenInfo.left, top: screenInfo.top, width: halfWidth, height: halfHeight },
      // 2: 右上
      { left: screenInfo.left + halfWidth, top: screenInfo.top, width: halfWidth, height: halfHeight },
      // 3: 左下
      { left: screenInfo.left, top: screenInfo.top + halfHeight, width: halfWidth, height: halfHeight },
      // 4: 右下
      { left: screenInfo.left + halfWidth, top: screenInfo.top + halfHeight, width: halfWidth, height: halfHeight }
    ];
    
    const baseIndex = ((windowNumber - 1) % 4);
    const offset = Math.floor((windowNumber - 1) / 4) * 50; // 5番以降は50pxずつずらす
    
    const position = basePositions[baseIndex];
    return {
      left: position.left + offset,
      top: position.top + offset,
      width: position.width,
      height: position.height
    };
  }

  // 画面情報を取得
  async getScreenInfo() {
    try {
      const displays = await chrome.system.display.getInfo();
      const primaryDisplay = displays.find(d => d.isPrimary) || displays[0];
      
      return {
        width: primaryDisplay.workArea.width,
        height: primaryDisplay.workArea.height,
        left: primaryDisplay.workArea.left,
        top: primaryDisplay.workArea.top
      };
    } catch (error) {
      console.error('画面情報取得エラー:', error);
      // フォールバック
      return {
        width: 1920,
        height: 1080,
        left: 0,
        top: 0
      };
    }
  }

  // 全ウィンドウの位置情報を取得・表示
  async checkAllWindowLocations() {
    try {
      this.windowLocationDialog.style.display = 'block';
      this.windowLocationList.innerHTML = '<div class="loading-message">ウィンドウ情報を取得中...</div>';
      
      const windows = await chrome.windows.getAll({ populate: true });
      const screenInfo = await this.getScreenInfo();
      
      if (windows.length === 0) {
        this.windowLocationList.innerHTML = '<div style="text-align: center; color: #666;">開いているウィンドウがありません</div>';
        return;
      }
      
      // 各ウィンドウにポップアップを表示
      const successCount = await this.showWindowPopups(windows);
      
      let html = '<div style="margin-bottom: 10px; font-weight: bold; color: #333;">開いているウィンドウ一覧:</div>';
      
      if (successCount > 0) {
        html += '<div style="margin-bottom: 10px; font-size: 12px; color: #28a745;">✅ 対応サイトのウィンドウに番号ポップアップを表示中（3秒後に自動で消えます）</div>';
      } else {
        html += '<div style="margin-bottom: 10px; font-size: 12px; color: #ffc107;">⚠️ ポップアップ表示可能なウィンドウがありません（AI サイト・スプレッドシートで利用可能）</div>';
      }
      
      windows.forEach((window, index) => {
        const tabs = window.tabs || [];
        const title = tabs.length > 0 ? tabs[0].title : 'タイトル不明';
        const url = tabs.length > 0 ? tabs[0].url : '';
        
        // どの領域にあるかを判定
        const area = this.determineWindowArea(window, screenInfo);
        const stateText = this.getWindowStateText(window.state);
        
        // ポップアップ表示可否を判定
        const canShowPopup = this.canShowPopupOnUrl(url);
        
        html += `
          <div style="border: 1px solid #ddd; margin: 5px 0; padding: 8px; border-radius: 4px; background: white;">
            <div style="font-weight: bold; color: #007bff;">ウィンドウ ${index + 1} (ID: ${window.id}) ${canShowPopup ? '✅' : '❌'}</div>
            <div style="margin: 2px 0;">タイトル: ${title.length > 50 ? title.substring(0, 50) + '...' : title}</div>
            <div style="margin: 2px 0;">位置: (${window.left}, ${window.top}) | サイズ: ${window.width}x${window.height}</div>
            <div style="margin: 2px 0;">状態: ${stateText} | 領域: ${area}</div>
            ${url.includes('spreadsheets.google.com') || url.includes('docs.google.com') ? '<div style="color: #28a745; font-weight: bold;">📊 Google ワークスペース</div>' : ''}
            ${url.includes('autoai') || title.includes('AutoAI') ? '<div style="color: #007bff; font-weight: bold;">🤖 拡張機能</div>' : ''}
            ${!canShowPopup ? '<div style="color: #dc3545; font-size: 11px;">❌ ポップアップ表示不可（権限なし）</div>' : '<div style="color: #28a745; font-size: 11px;">✅ ポップアップ表示可能</div>'}
          </div>
        `;
      });
      
      this.windowLocationList.innerHTML = html;
      
    } catch (error) {
      console.error('ウィンドウ位置確認エラー:', error);
      this.windowLocationList.innerHTML = '<div style="color: red;">エラー: ウィンドウ情報の取得に失敗しました</div>';
    }
  }

  // URLでポップアップ表示可能かチェック
  canShowPopupOnUrl(url) {
    // システムページチェック
    const isSystemPage = url.startsWith('chrome://') || url.startsWith('chrome-extension://') || url.startsWith('edge://') || url.startsWith('about:');
    if (isSystemPage) return false;
    
    // 許可されたホストチェック
    const allowedHosts = [
      'chatgpt.com',
      'chat.openai.com', 
      'claude.ai',
      'gemini.google.com',
      'genspark.com',
      'www.genspark.ai',
      'sheets.googleapis.com',
      'docs.google.com'
    ];
    
    return allowedHosts.some(host => url.includes(host));
  }

  // 各ウィンドウにポップアップ番号を表示
  async showWindowPopups(windows) {
    let successCount = 0;
    
    const popupPromises = windows.map(async (window, index) => {
      try {
        const tabs = window.tabs || [];
        if (tabs.length === 0) return false;
        
        const tabId = tabs[0].id;
        const windowNumber = index + 1;
        const url = tabs[0].url;
        
        if (!this.canShowPopupOnUrl(url)) {
          if (url.startsWith('chrome://') || url.startsWith('chrome-extension://') || url.startsWith('edge://') || url.startsWith('about:')) {
            console.log(`ウィンドウ ${windowNumber}: システムページのためスキップ (${url})`);
          } else {
            console.log(`ウィンドウ ${windowNumber}: 権限がないホストのためスキップ (${url})`);
          }
          return false;
        }
        
        // コンテンツスクリプトを注入してポップアップを表示
        await chrome.scripting.executeScript({
          target: { tabId: tabId },
          func: this.showWindowNumberPopup,
          args: [windowNumber]
        });
        
        console.log(`ウィンドウ ${windowNumber}: ポップアップ表示成功`);
        successCount++;
        return true;
        
      } catch (error) {
        console.log(`ウィンドウ ${index + 1}: ポップアップ表示エラー -`, error.message);
        return false;
      }
    });
    
    // 全ての注入を並列実行
    await Promise.allSettled(popupPromises);
    
    // 成功数をログ出力
    console.log(`ポップアップ表示: ${successCount}/${windows.length} ウィンドウで成功`);
    
    // 成功数が0の場合は通知
    if (successCount === 0) {
      this.showFeedback('ポップアップを表示できるウィンドウがありませんでした。AI サイトやスプレッドシートでお試しください。', 'warning');
    } else {
      this.showFeedback(`${successCount}個のウィンドウにポップアップを表示しました`, 'success');
    }
    
    return successCount;
  }

  // ウィンドウ番号ポップアップを表示する関数（注入用）
  showWindowNumberPopup(windowNumber) {
    // 既存のポップアップを削除
    const existingPopup = document.getElementById('window-number-popup-autoai');
    if (existingPopup) {
      existingPopup.remove();
    }
    
    // ポップアップ要素を作成
    const popup = document.createElement('div');
    popup.id = 'window-number-popup-autoai';
    popup.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: linear-gradient(135deg, #007bff 0%, #0056b3 100%);
      color: white;
      padding: 20px 30px;
      border-radius: 12px;
      box-shadow: 0 8px 25px rgba(0, 123, 255, 0.4);
      z-index: 999999;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 24px;
      font-weight: bold;
      text-align: center;
      animation: popupSlideIn 0.3s ease-out;
      border: 3px solid rgba(255, 255, 255, 0.3);
    `;
    
    popup.innerHTML = `
      <div style="display: flex; align-items: center; gap: 10px;">
        <div style="font-size: 30px;">🪟</div>
        <div>
          <div style="font-size: 28px; line-height: 1;">ウィンドウ ${windowNumber}</div>
          <div style="font-size: 14px; opacity: 0.9; margin-top: 4px;">Window ${windowNumber}</div>
        </div>
      </div>
    `;
    
    // アニメーションスタイルを追加
    if (!document.getElementById('popup-animation-styles-autoai')) {
      const style = document.createElement('style');
      style.id = 'popup-animation-styles-autoai';
      style.textContent = `
        @keyframes popupSlideIn {
          from {
            transform: translateX(100%) scale(0.8);
            opacity: 0;
          }
          to {
            transform: translateX(0) scale(1);
            opacity: 1;
          }
        }
        @keyframes popupSlideOut {
          from {
            transform: translateX(0) scale(1);
            opacity: 1;
          }
          to {
            transform: translateX(100%) scale(0.8);
            opacity: 0;
          }
        }
      `;
      document.head.appendChild(style);
    }
    
    // ポップアップを表示
    document.body.appendChild(popup);
    
    // 3秒後に自動削除
    setTimeout(() => {
      if (popup && popup.parentNode) {
        popup.style.animation = 'popupSlideOut 0.3s ease-in';
        setTimeout(() => {
          if (popup && popup.parentNode) {
            popup.remove();
          }
        }, 300);
      }
    }, 3000);
  }

  // ウィンドウがどの領域にあるかを判定
  determineWindowArea(window, screenInfo) {
    const centerX = window.left + window.width / 2;
    const centerY = window.top + window.height / 2;
    const screenCenterX = screenInfo.left + screenInfo.width / 2;
    const screenCenterY = screenInfo.top + screenInfo.height / 2;
    
    if (window.state === 'maximized') {
      return '全画面';
    }
    
    const isLeft = centerX < screenCenterX;
    const isTop = centerY < screenCenterY;
    
    if (isLeft && isTop) return '左上';
    if (!isLeft && isTop) return '右上';
    if (isLeft && !isTop) return '左下';
    return '右下';
  }

  // ウィンドウ状態のテキスト変換
  getWindowStateText(state) {
    const stateMap = {
      'normal': '通常',
      'maximized': '最大化',
      'minimized': '最小化',
      'fullscreen': '全画面'
    };
    return stateMap[state] || state;
  }

  // フィードバックメッセージを表示
  showFeedback(message, type) {
    // showFeedback関数がグローバルに存在する場合は使用
    if (typeof window.showFeedback === 'function') {
      window.showFeedback(message, type);
    } else {
      console.log(`[${type.toUpperCase()}] ${message}`);
    }
  }
}

// WindowManagerをグローバルに公開
window.WindowManager = WindowManager;

// DOMが読み込まれたら自動初期化
document.addEventListener('DOMContentLoaded', () => {
  window.windowManager = new WindowManager();
});