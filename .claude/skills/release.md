# Release — 提版发布流程

当用户要求 **提版 / 发版 / 发布新版本 / release / bump version** 时，使用此技能。

> 核心约定：**每次提版都必须同时完成「统一版本号」+「RELEASES.md 发布说明」两步**，缺一不可。GitHub Release 正文由 CI 从 RELEASES.md 按版本号自动提取。

## 流程总览

```
确认版本号 → bump-version.sh 统一更新 → 写入 RELEASES.md → 提交推送 release 分支 → CI 自动构建 + 提取发布说明 + 生成 GitHub Release
```

---

## 步骤

### 1. 确认版本号

- 用户未指定时，用 `git log v<上一版本>..HEAD --oneline` 列出自上一版本以来的提交，判断变更类型：
  - 含新功能 → 提升 **minor**（`1.0.1` → `1.1.0`）
  - 仅修复 / 优化 → 提升 **patch**（`1.0.1` → `1.0.2`）
  - 破坏性变更 → 提升 **major**（`1.0.1` → `2.0.0`）
- 向用户说明推断结果并确认后执行。

### 2. 统一更新版本号

```bash
bash scripts/bump-version.sh <版本号>
```

该脚本会同步更新 `package.json`、`src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml` 三处版本号。

### 3. 写入 RELEASES.md 发布说明

- 在文件**最顶部**、上一个版本标题之前插入 `## v<版本号>` 章节。
- 用 `git log v<上一版本>..HEAD --oneline` 整理本次变更，把 commit 描述改写为**面向用户**的简洁文案。
- 使用下方「章节模板」，按 commit 规范 emoji 归类到对应小节。
- 章节之间保留 `---` 分隔符；用不上的小节整行删除。
- ⚠️ 若原本有 `> 🚧 草稿 — 待提版确认` 这类占位行，发布前必须删除。

### 4. 提交并推送 release 分支

提交信息遵循 git-commit-convention（历史惯例为 `🔧 Test: 提版至 <版本号>`）：

```bash
git add -A
git commit -m "🔧 Test: 提版至 <版本号>"
git push origin release
```

推送 `release` 分支即触发 `.github/workflows/release.yml`。

### 5. 验证发布

- CI 流程：构建 macOS / Windows / Linux → 打 `v<版本号>` tag → 创建 GitHub Release。
- Release 正文由 `scripts/build-release-body.sh` 组装：
  1. 读取 `src-tauri/tauri.conf.json` 中的版本号；
  2. `scripts/extract-release-notes.sh` 从 `RELEASES.md` 按版本号提取对应章节；
  3. 组装为「版本标题 + 构建产物 + 更新内容」并作为 Release 正文。
- 若 RELEASES.md 缺少该版本章节，正文会自动回退为「暂无详细发布说明」，不会报错。

---

## RELEASES.md 章节模板

```markdown
## vX.Y.Z

### ✨ 新功能
- 新增……

### 🐛 Bug 修复
- 修复……

### 🍱 性能优化
- 优化……

### ⚡️ 其他
- 构建 / 依赖 / 文档等变更……
```

## 图标规范（与 git-commit-convention 一致）

| 图标 | 用途 |
|------|------|
| ✨ / ➕ | 新功能 |
| 🐛 / 🛠️ | Bug 修复 |
| 🍱 / ⚡️ | 性能优化 |
| 📝 | 文档 |
| ⚡️ | 构建 / 依赖 / 其他 |
| 🚀 / 💾 / 🎨 / 🖥️ | 按特性补充装饰性图标，让发布说明更直观 |

**美观度要求**：每个小节用图标标题；每条 bullet 以图标开头（装饰图标 + 空格 + 描述）；描述控制在 30 字以内，用户可读，不出现 commit hash。
