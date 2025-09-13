/**
 * @fileoverview AI Orchestrator - AI実行統合システム
 * 
 * 【概要】
 * 複数AI（ChatGPT、Claude、Gemini、Genspark）の自動操作を
 * 統合管理するシステムです。
 * Chrome拡張機能として動作し、各AIサービスのWebページを
 * 自動操作してタスクの実行と応答の取得を行います。
 * 
 * 【動作モード】
 * 1. タスクリストモード - 本番のスプレッドシートから生成されたタスクを実行
 * 2. 手動モード - プロンプトを直接入力して実行
 * 3. テストモード - 3連続テストなどの特殊テストを実行
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
 * 
 * ■ 必須依存（実行前に読み込み必要）:
 *   - window.TaskAdapter (task-adapter.js)
 *     - detectMode() - 実行モードの判定
 *     - fromTaskList() - タスクリスト変換
 *     - createConsecutiveTestTasks() - テストタスク生成
 *   
 *   - window.TestRunner (test-runner-chrome.js)
 *     - runAllAIs() - 全AI実行
 *     - getTestConfig() - テスト設定取得
 *     - createAIWindow() - AIウィンドウ作成
 *   
 *   - window.AIHandler (common-ai-handler.js) ※間接依存
 *     - getSelectors() - UIセレクタ取得
 * 
 * ■ 動的インポート:
 *   - StreamProcessor (/src/features/task/stream-processor.js)
 *     - processTaskStream() - タスクストリーム処理
 * 
 * 【提供インターフェース】
 *   - window.PromptManager - プロンプト管理
 *     - getPrompts(aiType)
 *     - savePrompt(aiType, prompt)
 *     - deletePrompt(aiType, prompt)
 *     - updateDropdownMenu(aiType)
 *   
 *   - window.executeWithTaskList(taskList) - タスクリスト実行
 *   - window.executeConsecutiveTest(targetAiType) - 3連続テスト実行
 *   - window.consecutiveTestStates - テスト状態管理
 * 
 * 【ストレージ使用】
 *   - localStorage: ai_prompts_[aiType] - 各AI用の保存プロンプト
 *   - Chrome Storage: task_queue_for_test - タスクリスト受信用
 * 
 * 【イベントリスナー】
 *   - DOMContentLoaded - 初期化処理（モード判定、UI設定）
 *   - click#btn-run-all - 実行ボタン（モードに応じて処理分岐）
 *   - click.dropdown-btn - ドロップダウン操作
 *   - click.add-prompt-btn - プロンプト追加
 *   - click.dropdown-item - プロンプト選択/3連続テスト
 *   - mouseover/mouseout - ホバーエフェクト
 * 
 * @author AutoAI Development Team
 * @version 2.0.0
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
        return false;
      }
      
      // 最大20個まで
      if (prompts.length >= 20) {
        alert('保存できるプロンプトは最大20個までです');
        return false;
      }
      
      prompts.push(prompt);
      localStorage.setItem(`ai_prompts_${aiType}`, JSON.stringify(prompts));
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
   * UI設定をchrome.storageに保存
   * モデルと機能の選択状態を保存して、本番実行時に使用できるようにします。
   */
  function saveUIConfigToStorage() {
    const config = {
      claude: {
        enabled: document.getElementById('enable-claude')?.checked || false,
        model: document.getElementById('claude-model')?.value || '',
        function: document.getElementById('claude-feature')?.value || '',
        prompt: document.getElementById('claude-prompt')?.value || '',
      },
      chatgpt: {
        enabled: document.getElementById('enable-chatgpt')?.checked || false,
        model: document.getElementById('chatgpt-model')?.value || '',
        function: document.getElementById('chatgpt-feature')?.value || '',
        prompt: document.getElementById('chatgpt-prompt')?.value || '',
      },
      gemini: {
        enabled: document.getElementById('enable-gemini')?.checked || false,
        model: document.getElementById('gemini-model')?.value || '',
        function: document.getElementById('gemini-feature')?.value || '',
        prompt: document.getElementById('gemini-prompt')?.value || '',
      },
      genspark: {
        enabled: document.getElementById('enable-genspark')?.checked || false,
        model: document.getElementById('genspark-model')?.value || '',
        function: document.getElementById('genspark-feature')?.value || '',
        prompt: document.getElementById('genspark-prompt')?.value || '',
      },
    };
    
    // chrome.storageに保存
    chrome.storage.local.set({ dynamicAIConfig: config });
  }

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
          
          // プロンプト変更時もchrome.storageに保存
          saveUIConfigToStorage();
          
          // 入力イベントを発火（他の処理があれば動作させる）
          const event = new Event('input', { bubbles: true });
          input.dispatchEvent(event);
          
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
    
    // テスト用のプロンプトを定義
    const testPrompts = [
      '今日は何日ですか？',
      '1+1は何ですか？',
      'こんにちは、調子はどうですか？'
    ];
    
    
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
    
    // 実行するAIを特定（指定がない場合は有効なものを探す）
    let targetId = targetAiType ? `${targetAiType}-prompt` : null;
    let testState = null;
    
    if (targetId && consecutiveTestStates[targetId]) {
      testState = consecutiveTestStates[targetId];
    } else {
      // 有効な状態を持つAIを探す
      for (const [id, state] of Object.entries(consecutiveTestStates)) {
        if (state.enabled && state.testData) {
          targetId = id;
          testState = state;
          break;
        }
      }
    }
    
    if (!testState || !testState.enabled || !testState.testData) {
      console.error('3連続テストが準備されていません');
      return;
    }
    
    const aiType = targetId.replace('-prompt', '');
    
    try {
      // StreamProcessorを直接使用（タスクリストが既に作成済み）
      const { default: StreamProcessor } = await import('/src/features/task/stream-processor.js');
      
      // StreamProcessorのインスタンスを作成
      const processor = new StreamProcessor();
      
      
      // タスクリストを直接実行（TaskGenerator不要）
      const result = await processor.processTaskStream(testState.testData, {}, {
        testMode: true,
        consecutiveTest: true
      });
      
      
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
   * タスクリストモードで実行
   * @param {Object} taskList - 実行するタスクリスト
   */
  async function executeWithTaskList(taskList) {
    updateStatus('タスクリスト実行中...', 'running');
    
    try {
      // background.js経由でStreamProcessorを実行
      // Service Worker内でchrome.windows APIが使用可能
      const response = await chrome.runtime.sendMessage({
        action: 'streamProcessTaskList',
        taskList: taskList.toJSON ? taskList.toJSON() : taskList,
        testMode: true  // テストモードとして実行
      });
      
      
      if (response && response.success) {
        updateStatus(`タスクリスト実行開始: ${response.totalWindows || 0}個のウィンドウで処理中`, 'running');
        
        // 結果を表示
        alert(`✅ タスクリスト実行開始！\nウィンドウ数: ${response.totalWindows || 0}`);
      } else {
        const errorMsg = response?.error || 'タスクリスト実行でエラーが発生しました';
        updateStatus('タスクリスト実行エラー', 'error');
        alert(`❌ ${errorMsg}`);
      }
      
    } catch (error) {
      console.error('❌ タスクリスト実行エラー:', error);
      updateStatus('タスクリスト実行エラー', 'error');
      alert(`エラーが発生しました: ${error.message}`);
    }
  }

  /**
   * UIをタスクリストモードに更新
   * @param {Object} taskList - 表示するタスクリスト
   */
  function updateUIForTaskListMode(taskList) {
    // ヘッダーを更新
    const title = document.getElementById('page-title');
    const description = document.getElementById('page-description');
    const modeIndicator = document.getElementById('mode-indicator');
    const modeText = document.getElementById('mode-text');
    
    if (title) title.textContent = '🎯 AI Orchestrator - タスクリストモード';
    if (description) description.textContent = '本番タスクリストを実行中';
    if (modeIndicator) modeIndicator.style.display = 'block';
    if (modeText) modeText.textContent = 'タスクリスト';
    
    // タスクリスト統計を取得
    const stats = taskList.getStatistics();
    
    // タスクリスト情報を表示
    const tasklistInfo = document.getElementById('tasklist-info');
    if (tasklistInfo) {
      tasklistInfo.classList.add('active');
      
      document.getElementById('task-total').textContent = stats.total;
      document.getElementById('task-executable').textContent = stats.executable;
      document.getElementById('task-skipped').textContent = stats.skipped;
    }
    
    // プロンプト入力欄を無効化
    document.querySelectorAll('input[id$="-prompt"]').forEach(input => {
      input.disabled = true;
      input.placeholder = 'タスクリストモードでは使用不可';
      input.style.opacity = '0.5';
    });
    
    // 実行ボタンのテキストを変更
    const btnText = document.getElementById('btn-run-text');
    if (btnText) btnText.textContent = 'タスクリスト実行';
    
    // ステータス更新
    const statusText = document.getElementById('status-text');
    if (statusText) {
      statusText.textContent = `タスクリスト読み込み完了: ${stats.total}個のタスク`;
    }
  }

  /**
   * UIをMutationObserverモードに更新
   */
  function updateUIForMutationObserverMode() {
    // ヘッダーを更新
    const title = document.getElementById('page-title');
    const description = document.getElementById('page-description');
    const modeIndicator = document.getElementById('mode-indicator');
    const modeText = document.getElementById('mode-text');
    
    if (title) title.textContent = '👁️ AI Orchestrator - MutationObserver監視';
    if (description) description.textContent = 'AI操作フローをリアルタイム監視';
    if (modeIndicator) modeIndicator.style.display = 'block';
    if (modeText) modeText.textContent = 'MutationObserver';
    
    // プロンプト入力欄を無効化（監視のみなので不要）
    document.querySelectorAll('input[id$="-prompt"]').forEach(input => {
      input.disabled = true;
      input.placeholder = 'MutationObserverモードでは使用不可';
      input.style.opacity = '0.5';
    });
    
    // 実行ボタンを4分割レイアウト作成ボタンに変更
    const btnText = document.getElementById('btn-run-text');
    if (btnText) btnText.textContent = '4分割AIウィンドウ作成';
    
    // ステータス更新
    const statusText = document.getElementById('status-text');
    if (statusText) {
      statusText.textContent = 'MutationObserverモード準備完了 - 4分割AIウィンドウを作成してください';
    }

    // MutationObserver説明を追加
    const controlsSection = document.querySelector('.section');
    if (controlsSection) {
      const mutationObserverInfo = document.createElement('div');
      mutationObserverInfo.className = 'section';
      mutationObserverInfo.style.cssText = 'background: #f0f8ff; border-left: 4px solid #a55eea; margin-bottom: 20px;';
      mutationObserverInfo.innerHTML = `
        <h3 style="color: #a55eea; margin-bottom: 15px;">🔍 MutationObserver監視について</h3>
        <p>このモードでは、AIサイトでの操作を完全に監視します：</p>
        <ol style="margin: 10px 0; padding-left: 20px;">
          <li>📝 <strong>テキスト入力検出</strong> - プロンプト入力を自動検知</li>
          <li>📤 <strong>送信検出</strong> - 送信ボタンクリックを監視</li>
          <li>⏸️ <strong>応答開始検出</strong> - AI応答生成開始を検知</li>
          <li>✅ <strong>応答完了検出</strong> - 応答生成完了を監視</li>
          <li>📄 <strong>応答テキスト取得</strong> - 最終応答を自動抽出</li>
        </ol>
        <p><strong>💡 使用方法:</strong> 下記で4分割ウィンドウを作成し、任意のAIで質問してください。全フローが自動監視されます。</p>
      `;
      controlsSection.parentNode.insertBefore(mutationObserverInfo, controlsSection);
    }
  }

  /**
   * ステータス更新関数
   */
  function updateStatus(text, status = 'ready') {
    const statusText = document.getElementById('status-text');
    const statusIndicator = document.querySelector('.status-indicator');
    
    if (statusText) statusText.textContent = text;
    if (statusIndicator) {
      statusIndicator.className = `status-indicator status-${status}`;
    }
  }

  // 実行モードを保存
  let executionMode = 'manual';
  let receivedTaskList = null;

  /**
   * 初期化処理
   * DOMContentLoadedイベントで実行される初期設定を行います。
   * 
   * @event DOMContentLoaded
   * @description
   * 1. タスクリストモードの判定
   * 2. カスタムドロップダウンの設定
   * 3. 保存済みプロンプトの読み込み
   * 4. デフォルトプロンプトの設定
   * 5. グローバル変数の公開
   */
  document.addEventListener('DOMContentLoaded', async function() {
    // TaskAdapterでモード判定
    if (window.TaskAdapter) {
      const { mode, taskList } = await TaskAdapter.detectMode();
      
      // タスクリストモードはスプレッドシートからのデータがある場合のみ
      if (mode === 'tasklist' && taskList) {
        executionMode = 'tasklist';
        receivedTaskList = taskList;
        updateUIForTaskListMode(taskList);
      } else if (mode === 'test') {
        // テストモードの場合は手動モードとして扱う
        executionMode = 'manual';
      } else if (mode === 'mutationobserver') {
        // MutationObserverモードの場合
        executionMode = 'mutationobserver';
        updateUIForMutationObserverMode();
      }
    }
    
    // カスタムプルダウン設定
    setupCustomDropdowns();
    
    // 保存済みプロンプトを読み込み
    ['chatgpt', 'claude', 'gemini', 'genspark'].forEach(aiType => {
      PromptManager.updateDropdownMenu(aiType);
    });
    
    // モデルと機能の変更時にchrome.storageに保存
    document.querySelectorAll('select[id$="-model"], select[id$="-feature"]').forEach(select => {
      select.addEventListener('change', () => {
        saveUIConfigToStorage();
      });
    });
    
    // チェックボックスの変更時にも保存
    document.querySelectorAll('input[type="checkbox"][id^="enable-"]').forEach(checkbox => {
      checkbox.addEventListener('change', () => {
        saveUIConfigToStorage();
      });
    });
    
    // プロンプト入力欄の変更も監視
    document.querySelectorAll('input[id$="-prompt"]').forEach(input => {
      input.addEventListener('input', () => {
        // デバウンス処理（頻繁な保存を避ける）
        clearTimeout(input.saveTimer);
        input.saveTimer = setTimeout(() => {
          saveUIConfigToStorage();
        }, 500);
      });
    });
    
    // デフォルトプロンプトの設定（タスクリストモードでない場合のみ）
    if (executionMode !== 'tasklist') {
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
    }
    
    
    // MutationObserverモードの場合は自動的に4分割ウィンドウを作成
    if (executionMode === 'mutationobserver') {
      setTimeout(async () => {
        await startMutationObserverMode();
      }, 1000);
    }

    /**
     * DeepResearchモードでウィンドウを再オープン
     */
    async function reopenWindowForDeepResearch(aiType) {
      updateStatus(`${aiType}をDeepResearchモードで再実行中...`, 'running');
      
      try {
        // AIのURLを取得
        let url = '';
        switch (aiType) {
          case 'ChatGPT':
            url = 'https://chatgpt.com/';
            break;
          case 'Claude':
            url = 'https://claude.ai/new';
            break;
          case 'Gemini':
            url = 'https://gemini.google.com/';
            break;
          default:
            console.error('未知のAIタイプ:', aiType);
            return;
        }
        
        // 新しいウィンドウを作成
        const newWindow = window.open(url, `${aiType}_deepresearch`, 'width=800,height=600');
        
        if (newWindow) {
          // ウィンドウが完全に読み込まれるまで待機
          setTimeout(async () => {
            // MutationObserverスクリプトを注入（DeepResearchモード）
            const tabs = await chrome.tabs.query({ url: url + '*' });
            const targetTab = tabs.find(tab => tab.windowId === newWindow.windowId);
            
            if (targetTab) {
              // 依存関係を注入
              await chrome.scripting.executeScript({
                target: { tabId: targetTab.id },
                files: [
                  'automations/common-ai-handler.js',
                  'automations/ai-mutation-observer.js'
                ]
              });
              
              // DeepResearchモードで自動実行
              await chrome.scripting.executeScript({
                target: { tabId: targetTab.id },
                func: () => {
                  
                  if (window.AIMutationObserver) {
                    const observer = new window.AIMutationObserver();
                    observer.isDeepResearchMode = true; // DeepResearchモードフラグを設定
                    
                    // DeepResearchボタンをクリックしてから自動実行
                    setTimeout(() => {
                      const deepResearchButtons = [
                        'button[aria-label*="research"]',
                        'button[data-testid*="research"]',
                        'button:contains("リサーチ")',
                        'button[aria-label*="Research"]'
                      ];
                      
                      let deepResearchClicked = false;
                      for (const selector of deepResearchButtons) {
                        try {
                          const button = document.querySelector(selector);
                          if (button) {
                            button.click();
                            deepResearchClicked = true;
                            break;
                          }
                        } catch (e) {
                          // セレクタエラーは無視
                        }
                      }
                      
                      // 自動実行フローを開始
                      setTimeout(() => {
                        observer.startFullFlowMonitoring();
                      }, 2000);
                      
                    }, 3000);
                    
                    window.currentAIObserver = observer;
                  }
                }
              });
              
              updateStatus(`${aiType} DeepResearchモード実行中`, 'success');
            }
          }, 5000);
        }
        
      } catch (error) {
        console.error(`DeepResearchモード再オープンエラー:`, error);
        updateStatus('DeepResearchモード実行エラー', 'error');
      }
    }

    /**
     * 各AIウィンドウにMutationObserverスクリプトを注入
     */
    async function injectMutationObserverToWindows(results) {
      
      if (!results || !results.windows) {
        console.error('❌ ウィンドウ情報が取得できません');
        return;
      }
      
      // 各AIウィンドウのタブに対してスクリプトを注入
      for (const [aiType, windowInfo] of Object.entries(results.windows)) {
        if (windowInfo && windowInfo.tabId) {
          try {
            
            // 必要な依存関係を先に注入
            await chrome.scripting.executeScript({
              target: { tabId: windowInfo.tabId },
              files: [
                'automations/common-ai-handler.js'
              ]
            });
            
            // その後ai-mutation-observer.jsを注入
            await chrome.scripting.executeScript({
              target: { tabId: windowInfo.tabId },
              files: ['automations/ai-mutation-observer.js']
            });
            
            // その後、自動実行を開始
            await chrome.scripting.executeScript({
              target: { tabId: windowInfo.tabId },
              func: () => {
                
                // AIMutationObserverのインスタンスを作成
                if (window.AIMutationObserver) {
                  const observer = new window.AIMutationObserver();
                  
                  // 自動実行フローを開始
                  observer.startFullFlowMonitoring();
                  
                  // グローバルに保存
                  window.currentAIObserver = observer;
                  
                } else {
                  console.error('❌ AIMutationObserverクラスが見つかりません');
                }
              }
            });
            
            
          } catch (error) {
            console.error(`❌ ${aiType}へのスクリプト注入エラー:`, error);
          }
        }
      }
      
      updateStatus('全AIウィンドウでMutationObserver自動実行中', 'success');
    }

    /**
     * MutationObserverモードを開始
     */
    async function startMutationObserverMode() {
      updateStatus('4分割AIウィンドウ作成中...', 'running');
      
      try {
        // TestRunnerを使用して4分割ウィンドウを作成
        if (window.TestRunner && window.TestRunner.runAllAIs) {
          
          // AI設定を自動設定（全AIを有効化）
          const checkboxes = document.querySelectorAll('input[id^="enable-"]');
          checkboxes.forEach(checkbox => {
            checkbox.checked = true;
          });
          
          // TestRunnerで4分割ウィンドウ作成とMutationObserver開始
          const results = await window.TestRunner.runAllAIs();
          
          // 各AIウィンドウにMutationObserverスクリプトを注入
          setTimeout(async () => {
            await injectMutationObserverToWindows(results);
          }, 3000); // ウィンドウが完全に読み込まれるまで待機
          
          updateStatus('MutationObserver自動実行開始中...', 'success');
          
        } else {
          throw new Error('TestRunnerが利用できません');
        }
      } catch (error) {
        console.error('❌ MutationObserverモード開始エラー:', error);
        updateStatus('4分割ウィンドウ作成エラー', 'error');
      }
    }
    
    // グローバルに公開（test-runner-chrome.jsから呼び出せるように）
    window.consecutiveTestStates = consecutiveTestStates;
    window.executeConsecutiveTest = executeConsecutiveTest;
    window.executeWithTaskList = executeWithTaskList;
    window.startMutationObserverMode = startMutationObserverMode;
    
    // 初回のUI設定をchrome.storageに保存
    saveUIConfigToStorage();
    
    // MutationObserverモードのメッセージリスナー設定
    if (executionMode === 'mutationobserver') {
      chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
        if (message.type === 'close-and-reopen-for-deepresearch') {
          
          // 3秒後に新しいウィンドウを開く
          setTimeout(async () => {
            await reopenWindowForDeepResearch(message.aiType);
          }, 3000);
          
          sendResponse({ success: true });
        }
      });
    }
    
    // 実行ボタンのイベントリスナーは追加しない
    // test-runner-chrome.jsが既にイベントリスナーを設定しているため
    // これにより実行が2回されることを防ぐ
    
    // モード別の実行ボタン処理
    const btnRunAll = document.getElementById('btn-run-all');
    if (btnRunAll) {
      if (executionMode === 'tasklist' && receivedTaskList) {
        // タスクリストモード
        btnRunAll.addEventListener('click', async () => {
          await executeWithTaskList(receivedTaskList);
        });
      } else if (executionMode === 'mutationobserver') {
        // MutationObserverモードの場合はボタンを非表示にする（自動実行されるため）
        btnRunAll.style.display = 'none';
      }
    }
    // テストモードの場合は、test-runner-chrome.jsがイベントを処理する
  });

})();