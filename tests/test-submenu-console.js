// コンソールで「さらに表示」サブメニューを開くテストコード

// 1. 機能メニューを開く
async function openFunctionMenu() {
    const functionButton = document.querySelector('[data-testid="composer-plus-btn"]');
    if (functionButton) {
        console.log('機能ボタン発見:', functionButton);
        functionButton.click();
        await new Promise(resolve => setTimeout(resolve, 500));
        
        const menu = document.querySelector('[role="menu"]');
        console.log('メニュー:', menu);
        return menu;
    }
    return null;
}

// 2. 「さらに表示」を探す
function findShowMoreButton() {
    const menuItems = document.querySelectorAll('[role="menuitem"], [role="menuitemradio"]');
    for (const item of menuItems) {
        if (item.textContent?.includes('さらに表示')) {
            console.log('「さらに表示」ボタン発見:', item);
            console.log('属性:', {
                'data-has-submenu': item.getAttribute('data-has-submenu'),
                'aria-haspopup': item.getAttribute('aria-haspopup'),
                'aria-expanded': item.getAttribute('aria-expanded'),
                'role': item.getAttribute('role'),
                'data-state': item.getAttribute('data-state')
            });
            return item;
        }
    }
    return null;
}

// 3. サブメニューを開く - 方法A: ホバー
async function openSubmenuByHover(button) {
    console.log('方法A: ホバーで開く');
    button.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    button.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // ポッパー数を確認
    const poppers = document.querySelectorAll('[data-radix-popper-content-wrapper]');
    console.log('ポッパー数:', poppers.length);
    
    // 新しいメニューを探す
    const menus = document.querySelectorAll('[role="menu"]');
    console.log('メニュー数:', menus.length);
    
    if (menus.length > 1) {
        const submenu = menus[menus.length - 1];
        const items = submenu.querySelectorAll('[role="menuitem"]');
        console.log('サブメニュー項目:', Array.from(items).map(i => i.textContent?.trim()));
        return submenu;
    }
    return null;
}

// 4. サブメニューを開く - 方法B: フォーカス + ArrowRight
async function openSubmenuByArrow(button) {
    console.log('方法B: フォーカス + ArrowRightで開く');
    button.focus();
    await new Promise(resolve => setTimeout(resolve, 100));
    
    button.dispatchEvent(new KeyboardEvent('keydown', { 
        key: 'ArrowRight', 
        code: 'ArrowRight', 
        bubbles: true 
    }));
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // ポッパー数を確認
    const poppers = document.querySelectorAll('[data-radix-popper-content-wrapper]');
    console.log('ポッパー数:', poppers.length);
    
    // 新しいメニューを探す
    const menus = document.querySelectorAll('[role="menu"]');
    console.log('メニュー数:', menus.length);
    
    if (menus.length > 1) {
        const submenu = menus[menus.length - 1];
        const items = submenu.querySelectorAll('[role="menuitem"]');
        console.log('サブメニュー項目:', Array.from(items).map(i => i.textContent?.trim()));
        return submenu;
    }
    return null;
}

// 5. サブメニューを開く - 方法C: ポインターイベント
async function openSubmenuByPointer(button) {
    console.log('方法C: ポインターイベントで開く');
    const rect = button.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    
    button.dispatchEvent(new PointerEvent('pointerenter', {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: x,
        clientY: y
    }));
    
    button.dispatchEvent(new PointerEvent('pointermove', {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: x,
        clientY: y
    }));
    
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // ポッパー数を確認
    const poppers = document.querySelectorAll('[data-radix-popper-content-wrapper]');
    console.log('ポッパー数:', poppers.length);
    
    // 新しいメニューを探す
    const menus = document.querySelectorAll('[role="menu"]');
    console.log('メニュー数:', menus.length);
    
    if (menus.length > 1) {
        const submenu = menus[menus.length - 1];
        const items = submenu.querySelectorAll('[role="menuitem"]');
        console.log('サブメニュー項目:', Array.from(items).map(i => i.textContent?.trim()));
        return submenu;
    }
    return null;
}

// 6. サブメニューを開く - 方法D: クリック（stopPropagation付き）
async function openSubmenuByClickStop(button) {
    console.log('方法D: クリック（stopPropagation）で開く');
    
    const clickHandler = (e) => {
        e.stopPropagation();
        e.preventDefault();
    };
    
    button.addEventListener('click', clickHandler, true);
    button.click();
    button.removeEventListener('click', clickHandler, true);
    
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // ポッパー数を確認
    const poppers = document.querySelectorAll('[data-radix-popper-content-wrapper]');
    console.log('ポッパー数:', poppers.length);
    
    // 新しいメニューを探す
    const menus = document.querySelectorAll('[role="menu"]');
    console.log('メニュー数:', menus.length);
    
    if (menus.length > 1) {
        const submenu = menus[menus.length - 1];
        const items = submenu.querySelectorAll('[role="menuitem"]');
        console.log('サブメニュー項目:', Array.from(items).map(i => i.textContent?.trim()));
        return submenu;
    }
    return null;
}

// 7. テスト実行
async function testSubmenu() {
    console.log('=== サブメニューテスト開始 ===');
    
    // メニューを開く
    const menu = await openFunctionMenu();
    if (!menu) {
        console.log('メニューが開けませんでした');
        return;
    }
    
    // 「さらに表示」を探す
    const showMoreButton = findShowMoreButton();
    if (!showMoreButton) {
        console.log('「さらに表示」が見つかりませんでした');
        return;
    }
    
    // 各方法を試す
    console.log('\n--- 方法A: ホバー ---');
    let submenu = await openSubmenuByHover(showMoreButton);
    
    if (!submenu) {
        console.log('\n--- 方法B: ArrowRight ---');
        submenu = await openSubmenuByArrow(showMoreButton);
    }
    
    if (!submenu) {
        console.log('\n--- 方法C: ポインターイベント ---');
        submenu = await openSubmenuByPointer(showMoreButton);
    }
    
    if (!submenu) {
        console.log('\n--- 方法D: クリック(stopPropagation) ---');
        submenu = await openSubmenuByClickStop(showMoreButton);
    }
    
    if (submenu) {
        console.log('✅ サブメニューが開きました！');
    } else {
        console.log('❌ サブメニューが開けませんでした');
    }
}

// 実行
console.log('以下のコマンドを実行してください:');
console.log('await testSubmenu()');

// グローバルに公開
window.testSubmenu = testSubmenu;
window.openFunctionMenu = openFunctionMenu;
window.findShowMoreButton = findShowMoreButton;
window.openSubmenuByHover = openSubmenuByHover;
window.openSubmenuByArrow = openSubmenuByArrow;
window.openSubmenuByPointer = openSubmenuByPointer;
window.openSubmenuByClickStop = openSubmenuByClickStop;