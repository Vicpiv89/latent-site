# LATENT — SITE STYLE GUIDE (design system v3)

**Owner:** D1. **Source:** `site/styles.css`. **Live reference:** `site/assets/preview.html`
(open it — every class below is rendered there, with a theme toggle).

**The rule:** page files contain **no colours, no fonts, no shadows, no border-radius,
no font-size literals**. Use the classes and tokens here. Need something that does not
exist? Append a request line to `WARNINGS.md` addressed to D1 and it lands same-day.

---

## 1. Tokens

### Brand constants (never themed, never overridden)
| Token | Value | Use |
|---|---|---|
| `--sky` | `#8B93F8` | indigo-300 — accent on dark grounds |
| `--sky-bright` | `#A5ABFB` | hover on dark |
| `--sky-ink` | `#4F46E5` | indigo-600, 6.29:1 on white — accent on light grounds |
| `--indigo-950` | `#1E1B4B` | deep indigo ground |
| `--carbon` | `#0F1020` | indigo-tinted near-black — ground and chrome |
| `--white` | `#FFFFFF` | |
| `--amber` | `#FFD24A` | **warnings only.** Thin samples, coverage gaps, stated limits. Never decorative. |

Indigo and ink only, plus amber for warnings. Do not introduce another colour.

> **Heads-up on the token names.** `--sky`, `--sky-ink` and `--carbon` kept their
> names through the 2026-08-15 palette change but now hold indigo values. The names
> lie about their contents. They were not renamed because pages consume the semantic
> tokens (`--accent`, `--bg`, `--ink`), not these, so a rename is cosmetic churn with
> real breakage risk. Read the value, not the name.

### Semantic tokens (these are what you actually use)
`--bg` · `--surface` · `--surface-2` · `--ink` · `--ink-2` · `--ink-3` ·
`--line` · `--line-strong` · `--accent` · `--accent-hover` · `--on-accent` ·
`--warn-ink` · `--warn-bg` · `--shadow` · `--focus`

They resolve differently per theme and per band, which is the whole point: write
`color: var(--ink-2)` and it stays correct on ink, on paper and on the indigo band.

### Type
| Token | Face | Use |
|---|---|---|
| `--f-mark` | Inter (variable 100–900) | the wordmark |
| `--f-head` | Inter | all headlines |
| `--f-label` | Inter | eyebrows, labels, buttons, table headers |
| `--f-body` | Inter, falling back to IBM Plex Sans | body |
| `--f-num` | IBM Plex Mono 500/600 | **every figure**, always tabular |

Kanit, Saira and Barlow Condensed were dropped on 2026-08-15 when the type roles
moved to Inter — no stack referenced them, so their `@font-face` blocks and six
woff2 files were deleted rather than left to rot.

Sizes: `--t-3xs` 11 · `--t-2xs` 12 · `--t-xs` 13 · `--t-sm` 14 · `--t-md` 16 ·
`--t-lg` 18 · `--t-xl` 21 · `--t-2xl` 26 · `--t-3xl/4xl/5xl/6xl` fluid clamps.

Space (4px base): `--s1` 4 → `--s10` 128. Use these, not raw px.

Geometry: `--radius` **10px** · `--radius-ctl` 8px (form controls) ·
`--lean` **0deg** — the forward lean was retired with the italic on 2026-08-15 ·
`--wrap` 1180px.

`font-variant-numeric: tabular-nums` is set on `body` — every number on the site is
already tabular. Do not undo it.

---

## 2. Themes and bands

**Default theme is carbon (dark).** A viewer whose OS asks for light gets a fully
designed paper variant — not an inversion. `data-theme="light|dark"` on `<html>`
pins it either way, for a toggle. `color-scheme` is set in both, so form controls
and scrollbars follow.

**Bands re-scope the tokens.** Wrap a section in one and every component inside it
renders correctly with no further work:

| Class | Ground | When |
|---|---|---|
| `.band` | current theme | default |
| `.band-carbon` | ink `#0F1020`, always | data-dense sections, in either theme |
| `.band-sky` | deep indigo `#1E1B4B` + two soft radial washes | hero and one or two feature bands per page |
| `.band-paper` | paper `#F7F8FC`, always | long-form reading (methodology, report bodies) |

The band class names predate the palette change and no longer describe their colours —
`.band-sky` is indigo, `.band-carbon` is indigo-tinted near-black. Renaming them would
touch every page D2–D5 shipped, so they were left alone.

> **Contrast rule, non-negotiable:** never set a colour by hand on a band — take the
> ink from the band's tokens. The old bright-sky ground could not carry white type
> (2.77:1, failing AA and the 3:1 large-text floor); the deep indigo band carries it at
> **15.99:1**, which is why the ground went darker rather than the type going carbon.

---

## 3. The shell

Copy the three blocks from **`site/assets/shell.html`** verbatim: `<head>`, the
nav at the top of `<body>`, the footer at the end. Replace `{ROOT}` with `""` at
site root or `"../"` inside `site/players/` and `site/reports/`. Set
`aria-current="page"` on the current nav link.

Nav and footer are carbon in every theme — the shell is identical on every page.

**Fonts are vendored in `site/assets/fonts/` (248 KB, latin + latin-ext, OFL) —
Inter variable plus IBM Plex Sans/Mono. Never add a `fonts.googleapis.com` link, or
any other external request.**

---

## 4. Components

### Section headers
```html
<section class="section">
  <div class="wrap">
    <div class="section-head">
      <span class="eyebrow">01 — Label</span>
      <h2>Headline</h2>
      <p class="lede">One sentence of context.</p>
    </div>
    …
  </div>
</section>
```
`.section-tight` for less vertical air. `.section-head-split` puts controls on the
right of the heading. `.eyebrow-plain` drops the leading bar.

### Layout
`.wrap` (1180px) · `.wrap-narrow` (760px) · `.grid` + `.cols-2/3/4/auto` ·
`.split` (1.15fr / .85fr) · `.row` · `.stack` · `.stack-lg`.
All collapse to one column at 760px automatically.

### Stat tiles
```html
<div class="tiles">
  <div class="tile"><span class="figure">199,050</span><span class="caption">Stat rows</span></div>
  <div class="tile tile-accent"><span class="figure">7</span><span class="caption">Competitions</span><span class="sub">2020–2026</span></div>
</div>
```
`.figure` is already mono + tabular. `.figure .unit` for a trailing unit.
`.figure-hero` for a single oversized counter.

### Data tables
```html
<div class="tbl-wrap">
  <table class="tbl tbl-zebra tbl-hover">
    <caption>Title <span class="cap-note">Cohort and caveat.</span></caption>
    <thead><tr><th class="rank">#</th><th>Player</th><th class="n">Level</th></tr></thead>
    <tbody>
      <tr><td class="rank">1</td>
          <td class="who">Name<span class="sub">Club · 21</span></td>
          <td class="n">84</td></tr>
    </tbody>
    <tfoot><tr><td colspan="3">Footnote.</td></tr></tfoot>
  </table>
</div>
```
- **Always** wrap in `.tbl-wrap` — that is what keeps wide tables off the page's
  horizontal scrollbar at 390px.
- `.n` on a cell **and** its header = right-aligned tabular figure.
- Modifiers: `.tbl-zebra` `.tbl-hover` `.tbl-compact` `.tbl-flush` `.tbl-sticky`.
- Sortable: put `<button class="sort" aria-sort="ascending|descending|none">` inside
  the `<th>`; the arrow is drawn from `aria-sort` so screen readers get it free.
- Matrix cells: `.cell-yes` `.cell-part` `.cell-no` (single hue — no red/green).

### Percentile bars
```html
<div class="pbars">
  <div class="pbar" data-tier="elite" style="--w:94%">
    <span class="pb-label">Progressive carries</span>
    <span class="pb-value">4.10</span>
    <span class="pb-track"><span class="pb-fill"></span></span>
    <span class="pb-pct">94</span>
  </div>
</div>
<div class="pbar-scale"><span>0</span><span>25</span><span>50</span><span>75</span><span>100</span></div>
```
- Width comes from the `--w` custom property. D6's motion.js animates it from 0.
- `data-tier="elite|high|mid|low"` — thresholds are the page's call; the ramp is one
  hue at four opacities, so it survives greyscale and colourblindness.
- `data-sample="thin"` turns the track border amber and appends `*` to the figure.
  Use it for anything under a metric's minutes gate, and pair it with a
  `.callout-warn` explaining the gate. **This is the only decorative use of amber.**
- Under 620px the layout reflows to label/value over a full-width track.

### Chips and pills
`.chip` (leaning, solid accent) with `.chip-solid` `.chip-ghost` `.chip-warn`
`.chip-flat`. Chip content must be wrapped in a `<span>` — the outer element is
skewed and the inner one unskews it.
`.pill` is upright, for filter state and data labels (competition, position,
season). `aria-pressed="true"` or `.is-on` turns it on.

### Callouts
`.callout` (accent rule) · `.callout-warn` (amber — stated limits, thin samples,
coverage gaps) · `.callout-quiet`. Optional `.callout-title` line inside.
`dl.kv` for key/value receipt rows.

### Buttons
`.btn` · `.btn-ghost` · `.btn-sm` · `.btn-lg` · `.btn-block` · `.btn-square`
(no lean, for icon/toggle controls). **Wrap the label in a `<span>`** — same
skew/unskew reason as chips.

### Forms
`label.field` + `.field-label` + input, `.field-note` for help text, `.field-req`
for the required asterisk, `.search` for the search box, `.filters` for a filter bar.
Inputs use `--radius-ctl` (8px); everything else uses `--radius` (10px).

### Panels
`.panel` · `.panel-hard` (raised, soft drop shadow) · `.panel-flush` with
`.panel-head` / `.panel-body` / `.panel-foot`.
`a.panel` makes the whole card a link.

### Nav fragments
`.anchor-nav` (sticky section contents — D4's report viewer, D5's methodology;
`aria-current="true"` on the active link) · `.crumbs` · `.pager`.

### Utilities
`.mt0–mt7` `.mb0–mb6` `.tr` `.tc` `.flex-1` `.w-full` `.hide` `.hide-sm` `.only-sm`
`.num` `.num-strong` `.num-lg` `.num-xl` `.dim` `.nowrap` `.meta` `.note` `.label`
`.lede` `.sr-only` `.skip-link` `.rule` `.rule-strong`.

---

## 5. Motion contract (for D6)

- `[data-reveal]` starts hidden and offset; motion.js adds `.is-in` to reveal.
- Percentile fills read `--w`; animate by setting it from `0%` to the real value.
- Counters: write the real figure into the DOM at build time and count *up to* it,
  so JS-off and reduced-motion both show the true number.
- `prefers-reduced-motion: reduce` already kills every transition and animation
  globally and forces `[data-reveal]` visible. Do not re-implement that per effect.
- The shell adds `.js` to `<html>`; anything that needs JS should be gated on it.

---

## 6. Accessibility floor

- Focus is a 3px `--focus` outline at 2px offset, globally. Never remove it.
- Every page starts with the `.skip-link` and has one `<main id="main">`.
- Contrast, measured on the current palette (2026-08-15): accent `#8B93F8` on ink
  **6.84:1** ✓ · ink on accent **6.84:1** ✓ · `--sky-ink` `#4F46E5` on white **6.29:1** ✓ ·
  amber on ink **13.06:1** ✓ · white on the indigo band **15.99:1** ✓ · band accent
  `#A5ABFB` on `#1E1B4B` **7.47:1** ✓ · `--ink-3` **6.01:1** dark / **4.83:1** light ✓.
  Every pair clears AA. The one forbidden pair is **amber as text on a light ground
  (1.44:1)** — on light, amber is a border or a chip background with dark text, which is
  what `.callout-warn` and `.chip-warn` already do.
- Colour is never the only signal: tiers carry a printed percentile, matrix cells
  carry a glyph, thin samples carry `*`.

---

## 7. Adding to the system

1. Check `preview.html` first — it probably exists.
2. If it does not, append to `WARNINGS.md`:
   `**D1 request (from D<n>):** need <thing> for <page> — <one line of why>.`
3. D1 adds it to `styles.css`, documents it here, renders it in `preview.html`,
   and replies in the same WARNINGS.md entry.

Do not fork the system in a page `<style>` block. One `<style>` block per page is
tolerated **only** for page-unique layout (grid template for one hero, say) and it
may use tokens only — never a raw colour, font or shadow.
