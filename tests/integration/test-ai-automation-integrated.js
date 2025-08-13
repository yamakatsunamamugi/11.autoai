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

  // 3連続テストの状態管理（AI別に管理）
  let consecutiveTestStates = {
    'chatgpt-prompt': {
      enabled: false,
      targetId: 'chatgpt-prompt',
      testData: null
    },
    'claude-prompt': {
      enabled: false,
      targetId: 'claude-prompt',
      testData: null
    },
    'gemini-prompt': {
      enabled: false,
      targetId: 'gemini-prompt',
      testData: null
    }
  };

  // 3連続テストハンドラー（準備のみ）
  function handleConsecutiveTest(targetId) {
    console.log(`🔄 3連続テスト準備: ${targetId}`);
    console.log('現在のconsecutiveTestStates:', consecutiveTestStates);
    
    // テスト用のプロンプトを定義
    const testPrompts = [
      '今日は何日ですか？',
      '1+1は何ですか？',
      'こんにちは、調子はどうですか？'
    ];
    
    // AIタイプを特定（targetIdから）
    const aiType = targetId.replace('-prompt', '');
    const normalizedAiType = aiType.toLowerCase(); // 正規化
    
    console.log(`📝 3連続テスト用のタスクリストを直接作成`);
    console.log(`🤖 AIタイプ: ${aiType} (正規化: ${normalizedAiType})`);
    
    // テスト用のタスクリストを直接作成（ウィンドウ位置指定付き）
    const windowPositions = [0, 1, 2]; // 左上→右上→左下の順番
    const testTasks = testPrompts.map((prompt, index) => ({
      id: `${normalizedAiType}_test_${index + 1}_${Date.now()}`,
      column: 'E', // 回答列
      row: index + 2, // 2行目から開始
      promptColumn: 'D', // プロンプト列
      prompt: prompt,
      aiType: normalizedAiType,
      taskType: 'ai',
      preferredPosition: windowPositions[index], // テスト用のウィンドウ位置指定
      groupId: `test_group_${normalizedAiType}`,
      groupInfo: {
        type: 'single',
        columns: ['C', 'D', 'E'], // ログ、プロンプト、回答
        promptColumn: 'D'
      },
      logColumns: {
        log: 'C',
        layout: 'single'
      }
    }));
    
    // TaskListオブジェクトを作成
    const testTaskList = {
      tasks: testTasks,
      getStatistics: () => ({
        total: testTasks.length,
        byAI: {
          [normalizedAiType]: testTasks.length
        }
      })
    };
    
    console.log(`📊 作成した3連続テストタスク:`, testTaskList);
    
    // テストデータを該当AIの状態に保存
    if (consecutiveTestStates[targetId]) {
      consecutiveTestStates[targetId].enabled = true;
      consecutiveTestStates[targetId].testData = testTaskList;
    }
    
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
  
  // 3連続テストを実際に実行（AIタイプを指定）
  async function executeConsecutiveTest(targetAiType = null) {
    console.log('executeConsecutiveTest呼び出し:', {
      targetAiType,
      consecutiveTestStates,
      keys: Object.keys(consecutiveTestStates)
    });
    
    // 実行するAIを特定（指定がない場合は有効なものを探す）
    let targetId = targetAiType ? `${targetAiType}-prompt` : null;
    let testState = null;
    
    if (targetId && consecutiveTestStates[targetId]) {
      testState = consecutiveTestStates[targetId];
      console.log(`指定されたAI(${targetAiType})の状態を使用:`, testState);
    } else {
      console.log('指定されたAIがないか無効。有効なものを探します...');
      // 有効な状態を持つAIを探す
      for (const [id, state] of Object.entries(consecutiveTestStates)) {
        console.log(`  ${id}: enabled=${state.enabled}, hasData=${!!state.testData}`);
        if (state.enabled && state.testData) {
          targetId = id;
          testState = state;
          console.log(`  → ${id}を選択`);
          break;
        }
      }
    }
    
    if (!testState || !testState.enabled || !testState.testData) {
      console.error('3連続テストが準備されていません');
      return;
    }
    
    const aiType = targetId.replace('-prompt', '');
    console.log(`🚀 3連続テスト実行開始: ${aiType}`);
    
    try {
      // StreamProcessorを直接使用（タスクリストが既に作成済み）
      const { default: StreamProcessor } = await import('/src/features/task/stream-processor.js');
      
      // StreamProcessorのインスタンスを作成
      const processor = new StreamProcessor();
      
      console.log(`🎯 StreamProcessorでタスクを直接実行`);
      console.log(`実行するタスク:`, testState.testData.tasks);
      
      // タスクリストを直接実行（TaskGenerator不要）
      const result = await processor.processTaskStream(testState.testData, {}, {
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
      testState.enabled = false;
      testState.testData = null;
      
      // プロンプト欄を元に戻す
      const inputElement = document.getElementById(targetId);
      if (inputElement) {
        inputElement.value = '桃太郎について歴史を解説して';
        inputElement.style.backgroundColor = '';
      }
      
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
    window.consecutiveTestStates = consecutiveTestStates; // 複数形に修正
    window.executeConsecutiveTest = executeConsecutiveTest;
    
    console.log('window.consecutiveTestStatesを公開:', window.consecutiveTestStates);
  });

})();