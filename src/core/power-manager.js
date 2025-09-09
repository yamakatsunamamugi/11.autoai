/**
 * PowerManager - スリープ防止の統一管理システム
 * 
 * AI処理中のスリープ/スクリーンセイバーを防止する中央管理クラス
 * Chrome Power APIを使用して、複数のAI処理が並列実行されても
 * 正しく動作するよう参照カウント方式で管理する
 * 
 * @class PowerManager
 */
class PowerManager {
  constructor() {
    // スリープ防止が有効かどうか
    this.isActive = false;
    
    // アクティブな処理の数（参照カウント）
    this.activeProcessCount = 0;
    
    // Keep-Aliveインターバルのタイマー
    this.keepAliveInterval = null;
    
    // デバッグログ用
    this.startTime = null;
    
    console.log('🔧 [PowerManager] 初期化完了');
  }

  /**
   * スリープ防止を開始
   * 複数回呼ばれても参照カウントで管理
   * 
   * @param {string} source - 呼び出し元の識別子（デバッグ用）
   */
  async startProtection(source = 'unknown') {
    this.activeProcessCount++;
    
    console.log(`🛡️ [PowerManager] 保護開始要求 from ${source} (カウント: ${this.activeProcessCount})`);
    console.log(`📊 [PowerManager] 現在の状態: isActive=${this.isActive}, timestamp=${new Date().toISOString()}`);
    
    if (!this.isActive) {
      this.isActive = true;
      this.startTime = Date.now();
      
      try {
        // 1. Chrome Power API でシステムスリープを防止（メイン防止策）
        console.log('🔄 [PowerManager] Chrome Power API呼び出し前 - systemレベル');
        chrome.power.requestKeepAwake('system');
        console.log('✅ [PowerManager] Chrome Power API: システムスリープ防止を開始');
        console.log(`✅ [PowerManager] requestKeepAwake('system')実行完了 at ${new Date().toISOString()}`);
        console.log('📊 [PowerManager] 防止レベル: system (ディスプレイオフも防止)');
        
        // 2. Keep-Alive インターバル（補助策）
        // 15秒ごとにダミーメッセージを送信してService Workerの活性を維持
        this.keepAliveInterval = setInterval(() => {
          try {
            const pingTime = Date.now();
            chrome.runtime.sendMessage({ type: 'KEEP_ALIVE_PING', timestamp: pingTime });
            console.log(`📡 [PowerManager] Keep-Alive ping送信 at ${new Date(pingTime).toISOString()}`);
          } catch (error) {
            console.error('❌ [PowerManager] Keep-Alive pingエラー:', error);
          }
        }, 15000);
        
        console.log('🛡️ [PowerManager] スリープ防止システムを完全に起動しました');
        
        // LogManagerにも記録
        if (globalThis.logManager) {
          globalThis.logManager.log('スリープ防止を開始しました', {
            level: 'info',
            category: 'system',
            metadata: {
              source,
              activeCount: this.activeProcessCount
            }
          });
        }
      } catch (error) {
        console.error('❌ [PowerManager] スリープ防止の開始に失敗:', error);
        console.error('❌ [PowerManager] エラー詳細:', {
          message: error.message,
          stack: error.stack,
          source,
          timestamp: new Date().toISOString()
        });
        
        // エラー時でも重要な処理中は防止を維持（カウントは減らさない）
        console.warn('⚠️ [PowerManager] エラー発生しましたが、スリープ防止を維持します');
        console.log(`📊 [PowerManager] 現在のカウント: ${this.activeProcessCount}`);
        
        // フォールバック: displayレベルで再試行
        try {
          console.log('🔄 [PowerManager] フォールバック: displayレベルで再試行');
          chrome.power.requestKeepAwake('display');
          console.log('✅ [PowerManager] フォールバック成功: displayレベルで防止開始');
        } catch (fallbackError) {
          console.error('❌ [PowerManager] フォールバックも失敗:', fallbackError);
          // 最終的に失敗した場合のみリセット
          this.isActive = false;
          this.activeProcessCount--;
        }
      }
    } else {
      console.log(`📊 [PowerManager] 既にアクティブ (参照カウント: ${this.activeProcessCount})`);
    }
  }

  /**
   * スリープ防止を停止
   * 参照カウントが0になったときのみ実際に停止
   * 
   * @param {string} source - 呼び出し元の識別子（デバッグ用）
   */
  async stopProtection(source = 'unknown') {
    this.activeProcessCount--;
    
    console.log(`🔓 [PowerManager] 保護解除要求 from ${source} (カウント: ${this.activeProcessCount})`);
    console.log(`📊 [PowerManager] 解除前の状態: isActive=${this.isActive}, timestamp=${new Date().toISOString()}`);
    
    // カウントが0以下になったら完全に停止
    if (this.activeProcessCount <= 0 && this.isActive) {
      this.isActive = false;
      this.activeProcessCount = 0; // 念のため0にリセット
      
      try {
        // Chrome Power APIを解除
        console.log('🔄 [PowerManager] Chrome Power API解除呼び出し前');
        chrome.power.releaseKeepAwake();
        console.log('✅ [PowerManager] Chrome Power API: システムスリープ防止を解除');
        console.log(`✅ [PowerManager] releaseKeepAwake実行完了 at ${new Date().toISOString()}`);
        
        // Keep-Aliveインターバルを停止
        if (this.keepAliveInterval) {
          clearInterval(this.keepAliveInterval);
          this.keepAliveInterval = null;
          console.log('✅ [PowerManager] Keep-Aliveインターバルを停止');
        }
        
        // 実行時間を計算
        const duration = this.startTime ? Math.round((Date.now() - this.startTime) / 1000) : 0;
        console.log(`✅ [PowerManager] スリープ防止を完全に解除しました (実行時間: ${duration}秒)`);
        
        // LogManagerにも記録
        if (globalThis.logManager) {
          globalThis.logManager.log(`スリープ防止を解除しました (実行時間: ${duration}秒)`, {
            level: 'info',
            category: 'system',
            metadata: {
              source,
              duration: `${duration}秒`
            }
          });
        }
        
        this.startTime = null;
      } catch (error) {
        console.error('❌ [PowerManager] スリープ防止の解除に失敗:', error);
        console.error('❌ [PowerManager] 解除エラー詳細:', {
          message: error.message,
          stack: error.stack,
          source,
          timestamp: new Date().toISOString()
        });
      }
    } else if (this.activeProcessCount < 0) {
      // 異常な状態をリセット
      console.warn('⚠️ [PowerManager] 参照カウントが負の値になりました。リセットします。');
      this.activeProcessCount = 0;
    } else {
      console.log(`📊 [PowerManager] まだアクティブな処理があります (残り: ${this.activeProcessCount})`);
    }
  }

  /**
   * 現在の状態を取得
   * 
   * @returns {Object} 現在の状態
   */
  getStatus() {
    const status = {
      isActive: this.isActive,
      activeProcessCount: this.activeProcessCount,
      hasKeepAlive: !!this.keepAliveInterval,
      runningTime: this.startTime ? Math.round((Date.now() - this.startTime) / 1000) : 0,
      timestamp: new Date().toISOString()
    };
    console.log('📋 [PowerManager] 現在のステータス:', status);
    return status;
  }

  /**
   * 強制リセット（エラー時の復旧用）
   */
  forceReset() {
    console.warn('⚠️ [PowerManager] 強制リセットを実行');
    
    try {
      // Chrome Power APIを解除
      chrome.power.releaseKeepAwake();
      
      // Keep-Aliveインターバルを停止
      if (this.keepAliveInterval) {
        clearInterval(this.keepAliveInterval);
      }
    } catch (error) {
      console.error('❌ [PowerManager] 強制リセット中のエラー:', error);
    }
    
    // 状態をリセット
    this.isActive = false;
    this.activeProcessCount = 0;
    this.keepAliveInterval = null;
    this.startTime = null;
    
    console.log('✅ [PowerManager] 強制リセット完了');
  }
}

// Service Worker環境用のエクスポート
export default PowerManager;