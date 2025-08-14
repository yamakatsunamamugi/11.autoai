/**
 * モデル・機能リサーチコード Gemini
 * 作成日: 2025年8月14日
 * 
 * このコードは、Geminiインターフェースで利用可能なモデルと機能を
 * 自動的にリサーチし、変更を検出するためのコンソールスクリプトです。
 */

(function() {
    'use strict';
    
    console.log('='.repeat(80));
    console.log('モデル・機能リサーチコード Gemini');
    console.log(`作成日: ${new Date().toLocaleDateString('ja-JP')} ${new Date().toLocaleTimeString('ja-JP')}`);
    console.log('='.repeat(80));
    
    // ===== 設定と保存データ =====
    const STORAGE_KEY = 'gemini_research_data';
    const SPREADSHEET_URL = 'https://docs.google.com/spreadsheets/d/1QfOFEUWtlR0wwaN5BRyVdenFPxCRJmsf4SPo87O_ZnY/edit?gid=915128086#gid=915128086';
    
    // 現在のデータ構造
    const currentData = {
        timestamp: new Date().toISOString(),
        models: [],
        features: {
            main: [],
            additional: []
        },
        deepThink: {
            available: false,
            activated: false
        },
        deepResearch: {
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
        
        // クリックイベントを発火
        element.click();
        await wait(500);
        
        return true;
    };
    
    // メニューを閉じる
    const closeMenu = async () => {
        // ESCキーを送信
        const event = new KeyboardEvent('keydown', { 
            key: 'Escape', 
            code: 'Escape', 
            keyCode: 27,
            bubbles: true 
        });
        document.dispatchEvent(event);
        await wait(200);
        
        // オーバーレイをクリック
        const overlay = document.querySelector('.cdk-overlay-backdrop');
        if (overlay) {
            overlay.click();
        } else {
            document.body.click();
        }
        await wait(500);
    };
    
    // ===== リサーチ機能 =====
    
    // 1. モデルのリサーチ
    const researchModels = async () => {
        log('モデルメニューをリサーチ中...', 'RESEARCH');
        
        // モデル選択ボタンを複数のセレクタで探す
        const modelButtonSelectors = [
            '[aria-label*="モデル"]',
            '.mode-selector-button',
            '.gds-mode-switch-button',
            'button[aria-haspopup="menu"]:has(.model-name)',
            'button:has(mat-icon[fonticon="arrow_drop_down"])'
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
            '.bard-mode-list-button',
            '[role="menuitemradio"]',
            '[role="menuitem"]:has(.gds-label-m)',
            'mat-action-list button:has(.gds-label-m-alt)'
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
            // タイトルと説明を取得
            const titleEl = item.querySelector('.gds-label-m:not(.gds-label-m-alt)') || 
                          item.querySelector('.mode-title');
            const descEl = item.querySelector('.gds-label-m-alt') || 
                         item.querySelector('.mode-desc');
            
            // 選択状態をチェック
            const isSelected = item.querySelector('mat-icon[fonticon="check_circle"]') !== null ||
                             item.classList.contains('is-selected') || 
                             item.getAttribute('aria-checked') === 'true';
            
            if (titleEl && descEl) {
                const modelData = {
                    title: titleEl.textContent.trim(),
                    description: descEl.textContent.trim(),
                    selected: isSelected
                };
                
                // 重複チェック
                if (!currentData.models.some(m => m.description === modelData.description)) {
                    currentData.models.push(modelData);
                    log(`モデル検出: ${modelData.title} - ${modelData.description}${isSelected ? ' (選択中)' : ''}`, 'SUCCESS');
                }
            }
        });
        
        // 「他のモデル」をチェック
        const moreModelsItem = Array.from(modelItems).find(item => 
            item.textContent?.includes('他のモデル') || 
            item.textContent?.includes('さらに表示')
        );
        
        if (moreModelsItem) {
            log('「他のモデル」メニューを検出', 'INFO');
            await clickElement(moreModelsItem);
            await wait(1000);
            
            // サブメニューのモデルを取得
            const subMenuItems = document.querySelectorAll('[role="menuitem"]');
            subMenuItems.forEach(item => {
                const titleEl = item.querySelector('.gds-label-m:not(.gds-label-m-alt)');
                const descEl = item.querySelector('.gds-label-m-alt');
                
                if (titleEl && descEl) {
                    const modelData = {
                        title: titleEl.textContent.trim(),
                        description: descEl.textContent.trim(),
                        selected: false,
                        additional: true
                    };
                    
                    if (!currentData.models.some(m => m.description === modelData.description)) {
                        currentData.models.push(modelData);
                        log(`追加モデル検出: ${modelData.title} - ${modelData.description}`, 'SUCCESS');
                    }
                }
            });
        }
        
        await closeMenu();
    };
    
    // 2. 機能のリサーチ
    const researchFeatures = async () => {
        log('機能をリサーチ中...', 'RESEARCH');
        
        // メインの機能ボタンを取得
        const mainFeatureSelectors = [
            'toolbox-drawer-item button',
            '.toolbox-drawer-item-button',
            'toolbox-drawer button:has(.label)'
        ];
        
        for (const selector of mainFeatureSelectors) {
            const mainFeatures = document.querySelectorAll(selector);
            if (mainFeatures.length > 0) {
                log(`メイン機能を発見: ${selector} (${mainFeatures.length}個)`, 'SUCCESS');
                
                mainFeatures.forEach(button => {
                    const labelEl = button.querySelector('.toolbox-drawer-button-label, .label, .gds-label-l');
                    const iconEl = button.querySelector('mat-icon');
                    
                    if (labelEl) {
                        const label = labelEl.textContent.trim();
                        // 「その他」ボタンは除外
                        if (label && label !== 'その他' && label !== 'more_horiz') {
                            const featureData = {
                                name: label,
                                icon: iconEl ? (iconEl.getAttribute('fonticon') || iconEl.textContent.trim()) : null,
                                type: 'main',
                                enabled: false
                            };
                            
                            // Deep Think と Deep Research の特別な判定
                            if (label === 'Deep Think') {
                                currentData.deepThink.available = true;
                            } else if (label === 'Deep Research') {
                                currentData.deepResearch.available = true;
                            }
                            
                            currentData.features.main.push(featureData);
                            log(`メイン機能検出: ${label}`, 'SUCCESS');
                        }
                    }
                });
                break;
            }
        }
        
        // 「その他」メニューを開く
        const moreButtonSelectors = [
            '[aria-label="その他"]',
            'mat-icon[fonticon="more_horiz"]'
        ];
        
        let moreButton = null;
        for (const selector of moreButtonSelectors) {
            const element = document.querySelector(selector);
            if (element) {
                moreButton = element.closest('button') || element;
                if (moreButton) {
                    log(`その他ボタンを発見: ${selector}`, 'SUCCESS');
                    break;
                }
            }
        }
        
        if (moreButton) {
            log('その他の機能を確認中...', 'RESEARCH');
            await clickElement(moreButton);
            await wait(1000);
            
            // その他の機能を取得 - オーバーレイ内を探す
            const overlaySelectors = [
                '.cdk-overlay-pane .toolbox-drawer-card',
                '.cdk-overlay-pane mat-card',
                '.toolbox-drawer-card'
            ];
            
            let overlayCard = null;
            for (const selector of overlaySelectors) {
                overlayCard = document.querySelector(selector);
                if (overlayCard) {
                    log(`オーバーレイカードを発見: ${selector}`, 'SUCCESS');
                    break;
                }
            }
            
            if (overlayCard) {
                const additionalFeatures = overlayCard.querySelectorAll(
                    '.toolbox-drawer-menu-item button, .toolbox-drawer-item-list-button, mat-list-item'
                );
                
                additionalFeatures.forEach(button => {
                    const iconEl = button.querySelector('mat-icon');
                    const labelEl = button.querySelector('.gds-label-l, .label');
                    const sublabelEl = button.querySelector('.gds-label-m-alt, .sublabel');
                    
                    if (labelEl) {
                        const featureData = {
                            name: labelEl.textContent.trim(),
                            sublabel: sublabelEl ? sublabelEl.textContent.trim() : null,
                            icon: iconEl ? (iconEl.getAttribute('fonticon') || iconEl.textContent.trim()) : null,
                            type: 'additional',
                            enabled: false
                        };
                        
                        // 重複チェック
                        if (!currentData.features.additional.some(f => f.name === featureData.name)) {
                            currentData.features.additional.push(featureData);
                            log(`追加機能検出: ${featureData.name}${featureData.sublabel ? ` (${featureData.sublabel})` : ''}`, 'SUCCESS');
                        }
                    }
                });
            }
            
            await closeMenu();
        }
    };
    
    // 3. Deep Thinkモードのチェック
    const checkDeepThink = async () => {
        log('Deep Thinkモードをチェック中...', 'RESEARCH');
        
        // Deep Thinkボタンを探す
        const deepThinkButton = Array.from(document.querySelectorAll('button'))
            .find(btn => btn.textContent?.includes('Deep Think'));
        
        if (deepThinkButton) {
            currentData.deepThink.available = true;
            
            // 有効化状態をチェック（クラスやaria属性で判定）
            const isActive = deepThinkButton.classList.contains('active') ||
                           deepThinkButton.getAttribute('aria-pressed') === 'true';
            
            currentData.deepThink.activated = isActive;
            log(`Deep Thinkモード: ${isActive ? '有効' : '無効'}`, 'SUCCESS');
        } else {
            log('Deep Thinkボタンが見つかりません', 'INFO');
        }
    };
    
    // 4. Deep Researchモードのチェック
    const checkDeepResearch = async () => {
        log('Deep Researchモードをチェック中...', 'RESEARCH');
        
        // Deep Researchボタンを探す
        const deepResearchButton = Array.from(document.querySelectorAll('button'))
            .find(btn => btn.textContent?.includes('Deep Research'));
        
        if (deepResearchButton) {
            currentData.deepResearch.available = true;
            
            // 有効化状態をチェック
            const isActive = deepResearchButton.classList.contains('active') ||
                           deepResearchButton.getAttribute('aria-pressed') === 'true';
            
            currentData.deepResearch.activated = isActive;
            log(`Deep Researchモード: ${isActive ? '有効' : '無効'}`, 'SUCCESS');
            
            // Deep Researchは実行に時間がかかることを警告
            if (isActive) {
                log('⚠️ Deep Researchは最大40分かかる場合があります', 'WARNING');
            }
        } else {
            log('Deep Researchボタンが見つかりません', 'INFO');
        }
    };
    
    // 5. 前回データとの比較
    const compareWithPrevious = () => {
        log('\n前回データとの比較...', 'INFO');
        
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
            const prev = prevModels.find(p => p.description === curr.description);
            if (!prev) {
                changes.push(`新規モデル追加: ${curr.title} - ${curr.description}`);
            } else if (prev.selected !== curr.selected) {
                changes.push(`モデル選択状態変更: ${curr.title} (${prev.selected ? '選択' : '非選択'} → ${curr.selected ? '選択' : '非選択'})`);
            }
        });
        
        // 削除されたモデル
        prevModels.forEach(prev => {
            if (!currModels.find(c => c.description === prev.description)) {
                changes.push(`モデル削除: ${prev.title} - ${prev.description}`);
            }
        });
        
        // メイン機能の比較
        const prevMainFeatures = previousData.features?.main || [];
        const currMainFeatures = currentData.features.main;
        
        currMainFeatures.forEach(curr => {
            const prev = prevMainFeatures.find(p => p.name === curr.name);
            if (!prev) {
                changes.push(`新規メイン機能追加: ${curr.name}`);
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
                changes.push(`新規追加機能: ${curr.name}${curr.sublabel ? ` (${curr.sublabel})` : ''}`);
            }
        });
        
        prevAdditionalFeatures.forEach(prev => {
            if (!currAdditionalFeatures.find(c => c.name === prev.name)) {
                changes.push(`追加機能削除: ${prev.name}`);
            }
        });
        
        // Deep Thinkモードの比較
        const prevDeepThink = previousData.deepThink;
        const currDeepThink = currentData.deepThink;
        
        if (prevDeepThink) {
            if (prevDeepThink.available !== currDeepThink.available) {
                changes.push(`Deep Thinkモード: ${currDeepThink.available ? '利用可能になりました' : '利用不可になりました'}`);
            }
        } else if (currDeepThink.available) {
            changes.push('Deep Thinkモード: 新規検出');
        }
        
        // Deep Researchモードの比較
        const prevDeepResearch = previousData.deepResearch;
        const currDeepResearch = currentData.deepResearch;
        
        if (prevDeepResearch) {
            if (prevDeepResearch.available !== currDeepResearch.available) {
                changes.push(`Deep Researchモード: ${currDeepResearch.available ? '利用可能になりました' : '利用不可になりました'}`);
            }
        } else if (currDeepResearch.available) {
            changes.push('Deep Researchモード: 新規検出');
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
            
            // Deep Thinkモードのチェック
            await checkDeepThink();
            await wait(500);
            
            // Deep Researchモードのチェック
            await checkDeepResearch();
            await wait(500);
            
            // 前回データとの比較
            const comparison = compareWithPrevious();
            
            // 結果の表示
            console.log('\n' + '='.repeat(80));
            console.log('リサーチ結果サマリー');
            console.log('='.repeat(80));
            
            console.log('\n📊 検出されたモデル:');
            if (currentData.models.length === 0) {
                console.log('  ⚠️ モデルが検出されませんでした');
            } else {
                currentData.models.forEach(m => {
                    const selectedMark = m.selected ? ' ✅ (選択中)' : '';
                    const additionalMark = m.additional ? ' (追加モデル)' : '';
                    console.log(`  • ${m.title} - ${m.description}${selectedMark}${additionalMark}`);
                });
            }
            
            console.log('\n📊 検出された機能:');
            if (currentData.features.main.length > 0) {
                console.log('  メイン機能:');
                currentData.features.main.forEach(f => {
                    console.log(`    • ${f.name}${f.icon ? ` (${f.icon})` : ''}`);
                });
            }
            
            if (currentData.features.additional.length > 0) {
                console.log('  追加機能（その他メニュー）:');
                currentData.features.additional.forEach(f => {
                    const sublabel = f.sublabel ? ` - ${f.sublabel}` : '';
                    console.log(`    • ${f.name}${sublabel}${f.icon ? ` (${f.icon})` : ''}`);
                });
            }
            
            console.log('\n🔬 特殊モード:');
            console.log(`  • Deep Think: ${currentData.deepThink.available ? '✅ 利用可能' : '❌ 利用不可'}`);
            console.log(`  • Deep Research: ${currentData.deepResearch.available ? '✅ 利用可能' : '❌ 利用不可'}`);
            
            // 変更がある場合の処理
            if (comparison.hasChanges && !comparison.isFirstRun) {
                console.log('\n' + '='.repeat(80));
                console.log('🔄 変更検出！');
                console.log('='.repeat(80));
                
                comparison.changes.forEach(change => {
                    log(change, 'CHANGE');
                });
                
                console.log('\nℹ️ スプレッドシートURL:');
                console.log(`📝 ${SPREADSHEET_URL}`);
            } else if (comparison.isFirstRun) {
                console.log('\n✅ 初回実行完了 - データを保存しました');
                console.log('📝 今後、変更が検出された場合にスプレッドシートへの登録を促します');
            } else if (!comparison.hasChanges) {
                console.log('\n✅ 前回から変更はありません');
            }
            
            // データを保存
            localStorage.setItem(STORAGE_KEY, JSON.stringify(currentData));
            log('\nデータを保存しました', 'SUCCESS');
            
            // 詳細データのエクスポート（デバッグ用）
            console.log('\n📁 詳細データ（JSON形式）:');
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
    window.GeminiResearchDetector = {
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
        console.log('\n🤖 AI変更検出システムから実行されました');
        executeResearch().then(result => {
            if (window.AIChangeDetector.callback) {
                window.AIChangeDetector.callback('gemini', result);
            }
        });
    } else {
        console.log('\n' + '='.repeat(80));
        console.log('Gemini リサーチ検出器が初期化されました');
        console.log('実行方法: GeminiResearchDetector.executeResearch()');
        console.log('='.repeat(80));
    }
    
})();