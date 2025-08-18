/**
 * @fileoverview 11.autoai UI セレクタ集中管理
 * 
 * 【役割】
 * 全AI（ChatGPT、Claude、Gemini、Genspark）のUIセレクタを一元管理
 * 
 * 【使用方法】
 * import { UI_SELECTORS } from './src/config/ui-selectors.js';
 * const selectors = UI_SELECTORS.ChatGPT.INPUT;
 * 
 * 【使用者】
 * - common-ai-handler.js: getSelectors関数経由で使用
 * - 各AI個別ファイル: window.AIHandler経由で使用
 * - deepresearch-handler.js: DeepResearch用セレクタを使用
 * 
 * 【更新履歴】
 * - 2025-08-17: 参考コードから最新セレクタを反映
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
            '#composer-submit-button',
            '[aria-label="プロンプトを送信する"]',
            '[aria-label="Send prompt"]',
            '[aria-label*="送信"]',
            'button[data-testid="composer-send-button"]',
            'button[class*="send"]',
            'button[type="submit"]'
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
            '[data-testid="model-switcher-dropdown-button"]',  // 最新のセレクタ（最優先）
            'button[aria-label*="モデル"]',
            'button[aria-label*="Model"]',
            '[aria-label="Model selector"]',
            'button[aria-haspopup="menu"]',
            '[data-testid="model-selector"]'  // 古いセレクタ（フォールバック）
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
            CONTAINER: '[data-radix-popper-content-wrapper], [role="menu"][data-state="open"], [data-radix-menu-content], [role="menu"]',  // 最新のセレクタを追加
            ITEM: '[data-testid^="model-switcher-"], [role="menuitem"], [role="menuitemradio"]',  // model-switcherを優先
            POPPER: '[data-radix-popper-content-wrapper]',
            LABEL: '.__menu-label, div:not([role])',
            SUBMENU_ITEM: 'button:has(span)',  // サブメニュー項目（"その他のモデル"など）
        },
        
        // ポッパーコンテナ（RadixUI）
        POPPER_CONTAINER: ['[data-radix-popper-content-wrapper]'],
        
        // 応答/レスポンス
        RESPONSE: [
            '[data-message-author-role="assistant"]',
            '.text-message[data-message-author-role="assistant"]',
            'div[data-message-author-role="assistant"]'
        ]
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
            '[aria-label="メッセージを送信"]',
            'button[type="submit"]',
            '.send-button',
            'button[aria-label*="送信"]',
            'button:has(svg)',
            'button[data-testid*="send"]'
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
            '[data-testid="model-selector-dropdown"]',  // 最新のセレクタ（最優先）
            'button[data-value*="claude"]',  // モデル名を含むボタン
            'button.cursor-pointer:has(span.font-medium)',  // モデル表示ボタン
            'button[aria-label*="モデル"]',
            'button[aria-label*="Model"]',
            '[aria-label="モデルを選択"]',
            'button[aria-haspopup="menu"]',
            '[data-testid="model-selector"]'
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
        
        // プレビューボタン
        PREVIEW_BUTTON: [
            'button[aria-label="内容をプレビュー"]'
        ],
        
        // 応答/レスポンス
        RESPONSE: [
            '[data-is-streaming="false"]',
            '.font-claude-message',
            'div[class*="font-claude-message"]',
            '.group.relative.-tracking-\\[0\\.015em\\]'
        ],
        
        // メニュー関連
        MENU: {
            CONTAINER: '[role="menu"][data-state="open"], [role="menu"]',
            ITEM: '[role="option"], [role="menuitem"]',
            MODEL_ITEM: 'button[role="option"]:has(span)',  // モデル選択用
        },
        
        // メニューアイテム（拡張）
        MENU_ITEM: [
            '[role="option"]',
            '[role="menuitem"]'
        ],
        
        // Canvas関連（Claude特有）
        CANVAS: {
            CONTAINER: [
                '.grid-cols-1.grid h1',  // h1を含むgridコンテナ
                '.grid-cols-1.grid'       // gridコンテナ直接
            ],
            PREVIEW_TEXT: [
                '.absolute.inset-0'       // プレビューテキスト要素
            ]
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
            'button.send-button:not(.stop)',
            '[aria-label="プロンプトを送信"]',
            'button:has(mat-icon[data-mat-icon-name="send"])',
            'button[aria-label*="Send"]',
            '[data-testid="send-button"]',
            'button[type="submit"]'
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
            '.gds-mode-switch-button',  // 最新のGeminiのセレクタ（最優先）
            'button.logo-pill-btn',  // ロゴピルボタン
            'button[mat-flat-button]:has(.logo-pill-label-container)',  // マテリアルボタン
            'button[aria-haspopup="menu"][aria-expanded="false"]',  // 一般的なメニューボタン
            'button:has(.mode-title)',  // モデル名を含むボタン
            'button[aria-label*="モデル"]',
            'button[mattooltip*="モデル"]',
            'button.model-selector-button',
            'button:has(.model-name)',
            '.model-selector'
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
            CONTAINER: '.cdk-overlay-pane, .mat-mdc-menu-panel, .menu-container',  // CDKオーバーレイを優先
            ITEM: '[role="menuitemradio"], [role="menuitem"], .menu-item',  // menuitemradioを優先
            MODEL_ITEM: '[role="menuitemradio"]'  // モデル選択用
        },
        
        // その他のメニューボタン
        MORE_BUTTON: [
            'button[aria-label="その他"]',
            'button[mattooltip="その他"]',
            'button:has(mat-icon[data-mat-icon-name="more_vert"])'
        ],
        
        // メニュートリガー（Material Design）
        MENU_TRIGGER: [
            '.mat-mdc-menu-trigger[aria-expanded="true"]'
        ],
        
        // メニューアイテム（拡張）
        MENU_ITEM: [
            '[role="menuitemradio"]',
            '[role="menuitem"]',
            'button[mat-list-item]',
            '.toolbox-drawer-item-list-button'
        ],
        
        // 機能ボタン（拡張）
        FUNCTION_BUTTON: [
            'button[aria-label="その他"]',
            'button[aria-label*="その他"]',
            'button mat-icon[fonticon="more_horiz"]'
        ],
        
        // 応答/レスポンス
        RESPONSE: [
            '.response-container',
            '.conversation-turn',
            '.message-container',
            '.markdown'
        ],
        
        // ツールボックス関連（Gemini特有）
        TOOLBOX: {
            CONTAINER: [
                '.toolbox-drawer',
                '.toolbox-container'
            ]
        }
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
    },
    
    // ========================================
    // テスト関連セレクタ
    // ========================================
    TEST: {
        // ステータスインジケーター
        STATUS_INDICATOR: [
            '.status-indicator'
        ]
    },
    
    // ========================================
    // Genspark セレクタ（特殊なAI）
    // ========================================
    Genspark: {
        // 停止ボタン
        STOP_BUTTON: [
            '.enter-icon-wrapper[class*="bg-[#232425]"]'
        ],
        
        // モデル選択
        MODEL_BUTTON: [
            '[data-model]',
            '.model-selector',
            'select[name="model"]'
        ],
        
        // メッセージ要素
        MESSAGE: [
            '[class*="message"]',
            '[class*="response"]',
            'div[role="article"]'
        ],
        
        // ボタン全般
        ALL_BUTTONS: [
            'button',
            '[role="button"]'
        ],
        
        // 入力欄
        INPUT: [
            'textarea',
            'input',
            '[contenteditable="true"]'
        ],
        
        // 全要素（診断用）
        ALL_ELEMENTS: [
            '*'
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