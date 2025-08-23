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

// グローバルに登録
window.ModelInfoExtractor = ModelInfoExtractor;
console.log('✅ [11.autoai] ModelInfoExtractorをグローバルに登録しました');