/**
 * WindowService Loader
 * CSP対応のためインラインスクリプトから外部化
 */

console.log('🔧 [ui-window-loader.js] WindowService読み込み開始...');

try {
  import('../services/window-service.js').then(module => {
    console.log('✅ [ui-window-loader.js] WindowServiceモジュール読み込み成功:', module);
    window.WindowService = module.default || module.WindowService;
    console.log('✅ [ui-window-loader.js] window.WindowService設定完了:', typeof window.WindowService);
    console.log('✅ [ui-window-loader.js] WindowServiceクラス確認:', window.WindowService?.name);
  }).catch(error => {
    console.error('❌ [ui-window-loader.js] WindowService読み込みエラー:', error);
  });
} catch (error) {
  console.error('❌ [ui-window-loader.js] WindowServiceインポート時エラー:', error);
}