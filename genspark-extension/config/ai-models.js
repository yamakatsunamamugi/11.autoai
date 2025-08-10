/**
 * AIモデルと機能の設定
 * 各AIサービスのURL、機能、セレクタを管理
 */

export const aiModels = {
  genspark: {
    name: 'Genspark',
    baseUrl: 'https://www.genspark.ai',
    functions: {
      slides_agent: {
        name: 'スライド生成',
        url: 'https://www.genspark.ai/agents?type=slides_agent',
        selectors: {
          textInput: [
            'textarea[name="query"]',
            '.search-input',
            '.j-search-input',
            'textarea.search-input.j-search-input'
          ],
          submitButton: [
            '.enter-icon.active',
            '.enter-icon-wrapper.active'
          ],
          stopButton: [
            '.stop-icon',
            '.enter-icon-wrapper[class*="bg-[#232425]"]'
          ]
        }
      },
      summarize: {
        name: '要約',
        url: 'https://www.genspark.ai/agents?type=summarize',
        selectors: {
          textInput: ['textarea[name="query"]'],
          submitButton: ['.enter-icon.active']
        }
      },
      analyze: {
        name: '分析',
        url: 'https://www.genspark.ai/agents?type=analyze',
        selectors: {
          textInput: ['textarea[name="query"]'],
          submitButton: ['.enter-icon.active']
        }
      }
    }
  },
  
  chatgpt: {
    name: 'ChatGPT',
    baseUrl: 'https://chat.openai.com',
    functions: {
      chat: {
        name: 'チャット',
        url: 'https://chat.openai.com',
        selectors: {
          textInput: [
            'textarea[data-id="root"]',
            '#prompt-textarea',
            'textarea[placeholder*="Message"]'
          ],
          submitButton: [
            'button[data-testid="send-button"]',
            'button[aria-label="Send message"]'
          ],
          stopButton: [
            'button[aria-label="Stop generating"]'
          ]
        }
      }
    }
  },
  
  claude: {
    name: 'Claude',
    baseUrl: 'https://claude.ai',
    functions: {
      chat: {
        name: 'チャット',
        url: 'https://claude.ai/new',
        selectors: {
          textInput: [
            'div[contenteditable="true"]',
            'textarea[placeholder*="Ask Claude"]'
          ],
          submitButton: [
            'button[aria-label="Send Message"]',
            'button:has(svg[data-icon="send"])'
          ],
          stopButton: [
            'button[aria-label="Stop Response"]'
          ]
        }
      }
    }
  },
  
  gemini: {
    name: 'Gemini',
    baseUrl: 'https://gemini.google.com',
    functions: {
      chat: {
        name: 'チャット',
        url: 'https://gemini.google.com/app',
        selectors: {
          textInput: [
            'rich-textarea .ql-editor',
            'div[contenteditable="true"][role="textbox"]'
          ],
          submitButton: [
            'button[aria-label="Send message"]',
            'button[mattooltip="Send message"]'
          ],
          stopButton: [
            'button[aria-label="Stop generating"]'
          ]
        }
      }
    }
  },
  
  perplexity: {
    name: 'Perplexity',
    baseUrl: 'https://www.perplexity.ai',
    functions: {
      chat: {
        name: '検索型チャット',
        url: 'https://www.perplexity.ai',
        selectors: {
          textInput: [
            'textarea[placeholder*="Ask anything"]',
            'textarea.query-input'
          ],
          submitButton: [
            'button[aria-label="Submit"]',
            'button.submit-button'
          ],
          stopButton: [
            'button[aria-label="Stop"]'
          ]
        }
      }
    }
  }
};

/**
 * モデルと機能からURLとセレクタを取得
 */
export function getModelConfig(modelId, functionId) {
  const model = aiModels[modelId];
  if (!model) {
    throw new Error(`Unknown model: ${modelId}`);
  }
  
  const func = model.functions[functionId];
  if (!func) {
    // デフォルトでchat機能を使用
    const defaultFunc = model.functions.chat || Object.values(model.functions)[0];
    return {
      model: model.name,
      function: defaultFunc.name,
      url: defaultFunc.url,
      selectors: defaultFunc.selectors
    };
  }
  
  return {
    model: model.name,
    function: func.name,
    url: func.url,
    selectors: func.selectors
  };
}

/**
 * 利用可能な機能リストを取得
 */
export function getAvailableFunctions(modelId) {
  const model = aiModels[modelId];
  if (!model) return [];
  
  return Object.entries(model.functions).map(([id, func]) => ({
    id,
    name: func.name
  }));
}