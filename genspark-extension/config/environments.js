/**
 * 環境設定ファイル
 * テスト環境と本番環境の設定を管理
 */

export const environments = {
  test: {
    name: 'test',
    baseUrl: 'https://www.genspark.ai/agents?type=slides_agent',
    defaultPrompt: '桃太郎についてスライド4枚で解説して',
    waitTimes: {
      pageLoad: 5,
      afterInput: 5,
      afterSubmit: 5,
      checkInterval: 0.5,
      finalWait: 5
    },
    debugMode: true,
    logLevel: 'verbose'
  },
  
  production: {
    name: 'production',
    baseUrl: 'https://www.genspark.ai/agents?type=slides_agent',
    defaultPrompt: '',
    waitTimes: {
      pageLoad: 3,
      afterInput: 2,
      afterSubmit: 3,
      checkInterval: 0.5,
      finalWait: 3
    },
    debugMode: false,
    logLevel: 'error'
  }
};

/**
 * 現在の環境を取得
 * @returns {Promise<Object>} 環境設定オブジェクト
 */
export async function getCurrentEnvironment() {
  const storage = await chrome.storage.local.get(['environment']);
  const envName = storage.environment || 'test';
  return environments[envName];
}

/**
 * 環境を切り替え
 * @param {string} envName - 'test' または 'production'
 */
export async function setEnvironment(envName) {
  if (!environments[envName]) {
    throw new Error(`Unknown environment: ${envName}`);
  }
  await chrome.storage.local.set({ environment: envName });
  return environments[envName];
}