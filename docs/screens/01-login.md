# Screen 01 — Login (`/login`)

## Goal
One-tap entry into the app via LINE. This is the first thing the client sees in the demo.

## Layout (top → bottom)
- Centered vertical column, lots of whitespace, no top bar, no bottom nav.
- Brand mark at top (text logo "Social Lobby" + tagline 「今晚一起出去吧」).
- Hero illustration placeholder (a simple SVG or `bg-zinc-100` rounded square — 240×240).
- Main CTA button: `使用 LINE 登入` — full width, `bg-brand-line text-white`, LINE logo to the left of text.
- Small subtext under CTA: 「一鍵登入，馬上找人一起出去」.
- Footer fine print: 「登入即表示你同意 服務條款 與 隱私權政策」 (links go nowhere in prototype).

## Components
- shadcn `Button` (size lg, full width, custom `bg-brand-line hover:bg-[#05B14C]`)
- `lucide-react` doesn't have a LINE logo — use the SVG below inline:
  ```tsx
  <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden>
    <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.135-.033.194-.033.21 0 .39.09.515.255l2.444 3.319v-2.94c0-.345.282-.63.633-.63.345 0 .626.285.626.63v4.765zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629zM24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314"/>
  </svg>
  ```

## Interactions
- Tap "使用 LINE 登入" → writes `currentUserId = "u-001"` to localStorage → `router.push('/onboarding')` if `localStorage.onboarded !== 'true'`, else `/lobby/explore`.
- No real OAuth. No loading state needed beyond a brief disabled state (~300ms).

## Mock data
None on this screen.

## Acceptance criteria
- [ ] CTA is the LINE green `#06C755`.
- [ ] Tap leaves a `currentUserId` in localStorage.
- [ ] First-time flow lands on `/onboarding`; returning flow lands on `/lobby/explore`.
- [ ] Renders cleanly inside a 390×844 viewport with no scroll.
