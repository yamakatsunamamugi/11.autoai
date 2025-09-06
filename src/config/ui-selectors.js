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
            '[data-testid="composer-plus-btn"]',  // 最新のセレクタ（最優先）
            '[data-testid="input-menu-trigger"]',
            '[aria-label="Add"]',
            'button[aria-label*="Add"]'
        ],
        
        // 機能ボタン（common-ai-handler.js用の別名）
        FUNCTION_BUTTON: [
            '[data-testid="composer-plus-btn"]',  // 最新のセレクタ（最優先）
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
            SUBMENU_TRIGGERS: [
                '[data-has-submenu]',  // レガシーモデル用
                '[aria-haspopup="menu"]',  // 標準的なサブメニュー
                '[aria-expanded]',  // 展開可能な項目
                'div:contains("レガシーモデル")',  // レガシーモデル専用
                'div:contains("さらに表示")'  // 機能「さらに表示」専用
            ]
        },
        
        // ポッパーコンテナ（RadixUI）
        POPPER_CONTAINER: ['[data-radix-popper-content-wrapper]'],
        
        // メニューアイテム（拡張）- Deep Research等のラジオボタン機能に必要
        MENU_ITEM: [
            '[role="option"]',
            '[role="menuitem"]',
            '[role="menuitemradio"]'  // ラジオボタン機能（Deep Research、エージェントモード等）に必要
        ],
        
        // 応答/レスポンス
        RESPONSE: [
            'div[data-message-author-role="assistant"]:last-child .markdown.prose',
            'div[data-message-author-role="assistant"]:last-child .markdown',
            '[data-message-author-role="assistant"]:last-child .prose',
            '[data-message-author-role="assistant"]',
            '.text-message[data-message-author-role="assistant"]',
            'div[data-message-author-role="assistant"]',
            '.markdown.prose:last-of-type',
            '.prose:last-of-type'
        ],
        
        // モデル情報取得
        MODEL_INFO: {
            BUTTON: [
                'button[data-testid="model-switcher-dropdown-button"]',  // 最優先：現在確認済み
                'button[aria-label*="モデル"]',
                'button[aria-label*="Model"]',
                'button[class*="model"]',
                '[data-testid*="model-switcher"]'
            ],
            TEXT_ELEMENT: [
                'button[data-testid="model-switcher-dropdown-button"] div',  // ボタン内のdiv
                'button[data-testid="model-switcher-dropdown-button"] span',  // ボタン内のspan（フォールバック）
                '[data-testid="model-switcher-dropdown-button"] .text-sm',  // 小さいテキスト
                '[data-testid="model-switcher-dropdown-button"] *'  // ボタン内の全要素（最終手段）
            ]
        },
        
        // テキスト取得用セレクタ（v2用）
        TEXT_EXTRACTION: {
            // アシスタントメッセージコンテナ
            ASSISTANT_MESSAGE: [
                '[data-message-author-role="assistant"]',
                'div[class*="agent-turn"]',
                'div[class*="model-response"]',
                'article[class*="message"]',
                'div[class*="chat-message"]'
            ],
            // メッセージ内のテキストコンテンツ
            MESSAGE_CONTENT: [
                'div.markdown.prose',
                'div.markdown',
                'div[class*="markdown"]',
                'div.text-base',
                'div[class*="text-message"]',
                'div[class*="prose"]'
            ],
            // Canvas/Artifact機能の内容（2024-12-05更新: Canvas対応強化）
            CANVAS_ARTIFACT: [
                // パターン1: prosemirror-editor-container内のCanvas（最優先）
                '#prosemirror-editor-container .ProseMirror[contenteditable="false"]',
                '#prosemirror-editor-container .ProseMirror',
                'div#prosemirror-editor-container .markdown.prose',
                
                // パターン2: _main_5jn6z_1クラスを持つCanvas
                'div._main_5jn6z_1.markdown.prose.ProseMirror',
                'div._main_5jn6z_1.ProseMirror',
                
                // パターン3: サイドパネル型Canvas（一般的なセレクタ）
                '.ProseMirror[contenteditable="false"]',
                'div.markdown.prose.ProseMirror[contenteditable="false"]',
                '[contenteditable="false"].markdown.prose',
                
                // パターン4: インライン型Canvas
                'div.markdown.prose:not([data-message-author-role])',
                
                // 既存のセレクタ（互換性のため残す）
                '#canvas-content',
                '[data-testid="canvas-content"]',
                'div[class*="canvas"]',
                'div[class*="artifact"]'
            ]
        }
    },
    
    // ========================================
    // Claude セレクタ（test-claude-response-final.js 実証済み）
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
        
        // 送信ボタン（test-claude-response-final.js 実証済み）
        SEND_BUTTON: [
            'button[aria-label="メッセージを送信"]',  // 最優先：統合テストで実証済み
            '[aria-label="メッセージを送信"]',
            'button[type="submit"]',
            '.send-button',
            'button[aria-label*="送信"]',
            'button:has(svg)',
            'button[data-testid*="send"]'
        ],
        
        // 停止ボタン（test-claude-response-final.js 実証済み）
        STOP_BUTTON: [
            'button[aria-label="応答を停止"]',  // 最優先：統合テストで実証済み
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
            '[data-testid="input-menu-tools"]',  // 最新のセレクタ
            '#input-tools-menu-trigger',
            '[aria-label="ツールメニューを開く"]',
            '[data-testid="input-menu-trigger"]',  // フォールバック
            'button[aria-label*="機能"]'
        ],
        
        // 機能ボタン（common-ai-handler.js用の別名）
        FUNCTION_BUTTON: [
            '[data-testid="input-menu-tools"]',  // 最新のセレクタ
            '#input-tools-menu-trigger',
            '[aria-label="ツールメニューを開く"]',
            '[data-testid="input-menu-trigger"]',  // フォールバック
            'button[aria-label*="機能"]'
        ],
        
        // メッセージ（実際のDOM構造に基づく）
        MESSAGE: [
            '.grid-cols-1.grid',  // 最優先：実際のClaude応答DOM構造
            'div[class*="grid-cols-1"][class*="grid"]',  // 属性版（より安全）
            '.font-claude-message',  // 旧版（フォールバック）
            '[data-is-streaming="false"]',
            'div[class*="font-claude-message"]',
            '.group.relative.-tracking-\\[0\\.015em\\]'
        ],
        
        // 思考プロセス除外用セレクタ（test-claude-response-final.js より移植）
        THINKING_PROCESS: {
            // 思考プロセスを示すテキストパターン
            TEXT_PATTERNS: [
                '思考プロセス',
                'Analyzed',
                'Pondered', 
                'Thought',
                'Considered',
                'Evaluated',
                'Reviewed'
            ],
            
            // 思考プロセス関連要素のセレクタ
            ELEMENTS: [
                'button:has(.tabular-nums)',  // 時間表示を含むボタン
                'svg path[d*="M10.3857 2.50977"]',  // タイマーアイコン（時計SVG）
                '.tabular-nums'  // 時間表示クラス
            ],
            
            // 削除対象の親要素クラス
            PARENT_CLASSES: [
                'rounded-lg',
                'border-0.5', 
                'transition-all',
                'my-3'
            ]
        },
        
        // DeepResearchボタン（Claude特有）
        DEEP_RESEARCH_BUTTON: [
            'button:has-text("リサーチ")',
            'button[aria-pressed]',
            'button:contains("リサーチ")'
        ],
        
        // 機能ボタンのSVGパス（機能選択後の確認用）
        FEATURE_BUTTON_SVG: {
            // じっくり考える機能のSVGパス
            DEEP_THINKING: 'M10.3857 2.50977',
            // リサーチ/Web検索機能のSVGパス
            RESEARCH: 'M8.5 2C12.0899'
        },
        
        // 機能ボタンセレクタ（機能選択後の確認用）
        FEATURE_BUTTONS: {
            // じっくり考える機能のボタン
            DEEP_THINKING: [
                'button[type="button"][aria-pressed="true"]:has(svg path[d*="M10.3857 2.50977"])',
                'button[aria-pressed="true"]:has(svg path[d*="M10.3857"])',
                'button.text-accent-secondary-100[aria-pressed="true"]'
            ],
            // リサーチ機能のボタン（Web検索/Deep Research）
            RESEARCH: [
                'button[type="button"][aria-pressed]:has(svg path[d*="M8.5 2C12.0899"])',
                'button[aria-pressed]:has(svg path[d*="M8.5 2"])',
                'button:has(svg path[d*="M8.5"]):has(p:contains("リサーチ"))',
                'button.text-accent-secondary-100[aria-pressed="true"]:has(svg)',
                'button.text-text-300[aria-pressed="false"]:has(svg)'  // 非アクティブ時
            ],
            // 汎用（任意のaria-pressed="true"ボタン）
            ANY_ACTIVE: [
                'button[type="button"][aria-pressed="true"]',
                'button[aria-pressed="true"]'
            ]
        },
        
        // プレビューボタン
        PREVIEW_BUTTON: [
            'button[aria-label="内容をプレビュー"]'
        ],
        
        // 応答/レスポンス（実際のDOM構造に基づく）
        RESPONSE: [
            '.grid-cols-1.grid',  // 最優先：実際のClaude応答DOM構造
            'div[class*="grid-cols-1"][class*="grid"]',  // 属性版（より安全）
            '.font-claude-message',  // 旧版（フォールバック）
            '[data-is-streaming="false"]',
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
            '[role="menuitem"]',
            '[role="menuitemradio"]'  // ラジオボタン機能（Deep Research、エージェントモード等）に必要
        ],
        
        // Canvas関連（Claude特有）- DeepResearch/Artifacts対応
        CANVAS: {
            CONTAINER: [
                '.grid-cols-1.grid:has(h1)',  // h1を含むgridコンテナ（優先）
                '.grid-cols-1.grid',           // gridコンテナ直接
                '[class*="grid-cols-1"][class*="grid"]',  // クラス部分一致
                'div:has(> h1.text-2xl)',      // 大きなタイトルを持つdiv
                '.overflow-y-auto:has(h1)'     // スクロール可能なArtifacts
            ],
            PREVIEW_TEXT: [
                '.absolute.inset-0'            // プレビューテキスト要素
            ],
            PREVIEW_BUTTON: [
                'button[aria-label="内容をプレビュー"]',  // 日本語版
                'button[aria-label*="プレビュー"]',       // 部分一致
                'button[aria-label*="preview"]',          // 英語版
                'button[aria-label="View content"]'       // 英語版代替
            ],
            // DeepResearch特有の要素
            TITLE: 'h1.text-2xl',
            SECTION: 'h2.text-xl',
            PARAGRAPH: 'p.whitespace-normal, p[class*="whitespace"]'
        },
        
        // モデル情報取得
        MODEL_INFO: {
            BUTTON: [
                'button[data-testid="model-selector-dropdown"]',  // 最優先：現在確認済み
                'button[aria-haspopup="menu"]',  // メニューを開くボタン
                'button.cursor-pointer:has(span.font-medium)',  // モデル表示ボタン
                'button[aria-label*="モデル"]',
                'button[aria-label*="Model"]'
            ],
            TEXT_ELEMENT: [
                'button[data-testid="model-selector-dropdown"] .whitespace-nowrap.tracking-tight.select-none',  // 最優先：特定の要素
                'button[data-testid="model-selector-dropdown"] span',  // ボタン内のspan
                'button[data-testid="model-selector-dropdown"] div',   // ボタン内のdiv（フォールバック）
                'button[aria-haspopup="menu"] .whitespace-nowrap',      // フォールバック用
                'button[aria-haspopup="menu"] span.font-medium'         // フォント中太のspan
            ]
        },
        
        // テキスト取得用セレクタ（v2用）
        TEXT_EXTRACTION: {
            // メッセージコンテナ
            MESSAGE_CONTAINER: [
                '[data-message-author-role="assistant"]',
                'div[class*="assistant-message"]',
                'div[class*="claude-message"]',
                'div[data-testid*="message"]'
            ],
            // メッセージ内のテキストコンテンツ
            MESSAGE_CONTENT: [
                '.standard-markdown',
                'div[class*="markdown"]',
                '.prose',
                'div[class*="text-base"]',
                'div[class*="message-content"]'
            ],
            // 通常処理テキスト（テスト済みセレクタ）
            NORMAL_RESPONSE: [
                '.standard-markdown',
                'div.standard-markdown',
                '.grid.gap-2\\.5.standard-markdown',
                'div.grid-cols-1.standard-markdown',
                '[class*="standard-markdown"]'
            ],
            // Artifact/Canvas機能の内容
            ARTIFACT_CONTENT: [
                '#markdown-artifact',
                '[id*="artifact"]',
                'div[class*="artifact"]',
                '.artifact-content',
                '[data-testid="artifact-content"]',
                'div[class*="canvas"]'
            ],
            // 汎用セレクタ（フォールバック）
            GENERIC_RESPONSE: [
                'div.font-claude-message',
                'div[class*="response"]',
                'article[class*="message"]',
                'div.conversation-turn'
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
            // 新しいGemini停止ボタンセレクタ（最優先）
            'div.blue-circle.stop-icon',
            'div.stop-icon mat-icon[data-mat-icon-name="stop"]',
            '.blue-circle.stop-icon',
            
            // 従来のセレクタ
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
            ],
            RESPONSE: [
                '#extended-response-markdown-content',
                '.extended-response-markdown-content',
                '[id="extended-response-markdown-content"]',
                'div[id="extended-response-markdown-content"]',
                '.markdown.markdown-main-panel'
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
        },
        
        // モデル情報取得
        MODEL_INFO: {
            BUTTON: [
                '.logo-pill-label-container',  // モデルラベルコンテナ
                'button[aria-label*="モデル"]',
                'button[aria-label*="Model"]',
                '.model-selector-button',
                '[data-testid*="model"]'
            ],
            TEXT_ELEMENT: [
                '.logo-pill-label-container span',  // 最優先：現在確認済み
                '.logo-pill-label-container .model-name',  // モデル名要素
                '.logo-pill-label-container div',   // コンテナ内のdiv
                '.model-indicator span',            // モデルインジケーター
                '[class*="model-"] span'            // モデル関連クラス内のspan
            ]
        },
        
        // テキスト取得用セレクタ（v2用）
        TEXT_EXTRACTION: {
            // DeepResearch結果
            DEEP_RESEARCH: [
                '#extended-response-markdown-content',
                '.extended-response-markdown-content',
                '[id="extended-response-markdown-content"]',
                'div[id="extended-response-markdown-content"]',
                '.markdown.markdown-main-panel',
                'div[class*="deep-research"]',
                'div[class*="research-result"]'
            ],
            // メッセージコンテナ
            MESSAGE_CONTAINER: [
                '.model-response-text',
                'div[class*="model-response"]',
                '.message-content',
                'div[class*="gemini-response"]',
                'div[class*="assistant-message"]'
            ],
            // メッセージ内容（markdown）
            MESSAGE_CONTENT: [
                '.markdown',
                'div[class*="markdown"]',
                '.prose',
                'div[class*="text-base"]'
            ],
            // 通常処理テキスト（テスト済みセレクタ）
            NORMAL_RESPONSE: [
                '.model-response-text .markdown',
                '.model-response-text',
                '.conversation-turn .markdown',
                'div[class*="model-response"] .markdown'
            ],
            // Canvas/Editor内容
            CANVAS_CONTENT: [
                '.ProseMirror[contenteditable="true"]',
                '.ProseMirror',
                'div[contenteditable="true"]',
                'div[class*="canvas"]',
                'div[class*="code-block"]'
            ],
            // 汎用セレクタ（フォールバック）
            GENERIC_RESPONSE: [
                'div[data-message-role="model"]',
                'div[class*="message"][class*="assistant"]',
                'article[class*="response"]',
                'section[class*="output"]'
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
 * Claude思考プロセス要素を検出・削除するヘルパー関数
 * test-claude-response-final.js のロジックを移植
 * @param {Element} element - 検査対象の要素
 * @returns {Element} 思考プロセスが削除された要素のクローン
 */
export function removeClaudeThinkingProcess(element) {
    if (!element) return null;
    
    // 要素をクローンして元の要素を変更しないようにする
    const clone = element.cloneNode(true);
    
    // 思考プロセスボタンを含む要素を削除
    const allButtons = clone.querySelectorAll('button');
    const thinkingPatterns = UI_SELECTORS.Claude.THINKING_PROCESS.TEXT_PATTERNS;
    const parentClasses = UI_SELECTORS.Claude.THINKING_PROCESS.PARENT_CLASSES;
    
    let removedCount = 0;
    
    allButtons.forEach(btn => {
        const text = btn.textContent || '';
        
        // 思考プロセスを示すテキストパターンをチェック
        const isThinkingButton = 
            thinkingPatterns.some(pattern => text.includes(pattern)) ||
            // タイマーアイコン（時計SVG）を含むボタンも思考プロセス
            btn.querySelector('svg path[d*="M10.3857 2.50977"]') !== null ||
            // tabular-numsクラス（時間表示）を含むボタン
            btn.querySelector('.tabular-nums') !== null;
        
        if (isThinkingButton) {
            // ボタンの最も外側の親要素を探す
            let elementToRemove = btn;
            let parent = btn.parentElement;
            
            // 指定されたクラスを持つ親要素まで遡る
            while (parent) {
                if (parent.classList && parentClasses.some(cls => parent.classList.contains(cls))) {
                    elementToRemove = parent;
                    parent = parent.parentElement;
                } else {
                    break;
                }
            }
            
            console.debug(`削除: 思考プロセス要素 "${text.substring(0, 50)}..."`);
            elementToRemove.remove();
            removedCount++;
        }
    });
    
    console.debug(`削除した思考プロセス要素: ${removedCount}個`);
    return clone;
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

// Chrome拡張機能の注入スクリプトコンテキストで利用可能にする
if (typeof window !== 'undefined') {
    window.UI_SELECTORS = UI_SELECTORS;
}