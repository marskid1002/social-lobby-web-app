/**
 * 維護模式（系統施工頁）
 *
 * 設計原則：這個模組只能依賴「純字串與環境變數」。
 * 不可 import Redis、資料層、React 或任何會在 edge runtime 失敗的東西——
 * 因為維護模式要在「後端整個爛掉」時仍然能正確顯示。
 */

/**
 * 程式碼層開關（走正常 git flow：改這裡 → commit → push → Vercel 自動部署）。
 * 想「不改碼」開關時，改用 Vercel 環境變數 MAINTENANCE_MODE=1（改完需 Redeploy 生效）。
 */
export const MAINTENANCE_FLAG_IN_CODE = false;

/** 兩個開關任一開啟即進入維護模式。 */
export function isMaintenanceMode(): boolean {
  const env = process.env.MAINTENANCE_MODE;
  return MAINTENANCE_FLAG_IN_CODE || env === '1' || env === 'true';
}

/**
 * 維護期間仍要放行的路徑：
 * /api/health、/api/version 是你在維護期間唯一的系統探測管道，必須保持可用。
 */
const ALWAYS_ALLOWED = ['/api/health', '/api/version'];

/** 用來換取 bypass cookie 的 query 參數名稱，例如 /?juga_key=<金鑰>。 */
export const BYPASS_QUERY_PARAM = 'juga_key';

export function isAlwaysAllowedPath(pathname: string): boolean {
  return ALWAYS_ALLOWED.includes(pathname);
}

/** bypass cookie 名稱與有效值（值刻意不等於金鑰本身，避免金鑰被寫進瀏覽器）。 */
export const BYPASS_COOKIE_NAME = 'juga_maintenance_bypass';
export const BYPASS_COOKIE_VALUE = 'ok';

/**
 * 常數時間字串比較，避免以回應時間逐字元猜測金鑰。
 * edge runtime 沒有 node:crypto 的 timingSafeEqual，這裡手寫等長 XOR 比較。
 */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * 檢查 bypass 金鑰是否正確。
 *
 * 接受 MAINTENANCE_BYPASS_KEY（建議，專用金鑰）或 ADMIN_SECRET（既有，緊急時免設定即可進站）。
 * 兩者都沒設或長度不足 8 時一律拒絕——不留空門。
 */
export function isValidBypassKey(candidate: string | null | undefined): boolean {
  if (!candidate) return false;
  const accepted = [process.env.MAINTENANCE_BYPASS_KEY, process.env.ADMIN_SECRET].filter(
    (key): key is string => typeof key === 'string' && key.length >= 8,
  );
  return accepted.some((key) => safeEqual(candidate, key));
}

/**
 * 施工畫面 HTML。
 * 全部內嵌（字型用系統堆疊、圖示用 inline SVG、動畫用 CSS）——
 * 不發出任何額外網路請求，所以不會因為靜態資源掛掉而變成白頁。
 */
export const MAINTENANCE_HTML = `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#070812">
<meta name="robots" content="noindex">
<title>系統維護中 — JUGA</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{
    min-height:100vh;min-height:100dvh;
    display:flex;align-items:center;justify-content:center;
    padding:32px 24px;
    background:#070812;
    background-image:radial-gradient(120% 80% at 50% 0%,#1b1735 0%,#070812 60%);
    color:#f4f4f8;
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans TC","PingFang TC","Microsoft JhengHei",sans-serif;
    -webkit-font-smoothing:antialiased;
  }
  .card{width:100%;max-width:380px;text-align:center}
  .brand{
    font-size:13px;font-weight:700;letter-spacing:.28em;
    color:#b9a4ff;margin-bottom:36px;
  }
  .icon-wrap{
    position:relative;width:132px;height:132px;margin:0 auto 32px;
    display:flex;align-items:center;justify-content:center;
  }
  .glow{
    position:absolute;inset:0;border-radius:50%;
    background:radial-gradient(circle,rgba(150,120,255,.32) 0%,transparent 68%);
    animation:pulse 3.2s ease-in-out infinite;
  }
  @keyframes pulse{0%,100%{transform:scale(.92);opacity:.55}50%{transform:scale(1.08);opacity:1}}
  svg{position:relative;display:block}
  .gear-lg{animation:spin 9s linear infinite;transform-origin:46px 46px}
  .gear-sm{animation:spin-rev 6s linear infinite;transform-origin:80px 80px}
  @keyframes spin{to{transform:rotate(360deg)}}
  @keyframes spin-rev{to{transform:rotate(-360deg)}}
  h1{font-size:23px;font-weight:700;letter-spacing:.02em;margin-bottom:14px}
  p{font-size:15px;line-height:1.75;color:#a9a8bd}
  p+p{margin-top:10px}
  .bar{
    margin:34px auto 0;height:4px;width:190px;border-radius:99px;
    background:rgba(255,255,255,.09);overflow:hidden;
  }
  .bar span{
    display:block;height:100%;width:40%;border-radius:99px;
    background:linear-gradient(90deg,#7c5cff,#c9a6ff);
    animation:slide 1.9s ease-in-out infinite;
  }
  @keyframes slide{
    0%{transform:translateX(-110%)}
    100%{transform:translateX(320%)}
  }
  .foot{margin-top:38px;font-size:12.5px;color:#6a6980;letter-spacing:.04em}
  @media (prefers-reduced-motion:reduce){
    .glow,.gear-lg,.gear-sm,.bar span{animation:none}
  }
</style>
</head>
<body>
  <main class="card">
    <div class="brand">JUGA</div>

    <div class="icon-wrap">
      <div class="glow"></div>
      <svg width="132" height="132" viewBox="0 0 132 132" fill="none" aria-hidden="true">
        <g class="gear-lg" stroke="#8f74ff" fill="none" stroke-linecap="butt">
          <circle cx="46" cy="46" r="16" stroke-width="5"/>
          <circle cx="46" cy="46" r="5.5" stroke="#c9a6ff" stroke-width="3.5"/>
          <g stroke-width="6.5">
            <path d="M46 30v-7M46 62v7M30 46h-7M62 46h7"/>
            <path d="M34.7 34.7l-5 -5M57.3 57.3l5 5M34.7 57.3l-5 5M57.3 34.7l5 -5"/>
          </g>
        </g>
        <g class="gear-sm" stroke="#5f4bb8" fill="none" stroke-linecap="butt">
          <circle cx="80" cy="80" r="11" stroke-width="4.5"/>
          <circle cx="80" cy="80" r="3.8" stroke="#9d84e8" stroke-width="3"/>
          <g stroke-width="5.5">
            <path d="M80 69v-5.5M80 91v5.5M69 80h-5.5M91 80h5.5"/>
            <path d="M72.2 72.2l-3.9 -3.9M87.8 87.8l3.9 3.9M72.2 87.8l-3.9 3.9M87.8 72.2l3.9 -3.9"/>
          </g>
        </g>
      </svg>
    </div>

    <h1>系統維護中</h1>
    <p>我們正在進行系統維護，暫時無法使用。</p>
    <p>維護完成後會立即恢復，謝謝你的耐心等待。</p>

    <div class="bar"><span></span></div>

    <div class="foot">JUGA · 今晚有局，因為有你</div>
  </main>
</body>
</html>`;
