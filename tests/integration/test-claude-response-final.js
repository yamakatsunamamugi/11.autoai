// Claude応答待機と取得のテストコード（最終修正版）
(async () => {
    console.log('===== Claude応答待機テスト開始 =====');
    
    // 1. 応答待機のチェック
    const checkResponseComplete = () => {
        const stopButton = document.querySelector('button[aria-label="応答を停止"]');
        const sendButton = document.querySelector('button[aria-label="メッセージを送信"]');
        
        console.log('停止ボタン:', stopButton ? '存在' : '無し');
        console.log('送信ボタン:', sendButton ? '存在' : '無し');
        
        if (stopButton && stopButton.offsetParent !== null) {
            console.log('→ まだ生成中');
            return false;
        } else if (!stopButton && sendButton && sendButton.offsetParent !== null) {
            console.log('→ 応答完了！');
            return true;
        }
        return false;
    };
    
    // 2. 応答取得（思考プロセス除外）
    const getClaudeResponse = () => {
        console.log('\n===== 応答取得開始 =====');
        
        const messages = document.querySelectorAll('.font-claude-message');
        console.log(`Claudeメッセージ数: ${messages.length}`);
        
        if (messages.length === 0) {
            console.log('メッセージが見つかりません');
            return null;
        }
        
        const lastMessage = messages[messages.length - 1];
        const clone = lastMessage.cloneNode(true);
        
        // 思考プロセスボタンを含む要素を削除
        // パターン1: 「思考プロセス」テキストを含むボタン（日本語）
        // パターン2: 「Analyzed」「Pondered」等を含むボタン（英語）
        // パターン3: タイマーアイコン（時計SVG）を含むボタン
        
        const allButtons = clone.querySelectorAll('button');
        let removedCount = 0;
        
        allButtons.forEach(btn => {
            const text = btn.textContent || '';
            
            // 思考プロセスを示すテキストパターン
            const isThinkingButton = 
                text.includes('思考プロセス') ||
                text.includes('Analyzed') ||
                text.includes('Pondered') ||
                text.includes('Thought') ||
                text.includes('Considered') ||
                text.includes('Evaluated') ||
                text.includes('Reviewed') ||
                // タイマーアイコン（時計のSVG）を含むボタンも思考プロセス
                btn.querySelector('svg path[d*="M10.3857 2.50977"]') !== null ||
                // tabular-numsクラス（時間表示）を含むボタン
                btn.querySelector('.tabular-nums') !== null;
            
            if (isThinkingButton) {
                // ボタンの最も外側の親要素を探す
                let elementToRemove = btn;
                let parent = btn.parentElement;
                
                // rounded-lg, border-0.5, transition-all等のクラスを持つ親要素まで遡る
                while (parent) {
                    if (parent.classList && (
                        parent.classList.contains('rounded-lg') ||
                        parent.classList.contains('border-0.5') ||
                        parent.classList.contains('transition-all') ||
                        parent.classList.contains('my-3')
                    )) {
                        elementToRemove = parent;
                        parent = parent.parentElement;
                    } else {
                        break;
                    }
                }
                
                console.log(`削除: 思考プロセス要素 "${text.substring(0, 50)}..."`);
                elementToRemove.remove();
                removedCount++;
            }
        });
        
        console.log(`削除した思考プロセス要素: ${removedCount}個`);
        
        const responseText = clone.textContent?.trim();
        console.log(`取得した応答: ${responseText?.substring(0, 100)}...`);
        
        return responseText;
    };
    
    // 3. 実行
    const isComplete = checkResponseComplete();
    
    if (isComplete) {
        const response = getClaudeResponse();
        console.log('\n===== 結果 =====');
        console.log('応答ステータス: 完了');
        console.log('応答文字数:', response ? response.length : 0);
        window.claudeResponse = response;
        console.log('→ window.claudeResponse に保存しました');
        return response;
    } else {
        console.log('\n===== 結果 =====');
        console.log('応答ステータス: 生成中');
        console.log('数秒後に再度実行してください');
        return null;
    }
})();