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
        const menu = e.target.closest('.dropdown-menu');
        const targetId = menu.dataset.for;
        const input = document.getElementById(targetId);
        
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