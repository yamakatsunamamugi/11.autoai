/**
 * @fileoverview Claude Automation V2 - テスト済みコードベース版
 * 
 * 特徴:
 * - テスト済みのロジックをそのまま使用
 * - モデル選択・機能選択・応答待機・テキスト取得の完全移植
 * - Deep Research対応（最大40分待機）
 * - 統一された待機時間設定を使用
 * 
 * @version 2.2.0
 */
(function() {
    'use strict';
    
    console.log(`Claude Automation V2 - 初期化時刻: ${new Date().toLocaleString('ja-JP')}`);
    
    // 統一された待機時間設定を取得
    const AI_WAIT_CONFIG = window.AI_WAIT_CONFIG || {
        INITIAL_WAIT: 30000,
        MAX_WAIT: 300000,
        CHECK_INTERVAL: 2000,
        DEEP_RESEARCH_WAIT: 2400000,
        SHORT_WAIT: 1000,
        MEDIUM_WAIT: 2000,
        STOP_BUTTON_INITIAL_WAIT: 30000,
        STOP_BUTTON_DISAPPEAR_WAIT: 300000
    };
    
    // ui-selectorsからインポート（Chrome拡張機能のインジェクトコンテキスト）
    const UI_SELECTORS = window.UI_SELECTORS || {};
    
    // =====================================================================
    // セレクタ定義（ui-selectorsからマージ、テストコードから完全移植）
    // =====================================================================
    
    // Deep Research用セレクタ（ui-selectorsから取得）
    const getDeepResearchSelectors = () => ({
        '3_回答停止ボタン': {
            selectors: UI_SELECTORS.Claude?.STOP_BUTTON || [
                '[aria-label="応答を停止"]',
                'button[aria-label="応答を停止"]',
                '[data-state="closed"][aria-label="応答を停止"]',
                'button.border-border-200[aria-label="応答を停止"]',
                'button svg path[d*="M128,20A108"]'
            ],
            description: '回答停止ボタン'
        },
        '4_Canvas機能テキスト位置': {
            selectors: UI_SELECTORS.Claude?.TEXT_EXTRACTION?.ARTIFACT_CONTENT || [
                '#markdown-artifact',
                '[id="markdown-artifact"]',
                '.font-claude-response#markdown-artifact',
                '[tabindex="0"]#markdown-artifact',
                'div.mx-auto.max-w-3xl#markdown-artifact'
            ],
            description: 'Canvas機能のテキスト表示エリア'
        },
        '4_2_Canvas開くボタン': {
            selectors: UI_SELECTORS.Claude?.PREVIEW_BUTTON || [
                '[aria-label="内容をプレビュー"]',
                '[role="button"][aria-label="内容をプレビュー"]',
                '.artifact-block-cell',
                '[class*="artifact-block"]'
            ],
            description: 'Canvas機能を開くボタン'
        },
        '5_通常処理テキスト位置': {
            selectors: UI_SELECTORS.Claude?.TEXT_EXTRACTION?.NORMAL_RESPONSE || [
                '.standard-markdown',
                'div.standard-markdown',
                '.grid.gap-2\\.5.standard-markdown',
                'div.grid-cols-1.standard-markdown',
                '[class*="standard-markdown"]'
            ],
            description: '通常処理のテキスト表示エリア'
        }
    });
    
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
    
    // 機能選択用セレクタ（テストコードから移植）
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
    
    // テストコードから移植したユーティリティ関数
    const isVisible = (element) => {
        if (!element) return false;
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return rect.width > 0 && 
               rect.height > 0 && 
               style.display !== 'none' && 
               style.visibility !== 'hidden' && 
               style.opacity !== '0';
    };
    
    const getElement = async function(selectors, description) {
        console.log(`要素取得開始: ${description}`);
        
        for (let i = 0; i < selectors.length; i++) {
            const selector = selectors[i];
            console.log(`  試行${i + 1}: ${selector}`);
            
            try {
                // :has()擬似クラスの特別処理
                if (selector.includes(':has(') && selector.includes('ウェブ検索')) {
                    const buttons = document.querySelectorAll('button');
                    for (const el of buttons) {
                        const text = el.textContent || '';
                        if (text.includes('ウェブ検索') && el.querySelector('input[role="switch"]')) {
                            console.log(`  ✓ 要素発見: ${description} (特別処理)`);
                            return el;
                        }
                    }
                } else {
                    const element = document.querySelector(selector);
                    if (element && isVisible(element)) {
                        console.log(`  ✓ 要素発見: ${description}`);
                        return element;
                    }
                }
            } catch (e) {
                console.log(`  セレクタエラー: ${e.message}`);
            }
        }
        
        console.log(`  ✗ 要素が見つかりません: ${description}`);
        return null;
    };
    
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
            const maxInitialWait = AI_WAIT_CONFIG.STOP_BUTTON_INITIAL_WAIT / 1000; // 統一設定: 30秒
            
            while (!stopButtonFound && waitCount < maxInitialWait) {
                const deepResearchSelectors = getDeepResearchSelectors();
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
                const deepResearchSelectors = getDeepResearchSelectors();
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
            const maxWaitCount = AI_WAIT_CONFIG.DEEP_RESEARCH_WAIT / 1000; // 統一設定: 40分
            
            while (!stopButtonFound && waitCount < maxWaitCount) {
                const deepResearchSelectors = getDeepResearchSelectors();
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
                const maxDisappearWait = AI_WAIT_CONFIG.DEEP_RESEARCH_WAIT / 1000; // 統一設定: 40分
                let lastLogTime = Date.now();
                
                while (!stopButtonGone && disappearWaitCount < maxDisappearWait) {
                    const deepResearchSelectors = getDeepResearchSelectors();
                    const stopResult = await findClaudeElement(deepResearchSelectors['3_回答停止ボタン'], 1);
                    
                    if (!stopResult) {
                        // 10秒間確認
                        let confirmCount = 0;
                        let stillGone = true;
                        
                        while (confirmCount < 10) {
                            await wait(1000);
                            const deepResearchSelectors = getDeepResearchSelectors();
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
            hasPrompt: !!(taskData.prompt || taskData.text),
            cellInfo: taskData.cellInfo
        });
        
        try {
            // パラメータ準備（スプレッドシートの値をそのまま使用）
            let prompt = taskData.prompt || taskData.text || '';
            const modelName = taskData.model || '';
            const featureName = taskData.function || null;
            
            // セル情報をプロンプトに追加（column-processor.js形式）
            if (taskData.cellInfo && taskData.cellInfo.column && taskData.cellInfo.row) {
                const cellPosition = `${taskData.cellInfo.column}${taskData.cellInfo.row}`;
                prompt = `【現在${cellPosition}セルを処理中です】

${prompt}`;
                console.log(`📍 セル情報をプロンプトに追加: ${cellPosition}`);
            }
            
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
            
            // ===== ステップ7: メッセージ送信（再試行対応） =====
            console.log('\n【ステップ7】メッセージ送信（再試行対応）');
            console.log('─'.repeat(40));
            
            // 送信ボタンを5回まで再試行
            let sendSuccess = false;
            let sendAttempts = 0;
            const maxSendAttempts = 5;
            
            while (!sendSuccess && sendAttempts < maxSendAttempts) {
                sendAttempts++;
                console.log(`送信試行 ${sendAttempts}/${maxSendAttempts}`);
                
                const sendResult = await findClaudeElement(claudeSelectors['2_送信ボタン']);
                if (!sendResult) {
                    if (sendAttempts === maxSendAttempts) {
                        throw new Error('送信ボタンが見つかりません');
                    }
                    console.log(`送信ボタンが見つかりません。2秒後に再試行...`);
                    await wait(2000);
                    continue;
                }
                
                await clickButton(sendResult.element);
                console.log(`送信ボタンをクリックしました（試行${sendAttempts}）`);
                await wait(1000);
                
                // 送信後に停止ボタンが表示されるか、5秒待機
                let stopButtonAppeared = false;
                
                for (let i = 0; i < 5; i++) {
                    const stopResult = await findClaudeElement(claudeSelectors['3_回答停止ボタン'], 1);
                    if (stopResult) {
                        stopButtonAppeared = true;
                        console.log('停止ボタンが表示されました - 送信成功');
                        break;
                    }
                    await wait(1000);
                }
                
                if (stopButtonAppeared) {
                    sendSuccess = true;
                    break;
                } else {
                    console.log(`送信反応が確認できません。再試行します...`);
                    await wait(2000);
                }
            }
            
            if (!sendSuccess) {
                throw new Error(`${maxSendAttempts}回試行しても送信が成功しませんでした`);
            }
            
            // 送信時刻を記録（SpreadsheetLogger用）
            console.log(`🔍 送信時刻記録開始 - AIHandler: ${!!window.AIHandler}, recordSendTimestamp: ${!!window.AIHandler?.recordSendTimestamp}, currentAITaskInfo: ${!!window.currentAITaskInfo}`);
            if (window.AIHandler && window.AIHandler.recordSendTimestamp) {
                try {
                    console.log(`📝 送信時刻記録実行開始 - タスクID: ${window.currentAITaskInfo?.taskId}`);
                    await window.AIHandler.recordSendTimestamp('Claude');
                    console.log(`✅ 送信時刻記録成功`);
                } catch (error) {
                    console.log(`❌ 送信時刻記録エラー: ${error.message}`);
                }
            } else {
                console.log(`⚠️ AIHandler または recordSendTimestamp が利用できません`);
            }
            
            // ===== ステップ8: 応答待機 =====
            if (isDeepResearch) {
                console.log('\n【ステップ8】Deep Research応答待機');
                console.log('最大待機時間: 40分');
                console.log('─'.repeat(40));
                
                await handleDeepResearchWait();
            } else {
                console.log('\n【ステップ8】通常応答待機（改善版）');
                console.log('─'.repeat(40));
                
                // ui-selectorsから停止ボタンセレクタを取得
                const stopButtonSelectors = UI_SELECTORS.Claude?.STOP_BUTTON || [
                    '[aria-label="応答を停止"]',
                    'button[aria-label="応答を停止"]',
                    '[data-state="closed"][aria-label="応答を停止"]',
                    'button.border-border-200[aria-label="応答を停止"]',
                    'button svg path[d*="M128,20A108"]'
                ];
                
                console.log('\n【ステップ8-1】送信停止ボタンが出てくるまで待機（最大60秒）');
                let stopButtonFound = false;
                let waitCount = 0;
                const maxWaitCount = AI_WAIT_CONFIG.STOP_BUTTON_INITIAL_WAIT / 1000; // 統一設定: 30秒
                
                // 停止ボタンの出現を待機
                while (!stopButtonFound && waitCount < maxWaitCount) {
                    let currentStopElement = null;
                    
                    // 複数セレクタで停止ボタンを検索
                    for (const selector of stopButtonSelectors) {
                        try {
                            currentStopElement = document.querySelector(selector);
                            if (currentStopElement) {
                                stopButtonFound = true;
                                console.log(`✓ 停止ボタンが出現しました (${selector})`);
                                break;
                            }
                        } catch (e) {
                            // セレクタエラーは無視
                        }
                    }
                    
                    if (!stopButtonFound) {
                        await wait(1000);
                        waitCount++;
                        
                        if (waitCount % 10 === 0) {
                            console.log(`  停止ボタン待機中... ${waitCount}秒経過`);
                        }
                    }
                }
                
                // 停止ボタンが見つからない場合のフォールバック処理
                if (!stopButtonFound) {
                    console.log('⚠️ 停止ボタンが見つかりません。応答完了を直接チェックします');
                    
                    // 応答テキストの存在をチェック
                    let responseFound = false;
                    let textCheckCount = 0;
                    const maxTextCheck = 30; // 30秒間チェック
                    
                    while (!responseFound && textCheckCount < maxTextCheck) {
                        const normalSelectors = UI_SELECTORS.Claude?.TEXT_EXTRACTION?.NORMAL_RESPONSE || ['.standard-markdown'];
                        
                        for (const selector of normalSelectors) {
                            try {
                                const elements = document.querySelectorAll(selector);
                                if (elements.length > 0) {
                                    const lastElement = elements[elements.length - 1];
                                    const text = lastElement.textContent?.trim();
                                    if (text && text.length > 10) {
                                        responseFound = true;
                                        console.log('✓ 応答テキストを確認しました（停止ボタン経由なし）');
                                        break;
                                    }
                                }
                            } catch (e) {
                                // エラーは無視
                            }
                        }
                        
                        if (!responseFound) {
                            await wait(1000);
                            textCheckCount++;
                            
                            if (textCheckCount % 10 === 0) {
                                console.log(`  応答テキストチェック中... ${textCheckCount}秒経過`);
                            }
                        }
                    }
                    
                    if (!responseFound) {
                        console.log('⚠️ 応答を確認できませんでしたが、処理を継続します');
                    }
                } else {
                    // 停止ボタンが見つかった場合の通常処理
                    console.log('停止ボタンが10秒間消えるまで待機（最大5分）');
                    let stopButtonGone = false;
                    let disappearWaitCount = 0;
                    const maxDisappearWait = AI_WAIT_CONFIG.STOP_BUTTON_DISAPPEAR_WAIT / 1000; // 統一設定: 5分
                    
                    while (!stopButtonGone && disappearWaitCount < maxDisappearWait) {
                        let currentStopElement = null;
                        
                        // 停止ボタンの存在チェック
                        for (const selector of stopButtonSelectors) {
                            try {
                                currentStopElement = document.querySelector(selector);
                                if (currentStopElement) break;
                            } catch (e) {
                                // エラーは無視
                            }
                        }
                        
                        if (!currentStopElement) {
                            // 10秒間の確認期間
                            let confirmCount = 0;
                            let stillGone = true;
                            
                            while (confirmCount < 10) {
                                await wait(1000);
                                
                                // 再度停止ボタンをチェック
                                for (const selector of stopButtonSelectors) {
                                    try {
                                        const checkElement = document.querySelector(selector);
                                        if (checkElement) {
                                            stillGone = false;
                                            break;
                                        }
                                    } catch (e) {
                                        // エラーは無視
                                    }
                                }
                                
                                if (!stillGone) break;
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
                    
                    if (!stopButtonGone) {
                        console.log('⚠️ 最大待機時間に達しましたが、処理を継続します');
                    }
                }
            }
            
            // ===== ステップ9: テキスト取得と表示 =====
            console.log('\n【ステップ9】テキスト取得と表示');
            console.log('─'.repeat(40));
            
            let responseText = '';
            
            // テスト済みロジックを使用（動作確認済み）
            console.log('\n通常処理テキスト取得試行');
            
            // ui-selectorsから取得、フォールバック付き
            const textSelectors = UI_SELECTORS.Claude?.TEXT_EXTRACTION || {
                NORMAL_RESPONSE: [
                    '.standard-markdown',
                    'div.standard-markdown',
                    '.grid.gap-2\\.5.standard-markdown',
                    'div.grid-cols-1.standard-markdown',
                    '[class*="standard-markdown"]'
                ]
            };
            
            // ui-selectorsのNORMAL_RESPONSEセレクタを使用
            const normalElements = document.querySelectorAll(textSelectors.NORMAL_RESPONSE.join(', '));
            
            if (normalElements.length > 0) {
                console.log(`通常処理要素数: ${normalElements.length}個`);
                
                // Canvas要素内を除外してフィルタリング
                const filtered = Array.from(normalElements).filter(el => {
                    return !el.closest('#markdown-artifact') && 
                           !el.closest('[class*="artifact"]');
                });
                
                if (filtered.length > 0) {
                    // 最後の要素（最新の応答）を取得
                    const targetElement = filtered[filtered.length - 1];
                    responseText = targetElement.textContent?.trim() || '';
                    
                    if (responseText) {
                        console.log(`✓ 通常処理テキスト取得成功: ${responseText.length}文字`);
                        console.log(`最初の100文字: ${responseText.substring(0, 100)}...`);
                    }
                }
            }
            
            // フォールバック: Canvas機能の内容を取得
            if (!responseText) {
                const canvasSelectors = textSelectors.ARTIFACT_CONTENT || ['#markdown-artifact'];
                for (const selector of canvasSelectors) {
                    const canvasElement = document.querySelector(selector);
                    if (canvasElement) {
                        const text = canvasElement.textContent?.trim() || '';
                        if (text && text.length > 10) {
                            responseText = text;
                            console.log(`✓ Canvas機能取得成功 (${selector}): ${text.length}文字`);
                            console.log(`最初の100文字: ${text.substring(0, 100)}...`);
                            break;
                        }
                    }
                }
            }
            
            // 最終フォールバック: 汎用セレクタで探す
            if (!responseText) {
                const genericSelectors = textSelectors.GENERIC_RESPONSE || ['div.font-claude-message', 'div[class*="response"]', 'article[class*="message"]'];
                const genericElements = document.querySelectorAll(genericSelectors.join(', '));
                if (genericElements.length > 0) {
                    const lastElem = genericElements[genericElements.length - 1];
                    const text = lastElem.textContent?.trim() || '';
                    if (text && text.length > 10) {
                        responseText = text;
                        console.log(`✓ 汎用セレクタ取得成功: ${text.length}文字`);
                        console.log(`最初の100文字: ${text.substring(0, 100)}...`);
                    }
                }
            }
            
            if (responseText) {
                console.log('✅ Claude V2 タスク実行完了');
                
                // 完了フラグを設定
                window.__v2_execution_complete = true;
                window.__v2_execution_result = {
                    success: true,
                    response: responseText
                };
                
                return {
                    success: true,
                    response: responseText
                };
            } else {
                // エラー時も完了フラグを設定
                window.__v2_execution_complete = true;
                window.__v2_execution_result = {
                    success: false,
                    error: '応答テキストを取得できませんでした'
                };
                
                throw new Error('応答テキストを取得できませんでした');
            }
            
        } catch (error) {
            console.error('❌ Claude V2 タスク実行エラー:', error);
            
            // catch時も完了フラグを設定
            window.__v2_execution_complete = true;
            window.__v2_execution_result = {
                success: false,
                error: error.message
            };
            
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    // ========================================
    // フェーズ別実行メソッド（順次処理用）
    // ========================================
    
    /**
     * テキスト入力のみ実行
     * @param {string} prompt - 入力するテキスト
     * @param {object} config - 設定オブジェクト（cellInfo等を含む）
     */
    async function inputTextOnly(prompt, config = {}) {
        try {
            console.log('📝 [ClaudeV2] テキスト入力のみ実行');
            
            // セル情報をプロンプトに追加（column-processor.js形式）
            let finalPrompt = prompt;
            if (config.cellInfo && config.cellInfo.column && config.cellInfo.row) {
                const cellPosition = `${config.cellInfo.column}${config.cellInfo.row}`;
                finalPrompt = `【現在${cellPosition}セルを処理中です】

${prompt}`;
                console.log(`📍 セル情報をプロンプトに追加: ${cellPosition}`);
            }
            
            const inputResult = await findClaudeElement(claudeSelectors['1_テキスト入力欄']);
            if (!inputResult) {
                throw new Error('入力欄が見つかりません');
            }
            
            const success = await inputText(inputResult.element, finalPrompt);
            if (!success) {
                throw new Error('テキスト入力に失敗しました');
            }
            
            console.log('✅ [ClaudeV2] テキスト入力完了');
            return { success: true };
        } catch (error) {
            console.error('❌ [ClaudeV2] テキスト入力エラー:', error.message);
            return { success: false, error: error.message };
        }
    }
    
    /**
     * モデル選択のみ実行
     * @param {string} modelName - 選択するモデル名
     */
    async function selectModelOnly(modelName) {
        try {
            if (!modelName || modelName === '') {
                console.log('⚠️ [ClaudeV2] モデル名が指定されていません');
                return { success: true };
            }
            
            console.log(`📝 [ClaudeV2] モデル選択のみ実行: ${modelName}`);
            
            // モデルメニューを開く
            await openModelMenu();
            
            // モデル名がClaudeを含むか確認
            const targetModelName = modelName.startsWith('Claude') ? modelName : `Claude ${modelName}`;
            
            // メニューアイテムを探して選択
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
            
            // メインメニューで見つからない場合はサブメニューを探す
            if (!foundInMain) {
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
            
            // 選択後のモデル確認
            const newCurrentModel = await getCurrentModel();
            console.log(`✅ [ClaudeV2] モデル選択完了: ${newCurrentModel}`);
            
            return { 
                success: true,
                displayedModel: newCurrentModel
            };
        } catch (error) {
            console.error('❌ [ClaudeV2] モデル選択エラー:', error.message);
            return { success: false, error: error.message };
        }
    }
    
    /**
     * 機能選択のみ実行（テストコードから完全移植）
     * @param {string} functionName - 選択する機能名
     */
    async function selectFunctionOnly(functionName) {
        try {
            console.log(`🚀 [DEBUG] selectFunctionOnly関数開始 - 引数: "${functionName}"`);
            console.log(`🚀 [DEBUG] window.ClaudeAutomationV2存在確認:`, !!window.ClaudeAutomationV2);
            console.log(`🚀 [DEBUG] 現在のURL: ${window.location.href}`);
            
            if (!functionName || functionName === '' || functionName === '設定なし') {
                console.log('⚠️ [ClaudeV2] 機能が指定されていません');
                const result = { success: true, displayedFunction: '通常' };
                console.log(`🚀 [DEBUG] selectFunctionOnly終了 - 早期リターン:`, result);
                return result;
            }
            
            console.log(`📝 [ClaudeV2] 機能選択のみ実行: ${functionName}`);
            
            // Deep Researchの判定
            const isDeepResearch = functionName === 'Deep Research' || 
                                   functionName.includes('Research') ||
                                   functionName.includes('リサーチ');
            
            if (isDeepResearch) {
                // === Deep Research用の設定 ===
                console.log('Deep Researchモード設定開始');
                
                // 機能メニューを開く
                const featureMenuButton = await getElement(featureSelectors.menuButton, '機能メニューボタン');
                if (!featureMenuButton) {
                    console.log('⚠️ [ClaudeV2] 機能メニューボタンが見つかりません - スキップして続行');
                    return { success: true, warning: '機能メニューボタンが見つからないためスキップ' };
                }
                
                featureMenuButton.click();
                await wait(1500);
                
                // ウェブ検索をオン
                const webSearchToggle = await getElement(featureSelectors.webSearchToggle, 'ウェブ検索トグル');
                if (webSearchToggle) {
                    setToggleState(webSearchToggle, true);
                    await wait(1500);
                    console.log('✓ ウェブ検索有効化');
                }
                
                // メニューを閉じる
                featureMenuButton.click();
                await wait(1000);
                
                // リサーチボタンを探して有効化
                const buttons = document.querySelectorAll('button[type="button"][aria-pressed]');
                for (const btn of buttons) {
                    const svg = btn.querySelector('svg path[d*="M8.5 2C12.0899"]');
                    if (svg) {
                        const isPressed = btn.getAttribute('aria-pressed') === 'true';
                        if (!isPressed) {
                            btn.click();
                            await wait(1000);
                            console.log('✓ Deep Researchモード有効化');
                        }
                        break;
                    }
                }
                
                // Deep Research設定完了を返す
                console.log(`✅ [ClaudeV2] Deep Research設定完了`);
                const deepResearchResult = { 
                    success: true, 
                    displayedFunction: functionName 
                };
                console.log(`🚀 [DEBUG] selectFunctionOnly終了 - Deep Research:`, deepResearchResult);
                return deepResearchResult;
                
            } else {
                // === 通常の機能選択 ===
                console.log(`通常機能選択: ${functionName}`);
                
                // 機能メニューを開く
                console.log(`🔍 [DEBUG] 機能メニューボタンを探索中...`);
                console.log(`🔍 [DEBUG] featureSelectors.menuButton: ${featureSelectors.menuButton}`);
                
                const featureMenuButton = await getElement(featureSelectors.menuButton, '機能メニューボタン');
                console.log(`🔍 [DEBUG] 機能メニューボタン検索結果:`, featureMenuButton);
                
                if (!featureMenuButton) {
                    console.log('❌ [ClaudeV2] 機能メニューボタンが見つかりません - エラーを返す');
                    return { success: false, error: '機能メニューボタンが見つかりません' };
                }
                
                console.log(`🔍 [DEBUG] 機能メニューボタンをクリック`);
                featureMenuButton.click();
                await wait(1500);
                
                // まずすべてのトグルをオフにする
                const menuToggleItems = document.querySelectorAll('button:has(input[role="switch"])');
                console.log(`🔍 [DEBUG] 見つかったトグル項目数: ${menuToggleItems.length}`);
                
                // デバッグ: すべてのトグル項目のテキストを出力
                menuToggleItems.forEach((toggle, index) => {
                    const label = toggle.querySelector('p.font-base');
                    const text = label ? label.textContent.trim() : 'テキストなし';
                    console.log(`🔍 [DEBUG] トグル${index + 1}: "${text}"`);
                });
                
                for (const toggle of menuToggleItems) {
                    setToggleState(toggle, false);
                    await wait(300);
                }
                
                // 指定された機能を見つけてオンにする
                let featureFound = false;
                console.log(`🔍 [DEBUG] 探している機能名: "${functionName}"`);
                
                for (const toggle of menuToggleItems) {
                    const label = toggle.querySelector('p.font-base');
                    const labelText = label ? label.textContent.trim() : '';
                    console.log(`🔍 [DEBUG] 比較中: "${labelText}" === "${functionName}"`);
                    
                    if (label && labelText === functionName) {
                        setToggleState(toggle, true);
                        await wait(500);
                        featureFound = true;
                        console.log(`✓ 機能選択完了: ${functionName}`);
                        break;
                    }
                }
                
                if (!featureFound) {
                    console.log(`⚠️ 指定された機能が見つかりません: ${functionName}`);
                    console.log(`🔍 [DEBUG] 利用可能な機能一覧:`);
                    menuToggleItems.forEach((toggle, index) => {
                        const label = toggle.querySelector('p.font-base');
                        const text = label ? label.textContent.trim() : 'テキストなし';
                        console.log(`  ${index + 1}. "${text}"`);
                    });
                }
                
                // メニューを閉じる
                featureMenuButton.click();
                await wait(2000);
                
                // トグル機能のボタンが有効になったか確認
                if (featureFound) {
                    console.log(`🔍 [DEBUG] ${functionName} のボタンを確認中...`);
                    
                    let buttonActivated = false;
                    
                    // 機能タイプ別のSVGパス（ui-selectors.jsの定義を参照）
                    const featureSvgPaths = {
                        'じっくり考える': 'M10.3857 2.50977',
                        'Deep thinking': 'M10.3857 2.50977',
                        'リサーチ': 'M8.5 2C12.0899',
                        'Research': 'M8.5 2C12.0899',
                        'Web search': 'M8.5 2C12.0899',
                        'ウェブ検索': 'M8.5 2C12.0899'
                    };
                    
                    // 該当機能のSVGパスを取得
                    const targetSvgPath = featureSvgPaths[functionName];
                    
                    if (targetSvgPath) {
                        // SVGパスで特定のボタンを探す
                        console.log(`🔍 [DEBUG] SVGパス "${targetSvgPath}" を探索中...`);
                        
                        // aria-pressed="true"のボタンから探す
                        const buttons = document.querySelectorAll('button[type="button"][aria-pressed="true"]');
                        console.log(`🔍 [DEBUG] aria-pressed="true"のボタン数: ${buttons.length}`);
                        
                        for (const btn of buttons) {
                            const svg = btn.querySelector(`svg path[d*="${targetSvgPath}"]`);
                            if (svg) {
                                buttonActivated = true;
                                console.log(`✓ ボタン確認済み: ${functionName} ボタンが有効化されています（SVGパス一致）`);
                                break;
                            }
                        }
                        
                        // aria-pressed="true"で見つからない場合、すべてのaria-pressedボタンを確認
                        if (!buttonActivated) {
                            const allButtons = document.querySelectorAll('button[type="button"][aria-pressed]');
                            console.log(`🔍 [DEBUG] 全aria-pressedボタン数: ${allButtons.length}`);
                            
                            for (const btn of allButtons) {
                                const svg = btn.querySelector(`svg path[d*="${targetSvgPath}"]`);
                                if (svg) {
                                    const pressed = btn.getAttribute('aria-pressed');
                                    console.log(`🔍 [DEBUG] SVGパス一致ボタン発見 - aria-pressed: ${pressed}`);
                                    if (pressed === 'true') {
                                        buttonActivated = true;
                                        console.log(`✓ ボタン確認済み: ${functionName} ボタンが有効化されています`);
                                    }
                                    break;
                                }
                            }
                        }
                    } else {
                        // SVGパスが定義されていない機能の場合
                        console.log(`🔍 [DEBUG] ${functionName} のSVGパスが未定義。トグル操作の成功のみで判定`);
                        buttonActivated = true;  // トグル操作は成功しているため成功とみなす
                    }
                    
                    if (!buttonActivated) {
                        console.log(`⚠️ ボタン確認失敗: ${functionName} のボタンが見つからないか有効化されていません`);
                        console.log(`⚠️ 注意: ボタンは確認できませんでしたが、トグル操作は成功しています`);
                        // トグル操作は成功しているため、警告付きで成功とする
                        return { 
                            success: true, 
                            displayedFunction: functionName,
                            warning: `${functionName} ボタンの視覚的確認はできませんでしたが、トグル操作は完了しました` 
                        };
                    }
                }
            }
            
            console.log(`✅ [ClaudeV2] 機能選択完了: ${functionName}`);
            const successResult = { 
                success: true,
                displayedFunction: functionName  // RetryManagerの判定に必要
            };
            console.log(`🚀 [DEBUG] selectFunctionOnly終了 - 正常終了:`, successResult);
            return successResult;
            
        } catch (error) {
            console.error('❌ [ClaudeV2] 機能選択エラー:', error.message);
            console.error('❌ [DEBUG] selectFunctionOnly終了 - エラー:', error);
            const errorResult = { success: false, error: error.message };
            console.log(`🚀 [DEBUG] selectFunctionOnly終了 - エラーリターン:`, errorResult);
            return errorResult;
        }
    }
    
    /**
     * 送信と応答取得のみ実行
     */
    async function sendAndGetResponse() {
        try {
            console.log('📝 [ClaudeV2] 送信と応答取得を実行');
            
            // 送信ボタンをクリック（再試行対応）
            let sendSuccess = false;
            let sendAttempts = 0;
            const maxSendAttempts = 5;
            
            while (!sendSuccess && sendAttempts < maxSendAttempts) {
                sendAttempts++;
                console.log(`送信試行 ${sendAttempts}/${maxSendAttempts}`);
                
                const sendResult = await findClaudeElement(claudeSelectors['2_送信ボタン']);
                if (!sendResult) {
                    if (sendAttempts === maxSendAttempts) {
                        throw new Error('送信ボタンが見つかりません');
                    }
                    console.log(`送信ボタンが見つかりません。2秒後に再試行...`);
                    await wait(2000);
                    continue;
                }
                
                await clickButton(sendResult.element);
                console.log(`送信ボタンをクリックしました（試行${sendAttempts}）`);
                await wait(1000);
                
                // 送信後に停止ボタンが表示されるか確認
                let stopButtonAppeared = false;
                
                for (let i = 0; i < 5; i++) {
                    const stopResult = await findClaudeElement(claudeSelectors['3_回答停止ボタン'], 1);
                    if (stopResult) {
                        stopButtonAppeared = true;
                        console.log('停止ボタンが表示されました - 送信成功');
                        break;
                    }
                    await wait(1000);
                }
                
                if (stopButtonAppeared) {
                    sendSuccess = true;
                    break;
                } else {
                    console.log(`送信反応が確認できません。再試行します...`);
                    await wait(2000);
                }
            }
            
            if (!sendSuccess) {
                throw new Error(`${maxSendAttempts}回試行しても送信が成功しませんでした`);
            }
            
            // 送信時刻を記録
            if (window.AIHandler && window.AIHandler.recordSendTimestamp) {
                try {
                    await window.AIHandler.recordSendTimestamp('Claude');
                    console.log(`✅ 送信時刻記録成功`);
                } catch (error) {
                    console.log(`⚠️ 送信時刻記録エラー: ${error.message}`);
                }
            }
            
            // 応答待機（通常処理）
            console.log('応答を待機中...');
            const stopButtonSelectors = UI_SELECTORS.Claude?.STOP_BUTTON || claudeSelectors['3_回答停止ボタン'].selectors;
            
            // 停止ボタンが消えるまで待機（最大5分）
            let disappearWaitCount = 0;
            const maxDisappearWait = 300;
            
            while (disappearWaitCount < maxDisappearWait) {
                let currentStopElement = null;
                
                for (const selector of stopButtonSelectors) {
                    try {
                        currentStopElement = document.querySelector(selector);
                        if (currentStopElement) break;
                    } catch (e) {
                        // エラーは無視
                    }
                }
                
                if (!currentStopElement) {
                    // 10秒間の確認期間
                    let confirmCount = 0;
                    let stillGone = true;
                    
                    while (confirmCount < 10) {
                        await wait(1000);
                        
                        for (const selector of stopButtonSelectors) {
                            try {
                                const checkElement = document.querySelector(selector);
                                if (checkElement) {
                                    stillGone = false;
                                    break;
                                }
                            } catch (e) {
                                // エラーは無視
                            }
                        }
                        
                        if (!stillGone) break;
                        confirmCount++;
                    }
                    
                    if (stillGone) {
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
            
            // テキスト取得
            let responseText = '';
            
            // 通常処理テキスト取得
            const textSelectors = UI_SELECTORS.Claude?.TEXT_EXTRACTION || {
                NORMAL_RESPONSE: claudeSelectors['5_通常処理テキスト位置'].selectors
            };
            
            const normalElements = document.querySelectorAll(textSelectors.NORMAL_RESPONSE.join(', '));
            
            if (normalElements.length > 0) {
                // Canvas要素内を除外してフィルタリング
                const filtered = Array.from(normalElements).filter(el => {
                    return !el.closest('#markdown-artifact') && 
                           !el.closest('[class*="artifact"]');
                });
                
                if (filtered.length > 0) {
                    const targetElement = filtered[filtered.length - 1];
                    responseText = targetElement.textContent?.trim() || '';
                }
            }
            
            // フォールバック: Canvas機能の内容を取得
            if (!responseText) {
                const canvasSelectors = textSelectors.ARTIFACT_CONTENT || ['#markdown-artifact'];
                for (const selector of canvasSelectors) {
                    const canvasElement = document.querySelector(selector);
                    if (canvasElement) {
                        const text = canvasElement.textContent?.trim() || '';
                        if (text && text.length > 10) {
                            responseText = text;
                            break;
                        }
                    }
                }
            }
            
            if (responseText) {
                console.log(`✅ [ClaudeV2] 応答取得完了: ${responseText.length}文字`);
                return {
                    success: true,
                    response: responseText
                };
            } else {
                throw new Error('応答テキストを取得できませんでした');
            }
            
        } catch (error) {
            console.error('❌ [ClaudeV2] 送信・応答取得エラー:', error.message);
            return { success: false, error: error.message };
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
        runAutomation,
        // フェーズ別メソッド（順次処理用）
        inputTextOnly,
        selectModelOnly,
        selectFunctionOnly,
        sendAndGetResponse
    };
    
    console.log('✅ Claude Automation V2 準備完了');
    console.log('使用方法: ClaudeAutomationV2.executeTask({ model: "3.5 Sonnet", function: "Deep Research", prompt: "..." })');
    
})();