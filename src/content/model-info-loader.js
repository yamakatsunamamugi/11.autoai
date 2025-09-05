/**
 * @fileoverview ModelInfoExtractorローダー
 * 
 * Service Worker環境でModelInfoExtractorをグローバルに登録する
 * ai-content-unified.jsより前に読み込まれる必要がある
 */

// UI_SELECTORSを直接定義（import制限回避）
const UI_SELECTORS = {
    ChatGPT: {
        MODEL_INFO: {
            BUTTON: [
                'button[data-testid="model-switcher-dropdown-button"]',
                'button[aria-label*="モデル"]',
                'button[aria-label*="Model"]',
                'button[class*="model"]',
                '[data-testid*="model-switcher"]'
            ],
            TEXT_ELEMENT: [
                'button[data-testid="model-switcher-dropdown-button"] div',
                'button[data-testid="model-switcher-dropdown-button"] span',
                '[data-testid="model-switcher-dropdown-button"] .text-sm',
                '[data-testid="model-switcher-dropdown-button"] *'
            ]
        }
    },
    Claude: {
        MODEL_INFO: {
            BUTTON: [
                'button[data-testid="model-selector-dropdown"]',
                'button[aria-haspopup="menu"]',
                'button.cursor-pointer:has(span.font-medium)',
                'button[aria-label*="モデル"]',
                'button[aria-label*="Model"]'
            ],
            TEXT_ELEMENT: [
                'button[data-testid="model-selector-dropdown"] .whitespace-nowrap.tracking-tight.select-none',
                'button[data-testid="model-selector-dropdown"] span',
                'button[data-testid="model-selector-dropdown"] div',
                'button[aria-haspopup="menu"] .whitespace-nowrap',
                'button[aria-haspopup="menu"] span.font-medium'
            ]
        }
    },
    Gemini: {
        MODEL_INFO: {
            BUTTON: [
                '.logo-pill-label-container',
                'button[aria-label*="モデル"]',
                'button[aria-label*="Model"]',
                '.model-selector-button',
                '[data-testid*="model"]'
            ],
            TEXT_ELEMENT: [
                '.logo-pill-label-container span',
                '.logo-pill-label-container .model-name',
                '.logo-pill-label-container div',
                '.model-indicator span',
                '[class*="model-"] span'
            ]
        }
    }
};

class ModelInfoExtractor {
    
    static extract(aiType) {
        const normalizedAiType = aiType.toLowerCase();
        
        switch (normalizedAiType) {
            case 'chatgpt':
                return this.extractChatGPTModel();
            case 'claude':
                return this.extractClaudeModel();
            case 'gemini':
                return this.extractGeminiModel();
            default:
                console.warn(`[ModelInfoExtractor] サポートされていないAI種別: ${aiType}`);
                return '';
        }
    }
    
    static extractChatGPTModel() {
        const debugInfo = {
            aiType: 'ChatGPT',
            selectorFound: false,
            elementContent: null,
            extractedModel: null
        };
        
        try {
            const selectors = UI_SELECTORS.ChatGPT.MODEL_INFO;
            
            let buttonElement = null;
            for (const selector of selectors.BUTTON) {
                buttonElement = document.querySelector(selector);
                if (buttonElement) {
                    debugInfo.selector = selector;
                    debugInfo.selectorFound = true;
                    break;
                }
            }
            
            if (!buttonElement) {
                console.warn(`[ModelInfoExtractor][ChatGPT] ⚠️ モデルボタン要素が見つかりません`);
                return '';
            }
            
            let modelText = '';
            for (const selector of selectors.TEXT_ELEMENT) {
                const textElement = document.querySelector(selector);
                if (textElement && textElement.textContent.trim()) {
                    const fullText = textElement.textContent.trim();
                    debugInfo.elementContent = fullText;
                    modelText = fullText.replace(/^ChatGPT\s*/i, '').trim();
                    debugInfo.extractedModel = modelText;
                    break;
                }
            }
            
            console.log(`[ModelInfoExtractor][ChatGPT] 🔍 モデル情報取得詳細:`, debugInfo);
            
            if (modelText) {
                console.log(`[ModelInfoExtractor][ChatGPT] ✅ モデル情報取得成功: "${modelText}"`);
            }
            
            return modelText;
            
        } catch (error) {
            console.error(`[ModelInfoExtractor][ChatGPT] ❌ モデル情報取得エラー:`, {
                error: error.message,
                debugInfo
            });
            return '';
        }
    }
    
    static extractClaudeModel() {
        const debugInfo = {
            aiType: 'Claude',
            selectorFound: false,
            elementContent: null,
            extractedModel: null,
            fallbackUsed: false
        };
        
        try {
            const selectors = UI_SELECTORS.Claude.MODEL_INFO;
            
            let buttonElement = null;
            for (const selector of selectors.BUTTON) {
                buttonElement = document.querySelector(selector);
                if (buttonElement) {
                    debugInfo.selector = selector;
                    break;
                }
            }
            
            if (!buttonElement) {
                console.warn(`[ModelInfoExtractor][Claude] ⚠️ モデルボタン要素が見つかりません`);
                return '';
            }
            
            let modelText = '';
            for (const selector of selectors.TEXT_ELEMENT) {
                const textElement = document.querySelector(selector);
                if (textElement && textElement.textContent.trim()) {
                    modelText = textElement.textContent.trim();
                    debugInfo.selectorFound = true;
                    debugInfo.elementContent = modelText;
                    debugInfo.extractedModel = modelText;
                    break;
                }
            }
            
            if (!modelText) {
                const buttonText = buttonElement.textContent;
                console.warn(`[ModelInfoExtractor][Claude] ⚠️ 特定の要素が見つからないため、ボタン全体から抽出: ${buttonText}`);
                
                const match = buttonText.match(/(?:Claude\s*)?((?:Opus|Sonnet|Haiku)\s*[\d.]+)/i);
                if (match) {
                    modelText = match[1].trim();
                    debugInfo.elementContent = buttonText;
                    debugInfo.extractedModel = modelText;
                    debugInfo.fallbackUsed = true;
                }
            }
            
            console.log(`[ModelInfoExtractor][Claude] 🔍 モデル情報取得詳細:`, debugInfo);
            
            if (modelText) {
                console.log(`[ModelInfoExtractor][Claude] ✅ モデル情報取得成功: "${modelText}"`);
            }
            
            return modelText;
            
        } catch (error) {
            console.error(`[ModelInfoExtractor][Claude] ❌ モデル情報取得エラー:`, {
                error: error.message,
                debugInfo
            });
            return '';
        }
    }
    
    static extractGeminiModel() {
        const debugInfo = {
            aiType: 'Gemini',
            selectorFound: false,
            elementContent: null,
            extractedModel: null
        };
        
        try {
            const selectors = UI_SELECTORS.Gemini.MODEL_INFO;
            
            let modelText = '';
            for (const selector of selectors.TEXT_ELEMENT) {
                const textElement = document.querySelector(selector);
                if (textElement && textElement.textContent.trim()) {
                    modelText = textElement.textContent.trim();
                    debugInfo.selectorFound = true;
                    debugInfo.elementContent = modelText;
                    debugInfo.extractedModel = modelText;
                    debugInfo.selector = selector;
                    break;
                }
            }
            
            console.log(`[ModelInfoExtractor][Gemini] 🔍 モデル情報取得詳細:`, debugInfo);
            
            if (modelText) {
                console.log(`[ModelInfoExtractor][Gemini] ✅ モデル情報取得成功: "${modelText}"`);
            }
            
            return modelText;
            
        } catch (error) {
            console.error(`[ModelInfoExtractor][Gemini] ❌ モデル情報取得エラー:`, {
                error: error.message,
                debugInfo
            });
            return '';
        }
    }
}

// FunctionInfoExtractor クラスの追加
class FunctionInfoExtractor {
    
    static extract(aiType) {
        const normalizedAiType = aiType.toLowerCase();
        
        switch (normalizedAiType) {
            case 'chatgpt':
                return this.extractChatGPTFunction();
            case 'claude':
                return this.extractClaudeFunction();
            case 'gemini':
                return this.extractGeminiFunction();
            default:
                console.warn(`[FunctionInfoExtractor] サポートされていないAI種別: ${aiType}`);
                return '';
        }
    }
    
    static extractChatGPTFunction() {
        const debugInfo = {
            aiType: 'ChatGPT',
            selectorFound: false,
            elementContent: null,
            extractedFunction: null
        };
        
        try {
            let functionName = '';
            
            // 機能ボタン（data-pill="true"）からの取得
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
            }
            
            // Canvasや他の機能の表示要素を探す（新しいUI対応）
            if (!functionName) {
                // Canvas表示要素のセレクタを試す
                const canvasIndicators = document.querySelectorAll(
                    '[class*="canvas"], [aria-label*="canvas"], [title*="canvas"], ' +
                    '[data-testid*="canvas"], button:has(svg):has(span), ' +
                    'button[aria-haspopup="menu"] span'
                );
                for (const elem of canvasIndicators) {
                    const text = elem.textContent?.trim()?.toLowerCase();
                    if (text && (text === 'canvas' || text.includes('canvas'))) {
                        functionName = 'canvas';
                        debugInfo.selectorFound = true;
                        debugInfo.elementContent = text;
                        debugInfo.extractedFunction = functionName;
                        break;
                    }
                }
            }
            
            // 選択状態のメニューアイテムから取得
            if (!functionName) {
                const selectedItems = document.querySelectorAll('[role="menuitemradio"][aria-checked="true"]');
                for (const item of selectedItems) {
                    const text = item.textContent?.trim();
                    if (text && text.length > 0 && !text.includes('ChatGPT') && !text.includes('GPT')) {
                        functionName = text;
                        debugInfo.selectorFound = true;
                        debugInfo.elementContent = text;
                        debugInfo.extractedFunction = text;
                        break;
                    }
                }
            }
            
            console.log(`[FunctionInfoExtractor][ChatGPT] 🔍 機能情報取得詳細:`, debugInfo);
            
            if (functionName) {
                console.log(`[FunctionInfoExtractor][ChatGPT] ✅ 機能情報取得成功: "${functionName}"`);
            }
            
            return functionName;
            
        } catch (error) {
            console.error(`[FunctionInfoExtractor][ChatGPT] ❌ 機能情報取得エラー:`, {
                error: error.message,
                debugInfo
            });
            return '';
        }
    }
    
    static extractClaudeFunction() {
        const debugInfo = {
            aiType: 'Claude',
            selectorFound: false,
            elementContent: null,
            extractedFunction: null
        };
        
        try {
            let functionName = '';
            
            // 機能インジケーターから取得
            const functionIndicators = document.querySelectorAll('.function-pill, .selected-function, [class*="function"], [data-function]');
            for (const indicator of functionIndicators) {
                const text = indicator.textContent?.trim();
                if (text && text.length > 0 && !text.includes('Claude')) {
                    functionName = text;
                    debugInfo.selectorFound = true;
                    debugInfo.elementContent = text;
                    debugInfo.extractedFunction = text;
                    break;
                }
            }
            
            // 選択されたメニューアイテムから取得
            if (!functionName) {
                const selectedItems = document.querySelectorAll('[role="menuitemradio"][aria-checked="true"], [role="menuitem"][aria-selected="true"]');
                for (const item of selectedItems) {
                    const text = item.textContent?.trim();
                    if (text && text.length > 0 && !text.includes('Claude') && !text.includes('Sonnet') && !text.includes('Opus') && !text.includes('Haiku')) {
                        functionName = text;
                        debugInfo.selectorFound = true;
                        debugInfo.elementContent = text;
                        debugInfo.extractedFunction = text;
                        break;
                    }
                }
            }
            
            console.log(`[FunctionInfoExtractor][Claude] 🔍 機能情報取得詳細:`, debugInfo);
            
            if (functionName) {
                console.log(`[FunctionInfoExtractor][Claude] ✅ 機能情報取得成功: "${functionName}"`);
            }
            
            return functionName;
            
        } catch (error) {
            console.error(`[FunctionInfoExtractor][Claude] ❌ 機能情報取得エラー:`, {
                error: error.message,
                debugInfo
            });
            return '';
        }
    }
    
    static extractGeminiFunction() {
        const debugInfo = {
            aiType: 'Gemini',
            selectorFound: false,
            elementContent: null,
            extractedFunction: null
        };
        
        try {
            let functionName = '';
            
            // 機能ラベルから取得
            const functionLabels = document.querySelectorAll('.function-label, .selected-function, [class*="function"], [class*="tool"]');
            for (const label of functionLabels) {
                const text = label.textContent?.trim();
                if (text && text.length > 0 && !text.includes('Gemini') && !text.includes('Google')) {
                    functionName = text;
                    debugInfo.selectorFound = true;
                    debugInfo.elementContent = text;
                    debugInfo.extractedFunction = text;
                    break;
                }
            }
            
            // DeepResearchインジケーターから取得
            if (!functionName) {
                const deepResearchIndicators = document.querySelectorAll('[class*="deep"], [class*="research"], [title*="Deep"], [title*="Research"]');
                for (const indicator of deepResearchIndicators) {
                    const text = indicator.textContent?.trim() || indicator.title?.trim();
                    if (text && text.length > 0) {
                        functionName = text;
                        debugInfo.selectorFound = true;
                        debugInfo.elementContent = text;
                        debugInfo.extractedFunction = text;
                        break;
                    }
                }
            }
            
            console.log(`[FunctionInfoExtractor][Gemini] 🔍 機能情報取得詳細:`, debugInfo);
            
            if (functionName) {
                console.log(`[FunctionInfoExtractor][Gemini] ✅ 機能情報取得成功: "${functionName}"`);
            }
            
            return functionName;
            
        } catch (error) {
            console.error(`[FunctionInfoExtractor][Gemini] ❌ 機能情報取得エラー:`, {
                error: error.message,
                debugInfo
            });
            return '';
        }
    }
}

// グローバルに登録
window.ModelInfoExtractor = ModelInfoExtractor;
window.FunctionInfoExtractor = FunctionInfoExtractor;
console.log('✅ [11.autoai] ModelInfoExtractorとFunctionInfoExtractorをグローバルに登録しました');