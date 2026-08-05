#!/usr/bin/env bash
# 按版本号从 RELEASES.md 中提取发布说明
# 用法: bash scripts/extract-release-notes.sh <RELEASES.md 路径> <版本号>
# 示例: bash scripts/extract-release-notes.sh RELEASES.md 1.1.0
#       bash scripts/extract-release-notes.sh RELEASES.md v1.1.0

set -euo pipefail

FILE="${1:-}"
RAW_VERSION="${2:-}"

if [ -z "$FILE" ] || [ -z "$RAW_VERSION" ]; then
  echo "用法: bash scripts/extract-release-notes.sh <RELEASES.md 路径> <版本号>" >&2
  echo "示例: bash scripts/extract-release-notes.sh RELEASES.md v1.1.0" >&2
  exit 1
fi

if [ ! -f "$FILE" ]; then
  echo "错误: 文件 $FILE 不存在" >&2
  exit 1
fi

# 兼容 "1.1.0" 与 "v1.1.0" 两种写法
VERSION="$RAW_VERSION"
case "$VERSION" in
  v*) ;;
  *) VERSION="v$VERSION" ;;
esac

# 提取 "## vX.Y.Z" 章节内容：
#   1. 命中精确标题后开始捕获
#   2. 遇到下一个 "# " / "## " 标题或 "---" 分隔符时停止
#   3. 去除首尾空行（保留章节内部空行）
awk -v heading="## $VERSION" '
  $0 == heading { capture = 1; next }
  capture && (/^# / || /^## / || /^---+$/) { capture = 0 }
  capture { lines[++n] = $0 }
  END {
    # 去除尾部空行
    while (n > 0 && lines[n] ~ /^[[:space:]]*$/) n--
    # 去除头部空行
    start = 1
    while (start <= n && lines[start] ~ /^[[:space:]]*$/) start++
    for (i = start; i <= n; i++) print lines[i]
  }
' "$FILE"
