# QuestDB Web Console theming

This document is the contract for color in the Web Console. It explains the
palette, the surface hierarchy, the semantic meaning of every token, and how a
new component should choose colors.

The implementation lives in [`src/theme/index.ts`](src/theme/index.ts). The
palette is intentionally flat: every color is `theme.color.tokenName`, grouped
by comments in the source. There are no nested color objects, and the only
first-party CSS custom properties are the `--qdb-*` properties generated from
this palette so legacy SCSS can read it. A small set of deliberately
theme-invariant roles is defined once and composed independently into both
palettes; light mode never inherits the dark palette.

## What changed

Before this redesign, `theme.color` exposed dark-only tokens. Many encoded a
hue, a component, or one specific opacity, while other UI colors still lived
outside the palette. That made global tuning difficult and encouraged new
near-duplicates.

The palette now has two kinds of roles:

- Shared UI roles for surfaces, content, borders, interactions, status,
  shadows, glass, and brand treatments.
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
  supplies the dark neutral anchors and functional accents: midnight `#141725`,
  charade `#21222c`, rock `#262833`, gray `#32343e`, porcelain `#f8f8f2`, sky
  `#81d3f9`, green `#66bb6a`, and yellow `#ffd54f`.
- [QuestDB Agents Landing Page](https://www.figma.com/design/HPVrUIVW8TGyowgZZ5M13K/QuestDB-Agents-Landing-Page?node-id=1-4264&p=f&m=dev)
  supplies the systematic QuestDB accent ramp used for actions and semantic
  accent content. Its 341-degree ramp is the source of truth because its
  rendered fills, hex labels, and HSL labels agree. A neighboring 345-degree
  draft contains mismatches between the rendered fills and the visible hex
  labels, so it is not used in product code.

Source palette names never become application tokens. `QDB Pink 700`, for
example, describes a swatch, not why a component needs it. The same swatch may
therefore map to `contentAccent` in light mode and `actionPrimaryHover` in light
mode, while those roles receive different lightness values in dark mode. Code
always asks for a UI meaning such as `surfaceRaised`, `contentAccent`, or
`statusInfo`.

The dark theme uses the source neutrals selectively rather than flooding every
large work surface with them. Midnight is reserved for the outer application
field; notebook stages, editors, grids, panels, and overlays use a lower-chroma
charcoal ladder derived around the source neutrals. The light theme keeps the
same semantic hierarchy but uses neutral gray surfaces designed for an
application rather than attempting to invert the website's dark-only
backgrounds. Brand hue families are preserved across modes; lightness and, when
needed, saturation change to provide contrast against each theme's surfaces.

## The model: contrast between neighbors

There is no universal rule that every higher surface must be lighter. Lightness
is read locally: a user understands a panel from the surfaces immediately next
to it. The console therefore uses a small set of spatial roles and assigns them
consistently in both themes.

1. `surfaceCanvas` is the application field.
2. `surfaceStage` recedes behind the user's primary work.
3. `surfaceBase` unifies fixed chrome and ordinary panels.
4. `surfaceInset` separates content embedded inside another surface.
5. `surfaceRaised` groups cards, cells, and interactive rows.
6. `surfaceOverlay` identifies floating or overlay-like surfaces. It covers
   menus, popovers, dialogs, Monaco widgets, the CTA banner, and legacy editor
   chrome that needs the same elevation.

Dark mode generally expresses inset depth by becoming darker and raised depth by
becoming lighter. Light mode intentionally uses a gray application field, a
darker work stage, and brighter embedded content. This avoids both an all-white
document look and the alternating “zebra” bands that appear when every container
invents its own gray.

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
- Focus is structural, not decorative. Use `borderAccentStrong` or the shared
  focus treatment; do not remove it because a mouse hover already exists.

As a review heuristic, a meaningful boundary should remain visible at normal
zoom without becoming the first thing the eye sees. Text follows the usual
contrast targets: 4.5:1 for ordinary text and 3:1 for large text and meaningful
UI graphics. Not every panel boundary needs 3:1; boundaries that are necessary
to understand or operate the UI do.

## Core palette

Values are shown as dark / light. “Same” means the dark value is deliberately
shared by light mode.

### Surfaces

| Token            | Dark / light                                         | Purpose and allowed use                                                                                           |
| ---------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `surfaceCanvas`  | `#141725` / `#d9dce2`                                | Root application field and empty console canvas. This is the primary large-area use of Core midnight.             |
| `surfaceStage`   | `#0c0d11` / `#c9cdd4`                                | Neutral recessed notebook/metrics work stage behind cells and editors.                                            |
| `surfaceBase`    | `#17181d` / `#e3e5e9`                                | Top, side, and bottom chrome; panels and drawers that visually belong to that shell.                              |
| `surfaceInset`   | `#121317` / `#eceef1`                                | Embedded wells: chart bodies, compact code regions, keycaps, and nested tool regions.                             |
| `surfaceRaised`  | `#1d1e24` / `#e8eaee`                                | Cells, cards, rows, and controls raised from a parent surface.                                                    |
| `surfaceInput`   | `#21222c` / `#f2f3f5`                                | Editable fields, textareas, and search inputs.                                                                    |
| `surfaceOverlay` | `#1d1e24` / `#f2f3f5`                                | Dropdowns, context menus, dialogs, Monaco widgets, the CTA banner, and overlay-like legacy editor chrome.         |
| `surfaceValue`   | `#202126` / `#fbfcfd`                                | Read-only values in table details. It exists so label/value rows remain consistent without changing their layout. |
| `surfaceScrim`   | `rgba(7, 7, 9, .72)` / `rgba(27, 31, 39, .38)`       | Translucent occlusion for dialog backdrops, recessed placeholders, overlay arrows, and frozen-grid edge fades.    |
| `surfaceTabRail` | `rgba(18, 19, 23, .82)` / `rgba(218, 221, 227, .94)` | Translucent substrate beneath the liquid-glass tab indicator.                                                     |
| `transparent`    | `transparent` / same                                 | Explicit absence of paint. This is a behavior token, not a palette color.                                         |

### Content

| Token                 | Dark / light                      | Purpose and allowed use                                                                                                       |
| --------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `contentPrimary`      | `#f8f8f2` / `#1c2029`             | Primary body text, titles, and default icons. Dark mode uses the brand porcelain.                                             |
| `contentSecondary`    | `#9da1ad` / `#505968`             | Supporting text and neutral toolbar icons. This is the requested shared gray icon color in dark mode.                         |
| `contentMuted`        | `#858995` / `#565f6e`             | Metadata and low-emphasis labels that remain readable on the raised Core surface.                                             |
| `contentDisabled`     | `#747985` / `#596271`             | Disabled text/icons only; never use it merely to make something “quiet.”                                                      |
| `contentInverse`      | `#f8f8f2` / same                  | Porcelain content on saturated fills and other surfaces that need fixed light content.                                        |
| `contentOnWarning`    | `#000000` / same                  | Text/icons on bright yellow warning fills.                                                                                    |
| `neutralInk`          | `#000000` / same                  | Opaque mask and picker anchor used on arbitrary fills rather than themed surfaces.                                            |
| `contentAccent`       | `#c94f74` / `#b81447`             | Brand-accent icons, short labels, schema/table emphasis, focus, and selected accents. Do not treat it as default body text.   |
| `contentAccentStrong` | `#cf1750` / `#8a0f35`             | Saturated accent for selection fills, prominent identity, and cases that pair with porcelain content.                         |
| `contentObject`       | `#81d3f9` / `#b81447`             | Database object identity such as result-grid column names. Sky is retained in dark mode; brand crimson is used in light mode. |
| `contentSearchMatch`  | `rgb(163, 127, 96)` / amber `.32` | Search-match emphasis inside text; its light value matches Monaco's search highlight for consistent recognition.              |

### Borders

| Token                | Dark / light                                   | Purpose and allowed use                                                             |
| -------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------- |
| `borderSubtle`       | `rgba(255,255,255,.04)` / `rgba(28,32,41,.07)` | Quiet dividers between already distinct surfaces.                                   |
| `borderDefault`      | `rgba(255,255,255,.13)` / `rgba(28,32,41,.15)` | Standard component, panel, input, and control boundary.                             |
| `borderStrong`       | `#3d414d` / `#828b99`                          | Resizers, strongly bounded segmented controls, and edges that must remain findable. |
| `borderAccent`       | brand accent at `.42` / brand accent at `.42`  | Selected/accent boundary.                                                           |
| `borderAccentStrong` | brand accent at `.52` / brand accent at `.56`  | Keyboard focus and high-priority accented boundary.                                 |

### Interaction and controls

| Token                     | Dark / light                                     | Purpose and allowed use                                                                       |
| ------------------------- | ------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| `interactionNeutral`      | `#32343e` / `#d9dce2`                            | Neutral selected/pressed fill and legacy control fill. Dark mode uses the Core gray anchor.   |
| `interactionNeutralHover` | `#292b35` / `#d2d6dd`                            | Hover for neutral rows and controls when a solid fill is needed.                              |
| `interactionHover`        | `rgba(255,255,255,.055)` / `rgba(28,32,41,.075)` | Minimal hover overlay for tabs, icon buttons, and transparent actions.                        |
| `interactionAccentHover`  | brand accent at `.08` / brand accent at `.07`    | Quiet accent hover, especially schema/search rows.                                            |
| `interactionAccentActive` | brand accent at `.15` / brand accent at `.13`    | Selected accent row or active accent control.                                                 |
| `interactionGuide`        | `#6272a4` / `#56657f`                            | Drag guides, resize handles, text selection helpers, and Monaco's auxiliary/inactive markers. |
| `scrollbarThumb`          | white at `.13` / `#62656b`                       | Native vertical and horizontal scrollbar handles; neutral and distinct from editor selection. |
| `controlSurface`          | `#262833` / `#f6f7f8`                            | Default solid secondary button, segmented-control item, and keycap face.                      |
| `controlSurfaceHover`     | `#32343e` / `#e7e9ed`                            | Hover fill for `controlSurface`; dark mode rises to the Core gray anchor.                     |
| `controlTrack`            | `#262833` / `#d9dce2`                            | Switch track and segmented-control substrate; matches secondary buttons in dark mode.         |

### Actions and status

| Token(s)                                                                | Dark / light                                                         | Purpose and allowed use                                                                |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `actionPrimary`, `actionPrimaryHover`                                   | `#b81447`, `#cf1750` / `#8a0f35`, `#b81447`                          | Primary-button rest and hover fills. Both states retain porcelain-text contrast.       |
| `statusDanger`, `statusDangerStrong`                                    | `#ff6b73`, `#fa4d56` / `#bd2838`, `#a81f2e`                          | Error content and destructive emphasis; strong is for higher-priority glyphs/actions.  |
| `statusDangerMuted`                                                     | `rgba(220,40,40,.72)` / `rgba(189,40,56,.72)`                        | Muted destructive decoration and legacy login error framing.                           |
| `statusDangerSurface`, `statusDangerSurfaceHover`, `statusDangerBorder` | red at `.30`, `.40`, `.24` / red at `.12`, `.18`, `.28`              | Destructive button/alert fill, its hover, and its border.                              |
| `statusSuccess`, `statusSuccessStrong`                                  | `#66bb6a`, `#188a5d` / `#067047`, `#05603e`                          | Success text/icons and stronger green actions.                                         |
| `statusSuccessSurface`, `statusSuccessBorder`                           | green at `.12`, `.24` / green at `.10`, `.28`                        | Success banner/pill fill and boundary.                                                 |
| `statusWarning`, `statusWarningSurface`, `statusWarningSurfaceHover`    | `#ffd54f`, yellow at `.10`, `.16` / `#8a570f`, amber at `.14`, `.20` | Warning content, low-emphasis warning fill, and its interactive hover state.           |
| `statusAttention`                                                       | `#e3ce78` / `#745c00`                                                | Pending or attention-needed state that is neither an error nor a warning action.       |
| `statusInfo`, `statusInfoSurface`                                       | `#81d3f9`, sky at `.10` / `#176f87`, teal at `.10`                   | Informational content and banners.                                                     |
| `statusFeature`                                                         | `#a99de8` / `#6553aa`                                                | Feature/AI distinction when brand pink or status colors would imply the wrong meaning. |
| `statusAssistant`, `statusAssistantStrong`                              | `#d14671`, `#892c6c` in both themes                                  | Fixed assistant progress gradient and completion checks across theme changes.          |

### Shadows and glass

| Token(s)        | Dark / light               | Purpose and allowed use                                                           |
| --------------- | -------------------------- | --------------------------------------------------------------------------------- |
| `shadowSubtle`  | black `.08` / ink `.06`    | Small local lift, including quiet toolbar separation.                             |
| `shadowSoft`    | black `.16` / ink `.11`    | Cards and hover lift.                                                             |
| `shadowMedium`  | black `.28` / ink `.18`    | Dropdowns and small popovers.                                                     |
| `shadowStrong`  | black `.42` / ink `.27`    | Large popovers and dialogs.                                                       |
| `shadowOverlay` | black `.58` / ink `.38`    | Strongest depth cue for dialogs, banners, legacy overlays, and pinned-grid edges. |
| `glassSurface`  | white `.075` / white `.58` | Moving liquid-glass selection lens.                                               |
| `glassBorder`   | white `.14` / ink `.14`    | Main glass lens edge.                                                             |
| `glassEdge`     | white `.22` / ink `.22`    | Refractive/highlight edge; use sparingly inside the glass implementation.         |

### Brand gradients

The gradients are reserved for QuestDB identity and AI affordances. Ordinary
buttons and surfaces use solid semantic roles. The AI sparkle has an independent
semantic gradient so general QuestDB identity tuning cannot recolor it. The
QuestDB logo mark retains its supplied SVG gradients, while its wordmark inherits
the surrounding semantic content color so it remains readable in both themes.

| Token(s)                                 | Dark / light                                  | Purpose                                                              |
| ---------------------------------------- | --------------------------------------------- | -------------------------------------------------------------------- |
| `brandGradientStart`, `brandGradientEnd` | `#e51a59` → `#8a0f35` / `#b81447` → `#5c0a24` | QuestDB identity gradient for theme-aware product affordances.       |
| `aiGradientStart`, `aiGradientEnd`       | `#d14671` → `#892c6c` / `#a92352` → `#76184c` | Established AI sparkle gradient, isolated from logo palette changes. |

## Specialized palettes

These roles are still semantic, but they belong to a renderer or an isolated
experience. General UI components must not consume them.

### Result grid

The grid needs a dedicated dense-data ladder. In dark mode the empty grid field
is darkest, rows are darker, and headers are dark. In light mode the field is
lightest, rows are lighter, and headers are the strongest gray. That preserves
structure without card borders around every cell.

| Token           | Dark / light          | Purpose                                                    |
| --------------- | --------------------- | ---------------------------------------------------------- |
| `surfaceInset`  | `#121317` / `#eceef1` | Empty grid field and viewport.                             |
| `gridRow`       | `#17181d` / `#e9ebef` | Standard data row.                                         |
| `gridHeader`    | `#202126` / `#dce0e6` | Column header background.                                  |
| `contentObject` | `#81d3f9` / `#b81447` | Column-name identity; sky in dark, brand crimson in light. |
| `gridSelection` | `#2b1d25` / `#e0afbf` | Selected cell/row accent.                                  |
| `gridFocus`     | `#b81447` / `#8a0f35` | Focus boundary and outward copy pulse for the active cell. |

### Monaco editor

Monaco is themed through its API, not through application CSS. Its 18
editor-specific roles remain isolated; ordinary surface, content, interaction,
and status roles are reused where they carry the same meaning.

| Token(s)                                                        | Dark / light                                                          | Purpose                                                                                       |
| --------------------------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `editorCanvas`, `surfaceOverlay`, `editorBorder`                | `#17181d`, `#1d1e24`, `#121317` / `#d9dce2`, `#f2f3f5`, `#c9cdd4`     | Editor field, widgets/menus, and editor-specific edge.                                        |
| `contentPrimary`                                                | `#f8f8f2` / `#1c2029`                                                 | Default code text.                                                                            |
| `interactionHover`, `interactionNeutral`, `controlSurfaceHover` | white `.055`, `#32343e`, `#32343e` / ink `.075`, `#d9dce2`, `#e7e9ed` | Menu selection, separators, and list-filter states.                                           |
| `editorSelection`, `editorSelectionAccent`                      | `#44475a`, `#44475a` / `#aec8ec`, `#7a99c4`                           | Monaco and native form-control selection, plus its stronger selection boundary.               |
| `editorActiveLine`, `editorActiveLineBorder`                    | white `.03`, transparent / ink `.035`, transparent                    | Active-line wash and border. The transparent border prevents layout/color artifacts.          |
| `editorSuggestionMatchActive`                                   | `#ff9abb` / `#8a0f35`                                                 | Active autocomplete match.                                                                    |
| `editorRun`, `statusDanger`                                     | `#ffffff`, `#ff6b73` / `#067047`, `#bd2838`                           | Monaco run glyph and error decoration. The run glyph intentionally changes contrast by theme. |
| `contentMuted`                                                  | `#858995` / `#565f6e`                                                 | Comments.                                                                                     |
| `editorSyntaxString`                                            | `#f1fa8c` / `#695f00`                                                 | Strings.                                                                                      |
| `editorSyntaxNumber`                                            | `#50fa7b` / `#056c45`                                                 | Numbers.                                                                                      |
| `editorSyntaxKeyword`                                           | `#ff79c6` / `#b81447`                                                 | SQL keywords.                                                                                 |
| `editorSyntaxType`                                              | `#8be9fd` / `#0a6a80`                                                 | Types and type-like identifiers.                                                              |
| `editorSyntaxConstant`                                          | `#bd93f9` / `#6553aa`                                                 | Constants.                                                                                    |
| `editorSyntaxVariable`                                          | `#ffb86c` / `#8e500a`                                                 | Variables.                                                                                    |
| `editorErrorHighlight`, `editorSuccessHighlight`                | red/green `.15` / red/green `.13`                                     | Full-line execution feedback.                                                                 |
| `editorSearchHighlight`, `editorAiHighlight`                    | orange/yellow `.50` / amber `.32`/`.28`                               | Search and AI-generated-range highlights.                                                     |

### Data visualization

Series keep the same conceptual hue identity across themes; the light theme uses
darker lightness values to maintain contrast against a light plot while the dark
theme uses lighter values against a dark plot. The slot is the data
identity—components must not pick a series by color name.

| Token                          | Dark / light                                | Purpose                                                                 |
| ------------------------------ | ------------------------------------------- | ----------------------------------------------------------------------- |
| `dataGrid`                     | gray `.11` / ink `.16`                      | Chart axes and grid lines.                                              |
| `dataArea`                     | white `.012` / ink `.018`                   | Quiet plot-area separation.                                             |
| `dataSeries1`                  | `#ff6b6b` / `#d51515`                       | Metric widget series slot 1, red. `dataSeries*` are user-pickable metric colors; auto-assigned chart series use `chartSeries*`. |
| `dataSeries2`                  | `#4ecdc4` / `#0c7966`                       | Series slot 2, teal.                                                    |
| `dataSeries3`                  | `#ffd93d` / `#80690d`                       | Series slot 3, yellow/olive.                                            |
| `dataSeries4`                  | `#95d86e` / `#357b0c`                       | Series slot 4, green.                                                   |
| `dataSeries5`                  | `#ff8f40` / `#ac5111`                       | Series slot 5, orange.                                                  |
| `dataSeries6`                  | `#bd93f9` / `#6415d5`                       | Series slot 6, violet.                                                  |
| `dataSeries7`                  | `#50fa7b` / `#0c7b37`                       | Series slot 7, bright green.                                            |
| `dataSeries8`                  | `#ff79c6` / `#cc147e`                       | Series slot 8, magenta.                                                 |
| `dataSeries9`                  | `#8be9fd` / `#1072a5`                       | Series slot 9, cyan/blue.                                               |
| `dataSeries10`                 | `#f1fa8c` / `#61740b`                       | Series slot 10, yellow/olive.                                           |
| `chartSeries1..8`              | `#8be9fd #d14671 #ffb86c #bd93f9 #f1fa8c #ff79c6 #50fa7b #ff5555` / `#1590aa #e42560 #c16f18 #7425e4 #728d11 #e425ac #139842 #e42525` | Auto-assigned series order for notebook/result charts and quick-vis. Calm brand hues lead; assignment is positional, not user-picked. |
| `dataPositive`, `dataNegative` | `#2ca875`, `#d94d58` / `#05603e`, `#a81f2e` | Directional financial/operational data, not generic form success/error. |

### Authentication

Authentication is a visually isolated first impression and keeps a deliberate
dark-crimson identity. These roles belong to login/version UI. `authBackdrop` is
also used for the dark tool and code blocks inside AI chat messages.

| Token                           | Dark / light                                   | Purpose                                                   |
| ------------------------------- | ---------------------------------------------- | --------------------------------------------------------- |
| `authBackdrop`                  | `#1d070e` / `#c7cbd2`                          | Login page field and AI chat tool/code-block background.  |
| `authAccent`, `authAccentMuted` | `#9089fc`, violet `.64` / `#7d2948`, ink `.46` | Login illustration/action accent and its muted companion. |
| `surfaceCanvas`, `authBorder`   | `#141725`, `#353946` / `#d9dce2`, `#a8b0bd`    | Login form card and prominent edge.                       |
| `authVersionContent`            | `#f5f3f0` / `#e7e3e5`                          | Version badge readable content.                           |

### Onboarding

The notebook and MCP onboarding experience follows the active luminance mode.
Dark mode retains the original terminal presentation; light mode reuses values
from the shared light surface, content, feature, and information roles. Modal
borders, subtle fills, and shadows use the general semantic tokens directly.

| Token               | Dark / light                            | Purpose                                |
| ------------------- | --------------------------------------- | -------------------------------------- |
| `onboardingSurface` | `#050505` / `surfaceBase` equivalent    | Experience backdrop.                   |
| `onboardingDivider` | white `.04` / `borderSubtle` equivalent | Quiet internal rule.                   |
| `onboardingClose`   | `#858585` / `contentMuted` equivalent   | Close/secondary content.               |
| `onboardingCommand` | `#111111` / `surfaceValue` equivalent   | Command and transcript frame surfaces. |
| `onboardingInput`   | `#202020` / `surfaceInset` equivalent   | Simulated input.                       |
| `onboardingPrompt`  | `#93adff` / `statusFeature` equivalent  | Prompt identity.                       |
| `onboardingAccent`  | `#29c6be` / `statusInfo` equivalent     | Agent/progress accent.                 |

### Fixed-purpose colors

These values encode external or user-selected identity, so replacing them with
generic status roles would change meaning.

| Token(s)                                                             | Value                                              | Purpose                                                                                                                     |
| -------------------------------------------------------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `instancePreset1`, `instancePreset2`, `instancePreset3`              | `rgb(199,7,45)`, `rgb(0,170,59)`, `rgb(0,122,255)` | Stable user-selectable instance identities.                                                                                 |
| `windowControlClose`, `windowControlMinimize`, `windowControlExpand` | `#ff5f57`, `#febc2e`, `#28c840`                    | Familiar macOS-style window controls in illustrative UI.                                                                    |
| `pickerHue0` … `pickerHue5`                                          | red, yellow, green, cyan, blue, magenta endpoints  | Mechanical hue stops for the color picker. Indexed names are intentional because the token is a position, not a UI meaning. |

## Choosing a surface

| Relationship                        | Recommended combination                                              |
| ----------------------------------- | -------------------------------------------------------------------- |
| Application shell → work area       | `surfaceCanvas` → `surfaceStage`                                     |
| Chrome/sidebar → panel content      | `surfaceBase` → `surfaceRaised` or `surfaceInset`                    |
| Stage → notebook/metric card        | `surfaceStage` → `surfaceRaised`                                     |
| Card header → embedded editor/chart | `surfaceRaised` → `surfaceInset` or the renderer-specific canvas     |
| Page → input                        | parent surface → `surfaceInput` + `borderDefault`                    |
| Page → menu/dropdown                | parent surface → `surfaceOverlay` + `borderDefault` + `shadowMedium` |
| Dialog → read-only value            | dialog surface → `surfaceValue`                                      |
| Result-grid viewport → row → header | `surfaceInset` → `gridRow` → `gridHeader`                            |

Do not choose a token by comparing its hex value to a mockup. Choose the role
from this table, then tune the role in both themes if the relationship is wrong
everywhere it appears.

## Runtime architecture

- Styled components read `theme.color` directly. The `color()` helper resolves
  the same typed object.
- Non-React renderers use `getThemeColor()` from `src/theme/runtime.ts`; the
  active object is synchronized by `ThemeModeProvider`.
- Legacy SCSS uses `theme-color(name)`. Sass emits `var(--qdb-color-name)`, and
  `ThemeCssVariables` declares every property from this same palette. This lets
  the compiled `main.scss` bundle follow a runtime theme change through one
  generated declaration block.
- SVG templates use semantic placeholders that are resolved before rendering.
- Monaco receives a complete theme through its public theming API. Any custom
  properties inside Monaco itself are third-party implementation details, not
  QuestDB palette inputs.
- `withAlpha()` derives one-off translucent renderer colors from a semantic
  role. It handles hex and RGB inputs and avoids a separate token for every
  renderer-specific opacity.

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

## Contribution rules

1. Never add a literal UI color outside `src/theme/index.ts`. Immutable supplied
   brand artwork such as `QuestDBLogo` is the sole exception and must not be
   recolored through theme roles.
2. Never add a first-party CSS custom property for theming.
3. Use a semantic role, not a hue name and not a component name.
4. Keep every runtime token directly under `theme.color`; organize source groups
   with comments. A genuinely theme-invariant role belongs in `invariantColors`,
   which is spread independently into both flat palettes.
5. Add a token only when an existing role would communicate the wrong meaning or
   when a renderer needs stable independent control.
6. Define the dark and light value together and inspect their neighboring
   surfaces in both modes.
7. Preserve state ordering: rest, hover, active/selected, focus, disabled.
8. Prefer `withAlpha()` for a renderer-specific wash. Promote it to a token only
   when the same opacity has a shared semantic meaning across components.
9. Run `yarn lint:colors` and `yarn typecheck` after changes.

Before approving a new color token, answer all four questions:

- What meaning does it carry?
- Which existing token is closest, and why is reusing it incorrect?
- Which surfaces or components may consume it?
- What is its corresponding dark/light behavior?

If those answers are not clear, the color is probably a local styling tweak, not
a design-system token.
