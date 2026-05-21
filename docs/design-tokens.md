# Design Tokens

Drop these into `tailwind.config.ts` and `src/app/globals.css`.

## Color palette

### Brand / Action

| Token | Hex | Use |
|-------|-----|-----|
| `brand-line` | `#06C755` | LINE official green. **Only** for LINE login CTA and "follow our LINE OA" affordances. |
| `brand-primary` | `#0F172A` | Primary buttons, active nav (zinc-900). |
| `brand-primary-fg` | `#FFFFFF` | Text on primary. |
| `brand-accent` | `#F59E0B` | Highlight / FAB ring on hover. Use sparingly. |

### Status (online_status colors)

| Token | Hex | Status | Label (zh-Hant) | Label (EN) |
|-------|-----|--------|-----------------|------------|
| `status-available` | `#10B981` (emerald-500) | available | 可接局 | Available to Join |
| `status-fill_spot` | `#F59E0B` (amber-500) | fill_spot | 可補位 | Can Fill Spot |
| `status-bring_people` | `#3B82F6` (blue-500) | bring_people | 可帶人 | Can Bring People |
| `status-busy` | `#6B7280` (gray-500) | busy | 忙碌 | Busy |

### Request type colors (used on chips and request cards)

| Type | Color | Label (zh-Hant) |
|------|-------|-----------------|
| `after_party` | `#A855F7` (purple-500) | After Party |
| `drinking` | `#F97316` (orange-500) | 喝一杯 |
| `fill_spot` | `#F59E0B` (amber-500) | 補位 |
| `last_minute` | `#EF4444` (red-500) | 臨時局 |
| `other` | `#6B7280` (gray-500) | 其他 |

### Neutrals (Tailwind defaults — reference)

- Background: `bg-white` / dark mode out of scope
- Card: `bg-white` with `border border-zinc-200`
- Muted text: `text-zinc-500`
- Dividers: `border-zinc-100`

## Typography

```css
font-family: 'Noto Sans TC', 'PingFang TC', 'Microsoft JhengHei', system-ui, -apple-system, sans-serif;
```

Add Google Fonts link in `src/app/layout.tsx`:
```html
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;600;700&display=swap" rel="stylesheet" />
```

Scale (Tailwind defaults are fine):
- `text-xs` (12px) — meta info, timestamps
- `text-sm` (14px) — body, card labels
- `text-base` (16px) — primary text
- `text-lg` (18px) — section headings
- `text-xl` (20px) — page titles
- `text-2xl` (24px) — hero (login, onboarding)

## Spacing

Stick to Tailwind defaults. Common card padding `p-4`, screen padding `px-4 py-3`.

## Radius

- Cards: `rounded-2xl`
- Buttons: `rounded-xl` (shadcn default is fine)
- Pills / chips: `rounded-full`
- Avatars: `rounded-full`

## Shadows

- Cards: `shadow-sm`
- Floating elements (FAB, toasts): `shadow-lg`
- No heavy shadows.

## Safe area

Add to `globals.css`:
```css
@layer utilities {
  .pt-safe { padding-top: max(env(safe-area-inset-top), 0px); }
  .pb-safe { padding-bottom: max(env(safe-area-inset-bottom), 0px); }
  .pl-safe { padding-left: max(env(safe-area-inset-left), 0px); }
  .pr-safe { padding-right: max(env(safe-area-inset-right), 0px); }
}
```

## Tailwind config snippet

```ts
// tailwind.config.ts (additions)
export default {
  theme: {
    extend: {
      colors: {
        brand: {
          line: '#06C755',
          primary: '#0F172A',
          'primary-fg': '#FFFFFF',
          accent: '#F59E0B',
        },
        status: {
          available: '#10B981',
          'fill-spot': '#F59E0B',
          'bring-people': '#3B82F6',
          busy: '#6B7280',
        },
        type: {
          'after-party': '#A855F7',
          drinking: '#F97316',
          'fill-spot': '#F59E0B',
          'last-minute': '#EF4444',
          other: '#6B7280',
        },
      },
      fontFamily: {
        sans: [
          'Noto Sans TC',
          'PingFang TC',
          'Microsoft JhengHei',
          'system-ui',
          '-apple-system',
          'sans-serif',
        ],
      },
      borderRadius: {
        '2xl': '1rem',
      },
    },
  },
}
```

## Viewport / device frame

For demo, wrap the app in a fixed-width container at desktop:

```tsx
// In src/app/layout.tsx, wrap children with:
<div className="mx-auto max-w-[420px] min-h-screen bg-white shadow-2xl relative">
  {children}
</div>
```

On real mobile, the `max-w-[420px]` simply fills the viewport.

## Icon set

`lucide-react`. Common ones:
- Home, Inbox, Bell, Plus, MapPin, Filter, Search, ArrowLeft, Menu, Settings, LogOut, Shield, UserPlus, UserCheck, UserX, MoreHorizontal, ChevronRight, Check, X
