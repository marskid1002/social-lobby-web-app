'use client';

// 全站最外層錯誤邊界：連 root layout 都出錯時的最後防線（必須自帶 html/body）
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="zh-Hant">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', background: '#070812', color: '#f7f7fa' }}>
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: '#f7f7fa', margin: '0 0 8px' }}>系統發生問題</h1>
          <p style={{ fontSize: 14, color: '#9295a5', margin: '0 0 20px' }}>請稍後再試，若持續發生請聯絡客服。</p>
          <button
            onClick={() => reset()}
            style={{ padding: '10px 24px', borderRadius: 14, border: 'none', background: 'linear-gradient(105deg,#ff7a3d,#ff3c91 56%,#6c2eff)', color: '#fff', fontSize: 14, fontWeight: 700 }}
          >
            重新整理
          </button>
        </div>
      </body>
    </html>
  );
}
