// Claude DeepResearch選択ロジック共有モジュール
// claude-research-detector.jsから抽出したDeepResearch選択ロジックを共有化

(function() {
    'use strict';

    // ログ出力関数（依存関係を最小限にするため）
    function log(message, type = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        const prefix = type === 'success' ? '✅' : type === 'error' ? '❌' : type === 'warning' ? '⚠️' : 'ℹ️';
        console.log(`[${timestamp}] ${prefix} [ClaudeDeepResearch] ${message}`);
    }

    // 要素クリック関数
    async function clickElement(element) {
        if (!element) return false;
        
        try {
            // 要素が表示されているか確認
            const rect = element.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) {
                log('要素が非表示です', 'warning');
                return false;
            }

            // クリックイベントを発火
            element.click();
            
            // MouseEventも発火（一部のボタンはこれが必要）
            const clickEvent = new MouseEvent('click', {
                view: window,
                bubbles: true,
                cancelable: true,
                buttons: 1
            });
            element.dispatchEvent(clickEvent);
            
            return true;
        } catch (error) {
            log(`クリックエラー: ${error.message}`, 'error');
            return false;
        }
    }

    // 待機関数
    function wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // DeepResearchボタンを選択する関数
    async function selectClaudeDeepResearch() {
        log('Claude DeepResearch選択処理を開始');

        // リサーチボタンを探す（複数の方法で試行）
        const researchSelectors = [
            'button[aria-pressed]:has(svg path[d*="M8.5 2C12"])',  // SVGパスの特徴的な部分で検索
            'button[aria-pressed]:has(svg)',  // aria-pressed属性を持つSVGボタン
            'button[aria-label*="Research"]',
            'button[aria-label*="リサーチ"]',
            'button[aria-label*="Deep Research"]',
            'button:has(svg[class*="research"])',
            'button[data-testid*="research"]'
        ];
        
        let researchButton = null;
        
        // 優先順位付きセレクタで検索
        for (const selector of researchSelectors) {
            try {
                researchButton = document.querySelector(selector);
                if (researchButton) {
                    log(`DeepResearchボタンをセレクタ ${selector} で発見`, 'success');
                    break;
                }
            } catch (e) {
                // 無効なセレクタの場合はスキップ
            }
        }
        
        // それでも見つからない場合は、aria-pressed属性を持つSVGボタンを探す
        if (!researchButton) {
            // ウェブ検索を有効にした後に出現するaria-pressedボタンを探す
            const deepResearchSelectors = window.AIHandler?.getSelectors?.('Claude', 'DEEP_RESEARCH_BUTTON') || ['button[aria-pressed]'];
            let allPressButtons = [];
            for (const selector of deepResearchSelectors) {
                allPressButtons.push(...document.querySelectorAll(selector));
            }
            
            // 機能メニュー外（入力フィールド近く）にあるボタンを探す
            researchButton = allPressButtons.find(button => {
                // SVGアイコンを含む
                const hasSvg = button.querySelector('svg') !== null;
                // テキストがない（アイコンのみ）
                const hasNoText = !button.textContent?.trim() || button.textContent?.trim().length < 3;
                // 機能メニュー内ではない（toggleやcheckboxを含まない）
                const notInMenu = !button.querySelector('input[type="checkbox"]');
                
                return hasSvg && hasNoText && notInMenu;
            });
            
            if (researchButton) {
                log('SVGアイコンボタンとしてDeepResearchボタンを発見', 'success');
            }
        }
        
        // 方法2: テキストやaria-labelで検索（既存の方法を維持）
        if (!researchButton) {
            researchButton = Array.from(document.querySelectorAll('button'))
                .find(el => {
                    const text = el.textContent?.toLowerCase() || '';
                    const ariaLabel = el.getAttribute('aria-label')?.toLowerCase() || '';
                    const hasResearchText = text.includes('research') || text.includes('リサーチ') || 
                                           text.includes('deep research') || text.includes('ディープリサーチ');
                    const hasResearchLabel = ariaLabel.includes('research') || ariaLabel.includes('リサーチ');
                    const hasAriaPressed = el.getAttribute('aria-pressed') !== null;
                    return (hasResearchText || hasResearchLabel) && hasAriaPressed;
                });
            
            if (researchButton) {
                log('テキスト/aria-labelベースでDeepResearchボタンを発見', 'success');
            }
        }
        
        if (researchButton) {
            // ボタンの詳細情報をログ出力
            log(`DeepResearchボタン発見:`, 'success');
            log(`  テキスト: ${researchButton.textContent?.trim()}`);
            log(`  aria-label: ${researchButton.getAttribute('aria-label')}`);
            log(`  aria-pressed: ${researchButton.getAttribute('aria-pressed')}`);
            
            const isPressed = researchButton.getAttribute('aria-pressed') === 'true';
            
            if (!isPressed) {
                // ボタンがまだ押されていない場合はクリック
                log('DeepResearchボタンをクリックして有効化');
                const clicked = await clickElement(researchButton);
                
                if (clicked) {
                    await wait(1500); // クリック後の状態変更を待つ
                    
                    // 再度状態を確認
                    const nowPressed = researchButton.getAttribute('aria-pressed') === 'true';
                    if (nowPressed) {
                        log('DeepResearchモードが有効になりました', 'success');
                        return { success: true, button: researchButton };
                    } else {
                        log('DeepResearchボタンのクリック後も状態が変わりませんでした', 'warning');
                        return { success: false, button: researchButton };
                    }
                } else {
                    log('DeepResearchボタンのクリックに失敗しました', 'error');
                    return { success: false, button: researchButton };
                }
            } else {
                log('DeepResearchモードは既に有効です', 'success');
                return { success: true, button: researchButton, alreadyEnabled: true };
            }
        } else {
            log('DeepResearchボタンが見つかりませんでした', 'error');
            return { success: false, button: null };
        }
    }

    // グローバルに公開
    window.ClaudeDeepResearchSelector = {
        select: selectClaudeDeepResearch,
        clickElement: clickElement,
        wait: wait,
        log: log
    };

    console.log('✅ ClaudeDeepResearchSelector モジュールが読み込まれました');
})();