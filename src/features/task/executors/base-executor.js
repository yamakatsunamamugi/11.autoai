// base-executor.js - 全Executorの基底クラス

/**
 * 全タスクExecutorの共通インターフェースと基本機能
 */
class BaseExecutor {
  constructor(dependencies = {}) {
    // Node.js環境でのテスト用にglobalThisを使用
    const globalContext = typeof self !== "undefined" ? self : globalThis;
    
    this.windowManager = dependencies.windowManager || globalContext.aiWindowManager;
    this.modelManager = dependencies.modelManager || globalContext.modelManager;
    this.logger = dependencies.logger || console;
    
    // 共通状態管理
    this.activeWindows = new Map(); // windowId -> windowInfo
    this.completedTasks = new Set(); // taskId
    this.isProcessing = false;
    this.outputTarget = 'spreadsheet';
    this.isTestMode = false;
  }
  
  /**
   * タスクストリームを処理（各Executorで実装）
   * @param {TaskList} taskList 
   * @param {Object} spreadsheetData 
   * @param {Object} options 
   * @returns {Promise<Object>}
   */
  async processTaskStream(taskList, spreadsheetData, options = {}) {
    throw new Error('processTaskStream must be implemented by subclass');
  }
  
  /**
   * 処理の初期設定
   * @param {TaskList} taskList 
   * @param {Object} spreadsheetData 
   * @param {Object} options 
   */
  setupProcessing(taskList, spreadsheetData, options) {
    // outputTargetの設定
    this.outputTarget = options.outputTarget || (options.testMode ? 'log' : 'spreadsheet');
    this.isProcessing = true;
    this.spreadsheetData = spreadsheetData;
    this.isTestMode = options.testMode || (this.outputTarget === 'log');
    
    this.logger.log(`[${this.constructor.name}] 処理開始`, {
      totalTasks: taskList.tasks.length,
      outputTarget: this.outputTarget,
      testMode: this.isTestMode
    });
  }
  
  /**
   * AIのURLを決定
   * @param {string} aiType 
   * @param {string} column 
   * @returns {string}
   */
  determineAIUrl(aiType, column) {
    const urls = {
      chatgpt: "https://chatgpt.com/?model=gpt-4o",
      claude: "https://claude.ai/",
      gemini: "https://gemini.google.com/app"
    };
    
    const url = urls[aiType] || urls.chatgpt;
    this.logger.log(`[${this.constructor.name}] ${column}列用URL決定: ${url} (${aiType})`);
    return url;
  }
  
  /**
   * 画面情報を取得
   * @returns {Promise<Object>}
   */
  async getScreenInfo() {
    try {
      const displays = await chrome.system.display.getInfo();
      const primaryDisplay = displays.find(d => d.isPrimary) || displays[0];
      
      return {
        width: primaryDisplay.workArea.width,
        height: primaryDisplay.workArea.height,
        left: primaryDisplay.workArea.left,
        top: primaryDisplay.workArea.top
      };
    } catch (error) {
      this.logger.error(`[${this.constructor.name}] 画面情報取得エラー、デフォルト値使用`, error);
      return { width: 1920, height: 1080, left: 0, top: 0 };
    }
  }
  
  /**
   * ウィンドウ位置を計算
   * @param {number} position 
   * @param {Object} screenInfo 
   * @returns {Object}
   */
  calculateWindowPosition(position, screenInfo) {
    const windowWidth = Math.floor(screenInfo.width / 2);
    const windowHeight = Math.floor(screenInfo.height / 2);
    
    const positions = [
      { left: screenInfo.left, top: screenInfo.top },
      { left: screenInfo.left + windowWidth, top: screenInfo.top },
      { left: screenInfo.left, top: screenInfo.top + windowHeight },
      { left: screenInfo.left + windowWidth, top: screenInfo.top + windowHeight }
    ];
    
    return {
      ...positions[position % 4],
      width: windowWidth,
      height: windowHeight
    };
  }
  
  /**
   * 処理完了時のクリーンアップ
   */
  cleanup() {
    this.isProcessing = false;
    this.logger.log(`[${this.constructor.name}] 処理完了、クリーンアップ実行`);
  }
  
  /**
   * 成功結果を返す
   * @param {Object} additionalData 
   * @returns {Object}
   */
  createSuccessResult(additionalData = {}) {
    return {
      success: true,
      executor: this.constructor.name,
      totalWindows: this.activeWindows.size,
      completedTasks: this.completedTasks.size,
      ...additionalData
    };
  }
  
  /**
   * エラー処理
   * @param {Error} error 
   * @param {string} context 
   */
  handleError(error, context = 'Unknown') {
    this.logger.error(`[${this.constructor.name}] ${context}エラー`, {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    this.cleanup();
  }
}

export default BaseExecutor;