/**
 * 金流 / 訂閱介面（預留接點）。
 *
 * 目前尚未接任何金流；未來做「訂閱制」時，在此處串接第三方金流
 * （例如 LINE Pay / 綠界 ECPay / TapPay / Stripe）。所有付款相關的
 * 商業邏輯都應集中在這裡，其他程式只呼叫這些介面，不直接碰金流 SDK。
 *
 * 設計原則（上線前務必補齊）：
 *  - 伺服器端錢包/訂閱狀態為權威（存 DB），前端只顯示
 *  - 建立訂單 / 建立訂閱 → 導向金流頁 → 金流 webhook 回調確認 → 更新訂閱狀態
 *  - 對帳、退款、發票、鑑賞期、定型化契約另行處理
 */

export type SubscriptionPlan = 'free' | 'basic' | 'pro' | 'vip';

export type SubscriptionStatus = 'none' | 'active' | 'past_due' | 'canceled';

export interface Subscription {
  userId: string;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  currentPeriodEnd?: string; // ISO
  provider?: 'line_pay' | 'ecpay' | 'tappay' | 'stripe';
  providerRef?: string;      // 金流端訂閱/交易識別
}

/**
 * 建立訂閱結帳（未來實作）：呼叫金流建立訂閱，回傳導向付款的 URL。
 * 現階段未接金流 → 回傳 { enabled:false }。
 */
export async function createSubscriptionCheckout(
  _userId: string,
  _plan: SubscriptionPlan,
): Promise<{ enabled: false } | { enabled: true; redirectUrl: string }> {
  // TODO(billing): 串接金流建立訂閱、回傳付款頁 URL
  return { enabled: false };
}

/**
 * 金流 webhook 事件處理（未來實作）：驗簽 → 更新伺服器訂閱狀態。
 * 現階段為 no-op。
 */
export async function handleBillingWebhook(_payload: unknown): Promise<{ ok: boolean }> {
  // TODO(billing): 驗證來源簽章、依事件更新 Subscription 狀態、記錄流水與發票
  return { ok: true };
}

/** 取得使用者訂閱狀態（未來從 DB 讀）。現階段一律回 none。 */
export async function getSubscription(userId: string): Promise<Subscription> {
  // TODO(billing): 從資料庫讀取權威訂閱狀態
  return { userId, plan: 'free', status: 'none' };
}

/** 金流功能總開關：未設定任何 provider 前一律停用。 */
export function isBillingEnabled(): boolean {
  return Boolean(process.env.BILLING_PROVIDER);
}
