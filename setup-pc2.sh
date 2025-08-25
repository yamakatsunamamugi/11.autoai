#!/bin/bash

# 2台目のパソコン用セットアップスクリプト
# 拡張機能ID: fphilbjcpglgablmlkffchdphbndehlg

echo "==================================="
echo "AutoAI Extension - PC2 Setup"
echo "==================================="
echo ""

# manifest.jsonを2台目用に設定
echo "Setting up manifest.json for PC2..."
cp manifest-pc2.json manifest.json

if [ $? -eq 0 ]; then
    echo "✅ manifest.json has been configured for PC2"
    echo ""
    echo "Extension ID: fphilbjcpglgablmlkffchdphbndehlg"
    echo "Client ID: 262291163420-kdnveh0r0b2q6o0sepv9j2ikbt04b1ig"
    echo ""
    echo "Next steps:"
    echo "1. Open Chrome and go to chrome://extensions/"
    echo "2. Click 'Reload' button for AutoAI Minimal"
    echo "3. Start using the extension!"
else
    echo "❌ Error: Failed to copy manifest-pc2.json"
    exit 1
fi