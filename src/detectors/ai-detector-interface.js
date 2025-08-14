/**
 * AI検出インターフェース
 * 全AIアダプタの基底クラス
 */
class AIDetectorInterface {
    constructor() {
        this.name = 'Unknown AI';
        this.initialized = false;
    }

    /**
     * アダプタを初期化
     * @returns {Promise<void>}
     */
    async initialize() {
        throw new Error(`${this.name}: initialize() must be implemented`);
    }

    /**
     * 利用可能なモデルを検出
     * @returns {Promise<Array>} モデルのリスト
     */
    async detectModels() {
        throw new Error(`${this.name}: detectModels() must be implemented`);
    }

    /**
     * 利用可能な機能を検出
     * @returns {Promise<Array>} 機能のリスト
     */
    async detectFunctions() {
        throw new Error(`${this.name}: detectFunctions() must be implemented`);
    }

    /**
     * モデルと機能を同時に検出
     * @returns {Promise<Object>} {models, functions}
     */
    async detectAll() {
        try {
            // 初期化されていない場合は初期化
            if (!this.initialized) {
                await this.initialize();
                this.initialized = true;
            }

            // モデルと機能を順番に取得（メニュー操作の干渉を防ぐ）
            this.log('モデルを取得中...', 'info');
            const models = await this.detectModels();
            
            // メニューが閉じるのを待つ
            await new Promise(resolve => setTimeout(resolve, 500));
            
            this.log('機能を取得中...', 'info');
            const functions = await this.detectFunctions();

            return {
                models: models || [],
                functions: functions || [],
                timestamp: new Date().toISOString(),
                aiType: this.name.toLowerCase()
            };
        } catch (error) {
            console.error(`[${this.name}] 検出エラー:`, error);
            throw error;
        }
    }

    /**
     * デバッグログ出力
     * @param {string} message 
     * @param {string} level - 'info', 'success', 'warning', 'error'
     */
    log(message, level = 'info') {
        const styles = {
            info: 'color: #2196F3',
            success: 'color: #4CAF50',
            warning: 'color: #FF9800',
            error: 'color: #F44336'
        };
        console.log(`%c[${this.name}] ${message}`, `${styles[level]}; font-weight: bold`);
    }
}

// エクスポート
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AIDetectorInterface;
}