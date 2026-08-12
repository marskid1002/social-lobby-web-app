import { getRedis, kvKey } from './kv';

export const REQUEST_REMINDER_COOLDOWN_SECONDS = 5 * 60;

const memoryCooldowns = new Map<string, number>();

function reminderKey(requestId: string): string {
  return kvKey(`sl:request-reminder:${requestId}`);
}

export async function getReminderNextAt(requestId: string): Promise<number> {
  const redis = getRedis();
  if (redis) {
    const ttl = Number(await redis.ttl(reminderKey(requestId)));
    return ttl > 0 ? Date.now() + ttl * 1000 : 0;
  }

  const nextAt = memoryCooldowns.get(requestId) ?? 0;
  if (nextAt <= Date.now()) {
    memoryCooldowns.delete(requestId);
    return 0;
  }
  return nextAt;
}

export async function claimReminderCooldown(
  requestId: string,
): Promise<{ ok: true; nextAt: number } | { ok: false; nextAt: number }> {
  const redis = getRedis();
  if (redis) {
    const claimed = await redis.set(
      reminderKey(requestId),
      Date.now(),
      { nx: true, ex: REQUEST_REMINDER_COOLDOWN_SECONDS },
    );
    if (claimed === 'OK') {
      return { ok: true, nextAt: Date.now() + REQUEST_REMINDER_COOLDOWN_SECONDS * 1000 };
    }
    return { ok: false, nextAt: await getReminderNextAt(requestId) };
  }

  const existing = await getReminderNextAt(requestId);
  if (existing > Date.now()) return { ok: false, nextAt: existing };
  const nextAt = Date.now() + REQUEST_REMINDER_COOLDOWN_SECONDS * 1000;
  memoryCooldowns.set(requestId, nextAt);
  return { ok: true, nextAt };
}
