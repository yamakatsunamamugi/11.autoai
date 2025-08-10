// Claude応答待機と取得のテストコード（思考プロセス除外修正版）
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
        
        // 思考プロセスコンテナ全体を削除
        // 「思考プロセス」というテキストを含むボタンの親要素を探す
        const allButtons = clone.querySelectorAll('button');
        let removedCount = 0;
        
        allButtons.forEach(btn => {
            const text = btn.textContent || '';
            if (text.includes('思考プロセス') || 
                text.includes('Pondered') || 
                text.includes('Thought') || 
                text.includes('Considered')) {
                
                // ボタンの親要素（思考プロセスコンテナ全体）を探す
                let parentToRemove = btn.parentElement;
                
                // 親要素を遡って、思考プロセスコンテナ全体を見つける
                // rounded-lgクラスまたはborder-0.5クラスを持つ親要素を探す
                while (parentToRemove && parentToRemove.parentElement) {
                    if (parentToRemove.classList.contains('rounded-lg') || 
                        parentToRemove.classList.contains('border-0.5') ||
                        parentToRemove.classList.contains('transition-all')) {
                        console.log(`削除: 思考プロセスコンテナ全体`);
                        parentToRemove.remove();
                        removedCount++;
                        break;
                    }
                    parentToRemove = parentToRemove.parentElement;
                }
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