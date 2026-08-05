//! Tauri 命令封装 Hook
//!
//! 封装对 Tauri 后端 IPC 的调用，提供类型安全的前端接口

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  SystemOverview,
  ScanRequest,
  ScanProgress,
  ScanPreview,
  CachedScan,
  ScanCacheMeta,
  SearchRequest,
  SearchResult,
  RiskDetail,
  BatchRiskResult,
  DiskMountInfo,
  PhysicalDiskHealth,
  SmartctlStatus,
  ExpandNodeResponse,
  SnapshotMeta,
  SnapshotDiff,
} from "../types";

/**
 * 获取系统存储概览信息
 * 调用 Rust 后端的 get_system_overview 命令
 */
export async function getSystemOverview(lang?: string): Promise<SystemOverview> {
  return invoke<SystemOverview>("get_system_overview", { lang: lang ?? null });
}

/**
 * 校验扫描路径是否存在且为目录（展开 `~`）
 * 成功返回展开后的绝对路径
 */
export async function validateScanPath(path: string, lang?: string): Promise<string> {
  return invoke<string>("validate_scan_path", { path, lang: lang ?? null });
}

/**
 * 启动文件系统扫描
 * 返回 CachedScan（含 incomplete 断点信息）
 */
export async function startScan(
  request: ScanRequest,
  resume = false
): Promise<CachedScan> {
  return invoke<CachedScan>("start_scan", { request, resume });
}

/** 设置扫描优先级路径（下钻时优先扫该目录） */
export async function setScanPriority(path: string | null): Promise<void> {
  return invoke("set_scan_priority", { path });
}

/** 停止当前扫描（保存断点） */
export async function stopScan(): Promise<void> {
  return invoke("stop_scan");
}

/** 加载最近一次扫描缓存 */
export async function loadLatestScanCache(): Promise<CachedScan | null> {
  return invoke<CachedScan | null>("load_latest_scan_cache");
}

/** 按路径加载扫描缓存 */
export async function loadScanCache(rootPath: string): Promise<CachedScan | null> {
  return invoke<CachedScan | null>("load_scan_cache", { rootPath });
}

/** 列出本地扫描缓存摘要 */
export async function listScanCaches(): Promise<ScanCacheMeta[]> {
  return invoke<ScanCacheMeta[]>("list_scan_caches");
}

/** 清除扫描缓存；不传则清空全部 */
export async function clearScanCache(rootPath?: string): Promise<void> {
  return invoke("clear_scan_cache", { rootPath: rootPath ?? null });
}

/** 列出所有扫描快照元信息 */
export async function listSnapshots(): Promise<SnapshotMeta[]> {
  return invoke<SnapshotMeta[]>("list_snapshots");
}

/** 删除指定扫描快照 */
export async function deleteSnapshot(id: string): Promise<void> {
  return invoke("delete_snapshot", { id });
}

/** 对比两个扫描快照（base 为基准/旧，target 为目标/新） */
export async function diffSnapshots(baseId: string, targetId: string): Promise<SnapshotDiff> {
  return invoke<SnapshotDiff>("diff_snapshots", { baseId, targetId });
}

/**
 * 快速扫描已知大目录
 */
export async function quickScanKnownDirs() {
  return invoke("quick_scan_known_dirs");
}

/**
 * 搜索文件
 * 调用 Rust 后端的 search_files 命令（高性能搜索）
 */
export async function searchFiles(request: SearchRequest): Promise<SearchResult> {
  return invoke<SearchResult>("search_files", { request });
}

/**
 * 懒加载展开目录：双击目录时调用，返回该目录的直接子项。
 * 子目录的 children 字段为空数组表示尚未展开，需要再双击时再加载。
 */
export async function expandNode(path: string): Promise<ExpandNodeResponse> {
  return invoke<ExpandNodeResponse>("expand_node", { req: { path } });
}

/**
 * 评估删除风险
 * 调用 Rust 后端的 assess_delete_risk 命令
 */
export async function assessDeleteRisk(path: string, lang?: string): Promise<RiskDetail> {
  return invoke<RiskDetail>("assess_delete_risk", { path, lang: lang ?? null });
}

/**
 * 批量评估删除风险
 */
export async function assessBatchDeleteRisk(
  paths: string[],
  lang?: string
): Promise<BatchRiskResult> {
  return invoke<BatchRiskResult>("assess_batch_delete_risk", { paths, lang: lang ?? null });
}

/**
 * 监听扫描进度事件
 * 监听 Rust 后端通过 Tauri 事件系统发送的 scan-progress 事件
 *
 * @param callback - 进度更新回调函数
 * @returns 取消监听的函数
 */
export async function onScanProgress(
  callback: (progress: ScanProgress) => void
): Promise<UnlistenFn> {
  return listen<ScanProgress>("scan-progress", (event) => {
    callback(event.payload);
  });
}

/**
 * 监听扫描增量预览（边扫边看）
 * 顶级子树完成或尺寸增长时推送，用于即时刷新 Treemap
 */
export async function onScanPreview(
  callback: (preview: ScanPreview) => void
): Promise<UnlistenFn> {
  return listen<ScanPreview>("scan-preview", (event) => {
    callback(event.payload);
  });
}

/** 在 Finder / 资源管理器中显示并选中该路径 */
export async function revealInFileManager(path: string, lang?: string): Promise<void> {
  return invoke("reveal_in_file_manager", { path, lang: lang ?? null });
}

/** 语言切换时更新系统托盘菜单 */
export async function updateTrayMenu(lang?: string): Promise<void> {
  return invoke("update_tray_menu", { lang: lang ?? null });
}

/** 获取所有挂载点信息 */
export async function getDiskMounts(lang?: string): Promise<DiskMountInfo[]> {
  return invoke<DiskMountInfo[]>("get_disk_mounts", { lang: lang ?? null });
}

/** 获取物理磁盘健康度信息 */
export async function getPhysicalDiskHealth(
  lang?: string,
): Promise<PhysicalDiskHealth[]> {
  return invoke<PhysicalDiskHealth[]>("get_physical_disk_health", {
    lang: lang ?? null,
  });
}

/** 检查 smartctl (smartmontools) 是否已安装 */
export async function checkSmartctl(
  lang?: string,
): Promise<SmartctlStatus> {
  return invoke<SmartctlStatus>("check_smartctl", { lang: lang ?? null });
}
