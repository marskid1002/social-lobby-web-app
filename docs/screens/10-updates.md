# Screen 10 — Updates (`/updates`)

## Goal
Lightweight activity feed. Who responded, who invited you, who followed you, who came online from people you follow.

## Layout

```
┌────────────────────────────────────────────┐
│ [Avatar]   動態                       ⚙    │
├────────────────────────────────────────────┤
│  今天                                       │
│  ┌──────────────────────────────────────┐  │
│  │ [Avatar] 王小美 邀請你加入她的需求     │  │
│  │ After Party · 信義區     · 12 分鐘前   │  │
│  └──────────────────────────────────────┘  │
│  ┌──────────────────────────────────────┐  │
│  │ [Avatar] 謝書婷 邀請你加入她的需求     │  │
│  │ After Party · 松山區     · 40 分鐘前   │  │
│  └──────────────────────────────────────┘  │
│  ┌──────────────────────────────────────┐  │
│  │ [Avatar] 陳怡安 開始關注你             │  │
│  │ · 2 小時前                            │  │
│  └──────────────────────────────────────┘  │
│  昨天                                       │
│  ...                                        │
└────────────────────────────────────────────┘
```

## Item rendering

Each `UpdateEvent` renders as a compact card with:
- Actor avatar (40×40) on the left.
- One-line summary based on `eventType`:
  - `invite_received`: 「<actor> 邀請你加入她/他的需求」
  - `response_received`: 「<actor> 對你的需求表示興趣」
  - `follow`: 「<actor> 開始關注你」
  - `status_change`: 「<actor> 現在 <new status>」
  - `request_closed`: 「<actor> 關閉了你參與的需求」
- Sub-line: linked request meta (if applicable) + relative time.
- Unread state: subtle left border `border-l-4 border-brand-line` and `bg-brand-line/5`.

## Grouping
- Group by day. Section headings: 「今天」, 「昨天」, 「<MM 月 DD 日>」.
- Use `date-fns` `isToday` / `isYesterday`.

## Interactions
- Tap an item → navigate to the relevant context (request detail for invite/response/closed, profile for follow).
- On mount: mark visible items as read in state (`readUpdateIds`). Bell badge in top bar reflects the count.
- Top-right gear icon → `/settings#notifications`.

## Empty state
- 「目前沒有動態」 + helper "等有人邀請你、回應你或關注你就會出現".

## Components
- shadcn: `Card`, `Avatar`, `Badge`, `Separator`
- lucide: `Mail`, `UserPlus`, `MessageSquare`, `Settings`, `Bell`

## Acceptance criteria
- [ ] Reads from `updates` mock + any in-state mutations.
- [ ] Unread items visually distinct; reading them updates the bell badge.
- [ ] Day grouping works.
- [ ] Tap routing matches event type.
