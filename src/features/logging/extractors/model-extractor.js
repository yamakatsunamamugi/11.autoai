/**
 * @fileoverview モデル情報抽出モジュール
 * 
 * 【役割】
 * 各AI（ChatGPT、Claude、Gemini）から現在のモデル情報を取得
 * BaseExtractorを継承し、共通処理を活用
 * 
 * 【使用方法】
 * import { ModelExtractor } from './extractors/model-extractor.js';
 * const modelInfo = ModelExtractor.extract('chatgpt');
 */

import { BaseExtractor } from './base-extractor.js';
import { UI_SELECTORS } from '../../../config/ui-selectors.js';

class ModelExtractorImpl extends BaseExtractor {
    constructor(aiType) {
        super(aiType);
    }
    
    /**
     * ChatGPTからモデル情報を取得
     * @returns {string} モデル名
     */
    extractChatGPTModel() {
        const debugInfo = {
            aiType: 'ChatGPT',
            selectorFound: false,
            elementContent: null,
            extractedModel: null
        };
        
        try {
            const selectors = UI_SELECTORS.ChatGPT.MODEL_INFO;
            
            // ボタン要素を取得
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
                this.warn('モデルボタン要素が見つかりません', {
                    試行したセレクタ: selectors.BUTTON
                });
                return '';
            }
            
            // テキスト要素を取得
            let modelText = '';
            for (const selector of selectors.TEXT_ELEMENT) {
                const textElement = document.querySelector(selector);
                if (textElement && textElement.textContent.trim()) {
                    const fullText = textElement.textContent.trim();
                    debugInfo.elementContent = fullText;
                    
                    // "ChatGPT " を削除してモデル名のみ取得
                    modelText = fullText.replace(/^ChatGPT\s*/i, '').trim();
                    debugInfo.extractedModel = modelText;
                    break;
                }
            }
            
            if (!modelText) {
                this.warn('モデルテキストを取得できませんでした', {
                    ボタン内容: buttonElement.textContent
                });
            }
            
            this.log('🔍 モデル情報取得詳細:', debugInfo);
            
            if (modelText) {
                this.log(`✅ モデル情報取得成功: "${modelText}"`);
            } else {
                this.warn('モデル情報を取得できませんでした');
            }
            
            return modelText;
            
        } catch (error) {
            this.error('モデル情報取得エラー:', error, debugInfo);
            return '';
        }
    }
    
    /**
     * Claudeからモデル情報を取得
     * @returns {string} モデル名
     */
    extractClaudeModel() {
        const debugInfo = {
            aiType: 'Claude',
            selectorFound: false,
            elementContent: null,
            extractedModel: null,
            fallbackUsed: false
        };
        
        try {
            const selectors = UI_SELECTORS.Claude.MODEL_INFO;
            
            // ボタン要素を取得
            let buttonElement = null;
            for (const selector of selectors.BUTTON) {
                buttonElement = document.querySelector(selector);
                if (buttonElement) {
                    debugInfo.selector = selector;
                    break;
                }
            }
            
            if (!buttonElement) {
                this.warn('モデルボタン要素が見つかりません', {
                    試行したセレクタ: selectors.BUTTON
                });
                return '';
            }
            
            // 優先セレクタでテキスト要素を取得
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
            
            // フォールバック: ボタン内のテキストから抽出
            if (!modelText) {
                const buttonText = buttonElement.textContent;
                this.warn(`特定の要素が見つからないため、ボタン全体から抽出: ${buttonText}`);
                
                // "Claude" を除外してモデル名を取得
                const match = buttonText.match(/(?:Claude\s*)?((?:Opus|Sonnet|Haiku)\s*[\d.]+)/i);
                if (match) {
                    modelText = match[1].trim();
                    debugInfo.elementContent = buttonText;
                    debugInfo.extractedModel = modelText;
                    debugInfo.fallbackUsed = true;
                }
            }
            
            this.log('🔍 モデル情報取得詳細:', debugInfo);
            
            if (modelText) {
                this.log(`✅ モデル情報取得成功: "${modelText}"`);
            } else {
                this.warn('モデル情報を取得できませんでした');
            }
            
            return modelText;
            
        } catch (error) {
            this.error('モデル情報取得エラー:', error, debugInfo);
            return '';
        }
    }
    
    /**
     * Geminiからモデル情報を取得
     * @returns {string} モデル名
     */
    extractGeminiModel() {
        const debugInfo = {
            aiType: 'Gemini',
            selectorFound: false,
            elementContent: null,
            extractedModel: null
        };
        
        try {
            const selectors = UI_SELECTORS.Gemini.MODEL_INFO;
            
            // テキスト要素を取得（コンテナ要素も考慮）
            let modelText = '';
            for (const selector of selectors.TEXT_ELEMENT) {
                const textElement = document.querySelector(selector);
                if (textElement) {
                    // getCleanTextを使用してテキストを取得
                    const cleanText = this.getCleanText(textElement);
                    
                    if (cleanText) {
                        modelText = cleanText;
                        debugInfo.selectorFound = true;
                        debugInfo.elementContent = textElement.textContent.trim();
                        debugInfo.extractedModel = modelText;
                        debugInfo.selector = selector;
                        break;
                    }
                }
            }
            
            if (!modelText) {
                this.warn('モデルラベル要素が見つかりません', {
                    試行したセレクタ: selectors.TEXT_ELEMENT
                });
            }
            
            this.log('🔍 モデル情報取得詳細:', debugInfo);
            
            if (modelText) {
                this.log(`✅ モデル情報取得成功: "${modelText}"`);
            } else {
                this.warn('モデル情報を取得できませんでした');
            }
            
            return modelText;
            
        } catch (error) {
            this.error('モデル情報取得エラー:', error, debugInfo);
            return '';
        }
    }
    
    /**
     * 指定されたAI種別からモデル情報を取得
     * @returns {string} モデル名（取得失敗時は空文字）
     */
    extract() {
        const normalizedAiType = this.aiType.toLowerCase();
        
        switch (normalizedAiType) {
            case 'chatgpt':
                return this.extractChatGPTModel();
            case 'claude':
                return this.extractClaudeModel();
            case 'gemini':
                return this.extractGeminiModel();
            default:
                this.warn(`サポートされていないAI種別: ${this.aiType}`);
                return '';
        }
    }
}

/**
 * モデル情報抽出のファサード
 */
export class ModelExtractor {
    /**
     * 指定されたAI種別からモデル情報を取得
     * @param {string} aiType - AI種別 ('chatgpt', 'claude', 'gemini')
     * @returns {string} モデル名（取得失敗時は空文字）
     */
    static extract(aiType) {
        const extractor = new ModelExtractorImpl(aiType);
        return extractor.extract();
    }
}

// デフォルトエクスポート（後方互換性のため）
export default ModelExtractor;