#!/usr/bin/env bash
# 组装 GitHub Release 正文（构建产物说明 + 按版本号提取的发布说明）
# 用法: bash scripts/build-release-body.sh <版本号>
# 示例: bash scripts/build-release-body.sh 1.1.0

set -euo pipefail

VERSION="${1:-}"

if [ -z "$VERSION" ]; then
  echo "用法: bash scripts/build-release-body.sh <版本号>" >&2
  echo "示例: bash scripts/build-release-body.sh 1.1.0" >&2
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# 从 RELEASES.md 按版本号提取发布说明
NOTES="$(bash "$ROOT/scripts/extract-release-notes.sh" "$ROOT/RELEASES.md" "$VERSION" 2>/dev/null || true)"

if [ -z "$NOTES" ]; then
  NOTES="> 本次版本暂无详细发布说明，请参考仓库提交记录。"
fi

cat <<EOF
## 📦 MagicSniffer v$VERSION

### 🖥️ 构建产物

- \`MagicSniffer_${VERSION}_aarch64.dmg\` — macOS Apple Silicon（临时签名）
- \`MagicSniffer_${VERSION}_x64.dmg\` — macOS Intel（临时签名）
- \`MagicSniffer_${VERSION}_x64.msi\` — Windows 安装包
- \`magicsniffer_${VERSION}_amd64.AppImage\` — Linux AppImage
- \`magicsniffer_${VERSION}_amd64.deb\` — Linux DEB 包

> ⚠️ macOS 使用 ad-hoc 临时签名，首次打开如提示"无法验证开发者"，请在 Finder 中右键 App → 打开 即可运行。

---

### 📝 更新内容

${NOTES}
EOF
