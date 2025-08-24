/**
 * @fileoverview AI自動化スクリプトラッパー
 * 
 * 各AI自動化スクリプト（ChatGPT/Claude/Gemini）のrunAutomation関数を
 * ラップして、統合エラーリカバリー機能を自動的に適用する。
 * 
 * 【特徴】
 * - 既存コードの変更を最小限に抑える
 * - 各ステップのエラーを自動的にキャッチ
 * - 統合エラーリカバリーシステムとの連携
 */

class AIAutomationWrapper {
  constructor(aiType) {
    this.aiType = aiType;
    this.originalAutomation = null;
    this.errorRecovery = null;
    
    // AI設定マネージャーを初期化
    this.configManager = window.aiConfigManager || new (window.AIConfigManager || class {})();
    
    // 統合エラーリカバリーの初期化
    if (typeof window.UnifiedErrorRecovery === 'function') {
      this.errorRecovery = new window.UnifiedErrorRecovery({
        aiType: this.aiType,
        enableLogging: true
      });
      console.log(`✅ [${this.aiType}] UnifiedErrorRecoveryを初期化しました`);
    }
    
    // 元の自動化オブジェクトを取得
    this.getOriginalAutomation();
  }
  
  /**
   * 元の自動化オブジェクトを取得
   * @private
   */
  getOriginalAutomation() {
    switch (this.aiType) {
      case 'ChatGPT':
        this.originalAutomation = window.ChatGPTAutomation;
        break;
      case 'Claude':
        this.originalAutomation = window.ClaudeAutomation;
        break;
      case 'Gemini':
        this.originalAutomation = window.GeminiAutomation || window.Gemini;
        break;
    }
  }
  
  /**
   * runAutomation関数をラップ
   */
  wrapRunAutomation() {
    if (!this.originalAutomation || !this.originalAutomation.runAutomation) {
      console.warn(`[${this.aiType}] runAutomation関数が見つかりません`);
      return;
    }
    
    const originalRun = this.originalAutomation.runAutomation.bind(this.originalAutomation);
    const self = this;
    
    // ラップした関数で置き換え
    this.originalAutomation.runAutomation = async function(config) {
      return await self.runAutomationWithRecovery(originalRun, config);
    };
    
    console.log(`✅ [${self.aiType}] runAutomation関数をラップしました`);
  }
  
  /**
   * エラーリカバリー付きでrunAutomationを実行
   * @private
   */
  async runAutomationWithRecovery(originalRun, config) {
    const taskId = config.taskId || this.generateTaskId();
    let currentStep = 0;
    let lastError = null;
    let retryCount = 0;
    const maxRetries = 3;
    
    while (retryCount < maxRetries) {
      try {
        console.log(`[${this.aiType}] 実行開始 (試行 ${retryCount + 1}/${maxRetries})`);
        
        // ステップごとのエラーをキャッチするためのプロキシを設定
        const proxiedConfig = this.createProxiedConfig(config, taskId);
        
        // 元の関数を実行
        const result = await originalRun(proxiedConfig);
        
        // 結果をチェック
        if (this.isErrorResult(result)) {
          throw new Error(result.error || result.errorMessage || '処理失敗');
        }
        
        return result;
        
      } catch (error) {
        console.error(`[${this.aiType}] エラー検出:`, error);
        lastError = error;
        
        // エラーリカバリーを実行
        if (this.errorRecovery) {
          const stepNumber = this.detectStepFromError(error);
          
          // AI設定マネージャーで設定を正規化して保存
          const normalizedConfig = this.configManager.saveConfig(taskId, config, this.aiType);
          
          // リカバリーに必要な情報だけを渡す（共通化）
          const recoveryResult = await this.errorRecovery.handleStepError(
            stepNumber,
            error,
            {
              ...normalizedConfig,
              taskId,
              currentRetry: retryCount
            }
          );
          
          if (recoveryResult.success) {
            console.log(`[${this.aiType}] リカバリー成功`);
            // リカバリー成功後は元の処理を再実行
            retryCount++;
            continue;
          }
          
          if (recoveryResult.finalError) {
            console.error(`[${this.aiType}] 最終エラー:`, recoveryResult.errorMessage);
            return recoveryResult;
          }
          
          if (recoveryResult.needsRetry) {
            retryCount++;
            // 待機時間がある場合は待機
            if (recoveryResult.waitTime) {
              await this.wait(recoveryResult.waitTime);
            }
            continue;
          }
        }
        
        retryCount++;
      }
    }
    
    // 最大リトライ回数超過
    return {
      success: false,
      error: 'MAX_RETRIES_EXCEEDED',
      errorMessage: `最大リトライ回数（${maxRetries}回）を超過しました`,
      originalError: lastError?.message,
      taskId
    };
  }
  
  /**
   * エラーからステップ番号を検出
   * @private
   */
  detectStepFromError(error) {
    const errorMessage = (error.message || '').toLowerCase();
    
    // エラーメッセージからステップを推測
    if (errorMessage.includes('step1') || errorMessage.includes('スプレッドシート')) {
      return 1;
    }
    if (errorMessage.includes('step2') || errorMessage.includes('タスクリスト')) {
      return 2;
    }
    if (errorMessage.includes('step3') || errorMessage.includes('送信') || errorMessage.includes('実行')) {
      return 3;
    }
    if (errorMessage.includes('step4') || errorMessage.includes('待機') || errorMessage.includes('停止ボタン')) {
      return 4;
    }
    if (errorMessage.includes('step5') || errorMessage.includes('応答取得') || errorMessage.includes('response fetch')) {
      return 5;
    }
    
    // デフォルトはStep3（AI実行）とする
    return 3;
  }
  
  /**
   * 結果がエラーかどうかを判定
   * @private
   */
  isErrorResult(result) {
    if (!result) return true;
    
    // 明示的なエラーフラグ
    if (result.success === false) return true;
    if (result.error || result.errorMessage) return true;
    if (result.errorType === 'AIResponseFetchError') return true;
    
    // Step5の応答取得失敗パターン
    if (result.error === 'RESPONSE_FETCH_ERROR') return true;
    if (result.needsRetry) return true;
    
    return false;
  }
  
  /**
   * 設定オブジェクトのプロキシを作成
   * @private
   */
  createProxiedConfig(config, taskId) {
    return {
      ...config,
      taskId,
      // エラーハンドリングのためのコールバックを追加
      onStepError: (stepNumber, error) => {
        console.log(`[${this.aiType}] Step${stepNumber}エラーコールバック:`, error);
        // ここでステップエラーをキャッチして処理できる
      }
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
   * 待機処理
   * @private
   */
  wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * 自動初期化
   * 各AI自動化スクリプトをラップ
   */
  static initializeAll() {
    const aiTypes = ['ChatGPT', 'Claude', 'Gemini'];
    
    aiTypes.forEach(aiType => {
      // 自動化オブジェクトが存在する場合のみラップ
      const automationObj = 
        aiType === 'ChatGPT' ? window.ChatGPTAutomation :
        aiType === 'Claude' ? window.ClaudeAutomation :
        aiType === 'Gemini' ? (window.GeminiAutomation || window.Gemini) :
        null;
      
      if (automationObj && automationObj.runAutomation) {
        const wrapper = new AIAutomationWrapper(aiType);
        wrapper.wrapRunAutomation();
      }
    });
    
    // グローバルエラーハンドラーを設定
    AIAutomationWrapper.setupGlobalErrorHandlers();
  }
  
  /**
   * グローバルエラーハンドラーの設定
   * すべての未処理エラーをキャッチして統合システムで処理
   */
  static setupGlobalErrorHandlers() {
    // 現在のAIタイプを検出
    const detectAIType = () => {
      const hostname = window.location.hostname;
      if (hostname.includes('chatgpt.com') || hostname.includes('openai.com')) return 'ChatGPT';
      if (hostname.includes('claude.ai')) return 'Claude';
      if (hostname.includes('gemini.google.com') || hostname.includes('bard.google.com')) return 'Gemini';
      if (hostname.includes('genspark')) return 'Genspark';
      return 'Unknown';
    };
    
    const aiType = detectAIType();
    const errorRecovery = new (window.UnifiedErrorRecovery || class {})({
      aiType,
      enableLogging: true
    });
    
    // 通常のエラーをキャッチ
    const originalOnError = window.onerror;
    window.onerror = function(message, source, lineno, colno, error) {
      // エラーオブジェクトを適切に文字列化
      const errorDetails = {
        message: message,
        source: source,
        lineno: lineno,
        colno: colno,
        error: error ? {
          message: error.message,
          stack: error.stack,
          name: error.name
        } : null
      };
      console.error(`[GlobalErrorHandler] エラーをキャッチ:`, JSON.stringify(errorDetails, null, 2));
      
      // 統合エラーリカバリーで処理
      if (errorRecovery && errorRecovery.handleStepError) {
        const stepNumber = AIAutomationWrapper.detectStepFromGlobalError(error || new Error(message));
        errorRecovery.handleStepError(stepNumber, error || new Error(message), {
          aiType,
          taskId: window.currentTaskId || 'global_' + Date.now(),
          source: 'global_error_handler',
          location: `${source}:${lineno}:${colno}`
        });
      }
      
      // 元のハンドラーも実行
      if (originalOnError) {
        return originalOnError.apply(this, arguments);
      }
      return true; // エラーを処理済みとする
    };
    
    // Promiseのrejectをキャッチ
    const originalOnUnhandledRejection = window.onunhandledrejection;
    window.onunhandledrejection = function(event) {
      console.error(`[GlobalErrorHandler] 未処理のPromise rejection:`, event.reason);
      
      // 統合エラーリカバリーで処理
      if (errorRecovery && errorRecovery.handleStepError) {
        const error = event.reason instanceof Error ? event.reason : new Error(String(event.reason));
        const stepNumber = AIAutomationWrapper.detectStepFromGlobalError(error);
        errorRecovery.handleStepError(stepNumber, error, {
          aiType,
          taskId: window.currentTaskId || 'global_' + Date.now(),
          source: 'unhandled_rejection',
          promise: event.promise
        });
      }
      
      // 元のハンドラーも実行
      if (originalOnUnhandledRejection) {
        return originalOnUnhandledRejection.apply(this, arguments);
      }
      event.preventDefault(); // デフォルトのエラー表示を防ぐ
    };
    
    console.log(`✅ [AIAutomationWrapper] グローバルエラーハンドラーを設定しました (AI: ${aiType})`);
  }
  
  /**
   * グローバルエラーからステップ番号を検出
   * @private
   */
  static detectStepFromGlobalError(error) {
    const errorMessage = (error.message || error.toString()).toLowerCase();
    const stackTrace = error.stack || '';
    
    // スタックトレースやエラーメッセージから推測
    if (errorMessage.includes('spreadsheet') || stackTrace.includes('spreadsheet')) {
      return 1;
    }
    if (errorMessage.includes('task') || errorMessage.includes('list')) {
      return 2;
    }
    if (errorMessage.includes('send') || errorMessage.includes('prompt') || errorMessage.includes('input')) {
      return 3;
    }
    if (errorMessage.includes('wait') || errorMessage.includes('timeout')) {
      return 4;
    }
    if (errorMessage.includes('response') || errorMessage.includes('fetch')) {
      return 5;
    }
    
    // デフォルトはStep3（AI実行）
    return 3;
  }
}

// グローバルに公開
if (typeof window !== 'undefined') {
  window.AIAutomationWrapper = AIAutomationWrapper;
  
  // ページ読み込み完了後に自動初期化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(() => {
        AIAutomationWrapper.initializeAll();
      }, 2000); // 他のスクリプトの読み込みを待つ
    });
  } else {
    // 既に読み込み完了している場合
    setTimeout(() => {
      AIAutomationWrapper.initializeAll();
    }, 2000);
  }
}

// モジュールエクスポート
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AIAutomationWrapper;
}