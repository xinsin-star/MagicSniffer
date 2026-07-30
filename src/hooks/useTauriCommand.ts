//! Tauri 命令封装 Hook
//!
//! 封装对 Tauri 后端 IPC 的调用，提供类型安全的前端接口

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  SystemOverview,
  ScanRequest,
  ScanResult,
  ScanProgress,
  ScanPreview,
  SearchRequest,
  SearchResult,
  RiskDetail,
  BatchRiskResult,
} from "../types";

/**
 * 获取系统存储概览信息
 * 调用 Rust 后端的 get_system_overview 命令
 */
export async function getSystemOverview(): Promise<SystemOverview> {
  return invoke<SystemOverview>("get_system_overview");
}

/**
 * 启动文件系统扫描
 * 调用 Rust 后端的 start_scan 命令
 */
export async function startScan(request: ScanRequest): Promise<ScanResult> {
  return invoke<ScanResult>("start_scan", { request });
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
 * 评估删除风险
 * 调用 Rust 后端的 assess_delete_risk 命令
 */
export async function assessDeleteRisk(path: string): Promise<RiskDetail> {
  return invoke<RiskDetail>("assess_delete_risk", { path });
}

/**
 * 批量评估删除风险
 */
export async function assessBatchDeleteRisk(
  paths: string[]
): Promise<BatchRiskResult> {
  return invoke<BatchRiskResult>("assess_batch_delete_risk", { paths });
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
