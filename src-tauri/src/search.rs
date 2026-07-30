//! 高速文件搜索引擎
//!
//! 使用 Rust 实现的高性能文件搜索，支持：
//! - 文件名模糊匹配（大小写不敏感）
//! - 正则表达式搜索
//! - 大小过滤
//! - 并行目录遍历
//! - 结果限流

use std::fs;
use std::path::Path;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::Arc;
use std::time::Instant;

use rayon::prelude::*;
use regex::Regex;

use crate::categorizer::Categorizer;
use crate::models::*;
use crate::risk::RiskAssessor;

/// 高性能文件搜索引擎
pub struct SearchEngine {
    categorizer: Categorizer,
    risk_assessor: RiskAssessor,
}

impl SearchEngine {
    /// 创建新的搜索引擎实例
    pub fn new() -> Self {
        SearchEngine {
            categorizer: Categorizer::new(),
            risk_assessor: RiskAssessor::new(),
        }
    }

    /// 执行搜索
    ///
    /// # 参数
    /// * `request` - 搜索请求参数
    ///
    /// # 返回
    /// 搜索结果列表
    pub fn search(&self, request: SearchRequest) -> Result<SearchResult, String> {
        let start = Instant::now();
        let root_path = Path::new(&request.root_path);
        let query_lower = request.query.to_lowercase();

        if !root_path.exists() {
            return Err(format!("搜索路径不存在: {}", request.root_path));
        }

        // 编译正则表达式（如果需要）
        let regex = if request.use_regex {
            Some(
                Regex::new(&request.query)
                    .map_err(|e| format!("正则表达式无效: {}", e))?,
            )
        } else {
            None
        };

        // 共享状态：结果计数器和提前退出标志
        let result_count = Arc::new(AtomicU32::new(0));
        let early_exit = Arc::new(AtomicBool::new(false));
        let max_results = request.max_results;
        let min_size = request.min_size;
        let max_size = request.max_size;

        // 使用 Concurrent Vec 收集结果
        let results = Arc::new(std::sync::Mutex::new(Vec::new()));

        // 递归搜索（并行化）
        self.search_recursive(
            root_path,
            &query_lower,
            &regex,
            min_size,
            max_size,
            max_results,
            &result_count,
            &early_exit,
            &results,
            0,
        )?;

        let elapsed = start.elapsed().as_millis() as u64;

        let items = results.lock().map_err(|e| e.to_string())?;

        Ok(SearchResult {
            total_count: items.len() as u32,
            elapsed_ms: elapsed,
            items: items.clone(),
        })
    }

    /// 递归搜索目录
    #[allow(clippy::too_many_arguments)]
    fn search_recursive(
        &self,
        path: &Path,
        query_lower: &str,
        regex: &Option<Regex>,
        min_size: u64,
        max_size: u64,
        max_results: u32,
        result_count: &Arc<AtomicU32>,
        early_exit: &Arc<AtomicBool>,
        results: &Arc<std::sync::Mutex<Vec<SearchResultItem>>>,
        depth: u32,
    ) -> Result<(), String> {
        // 提前退出检查
        if early_exit.load(Ordering::Relaxed) {
            return Ok(());
        }

        // 限制最大递归深度为 30 层
        if depth > 30 {
            return Ok(());
        }

        let entries = match fs::read_dir(path) {
            Ok(entries) => entries,
            Err(_) => return Ok(()), // 跳过权限错误
        };

        let entries: Vec<_> = entries.filter_map(|e| e.ok()).collect();

        // 在目录级别并行处理子条目
        entries.par_iter().for_each(|entry| {
            if early_exit.load(Ordering::Relaxed) {
                return;
            }

            let entry_path = entry.path();
            let metadata = match entry.metadata() {
                Ok(m) => m,
                Err(_) => return,
            };

            let file_name = entry.file_name().to_string_lossy().to_string();
            let name_lower = file_name.to_lowercase();

            // 文件名匹配检查
            let name_match = if let Some(ref re) = regex {
                // 正则匹配（同时匹配文件名和完整路径）
                re.is_match(&file_name)
                    || re.is_match(&entry_path.to_string_lossy())
            } else {
                // 简单子串匹配
                name_lower.contains(query_lower)
            };

            // 如果文件名匹配且符合大小范围，添加结果
            if name_match && !metadata.is_symlink() {
                let file_size = metadata.len();
                let size_ok = file_size >= min_size
                    && (max_size == 0 || file_size <= max_size);

                if size_ok {
                    // 检查结果数量上限
                    let count = result_count.fetch_add(1, Ordering::Relaxed);
                    if count >= max_results {
                        early_exit.store(true, Ordering::Relaxed);
                        return;
                    }

                    let modified_at = metadata
                        .modified()
                        .ok()
                        .and_then(|t| {
                            t.duration_since(std::time::UNIX_EPOCH).ok()
                        })
                        .map(|d| d.as_secs() as i64)
                        .unwrap_or(0);

                    let category = self
                        .categorizer
                        .categorize(&entry_path, &file_name);
                    let risk = self
                        .risk_assessor
                        .assess(&entry_path, &file_name, &category);

                    let item = SearchResultItem {
                        path: entry_path.to_string_lossy().to_string(),
                        name: file_name,
                        size: file_size,
                        is_dir: metadata.is_dir(),
                        category,
                        risk_level: risk,
                        modified_at,
                    };

                    if let Ok(mut guard) = results.lock() {
                        guard.push(item);
                    }
                }
            }

            // 如果是目录且未达到结果上限，递归搜索
            if metadata.is_dir() && !early_exit.load(Ordering::Relaxed) {
                let _ = self.search_recursive(
                    &entry_path,
                    query_lower,
                    regex,
                    min_size,
                    max_size,
                    max_results,
                    result_count,
                    early_exit,
                    results,
                    depth + 1,
                );
            }
        });

        Ok(())
    }
}
