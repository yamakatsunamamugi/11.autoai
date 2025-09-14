/**
 * AI Selector Validation System
 * 3ウィンドウ（ChatGPT, Claude, Gemini）でのセレクタ検証システム
 */

import { WindowService } from '../services/window-service.js';
import { DOMObserver } from '../../automations/1-ai-common-base.js';

export class AISelectorValidationSystem {
    constructor() {
        this.isRunning = false;
        this.validationWindows = [];
        this.validationResults = {};
        this.stepCounter = 0;
        this.windowService = new WindowService();
    }

    /**
     * AI Selector Mutation System開始
     */
    async startAISelectorMutationSystem() {
        if (this.isRunning) {
            this.log('⚠️ AI Selector Validation System is already running');
            return;
        }

        this.isRunning = true;
        this.stepCounter = 0;
        this.validationResults = {};

        this.log('🚀 Starting AI Selector Validation System...');

        try {
            // 3ウィンドウを開く
            await this.openValidationWindows();

            // 各AIプラットフォームでセレクタ検証を実行
            await this.validateAllAIPlatforms();

            // 結果を表示
            this.displayValidationResults();

        } catch (error) {
            this.log(`❌ Error in AI Selector Validation: ${error.message}`);
        } finally {
            this.isRunning = false;
        }
    }

    /**
     * AI Selector Mutation System停止
     */
    async stopAISelectorMutationSystem() {
        if (!this.isRunning) {
            this.log('⚠️ AI Selector Validation System is not running');
            return;
        }

        this.isRunning = false;
        this.log('🛑 Stopping AI Selector Validation System...');

        // ウィンドウを閉じる
        for (const windowId of this.validationWindows) {
            try {
                await chrome.windows.remove(windowId);
            } catch (error) {
                console.error(`Failed to close window ${windowId}:`, error);
            }
        }

        this.validationWindows = [];
        this.log('✅ AI Selector Validation System stopped');
    }

    /**
     * 3つのウィンドウを開く（左上→右上→左下）
     */
    async openValidationWindows() {
        const aiPlatforms = [
            { name: 'ChatGPT', url: 'https://chat.openai.com', position: 0 },
            { name: 'Claude', url: 'https://claude.ai', position: 1 },
            { name: 'Gemini', url: 'https://gemini.google.com', position: 2 }
        ];

        this.log('📋 Step ' + (++this.stepCounter) + ': Opening 3 windows for AI platforms...');

        for (const platform of aiPlatforms) {
            try {
                const windowId = await this.windowService.createWindowWithPosition(
                    platform.url,
                    platform.position
                );
                this.validationWindows.push(windowId);
                this.log(`✅ ${platform.name} window opened (position: ${platform.position})`);

                // ウィンドウ間の待機時間
                await this.delay(2000);
            } catch (error) {
                this.log(`❌ Failed to open ${platform.name} window: ${error.message}`);
            }
        }
    }

    /**
     * 全AIプラットフォームでセレクタ検証
     */
    async validateAllAIPlatforms() {
        const platforms = ['chatgpt', 'claude', 'gemini'];

        this.log('📋 Step ' + (++this.stepCounter) + ': Starting comprehensive selector validation...');

        for (let i = 0; i < platforms.length; i++) {
            if (!this.isRunning) break;

            const platform = platforms[i];
            const windowId = this.validationWindows[i];

            if (windowId) {
                await this.validatePlatformSelectors(platform, windowId);
                await this.delay(1000);
            }
        }
    }

    /**
     * 特定プラットフォームのセレクタ検証
     */
    async validatePlatformSelectors(platform, windowId) {
        this.log(`🔍 Validating ${platform.toUpperCase()} selectors...`);

        try {
            // ui-selectors-data.jsonからセレクタデータを取得
            const selectorsData = await this.loadSelectorsData();
            const platformSelectors = selectorsData[platform];

            if (!platformSelectors) {
                this.log(`❌ No selector data found for ${platform}`);
                return;
            }

            // ウィンドウにフォーカス
            await chrome.windows.update(windowId, { focused: true });
            await this.delay(1000);

            // 各セレクタカテゴリを検証
            const results = {
                static: await this.validateStaticSelectors(platform, platformSelectors, windowId),
                dynamic: await this.validateDynamicSelectors(platform, platformSelectors, windowId),
                conditional: await this.validateConditionalSelectors(platform, platformSelectors, windowId)
            };

            this.validationResults[platform] = results;

        } catch (error) {
            this.log(`❌ Error validating ${platform}: ${error.message}`);
            this.validationResults[platform] = { error: error.message };
        }
    }

    /**
     * 静的セレクタの検証（常に存在するべき要素）
     */
    async validateStaticSelectors(platform, selectors, windowId) {
        const results = {};
        const staticElements = ['input', 'send', 'model'];

        for (const elementType of staticElements) {
            if (selectors[elementType]) {
                results[elementType] = await this.validateSelectorSet(
                    platform, elementType, selectors[elementType], windowId
                );
            }
        }

        return results;
    }

    /**
     * 動的セレクタの検証（アクション後に出現する要素）
     */
    async validateDynamicSelectors(platform, selectors, windowId) {
        const results = {};

        // 送信ボタンをクリックして停止ボタンの出現を確認
        if (selectors.send && selectors.stop) {
            this.log(`🔄 Testing ${platform} send→stop button interaction...`);

            try {
                // テスト用のメッセージを入力
                await this.executeInWindow(windowId, `
                    const input = document.querySelector('${selectors.input[0]}');
                    if (input) {
                        input.value = 'test';
                        input.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                `);

                await this.delay(500);

                // 送信ボタンをクリック
                await this.executeInWindow(windowId, `
                    const sendBtn = document.querySelector('${selectors.send[0]}');
                    if (sendBtn) sendBtn.click();
                `);

                await this.delay(2000);

                // 停止ボタンの存在確認
                results.stop = await this.validateSelectorSet(
                    platform, 'stop', selectors.stop, windowId
                );

                // 停止ボタンをクリック
                await this.executeInWindow(windowId, `
                    const stopBtn = document.querySelector('${selectors.stop[0]}');
                    if (stopBtn) stopBtn.click();
                `);

            } catch (error) {
                this.log(`❌ Dynamic validation error for ${platform}: ${error.message}`);
                results.stop = { error: error.message };
            }
        }

        return results;
    }

    /**
     * 条件付きセレクタの検証（メニュー展開など）
     */
    async validateConditionalSelectors(platform, selectors, windowId) {
        const results = {};

        // モデルボタンをクリックしてメニュー展開を確認
        if (selectors.model && selectors.modelMenu) {
            this.log(`🔄 Testing ${platform} model menu expansion...`);

            try {
                // モデルボタンをクリック
                await this.executeInWindow(windowId, `
                    const modelBtn = document.querySelector('${selectors.model[0]}');
                    if (modelBtn) modelBtn.click();
                `);

                await this.delay(1000);

                // モデルメニューの存在確認
                results.modelMenu = await this.validateSelectorSet(
                    platform, 'modelMenu', selectors.modelMenu, windowId
                );

                // メニューを閉じる（ESCキー）
                await this.executeInWindow(windowId, `
                    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
                `);

            } catch (error) {
                this.log(`❌ Conditional validation error for ${platform}: ${error.message}`);
                results.modelMenu = { error: error.message };
            }
        }

        return results;
    }

    /**
     * セレクタセットの検証
     */
    async validateSelectorSet(platform, elementType, selectors, windowId) {
        const results = {
            tested: selectors,
            found: [],
            working: null
        };

        for (let i = 0; i < selectors.length; i++) {
            const selector = selectors[i];

            try {
                const found = await this.executeInWindow(windowId, `
                    return document.querySelector('${selector}') !== null;
                `);

                if (found) {
                    results.found.push(selector);
                    if (!results.working) {
                        results.working = selector;
                    }
                }
            } catch (error) {
                console.error(`Error testing selector ${selector}:`, error);
            }
        }

        this.log(`${results.working ? '✅' : '❌'} ${platform} ${elementType}: ${results.found.length}/${selectors.length} selectors found`);

        return results;
    }

    /**
     * ウィンドウでスクリプト実行
     */
    async executeInWindow(windowId, script) {
        const tabs = await chrome.tabs.query({ windowId });
        if (tabs.length > 0) {
            const result = await chrome.scripting.executeScript({
                target: { tabId: tabs[0].id },
                func: new Function(script)
            });
            return result[0]?.result;
        }
        return null;
    }

    /**
     * ui-selectors-data.jsonを読み込み
     */
    async loadSelectorsData() {
        try {
            const response = await fetch(chrome.runtime.getURL('ui-selectors-data.json'));
            return await response.json();
        } catch (error) {
            throw new Error(`Failed to load selectors data: ${error.message}`);
        }
    }

    /**
     * 検証結果を表示
     */
    displayValidationResults() {
        this.log('📋 Step ' + (++this.stepCounter) + ': Validation Results Summary:');

        for (const [platform, results] of Object.entries(this.validationResults)) {
            this.log(`\n=== ${platform.toUpperCase()} Results ===`);

            if (results.error) {
                this.log(`❌ Error: ${results.error}`);
                continue;
            }

            // 静的要素結果
            if (results.static) {
                this.log('📌 Static Elements:');
                for (const [element, result] of Object.entries(results.static)) {
                    const status = result.working ? '✅' : '❌';
                    this.log(`  ${status} ${element}: ${result.found.length}/${result.tested.length}`);
                }
            }

            // 動的要素結果
            if (results.dynamic && Object.keys(results.dynamic).length > 0) {
                this.log('🔄 Dynamic Elements:');
                for (const [element, result] of Object.entries(results.dynamic)) {
                    if (result.error) {
                        this.log(`  ❌ ${element}: ${result.error}`);
                    } else {
                        const status = result.working ? '✅' : '❌';
                        this.log(`  ${status} ${element}: ${result.found.length}/${result.tested.length}`);
                    }
                }
            }

            // 条件付き要素結果
            if (results.conditional && Object.keys(results.conditional).length > 0) {
                this.log('🔧 Conditional Elements:');
                for (const [element, result] of Object.entries(results.conditional)) {
                    if (result.error) {
                        this.log(`  ❌ ${element}: ${result.error}`);
                    } else {
                        const status = result.working ? '✅' : '❌';
                        this.log(`  ${status} ${element}: ${result.found.length}/${result.tested.length}`);
                    }
                }
            }
        }

        this.log('\n🎉 AI Selector Validation System completed!');
    }

    /**
     * ChatGPTスタイルのログ出力
     */
    log(message) {
        const timestamp = new Date().toLocaleTimeString();
        console.log(`[${timestamp}] ${message}`);

        // UIに表示（もし利用可能なら）
        if (typeof updateUIStatus === 'function') {
            updateUIStatus(message);
        }
    }

    /**
     * 待機関数
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// デフォルトエクスポート
export default AISelectorValidationSystem;