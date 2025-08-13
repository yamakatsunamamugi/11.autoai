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
        // 特殊アクション項目（3連続テストなど）はスキップ
        if (e.target.dataset.action) {
          return;
        }
        e.target.style.backgroundColor = '#f8f9fa';
      }
    });
    
    document.addEventListener('mouseout', function(e) {
      if (e.target.classList.contains('dropdown-item')) {
        // 特殊アクション項目は元の背景色に戻す
        if (e.target.dataset.action === 'consecutive-test') {
          e.target.style.backgroundColor = '#fff3cd';
        } else {
          e.target.style.backgroundColor = 'white';
        }
      }
    });
  }

  // 3連続テストの状態管理
  let consecutiveTestState = {
    enabled: false,
    targetId: null,
    testData: null
  };

  // 3連続テストハンドラー（準備のみ）
  function handleConsecutiveTest(targetId) {
    console.log(`🔄 3連続テスト準備: ${targetId}`);
    
    // テスト用のプロンプトを定義
    const testPrompts = [
      '今日は何日ですか？',
      '1+1は何ですか？',
      'こんにちは、調子はどうですか？'
    ];
    
    // AIタイプを特定（targetIdから）
    const aiType = targetId.replace('-prompt', '');
    
    console.log(`📝 3連続テスト用のスプレッドシートデータを作成`);
    
    // テスト用のスプレッドシートデータを作成
    // 本番のTaskGeneratorが理解できる形式で作成
    const testSpreadsheetData = {
      spreadsheetId: 'test-consecutive-' + Date.now(),
      gid: '0',
      
      // メニュー行（ヘッダー）
      menuRow: {
        index: 0,
        data: ['番号', '制御', 'ログ', 'プロンプト', `${aiType}回答`]
      },
      
      // AI行（AI種別の定義）
      aiRow: {
        index: 1,
        data: ['', '', '', aiType.toLowerCase(), '']
      },
      
      // 作業行（3つのテストプロンプト）
      workRows: [
        {
          index: 2,
          number: 1,
          data: ['1', '', '', testPrompts[0], '']
        },
        {
          index: 3,
          number: 2,
          data: ['2', '', '', testPrompts[1], '']
        },
        {
          index: 4,
          number: 3,
          data: ['3', '', '', testPrompts[2], '']
        }
      ],
      
      // values配列（全データ）
      values: [
        ['番号', '制御', 'ログ', 'プロンプト', `${aiType}回答`],
        ['', '', '', aiType.toLowerCase(), ''],
        ['1', '', '', testPrompts[0], ''],
        ['2', '', '', testPrompts[1], ''],
        ['3', '', '', testPrompts[2], '']
      ],
      
      // AI列の定義
      aiColumns: {
        'D': {
          type: 'single',
          promptDescription: ''
        }
      },
      
      // 列マッピング
      columnMapping: {
        'D': { 
          type: 'prompt', 
          aiType: aiType.toLowerCase()
        },
        'E': { 
          type: 'answer'
        }
      }
    };
    
    console.log(`📊 作成したテストデータ:`, testSpreadsheetData);
    
    // テストデータを状態に保存
    consecutiveTestState.enabled = true;
    consecutiveTestState.targetId = targetId;
    consecutiveTestState.testData = testSpreadsheetData;
    
    // プロンプト欄に準備完了を表示
    const inputElement = document.getElementById(targetId);
    if (inputElement) {
      inputElement.value = '🔄 3連続テスト準備完了（「テスト実行」ボタンを押してください）';
      inputElement.style.backgroundColor = '#fff3cd';
    }
    
    console.log(`✅ 3連続テスト準備完了。「テスト実行」ボタンを押すと開始します。`);
    
    // ステータス表示を更新
    const statusText = document.getElementById('status-text');
    if (statusText) {
      statusText.textContent = '3連続テスト準備完了 - 「テスト実行」ボタンを押してください';
    }
  }
  
  // 3連続テストを実際に実行
  async function executeConsecutiveTest() {
    if (!consecutiveTestState.enabled || !consecutiveTestState.testData) {
      console.error('3連続テストが準備されていません');
      return;
    }
    
    const aiType = consecutiveTestState.targetId.replace('-prompt', '');
    console.log(`🚀 3連続テスト実行開始: ${aiType}`);
    
    try {
      // TaskGeneratorをインポート（動的インポート）
      const { default: TaskGenerator } = await import('/src/features/task/generator.js');
      
      // TaskGeneratorのインスタンスを作成
      const generator = new TaskGenerator();
      
      console.log(`🎯 TaskGeneratorでタスクを生成`);
      
      // タスクを生成して実行（本番のコードを使用）
      const result = await generator.generateAndExecuteTasks(consecutiveTestState.testData, {
        testMode: true,
        consecutiveTest: true
      });
      
      console.log(`✅ 3連続テスト完了:`, result);
      
      // 結果を表示
      if (result.success) {
        alert(`✅ ${aiType}の3連続テスト成功！\n処理したタスク数: ${result.totalTasks}`);
      } else {
        alert(`❌ ${aiType}の3連続テストでエラーが発生しました`);
      }
      
      // 状態をリセット
      consecutiveTestState.enabled = false;
      consecutiveTestState.testData = null;
      
      // プロンプト欄を元に戻す
      const inputElement = document.getElementById(consecutiveTestState.targetId);
      if (inputElement) {
        inputElement.value = '桃太郎について歴史を解説して';
        inputElement.style.backgroundColor = '';
      }
      consecutiveTestState.targetId = null;
      
    } catch (error) {
      console.error(`❌ 3連続テストエラー:`, error);
      alert(`エラーが発生しました: ${error.message}`);
    }
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
    
    // グローバルに公開（test-runner-chrome.jsから呼び出せるように）
    window.consecutiveTestState = consecutiveTestState;
    window.executeConsecutiveTest = executeConsecutiveTest;
  });

})();