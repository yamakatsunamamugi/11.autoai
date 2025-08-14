// レガシーモデルと「さらに表示」の違いを調べるコード

async function analyzeSubmenuDifference() {
    console.log('=== サブメニューの違いを分析 ===');
    
    // 1. モデルメニューを開く
    const modelButton = document.querySelector('[data-testid="model-switcher-dropdown-button"]');
    if (modelButton) {
        console.log('モデルメニューを開きます');
        modelButton.click();
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // レガシーモデルボタンを探す
        const legacyButton = Array.from(document.querySelectorAll('[role="menuitem"]'))
            .find(item => item.textContent?.includes('レガシーモデル'));
        
        if (legacyButton) {
            console.log('\n=== レガシーモデルボタン ===');
            console.log('HTML:', legacyButton.outerHTML);
            console.log('親要素:', legacyButton.parentElement?.outerHTML);
            console.log('属性:', {
                'data-has-submenu': legacyButton.getAttribute('data-has-submenu'),
                'aria-haspopup': legacyButton.getAttribute('aria-haspopup'),
                'aria-expanded': legacyButton.getAttribute('aria-expanded'),
                'data-state': legacyButton.getAttribute('data-state'),
                'data-testid': legacyButton.getAttribute('data-testid')
            });
            
            // イベントリスナーを確認
            const events = getEventListeners(legacyButton);
            console.log('イベントリスナー:', events);
        }
        
        // メニューを閉じる
        document.body.click();
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // 2. 機能メニューを開く
    const functionButton = document.querySelector('[data-testid="composer-plus-btn"]');
    if (functionButton) {
        console.log('\n機能メニューを開きます');
        functionButton.click();
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // さらに表示ボタンを探す
        const showMoreButton = Array.from(document.querySelectorAll('[role="menuitem"]'))
            .find(item => item.textContent?.includes('さらに表示'));
        
        if (showMoreButton) {
            console.log('\n=== さらに表示ボタン ===');
            console.log('HTML:', showMoreButton.outerHTML);
            console.log('親要素:', showMoreButton.parentElement?.outerHTML);
            console.log('属性:', {
                'data-has-submenu': showMoreButton.getAttribute('data-has-submenu'),
                'aria-haspopup': showMoreButton.getAttribute('aria-haspopup'),
                'aria-expanded': showMoreButton.getAttribute('aria-expanded'),
                'data-state': showMoreButton.getAttribute('data-state'),
                'data-testid': showMoreButton.getAttribute('data-testid')
            });
            
            // イベントリスナーを確認（Chrome DevToolsでのみ動作）
            if (typeof getEventListeners !== 'undefined') {
                const events = getEventListeners(showMoreButton);
                console.log('イベントリスナー:', events);
            }
            
            // 子要素を確認
            console.log('\n子要素:');
            showMoreButton.childNodes.forEach((child, index) => {
                console.log(`  [${index}]:`, child.nodeName, child.textContent?.trim() || '');
            });
            
            // スタイルを確認
            const computedStyle = window.getComputedStyle(showMoreButton);
            console.log('\nカーソルスタイル:', computedStyle.cursor);
            console.log('ポインターイベント:', computedStyle.pointerEvents);
        }
        
        // メニューを閉じる
        document.body.click();
    }
}

// 実行
analyzeSubmenuDifference();