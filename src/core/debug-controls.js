// debug-controls.js - デバッグコントロールUI
import logConfig from './log-config.js';

class DebugControls {
    constructor() {
        this.logConfig = logConfig;
        this.initialize();
    }

    initialize() {
        this.createUI();
        this.setupEventListeners();
    }

    createUI() {
        // デバッグコントロールのHTML要素を作成
        const controlsHTML = `
            <div id="debug-controls" style="
                position: fixed;
                top: 10px;
                right: 10px;
                background: rgba(0, 0, 0, 0.8);
                color: white;
                padding: 10px;
                border-radius: 5px;
                font-family: monospace;
                font-size: 12px;
                z-index: 10000;
                min-width: 200px;
                display: none;
            ">
                <h4 style="margin: 0 0 10px 0;">AutoAI Debug Controls</h4>
                <div style="margin-bottom: 10px;">
                    <label>Log Level:</label>
                    <select id="log-level-select" style="margin-left: 5px;">
                        <option value="error">ERROR</option>
                        <option value="warn">WARN</option>
                        <option value="info" selected>INFO</option>
                        <option value="debug">DEBUG</option>
                    </select>
                </div>
                <div style="margin-bottom: 10px;">
                    <button id="show-stats-btn" style="margin-right: 5px;">Show Stats</button>
                    <button id="clear-logs-btn">Clear Logs</button>
                </div>
                <div style="margin-bottom: 10px;">
                    <button id="toggle-debug-btn">Toggle Debug Mode</button>
                </div>
                <div id="debug-status" style="font-size: 11px; color: #ccc;">
                    Status: Ready
                </div>
            </div>
        `;

        // ページに追加
        const controlsElement = document.createElement('div');
        controlsElement.innerHTML = controlsHTML;
        document.body.appendChild(controlsElement);

        // ショートカットキー用のスタイルを追加
        const style = document.createElement('style');
        style.textContent = `
            .debug-control-toggle {
                position: fixed !important;
                top: 10px !important;
                right: 10px !important;
                background: rgba(0, 100, 200, 0.8) !important;
                color: white !important;
                border: none !important;
                padding: 5px 10px !important;
                border-radius: 3px !important;
                font-size: 12px !important;
                z-index: 10001 !important;
                cursor: pointer !important;
            }
        `;
        document.head.appendChild(style);

        // トグルボタンを作成
        const toggleBtn = document.createElement('button');
        toggleBtn.className = 'debug-control-toggle';
        toggleBtn.textContent = 'Debug';
        toggleBtn.onclick = () => this.toggleControls();
        document.body.appendChild(toggleBtn);
    }

    setupEventListeners() {
        // ログレベル変更
        const logLevelSelect = document.getElementById('log-level-select');
        if (logLevelSelect) {
            logLevelSelect.addEventListener('change', (e) => {
                this.logConfig.setLogLevel(e.target.value);
                this.updateStatus(`Log level changed to ${e.target.value.toUpperCase()}`);
            });

            // 現在のレベルを設定
            logLevelSelect.value = this.logConfig.getLogLevel();
        }

        // 統計表示
        const showStatsBtn = document.getElementById('show-stats-btn');
        if (showStatsBtn) {
            showStatsBtn.addEventListener('click', () => {
                this.logConfig.showStatistics();
                this.updateStatus('Statistics displayed in console');
            });
        }

        // ログクリア
        const clearLogsBtn = document.getElementById('clear-logs-btn');
        if (clearLogsBtn) {
            clearLogsBtn.addEventListener('click', () => {
                console.clear();
                this.updateStatus('Console cleared');
            });
        }

        // デバッグモード切り替え
        const toggleDebugBtn = document.getElementById('toggle-debug-btn');
        if (toggleDebugBtn) {
            toggleDebugBtn.addEventListener('click', () => {
                const isDebug = this.logConfig.isDebugMode();
                if (isDebug) {
                    this.logConfig.disableDebugMode();
                    this.updateStatus('Debug mode disabled');
                } else {
                    this.logConfig.enableDebugMode();
                    this.updateStatus('Debug mode enabled');
                }
                this.updateDebugButton();
            });
        }

        // キーボードショートカット
        document.addEventListener('keydown', (e) => {
            // Ctrl+Shift+D でデバッグコントロール表示/非表示
            if (e.ctrlKey && e.shiftKey && e.key === 'D') {
                e.preventDefault();
                this.toggleControls();
            }
        });
    }

    toggleControls() {
        const controls = document.getElementById('debug-controls');
        if (controls) {
            const isVisible = controls.style.display !== 'none';
            controls.style.display = isVisible ? 'none' : 'block';
        }
    }

    updateStatus(message) {
        const status = document.getElementById('debug-status');
        if (status) {
            status.textContent = `Status: ${message}`;
            // 3秒後に元に戻す
            setTimeout(() => {
                status.textContent = 'Status: Ready';
            }, 3000);
        }
    }

    updateDebugButton() {
        const btn = document.getElementById('toggle-debug-btn');
        if (btn) {
            const isDebug = this.logConfig.isDebugMode();
            btn.textContent = isDebug ? 'Disable Debug' : 'Enable Debug';
            btn.style.background = isDebug ? '#d32f2f' : '#1976d2';
        }
    }

    // 外部からのログレベル設定
    setLogLevel(level) {
        this.logConfig.setLogLevel(level);
        const select = document.getElementById('log-level-select');
        if (select) {
            select.value = level;
        }
    }

    // デバッグコントロールの表示/非表示状態を取得
    isVisible() {
        const controls = document.getElementById('debug-controls');
        return controls && controls.style.display !== 'none';
    }
}

// グローバルインスタンス（ページ読み込み時に自動初期化）
let debugControls = null;

// DOM読み込み完了後に初期化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        debugControls = new DebugControls();
    });
} else {
    debugControls = new DebugControls();
}

// グローバルアクセス用
window.AutoAIDebugControls = debugControls;

export default DebugControls;