//! Tauri 命令处理函数
//!
//! 定义所有暴露给前端调用的 Tauri 命令。
//! 每个命令都是异步函数，使用 #[tauri::command] 宏标记。

use std::path::{Path, PathBuf};
use std::sync::Arc;

use tauri::{AppHandle, State};

use crate::models::*;
use crate::scan_control::ScanControl;
use crate::scanner::Scanner;
use crate::search::SearchEngine;

/// Tauri 应用状态 - 在 setup 中初始化
pub struct AppState {
    pub scanner: Scanner,
    pub search_engine: SearchEngine,
    pub scan_control: Arc<ScanControl>,
}

// ─── 系统概览 ──────────────────────────────────────────────────────────────────

/// 获取 macOS 系统存储概览信息
///
/// 返回系统总容量、已用空间、可用空间等基本信息
#[tauri::command]
pub async fn get_system_overview(lang: Option<String>) -> Result<SystemOverview, String> {
    use sysinfo::Disks;

    let lang = lang.as_deref().unwrap_or("zh-CN");
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
            crate::locale::tr_fmt("error.no_disk_info", lang, &disks.len().to_string())
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

/// 校验扫描路径是否存在且为目录（展开 `~`）
///
/// 供前端在切换 UI 前做预检，避免无效路径导致页面闪烁。
#[tauri::command]
pub async fn validate_scan_path(path: String, lang: Option<String>) -> Result<String, String> {
    let lang = lang.as_deref().unwrap_or("zh-CN");
    let trimmed = path.trim();
    let input = if trimmed.is_empty() { "/" } else { trimmed };
    let expanded = crate::scanner::expand_user_path(input);
    let p = Path::new(&expanded);
    if !p.exists() {
        return Err(crate::locale::tr_fmt("error.path_not_found", lang, &expanded));
    }
    if !p.is_dir() {
        return Err(crate::locale::tr_fmt("error.not_directory", lang, &expanded));
    }
    Ok(expanded)
}

/// 启动文件系统扫描（支持断点续扫）
///
/// 扫描过程中可通过 set_scan_priority 优先子区域，
/// 通过 stop_scan 暂停并保存断点。
#[tauri::command]
pub async fn start_scan(
    request: ScanRequest,
    resume: Option<bool>,
    app_handle: AppHandle,
    state: State<'_, AppState>,
) -> Result<CachedScan, String> {
    state.scan_control.reset();

    let resume_cache = if resume.unwrap_or(false) {
        crate::cache::load_scan(&app_handle, &crate::scanner::expand_user_path(&request.path))?
            .filter(|c| c.incomplete)
    } else {
        None
    };

    // 若请求路径是 ~，对齐缓存里的绝对路径
    let resume_cache = if resume_cache.is_none() && resume.unwrap_or(false) {
        crate::cache::load_latest(&app_handle)?.filter(|c| c.incomplete)
    } else {
        resume_cache
    };

    let effective_request = resume_cache
        .as_ref()
        .and_then(|c| c.request.clone())
        .unwrap_or(request);

    let control = state.scan_control.clone();
    let outcome = state.scanner.scan(
        effective_request.clone(),
        Some(app_handle.clone()),
        control,
        resume_cache.as_ref(),
    )?;

    // 自动保存历史快照（仅完整扫描；断点续扫完成后同样走这里），供「快照对比」使用
    if !outcome.incomplete {
        if let Err(e) = crate::snapshots::save_snapshot(&app_handle, &outcome.result, false) {
            log::warn!("保存扫描快照失败: {e}");
        }
    }

    let focus = state
        .scan_control
        .priority()
        .map(|p| p.to_string_lossy().to_string());

    let cached = crate::cache::save_scan_ext(
        &app_handle,
        &outcome.result,
        outcome.incomplete,
        outcome.pending_paths,
        outcome.completed_paths,
        Some(effective_request),
        focus,
    )
    .map_err(|e| {
        log::warn!("保存扫描缓存失败: {e}");
        e
    })
    .unwrap_or_else(|_| CachedScan {
        version: 2,
        cached_at: 0,
        result: outcome.result,
        incomplete: outcome.incomplete,
        pending_paths: vec![],
        completed_paths: vec![],
        request: None,
        focus_path: None,
    });

    Ok(cached)
}

/// 设置扫描优先级（下钻到某目录时优先扫描该路径）
#[tauri::command]
pub async fn set_scan_priority(
    path: Option<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state
        .scan_control
        .set_priority(path.map(PathBuf::from));
    Ok(())
}

/// 停止当前扫描并触发断点保存（扫描循环检测到后返回）
#[tauri::command]
pub async fn stop_scan(state: State<'_, AppState>) -> Result<(), String> {
    state.scan_control.request_cancel();
    Ok(())
}

/// 加载最近一次扫描缓存（启动秒开）
#[tauri::command]
pub async fn load_latest_scan_cache(app_handle: AppHandle) -> Result<Option<CachedScan>, String> {
    crate::cache::load_latest(&app_handle)
}

/// 按根路径加载扫描缓存
#[tauri::command]
pub async fn load_scan_cache(
    root_path: String,
    app_handle: AppHandle,
) -> Result<Option<CachedScan>, String> {
    crate::cache::load_scan(&app_handle, &root_path)
}

/// 列出本地扫描缓存摘要
#[tauri::command]
pub async fn list_scan_caches(app_handle: AppHandle) -> Result<Vec<ScanCacheMeta>, String> {
    crate::cache::list_caches(&app_handle)
}

/// 清除扫描缓存；不传 path 则清空全部
#[tauri::command]
pub async fn clear_scan_cache(
    root_path: Option<String>,
    app_handle: AppHandle,
) -> Result<(), String> {
    crate::cache::clear_cache(&app_handle, root_path.as_deref())
}

/// 列出所有扫描快照元信息
#[tauri::command]
pub async fn list_snapshots(app_handle: AppHandle) -> Result<Vec<SnapshotMeta>, String> {
    crate::snapshots::list_snapshots(&app_handle)
}

/// 删除指定扫描快照
#[tauri::command]
pub async fn delete_snapshot(id: String, app_handle: AppHandle) -> Result<(), String> {
    crate::snapshots::delete_snapshot(&app_handle, &id)
}

/// 对比两个扫描快照（base 为基准/旧，target 为目标/新）
#[tauri::command]
pub async fn diff_snapshots(
    base_id: String,
    target_id: String,
    app_handle: AppHandle,
) -> Result<SnapshotDiff, String> {
    crate::snapshots::diff_snapshots(&app_handle, &base_id, &target_id)
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

// ─── 懒加载展开 ─────────────────────────────────────────────────────────────────

/// 展开目录（双击下钻时按需加载直接子项）
#[tauri::command]
pub async fn expand_node(
    req: ExpandNodeRequest,
    state: State<'_, AppState>,
) -> Result<ExpandNodeResponse, String> {
    let expanded = crate::scanner::expand_user_path(&req.path);
    let path = Path::new(&expanded);
    let (children, truncated) = state.scanner.expand_directory(path)?;
    log::info!(
        "expand_node: 展开 {} → {} 个子项 (截断: {})",
        expanded,
        children.len(),
        truncated
    );
    Ok(ExpandNodeResponse {
        path: req.path,
        children,
        truncated,
    })
}

// ─── 风险评估 ──────────────────────────────────────────────────────────────────

/// 获取删除指定路径的风险评估
#[tauri::command]
pub async fn assess_delete_risk(path: String, lang: Option<String>) -> Result<RiskDetail, String> {
    let lang = lang.as_deref().unwrap_or("zh-CN");
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
        risk_assessor.get_detail(path, &name, &category, lang);

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
    lang: Option<String>,
) -> Result<BatchRiskResult, String> {
    let mut items = Vec::new();
    let mut total_size: u64 = 0;
    let mut all_safe = true;

    for path_str in paths {
        let detail = assess_delete_risk(path_str.clone(), lang.clone()).await?;
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

/// 在系统文件管理器中显示路径（macOS Finder / Windows 资源管理器）
#[tauri::command]
pub async fn reveal_in_file_manager(path: String, lang: Option<String>) -> Result<(), String> {
    let lang = lang.as_deref().unwrap_or("zh-CN");
    let target = Path::new(&path);
    if !target.exists() {
        return Err(crate::locale::tr_fmt("error.path_not_found", lang, &path));
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .args(["-R", &path])
            .spawn()
            .map_err(|e| crate::locale::tr_fmt("error.cannot_open_finder", lang, &e.to_string()))?;
    }

    #[cfg(target_os = "windows")]
    {
        let win_path = path.replace('/', "\\");
        std::process::Command::new("cmd")
            .args(["/C", "explorer", &format!("/select,\"{win_path}\"")])
            .spawn()
            .map_err(|e| crate::locale::tr_fmt("error.cannot_open_explorer", lang, &e.to_string()))?;
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        return Err(crate::locale::tr("error.platform_not_supported", lang));
    }

    Ok(())
}

// ─── 磁盘挂载与健康度 ──────────────────────────────────────────────────────────

#[derive(serde::Deserialize)]
#[serde(rename_all = "PascalCase")]
struct DiskUtilInfo {
    #[serde(default)]
    solid_state: Option<bool>,
    #[serde(default)]
    bus_protocol: Option<String>,
    /// APFS 卷已用空间（字节），用于精确的每卷已用计算
    #[serde(default)]
    capacity_in_use: Option<u64>,
}

fn parse_diskutil_plist(mount_point: &str) -> Option<DiskUtilInfo> {
    let output = std::process::Command::new("diskutil")
        .args(["info", "-plist", mount_point])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    plist::from_bytes::<DiskUtilInfo>(&output.stdout).ok()
}

/// 获取所有挂载点及其磁盘健康度信息
#[tauri::command]
pub async fn get_disk_mounts(lang: Option<String>) -> Result<Vec<DiskMountInfo>, String> {
    let _lang = lang.as_deref().unwrap_or("zh-CN");

    #[cfg(target_os = "macos")]
    let mounts = enumerate_macos_mounts();
    #[cfg(not(target_os = "macos"))]
    let mounts = enumerate_sysinfo_mounts();

    log::info!("get_disk_mounts: 返回 {} 个挂载点", mounts.len());
    Ok(mounts)
}

/// 非 macOS 平台：使用 sysinfo 枚举磁盘
#[cfg(not(target_os = "macos"))]
fn enumerate_sysinfo_mounts() -> Vec<DiskMountInfo> {
    use sysinfo::Disks;

    let disks = Disks::new_with_refreshed_list();
    let mut mounts: Vec<DiskMountInfo> = Vec::new();

    for disk in disks.iter() {
        let total = disk.total_space();
        let mount_str = disk.mount_point().to_string_lossy().to_string();
        let fs = disk.file_system().to_string_lossy().to_string();

        if mount_str.starts_with("/dev") || fs == "devfs" || fs.is_empty() {
            continue;
        }
        if total < 100_000_000 {
            continue;
        }

        let kind = match disk.kind() {
            sysinfo::DiskKind::SSD => "SSD".to_string(),
            sysinfo::DiskKind::HDD => "HDD".to_string(),
            _ => "Unknown".to_string(),
        };

        mounts.push(DiskMountInfo {
            mount_point: mount_str.clone(),
            name: disk.name().to_string_lossy().to_string(),
            file_system: fs,
            kind,
            total_space: total,
            available_space: disk.available_space(),
            is_removable: disk.is_removable(),
        });
    }

    mounts
}

/// macOS: 使用 getfsstat 获取完整的挂载点列表（包括所有 APFS 卷）
#[cfg(target_os = "macos")]
fn enumerate_macos_mounts() -> Vec<DiskMountInfo> {
    let pseudo_fs: &[&str] = &[
        "devfs", "autofs", "procfs", "fdesc", "kernfs", "nullfs",
        "synthfs", "nfs", "smbfs", "afpfs", "webdav", "cifs",
    ];

    let mut mounts: Vec<DiskMountInfo> = Vec::new();
    let fs_entries = unsafe { get_macos_filesystems() };

    for (mount_point, fs_type, total, available, _device) in &fs_entries {
        if pseudo_fs.contains(&fs_type.as_str()) {
            continue;
        }
        if *total == 0 {
            continue;
        }

        // APFS: 使用 diskutil info 获取每卷 CapacityInUse 以精确计算
        let du_info = parse_diskutil_plist(mount_point);
        let (total_space, available_space) =
            if let Some(ref info) = du_info {
                if let Some(cap_in_use) = info.capacity_in_use {
                    (cap_in_use + *available, *available)
                } else {
                    (*total, *available)
                }
            } else {
                (*total, *available)
            };

        let kind = du_info
            .as_ref()
            .and_then(|i| i.solid_state)
            .map(|ss| if ss { "SSD" } else { "HDD" })
            .unwrap_or("Unknown")
            .to_string();

        let is_removable = mount_point.starts_with("/Volumes/")
            && mount_point != "/"
            && !mount_point.starts_with("/System/Volumes/");

        mounts.push(DiskMountInfo {
            mount_point: mount_point.clone(),
            name: mount_point.clone(),
            file_system: fs_type.clone(),
            kind,
            total_space,
            available_space,
            is_removable,
        });
    }

    mounts
}

/// macOS: 通过 libc::getfsstat 获取所有挂载文件系统的信息
#[cfg(target_os = "macos")]
unsafe fn get_macos_filesystems() -> Vec<(String, String, u64, u64, String)> {
    let mut entries = Vec::new();

    let count = libc::getfsstat(std::ptr::null_mut(), 0, libc::MNT_NOWAIT);
    if count <= 0 {
        log::warn!("getfsstat 获取文件系统数量失败: {}", count);
        return entries;
    }

    let mut buf: Vec<libc::statfs> = Vec::with_capacity(count as usize);
    let buf_bytes = buf.capacity() * std::mem::size_of::<libc::statfs>();

    let actual = libc::getfsstat(
        buf.as_mut_ptr(),
        buf_bytes as i32,
        libc::MNT_NOWAIT,
    );
    if actual <= 0 {
        log::warn!("getfsstat 获取文件系统数据失败: {}", actual);
        return entries;
    }
    buf.set_len(actual as usize);

    for stat in &buf {
        let mount_point = std::ffi::CStr::from_ptr(stat.f_mntonname.as_ptr())
            .to_string_lossy()
            .to_string();
        let fs_type = std::ffi::CStr::from_ptr(stat.f_fstypename.as_ptr())
            .to_string_lossy()
            .to_string();
        let device = std::ffi::CStr::from_ptr(stat.f_mntfromname.as_ptr())
            .to_string_lossy()
            .to_string();

        let total = stat.f_blocks * (stat.f_bsize as u64);
        let available = stat.f_bavail * (stat.f_bsize as u64);

        entries.push((mount_point, fs_type, total, available, device));
    }

    entries
}

/// 获取物理磁盘健康度信息（按物理磁盘分组，独立于挂载点）
#[tauri::command]
pub async fn get_physical_disk_health(
    lang: Option<String>,
) -> Result<Vec<PhysicalDiskHealth>, String> {
    let _lang = lang.as_deref().unwrap_or("zh-CN");

    #[cfg(target_os = "macos")]
    let health = get_macos_disk_health();
    #[cfg(not(target_os = "macos"))]
    let health = get_sysinfo_disk_health();

    log::info!("get_physical_disk_health: 返回 {} 个物理磁盘", health.len());
    Ok(health)
}

#[cfg(target_os = "macos")]
fn get_macos_disk_health() -> Vec<PhysicalDiskHealth> {
    let mut disks: Vec<PhysicalDiskHealth> = Vec::new();

    // ── 从 system_profiler SPNVMeDataType -xml 获取 NVMe 磁盘信息 ──
    if let Some(nvme_disks) = parse_nvme_plist() {
        for nvme in nvme_disks {
            let mut health = PhysicalDiskHealth {
                device_id: nvme.bsd_name.clone(),
                model: nvme.device_model.clone(),
                serial: nvme.device_serial.clone(),
                firmware: nvme.device_revision.clone(),
                capacity: nvme.size_in_bytes,
                medium_type: "SSD".to_string(),
                protocol: "Apple Fabric".to_string(),
                smart_status: nvme.smart_status.clone(),
                is_internal: true,
                trim_support: nvme.trim_support.clone(),
                io_stats: get_iokit_io_stats(&nvme.bsd_name),
                nvme_smart: None,
                volumes: nvme.volumes.clone(),
            };

            // 尝试通过 diskutil 获取更准确的 protocol 信息
            if let Some(du) = parse_diskutil_plist(&format!("/dev/{}", nvme.bsd_name)) {
                if let Some(proto) = du.bus_protocol {
                    health.protocol = proto;
                }
            }

            // ── 第三步：通过 smartctl 获取 NVMe SMART 详细数据 ──
            health.nvme_smart = parse_smartctl(&nvme.bsd_name);

            disks.push(health);
        }
    }

    // ── 补充非 NVMe 磁盘（如有） ──
    if disks.is_empty() {
        disks = get_sysinfo_disk_health();
    }

    disks
}

/// 定位 smartctl 可执行文件
///
/// GUI 应用从 Finder 启动时 PATH 不包含 Homebrew 目录，
/// 因此需要显式探测常见安装路径，避免依赖 PATH。
#[cfg(target_os = "macos")]
fn find_smartctl() -> Option<std::path::PathBuf> {
    let candidates = [
        "/opt/homebrew/bin/smartctl", // Apple Silicon Homebrew
        "/usr/local/bin/smartctl",    // Intel Homebrew
        "/usr/bin/smartctl",
        "/usr/local/sbin/smartctl",
    ];
    for path in candidates {
        if std::path::Path::new(path).is_file() {
            return Some(std::path::PathBuf::from(path));
        }
    }
    // 兜底：通过 PATH 查找
    if let Ok(output) = std::process::Command::new("/usr/bin/which")
        .arg("smartctl")
        .output()
    {
        if output.status.success() {
            let p = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !p.is_empty() {
                return Some(std::path::PathBuf::from(p));
            }
        }
    }
    None
}

/// 解析 smartctl -a 输出，提取 NVMe SMART 健康数据
#[cfg(target_os = "macos")]
fn parse_smartctl(device: &str) -> Option<NvmeSmartData> {
    let smartctl = find_smartctl()?;
    let output = std::process::Command::new(smartctl)
        .args(["-a", device])
        .output()
        .ok()?;
    let text = String::from_utf8_lossy(&output.stdout);
    // smartctl 在 Apple Silicon 上可能返回非零退出码（如 4=Error Log 读取失败）
    // 但仍然输出了完整的 SMART 数据，因此改用内容检测
    if !text.contains("SMART/Health Information") {
        log::warn!("smartctl 未返回 SMART/Health Information 段");
        return None;
    }

    let get = |key: &str| -> Option<u64> {
        let line = text.lines().find(|l| l.trim().starts_with(key))?;
        let val = line.split(':').nth(1)?.trim();
        // 处理 "1,389" 格式的数字
        val.replace(',', "").split_whitespace().next()?.parse().ok()
    };

    let get_pct = |key: &str| -> Option<u32> {
        let line = text.lines().find(|l| l.trim().starts_with(key))?;
        let val = line.split(':').nth(1)?.trim();
        val.trim_end_matches('%').parse().ok()
    };

    let get_hex = |key: &str| -> Option<u8> {
        let line = text.lines().find(|l| l.trim().starts_with(key))?;
        let val = line.split(':').nth(1)?.trim();
        u8::from_str_radix(val.trim_start_matches("0x"), 16).ok()
    };

    let data_units_read = get("Data Units Read")?;
    let data_units_written = get("Data Units Written")?;

    Some(NvmeSmartData {
        critical_warning: get_hex("Critical Warning").unwrap_or(0),
        temperature_celsius: get("Temperature").unwrap_or(0) as u32,
        available_spare: get_pct("Available Spare").unwrap_or(0),
        available_spare_threshold: get_pct("Available Spare Threshold").unwrap_or(0),
        percentage_used: get_pct("Percentage Used").unwrap_or(0),
        data_units_read_bytes: data_units_read * 512_000,
        data_units_written_bytes: data_units_written * 512_000,
        host_read_commands: get("Host Read Commands").unwrap_or(0),
        host_write_commands: get("Host Write Commands").unwrap_or(0),
        controller_busy_time: get("Controller Busy Time").unwrap_or(0),
        power_cycles: get("Power Cycles").unwrap_or(0),
        power_on_hours: get("Power On Hours").unwrap_or(0),
        unsafe_shutdowns: get("Unsafe Shutdowns").unwrap_or(0),
        media_errors: get("Media and Data Integrity Errors").unwrap_or(0),
        error_log_entries: get("Error Information Log Entries").unwrap_or(0),
    })
}

/// 解析 system_profiler SPNVMeDataType -xml 输出
#[cfg(target_os = "macos")]
fn parse_nvme_plist() -> Option<Vec<NvmeDiskInfo>> {
    let output = std::process::Command::new("system_profiler")
        .args(["SPNVMeDataType", "-xml", "-detailLevel", "full"])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }

    // system_profiler 输出是 [{ _items: [{ _items: [...] }] }]
    let top: Vec<plist::Value> = plist::from_bytes(&output.stdout).ok()?;
    let root = top.first()?;
    let items = root
        .as_dictionary()?
        .get("_items")?
        .as_array()?;

    let mut disks: Vec<NvmeDiskInfo> = Vec::new();

    for item in items {
        let dict = item.as_dictionary()?;
        if let Some(inner_items) = dict.get("_items").and_then(|v| v.as_array()) {
            for disk_entry in inner_items {
                let d = disk_entry.as_dictionary()?;
                let bsd = d.get("bsd_name").and_then(|v| v.as_string()).unwrap_or("");
                let model = d.get("device_model").and_then(|v| v.as_string()).unwrap_or("");
                let serial = d.get("device_serial").and_then(|v| v.as_string()).map(|s| s.to_string());
                let fw = d.get("device_revision").and_then(|v| v.as_string()).map(|s| s.to_string());
                let size: u64 = d.get("size_in_bytes").and_then(|v| v.as_unsigned_integer()).unwrap_or(0);
                let smart = d.get("smart_status").and_then(|v| v.as_string()).map(|s| s.to_string());
                let trim = d.get("spnvme_trim_support").and_then(|v| v.as_string()).map(|s| s == "Yes");

                let mut volumes: Vec<DiskVolumeRef> = Vec::new();
                if let Some(vols) = d.get("volumes").and_then(|v| v.as_array()) {
                    for vol in vols {
                        if let Some(vd) = vol.as_dictionary() {
                            let mount = vd.get("_name").and_then(|v| v.as_string()).unwrap_or("").to_string();
                            let vsize: u64 = vd.get("size_in_bytes").and_then(|v| v.as_unsigned_integer()).unwrap_or(0);
                            let vol_bsd = vd.get("bsd_name").and_then(|v| v.as_string()).unwrap_or("").to_string();
                            volumes.push(DiskVolumeRef {
                                mount_point: mount,
                                bsd_name: vol_bsd,
                                size: vsize,
                                file_system: String::new(),
                            });
                        }
                    }
                }

                disks.push(NvmeDiskInfo {
                    bsd_name: bsd.to_string(),
                    device_model: model.to_string(),
                    device_serial: serial,
                    device_revision: fw,
                    size_in_bytes: size,
                    smart_status: smart,
                    trim_support: trim,
                    volumes,
                });
            }
        }
    }

    Some(disks)
}

/// 从 IOKit IOBlockStorageDriver 获取 I/O 统计
#[cfg(target_os = "macos")]
fn get_iokit_io_stats(bsd_name: &str) -> Option<DiskIOStats> {
    let output = std::process::Command::new("ioreg")
        .args(["-c", "IOBlockStorageDriver", "-r", "-w0", "-a"])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }

    // ioreg -a 输出是 [{IOBlockStorageDriver}, ...] 数组
    let drivers: Vec<plist::Value> = plist::from_bytes(&output.stdout).ok()?;

    // 递归查找 IOMedia 子节点中是否有匹配 target 的 BSD Name
    fn has_bsd_name_match(node: &plist::Value, target: &str) -> bool {
        if let Some(dict) = node.as_dictionary() {
            if let Some(name) = dict.get("BSD Name").and_then(|v| v.as_string()) {
                if name == target {
                    return true;
                }
            }
            // 搜索 IORegistryEntryChildren
            if let Some(children) = dict.get("IORegistryEntryChildren").and_then(|v| v.as_array()) {
                for child in children {
                    if has_bsd_name_match(child, target) {
                        return true;
                    }
                }
            }
        }
        false
    }

    fn extract_stats(dict: &plist::Dictionary) -> Option<DiskIOStats> {
        let stats = dict.get("Statistics")?;
        let d = stats.as_dictionary()?;
        Some(DiskIOStats {
            bytes_read: d.get("Bytes (Read)").and_then(|v| v.as_unsigned_integer()).unwrap_or(0),
            bytes_written: d.get("Bytes (Write)").and_then(|v| v.as_unsigned_integer()).unwrap_or(0),
            operations_read: d.get("Operations (Read)").and_then(|v| v.as_unsigned_integer()).unwrap_or(0),
            operations_written: d.get("Operations (Write)").and_then(|v| v.as_unsigned_integer()).unwrap_or(0),
            errors_read: d.get("Errors (Read)").and_then(|v| v.as_unsigned_integer()).unwrap_or(0),
            errors_write: d.get("Errors (Write)").and_then(|v| v.as_unsigned_integer()).unwrap_or(0),
        })
    }

    for driver in &drivers {
        if has_bsd_name_match(driver, bsd_name) {
            if let Some(dict) = driver.as_dictionary() {
                return extract_stats(dict);
            }
        }
    }

    None
}

/// 非 macOS: 用 sysinfo 获取基本磁盘健康信息
fn get_sysinfo_disk_health() -> Vec<PhysicalDiskHealth> {
    use sysinfo::Disks;

    let disks = Disks::new_with_refreshed_list();
    let mut health_list: Vec<PhysicalDiskHealth> = Vec::new();

    for disk in disks.iter() {
        let name = disk.name().to_string_lossy().to_string();
        let mount = disk.mount_point().to_string_lossy().to_string();
        let kind = match disk.kind() {
            sysinfo::DiskKind::SSD => "SSD",
            sysinfo::DiskKind::HDD => "HDD",
            _ => "Unknown",
        };

        health_list.push(PhysicalDiskHealth {
            device_id: name.clone(),
            model: name,
            serial: None,
            firmware: None,
            capacity: disk.total_space(),
            medium_type: kind.to_string(),
            protocol: String::new(),
            smart_status: None,
            is_internal: !disk.is_removable(),
            trim_support: None,
            io_stats: None,
            nvme_smart: None,
            volumes: vec![DiskVolumeRef {
                mount_point: mount,
                bsd_name: String::new(),
                size: disk.total_space(),
                file_system: disk.file_system().to_string_lossy().to_string(),
            }],
        });
    }

    health_list
}

/// 检查 smartctl (smartmontools) 是否已安装
#[tauri::command]
pub async fn check_smartctl(lang: Option<String>) -> Result<SmartctlStatus, String> {
    let _lang = lang.as_deref().unwrap_or("zh-CN");

    #[cfg(target_os = "macos")]
    let path = find_smartctl();
    #[cfg(not(target_os = "macos"))]
    let path = std::env::var("PATH").ok().and_then(|_| {
        if std::process::Command::new("smartctl")
            .arg("--version")
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
        {
            Some(std::path::PathBuf::from("smartctl"))
        } else {
            None
        }
    });

    let Some(path) = path else {
        return Ok(SmartctlStatus {
            available: false,
            version: None,
        });
    };

    match std::process::Command::new(&path).arg("--version").output() {
        Ok(output) if output.status.success() => {
            let text = String::from_utf8_lossy(&output.stdout);
            let version = text
                .lines()
                .next()
                .and_then(|l| l.split_whitespace().nth(1))
                .map(|v| v.to_string());
            Ok(SmartctlStatus {
                available: true,
                version,
            })
        }
        _ => Ok(SmartctlStatus {
            available: false,
            version: None,
        }),
    }
}

/// system_profiler NVMe 解析的内部结构
#[cfg(target_os = "macos")]
#[derive(Debug, Clone)]
struct NvmeDiskInfo {
    bsd_name: String,
    device_model: String,
    device_serial: Option<String>,
    device_revision: Option<String>,
    size_in_bytes: u64,
    smart_status: Option<String>,
    trim_support: Option<bool>,
    volumes: Vec<DiskVolumeRef>,
}

// ─── 系统托盘 ──────────────────────────────────────────────────────────────────

/// 语言切换时更新托盘菜单文本
#[tauri::command]
pub async fn update_tray_menu(lang: Option<String>, app_handle: AppHandle) -> Result<(), String> {
    let lang = lang.as_deref().unwrap_or("zh-CN");
    let tray = app_handle
        .tray_by_id(crate::TRAY_ID)
        .ok_or("托盘图标未初始化")?;
    let new_menu = crate::build_tray_menu(&app_handle, lang)
        .map_err(|e| format!("构建托盘菜单失败: {e}"))?;
    tray.set_menu(Some(new_menu))
        .map_err(|e| format!("更新托盘菜单失败: {e}"))?;
    Ok(())
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
