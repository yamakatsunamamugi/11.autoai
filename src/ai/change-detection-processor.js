/**
 * 変更検出イベント統一処理システム
 * 全AI（ChatGPT、Claude、Gemini）の変更を統一的に処理
 * Version: 1.0.0
 */

(function() {
    'use strict';
    
    // ========================================
    // 変更検出処理システム
    // ========================================
    class ChangeDetectionProcessor {
        constructor() {
            this.processors = new Map();
            this.persistenceHandlers = new Map();
            this.notificationHandlers = new Map();
            this.eventHistory = [];
            this.maxHistorySize = 100;
            this.isInitialized = false;
            
            // 設定
            this.config = {
                enablePersistence: true,
                enableNotifications: true,
                enableHistory: true,
                autoSaveInterval: 30000, // 30秒
                notificationTimeout: 5000
            };
        }

        // 初期化
        initialize() {
            if (this.isInitialized) return;
            
            this.log('🔧 変更検出処理システムを初期化中...', 'info');
            
            // 各AIのイベントリスナーを設定
            this.setupEventListeners();
            
            // 自動保存タイマーを開始
            if (this.config.enablePersistence) {
                this.startAutoSave();
            }
            
            this.isInitialized = true;
            this.log('✅ 変更検出処理システム初期化完了', 'success');
        }

        // ========================================
        // イベントリスナー設定
        // ========================================
        setupEventListeners() {
            // 統一AIイベントをリッスン
            window.addEventListener('unified-ai-models-changed', (event) => {
                this.processModelChange(event.detail.ai, event.detail.models);
            });

            window.addEventListener('unified-ai-functions-changed', (event) => {
                this.processFunctionChange(event.detail.ai, event.detail.functions);
            });

            // 個別AIイベントもリッスン（フォールバック）
            const aiEvents = [
                'chatgpt-models-changed', 'chatgpt-functions-changed',
                'claude-models-changed', 'claude-functions-changed', 
                'gemini-models-changed', 'gemini-functions-changed'
            ];

            aiEvents.forEach(eventName => {
                window.addEventListener(eventName, (event) => {
                    const ai = eventName.split('-')[0];
                    const type = eventName.includes('models') ? 'models' : 'functions';
                    
                    if (type === 'models') {
                        this.processModelChange(ai, event.detail.models);
                    } else {
                        this.processFunctionChange(ai, event.detail.functions);
                    }
                });
            });
        }

        // ========================================
        // 変更処理メイン
        // ========================================
        async processModelChange(ai, models) {
            const timestamp = new Date().toISOString();
            const changeEvent = {
                id: this.generateEventId(),
                timestamp,
                ai,
                type: 'models',
                data: models,
                processed: false
            };

            this.log(`🔄 ${ai.toUpperCase()}モデル変更を処理中...`, 'info');

            try {
                // 履歴に追加
                if (this.config.enableHistory) {
                    this.addToHistory(changeEvent);
                }

                // 処理パイプライン実行
                await this.runProcessingPipeline('models', ai, models, changeEvent);

                // 処理完了マーク
                changeEvent.processed = true;
                
                this.log(`✅ ${ai.toUpperCase()}モデル変更処理完了`, 'success');

                // 処理完了イベント発火
                window.dispatchEvent(new CustomEvent('change-detection-processed', {
                    detail: { type: 'models', ai, changeEvent }
                }));

            } catch (error) {
                this.log(`❌ ${ai.toUpperCase()}モデル変更処理エラー: ${error.message}`, 'error');
                changeEvent.error = error.message;
            }
        }

        async processFunctionChange(ai, functions) {
            const timestamp = new Date().toISOString();
            const changeEvent = {
                id: this.generateEventId(),
                timestamp,
                ai,
                type: 'functions',
                data: functions,
                processed: false
            };

            this.log(`🔄 ${ai.toUpperCase()}機能変更を処理中...`, 'info');

            try {
                // 履歴に追加
                if (this.config.enableHistory) {
                    this.addToHistory(changeEvent);
                }

                // 処理パイプライン実行
                await this.runProcessingPipeline('functions', ai, functions, changeEvent);

                // 処理完了マーク
                changeEvent.processed = true;
                
                this.log(`✅ ${ai.toUpperCase()}機能変更処理完了`, 'success');

                // 処理完了イベント発火
                window.dispatchEvent(new CustomEvent('change-detection-processed', {
                    detail: { type: 'functions', ai, changeEvent }
                }));

            } catch (error) {
                this.log(`❌ ${ai.toUpperCase()}機能変更処理エラー: ${error.message}`, 'error');
                changeEvent.error = error.message;
            }
        }

        // ========================================
        // 処理パイプライン
        // ========================================
        async runProcessingPipeline(type, ai, data, changeEvent) {
            // 1. データ正規化
            const normalizedData = this.normalizeData(type, ai, data);
            
            // 2. 変更差分分析
            const changeAnalysis = await this.analyzeChanges(type, ai, normalizedData);
            
            // 3. 永続化処理
            if (this.config.enablePersistence) {
                await this.persistChanges(type, ai, normalizedData, changeAnalysis);
            }
            
            // 4. 通知処理
            if (this.config.enableNotifications) {
                await this.sendNotifications(type, ai, changeAnalysis);
            }
            
            // 5. カスタム処理実行
            await this.runCustomProcessors(type, ai, normalizedData, changeEvent);
            
            // 6. 設定更新処理
            await this.updateConfigurations(type, ai, normalizedData, changeAnalysis);
        }

        // ========================================
        // データ正規化
        // ========================================
        normalizeData(type, ai, data) {
            if (!Array.isArray(data)) return [];
            
            return data.map(item => {
                const normalized = {
                    name: item.name || item.text || 'Unknown',
                    ai: ai,
                    timestamp: new Date().toISOString()
                };

                if (type === 'models') {
                    normalized.selected = item.selected || false;
                    normalized.testId = item.testId || null;
                    normalized.location = item.location || null;
                } else if (type === 'functions') {
                    normalized.active = item.active || item.isActive || false;
                    normalized.hasToggle = item.hasToggle || false;
                    normalized.visible = item.visible !== false;
                    normalized.location = item.location || null;
                }

                return normalized;
            });
        }

        // ========================================
        // 変更差分分析
        // ========================================
        async analyzeChanges(type, ai, normalizedData) {
            const storageKey = `ai-${ai}-${type}-last`;
            const lastData = await this.getStoredData(storageKey) || [];
            
            const analysis = {
                added: [],
                removed: [],
                modified: [],
                unchanged: []
            };

            const currentNames = normalizedData.map(item => item.name);
            const lastNames = lastData.map(item => item.name);

            // 追加されたアイテム
            analysis.added = normalizedData.filter(item => !lastNames.includes(item.name));
            
            // 削除されたアイテム
            analysis.removed = lastData.filter(item => !currentNames.includes(item.name));
            
            // 変更されたアイテム
            analysis.modified = normalizedData.filter(current => {
                const last = lastData.find(item => item.name === current.name);
                if (!last) return false;
                
                // 状態の変更をチェック
                if (type === 'models') {
                    return current.selected !== last.selected;
                } else if (type === 'functions') {
                    return current.active !== last.active || current.visible !== last.visible;
                }
                return false;
            });
            
            // 変更なしのアイテム
            analysis.unchanged = normalizedData.filter(current => {
                const last = lastData.find(item => item.name === current.name);
                if (!last) return false;
                
                if (type === 'models') {
                    return current.selected === last.selected;
                } else if (type === 'functions') {
                    return current.active === last.active && current.visible === last.visible;
                }
                return true;
            });

            return analysis;
        }

        // ========================================
        // 永続化処理
        // ========================================
        async persistChanges(type, ai, normalizedData, changeAnalysis) {
            try {
                const storageKey = `ai-${ai}-${type}-last`;
                await this.setStoredData(storageKey, normalizedData);
                
                // 変更履歴も保存
                if (changeAnalysis.added.length > 0 || changeAnalysis.removed.length > 0) {
                    const historyKey = `ai-${ai}-${type}-history`;
                    const history = await this.getStoredData(historyKey) || [];
                    
                    history.push({
                        timestamp: new Date().toISOString(),
                        analysis: changeAnalysis
                    });
                    
                    // 履歴は最新50件のみ保持
                    if (history.length > 50) {
                        history.splice(0, history.length - 50);
                    }
                    
                    await this.setStoredData(historyKey, history);
                }
                
                this.log(`💾 ${ai.toUpperCase()}の${type}データを永続化しました`, 'info');
            } catch (error) {
                this.log(`永続化エラー: ${error.message}`, 'error');
            }
        }

        // ========================================
        // 通知処理
        // ========================================
        async sendNotifications(type, ai, changeAnalysis) {
            const { added, removed, modified } = changeAnalysis;
            
            if (added.length === 0 && removed.length === 0 && modified.length === 0) {
                return; // 変更なしなので通知不要
            }

            const messages = [];
            
            if (added.length > 0) {
                messages.push(`${type === 'models' ? 'モデル' : '機能'}が追加されました: ${added.map(item => item.name).join(', ')}`);
            }
            
            if (removed.length > 0) {
                messages.push(`${type === 'models' ? 'モデル' : '機能'}が削除されました: ${removed.map(item => item.name).join(', ')}`);
            }
            
            if (modified.length > 0) {
                messages.push(`${type === 'models' ? 'モデル' : '機能'}が変更されました: ${modified.map(item => item.name).join(', ')}`);
            }

            // コンソール通知
            messages.forEach(message => {
                this.log(`📢 [${ai.toUpperCase()}] ${message}`, 'warning');
            });

            // デスクトップ通知（権限がある場合）
            if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
                const title = `${ai.toUpperCase()} ${type === 'models' ? 'モデル' : '機能'}変更`;
                const body = messages.join('\n');
                
                const notification = new Notification(title, {
                    body: body,
                    icon: this.getAIIcon(ai),
                    tag: `ai-change-${ai}-${type}`
                });
                
                setTimeout(() => notification.close(), this.config.notificationTimeout);
            }

            // カスタム通知ハンドラー実行
            const handlers = this.notificationHandlers.get(`${ai}-${type}`) || [];
            handlers.forEach(handler => {
                try {
                    handler(changeAnalysis, messages);
                } catch (error) {
                    this.log(`通知ハンドラーエラー: ${error.message}`, 'error');
                }
            });
        }

        // ========================================
        // カスタム処理実行
        // ========================================
        async runCustomProcessors(type, ai, normalizedData, changeEvent) {
            const processors = this.processors.get(`${ai}-${type}`) || [];
            
            for (const processor of processors) {
                try {
                    await processor(normalizedData, changeEvent);
                } catch (error) {
                    this.log(`カスタム処理エラー: ${error.message}`, 'error');
                }
            }
        }

        // ========================================
        // 設定更新処理
        // ========================================
        async updateConfigurations(type, ai, normalizedData, changeAnalysis) {
            try {
                // AIモデル設定の更新
                if (type === 'models' && window.aiModels) {
                    const aiConfig = window.aiModels[ai];
                    if (aiConfig && changeAnalysis.added.length > 0) {
                        // 新しいモデルを設定に追加する処理
                        changeAnalysis.added.forEach(model => {
                            this.log(`新しいモデルを設定に追加: ${model.name}`, 'info');
                        });
                    }
                }

                // 機能設定の更新
                if (type === 'functions' && changeAnalysis.added.length > 0) {
                    changeAnalysis.added.forEach(func => {
                        this.log(`新しい機能を設定に追加: ${func.name}`, 'info');
                    });
                }
            } catch (error) {
                this.log(`設定更新エラー: ${error.message}`, 'error');
            }
        }

        // ========================================
        // ストレージ操作
        // ========================================
        async getStoredData(key) {
            try {
                const data = localStorage.getItem(`change-detection-${key}`);
                return data ? JSON.parse(data) : null;
            } catch (error) {
                this.log(`ストレージ読み込みエラー: ${error.message}`, 'error');
                return null;
            }
        }

        async setStoredData(key, data) {
            try {
                localStorage.setItem(`change-detection-${key}`, JSON.stringify(data));
            } catch (error) {
                this.log(`ストレージ書き込みエラー: ${error.message}`, 'error');
            }
        }

        // ========================================
        // 履歴管理
        // ========================================
        addToHistory(changeEvent) {
            this.eventHistory.push(changeEvent);
            
            // 履歴サイズ制限
            if (this.eventHistory.length > this.maxHistorySize) {
                this.eventHistory.shift();
            }
        }

        getHistory(filterOptions = {}) {
            let history = [...this.eventHistory];
            
            if (filterOptions.ai) {
                history = history.filter(event => event.ai === filterOptions.ai);
            }
            
            if (filterOptions.type) {
                history = history.filter(event => event.type === filterOptions.type);
            }
            
            if (filterOptions.since) {
                const sinceTime = new Date(filterOptions.since).getTime();
                history = history.filter(event => new Date(event.timestamp).getTime() >= sinceTime);
            }
            
            return history;
        }

        clearHistory() {
            this.eventHistory = [];
            this.log('📝 変更履歴をクリアしました', 'info');
        }

        // ========================================
        // カスタムハンドラー登録
        // ========================================
        addProcessor(ai, type, processor) {
            const key = `${ai}-${type}`;
            if (!this.processors.has(key)) {
                this.processors.set(key, []);
            }
            this.processors.get(key).push(processor);
            this.log(`カスタム処理を登録: ${key}`, 'info');
        }

        addNotificationHandler(ai, type, handler) {
            const key = `${ai}-${type}`;
            if (!this.notificationHandlers.has(key)) {
                this.notificationHandlers.set(key, []);
            }
            this.notificationHandlers.get(key).push(handler);
            this.log(`通知ハンドラーを登録: ${key}`, 'info');
        }

        // ========================================
        // 自動保存
        // ========================================
        startAutoSave() {
            setInterval(() => {
                this.saveCurrentState();
            }, this.config.autoSaveInterval);
        }

        async saveCurrentState() {
            try {
                const state = {
                    timestamp: new Date().toISOString(),
                    eventHistory: this.eventHistory.slice(-20), // 最新20件のみ
                    config: this.config
                };
                
                await this.setStoredData('processor-state', state);
            } catch (error) {
                this.log(`状態保存エラー: ${error.message}`, 'error');
            }
        }

        // ========================================
        // ユーティリティ
        // ========================================
        generateEventId() {
            return Date.now().toString(36) + Math.random().toString(36).substr(2);
        }

        getAIIcon(ai) {
            const icons = {
                chatgpt: '🤖',
                claude: '🧠',
                gemini: '✨'
            };
            return icons[ai] || '🤖';
        }

        log(message, type = 'info') {
            const colors = {
                info: '#2196F3',
                success: '#4CAF50',
                warning: '#FF9800',
                error: '#F44336'
            };
            
            console.log(`%c[ChangeDetection] ${message}`, `color: ${colors[type]}`);
        }

        // ========================================
        // 公開メソッド
        // ========================================
        getStatus() {
            return {
                initialized: this.isInitialized,
                config: this.config,
                historyCount: this.eventHistory.length,
                processorCount: Array.from(this.processors.values()).reduce((sum, arr) => sum + arr.length, 0),
                notificationHandlerCount: Array.from(this.notificationHandlers.values()).reduce((sum, arr) => sum + arr.length, 0)
            };
        }

        showStatus() {
            const status = this.getStatus();
            console.log('\n' + '='.repeat(60));
            console.log('%c🔧 変更検出処理システム - 状態', 'color: #4CAF50; font-size: 16px; font-weight: bold');
            console.log('='.repeat(60));
            console.log(`初期化済み: ${status.initialized ? 'はい' : 'いいえ'}`);
            console.log(`履歴数: ${status.historyCount}件`);
            console.log(`カスタム処理: ${status.processorCount}個`);
            console.log(`通知ハンドラー: ${status.notificationHandlerCount}個`);
            console.log(`永続化: ${this.config.enablePersistence ? '有効' : '無効'}`);
            console.log(`通知: ${this.config.enableNotifications ? '有効' : '無効'}`);
            console.log('='.repeat(60) + '\n');
        }

        showHelp() {
            console.log('\n' + '='.repeat(60));
            console.log('%c📚 変更検出処理システム - ヘルプ', 'color: #4CAF50; font-size: 16px; font-weight: bold');
            console.log('='.repeat(60));
            console.log('\n【基本操作】');
            console.log('  ChangeProcessor.initialize()           // システム初期化');
            console.log('  ChangeProcessor.getStatus()            // 状態取得');
            console.log('  ChangeProcessor.showStatus()           // 状態表示');
            console.log('\n【履歴操作】');
            console.log('  ChangeProcessor.getHistory()           // 全履歴取得');
            console.log('  ChangeProcessor.getHistory({ai:"chatgpt"}) // 特定AI履歴');
            console.log('  ChangeProcessor.clearHistory()         // 履歴クリア');
            console.log('\n【カスタマイズ】');
            console.log('  ChangeProcessor.addProcessor(ai, type, func) // カスタム処理追加');
            console.log('  ChangeProcessor.addNotificationHandler(ai, type, func) // 通知ハンドラー追加');
            console.log('\n【イベント】');
            console.log('  change-detection-processed              // 処理完了イベント');
            console.log('='.repeat(60) + '\n');
        }
    }

    // ========================================
    // グローバル公開・自動初期化
    // ========================================
    const changeProcessor = new ChangeDetectionProcessor();
    
    // DOM読み込み完了後に初期化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            changeProcessor.initialize();
        });
    } else {
        changeProcessor.initialize();
    }
    
    // グローバルに公開
    window.ChangeDetectionProcessor = changeProcessor;
    window.ChangeProcessor = changeProcessor; // 短縮エイリアス

    // 初期化完了メッセージ
    console.log('%c✅ 変更検出処理システムが利用可能になりました！', 'color: #4CAF50; font-size: 16px; font-weight: bold');
    console.log('\n%c🚀 クイックスタート:', 'color: #FF6B6B; font-size: 14px; font-weight: bold');
    console.log('  ChangeProcessor.showHelp()            // 使い方を表示');
    console.log('  ChangeProcessor.getHistory()          // 変更履歴を表示');
    console.log('  ChangeProcessor.showStatus()          // システム状態を表示');
    console.log('\n%c💡 AI変更の自動検出・永続化・通知処理を統一的に管理します', 'color: #9C27B0');

})();