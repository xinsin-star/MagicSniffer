//! macOS 文件系统扫描器 — 两阶段高性能扫描 + 边扫边预览
//!
//! ## 算法设计
//!
//! **Phase 1 — 并行扁平遍历** (flat walk + size aggregation)
//!   使用 rayon 对顶级目录并行处理，每个 worker 在子树内做高效
//!   串行 walkdir。收集扁平化的 FlatEntry 列表。
//!   每完成一棵顶级子树（及进行中尺寸更新）即推送 ScanPreview，
//!   实现 MagicSniffer 式「边加载边预览」。
//!
//! **Phase 2 — 树构建 + 分类** (tree assembly + categorization)
//!   从 FlatEntry 列表构建 FileNode 树。按路径前缀聚合，
//!   每层按大小取 top-N 目录展开子级。分类在此时批量完成。

use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Instant;

use rayon::prelude::*;
use tauri::{AppHandle, Emitter};
use walkdir::WalkDir;

use crate::categorizer::Categorizer;
use crate::models::*;
use crate::risk::RiskAssessor;

/// 扁平化的文件条目 — Phase 1 的产物
#[derive(Debug, Clone)]
struct FlatEntry {
    name: String,
    path: PathBuf,
    size: u64,
    is_dir: bool,
    parent_path: Option<PathBuf>,
    ext_lower: Option<String>,
}

/// 进度 / 预览节流器
struct ProgressThrottle {
    last_emit: Mutex<Instant>,
    interval_ms: u64,
}

impl ProgressThrottle {
    fn new(interval_ms: u64) -> Self {
        ProgressThrottle {
            last_emit: Mutex::new(Instant::now() - std::time::Duration::from_secs(10)),
            interval_ms,
        }
    }

    fn should_emit(&self) -> bool {
        if let Ok(mut last) = self.last_emit.lock() {
            let now = Instant::now();
            if now.duration_since(*last).as_millis() as u64 >= self.interval_ms {
                *last = now;
                return true;
            }
        }
        false
    }

    /// 强制允许下一次立即发出（用于子树完成等关键节点）
    fn force_ready(&self) {
        if let Ok(mut last) = self.last_emit.lock() {
            *last = Instant::now() - std::time::Duration::from_secs(10);
        }
    }
}

/// 边扫边预览的共享状态
struct PreviewAccumulator {
    /// 已完成的顶级子树条目
    completed: HashMap<PathBuf, Vec<FlatEntry>>,
    /// 尚未完成的顶级目录当前累计大小（仅文件字节）
    in_progress_size: HashMap<PathBuf, u64>,
    /// 顶级目录元信息（保持 read_dir 顺序）
    top_dirs: Vec<TopDirMeta>,
}

#[derive(Clone)]
struct TopDirMeta {
    path: PathBuf,
    name: String,
    is_dir: bool,
    /// 顶级文件的固定大小（非目录）
    file_size: u64,
    ext_lower: Option<String>,
}

/// 文件系统扫描器
pub struct Scanner {
    categorizer: Categorizer,
    risk_assessor: RiskAssessor,
}

impl Scanner {
    pub fn new() -> Self {
        Scanner {
            categorizer: Categorizer::new(),
            risk_assessor: RiskAssessor::new(),
        }
    }

    /// 执行文件系统扫描（边扫边推送预览）
    pub fn scan(
        &self,
        request: ScanRequest,
        app_handle: Option<AppHandle>,
    ) -> Result<ScanResult, String> {
        let start = Instant::now();
        let path = Path::new(&request.path);

        if !path.exists() {
            return Err(format!("路径不存在: {}", request.path));
        }

        let progress_throttle = Arc::new(ProgressThrottle::new(200));
        let preview_throttle = Arc::new(ProgressThrottle::new(350));
        let files_found = Arc::new(AtomicU64::new(0));
        let dirs_scanned = Arc::new(AtomicU64::new(0));

        emit_progress(&app_handle, &request.path, 0, 0, "正在枚举顶级目录...");

        // ━━━━━ Phase 1: 并行扁平遍历 + 增量预览 ━━━━━━━━━━━━━━━━
        let flat_entries = self.parallel_flat_walk(
            path,
            &request,
            &files_found,
            &dirs_scanned,
            &progress_throttle,
            &preview_throttle,
            &app_handle,
        );

        let total_files = files_found.load(Ordering::Relaxed);
        let total_dirs = dirs_scanned.load(Ordering::Relaxed);

        emit_progress(
            &app_handle,
            &request.path,
            total_files,
            total_dirs,
            "正在构建最终结果...",
        );

        // ━━━━━ Phase 2: 构建最终结果 ━━━━━━━━━━━━━━━━━━━━━━━━━━━
        let root_node = self.build_tree_from_flat(path, &flat_entries, 3);
        let category_summary = self.build_summary_from_flat(&flat_entries);
        let elapsed = start.elapsed().as_millis() as u64;

        // 最终预览（与结果一致，保证前端状态同步）
        emit_preview(
            &app_handle,
            &root_node,
            &category_summary,
            total_files,
            total_dirs,
            flat_entries
                .iter()
                .filter(|e| {
                    e.parent_path
                        .as_ref()
                        .map(|p| p == path)
                        .unwrap_or(false)
                })
                .count() as u32,
            flat_entries
                .iter()
                .filter(|e| {
                    e.parent_path
                        .as_ref()
                        .map(|p| p == path)
                        .unwrap_or(false)
                })
                .count() as u32,
        );

        emit_progress(&app_handle, &request.path, total_files, total_dirs, "扫描完成");

        Ok(ScanResult {
            root_path: request.path.clone(),
            total_files,
            total_dirs,
            elapsed_ms: elapsed,
            root_node,
            category_summary,
        })
    }

    /// Phase 1 — 并行扁平遍历，顶级子树完成即推送预览
    fn parallel_flat_walk(
        &self,
        root: &Path,
        request: &ScanRequest,
        files_found: &Arc<AtomicU64>,
        dirs_scanned: &Arc<AtomicU64>,
        progress_throttle: &Arc<ProgressThrottle>,
        preview_throttle: &Arc<ProgressThrottle>,
        app_handle: &Option<AppHandle>,
    ) -> Vec<FlatEntry> {
        // 收集顶级条目
        let top_metas: Vec<TopDirMeta> = match fs::read_dir(root) {
            Ok(iter) => iter
                .filter_map(|e| e.ok())
                .filter_map(|e| {
                    let p = e.path();
                    if p.is_symlink() {
                        return None;
                    }
                    let ps = p.to_string_lossy();
                    if request.exclude_patterns.iter().any(|pat| ps.contains(pat)) {
                        return None;
                    }
                    let name = e.file_name().to_string_lossy().to_string();
                    let meta = e.metadata().ok()?;
                    let is_dir = meta.is_dir();
                    let file_size = if is_dir { 0 } else { meta.len() };
                    if !is_dir && file_size < request.min_file_size {
                        return None;
                    }
                    let ext_lower = p
                        .extension()
                        .map(|ext| ext.to_string_lossy().to_lowercase());
                    Some(TopDirMeta {
                        path: p,
                        name,
                        is_dir,
                        file_size,
                        ext_lower,
                    })
                })
                .collect(),
            Err(_) => return vec![],
        };

        let total_top = top_metas.len() as u32;
        let accumulator = Arc::new(Mutex::new(PreviewAccumulator {
            completed: HashMap::new(),
            in_progress_size: HashMap::new(),
            top_dirs: top_metas.clone(),
        }));

        // 立即推送骨架预览（顶级目录出现，尺寸待填充）
        self.emit_live_preview(
            root,
            &accumulator,
            files_found,
            dirs_scanned,
            0,
            total_top,
            app_handle,
            2,
        );

        // 分离：顶级文件直接入库；顶级目录并行 walk
        let (top_files, top_dirs): (Vec<_>, Vec<_>) =
            top_metas.into_iter().partition(|m| !m.is_dir);

        {
            let mut acc = accumulator.lock().unwrap();
            for f in &top_files {
                files_found.fetch_add(1, Ordering::Relaxed);
                acc.completed.insert(
                    f.path.clone(),
                    vec![FlatEntry {
                        name: f.name.clone(),
                        path: f.path.clone(),
                        size: f.file_size,
                        is_dir: false,
                        parent_path: Some(root.to_path_buf()),
                        ext_lower: f.ext_lower.clone(),
                    }],
                );
            }
        }

        if !top_files.is_empty() {
            preview_throttle.force_ready();
            self.emit_live_preview(
                root,
                &accumulator,
                files_found,
                dirs_scanned,
                top_files.len() as u32,
                total_top,
                app_handle,
                2,
            );
        }

        let results: Vec<Vec<FlatEntry>> = top_dirs
            .par_iter()
            .filter_map(|meta| {
                let running_size = Arc::new(AtomicU64::new(0));

                let entries = self.walk_subtree(
                    &meta.path,
                    request,
                    files_found,
                    dirs_scanned,
                    progress_throttle,
                    preview_throttle,
                    app_handle,
                    Some((
                        root,
                        &accumulator,
                        &running_size,
                        &meta.path,
                        total_top,
                    )),
                )?;

                // 子树完成：写入 completed，清除 in_progress
                {
                    let mut acc = accumulator.lock().unwrap();
                    acc.in_progress_size.remove(&meta.path);
                    acc.completed.insert(meta.path.clone(), entries.clone());
                }

                preview_throttle.force_ready();
                let completed_count = {
                    let acc = accumulator.lock().unwrap();
                    acc.completed.len() as u32
                };
                self.emit_live_preview(
                    root,
                    &accumulator,
                    files_found,
                    dirs_scanned,
                    completed_count,
                    total_top,
                    app_handle,
                    3,
                );

                Some(entries)
            })
            .collect();

        let mut all = Vec::with_capacity(results.iter().map(|r| r.len()).sum::<usize>() + 64);
        // 顶级文件
        for f in &top_files {
            all.push(FlatEntry {
                name: f.name.clone(),
                path: f.path.clone(),
                size: f.file_size,
                is_dir: false,
                parent_path: Some(root.to_path_buf()),
                ext_lower: f.ext_lower.clone(),
            });
        }
        for r in results {
            all.extend(r);
        }
        all
    }

    /// 使用 walkdir 高效遍历单个子树；可选推送进行中预览
    fn walk_subtree(
        &self,
        top_path: &Path,
        request: &ScanRequest,
        files_found: &Arc<AtomicU64>,
        dirs_scanned: &Arc<AtomicU64>,
        progress_throttle: &Arc<ProgressThrottle>,
        preview_throttle: &Arc<ProgressThrottle>,
        app_handle: &Option<AppHandle>,
        live: Option<(
            &Path,
            &Arc<Mutex<PreviewAccumulator>>,
            &Arc<AtomicU64>,
            &PathBuf,
            u32,
        )>,
    ) -> Option<Vec<FlatEntry>> {
        let mut entries: Vec<FlatEntry> = Vec::with_capacity(10000);

        let walker = WalkDir::new(top_path)
            .follow_links(false)
            .max_depth(match request.max_depth {
                Some(d) => d as usize + 1,
                None => 100,
            })
            .into_iter();

        for entry in walker {
            let entry = match entry {
                Ok(e) => e,
                Err(_) => continue,
            };

            let entry_path = entry.path();
            let file_name = entry.file_name().to_string_lossy().to_string();
            let eps = entry_path.to_string_lossy();
            if request.exclude_patterns.iter().any(|pat| eps.contains(pat)) {
                continue;
            }

            let metadata = match entry.metadata() {
                Ok(m) => m,
                Err(_) => continue,
            };

            let is_dir = metadata.is_dir();
            let file_size = if is_dir { 0 } else { metadata.len() };

            if !is_dir && file_size < request.min_file_size {
                continue;
            }

            let ext_lower = entry_path
                .extension()
                .map(|e| e.to_string_lossy().to_lowercase());
            let parent_path = entry_path.parent().map(|p| p.to_path_buf());

            entries.push(FlatEntry {
                name: file_name,
                path: entry_path.to_path_buf(),
                size: file_size,
                is_dir,
                parent_path,
                ext_lower,
            });

            if is_dir {
                dirs_scanned.fetch_add(1, Ordering::Relaxed);
            } else {
                files_found.fetch_add(1, Ordering::Relaxed);
                if let Some((root, acc, running, top_key, total_top)) = &live {
                    let new_size = running.fetch_add(file_size, Ordering::Relaxed) + file_size;
                    {
                        let mut guard = acc.lock().unwrap();
                        guard.in_progress_size.insert((*top_key).clone(), new_size);
                    }
                    if preview_throttle.should_emit() {
                        let completed_count = {
                            let guard = acc.lock().unwrap();
                            guard.completed.len() as u32
                        };
                        self.emit_live_preview(
                            root,
                            acc,
                            files_found,
                            dirs_scanned,
                            completed_count,
                            *total_top,
                            app_handle,
                            2,
                        );
                    }
                }
            }

            if progress_throttle.should_emit() {
                emit_progress(
                    app_handle,
                    &eps,
                    files_found.load(Ordering::Relaxed),
                    dirs_scanned.load(Ordering::Relaxed),
                    "正在扫描文件系统...",
                );
            }
        }

        self.aggregate_dir_sizes(&mut entries);
        Some(entries)
    }

    /// 根据累加器构建并推送增量预览树
    fn emit_live_preview(
        &self,
        root: &Path,
        accumulator: &Arc<Mutex<PreviewAccumulator>>,
        files_found: &Arc<AtomicU64>,
        dirs_scanned: &Arc<AtomicU64>,
        completed_top_dirs: u32,
        total_top_dirs: u32,
        app_handle: &Option<AppHandle>,
        depth: u32,
    ) {
        let acc = match accumulator.lock() {
            Ok(g) => g,
            Err(_) => return,
        };

        let mut children: Vec<FileNode> = Vec::with_capacity(acc.top_dirs.len());

        for meta in &acc.top_dirs {
            if let Some(entries) = acc.completed.get(&meta.path) {
                if meta.is_dir {
                    // 完整子树：从该子树 flat 构建节点
                    let node = self.build_subtree_root(meta, entries, depth);
                    children.push(node);
                } else if let Some(entry) = entries.first() {
                    children.push(self.flat_to_leaf(entry));
                }
            } else if let Some(&size) = acc.in_progress_size.get(&meta.path) {
                if size == 0 {
                    continue;
                }
                // 进行中：仅显示当前累计大小的占位块（MagicSniffer 风格生长中）
                let category = self.categorizer.categorize(&meta.path, &meta.name);
                let risk = self
                    .risk_assessor
                    .assess(&meta.path, &meta.name, &category);
                children.push(FileNode {
                    name: meta.name.clone(),
                    path: meta.path.to_string_lossy().to_string(),
                    size,
                    is_dir: true,
                    category,
                    risk_level: risk,
                    children: Some(vec![]),
                    modified_at: 0,
                    extension: None,
                });
            }
            // 尚未开始的目录：暂不渲染，避免 0 尺寸占位干扰布局
        }

        if children.is_empty() {
            return;
        }

        children.sort_by(|a, b| b.size.cmp(&a.size));
        let total_size: u64 = children.iter().map(|c| c.size).sum();

        let root_name = root
            .file_name()
            .unwrap_or_else(|| root.as_os_str())
            .to_string_lossy()
            .to_string();
        let path_str = root.to_string_lossy().to_string();
        let category = self.categorizer.categorize(root, &root_name);
        let risk = self.risk_assessor.assess(root, &root_name, &category);

        let root_node = FileNode {
            name: root_name,
            path: path_str,
            size: total_size,
            is_dir: true,
            category,
            risk_level: risk,
            children: Some(children),
            modified_at: 0,
            extension: None,
        };

        // 从已完成条目汇总分类；进行中只按体积归入 Other 近似即可
        let mut flat_for_summary: Vec<&FlatEntry> = Vec::new();
        for entries in acc.completed.values() {
            for e in entries {
                flat_for_summary.push(e);
            }
        }
        let mut category_summary = self.build_summary_from_flat_refs(&flat_for_summary);
        for (_path, &size) in &acc.in_progress_size {
            if size == 0 {
                continue;
            }
            // 进行中体积暂记 Other，最终结果会纠正
            if let Some(s) = category_summary
                .iter_mut()
                .find(|s| s.category == FileCategory::Other)
            {
                s.total_size += size;
            } else {
                category_summary.push(CategorySummary {
                    category: FileCategory::Other,
                    total_size: size,
                    file_count: 0,
                    percentage: 0.0,
                });
            }
        }
        let sum_total: u64 = category_summary.iter().map(|s| s.total_size).sum();
        for s in &mut category_summary {
            if sum_total > 0 {
                s.percentage = (s.total_size as f64 / sum_total as f64) * 100.0;
            }
        }

        drop(acc);

        emit_preview(
            app_handle,
            &root_node,
            &category_summary,
            files_found.load(Ordering::Relaxed),
            dirs_scanned.load(Ordering::Relaxed),
            completed_top_dirs,
            total_top_dirs,
        );
    }

    /// 从单个顶级目录的 flat 条目构建其子树根节点
    fn build_subtree_root(
        &self,
        meta: &TopDirMeta,
        entries: &[FlatEntry],
        max_depth: u32,
    ) -> FileNode {
        // 找到对应顶级目录条目本身
        let self_entry = entries.iter().find(|e| e.path == meta.path);
        let size = self_entry.map(|e| e.size).unwrap_or_else(|| {
            entries.iter().filter(|e| !e.is_dir).map(|e| e.size).sum()
        });

        let category = self.categorizer.categorize(&meta.path, &meta.name);
        let risk = self
            .risk_assessor
            .assess(&meta.path, &meta.name, &category);

        if max_depth <= 1 {
            return FileNode {
                name: meta.name.clone(),
                path: meta.path.to_string_lossy().to_string(),
                size,
                is_dir: true,
                category,
                risk_level: risk,
                children: Some(vec![]),
                modified_at: 0,
                extension: None,
            };
        }

        let child_entries: Vec<&FlatEntry> = entries
            .iter()
            .filter(|e| {
                e.parent_path
                    .as_ref()
                    .map(|p| p == &meta.path)
                    .unwrap_or(false)
            })
            .collect();

        let mut sorted: Vec<&FlatEntry> = child_entries;
        sorted.sort_by(|a, b| b.size.cmp(&a.size));
        let top: Vec<&FlatEntry> = sorted.into_iter().take(100).collect();

        let children: Vec<FileNode> = top
            .iter()
            .map(|child| self.build_node_recursive(child, entries, 1, max_depth))
            .collect();

        FileNode {
            name: meta.name.clone(),
            path: meta.path.to_string_lossy().to_string(),
            size,
            is_dir: true,
            category,
            risk_level: risk,
            children: Some(children),
            modified_at: 0,
            extension: None,
        }
    }

    fn flat_to_leaf(&self, entry: &FlatEntry) -> FileNode {
        let category = self.categorizer.categorize(&entry.path, &entry.name);
        let risk = self
            .risk_assessor
            .assess(&entry.path, &entry.name, &category);
        FileNode {
            name: entry.name.clone(),
            path: entry.path.to_string_lossy().to_string(),
            size: entry.size,
            is_dir: entry.is_dir,
            category,
            risk_level: risk,
            children: if entry.is_dir { Some(vec![]) } else { None },
            modified_at: 0,
            extension: entry.ext_lower.clone(),
        }
    }

    /// 目录大小聚合
    fn aggregate_dir_sizes(&self, entries: &mut [FlatEntry]) {
        let path_to_idx: HashMap<&Path, usize> = entries
            .iter()
            .enumerate()
            .filter(|(_, e)| e.is_dir)
            .map(|(i, e)| (e.path.as_path(), i))
            .collect();

        let mut dir_sizes: Vec<u64> = vec![0; entries.len()];

        for entry in entries.iter() {
            if !entry.is_dir {
                let mut current = entry.parent_path.as_deref();
                while let Some(parent) = current {
                    if let Some(&idx) = path_to_idx.get(parent) {
                        dir_sizes[idx] += entry.size;
                    }
                    current = parent.parent();
                }
            }
        }

        for (i, entry) in entries.iter_mut().enumerate() {
            if entry.is_dir {
                entry.size = dir_sizes[i];
            }
        }
    }

    /// Phase 2 — 从扁平列表构建树（限制深度）
    fn build_tree_from_flat(&self, root: &Path, flat: &[FlatEntry], max_depth: u32) -> FileNode {
        let root_children: Vec<&FlatEntry> = flat
            .iter()
            .filter(|e| {
                e.parent_path
                    .as_ref()
                    .map(|p| p == root)
                    .unwrap_or(false)
            })
            .collect();

        let mut sorted: Vec<&FlatEntry> = root_children;
        sorted.sort_by(|a, b| b.size.cmp(&a.size));
        let top_children: Vec<&FlatEntry> = sorted.into_iter().take(200).collect();

        let children: Vec<FileNode> = top_children
            .iter()
            .map(|entry| self.build_node_recursive(entry, flat, 1, max_depth))
            .collect();

        let total_size: u64 = children.iter().map(|c| c.size).sum();
        let root_name = root
            .file_name()
            .unwrap_or_else(|| root.as_os_str())
            .to_string_lossy()
            .to_string();

        let path_str = root.to_string_lossy().to_string();
        let category = self.categorizer.categorize(root, &root_name);
        let risk = self.risk_assessor.assess(root, &root_name, &category);

        FileNode {
            name: root_name,
            path: path_str,
            size: total_size,
            is_dir: true,
            category,
            risk_level: risk,
            children: Some(children),
            modified_at: 0,
            extension: None,
        }
    }

    fn build_node_recursive(
        &self,
        entry: &FlatEntry,
        flat: &[FlatEntry],
        depth: u32,
        max_depth: u32,
    ) -> FileNode {
        let category = self.categorizer.categorize(&entry.path, &entry.name);
        let risk = self
            .risk_assessor
            .assess(&entry.path, &entry.name, &category);

        if !entry.is_dir || depth >= max_depth {
            return FileNode {
                name: entry.name.clone(),
                path: entry.path.to_string_lossy().to_string(),
                size: entry.size,
                is_dir: entry.is_dir,
                category,
                risk_level: risk,
                children: if entry.is_dir { Some(vec![]) } else { None },
                modified_at: 0,
                extension: entry.ext_lower.clone(),
            };
        }

        let child_entries: Vec<&FlatEntry> = flat
            .iter()
            .filter(|e| {
                e.parent_path
                    .as_ref()
                    .map(|p| p == &entry.path)
                    .unwrap_or(false)
            })
            .collect();

        let mut sorted: Vec<&FlatEntry> = child_entries;
        sorted.sort_by(|a, b| b.size.cmp(&a.size));
        let top: Vec<&FlatEntry> = sorted.into_iter().take(100).collect();

        let children: Vec<FileNode> = top
            .iter()
            .map(|child| self.build_node_recursive(child, flat, depth + 1, max_depth))
            .collect();

        let total_child_size: u64 = children.iter().map(|c| c.size).sum();

        FileNode {
            name: entry.name.clone(),
            path: entry.path.to_string_lossy().to_string(),
            size: if entry.is_dir && total_child_size > 0 {
                total_child_size
            } else {
                entry.size
            },
            is_dir: entry.is_dir,
            category,
            risk_level: risk,
            children: if children.is_empty() {
                Some(vec![])
            } else {
                Some(children)
            },
            modified_at: 0,
            extension: entry.ext_lower.clone(),
        }
    }

    fn build_summary_from_flat(&self, flat: &[FlatEntry]) -> Vec<CategorySummary> {
        let refs: Vec<&FlatEntry> = flat.iter().collect();
        self.build_summary_from_flat_refs(&refs)
    }

    fn build_summary_from_flat_refs(&self, flat: &[&FlatEntry]) -> Vec<CategorySummary> {
        let mut summaries: Vec<CategorySummary> = Vec::with_capacity(13);

        for entry in flat {
            let category = self.categorizer.categorize(&entry.path, &entry.name);

            if let Some(existing) = summaries
                .iter_mut()
                .find(|s: &&mut CategorySummary| s.category == category)
            {
                // 目录 size 已是子树合计，只计文件避免双计
                if !entry.is_dir {
                    existing.total_size += entry.size;
                    existing.file_count += 1;
                }
            } else if !entry.is_dir {
                summaries.push(CategorySummary {
                    category,
                    total_size: entry.size,
                    file_count: 1,
                    percentage: 0.0,
                });
            }
        }

        let total: u64 = summaries.iter().map(|s| s.total_size).sum();
        for s in &mut summaries {
            if total > 0 {
                s.percentage = (s.total_size as f64 / total as f64) * 100.0;
            }
        }

        summaries
    }
}

fn emit_progress(
    app_handle: &Option<AppHandle>,
    current_path: &str,
    files_found: u64,
    dirs_scanned: u64,
    phase: &str,
) {
    if let Some(ref handle) = app_handle {
        let _ = handle.emit(
            "scan-progress",
            ScanProgress {
                current_path: current_path.to_string(),
                files_found,
                dirs_scanned,
                phase: phase.to_string(),
            },
        );
    }
}

fn emit_preview(
    app_handle: &Option<AppHandle>,
    root_node: &FileNode,
    category_summary: &[CategorySummary],
    files_found: u64,
    dirs_scanned: u64,
    completed_top_dirs: u32,
    total_top_dirs: u32,
) {
    if let Some(ref handle) = app_handle {
        let _ = handle.emit(
            "scan-preview",
            ScanPreview {
                root_node: root_node.clone(),
                category_summary: category_summary.to_vec(),
                files_found,
                dirs_scanned,
                completed_top_dirs,
                total_top_dirs,
            },
        );
    }
}
