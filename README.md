# 隨身帳 (FlashLedger)

可攜式桌面記帳軟體，可放在隨身碟攜帶，無需安裝、無需連網、無雲端，資料全存在本地 SQLite。

## 技術棧

- 語言：Rust
- 桌面框架：Tauri v2
- 前端：React + TypeScript + Tailwind CSS (Vite)
- 資料庫：SQLite (rusqlite bundled，單一連線)
- Excel 匯出：rust_xlsxwriter

## 專案結構

```
FlashLedger/
├── src-tauri/              # Rust 後端 (Tauri v2)
│   ├── Cargo.toml
│   ├── build.rs            # Tauri build script
│   ├── tauri.conf.json     # Tauri 設定 (可攜式)
│   ├── icons/icon.ico      # 應用程式圖示
│   ├── src/
│   │   ├── main.rs         # 入口點，DbState 單一連線，setup 初始化資料庫
│   │   ├── models.rs       # 資料模型 (Account, Category, Transaction...)
│   │   ├── db.rs           # 資料庫層 (CRUD, 統計, Excel 匯出, 備份)
│   │   └── commands.rs     # Tauri Command (全部附中文註解)
│   └── target/             # 編譯輸出
├── src/                    # React 前端
│   ├── main.tsx
│   ├── App.tsx             # 主畫面 + 設定頁面
│   ├── index.css
│   └── vite-env.d.ts
├── index.html
├── package.json
├── vite.config.ts
├── tsconfig.json
├── tailwind.config.js
└── postcss.config.js
```

## 可攜式設計 (最高優先級)

- 執行檔旁建立 `data/` 資料夾，資料庫路徑為 `<執行檔目錄>/data/app.db`
- 路徑由 `std::env::current_exe()` 決定，隨身碟盤符變更 (D:/E:/F:) 不影響
- 第一次啟動自動建立 `data/` 資料夾與資料庫、自動建表並插入預設帳戶與分類
- SQLite 設定：`journal_mode = DELETE`、`synchronous = FULL`，避免隨身碟拔除損壞
- 程式只保持一個 SQLite 連線，不開 WAL，不做多連線併發寫入
- 不寫 `%APPDATA%`、不寫使用者家目錄、不寫登錄檔

## 預設資料

**帳戶**：現金 (cash)、銀行 (bank)、信用卡 (credit)、悠遊卡 (other)

**分類**：餐飲、交通、房租、水電、醫療、娛樂、購物 (支出)；薪水 (收入)；其他 (支出)

## 開發與建置

### 前置需求

- Rust (stable)
- Node.js 與 npm

### 安裝依賴

```bash
cd FlashLedger
npm install
```

### 開發模式 (需 Tauri CLI)

```bash
# 安裝 Tauri CLI (透過 npm)
npm install -g @tauri-apps/cli

# 啟動開發伺服器
cargo tauri dev
```

或分開執行前端與後端：

```bash
# 終端機 A: 前端
npm run dev

# 終端機 B: 後端 (需先編譯)
cargo tauri dev
```

### 建置生產版本

```bash
# 建置前端
npm run build

# 建置 Rust 後端
cargo tauri build
```

建置產物位於 `src-tauri/target/release/flashledger.exe`，前端靜態檔於 `dist/`。

## 放到隨身碟使用

1. 執行 `cargo tauri build` 產生 release 版本
2. 將 `src-tauri/target/release/` 整個資料夾複製到隨身碟
3. 確保 `data/` 資料夾可在執行檔同目錄建立 (首次執行會自動建立)
4. 插入任何 Windows 電腦，直接執行 `flashledger.exe` 即可使用
5. 資料儲存在隨身碟的 `data/app.db`，可隨時以「資料庫備份」功能備份

## 功能 (MVP)

| 功能 | 說明 |
|------|------|
| 本月總覽 | 收入、支出、結餘卡片顯示 |
| 新增一筆帳 | 日期(預設今天)、金額、收支切換、帳戶、分類、備註 |
| 交易列表 | 日期倒序、搜尋備註、分類篩選、刪除 |
| 月份切換 | 上個月 / 下個月 |
| 分類統計 | 本月各分類支出總和與長條圖 |
| 帳戶管理 | 新增帳戶、顯示各帳戶餘額 |
| Excel 匯出 | 匯出本月 / 全部，標題列粗體藍底，金額數字格式，底列總計 |
| 資料庫備份 | 複製 app.db 到指定位置，檔名含時間戳 |

## 不包含 (故意不做)

雲端同步、登入、多使用者、複式記帳、預算、投資、發票掃描

## Tauri Command 清單 (全部附註解)

所有 Command 定義於 `src-tauri/src/commands.rs`，每個都有中文註解說明用途：

- `cmd_get_accounts` — 取得所有帳戶列表（含餘額）
- `cmd_create_account` — 新增帳戶
- `cmd_delete_account` — 刪除帳戶（無交易時才允許）
- `cmd_get_categories` — 取得所有分類
- `cmd_create_category` — 新增分類
- `cmd_get_transactions` — 取得交易列表（支援月份/關鍵字/分類篩選）
- `cmd_create_transaction` — 新增交易（自動重算帳戶餘額）
- `cmd_delete_transaction` — 刪除交易（自動重算帳戶餘額）
- `cmd_get_month_summary` — 取得本月總覽（收入/支出/結餘）
- `cmd_get_category_stats` — 取得分類支出統計（供圖表）
- `cmd_export_to_excel` — 匯出交易到 Excel 檔案
- `cmd_backup_database` — 備份資料庫檔案
- `cmd_recalc_balance` — 重算指定帳戶餘額
- `init_database` — 初始化資料庫 (setup 階段呼叫)
