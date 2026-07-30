//! MagicSniffer 应用入口
//!
//! 启动桌面应用，初始化 Tauri 运行时

// 预编译资产（在编译时包含前端构建产物）
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    magicsniffer_lib::run()
}
