# Screen 11b — Settings (`/settings`)

## Goal
Single settings page with grouped sections. All controls are functional in the prototype (write to state) but no real backend.

## Layout

```
┌────────────────────────────────────────────┐
│ [←]   設定                                  │
├────────────────────────────────────────────┤
│  帳號                                       │
│  使用者 ID         u-001                    │
│  LINE 帳號         已連結 @lineuser         │
│  會員等級          Pro · 50 點 [升級]        │
├────────────────────────────────────────────┤
│  通知                                       │
│  ┌──────────────────────────────────────┐  │
│  │ LINE 通知                       [⚪️] │  │  ← Switch
│  │ 收到邀請、回應、需求媒合時 LINE 推播   │  │
│  └──────────────────────────────────────┘  │
│  ┌──────────────────────────────────────┐  │
│  │ 加入官方 LINE 帳號           [+加入]   │  │  ← only if not followed
│  └──────────────────────────────────────┘  │
├────────────────────────────────────────────┤
│  隱私                                       │
│  [封鎖名單 (0)]                  ›          │
│  [自動下線時間: 4 小時]          ›          │
│  [允許在「附近」顯示我]          [●]        │
├────────────────────────────────────────────┤
│  語言                                       │
│  [繁體中文 ▾]                                │
├────────────────────────────────────────────┤
│  關於                                       │
│  [服務條款]              ›                   │
│  [隱私權政策]            ›                   │
│  [檢舉問題]              ›                   │
├────────────────────────────────────────────┤
│  [        刪除我的帳號        ]              │  ← destructive
└────────────────────────────────────────────┘
```

## Sections

### 帳號
- Read-only display rows: ID, LINE binding status, tier + credits with `[升級]` button (opens a `Dialog` mock: 「升級到 VIP 解鎖所有功能」).

### 通知
- Switch for LINE push (stored in `currentUser.notificationsEnabled`).
- If `lineOAFollowed === false`, show a 「+加入」 button that toasts 「假裝你已加入官方 LINE！」 and flips the flag.

### 隱私
- Blocked list row: opens a `Dialog` listing blocked users with an unblock button each. Use `userBlocks` state.
- Auto-offline timeout row: opens a `Select` with 1h / 2h / 4h / 8h.
- "Show me on Nearby" switch: stored as a flag.

### 語言
- `Select` with `繁體中文` selected. EN option is selectable but **no-op** in the prototype.

### 關於
- Three rows that toast 「假連結」 on tap. (No real legal pages in prototype.)

### Delete account
- Destructive `Button` (red, outline) at the bottom. Tap → `Dialog` confirm → on confirm, clears localStorage and routes to `/login`.

## Components
- shadcn: `Switch`, `Button`, `Select`, `Dialog`, `Separator`, `Card`
- lucide: `Bell`, `Lock`, `Languages`, `FileText`, `Trash2`, `ArrowLeft`

## Acceptance criteria
- [ ] All switches actually toggle state and persist.
- [ ] Blocked list dialog renders any users that were blocked via Screen 04.
- [ ] Delete account flow clears state and routes to `/login`.
- [ ] Page is scrollable on a 390×844 viewport.
