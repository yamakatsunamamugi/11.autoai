/**
 * 現在のDeep Research問題を診断するコンソール用コード
 * ChatGPTのコンソールで直接実行して問題を特定
 */

(function() {
    'use strict';
    
    console.log('🔧 Deep Research 現在問題診断ツール');
    
    // 1. 現在の統合テスト状況を確認
    window.debugCurrentIssue = function() {
        console.log('\n🚀 === 現在の問題診断開始 ===');
        
        // AIHandlerの状態確認
        console.log('\n📊 AIHandler状態:');
        console.log('  window.AIHandler:', typeof window.AIHandler);
        
        if (window.AIHandler) {
            console.log('  window.AIHandler.MenuHandler:', typeof window.AIHandler.MenuHandler);
            console.log('  window.AIHandler.getSelectors:', typeof window.AIHandler.getSelectors);
            
            // セレクタ確認
            try {
                const selectors = window.AIHandler.getSelectors('ChatGPT', 'MENU_ITEM');
                console.log('  ChatGPT.MENU_ITEM:', JSON.stringify(selectors));
            } catch (e) {
                console.log('  ChatGPT.MENU_ITEM エラー:', e.message);
            }
        }
        
        // メニューハンドラーのテスト
        console.log('\n🔧 MenuHandler直接テスト:');
        if (window.AIHandler && window.AIHandler.MenuHandler) {
            try {
                const handler = new window.AIHandler.MenuHandler('ChatGPT');
                console.log('  MenuHandler作成: ✅');
                
                // selectFunction を直接テスト
                handler.selectFunction('Deep Research').then(result => {
                    console.log(`  selectFunction結果: ${result}`);
                }).catch(err => {
                    console.log(`  selectFunction エラー: ${err.message}`);
                });
            } catch (e) {
                console.log(`  MenuHandler作成エラー: ${e.message}`);
            }
        }
    };
    
    // 2. 要素の可視性を詳細にテスト
    window.testElementVisibility = function() {
        console.log('\n👀 === 要素可視性テスト ===');
        
        // 機能メニューを開く
        const button = document.querySelector('[data-testid="composer-plus-btn"]');
        if (button) {
            console.log('🖱️ 機能ボタンをクリック...');
            button.click();
            
            setTimeout(() => {
                // Deep Research要素を探して詳細分析
                const allItems = document.querySelectorAll('[role="menuitem"], [role="menuitemradio"]');
                console.log(`📝 全メニュー項目数: ${allItems.length}`);
                
                let deepResearchElement = null;
                allItems.forEach((item, index) => {
                    const text = item.textContent?.trim();
                    console.log(`  [${index}] "${text}" (${item.getAttribute('role')})`);
                    
                    if (text === 'Deep Research') {
                        deepResearchElement = item;
                        console.log(`\n🎯 Deep Research要素詳細分析:`);
                        
                        // 可視性の詳細チェック
                        const visible = item.offsetParent !== null;
                        const rect = item.getBoundingClientRect();
                        const computed = window.getComputedStyle(item);
                        
                        console.log(`  offsetParent: ${item.offsetParent ? 'あり' : 'なし'}`);
                        console.log(`  getBoundingClientRect: ${rect.width}x${rect.height} at (${rect.x}, ${rect.y})`);
                        console.log(`  display: ${computed.display}`);
                        console.log(`  visibility: ${computed.visibility}`);
                        console.log(`  opacity: ${computed.opacity}`);
                        console.log(`  zIndex: ${computed.zIndex}`);
                        
                        // 親要素の確認
                        let parent = item.parentElement;
                        let level = 1;
                        console.log(`  親要素チェック:`);
                        while (parent && level <= 3) {
                            const parentVisible = parent.offsetParent !== null;
                            const parentComputed = window.getComputedStyle(parent);
                            console.log(`    親${level}: ${parent.tagName} visible=${parentVisible} display=${parentComputed.display}`);
                            parent = parent.parentElement;
                            level++;
                        }
                    }
                });
                
                return deepResearchElement;
            }, 1000);
        } else {
            console.log('❌ 機能ボタンが見つかりません');
        }
    };
    
    // 3. tryMultipleClickMethodsの動作をシミュレート
    window.simulateClickMethods = function() {
        console.log('\n🎯 === クリック方法シミュレーション ===');
        
        // 機能メニューを開いてからテスト
        const button = document.querySelector('[data-testid="composer-plus-btn"]');
        if (button) {
            button.click();
            
            setTimeout(() => {
                const allItems = document.querySelectorAll('[role="menuitem"], [role="menuitemradio"]');
                let deepResearchElement = null;
                
                for (const item of allItems) {
                    if (item.textContent?.trim() === 'Deep Research') {
                        deepResearchElement = item;
                        break;
                    }
                }
                
                if (deepResearchElement) {
                    console.log('✅ Deep Research要素を発見');
                    
                    // 現在のcommon-ai-handler.jsの可視性チェックをシミュレート
                    const rect = deepResearchElement.getBoundingClientRect();
                    const visible = deepResearchElement.offsetParent !== null;
                    const inViewport = rect.width > 0 && rect.height > 0;
                    
                    console.log(`📊 可視性チェック結果:`);
                    console.log(`  visible (offsetParent !== null): ${visible}`);
                    console.log(`  inViewport (width>0 && height>0): ${inViewport}`);
                    console.log(`  サイズ: ${rect.width}x${rect.height}`);
                    
                    // 修正後の条件をテスト
                    const shouldSkip = !visible && !inViewport;
                    console.log(`  修正後の条件 (!visible && !inViewport): ${shouldSkip}`);
                    
                    if (shouldSkip) {
                        console.log('⚠️ 要素が完全に非表示のためクリックをスキップします');
                    } else {
                        console.log('✅ クリック実行可能');
                        
                        // element.click()をテスト
                        console.log('🖱️ element.click()を実行...');
                        deepResearchElement.click();
                        
                        setTimeout(() => {
                            const isChecked = deepResearchElement.getAttribute('aria-checked');
                            console.log(`  結果: aria-checked=${isChecked}`);
                            console.log(isChecked === 'true' ? '✅ クリック成功！' : '❌ クリック失敗');
                        }, 200);
                    }
                } else {
                    console.log('❌ Deep Research要素が見つかりません');
                }
            }, 1000);
        }
    };
    
    // 4. 統合テストのログを再現
    window.reproduceIntegrationTest = function() {
        console.log('\n🔄 === 統合テスト再現 ===');
        
        // ChatGPTAutomationの機能選択をシミュレート
        if (window.ChatGPTAutomation && window.ChatGPTAutomation.selectFunction) {
            console.log('🤖 ChatGPTAutomation.selectFunction("Deep Research")を実行...');
            
            window.ChatGPTAutomation.selectFunction('Deep Research').then(result => {
                console.log(`統合テスト結果: ${result}`);
            }).catch(err => {
                console.log(`統合テストエラー: ${err.message}`);
            });
        } else {
            console.log('❌ ChatGPTAutomationが利用できません');
        }
    };
    
    // 5. 完全診断を実行
    window.fullDiagnosis = async function() {
        console.log('🚀 === 完全診断実行 ===\n');
        
        // 順次実行
        debugCurrentIssue();
        
        setTimeout(() => {
            testElementVisibility();
        }, 1000);
        
        setTimeout(() => {
            simulateClickMethods();
        }, 3000);
        
        setTimeout(() => {
            reproduceIntegrationTest();
        }, 5000);
    };
    
    console.log('✅ 診断ツール準備完了');
    console.log('💡 使用方法:');
    console.log('  fullDiagnosis() - 完全診断実行（推奨）');
    console.log('  debugCurrentIssue() - AIHandler状態確認');
    console.log('  testElementVisibility() - 要素可視性テスト');
    console.log('  simulateClickMethods() - クリック方法シミュレーション');
    console.log('  reproduceIntegrationTest() - 統合テスト再現');
    
})();