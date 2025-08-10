/**
 * UIセレクタ定義ファイル
 * Gensparkのサイトの要素を見つけるためのセレクタを集中管理
 */

export const selectors = {
  textInput: [
    'textarea[name="query"]',
    '.search-input',
    '.j-search-input',
    'textarea.search-input.j-search-input',
    '.prompt-input-wrapper-upper textarea',
    '.textarea-wrapper textarea',
    'textarea[placeholder*="スライドのリクエスト"]'
  ],
  
  submitButton: [
    '.enter-icon.active',
    '.enter-icon-wrapper.active',
    '.enter-icon-wrapper[class*="bg-[#262626]"]',
    '.enter-icon.cursor-pointer.active',
    'div[class*="enter-icon"][class*="active"]',
    '.enter-icon-wrapper[class*="text-white"]',
    '.input-icon .enter-icon'
  ],
  
  stopButton: [
    '.stop-icon',
    '.enter-icon-wrapper[class*="bg-[#232425]"]',
    'svg.stop-icon',
    '.input-icon .enter-icon-wrapper[class*="bg-[#232425]"]',
    '.enter-icon-wrapper[class*="text-[#fff]"]',
    'div[class*="enter-icon-wrapper"][class*="bg-[#232425]"]'
  ],
  
  errorPage: 'https://docs.google.com/spreadsheets/d/1QfOFEUWtlR0wwaN5BRyVdenFPxCRJmsf4SPo87O_ZnY/edit?gid=2134602748#gid=2134602748'
};

/**
 * セレクタのバージョン管理
 * UIが変更された場合に古いセレクタとの互換性を保つ
 */
export const selectorVersions = {
  v1: selectors,
  current: 'v1'
};

/**
 * セレクタを更新（将来的にスプレッドシートから取得可能）
 */
export async function updateSelectors(newSelectors) {
  await chrome.storage.local.set({ customSelectors: newSelectors });
}

/**
 * カスタムセレクタまたはデフォルトセレクタを取得
 */
export async function getSelectors() {
  const storage = await chrome.storage.local.get(['customSelectors']);
  return storage.customSelectors || selectors;
}