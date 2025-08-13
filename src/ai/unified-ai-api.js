/**
 * 全AI統一API
 * ChatGPT、Claude、Geminiの共通インターフェース
 * Version: 1.0.0
 */

(function() {
    'use strict';
    
    // ========================================
    // 統一AIマネージャー
    // ========================================
    class UnifiedAIManager {
        constructor() {
            this.supportedAIs = ['chatgpt', 'claude', 'gemini'];
            this.currentAI = null;
            this.changeListeners = new Map();
            this.initialized = false;
        }

        // 初期化
        async initialize() {
            if (this.initialized) return;
            
            this.log('🚀 統一AIマネージャーを初期化中...', 'info');
            
            // 現在のAIを検出
            this.currentAI = this.detectCurrentAI();
            
            if (this.currentAI) {
                this.log(`✅ 現在のAI: ${this.currentAI.toUpperCase()}`, 'success');
                
                // 各AIの変更検出を開始
                this.setupChangeDetection();
            } else {
                this.log('⚠️ サポートされているAIが検出されません', 'warning');
            }
            
            this.initialized = true;
        }

        // 現在のAIを検出
        detectCurrentAI() {
            const hostname = window.location.hostname.toLowerCase();
            
            if (hostname.includes('chat.openai.com') || hostname.includes('chatgpt.com')) {
                return 'chatgpt';
            } else if (hostname.includes('claude.ai')) {
                return 'claude';
            } else if (hostname.includes('gemini.google.com')) {
                return 'gemini';
            }
            
            return null;
        }

        // AIオートメーションオブジェクトを取得
        getAIAutomation(aiType = null) {
            const ai = aiType || this.currentAI;
            
            switch (ai) {
                case 'chatgpt':
                    return window.ChatGPTAutomation;
                case 'claude':
                    return window.ClaudeAutomation;
                case 'gemini':
                    return window.Gemini;
                default:
                    return null;
            }
        }

        // ========================================
        // 統一API: モデル操作
        // ========================================

        // 利用可能なモデル一覧を取得
        async getAvailableModels(aiType = null) {
            const ai = aiType || this.currentAI;
            const automation = this.getAIAutomation(ai);
            
            if (!automation) {
                throw new Error(`${ai}の自動化オブジェクトが見つかりません`);
            }

            try {
                let models = [];
                
                if (ai === 'chatgpt' && automation.getAvailableModels) {
                    models = await automation.getAvailableModels();
                } else if (ai === 'claude' && automation.getAvailableModels) {
                    models = await automation.getAvailableModels();
                } else if (ai === 'gemini' && automation.getAvailableModels) {
                    models = await automation.getAvailableModels();
                }

                // 統一形式に変換
                return this.normalizeModels(models, ai);
            } catch (error) {
                this.log(`${ai}のモデル取得エラー: ${error.message}`, 'error');
                return [];
            }
        }

        // モデルを選択
        async selectModel(modelIdentifier, aiType = null) {
            const ai = aiType || this.currentAI;
            const automation = this.getAIAutomation(ai);
            
            if (!automation) {
                throw new Error(`${ai}の自動化オブジェクトが見つかりません`);
            }

            try {
                if (ai === 'chatgpt' && automation.selectModel) {
                    return await automation.selectModel(modelIdentifier);
                } else if (ai === 'claude' && automation.selectModel) {
                    return await automation.selectModel(modelIdentifier);
                } else if (ai === 'gemini' && automation.model) {
                    return await automation.model(modelIdentifier);
                }
                
                throw new Error(`${ai}でモデル選択がサポートされていません`);
            } catch (error) {
                this.log(`${ai}のモデル選択エラー: ${error.message}`, 'error');
                return false;
            }
        }

        // ========================================
        // 統一API: 機能操作
        // ========================================

        // 利用可能な機能一覧を取得
        async getAvailableFunctions(aiType = null) {
            const ai = aiType || this.currentAI;
            const automation = this.getAIAutomation(ai);
            
            if (!automation) {
                throw new Error(`${ai}の自動化オブジェクトが見つかりません`);
            }

            try {
                let functions = [];
                
                if (ai === 'chatgpt' && automation.getAvailableFunctions) {
                    functions = await automation.getAvailableFunctions();
                } else if (ai === 'claude' && automation.getAvailableFunctions) {
                    functions = await automation.getAvailableFunctions();
                } else if (ai === 'gemini' && automation.getAvailableFunctions) {
                    functions = await automation.getAvailableFunctions();
                }

                // 統一形式に変換
                return this.normalizeFunctions(functions, ai);
            } catch (error) {
                this.log(`${ai}の機能取得エラー: ${error.message}`, 'error');
                return [];
            }
        }

        // 機能を選択/切り替え
        async selectFunction(functionIdentifier, enable = true, aiType = null) {
            const ai = aiType || this.currentAI;
            const automation = this.getAIAutomation(ai);
            
            if (!automation) {
                throw new Error(`${ai}の自動化オブジェクトが見つかりません`);
            }

            try {
                if (ai === 'chatgpt' && automation.selectFunction) {
                    return await automation.selectFunction(functionIdentifier, enable);
                } else if (ai === 'claude' && automation.selectFunction) {
                    return await automation.selectFunction(functionIdentifier, enable);
                } else if (ai === 'gemini' && automation.func) {
                    return await automation.func(functionIdentifier);
                }
                
                throw new Error(`${ai}で機能選択がサポートされていません`);
            } catch (error) {
                this.log(`${ai}の機能選択エラー: ${error.message}`, 'error');
                return false;
            }
        }

        // ========================================
        // 統一API: 変更検出
        // ========================================

        // 変更検出を開始
        startChangeDetection(options = {}, aiType = null) {
            const ai = aiType || this.currentAI;
            const automation = this.getAIAutomation(ai);
            
            if (!automation || !automation.startChangeDetection) {
                this.log(`${ai}で変更検出がサポートされていません`, 'warning');
                return false;
            }

            try {
                automation.startChangeDetection(options);
                this.log(`${ai}の変更検出を開始しました`, 'info');
                return true;
            } catch (error) {
                this.log(`${ai}の変更検出開始エラー: ${error.message}`, 'error');
                return false;
            }
        }

        // 変更検出を停止
        stopChangeDetection(aiType = null) {
            const ai = aiType || this.currentAI;
            const automation = this.getAIAutomation(ai);
            
            if (!automation || !automation.stopChangeDetection) {
                this.log(`${ai}で変更検出がサポートされていません`, 'warning');
                return false;
            }

            try {
                automation.stopChangeDetection();
                this.log(`${ai}の変更検出を停止しました`, 'info');
                return true;
            } catch (error) {
                this.log(`${ai}の変更検出停止エラー: ${error.message}`, 'error');
                return false;
            }
        }

        // モデル変更リスナーを登録
        onModelChange(callback, aiType = null) {
            const ai = aiType || this.currentAI;
            
            if (!this.changeListeners.has(ai)) {
                this.changeListeners.set(ai, { models: [], functions: [] });
            }
            
            this.changeListeners.get(ai).models.push(callback);
            
            // AIシステムにも登録
            const automation = this.getAIAutomation(ai);
            if (automation && automation.onModelChange) {
                automation.onModelChange(callback);
            }
        }

        // 機能変更リスナーを登録
        onFunctionChange(callback, aiType = null) {
            const ai = aiType || this.currentAI;
            
            if (!this.changeListeners.has(ai)) {
                this.changeListeners.set(ai, { models: [], functions: [] });
            }
            
            this.changeListeners.get(ai).functions.push(callback);
            
            // AIシステムにも登録
            const automation = this.getAIAutomation(ai);
            if (automation && automation.onFunctionChange) {
                automation.onFunctionChange(callback);
            }
        }

        // ========================================
        // 統一API: 基本操作
        // ========================================

        // テキスト送信
        async sendText(text, aiType = null) {
            const ai = aiType || this.currentAI;
            const automation = this.getAIAutomation(ai);
            
            if (!automation) {
                throw new Error(`${ai}の自動化オブジェクトが見つかりません`);
            }

            try {
                if (ai === 'chatgpt' && automation.sendMessage) {
                    return await automation.sendMessage(text);
                } else if (ai === 'claude' && automation.sendMessage) {
                    return await automation.sendMessage(text);
                } else if (ai === 'gemini' && automation.send) {
                    return await automation.send(text);
                }
                
                throw new Error(`${ai}でテキスト送信がサポートされていません`);
            } catch (error) {
                this.log(`${ai}のテキスト送信エラー: ${error.message}`, 'error');
                return false;
            }
        }

        // 応答待機
        async waitForResponse(maxWait = 60000, aiType = null) {
            const ai = aiType || this.currentAI;
            const automation = this.getAIAutomation(ai);
            
            if (!automation) {
                throw new Error(`${ai}の自動化オブジェクトが見つかりません`);
            }

            try {
                if (automation.waitForResponse) {
                    return await automation.waitForResponse(maxWait);
                }
                
                throw new Error(`${ai}で応答待機がサポートされていません`);
            } catch (error) {
                this.log(`${ai}の応答待機エラー: ${error.message}`, 'error');
                return false;
            }
        }

        // 応答テキスト取得
        async getResponseText(aiType = null) {
            const ai = aiType || this.currentAI;
            const automation = this.getAIAutomation(ai);
            
            if (!automation) {
                throw new Error(`${ai}の自動化オブジェクトが見つかりません`);
            }

            try {
                if (ai === 'chatgpt' && automation.getResponse) {
                    return await automation.getResponse();
                } else if (ai === 'claude' && automation.getResponse) {
                    return await automation.getResponse();
                } else if (ai === 'gemini' && automation.getText) {
                    return await automation.getText();
                }
                
                throw new Error(`${ai}で応答取得がサポートされていません`);
            } catch (error) {
                this.log(`${ai}の応答取得エラー: ${error.message}`, 'error');
                return null;
            }
        }

        // ========================================
        // 統一API: バッチ操作
        // ========================================

        // 全AIの情報を取得
        async getAllAIInfo() {
            const info = {};
            
            for (const ai of this.supportedAIs) {
                try {
                    const automation = this.getAIAutomation(ai);
                    if (automation) {
                        info[ai] = {
                            available: true,
                            models: await this.getAvailableModels(ai).catch(() => []),
                            functions: await this.getAvailableFunctions(ai).catch(() => []),
                            changeDetection: automation.getChangeDetectionState ? 
                                automation.getChangeDetectionState() : null
                        };
                    } else {
                        info[ai] = { available: false };
                    }
                } catch (error) {
                    info[ai] = { available: false, error: error.message };
                }
            }
            
            return info;
        }

        // 全AIで変更検出を開始
        startAllChangeDetection(options = {}) {
            const results = {};
            
            for (const ai of this.supportedAIs) {
                results[ai] = this.startChangeDetection(options, ai);
            }
            
            return results;
        }

        // 全AIで変更検出を停止
        stopAllChangeDetection() {
            const results = {};
            
            for (const ai of this.supportedAIs) {
                results[ai] = this.stopChangeDetection(ai);
            }
            
            return results;
        }

        // ========================================
        // ヘルパー関数
        // ========================================

        // モデルデータを統一形式に変換
        normalizeModels(models, aiType) {
            if (!Array.isArray(models)) return [];
            
            return models.map(model => {
                if (typeof model === 'string') {
                    return { name: model, ai: aiType, selected: false };
                } else if (typeof model === 'object') {
                    return {
                        name: model.name || model.text || 'Unknown',
                        ai: aiType,
                        selected: model.selected || false,
                        testId: model.testId || null,
                        location: model.location || null,
                        element: model.element || null
                    };
                }
                return { name: 'Unknown', ai: aiType, selected: false };
            });
        }

        // 機能データを統一形式に変換
        normalizeFunctions(functions, aiType) {
            if (!Array.isArray(functions)) return [];
            
            return functions.map(func => {
                if (typeof func === 'string') {
                    return { name: func, ai: aiType, active: false };
                } else if (typeof func === 'object') {
                    return {
                        name: func.name || func.text || 'Unknown',
                        ai: aiType,
                        active: func.active || func.isActive || false,
                        hasToggle: func.hasToggle || false,
                        location: func.location || null,
                        visible: func.visible !== false,
                        element: func.element || null
                    };
                }
                return { name: 'Unknown', ai: aiType, active: false };
            });
        }

        // 変更検出イベントをセットアップ
        setupChangeDetection() {
            // 統一イベントを各AIの個別イベントにマッピング
            const eventMappings = {
                'chatgpt': ['chatgpt-models-changed', 'chatgpt-functions-changed'],
                'claude': ['claude-models-changed', 'claude-functions-changed'],
                'gemini': ['gemini-models-changed', 'gemini-functions-changed']
            };

            for (const [ai, events] of Object.entries(eventMappings)) {
                // モデル変更イベント
                window.addEventListener(events[0], (event) => {
                    window.dispatchEvent(new CustomEvent('unified-ai-models-changed', {
                        detail: { ai, models: event.detail.models }
                    }));
                });

                // 機能変更イベント
                window.addEventListener(events[1], (event) => {
                    window.dispatchEvent(new CustomEvent('unified-ai-functions-changed', {
                        detail: { ai, functions: event.detail.functions }
                    }));
                });
            }
        }

        // ログ出力
        log(message, type = 'info') {
            const colors = {
                info: '#2196F3',
                success: '#4CAF50',
                warning: '#FF9800',
                error: '#F44336'
            };
            
            console.log(`%c[UnifiedAI] ${message}`, `color: ${colors[type]}`);
        }

        // デバッグ情報表示
        showStatus() {
            console.log('\n' + '='.repeat(60));
            console.log('%c🤖 統一AIマネージャー - 状態', 'color: #4CAF50; font-size: 16px; font-weight: bold');
            console.log('='.repeat(60));
            console.log(`現在のAI: ${this.currentAI || 'なし'}`);
            console.log(`サポート対象: ${this.supportedAIs.join(', ')}`);
            console.log(`初期化済み: ${this.initialized ? 'はい' : 'いいえ'}`);
            console.log('='.repeat(60) + '\n');
        }

        // ヘルプ表示
        showHelp() {
            console.log('\n' + '='.repeat(60));
            console.log('%c📚 統一AIマネージャー - ヘルプ', 'color: #4CAF50; font-size: 16px; font-weight: bold');
            console.log('='.repeat(60));
            console.log('\n【基本操作】');
            console.log('  await UnifiedAI.getAvailableModels()    // モデル一覧取得');
            console.log('  await UnifiedAI.getAvailableFunctions() // 機能一覧取得');
            console.log('  await UnifiedAI.selectModel("model")    // モデル選択');
            console.log('  await UnifiedAI.selectFunction("func")  // 機能選択');
            console.log('\n【メッセージ操作】');
            console.log('  await UnifiedAI.sendText("質問")        // テキスト送信');
            console.log('  await UnifiedAI.waitForResponse()       // 応答待機');
            console.log('  await UnifiedAI.getResponseText()       // 応答取得');
            console.log('\n【変更検出】');
            console.log('  UnifiedAI.startChangeDetection()        // 変更検出開始');
            console.log('  UnifiedAI.stopChangeDetection()         // 変更検出停止');
            console.log('  UnifiedAI.onModelChange(callback)       // モデル変更監視');
            console.log('  UnifiedAI.onFunctionChange(callback)    // 機能変更監視');
            console.log('\n【バッチ操作】');
            console.log('  await UnifiedAI.getAllAIInfo()          // 全AI情報取得');
            console.log('  UnifiedAI.startAllChangeDetection()     // 全AI変更検出開始');
            console.log('  UnifiedAI.stopAllChangeDetection()      // 全AI変更検出停止');
            console.log('\n【ヘルプ・状態】');
            console.log('  UnifiedAI.showStatus()                  // 状態表示');
            console.log('  UnifiedAI.showHelp()                    // このヘルプ');
            console.log('='.repeat(60) + '\n');
        }
    }

    // ========================================
    // グローバル公開
    // ========================================
    const unifiedManager = new UnifiedAIManager();
    
    // 自動初期化
    unifiedManager.initialize();
    
    // グローバルに公開
    window.UnifiedAI = unifiedManager;
    window.UAI = unifiedManager; // 短縮エイリアス

    // 初期化完了メッセージ
    console.log('%c✅ 統一AIマネージャーが利用可能になりました！', 'color: #4CAF50; font-size: 16px; font-weight: bold');
    console.log('\n%c🚀 クイックスタート:', 'color: #FF6B6B; font-size: 14px; font-weight: bold');
    console.log('  UnifiedAI.showHelp()                   // 使い方を表示');
    console.log('  await UnifiedAI.getAvailableModels()   // モデル一覧');
    console.log('  await UnifiedAI.getAllAIInfo()         // 全AI情報');
    console.log('\n%c💡 統一されたAPIで全てのAI（ChatGPT・Claude・Gemini）を操作できます', 'color: #9C27B0');

})();