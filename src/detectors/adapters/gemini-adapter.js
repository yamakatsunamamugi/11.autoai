/**
 * Gemini用アダプタ
 * GeminiAutomationクラスをラップして統一インターフェースを提供
 */
class GeminiAdapter extends AIDetectorInterface {
    constructor() {
        super();
        this.name = 'Gemini';
        this.automation = null;
    }

    /**
     * GeminiAutomationのインスタンスを初期化
     */
    async initialize() {
        this.log('初期化中...', 'info');
        
        // 既存のインスタンスを使用するか、新規作成
        if (window.geminiAutomation) {
            this.automation = window.geminiAutomation;
            this.log('既存のインスタンスを使用', 'success');
        } else if (window.GeminiAutomation) {
            this.log('新しいインスタンスを作成', 'info');
            this.automation = new window.GeminiAutomation();
            window.geminiAutomation = this.automation;
            this.log('インスタンス作成完了', 'success');
        } else {
            throw new Error('GeminiAutomationクラスが見つかりません');
        }
    }

    /**
     * 利用可能なモデルを検出
     * Geminiでは collectAvailableModels メソッドを使用
     */
    async detectModels() {
        if (!this.automation) {
            throw new Error('Gemini automation not initialized');
        }

        try {
            this.log('モデルを検出中...', 'info');
            
            // GeminiAutomationのcollectAvailableModelsメソッドを使用
            let models = [];
            if (typeof this.automation.collectAvailableModels === 'function') {
                models = await this.automation.collectAvailableModels();
            } else if (typeof this.automation.getAvailableModels === 'function') {
                // フォールバック: getAvailableModelsメソッドを試す
                models = await this.automation.getAvailableModels();
            } else {
                // フォールバック: 基本的なモデルリスト
                this.log('collectAvailableModelsが未実装のため、デフォルトモデルを使用', 'warning');
                models = [
                    { name: 'Gemini 2.0 Flash', selected: true },
                    { name: 'Gemini 1.5 Pro', selected: false },
                    { name: 'Gemini 1.5 Flash', selected: false }
                ];
            }
            
            if (models && models.length > 0) {
                this.log(`${models.length}個のモデルを検出`, 'success');
                models.forEach(model => {
                    const status = model.selected ? ' [選択中]' : '';
                    this.log(`  • ${model.name}${status}`, 'info');
                });
            } else {
                this.log('モデルが見つかりませんでした', 'warning');
            }
            
            return models;
        } catch (error) {
            this.log(`モデル検出エラー: ${error.message}`, 'error');
            throw error;
        }
    }

    /**
     * 利用可能な機能を検出
     * Geminiでは collectAvailableFunctions メソッドを使用
     */
    async detectFunctions() {
        if (!this.automation) {
            throw new Error('Gemini automation not initialized');
        }

        try {
            this.log('機能を検出中...', 'info');
            
            // GeminiAutomationのcollectAvailableFunctionsメソッドを使用
            let functions = [];
            if (typeof this.automation.collectAvailableFunctions === 'function') {
                functions = await this.automation.collectAvailableFunctions();
            } else if (typeof this.automation.getAvailableFunctions === 'function') {
                // フォールバック: getAvailableFunctionsメソッドを試す
                functions = await this.automation.getAvailableFunctions();
            } else {
                // フォールバック: 基本的な機能リスト
                this.log('collectAvailableFunctionsが未実装のため、デフォルト機能を使用', 'warning');
                functions = [
                    { name: 'Google Workspace', active: false },
                    { name: 'Google Maps', active: false },
                    { name: 'Google Flights', active: false },
                    { name: 'Google Hotels', active: false },
                    { name: 'YouTube', active: false }
                ];
            }
            
            if (functions && functions.length > 0) {
                this.log(`${functions.length}個の機能を検出`, 'success');
                functions.forEach(func => {
                    const status = func.active ? ' [有効]' : '';
                    this.log(`  • ${func.name}${status}`, 'info');
                });
            } else {
                this.log('機能が見つかりませんでした', 'warning');
            }
            
            return functions;
        } catch (error) {
            this.log(`機能検出エラー: ${error.message}`, 'error');
            throw error;
        }
    }

    /**
     * 現在の接続状態を確認
     */
    async checkConnection() {
        try {
            // Geminiページが開いているか確認
            const url = window.location.href;
            const isConnected = url.includes('gemini.google.com') || url.includes('bard.google.com');
            
            return {
                connected: isConnected,
                url: url,
                automation: this.automation !== null
            };
        } catch (error) {
            return {
                connected: false,
                error: error.message
            };
        }
    }
}

// グローバルに公開
window.GeminiAdapter = GeminiAdapter;