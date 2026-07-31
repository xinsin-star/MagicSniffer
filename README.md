# MagicSniffer

macOS 磁盘空间可视化分析工具，灵感来源于 [SpaceSniffer](http://www.uderzo.it/main_products/space_sniffer/)。基于 Tauri 2.0 + Rust + React 构建。

> [English version](README.en.md)

## 功能特性

- **矩形树图可视化** — Squarified Treemap 算法将磁盘空间渲染为面积比例的矩形，一眼定位空间占用大户。
- **高性能并发扫描** — Rayon 多线程并行扫描，实时进度推送到前端，支持断点续扫。
- **智能文件分类** — 自动识别 13 种文件类型：系统文件、系统缓存、用户缓存、用户数据、应用程序、临时文件、日志、下载、垃圾桶、Xcode 衍生数据、应用容器、语言包、其他。
- **删除风险评估** — 评估每个文件/目录的删除安全性（高风险/中等/低风险/安全），提供详细说明与建议。
- **高性能搜索** — Rust 实现的并行文件搜索，支持正则表达式和大小过滤。
- **物理磁盘健康度** — 以物理磁盘为单位的健康度面板，集成 smartmontools 获取 NVMe SMART 详细数据（温度、剩余备用块、已用寿命、通电时间、读写量、介质错误等）。
- **挂载点总览** — 完整的 APFS 卷枚举，甜甜圈图展示每卷用量、文件系统类型、可移动磁盘检测。
- **国际化** — 完整的中英文双语界面，语言切换通过 Zustand 持久化。
- **系统托盘** — 支持最小化到系统托盘，右键菜单支持双语切换。

## 技术栈

| 层级 | 技术 |
|------|------|
| 桌面框架 | Tauri 2.0 |
| 后端 | Rust (Rayon, Tokio, sysinfo, regex) |
| 前端 | React 19 + TypeScript |
| 状态管理 | Zustand |
| 图表 | ECharts |
| 样式 | Tailwind CSS 4 |
| 构建 | Vite + Bun |

## 环境要求

- **macOS** 10.15+（Apple Silicon 或 Intel）
- **Rust** 1.90+ — `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
- **Bun** 1.3+ — `curl -fsSL https://bun.sh/install | bash`
- **Xcode Command Line Tools** — `xcode-select --install`
- **smartmontools** *（可选）* — `brew install smartmontools` — 安装后解锁 NVMe SMART 详细健康数据

## 快速开始

```bash
# 安装依赖
bun install

# 开发模式（Vite + Tauri 热更新）
bun run tauri:dev

# 生产构建（生成 .app + .dmg）
bun run tauri:build

# 指定架构构建
bun run tauri:build:aarch64   # Apple Silicon
bun run tauri:build:x86_64    # Intel
```

## 脚本说明

| 脚本 | 说明 |
|------|------|
| `bun run dev` | 仅启动 Vite 前端开发服务器 |
| `bun run build` | 类型检查 + 构建前端 |
| `bun run tauri:dev` | 完整 Tauri 开发模式（前端 + Rust） |
| `bun run tauri:build` | 生产构建（本机架构） |
| `bun run tauri:build:debug` | 调试构建（含符号，编译更快） |
| `bun run tauri:build:aarch64` | 单独构建 Apple Silicon 包 |
| `bun run tauri:build:x86_64` | 单独构建 Intel 包 |
| `bun run tauri:build:dmg` | 仅打包 DMG |
| `bun run tauri:check` | Rust 语法快速检查（`cargo check`） |
| `bun run tauri:clippy` | Rust Lint 检查（`cargo clippy`） |
| `bun run bump-version 1.0.0` | 统一更新所有配置文件中的版本号 |

## 项目结构

```
MagicSniffer/
├── src/                          # React 前端
│   ├── App.tsx                   # 根组件，应用状态管理
│   ├── main.tsx                  # 入口
│   ├── components/
│   │   ├── Dashboard.tsx         # 首页：概览统计、磁盘健康度、挂载点
│   │   ├── Treemap.tsx           # Squarified Treemap 可视化 (SVG)
│   │   ├── DiskHealthPanel.tsx   # 物理磁盘健康度卡片 (NVMe SMART)
│   │   ├── DiskMountChart.tsx    # 挂载点甜甜圈图
│   │   ├── SearchPanel.tsx       # 文件搜索面板
│   │   ├── CategoryLegend.tsx    # 分类图例
│   │   ├── FileDetailPanel.tsx   # 文件详情 + 删除风险
│   │   └── SettingsModal.tsx     # 设置：语言、磁盘健康度状态
│   ├── hooks/
│   │   └── useTauriCommand.ts    # 类型化的 Tauri IPC 封装
│   ├── i18n/
│   │   ├── store/                # Zustand 语言状态
│   │   ├── locales/              # zh-CN.json / en.json
│   │   └── useTranslation.ts     # React 翻译 Hook
│   └── types/
│       └── index.ts              # TypeScript 类型定义
├── src-tauri/                    # Tauri + Rust 后端
│   ├── src/
│   │   ├── main.rs               # 入口
│   │   ├── lib.rs                # 应用初始化、托盘、命令注册
│   │   ├── commands.rs           # Tauri 命令处理（18 个命令）
│   │   ├── models.rs             # 前后端共享数据类型
│   │   ├── scanner.rs            # 并发文件扫描器 (Rayon)
│   │   ├── categorizer.rs        # macOS 文件分类器
│   │   ├── risk.rs               # 删除风险评估器
│   │   ├── search.rs             # 高性能搜索引擎
│   │   ├── cache.rs              # 扫描缓存持久化
│   │   ├── locale.rs             # 后端本地化字符串
│   │   └── scan_control.rs       # 扫描暂停/优先级控制
│   ├── Cargo.toml                # Rust 依赖
│   ├── tauri.conf.json           # Tauri 应用配置
│   └── capabilities/             # Tauri 2 权限模型
├── scripts/
│   └── bump-version.sh           # 统一版本号管理脚本
├── .github/workflows/
│   └── release.yml               # CI/CD：构建 + 打 Tag + GitHub Release
├── package.json
├── tsconfig.json
├── vite.config.ts
└── CLAUDE.md                     # Claude Code 指引
```

## 架构

```
┌──────────────────────────────────────────────────┐
│  React 前端 (TypeScript)                          │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────┐ │
│  │ Treemap   │ │ Dashboard│ │ DiskHealthPanel  │ │
│  └──────────┘ └──────────┘ └──────────────────┘ │
│         invoke("command", args)                   │
├──────────────────────────────────────────────────┤
│  Tauri IPC 桥接层                                 │
├──────────────────────────────────────────────────┤
│  Rust 后端                                        │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────┐ │
│  │ Scanner   │ │ Search   │ │ Health (smartctl) │ │
│  │ (Rayon)   │ │ (Regex)  │ │ + IOKit          │ │
│  └──────────┘ └──────────┘ └──────────────────┘ │
│  ┌──────────┐ ┌──────────┐                       │
│  │Categorizer│ │ Risk     │                       │
│  └──────────┘ └──────────┘                       │
└──────────────────────────────────────────────────┘
```

**核心设计决策：**
- Rayon（非 Tokio）做扫描 — work-stealing 更适合 CPU/IO 混合负载
- Treemap 用 React SVG 渲染 — 响应式交互（缩放、下钻）
- 文件搜索在 Rust 层执行 — 正则匹配原生速度
- macOS 文件分类基于路径规则 — 比 ML 方案更快更准确
- 挂载点枚举用 `getfsstat` (libc) — 捕获全部 APFS 卷，而非仅物理块设备
- SMART 数据用 `smartctl` + IOKit 回退 — 安装 smartmontools 后获取详细 NVMe 健康数据

## 后端命令

| 命令 | 说明 |
|------|------|
| `get_system_overview` | 系统存储概览（总量/已用/可用） |
| `validate_scan_path` | 校验并展开扫描路径 |
| `start_scan` | 启动/续扫文件系统 |
| `stop_scan` | 暂停扫描并保存断点 |
| `set_scan_priority` | 优先扫描子目录（下钻） |
| `quick_scan_known_dirs` | 快速预览已知大目录 |
| `search_files` | 搜索文件（正则 + 大小过滤） |
| `assess_delete_risk` | 评估单个路径删除风险 |
| `assess_batch_delete_risk` | 批量风险评估 |
| `reveal_in_file_manager` | 在 Finder/资源管理器中显示 |
| `get_disk_mounts` | 枚举全部挂载点及用量 |
| `get_physical_disk_health` | 物理磁盘健康度 + NVMe SMART |
| `check_smartctl` | 检查 smartmontools 是否安装 |
| `update_tray_menu` | 切换托盘菜单语言 |
| `load_latest_scan_cache` | 恢复最近扫描缓存 |
| `load_scan_cache` | 按路径加载扫描缓存 |
| `list_scan_caches` | 列出本地扫描缓存 |
| `clear_scan_cache` | 清除扫描缓存 |

## 文件分类

| 分类 | 颜色 | 说明 | 风险 |
|------|------|------|------|
| 系统文件 | 红色 | macOS 核心文件 | 高 |
| 系统缓存 | 橙色 | 系统缓存目录 | 低 |
| 用户缓存 | 绿色 | 应用缓存数据 | 低 |
| 用户数据 | 蓝色 | 个人文件 | 中 |
| 应用程序 | 紫色 | 已安装应用 | 高 |
| 临时文件 | 青色 | 临时目录 | 安全 |
| 日志文件 | 橙色 | 系统和应用日志 | 安全 |
| 下载文件 | 深蓝 | Downloads 目录 | 中 |
| 垃圾桶 | 灰色 | 已删除文件 | 安全 |
| Xcode 衍生数据 | 深红 | Xcode 编译产物 | 低 |
| 应用容器 | 紫罗兰 | 沙盒容器数据 | 中 |
| 语言包 | 墨绿 | 未使用的本地化文件 | 安全 |
| 其他 | 浅灰 | 未分类 | — |

## CI/CD

推送到 `release` 分支自动触发：

1. macOS 构建 — Apple Silicon + Intel 独立 DMG
2. Windows 构建 — MSI + NSIS 安装包
3. 从 `tauri.conf.json` 读取版本号打 Tag + 创建 GitHub Release

详见 `.github/workflows/release.yml`。

## 版本管理

```bash
# 一键更新所有配置文件中的版本号
bun run bump-version 1.0.0
```

同时更新 `package.json`、`src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml`。

## 开发注意事项

- 扫描器使用 `rayon` 多线程并行扫描 — 可通过 `RAYON_NUM_THREADS` 调整线程数
- macOS 沙盒访问 `~/Library` 等目录需用户通过原生文件对话框授权
- Tauri 2 基于 capability 的权限控制在 `src-tauri/capabilities/default.json`
- 前端通过 `invoke()` 调用 Rust 命令，所有数据结构定义在 `src-tauri/src/models.rs`
- `smartctl` 为可选依赖 — 安装后磁盘健康度面板显示 NVMe SMART 详细数据，未安装时降级显示 IOKit I/O 统计

## License

MIT
