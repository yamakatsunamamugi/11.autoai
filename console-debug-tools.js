/**
 * コンソールデバッグツール - Deep Research問題診断用
 * 
 * 使用方法:
 * 1. ChatGPTのコンソールでこのスクリプトを実行
 * 2. debugDeepResearch() を実行して問題を診断
 */

(function() {
    'use strict';
    
    console.log('🔧 Deep Research コンソールデバッグツール読み込み');
    
    // メニュー状態を詳細に調査する関数
    window.debugMenuState = function() {
        console.log('\n🔍 === メニュー状態診断 ===');
        
        // 1. 基本的なメニューセレクタをチェック
        const menuSelectors = [
            '[role="menu"]',
            '[role="menu"][data-state="open"]',
            '[data-radix-popper-content-wrapper] [role="menu"]',
            '.popover[role="menu"]'
        ];
        
        console.log('📋 メニューコンテナ検索:');
        menuSelectors.forEach(selector => {
            const menus = document.querySelectorAll(selector);
            console.log(`  ${selector}: ${menus.length}個`);
            menus.forEach((menu, index) => {
                const visible = menu.offsetParent !== null;
                const rect = menu.getBoundingClientRect();
                console.log(`    [${index}] 表示:${visible}, サイズ:${rect.width}x${rect.height}`);
            });
        });
        
        // 2. Deep Research要素を探す
        console.log('\n🎯 Deep Research要素検索:');
        const deepResearchSelectors = [
            '[role="menuitemradio"]:contains("Deep Research")',
            '[role="menuitem"]:contains("Deep Research")',
            '*:contains("Deep Research")'
        ];
        
        // 全てのメニュー項目をチェック
        const allMenuItems = document.querySelectorAll('[role="menuitem"], [role="menuitemradio"], [role="option"]');
        console.log(`📝 全メニュー項目数: ${allMenuItems.length}`);
        
        allMenuItems.forEach((item, index) => {
            const text = item.textContent?.trim();
            const role = item.getAttribute('role');
            const visible = item.offsetParent !== null;
            const rect = item.getBoundingClientRect();
            
            if (text && text.includes('Deep Research')) {
                console.log(`  🎯 [${index}] "${text}" (${role})`);
                console.log(`      表示:${visible}, サイズ:${rect.width}x${rect.height}`);
                console.log(`      位置:x=${rect.x}, y=${rect.y}`);
                console.log(`      aria-checked:${item.getAttribute('aria-checked')}`);
                console.log(`      disabled:${item.disabled}`);
            }
        });
        
        return { totalMenus: menuSelectors.length, totalItems: allMenuItems.length };
    };
    
    // メニューを強制的に開く関数
    window.forceOpenFunctionMenu = async function() {
        console.log('\n🔓 === 機能メニューを強制オープン ===');
        
        const functionButtonSelectors = [
            '[data-testid="composer-plus-btn"]',
            '[data-testid="input-menu-trigger"]',
            '[aria-label="Add"]',
            'button[aria-label*="Add"]'
        ];
        
        console.log('🔍 機能ボタンを探索中...');
        let button = null;
        
        for (const selector of functionButtonSelectors) {
            const buttons = document.querySelectorAll(selector);
            console.log(`  ${selector}: ${buttons.length}個`);
            
            for (const btn of buttons) {
                if (btn.offsetParent !== null) {
                    button = btn;
                    console.log(`  ✅ 表示されているボタンを発見: ${selector}`);
                    break;
                }
            }
            if (button) break;
        }
        
        if (!button) {
            console.log('❌ 機能ボタンが見つかりません');
            return false;
        }
        
        console.log('🖱️ ボタンをクリック中...');
        
        // 複数のクリック手法を試す
        const clickMethods = [
            () => {
                console.log('  試行1: PointerEvent');
                button.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
                button.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
                button.dispatchEvent(new PointerEvent('click', { bubbles: true }));
            },
            () => {
                console.log('  試行2: MouseEvent');
                button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
                button.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
                button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            },
            () => {
                console.log('  試行3: element.click()');
                button.click();
            },
            () => {
                console.log('  試行4: focus + Enter');
                button.focus();
                button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
            }
        ];
        
        for (const method of clickMethods) {
            try {
                method();
                await new Promise(resolve => setTimeout(resolve, 1000));
                
                // メニューが開いたかチェック
                const menus = document.querySelectorAll('[role="menu"]:not([style*="display: none"])');
                if (menus.length > 0) {
                    console.log('  ✅ メニューが開きました');
                    return true;
                }
            } catch (e) {
                console.log(`  ❌ エラー: ${e.message}`);
            }
        }
        
        console.log('❌ 全てのクリック手法が失敗しました');
        return false;
    };
    
    // Deep Research要素を直接クリックする関数
    window.clickDeepResearch = async function() {
        console.log('\n🎯 === Deep Research直接クリック ===');
        
        // まず要素を探す
        const allItems = document.querySelectorAll('[role="menuitem"], [role="menuitemradio"]');
        let deepResearchElement = null;
        
        for (const item of allItems) {
            if (item.textContent?.trim() === 'Deep Research') {
                deepResearchElement = item;
                break;
            }
        }
        
        if (!deepResearchElement) {
            console.log('❌ Deep Research要素が見つかりません');
            return false;
        }
        
        console.log('✅ Deep Research要素を発見');
        console.log(`  テキスト: "${deepResearchElement.textContent?.trim()}"`);
        console.log(`  role: ${deepResearchElement.getAttribute('role')}`);
        console.log(`  表示: ${deepResearchElement.offsetParent !== null}`);
        console.log(`  disabled: ${deepResearchElement.disabled}`);
        
        const rect = deepResearchElement.getBoundingClientRect();
        console.log(`  位置: x=${rect.x}, y=${rect.y}, w=${rect.width}, h=${rect.height}`);
        
        if (deepResearchElement.offsetParent === null) {
            console.log('⚠️ 要素が非表示です。親要素を確認中...');
            
            let parent = deepResearchElement.parentElement;
            let level = 1;
            while (parent && level <= 5) {
                const parentVisible = parent.offsetParent !== null;
                const parentRect = parent.getBoundingClientRect();
                console.log(`    親${level}: ${parent.tagName} 表示:${parentVisible} サイズ:${parentRect.width}x${parentRect.height}`);
                parent = parent.parentElement;
                level++;
            }
        }
        
        // 強制表示を試みる
        console.log('🔧 強制表示を試行中...');
        deepResearchElement.style.display = 'block';
        deepResearchElement.style.visibility = 'visible';
        deepResearchElement.style.opacity = '1';
        
        // スクロールして表示
        deepResearchElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // クリックを試行
        console.log('🖱️ クリックを試行中...');
        const clickMethods = [
            () => {
                console.log('  試行1: element.click()');
                deepResearchElement.click();
            },
            () => {
                console.log('  試行2: PointerEvent');
                deepResearchElement.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
                deepResearchElement.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
                deepResearchElement.dispatchEvent(new PointerEvent('click', { bubbles: true }));
            },
            () => {
                console.log('  試行3: MouseEvent');
                const rect = deepResearchElement.getBoundingClientRect();
                const x = rect.left + rect.width / 2;
                const y = rect.top + rect.height / 2;
                
                deepResearchElement.dispatchEvent(new MouseEvent('mousedown', { 
                    bubbles: true, clientX: x, clientY: y 
                }));
                deepResearchElement.dispatchEvent(new MouseEvent('mouseup', { 
                    bubbles: true, clientX: x, clientY: y 
                }));
                deepResearchElement.dispatchEvent(new MouseEvent('click', { 
                    bubbles: true, clientX: x, clientY: y 
                }));
            }
        ];
        
        for (const method of clickMethods) {
            try {
                method();
                await new Promise(resolve => setTimeout(resolve, 200));
                
                // aria-checkedが変更されたかチェック
                const isChecked = deepResearchElement.getAttribute('aria-checked');
                console.log(`  結果: aria-checked=${isChecked}`);
                
                if (isChecked === 'true') {
                    console.log('  ✅ クリック成功！');
                    return true;
                }
            } catch (e) {
                console.log(`  ❌ エラー: ${e.message}`);
            }
        }
        
        console.log('❌ 全てのクリック手法が失敗しました');
        return false;
    };
    
    // 完全な診断を実行
    window.debugDeepResearch = async function() {
        console.log('🚀 === Deep Research 完全診断開始 ===\n');
        
        // 1. メニュー状態診断
        const menuState = debugMenuState();
        
        // 2. 機能メニューを開く
        console.log('\n📂 機能メニューを開いています...');
        const menuOpened = await forceOpenFunctionMenu();
        
        if (menuOpened) {
            // 3. メニュー開放後の状態確認
            setTimeout(() => {
                console.log('\n📋 メニュー開放後の状態:');
                debugMenuState();
                
                // 4. Deep Researchクリックを試行
                setTimeout(() => {
                    clickDeepResearch();
                }, 1000);
            }, 500);
        }
        
        return { menuState, menuOpened };
    };
    
    console.log('✅ デバッグツール準備完了');
    console.log('💡 使用方法:');
    console.log('  debugDeepResearch() - 完全診断');
    console.log('  debugMenuState() - メニュー状態確認');
    console.log('  forceOpenFunctionMenu() - 機能メニュー強制オープン');
    console.log('  clickDeepResearch() - Deep Research直接クリック');
    
})();