#!/bin/bash

# AutoAI 開発環境セットアップスクリプト
# 使用方法: ./scripts/setup.sh

set -e  # エラーが発生したら停止

# 色付き出力用の変数
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# ロゴ表示
echo "======================================"
echo "   AutoAI Development Setup"
echo "======================================"
echo ""

# 1. Node.jsバージョンチェック
echo -e "${YELLOW}Checking Node.js version...${NC}"
if ! command -v node &> /dev/null; then
    echo -e "${RED}Node.js is not installed. Please install Node.js 18 or higher.${NC}"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d 'v' -f 2 | cut -d '.' -f 1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo -e "${RED}Node.js version 18 or higher is required. Current version: $(node -v)${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Node.js $(node -v) detected${NC}"

# 2. ディレクトリ作成
echo -e "${YELLOW}Creating necessary directories...${NC}"
mkdir -p test
mkdir -p docs
mkdir -p backup_files
mkdir -p logs
mkdir -p config
echo -e "${GREEN}✓ Directories created${NC}"

# 3. 設定ファイルの確認
echo -e "${YELLOW}Checking configuration files...${NC}"
if [ ! -f "manifest.json" ]; then
    echo -e "${RED}manifest.json not found. This doesn't appear to be the project root.${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Configuration files found${NC}"

# 4. package.jsonの確認
echo -e "${YELLOW}Checking package.json...${NC}"
if [ ! -f "package.json" ]; then
    echo -e "${YELLOW}Creating package.json...${NC}"
    cat > package.json << 'EOF'
{
  "name": "autoai-chrome-extension",
  "version": "1.0.0",
  "description": "AI自動化Chrome拡張機能",
  "type": "module",
  "scripts": {
    "test": "node test/test-di-container.js"
  },
  "license": "MIT"
}
EOF
    echo -e "${GREEN}✓ package.json created${NC}"
else
    echo -e "${GREEN}✓ package.json exists${NC}"
fi

# 5. 依存関係のインストール（オプション）
echo -e "${YELLOW}Install npm dependencies? (y/n)${NC}"
read -r response
if [[ "$response" =~ ^([yY][eE][sS]|[yY])$ ]]; then
    echo -e "${YELLOW}Installing dependencies...${NC}"
    npm install
    echo -e "${GREEN}✓ Dependencies installed${NC}"
else
    echo -e "${YELLOW}Skipping dependency installation${NC}"
fi

# 6. .gitignoreの作成/更新
echo -e "${YELLOW}Setting up .gitignore...${NC}"
if [ ! -f ".gitignore" ]; then
    cat > .gitignore << 'EOF'
# Dependencies
node_modules/

# Logs
logs/
*.log

# Backup files
backup_files/
*.backup
*.bak

# OS files
.DS_Store
Thumbs.db

# IDE files
.vscode/
.idea/
*.swp
*.swo

# Test coverage
coverage/

# Environment files
.env
.env.local

# Build files
dist/
build/
EOF
    echo -e "${GREEN}✓ .gitignore created${NC}"
else
    echo -e "${GREEN}✓ .gitignore exists${NC}"
fi

# 7. テストの実行
echo -e "${YELLOW}Run tests? (y/n)${NC}"
read -r response
if [[ "$response" =~ ^([yY][eE][sS]|[yY])$ ]]; then
    echo -e "${YELLOW}Running tests...${NC}"
    if [ -f "test/test-di-container.js" ]; then
        node test/test-di-container.js
        echo -e "${GREEN}✓ Tests completed${NC}"
    else
        echo -e "${YELLOW}No tests found${NC}"
    fi
fi

# 8. Chrome拡張機能の検証
echo -e "${YELLOW}Validating Chrome extension...${NC}"
if [ -f "manifest.json" ] && [ -f "background.js" ] && [ -d "src" ]; then
    echo -e "${GREEN}✓ Chrome extension structure is valid${NC}"
else
    echo -e "${RED}Chrome extension structure is incomplete${NC}"
fi

# 9. 開発環境の情報表示
echo ""
echo "======================================"
echo -e "${GREEN}Setup Complete!${NC}"
echo "======================================"
echo ""
echo "Project Information:"
echo "- Node.js: $(node -v)"
echo "- npm: $(npm -v)"
echo "- Project: AutoAI Chrome Extension"
echo ""
echo "Next steps:"
echo "1. Open Chrome and navigate to chrome://extensions/"
echo "2. Enable Developer mode"
echo "3. Click 'Load unpacked' and select this directory"
echo "4. The extension should now be installed"
echo ""
echo "Available commands:"
echo "- npm test       : Run tests"
echo "- npm run lint   : Run linter (if configured)"
echo "- npm run format : Format code (if configured)"
echo ""
echo "Documentation:"
echo "- README.md                : Project overview"
echo "- docs/DI_CONTAINER_GUIDE.md : DI Container guide"
echo ""
echo -e "${GREEN}Happy coding! 🚀${NC}"