/** Usernames for customers created by A000; A + digits is reserved for staff. */
export function normalizeCustomerLogin(value: string): string {
  const key = value.trim().toUpperCase();
  return /^[A-Z][A-Z0-9_-]{3,31}$/.test(key) && !/^A\d+$/.test(key) ? key : '';
}
