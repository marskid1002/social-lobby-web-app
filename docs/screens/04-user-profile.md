# Screen 04 — Other-User Profile (`/u/[id]`)

## Goal
View another user's profile and take action — follow, invite, block, report.

## Layout (top → bottom)

```
┌────────────────────────────────────────────┐
│ [←]                              [⋮]       │  ← top bar, transparent over hero
├────────────────────────────────────────────┤
│                                             │
│  [Hero background — soft gradient]         │  ← ~200px tall
│                                             │
│         ┌─────────┐                        │
│         │ Avatar  │  ← circle 120px, sits over the curve
│         └─────────┘                        │
│                                             │
│           王小美                            │  ← name, text-2xl font-semibold
│         this is a bio                       │  ← bio, text-sm text-zinc-500
│                                             │
│  [● 可接局 · 信義區 · 2 分鐘前]              │  ← status pill row (if online)
│                                             │
│  [ 關注 ]  [ 邀請 ]                          │  ← two primary actions
│                                             │
├────────────────────────────────────────────┤
│  興趣                                       │
│  [調酒] [攝影] [貓奴] [健身] [電音]          │  ← chips
├────────────────────────────────────────────┤
│  ┌────┐ ┌────┐ ┌────┐                      │
│  │    │ │    │ │    │  ← 3-column media grid
│  └────┘ └────┘ └────┘     (placeholder bg-zinc-100)
│  ┌────┐ ┌────┐ ┌────┐                      │
│  │    │ │    │ │    │                      │
│  └────┘ └────┘ └────┘                      │
│  ...                                        │
└────────────────────────────────────────────┘
```

**This layout must match the supplied wireframe (王小美 page).**

## Hero section
- Background: `bg-gradient-to-b from-zinc-300 to-white` (~200px tall), with a curved bottom edge created by a white div positioned `absolute -bottom-8 left-0 right-0 h-12 rounded-t-[40px] bg-white`. Or just use a simple `aspect-[16/10]` colored block with rounded bottom corners.
- Avatar: 120×120 rounded-full, white ring, positioned to overlap the hero/white boundary.
- Name + bio centered below the avatar.

## Status pill row
- Only render if `getOnlineStatus(user.id)` exists.
- Format: `● <status label> · <area> · <relative last-seen>`.
- Use `StatusPill` component (colored dot from `status-*` tokens + label).

## Action buttons
- Two side-by-side full-width buttons in a row, `gap-2`.
- "關注" toggles between `關注` (outline) / `已關注` (filled). Mutates `follows` in state.
- "邀請" opens a dialog (see below).

## Top-right kebab menu (⋮)
- shadcn `DropdownMenu`.
- Items: 「檢舉」, 「封鎖」.
- Block → confirmation dialog → updates state (`userBlocks`) → toast → navigate back to lobby.

## Invite dialog
- shadcn `Dialog`.
- Title: 「邀請 王小美」.
- Body: list of `myRequests` (open status only). Each row is selectable. Plus a bottom option: 「+ 建立新需求」 → navigates to `/requests/new`.
- Confirm button: 「送出邀請」 → creates an `Invitation` in state → toast 「邀請已送出」 → close dialog.
- If user has no open requests, show a single CTA: 「先發布一個需求」 → `/requests/new`.

## Interests section
- Section heading 「興趣」 (`text-sm font-semibold text-zinc-700 uppercase tracking-wide` or just `text-sm font-medium`).
- Chips rendered from `user.interests` array. `Badge variant="secondary"` per chip.

## Media grid
- 3-column grid of `aspect-square rounded-lg bg-zinc-100` placeholders.
- 9 placeholders is enough.
- **No real images** — leave a TODO comment `// TODO: wire up user_media once we decide on MVP scope`.
- This is included to match the wireframe; the proposal flags media as a scope-open decision.

## Components
- shadcn: `Button`, `Badge`, `Dialog`, `DropdownMenu`, `Avatar`
- lucide: `ArrowLeft`, `MoreVertical`, `UserPlus`, `Mail`, `Flag`, `ShieldOff`

## Acceptance criteria
- [ ] Layout matches the wireframe (王小美 page).
- [ ] Follow button toggles state and persists.
- [ ] Invite dialog lists current user's open requests.
- [ ] Block confirmation removes the user from lobby state and navigates back.
- [ ] If user has no current online status, the status pill row is omitted (no empty pill).
- [ ] Top bar back button works (`router.back()`).
