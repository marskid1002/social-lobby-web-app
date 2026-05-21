# Screen 07 — Requests Ledger (`/requests`)

## Goal
Public ledger of all active requests across the platform. The "deals" / "feed" page.

## Layout (top → bottom)

```
┌────────────────────────────────────────────┐
│ [Avatar]   需求                       🔔    │  ← top bar
├────────────────────────────────────────────┤
│  [全部] [After Party] [喝一杯] [補位] ...    │  ← type filter chips
├────────────────────────────────────────────┤
│  📍 [信義區 ▾]                              │  ← area filter
├────────────────────────────────────────────┤
│  ┌──────────────────────────────────────┐  │
│  │ [Avatar] 陳怡安           2 分鐘前    │  │  ← RequestCard
│  │ ● After Party · 信義區 · 3 人         │  │
│  │ Club Wave 結束後想找人續攤...          │  │
│  │ [ 查看 ]  [ 我想加入 ]                │  │
│  └──────────────────────────────────────┘  │
│  ┌──────────────────────────────────────┐  │
│  │ [Avatar] 李小華          18 分鐘前    │  │
│  │ ● 喝一杯 · 大安區 · 2 人              │  │
│  │ 東區小酒館，輕鬆喝兩杯聊聊...         │  │
│  │ [ 查看 ]  [ 我想加入 ]                │  │
│  └──────────────────────────────────────┘  │
│  ...                                        │
├────────────────────────────────────────────┤
│  🏠 📋 ➕ 📥 🔔                              │  ← bottom nav
└────────────────────────────────────────────┘
```

## RequestCard component

Used here and in Inbox. Props: `{ request: Request, variant: 'ledger' | 'inbox' }`.

- Card: `rounded-2xl border border-zinc-200 p-4 bg-white shadow-sm`.
- Row 1: creator avatar (32×32) + creator nickname + relative time (right-aligned).
- Row 2: type badge (colored by `type-*` token) + area + "X 人" — small text.
- Row 3: note, `line-clamp-2`, `text-sm text-zinc-700`.
- Row 4: action buttons:
  - `ledger` variant: 「查看」 (outline) + 「我想加入」 (primary).
  - `inbox` variant (own request): 「查看」 + 「關閉」 (subtle red).
  - If the user has already responded: replace the second button with a disabled 「已回應」.

## Filters
- Type filter chip row: includes a "全部" chip + 5 type chips. Single-select.
- Area filter: same as lobby.

## Data
- Source: `requests.filter(r => r.status === 'open')`.
- Apply type filter, area filter.
- **Exclude:** the current user's own requests (those show in Inbox).
- Sort by `createdAt` desc.

## Interactions
- 「查看」 → `/requests/[id]`.
- 「我想加入」 → create a `Response` in state → toast 「已表示興趣」 → mark button as 「已回應」.

## Empty state
- 「目前沒有公開需求」 + helper "成為第一個發布需求的人" + button → opens Post Request sheet.

## Components
- shadcn: `Card`, `Button`, `Badge`, `Avatar`, `ToggleGroup`, `Select`
- lucide: `Eye`, `UserPlus`, `MapPin`, `Users`

## Acceptance criteria
- [ ] Excludes the current user's own requests.
- [ ] Filters work additively.
- [ ] Tapping 「我想加入」 immediately reflects in `/inbox` for the request creator (after switching users to verify).
- [ ] Long notes are truncated to 2 lines.
