use serde::{Deserialize, Serialize};

/** 帳戶資料模型 */
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Account {
    pub id: i64,
    pub name: String,
    pub r#type: String,
    pub balance: f64,
    pub created_at: String,
}

/** 新增帳戶時的輸入資料 */
#[derive(Debug, Deserialize)]
pub struct NewAccount {
    pub name: String,
    pub r#type: String,
}

/** 分類資料模型 */
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Category {
    pub id: i64,
    pub name: String,
    pub kind: String,        // expense / income
    pub icon: Option<String>,
}

/** 新增分類時的輸入資料 */
#[derive(Debug, Deserialize)]
pub struct NewCategory {
    pub name: String,
    pub kind: String,
    pub icon: Option<String>,
}

/** 交易資料模型 */
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Transaction {
    pub id: i64,
    pub date: String,
    pub amount: f64,
    pub kind: String,        // expense / income
    pub account_id: i64,
    pub account_name: Option<String>,
    pub category_id: i64,
    pub category_name: Option<String>,
    pub category_kind: Option<String>,
    pub icon: Option<String>,
    pub note: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

/** 新增交易時的輸入資料 */
#[derive(Debug, Deserialize)]
pub struct NewTransaction {
    pub date: String,
    pub amount: f64,
    pub kind: String,        // expense / income
    pub account_id: i64,
    pub category_id: i64,
    pub note: Option<String>,
}

/** 月份總覽統計 */
#[derive(Debug, Serialize, Deserialize)]
pub struct MonthSummary {
    pub year: i32,
    pub month: u32,
    pub total_income: f64,
    pub total_expense: f64,
    pub balance: f64,
}

/** 分類統計（用於圖表） */
#[derive(Debug, Serialize, Deserialize)]
pub struct CategoryStat {
    pub category_id: i64,
    pub category_name: String,
    pub icon: Option<String>,
    pub total_amount: f64,
    pub transaction_count: i64,
}

/** 匯出選項 */
#[derive(Debug, Deserialize)]
pub struct ExportOption {
    pub export_all: bool,       // true = 全部，false = 目前月份
    pub year: i32,
    pub month: u32,
    pub output_path: String,
}