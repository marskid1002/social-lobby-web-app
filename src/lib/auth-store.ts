import crypto from 'crypto';

/**
 * 帳號儲存層（手機 + 密碼）。
 * - 生產：Upstash/KV Redis
 * - 本地：記憶體 fallback（dev 重啟會清空）
 */

const ACCOUNTS_KEY = 'sl:accounts:v1';

export interface Account {
  phone: string;
  salt: string;
  hash: string;
  userId: string;
  nickname: string;
  createdAt: string;
}

type AccountsMap = Record<string, Account>; // phone -> Account

function getRedis() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  const { Redis } = require('@upstash/redis');
  return new Redis({ url, token });
}

const memAccounts: AccountsMap = {};

async function readAccounts(): Promise<AccountsMap> {
  const redis = getRedis();
  if (redis) return ((await redis.get(ACCOUNTS_KEY)) as AccountsMap | null) ?? {};
  return memAccounts;
}

async function writeAccounts(data: AccountsMap) {
  const redis = getRedis();
  if (redis) {
    await redis.set(ACCOUNTS_KEY, data);
  } else {
    for (const k of Object.keys(memAccounts)) delete memAccounts[k];
    Object.assign(memAccounts, data);
  }
}

export function hashPassword(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

export function normalizePhone(phone: string): string {
  return phone.replace(/[^0-9]/g, '');
}

export async function getAccount(phone: string): Promise<Account | null> {
  const accounts = await readAccounts();
  return accounts[normalizePhone(phone)] ?? null;
}

export async function createAccount(phone: string, password: string, nickname: string): Promise<Account> {
  const accounts = await readAccounts();
  const key = normalizePhone(phone);
  const salt = crypto.randomBytes(16).toString('hex');
  const account: Account = {
    phone: key,
    salt,
    hash: hashPassword(password, salt),
    userId: `c-${key}`, // 客戶帳號 id 以手機為基礎，穩定可重登
    nickname: nickname || `用戶${key.slice(-4)}`,
    createdAt: new Date().toISOString(),
  };
  accounts[key] = account;
  await writeAccounts(accounts);
  return account;
}

export function verifyPassword(account: Account, password: string): boolean {
  const candidate = hashPassword(password, account.salt);
  // timing-safe compare
  const a = Buffer.from(candidate, 'hex');
  const b = Buffer.from(account.hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
