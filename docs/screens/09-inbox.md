# Screen 09 — Inbox (`/inbox`)

## Goal
The user's coordination hub. Their own requests at the top (highest priority), then invites received, then responses received.

## Layout (top → bottom)

```
┌────────────────────────────────────────────┐
│ [Avatar]   收件匣                     🔔    │
├────────────────────────────────────────────┤
│  我的需求 (1)                                │
│  ┌──────────────────────────────────────┐  │
│  │ ● After Party · 信義區 · 2 人         │  │  ← own request card
│  │ 信義區附近誰要喝一杯                   │  │
│  │ 5 分鐘前 · 2 人回應                    │  │
│  │ [ 查看 ]  [ 關閉需求 ]                │  │
│  └──────────────────────────────────────┘  │
├────────────────────────────────────────────┤
│  收到的邀請 (2)                              │
│  ┌──────────────────────────────────────┐  │
│  │ [Avatar] 王小美 邀請你加入             │  │
│  │ After Party · 信義區                  │  │
│  │ 「哈囉，這個 after party 你有興趣嗎?」 │  │
│  │ [ 接受 ]  [ 婉拒 ]                    │  │
│  └──────────────────────────────────────┘  │
│  ...                                        │
├────────────────────────────────────────────┤
│  收到的回應                                  │
│  [Avatar] 蔡佳蓉 對你的需求表示興趣           │  ← compact rows
│  [Avatar] 廖珮君 想加入你的需求               │
│  ...                                        │
└────────────────────────────────────────────┘
```

## Sections

### My Requests
- `requests.where(creatorId === currentUserId && status === 'open')`.
- Render as `RequestCard variant="inbox"` (from Screen 07).
- For each, show response count badge in the card footer.

### Invitations Received
- `invitations.where(toUserId === currentUserId && status === 'pending')`.
- Each card:
  - Inviter avatar + name + 「邀請你加入」.
  - Linked request meta (type + area + count).
  - Inviter message in quotes if present.
  - Two buttons: 「接受」 (primary) / 「婉拒」 (outline).
- Accept → set invitation status to `accepted`, redirect to `/requests/[refRequestId]`.
- Decline → set invitation status to `declined`, animate-out the card.

### Responses Received (compact list)
- For each of the user's open requests, list responders.
- Render as a flat list of compact rows: `[Avatar] <responder name> <action verb> 你的需求 「<note?>」`.
- Tap a row → `/requests/[ref]`.

## Empty state
- 「收件匣是空的」 + 「發布你的第一個需求」 button → opens Post Request sheet.

## Components
- shadcn: `Card`, `Button`, `Avatar`, `Badge`, `Separator`
- lucide: `Inbox`, `Mail`, `MessageSquare`, `Check`, `X`

## Acceptance criteria
- [ ] Sections collapse cleanly when empty (don't render the heading).
- [ ] Own-request card shows live response count from state.
- [ ] Invitation accept/decline mutates state and re-renders without page reload.
- [ ] Response rows are tap targets that navigate to the request.
