/**
 * AI設定永続化システム
 * 検出した新モデル・機能の自動保存・管理
 * Version: 1.0.0
 */

(function() {
    'use strict';
    
    // ========================================
    // AI設定永続化マネージャー
    // ========================================
    class AIConfigPersistence {
        constructor() {
            this.storagePrefix = 'ai-config-';
            this.configVersion = '1.0.0';
            this.isInitialized = false;
            
            // 設定構造
            this.configStructure = {
                version: this.configVersion,
                lastUpdated: null,
                aiConfigs: {
                    chatgpt: {
                        models: [],
                        functions: [],
                        metadata: {
                            url: 'https://chat.openai.com',
                            lastDetected: null,
                            detectionCount: 0
                        }
                    },
                    claude: {
                        models: [],
                        functions: [],
                        metadata: {
                            url: 'https://claude.ai',
                            lastDetected: null,
                            detectionCount: 0
                        }
                    },
                    gemini: {
                        models: [],
                        functions: [],
                        metadata: {
                            url: 'https://gemini.google.com',
                            lastDetected: null,
                            detectionCount: 0
                        }
                    }
                },
                userPreferences: {
                    autoSave: true,
                    notifyOnChange: true,
                    keepHistory: true,
                    maxHistoryDays: 30,
                    preferredModels: {},
                    preferredFunctions: {}
                },
                statistics: {
                    totalDetections: 0,
                    lastDetectionDate: null,
                    modelChanges: 0,
                    functionChanges: 0
                }
            };
            
            // 変更リスナー
            this.changeListeners = [];
            
            // バックアップ設定
            this.backupConfig = {
                enabled: true,
                maxBackups: 10,
                backupInterval: 24 * 60 * 60 * 1000 // 24時間
            };
        }

        // 初期化
        async initialize() {
            if (this.isInitialized) return;
            
            this.log('🔧 AI設定永続化システムを初期化中...', 'info');
            
            try {
                // 既存設定をロード
                await this.loadConfig();
                
                // 変更検出イベントをリッスン
                this.setupChangeListeners();
                
                // 定期バックアップを開始
                if (this.backupConfig.enabled) {
                    this.startPeriodicBackup();
                }
                
                // 設定検証・マイグレーション
                await this.validateAndMigrateConfig();
                
                this.isInitialized = true;
                this.log('✅ AI設定永続化システム初期化完了', 'success');
                
            } catch (error) {
                this.log(`初期化エラー: ${error.message}`, 'error');
                throw error;
            }
        }

        // ========================================
        // 設定ロード・保存
        // ========================================
        async loadConfig() {
            try {
                const storedConfig = localStorage.getItem(`${this.storagePrefix}main`);
                
                if (storedConfig) {
                    this.config = JSON.parse(storedConfig);
                    
                    // バージョンチェック
                    if (this.config.version !== this.configVersion) {
                        await this.migrateConfig(this.config.version, this.configVersion);
                    }
                    
                    this.log('既存設定をロードしました', 'info');
                } else {
                    // 初回起動時は初期設定を作成
                    this.config = JSON.parse(JSON.stringify(this.configStructure));
                    await this.saveConfig();
                    this.log('初期設定を作成しました', 'info');
                }
                
            } catch (error) {
                this.log(`設定ロードエラー: ${error.message}`, 'error');
                // エラー時は初期設定にフォールバック
                this.config = JSON.parse(JSON.stringify(this.configStructure));
            }
        }

        async saveConfig() {
            try {
                this.config.lastUpdated = new Date().toISOString();
                localStorage.setItem(`${this.storagePrefix}main`, JSON.stringify(this.config));
                
                // 変更通知
                this.notifyChangeListeners('config-saved', this.config);
                
            } catch (error) {
                this.log(`設定保存エラー: ${error.message}`, 'error');
                throw error;
            }
        }

        // ========================================
        // モデル・機能の永続化
        // ========================================
        async persistModels(ai, models) {
            if (!this.config.aiConfigs[ai]) {
                this.log(`未知のAI: ${ai}`, 'error');
                return false;
            }

            try {
                const aiConfig = this.config.aiConfigs[ai];
                const timestamp = new Date().toISOString();
                
                // 既存モデルと比較
                const existingModels = aiConfig.models || [];
                const newModels = this.findNewItems(existingModels, models);
                const removedModels = this.findRemovedItems(existingModels, models);
                
                if (newModels.length > 0 || removedModels.length > 0) {
                    // 変更履歴を保存
                    await this.saveChangeHistory(ai, 'models', {
                        added: newModels,
                        removed: removedModels,
                        timestamp: timestamp
                    });
                    
                    // 統計更新
                    this.config.statistics.modelChanges++;
                    this.config.statistics.totalDetections++;
                    this.config.statistics.lastDetectionDate = timestamp;
                    
                    // 新しいモデルをログ出力
                    newModels.forEach(model => {
                        this.log(`🆕 新しいモデルを検出: ${ai.toUpperCase()} - ${model.name}`, 'success');
                    });
                    
                    removedModels.forEach(model => {
                        this.log(`🗑️ モデルが削除: ${ai.toUpperCase()} - ${model.name}`, 'warning');
                    });
                }
                
                // モデルリストを更新
                aiConfig.models = this.normalizeItems(models, 'model');
                aiConfig.metadata.lastDetected = timestamp;
                aiConfig.metadata.detectionCount++;
                
                await this.saveConfig();
                
                // 成功通知
                this.notifyChangeListeners('models-persisted', {
                    ai: ai,
                    models: aiConfig.models,
                    newCount: newModels.length,
                    removedCount: removedModels.length
                });
                
                return true;
                
            } catch (error) {
                this.log(`モデル永続化エラー (${ai}): ${error.message}`, 'error');
                return false;
            }
        }

        async persistFunctions(ai, functions) {
            if (!this.config.aiConfigs[ai]) {
                this.log(`未知のAI: ${ai}`, 'error');
                return false;
            }

            try {
                const aiConfig = this.config.aiConfigs[ai];
                const timestamp = new Date().toISOString();
                
                // 既存機能と比較
                const existingFunctions = aiConfig.functions || [];
                const newFunctions = this.findNewItems(existingFunctions, functions);
                const removedFunctions = this.findRemovedItems(existingFunctions, functions);
                
                if (newFunctions.length > 0 || removedFunctions.length > 0) {
                    // 変更履歴を保存
                    await this.saveChangeHistory(ai, 'functions', {
                        added: newFunctions,
                        removed: removedFunctions,
                        timestamp: timestamp
                    });
                    
                    // 統計更新
                    this.config.statistics.functionChanges++;
                    this.config.statistics.totalDetections++;
                    this.config.statistics.lastDetectionDate = timestamp;
                    
                    // 新しい機能をログ出力
                    newFunctions.forEach(func => {
                        this.log(`🆕 新しい機能を検出: ${ai.toUpperCase()} - ${func.name}`, 'success');
                    });
                    
                    removedFunctions.forEach(func => {
                        this.log(`🗑️ 機能が削除: ${ai.toUpperCase()} - ${func.name}`, 'warning');
                    });
                }
                
                // 機能リストを更新
                aiConfig.functions = this.normalizeItems(functions, 'function');
                aiConfig.metadata.lastDetected = timestamp;
                aiConfig.metadata.detectionCount++;
                
                await this.saveConfig();
                
                // 成功通知
                this.notifyChangeListeners('functions-persisted', {
                    ai: ai,
                    functions: aiConfig.functions,
                    newCount: newFunctions.length,
                    removedCount: removedFunctions.length
                });
                
                return true;
                
            } catch (error) {
                this.log(`機能永続化エラー (${ai}): ${error.message}`, 'error');
                return false;
            }
        }

        // ========================================
        // 変更履歴管理
        // ========================================
        async saveChangeHistory(ai, type, changeData) {
            try {
                const historyKey = `${this.storagePrefix}history-${ai}-${type}`;
                const existingHistory = JSON.parse(localStorage.getItem(historyKey) || '[]');
                
                // 新しい変更を追加
                existingHistory.push(changeData);
                
                // 古い履歴を削除（設定に基づく）
                const maxDays = this.config.userPreferences.maxHistoryDays;
                const cutoffDate = new Date();
                cutoffDate.setDate(cutoffDate.getDate() - maxDays);
                
                const filteredHistory = existingHistory.filter(item => 
                    new Date(item.timestamp) > cutoffDate
                );
                
                // 保存
                localStorage.setItem(historyKey, JSON.stringify(filteredHistory));
                
            } catch (error) {
                this.log(`履歴保存エラー: ${error.message}`, 'error');
            }
        }

        getChangeHistory(ai, type, options = {}) {
            try {
                const historyKey = `${this.storagePrefix}history-${ai}-${type}`;
                const history = JSON.parse(localStorage.getItem(historyKey) || '[]');
                
                let filteredHistory = history;
                
                // 日付フィルター
                if (options.since) {
                    const sinceDate = new Date(options.since);
                    filteredHistory = filteredHistory.filter(item => 
                        new Date(item.timestamp) >= sinceDate
                    );
                }
                
                // 制限
                if (options.limit) {
                    filteredHistory = filteredHistory.slice(-options.limit);
                }
                
                return filteredHistory;
                
            } catch (error) {
                this.log(`履歴取得エラー: ${error.message}`, 'error');
                return [];
            }
        }

        // ========================================
        // 設定エクスポート・インポート
        // ========================================
        exportConfig(options = {}) {
            try {
                const exportData = {
                    version: this.configVersion,
                    exportDate: new Date().toISOString(),
                    config: this.config
                };
                
                // 履歴を含める場合
                if (options.includeHistory) {
                    exportData.history = {};
                    
                    for (const ai of ['chatgpt', 'claude', 'gemini']) {
                        exportData.history[ai] = {
                            models: this.getChangeHistory(ai, 'models'),
                            functions: this.getChangeHistory(ai, 'functions')
                        };
                    }
                }
                
                return exportData;
                
            } catch (error) {
                this.log(`設定エクスポートエラー: ${error.message}`, 'error');
                return null;
            }
        }

        async importConfig(importData, options = {}) {
            try {
                // バージョンチェック
                if (importData.version !== this.configVersion) {
                    this.log(`バージョン不一致: ${importData.version} vs ${this.configVersion}`, 'warning');
                    
                    if (!options.allowVersionMismatch) {
                        throw new Error('バージョンが一致しません');
                    }
                }
                
                // バックアップを作成
                if (options.createBackup !== false) {
                    await this.createBackup('before-import');
                }
                
                // 設定をインポート
                this.config = importData.config;
                await this.saveConfig();
                
                // 履歴をインポート
                if (importData.history && options.importHistory) {
                    for (const [ai, historyData] of Object.entries(importData.history)) {
                        for (const [type, history] of Object.entries(historyData)) {
                            const historyKey = `${this.storagePrefix}history-${ai}-${type}`;
                            localStorage.setItem(historyKey, JSON.stringify(history));
                        }
                    }
                }
                
                this.log('設定インポートが完了しました', 'success');
                return true;
                
            } catch (error) {
                this.log(`設定インポートエラー: ${error.message}`, 'error');
                return false;
            }
        }

        // ========================================
        // バックアップ管理
        // ========================================
        async createBackup(label = null) {
            try {
                const timestamp = new Date().toISOString();
                const backupKey = `${this.storagePrefix}backup-${timestamp}`;
                
                const backupData = {
                    label: label || `backup-${timestamp}`,
                    timestamp: timestamp,
                    config: this.config
                };
                
                localStorage.setItem(backupKey, JSON.stringify(backupData));
                
                // 古いバックアップを削除
                await this.cleanupOldBackups();
                
                this.log(`バックアップを作成しました: ${label || timestamp}`, 'info');
                return backupKey;
                
            } catch (error) {
                this.log(`バックアップ作成エラー: ${error.message}`, 'error');
                return null;
            }
        }

        async cleanupOldBackups() {
            try {
                const backupKeys = [];
                
                // すべてのバックアップキーを取得
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key && key.startsWith(`${this.storagePrefix}backup-`)) {
                        backupKeys.push({
                            key: key,
                            timestamp: key.replace(`${this.storagePrefix}backup-`, '')
                        });
                    }
                }
                
                // 日付順にソート
                backupKeys.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
                
                // 制限を超えたバックアップを削除
                if (backupKeys.length > this.backupConfig.maxBackups) {
                    const toDelete = backupKeys.slice(this.backupConfig.maxBackups);
                    toDelete.forEach(backup => {
                        localStorage.removeItem(backup.key);
                    });
                    
                    this.log(`${toDelete.length}個の古いバックアップを削除しました`, 'info');
                }
                
            } catch (error) {
                this.log(`バックアップクリーンアップエラー: ${error.message}`, 'error');
            }
        }

        getBackups() {
            try {
                const backups = [];
                
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key && key.startsWith(`${this.storagePrefix}backup-`)) {
                        const backupData = JSON.parse(localStorage.getItem(key));
                        backups.push({
                            key: key,
                            ...backupData
                        });
                    }
                }
                
                // 日付順にソート（新しい順）
                return backups.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
                
            } catch (error) {
                this.log(`バックアップ一覧取得エラー: ${error.message}`, 'error');
                return [];
            }
        }

        async restoreBackup(backupKey) {
            try {
                const backupData = JSON.parse(localStorage.getItem(backupKey));
                if (!backupData) {
                    throw new Error('バックアップが見つかりません');
                }
                
                // 現在の設定をバックアップ
                await this.createBackup('before-restore');
                
                // バックアップから復元
                this.config = backupData.config;
                await this.saveConfig();
                
                this.log(`バックアップから復元しました: ${backupData.label}`, 'success');
                return true;
                
            } catch (error) {
                this.log(`バックアップ復元エラー: ${error.message}`, 'error');
                return false;
            }
        }

        // ========================================
        // ユーティリティ関数
        // ========================================
        findNewItems(existing, current) {
            const existingNames = existing.map(item => item.name);
            return current.filter(item => !existingNames.includes(item.name));
        }

        findRemovedItems(existing, current) {
            const currentNames = current.map(item => item.name);
            return existing.filter(item => !currentNames.includes(item.name));
        }

        normalizeItems(items, type) {
            // 既に文字列配列の場合はそのまま返す（新しいフォーマット）
            if (Array.isArray(items) && items.length > 0 && typeof items[0] === 'string') {
                return items.map(name => {
                    // Claudeモデルの説明文を除去
                    if (type === 'model' && name && typeof name === 'string') {
                        return this.cleanClaudeModelName(name);
                    }
                    return name;
                });
            }
            
            // 旧フォーマットとの互換性のためのオブジェクト処理
            return items.map(item => {
                let name;
                if (typeof item === 'string') {
                    name = item;
                } else if (typeof item === 'object' && item !== null) {
                    name = item.name || item.text || item.label || item.value || 'Unknown';
                } else {
                    name = String(item);
                }
                
                // Claudeモデルの説明文を除去
                if (type === 'model' && name && typeof name === 'string') {
                    name = this.cleanClaudeModelName(name);
                }
                
                return name; // シンプルに文字列として返す
            });
        }

        // Claudeモデル名から説明文を除去するヘルパーメソッド
        cleanClaudeModelName(name) {
            if (!name || typeof name !== 'string') return name;
            
            const descriptionPatterns = [
                '情報を', '高性能', 'スマート', '最適な', '高速な', '軽量な', '大規模', '小規模',
                '複雑な', '日常利用', '課題に対応', '効率的', 'に対応できる', 'なモデル'
            ];
            
            for (const pattern of descriptionPatterns) {
                const index = name.indexOf(pattern);
                if (index > 0) {
                    name = name.substring(0, index).trim();
                    break;
                }
            }
            
            // それでも長すぎる場合は、最初の20文字程度に制限
            if (name.length > 20 && name.includes(' ')) {
                const words = name.split(' ');
                if (words.length > 3) {
                    name = words.slice(0, 3).join(' ');
                }
            }
            
            return name;
        }

        // 既存データをクリーンアップするメソッド
        async cleanupExistingData() {
            this.log('🧹 既存データのクリーンアップを開始...', 'info');
            
            try {
                let hasChanges = false;
                
                // 各AIの設定をチェック
                for (const [aiName, aiConfig] of Object.entries(this.config.aiConfigs)) {
                    if (aiConfig.models && Array.isArray(aiConfig.models)) {
                        const originalModels = [...aiConfig.models];
                        
                        // モデル名をクリーンアップ
                        aiConfig.models = aiConfig.models.map(model => {
                            const originalName = model.name;
                            const cleanedName = this.cleanClaudeModelName(originalName);
                            
                            if (originalName !== cleanedName) {
                                this.log(`🔧 ${aiName.toUpperCase()} モデル名クリーンアップ: "${originalName}" → "${cleanedName}"`, 'info');
                                hasChanges = true;
                                return { ...model, name: cleanedName };
                            }
                            
                            return model;
                        });
                    }
                }
                
                if (hasChanges) {
                    await this.saveConfig();
                    this.log('✅ データクリーンアップが完了しました', 'success');
                    
                    // 変更通知
                    this.notifyChangeListeners('data-cleanup-completed', {
                        timestamp: new Date().toISOString()
                    });
                } else {
                    this.log('ℹ️ クリーンアップの必要なデータはありませんでした', 'info');
                }
                
                return hasChanges;
                
            } catch (error) {
                this.log(`データクリーンアップエラー: ${error.message}`, 'error');
                return false;
            }
        }

        setupChangeListeners() {
            // 変更検出処理完了イベントをリッスン
            window.addEventListener('change-detection-processed', async (event) => {
                const { type, ai, changeEvent } = event.detail;
                
                if (type === 'models') {
                    await this.persistModels(ai, changeEvent.data);
                } else if (type === 'functions') {
                    await this.persistFunctions(ai, changeEvent.data);
                }
            });
        }

        startPeriodicBackup() {
            setInterval(() => {
                this.createBackup('periodic');
            }, this.backupConfig.backupInterval);
        }

        async validateAndMigrateConfig() {
            // 設定の整合性チェック・必要に応じてマイグレーション
            let needsSave = false;
            
            // 必要なプロパティが存在するかチェック
            if (!this.config.statistics) {
                this.config.statistics = this.configStructure.statistics;
                needsSave = true;
            }
            
            if (!this.config.userPreferences) {
                this.config.userPreferences = this.configStructure.userPreferences;
                needsSave = true;
            }
            
            if (needsSave) {
                await this.saveConfig();
                this.log('設定をマイグレーションしました', 'info');
            }
        }

        async migrateConfig(fromVersion, toVersion) {
            this.log(`設定をマイグレーション: ${fromVersion} → ${toVersion}`, 'info');
            
            // バックアップを作成
            await this.createBackup(`before-migration-${fromVersion}-${toVersion}`);
            
            // バージョンを更新
            this.config.version = toVersion;
            
            // TODO: 将来のバージョン間でのマイグレーション処理
        }

        notifyChangeListeners(eventType, data) {
            this.changeListeners.forEach(listener => {
                try {
                    listener(eventType, data);
                } catch (error) {
                    this.log(`変更リスナーエラー: ${error.message}`, 'error');
                }
            });
        }

        // ========================================
        // 公開API
        // ========================================
        getConfig() {
            return JSON.parse(JSON.stringify(this.config));
        }

        getAIConfig(ai) {
            return this.config.aiConfigs[ai] || null;
        }

        getModels(ai) {
            const aiConfig = this.getAIConfig(ai);
            return aiConfig ? aiConfig.models : [];
        }

        getFunctions(ai) {
            const aiConfig = this.getAIConfig(ai);
            return aiConfig ? aiConfig.functions : [];
        }

        getStatistics() {
            return JSON.parse(JSON.stringify(this.config.statistics));
        }

        addChangeListener(listener) {
            if (typeof listener === 'function') {
                this.changeListeners.push(listener);
            }
        }

        removeChangeListener(listener) {
            const index = this.changeListeners.indexOf(listener);
            if (index > -1) {
                this.changeListeners.splice(index, 1);
            }
        }

        async updateUserPreferences(preferences) {
            this.config.userPreferences = { ...this.config.userPreferences, ...preferences };
            await this.saveConfig();
            this.log('ユーザー設定を更新しました', 'info');
        }

        log(message, type = 'info') {
            const colors = {
                info: '#2196F3',
                success: '#4CAF50',
                warning: '#FF9800',
                error: '#F44336'
            };
            
            console.log(`%c[AI-Config] ${message}`, `color: ${colors[type]}`);
        }

        showStatus() {
            const stats = this.getStatistics();
            console.log('\n' + '='.repeat(60));
            console.log('%c🔧 AI設定永続化システム - 状態', 'color: #4CAF50; font-size: 16px; font-weight: bold');
            console.log('='.repeat(60));
            console.log(`初期化済み: ${this.isInitialized ? 'はい' : 'いいえ'}`);
            console.log(`設定バージョン: ${this.config.version}`);
            console.log(`総検出数: ${stats.totalDetections}回`);
            console.log(`モデル変更: ${stats.modelChanges}回`);
            console.log(`機能変更: ${stats.functionChanges}回`);
            console.log(`最終検出: ${stats.lastDetectionDate || 'なし'}`);
            console.log(`バックアップ数: ${this.getBackups().length}個`);
            console.log('='.repeat(60) + '\n');
        }

        showHelp() {
            console.log('\n' + '='.repeat(60));
            console.log('%c📚 AI設定永続化システム - ヘルプ', 'color: #4CAF50; font-size: 16px; font-weight: bold');
            console.log('='.repeat(60));
            console.log('\n【基本操作】');
            console.log('  AIPersistence.getConfig()              // 全設定取得');
            console.log('  AIPersistence.getAIConfig("chatgpt")   // 特定AI設定');
            console.log('  AIPersistence.getModels("claude")      // モデル一覧');
            console.log('  AIPersistence.getFunctions("gemini")   // 機能一覧');
            console.log('\n【履歴操作】');
            console.log('  AIPersistence.getChangeHistory(ai, type) // 変更履歴');
            console.log('  AIPersistence.getStatistics()         // 統計情報');
            console.log('\n【バックアップ】');
            console.log('  AIPersistence.createBackup("label")   // バックアップ作成');
            console.log('  AIPersistence.getBackups()            // バックアップ一覧');
            console.log('  AIPersistence.restoreBackup(key)      // バックアップ復元');
            console.log('\n【エクスポート・インポート】');
            console.log('  AIPersistence.exportConfig()          // 設定エクスポート');
            console.log('  AIPersistence.importConfig(data)      // 設定インポート');
            console.log('\n【状態・ヘルプ】');
            console.log('  AIPersistence.showStatus()            // 状態表示');
            console.log('  AIPersistence.showHelp()              // このヘルプ');
            console.log('='.repeat(60) + '\n');
        }
    }

    // ========================================
    // グローバル公開・自動初期化
    // ========================================
    const aiConfigPersistence = new AIConfigPersistence();
    
    // DOM読み込み完了後に初期化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            aiConfigPersistence.initialize();
        });
    } else {
        aiConfigPersistence.initialize();
    }
    
    // グローバルに公開
    window.AIConfigPersistence = aiConfigPersistence;
    window.AIPersistence = aiConfigPersistence; // 短縮エイリアス

    // 初期化完了メッセージ
    console.log('%c✅ AI設定永続化システムが利用可能になりました！', 'color: #4CAF50; font-size: 16px; font-weight: bold');
    console.log('\n%c🚀 クイックスタート:', 'color: #FF6B6B; font-size: 14px; font-weight: bold');
    console.log('  AIPersistence.showHelp()               // 使い方を表示');
    console.log('  AIPersistence.getConfig()              // 現在の設定を表示');
    console.log('  AIPersistence.showStatus()             // システム状態を表示');
    console.log('\n%c💡 検出した新モデル・機能を自動永続化・バックアップ管理します', 'color: #9C27B0');

})();