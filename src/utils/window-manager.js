/**
 * ウィンドウマネージャー
 * 4分割ウィンドウを管理するユーティリティ
 */

class WindowManager {
    constructor() {
        this.windows = {
            main: null,
            chatgpt: null,
            claude: null,
            gemini: null
        };
        
        // 画面サイズを取得
        this.screenWidth = screen.availWidth;
        this.screenHeight = screen.availHeight;
        
        // ウィンドウ配置設定（4分割）
        this.layouts = {
            main: {
                left: 0,
                top: 0,
                width: Math.floor(this.screenWidth / 2),
                height: Math.floor(this.screenHeight / 2)
            },
            chatgpt: {
                left: Math.floor(this.screenWidth / 2),
                top: 0,
                width: Math.floor(this.screenWidth / 2),
                height: Math.floor(this.screenHeight / 2)
            },
            claude: {
                left: 0,
                top: Math.floor(this.screenHeight / 2),
                width: Math.floor(this.screenWidth / 2),
                height: Math.floor(this.screenHeight / 2)
            },
            gemini: {
                left: Math.floor(this.screenWidth / 2),
                top: Math.floor(this.screenHeight / 2),
                width: Math.floor(this.screenWidth / 2),
                height: Math.floor(this.screenHeight / 2)
            }
        };
        
        // AI URLs
        this.urls = {
            chatgpt: 'https://chatgpt.com',
            claude: 'https://claude.ai',
            gemini: 'https://gemini.google.com'
        };
    }
    
    /**
     * 4分割ウィンドウを開く
     */
    async openQuadWindows() {
        console.log('🪟 4分割ウィンドウを開きます');
        
        // 既存のウィンドウを全て閉じる
        this.closeAllWindows();
        
        // メインウィンドウ（現在のウィンドウ）を左上に配置
        try {
            // Chrome拡張の場合、現在のウィンドウを移動・リサイズ
            if (chrome?.windows?.getCurrent) {
                chrome.windows.getCurrent((currentWindow) => {
                    chrome.windows.update(currentWindow.id, {
                        left: this.layouts.main.left,
                        top: this.layouts.main.top,
                        width: this.layouts.main.width,
                        height: this.layouts.main.height,
                        state: 'normal'
                    });
                });
            } else {
                // 通常のブラウザ環境
                window.moveTo(this.layouts.main.left, this.layouts.main.top);
                window.resizeTo(this.layouts.main.width, this.layouts.main.height);
            }
        } catch (e) {
            console.log('メインウィンドウの配置に失敗:', e);
        }
        
        // 各AIウィンドウを開く
        await this.openAIWindow('chatgpt');
        await this.openAIWindow('claude');
        await this.openAIWindow('gemini');
        
        console.log('✅ 4分割ウィンドウを開きました');
        
        // ウィンドウ情報を返す
        return {
            main: window,
            chatgpt: this.windows.chatgpt,
            claude: this.windows.claude,
            gemini: this.windows.gemini
        };
    }
    
    /**
     * 個別のAIウィンドウを開く
     */
    async openAIWindow(aiType) {
        const layout = this.layouts[aiType];
        const url = this.urls[aiType];
        
        if (!layout || !url) {
            console.error(`未知のAIタイプ: ${aiType}`);
            return null;
        }
        
        // ウィンドウオプション
        // location=no : URLバーを非表示
        // menubar=no : メニューバーを非表示
        // toolbar=no : ツールバーを非表示
        const features = [
            `left=${layout.left}`,
            `top=${layout.top}`,
            `width=${layout.width}`,
            `height=${layout.height}`,
            'location=no',
            'menubar=no',
            'toolbar=no',
            'scrollbars=yes',
            'resizable=yes',
            'status=no'
        ].join(',');
        
        try {
            // 新しいウィンドウを開く
            const newWindow = window.open(url, `${aiType}_window`, features);
            
            if (newWindow) {
                this.windows[aiType] = newWindow;
                console.log(`✅ ${aiType.toUpperCase()} ウィンドウを開きました`);
                
                // ウィンドウが閉じられた時の処理
                const checkInterval = setInterval(() => {
                    if (newWindow.closed) {
                        console.log(`${aiType.toUpperCase()} ウィンドウが閉じられました`);
                        this.windows[aiType] = null;
                        clearInterval(checkInterval);
                    }
                }, 1000);
                
                return newWindow;
            } else {
                console.error(`${aiType.toUpperCase()} ウィンドウを開けませんでした（ポップアップブロック？）`);
                return null;
            }
        } catch (error) {
            console.error(`${aiType.toUpperCase()} ウィンドウエラー:`, error);
            return null;
        }
    }
    
    /**
     * 特定のウィンドウを閉じる
     */
    closeWindow(aiType) {
        if (this.windows[aiType] && !this.windows[aiType].closed) {
            this.windows[aiType].close();
            this.windows[aiType] = null;
            console.log(`${aiType.toUpperCase()} ウィンドウを閉じました`);
        }
    }
    
    /**
     * 全てのウィンドウを閉じる
     */
    closeAllWindows() {
        Object.keys(this.windows).forEach(key => {
            if (key !== 'main') {  // メインウィンドウは閉じない
                this.closeWindow(key);
            }
        });
    }
    
    /**
     * ウィンドウにフォーカスを移す
     */
    focusWindow(aiType) {
        if (this.windows[aiType] && !this.windows[aiType].closed) {
            this.windows[aiType].focus();
        }
    }
    
    /**
     * ウィンドウのステータスを取得
     */
    getWindowStatus() {
        const status = {};
        Object.keys(this.windows).forEach(key => {
            if (key === 'main') {
                status[key] = true;  // メインウィンドウは常に開いている
            } else {
                status[key] = this.windows[key] && !this.windows[key].closed;
            }
        });
        return status;
    }
    
    /**
     * レイアウトをカスタマイズ
     */
    setCustomLayout(layouts) {
        Object.assign(this.layouts, layouts);
    }
}

// グローバルに公開
window.WindowManager = WindowManager;

// シングルトンインスタンス
window.windowManager = new WindowManager();

console.log('🪟 WindowManager が利用可能になりました');
console.log('使用方法: windowManager.openQuadWindows()');