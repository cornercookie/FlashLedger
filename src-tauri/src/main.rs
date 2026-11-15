#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

pub mod models;
pub mod db;
pub mod commands;

use crate::commands::{
    cmd_backup_database, cmd_create_account, cmd_create_category, cmd_create_transaction,
    cmd_delete_account, cmd_delete_transaction, cmd_export_to_excel, cmd_get_accounts,
    cmd_get_categories, cmd_get_category_stats, cmd_get_month_summary, cmd_get_transactions, init,
    cmd_recalc_balance,
};
use crate::db::DbState;
use tauri::Manager;

/** 程式入口點。
 *
 * 可攜式設計重點：
 * - 資料庫路徑由 std::env::current_exe() 決定，放在執行檔旁的 data/app.db
 * - 僅保持一個 SQLite 連線（DbState），避免多連線併發寫入
 * - SQLite 使用 journal_mode = DELETE + synchronous = FULL，防止隨身碟拔除損壞
 */
fn main() {
    tauri::Builder::default()
        // 註冊單一資料庫連線狀態（Mutex 保護，序列化所有存取）
        .manage(DbState {
            conn: std::sync::Mutex::new(
                // 這裡先建立一個空的佔位，實際連線在 setup 階段開啟
                rusqlite::Connection::open_in_memory().unwrap(),
            ),
        })
        .setup(|app| {
            // 第一次啟動：初始化資料庫（建立 data/ 資料夾、建表、預設資料）
            let state: tauri::State<'_, DbState> = app.state();
            init(state).map_err(|e| {
                tauri::Error::from(std::io::Error::new(std::io::ErrorKind::Other, e))
            })?;
            Ok(())
        })
        // 註冊所有 Tauri Command
        .invoke_handler(tauri::generate_handler![
            cmd_get_accounts,
            cmd_create_account,
            cmd_delete_account,
            cmd_get_categories,
            cmd_create_category,
            cmd_get_transactions,
            cmd_create_transaction,
            cmd_delete_transaction,
            cmd_get_month_summary,
            cmd_get_category_stats,
            cmd_export_to_excel,
            cmd_backup_database,
            cmd_recalc_balance,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
