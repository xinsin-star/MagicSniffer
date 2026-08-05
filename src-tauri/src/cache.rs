//! 扫描结果持久化缓存
//!
//! 保存在应用数据目录 `scan-cache/` 下，按根路径哈希分文件，
//! 另有 `index.json` 记录最近一次与各条目元信息，启动时可秒开上次结果。

use std::fs;
use std::io::{BufReader, BufWriter};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager};

use crate::models::{CachedScan, ScanCacheMeta, ScanRequest, ScanResult};

const CACHE_VERSION: u32 = 2;
const CACHE_DIR_NAME: &str = "scan-cache";
const INDEX_FILE: &str = "index.json";
/// 最多保留的缓存条目数，超出时淘汰最旧的
const MAX_CACHE_ENTRIES: usize = 5;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct CacheIndex {
    /// 最近一次保存对应的 root_path
    latest_root_path: Option<String>,
    entries: Vec<ScanCacheMeta>,
}

pub(crate) fn now_unix() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

fn cache_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let base = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("无法获取应用数据目录: {e}"))?;
    let dir = base.join(CACHE_DIR_NAME);
    fs::create_dir_all(&dir).map_err(|e| format!("无法创建缓存目录: {e}"))?;
    Ok(dir)
}

pub(crate) fn path_hash(root_path: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(root_path.as_bytes());
    let dig = hasher.finalize();
    hex::encode(&dig[..16]) // 128-bit 足够区分路径
}

fn entry_path(dir: &Path, root_path: &str) -> PathBuf {
    dir.join(format!("{}.json", path_hash(root_path)))
}

fn index_path(dir: &Path) -> PathBuf {
    dir.join(INDEX_FILE)
}

fn read_index(dir: &Path) -> CacheIndex {
    let p = index_path(dir);
    let Ok(file) = fs::File::open(p) else {
        return CacheIndex::default();
    };
    serde_json::from_reader(BufReader::new(file)).unwrap_or_default()
}

fn write_index(dir: &Path, index: &CacheIndex) -> Result<(), String> {
    let p = index_path(dir);
    let file = fs::File::create(&p).map_err(|e| format!("写入缓存索引失败: {e}"))?;
    serde_json::to_writer(BufWriter::new(file), index)
        .map_err(|e| format!("序列化缓存索引失败: {e}"))
}

fn meta_from_cached(c: &CachedScan) -> ScanCacheMeta {
    ScanCacheMeta {
        root_path: c.result.root_path.clone(),
        cached_at: c.cached_at,
        total_size: c.result.root_node.size,
        total_files: c.result.total_files,
        total_dirs: c.result.total_dirs,
        elapsed_ms: c.result.elapsed_ms,
        incomplete: c.incomplete,
    }
}

/// 将扫描结果写入磁盘缓存（覆盖同路径旧缓存）
pub fn save_scan(app: &AppHandle, result: &ScanResult) -> Result<CachedScan, String> {
    save_scan_ext(app, result, false, vec![], vec![], None, None)
}

/// 保存完整或断点缓存
pub fn save_scan_ext(
    app: &AppHandle,
    result: &ScanResult,
    incomplete: bool,
    pending_paths: Vec<String>,
    completed_paths: Vec<String>,
    request: Option<ScanRequest>,
    focus_path: Option<String>,
) -> Result<CachedScan, String> {
    let dir = cache_dir(app)?;
    let cached = CachedScan {
        version: CACHE_VERSION,
        cached_at: now_unix(),
        result: result.clone(),
        incomplete,
        pending_paths,
        completed_paths,
        request,
        focus_path,
    };

    let file_path = entry_path(&dir, &result.root_path);
    let file = fs::File::create(&file_path).map_err(|e| format!("写入扫描缓存失败: {e}"))?;
    serde_json::to_writer(BufWriter::new(file), &cached)
        .map_err(|e| format!("序列化扫描缓存失败: {e}"))?;

    let mut index = read_index(&dir);
    index.latest_root_path = Some(result.root_path.clone());
    let meta = meta_from_cached(&cached);
    if let Some(existing) = index
        .entries
        .iter_mut()
        .find(|e| e.root_path == result.root_path)
    {
        *existing = meta;
    } else {
        index.entries.push(meta);
    }
    index.entries.sort_by(|a, b| b.cached_at.cmp(&a.cached_at));

    // 超出上限时淘汰最旧的缓存（排在最后面）
    let evicted: Vec<ScanCacheMeta> = if index.entries.len() > MAX_CACHE_ENTRIES {
        let tail = index.entries.split_off(MAX_CACHE_ENTRIES);
        for meta in &tail {
            let ep = entry_path(&dir, &meta.root_path);
            if ep.exists() {
                if let Err(e) = fs::remove_file(&ep) {
                    log::warn!("淘汰缓存文件失败 {}: {e}", ep.display());
                } else {
                    log::info!("淘汰过期缓存: {} (cached_at={})", meta.root_path, meta.cached_at);
                }
            }
            // 若被淘汰的是 latest，改指第一个保留项
            if index.latest_root_path.as_deref() == Some(&meta.root_path) {
                index.latest_root_path = index.entries.first().map(|e| e.root_path.clone());
            }
        }
        tail
    } else {
        vec![]
    };

    write_index(&dir, &index)?;

    log::info!(
        "已缓存扫描结果: {} incomplete={} ({} bytes), 淘汰 {} 个旧缓存, 当前共 {} 条",
        result.root_path,
        incomplete,
        file_path.metadata().map(|m| m.len()).unwrap_or(0),
        evicted.len(),
        index.entries.len(),
    );
    Ok(cached)
}

fn read_cached_file(path: &Path) -> Result<CachedScan, String> {
    let file = fs::File::open(path).map_err(|e| format!("读取扫描缓存失败: {e}"))?;
    let cached: CachedScan = serde_json::from_reader(BufReader::new(file))
        .map_err(|e| format!("解析扫描缓存失败: {e}"))?;
    // 接受 v1（无断点字段）与当前版本
    if cached.version > CACHE_VERSION {
        return Err(format!(
            "缓存版本过新: {}（当前 {}）",
            cached.version, CACHE_VERSION
        ));
    }
    Ok(cached)
}

/// 按根路径加载缓存
pub fn load_scan(app: &AppHandle, root_path: &str) -> Result<Option<CachedScan>, String> {
    let dir = cache_dir(app)?;
    let file_path = entry_path(&dir, root_path);
    if !file_path.exists() {
        return Ok(None);
    }
    match read_cached_file(&file_path) {
        Ok(c) => Ok(Some(c)),
        Err(e) => {
            log::warn!("忽略损坏的缓存 {}: {e}", file_path.display());
            let _ = fs::remove_file(&file_path);
            Ok(None)
        }
    }
}

/// 加载最近一次扫描缓存
pub fn load_latest(app: &AppHandle) -> Result<Option<CachedScan>, String> {
    let dir = cache_dir(app)?;
    let index = read_index(&dir);
    let Some(root) = index.latest_root_path else {
        // 索引无 latest 时尝试条目中最新的
        let Some(meta) = index.entries.first() else {
            return Ok(None);
        };
        return load_scan(app, &meta.root_path);
    };
    load_scan(app, &root)
}

/// 列出所有缓存元信息
pub fn list_caches(app: &AppHandle) -> Result<Vec<ScanCacheMeta>, String> {
    let dir = cache_dir(app)?;
    let mut index = read_index(&dir);
    // 清理索引中已丢失文件的条目
    index.entries.retain(|e| entry_path(&dir, &e.root_path).exists());
    let _ = write_index(&dir, &index);
    Ok(index.entries)
}

/// 清除指定路径缓存；`root_path` 为 None 时清除全部
pub fn clear_cache(app: &AppHandle, root_path: Option<&str>) -> Result<(), String> {
    let dir = cache_dir(app)?;
    if let Some(root) = root_path {
        let p = entry_path(&dir, root);
        if p.exists() {
            fs::remove_file(&p).map_err(|e| format!("删除缓存失败: {e}"))?;
        }
        let mut index = read_index(&dir);
        index.entries.retain(|e| e.root_path != root);
        if index.latest_root_path.as_deref() == Some(root) {
            index.latest_root_path = index.entries.first().map(|e| e.root_path.clone());
        }
        write_index(&dir, &index)?;
    } else {
        if dir.exists() {
            fs::remove_dir_all(&dir).map_err(|e| format!("清空缓存目录失败: {e}"))?;
        }
        fs::create_dir_all(&dir).map_err(|e| format!("重建缓存目录失败: {e}"))?;
    }
    Ok(())
}
