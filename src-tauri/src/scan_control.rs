//! 扫描会话控制 — 取消、优先级聚焦、世代号
//!
//! 前端下钻时设置 priority，后台优先扫该路径；
//! 离开页面时 request_cancel，扫描循环保存断点后返回。

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Mutex;

#[derive(Debug, Default)]
pub struct ScanControl {
    cancel: AtomicBool,
    priority: Mutex<Option<PathBuf>>,
    /// priority / cancel 变更时递增，walk 循环用于检测变化
    gen: AtomicU64,
}

impl ScanControl {
    pub fn new() -> Self {
        Self::default()
    }

    /// 开始新扫描前重置
    pub fn reset(&self) {
        self.cancel.store(false, Ordering::SeqCst);
        if let Ok(mut g) = self.priority.lock() {
            *g = None;
        }
        self.gen.fetch_add(1, Ordering::SeqCst);
    }

    pub fn request_cancel(&self) {
        self.cancel.store(true, Ordering::SeqCst);
        self.gen.fetch_add(1, Ordering::SeqCst);
    }

    pub fn is_cancelled(&self) -> bool {
        self.cancel.load(Ordering::Relaxed)
    }

    pub fn set_priority(&self, path: Option<PathBuf>) {
        if let Ok(mut g) = self.priority.lock() {
            *g = path;
        }
        self.gen.fetch_add(1, Ordering::SeqCst);
    }

    pub fn priority(&self) -> Option<PathBuf> {
        self.priority.lock().ok().and_then(|g| g.clone())
    }

    pub fn gen(&self) -> u64 {
        self.gen.load(Ordering::Relaxed)
    }
}

/// `child` 是否位于 `ancestor` 路径之下（或相等）
pub fn path_is_under(child: &std::path::Path, ancestor: &std::path::Path) -> bool {
    if child == ancestor {
        return true;
    }
    child.starts_with(ancestor)
}
