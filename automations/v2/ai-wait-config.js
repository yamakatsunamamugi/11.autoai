/**
 * AI自動化の待機時間設定を統一管理するモジュール
 * 全AI（Claude, ChatGPT, Gemini）で共通の待機時間を使用
 */

const AI_WAIT_CONFIG = {
    // 基本待機時間
    INITIAL_WAIT: 30000,        // 初期待機: 30秒（送信後の初期待機）
    MAX_WAIT: 300000,           // 最大待機: 5分（通常応答の最大待機時間）
    CHECK_INTERVAL: 2000,       // チェック間隔: 2秒（状態確認の間隔）
    
    // 特殊モード用の待機時間
    DEEP_RESEARCH_WAIT: 2400000,    // Deep Research: 40分
    CANVAS_MAX_WAIT: 300000,        // Canvas: 5分（Gemini/ChatGPT）
    
    // 安定性チェック用
    STABILITY_DURATION: 10000,      // 安定判定: 10秒（テキストが変化しない時間）
    CANVAS_NOT_FOUND_MAX: 5,        // Canvas要素が見つからない最大回数
    
    // UI操作用の短い待機時間
    MICRO_WAIT: 100,            // 極小待機: 100ms（イベント間の最小待機）
    TINY_WAIT: 500,             // 微小待機: 500ms（クリック後など）
    SHORT_WAIT: 1000,           // 短待機: 1秒（UI更新待ち）
    MEDIUM_WAIT: 2000,          // 中待機: 2秒（メニュー表示など）
    LONG_WAIT: 3000,            // 長待機: 3秒（ページ遷移など）
    
    // 要素検索・メニュー待機
    ELEMENT_SEARCH_WAIT: 5000,  // 要素検索: 5秒
    MENU_WAIT: 8000,            // メニュー待機: 8秒
    
    // 停止ボタン関連
    STOP_BUTTON_INITIAL_WAIT: 30000,     // 停止ボタン出現待機: 30秒
    STOP_BUTTON_DISAPPEAR_WAIT: 300000,  // 停止ボタン消滅待機: 5分
    STOP_BUTTON_CONSECUTIVE_CHECK: 10000, // 停止ボタン連続消滅確認: 10秒
    
    // デバッグ用
    LOG_INTERVAL: 10000,            // ログ出力間隔: 10秒
};

/**
 * 待機時間の設定を取得
 * @param {string} mode - 'normal', 'canvas', 'deep-research'
 * @returns {Object} 待機時間設定
 */
function getWaitConfig(mode = 'normal') {
    switch (mode) {
        case 'deep-research':
            return {
                initialWait: AI_WAIT_CONFIG.INITIAL_WAIT,
                maxWait: AI_WAIT_CONFIG.DEEP_RESEARCH_WAIT,
                checkInterval: AI_WAIT_CONFIG.CHECK_INTERVAL,
                logInterval: AI_WAIT_CONFIG.LOG_INTERVAL
            };
        case 'canvas':
            return {
                initialWait: AI_WAIT_CONFIG.INITIAL_WAIT,
                maxWait: AI_WAIT_CONFIG.CANVAS_MAX_WAIT,
                checkInterval: AI_WAIT_CONFIG.CHECK_INTERVAL,
                stabilityDuration: AI_WAIT_CONFIG.STABILITY_DURATION,
                canvasNotFoundMax: AI_WAIT_CONFIG.CANVAS_NOT_FOUND_MAX,
                logInterval: AI_WAIT_CONFIG.LOG_INTERVAL
            };
        case 'normal':
        default:
            return {
                initialWait: AI_WAIT_CONFIG.INITIAL_WAIT,
                maxWait: AI_WAIT_CONFIG.MAX_WAIT,
                checkInterval: AI_WAIT_CONFIG.CHECK_INTERVAL,
                logInterval: AI_WAIT_CONFIG.LOG_INTERVAL
            };
    }
}

/**
 * 共通の応答待機関数
 * @param {Function} findElement - DOM要素を検索する関数
 * @param {Array} stopButtonSelectors - 停止ボタンのセレクタ配列
 * @param {Function} log - ログ出力関数
 * @param {string} mode - 待機モード
 * @returns {Promise<string>} 完了メッセージ
 */
async function waitForResponse(findElement, stopButtonSelectors, log, mode = 'normal') {
    const config = getWaitConfig(mode);
    const startTime = Date.now();
    
    // 初期待機
    log(`初期待機: ${config.initialWait / 1000}秒`, 'info');
    await new Promise(resolve => setTimeout(resolve, config.initialWait));
    
    return new Promise((resolve, reject) => {
        let waitTime = 0;
        let lastLogTime = Date.now();
        
        const checker = setInterval(() => {
            const currentTime = Date.now();
            const elapsedTime = currentTime - startTime;
            
            // 停止ボタンの存在確認
            const stopButton = findElement(stopButtonSelectors);
            
            if (!stopButton) {
                clearInterval(checker);
                log(`応答が完了しました（停止ボタンが消えました）- ${Math.round(elapsedTime / 1000)}秒`, 'success');
                resolve(`応答完了（${Math.round(elapsedTime / 1000)}秒）`);
                return;
            }
            
            // 最大待機時間チェック
            if (waitTime >= config.maxWait) {
                clearInterval(checker);
                log(`最大待機時間（${config.maxWait / 1000}秒）に達しました。処理を続行します。`, 'warn');
                resolve(`タイムアウト（${config.maxWait / 1000}秒）- 処理続行`);
                return;
            }
            
            // 定期的なログ出力
            if (currentTime - lastLogTime >= config.logInterval) {
                log(`[待機中] 応答生成を待っています... (${Math.round(waitTime / 1000)}秒 / 最大${config.maxWait / 1000}秒)`, 'info');
                lastLogTime = currentTime;
            }
            
            waitTime += config.checkInterval;
        }, config.checkInterval);
    });
}

// グローバルに公開（Chrome拡張機能のcontent script用）
if (typeof window !== 'undefined') {
    window.AI_WAIT_CONFIG = AI_WAIT_CONFIG;
    window.getWaitConfig = getWaitConfig;
    window.waitForResponse = waitForResponse;
}

// Node.js/モジュール環境用のエクスポート
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        AI_WAIT_CONFIG,
        getWaitConfig,
        waitForResponse
    };
}