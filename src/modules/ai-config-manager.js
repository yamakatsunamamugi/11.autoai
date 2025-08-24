/**
 * @fileoverview AI設定管理モジュール
 * 
 * 全AI自動化で共通利用するAI操作設定を統一管理。
 * リトライ時の設定保持、復元、および設定の正規化を提供。
 * 
 * 【主要機能】
 * - AI操作設定の統一フォーマット
 * - 設定の保存と復元
 * - デフォルト値の管理
 * - 設定の検証と正規化
 */

class AIConfigManager {
  constructor() {
    // AI共通のデフォルト設定
    this.defaultConfig = {
      // 基本設定
      model: null,
      function: null,
      
      // プロンプト設定
      prompt: '',
      systemPrompt: null,
      
      // AI動作設定
      temperature: 0.7,
      maxTokens: null,
      topP: 1.0,
      frequencyPenalty: 0,
      presencePenalty: 0,
      
      // 実行オプション
      enableDeepResearch: false,
      specialMode: null,
      enableWriteVerification: true,
      
      // セル情報（スプレッドシート連携）
      cellInfo: null,
      
      // タイムアウト設定
      timeout: 600000, // 10分
      
      // カスタム設定（AI固有の設定）
      customSettings: {}
    };
    
    // 保存された設定のキャッシュ
    this.configCache = new Map();
  }
  
  /**
   * AI操作設定を正規化
   * @param {Object} config - 入力設定
   * @param {string} aiType - AIタイプ（ChatGPT/Claude/Gemini）
   * @returns {Object} 正規化された設定
   */
  normalizeConfig(config, aiType) {
    const normalized = {
      ...this.defaultConfig,
      ...config,
      aiType
    };
    
    // プロンプトの別名を統一
    if (!normalized.prompt && config.text) {
      normalized.prompt = config.text;
    }
    
    // AI固有の設定を適用
    normalized.customSettings = this.getAISpecificSettings(aiType, config);
    
    return normalized;
  }
  
  /**
   * AI固有の設定を取得
   * @private
   */
  getAISpecificSettings(aiType, config) {
    const customSettings = config.customSettings || {};
    
    switch (aiType) {
      case 'ChatGPT':
        return {
          ...customSettings,
          gptModel: config.gptModel || config.model,
          conversationMode: config.conversationMode,
          webBrowsing: config.webBrowsing,
          codeInterpreter: config.codeInterpreter
        };
        
      case 'Claude':
        return {
          ...customSettings,
          claudeModel: config.claudeModel || config.model,
          artifactsEnabled: config.artifactsEnabled,
          searchEnabled: config.searchEnabled
        };
        
      case 'Gemini':
        return {
          ...customSettings,
          geminiModel: config.geminiModel || config.model,
          safetySettings: config.safetySettings,
          generationConfig: config.generationConfig
        };
        
      default:
        return customSettings;
    }
  }
  
  /**
   * 設定を保存
   * @param {string} taskId - タスクID
   * @param {Object} config - 保存する設定
   * @param {string} aiType - AIタイプ
   */
  saveConfig(taskId, config, aiType) {
    const normalizedConfig = this.normalizeConfig(config, aiType);
    this.configCache.set(taskId, {
      config: normalizedConfig,
      aiType,
      timestamp: Date.now()
    });
    
    console.log(`[AIConfigManager] 設定を保存: ${taskId}`, {
      aiType,
      model: normalizedConfig.model,
      function: normalizedConfig.function
    });
    
    return normalizedConfig;
  }
  
  /**
   * 設定を取得
   * @param {string} taskId - タスクID
   * @returns {Object|null} 保存された設定
   */
  getConfig(taskId) {
    const cached = this.configCache.get(taskId);
    if (cached) {
      console.log(`[AIConfigManager] 設定を復元: ${taskId}`, {
        aiType: cached.aiType,
        age: Date.now() - cached.timestamp
      });
      return cached.config;
    }
    return null;
  }
  
  /**
   * リトライ用の設定を作成
   * @param {Object} originalConfig - 元の設定
   * @param {Object} retryOptions - リトライオプション
   * @returns {Object} リトライ用設定
   */
  createRetryConfig(originalConfig, retryOptions = {}) {
    const retryConfig = {
      ...originalConfig,
      ...retryOptions,
      retryAttempt: (originalConfig.retryAttempt || 0) + 1,
      originalTaskId: originalConfig.taskId
    };
    
    // リトライ時は新しいタスクIDを生成
    if (!retryOptions.taskId) {
      retryConfig.taskId = this.generateTaskId();
    }
    
    return retryConfig;
  }
  
  /**
   * ウィンドウ再起動用のメッセージを作成
   * @param {Object} config - AI操作設定
   * @param {Object} context - 追加コンテキスト
   * @returns {Object} メッセージオブジェクト
   */
  createRestartMessage(config, context = {}) {
    const message = {
      type: 'CLOSE_AND_REOPEN_WINDOW',
      
      // 基本情報
      taskId: config.taskId || this.generateTaskId(),
      aiType: config.aiType,
      
      // AI操作設定
      prompt: config.prompt,
      model: config.model,
      function: config.function,
      
      // 詳細設定
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      topP: config.topP,
      frequencyPenalty: config.frequencyPenalty,
      presencePenalty: config.presencePenalty,
      systemPrompt: config.systemPrompt,
      
      // 実行オプション
      enableDeepResearch: config.enableDeepResearch,
      specialMode: config.specialMode,
      enableWriteVerification: config.enableWriteVerification,
      
      // リトライ情報
      retryAttempt: context.retryAttempt || 1,
      originalError: context.originalError,
      stepNumber: context.stepNumber,
      
      // セル情報
      cellInfo: config.cellInfo,
      
      // カスタム設定
      customSettings: config.customSettings
    };
    
    return message;
  }
  
  /**
   * 設定の検証
   * @param {Object} config - 検証する設定
   * @returns {Object} 検証結果
   */
  validateConfig(config) {
    const errors = [];
    const warnings = [];
    
    // 必須フィールドのチェック
    if (!config.prompt && !config.text) {
      errors.push('プロンプトが指定されていません');
    }
    
    if (!config.aiType) {
      errors.push('AIタイプが指定されていません');
    }
    
    // 数値範囲のチェック
    if (config.temperature !== undefined) {
      if (config.temperature < 0 || config.temperature > 2) {
        warnings.push('temperatureは0～2の範囲で指定してください');
      }
    }
    
    if (config.topP !== undefined) {
      if (config.topP < 0 || config.topP > 1) {
        warnings.push('topPは0～1の範囲で指定してください');
      }
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }
  
  /**
   * タスクIDを生成
   * @private
   */
  generateTaskId() {
    return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  /**
   * 古いキャッシュをクリア
   * @param {number} maxAge - 最大保持時間（ミリ秒）
   */
  clearOldCache(maxAge = 3600000) { // デフォルト1時間
    const now = Date.now();
    const keysToDelete = [];
    
    this.configCache.forEach((value, key) => {
      if (now - value.timestamp > maxAge) {
        keysToDelete.push(key);
      }
    });
    
    keysToDelete.forEach(key => {
      this.configCache.delete(key);
    });
    
    if (keysToDelete.length > 0) {
      console.log(`[AIConfigManager] 古いキャッシュをクリア: ${keysToDelete.length}件`);
    }
  }
  
  /**
   * 統計情報を取得
   */
  getStatistics() {
    const stats = {
      totalConfigs: this.configCache.size,
      byAIType: {},
      oldestConfig: null,
      newestConfig: null
    };
    
    let oldest = Infinity;
    let newest = 0;
    
    this.configCache.forEach((value) => {
      // AIタイプ別の集計
      stats.byAIType[value.aiType] = (stats.byAIType[value.aiType] || 0) + 1;
      
      // 最古・最新の特定
      if (value.timestamp < oldest) {
        oldest = value.timestamp;
        stats.oldestConfig = new Date(value.timestamp).toISOString();
      }
      if (value.timestamp > newest) {
        newest = value.timestamp;
        stats.newestConfig = new Date(value.timestamp).toISOString();
      }
    });
    
    return stats;
  }
  
  /**
   * すべてのキャッシュをクリア
   */
  clearAll() {
    this.configCache.clear();
    console.log('[AIConfigManager] すべてのキャッシュをクリアしました');
  }
}

// シングルトンインスタンスを作成
const aiConfigManager = new AIConfigManager();

// グローバルに公開
if (typeof window !== 'undefined') {
  window.AIConfigManager = AIConfigManager;
  window.aiConfigManager = aiConfigManager;
}

// モジュールエクスポート
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { AIConfigManager, aiConfigManager };
}