//! MagicSniffer - 库入口
//!
//! 初始化 Tauri 应用状态，注册所有命令和插件。

pub mod cache;
pub mod categorizer;
pub mod commands;
pub mod locale;
pub mod models;
pub mod risk;
pub mod scan_control;
pub mod scanner;
pub mod search;

use commands::AppState;
use scan_control::ScanControl;
use scanner::Scanner;
use search::SearchEngine;
use std::sync::Arc;
use tauri::Manager;
use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::TrayIconBuilder;

const TRAY_ID: &str = "magicsniffer-tray";

fn tray_menu_text(key: &str, lang: &str) -> String {
    crate::locale::tr(key, lang)
}

fn build_tray_menu(
    app: &tauri::AppHandle,
    lang: &str,
) -> Result<tauri::menu::Menu<tauri::Wry>, tauri::Error> {
    let show = MenuItemBuilder::with_id("show", tray_menu_text("tray.show", lang)).build(app)?;
    let quit = MenuItemBuilder::with_id("quit", tray_menu_text("tray.quit", lang)).build(app)?;
    let menu = MenuBuilder::new(app)
        .item(&show)
        .separator()
        .item(&quit)
        .build()?;
    Ok(menu)
}

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
            // 初始化系统托盘（默认中文菜单）
            let tray_menu = build_tray_menu(_app.handle(), "zh-CN")?;
            let _tray = TrayIconBuilder::with_id(TRAY_ID)
                .menu(&tray_menu)
                .show_menu_on_left_click(true)
                .on_menu_event(|app, event| {
                    match event.id().as_ref() {
                        "show" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        "quit" => {
                            app.exit(0);
                        }
                        _ => {}
                    }
                })
                .build(_app.handle())?;

            // 初始化应用状态
            _app.manage(AppState {
                scanner: Scanner::new(),
                search_engine: SearchEngine::new(),
                scan_control: Arc::new(ScanControl::new()),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_system_overview,
            commands::validate_scan_path,
            commands::start_scan,
            commands::quick_scan_known_dirs,
            commands::search_files,
            commands::assess_delete_risk,
            commands::assess_batch_delete_risk,
            commands::reveal_in_file_manager,
            commands::load_latest_scan_cache,
            commands::load_scan_cache,
            commands::list_scan_caches,
            commands::clear_scan_cache,
            commands::set_scan_priority,
            commands::stop_scan,
            commands::update_tray_menu,
        ])
        .run(tauri::generate_context!())
        .expect("启动 MagicSniffer 失败");
}
