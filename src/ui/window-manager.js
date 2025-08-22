/**
 * @fileoverview window-manager.js - モニター管理システム
 * 
 * ■ ファイル概要
 * このモジュールは、Chrome拡張機能におけるマルチモニター環境での
 * ウィンドウ配置管理を担当します。指定されたモニター内での4分割レイアウトや
 * モニター間でのウィンドウ移動、モニター番号の視覚的確認機能を提供します。
 * 
 * ■ 主要機能
 * 1. モニター番号表示: 各モニターに番号を3秒間表示
 * 2. モニター内4分割: 指定モニター内で左上/右上/左下/右下の配置
 * 3. 拡張機能配置: 処理開始時に指定モニターの右下に自動配置
 * 4. 設定管理: モニター番号設定の保存・読み込み
 * 5. マルチモニター対応: 複数モニター環境での適切な位置計算
 * 
 * ■ 使用方法
 * - UI上でモニター番号を指定（デフォルト: 拡張機能=1, スプレッドシート=2）
 * - 「モニター場所確認」ボタンで各モニターに番号表示
 * - 処理開始時に自動で指定モニター内4分割配置
 * 
 * ■ 技術仕様
 * - Chrome Extensions API v3対応
 * - chrome.system.display API使用（マルチモニター検出）
 * - chrome.windows API使用（ウィンドウ操作）
 * - chrome.storage.local API使用（設定保存）
 * 
 * ■ 依存関係
 * - Chrome Extensions環境
 * - manifest.jsonでの適切な権限設定
 * - HTML要素: extensionWindowNumber, spreadsheetWindowNumber等
 */

/**
 * モニター管理システムのメインクラス
 * マルチモニター環境でのウィンドウ配置とモニター番号表示を管理
 */
class WindowManager {
  /**
   * コンストラクタ - システム初期化
   * DOM要素の取得、イベントリスナー設定、保存済み設定の読み込みを実行
   */
  constructor() {
    // DOM要素を取得・初期化
    this.initializeElements();
    
    // ボタンクリック等のイベントリスナーを設定
    this.setupEventListeners();
    
    // 前回保存されたモニター番号設定を読み込み
    this.loadWindowSettings();
  }

  /**
   * DOM要素の初期化
   * HTML内のモニター管理に必要な要素を取得し、存在確認を行う
   */
  initializeElements() {
    console.log('[WindowManager] DOM要素初期化開始');
    
    // ■ メイン機能のDOM要素を取得
    // 拡張機能のモニター番号を指定する入力欄
    this.extensionWindowNumberInput = document.getElementById('extensionWindowNumber');
    
    // スプレッドシートのモニター番号を指定する入力欄
    this.spreadsheetWindowNumberInput = document.getElementById('spreadsheetWindowNumber');
    
    // モニター場所確認ボタン（各モニターに番号を表示）
    this.checkWindowLocationsBtn = document.getElementById('checkWindowLocationsBtn');
    
    // ■ ダイアログ関連のDOM要素（現在は未使用だが将来の拡張用）
    this.windowLocationDialog = document.getElementById('windowLocationDialog');
    this.windowLocationList = document.getElementById('windowLocationList');
    this.refreshWindowLocationBtn = document.getElementById('refreshWindowLocationBtn');
    this.closeWindowLocationBtn = document.getElementById('closeWindowLocationBtn');
    
    // ■ DOM要素の存在確認（デバッグ用ログ出力）
    console.log('[WindowManager] DOM要素確認:');
    console.log('- 拡張機能モニター番号入力:', !!this.extensionWindowNumberInput);
    console.log('- スプレッドシートモニター番号入力:', !!this.spreadsheetWindowNumberInput);
    console.log('- モニター場所確認ボタン:', !!this.checkWindowLocationsBtn);
    console.log('- ダイアログ要素:', !!this.windowLocationDialog);
    console.log('- リスト要素:', !!this.windowLocationList);
    console.log('- 更新ボタン:', !!this.refreshWindowLocationBtn);
    console.log('- 閉じるボタン:', !!this.closeWindowLocationBtn);
    
    // ■ 重要な要素の存在チェック
    // モニター番号入力欄が見つからない場合は警告を表示
    if (!this.extensionWindowNumberInput || !this.spreadsheetWindowNumberInput) {
      console.warn('[WindowManager] 重要なDOM要素が見つかりません');
      console.warn('HTML要素が正しく読み込まれているか確認してください');
    }
    
    console.log('[WindowManager] DOM要素初期化完了');
  }

  /**
   * イベントリスナーの設定
   * ボタンクリックや入力値変更時の処理を登録
   */
  setupEventListeners() {
    console.log('[WindowManager] イベントリスナー設定開始');
    
    // ■ メインボタンのイベントリスナー設定
    // 「モニター場所確認」ボタンのクリックイベント
    if (this.checkWindowLocationsBtn) {
      console.log('[WindowManager] モニター場所確認ボタンにクリックイベント設定');
      this.checkWindowLocationsBtn.addEventListener('click', () => {
        console.log('[WindowManager] モニター場所確認ボタンがクリックされました');
        // 各モニターに番号を表示する処理を実行
        this.checkAllWindowLocations();
      });
    } else {
      console.warn('[WindowManager] モニター場所確認ボタンが見つかりません');
    }

    // ■ ダイアログ関連のイベントリスナー（将来の拡張用）
    // ダイアログ内の更新ボタン
    if (this.refreshWindowLocationBtn) {
      this.refreshWindowLocationBtn.addEventListener('click', () => this.checkAllWindowLocations());
    }

    // ダイアログ内の閉じるボタン
    if (this.closeWindowLocationBtn) {
      this.closeWindowLocationBtn.addEventListener('click', () => {
        // ダイアログを非表示にする
        this.windowLocationDialog.style.display = 'none';
      });
    }

    // ■ 設定保存のイベントリスナー
    // 拡張機能モニター番号が変更された時の自動保存
    if (this.extensionWindowNumberInput) {
      this.extensionWindowNumberInput.addEventListener('change', () => {
        console.log('[WindowManager] 拡張機能モニター番号が変更されました');
        // 変更された設定をchrome.storage.localに保存
        this.saveWindowSettings();
      });
    }

    // スプレッドシートモニター番号が変更された時の自動保存
    if (this.spreadsheetWindowNumberInput) {
      this.spreadsheetWindowNumberInput.addEventListener('change', () => {
        console.log('[WindowManager] スプレッドシートモニター番号が変更されました');
        // 変更された設定をchrome.storage.localに保存
        this.saveWindowSettings();
      });
    }
    
    console.log('[WindowManager] イベントリスナー設定完了');
  }

  /**
   * モニター番号設定の読み込み
   * chrome.storage.localに保存された前回の設定値をUI入力欄に復元
   */
  async loadWindowSettings() {
    try {
      // chrome.storage.localから保存された設定を取得
      const result = await chrome.storage.local.get(['windowSettings']);
      const settings = result.windowSettings || {};
      
      // 保存された設定が存在する場合、UI入力欄に値を設定
      if (settings.extensionWindowNumber && this.extensionWindowNumberInput) {
        // 拡張機能モニター番号を入力欄に復元
        this.extensionWindowNumberInput.value = settings.extensionWindowNumber;
      }
      if (settings.spreadsheetWindowNumber && this.spreadsheetWindowNumberInput) {
        // スプレッドシートモニター番号を入力欄に復元
        this.spreadsheetWindowNumberInput.value = settings.spreadsheetWindowNumber;
      }
      
      console.log('[WindowManager] モニター設定読み込み完了:', settings);
    } catch (error) {
      console.error('[WindowManager] モニター設定読み込みエラー:', error);
    }
  }

  /**
   * モニター番号設定の保存
   * UI入力欄の現在値をchrome.storage.localに保存
   */
  async saveWindowSettings() {
    try {
      // UI入力欄から現在の設定値を取得
      const settings = {
        // 拡張機能モニター番号（数値に変換）
        extensionWindowNumber: parseInt(this.extensionWindowNumberInput.value),
        // スプレッドシートモニター番号（数値に変換）
        spreadsheetWindowNumber: parseInt(this.spreadsheetWindowNumberInput.value)
      };
      
      // chrome.storage.localに設定を保存
      await chrome.storage.local.set({ windowSettings: settings });
      console.log('[WindowManager] モニター設定保存完了:', settings);
    } catch (error) {
      console.error('[WindowManager] モニター設定保存エラー:', error);
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
      const position = await this.calculateWindowPositionFromNumber(windowNumber);
      
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

  /**
   * モニター番号から指定されたモニター内での位置を計算
   * 
   * @param {number} windowNumber - モニター番号（1から開始）
   * @param {number|null} quadrant - 4分割位置（1=左上, 2=右上, 3=左下, 4=右下）
   *                                 nullの場合はフルスクリーン
   * @returns {Object} ウィンドウ位置情報（left, top, width, height）
   */
  async calculateWindowPositionFromNumber(windowNumber, quadrant = null) {
    try {
      // ■ システムの全ディスプレイ情報を取得
      const displays = await chrome.system.display.getInfo();
      console.log(`[WindowManager] 検出されたモニター数: ${displays.length}`);
      
      // ■ 指定されたモニター番号に対応するディスプレイを取得
      // 配列は0から始まるので、モニター番号から1を引く
      const targetDisplay = displays[windowNumber - 1];
      
      if (!targetDisplay) {
        // 指定されたモニターが存在しない場合の処理
        console.warn(`[WindowManager] モニター${windowNumber}が見つかりません。メインディスプレイを使用します。`);
        // メインディスプレイ（プライマリ）を取得、なければ最初のディスプレイを使用
        const primaryDisplay = displays.find(d => d.isPrimary) || displays[0];
        return this.getFullScreenPosition(primaryDisplay);
      }
      
      // ■ 配置方法による分岐処理
      if (!quadrant) {
        // quadrantが指定されていない場合: モニター全体にフルスクリーン表示
        console.log(`[WindowManager] モニター${windowNumber}でフルスクリーン配置`);
        return this.getFullScreenPosition(targetDisplay);
      } else {
        // quadrantが指定されている場合: モニター内で4分割配置
        console.log(`[WindowManager] モニター${windowNumber}で4分割配置（位置${quadrant}）`);
        return this.getQuadrantPosition(targetDisplay, quadrant);
      }
      
    } catch (error) {
      console.error('[WindowManager] モニター位置計算エラー:', error);
      
      // ■ エラー時のフォールバック処理
      // 計算に失敗した場合はデフォルトサイズで画面左上に配置
      return {
        left: 0,
        top: 0,
        width: 800,
        height: 600
      };
    }
  }

  // フルスクリーン位置を取得
  getFullScreenPosition(display) {
    return {
      left: display.workArea.left,
      top: display.workArea.top,
      width: display.workArea.width,
      height: display.workArea.height
    };
  }

  // 4分割位置を取得
  getQuadrantPosition(display, quadrant) {
    const halfWidth = Math.floor(display.workArea.width / 2);
    const halfHeight = Math.floor(display.workArea.height / 2);
    
    const positions = {
      1: { // 左上
        left: display.workArea.left,
        top: display.workArea.top,
        width: halfWidth,
        height: halfHeight
      },
      2: { // 右上
        left: display.workArea.left + halfWidth,
        top: display.workArea.top,
        width: halfWidth,
        height: halfHeight
      },
      3: { // 左下
        left: display.workArea.left,
        top: display.workArea.top + halfHeight,
        width: halfWidth,
        height: halfHeight
      },
      4: { // 右下
        left: display.workArea.left + halfWidth,
        top: display.workArea.top + halfHeight,
        width: halfWidth,
        height: halfHeight
      }
    };
    
    return positions[quadrant] || positions[1];
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

  /**
   * 各モニターに番号表示ウィンドウを作成
   * 
   * ■ 機能詳細
   * 接続されている全モニターの中央に番号表示用の小さなポップアップウィンドウを作成
   * ウィンドウには「🖥️ モニター1」のような表示を行い、3秒後に自動削除
   * 
   * ■ 表示仕様
   * - サイズ: 300x200px
   * - 位置: 各モニターの中央
   * - デザイン: 青色背景、白文字、パルスアニメーション
   * - 表示時間: 3秒間
   * - 最前面表示: 他のウィンドウより上に表示
   * 
   * ■ 技術仕様
   * - データURLでHTMLを直接埋め込み（外部ファイル不要）
   * - 並列処理でレスポンス向上
   * - エラーハンドリングで個別失敗に対応
   * 
   * @returns {number} 成功したウィンドウ作成数
   */
  async createMonitorDisplayWindows() {
    try {
      console.log('[WindowManager] モニター表示ウィンドウ作成開始');
      
      // ■ システムから全ディスプレイ情報を取得
      const displays = await chrome.system.display.getInfo();
      console.log(`[WindowManager] 検出されたディスプレイ数: ${displays.length}`);
      
      // 並列処理用のPromise配列
      const windowPromises = [];
      
      // ■ 各ディスプレイに対して番号表示ウィンドウを作成
      displays.forEach((display, index) => {
        const monitorNumber = index + 1;
        console.log(`[WindowManager] モニター${monitorNumber} 表示ウィンドウ作成中...`);
        
        // ■ ウィンドウを各モニターの中央に配置するための座標計算
        // 300x200のウィンドウを中央に配置するため、幅・高さの半分を引く
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

  /**
   * モニター場所確認機能 - 各モニターに番号を表示
   * 
   * ■ 機能概要
   * 「モニター場所確認」ボタンが押された時の処理
   * 接続されている全モニターの中央に「🖥️ モニター1」「🖥️ モニター2」等を
   * 3秒間表示してユーザーがモニター番号を確認できるようにする
   * 
   * ■ 処理フロー
   * 1. createMonitorDisplayWindows()を呼び出し
   * 2. 各モニターに番号表示ウィンドウを作成
   * 3. 3秒後に自動でウィンドウを削除
   */
  async checkAllWindowLocations() {
    try {
      console.log('[WindowManager] モニター場所確認開始');
      
      // 各モニターに番号表示ウィンドウを作成（3秒後に自動で閉じる）
      await this.createMonitorDisplayWindows();
      
    } catch (error) {
      console.error('[WindowManager] モニター場所確認エラー:', error);
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

/**
 * ■ グローバル公開とシステム初期化
 */

// WindowManagerクラスをグローバルスコープに公開
// 他のJavaScriptファイルからもアクセス可能にする
window.WindowManager = WindowManager;

/**
 * DOM読み込み完了時の自動初期化
 * HTMLのDOMContentLoadedイベントでWindowManagerインスタンスを作成
 * これにより拡張機能UI表示時に自動でモニター管理機能が利用可能になる
 */
document.addEventListener('DOMContentLoaded', () => {
  // グローバルに公開されたWindowManagerのインスタンスを作成
  // 他のスクリプトから window.windowManager でアクセス可能
  window.windowManager = new WindowManager();
  console.log('[WindowManager] システム初期化完了 - モニター管理機能が利用可能です');
});