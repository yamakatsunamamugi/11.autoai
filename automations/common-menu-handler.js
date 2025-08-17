// 共通メニューハンドラー
// AI変更検出システム（claude-research-detector.js）をベースにした統一メニュー操作
// 全AI（ChatGPT、Claude、Gemini）で共通のメニュー開閉処理を提供
(() => {
  "use strict";

  // ========================================
  // 設定（AI変更検出システムから）
  // ========================================
  const CONFIG = {
    debugMode: true,
    waitTime: 1000,        // デフォルト待機時間
    claudeWaitTime: 500,   // Claude専用待機時間
    maxRetries: 3,
    DELAYS: {
      click: 50,
      menuOpen: 1500,
      menuClose: 1000,
      modelSwitch: 2000,
      elementSearch: 500,
      submenuOpen: 1000
    },
    MAX_WAIT: 5000
  };

  // ========================================
  // ユーティリティクラス（AI変更検出システムから移植）
  // ========================================
  class Utils {
    static wait(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    static log(message, type = 'info') {
      const symbols = {
        info: '📝',
        success: '✅',
        warning: '⚠️',
        error: '❌',
        search: '🔍',
        model: '🤖',
        feature: '🔧',
        category: '📁',
        research: '🔬'
      };
      console.log(`${symbols[type] || '📝'} [MenuHandler] ${message}`);
    }
    
    static async performClick(element) {
      if (!element) return false;
      
      const rect = element.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      
      // PointerEvent sequence
      element.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y
      }));
      
      await this.wait(CONFIG.DELAYS.click);
      
      element.dispatchEvent(new PointerEvent('pointerup', {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y
      }));
      
      element.click();
      
      // サービスに応じた待機時間
      const service = this.detectService();
      const waitTime = service === 'claude' ? CONFIG.claudeWaitTime : CONFIG.waitTime;
      await this.wait(waitTime);
      
      return true;
    }
    
    static async closeClaudeMenu() {
      // Claude専用のメニュークローズ処理（document.bodyに送信）
      document.body.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Escape',
        code: 'Escape',
        bubbles: true
      }));
      
      return this.wait(CONFIG.claudeWaitTime);
    }
    
    static async closeMenu() {
      // 汎用的なメニュークローズ
      document.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Escape',
        code: 'Escape',
        bubbles: true,
        cancelable: true
      }));
      
      // Click outside
      document.body.click();
      
      return this.wait(300);
    }
    
    static async waitForElement(selector, timeout = 3000) {
      const selectors = Array.isArray(selector) ? selector : [selector];
      const startTime = Date.now();
      
      while (Date.now() - startTime < timeout) {
        for (const sel of selectors) {
          try {
            const element = document.querySelector(sel);
            if (element && element.offsetParent !== null) {
              return element;
            }
          } catch (e) {
            continue;
          }
        }
        await this.wait(100);
      }
      return null;
    }
    
    static detectService() {
      const url = window.location.hostname;
      
      // URLベースの検出
      if (url.includes('claude.ai')) {
        return 'claude';
      } else if (url.includes('chatgpt.com') || url.includes('chat.openai.com')) {
        return 'chatgpt';
      } else if (url.includes('gemini.google.com') || url.includes('bard.google.com')) {
        return 'gemini';
      }
      
      return 'unknown';
    }
  }

  // ========================================
  // AIごとのセレクタ定義
  // ========================================
  const SELECTORS = {
    // モデルメニューボタン
    modelButton: {
      claude: [
        '[data-testid="model-selector-dropdown"]',
        '[aria-label="モデルを選択"]',
        '[data-testid="model-selector"]',
        'button[aria-haspopup="menu"]',
        'button[aria-label*="モデル"]'
      ],
      chatgpt: [
        '[data-testid="model-switcher-dropdown-button"]',
        'button[aria-label*="モデル セレクター"]',
        'button[aria-label*="モデル"]',
        'button[aria-label*="Model"]',
        'button[aria-haspopup="menu"]:has-text("GPT")',
        'button[aria-haspopup="menu"]:has-text("o1")'
      ],
      gemini: [
        'button.model-selector',
        '.model-dropdown',
        'button[aria-label*="モデル"]',
        'button:has-text("Gemini")',
        'button:has-text("Flash")'
      ]
    },
    
    // 機能メニューボタン
    functionButton: {
      claude: [
        '[data-testid="input-menu-tools"]',
        '[aria-label="ツールメニューを開く"]',
        'button[aria-label*="ツール"]',
        'button:has(svg[class*="grid"])'
      ],
      chatgpt: [
        'button[aria-label*="一時的なチャット"]',
        'button[aria-label*="GPT"]',
        'button[id*="radix"]',
        'button[data-testid*="gpt"]'
      ],
      gemini: [
        'button.feature-selector',
        'button[aria-label*="機能"]',
        '.feature-menu-button'
      ]
    },
    
    // メニューコンテナ
    menu: {
      common: [
        '[role="menu"][data-state="open"]',
        '[role="menu"]',
        '.relative.w-full.will-change-transform',
        '[class*="will-change-transform"]',
        '.flex.flex-col.min-h-0.w-full',
        'div[style*="max-height"]'
      ]
    },
    
    // メニュー項目
    menuItem: {
      common: [
        '[role="menuitem"]',
        '[role="option"]',
        '[role="menuitemradio"]',
        '.menu-item',
        'button[role="menuitem"]'
      ]
    }
  };


  // ========================================
  // メインハンドラークラス（AI変更検出システムベース）
  // ========================================
  class CommonMenuHandler {
    constructor() {
      this.aiType = Utils.detectService();
      this.models = [];
      this.features = [];
      Utils.log(`AIタイプ検出: ${this.aiType}`, 'info');
    }

    // モデルメニューを開く（AI変更検出システムのロジック使用）
    async openModelMenu() {
      Utils.log('モデルメニューを開いています...', 'model');
      
      const selectors = SELECTORS.modelButton[this.aiType] || [];
      if (selectors.length === 0) {
        Utils.log(`${this.aiType}のモデルメニューセレクタが定義されていません`, 'error');
        return null;
      }

      let retries = CONFIG.maxRetries;
      let button = null;
      
      while (!button && retries > 0) {
        // 優先順位付きセレクタで検索
        for (const selector of selectors) {
          try {
            button = document.querySelector(selector);
            if (button) {
              Utils.log(`セレクタ ${selector} でボタンを発見`, 'success');
              break;
            }
          } catch (e) {
            continue;
          }
        }
        
        // フォールバック: モデル名を含むボタンを探す
        if (!button) {
          const modelNames = ['Opus', 'Sonnet', 'Haiku', 'GPT', 'o1', 'Gemini', 'Flash'];
          button = Array.from(document.querySelectorAll('button')).find(btn => {
            const text = btn.textContent?.trim() || '';
            return modelNames.some(name => text.includes(name)) &&
                   (btn.hasAttribute('aria-haspopup') || btn.hasAttribute('data-testid'));
          });
          if (button) {
            Utils.log('テキストベースでモデルボタンを発見', 'success');
          }
        }
        
        if (!button && retries > 1) {
          Utils.log(`モデルボタン検索リトライ... (残り${retries - 1}回)`, 'warning');
          await Utils.wait(1000);
          retries--;
        } else {
          break;
        }
      }

      if (!button) {
        Utils.log('モデルメニューボタンが見つかりません', 'error');
        return null;
      }

      // 現在のモデルを記録
      const currentModel = button.textContent?.trim();
      Utils.log(`現在のモデル: ${currentModel || '不明'}`, 'info');

      // メニューを開く
      await Utils.performClick(button);
      await Utils.wait(CONFIG.DELAYS.menuOpen);

      // メニューが開いたか確認
      const menu = await this.waitForMenu();
      if (!menu) {
        // 再試行
        Utils.log('メニューが開かないため、再度クリックします', 'warning');
        await Utils.performClick(button);
        await Utils.wait(CONFIG.DELAYS.menuOpen);
        const retryMenu = await this.waitForMenu();
        if (!retryMenu) {
          Utils.log('モデルメニューを開けませんでした', 'error');
          return null;
        }
        return retryMenu;
      }

      Utils.log('モデルメニューが開きました', 'success');
      return menu;
    }

    // 機能メニューを開く（AI変更検出システムのロジック使用）
    async openFunctionMenu() {
      Utils.log('機能メニューを開いています...', 'feature');
      
      const selectors = SELECTORS.functionButton[this.aiType] || [];
      if (selectors.length === 0) {
        Utils.log(`${this.aiType}の機能メニューセレクタが定義されていません`, 'error');
        return null;
      }

      const button = await Utils.waitForElement(selectors, CONFIG.MAX_WAIT);
      if (!button) {
        Utils.log('機能メニューボタンが見つかりません', 'error');
        return null;
      }

      // メニューを開く
      await Utils.performClick(button);
      await Utils.wait(CONFIG.DELAYS.menuOpen);

      // メニューが開いたか確認
      const menu = await this.waitForMenu();
      if (!menu) {
        // 再試行
        Utils.log('メニューが開かないため、再度クリックします', 'warning');
        await Utils.performClick(button);
        await Utils.wait(CONFIG.DELAYS.menuOpen);
        const retryMenu = await this.waitForMenu();
        if (!retryMenu) {
          Utils.log('機能メニューを開けませんでした', 'error');
          return null;
        }
        return retryMenu;
      }

      Utils.log('機能メニューが開きました', 'success');
      return menu;
    }

    // サブメニューを開く（「他のモデル」など）
    async openSubmenu(menuText) {
      Utils.log(`サブメニュー「${menuText}」を開いています...`, 'info');

      const menuItems = await this.getMenuItems();
      const submenuItem = menuItems.find(item => {
        const text = item.textContent?.trim();
        return text && text.includes(menuText);
      });

      if (!submenuItem) {
        Utils.log(`サブメニュー項目「${menuText}」が見つかりません`, 'warning');
        return null;
      }

      await Utils.performClick(submenuItem);
      await Utils.wait(CONFIG.DELAYS.submenuOpen);

      // サブメニューが開いたか確認（新しいメニュー項目が表示される）
      const newMenuItems = await this.getMenuItems();
      if (newMenuItems.length > menuItems.length) {
        Utils.log(`サブメニュー「${menuText}」が開きました`, 'success');
        return true;
      }

      return false;
    }

    // メニューが開くのを待つ
    async waitForMenu(maxWait = CONFIG.MAX_WAIT) {
      const menuSelectors = SELECTORS.menu.common;
      return await Utils.waitForElement(menuSelectors, maxWait);
    }

    // メニュー項目を取得
    async getMenuItems() {
      const itemSelectors = SELECTORS.menuItem.common;
      const items = [];
      
      for (const selector of itemSelectors) {
        try {
          const elements = document.querySelectorAll(selector);
          elements.forEach(el => {
            if (!items.includes(el)) {
              items.push(el);
            }
          });
        } catch (e) {}
      }
      
      return items;
    }

    // メニューを閉じる（AI変更検出システムのロジック使用）
    async closeMenu() {
      Utils.log('メニューを閉じています...', 'info');
      
      if (this.aiType === 'claude') {
        await Utils.closeClaudeMenu();
      } else {
        await Utils.closeMenu();
      }
      
      return Utils.wait(CONFIG.DELAYS.menuClose);
    }

    // モデル一覧を取得
    async getAvailableModels() {
      const menu = await this.openModelMenu();
      if (!menu) return [];

      const models = [];
      const items = await this.getMenuItems();

      for (const item of items) {
        const text = item.textContent?.trim();
        if (text) {
          // モデル名を抽出（説明文を除外）
          let modelName = text;
          const descPatterns = ['情報を', '高性能', 'スマート', '最適な', '高速な', '軽量な'];
          for (const pattern of descPatterns) {
            const index = text.indexOf(pattern);
            if (index > 0) {
              modelName = text.substring(0, index).trim();
              break;
            }
          }
          
          const isSelected = item.getAttribute('aria-selected') === 'true' ||
                           item.getAttribute('aria-checked') === 'true' ||
                           item.classList.contains('selected');

          models.push({
            name: modelName,
            element: item,
            selected: isSelected
          });
        }
      }

      await this.closeMenu();
      return models;
    }

    // 機能一覧を取得
    async getAvailableFunctions() {
      const menu = await this.openFunctionMenu();
      if (!menu) return [];

      const functions = [];
      const items = await this.getMenuItems();

      for (const item of items) {
        const text = item.textContent?.trim();
        if (text && text.length > 0 && text.length < 50) {
          const toggleInput = item.querySelector('input[type="checkbox"][role="switch"]');
          const hasToggle = toggleInput !== null;
          const isActive = hasToggle ? toggleInput.checked : false;

          functions.push({
            name: text,
            element: item,
            hasToggle: hasToggle,
            isActive: isActive
          });
        }
      }

      await this.closeMenu();
      return functions;
    }

    // モデルを選択（AI変更検出システムのロジック使用）
    async selectModel(modelName) {
      const menu = await this.openModelMenu();
      if (!menu) return false;

      const items = await this.getMenuItems();
      let targetItem = null;

      // 完全一致を優先
      for (const item of items) {
        const text = item.textContent?.trim();
        if (text === modelName || text === `Claude ${modelName}` || 
            text === `GPT-${modelName}` || text === `Gemini ${modelName}`) {
          targetItem = item;
          break;
        }
      }

      // 部分一致
      if (!targetItem) {
        for (const item of items) {
          const text = item.textContent?.trim();
          if (text && text.includes(modelName)) {
            targetItem = item;
            break;
          }
        }
      }

      if (targetItem) {
        await Utils.performClick(targetItem);
        Utils.log(`モデル「${modelName}」を選択しました`, 'success');
        await Utils.wait(CONFIG.DELAYS.modelSwitch);
        return true;
      }

      Utils.log(`モデル「${modelName}」が見つかりません`, 'error');
      await this.closeMenu();
      return false;
    }

    // 機能を選択（AI変更検出システムのロジック使用）
    async selectFunction(functionName, enable = true) {
      const menu = await this.openFunctionMenu();
      if (!menu) return false;

      const items = await this.getMenuItems();
      let targetItem = null;

      for (const item of items) {
        const text = item.textContent?.trim();
        if (text === functionName || text.includes(functionName)) {
          targetItem = item;
          break;
        }
      }

      if (targetItem) {
        const toggleInput = targetItem.querySelector('input[type="checkbox"][role="switch"]');
        if (toggleInput) {
          const isCurrentlyActive = toggleInput.checked;
          if ((enable && !isCurrentlyActive) || (!enable && isCurrentlyActive)) {
            await Utils.performClick(targetItem);
            Utils.log(`機能「${functionName}」を${enable ? 'ON' : 'OFF'}にしました`, 'success');
          } else {
            Utils.log(`機能「${functionName}」は既に${isCurrentlyActive ? 'ON' : 'OFF'}です`, 'info');
          }
        } else {
          await Utils.performClick(targetItem);
          Utils.log(`機能「${functionName}」をクリックしました`, 'success');
        }
        
        await this.closeMenu();
        return true;
      }

      Utils.log(`機能「${functionName}」が見つかりません`, 'error');
      await this.closeMenu();
      return false;
    }
  }

  // ========================================
  // グローバル公開
  // ========================================
  window.CommonMenuHandler = CommonMenuHandler;
  
  // 自動インスタンス作成
  window.menuHandler = new CommonMenuHandler();

  Utils.log('✅ 共通メニューハンドラーが利用可能になりました（AI変更検出システムベース）', 'success');
  Utils.log('使用方法:', 'info');
  Utils.log('  await menuHandler.openModelMenu()     // モデルメニューを開く', 'info');
  Utils.log('  await menuHandler.openFunctionMenu()  // 機能メニューを開く', 'info');
  Utils.log('  await menuHandler.selectModel("Opus") // モデル選択', 'info');
  Utils.log('  await menuHandler.selectFunction("検索") // 機能選択', 'info');

})();