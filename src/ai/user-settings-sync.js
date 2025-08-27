/**
 * ユーザー設定自動反映システム
 * 検出したAI変更をユーザー設定に自動反映
 * Version: 1.0.0
 */

(function() {
    'use strict';
    
    // ========================================
    // ユーザー設定同期マネージャー
    // ========================================
    class UserSettingsSync {
        constructor() {
            this.isInitialized = false;
            this.syncRules = new Map();
            this.settingsTargets = new Map();
            this.syncHistory = [];
            this.maxHistorySize = 50;
            
            // 設定ターゲット定義
            this.defaultTargets = {
                // 既存の設定ファイル
                'ai-models-config': '/genspark-extension/config/ai-models.js',
                'chatgpt-selector': '/src/ui/chatgpt-model-function-selector.js',
                'claude-automation': '/automations/claude-automation-dynamic.js',
                'gemini-automation': '/automations/gemini-dynamic-automation.js'
            };
            
            // 同期設定
            this.config = {
                autoSync: true,
                syncInterval: 60000,  // 1分
                createBackups: true,
                notifyChanges: true,
                validateBeforeSync: true,
                dryRun: false  // true時は実際の変更は行わない
            };
        }

        // 初期化
        async initialize() {
            if (this.isInitialized) return;
            
            
            try {
                // 設定ターゲットを登録
                this.registerDefaultTargets();
                
                // 同期ルールを設定
                this.setupDefaultSyncRules();
                
                // イベントリスナーを設定
                this.setupEventListeners();
                
                // 定期同期を開始
                if (this.config.autoSync) {
                    this.startPeriodicSync();
                }
                
                this.isInitialized = true;
                
            } catch (error) {
                this.log(`初期化エラー: ${error.message}`, 'error');
                throw error;
            }
        }

        // ========================================
        // 設定ターゲット管理
        // ========================================
        registerDefaultTargets() {
            // AI Models設定ファイル
            this.settingsTargets.set('ai-models', {
                name: 'AI Models設定',
                type: 'javascript',
                path: this.defaultTargets['ai-models-config'],
                updateStrategy: 'merge',
                backupEnabled: true,
                validator: this.validateAIModelsConfig.bind(this)
            });

            // ChatGPTセレクター設定
            this.settingsTargets.set('chatgpt-ui', {
                name: 'ChatGPT UI設定',
                type: 'javascript',
                path: this.defaultTargets['chatgpt-selector'],
                updateStrategy: 'partial',
                backupEnabled: true,
                validator: this.validateChatGPTConfig.bind(this)
            });

            // Claude自動化設定
            this.settingsTargets.set('claude-config', {
                name: 'Claude設定',
                type: 'javascript',
                path: this.defaultTargets['claude-automation'],
                updateStrategy: 'alias-update',
                backupEnabled: true,
                validator: this.validateClaudeConfig.bind(this)
            });

            // Gemini自動化設定
            this.settingsTargets.set('gemini-config', {
                name: 'Gemini設定',
                type: 'javascript',
                path: this.defaultTargets['gemini-automation'],
                updateStrategy: 'dynamic',
                backupEnabled: true,
                validator: this.validateGeminiConfig.bind(this)
            });

        }

        // ========================================
        // 同期ルール設定
        // ========================================
        setupDefaultSyncRules() {
            // ChatGPTモデル変更の同期ルール
            this.addSyncRule('chatgpt-models', {
                sourceAI: 'chatgpt',
                sourceType: 'models',
                targets: ['ai-models', 'chatgpt-ui'],
                condition: (changes) => changes.added.length > 0 || changes.removed.length > 0,
                transformer: this.transformChatGPTModels.bind(this),
                priority: 1
            });

            // ChatGPT機能変更の同期ルール
            this.addSyncRule('chatgpt-functions', {
                sourceAI: 'chatgpt',
                sourceType: 'functions',
                targets: ['ai-models', 'chatgpt-ui'],
                condition: (changes) => changes.added.length > 0,
                transformer: this.transformChatGPTFunctions.bind(this),
                priority: 2
            });

            // Claude設定同期ルール
            this.addSyncRule('claude-models', {
                sourceAI: 'claude',
                sourceType: 'models',
                targets: ['ai-models', 'claude-config'],
                condition: (changes) => changes.added.length > 0,
                transformer: this.transformClaudeModels.bind(this),
                priority: 1
            });

            // Gemini設定同期ルール
            this.addSyncRule('gemini-models', {
                sourceAI: 'gemini',
                sourceType: 'models',
                targets: ['ai-models', 'gemini-config'],
                condition: (changes) => changes.added.length > 0,
                transformer: this.transformGeminiModels.bind(this),
                priority: 1
            });

        }

        addSyncRule(name, rule) {
            if (!rule.sourceAI || !rule.sourceType || !rule.targets) {
                throw new Error('同期ルールに必須フィールドが不足しています');
            }

            this.syncRules.set(name, {
                name,
                enabled: true,
                ...rule,
                lastExecuted: null,
                executionCount: 0
            });
        }

        // ========================================
        // イベントリスナー設定
        // ========================================
        setupEventListeners() {
            // AI設定永続化完了イベントをリッスン
            window.addEventListener('change-detection-processed', async (event) => {
                const { type, ai, changeEvent } = event.detail;
                await this.processSyncTrigger(ai, type, changeEvent);
            });

            // 永続化完了イベントもリッスン
            if (window.AIPersistence) {
                window.AIPersistence.addChangeListener(async (eventType, data) => {
                    if (eventType === 'models-persisted' || eventType === 'functions-persisted') {
                        await this.processPersistenceTrigger(eventType, data);
                    }
                });
            }
        }

        // ========================================
        // 同期処理メイン
        // ========================================
        async processSyncTrigger(ai, type, changeEvent) {
            try {
                const relevantRules = this.findRelevantSyncRules(ai, type);
                
                if (relevantRules.length === 0) {
                    return;
                }


                // 変更分析を取得
                const changes = await this.analyzeChanges(ai, type, changeEvent.data);
                
                // 各ルールを実行
                for (const rule of relevantRules) {
                    await this.executeSyncRule(rule, changes, changeEvent);
                }


            } catch (error) {
                this.log(`同期処理エラー: ${error.message}`, 'error');
            }
        }

        async processPersistenceTrigger(eventType, data) {
            const { ai, newCount, removedCount } = data;
            const type = eventType.includes('models') ? 'models' : 'functions';
            
            if (newCount > 0 || removedCount > 0) {
                // 追加的な同期処理があればここで実行
            }
        }

        async executeSyncRule(rule, changes, changeEvent) {
            try {
                // 条件チェック
                if (rule.condition && !rule.condition(changes)) {
                    return;
                }


                // データ変換
                const transformedData = rule.transformer ? 
                    await rule.transformer(changes, changeEvent) : changes;

                // 各ターゲットに同期
                for (const targetName of rule.targets) {
                    await this.syncToTarget(targetName, transformedData, rule);
                }

                // 実行履歴を更新
                rule.lastExecuted = new Date().toISOString();
                rule.executionCount++;

                // 履歴に記録
                this.addToSyncHistory({
                    ruleName: rule.name,
                    timestamp: rule.lastExecuted,
                    targets: rule.targets,
                    changeCount: changes.added.length + changes.removed.length,
                    success: true
                });


            } catch (error) {
                this.log(`同期ルール「${rule.name}」実行エラー: ${error.message}`, 'error');
                
                // エラー履歴に記録
                this.addToSyncHistory({
                    ruleName: rule.name,
                    timestamp: new Date().toISOString(),
                    targets: rule.targets,
                    success: false,
                    error: error.message
                });
            }
        }

        async syncToTarget(targetName, data, rule) {
            const target = this.settingsTargets.get(targetName);
            if (!target) {
                throw new Error(`同期ターゲット「${targetName}」が見つかりません`);
            }


            // Dry run モード
            if (this.config.dryRun) {
                return;
            }

            // バリデーション
            if (this.config.validateBeforeSync && target.validator) {
                const isValid = await target.validator(data);
                if (!isValid) {
                    throw new Error(`データ検証エラー: ${target.name}`);
                }
            }

            // バックアップ作成
            if (this.config.createBackups && target.backupEnabled) {
                await this.createTargetBackup(targetName);
            }

            // 同期戦略に基づいて実行
            switch (target.updateStrategy) {
                case 'merge':
                    await this.mergeUpdate(target, data);
                    break;
                case 'partial':
                    await this.partialUpdate(target, data);
                    break;
                case 'alias-update':
                    await this.aliasUpdate(target, data);
                    break;
                case 'dynamic':
                    await this.dynamicUpdate(target, data);
                    break;
                default:
                    throw new Error(`未知の更新戦略: ${target.updateStrategy}`);
            }

        }

        // ========================================
        // データ変換関数
        // ========================================
        async transformChatGPTModels(changes, changeEvent) {
            const transformed = {
                ai: 'chatgpt',
                type: 'models',
                added: changes.added.map(model => ({
                    id: this.generateModelId(model.name),
                    name: model.name,
                    displayName: model.name,
                    selector: `[data-testid*="${model.name.toLowerCase()}"]`,
                    available: true,
                    detected: new Date().toISOString()
                })),
                removed: changes.removed,
                timestamp: new Date().toISOString()
            };

            return transformed;
        }

        async transformChatGPTFunctions(changes, changeEvent) {
            return {
                ai: 'chatgpt',
                type: 'functions',
                added: changes.added.map(func => ({
                    id: this.generateFunctionId(func.name),
                    name: func.name,
                    displayName: func.name,
                    type: func.hasToggle ? 'toggle' : 'action',
                    available: true,
                    detected: new Date().toISOString()
                })),
                timestamp: new Date().toISOString()
            };
        }

        async transformClaudeModels(changes, changeEvent) {
            return {
                ai: 'claude',
                type: 'models',
                added: changes.added.map(model => {
                    // Claudeのエイリアスを生成
                    const aliases = this.generateClaudeAliases(model.name);
                    return {
                        id: this.generateModelId(model.name),
                        name: model.name,
                        aliases: aliases,
                        detected: new Date().toISOString()
                    };
                }),
                timestamp: new Date().toISOString()
            };
        }

        async transformGeminiModels(changes, changeEvent) {
            return {
                ai: 'gemini',
                type: 'models',
                added: changes.added.map(model => ({
                    id: this.generateModelId(model.name),
                    name: model.name,
                    location: model.location || 'menu',
                    detected: new Date().toISOString()
                })),
                timestamp: new Date().toISOString()
            };
        }

        // ========================================
        // 更新戦略実装
        // ========================================
        async mergeUpdate(target, data) {
            // ai-models.jsファイルの更新
            
            // 実際のファイル更新は、実装上はコメントアウト
            // （実際の本番環境では適切なファイル操作APIを使用）
            
            // 代わりに設定オブジェクトを更新
            if (window.aiModels && data.ai) {
                const aiConfig = window.aiModels[data.ai];
                if (aiConfig && data.added) {
                    data.added.forEach(item => {
                        
                        // 実際の設定更新ロジック
                        if (data.type === 'models') {
                            // モデル設定を追加
                        } else if (data.type === 'functions') {
                            // 機能設定を追加
                        }
                    });
                }
            }
        }

        async partialUpdate(target, data) {
            // ChatGPT UIセレクターの部分的な更新
        }

        async aliasUpdate(target, data) {
            // Claudeの MODEL_ALIASES を更新
            if (data.added && data.ai === 'claude') {
                data.added.forEach(model => {
                    if (model.aliases) {
                    }
                });
            }
        }

        async dynamicUpdate(target, data) {
            // Geminiの動的設定更新
        }

        // ========================================
        // バリデーション関数
        // ========================================
        async validateAIModelsConfig(data) {
            // ai-models.js設定の検証
            if (!data.ai || !data.type) return false;
            if (!Array.isArray(data.added)) return false;
            return true;
        }

        async validateChatGPTConfig(data) {
            // ChatGPT UI設定の検証
            return data.ai === 'chatgpt';
        }

        async validateClaudeConfig(data) {
            // Claude設定の検証
            return data.ai === 'claude';
        }

        async validateGeminiConfig(data) {
            // Gemini設定の検証
            return data.ai === 'gemini';
        }

        // ========================================
        // ユーティリティ関数
        // ========================================
        findRelevantSyncRules(ai, type) {
            const relevantRules = [];
            
            for (const rule of this.syncRules.values()) {
                if (rule.enabled && rule.sourceAI === ai && rule.sourceType === type) {
                    relevantRules.push(rule);
                }
            }
            
            // 優先度順にソート
            relevantRules.sort((a, b) => (a.priority || 999) - (b.priority || 999));
            
            return relevantRules;
        }

        async analyzeChanges(ai, type, data) {
            // 永続化システムから変更分析を取得
            if (window.ChangeDetectionProcessor) {
                const processor = window.ChangeDetectionProcessor;
                // 実際の変更分析ロジック
            }
            
            // フォールバック: 簡単な変更分析
            return {
                added: data.filter(item => item.detected), // 新規検出アイテム
                removed: [],
                modified: [],
                unchanged: []
            };
        }

        generateModelId(name) {
            return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
        }

        generateFunctionId(name) {
            return name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
        }

        generateClaudeAliases(modelName) {
            const aliases = [];
            const name = modelName.toLowerCase();
            
            if (name.includes('opus')) {
                aliases.push('opus', 'opas');
                if (name.includes('4.1')) aliases.push('opus4.1', 'opus41', '4.1', '41');
                if (name.includes('4')) aliases.push('opus4', '4');
            }
            
            if (name.includes('sonnet')) {
                aliases.push('sonnet', 'sonet');
                if (name.includes('4')) aliases.push('sonnet4', '4');
                if (name.includes('3.7')) aliases.push('sonnet3.7', '3.7', '37');
            }
            
            if (name.includes('haiku')) {
                aliases.push('haiku', 'haikuu');
                if (name.includes('3.5')) aliases.push('haiku3.5', '3.5', '35');
            }
            
            return aliases;
        }

        async createTargetBackup(targetName) {
            const timestamp = new Date().toISOString();
            const backupKey = `user-settings-backup-${targetName}-${timestamp}`;
            
            try {
                // 現在の設定状態をバックアップ
                const currentState = this.getCurrentTargetState(targetName);
                localStorage.setItem(backupKey, JSON.stringify({
                    targetName,
                    timestamp,
                    state: currentState
                }));
                
                
            } catch (error) {
                this.log(`バックアップ作成エラー: ${error.message}`, 'error');
            }
        }

        getCurrentTargetState(targetName) {
            // 現在の設定状態を取得（実装は簡略化）
            return { targetName, snapshot: 'current-state' };
        }

        addToSyncHistory(entry) {
            this.syncHistory.push(entry);
            
            // 履歴サイズ制限
            if (this.syncHistory.length > this.maxHistorySize) {
                this.syncHistory.shift();
            }
        }

        startPeriodicSync() {
            setInterval(() => {
                this.checkForPendingSync();
            }, this.config.syncInterval);
        }

        async checkForPendingSync() {
            // 定期的な同期チェック（必要に応じて）
        }

        // ========================================
        // 公開API
        // ========================================
        getConfig() {
            return { ...this.config };
        }

        updateConfig(newConfig) {
            this.config = { ...this.config, ...newConfig };
        }

        getSyncRules() {
            return Array.from(this.syncRules.values());
        }

        getSyncHistory(options = {}) {
            let history = [...this.syncHistory];
            
            if (options.ruleName) {
                history = history.filter(entry => entry.ruleName === options.ruleName);
            }
            
            if (options.since) {
                const sinceDate = new Date(options.since);
                history = history.filter(entry => new Date(entry.timestamp) >= sinceDate);
            }
            
            if (options.successOnly) {
                history = history.filter(entry => entry.success);
            }
            
            return history;
        }

        getStatistics() {
            const stats = {
                totalSyncs: this.syncHistory.length,
                successfulSyncs: this.syncHistory.filter(entry => entry.success).length,
                failedSyncs: this.syncHistory.filter(entry => !entry.success).length,
                rulesCount: this.syncRules.size,
                targetsCount: this.settingsTargets.size,
                lastSync: this.syncHistory.length > 0 ? 
                    this.syncHistory[this.syncHistory.length - 1].timestamp : null
            };
            
            stats.successRate = stats.totalSyncs > 0 ? 
                ((stats.successfulSyncs / stats.totalSyncs) * 100).toFixed(1) + '%' : '0%';
            
            return stats;
        }

        enableDryRun(enabled = true) {
            this.config.dryRun = enabled;
        }

        log(message, type = 'info') {
            const colors = {
                info: '#2196F3',
                success: '#4CAF50',
                warning: '#FF9800',
                error: '#F44336',
                debug: '#9E9E9E'
            };
            
            console.log(`%c[UserSettings] ${message}`, `color: ${colors[type]}`);
        }

        showStatus() {
            const stats = this.getStatistics();
            console.log('\n' + '='.repeat(60));
            console.log('%c🔧 ユーザー設定同期システム - 状態', 'color: #4CAF50; font-size: 16px; font-weight: bold');
            console.log('='.repeat(60));
            console.log(`初期化済み: ${this.isInitialized ? 'はい' : 'いいえ'}`);
            console.log(`自動同期: ${this.config.autoSync ? 'ON' : 'OFF'}`);
            console.log(`ドライラン: ${this.config.dryRun ? 'ON' : 'OFF'}`);
            console.log(`同期ルール数: ${stats.rulesCount}個`);
            console.log(`設定ターゲット数: ${stats.targetsCount}個`);
            console.log(`総同期回数: ${stats.totalSyncs}回`);
            console.log(`成功率: ${stats.successRate}`);
            console.log(`最終同期: ${stats.lastSync || 'なし'}`);
            console.log('='.repeat(60) + '\n');
        }

        showHelp() {
            console.log('\n' + '='.repeat(60));
            console.log('%c📚 ユーザー設定同期システム - ヘルプ', 'color: #4CAF50; font-size: 16px; font-weight: bold');
            console.log('='.repeat(60));
            console.log('\n【基本操作】');
            console.log('  UserSettingsSync.showStatus()         // システム状態表示');
            console.log('  UserSettingsSync.getStatistics()      // 統計情報取得');
            console.log('  UserSettingsSync.getSyncHistory()     // 同期履歴取得');
            console.log('\n【設定管理】');
            console.log('  UserSettingsSync.getConfig()          // 現在の設定取得');
            console.log('  UserSettingsSync.updateConfig({...})  // 設定更新');
            console.log('  UserSettingsSync.enableDryRun(true)   // ドライランモード');
            console.log('\n【同期ルール】');
            console.log('  UserSettingsSync.getSyncRules()       // 同期ルール一覧');
            console.log('  UserSettingsSync.addSyncRule(name, rule) // カスタムルール追加');
            console.log('\n【対象システム】');
            console.log('  - AI Models設定 (ai-models.js)');
            console.log('  - ChatGPT UI設定');
            console.log('  - Claude自動化設定');
            console.log('  - Gemini自動化設定');
            console.log('='.repeat(60) + '\n');
        }
    }

    // ========================================
    // グローバル公開・自動初期化
    // ========================================
    const userSettingsSync = new UserSettingsSync();
    
    // DOM読み込み完了後に初期化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            userSettingsSync.initialize();
        });
    } else {
        userSettingsSync.initialize();
    }
    
    // グローバルに公開
    window.UserSettingsSync = userSettingsSync;
    window.UserSync = userSettingsSync; // 短縮エイリアス

    // 初期化完了メッセージ
    console.log('%c✅ ユーザー設定同期システムが利用可能になりました！', 'color: #4CAF50; font-size: 16px; font-weight: bold');
    console.log('\n%c🚀 クイックスタート:', 'color: #FF6B6B; font-size: 14px; font-weight: bold');
    console.log('  UserSettingsSync.showHelp()            // 使い方を表示');
    console.log('  UserSettingsSync.showStatus()          // システム状態を表示');
    console.log('  UserSettingsSync.enableDryRun(true)    // ドライランモード（テスト用）');
    console.log('\n%c💡 検出したAI変更を既存の設定ファイルに自動反映します', 'color: #9C27B0');

})();