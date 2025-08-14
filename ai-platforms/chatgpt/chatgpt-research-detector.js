/**
 * モデル・機能リサーチコード ChatGPT
 * 作成日: 2025年8月14日
 * 
 * このコードは、ChatGPTインターフェースで利用可能なモデルと機能を
 * 自動的にリサーチし、変更を検出するためのコンソールスクリプトです。
 */

(function() {
    'use strict';
    
    console.log('='.repeat(80));
    console.log('モデル・機能リサーチコード ChatGPT');
    console.log(`作成日: ${new Date().toLocaleDateString('ja-JP')} ${new Date().toLocaleTimeString('ja-JP')}`);
    console.log('='.repeat(80));
    
    // ===== 設定と保存データ =====
    const STORAGE_KEY = 'chatgpt_research_data';
    const SPREADSHEET_URL = 'https://docs.google.com/spreadsheets/d/1QfOFEUWtlR0wwaN5BRyVdenFPxCRJmsf4SPo87O_ZnY/edit?gid=915128086#gid=915128086';
    
    // 現在のデータ構造
    const currentData = {
        timestamp: new Date().toISOString(),
        models: [],
        features: {
            main: [],
            additional: []
        },
        deepResearch: {
            available: false,
            activated: false
        },
        agentMode: {
            available: false,
            activated: false
        }
    };
    
    // ===== ユーティリティ関数 =====
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    
    const log = (message, type = 'INFO') => {
        const prefix = {
            'INFO': '📝',
            'SUCCESS': '✅',
            'WARNING': '⚠️',
            'ERROR': '❌',
            'CHANGE': '🔄',
            'RESEARCH': '🔬'
        }[type] || '📝';
        console.log(`${prefix} ${message}`);
    };
    
    // 要素をクリック
    const clickElement = async (element) => {
        if (!element) return false;
        
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await wait(100);
        
        const rect = element.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;
        
        element.dispatchEvent(new PointerEvent('pointerdown', {
            bubbles: true,
            cancelable: true,
            clientX: x,
            clientY: y
        }));
        
        await wait(50);
        
        element.dispatchEvent(new PointerEvent('pointerup', {
            bubbles: true,
            cancelable: true,
            clientX: x,
            clientY: y
        }));
        
        element.click();
        await wait(500);
        
        return true;
    };
    
    // メニューを閉じる
    const closeMenu = async () => {
        const event = new KeyboardEvent('keydown', { 
            key: 'Escape', 
            code: 'Escape', 
            keyCode: 27,
            bubbles: true 
        });
        document.dispatchEvent(event);
        await wait(300);
    };
    
    // ===== リサーチ機能 =====
    
    // 1. モデルのリサーチ
    const researchModels = async () => {
        log('モデルメニューをリサーチ中...', 'RESEARCH');
        
        // まず既存のメニューを閉じる
        await closeMenu();
        
        // モデル選択ボタンを複数のセレクタで探す
        const modelButtonSelectors = [
            '[data-testid="model-switcher-dropdown-button"]',
            'button[aria-label*="モデル セレクター"]',
            'button[aria-label*="モデル"]',
            'button[aria-label*="Model"]',
            'button[id^="radix-"][aria-haspopup="menu"]',
            'button[aria-haspopup="menu"][aria-expanded]',
            'button[aria-haspopup="menu"]'
        ];
        
        let modelButton = null;
        for (const selector of modelButtonSelectors) {
            try {
                modelButton = document.querySelector(selector);
                if (modelButton) {
                    log(`モデルボタンを発見: ${selector}`, 'SUCCESS');
                    break;
                }
            } catch (e) {
                // セレクタエラーを無視
            }
        }
        
        if (!modelButton) {
            log('モデル選択ボタンが見つかりません', 'ERROR');
            return;
        }
        
        // メニューを開く
        await clickElement(modelButton);
        await wait(1000);
        
        // モデル項目を取得
        const modelItemSelectors = [
            '[role="menuitem"]',
            '[role="menuitemradio"]',
            'div[data-testid^="model-switcher"]'
        ];
        
        let modelItems = [];
        for (const selector of modelItemSelectors) {
            modelItems = document.querySelectorAll(selector);
            if (modelItems.length > 0) {
                log(`モデルアイテムを発見: ${selector} (${modelItems.length}個)`, 'SUCCESS');
                break;
            }
        }
        
        modelItems.forEach(item => {
            const text = item.textContent?.trim();
            if (text && !text.includes('その他のモデル')) {
                // GPT-4, GPT-5, o1 など
                const modelData = {
                    name: text,
                    selected: item.getAttribute('aria-checked') === 'true' || item.classList.contains('selected')
                };
                
                // 重複チェック
                if (!currentData.models.some(m => m.name === modelData.name)) {
                    currentData.models.push(modelData);
                    log(`モデル検出: ${modelData.name}${modelData.selected ? ' (選択中)' : ''}`, 'SUCCESS');
                }
            }
        });
        
        // 「その他のモデル」をチェック
        const moreModelsItem = Array.from(modelItems).find(item => 
            item.textContent?.includes('その他のモデル') || 
            item.textContent?.includes('さらに表示')
        );
        
        if (moreModelsItem) {
            log('「その他のモデル」メニューを検出', 'INFO');
            await clickElement(moreModelsItem);
            await wait(1000);
            
            // サブメニューのモデルを取得
            const subMenuItems = document.querySelectorAll('[role="menuitem"]');
            subMenuItems.forEach(item => {
                const text = item.textContent?.trim();
                if (text && text.includes('GPT') || text.includes('o1')) {
                    const modelData = {
                        name: text,
                        selected: false,
                        additional: true
                    };
                    
                    if (!currentData.models.some(m => m.name === modelData.name)) {
                        currentData.models.push(modelData);
                        log(`追加モデル検出: ${modelData.name}`, 'SUCCESS');
                    }
                }
            });
        }
        
        await closeMenu();
    };
    
    // 2. 機能のリサーチ
    const researchFeatures = async () => {
        log('機能をリサーチ中...', 'RESEARCH');
        
        // メイン機能ボタンを検出
        const mainFeatureSelectors = [
            'button[data-testid*="composer-"]',
            'button[aria-label*="機能"]',
            '[role="button"]:has(svg)'
        ];
        
        // 機能名のキーワード
        const featureKeywords = [
            '写真とファイルを追加',
            'エージェントモード', 
            'Deep Research',
            '画像を作成する',
            'より長く思考する',
            'canvas',
            'ウェブ検索',
            'コネクターを使用する'
        ];
        
        // ページ内のボタンを全スキャン
        const allButtons = document.querySelectorAll('button');
        allButtons.forEach(button => {
            const text = button.textContent?.trim();
            const ariaLabel = button.getAttribute('aria-label');
            const dataTestId = button.getAttribute('data-testid');
            
            // 機能名マッチング
            featureKeywords.forEach(keyword => {
                if ((text && text.includes(keyword)) || 
                    (ariaLabel && ariaLabel.includes(keyword)) ||
                    (dataTestId && dataTestId.includes(keyword.toLowerCase().replace(/\s+/g, '-')))) {
                    
                    const featureData = {
                        name: keyword,
                        type: 'main',
                        enabled: button.getAttribute('aria-checked') === 'true' || button.classList.contains('active'),
                        element: dataTestId || 'unknown'
                    };
                    
                    // Deep Research と エージェントモードの特別な判定
                    if (keyword === 'Deep Research') {
                        currentData.deepResearch.available = true;
                        currentData.deepResearch.activated = featureData.enabled;
                    } else if (keyword === 'エージェントモード') {
                        currentData.agentMode.available = true;
                        currentData.agentMode.activated = featureData.enabled;
                    }
                    
                    // 重複チェック
                    if (!currentData.features.main.some(f => f.name === keyword)) {
                        currentData.features.main.push(featureData);
                        log(`メイン機能検出: ${keyword}${featureData.enabled ? ' (有効)' : ''}`, 'SUCCESS');
                    }
                }
            });
        });
        
        // 「さらに表示」メニューをチェック
        const moreButton = Array.from(allButtons).find(btn => 
            btn.textContent?.includes('さらに表示') ||
            btn.textContent?.includes('more') ||
            btn.getAttribute('aria-label')?.includes('さらに')
        );
        
        if (moreButton) {
            log('「さらに表示」メニューを検出', 'INFO');
            await clickElement(moreButton);
            await wait(1000);
            
            // 追加機能を探す
            const additionalFeatureKeywords = [
                'あらゆる学びをサポート',
                'OneDrive を接続する',
                'Sharepoint を接続する'
            ];
            
            const menuButtons = document.querySelectorAll('button, [role="menuitem"]');
            menuButtons.forEach(button => {
                const text = button.textContent?.trim();
                
                additionalFeatureKeywords.forEach(keyword => {
                    if (text && text.includes(keyword)) {
                        const featureData = {
                            name: keyword,
                            type: 'additional',
                            enabled: false
                        };
                        
                        if (!currentData.features.additional.some(f => f.name === keyword)) {
                            currentData.features.additional.push(featureData);
                            log(`追加機能検出: ${keyword}`, 'SUCCESS');
                        }
                    }
                });
            });
            
            await closeMenu();
        }
    };
    
    // 3. 前回データとの比較
    const compareWithPrevious = () => {
        log('\\n前回データとの比較...', 'INFO');
        
        // LocalStorageから前回データを取得
        let previousData = null;
        let isFirstRun = false;
        
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                previousData = JSON.parse(stored);
            } else {
                isFirstRun = true;
            }
        } catch (e) {
            log('前回データの読み込みエラー', 'WARNING');
            isFirstRun = true;
        }
        
        if (!previousData) {
            log('前回データなし（初回実行）', 'INFO');
            return { hasChanges: false, changes: [], isFirstRun: true };
        }
        
        const changes = [];
        
        // モデルの比較
        const prevModels = previousData.models || [];
        const currModels = currentData.models;
        
        // 新しく追加されたモデル
        currModels.forEach(curr => {
            const prev = prevModels.find(p => p.name === curr.name);
            if (!prev) {
                changes.push(`新規モデル追加: ${curr.name}`);
            } else if (prev.selected !== curr.selected) {
                changes.push(`モデル選択状態変更: ${curr.name} (${prev.selected ? '選択' : '非選択'} → ${curr.selected ? '選択' : '非選択'})`);
            }
        });
        
        // 削除されたモデル
        prevModels.forEach(prev => {
            if (!currModels.find(c => c.name === prev.name)) {
                changes.push(`モデル削除: ${prev.name}`);
            }
        });
        
        // メイン機能の比較
        const prevMainFeatures = previousData.features?.main || [];
        const currMainFeatures = currentData.features.main;
        
        currMainFeatures.forEach(curr => {
            const prev = prevMainFeatures.find(p => p.name === curr.name);
            if (!prev) {
                changes.push(`新規メイン機能追加: ${curr.name}`);
            } else if (prev.enabled !== curr.enabled) {
                changes.push(`機能状態変更: ${curr.name} (${prev.enabled ? '有効' : '無効'} → ${curr.enabled ? '有効' : '無効'})`);
            }
        });
        
        prevMainFeatures.forEach(prev => {
            if (!currMainFeatures.find(c => c.name === prev.name)) {
                changes.push(`メイン機能削除: ${prev.name}`);
            }
        });
        
        // 追加機能の比較
        const prevAdditionalFeatures = previousData.features?.additional || [];
        const currAdditionalFeatures = currentData.features.additional;
        
        currAdditionalFeatures.forEach(curr => {
            const prev = prevAdditionalFeatures.find(p => p.name === curr.name);
            if (!prev) {
                changes.push(`新規追加機能: ${curr.name}`);
            }
        });
        
        prevAdditionalFeatures.forEach(prev => {
            if (!currAdditionalFeatures.find(c => c.name === prev.name)) {
                changes.push(`追加機能削除: ${prev.name}`);
            }
        });
        
        // Deep Researchの比較
        const prevDeepResearch = previousData.deepResearch;
        const currDeepResearch = currentData.deepResearch;
        
        if (prevDeepResearch) {
            if (prevDeepResearch.available !== currDeepResearch.available) {
                changes.push(`Deep Research: ${currDeepResearch.available ? '利用可能になりました' : '利用不可になりました'}`);
            }
        } else if (currDeepResearch.available) {
            changes.push('Deep Research: 新規検出');
        }
        
        // エージェントモードの比較
        const prevAgentMode = previousData.agentMode;
        const currAgentMode = currentData.agentMode;
        
        if (prevAgentMode) {
            if (prevAgentMode.available !== currAgentMode.available) {
                changes.push(`エージェントモード: ${currAgentMode.available ? '利用可能になりました' : '利用不可になりました'}`);
            }
        } else if (currAgentMode.available) {
            changes.push('エージェントモード: 新規検出');
        }
        
        return {
            hasChanges: changes.length > 0,
            changes: changes,
            isFirstRun: false
        };
    };
    
    // ===== メイン実行関数 =====
    async function executeResearch() {
        try {
            // モデルのリサーチ
            await researchModels();
            await wait(1000);
            
            // 機能のリサーチ
            await researchFeatures();
            await wait(1000);
            
            // 前回データとの比較
            const comparison = compareWithPrevious();
            
            // 結果の表示
            console.log('\\n' + '='.repeat(80));
            console.log('リサーチ結果サマリー');
            console.log('='.repeat(80));
            
            console.log('\\n📊 検出されたモデル:');
            if (currentData.models.length === 0) {
                console.log('  ⚠️ モデルが検出されませんでした');
            } else {
                currentData.models.forEach(m => {
                    const selectedMark = m.selected ? ' ✅ (選択中)' : '';
                    const additionalMark = m.additional ? ' (追加モデル)' : '';
                    console.log(`  • ${m.name}${selectedMark}${additionalMark}`);
                });
            }
            
            console.log('\\n📊 検出された機能:');
            if (currentData.features.main.length > 0) {
                console.log('  メイン機能:');
                currentData.features.main.forEach(f => {
                    const enabledMark = f.enabled ? ' ✅' : ' ⬜';
                    console.log(`    • ${f.name}${enabledMark}`);
                });
            }
            
            if (currentData.features.additional.length > 0) {
                console.log('  追加機能:');
                currentData.features.additional.forEach(f => {
                    console.log(`    • ${f.name}`);
                });
            }
            
            console.log('\\n🔬 特殊モード:');
            console.log(`  • Deep Research: ${currentData.deepResearch.available ? '✅ 利用可能' : '❌ 利用不可'}`);
            console.log(`  • エージェントモード: ${currentData.agentMode.available ? '✅ 利用可能' : '❌ 利用不可'}`);
            
            // 変更がある場合の処理
            if (comparison.hasChanges && !comparison.isFirstRun) {
                console.log('\\n' + '='.repeat(80));
                console.log('🔄 変更検出！');
                console.log('='.repeat(80));
                
                comparison.changes.forEach(change => {
                    log(change, 'CHANGE');
                });
                
                console.log('\\nℹ️ スプレッドシートURL:');
                console.log(`📝 ${SPREADSHEET_URL}`);
            } else if (comparison.isFirstRun) {
                console.log('\\n✅ 初回実行完了 - データを保存しました');
                console.log('📝 今後、変更が検出された場合にスプレッドシートへの登録を促します');
            } else if (!comparison.hasChanges) {
                console.log('\\n✅ 前回から変更はありません');
            }
            
            // データを保存
            localStorage.setItem(STORAGE_KEY, JSON.stringify(currentData));
            log('\\nデータを保存しました', 'SUCCESS');
            
            // 詳細データのエクスポート（デバッグ用）
            console.log('\\n📁 詳細データ（JSON形式）:');
            console.log(JSON.stringify(currentData, null, 2));
            
            // 結果を返す
            return {
                success: true,
                data: currentData,
                comparison: comparison
            };
            
        } catch (error) {
            log(`エラーが発生しました: ${error.message}`, 'ERROR');
            console.error(error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    // ===== エクスポート =====
    window.ChatGPTResearchDetector = {
        executeResearch: executeResearch,
        getCurrentData: () => currentData,
        getStoredData: () => {
            try {
                const stored = localStorage.getItem(STORAGE_KEY);
                return stored ? JSON.parse(stored) : null;
            } catch (e) {
                return null;
            }
        },
        clearStoredData: () => {
            localStorage.removeItem(STORAGE_KEY);
            log('保存データをクリアしました', 'SUCCESS');
        }
    };
    
    // 自動実行（AI変更検出システムから呼ばれた場合）
    if (window.AIChangeDetector && window.AIChangeDetector.autoRun) {
        console.log('\\n🤖 AI変更検出システムから実行されました');
        executeResearch().then(result => {
            if (window.AIChangeDetector.callback) {
                window.AIChangeDetector.callback('chatgpt', result);
            }
        });
    } else {
        console.log('\\n' + '='.repeat(80));
        console.log('ChatGPT リサーチ検出器が初期化されました');
        console.log('実行方法: ChatGPTResearchDetector.executeResearch()');
        console.log('='.repeat(80));
    }
    
})();