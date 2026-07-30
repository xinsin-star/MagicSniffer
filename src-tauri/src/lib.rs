//! MagicSniffer - 库入口
//!
//! 初始化 Tauri 应用状态，注册所有命令和插件。

pub mod categorizer;
pub mod commands;
pub mod models;
pub mod risk;
pub mod scanner;
pub mod search;

use commands::AppState;
use scanner::Scanner;
use search::SearchEngine;
use tauri::Manager;

/// 配置并运行 Tauri 应用
///
/// 在 setup 回调中初始化应用状态（Scanner、SearchEngine 等）
/// 并注册所有 Tauri 命令
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|_app| {
            // 初始化应用状态
            _app.manage(AppState {
                scanner: Scanner::new(),
                search_engine: SearchEngine::new(),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_system_overview,
            commands::start_scan,
            commands::quick_scan_known_dirs,
            commands::search_files,
            commands::assess_delete_risk,
            commands::assess_batch_delete_risk,
        ])
        .run(tauri::generate_context!())
        .expect("启动 MagicSniffer 失败");
}
