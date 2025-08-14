/**
 * Claude用アダプタ
 * ClaudeAutomationクラスをラップして統一インターフェースを提供
 */
class ClaudeAdapter extends AIDetectorInterface {
    constructor() {
        super();
        this.name = 'Claude';
        this.automation = null;
    }

    /**
     * ClaudeAutomationのインスタンスを初期化
     */
    async initialize() {
        this.log('初期化中...', 'info');
        
        // 既存のインスタンスを使用するか、新規作成
        if (window.claudeAutomation) {
            this.automation = window.claudeAutomation;
            this.log('既存のインスタンスを使用', 'success');
        } else if (window.ClaudeAutomation) {
            this.log('新しいインスタンスを作成', 'info');
            this.automation = new window.ClaudeAutomation();
            window.claudeAutomation = this.automation;
            this.log('インスタンス作成完了', 'success');
        } else {
            throw new Error('ClaudeAutomationクラスが見つかりません');
        }
    }

    /**
     * 利用可能なモデルを検出
     */
    async detectModels() {
        if (!this.automation) {
            throw new Error('Claude automation not initialized');
        }

        try {
            this.log('モデルを検出中...', 'info');
            
            // ClaudeResearchDetectorが利用可能な場合は使用
            if (window.ClaudeResearchDetector) {
                this.log('ClaudeResearchDetectorを使用してモデルを検出', 'info');
                const result = await window.ClaudeResearchDetector.executeResearch();
                
                if (result.success && result.data.models.length > 0) {
                    const models = result.data.models.map(m => ({
                        name: m.name,
                        description: m.description,
                        selected: false // 現在選択中のモデルは別途判定が必要
                    }));
                    
                    // 追加モデルも含める
                    if (result.data.additionalModels && result.data.additionalModels.length > 0) {
                        result.data.additionalModels.forEach(m => {
                            models.push({
                                name: m.name,
                                selected: false,
                                additional: true
                            });
                        });
                    }
                    
                    this.log(`${models.length}個のモデルを検出（リサーチ機能使用）`, 'success');
                    models.forEach(model => {
                        const status = model.selected ? ' [選択中]' : '';
                        const additional = model.additional ? ' (追加モデル)' : '';
                        this.log(`  • ${model.name}${status}${additional}`, 'info');
                    });
                    return models;
                }
            }
            
            // ClaudeAutomationのgetAvailableModelsメソッドを使用
            let models = [];
            if (typeof this.automation.getAvailableModels === 'function') {
                models = await this.automation.getAvailableModels();
            } else {
                // フォールバック: 基本的なモデルリスト
                this.log('getAvailableModelsが未実装のため、デフォルトモデルを使用', 'warning');
                models = [
                    { name: 'Claude 3.5 Sonnet', selected: true },
                    { name: 'Claude 3 Opus', selected: false },
                    { name: 'Claude 3 Haiku', selected: false }
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
     */
    async detectFunctions() {
        if (!this.automation) {
            throw new Error('Claude automation not initialized');
        }

        try {
            this.log('機能を検出中...', 'info');
            
            // ClaudeResearchDetectorが利用可能な場合は使用
            if (window.ClaudeResearchDetector) {
                this.log('ClaudeResearchDetectorを使用して機能を検出', 'info');
                const storedData = window.ClaudeResearchDetector.getStoredData();
                
                if (storedData && storedData.features && storedData.features.length > 0) {
                    const functions = storedData.features.map(f => ({
                        name: f.name,
                        active: f.enabled,
                        type: f.type,
                        connected: f.connected
                    }));
                    
                    // DeepResearch機能の状態も追加
                    if (storedData.deepResearch) {
                        functions.push({
                            name: 'DeepResearch',
                            active: storedData.deepResearch.activated,
                            available: storedData.deepResearch.available,
                            type: 'research',
                            searchMode: storedData.deepResearch.searchModeAvailable,
                            researchButton: storedData.deepResearch.researchButtonAvailable
                        });
                    }
                    
                    this.log(`${functions.length}個の機能を検出（リサーチ機能使用）`, 'success');
                    functions.forEach(func => {
                        const status = func.active ? ' [有効]' : '';
                        const connected = func.connected ? ' [連携済]' : '';
                        const available = func.available === false ? ' [利用不可]' : '';
                        this.log(`  • ${func.name}${status}${connected}${available}`, 'info');
                    });
                    return functions;
                }
            }
            
            // ClaudeAutomationのgetAvailableFunctionsメソッドを使用
            let functions = [];
            if (typeof this.automation.getAvailableFunctions === 'function') {
                functions = await this.automation.getAvailableFunctions();
            } else {
                // フォールバック: 基本的な機能リスト
                this.log('getAvailableFunctionsが未実装のため、デフォルト機能を使用', 'warning');
                functions = [
                    { name: 'Artifacts', active: true },
                    { name: 'Projects', active: false },
                    { name: 'Knowledge', active: false }
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
            // Claudeページが開いているか確認
            const url = window.location.href;
            const isConnected = url.includes('claude.ai');
            
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
window.ClaudeAdapter = ClaudeAdapter;