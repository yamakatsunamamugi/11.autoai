// 共通メニューハンドラー
// 全AI（ChatGPT、Claude、Gemini）で共通のメニュー開閉処理を提供
(() => {
  "use strict";

  // ========================================
  // 設定
  // ========================================
  const CONFIG = {
    DELAYS: {
      click: 50,
      menuOpen: 1500,
      menuClose: 1000,
      modelSwitch: 2000,
      elementSearch: 500,
      submenuOpen: 1000
    },
    MAX_RETRIES: 3,
    MAX_WAIT: 5000
  };

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
  // ユーティリティ関数
  // ========================================
  const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  const log = (message, type = 'INFO') => {
    const prefix = {
      'INFO': '📝',
      'SUCCESS': '✅',
      'ERROR': '❌',
      'WARNING': '⚠️',
      'DEBUG': '🔍'
    }[type] || '📝';
    console.log(`${prefix} [MenuHandler] ${message}`);
  };

  const detectAIType = () => {
    const hostname = window.location.hostname;
    if (hostname.includes('claude.ai')) return 'claude';
    if (hostname.includes('chatgpt.com') || hostname.includes('chat.openai.com')) return 'chatgpt';
    if (hostname.includes('gemini.google.com')) return 'gemini';
    return null;
  };

  const findElement = async (selectors, condition = null, maxWait = CONFIG.MAX_WAIT) => {
    const startTime = Date.now();
    while (Date.now() - startTime < maxWait) {
      for (const selector of selectors) {
        try {
          const elements = document.querySelectorAll(selector);
          for (const element of elements) {
            if (!condition || condition(element)) {
              return element;
            }
          }
        } catch (e) {}
      }
      
      // フォールバック: textContentでの検索
      if (selectors.some(s => s.includes(':has-text'))) {
        const allButtons = document.querySelectorAll('button');
        for (const btn of allButtons) {
          const text = btn.textContent?.trim() || '';
          if (condition && condition(btn)) {
            return btn;
          }
        }
      }
      
      await wait(CONFIG.DELAYS.elementSearch);
    }
    return null;
  };

  const performClick = async (element) => {
    if (!element) return false;
    try {
      const rect = element.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;

      element.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: x,
        clientY: y,
        pointerId: 1
      }));

      await wait(CONFIG.DELAYS.click);

      element.dispatchEvent(new PointerEvent('pointerup', {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: x,
        clientY: y,
        pointerId: 1
      }));

      element.click();
      return true;
    } catch (e) {
      return false;
    }
  };

  const closeMenu = () => {
    document.body.dispatchEvent(new KeyboardEvent('keydown', { 
      key: 'Escape', 
      code: 'Escape',
      bubbles: true 
    }));
  };

  // ========================================
  // メインハンドラークラス
  // ========================================
  class CommonMenuHandler {
    constructor() {
      this.aiType = detectAIType();
      log(`AIタイプ検出: ${this.aiType}`);
    }

    // モデルメニューを開く
    async openModelMenu() {
      log('モデルメニューを開いています...', 'INFO');
      
      const selectors = SELECTORS.modelButton[this.aiType] || [];
      if (selectors.length === 0) {
        log(`${this.aiType}のモデルメニューセレクタが定義されていません`, 'ERROR');
        return null;
      }

      let retries = CONFIG.MAX_RETRIES;
      let button = null;
      
      while (!button && retries > 0) {
        // セレクタで検索
        button = await findElement(selectors, null, CONFIG.MAX_WAIT);
        
        // フォールバック: モデル名を含むボタンを探す
        if (!button) {
          const modelNames = ['Opus', 'Sonnet', 'Haiku', 'GPT', 'o1', 'Gemini', 'Flash'];
          button = await findElement(
            ['button'],
            (btn) => {
              const text = btn.textContent?.trim() || '';
              return modelNames.some(name => text.includes(name)) &&
                     (btn.hasAttribute('aria-haspopup') || btn.hasAttribute('data-testid'));
            },
            2000
          );
        }
        
        if (!button && retries > 1) {
          log(`モデルボタン検索リトライ... (残り${retries - 1}回)`, 'WARNING');
          await wait(1000);
          retries--;
        } else {
          break;
        }
      }

      if (!button) {
        log('モデルメニューボタンが見つかりません', 'ERROR');
        return null;
      }

      // 現在のモデルを記録
      const currentModel = button.textContent?.trim();
      log(`現在のモデル: ${currentModel || '不明'}`);

      // メニューを開く
      await performClick(button);
      await wait(CONFIG.DELAYS.menuOpen);

      // メニューが開いたか確認
      const menu = await this.waitForMenu();
      if (!menu) {
        // 再試行
        log('メニューが開かないため、再度クリックします', 'WARNING');
        await performClick(button);
        await wait(CONFIG.DELAYS.menuOpen);
        const retryMenu = await this.waitForMenu();
        if (!retryMenu) {
          log('モデルメニューを開けませんでした', 'ERROR');
          return null;
        }
        return retryMenu;
      }

      log('モデルメニューが開きました', 'SUCCESS');
      return menu;
    }

    // 機能メニューを開く
    async openFunctionMenu() {
      log('機能メニューを開いています...', 'INFO');
      
      const selectors = SELECTORS.functionButton[this.aiType] || [];
      if (selectors.length === 0) {
        log(`${this.aiType}の機能メニューセレクタが定義されていません`, 'ERROR');
        return null;
      }

      const button = await findElement(selectors, null, CONFIG.MAX_WAIT);
      if (!button) {
        log('機能メニューボタンが見つかりません', 'ERROR');
        return null;
      }

      // メニューを開く
      await performClick(button);
      await wait(CONFIG.DELAYS.menuOpen);

      // メニューが開いたか確認
      const menu = await this.waitForMenu();
      if (!menu) {
        // 再試行
        log('メニューが開かないため、再度クリックします', 'WARNING');
        await performClick(button);
        await wait(CONFIG.DELAYS.menuOpen);
        const retryMenu = await this.waitForMenu();
        if (!retryMenu) {
          log('機能メニューを開けませんでした', 'ERROR');
          return null;
        }
        return retryMenu;
      }

      log('機能メニューが開きました', 'SUCCESS');
      return menu;
    }

    // サブメニューを開く（「他のモデル」など）
    async openSubmenu(menuText) {
      log(`サブメニュー「${menuText}」を開いています...`, 'INFO');

      const menuItems = await this.getMenuItems();
      const submenuItem = menuItems.find(item => {
        const text = item.textContent?.trim();
        return text && text.includes(menuText);
      });

      if (!submenuItem) {
        log(`サブメニュー項目「${menuText}」が見つかりません`, 'WARNING');
        return null;
      }

      await performClick(submenuItem);
      await wait(CONFIG.DELAYS.submenuOpen);

      // サブメニューが開いたか確認（新しいメニュー項目が表示される）
      const newMenuItems = await this.getMenuItems();
      if (newMenuItems.length > menuItems.length) {
        log(`サブメニュー「${menuText}」が開きました`, 'SUCCESS');
        return true;
      }

      return false;
    }

    // メニューが開くのを待つ
    async waitForMenu(maxWait = CONFIG.MAX_WAIT) {
      const menuSelectors = SELECTORS.menu.common;
      return await findElement(menuSelectors, null, maxWait);
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

    // メニューを閉じる
    closeMenu() {
      log('メニューを閉じています...', 'INFO');
      closeMenu();
      return wait(CONFIG.DELAYS.menuClose);
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

    // モデルを選択
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
        await performClick(targetItem);
        log(`モデル「${modelName}」を選択しました`, 'SUCCESS');
        await wait(CONFIG.DELAYS.modelSwitch);
        return true;
      }

      log(`モデル「${modelName}」が見つかりません`, 'ERROR');
      await this.closeMenu();
      return false;
    }

    // 機能を選択
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
            await performClick(targetItem);
            log(`機能「${functionName}」を${enable ? 'ON' : 'OFF'}にしました`, 'SUCCESS');
          } else {
            log(`機能「${functionName}」は既に${isCurrentlyActive ? 'ON' : 'OFF'}です`, 'INFO');
          }
        } else {
          await performClick(targetItem);
          log(`機能「${functionName}」をクリックしました`, 'SUCCESS');
        }
        
        await this.closeMenu();
        return true;
      }

      log(`機能「${functionName}」が見つかりません`, 'ERROR');
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

  log('✅ 共通メニューハンドラーが利用可能になりました', 'SUCCESS');
  log('使用方法:', 'INFO');
  log('  await menuHandler.openModelMenu()     // モデルメニューを開く', 'INFO');
  log('  await menuHandler.openFunctionMenu()  // 機能メニューを開く', 'INFO');
  log('  await menuHandler.selectModel("Opus") // モデル選択', 'INFO');
  log('  await menuHandler.selectFunction("検索") // 機能選択', 'INFO');

})();