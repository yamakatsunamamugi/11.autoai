/**
 * @fileoverview 11.autoai モデル情報取得モジュール
 * 
 * 【役割】
 * 各AI（ChatGPT、Claude、Gemini）から現在のモデル情報を取得
 * UI変更に対応しやすいよう、UI_SELECTORSを使用してモジュール化
 * 
 * 【使用方法】
 * import { ModelInfoExtractor } from './src/utils/model-info-extractor.js';
 * const modelInfo = ModelInfoExtractor.extract('chatgpt');
 * 
 * 【特徴】
 * - UI_SELECTORSとの連携により、UIセレクタの変更に自動対応
 * - デバッグ情報の詳細出力
 * - フォールバック機能による堅牢性
 * - 各AI固有の処理ロジック
 */

import { UI_SELECTORS } from '../config/ui-selectors.js';

export class ModelInfoExtractor {
    
    /**
     * 指定されたAI種別からモデル情報を取得
     * @param {string} aiType - AI種別 ('chatgpt', 'claude', 'gemini')
     * @returns {string} モデル名（取得失敗時は空文字）
     */
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
    
    /**
     * ChatGPTからモデル情報を取得
     * @returns {string} モデル名
     */
    static extractChatGPTModel() {
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
                console.warn(`[ModelInfoExtractor][ChatGPT] ⚠️ モデルボタン要素が見つかりません`);
                console.log(`[ModelInfoExtractor][ChatGPT] 🔍 試行したセレクタ:`, selectors.BUTTON);
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
                console.warn(`[ModelInfoExtractor][ChatGPT] ⚠️ モデルテキストを取得できませんでした`);
                console.log(`[ModelInfoExtractor][ChatGPT] 🔍 ボタン内容:`, buttonElement.textContent);
            }
            
            console.log(`[ModelInfoExtractor][ChatGPT] 🔍 モデル情報取得詳細:`, debugInfo);
            
            if (modelText) {
                console.log(`[ModelInfoExtractor][ChatGPT] ✅ モデル情報取得成功: "${modelText}"`);
            } else {
                console.warn(`[ModelInfoExtractor][ChatGPT] ⚠️ モデル情報を取得できませんでした`);
            }
            
            return modelText;
            
        } catch (error) {
            console.error(`[ModelInfoExtractor][ChatGPT] ❌ モデル情報取得エラー:`, {
                error: error.message,
                stack: error.stack,
                debugInfo
            });
            return '';
        }
    }
    
    /**
     * Claudeからモデル情報を取得
     * @returns {string} モデル名
     */
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
                console.warn(`[ModelInfoExtractor][Claude] ⚠️ モデルボタン要素が見つかりません`);
                console.log(`[ModelInfoExtractor][Claude] 🔍 試行したセレクタ:`, selectors.BUTTON);
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
                console.warn(`[ModelInfoExtractor][Claude] ⚠️ 特定の要素が見つからないため、ボタン全体から抽出: ${buttonText}`);
                
                // "Claude" を除外してモデル名を取得
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
            } else {
                console.warn(`[ModelInfoExtractor][Claude] ⚠️ モデル情報を取得できませんでした`);
            }
            
            return modelText;
            
        } catch (error) {
            console.error(`[ModelInfoExtractor][Claude] ❌ モデル情報取得エラー:`, {
                error: error.message,
                stack: error.stack,
                debugInfo
            });
            return '';
        }
    }
    
    /**
     * Geminiからモデル情報を取得
     * @returns {string} モデル名
     */
    static extractGeminiModel() {
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
                    // getCleanText関数と同様の処理を実装
                    const rawText = textElement.textContent.trim();
                    
                    if (rawText) {
                        // コンテナ要素の場合、不要な要素を除外してテキストを取得
                        if (selector === '.logo-pill-label-container' || 
                            selector.includes('.gds-mode-switch-button')) {
                            // クローンを作成して不要な要素を削除
                            const clone = textElement.cloneNode(true);
                            // mat-iconやその他の不要な要素を削除
                            const unwantedElements = clone.querySelectorAll(
                                'mat-icon, .mat-ripple, .mat-mdc-button-persistent-ripple, ' +
                                '.mat-focus-indicator, .mat-mdc-button-touch-target, .cdk-visually-hidden'
                            );
                            unwantedElements.forEach(el => el.remove());
                            modelText = clone.textContent.trim().replace(/\s+/g, ' ');
                        } else {
                            modelText = rawText;
                        }
                        
                        if (modelText) {
                            debugInfo.selectorFound = true;
                            debugInfo.elementContent = rawText;
                            debugInfo.extractedModel = modelText;
                            debugInfo.selector = selector;
                            break;
                        }
                    }
                }
            }
            
            if (!modelText) {
                console.warn(`[ModelInfoExtractor][Gemini] ⚠️ モデルラベル要素が見つかりません`);
                console.log(`[ModelInfoExtractor][Gemini] 🔍 試行したセレクタ:`, selectors.TEXT_ELEMENT);
            }
            
            console.log(`[ModelInfoExtractor][Gemini] 🔍 モデル情報取得詳細:`, debugInfo);
            
            if (modelText) {
                console.log(`[ModelInfoExtractor][Gemini] ✅ モデル情報取得成功: "${modelText}"`);
            } else {
                console.warn(`[ModelInfoExtractor][Gemini] ⚠️ モデル情報を取得できませんでした`);
            }
            
            return modelText;
            
        } catch (error) {
            console.error(`[ModelInfoExtractor][Gemini] ❌ モデル情報取得エラー:`, {
                error: error.message,
                stack: error.stack,
                debugInfo
            });
            return '';
        }
    }
}

// デフォルトエクスポート（後方互換性のため）
export default ModelInfoExtractor;