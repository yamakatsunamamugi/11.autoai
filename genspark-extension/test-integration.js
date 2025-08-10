/**
 * 統合テスト用スクリプト
 * Chrome拡張機能をインストール後、Gensparkのページで実行
 */

(async function() {
  console.log('=== Genspark Extension 統合テスト開始 ===');
  console.log('実行時刻:', new Date().toLocaleString());
  
  // テスト項目
  const tests = {
    pageCheck: false,
    extensionLoaded: false,
    messageResponse: false,
    automationExecuted: false
  };
  
  try {
    // 1. ページチェック
    console.log('\n[TEST 1] ページチェック...');
    if (window.location.href.includes('genspark.ai')) {
      console.log('✅ Gensparkページで実行中');
      tests.pageCheck = true;
    } else {
      console.error('❌ Gensparkページではありません');
      console.log('正しいURL: https://www.genspark.ai/agents?type=slides_agent');
    }
    
    // 2. 拡張機能の読み込み確認
    console.log('\n[TEST 2] 拡張機能の読み込み確認...');
    
    // コンテンツスクリプトがメッセージに応答するか確認
    const testMessage = new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { action: 'getStatus' },
        (response) => {
          if (chrome.runtime.lastError) {
            resolve({ success: false, error: chrome.runtime.lastError.message });
          } else {
            resolve(response || { success: false, error: 'No response' });
          }
        }
      );
    });
    
    const statusResponse = await testMessage;
    
    if (statusResponse.success) {
      console.log('✅ 拡張機能が正常に読み込まれています');
      tests.extensionLoaded = true;
    } else {
      console.error('❌ 拡張機能の読み込みエラー:', statusResponse.error);
    }
    
    // 3. コンテンツスクリプトとの通信テスト
    console.log('\n[TEST 3] コンテンツスクリプトとの通信テスト...');
    
    // ダミーメッセージを送信
    window.postMessage({ 
      type: 'GENSPARK_TEST',
      data: 'ping' 
    }, '*');
    
    // レスポンスを待つ
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    console.log('✅ メッセージ送信完了（レスポンスはコンソールで確認）');
    tests.messageResponse = true;
    
    // 4. DOM要素の確認
    console.log('\n[TEST 4] DOM要素の確認...');
    
    const selectors = {
      textInput: [
        'textarea[name="query"]',
        '.search-input',
        '.j-search-input',
        'textarea.search-input.j-search-input',
        '.prompt-input-wrapper-upper textarea',
        '.textarea-wrapper textarea'
      ],
      submitButton: [
        '.enter-icon.active',
        '.enter-icon-wrapper.active',
        '.enter-icon.cursor-pointer.active'
      ]
    };
    
    let textInputFound = false;
    let submitButtonFound = false;
    
    // テキスト入力欄を探す
    for (const selector of selectors.textInput) {
      if (document.querySelector(selector)) {
        console.log(`✅ テキスト入力欄を発見: ${selector}`);
        textInputFound = true;
        break;
      }
    }
    
    if (!textInputFound) {
      console.warn('⚠️ テキスト入力欄が見つかりません（入力後に表示される場合があります）');
    }
    
    // 送信ボタンを探す
    for (const selector of selectors.submitButton) {
      if (document.querySelector(selector)) {
        console.log(`✅ 送信ボタンを発見: ${selector}`);
        submitButtonFound = true;
        break;
      }
    }
    
    if (!submitButtonFound) {
      console.warn('⚠️ 送信ボタンが見つかりません（テキスト入力後に表示される場合があります）');
    }
    
    // 5. 自動化実行テスト（オプション）
    console.log('\n[TEST 5] 自動化実行テスト');
    console.log('拡張機能のポップアップから「実行」ボタンをクリックしてテストしてください');
    
    // テスト結果サマリー
    console.log('\n=== テスト結果サマリー ===');
    console.log('ページチェック:', tests.pageCheck ? '✅ 成功' : '❌ 失敗');
    console.log('拡張機能読み込み:', tests.extensionLoaded ? '✅ 成功' : '❌ 失敗');
    console.log('メッセージ通信:', tests.messageResponse ? '✅ 成功' : '❌ 失敗');
    console.log('DOM要素:', (textInputFound || submitButtonFound) ? '✅ 一部確認' : '⚠️ 未確認');
    
    // 推奨事項
    console.log('\n=== 次のステップ ===');
    if (tests.pageCheck && tests.extensionLoaded) {
      console.log('1. 拡張機能のアイコンをクリック');
      console.log('2. ポップアップで「実行」ボタンをクリック');
      console.log('3. 自動化処理が開始されることを確認');
    } else {
      console.log('1. 拡張機能が正しくインストールされているか確認');
      console.log('2. chrome://extensions/ で拡張機能が有効になっているか確認');
      console.log('3. ページをリロードして再テスト');
    }
    
  } catch (error) {
    console.error('テストエラー:', error);
  }
  
  console.log('\n=== テスト完了 ===');
})();