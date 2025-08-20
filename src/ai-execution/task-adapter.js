/**
 * @fileoverview タスクアダプター - タスク形式の変換と受信
 * 
 * 【概要】
 * 本番のTaskListとAI Orchestratorのタスク形式を相互変換するアダプター。
 * URLパラメータ、postMessage、Chrome Storageからタスクリストを受信し、
 * AI実行エンジンで処理可能な形式に変換します。
 * 
 * 【主要機能】
 * 1. タスクリスト変換
 *    - 本番TaskList → 実行用タスク
 *    - プロンプト → タスクリスト
 *    - 3連続テスト用タスク生成
 * 
 * 2. タスクリスト受信
 *    - URLパラメータからの受信
 *    - postMessageからの受信
 *    - Chrome Storageからの読み込み
 * 
 * 【依存関係】
 * 
 * ■ このモジュールが依存するもの:
 *   - Chrome Storage API (chrome.storage.local)
 *   - URLSearchParams API (ブラウザ標準)
 *   - window.location (ブラウザ標準)
 * 
 * ■ このモジュールを使用するもの:
 *   - ai-orchestrator.js
 *     - detectMode() を使用してモード判定
 *     - fromTaskList() を使用してタスク変換
 *     - createConsecutiveTestTasks() を使用してテストタスク生成
 * 
 * 【提供インターフェース】
 * 
 * window.TaskAdapter = {
 *   // タスク変換
 *   fromTaskList(taskListData) - TaskListを実行用形式に変換
 *   fromPrompts(prompts, aiConfigs) - プロンプトからタスク生成
 *   createConsecutiveTestTasks(enabledAIs, testPrompts) - 3連続テスト用タスク生成
 *   
 *   // タスク受信
 *   receiveFromURL() - URLパラメータから受信
 *   setupMessageListener(callback) - postMessageリスナー設定
 *   loadFromStorage() - Chrome Storageから読み込み
 *   
 *   // モード判定
 *   detectMode() - 実行モードを自動判定
 * }
 * 
 * 【データフロー】
 * 
 * 1. 本番モード:
 *    ui-controller.js → Chrome Storage (task_queue_for_test)
 *                     ↓
 *    TaskAdapter.loadFromStorage()
 *                     ↓
 *    TaskAdapter.fromTaskList() → ai-orchestrator.js
 * 
 * 2. 手動モード:
 *    ユーザー入力 → TaskAdapter.fromPrompts() → ai-orchestrator.js
 * 
 * 3. テストモード:
 *    テスト設定 → TaskAdapter.createConsecutiveTestTasks() → ai-orchestrator.js
 * 
 * 【ストレージ使用】
 *   - Chrome Storage: 
 *     - task_queue - 本番のタスクリスト
 *     - task_queue_for_test - AI Orchestrator用タスクリスト（一時的）
 * 
 * @author AutoAI Development Team
 * @version 1.0.0
 */

class TaskAdapter {
  /**
   * 本番のTaskListオブジェクトを実行用形式に変換
   * @param {Object} taskListData - TaskListのJSONデータまたはTaskListオブジェクト
   * @returns {Object} StreamProcessor用のタスクリスト形式
   */
  static fromTaskList(taskListData) {
    // TaskListのJSON形式かどうかチェック
    if (taskListData && taskListData.tasks) {
      return {
        tasks: taskListData.tasks,
        createdAt: taskListData.createdAt || Date.now(),
        getStatistics: () => {
          // 統計情報を生成
          const stats = {
            total: taskListData.tasks.length,
            byAI: {},
            executable: 0,
            skipped: 0
          };
          
          taskListData.tasks.forEach(task => {
            // AIタイプ別にカウント
            if (!stats.byAI[task.aiType]) {
              stats.byAI[task.aiType] = 0;
            }
            stats.byAI[task.aiType]++;
            
            // 実行可能/スキップをカウント
            if (task.skipReason) {
              stats.skipped++;
            } else {
              stats.executable++;
            }
          });
          
          return stats;
        }
      };
    }
    
    // すでに変換済みまたは互換性のある形式の場合はそのまま返す
    return taskListData;
  }
  
  /**
   * プロンプトからタスクリストを生成（手動モード用）
   * @param {Object} prompts - 各AIのプロンプト設定
   * @param {Object} aiConfigs - 各AIの設定（有効/無効、モデル、機能など）
   * @returns {Object} タスクリスト
   */
  static fromPrompts(prompts, aiConfigs) {
    const tasks = [];
    let taskIdCounter = 0;
    
    // 各AIについてタスクを生成
    Object.keys(aiConfigs).forEach(aiType => {
      const config = aiConfigs[aiType];
      const prompt = prompts[aiType];
      
      // AIが有効でプロンプトがある場合のみタスクを生成
      if (config.enabled && prompt && prompt.trim()) {
        tasks.push({
          id: `manual_${aiType}_${++taskIdCounter}_${Date.now()}`,
          aiType: aiType,
          taskType: 'ai',
          prompt: prompt,
          model: config.model,
          function: config.function,
          column: this.getColumnForAI(aiType),
          row: taskIdCounter + 1,
          promptColumn: 'B',
          skipReason: null,
          createdAt: Date.now()
        });
      }
    });
    
    return {
      tasks: tasks,
      createdAt: Date.now(),
      getStatistics: () => ({
        total: tasks.length,
        byAI: this.countByAI(tasks),
        executable: tasks.length,
        skipped: 0
      })
    };
  }
  
  /**
   * 3連続テスト用のタスクリストを生成
   * @param {Array} enabledAIs - 有効なAIのリスト
   * @param {Array} testPrompts - テスト用プロンプトの配列
   * @returns {Object} 3連続テスト用タスクリスト
   */
  static createConsecutiveTestTasks(enabledAIs, testPrompts) {
    const tasks = [];
    const baseColumns = ['D', 'E', 'F', 'G'];
    const windowPositions = [0, 1, 2, 3];
    
    enabledAIs.forEach((aiInfo, aiIndex) => {
      const aiType = aiInfo.key || aiInfo.name?.toLowerCase();
      const promptColumn = baseColumns[aiIndex];
      const answerColumn = String.fromCharCode(promptColumn.charCodeAt(0) + 1);
      
      // 各AIに3つのプロンプトを順番に実行
      for (let repeat = 0; repeat < 3; repeat++) {
        const promptIndex = repeat % testPrompts.length;
        const prompt = testPrompts[promptIndex];
        
        tasks.push({
          id: `${aiType}_test_q${promptIndex + 1}_rep${repeat + 1}_${Date.now()}`,
          column: answerColumn,
          row: (repeat * enabledAIs.length) + aiIndex + 2,
          promptColumn: promptColumn,
          prompt: prompt,
          aiType: aiType,
          taskType: 'ai',
          // テストモード用設定：AI実行をスキップ
          waitResponse: false,
          getResponse: false,
          preferredPosition: windowPositions[aiIndex],
          groupId: `test_group_${aiType}_${promptColumn}`,
          groupInfo: {
            type: 'single',
            columns: ['C', promptColumn, answerColumn],
            promptColumn: promptColumn
          },
          logColumns: {
            log: 'C',
            layout: 'single'
          }
        });
      }
    });
    
    return {
      tasks: tasks,
      getStatistics: () => ({
        total: tasks.length,
        byAI: this.countByAI(tasks),
        executable: tasks.length,
        skipped: 0
      })
    };
  }
  
  /**
   * URLパラメータからタスクリストを受信
   * @returns {Object|null} タスクリストまたはnull
   */
  static receiveFromURL() {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const mode = urlParams.get('mode');
      const data = urlParams.get('data');
      
      if (mode === 'tasklist' && data) {
        const taskListData = JSON.parse(decodeURIComponent(data));
        console.log('📥 URLパラメータからタスクリストを受信:', taskListData);
        return this.fromTaskList(taskListData);
      }
    } catch (error) {
      console.error('URLパラメータの解析エラー:', error);
    }
    
    return null;
  }
  
  /**
   * postMessageでタスクリストを受信するリスナーを設定
   * @param {Function} callback - タスクリスト受信時のコールバック
   */
  static setupMessageListener(callback) {
    window.addEventListener('message', (event) => {
      // セキュリティチェック（同一オリジンまたは拡張機能から）
      if (event.origin !== window.location.origin && 
          !event.origin.startsWith('chrome-extension://')) {
        return;
      }
      
      // タスクリストメッセージの処理
      if (event.data && event.data.type === 'TASK_LIST') {
        console.log('📥 postMessageでタスクリストを受信:', event.data.taskList);
        const taskList = this.fromTaskList(event.data.taskList);
        callback(taskList);
      }
    });
  }
  
  /**
   * Chrome Storageからタスクリストを読み込み
   * @returns {Promise<Object|null>} タスクリストまたはnull
   */
  static async loadFromStorage() {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        // 本番用と統合テスト用の両方をチェック
        const result = await chrome.storage.local.get([
          'task_queue',
          'task_queue_for_test'
        ]);
        
        const taskData = result.task_queue_for_test || result.task_queue;
        if (taskData) {
          console.log('📥 Chrome Storageからタスクリストを読み込み:', taskData);
          // 読み込み後、task_queue_for_testをクリア（次回の混乱を防ぐ）
          if (result.task_queue_for_test) {
            chrome.storage.local.remove(['task_queue_for_test']);
          }
          return this.fromTaskList(taskData);
        }
      }
    } catch (error) {
      console.error('Chrome Storage読み込みエラー:', error);
    }
    
    return null;
  }
  
  /**
   * 実行モードを判定
   * @returns {Promise<Object>} {mode: 'tasklist'|'manual', taskList: Object|null}
   */
  static async detectMode() {
    // 1. URLパラメータをチェック
    const urlTaskList = this.receiveFromURL();
    if (urlTaskList) {
      return { mode: 'tasklist', taskList: urlTaskList };
    }
    
    // 2. Chrome Storageをチェック
    const storageTaskList = await this.loadFromStorage();
    if (storageTaskList) {
      return { mode: 'tasklist', taskList: storageTaskList };
    }
    
    // 3. デフォルトは手動モード
    return { mode: 'manual', taskList: null };
  }
  
  // ===== ヘルパー関数 =====
  
  /**
   * AIタイプに対応する列を取得
   * @private
   */
  static getColumnForAI(aiType) {
    const columnMap = {
      'chatgpt': 'D',
      'claude': 'E',
      'gemini': 'F',
      'genspark': 'G'
    };
    return columnMap[aiType.toLowerCase()] || 'D';
  }
  
  /**
   * AIタイプ別にタスクをカウント
   * @private
   */
  static countByAI(tasks) {
    const count = {};
    tasks.forEach(task => {
      if (!count[task.aiType]) {
        count[task.aiType] = 0;
      }
      count[task.aiType]++;
    });
    return count;
  }
}

// グローバルに公開
if (typeof window !== 'undefined') {
  window.TaskAdapter = TaskAdapter;
}

// モジュールとしてもエクスポート
if (typeof module !== 'undefined' && module.exports) {
  module.exports = TaskAdapter;
}