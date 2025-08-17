/**
 * @fileoverview 11.autoai UI セレクタ集中管理
 * 全AI（ChatGPT、Claude、Gemini）のUIセレクタを一元管理
 * 
 * 使用方法:
 * import { UI_SELECTORS } from './src/config/ui-selectors.js';
 * const selectors = UI_SELECTORS.ChatGPT.INPUT;
 */

export const UI_SELECTORS = {
    // ========================================
    // ChatGPT セレクタ
    // ========================================
    ChatGPT: {
        // テキスト入力欄
        INPUT: [
            '#prompt-textarea',
            '[contenteditable="true"]',
            '.ProseMirror',
            'div[contenteditable="true"]',
            'textarea[data-testid="conversation-textarea"]',
            'textarea[placeholder*="メッセージ"]',
            'textarea'
        ],
        
        // 送信ボタン
        SEND_BUTTON: [
            '[data-testid="send-button"]',
            '[aria-label="Send prompt"]',
            '[aria-label="プロンプトを送信する"]',
            'button[type="submit"]',
            'button[class*="send"]'
        ],
        
        // 停止ボタン
        STOP_BUTTON: [
            '[data-testid="stop-button"]',
            '[aria-label="ストリーミングの停止"]',
            '#composer-submit-button[aria-label*="停止"]',
            '[aria-label="Stop generating"]',
            '[aria-label="Stop"]',
            'button[aria-label*="Stop"]',
            'button[aria-label*="stop"]',
            '[data-testid="composer-moderation-stop-button"]'
        ],
        
        // モデル選択
        MODEL_BUTTON: [
            '[aria-label="Model selector"]',
            '[data-testid="model-selector"]',
            'button[aria-haspopup="menu"]'
        ],
        
        // 機能メニュー
        FUNCTION_MENU_BUTTON: [
            '[data-testid="input-menu-trigger"]',
            '[aria-label="Add"]',
            'button[aria-label*="Add"]'
        ],
        
        // メッセージ
        MESSAGE: [
            '[data-message-author-role="assistant"]',
            '.message-content',
            '.assistant-message'
        ],
        
        // メニュー関連
        MENU: {
            CONTAINER: '[role="menu"]',
            ITEM: '[role="menuitem"], [role="menuitemradio"]',
            POPPER: '[data-radix-popper-content-wrapper]',
            LABEL: '.__menu-label, div:not([role])'
        }
    },
    
    // ========================================
    // Claude セレクタ
    // ========================================
    Claude: {
        // テキスト入力欄
        INPUT: [
            '.ProseMirror[contenteditable="true"]',
            'div[contenteditable="true"][role="textbox"]',
            '[aria-label*="プロンプト"]',
            'div[contenteditable="true"]',
            'textarea[placeholder*="メッセージ"]'
        ],
        
        // 送信ボタン
        SEND_BUTTON: [
            '[aria-label="メッセージを送信"]:not([disabled])',
            'button[type="submit"]:not([disabled])',
            '.send-button:not([disabled])'
        ],
        
        // 停止ボタン
        STOP_BUTTON: [
            '[aria-label="応答を停止"]',
            '[aria-label="Stop generating"]',
            '[data-testid="stop-button"]',
            'button[aria-label*="stop"]',
            'button[aria-label*="Stop"]'
        ],
        
        // モデル選択
        MODEL_BUTTON: [
            '[aria-label="モデルを選択"]',
            '[data-testid="model-selector"]',
            'button[aria-haspopup="menu"]'
        ],
        
        // 機能メニュー
        FUNCTION_MENU_BUTTON: [
            '[data-testid="input-menu-trigger"]',
            'button[aria-label*="機能"]'
        ],
        
        // メッセージ
        MESSAGE: [
            '[data-is-streaming="false"]',
            '.font-claude-message',
            'div[class*="font-claude-message"]',
            '.group.relative.-tracking-\\[0\\.015em\\]'
        ],
        
        // DeepResearchボタン（Claude特有）
        DEEP_RESEARCH_BUTTON: [
            'button:has-text("リサーチ")',
            'button[aria-pressed]',
            'button:contains("リサーチ")'
        ],
        
        // メニュー関連
        MENU: {
            CONTAINER: '[role="menu"][data-state="open"], [role="menu"]',
            ITEM: '[role="option"], [role="menuitem"]'
        }
    },
    
    // ========================================
    // Gemini セレクタ
    // ========================================
    Gemini: {
        // テキスト入力欄
        INPUT: [
            '.ql-editor.new-input-ui[contenteditable="true"]',
            '.ql-editor[contenteditable="true"]',
            'div.ql-editor.textarea',
            '[contenteditable="true"][role="textbox"]',
            'rich-textarea .ql-editor'
        ],
        
        // 送信ボタン
        SEND_BUTTON: [
            'button[aria-label="送信"]',
            'button[mattooltip="送信"]',
            '.send-button-container button',
            'button.send-button:not(.stop)'
        ],
        
        // 停止ボタン
        STOP_BUTTON: [
            'button[aria-label="回答を停止"]',
            'button.send-button.stop',
            'button.stop',
            '.stop-icon',
            'mat-icon[data-mat-icon-name="stop"]',
            '[aria-label="Stop response"]',
            'button[aria-label*="停止"]',
            'button[aria-label*="stop"]',
            '.stop-button'
        ],
        
        // モデル選択
        MODEL_BUTTON: [
            'button.model-selector-button',
            '[aria-label*="モデル"]',
            'button:has(.model-name)'
        ],
        
        // 機能ボタン（Gemini特有）
        FUNCTION_BUTTONS: {
            DEEP_THINK: [
                'button:has-text("Deep Think")',
                'button[aria-label*="Deep Think"]'
            ],
            IMAGE: [
                'button:has(mat-icon[data-mat-icon-name="image"])',
                'button[mattooltip*="画像"]'
            ],
            VIDEO: [
                'button:has(mat-icon[data-mat-icon-name="smart_display"])',
                'button[mattooltip*="動画"]'
            ]
        },
        
        // DeepResearch関連（Gemini特有）
        DEEP_RESEARCH: {
            BUTTON: [
                'button[aria-label="リサーチを開始"]',
                'button[data-test-id="confirm-button"][aria-label="リサーチを開始"]',
                'button:contains("リサーチを開始")',
                'button[aria-label*="リサーチ"]',
                'button[class*="research"]'
            ]
        },
        
        // メッセージ
        MESSAGE: [
            '.conversation-turn.model-turn',
            '.model-response-text',
            'message-content'
        ],
        
        // メニュー関連
        MENU: {
            BUTTON: 'button.input-area-buttons',
            CONTAINER: '.menu-container',
            ITEM: '.menu-item'
        },
        
        // その他のメニューボタン
        MORE_BUTTON: [
            'button[aria-label="その他"]',
            'button[mattooltip="その他"]',
            'button:has(mat-icon[data-mat-icon-name="more_vert"])'
        ]
    },
    
    // ========================================
    // 共通セレクタ（全AI共通）
    // ========================================
    COMMON: {
        // エラーメッセージ
        ERROR_MESSAGE: [
            '.error-message',
            '[role="alert"]',
            '.alert-danger'
        ],
        
        // ローディングインジケーター
        LOADING: [
            '.loading-spinner',
            '[aria-busy="true"]',
            '.processing-indicator'
        ],
        
        // モーダル/ダイアログ
        MODAL: [
            '[role="dialog"]',
            '.modal',
            '[aria-modal="true"]'
        ]
    }
};

// ========================================
// ヘルパー関数
// ========================================

/**
 * 指定されたAIとセレクタタイプのセレクタ配列を取得
 * @param {string} aiType - 'ChatGPT', 'Claude', 'Gemini'
 * @param {string} selectorType - 'INPUT', 'SEND_BUTTON', 'STOP_BUTTON' など
 * @returns {Array<string>} セレクタの配列
 */
export function getSelectors(aiType, selectorType) {
    const ai = UI_SELECTORS[aiType];
    if (!ai) {
        console.warn(`Unknown AI type: ${aiType}`);
        return [];
    }
    
    const selectors = ai[selectorType];
    if (!selectors) {
        console.warn(`Unknown selector type: ${selectorType} for ${aiType}`);
        return [];
    }
    
    return Array.isArray(selectors) ? selectors : [];
}

/**
 * 複数のセレクタから最初に見つかった要素を取得
 * @param {Array<string>} selectors - セレクタの配列
 * @param {Document} doc - ドキュメントオブジェクト（デフォルト: document）
 * @returns {Element|null} 見つかった要素またはnull
 */
export function findElementBySelectors(selectors, doc = document) {
    for (const selector of selectors) {
        try {
            const element = doc.querySelector(selector);
            if (element) return element;
        } catch (e) {
            // 無効なセレクタは無視
            console.debug(`Invalid selector: ${selector}`);
        }
    }
    return null;
}

/**
 * 複数のセレクタから全ての要素を取得
 * @param {Array<string>} selectors - セレクタの配列
 * @param {Document} doc - ドキュメントオブジェクト（デフォルト: document）
 * @returns {Array<Element>} 見つかった要素の配列
 */
export function findAllElementsBySelectors(selectors, doc = document) {
    const elements = [];
    for (const selector of selectors) {
        try {
            const found = doc.querySelectorAll(selector);
            elements.push(...found);
        } catch (e) {
            // 無効なセレクタは無視
            console.debug(`Invalid selector: ${selector}`);
        }
    }
    return elements;
}

/**
 * AIタイプを自動検出
 * @returns {string|null} 検出されたAIタイプまたはnull
 */
export function detectAIType() {
    const url = window.location.href;
    
    if (url.includes('chatgpt.com') || url.includes('chat.openai.com')) {
        return 'ChatGPT';
    } else if (url.includes('claude.ai')) {
        return 'Claude';
    } else if (url.includes('gemini.google.com')) {
        return 'Gemini';
    }
    
    return null;
}

// デフォルトエクスポート
export default UI_SELECTORS;