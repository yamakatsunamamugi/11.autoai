/**
 * @fileoverview AI回答の自動追加質問ハンドラー
 * 
 * 【機能概要】
 * AIの回答に特定のキーワードが含まれる場合、自動的に追加の質問を送信し、
 * より詳細な回答を取得する機能を提供します。
 * 
 * 【主要機能】
 * - キーワードパターンの検出
 * - 自動追加質問の送信
 * - 追加回答の取得と結合
 * - カスタマイズ可能なパターン設定
 * 
 * 【使用方法】
 * const handler = new AutoFollowupHandler();
 * const finalResponse = await handler.processResponse(initialResponse, aiType);
 */

class AutoFollowupHandler {
  constructor(options = {}) {
    // 機能のON/OFF
    this.enabled = options.enabled !== false; // デフォルトはtrue
    
    // デバッグモード
    this.debug = options.debug || false;
    
    // キーワードパターンと対応する追加質問
    this.followupPatterns = options.patterns || [
      {
        pattern: /希望があれば教えて[くださ下さ]い/,
        response: "初心者でもわかるように丁寧に教えて",
        waitTime: 2000,
        maxRetries: 1,
        description: "詳細説明要求"
      },
      {
        pattern: /詳細が必要な場合は/,
        response: "詳細を教えてください",
        waitTime: 2000,
        maxRetries: 1,
        description: "詳細要求"
      },
      {
        pattern: /他に.*知りたいことがあれば/,
        response: "関連する重要なポイントも教えてください",
        waitTime: 2000,
        maxRetries: 1,
        description: "関連情報要求"
      },
      {
        pattern: /さらに.*説明が必要であれば/,
        response: "もう少し具体的に説明してください",
        waitTime: 2000,
        maxRetries: 1,
        description: "具体的説明要求"
      },
      {
        pattern: /ご質問があれば/,
        response: "実例を交えて説明してください",
        waitTime: 2000,
        maxRetries: 1,
        description: "実例要求"
      }
    ];
    
    // 最大追加質問回数（無限ループ防止）
    this.maxFollowups = options.maxFollowups || 3;
    
    // 現在のAIタスク情報（グローバル変数から取得）
    this.currentAITaskInfo = null;
  }
  
  /**
   * デバッグログ出力
   */
  log(message, data = null) {
    if (this.debug) {
      const prefix = "[AutoFollowup]";
      if (data) {
        console.log(`${prefix} ${message}`, data);
      } else {
        console.log(`${prefix} ${message}`);
      }
    }
  }
  
  /**
   * AI応答を処理し、必要に応じて追加質問を送信
   * @param {string} response - 初期のAI応答
   * @param {string} aiType - AIの種類（ChatGPT/Claude/Gemini）
   * @param {Object} context - 実行コンテキスト
   * @returns {Promise<string>} 最終的な応答（追加回答を含む）
   */
  async processResponse(response, aiType, context = {}) {
    if (!this.enabled) {
      this.log("自動追加質問機能は無効です");
      return response;
    }
    
    this.log(`応答処理開始 (${aiType})`, { 
      responseLength: response?.length,
      context 
    });
    
    let finalResponse = response;
    let followupCount = 0;
    let processedPatterns = new Set(); // 同じパターンの重複処理を防ぐ
    
    // 追加質問ループ
    while (followupCount < this.maxFollowups) {
      const matchedPattern = this.findMatchingPattern(finalResponse, processedPatterns);
      
      if (!matchedPattern) {
        this.log("マッチするパターンなし、処理終了");
        break;
      }
      
      this.log(`パターンマッチ: ${matchedPattern.description}`, {
        pattern: matchedPattern.pattern.toString(),
        response: matchedPattern.response
      });
      
      // このパターンを処理済みとしてマーク
      processedPatterns.add(matchedPattern.pattern.toString());
      
      try {
        // 追加質問を送信して回答を取得
        const additionalResponse = await this.sendFollowupQuestion(
          matchedPattern.response,
          aiType,
          matchedPattern.waitTime,
          context
        );
        
        if (additionalResponse) {
          // 回答を結合（セパレータ付き）
          finalResponse = this.combineResponses(
            finalResponse,
            additionalResponse,
            matchedPattern.description
          );
          
          this.log(`追加回答を結合しました (${matchedPattern.description})`, {
            additionalLength: additionalResponse.length,
            totalLength: finalResponse.length
          });
          
          followupCount++;
        } else {
          this.log("追加回答の取得に失敗しました");
          break;
        }
      } catch (error) {
        console.error("[AutoFollowup] 追加質問送信エラー:", error);
        break;
      }
    }
    
    if (followupCount > 0) {
      this.log(`処理完了: ${followupCount}件の追加質問を実行`, {
        finalLength: finalResponse.length
      });
    }
    
    return finalResponse;
  }
  
  /**
   * マッチするパターンを検索
   * @param {string} text - 検索対象テキスト
   * @param {Set} processedPatterns - 処理済みパターン
   * @returns {Object|null} マッチしたパターンオブジェクト
   */
  findMatchingPattern(text, processedPatterns) {
    if (!text) return null;
    
    for (const pattern of this.followupPatterns) {
      const patternKey = pattern.pattern.toString();
      
      // すでに処理済みのパターンはスキップ
      if (processedPatterns.has(patternKey)) {
        continue;
      }
      
      if (pattern.pattern.test(text)) {
        return pattern;
      }
    }
    
    return null;
  }
  
  /**
   * 追加質問を送信して回答を取得
   * @param {string} question - 追加質問
   * @param {string} aiType - AIの種類
   * @param {number} waitTime - 待機時間（ミリ秒）
   * @param {Object} context - 実行コンテキスト
   * @returns {Promise<string|null>} 追加回答
   */
  async sendFollowupQuestion(question, aiType, waitTime, context) {
    this.log(`追加質問送信準備: "${question}"`, { aiType, waitTime });
    
    // 待機
    await new Promise(resolve => setTimeout(resolve, waitTime));
    
    try {
      // AI種別に応じた送信メソッドを取得
      const sender = this.getAISender(aiType);
      if (!sender) {
        throw new Error(`未対応のAIタイプ: ${aiType}`);
      }
      
      // 質問を送信
      this.log("質問送信中...");
      await sender.sendText(question);
      
      // 応答を待機（最大10分）
      this.log("応答待機中...");
      const response = await sender.waitForResponse(600000);
      
      if (response) {
        this.log("追加回答取得成功", { 
          responseLength: response.length 
        });
        return response;
      } else {
        this.log("追加回答が空でした");
        return null;
      }
      
    } catch (error) {
      console.error("[AutoFollowup] 追加質問送信エラー:", error);
      return null;
    }
  }
  
  /**
   * AI種別に応じた送信オブジェクトを取得
   * @param {string} aiType - AIの種類
   * @returns {Object|null} 送信オブジェクト
   */
  getAISender(aiType) {
    // 各AIの自動化スクリプトから関数を取得
    switch (aiType.toLowerCase()) {
      case 'chatgpt':
        if (window.ChatGPTAutomation) {
          return {
            sendText: async (text) => {
              // ChatGPTAutomationのsendText関数を使用
              if (window.ChatGPTAutomation.sendText) {
                return await window.ChatGPTAutomation.sendText(text);
              }
              // フォールバック：テキストエリアに直接入力
              const textarea = document.querySelector('textarea#prompt-textarea, textarea[data-id="root"]');
              if (textarea) {
                textarea.value = text;
                textarea.dispatchEvent(new Event('input', { bubbles: true }));
                const sendButton = document.querySelector('button[data-testid="send-button"], button[aria-label="Send"]');
                if (sendButton) sendButton.click();
              }
            },
            waitForResponse: async (timeout = 600000) => {
              // 応答が完了するまで待機
              const startTime = Date.now();
              while (Date.now() - startTime < timeout) {
                // 停止ボタンが消えたら応答完了
                const stopButton = document.querySelector('button[aria-label="Stop generating"]');
                if (!stopButton) {
                  await new Promise(resolve => setTimeout(resolve, 1000));
                  // 応答を取得
                  if (window.ChatGPTAutomation?.getResponse) {
                    return await window.ChatGPTAutomation.getResponse();
                  }
                }
                await new Promise(resolve => setTimeout(resolve, 500));
              }
              return null;
            }
          };
        }
        break;
        
      case 'claude':
        if (window.ClaudeAutomation) {
          return {
            sendText: async (text) => {
              // ClaudeAutomationのsendText関数を使用
              if (window.ClaudeAutomation.sendText) {
                return await window.ClaudeAutomation.sendText(text);
              }
              // フォールバック：テキストエリアに直接入力
              const textarea = document.querySelector('[contenteditable="true"][role="textbox"]');
              if (textarea) {
                textarea.innerText = text;
                textarea.dispatchEvent(new Event('input', { bubbles: true }));
                const sendButton = document.querySelector('button[aria-label="Send"]');
                if (sendButton) sendButton.click();
              }
            },
            waitForResponse: async (timeout = 600000) => {
              // 応答が完了するまで待機
              const startTime = Date.now();
              while (Date.now() - startTime < timeout) {
                // 停止ボタンが消えたら応答完了
                const stopButton = document.querySelector('button[aria-label="Stop"]');
                if (!stopButton) {
                  await new Promise(resolve => setTimeout(resolve, 1000));
                  // 応答を取得
                  if (window.ClaudeAutomation?.getResponse) {
                    return await window.ClaudeAutomation.getResponse();
                  }
                }
                await new Promise(resolve => setTimeout(resolve, 500));
              }
              return null;
            }
          };
        }
        break;
        
      case 'gemini':
        if (window.GeminiAutomation || window.Gemini) {
          return {
            sendText: async (text) => {
              // GeminiAutomationのsendText関数を使用
              const automation = window.GeminiAutomation || window.Gemini;
              if (automation.sendText) {
                return await automation.sendText(text);
              }
              // フォールバック：テキストエリアに直接入力
              const textarea = document.querySelector('[contenteditable="true"].ql-editor');
              if (textarea) {
                textarea.innerText = text;
                textarea.dispatchEvent(new Event('input', { bubbles: true }));
                const sendButton = document.querySelector('button[aria-label="Send"]');
                if (sendButton) sendButton.click();
              }
            },
            waitForResponse: async (timeout = 600000) => {
              // 応答が完了するまで待機
              const startTime = Date.now();
              while (Date.now() - startTime < timeout) {
                // 停止ボタンが消えたら応答完了
                const stopButton = document.querySelector('button[aria-label="Stop generating"]');
                if (!stopButton) {
                  await new Promise(resolve => setTimeout(resolve, 1000));
                  // 応答を取得
                  const automation = window.GeminiAutomation || window.Gemini;
                  if (automation?.getResponse) {
                    return await automation.getResponse();
                  }
                }
                await new Promise(resolve => setTimeout(resolve, 500));
              }
              return null;
            }
          };
        }
        break;
    }
    
    return null;
  }
  
  /**
   * 応答を結合
   * @param {string} original - 元の応答
   * @param {string} additional - 追加応答
   * @param {string} description - 追加質問の説明
   * @returns {string} 結合された応答
   */
  combineResponses(original, additional, description) {
    const separator = `\n\n---【追加説明: ${description}】---\n\n`;
    return original + separator + additional;
  }
  
  /**
   * パターンを追加
   * @param {Object} pattern - 追加するパターン
   */
  addPattern(pattern) {
    if (pattern && pattern.pattern && pattern.response) {
      this.followupPatterns.push({
        pattern: pattern.pattern,
        response: pattern.response,
        waitTime: pattern.waitTime || 2000,
        maxRetries: pattern.maxRetries || 1,
        description: pattern.description || "カスタムパターン"
      });
      
      this.log("パターン追加", pattern);
    }
  }
  
  /**
   * パターンをクリア
   */
  clearPatterns() {
    this.followupPatterns = [];
    this.log("全パターンをクリアしました");
  }
  
  /**
   * 機能の有効/無効を切り替え
   * @param {boolean} enabled - 有効化フラグ
   */
  setEnabled(enabled) {
    this.enabled = enabled;
    this.log(`自動追加質問機能: ${enabled ? '有効' : '無効'}`);
  }
  
  /**
   * 統計情報を取得
   * @returns {Object} 統計情報
   */
  getStatistics() {
    return {
      enabled: this.enabled,
      patternCount: this.followupPatterns.length,
      maxFollowups: this.maxFollowups,
      patterns: this.followupPatterns.map(p => ({
        pattern: p.pattern.toString(),
        description: p.description
      }))
    };
  }
}

// グローバルに公開
if (typeof window !== 'undefined') {
  window.AutoFollowupHandler = AutoFollowupHandler;
}

// モジュールエクスポート（ES6モジュール対応）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AutoFollowupHandler;
}