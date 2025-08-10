// Claude応答待機と取得のテストコード
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
        
        // 思考プロセスボタンを削除
        const buttons = clone.querySelectorAll('button');
        let removedCount = 0;
        
        buttons.forEach(btn => {
            const text = btn.textContent || '';
            if (text.includes('Pondered') || 
                text.includes('Thought') || 
                text.includes('Considered')) {
                console.log(`削除: ${text.substring(0, 50)}...`);
                btn.remove();
                removedCount++;
            }
        });
        
        console.log(`削除した思考ボタン: ${removedCount}個`);
        
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
        return response;
    } else {
        console.log('\n===== 結果 =====');
        console.log('応答ステータス: 生成中');
        console.log('数秒後に再度実行してください');
        return null;
    }
})();