// Node ESM resolve hook（僅用 Node 內建，不新增依賴）：讓 `node --test` 能載入 route.ts 及其相依，
// 用來對「真正的」production 函式（scopeForSession / validatePatchShape）做單元測試。
// 處理三件事：
//   1. `next/server` → 測試 stub（bare node 無法解析其套件匯出）。
//   2. `@/x` 別名 → <root>/src/x。
//   3. 專案內無副檔名的相對/別名 import（如 './kv'）→ 補上 .ts 等副檔名。
// 搭配 --experimental-transform-types，node 即可載入 .ts。
import { pathToFileURL, fileURLToPath } from 'node:url';
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SRC = path.join(ROOT, 'src');
const STUB = pathToFileURL(path.join(ROOT, 'tests', 'next-server-stub.mjs')).href;
// 測試用 @vercel/blob stub（僅在測試載入；正式程式不受影響）——避免 /api/upload 連真實 Blob。
const BLOB_STUB = pathToFileURL(path.join(ROOT, 'tests', 'blob-stub.mjs')).href;
const EXTS = ['.ts', '.tsx', '.mts', '.mjs', '.js', '.jsx'];

function withExt(abs) {
  try { if (existsSync(abs) && statSync(abs).isFile()) return abs; } catch {}
  for (const e of EXTS) if (existsSync(abs + e)) return abs + e;
  for (const e of EXTS) { const i = path.join(abs, 'index' + e); if (existsSync(i)) return i; }
  return null;
}

export async function resolve(specifier, context, next) {
  if (specifier === 'next/server') return { url: STUB, shortCircuit: true };
  if (specifier === '@vercel/blob') return { url: BLOB_STUB, shortCircuit: true };
  if (specifier.startsWith('@/')) {
    const r = withExt(path.join(SRC, specifier.slice(2)));
    if (r) return { url: pathToFileURL(r).href, shortCircuit: true };
  }
  if ((specifier.startsWith('./') || specifier.startsWith('../'))
      && context.parentURL && context.parentURL.startsWith('file:')
      && !path.extname(specifier)) {
    const r = withExt(path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier));
    if (r) return { url: pathToFileURL(r).href, shortCircuit: true };
  }
  return next(specifier, context);
}
