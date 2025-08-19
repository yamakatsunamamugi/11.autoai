/**
 * @fileoverview 動的設定管理システム
 * 
 * test-runner-chrome.jsで検証済みの動的モデル・機能選択システムを
 * 本番システムに統合するためのモジュール
 * 
 * 【特徴】
 * - UIから直接リアルタイムで設定を取得
 * - 動的なモデル・機能選択
 * - テスト済みで動作保証
 */

/**
 * 動的設定管理クラス
 * UIの現在値をリアルタイムで取得し、AIの設定を動的に管理
 */
export class DynamicConfigManager {
  constructor() {
    this.supportedAIs = ['chatgpt', 'claude', 'gemini', 'genspark'];
  }

  /**
   * テスト設定を動的に取得（test-runner-chrome.jsから移植）
   * UIの現在値を直接読み取り、またはchrome.storageから取得
   * @returns {Object|Promise<Object>} AI設定オブジェクト
   */
  async getTestConfig() {
    // Service Worker環境の場合はchrome.storageから取得
    if (typeof document === 'undefined') {
      try {
        const result = await chrome.storage.local.get('dynamicAIConfig');
        if (result.dynamicAIConfig) {
          console.log('[DynamicConfigManager] chrome.storageから設定取得:', result.dynamicAIConfig);
          return result.dynamicAIConfig;
        }
      } catch (error) {
        console.warn('[DynamicConfigManager] chrome.storage取得エラー:', error);
      }
      // デフォルト値を返す
      return {
        claude: { enabled: false, model: '', function: '', prompt: '' },
        chatgpt: { enabled: false, model: '', function: '', prompt: '' },
        gemini: { enabled: false, model: '', function: '', prompt: '' },
        genspark: { enabled: false, model: '', function: '', prompt: '' }
      };
    }
    
    // ブラウザ環境の場合は従来通りdocumentから取得
    const getPrompt = (aiName) => {
      const inputElement = document.getElementById(`${aiName}-prompt`);
      return inputElement?.value || '';
    };
    
    const config = {
      claude: {
        enabled: document.getElementById('enable-claude')?.checked || false,
        model: document.getElementById('claude-model')?.value || '',
        function: document.getElementById('claude-feature')?.value || '',
        prompt: getPrompt('claude'),
      },
      chatgpt: {
        enabled: document.getElementById('enable-chatgpt')?.checked || false,
        model: document.getElementById('chatgpt-model')?.value || '',
        function: document.getElementById('chatgpt-feature')?.value || '',
        prompt: getPrompt('chatgpt'),
      },
      gemini: {
        enabled: document.getElementById('enable-gemini')?.checked || false,
        model: document.getElementById('gemini-model')?.value || '',
        function: document.getElementById('gemini-feature')?.value || '',
        prompt: getPrompt('gemini'),
      },
      genspark: {
        enabled: document.getElementById('enable-genspark')?.checked || false,
        model: document.getElementById('genspark-model')?.value || '',
        function: document.getElementById('genspark-feature')?.value || '',
        prompt: getPrompt('genspark'),
      },
    };
    
    // UIから取得した設定をchrome.storageに保存（他の環境でも使えるように）
    try {
      await chrome.storage.local.set({ dynamicAIConfig: config });
      console.log('[DynamicConfigManager] 設定をchrome.storageに保存');
    } catch (error) {
      console.warn('[DynamicConfigManager] chrome.storage保存エラー:', error);
    }
    
    return config;
  }

  /**
   * 特定AIの設定を動的取得
   * @param {string} aiType - AI種別
   * @returns {Promise<Object>} AI設定
   */
  async getAIConfig(aiType) {
    const config = await this.getTestConfig();
    return config[aiType.toLowerCase()] || null;
  }

  /**
   * DeepResearch機能判定（test-runner-chrome.jsから移植）
   * @param {string} functionType - 機能タイプ
   * @returns {boolean} DeepResearch機能かどうか
   */
  isDeepResearchFunction(functionType) {
    if (!functionType) return false;
    
    // FeatureConstantsが利用可能な場合はそれを使用
    if (window.FeatureConstants?.isDeepResearch) {
      return window.FeatureConstants.isDeepResearch(functionType);
    }
    
    // フォールバック: 文字列チェック
    return functionType.toLowerCase().includes('research');
  }

  /**
   * 動的URL生成（test-runner-chrome.jsから移植）
   * 機能タイプに応じてURLを動的に決定
   * @param {string} aiType - AI種別
   * @param {string} functionType - 機能タイプ
   * @returns {string} 生成されたURL
   */
  generateDynamicURL(aiType, functionType = null) {
    const baseUrls = {
      'claude': 'https://claude.ai/new',
      'chatgpt': 'https://chatgpt.com', 
      'gemini': 'https://gemini.google.com/app',
      'genspark': 'https://www.genspark.ai/agents?type=slides_agent'  // デフォルト
    };
    
    const aiName = aiType.toLowerCase();
    
    // Gensparkの場合、機能に応じてURLを動的変更
    if (aiName === 'genspark' && functionType) {
      if (functionType === 'factcheck' || functionType === 'fact-check' || 
          functionType.toLowerCase().includes('fact') || functionType.toLowerCase().includes('check')) {
        return 'https://www.genspark.ai/agents?type=agentic_cross_check';
      } else {
        return 'https://www.genspark.ai/agents?type=slides_agent';
      }
    }

    return baseUrls[aiName] || baseUrls['chatgpt'];
  }

  /**
   * 有効なAIリストを動的取得
   * @returns {Array} 有効なAI情報の配列
   */
  getEnabledAIs() {
    const config = this.getTestConfig();
    const enabledAIs = [];
    const aiOrder = ['ChatGPT', 'Claude', 'Gemini', 'Genspark'];
    
    aiOrder.forEach((ai, index) => {
      const aiKey = ai.toLowerCase();
      if (config[aiKey] && config[aiKey].enabled) {
        enabledAIs.push({ 
          name: ai, 
          key: aiKey,
          position: index,
          config: config[aiKey]
        });
      }
    });
    
    return enabledAIs;
  }

  /**
   * タスク実行用の設定を生成
   * @param {string} aiType - AI種別
   * @returns {Object} タスク実行設定
   */
  createTaskExecutionConfig(aiType) {
    const aiConfig = this.getAIConfig(aiType);
    if (!aiConfig) return null;

    return {
      aiType: aiType,
      model: aiConfig.model,
      function: aiConfig.function,
      prompt: aiConfig.prompt,
      url: this.generateDynamicURL(aiType, aiConfig.function),
      isDeepResearch: this.isDeepResearchFunction(aiConfig.function),
      enabled: aiConfig.enabled
    };
  }

  /**
   * 設定が変更されたかチェック
   * @param {Object} previousConfig - 前回の設定
   * @returns {boolean} 変更されたかどうか
   */
  hasConfigChanged(previousConfig) {
    const currentConfig = this.getTestConfig();
    return JSON.stringify(currentConfig) !== JSON.stringify(previousConfig);
  }

  /**
   * デバッグ情報を取得
   * @returns {Object} デバッグ情報
   */
  getDebugInfo() {
    const config = this.getTestConfig();
    const enabledAIs = this.getEnabledAIs();
    
    return {
      timestamp: new Date().toISOString(),
      totalAIs: this.supportedAIs.length,
      enabledCount: enabledAIs.length,
      enabledAIs: enabledAIs.map(ai => ai.name),
      fullConfig: config,
      hasUI: typeof document !== 'undefined'
    };
  }
}

// シングルトンインスタンス
let dynamicConfigManagerInstance = null;

/**
 * DynamicConfigManagerのシングルトンインスタンスを取得
 * @returns {DynamicConfigManager} インスタンス
 */
export function getDynamicConfigManager() {
  if (!dynamicConfigManagerInstance) {
    dynamicConfigManagerInstance = new DynamicConfigManager();
  }
  return dynamicConfigManagerInstance;
}

/**
 * 便利関数：テスト設定を直接取得
 * @returns {Object} テスト設定
 */
export function getTestConfig() {
  return getDynamicConfigManager().getTestConfig();
}

/**
 * 便利関数：有効なAIリストを取得
 * @returns {Array} 有効なAI配列
 */
export function getEnabledAIs() {
  return getDynamicConfigManager().getEnabledAIs();
}