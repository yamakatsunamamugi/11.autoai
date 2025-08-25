#!/bin/bash

# 1台目のパソコン用セットアップスクリプト
# 拡張機能ID: bbbfjffpkfleplpoabeehglgikblfkip

echo "==================================="
echo "AutoAI Extension - PC1 Setup"
echo "==================================="
echo ""

# manifest.jsonを1台目用に設定
echo "Setting up manifest.json for PC1..."
cp manifest-pc1.json manifest.json

if [ $? -eq 0 ]; then
    echo "✅ manifest.json has been configured for PC1"
    echo ""
    echo "Extension ID: bbbfjffpkfleplpoabeehglgikblfkip"
    echo "Client ID: 262291163420-fj2jfie1cmb63md9nnu4ofdkr9ku1u3o"
    echo ""
    echo "Next steps:"
    echo "1. Open Chrome and go to chrome://extensions/"
    echo "2. Click 'Reload' button for AutoAI Minimal"
    echo "3. Start using the extension!"
else
    echo "❌ Error: Failed to copy manifest-pc1.json"
    exit 1
fi