/**
 * Deep Research選択を確実に実行するための修正コード
 * 統合AIテストで機能選択が正しく動作するように修正
 */

(function() {
    'use strict';
    
    console.log('🔧 Deep Research選択修正ツール');
    
    // 1. 現在の選択状態を確認
    window.checkCurrentSelection = function() {
        console.log('\n📊 === 現在の機能選択状態 ===');
        
        // 全てのラジオボタン型機能を確認
        const radioItems = document.querySelectorAll('[role="menuitemradio"]');
        console.log(`ラジオボタン型機能数: ${radioItems.length}`);
        
        radioItems.forEach((item, index) => {
            const text = item.textContent?.trim();
            const checked = item.getAttribute('aria-checked');
            console.log(`  [${index}] "${text}" - aria-checked="${checked}"`);
        });
        
        return radioItems;
    };
    
    // 2. 機能メニューを開いてDeep Researchを選択
    window.selectDeepResearchCorrectly = async function() {
        console.log('\n🚀 === Deep Research正しい選択プロセス ===');
        
        // Step 1: 機能メニューを開く
        console.log('\n📂 Step 1: 機能メニューを開く');
        const functionButton = document.querySelector('[data-testid="composer-plus-btn"]');
        
        if (!functionButton) {
            console.log('❌ 機能ボタンが見つかりません');
            return false;
        }
        
        console.log('✅ 機能ボタン発見');
        functionButton.click();
        
        // メニューが開くのを待つ
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Step 2: Deep Research要素を探す
        console.log('\n🔍 Step 2: Deep Research要素を探す');
        const allItems = document.querySelectorAll('[role="menuitem"], [role="menuitemradio"], [role="option"]');
        console.log(`メニュー項目数: ${allItems.length}`);
        
        let deepResearchElement = null;
        allItems.forEach((item, index) => {
            const text = item.textContent?.trim();
            if (text) {
                console.log(`  [${index}] "${text}" (${item.getAttribute('role')})`);
                if (text === 'Deep Research') {
                    deepResearchElement = item;
                    console.log(`  🎯 Deep Research発見！`);
                }
            }
        });
        
        if (!deepResearchElement) {
            console.log('❌ Deep Research要素が見つかりません');
            return false;
        }
        
        // Step 3: 現在の状態を確認
        console.log('\n📊 Step 3: 現在の状態確認');
        const currentChecked = deepResearchElement.getAttribute('aria-checked');
        console.log(`現在のaria-checked: "${currentChecked}"`);
        
        if (currentChecked === 'true') {
            console.log('✅ Deep Researchは既に選択されています');
            return true;
        }
        
        // Step 4: 複数の方法でクリックを試行
        console.log('\n🖱️ Step 4: クリック実行');
        const clickMethods = [
            {
                name: 'element.click()',
                fn: () => deepResearchElement.click()
            },
            {
                name: 'dispatchEvent click',
                fn: () => deepResearchElement.dispatchEvent(new MouseEvent('click', { bubbles: true }))
            },
            {
                name: 'PointerEvent',
                fn: () => {
                    deepResearchElement.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
                    deepResearchElement.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
                    deepResearchElement.dispatchEvent(new PointerEvent('click', { bubbles: true }));
                }
            }
        ];
        
        for (const method of clickMethods) {
            console.log(`\n試行: ${method.name}`);
            method.fn();
            
            // クリック後少し待つ
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // 結果を確認
            const newChecked = deepResearchElement.getAttribute('aria-checked');
            console.log(`  結果: aria-checked="${newChecked}"`);
            
            if (newChecked === 'true') {
                console.log(`  ✅ ${method.name}で成功！`);
                
                // Step 5: メニューを閉じる
                console.log('\n📝 Step 5: メニューを閉じる');
                document.body.click();
                
                return true;
            }
        }
        
        console.log('❌ 全てのクリック方法が失敗しました');
        return false;
    };
    
    // 3. ChatGPTAutomationのselectFunction修正
    window.fixChatGPTAutomation = function() {
        console.log('\n🔧 === ChatGPTAutomation.selectFunction修正 ===');
        
        if (!window.ChatGPTAutomation) {
            console.log('❌ ChatGPTAutomationが見つかりません');
            return;
        }
        
        // 元の関数を保存
        const originalSelectFunction = window.ChatGPTAutomation.selectFunction;
        
        // 新しい関数で上書き
        window.ChatGPTAutomation.selectFunction = async function(functionName) {
            console.log(`🎯 selectFunction呼び出し: "${functionName}"`);
            
            if (functionName === 'Deep Research') {
                console.log('📝 Deep Research選択を特別処理');
                
                // 機能メニューを開く
                const button = document.querySelector('[data-testid="composer-plus-btn"]');
                if (button) {
                    button.click();
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    
                    // Deep Researchを直接クリック
                    const items = document.querySelectorAll('[role="menuitem"], [role="menuitemradio"]');
                    for (const item of items) {
                        if (item.textContent?.trim() === 'Deep Research') {
                            console.log('🎯 Deep Research要素をクリック');
                            item.click();
                            
                            await new Promise(resolve => setTimeout(resolve, 500));
                            
                            const checked = item.getAttribute('aria-checked');
                            if (checked === 'true') {
                                console.log('✅ Deep Research選択成功');
                                document.body.click(); // メニューを閉じる
                                return true;
                            }
                        }
                    }
                }
                
                console.log('❌ Deep Research選択失敗、元の関数を実行');
            }
            
            // 他の機能は元の関数を使用
            return originalSelectFunction.call(this, functionName);
        };
        
        console.log('✅ ChatGPTAutomation.selectFunction修正完了');
    };
    
    // 4. 統合テスト用の完全修正
    window.fullFix = async function() {
        console.log('🚀 === 完全修正実行 ===\n');
        
        // ChatGPTAutomationを修正
        fixChatGPTAutomation();
        
        // 現在の状態を確認
        checkCurrentSelection();
        
        // Deep Researchを選択
        const success = await selectDeepResearchCorrectly();
        
        if (success) {
            console.log('\n🎉 Deep Research選択成功！');
            console.log('統合AIテストを再実行してください');
        } else {
            console.log('\n❌ Deep Research選択失敗');
            console.log('手動で選択してください');
        }
        
        return success;
    };
    
    console.log('✅ ツール準備完了');
    console.log('💡 使用方法:');
    console.log('  fullFix() - 完全修正を実行（推奨）');
    console.log('  selectDeepResearchCorrectly() - Deep Researchを正しく選択');
    console.log('  fixChatGPTAutomation() - ChatGPTAutomationを修正');
    console.log('  checkCurrentSelection() - 現在の選択状態を確認');
    
})();