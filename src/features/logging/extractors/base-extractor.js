/**
 * @fileoverview 基底Extractorクラス
 * 
 * 【役割】
 * 各AI（ChatGPT、Claude、Gemini）の情報抽出に共通する処理を提供
 * 
 * 【主要機能】
 * - DOM要素からのクリーンなテキスト取得
 * - エラーハンドリング
 * - デバッグログ出力
 */

export class BaseExtractor {
    /**
     * コンストラクタ
     * @param {string} aiType - AI種別 ('ChatGPT', 'Claude', 'Gemini')
     */
    constructor(aiType) {
        this.aiType = aiType;
    }
    
    /**
     * DOM要素からクリーンなテキストを取得
     * @param {Element} element - テキストを取得する要素
     * @returns {string} クリーンなテキスト
     */
    getCleanText(element) {
        if (!element) return '';
        
        try {
            // 要素のクローンを作成（元の要素を変更しないため）
            const clone = element.cloneNode(true);
            
            // 不要な要素を削除
            const unwantedSelectors = [
                'mat-icon',                        // Material Designアイコン
                '.mat-ripple',                     // リップル効果
                '.mat-mdc-button-persistent-ripple', // MDCボタンのリップル
                '.mat-focus-indicator',            // フォーカスインジケーター
                '.mat-mdc-button-touch-target',    // タッチターゲット
                '.cdk-visually-hidden',            // 視覚的に隠された要素
                '[aria-hidden="true"]'             // aria-hiddenな要素
            ].join(', ');
            
            clone.querySelectorAll(unwantedSelectors).forEach(el => el.remove());
            
            // テキストを取得して余分な空白を削除
            return clone.textContent.trim().replace(/\s+/g, ' ');
        } catch (e) {
            // エラー時はフォールバック：そのままテキストを取得
            console.warn(`[${this.aiType}][BaseExtractor] クローン処理エラー、フォールバック使用:`, e);
            return element.textContent?.trim().replace(/\s+/g, ' ') || '';
        }
    }
    
    /**
     * セレクタ配列から最初に見つかった要素を取得
     * @param {string[]} selectors - セレクタの配列
     * @returns {Element|null} 見つかった要素またはnull
     */
    findElement(selectors) {
        for (const selector of selectors) {
            const element = document.querySelector(selector);
            if (element) {
                return element;
            }
        }
        return null;
    }
    
    /**
     * デバッグ情報をログ出力
     * @param {string} message - ログメッセージ
     * @param {Object} data - 追加データ
     */
    log(message, data = {}) {
        console.log(`[${this.aiType}][${this.constructor.name}] ${message}`, data);
    }
    
    /**
     * 警告をログ出力
     * @param {string} message - 警告メッセージ
     * @param {Object} data - 追加データ
     */
    warn(message, data = {}) {
        console.warn(`[${this.aiType}][${this.constructor.name}] ⚠️ ${message}`, data);
    }
    
    /**
     * エラーをログ出力
     * @param {string} message - エラーメッセージ
     * @param {Error} error - エラーオブジェクト
     * @param {Object} data - 追加データ
     */
    error(message, error, data = {}) {
        console.error(`[${this.aiType}][${this.constructor.name}] ❌ ${message}`, {
            error: error.message,
            stack: error.stack,
            ...data
        });
    }
    
    /**
     * 抽出メソッド（サブクラスで実装）
     * @returns {string} 抽出結果
     */
    extract() {
        throw new Error('extract() メソッドはサブクラスで実装してください');
    }
}

// デフォルトエクスポート
export default BaseExtractor;