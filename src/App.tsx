import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { StatusMessage, type Flash, type FlashKind } from './components/StatusMessage';
import { IconArrowLeft, IconDatabase, IconDownload, IconGear } from './components/icons';

/** ---------- 型別 ---------- */
interface Account {
  id: number;
  name: string;
  type: string;
  balance: number;
  created_at: string;
}

interface Category {
  id: number;
  name: string;
  kind: string; // 'expense' | 'income'
  icon: string | null;
}

interface Transaction {
  id: number;
  date: string;
  amount: number;
  kind: string; // 'expense' | 'income'
  account_id: number;
  account_name: string | null;
  category_id: number;
  category_name: string | null;
  category_kind: string | null;
  icon: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}

interface MonthSummary {
  year: number;
  month: number;
  total_income: number;
  total_expense: number;
  balance: number;
}

interface CategoryStat {
  category_id: number;
  category_name: string;
  icon: string | null;
  total_amount: number;
  transaction_count: number;
}

/** 新增交易表單 */
interface TxForm {
  date: string;
  amount: string;
  kind: 'expense' | 'income';
  account_id: string;
  category_id: string;
  note: string;
}

type TxFormKey = keyof TxForm;

/** 帳戶類型中文對照 */
const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  cash: '現金',
  bank: '銀行',
  credit: '信用卡',
  other: '其他',
};

const accountTypeLabel = (type: string) => ACCOUNT_TYPE_LABELS[type] ?? type;

function makeEmptyForm(): TxForm {
  return {
    date: new Date().toISOString().split('T')[0],
    amount: '',
    kind: 'expense',
    account_id: '',
    category_id: '',
    note: '',
  };
}

/** 畫面內狀態：成功訊息約 2 秒後自動清除，錯誤留到使用者再次操作 */
function useFlash(): readonly [
  Flash | null,
  (kind: FlashKind, message: string) => void,
  () => void,
] {
  const [flash, setFlash] = useState<Flash | null>(null);
  const timerRef = useRef<number | null>(null);

  const show = useCallback((kind: FlashKind, message: string) => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    setFlash({ kind, message });
    if (kind === 'success') {
      timerRef.current = window.setTimeout(() => setFlash(null), 2000);
    }
  }, []);

  const clear = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setFlash(null);
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  return [flash, show, clear] as const;
}

/** ---------- App ---------- */
export default function App() {
  const [page, setPage] = useState<'main' | 'settings'>('main');

  // 目前瀏覽月份
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [month, setMonth] = useState<number>(new Date().getMonth() + 1);

  // 資料
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [summary, setSummary] = useState<MonthSummary | null>(null);
  const [categoryStats, setCategoryStats] = useState<CategoryStat[]>([]);

  // 交易列表篩選（搜尋 200ms debounce）
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [filterCategoryId, setFilterCategoryId] = useState('');

  // 載入狀態（狀態列顯示「載入中」，不擋畫面）
  const [pendingCount, setPendingCount] = useState(0);
  const [loadError, setLoadError] = useState('');

  // 新增交易表單
  const [form, setForm] = useState<TxForm>(makeEmptyForm);

  // 帳戶管理表單
  const [newAccountName, setNewAccountName] = useState('');
  const [newAccountType, setNewAccountType] = useState('cash');

  // 分類管理表單
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryKind, setNewCategoryKind] = useState('expense');
  const [newCategoryIcon, setNewCategoryIcon] = useState('📎');

  // 匯出/備份輸出路徑（預設放在執行檔同目錄）
  const [excelOutputPath, setExcelOutputPath] = useState('');
  const [backupOutputPath, setBackupOutputPath] = useState('');

  // 各動作的畫面內狀態訊息
  const [formFlash, showFormFlash, clearFormFlash] = useFlash();
  const [listFlash, showListFlash] = useFlash();
  const [accountFlash, showAccountFlash] = useFlash();
  const [categoryFlash, showCategoryFlash] = useFlash();
  const [exportFlash, showExportFlash] = useFlash();
  const [backupFlash, showBackupFlash] = useFlash();

  const loading = pendingCount > 0;

  /** 載入帳戶、分類、月總覽與分類統計（不受列表篩選影響） */
  const loadMeta = useCallback(async () => {
    setPendingCount((c) => c + 1);
    try {
      const [accts, cats, sum, stats] = await Promise.all([
        invoke<Account[]>('cmd_get_accounts'),
        invoke<Category[]>('cmd_get_categories'),
        invoke<MonthSummary>('cmd_get_month_summary', { year, month }),
        invoke<CategoryStat[]>('cmd_get_category_stats', { year, month }),
      ]);
      setAccounts(accts);
      setCategories(cats);
      setSummary(sum);
      setCategoryStats(stats);
      setLoadError('');
    } catch (err) {
      setLoadError('載入資料失敗：' + (err as Error).message + '。請重新整理或重新啟動程式再試。');
    } finally {
      setPendingCount((c) => Math.max(0, c - 1));
    }
  }, [year, month]);

  /** 只重抓交易列表（含搜尋與分類篩選；空值傳 undefined） */
  const loadTransactions = useCallback(async () => {
    setPendingCount((c) => c + 1);
    try {
      const txs = await invoke<Transaction[]>('cmd_get_transactions', {
        year,
        month,
        search: search ? search : undefined,
        category_id: filterCategoryId ? parseInt(filterCategoryId, 10) : undefined,
      });
      setTransactions(txs);
    } catch (err) {
      setLoadError('載入交易列表失敗：' + (err as Error).message + '。請重新整理或重新啟動程式再試。');
    } finally {
      setPendingCount((c) => Math.max(0, c - 1));
    }
  }, [year, month, search, filterCategoryId]);

  useEffect(() => {
    void loadMeta();
  }, [loadMeta]);

  useEffect(() => {
    void loadTransactions();
  }, [loadTransactions]);

  // 搜尋輸入 200ms debounce 後才重抓交易列表
  useEffect(() => {
    const t = window.setTimeout(() => setSearch(searchInput.trim()), 200);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  /** ---------- 新增交易 ---------- */
  const handleFormChange = (key: TxFormKey, value: string) => {
    clearFormFlash();
    setForm((prev) => {
      const next: TxForm = { ...prev };
      if (key === 'kind') {
        if (value === 'expense' || value === 'income') {
          next.kind = value;
          // 切換收入/支出時，若目前分類不屬於新型別，清空分類
          const current = categories.find((c) => String(c.id) === prev.category_id);
          if (current && current.kind !== value) next.category_id = '';
        }
      } else if (key === 'date') {
        next.date = value;
      } else if (key === 'amount') {
        next.amount = value;
      } else if (key === 'account_id') {
        next.account_id = value;
      } else if (key === 'category_id') {
        next.category_id = value;
      } else {
        next.note = value;
      }
      return next;
    });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const amountNum = parseFloat(form.amount);
    const missing: string[] = [];
    if (!form.amount.trim() || Number.isNaN(amountNum) || amountNum <= 0) missing.push('金額');
    if (!form.account_id) missing.push('帳戶');
    if (!form.category_id) missing.push('分類');
    if (missing.length > 0) {
      showFormFlash('error', '請填寫：' + missing.join('、'));
      return;
    }
    try {
      await invoke('cmd_create_transaction', {
        date: form.date,
        amount: amountNum,
        kind: form.kind,
        account_id: parseInt(form.account_id, 10),
        category_id: parseInt(form.category_id, 10),
        note: form.note || undefined,
      });
      setForm(makeEmptyForm());
      showFormFlash('success', '已儲存');
      await Promise.all([loadMeta(), loadTransactions()]);
    } catch (err) {
      showFormFlash('error', '新增失敗：' + (err as Error).message + '。請確認內容後再試一次。');
    }
  };

  const handleDeleteTx = async (id: number) => {
    if (!window.confirm('確定刪除這筆交易？')) return;
    try {
      await invoke('cmd_delete_transaction', { id });
      await Promise.all([loadMeta(), loadTransactions()]);
    } catch (err) {
      showListFlash('error', '刪除失敗：' + (err as Error).message + '。請再試一次，或重新啟動程式。');
    }
  };

  /** ---------- 月份切換 ---------- */
  const prevMonth = () => {
    if (month === 1) {
      setMonth(12);
      setYear((y) => y - 1);
    } else {
      setMonth((m) => m - 1);
    }
  };
  const nextMonth = () => {
    if (month === 12) {
      setMonth(1);
      setYear((y) => y + 1);
    } else {
      setMonth((m) => m + 1);
    }
  };
  const goToCurrentMonth = () => {
    const now = new Date();
    setYear(now.getFullYear());
    setMonth(now.getMonth() + 1);
  };

  /** ---------- 列表篩選 ---------- */
  const filtersActive = search !== '' || filterCategoryId !== '';
  const handleClearFilters = () => {
    setSearchInput('');
    setSearch('');
    setFilterCategoryId('');
  };

  /** ---------- 帳戶管理 ---------- */
  const handleAddAccount = async () => {
    if (!newAccountName.trim()) {
      showAccountFlash('error', '請輸入帳戶名稱');
      return;
    }
    try {
      await invoke('cmd_create_account', {
        name: newAccountName.trim(),
        type: newAccountType,
      });
      setNewAccountName('');
      showAccountFlash('success', '已新增帳戶');
      await loadMeta();
    } catch (err) {
      showAccountFlash('error', '新增帳戶失敗：' + (err as Error).message + '。請檢查名稱後再試。');
    }
  };

  const handleDeleteAccount = async (id: number) => {
    if (!window.confirm('該帳戶若有交易將無法刪除，確定要刪除嗎？')) return;
    try {
      await invoke('cmd_delete_account', { id });
      await loadMeta();
    } catch (err) {
      showAccountFlash('error', '刪除失敗：' + (err as Error).message + '。若該帳戶仍有交易，需先刪除相關交易。');
    }
  };

  /** ---------- 分類管理 ---------- */
  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) {
      showCategoryFlash('error', '請輸入分類名稱');
      return;
    }
    try {
      await invoke('cmd_create_category', {
        name: newCategoryName.trim(),
        kind: newCategoryKind,
        icon: newCategoryIcon || undefined,
      });
      setNewCategoryName('');
      showCategoryFlash('success', '已新增分類');
      await loadMeta();
    } catch (err) {
      showCategoryFlash('error', '新增分類失敗：' + (err as Error).message + '。請檢查名稱後再試。');
    }
  };

  /** ---------- Excel 匯出 ---------- */
  const handleExportExcel = async (exportAll: boolean) => {
    const defaultName = exportAll
      ? `記帳_全部.xlsx`
      : `記帳_${year}-${String(month).padStart(2, '0')}.xlsx`;
    const outputPath = excelOutputPath || defaultName;
    try {
      await invoke('cmd_export_to_excel', {
        export_all: exportAll,
        year,
        month,
        output_path: outputPath,
      });
      showExportFlash('success', '匯出完成：' + outputPath);
    } catch (err) {
      showExportFlash('error', '匯出失敗：' + (err as Error).message + '。請檢查路徑後再試。');
    }
  };

  /** ---------- 資料備份 ---------- */
  const handleBackup = async () => {
    const ts = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const defaultName = `app_backup_${ts.getFullYear()}${pad(ts.getMonth() + 1)}${pad(ts.getDate())}_${pad(ts.getHours())}${pad(ts.getMinutes())}${pad(ts.getSeconds())}.db`;
    const outputPath = backupOutputPath || defaultName;
    try {
      await invoke('cmd_backup_database', { dest_path: outputPath });
      showBackupFlash('success', '備份完成：' + outputPath);
    } catch (err) {
      showBackupFlash('error', '備份失敗：' + (err as Error).message + '。請檢查路徑後再試。');
    }
  };

  const formatMoney = (v: number) => v.toLocaleString('zh-TW');

  const monthLabel = `${year}年${month}月`;
  const now = new Date();
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1;

  return (
    <div className="min-h-screen">
      {page === 'main' ? (
        <MainView
          accounts={accounts}
          categories={categories}
          transactions={transactions}
          summary={summary}
          categoryStats={categoryStats}
          monthLabel={monthLabel}
          isCurrentMonth={isCurrentMonth}
          loading={loading}
          loadError={loadError}
          searchInput={searchInput}
          filterCategoryId={filterCategoryId}
          filtersActive={filtersActive}
          form={form}
          formFlash={formFlash}
          listFlash={listFlash}
          onSearchInputChange={setSearchInput}
          onFilterCategoryChange={setFilterCategoryId}
          onClearFilters={handleClearFilters}
          onFormChange={handleFormChange}
          onSubmit={handleSubmit}
          onDeleteTx={handleDeleteTx}
          onPrevMonth={prevMonth}
          onNextMonth={nextMonth}
          onGoToCurrentMonth={goToCurrentMonth}
          formatMoney={formatMoney}
          onGoToSettings={() => setPage('settings')}
        />
      ) : (
        <SettingsView
          accounts={accounts}
          newAccountName={newAccountName}
          newAccountType={newAccountType}
          newCategoryName={newCategoryName}
          newCategoryKind={newCategoryKind}
          newCategoryIcon={newCategoryIcon}
          excelOutputPath={excelOutputPath}
          backupOutputPath={backupOutputPath}
          accountFlash={accountFlash}
          categoryFlash={categoryFlash}
          exportFlash={exportFlash}
          backupFlash={backupFlash}
          onSetNewAccountName={setNewAccountName}
          onSetNewAccountType={setNewAccountType}
          onSetNewCategoryName={setNewCategoryName}
          onSetNewCategoryKind={setNewCategoryKind}
          onSetNewCategoryIcon={setNewCategoryIcon}
          onSetExcelOutputPath={setExcelOutputPath}
          onSetBackupOutputPath={setBackupOutputPath}
          onAddAccount={handleAddAccount}
          onDeleteAccount={handleDeleteAccount}
          onAddCategory={handleAddCategory}
          onExportExcel={handleExportExcel}
          onBackup={handleBackup}
          formatMoney={formatMoney}
          onGoToMain={() => setPage('main')}
        />
      )}
    </div>
  );
}

/** ---------- 主畫面 ---------- */
interface MainViewProps {
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  summary: MonthSummary | null;
  categoryStats: CategoryStat[];
  monthLabel: string;
  isCurrentMonth: boolean;
  loading: boolean;
  loadError: string;
  searchInput: string;
  filterCategoryId: string;
  filtersActive: boolean;
  form: TxForm;
  formFlash: Flash | null;
  listFlash: Flash | null;
  onSearchInputChange: (v: string) => void;
  onFilterCategoryChange: (v: string) => void;
  onClearFilters: () => void;
  onFormChange: (key: TxFormKey, value: string) => void;
  onSubmit: (e: FormEvent) => void;
  onDeleteTx: (id: number) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onGoToCurrentMonth: () => void;
  formatMoney: (v: number) => string;
  onGoToSettings: () => void;
}

function MainView({
  accounts,
  categories,
  transactions,
  summary,
  categoryStats,
  monthLabel,
  isCurrentMonth,
  loading,
  loadError,
  searchInput,
  filterCategoryId,
  filtersActive,
  form,
  formFlash,
  listFlash,
  onSearchInputChange,
  onFilterCategoryChange,
  onClearFilters,
  onFormChange,
  onSubmit,
  onDeleteTx,
  onPrevMonth,
  onNextMonth,
  onGoToCurrentMonth,
  formatMoney,
  onGoToSettings,
}: MainViewProps) {
  const amountRef = useRef<HTMLInputElement | null>(null);
  const incomeCats = categories.filter((c) => c.kind === 'income');
  const expenseCats = categories.filter((c) => c.kind === 'expense');
  const statsTotal = categoryStats.reduce((sum, s) => sum + s.total_amount, 0);

  const balanceClass = !summary
    ? 'text-slate-900'
    : summary.balance > 0
      ? 'text-emerald-700'
      : summary.balance < 0
        ? 'text-rose-700'
        : 'text-slate-900';

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      {/* 頂列 */}
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">隨身帳</h1>
          <p className="mt-0.5 text-sm text-slate-600">本地單機記帳 · 資料儲存在執行檔旁的 data/app.db</p>
        </div>
        <button type="button" onClick={onGoToSettings} className="btn btn-ghost shrink-0">
          <IconGear className="h-5 w-5" />
          設定
        </button>
      </header>

      {/* 狀態列：載入中 / 載入失敗 */}
      <div aria-live="polite" className="mt-3 flex min-h-9 items-center">
        {loading ? (
          <span className="text-sm text-slate-600">載入中</span>
        ) : loadError ? (
          <div className="status status-error">{loadError}</div>
        ) : null}
      </div>

      {/* 月份列 */}
      <div className="mb-6 flex items-center justify-between gap-2">
        <button type="button" onClick={onPrevMonth} className="btn btn-ghost">
          上個月
        </button>
        <div className="flex flex-col items-center">
          <div className="text-lg font-semibold text-slate-900">{monthLabel}</div>
          {!isCurrentMonth && (
            <button
              type="button"
              onClick={onGoToCurrentMonth}
              className="mt-0.5 inline-flex min-h-[44px] items-center rounded-lg px-2.5 text-sm font-medium text-indigo-600 transition-colors duration-150 hover:bg-slate-100 hover:text-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 active:scale-[0.98]"
            >
              回到本月
            </button>
          )}
        </div>
        <button type="button" onClick={onNextMonth} className="btn btn-ghost">
          下個月
        </button>
      </div>

      {/* 本月總覽：一個表面、三個數字，結餘為主 */}
      <section aria-label="本月總覽" className="card mb-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="label">本月結餘</div>
            <div className={`text-4xl font-bold tabular-nums ${balanceClass}`}>
              {summary
                ? summary.balance >= 0
                  ? `+${formatMoney(summary.balance)}`
                  : `-${formatMoney(Math.abs(summary.balance))}`
                : '0'}
            </div>
          </div>
          <div className="flex gap-10">
            <div>
              <div className="label">本月收入</div>
              <div className="amount-income text-xl font-semibold">
                +{summary ? formatMoney(summary.total_income) : '0'}
              </div>
            </div>
            <div>
              <div className="label">本月支出</div>
              <div className="amount-expense text-xl font-semibold">
                -{summary ? formatMoney(summary.total_expense) : '0'}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 新增一筆帳（主任務，保持在列表之上） */}
      <section aria-label="新增一筆帳" className="card mb-6">
        <h2 className="mb-4 text-base font-semibold text-slate-900">新增一筆帳</h2>
        <form onSubmit={onSubmit} noValidate className="grid grid-cols-1 gap-4 md:grid-cols-12">
          <div className="md:col-span-2">
            <label htmlFor="tx-date" className="label">日期</label>
            <input
              id="tx-date"
              type="date"
              value={form.date}
              onChange={(e) => onFormChange('date', e.target.value)}
              className="input"
            />
          </div>
          <div className="md:col-span-2">
            <label htmlFor="tx-amount" className="label">金額</label>
            <input
              ref={amountRef}
              id="tx-amount"
              type="number"
              min="0"
              step="any"
              value={form.amount}
              onChange={(e) => onFormChange('amount', e.target.value)}
              className="input"
              placeholder="0"
            />
          </div>
          <div className="md:col-span-2">
            <span className="label" id="tx-kind-label">類型</span>
            <div
              role="group"
              aria-labelledby="tx-kind-label"
              className="flex rounded-xl border border-slate-300 bg-white p-1 shadow-sm"
            >
              <button
                type="button"
                aria-pressed={form.kind === 'expense'}
                onClick={() => onFormChange('kind', 'expense')}
                className={`flex min-h-11 flex-1 items-center justify-center rounded-lg text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                  form.kind === 'expense' ? 'bg-rose-50 text-rose-700' : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                支出
              </button>
              <button
                type="button"
                aria-pressed={form.kind === 'income'}
                onClick={() => onFormChange('kind', 'income')}
                className={`flex min-h-11 flex-1 items-center justify-center rounded-lg text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                  form.kind === 'income' ? 'bg-emerald-50 text-emerald-700' : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                收入
              </button>
            </div>
          </div>
          <div className="md:col-span-3">
            <label htmlFor="tx-account" className="label">帳戶</label>
            <select
              id="tx-account"
              value={form.account_id}
              onChange={(e) => onFormChange('account_id', e.target.value)}
              className="input"
            >
              <option value="">請選擇帳戶</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-3">
            <label htmlFor="tx-category" className="label">分類</label>
            <select
              id="tx-category"
              value={form.category_id}
              onChange={(e) => onFormChange('category_id', e.target.value)}
              className="input"
            >
              <option value="">請選擇分類</option>
              {(form.kind === 'income' ? incomeCats : expenseCats).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.icon ? `${c.icon} ` : ''}{c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-12">
            <label htmlFor="tx-note" className="label">備註</label>
            <input
              id="tx-note"
              type="text"
              value={form.note}
              onChange={(e) => onFormChange('note', e.target.value)}
              className="input"
              placeholder="例如：便當、交通費"
            />
          </div>
          <div className="flex justify-end md:col-span-12">
            <button type="submit" className="btn btn-primary max-sm:w-full">
              記一筆
            </button>
          </div>
        </form>
        {/* 驗證失敗與新增結果顯示在表單下，不使用彈窗 */}
        <div aria-live="polite" className="mt-2 min-h-8">
          <StatusMessage flash={formFlash} />
        </div>
      </section>

      {/* 交易列表 */}
      <section aria-label="交易列表" className="card">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="text-base font-semibold text-slate-900">交易列表</h2>
            {filtersActive && (
              <span className="text-xs text-slate-600">列表已篩選，總覽仍為全月</span>
            )}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              value={searchInput}
              onChange={(e) => onSearchInputChange(e.target.value)}
              placeholder="搜尋備註..."
              aria-label="搜尋備註"
              className="input sm:w-52"
            />
            <select
              value={filterCategoryId}
              onChange={(e) => onFilterCategoryChange(e.target.value)}
              aria-label="依分類篩選"
              className="input sm:w-44"
            >
              <option value="">全部分類</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.icon ? `${c.icon} ` : ''}{c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="table-wrap">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200">
                <th scope="col" className="px-4 py-3 text-xs font-medium text-slate-600">日期</th>
                <th scope="col" className="px-4 py-3 text-xs font-medium text-slate-600">分類</th>
                <th scope="col" className="px-4 py-3 text-xs font-medium text-slate-600">帳戶</th>
                <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-slate-600">金額</th>
                <th scope="col" className="px-4 py-3 text-xs font-medium text-slate-600">備註</th>
                <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-slate-600">操作</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((tx) => (
                <tr
                  key={tx.id}
                  className="border-b border-slate-100 transition-colors duration-150 hover:bg-slate-50/80"
                >
                  <td className="px-4 py-3.5 text-slate-900">{tx.date}</td>
                  <td className="px-4 py-3.5 text-slate-900">
                    {tx.icon ? `${tx.icon} ` : ''}{tx.category_name ?? '-'}
                  </td>
                  <td className="px-4 py-3.5 text-slate-900">{tx.account_name ?? '-'}</td>
                  <td
                    className={`px-4 py-3.5 text-right font-semibold tabular-nums ${
                      tx.kind === 'income' ? 'text-emerald-700' : 'text-rose-700'
                    }`}
                  >
                    {tx.kind === 'income'
                      ? `+${formatMoney(tx.amount)}`
                      : `-${formatMoney(Math.abs(tx.amount))}`}
                  </td>
                  <td className="px-4 py-3.5 text-slate-600">{tx.note || '-'}</td>
                  <td className="px-4 py-3.5 text-right">
                    <button type="button" onClick={() => onDeleteTx(tx.id)} className="btn btn-danger px-3">
                      刪除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {transactions.length === 0 && (
            <div className="py-10 text-center">
              <p className="text-sm text-slate-600">
                {filtersActive ? '沒有符合篩選條件的交易' : '本月尚無交易'}
              </p>
              <p className="mt-1 text-xs text-slate-600">
                {filtersActive ? '試試更改搜尋關鍵字或分類篩選' : '在上方表單記下第一筆帳'}
              </p>
              {filtersActive ? (
                <button type="button" onClick={onClearFilters} className="btn btn-ghost mt-4">
                  清除篩選
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => amountRef.current?.focus()}
                  className="btn btn-primary mt-4"
                >
                  記第一筆
                </button>
              )}
            </div>
          )}

          <div aria-live="polite" className={listFlash ? 'px-4 pb-4' : ''}>
            <StatusMessage flash={listFlash} />
          </div>
        </div>
      </section>

      {/* 分類支出統計（放在列表之後，是列表不是卡片裡的卡片） */}
      <section aria-label="本月分類支出統計" className="card mt-6">
        <h2 className="mb-4 text-base font-semibold text-slate-900">本月分類支出統計</h2>
        {categoryStats.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-600">本月無支出記錄</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {categoryStats.map((stat) => {
              const pct = statsTotal > 0 ? (stat.total_amount / statsTotal) * 100 : 0;
              return (
                <li key={stat.category_id} className="py-3">
                  <div className="flex items-center gap-3">
                    <span className="w-6 shrink-0 text-center" aria-hidden="true">
                      {stat.icon ?? ''}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm text-slate-900">
                      {stat.category_name}
                    </span>
                    <span className="shrink-0 text-xs text-slate-600">{stat.transaction_count} 筆交易</span>
                    <span className="amount-expense shrink-0 text-sm font-semibold">
                      -{formatMoney(stat.total_amount)}
                    </span>
                  </div>
                  {/* 比例條：唯一允許的動態寬度 */}
                  <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-slate-100">
                    <div className="h-1 rounded-full bg-rose-500" style={{ width: pct + '%' }} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

/** ---------- 設定頁面 ---------- */
interface SettingsViewProps {
  accounts: Account[];
  newAccountName: string;
  newAccountType: string;
  newCategoryName: string;
  newCategoryKind: string;
  newCategoryIcon: string;
  excelOutputPath: string;
  backupOutputPath: string;
  accountFlash: Flash | null;
  categoryFlash: Flash | null;
  exportFlash: Flash | null;
  backupFlash: Flash | null;
  onSetNewAccountName: (v: string) => void;
  onSetNewAccountType: (v: string) => void;
  onSetNewCategoryName: (v: string) => void;
  onSetNewCategoryKind: (v: string) => void;
  onSetNewCategoryIcon: (v: string) => void;
  onSetExcelOutputPath: (v: string) => void;
  onSetBackupOutputPath: (v: string) => void;
  onAddAccount: () => void;
  onDeleteAccount: (id: number) => void;
  onAddCategory: () => void;
  onExportExcel: (all: boolean) => void;
  onBackup: () => void;
  formatMoney: (v: number) => string;
  onGoToMain: () => void;
}

function SettingsView({
  accounts,
  newAccountName,
  newAccountType,
  newCategoryName,
  newCategoryKind,
  newCategoryIcon,
  excelOutputPath,
  backupOutputPath,
  accountFlash,
  categoryFlash,
  exportFlash,
  backupFlash,
  onSetNewAccountName,
  onSetNewAccountType,
  onSetNewCategoryName,
  onSetNewCategoryKind,
  onSetNewCategoryIcon,
  onSetExcelOutputPath,
  onSetBackupOutputPath,
  onAddAccount,
  onDeleteAccount,
  onAddCategory,
  onExportExcel,
  onBackup,
  formatMoney,
  onGoToMain,
}: SettingsViewProps) {
  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      {/* 頂列 */}
      <header className="mb-8 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-slate-900">設定</h1>
        <button type="button" onClick={onGoToMain} className="btn btn-ghost shrink-0">
          <IconArrowLeft className="h-5 w-5" />
          回主畫面
        </button>
      </header>

      {/* 帳戶管理（一組表面，不再套進另一張大卡片） */}
      <section aria-labelledby="sec-accounts" className="mb-10">
        <h2 id="sec-accounts" className="mb-4 text-lg font-bold text-slate-900">帳戶管理</h2>
        {accounts.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-600">尚無帳戶</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {accounts.map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm transition-shadow duration-150 hover:shadow"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-slate-900">{a.name}</div>
                  <div className="mt-0.5 text-xs text-slate-600">{accountTypeLabel(a.type)}</div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-lg font-bold tabular-nums text-slate-900">
                    {a.balance >= 0 ? '+' : ''}{formatMoney(a.balance)}
                  </span>
                  <button type="button" onClick={() => onDeleteAccount(a.id)} className="btn btn-danger px-2.5">
                    刪除
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 新增帳戶 */}
        <div className="mt-5 grid grid-cols-1 items-end gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label htmlFor="acc-name" className="label">帳戶名稱</label>
            <input
              id="acc-name"
              type="text"
              value={newAccountName}
              onChange={(e) => onSetNewAccountName(e.target.value)}
              className="input"
              placeholder="例如：現金"
            />
          </div>
          <div>
            <label htmlFor="acc-type" className="label">類型</label>
            <select
              id="acc-type"
              value={newAccountType}
              onChange={(e) => onSetNewAccountType(e.target.value)}
              className="input"
            >
              <option value="cash">現金</option>
              <option value="bank">銀行</option>
              <option value="credit">信用卡</option>
              <option value="other">其他</option>
            </select>
          </div>
          <button type="button" onClick={onAddAccount} className="btn btn-primary">
            新增
          </button>
        </div>
        <div aria-live="polite" className="mt-3 min-h-8">
          <StatusMessage flash={accountFlash} />
        </div>
      </section>

      {/* 分類管理 */}
      <section aria-labelledby="sec-categories" className="mb-10">
        <h2 id="sec-categories" className="mb-4 text-lg font-bold text-slate-900">分類管理</h2>
        <div className="grid grid-cols-1 items-end gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label htmlFor="cat-name" className="label">分類名稱</label>
            <input
              id="cat-name"
              type="text"
              value={newCategoryName}
              onChange={(e) => onSetNewCategoryName(e.target.value)}
              className="input"
              placeholder="例如：餐飲"
            />
          </div>
          <div>
            <label htmlFor="cat-kind" className="label">類型</label>
            <select
              id="cat-kind"
              value={newCategoryKind}
              onChange={(e) => onSetNewCategoryKind(e.target.value)}
              className="input"
            >
              <option value="expense">支出</option>
              <option value="income">收入</option>
            </select>
          </div>
          <div>
            <label htmlFor="cat-icon" className="label">圖示</label>
            <input
              id="cat-icon"
              type="text"
              value={newCategoryIcon}
              onChange={(e) => onSetNewCategoryIcon(e.target.value)}
              className="input text-center"
              maxLength={2}
            />
          </div>
          <button type="button" onClick={onAddCategory} className="btn btn-primary">
            新增
          </button>
        </div>
        <div aria-live="polite" className="mt-3 min-h-8">
          <StatusMessage flash={categoryFlash} />
        </div>
      </section>

      {/* 匯出與備份 */}
      <section aria-labelledby="sec-export">
        <h2 id="sec-export" className="mb-4 text-lg font-bold text-slate-900">匯出與備份</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="excel-path" className="label">Excel 匯出路徑</label>
            <input
              id="excel-path"
              type="text"
              value={excelOutputPath}
              onChange={(e) => onSetExcelOutputPath(e.target.value)}
              className="input"
              placeholder="記帳_2026-11.xlsx"
            />
          </div>
          <div>
            <label htmlFor="backup-path" className="label">資料庫備份路徑</label>
            <input
              id="backup-path"
              type="text"
              value={backupOutputPath}
              onChange={(e) => onSetBackupOutputPath(e.target.value)}
              className="input"
              placeholder="app_backup_20261115_143000.db"
            />
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <button type="button" onClick={() => onExportExcel(false)} className="btn btn-primary">
            <IconDownload className="h-5 w-5" />
            匯出本月 Excel
          </button>
          <button type="button" onClick={() => onExportExcel(true)} className="btn btn-primary">
            <IconDownload className="h-5 w-5" />
            匯出全部 Excel
          </button>
          <button type="button" onClick={onBackup} className="btn btn-success">
            <IconDatabase className="h-5 w-5" />
            資料庫備份
          </button>
        </div>
        <div aria-live="polite" className="mt-3 grid min-h-8 gap-2">
          <StatusMessage flash={exportFlash} />
          <StatusMessage flash={backupFlash} />
        </div>
      </section>
    </div>
  );
}
