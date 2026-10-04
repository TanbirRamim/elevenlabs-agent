# Shadow design system, v2

Binding for every human and agent who builds UI in `apps/web`.

| What | Where |
| --- | --- |
| Tokens (colour, type, radius, shadow, motion) | `apps/web/src/app/globals.css` |
| Primitives | `apps/web/src/components/ui` (import from `@/components/ui`) |
| App shell, page frame, top-bar slots | `apps/web/src/components/shell` |
| Recording kit | `apps/web/src/components/recording` |
| Brand mark, marketing header | `apps/web/src/components/brand` |

v1 (serif headlines, cream paper on ink, one amber accent, magazine layout) is retired. It read
as a generated editorial template, not as a tool people trust with their screen and voice. v2
borrows from products that do: Linear and Vercel for the shell, density and keyboard;
Gong and Chorus for call review and timelines; Loom, Granola and Riverside for recording chrome;
Front, Plain and Zendesk Agent Workspace for support work surfaces; Notion and Linear docs for
structured documents.

## 1. Principles

1. **Calm.** Shadow sits beside an expert while they work. The UI stays quiet until something
   needs them: neutral surfaces, one brand colour, colour only when it means something.
2. **Precise.** A 4px grid, two type sizes per view, aligned edges, tabular figures. Nothing is
   placed by eye.
3. **Trustworthy.** Recording state, privacy state and Shadow's own state are always visible,
   always in words, never ambiguous. We never show a state we cannot back up.
4. **Information over decoration.** Every pixel shows data, a state or an action. No
   illustration, no hero art, no ornaments inside the app.
5. **Keyboard first.** Everything reachable by keyboard; frequent actions have shortcuts and
   show them.

## 2. Type

| Role | Face | Notes |
| --- | --- | --- |
| UI and text | **Inter** (variable, `opsz` axis) via `next/font/google`, `--font-inter` | `font-sans` (default). The display optical size applies at large sizes automatically. Features: `calt`, `cv11`. |
| Evidence | **Geist Mono** via `next/font/google`, `--font-geist-mono` | `font-mono`. Ids, timestamps, frame refs, keys, durations. |
| Quotes | none | No serif. Verbatim expert quotes are regular-weight sans with a 2px `border-rule-strong` left rule and curly quotes. |

`font-display` still exists and maps to Inter so old call sites keep working. Do not add new uses.

Figures: use the `.figures` utility (tabular, slashed zero) or `tabular-nums` for every timer,
count, amount and id column.

Scale (13px is the in-app default):

| Token | Size / line | Use |
| --- | --- | --- |
| `text-2xs` | 11 / 16 | group labels, kbd, dense metadata |
| `text-xs` | 12 / 16 | badges, table headers, captions, hints |
| `text-ui` | 13 / 20 | **default**: nav, controls, table cells, body in panels |
| `text-sm` | 14 / 20 | panel titles, reading text in dialogs |
| `text-base` | 16 / 24 | long reading text (quotes, transcripts) |
| `text-xl` | 20 / 28 | the page `h1` (`PageHeader`) |
| `text-2xl` | 24 / 32 | stat values |
| `text-5xl` | 48 | landing hero only (36px on phones) |

Weights: 400 body, 500 labels and controls, 600 headings and values. Sentence case everywhere.
No all-caps labels, no tracked-out eyebrows. Line length ≤ 75ch (`max-w-prose` / `max-w-2xl`).

## 3. Space, radius, elevation

- **4px grid.** Tailwind's spacing scale (`1` = 4px). Common steps: 4, 8, 12, 16, 24, 32.
  Gutters: 16px phones, 24px `sm`, 32px `lg` (`Page` applies them).
- **Radius by role:** `rounded-control` 6px (buttons, inputs, badges), `rounded-panel` 8px
  (cards, panels, tables), `rounded-overlay` 12px (dialogs, palette), `rounded-pill` (status pills only).
- **Borders over shadows.** Separation is a 1px `border-rule`. Shadows: `shadow-raised` (1px,
  controls only) and `shadow-overlay` (dialogs, popovers, toasts, the product frame on the
  landing page). Nothing else casts a shadow.

## 4. Colour

All colours are tokens; utilities switch with the scheme, so never write `dark:` for them.
Scheme follows the OS; `data-theme="light" | "dark"` on `<html>` forces one (theme toggle,
stored in `localStorage["shadow-theme"]`, applied before paint).

### Neutrals (zinc-like)

| Utility | Light | Dark | Use |
| --- | --- | --- | --- |
| `bg-canvas` | `#f7f7f8` | `#0c0c0e` | app frame, sidebar, marketing pages |
| `bg-surface` | `#ffffff` | `#131316` | content panel, cards, inputs |
| `bg-raised` | `#ffffff` | `#1a1a1e` | dialogs, palette, toasts |
| `bg-sunken` | `#f4f4f5` | `#0f0f11` | wells, table headers, panel footers |
| `bg-hover` / `bg-selected` | `#f0f0f2` / `#ebebee` | `#1c1c20` / `#232328` | row hover / current item |
| `border-rule` / `border-rule-strong` | `#e6e6e9` / `#d4d4d8` | `#24242a` / `#34343b` | hairlines / control borders |
| `text-ink` | `#18181b` | `#ededef` | primary text, primary button fill |
| `text-ink-muted` | `#52525b` | `#a1a1aa` | secondary text |
| `text-ink-faint` | `#6b6b74` | `#8b8b94` | metadata, placeholders |

Contrast (WCAG AA, 4.5:1) is verified for ink, ink-muted and ink-faint on canvas, surface and
sunken in both schemes. On `bg-selected` (light) use ink or ink-muted, not ink-faint.

### One brand colour: Shadow blue

`brand` = `#3b5bdb` (fill, both schemes; white text on it 5.7:1), brand text `#3b5bdb` light /
`#8ea2ff` dark, wash `#eef2ff` / `#191d33`.

The brand means **Shadow itself**: the mark, Shadow's avatar, and Shadow listening or asking
(the `ask` tokens are the brand). It is also the focus ring. It is **not** a "click here"
colour: primary buttons are ink, links are ink with an underline.

### Colour by meaning (strict)

| Meaning | Tokens | Badge tone | Never use it for |
| --- | --- | --- | --- |
| Shadow is listening or asking | `ask`, `ask-text`, `ask-wash` | `ask` | links, emphasis, selection |
| Recording is live | `rec`, `rec-text`, `rec-wash` | `rec` | errors, off the record, "important" |
| A guardrail held or blocked an action | `guard`, `guard-text`, `guard-wash` | `guard` | warnings about the app itself |
| Success, verified, confirmed | `ok`, `ok-fill`, `ok-wash` | `ok` | decoration; `ok-fill` is for dots and bars only (no text on it) |
| Error, destructive action, risk | `danger`, `danger-fill`, `danger-wash` | `danger` | recording |

Off the record is **neutral** (muted, `EyeOff` icon, "Not recording"), never red. State is
always written in words too; colour only reinforces it.

v1 names were renamed across the codebase: `signal*` → `ask*` (listening/asking) or `guard*`
(guardrails) by meaning, `stop*` → `danger*`, raw `--desk-*` → `--sd-*`.

## 5. Density

- Controls: 28px (`sm`) and 32px (`md`) tall; 40px on coarse pointers (`pointer-coarse:`) and
  for the landing `lg` buttons. Table rows 36px, header 32px. Sidebar items 32px.
- Panels pad 16px; dialogs 16px. Page sections are 24px apart, related blocks 12–16px.
- One page `h1` (20px). Section titles 14px semibold. If you reach for 28px+ inside the app, the
  hierarchy is wrong.

## 6. Motion

- 100ms (hover, press), 150ms (pop-in, fade), 200ms (sheet, progress). Nothing longer, except
  the recording pulse (1.6s loop) and loading shimmer, which show live state.
- Enter `ease-out` (`cubic-bezier(.2,0,0,1)`), exit `ease-in`, exits faster than enters.
  Transform and opacity only. No hover lifts, parallax, animated gradients or bouncing.
- `prefers-reduced-motion`: a global rule in `globals.css` stops loops and transitions; JS
  animation must check `useReducedMotion()`. State still changes, it just doesn't animate.

## 7. Iconography

lucide-react only. 16px in controls and nav, 20px in empty states, 12px in badges.
Stroke 1.5–1.75 (primitives set `stroke-[1.75]`). Icons next to text are `aria-hidden`; an
icon-only button is an `IconButton` with a required `label`. No emoji, ever.

## 8. Data display

- **Tables** (`Table`, `THead`, `TBody`, `Tr`, `Th`, `Td`): left-aligned text, right-aligned
  numbers (`numeric`), ids in mono (`mono`), hover row, `selected` row. No zebra stripes.
- **Stat tiles** (`StatGroup` + `Stat`): label on top (12px muted), value 24px semibold tabular,
  optional unit, note and delta. Real figures only.
- **Timelines** (steps, transcript, gate): time in mono in a fixed left column (48–56px), a 1px
  rule or connector, content to the right. Shadow's lines use `ask-text` and the Shadow avatar.
- **Progress** (`Progress`, task progress) vs **Meter** (`Meter`, a measurement such as mic
  level or coverage). 4–6px tall, no stripes or glow.

## 9. States

Every view that loads data designs all four:

| State | Pattern |
| --- | --- |
| Loading | `Skeleton` / `SkeletonText` in the shape of the content, inside `role="status" aria-busy` with an `sr-only` label. No full-page spinners. `Spinner` only inside a busy button. |
| Empty | `EmptyState`: what is empty, why, one next action. Left-aligned inside panels; centred only for a whole empty page. |
| Error | `Alert tone="danger"` with what failed, the real reason, and a retry or fix. Never a raw stack. |
| Offline / API down | `Alert tone="offline"` naming the URL that failed and how to fix it locally. |

## 10. Focus and keyboard

- One focus treatment: `:focus-visible` → 2px `--sd-focus` outline, 2px offset. Inputs use a
  border + 2px ring in the same colour. Never remove focus styles.
- Global shortcuts (owned by the shell): `⌘K` / `Ctrl K` command menu, `?` shortcuts help,
  `[` toggle sidebar, `G` then `C`/`M`/`T`/`P` go to Capture / Work Maps / Teach / Copilot.
  Single-key shortcuts are ignored while typing or when a dialog is open.
- Show shortcuts where the action lives: `Kbd` / `KbdCombo` in buttons, menus and tooltips
  (`Tooltip shortcut={["⌘","K"]}`). Add new global shortcuts to `shell/ShortcutsDialog.tsx`.
- Dialogs use the native `<dialog>` (`Dialog`, `Sheet`): focus trap, Escape and inert background
  come from the browser.

## 11. Layout

- **In-app routes** (capture, teach, map, copilot, desk, voice-check) render inside `AppShell`:
  240px sidebar on canvas, the page on an inset surface panel with a 48px top bar (breadcrumb,
  live status slot, page actions slot). Below `lg` the sidebar becomes a `Sheet`.
- Every in-app page: `<Page width>` → `<PageHeader title description actions>` → surface.
  Left-aligned. No centred marketing layouts inside the app.
- **Marketing routes** (`/`, `/demo`) use `SiteHeader` and the same tokens. Hero type max 48px.
- No horizontal page scroll at 390px. Tables scroll inside their container.

## 12. Never do

- Gradient text, gradient buttons, purple-blue gradients, glow blobs or glow shadows.
- Glassmorphism, backdrop blur, translucent panels.
- Emoji, decorative illustrations, 3D blobs as hero art.
- Oversized hero type inside the app; more than one `h1`; display serif headlines.
- Centred-everything marketing layouts inside the app; three identical feature cards as decoration.
- Brand blue for buttons, links or emphasis; red for anything but live recording or errors.
- Colour as the only carrier of state.
- Animations over 200ms, perpetual decorative motion, hover lifts.
- All-caps labels, tracked-out eyebrows, filler copy ("seamless", "supercharge", "AI-powered",
  "magic", "next-gen"). Say what happens: "Start a capture session", not "Get started".
- Lorem ipsum or invented records in product code; demo data comes from `seed/`.

## 13. Primitives (`@/components/ui`)

| Component | Notes |
| --- | --- |
| `Button` | `variant` primary (ink) / secondary / ghost / danger; `size` sm / md / lg; `icon`, `trailing` (e.g. `Kbd`), `loading` (spinner + `aria-busy`). Defaults to `type="button"`. `ButtonLink` for navigation. |
| `IconButton` | icon-only, required `label` (accessible name + native title). |
| `Input`, `Textarea`, `Select`, `Field` | 32px controls; `Field` renders label, hint, error and passes `id` / `aria-describedby` / `aria-invalid` to its render-prop child. `Select` is native. |
| `Badge`, `StatusPill` | tones `neutral muted ask rec guard ok danger`; `StatusPill live` pulses the dot (live states only). |
| `Kbd`, `KbdCombo` | `KbdCombo keys={["G","C"]} sequence` renders "G then C". `KeyboardKey` = `Kbd`. |
| `Card`, `Panel` | `Panel title meta actions footer flush` is a labelled `<section>`; use it for every work-surface block. |
| `Tabs` | ARIA tabs, underline style, arrows/Home/End, optional `count`. |
| `SegmentedControl` | ARIA radiogroup for 2–4 views or filters. |
| `Tooltip` | hover (300ms) and focus, Escape dismisses, optional `shortcut`. |
| `Dialog`, `Sheet` | native modal `<dialog>`; `Dialog placement="top"` for palettes; `Sheet side`. |
| `ToastProvider`, `useToast` | already mounted by the shell; `toast({ title, description, tone })`. |
| `Skeleton`, `SkeletonText`, `Spinner` | loading states. |
| `EmptyState`, `Alert` | empty / error / offline / guard notices. |
| `Stat`, `StatGroup` | stat tiles. |
| `Table`, `THead`, `TBody`, `Tr`, `Th`, `Td` | dense tables. |
| `Avatar` | initials; `shadow` renders Shadow in the brand colour. |
| `Separator` | hairline; `semantic` renders an `<hr>`. |
| `Progress`, `Meter` | progressbar (determinate or not) and meter (continuous or segmented). |
| `PageHeader`, `SectionTitle` | in-app page `h1` and section `h2`. `SectionHeading` is for marketing pages only. |
| `Reveal` | one-time 200ms reveal on marketing pages; never in the app. |

## 14. Shell (`@/components/shell`)

- `ShellGate` (root layout) picks `AppShell` or the marketing frame from the pathname
  (`isBareRoute`). Nav config lives in `shell/nav.ts` (`PRODUCT_NAV`, `TOOLS_NAV`); breadcrumbs
  come from `resolveCrumbs(pathname)`.
- `Page`: the `<main>` with gutters and width (`narrow` / `default` / `wide`).
- `TopBarActions`: portal page actions into the top bar (renders inline outside the shell).
- `TopBarStatus`: portal the live session status (e.g. `RecordingStatus`, `ListeningIndicator`).
- `useShell()`: `openPalette`, `openShortcuts`, `toggleSidebar` (null outside the shell).
- `useTheme()`: `pref`, `resolved`, `setPref`, `toggle`.
- `START_CAPTURE_HREF` (`/capture?intent=start`): what "Start a capture session" in the
  command menu opens. The Capture page should read `intent=start` and open its preflight.

## 15. Recording kit (`@/components/recording`)

Pure, presentational, controlled by props; the Capture page owns the state.

| Component | Props (short) |
| --- | --- |
| `RecordingBar` | `state` recording / paused / off-record / idle, `elapsedMs`, `level` 0–1, `onPause`, `onResume`, `onStop`, `onToggleOffRecord`, `offRecordShortcut`. Toolbar with REC pill (pulse only while recording), mono timer, 12-segment mic meter, live-region announcements on state change. |
| `RecordingStatus` | compact top-bar pill: "REC 04:12" / "Paused" / "Off the record" / "Not recording". |
| `PreflightChecklist` | `items` `{ id, label, status pending/ok/failed, detail, fixHint, action }`, `onRetry`. Usual ids `mic`, `screen`, `agent`, `redaction`. |
| `Countdown` | `from` (3), `onDone`, `onSkip`, `running`. Skippable (button, Enter, Escape), announces each number, no scale animation with reduced motion. |
| `ProcessingSteps` | `steps` `{ id, label, status waiting/running/done/failed/skipped, detail, progress }`. Usual ids `transcript`, `redaction`, `workmap`, `verification`. Honest failure state. |
| `ListeningIndicator` | `state` listening / asking / quiet / off, `compact`. |
| `PrivacyIndicator` | `redaction` active / pending / off, `offRecord`. |
| logic | `formatElapsed`, `levelToSegments`, `summarizePreflight`, `processingProgress`, `countdownReducer` (unit-tested). |

## 16. Before every UI PR

- [ ] Uses `Page` + `PageHeader` + primitives; no ad-hoc colours (`neutral-*`, `red-*`, hex).
- [ ] Colour used only by meaning (§4); state also in words.
- [ ] Loading, empty, error and offline states designed (§9).
- [ ] Keyboard-only pass; focus visible; shortcuts listed if added.
- [ ] Light and dark checked; 390px checked; reduced motion checked.
- [ ] Nothing from §12.
