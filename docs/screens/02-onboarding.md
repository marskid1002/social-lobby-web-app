# Screen 02 — Onboarding (`/onboarding`)

## Goal
First-time setup. Confirm nickname, area, optional bio, and prompt to follow the LINE Official Account.

## Layout (top → bottom)
- Back arrow top-left (disabled / hidden — there's nothing to go back to).
- Title: 「完成設定」 — `text-2xl font-semibold`.
- Subtitle: 「再三步就能開始」 — `text-sm text-zinc-500`.
- Form:
  - Avatar (pre-filled from `u-001.avatarUrl`, with a small camera badge in the corner — does nothing in prototype).
  - Field: **暱稱** — `Input` pre-filled with `示範用戶`. Required.
  - Field: **所在區域** — `Select` of `TAIPEI_AREAS`. Pre-filled with `信義區`.
  - Field: **簡短自我介紹（選填）** — `Textarea`, 3 rows.
- LINE OA card (highlighted): green border, LINE logo, 「加入官方 LINE 帳號接收通知」 + a `Button variant="outline"` 「+加入好友」. Below the button, small text: 「掃描 QR 碼或在 LINE 搜尋 @sociallobby」.
- Primary CTA at the bottom: **繼續** — full width, primary color.

## Components
- shadcn: `Input`, `Textarea`, `Select`, `Button`, `Avatar`, `Card`, `Label`
- lucide: `Camera`, `Check`

## Interactions
- Tap **繼續** → write `localStorage.onboarded = 'true'` + persist nickname/area/bio updates to `currentUser` in state → `router.push('/lobby/explore')`.
- Tap **+加入好友** → toast 「假裝你已加入！」 and set `currentUser.lineOAFollowed = true` (it already is for u-001, this is illustrative).

## Mock data
- `getUser('u-001')` for pre-fill values.
- `TAIPEI_AREAS` for the dropdown.

## Acceptance criteria
- [ ] Form fields are pre-filled from mock data.
- [ ] `繼續` enabled only when nickname is non-empty.
- [ ] Persists edits to localStorage before navigating.
- [ ] OA card visually distinct from the rest of the form (uses `border-brand-line/40 bg-brand-line/5`).
