//! 数据模型定义
//!
//! 定义了前后端通信使用的所有数据结构，包括：
//! - 文件/目录节点信息
//! - 扫描进度状态
//! - 搜索查询与结果
//! - 删除风险评估
//! - 文件分类与系统概览

use serde::{Deserialize, Serialize};

// ─── 文件节点 ───────────────────────────────────────────────────────────────────

/// 文件系统节点 - 表示扫描结果中的单个文件或目录
///
/// 采用树形结构组织，每个节点可以有子节点（目录）
/// 根节点挂载在 `/` 或用户选择的扫描路径下
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileNode {
    /// 文件/目录名称
    pub name: String,
    /// 完整路径
    pub path: String,
    /// 文件大小（字节），目录大小为其中所有文件的总和
    pub size: u64,
    /// 是否是目录
    pub is_dir: bool,
    /// 文件分类
    pub category: FileCategory,
    /// 删除风险等级
    pub risk_level: RiskLevel,
    /// 子节点（仅目录有）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub children: Option<Vec<FileNode>>,
    /// 最后修改时间（Unix 时间戳，秒）
    pub modified_at: i64,
    /// 文件扩展名（文件专用）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub extension: Option<String>,
}

// ─── 文件分类 ───────────────────────────────────────────────────────────────────

/// 文件分类 - 标识文件/目录在 macOS 中的用途
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub enum FileCategory {
    /// 系统文件 - macOS 系统核心文件，删除可能导致系统不稳定
    System,
    /// 系统缓存 - 可安全清理的系统缓存
    SystemCache,
    /// 用户缓存 - 应用程序缓存，通常可安全清理
    UserCache,
    /// 用户数据 - 用户个人文件（文档、图片等）
    UserData,
    /// 应用程序 - 安装的应用程序
    Application,
    /// 临时文件 - 可安全清理的临时文件
    Temporary,
    /// 日志文件 - 系统/应用日志
    Logs,
    /// 下载文件 - 用户下载的文件
    Downloads,
    /// 垃圾桶 - 已删除但未永久清除的文件
    Trash,
    /// Xcode 相关 - Xcode 衍生数据、归档等
    XcodeDerived,
    /// 容器/沙盒数据 - 应用的沙盒容器数据
    AppContainer,
    /// 语言包 - 可删除的本地化语言包
    LanguagePack,
    /// 其他 - 未分类的文件
    Other,
}

impl FileCategory {
    /// 获取分类的中文名称
    pub fn label(&self) -> &'static str {
        match self {
            FileCategory::System => "系统文件",
            FileCategory::SystemCache => "系统缓存",
            FileCategory::UserCache => "用户缓存",
            FileCategory::UserData => "用户数据",
            FileCategory::Application => "应用程序",
            FileCategory::Temporary => "临时文件",
            FileCategory::Logs => "日志文件",
            FileCategory::Downloads => "下载文件",
            FileCategory::Trash => "垃圾桶",
            FileCategory::XcodeDerived => "Xcode 衍生数据",
            FileCategory::AppContainer => "应用容器",
            FileCategory::LanguagePack => "语言包",
            FileCategory::Other => "其他",
        }
    }

    /// 获取分类对应的颜色（十六进制，用于前端渲染）
    pub fn color(&self) -> &'static str {
        match self {
            FileCategory::System => "#e74c3c",       // 红色 - 系统关键
            FileCategory::SystemCache => "#f39c12",  // 橙色 - 可清理系统
            FileCategory::UserCache => "#2ecc71",    // 绿色 - 安全清理
            FileCategory::UserData => "#3498db",     // 蓝色 - 用户数据
            FileCategory::Application => "#9b59b6",  // 紫色 - 应用
            FileCategory::Temporary => "#1abc9c",    // 青色 - 临时
            FileCategory::Logs => "#e67e22",         // 橙黄 - 日志
            FileCategory::Downloads => "#2980b9",    // 深蓝 - 下载
            FileCategory::Trash => "#7f8c8d",        // 灰色 - 垃圾桶
            FileCategory::XcodeDerived => "#c0392b", // 深红 - Xcode
            FileCategory::AppContainer => "#8e44ad", // 紫罗兰 - 容器
            FileCategory::LanguagePack => "#16a085", // 墨绿 - 语言包
            FileCategory::Other => "#bdc3c7",        // 浅灰 - 其他
        }
    }
}

// ─── 风险等级 ───────────────────────────────────────────────────────────────────

/// 删除风险等级
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum RiskLevel {
    /// 高风险 - 删除可能破坏系统或重要功能
    High,
    /// 中等风险 - 删除可能影响应用功能
    Medium,
    /// 低风险 - 可安全删除，不影响系统
    Low,
    /// 无风险 - 完全可安全删除
    None,
}

impl RiskLevel {
    /// 获取风险等级的中文描述
    pub fn label(&self) -> &'static str {
        match self {
            RiskLevel::High => "高风险",
            RiskLevel::Medium => "中等风险",
            RiskLevel::Low => "低风险",
            RiskLevel::None => "安全",
        }
    }
}

// ─── 系统概览 ───────────────────────────────────────────────────────────────────

/// 系统存储概览 - 整体存储空间状态
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemOverview {
    /// 总容量（字节）
    pub total_space: u64,
    /// 已用空间（字节）
    pub used_space: u64,
    /// 可用空间（字节）
    pub free_space: u64,
    /// 各分类的汇总统计
    pub category_summary: Vec<CategorySummary>,
    /// 需要关注的 Top 大文件/目录
    pub top_consumers: Vec<FileNode>,
}

/// 分类汇总统计
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CategorySummary {
    /// 分类
    pub category: FileCategory,
    /// 总计大小（字节）
    pub total_size: u64,
    /// 文件数量
    pub file_count: u64,
    /// 占总空间的百分比 (0-100)
    pub percentage: f64,
}

// ─── 扫描相关 ───────────────────────────────────────────────────────────────────

/// 扫描请求参数
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanRequest {
    /// 要扫描的路径
    pub path: String,
    /// 最大扫描深度（None = 不限制）
    pub max_depth: Option<u32>,
    /// 排除的路径模式
    pub exclude_patterns: Vec<String>,
    /// 最小文件大小（字节），跳过小于此值的文件
    pub min_file_size: u64,
}

/// 扫描进度事件 - 通过 Tauri 事件系统实时发送到前端
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanProgress {
    /// 当前正在扫描的路径
    pub current_path: String,
    /// 已发现的文件数
    pub files_found: u64,
    /// 已扫描的目录数
    pub dirs_scanned: u64,
    /// 扫描阶段描述
    pub phase: String,
}

/// 扫描过程中的增量预览 — MagicSniffer 风格「边扫边看」
///
/// 顶级子树每完成一棵（或进行中尺寸更新）就推送一次，
/// 前端据此即时刷新 Treemap，无需等待整盘扫描结束。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanPreview {
    /// 当前已汇总的根节点树（可能不完整）
    pub root_node: FileNode,
    /// 各分类汇总（基于已扫描部分）
    pub category_summary: Vec<CategorySummary>,
    /// 已发现的文件数
    pub files_found: u64,
    /// 已扫描的目录数
    pub dirs_scanned: u64,
    /// 已完成的顶级目录数
    pub completed_top_dirs: u32,
    /// 顶级目录总数
    pub total_top_dirs: u32,
}

/// 扫描结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanResult {
    /// 扫描的根路径
    pub root_path: String,
    /// 扫描的根节点树
    pub root_node: FileNode,
    /// 扫描耗时（毫秒）
    pub elapsed_ms: u64,
    /// 扫描的文件总数
    pub total_files: u64,
    /// 扫描的目录总数
    pub total_dirs: u64,
    /// 各分类汇总
    pub category_summary: Vec<CategorySummary>,
}

// ─── 扫描缓存 ───────────────────────────────────────────────────────────────────

/// 磁盘上持久化的扫描缓存条目
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CachedScan {
    /// 缓存格式版本
    pub version: u32,
    /// 缓存写入时间（Unix 秒）
    pub cached_at: i64,
    /// 扫描结果快照
    pub result: ScanResult,
    /// 是否未扫完（断点续扫）
    #[serde(default)]
    pub incomplete: bool,
    /// 尚未扫描的顶级目录路径
    #[serde(default)]
    pub pending_paths: Vec<String>,
    /// 已完成的顶级目录路径
    #[serde(default)]
    pub completed_paths: Vec<String>,
    /// 原始扫描请求（续扫用）
    #[serde(default)]
    pub request: Option<ScanRequest>,
    /// 暂停时的聚焦路径
    #[serde(default)]
    pub focus_path: Option<String>,
}

/// 缓存列表元信息（不含完整树，供首页展示）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanCacheMeta {
    /// 扫描根路径
    pub root_path: String,
    /// 缓存写入时间（Unix 秒）
    pub cached_at: i64,
    /// 根节点总大小
    pub total_size: u64,
    /// 文件数
    pub total_files: u64,
    /// 目录数
    pub total_dirs: u64,
    /// 扫描耗时（毫秒）
    pub elapsed_ms: u64,
    /// 是否未完成
    #[serde(default)]
    pub incomplete: bool,
}

// ─── 磁盘挂载与健康度 ───────────────────────────────────────────────────────────

/// 单个 SMART 属性键值对
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SmartAttribute {
    pub key: String,
    pub raw_value: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
}

/// 单个磁盘挂载点信息（仅容量 + 挂载信息，不包含健康度）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiskMountInfo {
    pub mount_point: String,
    pub name: String,
    pub file_system: String,
    /// "SSD" / "HDD" / "Unknown"
    pub kind: String,
    pub total_space: u64,
    pub available_space: u64,
    pub is_removable: bool,
}

// ─── 物理磁盘健康度 ─────────────────────────────────────────────────────────────

/// 物理磁盘 I/O 统计
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiskIOStats {
    pub bytes_read: u64,
    pub bytes_written: u64,
    pub operations_read: u64,
    pub operations_written: u64,
    pub errors_read: u64,
    pub errors_write: u64,
}

/// NVMe SMART 详细健康数据
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NvmeSmartData {
    /// 严重警告 (0 = 正常)
    pub critical_warning: u8,
    /// 当前温度 (摄氏度)
    pub temperature_celsius: u32,
    /// 剩余备用块百分比
    pub available_spare: u32,
    /// 备用块阈值百分比
    pub available_spare_threshold: u32,
    /// 已用寿命百分比
    pub percentage_used: u32,
    /// 读取数据量 (字节)
    pub data_units_read_bytes: u64,
    /// 写入数据量 (字节)
    pub data_units_written_bytes: u64,
    /// 主机读命令数
    pub host_read_commands: u64,
    /// 主机写命令数
    pub host_write_commands: u64,
    /// 控制器忙碌时间 (分钟)
    pub controller_busy_time: u64,
    /// 通电循环次数
    pub power_cycles: u64,
    /// 通电小时数
    pub power_on_hours: u64,
    /// 异常断电次数
    pub unsafe_shutdowns: u64,
    /// 介质与数据完整性错误
    pub media_errors: u64,
    /// 错误信息日志条目
    pub error_log_entries: u64,
}

/// smartctl 可用性检查结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SmartctlStatus {
    pub available: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
}

/// 物理磁盘上的卷引用
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiskVolumeRef {
    pub mount_point: String,
    pub bsd_name: String,
    pub size: u64,
    pub file_system: String,
}

/// 物理磁盘健康度信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PhysicalDiskHealth {
    /// BSD 名称，如 "disk0"
    pub device_id: String,
    /// 磁盘型号，如 "APPLE SSD AP0512Z"
    pub model: String,
    /// 序列号
    #[serde(skip_serializing_if = "Option::is_none")]
    pub serial: Option<String>,
    /// 固件版本
    #[serde(skip_serializing_if = "Option::is_none")]
    pub firmware: Option<String>,
    /// 物理容量（字节）
    pub capacity: u64,
    /// "SSD" / "HDD"
    pub medium_type: String,
    /// 接口协议，如 "Apple Fabric" / "PCI-Express" / "SATA"
    pub protocol: String,
    /// SMART 状态: "Verified" / "Failing" / None
    #[serde(skip_serializing_if = "Option::is_none")]
    pub smart_status: Option<String>,
    /// 是否内置磁盘
    pub is_internal: bool,
    /// 是否支持 TRIM
    #[serde(skip_serializing_if = "Option::is_none")]
    pub trim_support: Option<bool>,
    /// I/O 统计
    #[serde(skip_serializing_if = "Option::is_none")]
    pub io_stats: Option<DiskIOStats>,
    /// NVMe SMART 详细数据 (来自 smartctl)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub nvme_smart: Option<NvmeSmartData>,
    /// 该物理磁盘上的卷列表
    pub volumes: Vec<DiskVolumeRef>,
}

// ─── 搜索相关 ───────────────────────────────────────────────────────────────────

/// 搜索请求
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchRequest {
    /// 搜索关键词（支持正则表达式）
    pub query: String,
    /// 搜索根路径
    pub root_path: String,
    /// 是否使用正则表达式
    pub use_regex: bool,
    /// 结果数量上限
    pub max_results: u32,
    /// 最小文件大小过滤（字节），0=不限制
    pub min_size: u64,
    /// 最大文件大小过滤（字节），0=不限制
    pub max_size: u64,
}

/// 搜索结果项
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResultItem {
    /// 文件路径
    pub path: String,
    /// 文件名称
    pub name: String,
    /// 文件大小（字节）
    pub size: u64,
    /// 是否是目录
    pub is_dir: bool,
    /// 文件分类
    pub category: FileCategory,
    /// 删除风险等级
    pub risk_level: RiskLevel,
    /// 最后修改时间
    pub modified_at: i64,
}

/// 搜索结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    /// 搜索结果列表
    pub items: Vec<SearchResultItem>,
    /// 总结果数（受 max_results 限制）
    pub total_count: u32,
    /// 搜索耗时（毫秒）
    pub elapsed_ms: u64,
}

// ─── 风险详情 ───────────────────────────────────────────────────────────────────

/// 删除风险评估详情
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RiskDetail {
    /// 路径
    pub path: String,
    /// 名称
    pub name: String,
    /// 风险等级
    pub risk_level: RiskLevel,
    /// 风险说明
    pub explanation: String,
    /// 建议操作
    pub recommendation: String,
}

/// 批量风险评估结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatchRiskResult {
    /// 总大小（字节）
    pub total_size: u64,
    /// 风险详情列表
    pub items: Vec<RiskDetail>,
    /// 是否可以安全删除全部
    pub all_safe: bool,
}

// ─── 懒加载展开 ─────────────────────────────────────────────────────────────────

/// 展开目录请求 — 双击目录时按需加载该目录的直接子项
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExpandNodeRequest {
    /// 要展开的目录路径
    pub path: String,
}

/// 展开目录响应 — 该目录的直接子节点列表（每个子目录 children=None 表示尚未展开）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExpandNodeResponse {
    /// 展开的目录路径
    pub path: String,
    /// 直接子节点列表（按大小降序）
    pub children: Vec<FileNode>,
    /// 子项数量是否超过上限被截断
    pub truncated: bool,
}

// ─── 扫描快照与对比 ─────────────────────────────────────────────────────────────

/// 节点差异状态
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum DiffStatus {
    /// 🟢 增大
    Grown,
    /// 🔴 减小
    Shrunk,
    /// ⚪ 无变化
    Unchanged,
    /// 新增（旧快照中不存在）
    Added,
    /// 移除（旧快照中有，新快照中已消失）
    Removed,
}

/// 快照元信息（不含完整树，供列表与选择器展示）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SnapshotMeta {
    /// 快照 id（文件名字干 `{path_hash}_{timestamp}`）
    pub id: String,
    /// 扫描根路径
    pub root_path: String,
    /// 捕获时间（Unix 秒）
    pub captured_at: i64,
    /// 根节点总大小（字节）
    pub total_size: u64,
    /// 文件数
    pub total_files: u64,
    /// 目录数
    pub total_dirs: u64,
    /// 扫描耗时（毫秒）
    pub elapsed_ms: u64,
    /// 是否未完成
    #[serde(default)]
    pub incomplete: bool,
}

/// 磁盘上的快照条目 = 元信息 + 完整扫描结果
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SnapshotEntry {
    pub meta: SnapshotMeta,
    pub result: ScanResult,
}

/// 单个节点的差异（树形，与 FileNode 同构）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileNodeDiff {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub category: FileCategory,
    /// 基准（旧）大小
    pub old_size: u64,
    /// 目标（新）大小
    pub new_size: u64,
    /// 变化量（new - old，可正可负）
    pub delta: i64,
    /// 增长率（百分比）；old==0 时为 None
    pub growth_rate: Option<f64>,
    pub status: DiffStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub children: Option<Vec<FileNodeDiff>>,
}

/// 分类差异
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CategoryDiff {
    pub category: FileCategory,
    pub old_size: u64,
    pub new_size: u64,
    pub delta: i64,
    pub growth_rate: Option<f64>,
    pub status: DiffStatus,
}

/// 差异汇总统计（前端卡片用）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiffSummary {
    pub total_old_size: u64,
    pub total_new_size: u64,
    pub total_delta: i64,
    pub grown_count: u64,
    pub shrunk_count: u64,
    pub unchanged_count: u64,
    pub added_count: u64,
    pub removed_count: u64,
    /// 所有正 delta 之和
    pub grown_bytes: u64,
    /// 所有负 delta 绝对值之和
    pub shrunk_bytes: u64,
}

/// diff_snapshots 命令的完整响应
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SnapshotDiff {
    pub base: SnapshotMeta,
    pub target: SnapshotMeta,
    /// 对比后的根节点差异树
    pub root: FileNodeDiff,
    /// 分类差异（按 |delta| 降序）
    pub category_diff: Vec<CategoryDiff>,
    pub summary: DiffSummary,
}
