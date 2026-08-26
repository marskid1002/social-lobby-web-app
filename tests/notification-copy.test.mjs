// 通知文案測試：驗證「局→約會／小姐→女伴／客戶端不顯示幹部」等用詞修正已生效，
// 且未影響觸發時機、收件人、網址或資料流程（那些由既有的 push-authz / sync-authz /
// match-chat-flow / meetup-lifecycle 等測試把關，本檔只驗證「文字」）。
//
// push-authz.ts / utils.ts 為純函式，直接呼叫驗證；.tsx 元件與 sw.js 無 JSX/DOM 執行環境
// （本專案測試皆為 bare Node，無 React 渲染器），沿用既有 sms-failclosed.test.mjs 的作法：
// 對原始碼做靜態字串比對（新字串存在、舊字串不存在）。
//
// 執行：node --experimental-transform-types --import ./tests/register-loader.mjs --test tests/notification-copy.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const { planAuthorizedSyncPushes } = await import('@/lib/push-authz');
const { REQUEST_TYPE_LABELS } = await import('@/lib/utils');

const src = (relPath) => readFileSync(new URL(`../${relPath}`, import.meta.url), 'utf8');

const session = (userId, role = 'user') => ({
  userId,
  role,
  tier: role === 'manager' ? 'vip' : 'standard',
});

// ── A/B/D/E：push-authz.ts（純函式，直接驗證真實回傳值）───────────────────────

test('A：客戶發布約會 → 推播給幹部，標題/內容改用「約會」', () => {
  const jobs = planAuthorizedSyncPushes({
    patch: { requests: [{ id: 'r1', creatorId: 'customer', status: 'open' }] },
    existing: { requests: [] },
    managerUserIds: ['manager-a'],
    session: session('customer'),
  });
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].title, '有新的約會邀請');
  assert.equal(jobs[0].body, '有人發起了新的約會，快安排出席');
  // 收件人/網址不變（只驗證文字修改，不驗證授權——授權已由 push-authz.test.mjs 覆蓋）
  assert.deepEqual(jobs[0].userIds, ['manager-a']);
  assert.equal(jobs[0].url, '/lobby/explore');
});

test('B：有人回應約會 → 推播給發起人，標題/內容改用「約會」', () => {
  const jobs = planAuthorizedSyncPushes({
    patch: {
      responses: [{ id: 'resp-1', requestId: 'r1', userId: 'escort', responseStatus: 'interested' }],
    },
    existing: { requests: [{ id: 'r1', creatorId: 'creator', status: 'open' }], responses: [] },
    managerUserIds: [],
    session: session('escort'),
  });
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].title, '有人想參加你的約會');
  assert.equal(jobs[0].body, '有人對你的約會感興趣，快去看看');
  assert.deepEqual(jobs[0].userIds, ['creator']);
});

test('D：收到一般邀請（掛在約會下）→ 推播內容為「有人邀你一起約會」', () => {
  const jobs = planAuthorizedSyncPushes({
    patch: {
      invitations: [{ id: 'iv-1', fromUserId: 'sender', toUserId: 'recipient', requestId: 'r1', status: 'pending' }],
    },
    existing: { invitations: [] },
    managerUserIds: [],
    session: session('sender'),
  });
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].title, '你收到一則邀請'); // 標題維持不變（未列入修改範圍）
  assert.equal(jobs[0].body, '有人邀你一起約會');
  assert.equal(jobs[0].url, '/inbox'); // 網址不變
});

test('E：收到私人邀請（requestId=null）→ 推播內容為「有人傳送了私人邀請給你」', () => {
  const jobs = planAuthorizedSyncPushes({
    patch: {
      invitations: [{ id: 'iv-2', fromUserId: 'sender', toUserId: 'recipient', requestId: null, status: 'pending' }],
    },
    existing: { invitations: [] },
    managerUserIds: [],
    session: session('sender'),
  });
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].body, '有人傳送了私人邀請給你');
});

// ── 發局邀約類型與地點 ────────────────────────────────────────────────

test('保留五種邀約類型定義，方便日後恢復', () => {
  const sheet = src('src/components/PostRequestSheet.tsx');
  for (const binding of [
    "value: 'drinking', label: '喝酒'",
    "value: 'music', label: '音樂'",
    "value: 'dancing', label: '跳舞'",
    "value: 'private_party', label: '私人派對'",
    "value: 'dining', label: '吃飯'",
  ]) assert.ok(sheet.includes(binding), `缺少邀約類型：${binding}`);
  for (const legacy of ["value: 'after_party'", "value: 'fill_spot'", "value: 'last_minute'", "value: 'other'"]) {
    assert.ok(!sheet.includes(legacy), `新發局不應再顯示舊選項：${legacy}`);
  }
});

test('保留五種地點定義與舊局類型相容性，方便日後恢復', () => {
  const sheet = src('src/components/PostRequestSheet.tsx');
  for (const binding of [
    "value: 'nightclub', label: '夜店'",
    "value: 'clubhouse', label: '會所'",
    "value: 'home', label: '住家'",
    "value: 'bar', label: '酒吧'",
    "value: 'motel', label: '汽旅'",
  ]) assert.ok(sheet.includes(binding), `缺少地點：${binding}`);
  assert.equal(REQUEST_TYPE_LABELS.drinking, '喝酒');
  assert.equal(REQUEST_TYPE_LABELS.last_minute, '臨時約會');
  assert.equal(REQUEST_TYPE_LABELS.after_party, 'After Party');
});

test('邀約類型、地點與局型已開啟，且三項皆為發局必選', () => {
  const utils = src('src/lib/utils.ts');
  const sheet = src('src/components/PostRequestSheet.tsx');
  for (const binding of [
    "value: 'with_women', label: '局有女'",
    "value: 'without_women', label: '局無女'",
    "value: 'one_on_one', label: '1 對 1'",
  ]) assert.ok(sheet.includes(binding), `缺少局型：${binding}`);
  assert.ok(utils.includes('export const SHOW_REQUEST_CLASSIFICATION = true'), '分類欄位開關必須開啟');
  assert.ok(sheet.includes('disabled={types.length === 0 || !venueType || !partyFormat'), '三項未選齊時必須禁止發局');
  assert.ok(sheet.includes('if (types.length === 0 || !venueType || !partyFormat) return'), '送出處理也必須驗證三項必選');
  assert.ok(sheet.includes('postRequest({ area, venueType, partyFormat, requestType: types[0], requestTypes: types, peopleCount: count, note })'), '新局必須保存三項分類');
});

// ── C：matches/accept/route.ts（推播，靜態字串比對）──────────────────────────

test('C：客戶接受回應／聊天室建立 → 推播文字更新，收件人/網址程式碼未變', () => {
  const s = src('src/app/api/matches/accept/route.ts');
  assert.ok(s.includes(`'客戶已答應約會！'`), '應使用新標題');
  assert.ok(s.includes('已同意，聊天室已經開好囉'), '應使用新內容');
  assert.ok(!s.includes('客戶已同意入局'), '舊標題不得殘留');
  assert.ok(!s.includes('已同意，聊天室已開啟'), '舊內容不得殘留');
  // 收件人/網址程式碼未被改動（只換文字）
  assert.ok(s.includes('[result.partnerUserId]'), '收件人邏輯不得變動');
  assert.ok(s.includes('/inbox?match=${encodeURIComponent(String(result.invitation.id))}&src=push'), '網址不得變動');
});

// ── H/I/J：chat/decision/route.ts（推播，客戶端不得出現「幹部」「小姐」）──────

test('H/I/J：約會成功/沒有成立/結束 → 推播文字改用結果導向敘述，不點名「幹部」，且不誤指為女伴本人操作', () => {
  const s = src('src/app/api/chat/decision/route.ts');
  // confirmed 實際由派工幹部操作，客戶端不顯示內部職稱，也不得寫成「女伴已確認」（會誤指操作者）
  assert.ok(s.includes('已確認女伴出席，好好享受這次約會吧！'), 'confirmed 應為新內容');
  assert.ok(!s.includes('女伴已確認出席'), '不得使用會誤指操作者為女伴本人的舊寫法');
  assert.ok(s.includes(`'約會沒有成立'`), 'declined 標題應改為「約會沒有成立」');
  assert.ok(s.includes('這次約會沒有成立，可以再發一個新的約會邀請試試'), 'declined 內容應為新文字');
  assert.ok(s.includes('這次約會已經結束了，謝謝你的參與'), 'ended 內容應為新文字');
  assert.ok(s.includes(`'約會成功'`), 'confirmed 標題維持不變');
  assert.ok(s.includes(`'約會結束'`), 'ended 標題維持不變');
  // 舊文字不得殘留
  assert.ok(!s.includes('幹部已確認這位小姐上台'), '舊文字（含幹部/小姐）不得殘留');
  assert.ok(!s.includes('幹部已將本次約會標記為失敗'), '舊文字（含幹部）不得殘留');
  assert.ok(!s.includes('本次約會已結束。'), '舊文字不得殘留');
  // 此路由只推播給客戶（customerUserId），故整份檔案不應再出現「幹部」「這位小姐」
  assert.ok(!s.includes('幹部'), 'chat/decision route（純客戶視角推播）不應出現「幹部」字眼');
  assert.ok(!s.includes('這位小姐'), 'chat/decision route 不應出現「這位小姐」字眼');
  // 收件人/網址程式碼未被改動
  assert.ok(s.includes('[result.customerUserId]'), '收件人邏輯不得變動');
  assert.ok(s.includes('`/chat/${encodeURIComponent(result.threadId)}?req=${encodeURIComponent(result.requestId)}`'), '網址不得變動');
});

// ── NotificationWatcher.tsx（站內浮動通知，靜態字串比對）────────────────────

test('NotificationWatcher：A/B/L 站內浮動通知文字更新', () => {
  const s = src('src/components/NotificationWatcher.tsx');
  assert.ok(s.includes('發起了新的約會'), 'A：request_posted 應改用「發起了新的約會」');
  assert.ok(s.includes('想參加你的約會'), 'B：response_received 應改用「想參加你的約會」');
  assert.ok(s.includes('你的約會被很多人看到囉'), 'L：milestone_views 應改用新文字');
  assert.ok(!s.includes('發布了新的局'), '舊文字（局）不得殘留');
  assert.ok(!s.includes('想加入你的局'), '舊文字（局）不得殘留');
  assert.ok(!s.includes('你的需求達到里程碑'), '舊文字不得殘留');
});

test('NotificationWatcher：D/E 依 refRequestId 拆分一般邀請／私人邀請文字，且用既有欄位判斷', () => {
  const s = src('src/components/NotificationWatcher.tsx');
  assert.ok(
    s.includes(`upd.refRequestId ? \`${'${actorName}'} 邀你一起約會\` : \`${'${actorName}'} 傳送了私人邀請給你\``),
    'invite_received 應依 upd.refRequestId 分流成兩種文字（沿用既有欄位，不新增資料來源）',
  );
  assert.ok(!s.includes('傳送了邀請`'), '舊的不分流文字不得殘留');
});

test('NotificationWatcher：C/F 共用的 invite_accepted 文字維持不變（前端無欄位可分辨兩種情境）', () => {
  const s = src('src/components/NotificationWatcher.tsx');
  assert.ok(s.includes('接受了你的邀請'), 'invite_accepted 文字應維持「維持不變」的決定');
});

test('NotificationWatcher：F-3 收件匣配對提示文字簡化，且維持 user 存在才顯示 description 的既有邏輯', () => {
  const s = src('src/components/NotificationWatcher.tsx');
  assert.ok(s.includes('你的邀請已確認，聊天室開好了'), 'F-3 description 應為新文字');
  assert.ok(!s.includes('的邀請已確認`'), '舊的（依賴 user.nickname 的）文字不得殘留');
  assert.ok(s.includes("description: user ? '你的邀請已確認，聊天室開好了' : undefined"), '仍須維持 user 存在才顯示 description 的既有防呆邏輯');
  assert.ok(s.includes(`toast('收件匣有新配對！'`), '標題維持不變');
});

test('NotificationWatcher：K（廣場回覆）與通用 fallback 維持不變；與 sw.js 的備援文字互相獨立', () => {
  const s = src('src/components/NotificationWatcher.tsx');
  assert.ok(s.includes('回覆了你的廣場貼文'), 'K：plaza_reply 維持不變');
  assert.ok(s.includes("message = '你有一則新通知'"), '通用 fallback 維持不變（與 sw.js 的備援文字是兩處獨立字串，不應被連動修改）');
});

// ── inbox/page.tsx（收件匣通知卡片，靜態字串比對）───────────────────────────

test('inbox 卡片：B-3/B-4「約會」用詞更新', () => {
  const s = src('src/app/(app)/inbox/page.tsx');
  assert.ok(s.includes(" 想參加你的約會"), 'interested 卡片應改用「想參加你的約會」');
  assert.ok(s.includes(' 加入了你的約會'), 'join 卡片應改用「加入了你的約會」');
  assert.ok(!s.includes(' 想加入你的局'), '舊文字不得殘留');
  assert.ok(!s.includes(' 加入了你的邀請'), '舊文字不得殘留');
});

test('inbox 卡片：C-4 女伴視角標題改用「約會」', () => {
  const s = src('src/app/(app)/inbox/page.tsx');
  assert.ok(s.includes('的約會`'), '女伴視角標題應改用「...的約會」');
  assert.ok(!s.includes('的活動`'), '舊文字（活動）不得殘留');
});

test('inbox 卡片：H-2/I-2/J-2 約會結果狀態行改用結果導向敘述，且不誤指為女伴本人操作', () => {
  const s = src('src/app/(app)/inbox/page.tsx');
  assert.ok(s.includes('💗 已確認女伴出席'), 'H-2 應改用「已確認女伴出席」');
  assert.ok(!s.includes('💗 女伴已確認出席'), '不得使用會誤指操作者為女伴本人的舊寫法');
  assert.ok(s.includes('💔 約會沒有成立'), 'I-2 應改用「約會沒有成立」');
  // 2026-08-18 依使用者決定：J-2 只保留結果本身，移除「女伴可以再安排下一場」
  // （客戶端不需要知道人員的調度狀態）。
  assert.ok(s.includes(`'✅ 約會已結束'`), 'J-2 應只顯示結果，不再提及人員可否再安排');
  assert.ok(!s.includes('可以再安排下一場'), '已移除的人員調度敘述不得殘留');
  assert.ok(!s.includes('💗 幹部已確認小姐上台'), '舊文字（含幹部/小姐）不得殘留');
  assert.ok(!s.includes('💔 約會失敗'), '舊文字不得殘留');
  assert.ok(!s.includes('✅ 約會已結束・小姐可再次派工'), '舊文字（含小姐）不得殘留');
});

test('inbox 卡片：L-2 查看次數文案實際組成「你的約會已被查看 N 次！」，並保留動態 milestoneCount', () => {
  const s = src('src/app/(app)/inbox/page.tsx');
  // 取出 milestone_views 分支的文案區塊（到 onTap 為止）
  const branch = s.match(/notif\.type === 'milestone_views'[\s\S]*?onTap =/);
  assert.ok(branch, '找不到 milestone_views 分支');
  const jsx = branch[0];

  // 結構：前綴字串 + <span>{milestoneCount} 單位</span> + 結尾字串
  const prefix = jsx.match(/\{'([^']*)'\}\s*<span/);
  const spanTail = jsx.match(/milestoneCount\}([^<]*)<\/span>/);
  const suffix = jsx.match(/<\/span>\s*\{'([^']*)'\}/);
  assert.ok(prefix, '應有前綴文字');
  assert.ok(spanTail, 'span 內必須是動態 milestoneCount 加單位（不得寫死數字）');
  assert.ok(suffix, '應有結尾文字');

  // 以實際樣本數字組出完整句子
  const composed = `${prefix[1]}10${spanTail[1]}${suffix[1]}`;
  assert.equal(composed, '你的約會已被查看 10 次！');

  // 舊文案不得殘留
  assert.ok(!s.includes('你的邀請達到 '), '舊文字「你的邀請達到」不得殘留');
  assert.ok(!s.includes('你的約會已經有 '), '舊文字「你的約會已經有」不得殘留');
  assert.ok(!s.includes("{' 查看！'}"), '舊的分離式「查看！」結尾不得殘留');
});

test('inbox 卡片：C-5/C-6/C-3（群組、倒數、約會類型標題）維持不變（依決定不動）', () => {
  const s = src('src/app/(app)/inbox/page.tsx');
  assert.ok(s.includes('位女伴加入 · 群組聊天已開啟'), 'C-5 群組狀態行應維持不變');
  assert.ok(s.includes('聊天視窗已關閉'), 'C-6 倒數文字應維持不變');
  assert.ok(s.includes('的私人邀請`'), '私人邀請標題應維持不變');
});

test('inbox 卡片：K（廣場回覆）維持不變（依決定不動）', () => {
  const s = src('src/app/(app)/inbox/page.tsx');
  assert.ok(s.includes('回覆了你在廣場的留言'), 'K 卡片文字應維持不變');
});

// ── utils.ts（範圍守門：程式碼註解裡的「幹部/小姐」不受影響，因非使用者可見文字）──

test('inbox/page.tsx 程式碼註解裡的「幹部/小姐」不受影響（非使用者可見文字，不在修改範圍）', () => {
  const s = src('src/app/(app)/inbox/page.tsx');
  assert.ok(s.includes('代談幹部/女伴=fromUserId'), '既有註解不應被誤動');
  assert.ok(s.includes('關於哪位小姐'), '既有註解不應被誤動');
});

// ── M：NotificationBanner.tsx 與 ProfileDrawer.tsx（一致性：兩處文字必須相同）────

test('M：開啟通知成功／被拒絕，Banner 與 Drawer 兩處文字已統一（規則 8）', () => {
  const banner = src('src/components/NotificationBanner.tsx');
  const drawer = src('src/components/ProfileDrawer.tsx');
  assert.ok(banner.includes('已開啟通知，有新邀請會馬上通知你 🔔'));
  assert.ok(drawer.includes('已開啟通知，有新邀請會馬上通知你 🔔'));
  assert.ok(banner.includes('通知被拒絕了，可以到瀏覽器或系統設定重新打開'));
  assert.ok(drawer.includes('通知被拒絕了，可以到瀏覽器或系統設定重新打開'));
  // 舊的不一致文字都不得殘留
  assert.ok(!banner.includes('已開啟通知，新邀請會即時提醒你'));
  assert.ok(!drawer.includes('已開啟通知 🔔'));
  assert.ok(!banner.includes('通知已被拒絕，可到瀏覽器/系統設定重新開啟'));
  assert.ok(!drawer.includes('通知被拒絕，請到瀏覽器/系統設定開啟'));
  // 綁定失敗／不支援兩則本來就一致，維持不變
  assert.ok(banner.includes('通知已授權，但綁定失敗，請確認網路後再試一次'));
  assert.ok(drawer.includes('通知已授權，但綁定失敗，請確認網路後再試一次'));
  assert.ok(banner.includes('此瀏覽器不支援推播'));
  assert.ok(drawer.includes('此瀏覽器不支援推播'));
});

test('M：NotificationBanner 提示條主文案更新', () => {
  const banner = src('src/components/NotificationBanner.tsx');
  assert.ok(banner.includes('這樣才不會錯過新邀請和聊天訊息'));
  assert.ok(!banner.includes('收到新邀請、加入與配對時即時提醒'));
});

test('M：ProfileDrawer 側邊選單常駐狀態說明維持不變（依決定不動）', () => {
  const drawer = src('src/components/ProfileDrawer.tsx');
  assert.ok(drawer.includes('已開啟，新邀請會提醒你'));
  assert.ok(drawer.includes('開啟後，關掉網頁也能收到新邀請'));
});

// ── N：public/sw.js（Service Worker 備援文字）────────────────────────────────

test('N：sw.js 備援通知文字更新，品牌名稱 JUGA 維持不變', () => {
  const s = src('public/sw.js');
  assert.ok(s.includes(`title: 'JUGA', body: '你有一則新的通知，點擊查看。'`), 'sw.js 備援文字應與目前產品文案一致，品牌名不變');
  assert.ok(!s.includes(`body: '你有一則新通知', url`), '更舊的備援文字不得殘留');
});
