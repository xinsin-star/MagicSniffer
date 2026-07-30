//! Tauri 命令处理函数
//!
//! 定义所有暴露给前端调用的 Tauri 命令。
//! 每个命令都是异步函数，使用 #[tauri::command] 宏标记。

use std::path::Path;

use tauri::{AppHandle, State};

use crate::models::*;
use crate::scanner::Scanner;
use crate::search::SearchEngine;

/// Tauri 应用状态 - 在 setup 中初始化
pub struct AppState {
    pub scanner: Scanner,
    pub search_engine: SearchEngine,
}

// ─── 系统概览 ──────────────────────────────────────────────────────────────────

/// 获取 macOS 系统存储概览信息
///
/// 返回系统总容量、已用空间、可用空间等基本信息
#[tauri::command]
pub async fn get_system_overview() -> Result<SystemOverview, String> {
    use sysinfo::Disks;

    let disks = Disks::new_with_refreshed_list();

    // 调试：打印所有磁盘信息，帮助定位问题
    for disk in disks.iter() {
        log::info!(
            "磁盘: {:?} 挂载点={:?} 总容量={} 可用={}",
            disk.name(),
            disk.mount_point(),
            disk.total_space(),
            disk.available_space()
        );
    }

    // 优先获取根分区 "/"
    let main_disk = disks
        .iter()
        .find(|d| d.mount_point() == Path::new("/"))
        // 如果找不到 "/"，回退到第一个有效磁盘
        .or_else(|| disks.iter().find(|d| d.total_space() > 0))
        .ok_or_else(|| {
            format!(
                "无法获取磁盘信息: 检测到 {} 个磁盘",
                disks.len()
            )
        })?;

    let total_space = main_disk.total_space();
    let available_space = main_disk.available_space();
    let used_space = total_space - available_space;

    // 构建分类汇总（初始状态）
    let category_summary = vec![CategorySummary {
        category: FileCategory::Other,
        total_size: used_space,
        file_count: 0,
        percentage: 100.0,
    }];

    Ok(SystemOverview {
        total_space,
        used_space,
        free_space: available_space,
        category_summary,
        top_consumers: vec![],
    })
}

// ─── 扫描 ──────────────────────────────────────────────────────────────────────

/// 启动文件系统扫描
///
/// 扫描指定路径，构建文件树，统计各分类的使用情况。
/// 扫描过程中通过事件系统发送进度更新。
#[tauri::command]
pub async fn start_scan(
    request: ScanRequest,
    app_handle: AppHandle,
    state: State<'_, AppState>,
) -> Result<ScanResult, String> {
    state
        .scanner
        .scan(request, Some(app_handle))
}

/// 获取系统已知大目录的快速预览
///
/// 快速扫描 macOS 中已知的一些大目录（如 ~/Library/Caches、~/Downloads 等）
/// 用于在完整扫描前给用户一个快速概览
#[tauri::command]
pub async fn quick_scan_known_dirs() -> Result<Vec<CategorySummary>, String> {
    let mut summaries = Vec::new();

    // 需要快速检查的已知目录
    let known_dirs = vec![
        ("~/Library/Caches", FileCategory::UserCache),
        ("~/Library/Logs", FileCategory::Logs),
        ("~/Downloads", FileCategory::Downloads),
        ("/Library/Caches", FileCategory::SystemCache),
        ("/Library/Logs", FileCategory::Logs),
        ("/tmp", FileCategory::Temporary),
    ];

    let home = dirs_fallback();
    let expanded_dirs: Vec<(String, FileCategory)> = known_dirs
        .iter()
        .map(|(dir, cat)| (dir.replace('~', &home), cat.clone()))
        .collect();

    // 为每个分类累计已知目录的大小
    let mut category_totals: Vec<(FileCategory, u64)> = Vec::new();

    for (dir_path, category) in &expanded_dirs {
        let path = Path::new(&dir_path);
        if path.exists() {
            let size = calculate_dir_size(path);
            // 查找或创建分类累计
            if let Some(existing) = category_totals
                .iter_mut()
                .find(|(cat, _): &&mut (FileCategory, u64)| cat == category)
            {
                existing.1 += size;
            } else {
                category_totals.push((category.clone(), size));
            }
        }
    }

    let total: u64 = category_totals.iter().map(|(_, s)| s).sum();

    for (category, total_size) in category_totals {
        let percentage = if total > 0 {
            (total_size as f64 / total as f64) * 100.0
        } else {
            0.0
        };

        summaries.push(CategorySummary {
            category,
            total_size,
            file_count: 0,
            percentage,
        });
    }

    Ok(summaries)
}

// ─── 搜索 ──────────────────────────────────────────────────────────────────────

/// 搜索文件
///
/// 使用 Rust 实现的高性能搜索，支持正则表达式和大小过滤
#[tauri::command]
pub async fn search_files(
    request: SearchRequest,
    state: State<'_, AppState>,
) -> Result<SearchResult, String> {
    state.search_engine.search(request)
}

// ─── 风险评估 ──────────────────────────────────────────────────────────────────

/// 获取删除指定路径的风险评估
#[tauri::command]
pub async fn assess_delete_risk(path: String) -> Result<RiskDetail, String> {
    let path = Path::new(&path);
    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| path.to_string_lossy().to_string());

    let categorizer = crate::categorizer::Categorizer::new();
    let risk_assessor = crate::risk::RiskAssessor::new();

    let category = categorizer.categorize(path, &name);
    let risk_level = risk_assessor.assess(path, &name, &category);
    let (explanation, recommendation) =
        risk_assessor.get_detail(path, &name, &category);

    Ok(RiskDetail {
        path: path.to_string_lossy().to_string(),
        name,
        risk_level,
        explanation,
        recommendation,
    })
}

/// 批量评估多条路径的删除风险
#[tauri::command]
pub async fn assess_batch_delete_risk(
    paths: Vec<String>,
) -> Result<BatchRiskResult, String> {
    let mut items = Vec::new();
    let mut total_size: u64 = 0;
    let mut all_safe = true;

    for path_str in paths {
        let detail = assess_delete_risk(path_str.clone()).await?;
        let is_safe = detail.risk_level == RiskLevel::None
            || detail.risk_level == RiskLevel::Low;

        if !is_safe {
            all_safe = false;
        }

        // 尝试获取文件大小
        if let Ok(meta) = std::fs::metadata(&path_str) {
            total_size += meta.len();
        }

        items.push(detail);
    }

    Ok(BatchRiskResult {
        total_size,
        items,
        all_safe,
    })
}

// ─── 辅助函数 ───────────────────────────────────────────────────────────────────

/// 获取 home 目录路径
fn dirs_fallback() -> String {
    std::env::var("HOME")
        .unwrap_or_else(|_| "/Users/current_user".to_string())
}

/// 递归计算目录大小（仅用于快速预览，非精确统计）
fn calculate_dir_size(path: &Path) -> u64 {
    let Ok(entries) = std::fs::read_dir(path) else {
        return 0;
    };

    entries
        .filter_map(|e| e.ok())
        .map(|entry| {
            let meta = entry.metadata().ok();
            let path = entry.path();

            if let Some(m) = meta {
                if m.is_dir() && !m.is_symlink() {
                    calculate_dir_size(&path)
                } else if m.is_file() {
                    m.len()
                } else {
                    0
                }
            } else {
                0
            }
        })
        .sum()
}
