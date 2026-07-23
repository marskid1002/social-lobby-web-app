import crypto from 'crypto';
import { getRedis, kvKey } from './kv';

/**
 * 帳號儲存層（帳號 + 密碼）。
 * - 客戶：帳號 = 手機號碼；註冊時設密碼；userId 為不可反推的隨機值
 * - 幹部：帳號 = A001~A010（預先建立、無密碼）；首次登入時設定密碼並寫死；改密碼需管理員重設
 * - 生產：Upstash/KV Redis；本地：記憶體 fallback
 */

const ACCOUNTS_KEY = kvKey('sl:accounts:v2');

export type AccountRole = 'user' | 'manager' | 'admin';

export interface Account {
  key: string;              // 登入帳號：手機（客戶）、A001（幹部）或 A000（管理員）
  role: AccountRole;
  tier: string;
  userId: string;           // 對應 app 內 user id
  nickname: string;
  salt: string;
  hash: string | null;      // null = 尚未設定密碼（幹部/管理員首次登入前）
  createdAt: string;
  disabled?: boolean;       // true = 已停用（登入被擋）
}

type AccountsMap = Record<string, Account>; // key -> Account

// 最高權限管理員帳號（後台 /admin 用）；首次登入需 ADMIN_SECRET 啟用
const ADMIN_ACCOUNT = { code: 'A000', userId: 'u-016', nickname: '管理員' };

// 幹部帳號 A001~A010 對應到現有 10 個幹部 user
const MANAGER_MAP: { code: string; userId: string; nickname: string }[] = [
  { code: 'A001', userId: 'u-018', nickname: '陳幹部' },
  { code: 'A002', userId: 'u-023', nickname: '林經理' },
  { code: 'A003', userId: 'u-024', nickname: '張經理' },
  { code: 'A004', userId: 'u-025', nickname: '黃經理' },
  { code: 'A005', userId: 'u-026', nickname: '劉經理' },
  { code: 'A006', userId: 'u-027', nickname: '吳經理' },
  { code: 'A007', userId: 'u-028', nickname: '蔡經理' },
  { code: 'A008', userId: 'u-029', nickname: '鄭經理' },
  { code: 'A009', userId: 'u-030', nickname: '謝經理' },
  { code: 'A010', userId: 'u-031', nickname: '許經理' },
];

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
    // 本地 fallback：readAccounts 會直接回傳 memAccounts 參考，呼叫端常以
    // read→改→write 同一物件回寫，故 data 可能就是 memAccounts 本身。
    // 先淺拷貝快照再清空，避免「清空 memAccounts 時連 data 一起被清空」的別名問題。
    const snapshot = { ...data };
    for (const k of Object.keys(memAccounts)) delete memAccounts[k];
    Object.assign(memAccounts, snapshot);
  }
}

export function hashPassword(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

export function normalizePhone(phone: string): string {
  return phone.replace(/[^0-9]/g, '');
}

export function normalizeKey(key: string): string {
  const k = (key ?? '').trim();
  return /^A\d{3}$/i.test(k) ? k.toUpperCase() : normalizePhone(k);
}

// 確保管理員(A000)與 10 個幹部帳號存在（無密碼），首次呼叫時建立
async function ensureManagerAccounts(accounts: AccountsMap): Promise<boolean> {
  let changed = false;
  if (!accounts[ADMIN_ACCOUNT.code]) {
    accounts[ADMIN_ACCOUNT.code] = {
      key: ADMIN_ACCOUNT.code, role: 'admin', tier: 'admin', userId: ADMIN_ACCOUNT.userId,
      nickname: ADMIN_ACCOUNT.nickname, salt: '', hash: null, createdAt: new Date().toISOString(),
    };
    changed = true;
  }
  for (const m of MANAGER_MAP) {
    if (!accounts[m.code]) {
      accounts[m.code] = {
        key: m.code, role: 'manager', tier: 'vip', userId: m.userId,
        nickname: m.nickname, salt: '', hash: null, createdAt: new Date().toISOString(),
      };
      changed = true;
    }
  }
  return changed;
}

export async function getAccount(key: string): Promise<Account | null> {
  const accounts = await readAccounts();
  if (await ensureManagerAccounts(accounts)) await writeAccounts(accounts);
  return accounts[normalizeKey(key)] ?? null;
}

// 客戶註冊（手機 + 暱稱 + 密碼），userId 為隨機不可反推值
export async function createCustomer(phone: string, password: string, nickname: string): Promise<Account> {
  const accounts = await readAccounts();
  await ensureManagerAccounts(accounts);
  const key = normalizePhone(phone);
  const salt = crypto.randomBytes(16).toString('hex');
  const account: Account = {
    key, role: 'user', tier: 'standard',
    userId: `c-${crypto.randomUUID()}`,
    nickname: nickname || `用戶${key.slice(-4)}`,
    salt, hash: hashPassword(password, salt),
    createdAt: new Date().toISOString(),
  };
  accounts[key] = account;
  await writeAccounts(accounts);
  return account;
}

// 幹部首次登入設定密碼（僅在 hash 尚未設定時）
export async function setInitialPassword(key: string, password: string): Promise<Account | null> {
  const accounts = await readAccounts();
  await ensureManagerAccounts(accounts);
  const acc = accounts[normalizeKey(key)];
  if (!acc || acc.hash) return null; // 不存在或已設過密碼
  acc.salt = crypto.randomBytes(16).toString('hex');
  acc.hash = hashPassword(password, acc.salt);
  await writeAccounts(accounts);
  return acc;
}

// 管理員重設密碼（清空，讓該帳號下次登入重新設定）——用於幹部/管理員（有啟用碼重設流程）
export async function adminResetPassword(key: string): Promise<boolean> {
  const accounts = await readAccounts();
  const acc = accounts[normalizeKey(key)];
  if (!acc) return false;
  acc.hash = null;
  acc.salt = '';
  await writeAccounts(accounts);
  return true;
}

// 管理員為客戶重設成一組「臨時新密碼」並回傳（客戶沒有啟用碼重設流程，若清成 null 會被鎖死；
// 故直接設一組可用的新密碼，由管理員轉告客戶登入）。
export async function adminResetCustomerPassword(key: string): Promise<string | null> {
  const accounts = await readAccounts();
  const acc = accounts[normalizeKey(key)];
  if (!acc) return null;
  // 8 碼英數臨時密碼，避開易混淆字元（0/o/1/l/i）
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(8);
  let pw = '';
  for (let i = 0; i < 8; i++) pw += chars[bytes[i] % chars.length];
  acc.salt = crypto.randomBytes(16).toString('hex');
  acc.hash = hashPassword(pw, acc.salt);
  await writeAccounts(accounts);
  return pw;
}

// 客戶用簡訊驗證碼重設密碼（僅限客戶帳號；幹部/管理員請走啟用碼重設）。
export async function setCustomerPassword(key: string, password: string): Promise<boolean> {
  const accounts = await readAccounts();
  const acc = accounts[normalizeKey(key)];
  if (!acc || acc.role !== 'user') return false;
  acc.salt = crypto.randomBytes(16).toString('hex');
  acc.hash = hashPassword(password, acc.salt);
  await writeAccounts(accounts);
  return true;
}

export function verifyPassword(account: Account, password: string): boolean {
  if (!account.hash) return false;
  const candidate = hashPassword(password, account.salt);
  const a = Buffer.from(candidate, 'hex');
  const b = Buffer.from(account.hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ── 管理後台用 ──────────────────────────────────────────────────────────────

// 列出所有帳號（含 A000/幹部/客戶）；呼叫端負責去除敏感欄位再回前端
export async function listAccounts(): Promise<Account[]> {
  const accounts = await readAccounts();
  if (await ensureManagerAccounts(accounts)) await writeAccounts(accounts);
  return Object.values(accounts);
}

// 停用/啟用帳號（admin 帳號不可停用）
export async function setAccountDisabled(key: string, disabled: boolean): Promise<boolean> {
  const accounts = await readAccounts();
  const acc = accounts[normalizeKey(key)];
  if (!acc || acc.role === 'admin') return false;
  acc.disabled = disabled;
  await writeAccounts(accounts);
  return true;
}

// 真刪除帳號（僅限客戶；幹部/管理員請用停用/重設）。回傳被刪的帳號供級聯清資料。
export async function deleteAccount(key: string): Promise<Account | null> {
  const accounts = await readAccounts();
  const k = normalizeKey(key);
  const acc = accounts[k];
  if (!acc || acc.role !== 'user') return null;
  delete accounts[k];
  await writeAccounts(accounts);
  return acc;
}
