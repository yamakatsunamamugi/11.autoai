/**
 * Genspark自動化のコアロジック
 * 元のコードを拡張機能用に最適化
 */

import { getSelectors } from '../../config/selectors.js';
import { getCurrentEnvironment } from '../../config/environments.js';
import { Logger } from './utils.js';

export class GensparkAutomation {
  constructor(dataAdapter) {
    this.dataAdapter = dataAdapter;
    this.logger = new Logger();
    this.startTime = Date.now();
    this.environment = null;
    this.selectors = null;
  }

  /**
   * 初期化
   */
  async initialize() {
    this.environment = await getCurrentEnvironment();
    this.selectors = await getSelectors();
    this.logger.setLevel(this.environment.logLevel);
    this.logger.log('Genspark Automation 初期化完了');
  }

  /**
   * 経過時間を取得
   */
  getElapsedTime() {
    const elapsed = Date.now() - this.startTime;
    const minutes = Math.floor(elapsed / 60000);
    const seconds = Math.floor((elapsed % 60000) / 1000);
    return `${minutes}分${seconds}秒`;
  }

  /**
   * 要素を複数のセレクタで検索
   */
  findElement(selectors, elementName) {
    for (const selector of selectors) {
      try {
        const element = document.querySelector(selector);
        if (element) {
          this.logger.log(`${elementName}を発見: ${selector}`);
          return element;
        }
      } catch (e) {
        // セレクタエラーは無視して次を試す
      }
    }

    const errorMessage = `${elementName}の要素が変更されています。UIが変更された可能性があります。\n設定ページ: ${this.selectors.errorPage}`;
    this.logger.error(errorMessage);
    throw new Error(errorMessage);
  }

  /**
   * 待機関数
   */
  wait(seconds) {
    return new Promise(resolve => setTimeout(resolve, seconds * 1000));
  }

  /**
   * メイン実行処理
   */
  async execute() {
    try {
      await this.initialize();
      
      this.logger.log('=== Genspark Automation 開始 ===');
      this.logger.log(`環境: ${this.environment.name}`);
      this.logger.log(`開始時刻: ${new Date().toLocaleString()}`);

      // ステップ1: ページチェック
      await this.checkAndNavigate();
      
      // ステップ2: テキスト入力
      await this.inputText();
      
      // ステップ3: 送信
      await this.submitForm();
      
      // ステップ4: 完了待機
      await this.waitForCompletion();
      
      // ステップ5: 結果取得
      const result = await this.getResult();
      
      this.logger.log('=== 実行完了 ===');
      this.logger.log(`総実行時間: ${this.getElapsedTime()}`);
      
      return {
        success: true,
        url: result.url,
        executionTime: this.getElapsedTime(),
        environment: this.environment.name
      };
      
    } catch (error) {
      this.logger.error(`エラー発生: ${error.message}`);
      return {
        success: false,
        error: error.message,
        executionTime: this.getElapsedTime(),
        environment: this.environment.name
      };
    }
  }

  /**
   * ページチェックとナビゲート
   */
  async checkAndNavigate() {
    this.logger.log('ステップ1: ページチェック');
    
    if (window.location.href !== this.environment.baseUrl) {
      this.logger.log(`URLを開いています: ${this.environment.baseUrl}`);
      window.location.href = this.environment.baseUrl;
      throw new Error('ページが変更されました。拡張機能を再実行してください。');
    }
    
    this.logger.log('ページが正常に読み込まれました');
    await this.wait(this.environment.waitTimes.pageLoad);
  }

  /**
   * テキスト入力
   */
  async inputText() {
    this.logger.log('ステップ2: テキスト入力');
    
    const textInput = this.findElement(this.selectors.textInput, 'テキスト入力欄');
    const inputData = await this.dataAdapter.getData();
    
    textInput.value = inputData.prompt;
    textInput.focus();
    
    const inputEvent = new Event('input', { bubbles: true });
    textInput.dispatchEvent(inputEvent);
    
    this.logger.log(`テキストを入力: "${inputData.prompt}"`);
    await this.wait(this.environment.waitTimes.afterInput);
  }

  /**
   * フォーム送信
   */
  async submitForm() {
    this.logger.log('ステップ3: 送信');
    
    const submitButton = this.findElement(this.selectors.submitButton, '送信ボタン');
    submitButton.click();
    
    this.logger.log('送信ボタンをクリックしました');
    await this.wait(this.environment.waitTimes.afterSubmit);
  }

  /**
   * 完了待機
   */
  async waitForCompletion() {
    this.logger.log('ステップ4: 処理完了待機');
    
    // 停止ボタンの表示を待つ
    let stopButton = null;
    let attempts = 0;
    const maxAttempts = 30;
    
    while (!stopButton && attempts < maxAttempts) {
      for (const selector of this.selectors.stopButton) {
        try {
          stopButton = document.querySelector(selector);
          if (stopButton) {
            this.logger.log('処理中インジケータを検出');
            break;
          }
        } catch (e) {
          // セレクタエラーは無視
        }
      }
      
      if (!stopButton) {
        attempts++;
        await this.wait(1);
      }
    }
    
    if (!stopButton) {
      this.logger.log('処理中インジケータが見つかりませんでした。処理を続行します。');
      return;
    }
    
    // 停止ボタンの消滅を待つ
    this.logger.log('処理完了を待機中...');
    
    let disappeared = false;
    let disappearanceTime = null;
    
    while (!disappeared) {
      let currentStopButton = null;
      
      for (const selector of this.selectors.stopButton) {
        try {
          currentStopButton = document.querySelector(selector);
          if (currentStopButton) break;
        } catch (e) {
          // セレクタエラーは無視
        }
      }
      
      if (!currentStopButton) {
        if (!disappearanceTime) {
          disappearanceTime = Date.now();
          this.logger.log('処理が完了しました。確認待機中...');
        }
        
        if (Date.now() - disappearanceTime >= 5000) {
          disappeared = true;
          this.logger.log('処理完了を確認しました');
        }
      } else {
        if (disappearanceTime) {
          this.logger.log('処理が再開されました。待機を続行...');
          disappearanceTime = null;
        }
      }
      
      await this.wait(this.environment.waitTimes.checkInterval);
    }
    
    await this.wait(this.environment.waitTimes.finalWait);
  }

  /**
   * 結果取得
   */
  async getResult() {
    this.logger.log('ステップ5: 結果取得');
    
    const finalUrl = window.location.href;
    this.logger.log(`最終URL: ${finalUrl}`);
    
    return {
      url: finalUrl,
      timestamp: new Date().toISOString()
    };
  }
}