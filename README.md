# MagicSniffer

macOS 存储空间可视化分析工具 — 类似 Windows 上的 [SpaceSniffer](http://www.uderzo.it/main_products/space_sniffer/) 的磁盘空间统计器。

## 功能特性

- **📊 矩形树图可视化** — Squarified Treemap 算法展示磁盘空间分布，每个矩形代表一个文件或目录，大小与文件大小成正比
- **🔍 高性能搜索** — 使用 Rust 实现的并行文件搜索，支持正则表达式和大小过滤
- **🏷️ 智能文件分类** — 自动识别 macOS 系统中 13 种文件类型：系统文件、缓存、用户数据、Xcode 衍生数据、语言包等
- **⚠️ 删除风险评估** — 标注删除风险等级（高风险/中等/低风险/安全），提供详细说明和建议
- **⚡ 实时扫描进度** — 并发目录扫描，实时推送进度事件，可随时取消

## 技术栈

| 层级 | 技术 |
|------|------|
| 桌面框架 | Tauri 2.0 |
| 后端语言 | Rust (并发扫描、搜索引擎) |
| 前端框架 | React 19 + TypeScript |
| 构建工具 | Vite |
| 包管理器 | Bun |

## 环境要求

- **macOS** 10.15 或更高版本
- **Rust** 1.90+ (`rustup`)
- **Bun** 1.3+ (`curl -fsSL https://bun.sh/install | bash`)
- **Xcode Command Line Tools** (用于编译 Cargo native 依赖)

## 快速开始

```bash
# 安装依赖
bun install

# 开发模式（启动前端开发服务器 + Tauri 应用）
bun run tauri dev

# 仅构建前端
bun run build

# 构建 macOS 应用包
bun run tauri build
```

## 项目结构

```
MagicSniffer/
├── src/                        # React 前端源码
│   ├── App.tsx                 # 应用根组件
│   ├── main.tsx                # 应用入口
│   ├── components/
│   │   ├── Treemap.tsx         # Squarified Treemap 可视化组件
│   │   ├── Dashboard.tsx       # 仪表盘概览页
│   │   ├── SearchPanel.tsx     # 搜索面板组件
│   │   ├── CategoryLegend.tsx  # 分类图例组件
│   │   └── FileDetailPanel.tsx # 文件详情面板
│   ├── hooks/
│   │   └── useTauriCommand.ts  # Tauri IPC 调用封装
│   ├── types/
│   │   └── index.ts            # TypeScript 类型定义
│   └── styles/
│       └── index.css           # 暗色主题全局样式
├── src-tauri/                  # Tauri + Rust 后端
│   ├── src/
│   │   ├── main.rs             # 应用入口
│   │   ├── lib.rs              # Tauri 配置与命令注册
│   │   ├── models.rs           # 数据模型（前后端共享）
│   │   ├── scanner.rs          # 文件系统并发扫描器
│   │   ├── categorizer.rs      # macOS 文件分类器
│   │   ├── risk.rs             # 删除风险评估器
│   │   ├── search.rs           # 高性能搜索引擎
│   │   └── commands.rs         # Tauri IPC 命令处理
│   ├── Cargo.toml              # Rust 依赖配置
│   └── tauri.conf.json         # Tauri 应用配置
├── vite.config.ts              # Vite 构建配置
├── tsconfig.json               # TypeScript 配置
├── package.json                # Node.js 依赖
└── CLAUDE.md                   # Claude Code 指引
```

## 文件分类

| 分类 | 颜色 | 说明 | 删除风险 |
|------|------|------|----------|
| 系统文件 | 🔴 红色 | macOS 核心文件 | 高风险 |
| 系统缓存 | 🟠 橙色 | 系统缓存目录 | 低风险 |
| 用户缓存 | 🟢 绿色 | 应用缓存数据 | 低风险 |
| 用户数据 | 🔵 蓝色 | 用户个人文件 | 中等风险 |
| 应用程序 | 🟣 紫色 | 已安装的应用 | 高风险 |
| Xcode 衍生数据 | 🔴 深红 | Xcode 编译产物 | 低风险 |
| 临时文件 | 🩵 青色 | 临时目录 | 安全 |
| 日志文件 | 🟠 橙黄 | 系统和应用日志 | 安全 |
| 垃圾桶 | ⚫ 灰色 | 已删除文件 | 安全 |
| 下载文件 | 🔵 深蓝 | Downloads 目录 | 中等 |

## 开发注意事项

- 扫描器使用 `rayon` 进行多线程并行扫描，注意控制并发数
- macOS 沙盒应用访问 `~/Library` 等目录需要用户授权（通过原生文件选择对话框）
- Tauri 2.0 安全策略通过 `src-tauri/capabilities/` 目录中的权限文件控制
- 前端通过 `invoke()` 调用 Rust 命令，所有数据结构定义在 `src-tauri/src/models.rs`
