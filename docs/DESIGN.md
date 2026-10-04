# Shadow design system

Binding for every human and agent who builds UI in `apps/web`. Tokens live in
`apps/web/src/app/globals.css`, primitives in `apps/web/src/components/ui`, brand in
`apps/web/src/components/brand`, voice visuals in `apps/web/src/components/voice`.

## Direction: the operations desk at night

Shadow sits beside an expert, stays quiet while they work, asks why at the right moment, and
later teaches a newcomer. The interface should feel like that desk: calm, lit by one lamp, with
the evidence laid out in order. Editorial rather than dashboard: generous space, a precise grid,
type doing the work instead of boxes and gradients.

- **Deep ink, warm paper.** Dark mode is the native mode: blue-black ink (`#0d1720`) with
  paper-white text (`#ece5d6`). Light mode is ink on newsprint (`#f2f1ec` / `#13202b`), not cream.
- **One signal.** Sodium amber (`#f0b44c` dark, `#e9a93c` fill / `#8f5300` text light), the
  colour of a desk lamp at night. It means exactly two things: *Shadow is listening or asking*,
  and *a guardrail moment*. Never use it for emphasis, links, buttons or decoration.
- **Evidence in mono.** Timestamps, frame references, keys and quote metadata use the mono face.
  Everything else does not.
- **The expert's voice in serif italic.** Quotes from the expert are set in the display serif,
  italic. It makes the source of a rule visible at a glance.

## Type

| Role | Face | Why |
| --- | --- | --- |
| Display, quotes | **Newsreader** (Production Type), optical sizes, roman + italic | Drawn for reading news on screens. Editorial without being a fashion serif; the italic carries the expert's words. |
| Text, UI | **Atkinson Hyperlegible Next** (Braille Institute) | Humanist, built so similar glyphs (`Il1`, `O0`) never blur. Support agents read fast under pressure; newcomers read unfamiliar terms. |
| Evidence | **Atkinson Hyperlegible Mono** | Same family as the text face, so timestamps sit quietly next to prose. |

All three load through `next/font/google` in `app/layout.tsx` as CSS variables and are exposed as
`font-display`, `font-sans` (default) and `font-mono`.

Banned: Inter, Roboto, Arial, Space Grotesk, Geist, system-default stacks as a design choice.

Scale: display headings 2.75rem → 4.5rem (hero), section headings 2rem → 2.5rem, body 0.9375–1.125rem
at `leading-relaxed`. Line length under 80 characters (`max-w-[36ch]`–`[42ch]` for columns,
`34rem` for lead paragraphs). Sentence case everywhere. No all-caps labels, no tracked-out eyebrows.

## Colour tokens

Use the Tailwind utilities; they switch with the scheme by themselves, so no `dark:` prefix is
needed for them.

| Utility | Use |
| --- | --- |
| `bg-canvas` | page |
| `bg-surface` | cards, panels |
| `bg-sunken` | footers of panels, wells |
| `border-rule`, `border-rule-strong` | hairlines, control borders |
| `text-ink`, `text-ink-muted`, `text-ink-faint` | primary, secondary, metadata (all AA on canvas and surface) |
| `bg-signal`, `text-signal-text`, `bg-signal-wash`, `text-signal-ink` | **only** listening/asking and guardrails |
| `text-ok` / `bg-ok-wash`, `text-stop` / `bg-stop-wash` | status: passed / blocked |
| `rounded-control`, `rounded-panel`, `rounded-pill` | radius by role, not one radius for everything |
| `shadow-raised` | only when something truly sits above other content |

Scheme: follows the OS. `data-theme="light" | "dark"` on `<html>` forces one (also honoured by
`dark:` variants). All text pairs were checked for WCAG AA (4.5:1) in both schemes.

## Primitives (`@/components/ui`)

- `Button` (`variant`: primary / secondary / ghost, `size`: sm / md / lg) and `ButtonLink` for
  navigation that looks like a button. Primary is ink, not the signal.
- `Card` (`elevation`: flat / raised, `padding`), `Badge` / `Chip` (`tone`: neutral / muted /
  signal / ok / stop, optional `dot`), `Stat` + `StatGroup` (a real figure and what it counts),
  `SectionHeading`, `KeyboardKey`, `Reveal` (one-time reveal on scroll), `cx`.

Voice (`@/components/voice`):

- `VoiceOrb` `{ state: "idle" | "listening" | "speaking" | "off-record"; level?: number }`.
  Client-only: load it with `dynamic(() => import("@/components/voice/VoiceOrb"), { ssr: false })`
  from a client component, with `OrbFallback` as the loading state. It renders on demand, pauses
  off screen and in hidden tabs, caps DPR at 1.75, and falls back to the static SVG `OrbFallback`
  without WebGL or with reduced motion. Pass a real `level` (0..1) from the audio pipeline when
  you have one; without it, listening and speaking use a gentle synthetic level.
- `OrbStateDemo`: the landing-page orb with a state switcher.
- `SplineScene` `{ label }`: renders a Spline scene only if `NEXT_PUBLIC_SPLINE_SCENE_URL` is set.

### Optional Spline scene

`NEXT_PUBLIC_SPLINE_SCENE_URL` (optional, public, inlined at build time): an `https://` URL to a
published Spline scene (`.splinecode`). Unset or invalid → `SplineScene` renders nothing. It is
not yet in `.env.example` or `apps/web/src/env.ts`; add it to both in a shared-change PR before
relying on it (AGENTS.md §1).

## Rules

Layout
- Left-aligned, asymmetric 12-column grid (`max-w-6xl`, 16px gutters on phones, 24px from `sm`).
  Collapse to one column below `md`/`lg`. No horizontal scroll at 390px.
- Structure carries information: hairline rules separate chapters; numbers only for a real
  sequence (Capture → Map → Teach). No three identical cards in a row, no bento grids.
- Cards only when the content is an object (a transcript, a ticket). Most grouping is space and rules.

Motion
- Motion only where it carries meaning: a state change (orb, toggles) or one orchestrated reveal
  per page. No hover lifts, no perpetual shimmer, no parallax, no animated gradients.
- Enter 0.6s `ease-arrive`; exits faster. Transform and opacity only.
- `prefers-reduced-motion`: the orb becomes static SVG, `Reveal` renders immediately.

Accessibility
- One focus ring everywhere: 2px outline in `--desk-focus` (ink in light, amber in dark), 3px offset.
- Hit areas at least 40px (44px for md/lg buttons and nav). Icons are decorative next to text.
- State is always in words too (`ORB_STATE_LABEL`, `aria-pressed`, `aria-live` captions); colour never carries meaning alone.

Copy
- Plain, specific, calm. Say what happens: "Start a capture session", not "Get started".
- Banned words: seamless, elevate, unleash, revolutionary, supercharge, next-gen, magic, AI-powered.
- No emoji. No `→` appended to links. No "A · B · C" meta strings.

Anti-slop checklist (before every UI PR)
- [ ] No gradient text, no purple-blue gradients, no glassmorphism, no glow shadows.
- [ ] Signal amber appears only for listening/asking or a guardrail.
- [ ] No Inter/Roboto/Arial/Space Grotesk/Geist; no all-caps labels; no single accented word in a headline.
- [ ] Real content, not lorem or "John Doe"; demo data comes from `seed/`.
- [ ] Light and dark both checked; 390px checked; keyboard-only pass done; reduced motion checked.

## Sources

Rules were distilled from, and deliberately depart from, these skills:

- [anthropics/skills, frontend-design](https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md):
  ground the design in the subject, one bold element, sequence numbers only for sequences,
  no all-caps eyebrows, one orchestrated motion moment, copy in plain active voice.
- [Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill): one accent with saturation
  under control, no AI purple, no gradient text, no 3-equal-card rows, `min-h-dvh`, transform-only
  animation, banned filler words. We ignore its serif ban for software: Shadow is editorial.
- [nextlevelbuilder/ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill):
  accessibility first (4.5:1, visible focus, 44px targets), motion must express cause and effect,
  exit faster than enter, check dark mode contrast separately, semantic tokens over ad-hoc colours.
