type RequestDisplayInput = {
  status?: unknown;
  expiresAt?: unknown;
};

export type RequestDisplayState =
  | { active: true }
  | { active: false; label: '已過期' | '已結束' };

/** 客戶首頁的顯示狀態；資料因聊天室保留，不代表局仍在找人。 */
export function requestDisplayState(
  request: RequestDisplayInput,
  now: number = Date.now(),
): RequestDisplayState {
  if (request.status !== 'open') return { active: false, label: '已結束' };
  const expiresAt = typeof request.expiresAt === 'string'
    ? Date.parse(request.expiresAt)
    : Number.NaN;
  if (!Number.isFinite(expiresAt) || expiresAt <= now) {
    return { active: false, label: '已過期' };
  }
  return { active: true };
}
