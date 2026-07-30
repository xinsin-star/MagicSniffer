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
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
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
