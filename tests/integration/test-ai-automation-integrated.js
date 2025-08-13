// test-ai-automation-integrated.js
// カスタムプルダウンの実装

(function() {
  'use strict';

  // カスタムプルダウンの設定
  function setupCustomDropdowns() {
    // プルダウンボタンのクリックイベント
    document.addEventListener('click', function(e) {
      if (e.target.classList.contains('dropdown-btn')) {
        e.preventDefault();
        e.stopPropagation();
        
        const targetId = e.target.dataset.target;
        const menu = document.querySelector(`.dropdown-menu[data-for="${targetId}"]`);
        
        if (menu) {
          // 他のメニューを閉じる
          document.querySelectorAll('.dropdown-menu').forEach(m => {
            if (m !== menu) m.style.display = 'none';
          });
          
          // 現在のメニューを開閉
          menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
        }
      }
      
      // ドロップダウン項目のクリック
      if (e.target.classList.contains('dropdown-item')) {
        e.preventDefault();
        e.stopPropagation();
        
        const value = e.target.dataset.value;
        const action = e.target.dataset.action;
        const menu = e.target.closest('.dropdown-menu');
        const targetId = menu.dataset.for;
        const input = document.getElementById(targetId);
        
        // 特殊アクション（3連続テスト）の処理
        if (action === 'consecutive-test') {
          menu.style.display = 'none';
          handleConsecutiveTest(targetId);
          return;
        }
        
        // 通常のプロンプト選択
        if (input && value) {
          input.value = value;
          menu.style.display = 'none';
          
          // 入力イベントを発火（他の処理があれば動作させる）
          const event = new Event('input', { bubbles: true });
          input.dispatchEvent(event);
          
          console.log(`[${targetId}] プロンプトを選択: ${value}`);
        }
      }
      
      // 他の場所をクリックしたらメニューを閉じる
      if (!e.target.closest('.custom-dropdown')) {
        document.querySelectorAll('.dropdown-menu').forEach(menu => {
          menu.style.display = 'none';
        });
      }
    });

    // ホバーエフェクト
    document.addEventListener('mouseover', function(e) {
      if (e.target.classList.contains('dropdown-item')) {
        e.target.style.backgroundColor = '#f8f9fa';
      }
    });
    
    document.addEventListener('mouseout', function(e) {
      if (e.target.classList.contains('dropdown-item')) {
        e.target.style.backgroundColor = 'white';
      }
    });
  }

  // 3連続テストハンドラー
  function handleConsecutiveTest(targetId) {
    console.log(`🔄 3連続テスト開始: ${targetId}`);
    
    // テスト用のプロンプトを定義
    const testPrompts = [
      '今日は何日ですか？',
      '1+1は何ですか？',
      'こんにちは、調子はどうですか？'
    ];
    
    // AIタイプを特定（targetIdから）
    const aiType = targetId.replace('-prompt', '');
    const inputElement = document.getElementById(targetId);
    
    if (!inputElement) {
      console.error(`入力要素が見つかりません: ${targetId}`);
      return;
    }
    
    // プロンプトを順番に送信する関数
    let currentIndex = 0;
    
    function sendNextPrompt() {
      if (currentIndex >= testPrompts.length) {
        console.log(`✅ ${aiType}の3連続テスト完了`);
        // 元のプロンプトに戻す
        inputElement.value = '桃太郎について歴史を解説して';
        return;
      }
      
      const prompt = testPrompts[currentIndex];
      console.log(`📝 送信 ${currentIndex + 1}/3: ${prompt}`);
      
      // プロンプトを設定
      inputElement.value = prompt;
      
      // 入力イベントを発火
      const event = new Event('input', { bubbles: true });
      inputElement.dispatchEvent(event);
      
      // 実際の送信をシミュレート（統合テストボタンをクリック）
      setTimeout(() => {
        // 統合テスト開始ボタンを探す
        const startButton = document.getElementById('start-integrated-test');
        if (startButton && currentIndex === 0) {
          // 最初の時だけボタンをクリック
          console.log(`🚀 ${aiType}のテストを開始`);
          startButton.click();
        }
        
        currentIndex++;
        
        // 次のプロンプトを送信（5秒間隔）
        setTimeout(sendNextPrompt, 5000);
      }, 500);
    }
    
    // テスト開始
    sendNextPrompt();
  }
  
  // DOMContentLoaded イベントリスナー
  document.addEventListener('DOMContentLoaded', function() {
    console.log('AI自動操作統合テスト - 初期化開始');
    
    // カスタムプルダウン設定
    setupCustomDropdowns();
    
    // デフォルトプロンプトの設定
    const promptFields = [
      { id: 'chatgpt-prompt', default: '桃太郎について歴史を解説して' },
      { id: 'claude-prompt', default: '桃太郎について歴史を解説して' },
      { id: 'gemini-prompt', default: '桃太郎について歴史を解説して' },
      { id: 'genspark-prompt', default: '桃太郎について2枚のスライドで解説して' }
    ];
    
    promptFields.forEach(field => {
      const element = document.getElementById(field.id);
      if (element && !element.value) {
        element.value = field.default;
      }
    });
    
    console.log('AI自動操作統合テスト - 初期化完了');
    console.log('カスタムプルダウンが利用可能 - ▼ボタンでプリセット選択、テキストは自由編集可能');
  });

})();