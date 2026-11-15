/** 畫面內狀態訊息（取代彈窗提示）。樣式見 index.css 的 .status。 */

export type FlashKind = 'success' | 'error' | 'info';

export interface Flash {
  kind: FlashKind;
  message: string;
}

export function StatusMessage({ flash }: { flash: Flash | null }) {
  if (!flash) return null;
  const cls =
    flash.kind === 'success'
      ? 'status status-success'
      : flash.kind === 'error'
        ? 'status status-error'
        : 'status';
  return (
    <div className={cls} role={flash.kind === 'error' ? 'alert' : 'status'}>
      {flash.message}
    </div>
  );
}
