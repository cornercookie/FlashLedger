# FlashLedger DESIGN.md

## Mode
- **Operate**: Local portable desktop accounting app (Tauri v2 + React + Tailwind CSS). Scanability, efficiency, financial clarity, and robust local-first ergonomics outrank flashy marketing. Brand lives in precise financial formatting, crisp typography, and instant feedback.

## Color Palette
- **Canvas (Background)**: `bg-slate-50` (`#f8fafc`)
- **Surface (Cards/Containers)**: `bg-white` with `border border-slate-200/80` and `shadow-sm`
- **Text Primary**: `text-slate-900`
- **Text Secondary**: `text-slate-600`
- **Text Muted**: `text-slate-400`
- **Action / Primary**: Indigo / Blue (`bg-indigo-600 hover:bg-indigo-700 text-white`)
- **Income (Positive)**: Emerald (`text-emerald-600 bg-emerald-50 border-emerald-200`)
- **Expense (Negative)**: Rose (`text-rose-600 bg-rose-50 border-rose-200`)
- **Neutral Accent**: Slate

## Typography
- **Font Family**: Inter, 'Microsoft JhengHei', system-ui, sans-serif
- **Numbers**: `tabular-nums` for all financial amounts and totals to ensure clean vertical alignment.
- **Hierarchy**:
  - App title: `text-xl font-bold tracking-tight text-slate-900`
  - Section header: `text-sm font-semibold text-slate-800 uppercase tracking-wider`
  - Amounts: `font-bold tabular-nums`

## Components & Refinements
- **Cards**: `rounded-2xl p-6 bg-white border border-slate-200/80 shadow-xs transition-all hover:shadow-md`
- **Buttons**: `rounded-xl font-medium px-4 py-2.5 transition-all duration-150 active:scale-[0.98]`
- **Inputs & Selects**: `rounded-xl border border-slate-300 px-3.5 py-2.5 text-slate-900 bg-white shadow-xs focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500`
- **Tables**: Clean horizontal borders, hover states on rows (`hover:bg-slate-50/80`), padding `px-4 py-3.5`.
