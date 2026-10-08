export const PW_MAX = 128;

export function passwordRuleError(pw: string): string | null {
  if (pw.length < 6 || pw.length > PW_MAX) return `密碼需 6~${PW_MAX} 碼`;
  if (!/[a-z]/.test(pw)) return '密碼需包含小寫英文字母';
  if (!/[A-Z]/.test(pw)) return '密碼需包含大寫英文字母';
  if (!/[0-9]/.test(pw)) return '密碼需包含數字';
  if (!/[^A-Za-z0-9]/.test(pw)) return '密碼需包含符號';
  return null;
}
