/**
 * @fileoverview ColumnProcessor - プロンプトグループベースの順次処理システム
 * 
 * 特徴:
 * - プロンプトグループごとにタスクリストを生成して処理
 * - 前の列の結果を次の列のプロンプトに反映
 * - 3種類AI対応（並列実行）
 * - 3つずつウィンドウを使って並列処理
 */

import { AITaskExecutor } from '../../core/ai-task-executor.js';

export default class ColumnProcessor {
  constructor(logger = console) {
    this.logger = logger;
    this.spreadsheetData = null;
    this.aiTaskExecutor = new AITaskExecutor(logger);
    this.activeWindows = new Map(); // タスク位置ごとのウィンドウ情報 (0,1,2)
    this.completed = [];
    this.failed = [];
  }

  /**
   * スプレッドシートをプロンプトグループ単位で処理
   * @param {Object} spreadsheetData - スプレッドシートデータ
   * @returns {Promise<Object>} 処理結果
   */
  async processSpreadsheet(spreadsheetData) {
    this.logger.log('[ColumnProcessor] 🚀 処理開始');
    this.spreadsheetData = spreadsheetData;
    
    const startTime = Date.now();
    
    // 作業開始時に拡張機能ウィンドウを右下に移動
    await this.moveExtensionWindowToBottomRight();
    
    // プロンプトグループを動的に検出
    const promptGroups = this.identifyPromptGroups();
    this.logger.log(`[ColumnProcessor] 📊 プロンプトグループ数: ${promptGroups.length}`);
    
    const processedGroups = [];
    
    // グループごとに処理
    for (let groupIndex = 0; groupIndex < promptGroups.length; groupIndex++) {
      const group = promptGroups[groupIndex];
      this.logger.log(`[ColumnProcessor] 📋 グループ ${groupIndex + 1}/${promptGroups.length} の処理開始`, {
        プロンプト列: group.promptColumns.map(i => this.indexToColumn(i)),
        回答列: group.answerColumns.map(i => this.indexToColumn(i)),
        AI種別: group.aiType,
        is3TypeAI: group.is3TypeAI
      });
      
      // スプレッドシートを再読み込み（前のグループの結果を反映）
      if (groupIndex > 0) {
        await this.reloadSpreadsheet();
      }
      
      // このグループのタスクリストを生成
      const tasks = await this.generateGroupTasks(group);
      
      if (tasks.length === 0) {
        this.logger.log(`[ColumnProcessor] グループ ${groupIndex + 1} に処理対象タスクなし`);
        continue;
      }
      
      this.logger.log(`[ColumnProcessor] 📝 グループ ${groupIndex + 1} のタスク数: ${tasks.length}`);
      processedGroups.push(groupIndex);
      
      // タスクを実行（3つずつ並列処理）
      await this.executeGroupTasks(group, tasks);
    }
    
    // 全ウィンドウを閉じる
    await this.closeAllWindows();
    
    const totalTime = Math.round((Date.now() - startTime) / 1000);
    
    return {
      success: true,
      total: this.completed.length + this.failed.length,
      completed: this.completed.length,
      failed: this.failed.length,
      totalTime: `${totalTime}秒`,
      processedGroups: processedGroups.length
    };
  }

  /**
   * プロンプトグループを動的に検出
   * @returns {Array} プロンプトグループの配列
   */
  identifyPromptGroups() {
    const groups = [];
    const structure = this.analyzeStructure();
    const { menuRow, aiRow } = structure;
    
    if (menuRow < 0 || aiRow < 0) {
      return groups;
    }
    
    const menuRowData = this.spreadsheetData.values[menuRow];
    const aiRowData = this.spreadsheetData.values[aiRow];
    
    let currentGroup = null;
    
    for (let i = 0; i < menuRowData.length; i++) {
      const menuCell = menuRowData[i] || '';
      const aiCell = aiRowData[i] || '';
      
      // プロンプト列を検出（プロンプト、プロンプト2-5）
      if (menuCell.includes('プロンプト')) {
        if (!currentGroup) {
          // 新しいグループを開始
          currentGroup = {
            promptColumns: [],
            answerColumns: [],
            aiType: aiCell,
            is3TypeAI: aiCell.includes('3種類AI') || aiCell.includes('３種類AI')
          };
        }
        currentGroup.promptColumns.push(i);
      }
      // 回答列またはレポート化列を検出
      else if (menuCell.includes('回答') || menuCell.includes('レポート')) {
        if (currentGroup) {
          currentGroup.answerColumns.push(i);
        }
      }
      // グループの終了を検出（プロンプトも回答も含まない列）
      else if (currentGroup && currentGroup.promptColumns.length > 0 && currentGroup.answerColumns.length > 0) {
        groups.push(currentGroup);
        currentGroup = null;
      }
    }
    
    // 最後のグループを追加
    if (currentGroup && currentGroup.promptColumns.length > 0 && currentGroup.answerColumns.length > 0) {
      groups.push(currentGroup);
    }
    
    return groups;
  }

  /**
   * グループのタスクを生成（セル位置情報のみ）
   * @param {Object} group - プロンプトグループ
   * @returns {Promise<Array>} タスクリスト
   */
  async generateGroupTasks(group) {
    const tasks = [];
    const structure = this.analyzeStructure();
    const { startRow } = structure;
    
    // 行制御を取得
    const rowControl = this.getRowControl();
    
    // 作業行でタスクを生成
    for (let rowIndex = startRow; rowIndex < this.spreadsheetData.values.length; rowIndex++) {
      const rowNumber = rowIndex + 1;
      
      // 行制御チェック
      if (!this.shouldProcessRow(rowNumber, rowControl)) {
        continue;
      }
      
      // プロンプトの存在確認
      const hasPrompt = group.promptColumns.some(pCol => {
        const value = this.getCellValue(rowIndex, pCol);
        return value && value.trim();
      });
      
      if (!hasPrompt) {
        continue;
      }
      
      // 3種類AIの場合は3つのタスクを生成
      if (group.is3TypeAI) {
        // ChatGPT, Claude, Geminiの順で処理
        const aiTypes = [
          { type: 'ChatGPT', name: 'ChatGPT' },
          { type: 'Claude', name: 'Claude' },
          { type: 'Gemini', name: 'Gemini' }
        ];
        
        for (let i = 0; i < Math.min(3, group.answerColumns.length); i++) {
          const answerCol = group.answerColumns[i];
          const existingAnswer = this.getCellValue(rowIndex, answerCol);
          
          if (!this.hasAnswer(existingAnswer)) {
            tasks.push({
              id: `${this.indexToColumn(answerCol)}${rowNumber}_${Date.now()}_${i}`,
              row: rowNumber,
              rowIndex: rowIndex,
              promptColumns: group.promptColumns,
              answerColumn: answerCol,
              aiType: aiTypes[i].type,
              aiName: aiTypes[i].name,
              is3TypeAI: true
            });
          }
        }
      } else {
        // 通常の場合は1つのタスク
        const answerCol = group.answerColumns[0];
        const existingAnswer = this.getCellValue(rowIndex, answerCol);
        
        if (!this.hasAnswer(existingAnswer)) {
          tasks.push({
            id: `${this.indexToColumn(answerCol)}${rowNumber}_${Date.now()}`,
            row: rowNumber,
            rowIndex: rowIndex,
            promptColumns: group.promptColumns,
            answerColumn: answerCol,
            aiType: this.getAIType(group.aiType),
            is3TypeAI: false
          });
        }
      }
    }
    
    return tasks;
  }

  /**
   * グループのタスクを実行（3つずつ並列処理）
   * @param {Object} group - プロンプトグループ
   * @param {Array} tasks - タスクリスト
   */
  async executeGroupTasks(group, tasks) {
    const structure = this.analyzeStructure();
    const { modelRow, functionRow } = structure;
    
    // 3つずつ処理
    for (let i = 0; i < tasks.length; i += 3) {
      const batch = tasks.slice(i, Math.min(i + 3, tasks.length));
      this.logger.log(`[ColumnProcessor] 🎯 バッチ処理開始: ${batch.length}タスク`);
      
      // 各タスクのプロンプトとモデル・機能を事前に準備
      const taskDataList = [];
      for (let taskIndex = 0; taskIndex < batch.length; taskIndex++) {
        const task = batch[taskIndex];
        
        // プロンプトを動的取得
        const prompt = await this.fetchPrompt(task);
        if (!prompt) {
          this.logger.warn(`[ColumnProcessor] ⚠️ プロンプトが空: ${this.indexToColumn(task.answerColumn)}${task.row}`);
          this.failed.push(task.id);
          continue;
        }
        
        // セル位置をプロンプトの冒頭に追加
        const cellPosition = `${this.indexToColumn(task.answerColumn)}${task.row}`;
        const promptWithPosition = `【現在${cellPosition}セルを処理中です】\n\n${prompt}`;
        
        // モデルと機能を取得（TaskGeneratorV2と同じロジック）
        let model, func;
        if (group.is3TypeAI) {
          // 3種類AIの場合は回答列のモデル・機能を使用
          const rawModel = this.getCellValue(modelRow, task.answerColumn);
          const rawFunc = this.getCellValue(functionRow, task.answerColumn);
          this.logger.log(`[ColumnProcessor] 3種類AI: モデル取得 row=${modelRow} col=${task.answerColumn} value="${rawModel}"`);
          this.logger.log(`[ColumnProcessor] 3種類AI: 機能取得 row=${functionRow} col=${task.answerColumn} value="${rawFunc}"`);
          // スプレッドシートの値をそのまま使用
          model = rawModel;
          func = rawFunc;
        } else {
          // 通常の場合: まずプロンプト列から取得を試み、なければ回答列から取得
          let rawModel = null;
          let rawFunc = null;
          
          // まずプロンプト列から取得を試みる
          if (group.promptColumns && group.promptColumns.length > 0) {
            rawModel = this.getCellValue(modelRow, group.promptColumns[0]);
            rawFunc = this.getCellValue(functionRow, group.promptColumns[0]);
            if (rawModel) {
              this.logger.log(`[ColumnProcessor] 通常: モデル取得 プロンプト列${group.promptColumns[0]}から "${rawModel}"`);
            }
            if (rawFunc) {
              this.logger.log(`[ColumnProcessor] 通常: 機能取得 プロンプト列${group.promptColumns[0]}から "${rawFunc}"`);
            }
          }
          
          // プロンプト列に値がなければ回答列から取得
          if (!rawModel && group.answerColumns && group.answerColumns.length > 0) {
            rawModel = this.getCellValue(modelRow, group.answerColumns[0]);
            if (rawModel) {
              this.logger.log(`[ColumnProcessor] 通常: モデル取得 回答列${group.answerColumns[0]}から "${rawModel}"`);
            }
          }
          if (!rawFunc && group.answerColumns && group.answerColumns.length > 0) {
            rawFunc = this.getCellValue(functionRow, group.answerColumns[0]);
            if (rawFunc) {
              this.logger.log(`[ColumnProcessor] 通常: 機能取得 回答列${group.answerColumns[0]}から "${rawFunc}"`);
            }
          }
          
          // スプレッドシートの値をそのまま使用（空の場合はnullまたはundefined）
          model = rawModel;
          func = rawFunc;
        }
        
        // タスクデータを保存（後でウィンドウを並列で開く）
        taskDataList.push({
          task: task,
          prompt: promptWithPosition,
          model: model,
          func: func,
          taskIndex: taskIndex
        });
      }
      
      // すべてのウィンドウを同時に開く（並列処理）
      this.logger.log(`[ColumnProcessor] 🚀 ${taskDataList.length}個のウィンドウを並列で開きます`);
      const windowOpenStartTime = performance.now();
      
      const windowPromises = taskDataList.map(async (data) => {
        const tabId = await this.createNewWindow(data.task.aiType, data.taskIndex);
        if (!tabId) {
          this.logger.error(`[ColumnProcessor] ウィンドウ作成失敗: ${this.indexToColumn(data.task.answerColumn)}${data.task.row}`);
          this.failed.push(data.task.id);
          return null;
        }
        return { ...data, tabId };
      });
      
      const windows = await Promise.all(windowPromises);
      const validWindows = windows.filter(w => w !== null);
      
      const windowOpenTime = (performance.now() - windowOpenStartTime).toFixed(0);
      this.logger.log(`[ColumnProcessor] ✅ ${validWindows.length}個のウィンドウを開きました (${windowOpenTime}ms)`);
      
      // 5秒ずつずらして送信
      const promises = [];
      for (let i = 0; i < validWindows.length; i++) {
        const window = validWindows[i];
        
        // 送信を遅延実行
        const delayedExecution = (async () => {
          // 指定秒数待機してから送信
          await this.delay(i * 5000);
          return this.executeSingleTask(window.task, window.prompt, window.model, window.func, window.taskIndex, window.tabId);
        })();
        
        promises.push(delayedExecution);
      }
      
      // バッチ内の全タスクの完了を待つ
      await Promise.allSettled(promises);
      
      // ウィンドウは各タスクで個別に閉じるので、ここでは閉じない
      
      this.logger.log(`[ColumnProcessor] ✅ バッチ処理完了`);
      
      // 次のバッチまで少し待機
      if (i + 3 < tasks.length) {
        await this.delay(2000);
      }
    }
  }

  /**
   * 単一タスクを実行
   * @param {Object} task - タスク
   * @param {string} prompt - プロンプト
   * @param {string} model - モデル
   * @param {string} func - 機能
   * @param {number} taskPosition - タスク位置（0,1,2）
   * @param {number} tabId - 既に開いているタブID（オプション）
   */
  async executeSingleTask(task, prompt, model, func, taskPosition = 0, tabId = null) {
    const taskKey = `${this.indexToColumn(task.answerColumn)}${task.row}`;
    let windowId = null;
    
    try {
      this.logger.log(`[ColumnProcessor] 🎯 実行中: ${taskKey} (${task.aiType}) - 位置: ${taskPosition}`);
      
      // タブIDが渡されていない場合は新規作成（後方互換性のため）
      if (!tabId) {
        tabId = await this.createNewWindow(task.aiType, taskPosition);
        if (!tabId) {
          throw new Error(`Failed to create tab for ${task.aiType}`);
        }
      }
      
      // ウィンドウIDを保存（後で閉じるため）
      if (this.activeWindows.has(taskPosition)) {
        windowId = this.activeWindows.get(taskPosition).windowId;
      }
      
      // AITaskExecutorを使用してタスク実行（モデル・機能設定、プロンプト送信を含む）
      const result = await this.aiTaskExecutor.executeAITask(tabId, {
        aiType: task.aiType,
        taskId: task.id,
        model: model,
        function: func,
        prompt: prompt,
        cellInfo: {
          row: task.row,
          column: this.indexToColumn(task.answerColumn),
          columnIndex: task.answerColumn
        }
      });
      
      if (result.success) {
        // 結果をスプレッドシートに書き込み
        await this.writeToSpreadsheet(task, result.response);
        this.logger.log(`[ColumnProcessor] ✅ 完了: ${taskKey}`);
        this.completed.push(task.id);
        
        // タスク成功時のみウィンドウを閉じる（V2の場合は完了を待っているため）
        if (windowId) {
          try {
            await chrome.windows.remove(windowId);
            this.logger.log(`[ColumnProcessor] ウィンドウを閉じました: ${taskKey}`);
            this.activeWindows.delete(taskPosition);
          } catch (e) {
            // 既に閉じている場合は無視
          }
        }
      } else {
        throw new Error(result.error || 'Task execution failed');
      }
      
    } catch (error) {
      this.logger.error(`[ColumnProcessor] ❌ エラー: ${taskKey}`, error.message);
      this.failed.push(task.id);
      
      // エラー時もウィンドウを閉じる
      if (windowId) {
        try {
          await chrome.windows.remove(windowId);
          this.logger.log(`[ColumnProcessor] ウィンドウを閉じました（エラー）: ${taskKey}`);
          this.activeWindows.delete(taskPosition);
        } catch (e) {
          // 既に閉じている場合は無視
        }
      }
    }
  }

  /**
   * プロンプトを動的に取得（プロンプト1-5を連結）
   * @param {Object} task - タスク
   * @returns {Promise<string>} プロンプト
   */
  async fetchPrompt(task) {
    try {
      const prompts = [];
      
      // 各プロンプト列から値を取得
      for (const colIndex of task.promptColumns) {
        const value = this.getCellValue(task.rowIndex, colIndex);
        if (value && value.trim()) {
          prompts.push(value.trim());
        }
      }
      
      // プロンプトを連結
      return prompts.join('\n\n');
      
    } catch (error) {
      this.logger.error(`[ColumnProcessor] プロンプト取得エラー:`, error);
      return null;
    }
  }

  /**
   * 新しいウィンドウを作成（タスクごとに毎回新規）
   * @param {string} aiType - AI種別
   * @param {number} taskPosition - タスク位置（0,1,2）
   * @returns {Promise<number>} タブID
   */
  async createNewWindow(aiType, taskPosition = 0) {
    try {
      // 既存のウィンドウがあれば先に閉じる
      if (this.activeWindows.has(taskPosition)) {
        const windowInfo = this.activeWindows.get(taskPosition);
        try {
          await chrome.windows.remove(windowInfo.windowId);
        } catch (e) {
          // 既に閉じている場合は無視
        }
        this.activeWindows.delete(taskPosition);
      }
      
      const windowCreateStart = performance.now();
      
      // タスク位置に基づいてウィンドウ位置を計算
      const position = await this.calculateWindowPosition(taskPosition);
      
      // 新しいウィンドウを作成
      const url = this.getAIUrl(aiType);
      const window = await chrome.windows.create({
        url: url,
        type: 'popup',  // popupタイプに変更
        left: position.left,
        top: position.top,
        width: position.width,
        height: position.height
      });
      
      const createTime = (performance.now() - windowCreateStart).toFixed(0);
      this.logger.log(`[ColumnProcessor] ウィンドウ作成完了 (${createTime}ms): ${aiType} - ID=${window.id}`);
      
      this.activeWindows.set(taskPosition, { 
        windowId: window.id,
        aiType: aiType
      });
      
      // タブを取得
      const tabs = await chrome.tabs.query({ windowId: window.id });
      const tabId = tabs[0].id;
      
      // ページ読み込み完了を動的に待機（最大15秒）
      const readyStartTime = performance.now();
      await this.waitForTabReady(tabId, aiType);
      const readyTime = (performance.now() - readyStartTime).toFixed(0);
      this.logger.log(`[ColumnProcessor] ページ読み込み完了 (${readyTime}ms): ${aiType}`);
      
      // スクリプト注入前の短い待機（安定性のため）
      await this.delay(500);
      
      return tabId;
      
    } catch (error) {
      this.logger.error(`[ColumnProcessor] タブ作成エラー:`, error);
      return null;
    }
  }

  /**
   * ウィンドウ位置を計算（タスク位置ベースの4分割配置）
   * @param {number} taskPosition - タスク位置（0,1,2）
   * @returns {Promise<Object>} 位置情報
   */
  async calculateWindowPosition(taskPosition) {
    // 画面情報を取得
    const displays = await chrome.system.display.getInfo();
    const primaryDisplay = displays.find(d => d.isPrimary) || displays[0];
    
    const screenWidth = primaryDisplay.workArea.width;
    const screenHeight = primaryDisplay.workArea.height;
    const screenLeft = primaryDisplay.workArea.left;
    const screenTop = primaryDisplay.workArea.top;
    
    // 画面を4分割
    const halfWidth = Math.floor(screenWidth / 2);
    const halfHeight = Math.floor(screenHeight / 2);
    
    // タスク位置ごとの配置
    const positions = [
      {
        // 1つ目のタスク: 左上
        left: screenLeft,
        top: screenTop,
        width: halfWidth,
        height: halfHeight
      },
      {
        // 2つ目のタスク: 右上
        left: screenLeft + halfWidth,
        top: screenTop,
        width: halfWidth,
        height: halfHeight
      },
      {
        // 3つ目のタスク: 左下
        left: screenLeft,
        top: screenTop + halfHeight,
        width: halfWidth,
        height: halfHeight
      }
    ];
    
    // 右下は拡張機能用に空けておく
    
    return positions[taskPosition] || positions[0];
  }

  /**
   * スプレッドシートを再読み込み
   */
  async reloadSpreadsheet() {
    try {
      // background contextで実行されているかチェック
      if (globalThis.sheetsClient) {
        // background contextから直接SheetsClientを使用
        const gid = this.spreadsheetData.gid || null;
        const data = await globalThis.sheetsClient.loadAutoAIData(
          this.spreadsheetData.spreadsheetId,
          gid
        );
        this.spreadsheetData.values = data.values;
        this.logger.log('[ColumnProcessor] ✅ スプレッドシート再読み込み完了（direct）');
      } else {
        // UIページから実行されている場合
        const response = await chrome.runtime.sendMessage({
          action: 'loadSpreadsheet',
          spreadsheetId: this.spreadsheetData.spreadsheetId,
          sheetName: this.spreadsheetData.sheetName
        });
        
        if (response && response.success) {
          this.spreadsheetData.values = response.data.values;
        }
        this.logger.log('[ColumnProcessor] ✅ スプレッドシート再読み込み完了（message）');
      }
    } catch (error) {
      this.logger.error('[ColumnProcessor] スプレッドシート再読み込みエラー:', error);
    }
  }

  /**
   * 結果をスプレッドシートに書き込み
   * @param {Object} task - タスク
   * @param {string} response - AI応答
   */
  async writeToSpreadsheet(task, response) {
    try {
      if (!response) return;
      
      const column = this.indexToColumn(task.answerColumn);
      const range = `${column}${task.row}`;
      
      // background contextで実行されているかチェック
      if (globalThis.sheetsClient) {
        // background contextから直接SheetsClientを使用
        const fullRange = this.spreadsheetData.sheetName 
          ? `'${this.spreadsheetData.sheetName}'!${range}` 
          : range;
        
        await globalThis.sheetsClient.updateCell(
          this.spreadsheetData.spreadsheetId, 
          fullRange, 
          response,
          this.spreadsheetData.gid
        );
        
        this.logger.log(`[ColumnProcessor] 📝 書き込み完了: ${range}`);
      } else {
        // UIページから実行されている場合はメッセージ送信
        const result = await chrome.runtime.sendMessage({
          action: 'writeToSpreadsheet',
          spreadsheetId: this.spreadsheetData.spreadsheetId,
          range: range,
          value: response,
          sheetName: this.spreadsheetData.sheetName
        });
        
        if (!result || !result.success) {
          throw new Error(result?.error || 'Failed to write');
        }
        
        this.logger.log(`[ColumnProcessor] 📝 書き込み完了: ${range}`);
      }
    } catch (error) {
      this.logger.error(`[ColumnProcessor] 書き込みエラー:`, error);
    }
  }

  /**
   * スプレッドシート構造を解析
   */
  analyzeStructure() {
    let menuRow = -1, aiRow = -1, modelRow = -1, functionRow = -1;
    
    for (let i = 0; i < Math.min(10, this.spreadsheetData.values.length); i++) {
      const firstCell = this.getCellValue(i, 0);
      if (!firstCell) continue;
      
      const lower = firstCell.toLowerCase();
      if (lower.includes('メニュー')) menuRow = i;
      else if (lower === 'ai') aiRow = i;
      else if (lower === 'モデル' || lower === 'model') modelRow = i;
      else if (lower === '機能' || lower === 'function') functionRow = i;
    }
    
    const startRow = Math.max(menuRow + 1, aiRow + 1, modelRow + 1, functionRow + 1, 8);
    
    return { menuRow, aiRow, modelRow, functionRow, startRow };
  }

  /**
   * 行制御を取得
   */
  getRowControl() {
    for (let i = 0; i < Math.min(20, this.spreadsheetData.values.length); i++) {
      const cell = this.getCellValue(i, 0);
      if (!cell) continue;
      
      const lower = cell.toLowerCase();
      if (lower.startsWith('only:')) {
        return { type: 'only', values: this.parseControlValues(cell.substring(5)) };
      } else if (lower.startsWith('skip:')) {
        return { type: 'skip', values: this.parseControlValues(cell.substring(5)) };
      }
    }
    return null;
  }

  /**
   * 行を処理すべきか判定
   */
  shouldProcessRow(rowNumber, rowControl) {
    if (!rowControl) return true;
    
    if (rowControl.type === 'only') {
      return rowControl.values.includes(rowNumber);
    } else if (rowControl.type === 'skip') {
      return !rowControl.values.includes(rowNumber);
    }
    
    return true;
  }

  /**
   * 制御値をパース
   */
  parseControlValues(str) {
    const values = [];
    const parts = str.split(',');
    
    for (const part of parts) {
      const trimmed = part.trim();
      if (/^\d+$/.test(trimmed)) {
        values.push(parseInt(trimmed, 10));
      } else if (/^\d+-\d+$/.test(trimmed)) {
        const [start, end] = trimmed.split('-').map(n => parseInt(n, 10));
        for (let i = start; i <= end; i++) {
          values.push(i);
        }
      }
    }
    
    return values;
  }

  /**
   * セルの値を取得
   */
  getCellValue(row, col) {
    if (typeof row === 'number' && row >= 0 && row < this.spreadsheetData.values.length) {
      const rowData = this.spreadsheetData.values[row];
      if (rowData && col >= 0 && col < rowData.length) {
        return rowData[col];
      }
    }
    return null;
  }

  /**
   * 回答が存在するか確認
   */
  hasAnswer(value) {
    if (!value || !value.trim()) return false;
    
    const trimmed = value.trim().toLowerCase();
    const errorMarkers = ['error', 'エラー', 'failed', '失敗', '×'];
    
    return !errorMarkers.some(marker => trimmed.includes(marker));
  }

  /**
   * 列インデックスを列名に変換
   */
  indexToColumn(index) {
    let column = '';
    let temp = index;
    
    while (temp >= 0) {
      column = String.fromCharCode((temp % 26) + 65) + column;
      temp = Math.floor(temp / 26) - 1;
    }
    
    return column;
  }

  /**
   * AI種別を正規化（AITaskExecutorのautomationMapと一致させる）
   */
  getAIType(aiTypeStr) {
    const lower = aiTypeStr.toLowerCase();
    if (lower.includes('chatgpt') || lower.includes('gpt')) return 'ChatGPT';
    if (lower.includes('claude')) return 'Claude';
    if (lower.includes('gemini')) return 'Gemini';
    if (lower.includes('genspark')) return 'Genspark';
    return 'Claude'; // デフォルト
  }

  /**
   * AI種別のURLを取得
   */
  getAIUrl(aiType) {
    const urls = {
      'claude': 'https://claude.ai/new',
      'chatgpt': 'https://chat.openai.com',
      'gemini': 'https://gemini.google.com/app',
      'genspark': 'https://www.genspark.ai'
    };
    
    return urls[aiType.toLowerCase()] || urls.claude;
  }

  /**
   * 全ウィンドウを閉じる
   */
  async closeAllWindows() {
    for (const [taskPosition, windowInfo] of this.activeWindows) {
      try {
        await chrome.windows.remove(windowInfo.windowId);
        this.logger.log(`[ColumnProcessor] ウィンドウを閉じました: 位置${taskPosition} (${windowInfo.aiType})`);
      } catch (error) {
        // 既に閉じている場合は無視
      }
    }
    this.activeWindows.clear();
  }

  /**
   * タブの準備完了を待機
   * @param {number} tabId - タブID
   * @param {string} aiType - AI種別
   */
  async waitForTabReady(tabId, aiType) {
    const maxAttempts = 30; // 最大30秒待機
    let attempts = 0;
    
    while (attempts < maxAttempts) {
      try {
        const tab = await chrome.tabs.get(tabId);
        
        // ページが完全に読み込まれているかチェック
        if (tab.status === 'complete' && !tab.url.startsWith('chrome://')) {
          this.logger.log(`[ColumnProcessor] ✅ ${aiType}タブ準備完了`);
          return true;
        }
      } catch (error) {
        this.logger.error(`[ColumnProcessor] タブ状態確認エラー:`, error);
      }
      
      await this.delay(1000);
      attempts++;
    }
    
    this.logger.warn(`[ColumnProcessor] ⚠️ ${aiType}タブ準備タイムアウト`);
    return false;
  }

  /**
   * 遅延処理
   */
  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 拡張機能ウィンドウを右下に移動
   */
  async moveExtensionWindowToBottomRight() {
    try {
      // 保存されている拡張機能ウィンドウIDを取得
      const result = await chrome.storage.local.get(['extensionWindowId']);
      const windowId = result.extensionWindowId;
      
      if (!windowId) {
        this.logger.log('[ColumnProcessor] 拡張機能ウィンドウIDが見つかりません');
        return;
      }
      
      // ウィンドウが存在するか確認
      try {
        await chrome.windows.get(windowId);
      } catch (error) {
        this.logger.log('[ColumnProcessor] 拡張機能ウィンドウが存在しません');
        return;
      }
      
      // スクリーン情報を取得
      const displays = await chrome.system.display.getInfo();
      const primaryDisplay = displays.find(d => d.isPrimary) || displays[0];
      
      const screenInfo = {
        width: primaryDisplay.workArea.width,
        height: primaryDisplay.workArea.height,
        left: primaryDisplay.workArea.left,
        top: primaryDisplay.workArea.top
      };
      
      // 右下に配置（画面の半分のサイズ）
      const halfWidth = Math.floor(screenInfo.width / 2);
      const halfHeight = Math.floor(screenInfo.height / 2);
      
      await chrome.windows.update(windowId, {
        left: screenInfo.left + halfWidth,
        top: screenInfo.top + halfHeight,
        width: halfWidth,
        height: halfHeight,
        state: 'normal'
      });
      
      this.logger.log('[ColumnProcessor] ✅ 拡張機能ウィンドウを右下に移動しました');
    } catch (error) {
      this.logger.error('[ColumnProcessor] 拡張機能ウィンドウの移動エラー:', error);
    }
  }
}