# MagicSniffer

A macOS disk space visualization tool inspired by [SpaceSniffer](http://www.uderzo.it/main_products/space_sniffer/). Built with Tauri 2.0, Rust, and React.

> [中文文档](README.md)

## Features

- **Treemap Visualization** — Squarified Treemap algorithm renders disk space as proportional rectangles, making it easy to spot space hogs at a glance.
- **High-Performance Scanning** — Multi-threaded parallel directory scanning powered by Rayon, with real-time progress streaming to the frontend. Supports checkpoint/resume for interrupted scans.
- **File Categorization** — Automatically classifies files into 13 categories: System, System Cache, User Cache, User Data, Applications, Temporary, Logs, Downloads, Trash, Xcode Derived Data, App Containers, Language Packs, and Other.
- **Deletion Risk Assessment** — Evaluates each file/directory for deletion safety (High / Medium / Low / Safe), with detailed explanations and recommendations.
- **High-Performance Search** — Rust-powered parallel file search with regex support and size filtering.
- **Physical Disk Health** — Per-physical-disk health dashboard with NVMe SMART data (temperature, available spare, percentage used, power-on hours, data read/written, media errors, etc.) via smartmontools integration.
- **Mount Points Overview** — Complete APFS volume enumeration with donut charts showing per-volume usage, filesystem type, and removable drive detection.
- **i18n** — Full Chinese (zh-CN) and English (en) localization, with language switching persisted via Zustand.
- **System Tray** — Minimize to system tray with quick-access menu in both languages.

## Screenshots

> TODO

## Tech Stack

| Layer             | Technology                          |
| ----------------- | ----------------------------------- |
| Desktop Framework | Tauri 2.0                           |
| Backend           | Rust (Rayon, Tokio, sysinfo, regex) |
| Frontend          | React 19 + TypeScript               |
| State Management  | Zustand                             |
| Charts            | ECharts                             |
| Styling           | Tailwind CSS 4                      |
| Bundle            | Vite + Bun                          |

## Prerequisites

- **macOS** 10.15+ (Apple Silicon or Intel)
- **Rust** 1.90+ — `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
- **Bun** 1.3+ — `curl -fsSL https://bun.sh/install | bash`
- **Xcode Command Line Tools** — `xcode-select --install`
- **smartmontools** _(optional)_ — `brew install smartmontools` — enables detailed NVMe SMART health data

## Quick Start

```bash
# Install dependencies
bun install

# Development mode (Vite + Tauri hot-reload)
bun run tauri:dev

# Production build (native .app + .dmg)
bun run tauri:build

# Build for specific architecture
bun run tauri:build:aarch64   # Apple Silicon
bun run tauri:build:x86_64    # Intel
```

## Scripts

| Script                        | Description                            |
| ----------------------------- | -------------------------------------- |
| `bun run dev`                 | Vite frontend dev server only          |
| `bun run build`               | Type-check + build frontend            |
| `bun run tauri:dev`           | Full Tauri dev mode (frontend + Rust)  |
| `bun run tauri:build`         | Production build (native architecture) |
| `bun run tauri:build:debug`   | Debug build with symbols               |
| `bun run tauri:build:aarch64` | Build for Apple Silicon                |
| `bun run tauri:build:x86_64`  | Build for Intel                        |
| `bun run tauri:build:dmg`     | Build DMG bundle only                  |
| `bun run tauri:check`         | Fast Rust syntax check (`cargo check`) |
| `bun run tauri:clippy`        | Rust lint check (`cargo clippy`)       |
| `bun run bump-version 1.0.0`  | Update version in all config files     |

## Project Structure

```
MagicSniffer/
├── src/                          # React frontend
│   ├── App.tsx                   # Root component, state management
│   ├── main.tsx                  # Entry point
│   ├── components/
│   │   ├── Dashboard.tsx         # Home page: stats, disk health, mount points
│   │   ├── Treemap.tsx           # Squarified Treemap visualization (SVG)
│   │   ├── DiskHealthPanel.tsx   # Physical disk health cards (NVMe SMART)
│   │   ├── DiskMountChart.tsx    # Mount point donut charts
│   │   ├── SearchPanel.tsx       # File search interface
│   │   ├── CategoryLegend.tsx    # Category color legend
│   │   ├── FileDetailPanel.tsx   # File detail + deletion risk panel
│   │   └── SettingsModal.tsx     # Language & disk health settings
│   ├── hooks/
│   │   └── useTauriCommand.ts    # Typed Tauri IPC wrappers
│   ├── i18n/
│   │   ├── store/                # Zustand locale store
│   │   ├── locales/              # zh-CN.json / en.json
│   │   └── useTranslation.ts     # React translation hook
│   └── types/
│       └── index.ts              # TypeScript interfaces
├── src-tauri/                    # Tauri + Rust backend
│   ├── src/
│   │   ├── main.rs               # Entry point
│   │   ├── lib.rs                # App setup, tray, command registration
│   │   ├── commands.rs           # Tauri command handlers (14 commands)
│   │   ├── models.rs             # Shared data types
│   │   ├── scanner.rs            # Parallel file scanner (Rayon)
│   │   ├── categorizer.rs        # macOS file classifier
│   │   ├── risk.rs               # Deletion risk assessor
│   │   ├── search.rs             # High-performance search engine
│   │   ├── cache.rs              # Scan cache persistence
│   │   ├── locale.rs             # Backend i18n strings
│   │   └── scan_control.rs       # Scan pause/priority control
│   ├── Cargo.toml                # Rust dependencies
│   ├── tauri.conf.json           # Tauri app config
│   └── capabilities/             # Tauri 2 permission model
├── scripts/
│   └── bump-version.sh           # Unified version management
├── .github/workflows/
│   └── release.yml               # CI/CD: build + tag + GitHub Release
├── package.json
├── tsconfig.json
├── vite.config.ts
└── CLAUDE.md                     # Claude Code guidance
```

## Architecture

```
┌──────────────────────────────────────────────────┐
│  React Frontend (TypeScript)                     │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────┐ │
│  │ Treemap   │ │ Dashboard│ │ DiskHealthPanel  │ │
│  └──────────┘ └──────────┘ └──────────────────┘ │
│         invoke("command", args)                   │
├──────────────────────────────────────────────────┤
│  Tauri IPC Bridge                                │
├──────────────────────────────────────────────────┤
│  Rust Backend                                    │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────┐ │
│  │ Scanner   │ │ Search   │ │ Health (smartctl) │ │
│  │ (Rayon)   │ │ (Regex)  │ │ + IOKit + sysprof│ │
│  └──────────┘ └──────────┘ └──────────────────┘ │
│  ┌──────────┐ ┌──────────┐                       │
│  │ Categorizer│ │ Risk     │                      │
│  └──────────┘ └──────────┘                       │
└──────────────────────────────────────────────────┘
```

**Key design decisions:**

- Rayon (not Tokio) for scanning — work-stealing is better for mixed CPU/IO workloads
- Treemap rendered as React SVG — responsive and interactive (zoom, drill-down)
- File search runs in Rust — regex matching at native speed
- macOS file categorization is path-rule-based — faster and more reliable than ML approaches
- Disk mount enumeration uses `getfsstat` (libc) — captures all APFS volumes, not just physical block devices
- SMART data via `smartctl` + IOKit fallback — detailed NVMe health when smartmontools is installed

## Backend Commands

| Command                    | Description                               |
| -------------------------- | ----------------------------------------- |
| `get_system_overview`      | System storage overview (total/used/free) |
| `validate_scan_path`       | Validate and expand scan path             |
| `start_scan`               | Start/resume filesystem scan              |
| `stop_scan`                | Pause scan with checkpoint                |
| `set_scan_priority`        | Prioritize a subdirectory during scan     |
| `quick_scan_known_dirs`    | Fast preview of known large directories   |
| `search_files`             | Search files with regex + size filter     |
| `assess_delete_risk`       | Evaluate deletion risk for a path         |
| `assess_batch_delete_risk` | Batch risk assessment                     |
| `reveal_in_file_manager`   | Show path in Finder/Explorer              |
| `get_disk_mounts`          | Enumerate all mount points with usage     |
| `get_physical_disk_health` | Physical disk health + NVMe SMART data    |
| `check_smartctl`           | Check if smartmontools is installed       |
| `update_tray_menu`         | Update system tray menu language          |
| `load_latest_scan_cache`   | Restore last scan result                  |
| `load_scan_cache`          | Load scan cache by root path              |
| `list_scan_caches`         | List saved scan caches                    |
| `clear_scan_cache`         | Clear scan cache(s)                       |

## File Categories

| Category      | Color      | Description               | Risk   |
| ------------- | ---------- | ------------------------- | ------ |
| System        | Red        | macOS core files          | High   |
| System Cache  | Orange     | System cache directories  | Low    |
| User Cache    | Green      | App cache data            | Low    |
| User Data     | Blue       | Personal files            | Medium |
| Application   | Purple     | Installed apps            | High   |
| Temporary     | Cyan       | Temp directories          | Safe   |
| Logs          | Orange     | System & app logs         | Safe   |
| Downloads     | Deep Blue  | Downloads folder          | Medium |
| Trash         | Gray       | Deleted files             | Safe   |
| Xcode Derived | Deep Red   | Xcode build artifacts     | Low    |
| App Container | Violet     | Sandbox container data    | Medium |
| Language Pack | Teal       | Unused localization files | Safe   |
| Other         | Light Gray | Uncategorized             | —      |

## CI/CD

Push to the `release` branch triggers:

1. macOS build — Apple Silicon + Intel DMG (unsigned)
2. Windows build — MSI + NSIS installer
3. Version tag from `tauri.conf.json` + GitHub Release with artifacts

See `.github/workflows/release.yml` for details.

## Version Management

```bash
# Update version in all config files at once
bun run bump-version 1.0.0
```

This updates `package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml` simultaneously.

## Development Notes

- The scanner uses `rayon` for multi-threaded parallel scanning — tune thread count via `RAYON_NUM_THREADS`
- macOS sandbox access to `~/Library` etc. requires user authorization via native file dialog
- Tauri 2 capability-based permissions are in `src-tauri/capabilities/default.json`
- Frontend calls Rust via `invoke()`, all data structs defined in `src-tauri/src/models.rs`
- `smartctl` is optional — when installed, NVMe SMART details appear in the Disk Health panel. Without it, basic I/O statistics from IOKit are shown instead.

## License

MIT
