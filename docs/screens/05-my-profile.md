# Screen 05 — My Profile (`/me`)

## Goal
The current user's own profile view. Visually similar to Screen 04 but with Edit instead of Follow/Invite/Block, and shows tier + credits.

## Layout
- Same hero + avatar + name + bio layout as Screen 04.
- Instead of Follow/Invite, show **one** primary button: 「編輯個人檔案」 (Edit Profile) — opens a `Sheet` with editable fields (nickname, area, bio, interests) — submitting updates state.
- Below the action button, a compact info row:
  - Tier badge (`Free` / `Pro` / `VIP` with color)
  - Credits: `💰 50 點` (using `users[currentUser].credits`)
  - Member since: `加入於 2026 年 4 月`
- Interests chips (same as Screen 04).
- Media grid — placeholder, with an "+ 新增" tile in the top-left if there's space.
- No top-right kebab (no actions against yourself).

## Edit Profile sheet
- shadcn `Sheet` from the bottom (or side).
- Fields: nickname, default area, bio textarea, interests (allow add/remove chips — simple input + plus button).
- Save → mutate `currentUser` in state → toast 「已儲存」.

## Components
- shadcn: `Button`, `Badge`, `Sheet`, `Input`, `Textarea`, `Select`, `Avatar`
- lucide: `Pencil`, `Coins`, `Plus`

## Acceptance criteria
- [ ] Reads from `getUser(currentUserId)`.
- [ ] Edit sheet saves changes and re-renders the profile.
- [ ] Tier badge color matches tier (Free=gray, Pro=blue, VIP=gold/amber).
- [ ] No Follow/Invite/Block buttons.
- [ ] No top-right kebab menu.
