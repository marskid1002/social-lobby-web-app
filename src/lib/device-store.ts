import crypto from 'crypto';
import { getRedis, kvKey } from './kv';

const DEVICES_KEY = kvKey('sl:account-devices:h:v1');
export const DEVICE_COOKIE = 'sl_device';

export interface AccountDevice {
  id: string;
  userId: string;
  userAgent: string;
  createdAt: string;
  lastSeenAt: string;
  sessionVersion: number;
}

export interface DeviceSummary {
  userId: string;
  count: number;
  lastSeenAt?: string;
  userAgents: string[];
}

const memoryDevices = new Map<string, AccountDevice>();

function cookieValue(req: Request): string | undefined {
  const cookie = req.headers.get('cookie') ?? '';
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${DEVICE_COOKIE}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}

export function deviceCookieHeader(deviceId: string): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${DEVICE_COOKIE}=${encodeURIComponent(deviceId)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 365}${secure}`;
}

export async function recordDeviceSession(
  req: Request,
  userId: string,
  sessionVersion: number,
): Promise<AccountDevice> {
  const existingId = cookieValue(req);
  const id = existingId && /^dev-[a-f0-9-]{36}$/.test(existingId)
    ? existingId
    : `dev-${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  const redis = getRedis();
  const existing = redis
    ? await redis.hget(DEVICES_KEY, `${userId}:${id}`) as AccountDevice | null
    : memoryDevices.get(`${userId}:${id}`);
  const device: AccountDevice = {
    id,
    userId,
    userAgent: (req.headers.get('user-agent') ?? 'unknown').slice(0, 300),
    createdAt: existing?.createdAt ?? now,
    lastSeenAt: now,
    sessionVersion,
  };
  if (redis) await redis.hset(DEVICES_KEY, { [`${userId}:${id}`]: device });
  else memoryDevices.set(`${userId}:${id}`, device);
  return device;
}

export async function listDeviceSummaries(): Promise<DeviceSummary[]> {
  const redis = getRedis();
  const devices = redis
    ? Object.values(
        (await redis.hgetall(DEVICES_KEY) as Record<string, AccountDevice> | null) ?? {},
      )
    : [...memoryDevices.values()];
  const grouped = new Map<string, AccountDevice[]>();
  for (const device of devices) {
    const list = grouped.get(device.userId) ?? [];
    list.push(device);
    grouped.set(device.userId, list);
  }
  return [...grouped.entries()].map(([userId, records]) => ({
    userId,
    count: records.length,
    lastSeenAt: records.map((item) => item.lastSeenAt).sort().at(-1),
    userAgents: [...new Set(records.map((item) => item.userAgent))].slice(0, 5),
  }));
}

export async function removeDevicesForUser(userId: string): Promise<number> {
  const redis = getRedis();
  if (redis) {
    const records = (await redis.hgetall(DEVICES_KEY) as Record<string, AccountDevice> | null) ?? {};
    const fields = Object.keys(records).filter((field) => records[field].userId === userId);
    if (fields.length > 0) await redis.hdel(DEVICES_KEY, ...fields);
    return fields.length;
  }
  let count = 0;
  for (const [key, device] of memoryDevices) {
    if (device.userId !== userId) continue;
    memoryDevices.delete(key);
    count++;
  }
  return count;
}
