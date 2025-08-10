// content-base.js - 基盤部分（パート1を拡張機能対応に修正）
(function() {
    'use strict';
    
    // 拡張機能かコンソールかを判定
    const isExtension = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id;
    
    // グローバル設定
    window.CLAUDE_CONFIG = {
        DELAYS: {
            click: 50,
            menuOpen: 1500,
            menuClose: 1000,
            modelSwitch: 2000,
            submit: 5000,
            responseCheck: 5000,
            elementSearch: 500
        },
        globalState: {
            modelCache: null,
            modelCacheTime: null,
            functionCache: null,
            functionCacheTime: null,
            CACHE_DURATION: 5 * 60 * 1000,
            currentModel: null,
            activeFunctions: new Set(),
            deepResearchMode: false,
            hasAutoReplied: false,
            debugMode: false,
            deepResearch: {
                maxWaitMinutes: 40,
                gracePeriodMinutes: 5,
                autoReplyKeyword: '調査して'
            }
        },
        MODEL_ALIASES: {
            'opus 4.1': 'Opus 4.1',
            'opus4.1': 'Opus 4.1',
            'opus41': 'Opus 4.1',
            'opus 41': 'Opus 4.1',
            'opas 4.1': 'Opus 4.1',
            'opas4.1': 'Opus 4.1',
            'opus 4,1': 'Opus 4.1',
            'opus4,1': 'Opus 4.1',
            '4.1': 'Opus 4.1',
            '41': 'Opus 4.1',
            '4,1': 'Opus 4.1',
            'opus': 'Opus 4.1',
            'opas': 'Opus 4.1',
            'sonnet 4': 'Sonnet 4',
            'sonnet4': 'Sonnet 4',
            'sonet 4': 'Sonnet 4',
            'sonet4': 'Sonnet 4',
            'sonnett 4': 'Sonnet 4',
            'sonnett4': 'Sonnet 4',
            'sonett 4': 'Sonnet 4',
            'sonnet': 'Sonnet 4',
            'sonet': 'Sonnet 4',
            '4': 'Sonnet 4',
            'opus 4': 'Opus 4',
            'opus4': 'Opus 4',
            'opas 4': 'Opus 4',
            'opas4': 'Opus 4',
            'sonnet 3.7': 'Sonnet 3.7',
            'sonnet3.7': 'Sonnet 3.7',
            'sonnet37': 'Sonnet 3.7',
            'sonnet 37': 'Sonnet 3.7',
            'sonet 3.7': 'Sonnet 3.7',
            'sonet3.7': 'Sonnet 3.7',
            'sonnet 3,7': 'Sonnet 3.7',
            'sonnet3,7': 'Sonnet 3.7',
            '3.7': 'Sonnet 3.7',
            '37': 'Sonnet 3.7',
            '3,7': 'Sonnet 3.7',
            'haiku 3.5': 'Haiku 3.5',
            'haiku3.5': 'Haiku 3.5',
            'haiku35': 'Haiku 3.5',
            'haiku 35': 'Haiku 3.5',
            'haiku 3,5': 'Haiku 3.5',
            'haiku3,5': 'Haiku 3.5',
            'haiku': 'Haiku 3.5',
            'haikuu': 'Haiku 3.5',
            '3.5': 'Haiku 3.5',
            '35': 'Haiku 3.5',
            '3,5': 'Haiku 3.5'
        },
        FUNCTION_ALIASES: {
            'じっくり考える': 'じっくり考える',
            'じっくり': 'じっくり考える',
            '思考': 'じっくり考える',
            '思考モード': 'じっくり考える',
            'thinking': 'じっくり考える',
            'think': 'じっくり考える',
            'ウェブ検索': 'ウェブ検索',
            'web検索': 'ウェブ検索',
            '検索': 'ウェブ検索',
            '検索モード': 'ウェブ検索',
            'search': 'ウェブ検索',
            'web': 'ウェブ検索',
            'drive検索': 'Drive検索',
            'drive': 'Drive検索',
            'ドライブ': 'Drive検索',
            'googledrive': 'Drive検索',
            'gmail検索': 'Gmail検索',
            'gmail': 'Gmail検索',
            'メール': 'Gmail検索',
            'mail': 'Gmail検索',
            'カレンダー検索': 'カレンダー検索',
            'カレンダー': 'カレンダー検索',
            'calendar': 'カレンダー検索',
            'cal': 'カレンダー検索',
            'リサーチ': 'リサーチ',
            'research': 'リサーチ',
            'deep': 'リサーチ',
            'deepresearch': 'リサーチ',
            'deepreserch': 'リサーチ',
            'ディープ': 'リサーチ',
            'ディープリサーチ': 'リサーチ',
            'でぃーぷ': 'リサーチ',
            'deepresarch': 'リサーチ',
            'deepserch': 'リサーチ',
            'deepsearch': 'リサーチ',
            '調査': 'リサーチ',
            '詳細調査': 'リサーチ',
            '詳しく調査': 'リサーチ'
        },
        TOGGLE_FUNCTIONS: ['じっくり考える', 'ウェブ検索', 'Drive検索', 'Gmail検索', 'カレンダー検索'],
        MAIN_MENU_MODELS: ['Opus 4.1', 'Sonnet 4']
    };
    
    // ユーティリティ関数
    window.CLAUDE_UTILS = {
        log: function(message, type = 'INFO') {
            const prefix = {
                'INFO': '📝',
                'SUCCESS': '✅',
                'ERROR': '❌',
                'WARNING': '⚠️',
                'DEBUG': '🔍',
                'SEARCH': '🔎'
            }[type] || '📝';
            const logMessage = prefix + ' [' + new Date().toLocaleTimeString() + '] ' + message;
            
            console.log(logMessage);
            
            // 拡張機能の場合はバックグラウンドにもログを送信
            if (isExtension) {
                chrome.runtime.sendMessage({
                    type: 'LOG',
                    message: logMessage,
                    level: type
                }).catch(() => {});
            }
        },
        
        debugLog: function(message) {
            if (CLAUDE_CONFIG.globalState.debugMode) {
                CLAUDE_UTILS.log(message, 'DEBUG');
            }
        },
        
        wait: async function(ms) {
            await new Promise(resolve => setTimeout(resolve, ms));
        },
        
        findElement: async function(selectors, condition = null, maxWait = 3000) {
            const startTime = Date.now();
            while (Date.now() - startTime < maxWait) {
                for (const selector of selectors) {
                    try {
                        const elements = document.querySelectorAll(selector);
                        for (const element of elements) {
                            if (!condition || condition(element)) {
                                CLAUDE_UTILS.debugLog('要素を発見: ' + selector);
                                return element;
                            }
                        }
                    } catch (e) {}
                }
                await CLAUDE_UTILS.wait(CLAUDE_CONFIG.DELAYS.elementSearch);
            }
            CLAUDE_UTILS.debugLog('要素が見つかりませんでした');
            return null;
        },
        
        performClick: async function(element) {
            if (!element) return false;
            try {
                const rect = element.getBoundingClientRect();
                const x = rect.left + rect.width / 2;
                const y = rect.top + rect.height / 2;
                
                element.dispatchEvent(new PointerEvent('pointerdown', {
                    bubbles: true,
                    cancelable: true,
                    view: window,
                    clientX: x,
                    clientY: y,
                    pointerId: 1
                }));
                
                await CLAUDE_UTILS.wait(CLAUDE_CONFIG.DELAYS.click);
                
                element.dispatchEvent(new PointerEvent('pointerup', {
                    bubbles: true,
                    cancelable: true,
                    view: window,
                    clientX: x,
                    clientY: y,
                    pointerId: 1
                }));
                
                element.click();
                return true;
            } catch (e) {
                CLAUDE_UTILS.debugLog('クリックエラー: ' + e.message);
                return false;
            }
        },
        
        waitForMenu: async function(maxWait = 3000) {
            const menuSelectors = [
                '[role="menu"][data-state="open"]',
                '[role="menu"]',
                '.relative.w-full.will-change-transform',
                '[class*="will-change-transform"]',
                '.flex.flex-col.min-h-0.w-full',
                '.p-1\\.5.flex.flex-col',
                'div[style*="max-height"]'
            ];
            return await CLAUDE_UTILS.findElement(menuSelectors, null, maxWait);
        }
    };
    
    // 拡張機能のメッセージリスナー
    if (isExtension) {
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            if (request.type === 'PING') {
                sendResponse({ status: 'ready' });
            }
        });
    }
    
    console.log('✅ Claude基盤部分（拡張機能対応版）が読み込まれました');
})();