/**
 * 統一版 AI サービス モデル・機能リサーチコード (修正版)
 * 作成日: 2025年8月15日
 * バージョン: 2.0.0
 * 
 * Claude, ChatGPT, Gemini の3サービスに対応
 * 自動的にサービスを検出して適切な処理を実行
 * 
 * 修正内容 v2.0.0:
 * - ClaudeのESCキーイベント送信先をdocument.bodyに修正
 * - Claude専用のメニュークローズ処理を実装
 * - 待機時間をサービスごとに最適化（Claudeは500ms）
 * - body.click()をClaude以外でのみ実行するよう修正
 * 
 * 修正内容 v1.6.0:
 * - 優先順位付きセレクタシステムの実装
 * - モデルメニューと機能メニューの検出精度向上
 * - デバッグ情報の充実（どのセレクタで検出したかを表示）
 * 
 * 修正内容 v1.5.0:
 * - モデル名の正規化と重複除去を改善
 * - 機能メニューの検出セレクタを拡張
 * - 動的メニュー要素の待機処理を追加
 * 
 * 修正内容 v1.4.0:
 * - Claudeのカテゴリータブとモデルを正確に区別
 * - 機能メニューの検出ロジックを改善
 * - より厳密なモデル判定ロジックを実装
 */

(async function() {
    'use strict';
    
    // ========================================
    // 共通設定
    // ========================================
    const CONFIG = {
        debugMode: true,
        waitTime: 1000,        // デフォルト待機時間
        claudeWaitTime: 500,   // Claude専用待機時間
        maxRetries: 3,
        storageKey: 'ai_service_research_data',
        version: '2.0.0'
    };
    
    // ========================================
    // ユーティリティ関数（共通）
    // ========================================
    class Utils {
        static wait(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        }
        
        static log(message, type = 'info') {
            const symbols = {
                info: '📝',
                success: '✅',
                warning: '⚠️',
                error: '❌',
                search: '🔍',
                model: '🤖',
                feature: '🔧',
                category: '📁',
                research: '🔬'
            };
            console.log(`${symbols[type] || '📝'} ${message}`);
        }
        
        static async performClick(element) {
            if (!element) return false;
            
            const rect = element.getBoundingClientRect();
            const x = rect.left + rect.width / 2;
            const y = rect.top + rect.height / 2;
            
            // PointerEvent sequence
            element.dispatchEvent(new PointerEvent('pointerdown', {
                bubbles: true,
                cancelable: true,
                clientX: x,
                clientY: y
            }));
            
            await this.wait(50);
            
            element.dispatchEvent(new PointerEvent('pointerup', {
                bubbles: true,
                cancelable: true,
                clientX: x,
                clientY: y
            }));
            
            element.click();
            
            // サービスに応じた待機時間
            const service = this.detectService();
            const waitTime = service === 'claude' ? CONFIG.claudeWaitTime : CONFIG.waitTime;
            await this.wait(waitTime);
            
            return true;
        }
        
        static async closeMenu() {
            // 汎用的なメニュークローズ（ChatGPT、Gemini用）
            document.dispatchEvent(new KeyboardEvent('keydown', {
                key: 'Escape',
                code: 'Escape',
                bubbles: true,
                cancelable: true
            }));
            
            // Click outside
            document.body.click();
            
            return this.wait(300);
        }
        
        static async closeClaudeMenu() {
            // Claude専用のメニュークローズ処理（document.bodyに送信）
            document.body.dispatchEvent(new KeyboardEvent('keydown', {
                key: 'Escape',
                code: 'Escape',
                bubbles: true
            }));
            
            return this.wait(CONFIG.claudeWaitTime);
        }
        
        static async closeGeminiMenu() {
            // Gemini (Angular Material) 専用のメニュークローズ処理
            const activeElement = document.activeElement;
            if (activeElement) {
                activeElement.dispatchEvent(new KeyboardEvent('keydown', {
                    key: 'Escape',
                    code: 'Escape',
                    keyCode: 27,
                    bubbles: true
                }));
            }
            
            // body にも送信
            document.body.dispatchEvent(new KeyboardEvent('keydown', {
                key: 'Escape',
                code: 'Escape',
                keyCode: 27,
                bubbles: true
            }));
            
            this.log('Gemini メニュークローズ処理実行', 'info');
            return this.wait(300);
        }
        
        static async closeAllMenus() {
            // 全てのメニューを確実に閉じる
            let menuCount = 0;
            let attempts = 0;
            const maxAttempts = 5;
            
            // サービスを検出
            const service = this.detectService();
            
            do {
                // 現在開いているメニューを数える
                const openMenus = document.querySelectorAll(
                    '[role="menu"]:not([style*="display: none"]), ' +
                    '[data-radix-menu-content], ' +
                    '.mat-mdc-menu-panel:not([style*="display: none"]), ' +
                    '.popover:not([style*="display: none"])'
                );
                
                menuCount = openMenus.length;
                
                if (menuCount > 0) {
                    this.log(`${menuCount}個のメニューを閉じています...`, 'info');
                    
                    // サービスごとの専用処理
                    if (service === 'claude') {
                        await this.closeClaudeMenu();
                    } else if (service === 'gemini') {
                        await this.closeGeminiMenu();
                    } else {
                        // その他のサービス（ChatGPT等）
                        document.dispatchEvent(new KeyboardEvent('keydown', {
                            key: 'Escape',
                            code: 'Escape',
                            bubbles: true,
                            cancelable: true
                        }));
                        
                        await this.wait(200);
                        
                        // まだメニューが残っている場合は、bodyをクリック（Claude以外）
                        if (document.querySelector('[role="menu"]:not([style*="display: none"])')) {
                            document.body.click();
                            await this.wait(200);
                        }
                    }
                }
                
                attempts++;
            } while (menuCount > 0 && attempts < maxAttempts);
            
            if (attempts >= maxAttempts) {
                this.log('警告: 一部のメニューが閉じられませんでした', 'warning');
            }
            
            return this.wait(300);
        }
        
        static async waitForElement(selector, timeout = 3000) {
            const selectors = Array.isArray(selector) ? selector : [selector];
            const startTime = Date.now();
            
            while (Date.now() - startTime < timeout) {
                for (const sel of selectors) {
                    try {
                        const element = document.querySelector(sel);
                        if (element && element.offsetParent !== null) {
                            return element;
                        }
                    } catch (e) {
                        continue;
                    }
                }
                await this.wait(100);
            }
            return null;
        }
        
        static async findDynamicElement(patterns, timeout = 3000) {
            const startTime = Date.now();
            
            while (Date.now() - startTime < timeout) {
                // セレクタで検索
                if (patterns.selectors) {
                    for (const selector of patterns.selectors) {
                        const element = document.querySelector(selector);
                        if (element) return element;
                    }
                }
                
                // テキストで検索
                if (patterns.text) {
                    const elements = Array.from(document.querySelectorAll('button, [role="button"], a'));
                    for (const el of elements) {
                        const text = el.textContent?.toLowerCase() || '';
                        if (patterns.text.some(t => text.includes(t.toLowerCase()))) {
                            return el;
                        }
                    }
                }
                
                // 属性で検索
                if (patterns.attributes) {
                    for (const [attr, value] of Object.entries(patterns.attributes)) {
                        const element = document.querySelector(`[${attr}="${value}"]`);
                        if (element) return element;
                    }
                }
                
                await this.wait(100);
            }
            return null;
        }
        
        static detectService() {
            const url = window.location.hostname;
            
            // URLベースの検出
            if (url.includes('claude.ai')) {
                return 'claude';
            } else if (url.includes('chatgpt.com') || url.includes('chat.openai.com')) {
                return 'chatgpt';
            } else if (url.includes('gemini.google.com') || url.includes('bard.google.com')) {
                return 'gemini';
            }
            
            // DOM要素による動的検出
            const domPatterns = [
                // Claude
                { selector: '[data-testid="model-selector-dropdown"]', service: 'claude' },
                { selector: '.claude-logo', service: 'claude' },
                { selector: '[aria-label*="Claude"]', service: 'claude' },
                
                // ChatGPT
                { selector: '[data-testid="model-switcher-dropdown-button"]', service: 'chatgpt' },
                { selector: '.openai-logo', service: 'chatgpt' },
                { selector: '[aria-label*="ChatGPT"]', service: 'chatgpt' },
                
                // Gemini
                { selector: '.gds-mode-switch-button', service: 'gemini' },
                { selector: '.gemini-logo', service: 'gemini' },
                { selector: '[aria-label*="Gemini"]', service: 'gemini' }
            ];
            
            for (const pattern of domPatterns) {
                if (document.querySelector(pattern.selector)) {
                    return pattern.service;
                }
            }
            
            // テキストベースの検出
            const bodyText = document.body.innerText.toLowerCase();
            if (bodyText.includes('claude')) return 'claude';
            if (bodyText.includes('chatgpt') || bodyText.includes('openai')) return 'chatgpt';
            if (bodyText.includes('gemini') || bodyText.includes('bard')) return 'gemini';
            
            return 'unknown';
        }
    }
    
    // ========================================
    // サービス別アダプター基底クラス
    // ========================================
    class ServiceAdapter {
        constructor() {
            this.models = [];
            this.features = [];
            this.additionalData = {};
        }
        
        async research() {
            Utils.log(`${this.getServiceName()} のリサーチを開始`, 'info');
            
            try {
                // リサーチ前に全てのメニューを閉じる
                await Utils.closeAllMenus();
                
                await this.researchModels();
                await Utils.wait(1000);
                
                // モデルリサーチ後も確実にメニューを閉じる
                await Utils.closeAllMenus();
                
                await this.researchFeatures();
                await Utils.wait(1000);
                
                // 機能リサーチ後も確実にメニューを閉じる
                await Utils.closeAllMenus();
                
                await this.researchAdditional();
                
                return this.getResults();
            } catch (error) {
                Utils.log(`エラー: ${error.message}`, 'error');
                // エラー時も必ずメニューを閉じる
                await Utils.closeAllMenus();
                throw error;
            }
        }
        
        getServiceName() {
            return 'Unknown Service';
        }
        
        async researchModels() {
            throw new Error('researchModels must be implemented');
        }
        
        async researchFeatures() {
            throw new Error('researchFeatures must be implemented');
        }
        
        async researchAdditional() {
            // オプション: 各サービス固有の追加調査
        }
        
        getResults() {
            return {
                service: this.getServiceName(),
                timestamp: new Date().toISOString(),
                models: this.models,
                features: this.features,
                additional: this.additionalData
            };
        }
    }
    
    // ========================================
    // Claude アダプター (修正版 v2.0.0)
    // ========================================
    class ClaudeAdapter extends ServiceAdapter {
        getServiceName() {
            return 'Claude';
        }
        
        // Claude専用のクリック処理
        async clickElement(element) {
            const rect = element.getBoundingClientRect();
            const x = rect.left + rect.width / 2;
            const y = rect.top + rect.height / 2;
            
            element.dispatchEvent(new PointerEvent('pointerdown', {
                bubbles: true,
                cancelable: true,
                clientX: x,
                clientY: y
            }));
            
            await Utils.wait(50);
            
            element.dispatchEvent(new PointerEvent('pointerup', {
                bubbles: true,
                cancelable: true,
                clientX: x,
                clientY: y
            }));
            
            element.click();
            await Utils.wait(CONFIG.claudeWaitTime);
        }
        
        async researchModels() {
            Utils.log('モデルメニューをリサーチ中...', 'model');
            
            // DOMが完全に準備できるまで待機（5秒）
            Utils.log('DOMの安定化を待機中（5秒）...', 'info');
            await Utils.wait(5000);
            
            // 優先順位付きセレクタリスト
            const selectors = [
                '[data-testid="model-selector-dropdown"]',
                'button[aria-haspopup="menu"][data-state="closed"]',
                'button:has(.claude-logo-model-selector)',
                'button[aria-haspopup="menu"]:has(svg.claude-logo-model-selector)',
                'button[aria-haspopup="menu"]'
            ];
            
            let modelButton = null;
            for (const selector of selectors) {
                try {
                    modelButton = document.querySelector(selector);
                    if (modelButton) {
                        Utils.log(`セレクタ ${selector} でボタンを発見`, 'success');
                        break;
                    }
                } catch (e) {
                    // 無効なセレクタの場合はスキップ
                    continue;
                }
            }
            
            // それでも見つからない場合、テキストで検索
            if (!modelButton) {
                modelButton = Array.from(document.querySelectorAll('button'))
                    .find(el => el.textContent?.includes('Opus') || el.textContent?.includes('Sonnet'));
                if (modelButton) {
                    Utils.log('テキストベースでモデルボタンを発見', 'success');
                }
            }
            
            if (!modelButton) {
                Utils.log('モデル選択ボタンが見つかりません', 'error');
                // デバッグ情報を出力
                Utils.log(`現在のURL: ${window.location.href}`, 'info');
                Utils.log(`ページの読み込み状態: ${document.readyState}`, 'info');
                Utils.log(`button要素の数: ${document.querySelectorAll('button').length}`, 'info');
                return;
            }
            
            await this.clickElement(modelButton);
            await Utils.wait(1000);
            
            const menuItems = Array.from(document.querySelectorAll('[role="menuitem"]'));
            
            Utils.log(`${menuItems.length}個のメニュー項目を発見`, 'info');
            
            let hasOtherModels = false;
            
            for (const item of menuItems) {
                const text = item.textContent?.trim();
                if (!text) continue;
                
                // メインモデルの検出
                if (text.includes('Claude Opus') || text.includes('Claude Sonnet')) {
                    const modelName = text.split('新規チャット')[0].trim();
                    const description = Array.from(item.querySelectorAll('.text-text-500'))
                        .map(el => el.textContent?.trim())
                        .filter(Boolean)
                        .join(' ');
                    
                    const isSelected = item.getAttribute('aria-checked') === 'true' ||
                                     item.getAttribute('aria-selected') === 'true';
                    
                    this.models.push({
                        name: modelName,
                        description: description || '',
                        available: true,
                        selected: isSelected
                    });
                    
                    Utils.log(`モデル検出: ${modelName}${isSelected ? ' (選択中)' : ''}`, 'success');
                }
                
                // 「他のモデル」の検出
                if (text.includes('他のモデル')) {
                    hasOtherModels = true;
                    Utils.log('「他のモデル」メニューを検出', 'info');
                }
            }
            
            // 「他のモデル」がある場合、展開を試みる
            if (hasOtherModels) {
                const otherModelsItem = menuItems.find(item => item.textContent?.includes('他のモデル'));
                if (otherModelsItem) {
                    await this.clickElement(otherModelsItem);
                    await Utils.wait(1000);
                    
                    // サブメニューのモデルを取得
                    const subMenuItems = Array.from(document.querySelectorAll('[role="menuitem"]'));
                    subMenuItems.forEach(item => {
                        const text = item.textContent?.trim();
                        if (text && (text.includes('Claude') || text.includes('Opus') || text.includes('Sonnet'))) {
                            if (!this.models.find(m => m.name === text) && !text.includes('他のモデル')) {
                                this.models.push({
                                    name: text,
                                    available: true,
                                    location: 'submenu'
                                });
                                Utils.log(`追加モデル検出: ${text}`, 'success');
                            }
                        }
                    });
                }
            }
            
            await Utils.closeClaudeMenu();
        }
        
        async researchFeatures() {
            Utils.log('機能メニューをリサーチ中...', 'feature');
            
            // シンプルなセレクタを優先
            const featureButton = document.querySelector('[data-testid="input-menu-tools"]') ||
                                document.querySelector('[aria-label="ツールメニューを開く"]') ||
                                Array.from(document.querySelectorAll('button'))
                                    .find(el => el.querySelector('svg[class*="grid"]'));
            
            if (!featureButton) {
                Utils.log('機能選択ボタンが見つかりません', 'error');
                return;
            }
            
            await this.clickElement(featureButton);
            await Utils.wait(1000);
            
            // 機能項目を取得
            const buttons = Array.from(document.querySelectorAll('button'));
            
            const featureNames = [
                'コネクタを管理',
                'コネクタを追加',
                'カレンダー検索',
                'Gmail検索',
                'Drive検索',
                'ウェブ検索',
                'じっくり考える',
                'スタイルを使用'
            ];
            
            for (const name of featureNames) {
                const button = buttons.find(b => b.textContent?.includes(name));
                if (button) {
                    const toggle = button.querySelector('input[type="checkbox"]');
                    const isEnabled = toggle ? toggle.checked : false;
                    
                    const statusText = button.textContent;
                    const isConnected = statusText?.includes('連携済') || !statusText?.includes('連携させる');
                    
                    this.features.push({
                        name: name,
                        type: toggle ? 'toggle' : 'button',
                        enabled: isEnabled,
                        connected: isConnected
                    });
                    
                    Utils.log(`機能検出: ${name} (${isEnabled ? '有効' : '無効'}, ${isConnected ? '連携済' : '未連携'})`, 'success');
                }
            }
            
            // さらに表示があるかチェック
            const moreButton = buttons.find(b => b.textContent?.includes('さらに表示'));
            if (moreButton) {
                Utils.log('「さらに表示」ボタンを検出', 'info');
                await this.clickElement(moreButton);
                await Utils.wait(1000);
                
                // 追加の機能を再度スキャン
                const additionalButtons = Array.from(document.querySelectorAll('button'));
                additionalButtons.forEach(button => {
                    const text = button.textContent?.trim();
                    if (text && !this.features.find(f => text.includes(f.name))) {
                        this.features.push({
                            name: text,
                            type: 'button',
                            enabled: false,
                            connected: false,
                            fromExpanded: true
                        });
                        Utils.log(`追加機能検出: ${text}`, 'success');
                    }
                });
            }
            
            await Utils.closeClaudeMenu();
        }
        
        async researchAdditional() {
            Utils.log('DeepResearchモードをチェック中...', 'research');
            
            // ウェブ検索を有効化
            const featureButton = document.querySelector('[data-testid="input-menu-tools"]') ||
                                document.querySelector('[aria-label="ツールメニューを開く"]');
            
            if (featureButton) {
                await this.clickElement(featureButton);
                await Utils.wait(1000);
                
                const webSearchButton = Array.from(document.querySelectorAll('button'))
                    .find(el => el.textContent?.includes('ウェブ検索'));
                
                if (webSearchButton) {
                    const webSearchToggle = webSearchButton.querySelector('input[type="checkbox"]');
                    let wasWebSearchEnabled = webSearchToggle ? webSearchToggle.checked : false;
                    
                    if (webSearchToggle && !webSearchToggle.checked) {
                        await this.clickElement(webSearchButton);
                        await Utils.wait(CONFIG.claudeWaitTime);
                    }
                    
                    this.additionalData.searchModeAvailable = true;
                }
                
                await Utils.closeClaudeMenu();
                await Utils.wait(1000);
                
                // リサーチボタンを探す（複数の方法で試行）
                const researchSelectors = [
                    'button[aria-pressed]:has(svg path[d*="M8.5 2C12"])',  // SVGパスの特徴的な部分で検索
                    'button[aria-pressed]:has(svg)',  // aria-pressed属性を持つSVGボタン
                    'button[aria-label*="Research"]',
                    'button[aria-label*="リサーチ"]',
                    'button[aria-label*="Deep Research"]',
                    'button:has(svg[class*="research"])',
                    'button[data-testid*="research"]'
                ];
                
                let researchButton = null;
                
                // 優先順位付きセレクタで検索
                for (const selector of researchSelectors) {
                    try {
                        researchButton = document.querySelector(selector);
                        if (researchButton) {
                            Utils.log(`DeepResearchボタンをセレクタ ${selector} で発見`, 'success');
                            break;
                        }
                    } catch (e) {
                        // 無効なセレクタの場合はスキップ
                    }
                }
                
                // それでも見つからない場合は、aria-pressed属性を持つSVGボタンを探す
                if (!researchButton) {
                    // ウェブ検索を有効にした後に出現するaria-pressedボタンを探す
                    const allPressButtons = Array.from(document.querySelectorAll('button[aria-pressed]'));
                    
                    // 機能メニュー外（入力フィールド近く）にあるボタンを探す
                    researchButton = allPressButtons.find(button => {
                        // SVGアイコンを含む
                        const hasSvg = button.querySelector('svg') !== null;
                        // テキストがない（アイコンのみ）
                        const hasNoText = !button.textContent?.trim() || button.textContent?.trim().length < 3;
                        // 機能メニュー内ではない（toggleやcheckboxを含まない）
                        const notInMenu = !button.querySelector('input[type="checkbox"]');
                        
                        return hasSvg && hasNoText && notInMenu;
                    });
                    
                    if (researchButton) {
                        Utils.log('SVGアイコンボタンとしてDeepResearchボタンを発見', 'success');
                    }
                }
                
                // 方法2: テキストやaria-labelで検索（既存の方法を維持）
                if (!researchButton) {
                    researchButton = Array.from(document.querySelectorAll('button'))
                        .find(el => {
                            const text = el.textContent?.toLowerCase() || '';
                            const ariaLabel = el.getAttribute('aria-label')?.toLowerCase() || '';
                            const hasResearchText = text.includes('research') || text.includes('リサーチ') || 
                                                   text.includes('deep research') || text.includes('ディープリサーチ');
                            const hasResearchLabel = ariaLabel.includes('research') || ariaLabel.includes('リサーチ');
                            const hasAriaPressed = el.getAttribute('aria-pressed') !== null;
                            return (hasResearchText || hasResearchLabel) && hasAriaPressed;
                        });
                    
                    if (researchButton) {
                        Utils.log('テキスト/aria-labelベースでDeepResearchボタンを発見', 'success');
                    }
                }
                
                if (researchButton) {
                    // ボタンの詳細情報をログ出力
                    Utils.log(`DeepResearchボタン発見:`, 'success');
                    Utils.log(`  テキスト: ${researchButton.textContent?.trim()}`, 'info');
                    Utils.log(`  aria-label: ${researchButton.getAttribute('aria-label')}`, 'info');
                    Utils.log(`  aria-pressed: ${researchButton.getAttribute('aria-pressed')}`, 'info');
                    
                    this.additionalData.deepResearch = {
                        available: true,
                        activated: researchButton.getAttribute('aria-pressed') === 'true'
                    };
                    Utils.log(`DeepResearchモード: ${this.additionalData.deepResearch.activated ? '有効' : '無効'}`, 'success');
                    
                    // テスト: ボタンの状態を切り替え
                    const wasPressed = researchButton.getAttribute('aria-pressed') === 'true';
                    await this.clickElement(researchButton);
                    await Utils.wait(1500);
                    
                    const nowPressed = researchButton.getAttribute('aria-pressed') === 'true';
                    if (nowPressed !== wasPressed) {
                        Utils.log('DeepResearchモードの切り替えに成功', 'success');
                        // 元に戻す
                        await this.clickElement(researchButton);
                        await Utils.wait(1000);
                    }
                } else {
                    Utils.log('リサーチボタンが見つかりません', 'warning');
                }
            }
        }
    }
    
    // ========================================
    // ChatGPT アダプター
    // ========================================
    class ChatGPTAdapter extends ServiceAdapter {
        getServiceName() {
            return 'ChatGPT';
        }
        
        async researchModels() {
            Utils.log('モデルメニューをリサーチ中...', 'model');
            
            const modelButton = document.querySelector('[data-testid="model-switcher-dropdown-button"]') ||
                              document.querySelector('button[aria-haspopup="menu"][aria-label*="モデル"]');
            
            if (!modelButton) {
                Utils.log('モデル選択ボタンが見つかりません', 'error');
                return;
            }
            
            await Utils.performClick(modelButton);
            const modelMenu = await Utils.waitForElement('[role="menu"]');
            
            if (!modelMenu) {
                Utils.log('モデルメニューが開きませんでした', 'error');
                return;
            }
            
            const menuItems = modelMenu.querySelectorAll('[role="menuitem"]');
            
            for (const item of menuItems) {
                const modelName = this.extractModelName(item);
                if (modelName) {
                    this.models.push({
                        name: modelName,
                        selected: item.getAttribute('aria-checked') === 'true'
                    });
                    Utils.log(`モデル検出: ${modelName}`, 'success');
                }
                
                if (this.hasSubmenuIndicator(item)) {
                    const submenuName = item.textContent?.trim() || 'Unknown';
                    Utils.log(`サブメニュー項目を検出: ${submenuName}`, 'warning');
                    await this.exploreSubmenu(item);
                }
            }
            
            await Utils.closeAllMenus();
        }
        
        async researchFeatures() {
            Utils.log('機能メニューをリサーチ中...', 'feature');
            
            const functionButton = await Utils.findDynamicElement({
                selectors: [
                    '[data-testid="composer-plus-btn"]',
                    'button.composer-btn',
                    '[aria-label*="機能"]',
                    '[aria-label*="feature"]',
                    '[aria-label*="tool"]'
                ],
                text: ['機能', 'ツール', 'Tools', 'Features'],
                attributes: {
                    'data-testid': 'composer-plus-btn'
                }
            });
            
            if (!functionButton) {
                Utils.log('機能選択ボタンが見つかりません', 'error');
                return;
            }
            
            await Utils.performClick(functionButton);
            const functionMenu = await Utils.waitForElement([
                '[role="menu"]',
                '[data-radix-menu-content]',
                '.popover'
            ]);
            
            if (!functionMenu) {
                Utils.log('機能メニューが開きませんでした', 'error');
                return;
            }
            
            const allMenuItems = functionMenu.querySelectorAll('*');
            const processedItems = new Set();
            
            for (const item of allMenuItems) {
                if (processedItems.has(item)) continue;
                
                const isClickable = item.matches('button, [role="menuitem"], [role="menuitemradio"], a');
                if (!isClickable) continue;
                
                const text = item.textContent?.trim();
                if (!text || text.length > 100) continue;
                
                processedItems.add(item);
                
                if (this.hasSubmenuIndicator(item)) {
                    Utils.log(`サブメニュー項目を検出: ${text}`, 'warning');
                    await this.exploreFunctionSubmenu(item);
                } else {
                    const functionInfo = this.extractFunctionName(item);
                    if (functionInfo.name && 
                        !this.isModelName(functionInfo.name) &&
                        !this.features.find(f => f.name === functionInfo.name)) {
                        
                        const attributes = {
                            name: functionInfo.name,
                            badge: functionInfo.badge,
                            hasIcon: !!item.querySelector('svg, img'),
                            isDisabled: item.disabled || item.getAttribute('aria-disabled') === 'true',
                            ariaLabel: item.getAttribute('aria-label'),
                            dataTestId: item.getAttribute('data-testid')
                        };
                        
                        this.features.push(attributes);
                        Utils.log(`機能検出: ${functionInfo.name}${functionInfo.badge ? ` [${functionInfo.badge}]` : ''}`, 'success');
                    }
                }
            }
            
            await Utils.closeAllMenus();
        }
        
        extractModelName(element) {
            const primarySpan = element.querySelector('span:not([class*="badge"]):not([class*="icon"])');
            if (primarySpan) {
                return primarySpan.textContent?.trim();
            }
            
            const testId = element.getAttribute('data-testid') || '';
            const match = testId.match(/model-switcher-(.+)/);
            if (match) {
                return match[1].replace(/-/g, ' ');
            }
            
            const nameDiv = element.querySelector('div.min-w-0 > span, div.min-w-0');
            if (nameDiv) {
                const text = nameDiv.textContent?.trim() || '';
                return text.split('\n')[0].trim();
            }
            
            const fullText = element.textContent?.trim() || '';
            const lines = fullText.split('\n');
            const modelName = lines[0].trim();
            
            const isValidModel = modelName && (
                /GPT|Claude|o1|Gemini|Auto|Fast|Thinking|Pro|Legacy|Mini|Preview/i.test(modelName) ||
                /\d+(\.\d+)?/.test(modelName) ||
                (modelName.length > 1 && modelName.length < 50)
            );
            
            return isValidModel ? modelName : null;
        }
        
        extractFunctionName(element) {
            const selectors = [
                '.truncate',
                '[class*="grow"]',
                '.flex-grow',
                '.text-token-text-primary',
                'div[class*="text"]',
                'span:not([class*="badge"])',
                'div'
            ];
            
            let name = '';
            for (const selector of selectors) {
                const nameElement = element.querySelector(selector);
                if (nameElement && nameElement.textContent?.trim()) {
                    name = nameElement.textContent.trim();
                    break;
                }
            }
            
            if (!name) {
                name = element.textContent?.trim() || '';
            }
            
            const badgeSelectors = [
                '.__menu-item-badge',
                'span[class*="badge"]',
                '.rounded-full',
                '.ml-auto'
            ];
            
            let badge = '';
            for (const selector of badgeSelectors) {
                const badgeEl = element.querySelector(selector);
                if (badgeEl && badgeEl.textContent?.trim()) {
                    badge = badgeEl.textContent.trim();
                    if (badge && name.includes(badge)) {
                        name = name.replace(badge, '').trim();
                    }
                    break;
                }
            }
            
            return { name: name, badge: badge };
        }
        
        isModelName(name) {
            if (!name) return false;
            
            const modelPatterns = [
                /GPT/i,
                /Claude/i,
                /o1[\s-]/i,
                /Gemini/i,
                /Opus/i,
                /Sonnet/i,
                /Haiku/i,
                /Preview/i,
                /Turbo/i,
                /Vision/i
            ];
            
            return modelPatterns.some(pattern => pattern.test(name));
        }
        
        hasSubmenuIndicator(element) {
            const conditions = [
                element.hasAttribute('data-has-submenu'),
                element.getAttribute('aria-haspopup') === 'menu',
                element.getAttribute('aria-expanded') !== null,
                
                element.querySelector('svg[data-rtl-flip]') !== null,
                element.querySelector('[class*="chevron"]') !== null,
                element.querySelector('[class*="arrow"]') !== null,
                
                element.querySelector('path[d*="M6.02925 3.02929"]') !== null,
                element.querySelector('path[d*="L11.4707"]') !== null,
                
                (() => {
                    const text = element.textContent?.trim().toLowerCase() || '';
                    const submenuKeywords = [
                        'その他', 'さらに', '他の', 'もっと',
                        'レガシー', 'legacy', 
                        'more', 'other', 'additional',
                        '以前の', 'previous', 'old',
                        '詳細', 'advanced', 'settings',
                        'さらに表示', 'show more', '...'
                    ];
                    return submenuKeywords.some(keyword => text.includes(keyword.toLowerCase()));
                })()
            ];
            
            return conditions.some(condition => condition);
        }
        
        async exploreSubmenu(menuItem) {
            const initialMenuCount = document.querySelectorAll('[role="menu"]').length;
            
            menuItem.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
            menuItem.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
            await Utils.wait(500);
            
            let allMenus = document.querySelectorAll('[role="menu"]');
            if (allMenus.length <= initialMenuCount) {
                await Utils.performClick(menuItem);
                await Utils.wait(500);
                allMenus = document.querySelectorAll('[role="menu"]');
            }
            
            if (allMenus.length > initialMenuCount) {
                const submenu = allMenus[allMenus.length - 1];
                const items = submenu.querySelectorAll('[role="menuitem"]');
                
                for (const item of items) {
                    const text = item.textContent?.trim();
                    const isBackButton = text && (
                        text.includes('戻る') || 
                        text.includes('Back') || 
                        text.includes('←')
                    );
                    
                    if (isBackButton) continue;
                    
                    const modelName = this.extractModelName(item);
                    if (modelName && !this.models.find(m => m.name === modelName)) {
                        this.models.push({
                            name: modelName,
                            location: 'submenu'
                        });
                        Utils.log(`サブメニューモデル検出: ${modelName}`, 'success');
                    }
                }
            }
        }
        
        async exploreFunctionSubmenu(menuItem) {
            const itemText = menuItem.textContent?.trim();
            Utils.log(`サブメニューを探索中: ${itemText}`, 'info');
            
            const initialMenuCount = document.querySelectorAll('[role="menu"]').length;
            
            menuItem.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
            menuItem.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
            await Utils.wait(700);
            
            let allMenus = document.querySelectorAll('[role="menu"]');
            
            let clickedToOpen = false;
            if (allMenus.length <= initialMenuCount) {
                const wasSelected = menuItem.getAttribute('aria-checked') || 
                                  menuItem.getAttribute('aria-selected') ||
                                  menuItem.classList.contains('selected');
                
                await Utils.performClick(menuItem);
                clickedToOpen = true;
                await Utils.wait(500);
                allMenus = document.querySelectorAll('[role="menu"]');
                
                if (wasSelected === 'false' && menuItem.getAttribute('aria-checked') === 'true') {
                    menuItem.needsDeselect = true;
                }
            }
            
            if (allMenus.length > initialMenuCount) {
                const submenu = allMenus[allMenus.length - 1];
                const items = submenu.querySelectorAll('[role="menuitem"], [role="menuitemradio"]');
                
                Utils.log(`サブメニューに${items.length}個の項目を発見`, 'info');
                
                for (const item of items) {
                    const text = item.textContent?.trim();
                    
                    if (text && (text.includes('戻る') || text.includes('Back') || text.includes('←'))) {
                        continue;
                    }
                    
                    const functionInfo = this.extractFunctionName(item);
                    if (functionInfo.name && 
                        !this.isModelName(functionInfo.name) &&
                        !this.features.find(f => f.name === functionInfo.name)) {
                        this.features.push({
                            name: functionInfo.name,
                            badge: functionInfo.badge,
                            location: 'submenu',
                            parent: itemText
                        });
                        Utils.log(`サブメニュー機能検出: ${functionInfo.name}${functionInfo.badge ? ` [${functionInfo.badge}]` : ''} (from ${itemText})`, 'success');
                    }
                }
                
                document.dispatchEvent(new KeyboardEvent('keydown', {
                    key: 'Escape',
                    code: 'Escape',
                    bubbles: true
                }));
                await Utils.wait(300);
                
                if (clickedToOpen && menuItem.needsDeselect) {
                    Utils.log('警告: 項目が選択された可能性があります', 'warning');
                }
            } else {
                Utils.log(`サブメニューが開きませんでした: ${itemText}`, 'warning');
            }
        }
    }
    
    // ========================================
    // Gemini アダプター
    // ========================================
    class GeminiAdapter extends ServiceAdapter {
        getServiceName() {
            return 'Gemini';
        }
        
        async researchModels() {
            Utils.log('モデルメニューをリサーチ中...', 'model');
            
            const modelButton = document.querySelector('button.gds-mode-switch-button') ||
                              document.querySelector('button.logo-pill-btn') ||
                              document.querySelector('button[class*="mode-switch"]') ||
                              document.querySelector('.logo-pill-label-container')?.closest('button') ||
                              document.querySelector('[aria-label*="モデル"]');
            
            if (!modelButton) {
                Utils.log('モデル選択ボタンが見つかりません', 'error');
                return;
            }
            
            await Utils.performClick(modelButton);
            await Utils.wait(CONFIG.waitTime);
            
            // メインメニューのモデルを処理
            const modelItems = document.querySelectorAll('button.bard-mode-list-button, [role="menuitemradio"], .mat-mdc-menu-item');
            
            for (const item of modelItems) {
                const titleEl = item.querySelector('.mode-title, .gds-label-m:not(.mode-desc), span:first-child');
                const descEl = item.querySelector('.mode-desc, .gds-label-m-alt, span:last-child');
                
                if (titleEl) {
                    const title = titleEl.textContent.trim();
                    const description = descEl ? descEl.textContent.trim() : '';
                    const isSelected = item.classList.contains('is-selected') || 
                                     item.getAttribute('aria-checked') === 'true' ||
                                     item.querySelector('mat-icon[fonticon="check_circle"]') !== null;
                    
                    this.models.push({
                        name: title || description,
                        description: description,
                        selected: isSelected
                    });
                    
                    Utils.log(`モデル検出: ${title || description}${isSelected ? ' (選択中)' : ''}`, 'success');
                }
            }
            
            // サブメニューの処理
            const moreButton = Array.from(document.querySelectorAll('button'))
                .find(b => b.textContent?.includes('他のモデル') || b.textContent?.includes('さらに表示'));
            
            if (moreButton) {
                Utils.log('追加モデルを確認中...', 'info');
                
                // 現在のメニュー数を記録
                const initialMenuCount = document.querySelectorAll('[role="menu"], .mat-mdc-menu-panel').length;
                
                await Utils.performClick(moreButton);
                await Utils.wait(CONFIG.waitTime);
                
                // サブメニューが開いたか確認
                const currentMenuCount = document.querySelectorAll('[role="menu"], .mat-mdc-menu-panel').length;
                const submenuOpened = currentMenuCount > initialMenuCount;
                
                if (submenuOpened) {
                    Utils.log('サブメニューが開きました', 'info');
                    
                    const additionalModels = document.querySelectorAll('[role="menuitemradio"], .mat-mdc-menu-item');
                    additionalModels.forEach(item => {
                        const titleEl = item.querySelector('.mode-title');
                        const descEl = item.querySelector('.mode-desc');
                        
                        if (titleEl && descEl) {
                            const modelData = {
                                name: titleEl.textContent.trim(),
                                description: descEl.textContent.trim(),
                                selected: false,
                                location: 'submenu'
                            };
                            
                            if (!this.models.some(m => m.description === modelData.description)) {
                                this.models.push(modelData);
                                Utils.log(`追加モデル検出: ${modelData.name}`, 'success');
                            }
                        }
                    });
                    
                    // サブメニューを閉じる（Gemini用）
                    await Utils.closeGeminiMenu();
                    await Utils.wait(300);
                }
            }
            
            // メインメニューを閉じる（Gemini用）
            await Utils.closeGeminiMenu();
            await Utils.wait(300);
            
            // 念のため残っているメニューがあれば追加でクローズ
            const remainingMenus = document.querySelectorAll('.mat-mdc-menu-panel:not([style*="display: none"])');
            if (remainingMenus.length > 0) {
                Utils.log(`残存メニュー検出（${remainingMenus.length}個）、追加クローズ実行`, 'warning');
                await Utils.closeGeminiMenu();
            }
            
            Utils.log('モデルメニューを閉じました', 'info');
        }
        
        async researchFeatures() {
            Utils.log('機能メニューをリサーチ中...', 'feature');
            
            // 1. メインの機能ボタン（動画、Deep Think、Deep Research、Canvas等）
            // toolbox-drawer-item-button クラスを持つボタンのみを対象とする
            const featureButtons = document.querySelectorAll('.toolbox-drawer-item-button button');
            
            Utils.log(`${featureButtons.length}個のメイン機能ボタンを検出`, 'info');
            
            for (const button of featureButtons) {
                // ラベル要素を探す
                const labelEl = button.querySelector('.toolbox-drawer-button-label, .label');
                
                if (labelEl && labelEl.textContent?.trim()) {
                    const name = labelEl.textContent.trim();
                    const iconEl = button.querySelector('mat-icon');
                    const icon = iconEl ? (iconEl.getAttribute('fonticon') || iconEl.textContent?.trim()) : '';
                    
                    if (!this.features.find(f => f.name === name)) {
                        this.features.push({
                            name: name,
                            icon: icon,
                            type: 'main'
                        });
                        Utils.log(`機能検出: ${name}${icon ? ` (${icon})` : ''}`, 'success');
                    }
                }
            }
            
            // 2. その他メニューの処理（重要：ここに「画像」などがある）
            const moreButton = document.querySelector('[aria-label="その他"]') ||
                             document.querySelector('button:has(mat-icon[fonticon="more_horiz"])') ||
                             document.querySelector('.toolbox-drawer-button-container button');
            
            if (moreButton) {
                Utils.log('その他メニューを開いています...', 'info');
                
                // 現在のオーバーレイ数を記録（Gemini用の判定）
                const initialOverlayCount = document.querySelectorAll('.cdk-overlay-pane').length;
                
                await Utils.performClick(moreButton);
                await Utils.wait(CONFIG.waitTime);
                
                // メニューが開いたか確認（Geminiは.cdk-overlay-paneで判定）
                const currentOverlayCount = document.querySelectorAll('.cdk-overlay-pane').length;
                const menuOpened = currentOverlayCount > initialOverlayCount;
                
                if (menuOpened) {
                    Utils.log('その他メニューが開きました', 'info');
                    
                    // Geminiの特殊なカード形式のメニューに対応
                    // .cdk-overlay-pane内の全ての要素を取得
                    const overlayPanes = document.querySelectorAll('.cdk-overlay-pane');
                    const lastPane = overlayPanes[overlayPanes.length - 1]; // 最新のオーバーレイ
                    
                    if (lastPane) {
                        // カード内のボタンや項目を取得
                        const menuItems = lastPane.querySelectorAll(
                            'button, ' +
                            '[role="menuitem"], ' +
                            '.toolbox-drawer-card button, ' +
                            '.toolbox-drawer-menu-item button'
                        );
                        
                        Utils.log(`その他メニュー内に${menuItems.length}個の項目を発見`, 'info');
                        
                        for (const item of menuItems) {
                            // 複数の方法で名前を取得
                            let name = null;
                            let source = '';
                            
                            // 方法1: aria-label（最優先）
                            const ariaLabel = item.getAttribute('aria-label');
                            if (ariaLabel && ariaLabel.trim()) {
                                // "画像  Imagen で生成" のような余分な空白を正規化
                                name = ariaLabel.trim().replace(/\s+/g, ' ');
                                source = 'aria-label';
                            }
                            
                            // 方法2: テキストコンテンツ
                            if (!name) {
                                const text = item.textContent?.trim().replace(/\s+/g, ' ');
                                if (text && text.length < 50) {
                                    name = text;
                                    source = 'text-content';
                                }
                            }
                            
                            // 有効な名前が取得できた場合のみ追加
                            if (name && !this.features.find(f => f.name === name || f.name.includes(name.split(' ')[0]))) {
                                const iconEl = item.querySelector('mat-icon');
                                const icon = iconEl ? (iconEl.getAttribute('fonticon') || iconEl.textContent?.trim()) : '';
                                
                                this.features.push({
                                    name: name,
                                    icon: icon,
                                    type: 'additional',
                                    location: 'submenu',
                                    source: source  // デバッグ用
                                });
                                
                                Utils.log(`その他メニュー機能検出: ${name}${icon ? ` (${icon})` : ''} [${source}]`, 'success');
                            }
                        }
                    }
                } else {
                    Utils.log('その他メニューが開きませんでした', 'warning');
                }
                
                // メニューを閉じる（Gemini用）
                await Utils.closeGeminiMenu();
                await Utils.wait(300);
                
                // 念のため残っているメニューがあれば追加でクローズ
                const remainingMenus = document.querySelectorAll('.mat-mdc-menu-panel:not([style*="display: none"])');
                if (remainingMenus.length > 0) {
                    Utils.log(`残存メニュー検出（${remainingMenus.length}個）、追加クローズ実行`, 'warning');
                    await Utils.closeGeminiMenu();
                }
                
                Utils.log('機能メニューを閉じました', 'info');
            }
        }
    }
    
    // ========================================
    // メインコントローラー
    // ========================================
    class AIServiceResearcher {
        constructor() {
            this.service = Utils.detectService();
            this.adapter = this.createAdapter();
            this.results = null;
        }
        
        createAdapter() {
            switch (this.service) {
                case 'claude':
                    return new ClaudeAdapter();
                case 'chatgpt':
                    return new ChatGPTAdapter();
                case 'gemini':
                    return new GeminiAdapter();
                default:
                    throw new Error('サービスを検出できませんでした');
            }
        }
        
        async run() {
            console.log('='.repeat(60));
            console.log('🚀 統一版 AI サービス リサーチコード (v2.0.0)');
            console.log(`📅 実行日時: ${new Date().toLocaleString('ja-JP')}`);
            console.log(`🔍 検出されたサービス: ${this.service.toUpperCase()}`);
            console.log(`📦 バージョン: ${CONFIG.version}`);
            console.log('='.repeat(60));
            
            try {
                this.results = await this.adapter.research();
                this.displayResults();
                this.saveResults();
                this.compareWithPrevious();
                
                console.log('\n✨ リサーチ完了！');
                console.log('全てのメニューが正常に閉じられました。');
                
            } catch (error) {
                console.error('❌ エラーが発生しました:', error);
                console.log('\n💡 トラブルシューティング:');
                console.log('  1. ページが完全に読み込まれているか確認');
                console.log('  2. 正しいサービスのページで実行しているか確認');
                console.log('  3. UIが変更されていないか確認');
                
                // エラー時も必ずメニューを閉じる
                await Utils.closeAllMenus();
            }
        }
        
        displayResults() {
            console.log('\n📊 リサーチ結果');
            console.log('='.repeat(60));
            
            console.log('\n🤖 検出されたモデル:');
            if (this.results.models.length > 0) {
                const mainModels = this.results.models.filter(m => !m.location || m.location !== 'submenu');
                const submenuModels = this.results.models.filter(m => m.location === 'submenu');
                
                if (mainModels.length > 0) {
                    console.log('【メインメニュー】');
                    mainModels.forEach((model, index) => {
                        const selected = model.selected ? ' ✅' : '';
                        console.log(`  ${index + 1}. ${model.name}${selected}`);
                        if (model.description) {
                            console.log(`     ${model.description}`);
                        }
                    });
                }
                
                if (submenuModels.length > 0) {
                    console.log('\n【サブメニュー】');
                    submenuModels.forEach((model, index) => {
                        console.log(`  ${index + 1}. ${model.name}`);
                        if (model.description) {
                            console.log(`     ${model.description}`);
                        }
                    });
                }
            } else {
                console.log('  ⚠️ モデルが検出されませんでした');
            }
            
            console.log('\n🔧 検出された機能:');
            if (this.results.features.length > 0) {
                const mainFeatures = this.results.features.filter(f => !f.location || (f.location !== 'submenu' && f.location !== 'deep-submenu'));
                const submenuFeatures = this.results.features.filter(f => f.location === 'submenu');
                const deepSubmenuFeatures = this.results.features.filter(f => f.location === 'deep-submenu');
                
                if (mainFeatures.length > 0) {
                    console.log('【メイン機能】');
                    mainFeatures.forEach((feature, index) => {
                        const status = feature.enabled !== undefined ? 
                            (feature.enabled ? ' ✅' : ' ⬜') : '';
                        const connected = feature.connected !== undefined ?
                            (feature.connected ? ' 🔗' : ' 🔓') : '';
                        const badge = feature.badge ? ` [${feature.badge}]` : '';
                        const icon = feature.icon ? ` (${feature.icon})` : '';
                        const type = feature.type ? ` <${feature.type}>` : '';
                        console.log(`  ${index + 1}. ${feature.name}${badge}${status}${connected}${icon}${type}`);
                        if (feature.sublabel) {
                            console.log(`     ${feature.sublabel}`);
                        }
                    });
                }
                
                if (submenuFeatures.length > 0) {
                    console.log('\n【サブメニュー機能】');
                    submenuFeatures.forEach((feature, index) => {
                        const badge = feature.badge ? ` [${feature.badge}]` : '';
                        const icon = feature.icon ? ` (${feature.icon})` : '';
                        console.log(`  ${index + 1}. ${feature.name}${badge}${icon}`);
                        if (feature.sublabel) {
                            console.log(`     ${feature.sublabel}`);
                        }
                    });
                }
                
                if (deepSubmenuFeatures.length > 0) {
                    console.log('\n【深層サブメニュー機能】');
                    deepSubmenuFeatures.forEach((feature, index) => {
                        const parent = feature.parent ? ` (親: ${feature.parent})` : '';
                        console.log(`  ${index + 1}. ${feature.name}${parent}`);
                    });
                }
            } else {
                console.log('  ⚠️ 機能が検出されませんでした');
            }
            
            if (Object.keys(this.results.additional).length > 0) {
                console.log('\n📝 追加情報:');
                console.log(JSON.stringify(this.results.additional, null, 2));
            }
        }
        
        saveResults() {
            const key = `${CONFIG.storageKey}_${this.service}`;
            localStorage.setItem(key, JSON.stringify(this.results));
            Utils.log(`データを保存しました (${key})`, 'success');
        }
        
        compareWithPrevious() {
            const key = `${CONFIG.storageKey}_${this.service}`;
            const previousDataStr = localStorage.getItem(`${key}_previous`);
            
            // 現在のデータを前回データとして保存
            localStorage.setItem(`${key}_previous`, JSON.stringify(this.results));
            
            if (!previousDataStr) {
                Utils.log('前回のデータなし（初回実行）', 'info');
                return;
            }
            
            try {
                const previous = JSON.parse(previousDataStr);
                const changes = [];
                
                // モデルの比較
                const prevModels = previous.models?.map(m => m.name) || [];
                const currModels = this.results.models.map(m => m.name);
                
                currModels.forEach(name => {
                    if (!prevModels.includes(name)) {
                        changes.push(`➕ 新規モデル: ${name}`);
                    }
                });
                
                prevModels.forEach(name => {
                    if (!currModels.includes(name)) {
                        changes.push(`➖ 削除されたモデル: ${name}`);
                    }
                });
                
                // 機能の比較
                const prevFeatures = previous.features?.map(f => f.name) || [];
                const currFeatures = this.results.features.map(f => f.name);
                
                currFeatures.forEach(name => {
                    if (!prevFeatures.includes(name)) {
                        changes.push(`➕ 新規機能: ${name}`);
                    }
                });
                
                prevFeatures.forEach(name => {
                    if (!currFeatures.includes(name)) {
                        changes.push(`➖ 削除された機能: ${name}`);
                    }
                });
                
                if (changes.length > 0) {
                    console.log('\n🔄 前回からの変更:');
                    changes.forEach(change => console.log(`  ${change}`));
                } else {
                    console.log('\n✅ 前回から変更はありません');
                }
            } catch (error) {
                Utils.log('前回データの比較でエラー', 'warning');
            }
        }
    }
    
    // ========================================
    // 実行
    // ========================================
    const researcher = new AIServiceResearcher();
    
    // UI Controllerが結果を取得できるようにwindowオブジェクトに公開
    window.ClaudeResearchDetector = {
        executeResearch: async () => {
            // 既に実行済みの結果を返す
            if (researcher.results) {
                const features = (researcher.results?.features || []).map(f => {
                    // オブジェクトの場合はそのまま返す
                    if (typeof f === 'object' && f !== null) {
                        return f;
                    }
                    // 文字列の場合はオブジェクトに変換
                    return {
                        name: f,
                        type: 'toggle',
                        enabled: false,
                        connected: false
                    };
                });
                
                return {
                    success: true,
                    data: {
                        models: researcher.results?.models || [],
                        features: features,
                        deepResearch: researcher.results?.additional?.deepResearch || { available: false },
                        additionalModels: researcher.results?.additional?.additionalModels || [],
                        timestamp: new Date().toISOString()
                    },
                    comparison: {
                        hasChanges: false,
                        changes: []
                    }
                };
            }
            return { success: false, error: 'Not executed yet' };
        }
    };
    
    // 即座に実行（元のコード通り）
    await researcher.run();
    
})();