/**
 * AI検出統合サービス
 * 全AIアダプタを管理し、統一的なインターフェースを提供
 */
class AIDetectorService {
    constructor() {
        this.adapters = {};
        this.initialized = false;
    }

    /**
     * サービスを初期化
     * 必要なスクリプトを読み込み、アダプタを登録
     */
    async initialize() {
        if (this.initialized) {
            console.log('AIDetectorService: 既に初期化済み');
            return;
        }

        console.log('🚀 AIDetectorService: 初期化開始');
        
        try {
            // インターフェースとアダプタを読み込む
            await this.loadDependencies();
            
            // アダプタを登録
            this.registerAdapters();
            
            this.initialized = true;
            console.log('✅ AIDetectorService: 初期化完了');
        } catch (error) {
            console.error('❌ AIDetectorService: 初期化エラー', error);
            throw error;
        }
    }

    /**
     * 依存関係を読み込む
     */
    async loadDependencies() {
        // アダプタが既に読み込まれているか確認
        if (typeof window.ChatGPTAdapter === 'undefined' ||
            typeof window.ClaudeAdapter === 'undefined' ||
            typeof window.GeminiAdapter === 'undefined') {
            
            console.log('📦 AIDetectorService: アダプタをロード中...');
            
            // 必要に応じてスクリプトを動的に読み込む
            // Chrome拡張の場合は、manifest.jsonで事前に読み込まれていることが多い
        }
    }

    /**
     * アダプタを登録
     */
    registerAdapters() {
        console.log('📝 AIDetectorService: アダプタを登録中...');
        
        if (window.ChatGPTAdapter) {
            this.adapters.chatgpt = new window.ChatGPTAdapter();
            console.log('  ✓ ChatGPTAdapter 登録');
        }
        
        if (window.ClaudeAdapter) {
            this.adapters.claude = new window.ClaudeAdapter();
            console.log('  ✓ ClaudeAdapter 登録');
        }
        
        if (window.GeminiAdapter) {
            this.adapters.gemini = new window.GeminiAdapter();
            console.log('  ✓ GeminiAdapter 登録');
        }
    }

    /**
     * 指定されたAIの情報を検出
     * @param {string} aiType - 'chatgpt', 'claude', 'gemini'
     * @returns {Promise<Object>} 検出結果
     */
    async detectAI(aiType) {
        if (!this.initialized) {
            await this.initialize();
        }

        const adapter = this.adapters[aiType];
        if (!adapter) {
            throw new Error(`Unknown AI type: ${aiType}`);
        }

        console.log(`🔍 ${aiType.toUpperCase()} の検出を開始`);
        
        try {
            // アダプタを初期化
            if (!adapter.initialized) {
                await adapter.initialize();
                adapter.initialized = true;
            }

            // モデルと機能を検出
            const result = await adapter.detectAll();
            
            // ストレージに保存
            await this.saveToStorage(aiType, result);
            
            console.log(`✅ ${aiType.toUpperCase()} の検出完了:`, {
                models: result.models.length,
                functions: result.functions.length
            });
            
            return result;
        } catch (error) {
            console.error(`❌ ${aiType.toUpperCase()} の検出エラー:`, error);
            
            // エラー時でも部分的な結果を返す
            return {
                models: [],
                functions: [],
                error: error.message,
                timestamp: new Date().toISOString(),
                aiType: aiType
            };
        }
    }

    /**
     * 全AIの情報を同時に検出
     * @returns {Promise<Object>} 全AIの検出結果
     */
    async detectAllAIs() {
        if (!this.initialized) {
            await this.initialize();
        }

        console.log('🔍 全AIの検出を開始');
        
        const results = {};
        const promises = [];
        
        // 全AIを並列で検出
        for (const aiType of Object.keys(this.adapters)) {
            promises.push(
                this.detectAI(aiType)
                    .then(result => {
                        results[aiType] = result;
                    })
                    .catch(error => {
                        console.error(`${aiType} 検出エラー:`, error);
                        results[aiType] = {
                            models: [],
                            functions: [],
                            error: error.message
                        };
                    })
            );
        }
        
        await Promise.all(promises);
        
        console.log('✅ 全AIの検出完了');
        return results;
    }

    /**
     * 検出結果をストレージに保存
     * @param {string} aiType 
     * @param {Object} data 
     */
    async saveToStorage(aiType, data) {
        return new Promise((resolve) => {
            chrome.storage.local.get(['ai_config_persistence'], (result) => {
                const config = result.ai_config_persistence || {};
                
                // AIタイプごとに保存
                config[aiType] = {
                    models: data.models || [],
                    functions: data.functions || [],
                    lastUpdated: data.timestamp || new Date().toISOString(),
                    error: data.error || null
                };
                
                chrome.storage.local.set({ ai_config_persistence: config }, () => {
                    console.log(`💾 ${aiType.toUpperCase()} の設定を保存しました`);
                    resolve();
                });
            });
        });
    }

    /**
     * ストレージから設定を読み込む
     * @param {string} aiType - 省略時は全AI
     */
    async loadFromStorage(aiType = null) {
        return new Promise((resolve) => {
            chrome.storage.local.get(['ai_config_persistence'], (result) => {
                const config = result.ai_config_persistence || {};
                
                if (aiType) {
                    resolve(config[aiType] || null);
                } else {
                    resolve(config);
                }
            });
        });
    }

    /**
     * 特定のAIが利用可能か確認
     * @param {string} aiType 
     */
    isAvailable(aiType) {
        return this.adapters.hasOwnProperty(aiType);
    }

    /**
     * 利用可能なAIタイプのリストを取得
     */
    getAvailableAITypes() {
        return Object.keys(this.adapters);
    }
}

// グローバルに公開
window.AIDetectorService = AIDetectorService;

// シングルトンインスタンスを作成
window.aiDetectorService = new AIDetectorService();