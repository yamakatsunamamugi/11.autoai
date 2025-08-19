/**
 * Deep Researchを強制的にクリックするための包括的コンソールコード
 * ChatGPTのコンソールで実行して、様々な方法でクリックを試行
 */

(function() {
    'use strict';
    
    console.log('🎯 Deep Research 強制クリックツール');
    
    // 1. メニューを開いてDeep Researchを探す
    window.findDeepResearch = function() {
        console.log('\n🔍 === Deep Research要素を探索 ===');
        
        // まず機能メニューを開く
        const button = document.querySelector('[data-testid="composer-plus-btn"]');
        if (button && button.offsetParent !== null) {
            console.log('📂 機能メニューボタン発見、クリック...');
            button.click();
            
            return new Promise(resolve => {
                setTimeout(() => {
                    // Deep Research要素を探す
                    const allItems = document.querySelectorAll('[role="menuitem"], [role="menuitemradio"], [role="option"]');
                    console.log(`📝 メニュー項目数: ${allItems.length}`);
                    
                    let deepResearchElement = null;
                    allItems.forEach((item, index) => {
                        const text = item.textContent?.trim();
                        if (text) {
                            console.log(`  [${index}] "${text}" (${item.getAttribute('role')})`);
                            if (text === 'Deep Research' || text.includes('Deep Research')) {
                                deepResearchElement = item;
                                console.log(`  🎯 Deep Research発見！`);
                            }
                        }
                    });
                    
                    resolve(deepResearchElement);
                }, 1000);
            });
        } else {
            console.log('❌ 機能メニューボタンが見つかりません');
            return null;
        }
    };
    
    // 2. 様々なクリック方法を試す
    window.tryAllClickMethods = async function(element) {
        if (!element) {
            console.log('❌ 要素がnullです');
            return false;
        }
        
        console.log('\n🖱️ === 全クリック方法を試行 ===');
        
        // 要素の状態を確認
        const rect = element.getBoundingClientRect();
        console.log(`📍 要素位置: x=${rect.x}, y=${rect.y}, width=${rect.width}, height=${rect.height}`);
        console.log(`👁️ offsetParent: ${element.offsetParent ? 'あり' : 'なし'}`);
        console.log(`🎨 表示状態: ${window.getComputedStyle(element).display}`);
        
        const methods = [
            {
                name: '方法1: element.click()',
                execute: () => element.click()
            },
            {
                name: '方法2: MouseEvent (click)',
                execute: () => {
                    element.dispatchEvent(new MouseEvent('click', {
                        view: window,
                        bubbles: true,
                        cancelable: true
                    }));
                }
            },
            {
                name: '方法3: MouseEvent (mousedown + mouseup + click)',
                execute: () => {
                    element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
                    element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
                    element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
                }
            },
            {
                name: '方法4: PointerEvent (pointerdown + pointerup + click)',
                execute: () => {
                    element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
                    element.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
                    element.dispatchEvent(new PointerEvent('click', { bubbles: true }));
                }
            },
            {
                name: '方法5: MouseEvent with coordinates',
                execute: () => {
                    const rect = element.getBoundingClientRect();
                    const x = rect.left + rect.width / 2;
                    const y = rect.top + rect.height / 2;
                    
                    element.dispatchEvent(new MouseEvent('click', {
                        view: window,
                        bubbles: true,
                        cancelable: true,
                        clientX: x,
                        clientY: y
                    }));
                }
            },
            {
                name: '方法6: PointerEvent with coordinates',
                execute: () => {
                    const rect = element.getBoundingClientRect();
                    const x = rect.left + rect.width / 2;
                    const y = rect.top + rect.height / 2;
                    
                    element.dispatchEvent(new PointerEvent('click', {
                        view: window,
                        bubbles: true,
                        cancelable: true,
                        clientX: x,
                        clientY: y,
                        pointerId: 1,
                        pointerType: 'mouse'
                    }));
                }
            },
            {
                name: '方法7: Focus + Enter',
                execute: () => {
                    element.focus();
                    element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
                    element.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }));
                }
            },
            {
                name: '方法8: Focus + Space',
                execute: () => {
                    element.focus();
                    element.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
                    element.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', bubbles: true }));
                }
            },
            {
                name: '方法9: jQuery風クリック (もしあれば)',
                execute: () => {
                    if (typeof jQuery !== 'undefined' && jQuery(element).length > 0) {
                        jQuery(element).trigger('click');
                    } else {
                        console.log('  jQuery not available');
                        element.click();
                    }
                }
            },
            {
                name: '方法10: 強制的なイベント発火',
                execute: () => {
                    const evt = document.createEvent('HTMLEvents');
                    evt.initEvent('click', true, true);
                    element.dispatchEvent(evt);
                }
            }
        ];
        
        for (let i = 0; i < methods.length; i++) {
            const method = methods[i];
            console.log(`\n🔄 ${method.name}`);
            
            try {
                // クリック実行
                method.execute();
                
                // 少し待つ
                await new Promise(resolve => setTimeout(resolve, 300));
                
                // 結果を確認
                const ariaChecked = element.getAttribute('aria-checked');
                const isSelected = ariaChecked === 'true';
                
                console.log(`  結果: aria-checked="${ariaChecked}"`);
                
                if (isSelected) {
                    console.log('  ✅ クリック成功！Deep Researchが選択されました！');
                    return true;
                } else {
                    console.log('  ❌ クリック失敗（aria-checkedがfalseのまま）');
                }
                
            } catch (error) {
                console.log(`  ❌ エラー: ${error.message}`);
            }
        }
        
        return false;
    };
    
    // 3. 親要素をクリックする試み
    window.tryParentClick = async function(element) {
        if (!element) return false;
        
        console.log('\n👆 === 親要素クリック試行 ===');
        
        let parent = element.parentElement;
        let level = 1;
        
        while (parent && level <= 3) {
            console.log(`\n📦 親要素レベル${level}: ${parent.tagName}`);
            console.log(`  class: ${parent.className}`);
            console.log(`  role: ${parent.getAttribute('role')}`);
            
            try {
                parent.click();
                await new Promise(resolve => setTimeout(resolve, 300));
                
                const ariaChecked = element.getAttribute('aria-checked');
                if (ariaChecked === 'true') {
                    console.log('  ✅ 親要素クリックで成功！');
                    return true;
                }
            } catch (e) {
                console.log(`  ❌ エラー: ${e.message}`);
            }
            
            parent = parent.parentElement;
            level++;
        }
        
        return false;
    };
    
    // 4. メインの実行関数
    window.forceDeepResearchClick = async function() {
        console.log('🚀 === Deep Research強制クリック開始 ===\n');
        
        // Step 1: Deep Research要素を探す
        const element = await findDeepResearch();
        
        if (!element) {
            console.log('❌ Deep Research要素が見つかりません');
            return false;
        }
        
        // Step 2: 現在の状態を確認
        const currentAriaChecked = element.getAttribute('aria-checked');
        console.log(`\n📊 現在の状態: aria-checked="${currentAriaChecked}"`);
        
        if (currentAriaChecked === 'true') {
            console.log('✅ Deep Researchは既に選択されています！');
            return true;
        }
        
        // Step 3: 様々なクリック方法を試す
        const success = await tryAllClickMethods(element);
        
        if (!success) {
            console.log('\n🔄 通常のクリックが失敗したので、親要素クリックを試します...');
            const parentSuccess = await tryParentClick(element);
            
            if (parentSuccess) {
                return true;
            }
        } else {
            return true;
        }
        
        // Step 4: 最終手段
        console.log('\n🔨 === 最終手段 ===');
        console.log('要素のHTMLを確認:');
        console.log(element.outerHTML);
        console.log('\nイベントリスナーを確認（Chrome DevTools):');
        console.log('getEventListeners(element) を実行してください');
        
        return false;
    };
    
    // 5. 簡易実行関数
    window.quickClick = function() {
        const allItems = document.querySelectorAll('[role="menuitem"], [role="menuitemradio"]');
        for (const item of allItems) {
            if (item.textContent?.trim() === 'Deep Research') {
                console.log('🎯 Deep Research発見、クリック実行');
                item.click();
                setTimeout(() => {
                    console.log(`結果: aria-checked="${item.getAttribute('aria-checked')}"`);
                }, 200);
                return;
            }
        }
        console.log('❌ Deep Research要素が見つかりません');
    };
    
    console.log('✅ ツール準備完了');
    console.log('💡 使用方法:');
    console.log('  forceDeepResearchClick() - 完全な強制クリック実行（推奨）');
    console.log('  quickClick() - 素早くクリックを試す');
    console.log('  findDeepResearch() - Deep Research要素を探す');
    console.log('  tryAllClickMethods(element) - 全クリック方法を試す');
    
})();