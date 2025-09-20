#!/bin/bash

# リリーススクリプト
# 使用方法: ./scripts/release.sh [patch|minor|major|prerelease]

set -e

# 色定義
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# バージョンタイプ
VERSION_TYPE=${1:-patch}

echo -e "${BLUE}🚀 11.autoai Release Script${NC}"
echo "================================"

# 現在のブランチを確認
CURRENT_BRANCH=$(git branch --show-current)
echo -e "Current branch: ${YELLOW}$CURRENT_BRANCH${NC}"

# mainブランチでない場合は警告
if [ "$CURRENT_BRANCH" != "main" ] && [ "$CURRENT_BRANCH" != "master" ]; then
    echo -e "${YELLOW}⚠️  Warning: Not on main branch${NC}"
    read -p "Continue anyway? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${RED}Release cancelled${NC}"
        exit 1
    fi
fi

# 未コミットの変更がないか確認
if ! git diff-index --quiet HEAD --; then
    echo -e "${RED}❌ Error: Uncommitted changes detected${NC}"
    echo "Please commit or stash your changes before releasing"
    exit 1
fi

# リモートと同期
echo -e "\n${BLUE}📥 Fetching latest changes...${NC}"
git fetch origin

# テスト実行
echo -e "\n${BLUE}🧪 Running tests...${NC}"
npm test || {
    echo -e "${RED}❌ Tests failed${NC}"
    exit 1
}

# リント実行
echo -e "\n${BLUE}🔍 Running lint...${NC}"
npm run lint || {
    echo -e "${RED}❌ Lint failed${NC}"
    exit 1
}

# 現在のバージョンを取得
CURRENT_VERSION=$(node -p "require('./package.json').version")
echo -e "\n${BLUE}📌 Current version: ${YELLOW}v$CURRENT_VERSION${NC}"

# 新しいバージョンを計算
echo -e "\n${BLUE}📝 Bumping version (${VERSION_TYPE})...${NC}"
npm version $VERSION_TYPE --no-git-tag-version

# 新しいバージョンを取得
NEW_VERSION=$(node -p "require('./package.json').version")
echo -e "${GREEN}✅ New version: v$NEW_VERSION${NC}"

# manifest.jsonのバージョンも更新
echo -e "\n${BLUE}📋 Updating manifest.json...${NC}"
node -e "
const fs = require('fs');
const manifest = JSON.parse(fs.readFileSync('./manifest.json', 'utf8'));
manifest.version = '$NEW_VERSION';
fs.writeFileSync('./manifest.json', JSON.stringify(manifest, null, 2) + '\\n');
console.log('✅ manifest.json updated');
"

# CHANGELOG生成
echo -e "\n${BLUE}📝 Generating CHANGELOG...${NC}"
cat > CHANGELOG_NEW.md << EOF
# v$NEW_VERSION - $(date +%Y-%m-%d)

## 🎉 What's New

EOF

# 最近のコミットから変更内容を抽出
git log v$CURRENT_VERSION..HEAD --pretty=format:"- %s" >> CHANGELOG_NEW.md

echo "" >> CHANGELOG_NEW.md
echo "" >> CHANGELOG_NEW.md

# 既存のCHANGELOGに追加
if [ -f CHANGELOG.md ]; then
    cat CHANGELOG.md >> CHANGELOG_NEW.md
    mv CHANGELOG_NEW.md CHANGELOG.md
else
    mv CHANGELOG_NEW.md CHANGELOG.md
fi

echo -e "${GREEN}✅ CHANGELOG updated${NC}"

# ビルド実行
echo -e "\n${BLUE}🔨 Building extension...${NC}"
NODE_ENV=production npm run build:prod || {
    echo -e "${RED}❌ Build failed${NC}"
    exit 1
}

# 変更をコミット
echo -e "\n${BLUE}💾 Committing changes...${NC}"
git add -A
git commit -m "chore(release): v$NEW_VERSION

- Update version to $NEW_VERSION
- Update CHANGELOG
- Build production assets

[skip ci]"

# タグを作成
echo -e "\n${BLUE}🏷️  Creating tag...${NC}"
git tag -a "v$NEW_VERSION" -m "Release v$NEW_VERSION

$(git log v$CURRENT_VERSION..HEAD --pretty=format:"- %s")"

echo -e "${GREEN}✅ Tag v$NEW_VERSION created${NC}"

# プッシュ確認
echo -e "\n${YELLOW}📤 Ready to push to remote${NC}"
echo "This will:"
echo "  1. Push commits to origin/$CURRENT_BRANCH"
echo "  2. Push tag v$NEW_VERSION"
echo "  3. Trigger GitHub Actions deployment"

read -p "Continue? (y/N): " -n 1 -r
echo

if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo -e "\n${BLUE}📤 Pushing to remote...${NC}"
    git push origin $CURRENT_BRANCH
    git push origin "v$NEW_VERSION"

    echo -e "\n${GREEN}✅ Release v$NEW_VERSION completed successfully!${NC}"
    echo ""
    echo "Next steps:"
    echo "  1. Check GitHub Actions: https://github.com/yamakatsunamamugi/11.autoai/actions"
    echo "  2. Verify Chrome Web Store submission"
    echo "  3. Create release notes on GitHub"
    echo ""
    echo -e "${BLUE}🎉 Congratulations on the release!${NC}"
else
    echo -e "${YELLOW}⚠️  Push cancelled. Changes are committed locally.${NC}"
    echo "To push manually:"
    echo "  git push origin $CURRENT_BRANCH"
    echo "  git push origin v$NEW_VERSION"
fi