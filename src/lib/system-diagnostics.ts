import { getRedis, kvKey } from './kv';
import { signSession, verifySession } from './session';
import { isSmsConfigured } from './sms';
import { listFlowTraces } from './flow-trace-store';
import { summarizeSmsRuntime } from './sms-runtime';
import { getR2Config, probeR2Bucket } from './r2-storage';
import { createECDH } from 'node:crypto';
import { getCollection } from './sync-store';
import { parseStoredImageUrl } from './image-upload';

export type Diagnostic = {
  id: string;
  label: string;
  status: 'pass' | 'error' | 'unknown';
  stage: string;
  detail: string;
  action: string;
  checkedAt: string;
  missingSettings?: string[];
  sample?: { escortId: string; url: string; pathname: string; httpStatus?: number };
};

// Never expose raw provider errors: they can contain credentials, URLs or payloads.
export function diagnosticFailure(error: unknown): string {
  const e = error as { name?: string; code?: string; cause?: { code?: string }; $metadata?: { httpStatusCode?: number }; status?: number };
  const code = e?.cause?.code || e?.code;
  const status = e?.$metadata?.httpStatusCode || e?.status;
  if (e?.name === 'TimeoutError' || e?.name === 'AbortError') return '檢查逾時；尚無法判定是網路延遲或服務未回應。';
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return 'DNS 名稱解析失敗；檢查服務網址及 DNS。';
  if (status === 401 || status === 403 || e?.name === 'AccessDenied') return '服務拒絕授權；檢查憑證、權限及目標資源設定。';
  if (status === 404 || e?.name === 'NoSuchBucket') return '指定資源不存在或服務回傳 404；檢查儲存桶與帳戶設定。';
  if (status === 429) return '服務回傳 429，請求受到限制；此結果不能單獨證明用量耗盡。';
  if (status && status >= 500) return `服務回傳 HTTP ${status}；供應商端未完成請求。`;
  return '此環節執行失敗；目前回應不足以確認根因，請比對同一時間的伺服器紀錄。';
}

export async function diagnosticCheck(id: string, label: string, stage: string, run: () => Promise<Pick<Diagnostic, 'status' | 'detail' | 'action' | 'missingSettings' | 'sample'>>): Promise<Diagnostic> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      run(),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new DOMException('timeout', 'TimeoutError')), 6000); }),
    ]);
    return { id, label, stage, ...result, checkedAt: new Date().toISOString() };
  } catch (error) {
    return { id, label, stage, status: 'error', detail: diagnosticFailure(error), action: '依上列環節檢查後重新執行；其他環節的結果不代表本項已恢復。', checkedAt: new Date().toISOString() };
  } finally { clearTimeout(timer); }
}

export async function runSystemDiagnostics(): Promise<Diagnostic[]> {
  const missing = (keys: string[]) => keys.filter((key) => !process.env[key]?.trim());
  const configError = (keys: string[]) => ({ status: 'error' as const, missingSettings: keys, detail: `缺少設定：${keys.join('、')}。`, action: '補上正式部署環境設定並重新部署；此處不顯示設定值。' });
  return Promise.all([
    diagnosticCheck('redis', 'Redis 儲存', '伺服器 → Redis PING 與唯讀指令', async () => {
      const absent = [
        !(process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL) && 'Redis REST URL',
        !(process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN) && 'Redis REST TOKEN',
      ].filter(Boolean) as string[];
      if (absent.length) return configError(absent);
      const redis = getRedis();
      if (!redis || await redis.ping() !== 'PONG') throw new Error('unexpected ping');
      await redis.exists(kvKey('sl:accounts:v2'));
      return { status: 'pass', detail: 'PING 與讀取指令成功。尚未測試寫入權限，也未檢驗所有資料內容。', action: '若仍無法儲存資料，需查該次寫入 API 與 Redis 回應。' };
    }),
    diagnosticCheck('session', '登入憑證', 'Session 設定 → 本機簽發與驗證', async () => {
      if (missing(['SESSION_SECRET']).length) return configError(['SESSION_SECRET']);
      const token = await signSession({ userId: 'diagnostic-guest', role: 'guest', tier: 'guest' });
      if ((await verifySession(token))?.userId !== 'diagnostic-guest') throw new Error('session roundtrip');
      return { status: 'pass', detail: '目前伺服器可簽發及驗證憑證；測試憑證未回傳或設定至瀏覽器。', action: 'Cookie、手機端登入與跨部署密鑰一致性仍需個別排查。' };
    }),
    diagnosticCheck('r2', 'Cloudflare R2', 'R2 設定 → 儲存桶授權連線', async () => {
      const absent = missing(['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME', 'R2_PUBLIC_BASE_URL']);
      if (absent.length) return configError(absent);
      if (!getR2Config()) return { status: 'error', detail: 'R2 設定格式未通過程式驗證。', action: '檢查帳戶 ID、儲存桶名稱、HTTPS 圖片網域格式。' };
      await probeR2Bucket();
      return { status: 'pass', detail: 'R2 儲存桶 HEAD 請求成功；尚未測試上傳、刪除與圖片公開網域。', action: '照片顯示失敗需另外查該圖片網址；儲存桶可連線不代表每張照片存在。' };
    }),
    diagnosticCheck('images', '圖片公開網址', '資料庫圖片網址 → Cloudflare 公開 HTTP 回應（抽樣）', async () => {
      if (!getR2Config()) return { status: 'unknown', detail: 'R2 設定未通過，未執行公開圖片抽樣。', action: '先處理 Cloudflare R2 設定項目。' };
      const galleries = await getCollection('photoGalleries');
      const candidate = galleries.flatMap((item) => Array.isArray(item.urls) ? item.urls.map((url) => ({ escortId: item.id, url })) : [])
        .find(({ url }) => { const parsed = parseStoredImageUrl(url); return parsed.ok && parsed.provider === 'r2'; });
      const parsed = parseStoredImageUrl(candidate?.url);
      if (!candidate || typeof candidate.url !== 'string' || !parsed.ok) return { status: 'unknown', detail: '資料庫沒有可抽樣的 R2 相簿圖片網址。', action: '上傳照片後重新檢查；不能用網域首頁代替圖片檢查。' };
      const sample: NonNullable<Diagnostic['sample']> = { escortId: candidate.escortId, url: candidate.url, pathname: parsed.pathname };
      try {
        const response = await fetch(sample.url, { method: 'HEAD', redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(4000) });
        sample.httpStatus = response.status;
        if (!response.ok) return { status: 'error', sample, detail: `抽樣圖片公開網址回傳 HTTP ${response.status}；R2 儲存桶連線與公開網址是不同環節。`, action: response.status === 404 ? '核對資料庫圖片路徑與 R2 物件是否存在。' : '檢查圖片網域、存取規則與此時間的 Cloudflare 請求紀錄。' };
        if (!response.headers.get('content-type')?.startsWith('image/')) return { status: 'error', sample, detail: '抽樣網址回應成功，但 Content-Type 不是圖片。', action: '檢查是否回傳登入頁、攔截頁或物件 MIME 類型設定錯誤。' };
        return { status: 'pass', sample, detail: '1 張 R2 相簿圖片的公開 HEAD 回應與圖片類型通過；尚未下載解碼，不代表全部相簿正常。', action: '若特定照片仍損壞，需針對該照片檢查物件與瀏覽器載入結果。' };
      } catch (error) {
        return { status: 'error', sample, detail: diagnosticFailure(error), action: '使用列出的照片網址及檢查時間，比對 Cloudflare 的請求紀錄。' };
      }
    }),
    diagnosticCheck('sms', 'SMS 簡訊', '簡訊設定 → 最近實際發送紀錄', async () => {
      const absent = missing(['MSGDOGS_MERCHANT_CODE', 'MSGDOGS_SECRET_KEY', 'MSGDOGS_OTP_TEMPLATE_REGISTER', 'MSGDOGS_OTP_TEMPLATE_RESET']);
      if (absent.length) return configError(absent);
      if (!isSmsConfigured()) return { status: 'error', detail: 'SMS_PROVIDER 未設為支援的 msgdogs。', action: '修正正式環境簡訊供應商設定。' };
      const runtime = summarizeSmsRuntime(await listFlowTraces({ limit: 1000 }));
      const recent = runtime.lastAttemptAt && Date.now() - Date.parse(runtime.lastAttemptAt) < 86400000;
      if (!recent) return { status: 'unknown', detail: '設定完整，但查得的紀錄中沒有近 24 小時發送結果。', action: '等待下一次真實驗證發送後檢查；本診斷不會發送付費簡訊。' };
      if (runtime.state === 'degraded') {
        const reasons: Record<string, string> = {
          provider_not_configured: '簡訊供應商設定未通過',
          provider_credentials_missing: '簡訊憑證缺漏',
          provider_template_missing: '該用途的驗證碼模板缺漏',
          invalid_mobile: '電話號碼格式驗證失敗',
          provider_rejected: '簡訊供應商拒絕請求',
          request_AbortError: '簡訊 HTTP 請求中止',
          request_TimeoutError: '簡訊 HTTP 請求逾時',
          request_TypeError: '簡訊 HTTP 請求發生連線或解析錯誤，根因未確認',
        };
        const reason = reasons[runtime.lastFailureCode ?? ''] || '發送結果為失敗，現有代碼無法直接判定根因';
        return { status: 'error', detail: `${reason}（${runtime.lastAttemptAt}）。`, action: '比對下方同一時間的簡訊歷程及供應商代碼；不能僅憑失敗推定額度不足。' };
      }
      return { status: 'unknown', detail: `最近一次發送紀錄成功（${runtime.lastAttemptAt}），不等於手機已收到。`, action: '若使用者未收到，需向簡訊供應商查詢送達紀錄。' };
    }),
    diagnosticCheck('push', 'Web Push', 'VAPID 公私鑰格式與配對', async () => {
      const absent = missing(['NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY']);
      if (absent.length) return configError(absent);
      const ecdh = createECDH('prime256v1');
      try {
        ecdh.setPrivateKey(Buffer.from(process.env.VAPID_PRIVATE_KEY!, 'base64url'));
        if (!ecdh.getPublicKey().equals(Buffer.from(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!, 'base64url'))) throw new Error('mismatch');
      } catch { return { status: 'error', detail: 'VAPID 公私鑰格式錯誤或不是同一組。', action: '確認部署的公鑰與私鑰配對；更換公鑰後原訂閱可能需要重新建立。' }; }
      return { status: 'unknown', detail: '公私鑰配對通過；未測試推播供應商接受、瀏覽器權限或手機接收。', action: '需用指定測試裝置實際接收後才能確認完整推播流程。' };
    }),
    diagnosticCheck('sentry', 'Sentry 錯誤追蹤', '前後端 DSN 格式', async () => {
      const absent = missing(['SENTRY_DSN', 'NEXT_PUBLIC_SENTRY_DSN']);
      if (absent.length) return configError(absent);
      try {
        for (const key of ['SENTRY_DSN', 'NEXT_PUBLIC_SENTRY_DSN']) {
          const url = new URL(process.env[key]!);
          if (url.protocol !== 'https:' || !url.username || !/^\/\d+$/.test(url.pathname)) throw new Error('dsn');
        }
      } catch { return { status: 'error', detail: '前端或後端 Sentry DSN 格式無效。', action: '從 Sentry 專案設定重新核對 DSN。' }; }
      return { status: 'unknown', detail: 'DSN 格式通過；尚未證實事件被 Sentry 收錄。', action: '需對照實際事件時間與部署版本；設定存在不代表追蹤服務正常。' };
    }),
  ]);
}
