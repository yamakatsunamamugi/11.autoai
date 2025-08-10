// Claude Response Extractor - Console Test Code
// Excludes thinking process ("Pondered..." button) from response

(async () => {
    'use strict';
    
    console.log('%c🔍 Claude Response Extractor', 'color: #FF6B6B; font-size: 16px; font-weight: bold');
    console.log('Searching for Claude response (excluding thinking process)...\n');
    
    try {
        // Find all Claude messages
        const claudeMessages = document.querySelectorAll('.font-claude-message');
        console.log(`Found ${claudeMessages.length} Claude messages`);
        
        if (claudeMessages.length === 0) {
            console.warn('No Claude messages found');
            return null;
        }
        
        // Get the last (most recent) message
        const lastMessage = claudeMessages[claudeMessages.length - 1];
        console.log('Processing most recent message...');
        
        // Clone the message to avoid modifying the DOM
        const messageClone = lastMessage.cloneNode(true);
        
        // Remove thinking process buttons
        const thinkingButtons = messageClone.querySelectorAll('button');
        let removedCount = 0;
        
        thinkingButtons.forEach(button => {
            const buttonText = button.textContent || '';
            // Check if this is a thinking process button
            if (buttonText.includes('Pondered') || 
                buttonText.includes('Thought') || 
                buttonText.includes('Considered') ||
                buttonText.includes('historical origins') ||
                button.classList.contains('thinking-button') ||
                button.querySelector('[class*="thinking"]')) {
                
                console.log(`  ❌ Removing thinking button: "${buttonText.substring(0, 50)}..."`);
                button.remove();
                removedCount++;
            }
        });
        
        // Also remove any elements with thinking-related classes
        const thinkingElements = messageClone.querySelectorAll('[class*="thinking"], [class*="pondered"]');
        thinkingElements.forEach(el => {
            console.log(`  ❌ Removing thinking element with class: ${el.className}`);
            el.remove();
            removedCount++;
        });
        
        console.log(`Removed ${removedCount} thinking process elements`);
        
        // Get the clean text
        const cleanText = messageClone.textContent?.trim() || '';
        
        if (cleanText) {
            console.log('%c✅ Response extracted successfully!', 'color: #4CAF50; font-weight: bold');
            console.log(`Response length: ${cleanText.length} characters`);
            console.log('\n--- RESPONSE TEXT ---');
            console.log(cleanText.substring(0, 500) + (cleanText.length > 500 ? '...' : ''));
            console.log('--- END RESPONSE ---\n');
            
            // Also copy to a variable for easy access
            window.claudeResponse = cleanText;
            console.log('💡 Full response stored in: window.claudeResponse');
            
            return cleanText;
        } else {
            console.warn('No text content found after filtering');
            return null;
        }
        
    } catch (error) {
        console.error('Error extracting response:', error);
        return null;
    }
})();