use crate::models::{
    Account, Category, CategoryStat, ExportOption, MonthSummary, NewAccount, NewCategory,
    NewTransaction, Transaction,
};
use chrono::{Local};
use rusqlite::{params, Connection, Result};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::State;

/** 單一 SQLite 連線狀態，由 Tauri 管理，確保程式只保持一個連線 */
pub struct DbState {
    pub conn: Mutex<Connection>,
}

/** 取得執行檔所在目錄，並組出 data/app.db 路徑 */
pub fn db_path() -> Result<PathBuf, String> {
    let exe_dir = std::env::current_exe()
        .map_err(|e| format!("無法取得執行檔路徑: {}", e))?
        .parent()
        .ok_or("無法取得執行檔所在目錄")?
        .to_path_buf();

    let data_dir = exe_dir.join("data");
    fs::create_dir_all(&data_dir)
        .map_err(|e| format!("無法建立 data/ 資料夾: {}", e))?;

    Ok(data_dir.join("app.db"))
}

/** 建立資料庫連線並套用可攜式 SQLite 設定 */
fn open_connection(path: &Path) -> Result<Connection> {
    let conn = Connection::open(path)?;

    // 可攜式設計：隨身碟拔除不容易損壞，使用 DELETE journal + FULL synchronous
    conn.execute_batch("PRAGMA journal_mode = DELETE;")?;
    conn.execute_batch("PRAGMA synchronous = FULL;")?;
    conn.execute_batch("PRAGMA foreign_keys = ON;")?;

    Ok(conn)
}

/** 初始化資料庫：建立表格並插入預設分類 */
pub fn init_db(conn: &Connection) -> Result<()> {
    // 建立 accounts 表
    conn.execute(
        "CREATE TABLE IF NOT EXISTS accounts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            type TEXT,
            balance REAL DEFAULT 0,
            created_at TEXT
        )",
        [],
    )?;

    // 建立 categories 表
    conn.execute(
        "CREATE TABLE IF NOT EXISTS categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            kind TEXT NOT NULL,
            icon TEXT
        )",
        [],
    )?;

    // 建立 transactions 表
    conn.execute(
        "CREATE TABLE IF NOT EXISTS transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL,
            amount REAL NOT NULL,
            kind TEXT NOT NULL,
            account_id INTEGER,
            category_id INTEGER,
            note TEXT,
            created_at TEXT,
            updated_at TEXT,
            FOREIGN KEY (account_id) REFERENCES accounts(id),
            FOREIGN KEY (category_id) REFERENCES categories(id)
        )",
        [],
    )?;

    // 建立索引，加速日期查詢
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date)",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions(account_id)",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category_id)",
        [],
    )?;

    // 插入預設帳戶（若尚未存在）
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM accounts", [], |r| r.get(0))?;
    if count == 0 {
        let now = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
        conn.execute(
            "INSERT INTO accounts (name, type, balance, created_at) VALUES (?1, ?2, ?3, ?4)",
            params!["現金", "cash", 0.0, now],
        )?;
        conn.execute(
            "INSERT INTO accounts (name, type, balance, created_at) VALUES (?1, ?2, ?3, ?4)",
            params!["銀行", "bank", 0.0, now],
        )?;
        conn.execute(
            "INSERT INTO accounts (name, type, balance, created_at) VALUES (?1, ?2, ?3, ?4)",
            params!["信用卡", "credit", 0.0, now],
        )?;
        conn.execute(
            "INSERT INTO accounts (name, type, balance, created_at) VALUES (?1, ?2, ?3, ?4)",
            params!["悠遊卡", "other", 0.0, now],
        )?;
    }

    // 插入預設分類（若尚未存在）
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM categories", [], |r| r.get(0))?;
    if count == 0 {
        let default_categories = vec![
            ("餐飲", "expense", "🍜"),
            ("交通", "expense", "🚇"),
            ("房租", "expense", "🏠"),
            ("水電", "expense", "💡"),
            ("醫療", "expense", "🏥"),
            ("娛樂", "expense", "🎮"),
            ("購物", "expense", "🛍️"),
            ("薪水", "income", "💰"),
            ("其他", "expense", "📎"),
        ];
        for (name, kind, icon) in default_categories {
            conn.execute(
                "INSERT INTO categories (name, kind, icon) VALUES (?1, ?2, ?3)",
                params![name, kind, icon],
            )?;
        }
    }

    Ok(())
}

/** 從 Tauri 狀態取得連線並初始化資料庫 */
pub fn init(state: State<'_, DbState>) -> Result<(), String> {
    let path = db_path()?;
    let conn = open_connection(&path).map_err(|e| e.to_string())?;
    init_db(&conn).map_err(|e| e.to_string())?;
    // 將已初始化的連線存回狀態
    *state.conn.lock().map_err(|e| e.to_string())? = conn;
    Ok(())
}

/** ------------------------------------------------------------------ */
/*  帳戶 CRUD                                                         */
/** ------------------------------------------------------------------ */

/** 取得所有帳戶（含餘額計算） */
pub fn get_accounts(state: State<'_, DbState>) -> Result<Vec<Account>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT id, name, type, balance, created_at FROM accounts ORDER BY id"
    ).map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |r| {
        Ok(Account {
            id: r.get(0)?,
            name: r.get(1)?,
            r#type: r.get(2)?,
            balance: r.get(3)?,
            created_at: r.get(4)?,
        })
    }).map_err(|e| e.to_string())?;
    let mut accounts = Vec::new();
    for row in rows {
        accounts.push(row.map_err(|e| e.to_string())?);
    }
    Ok(accounts)
}

/** 新增帳戶 */
pub fn create_account(state: State<'_, DbState>, input: NewAccount) -> Result<i64, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let now = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    conn.execute(
        "INSERT INTO accounts (name, type, balance, created_at) VALUES (?1, ?2, 0, ?3)",
        params![input.name, input.r#type, now],
    ).map_err(|e| e.to_string())?;
    Ok(conn.last_insert_rowid())
}

/** 刪除帳戶（僅在該帳戶無交易時允許） */
pub fn delete_account(state: State<'_, DbState>, id: i64) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let tx_count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM transactions WHERE account_id = ?1",
        params![id],
        |r| r.get(0),
    ).map_err(|e| e.to_string())?;
    if tx_count > 0 {
        return Err(format!("帳戶有 {} 筆交易，無法刪除", tx_count));
    }
    conn.execute("DELETE FROM accounts WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

/** 重新計算並更新帳戶餘額（餘額 = 所有交易的加總），對外供 Tauri Command 呼載 */
pub fn recalc_balance(state: State<'_, DbState>, account_id: i64) -> Result<f64, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    recalc_balance_inner(&conn, account_id)
}

/** 內部使用：直接用現有連線重算餘額，避免重複上鎖導致死結 */
fn recalc_balance_inner(conn: &Connection, account_id: i64) -> Result<f64, String> {
    let sum: Option<f64> = conn.query_row(
        "SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE account_id = ?1",
        params![account_id],
        |r| r.get(0),
    ).map_err(|e| e.to_string())?;
    let balance = sum.unwrap_or(0.0);
    conn.execute(
        "UPDATE accounts SET balance = ?1 WHERE id = ?2",
        params![balance, account_id],
    ).map_err(|e| e.to_string())?;
    Ok(balance)
}

/** ------------------------------------------------------------------ */
/*  分類 CRUD                                                         */
/** ------------------------------------------------------------------ */

/** 取得所有分類 */
pub fn get_categories(state: State<'_, DbState>) -> Result<Vec<Category>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT id, name, kind, icon FROM categories ORDER BY kind, name"
    ).map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |r| {
        Ok(Category {
            id: r.get(0)?,
            name: r.get(1)?,
            kind: r.get(2)?,
            icon: r.get(3)?,
        })
    }).map_err(|e| e.to_string())?;
    let mut categories = Vec::new();
    for row in rows {
        categories.push(row.map_err(|e| e.to_string())?);
    }
    Ok(categories)
}

/** 新增分類 */
pub fn create_category(state: State<'_, DbState>, input: NewCategory) -> Result<i64, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO categories (name, kind, icon) VALUES (?1, ?2, ?3)",
        params![input.name, input.kind, input.icon],
    ).map_err(|e| e.to_string())?;
    Ok(conn.last_insert_rowid())
}

/** ------------------------------------------------------------------ */
/*  交易 CRUD                                                         */
/** ------------------------------------------------------------------ */

/** 新增一筆交易，並更新對應帳戶餘額 */
pub fn create_transaction(state: State<'_, DbState>, input: NewTransaction) -> Result<i64, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let now = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();

    // 收入存正數，支出存負數
    let amount = if input.kind == "income" {
        input.amount.abs()
    } else {
        -input.amount.abs()
    };

    conn.execute(
        "INSERT INTO transactions (date, amount, kind, account_id, category_id, note, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)",
        params![input.date, amount, input.kind, input.account_id, input.category_id, input.note, now],
    ).map_err(|e| e.to_string())?;
    let id = conn.last_insert_rowid();

    // 更新帳戶餘額
    recalc_balance_inner(&conn, input.account_id).map_err(|e| e.to_string())?;

    Ok(id)
}

/** 取得交易列表（依日期倒序），可選月份篩選、關鍵字搜尋、分類篩選 */
pub fn get_transactions(
    state: State<'_, DbState>,
    year: Option<i32>,
    month: Option<u32>,
    search: Option<String>,
    category_id: Option<i64>,
) -> Result<Vec<Transaction>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;

    let mut sql = String::from(
        "SELECT t.id, t.date, t.amount, t.kind, t.account_id, a.name,
                t.category_id, c.name, c.kind, c.icon, t.note, t.created_at, t.updated_at
         FROM transactions t
         LEFT JOIN accounts a ON t.account_id = a.id
         LEFT JOIN categories c ON t.category_id = c.id
         WHERE 1=1"
    );
    let mut params_vec: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

    if let Some(y) = year {
        if let Some(m) = month {
            sql.push_str(" AND strftime('%Y', t.date) = ? AND strftime('%m', t.date) = ?");
            params_vec.push(Box::new(y.to_string()) as Box<dyn rusqlite::ToSql>);
            params_vec.push(Box::new(format!("{:02}", m)) as Box<dyn rusqlite::ToSql>);
        }
    }
    if let Some(ref s) = search {
        sql.push_str(" AND t.note LIKE ?");
        params_vec.push(Box::new(format!("%{}%", s)) as Box<dyn rusqlite::ToSql>);
    }
    if let Some(cid) = category_id {
        sql.push_str(" AND t.category_id = ?");
        params_vec.push(Box::new(cid) as Box<dyn rusqlite::ToSql>);
    }
    sql.push_str(" ORDER BY t.date DESC, t.id DESC");

    // 建立 params 陣列
    let param_refs: Vec<&dyn rusqlite::ToSql> = params_vec.iter().map(|p| p.as_ref()).collect();

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt.query_map(rusqlite::params_from_iter(&param_refs), |r| {
        Ok(Transaction {
            id: r.get(0)?,
            date: r.get(1)?,
            amount: r.get(2)?,
            kind: r.get(3)?,
            account_id: r.get(4)?,
            account_name: r.get(5)?,
            category_id: r.get(6)?,
            category_name: r.get(7)?,
            category_kind: r.get(8)?,
            icon: r.get(9)?,
            note: r.get(10)?,
            created_at: r.get(11)?,
            updated_at: r.get(12)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut transactions = Vec::new();
    for row in rows {
        transactions.push(row.map_err(|e| e.to_string())?);
    }
    Ok(transactions)
}

/** 刪除一筆交易，並更新對應帳戶餘額 */
pub fn delete_transaction(state: State<'_, DbState>, id: i64) -> Result<(), String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;

    let account_id: Option<i64> = conn.query_row(
        "SELECT account_id FROM transactions WHERE id = ?1",
        params![id],
        |r| r.get(0),
    ).ok();

    conn.execute("DELETE FROM transactions WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;

    if let Some(aid) = account_id {
        recalc_balance_inner(&conn, aid).map_err(|e| e.to_string())?;
    }

    Ok(())
}

/** ------------------------------------------------------------------ */
/*  統計                                                              */
/** ------------------------------------------------------------------ */

/** 取得本月總覽 */
pub fn get_month_summary(state: State<'_, DbState>, year: i32, month: u32) -> Result<MonthSummary, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let month_str = format!("{:04}-{:02}", year, month);

    let total_income: f64 = conn.query_row(
        "SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE date LIKE ?1 AND kind = 'income'",
        params![format!("{}%", month_str)],
        |r| r.get(0),
    ).unwrap_or(0.0);

    let total_expense: f64 = conn.query_row(
        "SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE date LIKE ?1 AND kind = 'expense'",
        params![format!("{}%", month_str)],
        |r| r.get(0),
    ).unwrap_or(0.0);

    Ok(MonthSummary {
        year,
        month,
        total_income,
        total_expense: total_expense.abs(), // 顯示為正數
        balance: total_income - total_expense.abs(),
    })
}

/** 取得本月各分類支出統計（用於圖表） */
pub fn get_category_stats(state: State<'_, DbState>, year: i32, month: u32) -> Result<Vec<CategoryStat>, String> {
    let conn = state.conn.lock().map_err(|e| e.to_string())?;
    let month_str = format!("{:04}-{:02}", year, month);

    let mut stmt = conn.prepare(
        "SELECT c.id, c.name, c.icon, COALESCE(SUM(ABS(t.amount)), 0), COUNT(t.id)
         FROM transactions t
         JOIN categories c ON t.category_id = c.id
         WHERE t.date LIKE ?1 AND t.kind = 'expense'
         GROUP BY c.id, c.name, c.icon
         ORDER BY SUM(ABS(t.amount)) DESC"
    ).map_err(|e| e.to_string())?;

    let rows = stmt.query_map(params![format!("{}%", month_str)], |r| {
        Ok(CategoryStat {
            category_id: r.get(0)?,
            category_name: r.get(1)?,
            icon: r.get(2)?,
            total_amount: r.get(3)?,
            transaction_count: r.get(4)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut stats = Vec::new();
    for row in rows {
        stats.push(row.map_err(|e| e.to_string())?);
    }
    Ok(stats)
}

/** ------------------------------------------------------------------ */
/*  Excel 匯出                                                        */
/** ------------------------------------------------------------------ */

/** 匯出交易到 Excel 檔案 */
pub fn export_to_excel(_state: State<'_, DbState>, option: ExportOption) -> Result<String, String> {
    use rust_xlsxwriter::{Workbook, Format};

    // 查詢資料（建立獨立連線，避免與主連線併用）
    let path = db_path().map_err(|e| e.to_string())?;
    let conn = Connection::open(&path).map_err(|e| e.to_string())?;

    // 查詢資料
    let mut sql = String::from(
        "SELECT t.date, c.name, a.name, t.amount, t.note
         FROM transactions t
         LEFT JOIN categories c ON t.category_id = c.id
         LEFT JOIN accounts a ON t.account_id = a.id
         WHERE 1=1"
    );
    let mut params_vec: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

    if !option.export_all {
        let month_str = format!("{:04}-{:02}", option.year, option.month);
        sql.push_str(" AND t.date LIKE ?");
        params_vec.push(Box::new(format!("{}%", month_str)) as Box<dyn rusqlite::ToSql>);
    }
    sql.push_str(" ORDER BY t.date DESC, t.id DESC");

    let param_refs: Vec<&dyn rusqlite::ToSql> = params_vec.iter().map(|p| p.as_ref()).collect();
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt.query_map(rusqlite::params_from_iter(&param_refs), |r| {
        Ok((
            r.get::<_, String>(0)?, // date
            r.get::<_, Option<String>>(1)?, // category
            r.get::<_, Option<String>>(2)?, // account
            r.get::<_, f64>(3)?,   // amount
            r.get::<_, Option<String>>(4)?, // note
        ))
    }).map_err(|e| e.to_string())?;

    let mut transactions: Vec<(String, Option<String>, Option<String>, f64, Option<String>)> = Vec::new();
    for row in rows {
        transactions.push(row.map_err(|e| e.to_string())?);
    }

    // 計算總計
    let total: f64 = transactions.iter().map(|t| t.3).sum();

    // 建立 Excel
    let mut workbook = Workbook::new();
    let sheet = workbook.add_worksheet();

    // 標題格式：粗體
    let title_format = Format::new().set_bold();

    // 金額格式：#,##0
    let money_format = Format::new().set_num_format("#,##0");

    // 寫入標題列
    let headers = ["日期", "分類", "帳戶", "金額", "備註"];
    for (col, header) in headers.iter().enumerate() {
        sheet.write_string(0, col as u16, header, &title_format)
            .map_err(|e| format!("寫入標題失敗: {}", e))?;
    }

    // 寫入資料列
    let plain = Format::new();
    for (row_idx, (date, category, account, amount, note)) in transactions.iter().enumerate() {
        let excel_row = (row_idx + 1) as u32;
        sheet.write_string(excel_row, 0, date, &plain).map_err(|e| e.to_string())?;
        sheet.write_string(excel_row, 1, category.as_deref().unwrap_or(""), &plain).map_err(|e| e.to_string())?;
        sheet.write_string(excel_row, 2, account.as_deref().unwrap_or(""), &plain).map_err(|e| e.to_string())?;
        sheet.write_number(excel_row, 3, *amount, &money_format).map_err(|e| e.to_string())?;
        sheet.write_string(excel_row, 4, note.as_deref().unwrap_or(""), &plain).map_err(|e| e.to_string())?;
    }

    // 寫入總計列
    let total_row = transactions.len() + 1;
    let bold_format = Format::new().set_bold();
    sheet.write_string(total_row as u32, 0, "總計", &bold_format).map_err(|e| e.to_string())?;
    sheet.write_string(total_row as u32, 1, "", &plain).map_err(|e| e.to_string())?;
    sheet.write_string(total_row as u32, 2, "", &plain).map_err(|e| e.to_string())?;
    sheet.write_number(total_row as u32, 3, total, &money_format).map_err(|e| e.to_string())?;
    sheet.write_string(total_row as u32, 4, "", &plain).map_err(|e| e.to_string())?;

    // 自動寬度
    sheet.set_column_width(0, 12.0);
    sheet.set_column_width(1, 15.0);
    sheet.set_column_width(2, 15.0);
    sheet.set_column_width(3, 15.0);
    sheet.set_column_width(4, 30.0);

    // 儲存檔案
    workbook.save(&option.output_path).map_err(|e| format!("儲存 Excel 失敗: {}", e))?;

    Ok(option.output_path.clone())
}

/** 備份資料庫檔案到指定路徑 */
pub fn backup_database(_state: State<'_, DbState>, dest_path: String) -> Result<String, String> {
    let src_path = db_path().map_err(|e| e.to_string())?;

    // 確保來源檔案存在
    if !src_path.exists() {
        return Err("資料庫檔案不存在".to_string());
    }

    std::fs::copy(&src_path, &dest_path)
        .map_err(|e| format!("備份失敗: {}", e))?;

    Ok(dest_path)
}