# Social Lobby — Prototype Build Brief

You are building a **clickable HTML prototype** of a mobile-first web app called **Social Lobby**. This is a Next.js project that will be demoed to a client. Read this file end-to-end before writing any code.

## Hard rules

1. **Mock data only.** No Supabase, no real auth, no real API calls. Everything reads from `lib/mock/*.ts`.
2. **Mobile-first.** Design target is iPhone 14 (390 × 844). Test inside `device-frame` viewport at that size.
3. **zh-Hant (Traditional Chinese, Taiwan) is the primary language.** EN labels live alongside in a small toggle (top-right of drawer) but the default render is zh-Hant.
4. **LINE-native.** Brand color `#06C755` on auth CTAs. Login is "使用 LINE 登入". Avatars come from LINE. Don't say "WeChat" anywhere.
5. **No new screens beyond the 11 listed below.** Don't invent flows.
6. **shadcn/ui first.** Reach for shadcn components before writing custom ones. Tailwind utilities for everything else.
7. **Persist UI state in `localStorage`** (active tab, online toggle, "current user"). The fake login writes a `currentUserId` to localStorage.
8. **Fake "switching user"** — there's a hidden dev affordance (long-press the avatar, or `?as=<userId>` query param) that swaps the current user. This is critical for demoing the two-sided flow (Post Request → other user responds → see the response).
9. **No backend, no env vars, no external APIs.** This must run with `npm run dev` and zero config.
10. **Accessibility hygiene:** alt text, aria-labels on icon buttons, focus states, semantic HTML. We're going to be in the LINE in-app browser; don't make this brittle.

## What we're building

A real-time social meetup coordination web app for **Taiwan**. Users log in with LINE, mark themselves online, browse other online users in their area, post requests like "After Party tonight in 信義區, need 2 more people" or respond to others' requests. Once matched, they move to LINE chat to coordinate.

This prototype demonstrates the UX flow. **It does not demonstrate real auth, realtime, or persistence beyond localStorage.**

## Tech stack

- **Next.js 14** (App Router, TypeScript)
- **Tailwind CSS**
- **shadcn/ui** (install components on demand)
- **lucide-react** for icons
- **clsx** + **tailwind-merge** (shadcn defaults)
- **date-fns** for relative time ("2 分鐘前")

No state library. `useState` + `localStorage` + a small `useCurrentUser()` hook are enough.

## Setup commands

```bash
npx create-next-app@latest social-lobby --typescript --tailwind --app --src-dir --import-alias "@/*"
cd social-lobby
npx shadcn@latest init
npx shadcn@latest add button card tabs sheet dialog input textarea select skeleton avatar badge toast separator label scroll-area dropdown-menu
npm i lucide-react date-fns clsx tailwind-merge
```

Then drop the contents of `prototype-spec/lib/mock/` into `src/lib/mock/`, and copy `prototype-spec/docs/design-tokens.md` values into `tailwind.config.ts` and `src/app/globals.css`.

## Routing structure

```
src/app/
├── layout.tsx              # root layout — html lang="zh-Hant"
├── page.tsx                # → redirects to /login if no currentUserId, else /lobby/explore
├── login/page.tsx          # Screen 01
├── onboarding/page.tsx     # Screen 02
├── (app)/                  # authenticated layout (top bar + bottom nav + drawer)
│   ├── layout.tsx
│   ├── lobby/
│   │   ├── layout.tsx      # tabs nav
│   │   ├── following/page.tsx
│   │   ├── explore/page.tsx
│   │   └── nearby/page.tsx
│   ├── u/[id]/page.tsx     # Screen 04 — other user profile
│   ├── me/page.tsx         # Screen 05 — my profile
│   ├── requests/
│   │   ├── page.tsx        # Screen 07 — ledger
│   │   ├── new/page.tsx    # Screen 06 — post request (also accessible as sheet)
│   │   └── [id]/page.tsx   # Screen 08 — detail
│   ├── inbox/page.tsx      # Screen 09
│   ├── updates/page.tsx    # Screen 10
│   └── settings/page.tsx   # Screen 11b
└── (no /admin in prototype — out of scope for demo)
```

Drawer (Screen 11a) is a global `<Sheet side="left">` opened from the avatar in the top bar — it's a component, not a route.

## Component inventory (build these first)

Build in `src/components/`:

- **`AppShell`** — wraps authenticated pages. Renders `TopBar`, the page content, `BottomNav`, and the `ProfileDrawer`. Provides safe-area padding.
- **`TopBar`** — left: avatar (opens drawer), middle: page title or logo, right: bell icon (→ /updates).
- **`BottomNav`** — 5 slots: Lobby / Requests / FAB / Inbox / Updates. FAB opens the Post Request sheet (uses Screen 06 content).
- **`ProfileDrawer`** — slide-in from left, see Screen 11a spec.
- **`UserCard`** — used in lobby. Visual, 2-column grid friendly. Props: user, onView, onInvite.
- **`RequestCard`** — used in requests ledger and inbox.
- **`StatusPill`** — colored dot + label. Statuses: available (green), fill_spot (yellow), bring_people (blue), busy (gray).
- **`AreaChip`** — filter chip for Taipei districts.
- **`EmptyState`** — illustration placeholder + message + CTA.
- **`RelativeTime`** — renders `formatDistanceToNow(date, { locale: zhTW, addSuffix: true })`.
- **`DemoUserSwitcher`** — dev-only modal (open with `?as=` query or long-press avatar) listing all mock users; pick one and reload as them. Critical for demoing.

## Mock-state model

`src/lib/state.ts` (you'll build this):

```ts
// In-memory + localStorage-mirrored state
type AppState = {
  currentUserId: string;       // "u-001" by default after fake login
  onlineUserIds: Set<string>;  // who's "online" right now (toggled in UI)
  myRequests: Request[];       // user's own requests, mutated when they post
  responses: Response[];       // responses to all requests (mutated when "switch user → respond")
  invitations: Invitation[];   // invites sent/received
  readUpdateIds: Set<string>;  // for badge counts
};
```

Seed from mock files on first load. Persist mutations to localStorage so the demo flow survives page reloads. A `Reset demo` link in the drawer wipes localStorage and re-seeds.

## Build order (do these in this order — if you run out of time, the demo flow still works)

1. **Setup + design tokens** — install commands above, paste tokens.
2. **Mock data + state hook** — drop in `lib/mock/`, build `useAppState()` and `useCurrentUser()`.
3. **AppShell, TopBar, BottomNav, ProfileDrawer skeleton** — the chrome.
4. **Screen 01 — Login** (5 min).
5. **Screen 02 — Onboarding** (15 min).
6. **Screen 03 — Lobby (Explore tab)** — the highest-traffic screen. Get this right.
7. **Screen 03 — Following + Nearby tabs** — same layout, different filtered data + empty states.
8. **Screen 04 — Other user profile** (`/u/[id]`).
9. **Screen 06 — Post Request sheet** — triggered from FAB.
10. **Screen 07 — Requests ledger**.
11. **Screen 08 — Request detail**.
12. **Screen 09 — Inbox**.
13. **Screen 11a — Profile drawer (full content)** — status toggles, area selector.
14. **Screen 05 — My profile** (`/me`).
15. **Screen 10 — Updates feed**.
16. **Screen 11b — Settings page**.
17. **DemoUserSwitcher** + polish: empty states, skeletons, toasts on actions.

## Demo flow (the "story" you're optimizing for)

This is the flow Antonio will walk the client through. Every screen must work in this order with **just clicking**, no manual data tweaks:

1. Open app → `/login` → tap "使用 LINE 登入" → fake login as `u-001 (你 / "Demo User")` → land on `/onboarding`.
2. Confirm nickname, pick area (信義區), bio, tap continue → land on `/lobby/explore`.
3. See ~8 users in 2-column grid. Tap "我在線" (I'm Online) pill → turns green.
4. Tap on **王小美** (`u-002`) → see her profile (`/u/u-002`). Tap "邀請" → toast "邀請已送出".
5. Tap back. Tap the center **+** FAB → Post Request sheet. Fill: area=信義區, type=After Party, count=2, note=" 信義區附近誰要喝一杯 ". Tap "發送需求".
6. Toast: "需求已發送". Sheet closes. Go to **Inbox** (bottom nav). See your new request at the top.
7. Long-press the top-left avatar → DemoUserSwitcher → switch to `u-002` (王小美).
8. Now logged in as 王小美. Go to **Requests** (bottom nav) → see Demo User's request in the ledger. Tap it → request detail.
9. Tap "我想加入" → toast "已表示興趣". Switch back to `u-001`.
10. Back in Inbox → tap your request → see 王小美 in the responders list. Tap Updates → see "王小美 responded to your request" notification.

If this entire flow works end-to-end with no console errors, the prototype is done.

## Design direction (see docs/design-tokens.md for exact values)

- Clean, generous whitespace.
- Soft, rounded cards (`rounded-2xl`).
- LINE-friendly: green CTAs (`#06C755`) only for primary actions; otherwise neutral.
- Status uses colored dots, not full pills, on cards (full pills on profile pages).
- iOS-style safe-area padding bottom (`pb-[max(env(safe-area-inset-bottom),1rem)]`).
- Soft shadows: `shadow-sm` on cards, no heavy elevation.
- Avatars are circular, always include initials fallback for missing images.

## Tone & copy

- All UI copy in **zh-Hant** by default. Use the strings in `lib/mock/i18n.ts`.
- Taiwan vocabulary, not mainland: "你" not "您", "影片" not "视频", traditional characters only.
- District names: 信義區, 大安區, 中山區, 松山區, 內湖區, 士林區, 萬華區, 西門町, 板橋區, 永和區.
- Names: realistic Taiwan names (王小美, 李小華, 陳怡安, 林佳穎...) — see `lib/mock/users.ts`.

## Acceptance criteria (we'll grade against these)

- [ ] `npm run dev` works with zero config.
- [ ] The 10-step demo flow above works end-to-end with no console errors.
- [ ] All 11 P0 screens are reachable.
- [ ] localStorage persists across reload — demo state survives a refresh.
- [ ] Reset Demo link in drawer wipes localStorage cleanly.
- [ ] Lighthouse Mobile Accessibility ≥ 90 on the lobby.
- [ ] No layout shifts on mobile viewport.
- [ ] All `<button>` and link elements have visible focus rings.
- [ ] zh-Hant renders correctly (no mojibake, font fallback covers all characters).

## Out of scope (don't build these)

- Real LINE OAuth / LIFF
- Supabase / any backend
- Realtime websockets (fake with setTimeout if you must)
- File uploads (avatars are mock URLs or initials)
- Admin pages (we'll deal with these later)
- i18n switching mid-session (zh-Hant only at runtime)
- Payments / LINE Pay
- Any test suite — this is a demo prototype

## Per-screen specs

Read `docs/screens/01-login.md` through `docs/screens/11-drawer-settings.md` for the detailed spec of each screen. Each spec includes layout, components used, mock data references, interactions, and per-screen acceptance criteria.

## When you're stuck

- For component variants, check `https://ui.shadcn.com/docs/components`.
- For Tailwind utilities, default to v3.4 conventions.
- If a mock data field is missing for something a screen needs, **don't invent it — leave a TODO comment and use a placeholder.** Antonio will fill it in.
- If a screen spec contradicts this CLAUDE.md, **this file wins.** Flag the contradiction in a comment.
