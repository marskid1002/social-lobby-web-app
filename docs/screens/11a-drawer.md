# Screen 11a — Profile / Settings Drawer (component)

## Goal
Slide-in panel from the left, opened by tapping the top-bar avatar. The "Me" surface — status controls, profile, settings, sign-out.

## Trigger
- Avatar in `TopBar` → opens `Sheet side="left"` (shadcn).
- Width: ~85% of viewport, max 360px.

## Layout (top → bottom)

```
┌────────────────────────────────────────────┐
│  [Avatar 56]                          [✕]  │
│  示範用戶                                   │
│  @u-001 · Pro · 50 點                       │
├────────────────────────────────────────────┤
│  目前狀態                                   │
│  ┌──────────────────────────────────────┐  │
│  │ [● 可接局 ▾]                          │  │  ← Select w/ colored dot
│  └──────────────────────────────────────┘  │
│  ┌──────────────────────────────────────┐  │
│  │ 📍 信義區 ▾                          │  │  ← Select
│  └──────────────────────────────────────┘  │
│                                             │
│  [    ●  我已上線    ]                      │  ← big toggle row
│  在線時間：剩餘 3 小時 50 分鐘               │
├────────────────────────────────────────────┤
│  👤  我的個人檔案              ›             │  ← list items
│  📋  我的需求                  ›             │
│  🚫  封鎖名單                  ›             │
│  ⚙   設定                      ›             │
├────────────────────────────────────────────┤
│  ↻   重置示範資料                            │  ← dev affordance
│  ⤴   登出                                   │
├────────────────────────────────────────────┤
│  v0.1 · zh-Hant                             │  ← footer (lang toggle later)
└────────────────────────────────────────────┘
```

## Top section
- Header strip with avatar, nickname, secondary line with handle + tier + credits.

## Status controls
- **Status `Select`**: 4 options (`available`, `fill_spot`, `bring_people`, `busy`) with colored dots and zh-Hant labels.
- **Area `Select`**: `TAIPEI_AREAS`.
- **Online toggle**: a tall row with a `Switch` to the right. On = green, persists `currentUser.isOnline` in state.
- Below toggle: countdown to `expires_at` (computed if online). On toggle off, presence is removed from state.

## List items (each is a `<button>` or `<Link>`)
- 「我的個人檔案」 → `/me`.
- 「我的需求」 → `/inbox` (scrolled to "我的需求" section).
- 「封鎖名單」 → `/settings` with a query param `?tab=blocked` (or inline modal — choose simpler).
- 「設定」 → `/settings`.

## Footer actions
- 「重置示範資料」 — wipes localStorage and re-seeds from mock. Toast 「示範資料已重置」.
- 「登出」 — clears `currentUserId`, navigates to `/login`.

## Dev affordance
- **Long-press on the avatar** (in the drawer header or in the top bar) opens `DemoUserSwitcher`:
  - A `Dialog` listing all `users`.
  - Tap a user → write to localStorage and `router.refresh()`.
  - Helpful for demo flow Step 7 (switch to 王小美 to respond to your own request).
- Also accessible by query: `?as=u-002` on any route swaps current user.

## Components
- shadcn: `Sheet`, `Select`, `Switch`, `Button`, `Avatar`, `Badge`, `Separator`, `Dialog` (for switcher)
- lucide: `User`, `List`, `ShieldOff`, `Settings`, `RotateCcw`, `LogOut`, `MapPin`

## Acceptance criteria
- [ ] Drawer opens from the top-bar avatar.
- [ ] Status, area, and online toggle all persist immediately.
- [ ] Online toggle controls whether the user shows up in lobby for other viewers.
- [ ] Reset Demo wipes localStorage and restores seed data without page reload (or after a refresh).
- [ ] Logout clears state and routes to `/login`.
- [ ] Long-press avatar opens the DemoUserSwitcher.
