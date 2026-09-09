# QuestDB Web Console theming

This document is the contract for color in the Web Console. It explains the
palette, the surface hierarchy, the semantic meaning of every token, how
components bind to those tokens, and how a new component should choose colors.

The implementation lives in [`index.ts`](./index.ts). The palette is
intentionally flat: every color is `theme.color.tokenName`, grouped by comments
in the source. There are no nested color objects, and the only first-party CSS
custom properties are the `--qdb-*` properties generated from this palette so
legacy SCSS can read it. A small set of deliberately theme-invariant roles is
defined once and composed independently into both palettes; light mode never
inherits the dark palette.

## Palette shape

The palette has two kinds of roles:

- Shared UI roles for surfaces, content, borders, interactions, status, shadows,
  glass, and brand treatments.
- Isolated roles required by renderers or deliberately self-contained
  experiences: the result grid, Monaco, data visualization, authentication,
  onboarding, browser window controls, instance presets, and the color picker.

Most product UI should need only the shared roles. The specialized roles exist
because collapsing syntax colors, chart-series identity, or native window
controls into generic UI colors would make those systems less understandable,
not more maintainable.

## Brand sources and semantic mapping

The palette is informed by two QuestDB Figma sources:

- [QuestDB Design System – Core v1.1](https://www.figma.com/design/yka873CDRnp51hp8HBb8Nv/QuestDB-Design-System-%E2%80%93-Core-v1.1?node-id=13-2916&p=f&m=dev)
  supplies the dark neutral anchors, the QDB Pink ramp, and the functional
  accents: midnight `#141725`, charade `#21222c`, rock `#262833`, gray
  `#32343e`, porcelain `#f8f8f2`, sky `#81d3f9`, green `#66bb6a`, and yellow
  `#ffd54f`.
- [QuestDB Agents Landing Page](https://www.figma.com/design/HPVrUIVW8TGyowgZZ5M13K/QuestDB-Agents-Landing-Page?node-id=1-4264&p=f&m=dev)
  supplies the systematic accent ramp. Its 341-degree ramp is the source of
  truth because its rendered fills, hex labels, and HSL labels agree. A
  neighboring 345-degree draft contains mismatches between the rendered fills
  and the visible hex labels, so it is not used in product code.

Source palette names never become application tokens. `QDB Pink 700`, for
example, describes a swatch, not why a component needs it. Code always asks for
a UI meaning such as `surfaceRaised`, `contentAccent`, or `statusInfo`.

The product brand is QDB Pink, split by mode so it never reads as the error red:

| Role                  | Dark               | Light              |
| --------------------- | ------------------ | ------------------ |
| On-chrome accent      | Pink 300 `#f0428b` | Pink 700 `#bd0f58` |
| Strong accent         | Pink 400 `#ee2b7c` | Pink 800 `#8e0b42` |
| Opaque primary action | Pink 700 `#bd0f58` | Pink 800 `#8e0b42` |
| Primary action hover  | Pink 600 `#d41162` | Pink 700 `#bd0f58` |

The on-chrome accent and the opaque action are different roles; do not collapse
them. Danger is a separate pure-red family. Brand pink and danger red must never
share a hex.

The dark theme uses the source neutrals selectively rather than flooding every
large work surface with them. Midnight is reserved for the outer application
field; notebook stages, editors, grids, panels, and overlays use a lower-chroma
charcoal ladder derived around the source neutrals. The light theme keeps the
same semantic hierarchy on a compressed, lifted gray ladder designed for an
application rather than an inversion of the website's dark-only backgrounds.
Brand hue families are preserved across modes; lightness and, when needed,
saturation change to provide contrast against each theme's surfaces.

## The model: contrast between neighbors

There is no universal rule that every higher surface must be lighter. Lightness
is read locally: a user understands a panel from the surfaces immediately next
to it. The console therefore uses a small set of spatial roles and assigns them
consistently in both themes.

1. `surfaceCanvas` is the application field.
2. `surfaceStage` recedes behind the user's primary work.
3. `surfaceBase` is the fixed chrome frame.
4. `surfaceInset` separates content embedded inside another surface.
5. `surfaceRaised` groups cards, cells, content panels, and interactive rows.
6. `surfaceOverlay` identifies floating surfaces: menus, popovers, dialogs,
   tooltips, Monaco widgets, and the CTA banner.

Dark mode generally expresses inset depth by becoming darker and raised depth by
becoming lighter. Light mode intentionally uses a gray application field, a
darker work stage, and brighter embedded content. This avoids both an all-white
document look and the alternating “zebra” bands that appear when every container
invents its own gray. The light ladder is deliberately compressed: the step from
stage to raised is about 18 RGB points, so surfaces carry structure without
heavy shadows.

The practical rules are:

- Adjacent regions with different responsibilities should not use the same
  surface token.
- Siblings with the same responsibility should use the same surface token.
- Use one primary separation cue. Prefer a surface step; add a subtle border for
  precise edges; add a shadow mainly when an element floats over content.
- Do not combine a large lightness jump, a strong border, and a heavy shadow
  unless the element is a blocking overlay.
- Hover must differ from rest, and active must differ from hover. Never use
  opacity on the whole control because it also weakens its text and icon.
- Hover inverts against its surface: one step darker in light, one step lighter
  in dark. On chrome that is the `interactionHover` wash, not a surface step.
- `interactionNeutral` is the selected or pressed role. It is never a hover
  fill.
- Focus is structural, not decorative. Keyboard focus is `statusInfo` at 75%
  through `statusInfoFocus()`; do not remove it because a mouse hover exists.

As a review heuristic, a meaningful boundary should remain visible at normal
zoom without becoming the first thing the eye sees. Text follows the usual
contrast targets: 4.5:1 for ordinary text and 3:1 for large text and meaningful
UI graphics. Not every panel boundary needs 3:1; boundaries that are necessary
to understand or operate the UI do.

## Core palette

Values are shown as dark / light. “Same” means the dark value is deliberately
shared by light mode.

### Surfaces

| Token            | Dark / light                                         | Purpose and allowed use                                                                                            |
| ---------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `surfaceCanvas`  | `#141725` / `#e8eaee`                                | Root application field and empty console canvas. This is the primary large-area use of Core midnight.              |
| `surfaceStage`   | `#0c0d11` / `#e2e5ea`                                | Neutral recessed notebook/metrics work stage behind cells and editors.                                             |
| `surfaceBase`    | `#17181d` / `#eef0f3`                                | Top bar, dark-mode icon rails, and other fixed chrome. In light mode also the receding hover on raised cells.      |
| `surfaceInset`   | `#121317` / `#f7f8f9`                                | Embedded wells: chart bodies, compact code regions, keycaps, grid viewport, and dark-mode tooltips.                |
| `surfaceRaised`  | `#1d1e24` / `#f4f5f7`                                | Cells, cards, rows, content sidebars (schema, details, AI), results pane, and light-mode icon rails and footer.    |
| `surfaceInput`   | `#21222c` / `#fafbfc`                                | Editable fields, textareas, search inputs, and form selects.                                                       |
| `surfaceOverlay` | `#1d1e24` / `#fafbfc`                                | Dropdowns, context menus, dialogs, popovers, light-mode tooltips, Monaco widgets, and the CTA banner.              |
| `surfaceValue`   | `#202126` / `#ffffff`                                | Read-only values in table details, and light-mode cards that must lift above a raised panel (user chat bubbles).   |
| `surfaceScrim`   | `rgba(7, 7, 9, .72)` / `rgba(27, 31, 39, .32)`       | Translucent occlusion for dialog backdrops, overlay arrows, and frozen-grid edge fades. Never an empty-state well. |
| `surfaceTabRail` | `rgba(18, 19, 23, .82)` / `rgba(244, 245, 247, .94)` | Translucent substrate beneath the liquid-glass tab indicator. Light is `surfaceRaised` at 94%.                     |
| `transparent`    | `transparent` / same                                 | Explicit absence of paint. This is a behavior token, not a palette color.                                          |

### Content

| Token                 | Dark / light                      | Purpose and allowed use                                                                                                 |
| --------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `contentPrimary`      | `#f8f8f2` / `#1c2029`             | Primary body text, titles, default icons, result-grid column names, and table/column type glyphs.                       |
| `contentSecondary`    | `#9da1ad` / `#505968`             | Supporting text, parenthetical type labels, and neutral toolbar icons.                                                  |
| `contentMuted`        | `#858995` / `#565f6e`             | Metadata and low-emphasis labels that remain readable on the raised surface.                                            |
| `contentDisabled`     | `#747985` / `#596271`             | Disabled text/icons only; never use it merely to make something “quiet,” and never as a border.                         |
| `contentInverse`      | `#f8f8f2` / same                  | Porcelain content on saturated fills: primary and danger buttons, switch thumbs, checkbox ticks.                        |
| `contentOnWarning`    | `#000000` / same                  | Text/icons on bright yellow warning fills.                                                                              |
| `neutralInk`          | `#000000` / same                  | Opaque mask and picker anchor used on arbitrary fills rather than themed surfaces.                                      |
| `contentAccent`       | `#f0428b` / `#bd0f58`             | Brand accent on chrome: rail navigation, tab underlines, `SelectMenu` check, drag chrome. Do not treat it as body text. |
| `contentAccentStrong` | `#ee2b7c` / `#8e0b42`             | Saturated accent for copy-pulse highlights, prominent identity, and cases that pair with porcelain content.             |
| `contentSearchMatch`  | `rgb(163, 127, 96)` / amber `.32` | Search-match emphasis inside text; its light value matches Monaco's search highlight for consistent recognition.        |

### Borders

| Token                | Dark / light                                   | Purpose and allowed use                                                                        |
| -------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `borderSubtle`       | `rgba(255,255,255,.04)` / `rgba(28,32,41,.07)` | Quiet dividers inside a panel or between a panel and the work surface.                         |
| `borderDefault`      | `rgba(255,255,255,.13)` / `rgba(28,32,41,.15)` | Standard component, input, control, floating-surface, and chrome-rail boundary.                |
| `borderStrong`       | `#3d414d` / `#b0b7c2`                          | Activated control stroke: field focus, open dropdowns, resizers, sash hover, segmented tracks. |
| `borderAccent`       | brand accent at `.42` / brand accent at `.42`  | Selected/accent boundary.                                                                      |
| `borderAccentStrong` | brand accent at `.52` / brand accent at `.56`  | High-priority accented boundary such as the selected instance color swatch.                    |

### Interaction and controls

| Token                     | Dark / light                                  | Purpose and allowed use                                                                       |
| ------------------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `interactionNeutral`      | `#32343e` / `#e8eaee`                         | Selected list row, selected choice card, selected vertical tab, and pressed chip fill.        |
| `interactionNeutralHover` | `#292b35` / `#e2e5ea`                         | Hover one step below a selected neutral well, and hover inside a `controlTrack`.              |
| `interactionHover`        | white `.055` / ink `.075`                     | Inverting hover wash for menus, lists, tree rows, ghost buttons, tabs, and grid rows.         |
| `interactionSelected`     | white `.11` / ink `.15`                       | Result-grid selected row; exactly twice `interactionHover`.                                   |
| `interactionAccentActive` | brand accent at `.10` / brand accent at `.13` | Branded latch well behind the rail navigation and Add Cell.                                   |
| `interactionGuide`        | `#6272a4` / `#56657f`                         | Drag guides, resize handles, text selection helpers, and Monaco's auxiliary/inactive markers. |
| `scrollbarThumb`          | white `.13` / `#d7dbe3`                       | Native, webkit, and Monaco scrollbar handles; chrome, not content.                            |
| `controlSurface`          | `#262833` / `#f6f7f8`                         | Default solid secondary button, toolbar select trigger, and keycap face.                      |
| `controlSurfaceHover`     | `#32343e` / `#e7e9ed`                         | Hover fill for `controlSurface`; dark mode rises to the Core gray anchor.                     |
| `controlTrack`            | `#262833` / `#e8eaee`                         | Segmented-control substrate (Table/Chart, List/Grid chips).                                   |
| `controlTrackRest`        | `#262833` / `#c9cdd4`                         | Switch track in the off state.                                                                |
| `controlTrackStroke`      | white `.15` / ink `.25`                       | The 0.5px inset stroke on the switch track.                                                   |

### Actions and status

| Token(s)                                                                | Dark / light                                            | Purpose and allowed use                                                                             |
| ----------------------------------------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `actionPrimary`, `actionPrimaryHover`                                   | `#bd0f58`, `#d41162` / `#8e0b42`, `#bd0f58`             | Primary-button rest and hover fills, and the selected calendar range. Both keep porcelain contrast. |
| `statusDanger`, `statusDangerStrong`                                    | `#ff3333`, `#db2424` / `#ce1717`, `#ce1717`             | Danger type/icons, and the opaque destructive fill. Light Strong equals Text on purpose.            |
| `statusDangerContrast`, `statusDangerSubtle`                            | `#ff4d4d`, `#ff8080` / `#b81414`, `#8a0f0f`             | Danger type on the 15% wash and on the 40% hover wash. These are type colors, not fills.            |
| `statusDangerMuted`                                                     | Strong at `.72` / Strong at `.72`                       | Muted destructive decoration and dark-mode banner strokes.                                          |
| `statusDangerSurface`, `statusDangerSurfaceHover`, `statusDangerBorder` | red at `.15`, `.40`, `.28` / red at `.15`, `.40`, `.28` | Danger chip/badge/banner fill, its hover, and its border.                                           |
| `statusSuccess`, `statusSuccessStrong`                                  | `#66bb6a`, `#188a5d` / `#067047`, `#05603e`             | Success type/icons, and the stronger green for accepted-change marks and glyph badges.              |
| `statusSuccessFill`                                                     | `#3fa659` / `#1f7a39`                                   | Opaque positive fill that carries no text: the switch on-track.                                     |
| `statusSuccessSurface`, `statusSuccessBorder`                           | green at `.12`, `.24` / green at `.16`, `.28`           | Success chip/banner fill and boundary.                                                              |
| `statusWarning`, `statusWarningSurface`                                 | `#ffd54f`, yellow at `.10` / `#8a570f`, amber at `.14`  | Warning type/icons and the low-emphasis warning fill.                                               |
| `statusAttention`                                                       | `#e3ce78` / `#745c00`                                   | Pending or attention-needed state that is neither an error nor a warning action.                    |
| `statusInfo`                                                            | `#81d3f9` / `#176f87`                                   | Info type, notebook identity glyphs, grid cell-focus ring, and the keyboard focus ring at 75%.      |
| `statusInfoSubtle`                                                      | `#b2e7ff` / `#159cc1`                                   | Quiet on-glyph for non-rail latched toggles.                                                        |
| `statusInfoControl`                                                     | `#0c80f3` / `#0a88db`                                   | Opaque persistent on-fill: checked checkboxes, with a porcelain tick.                               |
| `statusInfoSurface`, `statusInfoSurfaceStrong`                          | sky at `.05`, `.30` / teal at `.10`, `.10`              | Latch well and grid focused-cell wash; Strong is the MCP pairing banner well.                       |
| `statusFeature`                                                         | `#a99de8` / `#6553aa`                                   | Feature/AI distinction when brand pink or status colors would imply the wrong meaning.              |
| `statusAssistant`, `statusAssistantStrong`                              | `#d14671`, `#892c6c` in both themes                     | Fixed assistant progress gradient and completion checks across theme changes.                       |

### Shadows and glass

Light-mode shadows are quiet because the compressed surface ladder does the
elevation work. Geometry matters as much as opacity: light lifts use a 1–2px
offset and a short blur, never a 20px haze.

| Token(s)        | Dark / light               | Purpose and allowed use                                                           |
| --------------- | -------------------------- | --------------------------------------------------------------------------------- |
| `shadowSubtle`  | black `.08` / ink `.035`   | Contact shadow: the first layer of a card, chip, or title-bar lift.               |
| `shadowSoft`    | black `.16` / ink `.055`   | Card and hover lift; the heel of the floating stack.                              |
| `shadowMedium`  | black `.28` / ink `.08`    | Weight layer of dropdowns and popovers; the dark loom.                            |
| `shadowStrong`  | black `.42` / ink `.16`    | Large popovers and dialogs.                                                       |
| `shadowOverlay` | black `.58` / ink `.22`    | Strongest depth cue for dialogs, banners, legacy overlays, and pinned-grid edges. |
| `glassSurface`  | white `.075` / white `.58` | Moving liquid-glass selection lens.                                               |
| `glassBorder`   | white `.14` / ink `.14`    | Main glass lens edge.                                                             |
| `glassEdge`     | white `.22` / ink `.22`    | Refractive/highlight edge; use sparingly inside the glass implementation.         |

The shared floating stack in `floatingSurfaceStyles` is: heel `0 1px 2px`
`shadowSoft`, weight `0 4px 6px -2px` `shadowMedium`, then a loom that splits by
mode: `0 8px 8px -4px` `shadowSubtle` in light, `0 12px 16px -4px`
`shadowMedium` in dark. Retune opacities per mode; do not change shared geometry
to fix one mode.

### Brand gradients

The gradients are reserved for QuestDB identity and AI affordances. Ordinary
buttons and surfaces use solid semantic roles. The QuestDB logo mark retains its
supplied SVG gradients, while its wordmark inherits the surrounding semantic
content color so it remains readable in both themes.

| Token(s)                                 | Dark / light                                  | Purpose                                                        |
| ---------------------------------------- | --------------------------------------------- | -------------------------------------------------------------- |
| `brandGradientStart`, `brandGradientEnd` | `#e21269` → `#8e0b42` / `#bd0f58` → `#8e0b42` | QuestDB identity gradient for theme-aware product affordances. |
| `aiGradientStart`, `aiGradientEnd`       | `#ee2b7c` → `#8e0b42` / `#bd0f58` → `#8e0b42` | AI sparkle gradient, kept separate so it can diverge later.    |

## Specialized palettes

These roles are still semantic, but they belong to a renderer or an isolated
experience. General UI components must not consume them.

### Result grid

The grid needs a dedicated dense-data ladder. In dark mode the empty grid field
is darkest, rows are darker, and headers are dark. In light mode the field is
lightest, rows are lighter, and headers are the strongest gray. That preserves
structure without card borders around every cell. In light mode `gridRow` equals
`surfaceRaised`, so a notebook cell and its rows are one surface and the header
bar is the structure cue.

| Token           | Dark / light          | Purpose                                                                    |
| --------------- | --------------------- | -------------------------------------------------------------------------- |
| `surfaceInset`  | `#121317` / `#f7f8f9` | Empty grid field and viewport.                                             |
| `gridRow`       | `#17181d` / `#f4f5f7` | Standard data row.                                                         |
| `gridHeader`    | `#202126` / `#e7eaee` | Column header background. Header names are `contentPrimary` at weight 600. |
| `gridSelection` | `#252830` / `#d8dce3` | Monaco selection substrate. The React grid does not read it.               |

Grid interaction is composed from shared roles: row hover is one
`interactionHover` over the field, the selected row is `interactionSelected`,
the focused cell stacks `statusInfoSurface` over that with a `statusInfo` ring,
and the copy pulse follows the ring. Column resize and frozen-handle hover use
`borderStrong`.

### Monaco editor

Monaco is themed through its API, not through application CSS. Its
editor-specific roles remain isolated; ordinary surface, content, interaction,
and status roles are reused where they carry the same meaning.

| Token(s)                                                        | Dark / light                                                          | Purpose                                                                                    |
| --------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `editorCanvas`, `surfaceOverlay`, `editorBorder`                | `#17181d`, `#1d1e24`, `#121317` / `#eef0f3`, `#fafbfc`, `#e2e5ea`     | Editor field, widgets/menus, and editor-specific edge. Light canvas matches `surfaceBase`. |
| `contentPrimary`                                                | `#f8f8f2` / `#1c2029`                                                 | Default code text.                                                                         |
| `interactionHover`, `interactionNeutral`, `controlSurfaceHover` | white `.055`, `#32343e`, `#32343e` / ink `.075`, `#e8eaee`, `#e7e9ed` | Menu selection, separators, and list-filter states.                                        |
| `scrollbarThumb`                                                | white `.13` / `#d7dbe3`                                               | Overlay scrollbar slider, shared with the rest of the console.                             |
| `editorSelection`, `editorSelectionAccent`                      | `#44475a`, `#44475a` / `#aec8ec`, `#7a99c4`                           | Monaco and native form-control selection, plus its stronger selection boundary.            |
| `editorActiveLine`, `editorActiveLineBorder`                    | white `.03`, transparent / ink `.035`, transparent                    | Active-line wash and border. The transparent border prevents layout/color artifacts.       |
| `editorSuggestionMatchActive`                                   | `#ff9abb` / `#8a0f35`                                                 | Active autocomplete match.                                                                 |
| `editorRun`, `statusDanger`                                     | `#ffffff`, `#ff3333` / `#067047`, `#ce1717`                           | Query-dropdown run icon and error decoration. The run icon intentionally changes by theme. |
| `editorSyntaxNumber`                                            | `#50fa7b` / `#056c45`                                                 | Numbers, and the gutter run glyph.                                                         |
| `contentMuted`                                                  | `#858995` / `#565f6e`                                                 | Comments.                                                                                  |
| `editorSyntaxString`                                            | `#f1fa8c` / `#695f00`                                                 | Strings.                                                                                   |
| `editorSyntaxKeyword`                                           | `#ff79c6` / `#b81447`                                                 | SQL keywords.                                                                              |
| `editorSyntaxType`                                              | `#8be9fd` / `#0a6a80`                                                 | Types and type-like identifiers.                                                           |
| `editorSyntaxConstant`                                          | `#bd93f9` / `#6553aa`                                                 | Constants.                                                                                 |
| `editorSyntaxVariable`                                          | `#ffb86c` / `#8e500a`                                                 | Variables.                                                                                 |
| `editorErrorHighlight`, `editorSuccessHighlight`                | red/green `.15` / red/green `.13`                                     | Full-line execution feedback.                                                              |
| `editorSearchHighlight`, `editorAiHighlight`                    | orange/yellow `.50` / amber `.32`/`.28`                               | Search and AI-generated-range highlights.                                                  |

### Data visualization

Series keep the same conceptual hue identity across themes; the light theme uses
darker lightness values to maintain contrast against a light plot while the dark
theme uses lighter values against a dark plot. The slot is the data
identity—components must not pick a series by color name.

| Token                          | Dark / light                                                                                                                          | Purpose                                                                                                                               |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `dataGrid`                     | gray `.11` / ink `.16`                                                                                                                | Chart axes and grid lines.                                                                                                            |
| `dataArea`                     | white `.012` / ink `.018`                                                                                                             | Quiet plot-area separation.                                                                                                           |
| `dataSeries1`                  | `#ff6b6b` / `#d51515`                                                                                                                 | Metric widget series slot 1, red. `dataSeries*` are user-pickable metric colors; auto-assigned chart series use `chartSeries*`.       |
| `dataSeries2`                  | `#4ecdc4` / `#0c7966`                                                                                                                 | Series slot 2, teal.                                                                                                                  |
| `dataSeries3`                  | `#ffd93d` / `#80690d`                                                                                                                 | Series slot 3, yellow/olive.                                                                                                          |
| `dataSeries4`                  | `#95d86e` / `#357b0c`                                                                                                                 | Series slot 4, green.                                                                                                                 |
| `dataSeries5`                  | `#ff8f40` / `#ac5111`                                                                                                                 | Series slot 5, orange.                                                                                                                |
| `dataSeries6`                  | `#bd93f9` / `#6415d5`                                                                                                                 | Series slot 6, violet.                                                                                                                |
| `dataSeries7`                  | `#50fa7b` / `#0c7b37`                                                                                                                 | Series slot 7, bright green.                                                                                                          |
| `dataSeries8`                  | `#ff79c6` / `#cc147e`                                                                                                                 | Series slot 8, magenta.                                                                                                               |
| `dataSeries9`                  | `#8be9fd` / `#1072a5`                                                                                                                 | Series slot 9, cyan/blue.                                                                                                             |
| `dataSeries10`                 | `#f1fa8c` / `#61740b`                                                                                                                 | Series slot 10, yellow/olive.                                                                                                         |
| `chartSeries1..8`              | `#8be9fd #d14671 #ffb86c #bd93f9 #f1fa8c #ff79c6 #50fa7b #ff5555` / `#1590aa #e42560 #c16f18 #7425e4 #728d11 #e425ac #139842 #e42525` | Auto-assigned series order for notebook/result charts and quick-vis. Calm brand hues lead; assignment is positional, not user-picked. |
| `dataPositive`, `dataNegative` | `#2ca875`, `#d94d58` / `#05603e`, `#a81f2e`                                                                                           | Directional financial/operational data, not generic form success/error.                                                               |

### Authentication

Authentication is a visually isolated first impression and keeps a deliberate
dark-crimson identity. These roles belong to login/version UI. In dark mode
`authBackdrop` is also the well behind AI chat tool/code blocks and user
bubbles; in light mode those use `surfaceValue` instead, because a dark login
well cannot lift off a raised panel.

| Token                           | Dark / light                                   | Purpose                                                   |
| ------------------------------- | ---------------------------------------------- | --------------------------------------------------------- |
| `authBackdrop`                  | `#1d070e` / `#c7cbd2`                          | Login page field and dark-mode AI chat wells.             |
| `authAccent`, `authAccentMuted` | `#9089fc`, violet `.64` / `#7d2948`, ink `.46` | Login illustration/action accent and its muted companion. |
| `surfaceCanvas`, `authBorder`   | `#141725`, `#353946` / `#e8eaee`, `#a8b0bd`    | Login form card and prominent edge.                       |
| `authVersionContent`            | `#f5f3f0` / `#e7e3e5`                          | Version badge readable content.                           |

### Onboarding

The notebook and MCP onboarding experience follows the active luminance mode.
Dark mode retains the original terminal presentation; light mode reuses values
from the light surface, content, feature, and information roles. Modal borders,
subtle fills, and shadows use the general semantic tokens directly.

| Token               | Dark / light            | Purpose                                |
| ------------------- | ----------------------- | -------------------------------------- |
| `onboardingSurface` | `#050505` / `#e3e5e9`   | Experience backdrop.                   |
| `onboardingDivider` | white `.04` / ink `.07` | Quiet internal rule.                   |
| `onboardingClose`   | `#858585` / `#565f6e`   | Close/secondary content.               |
| `onboardingCommand` | `#111111` / `#fbfcfd`   | Command and transcript frame surfaces. |
| `onboardingInput`   | `#202020` / `#eceef1`   | Simulated input.                       |
| `onboardingPrompt`  | `#93adff` / `#6553aa`   | Prompt identity.                       |
| `onboardingAccent`  | `#29c6be` / `#176f87`   | Agent/progress accent.                 |

### Fixed-purpose colors

These values encode external or user-selected identity, so replacing them with
generic status roles would change meaning.

| Token(s)                                                             | Value                                              | Purpose                                                                                                                     |
| -------------------------------------------------------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `instancePreset1`, `instancePreset2`, `instancePreset3`              | `rgb(199,7,45)`, `rgb(0,170,59)`, `rgb(0,122,255)` | Stable user-selectable instance identities.                                                                                 |
| `windowControlClose`, `windowControlMinimize`, `windowControlExpand` | `#ff5f57`, `#febc2e`, `#28c840`                    | Familiar macOS-style window controls in illustrative UI.                                                                    |
| `pickerHue0` … `pickerHue5`                                          | red, yellow, green, cyan, blue, magenta endpoints  | Mechanical hue stops for the color picker. Indexed names are intentional because the token is a position, not a UI meaning. |

## Choosing a surface

| Relationship                        | Recommended combination                                                                 |
| ----------------------------------- | --------------------------------------------------------------------------------------- |
| Application shell → work area       | `surfaceCanvas` → `surfaceStage`                                                        |
| Icon rail → content sidebar         | `surfaceBase` (dark) or `surfaceRaised` (light) → `surfaceRaised`, `borderDefault` rail |
| Content sidebar → work surface      | `surfaceRaised` → stage or editor canvas, `borderSubtle` edge                           |
| Stage → notebook/metric card        | `surfaceStage` → `surfaceRaised`                                                        |
| Card header → embedded editor/chart | `surfaceRaised` → `surfaceInset` or the renderer-specific canvas                        |
| Page → input                        | parent surface → `surfaceInput` + `borderDefault`                                       |
| Page → menu/dropdown/tooltip        | parent surface → `surfaceOverlay` + `borderDefault` + floating shadow stack             |
| Dialog → read-only value            | dialog surface → `surfaceValue`                                                         |
| Dialog → empty-state well           | dialog surface → `surfaceRaised`                                                        |
| Raised panel → card that must lift  | `surfaceRaised` → `surfaceValue` (light); dark keeps its own well                       |
| Result-grid viewport → row → header | `surfaceInset` → `gridRow` → `gridHeader`                                               |

Do not choose a token by comparing its hex value to a mockup. Choose the role
from this table, then tune the role in both themes if the relationship is wrong
everywhere it appears.

## Composition rules

These bindings are the settled decisions behind the current UI. Follow them when
building or reviewing a component.

### Chrome

- Icon rails, top bar, and footer are `surfaceBase` in dark mode. In light mode
  the rails and footer share `surfaceRaised` with the content panels; the
  `borderDefault` rail hairline carries the stagger instead of a darker gray.
- Content sidebars (schema, details drawer, AI chat) are `surfaceRaised` on both
  sides in both modes. Panel headers do not step above panel bodies; the step is
  panel versus work.
- Rails use `borderDefault`; panel-to-work edges use `borderSubtle`. Do not
  promote panel-to-work edges, or the two weights collapse.
- The results action bar owns the pane-top hairline, because it spans under the
  sidebar and the log does not.
- Tooltips, popovers, dropdowns, and the instance hover card are floating
  chrome: `surfaceOverlay` in light, `borderDefault` stroke, the shared shadow
  stack. Dark tooltips keep `surfaceInset`.

### Hover, selection, and focus

- Menu items, tree rows, search rows, chat history rows, choice cards, and
  light-mode ghost buttons hover with `interactionHover`. Dark ghost buttons on
  base chrome may lift to `surfaceRaised`; on a raised cell they must recede.
- Selected rows, cards, and vertical tabs are `interactionNeutral` with
  `borderDefault`. Their hover sits one step below the selected well:
  `interactionNeutralHover` in dark, `surfaceBase` for light vertical tabs.
- Default field focus, open `SelectMenu` triggers, and resize affordances use
  `borderStrong`. Accent focus is opt-in through `$tone="accent"` and is
  reserved for the AI composer and login.
- Keyboard focus rings everywhere use `statusInfoFocus(theme.color.statusInfo)`.
  Notebook cell focus stays branded.
- Non-rail latched toggles use `activeTone="info"`: glyph `statusInfoSubtle`,
  well `statusInfoSurface`. Rail navigation stays `activeTone="accent"` with
  `contentAccent` on `interactionAccentActive`.

### Controls

- Primary buttons are `actionPrimary` with `contentInverse`.
- Danger buttons are solid `statusDangerStrong` with `contentInverse`; hover is
  `statusDanger`. The `dangerGhost` variant rests on `statusDangerSurface` with
  `statusDangerContrast` type and hovers to `statusDangerSurfaceHover`; hover
  type is `statusDangerSubtle` in light and `statusDanger` in dark.
- Switches: on-track `statusSuccessFill`, off-track `controlTrackRest`, a 0.5px
  inset `controlTrackStroke`, thumb `contentInverse`.
- Checkboxes: checked fill `statusInfoControl`, tick `contentInverse`.
- Form selects are `SelectMenuControl` on `surfaceInput`, matching their sibling
  inputs. Toolbar selects stay `controlSurface`.
- Menu items built from `Button` must lock their hover border, because the
  secondary hover would repaint a `borderSubtle` divider as `borderStrong`.

### Badges and status marks

- `Badge` `shape="chip"` is the status label: 4px radius, no border, status
  surface fill. `shape="pill"` is the compact count badge with a 12% wash and a
  32% tone stroke. Do not restyle one into the other.
- Light-mode Enabled chips use `statusSuccessSurface` + `statusSuccessBorder`;
  dark keeps the neutral well with success type.
- Footer status marks share one rounded-square geometry; color carries state.

### Object identity and type

- Table, materialized-view, view, column-type, and designated-timestamp glyphs
  are `contentPrimary`, the same as the object name. Parenthetical type labels
  stay `contentSecondary`.
- Result-grid header names are `contentPrimary` at weight 600. The result row
  count is `fontSize.lg` at weight 600 in the UI font, not monospace.
- Notebook title glyphs and chrome-tab notebook/metrics favicons are
  `statusInfo`.

### Where brand stays

Rail navigation, tab underlines, notebook cell focus, the `SelectMenu` check, AI
`$tone="accent"` fields, and drag chrome are the branded surfaces. Everything
else that once used brand for hover, focus, or selection has moved to the
neutral or info families. Do not retune `contentAccent` to fix a hover or focus
problem; rebind the component instead.

### Sanctioned one-off washes

These derive from a role with `withAlpha()` and must not become tokens:

- Notebook drag slot: `contentPrimary` at `.08` light / `.10` dark.
- MCP pairing error banner in light: `rgba(189, 40, 56, 0.08)`.
- Reset Provider ghost hover: `#db2424` at `.30` dark / `#bd2828` at `.10`
  light.

## Runtime architecture

- Styled components read `theme.color` directly. The `color()` helper resolves
  the same typed object.
- Non-React renderers use `getThemeColor()` from [`runtime.ts`](./runtime.ts);
  the active object is synchronized by `ThemeModeProvider`.
- Legacy SCSS uses `theme-color(name)`. Sass emits `var(--qdb-color-name)`, and
  [`css-variables.ts`](./css-variables.ts) declares every property from this
  same palette. This lets the compiled `main.scss` bundle follow a runtime theme
  change through one generated declaration block. Light-only SCSS overrides key
  off `html[data-theme="light"]`.
- SVG templates use semantic placeholders that are resolved before rendering.
- Monaco receives a complete theme through its public theming API. Any custom
  properties inside Monaco itself are third-party implementation details, not
  QuestDB palette inputs.
- `withAlpha()` derives one-off translucent renderer colors from a semantic
  role. It handles hex and RGB inputs and avoids a separate token for every
  renderer-specific opacity.
- `statusInfoFocus()` is the shared keyboard focus ring: `statusInfo` at 75%. A
  1px stroke that dies on `surfaceValue` uses solid `statusInfo` instead.

### User preference and System mode

The saved preference and the rendered theme are deliberately separate:

- `ThemePreference` is `system`, `light`, or `dark` and is stored under
  `appearance.themePreference`.
- `ThemeMode` is always the resolved `light` or `dark` value consumed by styled
  components, Monaco, charts, legacy styles, and runtime renderers.
- The provider tracks the operating-system mode independently so switching back
  to System always resolves to the current device preference.
- `system` resolves through `prefers-color-scheme`. A media-query change updates
  the rendered theme immediately, so operating-system automatic schedules are
  followed without reloading the console.
- Explicit `light` and `dark` preferences ignore operating-system changes.
- Preference changes synchronize across same-origin tabs through the browser
  `storage` event.

The root HTML entry point resolves the saved preference before the application
bundle executes and sets `data-theme` plus the native `color-scheme`. The React
provider uses the same resolution rules, so the first React render does not use
the opposite theme.

## Making a change

There are two kinds of theme change. Decide which one you are making before you
touch a file.

| Change      | What it is                                           | Where it lands                                               |
| ----------- | ---------------------------------------------------- | ------------------------------------------------------------ |
| **Palette** | Retune an existing role in one or both themes        | `index.ts` only, then the value tables in this document      |
| **Binding** | A component uses the wrong role, or needs a new role | The component file, plus a new token only if reuse would lie |

Palette is the default. Binding is the exception, including “brand is doing a
job it should not.” Never invent a component-named color such as
`notebookCellBackground`. Either retune the role, rebind the component to a
different existing role, or add a role whose meaning is new.

For every change, walk the neighbors in both modes: the surface it sits on, the
surfaces beside it, and its own rest, hover, active, focus, and disabled states.

## Contribution rules

1. Never add a literal UI color outside `index.ts`. Immutable supplied brand
   artwork such as `QuestDBLogo` is the sole exception and must not be recolored
   through theme roles.
2. Never add a first-party CSS custom property for theming.
3. Use a semantic role, not a hue name and not a component name.
4. Keep every runtime token directly under `theme.color`; organize source groups
   with comments. A genuinely theme-invariant role belongs in `invariantColors`,
   which is spread independently into both flat palettes.
5. Add a token only when an existing role would communicate the wrong meaning or
   when a renderer needs stable independent control. A new surface role is
   justified only when two neighbors with different jobs are forced to share a
   token.
6. Define the dark and light value together and inspect their neighboring
   surfaces in both modes.
7. Preserve state ordering: rest, hover, active/selected, focus, disabled.
8. Prefer `withAlpha()` for a renderer-specific wash. Promote it to a token only
   when the same opacity has a shared semantic meaning across components.
9. Fix a mode-specific problem with a mode-specific value, not with shared
   geometry or a shared token change.
10. Run `yarn lint:colors` and `yarn typecheck` after changes.

Before adding a new color token, answer all four questions:

- What meaning does it carry?
- Which existing token is closest, and why is reusing it incorrect?
- Which surfaces or components may consume it?
- What is its corresponding dark/light behavior?

If those answers are not clear, the color is probably a local styling tweak, not
a design-system token.
