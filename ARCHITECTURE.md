# 架构设计文档

## 系统架构概览

```
┌──────────────────────────────────────────────────────┐
│                    前端层 (React + TypeScript)         │
│                                                      │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐│
│  │Dashboard │ │ Treemap  │ │  Search  │ │  Detail  ││
│  │  面板    │ │  可视化   │ │  搜索面板 │ │  详情面板 ││
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘│
│                       │                              │
│              useTauriCommand.ts                       │
│              (invoke IPC 封装)                        │
├───────────────────────┼──────────────────────────────┤
│                  Tauri Bridge                         │
│                  (IPC + Events)                       │
├──────────────────────────────────────────────────────┤
│                    后端层 (Rust)                       │
│                                                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐           │
│  │ Scanner  │  │  Search  │  │  Risk    │           │
│  │ 并发扫描  │  │ 并行搜索  │  │ 风险评估  │           │
│  └────┬─────┘  └──────────┘  └────┬─────┘           │
│       │                           │                  │
│  ┌────┴─────┐              ┌──────┴──────┐           │
│  │Categorizer│              │   models.rs  │          │
│  │ 文件分类  │              │  数据模型    │          │
│  └──────────┘              └─────────────┘          │
│                                                      │
│                    文件系统                           │
└──────────────────────────────────────────────────────┘
```

## 核心模块设计

### 1. 扫描器 (Scanner)

**文件**: `src-tauri/src/scanner.rs`

使用 `rayon` 的 `par_iter()` 实现并行递归遍历：

```
扫描请求 → 根目录扫描
               ├── 并发读取子条目 (rayon::par_iter)
               ├── 文件: 计算大小、分类、风险评估
               ├── 目录: 递归扫描（深度限制）
               └── 每 50 个目录发送进度事件
                        ↓
                    文件树 (FileNode) + 分类汇总
```

**性能优化**：
- 跳过多余的符号链接防止循环
- 可配置的最小文件大小过滤
- 可配置的路径排除模式
- 原子计数器跟踪跨线程进度

### 2. 文件分类器 (Categorizer)

**文件**: `src-tauri/src/categorizer.rs`

基于路径规则的分级匹配策略：

1. 检查是否为 macOS 系统目录（`/System`、`/usr`、`/bin` 等）
2. 检查是否为已知缓存目录（`~/Library/Caches`、`/Library/Caches`）
3. 检查临时目录、日志目录、垃圾桶
4. Xcode 特定目录识别（DerivedData、Archives、iOS DeviceSupport）
5. 应用容器识别（Containers、Group Containers）
6. 语言包识别（`.lproj`、`.strings` 文件）
7. 默认分类为 "其他"

### 3. 搜索引擎 (SearchEngine)

**文件**: `src-tauri/src/search.rs`

并行搜索架构：
- 目录级别并行（`rayon::par_iter`）处理子文件
- 支持简单子串匹配和正则表达式
- 原子结果计数器 + 提前退出机制（达到上限后停止搜索）
- 最大递归深度限制（30 层）

### 4. 风险评估器 (RiskAssessor)

**文件**: `src-tauri/src/risk.rs`

基于分类的评估策略：
- 系统文件 → 高风险（除非是已知安全缓存）
- 缓存文件 → 低/中等风险
- 临时/日志 → 无风险
- 用户数据 → 中等风险
- 每个分类有详细的中文风险说明和操作建议

### 5. Squarified Treemap 算法

**文件**: `src/components/Treemap.tsx`

实现 Bruls, Huizing, van Wijk (2000) 的 Squarified Treemap 算法：

```
输入: FileNode 树
  ↓
过滤零大小节点 → 按大小降序排列
  ↓
squarify() 递归布局:
  - 逐项添加到当前行
  - 计算行内矩形长宽比
  - 长宽比恶化时换行
  - 交替水平/垂直分割
  ↓
递归处理子目录（最大深度 8 层）
  ↓
SVG 渲染（1000x1000 视口）
```

## 数据流

### 扫描流程

```
用户点击"扫描" → startScan(request) [Tauri Command]
    ↓
Scanner::scan() 创建扫描
    ↓ (实时)
emit("scan-progress") → 前端 onScanProgress() 更新进度条
    ↓ (完成)
返回 ScanResult { root_node, category_summary }
    ↓
前端展示 Treemap + 分类图例
```

### 搜索流程

```
用户输入查询 → searchFiles(request) [Tauri Command]
    ↓
SearchEngine::search() 并行遍历
    ↓
返回 SearchResult { items, total_count, elapsed_ms }
    ↓
前端显示搜索结果列表
```

### 风险评估流程

```
用户点击文件 → assessDeleteRisk(path) [Tauri Command]
    ↓
Categorizer::categorize() → RiskAssessor::assess()
    ↓
返回 RiskDetail { risk_level, explanation, recommendation }
    ↓
前端显示风险详情面板
```

## 设计决策

1. **为什么 Rayon 而不是 Tokio** — 文件扫描是 CPU 和 I/O 密集型混合任务，rayon 的 work-stealing 调度器对 CPU 密集型更友好；tokio 用于 Tauri 命令的异步层

2. **为什么在 Rust 端做搜索** — 文件系统搜索需要大量 I/O 操作，在 Rust 端并行化比 JavaScript 更高效；搜索结果直接返回给前端，避免数据传输瓶颈

3. **Treemap 为什么在前端实现** — 布局算法纯计算无 I/O，前端实现可保持响应式交互；1000x1000 SVG 视口保证清晰度

4. **分类系统为什么硬编码** — macOS 文件系统布局相对固定，硬编码比机器学习方案更快速可靠

5. **前端全量展示** — 第一次扫描会展示完整结果，大目录选择后再深度分析（渐进式扫描策略）

## macOS 特定考量

- **安全作用域书签** (Security-Scoped Bookmarks): 访问用户选择的目录需要保存书签（后续迭代）
- **完全磁盘访问** (Full Disk Access): 访问 `~/Library` 等受保护目录需要用户在系统偏好设置中授权
- **APFS 特性**: 克隆文件和快照不占用额外空间，但 `fs::metadata().len()` 可能报告不准确的大小
