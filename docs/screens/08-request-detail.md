# Screen 08 — Request Detail (`/requests/[id]`)

## Goal
Full view of a single request, who's invited, who responded, owner controls.

## Layout (top → bottom)

```
┌────────────────────────────────────────────┐
│ [←]   需求詳情                       [⋮]   │
├────────────────────────────────────────────┤
│  ● After Party · 信義區 · 3 人              │  ← type/area/count header
│  Club Wave 結束後想找人續攤，bar hopping..  │  ← full note (no clamp)
│  發布於 2 分鐘前 · 5 小時後自動關閉          │  ← meta
├────────────────────────────────────────────┤
│  發布者                                     │
│  [Avatar] 陳怡安                            │  ← tap → /u/u-005
├────────────────────────────────────────────┤
│  受邀者 (1)                                 │
│  [Avatar] 你          [ 待回應 ]            │  ← invitees list
├────────────────────────────────────────────┤
│  回應的人 (2)                               │
│  [Avatar] 蔡佳蓉      [ 有興趣 ]            │
│  [Avatar] 廖珮君      [ 加入 ]              │
├────────────────────────────────────────────┤
│  [  我想加入  ]                             │  ← sticky CTA at bottom
└────────────────────────────────────────────┘
```

## Sections

### Header strip
- Status pill (using type color).
- One-line: `<type label> · <area> · <count> 人`.
- Full note text, no truncation.
- Meta line: 「發布於 X 分鐘前 · Y 小時後自動關閉」 (compute from `createdAt` and `expiresAt`).

### Creator block
- Avatar + nickname. Tap → `/u/[creatorId]`.

### Invitees list
- All `invitations.where(requestId === r.id)`.
- Each row: avatar + nickname + status pill (待回應 / 已接受 / 已拒絕).

### Responders list
- All `responses.where(requestId === r.id)`.
- Each row: avatar + nickname + status pill (有興趣 / 加入).

### Bottom CTA — varies by viewer state
- **If viewer is creator:** 「關閉需求」 button (subtle red `outline` style).
- **If viewer has already responded:** disabled 「已回應」.
- **If viewer is an invitee:** two buttons row: 「接受」 / 「婉拒」.
- **Otherwise:** 「我想加入」 primary.

### Top-right kebab (⋮)
- 「檢舉這個需求」, 「分享」 (toast 「連結已複製」 — `navigator.clipboard.writeText(window.location.href)`).

## Components
- shadcn: `Button`, `Badge`, `Avatar`, `DropdownMenu`, `Separator`
- lucide: `ArrowLeft`, `MoreVertical`, `Clock`, `MapPin`, `Users`, `Share2`, `Flag`

## Acceptance criteria
- [ ] CTA changes based on viewer's relationship to the request.
- [ ] Tapping creator avatar/nickname navigates to their profile.
- [ ] Closing a request (as owner) sets `status = 'closed'` and removes it from `/requests` ledger.
- [ ] Auto-close countdown is human-readable ("5 小時後", "30 分鐘後").
