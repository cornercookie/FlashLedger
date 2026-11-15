import React, { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';

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

  // 新增交易表單
  const [form, setForm] = useState({
    date: new Date().toISOString().split('T')[0],
    amount: '',
    kind: 'expense' as 'expense' | 'income',
    account_id: '',
    category_id: '',
    note: '',
  });
  const [saveMsg, setSaveMsg] = useState('');

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

  /** 載入所有資料 */
  const loadData = useCallback(async () => {
    try {
      const [accts, cats, txs, sum, stats] = await Promise.all([
        invoke<Account[]>('cmd_get_accounts'),
        invoke<Category[]>('cmd_get_categories'),
        invoke<Transaction[]>('cmd_get_transactions', { year, month }),
        invoke<MonthSummary>('cmd_get_month_summary', { year, month }),
        invoke<CategoryStat[]>('cmd_get_category_stats', { year, month }),
      ]);
      setAccounts(accts);
      setCategories(cats);
      setTransactions(txs);
      setSummary(sum);
      setCategoryStats(stats);
    } catch (err) {
      alert('載入資料失敗：' + (err as Error).message);
    }
  }, [year, month]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  /** ---------- 新增交易 ---------- */
  const handleFormChange = (key: string, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.amount || !form.account_id || !form.category_id) {
      alert('請填寫金額、帳戶與分類');
      return;
    }
    try {
      await invoke('cmd_create_transaction', {
        date: form.date,
        amount: parseFloat(form.amount),
        kind: form.kind,
        account_id: parseInt(form.account_id),
        category_id: parseInt(form.category_id),
        note: form.note || undefined,
      });
      setForm({
        date: new Date().toISOString().split('T')[0],
        amount: '',
        kind: 'expense',
        account_id: '',
        category_id: '',
        note: '',
      });
      setSaveMsg('已儲存');
      setTimeout(() => setSaveMsg(''), 1500);
      loadData();
    } catch (err) {
      alert('新增失敗：' + (err as Error).message);
    }
  };

  const handleDeleteTx = async (id: number) => {
    if (!window.confirm('確定刪除這筆交易？')) return;
    try {
      await invoke('cmd_delete_transaction', { id });
      loadData();
    } catch (err) {
      alert('刪除失敗：' + (err as Error).message);
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

  /** ---------- 帳戶管理 ---------- */
  const handleAddAccount = async () => {
    if (!newAccountName.trim()) return;
    try {
      await invoke('cmd_create_account', {
        name: newAccountName,
        type: newAccountType,
      });
      setNewAccountName('');
      loadData();
    } catch (err) {
      alert('新增帳戶失敗：' + (err as Error).message);
    }
  };

  const handleDeleteAccount = async (id: number) => {
    if (!window.confirm('該帳戶若有交易將無法刪除，確定要刪除嗎？')) return;
    try {
      await invoke('cmd_delete_account', { id });
      loadData();
    } catch (err) {
      alert('刪除失敗：' + (err as Error).message);
    }
  };

  /** ---------- 分類管理 ---------- */
  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) return;
    try {
      await invoke('cmd_create_category', {
        name: newCategoryName,
        kind: newCategoryKind,
        icon: newCategoryIcon,
      });
      setNewCategoryName('');
      loadData();
    } catch (err) {
      alert('新增分類失敗：' + (err as Error).message);
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
      alert('匯出完成：' + outputPath);
    } catch (err) {
      alert('匯出失敗：' + (err as Error).message);
    }
  };

  /** ---------- 資料備份 ---------- */
  const handleBackup = async () => {
    const ts = new Date();
    const defaultName = `app_backup_${ts.getFullYear()}${String(ts.getMonth() + 1).padStart(2, '0')}${String(ts.getDate()).padStart(2, '0')}_${String(ts.getHours()).padStart(2, '0')}${String(ts.getMinutes()).padStart(2, '0')}${String(ts.getSeconds()).padStart(2, '0')}.db`;
    const outputPath = backupOutputPath || defaultName;
    try {
      await invoke('cmd_backup_database', { dest_path: outputPath });
      alert('備份完成：' + outputPath);
    } catch (err) {
      alert('備份失敗：' + (err as Error).message);
    }
  };

  const formatMoney = (v: number) => v.toLocaleString('zh-TW');

  const monthLabel = `${year}年${month}月`;

  return (
    <div className="min-h-screen bg-gray-50">
      {page === 'main' ? (
        <MainView
          accounts={accounts}
          categories={categories}
          transactions={transactions}
          summary={summary}
          categoryStats={categoryStats}
          monthLabel={monthLabel}
          form={form}
          saveMsg={saveMsg}
          onFormChange={handleFormChange}
          onSubmit={handleSubmit}
          onDeleteTx={handleDeleteTx}
          onPrevMonth={prevMonth}
          onNextMonth={nextMonth}
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
          onSetNewAccountName={setNewAccountName}
          onSetNewAccountType={setNewAccountType}
          onSetNewCategoryName={setNewCategoryName}
          onSetNewCategoryKind={setNewCategoryKind}
          onSetNewCategoryIcon={setNewCategoryIcon}
          onAddAccount={handleAddAccount}
          onDeleteAccount={handleDeleteAccount}
          onAddCategory={handleAddCategory}
          onExportExcel={handleExportExcel}
          onBackup={handleBackup}
          formatMoney={formatMoney}
          excelOutputPath={excelOutputPath}
          setExcelOutputPath={setExcelOutputPath}
          backupOutputPath={backupOutputPath}
          setBackupOutputPath={setBackupOutputPath}
          onGoToMain={() => setPage('main')}
        />
      )}
    </div>
  );
}

/** ---------- 主畫面 ---------- */
function MainView({
  accounts,
  categories,
  transactions,
  summary,
  categoryStats,
  monthLabel,
  form,
  saveMsg,
  onFormChange,
  onSubmit,
  onDeleteTx,
  onPrevMonth,
  onNextMonth,
  formatMoney,
  onGoToSettings,
}: {
  accounts: any[];
  categories: any[];
  transactions: any[];
  summary: any;
  categoryStats: any[];
  monthLabel: string;
  form: any;
  saveMsg: string;
  onFormChange: (k: string, v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onDeleteTx: (id: number) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  formatMoney: (v: number) => string;
  onGoToSettings: () => void;
}) {
  const incomeCats = categories.filter((c) => c.kind === 'income');
  const expenseCats = categories.filter((c) => c.kind === 'expense');

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      {/* 頁首 */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">隨身帳 (FlashLedger)</h1>
          <p className="text-gray-600 text-sm">本地單機記帳 · 資料儲存在執行檔旁的 data/app.db</p>
        </div>
        <button
          onClick={onGoToSettings}
          className="text-sm text-blue-600 hover:underline"
        >
          ⚙️ 設定
        </button>
      </div>

      {/* 本月總覽卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="card">
          <div className="text-sm text-gray-500 mb-1">本月收入</div>
          <div className="text-2xl font-bold amount-positive">
            +{summary ? formatMoney(summary.total_income) : '0'}
          </div>
        </div>
        <div className="card">
          <div className="text-sm text-gray-500 mb-1">本月支出</div>
          <div className="text-2xl font-bold amount-negative">
            -{summary ? formatMoney(summary.total_expense) : '0'}
          </div>
        </div>
        <div className="card">
          <div className="text-sm text-gray-500 mb-1">本月結餘</div>
          <div className="text-2xl font-bold">
            {summary
              ? summary.balance >= 0
                ? `+${formatMoney(summary.balance)}`
                : `-${formatMoney(Math.abs(summary.balance))}`
              : '0'}
          </div>
        </div>
      </div>

      {/* 月份切換 */}
      <div className="flex items-center justify-between mb-4">
        <div className="text-lg font-semibold">{monthLabel}</div>
        <div className="flex gap-2">
          <button onClick={onPrevMonth} className="px-3 py-1 bg-white border border-gray-300 rounded hover:bg-gray-100">
            上個月
          </button>
          <button onClick={onNextMonth} className="px-3 py-1 bg-white border border-gray-300 rounded hover:bg-gray-100">
            下個月
          </button>
        </div>
      </div>

      {/* 新增一筆帳表單（最明顯位置） */}
      <div className="card mb-6">
        <div className="text-sm font-semibold text-gray-700 mb-3">新增一筆帳</div>
        <form onSubmit={onSubmit} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
          <div className="md:col-span-2">
            <label className="block text-xs text-gray-500 mb-1">日期</label>
            <input
              type="date"
              value={form.date}
              onChange={(e) => onFormChange('date', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded text-base"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs text-gray-500 mb-1">金額</label>
            <input
              type="number"
              value={form.amount}
              onChange={(e) => onFormChange('amount', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded text-base"
              placeholder="0"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs text-gray-500 mb-1">類型</label>
            <select
              value={form.kind}
              onChange={(e) => onFormChange('kind', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded text-base"
            >
              <option value="expense">支出</option>
              <option value="income">收入</option>
            </select>
          </div>
          <div className="md:col-span-3">
            <label className="block text-xs text-gray-500 mb-1">帳戶</label>
            <select
              value={form.account_id}
              onChange={(e) => onFormChange('account_id', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded text-base"
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
            <label className="block text-xs text-gray-500 mb-1">分類</label>
            <select
              value={form.category_id}
              onChange={(e) => onFormChange('category_id', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded text-base"
            >
              <option value="">請選擇分類</option>
              {(form.kind === 'income' ? incomeCats : expenseCats).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.icon} {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-12">
            <label className="block text-xs text-gray-500 mb-1">備註</label>
            <input
              type="text"
              value={form.note}
              onChange={(e) => onFormChange('note', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded text-base"
              placeholder="例如：便當、交通費"
            />
          </div>
          <div className="md:col-span-12 flex justify-end">
            <button
              type="submit"
              className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium text-base hover:bg-blue-700 transition-colors"
            >
              記一筆
            </button>
          </div>
        </form>
        {saveMsg && <div className="mt-2 text-sm text-green-600">{saveMsg}</div>}
      </div>

      {/* 交易列表 */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div className="text-sm font-semibold text-gray-700">交易列表</div>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="搜尋備註..."
              className="px-2 py-1 border border-gray-300 rounded text-sm"
            />
            <select className="px-2 py-1 border border-gray-300 rounded text-sm">
              <option value="">全部分類</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="px-4 py-3 text-xs text-gray-500">日期</th>
                <th className="px-4 py-3 text-xs text-gray-500">分類</th>
                <th className="px-4 py-3 text-xs text-gray-500">帳戶</th>
                <th className="px-4 py-3 text-xs text-gray-500 text-right">金額</th>
                <th className="px-4 py-3 text-xs text-gray-500">備註</th>
                <th className="px-4 py-3 text-xs text-gray-500 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((tx) => (
                <tr
                  key={tx.id}
                  className="border-b border-gray-100 hover:bg-gray-50"
                >
                  <td className="px-4 py-3 text-sm">{tx.date}</td>
                  <td className="px-4 py-3 text-sm">
                    {tx.icon} {tx.category_name}
                  </td>
                  <td className="px-4 py-3 text-sm">{tx.account_name}</td>
                  <td className="px-4 py-3 text-sm text-right font-semibold">
                    {tx.kind === 'income'
                      ? `+${formatMoney(tx.amount)}`
                      : `-${formatMoney(Math.abs(tx.amount))}`}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {tx.note || '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-right">
                    <button
                      onClick={() => onDeleteTx(tx.id)}
                      className="btn-danger"
                    >
                      刪除
                    </button>
                  </td>
                </tr>
              ))}
              {transactions.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                    尚無交易記錄
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 分類統計 */}
      <div className="mt-6 card">
        <div className="text-sm font-semibold text-gray-700 mb-4">本月分類支出統計</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {categoryStats.length > 0 ? (
            categoryStats.map((stat) => (
              <div
                key={stat.category_id}
                className="flex items-center gap-3 p-3 bg-gray-50 rounded border border-gray-100"
              >
                <span className="text-xl">{stat.icon || '📎'}</span>
                <div className="flex-1">
                  <div className="text-sm font-medium">{stat.category_name}</div>
                  <div className="text-xs text-gray-500">
                    {stat.transaction_count} 筆交易
                  </div>
                </div>
                <div className="text-sm font-bold text-red-600 text-right">
                  -{formatMoney(stat.total_amount)}
                </div>
              </div>
            ))
          ) : (
            <div className="text-sm text-gray-400 text-center py-4">
              本月無支出記錄
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** ---------- 設定頁面 ---------- */
function SettingsView({
  accounts,
  newAccountName,
  newAccountType,
  newCategoryName,
  newCategoryKind,
  newCategoryIcon,
  onSetNewAccountName,
  onSetNewAccountType,
  onSetNewCategoryName,
  onSetNewCategoryKind,
  onSetNewCategoryIcon,
  onAddAccount,
  onDeleteAccount,
  onAddCategory,
  onExportExcel,
  onBackup,
  formatMoney,
  excelOutputPath,
  setExcelOutputPath,
  backupOutputPath,
  setBackupOutputPath,
  onGoToMain,
}: {
  accounts: any[];
  newAccountName: string;
  newAccountType: string;
  newCategoryName: string;
  newCategoryKind: string;
  newCategoryIcon: string;
  onSetNewAccountName: (v: string) => void;
  onSetNewAccountType: (v: string) => void;
  onSetNewCategoryName: (v: string) => void;
  onSetNewCategoryKind: (v: string) => void;
  onSetNewCategoryIcon: (v: string) => void;
  onAddAccount: () => void;
  onDeleteAccount: (id: number) => void;
  onAddCategory: () => void;
  onExportExcel: (all: boolean) => void;
  onBackup: () => void;
  formatMoney: (v: number) => string;
  excelOutputPath: string;
  setExcelOutputPath: (v: string) => void;
  backupOutputPath: string;
  setBackupOutputPath: (v: string) => void;
  onGoToMain: () => void;
}) {
  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">設定</h1>
        <button
          onClick={onGoToMain}
          className="text-sm text-blue-600 hover:underline"
        >
          ← 回主畫面
        </button>
      </div>

      {/* 帳戶管理 */}
      <div className="card mb-8">
        <h2 className="text-lg font-bold mb-4">帳戶管理</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {accounts.map((a) => (
            <div key={a.id} className="p-4 bg-white border border-gray-200 rounded">
              <div className="text-sm font-medium">{a.name}</div>
              <div className="text-xs text-gray-500">{a.type}</div>
              <div className="mt-1 text-lg font-bold">
                {a.balance >= 0 ? '+' : ''}{formatMoney(a.balance)}
              </div>
              <button
                onClick={() => onDeleteAccount(a.id)}
                className="mt-2 text-xs text-red-600 hover:underline"
              >
                刪除
              </button>
            </div>
          ))}
          {accounts.length === 0 && (
            <div className="col-span-3 text-sm text-gray-400 text-center py-8">
              尚無帳戶
            </div>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">帳戶名稱</label>
            <input
              value={newAccountName}
              onChange={(e) => onSetNewAccountName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded"
              placeholder="例如：現金"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">類型</label>
            <select
              value={newAccountType}
              onChange={(e) => onSetNewAccountType(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded"
            >
              <option value="cash">現金</option>
              <option value="bank">銀行</option>
              <option value="credit">信用卡</option>
              <option value="other">其他</option>
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={onAddAccount}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              新增
            </button>
          </div>
          <div></div>
        </div>
      </div>

      {/* 分類管理 */}
      <div className="card mb-8">
        <h2 className="text-lg font-bold mb-4">分類管理</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">分類名稱</label>
            <input
              value={newCategoryName}
              onChange={(e) => onSetNewCategoryName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded"
              placeholder="例如：餐飲"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">類型</label>
            <select
              value={newCategoryKind}
              onChange={(e) => onSetNewCategoryKind(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded"
            >
              <option value="expense">支出</option>
              <option value="income">收入</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">圖示</label>
            <input
              value={newCategoryIcon}
              onChange={(e) => onSetNewCategoryIcon(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded text-center"
              maxLength={2}
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={onAddCategory}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              新增
            </button>
          </div>
        </div>
      </div>

      {/* 匯出與備份 */}
      <div className="card">
        <h2 className="text-lg font-bold mb-4">匯出與備份</h2>
        <div className="space-y-3 mb-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Excel 匯出路徑</label>
            <input
              value={excelOutputPath}
              onChange={(e) => setExcelOutputPath(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
              placeholder="記帳_2026-11.xlsx"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">資料庫備份路徑</label>
            <input
              value={backupOutputPath}
              onChange={(e) => setBackupOutputPath(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
              placeholder="app_backup_20261115_143000.db"
            />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button
            onClick={() => onExportExcel(false)}
            className="px-4 py-3 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            📊 匯出本月 Excel
          </button>
          <button
            onClick={() => onExportExcel(true)}
            className="px-4 py-3 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            📊 匯出全部 Excel
          </button>
          <button
            onClick={onBackup}
            className="px-4 py-3 bg-green-600 text-white rounded hover:bg-green-700"
          >
            💾 資料庫備份
          </button>
        </div>
      </div>
    </div>
  );
}
