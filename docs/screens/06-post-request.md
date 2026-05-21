# Screen 06 — Post Request (`/requests/new` OR Sheet from FAB)

## Goal
The most-used action in the product. Compose and post a meetup request in 10 seconds.

## Triggering
- **Primary trigger:** the center FAB in the bottom nav opens this as a `Sheet` (from the bottom, ~85% screen height).
- **Secondary trigger:** the `/requests/new` route renders the same content as a full page (for direct linking and the invite-dialog "+ 建立新需求" affordance).

Implement once as a `<PostRequestForm />` component used in both places.

## Layout (top → bottom, inside the sheet)

```
┌────────────────────────────────────────────┐
│  ─                                          │  ← sheet grab handle
│  發布需求                              [✕]   │
├────────────────────────────────────────────┤
│  區域                                       │
│  [信義區 ▾]                                 │  ← Select
│                                             │
│  類型                                       │
│  [After Party] [喝一杯] [補位] [臨時局] [其他]│  ← chip group, single-select
│                                             │
│  人數                                       │
│  [ - ]  2  [ + ]                            │  ← stepper, min 1 max 10
│                                             │
│  備註                                       │
│  ┌────────────────────────────────────┐    │
│  │ 說明你想找的人或場合...              │    │  ← Textarea, 4 rows
│  └────────────────────────────────────┘    │
│                                             │
│  自動下線時間：4 小時                        │  ← read-only info text
│                                             │
│  [        發送需求 (-1 點數)        ]       │  ← primary CTA, full width
└────────────────────────────────────────────┘
```

## Field details
- **區域** — `Select` populated with `TAIPEI_AREAS`. Default: `currentUser.defaultArea`.
- **類型** — visual chip group. Use `ToggleGroup` from shadcn (or roll your own with Button variants). Color the selected chip with the type color from `design-tokens`. Single-select.
- **人數** — stepper. Two icon buttons (`Minus`, `Plus`) + a centered number. Constrain 1–10.
- **備註** — `Textarea`, `maxLength={200}`, character counter underneath.

## Submit behavior
- Validation: type selected, count ≥ 1, area selected. Note is optional.
- On submit:
  1. Create a new `Request` with `creatorId = currentUserId`, `status = 'open'`, `createdAt = now`, `expiresAt = now + 4h`.
  2. Append to state.
  3. Decrement `currentUser.credits` by 1 (cosmetic).
  4. Close sheet (or `router.push('/inbox')` if full-page).
  5. Toast: 「需求已發送」.

## Components
- shadcn: `Sheet`, `Select`, `ToggleGroup`, `Button`, `Textarea`, `Label`
- lucide: `X`, `Minus`, `Plus`, `Send`

## Acceptance criteria
- [ ] Sheet opens from FAB.
- [ ] Form validates before enabling submit.
- [ ] Successful submit creates a request visible immediately in `/inbox` and `/requests`.
- [ ] Credits decrement by 1 and reflect in drawer/my-profile.
- [ ] Character counter on the note field.
