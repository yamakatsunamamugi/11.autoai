/**
 * 連続プロンプト送信テスト機能
 * 複数のプロンプトを順番に送信して応答を確認するテスト専用機能
 */

(() => {
  "use strict";

  // 連続送信用プロンプトセット
  const PROMPT_SETS = {
    // 基本的な連続対話テスト
    basic: [
      "こんにちは、今日はどのようなお手伝いができますか？",
      "あなたの主な機能を3つ教えてください。",
      "ありがとうございました。良い一日を！"
    ],
    
    // 文脈維持テスト
    context: [
      "桃太郎の物語について簡単に教えてください。",
      "その物語の主人公の仲間は誰ですか？",
      "彼らが倒した敵について教えてください。"
    ],
    
    // 機能切り替えテスト
    features: [
      "簡単な計算をしてください: 123 + 456 = ?",
      "短い詩を作ってください。テーマは「春」です。",
      "プログラミングについて、Hello Worldの例をPythonで書いてください。"
    ],
    
    // ストレステスト（長文）
    stress: [
      "日本の歴史について、平安時代から鎌倉時代への移行期について詳しく教えてください。特に政治体制の変化と武士の台頭について説明してください。",
      "続けて、鎌倉幕府の成立過程と源頼朝の役割について詳しく説明してください。",
      "最後に、鎌倉時代の文化的特徴と、この時代が日本史に与えた影響について教えてください。"
    ]
  };

  /**
   * 連続プロンプト送信クラス
   */
  class SequentialPromptTester {
    constructor(aiName, automation) {
      this.aiName = aiName;
      this.automation = automation;
      this.results = [];
      this.currentIndex = 0;
    }

    /**
     * 連続送信を実行
     * @param {Array<string>} prompts - 送信するプロンプトの配列
     * @param {Object} config - 基本設定（model, function等）
     */
    async runSequential(prompts, config = {}) {
      console.log(`%c[${this.aiName}] 連続送信テスト開始 (${prompts.length}個のプロンプト)`, 'color: #4CAF50; font-weight: bold');
      
      this.results = [];
      this.currentIndex = 0;
      
      for (let i = 0; i < prompts.length; i++) {
        this.currentIndex = i;
        const prompt = prompts[i];
        
        console.log(`%c[${this.aiName}] プロンプト ${i + 1}/${prompts.length} 送信中...`, 'color: #2196F3');
        console.log(`  内容: "${prompt.substring(0, 50)}${prompt.length > 50 ? '...' : ''}"`);
        
        const startTime = Date.now();
        
        try {
          // プロンプトを送信
          const result = await this.sendSinglePrompt(prompt, config);
          
          const endTime = Date.now();
          const duration = (endTime - startTime) / 1000;
          
          // 結果を保存
          this.results.push({
            index: i + 1,
            prompt: prompt,
            response: result.response,
            success: result.success,
            duration: duration,
            timestamp: new Date().toISOString(),
            error: result.error
          });
          
          if (result.success) {
            console.log(`%c[${this.aiName}] プロンプト ${i + 1} 完了 (${duration.toFixed(1)}秒)`, 'color: #4CAF50');
            
            // 応答の最初の100文字を表示
            if (result.response) {
              console.log(`  応答: "${result.response.substring(0, 100)}${result.response.length > 100 ? '...' : ''}"`);
            }
          } else {
            console.log(`%c[${this.aiName}] プロンプト ${i + 1} 失敗: ${result.error}`, 'color: #F44336');
          }
          
          // 次のプロンプトまで少し待機（AIの処理を安定させるため）
          if (i < prompts.length - 1) {
            console.log(`  次のプロンプトまで3秒待機...`);
            await this.wait(3000);
          }
          
        } catch (error) {
          console.error(`[${this.aiName}] プロンプト ${i + 1} エラー:`, error);
          this.results.push({
            index: i + 1,
            prompt: prompt,
            response: null,
            success: false,
            duration: (Date.now() - startTime) / 1000,
            timestamp: new Date().toISOString(),
            error: error.message
          });
        }
      }
      
      // 結果サマリーを表示
      this.showSummary();
      
      return this.results;
    }

    /**
     * 単一プロンプトを送信
     */
    async sendSinglePrompt(prompt, config) {
      // 各AIの自動化関数を使用
      if (!this.automation) {
        throw new Error(`${this.aiName}の自動化オブジェクトが見つかりません`);
      }
      
      // 実行設定
      const runConfig = {
        ...config,
        text: prompt,
        send: true,
        waitResponse: true,
        getResponse: true,
        timeout: 60000 // 60秒タイムアウト
      };
      
      // モデルと機能が指定されていない場合はスキップ
      if (!config.model) delete runConfig.model;
      if (!config.function) delete runConfig.function;
      
      // 自動化実行
      const result = await this.automation.runAutomation(runConfig);
      
      return result;
    }

    /**
     * 待機
     */
    wait(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * 結果サマリーを表示
     */
    showSummary() {
      console.log(`%c\n===== ${this.aiName} 連続送信テスト結果 =====`, 'color: #9C27B0; font-weight: bold; font-size: 14px');
      
      const successful = this.results.filter(r => r.success).length;
      const failed = this.results.filter(r => !r.success).length;
      const totalDuration = this.results.reduce((sum, r) => sum + r.duration, 0);
      const avgDuration = totalDuration / this.results.length;
      
      console.log(`成功: ${successful}/${this.results.length}`);
      console.log(`失敗: ${failed}/${this.results.length}`);
      console.log(`合計時間: ${totalDuration.toFixed(1)}秒`);
      console.log(`平均応答時間: ${avgDuration.toFixed(1)}秒`);
      
      // 失敗したプロンプトを表示
      if (failed > 0) {
        console.log('\n失敗したプロンプト:');
        this.results.filter(r => !r.success).forEach(r => {
          console.log(`  - プロンプト${r.index}: ${r.error}`);
        });
      }
      
      // 成功率を計算
      const successRate = (successful / this.results.length * 100).toFixed(1);
      console.log(`\n成功率: ${successRate}%`);
      
      if (successRate === '100.0') {
        console.log(`%c✅ 完璧！すべてのプロンプトが成功しました`, 'color: #4CAF50; font-weight: bold');
      } else if (successRate >= '75.0') {
        console.log(`%c⚠️ 良好ですが改善の余地があります`, 'color: #FF9800; font-weight: bold');
      } else {
        console.log(`%c❌ 問題があります。調査が必要です`, 'color: #F44336; font-weight: bold');
      }
      
      console.log('=' .repeat(50));
    }

    /**
     * 結果をエクスポート（CSV形式）
     */
    exportResults() {
      const csv = [
        'Index,Prompt,Response,Success,Duration(s),Timestamp,Error',
        ...this.results.map(r => 
          `"${r.index}","${r.prompt}","${(r.response || '').substring(0, 100)}","${r.success}","${r.duration.toFixed(2)}","${r.timestamp}","${r.error || ''}"`
        )
      ].join('\n');
      
      return csv;
    }
  }

  /**
   * 全AIで連続送信テストを実行
   */
  async function runAllSequentialTests(promptSetName = 'basic') {
    console.log('%c\n🚀 連続送信テスト開始', 'color: #2196F3; font-size: 16px; font-weight: bold');
    console.log(`プロンプトセット: ${promptSetName}`);
    console.log('=' .repeat(60));
    
    const prompts = PROMPT_SETS[promptSetName] || PROMPT_SETS.basic;
    const results = {};
    
    // 各AIでテストを実行
    const ais = [
      { name: 'ChatGPT', automation: window.ChatGPTAutomation },
      { name: 'Claude', automation: window.ClaudeAutomation },
      { name: 'Gemini', automation: window.GeminiAutomation },
      { name: 'Genspark', automation: window.GensparkAutomation }
    ];
    
    for (const ai of ais) {
      if (ai.automation) {
        console.log(`\n--- ${ai.name} テスト開始 ---`);
        const tester = new SequentialPromptTester(ai.name, ai.automation);
        
        try {
          results[ai.name] = await tester.runSequential(prompts);
        } catch (error) {
          console.error(`${ai.name} テストエラー:`, error);
          results[ai.name] = { error: error.message };
        }
        
        // 次のAIまで5秒待機
        if (ais.indexOf(ai) < ais.length - 1) {
          console.log('\n次のAIテストまで5秒待機...');
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
      }
    }
    
    // 全体サマリー
    console.log('%c\n===== 全AI連続送信テスト完了 =====', 'color: #9C27B0; font-size: 16px; font-weight: bold');
    
    Object.keys(results).forEach(aiName => {
      const aiResults = results[aiName];
      if (Array.isArray(aiResults)) {
        const success = aiResults.filter(r => r.success).length;
        console.log(`${aiName}: ${success}/${aiResults.length} 成功`);
      } else {
        console.log(`${aiName}: エラー - ${aiResults.error}`);
      }
    });
    
    return results;
  }

  // グローバル公開
  window.SequentialPromptTester = SequentialPromptTester;
  window.SequentialPromptTests = {
    SequentialPromptTester,
    PROMPT_SETS,
    runAllSequentialTests,
    
    // 簡易実行メソッド
    testBasic: () => runAllSequentialTests('basic'),
    testContext: () => runAllSequentialTests('context'),
    testFeatures: () => runAllSequentialTests('features'),
    testStress: () => runAllSequentialTests('stress'),
    
    // カスタムプロンプトでテスト
    testCustom: async (prompts, aiName = 'ChatGPT') => {
      const automation = window[`${aiName}Automation`];
      if (!automation) {
        console.error(`${aiName}の自動化オブジェクトが見つかりません`);
        return null;
      }
      
      const tester = new SequentialPromptTester(aiName, automation);
      return await tester.runSequential(prompts);
    }
  };

  console.log('%c✅ 連続プロンプト送信テスト機能が利用可能になりました', 'color: #4CAF50; font-weight: bold');
  console.log('使用例:');
  console.log('  SequentialPromptTests.testBasic()    // 基本テスト');
  console.log('  SequentialPromptTests.testContext()  // 文脈維持テスト');
  console.log('  SequentialPromptTests.testFeatures() // 機能切り替えテスト');
  console.log('  SequentialPromptTests.testStress()   // ストレステスト');
  console.log('  SequentialPromptTests.testCustom(["質問1", "質問2", "質問3"], "Claude")');

})();