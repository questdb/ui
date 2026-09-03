# Theme steering log

Designer-owned trail of palette experiments. `THEMING.md` stays the contract
until Emre reviews an entry and folds it in.

Two lifts only:

| Lift | What it is | Where it lands | Emre’s job |
| --- | --- | --- | --- |
| **Palette** | Retune an existing role in one or both themes | `src/theme/index.ts` only | Check neighbors in both modes, then update `THEMING.md` values |
| **Binding** | This component is using the wrong role, or needs a new role | Component file + maybe a new token in `index.ts` | Confirm the meaning, rebind, add the token only if reuse would lie |

Palette is the default. Binding is the exception — including “brand crimson is
doing a job it should not.” Do not invent a component-named color
(`notebookCellBackground`). Either retune `surfaceRaised`, rebind the component
to a different existing role, or add a role whose *meaning* is new.

Status: `applied locally` → `ready for Emre` → `accepted` / `tweaked` / `reverted`.

---

## Entry template

Copy this block. One decision per entry. If a palette change and a binding
change shipped together, split them.

```
### YYYY-MM-DD — short name
- Lift: palette | binding | palette + binding
- Status: applied locally
- Modes: light / dark / both
- Tokens: `tokenName`
- Before → after: `#old` → `#new` (light), … (dark)
- Binding: `Component` used `oldRole`, should use `newRole`
- Neighbors: stage / raised / inset / …
- Walked: notebook, SQL editor, details drawer, grid
- Why:
- Out of scope:
- For Emre:
```

---

## Log

### 2026-09-01 — Light surfaces: lift baseline, compress elevation ramp
- Lift: palette
- Status: applied locally
- Modes: light
- Tokens: `surfaceCanvas`, `surfaceStage`, `surfaceBase`, `surfaceInset`, `surfaceRaised`, `surfaceInput`, `surfaceOverlay`, `surfaceValue`, `surfaceScrim`, `surfaceTabRail`
- Before → after (light):
  - `surfaceStage` `#c9cdd4` → `#e2e5ea`
  - `surfaceCanvas` `#d9dce2` → `#e8eaee`
  - `surfaceBase` `#e3e5e9` → `#eef0f3`
  - `surfaceRaised` `#e8eaee` → `#f4f5f7`
  - `surfaceInset` `#eceef1` → `#f7f8f9`
  - `surfaceInput` / `surfaceOverlay` `#f2f3f5` → `#fafbfc`
  - `surfaceValue` `#fbfcfd` → `#ffffff`
  - `surfaceScrim` ink `.38` → `.32`
  - `surfaceTabRail` `(218,221,227,.94)` → `(232,234,238,.94)`
- Neighbors: stage still recedes from canvas; raised still sits above stage; inset stays the bright well. Stage→raised gap ~31 RGB points → ~18.
- Walked: notebook cells, SQL canvas, details drawer. Grids/charts were already working — `gridRow` / `gridHeader` / `chartSeries*` not touched.
- Why: Light mode felt washed. Baseline too gray; elevation ramp between field and cards too large, so SQL, notebook, and details went muddy while grids still read.
- Out of scope: dark mode; content/accent; interaction fills (`interactionNeutral` still `#d9dce2`).
- For Emre: Confirm the compressed light ladder still matches the spatial story in `THEMING.md` (darker stage, brighter embedded content). Update the Core palette table if accepted.

### 2026-09-01 — Light SQL canvas follows the new baseline
- Lift: palette
- Status: applied locally
- Modes: light
- Tokens: `editorCanvas`, `editorBorder`
- Before → after (light): `editorCanvas` `#d9dce2` → `#eef0f3`; `editorBorder` `#c9cdd4` → `#e2e5ea`
- Neighbors: `editorCanvas` now matches `surfaceBase`; sits as a quiet well inside `surfaceRaised` cells.
- Why: The SQL editor does not read `surface*`. Leaving `editorCanvas` at the old gray would have stranded the named problem area inside the new cards.
- Out of scope: syntax colors, selection, active line.
- For Emre: This is still a palette steer, not a rebinding. Flag if editor should instead reuse `surfaceInset` / `surfaceBase` and drop the dedicated tokens.

### 2026-09-01 — Light shadows quieter
- Lift: palette
- Status: applied locally
- Modes: light
- Tokens: `shadowSubtle`, `shadowSoft`, `shadowMedium`, `shadowStrong`, `shadowOverlay`
- Before → after (light): `.06/.11/.18/.27/.38` → `.035/.055/.08/.16/.22`
- Why: Card and overlay shadows were doing too much of the elevation job once surfaces got closer together. One primary cue (surface step), not surface + heavy shade.
- Out of scope: dark shadows; glass tokens; shadow *geometry* (see next entry).
- For Emre: Dialogs/menus use `shadowStrong` / `shadowOverlay` — check they still float after the opacity cut.

### 2026-09-01 — Notebook cell and details drawer shadow geometry
- Lift: binding (geometry, same tokens)
- Status: applied locally
- Modes: both (geometry is shared; light opacity change is what you feel first)
- Binding:
  - `CellWrapper` hover `0 16px 44px shadowSoft` → `0 1px 2px shadowSubtle, 0 3px 8px shadowSoft`
  - `CellWrapper` focus extra `0 18px 50px shadowMedium` → `0 1px 2px shadowSubtle, 0 4px 10px shadowSoft` (accent ring unchanged)
  - `Drawer` `-18px 0 52px shadowSoft` → `-4px 0 16px shadowSoft`
- Why: Token opacity alone cannot tuck a 50px blur. Notebook cells and the details drawer were the named surfaces.
- Out of scope: dropdown/modal stacks in `overlayStyles.ts` (`0 1.2rem 1.6rem`, `0 2.4rem 7.2rem`). Call out if those should follow.
- For Emre: Higher lift than the opacity cut. Resting cells still have no shadow (border only); hover/focus are the ones tucked. Dark mode inherits the tighter geometry — glance at a focused cell in dark.

### 2026-09-01 — Light result grid follows the dense-data ladder
- Lift: palette
- Status: applied locally
- Modes: light
- Tokens: `gridRow`, `gridHeader`
- Before → after (light): `gridRow` `#e9ebef` → `#f4f5f7`; `gridHeader` `#dce0e6` → `#e7eaee`
- Neighbors (light, per `THEMING.md`): field `surfaceInset` `#f7f8f9` lightest → rows `#f4f5f7` → headers `#e7eaee` strongest gray. Same deltas as the pre-lift ladder (`#eceef1` / `#e9ebef` / `#dce0e6`), shifted with the new inset. `gridRow` now matches `surfaceRaised`, so a notebook cell’s body and its grid rows are one surface; the header bar is the structure cue. `gridSelection` / `gridFocus` / `contentObject` unchanged.
- Walked: standalone result grid, notebook inline grids.
- Why: The surface lift moved `surfaceInset` (empty field / viewport) and left `gridRow` / `gridHeader` on the old gray. The THEMING order was intact but the steps were the old muddy slab inside the new baseline.
- Out of scope: dark grid; zebra (the renderer does not stripe; hover uses `surfaceInset`); column-name crimson (`contentObject` — parking lot / binding).
- For Emre: Update the Result grid table in `THEMING.md` if accepted. Confirm header still reads as the strongest gray on a full-width grid and inside a raised cell. Selection `#e0afbf` was not retuned — glance at a selected row on the new `gridRow`.

### 2026-09-01 — Light segmented chips sit on the new baseline
- Lift: palette
- Status: applied locally
- Modes: light
- Tokens: `controlTrack`, `interactionNeutral`, `interactionNeutralHover`
- Before → after (light):
  - `controlTrack` / `interactionNeutral` `#d9dce2` → `#e8eaee` (same hex as new `surfaceCanvas`)
  - `interactionNeutralHover` `#d2d6dd` → `#e2e5ea` (same hex as new `surfaceStage`)
- Neighbors: Table/Chart chips use `controlTrack` as the segmented substrate on `surfaceRaised` `#f4f5f7`. Old track was the pre-lift canvas, so the chip block jumped ~20 RGB points off the header. New track is a one-step inset. Selected segment is still the glass lens (`glassSurface`), not these fills. `borderStrong` on the track is unchanged.
- Walked: notebook cell Table/Chart chips. List/Grid uses the same `NotebookViewToggle` track.
- Why: Leftover `#d9dce2` after the surface lift. The chip group read as a dark elevated slab.
- Out of scope: `borderStrong` on the segmented control; glass lens opacity; dark mode.
- For Emre: `THEMING.md` already maps `controlTrack` to segmented substrate and switch tracks — update the light hexes. Switches and other segmented controls share this token; check a switch at rest.

### 2026-09-01 — Chrome hairline stagger: rails vs panel/work
- Lift: binding
- Status: applied locally
- Modes: both
- Tokens: `borderDefault`, `borderSubtle` (values unchanged)
- Binding: icon rails (`Sidebar` left/right, `TopBar`) used `borderSubtle`; now `borderDefault`. Panel-to-work edges stay `borderSubtle` (`Console` left `Wrapper`, `SidePanelRight`, `Drawer`, allotment sash).
- Neighbors: `borderSubtle` is internal only — inside a panel or inside the working surface. Chrome rails sit one step stronger so the stagger reads.
- Walked: left rail | schema | editor; editor | details/AI | right rail; top bar under the logo/menu.
- Why: All chrome hairlines were the same weight, so rails and content panels sat on one plane.
- Out of scope: footer `border-top`; allotment sash hover (`contentAccent`); token values themselves.
- For Emre: Keep the stagger in the chrome composition notes. Do not bump panel-to-work to `borderDefault` — that would collapse the two weights.

### 2026-09-01 — Content sidebars: both elevated
- Lift: binding
- Status: applied locally
- Modes: both
- Tokens: `surfaceRaised` (values unchanged)
- Binding: schema (`Schema` / `SearchPanel` wrappers + `PaneContent` + `Console` left `Wrapper`), details (`Drawer` shell + `ContentWrapper`, `SidePanelRight`), AI (`AIChatWindow` shells, lazy loader, error boundary, history), mobile schema (`SideMenu`) used `surfaceBase`; now `surfaceRaised`. Icon rails stay `surfaceBase`.
- Neighbors: light `surfaceBase` `#eef0f3` → panels `#f4f5f7` (`surfaceRaised`). Dark `surfaceBase` `#17181d` → panels `#1d1e24`. Work surface stays `surfaceStage` / editor canvas. `PaneWrapper` / `PaneContent` globally are still `surfaceBase` so Editor / Result / Import are untouched.
- Walked: tables tree vs notebook; details drawer vs notebook; AI chat vs notebook. Light and dark. First pass left the tree on `surfaceBase` because `PaneContent` paints that fill over the wrapper — override both, with `&&` so the shared primitives cannot win on equal specificity.
- Why: Dark treated details/AI as a lift and tables as mute. Light had almost no step from canvas to either sidebar. Same role on both sides, both modes.
- Out of scope: `Panel.Header` (already `surfaceRaised` — title bar now matches the panel body); filter input (`surfaceInput`); result/editor panes; palette retune of `surfaceRaised`; drawer drop shadow (still `shadowSoft` on the right only).
- For Emre: Left and right content panels share `surfaceRaised`. Rails stay `surfaceBase`. Schema/Search must override `PaneContent` as well as `PaneWrapper`. Drawer header no longer steps above the body — the step is panel vs work, not title vs body.

### 2026-09-01 — Light chrome shadows: tighter geometry
- Lift: binding (geometry, same tokens)
- Status: applied locally
- Modes: light, except tab-rail hairline is both
- Tokens: `shadowSubtle`, `shadowSoft`, `shadowMedium`, `borderSubtle` (values unchanged)
- Binding:
  - Table/Chart (and List/Grid) glass lens `0 3px 9px shadowSoft` → `0 1px 1px shadowSubtle, 0 1px 3px shadowSoft` in light. Dark kept. Hover-preview on Run/Draw matches.
  - Notebook title bar `0 12px 24px shadowSoft` → `0 1px 2px shadowSubtle, 0 2px 6px shadowSoft` in light. Existing `borderSubtle` hairline kept. Dark kept.
  - Tab rail under-shadow `0 8px 20px shadowSoft` → same tight pair as the notebook title in light. Dark kept.
  - Tab rail hairline: `border-bottom: 0` → `borderSubtle` in both modes, sitting with the shadow.
  - Tab overflow fades: 10px `shadowMedium` → transparent → 6px with the stop at 65%, light only.
- Neighbors: same two-stop recipe as cell hover (`shadowSubtle` contact + `shadowSoft` lift), just smaller because these sit on chrome not on the stage.
- Walked: Table/Chart chip, notebook heading, tab rail with enough tabs to overflow.
- Why: Light opacity was already cut; 20–24px blurs still read as haze. Cloudflare-style lift is a 1–2px offset and a short blur.
- Out of scope: dark geometry (except the new tab hairline); active-tab glass (`0 6px 18px` still); Metrics heading; cell hover (already tucked); drawer; token opacities.
- For Emre: Geometry only. Do not retune `shadowSoft`. Overflow uses `html[data-theme="light"]` because those fades live in SCSS.

### 2026-09-01 — Chat history hover follows the raised panel
- Lift: binding
- Status: applied locally
- Modes: both
- Tokens: `surfaceBase` (light), `surfaceInput` (dark) — values unchanged
- Binding: `ChatHistoryItem` hover used `surfaceRaised`, which is now the panel fill. Hover inverts against the panel: one step darker in light (`surfaceBase` `#eef0f3`), one step lighter in dark (`surfaceInput` `#21222c`).
- Neighbors: panel `surfaceRaised` (`#f4f5f7` / `#1d1e24`). `surfaceInput` lightens both modes, so it is wrong in light. `surfaceOverlay` equals `surfaceRaised` in dark. `interactionHover` would invert, but as a wash rather than a surface step.
- Walked: AI chat history, light and dark.
- Why: Elevating the AI panel to `surfaceRaised` left hover on the same token. First rebind to `surfaceInput` everywhere; Zack caught that light hover should recede, not lift.
- Out of scope: rest/current row fill (still transparent); date separators; palette retune of `surfaceOverlay` in dark.
- For Emre: Hover on a raised list is not `surfaceRaised`. Light uses `surfaceBase`, dark uses `surfaceInput`. A single inverting overlay (`interactionHover`) would avoid the mode split if that role is the intended meaning.

### 2026-09-01 — Tooltip border matches floating menus
- Lift: binding
- Status: applied locally
- Modes: both
- Tokens: `borderDefault` (values unchanged)
- Binding: `Tooltip` box and arrow stroke used `contentDisabled` (a type color, reads as heavy as `borderStrong` or heavier). Rebind to `borderDefault`, same as `floatingSurfaceStyles` / dropdown menus.
- Neighbors: `borderSubtle` → `borderDefault` → `borderStrong`. Menus sit on `borderDefault`. Tooltip should not sit above them.
- Walked: editor toolbar tooltips, notebook heading actions, both modes.
- Why: After the surface lift the `contentDisabled` stroke was a hard outline on a quiet panel.
- Out of scope: tooltip fill (`surfaceInset`); dropdown/popover borders (already `borderDefault`); `contentDisabled` as type.
- For Emre: Tooltip chrome is a floating surface. Its edge is `borderDefault`, not a content token.

### 2026-09-01 — Inline AI action cards invert in light
- Lift: binding
- Status: applied locally
- Modes: light (dark kept)
- Tokens: `surfaceValue` (light), `authBackdrop` (dark)
- Binding: `UserRequestBox` (Explain / Fix / Schema / Ask cards) used `authBackdrop` in both modes. That token is the login field: dark `#1d070e` recedes, light `#c7cbd2` is a muddy slab darker than the raised chat panel. Light now uses `surfaceValue` `#ffffff`. Dark stays on `authBackdrop`.
- Neighbors: chat panel `surfaceRaised` `#f4f5f7`. Nested SQL uses `editorCanvas` `#eef0f3`, so the query block recedes slightly inside the white card. Login `authBackdrop` is untouched.
- Walked: Explain Query card in the AI panel, light mode. Dark glance to confirm the crimson well remains.
- Why: Darker-on-dark should invert to lighter-on-light. `authBackdrop` cannot do that job in both themes.
- Out of scope: plain user `MessageBubble` (still `authBackdrop`); login page; palette retune of `authBackdrop`; inner LiteEditor.
- For Emre: AI action cards are not login chrome. Light fill is `surfaceValue`. Consider whether `MessageBubble` should follow.

### 2026-09-01 — Cell icon hover is one step darker in light
- Lift: binding
- Status: applied locally
- Modes: light (dark kept)
- Tokens: `surfaceBase`, `interactionNeutralHover` (values unchanged)
- Binding: Ghost `IconButton` hover is `surfaceRaised`, which is the cell fill, so Maximize / More vanish. Light hover on those is now `surfaceBase` (`#eef0f3` on `#f4f5f7`). Split / reset inside the Table/Chart track sit on `controlTrack`; light hover is `interactionNeutralHover` (`#e2e5ea` on `#e8eaee`). Dark still uses `surfaceRaised`.
- Neighbors: do not retune global ghost hover — on `surfaceBase` chrome (rails, notebook title) `surfaceRaised` is the correct lift.
- Walked: focused cell Maximize and More, Table/Chart split icon, light mode.
- Why: Same-token hover on a raised cell. Dark already reads; light needed one receding step.
- Out of scope: global ghost; Table/Chart unselected `interactionHover`; markdown Edit/Apply; token opacities.
- For Emre: Ghost hover cannot be one fill everywhere. On raised cells it must recede (`surfaceBase`); on base chrome it must lift (`surfaceRaised`).

### 2026-09-01 — Neutralise brand on fields, lists, and grid hover
- Lift: binding
- Status: applied locally
- Modes: both
- Tokens: `borderStrong`, `borderDefault`, `interactionHover`, `interactionNeutral` (values unchanged)
- Binding:
  - Default `Input` / `TextArea` focus: `contentAccent` → `borderStrong`. Accent is opt-in via `$tone="accent"` (AI chat composer, chat history search, login).
  - Assistant Settings provider tab underline: `contentAccent` → `borderStrong`. Fields inherit the new default.
  - `TableSelector` trigger and items: `borderAccent` / `interactionAccent*` → `borderDefault` / `interactionHover` / `interactionNeutral`.
  - Schema tree row hover/focus and context-menu lock: `interactionAccent*` / `borderAccent` → `interactionHover` / `interactionNeutral` / `borderDefault`. Details `i` → `contentSecondary`.
  - Result grid row hover wash: `interactionAccentHover` → `interactionHover`. Frozen-handle hover bar: `contentAccent` → `borderStrong`.
- Neighbors: rail `Navigation` stays `contentAccent` (tool selection). Table/column glyphs still `contentAccent`. `SelectMenu` check and open border stay accent (AI model dropdown). Grid *selection* `gridSelection` and column-resize ghost stay branded. Copy-pulse on schema rows stays accent.
- Walked: Filter... in tables, table picker, tree hover, result-grid hover, Assistant Settings provider + API key, AI composer (still crimson), login (still crimson).
- Why: Accent was doing hover, focus, and selection jobs that are not high-level brand actions.
- Out of scope: `contentObject` column names; tree type icons; rail icons; `SelectMenu`; `TabButton` globally (Monitoring/Details still accent); `gridSelection`; checkboxes/switches.
- For Emre: Default field focus is `borderStrong`. Accent is `$tone="accent"`. Do not retune `contentAccent` to fix these. **Superseded in part:** provider-tab underline reverted the same day (tabs stay branded); grid selection/resize and column names handled in the following two entries.

### 2026-09-01 — Grid selection and cell-focus ring go slate
- Lift: palette
- Status: applied locally
- Modes: both
- Tokens: `gridSelection`, `gridFocus`
- Before → after:
  - light `gridSelection` `#e0afbf` → `#d8dce3`; `gridFocus` `#8a0f35` → `#828b99` (same as light `borderStrong`)
  - dark `gridSelection` `#2b1d25` → `#252830`; `gridFocus` `#b81447` → `#6b7382` (stronger than dark `borderStrong` `#3d414d` so the 1px inset still reads on the selected cell)
- Neighbors: light `gridRow` `#f4f5f7`, `gridHeader` `#e7eaee`. Dark `gridRow` `#17181d`, `gridHeader` `#202126`. Selection must stay stronger than the `interactionHover` overlay.
- Walked: result-grid row selection, focused cell ring, copy-pulse (now slate). Query-picker first-visit pulse rebound off `gridFocus` so it stays branded.
- Why: Selection wash and cell ring were still pink after hover went neutral.
- Out of scope: `editorSelection`; notebook cell focus (`CellWrapper`); checkboxes/switches.
- For Emre: `gridFocus` is the grid's keyboard/copy ring, not brand. Light matches `borderStrong`. Dark is a step lighter than `borderStrong` on purpose.

### 2026-09-01 — Search, keyboard focus, column names, resize
- Lift: binding
- Status: applied locally
- Modes: both
- Tokens: `borderStrong`, `borderDefault`, `interactionHover`, `interactionNeutral`, `contentPrimary`, `contentSecondary` (values unchanged)
- Binding:
  - Editor Search results: hover `interactionHover`; focused row `interactionNeutral` + `borderDefault` (same as schema tree). File icons `contentSecondary`. Case/word/regex toggles `$activeTone="neutral"` + `borderDefault`.
  - Global keyboard focus outlines: `contentAccent` → `borderStrong` (`*:focus-visible`, `Button`, ghost buttons, chrome-tab outline, DocSearch button, warning link, instance-settings slider, chat-history item, assistant-modes compact, segmented-control inset ring). Tab *rename* field and other leftover field-focus borders follow (`_editor`, slim-select, quick-vis). Split sash hover fill → `borderStrong` (same job as column resize).
  - Result-grid column names: `contentObject` → `contentPrimary` (`HeaderName` and legacy `.qg-header-name`).
  - Column-resize ghost: `contentAccent` → `borderStrong` (matches frozen-handle hover bar).
  - Revert: Assistant Settings provider tab underline back to `TabButton` `contentAccent`.
- Neighbors: `TabButton` underline stays `contentAccent`. Notebook cell focus (`CellWrapper`) and cell-name field stay branded. Notebook title glyph and chrome-tab notebook/metrics favicons stay `contentObject`. Switch/Checkbox outlines stay branded.
- Walked: Search sidebar, result grid headers/selection/resize, tab underlines (Monitoring/Details, AI setup), notebook cell ring, keyboard tab through chrome.
- Why: Second binding pass. Tabs and notebook identity stay brand; search, focus rings, grid type, and resize are chrome.
- Out of scope: checkboxes/switches; rail `Navigation`; schema tree glyphs; `SelectMenu`; AI sparkle/MCP/pairing.
- For Emre: Keyboard focus is `borderStrong`. List hover/focus matches the schema tree. Column names are type (`contentPrimary`), not object glyphs.

### 2026-09-01 — Chat history fields and dropdown open state
- Lift: binding
- Status: applied locally
- Modes: both
- Tokens: `borderStrong` (values unchanged)
- Binding:
  - Chat history search: drop `$tone="accent"` so it inherits default field focus (`borderStrong`). Composer stays `$tone="accent"`.
  - Chat history rename: `actionPrimary` → `borderStrong`.
  - `SelectMenu` open trigger: `borderAccent` → `borderStrong` (chart X-axis, AI model picker, and every other SelectMenu). Checkmark stays `contentAccent`.
- Neighbors: same `borderStrong` as Input focus and keyboard outlines. Login fields still `$tone="accent"`.
- Walked: chat history search + rename, AI model dropdown, chart X-axis dropdown.
- Why: These were still opted into brand after default field focus went neutral.
- Out of scope: SelectMenu check; AI Settings label; sparkle glyphs; composer; login; checkboxes/switches.
- For Emre: Open dropdown chrome is field focus, not brand. Check remains a selected-item glyph.

---

## Parking lot — not logged as decisions yet

Use this for hunches until they become an entry.

- Brand core (`contentAccent`, `actionPrimary`, `contentObject` in light) may be overused. 2026-09-01 neutralized fields, lists, search, keyboard focus, dropdown open state, grid hover/selection/resize, and column names. Still branded: rail icons, tree glyphs, `SelectMenu` check, tab underlines, notebook cell focus + title glyphs, AI composer/login `$tone="accent"`, checkboxes/switches. Treat leftovers as **binding**.
- `interactionNeutral` / `controlTrack` leftover `#d9dce2` — addressed 2026-09-01 (table/chart chips).
- New surface roles: only if two neighbors with *different jobs* are forced to share a token. Propose the meaning first (`surfaceSomething`), then values in both themes.
