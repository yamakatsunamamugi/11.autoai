/**
 * モデル・機能リサーチコード Claude
 * 作成日: 2025年8月14日
 * 
 * このコードは、Claudeインターフェースで利用可能なモデルと機能を
 * 自動的にリサーチし、変更を検出するためのコンソールスクリプトです。
 * DeepResearchモードの検出機能を含みます。
 */

(function() {
    'use strict';
    
    console.log('='.repeat(80));
    console.log('モデル・機能リサーチコード Claude');
    console.log(`作成日: ${new Date().toLocaleDateString('ja-JP')} ${new Date().toLocaleTimeString('ja-JP')}`);
    console.log('='.repeat(80));
    
    // ===== 設定と保存データ =====
    const STORAGE_KEY = 'claude_research_data';
    const SPREADSHEET_URL = 'https://docs.google.com/spreadsheets/d/1QfOFEUWtlR0wwaN5BRyVdenFPxCRJmsf4SPo87O_ZnY/edit?gid=915128086#gid=915128086';
    
    // 現在のデータ構造
    const currentData = {
        timestamp: new Date().toISOString(),
        models: [],
        features: [],
        connectors: [],
        additionalModels: [],
        deepResearch: {
            available: false,
            searchModeAvailable: false,
            researchButtonAvailable: false,
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
    
    // React要素のプロパティを取得
    const getReactProps = (element) => {
        const key = Object.keys(element).find(k => 
            k.startsWith('__reactInternalInstance') || k.startsWith('__reactFiber')
        );
        return key ? element[key]?.memoizedProps : null;
    };
    
    // 要素をクリック
    const clickElement = async (element) => {
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
    };
    
    // メニューを閉じる
    const closeMenu = async () => {
        document.body.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Escape',
            code: 'Escape',
            bubbles: true
        }));
        await wait(500);
    };
    
    // メニューが開くのを待つ
    const waitForMenu = async (maxWait = 3000) => {
        const startTime = Date.now();
        
        while (Date.now() - startTime < maxWait) {
            // 複数のメニューセレクタをチェック
            const menuSelectors = [
                '[role="menu"]',
                'div[data-radix-menu-content]',
                'div[data-state="open"][role="menu"]',
                '.popover[role="menu"]',
                '[aria-orientation="vertical"][role="menu"]'
            ];
            
            for (const selector of menuSelectors) {
                const menu = document.querySelector(selector);
                if (menu && menu.offsetParent !== null) {
                    // メニューが表示されていることを確認
                    const items = menu.querySelectorAll('[role="menuitem"], [role="menuitemradio"], button');
                    if (items.length > 0) {
                        await wait(300); // メニューが完全に開くのを待つ
                        return menu;
                    }
                }
            }
            
            await wait(100);
        }
        
        return null;
    };
    
    // ===== リサーチ機能 =====
    
    // 1. モデルのリサーチ
    const researchModels = async () => {
        log('モデルメニューをリサーチ中...');
        
        // モデル選択ボタンを探す
        const modelButton = document.querySelector('[data-testid="model-selector-dropdown"]') ||
                          document.querySelector('button[aria-haspopup="menu"]') ||
                          Array.from(document.querySelectorAll('button'))
                              .find(el => el.textContent?.includes('Opus') || el.textContent?.includes('Sonnet'));
        
        if (!modelButton) {
            log('モデル選択ボタンが見つかりません', 'ERROR');
            return;
        }
        
        // メニューを開く
        await clickElement(modelButton);
        await wait(1000);
        
        // モデル項目を取得
        const menuItems = Array.from(document.querySelectorAll('[role="menuitem"]'));
        let hasOtherModels = false;
        
        menuItems.forEach(item => {
            const text = item.textContent?.trim();
            if (text) {
                // メインモデルの検出
                if (text.includes('Claude Opus') || text.includes('Claude Sonnet')) {
                    const modelName = text.split('新規チャット')[0].trim();
                    const description = Array.from(item.querySelectorAll('.text-text-500'))
                        .map(el => el.textContent?.trim())
                        .filter(Boolean)
                        .join(' ');
                    
                    currentData.models.push({
                        name: modelName,
                        description: description || '',
                        available: true
                    });
                    log(`モデル検出: ${modelName}`, 'SUCCESS');
                }
                
                // 「他のモデル」の検出
                if (text.includes('他のモデル')) {
                    hasOtherModels = true;
                    log('「他のモデル」メニューを検出', 'INFO');
                }
            }
        });
        
        // 「他のモデル」がある場合、展開を試みる
        if (hasOtherModels) {
            const otherModelsItem = menuItems.find(item => item.textContent?.includes('他のモデル'));
            if (otherModelsItem) {
                await clickElement(otherModelsItem);
                await wait(1000);
                
                // サブメニューのモデルを取得
                const subMenuItems = Array.from(document.querySelectorAll('[role="menuitem"]'));
                subMenuItems.forEach(item => {
                    const text = item.textContent?.trim();
                    if (text && (text.includes('Claude') || text.includes('GPT') || text.includes('Gemini'))) {
                        if (!currentData.additionalModels.find(m => m.name === text)) {
                            currentData.additionalModels.push({
                                name: text,
                                available: true
                            });
                            log(`追加モデル検出: ${text}`, 'SUCCESS');
                        }
                    }
                });
            }
        }
        
        await closeMenu();
    };
    
    // 2. 機能のリサーチ
    const researchFeatures = async () => {
        log('機能メニューをリサーチ中...');
        
        // 機能選択ボタンを探す
        const featureButton = document.querySelector('[data-testid="input-menu-tools"]') ||
                            document.querySelector('[aria-label="ツールメニューを開く"]') ||
                            Array.from(document.querySelectorAll('button'))
                                .find(el => el.querySelector('svg[class*="grid"]'));
        
        if (!featureButton) {
            log('機能選択ボタンが見つかりません', 'ERROR');
            return;
        }
        
        // メニューを開く
        await clickElement(featureButton);
        await wait(1000);
        
        // 機能項目を取得
        const buttons = Array.from(document.querySelectorAll('button'));
        
        const featureNames = [
            'コネクタを管理',
            'コネクタを追加',
            'カレンダー検索',
            'Gmail検索',
            'Drive検索',
            'ウェブ検索',
            'じっくり考える',
            'スタイルを使用'
        ];
        
        featureNames.forEach(name => {
            const button = buttons.find(b => b.textContent?.includes(name));
            if (button) {
                // トグルスイッチの状態を確認
                const toggle = button.querySelector('input[type="checkbox"]');
                const isEnabled = toggle ? toggle.checked : false;
                
                // 連携状態を確認
                const statusText = button.textContent;
                const isConnected = statusText?.includes('連携済') || !statusText?.includes('連携/連携させる');
                
                currentData.features.push({
                    name: name,
                    type: toggle ? 'toggle' : 'button',
                    enabled: isEnabled,
                    connected: isConnected
                });
                
                log(`機能検出: ${name} (${isEnabled ? '有効' : '無効'}, ${isConnected ? '連携済' : '未連携'})`, 'SUCCESS');
            }
        });
        
        // さらに表示があるかチェック
        const moreButton = buttons.find(b => b.textContent?.includes('さらに表示'));
        if (moreButton) {
            log('「さらに表示」ボタンを検出', 'INFO');
            await clickElement(moreButton);
            await wait(1000);
            
            // 追加の機能を再度スキャン
            const additionalButtons = Array.from(document.querySelectorAll('button'));
            additionalButtons.forEach(button => {
                const text = button.textContent;
                if (text && !currentData.features.find(f => text.includes(f.name))) {
                    // 新しい機能を検出
                    const newFeature = {
                        name: text.trim(),
                        type: 'button',
                        enabled: false,
                        connected: false
                    };
                    currentData.features.push(newFeature);
                    log(`追加機能検出: ${newFeature.name}`, 'SUCCESS');
                }
            });
        }
        
        await closeMenu();
    };
    
    // 3. DeepResearchモードのリサーチ（改良版）
    const researchDeepResearch = async () => {
        log('DeepResearchモードをリサーチ中...', 'RESEARCH');
        
        // ステップ1: ウェブ検索機能をオンにする（検索モード）
        log('ステップ1: ウェブ検索（検索モード）を有効化...', 'RESEARCH');
        
        // 機能メニューを開く
        const featureButton = document.querySelector('[data-testid="input-menu-tools"]') ||
                            document.querySelector('[aria-label="ツールメニューを開く"]');
        
        if (!featureButton) {
            log('機能メニューボタンが見つかりません', 'ERROR');
            return;
        }
        
        await clickElement(featureButton);
        await wait(1000);
        
        // ウェブ検索トグルを探してオンにする
        const webSearchButton = Array.from(document.querySelectorAll('button'))
            .find(el => el.textContent?.includes('ウェブ検索'));
        
        if (!webSearchButton) {
            log('ウェブ検索ボタンが見つかりません', 'WARNING');
            // メニューを閉じる
            document.body.dispatchEvent(new KeyboardEvent('keydown', {
                key: 'Escape',
                code: 'Escape',
                bubbles: true
            }));
            await wait(500);
            return;
        }
        
        // ウェブ検索のトグル状態を確認
        const webSearchToggle = webSearchButton.querySelector('input[type="checkbox"]');
        let wasWebSearchEnabled = false;
        
        if (webSearchToggle) {
            wasWebSearchEnabled = webSearchToggle.checked;
            
            // オフの場合はオンにする
            if (!webSearchToggle.checked) {
                log('ウェブ検索を有効化します', 'RESEARCH');
                await clickElement(webSearchButton);
                await wait(500);
                log('ウェブ検索を有効化しました', 'SUCCESS');
            } else {
                log('ウェブ検索は既に有効です', 'INFO');
            }
        }
        
        currentData.deepResearch.searchModeAvailable = true;
        
        // メニューを閉じる（ESCキーを送信）
        document.body.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Escape',
            code: 'Escape',
            bubbles: true
        }));
        await wait(1000);
        
        // ステップ2: リサーチボタンを探す（改良版）
        log('ステップ2: リサーチボタンを探しています（メニュー外）...', 'RESEARCH');
        
        const allButtons = document.querySelectorAll('button');
        let researchButton = null;
        
        // より堅牢な検索ロジック
        for (const button of allButtons) {
            const text = button.textContent?.trim();
            const hasAriaPressed = button.hasAttribute('aria-pressed');
            
            if (text && text.includes('リサーチ') && hasAriaPressed) {
                // SVGアイコンの存在も確認（より正確な判定）
                const hasSvg = button.querySelector('svg');
                if (hasSvg) {
                    researchButton = button;
                    log('リサーチボタンを発見（SVG付き）', 'SUCCESS');
                    break;
                }
            }
        }
        
        // SVGなしでも検索
        if (!researchButton) {
            for (const button of allButtons) {
                const text = button.textContent?.trim();
                const hasAriaPressed = button.hasAttribute('aria-pressed');
                
                if (text && text.includes('リサーチ') && hasAriaPressed) {
                    researchButton = button;
                    log('リサーチボタンを発見（aria-pressed付き）', 'SUCCESS');
                    break;
                }
            }
        }
        
        if (researchButton) {
            currentData.deepResearch.researchButtonAvailable = true;
            log('リサーチボタンを検出しました！', 'SUCCESS');
            
            // リサーチボタンの現在の状態を確認
            const isPressed = researchButton.getAttribute('aria-pressed') === 'true';
            
            if (!isPressed) {
                // ステップ3: リサーチボタンをオンにする（DeepResearchモード有効化）
                log('ステップ3: DeepResearchモードを有効化...', 'RESEARCH');
                await clickElement(researchButton);
                await wait(1500);
                
                // 有効化の確認
                const nowPressed = researchButton.getAttribute('aria-pressed') === 'true';
                
                if (nowPressed) {
                    currentData.deepResearch.available = true;
                    currentData.deepResearch.activated = true;
                    log('✅ DeepResearchモードが正常に有効化されました！', 'SUCCESS');
                    log('⚠️ DeepResearchは最大40分かかる場合があります', 'WARNING');
                    
                    // ステップ4: リサーチボタンをオフに戻す（テスト用）
                    log('ステップ4: リサーチボタンをオフに戻します...', 'RESEARCH');
                    await wait(1000);
                    await clickElement(researchButton);
                    await wait(1000);
                    
                    const offPressed = researchButton.getAttribute('aria-pressed') === 'false';
                    if (offPressed) {
                        log('リサーチボタンを無効化しました', 'RESEARCH');
                        currentData.deepResearch.activated = false;
                    }
                } else {
                    log('DeepResearchモードの有効化に失敗しました', 'WARNING');
                    currentData.deepResearch.available = false;
                }
            } else {
                // 既に有効な場合
                currentData.deepResearch.available = true;
                currentData.deepResearch.activated = true;
                log('DeepResearchモードは既に有効です', 'INFO');
                
                // オフに戻す（テスト用）
                log('リサーチボタンをオフに戻します...', 'RESEARCH');
                await wait(1000);
                await clickElement(researchButton);
                await wait(1000);
                currentData.deepResearch.activated = false;
            }
            
            // ウェブ検索を元の状態に戻す（必要な場合）
            if (!wasWebSearchEnabled) {
                log('ウェブ検索を元の状態（無効）に戻します...', 'RESEARCH');
                const featureButtonAgain = document.querySelector('[data-testid="input-menu-tools"]');
                if (featureButtonAgain) {
                    await clickElement(featureButtonAgain);
                    await wait(1000);
                    
                    const webSearchButtonAgain = Array.from(document.querySelectorAll('button'))
                        .find(el => el.textContent?.includes('ウェブ検索'));
                    
                    if (webSearchButtonAgain) {
                        const toggleAgain = webSearchButtonAgain.querySelector('input[type="checkbox"]');
                        if (toggleAgain && toggleAgain.checked) {
                            await clickElement(webSearchButtonAgain);
                            log('ウェブ検索を無効化しました', 'RESEARCH');
                        }
                    }
                    
                    await closeMenu();
                }
            }
        } else {
            log('リサーチボタンが見つかりません', 'WARNING');
            log('ウェブ検索が有効でもリサーチボタンが表示されない可能性があります', 'INFO');
            currentData.deepResearch.researchButtonAvailable = false;
            currentData.deepResearch.available = false;
            
            // ウェブ検索を元に戻す
            if (!wasWebSearchEnabled) {
                const featureButtonAgain = document.querySelector('[data-testid="input-menu-tools"]');
                if (featureButtonAgain) {
                    await clickElement(featureButtonAgain);
                    await wait(1000);
                    
                    const webSearchButtonAgain = Array.from(document.querySelectorAll('button'))
                        .find(el => el.textContent?.includes('ウェブ検索'));
                    
                    if (webSearchButtonAgain) {
                        await clickElement(webSearchButtonAgain);
                    }
                    
                    await closeMenu();
                }
            }
        }
    };
    
    // 4. 前回データとの比較
    const compareWithPrevious = () => {
        log('\n前回データとの比較...');
        
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
        const prevModelNames = previousData.models?.map(m => m.name) || [];
        const currModelNames = currentData.models.map(m => m.name);
        
        // 新しく追加されたモデル
        currModelNames.forEach(name => {
            if (!prevModelNames.includes(name)) {
                changes.push(`新規モデル追加: ${name}`);
            }
        });
        
        // 削除されたモデル
        prevModelNames.forEach(name => {
            if (!currModelNames.includes(name)) {
                changes.push(`モデル削除: ${name}`);
            }
        });
        
        // 追加モデルの比較
        const prevAdditionalModels = previousData.additionalModels?.map(m => m.name) || [];
        const currAdditionalModels = currentData.additionalModels.map(m => m.name);
        
        currAdditionalModels.forEach(name => {
            if (!prevAdditionalModels.includes(name)) {
                changes.push(`新規追加モデル: ${name}`);
            }
        });
        
        // 機能の比較
        const prevFeatures = previousData.features || [];
        const currFeatures = currentData.features;
        
        currFeatures.forEach(curr => {
            const prev = prevFeatures.find(p => p.name === curr.name);
            if (!prev) {
                changes.push(`新規機能追加: ${curr.name}`);
            } else {
                // 状態の変更をチェック
                if (prev.enabled !== curr.enabled) {
                    changes.push(`機能状態変更: ${curr.name} (${prev.enabled ? '有効' : '無効'} → ${curr.enabled ? '有効' : '無効'})`);
                }
                if (prev.connected !== curr.connected) {
                    changes.push(`連携状態変更: ${curr.name} (${prev.connected ? '連携済' : '未連携'} → ${curr.connected ? '連携済' : '未連携'})`);
                }
            }
        });
        
        // 削除された機能
        prevFeatures.forEach(prev => {
            if (!currFeatures.find(c => c.name === prev.name)) {
                changes.push(`機能削除: ${prev.name}`);
            }
        });
        
        // DeepResearchモードの比較
        const prevDeepResearch = previousData.deepResearch;
        const currDeepResearch = currentData.deepResearch;
        
        if (prevDeepResearch) {
            if (prevDeepResearch.available !== currDeepResearch.available) {
                changes.push(`DeepResearchモード: ${currDeepResearch.available ? '利用可能になりました' : '利用不可になりました'}`);
            }
            if (prevDeepResearch.activated !== currDeepResearch.activated) {
                changes.push(`DeepResearchモード状態: ${currDeepResearch.activated ? '有効化' : '無効化'}`);
            }
        } else if (currDeepResearch.available) {
            changes.push('DeepResearchモード: 新規検出');
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
            
            // DeepResearchモードのリサーチ
            await researchDeepResearch();
            await wait(1000);
            
            // 前回データとの比較
            const comparison = compareWithPrevious();
            
            // 結果の表示
            console.log('\n' + '='.repeat(80));
            console.log('リサーチ結果サマリー');
            console.log('='.repeat(80));
            
            console.log('\n📊 検出されたモデル:');
            currentData.models.forEach(m => {
                console.log(`  • ${m.name}`);
                if (m.description) console.log(`    ${m.description}`);
            });
            
            if (currentData.additionalModels.length > 0) {
                console.log('\n📊 追加モデル（他のモデル内）:');
                currentData.additionalModels.forEach(m => {
                    console.log(`  • ${m.name}`);
                });
            }
            
            console.log('\n📊 検出された機能:');
            currentData.features.forEach(f => {
                const status = [];
                if (f.type === 'toggle') status.push(f.enabled ? '✅有効' : '⬜無効');
                if (f.connected !== undefined) status.push(f.connected ? '🔗連携済' : '🔗未連携');
                console.log(`  • ${f.name} ${status.join(' ')}`);
            });
            
            console.log('\n🔬 DeepResearchモード:');
            if (currentData.deepResearch.available) {
                console.log(`  ✅ 利用可能`);
                console.log(`  • 検索モード: ${currentData.deepResearch.searchModeAvailable ? '✅' : '❌'}`);
                console.log(`  • リサーチボタン: ${currentData.deepResearch.researchButtonAvailable ? '✅' : '❌'}`);
                console.log(`  • 現在の状態: ${currentData.deepResearch.activated ? '有効' : '無効'}`);
            } else {
                console.log(`  ❌ 利用不可または未検出`);
                if (currentData.deepResearch.searchModeAvailable) {
                    console.log(`  • 検索モードは検出されましたが、リサーチボタンが見つかりません`);
                }
            }
            
            // 変更がある場合の処理（初回実行以外）
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
    window.ClaudeResearchDetector = {
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
    
    console.log('\n' + '='.repeat(80));
    console.log('Claude リサーチ検出器が初期化されました');
    console.log('実行方法: ClaudeResearchDetector.executeResearch()');
    console.log('='.repeat(80));
    
})();