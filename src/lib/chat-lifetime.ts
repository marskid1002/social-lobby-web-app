export const CHAT_LIFETIME_MS = 48 * 60 * 60 * 1000;

export function chatExpiresAtFrom(now: number): string {
  return new Date(now + CHAT_LIFETIME_MS).toISOString();
}
