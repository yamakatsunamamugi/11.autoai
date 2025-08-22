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
    console.log('[WindowManager] DOM要素初期化開始');
    
    this.extensionWindowNumberInput = document.getElementById('extensionWindowNumber');
    this.spreadsheetWindowNumberInput = document.getElementById('spreadsheetWindowNumber');
    this.checkWindowLocationsBtn = document.getElementById('checkWindowLocationsBtn');
    this.windowLocationDialog = document.getElementById('windowLocationDialog');
    this.windowLocationList = document.getElementById('windowLocationList');
    this.refreshWindowLocationBtn = document.getElementById('refreshWindowLocationBtn');
    this.closeWindowLocationBtn = document.getElementById('closeWindowLocationBtn');
    
    // DOM要素の存在確認
    console.log('[WindowManager] DOM要素確認:');
    console.log('- extensionWindowNumberInput:', !!this.extensionWindowNumberInput);
    console.log('- spreadsheetWindowNumberInput:', !!this.spreadsheetWindowNumberInput);
    console.log('- checkWindowLocationsBtn:', !!this.checkWindowLocationsBtn);
    console.log('- windowLocationDialog:', !!this.windowLocationDialog);
    console.log('- windowLocationList:', !!this.windowLocationList);
    console.log('- refreshWindowLocationBtn:', !!this.refreshWindowLocationBtn);
    console.log('- closeWindowLocationBtn:', !!this.closeWindowLocationBtn);
    
    // 重要な要素が見つからない場合の警告
    if (!this.extensionWindowNumberInput || !this.spreadsheetWindowNumberInput) {
      console.warn('[WindowManager] 重要なDOM要素が見つかりません');
      console.warn('HTML要素が正しく読み込まれているか確認してください');
    }
    
    
    console.log('[WindowManager] DOM要素初期化完了');
  }

  // イベントリスナーを設定
  setupEventListeners() {
    console.log('[WindowManager] イベントリスナー設定開始');
    

    if (this.checkWindowLocationsBtn) {
      console.log('[WindowManager] checkWindowLocationsBtn にクリックイベント設定');
      this.checkWindowLocationsBtn.addEventListener('click', () => {
        console.log('[WindowManager] checkWindowLocationsBtn がクリックされました');
        this.checkAllWindowLocations();
      });
    } else {
      console.warn('[WindowManager] checkWindowLocationsBtn が見つかりません');
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
    
    console.log('[WindowManager] イベントリスナー設定完了');
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

  // 各モニターに番号表示ウィンドウを作成
  async createMonitorDisplayWindows() {
    try {
      console.log('[WindowManager] モニター表示ウィンドウ作成開始');
      
      // 全ディスプレイ情報を取得
      const displays = await chrome.system.display.getInfo();
      console.log(`[WindowManager] 検出されたディスプレイ数: ${displays.length}`);
      
      const windowPromises = [];
      
      // 各ディスプレイに番号表示ウィンドウを作成
      displays.forEach((display, index) => {
        const monitorNumber = index + 1;
        console.log(`[WindowManager] モニター${monitorNumber} 表示ウィンドウ作成中...`);
        
        // モニター中央に小さな表示ウィンドウを作成
        const centerX = display.workArea.left + Math.floor(display.workArea.width / 2) - 150;
        const centerY = display.workArea.top + Math.floor(display.workArea.height / 2) - 100;
        
        const windowPromise = chrome.windows.create({
          url: 'data:text/html,<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{margin:0;padding:0;background:rgba(0,123,255,0.9);color:white;font-family:Arial,sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;font-size:48px;font-weight:bold;text-align:center;border-radius:20px;}div{animation:pulse 2s infinite;}</style></head><body><div>🖥️<br>モニター ' + monitorNumber + '</div></body></html>',
          type: 'popup',
          left: centerX,
          top: centerY,
          width: 300,
          height: 200,
          focused: false,
          state: 'normal'
        }).then(window => {
          // ウィンドウを最前面に移動
          chrome.windows.update(window.id, { 
            focused: true,
            drawAttention: true 
          }).catch(err => console.log('最前面移動エラー:', err));
          
          setTimeout(() => {
            chrome.windows.update(window.id, { focused: false }).catch(() => {});
          }, 100);
          console.log(`[WindowManager] モニター${monitorNumber} 表示ウィンドウ作成成功 (ID: ${window.id})`);
          
          // 3秒後に自動で閉じる
          setTimeout(() => {
            chrome.windows.remove(window.id).catch(err => {
              console.log(`[WindowManager] モニター${monitorNumber} ウィンドウ削除エラー:`, err);
            });
          }, 3000);
          
          return window;
        }).catch(error => {
          console.error(`[WindowManager] モニター${monitorNumber} 表示ウィンドウ作成エラー:`, error);
          return null;
        });
        
        windowPromises.push(windowPromise);
      });
      
      // 全てのウィンドウ作成完了を待つ
      const results = await Promise.allSettled(windowPromises);
      const successCount = results.filter(result => 
        result.status === 'fulfilled' && result.value !== null
      ).length;
      
      console.log(`[WindowManager] モニター表示ウィンドウ作成完了: ${successCount}/${displays.length} 成功`);
      this.showFeedback(`${successCount}個のモニターに番号を表示しました（3秒後に自動で消えます）`, 'success');
      
      return successCount;
      
    } catch (error) {
      console.error('[WindowManager] モニター表示ウィンドウ作成エラー:', error);
      this.showFeedback('モニター表示ウィンドウの作成に失敗しました', 'error');
      return 0;
    }
  }

  // モニター場所確認 - 各モニターに番号を表示
  async checkAllWindowLocations() {
    try {
      console.log('[WindowManager] モニター場所確認開始');
      
      // 各モニターに番号表示ウィンドウを作成（3秒後に自動で閉じる）
      await this.createMonitorDisplayWindows();
      
    } catch (error) {
      console.error('モニター場所確認エラー:', error);
      this.showFeedback('モニター場所確認に失敗しました', 'error');
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
    } else if (typeof showFeedback === 'function') {
      showFeedback(message, type);
    } else {
      // フォールバック: アラートで表示
      const typeMap = {
        'success': '✅ 成功',
        'error': '❌ エラー', 
        'warning': '⚠️ 警告',
        'info': 'ℹ️ 情報'
      };
      alert(`${typeMap[type] || type}: ${message}`);
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