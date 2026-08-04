//! TypeScript 类型定义 - 与 Rust 后端数据结构对应
//!
//! 这些类型与 src-tauri/src/models.rs 中的 Rust 结构体一一对应，
//! 用于前后端之间的数据传递

// ─── 文件/目录节点 ─────────────────────────────────────────────────────────────

/** 文件系统节点 - 对应 Rust 的 FileNode */
export interface FileNode {
  /** 文件/目录名称 */
  name: string;
  /** 完整路径 */
  path: string;
  /** 文件大小（字节） */
  size: number;
  /** 是否是目录 */
  is_dir: boolean;
  /** 文件分类 */
  category: FileCategory;
  /** 删除风险等级 */
  risk_level: RiskLevel;
  /** 子节点（仅目录有） */
  children?: FileNode[];
  /** 最后修改时间（Unix 时间戳） */
  modified_at: number;
  /** 文件扩展名 */
  extension?: string;
}

// ─── 文件分类 ───────────────────────────────────────────────────────────────────

/** 文件分类枚举 - 对应 Rust 的 FileCategory */
export type FileCategory =
  | "System"
  | "SystemCache"
  | "UserCache"
  | "UserData"
  | "Application"
  | "Temporary"
  | "Logs"
  | "Downloads"
  | "Trash"
  | "XcodeDerived"
  | "AppContainer"
  | "LanguagePack"
  | "Other";

/** 分类的显示信息（标签、颜色） */
export interface CategoryInfo {
  category: FileCategory;
  label: string;
  color: string;
}

/** 分类颜色映射（语言无关） */
export const CATEGORY_COLORS: Record<FileCategory, string> = {
  System: "#d17171",
  SystemCache: "#d4a574",
  UserCache: "#7cb798",
  UserData: "#6fa0c4",
  Application: "#89a07a",
  Temporary: "#6db3a8",
  Logs: "#c9985a",
  Downloads: "#6b93b8",
  Trash: "#9aa89c",
  XcodeDerived: "#c07a74",
  AppContainer: "#7f9bb0",
  LanguagePack: "#6fa08e",
  Other: "#b7c2b6",
};

/** @deprecated 使用 CATEGORY_COLORS + t(`categoryLabels.${category}`) 替代 */
export const CATEGORY_INFO: Record<FileCategory, CategoryInfo> = {
  System: { category: "System", label: "系统文件", color: "#d17171" },
  SystemCache: { category: "SystemCache", label: "系统缓存", color: "#d4a574" },
  UserCache: { category: "UserCache", label: "用户缓存", color: "#7cb798" },
  UserData: { category: "UserData", label: "用户数据", color: "#6fa0c4" },
  Application: { category: "Application", label: "应用程序", color: "#89a07a" },
  Temporary: { category: "Temporary", label: "临时文件", color: "#6db3a8" },
  Logs: { category: "Logs", label: "日志文件", color: "#c9985a" },
  Downloads: { category: "Downloads", label: "下载文件", color: "#6b93b8" },
  Trash: { category: "Trash", label: "垃圾桶", color: "#9aa89c" },
  XcodeDerived: { category: "XcodeDerived", label: "Xcode 衍生数据", color: "#c07a74" },
  AppContainer: { category: "AppContainer", label: "应用容器", color: "#7f9bb0" },
  LanguagePack: { category: "LanguagePack", label: "语言包", color: "#6fa08e" },
  Other: { category: "Other", label: "其他", color: "#b7c2b6" },
};

// ─── 风险等级 ───────────────────────────────────────────────────────────────────

/** 风险等级枚举 - 对应 Rust 的 RiskLevel */
export type RiskLevel = "High" | "Medium" | "Low" | "None";

/** 风险等级的显示信息 */
export interface RiskLevelInfo {
  level: RiskLevel;
  label: string;
  color: string;
}

/** 风险等级颜色映射（语言无关） */
export const RISK_LEVEL_COLORS: Record<RiskLevel, string> = {
  High: "#c45c5c",
  Medium: "#c9985a",
  Low: "#5f9e6e",
  None: "#88968c",
};

/** @deprecated 使用 RISK_LEVEL_COLORS + t(`riskLabels.${level}`) 替代 */
export const RISK_LEVEL_INFO: Record<RiskLevel, RiskLevelInfo> = {
  High: { level: "High", label: "高风险", color: "#c45c5c" },
  Medium: { level: "Medium", label: "中等风险", color: "#c9985a" },
  Low: { level: "Low", label: "低风险", color: "#5f9e6e" },
  None: { level: "None", label: "安全", color: "#88968c" },
};

// ─── 系统概览 ───────────────────────────────────────────────────────────────────

/** 系统存储概览 - 对应 Rust 的 SystemOverview */
export interface SystemOverview {
  /** 总容量（字节） */
  total_space: number;
  /** 已用空间（字节） */
  used_space: number;
  /** 可用空间（字节） */
  free_space: number;
  /** 各分类汇总 */
  category_summary: CategorySummary[];
  /** 大文件/目录排行 */
  top_consumers: FileNode[];
}

/** 分类汇总 - 对应 Rust 的 CategorySummary */
export interface CategorySummary {
  category: FileCategory;
  total_size: number;
  file_count: number;
  percentage: number;
}

// ─── 扫描 ───────────────────────────────────────────────────────────────────────

/** 扫描请求参数 - 对应 Rust 的 ScanRequest */
export interface ScanRequest {
  path: string;
  max_depth?: number;
  exclude_patterns: string[];
  min_file_size: number;
}

/** 扫描进度事件 - 对应 Rust 的 ScanProgress */
export interface ScanProgress {
  current_path: string;
  files_found: number;
  dirs_scanned: number;
  phase: string;
}

/** 边扫边预览事件 - 对应 Rust 的 ScanPreview */
export interface ScanPreview {
  root_node: FileNode;
  category_summary: CategorySummary[];
  files_found: number;
  dirs_scanned: number;
  completed_top_dirs: number;
  total_top_dirs: number;
}

/** 扫描结果 - 对应 Rust 的 ScanResult */
export interface ScanResult {
  root_path: string;
  root_node: FileNode;
  elapsed_ms: number;
  total_files: number;
  total_dirs: number;
  category_summary: CategorySummary[];
}

/** 磁盘持久化的扫描缓存 */
export interface CachedScan {
  version: number;
  cached_at: number;
  result: ScanResult;
  incomplete?: boolean;
  pending_paths?: string[];
  completed_paths?: string[];
  request?: ScanRequest | null;
  focus_path?: string | null;
}

/** 缓存列表摘要（不含完整树） */
export interface ScanCacheMeta {
  root_path: string;
  cached_at: number;
  total_size: number;
  total_files: number;
  total_dirs: number;
  elapsed_ms: number;
  incomplete?: boolean;
}

// ─── 磁盘挂载与健康度 ──────────────────────────────────────────────────────────

export interface SmartAttribute {
  key: string;
  raw_value: number;
  label?: string;
}

/** 单个磁盘挂载点信息（仅容量 + 挂载信息） */
export interface DiskMountInfo {
  mount_point: string;
  name: string;
  file_system: string;
  /** "SSD" / "HDD" / "Unknown" */
  kind: string;
  total_space: number;
  available_space: number;
  is_removable: boolean;
}

/** 物理磁盘 I/O 统计 */
export interface DiskIOStats {
  bytes_read: number;
  bytes_written: number;
  operations_read: number;
  operations_written: number;
  errors_read: number;
  errors_write: number;
}

/** NVMe SMART 详细健康数据 */
export interface NvmeSmartData {
  critical_warning: number;
  temperature_celsius: number;
  available_spare: number;
  available_spare_threshold: number;
  percentage_used: number;
  data_units_read_bytes: number;
  data_units_written_bytes: number;
  host_read_commands: number;
  host_write_commands: number;
  controller_busy_time: number;
  power_cycles: number;
  power_on_hours: number;
  unsafe_shutdowns: number;
  media_errors: number;
  error_log_entries: number;
}

/** smartctl 可用性检查结果 */
export interface SmartctlStatus {
  available: boolean;
  version?: string;
}

/** 物理磁盘上的卷引用 */
export interface DiskVolumeRef {
  mount_point: string;
  bsd_name: string;
  size: number;
  file_system: string;
}

/** 物理磁盘健康度信息 */
export interface PhysicalDiskHealth {
  device_id: string;
  model: string;
  serial?: string;
  firmware?: string;
  capacity: number;
  medium_type: string;
  protocol: string;
  smart_status?: string;
  is_internal: boolean;
  trim_support?: boolean;
  io_stats?: DiskIOStats;
  nvme_smart?: NvmeSmartData;
  volumes: DiskVolumeRef[];
}

// ─── 懒加载展开 ─────────────────────────────────────────────────────────────────

/** 展开目录请求 - 对应 Rust 的 ExpandNodeRequest */
export interface ExpandNodeRequest {
  path: string;
}

/** 展开目录响应 - 对应 Rust 的 ExpandNodeResponse */
export interface ExpandNodeResponse {
  /** 展开的目录路径 */
  path: string;
  /** 直接子节点列表（按大小降序，子目录 children 为空表示尚未展开） */
  children: FileNode[];
  /** 子项数量是否超过上限被截断 */
  truncated: boolean;
}

// ─── 搜索 ───────────────────────────────────────────────────────────────────────

/** 搜索请求参数 - 对应 Rust 的 SearchRequest */
export interface SearchRequest {
  query: string;
  root_path: string;
  use_regex: boolean;
  max_results: number;
  min_size: number;
  max_size: number;
}

/** 搜索结果项 - 对应 Rust 的 SearchResultItem */
export interface SearchResultItem {
  path: string;
  name: string;
  size: number;
  is_dir: boolean;
  category: FileCategory;
  risk_level: RiskLevel;
  modified_at: number;
}

/** 搜索结果 - 对应 Rust 的 SearchResult */
export interface SearchResult {
  items: SearchResultItem[];
  total_count: number;
  elapsed_ms: number;
}

// ─── 风险评估 ───────────────────────────────────────────────────────────────────

/** 风险评估详情 - 对应 Rust 的 RiskDetail */
export interface RiskDetail {
  path: string;
  name: string;
  risk_level: RiskLevel;
  explanation: string;
  recommendation: string;
}

/** 批量风险评估结果 - 对应 Rust 的 BatchRiskResult */
export interface BatchRiskResult {
  total_size: number;
  items: RiskDetail[];
  all_safe: boolean;
}

// ─── Treemap ─────────────────────────────────────────────────────────────────────

/** Treemap 布局节点 - 用于渲染矩形树图 */
export interface TreemapNode {
  /** 文件/目录名称 */
  name: string;
  /** 完整路径 */
  path: string;
  /** 大小 */
  size: number;
  /** 矩形在布局中的 x 坐标（百分比 0-100） */
  x: number;
  /** 矩形在布局中的 y 坐标（百分比 0-100） */
  y: number;
  /** 矩形宽度（百分比 0-100） */
  width: number;
  /** 矩形高度（百分比 0-100） */
  height: number;
  /** 颜色 */
  color: string;
  /** 分类 */
  category: FileCategory;
  /** 风险等级 */
  risk_level: RiskLevel;
  /** 是否是目录 */
  is_dir: boolean;
  /** 子节点 */
  children?: TreemapNode[];
}

// ─── 工具函数 ───────────────────────────────────────────────────────────────────

/** 格式化字节大小为人类可读字符串 */
export function formatSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const size = bytes / Math.pow(k, i);
  return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/** 格式化 Unix 时间戳为日期字符串 */
export function formatDate(timestamp: number, locale?: string): string {
  const date = new Date(timestamp * 1000);
  return date.toLocaleDateString(locale ?? "zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
