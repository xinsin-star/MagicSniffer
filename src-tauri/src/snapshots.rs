//! 扫描快照子系统
//!
//! 每次完整扫描自动保存一份带时间戳的快照到 `snapshots/` 目录，
//! 供「快照对比（占用变化追踪）」使用。同一扫描根路径最多保留
//! [`MAX_SNAPSHOTS_PER_PATH`] 份，超出时按 FIFO 淘汰最旧的。

use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::{BufReader, BufWriter};
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::cache;
use crate::models::*;

/// 快照存储目录名（位于应用数据目录下）
const SNAPSHOT_DIR_NAME: &str = "snapshots";
const INDEX_FILE: &str = "index.json";
/// 同一扫描根路径最多保留的快照份数，超出时淘汰最旧的
const MAX_SNAPSHOTS_PER_PATH: usize = 10;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct SnapshotIndex {
    /// root_path → 快照元信息列表（新的在前）
    entries: HashMap<String, Vec<SnapshotMeta>>,
}

fn snapshot_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let base = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("无法获取应用数据目录: {e}"))?;
    let dir = base.join(SNAPSHOT_DIR_NAME);
    fs::create_dir_all(&dir).map_err(|e| format!("无法创建快照目录: {e}"))?;
    Ok(dir)
}

fn index_path(dir: &Path) -> PathBuf {
    dir.join(INDEX_FILE)
}

fn snapshot_file_path(dir: &Path, id: &str) -> PathBuf {
    dir.join(format!("{id}.json"))
}

fn read_index(dir: &Path) -> SnapshotIndex {
    let p = index_path(dir);
    let Ok(file) = fs::File::open(p) else {
        return SnapshotIndex::default();
    };
    serde_json::from_reader(BufReader::new(file)).unwrap_or_default()
}

fn write_index(dir: &Path, index: &SnapshotIndex) -> Result<(), String> {
    let p = index_path(dir);
    let file = fs::File::create(&p).map_err(|e| format!("写入快照索引失败: {e}"))?;
    serde_json::to_writer(BufWriter::new(file), index)
        .map_err(|e| format!("序列化快照索引失败: {e}"))
}

fn meta_from_result(result: &ScanResult, id: String, captured_at: i64, incomplete: bool) -> SnapshotMeta {
    SnapshotMeta {
        id,
        root_path: result.root_path.clone(),
        captured_at,
        total_size: result.root_node.size,
        total_files: result.total_files,
        total_dirs: result.total_dirs,
        elapsed_ms: result.elapsed_ms,
        incomplete,
    }
}

/// 将扫描结果保存为一份快照；返回新快照的元信息
pub fn save_snapshot(app: &AppHandle, result: &ScanResult, incomplete: bool) -> Result<SnapshotMeta, String> {
    let dir = snapshot_dir(app)?;

    let hash = cache::path_hash(&result.root_path);
    let mut captured_at = cache::now_unix();
    let mut id = format!("{hash}_{captured_at}");
    // 防止同一秒多次保存导致 id 碰撞
    while snapshot_file_path(&dir, &id).exists() {
        captured_at += 1;
        id = format!("{hash}_{captured_at}");
    }

    let meta = meta_from_result(result, id.clone(), captured_at, incomplete);
    let entry = SnapshotEntry {
        meta: meta.clone(),
        result: result.clone(),
    };
    let file = fs::File::create(snapshot_file_path(&dir, &id)).map_err(|e| format!("写入快照失败: {e}"))?;
    serde_json::to_writer(BufWriter::new(file), &entry).map_err(|e| format!("序列化快照失败: {e}"))?;

    let mut index = read_index(&dir);
    let list = index.entries.entry(result.root_path.clone()).or_default();
    list.insert(0, meta.clone());

    // FIFO 淘汰超出上限的旧快照
    if list.len() > MAX_SNAPSHOTS_PER_PATH {
        let evicted: Vec<SnapshotMeta> = list.split_off(MAX_SNAPSHOTS_PER_PATH);
        for m in &evicted {
            let p = snapshot_file_path(&dir, &m.id);
            if p.exists() {
                if let Err(e) = fs::remove_file(&p) {
                    log::warn!("淘汰快照文件失败 {}: {e}", p.display());
                } else {
                    log::info!("淘汰过期快照: {} (captured_at={})", m.root_path, m.captured_at);
                }
            }
        }
    }
    index.entries.retain(|_, v| !v.is_empty());
    write_index(&dir, &index)?;

    log::info!("已保存扫描快照: {} id={}", result.root_path, id);
    Ok(meta)
}

/// 列出所有快照元信息（跨扫描根路径，按 captured_at 倒序）；顺带清理丢失文件的索引条目
pub fn list_snapshots(app: &AppHandle) -> Result<Vec<SnapshotMeta>, String> {
    let dir = snapshot_dir(app)?;
    let mut index = read_index(&dir);

    let mut all: Vec<SnapshotMeta> = Vec::new();
    for list in index.entries.values_mut() {
        list.retain(|m| snapshot_file_path(&dir, &m.id).exists());
        all.extend(list.iter().cloned());
    }
    index.entries.retain(|_, v| !v.is_empty());
    let _ = write_index(&dir, &index);

    all.sort_by(|a, b| b.captured_at.cmp(&a.captured_at));
    Ok(all)
}

/// 按 id 加载完整快照；文件不存在或损坏时返回 `Ok(None)`（损坏文件会被删除）
pub fn load_snapshot(app: &AppHandle, id: &str) -> Result<Option<SnapshotEntry>, String> {
    let dir = snapshot_dir(app)?;
    let p = snapshot_file_path(&dir, id);
    if !p.exists() {
        return Ok(None);
    }
    let file = fs::File::open(&p).map_err(|e| format!("读取快照失败: {e}"))?;
    match serde_json::from_reader(BufReader::new(file)) {
        Ok(entry) => Ok(Some(entry)),
        Err(e) => {
            log::warn!("忽略损坏的快照 {}: {e}", p.display());
            let _ = fs::remove_file(&p);
            Ok(None)
        }
    }
}

/// 删除指定快照（删文件 + 更新索引）
pub fn delete_snapshot(app: &AppHandle, id: &str) -> Result<(), String> {
    let dir = snapshot_dir(app)?;
    let p = snapshot_file_path(&dir, id);
    if p.exists() {
        fs::remove_file(&p).map_err(|e| format!("删除快照失败: {e}"))?;
    }
    let mut index = read_index(&dir);
    for list in index.entries.values_mut() {
        list.retain(|m| m.id != id);
    }
    index.entries.retain(|_, v| !v.is_empty());
    write_index(&dir, &index)?;
    Ok(())
}

/// 对比两个快照（base 为基准/旧，target 为目标/新）；两者扫描根路径必须一致
pub fn diff_snapshots(app: &AppHandle, base_id: &str, target_id: &str) -> Result<SnapshotDiff, String> {
    let base = load_snapshot(app, base_id)?.ok_or_else(|| format!("快照不存在: {base_id}"))?;
    let target = load_snapshot(app, target_id)?.ok_or_else(|| format!("快照不存在: {target_id}"))?;
    if base.meta.root_path != target.meta.root_path {
        return Err("两次快照的扫描根路径不一致，无法对比".into());
    }

    let root = diff_nodes(Some(&base.result.root_node), Some(&target.result.root_node));
    let category_diff = diff_categories(&base.result.category_summary, &target.result.category_summary);
    let summary = summarize(&root);

    Ok(SnapshotDiff {
        base: base.meta,
        target: target.meta,
        root,
        category_diff,
        summary,
    })
}

// ─── diff 纯函数 ───────────────────────────────────────────────────────────────

/// 根据新旧大小判定差异状态
fn classify_status(old_size: u64, new_size: u64) -> DiffStatus {
    match (old_size, new_size) {
        (0, 0) => DiffStatus::Unchanged,
        (0, _) => DiffStatus::Added,
        (_, 0) => DiffStatus::Removed,
        (o, n) if n > o => DiffStatus::Grown,
        (o, n) if n < o => DiffStatus::Shrunk,
        _ => DiffStatus::Unchanged,
    }
}

/// 增长率（百分比）；`old_size == 0` 时返回 `None`（新增，增长率无意义）
fn growth_rate(old_size: u64, new_size: u64) -> Option<f64> {
    if old_size == 0 {
        return None;
    }
    Some(((new_size as f64 - old_size as f64) / old_size as f64) * 100.0)
}

/// 递归对比两棵 `FileNode`（按 path 精确匹配），返回合并的差异树（并集）。
///
/// 旧树中存在而新树中已消失的节点以 `status=Removed, new_size=0` 挂到
/// 最近存活的祖先下；子集排序把 Removed 排最后，其余按 new_size 降序。
fn diff_nodes(base: Option<&FileNode>, target: Option<&FileNode>) -> FileNodeDiff {
    let name = target
        .map(|n| n.name.clone())
        .or_else(|| base.map(|n| n.name.clone()))
        .unwrap_or_default();
    let path = target
        .map(|n| n.path.clone())
        .or_else(|| base.map(|n| n.path.clone()))
        .unwrap_or_default();
    let is_dir = target.map(|n| n.is_dir).or(base.map(|n| n.is_dir)).unwrap_or(false);
    let category = target
        .map(|n| n.category.clone())
        .or_else(|| base.map(|n| n.category.clone()))
        .unwrap_or(FileCategory::Other);
    let old_size = base.map(|n| n.size).unwrap_or(0);
    let new_size = target.map(|n| n.size).unwrap_or(0);

    let mut child_diffs: Vec<FileNodeDiff> = Vec::new();
    match (base, target) {
        (Some(b), Some(t)) => {
            let bmap: HashMap<&str, &FileNode> = b
                .children
                .as_deref()
                .unwrap_or(&[])
                .iter()
                .map(|c| (c.path.as_str(), c))
                .collect();
            let tmap: HashMap<&str, &FileNode> = t
                .children
                .as_deref()
                .unwrap_or(&[])
                .iter()
                .map(|c| (c.path.as_str(), c))
                .collect();
            let mut paths: Vec<&str> = bmap.keys().copied().collect();
            paths.extend(tmap.keys().copied());
            paths.sort_unstable();
            paths.dedup();
            child_diffs = paths
                .iter()
                .map(|p| diff_nodes(bmap.get(p).copied(), tmap.get(p).copied()))
                .collect();
        }
        (Some(b), None) => {
            child_diffs = b
                .children
                .as_deref()
                .unwrap_or(&[])
                .iter()
                .map(|c| diff_nodes(Some(c), None))
                .collect();
        }
        (None, Some(t)) => {
            child_diffs = t
                .children
                .as_deref()
                .unwrap_or(&[])
                .iter()
                .map(|c| diff_nodes(None, Some(c)))
                .collect();
        }
        (None, None) => {}
    }

    // Removed 排最后，其余按 new_size 降序
    child_diffs.sort_by(|a, b| {
        let a_removed = usize::from(a.status == DiffStatus::Removed);
        let b_removed = usize::from(b.status == DiffStatus::Removed);
        b_removed.cmp(&a_removed).then(b.new_size.cmp(&a.new_size))
    });
    let children = if child_diffs.is_empty() {
        None
    } else {
        Some(child_diffs)
    };

    FileNodeDiff {
        name,
        path,
        is_dir,
        category,
        old_size,
        new_size,
        delta: new_size as i64 - old_size as i64,
        growth_rate: growth_rate(old_size, new_size),
        status: classify_status(old_size, new_size),
        children,
    }
}

/// 分类差异：直接对比两份 `category_summary`（扫描时已按文件精确聚合），按 |delta| 降序
fn diff_categories(base: &[CategorySummary], target: &[CategorySummary]) -> Vec<CategoryDiff> {
    let b: HashMap<FileCategory, u64> = base
        .iter()
        .map(|c| (c.category.clone(), c.total_size))
        .collect();
    let t: HashMap<FileCategory, u64> = target
        .iter()
        .map(|c| (c.category.clone(), c.total_size))
        .collect();

    let mut seen = HashSet::new();
    let mut categories: Vec<FileCategory> = Vec::new();
    for c in b.keys().chain(t.keys()) {
        if seen.insert(c.clone()) {
            categories.push(c.clone());
        }
    }

    let mut diffs: Vec<CategoryDiff> = categories
        .into_iter()
        .map(|category| {
            let old_size = b.get(&category).copied().unwrap_or(0);
            let new_size = t.get(&category).copied().unwrap_or(0);
            CategoryDiff {
                category,
                old_size,
                new_size,
                delta: new_size as i64 - old_size as i64,
                growth_rate: growth_rate(old_size, new_size),
                status: classify_status(old_size, new_size),
            }
        })
        .collect();
    diffs.sort_by(|a, b| b.delta.abs().cmp(&a.delta.abs()));
    diffs
}

/// 遍历差异树汇总统计。为避免父子层级对字节重复计数，只统计**叶子节点**
/// （在浅树中即「根 + 顶级条目」层）；总量与总变化取自根节点。
fn summarize(root: &FileNodeDiff) -> DiffSummary {
    let mut summary = DiffSummary {
        total_old_size: root.old_size,
        total_new_size: root.new_size,
        total_delta: root.delta,
        grown_count: 0,
        shrunk_count: 0,
        unchanged_count: 0,
        added_count: 0,
        removed_count: 0,
        grown_bytes: 0,
        shrunk_bytes: 0,
    };

    let mut stack = vec![root];
    while let Some(n) = stack.pop() {
        if let Some(children) = &n.children {
            stack.extend(children);
            continue;
        }
        match n.status {
            DiffStatus::Grown => {
                summary.grown_count += 1;
                summary.grown_bytes += n.delta.max(0) as u64;
            }
            DiffStatus::Shrunk => {
                summary.shrunk_count += 1;
                summary.shrunk_bytes += (-n.delta).max(0) as u64;
            }
            DiffStatus::Unchanged => summary.unchanged_count += 1,
            DiffStatus::Added => {
                summary.added_count += 1;
                summary.grown_bytes += n.delta.max(0) as u64;
            }
            DiffStatus::Removed => {
                summary.removed_count += 1;
                summary.shrunk_bytes += (-n.delta).max(0) as u64;
            }
        }
    }
    summary
}

#[cfg(test)]
mod tests {
    use super::*;

    fn node(path: &str, name: &str, size: u64, children: Option<Vec<FileNode>>) -> FileNode {
        FileNode {
            name: name.to_string(),
            path: path.to_string(),
            size,
            is_dir: children.is_some(),
            category: FileCategory::UserData,
            risk_level: RiskLevel::None,
            children,
            modified_at: 0,
            extension: None,
        }
    }

    #[test]
    fn classify_status_covers_all_cases() {
        assert_eq!(classify_status(0, 0), DiffStatus::Unchanged);
        assert_eq!(classify_status(0, 5), DiffStatus::Added);
        assert_eq!(classify_status(5, 0), DiffStatus::Removed);
        assert_eq!(classify_status(5, 10), DiffStatus::Grown);
        assert_eq!(classify_status(10, 5), DiffStatus::Shrunk);
        assert_eq!(classify_status(5, 5), DiffStatus::Unchanged);
    }

    #[test]
    fn growth_rate_handles_zero_old() {
        assert_eq!(growth_rate(0, 5), None);
        assert_eq!(growth_rate(5, 10), Some(100.0));
        assert_eq!(growth_rate(10, 5), Some(-50.0));
    }

    #[test]
    fn diff_nodes_marks_removed_under_surviving_parent() {
        // base: root -> [A(100), B(50)]
        // target: root -> [A(100)]  (B 消失)
        let base_root = node(
            "/Users",
            "Users",
            150,
            Some(vec![
                node("/Users/A", "A", 100, None),
                node("/Users/B", "B", 50, None),
            ]),
        );
        let target_root = node(
            "/Users",
            "Users",
            100,
            Some(vec![node("/Users/A", "A", 100, None)]),
        );

        let diff = diff_nodes(Some(&base_root), Some(&target_root));
        let children = diff.children.unwrap();
        assert_eq!(children.len(), 2);
        let removed = children.iter().find(|c| c.path == "/Users/B").unwrap();
        assert_eq!(removed.status, DiffStatus::Removed);
        assert_eq!(removed.old_size, 50);
        assert_eq!(removed.new_size, 0);
        assert_eq!(removed.delta, -50);
    }

    #[test]
    fn diff_nodes_detects_grown_and_unchanged() {
        let base_root = node(
            "/Users",
            "Users",
            100,
            Some(vec![node("/Users/A", "A", 100, None)]),
        );
        let target_root = node(
            "/Users",
            "Users",
            200,
            Some(vec![node("/Users/A", "A", 200, None)]),
        );
        let diff = diff_nodes(Some(&base_root), Some(&target_root));
        assert_eq!(diff.status, DiffStatus::Grown);
        assert_eq!(diff.growth_rate, Some(100.0));
        let a = diff.children.unwrap()[0].clone();
        assert_eq!(a.status, DiffStatus::Grown);
        assert_eq!(a.delta, 100);
    }

    #[test]
    fn summarize_counts_leaves_only() {
        // 根 + 两个顶级条目（A 增大 100，B 减小 30），根不是叶子不计入
        let root = FileNodeDiff {
            name: "root".into(),
            path: "/".into(),
            is_dir: true,
            category: FileCategory::UserData,
            old_size: 100,
            new_size: 170,
            delta: 70,
            growth_rate: Some(70.0),
            status: DiffStatus::Grown,
            children: Some(vec![
                FileNodeDiff {
                    name: "A".into(),
                    path: "/A".into(),
                    is_dir: true,
                    category: FileCategory::UserData,
                    old_size: 100,
                    new_size: 200,
                    delta: 100,
                    growth_rate: Some(100.0),
                    status: DiffStatus::Grown,
                    children: None,
                },
                FileNodeDiff {
                    name: "B".into(),
                    path: "/B".into(),
                    is_dir: true,
                    category: FileCategory::UserData,
                    old_size: 30,
                    new_size: 0,
                    delta: -30,
                    growth_rate: None,
                    status: DiffStatus::Removed,
                    children: None,
                },
            ]),
        };
        let s = summarize(&root);
        assert_eq!(s.total_old_size, 100);
        assert_eq!(s.total_new_size, 170);
        assert_eq!(s.total_delta, 70);
        assert_eq!(s.grown_count, 1);
        assert_eq!(s.removed_count, 1);
        assert_eq!(s.grown_bytes, 100);
        assert_eq!(s.shrunk_bytes, 30);
    }

    #[test]
    fn diff_categories_aggregates_and_sorts() {
        let base = vec![
            CategorySummary { category: FileCategory::Downloads, total_size: 100, file_count: 1, percentage: 0.0 },
            CategorySummary { category: FileCategory::Logs, total_size: 10, file_count: 1, percentage: 0.0 },
        ];
        let target = vec![
            CategorySummary { category: FileCategory::Downloads, total_size: 400, file_count: 1, percentage: 0.0 },
        ];
        let diffs = diff_categories(&base, &target);
        assert_eq!(diffs.len(), 2);
        let downloads = diffs.iter().find(|c| c.category == FileCategory::Downloads).unwrap();
        assert_eq!(downloads.status, DiffStatus::Grown);
        assert_eq!(downloads.delta, 300);
        // Logs 从 base 消失 → Removed
        let logs = diffs.iter().find(|c| c.category == FileCategory::Logs).unwrap();
        assert_eq!(logs.status, DiffStatus::Removed);
        assert_eq!(logs.old_size, 10);
        assert_eq!(logs.new_size, 0);
        // 按 |delta| 降序：Downloads(300) 在 Logs(10) 前
        assert_eq!(diffs[0].category, FileCategory::Downloads);
    }
}
