# Screen 03 — Lobby (`/lobby/{following|explore|nearby}`)

## Goal
The home screen. Browse online users by relationship (Following), discovery (Explore), or location (Nearby). This is the highest-traffic screen and must look polished.

## Layout (top → bottom)

```
┌────────────────────────────────────────────┐
│ [Avatar]   🔍 [Search...]            🔔    │  ← top bar
├────────────────────────────────────────────┤
│  關注 Following │ 探索 Explore │ 附近 Nearby │  ← sticky tabs
├────────────────────────────────────────────┤
│  ⚙  [信義區] [大安區] [中山區] ...           │  ← area filter chips (scrolls h)
├────────────────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐                │
│  │ 王小美   │  │ 李小華   │                │
│  │          │  │          │                │  ← 2-column grid
│  │          │  │          │                │     of UserCards
│  │ ●可接局  │  │          │                │
│  └──────────┘  │          │                │
│  ┌──────────┐  └──────────┘                │
│  │ 吳欣怡   │  ┌──────────┐                │
│  │          │  │ 陳怡安   │                │
│  └──────────┘  └──────────┘                │
│  ...                                        │
├────────────────────────────────────────────┤
│  🏠 📋 ➕ 📥 🔔                              │  ← bottom nav
└────────────────────────────────────────────┘
```

## Tabs
- Use shadcn `Tabs` with the route as `value`. Selecting a tab navigates (not just internal state) — use Next.js `Link` or `router.push`.
- Default route `/lobby` redirects to `/lobby/explore`.
- Persist last-visited tab in `localStorage.lobbyTab` and restore on `/lobby`.

## UserCard component (the 2-column grid item)

```
┌─────────────────────────┐
│  [Background tint]      │  ← `aspect-[3/4]` rounded-2xl
│                          │
│  [Avatar circle]         │  ← absolutely positioned
│                          │
│                          │
│                          │
│  ● 王小美                 │  ← bottom-left text overlay
│  可接局 · 信義區          │
└─────────────────────────┘
```

**UserCard props:** `{ user: User, status?: OnlineStatus }`

- Card: `rounded-2xl bg-zinc-100 aspect-[3/4] relative overflow-hidden`
- Avatar: positioned absolute, centered-top, larger circle (96×96) on top of a colored gradient background (use a soft gradient from `from-zinc-100 to-zinc-200` to feel like the wireframe).
- Text overlay: bottom 1/3 of card, white text on a subtle dark gradient OR plain text on a white footer strip. **Match the wireframe: text appears INSIDE the card at the bottom-left, not on a white strip.**
- Status dot: small colored dot before the nickname (or in a corner if cleaner).
- Tap card → `/u/[id]`.
- Long-press card (or right-click on desktop) → quick action menu: "邀請", "封鎖" — use `DropdownMenu`.

## Filter row
- Leading icon button: settings/sliders → opens area filter sheet.
- Horizontally scrolling chips for areas. Selected chip: filled `bg-zinc-900 text-white`; unselected: `bg-zinc-100 text-zinc-700`.
- Maintain `selectedArea` state (null = all). Filtering applies to which users render.

## Data per tab
- **Following:** `users` filtered by `follows.where(follower=u-001).map(following)` ∩ `onlineStatuses`.
- **Explore:** all users where `getOnlineStatus(user.id) != null` AND `user.id !== currentUser.id`.
- **Nearby:** users where `onlineStatus.area === currentUser.defaultArea` AND `user.id !== currentUser.id`.

## Top bar specifics
- Left: 40×40 avatar (current user). Tap → opens `ProfileDrawer`. Long-press → opens `DemoUserSwitcher`.
- Middle: search field (visual only — accept input, filter the grid by nickname substring match, but no full search UI).
- Right: bell icon. Tap → `/updates`. Badge shows count of unread updates.

## "I'm Online" affordance
- **Not** in the lobby (it's in the drawer per the wireframe). Skip it here — the drawer has it.

## Empty states
- **Following empty:** illustration placeholder + 「你還沒關注任何人」 + button 「到探索找人」 → `/lobby/explore`.
- **Nearby empty:** 「附近還沒有人在線」 + helper text.

## Components
- shadcn: `Tabs`, `Input`, `Button`, `DropdownMenu`, `Sheet` (for the filter sheet — see screen 11a), `Avatar`, `Badge`, `ScrollArea`
- lucide: `Search`, `Bell`, `SlidersHorizontal`

## Acceptance criteria
- [ ] Three tabs work via routes.
- [ ] 2-column grid renders, no layout shift on load.
- [ ] UserCard matches the visual style in the supplied wireframe (Antonio's image).
- [ ] Tapping a card navigates to `/u/[id]`.
- [ ] Area chips filter the grid.
- [ ] Top-bar avatar opens the drawer.
- [ ] Following tab empty state appears if `follows` is empty.
- [ ] Search filters by nickname substring.
- [ ] Bell badge shows unread updates count from mock `updates`.
