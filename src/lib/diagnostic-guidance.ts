import type { Diagnostic } from './system-diagnostics';

const redeploy = '儲存設定後，到 Vercel 專案的 Deployments 重新部署目標環境版本；部署完成再回此頁重新診斷。';
const vercel = 'Vercel → 此網站專案 → Settings → Environment Variables；選擇與報告一致的部署環境（正式站為 Production）。';

export function diagnosticGuidance(check: Diagnostic): { steps: string[]; verification: string; helpUrl: string } {
  const verification = '重新執行診斷，確認同一環節不再失敗；若仍失敗，複製診斷報告交由維護人員比對紀錄。';
  const helpUrl = 'https://vercel.com/docs/environment-variables';
  if (check.missingSettings?.length) return {
    steps: [vercel, `補上缺少的設定名稱：${check.missingSettings.join('、')}。Redis REST URL／TOKEN 對應 UPSTASH_REDIS_REST_URL／UPSTASH_REDIS_REST_TOKEN（或 KV_REST_API_URL／KV_REST_API_TOKEN），須來自同一資料庫。`,
      '從原供應商／既有部署取得正確值。簡訊模板 ID 必須分別對應註冊與重設密碼；不確定的值請交由維護人員確認，不要填猜測值。', redeploy], verification, helpUrl,
  };
  const steps: Record<string, string[]> = {
    redis: ['到 Upstash 管理後台開啟此網站使用的 Redis 資料庫，確認資料庫可用。', vercel,
      '核對 REST URL 與 REST TOKEN 是否來自同一資料庫；勿切換到新建的空資料庫。若為 429，先查該資料庫用量及限制，不能直接當成需要升級。',
      '若為 DNS／逾時，先重新診斷並比對 Upstash 與 Vercel Logs 同一時間紀錄；只有確認設定錯誤才更正。', redeploy],
    session: [vercel, '核對 SESSION_SECRET 是否為此網站既有的正式設定；不要為了測試任意換新密鑰，否則現有登入可能失效。',
      '若簽發與驗證已通過，但只有個別手機無法登入，記下操作時間與裝置，交由維護人員查 Cookie 與登入 API。', redeploy],
    r2: ['Cloudflare → R2 物件儲存 → 開啟此網站的儲存桶；核對桶名稱與帳戶 ID。',
      '到 R2 API 權杖管理，核對網站使用的憑證仍有效、範圍包含該桶。網站上傳需 Object Read & Write；不要直接開放所有桶或管理員權限。',
      vercel, '核對 R2_ACCOUNT_ID、R2_BUCKET_NAME、R2_ACCESS_KEY_ID、R2_SECRET_ACCESS_KEY 與 R2_PUBLIC_BASE_URL。圖片網域應為 HTTPS 公開網域，不是 S3 API 網址。', redeploy],
    images: ['到 Cloudflare → R2 → 此網站的儲存桶 → 物件，依本卡「物件路徑」找到完全相同的檔案（含大小寫）。',
      ...(check.sample?.httpStatus === 404 ? ['若檔案不存在：從原始備份還原或由幹部重新上傳，再確認資料庫引用新網址；不要直接刪除小姐資料。',
        '若檔案存在：到該桶 Settings → Custom Domains，確認本卡網址的網域連到正確儲存桶，再檢查 Cloudflare 快取與規則。'] :
        ['到該桶 Settings → Custom Domains 確認圖片網域啟用且連到正確桶。若 401／403，依此時間查 Cloudflare 存取／安全規則；不要直接關閉整站防護。',
          '若 HTTP 成功但不是圖片：檢查物件 Content-Type 與網域是否回傳登入／攔截頁；交維護人員確認後才修改。']),
      '開啟本卡照片網址驗證；此結果只涵蓋抽樣照片，其他損壞照片仍需個別檢查。'],
    sms: [vercel, '確認 SMS_PROVIDER 為 msgdogs；核對 MSGDOGS_MERCHANT_CODE、MSGDOGS_SECRET_KEY，以及註冊／重設模板 ID。',
      '到簡訊供應商後台，以失敗時間與下方發送歷程代碼查詢：模板審核、憑證、餘額與供應商拒絕原因；先確認原因再處理。',
      '如果發送成功但手機沒收到，請供應商提供送達結果；不需要一直重發驗證碼。設定有修改才重新部署。'],
    push: [vercel, '核對 NEXT_PUBLIC_VAPID_PUBLIC_KEY 與 VAPID_PRIVATE_KEY 是原本同一組。格式／配對錯誤應交維護人員修正，不要單獨換一把。',
      '在測試手機確認網站通知權限允許，再用測試通知實際接收；記下裝置與時間。若更換公鑰，需由維護人員處理舊訂閱更新。', redeploy],
    sentry: ['到 Sentry 對應專案設定取得 DSN。', vercel,
      '核對 SENTRY_DSN 與 NEXT_PUBLIC_SENTRY_DSN 是否填入正確 DSN，而非 Auth Token；設定有修改才重新部署。',
      '到 Sentry 的 Issues 依時間、環境及部署版本找實際事件；找不到時將報告交維護人員檢查 SDK、封鎖及上報紀錄。'],
  };
  return { steps: steps[check.id] ?? ['複製本次報告，交維護人員查同一時間的伺服器紀錄；根因確認前不要改動設定。'], verification,
    helpUrl: check.id === 'r2' ? 'https://developers.cloudflare.com/r2/api/tokens/' : check.id === 'images' ? 'https://developers.cloudflare.com/r2/buckets/public-buckets/' : helpUrl };
}

export function formatDiagnosticReport(input: { checks: Diagnostic[]; version: string; environment: string; error?: string }): string {
  return [
    'JUGA 系統診斷報告', `版本：${input.version}`, `資料環境：${input.environment}`,
    '本報告為檢查快照；圖片僅抽樣。包含照片網址，請僅交給信任的維護人員。',
    ...(input.error ? [`診斷請求錯誤：${input.error}`] : []),
    ...input.checks.map((check) => [
      `\n[${check.status}] ${check.label}`, `時間：${check.checkedAt}`, `環節：${check.stage}`, `結果：${check.detail}`,
      ...(check.sample ? [`小姐 ID：${check.sample.escortId}`, `照片：${check.sample.url}`, `物件路徑：${check.sample.pathname}`, `HTTP：${check.sample.httpStatus ?? '未取得回應'}`] : []),
      `處理建議：${check.action}`, ...diagnosticGuidance(check).steps.map((step, index) => `${index + 1}. ${step}`),
    ].join('\n')),
  ].join('\n');
}
