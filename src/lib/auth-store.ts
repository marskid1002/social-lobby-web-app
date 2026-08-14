import crypto from 'crypto';
import { getRedis, kvKey } from './kv';
import { normalizeTaiwanMobile, taiwanMobileStorageAliases } from './phone';
import { removeDevicesForUser } from './device-store';
import { removeSubscriptionsForUser } from './push-store';

/**
 * 帳號儲存層（帳號 + 密碼）。
 * - 客戶：帳號 = 手機號碼；註冊時設密碼；userId 為不可反推的隨機值
 * - 幹部：帳號 = A001~A010（預先建立、無密碼）；首次登入時設定密碼並寫死；改密碼需管理員重設
 * - 生產：Upstash/KV Redis；本地：記憶體 fallback
 */

const ACCOUNTS_KEY = kvKey('sl:accounts:v2');

export type AccountRole = 'user' | 'manager' | 'account_admin' | 'account_viewer' | 'admin';

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
  archived?: boolean;       // true = 已封存（不可登入，保留歷史關聯）
  activationSalt?: string;  // 幹部一次性啟用碼 salt（不保存明文）
  activationHash?: string;  // 幹部一次性啟用碼雜湊
  activationCreatedAt?: string;
  sessionVersion?: number;
  termsVersion?: string;    // 客戶註冊時同意的平台規範版本
  termsAcceptedAt?: string; // 由 server 產生的同意時間
  ageConfirmedAt?: string;  // 由 server 產生的年滿 18 歲確認時間
  mustChangeNickname?: boolean; // 預設名稱的幹部首次登入後必須自行改名
  securityVersion?: number;     // 特殊帳號的一次性安全遷移版本
}

type AccountsMap = Record<string, Account>; // key -> Account

export interface RegistrationConsentRecord {
  termsVersion: string;
  acceptedAt: string;
}

// 最高權限管理員帳號（後台 /admin 用）；首次登入需 ADMIN_SECRET 啟用
const ADMIN_ACCOUNT = { code: 'A000', userId: 'u-016', nickname: '管理員' };
const ACCOUNT_ADMIN_ACCOUNT = { code: 'A888', userId: 'account-admin-888', nickname: '幹部帳號管理員' };
const ACCOUNT_VIEWER_ACCOUNT = {
  code: 'A777',
  userId: 'account-viewer-777',
  nickname: '幹部稽查員',
};

// 幹部帳號 A001~A010 對應到現有 10 個幹部 user
const MANAGER_MAP: { code: string; userId: string; nickname: string; mustChangeNickname?: boolean }[] = [
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
  // 測試用幹部帳號（A011~A020）；對應 mock/users.ts 的 u-501~u-510（role: manager）
  { code: 'A011', userId: 'u-501', nickname: '測試幹部1' },
  { code: 'A012', userId: 'u-502', nickname: '測試幹部2' },
  { code: 'A013', userId: 'u-503', nickname: '測試幹部3' },
  { code: 'A014', userId: 'u-504', nickname: '測試幹部4' },
  { code: 'A015', userId: 'u-505', nickname: '測試幹部5' },
  { code: 'A016', userId: 'u-506', nickname: '測試幹部6' },
  { code: 'A017', userId: 'u-507', nickname: '測試幹部7' },
  { code: 'A018', userId: 'u-508', nickname: '測試幹部8' },
  { code: 'A019', userId: 'u-509', nickname: '測試幹部9' },
  { code: 'A020', userId: 'u-510', nickname: '測試幹部10' },
  // 正式預留幹部帳號：首次登入後必須自行設定顯示名稱。
  { code: 'A021', userId: 'manager-021', nickname: '幹部21', mustChangeNickname: true },
  { code: 'A022', userId: 'manager-022', nickname: '幹部22', mustChangeNickname: true },
  { code: 'A023', userId: 'manager-023', nickname: '幹部23', mustChangeNickname: true },
  { code: 'A024', userId: 'manager-024', nickname: '幹部24', mustChangeNickname: true },
  { code: 'A025', userId: 'manager-025', nickname: '幹部25', mustChangeNickname: true },
  // 額外測試幹部；A1000 為 4 位數，見 normalizeKey 放寬。
  { code: 'A999', userId: 'u-511', nickname: '測試幹部11' },
  { code: 'A1000', userId: 'u-512', nickname: '測試幹部12' },
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
  return normalizeTaiwanMobile(phone);
}

export function normalizeKey(key: string): string {
  const k = (key ?? '').trim();
  // 幹部/管理員帳號＝A + 3~4 位數字（A000~A020 為既有；A999/A1000 為額外測試帳號）；其餘視為手機
  return /^A\d{3,4}$/i.test(k) ? k.toUpperCase() : normalizePhone(k);
}

function findAccountEntry(
  accounts: AccountsMap,
  rawKey: string,
): { storageKey: string; account: Account } | null {
  const normalized = normalizeKey(rawKey);
  if (!normalized) return null;
  const exact = accounts[normalized];
  if (exact) return { storageKey: normalized, account: exact };
  if (/^A\d{3,4}$/.test(normalized)) return null;

  // 舊版可能以 8869xxxxxxxx 保存。現在不搬動或覆寫既有資料，只在查找時相容。
  for (const alias of taiwanMobileStorageAliases(normalized)) {
    const account = accounts[alias];
    if (account) return { storageKey: alias, account };
  }
  return null;
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
  if (!accounts[ACCOUNT_ADMIN_ACCOUNT.code]) {
    accounts[ACCOUNT_ADMIN_ACCOUNT.code] = {
      key: ACCOUNT_ADMIN_ACCOUNT.code,
      role: 'account_admin',
      tier: 'admin',
      userId: ACCOUNT_ADMIN_ACCOUNT.userId,
      nickname: ACCOUNT_ADMIN_ACCOUNT.nickname,
      salt: '',
      hash: null,
      createdAt: new Date().toISOString(),
      sessionVersion: 1,
    };
    changed = true;
  }
  if (!accounts[ACCOUNT_VIEWER_ACCOUNT.code]) {
    accounts[ACCOUNT_VIEWER_ACCOUNT.code] = {
      key: ACCOUNT_VIEWER_ACCOUNT.code,
      role: 'account_viewer',
      tier: 'admin',
      userId: ACCOUNT_VIEWER_ACCOUNT.userId,
      nickname: ACCOUNT_VIEWER_ACCOUNT.nickname,
      salt: '',
      hash: null,
      createdAt: new Date().toISOString(),
      sessionVersion: 1,
      securityVersion: 1,
    };
    changed = true;
  } else if ((accounts[ACCOUNT_VIEWER_ACCOUNT.code].securityVersion ?? 0) < 1) {
    // 舊版 A777 曾內建預設密碼。部署後只遷移一次：清除密碼並撤銷全部舊 JWT。
    const viewer = accounts[ACCOUNT_VIEWER_ACCOUNT.code];
    viewer.role = 'account_viewer';
    viewer.nickname = ACCOUNT_VIEWER_ACCOUNT.nickname;
    viewer.hash = null;
    viewer.salt = '';
    delete viewer.activationSalt;
    delete viewer.activationHash;
    delete viewer.activationCreatedAt;
    viewer.sessionVersion = (viewer.sessionVersion ?? 0) + 1;
    viewer.securityVersion = 1;
    await Promise.all([
      removeDevicesForUser(viewer.userId),
      removeSubscriptionsForUser(viewer.userId),
    ]);
    changed = true;
  }
  for (const m of MANAGER_MAP) {
    if (!accounts[m.code]) {
      accounts[m.code] = {
        key: m.code, role: 'manager', tier: 'vip', userId: m.userId,
        nickname: m.nickname, salt: '', hash: null, createdAt: new Date().toISOString(),
        mustChangeNickname: Boolean(m.mustChangeNickname),
      };
      changed = true;
    } else if (
      m.mustChangeNickname
      && accounts[m.code].role === 'manager'
      && accounts[m.code].nickname === m.nickname
      && accounts[m.code].mustChangeNickname !== true
    ) {
      // 已存在的同名預留帳號也補上首次改名旗標；若管理員已改過名稱則不覆蓋。
      accounts[m.code].mustChangeNickname = true;
      changed = true;
    }
  }
  return changed;
}

export async function getAccount(key: string): Promise<Account | null> {
  const accounts = await readAccounts();
  if (await ensureManagerAccounts(accounts)) await writeAccounts(accounts);
  return findAccountEntry(accounts, key)?.account ?? null;
}

// 以 app 內 userId（非登入 key）反查帳號；供 API 驗證「此 session 對應的帳號是否已被停用」。
export async function getAccountByUserId(userId: string): Promise<Account | null> {
  const accounts = await readAccounts();
  if (await ensureManagerAccounts(accounts)) await writeAccounts(accounts);
  for (const acc of Object.values(accounts)) if (acc.userId === userId) return acc;
  return null;
}

// 客戶註冊（手機 + 暱稱 + 密碼），userId 為隨機不可反推值
export async function createCustomer(
  phone: string,
  password: string,
  nickname: string,
  consent?: RegistrationConsentRecord,
): Promise<Account> {
  const accounts = await readAccounts();
  await ensureManagerAccounts(accounts);
  const key = normalizePhone(phone);
  if (!key) throw new Error('invalid Taiwan mobile');
  if (findAccountEntry(accounts, key)) throw new Error('account already exists');
  const salt = crypto.randomBytes(16).toString('hex');
  const account: Account = {
    key, role: 'user', tier: 'standard',
    userId: `c-${crypto.randomUUID()}`,
    nickname: nickname || `用戶${key.slice(-4)}`,
    salt, hash: hashPassword(password, salt),
    createdAt: new Date().toISOString(),
    ...(consent ? {
      termsVersion: consent.termsVersion,
      termsAcceptedAt: consent.acceptedAt,
      ageConfirmedAt: consent.acceptedAt,
    } : {}),
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

// A777 第一次登入時自行設定密碼；只能在尚未設定密碼時成功一次。
export async function setInitialAccountViewerPassword(key: string, password: string): Promise<Account | null> {
  const accounts = await readAccounts();
  await ensureManagerAccounts(accounts);
  const account = accounts[normalizeKey(key)];
  if (
    !account
    || account.role !== 'account_viewer'
    || account.hash
    || account.disabled
    || account.archived
  ) return null;
  account.salt = crypto.randomBytes(16).toString('hex');
  account.hash = hashPassword(password, account.salt);
  delete account.activationSalt;
  delete account.activationHash;
  delete account.activationCreatedAt;
  await writeAccounts(accounts);
  return account;
}

const ACTIVATION_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';

function createActivationSecret(): { code: string; salt: string; hash: string } {
  const bytes = crypto.randomBytes(12);
  let code = '';
  for (let index = 0; index < bytes.length; index++) {
    code += ACTIVATION_CHARS[bytes[index] % ACTIVATION_CHARS.length];
  }
  const salt = crypto.randomBytes(16).toString('hex');
  return { code, salt, hash: hashPassword(code, salt) };
}

export async function createManagerAccount(nickname: string): Promise<{
  account: Account;
  activationCode: string;
}> {
  const accounts = await readAccounts();
  await ensureManagerAccounts(accounts);
  let key = '';
  for (let number = 1; number <= 9999; number++) {
    const candidate = `A${String(number).padStart(3, '0')}`;
    if (!accounts[candidate]) {
      key = candidate;
      break;
    }
  }
  if (!key) throw new Error('manager account capacity reached');
  const secret = createActivationSecret();
  const now = new Date().toISOString();
  const account: Account = {
    key,
    role: 'manager',
    tier: 'vip',
    userId: `m-${crypto.randomUUID()}`,
    nickname: nickname.trim().slice(0, 60) || '新幹部',
    salt: '',
    hash: null,
    activationSalt: secret.salt,
    activationHash: secret.hash,
    activationCreatedAt: now,
    sessionVersion: 1,
    createdAt: now,
  };
  accounts[key] = account;
  await writeAccounts(accounts);
  return { account, activationCode: secret.code };
}

export async function regenerateManagerActivation(key: string): Promise<string | null> {
  const accounts = await readAccounts();
  const account = accounts[normalizeKey(key)];
  if (!account || account.role !== 'manager' || account.archived) return null;
  const secret = createActivationSecret();
  account.hash = null;
  account.salt = '';
  account.activationSalt = secret.salt;
  account.activationHash = secret.hash;
  account.activationCreatedAt = new Date().toISOString();
  account.sessionVersion = (account.sessionVersion ?? 0) + 1;
  await writeAccounts(accounts);
  return secret.code;
}

export async function activateManagerWithCode(
  key: string,
  activationCode: string,
  password: string,
): Promise<Account | null> {
  const accounts = await readAccounts();
  const account = accounts[normalizeKey(key)];
  if (
    !account
    || account.role !== 'manager'
    || account.hash
    || account.disabled
    || account.archived
    || !account.activationHash
    || !account.activationSalt
  ) return null;
  const candidate = hashPassword(activationCode, account.activationSalt);
  const expected = Buffer.from(account.activationHash, 'hex');
  const actual = Buffer.from(candidate, 'hex');
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) return null;
  account.salt = crypto.randomBytes(16).toString('hex');
  account.hash = hashPassword(password, account.salt);
  delete account.activationSalt;
  delete account.activationHash;
  delete account.activationCreatedAt;
  await writeAccounts(accounts);
  return account;
}

export async function regenerateAccountAdminActivation(key: string): Promise<string | null> {
  const accounts = await readAccounts();
  await ensureManagerAccounts(accounts);
  const account = accounts[normalizeKey(key)];
  if (!account || account.role !== 'account_admin' || account.archived) return null;
  const secret = createActivationSecret();
  account.hash = null;
  account.salt = '';
  account.activationSalt = secret.salt;
  account.activationHash = secret.hash;
  account.activationCreatedAt = new Date().toISOString();
  account.sessionVersion = (account.sessionVersion ?? 0) + 1;
  await writeAccounts(accounts);
  return secret.code;
}

export async function activateAccountAdminWithCode(
  key: string,
  activationCode: string,
  password: string,
): Promise<Account | null> {
  const accounts = await readAccounts();
  await ensureManagerAccounts(accounts);
  const account = accounts[normalizeKey(key)];
  if (
    !account
    || account.role !== 'account_admin'
    || account.hash
    || account.disabled
    || account.archived
    || !account.activationHash
    || !account.activationSalt
  ) return null;
  const candidate = hashPassword(activationCode, account.activationSalt);
  const expected = Buffer.from(account.activationHash, 'hex');
  const actual = Buffer.from(candidate, 'hex');
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) return null;
  account.salt = crypto.randomBytes(16).toString('hex');
  account.hash = hashPassword(password, account.salt);
  delete account.activationSalt;
  delete account.activationHash;
  delete account.activationCreatedAt;
  await writeAccounts(accounts);
  return account;
}

export async function updateManagerNickname(key: string, nickname: string): Promise<Account | null> {
  const accounts = await readAccounts();
  const account = accounts[normalizeKey(key)];
  const safeNickname = nickname.trim().slice(0, 60);
  if (!account || account.role !== 'manager' || !safeNickname) return null;
  account.nickname = safeNickname;
  await writeAccounts(accounts);
  return account;
}

export async function updateOwnManagerNickname(userId: string, nickname: string): Promise<Account | null> {
  const accounts = await readAccounts();
  const safeNickname = nickname.trim().slice(0, 60);
  const account = Object.values(accounts).find((item) => item.userId === userId);
  if (!account || account.role !== 'manager' || safeNickname.length < 2) return null;
  account.nickname = safeNickname;
  account.mustChangeNickname = false;
  await writeAccounts(accounts);
  return account;
}

export async function setManagerArchived(key: string, archived: boolean): Promise<boolean> {
  const accounts = await readAccounts();
  const account = accounts[normalizeKey(key)];
  if (!account || account.role !== 'manager') return false;
  account.archived = archived;
  if (archived) account.disabled = true;
  account.sessionVersion = (account.sessionVersion ?? 0) + 1;
  await writeAccounts(accounts);
  return true;
}

export async function bumpAccountSessionVersion(key: string): Promise<Account | null> {
  const accounts = await readAccounts();
  const account = accounts[normalizeKey(key)];
  if (!account) return null;
  account.sessionVersion = (account.sessionVersion ?? 0) + 1;
  await writeAccounts(accounts);
  return account;
}

export async function deleteUnactivatedManager(key: string): Promise<Account | null> {
  const accounts = await readAccounts();
  const normalized = normalizeKey(key);
  const account = accounts[normalized];
  if (!account || account.role !== 'manager' || account.hash !== null) return null;
  delete accounts[normalized];
  await writeAccounts(accounts);
  return account;
}

// 清空「所有幹部」密碼（role==='manager'），讓他們用啟用碼重新設定。回傳被清空的帳號數。
// 用於正式發放幹部帳號前，把先前測試設過的密碼一次清乾淨。
export async function resetAllManagerPasswords(): Promise<number> {
  const accounts = await readAccounts();
  await ensureManagerAccounts(accounts);
  let count = 0;
  for (const acc of Object.values(accounts)) {
    if (acc.role === 'manager') {
      acc.hash = null;
      acc.salt = '';
      count++;
    }
  }
  await writeAccounts(accounts);
  return count;
}

// 刪除「所有客戶帳號」（role==='user'）。回傳被刪帳號（含 userId 供級聯清資料）。
// 用於正式上線前，把測試期間註冊的手機帳號一次清乾淨。不影響幹部/管理員。
export async function deleteAllCustomers(): Promise<{ key: string; userId: string }[]> {
  const accounts = await readAccounts();
  const removed: { key: string; userId: string }[] = [];
  for (const [k, acc] of Object.entries(accounts)) {
    if (acc.role === 'user') {
      removed.push({ key: k, userId: acc.userId });
      delete accounts[k];
    }
  }
  await writeAccounts(accounts);
  return removed;
}

// 管理員重設密碼（清空，讓該帳號下次登入重新設定）——用於幹部/管理員（有啟用碼重設流程）
export async function adminResetPassword(key: string): Promise<boolean> {
  const accounts = await readAccounts();
  const acc = findAccountEntry(accounts, key)?.account;
  if (!acc) return false;
  acc.hash = null;
  acc.salt = '';
  acc.sessionVersion = (acc.sessionVersion ?? 0) + 1;
  await writeAccounts(accounts);
  return true;
}

// 管理員為客戶重設成一組「臨時新密碼」並回傳（客戶沒有啟用碼重設流程，若清成 null 會被鎖死；
// 故直接設一組可用的新密碼，由管理員轉告客戶登入）。
export async function adminResetCustomerPassword(key: string): Promise<string | null> {
  const accounts = await readAccounts();
  const acc = findAccountEntry(accounts, key)?.account;
  if (!acc) return null;
  // 8 碼英數臨時密碼，避開易混淆字元（0/o/1/l/i）
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(8);
  let pw = '';
  for (let i = 0; i < 8; i++) pw += chars[bytes[i] % chars.length];
  acc.salt = crypto.randomBytes(16).toString('hex');
  acc.hash = hashPassword(pw, acc.salt);
  acc.sessionVersion = (acc.sessionVersion ?? 0) + 1;
  await writeAccounts(accounts);
  return pw;
}

// 客戶用簡訊驗證碼重設密碼（僅限客戶帳號；幹部/管理員請走啟用碼重設）。
export async function setCustomerPassword(key: string, password: string): Promise<boolean> {
  const accounts = await readAccounts();
  const acc = findAccountEntry(accounts, key)?.account;
  if (!acc || acc.role !== 'user') return false;
  acc.salt = crypto.randomBytes(16).toString('hex');
  acc.hash = hashPassword(password, acc.salt);
  acc.sessionVersion = (acc.sessionVersion ?? 0) + 1;
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

// server 權威的幹部 userId 集合（供 /api/sync 的 request_posted 通知收件人驗證用）。
// 只讀帳號儲存層、以 role==='manager' 判定，不使用 client 傳入的 role 或 roster。
export async function getManagerUserIds(): Promise<string[]> {
  const accounts = await readAccounts();
  if (await ensureManagerAccounts(accounts)) await writeAccounts(accounts);
  return Object.values(accounts)
    .filter((a) => a.role === 'manager' && !a.disabled && !a.archived)
    .map((a) => a.userId);
}

// 停用/啟用帳號（admin 帳號不可停用）
export async function setAccountDisabled(key: string, disabled: boolean): Promise<boolean> {
  const accounts = await readAccounts();
  const acc = findAccountEntry(accounts, key)?.account;
  if (!acc || acc.role === 'admin') return false;
  acc.disabled = disabled;
  acc.sessionVersion = (acc.sessionVersion ?? 0) + 1;
  await writeAccounts(accounts);
  return true;
}

// 真刪除帳號（僅限客戶；幹部/管理員請用停用/重設）。回傳被刪的帳號供級聯清資料。
export async function deleteAccount(key: string): Promise<Account | null> {
  const accounts = await readAccounts();
  const entry = findAccountEntry(accounts, key);
  const acc = entry?.account;
  if (!acc || acc.role !== 'user') return null;
  delete accounts[entry.storageKey];
  await writeAccounts(accounts);
  return acc;
}
