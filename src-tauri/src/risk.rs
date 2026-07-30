//! 删除风险评估器
//!
//! 根据文件路径、类型和分类，评估删除该文件可能带来的风险。
//! 用于在 UI 中标注哪些文件可以安全删除，哪些需要谨慎操作。

use std::path::Path;

use crate::models::{FileCategory, RiskLevel};

/// 删除风险评估器
pub struct RiskAssessor;

impl RiskAssessor {
    /// 创建新的风险评估器实例
    pub fn new() -> Self {
        RiskAssessor
    }

    /// 评估删除指定文件/目录的风险等级
    ///
    /// # 参数
    /// * `path` - 文件/目录的完整路径
    /// * `name` - 文件/目录名称
    /// * `category` - 已分类的文件类别
    ///
    /// # 返回
    /// 风险等级枚举值
    pub fn assess(
        &self,
        path: &Path,
        name: &str,
        category: &FileCategory,
    ) -> RiskLevel {
        let path_str = path.to_string_lossy();
        let name_lower = name.to_lowercase();

        match category {
            // ── 系统文件 - 高风险 ──────────────────────────────────
            FileCategory::System | FileCategory::Application => {
                // 某些系统目录下的缓存可以安全删除
                if self.is_safe_system_cache(&path_str) {
                    return RiskLevel::Low;
                }
                RiskLevel::High
            }

            // ── 系统缓存 - 中等风险 ────────────────────────────────
            FileCategory::SystemCache => {
                // 字体缓存、preferences 缓存等可能需要谨慎
                if name_lower.contains("font") || name_lower.contains("preference") {
                    return RiskLevel::Medium;
                }
                RiskLevel::Low
            }

            // ── 用户缓存 - 低风险 ──────────────────────────────────
            FileCategory::UserCache => RiskLevel::Low,

            // ── 用户数据 - 中等风险 ────────────────────────────────
            FileCategory::UserData => RiskLevel::Medium,

            // ── 临时文件 - 无风险 ──────────────────────────────────
            FileCategory::Temporary => RiskLevel::None,

            // ── 日志文件 - 无风险 ──────────────────────────────────
            FileCategory::Logs => RiskLevel::None,

            // ── 下载文件 - 中等风险（用户可能还需要） ──────────────
            FileCategory::Downloads => RiskLevel::Medium,

            // ── 垃圾桶 - 无风险 ────────────────────────────────────
            FileCategory::Trash => RiskLevel::None,

            // ── Xcode 衍生数据 - 低风险（可重建） ──────────────────
            FileCategory::XcodeDerived => RiskLevel::Low,

            // ── 应用容器 - 中等风险 (可能丢失应用数据) ─────────────
            FileCategory::AppContainer => RiskLevel::Medium,

            // ── 语言包 - 低风险（仅影响本地化显示） ────────────────
            FileCategory::LanguagePack => RiskLevel::Low,

            // ── 其他 - 低风险默认 ──────────────────────────────────
            FileCategory::Other => RiskLevel::Low,
        }
    }

    /// 获取指定路径的详细风险评估说明（支持中英双语）
    pub fn get_detail(
        &self,
        _path: &Path,
        _name: &str,
        category: &FileCategory,
        lang: &str,
    ) -> (String, String) {
        let cat_key = match category {
            FileCategory::System => "System",
            FileCategory::SystemCache => "SystemCache",
            FileCategory::UserCache => "UserCache",
            FileCategory::UserData => "UserData",
            FileCategory::Application => "Application",
            FileCategory::Temporary => "Temporary",
            FileCategory::Logs => "Logs",
            FileCategory::Downloads => "Downloads",
            FileCategory::Trash => "Trash",
            FileCategory::XcodeDerived => "XcodeDerived",
            FileCategory::AppContainer => "AppContainer",
            FileCategory::LanguagePack => "LanguagePack",
            FileCategory::Other => "Other",
        };
        let explanation = crate::locale::tr(&format!("risk.{cat_key}.explanation"), lang);
        let recommendation = crate::locale::tr(&format!("risk.{cat_key}.recommendation"), lang);
        (explanation, recommendation)
    }

    /// 判断是否为可安全删除的系统缓存
    fn is_safe_system_cache(&self, path_str: &str) -> bool {
        let safe_cache_markers = [
            "/library/caches",
            "/system/library/caches",
            "/private/var/folders",
        ];
        safe_cache_markers
            .iter()
            .any(|&m| path_str.to_lowercase().contains(m))
    }
}
