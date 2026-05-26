# DriftNote — Design

Source bundle: `~/Downloads/DriftNote/` (a Babel-in-browser React sketch). This doc captures the design language we're keeping when we port it to a real Astro app. The bundle has **no README** — the spec is `index.html` + the JSX files.

## Concept

DriftNote is _"a notebook that doesn't ask anything of you"_ (from `login.jsx`). The product is a single reverse-chronological **stream of ideas**, captured by voice or text, tagged with hashtags, and presented in an editorial / manuscript register — big serif headlines, mono labels, no card chrome, no folders, no nags.

## Type system

Three families, loaded from Google Fonts:

| Family         | Use                                 | Weights                    | Notes                                                                                    |
| -------------- | ----------------------------------- | -------------------------- | ---------------------------------------------------------------------------------------- |
| **Newsreader** | display / headlines / sidebar items | 300, 400, 500 (italic 400) | Optical sizes 6–72. Tight letter-spacing (`-0.01em`). Italic carries the editorial feel. |
| **Geist**      | UI body, buttons, masthead brand    | 300, 400, 500, 600         | Default `font-size: 13px`, `line-height: 1.55`.                                          |
| **Geist Mono** | metadata, kbd, side labels, search  | 400, 500                   | Always uppercase + wide letter-spacing (`0.06–0.10em`) when used as a label.             |

The masthead brand is Newsreader 22px italic; idea bodies are Newsreader at `--entry-body-size` (18 / 20 / 24px depending on density).

## Color system

Tokens live on `:root` (dark, default) and `body[data-theme="light"]`. The two themes share the same variable names so components don't branch on theme.

### Dark — "editorial dark"

| Token         | Value                         | Use                        |
| ------------- | ----------------------------- | -------------------------- |
| `--bg`        | `#0d1016`                     | page canvas                |
| `--bg-2`      | `#13171f`                     | masthead, sidebar          |
| `--surface`   | `#1a1e27`                     | cards, inputs              |
| `--surface-2` | `#232833`                     | hover                      |
| `--ink`       | `#ece6d6`                     | warm cream body text       |
| `--ink-2/3/4` | `#c8c3b6 / #8c8779 / #5f5b51` | secondary, tertiary, faint |
| `--rule`      | `rgba(236,230,214,0.08)`      | dividers                   |
| `--accent`    | `oklch(0.78 0.15 75)`         | warm goldenrod (avatar bg) |
| `--hot`       | `oklch(0.62 0.22 25)`         | recording indicator red    |

### Light — "whisper of lilac"

| Token      | Value                  | Use               |
| ---------- | ---------------------- | ----------------- |
| `--bg`     | `#fbfaff`              | page canvas       |
| `--bg-2`   | `#f3f1fa`              | masthead, sidebar |
| `--ink`    | `#16141d`              | near-black body   |
| `--accent` | `oklch(0.55 0.22 300)` | vivid lilac       |

## Tag colors (OKLCH)

This is the most distinctive part of the visual system. **Each tag has one number**: its **hue** (0–360 OKLCH). Cards, chips, sidebar dots, hashtag underlines, and margin "stamps" all derive their actual color from that hue plus a small set of per-theme L (lightness) and C (chroma) tokens.

```css
/* per-theme tokens */
--tag-fg-L: 0.82;
--tag-fg-C: 0.14; /* inline hashtags, sidebar dot */
--tag-stripe-L: 0.7;
--tag-stripe-C: 0.17; /* card left stripe */
--tag-tint-L: 0.22;
--tag-tint-C: 0.045; /* card bg tint */
--tag-mark-L: 0.72;
--tag-mark-C: 0.17; /* margin stamps, chip mark */
```

A card with primary tag `recipe` (hue 140) renders its stripe as `oklch(0.70 0.17 140)` and its tint as `oklch(0.22 0.045 140)` — so the whole card is the same hue at different L/C. Light theme uses higher L for tints (`0.96`) so the page stays bright.

**Tag palette** (defaults, from `data.jsx`):

| Tag      | Hue |     | Tag      | Hue |
| -------- | --- | --- | -------- | --- |
| gift     | 10  |     | reading  | 80  |
| side     | 30  |     | home     | 110 |
| product  | 50  |     | recipe   | 140 |
| question | 195 |     | research | 245 |
| travel   | 220 |     | writing  | 280 |
| music    | 320 |     | film     | 350 |

**Selectable hues** (color picker): `[10, 30, 50, 80, 110, 140, 170, 195, 220, 245, 280, 320, 350]` — 13 evenly distributed values that map cleanly to the chroma each theme supports.

## Density

`body[data-density]` controls spacing without changing colors or fonts:

| Density            | `--entry-gap` | `--entry-body-size` | `--entry-py` |
| ------------------ | ------------- | ------------------- | ------------ |
| `compact`          | 8px           | 18px                | 14px         |
| `cozy` _(default)_ | 12px          | 20px                | 18px         |
| `airy`             | 18px          | 24px                | 24px         |

## Layout

App grid (from `.app`):

```
┌─────────────────────────────────────────┐
│             masthead (56px)             │
├──────────┬──────────────────────────────┤
│          │                              │
│ sidebar  │       stream-wrap            │
│ (232px)  │                              │
│          │                              │
└──────────┴──────────────────────────────┘
```

`.app[data-sidebar="right"]` flips the columns; the masthead spans both.

## Component inventory (port targets)

| Source (JSX)     | Target                            | Type     | Notes                                                                            |
| ---------------- | --------------------------------- | -------- | -------------------------------------------------------------------------------- |
| `App`            | `pages/index.astro`               | page     | Static shell, hydrates Vue islands.                                              |
| `Login`          | `pages/login.astro`               | page     | Drop email/password + guest button for v1.                                       |
| Masthead         | `components/Masthead.astro`       | static   | Brand, date, counts, search slot, theme-toggle slot, avatar.                     |
| Sidebar sections | `components/Sidebar.astro`        | static   | Renders side items + tag list.                                                   |
| `SideTag`        | `components/islands/SideTag.vue`  | island   | Wraps the static dot+label, opens the color picker.                              |
| `ColorPicker`    | inside `SideTag.vue`              | island   | 13-hue swatch grid, escape/outside-click close.                                  |
| `Chip`           | `components/Chip.astro`           | static   | Stripe + label, dashed variant for suggestions.                                  |
| `IdeaBody`       | inline in `IdeaCard.astro`        | static   | Hashtag-aware text renderer, uses tag hue per `#xxx`.                            |
| `IdeaCard`       | `components/IdeaCard.astro`       | static   | Numbered (`№001`), tag stamps row, body, foot meta.                              |
| `DayGroup`       | `components/DayGroup.astro`       | static   | `<header>` + entries list.                                                       |
| `Composer`       | `components/islands/Composer.vue` | island   | Textarea autoresize, tag chips, voice button + waveform + transcript, `⌘↵` save. |
| `TweaksPanel`    | —                                 | **drop** | Design-tool only.                                                                |
| `useTweaks`      | —                                 | **drop** | Replace with user prefs (later) or localStorage (now).                           |
| `icons.jsx`      | `components/icons/*.astro`        | static   | Inline SVGs, no Vue.                                                             |

## Interaction details to keep

- **Hashtag-as-you-type** in the composer: regex `/#([a-z][a-z0-9_-]*)/gi`, lowercase. Render matched hashtags inside the textarea preview as underlined in their tag hue. Unknown hashtags show as plain underlines until a hue is assigned.
- **Suggested tags**: when text has no hashtags, surface up to 4 most-used existing tags as dashed chips below the textarea; clicking one appends `#tag ` to the text.
- **Filter chips strip** appears above the stream when any tag filter or search query is active. Includes a `Clear` button.
- **Day labels**: `Today`, `Yesterday`, then weekday name for <7 days, then `MMM d`.
- **Time labels** on cards: `just now` / `Nm ago` for <60min, otherwise localized `h:mm a`.
- **Empty state**: "Nothing here. Loosen a filter, or jot down what's on your mind."
- **Stream end**: literal `End of stream` separator at the bottom.
- **Voice toggle** keyboard shortcut: `M`. Save: `⌘↵`. Search focus: `/`.

## Tokens to copy verbatim

`styles.css` (29KB) is structured well and lifts cleanly. The plan is to copy it to `src/styles/driftnote.css` unchanged for v1 and only refactor if/when components diverge from the original markup. The token block at the top is the contract; everything else is consequence.

## What we're dropping

- The `__TWEAKS__` window global + edit-mode markers (`/*EDITMODE-BEGIN*/`).
- Babel-in-browser, React + ReactDOM via unpkg.
- Email/password fields on login.
- Guest mode banner / `showGuestBanner` (deferred to v2).
- `TweaksPanel` and all its toggles (theme + density + sidebar belong in real user settings, not a dev overlay).
- React `useState` for ephemeral UI state — replaced by Vue reactivity in the four islands.

## Open design questions for execution

1. **Hashtag highlight inside the textarea** — true contenteditable overlay or a "ghost" overlay div behind a transparent textarea? The design's React version doesn't actually highlight inside the textarea; it shows chips below. Decide whether to keep parity or upgrade.
2. **Tag rename / delete** — not in the design. Out of scope for v1 unless requested.
3. **Avatar** — design hardcodes `AK`. Real version: initials from `user.name`, fallback to email's first letter.
4. **Search scope** — design only searches `idea.body`. Add tag-name search? Not in v1.
