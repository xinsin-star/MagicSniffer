# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**MagicSniffer** — macOS 磁盘空间可视化分析工具，使用 Rust + Tauri 2.0 + React 技术栈构建。类似于 Windows 的 SpaceSniffer/WinDirStat，提供矩形树图（Squarified Treemap）可视化磁盘空间分布。

## Commands

### Frontend (Bun/Node)

```bash
# 安装依赖
bun install

# 启动前端开发服务器（端口 1420）
bun run dev

# 构建前端（输出到 dist/）
bun run build

# TypeScript 类型检查
npx tsc --noEmit
```

### Full App (Tauri)

```bash
# Tauri 开发模式（前端 + Rust 后端）
bun run tauri dev

# Tauri 构建 macOS 应用
bun run tauri build
```

### Rust Backend Only

```bash
cd src-tauri
cargo check       # 快速语法检查（不输出二进制）
cargo build       # 编译调试版本
cargo test        # 运行测试
cargo clippy      # Lint 检查
```

## Architecture

```
Frontend (React 19 + TS)          Backend (Rust + Tauri 2.0)
─────────────────────────         ─────────────────────────
src/                              src-tauri/src/
  App.tsx          ← IPC →         commands.rs    (Tauri command handlers)
  components/                      scanner.rs     (parallel file scanner)
    Treemap.tsx    (Squarified     search.rs      (parallel file search)
    Dashboard.tsx   Treemap)       categorizer.rs (path-based file classifier)
    SearchPanel.tsx                risk.rs        (deletion risk assessor)
    CategoryLegend.tsx             models.rs     (shared data types)
    FileDetailPanel.tsx            lib.rs        (app setup, plugin registration)
  hooks/                           main.rs       (entrypoint)
    useTauriCommand.ts
  types/index.ts
```

**Data flow**: Frontend calls `invoke("command_name", { args })` → Tauri routes to Rust `#[tauri::command]` async fn → returns JSON to frontend. Progress events flow Rust→Frontend via `app_handle.emit("scan-progress", data)`.

**Key design decisions**:

- Rayon (not Tokio) for parallel scanning — work-stealing better for mixed CPU/IO
- Treemap rendered in React (SVG) — allows responsive interaction
- File search runs in Rust for performance — regex matching at native speed
- macOS file categorization is path-rule-based — faster and more reliable than ML approaches

## Important Patterns

### Adding a new Tauri command

1. Define request/response types in `models.rs` with `Serialize`/`Deserialize`
2. Implement the handler in `commands.rs` with `#[tauri::command]`
3. Register in `lib.rs` via `generate_handler![]`
4. Add TypeScript types in `src/types/index.ts`
5. Add invoke wrapper in `src/hooks/useTauriCommand.ts`

### File categorization

The categorizer uses a hierarchical matching strategy (see `categorizer.rs`). To add a new category: add variant to `FileCategory` enum in `models.rs`, add path rules in `Categorizer::new()`, and add color/label in `CATEGORY_INFO` in `src/types/index.ts`.

### Treemap rendering

Uses SVG with 1000x1000 viewBox. Percentage-based coordinates are multiplied by 10. Rectangles smaller than 0.5% are skipped. Text labels rendered only if rect width > 40 and height > 25. Max recursion depth: 8.

### Permission model

Tauri 2.0 capability-based permissions in `src-tauri/capabilities/default.json`. Add required permissions there when using new Tauri plugins.

## Release 提版流程

当用户要求提版/发版/发布新版本时，必须遵循 `.claude/skills/release.md` 全流程：

1. 确认版本号（默认按 git log 变更类型推断 minor/patch/major）
2. `bash scripts/bump-version.sh <版本号>` 统一更新三处版本号
3. 在 `RELEASES.md` **最顶部**写入本次发布说明（图标模板见 skill）
4. 提交并推送 `release` 分支

CI（`.github/workflows/release.yml`）会自动按版本号从 `RELEASES.md` 提取发布说明作为 GitHub Release 正文。

## Git Commit Convention

所有 commit message 必须遵循以下格式：

```
<emoji> <type>: <subject>
```

| Emoji | Type     | 说明                             |
| ----- | -------- | -------------------------------- |
| ➕    | Feat     | 新功能、新特性                   |
| 🐛    | Bug      | Bug 修复                         |
| 🚧    | Fix      | 修复、修正问题                   |
| 🔨    | Refactor | 代码重构（不改变功能）           |
| 📝    | Docs     | 文档更新                         |
| ✨    | Style    | 代码风格、格式调整（不影响逻辑） |
| 🍱    | Perf     | 性能优化                         |
| 🔧    | Test     | 测试相关                         |
| ⚡️    | Chore    | 构建、依赖、工具配置等杂项       |

**格式要求**：

- Subject 使用中文或英文，简洁描述变更内容
- 不超过 72 个字符
- 不需要句号结尾
