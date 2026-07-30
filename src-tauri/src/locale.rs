/// 简单的中英双语翻译函数。
/// `lang` 为 "en" 时返回英文，其他情况返回中文（默认）。
pub fn tr(key: &str, lang: &str) -> String {
    match lang {
        "en" => tr_en(key),
        _ => tr_zh(key),
    }
}

/// 翻译并替换一个 `{}` 占位符
pub fn tr_fmt(key: &str, lang: &str, arg: &str) -> String {
    tr(key, lang).replace("{}", arg)
}

fn tr_zh(key: &str) -> String {
    match key {
        // ── 风险说明 ──
        "risk.System.explanation" =>
            "这是 macOS 系统核心文件，删除可能导致系统不稳定或无法启动。".into(),
        "risk.System.recommendation" =>
            "强烈建议不要删除任何系统文件。".into(),
        "risk.SystemCache.explanation" =>
            "系统缓存文件，删除后系统会自动重建，但可能会暂时降低性能。".into(),
        "risk.SystemCache.recommendation" =>
            "可以安全删除以释放空间，重启后缓存会重新生成。".into(),
        "risk.UserCache.explanation" =>
            "应用程序缓存数据，删除后应用可能会重新生成这些文件。".into(),
        "risk.UserCache.recommendation" =>
            "安全可删，建议定期清理以释放磁盘空间。".into(),
        "risk.UserData.explanation" =>
            "您的个人数据文件，删除将永久丢失这些数据。".into(),
        "risk.UserData.recommendation" =>
            "请确认不再需要这些文件后再删除。".into(),
        "risk.Application.explanation" =>
            "这是应用程序文件，删除后应用将无法运行。".into(),
        "risk.Application.recommendation" =>
            "如需卸载应用，请使用 Launchpad 或将其移至废纸篓。".into(),
        "risk.Temporary.explanation" =>
            "临时文件，通常由系统或应用程序创建，可安全清理。".into(),
        "risk.Temporary.recommendation" =>
            "可以安全删除以释放空间。".into(),
        "risk.Logs.explanation" =>
            "系统或应用程序日志文件，用于调试和记录。".into(),
        "risk.Logs.recommendation" =>
            "可以安全删除以释放空间。".into(),
        "risk.Downloads.explanation" =>
            "从互联网下载的文件。".into(),
        "risk.Downloads.recommendation" =>
            "请确认不需要这些文件后再删除。".into(),
        "risk.Trash.explanation" =>
            "已移入废纸篓的文件，删除后将永久清除。".into(),
        "risk.Trash.recommendation" =>
            "安全可删，彻底释放磁盘空间。".into(),
        "risk.XcodeDerived.explanation" =>
            "Xcode 编译衍生数据，包括索引和构建产物。".into(),
        "risk.XcodeDerived.recommendation" =>
            "安全可删。Xcode 会在下次打开项目时重新生成。".into(),
        "risk.AppContainer.explanation" =>
            "应用程序的沙盒数据，包含设置、偏好和本地数据。".into(),
        "risk.AppContainer.recommendation" =>
            "删除可能导致应用重置或丢失数据。请确认应用已备份。".into(),
        "risk.LanguagePack.explanation" =>
            "应用程序的语言包文件，删除后该语言将无法使用。".into(),
        "risk.LanguagePack.recommendation" =>
            "如果您不需要多语言支持，可以安全删除以节省空间。".into(),
        "risk.Other.explanation" =>
            "未分类的文件或目录。".into(),
        "risk.Other.recommendation" =>
            "请确认其用途后再决定是否删除。".into(),

        // ── 错误消息 ──
        "error.path_not_found" => "路径不存在: {}".into(),
        "error.not_directory" => "不是可扫描的目录: {}".into(),
        "error.cannot_open_finder" => "无法打开 Finder: {}".into(),
        "error.cannot_open_explorer" => "无法打开资源管理器: {}".into(),
        "error.platform_not_supported" => "当前平台不支持在文件管理器中显示".into(),
        "error.no_disk_info" => "无法获取磁盘信息: 检测到 {} 个磁盘".into(),

        // ── 扫描进度阶段 key（前端 t() 翻译） ──
        "phase.enumerating" => "正在枚举顶级目录...".into(),
        "phase.scanning" => "正在扫描文件系统...".into(),
        "phase.saving" => "扫描已暂停，正在保存断点...".into(),
        "phase.building" => "正在构建最终结果...".into(),
        "phase.paused" => "扫描已暂停".into(),
        "phase.done" => "扫描完成".into(),

        _ => key.into(),
    }
}

fn tr_en(key: &str) -> String {
    match key {
        "risk.System.explanation" =>
            "These are macOS system core files. Deleting them may cause system instability or prevent startup.".into(),
        "risk.System.recommendation" =>
            "Strongly recommended to never delete any system files.".into(),
        "risk.SystemCache.explanation" =>
            "System cache files. The system will rebuild them automatically, but performance may temporarily degrade.".into(),
        "risk.SystemCache.recommendation" =>
            "Safe to delete to free up space. Caches will regenerate after restart.".into(),
        "risk.UserCache.explanation" =>
            "Application cache data. Apps may regenerate these files after deletion.".into(),
        "risk.UserCache.recommendation" =>
            "Safe to delete. Recommended to clean regularly to free disk space.".into(),
        "risk.UserData.explanation" =>
            "Your personal data files. Deletion will permanently lose these files.".into(),
        "risk.UserData.recommendation" =>
            "Please confirm you no longer need these files before deleting.".into(),
        "risk.Application.explanation" =>
            "These are application files. The app will not run after deletion.".into(),
        "risk.Application.recommendation" =>
            "To uninstall, use Launchpad or move the app to Trash.".into(),
        "risk.Temporary.explanation" =>
            "Temporary files, usually created by the system or applications. Safe to clean up.".into(),
        "risk.Temporary.recommendation" =>
            "Safe to delete to free up space.".into(),
        "risk.Logs.explanation" =>
            "System or application log files, used for debugging and recording.".into(),
        "risk.Logs.recommendation" =>
            "Safe to delete to free up space.".into(),
        "risk.Downloads.explanation" =>
            "Files downloaded from the internet.".into(),
        "risk.Downloads.recommendation" =>
            "Please confirm you no longer need these files before deleting.".into(),
        "risk.Trash.explanation" =>
            "Files moved to Trash. Deleting will permanently remove them.".into(),
        "risk.Trash.recommendation" =>
            "Safe to delete to permanently free disk space.".into(),
        "risk.XcodeDerived.explanation" =>
            "Xcode build derived data, including indexes and build artifacts.".into(),
        "risk.XcodeDerived.recommendation" =>
            "Safe to delete. Xcode will regenerate them when the project is next opened.".into(),
        "risk.AppContainer.explanation" =>
            "Application sandbox data, containing settings, preferences, and local data.".into(),
        "risk.AppContainer.recommendation" =>
            "Deletion may reset or cause data loss in the app. Please ensure the app is backed up.".into(),
        "risk.LanguagePack.explanation" =>
            "Application language pack files. The language will become unavailable after deletion.".into(),
        "risk.LanguagePack.recommendation" =>
            "If you do not need multi-language support, it is safe to delete to save space.".into(),
        "risk.Other.explanation" =>
            "Uncategorized file or directory.".into(),
        "risk.Other.recommendation" =>
            "Please confirm its purpose before deciding to delete.".into(),

        "error.path_not_found" => "Path not found: {}".into(),
        "error.not_directory" => "Not a scannable directory: {}".into(),
        "error.cannot_open_finder" => "Cannot open Finder: {}".into(),
        "error.cannot_open_explorer" => "Cannot open Explorer: {}".into(),
        "error.platform_not_supported" => "File manager reveal is not supported on this platform".into(),
        "error.no_disk_info" => "Cannot retrieve disk info: {} disks detected".into(),

        "phase.enumerating" => "Enumerating top-level directories...".into(),
        "phase.scanning" => "Scanning filesystem...".into(),
        "phase.saving" => "Scan paused, saving checkpoint...".into(),
        "phase.building" => "Building final results...".into(),
        "phase.paused" => "Scan paused".into(),
        "phase.done" => "Scan complete".into(),

        _ => key.into(),
    }
}
