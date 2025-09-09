/**
 * @fileoverview Wake Lock Manager グローバル初期化
 * 
 * このスクリプトはWebページが読み込まれた時にWake Lock Managerを
 * グローバルに利用可能にします。
 * 
 * 使用方法:
 * HTMLファイルの<head>セクションでこのスクリプトを読み込みます:
 * <script type="module" src="src/utils/wake-lock-init.js"></script>
 */

import { globalWakeLockManager } from './wake-lock-manager.js';

// グローバルスコープにWake Lock Managerを設定
if (typeof window !== 'undefined') {
  window.globalWakeLockManager = globalWakeLockManager;
  
  console.log('[WakeLockInit] グローバルWake Lock Manager初期化完了');
  
  // ページアンロード時の自動クリーンアップ
  window.addEventListener('beforeunload', () => {
    globalWakeLockManager.destroy();
  });
  
  // デバッグ用：グローバル関数を提供
  if (process?.env?.NODE_ENV === 'development') {
    window.debugWakeLock = () => {
      console.log('Wake Lock Status:', globalWakeLockManager.getStatus());
    };
  }
}