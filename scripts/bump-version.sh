#!/usr/bin/env bash
# 统一版本号管理脚本
# 用法: bash scripts/bump-version.sh 1.0.0

set -euo pipefail

VERSION="${1:-}"

if [ -z "$VERSION" ]; then
  echo "用法: bash scripts/bump-version.sh <版本号>"
  echo "示例: bash scripts/bump-version.sh 1.0.0"
  exit 1
fi

# 验证版本号格式 (semver)
if ! echo "$VERSION" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.]+)?(\+[a-zA-Z0-9.]+)?$'; then
  echo "错误: 版本号格式不正确，需要 semver 格式 (如 1.0.0, 1.0.0-beta.1)"
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
UPDATED=()

# ── package.json ──
sed -i '' 's/"version": "[^"]*"/"version": "'"$VERSION"'"/' "$ROOT/package.json" 2>/dev/null || \
  sed -i 's/"version": "[^"]*"/"version": "'"$VERSION"'"/' "$ROOT/package.json"
UPDATED+=("package.json")

# ── src-tauri/tauri.conf.json ──
sed -i '' 's/"version": "[^"]*"/"version": "'"$VERSION"'"/' "$ROOT/src-tauri/tauri.conf.json" 2>/dev/null || \
  sed -i 's/"version": "[^"]*"/"version": "'"$VERSION"'"/' "$ROOT/src-tauri/tauri.conf.json"
UPDATED+=("src-tauri/tauri.conf.json")

# ── src-tauri/Cargo.toml ──
sed -i '' 's/^version = "[^"]*"/version = "'"$VERSION"'"/' "$ROOT/src-tauri/Cargo.toml" 2>/dev/null || \
  sed -i 's/^version = "[^"]*"/version = "'"$VERSION"'"/' "$ROOT/src-tauri/Cargo.toml"
UPDATED+=("src-tauri/Cargo.toml")

echo ""
echo "✅ 版本号已统一更新为 $VERSION"
for f in "${UPDATED[@]}"; do
  echo "   → $f"
done
