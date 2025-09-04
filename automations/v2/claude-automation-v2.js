/**
 * @fileoverview Claude Automation V2 - テスト済みコードベース版
 * 
 * 特徴:
 * - テスト済みのロジックをそのまま使用
 * - モデル選択・機能選択・応答待機・テキスト取得の完全移植
 * - Deep Research対応（最大40分待機）
 * 
 * @version 2.1.0
 */
(function() {
    'use strict';
    
    console.log(`Claude Automation V2 - 初期化時刻: ${new Date().toLocaleString('ja-JP')}`);
    
    // =====================================================================
    // セレクタ定義（テストコードから完全移植）
    // =====================================================================
    
    // Deep Research用セレクタ
    const deepResearchSelectors = {
        '3_回答停止ボタン': {
            selectors: [
                '[aria-label="応答を停止"]',
                'button[aria-label="応答を停止"]',
                '[data-state="closed"][aria-label="応答を停止"]',
                'button.border-border-200[aria-label="応答を停止"]',
                'button svg path[d*="M128,20A108"]'
            ],
            description: '回答停止ボタン'
        },
        '4_Canvas機能テキスト位置': {
            selectors: [
                '#markdown-artifact',
                '[id="markdown-artifact"]',
                '.font-claude-response#markdown-artifact',
                '[tabindex="0"]#markdown-artifact',
                'div.mx-auto.max-w-3xl#markdown-artifact'
            ],
            description: 'Canvas機能のテキスト表示エリア'
        },
        '4_2_Canvas開くボタン': {
            selectors: [
                '[aria-label="内容をプレビュー"]',
                '[role="button"][aria-label="内容をプレビュー"]',
                '.artifact-block-cell',
                '[class*="artifact-block"]'
            ],
            description: 'Canvas機能を開くボタン'
        },
        '5_通常処理テキスト位置': {
            selectors: [
                '.standard-markdown',
                'div.standard-markdown',
                '.grid.gap-2\\.5.standard-markdown',
                'div.grid-cols-1.standard-markdown',
                '[class*="standard-markdown"]'
            ],
            description: '通常処理のテキスト表示エリア'
        }
    };
    
    // モデル選択用セレクタ
    const modelSelectors = {
        menuButton: [
            { selector: 'button[data-testid="model-selector-dropdown"]', description: 'data-testid属性' },
            { selector: 'button[aria-haspopup="menu"]', description: 'aria-haspopup属性' },
            { selector: '#radix-_r_g_', description: 'ID属性（動的生成の可能性）' },
            { selector: 'button.inline-flex.items-center.justify-center', description: '複合クラス名' },
            { selector: 'button:has(svg.claude-logo-model-selector)', description: 'ロゴを含むボタン（フォールバック）' }
        ],
        menuContainer: [
            { selector: '[role="menu"][data-state="open"]', description: 'role + data-state属性' },
            { selector: '[data-radix-menu-content][data-state="open"]', description: 'data-radix属性' },
            { selector: 'div.z-dropdown[role="menu"]', description: 'クラス名 + role属性' },
            { selector: '[aria-orientation="vertical"][data-state="open"]', description: 'aria-orientation属性' },
            { selector: 'div[role="menu"]:not([data-state="closed"])', description: 'role属性（閉じていない）' }
        ],
        otherModelsMenu: [
            { selector: '[role="menuitem"][aria-haspopup="menu"]', description: 'role + aria-haspopup属性' },
            { selector: '[role="menuitem"]:has(svg)', description: 'SVGアイコンを持つメニュー項目' },
            { selector: 'div[role="menuitem"]:last-child', description: '最後のメニュー項目' }
        ],
        modelDisplay: [
            { selector: '.font-claude-response', description: 'font-claude-responseクラス' },
            { selector: 'div:has(svg.claude-logo-model-selector)', description: 'Claudeロゴを含むdiv' },
            { selector: 'button[data-testid="model-selector-dropdown"] .font-claude-response', description: 'ボタン内のレスポンス' }
        ]
    };
    
    // 機能選択用セレクタ
    const featureSelectors = {
        menuButton: [
            '[data-testid="input-menu-tools"]',
            '[aria-label="ツールメニューを開く"]',
            '#input-tools-menu-trigger',
            'button[aria-expanded][aria-haspopup="listbox"]',
            'button svg path[d*="M40,88H73a32"]'
        ],
        menuContainer: [
            '[aria-labelledby="input-tools-menu-trigger"]',
            '.w-\\[20rem\\].absolute.max-w-\\[calc\\(100vw-16px\\)\\].block',
            'div.z-dropdown.bg-bg-000.rounded-xl',
            'div[style*="max-height"][style*="336"]',
            '.absolute .flex-col .overscroll-auto'
        ],
        thinkToggle: [
            'button:has(svg path[d*="M10.3857 2.50977"]):has(input[role="switch"])',
            'button:has(p:contains("じっくり考える")):has(input[role="switch"])',
            'button input[role="switch"][style*="width: 28px"]',
            'div:contains("じっくり考える") button:has(.group\\/switch)',
            'button .font-base:contains("じっくり考える")'
        ],
        webSearchToggle: [
            'button:has(svg path[d*="M7.2705 3.0498"]):has(input[role="switch"])',
            'button:has(p:contains("ウェブ検索")):has(input[role="switch"])',
            'button.text-primary-500:has(input[role="switch"])',
            'div:contains("ウェブ検索") button:has(.group\\/switch)',
            'button .font-base:contains("ウェブ検索")'
        ],
        researchButton: [
            'button[aria-pressed]:has(svg path[d*="M8.5 2C12.0899"])',
            'button:has(p:contains("リサーチ"))',
            'button.text-accent-secondary-100:has(svg)',
            'button[type="button"]:has(.min-w-0.pl-1.text-xs)',
            '.flex.shrink button:has(svg)'
        ]
    };
    
    // Claude動作用セレクタ
    const claudeSelectors = {
        '1_テキスト入力欄': {
            selectors: [
                '[aria-label="クロードにプロンプトを入力してください"]',
                '.ProseMirror[contenteditable="true"]',
                '[role="textbox"][contenteditable="true"]',
                'div[contenteditable="true"][translate="no"]',
                '.ProseMirror',
                'div[enterkeyhint="enter"][role="textbox"]'
            ],
            description: 'テキスト入力欄（ProseMirrorエディタ）'
        },
        '2_送信ボタン': {
            selectors: [
                '[aria-label="メッセージを送信"]',
                'button[aria-label="メッセージを送信"]',
                '[data-state="closed"] button[type="button"]',
                'button.bg-accent-main-000',
                'button svg path[d*="M208.49,120.49"]'
            ],
            description: '送信ボタン'
        },
        '3_回答停止ボタン': {
            selectors: [
                '[aria-label="応答を停止"]',
                'button[aria-label="応答を停止"]',
                '[data-state="closed"][aria-label="応答を停止"]',
                'button.border-border-200[aria-label="応答を停止"]',
                'button svg path[d*="M128,20A108"]'
            ],
            description: '回答停止ボタン'
        },
        '4_Canvas機能テキスト位置': {
            selectors: [
                '#markdown-artifact',
                '[id="markdown-artifact"]',
                '.font-claude-response#markdown-artifact',
                '[tabindex="0"]#markdown-artifact',
                'div.mx-auto.max-w-3xl#markdown-artifact'
            ],
            description: 'Canvas機能のテキスト表示エリア'
        },
        '5_通常処理テキスト位置': {
            selectors: [
                '.standard-markdown',
                'div.standard-markdown',
                '.grid.gap-2\\.5.standard-markdown',
                'div.grid-cols-1.standard-markdown',
                '[class*="standard-markdown"]'
            ],
            description: '通常処理のテキスト表示エリア'
        }
    };
    
    // =====================================================================
    // ユーティリティ関数群（テストコードから）
    // =====================================================================
    
    const wait = async (ms) => {
        return new Promise(resolve => setTimeout(resolve, ms));
    };
    
    const waitForElement = async (selector, maxRetries = 10, retryDelay = 500) => {
        const log = (msg) => console.log(`⏳ [待機] ${msg}`);
        
        for (let i = 0; i < maxRetries; i++) {
            try {
                const element = document.querySelector(selector);
                if (element) {
                    const rect = element.getBoundingClientRect();
                    const isVisible = rect.width > 0 && rect.height > 0;
                    const style = window.getComputedStyle(element);
                    const isDisplayed = style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
                    
                    if (isVisible && isDisplayed) {
                        log(`✅ 要素発見: ${selector} (試行 ${i + 1}/${maxRetries})`);
                        return element;
                    }
                }
            } catch (error) {
                log(`⚠️ 要素検索エラー: ${error.message}`);
            }
            
            if (i < maxRetries - 1) {
                await wait(retryDelay);
            }
        }
        
        throw new Error(`要素が見つかりません: ${selector}`);
    };
    
    const getReactProps = (element) => {
        const keys = Object.keys(element || {});
        const reactKey = keys.find(key => key.startsWith('__reactInternalInstance') || key.startsWith('__reactFiber'));
        return reactKey ? element[reactKey] : null;
    };
    
    const triggerReactEvent = async (element, eventType = 'click') => {
        const log = (msg) => console.log(`🎯 [イベント] ${msg}`);
        
        try {
            const reactProps = getReactProps(element);
            if (reactProps) {
                log(`React要素検出: ${element.tagName}`);
            }
            
            if (eventType === 'click') {
                const rect = element.getBoundingClientRect();
                const x = rect.left + rect.width / 2;
                const y = rect.top + rect.height / 2;
                
                const events = [
                    new PointerEvent('pointerover', { bubbles: true, cancelable: true, clientX: x, clientY: y }),
                    new PointerEvent('pointerenter', { bubbles: false, cancelable: false, clientX: x, clientY: y }),
                    new MouseEvent('mouseover', { bubbles: true, cancelable: true, clientX: x, clientY: y }),
                    new MouseEvent('mouseenter', { bubbles: false, cancelable: false, clientX: x, clientY: y }),
                    new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons: 1 }),
                    new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons: 1 }),
                    new PointerEvent('pointerup', { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons: 0 }),
                    new MouseEvent('mouseup', { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons: 0 }),
                    new PointerEvent('click', { bubbles: true, cancelable: true, clientX: x, clientY: y })
                ];
                
                for (const event of events) {
                    element.dispatchEvent(event);
                    await wait(10);
                }
                
                element.click();
                log(`✅ イベント発火完了: ${eventType}`);
            }
        } catch (error) {
            log(`❌ イベント発火エラー: ${error.message}`);
            throw error;
        }
    };
    
    const findElementByMultipleSelectors = async (selectors, description) => {
        console.log(`\n🔍 [${description}] 要素検索開始`);
        
        for (let i = 0; i < selectors.length; i++) {
            const selector = selectors[i];
            console.log(`  試行 ${i + 1}/${selectors.length}: ${selector.description}`);
            
            try {
                const element = await waitForElement(selector.selector, 3, 200);
                if (element) {
                    console.log(`  ✅ 成功: ${selector.description}`);
                    return element;
                }
            } catch (error) {
                console.log(`  ❌ 失敗: ${error.message}`);
            }
        }
        
        throw new Error(`${description} の要素が見つかりません`);
    };
    
    // =====================================================================
    // モデル操作関数（テストコードから）
    // =====================================================================
    
    const openModelMenu = async () => {
        console.log('\n📂 【ステップ1-1】メニュークリックボタンをクリック');
        
        try {
            const button = await findElementByMultipleSelectors(modelSelectors.menuButton, 'メニューボタン');
            await triggerReactEvent(button, 'click');
            await wait(1000);
            
            const menu = await findElementByMultipleSelectors(modelSelectors.menuContainer, 'メニューコンテナ');
            console.log('✅ メニューオープン成功');
            return menu;
        } catch (error) {
            console.error('❌ メニューオープン失敗:', error.message);
            throw error;
        }
    };
    
    const closeModelMenu = async () => {
        console.log('\n📁 【ステップ1-5】メニューを閉じる処理');
        
        try {
            const escapeEvent = new KeyboardEvent('keydown', {
                key: 'Escape',
                code: 'Escape',
                keyCode: 27,
                bubbles: true,
                cancelable: true
            });
            
            document.dispatchEvent(escapeEvent);
            await wait(500);
            
            console.log('✅ メニュークローズ成功（Escape）');
        } catch (error) {
            console.error('❌ メニュークローズ失敗:', error.message);
            throw error;
        }
    };
    
    const getCurrentModel = async () => {
        try {
            const displayElement = await findElementByMultipleSelectors(modelSelectors.modelDisplay, 'モデル表示部分');
            const modelTexts = Array.from(displayElement.querySelectorAll('div')).map(el => el.textContent.trim());
            const modelName = modelTexts.find(text => text && !text.includes('svg'));
            return modelName ? `Claude${modelName}` : '不明';
        } catch (error) {
            console.error('現在のモデル取得エラー:', error.message);
            return '取得失敗';
        }
    };
    
    // =====================================================================
    // 機能操作関数（テストコードから）
    // =====================================================================
    
    function getFeatureElement(selectorList, elementName) {
        console.log(`要素取得開始: ${elementName}`);
        
        for (let i = 0; i < selectorList.length; i++) {
            const selector = selectorList[i];
            console.log(`試行 ${i + 1}/${selectorList.length}: ${selector}`);
            
            try {
                if (selector.includes(':has(')) {
                    const elements = document.querySelectorAll('button');
                    for (const el of elements) {
                        if (selector.includes('じっくり考える')) {
                            const text = el.textContent || '';
                            if (text.includes('じっくり考える') && el.querySelector('input[role="switch"]')) {
                                console.log(`要素発見: ${elementName} (特別処理)`);
                                return el;
                            }
                        }
                        if (selector.includes('ウェブ検索')) {
                            const text = el.textContent || '';
                            if (text.includes('ウェブ検索') && el.querySelector('input[role="switch"]')) {
                                console.log(`要素発見: ${elementName} (特別処理)`);
                                return el;
                            }
                        }
                    }
                } else {
                    const element = document.querySelector(selector);
                    if (element) {
                        console.log(`要素発見: ${elementName}`);
                        return element;
                    }
                }
            } catch (e) {
                console.log(`セレクタエラー: ${e.message}`);
            }
        }
        
        console.log(`要素が見つかりません: ${elementName}`);
        return null;
    }
    
    function getToggleState(toggleButton) {
        const input = toggleButton.querySelector('input[role="switch"]');
        if (!input) {
            console.log('トグルinput要素が見つかりません');
            return null;
        }
        return input.checked;
    }
    
    function setToggleState(toggleButton, targetState) {
        const currentState = getToggleState(toggleButton);
        if (currentState === null) return false;
        
        console.log(`トグル現在状態: ${currentState}, 目標状態: ${targetState}`);
        
        if (currentState !== targetState) {
            toggleButton.click();
            console.log('トグルクリック実行');
            return true;
        }
        
        console.log('状態変更不要');
        return false;
    }
    
    // =====================================================================
    // Claude動作関数（テストコードから）
    // =====================================================================
    
    const findClaudeElement = async (selectorInfo, retryCount = 3) => {
        const results = [];
        
        for (let retry = 0; retry < retryCount; retry++) {
            for (let i = 0; i < selectorInfo.selectors.length; i++) {
                const selector = selectorInfo.selectors[i];
                try {
                    if (selector.includes('svg path')) {
                        const paths = document.querySelectorAll(selector);
                        if (paths.length > 0) {
                            const button = paths[0].closest('button');
                            if (button) {
                                console.log(`✓ 要素発見 (SVG経由): ${selectorInfo.description}`);
                                return { element: button, selector, method: 'svg-parent' };
                            }
                        }
                    }
                    
                    const elements = document.querySelectorAll(selector);
                    
                    if (selectorInfo.description.includes('通常処理')) {
                        const filtered = Array.from(elements).filter(el => {
                            return !el.closest('#markdown-artifact') && 
                                   !el.closest('[class*="artifact"]');
                        });
                        
                        if (filtered.length > 0) {
                            const element = filtered[filtered.length - 1];
                            console.log(`✓ 要素発見 (フィルタ済み): ${selectorInfo.description} - セレクタ#${i + 1}`);
                            return { element, selector, method: 'filtered' };
                        }
                    } else if (elements.length > 0) {
                        console.log(`✓ 要素発見: ${selectorInfo.description} - セレクタ#${i + 1}`);
                        return { element: elements[0], selector, method: 'direct' };
                    }
                    
                    results.push({ selector, found: false });
                } catch (e) {
                    results.push({ selector, error: e.message });
                }
            }
            
            if (retry < retryCount - 1) {
                await wait(1000);
            }
        }
        
        console.warn(`✗ 要素未発見: ${selectorInfo.description}`);
        console.log('  試行結果:', results);
        return null;
    };
    
    const inputText = async (element, text) => {
        try {
            element.focus();
            await wait(100);
            
            element.textContent = '';
            
            const placeholderP = element.querySelector('p.is-empty');
            if (placeholderP) {
                placeholderP.remove();
            }
            
            const p = document.createElement('p');
            p.textContent = text;
            element.appendChild(p);
            
            element.classList.remove('ql-blank');
            
            const inputEvent = new Event('input', { bubbles: true, cancelable: true });
            const changeEvent = new Event('change', { bubbles: true, cancelable: true });
            
            element.dispatchEvent(inputEvent);
            element.dispatchEvent(changeEvent);
            
            console.log('✓ テキスト入力完了');
            return true;
        } catch (e) {
            console.error('✗ テキスト入力エラー:', e);
            return false;
        }
    };
    
    const clickButton = async (button) => {
        try {
            button.focus();
            await wait(50);
            
            const mousedown = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
            const mouseup = new MouseEvent('mouseup', { bubbles: true, cancelable: true });
            const click = new MouseEvent('click', { bubbles: true, cancelable: true });
            
            button.dispatchEvent(mousedown);
            await wait(10);
            button.dispatchEvent(mouseup);
            await wait(10);
            button.dispatchEvent(click);
            
            button.click();
            
            console.log('✓ ボタンクリック完了');
            return true;
        } catch (e) {
            console.error('✗ ボタンクリックエラー:', e);
            return false;
        }
    };
    
    const getTextPreview = (element) => {
        if (!element) return null;
        
        const fullText = element.textContent.trim();
        const length = fullText.length;
        
        if (length <= 200) {
            return { full: fullText, preview: fullText, length };
        } else {
            const preview = fullText.substring(0, 100) + '\n...[中略]...\n' + fullText.substring(length - 100);
            return { full: fullText, preview, length };
        }
    };
    
    // =====================================================================
    // Deep Research専用処理関数
    // =====================================================================
    
    const handleDeepResearchWait = async () => {
        console.log('\n【Deep Research専用待機処理】');
        console.log('─'.repeat(40));
        
        try {
            // ステップ1-1: 送信後、回答停止ボタンが出てくるまで待機
            console.log('\n【ステップ1-1】送信後、回答停止ボタンが出てくるまで待機');
            
            let stopButtonFound = false;
            let waitCount = 0;
            const maxInitialWait = 120; // 初期待機最大2分
            
            while (!stopButtonFound && waitCount < maxInitialWait) {
                const stopResult = await findClaudeElement(deepResearchSelectors['3_回答停止ボタン'], 1);
                
                if (stopResult) {
                    stopButtonFound = true;
                    console.log('✓ 停止ボタンが出現しました');
                    break;
                }
                
                await wait(1000);
                waitCount++;
                
                if (waitCount % 30 === 0) {
                    console.log(`  待機中... ${waitCount}秒経過`);
                }
            }
            
            // ステップ1-2: 2分間待機して停止ボタンの状態を確認
            console.log('\n【ステップ1-2】2分間待機して停止ボタンの状態を確認');
            const startTime = Date.now();
            let disappeared = false;
            
            while ((Date.now() - startTime) < 120000) { // 2分間
                const stopResult = await findClaudeElement(deepResearchSelectors['3_回答停止ボタン'], 1);
                
                if (!stopResult) {
                    disappeared = true;
                    console.log('✓ 停止ボタンが消滅しました（2分以内）');
                    break;
                }
                
                await wait(5000); // 5秒ごとにチェック
                
                const elapsed = Math.floor((Date.now() - startTime) / 1000);
                if (elapsed % 30 === 0) {
                    console.log(`  Deep Research処理中... ${elapsed}秒経過`);
                }
            }
            
            // ステップ1-3: 2分以内に消滅した場合、プロンプトを再送信
            if (disappeared) {
                console.log('\n【ステップ1-3】いいから元のプロンプトを確認して作業をして」を送信');
                
                const inputResult = await findClaudeElement(claudeSelectors['1_テキスト入力欄']);
                if (inputResult) {
                    await inputText(inputResult.element, "いいから元のプロンプトを確認して作業をして");
                    
                    // ステップ1-3-1〜1-3-3: 送信ボタンをクリック
                    console.log('【ステップ1-3-1】button.focus()でフォーカス');
                    console.log('【ステップ1-3-2】MouseEventチェーン: mousedown → mouseup → click');
                    console.log('【ステップ1-3-3】button.click()メソッド');
                    
                    const sendResult = await findClaudeElement(claudeSelectors['2_送信ボタン']);
                    if (sendResult) {
                        await clickButton(sendResult.element);
                    }
                }
            }
            
            // ステップ1-4: 回答停止ボタンが出現するまで待機
            console.log('\n【ステップ1-4】回答停止ボタンが出現するまで待機');
            stopButtonFound = false;
            waitCount = 0;
            const maxWaitCount = 2400; // 最大40分
            
            while (!stopButtonFound && waitCount < maxWaitCount) {
                const stopResult = await findClaudeElement(deepResearchSelectors['3_回答停止ボタン'], 1);
                
                if (stopResult) {
                    stopButtonFound = true;
                    console.log(`✓ 停止ボタンが出現しました（開始から${Math.floor(waitCount/60)}分${waitCount%60}秒後）`);
                    break;
                }
                
                await wait(1000);
                waitCount++;
                
                // 1分ごとにログ出力
                if (waitCount % 60 === 0) {
                    console.log(`  Deep Research処理中... ${Math.floor(waitCount/60)}分経過`);
                }
            }
            
            // ステップ1-5: 回答停止ボタンが10秒間消滅するまで待機
            if (stopButtonFound) {
                console.log('\n【ステップ1-5】回答停止ボタンが10秒間消滅するまで待機');
                let stopButtonGone = false;
                let disappearWaitCount = 0;
                const maxDisappearWait = 2400; // 最大40分
                let lastLogTime = Date.now();
                
                while (!stopButtonGone && disappearWaitCount < maxDisappearWait) {
                    const stopResult = await findClaudeElement(deepResearchSelectors['3_回答停止ボタン'], 1);
                    
                    if (!stopResult) {
                        // 10秒間確認
                        let confirmCount = 0;
                        let stillGone = true;
                        
                        while (confirmCount < 10) {
                            await wait(1000);
                            const checkResult = await findClaudeElement(deepResearchSelectors['3_回答停止ボタン'], 1);
                            if (checkResult) {
                                stillGone = false;
                                break;
                            }
                            confirmCount++;
                        }
                        
                        if (stillGone) {
                            stopButtonGone = true;
                            console.log(`✓ Deep Research完了（総時間: ${Math.floor(disappearWaitCount/60)}分）`);
                            break;
                        }
                    }
                    
                    await wait(1000);
                    disappearWaitCount++;
                    
                    // 1分ごとにログ出力
                    if (Date.now() - lastLogTime >= 60000) {
                        console.log(`  Deep Research生成中... ${Math.floor(disappearWaitCount / 60)}分経過`);
                        lastLogTime = Date.now();
                    }
                }
            }
            
        } catch (error) {
            console.error('❌ Deep Research待機処理エラー:', error.message);
            throw error;
        }
    };
    
    // =====================================================================
    // メイン実行関数
    // =====================================================================
    
    async function executeTask(taskData) {
        console.log('%c🚀 Claude V2 タスク実行開始', 'color: #9C27B0; font-weight: bold; font-size: 16px');
        console.log('受信したタスクデータ:', {
            model: taskData.model,
            function: taskData.function,
            promptLength: taskData.prompt?.length || taskData.text?.length || 0,
            hasPrompt: !!(taskData.prompt || taskData.text)
        });
        
        try {
            // パラメータ準備（スプレッドシートの値をそのまま使用）
            const prompt = taskData.prompt || taskData.text || '';
            const modelName = taskData.model || '';
            const featureName = taskData.function || null;
            
            // Deep Researchの判定
            const isDeepResearch = featureName && (
                featureName === 'Deep Research' || 
                featureName.includes('Research') ||
                featureName.includes('リサーチ')
            );
            
            console.log(`選択されたモデル: ${modelName}`);
            console.log(`選択された機能: ${featureName || '設定なし'}`);
            console.log(`Deep Researchモード: ${isDeepResearch}`);
            console.log(`プロンプト: ${prompt.substring(0, 100)}...`);
            
            // ===== ステップ4: テキスト入力 =====
            console.log('\n【ステップ4】テキスト入力');
            console.log('─'.repeat(40));
            
            const inputResult = await findClaudeElement(claudeSelectors['1_テキスト入力欄']);
            if (!inputResult) {
                throw new Error('入力欄が見つかりません');
            }
            await inputText(inputResult.element, prompt);
            
            // ===== ステップ5: モデル選択 =====
            if (modelName && modelName !== '') {
                console.log('\n【ステップ5】モデル選択');
                console.log('─'.repeat(40));
                
                console.log('\n【ステップ5-1】モデルを選択');
                await openModelMenu();
                
                // モデル名がClaudeを含むか確認
                const targetModelName = modelName.startsWith('Claude') ? modelName : `Claude ${modelName}`;
                
                // サブメニューチェック
                let needSubMenu = false;
                const mainMenuItems = document.querySelectorAll('[role="menuitem"]:not([aria-haspopup="menu"])');
                let foundInMain = false;
                
                for (const item of mainMenuItems) {
                    const itemText = item.textContent;
                    if (itemText && itemText.includes(targetModelName)) {
                        foundInMain = true;
                        await triggerReactEvent(item, 'click');
                        await wait(1500);
                        break;
                    }
                }
                
                if (!foundInMain) {
                    // 他のモデルメニューを開く
                    const otherModelsButton = await findElementByMultipleSelectors(modelSelectors.otherModelsMenu, '他のモデルボタン');
                    if (otherModelsButton) {
                        await triggerReactEvent(otherModelsButton, 'click');
                        await wait(500);
                        
                        const subMenuItems = document.querySelectorAll('[role="menuitem"]');
                        for (const item of subMenuItems) {
                            const itemText = item.textContent;
                            if (itemText && itemText.includes(targetModelName)) {
                                await triggerReactEvent(item, 'click');
                                await wait(1500);
                                break;
                            }
                        }
                    }
                }
                
                console.log('\n【ステップ5-2】モデルが表示され一致しているか確認');
                const newCurrentModel = await getCurrentModel();
                console.log(`選択後のモデル: ${newCurrentModel}`);
            }
            
            // ===== ステップ6: 機能選択 =====
            if (featureName && featureName !== '' && featureName !== '設定なし') {
                console.log('\n【ステップ6】機能選択');
                console.log('─'.repeat(40));
                
                console.log('\n【ステップ6-1】機能を選択');
                
                const featureMenuBtn = getFeatureElement(featureSelectors.menuButton, '機能メニューボタン');
                if (featureMenuBtn) {
                    featureMenuBtn.click();
                    await wait(1500);
                    
                    if (isDeepResearch) {
                        // ウェブ検索をオンにする
                        const webSearchToggle = getFeatureElement(featureSelectors.webSearchToggle, 'ウェブ検索トグル');
                        if (webSearchToggle) {
                            setToggleState(webSearchToggle, true);
                            await wait(1500);
                        }
                        
                        // メニューを閉じる（Deep Research用）
                        console.log('\n【ステップ0-1】Deep Research用: メニューを閉じる');
                        featureMenuBtn.click();
                        await wait(1000);
                        
                        // リサーチボタンを探してクリック
                        const buttons = document.querySelectorAll('button[type="button"][aria-pressed]');
                        for (const btn of buttons) {
                            const svg = btn.querySelector('svg path[d*="M8.5 2C12.0899"]');
                            if (svg) {
                                const isPressed = btn.getAttribute('aria-pressed') === 'true';
                                if (!isPressed) {
                                    btn.click();
                                    await wait(1000);
                                }
                                break;
                            }
                        }
                    } else {
                        // その他の機能を選択
                        const toggles = document.querySelectorAll('button:has(input[role="switch"])');
                        for (const toggle of toggles) {
                            const label = toggle.querySelector('p.font-base');
                            if (label && label.textContent.trim() === featureName) {
                                setToggleState(toggle, true);
                                await wait(500);
                                break;
                            }
                        }
                        
                        // メニューを閉じる
                        featureMenuBtn.click();
                        await wait(1000);
                    }
                }
                
                console.log('\n【ステップ6-2】機能が選択されているか確認');
                console.log(`選択機能: ${featureName}`);
            }
            
            // ===== ステップ7: メッセージ送信 =====
            console.log('\n【ステップ7】メッセージ送信');
            console.log('─'.repeat(40));
            
            const sendResult = await findClaudeElement(claudeSelectors['2_送信ボタン']);
            if (!sendResult) {
                throw new Error('送信ボタンが見つかりません');
            }
            await clickButton(sendResult.element);
            
            // 送信時刻を記録（SpreadsheetLogger用）
            log(`🔍 送信時刻記録開始 - AIHandler: ${!!window.AIHandler}, recordSendTimestamp: ${!!window.AIHandler?.recordSendTimestamp}, currentAITaskInfo: ${!!window.currentAITaskInfo}`, 'info');
            if (window.AIHandler && window.AIHandler.recordSendTimestamp) {
                try {
                    log(`📝 送信時刻記録実行開始 - タスクID: ${window.currentAITaskInfo?.taskId}`, 'info');
                    await window.AIHandler.recordSendTimestamp('Claude');
                    log(`✅ 送信時刻記録成功`, 'success');
                } catch (error) {
                    log(`❌ 送信時刻記録エラー: ${error.message}`, 'error');
                }
            } else {
                log(`⚠️ AIHandler または recordSendTimestamp が利用できません`, 'warning');
            }
            
            // ===== ステップ8: 応答待機 =====
            if (isDeepResearch) {
                console.log('\n【ステップ8】Deep Research応答待機');
                console.log('最大待機時間: 40分');
                console.log('─'.repeat(40));
                
                await handleDeepResearchWait();
            } else {
                console.log('\n【ステップ8】通常応答待機');
                console.log('─'.repeat(40));
                
                console.log('\n【ステップ8-1】送信停止ボタンが出てくるまで待機（最大30秒）');
                let stopButtonFound = false;
                let waitCount = 0;
                const maxWaitCount = 30;
                
                while (!stopButtonFound && waitCount < maxWaitCount) {
                    const stopResult = await findClaudeElement(claudeSelectors['3_回答停止ボタン'], 1);
                    
                    if (stopResult) {
                        stopButtonFound = true;
                        console.log('✓ 停止ボタンが出現しました');
                        break;
                    }
                    
                    await wait(1000);
                    waitCount++;
                    
                    if (waitCount % 10 === 0) {
                        console.log(`  待機中... ${waitCount}秒経過`);
                    }
                }
                
                if (stopButtonFound) {
                    console.log('停止ボタンが10秒間消えるまで待機（最大5分）');
                    let stopButtonGone = false;
                    let disappearWaitCount = 0;
                    const maxDisappearWait = 300;
                    
                    while (!stopButtonGone && disappearWaitCount < maxDisappearWait) {
                        const stopResult = await findClaudeElement(claudeSelectors['3_回答停止ボタン'], 1);
                        
                        if (!stopResult) {
                            let confirmCount = 0;
                            let stillGone = true;
                            
                            while (confirmCount < 10) {
                                await wait(1000);
                                const checkResult = await findClaudeElement(claudeSelectors['3_回答停止ボタン'], 1);
                                if (checkResult) {
                                    stillGone = false;
                                    break;
                                }
                                confirmCount++;
                            }
                            
                            if (stillGone) {
                                stopButtonGone = true;
                                console.log('✓ 回答が完了しました');
                                break;
                            }
                        }
                        
                        await wait(1000);
                        disappearWaitCount++;
                        
                        if (disappearWaitCount % 60 === 0) {
                            console.log(`  回答生成中... ${Math.floor(disappearWaitCount / 60)}分経過`);
                        }
                    }
                }
            }
            
            // ===== ステップ9: テキスト取得と表示 =====
            console.log('\n【ステップ9】テキスト取得と表示');
            console.log('─'.repeat(40));
            
            let responseText = '';
            
            // Canvas機能テキスト取得
            let canvasResult = await findClaudeElement(claudeSelectors['4_Canvas機能テキスト位置'], 1);
            
            if (!canvasResult) {
                console.log('Canvas機能を開くボタンを探します');
                const openButtonSelectors = deepResearchSelectors['4_2_Canvas開くボタン'].selectors;
                
                for (const selector of openButtonSelectors) {
                    try {
                        const openButton = document.querySelector(selector);
                        if (openButton) {
                            console.log('Canvas機能を開くボタンを発見、クリックします');
                            await clickButton(openButton);
                            await wait(1000);
                            
                            canvasResult = await findClaudeElement(claudeSelectors['4_Canvas機能テキスト位置'], 1);
                            if (canvasResult) {
                                break;
                            }
                        }
                    } catch (e) {
                        // エラーは無視して次を試す
                    }
                }
            }
            
            if (canvasResult) {
                const canvasText = getTextPreview(canvasResult.element);
                if (canvasText) {
                    console.log('\n**取得したCanvasのテキスト**');
                    console.log(`文字数: ${canvasText.length}文字`);
                    console.log(canvasText.preview);
                    responseText = canvasText.full;
                }
            }
            
            // 通常処理テキスト取得
            if (!responseText) {
                const normalResult = await findClaudeElement(claudeSelectors['5_通常処理テキスト位置']);
                
                if (normalResult) {
                    const normalText = getTextPreview(normalResult.element);
                    if (normalText) {
                        console.log('\n**取得した通常処理のテキスト**');
                        console.log(`文字数: ${normalText.length}文字`);
                        console.log(normalText.preview);
                        responseText = normalText.full;
                    }
                }
            }
            
            if (responseText) {
                console.log('✅ Claude V2 タスク実行完了');
                return {
                    success: true,
                    response: responseText
                };
            } else {
                throw new Error('応答テキストを取得できませんでした');
            }
            
        } catch (error) {
            console.error('❌ Claude V2 タスク実行エラー:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    // ========================================
    // runAutomation関数（後方互換性）
    // ========================================
    async function runAutomation(config) {
        return executeTask({
            model: config.model,
            function: config.function,
            prompt: config.text || config.prompt
        });
    }
    
    // ========================================
    // グローバル公開
    // ========================================
    window.ClaudeAutomationV2 = {
        executeTask,
        runAutomation
    };
    
    console.log('✅ Claude Automation V2 準備完了');
    console.log('使用方法: ClaudeAutomationV2.executeTask({ model: "3.5 Sonnet", function: "Deep Research", prompt: "..." })');
    
})();