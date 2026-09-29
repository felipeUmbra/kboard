# Kboard — UX/UI Design Specification

The design system as implemented in `src/styles/`. Every colour value below is
**verified by `npm run a11y:contrast`** against every background it can appear
on, in both themes.

---

## 1. Design principles

1. **The board is the interface.** Chrome recedes; cards and columns carry the
   visual weight. No decorative gradients on working surfaces.
2. **Colour carries meaning, never decoration.** A hue is used because it
   encodes something (severity, card type, selection), not to fill space.
3. **Mobile is a primary target, not a fallback.** The mobile layout is a
   different design, not a squeezed desktop one.
4. **Every interactive element is reachable and visible without a pointer.**
5. **Motion is short and optional.** All of it respects
   `prefers-reduced-motion`.

---

## 2. Foundations

### 2.1 Spacing

A 4 px base scale. Only these steps are used, which keeps rhythm consistent.

| Token | Value | Typical use |
|---|---|---|
| `--space-1` | `0.25rem` | 4 px — icon gaps |
| `--space-2` | `0.5rem` | 8 px — tight padding |
| `--space-3` | `0.75rem` | 12 px — button padding |
| `--space-4` | `1rem` | 16 px — default gutter |
| `--space-5` | `1.25rem` | 20 px — modal body |
| `--space-6` | `1.5rem` | 24 px — section gap |
| `--space-8` | `2rem` | 32 px — large padding |
| `--space-10` | `2.5rem` | 40 px |
| `--space-12` | `3rem` | 48 px — login card |

### 2.2 Radii

| Token | Value | Use |
|---|---|---|
| `--radius-sm` | `4px` | Chips, badges, inputs |
| `--radius-md` | `8px` | Buttons, cards, rail strips |
| `--radius-lg` | `12px` | Modals |
| `--radius-xl` | `16px` | Login card |
| `--radius-full` | `9999px` | Pills, avatars, carets |

### 2.3 Typography

System font stack (no web font — zero network cost, native rendering):

```css
--font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
             "Helvetica Neue", Arial, sans-serif;
```

| Token | Size | Use |
|---|---|---|
| `--text-xs` | `0.75rem` (12px) | Badges, meta, kbd |
| `--text-sm` | `0.875rem` (14px) | Secondary text, inputs |
| `--text-base` | `1rem` (16px) | Body |
| `--text-lg` | `1.125rem` (18px) | Topbar brand, modal titles |
| `--text-xl` | `1.25rem` (20px) | Emphasis |
| `--text-2xl` | `1.5rem` (24px) | Board title, login title |
| `--text-3xl` | `1.875rem` (30px) | Hero |

Monospace is used only inside `<kbd>` for shortcut keys.

### 2.4 Motion

| Token | Duration | Easing |
|---|---|---|
| `--motion-fast` | `120ms` | `cubic-bezier(0.2, 0, 0.2, 1)` |
| `--motion-base` | `200ms` | same |
| `--motion-slow` | `320ms` | same |

Under `prefers-reduced-motion: reduce`, all animation and transition durations
collapse to `0.01ms` and `scroll-behavior` becomes `auto`.

### 2.5 Z-index and layers

| Token | Value | Layer |
|---|---|---|
| `--z-drawer` | `40` | Mobile sidebar + backdrop |
| `--z-modal` | `50` | Card editor, dialogs |
| `--z-toast` | `60` | Banners, update/install toasts |
| `--z-drag` | `100` | Drag overlay, column-target overlay |

### 2.6 Touch target

`--tap-target: 44px` — the WCAG 2.5.5 floor (the AAA target).

---

## 3. Colour

### 3.1 How contrast is verified

Every foreground token is checked against **every background it can appear
on**, in both themes. The light theme's binding constraint is
`--color-bg-elevated` (`#ebecf0`) — which is *darker* than white, so a token
can pass on white and fail on elevated. Checking against white alone is a
common and consequential error.

Thresholds: **4.5:1** for text, **3:1** for non-text (borders, focus rings,
stripes, graphical indicators).

### 3.2 Surfaces and text

| Token | Light | Worst ratio | Dark | Worst ratio |
|---|---|---|---|---|
| `--color-bg` | `#f4f5f7` | — | `#1d2125` | — |
| `--color-surface` | `#ffffff` | — | `#22272b` | — |
| `--color-bg-elevated` | `#ebecf0` | — | — | — |
| `--color-text` | `#172b4d` | **11.95:1** | `#b6c2cf` | **8.33:1** |
| `--color-text-muted` | `#526075` | **5.41:1** | `#8c9bab` | **5.31:1** |
| `--color-text-subtle` | `#4c5a6c` | **5.96:1** | `#8c9bab` | **5.31:1** |
| `--color-border` | `#dfe1e6` | — | `#3d444b` | — |
| `--color-border-strong` | `#c1c7d0` | — | `#4d555e` | — |

### 3.3 Brand and status colours

| Token | Light | Worst | Dark | Worst |
|---|---|---|---|---|
| `--color-accent` | `#005b93` | **6.10:1** | `#4c9aff` | **5.29:1** |
| `--color-danger` | `#c62828` | **4.76:1** | `#ff9e99` | **7.61:1** |
| `--color-success` | `#276b2b` | **5.52:1** | `#66bb6a` | **6.38:1** |
| `--color-warning` | `#9c4f00` | **5.04:1** | `#ffd54f` | **10.68:1** |

Each has a `-hover` (darker in light, lighter in dark) and a `-soft` variant
(15% alpha in dark, a pale tint in light) for tinted backgrounds.

### 3.4 Inverse ("on-X") tokens — required for solid fills

Text on a solid brand fill **inverts between themes**, because the dark-theme
accents are light pastels:

| Token | Light value | On | Dark value | On |
|---|---|---|---|---|
| `--color-on-accent` | `#ffffff` | `#005b93` — **7.20:1** | `#172b4d` | `#4c9aff` — **4.95:1** |
| `--color-on-success` | `#ffffff` | `#276b2b` — **6.51:1** | `#172b4d` | `#66bb6a` — **5.96:1** |
| `--color-on-danger` | `#ffffff` | `#c62828` — **5.62:1** | `#172b4d` | `#ff9e99` — **7.12:1** |

> **This is not theoretical.** A hardcoded `#fff` on the accent fill measures
> 7.20:1 in light and only **2.85:1 in dark** — a live AA failure in the
> topbar, the mobile rail badges and comment avatars. A single `--color-on-accent`
> token makes the correct choice unavoidable.

### 3.5 Card type colours

Card types use a foreground + a soft tint. The foreground must clear 4.5:1 on
**both** its own tint (the `TypeChip`) and `--color-bg-elevated` (the sidebar).

| Type | Foreground | Soft tint | On tint | On elevated | Icon |
|---|---|---|---|---|---|
| Epic | `#7b3fb0` | `#f3e8fd` | 5.59:1 | 5.59:1 | ◆ |
| Story | `#15703f` | `#dffbe8` | 5.58:1 | 5.20:1 | ★ |
| Task | `#4a5769` | `#e9eaee` | 6.11:1 | 6.22:1 | ● |

All three were re-pitched during the WCAG audit: story was previously
`#4bce97`, which managed only **1.81:1** on its own tint.

### 3.6 Label palette

Twelve colours, each verified to reach ≥ 4.5:1 against **at least one** of the
two foregrounds the chip renderer picks between (`#172b4d` / `#ffffff`).

| Colour | Hex | Best ratio | Foreground |
|---|---|---|---|
| green | `#61bd4f` | 5.98:1 | dark |
| yellow | `#f2d600` | 9.67:1 | dark |
| orange | `#ff9f1f` | 6.87:1 | dark |
| red | `#d03a3a` | 4.83:1 | white |
| purple | `#c377e0` | 4.72:1 | dark |
| blue | `#0079bf` | 4.68:1 | white |
| cyan | `#00c2e0` | 6.58:1 | dark |
| lime | `#51e898` | 8.96:1 | dark |
| pink | `#ff78cb` | 5.91:1 | dark |
| dark | `#344563` | 9.64:1 | white |
| grey | `#b3bac5` | 7.22:1 | dark |
| gold | `#fbd86f` | 10.18:1 | dark |

### 3.7 Foreground selection

`pickForeground(hex)` computes real WCAG relative luminance and returns
whichever of near-black / white scores higher.

**Known limitation:** two fixed candidates cannot clear 4.5:1 for *every*
colour. In the greyscale band **#77–#91** the best achievable is ~3.8:1. This
is why the palette above is restricted to hues outside that band, and it is
the real reason the function guarantees "always the better of the two" rather
than "always AA".

### 3.8 Focus ring

```css
--focus-ring: 0 0 0 2px var(--color-accent-soft),
              0 0 0 4px var(--color-accent);
```

A two-tone ring, so it stays visible on both light and dark surfaces.

> **Global rule:** `global.css` sets `:focus { outline: none }` deliberately,
> because a ring on mouse click is noise. The trade-off is that **any element
> needing a visible ring must define its own `:focus-visible` rule**. Elements
> with transparent backgrounds — the mobile column rail strips — need an
> explicit `outline`, because a `box-shadow` ring on transparency is invisible.

### 3.9 The colour literal rule

`npm run lint:colors` fails the build if a hex literal appears in `src/`
outside `tokens.css` and a documented allowlist (the two user-chosen colour
palettes, the Google brand mark, inline SVG glyph fills, and test fixtures).
This is what stops an unverified colour reaching the UI.

---

## 4. Components

### 4.1 Buttons

| Variant | Background | Text | Use |
|---|---|---|---|
| `.btn` | `--color-surface` | `--color-text` | Default |
| `.btn--primary` | `--color-accent` | `--color-on-accent` | Main action |
| `.btn--danger` | `--color-danger` | `--color-on-danger` | Destructive |
| `.btn--ghost` | transparent | inherits | Toolbar, topbar |
| `.btn--full` | — | — | Width 100% |

Base height is 36 px on pointer devices; **44 px under
`@media (pointer: coarse)`**, where touch accuracy matters and density does
not. Width is also floored at 44 px there, because an icon-only button (the
modal close) is content-sized and would otherwise fail on the narrow axis.

### 4.2 Inputs

`.input`, `.textarea`, `.select` — 1 px border, `--radius-md`, focus shown as
an accent border plus a 3 px `--color-accent-soft` halo. Also 44 px tall on
touch pointers.

### 4.3 Cards

```
┌────────────────────────────────┐
│▎ Story              ⋮          │  3 px type stripe on the left edge
│  Fix login redirect             │
│  🏷 bug  🏷 auth      📅 12 Oct  │
│  ☐ 2/5  👤 3  💬 2              │
└────────────────────────────────┘
```

The stripe is 3 px, so it only needs the 3:1 non-text threshold — but it uses
the same type colour as the text, which does clear 4.5:1 anyway.

### 4.4 Mobile column rail

Each column becomes a **56 px × 112 px** vertical strip: the name is written
top-to-bottom (`writing-mode: vertical-rl`), the card count sits at the bottom
in normal horizontal orientation. The active strip gets
`--color-accent-soft` background and `--color-accent` text.

The count badge on the active strip is a solid accent fill and therefore uses
`--color-on-accent`.

### 4.5 Modals

Desktop: centred, `--radius-lg`, `--z-modal`. Mobile: a full-height
**bottom sheet** with `padding-bottom: max(space-4, env(safe-area-inset-bottom))`
and a `sheet-up` animation.

### 4.6 Keyboard shortcuts panel

A `<details>` disclosure in the board and planner headers. A native element is
used because it is keyboard-operable, announces its expanded state, and works
before JavaScript runs. Collapsed by default so it costs no vertical space on
a dense board.

### 4.7 Skip link

Visually hidden until focused, then a real, 44 px-tall button pinned to the
top-left. Implemented with `clip` / `clip-path` and **no negative margin** — see
[App Flow §9.1](./APP-FLOW.md#91-skip-link) for why the conventional recipes
break keyboard access.

---

## 5. Responsive strategy

Three layouts, chosen by width and pointer type.

| | Mobile | Tablet | Desktop |
|---|---|---|---|
| Breakpoint | `< 768px` | `768–1279px` | `≥ 1280px` |
| Sidebar | 56 px icon rail, expandable drawer | Collapsible rail | Full, persistent |
| Board | Vertical column rail, one column at a time | Columns side-by-side, scroll | Columns side-by-side |
| Modal | Bottom sheet, full height | Centred dialog | Centred dialog |
| Tested at | 360×800 (20:9) | 768×1024 | 1280×800 |

**Mobile layout invariants** (all covered by e2e tests):

- The layout fills the whole screen — no gap at the right edge or bottom.
- The topbar and the rail always cover their full area, including under a
  notch, via `env(safe-area-inset-*)`.
- Modals fit the viewport.

**Pointer queries are used for interaction density, not just width.**
`@media (pointer: coarse)` raises tap targets without inflating the desktop
layout, which keeps a mouse user from getting a needlessly sparse toolbar.

---

## 6. Dark mode

Implemented as a `@media (prefers-color-scheme: dark)` override of the same
custom properties, so no component needs a dark-specific rule.

Two classes of value change:

1. **Foreground hues re-pitch.** The dark theme uses *lighter, desaturated*
   versions of the same hue families, because a light-theme red on a dark
   surface under-reads.
2. **Inverse tokens flip.** `--color-on-accent` goes from white to near-black,
   because the dark accent is a light blue.

Dark surfaces are `#22272b` (surface) and `#1d2125` (background); shadows are
strengthened rather than removed, since a shadow is nearly invisible on a dark
surface.

---

## 7. Known trade-offs

| Decision | Trade-off |
|---|---|
| `--color-warning: #9c4f00` | Reachable at 4.5:1 but reads browner than the original `#f2d600`. The lighter ambles tested (`#f57f17` → 2.65:1) fail outright. |
| AAA 7:1 not the default | Forcing it on every token requires `#743a00`, which reads as brown. AAA is opt-in per team. |
| 36 px buttons on desktop | Denser toolbar; the cost is that a mouse user gets smaller targets than a touch user. Accepted. |
| Clipped skip link | Needs a `1px` box on screen; a `display: none` approach would be simpler but breaks the tab order. |
| Three colour palettes | `tokens.css`, `CARD_TYPE_META` and `COLOR_PALETTE` are separate because two of them are user-chosen data. All three are contrast-checked; the risk is that a future edit forgets the fourth palette. Mitigated by the literal linter and the contrast script. |

---

## 8. Related documents

- [PRD](./PRD.md)
- [TRD](./TRD.md)
- [App Flow](./APP-FLOW.md)
- [Data Model](./DATA-MODEL.md)
