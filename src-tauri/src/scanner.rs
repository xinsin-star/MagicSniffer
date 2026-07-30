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

use std::collections::{HashMap, HashSet, VecDeque};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Instant;

use tauri::{AppHandle, Emitter};
use walkdir::WalkDir;

use crate::categorizer::Categorizer;
use crate::models::*;
use crate::risk::RiskAssessor;
use crate::scan_control::{path_is_under, ScanControl};

/// 扁平化的文件条目 — Phase 1 的产物。
/// `category` / `risk_level` 在遍历时一次性预计算，避免后续重复分类。
#[derive(Debug, Clone)]
struct FlatEntry {
    name: String,
    path: PathBuf,
    size: u64,
    is_dir: bool,
    parent_path: Option<PathBuf>,
    ext_lower: Option<String>,
    category: FileCategory,
    risk_level: RiskLevel,
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

/// 单棵子树预计算缓存：建好的根节点 + 分类小计
struct SubtreeCache {
    root: FileNode,
    /// (size, count) per category — 仅计文件，避免双计
    category_tally: HashMap<FileCategory, (u64, u64)>,
}

/// 边扫边预览的共享状态
struct PreviewAccumulator {
    /// 已完成的顶级子树条目
    completed: HashMap<PathBuf, Vec<FlatEntry>>,
    /// 已完成子树的预计算缓存（root + 分类小计），预览直接复用
    subtree_cache: HashMap<PathBuf, SubtreeCache>,
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
    category: FileCategory,
    risk_level: RiskLevel,
}

/// 扫描产出（可含未完成断点）
pub struct ScanOutcome {
    pub result: ScanResult,
    pub incomplete: bool,
    pub pending_paths: Vec<String>,
    pub completed_paths: Vec<String>,
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

    /// 执行文件系统扫描（边扫边推送预览，支持优先级与取消）
    pub fn scan(
        &self,
        request: ScanRequest,
        app_handle: Option<AppHandle>,
        control: Arc<ScanControl>,
        resume: Option<&CachedScan>,
    ) -> Result<ScanOutcome, String> {
        let start = Instant::now();
        let expanded = expand_user_path(&request.path);
        let path = Path::new(&expanded);

        if !path.exists() {
            return Err(format!("路径不存在: {}", expanded));
        }
        if !path.is_dir() {
            return Err(format!("不是可扫描的目录: {}", expanded));
        }

        let progress_throttle = Arc::new(ProgressThrottle::new(200));
        let preview_throttle = Arc::new(ProgressThrottle::new(350));
        let files_found = Arc::new(AtomicU64::new(
            resume.map(|c| c.result.total_files).unwrap_or(0),
        ));
        let dirs_scanned = Arc::new(AtomicU64::new(
            resume.map(|c| c.result.total_dirs).unwrap_or(0),
        ));

        emit_progress(&app_handle, &expanded, 0, 0, "正在枚举顶级目录...");

        let walk = self.priority_flat_walk(
            path,
            &request,
            &files_found,
            &dirs_scanned,
            &progress_throttle,
            &preview_throttle,
            &app_handle,
            &control,
            resume,
        );

        let total_files = files_found.load(Ordering::Relaxed);
        let total_dirs = dirs_scanned.load(Ordering::Relaxed);
        let incomplete = walk.incomplete || control.is_cancelled();

        emit_progress(
            &app_handle,
            &expanded,
            total_files,
            total_dirs,
            if incomplete {
                "扫描已暂停，正在保存断点..."
            } else {
                "正在构建最终结果..."
            },
        );

        let index = build_parent_index(&walk.flat_entries);
        let root_node = if walk.flat_entries.is_empty() {
            // 续扫时可能只有已完成的树节点：用预览树
            walk.preview_root.unwrap_or_else(|| FileNode {
                name: path
                    .file_name()
                    .unwrap_or_else(|| path.as_os_str())
                    .to_string_lossy()
                    .to_string(),
                path: expanded.clone(),
                size: 0,
                is_dir: true,
                category: FileCategory::Other,
                risk_level: RiskLevel::Low,
                children: Some(vec![]),
                modified_at: 0,
                extension: None,
            })
        } else {
            self.build_tree_from_flat(path, &walk.flat_entries, &index, 3)
        };

        // 合并续扫时已缓存的已完成子树
        let root_node = if let Some(prev) = resume {
            merge_completed_children(root_node, &prev.result.root_node, &walk.completed_paths)
        } else {
            root_node
        };

        let category_summary = if walk.flat_entries.is_empty() {
            resume
                .map(|c| c.result.category_summary.clone())
                .unwrap_or_default()
        } else {
            self.build_summary_from_flat(&walk.flat_entries)
        };

        let elapsed = start.elapsed().as_millis() as u64
            + resume.map(|c| c.result.elapsed_ms).unwrap_or(0);

        let result = ScanResult {
            root_path: expanded.clone(),
            total_files,
            total_dirs,
            elapsed_ms: elapsed,
            root_node: root_node.clone(),
            category_summary: category_summary.clone(),
        };

        let root_level_count = result
            .root_node
            .children
            .as_ref()
            .map(|c| c.len() as u32)
            .unwrap_or(0);
        emit_preview(
            &app_handle,
            &result.root_node,
            &result.category_summary,
            total_files,
            total_dirs,
            root_level_count,
            root_level_count,
        );

        emit_progress(
            &app_handle,
            &expanded,
            total_files,
            total_dirs,
            if incomplete {
                "扫描已暂停"
            } else {
                "扫描完成"
            },
        );

        Ok(ScanOutcome {
            result,
            incomplete,
            pending_paths: walk.pending_paths,
            completed_paths: walk.completed_paths,
        })
    }

    /// Phase 1 — 优先级队列遍历顶级目录（支持聚焦优先 / 取消断点）
    fn priority_flat_walk(
        &self,
        root: &Path,
        request: &ScanRequest,
        files_found: &Arc<AtomicU64>,
        dirs_scanned: &Arc<AtomicU64>,
        progress_throttle: &Arc<ProgressThrottle>,
        preview_throttle: &Arc<ProgressThrottle>,
        app_handle: &Option<AppHandle>,
        control: &Arc<ScanControl>,
        resume: Option<&CachedScan>,
    ) -> WalkPhaseResult {
        let top_metas: Vec<TopDirMeta> = match fs::read_dir(root) {
            Ok(iter) => iter
                .filter_map(|e| e.ok())
                .filter_map(|e| {
                    let p = e.path();
                    if p.is_symlink() {
                        return None;
                    }
                    let ps = p.to_string_lossy();
                    if is_excluded_path(&ps, &request.exclude_patterns) {
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
                    let category = self.categorizer.categorize(&p, &name);
                    let risk_level = self.risk_assessor.assess(&p, &name, &category);
                    Some(TopDirMeta {
                        path: p,
                        name,
                        is_dir,
                        file_size,
                        ext_lower,
                        category,
                        risk_level,
                    })
                })
                .collect(),
            Err(_) => {
                return WalkPhaseResult {
                    flat_entries: vec![],
                    incomplete: false,
                    pending_paths: vec![],
                    completed_paths: vec![],
                    preview_root: None,
                };
            }
        };

        let completed_set: HashSet<PathBuf> = resume
            .map(|c| {
                c.completed_paths
                    .iter()
                    .map(PathBuf::from)
                    .collect::<HashSet<_>>()
            })
            .unwrap_or_default();

        let total_top = top_metas.len() as u32;
        let accumulator = Arc::new(Mutex::new(PreviewAccumulator {
            completed: HashMap::new(),
            subtree_cache: HashMap::new(),
            in_progress_size: HashMap::new(),
            top_dirs: top_metas.clone(),
        }));

        // 续扫：把已完成子树从上次结果挂回预览缓存
        if let Some(prev) = resume {
            if let Some(children) = &prev.result.root_node.children {
                let mut acc = accumulator.lock().unwrap();
                for child in children {
                    let p = PathBuf::from(&child.path);
                    if completed_set.contains(&p) {
                        acc.subtree_cache.insert(
                            p.clone(),
                            SubtreeCache {
                                root: child.clone(),
                                category_tally: HashMap::new(),
                            },
                        );
                        acc.completed.insert(p, vec![]);
                    }
                }
            }
        }

        self.emit_live_preview(
            root,
            &accumulator,
            files_found,
            dirs_scanned,
            completed_set.len() as u32,
            total_top,
            app_handle,
            2,
        );

        let (top_files, top_dirs): (Vec<_>, Vec<_>) =
            top_metas.into_iter().partition(|m| !m.is_dir);

        let mut all: Vec<FlatEntry> = Vec::new();
        let mut completed_paths: Vec<String> = completed_set
            .iter()
            .map(|p| p.to_string_lossy().to_string())
            .collect();

        {
            let mut acc = accumulator.lock().unwrap();
            for f in &top_files {
                if completed_set.contains(&f.path) {
                    continue;
                }
                files_found.fetch_add(1, Ordering::Relaxed);
                let leaf = FlatEntry {
                    name: f.name.clone(),
                    path: f.path.clone(),
                    size: f.file_size,
                    is_dir: false,
                    parent_path: Some(root.to_path_buf()),
                    ext_lower: f.ext_lower.clone(),
                    category: f.category.clone(),
                    risk_level: f.risk_level.clone(),
                };
                acc.completed.insert(f.path.clone(), vec![leaf.clone()]);
                acc.subtree_cache.insert(
                    f.path.clone(),
                    SubtreeCache {
                        root: FileNode {
                            name: leaf.name.clone(),
                            path: leaf.path.to_string_lossy().to_string(),
                            size: leaf.size,
                            is_dir: false,
                            category: leaf.category.clone(),
                            risk_level: leaf.risk_level.clone(),
                            children: None,
                            modified_at: 0,
                            extension: leaf.ext_lower.clone(),
                        },
                        category_tally: {
                            let mut t = HashMap::new();
                            t.insert(leaf.category.clone(), (leaf.size, 1));
                            t
                        },
                    },
                );
                all.push(leaf);
                completed_paths.push(f.path.to_string_lossy().to_string());
            }
        }

        let mut pending: VecDeque<TopDirMeta> = top_dirs
            .into_iter()
            .filter(|m| !completed_set.contains(&m.path))
            .collect();

        // 若有续扫 pending 列表，按该顺序优先
        if let Some(prev) = resume {
            if !prev.pending_paths.is_empty() {
                let order: HashMap<String, usize> = prev
                    .pending_paths
                    .iter()
                    .enumerate()
                    .map(|(i, p)| (p.clone(), i))
                    .collect();
                let mut v: Vec<_> = pending.drain(..).collect();
                v.sort_by_key(|m| {
                    order
                        .get(&m.path.to_string_lossy().to_string())
                        .copied()
                        .unwrap_or(usize::MAX)
                });
                pending = v.into();
            }
            if let Some(ref focus) = prev.focus_path {
                control.set_priority(Some(PathBuf::from(focus)));
            }
        }

        let mut incomplete = false;

        while let Some(meta) = pop_next_priority(&mut pending, control) {
            if control.is_cancelled() {
                incomplete = true;
                pending.push_front(meta);
                break;
            }

            let running_size = Arc::new(AtomicU64::new(0));
            let walk_res = self.walk_subtree_controlled(
                &meta.path,
                request,
                files_found,
                dirs_scanned,
                progress_throttle,
                preview_throttle,
                app_handle,
                control,
                Some((
                    root,
                    &accumulator,
                    &running_size,
                    &meta.path,
                    total_top,
                )),
            );

            match walk_res {
                WalkStatus::Done(entries) => {
                    {
                        let mut acc = accumulator.lock().unwrap();
                        acc.in_progress_size.remove(&meta.path);
                        acc.completed.insert(meta.path.clone(), entries.clone());
                        let cache = self.build_subtree_cache(&meta, &entries, 2);
                        acc.subtree_cache.insert(meta.path.clone(), cache);
                    }
                    completed_paths.push(meta.path.to_string_lossy().to_string());
                    all.extend(entries);
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
                }
                WalkStatus::Aborted(partial) => {
                    // 部分结果保留为 in_progress / 未完成，目录重回队列
                    if !partial.is_empty() {
                        let size: u64 = partial.iter().filter(|e| !e.is_dir).map(|e| e.size).sum();
                        let mut acc = accumulator.lock().unwrap();
                        acc.in_progress_size.insert(meta.path.clone(), size);
                        // 若因取消中止，保留 partial 到 all 以便预览更准
                        if control.is_cancelled() {
                            all.extend(partial);
                        }
                    }
                    pending.push_back(meta);
                    if control.is_cancelled() {
                        incomplete = true;
                        break;
                    }
                    // 优先级切到其他目录：继续循环（已把当前放回队尾）
                }
            }
        }

        if !pending.is_empty() {
            incomplete = true;
        }

        let preview_root = {
            let acc = accumulator.lock().unwrap();
            // 从缓存拼一个预览根（emit 已做过，这里再取一次供空 flat 时用）
            let mut children: Vec<FileNode> = acc
                .subtree_cache
                .values()
                .map(|c| c.root.clone())
                .collect();
            for (p, &sz) in &acc.in_progress_size {
                if let Some(meta) = acc.top_dirs.iter().find(|m| &m.path == p) {
                    children.push(FileNode {
                        name: meta.name.clone(),
                        path: meta.path.to_string_lossy().to_string(),
                        size: sz,
                        is_dir: true,
                        category: meta.category.clone(),
                        risk_level: meta.risk_level.clone(),
                        children: Some(vec![]),
                        modified_at: 0,
                        extension: None,
                    });
                }
            }
            children.sort_by(|a, b| b.size.cmp(&a.size));
            let total: u64 = children.iter().map(|c| c.size).sum();
            let root_name = root
                .file_name()
                .unwrap_or_else(|| root.as_os_str())
                .to_string_lossy()
                .to_string();
            Some(FileNode {
                name: root_name.clone(),
                path: root.to_string_lossy().to_string(),
                size: total,
                is_dir: true,
                category: self.categorizer.categorize(root, &root_name),
                risk_level: RiskLevel::Low,
                children: Some(children),
                modified_at: 0,
                extension: None,
            })
        };

        WalkPhaseResult {
            flat_entries: all,
            incomplete,
            pending_paths: pending
                .iter()
                .map(|m| m.path.to_string_lossy().to_string())
                .collect(),
            completed_paths,
            preview_root,
        }
    }

    /// 带取消/优先级的子树遍历
    fn walk_subtree_controlled(
        &self,
        top_path: &Path,
        request: &ScanRequest,
        files_found: &Arc<AtomicU64>,
        dirs_scanned: &Arc<AtomicU64>,
        progress_throttle: &Arc<ProgressThrottle>,
        preview_throttle: &Arc<ProgressThrottle>,
        app_handle: &Option<AppHandle>,
        control: &Arc<ScanControl>,
        live: Option<(
            &Path,
            &Arc<Mutex<PreviewAccumulator>>,
            &Arc<AtomicU64>,
            &PathBuf,
            u32,
        )>,
    ) -> WalkStatus {
        let mut entries: Vec<FlatEntry> = Vec::with_capacity(10000);
        let mut skip_prefixes: Vec<PathBuf> = Vec::new();

        // 若当前聚焦在本顶层之下的子路径，先扫聚焦区
        if let Some(prio) = control.priority() {
            if path_is_under(&prio, top_path) && prio != top_path && prio.is_dir() {
                match self.walk_subtree_inner(
                    &prio,
                    request,
                    files_found,
                    dirs_scanned,
                    progress_throttle,
                    preview_throttle,
                    app_handle,
                    control,
                    live,
                    &[],
                ) {
                    WalkStatus::Done(mut e) | WalkStatus::Aborted(mut e) => {
                        entries.append(&mut e);
                        skip_prefixes.push(prio.clone());
                    }
                }
                if control.is_cancelled() {
                    self.aggregate_dir_sizes(&mut entries);
                    return WalkStatus::Aborted(entries);
                }
                // 推送一次聚焦后的预览
                if let Some((root, acc, running, top_key, total_top)) = &live {
                    let size: u64 = entries.iter().filter(|e| !e.is_dir).map(|e| e.size).sum();
                    running.store(size, Ordering::Relaxed);
                    {
                        let mut guard = acc.lock().unwrap();
                        guard.in_progress_size.insert((*top_key).clone(), size);
                    }
                    preview_throttle.force_ready();
                    let completed_count = {
                        let g = acc.lock().unwrap();
                        g.completed.len() as u32
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

        let status = self.walk_subtree_inner(
            top_path,
            request,
            files_found,
            dirs_scanned,
            progress_throttle,
            preview_throttle,
            app_handle,
            control,
            live,
            &skip_prefixes,
        );

        match status {
            WalkStatus::Done(mut rest) => {
                entries.append(&mut rest);
                self.aggregate_dir_sizes(&mut entries);
                // 若中途优先级切到其他顶层，视为中止
                if let Some(prio) = control.priority() {
                    if !path_is_under(&prio, top_path) {
                        return WalkStatus::Aborted(entries);
                    }
                }
                if control.is_cancelled() {
                    WalkStatus::Aborted(entries)
                } else {
                    WalkStatus::Done(entries)
                }
            }
            WalkStatus::Aborted(mut rest) => {
                entries.append(&mut rest);
                self.aggregate_dir_sizes(&mut entries);
                WalkStatus::Aborted(entries)
            }
        }
    }

    fn walk_subtree_inner(
        &self,
        top_path: &Path,
        request: &ScanRequest,
        files_found: &Arc<AtomicU64>,
        dirs_scanned: &Arc<AtomicU64>,
        progress_throttle: &Arc<ProgressThrottle>,
        preview_throttle: &Arc<ProgressThrottle>,
        app_handle: &Option<AppHandle>,
        control: &Arc<ScanControl>,
        live: Option<(
            &Path,
            &Arc<Mutex<PreviewAccumulator>>,
            &Arc<AtomicU64>,
            &PathBuf,
            u32,
        )>,
        skip_prefixes: &[PathBuf],
    ) -> WalkStatus {
        let mut entries: Vec<FlatEntry> = Vec::with_capacity(10000);
        let mut start_gen = control.gen();
        let mut n = 0u64;

        let walker = WalkDir::new(top_path).follow_links(false);
        let walker = match request.max_depth {
            Some(d) => walker.max_depth(d as usize),
            None => walker,
        };
        let walker = walker.into_iter().filter_entry(|e| {
            let p = e.path();
            let ps = p.to_string_lossy();
            if is_excluded_path(&ps, &request.exclude_patterns) {
                return false;
            }
            for skip in skip_prefixes {
                if path_is_under(p, skip) {
                    return false;
                }
            }
            true
        });

        for entry in walker {
            n += 1;
            if n % 64 == 0 {
                if control.is_cancelled() {
                    self.aggregate_dir_sizes(&mut entries);
                    return WalkStatus::Aborted(entries);
                }
                let gen = control.gen();
                if gen != start_gen {
                    start_gen = gen;
                    if let Some(prio) = control.priority() {
                        // 优先级切到其他顶层目录 → 中止当前
                        if let Some((_, _, _, top_key, _)) = &live {
                            if !path_is_under(&prio, top_key) {
                                self.aggregate_dir_sizes(&mut entries);
                                return WalkStatus::Aborted(entries);
                            }
                        } else if !path_is_under(&prio, top_path) {
                            self.aggregate_dir_sizes(&mut entries);
                            return WalkStatus::Aborted(entries);
                        }
                    }
                }
            }

            let entry = match entry {
                Ok(e) => e,
                Err(_) => continue,
            };

            let entry_path = entry.path();
            let file_name = entry.file_name().to_string_lossy().to_string();
            let eps = entry_path.to_string_lossy();

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
            let category = self.categorizer.categorize(entry_path, &file_name);
            let risk_level = self.risk_assessor.assess(entry_path, &file_name, &category);

            entries.push(FlatEntry {
                name: file_name,
                path: entry_path.to_path_buf(),
                size: file_size,
                is_dir,
                parent_path,
                ext_lower,
                category,
                risk_level,
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
        if control.is_cancelled() {
            WalkStatus::Aborted(entries)
        } else {
            WalkStatus::Done(entries)
        }
    }

    /// 从缓存构建并推送增量预览树。
    /// 已完成子树直接复用缓存的 root + category_tally（O(子树数)），
    /// 进行中目录仅用累计大小生成占位块，不再重算全量 flat 条目。
    fn emit_live_preview(
        &self,
        root: &Path,
        accumulator: &Arc<Mutex<PreviewAccumulator>>,
        files_found: &Arc<AtomicU64>,
        dirs_scanned: &Arc<AtomicU64>,
        completed_top_dirs: u32,
        total_top_dirs: u32,
        app_handle: &Option<AppHandle>,
        _depth: u32,
    ) {
        let acc = match accumulator.lock() {
            Ok(g) => g,
            Err(_) => return,
        };

        let mut children: Vec<FileNode> = Vec::with_capacity(acc.top_dirs.len());
        // 汇总分类：聚合各已完成子树的预计算 tally + 进行中体积记 Other
        let mut tally: HashMap<FileCategory, (u64, u64)> = HashMap::new();

        for meta in &acc.top_dirs {
            if let Some(cache) = acc.subtree_cache.get(&meta.path) {
                // 已完成：复用缓存根节点
                children.push(cache.root.clone());
                for (cat, (sz, cnt)) in &cache.category_tally {
                    let e = tally.entry(cat.clone()).or_insert((0, 0));
                    e.0 += sz;
                    e.1 += cnt;
                }
            } else if let Some(&size) = acc.in_progress_size.get(&meta.path) {
                if size == 0 {
                    continue;
                }
                // 进行中：占位块（MagicSniffer 风格生长中）
                children.push(FileNode {
                    name: meta.name.clone(),
                    path: meta.path.to_string_lossy().to_string(),
                    size,
                    is_dir: true,
                    category: meta.category.clone(),
                    risk_level: meta.risk_level.clone(),
                    children: Some(vec![]),
                    modified_at: 0,
                    extension: None,
                });
                // 进行中体积暂记 Other，最终结果会纠正
                let e = tally.entry(FileCategory::Other).or_insert((0, 0));
                e.0 += size;
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

        // 从 tally 构建 category_summary
        let mut category_summary: Vec<CategorySummary> = tally
            .into_iter()
            .map(|(cat, (sz, cnt))| CategorySummary {
                category: cat,
                total_size: sz,
                file_count: cnt,
                percentage: 0.0,
            })
            .collect();
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

    /// 构建子树缓存：根节点（用 parent 索引，O(子树)）+ 分类小计（用预计算 category）
    fn build_subtree_cache(
        &self,
        meta: &TopDirMeta,
        entries: &[FlatEntry],
        max_depth: u32,
    ) -> SubtreeCache {
        let index = build_parent_index(entries);
        let self_entry = entries.iter().find(|e| e.path == meta.path);
        let size = self_entry.map(|e| e.size).unwrap_or_else(|| {
            entries.iter().filter(|e| !e.is_dir).map(|e| e.size).sum()
        });

        let root = if max_depth <= 1 {
            FileNode {
                name: meta.name.clone(),
                path: meta.path.to_string_lossy().to_string(),
                size,
                is_dir: true,
                category: meta.category.clone(),
                risk_level: meta.risk_level.clone(),
                children: Some(vec![]),
                modified_at: 0,
                extension: None,
            }
        } else {
            let child_indices = index
                .get(meta.path.as_path())
                .map(|v| v.as_slice())
                .unwrap_or(&[]);
            let mut sorted: Vec<usize> = child_indices.to_vec();
            sorted.sort_by(|&a, &b| entries[b].size.cmp(&entries[a].size));
            let top: Vec<usize> = sorted.into_iter().take(100).collect();
            let children: Vec<FileNode> = top
                .iter()
                .map(|&i| self.build_node_recursive(&entries[i], entries, &index, 1, max_depth))
                .collect();
            FileNode {
                name: meta.name.clone(),
                path: meta.path.to_string_lossy().to_string(),
                size,
                is_dir: true,
                category: meta.category.clone(),
                risk_level: meta.risk_level.clone(),
                children: Some(children),
                modified_at: 0,
                extension: None,
            }
        };

        // 分类小计：仅计文件，避免双计（目录 size 已含子树）
        let mut tally: HashMap<FileCategory, (u64, u64)> = HashMap::new();
        for e in entries {
            if !e.is_dir {
                let ent = tally.entry(e.category.clone()).or_insert((0, 0));
                ent.0 += e.size;
                ent.1 += 1;
            }
        }

        SubtreeCache {
            root,
            category_tally: tally,
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

    /// Phase 2 — 从扁平列表构建树（限制深度）。使用 parent 索引，O(N)。
    fn build_tree_from_flat(
        &self,
        root: &Path,
        flat: &[FlatEntry],
        index: &HashMap<&Path, Vec<usize>>,
        max_depth: u32,
    ) -> FileNode {
        let root_indices = index.get(root).map(|v| v.as_slice()).unwrap_or(&[]);
        let mut sorted: Vec<usize> = root_indices.to_vec();
        sorted.sort_by(|&a, &b| flat[b].size.cmp(&flat[a].size));
        let top_children: Vec<usize> = sorted.into_iter().take(200).collect();

        let children: Vec<FileNode> = top_children
            .iter()
            .map(|&i| self.build_node_recursive(&flat[i], flat, index, 1, max_depth))
            .collect();

        // 根节点大小 = 所有根级条目大小之和（非仅 top-200），保证统计准确
        let total_size: u64 = root_indices.iter().map(|&i| flat[i].size).sum();
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
        index: &HashMap<&Path, Vec<usize>>,
        depth: u32,
        max_depth: u32,
    ) -> FileNode {
        // 复用预计算的 category / risk，避免重复分类
        if !entry.is_dir || depth >= max_depth {
            return FileNode {
                name: entry.name.clone(),
                path: entry.path.to_string_lossy().to_string(),
                size: entry.size,
                is_dir: entry.is_dir,
                category: entry.category.clone(),
                risk_level: entry.risk_level.clone(),
                children: if entry.is_dir { Some(vec![]) } else { None },
                modified_at: 0,
                extension: entry.ext_lower.clone(),
            };
        }

        let child_indices = index
            .get(entry.path.as_path())
            .map(|v| v.as_slice())
            .unwrap_or(&[]);
        let mut sorted: Vec<usize> = child_indices.to_vec();
        sorted.sort_by(|&a, &b| flat[b].size.cmp(&flat[a].size));
        let top: Vec<usize> = sorted.into_iter().take(100).collect();

        let children: Vec<FileNode> = top
            .iter()
            .map(|&i| self.build_node_recursive(&flat[i], flat, index, depth + 1, max_depth))
            .collect();

        // 目录大小始终用 Phase 1 聚合的 entry.size（含全部子树），
        // 不被 top-N 子项之和覆盖，保证统计准确
        FileNode {
            name: entry.name.clone(),
            path: entry.path.to_string_lossy().to_string(),
            size: entry.size,
            is_dir: entry.is_dir,
            category: entry.category.clone(),
            risk_level: entry.risk_level.clone(),
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
        // 使用预计算的 category，避免重复分类
        let mut tally: HashMap<FileCategory, (u64, u64)> = HashMap::new();
        for entry in flat {
            if !entry.is_dir {
                let e = tally.entry(entry.category.clone()).or_insert((0, 0));
                e.0 += entry.size;
                e.1 += 1;
            }
        }
        let mut summaries: Vec<CategorySummary> = tally
            .into_iter()
            .map(|(cat, (sz, cnt))| CategorySummary {
                category: cat,
                total_size: sz,
                file_count: cnt,
                percentage: 0.0,
            })
            .collect();
        let total: u64 = summaries.iter().map(|s| s.total_size).sum();
        for s in &mut summaries {
            if total > 0 {
                s.percentage = (s.total_size as f64 / total as f64) * 100.0;
            }
        }
        summaries
    }
}

enum WalkStatus {
    Done(Vec<FlatEntry>),
    Aborted(Vec<FlatEntry>),
}

struct WalkPhaseResult {
    flat_entries: Vec<FlatEntry>,
    incomplete: bool,
    pending_paths: Vec<String>,
    completed_paths: Vec<String>,
    preview_root: Option<FileNode>,
}

/// 从队列取出下一个应扫描的顶级目录（优先匹配当前 focus）
fn pop_next_priority(
    pending: &mut VecDeque<TopDirMeta>,
    control: &ScanControl,
) -> Option<TopDirMeta> {
    if pending.is_empty() {
        return None;
    }
    if let Some(prio) = control.priority() {
        if let Some(idx) = pending
            .iter()
            .position(|m| path_is_under(&prio, &m.path) || path_is_under(&m.path, &prio))
        {
            return pending.remove(idx);
        }
    }
    pending.pop_front()
}

/// 续扫时把上次已完成的子节点合并进新树（按 path 去重，保留更大/已有节点）
fn merge_completed_children(
    mut fresh: FileNode,
    previous: &FileNode,
    completed_paths: &[String],
) -> FileNode {
    let completed: HashSet<&str> = completed_paths.iter().map(|s| s.as_str()).collect();
    let mut by_path: HashMap<String, FileNode> = HashMap::new();

    if let Some(children) = previous.children.as_ref() {
        for c in children {
            if completed.contains(c.path.as_str()) {
                by_path.insert(c.path.clone(), c.clone());
            }
        }
    }
    if let Some(children) = fresh.children.take() {
        for c in children {
            by_path.insert(c.path.clone(), c);
        }
    }

    let mut merged: Vec<FileNode> = by_path.into_values().collect();
    merged.sort_by(|a, b| b.size.cmp(&a.size));
    let total: u64 = merged.iter().map(|c| c.size).sum();
    fresh.size = total.max(fresh.size);
    fresh.children = Some(merged);
    fresh
}

/// 展开 `~` 为用户主目录
pub(crate) fn expand_user_path(path: &str) -> String {
    if path == "~" {
        return dirs_home();
    }
    if let Some(rest) = path.strip_prefix("~/") {
        return format!("{}/{}", dirs_home(), rest);
    }
    path.to_string()
}

fn dirs_home() -> String {
    std::env::var("HOME").unwrap_or_else(|_| "/Users".to_string())
}

/// 路径排除：按路径前缀/路径分量匹配，避免 `/dev` 误伤 `devtools`、`device` 等
fn is_excluded_path(path: &str, patterns: &[String]) -> bool {
    for pat in patterns {
        if pat.is_empty() {
            continue;
        }
        if path == pat || path.starts_with(&format!("{pat}/")) {
            return true;
        }
        // 作为中间路径分量：/foo/{segment}/bar 或结尾 /foo/{segment}
        let segment = pat.trim_start_matches('/');
        if segment.is_empty() {
            continue;
        }
        if path.contains(&format!("/{segment}/")) || path.ends_with(&format!("/{segment}")) {
            return true;
        }
    }
    false
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

/// 一次性构建 parent_path → 子条目索引（O(N)），供建树时 O(1) 查找子项，
/// 替代原先每个节点都 `flat.iter().filter(...)` 的 O(N²) 写法。
fn build_parent_index(flat: &[FlatEntry]) -> HashMap<&Path, Vec<usize>> {
    let mut idx: HashMap<&Path, Vec<usize>> = HashMap::new();
    for (i, e) in flat.iter().enumerate() {
        if let Some(ref p) = e.parent_path {
            idx.entry(p.as_path()).or_insert_with(Vec::new).push(i);
        }
    }
    idx
}
