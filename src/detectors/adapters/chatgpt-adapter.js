/**
 * ChatGPT用アダプタ
 * ChatGPTAutomationクラスをラップして統一インターフェースを提供
 */
class ChatGPTAdapter extends AIDetectorInterface {
    constructor() {
        super();
        this.name = 'ChatGPT';
        this.automation = null;
    }

    /**
     * ChatGPTAutomationのインスタンスを初期化
     */
    async initialize() {
        this.log('初期化中...', 'info');
        
        // window.chatgptAutomationは既にインスタンス（関数のオブジェクト）
        if (window.chatgptAutomation) {
            this.automation = window.chatgptAutomation;
            this.log('既存のchatgptAutomationインスタンスを使用', 'success');
        } 
        // window.ChatGPTAutomationはオブジェクト（クラスではない）
        else if (window.ChatGPTAutomation) {
            this.automation = window.ChatGPTAutomation;
            this.log('ChatGPTAutomationオブジェクトを使用', 'success');
        } else {
            throw new Error('ChatGPTAutomationが見つかりません');
        }
    }

    /**
     * 利用可能なモデルを検出
     * レガシーモデルのサブメニューも含めて取得
     */
    async detectModels() {
        if (!this.automation) {
            throw new Error('ChatGPT automation not initialized');
        }

        try {
            this.log('モデルを検出中...', 'info');
            const models = await this.automation.getAvailableModels();
            
            if (models && models.length > 0) {
                this.log(`${models.length}個のモデルを検出`, 'success');
                
                // デバッグ: 詳細情報を出力
                models.forEach(model => {
                    const status = model.selected ? ' [選択中]' : '';
                    const location = model.location === 'legacy-submenu' ? ' (レガシー)' : '';
                    this.log(`  • ${model.name}${status}${location}`, 'info');
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
     * 「さらに表示」サブメニューも含めて取得
     */
    async detectFunctions() {
        if (!this.automation) {
            throw new Error('ChatGPT automation not initialized');
        }

        try {
            this.log('機能を検出中...', 'info');
            const functions = await this.automation.getAvailableFunctions();
            
            if (functions && functions.length > 0) {
                this.log(`${functions.length}個の機能を検出`, 'success');
                
                // デバッグ: 詳細情報を出力
                functions.forEach(func => {
                    const status = func.active ? ' [有効]' : '';
                    const location = func.location === 'submenu' ? ' (サブメニュー)' : '';
                    this.log(`  • ${func.name}${status}${location}`, 'info');
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
            // ChatGPTページが開いているか確認
            const url = window.location.href;
            const isConnected = url.includes('chatgpt.com') || url.includes('chat.openai.com');
            
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
window.ChatGPTAdapter = ChatGPTAdapter;