//! macOS 文件分类器
//!
//! 根据文件路径、名称和 macOS 系统目录约定，对文件进行分类。
//! 分类逻辑基于 macOS 的文件系统层级标准，
//! 以及常见应用程序的缓存/数据目录约定。

use std::path::Path;

use crate::models::FileCategory;

/// 文件分类器 - 判断文件/目录在 macOS 中的用途分类
pub struct Categorizer {
    /// macOS 系统目录前缀列表
    system_prefixes: Vec<&'static str>,
    /// 缓存目录列表
    cache_dirs: Vec<&'static str>,
    /// 日志目录列表
    log_dirs: Vec<&'static str>,
    /// 临时目录列表
    temp_dirs: Vec<&'static str>,
    /// Xcode 相关目录列表
    xcode_dirs: Vec<&'static str>,
    /// 沙箱容器目录
    container_dirs: Vec<&'static str>,
}

impl Categorizer {
    /// 创建新的分类器实例，初始化 macOS 已知目录列表
    pub fn new() -> Self {
        Categorizer {
            // macOS 系统关键目录 - 修改/删除可能导致系统不稳定
            system_prefixes: vec![
                "/System",
                "/usr",
                "/bin",
                "/sbin",
                "/private/var/db",
                "/private/var/run",
                "/private/etc",
                "/Library/Apple",
                "/Library/Kernel",
                "/Library/CoreServices",
                "/Library/Extensions",
                "/Library/Frameworks",
                "/Library/Audio",
                "/Library/Developer/CoreSimulator",
                "/Library/Developer/CoreDevice",
                "/Library/Developer/Platforms",
                "/Library/Developer/Toolchains",
                "/Library/Developer/PrivateFrameworks",
                "/Library/Preferences/SystemConfiguration",
            ],
            // 系统与应用缓存目录 - 通常可安全清理
            cache_dirs: vec![
                "/Library/Caches",
                "~/Library/Caches",
                "/System/Library/Caches",
                "~/Library/Application Support/",
                "/Library/Application Support/Apple/Cache",
                "/private/var/folders",
                "/Library/Developer/CoreSimulator/Caches",
                "/Library/Developer/Xcode/DerivedData/ModuleCache",
            ],
            // 日志目录 - 通常可安全清理
            log_dirs: vec![
                "/Library/Logs",
                "~/Library/Logs",
                "/private/var/log",
                "/Library/Developer/Xcode/DerivedData/Logs",
            ],
            // 临时文件目录
            temp_dirs: vec!["/tmp", "/private/tmp", "/private/var/tmp"],
            // Xcode 衍生数据目录 - 体积大，通常可安全重建
            xcode_dirs: vec![
                "/Library/Developer/Xcode/DerivedData",
                "/Library/Developer/Xcode/Archives",
                "/Library/Developer/Xcode/iOS DeviceSupport",
                "/Library/Developer/Xcode/iOS Device Logs",
                "/Library/Developer/Xcode/Products",
                "~/Library/Developer/Xcode/DerivedData",
                "~/Library/Developer/Xcode/Archives",
                "~/Library/Developer/Xcode/iOS DeviceSupport",
            ],
            // 应用沙箱容器 - 各应用存储的数据
            container_dirs: vec![
                "~/Library/Containers",
                "~/Library/Group Containers",
                "~/Library/Application Scripts",
            ],
        }
    }

    /// 对指定路径的文件进行分类
    ///
    /// # 参数
    /// * `path` - 文件/目录的完整路径
    /// * `name` - 文件/目录的名称
    ///
    /// # 返回
    /// 文件分类枚举值
    pub fn categorize(&self, path: &Path, name: &str) -> FileCategory {
        let path_str = path.to_string_lossy().to_lowercase();
        let name_lower = name.to_lowercase();

        // ─── 第一步：检查系统目录 ──────────────────────────────────
        if self.matches_any_prefix(&path_str, &self.system_prefixes) {
            if self.matches_any_substring(&path_str, &self.cache_dirs) {
                return FileCategory::SystemCache;
            }
            return FileCategory::System;
        }

        // ─── 第二步：检查缓存目录 ──────────────────────────────────
        if self.matches_any_substring(&path_str, &self.cache_dirs) {
            return FileCategory::UserCache;
        }

        // ─── 第三步：检查临时文件 ──────────────────────────────────
        if self.matches_any_substring(&path_str, &self.temp_dirs) {
            return FileCategory::Temporary;
        }

        // ─── 第四步：检查日志目录 ──────────────────────────────────
        if self.matches_any_substring(&path_str, &self.log_dirs) {
            return FileCategory::Logs;
        }

        // ─── 第五步：检查垃圾篓 ────────────────────────────────────
        if path_str.contains("/.trash")
            || path_str.contains("/.trashes")
            || path_str.contains("/.localized-trash")
        {
            return FileCategory::Trash;
        }

        // ─── 第六步：检查 Xcode 相关 ───────────────────────────────
        if self.matches_any_substring(&path_str, &self.xcode_dirs)
            || (name_lower.contains("deriveddata")
                && path_str.contains("xcode"))
        {
            return FileCategory::XcodeDerived;
        }

        // ─── 第七步：检查应用容器 ──────────────────────────────────
        if self.matches_any_substring(&path_str, &self.container_dirs) {
            return FileCategory::AppContainer;
        }

        // ─── 第八步：检查下载目录 ──────────────────────────────────
        if path_str.contains("/downloads")
            || path_str.contains("~/downloads")
        {
            return FileCategory::Downloads;
        }

        // ─── 第九步：检查应用程序目录 ──────────────────────────────
        if path_str.starts_with("/applications")
            || path_str.starts_with("/applications/")
            || path_str.starts_with("/system/applications")
            || path_str.contains("/applications/")
            || path_str.ends_with(".app")
        {
            return FileCategory::Application;
        }

        // ─── 第十步：语言包检测 ────────────────────────────────────
        if (name_lower.ends_with(".lproj")
            || name_lower.ends_with(".strings"))
            && (path_str.contains(".app/contents/resources")
                || path_str.contains(".app/contents/frameworks"))
        {
            return FileCategory::LanguagePack;
        }

        // ─── 默认：其他 ────────────────────────────────────────────
        FileCategory::Other
    }

    /// 检查路径是否以某个前缀开头
    fn matches_any_prefix(&self, path: &str, prefixes: &[&str]) -> bool {
        prefixes
            .iter()
            .any(|&prefix| path.starts_with(&prefix.to_lowercase()))
    }

    /// 检查路径是否包含某个子串
    fn matches_any_substring(&self, path: &str, substrings: &[&str]) -> bool {
        substrings
            .iter()
            .any(|&s| path.contains(&s.to_lowercase()))
    }
}
