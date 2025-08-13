/**
 * @fileoverview 元のコードと完全互換の統合テスト
 * 
 * 元の test-ai-automation-integrated.js と完全同じ動作を保証。
 * 元のコードをそのまま移植し、動作を保証。
 */

(function() {
  'use strict';

  // カスタムプルダウンの設定（元コードと完全同じ）
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

    // ホバーエフェクト（元コードと完全同じ）
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

  // 3連続テストの状態管理（AI別に管理）（元コードと完全同じ）
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

  // 3連続テストハンドラー（元コードと完全同じ）
  function handleConsecutiveTest(targetId) {
    console.log(`🔄 3連続テスト準備: ${targetId}`);
    console.log('現在のconsecutiveTestStates:', consecutiveTestStates);
    
    // テスト用のプロンプトを定義
    const testPrompts = [
      '今日は何日ですか？',
      '1+1は何ですか？',
      'こんにちは、調子はどうですか？'
    ];
    
    console.log(`📝 チェックボックス連携3連続テスト用のタスクリストを作成`);
    console.log(`🤖 開始AI: ${targetId}`);
    
    // test-runner-chrome.jsのgetTestConfig関数を使用してチェック状態を取得
    const testConfig = window.TestRunner ? window.TestRunner.getTestConfig() : null;
    if (!testConfig) {
      console.error('❌ TestRunnerが利用できません');
      return;
    }
    
    // チェックボックスで有効になっているAIのみを取得
    const allAiTypes = [
      { key: 'chatgpt', name: 'ChatGPT' },
      { key: 'claude', name: 'Claude' },
      { key: 'gemini', name: 'Gemini' },
      { key: 'genspark', name: 'Genspark' }
    ];
    
    const enabledAiTypes = allAiTypes.filter(ai => testConfig[ai.key]?.enabled);
    console.log(`✅ 有効なAI: ${enabledAiTypes.map(ai => ai.name).join(', ')}`);
    
    if (enabledAiTypes.length === 0) {
      alert('❌ 有効なAIが選択されていません。チェックボックスでAIを選択してください。');
      return;
    }
    
    const testTasks = [];
    const baseColumns = ['D', 'E', 'F', 'G']; // 4つの列で並列実行（最大4AI対応）
    const windowPositions = [0, 1, 2, 3]; // 左上、右上、左下、右下
    
    // 有効なAIタイプでテストタスクを作成
    enabledAiTypes.forEach((aiInfo, aiIndex) => {
      const aiType = aiInfo.key; // chatgpt, claude, gemini など
      const promptColumn = baseColumns[aiIndex]; // AI別の列
      const answerColumn = String.fromCharCode(promptColumn.charCodeAt(0) + 1); // D→E, E→F, F→G
      
      // 各AIに異なる質問を3回繰り返し実行
      for (let repeat = 0; repeat < 3; repeat++) {
        // AIごとに異なる質問を使用（循環させる）
        const promptIndex = (aiIndex * 3 + repeat) % testPrompts.length;
        const prompt = testPrompts[promptIndex];
        
        testTasks.push({
          id: `${aiType}_test_q${promptIndex + 1}_rep${repeat + 1}_${Date.now()}`,
          column: answerColumn, // 回答列
          row: (repeat * enabledAiTypes.length) + aiIndex + 2, // 行番号をずらして重複回避
          promptColumn: promptColumn, // プロンプト列
          prompt: prompt,
          aiType: aiType, // 各AIのタイプを正しく設定
          taskType: 'ai',
          preferredPosition: windowPositions[aiIndex], // AI別のウィンドウ位置
          groupId: `test_group_${aiType}_${promptColumn}`,
          groupInfo: {
            type: 'single',
            columns: ['C', promptColumn, answerColumn], // ログ、プロンプト、回答
            promptColumn: promptColumn
          },
          logColumns: {
            log: 'C',
            layout: 'single'
          }
        });
      }
    });
    
    // TaskListオブジェクトを作成（元コードと完全同じ）
    const testTaskList = {
      tasks: testTasks,
      getStatistics: () => {
        const byAI = {};
        enabledAiTypes.forEach(aiInfo => {
          const aiType = aiInfo.key;
          byAI[aiType] = testTasks.filter(task => task.aiType === aiType).length;
        });
        return {
          total: testTasks.length,
          byAI: byAI
        };
      }
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
  
  // 3連続テストを実際に実行（元コードと完全同じ）
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
  
  // DOMContentLoaded イベントリスナー（元コードと完全同じ）
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

// 新しいライブラリとの統合オプション（追加機能として提供）
let enhancedMode = false;

// 拡張機能を有効化する関数（オプション機能）
async function enableEnhancedIntegrationFeatures() {
  if (enhancedMode) return;
  
  try {
    // 新しいライブラリを動的にインポート
    const { getLogger } = await import('../src/core/logging-system.js');
    const { EnhancedStreamProcessor } = await import('../src/features/task/enhanced-stream-processor.js');
    
    // 拡張機能を有効化
    enhancedMode = true;
    console.log('✅ 統合テストの拡張機能が有効化されました');
    
    // 元の関数を拡張版でラップ（オプション）
    window.executeConsecutiveTestEnhanced = async function(targetAiType) {
      const enhancedLogger = getLogger('Enhanced3ConsecutiveTest');
      enhancedLogger.info(`拡張モードで3連続テストを実行: ${targetAiType}`);
      
      // 元の関数を呼び出し
      return window.executeConsecutiveTest(targetAiType);
    };
    
  } catch (error) {
    console.warn(`拡張機能の読み込みに失敗: ${error.message}`);
  }
}

// グローバルに公開（オプション機能）
window.enableEnhancedIntegrationFeatures = enableEnhancedIntegrationFeatures;