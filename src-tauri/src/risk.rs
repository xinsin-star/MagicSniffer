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

    /// 获取指定路径的详细风险评估说明
    pub fn get_detail(
        &self,
        _path: &Path,
        _name: &str,
        category: &FileCategory,
    ) -> (String, String) {
        let (explanation, recommendation) = match category {
            FileCategory::System => (
                "这是 macOS 系统核心文件，删除可能导致系统不稳定或无法启动。".to_string(),
                "强烈建议不要删除任何系统文件。".to_string(),
            ),
            FileCategory::SystemCache => (
                "系统缓存文件，删除后系统会自动重建，但可能会暂时降低性能。".to_string(),
                "可以安全删除以释放空间，重启后缓存会重新生成。".to_string(),
            ),
            FileCategory::UserCache => (
                "应用程序缓存数据，删除后应用可能会重新生成这些文件。".to_string(),
                "安全可删，建议定期清理以释放磁盘空间。".to_string(),
            ),
            FileCategory::UserData => (
                "您的个人数据文件，删除将永久丢失这些数据。".to_string(),
                "请确认不再需要这些文件后再删除。".to_string(),
            ),
            FileCategory::Application => (
                "这是应用程序文件，删除后应用将无法运行。".to_string(),
                "如需卸载应用，请使用 Launchpad 或将其移至废纸篓。".to_string(),
            ),
            FileCategory::Temporary => (
                "临时文件，通常由系统或应用程序创建，可安全清理。".to_string(),
                "可以安全删除以释放空间。".to_string(),
            ),
            FileCategory::Logs => (
                "系统或应用程序日志文件，用于调试和记录。".to_string(),
                "可以安全删除以释放空间。".to_string(),
            ),
            FileCategory::Downloads => (
                "从互联网下载的文件。".to_string(),
                "请确认不需要这些文件后再删除。".to_string(),
            ),
            FileCategory::Trash => (
                "已移入废纸篓的文件，删除后将永久清除。".to_string(),
                "安全可删，彻底释放磁盘空间。".to_string(),
            ),
            FileCategory::XcodeDerived => (
                "Xcode 编译衍生数据，包括索引和构建产物。".to_string(),
                "安全可删。Xcode 会在下次打开项目时重新生成。".to_string(),
            ),
            FileCategory::AppContainer => (
                "应用程序的沙盒数据，包含设置、偏好和本地数据。".to_string(),
                "删除可能导致应用重置或丢失数据。请确认应用已备份。".to_string(),
            ),
            FileCategory::LanguagePack => (
                "应用程序的语言包文件，删除后该语言将无法使用。".to_string(),
                "如果您不需要多语言支持，可以安全删除以节省空间。".to_string(),
            ),
            FileCategory::Other => (
                "未分类的文件或目录。".to_string(),
                "请确认其用途后再决定是否删除。".to_string(),
            ),
        };

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
