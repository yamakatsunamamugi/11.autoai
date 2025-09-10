/**
 * @fileoverview 機能情報抽出モジュール
 * 
 * 【役割】
 * 各AI（ChatGPT、Claude、Gemini）から現在の機能情報を取得
 * BaseExtractorを継承し、共通処理を活用
 * 
 * 【使用方法】
 * import { FunctionExtractor } from './extractors/function-extractor.js';
 * const functionInfo = FunctionExtractor.extract('chatgpt');
 */

import { BaseExtractor } from './base-extractor.js';

class FunctionExtractorImpl extends BaseExtractor {
    constructor(aiType) {
        super(aiType);
    }
    
    /**
     * ChatGPTから機能情報を取得
     * @returns {string} 機能名
     */
    extractChatGPTFunction() {
        const debugInfo = {
            aiType: 'ChatGPT',
            selectorFound: false,
            elementContent: null,
            extractedFunction: null,
            attemptedSelectors: []
        };
        
        try {
            let functionName = '';
            
            // 1. Canvas右側パネルの存在確認（最優先）
            const canvasPanel = document.querySelector('#prosemirror-editor-container');
            if (canvasPanel) {
                functionName = 'canvas';
                debugInfo.selectorFound = true;
                debugInfo.elementContent = 'Canvas panel detected';
                debugInfo.extractedFunction = functionName;
                debugInfo.attemptedSelectors.push('#prosemirror-editor-container - Found Canvas panel');
                this.log('✅ Canvasパネル検出により機能を判定: "canvas"');
            }
            
            // 2. 機能ボタン（data-pill="true"）からの取得
            if (!functionName) {
                debugInfo.attemptedSelectors.push('button[data-pill="true"]');
                const functionButtons = document.querySelectorAll('button[data-pill="true"]');
                if (functionButtons.length > 0) {
                    for (const button of functionButtons) {
                        const text = button.textContent?.trim();
                        if (text && text.length > 0) {
                            functionName = text;
                            debugInfo.selectorFound = true;
                            debugInfo.elementContent = text;
                            debugInfo.extractedFunction = text;
                            break;
                        }
                    }
                } else {
                    debugInfo.attemptedSelectors.push('button[data-pill="true"] - Not found');
                }
            }
            
            // 3. Canvasアイコンやインジケーターを探す
            if (!functionName) {
                const canvasSelectors = [
                    '[class*="canvas"]',
                    '[aria-label*="canvas"]',
                    '[aria-label*="Canvas"]',
                    '[title*="canvas"]',
                    '[title*="Canvas"]',
                    '[data-testid*="canvas"]',
                    'button[aria-label*="キャンバス"]',
                    'button[title*="キャンバス"]',
                    '.composer-parent [role="button"]',
                    'div[class*="composer"] button[class*="rounded"]'
                ];
                
                for (const selector of canvasSelectors) {
                    debugInfo.attemptedSelectors.push(selector);
                    const elements = document.querySelectorAll(selector);
                    for (const elem of elements) {
                        const text = elem.textContent?.trim()?.toLowerCase();
                        const ariaLabel = elem.getAttribute('aria-label')?.toLowerCase();
                        const title = elem.getAttribute('title')?.toLowerCase();
                        
                        if ((text && (text === 'canvas' || text.includes('canvas'))) ||
                            (ariaLabel && ariaLabel.includes('canvas')) ||
                            (title && title.includes('canvas'))) {
                            functionName = 'canvas';
                            debugInfo.selectorFound = true;
                            debugInfo.elementContent = text || ariaLabel || title;
                            debugInfo.extractedFunction = functionName;
                            debugInfo.attemptedSelectors[debugInfo.attemptedSelectors.length - 1] += ' - Found';
                            break;
                        }
                    }
                    if (functionName) break;
                }
            }
            
            // 4. デフォルト値
            if (!functionName) {
                functionName = '通常';
                debugInfo.extractedFunction = functionName;
            }
            
            this.log('🔍 機能情報取得詳細:', debugInfo);
            
            if (functionName && functionName !== '通常') {
                this.log(`✅ 機能情報取得成功: "${functionName}"`);
            } else {
                this.log('📝 機能: 通常モード');
            }
            
            return functionName;
            
        } catch (error) {
            this.error('機能情報取得エラー:', error, debugInfo);
            return '通常';
        }
    }
    
    /**
     * Claudeから機能情報を取得
     * @returns {string} 機能名
     */
    extractClaudeFunction() {
        const debugInfo = {
            aiType: 'Claude',
            selectorFound: false,
            elementContent: null,
            extractedFunction: null
        };
        
        try {
            let functionName = '';
            
            // 1. Artifacts（右側パネル）の確認
            const artifactsPanel = document.querySelector('[data-testid*="artifact"]');
            if (artifactsPanel) {
                functionName = 'Artifacts';
                debugInfo.selectorFound = true;
                debugInfo.elementContent = 'Artifacts panel detected';
                debugInfo.extractedFunction = functionName;
                this.log('✅ Artifactsパネル検出により機能を判定: "Artifacts"');
            }
            
            // 2. 機能ボタンの確認
            if (!functionName) {
                const functionSelectors = [
                    'button[aria-label*="機能"]',
                    'button[aria-label*="Feature"]',
                    'button[data-testid*="feature"]',
                    '[class*="feature-button"]'
                ];
                
                for (const selector of functionSelectors) {
                    const button = document.querySelector(selector);
                    if (button) {
                        const text = this.getCleanText(button);
                        if (text && text !== '通常') {
                            functionName = text;
                            debugInfo.selectorFound = true;
                            debugInfo.elementContent = text;
                            debugInfo.extractedFunction = text;
                            break;
                        }
                    }
                }
            }
            
            // 3. デフォルト値
            if (!functionName) {
                functionName = '通常';
                debugInfo.extractedFunction = functionName;
            }
            
            this.log('🔍 機能情報取得詳細:', debugInfo);
            
            if (functionName && functionName !== '通常') {
                this.log(`✅ 機能情報取得成功: "${functionName}"`);
            } else {
                this.log('📝 機能: 通常モード');
            }
            
            return functionName;
            
        } catch (error) {
            this.error('機能情報取得エラー:', error, debugInfo);
            return '通常';
        }
    }
    
    /**
     * Geminiから機能情報を取得
     * @returns {string} 機能名
     */
    extractGeminiFunction() {
        const debugInfo = {
            aiType: 'Gemini',
            selectorFound: false,
            elementContent: null,
            extractedFunction: null
        };
        
        try {
            let functionName = '';
            
            // 1. 選択された機能ボタンを探す
            const selectedButtonSelectors = [
                '.toolbox-drawer-item-button button.is-selected',
                '.toolbox-drawer-button.has-selected-item',
                'button[aria-pressed="true"]'
            ];
            
            for (const selector of selectedButtonSelectors) {
                const button = document.querySelector(selector);
                if (button) {
                    // ラベルテキストを取得
                    const labelElement = button.querySelector('.label');
                    if (labelElement) {
                        functionName = this.getCleanText(labelElement);
                        debugInfo.selectorFound = true;
                        debugInfo.elementContent = functionName;
                        debugInfo.extractedFunction = functionName;
                        break;
                    }
                    
                    // アイコンから機能を判定（画面が小さい場合）
                    const iconElement = button.querySelector('mat-icon[data-mat-icon-name]');
                    if (iconElement) {
                        const iconName = iconElement.getAttribute('data-mat-icon-name');
                        const iconToFunction = {
                            'photo_prints': '画像',
                            'image': '画像',
                            'note_stack_add': 'Canvas',
                            'canvas': 'Canvas',
                            'science': 'Deep Research',
                            'research': 'Deep Research'
                        };
                        
                        if (iconToFunction[iconName]) {
                            functionName = iconToFunction[iconName];
                            debugInfo.selectorFound = true;
                            debugInfo.elementContent = `icon: ${iconName}`;
                            debugInfo.extractedFunction = functionName;
                            break;
                        }
                    }
                }
            }
            
            // 2. Canvas要素（.ProseMirror）の存在確認
            if (!functionName) {
                const canvasEditor = document.querySelector('.ProseMirror');
                if (canvasEditor) {
                    functionName = 'Canvas';
                    debugInfo.selectorFound = true;
                    debugInfo.elementContent = 'Canvas editor detected';
                    debugInfo.extractedFunction = functionName;
                    this.log('✅ Canvasエディタ検出により機能を判定: "Canvas"');
                }
            }
            
            // 3. デフォルト値
            if (!functionName) {
                functionName = '通常';
                debugInfo.extractedFunction = functionName;
            }
            
            this.log('🔍 機能情報取得詳細:', debugInfo);
            
            if (functionName && functionName !== '通常') {
                this.log(`✅ 機能情報取得成功: "${functionName}"`);
            } else {
                this.log('📝 機能: 通常モード');
            }
            
            return functionName;
            
        } catch (error) {
            this.error('機能情報取得エラー:', error, debugInfo);
            return '通常';
        }
    }
    
    /**
     * 指定されたAI種別から機能情報を取得
     * @returns {string} 機能名（取得失敗時は'通常'）
     */
    extract() {
        const normalizedAiType = this.aiType.toLowerCase();
        
        switch (normalizedAiType) {
            case 'chatgpt':
                return this.extractChatGPTFunction();
            case 'claude':
                return this.extractClaudeFunction();
            case 'gemini':
                return this.extractGeminiFunction();
            default:
                this.warn(`サポートされていないAI種別: ${this.aiType}`);
                return '通常';
        }
    }
}

/**
 * 機能情報抽出のファサード
 */
export class FunctionExtractor {
    /**
     * 指定されたAI種別から機能情報を取得
     * @param {string} aiType - AI種別 ('chatgpt', 'claude', 'gemini')
     * @returns {string} 機能名（取得失敗時は'通常'）
     */
    static extract(aiType) {
        const extractor = new FunctionExtractorImpl(aiType);
        return extractor.extract();
    }
}

// デフォルトエクスポート（後方互換性のため）
export default FunctionExtractor;