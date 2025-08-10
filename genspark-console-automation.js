// Genspark コンソール自動化スクリプト
// ブラウザのコンソールで直接実行可能

(function() {
    // セレクタ定義
    const selectors = {
        textInput: [
            'textarea[name="query"]',
            '.search-input',
            '.j-search-input',
            'textarea.search-input.j-search-input',
            '.prompt-input-wrapper-upper textarea',
            '.textarea-wrapper textarea',
            'textarea[placeholder*="スライドのリクエスト"]'
        ],
        submitButton: [
            '.enter-icon.active',
            '.enter-icon-wrapper.active',
            '.enter-icon-wrapper[class*="bg-[#262626]"]',
            '.enter-icon.cursor-pointer.active',
            'div[class*="enter-icon"][class*="active"]',
            '.enter-icon-wrapper[class*="text-white"]',
            '.input-icon .enter-icon'
        ]
    };

    // 要素を複数のセレクタで検索
    function findElement(selectorArray, elementName) {
        for (const selector of selectorArray) {
            try {
                const element = document.querySelector(selector);
                if (element) {
                    console.log(`✅ ${elementName}を発見: ${selector}`);
                    return element;
                }
            } catch (e) {
                // セレクタエラーは無視
            }
        }
        console.error(`❌ ${elementName}が見つかりません`);
        return null;
    }

    // テキスト入力
    function inputText(text) {
        const textInput = findElement(selectors.textInput, 'テキスト入力欄');
        if (!textInput) {
            console.error('テキスト入力欄が見つかりません');
            return false;
        }

        textInput.value = text;
        textInput.focus();
        
        // inputイベントを発火
        const inputEvent = new Event('input', { bubbles: true });
        textInput.dispatchEvent(inputEvent);
        
        console.log(`📝 テキストを入力: "${text}"`);
        return true;
    }

    // 送信ボタンをチェックして送信
    function checkAndSubmit() {
        const submitButton = findElement(selectors.submitButton, '送信ボタン');
        
        if (submitButton) {
            // ボタンが有効か確認
            const isActive = submitButton.classList.contains('active') || 
                           submitButton.parentElement?.classList.contains('active') ||
                           submitButton.closest('.enter-icon-wrapper')?.classList.contains('active');
            
            if (isActive) {
                console.log('🚀 送信ボタンがアクティブです。送信します！');
                submitButton.click();
                clearInterval(checkInterval);
                console.log('✅ 送信完了！監視を停止しました。');
                return true;
            } else {
                console.log('⏳ 送信ボタンはまだアクティブではありません...');
            }
        } else {
            console.log('🔍 送信ボタンを探しています...');
        }
        return false;
    }

    // メイン実行
    console.log('=== Genspark 自動化開始 ===');
    
    // ステップ1: テキスト入力
    const inputSuccess = inputText('桃太郎をスライド１枚でまとめて');
    
    if (!inputSuccess) {
        console.error('テキスト入力に失敗しました。処理を中止します。');
        return;
    }

    // ステップ2: 1秒ごとに送信ボタンをチェック
    console.log('📡 送信ボタンの監視を開始します（1秒ごと）');
    let checkCount = 0;
    const maxChecks = 30; // 最大30秒待機

    const checkInterval = setInterval(() => {
        checkCount++;
        console.log(`🔄 チェック回数: ${checkCount}/${maxChecks}`);
        
        const submitted = checkAndSubmit();
        
        if (submitted || checkCount >= maxChecks) {
            clearInterval(checkInterval);
            if (checkCount >= maxChecks) {
                console.log('⚠️ タイムアウト: 30秒経過しました。');
            }
        }
    }, 1000);

    // 手動停止用の関数を提供
    window.stopGensparkAutomation = () => {
        clearInterval(checkInterval);
        console.log('🛑 手動で停止しました。');
    };
    
    console.log('💡 ヒント: stopGensparkAutomation() で手動停止できます。');

})();