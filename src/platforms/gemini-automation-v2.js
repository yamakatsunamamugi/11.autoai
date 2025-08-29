// 動作テストコードGemini V2 - Canvas 60秒待機特化版
// 作成日時: 
console.log(`%c🚀 Gemini Automation V2 - Canvas特化版`, 'color: #ff0000; font-weight: bold; font-size: 18px');
console.log(`%c📅 ロード日時: ${new Date().toLocaleString('ja-JP')}`, 'color: #666; font-size: 12px');
console.log(`%c🎯 特徴: Canvas 60秒待機 + Deep Research 40分対応`, 'color: #4285f4; font-weight: bold');

(async function() {
    // =============== テキスト表示関数（元のコードそのまま） ===============
    function displayTextSample(text, label) {
        if (!text) return;
        
        const length = text.length;
        console.log('\n' + '='.repeat(50));
        console.log(`【${label}】`);
        console.log(`文字数: ${length}文字`);
        console.log('='.repeat(50));
        
        if (length <= 200) {
            // 200文字以内なら全文表示
            console.log('《全文》');
            console.log(text);
        } else {
            // 200文字超なら最初と最後の100文字を表示
            console.log('《最初の100文字》');
            console.log(text.substring(0, 100));
            console.log('\n... 中略 ...\n');
            console.log('《最後の100文字》');
            console.log(text.substring(length - 100));
        }
        console.log('='.repeat(50) + '\n');
    }
    
    // =============== Canvas機能の状態確認（元のコードそのまま） ===============
    function checkCanvas() {
        log.debug('Canvas機能の状態確認中...');
        
        // 方法1: is-selectedクラスを持つボタンを確認
        const selectedButtons = document.querySelectorAll('button.is-selected');
        for (const button of selectedButtons) {
            const hasCanvasIcon = button.querySelector('mat-icon[fonticon="note_stack_add"]');
            const hasCanvasText = button.textContent && button.textContent.includes('Canvas');
            
            if (hasCanvasIcon || hasCanvasText) {
                log.debug('✓ Canvas機能有効 (is-selected)');
                return { enabled: true, method: 'is-selected' };
            }
        }
        
        // 方法2: aria-pressed="true"を確認
        const pressedButtons = document.querySelectorAll('button[aria-pressed="true"]');
        for (const button of pressedButtons) {
            const hasCanvasIcon = button.querySelector('mat-icon[fonticon="note_stack_add"]');
            const hasCanvasText = button.textContent && button.textContent.includes('Canvas');
            
            if (hasCanvasIcon || hasCanvasText) {
                log.debug('✓ Canvas機能有効 (aria-pressed)');
                return { enabled: true, method: 'aria-pressed' };
            }
        }
        
        // 方法3: has-selected-itemクラスを持つボタン（その他メニュー内）
        const hasSelectedItems = document.querySelectorAll('button.has-selected-item');
        for (const button of hasSelectedItems) {
            const hasCanvasIcon = button.querySelector('mat-icon[fonticon="note_stack_add"]');
            const hasPhotoIcon = button.querySelector('mat-icon[fonticon="photo_prints"]'); // 別アイコンの場合
            
            if (hasCanvasIcon || hasPhotoIcon) {
                log.debug('✓ Canvas機能有効 (has-selected-item)');
                return { enabled: true, method: 'has-selected-item' };
            }
        }
        
        log.debug('✗ Canvas機能無効');
        return { enabled: false, method: null };
    }
    
    // =============== Canvas機能を有効化（元のコードそのまま） ===============
    async function enableCanvas() {
        log.debug('Canvas機能の有効化を試行...');
        
        // 既に有効なら何もしない
        const currentState = checkCanvas();
        if (currentState.enabled) {
            log.debug('Canvas機能は既に有効');
            return true;
        }
        
        // 方法1: 直接表示されているCanvasボタンを探す
        const directCanvasButton = document.querySelector('toolbox-drawer-item button mat-icon[fonticon="note_stack_add"]')?.closest('button') ||
                                     document.querySelector('button:has(mat-icon[fonticon="note_stack_add"])') ||
                                     Array.from(document.querySelectorAll('button')).find(b => 
                                         b.textContent && b.textContent.includes('Canvas')
                                     );
        
        if (directCanvasButton) {
            log.debug('直接Canvasボタンをクリック');
            directCanvasButton.click();
            await wait(1500);
            
            const result = checkCanvas();
            if (result.enabled) {
                log.debug('✓ Canvas機能を有効化しました');
                return true;
            }
        }
        
        // 方法2: その他メニューを開いてCanvasを探す
        log.debug('その他メニューから探索...');
        
        const moreButton = getMoreButton();
        if (moreButton) {
            moreButton.click();
            await wait(2000);
            
            // メニュー内のCanvasボタンを探す
            const menuCanvasButton = 
                document.querySelector('[role="menu"] button:has(mat-icon[fonticon="note_stack_add"])') ||
                document.querySelector('.mat-menu-panel button:has(mat-icon[fonticon="note_stack_add"])') ||
                Array.from(document.querySelectorAll('button')).find(b => {
                    const icon = b.querySelector('mat-icon[fonticon="note_stack_add"]');
                    const text = b.textContent && b.textContent.includes('Canvas');
                    return icon || text;
                });
            
            if (menuCanvasButton) {
                log.debug('メニュー内のCanvasボタンをクリック');
                menuCanvasButton.click();
                await wait(1500);
                
                const result = checkCanvas();
                if (result.enabled) {
                    log.debug('✓ Canvas機能を有効化しました（メニュー経由）');
                    return true;
                }
            }
        }
        
        log.warn('⚠ Canvas機能の有効化に失敗');
        return false;
    }
    'use strict';
    
    // =============== 共通設定とユーティリティ ===============
    const WAIT_TIMES = {
        menuOpen: 1500,
        afterSelect: 2000,
        betweenSteps: 1000,
        retryDelay: 500,
        messageResponse: 300000  // 5分（300秒）
    };
    
    const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    
    // デバッグログ用関数（元のコードそのまま）
    function debugLog(message, data = null) {
        const timestamp = new Date().toISOString().split('T')[1].slice(0, 8);
        console.log(`[${timestamp}] ${message}`);
        if (data) console.log(data);
    }
    
    const log = {
        info: (msg) => console.log(`ℹ️ ${msg}`),
        success: (msg) => console.log(`✅ ${msg}`),
        error: (msg) => console.error(`❌ ${msg}`),
        warn: (msg) => console.warn(`⚠️ ${msg}`),
        debug: debugLog  // debugLogを使用
    };
    
    // テキストクリーニング
    const cleanText = (text) => {
        if (!text) return '';
        return text.replace(/arrow_drop_down|check_circle|expand_more|more_horiz/g, '')
                   .trim()
                   .replace(/\s+/g, ' ');
    };
    
    // 要素から装飾を除外してテキスト取得（機能選択用）
    const getCleanText = (element) => {
        if (!element) return '';
        // クローンを作成して、不要な要素を削除
        const clone = element.cloneNode(true);
        // ripple, icon, indicatorなどの装飾要素を削除
        const decorativeElements = clone.querySelectorAll(
            '.mat-ripple, .mat-icon, .mat-focus-indicator, .mat-mdc-button-touch-target, .mat-mdc-button-persistent-ripple'
        );
        decorativeElements.forEach(el => el.remove());
        return clone.textContent.trim();
    };
    
    // 要素取得関数
    const getElement = (selectors) => {
        for (const selector of (Array.isArray(selectors) ? selectors : [selectors])) {
            try {
                const elem = document.querySelector(selector);
                if (elem) return elem;
            } catch (e) {
                log.error(`モデル検索中のエラー: ${e.message || e}`);
                console.error('詳細なエラー情報:', e);
            }
        }
        return null;
    };
    
    const getElements = (selectors) => {
        for (const selector of (Array.isArray(selectors) ? selectors : [selectors])) {
            try {
                const elems = document.querySelectorAll(selector);
                if (elems.length > 0) return Array.from(elems);
            } catch (e) {
                log.error(`モデル検索中のエラー: ${e.message || e}`);
                console.error('詳細なエラー情報:', e);
            }
        }
        return [];
    };
    
    // =============== モデル選択関連機能 ===============
    const getMenuButton = () => {
        const selectors = [
            'button.gds-mode-switch-button',
            'button.logo-pill-btn',
            'button[class*="mode-switch"]',
            'button:has(.logo-pill-label-container)',
            '.logo-pill-label-container'
        ];
        
        for (const selector of selectors) {
            try {
                const el = document.querySelector(selector);
                if (el) {
                    const button = el.tagName === 'BUTTON' ? el : el.closest('button');
                    if (button) return button;
                }
            } catch (e) {
                log.error(`モデル検索中のエラー: ${e.message || e}`);
                console.error('詳細なエラー情報:', e);
            }
        }
        return null;
    };
    
    const getCurrentModelDisplay = () => {
        const selectors = [
            '.logo-pill-label-container span:not(.mat-icon)',
            '.logo-pill-label-container > span:first-child',
            '.logo-pill-label-container',
            'button.gds-mode-switch-button span:not(.mat-icon)'
        ];
        
        for (const selector of selectors) {
            try {
                const el = document.querySelector(selector);
                if (el) {
                    const text = cleanText(el.textContent);
                    if (text && !text.includes('arrow_drop')) {
                        return text;
                    }
                }
            } catch (e) {
                log.error(`モデル検索中のエラー: ${e.message || e}`);
                console.error('詳細なエラー情報:', e);
            }
        }
        return 'Unknown';
    };
    
    const getModelOptions = () => {
        const selectors = [
            'button.bard-mode-list-button',
            'button[mat-menu-item]',
            '.menu-inner-container button',
            '[role="menuitemradio"]'
        ];
        
        for (const selector of selectors) {
            const buttons = document.querySelectorAll(selector);
            if (buttons.length > 0) {
                return Array.from(buttons);
            }
        }
        return [];
    };
    
    const extractModelInfo = (button) => {
        const info = {
            title: '',
            description: '',
            modelName: '',
            isSelected: false
        };
        
        try {
            const titleEl = button.querySelector('.mode-title') || 
                            button.querySelector('.title-and-description span:first-child');
            if (titleEl) info.title = cleanText(titleEl.textContent);
            
            const descEl = button.querySelector('.mode-desc') || 
                           button.querySelector('.title-and-description span:last-child');
            if (descEl) info.description = cleanText(descEl.textContent);
            
            info.modelName = info.description || info.title || 'Unknown';
            
            info.isSelected = button.classList.contains('is-selected') || 
                              button.getAttribute('aria-checked') === 'true' ||
                              !!button.querySelector('mat-icon[fonticon="check_circle"]');
        } catch (e) {
            log.error(`機能アクセス中のエラー: ${e.message || e}`);
            console.error('詳細なエラー情報:', e);
        }
        
        return info;
    };
    
    const isMenuOpen = () => {
        const menuSelectors = [
            '.menu-inner-container',
            '.mat-mdc-menu-panel',
            '[role="menu"]',
            'button.bard-mode-list-button'
        ];
        
        for (const selector of menuSelectors) {
            const el = document.querySelector(selector);
            if (el && (el.offsetHeight > 0 || el.clientHeight > 0)) {
                return true;
            }
        }
        return false;
    };
    
    const openModelMenu = async () => {
        const button = getMenuButton();
        if (!button) {
            log.error('モデルメニューボタンが見つかりません');
            return false;
        }
        
        if (isMenuOpen()) {
            log.info('モデルメニューは既に開いています');
            return true;
        }
        
        log.info('モデルメニューを開きます...');
        button.click();
        await wait(WAIT_TIMES.menuOpen);
        
        if (isMenuOpen()) {
            log.success('モデルメニューが開きました');
            return true;
        } else {
            log.error('モデルメニューが開きませんでした');
            return false;
        }
    };
    
    // =============== 機能選択関連機能 ===============
    const getMoreButton = () => {
        return getElement([
            'button[aria-label="その他"]',
            '.toolbox-drawer-button-container button.mat-mdc-icon-button',
            'button:has(mat-icon[data-mat-icon-name="more_horiz"])',
            '.toolbox-drawer-button-container button'
        ]);
    };
    
    const discoverMainFeatures = () => {
        const features = [];
        const toolboxItems = getElements([
            'toolbox-drawer-item button:not([aria-label="その他"])',
            '.toolbox-drawer-item-button:not([aria-label="その他"])'
        ]);
        
        toolboxItems.forEach(btn => {
            const text = getCleanText(btn);  // 装飾要素を除外してテキスト取得
            if (text && text !== 'その他') {
                const icon = btn.querySelector('mat-icon');
                features.push({
                    name: text,
                    element: btn,
                    icon: icon ? icon.getAttribute('fonticon') : null,
                    location: 'main'
                });
            }
        });
        
        return features;
    };
    
    const discoverMoreMenuFeatures = async () => {
        const features = [];
        const moreBtn = getMoreButton();
        
        if (!moreBtn) {
            log.warn('その他メニューボタンが見つかりません');
            return features;
        }
        
        log.info('その他メニューを開いて機能を探索中...');
        
        moreBtn.click();
        await wait(WAIT_TIMES.menuOpen);
        
        const menuItems = document.querySelectorAll('.cdk-overlay-pane button[mat-list-item]');
        
        menuItems.forEach(item => {
            const text = getCleanText(item);  // 装飾要素を除外してテキスト取得
            if (text) {
                const icon = item.querySelector('mat-icon');
                const isPressed = item.getAttribute('aria-pressed') === 'true';
                features.push({
                    name: text.split('\n')[0].trim(),
                    element: item,
                    icon: icon ? icon.getAttribute('fonticon') : null,
                    location: 'more',
                    isCurrentlySelected: isPressed
                });
            }
        });
        
        document.body.click();
        await wait(500);
        
        return features;
    };
    
    const checkCurrentSelectedFeature = () => {
        const selected = [];
        
        const selectedButtons = document.querySelectorAll('button.is-selected, button[aria-pressed="true"]');
        selectedButtons.forEach(btn => {
            if (btn.getAttribute('aria-label') !== 'その他') {
                const text = getCleanText(btn);  // 装飾要素を除外してテキスト取得
                if (text && text !== 'その他') {
                    selected.push(text);
                }
            }
        });
        
        const moreBtn = getMoreButton();
        if (moreBtn) {
            const icon = moreBtn.querySelector('mat-icon');
            if (icon) {
                const iconName = icon.getAttribute('fonticon');
                if (iconName && iconName !== 'more_horiz') {
                    const iconToFeature = {
                        'note_stack_add': 'Canvas',
                        'photo_prints': '画像',
                        'movie': '動画',
                        'mindfulness': 'Deep Think',
                        'travel_explore': 'Deep Research'
                    };
                    
                    if (iconToFeature[iconName]) {
                        const featureName = iconToFeature[iconName];
                        if (!selected.includes(featureName)) {
                            selected.push(featureName + ' (隠れ状態)');
                        }
                    }
                }
            }
        }
        
        return selected;
    };
    
    // =============== テキスト入力機能（元のコードそのまま） ===============
    async function safeInputText(text) {
        log.debug('テキスト入力開始');
        
        try {
            // 入力欄を複数のセレクタで探す
            const selectors = [
                '.ql-editor.textarea',
                '.ql-editor',
                'rich-textarea .ql-editor',
                '[contenteditable="true"][role="textbox"]',
                '[contenteditable="true"]'
            ];
            
            let inputElement = null;
            for (const selector of selectors) {
                inputElement = document.querySelector(selector);
                if (inputElement) {
                    log.debug(`入力欄発見: ${selector}`);
                    break;
                }
            }
            
            if (!inputElement) {
                throw new Error('入力欄が見つかりません');
            }
            
            // フォーカスを設定
            inputElement.focus();
            await wait(100);
            
            // 既存のテキストをクリア
            inputElement.textContent = '';
            
            // textContentを使用してテキストを設定（TrustedHTML回避）
            inputElement.textContent = text;
            
            // ql-blankクラスを削除
            inputElement.classList.remove('ql-blank');
            
            // 必要なイベントを発火
            const events = ['input', 'change', 'keyup', 'keydown'];
            for (const eventName of events) {
                inputElement.dispatchEvent(new Event(eventName, { 
                    bubbles: true, 
                    cancelable: true 
                }));
            }
            
            await wait(500);
            
            // 入力確認
            const currentText = inputElement.textContent || '';
            if (currentText.includes(text.substring(0, 10))) {
                log.debug('✓ テキスト入力成功');
                return { success: true, method: 'textContent' };
            }
            
            // 代替方法: document.execCommand
            log.debug('代替入力方法を試行...');
            inputElement.focus();
            document.execCommand('selectAll', false, null);
            document.execCommand('insertText', false, text);
            
            await wait(500);
            
            const altText = inputElement.textContent || '';
            if (altText.includes(text.substring(0, 10))) {
                log.debug('✓ 代替方法で入力成功');
                return { success: true, method: 'execCommand' };
            }
            
            throw new Error('テキスト入力の確認に失敗');
            
        } catch (error) {
            log.error(`テキスト入力エラー: ${error.message || error}`);
            console.error('テキスト入力詳細なエラー情報:', error);
            console.error('エラースタックトレース:', error.stack || 'スタック情報なし');
            return { success: false, error: error.message || error.toString() };
        }
    }
    
    // =============== メッセージ送信機能（元のコードそのまま） ===============
    async function sendMessage() {
        log.debug('送信ボタンを探索中...');
        
        try {
            // 送信ボタンを探す（複数のセレクタで試行）
            const sendButtonSelectors = [
                'button.send-button.submit:not(.stop)',
                'button[aria-label="プロンプトを送信"]:not(.stop)',
                '.send-button-container button:has(mat-icon[fonticon="send"]):not(.stop)',
                'button:has(mat-icon[fonticon="send"]):not(.stop)'
            ];
            
            let sendButton = null;
            for (const selector of sendButtonSelectors) {
                sendButton = document.querySelector(selector);
                if (sendButton && !sendButton.disabled && !sendButton.classList.contains('stop')) {
                    log.debug(`送信ボタン発見: ${selector}`);
                    break;
                }
            }
            
            if (!sendButton) {
                throw new Error('送信ボタンが見つかりません');
            }
            
            // ボタンの状態を確認
            const isDisabled = sendButton.disabled || sendButton.getAttribute('aria-disabled') === 'true';
            if (isDisabled) {
                throw new Error('送信ボタンが無効化されています');
            }
            
            sendButton.click();
            log.debug('✓ メッセージを送信しました');
            
            // 送信後の確認（stopボタンが出現するか確認）
            await wait(1000);
            const stopButton = document.querySelector('button.stop') || 
                               document.querySelector('button:has(.stop-icon)');
            
            if (stopButton) {
                log.debug('✓ 送信確認（停止ボタンが出現）');
            }
            
            return true;
            
        } catch (error) {
            log.error(`送信エラー: ${error.message || error}`);
            console.error('送信詳細なエラー情報:', error);
            console.error('エラースタックトレース:', error.stack || 'スタック情報なし');
            return false;
        }
    }

    // =============== Canvasテキスト文字数取得ヘルパー関数 ===============
    function getCanvasTextLength() {
        const selectors = [
            '[contenteditable="true"]:not(.ql-editor)',
            '.ProseMirror[contenteditable="true"]',
            '.ProseMirror'
        ];
        // 複数のCanvas要素が存在する場合を考慮し、最も文字数が多いものを採用
        let maxLength = 0;
        for (const selector of selectors) {
            const elements = document.querySelectorAll(selector);
            for (const elem of elements) {
                const textLength = (elem.textContent || '').length;
                if (textLength > maxLength) {
                    maxLength = textLength;
                }
            }
        }
        return maxLength;
    }
    
    // =============== 応答待機機能（★★ロジック変更箇所★★） ===============
    async function waitForResponse() {
        log.debug('応答待機開始...');
        const startTime = Date.now();
        
        // Deep Researchの場合は40分、それ以外は5分
        const isDeepResearch = window.availableFeatures && 
                              window.availableFeatures.some(f => f.name && f.name.toLowerCase().includes('deep research') && f.active);
        const maxWaitTime = isDeepResearch ? 2400000 : 300000; // 40分 or 5分
        
        if (isDeepResearch) {
            log.info('🔬 Deep Researchモード: 最大40分待機');
        }
        
        const canvasState = checkCanvas();

        // 1. Canvas機能が有効な場合の停止条件
        if (canvasState.enabled) {
            log.info('Canvas機能が有効なため、60秒待機後に停止ボタンを監視します。');
            
            // 1-1. 60秒待機
            log.debug('60秒間待機します...');
            await wait(60000);
            log.debug('60秒経過。停止ボタンの監視を開始します。');

            // 1-2. 停止ボタンが消えるまで待機（文字数監視は削除）
            const checkInterval = 2000; // 2秒ごと
            
            while (Date.now() - startTime < maxWaitTime) {
                const stopButton = document.querySelector('button.stop') ||
                                   document.querySelector('button:has(.stop-icon)') ||
                                   document.querySelector('button:has(mat-icon[fonticon="stop"])');
                
                if (!stopButton) {
                    log.success('✓ 応答完了 (Canvas - 停止ボタンが消えました)');
                    return { completed: true, duration: Date.now() - startTime };
                }
                
                const elapsed = Math.floor((Date.now() - startTime) / 1000);
                if (elapsed > 0 && elapsed % 30 === 0) {
                     log.debug(`Canvas待機中... ${elapsed}秒経過`);
                }
                
                await wait(checkInterval);
            }

            log.warn(`⚠ タイムアウト (Canvas - ${maxWaitTime/60000}分経過)`);
            return { completed: false, duration: maxWaitTime };
        } 
        // 2. 通常モード（Canvas以外）の停止条件
        else {
            log.info('通常応答の待機ロジックを使用します。');
            const checkInterval = 2000; // 2秒ごとにチェック
            
            while (Date.now() - startTime < maxWaitTime) {
                const stopButton = document.querySelector('button.stop') ||
                                   document.querySelector('button:has(.stop-icon)') ||
                                   document.querySelector('button:has(mat-icon[fonticon="stop"])');
                
                if (!stopButton) {
                    log.success('✓ 応答完了（停止ボタンが消えました）');
                    return { completed: true, duration: Date.now() - startTime };
                }
                
                const elapsed = Math.floor((Date.now() - startTime) / 1000);
                if (elapsed > 0 && elapsed % 30 === 0) {
                     log.debug(`待機中... ${elapsed}秒経過`);
                }
                
                await wait(checkInterval);
            }
            
            log.warn(`⚠ タイムアウト（${maxWaitTime/60000}分経過）`);
            return { completed: false, duration: maxWaitTime };
        }
    }
    
    // =============== テキスト取得機能（元のコードそのまま） ===============
    function getGeneratedText() {
        log.debug('生成テキストを取得中...');
        
        const results = {
            canvas: null,
            normal: null,
            source: null
        };
        
        // 1. Canvas要素（contenteditable）を確認
        const editableSelectors = [
            '[contenteditable="true"]:not(.ql-editor)',
            '.ProseMirror[contenteditable="true"]'
        ];
        
        for (const selector of editableSelectors) {
            const elements = document.querySelectorAll(selector);
            for (const elem of elements) {
                const text = elem.textContent || '';
                if (text.length > 100 && text.includes('桃')) {
                    results.canvas = text;
                    results.source = 'Canvas (contenteditable)';
                    log.debug(`✓ Canvas要素でテキスト発見: ${selector}`);
                    displayTextSample(text, 'Canvas要素のテキスト');
                    break;
                }
            }
            if (results.canvas) break;
        }
        
        // 2. ProseMirror要素を確認（contenteditableでない場合も）
        if (!results.canvas) {
            const proseMirrors = document.querySelectorAll('.ProseMirror');
            for (const elem of proseMirrors) {
                const text = elem.textContent || '';
                if (text.length > 100 && text.includes('桃')) {
                    results.canvas = text;
                    results.source = 'ProseMirror';
                    log.debug('✓ ProseMirror要素でテキスト発見');
                    displayTextSample(text, 'ProseMirror要素のテキスト');
                    break;
                }
            }
        }
        
        // 3. 通常のレスポンス要素を確認
        const normalSelectors = [
            '.markdown',
            '.model-response-text',
            'message-content',
            '[class*="response"]',
            '.markdown-main-panel'
        ];
        
        for (const selector of normalSelectors) {
            const elements = document.querySelectorAll(selector);
            for (const elem of elements) {
                const text = elem.textContent || '';
                if (text.length > 100 && text.includes('桃')) {
                    results.normal = text;
                    log.debug(`✓ 通常要素でテキスト発見: ${selector}`);
                    displayTextSample(text, '通常要素のテキスト');
                    break;
                }
            }
            if (results.normal) break;
        }
        
        return results;
    }
    
    // =============== メイン統合テスト実行 ===============
    async function runIntegrationTest() {
        console.log('%c🚀 [V2] runIntegrationTest開始', 'color: #ff0000; font-weight: bold; font-size: 16px');
        console.log('\n╔══════════════════════════════════════════════╗');
        console.log('║  🚀 Gemini V2統合テスト開始                   ║');
        console.log('╚══════════════════════════════════════════════╝\n');
        
        const testResults = {
            開始時刻: new Date().toLocaleString('ja-JP'),
            モデル一覧: [],
            機能一覧: [],
            選択結果: {},
            メッセージ送信: false,
            テキスト生成: false,
            エラー: []
        };
        
        try {
            // ========== STEP 1: モデル探索 ==========
            console.log('%c📋 [V2] STEP 1: 利用可能なモデルを探索', 'color: #4285f4; font-weight: bold');
            console.log('\n📋 STEP 1: 利用可能なモデルを探索');
            console.log('=' * 50);
            
            if (!await openModelMenu()) {
                throw new Error('モデルメニューを開けませんでした');
            }
            
            const modelButtons = getModelOptions();
            if (modelButtons.length === 0) {
                log.warn('モデルオプションが見つかりません');
            } else {
                log.success(`${modelButtons.length}個のモデルを検出`);
                
                const models = modelButtons.map(button => ({
                    button,
                    ...extractModelInfo(button)
                }));
                
                console.log('\n📍 検出されたモデル:');
                models.forEach((model, i) => {
                    const modelInfo = {
                        番号: i + 1,
                        名前: model.modelName,
                        選択中: model.isSelected ? '✓' : ''
                    };
                    testResults.モデル一覧.push(modelInfo);
                    console.log(`  ${i + 1}. ${model.modelName} ${model.isSelected ? '(現在選択中)' : ''}`);
                });
            }
            
            // メニューを閉じる
            document.body.click();
            await wait(500);
            
            // ========== STEP 2: 機能探索 ==========
            console.log('\n📋 STEP 2: 利用可能な機能を探索');
            console.log('=' * 50);
            
            // メイン機能
            const mainFeatures = discoverMainFeatures();
            console.log('\n📍 メインツールバーの機能:');
            if (mainFeatures.length > 0) {
                mainFeatures.forEach(f => {
                    console.log(`  - ${f.name} (icon: ${f.icon})`);
                    testResults.機能一覧.push({
                        名前: f.name,
                        場所: 'メイン',
                        アイコン: f.icon
                    });
                });
            } else {
                console.log('  （表示されている機能はありません）');
            }
            
            // その他メニューの機能
            const moreFeatures = await discoverMoreMenuFeatures();
            console.log('\n📍 その他メニューの機能:');
            if (moreFeatures.length > 0) {
                moreFeatures.forEach(f => {
                    const status = f.isCurrentlySelected ? ' [選択中]' : '';
                    console.log(`  - ${f.name} (icon: ${f.icon})${status}`);
                    testResults.機能一覧.push({
                        名前: f.name,
                        場所: 'その他',
                        アイコン: f.icon,
                        選択中: f.isCurrentlySelected
                    });
                });
            } else {
                console.log('  （なし）');
            }
            
            const allFeatures = [...mainFeatures, ...moreFeatures];
            
            // ========== STEP 3: 番号付きリスト表示（作業停止ポイント） ==========
            console.log('\n' + '🛑'.repeat(20));
            console.log('📋 STEP 3: 選択可能なモデルと機能の一覧');
            console.log('🛑'.repeat(20));
            
            console.log('\n【選択可能なモデル】');
            testResults.モデル一覧.forEach(model => {
                console.log(`  ${model.番号}. ${model.名前} ${model.選択中 ? '(選択中)' : ''}`);
            });
            
            console.log('\n【選択可能な機能】');
            let featureIndex = 1;
            allFeatures.forEach(feature => {
                const status = feature.isCurrentlySelected ? ' (選択中)' : '';
                console.log(`  ${featureIndex}. ${feature.name} [${feature.location}]${status}`);
                featureIndex++;
            });
            
            console.log('\n' + '⏸'.repeat(30));
            console.log('ここで作業を一時停止します');
            console.log('⏸'.repeat(30));
            
            // グローバル変数に保存
            window.availableModels = testResults.モデル一覧;
            window.availableFeatures = allFeatures;
            window.testResults = testResults;
            
            console.log('\n📝 使用方法:');
            console.log('────────────────────────────────────');
            console.log('以下のコマンドを実行してテストを続行してください：\n');
            console.log('  window.continueTest(モデル番号, 機能番号)\n');
            console.log('例:');
            console.log('  window.continueTest(1, 3)  // モデル1番、機能3番を選択');
            console.log('  window.continueTest(2)     // モデル2番のみ選択（機能選択なし）');
            console.log('  window.continueTest(null, 5) // 機能5番のみ選択（モデル変更なし）');
            console.log('────────────────────────────────────');
            
            // ここでテストを停止して、ユーザー入力を待つ
            console.log('\n⌛ ユーザーの選択を待機中...');
            console.log('\n✋ テストはここで停止しました。続行するには上記のコマンドを使用してください。');
            return; // ここで関数を終了
        } catch (error) {
            log.error(`テストエラー: ${error.message || error}`);
            console.error('テスト詳細なエラー情報:', error);
            console.error('エラースタックトレース:', error.stack || 'スタック情報なし');
            testResults.エラー.push({
                message: error.message || error.toString(),
                stack: error.stack || 'スタック情報なし',
                timestamp: new Date().toISOString()
            });
        }
    }
    
    // ========== テスト続行関数（ユーザー選択後） ==========
    async function continueTest(modelNumber = null, featureNumber = null) {
        console.log('%c🚀 [V2] continueTest開始', 'color: #ff0000; font-weight: bold; font-size: 16px');
        console.log('\n╔══════════════════════════════════════════════╗');
        console.log('║        🎯 V2テスト続行                         ║');
        console.log('╚══════════════════════════════════════════════╝\n');
        
        const testResults = window.testResults || {
            選択結果: {},
            メッセージ送信: false,
            テキスト生成: false,
            エラー: []
        };
        
        try {
            // ========== STEP 4: モデル選択 ==========
            if (modelNumber && window.availableModels && window.availableModels.length >= modelNumber) {
                console.log('\n📋 STEP 4: モデル選択');
                console.log('=' * 50);
                
                const targetModel = window.availableModels[modelNumber - 1];
                log.info(`「${targetModel.名前}」を選択します`);
                
                if (await openModelMenu()) {
                    const modelButtons = getModelOptions();
                    if (modelButtons.length >= modelNumber) {
                        modelButtons[modelNumber - 1].click();
                        await wait(WAIT_TIMES.afterSelect);
                        
                        const currentModel = getCurrentModelDisplay();
                        log.success(`現在のモデル: ${currentModel}`);
                        testResults.選択結果.モデル = currentModel;
                    } else {
                        log.error(`モデル番号 ${modelNumber} が見つかりません`);
                    }
                } else {
                    log.error('モデルメニューを開けませんでした');
                }
            } else if (modelNumber) {
                log.warn(`無効なモデル番号: ${modelNumber}`);
            }
            
            // ========== STEP 5: 機能選択 ==========
            if (featureNumber && window.availableFeatures && window.availableFeatures.length >= featureNumber) {
                console.log('\n📋 STEP 5: 機能選択');
                console.log('=' * 50);
                
                const targetFeature = window.availableFeatures[featureNumber - 1];
                log.info(`「${targetFeature.name}」機能を選択します`);
                
                // Canvas機能の場合は特別な処理
                if (targetFeature.name === 'Canvas' || targetFeature.name.includes('Canvas')) {
                    // Canvas専用の有効化処理
                    const canvasEnabled = await enableCanvas();
                    const canvasState = checkCanvas();
                    
                    if (canvasEnabled && canvasState.enabled) {
                        log.success(`Canvas機能が有効化されました (${canvasState.method})`);
                        testResults.選択結果.機能 = ['Canvas'];
                    } else {
                        log.error('Canvas機能の有効化に失敗しました');
                    }
                } else {
                    // 通常の機能選択処理
                    if (targetFeature.location === 'main') {
                        // メイン機能の場合
                        targetFeature.element.click();
                        await wait(WAIT_TIMES.afterSelect);
                    } else {
                        // その他メニューの機能の場合
                        const moreBtn = getMoreButton();
                        if (moreBtn) {
                            moreBtn.click();
                            await wait(WAIT_TIMES.menuOpen);
                            
                            const menuItems = document.querySelectorAll('.cdk-overlay-pane button[mat-list-item]');
                            for (const item of menuItems) {
                                const text = getCleanText(item);
                                if (text && text.includes(targetFeature.name)) {
                                    item.click();
                                    break;
                                }
                            }
                            await wait(WAIT_TIMES.afterSelect);
                        } else {
                            log.error('その他メニューボタンが見つかりません');
                        }
                    }
                    
                    const selected = checkCurrentSelectedFeature();
                    log.success(`選択中の機能: ${selected.join(', ')}`);
                    testResults.選択結果.機能 = selected;
                }
            } else if (featureNumber) {
                log.warn(`無効な機能番号: ${featureNumber}`);
            }
            
            // 選択状態を確認
            await wait(2000);
            console.log('\n📊 現在の選択状態:');
            console.log(`  モデル: ${getCurrentModelDisplay()}`);
            console.log(`  機能: ${checkCurrentSelectedFeature().join(', ') || 'なし'}`);
            
            // ========== STEP 6: メッセージ送信 ==========
            console.log('\n📋 STEP 6: メッセージ送信');
            console.log('=' * 50);
            
            // テキスト入力（グローバル変数またはデフォルトテキストを使用）
            const promptText = window.currentPromptText || '桃太郎について2000文字で解説して';
            console.log(`📝 プロンプト入力: ${promptText.substring(0, 100)}...`);
            const inputResult = await safeInputText(promptText);
            
            testResults.ステップ = testResults.ステップ || [];
            testResults.ステップ.push({
                番号: 6,
                項目: 'テキスト入力',
                結果: inputResult.success ? '成功' : '失敗',
                詳細: inputResult.method || inputResult.error || 'エラー詳細不明'
            });
            
            if (!inputResult.success) {
                throw new Error(`テキスト入力失敗: ${inputResult.error || 'エラー詳細不明'}`);
            }
            
            await wait(1000);
            
            // メッセージ送信（元のコードの関数を使用）
            const sendSuccess = await sendMessage();
            
            testResults.ステップ.push({
                番号: 6,
                項目: 'メッセージ送信',
                結果: sendSuccess ? '成功' : '失敗',
                詳細: sendSuccess ? '送信完了' : '送信ボタンが見つかりません'
            });
            
            if (!sendSuccess) {
                throw new Error('メッセージ送信に失敗しました');
            }
            
            testResults.メッセージ送信 = true;
            
            await wait(3000); // 初期待機
            
            // ========== STEP 7: 応答待機 ==========
            console.log('\n📋 STEP 7: 応答待機');
            console.log('=' * 50);
            
            const waitResult = await waitForResponse();
            
            testResults.ステップ.push({
                番号: 7,
                項目: '応答待機',
                結果: waitResult.completed ? '完了' : 'タイムアウト',
                詳細: `${Math.floor(waitResult.duration / 1000)}秒`
            });
            
            if (!waitResult.completed) {
                log.warn('応答がタイムアウトしました');
            }
            
            await wait(3000); // レンダリング待機
            
            // ========== STEP 8: テキスト取得と表示 ==========
            console.log('\n📋 STEP 8: 生成テキスト取得');
            console.log('=' * 50);
            
            const texts = getGeneratedText();
            
            // Canvas機能が有効な場合の判定
            const finalCanvasState = checkCanvas();
            
            if (texts.canvas) {
                testResults.ステップ.push({
                    番号: 8,
                    項目: 'Canvasテキスト',
                    結果: '取得成功',
                    詳細: `${texts.canvas.length}文字 (${texts.source})`
                });
                testResults.テキスト生成 = true;
                testResults.テキスト情報 = {
                    文字数: texts.canvas.length,
                    ソース: texts.source || 'Canvas'
                };
            }
            
            if (texts.normal) {
                testResults.ステップ.push({
                    番号: 8,
                    項目: '通常テキスト',
                    結果: '取得成功',
                    詳細: `${texts.normal.length}文字`
                });
                if (!texts.canvas) {
                    testResults.テキスト生成 = true;
                    testResults.テキスト情報 = {
                        文字数: texts.normal.length,
                        ソース: '通常レスポンス'
                    };
                }
            }
            
            // 最終判定
            if (finalCanvasState.enabled && texts.canvas) {
                testResults.最終結果 = '✅ Canvas機能正常動作';
            } else if (!finalCanvasState.enabled && texts.normal) {
                testResults.最終結果 = '✅ 通常モードで正常動作';
            } else if (finalCanvasState.enabled && !texts.canvas) {
                testResults.最終結果 = '❌ Canvas機能有効だがテキスト生成失敗';
                log.error('Canvas機能は有効でしたが、テキストが取得できませんでした');
            } else if (!finalCanvasState.enabled && !texts.normal) {
                 testResults.最終結果 = '❌ テキスト生成失敗';
                 log.error('テキストが取得できませんでした');
            } else {
                testResults.最終結果 = '❓ 予期しない状態';
            }
            
        } catch (error) {
            log.error(`テスト続行エラー: ${error.message || error}`);
            console.error('テスト続行詳細なエラー情報:', error);
            console.error('エラースタックトレース:', error.stack || 'スタック情報なし');
            testResults.エラー = testResults.エラー || [];
            testResults.エラー.push({
                message: error.message || error.toString(),
                stack: error.stack || 'スタック情報なし',
                timestamp: new Date().toISOString(),
                context: 'テスト続行処理'
            });
        }
        
        // 所要時間を計算（startTimeが定義されているか確認）
        if (typeof startTime !== 'undefined') {
            testResults.所要時間 = `${Math.floor((Date.now() - startTime) / 1000)}秒`;
        }
        
        // ========== 結果サマリー ==========
        console.log('\n╔══════════════════════════════════════════════╗');
        console.log('║           テスト結果サマリー                 ║');
        console.log('╚══════════════════════════════════════════════╝\n');
        
        if (testResults.ステップ && testResults.ステップ.length > 0) {
            console.table(testResults.ステップ);
        }
        
        console.table([{
            項目: '選択モデル',
            結果: testResults.選択結果.モデル ? '✅' : '❌',
            詳細: testResults.選択結果.モデル || '-'
        }, {
            項目: '選択機能',
            結果: testResults.選択結果.機能 ? '✅' : '❌',
            詳細: testResults.選択結果.機能 ? testResults.選択結果.機能.join(', ') : '-'
        }, {
            項目: 'メッセージ送信',
            結果: testResults.メッセージ送信 ? '✅' : '❌',
            詳細: testResults.メッセージ送信 ? '成功' : '失敗'
        }, {
            項目: 'テキスト生成',
            結果: testResults.テキスト生成 ? '✅' : '❌',
            詳細: testResults.テキスト情報 ? `${testResults.テキスト情報.文字数}文字 (${testResults.テキスト情報.ソース})` : '-'
        }]);
        
        if (testResults.最終結果) {
            console.log('\n【最終結果】');
            console.log(testResults.最終結果);
        }
        
        if (testResults.所要時間) {
            console.log(`\n所要時間: ${testResults.所要時間}`);
        }
        
        console.log(`終了時刻: ${new Date().toLocaleString('ja-JP')}`);
        
        if (testResults.エラー && testResults.エラー.length > 0) {
            console.log('\n📚 エラー詳細レポート');
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            testResults.エラー.forEach((error, index) => {
                if (typeof error === 'string') {
                    // 古い形式のエラー（文字列）
                    console.log(`❌ エラー ${index + 1}: ${error}`);
                } else {
                    // 新しい形式のエラー（オブジェクト）
                    console.log(`❌ エラー ${index + 1}:`);
                    console.log(`   📝 メッセージ: ${error.message}`);
                    console.log(`   📅 発生時刻: ${error.timestamp}`);
                    if (error.context) {
                        console.log(`   🔍 コンテキスト: ${error.context}`);
                    }
                    if (error.stack && error.stack !== 'スタック情報なし') {
                        console.log(`   📚 スタックトレース (先頭5行):`);
                        const stackLines = error.stack.split('\n').slice(0, 5);
                        stackLines.forEach(line => console.log(`      ${line}`));
                        if (error.stack.split('\n').length > 5) {
                            console.log(`      ... あと ${error.stack.split('\n').length - 5} 行`);
                        }
                    }
                    console.log('   ─'.repeat(40));
                }
            });
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        }
        
        // デバッグコマンド
        console.log('\n【デバッグ用コマンド】');
        console.log('Canvas状態確認   : checkCanvas()');
        console.log('Canvas要素確認   : document.querySelectorAll("[contenteditable=true]")');
        console.log('ProseMirror確認  : document.querySelectorAll(".ProseMirror")');
        console.log('テスト結果確認   : window.testResults');
        console.log('再テスト実行     : window.runIntegrationTest() → window.continueTest(モデル番号, 機能番号)');
        
        // グローバル変数に保存
        window.testResults = testResults;
        
        return testResults;
    }
    
    // ========== グローバル関数の公開 ==========
    window.runIntegrationTest = runIntegrationTest;
    window.continueTest = continueTest;
    window.checkCurrentModel = getCurrentModelDisplay;
    window.checkCurrentFeatures = checkCurrentSelectedFeature;
    window.checkCanvas = checkCanvas;
    window.enableCanvas = enableCanvas;
    window.safeInputText = safeInputText;
    window.sendMessage = sendMessage;
    window.waitForResponse = waitForResponse;
    window.getGeneratedText = getGeneratedText;
    window.displayTextSample = displayTextSample;
    
    // ========== テスト自動実行は削除 ==========
    console.log('\n✅ V2関数が利用可能になりました');
    console.log('使用方法:');
    console.log('  await runIntegrationTest()');
    console.log('  await continueTest(modelNumber, featureNumber)');
    
})();