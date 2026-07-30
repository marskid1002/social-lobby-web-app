const LOCAL_TW_MOBILE = /^09\d{8}$/;
const INTERNATIONAL_TW_MOBILE = /^8869\d{8}$/;

/**
 * 將台灣手機統一成系統內部格式 09xxxxxxxx。
 * 接受 09xxxxxxxx、8869xxxxxxxx、+8869xxxxxxxx，以及常見空白/括號/連字號。
 * 其他格式一律回空字串，避免把 88609... 或 886886... 誤當成合法手機。
 */
export function normalizeTaiwanMobile(value: unknown): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed || /[^\d+\s().-]/.test(trimmed)) return '';
  const compact = trimmed.replace(/[\s().-]/g, '');

  if (LOCAL_TW_MOBILE.test(compact)) return compact;
  const international = compact.startsWith('+') ? compact.slice(1) : compact;
  if (INTERNATIONAL_TW_MOBILE.test(international)) {
    return `0${international.slice(3)}`;
  }
  return '';
}

export function isTaiwanMobile(value: unknown): boolean {
  return normalizeTaiwanMobile(value) !== '';
}

/** MsgDogs 國際通道使用純數字 8869xxxxxxxx。 */
export function toTaiwanInternationalMobile(value: unknown): string {
  const local = normalizeTaiwanMobile(value);
  return local ? `886${local.slice(1)}` : '';
}

/** 舊版曾把國際格式直接當帳號 key；供無破壞相容查找使用。 */
export function taiwanMobileStorageAliases(value: unknown): string[] {
  const local = normalizeTaiwanMobile(value);
  return local ? [local, `886${local.slice(1)}`] : [];
}
