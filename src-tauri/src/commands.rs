use crate::db::{
    backup_database, create_account, create_category, create_transaction, delete_account,
    delete_transaction, export_to_excel, get_accounts, get_category_stats, get_categories,
    get_month_summary, get_transactions, DbState,
};
use crate::models::{
    CategoryStat, ExportOption, MonthSummary, NewAccount, NewCategory, NewTransaction,
    Transaction,
};
use tauri::State;

/** 初始化資料庫：建立 data/ 資料夾、app.db、建表、插入預設資料。
 * 程式第一次啟動時由 Tauri setup 階段呼叫。 */
#[tauri::command]
pub fn init_database(state: State<'_, DbState>) -> Result<(), String> {
    init(state)
}

/** 取得所有帳戶列表（含餘額），供「帳戶管理」與「新增交易」使用。 */
#[tauri::command]
pub fn cmd_get_accounts(state: State<'_, DbState>) -> Result<Vec<crate::models::Account>, String> {
    get_accounts(state)
}

/** 新增帳戶。輸入帳戶名稱與類型（cash/bank/credit/other）。 */
#[tauri::command]
pub fn cmd_create_account(
    state: State<'_, DbState>,
    input: NewAccount,
) -> Result<i64, String> {
    create_account(state, input)
}

/** 刪除帳戶。若該帳戶尚有交易記錄則拒絕刪除。 */
#[tauri::command]
pub fn cmd_delete_account(state: State<'_, DbState>, id: i64) -> Result<(), String> {
    delete_account(state, id)
}

/** 取得所有分類列表，依類型（expense/income）與名稱排序。 */
#[tauri::command]
pub fn cmd_get_categories(
    state: State<'_, DbState>,
) -> Result<Vec<crate::models::Category>, String> {
    get_categories(state)
}

/** 新增分類。輸入名稱、類型（expense/income）、可選 emoji 圖示。 */
#[tauri::command]
pub fn cmd_create_category(
    state: State<'_, DbState>,
    input: NewCategory,
) -> Result<i64, String> {
    create_category(state, input)
}

/** 取得交易列表，依日期倒序。
 * 可選參數：year/month（月份篩選）、search（備註關鍵字）、category_id（分類篩選）。 */
#[tauri::command]
pub fn cmd_get_transactions(
    state: State<'_, DbState>,
    year: Option<i32>,
    month: Option<u32>,
    search: Option<String>,
    category_id: Option<i64>,
) -> Result<Vec<Transaction>, String> {
    get_transactions(state, year, month, search, category_id)
}

/** 新增一筆交易。金額收入為正、支出為負；新增後會自動重算對應帳戶餘額。 */
#[tauri::command]
pub fn cmd_create_transaction(
    state: State<'_, DbState>,
    input: NewTransaction,
) -> Result<i64, String> {
    create_transaction(state, input)
}

/** 刪除一筆交易，並重算對應帳戶餘額。 */
#[tauri::command]
pub fn cmd_delete_transaction(state: State<'_, DbState>, id: i64) -> Result<(), String> {
    delete_transaction(state, id)
}

/** 取得指定月份的總覽：總收入、總支出、結餘。 */
#[tauri::command]
pub fn cmd_get_month_summary(
    state: State<'_, DbState>,
    year: i32,
    month: u32,
) -> Result<MonthSummary, String> {
    get_month_summary(state, year, month)
}

/** 取得指定月份各分類支出統計，供圖表顯示。 */
#[tauri::command]
pub fn cmd_get_category_stats(
    state: State<'_, DbState>,
    year: i32,
    month: u32,
) -> Result<Vec<CategoryStat>, String> {
    get_category_stats(state, year, month)
}

/** 匯出交易到 Excel。
 * export_all = true 匯出全部，false 僅匯出指定月份。
 * 輸出路徑由前端透過 Tauri dialog 選擇。 */
#[tauri::command]
pub fn cmd_export_to_excel(
    state: State<'_, DbState>,
    option: ExportOption,
) -> Result<String, String> {
    export_to_excel(state, option)
}

/** 備份資料庫：將 app.db 複製到使用者選擇的位置，
 * 檔名格式為 app_backup_YYYYMMDD_HHMMSS.db。 */
#[tauri::command]
pub fn cmd_backup_database(
    state: State<'_, DbState>,
    dest_path: String,
) -> Result<String, String> {
    backup_database(state, dest_path)
}

/** 重算指定帳戶餘額（對外開放，供前端手動觸發修復用）。 */
#[tauri::command]
pub fn cmd_recalc_balance(state: State<'_, DbState>, account_id: i64) -> Result<f64, String> {
    crate::db::recalc_balance(state, account_id)
}

// 供 main.rs 生成 invoke handler 時匯入
pub use crate::db::init;