/**
 * @fileoverview 統合AIテストシステム - メイン実装
 * 
 * 【概要】
 * 複数AI（ChatGPT、Claude、Gemini、Genspark）の自動操作と
 * 統合テストを管理するシステムです。
 * Chrome拡張機能として動作し、各AIサービスのWebページを
 * 自動操作してプロンプトの送信と応答の取得を行います。
 * 
 * 【主要機能】
 * 1. プロンプト管理（PromptManager）
 *    - LocalStorageを使用したプロンプトの永続化
 *    - 最大20個までのプロンプト保存
 *    - プロンプトの追加・削除・選択
 * 
 * 2. カスタムドロップダウンUI
 *    - 動的なプロンプト選択メニュー
 *    - プロンプト登録ボタン（➕）
 *    - 削除機能付きプロンプトリスト
 * 
 * 3. 3連続テスト機能
 *    - 複数AIの並列テスト実行
 *    - チェックボックスで有効AIを動的検出
 *    - StreamProcessorによる効率的なタスク処理
 * 
 * 【依存関係】
 * 外部モジュール:
 *   - /src/features/task/stream-processor.js - タスクの並列ストリーミング処理
 *   - /automations/test-runner-chrome.js - Chrome拡張機能のテストランナー（window.TestRunner）
 *   - /automations/common-ai-handler.js - AI操作の共通ハンドラー（window.AIHandler）
 *   - /src/config/ui-selectors.js - 各AIのUIセレクタ定義
 * 
 * 【グローバル公開オブジェクト】
 *   - window.consecutiveTestStates - 3連続テストの状態管理
 *   - window.executeConsecutiveTest - 3連続テスト実行関数
 *   - window.PromptManager - プロンプト管理オブジェクト（デバッグ用）
 * 
 * 【ストレージ使用】
 *   - localStorage: ai_prompts_[aiType] - 各AI用の保存プロンプト
 * 
 * 【イベントリスナー】
 *   - DOMContentLoaded - 初期化処理
 *   - click - ドロップダウン操作、プロンプト選択
 *   - mouseover/mouseout - ホバーエフェクト
 * 
 * @author AutoAI Development Team
 * @version 1.0.0
 */

(function() {
  'use strict';

  /**
   * プロンプト保存管理オブジェクト
   * LocalStorageを使用して各AI用のプロンプトを永続化管理します。
   * 
   * @namespace PromptManager
   */
  const PromptManager = {
    /**
     * 指定AIタイプの保存済みプロンプトを取得
     * @param {string} aiType - AI種別（'chatgpt', 'claude', 'gemini', 'genspark'）
     * @returns {Array<string>} 保存されているプロンプトの配列
     */
    getPrompts: function(aiType) {
      const key = `ai_prompts_${aiType}`;
      const saved = localStorage.getItem(key);
      return saved ? JSON.parse(saved) : [];
    },
    
    /**
     * プロンプトを保存（最大20個、重複チェック付き）
     * @param {string} aiType - AI種別
     * @param {string} prompt - 保存するプロンプトテキスト
     * @returns {boolean} 保存成功の場合true、失敗の場合false
     */
    savePrompt: function(aiType, prompt) {
      if (!prompt || prompt.trim() === '') return false;
      
      const prompts = this.getPrompts(aiType);
      
      // 重複チェック
      if (prompts.includes(prompt)) {
        console.log(`[${aiType}] プロンプトは既に登録済み: ${prompt}`);
        return false;
      }
      
      // 最大20個まで
      if (prompts.length >= 20) {
        alert('保存できるプロンプトは最大20個までです');
        return false;
      }
      
      prompts.push(prompt);
      localStorage.setItem(`ai_prompts_${aiType}`, JSON.stringify(prompts));
      console.log(`[${aiType}] プロンプトを保存: ${prompt}`);
      return true;
    },
    
    /**
     * 保存済みプロンプトを削除
     * @param {string} aiType - AI種別
     * @param {string} prompt - 削除するプロンプトテキスト
     * @returns {boolean} 削除成功の場合true、見つからない場合false
     */
    deletePrompt: function(aiType, prompt) {
      const prompts = this.getPrompts(aiType);
      const index = prompts.indexOf(prompt);
      if (index > -1) {
        prompts.splice(index, 1);
        localStorage.setItem(`ai_prompts_${aiType}`, JSON.stringify(prompts));
        console.log(`[${aiType}] プロンプトを削除: ${prompt}`);
        return true;
      }
      return false;
    },
    
    /**
     * ドロップダウンメニューのDOM要素を動的に更新
     * 保存済みプロンプトを読み込んでメニューに反映します。
     * @param {string} aiType - AI種別
     */
    updateDropdownMenu: function(aiType) {
      const menu = document.querySelector(`.dropdown-menu[data-for="${aiType}-prompt"]`);
      if (!menu) return;
      
      // 既存のカスタムプロンプトを削除（デフォルトと特殊項目は残す）
      const customItems = menu.querySelectorAll('.dropdown-item.custom-prompt');
      customItems.forEach(item => item.remove());
      
      // 保存されたプロンプトを追加
      const prompts = this.getPrompts(aiType);
      const specialItem = menu.querySelector('[data-action]'); // 特殊項目（3連続テストなど）
      
      prompts.forEach(prompt => {
        const item = document.createElement('div');
        item.className = 'dropdown-item custom-prompt';
        item.dataset.value = prompt;
        item.style.cssText = 'padding: 8px; cursor: pointer; border-bottom: 1px solid #eee; position: relative; padding-right: 30px;';
        
        // プロンプトテキスト
        const textSpan = document.createElement('span');
        textSpan.textContent = prompt;
        item.appendChild(textSpan);
        
        // 削除ボタン
        const deleteBtn = document.createElement('span');
        deleteBtn.textContent = '✕';
        deleteBtn.style.cssText = 'position: absolute; right: 8px; top: 50%; transform: translateY(-50%); cursor: pointer; color: #dc3545; font-weight: bold;';
        deleteBtn.onclick = (e) => {
          e.stopPropagation();
          if (confirm(`「${prompt}」を削除しますか？`)) {
            this.deletePrompt(aiType, prompt);
            this.updateDropdownMenu(aiType);
          }
        };
        item.appendChild(deleteBtn);
        
        // 特殊項目の前に挿入
        if (specialItem) {
          menu.insertBefore(item, specialItem);
        } else {
          menu.appendChild(item);
        }
      });
    }
  };

  /**
   * カスタムドロップダウンUIのイベントハンドラーを設定
   * クリック、ホバー、選択などのユーザーインタラクションを管理します。
   * 
   * @function setupCustomDropdowns
   * @description
   * - ドロップダウンボタンのクリック処理
   * - プロンプト追加ボタン（➕）の処理
   * - プロンプト選択・削除の処理
   * - メニューの開閉制御
   * - ホバーエフェクト
   */
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
      
      // 登録ボタンのクリック
      if (e.target.classList.contains('add-prompt-btn')) {
        e.preventDefault();
        e.stopPropagation();
        
        const targetId = e.target.dataset.target;
        const input = document.getElementById(targetId);
        const aiType = targetId.replace('-prompt', '');
        
        if (input && input.value) {
          if (PromptManager.savePrompt(aiType, input.value)) {
            PromptManager.updateDropdownMenu(aiType);
            // 視覚的フィードバック
            e.target.textContent = '✅';
            setTimeout(() => {
              e.target.textContent = '➕';
            }, 1000);
          }
        }
      }
      
      // ドロップダウン項目のクリック
      if (e.target.classList.contains('dropdown-item') || e.target.parentElement?.classList.contains('dropdown-item')) {
        const item = e.target.classList.contains('dropdown-item') ? e.target : e.target.parentElement;
        e.preventDefault();
        e.stopPropagation();
        
        const value = item.dataset.value;
        const action = item.dataset.action;
        const menu = item.closest('.dropdown-menu');
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

  /**
   * 3連続テストの状態管理オブジェクト
   * 各AIごとにテストの準備状態とデータを管理します。
   * 
   * @type {Object<string, {enabled: boolean, targetId: string, testData: Object|null}>}
   */
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

  /**
   * 3連続テストの準備処理
   * チェックボックスで選択されたAIに対してテストタスクを生成します。
   * 
   * @function handleConsecutiveTest
   * @param {string} targetId - 対象プロンプト入力欄のID（例: 'chatgpt-prompt'）
   * @description
   * 1. window.TestRunnerから有効なAIを取得
   * 2. 各AIに3つのテストプロンプトを割り当て
   * 3. タスクリストを生成して状態を保存
   * 4. UIに準備完了を表示
   * 
   * @requires window.TestRunner.getTestConfig
   */
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
      
      // 各AIに質問1→2→3の順序で3回実行
      for (let repeat = 0; repeat < 3; repeat++) {
        // すべてのAIで同じ順序：質問1→2→3
        const promptIndex = repeat % testPrompts.length;
        const prompt = testPrompts[promptIndex];
        
        testTasks.push({
          id: `${aiType}_test_q${promptIndex + 1}_rep${repeat + 1}_${Date.now()}`,
          column: answerColumn, // 回答列
          row: (repeat * enabledAiTypes.length) + aiIndex + 2, // 行番号をずらして重複回避
          promptColumn: promptColumn, // プロンプト列
          prompt: prompt,
          aiType: aiType, // 各AIのタイプを正しく設定
          taskType: 'ai',
          // テストモード用設定：実際のAI実行をスキップ
          waitResponse: false,  // 応答待機をスキップ
          getResponse: false,   // 応答取得をスキップ
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
    
    // TaskListオブジェクトを作成
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
  
  /**
   * 3連続テストの実行処理
   * 準備されたテストタスクをStreamProcessorで実行します。
   * 
   * @async
   * @function executeConsecutiveTest
   * @param {string|null} targetAiType - 実行対象のAIタイプ（省略時は自動選択）
   * @returns {Promise<void>}
   * @description
   * 1. 有効なテスト状態を確認
   * 2. StreamProcessorをインポート
   * 3. タスクリストを並列実行
   * 4. 結果を表示して状態をリセット
   * 
   * @requires /src/features/task/stream-processor.js
   */
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
  
  /**
   * 初期化処理
   * DOMContentLoadedイベントで実行される初期設定を行います。
   * 
   * @event DOMContentLoaded
   * @description
   * 1. カスタムドロップダウンの設定
   * 2. 保存済みプロンプトの読み込み
   * 3. デフォルトプロンプトの設定
   * 4. グローバル変数の公開
   */
  document.addEventListener('DOMContentLoaded', function() {
    console.log('AI自動操作統合テスト - 初期化開始');
    
    // カスタムプルダウン設定
    setupCustomDropdowns();
    
    // 保存済みプロンプトを読み込み
    ['chatgpt', 'claude', 'gemini', 'genspark'].forEach(aiType => {
      PromptManager.updateDropdownMenu(aiType);
    });
    
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