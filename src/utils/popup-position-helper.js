/**
 * @fileoverview ポップアップ位置設定のヘルパー関数
 */

/**
 * ポップアップ位置設定を取得
 * @returns {Promise<string>} 'fullscreen' | 'quadLayout'
 */
export async function getPopupPosition() {
  try {
    const settings = await chrome.storage.local.get(['popupPosition']);
    return settings.popupPosition || 'fullscreen'; // デフォルトは全画面
  } catch (error) {
    console.error('[PopupPositionHelper] 設定取得エラー:', error);
    return 'fullscreen';
  }
}

/**
 * ポップアップ位置設定を保存
 * @param {string} position - 'fullscreen' | 'quadLayout'
 * @returns {Promise<boolean>} 成功/失敗
 */
export async function setPopupPosition(position) {
  try {
    if (!['fullscreen', 'quadLayout'].includes(position)) {
      throw new Error(`無効な位置設定: ${position}`);
    }

    await chrome.storage.local.set({ popupPosition: position });
    console.log(`[PopupPositionHelper] ポップアップ位置設定を変更: ${position}`);
    return true;
  } catch (error) {
    console.error('[PopupPositionHelper] 設定保存エラー:', error);
    return false;
  }
}

/**
 * 4分割レイアウトに切り替え
 * @returns {Promise<boolean>} 成功/失敗
 */
export async function enableQuadLayout() {
  return await setPopupPosition('quadLayout');
}

/**
 * 全画面レイアウトに切り替え
 * @returns {Promise<boolean>} 成功/失敗
 */
export async function enableFullscreen() {
  return await setPopupPosition('fullscreen');
}

/**
 * 現在の設定が4分割レイアウトかチェック
 * @returns {Promise<boolean>} 4分割レイアウトならtrue
 */
export async function isQuadLayout() {
  const position = await getPopupPosition();
  return position === 'quadLayout';
}

/**
 * 設定状態を出力（デバッグ用）
 * @returns {Promise<Object>} 設定詳細
 */
export async function debugSettings() {
  const position = await getPopupPosition();
  const isQuad = await isQuadLayout();

  const info = {
    currentPosition: position,
    isQuadLayout: isQuad,
    isFullscreen: position === 'fullscreen',
    description: position === 'quadLayout'
      ? 'ポップアップは右下（位置3）に配置されます'
      : 'ポップアップは全画面で表示されます'
  };

  console.log('[PopupPositionHelper] 現在の設定:', info);
  return info;
}