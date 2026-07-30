//! 高速文件搜索引擎
//!
//! 使用 Rust 实现的高性能文件搜索，支持：
//! - 文件名模糊匹配（大小写不敏感）
//! - 正则表达式搜索
//! - 大小过滤
//! - 顶级目录并行 + 子树串行 walkdir（避免嵌套并行开销）
//! - 原子提前退出

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Instant;

use rayon::prelude::*;
use regex::Regex;
use walkdir::WalkDir;

use crate::categorizer::Categorizer;
use crate::models::*;
use crate::risk::RiskAssessor;
use crate::scanner::expand_user_path;

/// 高性能文件搜索引擎
pub struct SearchEngine {
    categorizer: Categorizer,
    risk_assessor: RiskAssessor,
}

impl SearchEngine {
    pub fn new() -> Self {
        SearchEngine {
            categorizer: Categorizer::new(),
            risk_assessor: RiskAssessor::new(),
        }
    }

    /// 执行搜索
    pub fn search(&self, request: SearchRequest) -> Result<SearchResult, String> {
        let start = Instant::now();
        let expanded = expand_user_path(&request.root_path);
        let root_path = Path::new(&expanded);
        let query_lower = request.query.to_lowercase();

        if !root_path.exists() {
            return Err(format!("搜索路径不存在: {}", expanded));
        }

        let regex = if request.use_regex {
            Some(Regex::new(&request.query).map_err(|e| format!("正则表达式无效: {}", e))?)
        } else {
            None
        };

        let result_count = Arc::new(AtomicU32::new(0));
        let early_exit = Arc::new(AtomicBool::new(false));
        let results: Arc<Mutex<Vec<SearchResultItem>>> = Arc::new(Mutex::new(Vec::new()));

        // 收集顶级条目，并行处理；子树内部串行 walkdir，避免嵌套并行开销
        let top_entries: Vec<PathBuf> = fs::read_dir(root_path)
            .map_err(|e| format!("无法读取目录: {}", e))?
            .filter_map(|e| e.ok())
            .map(|e| e.path())
            .collect();

        top_entries.par_iter().for_each(|entry_path| {
            if early_exit.load(Ordering::Relaxed) {
                return;
            }
            self.search_path(
                entry_path,
                &query_lower,
                &regex,
                &request,
                &result_count,
                &early_exit,
                &results,
            );
        });

        let elapsed = start.elapsed().as_millis() as u64;
        let items = results.lock().map_err(|e| e.to_string())?.clone();

        Ok(SearchResult {
            total_count: items.len() as u32,
            elapsed_ms: elapsed,
            items,
        })
    }

    /// 对单个顶级条目（文件或目录）执行搜索。目录用 walkdir 串行遍历。
    fn search_path(
        &self,
        path: &Path,
        query_lower: &str,
        regex: &Option<Regex>,
        request: &SearchRequest,
        result_count: &Arc<AtomicU32>,
        early_exit: &Arc<AtomicBool>,
        results: &Arc<Mutex<Vec<SearchResultItem>>>,
    ) {
        if early_exit.load(Ordering::Relaxed) {
            return;
        }

        // 顶级条目本身先匹配
        if let Ok(meta) = fs::symlink_metadata(path) {
            if !meta.is_symlink() {
                let file_name = path
                    .file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_default();
                if self.match_name(&file_name, &path.to_string_lossy(), query_lower, regex) {
                    self.try_add_result(
                        path,
                        &file_name,
                        &meta,
                        request,
                        result_count,
                        early_exit,
                        results,
                    );
                }
            }
        }

        if !path.is_dir() || early_exit.load(Ordering::Relaxed) {
            return;
        }

        // 子树串行 walkdir，深度上限 30
        let walker = WalkDir::new(path)
            .follow_links(false)
            .max_depth(30)
            .into_iter();

        for entry in walker {
            if early_exit.load(Ordering::Relaxed) {
                return;
            }
            let entry = match entry {
                Ok(e) => e,
                Err(_) => continue,
            };
            let entry_path = entry.path();
            let meta = match entry.metadata() {
                Ok(m) => m,
                Err(_) => continue,
            };
            if meta.is_symlink() {
                continue;
            }
            let file_name = entry.file_name().to_string_lossy().to_string();
            if !self.match_name(&file_name, &entry_path.to_string_lossy(), query_lower, regex) {
                continue;
            }
            self.try_add_result(
                entry_path,
                &file_name,
                &meta,
                request,
                result_count,
                early_exit,
                results,
            );
        }
    }

    fn match_name(
        &self,
        file_name: &str,
        full_path: &str,
        query_lower: &str,
        regex: &Option<Regex>,
    ) -> bool {
        if let Some(ref re) = regex {
            re.is_match(file_name) || re.is_match(full_path)
        } else {
            file_name.to_lowercase().contains(query_lower)
        }
    }

    fn try_add_result(
        &self,
        path: &Path,
        file_name: &str,
        meta: &fs::Metadata,
        request: &SearchRequest,
        result_count: &Arc<AtomicU32>,
        early_exit: &Arc<AtomicBool>,
        results: &Arc<Mutex<Vec<SearchResultItem>>>,
    ) {
        let file_size = meta.len();
        if file_size < request.min_size {
            return;
        }
        if request.max_size > 0 && file_size > request.max_size {
            return;
        }

        let count = result_count.fetch_add(1, Ordering::Relaxed);
        if count >= request.max_results {
            early_exit.store(true, Ordering::Relaxed);
            return;
        }

        let modified_at = meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);

        let category = self.categorizer.categorize(path, file_name);
        let risk_level = self.risk_assessor.assess(path, file_name, &category);

        let item = SearchResultItem {
            path: path.to_string_lossy().to_string(),
            name: file_name.to_string(),
            size: file_size,
            is_dir: meta.is_dir(),
            category,
            risk_level,
            modified_at,
        };

        if let Ok(mut guard) = results.lock() {
            guard.push(item);
        }
    }
}
