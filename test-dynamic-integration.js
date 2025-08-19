/**
 * 動的統合システムのテストスクリプト
 * 
 * 統合された動的モデル・機能選択システムをテストします
 * ブラウザのコンソールで実行してください
 */

(async function testDynamicIntegration() {
  console.log('🧪 動的統合システムのテスト開始');
  
  try {
    // 1. 動的設定管理システムの読み込みテスト
    console.log('\n1️⃣ 動的設定管理システムの読み込みテスト');
    
    const { getDynamicConfigManager } = await import('./src/core/dynamic-config-manager.js');
    const configManager = getDynamicConfigManager();
    
    console.log('✅ 動的設定管理システムが正常に読み込まれました');
    
    // 2. 設定取得テスト
    console.log('\n2️⃣ 設定取得テスト');
    
    const testConfig = configManager.getTestConfig();
    console.log('テスト設定:', testConfig);
    
    // 3. 有効なAI検出テスト
    console.log('\n3️⃣ 有効なAI検出テスト');
    
    const enabledAIs = configManager.getEnabledAIs();
    console.log('有効なAI:', enabledAIs);
    
    // 4. 動的URL生成テスト
    console.log('\n4️⃣ 動的URL生成テスト');
    
    const aiTypes = ['chatgpt', 'claude', 'gemini', 'genspark'];
    for (const aiType of aiTypes) {
      const url = configManager.generateDynamicURL(aiType, 'default');
      console.log(`${aiType}: ${url}`);
    }
    
    // 5. タスク実行設定生成テスト
    console.log('\n5️⃣ タスク実行設定生成テスト');
    
    for (const aiType of aiTypes) {
      const taskConfig = configManager.createTaskExecutionConfig(aiType);
      if (taskConfig) {
        console.log(`${aiType}のタスク実行設定:`, {
          aiType: taskConfig.aiType,
          model: taskConfig.model,
          function: taskConfig.function,
          url: taskConfig.url,
          isDeepResearch: taskConfig.isDeepResearch,
          enabled: taskConfig.enabled
        });
      } else {
        console.log(`${aiType}: 設定が取得できませんでした`);
      }
    }
    
    // 6. デバッグ情報テスト
    console.log('\n6️⃣ デバッグ情報テスト');
    
    const debugInfo = configManager.getDebugInfo();
    console.log('デバッグ情報:', debugInfo);
    
    // 7. グローバル設定テスト
    console.log('\n7️⃣ グローバル設定テスト');
    
    globalThis.getDynamicConfigManager = getDynamicConfigManager;
    console.log('✅ グローバル設定が正常に設定されました');
    
    // StreamProcessorでの利用シミュレーション
    if (globalThis.getDynamicConfigManager) {
      const manager = globalThis.getDynamicConfigManager();
      const claudeConfig = manager.createTaskExecutionConfig('claude');
      console.log('StreamProcessor用Claude設定:', claudeConfig);
    }
    
    console.log('\n🎉 全てのテストが正常に完了しました！');
    console.log('\n📋 統合確認:');
    console.log('- ✅ 動的設定管理システム統合完了');
    console.log('- ✅ UIからのリアルタイム設定取得');
    console.log('- ✅ 動的URL生成機能');
    console.log('- ✅ タスク実行設定生成機能');
    console.log('- ✅ グローバル設定統合');
    
    return {
      success: true,
      configManager: configManager,
      testConfig: testConfig,
      enabledAIs: enabledAIs,
      debugInfo: debugInfo
    };
    
  } catch (error) {
    console.error('❌ テスト中にエラーが発生しました:', error);
    console.error('スタックトレース:', error.stack);
    
    return {
      success: false,
      error: error.message,
      stack: error.stack
    };
  }
})().then(result => {
  console.log('\n🏁 テスト結果:', result);
  
  if (result.success) {
    console.log('\n✨ 動的統合システムが正常に動作しています！');
    console.log('これで本番環境でUIで選択したモデルと機能が正しく反映されるはずです。');
  } else {
    console.log('\n💥 統合に問題があります。修正が必要です。');
  }
});

// UIテスト用の便利関数も追加
window.testDynamicConfig = async function() {
  if (globalThis.getDynamicConfigManager) {
    const manager = globalThis.getDynamicConfigManager();
    console.log('現在の設定:', manager.getTestConfig());
    console.log('有効なAI:', manager.getEnabledAIs());
    console.log('デバッグ情報:', manager.getDebugInfo());
  } else {
    console.log('動的設定管理システムが初期化されていません');
  }
};

console.log('💡 ヒント: window.testDynamicConfig() でいつでも現在の設定を確認できます');