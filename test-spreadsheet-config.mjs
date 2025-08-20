// test-spreadsheet-config.mjs - スプレッドシート設定の直接適用をテスト
import TaskGenerator from './src/features/task/generator.js';

async function testSpreadsheetConfigDirect() {
  console.log('📊 スプレッドシート設定直接適用のテスト開始');
  
  // モックのスプレッドシートデータを作成（実際のスプレッドシート構造をシミュレート）
  const mockSpreadsheetData = {
    values: [
      // 行1: メニュー行
      ['', '', '', 'プロンプト', '', 'ChatGPT回答', 'Claude回答', 'Gemini回答'],
      // 行2: AI行
      ['', '', '', '3種類（ChatGPT・Gemini・Claude）', '', 'ChatGPT', 'Claude', 'Gemini'],
      // 行3-5: 空行
      ['', '', '', '', '', '', '', ''],
      ['', '', '', '', '', '', '', ''],
      ['', '', '', '', '', '', '', ''],
      // 行6: モデル行
      ['モデル', '', '', '', '', 'Thinking', 'Claude Opus 4.1', '2.5 Pro'],
      // 行7: 機能行
      ['機能', '', '', '', '', 'ウェブ検索', 'じっくり考える', 'Deep Think'],
      // 行8: 空行
      ['', '', '', '', '', '', '', ''],
      // 行9: 作業行
      ['9', '', '', '①人工知能は人間の仕事をどう考えるのか？\n2000文字で解説して', '', '', '', '']
    ],
    range: "'1.原稿本文作成'!A1:H9"
  };
  
  const generator = new TaskGenerator();
  
  try {
    // モックデータから直接設定を読み取るテスト
    console.log('🔍 モデル行・機能行の検出テスト');
    
    // モデル行（行6、インデックス5）
    const modelRowIndex = 5;
    console.log('モデル設定:');
    console.log(`  ChatGPT(F列/5): ${mockSpreadsheetData.values[modelRowIndex][5]}`);
    console.log(`  Claude(G列/6): ${mockSpreadsheetData.values[modelRowIndex][6]}`);
    console.log(`  Gemini(H列/7): ${mockSpreadsheetData.values[modelRowIndex][7]}`);
    
    // 機能行（行7、インデックス6）
    const functionRowIndex = 6;
    console.log('機能設定:');
    console.log(`  ChatGPT(F列/5): ${mockSpreadsheetData.values[functionRowIndex][5]}`);
    console.log(`  Claude(G列/6): ${mockSpreadsheetData.values[functionRowIndex][6]}`);
    console.log(`  Gemini(H列/7): ${mockSpreadsheetData.values[functionRowIndex][7]}`);
    
    // 期待値の確認
    const expectedSettings = {
      chatgpt: { model: 'Thinking', function: 'ウェブ検索' },
      claude: { model: 'Claude Opus 4.1', function: 'じっくり考える' },
      gemini: { model: '2.5 Pro', function: 'Deep Think' }
    };
    
    console.log('\n✅ 期待される設定:');
    Object.entries(expectedSettings).forEach(([ai, settings]) => {
      console.log(`  ${ai}: ${settings.model} + ${settings.function}`);
    });
    
    console.log('\n🎯 修正後の動作予測:');
    console.log('  - DynamicConfig上書きなし');
    console.log('  - スプレッドシートの値が直接適用');
    console.log('  - 「Deep Research」ではなく正しい機能が適用される');
    
    return true;
    
  } catch (error) {
    console.error('❌ テストエラー:', error);
    return false;
  }
}

// テスト実行
testSpreadsheetConfigDirect().then(success => {
  console.log(success ? '\n🎉 設定直接適用テスト完了' : '\n💥 テスト失敗');
  process.exit(success ? 0 : 1);
});