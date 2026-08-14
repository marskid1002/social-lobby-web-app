// 付費功能尚未開放期間的首頁小姐瀏覽上限。
// 未來開始收費時只需調整這一處，即可恢復各方案的差異。
const ONLINE_ESCORT_LIMITS: Record<string, number> = {
  guest: 3,
  free: 0,
  standard: 30,
  premium: 30,
  vip: Infinity,
};

export function onlineEscortLimitForTier(tier: string | undefined): number {
  return ONLINE_ESCORT_LIMITS[tier ?? 'free'] ?? 0;
}
